// Explicit, paid provider smoke. Never invoked by npm test.
// node --env-file-if-exists=.env.local scripts/room-provider-smoke.mjs --confirm-paid vi.wav zh.wav
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createApp } from '../server.js';
if (process.argv[2] !== '--confirm-paid' || process.argv.length !== 5) throw new Error('Provide --confirm-paid and two mono PCM16 24kHz WAV paths (Vietnamese, Mandarin).');
async function pcm(path) {
  const file = await readFile(path);
  assert.equal(file.toString('ascii', 0, 4), 'RIFF'); assert.equal(file.toString('ascii', 8, 12), 'WAVE');
  let format, data;
  for (let pos = 12; pos + 8 <= file.length;) {
    const size = file.readUInt32LE(pos + 4), name = file.toString('ascii', pos, pos + 4);
    const chunk = file.subarray(pos + 8, pos + 8 + size);
    if (name === 'fmt ') format = chunk;
    if (name === 'data') data = chunk;
    pos += 8 + size + size % 2;
  }
  assert.equal(format.readUInt16LE(0), 1); assert.equal(format.readUInt16LE(2), 1);
  assert.equal(format.readUInt32LE(4), 24000); assert.equal(format.readUInt16LE(14), 16);
  assert.ok(data.length > 9600 && data.length < 25 * 48000); return data;
}
const samples = await Promise.all(process.argv.slice(3).map(pcm));
// Keep this local and isolated from production auth/quota state, retaining provider settings only.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('OPENAI_')));
const app = createApp({ env });
await new Promise(r => app.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${app.address().port}`;
const clients = [];
async function waitFor(check, ms = 45000) {
  const until = Date.now() + ms;
  while (!check()) {
    if (clients.some(c => c.events.some(e => e.type === 'ended'))) throw new Error('Room ended: ' + clients.flatMap(c => c.events).find(e => e.type === 'ended').message);
    if (Date.now() > until) throw new Error('Timeout waiting for provider');
    await new Promise(r => setTimeout(r, 20));
  }
}
const post = async (path, body) => {
  const res = await fetch(base + path, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', 'X-Translation-Client': '1' }, body: JSON.stringify(body) });
  assert.ok(res.ok); return res.json();
};
async function connect(member) {
  const ws = new WebSocket(base.replace('http:', 'ws:') + '/api/room/socket', { origin: base });
  ws.events = []; ws.bytes = 0; clients.push(ws);
  ws.on('message', (raw, binary) => { if (binary) { ws.bytes += raw.length; ws.firstAudioAt ||= Date.now(); } else ws.events.push(JSON.parse(raw.toString())); });
  await once(ws, 'open'); ws.send(JSON.stringify({ type: 'attach', roomId: member.roomId, token: member.token })); return ws;
}
try {
  const a = await post('/api/rooms', { language: 'vi' }), b = await post('/api/rooms/join', { roomId: a.roomId, invite: a.invite });
  const wa = await connect(a), wb = await connect(b);
  await waitFor(() => clients.every(c => c.events.at(-1)?.phase === 'ready'));
  for (const [index, sender, listener] of [[0, wa, wb], [1, wb, wa]]) {
    sender.send(JSON.stringify({ type: 'speak' })); await waitFor(() => sender.events.at(-1)?.phase === 'listening');
    const turnId = sender.events.at(-1).turnId;
    for (let offset = 0; offset < samples[index].length; offset += 4800) {
      sender.send(samples[index].subarray(offset, offset + 4800)); await new Promise(r => setTimeout(r, 100));
    }
    const committedAt = Date.now(); sender.send(JSON.stringify({ type: 'commit' }));
    await waitFor(() => listener.events.some(e => e.type === 'audio-end' && e.turnId === turnId));
    const translated = listener.events.find(e => e.type === 'transcript' && e.kind === 'translation' && e.turnId === turnId);
    assert.ok(listener.bytes > 0); assert.ok(translated?.text);
    assert.match(translated.text, index === 0 ? /\p{Script=Han}/u : /[a-zA-ZÀ-ỹ]/u);
    console.log(JSON.stringify({ direction: index === 0 ? 'vi-to-zh' : 'zh-to-vi', firstAudioMs: listener.firstAudioAt - committedAt, audioBytes: listener.bytes, translation: translated.text }));
    listener.send(JSON.stringify({ type: 'played', turnId })); await waitFor(() => sender.events.at(-1)?.phase === 'ready');
  }
  console.log('PASS: real OpenAI provider, two synthetic utterances, both translation directions. Not a physical-device or playback-latency benchmark.');
} finally { for (const ws of clients) ws.terminate(); await new Promise(r => { app.closeAllConnections(); app.close(r); }); }
