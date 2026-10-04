function integer(env, key, fallback, min, max) {
  const n = Number(env[key] || fallback);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Invalid ${key}`);
  return n;
}
export function config(env = process.env) {
  const c = {
    token: env.DISCORD_TOKEN || '', secret: env.BRIDGE_SECRET || '', youtubeKey: env.YOUTUBE_API_KEY || '',
    publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, ''), dataDir: env.DATA_DIR || './data',
    guild: env.GUILD_ID || '1555704317552361563', staffRoles: (env.STAFF_ROLE_IDS || '1555726622982668408').split(',').map(s => s.trim()),
    apply: env.APPLY_CHANNEL_ID || '1555722797475561543', log: env.LOG_CHANNEL_ID || '1555723400008302763',
    memberRole: env.MEMBER_ROLE_ID || '1555723652627173416', youtubeRole: env.YOUTUBER_ROLE_ID || '1555723775691989033',
    rules: env.RULES_CHANNEL_ID || '1555706150488375296', scheduled: env.SCHEDULED_CHANNEL_ID || '1555724224297967756',
    shorts: env.SHORTS_CHANNEL_ID || '1555724261912748074', live: env.LIVE_CHANNEL_ID || '1555724180614287492',
    videos: env.VIDEOS_CHANNEL_ID === 'off' ? '' : (env.VIDEOS_CHANNEL_ID || env.SHORTS_CHANNEL_ID || '1555724261912748074'), java: env.JAVA_ADDRESS || '', bedrock: env.BEDROCK_ADDRESS || '',
    bedrockPort: integer(env, 'BEDROCK_PORT', 19132, 1, 65535), joinInstructions: env.JOIN_INSTRUCTIONS || '',
    cooldown: integer(env, 'REAPPLY_HOURS', 24, 0, 8760) * 3600000,
    dailyBudget: integer(env, 'YOUTUBE_DAILY_BUDGET', 8000, 1, 1000000),
    pollMinutes: integer(env, 'YOUTUBE_POLL_MINUTES', 10, 5, 1440),
    livePollMinutes: integer(env, 'YOUTUBE_LIVE_POLL_MINUTES', 5, 2, 60),
    maxCreators: integer(env, 'MAX_CREATORS', 100, 1, 1000), port: integer(env, 'PORT', 3000, 1, 65535)
  };
  return c;
}
export function validateConfig(c) {
  if (!c.token) throw new Error('Set DISCORD_TOKEN in Railway variables.');
  if (c.secret.length < 32) throw new Error('BRIDGE_SECRET must be at least 32 characters.');
  if (!/^https:\/\//.test(c.publicUrl)) throw new Error('PUBLIC_URL must be the Railway HTTPS URL.');
}
