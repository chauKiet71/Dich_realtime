import { SilenceGate } from './core.js';

// Bounded PCM buffer shared with the worklet's 100ms / 24kHz framing.
export class Utterance {
  constructor() { this.gate=new SilenceGate(); this.reset(); }
  reset() { this.frames=[]; this.preRoll=[]; this.bytes=0; this.speech=false; this.gate.reset(); }
  push(buffer, now, flushing=false) {
    const samples=new Int16Array(buffer); let sum=0;
    for (const value of samples) sum+=(value/32768)**2;
    const level=Math.sqrt(sum/samples.length);
    if (!this.speech) {
      this.preRoll.push(buffer); if (this.preRoll.length>3) this.preRoll.shift();
      if (level<this.gate.threshold) return false;
      this.speech=true; this.frames.push(...this.preRoll); this.preRoll=[];
      this.bytes=this.frames.reduce((n,frame)=>n+frame.byteLength,0);
    } else { this.frames.push(buffer); this.bytes+=buffer.byteLength; }
    if (this.bytes>30*48000) throw new Error('Câu nói vượt quá 30 giây. Hãy nói thành các câu ngắn hơn.');
    return !flushing && this.gate.sample(level,now);
  }
  take() {
    const output=new Uint8Array(this.bytes); let offset=0;
    for (const frame of this.frames) { output.set(new Uint8Array(frame),offset); offset+=frame.byteLength; }
    this.reset(); return output;
  }
}
