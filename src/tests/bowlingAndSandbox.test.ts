import {
  oversToBalls,
  ballsToOvers,
  formatOversDisplay,
  addCricketOvers,
  calculateBowlingEconomy,
  isLegalBallForBowler,
  getRunsChargedToBowler,
  isBowlerCreditedWicket,
  compareBestBowling,
  applyDeliveryToBowlerScorecard,
  aggregateBowlerMatchStatsIntoCareer
} from '../utils/bowlingStats';
import {
  buildAuctionSandboxState,
  calculateMegaRetentionSummary,
  calculateMiniRetentionSummary,
  canRetainPlayerInMega,
  isPlayerUncappedDomestic,
  MEGA_AUCTION_PURSE_CR,
  MEGA_CAPPED_RETENTION_SLABS_CR,
  MEGA_UNCAPPED_RETENTION_SLAB_CR,
  MAX_MEGA_RETENTIONS,
  MAX_MEGA_CAPPED_RETENTIONS,
  MAX_MEGA_UNCAPPED_RETENTIONS
} from '../utils/auctionSandboxEngine';
import { INITIAL_TEAMS, INITIAL_PLAYERS } from '../data/initialData';
import { BallOutcome, BowlerInningsScorecard, Player, PlayerStats } from '../types/cricket';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runBowlingAndSandboxTests() {
  console.log('🧪 Starting Bowling Statistics & Auction Sandbox Regression Tests...');

  // =========================================================================
  // PART A — BOWLING STATISTICS & PLAYER ATTRIBUTION
  // =========================================================================

  // Test 1: oversToBalls and ballsToOvers conversions
  assert(oversToBalls(0) === 0, '0 overs = 0 balls');
  assert(oversToBalls(1.0) === 6, '1.0 over = 6 balls');
  assert(oversToBalls(3.4) === 22, '3.4 overs = 22 balls');
  assert(oversToBalls(4.0) === 24, '4.0 overs = 24 balls');
  assert(ballsToOvers(0) === 0, '0 balls = 0 overs');
  assert(ballsToOvers(6) === 1.0, '6 balls = 1.0 overs');
  assert(ballsToOvers(22) === 3.4, '22 balls = 3.4 overs');
  assert(ballsToOvers(24) === 4.0, '24 balls = 4.0 overs');

  // Test 2: formatOversDisplay
  assert(formatOversDisplay(3.4) === '3.4', 'formatOversDisplay(3.4) should be "3.4"');
  assert(formatOversDisplay(4.0, false, true) === '4.0', 'formatOversDisplay(4.0, false, true) should be "4.0"');
  assert(formatOversDisplay(22, true) === '3.4', 'formatOversDisplay(22 balls) should be "3.4"');

  // Test 3: addCricketOvers (accurate cricket balls math)
  assert(addCricketOvers(3.4, 0.2) === 4.0, '3.4 + 0.2 overs = 4.0 overs');
  assert(addCricketOvers(2.4, 1.3) === 4.1, '2.4 + 1.3 overs = 4.1 overs');
  assert(addCricketOvers(0.5, 0.1) === 1.0, '0.5 + 0.1 overs = 1.0 overs');
  assert(addCricketOvers(10.5, 9.4) === 20.3, '10.5 + 9.4 overs = 20.3 overs');

  // Test 4: calculateBowlingEconomy
  // 1 run in 1 ball = 6.00 economy (NOT 10.00 from 1/0.1)
  assert(calculateBowlingEconomy(1, 0.1) === 6.0, '1 run in 0.1 overs must be 6.00 economy');
  // 24 runs in 4.0 overs = 6.00 economy
  assert(calculateBowlingEconomy(24, 4.0) === 6.0, '24 runs in 4 overs must be 6.00 economy');
  // 28 runs in 3.4 overs (22 balls) = (28 * 6) / 22 = 7.64 economy
  assert(calculateBowlingEconomy(28, 3.4) === 7.64, '28 runs in 3.4 overs must be 7.64 economy');
  // 0 balls bowled = 0 economy
  assert(calculateBowlingEconomy(0, 0) === 0, '0 balls bowled must be 0 economy');

  // Test 5: Legal delivery identification
  assert(isLegalBallForBowler(false) === true, 'Standard delivery is legal');
  assert(isLegalBallForBowler(true, 'bye') === true, 'Bye is a legal ball for bowler');
  assert(isLegalBallForBowler(true, 'leg_bye') === true, 'Leg-bye is a legal ball for bowler');
  assert(isLegalBallForBowler(true, 'wide') === false, 'Wide is not a legal ball for bowler');
  assert(isLegalBallForBowler(true, 'no_ball') === false, 'No-ball is not a legal ball for bowler');

  // Test 6: Runs charged against bowler
  assert(getRunsChargedToBowler(4, undefined) === 4, 'Standard boundary is charged to bowler');
  assert(getRunsChargedToBowler(4, 'bye') === 0, 'Byes are NOT charged to bowler');
  assert(getRunsChargedToBowler(4, 'leg_bye') === 0, 'Leg-byes are NOT charged to bowler');
  assert(getRunsChargedToBowler(1, 'wide') === 1, 'Wide extra is charged to bowler');
  assert(getRunsChargedToBowler(2, 'no_ball') === 2, 'No-ball and off-bat runs are charged to bowler');

  // Test 7: Wicket attribution
  assert(isBowlerCreditedWicket(true, 'bowled') === true, 'Bowled is credited to bowler');
  assert(isBowlerCreditedWicket(true, 'caught') === true, 'Caught is credited to bowler');
  assert(isBowlerCreditedWicket(true, 'lbw') === true, 'LBW is credited to bowler');
  assert(isBowlerCreditedWicket(true, 'stumped') === true, 'Stumped is credited to bowler');
  assert(isBowlerCreditedWicket(true, 'hit wicket') === true, 'Hit wicket is credited to bowler');
  assert(isBowlerCreditedWicket(true, 'run out') === false, 'Run-out is NOT credited to bowler');
  assert(isBowlerCreditedWicket(true, 'retired hurt') === false, 'Retired hurt is NOT credited to bowler');
  assert(isBowlerCreditedWicket(false) === false, 'Non-wicket ball is not credited');

  // Test 8: Best bowling comparison
  assert(compareBestBowling('0/0', 2, 18, 24) === '2/18', 'Initial 0/0 replaced by 2/18');
  assert(compareBestBowling('0/0', 0, 12, 12) === '0/12', 'Initial 0/0 replaced by 0/12 spell');
  assert(compareBestBowling('2/25', 3, 30, 24) === '3/30', '3/30 beats 2/25 (more wickets)');
  assert(compareBestBowling('3/35', 3, 20, 24) === '3/20', '3/20 beats 3/35 (same wickets, fewer runs)');
  assert(compareBestBowling('3/20', 3, 28, 24) === '3/20', '3/20 retained over 3/28');
  assert(compareBestBowling('4/10', 0, 0, 0) === '4/10', 'Did not bowl does not overwrite 4/10');

  // Test 9: applyDeliveryToBowlerScorecard with dynamic bowler insertion
  const initialBowlers: BowlerInningsScorecard[] = [
    {
      playerId: 'p_bowler_1',
      name: 'Jasprit Bumrah',
      overs: 1.0,
      ballsInCurrentOver: 0,
      maidens: 0,
      runs: 4,
      wickets: 0,
      economy: 4.0,
      isCurrentBowler: false
    }
  ];

  // Delivery 1 by Bumrah: Dot ball (legal)
  const dotBall: BallOutcome = {
    over: 1,
    ballNumber: 1,
    bowlerId: 'p_bowler_1',
    bowlerName: 'Jasprit Bumrah',
    strikerId: 'p_bat_1',
    strikerName: 'Striker A',
    nonStrikerId: 'p_bat_2',
    nonStrikerName: 'NonStriker B',
    runs: 0,
    isWicket: false,
    isFour: false,
    isSix: false,
    isExtra: false,
    bowlerSpeedMps: 39,
    shotAngleDeg: 120,
    shotDistanceM: 20,
    commentary: 'Good length, defended.',
    tacticalNote: ''
  };

  const step1 = applyDeliveryToBowlerScorecard({
    bowlers: initialBowlers,
    actualBowler: { id: 'p_bowler_1', name: 'Jasprit Bumrah' },
    outcome: dotBall,
    currentOverBowlerRuns: 0
  });

  assert(step1.updatedBowlerCard.overs === 1.1, 'Bumrah overs incremented to 1.1');
  assert(step1.updatedBowlerCard.ballsInCurrentOver === 1, 'Bumrah balls in over = 1');
  assert(step1.updatedBowlerCard.runs === 4, 'Bumrah runs remain 4');

  // Delivery 2 by a new 6th bowler not in list: Varun Chakravarthy
  const varunWicketBall: BallOutcome = {
    over: 2,
    ballNumber: 1,
    bowlerId: 'p_spin_new',
    bowlerName: 'Varun Chakravarthy',
    strikerId: 'p_bat_1',
    strikerName: 'Striker A',
    nonStrikerId: 'p_bat_2',
    nonStrikerName: 'NonStriker B',
    runs: 0,
    isWicket: true,
    wicketType: 'bowled',
    isFour: false,
    isSix: false,
    isExtra: false,
    bowlerSpeedMps: 26,
    shotAngleDeg: 0,
    shotDistanceM: 0,
    commentary: 'Bowled him! Through the gate.',
    tacticalNote: ''
  };

  const step2 = applyDeliveryToBowlerScorecard({
    bowlers: step1.bowlers,
    actualBowler: { id: 'p_spin_new', name: 'Varun Chakravarthy' },
    outcome: varunWicketBall,
    currentOverBowlerRuns: 0
  });

  assert(step2.bowlers.length === 2, 'New bowler dynamically appended to bowlers list');
  const varunCard = step2.bowlers.find(b => b.playerId === 'p_spin_new');
  assert(Boolean(varunCard), 'Varun Chakravarthy exists in scorecard');
  assert(varunCard?.wickets === 1, 'Varun credited with 1 wicket');
  assert(varunCard?.overs === 0.1, 'Varun overs = 0.1');
  assert(varunCard?.isCurrentBowler === true, 'Varun marked as current bowler');
  assert(step2.bowlers.find(b => b.playerId === 'p_bowler_1')?.isCurrentBowler === false, 'Bumrah is not current bowler');

  // Test 10: Maiden over credit when 6 consecutive dot balls are delivered
  let maidenTestBowlers: BowlerInningsScorecard[] = [
    {
      playerId: 'p_shami',
      name: 'Mohammed Shami',
      overs: 0,
      ballsInCurrentOver: 0,
      maidens: 0,
      runs: 0,
      wickets: 0,
      economy: 0,
      isCurrentBowler: true
    }
  ];

  let overRunsAcc = 0;
  for (let b = 1; b <= 6; b++) {
    const res = applyDeliveryToBowlerScorecard({
      bowlers: maidenTestBowlers,
      actualBowler: { id: 'p_shami', name: 'Mohammed Shami' },
      outcome: dotBall,
      currentOverBowlerRuns: overRunsAcc
    });
    maidenTestBowlers = res.bowlers;
    overRunsAcc = res.nextOverBowlerRuns;
  }

  const shamiCard = maidenTestBowlers.find(b => b.playerId === 'p_shami');
  assert(shamiCard?.overs === 1.0, 'Shami completed 1.0 over');
  assert(shamiCard?.maidens === 1, 'Shami credited with 1 maiden over');
  assert(shamiCard?.runs === 0, 'Shami runs conceded = 0');
  assert(shamiCard?.economy === 0, 'Shami economy = 0.00');

  // Test 11: aggregateBowlerMatchStatsIntoCareer
  const prevCareerStats: PlayerStats = {
    matches: 10,
    runs: 50,
    balls: 40,
    fours: 5,
    sixes: 2,
    fifties: 0,
    hundreds: 0,
    highestScore: 22,
    wickets: 14,
    oversBowled: 38.2, // 230 legal balls
    runsConceded: 290,
    maidens: 2,
    bestBowling: '3/24',
    average: 20.7,
    strikeRate: 125.0,
    economy: 7.57
  };

  const matchSpells: BowlerInningsScorecard[] = [
    {
      playerId: 'p_shami',
      name: 'Mohammed Shami',
      overs: 4.0, // 24 legal balls
      ballsInCurrentOver: 0,
      maidens: 1,
      runs: 18,
      wickets: 4,
      economy: 4.5,
      isCurrentBowler: false
    }
  ];

  const updatedCareer = aggregateBowlerMatchStatsIntoCareer(prevCareerStats, matchSpells);
  // 38.2 overs (230 balls) + 4.0 overs (24 balls) = 254 balls = 42.2 overs
  assert(updatedCareer.oversBowled === 42.2, `Career overs must be 42.2 (got ${updatedCareer.oversBowled})`);
  assert(updatedCareer.wickets === 18, 'Career wickets must be 14 + 4 = 18');
  assert(updatedCareer.runsConceded === 308, 'Career runs must be 290 + 18 = 308');
  assert(updatedCareer.maidens === 3, 'Career maidens must be 2 + 1 = 3');
  assert(updatedCareer.bestBowling === '4/18', `Best bowling 4/18 beats 3/24 (got ${updatedCareer.bestBowling})`);
  // (308 * 6) / 254 = 7.28 economy
  assert(updatedCareer.economy === 7.28, `Career economy must be 7.28 (got ${updatedCareer.economy})`);

  // =========================================================================
  // PART B — AUCTION SANDBOX SETUP & ISOLATION
  // =========================================================================

  // Test 12: Uncapped Domestic Player Qualification
  const defaultStats = {
    matches: 10,
    runs: 250,
    balls: 180,
    fours: 25,
    sixes: 8,
    fifties: 2,
    hundreds: 0,
    highestScore: 68,
    average: 27.7,
    strikeRate: 138.8,
    wickets: 0,
    oversBowled: 0,
    runsConceded: 0,
    maidens: 0,
    bestBowling: '0/0',
    economy: 0
  };

  const uncappedPlayer: Player = {
    id: 'p_uncapped_1',
    name: 'Angkrish Raghuvanshi',
    role: 'Top-order',
    country: 'India',
    isOverseas: false,
    age: 20,
    tier: 'Bronze',
    battingHand: 'RHB',
    bowlingArm: 'RAM',
    ratings: { bat: 74, pow: 72, bowl: 45, ctrl: 45, pace: 45, dth: 40, tmp: 78, fit: 85, tec: 74, cat: 70, comp: 76, exp: 62 },
    form: 80,
    fitness: 95,
    morale: 85,
    isInjured: false,
    injuryDays: 0,
    clubId: 'team_kol',
    salaryCr: 3.0,
    basePriceCr: 0.3,
    stats: { ...defaultStats }
  };

  const cappedPlayer: Player = {
    id: 'p_capped_1',
    name: 'Shreyas Iyer',
    role: 'Middle-order',
    country: 'India',
    isOverseas: false,
    age: 31,
    tier: 'Platinum',
    battingHand: 'RHB',
    bowlingArm: 'RAM',
    ratings: { bat: 89, pow: 86, bowl: 50, ctrl: 50, pace: 50, dth: 45, tmp: 90, fit: 90, tec: 88, cat: 85, comp: 89, exp: 90 },
    form: 85,
    fitness: 95,
    morale: 90,
    isInjured: false,
    injuryDays: 0,
    clubId: 'team_kol',
    salaryCr: 12.25,
    basePriceCr: 2.0,
    stats: { ...defaultStats }
  };

  assert(isPlayerUncappedDomestic(uncappedPlayer) === true, 'Angkrish is uncapped domestic');
  assert(isPlayerUncappedDomestic(cappedPlayer) === false, 'Shreyas Iyer is capped');

  // Test 13: Mega Auction Retention Slab Deductions
  const mockSquad: Player[] = [
    { ...cappedPlayer, id: 'c1', name: 'Star 1' },
    { ...cappedPlayer, id: 'c2', name: 'Star 2' },
    { ...cappedPlayer, id: 'c3', name: 'Star 3' },
    { ...cappedPlayer, id: 'c4', name: 'Star 4' },
    { ...cappedPlayer, id: 'c5', name: 'Star 5' },
    { ...uncappedPlayer, id: 'u1', name: 'Youngster 1' },
    { ...uncappedPlayer, id: 'u2', name: 'Youngster 2' },
    { ...cappedPlayer, id: 'c6', name: 'Extra Star' }
  ];

  // Retain 3 Capped + 1 Uncapped: Slabs = 18 + 14 + 11 (capped) + 4 (uncapped) = 47 Cr
  const megaSumm1 = calculateMegaRetentionSummary(mockSquad, ['c1', 'c2', 'c3', 'u1']);
  assert(megaSumm1.totalDeductionCr === 47.0, `Mega deduction for 3C+1U must be 47.0 Cr (got ${megaSumm1.totalDeductionCr})`);
  assert(megaSumm1.remainingPurseCr === 73.0, `Remaining purse must be 120 - 47 = 73.0 Cr (got ${megaSumm1.remainingPurseCr})`);
  assert(megaSumm1.rtmCardsRemaining === 2, `RTM cards must be 6 - 4 = 2 (got ${megaSumm1.rtmCardsRemaining})`);

  // Test 14: Mega Auction Cap Rules (Max 5 capped, max 2 uncapped, max 6 total)
  const currentRetained = [mockSquad[0], mockSquad[1], mockSquad[2], mockSquad[3], mockSquad[4]]; // 5 capped
  const checkExtraCapped = canRetainPlayerInMega(currentRetained, mockSquad[7]);
  assert(checkExtraCapped.allowed === false, 'Cannot retain a 6th capped player in Mega Auction');

  const checkUncapped = canRetainPlayerInMega(currentRetained, mockSquad[5]); // 1 uncapped
  assert(checkUncapped.allowed === true, 'Can retain an uncapped player as 6th retention');

  // Test 15: Mini Auction Salary Recoupment
  // Base purse 20.0 Cr, release a player with 12.0 Cr salary -> available purse = 32.0 Cr
  const miniSumm = calculateMiniRetentionSummary(20.0, [mockSquad[0], mockSquad[1]], ['c1']);
  assert(miniSumm.freedSalaryCr === 12.25, '100% of released player salary freed');
  assert(miniSumm.totalAvailablePurseCr === 32.25, 'Total purse = 20.0 + 12.25 = 32.25 Cr');

  // Test 16: buildAuctionSandboxState Complete Integration
  const sandbox = buildAuctionSandboxState({
    userTeamId: 'team_kol',
    mode: 'mega',
    userRetainedPlayerIds: ['c1', 'u1'], // 18 + 4 = 22 Cr deduction
    allTeams: INITIAL_TEAMS,
    allPlayers: [...INITIAL_PLAYERS, ...mockSquad]
  });

  assert(sandbox.updatedTeams.length === 10, 'All 10 IPL franchises maintained in sandbox');
  assert(sandbox.userPurseCr === 98.0, `User remaining purse in mega sandbox = 120 - 22 = 98.0 Cr (got ${sandbox.userPurseCr})`);
  assert(sandbox.userRtmCards === 4, `User RTM cards in mega sandbox = 6 - 2 = 4 (got ${sandbox.userRtmCards})`);
  assert(sandbox.auctionPoolLots.length >= 350, 'Auction sandbox lots pool populated with 350+ lots');

  // Verify that retained player 'c1' is NOT in the sandbox auction pool lots
  const foundRetainedInLots = sandbox.auctionPoolLots.some(lot => lot.id === 'c1');
  assert(foundRetainedInLots === false, 'Retained franchise players must be excluded from auction pool');

  // Test 17: Squad Retention Verification - Full squad is NOT shown; only retained players remain
  const kolTeam = sandbox.updatedTeams.find(t => t.id === 'team_kol');
  assert(kolTeam !== undefined, 'KKR franchise found in sandbox teams');
  const kolSquadPlayerIds = kolTeam!.squad.map(p => p.id);
  assert(kolSquadPlayerIds.includes('c1') && kolSquadPlayerIds.includes('u1'), 'Retained players c1 and u1 are in squad');
  assert(!kolSquadPlayerIds.includes('c2'), 'Un-retained player c2 is NOT in the sandbox team squad');

  const kolEffectivePlayers = sandbox.updatedPlayers.filter(p => p.clubId === 'team_kol');
  assert(kolEffectivePlayers.length === 2, `Effective players for KKR must be exactly 2 retained players (got ${kolEffectivePlayers.length})`);
  const releasedC2 = sandbox.updatedPlayers.find(p => p.id === 'c2');
  assert(releasedC2?.clubId === '', 'Un-retained player c2 clubId must be cleared to empty string');

  // Test 18: Sequential Set Order Preservation
  assert(sandbox.auctionPoolLots[0].set === 'BA1', 'First lot must belong to set BA1');
  const setSequence = Array.from(new Set(sandbox.auctionPoolLots.map(l => l.set)));
  assert(setSequence[0] === 'BA1', 'Auction set sequence begins with BA1');

  console.log('✅ ALL Bowling Statistics & Auction Sandbox Regression Tests PASSED!');
  return true;
}
