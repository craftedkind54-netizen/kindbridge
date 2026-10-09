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

for (const edition of ['java', 'bedrock']) {
  for (const youtube of ['', 'https://www.youtube.com/@KindCrafted']) {
    test(edition + ' submits the application and optional YouTube link in one form: ' + youtube, async t => {
      const f = fixture(t);
      f.i.user.id = 'new-applicant';
      f.i.customId = 'edition:' + edition;
      let modal;
      f.i.showModal = async value => { modal = value.toJSON(); };
      await f.handle(f.i);
      assert.equal(modal.components.length, 5);
      assert.match(modal.components[0].description, /By submitting.*agree/);
      const inputs = modal.components.map(label => label.component);
      assert.deepEqual(inputs.map(input => input.custom_id), ['username','age','heard','why','youtube']);
      assert.equal(inputs.at(-1).required, false);
      const values = {username: edition === 'java' ? 'NewPlayer' : 'New Player', age:'18', heard:'A friend', why:'Build together', youtube};
      f.i.customId = modal.custom_id;
      f.i.isButton = () => false;
      f.i.isModalSubmit = () => true;
      f.i.fields = {getTextInputValue: key => values[key]};
      await f.handle(f.i);
      const saved = f.s.one('SELECT * FROM applications WHERE user_id=?', f.i.user.id);
      assert.equal(saved.state, 'pending');
      assert.equal(saved.edition, edition);
      assert.deepEqual(JSON.parse(saved.answers), {...values, edition, rules:'yes'});
      assert.equal(f.s.one('SELECT count(*) AS n FROM drafts').n, 0);
      assert.match(f.responses.at(-1).content, /Application submitted/);
      await f.handle(f.i);
      assert.match(f.responses.at(-1).content, /already have/);
    });
  }
}
for (const changes of [{age:'12'}, {youtube:'https://example.com/channel'}]) {
  test('Single form rejects invalid input: ' + JSON.stringify(changes), async t => {
    const f = fixture(t);
    f.i.user.id = 'new-applicant';
    f.i.customId = 'application-single:java';
    const values = {username:'NewPlayer',age:'18',heard:'Friend',why:'Build together',youtube:'',...changes};
    f.i.fields = {getTextInputValue: key => values[key]};
    await f.handle(f.i);
    assert.equal(f.s.one('SELECT id FROM applications WHERE user_id=?', f.i.user.id), undefined);
    assert.match(f.responses.at(-1).content, /at least 13|YouTube channel URL/);
  });
}

test('Accepted member can open the same form and submit a new account through Discord',async t=>{
  const f=fixture(t); f.s.run("UPDATE applications SET state='ready',uuid=? WHERE id=?",'12345678-1234-1234-1234-123456789012',f.app);
  f.i.user.id='applicant'; f.i.customId='edition:bedrock'; let modal;
  f.i.showModal=async value=>{modal=value.toJSON();}; await f.handle(f.i);
  assert.equal(modal.custom_id,'application-single:bedrock');
  f.i.customId=modal.custom_id;
  const values={username:'New Xbox',age:'18',heard:'Already a member',why:'New account',youtube:''};
  f.i.fields={getTextInputValue:key=>values[key]}; await f.handle(f.i);
  assert.match(f.responses.at(-1).content,/Application submitted/);
  assert.equal(f.s.one("SELECT count(*) AS n FROM applications WHERE user_id='applicant'").n,2);
});
