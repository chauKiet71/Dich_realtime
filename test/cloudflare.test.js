import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TranslationPipeline, pcmToWav } from '../lib/pipeline.js';
import { createApp } from '../server.js';

const pcm = Buffer.alloc(9600);
const account = 'a'.repeat(32);
const base = `https://api.cloudflare.com/client/v4/accounts/${account}/ai`;
const env = {
  TRANSLATION_ENGINE: 'hybrid', TRANSLATION_PROVIDER: 'cloudflare',
  CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: 'synthetic-cloudflare-token',
  GOOGLE_TTS_API_KEY: 'synthetic-google-key',
};
const json = value => new Response(JSON.stringify(value));
const completion = (sourceLanguage = 'vi', targetLanguage = 'zh') => ({
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ sourceLanguage, targetLanguage, translation: 'Bản dịch mẫu' }) } }],
});
function fixture({ config = {}, source = 'vi', target = 'zh', respond, sleep = async () => {} } = {}) {
  const calls = [], waits = [];
  let openaiLoads = 0;
  const pipeline = new TranslationPipeline({
    env: { ...env, ...config },
    keyLoader: async () => { openaiLoads++; throw new Error('OpenAI must not be loaded'); },
    sleep: async (ms, signal) => { waits.push(ms); await sleep(ms, signal); },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const custom = await respond?.(url, options, calls.length);
      if (custom) return custom;
      if (url.includes('/run/')) return json({ success: true, result: { text: 'Tôi không mua 15 vé.' } });
      if (url.endsWith('/chat/completions')) return json(completion(source, target));
      return json({ audioContent: pcmToWav(pcm).toString('base64') });
    },
  });
  return { pipeline, calls, waits, get openaiLoads() { return openaiLoads; } };
}

test('Cloudflare transcribes the original audio and translates both language pairs without OpenAI or OpenRouter', async () => {
  for (const [source, target, pair, voice] of [
    ['vi', 'zh', 'vi-zh', 'cmn-CN-Wavenet-A'], ['zh', 'vi', 'vi-zh', 'vi-VN-Wavenet-A'],
    ['vi', 'en', 'vi-en', 'en-US-Wavenet-D'], ['en', 'vi', 'vi-en', 'vi-VN-Wavenet-A'],
  ]) {
    const f = fixture({ source, target });
    const result = await f.pipeline.translate({ pcm, pair });
    assert.equal(f.openaiLoads, 0);
    assert.equal(f.pipeline.provider, 'Cloudflare');
    assert.deepEqual([result.sourceLanguage, result.targetLanguage], [source, target]);
    assert.deepEqual(result.audio, pcm);
    assert.equal(f.calls.length, 3);
    const [stt, chat, tts] = f.calls;
    assert.equal(stt.url, `${base}/run/@cf/openai/whisper-large-v3-turbo`);
    assert.equal(stt.options.headers.Authorization, 'Bearer synthetic-cloudflare-token');
    const audioInput = JSON.parse(stt.options.body);
    assert.equal(audioInput.task, 'transcribe');
    assert.equal('language' in audioInput, false, 'one-device mode must detect the spoken language');
    assert.deepEqual(Buffer.from(audioInput.audio, 'base64'), pcmToWav(pcm));
    assert.equal(chat.url, `${base}/v1/chat/completions`);
    assert.equal(chat.options.headers.Authorization, stt.options.headers.Authorization);
    const body = JSON.parse(chat.options.body);
    assert.equal(body.model, '@cf/qwen/qwen3-30b-a3b-fp8');
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.equal(body.stream, false);
    assert.equal('reasoning' in body, false, 'OpenRouter-only options must not be forwarded');
    assert.match(body.messages[0].content, /negation/);
    assert.match(body.messages[0].content, /\/no_think/);
    assert.equal(body.messages[1].content, 'Tôi không mua 15 vé.');
    assert.equal(JSON.parse(tts.options.body).voice.name, voice);
    assert.equal(tts.options.headers['x-goog-api-key'], 'synthetic-google-key');
    assert.ok(f.calls.every(call => call.options.redirect === 'error'));
  }
});

test('Cloudflare room speech uses the selected source language and configurable translation model', async () => {
  const f = fixture({ source: 'zh', target: 'vi', config: { CLOUDFLARE_TRANSLATE_MODEL: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' } });
  await f.pipeline.translate({ pcm, pair: 'vi-zh', sourceLanguage: 'zh' });
  assert.equal(JSON.parse(f.calls[0].options.body).language, 'zh');
  const body = JSON.parse(f.calls[1].options.body);
  assert.equal(body.model, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.match(body.messages[0].content, /source must be zh/);
});

test('Cloudflare readiness rejects missing credentials and injected account/model paths before sending data', async () => {
  for (const config of [
    { CLOUDFLARE_ACCOUNT_ID: '' }, { CLOUDFLARE_ACCOUNT_ID: '../other-account?x=1' },
    { CLOUDFLARE_API_TOKEN: '' }, { CLOUDFLARE_API_TOKEN: 'token\nsecond-token' },
    { CLOUDFLARE_TRANSLATE_MODEL: '@cf/../../other-account?x=1' },
    { GOOGLE_TTS_API_KEY: '' },
  ]) {
    const f = fixture({ config: { ...config, OPENROUTER_API_KEY: 'old-openrouter', ROUTER_API_KEY: 'old-router' } });
    await assert.rejects(f.pipeline.credentials());
    assert.equal(f.openaiLoads, 0);
    assert.equal(f.calls.length, 0);
  }
});

test('Cloudflare accepts a server-side token file but rejects a file containing multiple tokens', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cloudflare-pipeline-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'token.txt');
  await writeFile(path, 'synthetic-cloudflare-token\n');
  const f = fixture({ config: { CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_API_TOKEN_FILE: path } });
  await f.pipeline.translate({ pcm });
  assert.equal(f.calls[0].options.headers.Authorization, 'Bearer synthetic-cloudflare-token');
  await writeFile(path, 'first-token\nsecond-token');
  await assert.rejects(f.pipeline.credentials());
});

test('Cloudflare accepts labeled account/token files without copying secrets into environment files', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cloudflare-labeled-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'credentials.txt');
  await writeFile(path, `Get Account ID: ${account}\r\nGet API Token: synthetic-cloudflare-token\r\n`);
  const f = fixture({ config: { CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_API_TOKEN_FILE: path } });
  await f.pipeline.translate({ pcm });
  assert.equal(f.calls[0].options.headers.Authorization, 'Bearer synthetic-cloudflare-token');
  await writeFile(path, 'API Token: first-token\nAPI Token: second-token');
  await assert.rejects(f.pipeline.credentials());
});

test('Cloudflare errors stop the chain and never expose provider bodies or use another provider', async () => {
  for (const stage of ['stt', 'translation']) {
    const f = fixture({ respond: async url => (stage === 'stt' ? url.includes('/run/') : url.endsWith('/chat/completions'))
      ? new Response('SECRET-CLOUDFLARE-DETAILS', { status: 401 }) : undefined });
    await assert.rejects(f.pipeline.translate({ pcm }), error => error.status === 502 && error.message.includes('Cloudflare') && !error.message.includes('SECRET'));
    assert.equal(f.calls.length, stage === 'stt' ? 1 : 2);
    assert.equal(f.openaiLoads, 0);
    assert.equal(f.pipeline.active, 0);
  }
});

test('unsuccessful, empty, oversized and invalid Cloudflare responses never reach Google TTS', async () => {
  for (const value of [
    { success: false, errors: [{ message: 'SECRET' }], result: { text: 'must not continue' } },
    { success: true, result: { text: '' } },
    { success: true, result: { text: 'x'.repeat(12001) } },
    { success: true, result: null },
  ]) {
    const f = fixture({ respond: async url => url.includes('/run/') ? json(value) : undefined });
    await assert.rejects(f.pipeline.translate({ pcm }));
    assert.equal(f.calls.length, 1);
  }
  for (const value of [completion('en', 'zh'), { choices: [{ finish_reason: 'length', message: { content: '{}' } }] }, { choices: [] }]) {
    const f = fixture({ respond: async url => url.endsWith('/chat/completions') ? json(value) : undefined });
    await assert.rejects(f.pipeline.translate({ pcm, pair: 'vi-zh' }));
    assert.equal(f.calls.length, 2);
  }
});

test('Cloudflare retries a throttled stage without repeating completed speech recognition', async () => {
  for (const stage of ['stt', 'translation']) {
    let attempts = 0;
    const f = fixture({ respond: async url => {
      if ((stage === 'stt' ? url.includes('/run/') : url.endsWith('/chat/completions')) && attempts++ === 0) {
        return new Response('SECRET', { status: 429, headers: { 'Retry-After': '2' } });
      }
    } });
    await f.pipeline.translate({ pcm });
    assert.deepEqual(f.waits, [2000]);
    assert.equal(f.calls.filter(call => call.url.includes('/run/')).length, stage === 'stt' ? 2 : 1);
    assert.equal(f.calls.filter(call => call.url.endsWith('/chat/completions')).length, stage === 'translation' ? 2 : 1);
    assert.equal(f.calls.length, 4);
  }
});

test('exhausted Cloudflare throttling and cancellation never proceed to another paid stage', async () => {
  for (const stage of ['stt', 'translation']) {
    const f = fixture({ respond: async url => (stage === 'stt' ? url.includes('/run/') : url.endsWith('/chat/completions'))
      ? new Response('SECRET', { status: 429, headers: { 'Retry-After': '1' } }) : undefined });
    await assert.rejects(f.pipeline.translate({ pcm }), error => error.status === 429 && error.code === 'ROUTER_RATE_LIMITED'
      && error.message.includes('Cloudflare') && (stage === 'stt' ? !error.source : error.source === 'Tôi không mua 15 vé.'));
    assert.equal(f.calls.length, stage === 'stt' ? 3 : 4);
    assert.equal(f.pipeline.active, 0);
  }
  const controller = new AbortController();
  const f = fixture({ respond: async () => new Response('SECRET', { status: 429 }), sleep: async (_ms, signal) => { controller.abort(); signal.throwIfAborted(); } });
  await assert.rejects(f.pipeline.translate({ pcm, signal: controller.signal }));
  assert.equal(f.calls.length, 1);
});

test('HTTP Cloudflare pipeline is ready without OpenAI, translates audio, and never exposes credentials', async t => {
  const f = fixture();
  const app = createApp({ env, pipeline: f.pipeline });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { app.closeAllConnections(); app.close(resolve); }));
  const origin = `http://127.0.0.1:${app.address().port}`;
  const ready = await fetch(`${origin}/healthz`);
  assert.equal(ready.status, 200);
  const health = await (await fetch(`${origin}/api/health`)).json();
  assert.equal(health.configured, true);
  assert.equal(health.provider, 'Cloudflare');
  assert.equal(health.sttProvider, 'Cloudflare');
  assert.equal(health.sttModel, '@cf/openai/whisper-large-v3-turbo');
  assert.equal(health.model, '@cf/qwen/qwen3-30b-a3b-fp8');
  assert.equal(JSON.stringify(health).includes('synthetic-'), false);
  const res = await fetch(`${origin}/api/translate-audio`, { method: 'POST', headers: {
    Origin: origin, 'X-Translation-Client': '1', 'X-Language-Pair': 'vi-zh', 'Content-Type': 'application/octet-stream',
  }, body: pcm });
  assert.equal(res.status, 200);
  const result = await res.json();
  assert.deepEqual(Buffer.from(result.audio, 'base64'), pcm);
  assert.equal(result.targetLanguage, 'zh');
  assert.equal(f.openaiLoads, 0);
});
