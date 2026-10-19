import { SilenceGate, TranscriptStore } from './core.js';
import { AudioCues } from './audio-cues.js';
import { RoomAudio } from './room-audio.js';
import { Utterance } from './utterance.js';

const $ = id => document.getElementById(id);
const gate = new SilenceGate();
const utterance = new Utterance();
let hybridAudio, flushing = false;
let sourceStore = new TranscriptStore();
let phase = 'idle', epoch = 0, peer, channel, stream, context, cues, analyser, sampleBuffer, timer, watchdog, aborter;
let currentTurn, pendingTurn, responseTurn, turns = [], responseTurns = new Map(), inputTurns = new Map();
let audioStarted = false, completionPending = false, lastClear = 0, sessionStarted = 0;
const audio = $('remote-audio');
const pairs = {
  'vi-zh': { label: 'VIỆT ⇄ TRUNG', spoken: 'tiếng Việt hoặc tiếng Trung phổ thông', symbol: '中', code: 'ZH' },
  'vi-en': { label: 'VIỆT ⇄ ANH', spoken: 'tiếng Việt hoặc tiếng Anh', symbol: 'En', code: 'EN' },
};
const selectedPair = () => pairs[$('language-pair').value];
function refreshPair() {
  const pair = selectedPair();
  document.title = `Song Ngữ · ${pair.label}`;
  $('intro-description').textContent = `Nói ${pair.spoken}. Ngừng khoảng 700 ms, bản dịch sẽ được đọc thành tiếng.`;
  $('pair-symbol').textContent = pair.symbol;
  $('pair-code').textContent = pair.code;
  $('pair-illustration').setAttribute('aria-label', pair.label);
  $('source-language').textContent = 'TỰ ĐỘNG';
  $('target-language').textContent = pair.label;
}
const notices = {
  NotAllowedError: 'Chưa được cấp quyền micro. Cho phép micro trong trình duyệt rồi thử lại.',
  NotFoundError: 'Không tìm thấy micro. Hãy kết nối micro và thử lại.',
  NotReadableError: 'Không mở được micro. Có thể ứng dụng khác đang sử dụng thiết bị.',
};
function notice(message = '') { $('notice').textContent = message; $('notice').hidden = !message; }
function status(title, detail) { $('status').textContent = title; $('status-detail').textContent = detail; }
function send(message) { if (channel?.readyState === 'open') channel.send(JSON.stringify(message)); }
function mic(enabled) { if (hybridAudio) hybridAudio.capture(enabled); else stream?.getAudioTracks().forEach(track => { track.enabled = enabled; }); }
function setPhase(value) {
  phase = value;
  const active = !['idle', 'connecting'].includes(value);
  $('start-label').textContent = value === 'limited' ? 'Nói lại' : value === 'connecting' ? 'Hủy kết nối' : active ? 'Dừng phiên dịch' : 'Bắt đầu phiên dịch';
  $('start').classList.toggle('running', active || value === 'connecting');
  $('status-dot').classList.toggle('active', active);
  $('connection').classList.toggle('online', active);
  $('connection').replaceChildren(Object.assign(document.createElement('i'), {}), document.createTextNode(active ? ' Đã kết nối' : value === 'connecting' ? ' Đang kết nối' : ' Chưa kết nối'));
  $('clear').disabled = active || value === 'connecting';
  $('language-pair').disabled = value !== 'idle';
  $('wave').classList.toggle('active', value === 'playing');
  const step = value === 'waiting' ? 'translate' : ['playing', 'finishing'].includes(value) ? 'play' : 'listen';
  document.querySelectorAll('[data-flow-step]').forEach(item => {
    const current = item.dataset.flowStep === step;
    item.classList.toggle('current', current);
    if (current) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
  });
}
function clearTimer() { clearTimeout(watchdog); watchdog = undefined; }
function watch(ms, message) { clearTimer(); watchdog = setTimeout(() => fail(message), ms); }
function fail(message) { stop(); notice(message); }
function stop() {
  epoch++;
  clearInterval(timer); clearTimer(); aborter?.abort();
  hybridAudio?.close(); hybridAudio=undefined; flushing=false; utterance.reset();
  // Remove handlers before closing so expected teardown cannot report a disconnect.
  if (channel) { channel.onmessage = channel.onclose = channel.onopen = channel.onerror = null; channel.close(); }
  if (peer) { peer.onconnectionstatechange = peer.ontrack = null; peer.close(); }
  stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
  cues?.stop(); context?.close().catch(() => {});
  peer = channel = stream = context = cues = analyser = undefined;
  audio.pause(); audio.srcObject = null; $('resume-audio').hidden = true;
  gate.reset(); audioStarted = completionPending = false;
  if (pendingTurn && !pendingTurn.complete) pendingTurn.interrupted = true;
  if (pendingTurn && !pendingTurn.translation) $('target-text').textContent='Lượt dịch đã dừng.';
  currentTurn = pendingTurn = responseTurn = undefined;
  setPhase('idle'); status('Đã dừng phiên dịch', 'Bấm bắt đầu để tiếp tục cuộc trò chuyện');
  renderHistory();
}
function resumeListening() {
  if (phase === 'idle') return;
  clearTimer();
  if (responseTurn) responseTurn.complete = true;
  responseTurn = pendingTurn = currentTurn = undefined;
  audioStarted = completionPending = false;
  gate.reset(); lastClear = performance.now();
  utterance.reset();
  send({ type: 'input_audio_buffer.clear' });
  mic(true); setPhase('listening');
  status('Đang lắng nghe', `Nói ${selectedPair().spoken}`);
  $('source-hint').textContent = 'Bản chép lời xuất hiện khi bạn nói';
  $('target-hint').textContent = 'Tự động phát giọng nói AI';
  renderHistory();
}
function finishTranslation() {
  if (phase === 'idle' || completionPending) return;
  completionPending = true;
  const run = epoch;
  clearTimer(); mic(false); setPhase('finishing');
  status('Bản dịch đã hoàn tất', 'Bíp đôi báo hiệu bạn có thể chuẩn bị nói tiếp');
  const done = () => { if (run === epoch) resumeListening(); };
  if (!cues) done(); else cues.play('translation-end', done);
}
function newTurn() {
  const turn = { index: turns.length + 1, pair: selectedPair().label, source: '', translation: '', complete: false };
  turns.push(turn);
  if (turns.length > 100) turns.shift();
  return turn;
}
function renderHistory() {
  const entries = turns.filter(t => t.source || t.translation);
  $('history-count').textContent = entries.length;
  if (!entries.length) {
    const empty = document.createElement('div'); empty.className = 'empty-history';
    empty.textContent = '↔  Câu chuyện của bạn sẽ xuất hiện ở đây.';
    $('history-list').replaceChildren(empty); return;
  }
  const fragment = document.createDocumentFragment();
  for (const turn of [...entries].reverse()) {
    const row = document.createElement('div'); row.className = 'history-item';
    const number = document.createElement('small'); number.textContent = String(turn.index).padStart(2, '0'); number.title = turn.pair;
    const source = document.createElement('div'); source.textContent = turn.source || 'Đang nhận diện…';
    const translated = document.createElement('div'); translated.className = 'translation';
    translated.textContent = turn.translation || (turn.interrupted ? 'Lượt dịch đã dừng.' : 'Đang dịch…');
    row.append(number, source, translated); fragment.append(row);
  }
  $('history-list').replaceChildren(fragment);
}
function updateLabels(text) {
  // Streaming transcription does not provide a detected-language field.
  // English and Vietnamese share Latin script: do not guess from missing accents.
  if ($('language-pair').value === 'vi-en') {
    $('source-language').textContent = 'TỰ ĐỘNG';
    $('target-language').textContent = selectedPair().label;
    return;
  }
  // Visual hint only; the audio model determines the translation language.
  const chinese = /\p{Script=Han}/u.test(text);
  $('source-language').textContent = chinese ? '中文 · ZH' : 'TIẾNG VIỆT · VI';
  $('target-language').textContent = chinese ? 'TIẾNG VIỆT · VI' : '中文 · ZH';
}
function handle(event) {
  if (event.type === 'error') {
    if (event.error?.code === 'input_audio_buffer_commit_empty') {
      fail('Chưa nhận đủ âm thanh để dịch. Hãy thử lại và nói rõ hơn.'); return;
    }
    fail('Dịch vụ âm thanh báo lỗi. Hãy bắt đầu lại; nếu vẫn lỗi, kiểm tra hạn mức API.'); return;
  }
  if (event.type === 'input_audio_buffer.committed' && pendingTurn) {
    inputTurns.set(event.item_id, pendingTurn);
    pendingTurn.inputId = event.item_id;
  }
  if (event.type.startsWith('conversation.item.input_audio_transcription.')) {
    if (event.type.endsWith('.failed')) { notice('Không nhận được bản chép lời cho lượt này. Bản dịch âm thanh có thể vẫn tiếp tục.'); return; }
    if (!event.type.endsWith('.delta') && !event.type.endsWith('.completed')) return;
    const done = event.type.endsWith('.completed');
    const item = sourceStore.update(event.item_id, done ? event.transcript || '' : event.delta || '', done);
    let turn = inputTurns.get(event.item_id);
    if (!turn) { turn = pendingTurn || currentTurn || (currentTurn = newTurn()); inputTurns.set(event.item_id, turn); }
    turn.source = item.text;
    if (turn === turns.at(-1)) { $('source-text').textContent = item.text; updateLabels(item.text); }
    renderHistory();
  }
  if (event.type === 'response.created') {
    responseTurn = pendingTurn;
    if (responseTurn) responseTurns.set(event.response.id, responseTurn);
  }
  if (event.type === 'response.output_audio_transcript.delta' || event.type === 'response.output_audio_transcript.done') {
    const turn = responseTurns.get(event.response_id) || responseTurn;
    if (!turn) return;
    turn.translation = event.type.endsWith('.done') ? event.transcript : turn.translation + event.delta;
    $('target-text').textContent = turn.translation;
    renderHistory();
  }
  if (event.type === 'output_audio_buffer.started') {
    audioStarted = true; mic(false); setPhase('playing');
    status('Đang đọc bản dịch', 'Micro tạm ngắt để tránh nghe lại tiếng loa');
    const turn = responseTurns.get(event.response_id) || responseTurn;
    if (turn?.committedAt) $('target-hint').textContent = `Bắt đầu phát sau ${((performance.now() - turn.committedAt) / 1000).toFixed(1)} giây xử lý`;
    watch(120000, 'Lượt phát quá dài. Phiên đã dừng; hãy nói thành các câu ngắn hơn.');
    audio.play().catch(() => { $('resume-audio').hidden = false; });
  }
  if (event.type === 'output_audio_buffer.stopped') {
    // response.done can precede actual speaker playback; only this event releases the microphone.
    finishTranslation();
  }
  if (event.type === 'output_audio_buffer.cleared' && !completionPending) resumeListening();
  if (event.type === 'response.done') {
    if (event.response.status !== 'completed') { fail('Lượt dịch chưa hoàn tất. Hãy bắt đầu lại và thử câu ngắn hơn.'); return; }
    const hasAudio = event.response.output?.some(item => item.content?.some(part => part.type === 'audio'));
    if (!hasAudio && !audioStarted) finishTranslation();
  }
}
function tick() {
  if (!analyser || phase !== 'listening') return;
  const now = performance.now();
  if (now - sessionStarted > 15 * 60 * 1000) { fail('Đã hết phiên 15 phút. Bấm bắt đầu để mở phiên mới.'); return; }
  analyser.getFloatTimeDomainData(sampleBuffer);
  let sum = 0;
  for (const sample of sampleBuffer) sum += sample * sample;
  const level = Math.sqrt(sum / sampleBuffer.length);
  $('wave').classList.toggle('active', level >= gate.threshold);
  if (gate.sample(level, now)) {
    pendingTurn = currentTurn || newTurn(); currentTurn = undefined;
    pendingTurn.committedAt = now;
    mic(false); setPhase('waiting');
    status('Đang dịch…', 'Đã nhận câu · tiếng bíp xác nhận micro đã tắt');
    $('target-text').textContent = 'Đang chuyển ngữ…';
    cues?.play('speech-end');
    // Commit precedes response.create on the ordered RTC data channel.
    send({ type: 'input_audio_buffer.commit' });
    send({ type: 'response.create' });
    watch(35000, 'Dịch vụ phản hồi quá lâu. Kiểm tra mạng và bắt đầu lại.');
    return;
  }
  const remaining = gate.remaining(now);
  if (remaining !== null && level < gate.threshold) {
    status('Đang chờ hết câu', `Còn ${(remaining / 1000).toFixed(1)} giây · Nói tiếp để tiếp tục câu`);
  } else if (remaining !== null) {
    status('Đang nghe bạn nói', 'Tự động dịch sau 700 ms im lặng');
  }
  // Avoid accumulating an unlimited silent audio buffer.
  if (remaining === null && now - lastClear > 10000) { send({ type: 'input_audio_buffer.clear' }); lastClear = now; }
}

async function commitHybrid(run) {
  if (flushing || phase!=='listening') return;
  flushing=true; setPhase('waiting');
  pendingTurn=responseTurn=newTurn(); pendingTurn.committedAt=performance.now();
  notice(); status('Đang dịch…','Nếu 9Router giới hạn, tự chờ và thử lại tối đa 2 lần');
  $('source-text').textContent='Đang nhận dạng câu mới…';
  $('target-text').textContent='Đang chuyển ngữ…';
  watch(95000,'Dịch vụ phản hồi quá lâu. Hãy thử lại.');
  try {
    await hybridAudio.flush(); if (run!==epoch) return;
    flushing=false; hybridAudio.playTurnEnd();
    const response=await fetch('/api/translate-audio',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Translation-Client':'1','X-Language-Pair':$('language-pair').value},body:utterance.take(),signal:aborter.signal});
    const result=await response.json(); if (run!==epoch) return;
    if (response.status===429) {
      clearTimer();mic(false);
      if(result.source) { responseTurn.source=result.source; $('source-text').textContent=result.source; }
      else $('source-text').textContent='Chưa nhận được bản chép lời cho câu này.';
      responseTurn.interrupted=true;
      responseTurn.translation='Chưa dịch được: dịch vụ đang giới hạn. Hãy chờ rồi nói lại.';
      $('target-text').textContent=responseTurn.translation;
      responseTurn=pendingTurn=currentTurn=undefined;utterance.reset();renderHistory();
      setPhase('limited');status('Tạm chờ dịch vụ','Phiên vẫn mở · Chờ một lúc rồi bấm micro để nói lại');
      notice(result.error || 'Dịch vụ đang giới hạn yêu cầu.');return;
    }
    if (!response.ok) throw new Error(result.error || 'Không hoàn tất lượt dịch.');
    responseTurn.source=result.source; responseTurn.translation=result.translation;
    $('source-text').textContent=result.source; $('target-text').textContent=result.translation;
    $('source-language').textContent=result.sourceLanguage.toUpperCase();
    $('target-language').textContent=result.targetLanguage.toUpperCase();
    $('target-hint').textContent=`Bắt đầu phát sau ${((performance.now()-responseTurn.committedAt)/1000).toFixed(1)} giây xử lý`;
    renderHistory();
    const raw=atob(result.audio); const pcm=Uint8Array.from(raw,c=>c.charCodeAt(0));
    hybridAudio.play(pcm.buffer); setPhase('playing');
    status('Đang đọc bản dịch','Google WaveNet · Micro tạm tắt');
    watch(120000,'Phát âm thanh quá lâu. Hãy thử lại.');
  } catch(e) { if (run===epoch) fail(e.message || 'Không hoàn tất lượt dịch.'); }
}
async function startHybrid(run) {
  const media=hybridAudio=new RoomAudio(buffer=>{
    if (run!==epoch || (!flushing && phase!=='listening')) return;
    try {
      utterance.gate.threshold=gate.threshold;
      if (utterance.push(buffer,performance.now(),flushing)) void commitHybrid(run);
      else if (phase==='listening' && utterance.speech) status('Đang nghe bạn nói','Tự động dịch sau 700 ms im lặng');
    } catch(e) { if (run===epoch) fail(e.message); }
  },message=>{ if (run===epoch) fail(message); });
  await media.open(); if (run!==epoch) return;
  context=media.context; cues=media.cues;
  await cues.loadReadyAudio(); if (run!==epoch) return;
  sessionStarted=performance.now(); clearTimer();
  status('Đang lắng nghe','Tiếng bíp báo sẵn sàng · Nói sau tiếng bíp');
  cues.play('connection-ready',()=>{
    if (run!==epoch) return;
    resumeListening();
    timer=setInterval(()=>{
      if (run!==epoch) return;
      if (performance.now()-sessionStarted>15*60000) { fail('Đã hết phiên 15 phút. Bấm bắt đầu để mở phiên mới.'); return; }
      if (phase==='playing' && media.drained()) finishTranslation();
      $('resume-audio').hidden=media.context.state==='running';
    },100);
  });
}

async function start() {
  const run = ++epoch;
  notice(); setPhase('connecting'); status('Đang kết nối…', 'Cho phép micro khi trình duyệt yêu cầu');
  if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
    fail('Trình duyệt chưa hỗ trợ. Hãy mở bằng Chrome hoặc Edge tại localhost hoặc HTTPS.'); return;
  }
  aborter = new AbortController();
  watch(30000, 'Không kết nối được trong 30 giây. Kiểm tra quyền micro và mạng rồi thử lại.');
  try {
    const health = await fetch('/api/health', { signal: aborter.signal }).then(r => r.json());
    if (run !== epoch) return;
    if (!health.configured) throw new Error('Chưa cấu hình được API key trên máy chủ.');
    if (health.engine==='hybrid') { await startHybrid(run); return; }
    const acquired = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    if (run !== epoch) { acquired.getTracks().forEach(t => t.stop()); return; }
    stream = acquired; mic(false);
    context = new AudioContext(); await context.resume(); cues = new AudioCues(context);
    await cues.loadReadyAudio();
    if (run !== epoch) return;
    analyser = context.createAnalyser(); analyser.fftSize = 2048;
    context.createMediaStreamSource(stream).connect(analyser);
    sampleBuffer = new Float32Array(analyser.fftSize);
    const pc = peer = new RTCPeerConnection();
    stream.getTracks().forEach(track => { pc.addTrack(track, stream); track.onended = () => fail('Micro đã ngắt kết nối. Hãy kết nối lại thiết bị.'); });
    pc.ontrack = event => { if (run === epoch) { audio.srcObject = event.streams[0]; audio.play().catch(() => { $('resume-audio').hidden = false; }); } };
    pc.onconnectionstatechange = () => {
      if (run !== epoch) return;
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) fail('Kết nối âm thanh bị gián đoạn. Bấm bắt đầu để kết nối lại.');
    };
    channel = pc.createDataChannel('oai-events');
    channel.onmessage = e => { if (run === epoch) { try { handle(JSON.parse(e.data)); } catch { fail('Không xử lý được dữ liệu âm thanh. Hãy kết nối lại.'); } } };
    channel.onclose = () => { if (run === epoch) fail('Phiên dịch đã đóng. Bấm bắt đầu để mở phiên mới.'); };
    channel.onerror = () => { if (run === epoch) fail('Kết nối dữ liệu bị lỗi. Hãy thử lại.'); };
    channel.onopen = () => {
      if (run !== epoch) return;
      sessionStarted = performance.now();
      clearTimer(); mic(false); setPhase('listening');
      status('Đang lắng nghe', 'Tiếng bíp báo sẵn sàng · Nói sau tiếng bíp');
      cues.play('connection-ready', () => {
        if (run !== epoch) return;
        resumeListening(); timer = setInterval(tick, 40);
      });
    };
    const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
    if (run !== epoch) return;
    const answer = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/sdp', 'X-Translation-Client': '1', 'X-Language-Pair': $('language-pair').value }, body: offer.sdp, signal: aborter.signal });
    if (run !== epoch) return;
    if (!answer.ok) { const error = await answer.json(); throw new Error(error.error || 'Không tạo được kết nối.'); }
    await pc.setRemoteDescription({ type: 'answer', sdp: await answer.text() });
  } catch (error) {
    if (run !== epoch) return;
    fail(notices[error.name] || (error.name === 'AbortError' ? 'Đã hủy kết nối.' : error.message || 'Không thể bắt đầu phiên dịch.'));
  }
}
$('start').addEventListener('click', () => { if(phase==='limited') { notice();resumeListening(); } else if(phase==='idle') start();else stop(); });
$('resume-audio').addEventListener('click', async () => { try { if (hybridAudio) await hybridAudio.resume(); else await audio.play(); $('resume-audio').hidden = true; } catch { notice('Trình duyệt chưa cho phép phát âm thanh. Kiểm tra thiết bị đầu ra.'); } });
$('clear').addEventListener('click', () => {
  if (phase !== 'idle') return;
  turns = []; responseTurns.clear(); inputTurns.clear(); sourceStore = new TranscriptStore();
  $('source-text').textContent = 'Sẵn sàng cho câu chuyện mới.'; $('target-text').textContent = 'Bản dịch sẽ xuất hiện ở đây.';
  refreshPair(); renderHistory();
});
$('language-pair').addEventListener('change', () => {
  if (phase !== 'idle') return;
  refreshPair();
  $('source-text').textContent = 'Sẵn sàng cho câu chuyện mới.';
  $('target-text').textContent = 'Bản dịch sẽ xuất hiện ở đây.';
  status('Sẵn sàng lắng nghe', `Nói ${selectedPair().spoken}`);
});
refreshPair();
$('settings-button').addEventListener('click', () => { const open = $('settings').hidden; $('settings').hidden = !open; $('settings-button').setAttribute('aria-expanded', String(open)); });
$('sensitivity').addEventListener('input', e => { gate.threshold = Number(e.target.value) / 1000; $('sensitivity-value').textContent = e.target.value; });
window.addEventListener('pagehide', stop);
window.addEventListener('translation-stop', stop);
document.addEventListener('visibilitychange', () => { if (document.hidden && phase !== 'idle') fail('Phiên đã dừng khi bạn rời trang để tránh thu âm ngoài ý muốn.'); });
fetch('/api/health').then(r => r.json()).then(data => { if (!data.configured) notice('Chưa đọc được API key. Hãy kiểm tra cấu hình máy chủ trước khi bắt đầu.'); }).catch(() => notice('Không kết nối được máy chủ. Hãy chạy npm start.'));
