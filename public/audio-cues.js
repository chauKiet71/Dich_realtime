const PATTERNS = {
  'speech-end': [
    { frequency: 620, offset: 0, duration: 0.1 },
  ],
  'translation-end': [
    { frequency: 820, offset: 0, duration: 0.08 },
    { frequency: 1040, offset: 0.12, duration: 0.1 },
  ],
};

export class AudioCues {
  constructor(context) {
    this.context = context;
    this.groups = new Set();
  }

  async loadReadyAudio() {
    try {
      const response = await fetch('/turn-end.wav', { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return;
      this.readyBuffer = await this.context.decodeAudioData(await response.arrayBuffer());
    } catch { /* Use the existing short beep if the file cannot be loaded. */ }
  }

  play(name, onComplete) {
    if (name === 'connection-ready') {
      if (this.readyBuffer && this.context?.state === 'running') {
        const group = { active: true, nodes: [], onComplete };
        try {
          const source = this.context.createBufferSource();
          group.nodes.push(source); this.groups.add(group);
          source.buffer = this.readyBuffer; source.connect(this.context.destination);
          source.onended = () => {
            source.disconnect();
            if (!group.active) return;
            group.active = false; this.groups.delete(group); onComplete?.();
          };
          source.start();
          return true;
        } catch {
          group.active = false; this.groups.delete(group);
          for (const source of group.nodes) {
            source.onended = null;
            try { source.stop(); source.disconnect(); } catch { /* Not started. */ }
          }
        }
      }
      return this.play('speech-end', onComplete);
    }
    const pattern = PATTERNS[name];
    if (!pattern || this.context?.state !== 'running') {
      if (onComplete) queueMicrotask(onComplete);
      return false;
    }

    try {
      const group = { active: true, remaining: pattern.length, nodes: [], onComplete };
      const start = this.context.currentTime + 0.02;
      this.groups.add(group);

      for (const tone of pattern) {
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        const from = start + tone.offset;
        const to = from + tone.duration;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(tone.frequency, from);
        gain.gain.setValueAtTime(0.08, from);
        gain.gain.exponentialRampToValueAtTime(0.001, to);
        oscillator.connect(gain); gain.connect(this.context.destination);
        oscillator.onended = () => {
          oscillator.disconnect(); gain.disconnect();
          group.remaining--;
          if (group.active && group.remaining === 0) {
            group.active = false; this.groups.delete(group); group.onComplete?.();
          }
        };
        group.nodes.push(oscillator);
        oscillator.start(from); oscillator.stop(to);
      }
      return true;
    } catch {
      this.stop();
      if (onComplete) queueMicrotask(onComplete);
      return false;
    }
  }

  stop() {
    for (const group of this.groups) {
      group.active = false;
      for (const oscillator of group.nodes) {
        oscillator.onended = null;
        try { oscillator.stop(); } catch { /* The tone may already have ended. */ }
        try { oscillator.disconnect(); } catch { /* The node may not be connected. */ }
      }
    }
    this.groups.clear();
  }
}
