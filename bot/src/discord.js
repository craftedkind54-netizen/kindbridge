import { Client, GatewayIntentBits, MessageFlags, PermissionFlagsBits, SlashCommandBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder,
  EmbedBuilder } from 'discord.js';
import { submit, decide, joining } from './applications.js';
import { quotaDay } from './youtube.js';
import { createHash } from 'node:crypto';

const ephemeral = MessageFlags.Ephemeral;
const button = (id, label, style = ButtonStyle.Primary) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
const row = (...buttons) => new ActionRowBuilder().addComponents(buttons);
function form(id, title, fields) {
  return new ModalBuilder().setCustomId(id).setTitle(title).addLabelComponents(fields.map(([key, label, max, long, required = true]) =>
    new LabelBuilder().setLabel(label).setTextInputComponent(new TextInputBuilder().setCustomId(key).setStyle(long ? TextInputStyle.Paragraph : TextInputStyle.Short).setMaxLength(max).setRequired(required))));
}
export const applicationForm = edition => form(`application:${edition}`, 'Kind SMP application · 1 of 2', [
  ['username', edition === 'java' ? 'Minecraft Java username' : 'Xbox gamertag (no Floodgate prefix)', 16],
  ['age', 'How old are you?', 3], ['rules', 'Will you follow the SMP rules? Enter Yes.', 20],
  ['heard', 'How did you hear about us?', 1000, true], ['why', 'Why do you want to join?', 1000, true]
]);
const youtubeForm = () => form('application:youtube', 'Kind SMP application · 2 of 2', [['youtube', 'YouTube channel link (optional)', 200, false, false]]);

export function createDiscord(store, c, yt) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds], allowedMentions: { parse: [] } });
  async function staff(i) {
    if (i.guildId !== c.guild) throw new Error('Use this command in the Kind SMP Discord server.');
    const member = await i.guild.members.fetch({ user: i.user.id, force: true });
    if (!c.staffRoles.some(id => member.roles.cache.has(id))) throw new Error('Only the configured Kind SMP staff role can do that.');
  }
  async function send(channelId, body, key = null) {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased() || channel.guildId !== c.guild || !channel.send) throw new Error('Configured channel is unavailable.');
    if (channelId === c.log) {
      for (const roleId of [c.guild,c.memberRole,c.youtubeRole]) {
        const role = await channel.guild.roles.fetch(roleId);
        if (role && channel.permissionsFor(role)?.has(PermissionFlagsBits.ViewChannel)) throw new Error('Make the form-log channel private: everyone, SMP Member and YouTuber must not have View Channel. Give access to staff and the bot.');
      }
    }
    const nonce = key ? createHash('sha256').update(key).digest('hex').slice(0,24) : undefined;
    return channel.send({ ...body, ...(nonce ? {nonce, enforceNonce: true} : {}), allowedMentions: { parse: [] } });
  }
  const commands = [
    new SlashCommandBuilder().setName('setup').setDescription('Staff: post the Kind SMP application panel'),
    new SlashCommandBuilder().setName('apply').setDescription('Apply to join Kind SMP'),
    new SlashCommandBuilder().setName('status').setDescription('Check your application and joining instructions'),
    new SlashCommandBuilder().setName('youtube').setDescription('Verify ownership of your YouTube channel').addStringOption(o => o.setName('channel').setDescription('YouTube channel URL or @handle').setRequired(true)),
    new SlashCommandBuilder().setName('verify').setDescription('Check the verification code in your YouTube channel description'),
    new SlashCommandBuilder().setName('short').setDescription('Post a Short from your verified YouTube channel').addStringOption(o => o.setName('url').setDescription('Public YouTube Short URL').setRequired(true)),
    new SlashCommandBuilder().setName('stream').setDescription('Register your public upcoming/live stream for announcements').addStringOption(o => o.setName('url').setDescription('YouTube stream URL').setRequired(true)),
    new SlashCommandBuilder().setName('health').setDescription('Staff: check Minecraft connection, jobs and YouTube quota'),
    new SlashCommandBuilder().setName('retry').setDescription('Staff: retry a failed Minecraft job').addStringOption(o => o.setName('job').setDescription('Job ID from /health').setRequired(true)),
    new SlashCommandBuilder().setName('unlink-youtube').setDescription('Staff: remove a member’s verified channel').addUserOption(o => o.setName('member').setDescription('Member to unlink').setRequired(true))
  ].map(x => x.setDMPermission(false).toJSON());
  client.once('clientReady', async () => {
    try {
      const guild = await client.guilds.fetch(c.guild);
      await guild.commands.set(commands);
      console.log('Kind SMP connected. Staff can run /setup.');
    } catch (e) { console.error('Discord command setup failed:', e.message); process.exitCode = 1; await client.destroy(); }
  });
  const starts = new Map();
  const userLocks = new Set();
  client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand() && !i.isButton() && !i.isModalSubmit()) return;
    const reply = content => i.deferred || i.replied ? i.editReply({ content, components: [] }) : i.reply({ content, flags: ephemeral });
    if (i.guildId !== c.guild) return reply('Use this in the Kind SMP Discord server.');
    if (userLocks.has(i.user.id)) return reply('Your previous request is still processing.');
    userLocks.add(i.user.id);
    try {
      const id = i.customId || i.commandName;
      if (['setup','health','retry','unlink-youtube'].includes(id) || /^(approve|reject|rejection):/.test(id)) {
        // Button-to-modal responses must be immediate; the staff check still uses a fresh REST fetch.
        if (!id.startsWith('reject:')) await i.deferReply({ flags: ephemeral });
        await staff(i);
      }
      if (id === 'setup') {
        const guild = await client.guilds.fetch(c.guild), me = await guild.members.fetchMe();
        for (const roleId of [c.memberRole, c.youtubeRole]) {
          const role = await guild.roles.fetch(roleId);
          if (!role || role.managed || me.roles.highest.comparePositionTo(role) <= 0 || !me.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error('Move the bot role above SMP Member and YouTuber, and give it Manage Roles.');
        }
        const body = { content: `## Welcome to Kind SMP\nApply to join our Java and Bedrock SMP. You must be **13 or older**.\nRead <#${c.rules}> first. Answers are shared with staff in a private review channel.\nOne pending application per person. Reapply ${c.cooldown / 3600000} hours after rejection.\nYouTube is optional; channel ownership is verified after approval.`, components: [row(button('edition:java','Apply · Java'), button('edition:bedrock','Apply · Bedrock'))] };
        const panelId = store.get('applicationPanel');
        if (panelId) { try { const ch = await client.channels.fetch(c.apply); const m = await ch.messages.fetch(panelId); await m.edit(body); return reply('Application panel updated.'); } catch { /* Recreate a deleted panel. */ } }
        const msg = await send(c.apply, body); store.set('applicationPanel', msg.id); return reply('Application panel posted.');
      }
      if (id === 'apply') return i.reply({ content: `Read <#${c.rules}> before applying. Choose the account you will join with:`, components: [row(button('edition:java','Java'),button('edition:bedrock','Bedrock'))], flags: ephemeral });
      if (id.startsWith('edition:')) {
        if (store.one("SELECT id FROM applications WHERE user_id=? AND state IN ('pending','approved','ready')", i.user.id)) throw new Error('You already have a pending or accepted application. Use /status.');
        const edition = id.split(':')[1]; if (!['java','bedrock'].includes(edition)) return;
        return i.showModal(applicationForm(edition));
      }
      if (['application:java','application:bedrock'].includes(id)) {
        const data = { edition: id.split(':')[1] };
        for (const key of ['username','age','rules','heard','why']) data[key] = i.fields.getTextInputValue(key).trim();
        // Reject ineligible age before retaining the draft.
        if (!/^\d{1,3}$/.test(data.age) || Number(data.age) < 13 || Number(data.age) > 120) throw new Error('You must be at least 13 to apply.');
        store.run('INSERT INTO drafts VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,expires=excluded.expires', i.user.id, JSON.stringify(data), Date.now()+1800000);
        return i.reply({ content: 'Your unfinished form is saved for 30 minutes. Click Finish application to submit it (the YouTube link is optional). Submitted applications and approved whitelist requests do not expire while the SMP is offline.', components: [row(button('continue','Finish application'))], flags: ephemeral });
      }
      if (id === 'continue') return i.showModal(youtubeForm());
      if (id === 'application:youtube') {
        const draft = store.one('SELECT * FROM drafts WHERE user_id=?', i.user.id);
        if (!draft || draft.expires < Date.now()) throw new Error('Your draft expired. Start again with /apply.');
        const data = JSON.parse(draft.data); data.youtube = i.fields.getTextInputValue('youtube').trim();
        const appId = submit(store, i.user.id, data, c.cooldown);
        store.run('DELETE FROM drafts WHERE user_id=?', i.user.id);
        return reply(`Application submitted to staff. Reference: ${appId.slice(0,8)}. Use /status for updates.`);
      }
      if (id.startsWith('approve:')) { decide(store,id.slice(8),i.user.id,true); return reply('Approved. The whitelist request is saved with no expiry. If the SMP is running, the plugin will add this player automatically; if it is offline, processing resumes when it starts. No second approval is needed. Membership and joining instructions follow after whitelisting succeeds.'); }
      if (id.startsWith('reject:')) return i.showModal(form(`rejection:${id.slice(7)}`, 'Reason for rejecting', [['reason','Reason shown to the applicant',1000,true]]));
      if (id.startsWith('rejection:')) { decide(store,id.slice(10),i.user.id,false,i.fields.getTextInputValue('reason')); return reply('Application rejected with your reason.'); }
      if (id === 'status') {
        const app = store.one('SELECT * FROM applications WHERE user_id=? ORDER BY created DESC LIMIT 1', i.user.id);
        if (!app) return reply('You have not applied yet. Use /apply.');
        const state = { pending:'Your submitted application is saved and waiting for staff review. It does not expire after 30 minutes.',approved:'Approved by staff. Your whitelist request is saved with no expiry. The plugin adds you automatically while the SMP is running, or resumes when it starts again. No need to reapply. If it stays pending while the SMP is online, staff can check /health for a connection or account lookup error.',ready:joining(c),rejected:`Rejected: ${app.reason}\nYou may reapply <t:${Math.ceil((app.decided+c.cooldown)/1000)}:R>.` }[app.state];
        return reply(state);
      }
      if (['youtube','verify','short','stream'].includes(id)) {
        await i.deferReply({ flags: ephemeral });
        const last = starts.get(i.user.id) || 0;
        if (Date.now() - last < 5000) throw new Error('Wait a few seconds before another request.'); starts.set(i.user.id,Date.now());
        if (id === 'youtube') { const v = await yt.begin(i.user.id,i.options.getString('channel',true)); return reply(`To verify **${v.name.replace(/[@*_`]/g,'')}**, temporarily add this exact code to your YouTube channel description:\n\`${v.code}\`\nThen run /verify within 30 minutes. You can remove the code after verification.`); }
        if (id === 'verify') { const name = await yt.verify(i.user.id); return reply(`Verified ${name}! Your YouTuber role and scoreboard registration are queued. You may now remove the code from your description.`); }
        await yt.submitVideo(i.user.id,i.options.getString('url',true),id === 'short'); return reply('Checked your verified channel and queued any eligible announcement. Duplicate posts are suppressed.');
      }
      if (id === 'health') {
        const seen = store.get('bridgeSeen',0), jobs = store.all("SELECT id,kind,attempts,error FROM jobs WHERE state<>'done' LIMIT 10");
        return reply(`Minecraft last connected: ${seen ? `<t:${Math.floor(seen/1000)}:R>` : 'never'}\nYouTube units today: ${store.one('SELECT used FROM quota WHERE day=?',quotaDay())?.used || 0}/${c.dailyBudget}\nCreators: ${store.one('SELECT count(*) AS n FROM creators').n}/${c.maxCreators}\nLast Discord error: ${store.get('discordError','none')}\nLast YouTube error: ${store.get('youtubeError','none')}\nPending jobs:\n${jobs.map(j=>`${j.id} · ${j.kind} · attempts ${j.attempts}${j.error ? ' · '+j.error : ''}`).join('\n') || 'none'}`.slice(0,1950));
      }
      if (id === 'retry') { store.run("UPDATE jobs SET until=0 WHERE id=? AND state='queued'",i.options.getString('job',true)); return reply('Queued job is eligible to retry. Use /health to check the result.'); }
      if (id === 'unlink-youtube') {
        const userId = i.options.getUser('member',true).id, creator = store.one('SELECT * FROM creators WHERE user_id=?',userId);
        if (!creator) throw new Error('This member has no verified channel.');
        const member = await i.guild.members.fetch(userId); await member.roles.remove(c.youtubeRole);
        store.transaction(() => {
          store.run("UPDATE jobs SET state='cancelled' WHERE kind='creator' AND state IN ('queued','leased') AND json_extract(payload,'$.uuid')=?",creator.uuid);
          store.queue(`unlink:${userId}:${Date.now()}`,'unlink',{uuid:creator.uuid});
          store.run('DELETE FROM creators WHERE user_id=?',userId);
          store.run('DELETE FROM videos WHERE channel_id=?',creator.channel_id);
        });
        return reply('Channel unlinked; role removed and scoreboard removal queued.');
      }
    } catch (e) {
      const text = e.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'That account or channel is already linked. Contact staff.' : e.message;
      try { await reply(String(text).slice(0,1900)); } catch { console.error('Could not answer Discord interaction.'); }
    } finally { userLocks.delete(i.user.id); }
  });
  async function maintenance() {
    if (!client.isReady()) return;
    store.run('DELETE FROM drafts WHERE expires<?',Date.now());
    store.run('DELETE FROM verifications WHERE expires<?',Date.now());
    for (const [id,time] of starts) if (Date.now()-time>60000) starts.delete(id);
    const guild = await client.guilds.fetch(c.guild);
    for (const app of store.all('SELECT * FROM applications WHERE log_id IS NULL LIMIT 10')) {
      const a = JSON.parse(app.answers);
      const embed = new EmbedBuilder().setColor(0x65b891).setTitle(`Kind SMP application · ${app.id.slice(0,8)}`)
        .setDescription(`Applicant: <@${app.user_id}>\nEdition: ${app.edition}`)
        .addFields({name:'Minecraft username',value:app.username},{name:'Age',value:a.age},{name:'Agrees to rules',value:a.rules},{name:'How they heard about us',value:a.heard},{name:'Why they want to join',value:a.why},{name:'YouTube (not yet verified)',value:a.youtube || 'Not provided'});
      const msg = await send(c.log,{embeds:[embed],components:[row(button(`approve:${app.id}`,'Approve',ButtonStyle.Success),button(`reject:${app.id}`,'Reject with reason',ButtonStyle.Danger))]},`application:${app.id}`);
      store.run('UPDATE applications SET log_id=? WHERE id=?',msg.id,app.id);
    }
    for (const app of store.all("SELECT * FROM applications WHERE state<>'pending' AND notification_done=0 AND log_id IS NOT NULL LIMIT 20")) {
      const ch = await client.channels.fetch(c.log);
      try { const msg = await ch.messages.fetch(app.log_id); await msg.edit({components:[],content:`${app.state === 'rejected' ? 'Rejected' : 'Approved'} by <@${app.reviewer}>${app.reason ? '\nReason: '+app.reason : app.state === 'ready' ? '\nWhitelisting completed by the Minecraft server.' : '\nWhitelist request saved with no expiry. Automatically processed when the SMP is running.'}`,allowedMentions:{parse:[]}}); }
      catch (e) { if (e.code !== 10008) throw e; }
      store.run('UPDATE applications SET notification_done=1 WHERE id=? AND state=?',app.id,app.state);
    }
    for (const app of store.all("SELECT * FROM applications WHERE state='ready' AND role_done=0 LIMIT 20")) {
      try { const member = await guild.members.fetch(app.user_id); await member.roles.add(c.memberRole,'Kind SMP application approved'); store.run('UPDATE applications SET role_done=1 WHERE id=?',app.id); }
      catch (e) { store.set('discordError',`Member role failed for application ${app.id.slice(0,8)} (Discord ${e.code || 'error'}).`); }
    }
    for (const creator of store.all('SELECT * FROM creators WHERE role_done=0 LIMIT 20')) {
      try { const member = await guild.members.fetch(creator.user_id); await member.roles.add(c.youtubeRole,'YouTube ownership verified'); store.run('UPDATE creators SET role_done=1 WHERE user_id=?',creator.user_id); }
      catch (e) { store.set('discordError',`YouTuber role assignment failed (Discord ${e.code || 'error'}).`); }
    }
    for (const app of store.all("SELECT * FROM applications WHERE state IN ('ready','rejected') AND dm_done=0 LIMIT 20")) {
      try { const user = await client.users.fetch(app.user_id); await user.send({content:app.state === 'ready' ? joining(c) : `Your Kind SMP application was rejected.\nReason: ${app.reason}\nYou can reapply <t:${Math.ceil((app.decided+c.cooldown)/1000)}:R>.`,allowedMentions:{parse:[]}}); store.run('UPDATE applications SET dm_done=1 WHERE id=?',app.id); }
      catch (e) { if (e.code === 50007 || e.code === 10013) { store.run('UPDATE applications SET dm_done=2 WHERE id=?',app.id); store.post(`dm-failed:${app.id}`,c.log,{content:`Could not DM applicant <@${app.user_id}>. They can use /status to see the decision and joining instructions.`}); } else throw e; }
    }
    for (const p of store.all('SELECT * FROM posts WHERE message_id IS NULL AND next_try<? LIMIT 20',Date.now())) {
      try { const msg = await send(p.channel,JSON.parse(p.body),p.key); store.run('UPDATE posts SET message_id=? WHERE key=?',msg.id,p.key); }
      catch { store.run('UPDATE posts SET attempts=attempts+1,next_try=? WHERE key=?',Date.now()+Math.min(3600000,30000*2**Math.min(p.attempts,7)),p.key); }
    }
  }
  return { client, maintenance };
}
