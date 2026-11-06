const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, 'browser-extension/tidal-quick-queue/background.js'), 'utf8');

function background(response, httpOk = true) {
  const calls = [];
  let listener;
  vm.runInNewContext(source, {
    chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; } } } },
    fetch: async (url, options) => { calls.push({url,options}); return {ok:httpOk,json:async()=>response}; }
  });
  return { calls, send: message => new Promise(resolve => {
    assert.equal(listener(message, {}, resolve), true);
  }) };
}

test('extension forwards browser-extracted track data to the result endpoint', async () => {
  const bridge = background({success:true});
  const result = {requestId:'123',url:'https://music.amazon.com/user-playlists/example',success:true,type:'playlist',tracks:[{url:'https://music.amazon.com/tracks/B0HJZGSXZL'}]};
  const response = await bridge.send({type:'AMAZON_PLAYLIST_RESULT',result});
  assert.equal(response.ok,true);
  assert.equal(bridge.calls.length,1);
  assert.equal(bridge.calls[0].url,'http://127.0.0.1:43893/api/playlist/result');
  assert.deepEqual(JSON.parse(bridge.calls[0].options.body),result);
});

test('callback errors reach the page and never retry a rejected mutation', async () => {
  const bridge = background({success:false,error:'Expired import'},false);
  const response = await bridge.send({type:'AMAZON_PLAYLIST_RESULT',result:{requestId:'expired'}});
  assert.equal(response.ok,false);
  assert.equal(response.error,'Expired import');
  assert.equal(bridge.calls.length,1);
});
