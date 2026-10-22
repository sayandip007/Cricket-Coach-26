import assert from 'node:assert/strict';
import {
  createHeadlessMatchState,
  resolveSingleDeliveryState,
  selectNextEligibleBowler,
  getFormatQuotaConfig
} from '../engine/cricketEngine';
import { INITIAL_PLAYERS, INITIAL_TEAMS } from '../data/initialData';
import { Player, Team, BallOutcome } from '../types/cricket';
import {
  validateImpactPlayerSubstitution,
  isOverseasPlayer
} from '../utils/playerStatsHelpers';
import { oversToBalls } from '../utils/bowlingStats';

export function runCricketBugsRegressionTests(): { passed: number; total: number; results: string[] } {
  const results: string[] = [];
  let passed = 0;
  let total = 0;

  function runSubTest(name: string, fn: () => void) {
    total++;
    try {
      fn();
      passed++;
      results.push(`PASS: ${name}`);
      console.log(`  ✅ ${name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push(`FAIL: ${name} -> ${msg}`);
      console.error(`  ❌ ${name} -> ${msg}`);
      throw err;
    }
  }

  console.log('\n🏏 Running Regression Tests for Cricket Engine Bugfixes (Bugs 1, 2 & 3)...');

  // Prepare standard teams with full squads
  const homeTeam: Team = {
    ...INITIAL_TEAMS[0],
    squad: INITIAL_PLAYERS.filter(p => p.clubId === INITIAL_TEAMS[0].id)
  };
  const awayTeam: Team = {
    ...INITIAL_TEAMS[1],
    squad: INITIAL_PLAYERS.filter(p => p.clubId === INITIAL_TEAMS[1].id)
  };

  // =========================================================================
  // BUG 1: Authoritative Bowler Selection & Desync Prevention
  // =========================================================================
  runSubTest('Bug 1: Selected bowler ID is the exact player who delivers the ball & records in scorecard', () => {
    const match = createHeadlessMatchState({
      id: 'reg_bug1_select_bowler',
      homeTeam,
      awayTeam,
      venue: 'Wankhede Stadium',
      format: 'T20',
      leagueId: 'pt20',
      playerPool: INITIAL_PLAYERS
    });

    const bowlingTeamSquad = homeTeam.squad;
    // Choose a specific bowler from bowling team who is not the default first bowler
    const targetBowler = bowlingTeamSquad[4] || bowlingTeamSquad[2];
    assert.ok(targetBowler, 'Must have a target bowler');

    // Explicitly set the currentBowlerId to targetBowler.id in innings1
    match.innings1.currentBowlerId = targetBowler.id;

    // Simulate 1 delivery
    const res = resolveSingleDeliveryState(match, INITIAL_PLAYERS);

    // 1. The lastBallOutcome must have bowlerId matching the targetBowler.id
    assert.equal(
      res.lastBallOutcome?.bowlerId,
      targetBowler.id,
      `Expected lastBallOutcome.bowlerId to be ${targetBowler.id}, got ${res.lastBallOutcome?.bowlerId}`
    );

    // 2. The ball history must contain the exact delivery with that bowlerId
    assert.equal(
      res.innings1.ballHistory[0]?.bowlerId,
      targetBowler.id,
      'First ball in ballHistory must record the selected bowler ID'
    );

    // 3. The bowler scorecard must have an entry for targetBowler.id with updated ball count
    const bCard = res.innings1.bowlers.find(b => b.playerId === targetBowler.id);
    assert.ok(bCard, `Scorecard must have an entry for ${targetBowler.id}`);
    assert.equal(bCard.name, targetBowler.name, 'Scorecard name must match target bowler name');
    assert.ok(
      bCard.overs > 0 || bCard.ballsInCurrentOver > 0 || oversToBalls(bCard.overs) === 1,
      'Bowler must have recorded a ball'
    );

    // 4. No silent substitution to any other bowler occurred
    const otherBowlersActive = res.innings1.bowlers.filter(
      b => b.playerId !== targetBowler.id && (b.overs > 0 || b.ballsInCurrentOver > 0)
    );
    assert.equal(otherBowlersActive.length, 0, 'No other bowler should have bowled');
  });

  // =========================================================================
  // BUG 2: Bowling Deadlock with 5 Bowlers in T20 (Overs 17-20)
  // =========================================================================
  runSubTest('Bug 2: T20 innings with 5 bowlers completes all 20 overs without deadlock or quota violations', () => {
    // Construct 5 distinct bowlers by spreading INITIAL_PLAYERS
    const baseP = INITIAL_PLAYERS[0];
    const customBowlers: Player[] = [
      { ...baseP, id: 'bw_1', name: 'Bowler 1', role: 'Bowler', bowlingArm: 'RAF' },
      { ...baseP, id: 'bw_2', name: 'Bowler 2', role: 'Bowler', bowlingArm: 'RAF' },
      { ...baseP, id: 'bw_3', name: 'Bowler 3', role: 'Bowler', bowlingArm: 'LS' },
      { ...baseP, id: 'bw_4', name: 'Bowler 4', role: 'Bowler', bowlingArm: 'ROB' },
      { ...baseP, id: 'bw_5', name: 'Bowler 5', role: 'Bowler', bowlingArm: 'LAF' }
    ];

    const customBatters: Player[] = Array.from({ length: 11 }, (_, i) => ({
      ...baseP,
      id: `bat_${i + 1}`,
      name: `Batter ${i + 1}`,
      role: 'Top-order',
      battingHand: 'RHB',
      bowlingArm: 'RAM'
    }));

    const bowlingTeamCustom: Team = {
      ...homeTeam,
      id: 'bowl_team_custom',
      name: 'Bowling Team',
      playingXIIds: [...customBowlers.map(p => p.id), ...customBatters.slice(0, 6).map(p => p.id)],
      squad: [...customBowlers, ...customBatters.slice(0, 6)]
    };

    const battingTeamCustom: Team = {
      ...awayTeam,
      id: 'bat_team_custom',
      name: 'Batting Team',
      playingXIIds: customBatters.map(p => p.id),
      squad: customBatters
    };

    const pool = [...customBowlers, ...customBatters];

    let match = createHeadlessMatchState({
      id: 'reg_bug2_5_bowlers_t20',
      homeTeam: bowlingTeamCustom,
      awayTeam: battingTeamCustom,
      venue: 'Eden Gardens',
      format: 'T20',
      leagueId: 'pt20',
      playerPool: pool
    });

    // Populate the 5 bowlers on the scorecard with 4 bowlers already completed 4.0 overs each (16 overs total = 96 balls)
    match.innings1.bowlers = [
      { playerId: 'bw_1', name: 'Bowler 1', overs: 4.0, ballsInCurrentOver: 0, maidens: 0, runs: 28, wickets: 1, economy: 7.0, isCurrentBowler: false },
      { playerId: 'bw_2', name: 'Bowler 2', overs: 4.0, ballsInCurrentOver: 0, maidens: 0, runs: 30, wickets: 0, economy: 7.5, isCurrentBowler: false },
      { playerId: 'bw_3', name: 'Bowler 3', overs: 4.0, ballsInCurrentOver: 0, maidens: 0, runs: 24, wickets: 1, economy: 6.0, isCurrentBowler: false },
      { playerId: 'bw_4', name: 'Bowler 4', overs: 4.0, ballsInCurrentOver: 0, maidens: 0, runs: 32, wickets: 1, economy: 8.0, isCurrentBowler: false },
      { playerId: 'bw_5', name: 'Bowler 5', overs: 0.0, ballsInCurrentOver: 0, maidens: 0, runs: 0, wickets: 0, economy: 0.0, isCurrentBowler: true }
    ];
    match.innings1.ballsCompleted = 96; // 16 overs bowled
    match.innings1.currentBowlerId = 'bw_5';

    const sampleOutcome = {
      ballNumber: 96,
      over: 15,
      bowlerId: 'bw_4',
      bowlerName: 'Bowler 4',
      strikerId: 'bat_1',
      strikerName: 'Batter 1',
      nonStrikerId: 'bat_2',
      nonStrikerName: 'Batter 2',
      runs: 1,
      batterRuns: 1,
      extraRuns: 0,
      isLegalDelivery: true,
      isWicket: false,
      isFour: false,
      isSix: false,
      isExtra: false,
      commentary: 'End of over 16'
    } as unknown as BallOutcome;
    match.innings1.ballHistory = [sampleOutcome];

    // Verify selectNextEligibleBowler at over 16 -> Bowler 5 must be selected
    const nextBowlerAfter16 = selectNextEligibleBowler(
      match.innings1.bowlers,
      'bw_4',
      24, // max 4 overs = 24 balls
      16,
      'T20',
      pool
    );
    assert.equal(nextBowlerAfter16, 'bw_5', 'Bowler 5 must be selected for over 17');

    // Simulate over 17 (6 balls) with Bowler 5
    let deliveryCount = 0;
    while (match.innings1.ballsCompleted < 102 && deliveryCount < 20) {
      match = resolveSingleDeliveryState(match, pool);
      deliveryCount++;
    }
    assert.equal(match.innings1.ballsCompleted, 102, 'Over 17 must be completed (102 balls total)');

    // Crucial check: At end of over 17, Bowler 5 just bowled ('bw_5').
    // Since bw_1, bw_2, bw_3, bw_4 are all at 4.0 overs (24 balls), bw_5 is the SOLE bowler under quota.
    // selectNextEligibleBowler MUST choose bw_5 for over 18, over 19, and over 20!
    const nextBowlerAfter17 = selectNextEligibleBowler(
      match.innings1.bowlers,
      'bw_5',
      24,
      17,
      'T20',
      pool
    );
    assert.equal(
      nextBowlerAfter17,
      'bw_5',
      'Bowler 5 must be permitted to bowl consecutive over 18 because they are the sole bowler under quota'
    );

    // Simulate remaining overs 18, 19, 20 to complete the 20 overs
    while (match.innings1.ballsCompleted < 120 && deliveryCount < 100) {
      match = resolveSingleDeliveryState(match, pool);
      deliveryCount++;
    }

    assert.equal(match.innings1.ballsCompleted, 120, 'All 20 overs (120 legal balls) must be completed');

    // Check that no bowler exceeded the 4-over quota
    const cardBw5 = match.innings1.bowlers.find(b => b.playerId === 'bw_5');
    assert.ok(cardBw5, 'Bowler 5 must be on scorecard');
    assert.equal(oversToBalls(cardBw5.overs), 24, 'Bowler 5 must have bowled exactly 4.0 overs (24 balls)');
    for (const b of match.innings1.bowlers) {
      assert.ok(
        oversToBalls(b.overs) <= 24,
        `Bowler ${b.playerId} exceeded 4-over quota: bowled ${b.overs} overs`
      );
    }
  });

  runSubTest('Bug 2: Format quota calculations obey T20 (4 overs), ODI (10 overs), and rain-shortened matches', () => {
    // 1. T20 quota
    const t20Quota = getFormatQuotaConfig('T20', 20);
    assert.equal(t20Quota.maxOversPerBowler, 4);
    assert.equal(t20Quota.maxBallsPerBowler, 24);

    // 2. ODI quota
    const odiQuota = getFormatQuotaConfig('ODI', 50);
    assert.equal(odiQuota.maxOversPerBowler, 10);
    assert.equal(odiQuota.maxBallsPerBowler, 60);

    // 3. Rain-shortened 10-over match quota: ceil(10 / 5) = 2 overs per bowler
    const rain10Quota = getFormatQuotaConfig('T20', 10);
    assert.equal(rain10Quota.maxOversPerBowler, 2);
    assert.equal(rain10Quota.maxBallsPerBowler, 12);

    // 4. Rain-shortened 5-over match quota: ceil(5 / 5) = 1 over per bowler
    const rain5Quota = getFormatQuotaConfig('T20', 5);
    assert.equal(rain5Quota.maxOversPerBowler, 1);
    assert.equal(rain5Quota.maxBallsPerBowler, 6);
  });

  // =========================================================================
  // BUG 3: IPL Impact Player Overseas Limit Validation
  // =========================================================================
  runSubTest('Bug 3: Rejects Impact Player substitution that would create a 5th overseas player in active XI', () => {
    const baseP = INITIAL_PLAYERS[0];
    const overseasPlayers: Player[] = [
      { ...baseP, id: 'os_1', name: 'Jos Buttler', country: 'England', isOverseas: true, role: 'Wk-bat' },
      { ...baseP, id: 'os_2', name: 'Trent Boult', country: 'New Zealand', isOverseas: true, role: 'Bowler' },
      { ...baseP, id: 'os_3', name: 'David Miller', country: 'South Africa', isOverseas: true, role: 'Batter' },
      { ...baseP, id: 'os_4', name: 'Rashid Khan', country: 'Afghanistan', isOverseas: true, role: 'All-rounder' }
    ];

    const indianPlayers: Player[] = Array.from({ length: 8 }, (_, i) => ({
      ...baseP,
      id: `ind_${i + 1}`,
      name: `Indian Player ${i + 1}`,
      country: 'India',
      isOverseas: false,
      role: 'Batter'
    }));

    const benchOverseas: Player = {
      ...baseP,
      id: 'os_bench_5',
      name: 'Mitchell Starc',
      country: 'Australia',
      isOverseas: true,
      role: 'Bowler'
    };

    const benchIndian: Player = {
      ...baseP,
      id: 'ind_bench_9',
      name: 'Rinku Singh',
      country: 'India',
      isOverseas: false,
      role: 'Batter'
    };

    const allPlayersPool = [...overseasPlayers, ...indianPlayers, benchOverseas, benchIndian];
    const activeXIIds = [...overseasPlayers.map(p => p.id), ...indianPlayers.slice(0, 7).map(p => p.id)];

    // Scenario A: 4 overseas already in XI. Substitute Indian player OUT, Overseas bench player IN.
    // Result: 5 overseas players -> MUST BE REJECTED!
    const subReject5thOS = validateImpactPlayerSubstitution({
      benchPlayerId: benchOverseas.id,
      outPlayerId: indianPlayers[0].id,
      activeXIIds,
      allPlayers: allPlayersPool,
      maxOverseasInXI: 4
    });
    assert.equal(subReject5thOS.isValid, false, 'Substituting an Indian player for an Overseas player when 4 already exist must be rejected');
    assert.equal(subReject5thOS.currentOverseasCount, 4);
    assert.equal(subReject5thOS.resultingOverseasCount, 5);
    assert.ok(subReject5thOS.reason?.includes('Cannot field more than 4 overseas players'));

    // Scenario B: 4 overseas in XI. Substitute Overseas OUT ('os_1'), Overseas IN ('benchOverseas').
    // Result: 4 overseas players -> MUST BE ALLOWED!
    const subAllowOSforOS = validateImpactPlayerSubstitution({
      benchPlayerId: benchOverseas.id,
      outPlayerId: overseasPlayers[0].id,
      activeXIIds,
      allPlayers: allPlayersPool,
      maxOverseasInXI: 4
    });
    assert.equal(subAllowOSforOS.isValid, true, 'Substituting Overseas for Overseas (maintaining 4) must be allowed');
    assert.equal(subAllowOSforOS.resultingOverseasCount, 4);

    // Scenario C: 4 overseas in XI. Substitute Overseas OUT ('os_1'), Indian IN ('benchIndian').
    // Result: 3 overseas players -> MUST BE ALLOWED!
    const subAllowIndforOS = validateImpactPlayerSubstitution({
      benchPlayerId: benchIndian.id,
      outPlayerId: overseasPlayers[0].id,
      activeXIIds,
      allPlayers: allPlayersPool,
      maxOverseasInXI: 4
    });
    assert.equal(subAllowIndforOS.isValid, true, 'Substituting Indian for Overseas (reducing to 3) must be allowed');
    assert.equal(subAllowIndforOS.resultingOverseasCount, 3);

    // Scenario D: Duplicate Impact Player usage rejected
    const subDuplicateRejected = validateImpactPlayerSubstitution({
      benchPlayerId: benchIndian.id,
      outPlayerId: indianPlayers[0].id,
      activeXIIds,
      allPlayers: allPlayersPool,
      impactPlayerAlreadyUsed: true,
      maxOverseasInXI: 4
    });
    assert.equal(subDuplicateRejected.isValid, false, 'Duplicate impact player usage must be rejected');

    // Scenario E: Replacing player not currently in active XI rejected
    const subNotInXIDisallowed = validateImpactPlayerSubstitution({
      benchPlayerId: benchIndian.id,
      outPlayerId: 'player_not_in_xi',
      activeXIIds,
      allPlayers: allPlayersPool,
      maxOverseasInXI: 4
    });
    assert.equal(subNotInXIDisallowed.isValid, false, 'Player not in active XI cannot be substituted out');

    // Scenario F: isOverseasPlayer helper respects nationality and explicit flag without name heuristics
    assert.equal(isOverseasPlayer({ country: 'India', isOverseas: false }), false);
    assert.equal(isOverseasPlayer({ country: 'IND', isOverseas: false }), false);
    assert.equal(isOverseasPlayer({ country: 'Australia', isOverseas: true }), true);
    assert.equal(isOverseasPlayer({ country: 'England' }), true);
    assert.equal(isOverseasPlayer({ isOverseas: true }), true);
  });

  return { passed, total, results };
}
