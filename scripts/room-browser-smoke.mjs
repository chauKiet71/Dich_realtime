// Optional browser check. PLAYWRIGHT_MODULE may point at a preinstalled Playwright entry.
import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const providers = [];
class Provider extends EventEmitter {
  constructor() { super(); this.readyState = 1; this.bufferedAmount = 0; this.bytes = 0; providers.push(this); queueMicrotask(() => this.emit('open')); }
  event(e) { this.emit('message', Buffer.from(JSON.stringify(e))); }
  send(raw) {
    const e = JSON.parse(raw);
    if (e.type === 'session.update') queueMicrotask(() => this.event({ type: 'session.updated' }));
    if (e.type === 'input_audio_buffer.append') this.bytes += Buffer.from(e.audio, 'base64').length;
    if (e.type === 'response.create') {
      this.event({ type: 'input_audio_buffer.committed', item_id: 'test-item' });
      this.event({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'test-item', transcript: 'Xin chào / 你好' });
      const pcm = Buffer.alloc(24000 * 2);
      for (let i = 0; i < 24000; i++) pcm.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / 24000) * 1000), i * 2);
      this.event({ type: 'response.output_audio.delta', delta: pcm.toString('base64') });
      this.event({ type: 'response.output_audio_transcript.done', transcript: 'Bản dịch thử nghiệm / 测试翻译' });
      this.event({ type: 'response.done', response: { status: 'completed' } });
    }
  }
  close() { this.readyState = 3; }
}
const app = createApp({ env: {}, keyLoader: async () => 'mock-only', providerFactory: () => new Provider() });
await new Promise(r => app.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${app.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const contexts = await Promise.all([browser.newContext({ permissions: ['microphone'], viewport: { width: 390, height: 844 } }), browser.newContext({ permissions: ['microphone'] })]);
  const errors = [];
  for (const context of contexts) await context.addInitScript(() => {
    window.audioStarts = 0; window.liveTracks = [];
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      window.roomContext = this;
      const source = create.call(this), start = source.start.bind(source);
      source.start = (...args) => { window.audioStarts++; if (window.blockPlayback) { window.blockPlayback = false; void this.suspend(); } return start(...args); }; return source;
    };
    const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (...args) => { const stream = await get(...args); window.liveTracks.push(...stream.getTracks()); return stream; };
  });
  const a = await contexts[0].newPage(), b = await contexts[1].newPage();
  for (const p of [a, b]) p.on('pageerror', e => errors.push(e.message));
  await a.goto(base + '/room'); await a.locator('#create').click();
  await a.locator('#invite-link').waitFor({ state: 'visible' });
  const invitation = await a.locator('#invite-link').inputValue();
  // Sharing the invite usually backgrounds the tab; waiting must remain safe and open.
  await a.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;
  });
  assert.equal(await a.locator('#call').isVisible(), true);
  await b.goto(invitation); await b.locator('#join').click();
  for (const p of [a, b]) await p.waitForFunction(() => !document.querySelector('#speak').disabled);
  assert.equal(new URL(b.url()).hash, '');
  assert.equal(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await a.evaluate(() => window.liveTracks.every(t => !t.enabled)), true);
  await a.screenshot({ path: 'artifacts/room-mobile.png', fullPage: true });
  for (const [sender, listener, index] of [[a, b, 0], [b, a, 1]]) {
    if (index === 0) await listener.evaluate(() => { window.blockPlayback = true; });
    await sender.locator('#speak').click();
    await sender.waitForFunction(() => document.querySelector('#status').textContent.includes('Đang nghe'));
    await sender.waitForTimeout(800);
    assert.equal(await listener.locator('#speak').isDisabled(), true);
    await sender.locator('#speak').click();
    await listener.waitForFunction(() => window.audioStarts >= 1);
    if (index === 0) {
      await listener.locator('#resume').waitFor({ state: 'visible' });
      await listener.waitForTimeout(1200);
      assert.equal(await sender.locator('#speak').isDisabled(), true);
      await listener.locator('#resume').click();
    }
    await sender.waitForFunction(() => document.querySelector('#status').textContent.includes('Sẵn sàng'));
    assert.ok(providers[index].bytes >= 9600);
    assert.equal(await sender.evaluate(() => window.liveTracks.every(t => !t.enabled)), true);
  }
  assert.equal(await a.evaluate(() => window.audioStarts), 1);
  assert.equal(await b.evaluate(() => window.audioStarts), 1);
  assert.match(await b.locator('#translation').textContent(), /测试翻译/);
  await b.locator('#leave').click();
  await a.locator('#setup').waitFor({ state: 'visible' });
  for (const p of [a, b]) assert.equal(await p.evaluate(() => window.liveTracks.every(t => t.readyState === 'ended')), true);
  assert.deepEqual(errors, []);
  console.log('PASS: two isolated browsers, real AudioWorklet microphone capture, PCM playback both directions, turn lock, mobile layout, leave cleanup; provider mocked.');
} finally { await browser?.close(); await new Promise(r => { app.closeAllConnections(); app.close(r); }); }
