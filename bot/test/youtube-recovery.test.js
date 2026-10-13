import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.js';
import {YouTube} from '../src/youtube.js';
import {config} from '../src/config.js';
function fixture(t) {
 const s=new Store(':memory:');t.after(()=>s.close());const yt=new YouTube(s,config({}));
 for(const id of ['a','b']) s.run('INSERT INTO creators(user_id,channel_id,uuid,minecraft_name,data,verified_at) VALUES (?,?,?,?,?,?)',id,id,id,id,JSON.stringify({uploadPlaylistId:'UU'+id,likes:55}),1);
 return {s,yt};
}
const channel=id=>({id,snippet:{title:id},statistics:{subscriberCount:'123',videoCount:'2'},contentDetails:{relatedPlaylists:{uploads:'UU'+id}}});
const missing=()=>Object.assign(new Error('YouTube request failed (playlistNotFound).'),{reason:'playlistNotFound'});
test('Unavailable playlist retains likes, updates other stats, and does not block healthy channels',async t=>{
 const {s,yt}=fixture(t);let calls=0;
 yt.api=async(resource,p)=>{calls++;if(resource==='channels')return [channel('a'),channel('b')];if(resource==='playlistItems'){if(p.playlistId==='UUa')throw missing();return [{contentDetails:{videoId:'video'}}];}return [{statistics:{likeCount:'99'}}];};
 await yt.refreshStats();
 assert.equal(JSON.parse(s.one("SELECT data FROM creators WHERE user_id='a'").data).likes,55);
 assert.equal(JSON.parse(s.one("SELECT data FROM creators WHERE user_id='a'").data).subscribers,123);
 assert.equal(JSON.parse(s.one("SELECT data FROM creators WHERE user_id='b'").data).likes,99);
 assert.equal(s.one('SELECT count(*) AS n FROM jobs').n,2);
 const before=calls;await yt.refreshStats();assert.equal(calls,before);
 assert.equal(s.one('SELECT count(*) AS n FROM posts').n,1);
});
test('Feed fallback re-resolves a stale playlist ID and uses the corrected ID',async t=>{
 const {s,yt}=fixture(t);const calls=[];
 yt.api=async(r,p)=>{calls.push([r,p]);if(r==='channels')return [{...channel('a'),contentDetails:{relatedPlaylists:{uploads:'UUnew'}}}];if(p.playlistId==='UUa')throw missing();return [{contentDetails:{videoId:'abcdefghijk'}}];};
 const items=await yt.uploads('a','UUa');assert.equal(items.length,1);assert.equal(calls.length,3);
 assert.equal(JSON.parse(s.one("SELECT data FROM creators WHERE user_id='a'").data).uploadPlaylistId,'UUnew');
});
test('Zero public uploads avoids playlist requests without treating other failures as empty',async t=>{
 const {yt}=fixture(t);yt.api=async()=>{throw new Error('Unexpected request');};
 assert.deepEqual(await yt.uploads('a','UUa',{...channel('a'),statistics:{videoCount:'0'}}),[]);
 await assert.rejects(()=>yt.uploads('a','UUa'),/Unexpected request/);
});
test('Stats retry isolates temporary failures without overwriting cached values',async t=>{
 const {s,yt}=fixture(t);yt.api=async(r,p)=>{if(r==='channels')return [channel('a'),channel('b')];if(p.playlistId==='UUa')throw new Error('Temporary outage');return [];};
 await yt.refreshStats();assert.equal(s.one("SELECT refreshed FROM creators WHERE user_id='a'").refreshed,0);assert.ok(s.one("SELECT refreshed FROM creators WHERE user_id='b'").refreshed>0);
 assert.ok(s.get('statsRetry:a')>Date.now());
});
test('Unavailable feed playlist shares backoff and does not create repeated alerts',async t=>{
 const {s,yt}=fixture(t);yt.fetch=async()=>({ok:false,status:404});let calls=0;
 yt.api=async(r,p)=>{calls++;if(r==='channels')return [channel(p.id)];throw missing();};
 await yt.feeds();const before=calls;await yt.feeds();assert.equal(calls,before);assert.equal(s.one('SELECT count(*) AS n FROM posts').n,2);
 s.set('feedFallback:a',0);s.set('feedFallback:b',0);await yt.feeds();assert.equal(calls,before);assert.equal(s.one('SELECT count(*) AS n FROM posts').n,2);
});
test('Alert suppression survives new service instances; a recovered issue can alert again',t=>{
 const {s,yt}=fixture(t);yt.reportIssue('stats','Outage');new YouTube(s,config({})).reportIssue('stats','Outage');assert.equal(s.one('SELECT count(*) AS n FROM posts').n,1);
 yt.reportIssue('stats',null);yt.reportIssue('stats','Outage');assert.equal(s.one('SELECT count(*) AS n FROM posts').n,2);
});
test('Playlist recovery clears stale likes and returns to weekly scheduling',async t=>{
 const {s,yt}=fixture(t);s.set('likesStale:a',true);s.set('playlistRetry:a',0);s.set('statsRetry:a',0);
 yt.api=async r=>r==='channels'?[channel('a'),channel('b')]:[];
 await yt.refreshStats();assert.equal(s.get('likesStale:a'),false);assert.equal(s.get('statsRetry:a'),0);assert.equal(JSON.parse(s.one("SELECT data FROM creators WHERE user_id='a'").data).likes,0);
});
