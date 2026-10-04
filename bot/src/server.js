import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { feedEntries } from './youtube.js';
export function equalSecret(a, b) {
  const x = Buffer.from(a || ''), y = Buffer.from(b || '');
  return x.length === y.length && timingSafeEqual(x, y);
}
async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 262144) { const e = new Error('Body too large'); e.status = 413; throw e; }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export function server(store, c, youtube, ready = () => true) {
  return createServer(async (req, res) => {
    const reply = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    try {
      const u = new URL(req.url, 'http://localhost');
      if (u.pathname === '/health' && req.method === 'GET') return reply(ready() ? 200 : 503, { ready: ready() });
      if (u.pathname.startsWith('/bridge/')) {
        if (!equalSecret(req.headers.authorization, `Bearer ${c.secret}`)) return reply(401, { error: 'Unauthorized' });
        if (u.pathname === '/bridge/jobs' && req.method === 'GET') { store.set('bridgeSeen', Date.now()); return reply(200, { job: store.lease() }); }
        if (u.pathname === '/bridge/ack' && req.method === 'POST') {
          const body = JSON.parse((await readBody(req)).toString());
          if (typeof body.id !== 'string' || typeof body.lease !== 'string' || typeof body.success !== 'boolean') return reply(400, { error: 'Invalid acknowledgement' });
          if (!store.ack(body.id, body.lease, body.success, body.result || {}, body.error || '')) return reply(409, { error: 'Lease expired' });
          return reply(200, { ok: true });
        }
        return reply(404, { error: 'Not found' });
      }
      if (u.pathname === '/youtube/websub' && req.method === 'GET') {
        const topic = u.searchParams.get('hub.topic') || '';
        const match = /^https:\/\/www\.youtube\.com\/feeds\/videos\.xml\?channel_id=(UC[\w-]{22})$/.exec(topic);
        if (u.searchParams.get('hub.mode') !== 'subscribe' || !match || !store.one('SELECT user_id FROM creators WHERE channel_id=?', match[1])) return reply(403, { error: 'Unknown subscription' });
        const challenge = u.searchParams.get('hub.challenge') || '';
        if (challenge.length > 500) return reply(400, { error: 'Invalid challenge' });
        res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end(challenge);
      }
      if (u.pathname === '/youtube/websub' && req.method === 'POST') {
        const body = await readBody(req);
        const signature = req.headers['x-hub-signature'] || '';
        const expected = `sha1=${createHmac('sha1', c.secret).update(body).digest('hex')}`;
        if (!equalSecret(signature, expected)) return reply(403, { error: 'Bad signature' });
        youtube.ingest(feedEntries(body.toString()), true);
        return reply(200, { ok: true });
      }
      reply(404, { error: 'Not found' });
    } catch (e) { reply(e.status || 400, { error: 'Request could not be processed' }); }
  });
}
