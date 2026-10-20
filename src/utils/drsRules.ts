import { BallOutcome } from '../types/cricket';

export interface DrsEligibility {
  canReview: boolean;
  reason: string;
  reviewType: 'lbw' | 'caught_behind' | 'none';
}

/**
 * Strict Cricket DRS Rules:
 * - Batting DRS: Reviewable ONLY for LBWs and Edges to the Wicketkeeper/Slip.
 *   Straightforward outfield catches, clean bowled, and run-outs cannot be reviewed via DRS.
 * - Bowling DRS: Reviewable ONLY when fielding team appealed for LBW or Caught Behind and on-field umpire called NOT OUT.
 */
export function checkDrsEligibility(
  outcome: BallOutcome | null,
  isUserBatting: boolean,
  reviewsRemaining: number
): DrsEligibility {
  if (!outcome) {
    return { canReview: false, reason: 'No ball bowled yet to review.', reviewType: 'none' };
  }
  if (outcome.drsReviewed) {
    return { canReview: false, reason: 'DRS already used for this delivery.', reviewType: 'none' };
  }
  if (outcome.isExtra && outcome.extraType === 'wide') {
    return { canReview: false, reason: 'Wide deliveries cannot be reviewed.', reviewType: 'none' };
  }
  if (reviewsRemaining <= 0) {
    return { canReview: false, reason: 'No DRS reviews remaining (0 left).', reviewType: 'none' };
  }

  if (isUserBatting) {
    // Batting review: Batter can ONLY challenge LBW and Caught Behind (Keeper/Slip)
    if (!outcome.isWicket) {
      return { canReview: false, reason: 'Batting team can only review when given OUT.', reviewType: 'none' };
    }

    const wt = outcome.wicketType;
    const f = (outcome.fielderName || '').toLowerCase();
    const d = (outcome.dismissalText || '').toLowerCase();

    // 1. LBW Dismissal
    if (wt === 'lbw' || d.startsWith('lbw')) {
      return { canReview: true, reason: 'LBW decision: Review ball trajectory with Hawk-Eye.', reviewType: 'lbw' };
    }

    // 2. Caught Behind by Keeper or Slip
    const isEdgeToKeeperOrSlip =
      f.includes('keeper') ||
      f.includes('wicketkeeper') ||
      f.includes('slip') ||
      d.includes('c keeper') ||
      d.includes('c †') ||
      d.includes('c slip');

    if (wt === 'caught' && isEdgeToKeeperOrSlip) {
      return { canReview: true, reason: 'Caught behind: Review bat edge with UltraEdge Snickometer.', reviewType: 'caught_behind' };
    }

    // 3. Outfield Catch, Bowled, Run Out
    if (wt === 'caught') {
      return {
        canReview: false,
        reason: `Straightforward catch by ${outcome.fielderName || 'fielder'}. DRS only allowed for LBWs and edges to keeper.`,
        reviewType: 'none'
      };
    }
    if (wt === 'bowled') {
      return { canReview: false, reason: 'Clean bowled: Stumps broken. Cannot be reviewed.', reviewType: 'none' };
    }
    if (wt === 'run out') {
      return { canReview: false, reason: 'Run-out: Handled directly by 3rd Umpire.', reviewType: 'none' };
    }
    if (wt === 'stumped') {
      return { canReview: false, reason: 'Stumped: Line decision adjudicated by 3rd Umpire.', reviewType: 'none' };
    }

    return { canReview: false, reason: 'DRS is restricted to LBWs and edges to the keeper/slip.', reviewType: 'none' };
  } else {
    // Bowling review: Fielding captain appealing a NOT OUT decision
    if (outcome.isWicket) {
      return { canReview: false, reason: 'Batter is already OUT.', reviewType: 'none' };
    }

    // Cannot review boundaries or 2+ run shots
    if (outcome.isFour || outcome.isSix || outcome.runs >= 2) {
      return { canReview: false, reason: 'Clean boundary/shot. No dismissal appeal.', reviewType: 'none' };
    }

    const comm = (outcome.commentary || '').toLowerCase();
    const tac = (outcome.tacticalNote || '').toLowerCase();

    const isLbwAppeal =
      comm.includes('pad') ||
      comm.includes('lbw') ||
      comm.includes('appeal') ||
      comm.includes('shout') ||
      tac.includes('pad') ||
      tac.includes('lbw');

    const isEdgeAppeal =
      comm.includes('edge') ||
      comm.includes('nick') ||
      comm.includes('beaten') ||
      comm.includes('snick') ||
      comm.includes('keeper') ||
      tac.includes('edge');

    if (isLbwAppeal) {
      return { canReview: true, reason: 'Appeal for LBW on pads (Hawk-Eye Ball Tracking).', reviewType: 'lbw' };
    }
    if (isEdgeAppeal) {
      return { canReview: true, reason: 'Appeal for faint edge to keeper (UltraEdge Snickometer).', reviewType: 'caught_behind' };
    }

    // On zero-run dot ball with full/good length, allow LBW appeal if close to stumps
    if (outcome.runs === 0 && (comm.includes('dots') || comm.includes('defends') || comm.includes('swing') || comm.includes('misses'))) {
      return { canReview: true, reason: 'Close LBW/Edge shout (Hawk-Eye / UltraEdge).', reviewType: 'lbw' };
    }

    return { canReview: false, reason: 'No LBW or edge-to-keeper appeal on this ball.', reviewType: 'none' };
  }
}
