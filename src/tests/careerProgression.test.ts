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
import {
  buildSeasonCalendarForTeam,
  VALID_CAREER_PHASES,
  isValidCareerPhase,
  buildInitialSeriesForNation,
  validateAndRecoverCareerState,
  applyCareerJobDecisionState,
  applyConfirmNationalSquadState,
  applyCompleteInternationalSeriesState,
  applyConfirmClubSquadState,
  applyStartNewFranchiseSeasonState,
  applyAdvanceOffSeasonState
} from '../context/GameContext';
import {
  reconcileNationalSelection,
  validateNationalSquadSelection,
  REQUIRED_NATIONAL_SQUAD_SIZE
} from '../components/dynasty/InternationalSquadModal';
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
  console.log('🧪 Starting Career Mode & Progression Regression Tests...');

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
  // SCENARIO 11–14: Board review calculates exact satisfaction percentage from real data
  // ==========================================================================
  const freshPlayers = createFreshPlayers();
  // Create players with real runs/wickets for KKR so top-5 leaderboard objective is met from real player stats
  const playersWithSeasonStats = freshPlayers.map((p, idx) => {
    if (p.clubId === 'team_kol' && idx === 0) {
      return { ...p, stats: { ...p.stats, matches: 14, runs: 640, wickets: 18 } };
    }
    return p;
  });

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
        completedMatchState: { winnerTeamId: 'team_kol' } as any // Away win
      }
    },
    {
      id: 'd3', dateStr: '2026-04-08', dayOfWeek: 'Wed', dayNumber: 8, month: 'Apr', isHome: true, type: 'match',
      matchFixture: {
        id: 'f3', homeTeamId: 'team_kol', awayTeamId: 'team_blr', venue: 'Eden Gardens', completed: true,
        completedMatchState: { winnerTeamId: 'team_blr' } as any // Home loss
      }
    },
    {
      id: 'd4', dateStr: '2026-04-12', dayOfWeek: 'Sun', dayNumber: 12, month: 'Apr', isHome: true, type: 'match',
      matchFixture: {
        id: 'f4', homeTeamId: 'team_kol', awayTeamId: 'team_srh', venue: 'Eden Gardens', completed: true,
        resultSummary: 'KKR won by 5 wickets' // Home win
      }
    },
    {
      id: 'd5', dateStr: '2026-04-16', dayOfWeek: 'Thu', dayNumber: 16, month: 'Apr', isHome: true, type: 'match',
      matchFixture: {
        id: 'f5', homeTeamId: 'team_kol', awayTeamId: 'team_rr', venue: 'Eden Gardens', completed: true,
        completedMatchState: { winnerTeamId: 'team_kol' } as any // Home win
      }
    },
    {
      id: 'd6', dateStr: '2026-04-20', dayOfWeek: 'Mon', dayNumber: 20, month: 'Apr', isHome: true, type: 'match',
      matchFixture: {
        id: 'f6', homeTeamId: 'team_kol', awayTeamId: 'team_del', venue: 'Eden Gardens', completed: true,
        completedMatchState: { winnerTeamId: 'team_kol' } as any // 4th Home win
      }
    }
  ];

  const fullReview = buildDefaultBoardReview(
    2026,
    homeTeam,
    seededStandings[0],
    1,
    true,
    seededStandings,
    mockCalendar,
    playersWithSeasonStats,
    [],
    4,
    'pt20'
  );
  assert.equal(fullReview.fulfilledCount, 3, 'Scenario 11: 3/3 objectives fulfilled for champion with 4 home wins and top-5 batter');
  assert.equal(fullReview.scorePct, 100, 'Scenario 11: Exact satisfaction percentage is 100%');
  assert.equal(fullReview.isSatisfied, true, 'Scenario 11: 100% satisfaction meets threshold');
  assert.equal(fullReview.competitionId, 'pt20', 'Scenario 11: Board review is scoped to competitionId pt20');
  assert.equal(fullReview.teamId, 'team_kol', 'Scenario 11: Board review is scoped to teamId team_kol');

  // Unavailable data test: no standings, no fixtures, no stats -> must NOT fabricate success
  const unavailableReview = buildDefaultBoardReview(
    2026,
    homeTeam,
    undefined,
    undefined,
    undefined,
    [],
    [],
    [],
    [],
    undefined,
    'pt20'
  );
  assert.equal(unavailableReview.fulfilledCount, 0, 'Scenario 11b: Unavailable data never fabricates objective fulfillment');
  assert.equal(unavailableReview.scorePct, 0, 'Scenario 11b: Unavailable data gives 0% satisfaction');
  assert.equal(unavailableReview.isSatisfied, false, 'Scenario 11b: Unavailable data is not satisfied');
  assert.ok(
    unavailableReview.objectives.every(o => o.measuredStr.toLowerCase().includes('unavailable')),
    'Scenario 11b: Unavailable data explicitly reported in measuredStr'
  );

  // ==========================================================================
  // REQ 1–7: AUTHORITATIVE INTERNATIONAL CAREER WORKFLOW TESTS
  // ==========================================================================
  const baseTeams = INITIAL_TEAMS.map(t => ({
    ...t,
    squad: freshPlayers.filter(p => p.clubId === t.id)
  }));
  const baseLeagues: League[] = INITIAL_LEAGUES.map(l => ({
    ...l,
    seasonName: '2026',
    seasonYear: 2026,
    standings: seededStandings,
    playoffs: bracketAfterFinal,
    currentDateIndex: 40,
    calendarDates: buildSeasonCalendarForTeam('team_kol', baseTeams, false, 2026)
  }));
  const baseNations = INITIAL_NATIONS.map(n => ({ ...n, isUserManaging: false }));
  const baseIntlSeries = buildInitialSeriesForNation(baseNations[0], baseNations);

  // REQ 1: Accepting a national-team offer updates the active national team and enters international squad selection
  const ausNation = baseNations.find(n => n.name === 'Australia')!;
  const jobDecisionIntl = applyCareerJobDecisionState(
    {
      coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_kol', nationalTeamId: null },
      teams: baseTeams,
      nations: baseNations,
      players: freshPlayers,
      leagues: baseLeagues,
      currentLeagueId: 'pt20',
      nationalSquadIds: [],
      internationalSeries: baseIntlSeries,
      careerPhase: 'career_decision',
      careerBoardReview: fullReview
    },
    'team_kol',
    ausNation.id
  );
  assert.equal(jobDecisionIntl.coachProfile.nationalTeamId, ausNation.id, 'Int Req 1: Active nationalTeamId updated to Australia');
  assert.equal(jobDecisionIntl.careerPhase, 'international_squad_selection', 'Int Req 1: Enters international_squad_selection phase');
  assert.equal(
    jobDecisionIntl.nations.find(n => n.id === ausNation.id)?.isUserManaging,
    true,
    'Int Req 1: Selected nation marked isUserManaging = true'
  );

  // REQ 2: National player pool contains only players eligible for the selected country
  const ausEligiblePlayers = freshPlayers.filter(p => p.country.toLowerCase() === 'australia');
  const indEligiblePlayers = freshPlayers.filter(p => p.country.toLowerCase() === 'india');
  const ausSelectedIds = reconcileNationalSelection([], ausEligiblePlayers, REQUIRED_NATIONAL_SQUAD_SIZE, true);
  assert.ok(ausEligiblePlayers.length >= 15, 'Int Req 2: Australia has >= 15 eligible players');
  assert.ok(
    ausEligiblePlayers.every(p => p.country.toLowerCase() === 'australia'),
    'Int Req 2: Every eligible player in Australia pool is from Australia'
  );
  assert.equal(ausSelectedIds.length, 15, 'Int Req 2: Default selection picks 15 Australian players');

  // REQ 3: Switching from one country to another removes previously selected players from the old country
  const indSelectedAfterAus = reconcileNationalSelection(
    ausSelectedIds,
    indEligiblePlayers,
    REQUIRED_NATIONAL_SQUAD_SIZE,
    true
  );
  const ausIdsSet = new Set(ausEligiblePlayers.map(p => p.id));
  assert.equal(
    indSelectedAfterAus.some(id => ausIdsSet.has(id)),
    false,
    'Int Req 3: Switching from Australia to India removes all previously selected Australian player IDs'
  );
  assert.equal(indSelectedAfterAus.length, 15, 'Int Req 3: Reconciles to 15 eligible Indian players');

  // Also test partial valid selections preserved when reconciling within the same country
  const fiveIndIds = indEligiblePlayers.slice(5, 10).map(p => p.id);
  const mixedPrevIds = [...ausSelectedIds.slice(0, 5), ...fiveIndIds, fiveIndIds[0]]; // includes foreign + duplicate
  const reconciledPartial = reconcileNationalSelection(mixedPrevIds, indEligiblePlayers, REQUIRED_NATIONAL_SQUAD_SIZE, false);
  assert.deepEqual(
    reconciledPartial,
    fiveIndIds,
    'Int Req 3b: Strips foreign IDs and duplicates while preserving valid selections for the active nation'
  );

  // REQ 4: Confirming fewer than 15, more than 15, duplicate, or foreign players fails validation
  const aus14 = ausSelectedIds.slice(0, 14);
  const aus16 = ausEligiblePlayers.slice(0, 16).map(p => p.id);
  const ausDup15 = [...ausSelectedIds.slice(0, 14), ausSelectedIds[0]];
  const indPlayer = indEligiblePlayers[0];
  const ausForeign15 = [...ausSelectedIds.slice(0, 14), indPlayer.id];

  const confirm14 = applyConfirmNationalSquadState(
    {
      nations: jobDecisionIntl.nations,
      players: freshPlayers,
      coachProfile: jobDecisionIntl.coachProfile,
      nationalSquadIds: jobDecisionIntl.nationalSquadIds,
      internationalSeries: jobDecisionIntl.internationalSeries,
      careerPhase: 'international_squad_selection'
    },
    ausNation.id,
    aus14
  );
  assert.equal(confirm14.success, false, 'Int Req 4a: Confirming 14 players fails');
  assert.equal(confirm14.nextState.careerPhase, 'international_squad_selection', 'Int Req 4a: Phase unchanged on failure');

  const confirm16 = applyConfirmNationalSquadState(
    {
      nations: jobDecisionIntl.nations,
      players: freshPlayers,
      coachProfile: jobDecisionIntl.coachProfile,
      nationalSquadIds: jobDecisionIntl.nationalSquadIds,
      internationalSeries: jobDecisionIntl.internationalSeries,
      careerPhase: 'international_squad_selection'
    },
    ausNation.id,
    aus16
  );
  assert.equal(confirm16.success, false, 'Int Req 4b: Confirming 16 players fails');

  const confirmDup = applyConfirmNationalSquadState(
    {
      nations: jobDecisionIntl.nations,
      players: freshPlayers,
      coachProfile: jobDecisionIntl.coachProfile,
      nationalSquadIds: jobDecisionIntl.nationalSquadIds,
      internationalSeries: jobDecisionIntl.internationalSeries,
      careerPhase: 'international_squad_selection'
    },
    ausNation.id,
    ausDup15
  );
  assert.equal(confirmDup.success, false, 'Int Req 4c: Confirming duplicate player IDs fails');

  const confirmForeign = applyConfirmNationalSquadState(
    {
      nations: jobDecisionIntl.nations,
      players: freshPlayers,
      coachProfile: jobDecisionIntl.coachProfile,
      nationalSquadIds: jobDecisionIntl.nationalSquadIds,
      internationalSeries: jobDecisionIntl.internationalSeries,
      careerPhase: 'international_squad_selection'
    },
    ausNation.id,
    ausForeign15
  );
  assert.equal(confirmForeign.success, false, 'Int Req 4d: Confirming foreign player fails');
  assert.ok(confirmForeign.error?.includes('Foreign players are strictly prohibited'), 'Int Req 4d: Explicit foreign player error');

  // REQ 5: Confirming 15 eligible players persists the squad and enters the international series flow
  const confirmValid15 = applyConfirmNationalSquadState(
    {
      nations: jobDecisionIntl.nations,
      players: freshPlayers,
      coachProfile: jobDecisionIntl.coachProfile,
      nationalSquadIds: jobDecisionIntl.nationalSquadIds,
      internationalSeries: jobDecisionIntl.internationalSeries,
      careerPhase: 'international_squad_selection'
    },
    ausNation.id,
    ausSelectedIds
  );
  assert.equal(confirmValid15.success, true, 'Int Req 5: Confirming 15 eligible players succeeds');
  assert.deepEqual(confirmValid15.nextState.nationalSquadIds, ausSelectedIds, 'Int Req 5: Persists exact 15 player IDs');
  assert.equal(confirmValid15.nextState.careerPhase, 'international_series', 'Int Req 5: Enters international_series phase');

  // REQ 6: Completing or advancing an international series does not enter IPL retention or auction
  const completedSeriesState = {
    ...confirmValid15.nextState.internationalSeries,
    seriesWins: 2,
    seriesLosses: 1,
    matches: confirmValid15.nextState.internationalSeries.matches.map((m, idx) => ({
      ...m,
      completed: true,
      summary: idx < 2 ? 'Australia won by 6 wickets' : 'South Africa won by 12 runs'
    }))
  };
  const afterIntlComplete = applyCompleteInternationalSeriesState({
    nations: confirmValid15.nextState.nations,
    coachProfile: confirmValid15.nextState.coachProfile,
    nationalSquadIds: confirmValid15.nextState.nationalSquadIds,
    internationalSeries: completedSeriesState,
    careerPhase: 'international_series'
  });
  assert.equal(afterIntlComplete.success, true, 'Int Req 6: Completing finished international series succeeds');
  assert.notEqual(afterIntlComplete.careerPhase, 'retention', 'Int Req 6: Completing international series never enters retention');
  assert.notEqual(afterIntlComplete.careerPhase, 'auction', 'Int Req 6: Completing international series never enters auction');
  assert.equal(afterIntlComplete.careerPhase, 'international_series', 'Int Req 6: Proceeds to next international series');
  assert.notEqual(
    afterIntlComplete.internationalSeries.opponentNationId,
    completedSeriesState.opponentNationId,
    'Int Req 6: Schedules next opponent nation tour'
  );
  assert.equal(
    afterIntlComplete.internationalSeries.matches.every(m => !m.completed),
    true,
    'Int Req 6: Next international series matches are fresh'
  );

  // REQ 7: Insufficient eligible national players prevents confirmation with a clear error
  const only10AusPlayers = freshPlayers.filter(p => p.country.toLowerCase() === 'australia').slice(0, 10);
  const modalValidationInsufficient = validateNationalSquadSelection(
    only10AusPlayers.map(p => p.id),
    only10AusPlayers,
    'Australia',
    15
  );
  assert.equal(modalValidationInsufficient.isValid, false, 'Int Req 7: Modal validation rejects when < 15 eligible players exist');
  assert.ok(
    modalValidationInsufficient.error?.includes('Insufficient eligible players'),
    'Int Req 7: Clear error message returned for insufficient eligible players'
  );
  const contextConfirmInsufficient = applyConfirmNationalSquadState(
    {
      nations: jobDecisionIntl.nations,
      players: only10AusPlayers,
      coachProfile: jobDecisionIntl.coachProfile,
      nationalSquadIds: [],
      internationalSeries: jobDecisionIntl.internationalSeries,
      careerPhase: 'international_squad_selection'
    },
    ausNation.id,
    only10AusPlayers.map(p => p.id)
  );
  assert.equal(contextConfirmInsufficient.success, false, 'Int Req 7b: Authoritative handler rejects when < 15 eligible players exist');
  assert.ok(contextConfirmInsufficient.error?.includes('Insufficient eligible players'), 'Int Req 7b: Authoritative error message is clear');

  // ==========================================================================
  // REQ 8–16: AUTHORITATIVE FRANCHISE CAREER WORKFLOW TESTS
  // ==========================================================================
  // REQ 13: Switching franchises preserves the old team's state and does not reuse its board review
  const oldKkrTeam = baseTeams.find(t => t.id === 'team_kol')!;
  const oldKkrSquadIds = oldKkrTeam.squad.map(p => p.id);
  const oldKkrPurse = oldKkrTeam.purseCr;

  const switchedToMumbai = applyCareerJobDecisionState(
    {
      coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_kol', nationalTeamId: null },
      teams: baseTeams,
      nations: baseNations,
      players: freshPlayers,
      leagues: baseLeagues,
      currentLeagueId: 'pt20',
      nationalSquadIds: [],
      internationalSeries: baseIntlSeries,
      careerPhase: 'career_decision',
      careerBoardReview: fullReview // KKR's board review
    },
    'team_mum',
    null
  );
  assert.equal(switchedToMumbai.coachProfile.clubTeamId, 'team_mum', 'Franchise Req 13: Active club updated to MI');
  assert.equal(switchedToMumbai.careerPhase, 'retention', 'Franchise Req 13: Franchise job decision enters retention');
  assert.equal(switchedToMumbai.careerBoardReview, null, 'Franchise Req 13: Previous team KKR board review is NOT reused for MI');
  assert.equal(
    switchedToMumbai.coachProfile.boardReviewsHistory?.[0]?.teamId,
    'team_kol',
    'Franchise Req 13: KKR board review archived in coachProfile.boardReviewsHistory'
  );
  const kkrAfterSwitch = switchedToMumbai.teams.find(t => t.id === 'team_kol')!;
  assert.deepEqual(
    kkrAfterSwitch.squad.map(p => p.id),
    oldKkrSquadIds,
    'Franchise Req 13: Old club KKR squad preserved intact'
  );
  assert.equal(kkrAfterSwitch.purseCr, oldKkrPurse, 'Franchise Req 13: Old club KKR purse preserved intact');

  // REQ 16: Franchise squad confirmation enforces roster size, overseas limits, unique IDs, and club eligibility
  const kkrPlayers = freshPlayers.filter(p => p.clubId === 'team_kol');
  const miPlayer = freshPlayers.find(p => p.clubId === 'team_mum')!;

  // Duplicate IDs rejected
  const dupClubConfirm = applyConfirmClubSquadState(
    { teams: baseTeams, players: freshPlayers, careerPhase: 'squad_confirmation' },
    'team_kol',
    [...kkrPlayers.slice(0, 17).map(p => p.id), kkrPlayers[0].id]
  );
  assert.equal(dupClubConfirm.success, false, 'Franchise Req 16a: Duplicate player IDs rejected by confirmClubSquad');

  // Foreign club player rejected
  const ineligibleClubConfirm = applyConfirmClubSquadState(
    { teams: baseTeams, players: freshPlayers, careerPhase: 'squad_confirmation' },
    'team_kol',
    [...kkrPlayers.slice(0, 17).map(p => p.id), miPlayer.id]
  );
  assert.equal(ineligibleClubConfirm.success, false, 'Franchise Req 16b: Player from another club rejected by confirmClubSquad');

  // Under 16 players rejected
  const tooSmallClubConfirm = applyConfirmClubSquadState(
    { teams: baseTeams, players: freshPlayers, careerPhase: 'squad_confirmation' },
    'team_kol',
    kkrPlayers.slice(0, 15).map(p => p.id)
  );
  assert.equal(tooSmallClubConfirm.success, false, 'Franchise Req 16c: < 16 players rejected by confirmClubSquad');

  // Valid 18-player KKR squad confirmed -> transitions to off_season_rest
  const validKkrSquadIds = kkrPlayers.slice(0, 18).map(p => p.id);
  const validClubConfirm = applyConfirmClubSquadState(
    { teams: baseTeams, players: freshPlayers, careerPhase: 'squad_confirmation' },
    'team_kol',
    validKkrSquadIds
  );
  assert.equal(validClubConfirm.success, true, 'Franchise Req 16d: Valid 18-player squad confirmed');
  assert.equal(validClubConfirm.nextState.careerPhase, 'off_season_rest', 'Franchise Req 16d: Transitions to off_season_rest');

  // ==========================================================================
  // REQ 17–21: SAVE/LOAD VALIDATION & OFF-SEASON CALENDAR ADVANCEMENT TESTS
  // ==========================================================================
  // REQ 17: Valid career phases restore cleanly
  for (const validPhase of VALID_CAREER_PHASES) {
    assert.equal(isValidCareerPhase(validPhase), true, `Save Req 17: ${validPhase} is recognized as valid`);
    const needsNation = validPhase === 'international_squad_selection' || validPhase === 'international_series';
    const needsCompletedFinal = validPhase === 'board_review' || validPhase === 'career_decision';
    const needsPlayoffsInProgress = validPhase === 'playoffs' || validPhase === 'season_final';
    const restored = validateAndRecoverCareerState({
      rawPhase: validPhase,
      coachProfile: {
        ...INITIAL_COACH_PROFILE,
        clubTeamId: 'team_kol',
        nationalTeamId: needsNation ? ausNation.id : null
      },
      teams: baseTeams,
      leagues: baseLeagues.map(l => ({
        ...l,
        standings: validPhase === 'league_stage'
          ? seededStandings.map(s => ({ ...s, played: 6, won: 3, lost: 3, points: 6 }))
          : seededStandings,
        playoffs: needsPlayoffsInProgress
          ? { ...bracketAfterQ2, final: { ...bracketAfterQ2.final, completed: false }, championTeamId: undefined }
          : needsCompletedFinal
          ? bracketAfterFinal
          : createInitialPlayoffs(seededStandings)
      })),
      currentLeagueId: 'pt20',
      nations: baseNations,
      nationalSquadIds: needsNation ? ausSelectedIds : [],
      careerBoardReview: fullReview,
      players: freshPlayers,
      internationalSeries: baseIntlSeries
    });
    assert.equal(restored.careerPhase, validPhase, `Save Req 17: Valid phase ${validPhase} restores cleanly`);
  }

  // REQ 18: Invalid or outdated saved career phases recover safely without wiping the career
  const corruptedPhaseRecovery = validateAndRecoverCareerState({
    rawPhase: 'corrupted_unknown_phase_xyz',
    coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_kol', nationalTeamId: null },
    teams: baseTeams,
    leagues: baseLeagues, // Final is completed and fullReview is present
    currentLeagueId: 'pt20',
    nations: baseNations,
    nationalSquadIds: [],
    careerBoardReview: fullReview,
    players: freshPlayers
  });
  assert.equal(corruptedPhaseRecovery.migrated, true, 'Save Req 18a: Invalid phase triggers safe migration');
  assert.equal(
    corruptedPhaseRecovery.careerPhase,
    'career_decision',
    'Save Req 18a: Completed final + completed review recovers safely to career_decision without resetting career'
  );
  assert.equal(corruptedPhaseRecovery.coachProfile.clubTeamId, 'team_kol', 'Save Req 18a: Active team preserved');

  // Legacy phase string migration ('off_season' -> 'off_season_rest')
  const legacyPhaseRecovery = validateAndRecoverCareerState({
    rawPhase: 'off_season',
    coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_kol', nationalTeamId: null },
    teams: baseTeams,
    leagues: baseLeagues,
    currentLeagueId: 'pt20',
    nations: baseNations,
    nationalSquadIds: [],
    careerBoardReview: null,
    players: freshPlayers
  });
  assert.equal(legacyPhaseRecovery.careerPhase, 'off_season_rest', 'Save Req 18b: Legacy off_season migrates to off_season_rest');

  // Prevent franchise-only save from resuming in an international-only phase
  const crossModeRecovery = validateAndRecoverCareerState({
    rawPhase: 'international_series',
    coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_kol', nationalTeamId: null },
    teams: baseTeams,
    leagues: baseLeagues,
    currentLeagueId: 'pt20',
    nations: baseNations,
    nationalSquadIds: [],
    careerBoardReview: fullReview,
    players: freshPlayers
  });
  assert.equal(crossModeRecovery.careerPhase, 'career_decision', 'Save Req 18c: Franchise-only save cannot resume in international_series');

  // Prevent completed final from re-triggering board_review or season_final on reload
  const completedFinalRecovery = validateAndRecoverCareerState({
    rawPhase: 'season_final',
    coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_kol', nationalTeamId: null },
    teams: baseTeams,
    leagues: baseLeagues, // final.completed = true & fullReview present
    currentLeagueId: 'pt20',
    nations: baseNations,
    nationalSquadIds: [],
    careerBoardReview: fullReview,
    players: freshPlayers
  });
  assert.equal(
    completedFinalRecovery.careerPhase,
    'career_decision',
    'Save Req 18d: Completed final with existing review advances to career_decision instead of repeating board review'
  );

  // REQ 19, 20, 21: Off-season rest advances through remaining non-interactive days, heals players, increments year to 2027, starts at Match 1, and preserves history
  const fatiguedPlayers = freshPlayers.map((p, i) =>
    i === 0 ? { ...p, fitness: 70, isInjured: true, injuryDays: 2 } : p
  );
  const offSeasonResult = applyAdvanceOffSeasonState(
    {
      players: fatiguedPlayers,
      teams: baseTeams,
      leagues: baseLeagues,
      currentLeagueId: 'pt20',
      coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_kol', nationalTeamId: null },
      nations: baseNations,
      tournamentHonors: [],
      careerPhase: 'off_season_rest',
      careerBoardReview: fullReview,
      squadStamina: 72
    },
    2027
  );

  assert.equal(offSeasonResult.careerPhase, 'league_stage', 'Calendar Req 19: Off-season rest advances cleanly to next season league_stage');
  assert.equal(offSeasonResult.intermediatePhase, 'next_season_ready', 'Calendar Req 19: Off-season transitions through next_season_ready');
  assert.ok(offSeasonResult.restDaysProcessed >= 1, 'Calendar Req 19: Off-season rest days processed without hanging');
  assert.equal(offSeasonResult.players[0].isInjured, false, 'Calendar Req 19: Injured player healed during off-season rest');
  assert.ok(offSeasonResult.players[0].fitness >= 95, 'Calendar Req 19: Player fitness restored during off-season');

  const nextLeague2027 = offSeasonResult.leagues.find(l => l.id === 'pt20')!;
  assert.equal(nextLeague2027.seasonYear, 2027, 'Calendar Req 20: Next franchise season increments year to 2027');
  assert.equal(nextLeague2027.seasonName, '2027', 'Calendar Req 20: Next franchise seasonName is 2027');
  assert.equal(nextLeague2027.currentDateIndex, 0, 'Calendar Req 20: New season schedule starts at index 0 (Match 1)');
  assert.equal(
    nextLeague2027.calendarDates.filter(d => d.type === 'match' && d.matchFixture).length,
    18,
    'Calendar Req 20: 18 user league fixtures generated for 2027'
  );
  assert.ok(
    nextLeague2027.standings.every(s => s.played === 0 && s.points === 0),
    'Calendar Req 20: Standings reset to 0 for 2027'
  );

  // REQ 21: Previous season history and honors remain preserved after starting the next season
  assert.equal(
    nextLeague2027.teamSeasonHistory?.['team_kol']?.[0]?.seasonYear,
    '2026',
    'Calendar Req 21: 2026 team season history preserved for KKR'
  );
  assert.equal(
    nextLeague2027.teamSeasonHistory?.['team_kol']?.[0]?.wonTitle,
    true,
    'Calendar Req 21: 2026 title win preserved in teamSeasonHistory'
  );
  assert.equal(
    offSeasonResult.tournamentHonors[0]?.year,
    '2026',
    'Calendar Req 21: 2026 tournament honor archived'
  );
  assert.equal(
    offSeasonResult.tournamentHonors[0]?.championTeamId,
    'team_kol',
    'Calendar Req 21: KKR recorded as 2026 champion in tournamentHonors'
  );

  // Idempotency guard: calling applyStartNewFranchiseSeasonState again for 2027 does not double-age players or reset again
  const ageAfterFirstInit = offSeasonResult.players[0].age;
  const secondInitAttempt = applyStartNewFranchiseSeasonState(
    {
      players: offSeasonResult.players,
      teams: offSeasonResult.teams,
      leagues: offSeasonResult.leagues,
      currentLeagueId: 'pt20',
      coachProfile: offSeasonResult.coachProfile,
      nations: offSeasonResult.nations,
      tournamentHonors: offSeasonResult.tournamentHonors,
      careerPhase: offSeasonResult.careerPhase,
      careerBoardReview: offSeasonResult.careerBoardReview
    },
    'team_kol',
    null,
    2027
  );
  assert.equal(secondInitAttempt.alreadyInitialized, true, 'Idempotency: Duplicate season 2027 initialization is blocked');
  assert.equal(secondInitAttempt.players[0].age, ageAfterFirstInit, 'Idempotency: Players are not aged a second time');

  // ==========================================================================
  // REQ 22: MULTIPLE ACTIVE LEAGUES WITH DIFFERING SEASON YEARS, STANDINGS, PLAYOFFS & BOARD REVIEWS
  // ==========================================================================
  const leagueA_Ipl2026: League = {
    ...baseLeagues[0],
    id: 'pt20',
    name: 'Indian Premier League',
    seasonName: '2026',
    seasonYear: 2026,
    standings: seededStandings, // all 18 played
    playoffs: bracketAfterFinal // final completed!
  };

  const midSeasonStandings = seededStandings.map(s => ({
    ...s,
    played: 7,
    won: 4,
    lost: 3,
    points: 8
  }));
  const leagueB_SmAt2028: League = {
    ...baseLeagues[0],
    id: 'league_smat',
    name: 'Syed Mushtaq Ali Trophy',
    seasonName: '2028',
    seasonYear: 2028,
    standings: midSeasonStandings, // only 7 matches played
    playoffs: createInitialPlayoffs(midSeasonStandings) // playoffs NOT started, final NOT completed
  };

  const leagueC_Playoffs2027: League = {
    ...baseLeagues[0],
    id: 'league_clt20',
    name: 'Champions League T20',
    seasonName: '2027',
    seasonYear: 2027,
    standings: seededStandings, // all 18 played
    playoffs: bracketAfterQ1 // Q1 done, Final NOT completed
  };

  const multiLeagues = [leagueA_Ipl2026, leagueB_SmAt2028, leagueC_Playoffs2027];

  // When currentLeagueId is 'league_smat' (index 1, mid-season 2028), validateAndRecoverCareerState must NOT use leagues[0]!
  const recoveryForLeagueB = validateAndRecoverCareerState({
    rawPhase: 'board_review', // invalid for league_smat because league_smat final is not completed
    coachProfile: {
      ...INITIAL_COACH_PROFILE,
      clubTeamId: 'team_kol',
      nationalTeamId: null
    },
    teams: baseTeams,
    leagues: multiLeagues,
    currentLeagueId: 'league_smat',
    nations: baseNations,
    nationalSquadIds: [],
    careerBoardReview: fullReview, // 2026 pt20 review — must be archived and NOT reused for 2028 league_smat!
    players: freshPlayers
  });

  assert.equal(
    recoveryForLeagueB.careerPhase,
    'league_stage',
    'Multi-League 22a: Recovering league_smat (2028, 7 played, final incomplete) resolves to league_stage instead of using leagues[0]'
  );
  assert.equal(
    recoveryForLeagueB.careerBoardReview,
    null,
    'Multi-League 22b: 2026 pt20 board review is archived and not reused for 2028 league_smat'
  );
  assert.equal(
    recoveryForLeagueB.coachProfile.boardReviewsHistory?.[0]?.competitionId,
    'pt20',
    'Multi-League 22c: Archived 2026 pt20 board review is preserved in boardReviewsHistory'
  );

  // When currentLeagueId is 'league_clt20' (index 2, 2027 playoffs in progress), recovering from an invalid phase infers 'playoffs'
  const recoveryForLeagueC = validateAndRecoverCareerState({
    rawPhase: 'invalid_phase_clt20',
    coachProfile: recoveryForLeagueB.coachProfile,
    teams: baseTeams,
    leagues: multiLeagues,
    currentLeagueId: 'league_clt20',
    nations: baseNations,
    nationalSquadIds: [],
    careerBoardReview: null,
    players: freshPlayers
  });
  assert.equal(
    recoveryForLeagueC.careerPhase,
    'playoffs',
    'Multi-League 22d: Recovering league_clt20 (2027, Q1 completed, final incomplete) resolves to playoffs'
  );

  // Switching back to 'pt20' (index 0, 2026 completed final) restores its archived 2026 pt20 board review and advances to career_decision
  const recoveryBackToLeagueA = validateAndRecoverCareerState({
    rawPhase: 'season_final',
    coachProfile: recoveryForLeagueB.coachProfile,
    teams: baseTeams,
    leagues: multiLeagues,
    currentLeagueId: 'pt20',
    nations: baseNations,
    nationalSquadIds: [],
    careerBoardReview: null,
    players: freshPlayers
  });
  assert.equal(
    recoveryBackToLeagueA.careerPhase,
    'career_decision',
    'Multi-League 22e: Switching back to pt20 (2026 completed final + archived review) resolves to career_decision'
  );
  assert.equal(
    recoveryBackToLeagueA.careerBoardReview?.competitionId,
    'pt20',
    'Multi-League 22f: Switching back to pt20 restores its matching archived board review'
  );

  // ==========================================================================
  // REQ 23: INVALID / MISSING NATIONAL-TEAM DATA & DUPLICATE INTERNATIONAL SERIES COMPLETION
  // ==========================================================================
  // 23a: Missing nationalTeamId must NOT silently fallback to nations[0]
  const missingNationComplete = applyCompleteInternationalSeriesState({
    nations: baseNations,
    coachProfile: { ...INITIAL_COACH_PROFILE, nationalTeamId: null, internationalTitles: 2 },
    nationalSquadIds: ausSelectedIds,
    internationalSeries: completedSeriesState,
    careerPhase: 'international_series'
  });
  assert.equal(missingNationComplete.success, false, 'Intl Edge 23a: Missing nationalTeamId is rejected');
  assert.equal(
    missingNationComplete.coachProfile.internationalTitles,
    2,
    'Intl Edge 23a: Missing nationalTeamId does not increment internationalTitles'
  );
  assert.equal(
    missingNationComplete.internationalSeries.opponentNationId,
    completedSeriesState.opponentNationId,
    'Intl Edge 23a: Missing nationalTeamId does not advance tour opponent or fallback to nations[0]'
  );

  // 23b: Invalid nationalTeamId not present in nations dataset must NOT fallback to nations[0]
  const invalidNationComplete = applyCompleteInternationalSeriesState({
    nations: baseNations,
    coachProfile: { ...INITIAL_COACH_PROFILE, nationalTeamId: 'nation_atlantis_invalid', internationalTitles: 3 },
    nationalSquadIds: ausSelectedIds,
    internationalSeries: completedSeriesState,
    careerPhase: 'international_series'
  });
  assert.equal(invalidNationComplete.success, false, 'Intl Edge 23b: Invalid nationalTeamId is rejected without falling back to nations[0]');
  assert.ok(
    invalidNationComplete.error?.includes('was not found'),
    'Intl Edge 23b: Clear error returned for non-existent nationalTeamId'
  );
  assert.equal(invalidNationComplete.coachProfile.internationalTitles, 3, 'Intl Edge 23b: Titles unchanged');

  // 23c: Invalid nextOpponentId must be rejected safely without partial state change
  const invalidOpponentComplete = applyCompleteInternationalSeriesState(
    {
      nations: confirmValid15.nextState.nations,
      coachProfile: confirmValid15.nextState.coachProfile,
      nationalSquadIds: confirmValid15.nextState.nationalSquadIds,
      internationalSeries: completedSeriesState,
      careerPhase: 'international_series'
    },
    { nextOpponentId: 'nation_non_existent_xyz' }
  );
  assert.equal(invalidOpponentComplete.success, false, 'Intl Edge 23c: Invalid nextOpponentId is rejected');
  assert.equal(
    invalidOpponentComplete.internationalSeries.seriesId,
    completedSeriesState.seriesId,
    'Intl Edge 23c: Series state unchanged on invalid nextOpponentId'
  );

  // 23d: Unfinished series (matches not completed) cannot be completed prematurely
  const unfinishedSeriesComplete = applyCompleteInternationalSeriesState({
    nations: confirmValid15.nextState.nations,
    coachProfile: confirmValid15.nextState.coachProfile,
    nationalSquadIds: confirmValid15.nextState.nationalSquadIds,
    internationalSeries: confirmValid15.nextState.internationalSeries, // 0 completed matches
    careerPhase: 'international_series'
  });
  assert.equal(unfinishedSeriesComplete.success, false, 'Intl Edge 23d: Unfinished international series cannot be completed');

  // 23e: Duplicate international series completion (idempotency guard)
  // Calling applyCompleteInternationalSeriesState a second time with the same completed series must NOT increment titles or advance opponent a second time!
  const titlesAfterFirstComplete = afterIntlComplete.coachProfile.internationalTitles || 0;
  const duplicateSeriesComplete = applyCompleteInternationalSeriesState({
    nations: confirmValid15.nextState.nations,
    coachProfile: afterIntlComplete.coachProfile, // contains completedInternationalSeriesIds from 1st completion
    nationalSquadIds: confirmValid15.nextState.nationalSquadIds,
    internationalSeries: completedSeriesState, // same completed series re-submitted
    careerPhase: 'international_series'
  });
  assert.equal(duplicateSeriesComplete.success, false, 'Intl Edge 23e: Duplicate completion of the same series is rejected');
  assert.equal(duplicateSeriesComplete.alreadyCompleted, true, 'Intl Edge 23e: Marked alreadyCompleted = true');
  assert.equal(
    duplicateSeriesComplete.coachProfile.internationalTitles,
    titlesAfterFirstComplete,
    'Intl Edge 23e: Duplicate series completion does not increment internationalTitles a second time'
  );

  // ==========================================================================
  // REQ 24: REPEATED SEASON ADVANCEMENT & CROSS-MODE ISOLATION GUARDS
  // ==========================================================================
  // 24a: Calling applyStartNewFranchiseSeasonState WITHOUT explicit nextYear a second time after season reset is blocked
  const repeatedWithoutNextYear = applyStartNewFranchiseSeasonState(
    {
      players: offSeasonResult.players,
      teams: offSeasonResult.teams,
      leagues: offSeasonResult.leagues, // already at 2027 with 0 matches played and archived 2026 history
      currentLeagueId: 'pt20',
      coachProfile: offSeasonResult.coachProfile,
      nations: offSeasonResult.nations,
      tournamentHonors: offSeasonResult.tournamentHonors,
      careerPhase: offSeasonResult.careerPhase, // 'league_stage'
      careerBoardReview: null
    },
    'team_kol',
    null
    // nextYear intentionally omitted
  );
  assert.equal(
    repeatedWithoutNextYear.alreadyInitialized,
    true,
    'Season Edge 24a: Repeated applyStartNewFranchiseSeasonState without explicit nextYear is blocked'
  );
  assert.equal(
    repeatedWithoutNextYear.leagues.find(l => l.id === 'pt20')?.seasonYear,
    2027,
    'Season Edge 24a: Season year stays 2027 and does not jump to 2028'
  );
  assert.equal(
    repeatedWithoutNextYear.players[0].age,
    ageAfterFirstInit,
    'Season Edge 24a: Players are not aged again'
  );

  // 24b: Calling applyAdvanceOffSeasonState again after it already transitioned to league_stage is a no-op
  const repeatedOffSeasonAdvance = applyAdvanceOffSeasonState({
    players: offSeasonResult.players,
    teams: offSeasonResult.teams,
    leagues: offSeasonResult.leagues,
    currentLeagueId: 'pt20',
    coachProfile: offSeasonResult.coachProfile,
    nations: offSeasonResult.nations,
    tournamentHonors: offSeasonResult.tournamentHonors,
    careerPhase: offSeasonResult.careerPhase, // 'league_stage'
    careerBoardReview: null,
    squadStamina: offSeasonResult.squadStamina
  });
  assert.equal(
    repeatedOffSeasonAdvance.restDaysProcessed,
    0,
    'Season Edge 24b: Repeated applyAdvanceOffSeasonState in league_stage processes 0 days and does not re-advance season'
  );
  assert.equal(
    repeatedOffSeasonAdvance.leagues.find(l => l.id === 'pt20')?.seasonYear,
    2027,
    'Season Edge 24b: Season year remains 2027'
  );

  // 24c: Franchise functions are strictly blocked during international career phases
  const franchiseInitDuringIntl = applyStartNewFranchiseSeasonState(
    {
      players: freshPlayers,
      teams: baseTeams,
      leagues: baseLeagues,
      currentLeagueId: 'pt20',
      coachProfile: confirmValid15.nextState.coachProfile,
      nations: confirmValid15.nextState.nations,
      tournamentHonors: [],
      careerPhase: 'international_series',
      careerBoardReview: null
    },
    'team_kol',
    ausNation.id,
    2027
  );
  assert.equal(
    franchiseInitDuringIntl.alreadyInitialized,
    true,
    'Season Edge 24c: applyStartNewFranchiseSeasonState is blocked during international_series'
  );
  assert.equal(
    franchiseInitDuringIntl.careerPhase,
    'international_series',
    'Season Edge 24c: Career phase remains international_series'
  );

  const clubConfirmDuringIntl = applyConfirmClubSquadState(
    {
      teams: baseTeams,
      players: freshPlayers,
      careerPhase: 'international_series'
    },
    'team_kol',
    validKkrSquadIds
  );
  assert.equal(
    clubConfirmDuringIntl.success,
    false,
    'Season Edge 24d: applyConfirmClubSquadState is rejected during international_series'
  );
  assert.equal(
    clubConfirmDuringIntl.nextState.careerPhase,
    'international_series',
    'Season Edge 24d: Career phase unchanged when applyConfirmClubSquadState is rejected'
  );

  console.log('✅ ALL Career Progression, Multi-League Recovery, International Idempotency & Season Advancement Regression Scenarios PASSED!');
  return { passed: 72, total: 72 };
}


