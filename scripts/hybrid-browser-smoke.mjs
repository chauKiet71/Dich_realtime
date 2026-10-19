import assert from 'node:assert/strict';
import { createApp } from '../server.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const calls=[];
const pipeline={model:'gemini-test',credentials:async()=>({}),translate:async data=>{
  calls.push(data); await new Promise(r=>setTimeout(r,1400));
  return {source:'Xin chào',translation:'Hello',sourceLanguage:'vi',targetLanguage:'en',audio:Buffer.alloc(48000)};
}};
const app=createApp({env:{TRANSLATION_ENGINE:'hybrid'},pipeline});
await new Promise(r=>app.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${app.address().port}`;
let browser;
try {
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
  const context=await browser.newContext({permissions:['microphone'],viewport:{width:390,height:844}});
  await context.addInitScript(()=>{
    window.tracks=[]; window.playEvents=[];
    const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async(...args)=>{const s=await get(...args); window.tracks.push(...s.getTracks());return s;};
    AudioContext.prototype.createMediaStreamSource=function(){
      const oscillator=this.createOscillator(),gain=this.createGain();
      gain.gain.value=0; oscillator.connect(gain); oscillator.start(); window.synthetic=gain; return gain;
    };
    const create=AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource=function(){
      const source=create.call(this),start=source.start.bind(source);
      source.start=(...args)=>{window.playEvents.push({mic:window.tracks.some(t=>t.enabled)});return start(...args);};return source;
    };
    const original=window.fetch;
    window.fetch=(url,...args)=>{if(url==='/api/translate-audio')window.commitAt=performance.now();return original(url,...args);};
  });
  const page=await context.newPage(); const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);
  await page.locator('#choose-single').click();
  await page.locator('[data-pair="vi-en"]').click();
  await page.locator('#begin-conversation').click();
  await page.waitForFunction(()=>window.tracks.length && window.tracks.every(t=>t.enabled));
  await page.evaluate(()=>{
    window.synthetic.gain.value=.1;
    setTimeout(()=>{window.synthetic.gain.value=0;window.silenceAt=performance.now();},800);
  });
  await page.waitForFunction(()=>window.commitAt);
  const latency=await page.evaluate(()=>window.commitAt-window.silenceAt);
  assert.ok(latency>=550 && latency<1200,`700ms commit window: ${latency}`);
  assert.equal(await page.evaluate(()=>window.tracks.every(t=>!t.enabled)),true);
  await page.waitForFunction(()=>document.querySelector('#target-text').textContent==='Hello');
  await page.waitForFunction(()=>window.tracks.every(t=>t.enabled));
  assert.equal(calls.length,1); assert.equal(calls[0].pair,'vi-en');
  assert.ok(calls[0].pcm.length>=9600);
  assert.equal(await page.evaluate(()=>window.playEvents.every(e=>!e.mic)),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#start').click();
  assert.equal(await page.evaluate(()=>window.tracks.every(t=>t.readyState==='ended')),true);
  assert.deepEqual(errors,[]);
  console.log(`PASS hybrid browser: microphone capture, ${Math.round(latency)}ms silence commit, translation playback, cue mic isolation, resume, stop, mobile layout. Providers mocked.`);
} finally {await browser?.close();await new Promise(r=>{app.closeAllConnections();app.close(r);});}
