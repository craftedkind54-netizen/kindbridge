import { joining } from './applications.js';

// DM delivery is independent of staff-log, role, and announcement availability.
export function createNotifications(store, c, client) {
  const sending = new Set();
  const keyFor = app => 'applicationDm:' + app.id + ':' + app.state;
  async function deliver(app, force = false, now = Date.now()) {
    if (!['approved','ready','rejected'].includes(app.state)) return {status:'ineligible'};
    const key = keyFor(app), previous = store.get(key, {});
    if (sending.has(app.id)) return {status:'busy'};
    if (!force && (previous.sent || (app.state !== 'approved' && app.dm_done === 1))) return {status:'sent'};
    if (!force && previous.nextTry > now) return {status:'waiting'};
    if (app.state !== 'rejected' && !(app.edition === 'java' ? c.java : c.bedrock)) {
      store.set(key, {...previous, status:'missing-address'});
      return {status:'missing-address'};
    }
    sending.add(app.id);
    try {
      const user = await client.users.fetch(app.user_id);
      const content = app.state === 'rejected'
        ? 'Your Kind SMP application was rejected.\nReason: ' + app.reason + '\nYou can reapply <t:' + Math.ceil((app.decided+c.cooldown)/1000) + ':R>.'
        : joining(c, app.state === 'ready', app.username);
      await user.send({content, allowedMentions:{parse:[]}});
      store.set(key, {status:'sent', sent:now, attempts:0});
      if (app.state !== 'approved') store.run('UPDATE applications SET dm_done=1 WHERE id=? AND state=?', app.id, app.state);
      return {status:'sent'};
    } catch (e) {
      const blocked = e.code === 50007 || e.code === 10013;
      const attempts = (previous.attempts || 0) + 1;
      const delay = blocked ? 15*60000 : Math.min(3600000, 30000*2**Math.min(attempts-1,7));
      store.set(key, {status:blocked ? 'blocked' : 'failed', attempts, nextTry:now+delay, code:String(e.code || 'unknown')});
      if (app.state !== 'approved') store.run('UPDATE applications SET dm_done=? WHERE id=? AND state=?', blocked ? 2 : 0, app.id, app.state);
      store.set('dmError', 'Application ' + app.id.slice(0,8) + ': ' + (blocked ? 'Discord blocked the DM. Enable DMs from server members and use /join.' : 'DM delivery failed; retry queued (Discord ' + (e.code || 'unknown') + ').'));
      store.post('dm-failed:' + app.id + ':' + app.state, c.log, {content:'Could not DM applicant <@' + app.user_id + '>. They can enable DMs from server members and use /join, or use /status for a private reply. Staff can use /resend-welcome member: to retry.'});
      return {status:blocked ? 'blocked' : 'failed'};
    } finally { sending.delete(app.id); }
  }
  async function maintenance(now = Date.now()) {
    let attempted = 0;
    for (const app of store.all("SELECT * FROM applications WHERE state='approved' OR (state IN ('ready','rejected') AND dm_done<>1) ORDER BY created, rowid")) {
      const prior = store.get(keyFor(app), {});
      if (prior.sent || prior.nextTry > now) continue;
      const result = await deliver(app, false, now);
      if (result.status === 'missing-address') continue;
      if (++attempted >= 20) break;
    }
  }
  return { deliver, maintenance, keyFor };
}
