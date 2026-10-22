import * as Haptics from 'expo-haptics';

// Local workspace audio asset paths provided by user
const AUDIO_ASSETS = {
  batHit: '/assets/aistudio/cricket_bat_sound_e4f9af83.mp3',
  wicketCrash: '/assets/aistudio/ball_hitting_stumps_7b77d6a9.mp3',
  crowdCheer: '/assets/aistudio/crowd-cheering-383111_243af1d3.mp3'
};

class SoundController {
  public enabled = true;
  public volume = 0.8;
  private audioInstances: Map<string, HTMLAudioElement> = new Map();

  public setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1, val));
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
      // Ignore vibration errors on desktop browsers
    }
  }

  private playLocalAudio(path: string, volumeScale = 1.0) {
    if (!this.enabled || this.volume <= 0 || typeof window === 'undefined') return;
    try {
      // Pre-load / clone audio element for instant zero-latency playback
      const audio = new Audio(path);
      audio.volume = Math.max(0, Math.min(1, this.volume * volumeScale));
      audio.play().catch(() => {
        // Suppress browser autoplay policy restriction warnings
      });
    } catch {
      // Ignore audio errors
    }
  }

  /**
   * Real cricket bat shot sound effect (/assets/aistudio/cricket_bat_sound_e4f9af83.mp3)
   */
  playBatHit(isBoundary = false, isSix = false) {
    this.triggerHaptic(isSix ? 35 : isBoundary ? 25 : 12);
    if (!this.enabled || this.volume <= 0) return;

    this.playLocalAudio(AUDIO_ASSETS.batHit, isSix ? 1.0 : isBoundary ? 0.9 : 0.7);

    if (isBoundary || isSix) {
      setTimeout(() => this.playCrowdCheer(isSix ? 1.0 : 0.7), 150);
    }
  }

  /**
   * Real ball hitting stumps / timber crash sound effect (/assets/aistudio/ball_hitting_stumps_7b77d6a9.mp3)
   */
  playWicketCrash() {
    this.triggerHaptic(50);
    if (!this.enabled || this.volume <= 0) return;

    this.playLocalAudio(AUDIO_ASSETS.wicketCrash, 1.0);
  }

  /**
   * Real stadium crowd cheering sound effect (/assets/aistudio/crowd-cheering-383111_243af1d3.mp3)
   */
  playCrowdCheer(volumeScale = 0.8) {
    if (!this.enabled || this.volume <= 0) return;

    this.playLocalAudio(AUDIO_ASSETS.crowdCheer, volumeScale);
  }

  /**
   * Auction gavel knock / hammer hit
   */
  playGavel() {
    this.triggerHaptic(25);
    if (!this.enabled || this.volume <= 0) return;

    this.playLocalAudio(AUDIO_ASSETS.batHit, 0.6);
  }

  /**
   * Tactile UI button tap / click
   */
  playTap() {
    this.triggerHaptic(8);
  }
}

export const sound = new SoundController();
