import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Store } from '../src/store.js';
import { server } from '../src/server.js';
import { config } from '../src/config.js';
import { YouTube } from '../src/youtube.js';

test('Bridge authentication, acknowledgement leases and signed WebSub callbacks',async t=>{
  const s=new Store(':memory:'), c={...config({}),secret:'x'.repeat(48)},yt=new YouTube(s,c),http=server(s,c,yt);
  await new Promise(r=>http.listen(0,'127.0.0.1',r)); const base=`http://127.0.0.1:${http.address().port}`;
  t.after(async()=>{await new Promise(r=>http.close(r)); s.close();});
  assert.equal((await fetch(base+'/bridge/jobs')).status,401);
  const headers={authorization:`Bearer ${c.secret}`,'content-type':'application/json'};
  s.queue('test','creator',{});
  const {job}=await (await fetch(base+'/bridge/jobs',{headers})).json(); assert.ok(job.id);
  assert.equal((await fetch(base+'/bridge/ack',{method:'POST',headers,body:JSON.stringify({...job,lease:'wrong',success:true})})).status,409);
  assert.equal((await fetch(base+'/bridge/ack',{method:'POST',headers,body:JSON.stringify({...job,success:true})})).status,200);
  const channel='UC'+'a'.repeat(22),video='v'.repeat(11);
  s.run('INSERT INTO creators(user_id,channel_id,uuid,minecraft_name,data,verified_at) VALUES (?,?,?,?,?,?)','u',channel,'id','Player','{}',Date.now());
  const xml=`<feed><entry><yt:channelId>${channel}</yt:channelId><yt:videoId>${video}</yt:videoId></entry></feed>`;
  assert.equal((await fetch(base+'/youtube/websub',{method:'POST',body:xml})).status,403);
  const sig='sha1='+createHmac('sha1',c.secret).update(xml).digest('hex');
  assert.equal((await fetch(base+'/youtube/websub',{method:'POST',body:xml,headers:{'x-hub-signature':sig}})).status,200);
  assert.equal(s.one('SELECT id FROM videos').id,video);
  const q=new URLSearchParams({'hub.mode':'subscribe','hub.topic':`https://www.youtube.com/feeds/videos.xml?channel_id=${channel}`,'hub.challenge':'hello'});
  assert.equal(await (await fetch(base+'/youtube/websub?'+q)).text(),'hello');
});
