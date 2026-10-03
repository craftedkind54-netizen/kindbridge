import { join } from 'node:path';
import { config, validateConfig } from './config.js';
import { Store } from './store.js';
import { YouTube } from './youtube.js';
import { createDiscord } from './discord.js';
import { server } from './server.js';

const c = config(); validateConfig(c);
const s = new Store(join(c.dataDir,'kind-smp.db'));
const yt = new YouTube(s,c);
const { client, maintenance } = createDiscord(s,c,yt);
const http = server(s,c,yt,()=>client.isReady());
http.requestTimeout = 20000; http.headersTimeout = 10000;
http.listen(c.port,'0.0.0.0');
await client.login(c.token);
let busy = false, discordBusy = false, stopping = false;
async function discordTick() {
  if (discordBusy || stopping || !client.isReady()) return;
  discordBusy = true;
  try { await maintenance(); } catch (e) { console.error('Discord maintenance:',e.message); s.set('discordError',e.message); }
  finally { discordBusy = false; }
}
async function tick() {
  if (busy || stopping || !client.isReady()) return;
  busy = true;
  try {
    if (c.youtubeKey) {
      for (const [name,interval,work] of [
        ['stats',60000,()=>yt.refreshStats()], ['subscriptions',3600000,()=>yt.subscriptions()],
        ['feeds',c.pollMinutes*60000,()=>yt.feeds()], ['videos',c.livePollMinutes*60000,()=>yt.inspectVideos()]
      ]) {
        if (Date.now()-s.get(`tick:${name}`,0)<interval) continue;
        s.set(`tick:${name}`,Date.now());
        try { await work(); }
        catch (e) {
          s.set('youtubeError',`${name}: ${e.message}`);
          console.error(`YouTube ${name}:`,e.message);
          const hour = Math.floor(Date.now()/3600000);
          s.post(`youtube-error:${name}:${hour}`,c.log,{content:`YouTube ${name} needs attention: ${e.message}`});
        }
      }
    }
  } finally { busy = false; }
}
const timer = setInterval(tick,10000), discordTimer = setInterval(discordTick,10000); tick(); discordTick();
async function stop() {
  stopping = true; clearInterval(timer); clearInterval(discordTimer); http.close(); await client.destroy();
  const deadline = Date.now()+20000;
  while ((busy || discordBusy) && Date.now()<deadline) await new Promise(r=>setTimeout(r,100));
  if (!busy && !discordBusy) s.close();
  process.exit(0);
}
process.once('SIGTERM',stop); process.once('SIGINT',stop);
