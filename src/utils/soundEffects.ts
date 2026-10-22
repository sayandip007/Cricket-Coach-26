import { BallOutcome } from '../types/cricket';

// Local workspace audio asset paths provided by user
const AUDIO_ASSETS = {
  batHit: '/assets/aistudio/cricket_bat_sound_e4f9af83.mp3',
  wicketCrash: '/assets/aistudio/ball_hitting_stumps_7b77d6a9.mp3',
  crowdCheer: '/assets/aistudio/crowd-cheering-383111_243af1d3.mp3'
};

/**
 * Determines whether a given delivery outcome resulted in actual contact between the bat and the ball.
 * - Returns true for: runs off the bat (1, 2, 3, 4, 6), catches, hit-to-fielder dot balls, edges onto stumps/field.
 * - Suppressed (returns false) for: wides, byes, leg byes, leaves, plays and misses, pad hits / LBWs, stumpings off missed balls.
 */
export function checkIsBatContact(outcome: BallOutcome | null): boolean {
  if (!outcome) return false;

  // 1. Explicit Extras with NO bat contact: Wides, Byes, Leg Byes
  if (outcome.isExtra) {
    if (
      outcome.extraType === 'wide' ||
      outcome.extraType === 'bye' ||
      outcome.extraType === 'leg_bye'
    ) {
      return false;
    }
  }

  // 2. Runs scored off the bat
  if ((outcome.batterRuns ?? 0) > 0) {
    return true;
  }
  if (!outcome.isExtra && outcome.runs > 0) {
    return true;
  }
  if (outcome.isFour || outcome.isSix) {
    return true;
  }

  // 3. Wickets
  if (outcome.isWicket) {
    // Caught (field catch, caught behind, caught and bowled) is ALWAYS bat contact
    if (
      outcome.wicketType === 'caught' ||
      (outcome.wicketType as string) === 'caught_behind' ||
      (outcome.wicketType as string) === 'caught_and_bowled'
    ) {
      return true;
    }

    // Bowled off an edge/deflection
    if (outcome.wicketType === 'bowled') {
      const comm = (outcome.commentary || '').toLowerCase();
      if (
        comm.includes('edge') ||
        comm.includes('inside edge') ||
        comm.includes('bottom edge') ||
        comm.includes('deflect')
      ) {
        return true;
      }
      return false; // Clean bowled with no edge
    }

    // Run out off a hit
    if (outcome.wicketType === 'run out') {
      if (
        outcome.extraType === 'bye' ||
        outcome.extraType === 'leg_bye' ||
        outcome.extraType === 'wide'
      ) {
        return false;
      }
      return true;
    }

    // LBW & Stumped off a miss/wide have NO bat contact
    if (outcome.wicketType === 'lbw' || outcome.wicketType === 'stumped') {
      return false;
    }
  }

  // 4. Dot balls and No-Balls with 0 batter runs
  const comm = (outcome.commentary || '').toLowerCase();
  const note = (outcome.tacticalNote || '').toLowerCase();
  const combinedText = `${comm} ${note}`;

  const isNoContactKeyword =
    combinedText.includes('leaves') ||
    combinedText.includes('left alone') ||
    combinedText.includes('play and miss') ||
    combinedText.includes('plays and misses') ||
    combinedText.includes('beaten') ||
    combinedText.includes('misses it') ||
    combinedText.includes('swings and misses') ||
    combinedText.includes('whistles past') ||
    combinedText.includes('padded away') ||
    combinedText.includes('hits the pad') ||
    combinedText.includes('thud onto the pad') ||
    combinedText.includes('struck on the pad') ||
    combinedText.includes('lbw appeal') ||
    combinedText.includes('no contact');

  if (isNoContactKeyword) {
    return false;
  }

  // Otherwise, for any non-extra delivery where a shot was played (e.g. driven, defended, pushed, cut, pulled, hit to fielder for 0 runs), bat contact WAS made.
  return true;
}

class SoundController {
  public enabled = true;
  public volume = 0.8;
  private audioInstances: Map<string, HTMLAudioElement> = new Map();

  public setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1, val));
  }

  private triggerHaptic(ms = 12) {
    try {
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(ms);
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
  }

  /**
   * Tactile UI button tap / click
   */
  playTap() {
    this.triggerHaptic(8);
  }
}

export const sound = new SoundController();

