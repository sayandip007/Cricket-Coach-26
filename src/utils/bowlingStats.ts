import { BallOutcome, BowlerInningsScorecard, Player, PlayerStats } from '../types/cricket';

/**
 * Converts cricket overs notation (e.g. 3.4 = 3 overs, 4 balls) into total legal balls (22).
 */
export function oversToBalls(overs: number | undefined | null): number {
  if (!overs || Number.isNaN(overs) || overs <= 0) return 0;
  const completedOvers = Math.floor(overs + 1e-6);
  const ballsPart = Math.round((overs - completedOvers) * 10);
  const clampedBalls = Math.max(0, Math.min(5, ballsPart));
  return completedOvers * 6 + clampedBalls;
}

/**
 * Converts total legal balls (e.g. 22) into cricket overs notation (3.4).
 */
export function ballsToOvers(balls: number | undefined | null): number {
  if (!balls || Number.isNaN(balls) || balls <= 0) return 0;
  const totalBalls = Math.max(0, Math.round(balls));
  const completedOvers = Math.floor(totalBalls / 6);
  const remBalls = totalBalls % 6;
  return Number(`${completedOvers}.${remBalls}`);
}

/**
 * Formats total legal balls or cricket overs number into a display string (e.g. "3.4" or "4.0").
 */
export function formatOversDisplay(oversOrBalls: number, isBalls: boolean = false, padZeroDecimal: boolean = false): string {
  const totalBalls = isBalls ? Math.max(0, Math.round(oversOrBalls)) : oversToBalls(oversOrBalls);
  const completedOvers = Math.floor(totalBalls / 6);
  const remBalls = totalBalls % 6;
  if (remBalls === 0 && !padZeroDecimal) {
    return `${completedOvers}`;
  }
  return `${completedOvers}.${remBalls}`;
}

/**
 * Accurately adds two cricket overs figures (e.g. 2.4 + 1.3 = 4.1 overs).
 */
export function addCricketOvers(oversA: number | undefined | null, oversB: number | undefined | null): number {
  const totalBalls = oversToBalls(oversA) + oversToBalls(oversB);
  return ballsToOvers(totalBalls);
}

/**
 * Calculates true cricket economy rate: (runsConceded / legalBalls) * 6, rounded to 2 decimal places.
 */
export function calculateBowlingEconomy(
  runsConceded: number | undefined | null,
  oversOrBalls: number | undefined | null,
  isBalls: boolean = false
): number {
  const runs = Math.max(0, Number(runsConceded) || 0);
  const legalBalls = isBalls ? Math.max(0, Math.round(Number(oversOrBalls) || 0)) : oversToBalls(oversOrBalls);
  if (legalBalls <= 0) {
    return 0;
  }
  return Number(((runs * 6) / legalBalls).toFixed(2));
}

/**
 * Returns true if the delivery counts as a legal ball in the bowler's over.
 * Wides and no-balls are illegal deliveries and do not increment legal ball count.
 * Normal deliveries, byes, and leg-byes are legal deliveries.
 */
export function isLegalBallForBowler(
  isExtra?: boolean,
  extraType?: 'wide' | 'no_ball' | 'bye' | 'leg_bye'
): boolean {
  if (!isExtra && !extraType) return true;
  if (extraType === 'wide' || extraType === 'no_ball') return false;
  return true;
}

/**
 * Calculates runs charged against the bowler's figures for a single delivery.
 * Byes and leg-byes are team extras only and are NOT charged to the bowler.
 * Normal runs, wides, and no-balls ARE charged to the bowler.
 */
export function getRunsChargedToBowler(
  runs: number,
  extraType?: 'wide' | 'no_ball' | 'bye' | 'leg_bye'
): number {
  if (extraType === 'bye' || extraType === 'leg_bye') {
    return 0;
  }
  return Math.max(0, Number(runs) || 0);
}

/**
 * Returns true if the dismissal is credited to the bowler's wicket column.
 * Bowled, caught, LBW, stumped, and hit-wicket count as bowler wickets.
 * Run-out, retired hurt/out, timed out, and obstructing the field do NOT count as bowler wickets.
 */
export function isBowlerCreditedWicket(
  isWicket: boolean,
  wicketType?: string
): boolean {
  if (!isWicket) return false;
  if (!wicketType) return true;
  const norm = wicketType.trim().toLowerCase();
  if (
    norm === 'run out' ||
    norm === 'run_out' ||
    norm === 'run-out' ||
    norm === 'retired hurt' ||
    norm === 'retired out' ||
    norm === 'retired' ||
    norm === 'timed out' ||
    norm === 'obstructing the field'
  ) {
    return false;
  }
  return (
    norm === 'bowled' ||
    norm === 'caught' ||
    norm === 'lbw' ||
    norm === 'stumped' ||
    norm === 'hit wicket' ||
    norm === 'hit_wicket'
  );
}

/**
 * Checks whether a best-bowling string is unset/placeholder ('0/0', '-', '').
 * Note: '1/0' or '0/12' are valid recorded figures, whereas '0/0' is the initial unplayed placeholder.
 */
export function isUnsetBestBowling(bestBowling?: string | null): boolean {
  if (!bestBowling) return true;
  const trimmed = bestBowling.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '0/0' || trimmed === '0-0') {
    return true;
  }
  return !trimmed.includes('/') && !trimmed.includes('-');
}

/**
 * Compares a completed bowling spell (wickets/runs) against an existing bestBowling figure ("W/R").
 * More wickets always wins; equal wickets with fewer runs conceded wins.
 */
export function compareBestBowling(
  currentBest: string | undefined | null,
  spellWickets: number,
  spellRuns: number,
  spellLegalBalls: number = 6
): string {
  const w = Math.max(0, Math.round(spellWickets || 0));
  const r = Math.max(0, Math.round(spellRuns || 0));
  const hasBowledInSpell = spellLegalBalls > 0 || w > 0 || r > 0;

  if (!hasBowledInSpell) {
    return isUnsetBestBowling(currentBest) ? '0/0' : String(currentBest);
  }

  if (isUnsetBestBowling(currentBest)) {
    return `${w}/${r}`;
  }

  const parts = String(currentBest).replace('-', '/').split('/');
  const curW = Number(parts[0]);
  const curR = Number(parts[1]);

  if (Number.isNaN(curW) || Number.isNaN(curR)) {
    return `${w}/${r}`;
  }

  if (w > curW || (w === curW && r < curR)) {
    return `${w}/${r}`;
  }

  return `${curW}/${curR}`;
}

/**
 * Applies a single delivery outcome to the innings bowlers list using the canonical bowler Player object.
 * Guarantees:
 * - Only the bowler with `playerId === actualBowler.id` is updated.
 * - If `actualBowler.id` is not yet in `bowlers`, a new entry is dynamically created and appended.
 * - `isCurrentBowler` is set to true for `actualBowler.id` and false for all other bowlers.
 */
export function applyDeliveryToBowlerScorecard(params: {
  bowlers: BowlerInningsScorecard[];
  actualBowler: Pick<Player, 'id' | 'name'>;
  outcome: BallOutcome;
  currentOverBowlerRuns: number;
}): {
  bowlers: BowlerInningsScorecard[];
  nextOverBowlerRuns: number;
  isOverComplete: boolean;
  updatedBowlerCard: BowlerInningsScorecard;
} {
  const { bowlers, actualBowler, outcome, currentOverBowlerRuns } = params;
  const legalBall = isLegalBallForBowler(outcome.isExtra, outcome.extraType);
  const bowlerRunsAdded = getRunsChargedToBowler(outcome.runs, outcome.extraType);
  const bowlerWicketAdded = isBowlerCreditedWicket(outcome.isWicket, outcome.wicketType) ? 1 : 0;

  const nextOverBowlerRuns = (currentOverBowlerRuns || 0) + bowlerRunsAdded;

  const exists = bowlers.some(bw => bw.playerId === actualBowler.id);
  const workingBowlers: BowlerInningsScorecard[] = exists
    ? bowlers.map(bw => ({
        ...bw,
        isCurrentBowler: bw.playerId === actualBowler.id
      }))
    : [
        ...bowlers.map(bw => ({ ...bw, isCurrentBowler: false })),
        {
          playerId: actualBowler.id,
          name: actualBowler.name,
          overs: 0,
          ballsInCurrentOver: 0,
          maidens: 0,
          runs: 0,
          runsConceded: 0,
          wickets: 0,
          economy: 0,
          isCurrentBowler: true
        }
      ];

  let isOverComplete = false;
  let updatedCard: BowlerInningsScorecard | null = null;

  const nextBowlers = workingBowlers.map(bw => {
    if (bw.playerId !== actualBowler.id) {
      return bw;
    }

    const prevLegalBalls = oversToBalls(bw.overs);
    const nextTotalLegalBalls = legalBall ? prevLegalBalls + 1 : prevLegalBalls;
    const newBallsInOver = legalBall ? bw.ballsInCurrentOver + 1 : bw.ballsInCurrentOver;
    const completedOverNow = legalBall && newBallsInOver >= 6;
    if (completedOverNow) {
      isOverComplete = true;
    }

    const nextOvers = ballsToOvers(nextTotalLegalBalls);
    const remBalls = completedOverNow ? 0 : newBallsInOver;
    const nextRuns = (bw.runs || 0) + bowlerRunsAdded;
    const nextWickets = (bw.wickets || 0) + bowlerWicketAdded;
    const nextMaidens = (bw.maidens || 0) + (completedOverNow && nextOverBowlerRuns === 0 ? 1 : 0);
    const nextEconomy = calculateBowlingEconomy(nextRuns, nextTotalLegalBalls, true);

    const card: BowlerInningsScorecard = {
      ...bw,
      name: actualBowler.name || bw.name,
      overs: nextOvers,
      ballsInCurrentOver: remBalls,
      maidens: nextMaidens,
      runs: nextRuns,
      runsConceded: nextRuns,
      wickets: nextWickets,
      economy: nextEconomy,
      isCurrentBowler: true
    };
    updatedCard = card;
    return card;
  });

  return {
    bowlers: nextBowlers,
    nextOverBowlerRuns: isOverComplete ? 0 : nextOverBowlerRuns,
    isOverComplete,
    updatedBowlerCard: updatedCard || nextBowlers[nextBowlers.length - 1]
  };
}

/**
 * Aggregates all innings bowling scorecards for a specific player into their career/season PlayerStats.
 * Matches strictly by `playerId` across all innings in the match.
 */
export function aggregateBowlerMatchStatsIntoCareer(
  prevStats: PlayerStats,
  playerBowlerEntries: BowlerInningsScorecard[]
): {
  wickets: number;
  oversBowled: number;
  runsConceded: number;
  maidens: number;
  bestBowling: string;
  economy: number;
} {
  const prevLegalBalls = oversToBalls(prevStats.oversBowled);
  let addedLegalBalls = 0;
  let addedRunsConceded = 0;
  let addedWickets = 0;
  let addedMaidens = 0;
  let nextBest = prevStats.bestBowling || '0/0';

  for (const entry of playerBowlerEntries) {
    const entryBalls = oversToBalls(entry.overs);
    const entryRuns = entry.runs ?? entry.runsConceded ?? 0;
    const entryWickets = entry.wickets || 0;
    const entryMaidens = entry.maidens || 0;

    addedLegalBalls += entryBalls;
    addedRunsConceded += entryRuns;
    addedWickets += entryWickets;
    addedMaidens += entryMaidens;

    if (entryBalls > 0 || entryWickets > 0 || entryRuns > 0) {
      nextBest = compareBestBowling(nextBest, entryWickets, entryRuns, entryBalls);
    }
  }

  const totalLegalBalls = prevLegalBalls + addedLegalBalls;
  const totalOversBowled = ballsToOvers(totalLegalBalls);
  const totalRunsConceded = (prevStats.runsConceded || 0) + addedRunsConceded;
  const totalWickets = (prevStats.wickets || 0) + addedWickets;
  const totalMaidens = (prevStats.maidens || 0) + addedMaidens;
  const economy =
    totalLegalBalls > 0
      ? calculateBowlingEconomy(totalRunsConceded, totalLegalBalls, true)
      : prevStats.economy || 0;

  return {
    wickets: totalWickets,
    oversBowled: totalOversBowled,
    runsConceded: totalRunsConceded,
    maidens: totalMaidens,
    bestBowling: nextBest,
    economy
  };
}
