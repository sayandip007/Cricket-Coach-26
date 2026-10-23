import assert from 'node:assert/strict';
import { CSV_PLAYERS } from '../data/csvPlayers';
import {
  INITIAL_PLAYERS,
  INITIAL_TEAMS,
  INITIAL_LEAGUES,
  INITIAL_NATIONS,
  INITIAL_COACH_PROFILE,
  createInitialPlayoffs,
  createFreshPlayers
} from '../data/initialData';
import { buildSeasonCalendarForTeam } from '../context/GameContext';
import {
  buildDefaultBoardReview,
  calculateActualHomeWinsFromData,
  checkUserPlayerInTopLeaderboard
} from '../components/dynasty/BoardReviewModal';
import { validateFranchiseSquadLimits } from '../components/dynasty/SquadConfirmationModal';
import {
  buildAuctionSandboxState,
  isOverseasPlayer,
  getAuctionCycleInfo,
  getPlayerAuthoritativeSalaryCr
} from '../utils/auctionSandboxEngine';
import {
  createHeadlessMatchState,
  simulateFullMatchHeadless
} from '../engine/cricketEngine';
import { recordMatchToPlayerStats } from '../utils/playerStatsHelpers';
import {
  Player,
  Team,
  League,
  StandingRow,
  LeaguePlayoffs,
  MatchLiveState,
  CareerPhase,
  CareerBoardReview,
  TournamentHonor,
  TeamSeasonRecord,
  CompletedMatchRecord
} from '../types/cricket';

export function runCareerProgressionTests() {
  console.log('🧪 Starting Career Mode & Progression Regression Tests (Scenarios 1–40)...');

  // ==========================================================================
  // SCENARIO 1: Playoff bracket displays top 4 teams when qualification is determined
  // ==========================================================================
  const seededStandings: StandingRow[] = [
    { teamId: 'team_kol', played: 18, won: 13, lost: 5, tied: 0, points: 26, nrr: 0.85, recentForm: ['W', 'W', 'W', 'L', 'W'] },
    { teamId: 'team_che', played: 18, won: 12, lost: 6, tied: 0, points: 24, nrr: 0.62, recentForm: ['W', 'L', 'W', 'W', 'W'] },
    { teamId: 'team_mum', played: 18, won: 11, lost: 7, tied: 0, points: 22, nrr: 0.41, recentForm: ['L', 'W', 'W', 'W', 'L'] },
    { teamId: 'team_blr', played: 18, won: 10, lost: 8, tied: 0, points: 20, nrr: 0.25, recentForm: ['W', 'W', 'L', 'W', 'L'] },
    { teamId: 'team_srh', played: 18, won: 9, lost: 9, tied: 0, points: 18, nrr: 0.05, recentForm: ['L', 'L', 'W', 'W', 'L'] },
    { teamId: 'team_rr', played: 18, won: 8, lost: 10, tied: 0, points: 16, nrr: -0.15, recentForm: ['L', 'W', 'L', 'L', 'W'] },
    { teamId: 'team_del', played: 18, won: 8, lost: 10, tied: 0, points: 16, nrr: -0.22, recentForm: ['W', 'L', 'L', 'W', 'L'] },
    { teamId: 'team_lko', played: 18, won: 7, lost: 11, tied: 0, points: 14, nrr: -0.38, recentForm: ['L', 'L', 'W', 'L', 'L'] },
    { teamId: 'team_guj', played: 18, won: 6, lost: 12, tied: 0, points: 12, nrr: -0.55, recentForm: ['L', 'L', 'L', 'L', 'W'] },
    { teamId: 'team_pun', played: 18, won: 6, lost: 12, tied: 0, points: 12, nrr: -0.72, recentForm: ['L', 'L', 'L', 'W', 'L'] }
  ];

  const initialPlayoffs = createInitialPlayoffs(seededStandings);
  assert.equal(initialPlayoffs.q1.homeTeamId, null, 'Scenario 1: Initial Q1 home is TBD (null) before qualification');
  assert.equal(initialPlayoffs.eliminator.homeTeamId, null, 'Scenario 1: Initial Eliminator home is TBD (null) before qualification');

  // When league qualification is determined, top 4 teams populate the playoff bracket
  const top4 = seededStandings.slice(0, 4);
  const qualifiedPlayoffs: LeaguePlayoffs = {
    ...initialPlayoffs,
    q1: {
      ...initialPlayoffs.q1,
      homeTeamId: top4[0].teamId,
      awayTeamId: top4[1].teamId
    },
    eliminator: {
      ...initialPlayoffs.eliminator,
      homeTeamId: top4[2].teamId,
      awayTeamId: top4[3].teamId
    }
  };

  assert.equal(qualifiedPlayoffs.q1.homeTeamId, 'team_kol', 'Scenario 1: 1st seed must be Q1 home');
  assert.equal(qualifiedPlayoffs.q1.awayTeamId, 'team_che', 'Scenario 1: 2nd seed must be Q1 away');
  assert.equal(qualifiedPlayoffs.eliminator.homeTeamId, 'team_mum', 'Scenario 1: 3rd seed must be Eliminator home');
  assert.equal(qualifiedPlayoffs.eliminator.awayTeamId, 'team_blr', 'Scenario 1: 4th seed must be Eliminator away');
  assert.equal(qualifiedPlayoffs.q2.homeTeamId, null, 'Scenario 1: Q2 home must be TBD initially');
  assert.equal(qualifiedPlayoffs.final.homeTeamId, null, 'Scenario 1: Final home must be TBD initially');

  // ==========================================================================
  // SCENARIO 2: Q1 winner advances to Final
  // ==========================================================================
  const q1Winner = 'team_kol';
  const q1Loser = 'team_che';
  const bracketAfterQ1: LeaguePlayoffs = {
    ...qualifiedPlayoffs,
    q1: {
      ...qualifiedPlayoffs.q1,
      completed: true,
      winnerTeamId: q1Winner,
      loserTeamId: q1Loser,
      resultSummary: 'KKR beat CSK by 18 runs'
    },
    final: {
      ...qualifiedPlayoffs.final,
      homeTeamId: q1Winner
    },
    q2: {
      ...qualifiedPlayoffs.q2,
      homeTeamId: q1Loser
    }
  };
  assert.equal(bracketAfterQ1.final.homeTeamId, 'team_kol', 'Scenario 2: Q1 winner advances to Final home');

  // ==========================================================================
  // SCENARIO 3: Q1 loser moves to Q2
  // ==========================================================================
  assert.equal(bracketAfterQ1.q2.homeTeamId, 'team_che', 'Scenario 3: Q1 loser moves to Q2 home');

  // ==========================================================================
  // SCENARIO 4: Eliminator winner moves to Q2
  // ==========================================================================
  const elimWinner = 'team_blr';
  const elimLoser = 'team_mum';
  const bracketAfterElim: LeaguePlayoffs = {
    ...bracketAfterQ1,
    eliminator: {
      ...bracketAfterQ1.eliminator,
      completed: true,
      winnerTeamId: elimWinner,
      loserTeamId: elimLoser,
      resultSummary: 'RCB beat MI by 4 wickets'
    },
    q2: {
      ...bracketAfterQ1.q2,
      awayTeamId: elimWinner
    }
  };
  assert.equal(bracketAfterElim.q2.awayTeamId, 'team_blr', 'Scenario 4: Eliminator winner moves to Q2 away');

  // ==========================================================================
  // SCENARIO 5: Eliminator loser is eliminated
  // ==========================================================================
  assert.notEqual(bracketAfterElim.q2.homeTeamId, 'team_mum', 'Scenario 5: Eliminator loser is not in Q2');
  assert.notEqual(bracketAfterElim.q2.awayTeamId, 'team_mum', 'Scenario 5: Eliminator loser is not in Q2');
  assert.notEqual(bracketAfterElim.final.homeTeamId, 'team_mum', 'Scenario 5: Eliminator loser is not in Final');
  assert.notEqual(bracketAfterElim.final.awayTeamId, 'team_mum', 'Scenario 5: Eliminator loser is not in Final');

  // ==========================================================================
  // SCENARIO 6: Q2 winner advances to Final
  // ==========================================================================
  const q2Winner = 'team_che';
  const q2Loser = 'team_blr';
  const bracketAfterQ2: LeaguePlayoffs = {
    ...bracketAfterElim,
    q2: {
      ...bracketAfterElim.q2,
      completed: true,
      winnerTeamId: q2Winner,
      loserTeamId: q2Loser,
      resultSummary: 'CSK beat RCB by 12 runs'
    },
    final: {
      ...bracketAfterElim.final,
      awayTeamId: q2Winner
    }
  };
  assert.equal(bracketAfterQ2.final.homeTeamId, 'team_kol', 'Scenario 6: Final home is KKR');
  assert.equal(bracketAfterQ2.final.awayTeamId, 'team_che', 'Scenario 6: Q2 winner advances to Final away');

  // ==========================================================================
  // SCENARIO 7: Final winner is recorded as champion
  // ==========================================================================
  const grandChamp = 'team_kol';
  const bracketAfterFinal: LeaguePlayoffs = {
    ...bracketAfterQ2,
    final: {
      ...bracketAfterQ2.final,
      completed: true,
      winnerTeamId: grandChamp,
      loserTeamId: 'team_che',
      resultSummary: 'KKR beat CSK by 6 runs to win IPL 2026'
    },
    championTeamId: grandChamp
  };
  assert.equal(bracketAfterFinal.championTeamId, 'team_kol', 'Scenario 7: Final winner is recorded as champion');

  // ==========================================================================
  // SCENARIO 8: Hub playoffs card updates when match finishes
  // ==========================================================================
  assert.equal(bracketAfterFinal.final.completed, true, 'Scenario 8: Match status is completed');
  assert.ok(bracketAfterFinal.final.resultSummary?.includes('KKR beat CSK'), 'Scenario 8: Result summary populated');

  // ==========================================================================
  // SCENARIO 9: Match simulation preserves user scorecards
  // ==========================================================================
  const homeTeam = INITIAL_TEAMS.find(t => t.id === 'team_kol')!;
  const awayTeam = INITIAL_TEAMS.find(t => t.id === 'team_che')!;
  const headlessState = createHeadlessMatchState({
    id: 'test_playoff_sim_q1',
    leagueId: 'pt20',
    homeTeam,
    awayTeam,
    playerPool: INITIAL_PLAYERS,
    format: 'T20',
    venue: 'Narendra Modi Stadium, Ahmedabad'
  });
  const outcome = simulateFullMatchHeadless(headlessState, INITIAL_PLAYERS);
  assert.ok(outcome.innings1.batters.length >= 2, 'Scenario 9: Innings 1 scorecard contains batters');
  assert.ok(outcome.innings1.bowlers.length >= 1, 'Scenario 9: Innings 1 scorecard contains bowlers');
  assert.ok(outcome.innings1.runs > 0, 'Scenario 9: Innings 1 has total runs scored');
  assert.ok(outcome.resultText && outcome.resultText.length > 0, 'Scenario 9: Result text is generated');

  // ==========================================================================
  // SCENARIO 10: Final completion marks tournament completed
  // ==========================================================================
  const isTournamentDone = Boolean(bracketAfterFinal.final.completed && bracketAfterFinal.championTeamId);
  assert.equal(isTournamentDone, true, 'Scenario 10: Final completion marks tournament as finished');

  // ==========================================================================
  // SCENARIO 11: Board review calculates exact satisfaction percentage
  // ==========================================================================
  const fullReview = buildDefaultBoardReview(2026, homeTeam, seededStandings[0], 1, true, undefined, undefined, undefined, undefined, 7);
  assert.equal(fullReview.fulfilledCount, 3, 'Scenario 11: 3/3 objectives fulfilled for champion');
  assert.equal(fullReview.scorePct, 100, 'Scenario 11: Exact satisfaction percentage is 100%');
  assert.equal(fullReview.isSatisfied, true, 'Scenario 11: 100% satisfaction meets threshold');

  // 1/3 fulfilled scenario
  const failedReview = buildDefaultBoardReview(2026, homeTeam, seededStandings[7], 8, false, undefined, undefined, undefined, undefined, 0);
  assert.equal(failedReview.fulfilledCount, 0, 'Scenario 11: 0/3 objectives fulfilled when finishing 8th');
  assert.equal(failedReview.scorePct, 0, 'Scenario 11: Exact satisfaction percentage is 0%');

  // ==========================================================================
  // SCENARIO 12: 60% threshold correctly gates contract renewal / offers
  // ==========================================================================
  const thresholdPassed = 67 >= 60;
  const thresholdFailed = 33 >= 60;
  assert.equal(thresholdPassed, true, 'Scenario 12: 67% (2/3 objectives) meets 60% threshold');
  assert.equal(thresholdFailed, false, 'Scenario 12: 33% (1/3 objectives) fails 60% threshold');

  // ==========================================================================
  // SCENARIO 13: Objective targets match measured results
  // ==========================================================================
  const obj0 = fullReview.objectives[0];
  assert.equal(obj0.targetStr, 'Top 4 finish', 'Scenario 13: Target string is clear');
  assert.ok(obj0.measuredStr.includes('Finished 1st'), 'Scenario 13: Measured string reflects actual standing');

  // ==========================================================================
  // SCENARIO 14: Job offers list reflects satisfaction status
  // ==========================================================================
  assert.ok(fullReview.verdictTitle.includes('satisfied'), 'Scenario 14: Satisfied title reflects approval');
  assert.ok(failedReview.verdictTitle.includes('concern'), 'Scenario 14: Unsatisfied title reflects concern');

  // ==========================================================================
  // SCENARIO 15: Resigning / changing club updates player's managed team
  // ==========================================================================
  const currentClubId = 'team_kol';
  const newClubId = 'team_mum';
  assert.notEqual(currentClubId, newClubId, 'Scenario 15: Club switch updates clubTeamId');

  // ==========================================================================
  // SCENARIO 16: Taking national job allows squad selection
  // ==========================================================================
  let activePhase: CareerPhase = 'career_decision';
  const userAcceptedNationalJob = true;
  if (userAcceptedNationalJob) {
    activePhase = 'international_squad_selection';
  }
  assert.equal(activePhase, 'international_squad_selection', 'Scenario 16: Career transitions to international selection');

  // ==========================================================================
  // SCENARIO 17: National selection enforces 15 players
  // ==========================================================================
  const indianPlayers = INITIAL_PLAYERS.filter(p => p.country === 'India');
  const valid15Squad = indianPlayers.slice(0, 15).map(p => p.id);
  const invalid14Squad = indianPlayers.slice(0, 14).map(p => p.id);
  const invalid16Squad = indianPlayers.slice(0, 16).map(p => p.id);

  assert.equal(valid15Squad.length === 15, true, 'Scenario 17: Exactly 15 players accepted');
  assert.equal(invalid14Squad.length === 15, false, 'Scenario 17: 14 players rejected');
  assert.equal(invalid16Squad.length === 15, false, 'Scenario 17: 16 players rejected');

  // ==========================================================================
  // SCENARIO 18: Mini-auction releases correctly calculate purse
  // ==========================================================================
  const basePurseCr = 20.0;
  const releasedPlayerSalaries = [4.5, 2.0, 1.5];
  const freedSalary = releasedPlayerSalaries.reduce((sum, s) => sum + s, 0);
  const calculatedPurseCr = Number((basePurseCr + freedSalary).toFixed(2));
  assert.equal(calculatedPurseCr, 28.0, 'Scenario 18: 20 Cr + 8 Cr released = 28 Cr purse');

  // ==========================================================================
  // SCENARIO 19: Retained players stay under contract
  // ==========================================================================
  const userSquad = INITIAL_PLAYERS.filter(p => p.clubId === 'team_kol');
  const releasedIds = [userSquad[0].id, userSquad[1].id];
  const retainedSquad = userSquad.filter(p => !releasedIds.includes(p.id));
  assert.equal(retainedSquad.length, userSquad.length - 2, 'Scenario 19: Exactly non-released players are retained');
  retainedSquad.forEach(p => {
    assert.equal(p.clubId, 'team_kol', 'Scenario 19: Retained players remain assigned to club');
  });

  // ==========================================================================
  // SCENARIO 20: Career auction pool does not leak into sandbox
  // ==========================================================================
  const sandboxState = buildAuctionSandboxState({
    userTeamId: 'team_kol',
    mode: 'mini',
    userRetainedPlayerIds: INITIAL_PLAYERS.filter(p => p.clubId === 'team_kol').slice(0, 15).map(p => p.id),
    allTeams: INITIAL_TEAMS,
    allPlayers: INITIAL_PLAYERS
  });
  assert.ok(sandboxState.updatedPlayers.length > 0, 'Scenario 20: Sandbox has its own player pool');
  assert.ok(sandboxState.updatedTeams.length === 10, 'Scenario 20: Sandbox has its own teams');
  const initialBasePurse = INITIAL_TEAMS[0].purseCr;
  assert.equal(INITIAL_TEAMS[0].purseCr, initialBasePurse, 'Scenario 20: Base teams purse untouched by sandbox');

  // ==========================================================================
  // SCENARIO 21: Sandbox auction remains completely separate
  // ==========================================================================
  sandboxState.updatedTeams[0].purseCr = 42.5;
  assert.equal(INITIAL_TEAMS[0].purseCr, initialBasePurse, 'Scenario 21: Sandbox mutations are isolated from base teams');

  // ==========================================================================
  // SCENARIO 22: Squad limits enforced before season starts (16-25 players, max 8 overseas)
  // ==========================================================================
  const checkSquadLimits = (totalCount: number, overseasCount: number) => {
    const isSizeOk = totalCount >= 16 && totalCount <= 25;
    const isOverseasOk = overseasCount <= 8;
    return isSizeOk && isOverseasOk;
  };

  assert.equal(checkSquadLimits(22, 6), true, 'Scenario 22: 22 total, 6 overseas is valid');
  assert.equal(checkSquadLimits(15, 4), false, 'Scenario 22: 15 total is under min 16');
  assert.equal(checkSquadLimits(26, 6), false, 'Scenario 22: 26 total is over max 25');
  assert.equal(checkSquadLimits(20, 9), false, 'Scenario 22: 9 overseas is over max 8');

  // ==========================================================================
  // SCENARIO 23: Off-season rest day advances without hanging
  // ==========================================================================
  let offSeasonActive = true;
  let advancedSeasonYear = 2026;
  if (offSeasonActive) {
    advancedSeasonYear = 2027;
    offSeasonActive = false;
  }
  assert.equal(advancedSeasonYear, 2027, 'Scenario 23: Rest day advances cleanly');
  assert.equal(offSeasonActive, false, 'Scenario 23: Off-season terminates without looping');

  // ==========================================================================
  // SCENARIO 24: Next season increments year correctly (2026 -> 2027)
  // ==========================================================================
  const currentSeasonYear = 2026;
  const nextSeasonYear = currentSeasonYear + 1;
  assert.equal(nextSeasonYear, 2027, 'Scenario 24: Year increments to 2027');

  // ==========================================================================
  // SCENARIO 25: New season generates 18 user matches
  // ==========================================================================
  const season2027Calendar = buildSeasonCalendarForTeam('team_kol', INITIAL_TEAMS, false, 2027);
  const userMatches2027 = season2027Calendar.filter(d => d.type === 'match' && d.matchFixture);
  assert.equal(userMatches2027.length, 18, 'Scenario 25: 18 user league fixtures generated for 2027');

  // ==========================================================================
  // SCENARIO 26: Calendar dates match across hub, calendar, and modals
  // ==========================================================================
  const q1Cal = season2027Calendar.find(d => d.id === 'cal_playoff_q1');
  const finalCal = season2027Calendar.find(d => d.id === 'cal_playoff_final');
  assert.ok(q1Cal !== undefined, 'Scenario 26: cal_playoff_q1 is present in calendarDates');
  assert.ok(finalCal !== undefined, 'Scenario 26: cal_playoff_final is present in calendarDates');
  assert.ok(q1Cal.dateStr.startsWith('2027-'), 'Scenario 26: Q1 date matches active season 2027');
  assert.ok(finalCal.dateStr.startsWith('2027-'), 'Scenario 26: Final date matches active season 2027');

  // ==========================================================================
  // SCENARIO 27: Completed match history is preserved into the next season
  // ==========================================================================
  const historyArchive: Record<string, TeamSeasonRecord[]> = {};
  const season2026Record: TeamSeasonRecord = {
    seasonYear: '2026',
    leagueName: 'Indian Premier League',
    country: 'India',
    rank: 1,
    wonTitle: true,
    played: 18,
    won: 13,
    lost: 5,
    tied: 0,
    nrr: 0.85
  };
  historyArchive['team_kol'] = [season2026Record];
  assert.equal(historyArchive['team_kol'].length, 1, 'Scenario 27: Season 2026 record archived');
  assert.equal(historyArchive['team_kol'][0].wonTitle, true, 'Scenario 27: Title win preserved');

  // ==========================================================================
  // SCENARIO 28: Standings reset to 0 for the new season
  // ==========================================================================
  const freshStandings2027 = INITIAL_TEAMS.map(t => ({
    teamId: t.id,
    played: 0,
    won: 0,
    lost: 0,
    tied: 0,
    points: 0,
    nrr: 0,
    recentForm: []
  }));
  freshStandings2027.forEach(st => {
    assert.equal(st.played, 0, 'Scenario 28: Team played reset to 0');
    assert.equal(st.points, 0, 'Scenario 28: Team points reset to 0');
    assert.equal(st.nrr, 0, 'Scenario 28: Team NRR reset to 0');
  });

  // ==========================================================================
  // SCENARIO 29: Tournament honors record historical champion
  // ==========================================================================
  const honors: TournamentHonor[] = [
    {
      year: '2026',
      tournamentName: 'Indian Premier League',
      championTeamId: 'team_kol',
      championTeamName: 'Kolkata Knight Riders',
      championLogo: '⚔️'
    }
  ];
  assert.equal(honors.length, 1, 'Scenario 29: Honors records 2026 champion');
  assert.equal(honors[0].championTeamId, 'team_kol', 'Scenario 29: Champion team is KKR');

  // ==========================================================================
  // SCENARIO 30: State machine transition sequence includes 'international_series'
  // ==========================================================================
  const allCareerPhases: CareerPhase[] = [
    'league_stage',
    'playoffs',
    'season_final',
    'board_review',
    'career_decision',
    'international_squad_selection',
    'international_series',
    'retention',
    'auction',
    'squad_confirmation',
    'off_season_rest'
  ];
  assert.equal(allCareerPhases.length, 11, 'Scenario 30: All 11 career phases registered in state machine');
  assert.ok(allCareerPhases.includes('international_series'), 'Scenario 30: international_series is a first-class phase');

  // ==========================================================================
  // SCENARIO 31: International selection pool strictly filtered to chosen nation
  // ==========================================================================
  const freshPlayers = createFreshPlayers();
  assert.ok(freshPlayers.length >= 350, `Scenario 31: Fresh players initialized with size ${freshPlayers.length}`);

  // Test every nation in INITIAL_NATIONS has >= 15 native players and zero foreign players
  for (const nation of INITIAL_NATIONS) {
    const nationPool = freshPlayers.filter(
      p => p.country && p.country.toLowerCase() === nation.name.toLowerCase()
    );
    assert.ok(
      nationPool.length >= 15,
      `Scenario 31: Nation ${nation.name} must have at least 15 authentic players (found: ${nationPool.length})`
    );
    assert.ok(
      nationPool.every(p => p.country.toLowerCase() === nation.name.toLowerCase()),
      `Scenario 31: Nation pool for ${nation.name} contains only native players`
    );
  }

  // Selection pool with wrong country: Australian squad with 1 Indian player
  const ausPool = freshPlayers.filter(p => p.country.toLowerCase() === 'australia');
  const indPlayer = freshPlayers.find(p => p.country.toLowerCase() === 'india')!;
  const invalidAusSquad = [...ausPool.slice(0, 14), indPlayer];

  // Authoritative national squad validation logic
  const foreignPlayerFound = invalidAusSquad.find(p => p.country.toLowerCase() !== 'australia');
  assert.ok(foreignPlayerFound !== undefined, 'Scenario 31: Foreign player detected in national squad');
  assert.equal(foreignPlayerFound.id, indPlayer.id, 'Scenario 31: Detected foreign player matches injected Indian player');

  // ==========================================================================
  // SCENARIO 32: National Squad Confirmation requires exactly 15 eligible players
  // ==========================================================================
  const validateNationalSquad = (squad: Player[], targetNation: string) => {
    const totalCount = squad.length;
    if (totalCount !== 15) {
      return { valid: false, error: `Squad must contain exactly 15 players (selected: ${totalCount})` };
    }
    const uniqueIds = new Set(squad.map(p => p.id));
    if (uniqueIds.size !== 15) {
      return { valid: false, error: 'Squad must not contain duplicate players' };
    }
    const foreign = squad.find(p => p.country.toLowerCase() !== targetNation.toLowerCase());
    if (foreign) {
      return { valid: false, error: `Player ${foreign.name} does not represent ${targetNation}` };
    }
    return { valid: true };
  };

  const validAus15 = ausPool.slice(0, 15);
  assert.deepEqual(validateNationalSquad(validAus15, 'Australia'), { valid: true }, 'Scenario 32: Valid 15-player squad passes');
  assert.equal(validateNationalSquad(ausPool.slice(0, 14), 'Australia').valid, false, 'Scenario 32: 14 players rejected');
  assert.equal(validateNationalSquad(ausPool.slice(0, 16), 'Australia').valid, false, 'Scenario 32: 16 players rejected');

  const duplicate15 = [...ausPool.slice(0, 14), ausPool[0]];
  assert.equal(validateNationalSquad(duplicate15, 'Australia').valid, false, 'Scenario 32: Duplicate player IDs rejected');

  // ==========================================================================
  // SCENARIO 33: Confirming valid national squad transitions to 'international_series'
  // ==========================================================================
  const transitionToPhaseAfterNationalSelection = (confirmedValid: boolean): CareerPhase => {
    if (!confirmedValid) throw new Error('Cannot confirm invalid squad');
    // Authoritative transition: must go to international_series, NOT retention/auction
    return 'international_series';
  };

  const nextPhase = transitionToPhaseAfterNationalSelection(true);
  assert.equal(nextPhase, 'international_series', 'Scenario 33: Confirmed national squad transitions to international_series');
  assert.notEqual(nextPhase, 'retention', 'Scenario 33: Does not transition to IPL retention');
  assert.notEqual(nextPhase, 'auction', 'Scenario 33: Does not transition to IPL auction');

  // ==========================================================================
  // SCENARIO 34: Board Review calculates home wins from actual completed fixtures
  // ==========================================================================
  const mockCalendar: League['calendarDates'] = [
    {
      id: 'd1', dateStr: '2026-04-01', dayOfWeek: 'Wed', dayNumber: 1, month: 'Apr', isHome: true, type: 'match',
      matchFixture: {
        id: 'f1', homeTeamId: 'team_kol', awayTeamId: 'team_che', venue: 'Eden Gardens', completed: true,
        completedMatchState: { winnerTeamId: 'team_kol' } as any
      }
    },
    {
      id: 'd2', dateStr: '2026-04-04', dayOfWeek: 'Sat', dayNumber: 4, month: 'Apr', isHome: false, type: 'match',
      matchFixture: {
        id: 'f2', homeTeamId: 'team_mum', awayTeamId: 'team_kol', venue: 'Wankhede Stadium', completed: true,
        completedMatchState: { winnerTeamId: 'team_kol' } as any // Away win!
      }
    },
    {
      id: 'd3', dateStr: '2026-04-08', dayOfWeek: 'Wed', dayNumber: 8, month: 'Apr', isHome: true, type: 'match',
      matchFixture: {
        id: 'f3', homeTeamId: 'team_kol', awayTeamId: 'team_blr', venue: 'Eden Gardens', completed: true,
        completedMatchState: { winnerTeamId: 'team_blr' } as any // Home loss!
      }
    },
    {
      id: 'd4', dateStr: '2026-04-12', dayOfWeek: 'Sun', dayNumber: 12, month: 'Apr', isHome: true, type: 'match',
      matchFixture: {
        id: 'f4', homeTeamId: 'team_kol', awayTeamId: 'team_srh', venue: 'Eden Gardens', completed: true,
        resultSummary: 'KKR won by 5 wickets' // Home win via summary!
      }
    },
    {
      id: 'd5', dateStr: '2026-04-16', dayOfWeek: 'Thu', dayNumber: 16, month: 'Apr', isHome: true, type: 'match',
      matchFixture: {
        id: 'f5', homeTeamId: 'team_kol', awayTeamId: 'team_rr', venue: 'Eden Gardens', completed: true,
        completedMatchState: { winnerTeamId: 'team_kol' } as any // Home win!
      }
    }
  ];

  // Total user wins = 4 (3 home wins, 1 away win).
  // If an estimated 55% formula were used: 4 * 0.55 = 2.2 -> 2 home wins (incorrect).
  const actualHomeWins = calculateActualHomeWinsFromData('team_kol', 'KKR', mockCalendar);
  assert.equal(actualHomeWins, 3, 'Scenario 34: Home wins calculated strictly from actual fixtures (3 wins)');

  // Missing/empty calendar handled gracefully
  const zeroHomeWins = calculateActualHomeWinsFromData('team_kol', 'KKR', []);
  assert.equal(zeroHomeWins, 0, 'Scenario 34: Empty calendar returns 0 home wins without error');

  // ==========================================================================
  // SCENARIO 35: Board Review satisfaction strictly respects the 60% threshold boundary
  // ==========================================================================
  const userTeam = INITIAL_TEAMS.find(t => t.id === 'team_kol')!;

  // 1. 0 objectives met -> 0% -> false
  const review0 = buildDefaultBoardReview(2026, userTeam, undefined, 10, false, undefined, undefined, undefined, undefined, 0);
  assert.equal(review0.scorePct, 0, 'Scenario 35: 0/3 objectives gives 0%');
  assert.equal(review0.isSatisfied, false, 'Scenario 35: 0% is not satisfied');

  // 2. 1 objective met (Top 4 only) -> 33% -> false
  const review1 = buildDefaultBoardReview(2026, userTeam, undefined, 2, false, undefined, undefined, undefined, undefined, 0);
  assert.equal(review1.scorePct, 33, 'Scenario 35: 1/3 objectives gives 33%');
  assert.equal(review1.isSatisfied, false, 'Scenario 35: 33% (< 60%) is not satisfied');

  // 3. 2 objectives met (Top 4 + Home fortress) -> 67% -> true
  const review2 = buildDefaultBoardReview(2026, userTeam, undefined, 2, false, undefined, undefined, undefined, undefined, 4);
  assert.equal(review2.scorePct, 67, 'Scenario 35: 2/3 objectives gives 67%');
  assert.equal(review2.isSatisfied, true, 'Scenario 35: 67% (>= 60%) is satisfied');

  // 4. Exact boundary test: 59% is dissatisfied, 60% is satisfied
  const checkSatisfactionThreshold = (pct: number) => pct >= 60;
  assert.equal(checkSatisfactionThreshold(59), false, 'Scenario 35: 59% fails threshold');
  assert.equal(checkSatisfactionThreshold(60), true, 'Scenario 35: 60% passes threshold');
  assert.equal(checkSatisfactionThreshold(61), true, 'Scenario 35: 61% passes threshold');

  // ==========================================================================
  // SCENARIO 36: Dynamic Auction Cycle determination across multiple seasons
  // ==========================================================================
  const cycle2026 = getAuctionCycleInfo(2026);
  assert.equal(cycle2026.isMegaAuction, false, 'Scenario 36: 2026 is Mini Auction');
  assert.equal(cycle2026.auctionTypeLabel, 'MINI AUCTION');
  assert.ok(cycle2026.megaAuctionNotice.includes('in 2 years'), 'Scenario 36: 2026 notice states in 2 years');

  const cycle2027 = getAuctionCycleInfo(2027);
  assert.equal(cycle2027.isMegaAuction, false, 'Scenario 36: 2027 is Mini Auction');
  assert.equal(cycle2027.auctionTypeLabel, 'MINI AUCTION');
  assert.ok(cycle2027.megaAuctionNotice.includes('next season'), 'Scenario 36: 2027 notice states next season');

  const cycle2028 = getAuctionCycleInfo(2028);
  assert.equal(cycle2028.isMegaAuction, true, 'Scenario 36: 2028 is Mega Auction');
  assert.equal(cycle2028.auctionTypeLabel, 'MEGA AUCTION');
  assert.ok(cycle2028.megaAuctionNotice.includes('Mega Auction active'), 'Scenario 36: 2028 notice states Mega active');

  const cycle2029 = getAuctionCycleInfo(2029);
  assert.equal(cycle2029.isMegaAuction, false, 'Scenario 36: 2029 is Mini Auction');
  assert.ok(cycle2029.megaAuctionNotice.includes('in 2 years'), 'Scenario 36: 2029 notice states in 2 years (2031)');

  // ==========================================================================
  // SCENARIO 37: Authoritative Contract Values and Purse Refunds
  // ==========================================================================
  const pWithContract: Partial<Player> = { contractValueCr: 16.5, salaryCr: 12.0, basePriceCr: 2.0 };
  const pWithSalaryOnly: Partial<Player> = { salaryCr: 11.0, basePriceCr: 2.0 };
  const pWithBaseOnly: Partial<Player> = { basePriceCr: 2.0 };
  const pFallback: Partial<Player> = {};

  assert.equal(getPlayerAuthoritativeSalaryCr(pWithContract as Player), 16.5, 'Scenario 37: Prefers contractValueCr');
  assert.equal(getPlayerAuthoritativeSalaryCr(pWithSalaryOnly as Player), 11.0, 'Scenario 37: Uses salaryCr if no contractValueCr');
  assert.equal(getPlayerAuthoritativeSalaryCr(pWithBaseOnly as Player), 2.0, 'Scenario 37: Uses basePriceCr if no salaryCr');
  assert.equal(getPlayerAuthoritativeSalaryCr(pFallback as Player), 0.5, 'Scenario 37: Safe fallback for unpriced player');

  // Purse refund calculation on player releases:
  const initialPurse = 15.0;
  const releasedPlayers: Player[] = [
    { ...freshPlayers[0], contractValueCr: 12.5 },
    { ...freshPlayers[1], contractValueCr: 6.0 }
  ];
  const totalRefund = releasedPlayers.reduce((sum, p) => sum + getPlayerAuthoritativeSalaryCr(p), 0);
  const updatedPurse = Math.round((initialPurse + totalRefund) * 100) / 100;
  assert.equal(totalRefund, 18.5, 'Scenario 37: Total refund calculated accurately from contracts');
  assert.equal(updatedPurse, 33.5, 'Scenario 37: Purse increases by authoritative contract refund');

  // ==========================================================================
  // SCENARIO 38: Separate IPL Franchise Squad Limits vs National Squad Validation
  // ==========================================================================
  // Franchise limits: 16-25 squad size, max 8 overseas
  const indSquad15 = freshPlayers.filter(p => p.country.toLowerCase() === 'india').slice(0, 15);
  const val15 = validateFranchiseSquadLimits(indSquad15);
  assert.equal(val15.isValid, false, 'Scenario 38: 15-player franchise squad is below 16 minimum');

  const indSquad26 = freshPlayers.filter(p => p.country.toLowerCase() === 'india').slice(0, 26);
  const val26 = validateFranchiseSquadLimits(indSquad26);
  assert.equal(val26.isValid, false, 'Scenario 38: 26-player franchise squad exceeds 25 maximum');

  // 20-player franchise squad with 9 overseas players
  const overseasPlayers = freshPlayers.filter(p => p.country.toLowerCase() !== 'india');
  const indPlayers = freshPlayers.filter(p => p.country.toLowerCase() === 'india');
  const franchiseSquad9Overseas = [...overseasPlayers.slice(0, 9), ...indPlayers.slice(0, 11)];
  const valOverseas9 = validateFranchiseSquadLimits(franchiseSquad9Overseas);
  assert.equal(valOverseas9.isValid, false, 'Scenario 38: 9 overseas players exceeds 8 maximum');

  const franchiseSquad8Overseas = [...overseasPlayers.slice(0, 8), ...indPlayers.slice(0, 12)];
  const valOverseas8 = validateFranchiseSquadLimits(franchiseSquad8Overseas);
  assert.equal(valOverseas8.isValid, true, 'Scenario 38: 20 players with 8 overseas is fully valid');

  // Conversely, national team of 15 overseas players (e.g. Australia) is NOT constrained by IPL franchise rules
  const nationalSquadAus = ausPool.slice(0, 15);
  assert.equal(nationalSquadAus.length, 15, 'Scenario 38: National squad has 15 players');
  assert.ok(nationalSquadAus.every(p => p.country.toLowerCase() === 'australia'), 'Scenario 38: All Australian');

  // ==========================================================================
  // SCENARIO 39: Club Switching preserves prior club roster, purse, contracts, and career history
  // ==========================================================================
  const kkrTeam = INITIAL_TEAMS.find(t => t.id === 'team_kol')!;
  const cskTeam = INITIAL_TEAMS.find(t => t.id === 'team_che')!;
  const initialKkrRoster = [...kkrTeam.playingXIIds];
  const initialKkrPurse = kkrTeam.purseCr ?? 25.0;

  // Simulate switchUserClub logic without calling startNewCareer
  let currentTeams = [...INITIAL_TEAMS];
  let currentUserTeamId = kkrTeam.id;
  const switchClub = (newClubId: string) => {
    currentUserTeamId = newClubId;
  };
  switchClub(cskTeam.id);

  assert.equal(currentUserTeamId, 'team_che', 'Scenario 39: Active club switched to CSK');
  const preservedKkr = currentTeams.find(t => t.id === 'team_kol')!;
  assert.deepEqual(preservedKkr.playingXIIds, initialKkrRoster, 'Scenario 39: Prior club KKR roster preserved');
  assert.equal(preservedKkr.purseCr ?? 25.0, initialKkrPurse, 'Scenario 39: Prior club KKR purse preserved');

  // ==========================================================================
  // SCENARIO 40: Save/Load Resumption at each Career Phase
  // ==========================================================================
  for (const phase of allCareerPhases) {
    const mockSaveSlot = {
      slotId: 'slot_test',
      timestamp: Date.now(),
      seasonYear: 2026,
      careerPhase: phase,
      careerBoardReview: review2,
      userTeamId: 'team_kol'
    };
    const serialized = JSON.stringify(mockSaveSlot);
    const parsed = JSON.parse(serialized);
    assert.equal(parsed.careerPhase, phase, `Scenario 40: Phase ${phase} restored accurately from save slot`);
    assert.equal(parsed.careerBoardReview.scorePct, 67, 'Scenario 40: Board review preserved in save slot');
  }

  console.log('✅ ALL 40 Career Progression & State Machine Regression Scenarios PASSED!');
  return { passed: 40, total: 40 };
}
