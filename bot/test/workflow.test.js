import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { submit, decide, joining } from '../src/applications.js';
import { config } from '../src/config.js';
import { YouTube, takeQuota, quotaDay, channelTarget, videoId, classify, feedEntries } from '../src/youtube.js';
import { applicationForm } from '../src/discord.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const input = overrides => ({ edition:'java', username:'KindPlayer', age:'13', rules:'Yes', heard:'A friend', why:'I enjoy building together.', youtube:'', ...overrides });
const uuid = '12345678-1234-1234-1234-123456789012';
const channel = 'UC'+'a'.repeat(22);
const video = 'a'.repeat(11);
function store(t) { const s = new Store(':memory:'); t.after(()=>s.close()); return s; }
function ready(s,user='u') { const id=submit(s,user,input(),86400000); decide(s,id,'staff',true); const j=s.lease(); s.ack(j.id,j.lease,true,{uuid}); return id; }
test('Minimum age, rules, malformed ages and username injection are rejected',t=>{
  const s=store(t);
  for (const data of [input({age:'12'}),input({age:'13abc'}),input({rules:'no'}),input({username:'x\nop other'})]) assert.throws(()=>submit(s,'u',data,0));
  assert.equal(s.one('SELECT count(*) AS n FROM applications').n,0);
});
test('Duplicate people and accounts cannot create concurrent applications',t=>{
  const s=store(t); submit(s,'u',input(),0);
  assert.throws(()=>submit(s,'u',input({username:'Different'}),0),/already/);
  assert.throws(()=>submit(s,'v',input({username:'kindplayer'}),0),/already/);
  assert.equal(s.one('SELECT count(*) AS n FROM applications').n,1);
});
test('Rejection needs a reason and reapplication waits 24 hours',t=>{
  const s=store(t), now=1000000000, id=submit(s,'u',input(),86400000,now);
  assert.throws(()=>decide(s,id,'staff',false,''),/reason/);
  decide(s,id,'staff',false,'Please expand your answer.',now);
  assert.throws(()=>submit(s,'u',input(),86400000,now+86399999),/reapply/);
  assert.ok(submit(s,'u',input(),86400000,now+86400000));
});
test('Approval is atomic, cannot be double-decided, and waits for whitelist acknowledgement',t=>{
  const s=store(t),id=submit(s,'u',input(),0); decide(s,id,'a',true);
  assert.throws(()=>decide(s,id,'b',false,'No'),/already/);
  assert.equal(s.one('SELECT state FROM applications WHERE id=?',id).state,'approved');
  const j=s.lease(1000); assert.equal(j.kind,'whitelist'); assert.equal(s.lease(1001),null);
  assert.equal(s.ack(j.id,'wrong',true,{uuid}),false);
  assert.equal(s.ack(j.id,j.lease,true,{uuid}),true);
  assert.equal(s.ack(j.id,j.lease,true,{uuid}),false);
  assert.equal(s.one('SELECT state FROM applications WHERE id=?',id).state,'ready');
});
test('Offline server and expired leases preserve jobs; failed jobs retry with backoff',t=>{
  const s=store(t); s.queue('key','creator',{test:1}); s.queue('key','creator',{test:1});
  const a=s.lease(1000),b=s.lease(181001); assert.equal(a.id,b.id); assert.notEqual(a.lease,b.lease);
  assert.equal(s.ack(a.id,a.lease,true),false);
  s.ack(b.id,b.lease,false,{},'Temporary outage',181002);
  assert.equal(s.lease(181003),null); assert.ok(s.lease(1000000));
  assert.equal(s.one('SELECT count(*) AS n FROM jobs').n,1);
});
test('Invalid whitelist acknowledgements roll back instead of accepting a member',t=>{
  const s=store(t),id=submit(s,'u',input(),0); decide(s,id,'staff',true); const j=s.lease();
  assert.throws(()=>s.ack(j.id,j.lease,true,{}),/UUID/);
  assert.equal(s.one('SELECT state FROM jobs WHERE id=?',j.id).state,'leased');
  assert.equal(s.one('SELECT state FROM applications WHERE id=?',id).state,'approved');
});
test('Applications, jobs and quota survive reopening the database',()=>{
  const dir=mkdtempSync(join(tmpdir(),'kind-test-')),path=join(dir,'db');
  try { let s=new Store(path); const id=submit(s,'u',input(),0); decide(s,id,'staff',true); takeQuota(s,100); s.close();
    s=new Store(path); assert.equal(s.one('SELECT state FROM applications WHERE id=?',id).state,'approved'); assert.ok(s.lease()); assert.equal(s.one('SELECT used FROM quota').used,1); s.close();
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
test('YouTube quotas are persisted and reset at Los Angeles midnight including DST',t=>{
  const s=store(t),date=new Date('2026-10-02T06:59:59Z');
  assert.equal(quotaDay(date),'2026-10-01');
  takeQuota(s,2,1,date); takeQuota(s,2,1,date); assert.throws(()=>takeQuota(s,2,1,date),/budget/);
  assert.equal(takeQuota(s,2,1,new Date('2026-10-02T07:00:00Z')),1);
  assert.equal(quotaDay(new Date('2026-12-02T07:59:59Z')),'2026-12-01');
});
test('Only fixed YouTube channel and video URL formats are accepted',()=>{
  assert.deepEqual(channelTarget('https://www.youtube.com/@KindCrafted'),{forHandle:'@KindCrafted'});
  assert.equal(videoId(`https://youtu.be/${video}`),video);
  assert.throws(()=>channelTarget('https://youtube.com.evil.test/@Kind'));
  assert.throws(()=>videoId('https://evil.test/watch?v='+video));
  assert.throws(()=>channelTarget('http://localhost/secret'));
});
test('Livestream transitions and Shorts detection keep categories distinct',()=>{
  const v={snippet:{title:'Hello #Shorts'},contentDetails:{duration:'PT3M'}};
  assert.equal(classify(v),'shorts');
  assert.equal(classify({...v,contentDetails:{duration:'PT3M1S'}}),'video');
  assert.equal(classify({...v,liveStreamingDetails:{scheduledStartTime:'now'}}),'scheduled');
  assert.equal(classify({...v,liveStreamingDetails:{actualStartTime:'now'}}),'live');
  assert.equal(classify({...v,liveStreamingDetails:{actualStartTime:'now',actualEndTime:'later'}}),'ended');
});
test('Feeds reject XML entities and accept only well formed channel/video IDs',()=>{
  assert.throws(()=>feedEntries('<!DOCTYPE foo><feed/>'));
  assert.deepEqual(feedEntries(`<feed><entry><yt:videoId>${video}</yt:videoId><yt:channelId>${channel}</yt:channelId></entry></feed>`),[{video,channel}]);
});
test('Verification requires channel ownership code and an approved member',async t=>{
  const s=store(t),c=config({}),yt=new YouTube(s,c); ready(s);
  yt.api=async()=>[{id:channel,snippet:{title:'Kind Channel',description:'',thumbnails:{}},statistics:{subscriberCount:'100',videoCount:'5'},contentDetails:{relatedPlaylists:{uploads:'UU'+'a'.repeat(22)}}}];
  await assert.rejects(()=>yt.begin('stranger','@Kind'),/approved/);
  const v=await yt.begin('u','@Kind'); assert.match(v.code,/^kind-smp-/);
  await assert.rejects(()=>yt.verify('u'),/Code not found/);
  s.run('UPDATE verifications SET next_check=0');
  const oldApi=yt.api; yt.api=async()=>{const [c]=await oldApi();c.snippet.description=v.code;return[c];};
  assert.equal(await yt.verify('u'),'Kind Channel');
  assert.equal(s.one('SELECT channel_id FROM creators').channel_id,channel);
  assert.equal(s.one('SELECT count(*) AS n FROM verifications').n,0);
});
test('Video announcements are deduplicated and do not backfill old uploads',t=>{
  const s=store(t),c=config({}),yt=new YouTube(s,c),now=Date.now();
  s.run('INSERT INTO creators(user_id,channel_id,uuid,minecraft_name,data,verified_at) VALUES (?,?,?,?,?,?)','u',channel,uuid,'Kind','{}',now);
  const v={id:video,snippet:{channelId:channel,channelTitle:'Kind',title:'Hello',publishedAt:new Date(now-100000).toISOString()},contentDetails:{duration:'PT5M'},status:{privacyStatus:'public'}};
  yt.recordVideo(v,now); assert.equal(s.one('SELECT count(*) AS n FROM posts').n,0);
  v.snippet.publishedAt=new Date(now+1000).toISOString(); yt.recordVideo(v,now); yt.recordVideo(v,now);
  assert.equal(s.one('SELECT count(*) AS n FROM posts').n,1);
  assert.equal(s.one('SELECT channel FROM posts').channel,c.shorts);
  v.liveStreamingDetails={scheduledStartTime:new Date(now+10000).toISOString()}; yt.recordVideo(v,now);
  v.liveStreamingDetails.actualStartTime=new Date(now).toISOString(); yt.recordVideo(v,now); yt.recordVideo(v,now);
  assert.equal(s.one('SELECT count(*) AS n FROM posts').n,3);
});
test('Weekly updates use cached statistics and do not repeat before seven days',async t=>{
  const s=store(t),c=config({}),yt=new YouTube(s,c); s.run('INSERT INTO creators(user_id,channel_id,uuid,minecraft_name,data,verified_at) VALUES (?,?,?,?,?,?)','u',channel,uuid,'Kind','{}',Date.now());
  let calls=0; yt.api=async resource=>{calls++; return resource==='channels' ? [{id:channel,snippet:{title:'Kind'},statistics:{subscriberCount:'30',videoCount:'4'},contentDetails:{relatedPlaylists:{uploads:'UUtest'}}}] : resource==='playlistItems' ? [{contentDetails:{videoId:video}}] : [{statistics:{likeCount:'19'}}];};
  await yt.refreshStats(); const j=s.lease(); assert.equal(j.payload.likes,19); assert.equal(j.payload.subscribers,30);
  await yt.refreshStats(); assert.equal(calls,3);
});
test('Discord form respects five-component limit and unknown server address is explicit',()=>{
  assert.equal(applicationForm('java').toJSON().components.length,5);
  assert.match(joining(config({})),/not added the server address/);
});
test('Signed notification updates reopen cached videos without repeated feed polling',t=>{
  const s=store(t),yt=new YouTube(s,config({}));
  s.run('INSERT INTO creators(user_id,channel_id,uuid,minecraft_name,data,verified_at) VALUES (?,?,?,?,?,?)','u',channel,uuid,'Kind','{}',Date.now());
  yt.ingest([{video,channel}]); s.run('UPDATE videos SET ended=1,checked=123');
  yt.ingest([{video,channel}]); assert.equal(s.one('SELECT ended FROM videos').ended,1);
  yt.ingest([{video,channel}],true); assert.equal(s.one('SELECT ended FROM videos').ended,0);
});
test('Offline approvals survive seven days and bot restart, while pending applicants are never whitelisted',()=>{
  const dir=mkdtempSync(join(tmpdir(),'kind-offline-')),path=join(dir,'db');
  try {
    const now=Date.now(); let s=new Store(path);
    const approved=submit(s,'accepted',input(),0,now);
    const pending=submit(s,'pending',input({username:'PendingPlayer'}),0,now);
    decide(s,approved,'staff',true,'',now); s.close();
    s=new Store(path);
    const job=s.lease(now+7*86400000);
    assert.equal(job.payload.applicationId,approved);
    s.ack(job.id,job.lease,true,{uuid},'',now+7*86400000);
    assert.equal(s.one('SELECT state FROM applications WHERE id=?',approved).state,'ready');
    assert.equal(s.one('SELECT notification_done FROM applications WHERE id=?',approved).notification_done,0);
    assert.equal(s.one('SELECT state FROM applications WHERE id=?',pending).state,'pending');
    assert.equal(s.lease(now+7*86400000),null); s.close();
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
test('Failed whitelist lookup retries within a minute and does not block another approved player',t=>{
  const s=store(t),now=Date.now();
  for(const [u,name] of [['one','PlayerOne'],['two','PlayerTwo']]) {
    const id=submit(s,u,input({username:name}),0,now); decide(s,id,'staff',true,'',now);
  }
  const first=s.lease(now); s.run('UPDATE jobs SET attempts=20 WHERE id=?',first.id);
  s.ack(first.id,first.lease,false,{},'Temporary lookup outage',now);
  const second=s.lease(now+1); assert.notEqual(first.id,second.id);
  s.ack(second.id,second.lease,true,{uuid},'',now+2);
  assert.equal(s.lease(now+59999),null);
  assert.equal(s.lease(now+60000).id,first.id);
});
