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
    coachProfile: { ...INITIAL_COACH_PROFILE, clubTeamId: 'team_kol', nationalTeamId: ausNation.id },
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

  // Part 4 Scenario 10: Invalid opponent fails without state mutation
  assert.throws(
    () => buildInitialSeriesForNation(ausNation, [ausNation], 'non_existent_opp_999', 1),
    /no eligible opponent nation available/i,
    'Part 4 Scenario 10: Invalid opponent fails safely without creating an opponent'
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

  console.log('✅ ALL Career Progression, Multi-League Recovery, International Series IDs & Transition Idempotency Tests PASSED!');
  return { passed: 117, total: 117 };
}



