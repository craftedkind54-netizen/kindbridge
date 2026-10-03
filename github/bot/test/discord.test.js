import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { config } from '../src/config.js';
import { createDiscord } from '../src/discord.js';
import { submit } from '../src/applications.js';

function fixture(t,staffRole=false) {
  const s=new Store(':memory:'),c=config({});
  const app=submit(s,'applicant',{edition:'java',username:'KindPlayer',age:'13',rules:'yes',heard:'Friend',why:'Build together',youtube:''},c.cooldown);
  const {client}=createDiscord(s,c,{});
  t.after(async()=>{await client.destroy();s.close();});
  const responses=[];
  const i={guildId:c.guild,user:{id:'reviewer'},customId:`approve:${app}`,isChatInputCommand:()=>false,isButton:()=>true,isModalSubmit:()=>false,
    guild:{members:{fetch:async()=>({roles:{cache:new Map(staffRole ? [[c.staffRoles[0],{}]] : [])}})}},
    deferReply:async()=>{i.deferred=true;},reply:async data=>{responses.push(data);i.replied=true;},editReply:async data=>responses.push(data)};
  return {s,c,app,client,i,responses,handle:client.listeners('interactionCreate')[0]};
}
test('A non-staff member cannot approve even using a forged button ID',async t=>{
  const f=fixture(t,false); await f.handle(f.i);
  assert.equal(f.s.one('SELECT state FROM applications').state,'pending');
  assert.equal(f.s.one('SELECT count(*) AS n FROM jobs').n,0);
  assert.match(f.responses[0].content,/Only the configured/);
});
test('A staff interaction queues whitelist work and refuses a second decision',async t=>{
  const f=fixture(t,true); await f.handle(f.i);
  assert.equal(f.s.one('SELECT state FROM applications').state,'approved');
  assert.equal(f.s.one('SELECT count(*) AS n FROM jobs').n,1);
  await f.handle(f.i);
  assert.match(f.responses.at(-1).content,/already reviewed/);
});
test('Staff rejection through the Discord modal requires a nonblank reason',async t=>{
  const f=fixture(t,true); f.i.customId=`rejection:${f.app}`; f.i.fields={getTextInputValue:()=> '   '};
  await f.handle(f.i); assert.equal(f.s.one('SELECT state FROM applications').state,'pending');
  f.i.fields.getTextInputValue=()=> 'Please explain why you want to join.';
  await f.handle(f.i); assert.equal(f.s.one('SELECT state FROM applications').state,'rejected');
});
