export class RoomAudio {
  constructor(onFrame, onFailure) { this.onFrame = onFrame; this.onFailure = onFailure; this.sources = new Set(); this.next = 0; this.closed = false; }
  async open() {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) throw new Error('Hãy dùng trình duyệt hỗ trợ micro qua HTTPS hoặc localhost.');
    this.context = new AudioContext();
    await this.context.resume();
    // Preload once; a missing cue must never prevent joining or translating.
    this.cueReady = fetch('/turn-end.wav', { signal: AbortSignal.timeout(5000) })
      .then(response => { if (!response.ok) throw new Error('Cue unavailable'); return response.arrayBuffer(); })
      .then(bytes => this.closed ? null : this.context.decodeAudioData(bytes))
      .then(buffer => { if (!this.closed) this.cueBuffer = buffer; })
      .catch(() => {});
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (this.closed) { stream.getTracks().forEach(t => t.stop()); return; }
    this.stream = stream; this.capture(false);
    stream.getTracks().forEach(t => { t.onended = () => this.onFailure('Micro đã ngắt kết nối.'); });
    await this.context.audioWorklet.addModule('/pcm-worklet.js');
    if (this.closed) return;
    this.node = new AudioWorkletNode(this.context, 'pcm-capture');
    this.node.port.onmessage = e => {
      if (e.data === 'flushed') { this.flushDone?.(); return; }
      if (!this.closed) this.onFrame(e.data);
    };
    this.input = this.context.createMediaStreamSource(stream);
    this.input.connect(this.node); this.node.connect(this.context.destination);
  }
  capture(enabled) {
    if (enabled) this.stopTurnEnd();
    this.stream?.getAudioTracks().forEach(t => { t.enabled = enabled; });
    this.node?.port.postMessage(enabled);
  }
  async resume() { await this.context.resume(); }
  playTurnEnd() {
    // Local output only, separate from streamed translation and its playback queue.
    // Do not defer until loading completes: that could beep during a later turn.
    if (this.closed || !this.cueBuffer || this.context.state !== 'running') return;
    try {
      this.stopTurnEnd();
      const source = this.cueSource = this.context.createBufferSource();
      source.buffer = this.cueBuffer; source.connect(this.context.destination);
      source.onended = () => { source.disconnect(); if (this.cueSource === source) this.cueSource = null; };
      source.start();
    } catch { this.stopTurnEnd(); }
  }
  stopTurnEnd() {
    if (!this.cueSource) return;
    this.cueSource.onended = null;
    try { this.cueSource.stop(); } catch { /* Already ended. */ }
    this.cueSource.disconnect(); this.cueSource = null;
  }
  async flush() {
    this.stream?.getAudioTracks().forEach(t => { t.enabled = false; });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.flushDone = null; reject(new Error('Không chốt được âm thanh. Hãy tham gia lại.')); }, 1500);
      this.flushDone = () => { clearTimeout(timeout); this.flushDone = null; resolve(); };
      this.node.port.postMessage('flush');
    });
  }
  play(pcm) {
    if (this.closed || !pcm.byteLength || pcm.byteLength % 2) return;
    const samples = new DataView(pcm);
    const buffer = this.context.createBuffer(1, pcm.byteLength / 2, 24000);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < output.length; i++) output[i] = samples.getInt16(i * 2, true) / 32768;
    if (this.next - this.context.currentTime > 95) throw new Error('Âm thanh bị tồn quá lâu. Hãy kết nối lại.');
    const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(this.context.destination);
    const at = Math.max(this.context.currentTime + 0.04, this.next);
    this.next = at + buffer.duration; this.sources.add(source);
    source.onended = () => { source.disconnect(); this.sources.delete(source); };
    source.start(at);
  }
  drained() { return this.context?.state === 'running' && this.sources.size === 0 && this.context.currentTime >= this.next; }
  close() {
    this.stopTurnEnd(); this.cueBuffer = null;
    this.flushDone?.();
    this.closed = true; this.capture(false);
    this.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); });
    for (const source of this.sources) { source.onended = null; source.stop(); source.disconnect(); }
    this.sources.clear(); this.node?.disconnect(); this.input?.disconnect();
    this.context?.close().catch(() => {});
  }
}
