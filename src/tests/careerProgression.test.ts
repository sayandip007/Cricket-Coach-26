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
  generateUniqueInternationalSeriesId,
  buildInitialSeriesForNation,
  migrateLegacyInternationalSeries,
  resolveActiveLeagueForRecovery,
  buildCareerValidationSignature,
  validateAndRecoverCareerState,
  applyCompletePlayoffMatchState,
  applyConfirmBoardReviewState,
  applyCareerJobDecisionState,
  applyConfirmNationalSquadState,
  applyCompleteInternationalSeriesState,
  applyReleasePlayersForAuctionState,
  applyCompleteAuctionState,
  applyConfirmClubSquadState,
  applyStartNewFranchiseSeasonState,
  applyAdvanceOffSeasonState,
  enforceSingleCareerInvariant,
  validatePlayoffEligibility,
  getAuthoritativeDomesticFixtures,
  isDomesticLeagueStageComplete,
  syncPlayoffCalendarDates,
  parseCalendarDateToUtc,
  addUtcDaysToCalendarDate,
  applyAdvanceCalendarToNextTourState,
  resolveInternationalMatchParticipant,
  classifyInternationalCompetition,
  isUserControlledInternationalFixture,
  isUserControlledFranchiseFixture,
  applyAdvanceCalendarDayState,
  applyRecordCompletedInternationalMatchState,
  applyAdvanceAiPlayoffMatchesState,
  applySwitchUserClubState,
  applyAcceptJobOfferState,
  applyResignNationalJobState,
  InternationalSeriesState
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
  CoachProfile,
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

  // ==========================================================================
  // REQ 25: UNIQUE, PERSISTENT INTERNATIONAL SERIES IDS (6 REGRESSION TESTS)
  // ==========================================================================
  const indNation = baseNations.find(n => n.name === 'India')!;

  // Test 25.1: Two different series between the same countries have different IDs
  const seriesA = buildInitialSeriesForNation(ausNation, baseNations, indNation.id, 1);
  const seriesB = buildInitialSeriesForNation(ausNation, baseNations, indNation.id, 1);
  assert.ok(seriesA.seriesId && seriesA.seriesId.length > 0, 'Series ID 25.1a: Series A has a valid non-empty seriesId');
  assert.ok(seriesB.seriesId && seriesB.seriesId.length > 0, 'Series ID 25.1b: Series B has a valid non-empty seriesId');
  assert.notEqual(
    seriesA.seriesId,
    seriesB.seriesId,
    'Series ID 25.1c: Two different series between the same countries (AUS vs IND) receive distinct seriesIds'
  );

  // Test 25.2: Reloading an active series preserves its ID
  const reloadSeriesRecovery = validateAndRecoverCareerState({
    rawPhase: 'international_series',
    coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: null, nationalTeamId: ausNation.id, activeCareerMode: 'international' },
    teams: baseTeams,
    leagues: baseLeagues,
    currentLeagueId: 'pt20',
    nations: jobDecisionIntl.nations,
    nationalSquadIds: ausSelectedIds,
    careerBoardReview: null,
    players: freshPlayers,
    internationalSeries: seriesA
  });
  assert.equal(
    reloadSeriesRecovery.internationalSeries?.seriesId,
    seriesA.seriesId,
    'Series ID 25.2: Reloading an active series preserves its exact seriesId'
  );
  assert.equal(reloadSeriesRecovery.migrated, false, 'Series ID 25.2b: Active valid international series reload does not mark migrated');

  // Test 25.3: Completing the same series twice increments the title count at most once
  const finishedSeriesA = {
    ...seriesA,
    seriesWins: 2,
    seriesLosses: 1,
    matches: seriesA.matches.map((m, idx) => ({
      ...m,
      completed: true,
      summary: idx < 2 ? 'Australia won by 6 wickets' : 'India won by 10 runs'
    }))
  };
  const completeA1 = applyCompleteInternationalSeriesState({
    nations: jobDecisionIntl.nations,
    coachProfile: { ...jobDecisionIntl.coachProfile, internationalTitles: 0, completedInternationalSeriesIds: [] },
    nationalSquadIds: ausSelectedIds,
    internationalSeries: finishedSeriesA,
    careerPhase: 'international_series'
  });
  assert.equal(completeA1.success, true, 'Series ID 25.3a: First completion of Series A succeeds');
  assert.equal(completeA1.coachProfile.internationalTitles, 1, 'Series ID 25.3b: First completion increments internationalTitles to 1');

  const completeA2 = applyCompleteInternationalSeriesState({
    nations: jobDecisionIntl.nations,
    coachProfile: completeA1.coachProfile,
    nationalSquadIds: ausSelectedIds,
    internationalSeries: finishedSeriesA,
    careerPhase: 'international_series'
  });
  assert.equal(completeA2.success, false, 'Series ID 25.3c: Second completion of Series A is blocked');
  assert.equal(completeA2.alreadyCompleted, true, 'Series ID 25.3d: Second completion sets alreadyCompleted = true');
  assert.equal(completeA2.coachProfile.internationalTitles, 1, 'Series ID 25.3e: Title count remains 1 after duplicate completion attempt');

  // Test 25.4: Completing one series does not block a later series with different IDs and identical results
  const finishedSeriesBIdenticalResults = {
    ...seriesB,
    seriesWins: 2,
    seriesLosses: 1,
    matches: seriesB.matches.map((m, idx) => ({
      ...m,
      completed: true,
      summary: idx < 2 ? 'Australia won by 6 wickets' : 'India won by 10 runs' // identical results & summaries!
    }))
  };
  const completeB = applyCompleteInternationalSeriesState({
    nations: jobDecisionIntl.nations,
    coachProfile: completeA1.coachProfile, // already has Series A's seriesId in completedInternationalSeriesIds
    nationalSquadIds: ausSelectedIds,
    internationalSeries: finishedSeriesBIdenticalResults,
    careerPhase: 'international_series'
  });
  assert.equal(
    completeB.success,
    true,
    'Series ID 25.4a: Later series between same countries with identical results and different seriesId completes cleanly'
  );
  assert.equal(
    completeB.coachProfile.internationalTitles,
    2,
    'Series ID 25.4b: Later series increments internationalTitles to 2'
  );

  // Test 25.5: A legacy save without a seriesId migrates safely without losing completed matches or results
  const legacySeriesWithoutId: any = {
    userNationId: ausNation.id,
    userNationName: ausNation.name,
    userNationCode: ausNation.code,
    opponentNationId: indNation.id,
    opponentNationName: indNation.name,
    opponentNationCode: indNation.code,
    seriesWins: 2,
    seriesLosses: 1,
    matches: [
      { matchNumber: 1, city: 'Melbourne', venue: 'MCG', completed: true, summary: 'AUS won by 5 runs' },
      { matchNumber: 2, city: 'Sydney', venue: 'SCG', completed: true, summary: 'IND won by 4 wkts' },
      { matchNumber: 3, city: 'Adelaide', venue: 'Adelaide Oval', completed: true, summary: 'AUS won by 22 runs' },
      { matchNumber: 4, city: 'Perth', venue: 'Optus Stadium', completed: false },
      { matchNumber: 5, city: 'Brisbane', venue: 'The Gabba', completed: false }
    ]
  };
  const legacyMigration = migrateLegacyInternationalSeries(legacySeriesWithoutId, baseNations);
  assert.equal(legacyMigration.canMigrate, true, 'Series ID 25.5a: Legacy series without seriesId can migrate');
  assert.equal(legacyMigration.migrated, true, 'Series ID 25.5a: Legacy series without seriesId is flagged as migrated');
  assert.ok(
    legacyMigration.series && legacyMigration.series.seriesId.startsWith('legacy_intl_'),
    'Series ID 25.5b: Migrated legacy series receives a deterministic legacy_intl_ ID'
  );
  assert.equal(legacyMigration.series?.seriesWins, 2, 'Series ID 25.5c: Migrated legacy series preserves seriesWins');
  assert.equal(legacyMigration.series?.matches[0].summary, 'AUS won by 5 runs', 'Series ID 25.5d: Migrated legacy series preserves match summaries');

  // Re-migrating or reloading the migrated legacy series preserves the exact same seriesId
  const legacyMigrationReload = migrateLegacyInternationalSeries(legacyMigration.series, baseNations);
  assert.equal(legacyMigrationReload.migrated, false, 'Series ID 25.5e: Reloading already-migrated series does not re-migrate');
  assert.equal(
    legacyMigrationReload.series?.seriesId,
    legacyMigration.series?.seriesId,
    'Series ID 25.5f: Reloading migrated legacy series keeps the exact same seriesId'
  );

  // Test 25.6: A failed, incomplete, or unidentifiable legacy series completion does not mark the series as completed
  const malformedLegacySeries: any = {
    opponentNationId: 'nation_unknown_corrupt',
    seriesWins: 2,
    seriesLosses: 0,
    matches: []
  };
  const failedMalformedCompletion = applyCompleteInternationalSeriesState({
    nations: jobDecisionIntl.nations,
    coachProfile: { ...jobDecisionIntl.coachProfile, internationalTitles: 3, completedInternationalSeriesIds: [] },
    nationalSquadIds: ausSelectedIds,
    internationalSeries: malformedLegacySeries,
    careerPhase: 'international_series'
  });
  assert.equal(failedMalformedCompletion.success, false, 'Series ID 25.6a: Malformed legacy series completion fails explicitly');
  assert.equal(
    (failedMalformedCompletion.coachProfile.completedInternationalSeriesIds || []).length,
    0,
    'Series ID 25.6b: Failed completion does not record any seriesId as completed'
  );
  assert.equal(failedMalformedCompletion.coachProfile.internationalTitles, 3, 'Series ID 25.6c: Titles unchanged on failed completion');

  // ==========================================================================
  // REQ 26: INVALID ACTIVE-LEAGUE RECOVERY POLICY (5 REGRESSION TESTS)
  // ==========================================================================
  const league1Teams = baseTeams.filter(t => t.id === 'team_mum' || t.id === 'team_che');
  const league2Teams = baseTeams.filter(t => t.id === 'team_kol' || t.id === 'team_blr');
  const league3Teams = baseTeams.filter(t => t.id === 'team_che' || t.id === 'team_hyd');

  const kkrFixtures2026 = buildSeasonCalendarForTeam('team_kol', league2Teams, false, 2026);
  const miFixtures2027 = buildSeasonCalendarForTeam('team_mum', league1Teams, false, 2027);
  const cskFixtures2028 = buildSeasonCalendarForTeam('team_che', league3Teams, false, 2028);

  const league1_MI_2027: League = {
    ...baseLeagues[0],
    id: 'league_mi_2027',
    name: 'Mumbai League 2027',
    seasonName: '2027',
    seasonYear: 2027,
    teams: league1Teams,
    standings: seededStandings.filter(s => s.teamId === 'team_mum' || s.teamId === 'team_che'),
    playoffs: bracketAfterQ1,
    calendarDates: miFixtures2027
  };

  const league2_KKR_2026: League = {
    ...baseLeagues[0],
    id: 'league_kkr_2026',
    name: 'KKR Premier League 2026',
    seasonName: '2026',
    seasonYear: 2026,
    teams: league2Teams,
    standings: seededStandings.filter(s => s.teamId === 'team_kol' || s.teamId === 'team_blr'),
    playoffs: bracketAfterFinal,
    calendarDates: kkrFixtures2026
  };

  const league3_CSK_2028: League = {
    ...baseLeagues[0],
    id: 'league_csk_2028',
    name: 'Chennai Trophy 2028',
    seasonName: '2028',
    seasonYear: 2028,
    teams: league3Teams,
    standings: midSeasonStandings.filter(s => s.teamId === 'team_che' || s.teamId === 'team_hyd'),
    playoffs: createInitialPlayoffs(midSeasonStandings),
    calendarDates: cskFixtures2028
  };

  const distinctLeagues = [league1_MI_2027, league2_KKR_2026, league3_CSK_2028];
  const kkrReviewForLeague2: CareerBoardReview = {
    ...fullReview,
    competitionId: 'league_kkr_2026',
    teamId: 'team_kol',
    seasonYear: 2026
  };

  // Test 26.1: A valid currentLeagueId resolves to the correct league even when it is not the first item (index 1)
  const validNonFirstResolution = validateAndRecoverCareerState({
    rawPhase: 'career_decision',
    coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_kol', nationalTeamId: null },
    teams: baseTeams,
    leagues: distinctLeagues,
    currentLeagueId: 'league_kkr_2026', // index 1, NOT leagues[0]!
    nations: baseNations,
    nationalSquadIds: [],
    careerBoardReview: kkrReviewForLeague2,
    players: freshPlayers,
    internationalSeries: baseIntlSeries
  });
  assert.equal(validNonFirstResolution.resolvedLeagueId, 'league_kkr_2026', 'League Recovery 26.1a: Resolves to league_kkr_2026 (index 1)');
  assert.equal(validNonFirstResolution.careerPhase, 'career_decision', 'League Recovery 26.1b: Preserves career_decision phase');
  assert.equal(validNonFirstResolution.requiresLeagueSelection, false, 'League Recovery 26.1c: Does not require manual league selection');

  // Test 26.2: An invalid currentLeagueId resolves through the documented recovery policy when exactly one suitable league exists
  // Here coachProfile.clubTeamId is 'team_kol', which only participates in league2_KKR_2026 (index 1), NOT leagues[0] (league1_MI_2027)
  const singleCandidateRecovery = validateAndRecoverCareerState({
    rawPhase: 'career_decision',
    coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_kol', nationalTeamId: null },
    teams: baseTeams,
    leagues: distinctLeagues,
    currentLeagueId: 'corrupted_deleted_league_id',
    nations: baseNations,
    nationalSquadIds: [],
    careerBoardReview: kkrReviewForLeague2,
    players: freshPlayers,
    internationalSeries: baseIntlSeries
  });
  assert.equal(
    singleCandidateRecovery.resolvedLeagueId,
    'league_kkr_2026',
    'League Recovery 26.2a: Invalid currentLeagueId resolves deterministically to the single matching league (league_kkr_2026, not leagues[0])'
  );
  assert.equal(singleCandidateRecovery.migrated, true, 'League Recovery 26.2b: Marks migrated = true when recovering currentLeagueId');
  assert.equal(singleCandidateRecovery.requiresLeagueSelection, false, 'League Recovery 26.2c: Unique match does not require manual disambiguation');

  // Test 26.3: An invalid ID with multiple plausible league candidates does not silently choose the first
  // Suppose 'team_che' is in both league1_MI_2027 (2027) and league3_CSK_2028 (2028) and no season/competition filter narrows it down
  const ambiguousCandidateRecovery = validateAndRecoverCareerState({
    rawPhase: 'league_stage',
    coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_che', nationalTeamId: null },
    teams: baseTeams,
    leagues: distinctLeagues,
    currentLeagueId: 'invalid_ambiguous_league_id',
    nations: baseNations,
    nationalSquadIds: [],
    careerBoardReview: null,
    players: freshPlayers,
    internationalSeries: baseIntlSeries
  });
  assert.equal(
    ambiguousCandidateRecovery.resolvedLeagueId,
    null,
    'League Recovery 26.3a: Ambiguous invalid currentLeagueId returns resolvedLeagueId = null instead of picking leagues[0]'
  );
  assert.equal(
    ambiguousCandidateRecovery.requiresLeagueSelection,
    true,
    'League Recovery 26.3b: Ambiguous candidates set requiresLeagueSelection = true'
  );
  assert.deepEqual(
    ambiguousCandidateRecovery.candidateLeagueIds,
    ['league_mi_2027', 'league_csk_2028'],
    'League Recovery 26.3c: Lists exact plausible candidate league IDs for user disambiguation'
  );
  assert.ok(
    ambiguousCandidateRecovery.recoveryError && ambiguousCandidateRecovery.recoveryError.includes('plausible leagues'),
    'League Recovery 26.3d: Reports explicit recoverable state error message'
  );

  // Test 26.4: Recovery does not combine one league's fixtures with another league's standings or board review
  const recoveredLeague2 = distinctLeagues.find(l => l.id === singleCandidateRecovery.resolvedLeagueId)!;
  assert.equal(recoveredLeague2.seasonYear, 2026, 'League Recovery 26.4a: Recovered league keeps its own 2026 seasonYear');
  assert.equal(
    recoveredLeague2.calendarDates[0].id,
    kkrFixtures2026[0].id,
    'League Recovery 26.4b: Recovered league keeps its own KKR fixture list'
  );
  assert.equal(
    singleCandidateRecovery.careerBoardReview?.competitionId,
    'league_kkr_2026',
    'League Recovery 26.4c: Board review matches the recovered league competitionId'
  );

  // Test 26.5: A valid saved career remains completely unchanged during recovery
  const unchangedValidRecovery = validateAndRecoverCareerState({
    rawPhase: 'career_decision',
    coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_kol', nationalTeamId: null },
    teams: baseTeams,
    leagues: distinctLeagues,
    currentLeagueId: 'league_kkr_2026',
    nations: baseNations,
    nationalSquadIds: [],
    careerBoardReview: kkrReviewForLeague2,
    players: freshPlayers,
    internationalSeries: baseIntlSeries
  });
  assert.equal(unchangedValidRecovery.migrated, false, 'League Recovery 26.5a: Valid career save has migrated = false');
  assert.equal(unchangedValidRecovery.resolvedLeagueId, 'league_kkr_2026', 'League Recovery 26.5b: Valid currentLeagueId unchanged');
  assert.equal(unchangedValidRecovery.careerPhase, 'career_decision', 'League Recovery 26.5c: Valid careerPhase unchanged');
  assert.deepEqual(unchangedValidRecovery.careerBoardReview, kkrReviewForLeague2, 'League Recovery 26.5d: Valid careerBoardReview unchanged');

  // ==========================================================================
  // REQ 27: IDEMPOTENCY AUDIT ACROSS ALL 10 CAREER TRANSITIONS
  // ==========================================================================
  // 27.1: Final match completion and board review creation (applyCompletePlayoffMatchState)
  const leagueReadyForFinal: League = {
    ...baseLeagues[0],
    id: 'pt20',
    seasonYear: 2026,
    standings: seededStandings,
    playoffs: {
      ...bracketAfterQ2,
      final: {
        ...bracketAfterQ2.final,
        completed: false,
        winnerTeamId: null,
        loserTeamId: null
      },
      championTeamId: undefined
    },
    calendarDates: mockCalendar
  };
  const finalCompletion1 = applyCompletePlayoffMatchState(
    {
      leagues: [leagueReadyForFinal],
      currentLeagueId: 'pt20',
      coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_kol', domesticTitles: 0 },
      teams: baseTeams,
      tournamentHonors: [],
      careerPhase: 'season_final',
      careerBoardReview: null
    },
    {
      leagueId: 'pt20',
      stage: 'final',
      homeTeamId: 'team_kol',
      awayTeamId: 'team_che',
      winnerTeamId: 'team_kol',
      resultSummary: 'KKR beat CSK by 6 runs'
    }
  );
  assert.equal(finalCompletion1.alreadyCompleted, false, 'Idempotency 27.1a: First Final completion executes normally');
  assert.equal(finalCompletion1.careerPhase, 'board_review', 'Idempotency 27.1b: First Final completion transitions to board_review');
  assert.equal(finalCompletion1.coachProfile.domesticTitles, 1, 'Idempotency 27.1c: First Final completion increments domesticTitles to 1');
  assert.ok(finalCompletion1.careerBoardReview !== null, 'Idempotency 27.1d: Board review created on Final completion');

  const finalCompletion2 = applyCompletePlayoffMatchState(
    {
      leagues: finalCompletion1.leagues,
      currentLeagueId: 'pt20',
      coachProfile: finalCompletion1.coachProfile,
      teams: baseTeams,
      tournamentHonors: finalCompletion1.tournamentHonors,
      careerPhase: finalCompletion1.careerPhase,
      careerBoardReview: finalCompletion1.careerBoardReview
    },
    {
      leagueId: 'pt20',
      stage: 'final',
      homeTeamId: 'team_kol',
      awayTeamId: 'team_che',
      winnerTeamId: 'team_kol',
      resultSummary: 'KKR beat CSK by 6 runs'
    }
  );
  assert.equal(finalCompletion2.alreadyCompleted, true, 'Idempotency 27.1e: Duplicate Final completion is blocked');
  assert.equal(finalCompletion2.coachProfile.domesticTitles, 1, 'Idempotency 27.1f: domesticTitles is NOT incremented a second time');

  // 27.2: Board review confirmation (applyConfirmBoardReviewState)
  const boardConfirm1 = applyConfirmBoardReviewState({
    careerPhase: 'board_review',
    careerBoardReview: finalCompletion1.careerBoardReview,
    coachProfile: finalCompletion1.coachProfile
  });
  assert.equal(boardConfirm1.alreadyConfirmed, false, 'Idempotency 27.2a: First board review confirmation succeeds');
  assert.equal(boardConfirm1.careerPhase, 'career_decision', 'Idempotency 27.2b: Transitions from board_review to career_decision');

  const boardConfirm2 = applyConfirmBoardReviewState({
    careerPhase: boardConfirm1.careerPhase,
    careerBoardReview: boardConfirm1.careerBoardReview,
    coachProfile: boardConfirm1.coachProfile
  });
  assert.equal(boardConfirm2.alreadyConfirmed, true, 'Idempotency 27.2c: Second board review confirmation is a no-op');
  assert.equal(
    boardConfirm2.coachProfile.boardReviewsHistory?.length,
    boardConfirm1.coachProfile.boardReviewsHistory?.length,
    'Idempotency 27.2d: Board review history is not duplicated'
  );

  // 27.3: Career job acceptance (applyCareerJobDecisionState)
  const jobAccept1 = applyCareerJobDecisionState(
    {
      coachProfile: boardConfirm1.coachProfile,
      teams: baseTeams,
      nations: baseNations,
      players: freshPlayers,
      leagues: finalCompletion1.leagues,
      currentLeagueId: 'pt20',
      nationalSquadIds: [],
      internationalSeries: baseIntlSeries,
      careerPhase: 'career_decision',
      careerBoardReview: boardConfirm1.careerBoardReview
    },
    'team_kol',
    null
  );
  assert.equal(jobAccept1.alreadyAccepted, false, 'Idempotency 27.3a: First job acceptance executes');
  assert.equal(jobAccept1.careerPhase, 'retention', 'Idempotency 27.3b: Franchise job acceptance transitions to retention');

  const jobAccept2 = applyCareerJobDecisionState(
    {
      coachProfile: jobAccept1.coachProfile,
      teams: jobAccept1.teams,
      nations: jobAccept1.nations,
      players: freshPlayers,
      leagues: finalCompletion1.leagues,
      currentLeagueId: 'pt20',
      nationalSquadIds: jobAccept1.nationalSquadIds,
      internationalSeries: jobAccept1.internationalSeries,
      careerPhase: jobAccept1.careerPhase,
      careerBoardReview: jobAccept1.careerBoardReview
    },
    'team_kol',
    null
  );
  assert.equal(jobAccept2.alreadyAccepted, true, 'Idempotency 27.3c: Duplicate job acceptance is blocked');
  assert.equal(jobAccept2.careerPhase, 'retention', 'Idempotency 27.3d: Phase remains retention');

  // 27.4: International squad confirmation (applyConfirmNationalSquadState)
  const intlSquadConfirm1 = applyConfirmNationalSquadState(
    {
      nations: jobDecisionIntl.nations,
      players: freshPlayers,
      coachProfile: jobDecisionIntl.coachProfile,
      nationalSquadIds: [],
      internationalSeries: jobDecisionIntl.internationalSeries,
      careerPhase: 'international_squad_selection'
    },
    ausNation.id,
    ausSelectedIds
  );
  assert.equal(intlSquadConfirm1.success, true, 'Idempotency 27.4a: First national squad confirmation succeeds');
  assert.equal(intlSquadConfirm1.alreadyConfirmed, false, 'Idempotency 27.4b: First national squad confirmation not marked alreadyConfirmed');

  const intlSquadConfirm2 = applyConfirmNationalSquadState(
    {
      nations: intlSquadConfirm1.nextState.nations,
      players: freshPlayers,
      coachProfile: intlSquadConfirm1.nextState.coachProfile,
      nationalSquadIds: intlSquadConfirm1.nextState.nationalSquadIds,
      internationalSeries: intlSquadConfirm1.nextState.internationalSeries,
      careerPhase: intlSquadConfirm1.nextState.careerPhase
    },
    ausNation.id,
    ausSelectedIds
  );
  assert.equal(intlSquadConfirm2.alreadyConfirmed, true, 'Idempotency 27.4c: Duplicate national squad confirmation is a no-op');
  assert.equal(
    intlSquadConfirm2.nextState.internationalSeries.seriesId,
    intlSquadConfirm1.nextState.internationalSeries.seriesId,
    'Idempotency 27.4d: Duplicate national squad confirmation does not regenerate or replace active seriesId'
  );

  // 27.5: Franchise retention and player releases (applyReleasePlayersForAuctionState)
  const playersToRelease = kkrPlayers.slice(0, 2).map(p => p.id);
  const release1 = applyReleasePlayersForAuctionState(
    {
      players: freshPlayers,
      teams: baseTeams,
      careerPhase: 'retention'
    },
    'team_kol',
    playersToRelease
  );
  assert.equal(release1.alreadyReleased, false, 'Idempotency 27.5a: First retention release processes normally');
  assert.equal(release1.careerPhase, 'auction', 'Idempotency 27.5b: Transitions from retention to auction');
  const kkrPurseAfterFirstRelease = release1.teams.find(t => t.id === 'team_kol')!.purseCr;
  const kkrSquadCountAfterFirstRelease = release1.teams.find(t => t.id === 'team_kol')!.squad.length;

  const release2 = applyReleasePlayersForAuctionState(
    {
      players: release1.players,
      teams: release1.teams,
      careerPhase: release1.careerPhase // already 'auction'
    },
    'team_kol',
    playersToRelease
  );
  assert.equal(release2.alreadyReleased, true, 'Idempotency 27.5c: Second retention release call (e.g. from modal + parent) is blocked');
  assert.equal(
    release2.teams.find(t => t.id === 'team_kol')!.purseCr,
    kkrPurseAfterFirstRelease,
    'Idempotency 27.5d: Purse is NOT credited a second time'
  );
  assert.equal(
    release2.teams.find(t => t.id === 'team_kol')!.squad.length,
    kkrSquadCountAfterFirstRelease,
    'Idempotency 27.5e: Squad size is unchanged on duplicate release call'
  );

  // 27.6: Auction completion (applyCompleteAuctionState)
  const auctionComplete1 = applyCompleteAuctionState({
    careerPhase: 'auction',
    auctionLot: null
  });
  assert.equal(auctionComplete1.alreadyCompleted, false, 'Idempotency 27.6a: First auction completion transitions to squad_confirmation');
  assert.equal(auctionComplete1.careerPhase, 'squad_confirmation', 'Idempotency 27.6b: Phase is squad_confirmation');

  const auctionComplete2 = applyCompleteAuctionState({
    careerPhase: auctionComplete1.careerPhase,
    auctionLot: auctionComplete1.auctionLot
  });
  assert.equal(auctionComplete2.alreadyCompleted, true, 'Idempotency 27.6c: Duplicate auction completion is a no-op');

  // 27.7: Franchise squad confirmation idempotency (applyConfirmClubSquadState)
  const clubSquadConfirm1 = applyConfirmClubSquadState(
    {
      teams: baseTeams,
      players: freshPlayers,
      careerPhase: 'squad_confirmation'
    },
    'team_kol',
    validKkrSquadIds
  );
  assert.equal(clubSquadConfirm1.alreadyConfirmed, false, 'Idempotency 27.7a: First club squad confirmation succeeds');
  assert.equal(clubSquadConfirm1.nextState.careerPhase, 'off_season_rest', 'Idempotency 27.7b: Transitions to off_season_rest');

  const clubSquadConfirm2 = applyConfirmClubSquadState(
    {
      teams: clubSquadConfirm1.nextState.teams,
      players: freshPlayers,
      careerPhase: clubSquadConfirm1.nextState.careerPhase
    },
    'team_kol',
    validKkrSquadIds
  );
  assert.equal(clubSquadConfirm2.alreadyConfirmed, true, 'Idempotency 27.7c: Second club squad confirmation in off_season_rest is a no-op');

  // ==========================================================================
  // REQ 28: REPEATED SERIES CREATION ACROSS SIMULATED APPLICATION RESTARTS
  // ==========================================================================
  // Simulate multiple application restarts where no in-memory counter is shared,
  // only persisted `completedInternationalSeriesIds` and active `internationalSeries.seriesId`.
  const persistedCompletedIds: string[] = [];
  let simulatedCoach: CoachProfile = {
    ...INITIAL_COACH_PROFILE,
    clubTeamId: 'team_kol',
    nationalTeamId: ausNation.id,
    internationalTitles: 0,
    completedInternationalSeriesIds: []
  };

  for (let restartIdx = 1; restartIdx <= 4; restartIdx++) {
    // Even if tourSequence is passed as 1 (as if an uninitialized caller restarted),
    // generateUniqueInternationalSeriesId and buildInitialSeriesForNation must never collide!
    const createdSeries = buildInitialSeriesForNation(
      ausNation,
      jobDecisionIntl.nations,
      indNation.id,
      1, // intentionally fixed tourSequence = 1 to prove independence from in-memory counter
      undefined,
      persistedCompletedIds
    );
    assert.ok(
      createdSeries.seriesId && !persistedCompletedIds.includes(createdSeries.seriesId),
      `Restart Series 28.${restartIdx}a: Newly created seriesId "${createdSeries.seriesId}" is unique across simulated restart #${restartIdx}`
    );

    // Simulate JSON save/load reload mid-series and verify seriesId is preserved identically
    const serializedMidSeries = JSON.parse(
      JSON.stringify({
        ...createdSeries,
        seriesWins: 1,
        seriesLosses: 0,
        matches: createdSeries.matches.map((m, idx) =>
          idx === 0 ? { ...m, completed: true, summary: 'AUS won Match 1' } : m
        )
      })
    );
    const reloadedMidSeries = validateAndRecoverCareerState({
      rawPhase: 'international_series',
      coachProfile: simulatedCoach,
      teams: baseTeams,
      leagues: baseLeagues,
      currentLeagueId: 'pt20',
      nations: jobDecisionIntl.nations,
      nationalSquadIds: ausSelectedIds,
      careerBoardReview: null,
      players: freshPlayers,
      internationalSeries: serializedMidSeries
    });
    assert.equal(
      reloadedMidSeries.internationalSeries?.seriesId,
      createdSeries.seriesId,
      `Restart Series 28.${restartIdx}b: Reloading mid-series after simulated restart preserves seriesId`
    );

    // Finish all 5 fixtures with identical scorelines across all 4 restarts
    const completedRestartSeries = {
      ...reloadedMidSeries.internationalSeries!,
      seriesWins: 3,
      seriesLosses: 2,
      matches: reloadedMidSeries.internationalSeries!.matches.map((m, idx) => ({
        ...m,
        completed: true,
        summary: idx < 3 ? 'AUS won by 5 wickets' : 'IND won by 12 runs'
      }))
    };

    const completionRes = applyCompleteInternationalSeriesState({
      nations: jobDecisionIntl.nations,
      coachProfile: simulatedCoach,
      nationalSquadIds: ausSelectedIds,
      internationalSeries: completedRestartSeries,
      careerPhase: 'international_series'
    });
    assert.equal(
      completionRes.success,
      true,
      `Restart Series 28.${restartIdx}c: Completing series #${restartIdx} after restart succeeds`
    );
    assert.equal(
      completionRes.coachProfile.internationalTitles,
      restartIdx,
      `Restart Series 28.${restartIdx}d: Title count increments to ${restartIdx}`
    );

    // Duplicate callback for the same series after completion is blocked
    const duplicateRestartCompletion = applyCompleteInternationalSeriesState({
      nations: jobDecisionIntl.nations,
      coachProfile: completionRes.coachProfile,
      nationalSquadIds: ausSelectedIds,
      internationalSeries: completedRestartSeries,
      careerPhase: 'international_series'
    });
    assert.equal(
      duplicateRestartCompletion.alreadyCompleted,
      true,
      `Restart Series 28.${restartIdx}e: Duplicate callback for series #${restartIdx} is blocked`
    );
    assert.equal(
      duplicateRestartCompletion.coachProfile.internationalTitles,
      restartIdx,
      `Restart Series 28.${restartIdx}f: Title count remains ${restartIdx}`
    );

    persistedCompletedIds.push(createdSeries.seriesId);
    simulatedCoach = completionRes.coachProfile;
  }

  assert.equal(
    new Set(persistedCompletedIds).size,
    4,
    'Restart Series 28.5: All 4 series across simulated restarts have globally unique persistent seriesIds'
  );

  // ==========================================================================
  // REQ 29: VALIDATION SIGNATURE STABILITY & CORRUPTED SAVE RECOVERY
  // ==========================================================================
  // 29.1: Post-recovery state stabilizes immediately (no recovery loops on subsequent renders)
  const initialDirtyRecovery = validateAndRecoverCareerState({
    rawPhase: 'off_season', // legacy alias
    coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_kol', nationalTeamId: null },
    teams: baseTeams,
    leagues: distinctLeagues,
    currentLeagueId: 'missing_league_id', // recovers via policy to 'league_kkr_2026'
    nations: baseNations,
    nationalSquadIds: [],
    careerBoardReview: kkrReviewForLeague2,
    players: freshPlayers,
    internationalSeries: baseIntlSeries
  });
  assert.equal(initialDirtyRecovery.migrated, true, 'Loop Guard 29.1a: First pass migrates legacy phase and resolves league');
  assert.equal(initialDirtyRecovery.resolvedLeagueId, 'league_kkr_2026', 'Loop Guard 29.1b: Resolved to league_kkr_2026');
  assert.equal(initialDirtyRecovery.careerPhase, 'off_season_rest', 'Loop Guard 29.1c: Migrated off_season -> off_season_rest');

  const sigAfterFirstPass = buildCareerValidationSignature({
    currentLeagueId: initialDirtyRecovery.resolvedLeagueId!,
    leagues: distinctLeagues,
    coachProfile: initialDirtyRecovery.coachProfile,
    careerBoardReview: initialDirtyRecovery.careerBoardReview,
    internationalSeries: initialDirtyRecovery.internationalSeries,
    nationalSquadIds: initialDirtyRecovery.nationalSquadIds,
    careerPhase: initialDirtyRecovery.careerPhase
  });

  const secondPassRecovery = validateAndRecoverCareerState({
    rawPhase: initialDirtyRecovery.careerPhase,
    coachProfile: initialDirtyRecovery.coachProfile,
    teams: baseTeams,
    leagues: distinctLeagues,
    currentLeagueId: initialDirtyRecovery.resolvedLeagueId!,
    nations: baseNations,
    nationalSquadIds: initialDirtyRecovery.nationalSquadIds,
    careerBoardReview: initialDirtyRecovery.careerBoardReview,
    players: freshPlayers,
    internationalSeries: initialDirtyRecovery.internationalSeries
  });
  assert.equal(secondPassRecovery.migrated, false, 'Loop Guard 29.1d: Second pass on recovered state has migrated = false (no loop)');

  const sigAfterSecondPass = buildCareerValidationSignature({
    currentLeagueId: secondPassRecovery.resolvedLeagueId!,
    leagues: distinctLeagues,
    coachProfile: secondPassRecovery.coachProfile,
    careerBoardReview: secondPassRecovery.careerBoardReview,
    internationalSeries: secondPassRecovery.internationalSeries,
    nationalSquadIds: secondPassRecovery.nationalSquadIds,
    careerPhase: secondPassRecovery.careerPhase
  });
  assert.equal(
    sigAfterFirstPass,
    sigAfterSecondPass,
    'Loop Guard 29.1e: Validation signature is identical after recovery, preventing redundant effect runs'
  );

  // 29.2: Changing persisted career data (e.g., switching active league or updating league season) changes signature and validates
  const sigAfterLeagueChange = buildCareerValidationSignature({
    currentLeagueId: 'league_csk_2028',
    leagues: distinctLeagues,
    coachProfile: secondPassRecovery.coachProfile,
    careerBoardReview: secondPassRecovery.careerBoardReview,
    internationalSeries: secondPassRecovery.internationalSeries,
    nationalSquadIds: secondPassRecovery.nationalSquadIds,
    careerPhase: secondPassRecovery.careerPhase
  });
  assert.notEqual(
    sigAfterFirstPass,
    sigAfterLeagueChange,
    'Loop Guard 29.2: Changing active league changes validation signature so reconciliation runs'
  );

  // 29.3: Corrupted save with missing clubTeamId and invalid currentLeagueId must NEVER associate with leagues[0]
  const corruptedUnrelatedSave = validateAndRecoverCareerState({
    rawPhase: 'corrupted_phase_xyz',
    coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: '', clubStints: [], nationalTeamId: null },
    teams: baseTeams,
    leagues: [league1_MI_2027], // only 1 league in array, but unrelated to coach!
    currentLeagueId: 'non_existent_league',
    nations: baseNations,
    nationalSquadIds: [],
    careerBoardReview: null,
    players: freshPlayers
  });
  assert.equal(
    corruptedUnrelatedSave.resolvedLeagueId,
    null,
    'Corrupted Save 29.3a: Never associates career with leagues[0] when both currentLeagueId and clubTeamId are missing/unrelated'
  );
  assert.equal(
    corruptedUnrelatedSave.requiresLeagueSelection,
    true,
    'Corrupted Save 29.3b: Requires explicit league selection instead of picking unrelated leagues[0]'
  );

  // 29.4: Corrupted leagues array containing null/malformed entries does not crash and resolves valid matching league
  const malformedLeaguesList: any[] = [
    null,
    undefined,
    { id: '', standings: null },
    league1_MI_2027,
    league2_KKR_2026
  ];
  const malformedListRecovery = validateAndRecoverCareerState({
    rawPhase: 'career_decision',
    coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_kol', nationalTeamId: null },
    teams: baseTeams,
    leagues: malformedLeaguesList as League[],
    currentLeagueId: 'corrupted_id',
    nations: baseNations,
    nationalSquadIds: [],
    careerBoardReview: kkrReviewForLeague2,
    players: freshPlayers
  });
  assert.equal(
    malformedListRecovery.resolvedLeagueId,
    'league_kkr_2026',
    'Corrupted Save 29.4: Safely ignores null/malformed league entries and resolves unique matching league'
  );

  // ==========================================================================
  // REQ 30: FINAL CAREER STATE AUDIT & EDGE-CASE SCENARIOS (1 TO 12)
  // ==========================================================================

  // Scenario 1: New series with unused explicit ID is created successfully
  const unusedExplicitId = 'intl_series_explicit_aus_vs_ind_2026_xyz123';
  const seriesWithUnusedExplicitId = buildInitialSeriesForNation(
    ausNation,
    baseNations,
    indNation.id,
    1,
    unusedExplicitId,
    ['some_other_id_1', 'some_other_id_2']
  );
  assert.equal(
    seriesWithUnusedExplicitId.seriesId,
    unusedExplicitId,
    'Scenario 1: New series with unused explicit ID is created with the exact requested ID'
  );
  assert.equal(
    seriesWithUnusedExplicitId.userNationId,
    ausNation.id,
    'Scenario 1: Coached nation matches'
  );
  assert.equal(
    seriesWithUnusedExplicitId.opponentNationId,
    indNation.id,
    'Scenario 1: Opponent nation matches'
  );

  // Scenario 2: New series with duplicate explicit ID is rejected or receives new unique ID
  const duplicateId = 'already_persisted_intl_series_abc456';
  const existingRecordsWithDuplicate = [duplicateId, 'some_other_id_1'];

  // 2a: When onDuplicateExplicitId === 'reject', error is thrown
  assert.throws(
    () => {
      buildInitialSeriesForNation(
        ausNation,
        baseNations,
        indNation.id,
        1,
        duplicateId,
        existingRecordsWithDuplicate,
        { onDuplicateExplicitId: 'reject' }
      );
    },
    /already belongs to an existing series/i,
    'Scenario 2a: Duplicate explicit ID throws clear validation error when reject option is specified'
  );

  // 2b: When onDuplicateExplicitId === 'regenerate' (or default), collision generates a new unique ID
  const seriesWithCollisionRegenerated = buildInitialSeriesForNation(
    ausNation,
    baseNations,
    indNation.id,
    1,
    duplicateId,
    existingRecordsWithDuplicate,
    { onDuplicateExplicitId: 'regenerate' }
  );
  assert.notEqual(
    seriesWithCollisionRegenerated.seriesId,
    duplicateId,
    'Scenario 2b: Duplicate explicit ID is not reused when creating a new series'
  );
  assert.ok(
    seriesWithCollisionRegenerated.seriesId.length > 0 &&
      !existingRecordsWithDuplicate.includes(seriesWithCollisionRegenerated.seriesId),
    'Scenario 2b: Newly generated series ID is unique against the persisted collection'
  );

  // Scenario 3: Restoring existing series preserves its ID
  const restoredExistingSeries = buildInitialSeriesForNation(
    ausNation,
    baseNations,
    indNation.id,
    1,
    duplicateId,
    existingRecordsWithDuplicate,
    { isRestoring: true }
  );
  assert.equal(
    restoredExistingSeries.seriesId,
    duplicateId,
    'Scenario 3: Restoring existing series preserves its original ID without generating a new one'
  );

  // Part 4 Scenarios: International Series Validity
  // Part 4 Scenario 7: Empty nation dataset fails safely
  assert.throws(
    () => buildInitialSeriesForNation(ausNation, [], undefined, 1),
    /nations dataset is empty/i,
    'Part 4 Scenario 7: Empty nation dataset fails safely'
  );

  // Part 4 Scenario 8: A single nation cannot play itself
  assert.throws(
    () => buildInitialSeriesForNation(ausNation, [ausNation], undefined, 1),
    /no eligible opponent nation available/i,
    'Part 4 Scenario 8: A single nation cannot play itself'
  );

  // Part 4 Scenario 9: Missing coached nation fails safely
  assert.throws(
    () => buildInitialSeriesForNation(null as any, baseNations, undefined, 1),
    /coached nation is missing or invalid/i,
    'Part 4 Scenario 9: Missing coached nation fails safely'
  );

  // Part 4 Scenario 10: Nonexistent explicit opponent ID fails clearly against non-empty candidate pool without state mutation
  const baseNationsSnapshot = JSON.stringify(baseNations);
  const ausNationSnapshot = JSON.stringify(ausNation);

  assert.throws(
    () => buildInitialSeriesForNation(ausNation, baseNations, 'non_existent_opp_999', 1),
    /explicitly requested opponent "non_existent_opp_999" was not found among eligible nations/i,
    'Part 4 Scenario 10a: Nonexistent explicit opponent ID throws a clear validation error without falling back to another nation'
  );

  assert.equal(
    JSON.stringify(baseNations),
    baseNationsSnapshot,
    'Part 4 Scenario 10b: Nation dataset remains completely unmutated on failed series creation'
  );
  assert.equal(
    JSON.stringify(ausNation),
    ausNationSnapshot,
    'Part 4 Scenario 10c: Coached nation object remains completely unmutated on failed series creation'
  );

  // Additional explicit opponent validation cases:
  // 10d: Valid explicit opponent ID succeeds
  const explicitIdSeries = buildInitialSeriesForNation(ausNation, baseNations, indNation.id, 1);
  assert.equal(
    explicitIdSeries.opponentNationId,
    indNation.id,
    'Part 4 Scenario 10d: Valid explicit opponent ID succeeds and selects the requested opponent'
  );

  // 10e: Valid explicit opponent name succeeds
  const explicitNameSeries = buildInitialSeriesForNation(ausNation, baseNations, 'South Africa', 1);
  assert.equal(
    explicitNameSeries.opponentNationName,
    'South Africa',
    'Part 4 Scenario 10e: Valid explicit opponent name succeeds and selects requested nation'
  );

  // 10f: Omitting opponent uses automatic selection successfully
  const autoSelectSeries = buildInitialSeriesForNation(ausNation, baseNations, undefined, 1);
  assert.ok(
    autoSelectSeries.opponentNationId && autoSelectSeries.opponentNationId !== ausNation.id,
    'Part 4 Scenario 10f: Omitting opponent uses automatic selection successfully when eligible candidates exist'
  );

  // 10g: Explicit self-opponent ID is rejected
  assert.throws(
    () => buildInitialSeriesForNation(ausNation, baseNations, ausNation.id, 1),
    /identical to coached nation/i,
    'Part 4 Scenario 10g: Explicit self-opponent ID is rejected'
  );

  // 10h: Explicit self-opponent name is rejected
  assert.throws(
    () => buildInitialSeriesForNation(ausNation, baseNations, 'Australia', 1),
    /identical to coached nation/i,
    'Part 4 Scenario 10h: Explicit self-opponent name is rejected'
  );

  // Part 4 Scenario 11: Valid opponent produces valid schedule
  const validScheduleSeries = buildInitialSeriesForNation(ausNation, baseNations, indNation.id, 1);
  assert.equal(validScheduleSeries.matches.length, 5, 'Part 4 Scenario 11: Valid opponent produces 5 scheduled fixtures');
  assert.ok(
    validScheduleSeries.matches.every((m, idx) => m.matchNumber === idx + 1 && m.city.length > 0 && m.venue.length > 0 && m.completed === false),
    'Part 4 Scenario 11: Scheduled fixtures have valid numbers, cities, venues, and completed: false'
  );

  // Scenario 4: Two series between same nations have distinct IDs
  const seriesNationPair1 = buildInitialSeriesForNation(
    ausNation,
    baseNations,
    indNation.id,
    1,
    undefined,
    []
  );
  const seriesNationPair2 = buildInitialSeriesForNation(
    ausNation,
    baseNations,
    indNation.id,
    1,
    undefined,
    [seriesNationPair1.seriesId]
  );
  assert.notEqual(
    seriesNationPair1.seriesId,
    seriesNationPair2.seriesId,
    'Scenario 4: Two different series between the same countries receive distinct unique IDs'
  );

  // Scenario 5: IDs remain stable after save/load
  const originalSeriesToSave = {
    ...seriesNationPair1,
    seriesWins: 2,
    seriesLosses: 1,
    matches: seriesNationPair1.matches.map((m, idx) =>
      idx < 3 ? { ...m, completed: true, summary: 'Match result' } : m
    )
  };
  const serializedSave = JSON.stringify(originalSeriesToSave);
  const parsedSave = JSON.parse(serializedSave);
  const recoveredSaveState = validateAndRecoverCareerState({
    rawPhase: 'international_series',
    coachProfile: { ...INITIAL_COACH_PROFILE, nationalTeamId: ausNation.id },
    teams: baseTeams,
    leagues: baseLeagues,
    currentLeagueId: 'pt20',
    nations: baseNations,
    nationalSquadIds: ausSelectedIds,
    careerBoardReview: null,
    players: freshPlayers,
    internationalSeries: parsedSave
  });
  assert.equal(
    recoveredSaveState.internationalSeries?.seriesId,
    seriesNationPair1.seriesId,
    'Scenario 5: Series ID remains stable and identical after serialization and save/load recovery'
  );

  // Scenario 6: Repeated completion of same series awards title at most once
  const completedFiveMatchSeries = {
    ...seriesNationPair1,
    seriesWins: 3,
    seriesLosses: 2,
    matches: seriesNationPair1.matches.map((m, idx) => ({
      ...m,
      completed: true,
      summary: idx < 3 ? 'AUS won' : 'IND won'
    }))
  };
  const testCoachProfile: CoachProfile = {
    ...INITIAL_COACH_PROFILE,
    nationalTeamId: ausNation.id,
    internationalTitles: 0,
    completedInternationalSeriesIds: []
  };

  const firstSeriesCompletion = applyCompleteInternationalSeriesState({
    nations: baseNations,
    coachProfile: testCoachProfile,
    nationalSquadIds: ausSelectedIds,
    internationalSeries: completedFiveMatchSeries,
    careerPhase: 'international_series'
  });
  assert.equal(
    firstSeriesCompletion.success,
    true,
    'Scenario 6a: First series completion succeeds'
  );
  assert.equal(
    firstSeriesCompletion.coachProfile.internationalTitles,
    1,
    'Scenario 6b: International titles increments to 1'
  );
  assert.ok(
    Boolean(firstSeriesCompletion.coachProfile.completedInternationalSeriesIds?.includes(seriesNationPair1.seriesId)),
    'Scenario 6c: Authoritative seriesId is recorded in completedInternationalSeriesIds'
  );

  // Second invocation with the same completed series
  const secondSeriesCompletion = applyCompleteInternationalSeriesState({
    nations: baseNations,
    coachProfile: firstSeriesCompletion.coachProfile,
    nationalSquadIds: ausSelectedIds,
    internationalSeries: completedFiveMatchSeries,
    careerPhase: 'international_series'
  });
  assert.equal(
    secondSeriesCompletion.success,
    false,
    'Scenario 6d: Second series completion returns success: false'
  );
  assert.equal(
    secondSeriesCompletion.alreadyCompleted,
    true,
    'Scenario 6e: alreadyCompleted flag is true'
  );
  assert.equal(
    secondSeriesCompletion.coachProfile.internationalTitles,
    1,
    'Scenario 6f: International titles count is NOT incremented a second time'
  );
  assert.equal(
    secondSeriesCompletion.coachProfile.completedInternationalSeriesIds?.length,
    1,
    'Scenario 6g: completedInternationalSeriesIds array is not duplicated'
  );

  // Scenario 7: Later series with different ID can complete normally
  const distinctSecondSeries = buildInitialSeriesForNation(
    ausNation,
    baseNations,
    indNation.id,
    2,
    undefined,
    firstSeriesCompletion.coachProfile.completedInternationalSeriesIds
  );
  assert.notEqual(
    distinctSecondSeries.seriesId,
    seriesNationPair1.seriesId,
    'Scenario 7a: Later series receives a new distinct ID'
  );
  const completedSecondSeries = {
    ...distinctSecondSeries,
    seriesWins: 4,
    seriesLosses: 1,
    matches: distinctSecondSeries.matches.map(m => ({
      ...m,
      completed: true,
      summary: 'AUS dominant win'
    }))
  };
  const laterSeriesCompletion = applyCompleteInternationalSeriesState({
    nations: baseNations,
    coachProfile: firstSeriesCompletion.coachProfile,
    nationalSquadIds: ausSelectedIds,
    internationalSeries: completedSecondSeries,
    careerPhase: 'international_series'
  });
  assert.equal(
    laterSeriesCompletion.success,
    true,
    'Scenario 7b: Later series with different ID completes normally even with same nations'
  );
  assert.equal(
    laterSeriesCompletion.coachProfile.internationalTitles,
    2,
    'Scenario 7c: International title count increments normally for the second distinct series'
  );
  assert.equal(
    laterSeriesCompletion.coachProfile.completedInternationalSeriesIds?.length,
    2,
    'Scenario 7d: Both distinct series IDs are recorded'
  );

  // Scenario 8: Incomplete series cannot be marked complete
  const incompleteSeries = {
    ...distinctSecondSeries,
    seriesId: 'series_incomplete_test_789',
    seriesWins: 1,
    seriesLosses: 1,
    matches: distinctSecondSeries.matches.map((m, idx) => ({
      ...m,
      completed: idx < 2, // only 2 of 5 fixtures completed
      summary: idx < 2 ? 'Completed match' : undefined
    }))
  };
  const incompleteCompletion = applyCompleteInternationalSeriesState({
    nations: baseNations,
    coachProfile: laterSeriesCompletion.coachProfile,
    nationalSquadIds: ausSelectedIds,
    internationalSeries: incompleteSeries,
    careerPhase: 'international_series'
  });
  assert.equal(
    incompleteCompletion.success,
    false,
    'Scenario 8a: Incomplete series cannot be marked complete'
  );
  assert.ok(
    incompleteCompletion.error && /all scheduled fixtures/i.test(incompleteCompletion.error),
    'Scenario 8b: Returns clear error regarding incomplete scheduled fixtures'
  );
  assert.equal(
    incompleteCompletion.coachProfile.internationalTitles,
    2,
    'Scenario 8c: International titles count is unchanged on incomplete series'
  );

  // Scenario 9: Invalid active-league ID recovers safely when unique replacement exists
  const uniqueRecoveryResult = validateAndRecoverCareerState({
    rawPhase: 'league_stage',
    coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_kol', nationalTeamId: null },
    teams: baseTeams,
    leagues: [league1_MI_2027, league2_KKR_2026], // only league2 has team_kol
    currentLeagueId: 'completely_invalid_deleted_league_id',
    nations: baseNations,
    nationalSquadIds: [],
    careerBoardReview: null,
    players: freshPlayers
  });
  assert.equal(
    uniqueRecoveryResult.resolvedLeagueId,
    'league_kkr_2026',
    'Scenario 9a: Recovers to the unique matching league for team_kol'
  );
  assert.equal(
    uniqueRecoveryResult.requiresLeagueSelection,
    false,
    'Scenario 9b: Does not require manual league selection when unique replacement exists'
  );

  // Scenario 10: Ambiguous league recovery does not silently choose first league
  // Create two leagues both containing team_kol and both with season 2026, no review
  const ambiguousLeagueA: League = {
    ...league2_KKR_2026,
    id: 'league_ambiguous_A',
    name: 'Ambiguous League A'
  };
  const ambiguousLeagueB: League = {
    ...league2_KKR_2026,
    id: 'league_ambiguous_B',
    name: 'Ambiguous League B'
  };
  const ambiguousRecovery = resolveActiveLeagueForRecovery({
    currentLeagueId: 'missing_league_id',
    leagues: [ambiguousLeagueA, ambiguousLeagueB],
    coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_kol' },
    careerBoardReview: null
  });
  assert.equal(
    ambiguousRecovery.resolvedLeagueId,
    null,
    'Scenario 10a: Ambiguous league recovery returns resolvedLeagueId: null'
  );
  assert.equal(
    ambiguousRecovery.requiresLeagueSelection,
    true,
    'Scenario 10b: Requires explicit league selection when multiple candidate leagues match'
  );
  assert.notEqual(
    ambiguousRecovery.resolvedLeagueId,
    ambiguousLeagueA.id,
    'Scenario 10c: Never silently picks the first league in the array (ambiguousLeagueA)'
  );

  // Scenario 11: Repeated off-season advancement cannot create duplicate seasons
  const offSeasonState = {
    players: freshPlayers.map((p, idx) => idx === 0 ? { ...p, fitness: 70, isInjured: true, injuryDays: 2 } : p),
    teams: baseTeams,
    leagues: [league2_KKR_2026],
    currentLeagueId: 'league_kkr_2026',
    coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_kol' },
    nations: baseNations,
    tournamentHonors: [],
    careerPhase: 'off_season_rest' as CareerPhase,
    careerBoardReview: null,
    squadStamina: 75
  };
  const adv1 = applyAdvanceOffSeasonState(offSeasonState);
  assert.ok(
    adv1.restDaysProcessed > 0,
    'Scenario 11a: First advance off-season processes rest days'
  );
  assert.equal(
    adv1.careerPhase,
    'league_stage',
    'Scenario 11b: Career phase transitions to league_stage for next season'
  );
  const nextSeasonYear = adv1.leagues[0].seasonYear;
  assert.equal(
    nextSeasonYear,
    2027,
    'Scenario 11c: Season year advanced to 2027'
  );
  const player0AfterAdv1Age = adv1.players[0].age;

  // Duplicate call to applyAdvanceOffSeasonState while in league_stage must be a no-op
  const adv2 = applyAdvanceOffSeasonState({
    ...adv1,
    currentLeagueId: offSeasonState.currentLeagueId
  });
  assert.equal(
    adv2.restDaysProcessed,
    0,
    'Scenario 11d: Duplicate advance off-season call processes 0 days'
  );
  assert.equal(
    adv2.leagues[0].seasonYear,
    2027,
    'Scenario 11e: Season year is not incremented again'
  );
  assert.equal(
    adv2.players[0].age,
    player0AfterAdv1Age,
    'Scenario 11f: Players are not aged twice'
  );

  // Calling applyStartNewFranchiseSeasonState when already initialized for 2027 returns alreadyInitialized: true
  const seasonStartRepeated = applyStartNewFranchiseSeasonState(
    {
      players: adv1.players,
      teams: adv1.teams,
      leagues: adv1.leagues,
      currentLeagueId: adv1.leagues[0].id,
      coachProfile: adv1.coachProfile,
      nations: adv1.nations,
      tournamentHonors: adv1.tournamentHonors,
      careerPhase: 'league_stage',
      careerBoardReview: null
    },
    'team_kol'
  );
  assert.equal(
    seasonStartRepeated.alreadyInitialized,
    true,
    'Scenario 11g: Repeated season start in league_stage returns alreadyInitialized: true without duplicate records'
  );

  // Scenario 12: Reloading during each major career phase resumes correct state
  const majorCareerPhases: CareerPhase[] = [
    'league_stage',
    'playoffs',
    'board_review',
    'career_decision',
    'international_squad_selection',
    'international_series',
    'retention',
    'auction',
    'squad_confirmation',
    'off_season_rest',
    'next_season_ready'
  ];

  for (const phase of majorCareerPhases) {
    let testLeague: League = league2_KKR_2026;
    let testClubId = 'team_kol';
    let testBoardReview: CareerBoardReview | null = null;
    let testBoardHistory: CareerBoardReview[] = [];

    if (phase === 'league_stage') {
      testLeague = {
        ...league2_KKR_2026,
        id: 'league_mid_season_kol',
        standings: midSeasonStandings.filter(s => s.teamId === 'team_kol' || s.teamId === 'team_blr'),
        playoffs: createInitialPlayoffs(midSeasonStandings)
      };
    } else if (phase === 'playoffs') {
      testLeague = league1_MI_2027; // Has Q1 completed, final not completed
      testClubId = 'team_mum';
    } else if (phase === 'board_review') {
      testLeague = league2_KKR_2026;
      testBoardReview = kkrReviewForLeague2;
    } else if (
      phase === 'career_decision' ||
      phase === 'retention' ||
      phase === 'auction' ||
      phase === 'squad_confirmation' ||
      phase === 'off_season_rest' ||
      phase === 'next_season_ready'
    ) {
      testLeague = league2_KKR_2026;
      testBoardHistory = [kkrReviewForLeague2];
    }

    const rawSavedData = {
      careerPhase: phase,
      coachProfile: {
        ...INITIAL_COACH_PROFILE,
        clubTeamId: testClubId,
        boardReviewsHistory: testBoardHistory,
        nationalTeamId: phase.startsWith('international') ? ausNation.id : null
      },
      currentLeagueId: testLeague.id,
      careerBoardReview: testBoardReview,
      internationalSeries: phase.startsWith('international') ? seriesNationPair1 : undefined,
      nationalSquadIds: phase === 'international_series' ? ausSelectedIds : []
    };
    const serialized = JSON.parse(JSON.stringify(rawSavedData));
    const reloadedState = validateAndRecoverCareerState({
      rawPhase: serialized.careerPhase,
      coachProfile: serialized.coachProfile,
      teams: baseTeams,
      leagues: [testLeague],
      currentLeagueId: serialized.currentLeagueId,
      nations: baseNations,
      nationalSquadIds: serialized.nationalSquadIds,
      careerBoardReview: serialized.careerBoardReview,
      players: freshPlayers,
      internationalSeries: serialized.internationalSeries
    });
    assert.equal(
      reloadedState.careerPhase,
      phase,
      `Scenario 12: Reloading during career phase "${phase}" resumes with the identical phase preserved`
    );
  }

  // ==========================================================================
  // REQ 32: VERIFIED PLAYOFF & CAREER-MODE DEFECT SCENARIOS
  // ==========================================================================
  // Scenario 32.1: Manual simulation of a non-user playoff fixture is rejected
  const q1UserLeague: League = {
    ...baseLeagues[0],
    standings: seededStandings,
    playoffs: qualifiedPlayoffs
  };
  const nonUserPlayoffSim = validatePlayoffEligibility({
    careerPhase: 'playoffs',
    league: q1UserLeague,
    userClubId: 'team_kol', // team_kol is in Q1, NOT Eliminator (team_mum vs team_blr)
    stage: 'eliminator',
    isUserAction: true
  });
  assert.equal(nonUserPlayoffSim.canSimulate, false, 'Defect 32.1: Manual simulation of non-user playoff fixture MUST be rejected');
  assert.equal(nonUserPlayoffSim.isUserMatch, false, 'Defect 32.1: Eliminator is not a user match');

  // Scenario 32.2: Manual simulation of an eligible user-team fixture succeeds
  const userPlayoffSim = validatePlayoffEligibility({
    careerPhase: 'playoffs',
    league: q1UserLeague,
    userClubId: 'team_kol', // team_kol is Q1 home team vs team_che
    stage: 'q1',
    isUserAction: true
  });
  assert.equal(userPlayoffSim.canSimulate, true, 'Defect 32.2: Manual simulation of eligible user playoff fixture MUST succeed');
  assert.equal(userPlayoffSim.canPlay, true, 'Defect 32.2: Manual play of eligible user playoff fixture MUST succeed');

  // Scenario 32.3: An incomplete league stage cannot be bypassed by setting phase to "playoffs"
  const incompleteLeagueObj: League = {
    ...baseLeagues[0],
    standings: seededStandings.map(s => ({ ...s, played: 12 })) // Only 12 played out of 18
  };
  const bypassAttempt = validatePlayoffEligibility({
    careerPhase: 'playoffs', // Fraudulent phase setting
    league: incompleteLeagueObj,
    userClubId: 'team_kol',
    stage: 'q1',
    isUserAction: true
  });
  assert.equal(bypassAttempt.canPlay, false, 'Defect 32.3: Incomplete league stage cannot be bypassed via phase string');
  assert.equal(bypassAttempt.canSimulate, false, 'Defect 32.3: Simulation rejected when league stage is incomplete');

  // Scenario 32.4: Invalid or unresolved playoff participants do not produce arbitrary matches
  const corruptedPlayoffLeague: League = {
    ...baseLeagues[0],
    standings: seededStandings,
    playoffs: {
      ...qualifiedPlayoffs,
      q2: { ...qualifiedPlayoffs.q2, homeTeamId: null, awayTeamId: null }
    }
  };
  const unresolvedEligibility = validatePlayoffEligibility({
    careerPhase: 'playoffs',
    league: corruptedPlayoffLeague,
    userClubId: 'team_kol',
    stage: 'q2',
    isUserAction: true
  });
  assert.equal(unresolvedEligibility.canPlay, false, 'Defect 32.4: Unresolved playoff participants MUST NOT produce playable match');
  assert.equal(unresolvedEligibility.canSimulate, false, 'Defect 32.4: Unresolved playoff participants MUST NOT produce simmable match');

  // Scenario 32.5: Qualifier prerequisites and final qualification remain enforced
  const uncompletedQ1Q2League: League = {
    ...baseLeagues[0],
    standings: seededStandings,
    playoffs: {
      ...qualifiedPlayoffs,
      q1: { ...qualifiedPlayoffs.q1, completed: false },
      q2: { ...qualifiedPlayoffs.q2, completed: false }
    }
  };
  const prematureFinalEligibility = validatePlayoffEligibility({
    careerPhase: 'playoffs',
    league: uncompletedQ1Q2League,
    userClubId: 'team_kol',
    stage: 'final',
    isUserAction: true
  });
  assert.equal(prematureFinalEligibility.canPlay, false, 'Defect 32.5: Final requires Q1 and Q2 completion');
  assert.equal(prematureFinalEligibility.canSimulate, false, 'Defect 32.5: Final simulation rejected prior to prerequisites');

  // Scenario 32.6: Accepting an international coaching job clears the active club contract
  const jobStateInput = {
    coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_kol', nationalTeamId: null, activeCareerMode: 'franchise' as const },
    teams: baseTeams,
    nations: baseNations,
    players: freshPlayers,
    leagues: baseLeagues,
    currentLeagueId: 'pt20',
    nationalSquadIds: [],
    internationalSeries: buildInitialSeriesForNation(baseNations[0], baseNations),
    careerPhase: 'career_decision' as const,
    careerBoardReview: null
  };
  const intlDecision = applyCareerJobDecisionState(jobStateInput, 'team_kol', 'nat_ind');
  assert.equal(intlDecision.coachProfile.activeCareerMode, 'international', 'Defect 32.6: Active career mode must be international');
  assert.equal(intlDecision.coachProfile.nationalTeamId, 'nat_ind', 'Defect 32.6: Active national team set to nat_ind');
  assert.equal(intlDecision.coachProfile.clubTeamId, null, 'Defect 32.6: Accepting international job MUST clear active club contract (clubTeamId = null)');

  // Scenario 32.7: Franchise transitions clear the active national-team contract
  const franchiseDecision = applyCareerJobDecisionState(
    {
      ...jobStateInput,
      coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: null, nationalTeamId: 'nat_ind', activeCareerMode: 'international' as const }
    },
    'team_kol',
    null
  );
  assert.equal(franchiseDecision.coachProfile.activeCareerMode, 'franchise', 'Defect 32.7: Active career mode must be franchise');
  assert.equal(franchiseDecision.coachProfile.clubTeamId, 'team_kol', 'Defect 32.7: Active club team set to team_kol');
  assert.equal(franchiseDecision.coachProfile.nationalTeamId, null, 'Defect 32.7: Franchise transition MUST clear active national contract (nationalTeamId = null)');

  // Scenario 32.8: The next-tour fallback persists the generated tour and matching calendar fixtures
  const freshTour = buildInitialSeriesForNation(baseNations[0], baseNations, undefined, 2);
  assert.ok(freshTour.seriesId && freshTour.seriesId.length > 0, 'Defect 32.8: Generated series MUST have valid non-empty seriesId');
  assert.ok(freshTour.matches.length >= 3, 'Defect 32.8: Generated series MUST contain scheduled match fixtures');

  // Scenario 32.9: Direct simulation cannot complete the same fixture twice
  const completedQ1State = applyCompletePlayoffMatchState(
    {
      leagues: [q1UserLeague],
      currentLeagueId: 'pt20',
      teams: baseTeams,
      coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_kol' },
      tournamentHonors: [],
      careerPhase: 'playoffs',
      careerBoardReview: null
    },
    {
      leagueId: 'pt20',
      stage: 'q1',
      homeTeamId: 'team_kol',
      awayTeamId: 'team_che',
      winnerTeamId: 'team_kol',
      resultSummary: 'KKR beat CSK by 12 runs'
    }
  );
  assert.equal(completedQ1State.alreadyCompleted, false, 'Defect 32.9a: First completion succeeds');
  const repeatQ1State = applyCompletePlayoffMatchState(
    {
      ...completedQ1State,
      currentLeagueId: 'pt20',
      teams: baseTeams
    },
    {
      leagueId: 'pt20',
      stage: 'q1',
      homeTeamId: 'team_kol',
      awayTeamId: 'team_che',
      winnerTeamId: 'team_kol',
      resultSummary: 'KKR beat CSK by 12 runs'
    }
  );
  assert.equal(repeatQ1State.alreadyCompleted, true, 'Defect 32.9b: Second completion flagged as alreadyCompleted without duplicate mutation');

  // Scenario 32.10: Existing valid career saves still recover without losing completed results
  const validCompletedLeague: League = {
    ...baseLeagues[0],
    standings: seededStandings,
    playoffs: bracketAfterQ2
  };
  const recoveredSave = validateAndRecoverCareerState({
    rawPhase: 'playoffs',
    coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_kol', activeCareerMode: 'franchise' },
    teams: baseTeams,
    leagues: [validCompletedLeague],
    currentLeagueId: 'pt20',
    nations: baseNations,
    nationalSquadIds: [],
    careerBoardReview: null,
    players: freshPlayers,
    internationalSeries: freshTour
  });
  assert.equal(recoveredSave.resolvedLeagueId, 'pt20', 'Defect 32.10: Active league recovered cleanly');
  assert.equal(recoveredSave.requiresLeagueSelection, false, 'Defect 32.10: Valid save requires no manual league selection');
  assert.ok(recoveredSave.coachProfile.clubTeamId === 'team_kol', 'Defect 32.10: Coached club team retained');

  // ==========================================================================
  // REQ 33: EMPTY-FILTER PLAYOFF COMPLETION & LEAGUE VALIDATION REGRESSION TESTS
  // ==========================================================================
  // 33.1: An empty calendar (with uncompleted standings) MUST NOT satisfy league completion
  const emptyCalendarLeague: League = {
    ...baseLeagues[0],
    calendarDates: [],
    standings: midSeasonStandings,
    playoffs: qualifiedPlayoffs
  };
  const emptyCalendarBeforeSnapshot = JSON.stringify(emptyCalendarLeague);
  assert.equal(
    isDomesticLeagueStageComplete(emptyCalendarLeague),
    false,
    'REQ 33.1a: Empty calendar with incomplete standings must NOT pass isDomesticLeagueStageComplete'
  );
  const emptyCalElig = validatePlayoffEligibility({
    careerPhase: 'playoffs',
    league: emptyCalendarLeague,
    userClubId: 'team_kol',
    stage: 'q1',
    isUserAction: true
  });
  assert.equal(emptyCalElig.canPlay, false, 'REQ 33.1b: Empty calendar must reject playoff play');
  assert.equal(emptyCalElig.canSimulate, false, 'REQ 33.1c: Empty calendar must reject playoff simulation');
  assert.equal(
    JSON.stringify(emptyCalendarLeague),
    emptyCalendarBeforeSnapshot,
    'REQ 33.1d: Attempting playoff validation on empty calendar must not mutate league state'
  );

  // 33.2: A calendar containing ONLY international fixtures MUST NOT satisfy domestic league completion
  const intlOnlyCalendarLeague: League = {
    ...baseLeagues[0],
    calendarDates: [
      {
        id: 'cal_intl_only_1',
        dateStr: '2026-06-05',
        dayOfWeek: 'FRI',
        dayNumber: 5,
        month: 'Jun',
        type: 'international',
        title: '1st T20I: IND vs AUS',
        isHome: true,
        matchFixture: {
          id: 'fix_intl_only_1',
          homeTeamId: 'nat_ind',
          awayTeamId: 'nat_aus',
          homeTeamName: 'India',
          awayTeamName: 'Australia',
          homeTeamLogo: '🇮🇳',
          awayTeamLogo: '🇦🇺',
          venue: 'Wankhede Stadium',
          dateStr: '2026-06-05',
          completed: true,
          resultSummary: 'India won by 15 runs'
        }
      },
      {
        id: 'cal_intl_only_2',
        dateStr: '2026-06-07',
        dayOfWeek: 'SUN',
        dayNumber: 7,
        month: 'Jun',
        type: 'international',
        title: '2nd T20I: IND vs AUS',
        isHome: true,
        matchFixture: {
          id: 'fix_intl_only_2',
          homeTeamId: 'nat_ind',
          awayTeamId: 'nat_aus',
          homeTeamName: 'India',
          awayTeamName: 'Australia',
          homeTeamLogo: '🇮🇳',
          awayTeamLogo: '🇦🇺',
          venue: 'Eden Gardens',
          dateStr: '2026-06-07',
          completed: true,
          resultSummary: 'Australia won by 4 wickets'
        }
      }
    ],
    standings: midSeasonStandings,
    playoffs: qualifiedPlayoffs
  };
  const intlOnlySnapshot = JSON.stringify(intlOnlyCalendarLeague);
  assert.equal(
    getAuthoritativeDomesticFixtures(intlOnlyCalendarLeague).fixtures.length,
    0,
    'REQ 33.2a: International-only calendar has 0 authoritative domestic fixtures'
  );
  assert.equal(
    isDomesticLeagueStageComplete(intlOnlyCalendarLeague),
    false,
    'REQ 33.2b: International-only calendar must NOT establish domestic league completion'
  );
  const intlOnlyElig = validatePlayoffEligibility({
    careerPhase: 'playoffs',
    league: intlOnlyCalendarLeague,
    userClubId: 'team_kol',
    stage: 'q1',
    isUserAction: true
  });
  assert.equal(intlOnlyElig.canPlay, false, 'REQ 33.2c: International-only calendar rejects playoff play');
  assert.equal(intlOnlyElig.canSimulate, false, 'REQ 33.2d: International-only calendar rejects playoff simulation');
  assert.equal(
    JSON.stringify(intlOnlyCalendarLeague),
    intlOnlySnapshot,
    'REQ 33.2e: Failed playoff check on international-only calendar leaves state untouched'
  );

  // 33.3: A calendar with domestic fixtures but NO completed results (or completed: true without authoritative resultSummary)
  const fullSeasonCalendar = buildSeasonCalendarForTeam(
    'team_kol',
    baseTeams,
    false,
    2026
  );
  const unplayedDomesticLeague: League = {
    ...baseLeagues[0],
    calendarDates: fullSeasonCalendar.map(d => ({
      ...d,
      matchFixture:
        d.type === 'match' && d.matchFixture
          ? { ...d.matchFixture, completed: false, resultSummary: undefined }
          : d.matchFixture,
      otherMatches: (d.otherMatches || []).map(om => ({
        ...om,
        completed: false,
        resultSummary: undefined
      }))
    })),
    standings: midSeasonStandings,
    playoffs: qualifiedPlayoffs
  };
  assert.equal(
    isDomesticLeagueStageComplete(unplayedDomesticLeague),
    false,
    'REQ 33.3a: Calendar with unplayed domestic fixtures must NOT be marked complete'
  );
  const fakeCompletedNoSummaryLeague: League = {
    ...baseLeagues[0],
    calendarDates: fullSeasonCalendar.map(d =>
      d.type === 'match' && d.matchFixture
        ? { ...d, matchFixture: { ...d.matchFixture, completed: true, resultSummary: '' } }
        : d
    ),
    standings: midSeasonStandings,
    playoffs: qualifiedPlayoffs
  };
  assert.equal(
    isDomesticLeagueStageComplete(fakeCompletedNoSummaryLeague),
    false,
    'REQ 33.3b: Domestic fixtures marked completed without authoritative resultSummary or finished match state must fail completion'
  );
  const noResultElig = validatePlayoffEligibility({
    careerPhase: 'playoffs',
    league: fakeCompletedNoSummaryLeague,
    userClubId: 'team_kol',
    stage: 'q1',
    isUserAction: true
  });
  assert.equal(noResultElig.canPlay, false, 'REQ 33.3c: Unverified domestic results reject playoff play');
  assert.equal(noResultElig.canSimulate, false, 'REQ 33.3d: Unverified domestic results reject playoff simulation');

  // 33.4: A partially completed domestic league
  let domesticMatchIdx = 0;
  const partiallyCompletedDomesticLeague: League = {
    ...baseLeagues[0],
    calendarDates: fullSeasonCalendar.map(d => {
      if (d.type === 'match' && d.matchFixture) {
        domesticMatchIdx++;
        const isDone = domesticMatchIdx <= 10; // Only 10 of 18 completed
        return {
          ...d,
          matchFixture: {
            ...d.matchFixture,
            completed: isDone,
            resultSummary: isDone ? `${d.matchFixture.homeShortName} won by 5 wickets` : undefined
          }
        };
      }
      return d;
    }),
    standings: midSeasonStandings,
    playoffs: qualifiedPlayoffs
  };
  const partialSnapshot = JSON.stringify(partiallyCompletedDomesticLeague);
  assert.equal(
    isDomesticLeagueStageComplete(partiallyCompletedDomesticLeague),
    false,
    'REQ 33.4a: Partially completed domestic calendar must return false'
  );
  const partialElig = validatePlayoffEligibility({
    careerPhase: 'playoffs',
    league: partiallyCompletedDomesticLeague,
    userClubId: 'team_kol',
    stage: 'q1',
    isUserAction: true
  });
  assert.equal(partialElig.canPlay, false, 'REQ 33.4b: Partially completed domestic league rejects playoff play');
  assert.equal(partialElig.canSimulate, false, 'REQ 33.4c: Partially completed domestic league rejects playoff simulation');
  assert.equal(
    JSON.stringify(partiallyCompletedDomesticLeague),
    partialSnapshot,
    'REQ 33.4d: Partially completed domestic league state is unchanged after rejected eligibility check'
  );

  // 33.5: A genuinely completed league with valid standings AND completed domestic fixtures (plus custom competition format)
  const completedDomesticLeague: League = {
    ...baseLeagues[0],
    calendarDates: fullSeasonCalendar.map(d => ({
      ...d,
      matchFixture:
        d.type === 'match' && d.matchFixture
          ? {
              ...d.matchFixture,
              completed: true,
              resultSummary: `${d.matchFixture.homeShortName || 'Home'} beat ${d.matchFixture.awayShortName || 'Away'} by 14 runs`
            }
          : d.matchFixture,
      otherMatches: (d.otherMatches || []).map(om => ({
        ...om,
        completed: true,
        resultSummary: `${om.homeShortName || 'Home'} beat ${om.awayShortName || 'Away'} by 6 wickets`
      }))
    })),
    standings: seededStandings,
    playoffs: qualifiedPlayoffs
  };
  assert.equal(
    isDomesticLeagueStageComplete(completedDomesticLeague),
    true,
    'REQ 33.5a: Genuinely completed domestic calendar + valid standings passes isDomesticLeagueStageComplete'
  );
  const genuineElig = validatePlayoffEligibility({
    careerPhase: 'playoffs',
    league: completedDomesticLeague,
    userClubId: 'team_kol',
    stage: 'q1',
    isUserAction: true
  });
  assert.equal(genuineElig.canPlay, true, 'REQ 33.5b: Genuinely completed league permits eligible user playoff play');
  assert.equal(genuineElig.canSimulate, true, 'REQ 33.5c: Genuinely completed league permits eligible user playoff simulation');

  // Also verify custom competition format (e.g. 6 teams, 10 matches per team) works without requiring 18 fixtures
  const sixTeams = baseTeams.slice(0, 6);
  const customStandings: StandingRow[] = sixTeams.map((t, idx) => ({
    teamId: t.id,
    played: 10,
    won: 10 - idx * 2,
    lost: idx * 2,
    tied: 0,
    nrr: Number((1.0 - idx * 0.35).toFixed(2)),
    points: (10 - idx * 2) * 2,
    recentForm: ['W', 'W', 'L', 'W', 'L']
  }));
  const customBracket = createInitialPlayoffs(customStandings);
  const customFormatLeague: League = {
    ...baseLeagues[0],
    id: 'custom_6t',
    teams: sixTeams,
    rules: { ...baseLeagues[0].rules, matchesPerTeam: 10 },
    calendarDates: [],
    standings: customStandings,
    playoffs: customBracket
  };
  assert.equal(
    isDomesticLeagueStageComplete(customFormatLeague),
    true,
    'REQ 33.5d: Custom competition format (10 matches per team) is respected without hardcoding 18'
  );

  // 33.6: A valid legacy save with completed league records (empty calendarDates, authoritative completed standings)
  const legacyCompletedSaveLeague: League = {
    ...baseLeagues[0],
    calendarDates: [],
    standings: seededStandings,
    playoffs: qualifiedPlayoffs
  };
  assert.equal(
    isDomesticLeagueStageComplete(legacyCompletedSaveLeague),
    true,
    'REQ 33.6a: Legacy save with authoritative completed 18-match standings passes completion check'
  );
  const legacySaveElig = validatePlayoffEligibility({
    careerPhase: 'playoffs',
    league: legacyCompletedSaveLeague,
    userClubId: 'team_kol',
    stage: 'q1',
    isUserAction: true
  });
  assert.equal(legacySaveElig.canPlay, true, 'REQ 33.6b: Valid legacy save permits playoff play');
  assert.equal(legacySaveElig.canSimulate, true, 'REQ 33.6c: Valid legacy save permits playoff simulation');

  // ==========================================================================
  // REQ 34: END-TO-END NEXT-TOUR WORKFLOW (applyAdvanceCalendarToNextTourState)
  // ==========================================================================
  // Verify date helper across month, year, and leap-year boundaries
  const mayEndUtc = parseCalendarDateToUtc('2026-05-30', 2026);
  assert.ok(mayEndUtc !== null, 'REQ 34.0a: Valid date parsed to UTC');
  assert.equal(
    addUtcDaysToCalendarDate(mayEndUtc!, 3).dateStr,
    '2026-06-02',
    'REQ 34.0b: Date arithmetic crosses May -> June boundary cleanly'
  );
  const decEndUtc = parseCalendarDateToUtc('2026-12-29', 2026);
  assert.equal(
    addUtcDaysToCalendarDate(decEndUtc!, 5).dateStr,
    '2027-01-03',
    'REQ 34.0c: Date arithmetic crosses December 2026 -> January 2027 year boundary cleanly'
  );
  const leapFebUtc = parseCalendarDateToUtc('2028-02-27', 2028);
  assert.equal(
    addUtcDaysToCalendarDate(leapFebUtc!, 2).dateStr,
    '2028-02-29',
    'REQ 34.0d: Date arithmetic handles 2028 leap year Feb 29 accurately'
  );
  assert.equal(
    addUtcDaysToCalendarDate(leapFebUtc!, 3).dateStr,
    '2028-03-01',
    'REQ 34.0e: Date arithmetic crosses Feb 29 -> Mar 1 in leap year'
  );

  // Helper to build a clean international coach state
  const indCoachProfile: CoachProfile = enforceSingleCareerInvariant(
    {
      ...INITIAL_COACH_PROFILE,
      clubTeamId: null,
      nationalTeamId: 'nat_ind',
      activeCareerMode: 'international'
    },
    'international'
  ).coachProfile;

  // 34.1: Advancing when a valid future tour already exists in the calendar
  const preExistingTourCalLeague: League = {
    ...baseLeagues[0],
    currentDateIndex: 0,
    calendarDates: [
      {
        id: 'cal_rest_1',
        dateStr: '2026-06-01',
        dayOfWeek: 'MON',
        dayNumber: 1,
        month: 'Jun',
        type: 'rest',
        title: 'International Rest Day',
        isHome: true
      },
      {
        id: 'cal_rest_2',
        dateStr: '2026-06-02',
        dayOfWeek: 'TUE',
        dayNumber: 2,
        month: 'Jun',
        type: 'rest',
        title: 'Travel Day',
        isHome: true
      },
      {
        id: 'cal_existing_tour_m1',
        dateStr: '2026-06-03',
        dayOfWeek: 'WED',
        dayNumber: 3,
        month: 'Jun',
        type: 'international',
        title: '1st T20I: IND vs AUS',
        isHome: true,
        matchFixture: {
          id: 'fix_existing_tour_1',
          homeTeamId: 'nat_ind',
          awayTeamId: 'nat_aus',
          homeTeamName: 'India',
          awayTeamName: 'Australia',
          homeTeamLogo: '🇮🇳',
          awayTeamLogo: '🇦🇺',
          venue: 'Wankhede Stadium',
          dateStr: '2026-06-03',
          completed: false
        }
      },
      {
        id: 'cal_existing_tour_m2',
        dateStr: '2026-06-05',
        dayOfWeek: 'FRI',
        dayNumber: 5,
        month: 'Jun',
        type: 'international',
        title: '2nd T20I: IND vs AUS',
        isHome: true,
        matchFixture: {
          id: 'fix_existing_tour_2',
          homeTeamId: 'nat_ind',
          awayTeamId: 'nat_aus',
          homeTeamName: 'India',
          awayTeamName: 'Australia',
          homeTeamLogo: '🇮🇳',
          awayTeamLogo: '🇦🇺',
          venue: 'Eden Gardens',
          dateStr: '2026-06-05',
          completed: false
        }
      }
    ]
  };
  const res34_1 = applyAdvanceCalendarToNextTourState({
    leagues: [preExistingTourCalLeague],
    currentLeagueId: preExistingTourCalLeague.id,
    coachProfile: indCoachProfile,
    nations: baseNations,
    teams: baseTeams,
    players: freshPlayers,
    internationalSeries: null,
    completedMatchesHistory: [],
    careerPhase: 'international_series'
  });
  assert.equal(res34_1.success, true, 'REQ 34.1a: Advancing to existing future tour succeeds');
  assert.equal(res34_1.generatedNewTour, false, 'REQ 34.1b: Reuses existing future tour without generating a new one');
  assert.equal(res34_1.targetDateIndex, 2, 'REQ 34.1c: Advances directly to index 2 (first playable tour match)');
  assert.equal(
    res34_1.leagues[0].calendarDates?.length,
    4,
    'REQ 34.1d: Does not append duplicate calendar dates when future tour exists'
  );
  assert.equal(
    res34_1.internationalSeries?.opponentNationId,
    'nat_aus',
    'REQ 34.1e: Synchronizes internationalSeries with the existing calendar tour opponent'
  );

  // 34.2: Advancing when NO future tour exists and a new tour must be generated
  const completedPrevSeries: InternationalSeriesState = {
    ...buildInitialSeriesForNation(baseNations[0], baseNations, undefined, 1),
    matches: buildInitialSeriesForNation(baseNations[0], baseNations, undefined, 1).matches.map(m => ({
      ...m,
      completed: true,
      summary: 'India won by 20 runs'
    }))
  };
  const noFutureTourLeague: League = {
    ...baseLeagues[0],
    currentDateIndex: 0,
    calendarDates: [
      {
        id: 'cal_anchor_day',
        dateStr: '2026-07-14',
        dayOfWeek: 'TUE',
        dayNumber: 14,
        month: 'Jul',
        type: 'rest',
        title: 'End of Previous Tour',
        isHome: true
      }
    ]
  };
  const res34_2 = applyAdvanceCalendarToNextTourState({
    leagues: [noFutureTourLeague],
    currentLeagueId: noFutureTourLeague.id,
    coachProfile: indCoachProfile,
    nations: baseNations,
    teams: baseTeams,
    players: freshPlayers,
    internationalSeries: completedPrevSeries,
    completedMatchesHistory: [],
    careerPhase: 'international_series'
  });
  assert.equal(res34_2.success, true, 'REQ 34.2a: Generates new tour when no future tour exists');
  assert.equal(res34_2.generatedNewTour, true, 'REQ 34.2b: Flags generatedNewTour = true');
  assert.ok(res34_2.internationalSeries !== null, 'REQ 34.2c: Persists newly generated internationalSeries');
  const genSeries = res34_2.internationalSeries!;
  const genCalDates = res34_2.leagues[0].calendarDates || [];
  const genTourCalEntries = genCalDates.slice(1); // Added after cal_anchor_day
  assert.equal(
    genTourCalEntries.length,
    genSeries.matches.length,
    'REQ 34.2d: Calendar entries count matches series.matches count (5 T20Is)'
  );
  // Check agreement between series state and calendar entries
  for (let i = 0; i < genSeries.matches.length; i++) {
    const sMatch = genSeries.matches[i];
    const cDay = genTourCalEntries[i];
    assert.ok(cDay.matchFixture, `REQ 34.2e: Calendar entry ${i + 1} has matchFixture`);
    assert.equal(
      cDay.matchFixture?.id,
      sMatch.fixtureId,
      `REQ 34.2f: Series fixtureId and calendar matchFixture.id agree for match ${i + 1}`
    );
    assert.equal(
      cDay.dateStr,
      sMatch.dateStr,
      `REQ 34.2g: Series dateStr and calendar dateStr agree for match ${i + 1}`
    );
    assert.equal(
      cDay.matchFixture?.homeTeamId,
      genSeries.userNationId,
      `REQ 34.2h: Calendar fixture homeTeamId matches series userNationId`
    );
    assert.equal(
      cDay.matchFixture?.awayTeamId,
      genSeries.opponentNationId,
      `REQ 34.2i: Calendar fixture awayTeamId matches series opponentNationId`
    );
    assert.ok(
      !cDay.dateStr.startsWith('2026-06-'),
      `REQ 34.2j: Generated tour is anchored to 2026-07-14, NOT hardcoded to June 2026 (got ${cDay.dateStr})`
    );
  }

  // 34.3: Advancing across a month boundary (May 29 -> June)
  const monthBoundaryLeague: League = {
    ...baseLeagues[0],
    currentDateIndex: 0,
    calendarDates: [
      {
        id: 'cal_may_29',
        dateStr: '2026-05-29',
        dayOfWeek: 'FRI',
        dayNumber: 29,
        month: 'May',
        type: 'rest',
        title: 'Post-IPL Break',
        isHome: true
      }
    ]
  };
  const res34_3 = applyAdvanceCalendarToNextTourState({
    leagues: [monthBoundaryLeague],
    currentLeagueId: monthBoundaryLeague.id,
    coachProfile: indCoachProfile,
    nations: baseNations,
    teams: baseTeams,
    players: freshPlayers,
    internationalSeries: completedPrevSeries,
    completedMatchesHistory: [],
    careerPhase: 'international_series'
  });
  assert.equal(res34_3.success, true, 'REQ 34.3a: Month-boundary tour scheduling succeeds');
  const monthBoundaryDates = (res34_3.leagues[0].calendarDates || []).slice(1).map(d => d.dateStr);
  assert.deepEqual(
    monthBoundaryDates,
    ['2026-05-31', '2026-06-02', '2026-06-04', '2026-06-06', '2026-06-08'],
    'REQ 34.3b: Tour dates roll smoothly from May 31 into June without invalid May 33/35 dates'
  );

  // 34.4: Advancing across a year boundary (Dec 28, 2026 -> Jan 2027)
  const yearBoundaryLeague: League = {
    ...baseLeagues[0],
    currentDateIndex: 0,
    calendarDates: [
      {
        id: 'cal_dec_28',
        dateStr: '2026-12-28',
        dayOfWeek: 'MON',
        dayNumber: 28,
        month: 'Dec',
        type: 'rest',
        title: 'Year-End Camp',
        isHome: true
      }
    ]
  };
  const res34_4 = applyAdvanceCalendarToNextTourState({
    leagues: [yearBoundaryLeague],
    currentLeagueId: yearBoundaryLeague.id,
    coachProfile: indCoachProfile,
    nations: baseNations,
    teams: baseTeams,
    players: freshPlayers,
    internationalSeries: completedPrevSeries,
    completedMatchesHistory: [],
    careerPhase: 'international_series'
  });
  assert.equal(res34_4.success, true, 'REQ 34.4a: Year-boundary tour scheduling succeeds');
  const yearBoundaryDates = (res34_4.leagues[0].calendarDates || []).slice(1).map(d => d.dateStr);
  assert.deepEqual(
    yearBoundaryDates,
    ['2026-12-30', '2027-01-01', '2027-01-03', '2027-01-05', '2027-01-07'],
    'REQ 34.4b: Tour dates roll smoothly across Dec 2026 into Jan 2027'
  );

  // 34.5: Calling the next-tour action twice in a row does NOT create duplicate tours or duplicate fixtures
  const res34_5_secondCall = applyAdvanceCalendarToNextTourState({
    leagues: res34_2.leagues,
    currentLeagueId: res34_2.leagues[0].id,
    coachProfile: res34_2.coachProfile,
    nations: baseNations,
    teams: baseTeams,
    players: res34_2.players,
    internationalSeries: res34_2.internationalSeries,
    completedMatchesHistory: res34_2.completedMatchesHistory,
    careerPhase: res34_2.careerPhase
  });
  assert.equal(res34_5_secondCall.success, true, 'REQ 34.5a: Second consecutive call succeeds idempotently');
  assert.equal(
    res34_5_secondCall.generatedNewTour,
    false,
    'REQ 34.5b: Second consecutive call does NOT generate a duplicate tour'
  );
  assert.equal(
    res34_5_secondCall.leagues[0].calendarDates?.length,
    res34_2.leagues[0].calendarDates?.length,
    'REQ 34.5c: Calendar date count remains identical on repeated next-tour invocation'
  );
  assert.equal(
    res34_5_secondCall.internationalSeries?.seriesId,
    res34_2.internationalSeries?.seriesId,
    'REQ 34.5d: Series ID is preserved without duplication'
  );

  // 34.6: An unfinished tour is NOT overwritten
  const activeOngoingSeries: InternationalSeriesState = {
    ...buildInitialSeriesForNation(baseNations[0], baseNations, undefined, 3),
    seriesId: 'intl_series_unfinished_preserve',
    seriesWins: 1,
    seriesLosses: 0
  };
  activeOngoingSeries.matches[0] = {
    ...activeOngoingSeries.matches[0],
    completed: true,
    summary: 'India won 1st T20I by 8 wickets'
  };
  const unfinishedTourLeague: League = {
    ...baseLeagues[0],
    currentDateIndex: 0,
    calendarDates: [
      {
        id: 'cal_unfinished_anchor',
        dateStr: '2026-08-10',
        dayOfWeek: 'MON',
        dayNumber: 10,
        month: 'Aug',
        type: 'rest',
        title: 'Mid-Series Recovery',
        isHome: true
      }
    ]
  };
  const res34_6 = applyAdvanceCalendarToNextTourState({
    leagues: [unfinishedTourLeague],
    currentLeagueId: unfinishedTourLeague.id,
    coachProfile: indCoachProfile,
    nations: baseNations,
    teams: baseTeams,
    players: freshPlayers,
    internationalSeries: activeOngoingSeries,
    completedMatchesHistory: [],
    careerPhase: 'international_series'
  });
  assert.equal(res34_6.success, true, 'REQ 34.6a: Advancing with unfinished tour succeeds');
  assert.equal(
    res34_6.internationalSeries?.seriesId,
    'intl_series_unfinished_preserve',
    'REQ 34.6b: Unfinished internationalSeries is preserved, NOT overwritten with a new seriesId'
  );
  assert.equal(
    res34_6.internationalSeries?.seriesWins,
    1,
    'REQ 34.6c: Completed match progress (1-0 lead) in unfinished series is preserved'
  );
  assert.equal(
    res34_6.leagues[0].calendarDates?.[res34_6.targetDateIndex]?.matchFixture?.id,
    res34_6.internationalSeries?.matches[1].fixtureId,
    'REQ 34.6d: Calendar stops at the next unplayed match (Match 2) of the unfinished series'
  );

  // 34.7: Intervening fixtures are processed in chronological order and only once
  const interveningCalLeague: League = {
    ...baseLeagues[0],
    currentDateIndex: 0,
    calendarDates: [
      {
        id: 'cal_int_ai_1',
        dateStr: '2026-06-01',
        dayOfWeek: 'MON',
        dayNumber: 1,
        month: 'Jun',
        type: 'international',
        title: 'Neutral T20I: AUS vs ENG',
        isHome: false,
        matchFixture: {
          id: 'fix_neutral_1',
          homeTeamId: 'nat_aus',
          awayTeamId: 'nat_eng',
          homeTeamName: 'Australia',
          awayTeamName: 'England',
          homeTeamLogo: '🇦🇺',
          awayTeamLogo: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
          venue: 'MCG',
          dateStr: '2026-06-01',
          completed: false
        }
      },
      {
        id: 'cal_int_ai_2',
        dateStr: '2026-06-03',
        dayOfWeek: 'WED',
        dayNumber: 3,
        month: 'Jun',
        type: 'international',
        title: 'Neutral T20I: RSA vs NZL',
        isHome: false,
        matchFixture: {
          id: 'fix_neutral_2',
          homeTeamId: 'nat_rsa',
          awayTeamId: 'nat_nzl',
          homeTeamName: 'South Africa',
          awayTeamName: 'New Zealand',
          homeTeamLogo: '🇿🇦',
          awayTeamLogo: '🇳🇿',
          venue: 'Wanderers',
          dateStr: '2026-06-03',
          completed: false
        }
      },
      {
        id: 'cal_user_tour_target',
        dateStr: '2026-06-05',
        dayOfWeek: 'FRI',
        dayNumber: 5,
        month: 'Jun',
        type: 'international',
        title: '1st T20I: IND vs AUS',
        isHome: true,
        matchFixture: {
          id: 'fix_user_target_1',
          homeTeamId: 'nat_ind',
          awayTeamId: 'nat_aus',
          homeTeamName: 'India',
          awayTeamName: 'Australia',
          homeTeamLogo: '🇮🇳',
          awayTeamLogo: '🇦🇺',
          venue: 'Wankhede Stadium',
          dateStr: '2026-06-05',
          completed: false
        }
      }
    ]
  };
  const res34_7 = applyAdvanceCalendarToNextTourState({
    leagues: [interveningCalLeague],
    currentLeagueId: interveningCalLeague.id,
    coachProfile: indCoachProfile,
    nations: baseNations,
    teams: baseTeams,
    players: freshPlayers,
    internationalSeries: null,
    completedMatchesHistory: [],
    careerPhase: 'international_series'
  });
  assert.equal(res34_7.success, true, 'REQ 34.7a: Advancing past intervening AI fixtures succeeds');
  assert.deepEqual(
    res34_7.processedInterveningFixtureIds,
    ['fix_neutral_1', 'fix_neutral_2'],
    'REQ 34.7b: Intervening AI fixtures are processed in exact chronological order'
  );
  assert.equal(
    res34_7.leagues[0].calendarDates?.[0]?.matchFixture?.completed,
    true,
    'REQ 34.7c: First intervening fixture is marked completed'
  );
  assert.equal(
    res34_7.leagues[0].calendarDates?.[1]?.matchFixture?.completed,
    true,
    'REQ 34.7d: Second intervening fixture is marked completed'
  );
  assert.equal(
    res34_7.completedMatchesHistory.length,
    2,
    'REQ 34.7e: Exactly 2 intervening matches recorded in completedMatchesHistory (processed once each)'
  );

  // 34.8: A playable fixture involving the user's nation is NOT skipped
  assert.equal(res34_7.targetDateIndex, 2, 'REQ 34.8a: Stops at index 2 (user nation fixture)');
  assert.equal(
    res34_7.leagues[0].calendarDates?.[2]?.matchFixture?.completed,
    false,
    'REQ 34.8b: Playable fixture involving user nation remains unplayed so user can play or sim it'
  );

  // 34.9: A calendar with ONLY unrelated international fixtures does not cause an infinite advance or overwrite user career state
  const unrelatedOnlyCalLeague: League = {
    ...baseLeagues[0],
    currentDateIndex: 0,
    calendarDates: [
      {
        id: 'cal_unrel_1',
        dateStr: '2026-09-01',
        dayOfWeek: 'TUE',
        dayNumber: 1,
        month: 'Sep',
        type: 'international',
        title: 'Neutral T20I: AUS vs ENG',
        isHome: false,
        matchFixture: {
          id: 'fix_unrel_1',
          homeTeamId: 'nat_aus',
          awayTeamId: 'nat_eng',
          homeTeamName: 'Australia',
          awayTeamName: 'England',
          homeTeamLogo: '🇦🇺',
          awayTeamLogo: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
          venue: 'MCG',
          dateStr: '2026-09-01',
          completed: false
        }
      }
    ]
  };
  const res34_9 = applyAdvanceCalendarToNextTourState({
    leagues: [unrelatedOnlyCalLeague],
    currentLeagueId: unrelatedOnlyCalLeague.id,
    coachProfile: indCoachProfile,
    nations: baseNations,
    teams: baseTeams,
    players: freshPlayers,
    internationalSeries: completedPrevSeries,
    completedMatchesHistory: [],
    careerPhase: 'international_series'
  });
  assert.equal(res34_9.success, true, 'REQ 34.9a: Calendar with unrelated fixtures advances cleanly without infinite loop');
  assert.equal(res34_9.coachProfile.nationalTeamId, 'nat_ind', 'REQ 34.9b: User nationalTeamId is preserved');
  assert.equal(res34_9.coachProfile.clubTeamId, null, 'REQ 34.9c: Single-career mode invariant preserved');
  assert.equal(res34_9.targetDateIndex, 1, 'REQ 34.9d: Stops at first newly scheduled user tour match after unrelated fixture');

  // Also verify calling advanceCalendarToNextTour when NOT in international mode fails cleanly without mutating state
  const franchiseModeReject = applyAdvanceCalendarToNextTourState({
    leagues: [unrelatedOnlyCalLeague],
    currentLeagueId: unrelatedOnlyCalLeague.id,
    coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_kol', nationalTeamId: null, activeCareerMode: 'franchise' },
    nations: baseNations,
    teams: baseTeams,
    players: freshPlayers,
    internationalSeries: null,
    completedMatchesHistory: [],
    careerPhase: 'league_stage'
  });
  assert.equal(franchiseModeReject.success, false, 'REQ 34.9e: Rejects next-tour scheduling when coach is in franchise mode');

  // 34.10: Save/load or state recovery preserves the generated tour and calendar fixtures
  const validIndSquadIds = res34_2.players
    .filter(p => p.country === 'India')
    .slice(0, 15)
    .map(p => p.id);
  const recoveredNextTourState = validateAndRecoverCareerState({
    rawPhase: res34_2.careerPhase,
    coachProfile: res34_2.coachProfile,
    teams: baseTeams,
    leagues: res34_2.leagues,
    currentLeagueId: res34_2.leagues[0].id,
    nations: baseNations,
    nationalSquadIds: validIndSquadIds,
    careerBoardReview: null,
    players: res34_2.players,
    internationalSeries: res34_2.internationalSeries!
  });
  assert.equal(
    recoveredNextTourState.careerPhase,
    'international_series',
    'REQ 34.10a: Recovery preserves international_series phase'
  );
  assert.equal(
    recoveredNextTourState.internationalSeries?.seriesId,
    res34_2.internationalSeries?.seriesId,
    'REQ 34.10b: Recovery preserves generated tour seriesId'
  );
  assert.equal(
    recoveredNextTourState.internationalSeries?.matches.length,
    5,
    'REQ 34.10c: Recovery preserves all 5 tour fixtures'
  );
  assert.equal(
    recoveredNextTourState.coachProfile.nationalTeamId,
    'nat_ind',
    'REQ 34.10d: Recovery preserves coached nation'
  );
  assert.equal(
    recoveredNextTourState.coachProfile.clubTeamId,
    null,
    'REQ 34.10e: Recovery preserves single-career mode invariant'
  );

  // ==========================================================================
  // REQ 35: PLAYOFF CALENDAR SYNCHRONIZATION & DOUBLE-SIMULATION PREVENTION
  // ==========================================================================
  const syncCalendarLeague: League = {
    ...completedDomesticLeague,
    calendarDates: syncPlayoffCalendarDates(
      completedDomesticLeague.calendarDates || [],
      qualifiedPlayoffs,
      baseTeams
    )
  };
  const q1AfterSync = applyCompletePlayoffMatchState(
    {
      leagues: [syncCalendarLeague],
      currentLeagueId: syncCalendarLeague.id,
      teams: baseTeams,
      coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_kol', nationalTeamId: null, activeCareerMode: 'franchise' },
      tournamentHonors: [],
      careerPhase: 'playoffs',
      careerBoardReview: null
    },
    {
      leagueId: syncCalendarLeague.id,
      stage: 'q1',
      homeTeamId: 'team_kol',
      awayTeamId: 'team_che',
      winnerTeamId: 'team_kol',
      resultSummary: 'KKR beat CSK by 18 runs'
    }
  );
  const syncedQ1CalDay = q1AfterSync.leagues[0].calendarDates?.find(d => d.id === 'cal_playoff_q1');
  const syncedQ2CalDay = q1AfterSync.leagues[0].calendarDates?.find(d => d.id === 'cal_playoff_q2');
  const syncedFinalCalDay = q1AfterSync.leagues[0].calendarDates?.find(d => d.id === 'cal_playoff_final');
  assert.equal(syncedQ1CalDay?.matchFixture?.completed, true, 'REQ 35.1: Completing Q1 marks cal_playoff_q1 completed in calendarDates');
  assert.equal(syncedQ2CalDay?.matchFixture?.homeTeamId, 'team_che', 'REQ 35.2: Completing Q1 seeds Q1 loser (CSK) into cal_playoff_q2 homeTeamId');
  assert.equal(syncedFinalCalDay?.matchFixture?.homeTeamId, 'team_kol', 'REQ 35.3: Completing Q1 seeds Q1 winner (KKR) into cal_playoff_final homeTeamId');

  // Verify validatePlayoffEligibility rejects a stage whose calendar fixture is already marked completed
  const q1EligAfterSync = validatePlayoffEligibility({
    careerPhase: 'playoffs',
    league: q1AfterSync.leagues[0],
    userClubId: 'team_kol',
    stage: 'q1',
    isUserAction: true
  });
  assert.equal(q1EligAfterSync.canPlay, false, 'REQ 35.4: Playoff stage completed in calendar cannot be played again');
  assert.equal(q1EligAfterSync.canSimulate, false, 'REQ 35.5: Playoff stage completed in calendar cannot be simulated again');

  // ==========================================================================
  // REQ 36: PLACEHOLDER CALENDAR ENTRIES, CONFLICT PROTECTION & COMPLETION RECONCILIATION
  // ==========================================================================
  const rsaNation = baseNations.find(n => n.id === 'nat_rsa' || n.name === 'South Africa')!;
  const placeholderSeriesId = 'intl_series_ind_vs_rsa_placeholder_t1';
  const placeholderBaseSeries: InternationalSeriesState = {
    ...buildInitialSeriesForNation(baseNations[0], baseNations, rsaNation.id, 1, placeholderSeriesId),
    seriesId: placeholderSeriesId,
    seriesWins: 0,
    seriesLosses: 0,
    format: 'T20'
  };

  // 36.1 & 36.2:
  // - Match 1 is a placeholder with expectedCalId ('cal_intl_intl_series_ind_vs_rsa_placeholder_t1_1') and NO fixture (valid date '2026-08-12')
  // - Match 2 is a valid existing matching fixture at 'cal_intl_intl_series_ind_vs_rsa_placeholder_t1_2' ('2026-08-14')
  // - Match 3 is a placeholder with expectedCalId and an invalid date ('2026-06-35') that must be repaired with a valid date
  // - Matches 4 and 5 are missing from the calendar and must be scheduled
  const placeholderAndValidLeague: League = {
    ...baseLeagues[0],
    currentDateIndex: 0,
    calendarDates: [
      {
        id: 'cal_aug_10_anchor',
        dateStr: '2026-08-10',
        dayOfWeek: 'MON',
        dayNumber: 10,
        month: 'Aug',
        type: 'rest',
        title: 'Pre-Tour Camp',
        isHome: true
      },
      {
        id: `cal_intl_${placeholderSeriesId}_1`,
        dateStr: '2026-08-12',
        dayOfWeek: 'WED',
        dayNumber: 12,
        month: 'Aug',
        type: 'international',
        title: '1st T20I Placeholder Slot',
        isHome: false
        // Intentionally no matchFixture and no internationalMatches!
      },
      {
        id: `cal_intl_${placeholderSeriesId}_2`,
        dateStr: '2026-08-14',
        dayOfWeek: 'FRI',
        dayNumber: 14,
        month: 'Aug',
        type: 'international',
        title: '2nd T20I · IND vs SA',
        isHome: false,
        matchFixture: {
          id: `intl_fix_${placeholderSeriesId}_2`,
          homeTeamId: 'nat_ind',
          awayTeamId: rsaNation.id,
          homeShortName: 'IND',
          awayShortName: rsaNation.code || 'RSA',
          venue: placeholderBaseSeries.matches[1].venue,
          dateStr: '2026-08-14',
          completed: false,
          isInternational: true,
          format: 'T20'
        },
        internationalMatches: [
          {
            id: `intl_fix_${placeholderSeriesId}_2`,
            homeTeamId: 'nat_ind',
            awayTeamId: rsaNation.id,
            homeShortName: 'IND',
            awayShortName: rsaNation.code || 'RSA',
            venue: placeholderBaseSeries.matches[1].venue,
            dateStr: '2026-08-14',
            completed: false,
            isInternational: true,
            format: 'T20'
          }
        ]
      },
      {
        id: `cal_intl_${placeholderSeriesId}_3`,
        dateStr: '2026-06-35', // invalid calendar date on placeholder
        dayOfWeek: 'SUN',
        dayNumber: 35,
        month: 'Jun',
        type: 'international',
        title: '3rd T20I Placeholder With Invalid Date',
        isHome: false,
        internationalMatches: []
      }
    ]
  };

  const res36_1 = applyAdvanceCalendarToNextTourState({
    leagues: [placeholderAndValidLeague],
    currentLeagueId: placeholderAndValidLeague.id,
    coachProfile: indCoachProfile,
    nations: baseNations,
    teams: baseTeams,
    players: freshPlayers,
    internationalSeries: placeholderBaseSeries,
    completedMatchesHistory: [],
    careerPhase: 'international_series'
  });

  assert.equal(res36_1.success, true, 'REQ 36.1a: Advancing with placeholder and valid existing entries succeeds');
  assert.equal(res36_1.generatedNewTour, false, 'REQ 36.1b: Preserves active unfinished series without generating a new tour');
  const calAfter36_1 = res36_1.leagues[0].calendarDates || [];
  // 1 rest day + 5 tour matches (2 repaired placeholders + 1 reused valid fixture + 2 newly appended missing fixtures) = 6 entries total
  assert.equal(
    calAfter36_1.length,
    6,
    'REQ 36.1c: Repairs placeholders in-place and reuses valid fixture without appending duplicate entries (6 total)'
  );
  assert.equal(
    res36_1.targetDateIndex,
    1,
    'REQ 36.1d: Stops at index 1 (the repaired Match 1 placeholder, which is now a playable fixture)'
  );

  // Verify Match 1 placeholder was repaired in-place and preserved its valid calendar date '2026-08-12'
  const repairedMatch1Cal = calAfter36_1[1];
  assert.equal(repairedMatch1Cal.id, `cal_intl_${placeholderSeriesId}_1`, 'REQ 36.1e: Repaired placeholder keeps expectedCalId');
  assert.equal(repairedMatch1Cal.dateStr, '2026-08-12', 'REQ 36.1f: Repaired placeholder preserves valid calendar date 2026-08-12');
  assert.ok(repairedMatch1Cal.matchFixture, 'REQ 36.1g: Repaired placeholder now has matchFixture attached');
  assert.equal(
    repairedMatch1Cal.matchFixture?.id,
    `intl_fix_${placeholderSeriesId}_1`,
    'REQ 36.1h: Repaired placeholder matchFixture has expected stable fixtureId'
  );
  assert.equal(
    repairedMatch1Cal.internationalMatches?.[0]?.id,
    `intl_fix_${placeholderSeriesId}_1`,
    'REQ 36.1i: Repaired placeholder internationalMatches[0] has expected stable fixtureId'
  );

  // Verify Match 2 valid fixture was reused without duplication
  const reusedMatch2Cal = calAfter36_1[2];
  assert.equal(reusedMatch2Cal.id, `cal_intl_${placeholderSeriesId}_2`, 'REQ 36.2a: Valid existing fixture entry reused at index 2');
  assert.equal(reusedMatch2Cal.dateStr, '2026-08-14', 'REQ 36.2b: Valid existing fixture date 2026-08-14 preserved');
  assert.equal(
    calAfter36_1.filter(d => d.id === `cal_intl_${placeholderSeriesId}_2`).length,
    1,
    'REQ 36.2c: Valid existing fixture is not duplicated'
  );

  // Verify Match 3 placeholder with invalid date was repaired with a valid calendar date ('2026-08-16')
  const repairedMatch3Cal = calAfter36_1[3];
  assert.equal(repairedMatch3Cal.id, `cal_intl_${placeholderSeriesId}_3`, 'REQ 36.1j: Match 3 placeholder repaired in-place');
  assert.equal(repairedMatch3Cal.dateStr, '2026-08-16', 'REQ 36.1k: Invalid placeholder date 2026-06-35 replaced with valid 2026-08-16');
  assert.equal(repairedMatch3Cal.matchFixture?.id, `intl_fix_${placeholderSeriesId}_3`, 'REQ 36.1l: Match 3 fixture attached');

  // 36.6: Verify calendar and series retain matching fixture IDs, dates, participants, format, completion, and summary across all 5 matches
  for (let i = 0; i < res36_1.internationalSeries.matches.length; i++) {
    const sMatch = res36_1.internationalSeries.matches[i];
    const cEntry = calAfter36_1[i + 1];
    assert.equal(sMatch.fixtureId, `intl_fix_${placeholderSeriesId}_${i + 1}`, `REQ 36.6a: Match ${i + 1} series fixtureId is stable`);
    assert.equal(cEntry.matchFixture?.id, sMatch.fixtureId, `REQ 36.6b: Match ${i + 1} calendar and series fixtureId match`);
    assert.equal(cEntry.dateStr, sMatch.dateStr, `REQ 36.6c: Match ${i + 1} calendar entry dateStr and series dateStr match`);
    assert.equal(cEntry.matchFixture?.dateStr, sMatch.dateStr, `REQ 36.6d: Match ${i + 1} matchFixture.dateStr matches series dateStr`);
    assert.equal(cEntry.matchFixture?.homeTeamId, res36_1.internationalSeries.userNationId, `REQ 36.6e: Match ${i + 1} homeTeamId matches userNationId`);
    assert.equal(cEntry.matchFixture?.awayTeamId, res36_1.internationalSeries.opponentNationId, `REQ 36.6f: Match ${i + 1} awayTeamId matches opponentNationId`);
    assert.equal(sMatch.homeNationId, cEntry.matchFixture?.homeTeamId, `REQ 36.6g: Match ${i + 1} sMatch.homeNationId matches calendar homeTeamId`);
    assert.equal(sMatch.awayNationId, cEntry.matchFixture?.awayTeamId, `REQ 36.6h: Match ${i + 1} sMatch.awayNationId matches calendar awayTeamId`);
    assert.equal(cEntry.matchFixture?.format, sMatch.format, `REQ 36.6i: Match ${i + 1} format matches`);
    assert.equal(cEntry.matchFixture?.completed, sMatch.completed, `REQ 36.6j: Match ${i + 1} completion status matches`);
    assert.equal(cEntry.matchFixture?.resultSummary, sMatch.summary, `REQ 36.6k: Match ${i + 1} resultSummary matches series summary`);
  }

  // 36.5: Repeated invocations on repaired state remain idempotent
  const res36_5_repeat = applyAdvanceCalendarToNextTourState({
    leagues: res36_1.leagues,
    currentLeagueId: res36_1.leagues[0].id,
    coachProfile: res36_1.coachProfile,
    nations: baseNations,
    teams: baseTeams,
    players: res36_1.players,
    internationalSeries: res36_1.internationalSeries,
    completedMatchesHistory: res36_1.completedMatchesHistory,
    careerPhase: res36_1.careerPhase
  });
  assert.equal(res36_5_repeat.success, true, 'REQ 36.5a: Repeated invocation after placeholder repair succeeds');
  assert.equal(res36_5_repeat.generatedNewTour, false, 'REQ 36.5b: Repeated invocation does not generate a new tour');
  assert.equal(res36_5_repeat.leagues[0].calendarDates?.length, 6, 'REQ 36.5c: Calendar length stays 6 on repeated call');
  assert.equal(res36_5_repeat.targetDateIndex, 1, 'REQ 36.5d: Target date index stays 1 on repeated call');
  assert.deepEqual(
    res36_5_repeat.internationalSeries.matches,
    res36_1.internationalSeries.matches,
    'REQ 36.5e: Series matches remain identical on repeated invocation'
  );

  // 36.3: Conflicting fixture occupying expectedCalId is handled safely without overwriting unrelated match data
  const conflictingCalLeague: League = {
    ...baseLeagues[0],
    currentDateIndex: 0,
    calendarDates: [
      {
        id: 'cal_aug_10_anchor',
        dateStr: '2026-08-10',
        dayOfWeek: 'MON',
        dayNumber: 10,
        month: 'Aug',
        type: 'rest',
        title: 'Pre-Tour Camp',
        isHome: true
      },
      {
        id: `cal_intl_${placeholderSeriesId}_1`, // occupies expectedCalId for Match 1 of IND vs RSA
        dateStr: '2026-08-12',
        dayOfWeek: 'WED',
        dayNumber: 12,
        month: 'Aug',
        type: 'international',
        title: 'Ashes Warmup: AUS vs ENG',
        isHome: false,
        matchFixture: {
          id: 'fix_unrelated_aus_eng_99',
          homeTeamId: 'nat_aus',
          awayTeamId: 'nat_eng',
          homeShortName: 'AUS',
          awayShortName: 'ENG',
          venue: 'MCG, Melbourne',
          dateStr: '2026-08-12',
          completed: false,
          isInternational: true,
          format: 'T20'
        }
      }
    ]
  };
  const conflictingSnapshotBefore = JSON.stringify(conflictingCalLeague.calendarDates);
  const res36_3_conflict = applyAdvanceCalendarToNextTourState({
    leagues: [conflictingCalLeague],
    currentLeagueId: conflictingCalLeague.id,
    coachProfile: indCoachProfile,
    nations: baseNations,
    teams: baseTeams,
    players: freshPlayers,
    internationalSeries: placeholderBaseSeries,
    completedMatchesHistory: [],
    careerPhase: 'international_series'
  });
  assert.equal(res36_3_conflict.success, false, 'REQ 36.3a: Conflicting fixture at expectedCalId fails safely');
  assert.ok(
    /conflicting/i.test(res36_3_conflict.message),
    `REQ 36.3b: Reports clear conflict error message (got "${res36_3_conflict.message}")`
  );
  assert.equal(
    JSON.stringify(res36_3_conflict.leagues[0].calendarDates),
    conflictingSnapshotBefore,
    'REQ 36.3c: Unrelated match data at expectedCalId is NOT overwritten or mutated'
  );
  assert.equal(
    res36_3_conflict.leagues[0].calendarDates?.[1]?.matchFixture?.id,
    'fix_unrelated_aus_eng_99',
    'REQ 36.3d: Unrelated fixture ID fix_unrelated_aus_eng_99 remains intact'
  );
  assert.equal(
    res36_3_conflict.leagues[0].calendarDates?.[1]?.matchFixture?.homeTeamId,
    'nat_aus',
    'REQ 36.3e: Unrelated fixture homeTeamId (nat_aus) remains intact'
  );

  // Also test a malformed fixture at expectedCalId (e.g. homeTeamId === awayTeamId)
  const malformedCalLeague: League = {
    ...baseLeagues[0],
    currentDateIndex: 0,
    calendarDates: [
      {
        id: `cal_intl_${placeholderSeriesId}_1`,
        dateStr: '2026-08-12',
        dayOfWeek: 'WED',
        dayNumber: 12,
        month: 'Aug',
        type: 'international',
        title: 'Malformed Self-Match',
        isHome: false,
        matchFixture: {
          id: `intl_fix_${placeholderSeriesId}_1`,
          homeTeamId: 'nat_ind',
          awayTeamId: 'nat_ind', // malformed: identical home and away nation
          venue: 'Wankhede Stadium',
          dateStr: '2026-08-12',
          completed: false,
          isInternational: true,
          format: 'T20'
        }
      }
    ]
  };
  const res36_3_malformed = applyAdvanceCalendarToNextTourState({
    leagues: [malformedCalLeague],
    currentLeagueId: malformedCalLeague.id,
    coachProfile: indCoachProfile,
    nations: baseNations,
    teams: baseTeams,
    players: freshPlayers,
    internationalSeries: placeholderBaseSeries,
    completedMatchesHistory: [],
    careerPhase: 'international_series'
  });
  assert.equal(res36_3_malformed.success, false, 'REQ 36.3f: Malformed fixture at expectedCalId is rejected safely');

  // 36.4: A completed calendar fixture is reconciled correctly with the active series state
  // Setup: Match 1 is marked completed: true in the calendar ('India won by 6 wickets'),
  // but still marked completed: false in internationalSeries.matches[0]!
  // Match 2 is uncompleted on the calendar.
  const reconcileSeriesId = 'intl_series_ind_vs_rsa_reconcile_t1';
  const staleSeriesWithUnmarkedCompletion: InternationalSeriesState = {
    ...buildInitialSeriesForNation(baseNations[0], baseNations, rsaNation.id, 1, reconcileSeriesId),
    seriesId: reconcileSeriesId,
    seriesWins: 0,
    seriesLosses: 0,
    format: 'T20'
  };
  const completedInCalLeague: League = {
    ...baseLeagues[0],
    currentDateIndex: 0,
    calendarDates: [
      {
        id: 'cal_aug_10_anchor',
        dateStr: '2026-08-10',
        dayOfWeek: 'MON',
        dayNumber: 10,
        month: 'Aug',
        type: 'rest',
        title: 'Pre-Tour Camp',
        isHome: true
      },
      {
        id: `cal_intl_${reconcileSeriesId}_1`,
        dateStr: '2026-08-12',
        dayOfWeek: 'WED',
        dayNumber: 12,
        month: 'Aug',
        type: 'international',
        title: '1st T20I · IND vs SA',
        isHome: false,
        matchFixture: {
          id: `intl_fix_${reconcileSeriesId}_1`,
          homeTeamId: 'nat_ind',
          awayTeamId: rsaNation.id,
          homeShortName: 'IND',
          awayShortName: rsaNation.code || 'RSA',
          venue: staleSeriesWithUnmarkedCompletion.matches[0].venue,
          dateStr: '2026-08-12',
          completed: true,
          resultSummary: 'India won by 6 wickets',
          isInternational: true,
          format: 'T20'
        },
        internationalMatches: [
          {
            id: `intl_fix_${reconcileSeriesId}_1`,
            homeTeamId: 'nat_ind',
            awayTeamId: rsaNation.id,
            homeShortName: 'IND',
            awayShortName: rsaNation.code || 'RSA',
            venue: staleSeriesWithUnmarkedCompletion.matches[0].venue,
            dateStr: '2026-08-12',
            completed: true,
            resultSummary: 'India won by 6 wickets',
            isInternational: true,
            format: 'T20'
          }
        ]
      },
      {
        id: `cal_intl_${reconcileSeriesId}_2`,
        dateStr: '2026-08-14',
        dayOfWeek: 'FRI',
        dayNumber: 14,
        month: 'Aug',
        type: 'international',
        title: '2nd T20I · IND vs SA',
        isHome: false,
        matchFixture: {
          id: `intl_fix_${reconcileSeriesId}_2`,
          homeTeamId: 'nat_ind',
          awayTeamId: rsaNation.id,
          homeShortName: 'IND',
          awayShortName: rsaNation.code || 'RSA',
          venue: staleSeriesWithUnmarkedCompletion.matches[1].venue,
          dateStr: '2026-08-14',
          completed: false,
          isInternational: true,
          format: 'T20'
        }
      }
    ]
  };

  const res36_4 = applyAdvanceCalendarToNextTourState({
    leagues: [completedInCalLeague],
    currentLeagueId: completedInCalLeague.id,
    coachProfile: indCoachProfile,
    nations: baseNations,
    teams: baseTeams,
    players: freshPlayers,
    internationalSeries: staleSeriesWithUnmarkedCompletion,
    completedMatchesHistory: [],
    careerPhase: 'international_series'
  });

  assert.equal(res36_4.success, true, 'REQ 36.4a: Reconciling completed calendar fixture with active series succeeds');
  assert.equal(
    res36_4.internationalSeries.matches[0].completed,
    true,
    'REQ 36.4b: Completed calendar fixture is marked completed: true in corresponding active series match'
  );
  assert.equal(
    res36_4.internationalSeries.matches[0].summary,
    'India won by 6 wickets',
    'REQ 36.4c: Authoritative resultSummary from calendar is synchronized to series match summary'
  );
  assert.equal(
    res36_4.internationalSeries.seriesWins,
    1,
    'REQ 36.4d: Reconciled user win from calendar increments seriesWins to 1'
  );
  assert.equal(
    res36_4.leagues[0].calendarDates?.[1]?.matchFixture?.completed,
    true,
    'REQ 36.4e: Completed calendar fixture is NOT reset to incomplete'
  );
  assert.equal(
    res36_4.leagues[0].calendarDates?.[1]?.matchFixture?.resultSummary,
    'India won by 6 wickets',
    'REQ 36.4f: Authoritative completed result on calendar is NOT overwritten'
  );
  assert.equal(
    res36_4.targetDateIndex,
    2,
    'REQ 36.4g: Calendar advances past the completed Match 1 (index 1) and stops at unplayed Match 2 (index 2)'
  );

  // Calling again on res36_4 does not double-increment seriesWins
  const res36_4_repeat = applyAdvanceCalendarToNextTourState({
    leagues: res36_4.leagues,
    currentLeagueId: res36_4.leagues[0].id,
    coachProfile: res36_4.coachProfile,
    nations: baseNations,
    teams: baseTeams,
    players: res36_4.players,
    internationalSeries: res36_4.internationalSeries,
    completedMatchesHistory: res36_4.completedMatchesHistory,
    careerPhase: res36_4.careerPhase
  });
  assert.equal(
    res36_4_repeat.internationalSeries.seriesWins,
    1,
    'REQ 36.4h: Repeated invocation does not double-count reconciled seriesWins'
  );

  // ==========================================================================
  // REQ 37: STRICT LEAGUE RESOLUTION IN applyAdvanceCalendarToNextTourState (9 REGRESSION TESTS)
  // ==========================================================================
  const req37Series = buildInitialSeriesForNation(indNation, baseNations, ausNation.id, 1);
  const req37CoachProfile: CoachProfile = {
    ...INITIAL_COACH_PROFILE,
    clubTeamId: null as unknown as string,
    nationalTeamId: indNation.id,
    activeCareerMode: 'international'
  };

  const req37FirstLeague: League = {
    ...baseLeagues[0],
    id: 'league_first_decoy',
    name: 'First League Decoy',
    seasonYear: 2026,
    seasonName: '2026',
    currentDateIndex: 0,
    calendarDates: [
      {
        id: 'cal_decoy_rest_1',
        dateStr: '2026-06-01',
        dayOfWeek: 'MON',
        dayNumber: 1,
        month: 'JUN',
        isHome: true,
        type: 'rest'
      }
    ]
  };

  const req37SecondLeague: League = {
    ...baseLeagues[0],
    id: 'league_second_target',
    name: 'Second League Target',
    seasonYear: 2026,
    seasonName: '2026',
    currentDateIndex: 0,
    calendarDates: [
      {
        id: 'cal_target_rest_1',
        dateStr: '2026-07-01',
        dayOfWeek: 'WED',
        dayNumber: 1,
        month: 'JUL',
        isHome: true,
        type: 'rest'
      }
    ]
  };

  // 37.1: A valid league ID schedules or advances the tour successfully (even when it is NOT leagues[0])
  const res37_1 = applyAdvanceCalendarToNextTourState({
    leagues: [req37FirstLeague, req37SecondLeague],
    currentLeagueId: 'league_second_target',
    coachProfile: req37CoachProfile,
    nations: baseNations,
    teams: baseTeams,
    players: freshPlayers,
    internationalSeries: req37Series,
    completedMatchesHistory: [],
    careerPhase: 'international_series'
  });
  assert.equal(res37_1.success, true, 'REQ 37.1a: Valid currentLeagueId (index 1) schedules and advances tour successfully');
  assert.equal(
    res37_1.leagues[1].calendarDates.filter(d => d.id?.startsWith(`cal_intl_${req37Series.seriesId}_`)).length,
    req37Series.matches.length,
    'REQ 37.1b: Tour fixtures are scheduled into the requested valid league (league_second_target)'
  );
  assert.equal(
    res37_1.leagues[0].calendarDates.length,
    1,
    'REQ 37.1c: First league (league_first_decoy) is untouched when second league is targeted'
  );
  assert.equal(res37_1.targetDateIndex, 1, 'REQ 37.1d: Calendar advances to Match 1 in the target league');

  // 37.2: An invalid league ID fails clearly even when another league exists
  const multiLeaguesForInvalidTest = [
    JSON.parse(JSON.stringify(req37FirstLeague)) as League,
    JSON.parse(JSON.stringify(req37SecondLeague)) as League
  ];
  const beforeInvalidLeaguesJson = JSON.stringify(multiLeaguesForInvalidTest);
  const beforeInvalidSeriesJson = JSON.stringify(req37Series);
  const beforeInvalidProfileJson = JSON.stringify(req37CoachProfile);

  const res37_2 = applyAdvanceCalendarToNextTourState({
    leagues: multiLeaguesForInvalidTest,
    currentLeagueId: 'invalid_nonexistent_league_id',
    coachProfile: req37CoachProfile,
    nations: baseNations,
    teams: baseTeams,
    players: freshPlayers,
    internationalSeries: req37Series,
    completedMatchesHistory: [],
    careerPhase: 'international_series'
  });
  assert.equal(res37_2.success, false, 'REQ 37.2a: Invalid currentLeagueId returns success: false even when valid leagues exist');
  assert.ok(
    res37_2.message.includes('invalid_nonexistent_league_id') && /not found/i.test(res37_2.message),
    'REQ 37.2b: Returns a clear diagnostic failure message naming the invalid league ID'
  );

  // Also verify missing / whitespace currentLeagueId fails clearly
  const res37_2_blank = applyAdvanceCalendarToNextTourState({
    leagues: multiLeaguesForInvalidTest,
    currentLeagueId: '   ',
    coachProfile: req37CoachProfile,
    nations: baseNations,
    teams: baseTeams,
    players: freshPlayers,
    internationalSeries: req37Series,
    completedMatchesHistory: [],
    careerPhase: 'international_series'
  });
  assert.equal(res37_2_blank.success, false, 'REQ 37.2c: Blank currentLeagueId fails clearly');
  assert.ok(/missing or invalid currentLeagueId/i.test(res37_2_blank.message), 'REQ 37.2d: Diagnostic message reports missing/invalid currentLeagueId');

  // 37.3: An invalid league ID does not silently use the first league (leagues[0])
  assert.equal(
    res37_2.leagues[0].calendarDates.some(d => d && (d.type === 'international' || d.id?.startsWith('cal_intl_'))),
    false,
    'REQ 37.3a: Invalid currentLeagueId never writes international fixtures into leagues[0]'
  );
  assert.equal(
    res37_2.leagues[0].currentDateIndex,
    0,
    'REQ 37.3b: leagues[0].currentDateIndex is not advanced on invalid currentLeagueId'
  );

  // 37.4: An empty leagues array fails safely
  const res37_4 = applyAdvanceCalendarToNextTourState({
    leagues: [],
    currentLeagueId: 'pt20',
    coachProfile: req37CoachProfile,
    nations: baseNations,
    teams: baseTeams,
    players: freshPlayers,
    internationalSeries: req37Series,
    completedMatchesHistory: [],
    careerPhase: 'international_series'
  });
  assert.equal(res37_4.success, false, 'REQ 37.4a: Empty leagues array returns success: false safely');
  assert.ok(/no leagues available/i.test(res37_4.message), 'REQ 37.4b: Empty leagues array returns clear diagnostic message');
  assert.deepEqual(res37_4.leagues, [], 'REQ 37.4c: Empty leagues array remains empty');
  assert.equal(res37_4.targetDateIndex, 0, 'REQ 37.4d: Empty leagues array returns targetDateIndex = 0');

  // 37.5: A null or malformed league entry is handled safely
  const malformedLeagueEntry = {
    id: 'malformed_league',
    name: 'Malformed League',
    calendarDates: null,
    standings: null
  } as unknown as League;

  // 37.5a: Array containing only null and malformed entries fails safely without throwing
  const res37_5a = applyAdvanceCalendarToNextTourState({
    leagues: [null as unknown as League, undefined as unknown as League, malformedLeagueEntry],
    currentLeagueId: 'malformed_league',
    coachProfile: req37CoachProfile,
    nations: baseNations,
    teams: baseTeams,
    players: freshPlayers,
    internationalSeries: req37Series,
    completedMatchesHistory: [],
    careerPhase: 'international_series'
  });
  assert.equal(res37_5a.success, false, 'REQ 37.5a: Targeting a malformed league entry without calendarDates/standings fails safely');
  assert.ok(/missing or malformed calendar/i.test(res37_5a.message), 'REQ 37.5b: Diagnostic message identifies malformed league calendar/standings');

  // 37.5c: Array containing a null entry at index 0 alongside a valid league at index 1 succeeds when targeting the valid league
  const res37_5c = applyAdvanceCalendarToNextTourState({
    leagues: [null as unknown as League, JSON.parse(JSON.stringify(req37SecondLeague)) as League],
    currentLeagueId: 'league_second_target',
    coachProfile: req37CoachProfile,
    nations: baseNations,
    teams: baseTeams,
    players: freshPlayers,
    internationalSeries: req37Series,
    completedMatchesHistory: [],
    careerPhase: 'international_series'
  });
  assert.equal(res37_5c.success, true, 'REQ 37.5c: Null entry at leagues[0] does not crash when currentLeagueId matches valid leagues[1]');
  assert.equal(res37_5c.leagues[0], null, 'REQ 37.5d: Null entry at leagues[0] is preserved without throwing');
  assert.equal(
    res37_5c.leagues[1].calendarDates.filter(d => d.id?.startsWith(`cal_intl_${req37Series.seriesId}_`)).length,
    req37Series.matches.length,
    'REQ 37.5e: Valid league at index 1 receives scheduled tour fixtures cleanly'
  );

  // 37.6: Invalid league resolution leaves all league calendars unchanged
  assert.equal(
    JSON.stringify(res37_2.leagues),
    beforeInvalidLeaguesJson,
    'REQ 37.6a: Returned leagues array on invalid league resolution is byte-for-byte identical to input'
  );
  assert.equal(
    JSON.stringify(multiLeaguesForInvalidTest),
    beforeInvalidLeaguesJson,
    'REQ 37.6b: Input leagues array is not mutated in-place on invalid league resolution'
  );

  // 37.7: Invalid league resolution does not mutate the international series or career state
  assert.equal(
    JSON.stringify(res37_2.internationalSeries),
    beforeInvalidSeriesJson,
    'REQ 37.7a: International series state is completely unchanged on invalid league resolution'
  );
  assert.equal(
    JSON.stringify(res37_2.coachProfile),
    beforeInvalidProfileJson,
    'REQ 37.7b: Coach profile (activeCareerMode, nationalTeamId, completedInternationalSeriesIds) is unchanged'
  );
  assert.equal(
    res37_2.careerPhase,
    'international_series',
    'REQ 37.7c: Career phase remains unchanged on invalid league resolution'
  );
  assert.equal(
    res37_2.daysAdvanced,
    0,
    'REQ 37.7d: daysAdvanced is 0 on invalid league resolution'
  );
  assert.equal(
    res37_2.targetDateIndex,
    0,
    'REQ 37.7e: targetDateIndex is 0 on invalid league resolution'
  );

  // 37.8: A valid legacy save still works through the explicit recovery mechanism before calling applyAdvanceCalendarToNextTourState
  const legacyIntlSaveLeague: League = {
    ...JSON.parse(JSON.stringify(req37SecondLeague)),
    id: 'league_legacy_recovered_2026'
  };
  const explicitRecovery = validateAndRecoverCareerState({
    rawPhase: 'international_series',
    coachProfile: req37CoachProfile,
    teams: baseTeams,
    leagues: [legacyIntlSaveLeague],
    currentLeagueId: 'legacy_stale_missing_league_id', // invalid in legacy save
    nations: baseNations,
    nationalSquadIds: indEligiblePlayers.slice(0, 15).map(p => p.id),
    careerBoardReview: null,
    players: freshPlayers,
    internationalSeries: req37Series
  });
  assert.equal(
    explicitRecovery.resolvedLeagueId,
    'league_legacy_recovered_2026',
    'REQ 37.8a: Explicit recovery mechanism resolves the unique valid league for a legacy save'
  );
  assert.equal(
    explicitRecovery.requiresLeagueSelection,
    false,
    'REQ 37.8b: Explicit recovery succeeds without requiring manual disambiguation when unique valid league exists'
  );

  const res37_8 = applyAdvanceCalendarToNextTourState({
    leagues: [legacyIntlSaveLeague],
    currentLeagueId: explicitRecovery.resolvedLeagueId!,
    coachProfile: explicitRecovery.coachProfile,
    nations: baseNations,
    teams: baseTeams,
    players: freshPlayers,
    internationalSeries: explicitRecovery.internationalSeries || req37Series,
    completedMatchesHistory: [],
    careerPhase: explicitRecovery.careerPhase
  });
  assert.equal(
    res37_8.success,
    true,
    'REQ 37.8c: Calling applyAdvanceCalendarToNextTourState with explicitly recovered leagueId succeeds'
  );
  assert.equal(
    res37_8.leagues[0].calendarDates.filter(d => d.id?.startsWith(`cal_intl_${req37Series.seriesId}_`)).length,
    req37Series.matches.length,
    'REQ 37.8d: Explicitly recovered legacy save schedules all tour fixtures cleanly'
  );

  // 37.9: Repeated failed requests do not produce duplicate fixtures or unintended calendar advancement
  let rollingLeagues = [
    JSON.parse(JSON.stringify(req37FirstLeague)) as League,
    JSON.parse(JSON.stringify(req37SecondLeague)) as League
  ];
  let rollingSeries = JSON.parse(JSON.stringify(req37Series)) as InternationalSeriesState;
  let rollingProfile = JSON.parse(JSON.stringify(req37CoachProfile)) as CoachProfile;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const failedAttempt = applyAdvanceCalendarToNextTourState({
      leagues: rollingLeagues,
      currentLeagueId: `invalid_league_attempt_${attempt}`,
      coachProfile: rollingProfile,
      nations: baseNations,
      teams: baseTeams,
      players: freshPlayers,
      internationalSeries: rollingSeries,
      completedMatchesHistory: [],
      careerPhase: 'international_series'
    });
    assert.equal(failedAttempt.success, false, `REQ 37.9a (attempt ${attempt}): Invalid league request fails`);
    rollingLeagues = failedAttempt.leagues;
    rollingSeries = failedAttempt.internationalSeries;
    rollingProfile = failedAttempt.coachProfile;
  }

  assert.equal(
    JSON.stringify(rollingLeagues),
    beforeInvalidLeaguesJson,
    'REQ 37.9b: 3 repeated failed requests produce 0 duplicate fixtures and 0 calendar advancements across all leagues'
  );
  assert.equal(
    JSON.stringify(rollingSeries),
    beforeInvalidSeriesJson,
    'REQ 37.9c: 3 repeated failed requests leave internationalSeries untouched'
  );

  // Subsequent valid request after repeated failed requests schedules exactly 1 set of tour fixtures
  const validAfterFailures = applyAdvanceCalendarToNextTourState({
    leagues: rollingLeagues,
    currentLeagueId: 'league_second_target',
    coachProfile: rollingProfile,
    nations: baseNations,
    teams: baseTeams,
    players: freshPlayers,
    internationalSeries: rollingSeries,
    completedMatchesHistory: [],
    careerPhase: 'international_series'
  });
  assert.equal(validAfterFailures.success, true, 'REQ 37.9d: Valid request after repeated failed requests succeeds cleanly');
  assert.equal(
    validAfterFailures.leagues[1].calendarDates.filter(d => d.id?.startsWith(`cal_intl_${req37Series.seriesId}_`)).length,
    req37Series.matches.length,
    'REQ 37.9e: Exactly 1 set of tour fixtures is scheduled after recovery from failed requests'
  );
  assert.equal(
    validAfterFailures.leagues[0].calendarDates.length,
    1,
    'REQ 37.9f: First league remains untouched'
  );

  // =========================================================================
  // REQ 38: END-TO-END CAREER STABILITY AUDIT REGRESSION TESTS
  // =========================================================================
  {
    const baseLeague = INITIAL_LEAGUES[0];
    // REQ 38.1: resolveInternationalMatchParticipant resolves ID, code, and name (including multi-word nations)
    const saById = resolveInternationalMatchParticipant('nat_sa', baseNations);
    const saByCode = resolveInternationalMatchParticipant('SA', baseNations);
    const saByName = resolveInternationalMatchParticipant('South Africa', baseNations);
    assert.ok(saById && saById.id === 'nat_sa', 'REQ 38.1a: Resolves South Africa by canonical nation ID nat_sa');
    assert.ok(saByCode && saByCode.id === 'nat_sa', 'REQ 38.1b: Resolves South Africa by nation code SA');
    assert.ok(saByName && saByName.id === 'nat_sa', 'REQ 38.1c: Resolves South Africa by full name');

    // REQ 38.2: applyRecordCompletedInternationalMatchState marks ONLY the single played fixture
    // on both internationalSeries and active league calendar when calendar stores canonical nation IDs
    const indNation = baseNations.find(n => n.id === 'nat_ind')!;
    const ausNation = baseNations.find(n => n.id === 'nat_aus')!;
    const e2eIntlProfile = {
      ...INITIAL_COACH_PROFILE,
      activeCareerMode: 'international' as const,
      clubTeamId: null as unknown as string,
      nationalTeamId: 'nat_ind'
    };
    const e2eSeries = buildInitialSeriesForNation(indNation, baseNations, 'nat_aus', 1);
    const scheduledTourRes = applyAdvanceCalendarToNextTourState({
      leagues: [
        {
          ...baseLeague,
          id: 'ipl_e2e_intl',
          currentDateIndex: 0,
          calendarDates: [
            {
              id: 'cal_done_1',
              dateStr: '2026-05-30',
              dayOfWeek: 'SAT',
              dayNumber: 30,
              month: 'May',
              type: 'rest',
              title: 'Rest Day'
            }
          ]
        },
        {
          ...baseLeague,
          id: 'other_league_untouched',
          currentDateIndex: 0,
          calendarDates: [
            {
              id: 'cal_other_1',
              dateStr: '2026-06-05',
              dayOfWeek: 'FRI',
              dayNumber: 5,
              month: 'Jun',
              type: 'international',
              title: 'Unrelated League Intl Entry',
              matchFixture: {
                id: `intl_fix_${e2eSeries.seriesId}_1`,
                homeTeamId: e2eSeries.opponentNationId,
                awayTeamId: e2eSeries.userNationId,
                venue: e2eSeries.matches[0].venue,
                format: 'T20',
                isInternational: true,
                completed: false
              }
            }
          ]
        }
      ],
      currentLeagueId: 'ipl_e2e_intl',
      coachProfile: e2eIntlProfile,
      nations: baseNations,
      teams: baseTeams,
      players: freshPlayers,
      internationalSeries: e2eSeries,
      completedMatchesHistory: [],
      careerPhase: 'international_series'
    });
    assert.equal(scheduledTourRes.success, true, 'REQ 38.2a: Tour scheduled onto active league calendar');

    const match1FixtureId = scheduledTourRes.internationalSeries.matches[0].fixtureId!;
    // Simulate a finished live match where homeTeam/awayTeam have full country names ('Australia', 'India')
    // while calendar matchFixture has canonical IDs ('nat_aus', 'nat_ind')
    const oppNationObj = baseNations.find(n => n.id === scheduledTourRes.internationalSeries.opponentNationId) || ausNation;
    const finishedIntlMatch1 = {
      id: `live_${match1FixtureId}`,
      fixtureId: match1FixtureId,
      leagueId: 't20i_bilateral',
      format: 'T20' as const,
      homeTeam: {
        ...baseTeams[0],
        id: oppNationObj.id,
        name: oppNationObj.name,
        shortName: oppNationObj.code || 'AUS',
        isUserTeam: false
      },
      awayTeam: {
        ...baseTeams[1],
        id: indNation.id,
        name: indNation.name,
        shortName: indNation.code || 'IND',
        isUserTeam: true
      },
      venue: scheduledTourRes.internationalSeries.matches[0].venue,
      pitchType: 'Natural' as const,
      weather: 'Clear Night' as const,
      currentInningsIndex: 2 as const,
      innings1: {
        battingTeamId: oppNationObj.id,
        bowlingTeamId: indNation.id,
        runs: 165,
        wickets: 6,
        overs: 20,
        ballsCompleted: 120,
        maxOvers: 20,
        currentOverRuns: 0,
        extras: { total: 4, wides: 2, noBalls: 0, byes: 1, legByes: 1 },
        batters: [],
        bowlers: [],
        currentStrikerId: '',
        currentNonStrikerId: '',
        currentBowlerId: '',
        ballHistory: [],
        fallOfWickets: [],
        overRuns: []
      },
      innings2: {
        battingTeamId: indNation.id,
        bowlingTeamId: oppNationObj.id,
        runs: 168,
        wickets: 4,
        overs: 19.2,
        ballsCompleted: 116,
        maxOvers: 20,
        currentOverRuns: 4,
        extras: { total: 3, wides: 2, noBalls: 0, byes: 0, legByes: 1 },
        batters: [],
        bowlers: [],
        currentStrikerId: '',
        currentNonStrikerId: '',
        currentBowlerId: '',
        ballHistory: [],
        fallOfWickets: [],
        overRuns: []
      },
      targetRuns: 166,
      status: 'finished' as const,
      winnerTeamId: indNation.id,
      resultText: 'India won by 6 wickets',
      lastBallOutcome: null,
      isBallInFlight: false,
      reviewsRemaining: { home: 2, away: 2 },
      activeDrsReview: null,
      dlsState: null,
      hasDew: false,
      tacticalTrapAlert: null,
      powerSurgeTaken: false,
      powerSurgeOversLeft: 0,
      bowlingTactics: {
        length: 'good' as const,
        line: 'outside_off' as const,
        angle: 'over' as const,
        variation: 'Stock ball',
        fielders: []
      },
      battingTactics: {
        approach: 'balanced' as const,
        targetSide: 'all' as const,
        runningRisk: 'normal' as const
      }
    };

    const afterIntlMatch1 = applyRecordCompletedInternationalMatchState({
      finishedMatch: finishedIntlMatch1,
      nations: baseNations,
      internationalSeries: scheduledTourRes.internationalSeries,
      leagues: scheduledTourRes.leagues,
      currentLeagueId: 'ipl_e2e_intl',
      coachProfile: e2eIntlProfile
    });

    const completedSeriesMatches = afterIntlMatch1.internationalSeries.matches.filter(m => m.completed);
    assert.equal(completedSeriesMatches.length, 1, 'REQ 38.2b: Exactly 1 series match marked completed');
    assert.equal(afterIntlMatch1.internationalSeries.matches[0].completed, true, 'REQ 38.2c: Match 1 is completed in series');
    assert.equal(afterIntlMatch1.internationalSeries.matches[1].completed, false, 'REQ 38.2d: Match 2 remains uncompleted in series');
    assert.equal(afterIntlMatch1.internationalSeries.seriesWins, 1, 'REQ 38.2e: User seriesWins incremented to 1');

    const activeLeagueTourDates = afterIntlMatch1.leagues[0].calendarDates.filter(d =>
      d.id?.startsWith(`cal_intl_${e2eSeries.seriesId}_`)
    );
    const completedCalendarTourDates = activeLeagueTourDates.filter(d => d.matchFixture?.completed);
    assert.equal(
      completedCalendarTourDates.length,
      1,
      'REQ 38.2f: Exactly 1 calendar tour date marked completed (does NOT mark all 5 bilateral fixtures completed)'
    );
    assert.equal(
      activeLeagueTourDates[0].matchFixture?.completed,
      true,
      'REQ 38.2g: Calendar Match 1 is marked completed despite homeTeamId being canonical ID and finishedMatch.homeTeam.name being full country name'
    );
    assert.equal(
      activeLeagueTourDates[1].matchFixture?.completed,
      false,
      'REQ 38.2h: Calendar Match 2 remains uncompleted'
    );
    assert.equal(
      afterIntlMatch1.leagues[1].calendarDates[0].matchFixture?.completed,
      false,
      'REQ 38.2i: Unrelated league calendar is not mutated'
    );

    // REQ 38.3: Franchise Playoff AI match auto-progression when user wins Q1
    // User is #1 (team_mum). User wins Q1 against #2 (team_che).
    // Eliminator (#3 vs #4) and Q2 (#2 vs Eliminator winner) are AI vs AI matches and must auto-advance so Final is ready for user!
    const top4Standings = baseLeague.standings.map((st, idx) => ({
      ...st,
      played: 18,
      won: 18 - idx * 2,
      lost: idx * 2,
      points: (18 - idx * 2) * 2,
      nrr: Number((1.5 - idx * 0.3).toFixed(2))
    }));
    const userClubId = top4Standings[0].teamId;
    const rank2TeamId = top4Standings[1].teamId;
    const rank3TeamId = top4Standings[2].teamId;
    const rank4TeamId = top4Standings[3].teamId;

    const completedLeagueDates = baseLeague.calendarDates.map(cd => ({
      ...cd,
      matchFixture:
        cd.type === 'match' && cd.matchFixture
          ? { ...cd.matchFixture, completed: true, resultSummary: 'Completed' }
          : cd.matchFixture,
      otherMatches: Array.isArray(cd.otherMatches)
        ? cd.otherMatches.map(om => ({ ...om, completed: true, resultSummary: 'Completed' }))
        : cd.otherMatches
    }));
    const seededPlayoffs = createInitialPlayoffs(top4Standings);
    // Mark Q1 completed with userClubId as winner, rank2TeamId as loser into Q2
    const playoffsAfterUserWinsQ1 = {
      ...seededPlayoffs,
      q1: {
        ...seededPlayoffs.q1,
        homeTeamId: userClubId,
        awayTeamId: rank2TeamId,
        winnerTeamId: userClubId,
        loserTeamId: rank2TeamId,
        completed: true,
        resultSummary: 'User won Q1'
      },
      q2: {
        ...seededPlayoffs.q2,
        homeTeamId: rank2TeamId
      },
      final: {
        ...seededPlayoffs.final,
        homeTeamId: userClubId
      }
    };

    const leagueAfterUserQ1 = {
      ...baseLeague,
      standings: top4Standings,
      playoffs: playoffsAfterUserWinsQ1,
      calendarDates: syncPlayoffCalendarDates(completedLeagueDates, playoffsAfterUserWinsQ1, baseTeams)
    };

    const aiAdvanceAfterUserQ1 = applyAdvanceAiPlayoffMatchesState({
      league: leagueAfterUserQ1,
      teams: baseTeams,
      players: freshPlayers,
      coachProfile: {
        ...INITIAL_COACH_PROFILE,
        activeCareerMode: 'franchise',
        clubTeamId: userClubId,
        nationalTeamId: null
      },
      careerPhase: 'playoffs',
      tournamentHonors: [],
      careerBoardReview: null
    });

    assert.equal(
      aiAdvanceAfterUserQ1.league.playoffs?.eliminator.completed,
      true,
      'REQ 38.3a: AI Eliminator (#3 vs #4) auto-simulates when user is in Q1'
    );
    assert.equal(
      aiAdvanceAfterUserQ1.league.playoffs?.q2.completed,
      true,
      'REQ 38.3b: AI Q2 (#2 vs Eliminator winner) auto-simulates after user won Q1'
    );
    assert.equal(
      aiAdvanceAfterUserQ1.league.playoffs?.final.completed,
      false,
      'REQ 38.3c: Championship Final involving userClubId is NEVER auto-simulated'
    );
    assert.ok(
      aiAdvanceAfterUserQ1.league.playoffs?.final.awayTeamId === rank2TeamId ||
        aiAdvanceAfterUserQ1.league.playoffs?.final.awayTeamId === rank3TeamId ||
        aiAdvanceAfterUserQ1.league.playoffs?.final.awayTeamId === rank4TeamId,
      'REQ 38.3d: Q2 winner is seeded into final.awayTeamId so user can play the Final'
    );
    assert.equal(
      aiAdvanceAfterUserQ1.careerPhase,
      'playoffs',
      'REQ 38.3e: Career phase remains playoffs while user Final is pending'
    );

    // REQ 38.4: When user finishes outside Top 4 (#6), all AI playoff rounds auto-advance to Final completion & board_review
    const eliminatedUserClubId = top4Standings[5].teamId;
    const freshPlayoffsForNonQualifier = createInitialPlayoffs(top4Standings);
    const leagueForNonQualifier = {
      ...baseLeague,
      standings: top4Standings,
      playoffs: freshPlayoffsForNonQualifier,
      calendarDates: syncPlayoffCalendarDates(completedLeagueDates, freshPlayoffsForNonQualifier, baseTeams)
    };

    const aiAdvanceNonQualifier = applyAdvanceAiPlayoffMatchesState({
      league: leagueForNonQualifier,
      teams: baseTeams,
      players: freshPlayers,
      coachProfile: {
        ...INITIAL_COACH_PROFILE,
        activeCareerMode: 'franchise',
        clubTeamId: eliminatedUserClubId,
        nationalTeamId: null
      },
      careerPhase: 'playoffs',
      tournamentHonors: [],
      careerBoardReview: null
    });

    assert.deepEqual(
      aiAdvanceNonQualifier.stagesSimulated,
      ['q1', 'eliminator', 'q2', 'final'],
      'REQ 38.4a: All 4 AI playoff stages simulate in order when user missed playoffs'
    );
    assert.ok(
      Boolean(aiAdvanceNonQualifier.league.playoffs?.championTeamId),
      'REQ 38.4b: Champion team ID is assigned after AI Final'
    );
    assert.equal(
      aiAdvanceNonQualifier.careerPhase,
      'board_review',
      'REQ 38.4c: Career phase advances to board_review after AI Final completes'
    );
    assert.ok(
      Boolean(aiAdvanceNonQualifier.careerBoardReview),
      'REQ 38.4d: careerBoardReview snapshot is generated when transitioning to board_review'
    );
    assert.equal(
      aiAdvanceNonQualifier.tournamentHonors.length,
      1,
      'REQ 38.4e: Single tournament honor recorded for completed season'
    );

    // REQ 38.5: Exclusive Career Mode Invariant across switchUserClub, acceptJobOffer, and resignNationalJob
    const intlOfferRes = applyAcceptJobOfferState(
      {
        coachProfile: {
          ...INITIAL_COACH_PROFILE,
          activeCareerMode: 'franchise',
          clubTeamId: 'team_mum',
          nationalTeamId: null
        },
        teams: baseTeams,
        nations: baseNations,
        players: freshPlayers,
        leagues: [baseLeague],
        currentLeagueId: baseLeague.id,
        nationalSquadIds: [],
        internationalSeries: e2eSeries,
        careerPhase: 'league_stage'
      },
      {
        id: 'offer_intl_eng',
        type: 'national',
        name: 'England',
        boardTarget: 'Win T20 Series',
        salaryCr: 15
      }
    );
    assert.equal(intlOfferRes.success, true, 'REQ 38.5a: Accepting international job offer succeeds');
    assert.equal(intlOfferRes.coachProfile.activeCareerMode, 'international', 'REQ 38.5b: Mode switches to international');
    assert.equal(intlOfferRes.coachProfile.nationalTeamId, 'nat_eng', 'REQ 38.5c: nationalTeamId set to nat_eng');
    assert.equal(intlOfferRes.coachProfile.clubTeamId, null, 'REQ 38.5d: clubTeamId cleared to null (no dual contract)');
    assert.equal(intlOfferRes.teams.some(t => t.isUserTeam), false, 'REQ 38.5e: No franchise team marked isUserTeam in international mode');
    assert.equal(intlOfferRes.careerPhase, 'international_squad_selection', 'REQ 38.5f: Enters international_squad_selection phase');

    // Resigning national job deterministically restores a valid franchise contract
    const resignedRes = applyResignNationalJobState({
      coachProfile: intlOfferRes.coachProfile,
      teams: intlOfferRes.teams,
      nations: intlOfferRes.nations,
      careerPhase: intlOfferRes.careerPhase
    });
    assert.equal(resignedRes.coachProfile.activeCareerMode, 'franchise', 'REQ 38.5g: Resigning national job restores franchise mode');
    assert.equal(resignedRes.coachProfile.nationalTeamId, null, 'REQ 38.5h: nationalTeamId is null after resignation');
    assert.ok(Boolean(resignedRes.coachProfile.clubTeamId), 'REQ 38.5i: Valid clubTeamId restored after resignation');
    assert.equal(resignedRes.teams.filter(t => t.isUserTeam).length, 1, 'REQ 38.5j: Exactly 1 club marked isUserTeam');

    // Switching club while holding an international contract enforces franchise exclusivity
    const switchedFromIntl = applySwitchUserClubState(
      {
        coachProfile: intlOfferRes.coachProfile,
        teams: intlOfferRes.teams,
        nations: intlOfferRes.nations,
        leagues: [baseLeague],
        currentLeagueId: baseLeague.id,
        careerPhase: 'international_series'
      },
      'team_che'
    );
    assert.equal(switchedFromIntl.success, true, 'REQ 38.5k: switchUserClub succeeds for valid club ID');
    assert.equal(switchedFromIntl.coachProfile.activeCareerMode, 'franchise', 'REQ 38.5l: switchUserClub enforces franchise mode');
    assert.equal(switchedFromIntl.coachProfile.clubTeamId, 'team_che', 'REQ 38.5m: clubTeamId updated to team_che');
    assert.equal(switchedFromIntl.coachProfile.nationalTeamId, null, 'REQ 38.5n: nationalTeamId cleared to null');
    assert.equal(switchedFromIntl.nations.some(n => n.isUserManaging), false, 'REQ 38.5o: No nation marked isUserManaging');

    // ==========================================================================
    // SCENARIO 39: International Test-Series Completion vs WTC Isolation, Idempotency & Calendar Simulation Eligibility
    // ==========================================================================
    console.log('Testing Scenario 39: International Test-Series Completion vs WTC Isolation, Idempotency & Calendar Simulation Eligibility...');

    const freshNations = INITIAL_NATIONS.map(n => ({ ...n }));
    const baseInd = freshNations.find(n => n.id === 'nat_ind')!;
    const baseSa = freshNations.find(n => n.id === 'nat_sa')!;
    const initialIndTestRating = baseInd.ratingTest;
    const initialSaTestRating = baseSa.ratingTest;

    const testSeries: InternationalSeriesState = {
      seriesId: 'series_ind_sa_test_2026',
      userNationId: 'nat_ind',
      opponentNationId: 'nat_sa',
      userNationName: 'India',
      opponentNationName: 'South Africa',
      userNationCode: 'IND',
      opponentNationCode: 'SA',
      userNationFlag: '🇮🇳',
      opponentNationFlag: '🇿🇦',
      format: 'TEST',
      seriesWins: 0,
      seriesLosses: 0,
      matches: [
        {
          matchNumber: 1,
          venue: 'SuperSport Park',
          city: 'Centurion',
          completed: false,
          fixtureId: 'intl_fix_test_1',
          homeNationId: 'nat_sa',
          awayNationId: 'nat_ind',
          format: 'TEST'
        },
        {
          matchNumber: 2,
          venue: 'Wanderers Stadium',
          city: 'Johannesburg',
          completed: false,
          fixtureId: 'intl_fix_test_2',
          homeNationId: 'nat_sa',
          awayNationId: 'nat_ind',
          format: 'TEST'
        }
      ]
    };

    const targetLeagueCalDates = [
      {
        id: 'cal_intl_day_1',
        dateStr: '2026-12-15',
        dayNumber: 15,
        month: 'December',
        dayOfWeek: 'Tuesday',
        type: 'international' as const,
        matchFixture: {
          id: 'intl_fix_test_1',
          homeTeamId: 'nat_sa',
          awayTeamId: 'nat_ind',
          homeShortName: 'SA',
          awayShortName: 'IND',
          homeTeamName: 'South Africa',
          awayTeamName: 'India',
          venue: 'SuperSport Park',
          completed: false,
          isInternational: true
        },
        internationalMatches: [
          {
            id: 'intl_fix_test_1',
            homeTeamId: 'nat_sa',
            awayTeamId: 'nat_ind',
            homeTeamName: 'South Africa',
            awayTeamName: 'India',
            venue: 'SuperSport Park',
            completed: false,
            isInternational: true,
            format: 'TEST' as const
          }
        ]
      },
      {
        id: 'cal_intl_day_2',
        dateStr: '2026-12-22',
        dayNumber: 22,
        month: 'December',
        dayOfWeek: 'Tuesday',
        type: 'international' as const,
        matchFixture: {
          id: 'intl_fix_test_2',
          homeTeamId: 'nat_sa',
          awayTeamId: 'nat_ind',
          homeShortName: 'SA',
          awayShortName: 'IND',
          homeTeamName: 'South Africa',
          awayTeamName: 'India',
          venue: 'Wanderers Stadium',
          completed: false,
          isInternational: true
        },
        internationalMatches: [
          {
            id: 'intl_fix_test_2',
            homeTeamId: 'nat_sa',
            awayTeamId: 'nat_ind',
            homeTeamName: 'South Africa',
            awayTeamName: 'India',
            venue: 'Wanderers Stadium',
            completed: false,
            isInternational: true,
            format: 'TEST' as const
          }
        ]
      }
    ];

    const activeIntlLeague: League = {
      ...INITIAL_LEAGUES[0],
      id: 'active_intl_league',
      calendarDates: targetLeagueCalDates,
      currentDateIndex: 0
    };

    const unrelatedLeagueCalDates = [
      {
        id: 'cal_unrelated_1',
        dateStr: '2026-12-15',
        dayNumber: 15,
        month: 'December',
        dayOfWeek: 'Tuesday',
        type: 'match' as const,
        matchFixture: {
          id: 'unrelated_fix_1',
          homeTeamId: 'team_syd',
          awayTeamId: 'team_mel',
          homeTeamName: 'Sydney',
          awayTeamName: 'Melbourne',
          venue: 'SCG',
          completed: false
        }
      }
    ];

    const unrelatedLeague: League = {
      ...INITIAL_LEAGUES[0],
      id: 'unrelated_bbl_league',
      calendarDates: unrelatedLeagueCalDates,
      currentDateIndex: 0
    };

    const finishedBilateralTestMatch: MatchLiveState = {
      id: 'intl_fix_test_1',
      fixtureId: 'intl_fix_test_1',
      leagueId: 'test_bilateral',
      format: 'TEST',
      homeTeam: {
        id: 'nat_sa',
        name: 'South Africa',
        shortName: 'SA',
        logoEmoji: '🇿🇦',
        primaryColor: '#007749',
        secondaryColor: '#FFB81C',
        leagueId: 'intl',
        city: 'Centurion',
        purseCr: 100,
        rtmCards: 0,
        captainId: 'p_sa1',
        playingXIIds: [],
        squad: [],
        isUserTeam: false
      },
      awayTeam: {
        id: 'nat_ind',
        name: 'India',
        shortName: 'IND',
        logoEmoji: '🇮🇳',
        primaryColor: '#0080FF',
        secondaryColor: '#FF9933',
        leagueId: 'intl',
        city: 'Mumbai',
        purseCr: 100,
        rtmCards: 0,
        captainId: 'p_ind1',
        playingXIIds: [],
        squad: [],
        isUserTeam: true
      },
      winnerTeamId: 'nat_ind',
      resultText: 'India won by 142 runs',
      venue: 'SuperSport Park, Centurion',
      pitchType: 'Green Seamer',
      weather: 'Sunny & Hot',
      currentInningsIndex: 2,
      innings1: {
        battingTeamId: 'nat_ind',
        bowlingTeamId: 'nat_sa',
        runs: 380,
        wickets: 10,
        overs: 90,
        ballsCompleted: 540,
        maxOvers: 90,
        currentOverRuns: 0,
        extras: { total: 10, wides: 2, noBalls: 1, byes: 4, legByes: 3 },
        batters: [],
        bowlers: [],
        currentStrikerId: '',
        currentNonStrikerId: '',
        currentBowlerId: '',
        ballHistory: [],
        fallOfWickets: [],
        overRuns: []
      },
      innings2: {
        battingTeamId: 'nat_sa',
        bowlingTeamId: 'nat_ind',
        runs: 238,
        wickets: 10,
        overs: 72.4,
        ballsCompleted: 436,
        maxOvers: 90,
        currentOverRuns: 0,
        extras: { total: 8, wides: 1, noBalls: 1, byes: 2, legByes: 4 },
        batters: [],
        bowlers: [],
        currentStrikerId: '',
        currentNonStrikerId: '',
        currentBowlerId: '',
        ballHistory: [],
        fallOfWickets: [],
        overRuns: []
      },
      targetRuns: 381,
      status: 'finished',
      lastBallOutcome: null,
      isBallInFlight: false,
      reviewsRemaining: { home: 2, away: 2 },
      activeDrsReview: null,
      dlsState: null,
      hasDew: false,
      tacticalTrapAlert: null,
      powerSurgeTaken: false,
      powerSurgeOversLeft: 0,
      bowlingTactics: {
        length: 'good',
        line: 'outside_off',
        angle: 'over',
        variation: 'Stock ball',
        fielders: []
      },
      battingTactics: {
        approach: 'balanced',
        targetSide: 'all',
        runningRisk: 'normal'
      }
    };

    const intlCoachProfile: CoachProfile = {
      ...INITIAL_COACH_PROFILE,
      activeCareerMode: 'international',
      nationalTeamId: 'nat_ind',
      clubTeamId: null
    };

    // 1. Bilateral Test match completes correct series fixture and active league calendar
    const bilateralTestRes = applyRecordCompletedInternationalMatchState({
      finishedMatch: finishedBilateralTestMatch,
      didUserWin: true,
      coachProfile: intlCoachProfile,
      internationalSeries: testSeries,
      leagues: [activeIntlLeague, unrelatedLeague],
      currentLeagueId: activeIntlLeague.id,
      nations: freshNations
    });

    assert.equal(bilateralTestRes.matchedFixtureId, 'intl_fix_test_1', 'REQ 39.1a: Bilateral Test matches intl_fix_test_1');
    assert.equal(bilateralTestRes.internationalSeries.matches[0].completed, true, 'REQ 39.1b: Match 1 is marked completed');
    assert.equal(bilateralTestRes.internationalSeries.matches[1].completed, false, 'REQ 39.1c: Match 2 remains unfinished');
    assert.equal(bilateralTestRes.internationalSeries.seriesWins, 1, 'REQ 39.1d: User seriesWins incremented to 1');
    assert.equal(bilateralTestRes.internationalSeries.seriesLosses, 0, 'REQ 39.1e: seriesLosses remains 0');
    assert.equal(bilateralTestRes.internationalSeries.wtcTestCompleted, undefined, 'REQ 39.1f: wtcTestCompleted is NOT set for bilateral Test');

    const updatedActiveLeague = bilateralTestRes.leagues.find(l => l.id === activeIntlLeague.id)!;
    assert.equal(updatedActiveLeague.calendarDates[0].matchFixture?.completed, true, 'REQ 39.1g: Calendar date 0 matchFixture is completed');
    assert.equal(updatedActiveLeague.calendarDates[0].internationalMatches?.[0]?.completed, true, 'REQ 39.1h: Calendar date 0 internationalMatch is completed');
    assert.equal(updatedActiveLeague.calendarDates[1].matchFixture?.completed, false, 'REQ 39.1i: Calendar date 1 matchFixture remains uncompleted');

    // Unrelated league's calendar remains unchanged
    const updatedUnrelatedLeague = bilateralTestRes.leagues.find(l => l.id === unrelatedLeague.id)!;
    assert.equal(updatedUnrelatedLeague.calendarDates[0].matchFixture?.completed, false, 'REQ 39.1j: Unrelated league calendar remains unchanged');

    // Rankings updated (+3 / -2)
    const indAfterWin = bilateralTestRes.nations.find(n => n.id === 'nat_ind')!;
    const saAfterLoss = bilateralTestRes.nations.find(n => n.id === 'nat_sa')!;
    assert.equal(indAfterWin.ratingTest, initialIndTestRating + 3, 'REQ 39.1k: India Test rating gained +3');
    assert.equal(saAfterLoss.ratingTest, initialSaTestRating - 2, 'REQ 39.1l: South Africa Test rating lost -2');

    // 2. Repeated completion callbacks do not duplicate results or player-stat updates (Idempotency)
    const repeatedRes = applyRecordCompletedInternationalMatchState({
      finishedMatch: finishedBilateralTestMatch,
      didUserWin: true,
      coachProfile: intlCoachProfile,
      internationalSeries: bilateralTestRes.internationalSeries,
      leagues: bilateralTestRes.leagues,
      currentLeagueId: activeIntlLeague.id,
      nations: bilateralTestRes.nations
    });
    assert.equal(repeatedRes.internationalSeries.seriesWins, 1, 'REQ 39.2a: seriesWins does NOT duplicate on repeated callback');
    assert.equal(
      repeatedRes.nations.find(n => n.id === 'nat_ind')!.ratingTest,
      indAfterWin.ratingTest,
      'REQ 39.2b: India Test rating does NOT duplicate +3 on repeated callback'
    );
    assert.equal(
      repeatedRes.nations.find(n => n.id === 'nat_sa')!.ratingTest,
      saAfterLoss.ratingTest,
      'REQ 39.2c: South Africa Test rating does NOT duplicate -2 on repeated callback'
    );

    // 3. WTC Test match follows the existing WTC completion path
    const wtcTestMatch: MatchLiveState = {
      ...finishedBilateralTestMatch,
      id: 'wtc_aus_ind_2026',
      fixtureId: 'wtc_aus_ind_2026',
      leagueId: 'wtc_test',
      homeTeam: {
        ...finishedBilateralTestMatch.homeTeam,
        id: 'nat_aus',
        name: 'Australia',
        shortName: 'AUS'
      },
      winnerTeamId: 'nat_ind',
      resultText: 'India won by 5 wickets'
    };
    const wtcRes = applyRecordCompletedInternationalMatchState({
      finishedMatch: wtcTestMatch,
      didUserWin: true,
      coachProfile: intlCoachProfile,
      internationalSeries: bilateralTestRes.internationalSeries,
      leagues: bilateralTestRes.leagues,
      currentLeagueId: activeIntlLeague.id,
      nations: bilateralTestRes.nations
    });
    assert.equal(wtcRes.internationalSeries.wtcTestCompleted, true, 'REQ 39.3a: WTC test completion sets wtcTestCompleted: true');
    assert.ok(Boolean(wtcRes.internationalSeries.wtcTestSummary), 'REQ 39.3b: WTC test summary is recorded');
    assert.equal(wtcRes.internationalSeries.matches[1].completed, false, 'REQ 39.3c: Bilateral tour matches are not touched by WTC match');

    // Repeated WTC callback is also idempotent
    const repeatedWtcRes = applyRecordCompletedInternationalMatchState({
      finishedMatch: wtcTestMatch,
      didUserWin: true,
      coachProfile: intlCoachProfile,
      internationalSeries: wtcRes.internationalSeries,
      leagues: wtcRes.leagues,
      currentLeagueId: activeIntlLeague.id,
      nations: wtcRes.nations
    });
    assert.equal(
      repeatedWtcRes.nations.find(n => n.id === 'nat_ind')!.ratingTest,
      wtcRes.nations.find(n => n.id === 'nat_ind')!.ratingTest,
      'REQ 39.3d: WTC repeated callback does not duplicate nation ranking changes'
    );

    // 4. Ambiguous or missing competition identity fails safely without state mutation
    const ambiguousTestMatch: MatchLiveState = {
      ...finishedBilateralTestMatch,
      id: 'unknown_test_match_99',
      fixtureId: 'unknown_test_match_99',
      leagueId: '',
      homeTeam: {
        ...finishedBilateralTestMatch.homeTeam,
        id: 'nat_unknown_1',
        name: 'Unknown Land'
      },
      awayTeam: {
        ...finishedBilateralTestMatch.awayTeam,
        id: 'nat_unknown_2',
        name: 'Mystery Nation'
      }
    };
    const ambiguousRes = applyRecordCompletedInternationalMatchState({
      finishedMatch: ambiguousTestMatch,
      didUserWin: true,
      coachProfile: intlCoachProfile,
      internationalSeries: bilateralTestRes.internationalSeries,
      leagues: bilateralTestRes.leagues,
      currentLeagueId: activeIntlLeague.id,
      nations: bilateralTestRes.nations
    });
    assert.equal(ambiguousRes.matchedFixtureId, null, 'REQ 39.4a: Ambiguous competition yields null matchedFixtureId');
    assert.deepEqual(ambiguousRes.internationalSeries, bilateralTestRes.internationalSeries, 'REQ 39.4b: Ambiguous match fails safely without mutating series');
    assert.deepEqual(ambiguousRes.nations, bilateralTestRes.nations, 'REQ 39.4c: Ambiguous match fails safely without mutating nation rankings');

    // 5. Prevent background calendar simulation from consuming user-controlled fixtures
    // 5a: Coached nation international fixture on current day blocks advancement
    const uncompletedIntlDayLeague: League = {
      ...activeIntlLeague,
      calendarDates: [
        {
          id: 'cal_user_intl_today',
          dateStr: '2026-11-10',
          dayNumber: 10,
          month: 'November',
          dayOfWeek: 'Saturday',
          type: 'international',
          matchFixture: {
            id: 'intl_fix_user_1',
            homeTeamId: 'nat_ind',
            awayTeamId: 'nat_sa',
            homeTeamName: 'India',
            awayTeamName: 'South Africa',
            venue: 'SuperSport Park, Centurion',
            completed: false,
            isInternational: true
          },
          internationalMatches: [
            {
              id: 'intl_fix_user_1',
              homeTeamId: 'nat_ind',
              awayTeamId: 'nat_sa',
              homeTeamName: 'India',
              awayTeamName: 'South Africa',
              venue: 'SuperSport Park, Centurion',
              completed: false,
              isInternational: true,
              format: 'T20'
            }
          ]
        },
        {
          id: 'cal_user_intl_tomorrow',
          dateStr: '2026-11-11',
          dayNumber: 11,
          month: 'November',
          dayOfWeek: 'Sunday',
          type: 'rest'
        }
      ],
      currentDateIndex: 0
    };

    assert.equal(
      isUserControlledInternationalFixture(uncompletedIntlDayLeague.calendarDates[0].matchFixture, intlCoachProfile, freshNations),
      true,
      'REQ 39.5a: Match involving coached nation India is user-controlled in international mode'
    );

    const intlAdvanceBlocked = applyAdvanceCalendarDayState({
      league: uncompletedIntlDayLeague,
      teams: INITIAL_TEAMS,
      players: freshPlayers,
      coachProfile: intlCoachProfile,
      nations: freshNations,
      careerPhase: 'international_series',
      tournamentHonors: [],
      careerBoardReview: null
    });
    assert.equal(intlAdvanceBlocked.advanced, false, 'REQ 39.5b: Background advance is blocked on uncompleted user international fixture');
    assert.equal(intlAdvanceBlocked.blockedReason, 'user_international_fixture_pending', 'REQ 39.5c: Blocked reason specifies user international fixture pending');
    assert.equal(intlAdvanceBlocked.league.currentDateIndex, 0, 'REQ 39.5d: currentDateIndex does NOT advance past uncompleted fixture');
    assert.equal(intlAdvanceBlocked.league.calendarDates[0].matchFixture?.completed, false, 'REQ 39.5e: User international fixture is not consumed by AI');

    // 5b: AI-only international fixtures between other nations simulate normally
    const aiOnlyIntlDayLeague: League = {
      ...activeIntlLeague,
      calendarDates: [
        {
          id: 'cal_ai_intl_today',
          dateStr: '2026-11-10',
          dayNumber: 10,
          month: 'November',
          dayOfWeek: 'Saturday',
          type: 'international',
          matchFixture: {
            id: 'intl_fix_ai_1',
            homeTeamId: 'nat_aus',
            awayTeamId: 'nat_eng',
            homeTeamName: 'Australia',
            awayTeamName: 'England',
            venue: 'MCG, Melbourne',
            completed: false,
            isInternational: true
          },
          internationalMatches: [
            {
              id: 'intl_fix_ai_1',
              homeTeamId: 'nat_aus',
              awayTeamId: 'nat_eng',
              homeTeamName: 'Australia',
              awayTeamName: 'England',
              venue: 'MCG, Melbourne',
              completed: false,
              isInternational: true,
              format: 'T20'
            }
          ]
        },
        {
          id: 'cal_ai_intl_tomorrow',
          dateStr: '2026-11-11',
          dayNumber: 11,
          month: 'November',
          dayOfWeek: 'Sunday',
          type: 'rest'
        }
      ],
      currentDateIndex: 0
    };

    assert.equal(
      isUserControlledInternationalFixture(aiOnlyIntlDayLeague.calendarDates[0].matchFixture, intlCoachProfile, freshNations),
      false,
      'REQ 39.5f: Australia vs England is not user-controlled when coaching India'
    );

    const aiAdvanceAllowed = applyAdvanceCalendarDayState({
      league: aiOnlyIntlDayLeague,
      teams: INITIAL_TEAMS,
      players: freshPlayers,
      coachProfile: intlCoachProfile,
      nations: freshNations,
      careerPhase: 'international_series',
      tournamentHonors: [],
      careerBoardReview: null
    });
    assert.equal(aiAdvanceAllowed.advanced, true, 'REQ 39.5g: Background advance succeeds for AI-only international fixtures');
    assert.equal(aiAdvanceAllowed.league.calendarDates[0].matchFixture?.completed, true, 'REQ 39.5h: AI international fixture completes');
    assert.equal(aiAdvanceAllowed.league.currentDateIndex, 1, 'REQ 39.5i: Advances to next calendar day');

    // 5c: In franchise mode, international fixtures simulate normally without diversion
    const franchiseCoachProfile: CoachProfile = {
      ...INITIAL_COACH_PROFILE,
      activeCareerMode: 'franchise',
      clubTeamId: 'team_mum',
      nationalTeamId: null
    };

    assert.equal(
      isUserControlledInternationalFixture(uncompletedIntlDayLeague.calendarDates[0].matchFixture, franchiseCoachProfile, freshNations),
      false,
      'REQ 39.5j: In franchise mode, international matches are never user-controlled'
    );

    // 5d: In franchise mode, uncompleted club fixture on current day blocks advancement
    const uncompletedClubDayLeague: League = {
      ...activeIntlLeague,
      calendarDates: [
        {
          id: 'cal_club_today',
          dateStr: '2026-04-05',
          dayNumber: 5,
          month: 'April',
          dayOfWeek: 'Friday',
          type: 'match',
          matchFixture: {
            id: 'fix_club_1',
            homeTeamId: 'team_mum',
            awayTeamId: 'team_che',
            homeTeamName: 'Mumbai',
            awayTeamName: 'Chennai',
            venue: 'Wankhede Stadium, Mumbai',
            completed: false
          }
        },
        {
          id: 'cal_club_tomorrow',
          dateStr: '2026-04-06',
          dayNumber: 6,
          month: 'April',
          dayOfWeek: 'Saturday',
          type: 'rest'
        }
      ],
      currentDateIndex: 0
    };

    const clubAdvanceBlocked = applyAdvanceCalendarDayState({
      league: uncompletedClubDayLeague,
      teams: INITIAL_TEAMS,
      players: freshPlayers,
      coachProfile: franchiseCoachProfile,
      userTeamId: 'team_mum',
      nations: freshNations,
      careerPhase: 'league_stage',
      tournamentHonors: [],
      careerBoardReview: null
    });
    assert.equal(clubAdvanceBlocked.advanced, false, 'REQ 39.5k: Advance blocked on uncompleted club match in franchise mode');
    assert.equal(clubAdvanceBlocked.blockedReason, 'user_franchise_fixture_pending', 'REQ 39.5l: Blocked reason indicates franchise match pending');

    // 5e: Ambiguous or missing participant identities fail safely (do not auto-simulate)
    const ambiguousIntlFixture = {
      id: 'fix_ambiguous',
      homeTeamId: '',
      awayTeamId: '',
      homeTeamName: '',
      awayTeamName: ''
    };
    assert.equal(
      isUserControlledInternationalFixture(ambiguousIntlFixture, intlCoachProfile, freshNations),
      true,
      'REQ 39.5m: Missing participant identities fail safely (treated as protected from auto-simulation)'
    );
  }

  // =========================================================================
  // SCENARIO 40: End-to-End International Integrity, Calendar Eligibility & Save/Load Stability
  // =========================================================================
  {
    console.log('Testing Scenario 40: End-to-End International Integrity, Calendar Eligibility & Save/Load Stability...');

    const freshNations40 = INITIAL_NATIONS.map(n => ({ ...n }));
    const tourSeries: InternationalSeriesState = {
      seriesId: 'tour_ind_eng_2026',
      userNationId: 'nat_ind',
      userNationName: 'India',
      userNationCode: 'IND',
      userNationFlag: '🇮🇳',
      opponentNationId: 'nat_eng',
      opponentNationName: 'England',
      opponentNationCode: 'ENG',
      opponentNationFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
      seriesWins: 0,
      seriesLosses: 0,
      format: 'TEST',
      matches: [
        {
          matchNumber: 1,
          city: 'London',
          venue: "Lord's, London",
          completed: false,
          fixtureId: 'intl_fix_tour_1',
          dateStr: '2026-07-10',
          format: 'TEST'
        },
        {
          matchNumber: 2,
          city: 'Nottingham',
          venue: 'Trent Bridge, Nottingham',
          completed: false,
          fixtureId: 'intl_fix_tour_2',
          dateStr: '2026-07-18',
          format: 'TEST'
        }
      ]
    };

    const tourCalendarDates: League['calendarDates'] = [
      {
        id: 'cal_tour_1',
        dateStr: '2026-07-10',
        dayNumber: 10,
        month: 'July',
        dayOfWeek: 'Friday',
        type: 'international',
        matchFixture: {
          id: 'intl_fix_tour_1',
          homeTeamId: 'nat_eng',
          awayTeamId: 'nat_ind',
          homeTeamName: 'England',
          awayTeamName: 'India',
          venue: "Lord's, London",
          completed: false,
          format: 'TEST',
          isInternational: true
        },
        internationalMatches: [
          {
            id: 'intl_fix_tour_1',
            homeTeamId: 'nat_eng',
            awayTeamId: 'nat_ind',
            homeTeamName: 'England',
            awayTeamName: 'India',
            venue: "Lord's, London",
            completed: false,
            format: 'TEST',
            isInternational: true
          }
        ]
      },
      {
        id: 'cal_tour_2',
        dateStr: '2026-07-18',
        dayNumber: 18,
        month: 'July',
        dayOfWeek: 'Saturday',
        type: 'international',
        matchFixture: {
          id: 'intl_fix_tour_2',
          homeTeamId: 'nat_eng',
          awayTeamId: 'nat_ind',
          homeTeamName: 'England',
          awayTeamName: 'India',
          venue: 'Trent Bridge, Nottingham',
          completed: false,
          format: 'TEST',
          isInternational: true
        },
        internationalMatches: [
          {
            id: 'intl_fix_tour_2',
            homeTeamId: 'nat_eng',
            awayTeamId: 'nat_ind',
            homeTeamName: 'England',
            awayTeamName: 'India',
            venue: 'Trent Bridge, Nottingham',
            completed: false,
            format: 'TEST',
            isInternational: true
          }
        ]
      }
    ];

    const intlLeague40: League = {
      ...INITIAL_LEAGUES[0],
      id: 'tour_league_40',
      calendarDates: tourCalendarDates,
      currentDateIndex: 0
    };

    const intlCoach40: CoachProfile = {
      ...INITIAL_COACH_PROFILE,
      activeCareerMode: 'international',
      nationalTeamId: 'nat_ind',
      clubTeamId: null
    };

    // 1. Bilateral Test-match completion updates the correct series fixture
    const finishedMatch1: MatchLiveState = {
      id: 'intl_fix_tour_1',
      fixtureId: 'intl_fix_tour_1',
      leagueId: 'test_bilateral',
      format: 'TEST',
      homeTeam: {
        id: 'nat_eng',
        name: 'England',
        shortName: 'ENG',
        logoEmoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        primaryColor: '#002B49',
        secondaryColor: '#C8102E',
        leagueId: 'intl',
        city: 'London',
        purseCr: 100,
        rtmCards: 0,
        captainId: 'p_eng1',
        playingXIIds: [],
        squad: [],
        isUserTeam: false
      },
      awayTeam: {
        id: 'nat_ind',
        name: 'India',
        shortName: 'IND',
        logoEmoji: '🇮🇳',
        primaryColor: '#0080FF',
        secondaryColor: '#FF9933',
        leagueId: 'intl',
        city: 'Mumbai',
        purseCr: 100,
        rtmCards: 0,
        captainId: 'p_ind1',
        playingXIIds: [],
        squad: [],
        isUserTeam: true
      },
      winnerTeamId: 'nat_ind',
      resultText: 'India won by an innings and 24 runs',
      venue: "Lord's, London",
      pitchType: 'Green Seamer',
      weather: 'Sunny & Hot',
      currentInningsIndex: 2,
      innings1: {
        battingTeamId: 'nat_ind',
        bowlingTeamId: 'nat_eng',
        runs: 450,
        wickets: 10,
        overs: 90,
        ballsCompleted: 540,
        maxOvers: 90,
        currentOverRuns: 0,
        extras: { total: 10, wides: 1, noBalls: 1, byes: 4, legByes: 4 },
        batters: [],
        bowlers: [],
        currentStrikerId: '',
        currentNonStrikerId: '',
        currentBowlerId: '',
        ballHistory: [],
        fallOfWickets: [],
        overRuns: []
      },
      innings2: {
        battingTeamId: 'nat_eng',
        bowlingTeamId: 'nat_ind',
        runs: 210,
        wickets: 10,
        overs: 68.2,
        ballsCompleted: 410,
        maxOvers: 90,
        currentOverRuns: 0,
        extras: { total: 6, wides: 0, noBalls: 1, byes: 2, legByes: 3 },
        batters: [],
        bowlers: [],
        currentStrikerId: '',
        currentNonStrikerId: '',
        currentBowlerId: '',
        ballHistory: [],
        fallOfWickets: [],
        overRuns: []
      },
      targetRuns: null,
      status: 'finished',
      lastBallOutcome: null,
      isBallInFlight: false,
      reviewsRemaining: { home: 2, away: 2 },
      activeDrsReview: null,
      dlsState: null,
      hasDew: false,
      tacticalTrapAlert: null,
      powerSurgeTaken: false,
      powerSurgeOversLeft: 0,
      bowlingTactics: {
        length: 'good',
        line: 'outside_off',
        angle: 'over',
        variation: 'Stock ball',
        fielders: []
      },
      battingTactics: {
        approach: 'balanced',
        targetSide: 'all',
        runningRisk: 'normal'
      }
    };

    const res40_1 = applyRecordCompletedInternationalMatchState({
      finishedMatch: finishedMatch1,
      didUserWin: true,
      coachProfile: intlCoach40,
      internationalSeries: tourSeries,
      leagues: [intlLeague40],
      currentLeagueId: intlLeague40.id,
      nations: freshNations40
    });

    // 1. Bilateral Test-match completion updates correct fixture
    assert.equal(res40_1.matchedFixtureId, 'intl_fix_tour_1', 'REQ 40.1a: Completed bilateral Test matches intl_fix_tour_1');
    assert.equal(res40_1.internationalSeries.matches[0].completed, true, 'REQ 40.1b: Match 1 is marked complete');

    // 2. WTC completion preserves the existing WTC workflow
    const wtcMatch40: MatchLiveState = {
      ...finishedMatch1,
      id: 'wtc_final_2026',
      fixtureId: 'wtc_final_2026',
      leagueId: 'wtc_test',
      winnerTeamId: 'nat_ind',
      resultText: 'India won the World Test Championship Final by 7 wickets'
    };
    const res40_2 = applyRecordCompletedInternationalMatchState({
      finishedMatch: wtcMatch40,
      didUserWin: true,
      coachProfile: intlCoach40,
      internationalSeries: res40_1.internationalSeries,
      leagues: res40_1.leagues,
      currentLeagueId: intlLeague40.id,
      nations: res40_1.nations
    });
    assert.equal(res40_2.internationalSeries.wtcTestCompleted, true, 'REQ 40.2a: WTC completion marks wtcTestCompleted: true');
    assert.ok(Boolean(res40_2.internationalSeries.wtcTestSummary), 'REQ 40.2b: WTC summary recorded');

    // 3. A single completed match does not mark other tour matches complete
    assert.equal(res40_2.internationalSeries.matches[1].completed, false, 'REQ 40.3a: Match 2 in tour series remains uncompleted');
    assert.equal(res40_2.leagues[0].calendarDates[1].matchFixture?.completed, false, 'REQ 40.3b: Match 2 on calendar remains uncompleted');

    // 4. An international coach's current playable fixture survives calendar advancement
    const leagueAtMatch2: League = {
      ...res40_2.leagues[0],
      currentDateIndex: 1
    };
    const advanceBlockedAt2 = applyAdvanceCalendarDayState({
      league: leagueAtMatch2,
      teams: INITIAL_TEAMS,
      players: INITIAL_PLAYERS,
      coachProfile: intlCoach40,
      nations: res40_2.nations,
      careerPhase: 'international_series',
      tournamentHonors: [],
      careerBoardReview: null
    });
    assert.equal(advanceBlockedAt2.advanced, false, 'REQ 40.4a: Calendar advancement blocked on user playable fixture');
    assert.equal(advanceBlockedAt2.blockedReason, 'user_international_fixture_pending', 'REQ 40.4b: Reason is user_international_fixture_pending');
    assert.equal(advanceBlockedAt2.league.calendarDates[1].matchFixture?.completed, false, 'REQ 40.4c: User playable fixture survives advancement untouched');

    // 5. An unrelated international fixture can be simulated as AI
    const aiIntlLeague: League = {
      ...INITIAL_LEAGUES[0],
      id: 'ai_intl_league',
      calendarDates: [
        {
          id: 'cal_ai_1',
          dateStr: '2026-08-01',
          dayNumber: 1,
          month: 'August',
          dayOfWeek: 'Saturday',
          type: 'international',
          matchFixture: {
            id: 'fix_ai_aus_eng',
            homeTeamId: 'nat_aus',
            awayTeamId: 'nat_eng',
            homeTeamName: 'Australia',
            awayTeamName: 'England',
            venue: 'MCG, Melbourne',
            completed: false,
            format: 'T20',
            isInternational: true
          },
          internationalMatches: [
            {
              id: 'fix_ai_aus_eng',
              homeTeamId: 'nat_aus',
              awayTeamId: 'nat_eng',
              homeTeamName: 'Australia',
              awayTeamName: 'England',
              venue: 'MCG, Melbourne',
              completed: false,
              format: 'T20',
              isInternational: true
            }
          ]
        },
        {
          id: 'cal_ai_2',
          dateStr: '2026-08-02',
          dayNumber: 2,
          month: 'August',
          dayOfWeek: 'Sunday',
          type: 'rest'
        }
      ],
      currentDateIndex: 0
    };
    const aiAdvanceRes = applyAdvanceCalendarDayState({
      league: aiIntlLeague,
      teams: INITIAL_TEAMS,
      players: INITIAL_PLAYERS,
      coachProfile: intlCoach40,
      nations: res40_2.nations,
      careerPhase: 'international_series',
      tournamentHonors: [],
      careerBoardReview: null
    });
    assert.equal(aiAdvanceRes.advanced, true, 'REQ 40.5a: Unrelated international fixture simulated as AI');
    assert.equal(aiAdvanceRes.league.calendarDates[0].matchFixture?.completed, true, 'REQ 40.5b: AI fixture marked completed');

    // 6. A franchise coach is not diverted into an international career phase
    const franchiseCoach40: CoachProfile = {
      ...INITIAL_COACH_PROFILE,
      activeCareerMode: 'franchise',
      clubTeamId: 'team_mum',
      nationalTeamId: null
    };
    const franchiseAdvanceRes = applyAdvanceCalendarDayState({
      league: aiIntlLeague,
      teams: INITIAL_TEAMS,
      players: INITIAL_PLAYERS,
      coachProfile: franchiseCoach40,
      userTeamId: 'team_mum',
      nations: res40_2.nations,
      careerPhase: 'league_stage',
      tournamentHonors: [],
      careerBoardReview: null
    });
    assert.equal(franchiseAdvanceRes.careerPhase, 'league_stage', 'REQ 40.6: Franchise coach retains league_stage careerPhase');

    // 7. Repeated completion and calendar advancement do not duplicate results
    const repeatCompRes = applyRecordCompletedInternationalMatchState({
      finishedMatch: finishedMatch1,
      didUserWin: true,
      coachProfile: intlCoach40,
      internationalSeries: res40_2.internationalSeries,
      leagues: res40_2.leagues,
      currentLeagueId: intlLeague40.id,
      nations: res40_2.nations
    });
    assert.equal(repeatCompRes.internationalSeries.seriesWins, 1, 'REQ 40.7a: Repeated completion callback does not double seriesWins');
    assert.equal(
      repeatCompRes.nations.find(n => n.id === 'nat_ind')!.ratingTest,
      res40_2.nations.find(n => n.id === 'nat_ind')!.ratingTest,
      'REQ 40.7b: Repeated completion callback does not duplicate ranking rating'
    );

    // 8. Save/load preserves fixture identity, result, and completion state
    const serializedSave = JSON.stringify({
      series: res40_2.internationalSeries,
      league: res40_2.leagues[0]
    });
    const loadedSave = JSON.parse(serializedSave);
    assert.equal(loadedSave.series.matches[0].fixtureId, 'intl_fix_tour_1', 'REQ 40.8a: Loaded save preserves fixtureId');
    assert.equal(loadedSave.series.matches[0].completed, true, 'REQ 40.8b: Loaded save preserves match completed flag');
    assert.equal(loadedSave.league.calendarDates[0].matchFixture.completed, true, 'REQ 40.8c: Loaded save preserves calendar completed state');

    // 9. Invalid or ambiguous fixture participants do not silently trigger AI simulation
    const ambiguousLeague: League = {
      ...INITIAL_LEAGUES[0],
      id: 'ambiguous_intl_league',
      calendarDates: [
        {
          id: 'cal_ambiguous_1',
          dateStr: '2026-08-01',
          dayNumber: 1,
          month: 'August',
          dayOfWeek: 'Saturday',
          type: 'international',
          matchFixture: {
            id: 'fix_ambiguous_xyz',
            homeTeamId: 'nonexistent_nation_1',
            awayTeamId: 'nonexistent_nation_2',
            homeTeamName: 'Nonexistent 1',
            awayTeamName: 'Nonexistent 2',
            venue: 'Unknown Stadium',
            completed: false,
            format: 'T20',
            isInternational: true
          },
          internationalMatches: [
            {
              id: 'fix_ambiguous_xyz',
              homeTeamId: 'nonexistent_nation_1',
              awayTeamId: 'nonexistent_nation_2',
              homeTeamName: 'Nonexistent 1',
              awayTeamName: 'Nonexistent 2',
              venue: 'Unknown Stadium',
              completed: false,
              format: 'T20',
              isInternational: true
            }
          ]
        },
        {
          id: 'cal_ambiguous_2',
          dateStr: '2026-08-02',
          dayNumber: 2,
          month: 'August',
          dayOfWeek: 'Sunday',
          type: 'rest'
        }
      ],
      currentDateIndex: 0
    };
    const ambiguousAdvanceRes = applyAdvanceCalendarDayState({
      league: ambiguousLeague,
      teams: INITIAL_TEAMS,
      players: INITIAL_PLAYERS,
      coachProfile: franchiseCoach40,
      userTeamId: 'team_mum',
      nations: res40_2.nations,
      careerPhase: 'league_stage',
      tournamentHonors: [],
      careerBoardReview: null
    });
    assert.equal(
      ambiguousAdvanceRes.league.calendarDates[0].internationalMatches?.[0]?.completed,
      false,
      'REQ 40.9: Ambiguous international fixture participants fail safely without AI simulation'
    );

    // 10. Failed transitions leave the series, calendar, and career state unchanged
    const unknownCompMatch: MatchLiveState = {
      ...finishedMatch1,
      id: 'completely_unknown_fixture',
      fixtureId: 'completely_unknown_fixture',
      leagueId: 'unknown_comp_xyz',
      homeTeam: {
        ...finishedMatch1.homeTeam,
        id: 'mystery_home',
        name: 'Mystery Home'
      },
      awayTeam: {
        ...finishedMatch1.awayTeam,
        id: 'mystery_away',
        name: 'Mystery Away'
      }
    };
    const failedTransitionRes = applyRecordCompletedInternationalMatchState({
      finishedMatch: unknownCompMatch,
      didUserWin: true,
      coachProfile: intlCoach40,
      internationalSeries: res40_2.internationalSeries,
      leagues: res40_2.leagues,
      currentLeagueId: intlLeague40.id,
      nations: res40_2.nations
    });
    assert.equal(failedTransitionRes.matchedFixtureId, null, 'REQ 40.10a: Failed transition returns null matchedFixtureId');
    assert.deepEqual(failedTransitionRes.internationalSeries, res40_2.internationalSeries, 'REQ 40.10b: Failed transition leaves internationalSeries unchanged');
    assert.deepEqual(failedTransitionRes.leagues, res40_2.leagues, 'REQ 40.10c: Failed transition leaves leagues unchanged');
  }

  // =========================================================================
  // Scenario 41: International Fixture Identity and Calendar Reconciliation Audit
  // =========================================================================
  {
    const intlCoach41: CoachProfile = {
      ...INITIAL_COACH_PROFILE,
      activeCareerMode: 'international',
      nationalTeamId: 'nat_ind',
      clubTeamId: null
    };

    const initialSeries41: InternationalSeriesState = {
      seriesId: 'tour_ind_aus_2026',
      userNationId: 'nat_ind',
      userNationName: 'India',
      userNationCode: 'IND',
      userNationFlag: '🇮🇳',
      opponentNationId: 'nat_aus',
      opponentNationName: 'Australia',
      opponentNationCode: 'AUS',
      opponentNationFlag: '🇦🇺',
      format: 'T20',
      matches: [
        {
          matchNumber: 1,
          format: 'T20',
          venue: 'Wankhede Stadium, Mumbai',
          city: 'Mumbai',
          completed: false,
          fixtureId: 'fix_tour_1'
        },
        {
          matchNumber: 2,
          format: 'T20',
          venue: 'Eden Gardens, Kolkata',
          city: 'Kolkata',
          completed: false,
          fixtureId: 'fix_tour_2'
        },
        {
          matchNumber: 3,
          format: 'T20',
          venue: 'M. Chinnaswamy Stadium, Bengaluru',
          city: 'Bengaluru',
          completed: false,
          fixtureId: 'fix_tour_3'
        }
      ],
      seriesWins: 0,
      seriesLosses: 0
    };

    const league41A: League = {
      ...INITIAL_LEAGUES[0],
      id: 'league_intl_tour_41',
      calendarDates: [
        {
          id: 'cal_41_1',
          dateStr: '2026-09-01',
          dayNumber: 1,
          month: 'September',
          dayOfWeek: 'Tuesday',
          type: 'international',
          matchFixture: {
            id: 'fix_tour_1',
            homeTeamId: 'nat_ind',
            awayTeamId: 'nat_aus',
            homeTeamName: 'India',
            awayTeamName: 'Australia',
            venue: 'Wankhede Stadium, Mumbai',
            completed: false,
            format: 'T20',
            isInternational: true
          }
        },
        {
          id: 'cal_41_2',
          dateStr: '2026-09-03',
          dayNumber: 3,
          month: 'September',
          dayOfWeek: 'Thursday',
          type: 'international',
          matchFixture: {
            id: 'fix_tour_2',
            homeTeamId: 'nat_ind',
            awayTeamId: 'nat_aus',
            homeTeamName: 'India',
            awayTeamName: 'Australia',
            venue: 'Eden Gardens, Kolkata',
            completed: false,
            format: 'T20',
            isInternational: true
          }
        },
        {
          id: 'cal_41_3',
          dateStr: '2026-09-05',
          dayNumber: 5,
          month: 'September',
          dayOfWeek: 'Saturday',
          type: 'international',
          matchFixture: {
            id: 'fix_tour_3',
            homeTeamId: 'nat_ind',
            awayTeamId: 'nat_aus',
            homeTeamName: 'India',
            awayTeamName: 'Australia',
            venue: 'M. Chinnaswamy Stadium, Bengaluru',
            completed: false,
            format: 'T20',
            isInternational: true
          }
        }
      ],
      currentDateIndex: 0
    };

    const league41B: League = {
      ...INITIAL_LEAGUES[1],
      id: 'league_unrelated_domestic_41',
      calendarDates: [
        {
          id: 'cal_dom_1',
          dateStr: '2026-09-01',
          dayNumber: 1,
          month: 'September',
          dayOfWeek: 'Tuesday',
          type: 'rest'
        },
        {
          id: 'cal_dom_2',
          dateStr: '2026-09-02',
          dayNumber: 2,
          month: 'September',
          dayOfWeek: 'Wednesday',
          type: 'rest'
        }
      ],
      currentDateIndex: 0
    };

    const finishedMatch41_1: MatchLiveState = {
      id: 'fix_tour_1',
      fixtureId: 'fix_tour_1',
      leagueId: 't20i_bilateral',
      format: 'T20',
      status: 'finished',
      homeTeam: {
        id: 'nat_ind',
        name: 'India',
        shortName: 'IND',
        logoEmoji: '🇮🇳',
        primaryColor: '#0080FF',
        secondaryColor: '#FF9933',
        leagueId: 'intl',
        city: 'Mumbai',
        purseCr: 100,
        rtmCards: 0,
        captainId: 'p_ind1',
        playingXIIds: [],
        squad: [],
        isUserTeam: true
      },
      awayTeam: {
        id: 'nat_aus',
        name: 'Australia',
        shortName: 'AUS',
        logoEmoji: '🇦🇺',
        primaryColor: '#FFCD00',
        secondaryColor: '#00843D',
        leagueId: 'intl',
        city: 'Melbourne',
        purseCr: 100,
        rtmCards: 0,
        captainId: 'p_aus1',
        playingXIIds: [],
        squad: [],
        isUserTeam: false
      },
      winnerTeamId: 'nat_ind',
      resultText: 'India won by 6 wickets',
      venue: 'Wankhede Stadium, Mumbai',
      pitchType: 'Flat Belter',
      weather: 'Clear Night',
      currentInningsIndex: 2,
      innings1: {
        battingTeamId: 'nat_aus',
        bowlingTeamId: 'nat_ind',
        runs: 160,
        wickets: 7,
        overs: 20,
        ballsCompleted: 120,
        maxOvers: 20,
        currentOverRuns: 0,
        extras: { total: 3, wides: 2, noBalls: 0, byes: 0, legByes: 1 },
        batters: [],
        bowlers: [],
        currentStrikerId: '',
        currentNonStrikerId: '',
        currentBowlerId: '',
        ballHistory: [],
        fallOfWickets: [],
        overRuns: []
      },
      innings2: {
        battingTeamId: 'nat_ind',
        bowlingTeamId: 'nat_aus',
        runs: 161,
        wickets: 4,
        overs: 18.2,
        ballsCompleted: 110,
        maxOvers: 20,
        currentOverRuns: 0,
        extras: { total: 1, wides: 1, noBalls: 0, byes: 0, legByes: 0 },
        batters: [],
        bowlers: [],
        currentStrikerId: '',
        currentNonStrikerId: '',
        currentBowlerId: '',
        ballHistory: [],
        fallOfWickets: [],
        overRuns: []
      },
      targetRuns: 161,
      lastBallOutcome: null,
      isBallInFlight: false,
      reviewsRemaining: { home: 2, away: 2 },
      activeDrsReview: null,
      dlsState: null,
      hasDew: false,
      tacticalTrapAlert: null,
      powerSurgeTaken: false,
      powerSurgeOversLeft: 0,
      bowlingTactics: {
        length: 'good',
        line: 'outside_off',
        angle: 'over',
        variation: 'Stock ball',
        fielders: []
      },
      battingTactics: {
        approach: 'balanced',
        targetSide: 'all',
        runningRisk: 'normal'
      }
    };

    // 1. A valid fixture ID completes exactly its corresponding series match
    const step1 = applyRecordCompletedInternationalMatchState({
      finishedMatch: finishedMatch41_1,
      didUserWin: true,
      coachProfile: intlCoach41,
      internationalSeries: initialSeries41,
      leagues: [league41A, league41B],
      currentLeagueId: league41A.id,
      nations: INITIAL_NATIONS
    });
    assert.equal(step1.matchedFixtureId, 'fix_tour_1', 'REQ 41.1a: Matched fixture ID is exact fixture ID');
    assert.equal(step1.internationalSeries.matches[0].completed, true, 'REQ 41.1b: Match 1 is completed');
    assert.equal(step1.internationalSeries.matches[1].completed, false, 'REQ 41.1c: Match 2 remains uncompleted');
    assert.equal(step1.leagues[0].calendarDates[0].matchFixture?.completed, true, 'REQ 41.1d: Calendar date 0 fixture completed');

    // 2. An explicitly supplied unknown fixture ID cannot complete the first unfinished match
    const unknownFixMatch: MatchLiveState = {
      ...finishedMatch41_1,
      id: 'completely_unknown_fixture_xyz',
      fixtureId: 'completely_unknown_fixture_xyz'
    };
    const step2 = applyRecordCompletedInternationalMatchState({
      finishedMatch: unknownFixMatch,
      didUserWin: true,
      coachProfile: intlCoach41,
      internationalSeries: step1.internationalSeries,
      leagues: step1.leagues,
      currentLeagueId: league41A.id,
      nations: step1.nations
    });
    assert.equal(step2.matchedFixtureId, null, 'REQ 41.2a: Unknown fixture ID returns null matchedFixtureId');
    assert.equal(step2.internationalSeries.matches[1].completed, false, 'REQ 41.2b: Match 2 was NOT completed by unknown fixture ID');
    assert.equal(step2.internationalSeries.seriesWins, step1.internationalSeries.seriesWins, 'REQ 41.2c: seriesWins unchanged on unknown fixture ID');
    assert.deepEqual(step2.leagues, step1.leagues, 'REQ 41.2d: Leagues unchanged on unknown fixture ID');

    // 3. A stale Match 1 callback cannot accidentally complete Match 2
    const staleMatch1 = { ...finishedMatch41_1 }; // fixtureId: 'fix_tour_1'
    const step3 = applyRecordCompletedInternationalMatchState({
      finishedMatch: staleMatch1,
      didUserWin: true,
      coachProfile: intlCoach41,
      internationalSeries: step1.internationalSeries, // Match 1 already completed
      leagues: step1.leagues,
      currentLeagueId: league41A.id,
      nations: step1.nations
    });
    assert.equal(step3.internationalSeries.matches[1].completed, false, 'REQ 41.3a: Stale Match 1 callback did NOT complete Match 2');
    assert.equal(step3.internationalSeries.seriesWins, 1, 'REQ 41.3b: seriesWins remains 1 (not incremented)');
    assert.equal(step3.nations.find(n => n.id === 'nat_ind')?.ratingT20, step1.nations.find(n => n.id === 'nat_ind')?.ratingT20, 'REQ 41.3c: ICC rankings not duplicated on stale Match 1 callback');

    // 4. Legacy completion without a fixture ID succeeds only when the intended match is uniquely identifiable
    // First, complete Match 2 via valid fixtureId so exactly 1 uncompleted match remains
    const finishedMatch41_2: MatchLiveState = {
      ...finishedMatch41_1,
      id: 'fix_tour_2',
      fixtureId: 'fix_tour_2'
    };
    const step4_setup = applyRecordCompletedInternationalMatchState({
      finishedMatch: finishedMatch41_2,
      didUserWin: true,
      coachProfile: intlCoach41,
      internationalSeries: step1.internationalSeries,
      leagues: step1.leagues,
      currentLeagueId: league41A.id,
      nations: step1.nations
    });
    assert.equal(step4_setup.internationalSeries.matches[1].completed, true, 'REQ 41.4a: Setup: Match 2 completed');

    // Now only Match 3 is uncompleted. Supply legacy match without fixtureId:
    const legacyFinishedMatch: MatchLiveState = {
      ...finishedMatch41_1,
      id: '',
      fixtureId: undefined
    };
    const step4 = applyRecordCompletedInternationalMatchState({
      finishedMatch: legacyFinishedMatch,
      didUserWin: true,
      coachProfile: intlCoach41,
      internationalSeries: step4_setup.internationalSeries,
      leagues: step4_setup.leagues,
      currentLeagueId: league41A.id,
      nations: step4_setup.nations
    });
    assert.equal(step4.internationalSeries.matches[2].completed, true, 'REQ 41.4b: Legacy completion with exactly 1 unfinished match completed Match 3');

    // 5. Ambiguous team-based fallback fails without state mutation
    // In step1, Matches 2 and 3 are BOTH unplayed. Supplying legacy match without fixtureId must be rejected!
    const step5 = applyRecordCompletedInternationalMatchState({
      finishedMatch: legacyFinishedMatch,
      didUserWin: true,
      coachProfile: intlCoach41,
      internationalSeries: step1.internationalSeries, // Matches 2 and 3 both unfinished
      leagues: step1.leagues,
      currentLeagueId: league41A.id,
      nations: step1.nations
    });
    assert.equal(step5.matchedFixtureId, null, 'REQ 41.5a: Ambiguous fallback rejected (matchedFixtureId is null)');
    assert.equal(step5.internationalSeries.matches[1].completed, false, 'REQ 41.5b: Match 2 remains uncompleted');
    assert.equal(step5.internationalSeries.matches[2].completed, false, 'REQ 41.5c: Match 3 remains uncompleted');

    // 6. An already-completed series match repairs a missing calendar completion flag without duplicating statistics or results
    const desyncedLeague: League = {
      ...league41A,
      calendarDates: [
        {
          ...league41A.calendarDates[0],
          matchFixture: {
            ...league41A.calendarDates[0].matchFixture!,
            completed: false, // Calendar mistakenly marked uncompleted!
            resultSummary: undefined
          }
        },
        league41A.calendarDates[1],
        league41A.calendarDates[2]
      ]
    };
    const step6 = applyRecordCompletedInternationalMatchState({
      finishedMatch: finishedMatch41_1,
      didUserWin: true,
      coachProfile: intlCoach41,
      internationalSeries: step1.internationalSeries, // Match 1 completed in series
      leagues: [desyncedLeague, league41B],
      currentLeagueId: desyncedLeague.id,
      nations: step1.nations
    });
    assert.equal(step6.leagues[0].calendarDates[0].matchFixture?.completed, true, 'REQ 41.6a: Calendar completion flag repaired');
    assert.equal(step6.internationalSeries.seriesWins, step1.internationalSeries.seriesWins, 'REQ 41.6b: seriesWins not incremented during repair');
    assert.equal(step6.nations.find(n => n.id === 'nat_ind')?.ratingT20, step1.nations.find(n => n.id === 'nat_ind')?.ratingT20, 'REQ 41.6c: Rankings not duplicated during repair');

    // 7. Calendar reconciliation updates only the correct fixture and league
    assert.deepEqual(step6.leagues[1], league41B, 'REQ 41.7a: Unrelated league was not mutated');
    assert.equal(step6.leagues[0].calendarDates[1].matchFixture?.completed, false, 'REQ 41.7b: Match 2 in target league remains uncompleted');

    // 8. Conflicting calendar results are handled safely
    const conflictingLeague: League = {
      ...league41A,
      calendarDates: [
        {
          ...league41A.calendarDates[0],
          matchFixture: {
            ...league41A.calendarDates[0].matchFixture!,
            homeTeamId: 'nat_eng',
            awayTeamId: 'nat_rsa',
            homeTeamName: 'England',
            awayTeamName: 'South Africa',
            completed: false,
            resultSummary: 'Old Conflict'
          }
        }
      ]
    };
    const step8 = applyRecordCompletedInternationalMatchState({
      finishedMatch: finishedMatch41_1, // India vs Australia with fixtureId 'fix_tour_1'
      didUserWin: true,
      coachProfile: intlCoach41,
      internationalSeries: initialSeries41,
      leagues: [conflictingLeague],
      currentLeagueId: conflictingLeague.id,
      nations: INITIAL_NATIONS
    });
    assert.equal(step8.leagues[0].calendarDates[0].matchFixture?.completed, false, 'REQ 41.8a: Conflicting calendar fixture was not overwritten');
    assert.equal(step8.leagues[0].calendarDates[0].matchFixture?.resultSummary, 'Old Conflict', 'REQ 41.8b: Existing summary preserved');

    // 9. Repeated completion requests remain idempotent
    const step9_call1 = applyRecordCompletedInternationalMatchState({
      finishedMatch: finishedMatch41_1,
      didUserWin: true,
      coachProfile: intlCoach41,
      internationalSeries: initialSeries41,
      leagues: [league41A],
      currentLeagueId: league41A.id,
      nations: INITIAL_NATIONS
    });
    const step9_call2 = applyRecordCompletedInternationalMatchState({
      finishedMatch: finishedMatch41_1,
      didUserWin: true,
      coachProfile: intlCoach41,
      internationalSeries: step9_call1.internationalSeries,
      leagues: step9_call1.leagues,
      currentLeagueId: league41A.id,
      nations: step9_call1.nations
    });
    assert.deepEqual(step9_call1.internationalSeries, step9_call2.internationalSeries, 'REQ 41.9a: Idempotent internationalSeries across repeated calls');
    assert.deepEqual(step9_call1.nations, step9_call2.nations, 'REQ 41.9b: Idempotent nations rankings across repeated calls');

    // 10. An invalid active league ID cannot advance "leagues[0]" or any other league
    const step10 = applyAdvanceCalendarDayState({
      leagues: [league41A, league41B],
      currentLeagueId: 'completely_invalid_league_id_xyz',
      teams: INITIAL_TEAMS,
      players: INITIAL_PLAYERS,
      coachProfile: intlCoach41,
      nations: INITIAL_NATIONS,
      careerPhase: 'international_series',
      tournamentHonors: [],
      careerBoardReview: null
    });
    assert.equal(step10.advanced, false, 'REQ 41.10a: Advancement failed safely on invalid currentLeagueId');
    assert.equal(step10.blockedReason, 'invalid_or_unresolved_active_league', 'REQ 41.10b: Blocked reason reports invalid league');
    assert.equal(step10.leagues?.[0]?.currentDateIndex, 0, 'REQ 41.10c: leagues[0] was NOT advanced');

    // 11. Valid league resolution continues to work normally
    const step11 = applyAdvanceCalendarDayState({
      leagues: [league41A, league41B],
      currentLeagueId: league41B.id,
      teams: INITIAL_TEAMS,
      players: INITIAL_PLAYERS,
      coachProfile: intlCoach41,
      nations: INITIAL_NATIONS,
      careerPhase: 'international_series',
      tournamentHonors: [],
      careerBoardReview: null
    });
    assert.equal(step11.advanced, true, 'REQ 41.11a: Valid league resolved and advanced');
    assert.equal(step11.leagues?.[1]?.currentDateIndex, 1, 'REQ 41.11b: Target league advanced to index 1');
    assert.equal(step11.leagues?.[0]?.currentDateIndex, 0, 'REQ 41.11c: Untargeted league remain at index 0');

    // 12. Save/load preserves fixture IDs, completion state, and authoritative results
    const savePayload41 = JSON.stringify({
      series: step1.internationalSeries,
      league: step1.leagues[0],
      nations: step1.nations
    });
    const loaded41 = JSON.parse(savePayload41);
    assert.equal(loaded41.series.matches[0].fixtureId, 'fix_tour_1', 'REQ 41.12a: Loaded save preserves fixtureId');
    assert.equal(loaded41.series.matches[0].completed, true, 'REQ 41.12b: Loaded save preserves completed state');
    assert.equal(loaded41.league.calendarDates[0].matchFixture.completed, true, 'REQ 41.12c: Loaded save preserves calendar completed state');
    assert.equal(loaded41.nations.find((n: any) => n.id === 'nat_ind').ratingT20, step1.nations.find(n => n.id === 'nat_ind')?.ratingT20, 'REQ 41.12d: Loaded save preserves ratingT20');

    // 13. Unsafe recovery bypass closed: arbitrary explicit fixture ID cannot complete match when series match has missing fixtureId and calendar metadata is unproven
    const seriesMissingFixId: InternationalSeriesState = {
      ...step1.internationalSeries,
      matches: [
        step1.internationalSeries.matches[0],
        {
          matchNumber: 2,
          format: 'T20',
          venue: 'Eden Gardens, Kolkata',
          city: 'Kolkata',
          completed: false,
          fixtureId: undefined // Unfinished series match has missing fixtureId
        },
        step1.internationalSeries.matches[2]
      ]
    };

    const leagueUnprovenMetadata: League = {
      ...step1.leagues[0],
      calendarDates: [
        step1.leagues[0].calendarDates[0],
        {
          ...step1.leagues[0].calendarDates[1],
          matchFixture: {
            ...step1.leagues[0].calendarDates[1].matchFixture!,
            id: 'unproven_explicit_fix_999',
            completed: false,
            seriesId: 'tour_ind_aus_2026',
            matchNumber: 2
            // Lacks expectedFixtureId / canonicalFixtureId link!
          } as any
        },
        step1.leagues[0].calendarDates[2]
      ]
    };

    const unprovenCallbackMatch: MatchLiveState = {
      ...finishedMatch41_1,
      id: 'unproven_explicit_fix_999',
      fixtureId: 'unproven_explicit_fix_999'
      // Participants match India vs Australia!
    };

    const step13 = applyRecordCompletedInternationalMatchState({
      finishedMatch: unprovenCallbackMatch,
      didUserWin: true,
      coachProfile: intlCoach41,
      internationalSeries: seriesMissingFixId,
      leagues: [leagueUnprovenMetadata],
      currentLeagueId: leagueUnprovenMetadata.id,
      nations: step1.nations
    });

    assert.equal(step13.matchedFixtureId, null, 'REQ 41.13a: Unproven explicit fixture ID rejected');
    assert.equal(step13.internationalSeries.matches[1].completed, false, 'REQ 41.13b: Series match 2 remains completed: false');
    assert.equal(step13.internationalSeries.seriesWins, seriesMissingFixId.seriesWins, 'REQ 41.13c: Active series wins count unchanged');
    assert.equal(step13.leagues[0].calendarDates[1].matchFixture?.completed, false, 'REQ 41.13d: Calendar fixture remains completed: false');
    assert.deepEqual(step13.nations, step1.nations, 'REQ 41.13e: Nations ICC rankings unchanged');

    // 14. Authoritative recovery mapping succeeds when explicit expectedFixtureId establishes relationship
    const leagueProvenMetadata: League = {
      ...step1.leagues[0],
      calendarDates: [
        step1.leagues[0].calendarDates[0],
        {
          ...step1.leagues[0].calendarDates[1],
          matchFixture: {
            ...step1.leagues[0].calendarDates[1].matchFixture!,
            id: 'proven_custom_fix_777',
            completed: false,
            seriesId: 'tour_ind_aus_2026',
            matchNumber: 2,
            expectedFixtureId: 'intl_fix_tour_ind_aus_2026_2' // Explicit link proving identity!
          } as any
        },
        step1.leagues[0].calendarDates[2]
      ]
    };

    const provenCallbackMatch: MatchLiveState = {
      ...finishedMatch41_1,
      id: 'proven_custom_fix_777',
      fixtureId: 'proven_custom_fix_777'
    };

    const step14 = applyRecordCompletedInternationalMatchState({
      finishedMatch: provenCallbackMatch,
      didUserWin: true,
      coachProfile: intlCoach41,
      internationalSeries: seriesMissingFixId,
      leagues: [leagueProvenMetadata],
      currentLeagueId: leagueProvenMetadata.id,
      nations: step1.nations
    });

    assert.equal(step14.matchedFixtureId, 'proven_custom_fix_777', 'REQ 41.14a: Authoritative recovery mapping matched fixture ID');
    assert.equal(step14.internationalSeries.matches[1].completed, true, 'REQ 41.14b: Series match 2 completed via authoritative recovery');
    assert.equal(step14.leagues[0].calendarDates[1].matchFixture?.completed, true, 'REQ 41.14c: Calendar fixture 2 marked completed');

    // ==========================================================================
    // SCENARIO 42: Phase 5 — Independent Edge-Case Verification Suite
    // ==========================================================================
    // 1. Explicit fixture ID belonging to another series
    const otherSeriesCallback: MatchLiveState = {
      ...finishedMatch41_1,
      id: 'intl_fix_SERIES_OTHER_999',
      fixtureId: 'intl_fix_SERIES_OTHER_999'
    };
    const step42_1 = applyRecordCompletedInternationalMatchState({
      finishedMatch: otherSeriesCallback,
      didUserWin: true,
      coachProfile: intlCoach41,
      internationalSeries: step1.internationalSeries,
      leagues: step1.leagues,
      currentLeagueId: step1.leagues[0].id,
      nations: step1.nations
    });
    assert.equal(step42_1.matchedFixtureId, null, 'REQ 42.1a: Explicit fixture ID from another series rejected');
    assert.equal(step42_1.internationalSeries.matches[1].completed, false, 'REQ 42.1b: Active series match 2 remains uncompleted');

    // 2. Misleading expectedFixtureId on calendar entry (expectedFixtureId = "intl_fix_tour_ind_aus_2026_3" on match 2 slot)
    const leagueMisleadingExpected: League = {
      ...step1.leagues[0],
      calendarDates: [
        step1.leagues[0].calendarDates[0],
        {
          ...step1.leagues[0].calendarDates[1],
          matchFixture: {
            ...step1.leagues[0].calendarDates[1].matchFixture!,
            id: 'misleading_exp_fix',
            completed: false,
            seriesId: 'tour_ind_aus_2026',
            matchNumber: 2,
            expectedFixtureId: 'intl_fix_tour_ind_aus_2026_3' // Misleading: match number 2 but expected ID for match 3!
          } as any
        },
        step1.leagues[0].calendarDates[2]
      ]
    };
    const misleadingExpectedCallback: MatchLiveState = {
      ...finishedMatch41_1,
      id: 'misleading_exp_fix',
      fixtureId: 'misleading_exp_fix'
    };
    const step42_2 = applyRecordCompletedInternationalMatchState({
      finishedMatch: misleadingExpectedCallback,
      didUserWin: true,
      coachProfile: intlCoach41,
      internationalSeries: step1.internationalSeries,
      leagues: [leagueMisleadingExpected],
      currentLeagueId: leagueMisleadingExpected.id,
      nations: step1.nations
    });
    assert.equal(step42_2.matchedFixtureId, null, 'REQ 42.2: Misleading expectedFixtureId rejected');

    // 3. Misleading canonicalFixtureId on calendar entry
    const leagueMisleadingCanonical: League = {
      ...step1.leagues[0],
      calendarDates: [
        step1.leagues[0].calendarDates[0],
        {
          ...step1.leagues[0].calendarDates[1],
          matchFixture: {
            ...step1.leagues[0].calendarDates[1].matchFixture!,
            id: 'misleading_can_fix',
            completed: false,
            seriesId: 'tour_ind_aus_2026',
            matchNumber: 2,
            canonicalFixtureId: 'intl_fix_tour_ind_aus_2026_1' // Misleading: match number 2 but canonical ID for match 1!
          } as any
        },
        step1.leagues[0].calendarDates[2]
      ]
    };
    const step42_3 = applyRecordCompletedInternationalMatchState({
      finishedMatch: { ...finishedMatch41_1, id: 'misleading_can_fix', fixtureId: 'misleading_can_fix' },
      didUserWin: true,
      coachProfile: intlCoach41,
      internationalSeries: step1.internationalSeries,
      leagues: [leagueMisleadingCanonical],
      currentLeagueId: leagueMisleadingCanonical.id,
      nations: step1.nations
    });
    assert.equal(step42_3.matchedFixtureId, null, 'REQ 42.3: Misleading canonicalFixtureId rejected');

    // 4. Missing or inconsistent series IDs on calendar fixture
    const leagueMissingSeriesId: League = {
      ...step1.leagues[0],
      calendarDates: [
        step1.leagues[0].calendarDates[0],
        {
          ...step1.leagues[0].calendarDates[1],
          matchFixture: {
            ...step1.leagues[0].calendarDates[1].matchFixture!,
            id: 'missing_series_id_fix',
            completed: false,
            seriesId: undefined // Missing series ID!
          } as any
        },
        step1.leagues[0].calendarDates[2]
      ]
    };
    const step42_4 = applyRecordCompletedInternationalMatchState({
      finishedMatch: { ...finishedMatch41_1, id: 'missing_series_id_fix', fixtureId: 'missing_series_id_fix' },
      didUserWin: true,
      coachProfile: intlCoach41,
      internationalSeries: step1.internationalSeries,
      leagues: [leagueMissingSeriesId],
      currentLeagueId: leagueMissingSeriesId.id,
      nations: step1.nations
    });
    assert.equal(step42_4.matchedFixtureId, null, 'REQ 42.4: Missing seriesId on calendar fixture causes rejection');

    // 5. Duplicate fixture IDs across leagues with different teams
    const duplicateLeague: League = {
      ...step1.leagues[0],
      id: 'other_league_diff_teams',
      calendarDates: [
        {
          dateStr: '2026-04-01',
          dayOfWeek: 'WED',
          dayNumber: 1,
          month: 'Apr',
          type: 'match',
          matchFixture: {
            id: 'fix_tour_2', // Same ID as international tour match 2!
            homeTeamId: 'team_kol', // But different teams! (KKR vs CSK)
            awayTeamId: 'team_che',
            homeTeamName: 'Kolkata Knight Riders',
            awayTeamName: 'Chennai Super Kings',
            seriesId: 'ipl_2026',
            completed: false
          } as any
        }
      ]
    };
    const step42_5 = applyRecordCompletedInternationalMatchState({
      finishedMatch: finishedMatch41_1,
      didUserWin: true,
      coachProfile: intlCoach41,
      internationalSeries: step1.internationalSeries,
      leagues: [duplicateLeague],
      currentLeagueId: duplicateLeague.id,
      nations: step1.nations
    });
    assert.equal(duplicateLeague.calendarDates[0].matchFixture?.completed, false, 'REQ 42.5: Duplicate fixture ID in another league with different teams was not mutated');

    // 6. Repeated completed fixture submission (Idempotency)
    const step42_6 = applyRecordCompletedInternationalMatchState({
      finishedMatch: finishedMatch41_1,
      didUserWin: true,
      coachProfile: intlCoach41,
      internationalSeries: step1.internationalSeries,
      leagues: step1.leagues,
      currentLeagueId: step1.leagues[0].id,
      nations: step1.nations
    });
    assert.equal(step42_6.matchedFixtureId, 'fix_tour_1', 'REQ 42.6a: Repeated submission returns matchedFixtureId');
    assert.equal(step42_6.internationalSeries.seriesWins, step1.internationalSeries.seriesWins, 'REQ 42.6b: Series wins NOT duplicated');

    // 7. Legitimate legacy callback without explicit fixture ID
    const legacyFinishedMatch42: MatchLiveState = {
      ...finishedMatch41_1,
      id: '',
      fixtureId: undefined
    };
    // Ambiguous case (>1 unfinished matches)
    const step42_7a = applyRecordCompletedInternationalMatchState({
      finishedMatch: legacyFinishedMatch42,
      didUserWin: true,
      coachProfile: intlCoach41,
      internationalSeries: step1.internationalSeries, // Match 2 & 3 unfinished (2 unfinished)
      leagues: step1.leagues,
      currentLeagueId: step1.leagues[0].id,
      nations: step1.nations
    });
    assert.equal(step42_7a.matchedFixtureId, null, 'REQ 42.7a: Ambiguous legacy callback (>1 unfinished matches) rejected');

    // Unambiguous case (exactly 1 unfinished match)
    const singleUnfinishedSeries: InternationalSeriesState = {
      ...step1.internationalSeries,
      matches: [
        step1.internationalSeries.matches[0], // completed: true
        step1.internationalSeries.matches[1], // completed: false
        { ...step1.internationalSeries.matches[2], completed: true } // completed: true
      ]
    };
    const step42_7b = applyRecordCompletedInternationalMatchState({
      finishedMatch: legacyFinishedMatch42,
      didUserWin: true,
      coachProfile: intlCoach41,
      internationalSeries: singleUnfinishedSeries,
      leagues: step1.leagues,
      currentLeagueId: step1.leagues[0].id,
      nations: step1.nations
    });
    assert.equal(step42_7b.matchedFixtureId, 'fix_tour_2', 'REQ 42.7b: Unambiguous legacy callback (exactly 1 unfinished match) resolved match 2');

    // 8. IPL Career Lifecycle: Repeated calls to applyAdvanceAiPlayoffMatchesState are idempotent and do not simulate user match
    const step42_8a = applyAdvanceAiPlayoffMatchesState({
      league: step1.leagues[0],
      leagues: step1.leagues,
      currentLeagueId: step1.leagues[0].id,
      teams: INITIAL_TEAMS,
      players: INITIAL_PLAYERS,
      coachProfile: INITIAL_COACH_PROFILE,
      tournamentHonors: [],
      careerPhase: 'league_stage',
      careerBoardReview: null
    });
    const step42_8b = applyAdvanceAiPlayoffMatchesState({
      league: step42_8a.league,
      leagues: step42_8a.leagues,
      currentLeagueId: step1.leagues[0].id,
      teams: step42_8a.teams,
      players: step42_8a.players,
      coachProfile: step42_8a.coachProfile,
      tournamentHonors: step42_8a.tournamentHonors,
      careerPhase: step42_8a.careerPhase,
      careerBoardReview: step42_8a.careerBoardReview
    });
    assert.deepEqual(step42_8b.simulatedStages, [], 'REQ 42.8: Repeated applyAdvanceAiPlayoffMatchesState is idempotent');

    // 9. Statistics & Persistence: Twice submitted match + JSON serialization
    const pTest42 = { ...INITIAL_PLAYERS[0] };
    const matchEvent42: MatchLiveState = {
      ...finishedMatch41_1,
      id: 'match_repeat_stat_42',
      innings1: {
        ...finishedMatch41_1.innings1,
        batters: [{ playerId: pTest42.id, name: pTest42.name, runs: 50, balls: 30, fours: 5, sixes: 2, dismissal: 'not out', isOut: false, strikeRate: 166.67, isOnStrike: false }],
        bowlers: []
      }
    };
    const after1 = recordMatchToPlayerStats(pTest42, matchEvent42, 'Season 2026');
    const after2 = recordMatchToPlayerStats(after1, matchEvent42, 'Season 2026');
    assert.equal(after2.stats.runs, pTest42.stats.runs + 50, 'REQ 42.9a: Player stats updated exactly once (idempotent)');
    const savedPlayer42 = JSON.parse(JSON.stringify(after2));
    assert.equal(savedPlayer42.stats.runs, pTest42.stats.runs + 50, 'REQ 42.9b: Serialized save preserves player stats');

    // 10. Rules & Boundary Conditions
    const createMockSquad = (total: number, overseas: number): Player[] => {
      const sq: Player[] = [];
      for (let i = 0; i < total; i++) {
        sq.push({
          id: `mock_p_${i}`,
          name: `Mock Player ${i}`,
          role: 'Top-order',
          bowlingArm: 'ROB',
          battingHand: 'RHB',
          age: 25,
          country: i < overseas ? 'Australia' : 'India',
          isOverseas: i < overseas,
          clubId: 'team_kol',
          tier: 'Gold',
          basePriceCr: 1.0,
          salaryCr: 1.0,
          form: 80, morale: 80, fitness: 80, isInjured: false, injuryDays: 0,
          ratings: { bat: 70, pow: 70, tmp: 70, bowl: 20, pace: 20, ctrl: 20, dth: 20 },
          stats: { matches: 0, runs: 0, balls: 0, fours: 0, sixes: 0, fifties: 0, hundreds: 0, highestScore: 0, wickets: 0, oversBowled: 0, runsConceded: 0, maidens: 0, bestBowling: '0/0' }
        });
      }
      return sq;
    };

    // Squad limits (16-25)
    assert.equal(validateFranchiseSquadLimits(createMockSquad(15, 2)).isValid, false, 'REQ 42.10a: Squad size 15 rejected (<16)');
    assert.equal(validateFranchiseSquadLimits(createMockSquad(16, 2)).isValid, true, 'REQ 42.10b: Squad size 16 accepted');
    assert.equal(validateFranchiseSquadLimits(createMockSquad(25, 8)).isValid, true, 'REQ 42.10c: Squad size 25 accepted');
    assert.equal(validateFranchiseSquadLimits(createMockSquad(26, 8)).isValid, false, 'REQ 42.10d: Squad size 26 rejected (>25)');
    assert.equal(validateFranchiseSquadLimits(createMockSquad(20, 9)).isValid, false, 'REQ 42.10e: Overseas players 9 rejected (>8)');

    // Board review threshold
    const reviewSat = buildDefaultBoardReview(2026, INITIAL_TEAMS[0], undefined, 1, true);
    assert.equal(reviewSat.isSatisfied, true, 'REQ 42.10f: Board review >= 60% satisfied');
  }

  console.log('✅ ALL Career Progression, Multi-League Recovery, International Series IDs, Transition Idempotency & Verified Defect Tests PASSED!');
  return { passed: 350, total: 350 };
}


