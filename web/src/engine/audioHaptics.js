// Audio procedural ligero con Web Audio API + vibración táctil en móviles compatibles

export class WebAudioHaptics {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastShootTime = 0;
    this.lastStressTime = 0;
  }

  unlock() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
  }

  #vibrate(pattern) {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignorar navegadores que bloquean vibración
      }
    }
  }

  #tone({ freq, endFreq = null, duration = 0.08, type = 'triangle', gain = 0.06 }) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const vol = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }
    vol.gain.setValueAtTime(0.0001, now);
    vol.gain.linearRampToValueAtTime(gain, now + 0.008);
    vol.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(vol);
    vol.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  triggerShoot() {
    const now = performance.now();
    if (now - this.lastShootTime < 140) return;
    this.lastShootTime = now;
    this.#tone({ freq: 640, endFreq: 310, duration: 0.055, type: 'triangle', gain: 0.03 });
  }

  triggerDamage() {
    this.#vibrate([45, 20, 45]);
    this.#tone({ freq: 145, endFreq: 52, duration: 0.16, type: 'sawtooth', gain: 0.09 });
  }

  triggerHeal() {
    this.#vibrate(28);
    this.#tone({ freq: 523.25, endFreq: 783.99, duration: 0.14, type: 'sine', gain: 0.065 });
  }

  triggerLevelUp() {
    this.#vibrate([25, 35, 35]);
    this.#tone({ freq: 440, endFreq: 880, duration: 0.22, type: 'triangle', gain: 0.075 });
  }

  triggerStressTierUp(tierRawValue) {
    const now = performance.now();
    if (now - this.lastStressTime < 750 || tierRawValue <= 0) return;
    this.lastStressTime = now;
    if (tierRawValue === 3) {
      this.#vibrate([30, 50, 30]);
      this.#tone({ freq: 110, endFreq: 85, duration: 0.18, type: 'sawtooth', gain: 0.055 });
    } else if (tierRawValue === 2) {
      this.#vibrate(22);
      this.#tone({ freq: 180, endFreq: 130, duration: 0.12, type: 'triangle', gain: 0.04 });
    }
  }

  triggerRunEnd(survived) {
    this.#vibrate(survived ? [30, 40, 60] : [90, 40, 90]);
    this.#tone({
      freq: survived ? 440 : 210,
      endFreq: survived ? 880 : 65,
      duration: 0.34,
      type: survived ? 'triangle' : 'sawtooth',
      gain: 0.08
    });
  }
}
