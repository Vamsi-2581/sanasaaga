// Web Audio API Synthesizer for Sanakuutio (zero external asset requests)

class SoundEffects {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }

  init() {
    if (!this.ctx && typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTone(freq, type = 'sine', duration = 0.08, gainVal = 0.1) {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Audio fallback silent
    }
  }

  playKey() {
    this.playTone(400, 'triangle', 0.04, 0.05);
  }

  playDelete() {
    this.playTone(280, 'sine', 0.06, 0.05);
  }

  playTileFlip(index = 0) {
    const baseFreq = 300 + index * 60;
    this.playTone(baseFreq, 'sine', 0.1, 0.08);
  }

  playError() {
    this.playTone(180, 'sawtooth', 0.18, 0.08);
  }

  playWin() {
    if (!this.enabled) return;
    const notes = [440, 554.37, 659.25, 880]; // A major arpeggio
    notes.forEach((freq, i) => {
      setTimeout(() => {
        this.playTone(freq, 'triangle', 0.35, 0.12);
      }, i * 110);
    });
  }
}

export const sounds = new SoundEffects();
