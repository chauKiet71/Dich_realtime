// Capture mono PCM16 at 24 kHz, independently of the device's sample rate.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super(); this.active = false; this.frame = new Int16Array(2400); this.used = 0; this.position = 0;
    this.port.onmessage = ({ data }) => { this.active = data === true; this.used = 0; this.position = 0; };
  }
  process(inputs) {
    const samples = inputs[0]?.[0];
    if (!this.active || !samples) return true;
    for (const value of samples) {
      this.position += 24000;
      while (this.position >= sampleRate) {
        this.position -= sampleRate;
        const sample = Math.max(-1, Math.min(1, value));
        this.frame[this.used++] = Math.round(sample * (sample < 0 ? 32768 : 32767));
        if (this.used === this.frame.length) {
          this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
          this.frame = new Int16Array(2400); this.used = 0;
        }
      }
    }
    // Outputs are left silent: captured microphone must never play locally.
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
