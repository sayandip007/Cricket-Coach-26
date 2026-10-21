import { Player, PlayerRole } from '../types/cricket';
import {
  oversToBalls,
  formatOversDisplay,
  calculateBowlingEconomy,
  isUnsetBestBowling
} from './bowlingStats';

export interface FormattedBattingStats {
  hasBatted: boolean;
  matches: string;
  innings: string;
  runs: string;
  highestScore: string;
  average: string;
  strikeRate: string;
  balls: string;
  fours: string;
  sixes: string;
  fifties: string;
  hundreds: string;
}

export interface FormattedBowlingStats {
  hasBowled: boolean;
  matches: string;
  inningsBowled: string;
  overs: string;
  maidens: string;
  runsConceded: string;
  wickets: string;
  bestBowling: string;
  average: string;
  economy: string;
  strikeRate: string;
}

export interface FormattedKeepingStats {
  hasKept: boolean;
  catches: string;
  stumpings: string;
  totalDismissals: string;
}

export interface RoleDisciplineConfig {
  showBatting: boolean;
  showBowling: boolean;
  showKeeping: boolean;
}

export function normalizeRole(role?: PlayerRole | string): string {
  if (!role) return '';
  return role.toString().toLowerCase().trim();
}

export function isAllRounderRole(role?: PlayerRole | string): boolean {
  const norm = normalizeRole(role);
  return norm.includes('all-round') || norm.includes('all_round') || norm.includes('allround');
}

export function isWicketkeeperRole(role?: PlayerRole | string): boolean {
  const norm = normalizeRole(role);
  return norm.includes('wk') || norm.includes('keeper');
}

export function isBowlerRole(role?: PlayerRole | string): boolean {
  const norm = normalizeRole(role);
  return norm.includes('pace') || norm.includes('spin') || norm.includes('bowler');
}

export function isBatterRole(role?: PlayerRole | string): boolean {
  const norm = normalizeRole(role);
  return norm.includes('top-order') || norm.includes('middle-order') || norm.includes('batter') || norm.includes('batsman') || norm.includes('finisher');
}

export function getRoleDisciplines(player: Player): RoleDisciplineConfig {
  const stats = player.stats;
  const role = player.role || '';

  const isKeeper = isWicketkeeperRole(role);
  const hasKeepingData = stats ? (
    (typeof stats.catches === 'number' && stats.catches > 0) ||
    (typeof stats.stumpings === 'number' && stats.stumpings > 0)
  ) : false;

  return {
    showBatting: true, // Batting stats card is common to every player
    showBowling: true, // Bowling stats card is common to every player
    showKeeping: isKeeper || hasKeepingData
  };
}

export function getBattingStats(player: Player): FormattedBattingStats {
  const stats = player.stats;
  if (!stats) {
    return {
      hasBatted: false,
      matches: '-',
      innings: '-',
      runs: '-',
      highestScore: '-',
      average: '-',
      strikeRate: '-',
      balls: '-',
      fours: '-',
      sixes: '-',
      fifties: '-',
      hundreds: '-'
    };
  }

  const matches = typeof stats.matches === 'number' && !Number.isNaN(stats.matches) ? stats.matches : 0;
  const runs = typeof stats.runs === 'number' && !Number.isNaN(stats.runs) ? stats.runs : 0;
  const balls = typeof stats.balls === 'number' && !Number.isNaN(stats.balls) ? stats.balls : 0;
  const highestScore = typeof stats.highestScore === 'number' && !Number.isNaN(stats.highestScore) ? stats.highestScore : 0;
  const fours = typeof stats.fours === 'number' && !Number.isNaN(stats.fours) ? stats.fours : 0;
  const sixes = typeof stats.sixes === 'number' && !Number.isNaN(stats.sixes) ? stats.sixes : 0;
  const fifties = typeof stats.fifties === 'number' && !Number.isNaN(stats.fifties) ? stats.fifties : 0;
  const hundreds = typeof stats.hundreds === 'number' && !Number.isNaN(stats.hundreds) ? stats.hundreds : 0;
  const innings = typeof stats.innings === 'number' && !Number.isNaN(stats.innings) ? stats.innings : undefined;
  const dismissals = typeof stats.dismissals === 'number' && !Number.isNaN(stats.dismissals) ? stats.dismissals : undefined;

  const hasBatted = runs > 0 || balls > 0 || highestScore > 0 || (innings !== undefined && innings > 0);

  if (!hasBatted) {
    return {
      hasBatted: false,
      matches: matches > 0 ? String(matches) : '-',
      innings: innings !== undefined ? String(innings) : '-',
      runs: '-',
      highestScore: '-',
      average: '-',
      strikeRate: '-',
      balls: '-',
      fours: '-',
      sixes: '-',
      fifties: '-',
      hundreds: '-'
    };
  }

  let averageStr = '-';
  if (dismissals !== undefined && dismissals > 0) {
    averageStr = (runs / dismissals).toFixed(2);
  } else if (typeof stats.average === 'number' && !Number.isNaN(stats.average) && isFinite(stats.average) && stats.average > 0) {
    averageStr = stats.average.toFixed(2);
  } else if (runs > 0) {
    averageStr = typeof stats.average === 'number' && stats.average >= 0 ? stats.average.toFixed(2) : '-';
  } else if (runs === 0 && balls > 0) {
    averageStr = '0.00';
  }

  let strikeRateStr = '-';
  if (balls > 0) {
    strikeRateStr = ((runs / balls) * 100).toFixed(2);
  } else if (typeof stats.strikeRate === 'number' && !Number.isNaN(stats.strikeRate) && isFinite(stats.strikeRate) && stats.strikeRate > 0) {
    strikeRateStr = stats.strikeRate.toFixed(2);
  }

  return {
    hasBatted: true,
    matches: String(matches),
    innings: innings !== undefined ? String(innings) : '-',
    runs: String(runs),
    highestScore: String(highestScore),
    average: averageStr,
    strikeRate: strikeRateStr,
    balls: String(balls),
    fours: String(fours),
    sixes: String(sixes),
    fifties: String(fifties),
    hundreds: String(hundreds)
  };
}

export function getBowlingStats(player: Player): FormattedBowlingStats {
  const stats = player.stats;
  if (!stats) {
    return {
      hasBowled: false,
      matches: '-',
      inningsBowled: '-',
      overs: '-',
      maidens: '-',
      runsConceded: '-',
      wickets: '-',
      bestBowling: '-',
      average: '-',
      economy: '-',
      strikeRate: '-'
    };
  }

  const matches = typeof stats.matches === 'number' && !Number.isNaN(stats.matches) ? stats.matches : 0;
  const oversBowled = typeof stats.oversBowled === 'number' && !Number.isNaN(stats.oversBowled) ? stats.oversBowled : 0;
  const legalBalls = oversToBalls(oversBowled);
  const wickets = typeof stats.wickets === 'number' && !Number.isNaN(stats.wickets) ? stats.wickets : 0;
  const runsConceded = typeof stats.runsConceded === 'number' && !Number.isNaN(stats.runsConceded) ? stats.runsConceded : 0;
  const maidens = typeof stats.maidens === 'number' && !Number.isNaN(stats.maidens) ? stats.maidens : 0;
  const inningsBowled = typeof stats.inningsBowled === 'number' && !Number.isNaN(stats.inningsBowled) ? stats.inningsBowled : undefined;
  const bestBowling = stats.bestBowling;

  const hasBowled = legalBalls > 0 || wickets > 0 || runsConceded > 0 || (!isUnsetBestBowling(bestBowling) && bestBowling !== '0/0' && bestBowling !== '-');

  if (!hasBowled) {
    return {
      hasBowled: false,
      matches: matches > 0 ? String(matches) : '-',
      inningsBowled: inningsBowled !== undefined ? String(inningsBowled) : '-',
      overs: '-',
      maidens: '-',
      runsConceded: '-',
      wickets: '-',
      bestBowling: '-',
      average: '-',
      economy: '-',
      strikeRate: '-'
    };
  }

  let bestBowlingStr = '-';
  if (!isUnsetBestBowling(bestBowling) && bestBowling !== '0/0' && bestBowling !== '-') {
    bestBowlingStr = bestBowling!;
  } else if (wickets > 0 || runsConceded > 0) {
    bestBowlingStr = `${wickets}/${runsConceded}`;
  }

  let averageStr = '-';
  if (wickets > 0) {
    averageStr = (runsConceded / wickets).toFixed(2);
  }

  let economyStr = '-';
  if (legalBalls > 0) {
    economyStr = calculateBowlingEconomy(runsConceded, legalBalls, true).toFixed(2);
  } else if (typeof stats.economy === 'number' && !Number.isNaN(stats.economy) && isFinite(stats.economy) && stats.economy > 0) {
    economyStr = stats.economy.toFixed(2);
  }

  let strikeRateStr = '-';
  if (wickets > 0 && legalBalls > 0) {
    strikeRateStr = (legalBalls / wickets).toFixed(2);
  }

  return {
    hasBowled: true,
    matches: String(matches),
    inningsBowled: inningsBowled !== undefined ? String(inningsBowled) : '-',
    overs: formatOversDisplay(oversBowled, false, true),
    maidens: String(maidens),
    runsConceded: String(runsConceded),
    wickets: String(wickets),
    bestBowling: bestBowlingStr,
    average: averageStr,
    economy: economyStr,
    strikeRate: strikeRateStr
  };
}

export function getKeepingStats(player: Player): FormattedKeepingStats {
  const stats = player.stats;
  const isKeeper = isWicketkeeperRole(player.role);
  if (!stats) {
    return {
      hasKept: isKeeper,
      catches: '-',
      stumpings: '-',
      totalDismissals: '-'
    };
  }

  const catches = typeof stats.catches === 'number' && !Number.isNaN(stats.catches) ? stats.catches : undefined;
  const stumpings = typeof stats.stumpings === 'number' && !Number.isNaN(stats.stumpings) ? stats.stumpings : undefined;
  const hasKept = catches !== undefined || stumpings !== undefined || isKeeper;

  let totalDismissals = '-';
  if (catches !== undefined || stumpings !== undefined) {
    totalDismissals = String((catches || 0) + (stumpings || 0));
  }

  return {
    hasKept,
    catches: catches !== undefined ? String(catches) : '-',
    stumpings: stumpings !== undefined ? String(stumpings) : '-',
    totalDismissals
  };
}
