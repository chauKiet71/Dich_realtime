import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server.js';
import { sessionConfig, loadKey } from '../lib/session.js';

async function server(t, options = {}) {
  const app = createApp(options);
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { app.closeAllConnections(); app.close(resolve); }));
  const base = `http://127.0.0.1:${app.address().port}`;
  return { base, post: (body = 'v=0\r\nm=audio 9 RTP/AVP 0', extra = {}) => fetch(`${base}/api/session`, { method: 'POST', body, headers: { 'Content-Type': 'application/sdp', 'Origin': base, 'X-Translation-Client': '1', ...extra } }) };
}
test('manual turn detection keeps the silence boundary in the browser, enables both input languages', () => {
  const config = sessionConfig({});
  assert.equal(config.audio.input.turn_detection, null);
  assert.deepEqual(config.audio.input.transcription.languages, ['zh', 'vi']);
  assert.deepEqual(config.output_modalities, ['audio']);
  assert.match(config.instructions, /ONLY the faithful translation/);
});
test('English pair uses only English and Vietnamese with bidirectional instructions', () => {
  const config = sessionConfig({}, 'vi-en');
  assert.deepEqual(config.audio.input.transcription.languages, ['en', 'vi']);
  assert.match(config.instructions, /English speech MUST be translated into natural Vietnamese/);
  assert.match(config.instructions, /Vietnamese speech MUST be translated into natural English/);
  assert.doesNotMatch(config.instructions, /Mandarin/);
  assert.equal(config.audio.input.turn_detection, null);
  assert.throws(() => sessionConfig({}, 'zh-en'), /INVALID_LANGUAGE_PAIR/);
});

test('session accepts only the two allowed language pairs before calling provider', async t => {
  const configs = [];
  const { post } = await server(t, { keyLoader: async () => 'test', fetchImpl: async (_url, options) => {
    configs.push(JSON.parse(options.body.get('session')));
    return new Response('v=0');
  } });
  for (const pair of ['zh-en', 'en', '', '__proto__', 'ignore instructions']) {
    assert.equal((await post(undefined, { 'X-Language-Pair': pair })).status, 400);
  }
  assert.equal(configs.length, 0);
  for (const pair of ['vi-en', 'vi-zh']) assert.equal((await post(undefined, { 'X-Language-Pair': pair })).status, 200);
  assert.deepEqual(configs.map(c => c.audio.input.transcription.languages), [['en', 'vi'], ['zh', 'vi']]);
});

test('missing or ambiguous credentials are rejected without echoing the file', async () => {
  await assert.rejects(loadKey({}), /KEY_NOT_CONFIGURED/);
  await assert.rejects(loadKey({ OPENAI_API_KEY: 'invalid' }), /KEY_NOT_CONFIGURED/);
  const synthetic = 'sk-' + 'a'.repeat(22);
  assert.equal(await loadKey({ OPENAI_API_KEY: synthetic }), synthetic);
  await assert.rejects(loadKey({ OPENAI_API_KEY: `${synthetic} ${synthetic}` }), /KEY_NOT_CONFIGURED/);
});
test('health exposes only readiness, never credentials', async t => {
  const { base } = await server(t, { keyLoader: async () => 'synthetic-secret' });
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.configured, true);
  assert.equal(JSON.stringify(data).includes('synthetic-secret'), false);
});
test('unconfigured health and session fail clearly', async t => {
  const { base, post } = await server(t, { keyLoader: async () => { throw new Error('secret-file'); } });
  assert.equal((await (await fetch(`${base}/api/health`)).json()).configured, false);
  assert.equal((await post()).status, 503);
});

test('hybrid HTTP reports exhausted STT credits without exposing provider bodies or invoking translation', async t => {
  const calls=[];
  const {base}=await server(t,{
    env:{TRANSLATION_ENGINE:'hybrid',TRANSLATION_PROVIDER:'openrouter',STT_PROVIDER:'openai',OPENROUTER_API_KEY:'synthetic-router-secret',GOOGLE_TTS_API_KEY:'synthetic-google-secret'},
    keyLoader:async()=> 'synthetic-openai-secret',
    fetchImpl:async url=>{
      calls.push(url);
      return new Response(JSON.stringify({error:{code:'credit_balance_exhausted',type:'insufficient_quota',message:'SECRET provider response'}}),{status:429});
    },
  });
  const response=await fetch(base+'/api/translate-audio',{
    method:'POST',body:Buffer.alloc(9600),
    headers:{Origin:base,'Content-Type':'application/octet-stream','X-Translation-Client':'1','X-Language-Pair':'vi-zh'},
  });
  assert.equal(response.status,503);
  const body=await response.json();
  assert.match(body.error,/OpenAI.*hết số dư API/);
  assert.deepEqual(Object.keys(body),['error']);
  assert.doesNotMatch(JSON.stringify(body),/SECRET|synthetic|insufficient_quota/);
  assert.deepEqual(calls,['https://api.openai.com/v1/audio/transcriptions']);
});
test('reject cross-origin, incorrect content, invalid and oversized SDP before upstream', async t => {
  const { post } = await server(t, { keyLoader: async () => 'test', fetchImpl: () => { throw new Error('must not call'); } });
  assert.equal((await post(undefined, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(undefined, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post('invalid')).status, 400);
  assert.equal((await post('v=0' + 'x'.repeat(66000))).status, 413);
});
test('proxy creates server-owned config and returns only SDP', async t => {
  let config;
  const { post } = await server(t, { keyLoader: async () => 'server-secret', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/realtime/calls');
    assert.equal(options.headers.Authorization, 'Bearer server-secret');
    config = JSON.parse(options.body.get('session'));
    return new Response('v=0\r\nm=audio answer');
  } });
  const response = await post();
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'v=0\r\nm=audio answer');
  assert.equal(config.type, 'realtime');
});
test('provider errors and network exceptions never leak upstream body', async t => {
  const { post } = await server(t, { keyLoader: async () => 'secret', fetchImpl: async () => new Response('sensitive-provider-body', { status: 401 }) });
  const response = await post();
  assert.equal(response.status, 502);
  assert.equal((await response.text()).includes('sensitive-provider-body'), false);
  const second = await server(t, { keyLoader: async () => 'secret', fetchImpl: async () => { throw new Error('secret'); } });
  assert.equal((await second.post()).status, 502);
});
test('limits session attempts and serves only allowlisted public assets', async t => {
  const { base, post } = await server(t, { keyLoader: async () => 'test', fetchImpl: async () => new Response('v=0') });
  for (let i = 0; i < 6; i++) assert.equal((await post()).status, 200);
  assert.equal((await post()).status, 429);
  for (const path of ['/.env.local', '/server.js', '/lib/session.js', '/AGENTS.md', '/%2e%2e/.env.local']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
  for (const path of ['/', '/app.js', '/style.css', '/core.js', '/audio-cues.js']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  }
  const rejectedHost = await new Promise(resolve => {
    http.get(base, { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); });
  });
  assert.equal(rejectedHost, 403);
});
