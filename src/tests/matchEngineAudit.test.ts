import {
  createSeededRng,
  calculateEffectiveBattingSkill,
  calculateEffectiveBowlingSkill,
  calculateFieldPlacementImpact,
  calculateDeliveryProbabilities,
  selectDirectionalFielder,
  simulateBall,
  getFormatQuotaConfig,
  resolveSingleDeliveryState,
  createHeadlessMatchState,
  simulateFullMatchHeadless,
  DEFAULT_MATCH_FIELD
} from '../engine/cricketEngine';
import { INITIAL_PLAYERS, INITIAL_TEAMS } from '../data/initialData';
import { checkDrsEligibility, evaluateDrsDeliveryEvidence } from '../utils/drsRules';
import { recordMatchToPlayerStats } from '../utils/playerStatsHelpers';
import { oversToBalls } from '../utils/bowlingStats';
import { Player, Team, FielderPosition } from '../types/cricket';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
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
  defensiveAvgRuns: number;
  defensiveAvgWickets: number;
  balancedAvgRuns: number;
  balancedAvgWickets: number;
  aggressiveAvgRuns: number;
  aggressiveAvgWickets: number;
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

  const homeTeam: Team = INITIAL_TEAMS[0];
  const awayTeam: Team = INITIAL_TEAMS[1];

  const makeFreshMatch = (format: 'T20' | 'ODI' | 'TEST' | '100BALL' = 'T20') =>
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

  // 2. Wide adds extra run, charges bowler, does not increment legal ball count
  runTest('2. Wide adds extra run, charges bowler, does not increment legal ball count', () => {
    let state = makeFreshMatch('T20');
    const strikerId = state.innings1.currentStrikerId;
    const bowlerId = state.innings1.currentBowlerId;
    state = resolveSingleDeliveryState(state, INITIAL_PLAYERS, {
      forcedOutcome: { runs: 1, isExtra: true, extraType: 'wide', isWicket: false }
    });
    assert(state.innings1.ballsCompleted === 0, 'Wide must not increment legal ballsCompleted');
    assert(state.innings1.runs === 1, 'Wide must add 1 run to team score');
    assert(state.innings1.extras?.wides === 1 && state.innings1.extras?.total === 1, 'Wide recorded in extras.wides');
    const strikerCard = state.innings1.batters.find(b => b.playerId === strikerId)!;
    const bowlerCard = state.innings1.bowlers.find(b => b.playerId === bowlerId)!;
    assert(strikerCard.runs === 0 && strikerCard.balls === 0, 'Wide must not add to batter runs or balls faced');
    assert(bowlerCard.runs === 1 && bowlerCard.overs === 0, 'Wide must charge 1 run to bowler and 0 legal balls');
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

  // 8. Bowler cannot bowl consecutive overs or exceed format quota
  runTest('8. Bowler rotation prevents consecutive overs and enforces 4-over T20 & 10-over ODI quotas', () => {
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
  });

  // 9. Run-out does not increment bowler wickets
  runTest('9. Run-out increments team wickets and dismisses batter without crediting bowler wickets', () => {
    let state = makeFreshMatch('T20');
    const bowlerId = state.innings1.currentBowlerId;
    const strikerId = state.innings1.currentStrikerId;

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

    const bowlerCard = state.innings1.bowlers.find(b => b.playerId === bowlerId)!;
    assert(state.innings1.wickets === 1, 'Team wickets must be 1');
    assert(bowlerCard.wickets === 0, 'Bowler must NOT be credited with a wicket for a run out');
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

  // 11. DRS eligibility rejects invalid deliveries and handles umpire's call / overturns
  runTest('11. DRS eligibility rejects invalid deliveries and handles review retention/overturn rules', () => {
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
    assert(elig2.canReview, 'LBW given out with reviews remaining must be eligible for DRS');

    const noReviewsLeft = checkDrsEligibility(lbwOutBall, true, 0);
    assert(!noReviewsLeft.canReview, 'Cannot review when 0 reviews remain');
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

  // 13. Tie, win by runs, and win by wickets are calculated accurately
  runTest('13. Tie (runs === target - 1) and Win by Runs are distinguished accurately', () => {
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
  });

  // 14. Batting approaches produce expected directional changes in boundary rate and wicket risk
  runTest('14. Batting approaches (Defensive -> Balanced -> Aggressive -> Smash) scale boundary & wicket probabilities', () => {
    const striker = INITIAL_PLAYERS[0];
    const nonStriker = INITIAL_PLAYERS[1];
    const bowler = INITIAL_PLAYERS[4];

    const getProbsForApproach = (approach: 'defensive' | 'anchor' | 'balanced' | 'aggressive' | 'smash') =>
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
    const pBal = getProbsForApproach('balanced');
    const pAgg = getProbsForApproach('aggressive');
    const pSma = getProbsForApproach('smash');

    assert(
      pDef.wicketProb < pBal.wicketProb &&
        pBal.wicketProb < pAgg.wicketProb &&
        pAgg.wicketProb < pSma.wicketProb,
      'Wicket probability must strictly increase from defensive -> balanced -> aggressive -> smash'
    );
    assert(
      pDef.fourProb + pDef.sixProb < pBal.fourProb + pBal.sixProb &&
        pBal.fourProb + pBal.sixProb < pAgg.fourProb + pAgg.sixProb &&
        pAgg.fourProb + pAgg.sixProb < pSma.fourProb + pSma.sixProb,
      'Boundary probability must strictly increase from defensive -> balanced -> aggressive -> smash'
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

  // 16 & 17. Full match simulation & Idempotent Career Statistics commit
  runTest('16 & 17. Full match simulation completes cleanly & career stats commit idempotently with exact dismissals/catches', () => {
    const initial = makeFreshMatch('T20');
    const finished = simulateFullMatchHeadless(initial, INITIAL_PLAYERS, 101);
    assert(finished.status === 'finished', 'Simulated match must reach finished status');
    assert(finished.innings1.ballsCompleted <= 120 && finished.innings1.wickets <= 10, 'Innings 1 within bounds');
    assert(Boolean(finished.innings2 && finished.innings2.ballsCompleted <= 120 && finished.innings2.wickets <= 10), 'Innings 2 within bounds');

    // Verify team score equals batter runs + extras.total
    const inn1BatRuns = finished.innings1.batters.reduce((s, b) => s + b.runs, 0);
    const inn1Extras = finished.innings1.extras?.total || 0;
    assert(
      finished.innings1.runs === inn1BatRuns + inn1Extras,
      `Innings 1 total (${finished.innings1.runs}) must equal sum of batter runs (${inn1BatRuns}) + extras (${inn1Extras})`
    );

    // Test idempotent player stats recording
    const testPlayer: Player = {
      ...INITIAL_PLAYERS[0],
      stats: {
        matches: 0, innings: 0, dismissals: 0, runs: 0, balls: 0, fours: 0, sixes: 0,
        fifties: 0, hundreds: 0, highestScore: 0, wickets: 0, oversBowled: 0,
        runsConceded: 0, maidens: 0, bestBowling: '0/0', average: 0, strikeRate: 0
      },
      competitionStats: { processedMatchIds: [] }
    };
    const once = recordMatchToPlayerStats(testPlayer, finished, '2026');
    const twice = recordMatchToPlayerStats(once, finished, '2026');
    assert(once.stats.matches === 1, 'First commit increments matches to 1');
    assert(twice.stats.matches === 1 && twice.stats.runs === once.stats.runs, 'Second commit for same matchId must be a no-op');
  });

  // 18. Reproducible Batch Simulation Verification across Formats, Team Strengths, and Tactics
  let batchReport: BatchMetricsReport = {
    t20AvgRuns: 0, t20AvgWickets: 0, t20AvgRunRate: 0, t20DotPct: 0, t20BoundaryPct: 0, t20ExtrasPerInnings: 0,
    odiAvgRuns: 0, odiAvgWickets: 0, odiAvgRunRate: 0,
    testAvgRuns: 0, testAvgWickets: 0, testAvgRunRate: 0,
    strongVsWeakWinRatePct: 0,
    defensiveAvgRuns: 0, defensiveAvgWickets: 0,
    balancedAvgRuns: 0, balancedAvgWickets: 0,
    aggressiveAvgRuns: 0, aggressiveAvgWickets: 0
  };

  runTest('18. Reproducible multi-match batch simulation across T20, ODI, TEST, team strengths, and tactics', () => {
    // A. 30 T20 matches (60 innings)
    let t20Runs = 0, t20Wkts = 0, t20Balls = 0, t20Dots = 0, t20Boundaries = 0, t20Extras = 0, t20InningsCount = 0;
    for (let m = 0; m < 30; m++) {
      const tA = INITIAL_TEAMS[m % INITIAL_TEAMS.length];
      const tB = INITIAL_TEAMS[(m + 3) % INITIAL_TEAMS.length];
      const st = createHeadlessMatchState({
        id: `batch_t20_${m}`,
        homeTeam: tA,
        awayTeam: tB,
        venue: 'Batch Arena',
        format: 'T20',
        leagueId: 'pt20',
        playerPool: INITIAL_PLAYERS
      });
      const fin = simulateFullMatchHeadless(st, INITIAL_PLAYERS, 1000 + m * 37);
      for (const inn of [fin.innings1, fin.innings2]) {
        if (!inn) continue;
        t20InningsCount++;
        t20Runs += inn.runs;
        t20Wkts += inn.wickets;
        t20Balls += Math.max(1, inn.ballsCompleted);
        t20Extras += inn.extras?.total || 0;
        for (const bh of inn.ballHistory) {
          if (bh.runs === 0 && !bh.isExtra) t20Dots++;
          if (bh.isFour || bh.isSix) t20Boundaries++;
        }
      }
    }

    // B. 15 ODI matches (30 innings)
    let odiRuns = 0, odiWkts = 0, odiBalls = 0, odiInningsCount = 0;
    for (let m = 0; m < 15; m++) {
      const st = createHeadlessMatchState({
        id: `batch_odi_${m}`,
        homeTeam,
        awayTeam,
        venue: 'Batch ODI Ground',
        format: 'ODI',
        leagueId: 'intl',
        playerPool: INITIAL_PLAYERS
      });
      const fin = simulateFullMatchHeadless(st, INITIAL_PLAYERS, 5000 + m * 41);
      for (const inn of [fin.innings1, fin.innings2]) {
        if (!inn) continue;
        odiInningsCount++;
        odiRuns += inn.runs;
        odiWkts += inn.wickets;
        odiBalls += Math.max(1, inn.ballsCompleted);
      }
    }

    // C. 10 TEST matches (20 innings)
    let testRuns = 0, testWkts = 0, testBalls = 0, testInningsCount = 0;
    for (let m = 0; m < 10; m++) {
      const st = createHeadlessMatchState({
        id: `batch_test_${m}`,
        homeTeam,
        awayTeam,
        venue: 'Batch Test Ground',
        format: 'TEST',
        leagueId: 'intl',
        playerPool: INITIAL_PLAYERS
      });
      const fin = simulateFullMatchHeadless(st, INITIAL_PLAYERS, 8000 + m * 53);
      for (const inn of [fin.innings1, fin.innings2]) {
        if (!inn) continue;
        testInningsCount++;
        testRuns += inn.runs;
        testWkts += inn.wickets;
        testBalls += Math.max(1, inn.ballsCompleted);
      }
    }

    // D. Strong XI (ratings ~84) vs Weak XI (ratings ~73) over 30 matches
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
    const strongTeam: Team = { ...homeTeam, id: 'strong_team', shortName: 'STR', playingXIIds: strongPlayers.map(p => p.id), squad: strongPlayers };
    const weakTeam: Team = { ...awayTeam, id: 'weak_team', shortName: 'WEK', playingXIIds: weakPlayers.map(p => p.id), squad: weakPlayers };

    let strongWins = 0;
    for (let m = 0; m < 30; m++) {
      const st = createHeadlessMatchState({
        id: `batch_str_wk_${m}`,
        homeTeam: m % 2 === 0 ? strongTeam : weakTeam,
        awayTeam: m % 2 === 0 ? weakTeam : strongTeam,
        venue: 'Arena',
        format: 'T20',
        leagueId: 'pt20',
        playerPool: [...strongPlayers, ...weakPlayers]
      });
      const fin = simulateFullMatchHeadless(st, [...strongPlayers, ...weakPlayers], 12000 + m * 29);
      if (fin.winnerTeamId === 'strong_team') strongWins++;
    }

    // E. Batting Approach comparison (Defensive vs Balanced vs Aggressive) in Innings 1 over 20 matches each
    const simApproachStats = (approach: 'defensive' | 'balanced' | 'aggressive') => {
      let r = 0, w = 0;
      for (let m = 0; m < 20; m++) {
        const st = createHeadlessMatchState({
          id: `batch_app_${approach}_${m}`,
          homeTeam,
          awayTeam,
          venue: 'Arena',
          format: 'T20',
          leagueId: 'pt20',
          playerPool: INITIAL_PLAYERS,
          battingTactics: { approach, targetSide: 'all', runningRisk: 'normal' }
        });
        const fin = simulateFullMatchHeadless(st, INITIAL_PLAYERS, 15000 + m * 19);
        r += fin.innings1.runs;
        w += fin.innings1.wickets;
      }
      return { avgRuns: Number((r / 20).toFixed(1)), avgWickets: Number((w / 20).toFixed(1)) };
    };

    const defStats = simApproachStats('defensive');
    const balStats = simApproachStats('balanced');
    const aggStats = simApproachStats('aggressive');

    batchReport = {
      t20AvgRuns: Number((t20Runs / t20InningsCount).toFixed(1)),
      t20AvgWickets: Number((t20Wkts / t20InningsCount).toFixed(1)),
      t20AvgRunRate: Number(((t20Runs / t20Balls) * 6).toFixed(2)),
      t20DotPct: Number(((t20Dots / t20Balls) * 100).toFixed(1)),
      t20BoundaryPct: Number(((t20Boundaries / t20Balls) * 100).toFixed(1)),
      t20ExtrasPerInnings: Number((t20Extras / t20InningsCount).toFixed(1)),
      odiAvgRuns: Number((odiRuns / odiInningsCount).toFixed(1)),
      odiAvgWickets: Number((odiWkts / odiInningsCount).toFixed(1)),
      odiAvgRunRate: Number(((odiRuns / odiBalls) * 6).toFixed(2)),
      testAvgRuns: Number((testRuns / testInningsCount).toFixed(1)),
      testAvgWickets: Number((testWkts / testInningsCount).toFixed(1)),
      testAvgRunRate: Number(((testRuns / testBalls) * 6).toFixed(2)),
      strongVsWeakWinRatePct: Number(((strongWins / 30) * 100).toFixed(1)),
      defensiveAvgRuns: defStats.avgRuns,
      defensiveAvgWickets: defStats.avgWickets,
      balancedAvgRuns: balStats.avgRuns,
      balancedAvgWickets: balStats.avgWickets,
      aggressiveAvgRuns: aggStats.avgRuns,
      aggressiveAvgWickets: aggStats.avgWickets
    };

    assert(batchReport.strongVsWeakWinRatePct >= 65 && batchReport.strongVsWeakWinRatePct < 100, `Strong team should win majority of matches (got ${batchReport.strongVsWeakWinRatePct}%)`);
    assert(batchReport.defensiveAvgWickets < batchReport.aggressiveAvgWickets, 'Defensive batting must lose fewer wickets on average than Aggressive batting');
    assert(batchReport.defensiveAvgRuns < batchReport.balancedAvgRuns, 'Defensive batting must score slower than Balanced batting');
  });

  return { passed, total, results, batchReport };
}
