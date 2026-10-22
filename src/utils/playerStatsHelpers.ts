import { Player, PlayerRole, PlayerStats, MatchLiveState, PlayerMatchLogEntry } from '../types/cricket';
import {
  oversToBalls,
  formatOversDisplay,
  calculateBowlingEconomy,
  isUnsetBestBowling,
  addCricketOvers,
  aggregateBowlerMatchStatsIntoCareer
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

function extractStats(playerOrStats?: Player | PlayerStats): PlayerStats | undefined {
  if (!playerOrStats) return undefined;
  if ('stats' in playerOrStats && playerOrStats.stats) {
    return playerOrStats.stats;
  }
  return playerOrStats as PlayerStats;
}

export function getBattingStats(playerOrStats?: Player | PlayerStats): FormattedBattingStats {
  const stats = extractStats(playerOrStats);
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

export function getBowlingStats(playerOrStats?: Player | PlayerStats): FormattedBowlingStats {
  const stats = extractStats(playerOrStats);
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

export function getKeepingStats(playerOrStats?: Player | PlayerStats, role?: string): FormattedKeepingStats {
  const stats = extractStats(playerOrStats);
  const isKeeper = role ? isWicketkeeperRole(role) : (playerOrStats && 'role' in playerOrStats ? isWicketkeeperRole((playerOrStats as Player).role) : false);
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

/**
 * Dynamically records match participation and statistics to a player record.
 * Guarantees exact-once (idempotent) match aggregation and separates IPL vs International records.
 */
export function recordMatchToPlayerStats(
  p: Player,
  finishedMatch: MatchLiveState,
  seasonKey: string = 'Season 2026'
): Player {
  const matchId = finishedMatch.id || finishedMatch.matchId || `match_${Date.now()}_${Math.random()}`;
  const compStats = p.competitionStats || {};
  const processedIds = new Set(compStats.processedMatchIds || []);

  if (processedIds.has(matchId)) {
    return p; // Idempotent: match already aggregated for this player
  }

  const inn1 = finishedMatch.innings1;
  const inn2 = finishedMatch.innings2;

  const bCard = [...(inn1?.batters || []), ...(inn2?.batters || [])].find(b => b.playerId === p.id);
  const bwCards = [...(inn1?.bowlers || []), ...(inn2?.bowlers || [])].filter(bw => bw.playerId === p.id);

  const inHomeXI = Boolean(finishedMatch.homeTeam?.playingXIIds?.includes(p.id));
  const inAwayXI = Boolean(finishedMatch.awayTeam?.playingXIIds?.includes(p.id));

  if (!bCard && bwCards.length === 0 && !inHomeXI && !inAwayXI) {
    return p; // Player did not participate in this match
  }

  const isInternational = Boolean(
    finishedMatch.isInternational ||
    finishedMatch.leagueId === 'intl' ||
    (p.clubId && p.clubId.startsWith('nat_'))
  );
  const compType: 'ipl' | 'international' = isInternational ? 'international' : 'ipl';

  const didBat = Boolean(
    bCard &&
      (bCard.balls > 0 ||
        bCard.runs > 0 ||
        (bCard.dismissal &&
          bCard.dismissal !== 'not out' &&
          !bCard.dismissal.startsWith('substituted')) ||
        bCard.isOnStrike ||
        bCard.playerId === inn1?.currentStrikerId ||
        bCard.playerId === inn1?.currentNonStrikerId ||
        bCard.playerId === inn2?.currentStrikerId ||
        bCard.playerId === inn2?.currentNonStrikerId)
  );
  const wasDismissed = Boolean(
    bCard &&
      bCard.dismissal &&
      bCard.dismissal !== 'not out' &&
      !bCard.dismissal.startsWith('substituted') &&
      !bCard.dismissal.startsWith('retired hurt')
  );

  const activeBwCards = bwCards.filter(bw => (bw.overs || 0) > 0 || (bw.ballsInCurrentOver || 0) > 0);
  const didBowl = activeBwCards.length > 0;

  // Count catches, stumpings, and run-outs credited in this match
  const isKeeper = isWicketkeeperRole(p.role) || isWicketkeeperRole(p.primaryRole);
  let matchCatches = 0;
  let matchStumpings = 0;
  let matchRunOuts = 0;

  const checkInningsFielding = (inn: typeof inn1) => {
    if (!inn) return;
    const isFieldingTeam =
      inn.bowlingTeamId === p.clubId ||
      (inn.bowlingTeamId === finishedMatch.homeTeam?.id && inHomeXI) ||
      (inn.bowlingTeamId === finishedMatch.awayTeam?.id && inAwayXI);
    if (!isFieldingTeam) return;

    for (const ball of inn.ballHistory || []) {
      if (!ball.isWicket) continue;
      if (ball.wicketType === 'stumped') {
        if (ball.fielderId === p.id || (!ball.fielderId && isKeeper)) {
          matchStumpings += 1;
        }
      } else if (ball.wicketType === 'caught') {
        if (
          ball.fielderId === p.id ||
          ball.fielderName === p.name ||
          (!ball.fielderId && isKeeper && (ball.fielderName === 'Wicketkeeper' || ball.appealType === 'caught_behind'))
        ) {
          matchCatches += 1;
        }
      } else if (ball.wicketType === 'run out') {
        if (ball.fielderId === p.id || ball.fielderName === p.name) {
          matchRunOuts += 1;
        }
      }
    }
  };
  checkInningsFielding(inn1);
  if (inn2) checkInningsFielding(inn2);

  const addRuns = bCard ? bCard.runs : 0;
  const addBalls = bCard ? bCard.balls : 0;
  const addFours = bCard ? bCard.fours : 0;
  const addSixes = bCard ? bCard.sixes : 0;
  const addFifty = bCard && bCard.runs >= 50 && bCard.runs < 100 ? 1 : 0;
  const addHundred = bCard && bCard.runs >= 100 ? 1 : 0;
  const totalWktsThisMatch = bwCards.reduce((sum, c) => sum + (c.wickets || 0), 0);

  const accumulateStats = (prev?: PlayerStats): PlayerStats => {
    const base = prev || {
      matches: 0, runs: 0, balls: 0, fours: 0, sixes: 0,
      fifties: 0, hundreds: 0, highestScore: 0, wickets: 0,
      oversBowled: 0, runsConceded: 0, maidens: 0, bestBowling: '0/0',
      economy: 0, average: 0, strikeRate: 0, innings: 0, dismissals: 0,
      inningsBowled: 0, catches: 0, stumpings: 0, runOuts: 0
    };

    const prevMatches = base.matches || 0;
    const prevInnings = base.innings !== undefined ? base.innings : prevMatches;
    const prevDismissals =
      base.dismissals !== undefined
        ? base.dismissals
        : base.runs && base.average && base.average > 0
        ? Math.max(0, Math.round(base.runs / base.average))
        : Math.max(0, Math.round(prevMatches * 0.75));
    const prevInningsBowled =
      base.inningsBowled !== undefined
        ? base.inningsBowled
        : (base.oversBowled || 0) > 0
        ? Math.max(1, prevMatches)
        : 0;

    const newMatches = prevMatches + 1;
    const newInnings = prevInnings + (didBat ? 1 : 0);
    const newDismissals = prevDismissals + (wasDismissed ? 1 : 0);
    const newInningsBowled = prevInningsBowled + (didBowl ? 1 : 0);

    const newRuns = (base.runs || 0) + addRuns;
    const newBalls = (base.balls || 0) + addBalls;
    const newFours = (base.fours || 0) + addFours;
    const newSixes = (base.sixes || 0) + addSixes;
    const newFifties = (base.fifties || 0) + addFifty;
    const newHundreds = (base.hundreds || 0) + addHundred;
    const newHighest = Math.max(base.highestScore || 0, addRuns);
    const newCatches = (base.catches || 0) + matchCatches;
    const newStumpings = (base.stumpings || 0) + matchStumpings;
    const newRunOuts = (base.runOuts || 0) + matchRunOuts;

    const bowlingAgg = aggregateBowlerMatchStatsIntoCareer(base, bwCards);

    const average = newRuns > 0 ? Number((newRuns / Math.max(1, newDismissals)).toFixed(1)) : 0;
    const strikeRate = newBalls > 0 ? Number(((newRuns / newBalls) * 100).toFixed(1)) : 0;

    return {
      matches: newMatches,
      innings: newInnings,
      dismissals: newDismissals,
      runs: newRuns,
      balls: newBalls,
      fours: newFours,
      sixes: newSixes,
      fifties: newFifties,
      hundreds: newHundreds,
      highestScore: newHighest,
      wickets: bowlingAgg.wickets,
      inningsBowled: newInningsBowled,
      oversBowled: bowlingAgg.oversBowled,
      runsConceded: bowlingAgg.runsConceded,
      maidens: bowlingAgg.maidens,
      bestBowling: bowlingAgg.bestBowling,
      average,
      strikeRate,
      economy: bowlingAgg.economy,
      catches: newCatches,
      stumpings: newStumpings,
      runOuts: newRunOuts
    };
  };

  const updatedOverallStats = accumulateStats(p.stats);

  let iplStats = compStats.ipl;
  let intlStats = compStats.international;
  const iplSeasons = { ...(compStats.iplSeasons || {}) };
  const intlSeasons = { ...(compStats.internationalSeasons || {}) };

  if (compType === 'ipl') {
    iplStats = accumulateStats(iplStats || (p.stats ? { ...p.stats } : undefined));
    iplSeasons[seasonKey] = accumulateStats(iplSeasons[seasonKey]);
  } else {
    intlStats = accumulateStats(intlStats);
    intlSeasons[seasonKey] = accumulateStats(intlSeasons[seasonKey]);
  }

  const homeShort = finishedMatch.homeTeamShort || finishedMatch.homeTeam?.shortName || finishedMatch.homeTeam?.name || 'HOME';
  const awayShort = finishedMatch.awayTeamShort || finishedMatch.awayTeam?.shortName || finishedMatch.awayTeam?.name || 'AWAY';
  const opponentName = (homeShort === p.clubId ? awayShort : homeShort) || 'OPP';
  const matchLog: PlayerMatchLogEntry = {
    matchId,
    dateStr: finishedMatch.dateStr || new Date().toLocaleDateString(),
    opponent: opponentName,
    competition: compType,
    runs: addRuns,
    balls: addBalls,
    fours: addFours,
    sixes: addSixes,
    isOut: wasDismissed,
    wickets: totalWktsThisMatch,
    overs: bwCards.reduce((sum, bw) => sum + (bw.overs || 0), 0),
    runsConceded: bwCards.reduce((sum, bw) => sum + (bw.runs || 0), 0)
  };

  const recentPerformances = [matchLog, ...(compStats.recentPerformances || [])].slice(0, 10);
  const nextProcessedMatchIds = [...Array.from(processedIds), matchId];

  return {
    ...p,
    form: Math.max(40, Math.min(100, p.form + (addRuns >= 35 || totalWktsThisMatch >= 2 ? 4 : -1))),
    stats: updatedOverallStats,
    competitionStats: {
      ...compStats,
      ipl: iplStats,
      international: intlStats,
      iplSeasons,
      internationalSeasons: intlSeasons,
      recentPerformances,
      processedMatchIds: nextProcessedMatchIds
    }
  };
}
