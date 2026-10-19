import test from 'node:test';
import assert from 'node:assert/strict';
import { TranslationPipeline, pcmToWav, wavToPcm } from '../lib/pipeline.js';

const pcm = Buffer.alloc(9600);
const env = { ROUTER_API_KEY: 'test-router', GOOGLE_TTS_API_KEY: 'test-google' };
const json = value => new Response(JSON.stringify(value));
function throttled(statuses, retryAfter='3', sleep=async()=>{}) {
  const calls=[]; const waits=[];
  const pipeline=new TranslationPipeline({env,keyLoader:async()=> 'test',sleep:async(ms,signal)=>{waits.push(ms);await sleep(ms,signal);},fetchImpl:async(url)=>{
    calls.push(url);
    if(url.includes('transcriptions'))return json({text:'Xin chào'});
    if(url.includes('chat/completions')) {
      const status=statuses.shift() ?? 429;
      if(status!==200)return new Response('SECRET',{status,headers:retryAfter===null?{}:{'Retry-After':retryAfter}});
      return json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({sourceLanguage:'vi',targetLanguage:'zh',translation:'你好'})}}]});
    }
    return json({audioContent:pcmToWav(pcm).toString('base64')});
  }});
  return {pipeline,calls,waits};
}
test('429 waits Retry-After and retries only translation at most twice',async()=>{
  const {pipeline,calls,waits}=throttled([429,429,200]);
  await pipeline.translate({pcm,pair:'vi-zh'});
  assert.deepEqual(waits,[3000,3000]);
  assert.equal(calls.filter(u=>u.includes('transcriptions')).length,1);
  assert.equal(calls.filter(u=>u.includes('chat/completions')).length,3);
  assert.equal(calls.filter(u=>u.includes('text:synthesize')).length,1);
});
test('exhausted 429 stays 429 with safe code and source, no TTS',async()=>{
  const {pipeline,calls,waits}=throttled([429,429,429],null);
  await assert.rejects(pipeline.translate({pcm,pair:'vi-zh'}),e=>e.status===429 && e.code==='ROUTER_RATE_LIMITED' && e.source==='Xin chào' && !e.message.includes('SECRET'));
  assert.deepEqual(waits,[2000,4000]);assert.equal(calls.length,4);assert.equal(pipeline.active,0);
});
test('long Retry-After is not retried early, and non-429 is never retried',async()=>{
  for(const [status,header] of [[429,'120'],[401,'3'],[500,'3']]) {
    const {pipeline,calls,waits}=throttled([status],header);
    await assert.rejects(pipeline.translate({pcm,pair:'vi-zh'}));
    assert.equal(calls.length,2);assert.equal(waits.length,0);
  }
});
test('abort while waiting prevents another paid request',async()=>{
  const aborter=new AbortController();
  const {pipeline,calls}=throttled([429,200],'3',async(_ms,signal)=>{aborter.abort();signal.throwIfAborted();});
  await assert.rejects(pipeline.translate({pcm,pair:'vi-zh',signal:aborter.signal}));
  assert.equal(calls.length,2);assert.equal(pipeline.active,0);
});
test('HTTP-date Retry-After is honored; wait budget stops before retrying early',async()=>{
  const date='Mon, 19 Oct 2026 12:00:05 GMT';
  const f=throttled([429,200],date);f.pipeline.now=()=>Date.parse('Mon, 19 Oct 2026 12:00:00 GMT');
  await f.pipeline.translate({pcm,pair:'vi-zh'});assert.deepEqual(f.waits,[5000]);
  const g=throttled([429,429,200],'11');
  await assert.rejects(g.pipeline.translate({pcm,pair:'vi-zh'}),e=>e.status===429);
  assert.deepEqual(g.waits,[11000]);assert.equal(g.calls.length,3);
});
test('real backoff timer cancels immediately on stop',async()=>{
  const controller=new AbortController();
  const {pipeline,calls}=throttled([429,200]);
  // Use production timer rather than the injected instant test sleeper.
  const {sleep}=new TranslationPipeline({env,keyLoader:async()=> 'test'});pipeline.sleep=sleep;
  await assert.rejects(pipeline.translate({pcm,pair:'vi-zh',signal:controller.signal,onRetry:()=>{setTimeout(()=>controller.abort(),10);}}));
  assert.equal(calls.length,2);
});
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
test('missing keys and unsafe router URLs fail readiness', async () => {
  for (const config of [{}, {...env,ROUTER_BASE_URL:'http://example.com/v1'}, {...env,ROUTER_BASE_URL:'https://user:pass@example.com/v1'}]) {
    const {pipeline}=fixture('vi','zh',{env:config});
    await assert.rejects(pipeline.credentials());
  }
});
test('pipeline enforces concurrency and hourly quotas before provider calls', async () => {
  const {pipeline,calls}=fixture();
  pipeline.active=4;
  await assert.rejects(pipeline.translate({pcm,pair:'vi-zh'}),e=>e.status===429);
  pipeline.active=0; pipeline.attempts=Array(600).fill(Date.now());
  await assert.rejects(pipeline.translate({pcm,pair:'vi-zh'}),e=>e.status===429);
  assert.equal(calls.length,0);
});
test('truncated Gemini responses and empty transcripts never reach TTS', async () => {
  for (const mode of ['empty','length','oversize']) {
    let count=0;
    const {pipeline}=fixture('vi','zh',{fetchImpl:async url=>{
      count++;
      if (url.includes('transcriptions')) return json({text:mode==='empty'?'':mode==='oversize'?'x'.repeat(70000):'Xin chào'});
      return json({choices:[{finish_reason:'length',message:{content:'{}'}}]});
    }});
    await assert.rejects(pipeline.translate({pcm,pair:'vi-zh'}));
    assert.ok(count<=2);
    assert.equal(pipeline.active,0);
  }
});
