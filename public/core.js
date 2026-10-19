export class SilenceGate {
  constructor({ silenceMs = 700, threshold = 0.018 } = {}) {
    this.silenceMs = silenceMs;
    this.threshold = threshold;
    this.reset();
  }
  reset() { this.firstVoice = null; this.lastVoice = null; this.speechMs = 0; }
  sample(level, now) {
    if (level >= this.threshold) {
      if (this.firstVoice === null) this.firstVoice = now;
      if (this.lastVoice !== null) this.speechMs += Math.min(200, now - this.lastVoice);
      this.lastVoice = now;
      return false;
    }
    if (this.lastVoice !== null && now - this.lastVoice >= this.silenceMs) {
      const submit = this.speechMs >= 160;
      this.reset();
      return submit;
    }
    return false;
  }
  remaining(now) {
    return this.lastVoice === null ? null : Math.max(0, this.silenceMs - (now - this.lastVoice));
  }
}
export class TranscriptStore {
  constructor() { this.entries = new Map(); }
  update(id, text, done = false) {
    const previous = this.entries.get(id);
    if (previous?.done) return previous;
    const next = { id, text: (done ? text : (previous?.text ?? '') + text).slice(0, 20000), done };
    this.entries.set(id, next);
    if (this.entries.size > 200) this.entries.delete(this.entries.keys().next().value);
    return next;
  }
  items() { return [...this.entries.values()]; }
}
