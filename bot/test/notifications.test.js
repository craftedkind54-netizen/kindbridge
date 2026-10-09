import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { config } from '../src/config.js';
import { submit, decide, joining } from '../src/applications.js';
import { createNotifications } from '../src/notifications.js';
import { createDiscord } from '../src/discord.js';

function fixture(t) {
  const s=new Store(':memory:'); t.after(()=>s.close());
  const c={...config({}),java:'smp.example.test',bedrock:'bedrock.example.test',bedrockPort:19132};
  const id=submit(s,'member',{edition:'java',username:'KindPlayer',age:'18',rules:'yes',heard:'Friend',why:'Build',youtube:''},0);
  const sent=[]; let failure=null;
  const client={users:{fetch:async()=>({send:async body=>{if(failure)throw failure;sent.push(body);}})}};
  const n=createNotifications(s,c,client);
  return {s,c,id,sent,client,n,fail:value=>{failure=value;},app:()=>s.one('SELECT * FROM applications WHERE id=?',id),approve:()=>decide(s,id,'staff',true),ready:()=>{const job=s.lease();s.ack(job.id,job.lease,true,{uuid:'12345678-1234-1234-1234-123456789012'});}};
}
test('Welcome DM has the requested concise format',t=>{
  const f=fixture(t);
  assert.equal(joining(f.c),'Welcome to Kind SMP! Your application is approved and your Minecraft account is whitelisted.\nJava: smp.example.test\nBedrock: bedrock.example.test • Port: 19132\nRules: <#'+f.c.rules+'>');
});
test('Approval sends a private address DM; whitelisting sends one final welcome',async t=>{
  const f=fixture(t); await f.n.maintenance();assert.equal(f.sent.length,0);
  f.approve();await f.n.maintenance();await f.n.maintenance();assert.equal(f.sent.length,1);
  assert.match(f.sent[0].content,/whitelisting is still pending/);assert.match(f.sent[0].content,/Java: smp.example.test/);
  assert.equal(f.app().dm_done,0);f.ready();await f.n.maintenance();await f.n.maintenance();
  assert.equal(f.sent.length,2);assert.equal(f.sent[1].content,joining(f.c));assert.equal(f.app().dm_done,1);
  assert.deepEqual(f.sent[1].allowedMentions,{parse:[]});
});
test('Blocked DMs retry after backoff, including legacy dm_done=2',async t=>{
  const f=fixture(t);f.approve();f.ready();f.s.run('UPDATE applications SET dm_done=2 WHERE id=?',f.id);
  f.fail({code:50007});await f.n.maintenance(1000);assert.equal(f.app().dm_done,2);
  f.fail(null);await f.n.maintenance(1001);assert.equal(f.sent.length,0);
  await f.n.maintenance(901001);assert.equal(f.sent.length,1);assert.equal(f.app().dm_done,1);
});
test('Missing edition address leaves DM unsent and configuration repair allows delivery',async t=>{
  const f=fixture(t);f.approve();f.ready();f.c.java='';await f.n.maintenance();
  assert.equal(f.sent.length,0);assert.equal(f.app().dm_done,0);
  assert.equal(f.s.get(f.n.keyFor(f.app())).status,'missing-address');
  f.c.java='fixed.example.test';await f.n.maintenance();assert.equal(f.sent.length,1);
});
test('Resend can deliver an already sent DM and rejects pending applications',async t=>{
  const f=fixture(t);assert.equal((await f.n.deliver(f.app(),true)).status,'ineligible');
  f.approve();f.ready();await f.n.maintenance();await f.n.deliver(f.app(),true);assert.equal(f.sent.length,2);
});
test('A failed recipient does not prevent delivery to another recipient',async t=>{
  const f=fixture(t);f.approve();
  const second=submit(f.s,'other',{edition:'java',username:'OtherPlayer',age:'18',rules:'yes',heard:'Friend',why:'Build',youtube:''},0);decide(f.s,second,'staff',true);
  f.client.users.fetch=async id=>({send:async body=>{if(id==='member')throw {code:50007};f.sent.push(body);}});
  await f.n.maintenance();assert.equal(f.sent.length,1);
});
test('DM delivery succeeds even when staff-log maintenance fails',async t=>{
  const f=fixture(t);f.approve();f.ready();const {client,maintenance}=createDiscord(f.s,f.c,{});t.after(()=>client.destroy());
  client.isReady=()=>true;client.users.fetch=f.client.users.fetch;client.guilds.fetch=async()=>{throw new Error('Staff log unavailable');};
  await assert.rejects(()=>maintenance(),/Staff log unavailable/);assert.equal(f.sent.length,1);assert.equal(f.app().dm_done,1);
});
test('/join sends only the requesting accepted member a private DM',async t=>{
  const f=fixture(t);f.approve();f.ready();const {client}=createDiscord(f.s,f.c,{});t.after(()=>client.destroy());client.users.fetch=f.client.users.fetch;
  const replies=[];const i={guildId:f.c.guild,user:{id:'member'},commandName:'join',isChatInputCommand:()=>true,isButton:()=>false,isModalSubmit:()=>false,deferReply:async()=>{i.deferred=true;},editReply:async r=>replies.push(r),reply:async r=>replies.push(r)};
  await client.listeners('interactionCreate')[0](i);assert.equal(f.sent.length,1);assert.match(replies.at(-1).content,/sent by private DM/);assert.doesNotMatch(replies.at(-1).content,/smp.example.test/);
  await client.listeners('interactionCreate')[0](i);assert.equal(f.sent.length,1);assert.match(replies.at(-1).content,/30 seconds/);
});
test('Non-staff cannot resend another member’s welcome',async t=>{
  const f=fixture(t);f.approve();const {client}=createDiscord(f.s,f.c,{});t.after(()=>client.destroy());client.users.fetch=f.client.users.fetch;
  const replies=[];const i={guildId:f.c.guild,user:{id:'outsider'},commandName:'resend-welcome',isChatInputCommand:()=>true,isButton:()=>false,isModalSubmit:()=>false,guild:{members:{fetch:async()=>({roles:{cache:new Map()}})}},deferReply:async()=>{i.deferred=true;},editReply:async r=>replies.push(r)};
  await client.listeners('interactionCreate')[0](i);assert.equal(f.sent.length,0);assert.match(replies[0].content,/Only the configured/);
});
