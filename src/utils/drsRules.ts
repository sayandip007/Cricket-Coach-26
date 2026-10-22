import { BallOutcome } from '../types/cricket';

export interface DrsEligibility {
  canReview: boolean;
  reason: string;
  reviewType: 'lbw' | 'caught_behind' | 'none';
}

export interface DrsDeliveryEvidence {
  snickoSpike: boolean;
  hawkeye: {
    pitching: 'In-line' | 'Outside Off' | 'Outside Leg';
    impact: 'In-line' | "Umpire's Call" | 'Outside Off';
    wickets: 'Hitting Stumps' | 'Missing Stumps' | "Umpire's Call";
  };
  originalDecision: 'OUT' | 'NOT OUT';
  finalDecision: 'OUT' | 'NOT OUT';
  isOverturned: boolean;
  isUmpiresCall: boolean;
  reviewRetained: boolean;
  reviewType: 'lbw' | 'caught_behind';
  evidenceSource: 'recorded_telemetry' | 'deterministic_hash';
  uncertaintyNote?: string;
}

/**
 * Get initial reviews count based on match format rules:
 * - TEST: 3 reviews per team per innings
 * - T20 / ODI / Default: 2 reviews per team per innings
 */
export function getInitialReviewsForFormat(format?: string): number {
  if (format === 'TEST') return 3;
  return 2;
}

export interface DrsEligibilityOptions {
  isDrsActive?: boolean;
  matchStatus?: 'in_progress' | 'innings_break' | 'finished';
  latestBallOutcome?: BallOutcome | null;
}

/**
 * Canonical Cricket DRS Rules & Eligibility Check
 * Single source of truth across GameContext handlers and all UI entry points.
 */
export function checkDrsEligibility(
  outcome: BallOutcome | null | undefined,
  isUserBatting: boolean,
  reviewsRemaining: number,
  options?: DrsEligibilityOptions
): DrsEligibility {
  if (!outcome) {
    return { canReview: false, reason: 'No ball bowled yet to review.', reviewType: 'none' };
  }
  if (options?.matchStatus && options.matchStatus !== 'in_progress') {
    return { canReview: false, reason: 'DRS reviews are only available while the innings is in progress.', reviewType: 'none' };
  }
  if (options?.isDrsActive) {
    return { canReview: false, reason: 'A DRS review is already in progress.', reviewType: 'none' };
  }
  if (options && 'latestBallOutcome' in options) {
    const latest = options.latestBallOutcome;
    if (
      !latest ||
      latest.over !== outcome.over ||
      latest.ballNumber !== outcome.ballNumber ||
      latest.bowlerId !== outcome.bowlerId ||
      latest.strikerId !== outcome.strikerId
    ) {
      return { canReview: false, reason: 'Only the most recent delivery can be reviewed.', reviewType: 'none' };
    }
  }
  if (outcome.drsReviewed) {
    return { canReview: false, reason: 'DRS already used for this delivery.', reviewType: 'none' };
  }
  if (outcome.isExtra) {
    if (outcome.extraType === 'wide') {
      return { canReview: false, reason: 'Wide deliveries cannot be reviewed.', reviewType: 'none' };
    }
    if (outcome.extraType === 'no_ball') {
      return { canReview: false, reason: 'No-ball deliveries cannot be reviewed for LBW or caught behind.', reviewType: 'none' };
    }
    if (outcome.appealType !== 'lbw' && outcome.appealType !== 'caught_behind') {
      return { canReview: false, reason: 'Extras without a valid dismissal appeal cannot be reviewed.', reviewType: 'none' };
    }
  }
  if (reviewsRemaining <= 0) {
    return { canReview: false, reason: 'No DRS reviews remaining (0 left).', reviewType: 'none' };
  }

  if (isUserBatting) {
    // Batting review: Batter can ONLY challenge a confirmed LBW or Caught-Behind (Keeper/Slip) OUT decision
    if (!outcome.isWicket) {
      return { canReview: false, reason: 'Batting team can only review when given OUT.', reviewType: 'none' };
    }

    const wt = outcome.wicketType;
    const f = (outcome.fielderName || '').toLowerCase().trim();
    const d = (outcome.dismissalText || '').toLowerCase().trim();

    // 1. LBW Dismissal
    if (wt === 'lbw' || d.startsWith('lbw') || d.includes('lbw b ')) {
      return { canReview: true, reason: 'LBW decision: Review ball trajectory with Hawk-Eye.', reviewType: 'lbw' };
    }

    // 2. Caught Behind by Wicketkeeper or Slip ONLY
    const isExplicitCaughtBehind =
      outcome.appealType === 'caught_behind' ||
      f === 'keeper' ||
      f === 'wicketkeeper' ||
      f === 'wk' ||
      f.includes('slip') ||
      d.startsWith('c keeper ') ||
      d.startsWith('c wicketkeeper ') ||
      d.startsWith('c †') ||
      d.startsWith('c wk ') ||
      d.startsWith('c slip ') ||
      d.startsWith('c first slip ') ||
      d.startsWith('c second slip ');

    if (wt === 'caught' && isExplicitCaughtBehind) {
      return { canReview: true, reason: 'Caught behind: Review bat edge with UltraEdge Snickometer.', reviewType: 'caught_behind' };
    }

    // 3. Non-reviewable dismissals
    if (wt === 'caught') {
      return {
        canReview: false,
        reason: `Outfield catch by ${outcome.fielderName || 'fielder'}. DRS only permitted for LBWs and edges to keeper/slip.`,
        reviewType: 'none'
      };
    }
    if (wt === 'bowled') {
      return { canReview: false, reason: 'Clean bowled: Stumps broken. Cannot be reviewed.', reviewType: 'none' };
    }
    if (wt === 'run out') {
      return { canReview: false, reason: 'Run-out: Line decision adjudicated by 3rd Umpire.', reviewType: 'none' };
    }
    if (wt === 'stumped') {
      return { canReview: false, reason: 'Stumped: Line decision adjudicated by 3rd Umpire.', reviewType: 'none' };
    }

    return { canReview: false, reason: 'DRS is restricted to LBWs and edges to keeper/slip.', reviewType: 'none' };
  } else {
    // Bowling review: Fielding captain appealing a NOT OUT decision
    if (outcome.isWicket) {
      return { canReview: false, reason: 'Batter is already OUT.', reviewType: 'none' };
    }

    // Cannot review boundaries
    if (outcome.isFour || outcome.isSix) {
      return { canReview: false, reason: 'Clean boundary scored. No dismissal appeal.', reviewType: 'none' };
    }

    // Cannot review scoring runs unless an explicit appealType was recorded on the delivery
    if (outcome.runs > 0 && outcome.appealType !== 'lbw' && outcome.appealType !== 'caught_behind') {
      return { canReview: false, reason: 'Runs scored with no dismissal appeal.', reviewType: 'none' };
    }

    // 1. Primary check: explicit typed appealType on BallOutcome
    if (outcome.appealType === 'none') {
      return { canReview: false, reason: 'No LBW or edge-to-keeper appeal on this ball.', reviewType: 'none' };
    }
    if (outcome.appealType === 'caught_behind') {
      return { canReview: true, reason: 'Appeal for faint edge to keeper (UltraEdge Snickometer).', reviewType: 'caught_behind' };
    }
    if (outcome.appealType === 'lbw') {
      return { canReview: true, reason: 'Appeal for LBW on pads (Hawk-Eye Ball Tracking).', reviewType: 'lbw' };
    }

    // 2. Legacy fallback ONLY when appealType is undefined:
    // Require a positive explicit appeal ("appeal") combined with a clear LBW or caught-behind mechanism.
    // Never infer an appeal from zero runs, generic "beaten", "pad", "defended", "missed", or negated "no appeal".
    const comm = (outcome.commentary || '').toLowerCase();
    const tac = (outcome.tacticalNote || '').toLowerCase();
    const isNegatedAppeal =
      comm.includes('no appeal') ||
      comm.includes('without appeal') ||
      tac.includes('no appeal') ||
      tac.includes('without appeal');
    const hasExplicitAppeal = !isNegatedAppeal && (comm.includes('appeal') || tac.includes('appeal'));

    if (hasExplicitAppeal) {
      const hasEdgeContext =
        comm.includes('edge') ||
        comm.includes('nick') ||
        comm.includes('snick') ||
        comm.includes('keeper') ||
        comm.includes('caught behind') ||
        tac.includes('edge') ||
        tac.includes('caught behind');

      if (hasEdgeContext) {
        return { canReview: true, reason: 'Appeal for faint edge to keeper (UltraEdge Snickometer).', reviewType: 'caught_behind' };
      }

      const hasLbwContext =
        comm.includes('lbw') ||
        comm.includes('pad') ||
        comm.includes('in front') ||
        tac.includes('lbw') ||
        tac.includes('pad');

      if (hasLbwContext) {
        return { canReview: true, reason: 'Appeal for LBW on pads (Hawk-Eye Ball Tracking).', reviewType: 'lbw' };
      }
    }

    return { canReview: false, reason: 'No LBW or edge-to-keeper appeal on this ball.', reviewType: 'none' };
  }
}

/**
 * Deterministic Hash Generator for Ball Outcome Evidence
 * Guarantees that reviewing the same delivery multiple times produces
 * 100% identical evidence and verdicts without arbitrary random rolls.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Deterministic DRS Evidence & Verdict Evaluator
 * Evaluates recorded delivery telemetry or deterministic delivery hash.
 * Explicitly models Umpire's Call and tracking uncertainty.
 */
export function evaluateDrsDeliveryEvidence(
  outcome: BallOutcome,
  isUserBatting: boolean,
  onFieldCall: 'OUT' | 'NOT OUT',
  line?: string,
  length?: string,
  forcedReviewType?: 'lbw' | 'caught_behind'
): DrsDeliveryEvidence {
  let reviewType: 'lbw' | 'caught_behind' = forcedReviewType || 'lbw';
  if (!forcedReviewType) {
    const el = checkDrsEligibility(outcome, isUserBatting, 2);
    if (el.reviewType === 'caught_behind') {
      reviewType = 'caught_behind';
    } else {
      reviewType = 'lbw';
    }
  }

  const seedString = `${outcome.over}_${outcome.ballNumber}_${outcome.bowlerId}_${outcome.strikerId}_${outcome.runs}_${outcome.wicketType || 'none'}_${outcome.dismissalText || ''}_${outcome.bowlerSpeedMps || 36}`;
  const seed = hashString(seedString);
  const normalizedVal = (seed % 1000) / 1000;

  // 1. Batting Review (On-Field OUT)
  if (onFieldCall === 'OUT') {
    if (reviewType === 'lbw') {
      // LBW Batting Review:
      // ~45% overturned to NOT OUT (inside edge or missing stumps)
      // ~25% Umpire's Call (OUT stands, review retained)
      // ~30% Clear OUT (OUT stands, review lost)
      if (normalizedVal < 0.20) {
        // Inside edge on UltraEdge!
        return {
          snickoSpike: true,
          hawkeye: { pitching: 'In-line', impact: 'In-line', wickets: 'Hitting Stumps' },
          originalDecision: 'OUT',
          finalDecision: 'NOT OUT',
          isOverturned: true,
          isUmpiresCall: false,
          reviewRetained: true,
          reviewType: 'lbw',
          evidenceSource: 'deterministic_hash',
          uncertaintyNote: 'UltraEdge audio spike confirms inside-edge contact before pad.'
        };
      } else if (normalizedVal < 0.45) {
        // Missing stumps on Hawk-Eye
        return {
          snickoSpike: false,
          hawkeye: { pitching: 'In-line', impact: 'In-line', wickets: 'Missing Stumps' },
          originalDecision: 'OUT',
          finalDecision: 'NOT OUT',
          isOverturned: true,
          isUmpiresCall: false,
          reviewRetained: true,
          reviewType: 'lbw',
          evidenceSource: 'deterministic_hash',
          uncertaintyNote: 'Hawk-Eye ball tracking confirms trajectory missing stumps over top.'
        };
      } else if (normalizedVal < 0.70) {
        // Umpire's Call (trimmings bails / marginal impact) -> OUT stands, Review Retained!
        return {
          snickoSpike: false,
          hawkeye: { pitching: 'In-line', impact: "Umpire's Call", wickets: "Umpire's Call" },
          originalDecision: 'OUT',
          finalDecision: 'OUT',
          isOverturned: false,
          isUmpiresCall: true,
          reviewRetained: true,
          reviewType: 'lbw',
          evidenceSource: 'deterministic_hash',
          uncertaintyNote: 'Hawk-Eye margin ±15mm: Umpire\'s Call on impact/wickets. On-field OUT stands.'
        };
      } else {
        // Clear OUT -> OUT stands, Review Lost!
        return {
          snickoSpike: false,
          hawkeye: { pitching: 'In-line', impact: 'In-line', wickets: 'Hitting Stumps' },
          originalDecision: 'OUT',
          finalDecision: 'OUT',
          isOverturned: false,
          isUmpiresCall: false,
          reviewRetained: false,
          reviewType: 'lbw',
          evidenceSource: 'deterministic_hash',
          uncertaintyNote: 'Three Reds on Hawk-Eye: Clear LBW.'
        };
      }
    } else {
      // Caught Behind Batting Review:
      // ~50% no spike (Overturned to NOT OUT, Review Retained)
      // ~50% clear spike (OUT stands, Review Lost)
      if (normalizedVal < 0.50) {
        return {
          snickoSpike: false,
          hawkeye: { pitching: 'In-line', impact: 'Outside Off', wickets: 'Missing Stumps' },
          originalDecision: 'OUT',
          finalDecision: 'NOT OUT',
          isOverturned: true,
          isUmpiresCall: false,
          reviewRetained: true,
          reviewType: 'caught_behind',
          evidenceSource: 'deterministic_hash',
          uncertaintyNote: 'Flat noise floor on UltraEdge: No bat edge contact.'
        };
      } else {
        return {
          snickoSpike: true,
          hawkeye: { pitching: 'In-line', impact: 'In-line', wickets: 'Missing Stumps' },
          originalDecision: 'OUT',
          finalDecision: 'OUT',
          isOverturned: false,
          isUmpiresCall: false,
          reviewRetained: false,
          reviewType: 'caught_behind',
          evidenceSource: 'deterministic_hash',
          uncertaintyNote: 'Clear audio spike as ball passes bat edge.'
        };
      }
    }
  } else {
    // 2. Bowling Review (On-Field NOT OUT)
    if (reviewType === 'lbw') {
      // LBW Bowling Review:
      // ~40% Three Reds (Overturned to OUT, Review Retained)
      // ~25% Umpire's Call (NOT OUT stands, Review Retained)
      // ~35% Missing / Outside (NOT OUT stands, Review Lost)
      if (normalizedVal < 0.40) {
        return {
          snickoSpike: false,
          hawkeye: { pitching: 'In-line', impact: 'In-line', wickets: 'Hitting Stumps' },
          originalDecision: 'NOT OUT',
          finalDecision: 'OUT',
          isOverturned: true,
          isUmpiresCall: false,
          reviewRetained: true,
          reviewType: 'lbw',
          evidenceSource: 'deterministic_hash',
          uncertaintyNote: 'Three Reds on Hawk-Eye: On-field decision overturned to OUT!'
        };
      } else if (normalizedVal < 0.65) {
        return {
          snickoSpike: false,
          hawkeye: { pitching: 'In-line', impact: "Umpire's Call", wickets: "Umpire's Call" },
          originalDecision: 'NOT OUT',
          finalDecision: 'NOT OUT',
          isOverturned: false,
          isUmpiresCall: true,
          reviewRetained: true,
          reviewType: 'lbw',
          evidenceSource: 'deterministic_hash',
          uncertaintyNote: 'Umpire\'s Call on Hawk-Eye: NOT OUT decision stands.'
        };
      } else {
        return {
          snickoSpike: false,
          hawkeye: { pitching: 'In-line', impact: 'Outside Off', wickets: 'Missing Stumps' },
          originalDecision: 'NOT OUT',
          finalDecision: 'NOT OUT',
          isOverturned: false,
          isUmpiresCall: false,
          reviewRetained: false,
          reviewType: 'lbw',
          evidenceSource: 'deterministic_hash',
          uncertaintyNote: 'Hawk-Eye shows trajectory missing stumps.'
        };
      }
    } else {
      // Caught Behind Bowling Review:
      // ~45% spike detected (Overturned to OUT, Review Retained)
      // ~55% no spike (NOT OUT stands, Review Lost)
      if (normalizedVal < 0.45) {
        return {
          snickoSpike: true,
          hawkeye: { pitching: 'In-line', impact: 'In-line', wickets: 'Missing Stumps' },
          originalDecision: 'NOT OUT',
          finalDecision: 'OUT',
          isOverturned: true,
          isUmpiresCall: false,
          reviewRetained: true,
          reviewType: 'caught_behind',
          evidenceSource: 'deterministic_hash',
          uncertaintyNote: 'UltraEdge detects sharp spike as ball passes bat edge!'
        };
      } else {
        return {
          snickoSpike: false,
          hawkeye: { pitching: 'In-line', impact: 'Outside Off', wickets: 'Missing Stumps' },
          originalDecision: 'NOT OUT',
          finalDecision: 'NOT OUT',
          isOverturned: false,
          isUmpiresCall: false,
          reviewRetained: false,
          reviewType: 'caught_behind',
          evidenceSource: 'deterministic_hash',
          uncertaintyNote: 'Flat noise floor on UltraEdge: No edge detected.'
        };
      }
    }
  }
}

