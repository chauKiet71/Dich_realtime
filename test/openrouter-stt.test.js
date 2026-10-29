import test from 'node:test';
import assert from 'node:assert/strict';
import { TranslationPipeline, pcmToWav, wavToPcm } from '../lib/pipeline.js';
import { createApp } from '../server.js';

const pcm=Buffer.alloc(9600);
const env={TRANSLATION_PROVIDER:'openrouter',OPENROUTER_API_KEY:'test-openrouter',GOOGLE_TTS_API_KEY:'test-google'};
const json=value=>new Response(JSON.stringify(value));
function fixture(config={}) {
  const calls=[];
  let openaiLoads=0;
  const pipeline=new TranslationPipeline({
    keyLoader:async()=>{openaiLoads++;throw new Error('OpenAI must not be loaded');},
    fetchImpl:async(url,options)=>{
      calls.push({url,options});
      if(url.endsWith('/audio/transcriptions'))return json({text:'Xin chào'});
      if(url.endsWith('/chat/completions'))return json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({sourceLanguage:'vi',targetLanguage:'zh',translation:'你好'})}}]});
      return json({audioContent:pcmToWav(pcm).toString('base64')});
    },
    ...config,
    env:{...env,...config.env},
  });
  return {pipeline,calls,openaiLoads:()=>openaiLoads};
}

test('OpenRouter selection transcribes and translates with its own key without loading OpenAI credentials',async()=>{
  const {pipeline,calls,openaiLoads}=fixture();
  const result=await pipeline.translate({pcm});
  assert.equal(openaiLoads(),0);
  assert.equal(pipeline.sttProvider,'OpenRouter');
  assert.equal(pipeline.sttModel,'openai/whisper-large-v3-turbo');
  assert.equal(calls.length,3);
  assert.equal(calls[0].url,'https://openrouter.ai/api/v1/audio/transcriptions');
  assert.equal(calls[1].url,'https://openrouter.ai/api/v1/chat/completions');
  for(const {options} of calls.slice(0,2)) {
    assert.equal(options.headers.Authorization,'Bearer test-openrouter');
    assert.equal(options.redirect,'error');
    assert.equal(options.headers['Content-Type'],'application/json');
  }
  const body=JSON.parse(calls[0].options.body);
  assert.equal(body.model,'openai/whisper-large-v3-turbo');
  assert.equal(body.input_audio.format,'wav');
  assert.equal(Object.hasOwn(body,'language'),false,'shared-device STT detects the source language');
  assert.deepEqual(wavToPcm(Buffer.from(body.input_audio.data,'base64')),pcm);
  assert.deepEqual(result.audio,pcm);
});

test('OpenRouter STT passes explicit room language and a configured STT model',async()=>{
  const {pipeline,calls}=fixture({env:{OPENROUTER_STT_MODEL:'openai/whisper-large-v3'}});
  await pipeline.translate({pcm,sourceLanguage:'vi'});
  const body=JSON.parse(calls[0].options.body);
  assert.equal(body.language,'vi');
  assert.equal(body.model,'openai/whisper-large-v3');
});

test('OpenRouter STT never substitutes an OpenAI or legacy router key when its key is missing',async()=>{
  const {pipeline,calls,openaiLoads}=fixture({env:{OPENROUTER_API_KEY:'',ROUTER_API_KEY:'legacy-secret'}});
  await assert.rejects(pipeline.credentials());
  assert.equal(openaiLoads(),0);
  assert.equal(calls.length,0);
});

test('OpenRouter STT authentication, credits and throttling errors stop before translation without provider fallback',async()=>{
  for(const [status,expected] of [[401,/khóa API nhận dạng/],[402,/hết số dư API/],[429,/giới hạn tốc độ/]]) {
    const calls=[];
    const {pipeline}=fixture({fetchImpl:async url=>{
      calls.push(url);
      return new Response(JSON.stringify({error:{code:status,message:'SECRET provider detail'}}),{status});
    }});
    await assert.rejects(pipeline.translate({pcm}),error=>{
      assert.equal(error.status,503);
      assert.match(error.message,/OpenRouter/);
      assert.match(error.message,expected);
      assert.doesNotMatch(error.message,/SECRET|OpenAI/);
      return true;
    });
    assert.deepEqual(calls,['https://openrouter.ai/api/v1/audio/transcriptions']);
    assert.equal(pipeline.active,0);
  }
});

test('unknown STT provider fails readiness before reading OpenAI credentials or making requests',async()=>{
  const {pipeline,calls,openaiLoads}=fixture({env:{STT_PROVIDER:'invalid'}});
  await assert.rejects(pipeline.credentials());
  assert.equal(openaiLoads(),0);
  assert.equal(calls.length,0);
});

test('hybrid health reports OpenRouter recognition without exposing credentials',async t=>{
  const {pipeline}=fixture();
  const app=createApp({env:{TRANSLATION_ENGINE:'hybrid'},pipeline});
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{app.closeAllConnections();app.close(resolve);}));
  const response=await fetch(`http://127.0.0.1:${app.address().port}/api/health`);
  const health=await response.json();
  assert.equal(health.configured,true);
  assert.equal(health.sttProvider,'OpenRouter');
  assert.equal(health.sttModel,'openai/whisper-large-v3-turbo');
  assert.doesNotMatch(JSON.stringify(health),/test-openrouter|test-google/);
});
