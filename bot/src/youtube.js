import { randomBytes } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';

const WEEK = 7 * 86400000;
export function quotaDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function takeQuota(store, budget, units = 1, now = new Date()) {
  const day = quotaDay(now);
  return store.transaction(() => {
    const used = store.one('SELECT used FROM quota WHERE day=?', day)?.used || 0;
    if (store.get('quotaBlockedDay') === day || used + units > budget) throw new Error('YouTube daily budget reached; updates resume after Pacific midnight.');
    store.run('INSERT INTO quota VALUES (?,?) ON CONFLICT(day) DO UPDATE SET used=excluded.used', day, used + units);
    return used + units;
  });
}
export function channelTarget(input) {
  const text = input.trim();
  if (/^UC[\w-]{22}$/.test(text)) return { id: text };
  if (/^@[\w.-]+$/.test(text)) return { forHandle: text };
  let u; try { u = new URL(text); } catch { throw new Error('Enter a YouTube channel URL or @handle.'); }
  if (!['youtube.com', 'www.youtube.com'].includes(u.hostname) || u.protocol !== 'https:') throw new Error('Use a youtube.com channel URL.');
  const path = decodeURIComponent(u.pathname).replace(/\/$/, '');
  if (/^\/channel\/UC[\w-]{22}$/.test(path)) return { id: path.split('/')[2] };
  if (/^\/@[^/]+$/.test(path)) return { forHandle: path.slice(1) };
  throw new Error('Use the channel’s @handle or /channel/UC… URL.');
}
export function videoId(input) {
  const u = new URL(input);
  if (u.protocol !== 'https:') throw new Error('Use an HTTPS YouTube URL.');
  let id;
  if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
  else if (['youtube.com', 'www.youtube.com'].includes(u.hostname)) id = u.searchParams.get('v') || u.pathname.match(/^\/(?:shorts|live)\/([\w-]{11})\/?$/)?.[1];
  if (!/^[\w-]{11}$/.test(id || '')) throw new Error('Enter a valid YouTube video, Short, or live URL.');
  return id;
}
export function durationSeconds(value) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value || '');
  return m ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0) : Infinity;
}
export function classify(v) {
  const live = v.liveStreamingDetails;
  if (live?.actualEndTime) return 'ended';
  if (live?.actualStartTime || v.snippet?.liveBroadcastContent === 'live') return 'live';
  if (live?.scheduledStartTime || v.snippet?.liveBroadcastContent === 'upcoming') return 'scheduled';
  if (durationSeconds(v.contentDetails?.duration) <= 180 && /#shorts\b/i.test(`${v.snippet?.title} ${v.snippet?.description}`)) return 'shorts';
  return 'video';
}
export function feedEntries(xml) {
  if (Buffer.byteLength(xml) > 262144 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Invalid feed');
  const parsed = new XMLParser({ ignoreAttributes: false, processEntities: false }).parse(xml);
  const entries = parsed.feed?.entry || [];
  return (Array.isArray(entries) ? entries : [entries]).map(e => ({ video: e['yt:videoId'], channel: e['yt:channelId'] }))
    .filter(e => /^[\w-]{11}$/.test(e.video || '') && /^UC[\w-]{22}$/.test(e.channel || ''));
}
const chunks = (a, n = 50) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

export class YouTube {
  constructor(store, c, fetcher = fetch) { this.s = store; this.c = c; this.fetch = fetcher; }
  async api(resource, params) {
    if (!this.c.youtubeKey) throw new Error('Owner needs to set YOUTUBE_API_KEY in Railway.');
    if (!['channels', 'playlistItems', 'videos'].includes(resource)) throw new Error('Endpoint not budgeted');
    takeQuota(this.s, this.c.dailyBudget);
    const u = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set('key', this.c.youtubeKey);
    const response = await this.fetch(u, { signal: AbortSignal.timeout(15000) });
    const body = await response.json();
    if (!response.ok) {
      const reason = body.error?.errors?.[0]?.reason || `HTTP ${response.status}`;
      if (['quotaExceeded', 'dailyLimitExceeded'].includes(reason)) this.s.set('quotaBlockedDay', quotaDay());
      throw new Error(`YouTube request failed (${reason}).`);
    }
    return body.items || [];
  }
  async begin(userId, target) {
    const app = this.s.one("SELECT * FROM applications WHERE user_id=? AND state='ready'", userId);
    if (!app) throw new Error('Your application must be approved and whitelisted first.');
    if (this.s.one('SELECT user_id FROM creators WHERE user_id=?', userId)) throw new Error('You already linked a channel. Ask staff to unlink it before changing it.');
    const old = this.s.one('SELECT expires FROM verifications WHERE user_id=?', userId);
    if (old && old.expires > Date.now() + 29 * 60000) throw new Error('Wait a minute before starting another verification.');
    if (this.s.one('SELECT count(*) AS n FROM creators').n >= this.c.maxCreators) throw new Error('Creator capacity reached. Contact staff.');
    const [channel] = await this.api('channels', { part: 'snippet', ...channelTarget(target) });
    if (!channel) throw new Error('That channel could not be found.');
    if (this.s.one('SELECT user_id FROM creators WHERE channel_id=?', channel.id)) throw new Error('That channel is already linked to another member.');
    const code = `kind-smp-${randomBytes(12).toString('hex')}`;
    this.s.run('INSERT INTO verifications(user_id,channel_id,code,expires) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET channel_id=excluded.channel_id,code=excluded.code,expires=excluded.expires,next_check=0', userId, channel.id, code, Date.now() + 1800000);
    return { code, name: channel.snippet.title };
  }
  async verify(userId) {
    const v = this.s.one('SELECT * FROM verifications WHERE user_id=?', userId);
    if (!v || v.expires < Date.now()) throw new Error('Verification expired. Start again with /youtube.');
    if (v.next_check > Date.now()) throw new Error('Wait one minute between verification checks.');
    this.s.run('UPDATE verifications SET next_check=? WHERE user_id=?', Date.now() + 60000, userId);
    const [channel] = await this.api('channels', { part: 'snippet,statistics,contentDetails', id: v.channel_id });
    if (!channel?.snippet?.description?.includes(v.code)) throw new Error('Code not found in your channel description yet. Keep it there and try again in a minute.');
    const app = this.s.one("SELECT * FROM applications WHERE user_id=? AND state='ready'", userId);
    if (!app) throw new Error('Your approved Minecraft account is unavailable. Contact staff.');
    const now = Date.now();
    this.s.transaction(() => {
      if (this.s.one('SELECT count(*) AS n FROM creators').n >= this.c.maxCreators) throw new Error('Creator capacity reached. Contact staff.');
      const data = this.channelData(channel);
      this.s.run('INSERT INTO creators(user_id,channel_id,uuid,minecraft_name,data,verified_at) VALUES (?,?,?,?,?,?)', userId, channel.id, app.uuid, app.username, JSON.stringify(data), now);
      this.s.run('DELETE FROM verifications WHERE user_id=?', userId);
    });
    return channel.snippet.title;
  }
  channelData(channel, likes = 0) {
    return { channelId: channel.id, channelName: channel.snippet.title, channelUrl: `https://www.youtube.com/channel/${channel.id}`,
      uploadPlaylistId: channel.contentDetails.relatedPlaylists.uploads, profilePictureUrl: channel.snippet.thumbnails?.default?.url || '',
      subscribers: Number(channel.statistics.subscriberCount || 0), uploads: Number(channel.statistics.videoCount || 0), likes };
  }
  async refreshStats() {
    const due = this.s.all('SELECT * FROM creators WHERE refreshed<?', Date.now() - WEEK);
    for (const group of chunks(due)) {
      const channels = await this.api('channels', { part: 'snippet,statistics,contentDetails', id: group.map(c => c.channel_id).join(',') });
      for (const channel of channels) {
        const creator = group.find(c => c.channel_id === channel.id);
        const playlist = channel.contentDetails.relatedPlaylists.uploads;
        const uploads = await this.api('playlistItems', { part: 'contentDetails', playlistId: playlist, maxResults: 50 });
        const ids = uploads.map(v => v.contentDetails.videoId).filter(Boolean);
        const videos = ids.length ? await this.api('videos', { part: 'statistics', id: ids.join(',') }) : [];
        const likes = videos.reduce((sum, v) => sum + Number(v.statistics?.likeCount || 0), 0);
        const data = this.channelData(channel, likes), now = Date.now();
        this.s.transaction(() => {
          this.s.run('UPDATE creators SET data=?,refreshed=? WHERE user_id=?', JSON.stringify(data), now, creator.user_id);
          this.s.queue(`creator:${creator.user_id}:${now}`, 'creator', { uuid: creator.uuid, minecraftName: creator.minecraft_name, ...data, refreshedAt: now, nextRefreshAt: now + WEEK });
        });
      }
    }
  }
  async feeds() {
    for (const creator of this.s.all('SELECT * FROM creators')) {
      const r = await this.fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${creator.channel_id}`, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`YouTube feed unavailable (HTTP ${r.status}).`);
      this.ingest(feedEntries(await r.text()).filter(e => e.channel === creator.channel_id));
    }
  }
  ingest(entries, notification = false) {
    for (const e of entries) {
      if (!this.s.one('SELECT user_id FROM creators WHERE channel_id=?', e.channel)) continue;
      this.s.run('INSERT OR IGNORE INTO videos(id,channel_id,data,checked,first_seen) VALUES (?,?,?,0,?)', e.video, e.channel, '{}', Date.now());
      if (notification) this.s.run('UPDATE videos SET checked=0,ended=0 WHERE id=? AND channel_id=?',e.video,e.channel);
    }
  }
  async inspectVideos() {
    const now = Date.now();
    const rows = this.s.all('SELECT * FROM videos WHERE ended=0 AND checked<? ORDER BY checked LIMIT 500', now - this.c.livePollMinutes * 60000);
    for (const group of chunks(rows)) {
      const videos = await this.api('videos', { part: 'snippet,contentDetails,liveStreamingDetails,status', id: group.map(v => v.id).join(',') });
      const found = new Set();
      for (const v of videos) { found.add(v.id); this.recordVideo(v, now); }
      for (const r of group) if (!found.has(r.id)) this.s.run('UPDATE videos SET checked=?,ended=? WHERE id=?', now, now - r.first_seen > 86400000 ? 1 : 0, r.id);
    }
  }
  recordVideo(v, now = Date.now(), forceShort = false) {
    const creator = this.s.one('SELECT * FROM creators WHERE channel_id=?', v.snippet.channelId);
    if (!creator) return;
    const kind = forceShort ? 'shorts' : classify(v);
    const publicVideo = v.status?.privacyStatus === 'public';
    const recent = new Date(v.snippet.publishedAt).getTime() >= creator.verified_at;
    // Never backfill old uploads, but do announce an existing upcoming or currently live stream.
    if (publicVideo && (forceShort || recent || ['live','scheduled'].includes(kind))) {
      const channel = kind === 'video' ? this.c.videos : this.c[kind];
      const heading = { shorts: 'New Short', video: 'New video', live: 'Live now', scheduled: 'Scheduled stream' }[kind];
      if (heading) {
        const date = v.liveStreamingDetails?.scheduledStartTime;
        const scheduled = kind === 'scheduled' && date ? `\nStarts <t:${Math.floor(new Date(date).getTime() / 1000)}:F>` : '';
        this.s.post(`youtube:${v.id}:${['shorts','video'].includes(kind) ? 'upload' : kind}`, channel, { content: `**${heading} · ${v.snippet.channelTitle.replace(/[@*_`]/g, '')}**${scheduled}\nhttps://www.youtube.com/${kind === 'shorts' ? 'shorts/' : 'watch?v='}${v.id}` });
      }
    }
    const ended = ['shorts','video','ended'].includes(kind) ? 1 : 0;
    this.s.run('INSERT INTO videos(id,channel_id,data,checked,first_seen,ended) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,checked=excluded.checked,ended=excluded.ended', v.id, v.snippet.channelId, JSON.stringify(v), now, now, ended);
  }
  async submitVideo(userId, url, forceShort = false) {
    const creator = this.s.one('SELECT * FROM creators WHERE user_id=?', userId);
    if (!creator) throw new Error('Verify your channel first with /youtube.');
    const last = this.s.get(`videoSubmit:${userId}`, 0);
    if (Date.now() - last < 60000) throw new Error('Wait one minute between submissions.');
    this.s.set(`videoSubmit:${userId}`, Date.now());
    const [v] = await this.api('videos', { part: 'snippet,contentDetails,liveStreamingDetails,status', id: videoId(url) });
    if (!v || v.snippet.channelId !== creator.channel_id || v.status?.privacyStatus !== 'public') throw new Error('The video must be public and belong to your verified channel.');
    if (forceShort && (durationSeconds(v.contentDetails.duration) > 180 || v.liveStreamingDetails)) throw new Error('A Short must be at most three minutes and cannot be a livestream.');
    if (!forceShort && !['scheduled','live'].includes(classify(v))) throw new Error('Use /stream for an upcoming or active livestream.');
    this.recordVideo(v, Date.now(), forceShort);
  }
  async subscriptions() {
    for (const creator of this.s.all('SELECT channel_id FROM creators')) {
      if (this.s.get(`sub:${creator.channel_id}`, 0) > Date.now() - 86400000) continue;
      const body = new URLSearchParams({ 'hub.callback': `${this.c.publicUrl}/youtube/websub`, 'hub.mode': 'subscribe',
        'hub.topic': `https://www.youtube.com/feeds/videos.xml?channel_id=${creator.channel_id}`, 'hub.verify': 'async',
        'hub.lease_seconds': '432000', 'hub.secret': this.c.secret });
      const r = await this.fetch('https://pubsubhubbub.appspot.com/subscribe', { method: 'POST', body, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`YouTube subscription failed (HTTP ${r.status}).`);
      this.s.set(`sub:${creator.channel_id}`, Date.now());
    }
  }
}
