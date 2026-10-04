import { randomUUID } from 'node:crypto';
export function validateApplication(a) {
  if (!['java', 'bedrock'].includes(a.edition)) throw new Error('Choose Java or Bedrock.');
  a.username = String(a.username || '').trim();
  const pattern = a.edition === 'java' ? /^[A-Za-z0-9_]{3,16}$/ : /^[A-Za-z0-9][A-Za-z0-9 _]{0,15}$/;
  if (!pattern.test(a.username)) throw new Error(a.edition === 'java' ? 'Enter a Java username (3–16 letters, numbers or underscores).' : 'Enter your exact Xbox gamertag, including spaces, without the Floodgate prefix.');
  if (!/^\d{1,3}$/.test(String(a.age)) || Number(a.age) < 13 || Number(a.age) > 120) throw new Error('Applicants must be at least 13. Enter a valid age in years.');
  if (!['yes', 'i agree', 'agree'].includes(String(a.rules).trim().toLowerCase())) throw new Error('You must agree to the SMP rules by entering Yes.');
  for (const key of ['heard', 'why']) if (!a[key]?.trim() || a[key].length > 1000) throw new Error('Please answer both application questions (up to 1,000 characters each).');
  if (a.youtube && !/^https:\/\/(www\.)?youtube\.com\/(channel\/UC[\w-]{22}|@[\w.%-]+)\/?$/i.test(a.youtube)) throw new Error('Use a YouTube channel URL such as https://www.youtube.com/@YourHandle, or leave it blank.');
  return a;
}
export function submit(store, userId, input, cooldown, now = Date.now()) {
  const a = validateApplication(input);
  return store.transaction(() => {
    if (store.one("SELECT id FROM applications WHERE user_id=? AND state IN ('pending','approved','ready')", userId)) throw new Error('You already have a pending or accepted application. Use /status.');
    const denied = store.one("SELECT decided FROM applications WHERE user_id=? AND state='rejected' ORDER BY decided DESC LIMIT 1", userId);
    if (denied && now < denied.decided + cooldown) throw new Error(`You can reapply <t:${Math.ceil((denied.decided + cooldown) / 1000)}:R>.`);
    if (store.one("SELECT id FROM applications WHERE edition=? AND username=? COLLATE NOCASE AND state IN ('pending','approved','ready')", a.edition, a.username)) throw new Error('That Minecraft account already has an active application. Ask staff if this is a mistake.');
    const id = randomUUID();
    store.run('INSERT INTO applications(id,user_id,edition,username,answers,created) VALUES (?,?,?,?,?,?)', id, userId, a.edition, a.username, JSON.stringify(a), now);
    return id;
  });
}
export function decide(store, id, reviewer, approve, reason = '', now = Date.now()) {
  if (!approve && !reason.trim()) throw new Error('A rejection reason is required.');
  return store.transaction(() => {
    const r = store.one("SELECT * FROM applications WHERE id=? AND state='pending'", id);
    if (!r) throw new Error('This application was already reviewed or does not exist.');
    store.run('UPDATE applications SET state=?,reviewer=?,reason=?,decided=? WHERE id=?', approve ? 'approved' : 'rejected', reviewer, reason.trim().slice(0, 1000), now, id);
    if (approve) store.queue(`whitelist:${id}`, 'whitelist', { applicationId: id, edition: r.edition, username: r.username });
  });
}
export function joining(c) {
  const lines = ['Welcome to Kind SMP! Your application is approved and your Minecraft account is whitelisted.'];
  if (c.java) lines.push(`Java: ${c.java}`);
  if (c.bedrock) lines.push(`Bedrock: ${c.bedrock} • Port: ${c.bedrockPort}`);
  if (!c.java && !c.bedrock) lines.push('The owner has not added the server address yet. Ask staff for the address.');
  if (c.joinInstructions) lines.push(c.joinInstructions);
  lines.push(`Rules: https://discord.com/channels/${c.guild}/${c.rules}`);
  return lines.join('\n');
}
