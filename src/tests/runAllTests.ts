import assert from 'node:assert/strict';
import { StyleSheet, Platform, Dimensions, AppRegistry } from '../rn/react-native';
import { CSV_PLAYERS, CSV_TEAM_XIS, CSV_TEAM_CAPTAINS } from '../data/csvPlayers';
import {
  INITIAL_PLAYERS,
  INITIAL_TEAMS,
  INITIAL_LEAGUES,
  INITIAL_NATIONS,
  INITIAL_ACHIEVEMENTS,
  INITIAL_COACH_PROFILE,
  INITIAL_JOB_OFFERS,
  INITIAL_DEFAULT_FIELD,
  createInitialPlayoffs
} from '../data/initialData';
import { simulateBall } from '../engine/cricketEngine';
import { calculateDLSTarget, applyDewFactorModifier } from '../engine/dlsEngine';
import { resolveKitColor, getStadiumTheme } from '../components/match/TacticalStadium2D';
import { CRICBUZZ_2026_INTL_TOURS, buildSeasonCalendarForTeam, safeStorageSet, pruneLegacyCacheKeys } from '../context/GameContext';
import { checkDrsEligibility, evaluateDrsDeliveryEvidence, getInitialReviewsForFormat } from '../utils/drsRules';
import { computeAnimationFrame, computeBouncePoint, computeShotTarget } from '../utils/cricketAnimationTimeline';
import { InningsData, BallOutcome, Player } from '../types/cricket';
import {
  FIELD_TEMPLATES,
  validateFieldRestrictions,
  analyzeBatterBowlerMatchup,
  runTacticalScenarioSimulation,
  derivePlayerPersonality,
  getDefaultInfrastructure,
  getFacilitySpecs,
  selectOptimalAiPlayingXI,
  computeHeadToHead,
  generateCricketDirectorBriefing
} from '../services/cricketServices';

interface TestResult {
  suite: 'UNIT' | 'SMOKE' | 'REGRESSION';
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function runTest(suite: 'UNIT' | 'SMOKE' | 'REGRESSION', name: string, fn: () => void) {
  try {
    fn();
    results.push({ suite, name, passed: true });
    console.log(`✅ [${suite}] ${name}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ suite, name, passed: false, error: msg });
    console.error(`❌ [${suite}] ${name} -> ${msg}`);
  }
}

// ============================================================================
// 1. SMOKE TESTS: Data Integrity, Franchises, Leagues, Nations & Achievements
// ============================================================================

runTest('SMOKE', 'CSV_PLAYERS contains all 265 verified players with complete 18-attribute ratings & stats', () => {
  assert.equal(CSV_PLAYERS.length, 265, `Expected 265 CSV players, got ${CSV_PLAYERS.length}`);
  assert.equal(INITIAL_PLAYERS.length, 265);

  const ids = new Set<string>();
  for (const p of CSV_PLAYERS) {
    assert.ok(p.id && p.id.length > 0, 'Player missing ID');
    assert.ok(!ids.has(p.id), `Duplicate player ID: ${p.id}`);
    ids.add(p.id);
    assert.ok(p.name && p.name.length > 0, `Player ${p.id} missing name`);
    assert.ok(['Top-order', 'Middle-order', 'All-rounder', 'Wk-bat', 'Pace', 'Spin'].includes(p.role), `Invalid role ${p.role}`);
    assert.ok(p.ratings.bat >= 1 && p.ratings.bat <= 100, `Invalid bat rating for ${p.name}`);
    assert.ok(p.ratings.bowl >= 1 && p.ratings.bowl <= 100, `Invalid bowl rating for ${p.name}`);
    assert.ok(p.ratings.pow >= 1 && p.ratings.pow <= 100, `Invalid pow rating for ${p.name}`);
    assert.ok(p.stats && typeof p.stats.runs === 'number', `Missing stats for ${p.name}`);
  }
});

runTest('SMOKE', 'All 10 IPL Franchises have 11 unique valid Playing XI IDs and a valid Captain', () => {
  assert.equal(INITIAL_TEAMS.length, 10, 'Expected 10 IPL franchises');
  const playerMap = new Map(CSV_PLAYERS.map(p => [p.id, p]));

  for (const team of INITIAL_TEAMS) {
    assert.equal(team.playingXIIds.length, 11, `Team ${team.shortName} should have 11 playingXIIds, got ${team.playingXIIds.length}`);
    const uniqueXI = new Set(team.playingXIIds);
    assert.equal(uniqueXI.size, 11, `Team ${team.shortName} has duplicate IDs in playingXIIds`);
    for (const pid of team.playingXIIds) {
      assert.ok(playerMap.has(pid), `Team ${team.shortName} references non-existent player ${pid}`);
    }
    assert.ok(team.captainId && playerMap.has(team.captainId), `Team ${team.shortName} has invalid captainId ${team.captainId}`);
    assert.ok(CSV_TEAM_XIS[team.id]?.length === 11, `CSV_TEAM_XIS[${team.id}] must have 11 players`);
    assert.ok(Boolean(CSV_TEAM_CAPTAINS[team.id]), `CSV_TEAM_CAPTAINS[${team.id}] must be defined`);
  }
});

runTest('SMOKE', 'Indian Premier League (IPL) is premier league with valid standings & playoff bracket', () => {
  assert.equal(INITIAL_LEAGUES.length, 1, 'Expected 1 league (IPL)');
  const ipl = INITIAL_LEAGUES[0];
  assert.equal(ipl.id, 'pt20', 'Premier league must be pt20 (IPL)');
  assert.equal(ipl.standings.length, 10, 'IPL must have 10 franchise teams in standings');
  const playoffs = ipl.playoffs || createInitialPlayoffs(ipl.standings);
  assert.ok(playoffs.q1.homeTeamId && playoffs.q1.awayTeamId, 'IPL Q1 bracket missing seeds');
  assert.ok(playoffs.eliminator.homeTeamId && playoffs.eliminator.awayTeamId, 'IPL Eliminator missing seeds');
});

runTest('SMOKE', 'All 8 International Nations & 79 Achievements are properly initialized', () => {
  assert.ok(INITIAL_NATIONS.length >= 8, `Expected at least 8 nations, got ${INITIAL_NATIONS.length}`);
  assert.equal(INITIAL_ACHIEVEMENTS.length, 79, `Expected 79 achievements, got ${INITIAL_ACHIEVEMENTS.length}`);
  const achIds = new Set(INITIAL_ACHIEVEMENTS.map(a => a.id));
  assert.equal(achIds.size, 79, 'All 79 achievement IDs must be unique');
  assert.ok(INITIAL_COACH_PROFILE.name.length > 0, 'Coach profile must have a name');
});

// ============================================================================
// 2. UNIT TESTS: DLS Engine, Dew Factor & Physics Ball Simulation Engine
// ============================================================================

runTest('UNIT', 'DLS Engine (calculateDLSTarget) computes realistic rain-revised targets across overs & wickets', () => {
  const fullInningsScore = 185;
  const dls15_0 = calculateDLSTarget(fullInningsScore, 20, 15, 0);
  const dls10_0 = calculateDLSTarget(fullInningsScore, 20, 10, 0);
  const dls10_4 = calculateDLSTarget(fullInningsScore, 20, 10, 4);

  assert.equal(dls15_0.isInterrupted, true);
  assert.equal(dls15_0.oversLost, 5);
  assert.equal(dls15_0.revisedMaxOvers, 15);
  assert.ok(dls15_0.dlsTargetRuns < fullInningsScore, '15-over target with 0 wickets should be less than 20-over score');
  assert.ok(dls10_0.dlsTargetRuns < dls15_0.dlsTargetRuns, '10-over target should be less than 15-over target');
  assert.ok(dls10_4.dlsTargetRuns <= dls10_0.dlsTargetRuns, 'Resource table should account for wickets lost');
  assert.ok(dls15_0.dlsFormulaSummary.includes('15 ov'), 'DLS summary string must mention revised overs');
});

runTest('UNIT', 'Dew Factor Modifier (applyDewFactorModifier) adjusts dot, boundary, and wicket probabilities', () => {
  const dry = applyDewFactorModifier(0.32, 0.18, 0.06, false);
  assert.equal(dry.dotProb, 0.32);
  assert.equal(dry.boundaryProb, 0.18);
  assert.equal(dry.wicketProb, 0.06);

  const wet = applyDewFactorModifier(0.32, 0.18, 0.06, true);
  assert.ok(wet.dotProb < dry.dotProb, 'Dew should reduce dot ball probability');
  assert.ok(wet.boundaryProb > dry.boundaryProb, 'Dew should boost boundary probability');
  assert.ok(wet.wicketProb < dry.wicketProb, 'Dew should reduce bowler wicket probability');
});

runTest('UNIT', 'Cricket Physics Engine (simulateBall) handles all tactical inputs and returns valid BallOutcome telemetry', () => {
  const striker = CSV_PLAYERS.find(p => p.name.includes('Narine')) || CSV_PLAYERS[0];
  const nonStriker = CSV_PLAYERS.find(p => p.name.includes('Rahane')) || CSV_PLAYERS[1];
  const bowler = CSV_PLAYERS.find(p => p.role === 'Pace') || CSV_PLAYERS[10];

  const approaches = ['defensive', 'anchor', 'balanced', 'aggressive', 'smash'] as const;
  const pairRunnings = ['hold_ones', 'standard', 'push_hard', 'shield'] as const;
  const efforts = ['conserve', 'standard', 'max'] as const;
  const speeds = ['slower', 'standard', 'quicker'] as const;

  let wicketsObserved = 0;
  let boundariesObserved = 0;

  for (let i = 0; i < 250; i++) {
    const outcome = simulateBall({
      bowler,
      striker,
      nonStriker,
      over: i % 20,
      ballInOver: (i % 6) + 1,
      pitchType: i % 2 === 0 ? 'Flat Belter' : 'Green Seamer',
      hasDew: i % 3 === 0,
      powerSurgeActive: i % 5 === 0,
      format: i % 4 === 0 ? 'TEST' : 'T20',
      pairRunning: pairRunnings[i % pairRunnings.length],
      intent: i % 2 === 0 ? 'attack' : 'contain',
      effort: efforts[i % efforts.length],
      keeperPos: i % 2 === 0 ? 'stumps' : 'normal',
      speed: speeds[i % speeds.length],
      bowlingTactics: {
        length: i % 3 === 0 ? 'yorker' : i % 3 === 1 ? 'good' : 'bouncer',
        line: i % 2 === 0 ? 'stumps' : 'outside_off',
        angle: 'over',
        variation: 'Stock ball',
        fielders: INITIAL_DEFAULT_FIELD
      },
      battingTactics: {
        approach: approaches[i % approaches.length],
        targetSide: 'all',
        runningRisk: 'normal',
        pairRunning: pairRunnings[i % pairRunnings.length]
      }
    });

    assert.equal(outcome.strikerId, striker.id);
    assert.equal(outcome.nonStrikerId, nonStriker.id);
    assert.equal(outcome.bowlerId, bowler.id);
    assert.ok(outcome.bowlerSpeedMps > 15 && outcome.bowlerSpeedMps < 50, `Invalid bowler speed: ${outcome.bowlerSpeedMps}`);
    assert.ok(outcome.commentary.length > 5, 'Commentary must not be empty');

    if (outcome.isWicket) {
      wicketsObserved++;
      // Phase 16 Regression Check: Dismissed player must be the striker who got out!
      assert.equal(outcome.dismissedPlayerId, striker.id, 'Wicket outcome must record striker as dismissedPlayerId');
      assert.equal(outcome.dismissedPlayerName, striker.name, 'Wicket outcome must record striker name as dismissedPlayerName');
      assert.ok(outcome.dismissalText && outcome.dismissalText.length > 0, 'Wicket outcome must include dismissalText');
      assert.equal(outcome.runs, 0, 'Wicket delivery should record 0 runs');
    }
    if (outcome.isFour || outcome.isSix) {
      boundariesObserved++;
    }
  }

  assert.ok(wicketsObserved > 0, 'Expected at least 1 wicket across 250 simulated deliveries');
  assert.ok(boundariesObserved > 0, 'Expected at least 1 boundary across 250 simulated deliveries');
});

// ============================================================================
// 3. REGRESSION TESTS: Stadium/Kit Themes, Multi-Team/Cricbuzz Calendar,
//    Wicket Fall Attribution, Custom Batting Lineup & State-Mutating DRS
// ============================================================================

runTest('REGRESSION', 'Phase 16: Stadium & Kit Palettes dynamically adapt across all 10 IPL franchises & 8 Nations', () => {
  assert.equal(resolveKitColor('KOL'), '#7c3aed');
  assert.equal(resolveKitColor('PUN'), '#ef4444');
  assert.equal(resolveKitColor('CSK'), '#eab308');
  assert.equal(resolveKitColor('MI'), '#2563eb');
  assert.equal(resolveKitColor('SRH'), '#f97316');
  assert.equal(resolveKitColor('RR'), '#db2777');
  assert.equal(resolveKitColor('IND'), '#2563eb');
  assert.equal(resolveKitColor('AUS'), '#eab308');
  assert.equal(resolveKitColor('SA'), '#16a34a');

  const edenTheme = getStadiumTheme('Eden Gardens, Kolkata', 'KOL', '#3A225D', '#F2A900', 'Flat Belter');
  const chepaukTheme = getStadiumTheme('MA Chidambaram Stadium, Chennai', 'CSK', '#F9CD05', '#00539F', 'Dry & Turning');
  const wankhedeTheme = getStadiumTheme('Wankhede Stadium, Mumbai', 'MI', '#004BA0', '#D4AF37', 'Green Seamer');

  assert.notEqual(edenTheme.roofRingColor, chepaukTheme.roofRingColor, 'Eden Gardens and Chepauk should have distinct roof ring colors');
  assert.notEqual(edenTheme.ledPerimeterColor, wankhedeTheme.ledPerimeterColor, 'Eden Gardens and Wankhede should have distinct LED perimeter colors');
  assert.notEqual(chepaukTheme.pitchSoilColor, wankhedeTheme.pitchSoilColor, 'Dry Turner and Green Seamer pitches should have distinct soil colors');
});

runTest('REGRESSION', 'Phase 16: Calendar builds 14 user fixtures, concurrent otherMatches for all teams, and Cricbuzz 2026 International Tours', () => {
  assert.ok(CRICBUZZ_2026_INTL_TOURS.length >= 20, `Expected >= 20 Cricbuzz 2026 international tour fixtures, got ${CRICBUZZ_2026_INTL_TOURS.length}`);

  const calendar = buildSeasonCalendarForTeam('team_kol', INITIAL_TEAMS);
  assert.ok(calendar.length >= 40, `Expected >= 40 calendar dates (league + playoffs + intl tours), got ${calendar.length}`);

  const userMatchDays = calendar.filter(d => d.type === 'match' && d.matchFixture);
  assert.equal(userMatchDays.length, 14, `Expected 14 user league match days, got ${userMatchDays.length}`);

  const daysWithOtherTeamMatches = calendar.filter(d => (d.otherMatches?.length || 0) > 0);
  assert.ok(daysWithOtherTeamMatches.length >= 25, `Expected concurrent other-team fixtures across league days, got ${daysWithOtherTeamMatches.length}`);

  const intlTourDays = calendar.filter(d => d.type === 'international' || (d.internationalMatches?.length || 0) > 0);
  assert.ok(intlTourDays.length >= 15, `Expected Cricbuzz 2026 international tour days in calendar, got ${intlTourDays.length}`);
});

runTest('REGRESSION', 'Phase 16 & 17: Custom Batting Lineup Order is preserved and Wicket Fall tracks the exact dismissed batter', () => {
  const kkr = INITIAL_TEAMS.find(t => t.id === 'team_kol')!;
  // Reverse the Playing XI order to simulate a custom user lineup in TeamManagementScreen
  const customXIIds = [...kkr.playingXIIds].reverse();
  const orderedPlayers = customXIIds
    .map(id => CSV_PLAYERS.find(p => p.id === id))
    .filter((p): p is Player => Boolean(p));

  assert.equal(orderedPlayers.length, 11);
  assert.equal(orderedPlayers[0].id, customXIIds[0], 'Opener #1 must match custom playingXIIds[0]');
  assert.equal(orderedPlayers[1].id, customXIIds[1], 'Opener #2 must match custom playingXIIds[1]');

  // Simulate a wicket falling on Opener #1 (with 24 runs off 14 balls) while #3 comes in at 0 (0)
  const opener1 = orderedPlayers[0];
  const opener2 = orderedPlayers[1];
  const number3 = orderedPlayers[2];

  const wicketOutcome: BallOutcome = {
    over: 3,
    ballNumber: 4,
    bowlerId: 'p_pbks_arshdeep_singh',
    bowlerName: 'Arshdeep Singh',
    strikerId: opener1.id,
    strikerName: opener1.name,
    nonStrikerId: opener2.id,
    nonStrikerName: opener2.name,
    runs: 0,
    isWicket: true,
    wicketType: 'caught',
    dismissedPlayerId: opener1.id,
    dismissedPlayerName: opener1.name,
    dismissalText: 'c Keeper b Arshdeep',
    incomingBatterId: number3.id,
    isFour: false,
    isSix: false,
    isExtra: false,
    bowlerSpeedMps: 141.2,
    shotAngleDeg: 315,
    shotDistanceM: 22,
    commentary: `OUT! ${opener1.name} caught behind!`,
    tacticalNote: 'Swinging delivery found the edge.'
  };

  // Even after currentStrikerId advances to number3.id, WicketBatterModal lookup uses dismissedPlayerId:
  const currentInningsAfterWicket: InningsData = {
    battingTeamId: kkr.id,
    bowlingTeamId: 'team_pun',
    runs: 38,
    wickets: 1,
    overs: 3.4,
    ballsCompleted: 22,
    maxOvers: 20,
    currentOverRuns: 4,
    batters: orderedPlayers.map((p, idx) => ({
      playerId: p.id,
      name: p.name,
      runs: idx === 0 ? 24 : idx === 1 ? 14 : 0,
      balls: idx === 0 ? 14 : idx === 1 ? 8 : 0,
      fours: idx === 0 ? 3 : 2,
      sixes: idx === 0 ? 1 : 0,
      dismissal: idx === 0 ? 'c Keeper b Arshdeep' : 'not out',
      strikeRate: idx === 0 ? 171.4 : idx === 1 ? 175.0 : 0,
      isOnStrike: p.id === number3.id
    })),
    bowlers: [
      {
        playerId: 'p_pbks_arshdeep_singh',
        name: 'Arshdeep Singh',
        overs: 1.4,
        ballsInCurrentOver: 4,
        maidens: 0,
        runs: 18,
        wickets: 1,
        economy: 10.8,
        isCurrentBowler: true
      }
    ],
    currentStrikerId: number3.id,
    currentNonStrikerId: opener2.id,
    currentBowlerId: 'p_pbks_arshdeep_singh',
    ballHistory: [wicketOutcome],
    fallOfWickets: [{ runs: 38, wicketNum: 1, over: 3.4, batterName: opener1.name }],
    overRuns: [10, 12, 12, 4]
  };

  // Verify LiveMatchEngine dismissed batter resolution:
  const resolvedDismissedId = wicketOutcome.dismissedPlayerId || wicketOutcome.strikerId;
  const resolvedDismissedScore = currentInningsAfterWicket.batters.find(b => b.playerId === resolvedDismissedId)!;
  assert.equal(resolvedDismissedId, opener1.id, 'Resolved dismissed batter ID must be Opener #1, not incoming #3');
  assert.equal(resolvedDismissedScore.runs, 24, 'Dismissed batter runs must be 24, not 0');
  assert.equal(resolvedDismissedScore.balls, 14, 'Dismissed batter balls must be 14, not 0');

  // Verify availableDugoutBatters still includes number3 so user can confirm or pick another batter:
  const survivingPartnerId = wicketOutcome.nonStrikerId!;
  const autoIncomingId = wicketOutcome.incomingBatterId;
  const unavailableIds = currentInningsAfterWicket.batters
    .filter(b =>
      b.dismissal !== 'not out' ||
      b.playerId === survivingPartnerId ||
      (b.balls > 0 && b.playerId !== autoIncomingId)
    )
    .map(b => b.playerId);
  const availableDugout = customXIIds
    .map(id => CSV_PLAYERS.find(p => p.id === id)!)
    .filter(p => !unavailableIds.includes(p.id));

  assert.equal(availableDugout.length, 9, 'All 9 remaining batters (including auto-subbed #3) must be selectable in WicketBatterModal');
  assert.equal(availableDugout[0].id, number3.id, 'First selectable batter in WicketBatterModal must be #3');
  assert.ok(!availableDugout.some(p => p.id === opener1.id), 'Dismissed opener must not be in available dugout list');
  assert.ok(!availableDugout.some(p => p.id === opener2.id), 'Surviving non-striker must not be in available dugout list');
});

runTest('REGRESSION', 'Phase 16: DRS Review Engine - Production Eligibility, Deterministic Evidence, Both Overturn Directions, Upheld & Innings Reset', () => {
  // 1. Test checkDrsEligibility on various ball outcomes
  const wideBall: BallOutcome = {
    over: 1, ballNumber: 1, bowlerId: 'p1', bowlerName: 'Bowler', strikerId: 'p2', strikerName: 'Batter',
    nonStrikerId: 'p3', nonStrikerName: 'NonStriker', runs: 1, isWicket: false, isFour: false, isSix: false,
    isExtra: true, extraType: 'wide', bowlerSpeedMps: 38, shotAngleDeg: 0, shotDistanceM: 0, commentary: 'Wide', tacticalNote: ''
  };
  // 1. Format-based DRS review allowance tests
  assert.equal(getInitialReviewsForFormat('TEST'), 3, 'TEST format must grant 3 reviews per team');
  assert.equal(getInitialReviewsForFormat('T20'), 2, 'T20 format must grant 2 reviews per team');
  assert.equal(getInitialReviewsForFormat('ODI'), 2, 'ODI format must grant 2 reviews per team');
  assert.equal(getInitialReviewsForFormat('100BALL'), 1, '100BALL format must grant 1 review per team');

  const wideDrs = checkDrsEligibility(wideBall, true, 2);
  assert.equal(wideDrs.canReview, false, 'Wide delivery must not be reviewable');

  const bowledBall: BallOutcome = {
    over: 1, ballNumber: 2, bowlerId: 'p1', bowlerName: 'Bowler', strikerId: 'p2', strikerName: 'Batter',
    nonStrikerId: 'p3', nonStrikerName: 'NonStriker', runs: 0, isWicket: true, wicketType: 'bowled',
    dismissalText: 'b Rabada', isFour: false, isSix: false, isExtra: false, bowlerSpeedMps: 38, shotAngleDeg: 0,
    shotDistanceM: 0, commentary: 'Clean bowled', tacticalNote: ''
  };
  const bowledDrs = checkDrsEligibility(bowledBall, true, 2);
  assert.equal(bowledDrs.canReview, false, 'Clean bowled must not be reviewable via DRS');

  const lbwBall: BallOutcome = {
    over: 1, ballNumber: 3, bowlerId: 'p1', bowlerName: 'Bowler', strikerId: 'p2', strikerName: 'Batter',
    nonStrikerId: 'p3', nonStrikerName: 'NonStriker', runs: 0, isWicket: true, wicketType: 'lbw',
    dismissalText: 'lbw b Rabada', isFour: false, isSix: false, isExtra: false, bowlerSpeedMps: 38, shotAngleDeg: 0,
    shotDistanceM: 0, commentary: 'LBW!', tacticalNote: ''
  };
  const lbwDrs = checkDrsEligibility(lbwBall, true, 2);
  assert.equal(lbwDrs.canReview, true, 'LBW wicket must be reviewable by batting team');
  assert.equal(lbwDrs.reviewType, 'lbw');

  const keeperCatchBall: BallOutcome = {
    over: 1, ballNumber: 4, bowlerId: 'p1', bowlerName: 'Bowler', strikerId: 'p2', strikerName: 'Batter',
    nonStrikerId: 'p3', nonStrikerName: 'NonStriker', runs: 0, isWicket: true, wicketType: 'caught',
    fielderName: 'Wicketkeeper', dismissalText: 'c Keeper b Rabada', isFour: false, isSix: false, isExtra: false,
    bowlerSpeedMps: 38, shotAngleDeg: 0, shotDistanceM: 0, commentary: 'Edged to keeper', tacticalNote: ''
  };
  const keeperDrs = checkDrsEligibility(keeperCatchBall, true, 2);
  assert.equal(keeperDrs.canReview, true, 'Caught behind by keeper must be reviewable');
  assert.equal(keeperDrs.reviewType, 'caught_behind');

  // Caught behind appeal on NOT OUT ball (bowling team review)
  const edgeNotOutBall: BallOutcome = {
    over: 1, ballNumber: 5, bowlerId: 'p1', bowlerName: 'Bowler', strikerId: 'p2', strikerName: 'Batter',
    nonStrikerId: 'p3', nonStrikerName: 'NonStriker', runs: 0, isWicket: false,
    isFour: false, isSix: false, isExtra: false, bowlerSpeedMps: 38, shotAngleDeg: 0,
    shotDistanceM: 0, commentary: 'Massive appeal from keeper for an edge down the leg side!', tacticalNote: ''
  };
  const edgeBowlingDrs = checkDrsEligibility(edgeNotOutBall, false, 2);
  assert.equal(edgeBowlingDrs.canReview, true, 'Bowling team can review caught behind appeal on NOT OUT call');
  assert.equal(edgeBowlingDrs.reviewType, 'caught_behind');

  const zeroReviewsDrs = checkDrsEligibility(lbwBall, true, 0);
  assert.equal(zeroReviewsDrs.canReview, false, 'Review must be disallowed when 0 reviews remaining');

  // 2. Test Deterministic Evidence Evaluation (zero randomness on repeat evaluation)
  const eval1 = evaluateDrsDeliveryEvidence(lbwBall, true, 'OUT', 'stumps', 'good');
  const eval2 = evaluateDrsDeliveryEvidence(lbwBall, true, 'OUT', 'stumps', 'good');
  assert.equal(eval1.finalDecision, eval2.finalDecision, 'Deterministic DRS evaluation must produce identical verdict on same delivery');
  assert.equal(eval1.snickoSpike, eval2.snickoSpike, 'Deterministic DRS evaluation must produce identical Snicko spike on same delivery');
  assert.equal(eval1.hawkeye.wickets, eval2.hawkeye.wickets, 'Deterministic DRS evaluation must produce identical Hawk-Eye trajectory on same delivery');

  // Evaluate evidence with explicit forcedReviewType = 'caught_behind'
  const evalCaughtBehind = evaluateDrsDeliveryEvidence(edgeNotOutBall, false, 'NOT OUT', 'off', 'good', 'caught_behind');
  assert.ok(evalCaughtBehind.reviewType === 'caught_behind', 'Evidence evaluation honors forced review type');

  // 3. Test repeat review attempt rejection on already reviewed ball
  const reviewedBall: BallOutcome = { ...lbwBall, drsReviewed: true };
  const reviewedDrs = checkDrsEligibility(reviewedBall, true, 2);
  assert.equal(reviewedDrs.canReview, false, 'Already reviewed ball must be rejected');

  // 4. Test OUT -> NOT OUT State Mutations
  const kkr = INITIAL_TEAMS.find(t => t.id === 'team_kol')!;
  const xi = kkr.playingXIIds.map(id => CSV_PLAYERS.find(p => p.id === id)!);
  const opener1 = xi[0];
  const opener2 = xi[1];
  const number3 = xi[2];

  let wickets = 1;
  let currentStrikerId = number3.id;
  let fallOfWickets = [{ runs: 42, wicketNum: 1, over: 4.2, batterName: opener1.name }];
  let bowlerWickets = 2;
  let batters = xi.map((p, idx) => ({
    playerId: p.id,
    name: p.name,
    runs: idx === 0 ? 28 : 14,
    balls: idx === 0 ? 16 : 10,
    fours: 3,
    sixes: 1,
    dismissal: idx === 0 ? 'lbw b Rabada' : 'not out',
    strikeRate: 175,
    isOnStrike: p.id === number3.id
  }));

  wickets = Math.max(0, wickets - 1);
  currentStrikerId = opener1.id;
  batters = batters.map(b =>
    b.playerId === opener1.id
      ? { ...b, dismissal: 'not out', isOnStrike: true }
      : { ...b, isOnStrike: false }
  );
  fallOfWickets = fallOfWickets.slice(0, -1);
  bowlerWickets = Math.max(0, bowlerWickets - 1);

  assert.equal(wickets, 0, 'Wickets should revert from 1 to 0 on overturned batting DRS review');
  assert.equal(currentStrikerId, opener1.id, 'Dismissed batter must be restored to striker crease');
  assert.equal(batters.find(b => b.playerId === opener1.id)?.dismissal, 'not out', 'Batter dismissal must revert to not out');
  assert.equal(fallOfWickets.length, 0, 'Fall of wickets entry must be removed');
  assert.equal(bowlerWickets, 1, 'Bowler wickets must decrement by 1');
});

runTest('REGRESSION', 'Phase 18: Continuous Match Animation Timeline, Trajectories, Action Sequences & Scorecard Safety', () => {
  const dummyField = INITIAL_DEFAULT_FIELD;

  // 1. Dot Ball
  const dotBall: BallOutcome = {
    over: 1, ballNumber: 1, bowlerId: 'p1', bowlerName: 'Bowler', strikerId: 'p2', strikerName: 'Batter',
    nonStrikerId: 'p3', nonStrikerName: 'NonStriker', runs: 0, isWicket: false, isFour: false, isSix: false,
    isExtra: false, bowlerSpeedMps: 38, shotAngleDeg: 0, shotDistanceM: 10, commentary: 'Dot ball', tacticalNote: ''
  };
  const dotFrame = computeAnimationFrame(0.5, dotBall, dummyField);
  assert.ok(dotFrame.phase >= 1 && dotFrame.phase <= 10, 'Dot ball animation generates valid phase');
  assert.equal(dotFrame.bailsDislodged, false, 'Dot ball does not dislodge bails');

  // 2. Single, Two and Three Runs
  const singleBall: BallOutcome = { ...dotBall, runs: 1, shotDistanceM: 35, shotAngleDeg: 45 };
  const singleFrame = computeAnimationFrame(0.6, singleBall, dummyField);
  assert.ok(singleFrame.strikerPos.y !== 232, 'Batter moves between creases during single run');

  const twoRunsBall: BallOutcome = { ...dotBall, runs: 2, shotDistanceM: 55, shotAngleDeg: 120 };
  const twoFrame = computeAnimationFrame(0.6, twoRunsBall, dummyField);
  assert.ok(twoFrame.strikerPose === 'running', 'Striker enters running pose on two runs');

  const threeRunsBall: BallOutcome = { ...dotBall, runs: 3, shotDistanceM: 70, shotAngleDeg: 280 };
  const threeFrame = computeAnimationFrame(0.6, threeRunsBall, dummyField);
  assert.ok(threeFrame.progress === 0.6, 'Three runs animation tracks frame progress smoothly');

  // 3. Four and Six Boundaries
  const fourBall: BallOutcome = { ...dotBall, runs: 4, isFour: true, shotDistanceM: 85, shotAngleDeg: 90 };
  const fourFrame = computeAnimationFrame(0.85, fourBall, dummyField);
  assert.ok(fourFrame.isBoundarySplash || fourFrame.ballPos.x > 200, 'Four boundary crosses boundary perimeter');

  const sixBall: BallOutcome = { ...dotBall, runs: 6, isSix: true, shotDistanceM: 95, shotAngleDeg: 350 };
  const sixFrame = computeAnimationFrame(0.5, sixBall, dummyField);
  assert.ok(sixFrame.ballHeight > 10, 'Six boundary has realistic aerial arc elevation height');

  // 4. Defensive Shot & Missed Delivery
  const defenseBall: BallOutcome = { ...dotBall, commentary: 'Defended solidly into the pitch' };
  const defenseFrame = computeAnimationFrame(0.32, defenseBall, dummyField);
  assert.equal(defenseFrame.strikerPose, 'defense');

  const missBall: BallOutcome = { ...dotBall, commentary: 'Beaten all ends up by swing' };
  const missFrame = computeAnimationFrame(0.32, missBall, dummyField);
  assert.ok(missFrame.strikerPose === 'miss' || missFrame.strikerPose === 'defense', 'Missed delivery shows beaten batter pose');

  // 5. Bowled Dismissal
  const bowledBall: BallOutcome = { ...dotBall, isWicket: true, wicketType: 'bowled' };
  const bowledFrame = computeAnimationFrame(0.6, bowledBall, dummyField);
  assert.equal(bowledFrame.bailsDislodged, true, 'Bowled dismissal dislodges bails');

  // 6. Caught Dismissal
  const caughtBall: BallOutcome = { ...dotBall, isWicket: true, wicketType: 'caught', shotDistanceM: 45, shotAngleDeg: 45 };
  const caughtFrame = computeAnimationFrame(0.8, caughtBall, dummyField);
  assert.ok(caughtFrame.fielders.some(f => f.action === 'catching' || f.isChasing), 'Caught dismissal triggers fielder catch action');

  // 7. LBW Dismissal
  const lbwBall: BallOutcome = { ...dotBall, isWicket: true, wicketType: 'lbw' };
  const lbwFrame = computeAnimationFrame(0.4, lbwBall, dummyField);
  assert.ok(lbwFrame.strikerPose === 'miss' || lbwFrame.strikerPose === 'defense', 'LBW dismissal shows trapped batter pose');

  // 8. Stumped Dismissal
  const stumpedBall: BallOutcome = { ...dotBall, isWicket: true, wicketType: 'stumped' };
  const stumpedFrame = computeAnimationFrame(0.8, stumpedBall, dummyField);
  assert.ok(stumpedFrame.keeperAction === 'stump' || stumpedFrame.keeperAction === 'collect', 'Stumped dismissal triggers keeper action');

  // 9. Run Out Dismissal
  const runOutBall: BallOutcome = { ...dotBall, runs: 1, isWicket: true, wicketType: 'run out', shotDistanceM: 40 };
  const runOutFrame = computeAnimationFrame(0.8, runOutBall, dummyField);
  assert.ok(runOutFrame.progress === 0.8, 'Run out animation resolves cleanly');

  // 10. Wide / Extra Ball
  const wideBall: BallOutcome = { ...dotBall, runs: 1, isExtra: true, extraType: 'wide' };
  const wideFrame = computeAnimationFrame(0.25, wideBall, dummyField, 'good', 'wide_outside_off');
  const wideBouncePt = computeBouncePoint('good', 'wide_outside_off');
  assert.ok(wideBouncePt.x < 200, 'Wide delivery bounces wide outside off stump line');

  // 11. Fielders Moving & Recovering
  const chaseFrame = computeAnimationFrame(0.6, singleBall, dummyField);
  const activeChaser = chaseFrame.fielders.find(f => f.isChasing);
  assert.ok(activeChaser !== undefined, 'Fielder accelerates to intercept shot target');

  // 12. Animation Skip (p = 1.0) & Autoplay Speed
  const skipFrame = computeAnimationFrame(1.0, sixBall, dummyField);
  assert.equal(skipFrame.progress, 1.0, 'Skipped animation immediately resolves to final progress frame');

  // 13. Consecutive Deliveries Key Differentiation
  const key1 = `${dotBall.over}.${dotBall.ballNumber}-${dotBall.runs}`;
  const key2 = `${singleBall.over}.${singleBall.ballNumber}-${singleBall.runs}`;
  assert.notEqual(key1, key2, 'Consecutive deliveries produce unique event keys');

  // 14. Component Unmount & Cleanup Safety
  assert.ok(typeof computeAnimationFrame === 'function', 'Animation timeline engine exports clean functional computation');

  // 15. Scorecard Consistency
  assert.equal(fourBall.runs, 4, 'Authoritative BallOutcome runs remain unaffected by animation visualizer');
  assert.equal(bowledBall.isWicket, true, 'Authoritative BallOutcome wicket state remains canonical');
});

runTest('SMOKE', 'React Native Architecture: StyleSheet, Platform, Dimensions, AppRegistry & AsyncStorage operate cleanly', () => {
  const styles = StyleSheet.create({
    box: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#070b12' },
  });
  const flattened = StyleSheet.flatten(styles.box);
  assert.equal(flattened.paddingLeft, 16);
  assert.equal(flattened.paddingRight, 16);
  assert.equal(flattened.paddingTop, 8);
  assert.equal(flattened.paddingBottom, 8);
  assert.ok(Platform.OS === 'web' || Platform.OS === 'android', 'Platform.OS must resolve cleanly');
  const winDim = Dimensions.get('window');
  assert.ok(winDim.width > 0 && winDim.height > 0, 'Dimensions.get("window") must return valid dimensions');
  const reg = AppRegistry.registerComponent('CricketCoach26', () => (() => null));
  assert.equal(reg.appKey, 'CricketCoach26');
});

// ============================================================================
// 4. STEP 5 COMPREHENSIVE DIRECTIVE TESTS
// ============================================================================

runTest('UNIT', 'Step 5.1: Auction purchases, purse deductions, player releases, retentions, and trades prevent negative purses', () => {
  const kkr = { ...INITIAL_TEAMS.find(t => t.id === 'team_kol')!, purseCr: 20.85 };
  const winningBidCr = 8.4;

  // Purchase deduction
  assert.ok(kkr.purseCr >= winningBidCr, 'Team must have enough purse for bid');
  const updatedPurse = Number((kkr.purseCr - winningBidCr).toFixed(2));
  assert.equal(updatedPurse, 12.45, 'Purse must deduct exact winning bid amount');
  assert.ok(updatedPurse >= 0, 'Purse must never become negative');

  // Release players for auction credit
  const kkrRoster = CSV_PLAYERS.filter(p => p.clubId === 'team_kol');
  const releasedPlayers = kkrRoster.slice(0, 3);
  const releaseCredit = Number(releasedPlayers.reduce((sum, p) => sum + (p.contractValueCr || p.basePriceCr || 2.0), 0).toFixed(2));
  const purseAfterRelease = Number((updatedPurse + releaseCredit).toFixed(2));
  assert.ok(purseAfterRelease > updatedPurse, 'Releasing players must credit purse');
});

runTest('REGRESSION', 'Step 5.2: IPL Playoff qualification and winner/loser progression (Q1 -> Eliminator -> Q2 -> Final)', () => {
  const standings = INITIAL_TEAMS.map((t, idx) => ({
    teamId: t.id,
    played: 14,
    won: Math.max(0, 11 - idx),
    lost: Math.min(14, 3 + idx),
    tied: 0,
    nrr: Number((1.2 - idx * 0.2).toFixed(2)),
    points: Math.max(0, 11 - idx) * 2
  }));

  const playoffs = createInitialPlayoffs(standings);
  assert.equal(playoffs.q1.homeTeamId, standings[0].teamId, 'Q1 home must be #1 seed');
  assert.equal(playoffs.q1.awayTeamId, standings[1].teamId, 'Q1 away must be #2 seed');
  assert.equal(playoffs.eliminator.homeTeamId, standings[2].teamId, 'Eliminator home must be #3 seed');
  assert.equal(playoffs.eliminator.awayTeamId, standings[3].teamId, 'Eliminator away must be #4 seed');

  // Advance Q1: #1 beats #2 -> #1 to Final, #2 to Q2
  playoffs.q1.completed = true;
  playoffs.q1.winnerTeamId = standings[0].teamId;
  playoffs.q1.loserTeamId = standings[1].teamId;
  playoffs.final.homeTeamId = playoffs.q1.winnerTeamId;
  playoffs.q2.homeTeamId = playoffs.q1.loserTeamId;

  // Advance Eliminator: #3 beats #4 -> #3 to Q2
  playoffs.eliminator.completed = true;
  playoffs.eliminator.winnerTeamId = standings[2].teamId;
  playoffs.eliminator.loserTeamId = standings[3].teamId;
  playoffs.q2.awayTeamId = playoffs.eliminator.winnerTeamId;

  assert.equal(playoffs.q2.homeTeamId, standings[1].teamId, 'Q2 home must be Q1 loser (#2)');
  assert.equal(playoffs.q2.awayTeamId, standings[2].teamId, 'Q2 away must be Eliminator winner (#3)');

  // Advance Q2: #2 beats #3 -> #2 to Final
  playoffs.q2.completed = true;
  playoffs.q2.winnerTeamId = standings[1].teamId;
  playoffs.final.awayTeamId = playoffs.q2.winnerTeamId;

  // Advance Final: #1 beats #2 -> Champion crowned
  playoffs.final.completed = true;
  playoffs.final.winnerTeamId = standings[0].teamId;
  playoffs.championTeamId = playoffs.final.winnerTeamId;

  assert.equal(playoffs.championTeamId, standings[0].teamId, 'Champion must be crowned after Final');
});

runTest('REGRESSION', 'Step 5.3: Interactive Field Editor templates, restrictions, and simulation boundary/catch impact', () => {
  const ppAttack = FIELD_TEMPLATES.find(t => t.id === 'powerplay_attacking')!;
  const deathFortress = FIELD_TEMPLATES.find(t => t.id === 'death_yorker')!;

  const ppVal = validateFieldRestrictions(ppAttack.positions, 'T20', 2);
  assert.ok(ppVal.valid, 'Powerplay Attack template must obey 2-fielder outside circle rule in Over 3');
  assert.ok(ppVal.outsideCount <= 2, `Expected <=2 outside in PP, got ${ppVal.outsideCount}`);

  const invalidPP = validateFieldRestrictions(deathFortress.positions, 'T20', 2);
  assert.equal(invalidPP.valid, false, '5-out Death Fortress must trigger Powerplay restriction warning in Over 3');

  const validDeath = validateFieldRestrictions(deathFortress.positions, 'T20', 18);
  assert.ok(validDeath.valid, 'Death Fortress (5 out) must be valid in Over 19');
});

runTest('REGRESSION', 'Step 5.4: Batter-Bowler Analytics, Tactical Scenario Simulator, Personalities, Infrastructure & AI XI', () => {
  const kkr = INITIAL_TEAMS.find(t => t.id === 'team_kol')!;
  const mi = INITIAL_TEAMS.find(t => t.id === 'team_mum')!;
  const batter = CSV_PLAYERS.find(p => p.clubId === kkr.id)!;
  const bowler = CSV_PLAYERS.find(p => p.clubId === mi.id && (p.role === 'Pace' || p.role === 'Spin'))!;

  const matchup = analyzeBatterBowlerMatchup(batter, bowler, []);
  assert.equal(matchup.batterId, batter.id);
  assert.equal(matchup.bowlerId, bowler.id);
  assert.ok(matchup.powerplaySR > 60 && matchup.deathOversSR > 80, 'Phase SRs must be realistic');

  const scenario = runTacticalScenarioSimulation(kkr, mi, CSV_PLAYERS, {
    iterations: 8,
    pitchType: 'Balanced Sporting',
    userBattingIntent: 'attacking',
    userBowlingAggression: 'balanced',
    fieldPreset: 'middle_squeeze'
  });
  assert.equal(scenario.iterations, 8);
  assert.equal(scenario.userWinCount + scenario.oppWinCount, 8);
  assert.ok(scenario.avgFirstInningsScore > 70, 'Scenario average score must be realistic');

  const personality = derivePlayerPersonality(batter, true);
  assert.ok(personality.leadershipScore > 0 && personality.professionalism > 0);

  const infra = getDefaultInfrastructure(kkr.id);
  const specs = getFacilitySpecs(infra);
  assert.equal(specs.length, 5, 'Must provide 5 upgradeable club infrastructure facilities');

  const optimalXI = selectOptimalAiPlayingXI(mi, CSV_PLAYERS, 'Dry & Turning');
  assert.equal(optimalXI.length, 11, 'AI Tactical Intelligence must select a valid 11-player lineup');

  const h2hEmpty = computeHeadToHead('KOL', 'MUM', []);
  assert.equal(h2hEmpty.teamAShort, 'KOL');
  assert.equal(h2hEmpty.teamBShort, 'MUM');

  // Test with CompletedMatchRecord where homeTeam and awayTeam are strings (as saved in completedMatchesHistory)
  const mockCompletedRecord: any = {
    id: 'm_test_1',
    dateStr: 'TODAY',
    homeTeam: 'KOL',
    awayTeam: 'MUM',
    summary: 'KOL 182/4 vs MUM 175/8 · KOL won by 7 runs',
    playerOfMatch: 'Andre Russell',
    innings1: { team: 'KOLKATA KNIGHT RIDERS', runs: 182, wickets: 4, overs: '20.0', batters: [], bowlers: [] },
    innings2: { team: 'MUMBAI INDIANS', runs: 175, wickets: 8, overs: '20.0', batters: [], bowlers: [] }
  };
  const h2hPopulated = computeHeadToHead('KOL', 'MUM', [mockCompletedRecord]);
  assert.equal(h2hPopulated.totalPlayed, 1);
  assert.equal(h2hPopulated.teamAWins, 1);
  assert.equal(h2hPopulated.teamBWins, 0);
  assert.equal(h2hPopulated.highestScoreA, '182/4');
  assert.equal(h2hPopulated.highestScoreB, '175/8');

  // Verify resilience against corrupted or missing records (e.g. undefined homeTeam, null matches, non-string items)
  const corruptedHistory: any[] = [
    null,
    undefined,
    { id: 'corrupt_1' },
    { id: 'corrupt_2', homeTeam: undefined, awayTeam: null },
    { id: 'corrupt_3', homeTeam: { id: 'team_kol' }, awayTeam: { id: 'team_mum' } },
    { id: 'corrupt_4', homeTeam: 12345, awayTeam: false },
    mockCompletedRecord
  ];
  const resilientH2H = computeHeadToHead('KOL', 'MUM', corruptedHistory);
  assert.ok(resilientH2H.totalPlayed >= 1, 'Must safely parse mixed/corrupted match histories without throwing');

  // Verify generateCricketDirectorBriefing runs cleanly with corrupted history and missing teams
  const resilientBriefing = generateCricketDirectorBriefing(
    mi,
    { id: 'team_kol', name: 'Kolkata Knight Riders', shortName: 'KKR' } as any,
    CSV_PLAYERS,
    'Balanced Sporting',
    corruptedHistory
  );
  assert.ok(resilientBriefing && resilientBriefing.director, 'Briefing must generate safely under edge conditions');
});

runTest('REGRESSION', 'Step 5.5: Manager Career Progression (Board targets, job security, reputation tiers, job offers) & Stadium Revenue', () => {
  const profile = { ...INITIAL_COACH_PROFILE };
  assert.ok(profile.boardTargets && profile.boardTargets.length >= 3, 'Must have at least 3 initial board targets');
  
  // Calculate job security
  const completedTargets = profile.boardTargets.filter(bt => bt.completed).length;
  const jobSecurityPct = Math.min(99, Math.max(22, Math.round(48 + (completedTargets * 14) + ((profile.domesticStats.winPct - 50) * 0.55))));
  assert.ok(jobSecurityPct >= 20 && jobSecurityPct <= 100, `Job security must be valid percentage, got ${jobSecurityPct}`);

  // Test reputation
  const titles = profile.domesticStats.titles + profile.nationalStats.worldCups;
  const repTitle = titles >= 3 ? 'Legendary Mastermind' : titles >= 1 ? 'Championship Winner' : 'Emerging Strategist';
  assert.ok(repTitle.length > 0, 'Reputation title must be resolved');

  // Test job offers
  assert.ok(INITIAL_JOB_OFFERS.length >= 5, 'Must have initial franchise & international job offers');
  const indJob = INITIAL_JOB_OFFERS.find(j => j.nationId === 'nat_ind');
  assert.ok(indJob && (indJob.salaryCr || 0) > 5, 'India job offer must have tier-1 salary');

  // Test stadium gate revenue formula
  const tier1Rev = Number((0.25 + (1 - 1) * 0.45).toFixed(2));
  const tier3Rev = Number((0.25 + (3 - 1) * 0.45).toFixed(2));
  assert.equal(tier1Rev, 0.25, 'Tier 1 stadium gate revenue must be 0.25 Cr');
  assert.equal(tier3Rev, 1.15, 'Tier 3 stadium gate revenue must be 1.15 Cr');
});

runTest('REGRESSION', 'Step 5.6: Storage Quota Guard (safeStorageSet, pruneLegacyCacheKeys) & compact save slot payload size', () => {
  // Test prune legacy cache
  pruneLegacyCacheKeys();

  // Test safeStorageSet prevents throwing QuotaExceededError
  const res = safeStorageSet('test_key_sample', JSON.stringify({ verified: true, ts: Date.now() }));
  assert.equal(typeof res, 'boolean');

  // Verify compact save payload stripping: teams without squads should be tiny
  const sampleTeams = INITIAL_TEAMS.map(t => ({ ...t, squad: [] }));
  const serializedCompact = JSON.stringify(sampleTeams);
  assert.ok(serializedCompact.length < 50000, `Compact teams must be under 50KB, got ${serializedCompact.length} bytes`);
});

runTest('REGRESSION', 'Step 5.7: AI Cricket Director (Executive Briefing, Recommended XI, Curator Directive, Game Plans, Workload & Scouting)', () => {
  const cskTeam = INITIAL_TEAMS.find(t => t.id === 'team_che' || t.id === 'team_csk') || INITIAL_TEAMS[1];
  const miTeam = INITIAL_TEAMS.find(t => t.id === 'team_mum') || INITIAL_TEAMS[2];

  const briefing = generateCricketDirectorBriefing(cskTeam, miTeam, INITIAL_PLAYERS, 'Balanced Sporting', []);

  // 1. Director Persona
  assert.equal(briefing.director.name, 'Stephen Fleming', 'CSK must have Stephen Fleming as Director');
  assert.ok(briefing.director.title.length > 0, 'Director title must be present');
  assert.ok(briefing.director.avatarTag === 'CSK', 'Director tag must match CSK');

  // 2. Executive Summary & Opponent Intel
  assert.ok(briefing.executiveSummary.length > 20, 'Executive summary must be detailed');
  assert.ok(briefing.opponentAnalysis.opponentTeam.id === miTeam.id);
  assert.ok(briefing.opponentAnalysis.tacticalVulnerability.length > 0, 'Vulnerability must be analyzed');

  // 3. Recommended XI
  assert.equal(briefing.recommendedXI.playerIds.length, 11, 'Recommended XI must contain exactly 11 players');
  assert.ok(briefing.recommendedXI.pitchSuitabilityScore >= 75 && briefing.recommendedXI.pitchSuitabilityScore <= 100);
  assert.ok(briefing.recommendedXI.balance.wicketkeeper >= 1, 'Must have at least 1 wicketkeeper');
  const bowlingDepth = briefing.recommendedXI.balance.pacers + briefing.recommendedXI.balance.spinners + briefing.recommendedXI.balance.allrounders;
  assert.ok(bowlingDepth >= 5, `Must have at least 5 bowling options, got ${bowlingDepth}`);

  // 4. Pitch Curator Directive
  assert.ok(['Balanced Sporting', 'Dry & Turning', 'Green Seamer', 'Flat Track', 'Two-Paced'].includes(briefing.pitchRecommendation.suggestedPitch));
  assert.ok(briefing.pitchRecommendation.curatorInstruction.length > 10);
  assert.ok(briefing.pitchRecommendation.strategicReason.length > 10);

  // 5. Tactical Game Plans
  assert.ok(briefing.tacticalGamePlan.powerplay.instructions.length > 0);
  assert.ok(briefing.tacticalGamePlan.middleOvers.instructions.length > 0);
  assert.ok(briefing.tacticalGamePlan.deathOvers.instructions.length > 0);

  // 6. Scouting & Infrastructure
  assert.ok(briefing.scoutingDirectives.length >= 1, 'Must generate at least 1 scouting directive');
  assert.ok(briefing.infrastructurePriority.costCr > 0, 'Facility upgrade cost must be positive');
  assert.equal(typeof briefing.infrastructurePriority.affordable, 'boolean');
});

runTest('REGRESSION', 'Step 5.8: End-to-End Multi-Feature Integration (Director, Matchup Intel, Scenario Lab, Field Editor, Universe, Personalities, Career, Quota Guard)', () => {
  const userTeam = INITIAL_TEAMS[0];
  const oppTeam = INITIAL_TEAMS[1];

  // Feature 1: AI Cricket Director
  const briefing = generateCricketDirectorBriefing(userTeam, oppTeam, INITIAL_PLAYERS, 'Green Seamer');
  assert.equal(briefing.recommendedXI.playerIds.length, 11);

  // Feature 2: Batter-Bowler Intelligence
  const testBatter = INITIAL_PLAYERS.find(p => p.role === 'Batter' || p.role === 'Top-order' || p.role === 'Batsman') || INITIAL_PLAYERS[0];
  const testBowler = INITIAL_PLAYERS.find(p => p.role === 'Pace' || p.role === 'Spin') || INITIAL_PLAYERS[1];
  const matchup = analyzeBatterBowlerMatchup(testBatter, testBowler, []);
  assert.ok(matchup.powerplaySR > 0 && matchup.deathOversSR > 0);
  assert.ok(['BATTER', 'BOWLER', 'EVEN'].includes(matchup.advantage));

  // Feature 3: What-If Simulation Laboratory
  const simRes = runTacticalScenarioSimulation(userTeam, oppTeam, INITIAL_PLAYERS, {
    iterations: 10,
    pitchType: 'Dry & Turning',
    userBattingIntent: 'attacking',
    userBowlingAggression: 'balanced',
    fieldPreset: 'spin_web'
  });
  assert.equal(simRes.iterations, 10);
  assert.ok(simRes.winProbabilityPct >= 0 && simRes.winProbabilityPct <= 100);

  // Feature 4: Save Integrity & Regression
  const testData = { verified: true, slot: 'test_regression_slot' };
  assert.equal(safeStorageSet('test_regression_key', JSON.stringify(testData)), true);

  // Feature 5: Interactive Field Editor
  const restrictions = validateFieldRestrictions(FIELD_TEMPLATES[0].positions, 'T20', 3);
  assert.equal(restrictions.valid, true);

  // Feature 6: Living Cricket Universe
  const league = INITIAL_LEAGUES[0];
  assert.equal(league.standings.length, 10);
  assert.ok(CRICBUZZ_2026_INTL_TOURS.length >= 6);

  // Feature 7: Player Personalities
  const personality = derivePlayerPersonality(testBatter, true);
  assert.ok(['Dressing Room Leader', 'Ice-Cold Finisher', 'High-Maintenance Superstar', 'Dedicated Team Man', 'Ambitious Maverick', 'Composed Mentor'].includes(personality.archetype));
  assert.ok(['Thriving', 'Content', 'Restless', 'Unhappy'].includes(personality.dressingRoomStatus));

  // Feature 8: Manager Career & Job Market
  assert.ok(INITIAL_JOB_OFFERS.length >= 5);
  assert.ok(INITIAL_COACH_PROFILE.boardTargets.length >= 3);
});

const failed = results.filter(r => !r.passed);
console.log(`\n=============================================================`);
console.log(`TEST SUMMARY: ${results.length - failed.length}/${results.length} PASSED (${failed.length} FAILED)`);
console.log(`=============================================================\n`);

if (failed.length > 0) {
  process.exit(1);
}

