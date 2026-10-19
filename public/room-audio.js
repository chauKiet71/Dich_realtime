export class RoomAudio {
  constructor(onFrame, onFailure) { this.onFrame = onFrame; this.onFailure = onFailure; this.sources = new Set(); this.next = 0; this.closed = false; }
  async open() {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) throw new Error('Hãy dùng trình duyệt hỗ trợ micro qua HTTPS hoặc localhost.');
    this.context = new AudioContext();
    await this.context.resume();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (this.closed) { stream.getTracks().forEach(t => t.stop()); return; }
    this.stream = stream; this.capture(false);
    stream.getTracks().forEach(t => { t.onended = () => this.onFailure('Micro đã ngắt kết nối.'); });
    await this.context.audioWorklet.addModule('/pcm-worklet.js');
    if (this.closed) return;
    this.node = new AudioWorkletNode(this.context, 'pcm-capture');
    this.node.port.onmessage = e => { if (!this.closed) this.onFrame(e.data); };
    this.input = this.context.createMediaStreamSource(stream);
    this.input.connect(this.node); this.node.connect(this.context.destination);
  }
  capture(enabled) {
    this.stream?.getAudioTracks().forEach(t => { t.enabled = enabled; });
    this.node?.port.postMessage(enabled);
  }
  async resume() { await this.context.resume(); }
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
    this.closed = true; this.capture(false);
    this.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); });
    for (const source of this.sources) { source.onended = null; source.stop(); source.disconnect(); }
    this.sources.clear(); this.node?.disconnect(); this.input?.disconnect();
    this.context?.close().catch(() => {});
  }
}
