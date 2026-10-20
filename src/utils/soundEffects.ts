import * as Haptics from 'expo-haptics';

class SoundController {
  private ctx: AudioContext | null = null;
  public enabled = true;
  public volume = 0.8;

  public setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1, val));
  }

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private triggerHaptic(ms = 12) {
    try {
      if (ms >= 45) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      } else if (ms >= 30) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      } else if (ms >= 20) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      } else {
        Haptics.selectionAsync().catch(() => {});
      }
    } catch {
      // Ignore vibration errors
    }
  }

  // Crisp willow-on-leather bat crack
  playBatHit(isBoundary = false, isSix = false) {
    this.triggerHaptic(isSix ? 35 : isBoundary ? 25 : 12);
    if (!this.enabled || this.volume <= 0) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = isSix ? 'triangle' : 'square';
      osc.frequency.setValueAtTime(isSix ? 280 : 380, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + (isSix ? 0.25 : 0.12));

      gain.gain.setValueAtTime(0.3 * this.volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01 * this.volume, this.ctx.currentTime + (isSix ? 0.3 : 0.15));

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);

      if (isBoundary || isSix) {
        setTimeout(() => this.playCrowdCheer(isSix ? 1.2 : 0.7), 80);
      }
    } catch {
      // Ignore audio context errors
    }
  }

  // Wicket crashing into stumps
  playWicketCrash() {
    this.triggerHaptic(50);
    if (!this.enabled || this.volume <= 0) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      // Noise burst for timber crash
      const bufferSize = this.ctx.sampleRate * 0.3;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, this.ctx.currentTime);
      filter.Q.setValueAtTime(3, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.5 * this.volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01 * this.volume, this.ctx.currentTime + 0.3);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start();
      noise.stop(this.ctx.currentTime + 0.3);
    } catch {
      // Ignore audio errors
    }
  }

  // Crowd cheer roar
  playCrowdCheer(duration = 0.8) {
    if (!this.enabled || this.volume <= 0) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.15;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(500, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.01 * this.volume, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2 * this.volume, this.ctx.currentTime + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001 * this.volume, this.ctx.currentTime + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start();
      noise.stop(this.ctx.currentTime + duration);
    } catch {
      // Ignore audio errors
    }
  }

  // Auction gavel hammer knock
  playGavel() {
    if (!this.enabled || this.volume <= 0) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, this.ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.4 * this.volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01 * this.volume, this.ctx.currentTime + 0.18);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.2);
    } catch {
      // Ignore audio errors
    }
  }

  // Subtle UI click / tactile tap
  playTap() {
    this.triggerHaptic(8);
    if (!this.enabled || this.volume <= 0) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.1 * this.volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01 * this.volume, this.ctx.currentTime + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch {
      // Ignore
    }
  }
}

export const sound = new SoundController();
