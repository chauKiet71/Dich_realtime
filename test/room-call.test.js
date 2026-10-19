import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import WebSocket from 'ws';
import http from 'node:http';
import { createApp } from '../server.js';
import { RoomHub, roomSessionConfig } from '../lib/rooms.js';

export class FakeProvider extends EventEmitter {
  constructor() { super(); this.readyState = 1; this.bufferedAmount = 0; this.sent = []; queueMicrotask(() => this.emit('open')); }
  send(raw) {
    const msg = JSON.parse(raw); this.sent.push(msg);
    if (msg.type === 'session.update') queueMicrotask(() => this.event({ type: 'session.updated' }));
  }
  event(event) { this.emit('message', Buffer.from(JSON.stringify(event))); }
  close() { this.readyState = 3; }
}
async function fixture(t, overrides = {}) {
  const providers = [];
  const app = createApp({ env: {}, keyLoader: async () => 'test-only', providerFactory: () => { const p = new FakeProvider(); providers.push(p); return p; }, ...overrides });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.address().port}`;
  const clients = [];
  t.after(async () => { for (const c of clients) c.terminate(); await new Promise(resolve => { app.closeAllConnections(); app.close(resolve); }); });
  const post = async (path, data) => (await fetch(base + path, { method: 'POST', headers: { Origin: base, 'X-Translation-Client': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json();
  async function connect(credentials) {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/api/room/socket', { origin: base }); clients.push(ws);
    ws.messages = [];
    ws.on('message', (raw, binary) => ws.messages.push(binary ? { type: 'audio', raw } : JSON.parse(raw.toString())));
    await once(ws, 'open'); ws.send(JSON.stringify({ type: 'attach', roomId: credentials.roomId, token: credentials.token }));
    return ws;
  }
  return { base, providers, post, connect };
}
async function waitFor(check) {
  const deadline = Date.now() + 2500;
  while (!check()) { if (Date.now() > deadline) throw new Error('Timed out waiting for event'); await new Promise(r => setTimeout(r, 5)); }
}
const command = (ws, type, extra = {}) => ws.send(JSON.stringify({ type, ...extra }));
async function pair(t, options) {
  const f = await fixture(t, options);
  const a = await f.post('/api/rooms', { language: 'vi' });
  const b = await f.post('/api/rooms/join', { roomId: a.roomId, invite: a.invite });
  const wa = await f.connect(a), wb = await f.connect(b);
  await waitFor(() => wa.messages.some(m => m.phase === 'ready') && wb.messages.some(m => m.phase === 'ready'));
  return { ...f, a, b, wa, wb };
}

test('two-way audio only reaches the listener; turn stays locked until actual playback acknowledgement', async t => {
  const { wa, wb, providers, a, b } = await pair(t);
  for (const [sender, listener, provider, who] of [[wa, wb, providers[0], a], [wb, wa, providers[1], b]]) {
    if (sender === wa) command(sender, 'speak');
    await waitFor(() => sender.messages.filter(m => m.type === 'state').at(-1)?.phase === 'listening');
    const state = sender.messages.filter(m => m.type === 'state').at(-1);
    const turnId = state.turnId;
    assert.equal(state.speaker, who.memberId);
    command(listener, 'speak');
    await waitFor(() => listener.messages.at(-1)?.type === 'error');
    listener.send(Buffer.alloc(4800));
    await waitFor(() => listener.messages.at(-1)?.message.includes('Micro'));
    sender.send(Buffer.alloc(9600)); command(sender, 'commit');
    await waitFor(() => provider.sent.some(e => e.type === 'response.create'));
    provider.event({ type: 'input_audio_buffer.committed', item_id: `item-${turnId}` });
    provider.event({ type: 'conversation.item.input_audio_transcription.completed', item_id: `item-${turnId}`, transcript: 'Xin chào' });
    provider.event({ type: 'response.output_audio.delta', delta: Buffer.alloc(480).toString('base64') });
    provider.event({ type: 'response.output_audio_transcript.done', transcript: '你好' });
    provider.event({ type: 'response.done', response: { status: 'completed' } });
    await waitFor(() => listener.messages.at(-1)?.type === 'audio-end');
    assert.equal(listener.messages.filter(m => m.type === 'audio').length, 1);
    assert.equal(sender.messages.filter(m => m.type === 'audio').length, sender === wa ? 0 : 1);
    command(sender, 'played', { turnId });
    await waitFor(() => sender.messages.at(-1)?.type === 'error');
    command(listener, 'played', { turnId });
    await waitFor(() => sender.messages.at(-1)?.phase === 'listening');
    const next = sender.messages.at(-1);
    assert.equal(next.speaker, listener === wb ? b.memberId : a.memberId);
    assert.equal(next.turnId, turnId + 1);
    command(listener, 'played', { turnId });
    await waitFor(() => listener.messages.at(-1)?.type === 'error');
    assert.equal(sender.messages.at(-1).turnId, next.turnId, 'stale playback acknowledgement cannot start another turn');
  }
  command(wa, 'leave'); await waitFor(() => wb.messages.at(-1)?.type === 'ended');
  assert.ok(providers.every(p => p.readyState === 3));
});

test('silence cancellation clears the buffer without requesting a paid response', async t => {
  const { wa, providers } = await pair(t);
  command(wa, 'speak'); await waitFor(() => wa.messages.at(-1)?.phase === 'listening');
  wa.send(Buffer.alloc(9600)); command(wa, 'cancel');
  await waitFor(() => wa.messages.at(-1)?.phase === 'ready');
  assert.equal(providers[0].sent.some(e => e.type === 'response.create'), false);
});

test('invalid tokens cannot attach, duplicate attach does not evict legitimate member', async t => {
  const f = await fixture(t);
  const a = await f.post('/api/rooms', { language: 'vi' });
  const rejected = await f.connect({ ...a, token: 'invalid' });
  await waitFor(() => rejected.readyState === 3);
  const valid = await f.connect(a); await waitFor(() => valid.messages.some(m => m.type === 'attached'));
  const duplicate = await f.connect(a); await waitFor(() => duplicate.readyState === 3);
  assert.equal(valid.readyState, 1); assert.equal(f.providers.length, 0);
});

test('provider errors are sanitized, all peers and providers close on disconnect', async t => {
  const { wa, wb, providers } = await pair(t);
  providers[0].event({ type: 'error', error: { message: 'secret-test-value' } });
  await waitFor(() => wa.messages.some(m => m.type === 'ended') && wb.readyState === 3);
  assert.equal(JSON.stringify(wa.messages).includes('secret-test-value'), false);
  assert.ok(providers.every(p => p.readyState === 3));
});

test('WebSocket rejects wrong origin and missing production authentication before upgrading', async t => {
  for (const production of [false, true]) {
    const f = await fixture(t, production ? { env: { NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://example.com', APP_ACCESS_PASSWORD: 'test' } } : {});
    const ws = new WebSocket(f.base.replace('http:', 'ws:') + '/api/room/socket', { origin: production ? 'https://example.com' : 'https://evil.example', headers: production ? { Host: 'example.com' } : {} });
    ws.on('error', () => {});
    const [, response] = await once(ws, 'unexpected-response');
    assert.equal(response.statusCode, 403); response.resume(); ws.terminate();
  }
});

test('expiry and room capacity are enforced by the server clock', () => {
  let time = 0;
  const hub = new RoomHub({ env: {}, keyLoader: async () => 'test', reserveSessions: () => true, now: () => time });
  try {
    const room = hub.create('zh'); time = 120001; hub.sweep();
    assert.throws(() => hub.join(room.roomId, room.invite), { status: 403 });
    const next = hub.create('vi'); assert.throws(() => hub.join(next.roomId, '中'.repeat(48)), { status: 403 });
  } finally { hub.close(); }
});

test('room configs pin translation direction and PCM format without changing local mode', () => {
  const vi = roomSessionConfig({}, 'vi'), zh = roomSessionConfig({}, 'zh');
  assert.match(vi.instructions, /Vietnamese turn into Mandarin Chinese/);
  assert.match(zh.instructions, /Mandarin Chinese turn into Vietnamese/);
  assert.deepEqual(vi.audio.input.format, { type: 'audio/pcm', rate: 24000 });
  assert.deepEqual(zh.audio.input.transcription.languages, ['zh']);
});

test('authenticated room admission issues a secure cookie for WebSocket browsers that omit Basic auth', async t => {
  let now = Date.now();
  const f = await fixture(t, { now: () => now, env: { NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://example.com', APP_ACCESS_PASSWORD: 'test-password' } });
  const response = await new Promise((resolve, reject) => {
    const req = http.request(f.base + '/api/rooms', { method: 'POST', headers: {
      Host: 'example.com', Origin: 'https://example.com', Authorization: 'Basic ' + Buffer.from('songngu:test-password').toString('base64'),
      'Content-Type': 'application/json', 'X-Translation-Client': '1',
    } }, res => { res.resume(); res.on('end', () => resolve(res)); });
    req.on('error', reject); req.end(JSON.stringify({ language: 'vi' }));
  });
  assert.equal(response.statusCode, 201);
  const cookie = response.headers['set-cookie']?.[0];
  assert.ok(cookie, 'room admission must issue WebSocket authentication cookie');
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api/room/socket']) assert.ok(cookie.includes(attribute));
  const connectStatus = cookieHeader => new Promise(resolve => {
    const ws = new WebSocket(f.base.replace('http:', 'ws:') + '/api/room/socket', { origin: 'https://example.com', headers: { Host: 'example.com', Cookie: cookieHeader } });
    ws.on('error', () => {});
    ws.on('open', () => { ws.terminate(); resolve(101); });
    ws.on('unexpected-response', (_, res) => { res.resume(); ws.terminate(); resolve(res.statusCode); });
  });
  assert.equal(await connectStatus(cookie.split(';')[0]), 101);
  assert.equal(await connectStatus(cookie.split(';')[0] + 'tampered'), 403);
  now += 16 * 60000;
  assert.equal(await connectStatus(cookie.split(';')[0]), 403);
});
