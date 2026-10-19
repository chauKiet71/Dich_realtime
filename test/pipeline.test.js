import test from 'node:test';
import assert from 'node:assert/strict';
import { TranslationPipeline, pcmToWav, wavToPcm } from '../lib/pipeline.js';

const pcm = Buffer.alloc(9600);
const env = { ROUTER_API_KEY: 'test-router', GOOGLE_TTS_API_KEY: 'test-google' };
const json = value => new Response(JSON.stringify(value));
function fixture(sourceLanguage = 'vi', targetLanguage = 'zh', overrides = {}) {
  const calls = [];
  const pipeline = new TranslationPipeline({ env, keyLoader: async () => 'test-openai', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.includes('transcriptions')) return json({ text: 'Xin chào, tôi không mua 15 vé.' });
    if (url.includes('chat/completions')) return json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ sourceLanguage, targetLanguage, translation: '你好，我不买15张票。' }) } }] });
    return json({ audioContent: pcmToWav(pcm).toString('base64') });
  }, ...overrides });
  return { pipeline, calls };
}
test('one Gemini call normalizes and translates, then selects WaveNet by target language', async () => {
  for (const [source, target, pair, voice] of [['vi','zh','vi-zh','cmn-CN-Wavenet-A'],['zh','vi','vi-zh','vi-VN-Wavenet-A'],['vi','en','vi-en','en-US-Wavenet-D'],['en','vi','vi-en','vi-VN-Wavenet-A']]) {
    const { pipeline, calls } = fixture(source, target);
    const result = await pipeline.translate({ pcm, pair });
    assert.equal(result.sourceLanguage, source);
    assert.equal(result.targetLanguage, target);
    assert.deepEqual(result.audio, pcm);
    assert.equal(calls.length, 3);
    const chat = JSON.parse(calls[1].options.body);
    assert.equal(chat.model, 'gemini/gemini-3-flash-preview');
    assert.match(chat.messages[0].content, /negation/);
    assert.equal(chat.max_tokens, 2048);
    assert.equal(JSON.parse(calls[2].options.body).voice.name, voice);
    assert.equal(calls[2].options.headers['x-goog-api-key'], 'test-google');
  }
});
test('invalid PCM and language pair never reach providers', async () => {
  const { pipeline, calls } = fixture();
  for (const data of [Buffer.alloc(1), Buffer.alloc(100), Buffer.alloc(1440002)]) await assert.rejects(pipeline.translate({ pcm: data, pair:'vi-zh' }));
  await assert.rejects(pipeline.translate({ pcm, pair:'xx' }));
  assert.equal(calls.length, 0);
});
test('invalid language direction stops before TTS', async () => {
  const { pipeline, calls } = fixture('en','zh');
  await assert.rejects(pipeline.translate({ pcm, pair:'vi-zh' }));
  assert.equal(calls.length, 2);
});
test('provider errors are sanitized and do not fall back to another provider', async () => {
  const { pipeline } = fixture('vi','zh', { fetchImpl: async () => new Response('SECRET', {status:401}) });
  await assert.rejects(pipeline.translate({ pcm, pair:'vi-zh' }), error => !error.message.includes('SECRET'));
});
test('aborted requests never call providers', async () => {
  const { pipeline, calls } = fixture();
  await assert.rejects(pipeline.translate({ pcm, pair:'vi-zh', signal:AbortSignal.abort() }));
  assert.equal(calls.length,0);
});
test('WAV codec validates format and removes headers', () => {
  assert.deepEqual(wavToPcm(pcmToWav(pcm)), pcm);
  assert.throws(() => wavToPcm(Buffer.alloc(44)));
  const wav = pcmToWav(pcm); wav.writeUInt32LE(48000,24);
  assert.throws(() => wavToPcm(wav));
});
