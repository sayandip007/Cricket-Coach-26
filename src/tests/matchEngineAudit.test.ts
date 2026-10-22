import {
  createSeededRng,
  calculateEffectiveBattingSkill,
  calculateEffectiveBowlingSkill,
  calculateFieldPlacementImpact,
  calculateDeliveryProbabilities,
  selectDirectionalFielder,
  getFormatQuotaConfig,
  resolveSingleDeliveryState,
  createHeadlessMatchState,
  simulateFullMatchHeadless,
  simulateFirstInningsHeadless,
  DEFAULT_MATCH_FIELD
} from '../engine/cricketEngine';
import { INITIAL_PLAYERS, INITIAL_TEAMS, INITIAL_LEAGUES } from '../data/initialData';
import {
  checkDrsEligibility,
  evaluateDrsDeliveryEvidence,
  getInitialReviewsForFormat
} from '../utils/drsRules';
import { recordMatchToPlayerStats, getBattingStats, getBowlingStats, getKeepingStats } from '../utils/playerStatsHelpers';
import { oversToBalls } from '../utils/bowlingStats';
import { Player, Team, FielderPosition, InningsData, BattingApproach } from '../types/cricket';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

export interface ApproachAuditRow {
  approach: BattingApproach;
  inningsCount: number;
  avgRuns: number;
  avgWickets: number;
  avgRunRate: number;
  dotPct: number;
  boundaryPct: number;
  extrasPerInnings: number;
  allOutRatePct: number;
}

export interface FormatAuditSummary {
  format: 'T20' | 'ODI' | 'TEST';
  matchesSimulated: number;
  inningsCount: number;
  avgRuns: number;
  avgWickets: number;
  avgRunRate: number;
  dotPct: number;
  boundaryPct: number;
  extrasPerInnings: number;
  chaseWinRatePct: number;
  defendWinRatePct: number;
  tieRatePct: number;
  scoreDistribution: {
    min: number;
    p10: number;
    p25: number;
    median: number;
    p75: number;
    p90: number;
    max: number;
  };
  invalidStatesDetected: number;
  quotaViolationsDetected: number;
}

export interface BatchMetricsReport {
  t20AvgRuns: number;
  t20AvgWickets: number;
  t20AvgRunRate: number;
  t20DotPct: number;
  t20BoundaryPct: number;
  t20ExtrasPerInnings: number;
  odiAvgRuns: number;
  odiAvgWickets: number;
  odiAvgRunRate: number;
  testAvgRuns: number;
  testAvgWickets: number;
  testAvgRunRate: number;
  strongVsWeakWinRatePct: number;
  evenTeamsHomeWinRatePct: number;
  defensiveAvgRuns: number;
  defensiveAvgWickets: number;
  anchorAvgRuns: number;
  anchorAvgWickets: number;
  balancedAvgRuns: number;
  balancedAvgWickets: number;
  aggressiveAvgRuns: number;
  aggressiveAvgWickets: number;
  smashAvgRuns: number;
  smashAvgWickets: number;
  approachAudit500: Record<BattingApproach, ApproachAuditRow>;
  tacticalContextMatrix: {
    flatBelterBalancedRuns: number;
    flatBelterAggressiveRuns: number;
    greenSeamerOvercastAnchorRuns: number;
    greenSeamerOvercastAnchorWkts: number;
    greenSeamerOvercastSmashRuns: number;
    greenSeamerOvercastSmashWkts: number;
    deathOvers5BalancedRuns: number;
    deathOvers5SmashRuns: number;
  };
  formatAudits1000: Record<'T20' | 'ODI' | 'TEST', FormatAuditSummary>;
}

function computePercentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((pct / 100) * sorted.length)));
  return sorted[idx];
}

export function runMatchEngineAuditTests(): {
  passed: number;
  total: number;
  results: string[];
  batchReport: BatchMetricsReport;
} {
  const results: string[] = [];
  let passed = 0;
  let total = 0;

  const runTest = (name: string, fn: () => void) => {
    total++;
    fn();
    passed++;
    results.push(`PASS: ${name}`);
  };

  // Hydrate teams with full squads so all 11 XI players resolve cleanly
  const hydratedTeams: Team[] = INITIAL_TEAMS.map(t => ({
    ...t,
    squad: INITIAL_PLAYERS.filter(p => p.clubId === t.id)
  }));
  const homeTeam: Team = hydratedTeams[0];
  const awayTeam: Team = hydratedTeams[1];

  const makeFreshMatch = (format: 'T20' | 'ODI' | 'TEST' = 'T20') =>
    createHeadlessMatchState({
      id: `audit_${format}_1`,
      homeTeam,
      awayTeam,
      venue: 'Wankhede Stadium',
      format,
      leagueId: 'pt20',
      playerPool: INITIAL_PLAYERS
    });

  // 1. Legal ball increments ball count and over progress correctly
  runTest('1. Legal ball increments ball count and over progress correctly', () => {
    let state = makeFreshMatch('T20');
    const strikerBefore = state.innings1.currentStrikerId;
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: { runs: 0, isExtra: false, isWicket: false }
    });
    assert(state.innings1.ballsCompleted === 1, 'Expected ballsCompleted === 1');
    assert(state.innings1.overs === 0.1, `Expected overs === 0.1, got ${state.innings1.overs}`);
    const strikerCard = state.innings1.batters.find(b => b.playerId === strikerBefore)!;
    assert(strikerCard.balls === 1 && strikerCard.runs === 0, 'Striker should have 0(1)');
  });

  // 2. Wide adds extra run, charges bowler, does not increment legal ball count, and handles wide + extra runs crossed
  runTest('2. Wide adds extra run, charges bowler, does not increment legal ball count, and rotates strike on 2-run wide', () => {
    let state = makeFreshMatch('T20');
    const strikerId = state.innings1.currentStrikerId;
    const nonStrikerId = state.innings1.currentNonStrikerId;
    const bowlerId = state.innings1.currentBowlerId;

    // 1-run wide (no physical run crossed)
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: { runs: 1, isExtra: true, extraType: 'wide', isWicket: false }
    });
    assert(state.innings1.ballsCompleted === 0, 'Wide must not increment legal ballsCompleted');
    assert(state.innings1.runs === 1, 'Wide must add 1 run to team score');
    assert(state.innings1.extras?.wides === 1 && state.innings1.extras?.total === 1, 'Wide recorded in extras.wides');
    assert(state.innings1.currentStrikerId === strikerId, '1-run wide does not swap strike');
    const strikerCard = state.innings1.batters.find(b => b.playerId === strikerId)!;
    const bowlerCard = state.innings1.bowlers.find(b => b.playerId === bowlerId)!;
    assert(strikerCard.runs === 0 && strikerCard.balls === 0, 'Wide must not add to batter runs or balls faced');
    assert(bowlerCard.runs === 1 && bowlerCard.overs === 0, 'Wide must charge 1 run to bowler and 0 legal balls');

    // 2-run wide (1 wide penalty + 1 physical run crossed -> strike swaps!)
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: { runs: 2, extraRuns: 2, isExtra: true, extraType: 'wide', isWicket: false }
    });
    assert(state.innings1.ballsCompleted === 0, 'Still 0 legal balls after second wide');
    assert(state.innings1.runs === 3 && state.innings1.extras?.wides === 3, 'Total wides should be 3');
    assert(state.innings1.currentStrikerId === nonStrikerId, '2-run wide (1 physical run crossed) must rotate strike');
  });

  // 3. No-ball adds extra run, charges bowler, does not increment legal ball count, and prevents invalid dismissals
  runTest('3. No-ball accounting, repeated illegal balls in over, and invalid dismissal prevention', () => {
    let state = makeFreshMatch('T20');
    const strikerId = state.innings1.currentStrikerId;
    const bowlerId = state.innings1.currentBowlerId;

    // Attempt an illegal 'caught' dismissal on a no-ball with 4 runs hit off the bat (5 total runs)
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: {
        runs: 5,
        batterRuns: 4,
        extraRuns: 1,
        isExtra: true,
        extraType: 'no_ball',
        isWicket: true,
        wicketType: 'caught'
      }
    });

    assert(state.innings1.ballsCompleted === 0, 'No-ball must not increment ballsCompleted');
    assert(state.innings1.wickets === 0, 'Batter cannot be out caught on a no-ball');
    assert(state.innings1.runs === 5, 'Team should receive 1 no-ball penalty + 4 batter runs = 5');
    assert(state.innings1.extras?.noBalls === 1, 'extras.noBalls should increment by 1');
    const strikerCard = state.innings1.batters.find(b => b.playerId === strikerId)!;
    const bowlerCard = state.innings1.bowlers.find(b => b.playerId === bowlerId)!;
    assert(strikerCard.runs === 4 && strikerCard.fours === 1, 'Batter credited with 4 runs and 1 four off the no-ball');
    assert(bowlerCard.runs === 5 && bowlerCard.wickets === 0, 'Bowler charged 5 runs and 0 wickets');

    // Attempt illegal 'bowled', 'lbw', and 'stumped' on a no-ball -> all must be rejected
    for (const invalidWt of ['bowled', 'lbw', 'stumped'] as const) {
      state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
        forcedOutcome: {
          runs: 1,
          batterRuns: 0,
          extraRuns: 1,
          isExtra: true,
          extraType: 'no_ball',
          isWicket: true,
          wicketType: invalidWt
        }
      });
      assert(state.innings1.wickets === 0, `Batter cannot be out ${invalidWt} on a no-ball`);
    }

    // Deliver 7 consecutive wides — over must still have 0 legal balls and not complete!
    for (let i = 0; i < 7; i++) {
      state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
        forcedOutcome: { runs: 1, isExtra: true, extraType: 'wide', isWicket: false }
      });
    }
    assert(state.innings1.ballsCompleted === 0, 'Repeated illegal deliveries must never advance legal ball count or end over');
    assert(state.innings1.currentBowlerId === bowlerId, 'Same bowler must still be bowling unfinished over');
  });

  // 4. Bye and leg-bye update the correct fields without crediting the batter or charging bowler
  runTest('4. Bye and leg-bye count as legal balls, add to extras, and do not credit batter or charge bowler', () => {
    let state = makeFreshMatch('T20');
    const strikerId = state.innings1.currentStrikerId;
    const nonStrikerId = state.innings1.currentNonStrikerId;
    const bowlerId = state.innings1.currentBowlerId;

    // 1 leg-bye (odd run -> rotates strike, legal ball, 0 batter runs, 0 bowler runs)
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: { runs: 1, isExtra: true, extraType: 'leg_bye', isWicket: false }
    });
    assert(state.innings1.ballsCompleted === 1, 'Leg-bye is a legal delivery');
    assert(state.innings1.runs === 1, 'Team score increases by 1');
    assert(state.innings1.extras?.legByes === 1, 'Tracked in extras.legByes');
    assert(state.innings1.currentStrikerId === nonStrikerId, '1 leg-bye rotates strike');

    const batter1 = state.innings1.batters.find(b => b.playerId === strikerId)!;
    const bowler1 = state.innings1.bowlers.find(b => b.playerId === bowlerId)!;
    assert(batter1.runs === 0 && batter1.balls === 1, 'Batter gets 0 runs and 1 ball faced on leg-bye');
    assert(bowler1.runs === 0 && bowler1.overs === 0.1, 'Bowler charged 0 runs and credited 0.1 overs on leg-bye');

    // 4 byes (boundary bye -> 0 batter fours, 4 extras.byes, no strike rotation)
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: { runs: 4, isExtra: true, extraType: 'bye', isFour: true, isWicket: false }
    });
    assert(state.innings1.ballsCompleted === 2, 'Bye is a legal delivery');
    assert(state.innings1.runs === 5, 'Team score increases by 4');
    assert(state.innings1.extras?.byes === 4 && state.innings1.extras?.total === 5, 'Tracked in extras.byes');
    const batter2 = state.innings1.batters.find(b => b.playerId === nonStrikerId)!;
    assert(batter2.runs === 0 && batter2.fours === 0, '4 byes do not credit batter runs or fours');
  });

  // 5. Odd and even runs rotate strike correctly
  runTest('5. Odd and even runs rotate strike accurately', () => {
    let state = makeFreshMatch('T20');
    const openerA = state.innings1.currentStrikerId;
    const openerB = state.innings1.currentNonStrikerId;

    // 1 run -> swap
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: { runs: 1, isExtra: false, isWicket: false }
    });
    assert(state.innings1.currentStrikerId === openerB && state.innings1.currentNonStrikerId === openerA, 'Single swaps strike');

    // 2 runs -> keep strike
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: { runs: 2, isExtra: false, isWicket: false }
    });
    assert(state.innings1.currentStrikerId === openerB, 'Two runs keeps strike');

    // 3 runs -> swap back to openerA
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: { runs: 3, isExtra: false, isWicket: false }
    });
    assert(state.innings1.currentStrikerId === openerA, 'Three runs swaps strike');

    // 4 runs -> keep strike
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: { runs: 4, isFour: true, isExtra: false, isWicket: false }
    });
    assert(state.innings1.currentStrikerId === openerA, 'Four runs keeps strike');
  });

  // 6. End of over swaps strike correctly
  runTest('6. End of over swaps strike correctly after 6 legal balls', () => {
    let state = makeFreshMatch('T20');
    const openerA = state.innings1.currentStrikerId;
    const openerB = state.innings1.currentNonStrikerId;

    // 5 dot balls: openerA still on strike
    for (let i = 0; i < 5; i++) {
      state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
        forcedOutcome: { runs: 0, isExtra: false, isWicket: false }
      });
    }
    assert(state.innings1.currentStrikerId === openerA, 'After 5 dots, openerA still on strike');

    // 6th ball is a dot -> over ends, strike swaps to openerB
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: { runs: 0, isExtra: false, isWicket: false }
    });
    assert(state.innings1.ballsCompleted === 6 && state.innings1.overs === 1, 'Over 1 completed');
    assert(state.innings1.currentStrikerId === openerB && state.innings1.currentNonStrikerId === openerA, 'End of over swaps strike to openerB');
  });

  // 7. Wicket on the final ball of an over results in the correct striker for the next over
  runTest('7. Wicket on the 6th ball of an over puts surviving non-striker on strike for next over', () => {
    let state = makeFreshMatch('T20');
    const openerA = state.innings1.currentStrikerId;
    const openerB = state.innings1.currentNonStrikerId;
    const number3Batter = state.innings1.batters[2].playerId;

    // 5 legal dot balls
    for (let i = 0; i < 5; i++) {
      state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
        forcedOutcome: { runs: 0, isExtra: false, isWicket: false }
      });
    }
    // 6th ball: openerA is bowled!
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: {
        runs: 0,
        isExtra: false,
        isWicket: true,
        wicketType: 'bowled',
        dismissedPlayerId: openerA
      }
    });
    assert(state.innings1.ballsCompleted === 6, 'Over 1 completed on wicket ball');
    assert(state.innings1.wickets === 1, '1 wicket fallen');
    // Because the over ended, ends change: surviving non-striker (openerB) faces ball 1 of Over 2, while #3 is at non-striker's end
    assert(
      state.innings1.currentStrikerId === openerB && state.innings1.currentNonStrikerId === number3Batter,
      `Expected striker=${openerB} and nonStriker=${number3Batter}, got striker=${state.innings1.currentStrikerId}, nonStriker=${state.innings1.currentNonStrikerId}`
    );
  });

  // 8. Bowler rotation prevents consecutive overs and enforces T20 (4-over), ODI (10-over), and shortened-innings quotas
  runTest('8. Bowler rotation prevents consecutive overs and enforces T20, ODI & shortened-innings quotas', () => {
    let state = makeFreshMatch('T20');
    let previousOverBowler = '';

    for (let over = 0; over < 20; over++) {
      if (state.currentInningsIndex !== 1) break;
      const currentBowler = state.innings1.currentBowlerId;
      assert(currentBowler !== previousOverBowler, `Bowler ${currentBowler} bowled consecutive overs at over ${over}`);
      for (let b = 0; b < 6; b++) {
        state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
          forcedOutcome: { runs: 1, isExtra: false, isWicket: false }
        });
      }
      previousOverBowler = currentBowler;
    }

    for (const bw of state.innings1.bowlers) {
      const balls = oversToBalls(bw.overs);
      assert(balls <= 24, `Bowler ${bw.name} exceeded 4-over T20 quota with ${bw.overs} overs`);
    }

    const odiQuota = getFormatQuotaConfig('ODI');
    assert(odiQuota.maxOversPerBowler === 10 && odiQuota.maxBalls === 300, 'ODI quota must be 10 overs / 300 balls');

    // Shortened 10-over rain-reduced T20 innings -> max 2 overs (12 balls) per bowler!
    const shortenedQuota = getFormatQuotaConfig('T20', 10);
    assert(shortenedQuota.maxOversPerBowler === 2 && shortenedQuota.maxBallsPerBowler === 12, '10-over shortened match must cap bowlers at 2 overs (12 balls)');

    let shortMatch = makeFreshMatch('T20');
    shortMatch = {
      ...shortMatch,
      innings1: { ...shortMatch.innings1, maxOvers: 10 }
    };
    for (let b = 0; b < 60; b++) {
      shortMatch = resolveSingleDeliveryState(shortMatch, INITIAL_PLAYERS, {
        forcedOutcome: { runs: 1, isExtra: false, isWicket: false }
      });
    }
    assert(shortMatch.currentInningsIndex === 2, '10-over shortened innings must transition to Innings 2 at 60 balls');
    for (const bw of shortMatch.innings1.bowlers) {
      assert(oversToBalls(bw.overs) <= 12, `Bowler ${bw.name} exceeded 2-over shortened quota with ${bw.overs} overs`);
    }
  });

  // 9. Accurate catches, stumpings, run-outs, fielderId resolution, and bowler wicket credit
  runTest('9. Catches, stumpings, and run-outs assign exact fielderId and apply bowler wicket credit rules', () => {
    let state = makeFreshMatch('T20');
    const bowlerId = state.innings1.currentBowlerId;
    const strikerId = state.innings1.currentStrikerId;

    // A. Run-out: increments team wickets, assigns fielderId, does NOT credit bowler wickets
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: {
        runs: 0,
        isExtra: false,
        isWicket: true,
        wicketType: 'run out',
        fielderName: 'Point',
        dismissedPlayerId: strikerId,
        dismissalText: 'run out (Point)'
      }
    });
    const bowlerCardAfterRunOut = state.innings1.bowlers.find(b => b.playerId === bowlerId)!;
    assert(state.innings1.wickets === 1, 'Team wickets must be 1 after run out');
    assert(bowlerCardAfterRunOut.wickets === 0, 'Bowler must NOT be credited with a wicket for a run out');
    assert(Boolean(state.lastBallOutcome?.fielderId), 'Run-out must resolve a valid fielderId from the fielding XI');

    // B. Stumped: increments team wickets, credits bowler wicket, and assigns wicketkeeper fielderId
    const striker2Id = state.innings1.currentStrikerId;
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: {
        runs: 0,
        isExtra: false,
        isWicket: true,
        wicketType: 'stumped',
        fielderName: 'Wicketkeeper',
        dismissedPlayerId: striker2Id,
        dismissalText: 'st †Keeper b Bowler'
      }
    });
    const bowlerCardAfterStumping = state.innings1.bowlers.find(b => b.playerId === bowlerId)!;
    assert(state.innings1.wickets === 2, 'Team wickets must be 2 after stumping');
    assert(bowlerCardAfterStumping.wickets === 1, 'Bowler MUST be credited with a wicket for a stumping');
    const keeperId = state.lastBallOutcome?.fielderId;
    const keeperObj = awayTeam.squad.find(p => p.id === keeperId);
    assert(Boolean(keeperObj && (keeperObj.role === 'Wk-bat' || keeperObj.role === 'Wicketkeeper')), 'Stumping fielderId must resolve to the bowling XI wicketkeeper');

    // C. Caught: increments team wickets, credits bowler wicket, and assigns fielderId
    const striker3Id = state.innings1.currentStrikerId;
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: {
        runs: 0,
        isExtra: false,
        isWicket: true,
        wicketType: 'caught',
        fielderName: 'Cover',
        dismissedPlayerId: striker3Id,
        dismissalText: 'c Cover b Bowler'
      }
    });
    const bowlerCardAfterCatch = state.innings1.bowlers.find(b => b.playerId === bowlerId)!;
    assert(state.innings1.wickets === 3, 'Team wickets must be 3 after catch');
    assert(bowlerCardAfterCatch.wickets === 2, 'Bowler MUST be credited with a wicket for a catch');
    assert(Boolean(state.lastBallOutcome?.fielderId && awayTeam.playingXIIds.includes(state.lastBallOutcome.fielderId)), 'Catch fielderId must belong to the fielding Playing XI');
  });

  // 10. Caught dismissal selects a valid directional fielder
  runTest('10. Caught dismissal selects a directional fielder matching shot angle and distance', () => {
    const customField: FielderPosition[] = [
      { id: 1, name: 'Slip', x: 12, y: -22, isDeep: false, isBoundary: false },
      { id: 2, name: 'Deep Cover Boundary', x: 75, y: 10, isDeep: true, isBoundary: true },
      { id: 3, name: 'Deep Square Leg Boundary', x: -75, y: -10, isDeep: true, isBoundary: true }
    ];
    const rng = createSeededRng(42);
    // Angle ~ 0 deg (positive X, off side) and deep distance 68m -> should pick Deep Cover Boundary
    const pickedOffDeep = selectDirectionalFielder(customField, 5, 68, rng);
    assert(pickedOffDeep === 'Deep Cover Boundary', `Expected Deep Cover Boundary, got ${pickedOffDeep}`);

    // Angle ~ 185 deg (negative X, leg side) and deep distance 68m -> should pick Deep Square Leg Boundary
    const pickedLegDeep = selectDirectionalFielder(customField, 185, 68, rng);
    assert(pickedLegDeep === 'Deep Square Leg Boundary', `Expected Deep Square Leg Boundary, got ${pickedLegDeep}`);
  });

  // 11. DRS eligibility, review retention on Umpire's Call, and trigger state transitions
  runTest('11. DRS eligibility, Umpire\'s Call review retention, and triggerDrsReview state transitions', () => {
    const dotNoAppeal = {
      over: 1, ballNumber: 1, bowlerId: 'b1', bowlerName: 'B', strikerId: 's1', strikerName: 'S',
      nonStrikerId: 's2', nonStrikerName: 'N', runs: 0, isWicket: false, appealType: 'none' as const,
      isFour: false, isSix: false, isExtra: false, bowlerSpeedMps: 38.5, shotAngleDeg: 0, shotDistanceM: 10,
      commentary: '', tacticalNote: ''
    };
    const elig1 = checkDrsEligibility(dotNoAppeal, false, 2);
    assert(!elig1.canReview, 'Unrelated dot ball with no appeal must NOT be eligible for DRS');

    const lbwOutBall = {
      ...dotNoAppeal,
      isWicket: true,
      wicketType: 'lbw' as const,
      appealType: 'lbw' as const
    };
    const elig2 = checkDrsEligibility(lbwOutBall, true, 2);
    assert(elig2.canReview && elig2.reviewType === 'lbw', 'LBW given out with reviews remaining must be eligible for DRS');

    const noReviewsLeft = checkDrsEligibility(lbwOutBall, true, 0);
    assert(!noReviewsLeft.canReview, 'Cannot review when 0 reviews remain');

    // Verify deterministic evidence evaluation & Umpire's Call retention law
    const evidence = evaluateDrsDeliveryEvidence(lbwOutBall, true, 'OUT');
    if (evidence.isOverturned || evidence.isUmpiresCall) {
      assert(evidence.reviewRetained === true, 'Overturned or Umpires Call review must retain the review');
    } else {
      assert(evidence.reviewRetained === false, 'Upheld clear decision must deduct a review');
    }

    // Verify format review allocations and bowling LBW appeal eligibility
    assert(getInitialReviewsForFormat('T20') === 2, 'T20 must grant 2 reviews per innings');
    assert(getInitialReviewsForFormat('ODI') === 2, 'ODI must grant 2 reviews per innings');
    assert(getInitialReviewsForFormat('TEST') === 3, 'TEST must grant 3 reviews per innings');

    let state = makeFreshMatch('T20');
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: {
        runs: 0,
        isExtra: false,
        isWicket: true,
        wicketType: 'lbw',
        appealType: 'lbw'
      }
    });
    const liveElig = checkDrsEligibility(state.lastBallOutcome, true, state.reviewsRemaining?.home ?? 2, {
      matchStatus: state.status,
      latestBallOutcome: state.lastBallOutcome
    });
    assert(liveElig.canReview && liveElig.reviewType === 'lbw', 'Live LBW delivery must be eligible for batting DRS review');
  });

  // 12. Second innings ends immediately when target is reached
  runTest('12. Second innings stops immediately when target is reached mid-over', () => {
    let state = makeFreshMatch('T20');
    // Fast-forward Innings 1 to 10 wickets with 12 runs
    for (let w = 0; w < 10; w++) {
      state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
        forcedOutcome: {
          runs: w === 0 ? 12 : 0,
          isExtra: false,
          isWicket: w > 0,
          wicketType: 'bowled'
        }
      });
    }
    // 10th wicket
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: { runs: 0, isExtra: false, isWicket: true, wicketType: 'bowled' }
    });
    assert(state.currentInningsIndex === 2, 'Should now be in Innings 2');
    assert(state.targetRuns === 13, `Target should be 13, got ${state.targetRuns}`);

    // Hit three 4s (12 runs) then a single (13 runs) on ball 4 of Over 1
    for (let i = 0; i < 3; i++) {
      state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
        forcedOutcome: { runs: 4, isFour: true, isExtra: false, isWicket: false }
      });
      assert(state.status === 'in_progress', 'Match still in progress at 12 runs');
    }
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: { runs: 1, isExtra: false, isWicket: false }
    });
    assert(state.status === 'finished', 'Match must finish immediately when target 13 is reached');
    assert(state.innings2?.ballsCompleted === 4, 'Match stopped at 0.4 overs without bowling remaining balls');
    assert(state.winnerTeamId === awayTeam.id, 'Chasing team must be declared winner');
    assert(Boolean(state.resultText?.includes('10 WICKETS')), `Expected 10 wickets win text, got ${state.resultText}`);
  });

  // 13. Tie, win by runs, win by wickets, and league standings points (+2 win, +1 tie, +0 loss)
  runTest('13. Tie (runs === target - 1), Win by Runs, and League Standings points (+2 Win, +1 Tie) are accurate', () => {
    let state = makeFreshMatch('T20');
    // Score 10 runs in Innings 1 then all out
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: { runs: 10, isExtra: false, isWicket: false }
    });
    for (let w = 0; w < 10; w++) {
      state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
        forcedOutcome: { runs: 0, isExtra: false, isWicket: true, wicketType: 'bowled' }
      });
    }
    assert(state.currentInningsIndex === 2 && state.targetRuns === 11, 'Target is 11 (Innings 1 scored 10)');

    // Score exactly 10 runs in Innings 2 then lose 10 wickets -> TIE!
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: { runs: 10, isExtra: false, isWicket: false }
    });
    for (let w = 0; w < 10; w++) {
      state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
        forcedOutcome: { runs: 0, isExtra: false, isWicket: true, wicketType: 'bowled' }
      });
    }
    assert(state.status === 'finished', 'Match finished');
    assert(state.winnerTeamId === undefined, 'Tied league match must have undefined winnerTeamId');
    assert(Boolean(state.resultText?.includes('MATCH TIED')), `Expected MATCH TIED!, got ${state.resultText}`);

    // Verify standings update logic on Tie (+1 point each, tied + 1)
    const initialRow = INITIAL_LEAGUES[0].standings.find(s => s.teamId === homeTeam.id)!;
    const isTied = !state.winnerTeamId;
    const updatedHomeRow = isTied
      ? { ...initialRow, played: initialRow.played + 1, tied: (initialRow.tied || 0) + 1, points: initialRow.points + 1 }
      : initialRow;
    assert(updatedHomeRow.points === 1 && updatedHomeRow.tied === 1, 'Tied match must award 1 point and increment tied count');
  });

  // 14. Batting approaches produce expected directional changes in boundary rate and wicket risk
  runTest('14. Batting approaches (Defensive -> Anchor -> Balanced -> Aggressive -> Smash) scale boundary & wicket probabilities', () => {
    const striker = INITIAL_PLAYERS[0];
    const nonStriker = INITIAL_PLAYERS[1];
    const bowler = INITIAL_PLAYERS[4];

    const getProbsForApproach = (approach: BattingApproach) =>
      calculateDeliveryProbabilities({
        over: 8,
        ballNumber: 2,
        striker,
        nonStriker,
        bowler,
        pitchType: 'Natural',
        weather: 'Clear Night',
        format: 'T20',
        bowlingTactics: {
          length: 'good',
          line: 'outside_off',
          angle: 'over',
          variation: 'Stock ball',
          fielders: DEFAULT_MATCH_FIELD
        },
        battingTactics: {
          approach,
          targetSide: 'all',
          runningRisk: 'normal'
        }
      });

    const pDef = getProbsForApproach('defensive');
    const pAnc = getProbsForApproach('anchor');
    const pBal = getProbsForApproach('balanced');
    const pAgg = getProbsForApproach('aggressive');
    const pSma = getProbsForApproach('smash');

    assert(
      pDef.wicketProb < pAnc.wicketProb &&
        pAnc.wicketProb < pBal.wicketProb &&
        pBal.wicketProb < pAgg.wicketProb &&
        pAgg.wicketProb < pSma.wicketProb,
      'Wicket probability must strictly increase from defensive -> anchor -> balanced -> aggressive -> smash'
    );
    assert(
      pDef.fourProb + pDef.sixProb < pAnc.fourProb + pAnc.sixProb &&
        pAnc.fourProb + pAnc.sixProb < pBal.fourProb + pBal.sixProb &&
        pBal.fourProb + pBal.sixProb < pAgg.fourProb + pAgg.sixProb &&
        pAgg.fourProb + pAgg.sixProb < pSma.fourProb + pSma.sixProb,
      'Boundary probability must strictly increase from defensive -> anchor -> balanced -> aggressive -> smash'
    );
  });

  // 15. Bowling tactics, pitchType, weather, dew, runningRisk, and fielders affect delivery probabilities
  runTest('15. Bowling tactics, pitchType, dew, runningRisk, and fielder geometry meaningfully affect probabilities', () => {
    const striker = INITIAL_PLAYERS[0];
    const nonStriker = INITIAL_PLAYERS[1];
    const paceBowler: Player = { ...INITIAL_PLAYERS[4], role: 'Pace', bowlingArm: 'RAF' };
    const spinBowler: Player = { ...INITIAL_PLAYERS[5], role: 'Spin', bowlingArm: 'LS' };

    const paceOnGreen = calculateEffectiveBowlingSkill(
      paceBowler, striker,
      { length: 'good', line: 'off_stump', angle: 'over', variation: 'Swings away' },
      'Green Seamer', 'Overcast & Humid', false, 2, 'T20'
    );
    const paceOnFlatDew = calculateEffectiveBowlingSkill(
      paceBowler, striker,
      { length: 'good', line: 'off_stump', angle: 'over', variation: 'Stock ball' },
      'Flat Belter', 'Clear Night', true, 2, 'T20'
    );
    assert(paceOnGreen > paceOnFlatDew + 6, `Pace on Green+Overcast (${paceOnGreen}) must exceed Flat+Dew (${paceOnFlatDew})`);

    const spinOnDry = calculateEffectiveBowlingSkill(
      spinBowler, striker,
      { length: 'good', line: 'stumps', angle: 'over', variation: "Wrong'un" },
      'Dry & Turning', 'Sunny & Hot', false, 12, 'T20'
    );
    const spinOnGreenDew = calculateEffectiveBowlingSkill(
      spinBowler, striker,
      { length: 'good', line: 'stumps', angle: 'over', variation: 'Stock ball' },
      'Green Seamer', 'Clear Night', true, 12, 'T20'
    );
    assert(spinOnDry > spinOnGreenDew + 8, `Spin on Dry (${spinOnDry}) must exceed Spin on Green+Dew (${spinOnGreenDew})`);

    // Field placement impact: 2 boundary riders vs 6 boundary riders
    const attackingField: FielderPosition[] = DEFAULT_MATCH_FIELD.map((f, idx) => ({
      ...f,
      x: idx < 2 ? 75 : 15,
      y: idx < 2 ? 75 : 15,
      isBoundary: idx < 2,
      isDeep: idx < 2
    }));
    const defensiveBoundaryField: FielderPosition[] = DEFAULT_MATCH_FIELD.map((f, idx) => ({
      ...f,
      x: idx < 6 ? 78 : 25,
      y: idx < 6 ? 78 : 25,
      isBoundary: idx < 6,
      isDeep: idx < 6
    }));
    const impactAttack = calculateFieldPlacementImpact(attackingField, 'off_side', 'RHB');
    const impactDefend = calculateFieldPlacementImpact(defensiveBoundaryField, 'off_side', 'RHB');
    assert(
      impactDefend.boundaryProtectionFactor < impactAttack.boundaryProtectionFactor,
      '6 boundary riders must suppress boundary factor compared to 2 boundary riders'
    );

    // Running risk impact
    const cautiousProbs = calculateDeliveryProbabilities({
      over: 7, ballNumber: 1, striker, nonStriker, bowler: paceBowler,
      pitchType: 'Natural', weather: 'Clear Night', format: 'T20',
      bowlingTactics: { length: 'good', line: 'outside_off', angle: 'over', variation: 'Stock ball', fielders: DEFAULT_MATCH_FIELD },
      battingTactics: { approach: 'balanced', targetSide: 'all', runningRisk: 'cautious' }
    });
    const aggressiveRunProbs = calculateDeliveryProbabilities({
      over: 7, ballNumber: 1, striker, nonStriker, bowler: paceBowler,
      pitchType: 'Natural', weather: 'Clear Night', format: 'T20',
      bowlingTactics: { length: 'good', line: 'outside_off', angle: 'over', variation: 'Stock ball', fielders: DEFAULT_MATCH_FIELD },
      battingTactics: { approach: 'balanced', targetSide: 'all', runningRisk: 'aggressive' }
    });
    assert(
      aggressiveRunProbs.singleProb + aggressiveRunProbs.twoThreeProb >
        cautiousProbs.singleProb + cautiousProbs.twoThreeProb,
      'Aggressive runningRisk must increase singles and 2s/3s probability'
    );
  });

  // 16. Player Statistics, Not-Outs vs Dismissals, Fielding Credits, Save/Load & Multi-Season Persistence
  runTest('16. Career statistics update once per match (runs, not-outs, dismissals, bowling, catches, stumpings, run-outs, seasons & save/load)', () => {
    let state = makeFreshMatch('T20');
    const openerAId = state.innings1.currentStrikerId;
    const openerBId = state.innings1.currentNonStrikerId;
    const bowler1Id = state.innings1.currentBowlerId;
    const awayKeeper = awayTeam.squad.find(p => p.role === 'Wk-bat' || p.role === 'Wicketkeeper') || awayTeam.squad[0];
    const awayFielder = awayTeam.squad.find(p => p.id !== bowler1Id && p.id !== awayKeeper.id) || awayTeam.squad[1];

    // Opener A hits 54 off 3 balls (e.g. 50 + 4) then gets stumped by awayKeeper off bowler1!
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: { runs: 50, batterRuns: 50, isExtra: false, isWicket: false }
    });
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: { runs: 4, batterRuns: 4, isFour: true, isExtra: false, isWicket: false }
    });
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: {
        runs: 0,
        isExtra: false,
        isWicket: true,
        wicketType: 'stumped',
        fielderId: awayKeeper.id,
        fielderName: 'Wicketkeeper',
        dismissedPlayerId: openerAId
      }
    });

    // Number 3 batter comes in and is caught by awayFielder off bowler1 for 0(1)
    const num3Id = state.innings1.currentStrikerId;
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: {
        runs: 0,
        isExtra: false,
        isWicket: true,
        wicketType: 'caught',
        fielderId: awayFielder.id,
        fielderName: awayFielder.name,
        dismissedPlayerId: num3Id
      }
    });

    // Number 4 batter comes in and is run out by awayFielder for 0(1)
    const num4Id = state.innings1.currentStrikerId;
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: {
        runs: 0,
        isExtra: false,
        isWicket: true,
        wicketType: 'run out',
        fielderId: awayFielder.id,
        fielderName: awayFielder.name,
        dismissedPlayerId: num4Id
      }
    });

    // Complete remaining match headlessly
    const finished = simulateFullMatchHeadless(state, INITIAL_PLAYERS, 2026);
    assert(finished.status === 'finished', 'Match must reach finished status');

    // Verify team score equals batter runs + extras.total across both innings
    for (const inn of [finished.innings1, finished.innings2]) {
      if (!inn) continue;
      const batRuns = inn.batters.reduce((s, b) => s + b.runs, 0);
      const extRuns = inn.extras?.total || 0;
      assert(inn.runs === batRuns + extRuns, `Team runs (${inn.runs}) must equal batter runs (${batRuns}) + extras (${extRuns})`);
    }

    const zeroStats = {
      matches: 0, innings: 0, dismissals: 0, runs: 0, balls: 0, fours: 0, sixes: 0,
      fifties: 0, hundreds: 0, highestScore: 0, wickets: 0, inningsBowled: 0, oversBowled: 0,
      runsConceded: 0, maidens: 0, bestBowling: '0/0', average: 0, strikeRate: 0,
      catches: 0, stumpings: 0, runOuts: 0
    };

    // Test Opener A (54 runs, 1 fifty, 1 dismissal)
    const pOpenerA: Player = {
      ...INITIAL_PLAYERS.find(p => p.id === openerAId)!,
      stats: { ...zeroStats },
      competitionStats: { processedMatchIds: [] }
    };
    const recOpenerA1 = recordMatchToPlayerStats(pOpenerA, finished, '2026');
    const recOpenerA2 = recordMatchToPlayerStats(recOpenerA1, finished, '2026'); // Duplicate call!
    assert(recOpenerA1.stats.matches === 1 && recOpenerA1.stats.innings === 1 && recOpenerA1.stats.dismissals === 1, 'Opener A must have 1 match, 1 innings, 1 dismissal');
    assert(recOpenerA1.stats.runs === 54 && recOpenerA1.stats.fifties === 1 && recOpenerA1.stats.fours === 1, 'Opener A must have 54 runs, 1 fifty, 1 four');
    assert(recOpenerA2.stats.runs === 54 && recOpenerA2.stats.matches === 1, 'Duplicate recordMatchToPlayerStats call must be a strict no-op');

    // Test Wicketkeeper (stumping credit) and Outfielder (catch + run-out credit)
    const pKeeper: Player = {
      ...awayKeeper,
      stats: { ...zeroStats },
      competitionStats: { processedMatchIds: [] }
    };
    const recKeeper = recordMatchToPlayerStats(pKeeper, finished, '2026');
    assert((recKeeper.stats.stumpings || 0) >= 1, `Keeper must be credited with at least 1 stumping, got ${recKeeper.stats.stumpings}`);

    const pFielder: Player = {
      ...awayFielder,
      stats: { ...zeroStats },
      competitionStats: { processedMatchIds: [] }
    };
    const recFielder = recordMatchToPlayerStats(pFielder, finished, '2026');
    assert((recFielder.stats.catches || 0) >= 1, `Fielder must be credited with at least 1 catch, got ${recFielder.stats.catches}`);
    assert((recFielder.stats.runOuts || 0) >= 1, `Fielder must be credited with at least 1 run out, got ${recFielder.stats.runOuts}`);

    // Test Season Transition ('2026' -> '2027') and Save/Load JSON serialization roundtrip
    const finished2027 = { ...finished, id: 'audit_T20_season_2027' };
    const recOpener2027 = recordMatchToPlayerStats(recOpenerA1, finished2027, '2027');
    assert(recOpener2027.stats.matches === 2 && recOpener2027.stats.runs === 108, 'Career total accumulates across 2026 and 2027');
    assert(recOpener2027.competitionStats?.iplSeasons?.['2026']?.runs === 54, 'Season 2026 stats isolated at 54 runs');
    assert(recOpener2027.competitionStats?.iplSeasons?.['2027']?.runs === 54, 'Season 2027 stats isolated at 54 runs');

    const serialized = JSON.stringify(recOpener2027);
    const deserialized: Player = JSON.parse(serialized);
    const formattedBat = getBattingStats(deserialized);
    assert(formattedBat.runs === '108' && formattedBat.average === '54.00', `Expected 108 runs and 54.00 avg after save/load, got ${formattedBat.runs} / ${formattedBat.average}`);
    const formattedKeep = getKeepingStats(recKeeper);
    assert(Number(formattedKeep.stumpings) >= 1, 'Formatted keeping stats must preserve stumpings');
    const bowlerObj: Player = {
      ...INITIAL_PLAYERS.find(p => p.id === bowler1Id)!,
      stats: { ...zeroStats },
      competitionStats: { processedMatchIds: [] }
    };
    const recBowler = recordMatchToPlayerStats(bowlerObj, finished, '2026');
    const formattedBowl = getBowlingStats(recBowler);
    assert(formattedBowl.hasBowled && Number(formattedBowl.wickets) >= 2, 'Bowler credited with stumping + catch wickets, excluding run-out');
  });

  // 17. Section 2 Audit: 500 First-Innings Simulations per Batting Approach & Cross-Condition Tactical Optimality Matrix
  const approachAudit500 = {} as Record<BattingApproach, ApproachAuditRow>;
  const tacticalContextMatrix = {
    flatBelterBalancedRuns: 0,
    flatBelterAggressiveRuns: 0,
    greenSeamerOvercastAnchorRuns: 0,
    greenSeamerOvercastAnchorWkts: 0,
    greenSeamerOvercastSmashRuns: 0,
    greenSeamerOvercastSmashWkts: 0,
    deathOvers5BalancedRuns: 0,
    deathOvers5SmashRuns: 0
  };

  runTest('17. Batting Balance Audit: 500 first-innings simulations per approach + cross-condition tactical optimality', () => {
    const approaches: BattingApproach[] = ['defensive', 'anchor', 'balanced', 'aggressive', 'smash'];
    const INNINGS_PER_APPROACH = 500;

    for (const app of approaches) {
      let totalRuns = 0;
      let totalWkts = 0;
      let totalBalls = 0;
      let totalDots = 0;
      let totalBoundaries = 0;
      let totalExtras = 0;
      let allOuts = 0;

      for (let i = 0; i < INNINGS_PER_APPROACH; i++) {
        const tHome = hydratedTeams[i % hydratedTeams.length];
        const tAway = hydratedTeams[(i + 5) % hydratedTeams.length];
        const st = createHeadlessMatchState({
          id: `app500_${app}_${i}`,
          homeTeam: tHome,
          awayTeam: tAway,
          venue: 'Neutral Stadium',
          format: 'T20',
          leagueId: 'pt20',
          playerPool: INITIAL_PLAYERS,
          pitchType: 'Natural',
          weather: 'Clear Night',
          battingTactics: { approach: app, targetSide: 'all', runningRisk: 'normal' }
        });
        const inn1: InningsData = simulateFirstInningsHeadless(st, INITIAL_PLAYERS, 50000 + i * 31);
        totalRuns += inn1.runs;
        totalWkts += inn1.wickets;
        totalBalls += Math.max(1, inn1.ballsCompleted);
        totalExtras += inn1.extras?.total || 0;
        if (inn1.wickets >= 10) allOuts++;

        for (const bh of inn1.ballHistory) {
          if (bh.runs === 0 && !bh.isExtra) totalDots++;
          if (bh.isFour || bh.isSix) totalBoundaries++;
        }
      }

      approachAudit500[app] = {
        approach: app,
        inningsCount: INNINGS_PER_APPROACH,
        avgRuns: Number((totalRuns / INNINGS_PER_APPROACH).toFixed(1)),
        avgWickets: Number((totalWkts / INNINGS_PER_APPROACH).toFixed(1)),
        avgRunRate: Number(((totalRuns / totalBalls) * 6).toFixed(2)),
        dotPct: Number(((totalDots / totalBalls) * 100).toFixed(1)),
        boundaryPct: Number(((totalBoundaries / totalBalls) * 100).toFixed(1)),
        extrasPerInnings: Number((totalExtras / INNINGS_PER_APPROACH).toFixed(1)),
        allOutRatePct: Number(((allOuts / INNINGS_PER_APPROACH) * 100).toFixed(1))
      };
    }

    // Verify Defensive is no longer excessively penalized (<105 runs) and approaches have realistic trade-offs
    assert(
      approachAudit500.defensive.avgRuns >= 122 && approachAudit500.defensive.avgRuns <= 146,
      `Defensive T20 average runs should be in realistic 122-146 range (got ${approachAudit500.defensive.avgRuns})`
    );
    assert(
      approachAudit500.defensive.avgWickets < approachAudit500.anchor.avgWickets &&
        approachAudit500.anchor.avgWickets < approachAudit500.balanced.avgWickets &&
        approachAudit500.balanced.avgWickets < approachAudit500.aggressive.avgWickets &&
        approachAudit500.aggressive.avgWickets < approachAudit500.smash.avgWickets,
      'Average wickets lost over 500 innings must strictly increase from defensive -> anchor -> balanced -> aggressive -> smash'
    );
    assert(
      approachAudit500.defensive.avgRuns < approachAudit500.anchor.avgRuns &&
        approachAudit500.anchor.avgRuns < approachAudit500.balanced.avgRuns &&
        approachAudit500.balanced.avgRuns < approachAudit500.aggressive.avgRuns,
      'Average runs on Natural pitch must increase from defensive -> anchor -> balanced -> aggressive'
    );
    // Verify blind 20-over Smash from ball 1 has massive all-out risk (>70% all-out rate) and is NOT strictly better than Aggressive over a full 20-over innings!
    assert(
      approachAudit500.smash.allOutRatePct > 60 &&
        approachAudit500.smash.avgWickets > 8.5,
      `Blind 20-over Smash from ball 1 must suffer heavy wicket attrition (got ${approachAudit500.smash.avgWickets} wkts, ${approachAudit500.smash.allOutRatePct}% all-out)`
    );

    // Cross-Condition Tactical Optimality Check (proving no single tactic is universally optimal):
    // Scenario A: Flat Belter with strong batters -> Aggressive outscores Balanced
    let flatBal = 0, flatAgg = 0;
    for (let i = 0; i < 100; i++) {
      const baseSt = createHeadlessMatchState({
        id: `flat_ctx_${i}`,
        homeTeam,
        awayTeam,
        venue: 'Chinnaswamy',
        format: 'T20',
        leagueId: 'pt20',
        playerPool: INITIAL_PLAYERS,
        pitchType: 'Flat Belter',
        weather: 'Clear Night'
      });
      flatBal += simulateFirstInningsHeadless(
        { ...baseSt, battingTactics: { approach: 'balanced', targetSide: 'all', runningRisk: 'normal' } },
        INITIAL_PLAYERS,
        70000 + i * 17
      ).runs;
      flatAgg += simulateFirstInningsHeadless(
        { ...baseSt, battingTactics: { approach: 'aggressive', targetSide: 'all', runningRisk: 'normal' } },
        INITIAL_PLAYERS,
        70000 + i * 17
      ).runs;
    }
    tacticalContextMatrix.flatBelterBalancedRuns = Number((flatBal / 100).toFixed(1));
    tacticalContextMatrix.flatBelterAggressiveRuns = Number((flatAgg / 100).toFixed(1));

    // Scenario B: Green Seamer + Overcast against Attacking Pace Bowling -> Anchor/Balanced outscores blind Smash (which collapses all out)
    let greenAncRuns = 0, greenAncWkts = 0, greenSmashRuns = 0, greenSmashWkts = 0;
    for (let i = 0; i < 100; i++) {
      const baseSt = createHeadlessMatchState({
        id: `green_ctx_${i}`,
        homeTeam,
        awayTeam,
        venue: 'Green Park',
        format: 'T20',
        leagueId: 'pt20',
        playerPool: INITIAL_PLAYERS,
        pitchType: 'Green Seamer',
        weather: 'Overcast & Humid',
        bowlingTactics: {
          length: 'good',
          line: 'off_stump',
          angle: 'over',
          variation: 'Swings away',
          intent: 'attack',
          fielders: DEFAULT_MATCH_FIELD
        }
      });
      const innAnc = simulateFirstInningsHeadless(
        { ...baseSt, battingTactics: { approach: 'anchor', targetSide: 'all', runningRisk: 'cautious' } },
        INITIAL_PLAYERS,
        80000 + i * 23
      );
      const innSma = simulateFirstInningsHeadless(
        { ...baseSt, battingTactics: { approach: 'smash', targetSide: 'all', runningRisk: 'aggressive' } },
        INITIAL_PLAYERS,
        80000 + i * 23
      );
      greenAncRuns += innAnc.runs;
      greenAncWkts += innAnc.wickets;
      greenSmashRuns += innSma.runs;
      greenSmashWkts += innSma.wickets;
    }
    tacticalContextMatrix.greenSeamerOvercastAnchorRuns = Number((greenAncRuns / 100).toFixed(1));
    tacticalContextMatrix.greenSeamerOvercastAnchorWkts = Number((greenAncWkts / 100).toFixed(1));
    tacticalContextMatrix.greenSeamerOvercastSmashRuns = Number((greenSmashRuns / 100).toFixed(1));
    tacticalContextMatrix.greenSeamerOvercastSmashWkts = Number((greenSmashWkts / 100).toFixed(1));

    // Scenario C: Final 5 Death Overs (starting from 120/2 at 15.0 overs with set batters) -> Smash outscores Balanced
    let deathBalDelta = 0, deathSmashDelta = 0;
    for (let i = 0; i < 100; i++) {
      const baseSt = createHeadlessMatchState({
        id: `death_ctx_${i}`,
        homeTeam,
        awayTeam,
        venue: 'Wankhede',
        format: 'T20',
        leagueId: 'pt20',
        playerPool: INITIAL_PLAYERS,
        pitchType: 'Natural',
        weather: 'Clear Night'
      });
      const deathEntryInn: InningsData = {
        ...baseSt.innings1,
        runs: 120,
        wickets: 2,
        overs: 15,
        ballsCompleted: 90,
        batters: baseSt.innings1.batters.map((b, idx) =>
          idx === 0 ? { ...b, runs: 45, balls: 30, isOnStrike: true } : idx === 1 ? { ...b, runs: 38, balls: 26 } : b
        )
      };
      const innDeathBal = simulateFirstInningsHeadless(
        {
          ...baseSt,
          innings1: deathEntryInn,
          battingTactics: { approach: 'balanced', targetSide: 'all', runningRisk: 'normal' }
        },
        INITIAL_PLAYERS,
        90000 + i * 19
      );
      const innDeathSmash = simulateFirstInningsHeadless(
        {
          ...baseSt,
          innings1: deathEntryInn,
          battingTactics: { approach: 'smash', targetSide: 'all', runningRisk: 'aggressive' }
        },
        INITIAL_PLAYERS,
        90000 + i * 19
      );
      deathBalDelta += innDeathBal.runs - 120;
      deathSmashDelta += innDeathSmash.runs - 120;
    }
    tacticalContextMatrix.deathOvers5BalancedRuns = Number((deathBalDelta / 100).toFixed(1));
    tacticalContextMatrix.deathOvers5SmashRuns = Number((deathSmashDelta / 100).toFixed(1));

    assert(
      tacticalContextMatrix.flatBelterAggressiveRuns > tacticalContextMatrix.flatBelterBalancedRuns,
      'On Flat Belter, Aggressive must outscore Balanced'
    );
    assert(
      tacticalContextMatrix.greenSeamerOvercastAnchorWkts < tacticalContextMatrix.greenSeamerOvercastSmashWkts - 3,
      'On Green Seamer + Overcast, Anchor must preserve significantly more wickets than Smash'
    );
    assert(
      tacticalContextMatrix.deathOvers5SmashRuns > tacticalContextMatrix.deathOvers5BalancedRuns,
      'In the final 5 death overs with 8 wickets in hand, Smash must outscore Balanced'
    );
  });

  // 18. Section 5 Audit: 1,000+ Matches per Limited-Overs Format (T20, ODI) + TEST Sample & Team-Strength Win Rate Audit
  const formatAudits1000 = {} as Record<'T20' | 'ODI' | 'TEST', FormatAuditSummary>;
  let strongVsWeakWinRatePct = 0;
  let evenTeamsHomeWinRatePct = 0;

  runTest('18. Large-scale 1,000-match simulation audit per limited-overs format (T20, ODI) + TEST & team-strength audit', () => {
    const runFormatBatch = (
      format: 'T20' | 'ODI' | 'TEST',
      matchCount: number,
      seedBase: number
    ): FormatAuditSummary => {
      const quota = getFormatQuotaConfig(format);
      let inningsCount = 0;
      let totalRuns = 0;
      let totalWkts = 0;
      let totalBalls = 0;
      let totalDots = 0;
      let totalBoundaries = 0;
      let totalExtras = 0;
      let chaseWins = 0;
      let defendWins = 0;
      let ties = 0;
      let invalidStatesDetected = 0;
      let quotaViolationsDetected = 0;
      const inningsScores: number[] = [];

      for (let m = 0; m < matchCount; m++) {
        const tA = hydratedTeams[m % hydratedTeams.length];
        const tB = hydratedTeams[(m + 3) % hydratedTeams.length];
        const st = createHeadlessMatchState({
          id: `audit1000_${format}_${m}`,
          homeTeam: tA,
          awayTeam: tB,
          venue: 'Audit Arena',
          format,
          leagueId: format === 'T20' ? 'pt20' : 'intl',
          playerPool: INITIAL_PLAYERS
        });
        const fin = simulateFullMatchHeadless(st, INITIAL_PLAYERS, seedBase + m * 37);

        if (fin.status !== 'finished' || !fin.innings2) {
          invalidStatesDetected++;
        }

        // Check match result
        if (!fin.winnerTeamId) {
          ties++;
        } else if (fin.winnerTeamId === fin.innings2?.battingTeamId) {
          chaseWins++;
        } else {
          defendWins++;
        }

        for (const inn of [fin.innings1, fin.innings2]) {
          if (!inn) continue;
          inningsCount++;
          totalRuns += inn.runs;
          totalWkts += inn.wickets;
          totalBalls += Math.max(1, inn.ballsCompleted);
          totalExtras += inn.extras?.total || 0;
          inningsScores.push(inn.runs);

          // Invariant checks on every single innings
          const batSum = inn.batters.reduce((s, b) => s + b.runs, 0);
          const extSum = inn.extras?.total || 0;
          if (
            inn.runs !== batSum + extSum ||
            inn.wickets > 10 ||
            inn.ballsCompleted > quota.maxBalls
          ) {
            invalidStatesDetected++;
          }

          for (const bw of inn.bowlers) {
            if (oversToBalls(bw.overs) > quota.maxBallsPerBowler) {
              quotaViolationsDetected++;
            }
          }

          for (const bh of inn.ballHistory) {
            if (bh.runs === 0 && !bh.isExtra) totalDots++;
            if (bh.isFour || bh.isSix) totalBoundaries++;
          }
        }
      }

      inningsScores.sort((a, b) => a - b);

      return {
        format,
        matchesSimulated: matchCount,
        inningsCount,
        avgRuns: Number((totalRuns / inningsCount).toFixed(1)),
        avgWickets: Number((totalWkts / inningsCount).toFixed(1)),
        avgRunRate: Number(((totalRuns / totalBalls) * 6).toFixed(2)),
        dotPct: Number(((totalDots / totalBalls) * 100).toFixed(1)),
        boundaryPct: Number(((totalBoundaries / totalBalls) * 100).toFixed(1)),
        extrasPerInnings: Number((totalExtras / inningsCount).toFixed(1)),
        chaseWinRatePct: Number(((chaseWins / matchCount) * 100).toFixed(1)),
        defendWinRatePct: Number(((defendWins / matchCount) * 100).toFixed(1)),
        tieRatePct: Number(((ties / matchCount) * 100).toFixed(2)),
        scoreDistribution: {
          min: inningsScores[0] || 0,
          p10: computePercentile(inningsScores, 10),
          p25: computePercentile(inningsScores, 25),
          median: computePercentile(inningsScores, 50),
          p75: computePercentile(inningsScores, 75),
          p90: computePercentile(inningsScores, 90),
          max: inningsScores[inningsScores.length - 1] || 0
        },
        invalidStatesDetected,
        quotaViolationsDetected
      };
    };

    formatAudits1000.T20 = runFormatBatch('T20', 1000, 100000);
    formatAudits1000.ODI = runFormatBatch('ODI', 1000, 200000);
    formatAudits1000.TEST = runFormatBatch('TEST', 50, 400000);

    // Assert zero invalid states or quota violations across all simulated matches
    for (const fmt of ['T20', 'ODI', 'TEST'] as const) {
      assert(
        formatAudits1000[fmt].invalidStatesDetected === 0,
        `Detected ${formatAudits1000[fmt].invalidStatesDetected} invalid states in ${fmt} batch`
      );
      assert(
        formatAudits1000[fmt].quotaViolationsDetected === 0,
        `Detected ${formatAudits1000[fmt].quotaViolationsDetected} bowler quota violations in ${fmt} batch`
      );
    }

    // Strong XI (~84 OVR) vs Weak XI (~73 OVR) over 200 matches + Evenly Matched Teams over 200 matches
    const strongPlayers: Player[] = INITIAL_PLAYERS.slice(0, 11).map((p, i) => ({
      ...p,
      id: `strong_${i}`,
      clubId: 'strong_team',
      form: 80,
      ratings: { ...p.ratings, bat: 84, pow: 83, tec: 84, tmp: 83, vp: 84, vs: 84, bowl: 84, ctrl: 83, dth: 83, pace: 82 }
    }));
    const weakPlayers: Player[] = INITIAL_PLAYERS.slice(11, 22).map((p, i) => ({
      ...p,
      id: `weak_${i}`,
      clubId: 'weak_team',
      form: 72,
      ratings: { ...p.ratings, bat: 73, pow: 71, tec: 73, tmp: 72, vp: 73, vs: 73, bowl: 73, ctrl: 72, dth: 71, pace: 72 }
    }));
    const evenPlayersA: Player[] = INITIAL_PLAYERS.slice(0, 11).map((p, i) => ({
      ...p,
      id: `evenA_${i}`,
      clubId: 'even_a',
      form: 78,
      ratings: { ...p.ratings, bat: 79, pow: 78, tec: 79, tmp: 78, vp: 79, vs: 79, bowl: 79, ctrl: 78, dth: 78, pace: 78 }
    }));
    const evenPlayersB: Player[] = INITIAL_PLAYERS.slice(11, 22).map((p, i) => ({
      ...p,
      id: `evenB_${i}`,
      clubId: 'even_b',
      form: 78,
      ratings: { ...p.ratings, bat: 79, pow: 78, tec: 79, tmp: 78, vp: 79, vs: 79, bowl: 79, ctrl: 78, dth: 78, pace: 78 }
    }));

    const strongTeam: Team = { ...homeTeam, id: 'strong_team', shortName: 'STR', playingXIIds: strongPlayers.map(p => p.id), squad: strongPlayers };
    const weakTeam: Team = { ...awayTeam, id: 'weak_team', shortName: 'WEK', playingXIIds: weakPlayers.map(p => p.id), squad: weakPlayers };
    const evenTeamA: Team = { ...homeTeam, id: 'even_a', shortName: 'EVA', playingXIIds: evenPlayersA.map(p => p.id), squad: evenPlayersA };
    const evenTeamB: Team = { ...awayTeam, id: 'even_b', shortName: 'EVB', playingXIIds: evenPlayersB.map(p => p.id), squad: evenPlayersB };

    let strongWins = 0;
    const STRENGTH_MATCHES = 200;
    for (let m = 0; m < STRENGTH_MATCHES; m++) {
      const st = createHeadlessMatchState({
        id: `batch_str_wk_${m}`,
        homeTeam: m % 2 === 0 ? strongTeam : weakTeam,
        awayTeam: m % 2 === 0 ? weakTeam : strongTeam,
        venue: 'Arena',
        format: 'T20',
        leagueId: 'pt20',
        playerPool: [...strongPlayers, ...weakPlayers]
      });
      const fin = simulateFullMatchHeadless(st, [...strongPlayers, ...weakPlayers], 500000 + m * 29);
      if (fin.winnerTeamId === 'strong_team') strongWins++;
    }
    strongVsWeakWinRatePct = Number(((strongWins / STRENGTH_MATCHES) * 100).toFixed(1));

    let evenAWins = 0;
    for (let m = 0; m < STRENGTH_MATCHES; m++) {
      const st = createHeadlessMatchState({
        id: `batch_even_${m}`,
        homeTeam: m % 2 === 0 ? evenTeamA : evenTeamB,
        awayTeam: m % 2 === 0 ? evenTeamB : evenTeamA,
        venue: 'Arena',
        format: 'T20',
        leagueId: 'pt20',
        playerPool: [...evenPlayersA, ...evenPlayersB]
      });
      const fin = simulateFullMatchHeadless(st, [...evenPlayersA, ...evenPlayersB], 600000 + m * 31);
      if (fin.winnerTeamId === 'even_a') evenAWins++;
    }
    evenTeamsHomeWinRatePct = Number(((evenAWins / STRENGTH_MATCHES) * 100).toFixed(1));

    assert(
      strongVsWeakWinRatePct >= 62 && strongVsWeakWinRatePct <= 92,
      `Strong team win rate over 200 matches should be between 62% and 92% (got ${strongVsWeakWinRatePct}%)`
    );
    assert(
      evenTeamsHomeWinRatePct >= 40 && evenTeamsHomeWinRatePct <= 60,
      `Evenly matched teams win rate over 200 matches should be near 50% (got ${evenTeamsHomeWinRatePct}%)`
    );
  });

  const batchReport: BatchMetricsReport = {
    t20AvgRuns: formatAudits1000.T20.avgRuns,
    t20AvgWickets: formatAudits1000.T20.avgWickets,
    t20AvgRunRate: formatAudits1000.T20.avgRunRate,
    t20DotPct: formatAudits1000.T20.dotPct,
    t20BoundaryPct: formatAudits1000.T20.boundaryPct,
    t20ExtrasPerInnings: formatAudits1000.T20.extrasPerInnings,
    odiAvgRuns: formatAudits1000.ODI.avgRuns,
    odiAvgWickets: formatAudits1000.ODI.avgWickets,
    odiAvgRunRate: formatAudits1000.ODI.avgRunRate,
    testAvgRuns: formatAudits1000.TEST.avgRuns,
    testAvgWickets: formatAudits1000.TEST.avgWickets,
    testAvgRunRate: formatAudits1000.TEST.avgRunRate,
    strongVsWeakWinRatePct,
    evenTeamsHomeWinRatePct,
    defensiveAvgRuns: approachAudit500.defensive.avgRuns,
    defensiveAvgWickets: approachAudit500.defensive.avgWickets,
    anchorAvgRuns: approachAudit500.anchor.avgRuns,
    anchorAvgWickets: approachAudit500.anchor.avgWickets,
    balancedAvgRuns: approachAudit500.balanced.avgRuns,
    balancedAvgWickets: approachAudit500.balanced.avgWickets,
    aggressiveAvgRuns: approachAudit500.aggressive.avgRuns,
    aggressiveAvgWickets: approachAudit500.aggressive.avgWickets,
    smashAvgRuns: approachAudit500.smash.avgRuns,
    smashAvgWickets: approachAudit500.smash.avgWickets,
    approachAudit500,
    tacticalContextMatrix,
    formatAudits1000
  };

  return { passed, total, results, batchReport };
}
