import { SilenceGate } from './core.js';
import { RoomAudio } from './room-audio.js';
const $ = id => document.getElementById(id);
const invite = new URLSearchParams(location.hash.slice(1));
const invited = invite.has('room') && invite.has('invite');
// The invite stays in memory, never in an HTTP URL, referrer, or browser storage.
if (location.hash) history.replaceState(null, '', location.pathname);
$('join-form').hidden = !invited; $('create-form').hidden = invited;
let audio, socket, member, phase = 'idle', speaker, turnId, generation = 0, clock, pendingEnd;
let started = 0, speech = false, sentBytes = 0, gate = new SilenceGate(), busy = false, flushing = false;
const entries = new Map();
function notice(text = '') { $('notice').textContent = text; $('notice').hidden = !text; }
function send(msg) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg)); }
function finish(message = '') {
  generation++; clearInterval(clock); phase = 'idle'; pendingEnd = null; flushing = false;
  audio?.close(); audio = null;
  if (socket) { socket.onmessage = socket.onclose = socket.onerror = null; socket.close(); socket = null; }
  member = null; busy = false; $('call').hidden = true; $('setup').hidden = false;
  $('create-form').hidden = false; $('join-form').hidden = true;
  $('create').disabled = $('join').disabled = false; $('setup').removeAttribute('aria-busy');
  $('resume').hidden = true; notice(message);
}
function renderState() {
  const mine = speaker === member?.memberId;
  audio?.capture(phase === 'listening' && mine);
  $('speak').disabled = !(phase === 'ready' || (phase === 'listening' && mine));
  $('speak').textContent = phase === 'listening' && mine ? 'Dịch câu này / 翻译' : 'Đến lượt tôi nói / 我要说话';
  $('status-dot').classList.toggle('active', phase === 'ready' || phase === 'listening');
  const labels = { waiting: 'Đang chờ người kia / 等待对方', connecting: 'Đang mở phiên dịch / 正在连接', ready: 'Sẵn sàng / 已准备好', listening: mine ? 'Đang nghe bạn nói / 正在聆听' : 'Người kia đang nói / 对方正在说话', translating: 'Đang dịch / 正在翻译', playing: 'Đang phát bản dịch / 正在播放', committing: 'Đang gửi câu nói…' };
  $('status').textContent = labels[phase] || 'Đang kết nối…';
  $('detail').textContent = phase === 'listening' && mine ? 'Micro đang mở · Nói để trả lời, dừng 2 giây để dịch · 请回答' : 'Micro đang tắt · Phát xong bản dịch sẽ tự chuyển lượt';
  if (!['waiting', 'connecting'].includes(phase)) $('invite-panel').hidden = true;
}
function frame(buffer) {
  if (phase !== 'listening' || speaker !== member?.memberId || socket?.readyState !== WebSocket.OPEN) return;
  if (socket.bufferedAmount > 192000) { finish('Mạng gửi âm thanh quá chậm. Hãy tạo phòng mới.'); return; }
  socket.send(buffer); sentBytes += buffer.byteLength;
  const samples = new Int16Array(buffer); let sum = 0;
  for (const sample of samples) sum += (sample / 32768) ** 2;
  const level = Math.sqrt(sum / samples.length);
  if (level >= gate.threshold) speech = true;
  if (gate.sample(level, performance.now())) commit('silence');
}
async function commit(reason = 'manual') {
  if (flushing || phase !== 'listening' || speaker !== member?.memberId) return;
  flushing = true; $('speak').disabled = true;
  const run = generation;
  try {
    // Port messages are ordered: send the final partial PCM frame before commit.
    await audio.flush(); if (run !== generation) return;
    phase = 'committing'; flushing = false; renderState();
    send({ type: speech ? 'commit' : 'cancel' });
    if (speech && reason === 'silence') audio.playTurnEnd();
    if (!speech) notice('Chưa nghe thấy giọng nói. Bấm nói và thử lại. / 未检测到语音。');
  } catch (e) { if (run === generation) finish(e.message); }
}
function transcript(event) {
  let entry = entries.get(event.turnId);
  if (!entry) { entry = { speaker: event.speaker }; entries.set(event.turnId, entry); }
  entry[event.kind] = event.text;
  if (entries.size > 100) entries.delete(entries.keys().next().value);
  const latest = Math.max(...entries.keys());
  const current = entries.get(latest);
  $('speaker').textContent = current.speaker === member?.memberId ? 'Bạn / 你' : 'Người kia / 对方';
  $('source').textContent = current.source || 'Đang nhận diện…'; $('translation').textContent = current.translation || 'Đang dịch…';
  const rows = [...entries.entries()].sort((a, b) => b[0] - a[0]).map(([, item]) => {
    const row = document.createElement('div'); row.className = 'history-item';
    const label = document.createElement('small'); label.textContent = item.speaker === member?.memberId ? 'Bạn / 你' : 'Đối phương';
    const source = document.createElement('div'); source.textContent = item.source || '…';
    const translated = document.createElement('div'); translated.className = 'translation'; translated.textContent = item.translation || '…';
    row.append(label, source, translated); return row;
  });
  $('room-history').replaceChildren(...rows);
}
function handle(event) {
  if (event.data instanceof ArrayBuffer) { audio.play(event.data); return; }
  const msg = JSON.parse(event.data);
  if (msg.type === 'state') {
    phase = msg.phase; speaker = msg.speaker; turnId = msg.turnId;
    if (phase === 'listening' && speaker === member.memberId) { started = performance.now(); gate.reset(); speech = false; sentBytes = 0; }
    renderState();
  } else if (msg.type === 'transcript') transcript(msg);
  else if (msg.type === 'audio-end') pendingEnd = msg.turnId;
  else if (msg.type === 'ended') finish(msg.message);
  else if (msg.type === 'error') { notice(msg.message); renderState(); }
  else if (msg.type === 'status') $('status').textContent = msg.message;
}
async function enter(join) {
  if (busy) return;
  busy = true; const run = ++generation; notice();
  $('create').disabled = $('join').disabled = true; $('setup').setAttribute('aria-busy', 'true');
  try {
    const media = audio = new RoomAudio(frame, finish);
    await media.open(); if (run !== generation) return;
    const response = await fetch(join ? '/api/rooms/join' : '/api/rooms', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Translation-Client': '1' },
      body: JSON.stringify(join ? { roomId: invite.get('room'), invite: invite.get('invite') } : { language: $('language').value }), signal: AbortSignal.timeout(15000),
    });
    const data = await response.json(); if (run !== generation) return;
    if (!response.ok) throw new Error(data.error || 'Không vào được phòng.');
    member = data; entries.clear(); $('room-history').replaceChildren();
    $('source').textContent = 'Chờ cuộc trò chuyện bắt đầu…'; $('translation').textContent = 'Giọng AI sẽ phát cho người nghe.';
    $('identity').textContent = data.language === 'vi' ? 'Bạn nói tiếng Việt · Nghe tiếng Việt' : '你说中文 · 收听中文';
    $('setup').hidden = true; $('call').hidden = false; $('invite-panel').hidden = join;
    if (!join) $('invite-link').value = `${location.origin}/room#room=${data.roomId}&invite=${data.invite}`;
    phase = 'waiting'; renderState();
    const ws = socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/room/socket`);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { if (run === generation) send({ type: 'attach', roomId: data.roomId, token: data.token }); };
    ws.onmessage = event => { if (run === generation) { try { handle(event); } catch { finish('Không xử lý được âm thanh. Hãy tạo phòng mới.'); } } };
    ws.onerror = () => { if (run === generation) finish('Không mở được kết nối phòng gọi. Kiểm tra mạng và HTTPS.'); };
    ws.onclose = () => { if (run === generation) finish('Phòng đã đóng hoặc mất mạng. Hãy tạo phòng mới.'); };
    const connectingAt = performance.now();
    clock = setInterval(() => {
      if (ws.readyState === WebSocket.CONNECTING && performance.now() - connectingAt > 15000) { finish('Kết nối quá lâu. Hãy thử lại.'); return; }
      if (phase === 'listening' && speaker === member?.memberId && (performance.now() - started > 29000 || sentBytes >= 29 * 48000 || (!speech && performance.now() - started > 8000))) commit();
      if (pendingEnd !== null && pendingEnd !== undefined && audio?.drained()) { send({ type: 'played', turnId: pendingEnd }); pendingEnd = null; }
      $('resume').hidden = !audio || audio.context.state === 'running';
    }, 100);
  } catch (e) {
    if (run !== generation) return;
    const messages = { NotAllowedError: 'Cho phép micro để tham gia cuộc gọi. / 请允许使用麦克风。', NotFoundError: 'Không tìm thấy micro.', NotReadableError: 'Micro đang bận hoặc không mở được.' };
    finish(messages[e.name] || e.message || 'Không vào được phòng.');
  }
}
$('create').addEventListener('click', () => enter(false)); $('join').addEventListener('click', () => enter(true));
$('leave').addEventListener('click', () => { send({ type: 'leave' }); finish('Bạn đã rời phòng.'); });
$('speak').addEventListener('click', async () => {
  try {
    await audio.resume();
    if (phase === 'listening') commit();
    else if (phase === 'ready') { notice(); $('speak').disabled = true; send({ type: 'speak' }); }
  } catch { finish('Không bật được âm thanh. Hãy tham gia lại.'); }
});
$('resume').addEventListener('click', () => audio?.resume().catch(() => notice('Hãy kiểm tra quyền phát âm thanh.')));
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('invite-link').value); $('copy').textContent = 'Đã sao chép'; }
  catch { $('invite-link').select(); notice('Chọn và sao chép liên kết trong ô mời.'); }
});
window.addEventListener('pagehide', () => finish());
document.addEventListener('visibilitychange', () => { if (document.hidden && phase !== 'waiting' && (member || busy)) { send({ type: 'leave' }); finish('Đã đóng phòng khi rời trang. Hãy giữ trang mở trong cuộc gọi.'); } });
