import {
  Player,
  Team,
  MatchLiveState,
  InningsData,
  BatterInningsScorecard,
  BowlerInningsScorecard,
  BallOutcome,
  FielderPosition
} from '../types/cricket';
import {
  simulateBall,
  createSeededRng,
  isPaceBowler
} from './cricketEngine';
import {
  applyDeliveryToBowlerScorecard,
  oversToBalls,
  isLegalBallForBowler,
  getRunsChargedToBowler
} from '../utils/bowlingStats';

export const DEFAULT_MATCH_FIELD: FielderPosition[] = [
  { id: 1, name: 'Slip', x: 14, y: -22, isDeep: false, isBoundary: false },
  { id: 2, name: 'Third Man', x: 58, y: -58, isDeep: true, isBoundary: true },
  { id: 3, name: 'Point', x: 38, y: -6, isDeep: false, isBoundary: false },
  { id: 4, name: 'Cover', x: 34, y: 20, isDeep: false, isBoundary: false },
  { id: 5, name: 'Long Off', x: 30, y: 76, isDeep: true, isBoundary: true },
  { id: 6, name: 'Long On', x: -30, y: 76, isDeep: true, isBoundary: true },
  { id: 7, name: 'Mid-Wicket', x: -36, y: 18, isDeep: false, isBoundary: false },
  { id: 8, name: 'Deep Square Leg', x: -76, y: -8, isDeep: true, isBoundary: true },
  { id: 9, name: 'Short Fine Leg', x: -24, y: -26, isDeep: false, isBoundary: false }
];

export interface FormatQuotaConfig {
  maxOvers: number;
  maxBalls: number;
  maxOversPerBowler: number;
  maxBallsPerBowler: number;
  maxWickets: number;
}

export function getFormatQuotaConfig(
  format: 'T20' | 'ODI' | 'TEST' | '100BALL',
  customMaxOvers?: number
): FormatQuotaConfig {
  if (format === '100BALL') {
    return {
      maxOvers: 16.4,
      maxBalls: 100,
      maxOversPerBowler: 4,
      maxBallsPerBowler: 24, // 4 six-ball overs max per bowler
      maxWickets: 10
    };
  }
  if (format === 'TEST') {
    const maxOvers = customMaxOvers && customMaxOvers > 0 ? customMaxOvers : 90;
    return {
      maxOvers,
      maxBalls: Math.round(maxOvers * 6),
      maxOversPerBowler: 999,
      maxBallsPerBowler: 5994,
      maxWickets: 10
    };
  }
  if (format === 'ODI') {
    const maxOvers = customMaxOvers && customMaxOvers > 0 ? customMaxOvers : 50;
    const maxOversPerBowler = Math.max(1, Math.ceil(maxOvers / 5));
    return {
      maxOvers,
      maxBalls: Math.round(maxOvers * 6),
      maxOversPerBowler,
      maxBallsPerBowler: maxOversPerBowler * 6,
      maxWickets: 10
    };
  }
  // Default T20
  const maxOvers = customMaxOvers && customMaxOvers > 0 ? customMaxOvers : 20;
  const maxOversPerBowler = Math.max(1, Math.ceil(maxOvers / 5));
  return {
    maxOvers,
    maxBalls: Math.round(maxOvers * 6),
    maxOversPerBowler,
    maxBallsPerBowler: maxOversPerBowler * 6,
    maxWickets: 10
  };
}

/**
 * Ensures at least 5-6 bowling options exist in the innings scorecard so a team never runs out of quota-eligible bowlers.
 */
export function buildBowlerScorecardPool(bowlingXI: Player[]): BowlerInningsScorecard[] {
  const frontline = bowlingXI.filter(
    p =>
      p.role === 'Pace' ||
      p.role === 'Spin' ||
      p.role === 'All-rounder' ||
      p.role === 'Bowler' ||
      p.role === 'All-Rounder'
  );
  let pool = [...frontline];
  if (pool.length < 6) {
    const chosenIds = new Set(pool.map(p => p.id));
    const backups = bowlingXI
      .filter(p => !chosenIds.has(p.id) && p.role !== 'Wk-bat' && p.role !== 'Wicketkeeper')
      .sort((a, b) => (b.ratings.bowl || 0) - (a.ratings.bowl || 0));
    for (const b of backups) {
      if (pool.length >= 6) break;
      pool.push(b);
    }
  }
  if (pool.length === 0) {
    pool = bowlingXI.slice(0, Math.min(6, bowlingXI.length));
  }
  return pool.map((p, idx) => ({
    playerId: p.id,
    name: p.name,
    overs: 0,
    ballsInCurrentOver: 0,
    maidens: 0,
    runs: 0,
    wickets: 0,
    economy: 0,
    isCurrentBowler: idx === 0
  }));
}

/**
 * Selects the next eligible bowler at an over boundary:
 * - Never selects `justBowledPlayerId` (no consecutive overs by the same bowler)
 * - Respects `maxBallsPerBowler` quota
 * - Rotates realistically across the bowling attack based on spell workload and phase of the innings
 */
export function selectNextEligibleBowler(
  bowlers: BowlerInningsScorecard[],
  justBowledPlayerId: string,
  maxBallsPerBowler: number,
  nextOverNumber: number,
  format: 'T20' | 'ODI' | 'TEST' | '100BALL',
  playerPool: Player[]
): string {
  const nonConsecutiveAndUnderQuota = bowlers.filter(
    b => b.playerId !== justBowledPlayerId && oversToBalls(b.overs) < maxBallsPerBowler
  );
  const nonConsecutiveFallback = bowlers.filter(b => b.playerId !== justBowledPlayerId);
  const candidates =
    nonConsecutiveAndUnderQuota.length > 0
      ? nonConsecutiveAndUnderQuota
      : nonConsecutiveFallback.length > 0
      ? nonConsecutiveFallback
      : bowlers;

  if (candidates.length === 0) return justBowledPlayerId;

  const isPowerplay =
    (format === 'T20' && nextOverNumber < 6) ||
    (format === 'ODI' && nextOverNumber < 10) ||
    (format === '100BALL' && nextOverNumber < 4);
  const isDeath =
    (format === 'T20' && nextOverNumber >= 15) ||
    (format === 'ODI' && nextOverNumber >= 40) ||
    (format === '100BALL' && nextOverNumber >= 13);

  let bestId = candidates[0].playerId;
  let bestScore = -Infinity;

  for (const cand of candidates) {
    const pObj = playerPool.find(p => p.id === cand.playerId);
    const ballsBowled = oversToBalls(cand.overs);
    const oversBowled = ballsBowled / 6;

    const bowlSkill = pObj?.ratings.bowl ?? 72;
    const ctrlSkill = pObj?.ratings.ctrl ?? 70;
    const dthSkill = pObj?.ratings.dth ?? 68;
    const isPace = pObj ? isPaceBowler(pObj) : true;

    let phaseScore = bowlSkill * 0.65 + ctrlSkill * 0.35;
    if (isPowerplay) {
      phaseScore += isPace ? 8 : -4;
    } else if (isDeath) {
      phaseScore = dthSkill * 0.55 + bowlSkill * 0.45 + (isPace ? 4 : 0);
    } else {
      // Middle overs favor spin and balanced workload distribution
      phaseScore += !isPace ? 7 : 0;
    }

    // Encourage spreading overs across Top 5 bowlers
    const workloadPenalty = oversBowled * 5.5;
    const totalScore = phaseScore - workloadPenalty;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestId = cand.playerId;
    }
  }

  return bestId;
}

/**
 * Transitions from Innings 1 to Innings 2, or finalizes the match result (including Win by Runs, Win by Wickets, or Tie).
 */
export function finalizeInningsOrMatchState(
  currState: MatchLiveState,
  playerPool: Player[]
): MatchLiveState {
  const currInn = currState.currentInningsIndex === 1 ? currState.innings1 : currState.innings2;
  if (!currInn) return currState;

  if (currState.currentInningsIndex === 1) {
    const newBattingTeam =
      currState.innings1.bowlingTeamId === currState.homeTeam.id
        ? currState.homeTeam
        : currState.awayTeam;
    const newBowlingTeam =
      currState.innings1.battingTeamId === currState.homeTeam.id
        ? currState.homeTeam
        : currState.awayTeam;

    const combinedPool = [
      ...playerPool,
      ...(currState.homeTeam.squad || []),
      ...(currState.awayTeam.squad || [])
    ];
    const findPlayer = (id: string) => combinedPool.find(p => p.id === id);

    const newBattingXI = (newBattingTeam.playingXIIds || [])
      .map(findPlayer)
      .filter((p): p is Player => Boolean(p));
    const newBowlingXI = (newBowlingTeam.playingXIIds || [])
      .map(findPlayer)
      .filter((p): p is Player => Boolean(p));

    const finalBatters =
      newBattingXI.length >= 2
        ? newBattingXI
        : newBattingTeam.squad && newBattingTeam.squad.length >= 2
        ? newBattingTeam.squad.slice(0, 11)
        : combinedPool.filter(p => p.clubId === newBattingTeam.id).slice(0, 11);

    const finalBowlers =
      newBowlingXI.length >= 2
        ? newBowlingXI
        : newBowlingTeam.squad && newBowlingTeam.squad.length >= 2
        ? newBowlingTeam.squad.slice(0, 11)
        : combinedPool.filter(p => p.clubId === newBowlingTeam.id).slice(0, 11);

    const initBatters2: BatterInningsScorecard[] = finalBatters.map((p, idx) => ({
      playerId: p.id,
      name: p.name,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      dismissal: 'not out',
      strikeRate: 0,
      isOnStrike: idx === 0
    }));

    const initBowlers2 = buildBowlerScorecardPool(finalBowlers);

    const innings2: InningsData = {
      battingTeamId: newBattingTeam.id,
      bowlingTeamId: newBowlingTeam.id,
      runs: 0,
      wickets: 0,
      overs: 0,
      ballsCompleted: 0,
      maxOvers: currState.innings1.maxOvers,
      currentOverRuns: 0,
      extras: { total: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0 },
      batters: initBatters2,
      bowlers: initBowlers2,
      currentStrikerId: finalBatters[0]?.id || 'p1',
      currentNonStrikerId: finalBatters[1]?.id || 'p2',
      currentBowlerId: initBowlers2[0]?.playerId || finalBowlers[0]?.id || 'b1',
      ballHistory: [],
      fallOfWickets: [],
      overRuns: []
    };

    const revisedTarget = currState.dlsState?.isInterrupted
      ? currState.dlsState.dlsTargetRuns
      : currState.innings1.runs + 1;

    return {
      ...currState,
      currentInningsIndex: 2,
      innings2,
      targetRuns: revisedTarget,
      status: 'in_progress',
      isBallInFlight: false,
      ballsRemainingInInnings: currState.format === '100BALL' ? 100 : undefined,
      powerSurgeTaken: false,
      powerSurgeOversLeft: 0
    };
  }

  // Finalize Innings 2 -> Match Finished
  const target = currState.targetRuns || currState.innings1.runs + 1;
  const parScore = target - 1;
  const dlsSuffix = currState.dlsState?.isInterrupted ? ' (DLS Method)' : '';

  if (currInn.runs >= target) {
    const winnerId = currInn.battingTeamId;
    const winnerTeam =
      winnerId === currState.homeTeam.id ? currState.homeTeam : currState.awayTeam;
    const wktsLeft = Math.max(1, 10 - currInn.wickets);
    const resultText = `${winnerTeam.shortName} WON BY ${wktsLeft} WICKET${wktsLeft > 1 ? 'S' : ''}!${dlsSuffix}`;

    return {
      ...currState,
      status: 'finished',
      winnerTeamId: winnerId,
      resultText,
      isBallInFlight: false
    };
  }

  if (currInn.runs === parScore) {
    // Exact Tie!
    if (currState.playoffStage) {
      // Playoff knockouts require a progression winner via Super Over
      const winnerId = currState.homeTeam.id;
      return {
        ...currState,
        status: 'finished',
        winnerTeamId: winnerId,
        resultText: `MATCH TIED (${currInn.runs}/${currInn.wickets}) — ${currState.homeTeam.shortName} WON VIA SUPER OVER!`,
        isBallInFlight: false
      };
    }

    return {
      ...currState,
      status: 'finished',
      winnerTeamId: undefined,
      resultText: `MATCH TIED! (${currInn.runs} apiece)${dlsSuffix}`,
      isBallInFlight: false
    };
  }

  // Defending team won by runs
  const winnerId = currState.innings1.battingTeamId;
  const winnerTeam =
    winnerId === currState.homeTeam.id ? currState.homeTeam : currState.awayTeam;
  const runMargin = Math.max(1, parScore - currInn.runs);
  const resultText = `${winnerTeam.shortName} WON BY ${runMargin} RUN${runMargin > 1 ? 'S' : ''}!${dlsSuffix}`;

  return {
    ...currState,
    status: 'finished',
    winnerTeamId: winnerId,
    resultText,
    isBallInFlight: false
  };
}

export interface ResolveDeliveryOptions {
  rng?: () => number;
  forcedOutcome?: Partial<BallOutcome>;
  playerMap?: Map<string, Player>;
}

/**
 * Single authoritative ball-by-ball resolution pathway.
 * Enforces all cricket laws:
 * - Legal balls vs extras (wide, no_ball, bye, leg_bye)
 * - Batter runs vs team extras vs bowler runs conceded
 * - Legal dismissal validation (no bowled/caught/lbw/stumped on no_ball; bowler credit rules)
 * - Odd/even strike rotation, end-of-over strike swap, and wicket on final ball of over
 * - Bowler quota and consecutive over prevention
 * - Immediate chase completion and tie detection
 */
export function resolveSingleDeliveryState(
  currState: MatchLiveState,
  playerPool: Player[],
  options?: ResolveDeliveryOptions
): MatchLiveState {
  if (currState.status === 'finished') return currState;
  if (currState.activeDrsReview?.isActive) return currState;

  const currInn = currState.currentInningsIndex === 1 ? currState.innings1 : currState.innings2;
  if (!currInn) return currState;

  const quota = getFormatQuotaConfig(currState.format, currInn.maxOvers);
  const maxBalls = quota.maxBalls;
  const maxWickets = Math.min(10, Math.max(1, currInn.batters.length - 1));

  // Pre-delivery check if innings is already over
  if (
    currInn.wickets >= maxWickets ||
    currInn.ballsCompleted >= maxBalls ||
    (currState.currentInningsIndex === 2 &&
      currState.targetRuns !== null &&
      currInn.runs >= currState.targetRuns)
  ) {
    return finalizeInningsOrMatchState(currState, playerPool);
  }

  const combinedPool = options?.playerMap
    ? playerPool
    : [
        ...playerPool,
        ...(currState.homeTeam.squad || []),
        ...(currState.awayTeam.squad || [])
      ];
  const findPlayer = (id: string): Player | undefined =>
    options?.playerMap ? options.playerMap.get(id) : combinedPool.find(p => p.id === id);

  // Ensure striker and non-striker are distinct and valid
  let strikerId = currInn.currentStrikerId;
  let nonStrikerId = currInn.currentNonStrikerId;
  if (strikerId === nonStrikerId) {
    const alt = currInn.batters.find(
      b => b.playerId !== strikerId && b.dismissal === 'not out'
    );
    if (alt) nonStrikerId = alt.playerId;
  }

  const strikerCard = currInn.batters.find(b => b.playerId === strikerId) || currInn.batters[0];
  const nonStrikerCard =
    currInn.batters.find(b => b.playerId === nonStrikerId) ||
    currInn.batters[1] ||
    currInn.batters[0];
  const bowlerCard =
    currInn.bowlers.find(b => b.playerId === currInn.currentBowlerId) || currInn.bowlers[0];

  const fallbackPlayer = combinedPool[0] || {
    id: 'fallback_p',
    name: 'Cricketer',
    role: 'All-rounder',
    bowlingArm: 'RAM',
    battingHand: 'RHB',
    age: 26,
    country: 'India',
    clubId: currInn.battingTeamId,
    isOverseas: false,
    tier: 'Gold',
    basePriceCr: 2,
    salaryCr: 2,
    ratings: { bat: 75, pow: 75, tmp: 75, bowl: 75, pace: 75, ctrl: 75, dth: 75, fit: 90 },
    form: 75,
    morale: 80,
    fitness: 90,
    isInjured: false,
    injuryDays: 0,
    stats: {
      matches: 0, runs: 0, balls: 0, fours: 0, sixes: 0, fifties: 0, hundreds: 0,
      highestScore: 0, wickets: 0, oversBowled: 0, runsConceded: 0, maidens: 0, bestBowling: '0/0'
    }
  };

  const striker = findPlayer(strikerCard.playerId) || {
    ...fallbackPlayer,
    id: strikerCard.playerId,
    name: strikerCard.name
  };
  const nonStriker = findPlayer(nonStrikerCard.playerId) || {
    ...fallbackPlayer,
    id: nonStrikerCard.playerId,
    name: nonStrikerCard.name
  };
  const bowler = findPlayer(bowlerCard.playerId) || {
    ...fallbackPlayer,
    id: bowlerCard.playerId,
    name: bowlerCard.name
  };

  const over = Math.floor(currInn.ballsCompleted / 6);
  const ballNumber = currInn.ballsCompleted % 6;

  // Step 1: Generate or apply forced delivery outcome
  let ballOutcome: BallOutcome;
  if (options?.forcedOutcome) {
    const fo = options.forcedOutcome;
    ballOutcome = {
      over,
      ballNumber,
      bowlerId: bowler.id,
      bowlerName: bowler.name,
      strikerId: striker.id,
      strikerName: striker.name,
      nonStrikerId: nonStriker.id,
      nonStrikerName: nonStriker.name,
      runs: fo.runs ?? 0,
      batterRuns: fo.batterRuns,
      extraRuns: fo.extraRuns,
      bowlerChargedRuns: fo.bowlerChargedRuns,
      isLegalDelivery: fo.isLegalDelivery,
      isWicket: Boolean(fo.isWicket),
      wicketType: fo.wicketType,
      fielderName: fo.fielderName,
      dismissedPlayerId: fo.dismissedPlayerId || (fo.isWicket ? striker.id : undefined),
      dismissedPlayerName: fo.dismissedPlayerName || (fo.isWicket ? striker.name : undefined),
      dismissalText: fo.dismissalText,
      appealType: fo.appealType || 'none',
      isFour: Boolean(fo.isFour ?? fo.runs === 4),
      isSix: Boolean(fo.isSix ?? fo.runs === 6),
      isExtra: Boolean(fo.isExtra),
      extraType: fo.extraType,
      bowlerSpeedMps: fo.bowlerSpeedMps ?? 138,
      shotAngleDeg: fo.shotAngleDeg ?? 45,
      shotDistanceM: fo.shotDistanceM ?? 30,
      commentary: fo.commentary || `${bowler.name} to ${striker.name}`,
      tacticalNote: fo.tacticalNote || ''
    };
  } else {
    ballOutcome = simulateBall({
      over,
      ballNumber,
      striker,
      nonStriker,
      bowler,
      pitchType: currState.pitchType,
      weather: currState.weather,
      format: currState.format,
      hasDew: currState.hasDew,
      powerSurgeActive: (currState.powerSurgeOversLeft || 0) > 0,
      rng: options?.rng,
      matchSituation: {
        currentInningsIndex: currState.currentInningsIndex,
        currentRuns: currInn.runs,
        wickets: currInn.wickets,
        ballsCompleted: currInn.ballsCompleted,
        maxBalls,
        targetRuns: currState.targetRuns,
        strikerBallsFaced: strikerCard.balls,
        strikerRuns: strikerCard.runs
      },
      bowlingTactics: currState.bowlingTactics,
      battingTactics: currState.battingTactics
    });
  }

  // Step 2: Validate extras & dismissal legality under Cricket Laws
  const extraType = ballOutcome.isExtra ? (ballOutcome.extraType || 'wide') : undefined;
  const isLegalDelivery = isLegalBallForBowler(ballOutcome.isExtra, extraType);

  let isWicket = ballOutcome.isWicket;
  let wicketType = ballOutcome.wicketType;

  // Law 21.18: On a No-Ball, a batter CANNOT be out bowled, caught, lbw, or stumped (only run out)
  if (extraType === 'no_ball' && isWicket && wicketType !== 'run out') {
    isWicket = false;
    wicketType = undefined;
  }
  // Law 22.9: On a Wide, a batter CANNOT be out bowled, caught, or lbw (only stumped or run out)
  if (extraType === 'wide' && isWicket && wicketType !== 'stumped' && wicketType !== 'run out') {
    isWicket = false;
    wicketType = undefined;
  }

  // Step 3: Separate batterRuns, extraRuns, and bowlerChargedRuns
  let batterRuns = 0;
  let extraRuns = 0;
  if (!ballOutcome.isExtra) {
    batterRuns = ballOutcome.batterRuns ?? ballOutcome.runs;
    extraRuns = 0;
  } else if (extraType === 'wide') {
    batterRuns = 0;
    extraRuns = ballOutcome.extraRuns ?? Math.max(1, ballOutcome.runs);
  } else if (extraType === 'no_ball') {
    extraRuns = ballOutcome.extraRuns ?? 1;
    batterRuns = ballOutcome.batterRuns ?? Math.max(0, ballOutcome.runs - extraRuns);
  } else if (extraType === 'bye' || extraType === 'leg_bye') {
    batterRuns = 0;
    extraRuns = ballOutcome.extraRuns ?? Math.max(1, ballOutcome.runs);
  }

  const teamRunsAdded = batterRuns + extraRuns;
  const bowlerChargedRuns =
    extraType === 'bye' || extraType === 'leg_bye'
      ? 0
      : getRunsChargedToBowler(teamRunsAdded, extraType);

  // Only batter fours/sixes count towards batter's 4s/6s
  const isBatterFour = batterRuns === 4;
  const isBatterSix = batterRuns === 6;

  // Resolve exact participating fielderId for catches, stumpings, and run-outs
  let resolvedFielderId = ballOutcome.fielderId;
  if (isWicket && !resolvedFielderId && (wicketType === 'caught' || wicketType === 'stumped' || wicketType === 'run out')) {
    const fieldingTeam =
      currInn.bowlingTeamId === currState.homeTeam.id ? currState.homeTeam : currState.awayTeam;
    const xiFromIds = (fieldingTeam.playingXIIds || [])
      .map(findPlayer)
      .filter((p): p is Player => Boolean(p));
    const fieldingXI =
      xiFromIds.length >= 2
        ? xiFromIds
        : fieldingTeam.squad && fieldingTeam.squad.length >= 2
        ? fieldingTeam.squad.slice(0, 11)
        : combinedPool.filter(p => p.clubId === fieldingTeam.id).slice(0, 11);

    const exactNameMatch = ballOutcome.fielderName
      ? fieldingXI.find(p => p.name.toLowerCase() === ballOutcome.fielderName!.toLowerCase())
      : undefined;

    if (exactNameMatch) {
      resolvedFielderId = exactNameMatch.id;
    } else if (
      wicketType === 'stumped' ||
      ballOutcome.fielderName === 'Wicketkeeper' ||
      ballOutcome.appealType === 'caught_behind'
    ) {
      const keeper =
        fieldingXI.find(
          p =>
            p.role === 'Wk-bat' ||
            p.role === 'Wicketkeeper' ||
            (p.primaryRole && p.primaryRole.toLowerCase().includes('keeper'))
        ) || fieldingXI[0];
      resolvedFielderId = keeper?.id;
    } else if (wicketType === 'caught' && ballOutcome.fielderName === 'Bowler') {
      resolvedFielderId = bowler.id;
    } else if (fieldingXI.length > 0) {
      const outfieldPool = fieldingXI.filter(
        p => p.id !== bowler.id && p.role !== 'Wk-bat' && p.role !== 'Wicketkeeper'
      );
      const poolToUse = outfieldPool.length > 0 ? outfieldPool : fieldingXI;
      const fNameStr = ballOutcome.fielderName || 'Cover';
      let hash = currInn.ballsCompleted;
      for (let c = 0; c < fNameStr.length; c++) {
        hash = (hash * 31 + fNameStr.charCodeAt(c)) >>> 0;
      }
      resolvedFielderId = poolToUse[hash % poolToUse.length]?.id;
    }
  }

  // Normalize ballOutcome fields so ballHistory is 100% consistent
  ballOutcome = {
    ...ballOutcome,
    runs: teamRunsAdded,
    batterRuns,
    extraRuns,
    bowlerChargedRuns,
    isLegalDelivery,
    isWicket,
    wicketType,
    fielderId: resolvedFielderId,
    isFour: isBatterFour || (Boolean(ballOutcome.isExtra) && extraRuns === 4),
    isSix: isBatterSix
  };

  // Step 4: Legal ball & over accounting
  const newBallsCompleted = isLegalDelivery ? currInn.ballsCompleted + 1 : currInn.ballsCompleted;
  const newWickets = isWicket ? currInn.wickets + 1 : currInn.wickets;
  const newRuns = currInn.runs + teamRunsAdded;
  const newOvers = Math.floor(newBallsCompleted / 6) + (newBallsCompleted % 6) / 10;
  const isOverComplete = isLegalDelivery && newBallsCompleted % 6 === 0;

  // Extras breakdown update
  const prevExtras = currInn.extras || { total: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0 };
  const updatedExtras = {
    total: prevExtras.total + extraRuns,
    wides: prevExtras.wides + (extraType === 'wide' ? extraRuns : 0),
    noBalls: prevExtras.noBalls + (extraType === 'no_ball' ? extraRuns : 0),
    byes: prevExtras.byes + (extraType === 'bye' ? extraRuns : 0),
    legByes: prevExtras.legByes + (extraType === 'leg_bye' ? extraRuns : 0)
  };

  // Step 5: Strike rotation & incoming batter selection
  let nextStrikerId = strikerId;
  let nextNonStrikerId = nonStrikerId;
  let incomingBatterId: string | undefined;

  if (isWicket) {
    const dismissedId = ballOutcome.dismissedPlayerId || strikerId;
    const survivorId = dismissedId === strikerId ? nonStrikerId : strikerId;

    const nextUnusedBatter = currInn.batters.find(
      b =>
        b.playerId !== strikerId &&
        b.playerId !== nonStrikerId &&
        b.dismissal === 'not out' &&
        b.balls === 0 &&
        b.runs === 0
    );

    if (nextUnusedBatter) {
      incomingBatterId = nextUnusedBatter.playerId;
      ballOutcome = { ...ballOutcome, incomingBatterId };
      // Incoming batter takes the dismissed batter's end first
      if (dismissedId === nonStrikerId) {
        nextStrikerId = survivorId;
        nextNonStrikerId = nextUnusedBatter.playerId;
      } else {
        nextStrikerId = nextUnusedBatter.playerId;
        nextNonStrikerId = survivorId;
      }
    }

    // If the wicket fell on the 6th legal ball of the over, ends change for the new over!
    if (isOverComplete) {
      const temp = nextStrikerId;
      nextStrikerId = nextNonStrikerId;
      nextNonStrikerId = temp;
    }
  } else {
    // Physical runs crossed between the wickets
    let physicalRunsCrossed = batterRuns;
    if (extraType === 'bye' || extraType === 'leg_bye') {
      physicalRunsCrossed = extraRuns;
    } else if (extraType === 'wide') {
      physicalRunsCrossed = Math.max(0, extraRuns - 1);
    }

    if (physicalRunsCrossed % 2 === 1) {
      const temp = nextStrikerId;
      nextStrikerId = nextNonStrikerId;
      nextNonStrikerId = temp;
    }

    if (isOverComplete) {
      const temp = nextStrikerId;
      nextStrikerId = nextNonStrikerId;
      nextNonStrikerId = temp;
    }
  }

  // Step 6: Update Batters Scorecard
  const dismissedPlayerId = isWicket ? (ballOutcome.dismissedPlayerId || strikerId) : undefined;
  const updatedBatters = currInn.batters.map(b => {
    const isThisStriker = b.playerId === strikerId;
    const isThisDismissed = isWicket && b.playerId === dismissedPlayerId;

    if (!isThisStriker && !isThisDismissed) {
      return {
        ...b,
        isOnStrike: b.playerId === nextStrikerId && b.dismissal === 'not out'
      };
    }

    const updatedRuns = isThisStriker ? b.runs + batterRuns : b.runs;
    const updatedBalls = isThisStriker ? (isLegalDelivery ? b.balls + 1 : b.balls) : b.balls;
    const updatedFours = isThisStriker ? (isBatterFour ? b.fours + 1 : b.fours) : b.fours;
    const updatedSixes = isThisStriker ? (isBatterSix ? b.sixes + 1 : b.sixes) : b.sixes;
    const updatedDismissal = isThisDismissed
      ? ballOutcome.dismissalText || `${wicketType || 'b'} ${bowler.name}`
      : b.dismissal;

    return {
      ...b,
      runs: updatedRuns,
      balls: updatedBalls,
      fours: updatedFours,
      sixes: updatedSixes,
      dismissal: updatedDismissal,
      isOut: updatedDismissal !== 'not out',
      strikeRate:
        updatedBalls > 0 ? Number(((updatedRuns / updatedBalls) * 100).toFixed(1)) : 0,
      isOnStrike: b.playerId === nextStrikerId && updatedDismissal === 'not out'
    };
  });

  // Step 7: Update Bowlers Scorecard & Rotate Bowler at Over Boundary
  const currentOverRunsBeforeBall = currInn.currentOverRuns || 0;
  const bowlerUpdate = applyDeliveryToBowlerScorecard({
    bowlers: currInn.bowlers,
    actualBowler: bowler,
    outcome: ballOutcome,
    currentOverBowlerRuns: currentOverRunsBeforeBall
  });
  let updatedBowlers = bowlerUpdate.bowlers;

  let nextBowlerId = currInn.currentBowlerId;
  if (isOverComplete) {
    const nextOverNum = Math.floor(newBallsCompleted / 6);
    nextBowlerId = selectNextEligibleBowler(
      updatedBowlers,
      currInn.currentBowlerId,
      quota.maxBallsPerBowler,
      nextOverNum,
      currState.format,
      combinedPool
    );
    updatedBowlers = updatedBowlers.map(b => ({
      ...b,
      isCurrentBowler: b.playerId === nextBowlerId
    }));
  }

  // Step 8: Update Fall of Wickets & Over Runs
  const updatedFow = isWicket
    ? [
        ...currInn.fallOfWickets,
        {
          runs: newRuns,
          wicketNum: newWickets,
          over: newOvers,
          batterName: ballOutcome.dismissedPlayerName || striker.name
        }
      ]
    : currInn.fallOfWickets;

  const updatedOverRuns = [...currInn.overRuns];
  const currentOverIdx = Math.floor((newBallsCompleted - (isLegalDelivery ? 1 : 0)) / 6);
  if (currentOverIdx >= 0) {
    updatedOverRuns[currentOverIdx] = (updatedOverRuns[currentOverIdx] || 0) + teamRunsAdded;
  }

  const nextCurrentOverRuns = isOverComplete
    ? 0
    : currentOverRunsBeforeBall + bowlerChargedRuns;

  const updatedInnings: InningsData = {
    ...currInn,
    runs: newRuns,
    wickets: newWickets,
    overs: newOvers,
    ballsCompleted: newBallsCompleted,
    currentOverRuns: nextCurrentOverRuns,
    extras: updatedExtras,
    batters: updatedBatters,
    bowlers: updatedBowlers,
    currentStrikerId: nextStrikerId,
    currentNonStrikerId: nextNonStrikerId,
    currentBowlerId: nextBowlerId,
    ballHistory: [ballOutcome, ...currInn.ballHistory.slice(0, 649)],
    fallOfWickets: updatedFow,
    overRuns: updatedOverRuns
  };

  const nextDewState =
    currState.hasDew ||
    (currState.weather === 'Clear Night' &&
      currState.currentInningsIndex === 2 &&
      newBallsCompleted >= 36);
  const nextPowerSurgeLeft =
    isOverComplete && (currState.powerSurgeOversLeft || 0) > 0
      ? Math.max(0, (currState.powerSurgeOversLeft || 0) - 1)
      : currState.powerSurgeOversLeft;
  const nextHundredBallsLeft =
    currState.format === '100BALL'
      ? Math.max(0, 100 - newBallsCompleted)
      : currState.ballsRemainingInInnings;

  const nextState: MatchLiveState = {
    ...currState,
    innings1: currState.currentInningsIndex === 1 ? updatedInnings : currState.innings1,
    innings2: currState.currentInningsIndex === 2 ? updatedInnings : currState.innings2,
    lastBallOutcome: ballOutcome,
    isBallInFlight: false,
    hasDew: nextDewState,
    powerSurgeOversLeft: nextPowerSurgeLeft,
    ballsRemainingInInnings: nextHundredBallsLeft
  };

  // Step 9: Check Innings / Match Termination Conditions immediately
  const isTargetReached =
    currState.currentInningsIndex === 2 &&
    currState.targetRuns !== null &&
    newRuns >= currState.targetRuns;
  const isAllOut = newWickets >= maxWickets;
  const isOversDone = newBallsCompleted >= maxBalls;

  if (isTargetReached || isAllOut || isOversDone) {
    return finalizeInningsOrMatchState(nextState, combinedPool);
  }

  return nextState;
}

/**
 * Constructs a clean MatchLiveState for any match or headless simulation.
 */
export function createHeadlessMatchState(params: {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  venue: string;
  format: 'T20' | 'ODI' | 'TEST' | '100BALL';
  leagueId: string;
  playerPool: Player[];
  pitchType?: MatchLiveState['pitchType'];
  weather?: MatchLiveState['weather'];
  hasDew?: boolean;
  battingTactics?: MatchLiveState['battingTactics'];
  bowlingTactics?: MatchLiveState['bowlingTactics'];
}): MatchLiveState {
  const {
    id,
    homeTeam,
    awayTeam,
    venue,
    format,
    leagueId,
    playerPool,
    pitchType = 'Natural',
    weather = 'Clear Night',
    hasDew = false,
    battingTactics,
    bowlingTactics
  } = params;

  const combinedPool = [
    ...playerPool,
    ...(homeTeam.squad || []),
    ...(awayTeam.squad || [])
  ];
  const findPlayer = (pid: string) => combinedPool.find(p => p.id === pid);

  const homeXI = (homeTeam.playingXIIds || [])
    .map(findPlayer)
    .filter((p): p is Player => Boolean(p));
  const awayXI = (awayTeam.playingXIIds || [])
    .map(findPlayer)
    .filter((p): p is Player => Boolean(p));

  const finalHomeXI =
    homeXI.length >= 2
      ? homeXI
      : homeTeam.squad && homeTeam.squad.length >= 2
      ? homeTeam.squad.slice(0, 11)
      : combinedPool.filter(p => p.clubId === homeTeam.id).slice(0, 11);

  const finalAwayXI =
    awayXI.length >= 2
      ? awayXI
      : awayTeam.squad && awayTeam.squad.length >= 2
      ? awayTeam.squad.slice(0, 11)
      : combinedPool.filter(p => p.clubId === awayTeam.id).slice(0, 11);

  const initBatters: BatterInningsScorecard[] = finalHomeXI.map((p, idx) => ({
    playerId: p.id,
    name: p.name,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    dismissal: 'not out',
    strikeRate: 0,
    isOnStrike: idx === 0
  }));

  const initBowlers = buildBowlerScorecardPool(finalAwayXI);
  const quota = getFormatQuotaConfig(format);

  const innings1: InningsData = {
    battingTeamId: homeTeam.id,
    bowlingTeamId: awayTeam.id,
    runs: 0,
    wickets: 0,
    overs: 0,
    ballsCompleted: 0,
    maxOvers: quota.maxOvers,
    currentOverRuns: 0,
    extras: { total: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0 },
    batters: initBatters,
    bowlers: initBowlers,
    currentStrikerId: finalHomeXI[0]?.id || 'h1',
    currentNonStrikerId: finalHomeXI[1]?.id || 'h2',
    currentBowlerId: initBowlers[0]?.playerId || finalAwayXI[0]?.id || 'a1',
    ballHistory: [],
    fallOfWickets: [],
    overRuns: []
  };

  return {
    id,
    fixtureId: id,
    leagueId,
    isInternational: leagueId === 'intl',
    format,
    homeTeam,
    awayTeam,
    venue,
    pitchType,
    weather,
    currentInningsIndex: 1,
    innings1,
    innings2: null,
    targetRuns: null,
    status: 'in_progress',
    lastBallOutcome: null,
    isBallInFlight: false,
    reviewsRemaining: { home: 2, away: 2 },
    activeDrsReview: null,
    dlsState: null,
    hasDew,
    tacticalTrapAlert: null,
    ballsRemainingInInnings: format === '100BALL' ? 100 : undefined,
    powerSurgeTaken: false,
    powerSurgeOversLeft: 0,
    bowlingTactics: bowlingTactics || {
      length: 'good',
      line: 'outside_off',
      angle: 'over',
      variation: 'Stock ball',
      fielders: DEFAULT_MATCH_FIELD
    },
    battingTactics: battingTactics || {
      approach: 'balanced',
      targetSide: 'all',
      runningRisk: 'normal'
    }
  };
}

/**
 * Runs a full match from current state to 'finished' using the single authoritative delivery engine.
 */
export function simulateFullMatchHeadless(
  initialState: MatchLiveState,
  playerPool: Player[],
  seedOrRng?: number | (() => number)
): MatchLiveState {
  const rng =
    typeof seedOrRng === 'function'
      ? seedOrRng
      : typeof seedOrRng === 'number'
      ? createSeededRng(seedOrRng)
      : Math.random;

  const playerMap = new Map<string, Player>();
  for (const p of playerPool) playerMap.set(p.id, p);
  for (const p of initialState.homeTeam.squad || []) playerMap.set(p.id, p);
  for (const p of initialState.awayTeam.squad || []) playerMap.set(p.id, p);

  let curr: MatchLiveState = { ...initialState, activeDrsReview: null };
  const maxSafetyDeliveries = curr.format === 'TEST' ? 1400 : curr.format === 'ODI' ? 750 : 360;

  for (let i = 0; i < maxSafetyDeliveries; i++) {
    if (curr.status === 'finished') break;
    curr = resolveSingleDeliveryState(curr, playerPool, { rng, playerMap });
  }

  if (curr.status !== 'finished') {
    curr = finalizeInningsOrMatchState(curr, playerPool);
    if (curr.status !== 'finished') {
      curr = finalizeInningsOrMatchState(curr, playerPool);
    }
  }

  return curr;
}

/**
 * Simulates only Innings 1 of a match using the single authoritative delivery engine.
 */
export function simulateFirstInningsHeadless(
  initialState: MatchLiveState,
  playerPool: Player[],
  seedOrRng?: number | (() => number)
): InningsData {
  const rng =
    typeof seedOrRng === 'function'
      ? seedOrRng
      : typeof seedOrRng === 'number'
      ? createSeededRng(seedOrRng)
      : Math.random;

  const playerMap = new Map<string, Player>();
  for (const p of playerPool) playerMap.set(p.id, p);
  for (const p of initialState.homeTeam.squad || []) playerMap.set(p.id, p);
  for (const p of initialState.awayTeam.squad || []) playerMap.set(p.id, p);

  let curr: MatchLiveState = { ...initialState, currentInningsIndex: 1, activeDrsReview: null };
  const maxSafetyDeliveries = curr.format === 'TEST' ? 700 : curr.format === 'ODI' ? 380 : 180;

  for (let i = 0; i < maxSafetyDeliveries; i++) {
    if (curr.currentInningsIndex !== 1 || curr.status === 'finished') break;
    curr = resolveSingleDeliveryState(curr, playerPool, { rng, playerMap });
  }

  return curr.innings1;
}

