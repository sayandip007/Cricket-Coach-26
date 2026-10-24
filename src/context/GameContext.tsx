import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Player, Team, League, Nation, Achievement, JobOffer, CoachProfile,
  MatchLiveState, InningsData, AuctionLot, BatterInningsScorecard, BowlerInningsScorecard, FielderPosition, BallOutcome,
  CompletedMatchRecord, InboxMessage, TournamentHonor, TeamSeasonRecord,
  CareerPhase, CareerBoardReview, CalendarMatchFixture
} from '../types/cricket';
import {
  INITIAL_PLAYERS, INITIAL_TEAMS, INITIAL_LEAGUES, INITIAL_NATIONS,
  INITIAL_ACHIEVEMENTS, INITIAL_JOB_OFFERS, INITIAL_COACH_PROFILE, INITIAL_DEFAULT_FIELD, createInitialPlayoffs, createFreshPlayers
} from '../data/initialData';
import {
  simulateBall,
  resolveSingleDeliveryState,
  createHeadlessMatchState,
  simulateFullMatchHeadless,
  getFormatQuotaConfig,
  selectNextEligibleBowler,
  buildBowlerScorecardPool,
  createSeededRng
} from '../engine/cricketEngine';
import { calculateDLSTarget } from '../engine/dlsEngine';
import { checkDrsEligibility, evaluateDrsDeliveryEvidence, getInitialReviewsForFormat } from '../utils/drsRules';
import {
  oversToBalls,
  ballsToOvers,
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
  recordMatchToPlayerStats,
  validateImpactPlayerSubstitution
} from '../utils/playerStatsHelpers';
import {
  AuctionSandboxMode,
  buildAuctionSandboxState,
  isOverseasPlayer
} from '../utils/auctionSandboxEngine';
import { AuctionPlayerItem } from '../data/auctionSets2026';
import { sound } from '../utils/soundEffects';
import AsyncStorage from '@react-native-async-storage/async-storage';
import confetti from 'canvas-confetti';

export type MainTab = 'landing' | 'hub' | 'team' | 'league' | 'world' | 'profile' | 'auction' | 'live_match';

export interface AuctionSandboxSessionState {
  isActive: boolean;
  franchiseId: string;
  mode: AuctionSandboxMode;
  userRetainedPlayerIds: string[];
  sandboxTeams: Team[];
  sandboxPlayers: Player[];
  sandboxLots: AuctionPlayerItem[];
  teamPursesByShort: Record<string, number>;
  userPurseCr: number;
  userRtmCards: number;
  releasedPlayerIds: string[];
}

const INITIAL_COMPLETED_MATCHES: CompletedMatchRecord[] = [];

export function normalizeSeasonYear(raw?: string | number): string {
  if (raw === undefined || raw === null) return '2026';
  const str = String(raw).trim();
  if (!str || str.includes('2025/26') || str === 'Season 2025' || str === 'Season 2024' || str === '2025' || str === '2024') {
    return '2026';
  }
  const match = str.match(/20\d{2}/);
  if (match) {
    const yr = parseInt(match[0], 10);
    return yr < 2026 ? '2026' : String(yr);
  }
  return '2026';
}

export function sanitizeTournamentHonors(honors?: TournamentHonor[]): TournamentHonor[] {
  if (!Array.isArray(honors)) return [];
  return honors
    .filter(h => {
      const yStr = String(h?.year || '');
      if (yStr.includes('2024') || yStr.includes('2025')) return false;
      const match = yStr.match(/20\d{2}/);
      if (match && parseInt(match[0], 10) < 2026) return false;
      return Boolean(h && h.championTeamName);
    })
    .map(h => ({
      ...h,
      year: normalizeSeasonYear(h.year)
    }));
}

/**
 * Central DRS Review Trigger State Handler
 * Independently validates match state, active review status, latest delivery identity,
 * and canonical DRS eligibility before activating a review.
 */
export function applyTriggerDrsReviewState(
  prev: MatchLiveState | null,
  userTeamId: string,
  allPlayers: Player[]
): MatchLiveState | null {
  if (!prev || !prev.lastBallOutcome) return prev;
  if (prev.status !== 'in_progress') return prev;
  if (prev.activeDrsReview?.isActive) return prev;

  const lbo = prev.lastBallOutcome;
  const isFirst = prev.currentInningsIndex === 1;
  const curInnings = isFirst ? prev.innings1 : prev.innings2;
  if (!curInnings || curInnings.ballHistory.length === 0) return prev;

  const latestBall = curInnings.ballHistory[0];
  if (
    !latestBall ||
    latestBall.over !== lbo.over ||
    latestBall.ballNumber !== lbo.ballNumber ||
    latestBall.bowlerId !== lbo.bowlerId ||
    latestBall.strikerId !== lbo.strikerId ||
    latestBall.drsReviewed ||
    lbo.drsReviewed
  ) {
    return prev;
  }

  const isUserHome = prev.homeTeam.id === userTeamId || Boolean(prev.homeTeam.isUserTeam);
  const userMatchTeamId = isUserHome ? prev.homeTeam.id : prev.awayTeam.id;
  const isUserBatting = curInnings.battingTeamId === userMatchTeamId;
  const userSideKey: 'home' | 'away' = isUserHome ? 'home' : 'away';
  const initRevs = getInitialReviewsForFormat(prev.format);
  const reviewsLeft = prev.reviewsRemaining?.[userSideKey] ?? initRevs;

  const eligibility = checkDrsEligibility(lbo, isUserBatting, reviewsLeft, {
    isDrsActive: Boolean(prev.activeDrsReview?.isActive),
    matchStatus: prev.status,
    latestBallOutcome: latestBall
  });
  if (!eligibility.canReview) {
    return prev;
  }

  const reviewedBatterId = lbo.dismissedPlayerId || lbo.strikerId || curInnings.currentStrikerId;
  const reviewedBatterObj = allPlayers.find(p => p.id === reviewedBatterId) || allPlayers[0];
  const reviewedBowlerId = lbo.bowlerId || curInnings.currentBowlerId;
  const reviewedBowlerObj = allPlayers.find(p => p.id === reviewedBowlerId) || allPlayers[2];

  const originalDecision: 'OUT' | 'NOT OUT' = lbo.isWicket ? 'OUT' : 'NOT OUT';
  const line = prev.bowlingTactics?.line;
  const length = prev.bowlingTactics?.length;

  const forcedType = eligibility.reviewType === 'none' ? undefined : eligibility.reviewType;
  const evidence = evaluateDrsDeliveryEvidence(lbo, isUserBatting, originalDecision, line, length, forcedType);

  const reviewingTeamId = isUserBatting ? curInnings.battingTeamId : curInnings.bowlingTeamId;

  return {
    ...prev,
    activeDrsReview: {
      isActive: true,
      reviewingTeamId,
      batterId: reviewedBatterId,
      batterName: lbo.dismissedPlayerName || lbo.strikerName || reviewedBatterObj?.name || 'Batter',
      bowlerId: reviewedBowlerId,
      bowlerName: lbo.bowlerName || reviewedBowlerObj?.name || 'Bowler',
      replacedBatterId: lbo.incomingBatterId,
      type: evidence.reviewType === 'lbw' ? 'lbw' : 'caught',
      snickoSpike: evidence.snickoSpike,
      hawkeye: evidence.hawkeye,
      originalDecision: evidence.originalDecision,
      finalDecision: evidence.finalDecision,
      isOverturned: evidence.isOverturned,
      reviewRetained: evidence.reviewRetained
    }
  };
}

/**
 * Authoritative Bowler Selection State Handler
 * Validates bowling team membership, format quota, and consecutive over restrictions
 * (while allowing the sole remaining eligible bowler under quota to bowl consecutive overs).
 */
export function applySelectNewBowlerState(
  prev: MatchLiveState | null,
  bowlerId: string,
  players: Player[]
): MatchLiveState | null {
  if (!prev) return null;
  const isFirst = prev.currentInningsIndex === 1;
  const curInnings = isFirst ? prev.innings1 : prev.innings2;
  if (!curInnings) return prev;

  const bowlingTeam =
    curInnings.bowlingTeamId === prev.homeTeam.id ? prev.homeTeam : prev.awayTeam;
  const isBowlingTeamMember =
    bowlingTeam.playingXIIds.includes(bowlerId) ||
    Boolean(bowlingTeam.squad?.some(p => p.id === bowlerId));

  if (!isBowlingTeamMember) {
    console.warn(`[Bowler Selection Rejected] Player ${bowlerId} is not in bowling team ${bowlingTeam.name}`);
    return prev;
  }

  const quota = getFormatQuotaConfig(prev.format, curInnings.maxOvers);
  const prevBallBowlerId =
    curInnings.ballsCompleted > 0 && curInnings.ballsCompleted % 6 === 0
      ? curInnings.ballHistory[0]?.bowlerId
      : undefined;

  const existingCard = curInnings.bowlers.find(b => b.playerId === bowlerId);
  const isOverQuota = existingCard ? oversToBalls(existingCard.overs) >= quota.maxBallsPerBowler : false;

  // Count how many bowlers in the innings bowling attack currently have quota remaining
  const bowlersUnderQuota = curInnings.bowlers.filter(b => oversToBalls(b.overs) < quota.maxBallsPerBowler);
  const onlyOneBowlerUnderQuota =
    bowlersUnderQuota.length === 1 && bowlersUnderQuota[0].playerId === bowlerId;

  // Consecutive overs are prohibited UNLESS only this single bowler remains under quota
  const isConsecutive = Boolean(prevBallBowlerId && prevBallBowlerId === bowlerId);
  if (isConsecutive && !onlyOneBowlerUnderQuota) {
    console.warn(`[Bowler Selection Blocked] ${bowlerId} bowled the previous over and other bowlers have overs remaining.`);
    return prev;
  }

  if (isOverQuota && bowlersUnderQuota.length > 0) {
    console.warn(`[Bowler Selection Blocked] ${bowlerId} has exhausted their quota of ${quota.maxBallsPerBowler / 6} overs.`);
    return prev;
  }

  // Exact player ID is committed authoritatively
  const resolvedBowlerId = bowlerId;

  const bowlingTeamSquad = bowlingTeam.squad || [];
  const bowlerPlayer =
    players.find(p => p.id === resolvedBowlerId) ||
    bowlingTeamSquad.find(p => p.id === resolvedBowlerId);
  const updatedBowlers = [...curInnings.bowlers];
  let bScore = updatedBowlers.find(b => b.playerId === resolvedBowlerId);
  if (!bScore) {
    bScore = {
      playerId: resolvedBowlerId,
      name: bowlerPlayer?.name || 'Bowler',
      overs: 0,
      ballsInCurrentOver: 0,
      maidens: 0,
      runs: 0,
      runsConceded: 0,
      wickets: 0,
      economy: 0,
      isCurrentBowler: true
    };
    updatedBowlers.push(bScore);
  }

  const newBowlers = updatedBowlers.map(b => ({
    ...b,
    isCurrentBowler: b.playerId === resolvedBowlerId
  }));

  const newInnings: InningsData = {
    ...curInnings,
    currentBowlerId: resolvedBowlerId,
    bowlers: newBowlers
  };

  return {
    ...prev,
    innings1: isFirst ? newInnings : prev.innings1,
    innings2: isFirst ? prev.innings2 : newInnings
  };
}

/**
 * Authoritative Impact Player Substitution State Handler
 * Validates IPL 4-overseas limit on resulting active XI, prevents duplicate usage,
 * and updates the active XI, squad, and current innings scorecard cleanly.
 */
export function applyImpactPlayerSubstitutionState(
  prev: MatchLiveState | null,
  benchPlayerId: string,
  outPlayerId: string,
  userTeamId: string,
  players: Player[]
): MatchLiveState | null {
  if (!prev) return null;
  const isFirst = prev.currentInningsIndex === 1;
  const curInnings = isFirst ? prev.innings1 : prev.innings2;
  if (!curInnings) return prev;

  const combinedPool = [
    ...players,
    ...(prev.homeTeam.squad || []),
    ...(prev.awayTeam.squad || [])
  ];
  const benchPlayer = combinedPool.find(p => p.id === benchPlayerId);
  if (!benchPlayer) return prev;

  const isHomeTeamSub = prev.homeTeam.playingXIIds.includes(outPlayerId);
  const isAwayTeamSub = prev.awayTeam.playingXIIds.includes(outPlayerId);
  const isHomeUser = prev.homeTeam.id === userTeamId || Boolean(prev.homeTeam.isUserTeam);
  const teamKey: 'homeTeam' | 'awayTeam' = isHomeTeamSub
    ? 'homeTeam'
    : isAwayTeamSub
    ? 'awayTeam'
    : isHomeUser
    ? 'homeTeam'
    : 'awayTeam';
  const activeTeam = prev[teamKey];

  const outBatterCard = curInnings.batters.find(b => b.playerId === outPlayerId);

  const validation = validateImpactPlayerSubstitution({
    benchPlayerId,
    outPlayerId,
    activeXIIds: activeTeam.playingXIIds,
    allPlayers: combinedPool,
    impactPlayerAlreadyUsed: prev.impactPlayerUsed,
    isInternational: Boolean(prev.isInternational),
    maxOverseasInXI: 4,
    outPlayerDismissalStatus: outBatterCard?.dismissal
  });

  if (!validation.isValid) {
    console.warn(`[Impact Player Blocked] ${validation.reason}`);
    return prev;
  }

  const isSubstitutingTeamBatting = activeTeam.id === curInnings.battingTeamId;
  const isSubstitutingTeamBowling = activeTeam.id === curInnings.bowlingTeamId;

  let updatedBatters = [...curInnings.batters];
  let nextStrikerId = curInnings.currentStrikerId;
  let nextNonStrikerId = curInnings.currentNonStrikerId;

  if (isSubstitutingTeamBatting) {
    updatedBatters = curInnings.batters.map(b => {
      if (b.playerId === outPlayerId && b.dismissal === 'not out') {
        return { ...b, dismissal: 'substituted (Impact Sub)', isOnStrike: false };
      }
      return b;
    });

    if (!updatedBatters.some(b => b.playerId === benchPlayer.id)) {
      updatedBatters.push({
        playerId: benchPlayer.id,
        name: benchPlayer.name,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        dismissal: 'not out',
        strikeRate: 0,
        isOnStrike: curInnings.currentStrikerId === outPlayerId
      });
    }

    if (curInnings.currentStrikerId === outPlayerId) {
      nextStrikerId = benchPlayer.id;
    }
    if (curInnings.currentNonStrikerId === outPlayerId) {
      nextNonStrikerId = benchPlayer.id;
    }
    updatedBatters = updatedBatters.map(b => ({
      ...b,
      isOnStrike: b.playerId === nextStrikerId && b.dismissal === 'not out'
    }));
  }

  let updatedBowlers = [...curInnings.bowlers];
  let nextBowlerId = curInnings.currentBowlerId;

  if (isSubstitutingTeamBowling) {
    if (!updatedBowlers.some(b => b.playerId === benchPlayer.id)) {
      updatedBowlers.push({
        playerId: benchPlayer.id,
        name: benchPlayer.name,
        overs: 0,
        ballsInCurrentOver: 0,
        maidens: 0,
        runs: 0,
        wickets: 0,
        economy: 0,
        isCurrentBowler: curInnings.currentBowlerId === outPlayerId
      });
    }
    if (curInnings.currentBowlerId === outPlayerId) {
      nextBowlerId = benchPlayer.id;
      updatedBowlers = updatedBowlers.map(b => ({
        ...b,
        isCurrentBowler: b.playerId === nextBowlerId
      }));
    }
  }

  const updatedInnings: InningsData = {
    ...curInnings,
    batters: updatedBatters,
    bowlers: updatedBowlers,
    currentStrikerId: nextStrikerId,
    currentNonStrikerId: nextNonStrikerId,
    currentBowlerId: nextBowlerId
  };

  const newPlayingXIIds = activeTeam.playingXIIds.map(id =>
    id === outPlayerId ? benchPlayerId : id
  );

  const updatedSquad = activeTeam.squad?.some(p => p.id === benchPlayer.id)
    ? activeTeam.squad
    : [...(activeTeam.squad || []), benchPlayer];

  return {
    ...prev,
    impactPlayerUsed: true,
    homeTeam:
      teamKey === 'homeTeam'
        ? { ...prev.homeTeam, playingXIIds: newPlayingXIIds, squad: updatedSquad }
        : prev.homeTeam,
    awayTeam:
      teamKey === 'awayTeam'
        ? { ...prev.awayTeam, playingXIIds: newPlayingXIIds, squad: updatedSquad }
        : prev.awayTeam,
    innings1: isFirst ? updatedInnings : prev.innings1,
    innings2: isFirst ? prev.innings2 : updatedInnings
  };
}

export const CRICBUZZ_2026_INTL_TOURS: {
  id: string;
  dateStr: string;
  dayOfWeek: string;
  dayNumber: number;
  month: string;
  seriesName: string;
  matchTitle: string;
  homeNation: string;
  awayNation: string;
  homeCode: string;
  awayCode: string;
  homeFlag: string;
  awayFlag: string;
  venue: string;
  format: 'T20' | 'ODI' | 'TEST';
  completed?: boolean;
  resultSummary?: string;
}[] = [
  {
    id: 'cb_intl_1',
    dateStr: '2026-04-18',
    dayOfWeek: 'SAT',
    dayNumber: 18,
    month: 'Apr',
    seriesName: 'New Zealand tour of Bangladesh, 2026',
    matchTitle: '1st ODI · BAN vs NZ',
    homeNation: 'Bangladesh',
    awayNation: 'New Zealand',
    homeCode: 'BAN',
    awayCode: 'NZ',
    homeFlag: '🇧🇩',
    awayFlag: '🇳🇿',
    venue: 'Shere Bangla National Stadium, Dhaka',
    format: 'ODI',
    completed: false
  },
  {
    id: 'cb_intl_2',
    dateStr: '2026-04-21',
    dayOfWeek: 'TUE',
    dayNumber: 21,
    month: 'Apr',
    seriesName: 'New Zealand tour of Bangladesh, 2026',
    matchTitle: '2nd ODI · BAN vs NZ',
    homeNation: 'Bangladesh',
    awayNation: 'New Zealand',
    homeCode: 'BAN',
    awayCode: 'NZ',
    homeFlag: '🇧🇩',
    awayFlag: '🇳🇿',
    venue: 'Shere Bangla National Stadium, Dhaka',
    format: 'ODI',
    completed: false
  },
  {
    id: 'cb_intl_3',
    dateStr: '2026-04-24',
    dayOfWeek: 'FRI',
    dayNumber: 24,
    month: 'Apr',
    seriesName: 'New Zealand tour of Bangladesh, 2026',
    matchTitle: '3rd ODI · BAN vs NZ',
    homeNation: 'Bangladesh',
    awayNation: 'New Zealand',
    homeCode: 'BAN',
    awayCode: 'NZ',
    homeFlag: '🇧🇩',
    awayFlag: '🇳🇿',
    venue: 'Zahur Ahmed Chowdhury Stadium, Chattogram',
    format: 'ODI',
    completed: false
  },
  {
    id: 'cb_intl_4',
    dateStr: '2026-05-15',
    dayOfWeek: 'FRI',
    dayNumber: 15,
    month: 'May',
    seriesName: 'New Zealand tour of Ireland, 2026',
    matchTitle: 'Only Test · IRE vs NZ',
    homeNation: 'Ireland',
    awayNation: 'New Zealand',
    homeCode: 'IRE',
    awayCode: 'NZ',
    homeFlag: '☘️',
    awayFlag: '🇳🇿',
    venue: 'Civil Service Cricket Club, Belfast',
    format: 'TEST',
    completed: false
  },
  {
    id: 'cb_intl_5',
    dateStr: '2026-06-01',
    dayOfWeek: 'MON',
    dayNumber: 1,
    month: 'Jun',
    seriesName: 'Afghanistan tour of India, 2026',
    matchTitle: 'Only Test · IND vs AFG',
    homeNation: 'India',
    awayNation: 'Afghanistan',
    homeCode: 'IND',
    awayCode: 'AFG',
    homeFlag: '🇮🇳',
    awayFlag: '🇦🇫',
    venue: 'PCA New Stadium, New Chandigarh',
    format: 'TEST',
    completed: false
  },
  {
    id: 'cb_intl_6',
    dateStr: '2026-06-04',
    dayOfWeek: 'THU',
    dayNumber: 4,
    month: 'Jun',
    seriesName: 'New Zealand tour of England, 2026',
    matchTitle: '1st Test · ENG vs NZ',
    homeNation: 'England',
    awayNation: 'New Zealand',
    homeCode: 'ENG',
    awayCode: 'NZ',
    homeFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    awayFlag: '🇳🇿',
    venue: "Lord's Cricket Ground, London",
    format: 'TEST',
    completed: false
  },
  {
    id: 'cb_intl_7',
    dateStr: '2026-06-06',
    dayOfWeek: 'SAT',
    dayNumber: 6,
    month: 'Jun',
    seriesName: 'Afghanistan tour of India, 2026',
    matchTitle: '1st ODI · IND vs AFG',
    homeNation: 'India',
    awayNation: 'Afghanistan',
    homeCode: 'IND',
    awayCode: 'AFG',
    homeFlag: '🇮🇳',
    awayFlag: '🇦🇫',
    venue: 'HPCA Stadium, Dharamsala',
    format: 'ODI',
    completed: false
  },
  {
    id: 'cb_intl_8',
    dateStr: '2026-06-09',
    dayOfWeek: 'TUE',
    dayNumber: 9,
    month: 'Jun',
    seriesName: 'Afghanistan tour of India, 2026',
    matchTitle: '2nd ODI · IND vs AFG',
    homeNation: 'India',
    awayNation: 'Afghanistan',
    homeCode: 'IND',
    awayCode: 'AFG',
    homeFlag: '🇮🇳',
    awayFlag: '🇦🇫',
    venue: 'Ekana Cricket Stadium, Lucknow',
    format: 'ODI',
    completed: false
  },
  {
    id: 'cb_intl_9',
    dateStr: '2026-06-11',
    dayOfWeek: 'THU',
    dayNumber: 11,
    month: 'Jun',
    seriesName: 'Afghanistan tour of India, 2026',
    matchTitle: '3rd ODI · IND vs AFG',
    homeNation: 'India',
    awayNation: 'Afghanistan',
    homeCode: 'IND',
    awayCode: 'AFG',
    homeFlag: '🇮🇳',
    awayFlag: '🇦🇫',
    venue: 'M.A. Chidambaram Stadium, Chennai',
    format: 'ODI',
    completed: false
  },
  {
    id: 'cb_intl_10',
    dateStr: '2026-06-17',
    dayOfWeek: 'WED',
    dayNumber: 17,
    month: 'Jun',
    seriesName: 'New Zealand tour of England, 2026',
    matchTitle: '2nd Test · ENG vs NZ',
    homeNation: 'England',
    awayNation: 'New Zealand',
    homeCode: 'ENG',
    awayCode: 'NZ',
    homeFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    awayFlag: '🇳🇿',
    venue: 'Kennington Oval, London',
    format: 'TEST',
    completed: false
  },
  {
    id: 'cb_intl_11',
    dateStr: '2026-06-25',
    dayOfWeek: 'THU',
    dayNumber: 25,
    month: 'Jun',
    seriesName: 'New Zealand tour of England, 2026',
    matchTitle: '3rd Test · ENG vs NZ',
    homeNation: 'England',
    awayNation: 'New Zealand',
    homeCode: 'ENG',
    awayCode: 'NZ',
    homeFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    awayFlag: '🇳🇿',
    venue: 'Trent Bridge, Nottingham',
    format: 'TEST',
    completed: false
  },
  {
    id: 'cb_intl_12',
    dateStr: '2026-07-01',
    dayOfWeek: 'WED',
    dayNumber: 1,
    month: 'Jul',
    seriesName: 'India tour of England, 2026',
    matchTitle: '1st T20I · ENG vs IND',
    homeNation: 'England',
    awayNation: 'India',
    homeCode: 'ENG',
    awayCode: 'IND',
    homeFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    awayFlag: '🇮🇳',
    venue: 'Riverside Ground, Chester-le-Street',
    format: 'T20',
    completed: false
  },
  {
    id: 'cb_intl_13',
    dateStr: '2026-07-04',
    dayOfWeek: 'SAT',
    dayNumber: 4,
    month: 'Jul',
    seriesName: 'India tour of England, 2026',
    matchTitle: '2nd T20I · ENG vs IND',
    homeNation: 'England',
    awayNation: 'India',
    homeCode: 'ENG',
    awayCode: 'IND',
    homeFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    awayFlag: '🇮🇳',
    venue: 'Old Trafford, Manchester',
    format: 'T20',
    completed: false
  },
  {
    id: 'cb_intl_14',
    dateStr: '2026-07-07',
    dayOfWeek: 'TUE',
    dayNumber: 7,
    month: 'Jul',
    seriesName: 'India tour of England, 2026',
    matchTitle: '3rd T20I · ENG vs IND',
    homeNation: 'England',
    awayNation: 'India',
    homeCode: 'ENG',
    awayCode: 'IND',
    homeFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    awayFlag: '🇮🇳',
    venue: 'Trent Bridge, Nottingham',
    format: 'T20',
    completed: false
  },
  {
    id: 'cb_intl_15',
    dateStr: '2026-07-09',
    dayOfWeek: 'THU',
    dayNumber: 9,
    month: 'Jul',
    seriesName: 'India tour of England, 2026',
    matchTitle: '4th T20I · ENG vs IND',
    homeNation: 'England',
    awayNation: 'India',
    homeCode: 'ENG',
    awayCode: 'IND',
    homeFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    awayFlag: '🇮🇳',
    venue: 'County Ground, Bristol',
    format: 'T20',
    completed: false
  },
  {
    id: 'cb_intl_16',
    dateStr: '2026-07-11',
    dayOfWeek: 'SAT',
    dayNumber: 11,
    month: 'Jul',
    seriesName: 'India tour of England, 2026',
    matchTitle: '5th T20I · ENG vs IND',
    homeNation: 'England',
    awayNation: 'India',
    homeCode: 'ENG',
    awayCode: 'IND',
    homeFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    awayFlag: '🇮🇳',
    venue: 'The Rose Bowl, Southampton',
    format: 'T20',
    completed: false
  },
  {
    id: 'cb_intl_17',
    dateStr: '2026-07-14',
    dayOfWeek: 'TUE',
    dayNumber: 14,
    month: 'Jul',
    seriesName: 'India tour of England, 2026',
    matchTitle: '1st ODI · ENG vs IND',
    homeNation: 'England',
    awayNation: 'India',
    homeCode: 'ENG',
    awayCode: 'IND',
    homeFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    awayFlag: '🇮🇳',
    venue: 'Edgbaston, Birmingham',
    format: 'ODI',
    completed: false
  },
  {
    id: 'cb_intl_18',
    dateStr: '2026-07-19',
    dayOfWeek: 'SUN',
    dayNumber: 19,
    month: 'Jul',
    seriesName: 'India tour of England, 2026',
    matchTitle: '3rd ODI · ENG vs IND',
    homeNation: 'England',
    awayNation: 'India',
    homeCode: 'ENG',
    awayCode: 'IND',
    homeFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    awayFlag: '🇮🇳',
    venue: "Lord's Cricket Ground, London",
    format: 'ODI',
    completed: false
  },
  {
    id: 'cb_intl_19',
    dateStr: '2026-07-24',
    dayOfWeek: 'FRI',
    dayNumber: 24,
    month: 'Jul',
    seriesName: 'India tour of Sri Lanka, 2026 (WTC)',
    matchTitle: '1st Test · SL vs IND',
    homeNation: 'Sri Lanka',
    awayNation: 'India',
    homeCode: 'SL',
    awayCode: 'IND',
    homeFlag: '🇱🇰',
    awayFlag: '🇮🇳',
    venue: 'Galle International Stadium, Galle',
    format: 'TEST',
    completed: false
  },
  {
    id: 'cb_intl_20',
    dateStr: '2026-08-13',
    dayOfWeek: 'THU',
    dayNumber: 13,
    month: 'Aug',
    seriesName: 'Bangladesh tour of Australia, 2026',
    matchTitle: '1st Test · AUS vs BAN',
    homeNation: 'Australia',
    awayNation: 'Bangladesh',
    homeCode: 'AUS',
    awayCode: 'BAN',
    homeFlag: '🇦🇺',
    awayFlag: '🇧🇩',
    venue: 'Marrara Oval, Darwin',
    format: 'TEST',
    completed: false
  },
  {
    id: 'cb_intl_21',
    dateStr: '2026-08-19',
    dayOfWeek: 'WED',
    dayNumber: 19,
    month: 'Aug',
    seriesName: 'Pakistan tour of England, 2026',
    matchTitle: '1st Test · ENG vs PAK',
    homeNation: 'England',
    awayNation: 'Pakistan',
    homeCode: 'ENG',
    awayCode: 'PAK',
    homeFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    awayFlag: '🇵🇰',
    venue: 'Headingley, Leeds',
    format: 'TEST',
    completed: false
  },
  {
    id: 'cb_intl_22',
    dateStr: '2026-09-18',
    dayOfWeek: 'FRI',
    dayNumber: 18,
    month: 'Sep',
    seriesName: 'Australia tour of South Africa, 2026',
    matchTitle: '1st T20I · SA vs AUS',
    homeNation: 'South Africa',
    awayNation: 'Australia',
    homeCode: 'SA',
    awayCode: 'AUS',
    homeFlag: '🇿🇦',
    awayFlag: '🇦🇺',
    venue: 'Kingsmead, Durban',
    format: 'T20',
    completed: false
  },
  {
    id: 'cb_intl_23',
    dateStr: '2026-10-08',
    dayOfWeek: 'THU',
    dayNumber: 8,
    month: 'Oct',
    seriesName: 'West Indies tour of India, 2026',
    matchTitle: '1st T20I · IND vs WI',
    homeNation: 'India',
    awayNation: 'West Indies',
    homeCode: 'IND',
    awayCode: 'WI',
    homeFlag: '🇮🇳',
    awayFlag: '🌴',
    venue: 'Wankhede Stadium, Mumbai',
    format: 'T20',
    completed: false
  },
  {
    id: 'cb_intl_24',
    dateStr: '2026-10-28',
    dayOfWeek: 'WED',
    dayNumber: 28,
    month: 'Oct',
    seriesName: 'India tour of New Zealand, 2026',
    matchTitle: '1st T20I · NZ vs IND',
    homeNation: 'New Zealand',
    awayNation: 'India',
    homeCode: 'NZ',
    awayCode: 'IND',
    homeFlag: '🇳🇿',
    awayFlag: '🇮🇳',
    venue: 'Eden Park, Auckland',
    format: 'T20',
    completed: false
  },
  {
    id: 'cb_intl_25',
    dateStr: '2026-11-22',
    dayOfWeek: 'SUN',
    dayNumber: 22,
    month: 'Nov',
    seriesName: 'England tour of Australia, 2026',
    matchTitle: '1st T20I · AUS vs ENG',
    homeNation: 'Australia',
    awayNation: 'England',
    homeCode: 'AUS',
    awayCode: 'ENG',
    homeFlag: '🇦🇺',
    awayFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    venue: 'Optus Stadium, Perth',
    format: 'T20',
    completed: false
  }
];

export function buildSeasonCalendarForTeam(
  userTeamId: string,
  allTeams: Team[],
  includeSampleCompleted: boolean = false,
  seasonYear: number = 2026
): League['calendarDates'] {
  const userT = allTeams.find(t => t.id === userTeamId) || allTeams[0];
  const teamsPool = [userT, ...allTeams.filter(t => t.id !== userT.id)].slice(0, 10);

  const dayNames = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const monthMeta: Record<number, { name: string; days: number }> = {
    4: { name: 'Apr', days: 30 },
    5: { name: 'May', days: 31 },
    6: { name: 'Jun', days: 30 },
    7: { name: 'Jul', days: 31 },
    8: { name: 'Aug', days: 31 }
  };
  let curMonth = 4;
  let curDay = 17;
  let dowIdx = 4; // FRI

  const nextDate = () => {
    const mInfo = monthMeta[curMonth] || { name: 'May', days: 31 };
    const monthStr = mInfo.name;
    const dateStr = `${seasonYear}-${String(curMonth).padStart(2, '0')}-${String(curDay).padStart(2, '0')}`;
    const dayOfWeek = dayNames[dowIdx % 7];
    const dayNumber = curDay;
    dowIdx++;
    curDay++;
    if (curDay > mInfo.days) {
      curMonth++;
      curDay = 1;
    }
    return { dateStr, dayOfWeek, dayNumber, month: monthStr };
  };

  const getIntlMatchesForDateStr = (dateStr: string) => {
    return CRICBUZZ_2026_INTL_TOURS.filter(t => t.dateStr === dateStr).map(t => ({
      id: t.id,
      homeTeamId: t.homeNation,
      awayTeamId: t.awayNation,
      homeShortName: t.homeCode,
      awayShortName: t.awayCode,
      homeLogo: t.homeFlag,
      awayLogo: t.awayFlag,
      venue: t.venue,
      timeStr: '14:00 GMT',
      completed: Boolean(t.completed),
      resultSummary: t.resultSummary,
      isInternational: true,
      seriesName: t.seriesName,
      format: t.format
    }));
  };

  const dates: League['calendarDates'] = [];
  let runningDayIdx = 0;

  // Build complete match list for all 18 rounds (each round has 5 matches: 1 user match + 4 other matches)
  const matchPool: {
    roundIndex: number;
    homeTeam: Team;
    awayTeam: Team;
    isUserMatch: boolean;
    isCompleted: boolean;
  }[] = [];

  for (let mIdx = 0; mIdx < 18; mIdx++) {
    const k = mIdx % 9;
    const reverseVenue = mIdx >= 9;

    const getPair = (idxA: number, idxB: number) => {
      const teamA = teamsPool[idxA] || teamsPool[0];
      const teamB = teamsPool[idxB] || teamsPool[1];
      return reverseVenue ? { home: teamB, away: teamA } : { home: teamA, away: teamB };
    };

    const pair0 = getPair(0, 1 + k);
    const pair1 = getPair(1 + ((k + 1) % 9), 1 + ((k + 8) % 9));
    const pair2 = getPair(1 + ((k + 2) % 9), 1 + ((k + 7) % 9));
    const pair3 = getPair(1 + ((k + 3) % 9), 1 + ((k + 6) % 9));
    const pair4 = getPair(1 + ((k + 4) % 9), 1 + ((k + 5) % 9));

    const isCompleted = includeSampleCompleted && mIdx < 3;

    // User match in this round
    const userHome = pair0.home;
    const userAway = pair0.away;
    const isUserHome = userHome.id === userT.id;

    matchPool.push({
      roundIndex: mIdx,
      homeTeam: userHome,
      awayTeam: userAway,
      isUserMatch: true,
      isCompleted
    });

    // 4 other matches in this round
    const aiPairs = [pair1, pair2, pair3, pair4];
    aiPairs.forEach(p => {
      matchPool.push({
        roundIndex: mIdx,
        homeTeam: p.home,
        awayTeam: p.away,
        isUserMatch: false,
        isCompleted
      });
    });
  }

  // Now distribute matches chronologically: 1 match per day (with rest days interspersed or straight sequence)
  // Total matches = 18 rounds * 5 matches = 90 matches.
  // We place 1 match per calendar date.
  // Now distribute matches chronologically: 2 matches on Saturday & Sunday (Double Header: 1st at 15:30, 2nd at 19:30), 1 match on rest days (Mon-Fri at 19:30)
  let matchPtr = 0;
  while (matchPtr < matchPool.length) {
    const dInfo = nextDate();
    const isWeekend = dInfo.dayOfWeek === 'SAT' || dInfo.dayOfWeek === 'SUN';
    const matchesForDayCount = isWeekend ? Math.min(2, matchPool.length - matchPtr) : 1;

    const dayMatches: typeof matchPool = [];
    for (let i = 0; i < matchesForDayCount; i++) {
      dayMatches.push(matchPool[matchPtr]);
      matchPtr++;
    }

    let matchFixture: any = undefined;
    const otherMatches: any[] = [];

    const userMatchIndex = dayMatches.findIndex(m => m.isUserMatch || m.homeTeam.id === userT.id || m.awayTeam.id === userT.id);

    dayMatches.forEach((m, idx) => {
      const isUser = idx === userMatchIndex;
      const homeObj = m.homeTeam;
      const awayObj = m.awayTeam;
      const isUserHome = homeObj.id === userT.id;

      const timeStr = isWeekend
        ? (idx === 0 ? '15:30 IST (Double Header - 1st Match)' : '19:30 IST (Double Header - 2nd Match)')
        : '19:30 IST';

      const sampleResults = [
        `${userT.shortName} 188/5 beat opponents 174/8 by 14 runs`,
        `${userT.shortName} 166/3 beat opponents 162/7 by 7 wkts`
      ];

      const fixRec = {
        id: `fix_m_${matchPtr}_${homeObj.id}_${awayObj.id}`,
        homeTeamId: homeObj.id,
        awayTeamId: awayObj.id,
        homeShortName: homeObj.shortName,
        awayShortName: awayObj.shortName,
        homeLogo: homeObj.logoEmoji || '🏏',
        awayLogo: awayObj.logoEmoji || '🏏',
        venue: `${homeObj.city} Cricket Stadium`,
        timeStr,
        completed: m.isCompleted,
        resultSummary: m.isCompleted ? sampleResults[matchPtr % sampleResults.length] : undefined,
        format: 'T20' as const
      };

      if (isUser) {
        matchFixture = fixRec;
      } else {
        otherMatches.push(fixRec);
      }
    });

    const hasUserMatch = Boolean(matchFixture);
    const primaryTeamObj = hasUserMatch
      ? teamsPool.find(t => t.id === (matchFixture.homeTeamId === userT.id ? matchFixture.awayTeamId : matchFixture.homeTeamId))
      : otherMatches[0]
      ? teamsPool.find(t => t.id === otherMatches[0].awayTeamId)
      : teamsPool[1];

    const dayTitle = hasUserMatch
      ? `${matchFixture.homeTeamId === userT.id ? 'vs' : '@'} ${primaryTeamObj?.city || 'Match'}`
      : otherMatches[0]
      ? `${otherMatches[0].homeShortName} vs ${otherMatches[0].awayShortName}`
      : 'Match Day';

    const titlePrefix = isWeekend ? (matchesForDayCount > 1 ? 'Double Header · ' : 'Weekend Match · ') : '';

    dates.push({
      id: `cal_day_${dates.length + 1}`,
      ...dInfo,
      type: hasUserMatch ? 'match' : 'training',
      title: `${titlePrefix}${dayTitle}`,
      isHome: hasUserMatch ? matchFixture.homeTeamId === userT.id : true,
      opponentTeamId: hasUserMatch ? (matchFixture.homeTeamId === userT.id ? matchFixture.awayTeamId : matchFixture.homeTeamId) : undefined,
      matchFixture,
      otherMatches,
      internationalMatches: getIntlMatchesForDateStr(dInfo.dateStr)
    });
  }

  // Append Post-IPL International Tour Window Dates (June – November 2026 Cricbuzz Calendar)
  CRICBUZZ_2026_INTL_TOURS.filter(t => !dates.some(d => d.dateStr === t.dateStr)).forEach(tour => {
    const intlFix = {
      id: tour.id,
      homeTeamId: tour.homeNation,
      awayTeamId: tour.awayNation,
      homeShortName: tour.homeCode,
      awayShortName: tour.awayCode,
      homeLogo: tour.homeFlag,
      awayLogo: tour.awayFlag,
      venue: tour.venue,
      timeStr: '14:00 LOCAL',
      completed: Boolean(tour.completed),
      resultSummary: tour.resultSummary,
      isInternational: true,
      seriesName: tour.seriesName,
      format: tour.format
    };
    dates.push({
      id: `cal_intl_${tour.id}`,
      dateStr: tour.dateStr,
      dayOfWeek: tour.dayOfWeek,
      dayNumber: tour.dayNumber,
      month: tour.month,
      type: 'international',
      title: tour.matchTitle,
      isHome: true,
      matchFixture: intlFix,
      otherMatches: [],
      internationalMatches: [intlFix]
    });
  });

  // Append Playoff Fixture Days at the end of league calendar
  const playoffStages = [
    { stage: 'q1', title: 'QUALIFIER 1 · 1st vs 2nd' },
    { stage: 'eliminator', title: 'ELIMINATOR · 3rd vs 4th' },
    { stage: 'q2', title: 'QUALIFIER 2 · Loser Q1 vs Winner Elim' },
    { stage: 'final', title: 'THE GRAND FINAL · Championship Showdown' }
  ];

  playoffStages.forEach((ps) => {
    const dInfo = nextDate();
    const playoffFixtureRecord = {
      id: `fix_playoff_${ps.stage}`,
      homeTeamId: '',
      awayTeamId: '',
      homeShortName: 'TBD',
      awayShortName: 'TBD',
      homeLogo: '🏆',
      awayLogo: '🏆',
      venue: 'Narendra Modi Stadium, Ahmedabad',
      timeStr: '19:30 IST',
      completed: false,
      format: 'T20' as const
    };
    dates.push({
      id: `cal_playoff_${ps.stage}`,
      ...dInfo,
      type: 'playoff' as any,
      title: ps.title,
      isHome: true,
      matchFixture: playoffFixtureRecord,
      otherMatches: [],
      internationalMatches: []
    });
  });

  return dates;
}

function buildInitialInboxMessages(team: Team, allPlayers: Player[]): InboxMessage[] {
  const squad = allPlayers.filter(p => p.clubId === team.id);
  const captain = squad.find(p => p.id === team.captainId || p.isCaptain) || squad[0];
  const benchPlayers = squad.filter(p => !team.playingXIIds.includes(p.id)).sort((a, b) => Math.max(b.ratings.bat, b.ratings.bowl) - Math.max(a.ratings.bat, a.ratings.bowl));
  const benchStar = benchPlayers[0] || squad[squad.length - 1] || captain;
  const seniorPro = squad.find(p => p.id !== captain?.id && p.id !== benchStar?.id && (p.role === 'Pace' || p.role === 'Spin' || p.role === 'All-rounder')) || squad[1] || captain;

  const msgs: InboxMessage[] = [];
  if (captain) {
    msgs.push({
      id: `msg_capt_${team.id}`,
      playerId: captain.id,
      playerName: captain.name,
      jerseyNumber: captain.jerseyNumber || 41,
      isCaptain: true,
      role: captain.role,
      dateLabel: 'SUN 26 APR',
      subject: 'The dressing room is restless',
      body: `"Coach, a few of the lads on the ${team.shortName} bench are asking about game time, promises, and role clarity ahead of the next fixture. Worth a word before it spreads."`,
      resolved: false
    });
  }
  if (benchStar && benchStar.id !== captain?.id) {
    msgs.push({
      id: `msg_bench_${team.id}`,
      playerId: benchStar.id,
      playerName: benchStar.name,
      jerseyNumber: benchStar.jerseyNumber || 27,
      isCaptain: false,
      role: benchStar.role,
      dateLabel: 'SAT 25 APR',
      subject: 'Pushing for a spot in the Starting XI',
      body: `"Gaffer, I've been striking the ball cleanly in the nets all week. Give me a run in the Starting XI or as Impact Sub next match and I won't let ${team.shortName} down."`,
      resolved: false
    });
  }
  if (seniorPro && seniorPro.id !== captain?.id && seniorPro.id !== benchStar?.id) {
    msgs.push({
      id: `msg_senior_${team.id}`,
      playerId: seniorPro.id,
      playerName: seniorPro.name,
      jerseyNumber: seniorPro.jerseyNumber || 99,
      isCaptain: false,
      role: seniorPro.role,
      dateLabel: 'FRI 24 APR',
      subject: 'Death-overs execution & pitch plans',
      body: `"Coach, our bowling unit has been reviewing footage of the opposition top order. Extra yorker and slower-ball drills in the next session could give us the edge."`,
      resolved: false
    });
  }
  return msgs;
}

export interface TrainingTraineeGain {
  playerId: string;
  name: string;
  role: string;
  xp: number;
  statBoosted: string;
}

export interface InternationalSeriesMatch {
  matchNumber: number;
  venue: string;
  city: string;
  completed: boolean;
  summary?: string;
  fixtureId?: string;
  dateStr?: string;
  format?: 'T20' | 'ODI' | 'TEST';
  homeNationId?: string;
  awayNationId?: string;
  homeTeamId?: string;
  awayTeamId?: string;
}

export interface InternationalSeriesState {
  seriesId: string;
  userNationId: string;
  userNationName: string;
  userNationCode: string;
  userNationFlag: string;
  opponentNationId: string;
  opponentNationName: string;
  opponentNationCode: string;
  opponentNationFlag: string;
  seriesWins: number;
  seriesLosses: number;
  matches: InternationalSeriesMatch[];
  format?: 'T20' | 'ODI' | 'TEST';
  wtcTestCompleted?: boolean;
  wtcTestSummary?: string;
}

export const VALID_CAREER_PHASES: readonly CareerPhase[] = [
  'league_stage',
  'playoffs',
  'season_final',
  'board_review',
  'career_decision',
  'retention',
  'auction',
  'squad_confirmation',
  'off_season_rest',
  'international_squad_selection',
  'international_series',
  'next_season_ready'
] as const;

export function isValidCareerPhase(phase: unknown): phase is CareerPhase {
  return typeof phase === 'string' && (VALID_CAREER_PHASES as readonly string[]).includes(phase);
}

function createPersistentSeriesEntropyToken(): string {
  if (typeof globalThis.crypto !== 'undefined') {
    if (typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    }
    if (typeof globalThis.crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(6);
      globalThis.crypto.getRandomValues(bytes);
      return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }
  }
  const timePart = Date.now().toString(36);
  const randPart = Math.random().toString(36).slice(2, 10);
  return `${timePart}${randPart}`;
}

/**
 * Assembles the authoritative set of all persisted international series IDs
 * across in-memory state, active save slots, localStorage keys, and caller-supplied IDs.
 */
export function getAuthoritativePersistedSeriesIds(extraIds?: Iterable<string>): Set<string> {
  const set = new Set<string>();

  if (extraIds) {
    for (const id of extraIds) {
      if (typeof id === 'string' && id.trim().length > 0) {
        set.add(id.trim());
      }
    }
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const rawProfile = localStorage.getItem('ms_profile_v6');
      if (rawProfile) {
        const parsed = JSON.parse(rawProfile);
        if (Array.isArray(parsed?.completedInternationalSeriesIds)) {
          for (const id of parsed.completedInternationalSeriesIds) {
            if (typeof id === 'string' && id.trim().length > 0) set.add(id.trim());
          }
        }
      }
      const rawSeries = localStorage.getItem('ms_intl_series_v6');
      if (rawSeries) {
        const parsed = JSON.parse(rawSeries);
        if (typeof parsed?.seriesId === 'string' && parsed.seriesId.trim().length > 0) {
          set.add(parsed.seriesId.trim());
        }
      }
      for (const slotNum of [1, 2, 3]) {
        const rawSlot = localStorage.getItem(`ms_career_save_slot_${slotNum}`) || localStorage.getItem(`ms_save_slot_v6_${slotNum}`);
        if (rawSlot) {
          const parsed = JSON.parse(rawSlot);
          if (Array.isArray(parsed?.coachProfile?.completedInternationalSeriesIds)) {
            for (const id of parsed.coachProfile.completedInternationalSeriesIds) {
              if (typeof id === 'string' && id.trim().length > 0) set.add(id.trim());
            }
          }
          if (typeof parsed?.internationalSeries?.seriesId === 'string' && parsed.internationalSeries.seriesId.trim().length > 0) {
            set.add(parsed.internationalSeries.seriesId.trim());
          }
        }
      }
    } catch {
      // Safe fallback
    }
  }

  return set;
}

/**
 * Generates a unique, persistent international series ID independent of any in-memory counter.
 * Uses cryptographic/high-entropy randomness plus collision checking against `existingSeriesIds`
 * so repeated series creation across simulated application restarts can never collide.
 */
export function generateUniqueInternationalSeriesId(
  userNationId: string,
  opponentNationId: string,
  tourSequence: number = 1,
  existingSeriesIds: Iterable<string> = []
): string {
  const existingSet = getAuthoritativePersistedSeriesIds(existingSeriesIds);
  const cleanUser = (userNationId || 'nat').trim().replace(/\s+/g, '_');
  const cleanOpp = (opponentNationId || 'opp').trim().replace(/\s+/g, '_');
  const baseTourSeq = Number.isFinite(tourSequence) && tourSequence >= 1 ? Math.floor(tourSequence) : 1;
  const safeTourSeq = Math.max(baseTourSeq, existingSet.size + 1);

  let candidate = '';
  let attempt = 0;
  do {
    const token = createPersistentSeriesEntropyToken();
    const retrySuffix = attempt > 0 ? `_r${attempt}` : '';
    candidate = `intl_series_${cleanUser}_vs_${cleanOpp}_t${safeTourSeq}_${token}${retrySuffix}`;
    attempt += 1;
  } while (existingSet.has(candidate));

  return candidate;
}

export interface BuildInitialSeriesOptions {
  isRestoring?: boolean;
  onDuplicateExplicitId?: 'regenerate' | 'reject';
}

export function buildInitialSeriesForNation(
  userNat: Nation,
  allNations: Nation[],
  preferredOpponentId?: string,
  tourSequence: number = 1,
  explicitSeriesId?: string,
  existingSeriesIds: Iterable<string> = [],
  options?: BuildInitialSeriesOptions
): InternationalSeriesState {
  if (!userNat || typeof userNat !== 'object' || !userNat.id || !userNat.name) {
    throw new Error('Cannot create international series: coached nation is missing or invalid.');
  }

  if (!Array.isArray(allNations) || allNations.length === 0) {
    throw new Error('Cannot create international series: nations dataset is empty.');
  }

  const userNatNameLower = userNat.name.trim().toLowerCase();
  const candidates = allNations.filter(
    n => n && typeof n === 'object' && n.id !== userNat.id && n.name && n.name.trim().toLowerCase() !== userNatNameLower
  );

  if (candidates.length === 0) {
    throw new Error(`Cannot create international series: no eligible opponent nation available against ${userNat.name}.`);
  }

  const isExplicitOppRequested = typeof preferredOpponentId === 'string' && preferredOpponentId.trim().length > 0;
  let oppNat: Nation | undefined;

  if (isExplicitOppRequested) {
    const requestedOpp = preferredOpponentId.trim();
    oppNat = candidates.find(
      n =>
        n.id === requestedOpp ||
        n.name.trim().toLowerCase() === requestedOpp.toLowerCase()
    );

    if (!oppNat) {
      if (
        requestedOpp === userNat.id ||
        requestedOpp.toLowerCase() === userNatNameLower
      ) {
        throw new Error(
          `Cannot create international series: requested opponent "${requestedOpp}" is identical to coached nation ${userNat.name}.`
        );
      }
      throw new Error(
        `Cannot create international series: explicitly requested opponent "${requestedOpp}" was not found among eligible nations.`
      );
    }
  } else {
    // Automatic opponent selection when no explicit opponent is supplied
    oppNat =
      (userNat.name === 'South Africa'
        ? candidates.find(n => n.name === 'India')
        : candidates.find(n => n.name === 'South Africa')) ||
      candidates[0];
  }

  if (!oppNat || oppNat.id === userNat.id || oppNat.name.trim().toLowerCase() === userNatNameLower) {
    throw new Error(`Cannot create international series: resolved opponent nation is invalid or identical to coached nation ${userNat.name}.`);
  }

  const uCode = userNat.code || userNat.name.slice(0, 3).toUpperCase();
  const oCode = oppNat.code || oppNat.name.slice(0, 3).toUpperCase();
  const venuesByHost: Record<string, { city: string; venue: string }[]> = {
    'South Africa': [
      { city: 'Durban', venue: 'Kingsmead, Durban' },
      { city: 'Centurion', venue: 'SuperSport Park, Centurion' },
      { city: 'Johannesburg', venue: 'Wanderers Stadium, Johannesburg' },
      { city: 'Gqeberha', venue: "St George's Park, Gqeberha" },
      { city: 'Cape Town', venue: 'Newlands, Cape Town' }
    ],
    'India': [
      { city: 'Mumbai', venue: 'Wankhede Stadium, Mumbai' },
      { city: 'Kolkata', venue: 'Eden Gardens, Kolkata' },
      { city: 'Chennai', venue: 'M.A. Chidambaram Stadium, Chennai' },
      { city: 'Bengaluru', venue: 'M. Chinnaswamy Stadium, Bengaluru' },
      { city: 'Ahmedabad', venue: 'Narendra Modi Stadium, Ahmedabad' }
    ],
    'Australia': [
      { city: 'Melbourne', venue: 'Melbourne Cricket Ground, Melbourne' },
      { city: 'Sydney', venue: 'Sydney Cricket Ground, Sydney' },
      { city: 'Perth', venue: 'Optus Stadium, Perth' },
      { city: 'Brisbane', venue: 'The Gabba, Brisbane' },
      { city: 'Adelaide', venue: 'Adelaide Oval, Adelaide' }
    ],
    'England': [
      { city: 'London', venue: "Lord's Cricket Ground, London" },
      { city: 'Manchester', venue: 'Old Trafford, Manchester' },
      { city: 'Birmingham', venue: 'Edgbaston, Birmingham' },
      { city: 'Leeds', venue: 'Headingley, Leeds' },
      { city: 'Nottingham', venue: 'Trent Bridge, Nottingham' }
    ],
    'New Zealand': [
      { city: 'Auckland', venue: 'Eden Park, Auckland' },
      { city: 'Wellington', venue: 'Sky Stadium, Wellington' },
      { city: 'Christchurch', venue: 'Hagley Oval, Christchurch' },
      { city: 'Hamilton', venue: 'Seddon Park, Hamilton' },
      { city: 'Mount Maunganui', venue: 'Bay Oval, Mount Maunganui' }
    ]
  };
  const venues = venuesByHost[oppNat.name] || [
    { city: oppNat.name, venue: `${oppNat.name} National Cricket Stadium` },
    { city: oppNat.name, venue: `${oppNat.name} International Oval` },
    { city: oppNat.name, venue: `${oppNat.name} City Ground` },
    { city: oppNat.name, venue: `${oppNat.name} Sports Complex` },
    { city: oppNat.name, venue: `${oppNat.name} Central Park` }
  ];

  const existingSet = getAuthoritativePersistedSeriesIds(existingSeriesIds);
  const trimmedExplicitId = typeof explicitSeriesId === 'string' ? explicitSeriesId.trim() : '';

  let resolvedSeriesId: string;
  if (trimmedExplicitId.length > 0) {
    if (options?.isRestoring) {
      // Preserving an existing series identity on reload/resume
      resolvedSeriesId = trimmedExplicitId;
    } else if (existingSet.has(trimmedExplicitId)) {
      if (options?.onDuplicateExplicitId === 'reject') {
        throw new Error(`Cannot create international series: explicit series ID "${trimmedExplicitId}" already belongs to an existing series.`);
      }
      // Collision detected when creating new series: generate fresh unique ID
      resolvedSeriesId = generateUniqueInternationalSeriesId(userNat.id, oppNat.id, tourSequence, existingSet);
    } else {
      resolvedSeriesId = trimmedExplicitId;
    }
  } else {
    resolvedSeriesId = generateUniqueInternationalSeriesId(userNat.id, oppNat.id, tourSequence, existingSet);
  }

  return {
    seriesId: resolvedSeriesId,
    userNationId: userNat.id,
    userNationName: userNat.name,
    userNationCode: uCode,
    userNationFlag: userNat.flag || '🏏',
    opponentNationId: oppNat.id,
    opponentNationName: oppNat.name,
    opponentNationCode: oCode,
    opponentNationFlag: oppNat.flag || '🏏',
    seriesWins: 0,
    seriesLosses: 0,
    matches: venues.map((v, idx) => ({
      matchNumber: idx + 1,
      city: v.city,
      venue: v.venue,
      completed: false,
      summary: undefined
    })),
    wtcTestCompleted: false
  };
}

/**
 * Safely migrates a legacy saved international series that lacks a `seriesId`
 * without losing completed matches, summaries, or series scoreline.
 * If the legacy series cannot be identified safely (e.g. missing/invalid nations,
 * empty fixtures, or ambiguous against already-completed legacy series between the same nations),
 * returns `canMigrate: false` with an explicit error.
 */
export function migrateLegacyInternationalSeries(
  rawSeries: Partial<InternationalSeriesState> | null | undefined,
  nations: Nation[],
  completedSeriesIds: string[] = []
): {
  canMigrate: boolean;
  migrated: boolean;
  series?: InternationalSeriesState;
  error?: string;
} {
  if (!rawSeries || typeof rawSeries !== 'object') {
    return {
      canMigrate: false,
      migrated: false,
      error: 'Legacy international series is missing or not an object.'
    };
  }

  const existingId = typeof rawSeries.seriesId === 'string' ? rawSeries.seriesId.trim() : '';
  if (existingId.length > 0) {
    return {
      canMigrate: true,
      migrated: false,
      series: {
        ...(rawSeries as InternationalSeriesState),
        seriesId: existingId
      }
    };
  }

  const userNat = nations.find(
    n =>
      (rawSeries.userNationId && n.id === rawSeries.userNationId) ||
      (rawSeries.userNationName && n.name.trim().toLowerCase() === rawSeries.userNationName.trim().toLowerCase())
  );
  const oppNat = nations.find(
    n =>
      (rawSeries.opponentNationId && n.id === rawSeries.opponentNationId) ||
      (rawSeries.opponentNationName && n.name.trim().toLowerCase() === rawSeries.opponentNationName.trim().toLowerCase())
  );

  if (!userNat || !oppNat || userNat.id === oppNat.id) {
    return {
      canMigrate: false,
      migrated: false,
      error: 'Legacy international series cannot be identified safely: missing or invalid participating nations.'
    };
  }

  if (!Array.isArray(rawSeries.matches) || rawSeries.matches.length === 0) {
    return {
      canMigrate: false,
      migrated: false,
      error: 'Legacy international series cannot be identified safely: fixture list is missing or empty.'
    };
  }

  const hasValidMatchNumbers = rawSeries.matches.every(
    (m, idx) => m && typeof m.matchNumber === 'number' && m.matchNumber === idx + 1 && typeof m.city === 'string' && m.city.trim().length > 0
  );
  if (!hasValidMatchNumbers) {
    return {
      canMigrate: false,
      migrated: false,
      error: 'Legacy international series has corrupted or ambiguous match metadata.'
    };
  }

  const wins = typeof rawSeries.seriesWins === 'number' ? rawSeries.seriesWins : 0;
  const losses = typeof rawSeries.seriesLosses === 'number' ? rawSeries.seriesLosses : 0;
  const completedCount = rawSeries.matches.filter(m => m.completed).length;
  if (wins + losses !== completedCount) {
    return {
      canMigrate: false,
      migrated: false,
      error: `Legacy international series scoreline (${wins}-${losses}) does not match completed fixture count (${completedCount}).`
    };
  }

  const matchFingerprint = rawSeries.matches
    .map(m => `${m.matchNumber}:${m.city.trim().toLowerCase()}:${m.completed ? '1' : '0'}`)
    .join('|');
  const migratedSeriesId = `legacy_intl_${userNat.id}_vs_${oppNat.id}_${wins}_${losses}_${matchFingerprint}`;

  const allCompleted = completedCount === rawSeries.matches.length;
  const hasPriorSamePairingCompletion = completedSeriesIds.some(
    id => id !== migratedSeriesId && id.includes(`${userNat.id}_vs_${oppNat.id}`)
  );
  if (allCompleted && hasPriorSamePairingCompletion) {
    return {
      canMigrate: false,
      migrated: false,
      error: `Ambiguous legacy international series between ${userNat.name} and ${oppNat.name}: cannot distinguish from previously completed series without an explicit seriesId.`
    };
  }

  return {
    canMigrate: true,
    migrated: true,
    series: {
      seriesId: migratedSeriesId,
      userNationId: userNat.id,
      userNationName: userNat.name,
      userNationCode: rawSeries.userNationCode || userNat.code || userNat.name.slice(0, 3).toUpperCase(),
      userNationFlag: rawSeries.userNationFlag || userNat.flag || '🏏',
      opponentNationId: oppNat.id,
      opponentNationName: oppNat.name,
      opponentNationCode: rawSeries.opponentNationCode || oppNat.code || oppNat.name.slice(0, 3).toUpperCase(),
      opponentNationFlag: rawSeries.opponentNationFlag || oppNat.flag || '🏏',
      seriesWins: wins,
      seriesLosses: losses,
      matches: rawSeries.matches.map(m => ({ ...m })),
      wtcTestCompleted: rawSeries.wtcTestCompleted,
      wtcTestSummary: rawSeries.wtcTestSummary
    }
  };
}

/**
 * Explicit active-league resolution policy for career recovery.
 * 1. Resolves using `currentLeagueId` if it matches an existing league in `leagues`.
 * 2. If `currentLeagueId` is missing or invalid, NEVER blindly picks `leagues[0]`.
 *    Instead, evaluates candidate leagues using:
 *    - Saved active team (`coachProfile.clubTeamId`) membership in league standings, teams, or fixtures
 *    - Saved `careerBoardReview` (`competitionId`, `seasonYear`, `teamId`)
 *    - Expected season year (`expectedSeasonYear`) if provided
 * 3. If exactly 1 unique valid replacement league matches, returns that league (`recoveredByPolicy: true`).
 * 4. If 0 or >1 plausible candidates exist, returns `league: null`, `requiresLeagueSelection: true`,
 *    and `candidateLeagueIds` so the caller/UI can surface a recoverable error without corrupting state.
 */
export function resolveActiveLeagueForRecovery(params: {
  leagues: League[];
  currentLeagueId?: string;
  coachProfile: CoachProfile;
  careerBoardReview: CareerBoardReview | null;
  expectedSeasonYear?: number;
  internationalSeries?: InternationalSeriesState;
}): {
  league: League | null;
  resolvedLeagueId: string | null;
  recoveredByPolicy: boolean;
  requiresLeagueSelection: boolean;
  candidateLeagueIds: string[];
  error?: string;
} {
  const { leagues, currentLeagueId, coachProfile, careerBoardReview, expectedSeasonYear, internationalSeries } = params;
  const validLeagues = Array.isArray(leagues)
    ? leagues.filter(
        (l): l is League =>
          Boolean(
            l &&
              typeof l === 'object' &&
              typeof l.id === 'string' &&
              l.id.trim().length > 0 &&
              Array.isArray(l.standings) &&
              Array.isArray(l.calendarDates)
          )
      )
    : [];

  if (validLeagues.length === 0) {
    return {
      league: null,
      resolvedLeagueId: null,
      recoveredByPolicy: false,
      requiresLeagueSelection: true,
      candidateLeagueIds: [],
      error: 'No valid leagues available in career state.'
    };
  }

  // 1. Direct match by saved currentLeagueId
  if (typeof currentLeagueId === 'string' && currentLeagueId.trim().length > 0) {
    const exactMatch = validLeagues.find(l => l.id === currentLeagueId.trim());
    if (exactMatch) {
      return {
        league: exactMatch,
        resolvedLeagueId: exactMatch.id,
        recoveredByPolicy: false,
        requiresLeagueSelection: false,
        candidateLeagueIds: [exactMatch.id]
      };
    }
  }

  // 2. currentLeagueId is missing or invalid -> apply explicit recovery policy (NEVER blindly pick leagues[0])
  const safeProfile = coachProfile && typeof coachProfile === 'object' ? coachProfile : INITIAL_COACH_PROFILE;
  const activeStintTeamId = Array.isArray(safeProfile.clubStints)
    ? safeProfile.clubStints.find(s => s && typeof s.period === 'string' && s.period.includes('present'))?.teamId
    : undefined;
  const activeTeamId =
    (typeof safeProfile.clubTeamId === 'string' && safeProfile.clubTeamId.trim()) ||
    (typeof activeStintTeamId === 'string' && activeStintTeamId.trim()) ||
    (careerBoardReview && typeof careerBoardReview.teamId === 'string' ? careerBoardReview.teamId.trim() : '');

  const leagueContainsTeam = (l: League, teamId: string): boolean => {
    if (!teamId) return false;
    const inStandings = Array.isArray(l.standings) && l.standings.some(s => s && s.teamId === teamId);
    const inTeams = Array.isArray(l.teams) && l.teams.some(t => t && t.id === teamId);
    const inFixtures =
      Array.isArray(l.calendarDates) &&
      l.calendarDates.some(
        cd =>
          cd &&
          (cd.matchFixture?.homeTeamId === teamId ||
            cd.matchFixture?.awayTeamId === teamId ||
            (cd.otherMatches || []).some(om => om && (om.homeTeamId === teamId || om.awayTeamId === teamId)))
      );
    return inStandings || inTeams || inFixtures;
  };

  // Require an explicit team, competition, or international series/nation link — never default to all leagues when context is missing
  let candidates: League[] = [];
  if (activeTeamId) {
    candidates = validLeagues.filter(l => leagueContainsTeam(l, activeTeamId));
  } else if (careerBoardReview?.competitionId) {
    candidates = validLeagues.filter(l => l.id === careerBoardReview.competitionId);
  }

  if (candidates.length === 0 && safeProfile.nationalTeamId) {
    const natId = String(safeProfile.nationalTeamId).trim();
    const seriesId =
      internationalSeries && typeof internationalSeries.seriesId === 'string'
        ? internationalSeries.seriesId.trim()
        : '';
    const intlMatched = validLeagues.filter(
      l =>
        Array.isArray(l.calendarDates) &&
        l.calendarDates.some(cd => {
          if (!cd) return false;
          if (seriesId && typeof cd.id === 'string' && cd.id.startsWith(`cal_intl_${seriesId}_`)) {
            return true;
          }
          const mf = cd.matchFixture;
          if (mf && mf.isInternational) {
            if (seriesId && typeof mf.id === 'string' && mf.id.startsWith(`intl_${seriesId}_`)) {
              return true;
            }
            if (mf.homeTeamId === natId || mf.awayTeamId === natId) {
              return true;
            }
          }
          return (cd.internationalMatches || []).some(
            im => im && (im.homeTeamId === natId || im.awayTeamId === natId)
          );
        })
    );
    if (intlMatched.length > 0) {
      candidates = intlMatched;
    } else if (validLeagues.length === 1) {
      candidates = [validLeagues[0]];
    }
  }

  // Narrow by expectedSeasonYear first when explicitly provided (e.g., from a save slot's seasonName)
  if (candidates.length > 1 && typeof expectedSeasonYear === 'number') {
    const seasonMatches = candidates.filter(l => {
      const lSeason = l.seasonYear || parseInt(normalizeSeasonYear(l.seasonName), 10) || 2026;
      return lSeason === expectedSeasonYear;
    });
    if (seasonMatches.length > 0) {
      candidates = seasonMatches;
    }
  }

  // Narrow by board review if the review belongs to the active team and aligns with expectedSeasonYear
  if (
    candidates.length > 1 &&
    careerBoardReview &&
    (!activeTeamId || careerBoardReview.teamId === activeTeamId) &&
    (typeof expectedSeasonYear !== 'number' || !careerBoardReview.seasonYear || careerBoardReview.seasonYear === expectedSeasonYear)
  ) {
    const reviewCompMatches = candidates.filter(l => {
      const lSeason = l.seasonYear || parseInt(normalizeSeasonYear(l.seasonName), 10) || 2026;
      const compMatches = !careerBoardReview.competitionId || l.id === careerBoardReview.competitionId;
      const seasonMatches = !careerBoardReview.seasonYear || lSeason === careerBoardReview.seasonYear;
      return compMatches && seasonMatches;
    });
    if (reviewCompMatches.length > 0) {
      candidates = reviewCompMatches;
    }
  }

  if (candidates.length === 1) {
    const chosen = candidates[0];
    return {
      league: chosen,
      resolvedLeagueId: chosen.id,
      recoveredByPolicy: true,
      requiresLeagueSelection: false,
      candidateLeagueIds: [chosen.id]
    };
  }

  return {
    league: null,
    resolvedLeagueId: null,
    recoveredByPolicy: false,
    requiresLeagueSelection: true,
    candidateLeagueIds: candidates.map(c => c.id),
    error:
      candidates.length === 0
        ? `Active league "${currentLeagueId || ''}" was not found and no league matches team "${activeTeamId}".`
        : `Active league "${currentLeagueId || ''}" was not found and ${candidates.length} plausible leagues (${candidates.map(c => c.id).join(', ')}) matched recovery criteria. Explicit league selection is required.`
  };
}

/**
 * Computes a deterministic fingerprint of the career state fields that govern phase & active-league recovery.
 * Used by `GameProvider` to validate changed persisted career data when needed without causing recovery loops
 * or resetting valid state on every render.
 */
export function buildCareerValidationSignature(params: {
  currentLeagueId?: string;
  leagues: League[];
  coachProfile: CoachProfile;
  careerBoardReview: CareerBoardReview | null;
  internationalSeries?: InternationalSeriesState;
  nationalSquadIds: string[];
  careerPhase: unknown;
}): string {
  const {
    currentLeagueId,
    leagues,
    coachProfile,
    careerBoardReview,
    internationalSeries,
    nationalSquadIds,
    careerPhase
  } = params;
  const leaguesSig = Array.isArray(leagues)
    ? leagues
        .filter(l => Boolean(l && typeof l === 'object' && l.id))
        .map(l => {
          const yr = l.seasonYear || l.seasonName || 2026;
          const finalDone = l.playoffs?.final?.completed ? 1 : 0;
          const allPlayed =
            Array.isArray(l.standings) && l.standings.length > 0 && l.standings.every(s => s && s.played >= 18)
              ? 1
              : 0;
          return `${l.id}:${yr}:${finalDone}:${allPlayed}`;
        })
        .join('|')
    : '';
  const coachSig =
    coachProfile && typeof coachProfile === 'object'
      ? `${coachProfile.clubTeamId || ''}:${coachProfile.nationalTeamId || ''}:${coachProfile.boardReviewsHistory?.length || 0}`
      : '';
  const reviewSig =
    careerBoardReview && typeof careerBoardReview === 'object'
      ? `${careerBoardReview.competitionId || 'pt20'}:${careerBoardReview.seasonYear}:${careerBoardReview.teamId}`
      : 'null';
  const seriesSig =
    internationalSeries && typeof internationalSeries === 'object'
      ? `${internationalSeries.seriesId || 'missing'}:${internationalSeries.userNationId || ''}`
      : 'none';
  const squadSig = Array.isArray(nationalSquadIds) ? `${nationalSquadIds.length}:${nationalSquadIds.join(',')}` : '';
  return `${currentLeagueId || ''}#${String(careerPhase)}#${leaguesSig}#${coachSig}#${reviewSig}#${seriesSig}#${squadSig}`;
}

/**
 * Authoritative single-career-mode invariant enforcer.
 * - Franchise mode: active club exists (clubTeamId non-null), active nation is null (nationalTeamId = null).
 * - International mode: active nation exists (nationalTeamId non-null), active club is null (clubTeamId = null).
 * - Legacy saves with both IDs set are migrated deterministically based on activeCareerMode or current careerPhase.
 */
export function enforceSingleCareerInvariant(
  coachProfile: CoachProfile,
  desiredMode?: 'franchise' | 'international',
  currentPhase?: CareerPhase,
  availableTeams?: Team[],
  availableNations?: Nation[]
): {
  coachProfile: CoachProfile;
  activeCareerMode: 'franchise' | 'international';
  migrated: boolean;
} {
  const safeProfile = coachProfile && typeof coachProfile === 'object'
    ? coachProfile
    : { ...INITIAL_COACH_PROFILE };

  const phaseStr = String(currentPhase || '');
  const isIntlPhase =
    phaseStr.startsWith('international') ||
    (Boolean(safeProfile.nationalTeamId) && !safeProfile.clubTeamId);

  const activeMode: 'franchise' | 'international' =
    desiredMode ||
    safeProfile.activeCareerMode ||
    (isIntlPhase ? 'international' : 'franchise');

  let migrated = false;

  if (activeMode === 'international') {
    const hasClub = safeProfile.clubTeamId !== null;
    let resolvedNatId = safeProfile.nationalTeamId;
    if (!resolvedNatId) {
      resolvedNatId = availableNations?.[0]?.id || INITIAL_NATIONS[0]?.id || null;
    }
    if (hasClub || safeProfile.nationalTeamId !== resolvedNatId || safeProfile.activeCareerMode !== 'international') {
      migrated = true;
    }
    return {
      activeCareerMode: 'international',
      migrated,
      coachProfile: {
        ...safeProfile,
        activeCareerMode: 'international',
        nationalTeamId: resolvedNatId,
        clubTeamId: null as unknown as string
      }
    };
  } else {
    const hasNat = safeProfile.nationalTeamId !== null;
    let resolvedClubId = safeProfile.clubTeamId;
    if (!resolvedClubId) {
      const activeStintTeamId = Array.isArray(safeProfile.clubStints)
        ? safeProfile.clubStints.find(s => s && typeof s.period === 'string' && s.period.includes('present'))?.teamId
        : undefined;
      resolvedClubId = activeStintTeamId || availableTeams?.[0]?.id || INITIAL_TEAMS[0]?.id || null;
    }
    if (hasNat || safeProfile.clubTeamId !== resolvedClubId || safeProfile.activeCareerMode !== 'franchise') {
      migrated = true;
    }
    return {
      activeCareerMode: 'franchise',
      migrated,
      coachProfile: {
        ...safeProfile,
        activeCareerMode: 'franchise',
        clubTeamId: resolvedClubId as string,
        nationalTeamId: null
      }
    };
  }
}

/**
 * Extracts authoritative domestic league-stage fixtures from a league's calendar,
 * excluding international fixtures and playoff fixtures, and flags malformed match days
 * or fixtures marked completed without an authoritative match result.
 */
export function getAuthoritativeDomesticFixtures(league: League | null | undefined): {
  fixtures: League['calendarDates'][number]['matchFixture'][];
  hasMalformedMatchDay: boolean;
  hasInvalidFixtureCompletion: boolean;
} {
  if (!league || !Array.isArray(league.calendarDates)) {
    return { fixtures: [], hasMalformedMatchDay: false, hasInvalidFixtureCompletion: false };
  }

  const fixtures: NonNullable<League['calendarDates'][number]['matchFixture']>[] = [];
  let hasMalformedMatchDay = false;
  let hasInvalidFixtureCompletion = false;

  for (const cd of league.calendarDates) {
    if (!cd || typeof cd !== 'object') continue;
    const isPlayoffDay =
      cd.type === 'playoff' ||
      (typeof cd.id === 'string' && cd.id.startsWith('cal_playoff_')) ||
      (typeof cd.matchFixture?.id === 'string' && cd.matchFixture.id.startsWith('fix_playoff_'));
    const isIntlDay =
      cd.type === 'international' ||
      (typeof cd.id === 'string' && cd.id.startsWith('cal_intl_'));

    if (isPlayoffDay || isIntlDay) {
      continue;
    }

    let dayHasDomesticFixture = false;
    const mf = cd.matchFixture;
    if (
      mf &&
      !mf.isInternational &&
      !(typeof mf.id === 'string' && (mf.id.startsWith('fix_playoff_') || mf.id.startsWith('intl_')))
    ) {
      fixtures.push(mf);
      dayHasDomesticFixture = true;
      if (mf.completed) {
        const hasResult =
          (typeof mf.resultSummary === 'string' && mf.resultSummary.trim().length > 0) ||
          Boolean(mf.completedMatchState && mf.completedMatchState.status === 'finished');
        if (!hasResult) {
          hasInvalidFixtureCompletion = true;
        }
      }
    }

    if (Array.isArray(cd.otherMatches)) {
      for (const om of cd.otherMatches) {
        if (
          om &&
          !om.isInternational &&
          !(typeof om.id === 'string' && (om.id.startsWith('fix_playoff_') || om.id.startsWith('intl_')))
        ) {
          fixtures.push(om);
          dayHasDomesticFixture = true;
          if (om.completed) {
            const hasResult =
              (typeof om.resultSummary === 'string' && om.resultSummary.trim().length > 0) ||
              Boolean(om.completedMatchState && om.completedMatchState.status === 'finished');
            if (!hasResult) {
              hasInvalidFixtureCompletion = true;
            }
          }
        }
      }
    }

    if (cd.type === 'match' && !dayHasDomesticFixture) {
      hasMalformedMatchDay = true;
    }
  }

  return { fixtures, hasMalformedMatchDay, hasInvalidFixtureCompletion };
}

/**
 * Authoritatively determines whether a league's domestic regular-season stage has legitimately completed.
 * - Never allows an empty calendar, international-only calendar, or unverified fixture list to satisfy completion.
 * - Respects competition-specific fixture counts while defaulting to double round-robin (18 matches per team for 10 teams).
 * - Preserves valid completed legacy saves when authoritative standings or match records prove completion.
 */
export function isDomesticLeagueStageComplete(league: League | null | undefined): boolean {
  if (!league || !Array.isArray(league.standings) || league.standings.length < 4) {
    return false;
  }

  const standingsTeamIds = new Set<string>();
  for (const s of league.standings) {
    if (!s || typeof s.teamId !== 'string' || s.teamId.trim().length === 0) {
      return false;
    }
    standingsTeamIds.add(s.teamId.trim());
  }

  const numTeams = standingsTeamIds.size;
  if (numTeams !== league.standings.length || numTeams < 4) {
    return false;
  }

  const {
    fixtures: rawDomesticFixtures,
    hasMalformedMatchDay,
    hasInvalidFixtureCompletion
  } = getAuthoritativeDomesticFixtures(league);

  if (hasInvalidFixtureCompletion) {
    return false;
  }

  const domesticFixtures = rawDomesticFixtures.filter(
    (f): f is NonNullable<typeof f> => Boolean(f && typeof f === 'object')
  );

  // Determine expected matches per team from explicit competition rules or valid round-robin schedule
  const rulesAny = (league.rules || {}) as unknown as Record<string, unknown>;
  const leagueAny = league as unknown as Record<string, unknown>;
  const explicitMatchesPerTeam =
    typeof rulesAny.matchesPerTeam === 'number' && rulesAny.matchesPerTeam > 0
      ? Math.floor(rulesAny.matchesPerTeam)
      : typeof leagueAny.matchesPerTeam === 'number' && leagueAny.matchesPerTeam > 0
      ? Math.floor(leagueAny.matchesPerTeam)
      : null;

  const seenFixtureIds = new Set<string>();
  const teamScheduleCounts = new Map<string, number>();
  for (const tid of standingsTeamIds) {
    teamScheduleCounts.set(tid, 0);
  }

  let allFixturesStructurallyValid = domesticFixtures.length > 0 && !hasMalformedMatchDay;
  for (const f of domesticFixtures) {
    const fid = typeof f.id === 'string' ? f.id.trim() : '';
    const hid = typeof f.homeTeamId === 'string' ? f.homeTeamId.trim() : '';
    const aid = typeof f.awayTeamId === 'string' ? f.awayTeamId.trim() : '';
    if (
      !fid ||
      seenFixtureIds.has(fid) ||
      !hid ||
      !aid ||
      hid === aid ||
      !standingsTeamIds.has(hid) ||
      !standingsTeamIds.has(aid)
    ) {
      allFixturesStructurallyValid = false;
      break;
    }
    seenFixtureIds.add(fid);
    teamScheduleCounts.set(hid, (teamScheduleCounts.get(hid) || 0) + 1);
    teamScheduleCounts.set(aid, (teamScheduleCounts.get(aid) || 0) + 1);
  }

  let inferredScheduleMatchesPerTeam: number | null = null;
  if (allFixturesStructurallyValid && domesticFixtures.length >= Math.floor((numTeams * (numTeams - 1)) / 2)) {
    const counts = Array.from(teamScheduleCounts.values());
    const firstCount = counts[0] || 0;
    if (firstCount >= numTeams - 1 && counts.every(c => c === firstCount)) {
      inferredScheduleMatchesPerTeam = firstCount;
    }
  }

  const expectedMatchesPerTeam =
    explicitMatchesPerTeam ??
    inferredScheduleMatchesPerTeam ??
    (numTeams === 10 ? 18 : Math.max(2, (numTeams - 1) * 2));
  const expectedTotalFixtures = Math.max(
    Math.floor((numTeams * (numTeams - 1)) / 2),
    Math.floor((numTeams * expectedMatchesPerTeam) / 2)
  );

  const completedDomesticCount = domesticFixtures.filter(
    f =>
      Boolean(f.completed) &&
      ((typeof f.resultSummary === 'string' && f.resultSummary.trim().length > 0) ||
        Boolean(f.completedMatchState && f.completedMatchState.status === 'finished'))
  ).length;

  // If the calendar has some completed and some uncompleted domestic fixtures, the league is actively mid-season
  if (domesticFixtures.length > 0 && completedDomesticCount > 0 && completedDomesticCount < domesticFixtures.length) {
    return false;
  }

  const calendarMatchesComplete =
    allFixturesStructurallyValid &&
    domesticFixtures.length >= expectedTotalFixtures &&
    completedDomesticCount === domesticFixtures.length;

  // Check authoritative final standings
  let totalWins = 0;
  let totalLosses = 0;
  const standingsRowsValid = league.standings.every(s => {
    if (!s || typeof s.played !== 'number' || typeof s.won !== 'number' || typeof s.lost !== 'number') {
      return false;
    }
    const tied = typeof s.tied === 'number' ? s.tied : 0;
    if (s.played < expectedMatchesPerTeam || s.won < 0 || s.lost < 0 || tied < 0) {
      return false;
    }
    if (s.won + s.lost + tied !== s.played) {
      return false;
    }
    totalWins += s.won;
    totalLosses += s.lost;
    return true;
  });

  const standingsComplete = standingsRowsValid && totalWins === totalLosses && totalWins > 0;

  return standingsComplete || calendarMatchesComplete;
}

/**
 * Seeds the top-4 teams from final standings into Qualifier 1 and Eliminator once the league stage is complete,
 * preserving any already-completed playoff rounds.
 */
export function seedQualifiedPlayoffsFromStandings(
  standings: League['standings'],
  existingPlayoffs?: League['playoffs']
): NonNullable<League['playoffs']> {
  const base = existingPlayoffs || createInitialPlayoffs(standings);
  const sorted = [...(standings || [])].sort((a, b) => b.points - a.points || b.nrr - a.nrr);
  const seed1 = sorted[0]?.teamId || null;
  const seed2 = sorted[1]?.teamId || null;
  const seed3 = sorted[2]?.teamId || null;
  const seed4 = sorted[3]?.teamId || null;

  const q1 = base.q1.completed
    ? base.q1
    : {
        ...base.q1,
        homeTeamId: seed1,
        awayTeamId: seed2
      };
  const eliminator = base.eliminator.completed
    ? base.eliminator
    : {
        ...base.eliminator,
        homeTeamId: seed3,
        awayTeamId: seed4
      };
  const q2 = base.q2.completed
    ? base.q2
    : {
        ...base.q2,
        homeTeamId: q1.completed ? q1.loserTeamId : base.q2.homeTeamId,
        awayTeamId: eliminator.completed ? eliminator.winnerTeamId : base.q2.awayTeamId
      };
  const final = base.final.completed
    ? base.final
    : {
        ...base.final,
        homeTeamId: q1.completed ? q1.winnerTeamId : base.final.homeTeamId,
        awayTeamId: q2.completed ? q2.winnerTeamId : base.final.awayTeamId
      };

  return {
    ...base,
    q1,
    eliminator,
    q2,
    final
  };
}

/**
 * Synchronizes the 4 playoff calendar entries (`cal_playoff_q1`, `cal_playoff_eliminator`, `cal_playoff_q2`, `cal_playoff_final`)
 * with the authoritative `league.playoffs` state so participants, short names, logos, completion flags, and result summaries
 * never diverge between the Hub bracket and the season calendar.
 */
export function syncPlayoffCalendarDates(
  calendarDates: League['calendarDates'],
  playoffs: League['playoffs'],
  teamsPool: Team[]
): League['calendarDates'] {
  if (!Array.isArray(calendarDates) || !playoffs) {
    return calendarDates;
  }

  return calendarDates.map(cd => {
    if (!cd) return cd;
    let stage: 'q1' | 'eliminator' | 'q2' | 'final' | null = null;
    if (cd.id === 'cal_playoff_q1' || cd.matchFixture?.id === 'fix_playoff_q1') stage = 'q1';
    else if (cd.id === 'cal_playoff_eliminator' || cd.matchFixture?.id === 'fix_playoff_eliminator') stage = 'eliminator';
    else if (cd.id === 'cal_playoff_q2' || cd.matchFixture?.id === 'fix_playoff_q2') stage = 'q2';
    else if (cd.id === 'cal_playoff_final' || cd.matchFixture?.id === 'fix_playoff_final') stage = 'final';

    if (!stage) return cd;
    const stageState = playoffs[stage];
    if (!stageState) return cd;

    const homeTeam = stageState.homeTeamId ? teamsPool.find(t => t && t.id === stageState.homeTeamId) : undefined;
    const awayTeam = stageState.awayTeamId ? teamsPool.find(t => t && t.id === stageState.awayTeamId) : undefined;

    const existingFix = cd.matchFixture || {
      id: `fix_playoff_${stage}`,
      homeTeamId: '',
      awayTeamId: '',
      venue: 'Narendra Modi Stadium, Ahmedabad',
      completed: false,
      format: 'T20' as const
    };

    return {
      ...cd,
      matchFixture: {
        ...existingFix,
        id: existingFix.id || `fix_playoff_${stage}`,
        homeTeamId: stageState.homeTeamId || '',
        awayTeamId: stageState.awayTeamId || '',
        homeShortName: homeTeam?.shortName || (stageState.homeTeamId ? stageState.homeTeamId : 'TBD'),
        awayShortName: awayTeam?.shortName || (stageState.awayTeamId ? stageState.awayTeamId : 'TBD'),
        homeLogo: homeTeam?.logoEmoji || existingFix.homeLogo || '🏆',
        awayLogo: awayTeam?.logoEmoji || existingFix.awayLogo || '🏆',
        completed: Boolean(stageState.completed),
        resultSummary: stageState.resultSummary ?? existingFix.resultSummary
      }
    };
  });
}

/**
 * Authoritative playoff eligibility validator.
 * - Enforces career gating: league stage must be legitimately completed before playoffs can be played or simulated.
 * - Enforces top 4 qualification from final standings and rejects stale or inconsistent preseeded brackets.
 * - Enforces prerequisite round completion (Q1 & Eliminator for Q2; Q1 & Q2 for Final).
 * - Enforces user team participation for manual PLAY / SIMULATE actions.
 */
export function validatePlayoffEligibility(params: {
  careerPhase: CareerPhase;
  league: League;
  userClubId: string | null;
  stage: 'q1' | 'eliminator' | 'q2' | 'final';
  isUserAction?: boolean;
}): {
  canPlay: boolean;
  canSimulate: boolean;
  isUserMatch: boolean;
  userQualified: boolean;
  userEliminated: boolean;
  reason?: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
} {
  const { league, userClubId, stage, isUserAction = false } = params;

  if (!league || !Array.isArray(league.standings) || league.standings.length < 4) {
    return {
      canPlay: false,
      canSimulate: false,
      isUserMatch: false,
      userQualified: false,
      userEliminated: false,
      reason: 'Invalid league or insufficient standings for playoff qualification.',
      homeTeamId: null,
      awayTeamId: null
    };
  }

  // 1. Career Gating: require all domestic league matches to be legitimately complete
  const leagueStageFinished = isDomesticLeagueStageComplete(league);

  if (!leagueStageFinished) {
    return {
      canPlay: false,
      canSimulate: false,
      isUserMatch: false,
      userQualified: false,
      userEliminated: false,
      reason: 'League stage is incomplete. All domestic league matches must be completed before playoffs can begin.',
      homeTeamId: null,
      awayTeamId: null
    };
  }

  // 2. Resolve Top 4 Qualification from final standings
  const sortedStandings = [...league.standings].sort((a, b) => b.points - a.points || b.nrr - a.nrr);
  const seed1 = sortedStandings[0]?.teamId || null;
  const seed2 = sortedStandings[1]?.teamId || null;
  const seed3 = sortedStandings[2]?.teamId || null;
  const seed4 = sortedStandings[3]?.teamId || null;
  const top4Ids = [seed1, seed2, seed3, seed4].filter((id): id is string => Boolean(id));

  if (new Set(top4Ids).size !== 4) {
    return {
      canPlay: false,
      canSimulate: false,
      isUserMatch: false,
      userQualified: false,
      userEliminated: false,
      reason: 'Top 4 playoff seeds could not be uniquely resolved from standings.',
      homeTeamId: null,
      awayTeamId: null
    };
  }

  const standingsTeamIds = new Set(league.standings.map(s => s.teamId));
  const userQualified = Boolean(userClubId && top4Ids.includes(userClubId));

  // 3. Resolve Playoff Match Participants & Verify Bracket Progression Consistency
  const playoffs = league.playoffs || createInitialPlayoffs(sortedStandings);
  const stageData = playoffs[stage];

  let homeTeamId: string | null = stageData?.homeTeamId || null;
  let awayTeamId: string | null = stageData?.awayTeamId || null;

  if (stage === 'q1') {
    if (
      (homeTeamId !== null && homeTeamId !== seed1) ||
      (awayTeamId !== null && awayTeamId !== seed2)
    ) {
      return {
        canPlay: false,
        canSimulate: false,
        isUserMatch: false,
        userQualified,
        userEliminated: false,
        reason: 'Qualifier 1 participants do not match the authoritative 1st and 2nd place standings.',
        homeTeamId: null,
        awayTeamId: null
      };
    }
    homeTeamId = seed1;
    awayTeamId = seed2;
  } else if (stage === 'eliminator') {
    if (
      (homeTeamId !== null && homeTeamId !== seed3) ||
      (awayTeamId !== null && awayTeamId !== seed4)
    ) {
      return {
        canPlay: false,
        canSimulate: false,
        isUserMatch: false,
        userQualified,
        userEliminated: false,
        reason: 'Eliminator participants do not match the authoritative 3rd and 4th place standings.',
        homeTeamId: null,
        awayTeamId: null
      };
    }
    homeTeamId = seed3;
    awayTeamId = seed4;
  } else if (stage === 'q2') {
    if (
      !playoffs.q1?.completed ||
      !playoffs.eliminator?.completed ||
      !playoffs.q1.loserTeamId ||
      !playoffs.eliminator.winnerTeamId
    ) {
      return {
        canPlay: false,
        canSimulate: false,
        isUserMatch: false,
        userQualified,
        userEliminated: false,
        reason: 'Qualifier 2 requires Qualifier 1 and Eliminator to be completed first.',
        homeTeamId: null,
        awayTeamId: null
      };
    }
    const expectedQ2Home = playoffs.q1.loserTeamId;
    const expectedQ2Away = playoffs.eliminator.winnerTeamId;
    if (
      (expectedQ2Home !== seed1 && expectedQ2Home !== seed2) ||
      (expectedQ2Away !== seed3 && expectedQ2Away !== seed4) ||
      (homeTeamId !== null && homeTeamId !== expectedQ2Home) ||
      (awayTeamId !== null && awayTeamId !== expectedQ2Away)
    ) {
      return {
        canPlay: false,
        canSimulate: false,
        isUserMatch: false,
        userQualified,
        userEliminated: false,
        reason: 'Qualifier 2 participants do not match the authoritative Q1 loser and Eliminator winner.',
        homeTeamId: null,
        awayTeamId: null
      };
    }
    homeTeamId = expectedQ2Home;
    awayTeamId = expectedQ2Away;
  } else if (stage === 'final') {
    if (
      !playoffs.q1?.completed ||
      !playoffs.q2?.completed ||
      !playoffs.q1.winnerTeamId ||
      !playoffs.q2.winnerTeamId
    ) {
      return {
        canPlay: false,
        canSimulate: false,
        isUserMatch: false,
        userQualified,
        userEliminated: false,
        reason: 'Grand Final requires Qualifier 1 and Qualifier 2 to be completed first.',
        homeTeamId: null,
        awayTeamId: null
      };
    }
    const expectedFinalHome = playoffs.q1.winnerTeamId;
    const expectedFinalAway = playoffs.q2.winnerTeamId;
    if (
      (expectedFinalHome !== seed1 && expectedFinalHome !== seed2) ||
      !top4Ids.includes(expectedFinalAway) ||
      (homeTeamId !== null && homeTeamId !== expectedFinalHome) ||
      (awayTeamId !== null && awayTeamId !== expectedFinalAway)
    ) {
      return {
        canPlay: false,
        canSimulate: false,
        isUserMatch: false,
        userQualified,
        userEliminated: false,
        reason: 'Grand Final participants do not match the authoritative Q1 winner and Q2 winner.',
        homeTeamId: null,
        awayTeamId: null
      };
    }
    homeTeamId = expectedFinalHome;
    awayTeamId = expectedFinalAway;
  }

  // 4. Verify participant validity against league membership
  if (
    !homeTeamId ||
    !awayTeamId ||
    homeTeamId === awayTeamId ||
    !standingsTeamIds.has(homeTeamId) ||
    !standingsTeamIds.has(awayTeamId)
  ) {
    return {
      canPlay: false,
      canSimulate: false,
      isUserMatch: false,
      userQualified,
      userEliminated: false,
      reason: 'Playoff participants are missing, unresolvable, or non-distinct.',
      homeTeamId: null,
      awayTeamId: null
    };
  }

  // 5. Check match completion (both bracket and playoff calendar fixture)
  const calPlayoffEntry = Array.isArray(league.calendarDates)
    ? league.calendarDates.find(
        cd =>
          cd &&
          (cd.id === `cal_playoff_${stage}` || cd.matchFixture?.id === `fix_playoff_${stage}`)
      )
    : undefined;
  const alreadyCompletedInCalendar = Boolean(
    calPlayoffEntry?.matchFixture?.completed &&
      calPlayoffEntry.matchFixture.homeTeamId === homeTeamId &&
      calPlayoffEntry.matchFixture.awayTeamId === awayTeamId
  );

  if (stageData?.completed || alreadyCompletedInCalendar) {
    return {
      canPlay: false,
      canSimulate: false,
      isUserMatch: Boolean(userClubId && (homeTeamId === userClubId || awayTeamId === userClubId)),
      userQualified,
      userEliminated: false,
      reason: 'This playoff match has already been completed.',
      homeTeamId,
      awayTeamId
    };
  }

  // 6. User Elimination Status
  let userEliminated = false;
  if (userClubId && userQualified) {
    if (playoffs.eliminator.completed && playoffs.eliminator.loserTeamId === userClubId) {
      userEliminated = true;
    }
    if (playoffs.q2.completed && playoffs.q2.loserTeamId === userClubId) {
      userEliminated = true;
    }
  }

  const isUserMatch = Boolean(userClubId && (homeTeamId === userClubId || awayTeamId === userClubId));

  // 7. User Action Authorization
  if (isUserAction) {
    if (!userClubId) {
      return {
        canPlay: false,
        canSimulate: false,
        isUserMatch: false,
        userQualified: false,
        userEliminated: false,
        reason: 'No active franchise club.',
        homeTeamId,
        awayTeamId
      };
    }

    if (!userQualified) {
      return {
        canPlay: false,
        canSimulate: false,
        isUserMatch: false,
        userQualified: false,
        userEliminated: true,
        reason: 'Your team did not qualify for the playoffs.',
        homeTeamId,
        awayTeamId
      };
    }

    if (userEliminated) {
      return {
        canPlay: false,
        canSimulate: false,
        isUserMatch: false,
        userQualified: true,
        userEliminated: true,
        reason: 'Your team has been eliminated from the playoffs.',
        homeTeamId,
        awayTeamId
      };
    }

    if (!isUserMatch) {
      return {
        canPlay: false,
        canSimulate: false,
        isUserMatch: false,
        userQualified: true,
        userEliminated: false,
        reason: 'Manual simulation is restricted to fixtures involving your coached team.',
        homeTeamId,
        awayTeamId
      };
    }

    return {
      canPlay: true,
      canSimulate: true,
      isUserMatch: true,
      userQualified: true,
      userEliminated: false,
      homeTeamId,
      awayTeamId
    };
  }

  return {
    canPlay: isUserMatch,
    canSimulate: Boolean(homeTeamId && awayTeamId && homeTeamId !== awayTeamId),
    isUserMatch,
    userQualified,
    userEliminated,
    homeTeamId,
    awayTeamId
  };
}

/**
 * Validates and recovers restored career state at the persistence boundary (save/load and startup).
 * - Resolves the active league using `currentLeagueId` first, then the explicit recovery policy (never blindly picking `leagues[0]`)
 * - Validates `rawPhase` against `VALID_CAREER_PHASES` and migrates legacy phase strings
 * - Prevents franchise-only saves from resuming in international-only phases and vice versa
 * - Prevents an already-completed final/board review/auction from repeating on reload
 * - Scopes `careerBoardReview` to the active `(seasonYear, competitionId, teamId)` and archives mismatched reviews
 * - Migrates legacy `internationalSeries` lacking a `seriesId` while preserving completed fixtures
 */
export function validateAndRecoverCareerState(params: {
  rawPhase: unknown;
  coachProfile: CoachProfile;
  teams: Team[];
  leagues: League[];
  currentLeagueId?: string;
  expectedSeasonYear?: number;
  nations: Nation[];
  nationalSquadIds: string[];
  careerBoardReview: CareerBoardReview | null;
  players: Player[];
  internationalSeries?: InternationalSeriesState;
}): {
  careerPhase: CareerPhase;
  careerBoardReview: CareerBoardReview | null;
  nationalSquadIds: string[];
  coachProfile: CoachProfile;
  internationalSeries?: InternationalSeriesState;
  resolvedLeagueId: string | null;
  requiresLeagueSelection: boolean;
  candidateLeagueIds: string[];
  recoveryError?: string;
  migrated: boolean;
  recoveryReason?: string;
} {
  const {
    rawPhase,
    coachProfile,
    leagues,
    currentLeagueId,
    expectedSeasonYear,
    nations,
    nationalSquadIds,
    careerBoardReview,
    players,
    internationalSeries
  } = params;

  const safeCoachProfile: CoachProfile =
    coachProfile && typeof coachProfile === 'object'
      ? coachProfile
      : { ...INITIAL_COACH_PROFILE, proUnlocked: true };
  const safeNations: Nation[] = Array.isArray(nations) ? nations : [];
  const safePlayers: Player[] = Array.isArray(players) ? players : [];
  const safeReview: CareerBoardReview | null =
    careerBoardReview && typeof careerBoardReview === 'object' && typeof careerBoardReview.scorePct === 'number'
      ? careerBoardReview
      : null;

  let migrated = false;
  let recoveryReason: string | undefined;
  let recoveryError: string | undefined;

  // 0. Migrate legacy internationalSeries if provided without seriesId
  let resolvedIntlSeries: InternationalSeriesState | undefined = internationalSeries;
  if (internationalSeries && (!internationalSeries.seriesId || internationalSeries.seriesId.trim().length === 0)) {
    const migRes = migrateLegacyInternationalSeries(
      internationalSeries,
      safeNations,
      safeCoachProfile.completedInternationalSeriesIds || []
    );
    if (migRes.canMigrate && migRes.series) {
      resolvedIntlSeries = migRes.series;
      if (migRes.migrated) {
        migrated = true;
        recoveryReason = 'Migrated legacy international series to persistent seriesId';
      }
    } else {
      recoveryError = migRes.error;
    }
  }

  // 1. Reconcile coachedNation and nationalSquadIds (independent of franchise league resolution)
  const coachedNation = safeCoachProfile.nationalTeamId
    ? safeNations.find(
        n =>
          n &&
          (n.id === safeCoachProfile.nationalTeamId ||
            (typeof n.name === 'string' &&
              n.name.toLowerCase() === String(safeCoachProfile.nationalTeamId).toLowerCase()))
      ) || null
    : null;

  let reconciledNatSquadIds = Array.isArray(nationalSquadIds)
    ? nationalSquadIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];
  if (coachedNation) {
    const nationLower = coachedNation.name.trim().toLowerCase();
    const eligibleSet = new Set(
      safePlayers
        .filter(p => p && typeof p.country === 'string' && p.country.trim().toLowerCase() === nationLower)
        .map(p => p.id)
    );
    const seen = new Set<string>();
    const filtered = reconciledNatSquadIds.filter(id => {
      if (!eligibleSet.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (!Array.isArray(nationalSquadIds) || filtered.length !== nationalSquadIds.length) {
      migrated = true;
      recoveryReason = 'Removed ineligible or duplicate player IDs from nationalSquadIds';
    }
    reconciledNatSquadIds = filtered;
  } else if (safeCoachProfile.nationalTeamId) {
    reconciledNatSquadIds = [];
    migrated = true;
    recoveryReason = `Cleared invalid nationalTeamId: ${String(safeCoachProfile.nationalTeamId)}`;
  }

  // 2. Migrate legacy phase aliases
  let candidatePhase: unknown = rawPhase;
  if (candidatePhase === 'off_season') {
    candidatePhase = 'off_season_rest';
    migrated = true;
    recoveryReason = 'Migrated legacy phase off_season -> off_season_rest';
  } else if (candidatePhase === 'national_selection') {
    candidatePhase = 'international_squad_selection';
    migrated = true;
    recoveryReason = 'Migrated legacy phase national_selection -> international_squad_selection';
  } else if (candidatePhase === 'job_offers') {
    candidatePhase = 'career_decision';
    migrated = true;
    recoveryReason = 'Migrated legacy phase job_offers -> career_decision';
  } else if (candidatePhase === 'season_transition') {
    candidatePhase = 'next_season_ready';
    migrated = true;
    recoveryReason = 'Migrated legacy phase season_transition -> next_season_ready';
  }

  // 3. Resolve active league using currentLeagueId first, then explicit recovery policy
  const leagueResolution = resolveActiveLeagueForRecovery({
    leagues,
    currentLeagueId,
    coachProfile: safeCoachProfile,
    careerBoardReview: safeReview,
    expectedSeasonYear,
    internationalSeries: resolvedIntlSeries
  });

  if (leagueResolution.recoveredByPolicy) {
    migrated = true;
    recoveryReason = `Recovered active league "${leagueResolution.resolvedLeagueId}" via explicit team/season policy`;
  }
  if (leagueResolution.requiresLeagueSelection) {
    recoveryError = leagueResolution.error;
  }

  const activeLeague = leagueResolution.league;
  const activeTeamId = safeCoachProfile.clubTeamId;

  // If no unique valid active league could be resolved (0 or >1 plausible candidates),
  // NEVER silently associate the career with an unrelated league or overwrite unrelated state.
  if (!activeLeague) {
    let fallbackPhase: CareerPhase = isValidCareerPhase(candidatePhase) ? candidatePhase : 'league_stage';
    if (!isValidCareerPhase(candidatePhase)) {
      migrated = true;
      recoveryReason = `Recovered from invalid career phase: ${String(rawPhase)}`;
    }
    const isIntlPhase =
      fallbackPhase === 'international_squad_selection' || fallbackPhase === 'international_series';
    if (isIntlPhase && !coachedNation) {
      fallbackPhase = 'league_stage';
      migrated = true;
    } else if (fallbackPhase === 'international_series' && coachedNation && reconciledNatSquadIds.length !== 15) {
      fallbackPhase = 'international_squad_selection';
      migrated = true;
    }

    const fallbackProfile: CoachProfile =
      safeCoachProfile.nationalTeamId === (coachedNation ? coachedNation.id : null)
        ? safeCoachProfile
        : {
            ...safeCoachProfile,
            nationalTeamId: coachedNation ? coachedNation.id : null
          };

    return {
      careerPhase: fallbackPhase,
      careerBoardReview: safeReview,
      nationalSquadIds: reconciledNatSquadIds,
      coachProfile: fallbackProfile,
      internationalSeries: resolvedIntlSeries,
      resolvedLeagueId: null,
      requiresLeagueSelection: true,
      candidateLeagueIds: leagueResolution.candidateLeagueIds,
      recoveryError: recoveryError || 'Unable to determine a unique active league.',
      migrated,
      recoveryReason
    };
  }

  const activeCompetitionId = activeLeague.id;
  const activeSeasonYear =
    activeLeague.seasonYear ||
    parseInt(normalizeSeasonYear(activeLeague.seasonName), 10) ||
    2026;

  // 4. Scope board review to active (seasonYear, competitionId, teamId)
  let updatedHistory = Array.isArray(safeCoachProfile.boardReviewsHistory)
    ? [...safeCoachProfile.boardReviewsHistory]
    : [];
  let scopedReview: CareerBoardReview | null = safeReview;
  if (scopedReview) {
    const reviewCompId = scopedReview.competitionId || 'pt20';
    if (
      scopedReview.teamId !== activeTeamId ||
      scopedReview.seasonYear !== activeSeasonYear ||
      reviewCompId !== activeCompetitionId
    ) {
      const alreadyArchived = updatedHistory.some(
        r =>
          r &&
          r.seasonYear === scopedReview!.seasonYear &&
          r.teamId === scopedReview!.teamId &&
          (r.competitionId || 'pt20') === reviewCompId
      );
      if (!alreadyArchived) {
        updatedHistory = [scopedReview, ...updatedHistory];
      }
      scopedReview =
        updatedHistory.find(
          r =>
            r &&
            r.seasonYear === activeSeasonYear &&
            r.teamId === activeTeamId &&
            (r.competitionId || 'pt20') === activeCompetitionId
        ) || null;
      migrated = true;
      recoveryReason = 'Scoped board review to active league, team, and season';
    }
  } else if (updatedHistory.length > 0) {
    const matchingArchived = updatedHistory.find(
      r =>
        r &&
        r.seasonYear === activeSeasonYear &&
        r.teamId === activeTeamId &&
        (r.competitionId || 'pt20') === activeCompetitionId
    );
    if (matchingArchived) {
      scopedReview = matchingArchived;
    }
  }

  const finalCompleted = Boolean(activeLeague.playoffs?.final?.completed);
  const anyPlayoffCompleted = Boolean(
    activeLeague.playoffs?.q1?.completed ||
      activeLeague.playoffs?.eliminator?.completed ||
      activeLeague.playoffs?.q2?.completed ||
      activeLeague.playoffs?.final?.completed
  );
  const allLeagueMatchesPlayed = Boolean(
    isDomesticLeagueStageComplete(activeLeague) ||
      (activeLeague.standings &&
        activeLeague.standings.length > 0 &&
        activeLeague.standings.every(
          s => s && s.played >= 18 && s.won + s.lost + (s.tied || 0) === s.played
        ))
  );

  // Helper to infer franchise phase from the active league's state
  const inferFranchisePhase = (): CareerPhase => {
    if (finalCompleted) {
      return scopedReview ? 'career_decision' : 'board_review';
    }
    if (allLeagueMatchesPlayed || anyPlayoffCompleted) {
      return 'playoffs';
    }
    return 'league_stage';
  };

  let resolvedPhase: CareerPhase;
  if (!isValidCareerPhase(candidatePhase)) {
    migrated = true;
    recoveryReason = `Recovered from invalid career phase: ${String(rawPhase)}`;
    if (coachedNation && reconciledNatSquadIds.length !== 15) {
      resolvedPhase = 'international_squad_selection';
    } else {
      resolvedPhase = inferFranchisePhase();
    }
  } else {
    resolvedPhase = candidatePhase;
  }

  // 5. Cross-mode & idempotency recovery guards
  const isInternationalOnlyPhase =
    resolvedPhase === 'international_squad_selection' ||
    resolvedPhase === 'international_series';

  if (isInternationalOnlyPhase && !coachedNation) {
    resolvedPhase = inferFranchisePhase();
    migrated = true;
    recoveryReason = 'Recovered franchise-only save from international phase';
  } else if (resolvedPhase === 'international_series' && coachedNation && reconciledNatSquadIds.length !== 15) {
    resolvedPhase = 'international_squad_selection';
    migrated = true;
    recoveryReason = 'Recovered international_series with incomplete national squad to international_squad_selection';
  } else if (resolvedPhase === 'season_final' && finalCompleted) {
    resolvedPhase = scopedReview ? 'career_decision' : 'board_review';
    migrated = true;
    recoveryReason = 'Advanced completed season_final to post-final review/decision phase';
  } else if (resolvedPhase === 'board_review' && !finalCompleted) {
    resolvedPhase = inferFranchisePhase();
    migrated = true;
    recoveryReason = 'Recovered premature board_review to active league stage/playoffs';
  } else if (resolvedPhase === 'playoffs' && finalCompleted) {
    resolvedPhase = scopedReview ? 'career_decision' : 'board_review';
    migrated = true;
    recoveryReason = 'Advanced completed playoffs to post-final review/decision phase';
  } else if (resolvedPhase === 'league_stage' && finalCompleted) {
    resolvedPhase = scopedReview ? 'career_decision' : 'board_review';
    migrated = true;
    recoveryReason = 'Advanced league_stage with completed final to post-final review/decision phase';
  } else if (resolvedPhase === 'league_stage' && allLeagueMatchesPlayed) {
    resolvedPhase = 'playoffs';
    migrated = true;
    recoveryReason = 'Advanced completed league_stage to playoffs';
  }

  const nextCoachProfile: CoachProfile =
    safeCoachProfile.nationalTeamId === (coachedNation ? coachedNation.id : null) &&
    updatedHistory.length === (safeCoachProfile.boardReviewsHistory || []).length
      ? safeCoachProfile
      : {
          ...safeCoachProfile,
          nationalTeamId: coachedNation ? coachedNation.id : null,
          boardReviewsHistory: updatedHistory
        };

  const invariantRes = enforceSingleCareerInvariant(nextCoachProfile, undefined, resolvedPhase);
  if (invariantRes.migrated) {
    migrated = true;
    recoveryReason = recoveryReason
      ? `${recoveryReason}; Migrated to single active career invariant`
      : 'Migrated to single active career invariant';
  }
  const finalCoachProfile = invariantRes.coachProfile;

  return {
    careerPhase: resolvedPhase,
    careerBoardReview: scopedReview,
    nationalSquadIds: reconciledNatSquadIds,
    coachProfile: finalCoachProfile,
    internationalSeries: resolvedIntlSeries,
    resolvedLeagueId: activeLeague.id,
    requiresLeagueSelection: false,
    candidateLeagueIds: [activeLeague.id],
    recoveryError,
    migrated,
    recoveryReason
  };
}

/**
 * Authoritative pure state transition for completing a playoff match (including the Championship Final)
 * and generating/scoping the post-final board review idempotently.
 */
export function applyCompletePlayoffMatchState(
  state: {
    leagues: League[];
    currentLeagueId: string;
    teams: Team[];
    coachProfile: CoachProfile;
    tournamentHonors: TournamentHonor[];
    careerPhase: CareerPhase;
    careerBoardReview: CareerBoardReview | null;
  },
  params: {
    leagueId: string;
    stage: 'q1' | 'eliminator' | 'q2' | 'final';
    homeTeamId: string;
    awayTeamId: string;
    winnerTeamId: string;
    resultSummary: string;
  }
): {
  alreadyCompleted: boolean;
  leagues: League[];
  coachProfile: CoachProfile;
  tournamentHonors: TournamentHonor[];
  careerPhase: CareerPhase;
  careerBoardReview: CareerBoardReview | null;
} {
  const { leagues, teams, coachProfile, tournamentHonors, careerPhase, careerBoardReview } = state;
  const { leagueId, stage, homeTeamId, awayTeamId, winnerTeamId, resultSummary } = params;
  const targetLeague = leagues.find(l => l.id === leagueId);
  if (!targetLeague) {
    return {
      alreadyCompleted: false,
      leagues,
      coachProfile,
      tournamentHonors,
      careerPhase,
      careerBoardReview
    };
  }

  const currentPlayoffs = targetLeague.playoffs || createInitialPlayoffs(targetLeague.standings);
  const existingCalPlayoff = Array.isArray(targetLeague.calendarDates)
    ? targetLeague.calendarDates.find(
        cd =>
          cd &&
          (cd.id === `cal_playoff_${stage}` || cd.matchFixture?.id === `fix_playoff_${stage}`)
      )
    : undefined;
  const alreadyCompletedInCalendar = Boolean(
    existingCalPlayoff?.matchFixture?.completed &&
      existingCalPlayoff.matchFixture.homeTeamId === homeTeamId &&
      existingCalPlayoff.matchFixture.awayTeamId === awayTeamId
  );

  if (currentPlayoffs[stage]?.completed || alreadyCompletedInCalendar) {
    return {
      alreadyCompleted: true,
      leagues,
      coachProfile,
      tournamentHonors,
      careerPhase,
      careerBoardReview
    };
  }

  const loserTeamId = winnerTeamId === homeTeamId ? awayTeamId : homeTeamId;
  const updatedPlayoffs = {
    q1: { ...currentPlayoffs.q1 },
    eliminator: { ...currentPlayoffs.eliminator },
    q2: { ...currentPlayoffs.q2 },
    final: { ...currentPlayoffs.final },
    championTeamId: currentPlayoffs.championTeamId
  };

  if (stage === 'q1') {
    updatedPlayoffs.q1 = {
      ...updatedPlayoffs.q1,
      homeTeamId,
      awayTeamId,
      winnerTeamId,
      loserTeamId,
      completed: true,
      resultSummary
    };
    updatedPlayoffs.q2 = { ...updatedPlayoffs.q2, homeTeamId: loserTeamId };
    updatedPlayoffs.final = { ...updatedPlayoffs.final, homeTeamId: winnerTeamId };
  } else if (stage === 'eliminator') {
    updatedPlayoffs.eliminator = {
      ...updatedPlayoffs.eliminator,
      homeTeamId,
      awayTeamId,
      winnerTeamId,
      loserTeamId,
      completed: true,
      resultSummary
    };
    updatedPlayoffs.q2 = { ...updatedPlayoffs.q2, awayTeamId: winnerTeamId };
  } else if (stage === 'q2') {
    updatedPlayoffs.q2 = {
      ...updatedPlayoffs.q2,
      homeTeamId,
      awayTeamId,
      winnerTeamId,
      loserTeamId,
      completed: true,
      resultSummary
    };
    updatedPlayoffs.final = { ...updatedPlayoffs.final, awayTeamId: winnerTeamId };
  } else if (stage === 'final') {
    updatedPlayoffs.final = {
      ...updatedPlayoffs.final,
      homeTeamId,
      awayTeamId,
      winnerTeamId,
      loserTeamId,
      completed: true,
      resultSummary
    };
    updatedPlayoffs.championTeamId = winnerTeamId;
  }

  const updatedLeagues = leagues.map(l =>
    l.id === leagueId
      ? {
          ...l,
          playoffs: updatedPlayoffs,
          calendarDates: syncPlayoffCalendarDates(
            l.calendarDates,
            updatedPlayoffs,
            [...teams, ...(l.teams || [])]
          )
        }
      : l
  );

  if (stage !== 'final') {
    return {
      alreadyCompleted: false,
      leagues: updatedLeagues,
      coachProfile,
      tournamentHonors,
      careerPhase: careerPhase === 'league_stage' ? 'playoffs' : careerPhase,
      careerBoardReview
    };
  }

  const seasonYrStr = normalizeSeasonYear(targetLeague.seasonName || targetLeague.seasonYear);
  const seasonYrNum = parseInt(seasonYrStr, 10) || 2026;
  const champTeam = teams.find(t => t.id === winnerTeamId) || teams[0];
  const cleanedHonors = sanitizeTournamentHonors(tournamentHonors);
  const honorExists = cleanedHonors.some(
    h => normalizeSeasonYear(h.year) === seasonYrStr && h.tournamentName === targetLeague.name
  );
  const nextHonors = honorExists
    ? cleanedHonors
    : [
        {
          year: seasonYrStr,
          tournamentName: targetLeague.name || 'Indian Premier League',
          championTeamId: champTeam.id,
          championTeamName: champTeam.name,
          championLogo: champTeam.logoEmoji || '🏆'
        },
        ...cleanedHonors
      ];

  const userTeamId = coachProfile.clubTeamId;
  const userWonFinal = winnerTeamId === userTeamId;
  const sortedStandings = [...(targetLeague.standings || [])].sort(
    (a, b) => b.points - a.points || b.nrr - a.nrr
  );
  const userStandingRow = sortedStandings.find(s => s.teamId === userTeamId);
  const userRank = userWonFinal
    ? 1
    : loserTeamId === userTeamId
    ? 2
    : Math.max(1, sortedStandings.findIndex(s => s.teamId === userTeamId) + 1);

  const reviewAlreadyMatches =
    careerBoardReview &&
    careerBoardReview.seasonYear === seasonYrNum &&
    careerBoardReview.teamId === userTeamId &&
    (careerBoardReview.competitionId || 'pt20') === leagueId;

  const userTeamObj = teams.find(t => t.id === userTeamId) || champTeam;
  const objectives: CareerBoardReview['objectives'] = [
    {
      id: 'target_playoffs',
      category: 'PRIMARY',
      title: 'Reach Top 4 Playoffs',
      description: 'Finish in the top 4 to qualify for the playoffs',
      targetStr: 'Top 4',
      measuredStr: `#${userRank}`,
      isFulfilled: userRank <= 4
    },
    {
      id: 'target_nrr',
      category: 'SECONDARY',
      title: 'Maintain Positive NRR',
      description: 'Keep Net Run Rate above 0.00 across the league stage',
      targetStr: '> 0.00',
      measuredStr: `${(userStandingRow?.nrr || 0).toFixed(2)}`,
      isFulfilled: (userStandingRow?.nrr || 0) > 0
    }
  ];
  const fulfilledCount = objectives.filter(o => o.isFulfilled).length;
  const totalCount = objectives.length;
  const scorePct = Math.round((fulfilledCount / totalCount) * 100);

  const nextBoardReview: CareerBoardReview = reviewAlreadyMatches
    ? careerBoardReview!
    : {
        seasonYear: seasonYrNum,
        competitionId: leagueId,
        teamId: userTeamId,
        teamName: userTeamObj?.name || 'Franchise',
        objectives,
        fulfilledCount,
        totalCount,
        scorePct,
        isSatisfied: scorePct >= 60,
        verdictTitle: userWonFinal ? 'CHAMPIONSHIP DYNASTY' : 'SEASON CONCLUDED',
        verdictDesc: `${champTeam.name} crowned ${seasonYrStr} Champions. ${resultSummary}`
      };

  const dom = coachProfile.domesticStats || {
    seasons: 1,
    matches: 0,
    wins: 0,
    losses: 0,
    winPct: 0,
    titles: 0,
    playoffRuns: 0,
    bestStreak: 0,
    currentStreak: 0
  };
  const isUserInFinal = homeTeamId === userTeamId || awayTeamId === userTeamId;
  const nextCoachProfile: CoachProfile = isUserInFinal
    ? {
        ...coachProfile,
        domesticTitles: (coachProfile.domesticTitles || 0) + (userWonFinal ? 1 : 0),
        domesticStats: {
          ...dom,
          matches: dom.matches + 1,
          wins: dom.wins + (userWonFinal ? 1 : 0),
          losses: dom.losses + (userWonFinal ? 0 : 1),
          titles: dom.titles + (userWonFinal ? 1 : 0)
        }
      }
    : coachProfile;

  return {
    alreadyCompleted: false,
    leagues: updatedLeagues,
    coachProfile: nextCoachProfile,
    tournamentHonors: nextHonors,
    careerPhase: 'board_review',
    careerBoardReview: nextBoardReview
  };
}

/**
 * Authoritative pure state transition for confirming the end-of-season Board Review.
 * Idempotent: only transitions from `board_review` to `career_decision` once and archives the review without duplicates.
 */
export function applyConfirmBoardReviewState(state: {
  careerPhase: CareerPhase;
  careerBoardReview: CareerBoardReview | null;
  coachProfile: CoachProfile;
}): {
  alreadyConfirmed: boolean;
  careerPhase: CareerPhase;
  careerBoardReview: CareerBoardReview | null;
  coachProfile: CoachProfile;
} {
  const { careerPhase, careerBoardReview, coachProfile } = state;
  if (careerPhase !== 'board_review') {
    return {
      alreadyConfirmed: true,
      careerPhase,
      careerBoardReview,
      coachProfile
    };
  }

  let updatedHistory = [...(coachProfile.boardReviewsHistory || [])];
  if (careerBoardReview) {
    const compId = careerBoardReview.competitionId || 'pt20';
    const exists = updatedHistory.some(
      r =>
        r.seasonYear === careerBoardReview.seasonYear &&
        r.teamId === careerBoardReview.teamId &&
        (r.competitionId || 'pt20') === compId
    );
    if (!exists) {
      updatedHistory = [careerBoardReview, ...updatedHistory];
    }
  }

  return {
    alreadyConfirmed: false,
    careerPhase: 'career_decision',
    careerBoardReview,
    coachProfile:
      updatedHistory.length === (coachProfile.boardReviewsHistory || []).length
        ? coachProfile
        : {
            ...coachProfile,
            boardReviewsHistory: updatedHistory
          }
  };
}

/**
 * Authoritative pure state transition for Career Job Decision (Franchise & International).
 * Never mutates objects in place and is idempotent if invoked repeatedly with the same decision.
 */
export function applyCareerJobDecisionState(
  state: {
    coachProfile: CoachProfile;
    teams: Team[];
    nations: Nation[];
    players: Player[];
    leagues: League[];
    currentLeagueId: string;
    nationalSquadIds: string[];
    internationalSeries: InternationalSeriesState;
    careerPhase: CareerPhase;
    careerBoardReview: CareerBoardReview | null;
  },
  selectedClubId: string,
  selectedCountryId?: string | null
): {
  alreadyAccepted?: boolean;
  coachProfile: CoachProfile;
  teams: Team[];
  nations: Nation[];
  nationalSquadIds: string[];
  internationalSeries: InternationalSeriesState;
  careerPhase: CareerPhase;
  careerBoardReview: CareerBoardReview | null;
} {
  const {
    coachProfile,
    teams,
    nations,
    players,
    leagues,
    currentLeagueId,
    nationalSquadIds,
    internationalSeries,
    careerPhase,
    careerBoardReview
  } = state;

  const targetClub = teams.find(t => t.id === selectedClubId) || teams.find(t => t.id === coachProfile.clubTeamId) || teams[0];
  const resolvedClubId = targetClub.id;
  const clubChanged = resolvedClubId !== coachProfile.clubTeamId;

  const hasCountrySelection = Boolean(selectedCountryId && selectedCountryId !== 'none');
  const targetNation = hasCountrySelection
    ? nations.find(
        n =>
          n.id === selectedCountryId ||
          n.name.toLowerCase() === String(selectedCountryId).toLowerCase()
      ) || null
    : null;

  // Idempotency guard: if this exact club & country decision has already been applied
  // and careerPhase is already in the target post-decision phase, return existing state unchanged
  const expectedPostPhase: CareerPhase = targetNation ? 'international_squad_selection' : 'retention';
  const expectedNatId = targetNation ? targetNation.id : null;
  if (
    !clubChanged &&
    coachProfile.nationalTeamId === expectedNatId &&
    careerPhase === expectedPostPhase &&
    (!targetNation ||
      (internationalSeries.userNationId === targetNation.id &&
        Boolean(internationalSeries.seriesId)))
  ) {
    return {
      alreadyAccepted: true,
      coachProfile,
      teams,
      nations,
      nationalSquadIds,
      internationalSeries,
      careerPhase,
      careerBoardReview
    };
  }

  const activeLeague = leagues.find(l => l.id === currentLeagueId) || leagues[0];
  const currentYearStr = normalizeSeasonYear(activeLeague?.seasonName || activeLeague?.seasonYear);

  // Update teams immutably while preserving every team's squad, purse, contracts, and XI
  const updatedTeams = teams.map(t => ({
    ...t,
    isUserTeam: t.id === resolvedClubId
  }));

  // Archive board review if switching clubs so the new club gets a clean slate
  let nextBoardReviewsHistory = [...(coachProfile.boardReviewsHistory || [])];
  if (careerBoardReview) {
    const reviewCompId = careerBoardReview.competitionId || 'pt20';
    const exists = nextBoardReviewsHistory.some(
      r =>
        r.seasonYear === careerBoardReview.seasonYear &&
        r.teamId === careerBoardReview.teamId &&
        (r.competitionId || 'pt20') === reviewCompId
    );
    if (!exists) {
      nextBoardReviewsHistory = [careerBoardReview, ...nextBoardReviewsHistory];
    }
  }
  const nextBoardReview = clubChanged ? null : careerBoardReview;

  // Update clubStints immutably
  const prevStints = coachProfile.clubStints || [];
  const updatedStints = clubChanged
    ? [
        ...prevStints.map((s, idx) =>
          idx === prevStints.length - 1 && s.teamId !== resolvedClubId
            ? { ...s, period: s.period.replace('–present', `–${currentYearStr}`) }
            : s
        ),
        ...(prevStints.some(s => s.teamId === resolvedClubId && s.period.includes('present'))
          ? []
          : [
              {
                id: `stint_${resolvedClubId}_${currentYearStr}`,
                teamId: resolvedClubId,
                teamName: targetClub.city || targetClub.name,
                period: `${currentYearStr}–present`,
                seasons: 1,
                matches: 0,
                wins: 0,
                losses: 0,
                winPct: 0,
                titles: 0
              }
            ])
      ]
    : prevStints;

  if (targetNation) {
    const nationLower = targetNation.name.trim().toLowerCase();
    const eligiblePlayers = players.filter(
      p => p.country && p.country.trim().toLowerCase() === nationLower
    );
    const eligibleIds = new Set(eligiblePlayers.map(p => p.id));
    const preservedValid = (nationalSquadIds || []).filter(id => eligibleIds.has(id));
    const uniquePreserved = Array.from(new Set(preservedValid));
    const nextNatSquadIds =
      uniquePreserved.length === 15
        ? uniquePreserved
        : eligiblePlayers.slice(0, 15).map(p => p.id);

    const updatedNations = nations.map(n => ({
      ...n,
      isUserManaging: n.id === targetNation.id
    }));

    const existingSeriesIds = [
      ...(coachProfile.completedInternationalSeriesIds || []),
      ...(internationalSeries?.seriesId ? [internationalSeries.seriesId] : [])
    ];
    const tourCount = (coachProfile.completedInternationalSeriesIds?.length || 0) + 1;
    const nextSeries =
      internationalSeries.userNationId === targetNation.id &&
      Boolean(internationalSeries.seriesId) &&
      internationalSeries.matches.some(m => !m.completed)
        ? internationalSeries
        : buildInitialSeriesForNation(targetNation, updatedNations, undefined, tourCount, undefined, existingSeriesIds);

    const rawProfile: CoachProfile = {
      ...coachProfile,
      activeCareerMode: 'international',
      nationalTeamId: targetNation.id,
      clubTeamId: null as unknown as string,
      clubStints: updatedStints,
      boardReviewsHistory: nextBoardReviewsHistory
    };
    const inv = enforceSingleCareerInvariant(rawProfile, 'international', 'international_squad_selection', teams, nations);

    return {
      alreadyAccepted: false,
      coachProfile: inv.coachProfile,
      teams: updatedTeams,
      nations: updatedNations,
      nationalSquadIds: nextNatSquadIds,
      internationalSeries: nextSeries,
      careerPhase: 'international_squad_selection',
      careerBoardReview: nextBoardReview
    };
  }

  // Franchise-only path
  const updatedNations = nations.map(n => ({
    ...n,
    isUserManaging: false
  }));

  const rawProfile: CoachProfile = {
    ...coachProfile,
    activeCareerMode: 'franchise',
    clubTeamId: resolvedClubId,
    nationalTeamId: null,
    clubStints: updatedStints,
    boardReviewsHistory: nextBoardReviewsHistory
  };
  const inv = enforceSingleCareerInvariant(rawProfile, 'franchise', 'retention', teams, nations);

  return {
    alreadyAccepted: false,
    coachProfile: inv.coachProfile,
    teams: updatedTeams,
    nations: updatedNations,
    nationalSquadIds,
    internationalSeries,
    careerPhase: 'retention',
    careerBoardReview: nextBoardReview
  };
}

/**
 * Authoritative pure state transition for National Squad Confirmation.
 * Strictly validates 15 unique native players for the target nation and transitions to 'international_series'.
 */
export function applyConfirmNationalSquadState(
  state: {
    nations: Nation[];
    players: Player[];
    coachProfile: CoachProfile;
    nationalSquadIds: string[];
    internationalSeries: InternationalSeriesState;
    careerPhase: CareerPhase;
  },
  nationIdOrName: string,
  selectedPlayerIds: string[]
): {
  success: boolean;
  error?: string;
  alreadyConfirmed?: boolean;
  nextState: {
    nations: Nation[];
    coachProfile: CoachProfile;
    nationalSquadIds: string[];
    internationalSeries: InternationalSeriesState;
    careerPhase: CareerPhase;
  };
} {
  const { nations, players, coachProfile, nationalSquadIds, internationalSeries, careerPhase } = state;
  const unchanged = { nations, coachProfile, nationalSquadIds, internationalSeries, careerPhase };

  const normalizedQuery = typeof nationIdOrName === 'string' ? nationIdOrName.trim() : '';
  if (!normalizedQuery || !Array.isArray(nations) || nations.length === 0) {
    return {
      success: false,
      error: 'A valid national team must be specified.',
      nextState: unchanged
    };
  }

  const targetNation = nations.find(
    n => n.id === normalizedQuery || n.name.trim().toLowerCase() === normalizedQuery.toLowerCase()
  );
  if (!targetNation) {
    return {
      success: false,
      error: `Nation "${nationIdOrName}" was not found.`,
      nextState: unchanged
    };
  }

  const nationLower = targetNation.name.trim().toLowerCase();
  const eligiblePool = (Array.isArray(players) ? players : []).filter(
    p => p && typeof p.country === 'string' && p.country.trim().toLowerCase() === nationLower
  );

  if (eligiblePool.length < 15) {
    return {
      success: false,
      error: `Insufficient eligible players for ${targetNation.name}: ${eligiblePool.length}/15 available.`,
      nextState: unchanged
    };
  }

  if (!Array.isArray(selectedPlayerIds) || selectedPlayerIds.length !== 15) {
    return {
      success: false,
      error: `A national squad must contain exactly 15 players (selected: ${Array.isArray(selectedPlayerIds) ? selectedPlayerIds.length : 0}).`,
      nextState: unchanged
    };
  }

  const normalizedSelectedIds = selectedPlayerIds
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    .map(id => id.trim());

  if (normalizedSelectedIds.length !== 15) {
    return {
      success: false,
      error: 'All 15 selected player IDs must be valid non-empty strings.',
      nextState: unchanged
    };
  }

  const uniqueIds = new Set(normalizedSelectedIds);
  if (uniqueIds.size !== 15) {
    return {
      success: false,
      error: 'Duplicate players selected in national squad.',
      nextState: unchanged
    };
  }

  for (const pid of normalizedSelectedIds) {
    const p = players.find(pl => pl.id === pid);
    if (!p) {
      return {
        success: false,
        error: `Player ID ${pid} does not exist in player database.`,
        nextState: unchanged
      };
    }
    if (!p.country || p.country.trim().toLowerCase() !== nationLower) {
      return {
        success: false,
        error: `Player ${p.name} (${p.country}) does not represent ${targetNation.name}. Foreign players are strictly prohibited.`,
        nextState: unchanged
      };
    }
  }

  // Idempotency guard: if already in 'international_series' for this nation with the exact same 15 players
  // and a valid active seriesId, preserve existing state without resetting series progress or seriesId
  const sameSquadAlreadyConfirmed =
    careerPhase === 'international_series' &&
    coachProfile.nationalTeamId === targetNation.id &&
    nationalSquadIds.length === 15 &&
    nationalSquadIds.every((id, idx) => id === normalizedSelectedIds[idx]) &&
    internationalSeries.userNationId === targetNation.id &&
    Boolean(internationalSeries.seriesId);

  if (sameSquadAlreadyConfirmed) {
    return {
      success: true,
      alreadyConfirmed: true,
      nextState: unchanged
    };
  }

  const updatedNations = nations.map(n => ({
    ...n,
    isUserManaging: n.id === targetNation.id
  }));

  const existingSeriesIds = [
    ...(coachProfile.completedInternationalSeriesIds || []),
    ...(internationalSeries?.seriesId ? [internationalSeries.seriesId] : [])
  ];
  const tourCount = (coachProfile.completedInternationalSeriesIds?.length || 0) + 1;
  const updatedSeries =
    internationalSeries.userNationId === targetNation.id &&
    Boolean(internationalSeries.seriesId) &&
    internationalSeries.matches.length > 0 &&
    internationalSeries.matches.some(m => !m.completed)
      ? internationalSeries
      : buildInitialSeriesForNation(targetNation, updatedNations, undefined, tourCount, undefined, existingSeriesIds);

  return {
    success: true,
    alreadyConfirmed: false,
    nextState: {
      nations: updatedNations,
      coachProfile: enforceSingleCareerInvariant(
        {
          ...coachProfile,
          nationalTeamId: targetNation.id,
          clubTeamId: null as unknown as string,
          activeCareerMode: 'international'
        },
        'international',
        'international_series',
        undefined,
        updatedNations
      ).coachProfile,
      nationalSquadIds: [...normalizedSelectedIds],
      internationalSeries: updatedSeries,
      careerPhase: 'international_series'
    }
  };
}

/**
 * Authoritative pure state transition for completing an international series and advancing to the next international tour/series.
 * - Validates coached nation and next opponent before building a new series (never silently falls back to `nations[0]`)
 * - Uses `seriesId` as the authoritative idempotency key (migrating legacy saves safely if needed, or rejecting ambiguous legacy series)
 * - Ensures two different series between the same countries with identical results never share a completion key
 * - Never transitions into IPL franchise retention, auction, or franchise season reset.
 */
export function applyCompleteInternationalSeriesState(
  state: {
    nations: Nation[];
    coachProfile: CoachProfile;
    nationalSquadIds: string[];
    internationalSeries: InternationalSeriesState;
    careerPhase: CareerPhase;
  },
  options?: {
    nextOpponentId?: string;
    requireSquadReselection?: boolean;
  }
): {
  success: boolean;
  error?: string;
  alreadyCompleted?: boolean;
  internationalSeries: InternationalSeriesState;
  careerPhase: CareerPhase;
  coachProfile: CoachProfile;
} {
  const { nations, coachProfile, internationalSeries, careerPhase } = state;
  const unchanged = {
    internationalSeries,
    careerPhase,
    coachProfile
  };

  if (!internationalSeries || typeof internationalSeries !== 'object') {
    return {
      success: false,
      error: 'International series is missing or not a valid object.',
      ...unchanged
    };
  }

  if (!Array.isArray(nations) || nations.length < 2) {
    return {
      success: false,
      error: 'Insufficient national teams available to schedule an international series.',
      ...unchanged
    };
  }

  if (!coachProfile || typeof coachProfile !== 'object' || !coachProfile.nationalTeamId) {
    return {
      success: false,
      error: 'No active national team is assigned to the coach profile.',
      ...unchanged
    };
  }

  // Strictly validate the coached nation without silently assigning nations[0]
  const userNation = nations.find(
    n =>
      n &&
      (n.id === coachProfile.nationalTeamId ||
        n.name.trim().toLowerCase() === String(coachProfile.nationalTeamId).trim().toLowerCase())
  );

  if (!userNation) {
    return {
      success: false,
      error: `Coached nation "${coachProfile.nationalTeamId}" was not found in the national teams dataset.`,
      ...unchanged
    };
  }

  // Verify the active series belongs to the coached nation
  const seriesUserNationId = internationalSeries.userNationId ? String(internationalSeries.userNationId).trim() : '';
  const seriesUserNationName = internationalSeries.userNationName ? String(internationalSeries.userNationName).trim().toLowerCase() : '';
  const userNationNameLower = userNation.name.trim().toLowerCase();

  if (
    (!seriesUserNationId && !seriesUserNationName) ||
    (seriesUserNationId && seriesUserNationId !== userNation.id && seriesUserNationName !== userNationNameLower) ||
    (!seriesUserNationId && seriesUserNationName !== userNationNameLower)
  ) {
    return {
      success: false,
      error: `Active series nation (${internationalSeries.userNationName || internationalSeries.userNationId || 'unknown'}) does not match coached nation (${userNation.name}).`,
      ...unchanged
    };
  }

  const otherNations = nations.filter(
    n => n && n.id !== userNation.id && n.name.trim().toLowerCase() !== userNation.name.trim().toLowerCase()
  );
  if (otherNations.length === 0) {
    return {
      success: false,
      error: `No eligible opponent nations available for ${userNation.name}.`,
      ...unchanged
    };
  }

  // If caller explicitly specified a nextOpponentId, validate it strictly
  let explicitNextOpp: Nation | undefined;
  if (options?.nextOpponentId !== undefined) {
    const requestedOpp = options.nextOpponentId.trim();
    explicitNextOpp = otherNations.find(
      n => n.id === requestedOpp || n.name.trim().toLowerCase() === requestedOpp.toLowerCase()
    );
    if (!explicitNextOpp) {
      return {
        success: false,
        error: `Next opponent "${options.nextOpponentId}" is invalid or ineligible against ${userNation.name}.`,
        ...unchanged
      };
    }
  }

  // Resolve or migrate authoritative seriesId before checking completion
  const completedSeriesIds = Array.isArray(coachProfile.completedInternationalSeriesIds)
    ? coachProfile.completedInternationalSeriesIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];
  let authoritativeSeries: InternationalSeriesState = internationalSeries;
  const rawSeriesId = typeof internationalSeries.seriesId === 'string' ? internationalSeries.seriesId.trim() : '';

  if (!rawSeriesId) {
    const migration = migrateLegacyInternationalSeries(internationalSeries, nations, completedSeriesIds);
    if (!migration.canMigrate || !migration.series) {
      return {
        success: false,
        error: migration.error || 'Legacy international series lacks a valid seriesId and cannot be identified safely.',
        ...unchanged
      };
    }
    authoritativeSeries = migration.series;
  }

  const seriesCompletionKey = authoritativeSeries.seriesId ? authoritativeSeries.seriesId.trim() : '';
  if (!seriesCompletionKey) {
    return {
      success: false,
      error: 'International series has an invalid or empty series ID.',
      ...unchanged
    };
  }

  // Check authoritative seriesId idempotency guard
  if (completedSeriesIds.includes(seriesCompletionKey)) {
    return {
      success: false,
      alreadyCompleted: true,
      error: `International series "${seriesCompletionKey}" has already been completed.`,
      ...unchanged
    };
  }

  // Require the current series to have completed fixtures before completing and awarding titles
  const matches = Array.isArray(authoritativeSeries.matches) ? authoritativeSeries.matches : [];
  const allMatchesCompleted = matches.length > 0 && matches.every(m => Boolean(m && m.completed === true));
  if (!allMatchesCompleted) {
    return {
      success: false,
      error: 'Cannot complete international series before all scheduled fixtures are completed.',
      ...unchanged
    };
  }

  const currentOppIdx = otherNations.findIndex(
    n =>
      n.id === authoritativeSeries.opponentNationId ||
      n.name.trim().toLowerCase() === (authoritativeSeries.opponentNationName || '').trim().toLowerCase()
  );
  const nextOpp =
    explicitNextOpp ||
    otherNations[(currentOppIdx >= 0 ? currentOppIdx + 1 : 0) % otherNations.length];

  if (!nextOpp) {
    return {
      success: false,
      error: 'Could not resolve a valid next opponent nation.',
      internationalSeries: authoritativeSeries,
      careerPhase,
      coachProfile
    };
  }

  const wonSeries = authoritativeSeries.seriesWins > authoritativeSeries.seriesLosses;
  const updatedCompletedIds = [...completedSeriesIds, seriesCompletionKey];
  const nextTourNumber = updatedCompletedIds.length + 1;
  const nextSeries = buildInitialSeriesForNation(
    userNation,
    nations,
    nextOpp.id,
    nextTourNumber,
    undefined,
    updatedCompletedIds
  );
  const nextPhase: CareerPhase = options?.requireSquadReselection
    ? 'international_squad_selection'
    : 'international_series';

  return {
    success: true,
    alreadyCompleted: false,
    internationalSeries: nextSeries,
    careerPhase: nextPhase,
    coachProfile: enforceSingleCareerInvariant(
      {
        ...coachProfile,
        nationalTeamId: userNation.id,
        clubTeamId: null as unknown as string,
        activeCareerMode: 'international',
        internationalTitles: (coachProfile.internationalTitles || 0) + (wonSeries ? 1 : 0),
        completedInternationalSeriesIds: updatedCompletedIds
      },
      'international',
      nextPhase,
      undefined,
      nations
    ).coachProfile
  };
}

/**
 * Authoritative pure state transition for Franchise Retention & Player Releases into the Auction Pool.
 * Idempotent: computes the salary refund strictly from players currently registered to `teamId`
 * and transitions `careerPhase` from `retention` to `auction` once. Calling it a second time
 * cannot double-refund purse or mutate players/teams again.
 */
export function applyReleasePlayersForAuctionState(
  state: {
    teams: Team[];
    players: Player[];
    careerPhase: CareerPhase;
  },
  teamId: string,
  releasedPlayerIds: string[]
): {
  alreadyReleased: boolean;
  refundedCr: number;
  teams: Team[];
  players: Player[];
  careerPhase: CareerPhase;
} {
  const { teams, players, careerPhase } = state;
  if (
    careerPhase === 'international_squad_selection' ||
    careerPhase === 'international_series'
  ) {
    return {
      alreadyReleased: true,
      refundedCr: 0,
      teams,
      players,
      careerPhase
    };
  }

  const targetTeam = teams.find(t => t.id === teamId);
  if (!targetTeam) {
    return {
      alreadyReleased: true,
      refundedCr: 0,
      teams,
      players,
      careerPhase
    };
  }

  const uniqueReleaseIds = Array.from(
    new Set(
      (Array.isArray(releasedPlayerIds) ? releasedPlayerIds : []).filter(
        (id): id is string => typeof id === 'string' && id.trim().length > 0
      )
    )
  );
  const releaseSet = new Set(uniqueReleaseIds);

  // Determine which requested players are ACTUALLY still owned by `teamId`
  const teamSquadIds = new Set((targetTeam.squad || []).map(p => p.id));
  const actuallyOwnedReleasedPlayers = players.filter(
    p => releaseSet.has(p.id) && (p.clubId === teamId || teamSquadIds.has(p.id))
  );

  // If no players are being newly released AND we have already moved past 'retention', this is a duplicate call
  if (actuallyOwnedReleasedPlayers.length === 0 && careerPhase !== 'retention') {
    return {
      alreadyReleased: true,
      refundedCr: 0,
      teams,
      players,
      careerPhase
    };
  }

  const actualReleaseSet = new Set(actuallyOwnedReleasedPlayers.map(p => p.id));
  const refundedCr = Number(
    actuallyOwnedReleasedPlayers
      .reduce((sum, p) => sum + (p.salaryCr || p.basePriceCr || 0), 0)
      .toFixed(2)
  );

  const updatedPlayers =
    actualReleaseSet.size > 0
      ? players.map(p =>
          actualReleaseSet.has(p.id) ? { ...p, clubId: '', isCaptain: false } : p
        )
      : players;

  const updatedTeams =
    actualReleaseSet.size > 0
      ? teams.map(t => {
          if (t.id !== teamId) return t;
          const remainingSquad = t.squad.filter(p => !actualReleaseSet.has(p.id));
          const keptXI = t.playingXIIds.filter(id => !actualReleaseSet.has(id));
          const fillIds = remainingSquad.map(p => p.id).filter(id => !keptXI.includes(id));
          const nextXI = [...keptXI, ...fillIds].slice(0, 11);
          return {
            ...t,
            purseCr: Number((t.purseCr + refundedCr).toFixed(2)),
            squad: remainingSquad,
            playingXIIds: nextXI
          };
        })
      : teams;

  return {
    alreadyReleased: false,
    refundedCr,
    teams: updatedTeams,
    players: updatedPlayers,
    careerPhase: careerPhase === 'retention' ? 'auction' : careerPhase
  };
}

/**
 * Authoritative pure state transition for completing the Franchise Mini-Auction and moving to Squad Confirmation.
 * Idempotent: only transitions from `auction` to `squad_confirmation` once.
 */
export function applyCompleteAuctionState(state: {
  careerPhase: CareerPhase;
  auctionLot: AuctionLot | null;
}): {
  alreadyCompleted: boolean;
  careerPhase: CareerPhase;
  auctionLot: AuctionLot | null;
} {
  if (state.careerPhase !== 'auction') {
    return {
      alreadyCompleted: true,
      careerPhase: state.careerPhase,
      auctionLot: state.auctionLot
    };
  }
  return {
    alreadyCompleted: false,
    careerPhase: 'squad_confirmation',
    auctionLot: null
  };
}

/**
 * Authoritative pure state transition for Franchise Club Squad Confirmation.
 * Enforces IPL squad size (16-25), overseas limit (<= 8), unique IDs, and club eligibility.
 * Rejects invocations when the career is in an international-only phase.
 */
export function applyConfirmClubSquadState(
  state: {
    teams: Team[];
    players: Player[];
    careerPhase: CareerPhase;
  },
  teamId: string,
  squadPlayerIds: string[]
): {
  success: boolean;
  error?: string;
  alreadyConfirmed?: boolean;
  nextState: {
    teams: Team[];
    players: Player[];
    careerPhase: CareerPhase;
  };
} {
  const { teams, players, careerPhase } = state;
  const unchanged = { teams, players, careerPhase };

  if (careerPhase === 'international_squad_selection' || careerPhase === 'international_series') {
    return {
      success: false,
      error: 'Franchise squad confirmation cannot be used during an international career phase.',
      nextState: unchanged
    };
  }

  const targetTeam = teams.find(t => t.id === teamId);
  if (!targetTeam) {
    return { success: false, error: `Team ${teamId} not found.`, nextState: unchanged };
  }

  if (!Array.isArray(squadPlayerIds)) {
    return { success: false, error: 'Invalid squad player IDs.', nextState: unchanged };
  }

  const uniqueIds = new Set(squadPlayerIds);
  if (uniqueIds.size !== squadPlayerIds.length) {
    return {
      success: false,
      error: 'Duplicate player IDs are not allowed in a franchise squad.',
      nextState: unchanged
    };
  }

  const squadPlayers: Player[] = [];
  for (const id of squadPlayerIds) {
    const p = players.find(pl => pl.id === id);
    if (!p) {
      return {
        success: false,
        error: `Player ID ${id} does not exist in player database.`,
        nextState: unchanged
      };
    }
    if (p.clubId && p.clubId !== teamId) {
      return {
        success: false,
        error: `Player ${p.name} belongs to another franchise (${p.clubId}) and is ineligible for ${targetTeam.shortName}.`,
        nextState: unchanged
      };
    }
    squadPlayers.push({ ...p, clubId: teamId });
  }

  if (squadPlayers.length < 16 || squadPlayers.length > 25) {
    return {
      success: false,
      error: `Squad size (${squadPlayers.length}) must be between 16 and 25 players.`,
      nextState: unchanged
    };
  }

  const overseas = squadPlayers.filter(
    p => p.isOverseas || (p.country && p.country.toLowerCase() !== 'india')
  ).length;
  if (overseas > 8) {
    return {
      success: false,
      error: `Overseas players (${overseas}) exceeds maximum IPL limit of 8.`,
      nextState: unchanged
    };
  }

  if (
    careerPhase === 'off_season_rest' &&
    targetTeam.squad.length === squadPlayerIds.length &&
    targetTeam.squad.every((sp, idx) => sp.id === squadPlayerIds[idx])
  ) {
    return {
      success: true,
      alreadyConfirmed: true,
      nextState: unchanged
    };
  }

  const confirmedSet = new Set(squadPlayerIds);
  const keptXI = (targetTeam.playingXIIds || []).filter(id => confirmedSet.has(id));
  const fillXI = squadPlayerIds.filter(id => !keptXI.includes(id));
  const nextPlayingXIIds = [...keptXI, ...fillXI].slice(0, 11);

  const updatedPlayers = players.map(p =>
    confirmedSet.has(p.id) ? { ...p, clubId: teamId } : p
  );

  const updatedTeams = teams.map(t => {
    if (t.id !== teamId) return t;
    return {
      ...t,
      squad: squadPlayers,
      playingXIIds: nextPlayingXIIds
    };
  });

  return {
    success: true,
    alreadyConfirmed: false,
    nextState: {
      teams: updatedTeams,
      players: updatedPlayers,
      careerPhase: 'off_season_rest'
    }
  };
}

/**
 * Authoritative pure state transition for starting the next IPL franchise season.
 * Idempotent: if the active league was already initialized or if called during an international phase,
 * it returns the existing state without aging players or resetting a second time.
 * Never overwrites international career state.
 */
export function applyStartNewFranchiseSeasonState(
  state: {
    players: Player[];
    teams: Team[];
    leagues: League[];
    currentLeagueId: string;
    coachProfile: CoachProfile;
    nations: Nation[];
    tournamentHonors: TournamentHonor[];
    careerPhase: CareerPhase;
    careerBoardReview: CareerBoardReview | null;
  },
  selectedClubId?: string,
  selectedNationId?: string | null,
  nextYear?: number
): {
  players: Player[];
  teams: Team[];
  leagues: League[];
  coachProfile: CoachProfile;
  nations: Nation[];
  tournamentHonors: TournamentHonor[];
  careerPhase: CareerPhase;
  careerBoardReview: CareerBoardReview | null;
  squadStamina: number;
  alreadyInitialized: boolean;
} {
  const {
    players,
    teams,
    leagues,
    currentLeagueId,
    coachProfile,
    nations,
    tournamentHonors,
    careerPhase,
    careerBoardReview
  } = state;

  // Never allow franchise season reset during an international career phase
  if (
    careerPhase === 'international_squad_selection' ||
    careerPhase === 'international_series'
  ) {
    return {
      players,
      teams,
      leagues,
      coachProfile,
      nations,
      tournamentHonors,
      careerPhase,
      careerBoardReview,
      squadStamina: 99,
      alreadyInitialized: true
    };
  }

  const activeLeague = leagues.find(l => l.id === currentLeagueId) || leagues[0];
  const targetLeagueId = activeLeague?.id || currentLeagueId || 'pt20';
  const outgoingYearStr = normalizeSeasonYear(activeLeague?.seasonName || activeLeague?.seasonYear);
  const outgoingYearNum = parseInt(outgoingYearStr, 10) || 2026;
  const userTeam = teams.find(t => t.id === coachProfile.clubTeamId) || teams[0];
  const targetClubId = selectedClubId || userTeam.id;
  const targetClubObj = teams.find(t => t.id === targetClubId) || userTeam;

  const standingsAllZero = Boolean(
    activeLeague?.standings &&
      activeLeague.standings.length > 0 &&
      activeLeague.standings.every(s => s.played === 0)
  );
  const hasPreviousArchivedSeason = Boolean(
    (activeLeague?.teamSeasonHistory?.[targetClubId]?.length || 0) > 0 ||
      outgoingYearNum > 2026
  );

  // Idempotency guard:
  // 1) If explicit `nextYear` is already reached (or exceeded), OR
  // 2) If `nextYear` was omitted and the active league is already in `league_stage` at 0 matches played after a season reset
  if (
    (nextYear !== undefined && outgoingYearNum >= nextYear && careerPhase === 'league_stage' && standingsAllZero) ||
    (nextYear === undefined && careerPhase === 'league_stage' && standingsAllZero && hasPreviousArchivedSeason)
  ) {
    return {
      players,
      teams,
      leagues,
      coachProfile,
      nations,
      tournamentHonors,
      careerPhase: 'league_stage',
      careerBoardReview: null,
      squadStamina: 99,
      alreadyInitialized: true
    };
  }

  const resolvedNextYear = nextYear && nextYear > outgoingYearNum ? nextYear : outgoingYearNum + 1;

  // 1. Archive outgoing season honor
  let nextHonors = sanitizeTournamentHonors(tournamentHonors);
  if (activeLeague) {
    const sortedStandings = [...(activeLeague.standings || [])].sort((a, b) => b.points - a.points || b.nrr - a.nrr);
    const playoffs = activeLeague.playoffs;
    const finalCompleted = Boolean(playoffs?.final?.completed);
    const champId = finalCompleted
      ? (playoffs?.championTeamId || playoffs?.final?.winnerTeamId || sortedStandings[0]?.teamId)
      : sortedStandings[0]?.teamId;

    if (champId && sortedStandings.some(s => s.played > 0)) {
      const champTeamObj = teams.find(t => t.id === champId);
      if (
        champTeamObj &&
        !nextHonors.some(h => normalizeSeasonYear(h.year) === outgoingYearStr && h.tournamentName === activeLeague.name)
      ) {
        nextHonors = [
          {
            year: outgoingYearStr,
            tournamentName: activeLeague.name || 'Indian Premier League',
            championTeamId: champTeamObj.id,
            championTeamName: champTeamObj.name,
            championLogo: champTeamObj.logoEmoji || '🏆'
          },
          ...nextHonors
        ];
      }
    }
  }

  // 2. Age and progress players once
  const progressedPlayers = players.map(p => {
    const nextAge = p.age + 1;
    const isYoung = p.age <= 24;
    const isVeteran = p.age >= 34;
    const batDelta = isYoung ? 2 : isVeteran ? -1 : 1;
    const bowlDelta = isYoung ? 2 : isVeteran ? -1 : 1;
    const fitDelta = isVeteran ? -2 : 1;
    return {
      ...p,
      age: nextAge,
      fitness: 98,
      isInjured: false,
      injuryDays: 0,
      ratings: {
        ...p.ratings,
        bat: Math.max(40, Math.min(99, p.ratings.bat + batDelta)),
        pow: Math.max(40, Math.min(99, p.ratings.pow + batDelta)),
        bowl: Math.max(40, Math.min(99, p.ratings.bowl + bowlDelta)),
        ctrl: Math.max(40, Math.min(99, p.ratings.ctrl + (isVeteran ? 1 : bowlDelta))),
        tmp: Math.max(45, Math.min(99, p.ratings.tmp + 1)),
        fit: Math.max(65, Math.min(99, (p.ratings.fit || 85) + fitDelta))
      }
    };
  });

  // 3. Sync teams with progressed players
  const updatedTeams = teams.map(t => ({
    ...t,
    isUserTeam: t.id === targetClubId,
    squad: t.squad.map(sp => progressedPlayers.find(pp => pp.id === sp.id) || sp)
  }));

  // 4. Archive board review if present and update CoachProfile
  let updatedBoardHistory = [...(coachProfile.boardReviewsHistory || [])];
  if (careerBoardReview) {
    const exists = updatedBoardHistory.some(
      r =>
        r.seasonYear === careerBoardReview.seasonYear &&
        r.teamId === careerBoardReview.teamId &&
        (r.competitionId || 'pt20') === (careerBoardReview.competitionId || 'pt20')
    );
    if (!exists) {
      updatedBoardHistory = [careerBoardReview, ...updatedBoardHistory];
    }
  }

  const prevStints = coachProfile.clubStints && coachProfile.clubStints.length > 0
    ? coachProfile.clubStints
    : [
        {
          id: `stint_${coachProfile.clubTeamId}_${outgoingYearNum}`,
          teamId: coachProfile.clubTeamId,
          teamName: userTeam.city || userTeam.name,
          period: `${outgoingYearNum}–present`,
          seasons: coachProfile.domesticStats?.seasons || 1,
          matches: coachProfile.domesticStats?.matches || 0,
          wins: coachProfile.domesticStats?.wins || 0,
          losses: coachProfile.domesticStats?.losses || 0,
          winPct: coachProfile.domesticStats?.winPct || 0,
          titles: coachProfile.domesticStats?.titles || 0
        }
      ];

  let updatedStints = [...prevStints];
  if (targetClubId === coachProfile.clubTeamId) {
    updatedStints = updatedStints.map((s, idx) =>
      idx === updatedStints.length - 1 ? { ...s, seasons: s.seasons + 1 } : s
    );
  } else {
    updatedStints = [
      ...updatedStints.map((s, idx) =>
        idx === updatedStints.length - 1
          ? { ...s, period: s.period.replace('–present', `–${outgoingYearNum}`) }
          : s
      ),
      {
        id: `stint_${targetClubId}_${resolvedNextYear}`,
        teamId: targetClubId,
        teamName: targetClubObj.city || targetClubObj.name,
        period: `${resolvedNextYear}–present`,
        seasons: 1,
        matches: 0,
        wins: 0,
        losses: 0,
        winPct: 0,
        titles: 0
      }
    ];
  }

  const updatedCoachProfile: CoachProfile = enforceSingleCareerInvariant(
    {
      ...coachProfile,
      clubTeamId: targetClubId,
      nationalTeamId: null,
      activeCareerMode: 'franchise',
      domesticStats: {
        ...coachProfile.domesticStats,
        seasons: (coachProfile.domesticStats?.seasons || 1) + 1
      },
      clubStints: updatedStints,
      boardReviewsHistory: updatedBoardHistory
    },
    'franchise',
    'league_stage',
    updatedTeams,
    nations
  ).coachProfile;

  const updatedNations = nations.map(n => ({
    ...n,
    isUserManaging: false
  }));

  // 5. Archive completed season records and build new season schedule starting at Match 1 (currentDateIndex: 0)
  const updatedLeagues = leagues.map(l => {
    if (l.id === targetLeagueId) {
      const sortedStandings = [...(l.standings || [])].sort((a, b) => b.points - a.points || b.nrr - a.nrr);
      const existingHistory: Record<string, TeamSeasonRecord[]> = { ...(l.teamSeasonHistory || {}) };
      const pf = l.playoffs;
      const pfDone = Boolean(pf?.final?.completed);
      const champTeamId = pfDone ? (pf?.championTeamId || pf?.final?.winnerTeamId) : null;

      sortedStandings.forEach((stRow, idx) => {
        const teamId = stRow.teamId;
        let finalRank = idx + 1;
        const wonTitle = Boolean(champTeamId && champTeamId === teamId);
        if (pfDone && pf) {
          if (wonTitle) finalRank = 1;
          else if (pf.final?.loserTeamId === teamId) finalRank = 2;
          else if (pf.q2?.completed && pf.q2.loserTeamId === teamId) finalRank = 3;
          else if (pf.eliminator?.completed && pf.eliminator.loserTeamId === teamId) finalRank = 4;
        }

        const teamPlayers = players.filter(p => p.clubId === teamId);
        const isFirstSeason = (existingHistory[teamId] || []).length === 0;
        const getSeasonPlayerStats = (p: Player) => {
          const sMap = p.competitionStats?.iplSeasons || {};
          return (
            sMap[outgoingYearStr] ||
            sMap[`Season ${outgoingYearStr}`] ||
            (outgoingYearStr === '2026' ? sMap['Season 2025/26'] : undefined) ||
            (isFirstSeason ? p.stats : undefined)
          );
        };

        const battersSorted = [...teamPlayers]
          .map(p => ({ name: p.name, runs: getSeasonPlayerStats(p)?.runs || 0 }))
          .filter(x => x.runs > 0)
          .sort((a, b) => b.runs - a.runs);
        const bowlersSorted = [...teamPlayers]
          .map(p => ({ name: p.name, wickets: getSeasonPlayerStats(p)?.wickets || 0 }))
          .filter(x => x.wickets > 0)
          .sort((a, b) => b.wickets - a.wickets);

        const record: TeamSeasonRecord = {
          seasonYear: outgoingYearStr,
          leagueName: l.name || 'Indian Premier League',
          country: l.country || 'India',
          rank: finalRank,
          wonTitle,
          played: stRow.played,
          won: stRow.won,
          lost: stRow.lost,
          tied: stRow.tied || 0,
          nrr: stRow.nrr,
          mostRunsPlayerName: battersSorted[0]?.name,
          mostRunsValue: battersSorted[0]?.runs,
          mostWicketsPlayerName: bowlersSorted[0]?.name,
          mostWicketsValue: bowlersSorted[0]?.wickets
        };

        const prevTeamRecords = (existingHistory[teamId] || []).filter(r => r.seasonYear !== outgoingYearStr);
        existingHistory[teamId] = [record, ...prevTeamRecords];
      });

      const freshStandings = l.standings.map(st => ({
        ...st,
        played: 0,
        won: 0,
        lost: 0,
        tied: 0,
        points: 0,
        nrr: 0,
        recentForm: [] as ('W' | 'L' | 'T')[]
      }));
      return {
        ...l,
        seasonName: String(resolvedNextYear),
        seasonYear: resolvedNextYear,
        teamSeasonHistory: existingHistory,
        standings: freshStandings,
        playoffs: createInitialPlayoffs(freshStandings),
        currentDateIndex: 0,
        calendarDates: buildSeasonCalendarForTeam(targetClubId, updatedTeams, false, resolvedNextYear)
      };
    }
    return l;
  });

  return {
    players: progressedPlayers,
    teams: updatedTeams,
    leagues: updatedLeagues,
    coachProfile: updatedCoachProfile,
    nations: updatedNations,
    tournamentHonors: nextHonors,
    careerPhase: 'league_stage',
    careerBoardReview: null,
    squadStamina: 99,
    alreadyInitialized: false
  };
}

/**
 * Authoritative pure state transition for advancing the Franchise Off-Season Calendar.
 * - Processes remaining off-season rest/training calendar days and applies daily fitness recovery & injury healing
 * - Transitions through 'next_season_ready' into the next franchise season idempotently once
 * - Never triggers an IPL season reset if the active phase is an international-only workflow or already in league_stage
 */
export function applyAdvanceOffSeasonState(
  state: {
    players: Player[];
    teams: Team[];
    leagues: League[];
    currentLeagueId: string;
    coachProfile: CoachProfile;
    nations: Nation[];
    tournamentHonors: TournamentHonor[];
    careerPhase: CareerPhase;
    careerBoardReview: CareerBoardReview | null;
    squadStamina: number;
  },
  targetNextYear?: number
): {
  players: Player[];
  teams: Team[];
  leagues: League[];
  coachProfile: CoachProfile;
  nations: Nation[];
  tournamentHonors: TournamentHonor[];
  careerPhase: CareerPhase;
  careerBoardReview: CareerBoardReview | null;
  squadStamina: number;
  restDaysProcessed: number;
  intermediatePhase: CareerPhase;
} {
  if (
    state.careerPhase !== 'off_season_rest' &&
    state.careerPhase !== 'next_season_ready'
  ) {
    return {
      ...state,
      restDaysProcessed: 0,
      intermediatePhase: state.careerPhase
    };
  }

  const safeLeagues = Array.isArray(state.leagues) ? state.leagues : [];
  const activeLeague = safeLeagues.find(l => l && l.id === state.currentLeagueId) || safeLeagues[0];
  const remainingCalendarDays = activeLeague && Array.isArray(activeLeague.calendarDates)
    ? Math.max(7, activeLeague.calendarDates.length - (activeLeague.currentDateIndex || 0))
    : 7;

  // Process daily off-season recovery across remaining rest/training days
  const safePlayers = Array.isArray(state.players) ? state.players : [];
  const safeTeams = Array.isArray(state.teams) ? state.teams : [];
  let recoveredPlayers = safePlayers.map(p => ({ ...p }));
  for (let day = 0; day < remainingCalendarDays; day++) {
    recoveredPlayers = recoveredPlayers.map(p => {
      const nextInjuryDays = Math.max(0, (p.injuryDays || 0) - 1);
      return {
        ...p,
        fitness: Math.min(100, (p.fitness || 85) + 4),
        injuryDays: nextInjuryDays,
        isInjured: nextInjuryDays > 0
      };
    });
  }

  const recoveredTeams = safeTeams.map(t => ({
    ...t,
    squad: Array.isArray(t.squad)
      ? t.squad.map(sp => recoveredPlayers.find(rp => rp.id === sp.id) || sp)
      : []
  }));

  const nextSeasonRes = applyStartNewFranchiseSeasonState(
    {
      ...state,
      players: recoveredPlayers,
      teams: recoveredTeams,
      careerPhase: 'next_season_ready'
    },
    state.coachProfile.clubTeamId || '',
    undefined,
    targetNextYear
  );

  return {
    players: nextSeasonRes.players,
    teams: nextSeasonRes.teams,
    leagues: nextSeasonRes.leagues,
    coachProfile: nextSeasonRes.coachProfile,
    nations: nextSeasonRes.nations,
    tournamentHonors: nextSeasonRes.tournamentHonors,
    careerPhase: nextSeasonRes.careerPhase,
    careerBoardReview: nextSeasonRes.careerBoardReview,
    squadStamina: 100,
    restDaysProcessed: nextSeasonRes.alreadyInitialized ? 0 : remainingCalendarDays,
    intermediatePhase: 'next_season_ready'
  };
}

export interface GameSettings {
  coachTips: boolean;
  tacticsAuto: 'key_moments' | 'every_over' | 'never';
  matchAnimations: 'full' | 'quick' | 'classic';
}

export interface SaveSlotMeta {
  slotNumber: 1 | 2 | 3;
  hasSave: boolean;
  teamName: string;
  teamShortName: string;
  logoEmoji: string;
  seasonName: string;
  savedAt: string;
}

interface GameContextType {
  activeTab: MainTab;
  setActiveTab: (tab: MainTab) => void;
  careerPhase: CareerPhase;
  setCareerPhase: (phase: CareerPhase) => void;
  careerBoardReview: CareerBoardReview | null;
  setCareerBoardReview: (review: CareerBoardReview | null) => void;
  players: Player[];
  setPlayers: React.Dispatch<React.SetStateAction<Player[]>>;
  updatePlayer: (updated: Player) => void;
  teams: Team[];
  setTeams: React.Dispatch<React.SetStateAction<Team[]>>;
  userTeam: Team;
  selectUserTeam: (teamId: string) => void;
  startNewCareer: (teamId: string, coachOverrides?: Partial<CoachProfile>, targetSlot?: 1 | 2 | 3) => void;
  activeSaveSlot: 1 | 2 | 3;
  setActiveSaveSlot: (slot: 1 | 2 | 3) => void;
  updateUserTeamXI: (newXIIds: string[]) => void;
  setTeamCaptain: (playerId: string) => void;
  leagues: League[];
  currentLeagueId: string;
  setCurrentLeagueId: (id: string) => void;
  nations: Nation[];
  nationalSquadIds: string[];
  setNationalSquadIds: (ids: string[]) => void;
  internationalSeries: InternationalSeriesState;
  coachProfile: CoachProfile;
  updateCoachProfile: (updater: Partial<CoachProfile>) => void;
  achievements: Achievement[];
  unlockAchievement: (id: string) => void;
  jobOffers: JobOffer[];
  acceptJobOffer: (offer: JobOffer) => void;
  resignNationalJob: () => void;
  applyCareerJobDecision: (selectedClubId: string, selectedCountryId?: string | null) => void;
  confirmNationalSquad: (nationIdOrName: string, selectedPlayerIds: string[]) => { success: boolean; error?: string };
  completeInternationalSeries: (options?: { nextOpponentId?: string; requireSquadReselection?: boolean }) => { success: boolean; error?: string; alreadyCompleted?: boolean };
  advanceOffSeasonToNextSeason: (targetNextYear?: number) => void;
  advanceCalendarToNextTour: () => { success: boolean; message: string };
  switchUserClub: (newClubId: string) => void;
  validateClubSquad: (teamId?: string) => { isValid: boolean; errors: string[] };
  confirmClubSquad: (teamId: string, squadPlayerIds: string[]) => { success: boolean; error?: string };
  advanceCalendarDay: () => boolean;
  setCalendarDateIndex: (idx: number) => void;
  // Phase 13 Settings & Multi-Slot Save Manager
  settings: GameSettings;
  updateSettings: (partial: Partial<GameSettings>) => void;
  saveSlots: SaveSlotMeta[];
  saveToSlot: (slotNumber: 1 | 2 | 3) => void;
  loadFromSlot: (slotNumber: 1 | 2 | 3) => boolean;
  deleteSlot: (slotNumber: 1 | 2 | 3) => void;
  simSingleIntlMatch: (homeNationName: string, awayNationName: string, format: 'T20' | 'ODI' | 'TEST') => string;
  // Phase 11 Hub, Pitch, Sim Tokens, History & Inbox
  homePitch: string;
  setHomePitch: (pitch: string) => void;
  simTokens: number;
  setSimTokens: React.Dispatch<React.SetStateAction<number>>;
  squadStamina: number;
  setSquadStamina: React.Dispatch<React.SetStateAction<number>>;
  completedMatchesHistory: CompletedMatchRecord[];
  inboxMessages: InboxMessage[];
  replyToInboxMessage: (messageId: string, replyOption: 'promise_game_time' | 'demand_nets' | 'back_current_xi') => void;
  // Match Engine
  matchLiveState: MatchLiveState | null;
  startMatch: (opponentTeamId?: string, format?: 'T20' | 'ODI' | 'TEST', isAwayMatch?: boolean, fixtureId?: string) => void;
  createFranchiseMatchState: (homeTeamObj: Team, awayTeamObj: Team, leagueId: string, format: 'T20' | 'ODI' | 'TEST', playoffStage?: 'q1' | 'eliminator' | 'q2' | 'final', fixtureId?: string) => MatchLiveState;
  startInternationalMatch: (homeCountry?: string, awayCountry?: string, venue?: string, format?: 'T20' | 'ODI' | 'TEST', fixtureId?: string, competitionId?: string) => void;
  playPlayoffMatch: (leagueId: string, stage: 'q1' | 'eliminator' | 'q2' | 'final') => { success: boolean; reason?: string };
  simPlayoffMatch: (leagueId: string, stage: 'q1' | 'eliminator' | 'q2' | 'final', isUserAction?: boolean) => { success: boolean; reason?: string };
  resetPlayoffBracket: (leagueId: string) => void;
  pendingRetentionModal: boolean;
  setPendingRetentionModal: React.Dispatch<React.SetStateAction<boolean>>;
  finishMatch: () => void;
  runBallSimulation: () => void;
  simCurrentOver: (oversCount?: number) => void;
  simEntireMatch: () => void;
  updateBowlingTactics: (tactics: Partial<MatchLiveState['bowlingTactics']>) => void;
  updateBattingTactics: (tactics: Partial<MatchLiveState['battingTactics']>) => void;
  updateFielders: (fielders: FielderPosition[]) => void;
  activateImpactPlayer: (benchPlayerId: string, outPlayerId: string) => void;
  startSecondInnings: () => void;
  selectNewBowler: (bowlerId: string) => void;
  selectNextBatter: (batterId: string) => void;
  selectOpeners: (strikerId: string, nonStrikerId: string) => void;
  setTossDecision: (decision: 'bat' | 'bowl') => void;
  // Feature 6.1, 6.2, 6.6 Match Engine Extensions
  triggerDrsReview: () => void;
  resolveDrsReview: (finalVerdict: 'OUT' | 'NOT OUT', reviewRetained: boolean) => void;
  triggerRainDLSInterruption: () => void;
  activatePowerSurge: () => void;
  declareInnings: () => void;
  // Training & Morale
  trainSquad: (drillType: string, intensity?: string) => { success: boolean; message: string; xpGains: TrainingTraineeGain[] };
  claimDoubleTrainingXp: (drillType: string, topPlayerIds: string[]) => void;
  boostTeamMorale: (teamId: string, delta?: number) => void;
  // Dynasty & Roster Persistence
  releasePlayersForAuction: (teamId: string, releasedPlayerIds: string[], updatedPurseCr: number) => void;
  startNewSeason: (selectedClubId?: string, selectedNationId?: string | null, nextYear?: number) => void;
  // Auction
  auctionLot: AuctionLot | null;
  startAuctionSession: () => void;
  placeUserBid: () => void;
  skipAuctionLot: () => void;
  useRtmCard: () => void;
  nextAuctionLot: () => void;
  isAiBidding: boolean;
  aiBiddingSpeed: 'instant' | 'fast' | 'normal';
  setAiBiddingSpeed: (speed: 'instant' | 'fast' | 'normal') => void;
  // Auction Sandbox
  auctionSandbox: AuctionSandboxSessionState | null;
  startAuctionSandbox: (params: {
    franchiseId: string;
    mode: AuctionSandboxMode;
    userRetainedPlayerIds: string[];
  }) => void;
  exitAuctionSandbox: () => void;
  commitSandboxAuctionSale: (lot: AuctionPlayerItem, buyerShort: string, priceCr: number) => void;
  tournamentHonors: TournamentHonor[];
}

const GameContext = createContext<GameContextType | undefined>(undefined);

function applyMatchToPlayerList(playerList: Player[], finishedMatch: MatchLiveState, seasonKey: string = 'Season 2026'): Player[] {
  return playerList.map(p => recordMatchToPlayerStats(p, finishedMatch, seasonKey));
}

function simulateAiFixtureScorecard(
  fixtureId: string,
  homeTeamObj: Team,
  awayTeamObj: Team,
  venue: string,
  format: 'T20' | 'ODI' | 'TEST',
  leagueId: string,
  allPlayers: Player[],
  seed: number = 1
): {
  matchState: MatchLiveState;
  summary: string;
  winnerId: string;
  loserId: string;
  nrrDelta: number;
} {
  const resolveTeamXI = (team: Team): Player[] => {
    if (team.playingXIIds && team.playingXIIds.length >= 11) {
      const xi = team.playingXIIds.map(id => allPlayers.find(p => p.id === id)).filter((p): p is Player => Boolean(p));
      if (xi.length >= 11) return xi.slice(0, 11);
    }
    const clubPool = allPlayers.filter(p => p.clubId === team.id);
    if (clubPool.length >= 11) return clubPool.slice(0, 11);
    const countryPool = allPlayers.filter(p => p.country.toLowerCase() === team.name.toLowerCase());
    if (countryPool.length >= 11) return countryPool.slice(0, 11);
    if (team.squad && team.squad.length >= 11) return team.squad.slice(0, 11);
    return [...countryPool, ...clubPool, ...allPlayers].slice(0, 11);
  };

  const homeXI = resolveTeamXI(homeTeamObj);
  const awayXI = resolveTeamXI(awayTeamObj);

  const hydratedHome: Team = {
    ...homeTeamObj,
    playingXIIds: homeXI.map(p => p.id),
    squad: homeTeamObj.squad && homeTeamObj.squad.length >= 11 ? homeTeamObj.squad : homeXI
  };
  const hydratedAway: Team = {
    ...awayTeamObj,
    playingXIIds: awayXI.map(p => p.id),
    squad: awayTeamObj.squad && awayTeamObj.squad.length >= 11 ? awayTeamObj.squad : awayXI
  };

  const initialMatch = createHeadlessMatchState({
    id: fixtureId,
    homeTeam: hydratedHome,
    awayTeam: hydratedAway,
    venue,
    format,
    leagueId,
    playerPool: allPlayers
  });

  const matchState = simulateFullMatchHeadless(
    initialMatch,
    allPlayers,
    createSeededRng(Math.max(1, Math.floor(seed * 997 + 13)))
  );

  const inn1 = matchState.innings1;
  const inn2 = matchState.innings2 || matchState.innings1;

  const winnerId = matchState.winnerTeamId || '';
  const loserId = winnerId
    ? winnerId === homeTeamObj.id
      ? awayTeamObj.id
      : homeTeamObj.id
    : '';

  const summary =
    winnerId === awayTeamObj.id
      ? `${awayTeamObj.shortName} ${inn2.runs}/${inn2.wickets} beat ${homeTeamObj.shortName} ${inn1.runs}/${inn1.wickets} · ${matchState.resultText || ''}`
      : winnerId === homeTeamObj.id
      ? `${homeTeamObj.shortName} ${inn1.runs}/${inn1.wickets} beat ${awayTeamObj.shortName} ${inn2.runs}/${inn2.wickets} · ${matchState.resultText || ''}`
      : `${homeTeamObj.shortName} ${inn1.runs}/${inn1.wickets} tied ${awayTeamObj.shortName} ${inn2.runs}/${inn2.wickets}`;

  const nrrDelta = winnerId
    ? Number(Math.max(0.05, Math.min(0.45, Math.abs(inn1.runs - inn2.runs) * 0.012)).toFixed(2))
    : 0;

  return { matchState, summary, winnerId, loserId, nrrDelta };
}

const CALENDAR_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const CALENDAR_DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

export function isValidIsoCalendarDate(dateStr: unknown): dateStr is string {
  if (typeof dateStr !== 'string') return false;
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10) - 1;
  const d = parseInt(match[3], 10);
  const candidate = new Date(Date.UTC(y, m, d));
  return (
    candidate.getUTCFullYear() === y &&
    candidate.getUTCMonth() === m &&
    candidate.getUTCDate() === d
  );
}

/**
 * Parses a calendar date entry or YYYY-MM-DD string into a valid UTC Date anchored to the entry's dateStr or (month, dayNumber, fallbackYear).
 */
export function parseCalendarDateToUtc(
  dateEntry?: { dateStr?: string; dayNumber?: number; month?: string } | string | null,
  fallbackYear: number = 2026
): Date {
  const safeYear = Number.isFinite(fallbackYear) && fallbackYear >= 1900 ? Math.floor(fallbackYear) : 2026;
  const rawDateStr =
    typeof dateEntry === 'string'
      ? dateEntry
      : dateEntry && typeof dateEntry.dateStr === 'string'
      ? dateEntry.dateStr
      : null;

  if (rawDateStr && isValidIsoCalendarDate(rawDateStr)) {
    const match = rawDateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)!;
    return new Date(Date.UTC(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10)));
  }
  if (
    dateEntry &&
    typeof dateEntry === 'object' &&
    typeof dateEntry.month === 'string' &&
    typeof dateEntry.dayNumber === 'number'
  ) {
    const mIdx = CALENDAR_MONTH_NAMES.findIndex(
      m => m.toLowerCase() === dateEntry.month!.trim().slice(0, 3).toLowerCase()
    );
    if (mIdx !== -1 && dateEntry.dayNumber >= 1 && dateEntry.dayNumber <= 31) {
      const candidate = new Date(Date.UTC(safeYear, mIdx, Math.floor(dateEntry.dayNumber)));
      if (candidate.getUTCMonth() === mIdx) {
        return candidate;
      }
    }
  }
  return new Date(Date.UTC(safeYear, 2, 20));
}

/**
 * Adds `daysToAdd` to a UTC Date anchor, accurately handling 28/29/30/31-day month rollovers,
 * leap years, and December-to-January year transitions.
 */
export function addUtcDaysToCalendarDate(anchor: Date, daysToAdd: number): {
  utcDate: Date;
  dateStr: string;
  dayOfWeek: string;
  dayNumber: number;
  month: string;
  year: number;
} {
  const next = new Date(
    Date.UTC(
      anchor.getUTCFullYear(),
      anchor.getUTCMonth(),
      anchor.getUTCDate() + Math.floor(daysToAdd)
    )
  );
  const year = next.getUTCFullYear();
  const monthIdx = next.getUTCMonth();
  const dayNumber = next.getUTCDate();
  const dayOfWeek = CALENDAR_DAY_NAMES[next.getUTCDay()];
  const month = CALENDAR_MONTH_NAMES[monthIdx];
  const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
  return { utcDate: next, dateStr, dayOfWeek, dayNumber, month, year };
}

function buildTempNationalTeamFromPool(nationNameOrId: string, nations: Nation[], playerPool: Player[]): Team {
  const cleanKey = (nationNameOrId || '').trim().toLowerCase();
  const natObj = nations.find(
    n =>
      n &&
      (n.id.toLowerCase() === cleanKey ||
        n.name.trim().toLowerCase() === cleanKey ||
        (n.code && n.code.trim().toLowerCase() === cleanKey))
  );
  const resolvedName = natObj?.name || nationNameOrId || 'International XI';
  const countryMatches = playerPool.filter(
    p => p && typeof p.country === 'string' && p.country.trim().toLowerCase() === resolvedName.toLowerCase()
  );
  const squad = (countryMatches.length >= 11 ? countryMatches : [...countryMatches, ...playerPool]).slice(0, 15);
  return {
    id: natObj?.id || `nat_${resolvedName.toLowerCase().replace(/\s+/g, '_')}`,
    name: resolvedName,
    shortName: natObj?.code || resolvedName.slice(0, 3).toUpperCase(),
    city: resolvedName,
    primaryColor: '#0284c7',
    secondaryColor: '#38bdf8',
    logoEmoji: natObj?.flag || '🌐',
    purseCr: 100,
    rtmCards: 0,
    captainId: squad[0]?.id || 'p1',
    playingXIIds: squad.slice(0, 11).map(p => p.id),
    squad
  };
}

/**
 * Resolves a national team from a canonical ID (`nat_ind`), country name (`India`), or short code (`IND`, `RSA`, `SA`)
 * without ever falling back to `nations[0]`.
 */
export function resolveInternationalMatchParticipant(
  nameOrIdOrCode: string | null | undefined,
  nations: Nation[]
): Nation | null {
  if (typeof nameOrIdOrCode !== 'string' || !Array.isArray(nations) || nations.length === 0) {
    return null;
  }
  const clean = nameOrIdOrCode.trim().toLowerCase();
  if (!clean) return null;

  const direct = nations.find(
    n =>
      n &&
      ((typeof n.id === 'string' && n.id.trim().toLowerCase() === clean) ||
        (typeof n.name === 'string' && n.name.trim().toLowerCase() === clean) ||
        (typeof n.code === 'string' && n.code.trim().toLowerCase() === clean))
  );
  if (direct) return direct;

  // Common cricket code aliases (e.g. nat_south_africa -> South Africa, SA <-> RSA, WI <-> WIN, NZ <-> NZL, SL <-> SRI, nat_rsa, nat_nzl)
  const slug = clean.startsWith('nat_') ? clean.slice(4).replace(/_/g, ' ') : clean.replace(/_/g, ' ');
  for (const n of nations) {
    if (!n || typeof n.name !== 'string') continue;
    const nLower = n.name.trim().toLowerCase();
    const cLower = (n.code || '').trim().toLowerCase();
    const idSlug = (n.id || '').startsWith('nat_') ? n.id.slice(4).toLowerCase() : (n.id || '').toLowerCase();
    if (nLower === slug || cLower === slug || idSlug === slug) return n;
    if (
      (clean === 'sa' || clean === 'rsa' || clean === 'nat_rsa' || clean === 'nat_sa' || clean === 'nat_south_africa' || slug === 'sa' || slug === 'rsa' || slug === 'south africa') &&
      (cLower === 'rsa' || cLower === 'sa' || nLower === 'south africa' || n.id === 'nat_sa')
    ) {
      return n;
    }
    if (
      (clean === 'nz' || clean === 'nzl' || clean === 'nat_nzl' || clean === 'nat_nz' || clean === 'nat_new_zealand' || slug === 'nz' || slug === 'nzl' || slug === 'new zealand') &&
      (cLower === 'nz' || cLower === 'nzl' || nLower === 'new zealand' || n.id === 'nat_nz')
    ) {
      return n;
    }
    if (
      (clean === 'wi' || clean === 'win' || clean === 'nat_win' || clean === 'nat_wi' || clean === 'nat_west_indies' || slug === 'wi' || slug === 'win' || slug === 'west indies') &&
      (cLower === 'wi' || cLower === 'win' || nLower === 'west indies' || n.id === 'nat_wi')
    ) {
      return n;
    }
    if (
      (clean === 'sl' || clean === 'sri' || clean === 'nat_sri' || clean === 'nat_sl' || clean === 'nat_sri_lanka' || slug === 'sl' || slug === 'sri' || slug === 'sri lanka') &&
      (cLower === 'sl' || cLower === 'sri' || nLower === 'sri lanka' || n.id === 'nat_sl')
    ) {
      return n;
    }
  }
  return null;
}

/**
 * Authoritatively classifies the international competition identity of a match as
 * 'bilateral', 'wtc', or 'unknown' (ambiguous/unrecognized).
 * Distinguishes WTC competition identity from match format ('TEST').
 */
export function classifyInternationalCompetition(params: {
  finishedMatch: MatchLiveState;
  internationalSeries?: InternationalSeriesState | null;
  nations: Nation[];
}): 'bilateral' | 'wtc' | 'unknown' {
  const { finishedMatch, internationalSeries, nations } = params;
  const fixtureId = finishedMatch.fixtureId || finishedMatch.id || '';
  const leagueId = finishedMatch.leagueId || '';
  const compId = (finishedMatch as any).competitionId || '';
  const seriesName = (finishedMatch as any).seriesName || '';

  // 1. Explicit WTC competition markers (checked before generic ID prefixes)
  const isExplicitWtc =
    compId === 'wtc_test' ||
    compId === 'wtc' ||
    leagueId === 'wtc_test' ||
    leagueId === 'wtc' ||
    fixtureId.startsWith('wtc_') ||
    seriesName.toLowerCase().includes('world test championship') ||
    seriesName.toLowerCase().includes('wtc');

  if (isExplicitWtc) {
    return 'wtc';
  }

  // 2. Explicit fixture match in active bilateral series matches
  if (internationalSeries && Array.isArray(internationalSeries.matches)) {
    const isExplicitSeriesFixture = internationalSeries.matches.some(
      m =>
        m &&
        (m.fixtureId === fixtureId ||
          (internationalSeries.seriesId &&
            `intl_fix_${internationalSeries.seriesId}_${m.matchNumber}` === fixtureId))
    );
    if (isExplicitSeriesFixture) {
      return 'bilateral';
    }
  }

  // 3. Explicit bilateral league or fixture ID markers
  if (
    leagueId === 'test_bilateral' ||
    leagueId === 't20i_bilateral' ||
    leagueId === 'odi_bilateral' ||
    compId === 'bilateral' ||
    compId === 'bilateral_series' ||
    fixtureId.startsWith('intl_fix_') ||
    fixtureId.startsWith('cal_intl_')
  ) {
    return 'bilateral';
  }

  // 4. If series exists and teams match active internationalSeries:
  if (internationalSeries && internationalSeries.userNationId && internationalSeries.opponentNationId) {
    const homeNat =
      resolveInternationalMatchParticipant(finishedMatch.homeTeam.id, nations) ||
      resolveInternationalMatchParticipant(finishedMatch.homeTeam.name, nations);
    const awayNat =
      resolveInternationalMatchParticipant(finishedMatch.awayTeam.id, nations) ||
      resolveInternationalMatchParticipant(finishedMatch.awayTeam.name, nations);
    const sHomeNat =
      resolveInternationalMatchParticipant(internationalSeries.userNationId, nations) ||
      resolveInternationalMatchParticipant(internationalSeries.userNationName, nations);
    const sAwayNat =
      resolveInternationalMatchParticipant(internationalSeries.opponentNationId, nations) ||
      resolveInternationalMatchParticipant(internationalSeries.opponentNationName, nations);

    if (homeNat && awayNat && sHomeNat && sAwayNat) {
      const matchBoth =
        (homeNat.id === sHomeNat.id && awayNat.id === sAwayNat.id) ||
        (homeNat.id === sAwayNat.id && awayNat.id === sHomeNat.id);
      if (matchBoth) {
        return 'bilateral';
      }
    }
  }

  return 'unknown';
}

/**
 * Determines whether an international fixture belongs to the user's coached national team:
 * - In franchise mode, returns false (international fixtures simulate normally without diversion).
 * - In international mode, resolves the coached nation authoritatively.
 * - If fixture involves the coached nation, returns true (must be preserved for the user to play).
 * - Fails safely if team or fixture identity is missing or ambiguous (returns true to prevent auto-simulating ambiguous fixtures).
 */
export function isUserControlledInternationalFixture(
  fixture: {
    homeTeamId?: string;
    awayTeamId?: string;
    homeTeamName?: string;
    awayTeamName?: string;
    homeTeam?: { id?: string; name?: string };
    awayTeam?: { id?: string; name?: string };
    isInternational?: boolean;
    format?: string;
  } | null | undefined,
  coachProfile: CoachProfile | undefined | null,
  nations: Nation[]
): boolean {
  if (!fixture) return false;

  const activeMode =
    coachProfile?.activeCareerMode ||
    (coachProfile?.nationalTeamId && !coachProfile?.clubTeamId ? 'international' : 'franchise');
  if (activeMode !== 'international') {
    return false;
  }

  const coachedNationId = coachProfile?.nationalTeamId;
  if (!coachedNationId) {
    return true; // Fail safely: active international mode but unassigned coached nation
  }

  const coachedNat = resolveInternationalMatchParticipant(coachedNationId, nations);
  if (!coachedNat) {
    return true; // Fail safely: cannot resolve coached nation
  }

  const homeId = fixture.homeTeamId || fixture.homeTeam?.id || '';
  const awayId = fixture.awayTeamId || fixture.awayTeam?.id || '';
  const homeName = fixture.homeTeamName || fixture.homeTeam?.name || '';
  const awayName = fixture.awayTeamName || fixture.awayTeam?.name || '';

  // Fail safely if participant identity is completely missing or ambiguous
  if ((!homeId && !homeName) || (!awayId && !awayName)) {
    return true;
  }

  const homeNat =
    resolveInternationalMatchParticipant(homeId, nations) ||
    resolveInternationalMatchParticipant(homeName, nations);
  const awayNat =
    resolveInternationalMatchParticipant(awayId, nations) ||
    resolveInternationalMatchParticipant(awayName, nations);

  // If either participant cannot be resolved to a known nation, it is ambiguous
  if (!homeNat || !awayNat) {
    if (homeNat?.id === coachedNat.id || awayNat?.id === coachedNat.id) {
      return true;
    }
    return true; // Fail safely
  }

  return homeNat.id === coachedNat.id || awayNat.id === coachedNat.id;
}

/**
 * Determines whether a domestic fixture involves the user's coached franchise club.
 */
export function isUserControlledFranchiseFixture(
  fixture: {
    homeTeamId?: string;
    awayTeamId?: string;
    isUserMatch?: boolean;
    homeTeam?: { id?: string; isUserTeam?: boolean };
    awayTeam?: { id?: string; isUserTeam?: boolean };
  } | null | undefined,
  coachProfile: CoachProfile | undefined | null,
  userTeamId?: string
): boolean {
  if (!fixture) return false;
  const activeMode =
    coachProfile?.activeCareerMode ||
    (coachProfile?.nationalTeamId && !coachProfile?.clubTeamId ? 'international' : 'franchise');
  if (activeMode === 'international') {
    return false;
  }
  const myClubId = userTeamId || coachProfile?.clubTeamId;
  if (!myClubId) return true; // fail safely
  const homeId = fixture.homeTeamId || fixture.homeTeam?.id;
  const awayId = fixture.awayTeamId || fixture.awayTeam?.id;
  if (!homeId && !awayId) return true; // ambiguous
  return (
    fixture.isUserMatch === true ||
    fixture.homeTeam?.isUserTeam === true ||
    fixture.awayTeam?.isUserTeam === true ||
    homeId === myClubId ||
    awayId === myClubId
  );
}

/**
 * Helper to reconcile at most ONE matching calendar fixture in `leagues` for an international match:
 * - Idempotently updates the calendar fixture matching `matchedFixtureId` (or the unique match in legacy mode).
 * - Updates only the matching calendar fixture in the target league.
 * - Preserves existing authoritative results on already-completed fixtures.
 * - Fails safely without overwriting if calendar fixture has conflicting participant data.
 * - Never modifies other fixtures or unrelated leagues.
 */
function reconcileCalendarForInternationalMatch(params: {
  leagues: League[];
  currentLeagueId?: string;
  matchedFixtureId: string | null;
  competitionType: 'bilateral' | 'wtc';
  authoritativeSummary: string;
  finishedMatch: MatchLiveState;
  doesPairMatchFinishedTeams: (
    candHomeId?: string,
    candAwayId?: string,
    candHomeName?: string,
    candAwayName?: string
  ) => boolean;
}): League[] {
  const {
    leagues,
    currentLeagueId,
    matchedFixtureId,
    competitionType,
    authoritativeSummary,
    finishedMatch,
    doesPairMatchFinishedTeams
  } = params;

  return leagues.map(league => {
    if (!league || !Array.isArray(league.calendarDates)) return league;
    // Update only the matching calendar fixture in the correct league (Requirement 2.4)
    if (currentLeagueId && league.id !== currentLeagueId) {
      return league;
    }

    // Find the single target calendar entry to reconcile
    let targetCalIdx = -1;
    if (matchedFixtureId) {
      targetCalIdx = league.calendarDates.findIndex(
        cd =>
          cd &&
          (cd.matchFixture?.id === matchedFixtureId ||
            (Array.isArray(cd.internationalMatches) &&
              cd.internationalMatches.some(im => im && im.id === matchedFixtureId)))
      );
    }

    if (targetCalIdx === -1 && !matchedFixtureId) {
      // Legacy path only: when matchedFixtureId is null, search by index and teams
      const curIdx = Math.max(0, Math.min(league.currentDateIndex || 0, Math.max(0, league.calendarDates.length - 1)));
      for (let offset = 0; offset < league.calendarDates.length; offset++) {
        const idx = curIdx + offset;
        if (idx >= league.calendarDates.length) break;
        const cd = league.calendarDates[idx];
        if (!cd) continue;
        const mf = cd.matchFixture;
        const isCalEntryWtc = Boolean(
          cd.id?.startsWith('wtc_') ||
          (mf && (mf.id?.startsWith('wtc_') || (mf as any).competitionId === 'wtc_test' || (mf as any).leagueId === 'wtc_test'))
        );
        if (competitionType === 'wtc' && !isCalEntryWtc) continue;
        if (competitionType === 'bilateral' && isCalEntryWtc) continue;

        const mfMatches =
          mf &&
          (mf.isInternational || cd.type === 'international') &&
          !mf.completed &&
          doesPairMatchFinishedTeams(mf.homeTeamId, mf.awayTeamId, mf.homeTeamName, mf.awayTeamName);
        const imMatches =
          Array.isArray(cd.internationalMatches) &&
          cd.internationalMatches.some(
            im =>
              im &&
              !im.completed &&
              doesPairMatchFinishedTeams(im.homeTeamId, im.awayTeamId, im.homeTeamName, im.awayTeamName)
          );
        if (mfMatches || imMatches) {
          targetCalIdx = idx;
          break;
        }
      }
      if (targetCalIdx === -1) {
        for (let idx = 0; idx < curIdx; idx++) {
          const cd = league.calendarDates[idx];
          if (!cd) continue;
          const mf = cd.matchFixture;
          const isCalEntryWtc = Boolean(
            cd.id?.startsWith('wtc_') ||
            (mf && (mf.id?.startsWith('wtc_') || (mf as any).competitionId === 'wtc_test' || (mf as any).leagueId === 'wtc_test'))
          );
          if (competitionType === 'wtc' && !isCalEntryWtc) continue;
          if (competitionType === 'bilateral' && isCalEntryWtc) continue;

          const mfMatches =
            mf &&
            (mf.isInternational || cd.type === 'international') &&
            !mf.completed &&
            doesPairMatchFinishedTeams(mf.homeTeamId, mf.awayTeamId, mf.homeTeamName, mf.awayTeamName);
          const imMatches =
            Array.isArray(cd.internationalMatches) &&
            cd.internationalMatches.some(
              im =>
                im &&
                !im.completed &&
                doesPairMatchFinishedTeams(im.homeTeamId, im.awayTeamId, im.homeTeamName, im.awayTeamName)
            );
          if (mfMatches || imMatches) {
            targetCalIdx = idx;
            break;
          }
        }
      }
    }

    if (targetCalIdx === -1) return league;

    // Check if target calendar fixture has conflicting data (Requirement 2.7)
    const targetCd = league.calendarDates[targetCalIdx];
    if (targetCd?.matchFixture) {
      const mf = targetCd.matchFixture;
      if (
        matchedFixtureId &&
        mf.id === matchedFixtureId &&
        !doesPairMatchFinishedTeams(mf.homeTeamId, mf.awayTeamId, mf.homeTeamName, mf.awayTeamName)
      ) {
        // Conflicting participant data! Do not overwrite unrelated match results.
        return league;
      }
    }

    return {
      ...league,
      calendarDates: league.calendarDates.map((cd, idx) => {
        if (idx !== targetCalIdx || !cd) return cd;

        const mf = cd.matchFixture;
        const matchesMf = Boolean(
          mf &&
            (mf.isInternational || cd.type === 'international') &&
            ((matchedFixtureId && mf.id === matchedFixtureId) ||
              (!matchedFixtureId && doesPairMatchFinishedTeams(mf.homeTeamId, mf.awayTeamId, mf.homeTeamName, mf.awayTeamName)))
        );

        let updatedMatchFixture = mf;
        if (matchesMf && mf) {
          if (mf.completed) {
            // Already completed: preserve existing valid result and state (Requirement 2.5)
            updatedMatchFixture = {
              ...mf,
              completed: true,
              resultSummary: mf.resultSummary || authoritativeSummary
            };
          } else {
            // Reconcile uncompleted fixture
            updatedMatchFixture = {
              ...mf,
              completed: true,
              resultSummary: authoritativeSummary,
              completedMatchState: finishedMatch
            };
          }
        }

        let updatedOneIm = false;
        const updatedIntlMatches = Array.isArray(cd.internationalMatches)
          ? cd.internationalMatches.map(im => {
              if (!im || updatedOneIm) return im;
              const matchesIm = Boolean(
                (matchedFixtureId && im.id === matchedFixtureId) ||
                  (!matchedFixtureId &&
                    !im.completed &&
                    doesPairMatchFinishedTeams(im.homeTeamId, im.awayTeamId, im.homeTeamName, im.awayTeamName))
              );
              if (matchesIm) {
                updatedOneIm = true;
                if (im.completed) {
                  return {
                    ...im,
                    completed: true,
                    resultSummary: im.resultSummary || authoritativeSummary
                  };
                }
                return {
                  ...im,
                  completed: true,
                  resultSummary: authoritativeSummary,
                  completedMatchState: finishedMatch
                };
              }
              return im;
            })
          : cd.internationalMatches;

        return {
          ...cd,
          matchFixture: updatedMatchFixture,
          internationalMatches: updatedIntlMatches
        };
      })
    };
  });
}

/**
 * Authoritative pure state helper for recording a completed international match:
 * - Authoritatively determines competition identity (distinguishing bilateral Test matches from WTC).
 * - Enforces idempotency against repeated completion callbacks (skips ranking and score duplicates).
 * - Reconciles at most ONE matching uncompleted fixture in `internationalSeries.matches` (preferring exact `fixtureId`).
 * - Marks ONLY the corresponding single calendar fixture completed.
 * - Fails safely without state corruption if competition identity is unknown/ambiguous.
 */
export function applyRecordCompletedInternationalMatchState(params: {
  finishedMatch: MatchLiveState;
  didUserWin?: boolean;
  intlShortSummary?: string;
  coachProfile?: CoachProfile;
  internationalSeries: InternationalSeriesState;
  leagues: League[];
  currentLeagueId: string;
  nations: Nation[];
}): {
  internationalSeries: InternationalSeriesState;
  leagues: League[];
  nations: Nation[];
  matchedFixtureId: string | null;
} {
  const {
    finishedMatch,
    coachProfile,
    internationalSeries,
    leagues,
    currentLeagueId,
    nations
  } = params;

  // 1. Authoritatively classify competition
  const competitionType = classifyInternationalCompetition({
    finishedMatch,
    internationalSeries,
    nations
  });

  if (competitionType === 'unknown') {
    // Fail safely for ambiguous/unrecognized international fixtures:
    // Do not corrupt active series, do not mutate leagues or rankings
    return {
      internationalSeries,
      leagues,
      nations,
      matchedFixtureId: null
    };
  }

  const winnerId = finishedMatch.winnerTeamId || finishedMatch.homeTeam.id;
  const loserId = winnerId === finishedMatch.homeTeam.id ? finishedMatch.awayTeam.id : finishedMatch.homeTeam.id;

  const homeNat =
    resolveInternationalMatchParticipant(finishedMatch.homeTeam.id, nations) ||
    resolveInternationalMatchParticipant(finishedMatch.homeTeam.name, nations);
  const awayNat =
    resolveInternationalMatchParticipant(finishedMatch.awayTeam.id, nations) ||
    resolveInternationalMatchParticipant(finishedMatch.awayTeam.name, nations);

  const winnerNat = winnerId === finishedMatch.homeTeam.id ? homeNat : awayNat;
  const loserNat = loserId === finishedMatch.homeTeam.id ? homeNat : awayNat;
  const winnerNameLower = (winnerNat?.name || (winnerId === finishedMatch.homeTeam.id ? finishedMatch.homeTeam.name : finishedMatch.awayTeam.name) || '').toLowerCase();
  const loserNameLower = (loserNat?.name || (loserId === finishedMatch.homeTeam.id ? finishedMatch.homeTeam.name : finishedMatch.awayTeam.name) || '').toLowerCase();

  const userNatId = coachProfile?.nationalTeamId || internationalSeries?.userNationId || '';
  const didUserWin =
    typeof params.didUserWin === 'boolean'
      ? params.didUserWin
      : Boolean(
          (userNatId && (winnerId === userNatId || winnerNat?.id === userNatId)) ||
            (winnerId === finishedMatch.homeTeam.id && finishedMatch.homeTeam.isUserTeam) ||
            (winnerId === finishedMatch.awayTeam.id && finishedMatch.awayTeam.isUserTeam)
        );

  const inn1 = finishedMatch.innings1;
  const inn2 = finishedMatch.innings2;
  const homeShort = finishedMatch.homeTeam.shortName || homeNat?.code || 'HOM';
  const awayShort = finishedMatch.awayTeam.shortName || awayNat?.code || 'AWY';
  const homeScore =
    inn1.battingTeamId === finishedMatch.homeTeam.id
      ? `${inn1.runs}/${inn1.wickets}`
      : `${inn2?.runs || 0}/${inn2?.wickets || 0}`;
  const awayScore =
    inn1.battingTeamId === finishedMatch.awayTeam.id
      ? `${inn1.runs}/${inn1.wickets}`
      : `${inn2?.runs || 0}/${inn2?.wickets || 0}`;
  const intlShortSummary =
    typeof params.intlShortSummary === 'string' && params.intlShortSummary.trim().length > 0
      ? params.intlShortSummary
      : `${awayShort} ${awayScore} vs ${homeShort} ${homeScore} · ${finishedMatch.resultText || ''}`;

  const doesPairMatchFinishedTeams = (
    candHomeId?: string,
    candAwayId?: string,
    candHomeName?: string,
    candAwayName?: string
  ): boolean => {
    const cHomeNat =
      resolveInternationalMatchParticipant(candHomeId, nations) ||
      resolveInternationalMatchParticipant(candHomeName, nations);
    const cAwayNat =
      resolveInternationalMatchParticipant(candAwayId, nations) ||
      resolveInternationalMatchParticipant(candAwayName, nations);

    if (homeNat && awayNat && cHomeNat && cAwayNat) {
      return (
        (cHomeNat.id === homeNat.id && cAwayNat.id === awayNat.id) ||
        (cHomeNat.id === awayNat.id && cAwayNat.id === homeNat.id)
      );
    }

    const fHome = (finishedMatch.homeTeam.name || finishedMatch.homeTeam.id || '').trim().toLowerCase();
    const fAway = (finishedMatch.awayTeam.name || finishedMatch.awayTeam.id || '').trim().toLowerCase();
    const cH1 = (candHomeId || '').trim().toLowerCase();
    const cA1 = (candAwayId || '').trim().toLowerCase();
    const cH2 = (candHomeName || '').trim().toLowerCase();
    const cA2 = (candAwayName || '').trim().toLowerCase();

    return (
      ((cH1 === fHome || cH2 === fHome) && (cA1 === fAway || cA2 === fAway)) ||
      ((cH1 === fAway || cH2 === fAway) && (cA1 === fHome || cA2 === fHome))
    );
  };

  let nextSeries = internationalSeries;
  const explicitFixtureId =
    typeof finishedMatch.fixtureId === 'string' && finishedMatch.fixtureId.trim().length > 0
      ? finishedMatch.fixtureId.trim()
      : null;
  let matchedFixtureId: string | null = explicitFixtureId;

  // 2. WTC Completion Handling vs Bilateral Series Completion Handling with Idempotency Guard
  if (competitionType === 'wtc') {
    const isAlreadyCompletedWtc = Boolean(
      internationalSeries?.wtcTestCompleted &&
      (internationalSeries.wtcTestSummary === intlShortSummary || !params.intlShortSummary)
    );

    if (isAlreadyCompletedWtc) {
      // Reconcile calendar if uncompleted, but do not duplicate rankings or series! (Requirement 2)
      const reconciledLeagues = reconcileCalendarForInternationalMatch({
        leagues,
        currentLeagueId,
        matchedFixtureId,
        competitionType: 'wtc',
        authoritativeSummary: internationalSeries?.wtcTestSummary || intlShortSummary,
        finishedMatch,
        doesPairMatchFinishedTeams
      });
      return {
        internationalSeries,
        leagues: reconciledLeagues,
        nations,
        matchedFixtureId
      };
    }

    if (internationalSeries && typeof internationalSeries === 'object') {
      nextSeries = {
        ...internationalSeries,
        wtcTestCompleted: true,
        wtcTestSummary: intlShortSummary
      };
    }
  } else if (competitionType === 'bilateral') {
    if (!internationalSeries || !Array.isArray(internationalSeries.matches) || internationalSeries.matches.length === 0) {
      // No active series matches to record against: fail safely without mutating state
      return {
        internationalSeries,
        leagues,
        nations,
        matchedFixtureId: null
      };
    }

    const seriesMatchesTeams = doesPairMatchFinishedTeams(
      internationalSeries.userNationId,
      internationalSeries.opponentNationId,
      internationalSeries.userNationName,
      internationalSeries.opponentNationName
    );

    if (!seriesMatchesTeams) {
      // Teams in finished match do not match active bilateral series: fail safely
      return {
        internationalSeries,
        leagues,
        nations,
        matchedFixtureId: null
      };
    }

    let targetMatchIdx = -1;
    if (explicitFixtureId) {
      // 1. Authoritative exact fixture ID resolution against series matches
      targetMatchIdx = internationalSeries.matches.findIndex(
        m =>
          m &&
          (m.fixtureId === explicitFixtureId ||
            (internationalSeries.seriesId &&
              `intl_fix_${internationalSeries.seriesId}_${m.matchNumber}` === explicitFixtureId))
      );

      // 2. Authoritative fixture-mapping recovery path with strict series identity and participant verification
      if (targetMatchIdx === -1 && internationalSeries.seriesId) {
        for (const league of leagues) {
          if (!league || !Array.isArray(league.calendarDates)) continue;
          for (const cd of league.calendarDates) {
            if (!cd) continue;
            const candMf: CalendarMatchFixture | null = cd.matchFixture?.id === explicitFixtureId ? cd.matchFixture : null;
            const candIm: CalendarMatchFixture | null = Array.isArray(cd.internationalMatches)
              ? (cd.internationalMatches.find(im => im && im.id === explicitFixtureId) as CalendarMatchFixture | undefined) || null
              : null;
            const candFix: CalendarMatchFixture | null = candMf || candIm;
            if (!candFix) continue;

            // Strict Verification:
            // a) Series identity must match active international series
            const fixSeriesId: string | undefined =
              (candFix as any).seriesId ||
              (candFix as any).competitionId ||
              (typeof cd.id === 'string' && cd.id.startsWith('cal_intl_') ? cd.id.split('_')[2] : undefined);
            const isSeriesIdentical: boolean = Boolean(
              fixSeriesId && fixSeriesId === internationalSeries.seriesId
            );

            // b) Participants must match active international series nations
            const isPairMatchingSeries: boolean = doesPairMatchFinishedTeams(
              candFix.homeTeamId,
              candFix.awayTeamId,
              candFix.homeTeamName,
              candFix.awayTeamName
            );

            // c) Match number verification against series match
            const matchNum: number | undefined = (candFix as any).matchNumber || (candFix as any).seriesMatchNumber;
            const isValidMatchNum: boolean =
              typeof matchNum === 'number' &&
              matchNum >= 1 &&
              matchNum <= internationalSeries.matches.length;

            if (isSeriesIdentical && isPairMatchingSeries && isValidMatchNum && typeof matchNum === 'number') {
              const candidateSeriesMatch: InternationalSeriesMatch | undefined = internationalSeries.matches[matchNum - 1];
              if (
                candidateSeriesMatch &&
                (candidateSeriesMatch.fixtureId === explicitFixtureId ||
                  `intl_fix_${internationalSeries.seriesId}_${candidateSeriesMatch.matchNumber}` === explicitFixtureId ||
                  !candidateSeriesMatch.fixtureId)
              ) {
                targetMatchIdx = matchNum - 1;
                break;
              }
            }
          }
          if (targetMatchIdx !== -1) break;
        }
      }

      // Requirement 1.2: If supplied fixture ID does not match a fixture in the series,
      // DO NOT fall back to another match based solely on team names!
      if (targetMatchIdx === -1) {
        return {
          internationalSeries,
          leagues,
          nations,
          matchedFixtureId: null
        };
      }
    } else {
      // Requirement 1.4 & 1.5: If NO fixture ID was supplied (legacy flow), allow team-based fallback
      // ONLY when the teams, series identity, and match status UNIQUELY identify the intended unfinished fixture.
      const unfinishedIndexes: number[] = [];
      internationalSeries.matches.forEach((m, idx) => {
        if (m && !m.completed) {
          unfinishedIndexes.push(idx);
        }
      });

      if (unfinishedIndexes.length === 1) {
        targetMatchIdx = unfinishedIndexes[0];
      } else {
        // Ambiguous match (e.g. 0 or >1 unfinished matches in series): reject safely without mutation
        return {
          internationalSeries,
          leagues,
          nations,
          matchedFixtureId: null
        };
      }
    }

    const targetMatch = internationalSeries.matches[targetMatchIdx];
    const expectedFixId =
      targetMatch.fixtureId ||
      (internationalSeries.seriesId
        ? `intl_fix_${internationalSeries.seriesId}_${targetMatch.matchNumber}`
        : matchedFixtureId || undefined);

    if (!matchedFixtureId && expectedFixId) {
      matchedFixtureId = expectedFixId;
    }

    if (targetMatch.completed) {
      // Idempotency: match was already completed in series, do not duplicate rankings or results,
      // BUT reconcile the corresponding calendar fixture in case it was out of sync (Requirement 2)
      const reconciledLeagues = reconcileCalendarForInternationalMatch({
        leagues,
        currentLeagueId,
        matchedFixtureId,
        competitionType: 'bilateral',
        authoritativeSummary: targetMatch.summary || intlShortSummary,
        finishedMatch,
        doesPairMatchFinishedTeams
      });

      return {
        internationalSeries,
        leagues: reconciledLeagues,
        nations,
        matchedFixtureId
      };
    }

    const updatedMatches = internationalSeries.matches.map((m, idx) =>
      idx === targetMatchIdx
        ? {
            ...m,
            fixtureId: m.fixtureId || expectedFixId,
            completed: true,
            summary: intlShortSummary
          }
        : m
    );
    nextSeries = {
      ...internationalSeries,
      seriesWins: internationalSeries.seriesWins + (didUserWin ? 1 : 0),
      seriesLosses: internationalSeries.seriesLosses + (didUserWin ? 0 : 1),
      matches: updatedMatches
    };
  }

  // 3. Update ICC Rankings only for freshly completed matches (idempotency enforced)
  const updatedNationsRaw = nations.map(n => {
    const isWin = (winnerNat && n.id === winnerNat.id) || n.name.toLowerCase() === winnerNameLower;
    const isLoss = (loserNat && n.id === loserNat.id) || n.name.toLowerCase() === loserNameLower;
    if (!isWin && !isLoss) return n;
    const delta = isWin ? 3 : -2;
    return {
      ...n,
      ratingT20: finishedMatch.format === 'T20' ? Math.max(150, n.ratingT20 + delta) : n.ratingT20,
      ratingODI: finishedMatch.format === 'ODI' ? Math.max(50, n.ratingODI + delta) : n.ratingODI,
      ratingTest: finishedMatch.format === 'TEST' ? Math.max(40, n.ratingTest + delta) : n.ratingTest
    };
  });

  const byT20 = [...updatedNationsRaw].sort((a, b) => b.ratingT20 - a.ratingT20);
  const byODI = [...updatedNationsRaw].sort((a, b) => b.ratingODI - a.ratingODI);
  const byTest = [...updatedNationsRaw].sort((a, b) => b.ratingTest - a.ratingTest);

  const updatedNations = updatedNationsRaw.map(n => {
    const rT20 = byT20.findIndex(x => x.id === n.id) + 1;
    const rODI = byODI.findIndex(x => x.id === n.id) + 1;
    const rTest = byTest.findIndex(x => x.id === n.id) + 1;
    return {
      ...n,
      rankT20: rT20,
      t20Rank: rT20,
      rankODI: rODI,
      odiRank: rODI,
      rankTest: rTest,
      testRank: rTest
    };
  });

  // 4. Update leagues calendar fixture
  const updatedLeagues = reconcileCalendarForInternationalMatch({
    leagues,
    currentLeagueId,
    matchedFixtureId,
    competitionType: competitionType as 'bilateral' | 'wtc',
    authoritativeSummary: intlShortSummary,
    finishedMatch,
    doesPairMatchFinishedTeams
  });

  return {
    internationalSeries: nextSeries,
    leagues: updatedLeagues,
    nations: updatedNations,
    matchedFixtureId
  };
}

export function buildFranchiseBoardReviewSnapshot(
  league: League,
  userTeamObj: Team,
  _players?: Player[],
  existingReview?: CareerBoardReview | null
): CareerBoardReview {
  const seasonYrStr = normalizeSeasonYear(league.seasonName || league.seasonYear);
  const seasonYrNum = parseInt(seasonYrStr, 10) || 2026;
  const userTeamId = userTeamObj.id;
  if (
    existingReview &&
    existingReview.seasonYear === seasonYrNum &&
    existingReview.teamId === userTeamId &&
    (existingReview.competitionId || 'pt20') === league.id
  ) {
    return existingReview;
  }

  const sortedStandings = [...(league.standings || [])].sort(
    (a, b) => b.points - a.points || b.nrr - a.nrr
  );
  const userStandingRow = sortedStandings.find(s => s.teamId === userTeamId);
  const finalWinnerId = league.playoffs?.final?.winnerTeamId || league.playoffs?.championTeamId;
  const finalLoserId = league.playoffs?.final?.loserTeamId;
  const userWonFinal = finalWinnerId === userTeamId;
  const userRank = userWonFinal
    ? 1
    : finalLoserId === userTeamId
    ? 2
    : Math.max(1, sortedStandings.findIndex(s => s.teamId === userTeamId) + 1);

  const objectives: CareerBoardReview['objectives'] = [
    {
      id: 'target_playoffs',
      category: 'PRIMARY',
      title: 'Reach Top 4 Playoffs',
      description: 'Finish in the top 4 to qualify for the playoffs',
      targetStr: 'Top 4',
      measuredStr: `#${userRank}`,
      isFulfilled: userRank <= 4
    },
    {
      id: 'target_nrr',
      category: 'SECONDARY',
      title: 'Maintain Positive NRR',
      description: 'Keep Net Run Rate above 0.00 across the league stage',
      targetStr: '> 0.00',
      measuredStr: `${(userStandingRow?.nrr || 0).toFixed(2)}`,
      isFulfilled: (userStandingRow?.nrr || 0) > 0
    }
  ];
  const fulfilledCount = objectives.filter(o => o.isFulfilled).length;
  const totalCount = objectives.length;
  const scorePct = Math.round((fulfilledCount / totalCount) * 100);

  return {
    seasonYear: seasonYrNum,
    competitionId: league.id,
    teamId: userTeamId,
    teamName: userTeamObj.name || 'Franchise',
    objectives,
    fulfilledCount,
    totalCount,
    scorePct,
    isSatisfied: scorePct >= 60,
    verdictTitle: userWonFinal ? 'CHAMPIONSHIP DYNASTY' : 'SEASON CONCLUDED',
    verdictDesc: `${league.playoffs?.final?.resultSummary || `${seasonYrStr} Season completed.`}`
  };
}

/**
 * Authoritative pure state transition that automatically simulates ready AI-only playoff matches
 * (`!isUserMatch` where `canSimulate === true` under `isUserAction: false`) in bracket order (`q1` -> `eliminator` -> `q2` -> `final`).
 * - Never auto-simulates a playoff match involving the user's coached club.
 * - Ensures that when the user plays/sims Q1, the AI Eliminator (and AI Q2 if the user won Q1) advances automatically so the bracket never deadlocks.
 * - Ensures that if the user did not qualify for Top 4 or was eliminated in Eliminator/Q2, the remaining AI playoff matches advance cleanly through the Final to `board_review`.
 */
export function applyAdvanceAiPlayoffMatchesState(state: {
  league?: League;
  leagues?: League[];
  currentLeagueId?: string;
  teams: Team[];
  players: Player[];
  coachProfile: CoachProfile;
  tournamentHonors: TournamentHonor[];
  careerPhase: CareerPhase;
  careerBoardReview: CareerBoardReview | null;
}): {
  stagesSimulated: ('q1' | 'eliminator' | 'q2' | 'final')[];
  simulatedStages: ('q1' | 'eliminator' | 'q2' | 'final')[];
  league: League;
  leagues: League[];
  players: Player[];
  teams: Team[];
  coachProfile: CoachProfile;
  tournamentHonors: TournamentHonor[];
  careerPhase: CareerPhase;
  careerBoardReview: CareerBoardReview | null;
} {
  const {
    teams,
    players,
    coachProfile,
    tournamentHonors,
    careerPhase,
    careerBoardReview
  } = state;

  const resolvedLeagues =
    Array.isArray(state.leagues) && state.leagues.length > 0
      ? state.leagues
      : state.league
      ? [state.league]
      : [];
  const resolvedLeagueId = state.currentLeagueId || state.league?.id || resolvedLeagues[0]?.id || 'pt20';
  const targetLeague = resolvedLeagues.find(l => l && l.id === resolvedLeagueId) || state.league || resolvedLeagues[0];

  const unchanged = {
    stagesSimulated: [] as ('q1' | 'eliminator' | 'q2' | 'final')[],
    simulatedStages: [] as ('q1' | 'eliminator' | 'q2' | 'final')[],
    league: targetLeague,
    leagues: resolvedLeagues,
    players,
    teams,
    coachProfile,
    tournamentHonors,
    careerPhase,
    careerBoardReview
  };

  if (
    coachProfile?.activeCareerMode === 'international' ||
    careerPhase === 'international_squad_selection' ||
    careerPhase === 'international_series' ||
    !targetLeague ||
    !isDomesticLeagueStageComplete(targetLeague)
  ) {
    return unchanged;
  }

  let workingPlayers = [...players];
  let workingTeams = [...teams];
  let workingCoach = coachProfile;
  let workingHonors = tournamentHonors;
  let workingPhase: CareerPhase = careerPhase === 'league_stage' ? 'playoffs' : careerPhase;
  let workingReview = careerBoardReview;

  // Ensure Top 4 seeds are seeded into Q1 and Eliminator before evaluating AI matches
  const seededPlayoffs = seedQualifiedPlayoffsFromStandings(targetLeague.standings, targetLeague.playoffs);
  let workingLeagues = resolvedLeagues.map(l =>
    l && l.id === resolvedLeagueId
      ? {
          ...l,
          playoffs: seededPlayoffs,
          calendarDates: syncPlayoffCalendarDates(
            l.calendarDates,
            seededPlayoffs,
            [...workingTeams, ...(l.teams || [])]
          )
        }
      : l
  );

  const stagesOrder: ('q1' | 'eliminator' | 'q2' | 'final')[] = ['q1', 'eliminator', 'q2', 'final'];
  const simulatedStages: ('q1' | 'eliminator' | 'q2' | 'final')[] = [];
  const activeSeasonKey = normalizeSeasonYear(targetLeague.seasonName || targetLeague.seasonYear);

  for (const stage of stagesOrder) {
    const curLeague = workingLeagues.find(l => l && l.id === resolvedLeagueId);
    if (!curLeague) break;

    const elig = validatePlayoffEligibility({
      careerPhase: workingPhase,
      league: curLeague,
      userClubId: workingCoach.clubTeamId,
      stage,
      isUserAction: false
    });

    if (!elig.canSimulate || elig.isUserMatch || !elig.homeTeamId || !elig.awayTeamId) {
      continue;
    }

    const allTeamsPool = [...workingTeams, ...(curLeague.teams || [])];
    const homeTeamObj = allTeamsPool.find(t => t && t.id === elig.homeTeamId);
    const awayTeamObj = allTeamsPool.find(t => t && t.id === elig.awayTeamId);
    if (!homeTeamObj || !awayTeamObj || homeTeamObj.id === awayTeamObj.id) {
      continue;
    }

    const stageIdx = stagesOrder.indexOf(stage) + 1;
    const simRes = simulateAiFixtureScorecard(
      `fix_playoff_${stage}`,
      homeTeamObj,
      awayTeamObj,
      stage === 'final'
        ? 'Wankhede Stadium · Championship Final'
        : `${homeTeamObj.city || 'Ahmedabad'} Cricket Stadium`,
      'T20',
      resolvedLeagueId,
      workingPlayers,
      stageIdx * 37 + 19
    );

    workingPlayers = applyMatchToPlayerList(workingPlayers, simRes.matchState, activeSeasonKey);
    const resolvedWinnerId = simRes.winnerId || homeTeamObj.id;

    const completeRes = applyCompletePlayoffMatchState(
      {
        leagues: workingLeagues,
        currentLeagueId: resolvedLeagueId,
        teams: workingTeams,
        coachProfile: workingCoach,
        tournamentHonors: workingHonors,
        careerPhase: workingPhase,
        careerBoardReview: workingReview
      },
      {
        leagueId: resolvedLeagueId,
        stage,
        homeTeamId: homeTeamObj.id,
        awayTeamId: awayTeamObj.id,
        winnerTeamId: resolvedWinnerId,
        resultSummary: simRes.summary
      }
    );

    if (!completeRes.alreadyCompleted) {
      workingLeagues = completeRes.leagues.map(l =>
        l && l.id === resolvedLeagueId
          ? {
              ...l,
              calendarDates: l.calendarDates.map(cd =>
                cd &&
                (cd.id === `cal_playoff_${stage}` || cd.matchFixture?.id === `fix_playoff_${stage}`) &&
                cd.matchFixture
                  ? {
                      ...cd,
                      matchFixture: {
                        ...cd.matchFixture,
                        completed: true,
                        resultSummary: simRes.summary,
                        completedMatchState: simRes.matchState
                      }
                    }
                  : cd
              )
            }
          : l
      );
      workingCoach = completeRes.coachProfile;
      workingHonors = completeRes.tournamentHonors;
      workingPhase = completeRes.careerPhase;
      workingReview = completeRes.careerBoardReview;
      simulatedStages.push(stage);
    }
  }

  if (simulatedStages.length > 0) {
    workingTeams = workingTeams.map(t => ({
      ...t,
      squad: (t.squad || []).map(sp => workingPlayers.find(wp => wp.id === sp.id) || sp)
    }));
  }

  const finalTargetLeague = workingLeagues.find(l => l && l.id === resolvedLeagueId) || targetLeague;

  return {
    stagesSimulated: simulatedStages,
    simulatedStages,
    league: finalTargetLeague,
    leagues: workingLeagues,
    players: workingPlayers,
    teams: workingTeams,
    coachProfile: workingCoach,
    tournamentHonors: workingHonors,
    careerPhase: workingPhase,
    careerBoardReview: workingReview
  };
}

/**
 * Authoritative pure state transition for advancing a calendar day in the active league:
 * - Checks whether the current calendar day contains an uncompleted fixture the user is eligible to play
 *   (club match in franchise mode, or international match involving coached nation in international mode).
 * - If so, blocks advancement (`advanced: false`) to preserve user-controlled fixtures from being consumed as AI.
 * - For eligible AI fixtures on the current day, simulates unfinished domestic and international fixtures.
 * - Never simulates international fixtures involving the user's coached nation in the background.
 * - Fails safely if team or fixture identity is missing or ambiguous (does not auto-simulate fixtures with ambiguous user involvement).
 * - Skips already-completed fixtures to prevent double simulation between calendar and Hub.
 * - Updates domestic standings, NRR, playoffs qualification, and advances `currentDateIndex`.
 */
export function applyAdvanceCalendarDayState(params: {
  league?: League;
  leagues?: League[];
  currentLeagueId?: string;
  teams: Team[];
  players: Player[];
  coachProfile?: CoachProfile;
  userTeamId?: string;
  nations: Nation[];
  careerPhase: CareerPhase;
  tournamentHonors: TournamentHonor[];
  careerBoardReview: CareerBoardReview | null;
  activeSeasonKey?: string;
  internationalSeries?: InternationalSeriesState;
}): {
  advanced: boolean;
  blockedReason?: string;
  league: League;
  leagues?: League[];
  players: Player[];
  careerPhase: CareerPhase;
  tournamentHonors: TournamentHonor[];
  careerBoardReview: CareerBoardReview | null;
  coachProfile?: CoachProfile;
  simulatedFixturesCount: number;
} {
  const {
    teams,
    players,
    coachProfile,
    userTeamId,
    nations,
    careerPhase,
    tournamentHonors,
    careerBoardReview,
    activeSeasonKey: providedSeasonKey,
    internationalSeries
  } = params;

  // Strict active league resolution (Requirement 3: Never blindly pick leagues[0])
  const candidateLeagues =
    Array.isArray(params.leagues) && params.leagues.length > 0
      ? params.leagues
      : params.league
      ? [params.league]
      : [];

  let resolvedLeague: League | undefined;
  if (typeof params.currentLeagueId === 'string' && params.currentLeagueId.trim().length > 0) {
    // Resolve the exact requested league ID strictly (fail safely if missing/invalid)
    resolvedLeague = candidateLeagues.find(l => l && l.id === params.currentLeagueId?.trim());
  } else if (params.league) {
    resolvedLeague = params.league;
  } else if (candidateLeagues.length > 0) {
    // Missing currentLeagueId: attempt explicit legacy-save recovery through existing recovery mechanism
    const recovery = resolveActiveLeagueForRecovery({
      leagues: candidateLeagues,
      currentLeagueId: params.currentLeagueId,
      coachProfile: coachProfile || INITIAL_COACH_PROFILE,
      careerBoardReview,
      internationalSeries
    });
    if (recovery.recoveredByPolicy && recovery.league) {
      resolvedLeague = recovery.league;
    }
  }

  if (!resolvedLeague) {
    // Fail safely without advancing leagues[0] or any other league
    const fallbackLeague = params.league || candidateLeagues[0] || ({} as League);
    return {
      advanced: false,
      blockedReason: 'invalid_or_unresolved_active_league',
      league: fallbackLeague,
      leagues: params.leagues,
      players,
      careerPhase,
      tournamentHonors,
      careerBoardReview,
      coachProfile,
      simulatedFixturesCount: 0
    };
  }

  const league = resolvedLeague;
  const currentLeagueId = league.id;

  const curDayIdx = league.currentDateIndex || 0;
  const curDayObj = Array.isArray(league.calendarDates) ? league.calendarDates[curDayIdx] : undefined;

  if (!curDayObj) {
    return {
      advanced: false,
      blockedReason: 'invalid_current_calendar_day',
      league,
      leagues: params.leagues,
      players,
      careerPhase,
      tournamentHonors,
      careerBoardReview,
      coachProfile,
      simulatedFixturesCount: 0
    };
  }

  // 1. Resolve active coaching mode
  const activeMode =
    coachProfile?.activeCareerMode ||
    (coachProfile?.nationalTeamId && !coachProfile?.clubTeamId ? 'international' : 'franchise');

  // 2. Check if current day has an uncompleted fixture the user is eligible to play
  if (activeMode === 'international') {
    // Check internationalMatches on current day
    const hasUncompletedUserIntl = (curDayObj.internationalMatches || []).some(
      im =>
        im &&
        !im.completed &&
        !(im.completedMatchState && im.completedMatchState.status === 'finished') &&
        isUserControlledInternationalFixture(im, coachProfile, nations)
    );
    // Check matchFixture if international
    const hasUncompletedUserMf = Boolean(
      curDayObj.matchFixture &&
      !curDayObj.matchFixture.completed &&
      !(curDayObj.matchFixture.completedMatchState && curDayObj.matchFixture.completedMatchState.status === 'finished') &&
      (curDayObj.type === 'international' || curDayObj.matchFixture.isInternational) &&
      isUserControlledInternationalFixture(curDayObj.matchFixture, coachProfile, nations)
    );

    if (hasUncompletedUserIntl || hasUncompletedUserMf) {
      return {
        advanced: false,
        blockedReason: 'user_international_fixture_pending',
        league,
        leagues: params.leagues,
        players,
        careerPhase,
        tournamentHonors,
        careerBoardReview,
        coachProfile,
        simulatedFixturesCount: 0
      };
    }
  } else {
    // Franchise mode: check if current day has an uncompleted user franchise fixture
    const myClubId = userTeamId || coachProfile?.clubTeamId;
    const mf = curDayObj.matchFixture;
    const isUserClubMatch = Boolean(
      mf &&
      ((mf as any).isUserMatch ||
        (myClubId && (mf.homeTeamId === myClubId || mf.awayTeamId === myClubId)) ||
        curDayObj.type === 'match')
    );
    const isUncompleted = Boolean(
      mf &&
      !mf.completed &&
      !(mf.completedMatchState && mf.completedMatchState.status === 'finished')
    );

    if (isUserClubMatch && isUncompleted) {
      return {
        advanced: false,
        blockedReason: 'user_franchise_fixture_pending',
        league,
        leagues: params.leagues,
        players,
        careerPhase,
        tournamentHonors,
        careerBoardReview,
        coachProfile,
        simulatedFixturesCount: 0
      };
    }
  }

  // 3. Not blocked: proceed to simulate AI matches on the current day
  let workingPlayers = [...players];
  const simulatedOtherMap = new Map<
    string,
    { summary: string; winnerId: string; loserId: string; nrrDelta: number; matchState: MatchLiveState }
  >();
  const simulatedIntlMap = new Map<string, { summary: string; matchState: MatchLiveState }>();

  const activeSeasonKey = providedSeasonKey || normalizeSeasonYear(league.seasonName || league.seasonYear);
  const allTeamsPool = [...teams, ...(league.teams || [])];

  // Simulate otherMatches (AI domestic fixtures)
  (curDayObj.otherMatches || []).forEach((om, omIdx) => {
    if (om.completed || (om.completedMatchState && om.completedMatchState.status === 'finished')) return;
    const homeTeamObj = allTeamsPool.find(t => t && t.id === om.homeTeamId) || allTeamsPool[0] || teams[0];
    const awayTeamObj = allTeamsPool.find(t => t && t.id === om.awayTeamId) || allTeamsPool[1] || teams[1];
    if (!homeTeamObj || !awayTeamObj || homeTeamObj.id === awayTeamObj.id) return;

    const simRes = simulateAiFixtureScorecard(
      om.id,
      homeTeamObj,
      awayTeamObj,
      om.venue || `${homeTeamObj.city} Stadium`,
      'T20',
      currentLeagueId,
      workingPlayers,
      curDayIdx * 17 + omIdx * 11 + 3
    );
    workingPlayers = applyMatchToPlayerList(workingPlayers, simRes.matchState, activeSeasonKey);
    simulatedOtherMap.set(om.id, simRes);
  });

  // Simulate internationalMatches (AI-only international fixtures)
  (curDayObj.internationalMatches || []).forEach((im, imIdx) => {
    if (im.completed || (im.completedMatchState && im.completedMatchState.status === 'finished')) return;
    // CRITICAL: Never simulate user-controlled international matches in background!
    if (isUserControlledInternationalFixture(im, coachProfile, nations)) return;

    const homeNatObj =
      resolveInternationalMatchParticipant(im.homeTeamId, nations) ||
      resolveInternationalMatchParticipant(im.homeTeamName, nations);
    const awayNatObj =
      resolveInternationalMatchParticipant(im.awayTeamId, nations) ||
      resolveInternationalMatchParticipant(im.awayTeamName, nations);
    if (!homeNatObj || !awayNatObj || homeNatObj.id === awayNatObj.id) return;

    const homeNat = buildTempNationalTeamFromPool(homeNatObj.id, nations, workingPlayers);
    const awayNat = buildTempNationalTeamFromPool(awayNatObj.id, nations, workingPlayers);
    if (!homeNat || !awayNat || homeNat.id === awayNat.id) return;

    const simRes = simulateAiFixtureScorecard(
      im.id,
      homeNat,
      awayNat,
      im.venue || `${homeNat.name} Stadium`,
      im.format || 'T20',
      'intl',
      workingPlayers,
      curDayIdx * 23 + imIdx * 13 + 7
    );
    workingPlayers = applyMatchToPlayerList(workingPlayers, simRes.matchState, activeSeasonKey);
    simulatedIntlMap.set(im.id, { summary: simRes.summary, matchState: simRes.matchState });
  });

  let updatedStandings = [...(league.standings || [])];

  const updatedCalendarDates = league.calendarDates.map((d, dIdx) => {
    if (dIdx !== curDayIdx || !d) return d;

    const nextOtherMatches = (d.otherMatches || []).map(om => {
      if (om.completed) return om;
      const simRes = simulatedOtherMap.get(om.id);
      if (!simRes) return om;

      updatedStandings = updatedStandings.map(st => {
        if (!simRes.winnerId && (st.teamId === om.homeTeamId || st.teamId === om.awayTeamId)) {
          if (st.played >= 18) return st;
          return {
            ...st,
            played: st.played + 1,
            tied: (st.tied || 0) + 1,
            points: st.points + 1,
            recentForm: ['T' as const, ...st.recentForm].slice(0, 5)
          };
        }
        if (st.teamId === simRes.winnerId) {
          if (st.played >= 18) return st;
          return {
            ...st,
            played: st.played + 1,
            won: st.won + 1,
            points: st.points + 2,
            nrr: Number((st.nrr + simRes.nrrDelta).toFixed(2)),
            recentForm: ['W' as const, ...st.recentForm].slice(0, 5)
          };
        }
        if (st.teamId === simRes.loserId) {
          if (st.played >= 18) return st;
          return {
            ...st,
            played: st.played + 1,
            lost: st.lost + 1,
            nrr: Number((st.nrr - simRes.nrrDelta).toFixed(2)),
            recentForm: ['L' as const, ...st.recentForm].slice(0, 5)
          };
        }
        return st;
      });

      return {
        ...om,
        completed: true,
        resultSummary: simRes.summary,
        completedMatchState: simRes.matchState
      };
    });

    const nextIntlMatches = (d.internationalMatches || []).map(im => {
      if (im.completed) return im;
      const simRes = simulatedIntlMap.get(im.id);
      if (!simRes) return im;
      return {
        ...im,
        completed: true,
        resultSummary: simRes.summary,
        completedMatchState: simRes.matchState
      };
    });

    const mfHomeNat = d.matchFixture
      ? resolveInternationalMatchParticipant(d.matchFixture.homeTeamId, nations) ||
        resolveInternationalMatchParticipant(d.matchFixture.homeTeamName, nations)
      : null;
    const mfAwayNat = d.matchFixture
      ? resolveInternationalMatchParticipant(d.matchFixture.awayTeamId, nations) ||
        resolveInternationalMatchParticipant(d.matchFixture.awayTeamName, nations)
      : null;
    const canCompleteMf =
      d.type === 'international' &&
      d.matchFixture &&
      !d.matchFixture.completed &&
      !(d.matchFixture.completedMatchState && d.matchFixture.completedMatchState.status === 'finished') &&
      !isUserControlledInternationalFixture(d.matchFixture, coachProfile, nations) &&
      Boolean(mfHomeNat && mfAwayNat && mfHomeNat.id !== mfAwayNat.id);

    const matchingSimulatedIntl = nextIntlMatches.find(im => im && im.id === d.matchFixture?.id && (im.completed || im.completedMatchState?.status === 'finished'));

    return {
      ...d,
      otherMatches: nextOtherMatches,
      internationalMatches: nextIntlMatches,
      matchFixture: canCompleteMf && d.matchFixture
        ? {
            ...d.matchFixture,
            completed: true,
            resultSummary: matchingSimulatedIntl?.resultSummary || nextIntlMatches[0]?.resultSummary || 'Match completed',
            completedMatchState: matchingSimulatedIntl?.completedMatchState || nextIntlMatches[0]?.completedMatchState
          }
        : d.matchFixture
    };
  });

  updatedStandings.sort((a, b) => b.points - a.points || b.nrr - a.nrr);
  const candidateLeagueAfterDay: League = {
    ...league,
    standings: updatedStandings,
    calendarDates: updatedCalendarDates
  };
  const leagueNowComplete = isDomesticLeagueStageComplete(candidateLeagueAfterDay);
  let effectivePhase: CareerPhase =
    leagueNowComplete && careerPhase === 'league_stage' ? 'playoffs' : careerPhase;
  const nextPlayoffs = leagueNowComplete
    ? seedQualifiedPlayoffsFromStandings(updatedStandings, league.playoffs)
    : league.playoffs;
  const syncedCalendarDates = nextPlayoffs
    ? syncPlayoffCalendarDates(updatedCalendarDates, nextPlayoffs, allTeamsPool)
    : updatedCalendarDates;
  const nextDayIdx = Math.min(syncedCalendarDates.length - 1, league.currentDateIndex + 1);

  const baseLeagueNext: League = {
    ...league,
    standings: updatedStandings,
    playoffs: nextPlayoffs,
    calendarDates: syncedCalendarDates,
    currentDateIndex: nextDayIdx
  };

  let workingPhase = effectivePhase;
  let workingHonors = tournamentHonors;
  let workingReview = careerBoardReview;
  let workingCoach = coachProfile;
  let finalLeague = baseLeagueNext;

  if (effectivePhase === 'playoffs') {
    const aiPlayoffRes = applyAdvanceAiPlayoffMatchesState({
      league: baseLeagueNext,
      teams,
      players: workingPlayers,
      coachProfile: coachProfile || INITIAL_COACH_PROFILE,
      careerPhase: effectivePhase,
      tournamentHonors,
      careerBoardReview
    });
    workingPlayers = aiPlayoffRes.players;
    workingPhase = aiPlayoffRes.careerPhase;
    workingReview = aiPlayoffRes.careerBoardReview;
    if (aiPlayoffRes.stagesSimulated.includes('final')) {
      workingHonors = aiPlayoffRes.tournamentHonors;
      workingCoach = aiPlayoffRes.coachProfile;
    }
    finalLeague = aiPlayoffRes.league;
  }

  const simulatedFixturesCount = simulatedOtherMap.size + simulatedIntlMap.size;

  const workingLeagues = params.leagues
    ? params.leagues.map(l => (l && l.id === finalLeague.id ? finalLeague : l))
    : undefined;

  return {
    advanced: true,
    league: finalLeague,
    leagues: workingLeagues,
    players: workingPlayers,
    careerPhase: workingPhase,
    tournamentHonors: workingHonors,
    careerBoardReview: workingReview,
    coachProfile: workingCoach,
    simulatedFixturesCount
  };
}

/**
 * Authoritative pure state transition for switching the active franchise club (`switchUserClub` / `selectUserTeam`).
 * Enforces the single-active-career invariant (`activeCareerMode: 'franchise'`, `nationalTeamId: null`),
 * updates `teams` (`isUserTeam`) and `nations` (`isUserManaging: false`), and preserves `clubStints` history.
 */
export function applySwitchUserClubState(
  state: {
    coachProfile: CoachProfile;
    teams: Team[];
    nations: Nation[];
    leagues: League[];
    currentLeagueId: string;
    careerPhase: CareerPhase;
  },
  newClubId: string
): {
  success: boolean;
  coachProfile: CoachProfile;
  teams: Team[];
  nations: Nation[];
  careerPhase: CareerPhase;
} {
  const { coachProfile, teams, nations, leagues, currentLeagueId, careerPhase } = state;
  const targetClub = Array.isArray(teams) ? teams.find(t => t && t.id === newClubId) : undefined;
  if (!targetClub) {
    return {
      success: false,
      coachProfile,
      teams,
      nations,
      careerPhase
    };
  }

  const updatedTeams = teams.map(t => ({
    ...t,
    isUserTeam: t.id === newClubId
  }));
  const updatedNations = Array.isArray(nations)
    ? nations.map(n => ({
        ...n,
        isUserManaging: false,
        isCoachedByPlayer: false
      }))
    : nations;

  const prevStints = Array.isArray(coachProfile.clubStints) ? coachProfile.clubStints : [];
  const activeLeague = Array.isArray(leagues)
    ? leagues.find(l => l && l.id === currentLeagueId) || leagues[0]
    : undefined;
  const currentYearStr = normalizeSeasonYear(activeLeague?.seasonName || activeLeague?.seasonYear);

  const updatedStints = [
    ...prevStints.map((s, idx) =>
      idx === prevStints.length - 1 && s.teamId !== newClubId && typeof s.period === 'string'
        ? { ...s, period: s.period.replace('–present', `–${currentYearStr}`) }
        : s
    ),
    ...(prevStints.some(s => s && s.teamId === newClubId && typeof s.period === 'string' && s.period.includes('present'))
      ? []
      : [
          {
            id: `stint_${newClubId}_${currentYearStr}`,
            teamId: newClubId,
            teamName: targetClub.city || targetClub.name,
            period: `${currentYearStr}–present`,
            seasons: 1,
            matches: 0,
            wins: 0,
            losses: 0,
            winPct: 0,
            titles: 0
          }
        ])
  ];

  const nextPhase: CareerPhase =
    careerPhase === 'international_squad_selection' || careerPhase === 'international_series'
      ? 'league_stage'
      : careerPhase;

  const inv = enforceSingleCareerInvariant(
    {
      ...coachProfile,
      activeCareerMode: 'franchise',
      clubTeamId: newClubId,
      nationalTeamId: null,
      clubStints: updatedStints
    },
    'franchise',
    nextPhase,
    updatedTeams,
    updatedNations
  );

  return {
    success: true,
    coachProfile: inv.coachProfile,
    teams: updatedTeams,
    nations: updatedNations,
    careerPhase: nextPhase
  };
}

/**
 * Authoritative pure state transition for accepting a club or international job offer (`acceptJobOffer`).
 * Enforces the single-active-career invariant so club offers clear `nationalTeamId` and international offers clear `clubTeamId`.
 */
export function applyAcceptJobOfferState(
  state: {
    coachProfile: CoachProfile;
    teams: Team[];
    nations: Nation[];
    players: Player[];
    leagues: League[];
    currentLeagueId: string;
    nationalSquadIds: string[];
    internationalSeries: InternationalSeriesState;
    careerPhase: CareerPhase;
  },
  offer: JobOffer
): {
  success: boolean;
  coachProfile: CoachProfile;
  teams: Team[];
  nations: Nation[];
  nationalSquadIds: string[];
  internationalSeries: InternationalSeriesState;
  careerPhase: CareerPhase;
  acceptedNation?: Nation;
} {
  const {
    coachProfile,
    teams,
    nations,
    players,
    leagues,
    currentLeagueId,
    nationalSquadIds,
    internationalSeries,
    careerPhase
  } = state;

  if (!offer || typeof offer !== 'object') {
    return {
      success: false,
      coachProfile,
      teams,
      nations,
      nationalSquadIds,
      internationalSeries,
      careerPhase
    };
  }

  if (offer.type === 'club') {
    const offerNameLower = (offer.name || '').trim().toLowerCase();
    const newTeam = teams.find(
      t =>
        t &&
        (t.id === offer.id ||
          (offerNameLower.length > 0 &&
            (t.name.toLowerCase().includes(offerNameLower) ||
              offerNameLower.includes(t.name.toLowerCase()))))
    );
    if (!newTeam) {
      return {
        success: false,
        coachProfile,
        teams,
        nations,
        nationalSquadIds,
        internationalSeries,
        careerPhase
      };
    }

    const clubRes = applySwitchUserClubState(
      {
        coachProfile,
        teams,
        nations,
        leagues,
        currentLeagueId,
        careerPhase
      },
      newTeam.id
    );

    return {
      success: clubRes.success,
      coachProfile: clubRes.coachProfile,
      teams: clubRes.teams,
      nations: clubRes.nations,
      nationalSquadIds,
      internationalSeries,
      careerPhase: clubRes.careerPhase
    };
  }

  const offerNameLower = (offer.name || '').trim().toLowerCase();
  const nation =
    resolveInternationalMatchParticipant(offer.id, nations) ||
    resolveInternationalMatchParticipant(offer.name, nations) ||
    nations.find(
      n =>
        n &&
        offerNameLower.length > 0 &&
        (offerNameLower.includes(n.name.toLowerCase()) ||
          n.name.toLowerCase().includes(offerNameLower))
    );

  if (!nation) {
    return {
      success: false,
      coachProfile,
      teams,
      nations,
      nationalSquadIds,
      internationalSeries,
      careerPhase
    };
  }

  const activeLeague = Array.isArray(leagues)
    ? leagues.find(l => l && l.id === currentLeagueId) || leagues[0]
    : undefined;
  const currentYearStr = normalizeSeasonYear(activeLeague?.seasonName || activeLeague?.seasonYear);
  const closedStints = Array.isArray(coachProfile.clubStints)
    ? coachProfile.clubStints.map((s, idx, arr) =>
        idx === arr.length - 1 && typeof s.period === 'string' && s.period.includes('present')
          ? { ...s, period: s.period.replace('–present', `–${currentYearStr}`) }
          : s
      )
    : [];

  const updatedTeams = teams.map(t => ({
    ...t,
    isUserTeam: false
  }));
  const updatedNations = nations.map(n => ({
    ...n,
    isUserManaging: n.id === nation.id
  }));

  const natPlayers = players
    .filter(p => p && typeof p.country === 'string' && p.country.trim().toLowerCase() === nation.name.trim().toLowerCase())
    .slice(0, 15)
    .map(p => p.id);

  const existingIds = [
    ...(coachProfile.completedInternationalSeriesIds || []),
    ...(internationalSeries?.seriesId ? [internationalSeries.seriesId] : [])
  ];
  const nextSeries =
    internationalSeries &&
    internationalSeries.userNationId === nation.id &&
    Boolean(internationalSeries.seriesId) &&
    Array.isArray(internationalSeries.matches) &&
    internationalSeries.matches.some(m => !m.completed)
      ? internationalSeries
      : buildInitialSeriesForNation(
          nation,
          updatedNations,
          undefined,
          (coachProfile.completedInternationalSeriesIds?.length || 0) + 1,
          undefined,
          existingIds
        );

  const inv = enforceSingleCareerInvariant(
    {
      ...coachProfile,
      activeCareerMode: 'international',
      nationalTeamId: nation.id,
      clubTeamId: null as unknown as string,
      clubStints: closedStints
    },
    'international',
    'international_squad_selection',
    updatedTeams,
    updatedNations
  );

  return {
    success: true,
    coachProfile: inv.coachProfile,
    teams: updatedTeams,
    nations: updatedNations,
    nationalSquadIds: natPlayers,
    internationalSeries: nextSeries,
    careerPhase: 'international_squad_selection',
    acceptedNation: nation
  };
}

/**
 * Authoritative pure state transition for resigning a national coaching job (`resignNationalJob`),
 * deterministically restoring a valid franchise club career under the single-active-career invariant.
 */
export function applyResignNationalJobState(state: {
  coachProfile: CoachProfile;
  teams: Team[];
  nations: Nation[];
  careerPhase: CareerPhase;
}): {
  coachProfile: CoachProfile;
  teams: Team[];
  nations: Nation[];
  careerPhase: CareerPhase;
} {
  const { coachProfile, teams, nations, careerPhase } = state;
  const updatedNations = nations.map(n => ({
    ...n,
    isUserManaging: false,
    isCoachedByPlayer: false
  }));
  const inv = enforceSingleCareerInvariant(
    {
      ...coachProfile,
      activeCareerMode: 'franchise',
      nationalTeamId: null
    },
    'franchise',
    'league_stage',
    teams,
    updatedNations
  );
  const resolvedClubId = inv.coachProfile.clubTeamId;
  const updatedTeams = teams.map(t => ({
    ...t,
    isUserTeam: t.id === resolvedClubId
  }));
  const nextPhase: CareerPhase =
    careerPhase === 'international_squad_selection' || careerPhase === 'international_series'
      ? 'league_stage'
      : careerPhase;

  return {
    coachProfile: inv.coachProfile,
    teams: updatedTeams,
    nations: updatedNations,
    careerPhase: nextPhase
  };
}

/**
 * Authoritative pure state transition for advancing the calendar to the user nation's next international tour.
 * - Uses proper UTC date arithmetic anchored to the current/latest calendar date (never hardcodes June 2026).
 * - Reuses existing valid future tours when present on the calendar.
 * - Preserves unfinished internationalSeries without overwriting or duplicating fixtures.
 * - Distinguishes between valid matching fixtures, placeholder entries without fixtures, malformed/conflicting fixtures, and completed fixtures.
 * - Repairs placeholder calendar entries in-place while preserving valid calendar dates.
 * - Fails safely without overwriting unrelated match data when a conflicting/malformed fixture occupies an expected slot.
 * - Reconciles completed calendar fixtures with active series matches so completed fixtures are never reset or left incomplete.
 * - Processes intervening calendar fixtures in chronological order and at most once.
 * - Never skips a playable fixture involving the user's coached nation.
 * - Fails safely without mutating state if not in international mode or if no valid tour can be scheduled.
 */
export function applyAdvanceCalendarToNextTourState(
  state: {
    coachProfile: CoachProfile;
    nations: Nation[];
    leagues: League[];
    currentLeagueId: string;
    players: Player[];
    teams: Team[];
    internationalSeries: InternationalSeriesState | null | undefined;
    completedMatchesHistory?: CompletedMatchRecord[];
    careerPhase: CareerPhase;
  },
  options?: {
    allowGenerateNewTour?: boolean;
    preferredOpponentId?: string;
  }
): {
  success: boolean;
  message: string;
  daysAdvanced: number;
  targetDateIndex: number;
  generatedNewTour: boolean;
  simulatedFixtureIds: string[];
  processedInterveningFixtureIds: string[];
  coachProfile: CoachProfile;
  leagues: League[];
  players: Player[];
  teams: Team[];
  internationalSeries: InternationalSeriesState;
  completedMatchesHistory: CompletedMatchRecord[];
  careerPhase: CareerPhase;
} {
  const {
    coachProfile,
    nations,
    leagues,
    currentLeagueId,
    players,
    teams,
    internationalSeries,
    completedMatchesHistory = [],
    careerPhase
  } = state;

  const fallbackSeries: InternationalSeriesState = internationalSeries || {
    seriesId: '',
    userNationId: '',
    userNationName: '',
    userNationCode: '',
    userNationFlag: '🏏',
    opponentNationId: '',
    opponentNationName: '',
    opponentNationCode: '',
    opponentNationFlag: '🏏',
    seriesWins: 0,
    seriesLosses: 0,
    matches: []
  };

  const unchanged = (message: string) => ({
    success: false,
    message,
    daysAdvanced: 0,
    targetDateIndex: 0,
    generatedNewTour: false,
    simulatedFixtureIds: [] as string[],
    processedInterveningFixtureIds: [] as string[],
    coachProfile,
    leagues,
    players,
    teams,
    internationalSeries: fallbackSeries,
    completedMatchesHistory,
    careerPhase
  });

  if (
    !coachProfile ||
    coachProfile.activeCareerMode !== 'international' ||
    !coachProfile.nationalTeamId
  ) {
    return unchanged('Not currently in International Career Mode.');
  }

  if (!Array.isArray(nations) || nations.length === 0) {
    return unchanged('Nations dataset is empty.');
  }

  // Strictly resolve coached nation without falling back to nations[0]
  const userNat = nations.find(
    n =>
      n &&
      (n.id === coachProfile.nationalTeamId ||
        n.name.trim().toLowerCase() === String(coachProfile.nationalTeamId).trim().toLowerCase())
  );
  if (!userNat) {
    return unchanged(`Coached nation "${coachProfile.nationalTeamId}" was not found.`);
  }

  if (!Array.isArray(leagues) || leagues.length === 0) {
    return unchanged('No leagues available in career state.');
  }

  if (typeof currentLeagueId !== 'string' || currentLeagueId.trim().length === 0) {
    return unchanged('Missing or invalid currentLeagueId for international tour scheduling.');
  }

  const requestedLeagueId = currentLeagueId.trim();
  const activeLeague = leagues.find(
    (l): l is League =>
      Boolean(l && typeof l === 'object' && typeof l.id === 'string' && l.id.trim() === requestedLeagueId)
  );
  if (!activeLeague) {
    return unchanged(`Active league "${currentLeagueId}" was not found.`);
  }
  if (!Array.isArray(activeLeague.calendarDates) || !Array.isArray(activeLeague.standings)) {
    return unchanged(`Active league "${activeLeague.id}" has a missing or malformed calendar or standings array.`);
  }

  const enforcedCoachProfile = enforceSingleCareerInvariant(
    coachProfile,
    'international',
    careerPhase,
    teams,
    nations
  ).coachProfile;

  const userNatNameLower = userNat.name.trim().toLowerCase();
  const userNatCodeLower = (userNat.code || userNat.name.slice(0, 3)).trim().toLowerCase();

  const doesFixtureInvolveUserNat = (
    m: League['calendarDates'][number]['matchFixture'] | undefined | null
  ): boolean => {
    if (!m) return false;
    return isUserControlledInternationalFixture(m, enforcedCoachProfile, nations);
  };

  const getDayIntlFixtures = (cd: League['calendarDates'][number] | undefined) => {
    if (!cd) return [];
    if (Array.isArray(cd.internationalMatches) && cd.internationalMatches.length > 0) {
      return cd.internationalMatches;
    }
    if (cd.matchFixture && (cd.matchFixture.isInternational || cd.type === 'international')) {
      return [cd.matchFixture];
    }
    return [];
  };

  const hasUncompletedUserMatchOnDay = (cd: League['calendarDates'][number] | undefined): boolean => {
    const intlList = getDayIntlFixtures(cd);
    return intlList.some(m => m && !m.completed && doesFixtureInvolveUserNat(m));
  };

  let workingDates: League['calendarDates'] = activeLeague.calendarDates.map(cd => ({
    ...cd,
    matchFixture: cd.matchFixture ? { ...cd.matchFixture } : undefined,
    otherMatches: Array.isArray(cd.otherMatches) ? cd.otherMatches.map(om => ({ ...om })) : [],
    internationalMatches: Array.isArray(cd.internationalMatches)
      ? cd.internationalMatches.map(im => ({ ...im }))
      : []
  }));

  const startIdx = Math.max(
    0,
    Math.min(activeLeague.currentDateIndex || 0, Math.max(0, workingDates.length - 1))
  );

  let workingSeries: InternationalSeriesState | null =
    internationalSeries && typeof internationalSeries === 'object'
      ? {
          ...internationalSeries,
          matches: Array.isArray(internationalSeries.matches)
            ? internationalSeries.matches.map(m => ({ ...m }))
            : []
        }
      : null;

  let updatedCompletedIds = Array.isArray(enforcedCoachProfile.completedInternationalSeriesIds)
    ? [...enforcedCoachProfile.completedInternationalSeriesIds]
    : [];

  const seasonYearNum =
    Number(activeLeague.seasonYear) ||
    parseInt(normalizeSeasonYear(activeLeague.seasonName), 10) ||
    2026;

  // Compute the latest valid calendar date anchor
  const getCalendarEndAnchorUtc = (): Date => {
    if (workingDates.length === 0) {
      return new Date(Date.UTC(seasonYearNum, 2, 20));
    }
    let latestUtc: Date | null = null;
    for (const d of workingDates) {
      if (!d) continue;
      const hasValidIso = isValidIsoCalendarDate(d.dateStr);
      const hasValidMonthDay =
        (!d.dateStr || d.dateStr.trim().length === 0) &&
        typeof d.month === 'string' &&
        typeof d.dayNumber === 'number' &&
        d.dayNumber >= 1 &&
        d.dayNumber <= 31 &&
        CALENDAR_MONTH_NAMES.some(m => m.toLowerCase() === d.month.trim().slice(0, 3).toLowerCase());
      if (!hasValidIso && !hasValidMonthDay) continue;
      const parsed = parseCalendarDateToUtc(d, seasonYearNum);
      if (!latestUtc || parsed.getTime() > latestUtc.getTime()) {
        latestUtc = parsed;
      }
    }
    return latestUtc || new Date(Date.UTC(seasonYearNum, 2, 20));
  };

  let statusMessage = '';
  let generatedNewTour = false;
  let targetIdx = -1;

  // Check if workingSeries belongs to userNat and has a valid seriesId
  const seriesBelongsToUserNat = Boolean(
    workingSeries &&
      typeof workingSeries.seriesId === 'string' &&
      workingSeries.seriesId.trim().length > 0 &&
      Array.isArray(workingSeries.matches) &&
      workingSeries.matches.length > 0 &&
      (workingSeries.userNationId === userNat.id ||
        (typeof workingSeries.userNationName === 'string' &&
          workingSeries.userNationName.trim().toLowerCase() === userNatNameLower))
  );

  const seriesOppNat =
    seriesBelongsToUserNat && workingSeries
      ? nations.find(
          n =>
            n &&
            n.id !== userNat.id &&
            (n.id === workingSeries!.opponentNationId ||
              (typeof workingSeries!.opponentNationName === 'string' &&
                n.name.trim().toLowerCase() === workingSeries!.opponentNationName.trim().toLowerCase()))
        )
      : undefined;

  if (seriesBelongsToUserNat && !seriesOppNat) {
    return unchanged('Active international series has an invalid or conflicting opponent nation.');
  }

  // Classify a calendar entry relative to an expected series match:
  // - 'valid_matching': valid uncompleted matching fixture
  // - 'placeholder': placeholder entry with expectedCalId but no fixture
  // - 'conflicting_or_malformed': malformed fixture or conflicting fixture (wrong ID, wrong nations, wrong format, non-international, contradictory results)
  // - 'completed': legitimately completed matching fixture (in series, calendar, or both)
  // - 'missing': no entry with expectedCalId or expectedFixId exists on calendar
  const classifySeriesCalendarMatch = (
    m: InternationalSeriesMatch,
    series: InternationalSeriesState,
    oppNat: Nation,
    dates: League['calendarDates']
  ):
    | { status: 'conflicting_or_malformed'; reason: string }
    | { status: 'placeholder'; calIndex: number }
    | { status: 'valid_matching'; calIndex: number; fixture: CalendarMatchFixture }
    | { status: 'completed'; calIndex: number; fixture: CalendarMatchFixture }
    | { status: 'missing'; calIndex: -1 } => {
    const cleanSeriesId = series.seriesId.trim();
    const expectedFixId =
      typeof m.fixtureId === 'string' && m.fixtureId.trim().length > 0
        ? m.fixtureId.trim()
        : `intl_fix_${cleanSeriesId}_${m.matchNumber}`;
    const expectedCalId = `cal_intl_${cleanSeriesId}_${m.matchNumber}`;
    const expectedHomeId = userNat.id;
    const expectedAwayId = oppNat.id;
    const expectedFormat: 'T20' | 'ODI' | 'TEST' = m.format || series.format || 'T20';
    const expectedSeriesName = `${userNat.name} Tour of ${oppNat.name}`;

    if (
      (m.homeNationId && m.homeNationId.trim() !== expectedHomeId) ||
      (m.awayNationId && m.awayNationId.trim() !== expectedAwayId) ||
      (m.homeTeamId && m.homeTeamId.trim() !== expectedHomeId) ||
      (m.awayTeamId && m.awayTeamId.trim() !== expectedAwayId)
    ) {
      return {
        status: 'conflicting_or_malformed',
        reason: `Series match #${m.matchNumber} has conflicting participant nation IDs.`
      };
    }

    const calIdIndices: number[] = [];
    const fixIdIndices: number[] = [];
    for (let idx = 0; idx < dates.length; idx++) {
      const d = dates[idx];
      if (!d) continue;
      if (d.id === expectedCalId) {
        calIdIndices.push(idx);
      }
      if (
        d.matchFixture?.id === expectedFixId ||
        (Array.isArray(d.internationalMatches) &&
          d.internationalMatches.some(im => Boolean(im && im.id === expectedFixId))) ||
        (Array.isArray(d.otherMatches) &&
          d.otherMatches.some(om => Boolean(om && om.id === expectedFixId)))
      ) {
        fixIdIndices.push(idx);
      }
    }

    if (calIdIndices.length > 1 || fixIdIndices.length > 1) {
      return {
        status: 'conflicting_or_malformed',
        reason: `Duplicate calendar entries found for ${expectedCalId} / ${expectedFixId}.`
      };
    }

    if (calIdIndices.length === 1 && fixIdIndices.length === 1 && calIdIndices[0] !== fixIdIndices[0]) {
      return {
        status: 'conflicting_or_malformed',
        reason: `Calendar entry "${expectedCalId}" and fixture "${expectedFixId}" point to conflicting calendar dates.`
      };
    }

    if (calIdIndices.length === 0 && fixIdIndices.length === 0) {
      return { status: 'missing', calIndex: -1 };
    }

    const calIndex = calIdIndices.length === 1 ? calIdIndices[0] : fixIdIndices[0];
    const cd = dates[calIndex];

    if (cd.id && cd.id !== expectedCalId) {
      if (cd.id.startsWith('cal_playoff_') || cd.id.startsWith(`cal_intl_${cleanSeriesId}_`)) {
        return {
          status: 'conflicting_or_malformed',
          reason: `Fixture "${expectedFixId}" is attached to conflicting calendar entry "${cd.id}".`
        };
      }
    }

    const otherList = Array.isArray(cd.otherMatches) ? cd.otherMatches.filter(Boolean) : [];
    if (otherList.some(om => om.id === expectedFixId)) {
      return {
        status: 'conflicting_or_malformed',
        reason: `International fixture "${expectedFixId}" is malformed inside domestic otherMatches.`
      };
    }

    const rawPrimary = cd.matchFixture;
    const isPrimaryEmptyStub = Boolean(
      rawPrimary &&
        typeof rawPrimary === 'object' &&
        !rawPrimary.id &&
        !rawPrimary.homeTeamId &&
        !rawPrimary.awayTeamId &&
        !rawPrimary.completed &&
        !rawPrimary.resultSummary
    );
    const primaryFix = isPrimaryEmptyStub ? undefined : rawPrimary;
    const intlList = Array.isArray(cd.internationalMatches)
      ? cd.internationalMatches.filter(im =>
          Boolean(im && (im.id || im.homeTeamId || im.awayTeamId || im.completed || im.resultSummary))
        )
      : [];

    // 1. Placeholder calendar entry without a fixture
    if (!primaryFix && intlList.length === 0) {
      if (otherList.length > 0 || cd.type === 'playoff' || cd.type === 'match') {
        return {
          status: 'conflicting_or_malformed',
          reason: `Calendar entry "${expectedCalId}" is occupied by non-international match data.`
        };
      }
      return { status: 'placeholder', calIndex };
    }

    // 2. Entry has a fixture; validate against malformation and conflicts
    if (cd.type === 'playoff' || cd.type === 'match') {
      return {
        status: 'conflicting_or_malformed',
        reason: `Calendar entry "${cd.id || expectedCalId}" has conflicting domestic/playoff type "${cd.type}".`
      };
    }

    if (intlList.length > 1) {
      return {
        status: 'conflicting_or_malformed',
        reason: `Calendar entry "${cd.id || expectedCalId}" contains multiple conflicting international fixtures.`
      };
    }

    if (primaryFix && intlList.length === 1) {
      const im0 = intlList[0];
      if (
        (primaryFix.id && im0.id && primaryFix.id.trim() !== im0.id.trim()) ||
        (primaryFix.homeTeamId && im0.homeTeamId && primaryFix.homeTeamId.trim() !== im0.homeTeamId.trim()) ||
        (primaryFix.awayTeamId && im0.awayTeamId && primaryFix.awayTeamId.trim() !== im0.awayTeamId.trim()) ||
        (Boolean(primaryFix.completed) === Boolean(im0.completed) &&
          primaryFix.resultSummary &&
          im0.resultSummary &&
          primaryFix.resultSummary.trim() !== im0.resultSummary.trim())
      ) {
        return {
          status: 'conflicting_or_malformed',
          reason: `Calendar entry "${cd.id || expectedCalId}" has conflicting matchFixture and internationalMatches data.`
        };
      }
    }

    const fix = primaryFix || intlList[0];
    if (
      !fix ||
      typeof fix !== 'object' ||
      typeof fix.id !== 'string' ||
      fix.id.trim().length === 0 ||
      typeof fix.homeTeamId !== 'string' ||
      fix.homeTeamId.trim().length === 0 ||
      typeof fix.awayTeamId !== 'string' ||
      fix.awayTeamId.trim().length === 0 ||
      fix.homeTeamId.trim().toLowerCase() === fix.awayTeamId.trim().toLowerCase()
    ) {
      return {
        status: 'conflicting_or_malformed',
        reason: `Malformed fixture at calendar entry "${cd.id || expectedCalId}".`
      };
    }

    if (fix.id.trim() !== expectedFixId) {
      return {
        status: 'conflicting_or_malformed',
        reason: `Conflicting fixture ID "${fix.id}" occupies calendar entry "${cd.id || expectedCalId}" (expected "${expectedFixId}").`
      };
    }

    const homeMatches =
      fix.homeTeamId.trim() === expectedHomeId ||
      fix.homeTeamId.trim().toLowerCase() === userNatNameLower;
    const awayMatches =
      fix.awayTeamId.trim() === expectedAwayId ||
      fix.awayTeamId.trim().toLowerCase() === oppNat.name.trim().toLowerCase();

    if (!homeMatches || !awayMatches) {
      return {
        status: 'conflicting_or_malformed',
        reason: `Conflicting fixture participants (${fix.homeTeamId} vs ${fix.awayTeamId}) at "${cd.id || expectedCalId}" (expected ${expectedHomeId} vs ${expectedAwayId}).`
      };
    }

    if (fix.isInternational === false) {
      return {
        status: 'conflicting_or_malformed',
        reason: `Fixture "${fix.id}" is marked non-international.`
      };
    }

    if (typeof fix.seriesName === 'string' && fix.seriesName.trim().length > 0) {
      const sLower = fix.seriesName.trim().toLowerCase();
      const uLower = userNatNameLower;
      const oLower = oppNat.name.trim().toLowerCase();
      if (
        sLower !== expectedSeriesName.trim().toLowerCase() &&
        !(sLower.includes(uLower) && sLower.includes(oLower))
      ) {
        return {
          status: 'conflicting_or_malformed',
          reason: `Conflicting series identity "${fix.seriesName}" on fixture "${fix.id}" (expected "${expectedSeriesName}").`
        };
      }
    }

    if (fix.format !== undefined) {
      if (fix.format !== 'T20' && fix.format !== 'ODI' && fix.format !== 'TEST') {
        return {
          status: 'conflicting_or_malformed',
          reason: `Malformed format "${String(fix.format)}" on fixture "${fix.id}".`
        };
      }
      if ((m.format || series.format) && fix.format !== expectedFormat) {
        return {
          status: 'conflicting_or_malformed',
          reason: `Conflicting format "${fix.format}" on fixture "${fix.id}" (expected "${expectedFormat}").`
        };
      }
    }

    if (typeof cd.dateStr === 'string' && cd.dateStr.trim().length > 0 && !isValidIsoCalendarDate(cd.dateStr)) {
      return {
        status: 'conflicting_or_malformed',
        reason: `Malformed calendar date "${cd.dateStr}" on fixture "${fix.id}".`
      };
    }
    if (typeof fix.dateStr === 'string' && fix.dateStr.trim().length > 0 && !isValidIsoCalendarDate(fix.dateStr)) {
      return {
        status: 'conflicting_or_malformed',
        reason: `Malformed fixture date "${fix.dateStr}" on fixture "${fix.id}".`
      };
    }
    if (
      isValidIsoCalendarDate(cd.dateStr) &&
      isValidIsoCalendarDate(fix.dateStr) &&
      cd.dateStr.trim() !== fix.dateStr.trim()
    ) {
      return {
        status: 'conflicting_or_malformed',
        reason: `Conflicting dates between calendar entry (${cd.dateStr}) and fixture (${fix.dateStr}) for "${fix.id}".`
      };
    }
    if (
      isValidIsoCalendarDate(m.dateStr) &&
      isValidIsoCalendarDate(cd.dateStr) &&
      m.dateStr.trim() !== cd.dateStr.trim()
    ) {
      return {
        status: 'conflicting_or_malformed',
        reason: `Conflicting dates between series match (${m.dateStr}) and calendar entry (${cd.dateStr}) for "${fix.id}".`
      };
    }

    const seriesDone = Boolean(m.completed);
    const calDone = Boolean(fix.completed || (intlList[0] && intlList[0].completed));
    const seriesSum = typeof m.summary === 'string' && m.summary.trim().length > 0 ? m.summary.trim() : undefined;
    const calSum =
      typeof fix.resultSummary === 'string' && fix.resultSummary.trim().length > 0
        ? fix.resultSummary.trim()
        : intlList[0] && typeof intlList[0].resultSummary === 'string' && intlList[0].resultSummary.trim().length > 0
        ? intlList[0].resultSummary.trim()
        : undefined;

    if (seriesDone && calDone && seriesSum && calSum && seriesSum !== calSum) {
      return {
        status: 'conflicting_or_malformed',
        reason: `Conflicting completed result summaries for fixture "${fix.id}".`
      };
    }

    if (seriesDone || calDone) {
      return { status: 'completed', calIndex, fixture: fix };
    }

    return { status: 'valid_matching', calIndex, fixture: fix };
  };

  const inferSeriesOutcomeDelta = (
    fix: CalendarMatchFixture,
    summaryText: string | undefined,
    uNat: Nation,
    oNat: Nation
  ): { userWon: boolean; oppWon: boolean } => {
    const winnerId = fix.completedMatchState?.winnerTeamId;
    if (winnerId) {
      if (winnerId === uNat.id || winnerId.toLowerCase() === uNat.name.trim().toLowerCase()) {
        return { userWon: true, oppWon: false };
      }
      if (winnerId === oNat.id || winnerId.toLowerCase() === oNat.name.trim().toLowerCase()) {
        return { userWon: false, oppWon: true };
      }
    }
    if (!summaryText) return { userWon: false, oppWon: false };
    const s = summaryText.toLowerCase();
    const uName = uNat.name.trim().toLowerCase();
    const uCode = (uNat.code || uNat.name.slice(0, 3)).trim().toLowerCase();
    const oName = oNat.name.trim().toLowerCase();
    const oCode = (oNat.code || oNat.name.slice(0, 3)).trim().toLowerCase();

    if (s.includes(`${uName} won`) || s.includes(`${uCode} won`)) {
      return { userWon: true, oppWon: false };
    }
    if (s.includes(`${oName} won`) || s.includes(`${oCode} won`)) {
      return { userWon: false, oppWon: true };
    }
    const beatIdx = s.indexOf('beat');
    if (beatIdx > 0) {
      const beforeBeat = s.slice(0, beatIdx);
      if (beforeBeat.includes(uName) || beforeBeat.includes(uCode)) {
        return { userWon: true, oppWon: false };
      }
      if (beforeBeat.includes(oName) || beforeBeat.includes(oCode)) {
        return { userWon: false, oppWon: true };
      }
    }
    return { userWon: false, oppWon: false };
  };

  let wasSeriesAlreadyCompleteOnEntry = true;
  let lastReconciledSeriesCalIdx = -1;

  // 1. Reconcile active/provided workingSeries against workingDates first
  if (seriesBelongsToUserNat && workingSeries && seriesOppNat) {
    wasSeriesAlreadyCompleteOnEntry = workingSeries.matches.every(m => Boolean(m && m.completed));
    const cleanSeriesId = workingSeries.seriesId.trim();
    const uCode = workingSeries.userNationCode || userNat.code || userNat.name.slice(0, 3).toUpperCase();
    const oCode = workingSeries.opponentNationCode || seriesOppNat.code || seriesOppNat.name.slice(0, 3).toUpperCase();
    const uFlag = workingSeries.userNationFlag || userNat.flag || '🏏';
    const oFlag = workingSeries.opponentNationFlag || seriesOppNat.flag || '🏏';
    const expectedSeriesName = `${userNat.name} Tour of ${seriesOppNat.name}`;

    let runningAnchorUtc = getCalendarEndAnchorUtc();
    const newCalendarEntries: League['calendarDates'] = [];
    const updatedSeriesMatches: InternationalSeriesMatch[] = [];
    let addedWins = 0;
    let addedLosses = 0;
    let repairedOrScheduledCount = 0;

    for (let mIdx = 0; mIdx < workingSeries.matches.length; mIdx++) {
      const m = workingSeries.matches[mIdx];
      const classification = classifySeriesCalendarMatch(m, workingSeries, seriesOppNat, workingDates);

      if (classification.status === 'conflicting_or_malformed') {
        return unchanged(classification.reason);
      }

      const expectedFixId =
        typeof m.fixtureId === 'string' && m.fixtureId.trim().length > 0
          ? m.fixtureId.trim()
          : `intl_fix_${cleanSeriesId}_${m.matchNumber}`;
      const expectedCalId = `cal_intl_${cleanSeriesId}_${m.matchNumber}`;
      const matchFormat: 'T20' | 'ODI' | 'TEST' = m.format || workingSeries.format || 'T20';
      const ordinal =
        m.matchNumber === 1 ? '1st' : m.matchNumber === 2 ? '2nd' : m.matchNumber === 3 ? '3rd' : `${m.matchNumber}th`;
      const defaultTitle = `${ordinal} ${matchFormat}I · ${uCode} vs ${oCode}`;

      if (classification.status === 'placeholder') {
        const calIdx = classification.calIndex;
        const cd = workingDates[calIdx];
        let dateMeta: ReturnType<typeof addUtcDaysToCalendarDate>;

        if (isValidIsoCalendarDate(cd.dateStr)) {
          dateMeta = addUtcDaysToCalendarDate(parseCalendarDateToUtc(cd.dateStr, seasonYearNum), 0);
        } else if (isValidIsoCalendarDate(m.dateStr)) {
          dateMeta = addUtcDaysToCalendarDate(parseCalendarDateToUtc(m.dateStr, seasonYearNum), 0);
        } else {
          let fallbackBaseUtc = runningAnchorUtc;
          if (calIdx > 0 && isValidIsoCalendarDate(workingDates[calIdx - 1]?.dateStr)) {
            fallbackBaseUtc = parseCalendarDateToUtc(workingDates[calIdx - 1], seasonYearNum);
          }
          dateMeta = addUtcDaysToCalendarDate(fallbackBaseUtc, 2);
        }

        if (dateMeta.utcDate.getTime() > runningAnchorUtc.getTime()) {
          runningAnchorUtc = dateMeta.utcDate;
        }

        const isCompleted = Boolean(m.completed);
        const resolvedSummary = isCompleted ? m.summary || 'Match completed' : undefined;
        const intlFix: CalendarMatchFixture = {
          id: expectedFixId,
          homeTeamId: userNat.id,
          awayTeamId: seriesOppNat.id,
          homeTeamName: userNat.name,
          awayTeamName: seriesOppNat.name,
          homeShortName: uCode,
          awayShortName: oCode,
          homeLogo: uFlag,
          awayLogo: oFlag,
          venue: m.venue,
          dateStr: dateMeta.dateStr,
          timeStr: '14:00 LOCAL',
          completed: isCompleted,
          resultSummary: resolvedSummary,
          isInternational: true,
          seriesName: expectedSeriesName,
          format: matchFormat
        };

        workingDates[calIdx] = {
          ...cd,
          id: expectedCalId,
          dateStr: dateMeta.dateStr,
          dayOfWeek: dateMeta.dayOfWeek,
          dayNumber: dateMeta.dayNumber,
          month: dateMeta.month,
          type: 'international',
          title: cd.title && cd.title.trim().length > 0 ? cd.title : defaultTitle,
          isHome: false,
          matchFixture: intlFix,
          otherMatches: [],
          internationalMatches: [intlFix]
        };

        updatedSeriesMatches.push({
          ...m,
          fixtureId: expectedFixId,
          dateStr: dateMeta.dateStr,
          format: matchFormat,
          homeNationId: userNat.id,
          awayNationId: seriesOppNat.id,
          homeTeamId: userNat.id,
          awayTeamId: seriesOppNat.id,
          completed: isCompleted,
          summary: resolvedSummary
        });

        lastReconciledSeriesCalIdx = calIdx;
        repairedOrScheduledCount++;
      } else if (classification.status === 'valid_matching') {
        const calIdx = classification.calIndex;
        const cd = workingDates[calIdx];
        const fix = classification.fixture;
        const resolvedFormat: 'T20' | 'ODI' | 'TEST' = fix.format || matchFormat;
        const resolvedVenue = m.venue || fix.venue;

        const dateMeta = isValidIsoCalendarDate(cd.dateStr)
          ? addUtcDaysToCalendarDate(parseCalendarDateToUtc(cd.dateStr, seasonYearNum), 0)
          : isValidIsoCalendarDate(m.dateStr)
          ? addUtcDaysToCalendarDate(parseCalendarDateToUtc(m.dateStr, seasonYearNum), 0)
          : addUtcDaysToCalendarDate(runningAnchorUtc, 2);

        if (dateMeta.utcDate.getTime() > runningAnchorUtc.getTime()) {
          runningAnchorUtc = dateMeta.utcDate;
        }

        const syncedFix: CalendarMatchFixture = {
          ...fix,
          id: expectedFixId,
          homeTeamId: userNat.id,
          awayTeamId: seriesOppNat.id,
          homeTeamName: fix.homeTeamName || userNat.name,
          awayTeamName: fix.awayTeamName || seriesOppNat.name,
          homeShortName: fix.homeShortName || uCode,
          awayShortName: fix.awayShortName || oCode,
          homeLogo: fix.homeLogo || uFlag,
          awayLogo: fix.awayLogo || oFlag,
          venue: resolvedVenue,
          dateStr: dateMeta.dateStr,
          timeStr: fix.timeStr || '14:00 LOCAL',
          completed: false,
          resultSummary: undefined,
          isInternational: true,
          seriesName: fix.seriesName || expectedSeriesName,
          format: resolvedFormat
        };

        workingDates[calIdx] = {
          ...cd,
          id: cd.id || expectedCalId,
          dateStr: dateMeta.dateStr,
          dayOfWeek: dateMeta.dayOfWeek,
          dayNumber: dateMeta.dayNumber,
          month: dateMeta.month,
          type: 'international',
          title: cd.title && cd.title.trim().length > 0 ? cd.title : defaultTitle,
          matchFixture: syncedFix,
          internationalMatches: [syncedFix]
        };

        updatedSeriesMatches.push({
          ...m,
          venue: resolvedVenue,
          fixtureId: expectedFixId,
          dateStr: dateMeta.dateStr,
          format: resolvedFormat,
          homeNationId: userNat.id,
          awayNationId: seriesOppNat.id,
          homeTeamId: userNat.id,
          awayTeamId: seriesOppNat.id,
          completed: false,
          summary: undefined
        });

        lastReconciledSeriesCalIdx = calIdx;
      } else if (classification.status === 'completed') {
        const calIdx = classification.calIndex;
        const cd = workingDates[calIdx];
        const fix = classification.fixture;
        const resolvedFormat: 'T20' | 'ODI' | 'TEST' = fix.format || matchFormat;
        const resolvedVenue = m.venue || fix.venue;
        const wasIncompleteInSeries = !m.completed;

        const resolvedSummary =
          m.completed && typeof m.summary === 'string' && m.summary.trim().length > 0
            ? m.summary.trim()
            : typeof fix.resultSummary === 'string' && fix.resultSummary.trim().length > 0
            ? fix.resultSummary.trim()
            : m.summary || 'Match completed';

        const dateMeta = isValidIsoCalendarDate(cd.dateStr)
          ? addUtcDaysToCalendarDate(parseCalendarDateToUtc(cd.dateStr, seasonYearNum), 0)
          : isValidIsoCalendarDate(m.dateStr)
          ? addUtcDaysToCalendarDate(parseCalendarDateToUtc(m.dateStr, seasonYearNum), 0)
          : addUtcDaysToCalendarDate(runningAnchorUtc, 0);

        if (dateMeta.utcDate.getTime() > runningAnchorUtc.getTime()) {
          runningAnchorUtc = dateMeta.utcDate;
        }

        const syncedFix: CalendarMatchFixture = {
          ...fix,
          id: expectedFixId,
          homeTeamId: userNat.id,
          awayTeamId: seriesOppNat.id,
          homeTeamName: fix.homeTeamName || userNat.name,
          awayTeamName: fix.awayTeamName || seriesOppNat.name,
          homeShortName: fix.homeShortName || uCode,
          awayShortName: fix.awayShortName || oCode,
          homeLogo: fix.homeLogo || uFlag,
          awayLogo: fix.awayLogo || oFlag,
          venue: resolvedVenue,
          dateStr: dateMeta.dateStr,
          timeStr: fix.timeStr || '14:00 LOCAL',
          completed: true,
          resultSummary: resolvedSummary,
          isInternational: true,
          seriesName: fix.seriesName || expectedSeriesName,
          format: resolvedFormat
        };

        workingDates[calIdx] = {
          ...cd,
          id: cd.id || expectedCalId,
          dateStr: dateMeta.dateStr,
          dayOfWeek: dateMeta.dayOfWeek,
          dayNumber: dateMeta.dayNumber,
          month: dateMeta.month,
          type: 'international',
          title: cd.title && cd.title.trim().length > 0 ? cd.title : defaultTitle,
          matchFixture: syncedFix,
          internationalMatches: [syncedFix]
        };

        if (wasIncompleteInSeries) {
          const outcome = inferSeriesOutcomeDelta(syncedFix, resolvedSummary, userNat, seriesOppNat);
          if (outcome.userWon) addedWins++;
          else if (outcome.oppWon) addedLosses++;
        }

        updatedSeriesMatches.push({
          ...m,
          venue: resolvedVenue,
          fixtureId: expectedFixId,
          dateStr: dateMeta.dateStr,
          format: resolvedFormat,
          homeNationId: userNat.id,
          awayNationId: seriesOppNat.id,
          homeTeamId: userNat.id,
          awayTeamId: seriesOppNat.id,
          completed: true,
          summary: resolvedSummary
        });

        lastReconciledSeriesCalIdx = calIdx;
      } else {
        // classification.status === 'missing'
        if (m.completed) {
          updatedSeriesMatches.push({
            ...m,
            fixtureId: expectedFixId,
            format: matchFormat,
            homeNationId: userNat.id,
            awayNationId: seriesOppNat.id,
            homeTeamId: userNat.id,
            awayTeamId: seriesOppNat.id,
            completed: true
          });
        } else {
          const dateMeta = addUtcDaysToCalendarDate(runningAnchorUtc, 2);
          runningAnchorUtc = dateMeta.utcDate;

          const intlFix: CalendarMatchFixture = {
            id: expectedFixId,
            homeTeamId: userNat.id,
            awayTeamId: seriesOppNat.id,
            homeTeamName: userNat.name,
            awayTeamName: seriesOppNat.name,
            homeShortName: uCode,
            awayShortName: oCode,
            homeLogo: uFlag,
            awayLogo: oFlag,
            venue: m.venue,
            dateStr: dateMeta.dateStr,
            timeStr: '14:00 LOCAL',
            completed: false,
            resultSummary: m.summary,
            isInternational: true,
            seriesName: expectedSeriesName,
            format: matchFormat
          };

          newCalendarEntries.push({
            id: expectedCalId,
            dateStr: dateMeta.dateStr,
            dayOfWeek: dateMeta.dayOfWeek,
            dayNumber: dateMeta.dayNumber,
            month: dateMeta.month,
            type: 'international',
            title: defaultTitle,
            isHome: false,
            matchFixture: intlFix,
            otherMatches: [],
            internationalMatches: [intlFix]
          });

          updatedSeriesMatches.push({
            ...m,
            fixtureId: expectedFixId,
            dateStr: dateMeta.dateStr,
            format: matchFormat,
            homeNationId: userNat.id,
            awayNationId: seriesOppNat.id,
            homeTeamId: userNat.id,
            awayTeamId: seriesOppNat.id,
            completed: false
          });
          repairedOrScheduledCount++;
        }
      }
    }

    if (newCalendarEntries.length > 0) {
      workingDates = [...workingDates, ...newCalendarEntries];
    }

    workingSeries = {
      ...workingSeries,
      userNationId: userNat.id,
      userNationName: userNat.name,
      userNationCode: uCode,
      userNationFlag: uFlag,
      opponentNationId: seriesOppNat.id,
      opponentNationName: seriesOppNat.name,
      opponentNationCode: oCode,
      opponentNationFlag: oFlag,
      seriesWins: workingSeries.seriesWins + addedWins,
      seriesLosses: workingSeries.seriesLosses + addedLosses,
      format: workingSeries.format || 'T20',
      matches: updatedSeriesMatches
    };

    if (repairedOrScheduledCount > 0) {
      statusMessage = `Scheduled remaining calendar fixtures for active tour: ${workingSeries.userNationName} tour of ${workingSeries.opponentNationName}`;
    }

    if (
      workingSeries.matches.every(m => Boolean(m.completed)) &&
      !updatedCompletedIds.includes(workingSeries.seriesId)
    ) {
      updatedCompletedIds.push(workingSeries.seriesId);
    }
  }

  // 2. Search forward from currentDateIndex (inclusive) for an existing uncompleted fixture involving userNat
  for (let i = startIdx; i < workingDates.length; i++) {
    if (hasUncompletedUserMatchOnDay(workingDates[i])) {
      targetIdx = i;
      break;
    }
  }
  if (targetIdx === -1 && !wasSeriesAlreadyCompleteOnEntry) {
    for (let i = 0; i < startIdx; i++) {
      if (hasUncompletedUserMatchOnDay(workingDates[i])) {
        targetIdx = i;
        break;
      }
    }
  }

  // 3. If no future playable fixture for userNat is on the calendar:
  if (targetIdx === -1) {
    if (!wasSeriesAlreadyCompleteOnEntry && lastReconciledSeriesCalIdx !== -1) {
      // All incomplete matches of the active series were reconciled as completed from the calendar during this call
      targetIdx = lastReconciledSeriesCalIdx;
      statusMessage =
        statusMessage ||
        `Reconciled completed calendar fixtures for ${workingSeries?.userNationName || userNat.name} series.`;
    } else {
      // No unfinished active series for userNat exists; check if we are allowed and able to generate a new tour
      if (options?.allowGenerateNewTour === false) {
        return unchanged('No scheduled future tour found on the calendar for your coached nation.');
      }

      const eligibleOpponents = nations.filter(
        n => n && n.id !== userNat.id && n.name.trim().toLowerCase() !== userNatNameLower
      );
      if (eligibleOpponents.length === 0) {
        return unchanged(`No eligible opponent nation available to schedule a tour against ${userNat.name}.`);
      }

      // If previous series for userNat had all matches completed, ensure its seriesId is recorded so it is never duplicated
      if (
        workingSeries &&
        workingSeries.userNationId === userNat.id &&
        workingSeries.seriesId &&
        workingSeries.matches.length > 0 &&
        workingSeries.matches.every(m => Boolean(m.completed)) &&
        !updatedCompletedIds.includes(workingSeries.seriesId)
      ) {
        updatedCompletedIds.push(workingSeries.seriesId);
      }

      const existingSeriesIds = [
        ...updatedCompletedIds,
        ...(workingSeries?.seriesId ? [workingSeries.seriesId] : [])
      ];
      const tourCount = updatedCompletedIds.length + 1;

      // Determine next opponent (use explicit preferredOpponentId if provided, or rotate after previous opponent)
      let nextOpponentId = options?.preferredOpponentId;
      if (!nextOpponentId && workingSeries && workingSeries.userNationId === userNat.id && workingSeries.opponentNationId) {
        const prevOppIdx = eligibleOpponents.findIndex(n => n.id === workingSeries!.opponentNationId);
        if (prevOppIdx !== -1 && eligibleOpponents.length > 1) {
          nextOpponentId = eligibleOpponents[(prevOppIdx + 1) % eligibleOpponents.length].id;
        }
      }

      try {
        const generatedSeries = buildInitialSeriesForNation(
          userNat,
          nations,
          nextOpponentId,
          tourCount,
          undefined,
          existingSeriesIds
        );

        const anchorUtc = getCalendarEndAnchorUtc();
        const newCalendarEntries: League['calendarDates'] = [];
        const syncedMatches: InternationalSeriesMatch[] = generatedSeries.matches.map((m, idx) => {
          const dateMeta = addUtcDaysToCalendarDate(anchorUtc, (idx + 1) * 2);
          const fixId = `intl_fix_${generatedSeries.seriesId}_${m.matchNumber}`;
          const calId = `cal_intl_${generatedSeries.seriesId}_${m.matchNumber}`;
          const ordinal =
            m.matchNumber === 1 ? '1st' : m.matchNumber === 2 ? '2nd' : m.matchNumber === 3 ? '3rd' : `${m.matchNumber}th`;

          const intlFix: NonNullable<League['calendarDates'][number]['matchFixture']> = {
            id: fixId,
            homeTeamId: generatedSeries.userNationId,
            awayTeamId: generatedSeries.opponentNationId,
            homeTeamName: generatedSeries.userNationName,
            awayTeamName: generatedSeries.opponentNationName,
            homeShortName: generatedSeries.userNationCode,
            awayShortName: generatedSeries.opponentNationCode,
            homeLogo: generatedSeries.userNationFlag,
            awayLogo: generatedSeries.opponentNationFlag,
            venue: m.venue,
            dateStr: dateMeta.dateStr,
            timeStr: '14:00 LOCAL',
            completed: false,
            resultSummary: m.summary,
            isInternational: true,
            seriesName: `${generatedSeries.userNationName} Tour of ${generatedSeries.opponentNationName}`,
            format: 'T20'
          };

          newCalendarEntries.push({
            id: calId,
            dateStr: dateMeta.dateStr,
            dayOfWeek: dateMeta.dayOfWeek,
            dayNumber: dateMeta.dayNumber,
            month: dateMeta.month,
            type: 'international',
            title: `${ordinal} T20I · ${userNat.code || userNat.name.slice(0, 3).toUpperCase()} vs ${generatedSeries.opponentNationCode}`,
            isHome: false,
            matchFixture: intlFix,
            otherMatches: [],
            internationalMatches: [intlFix]
          });

          return {
            ...m,
            fixtureId: fixId,
            dateStr: dateMeta.dateStr,
            format: 'T20',
            homeNationId: generatedSeries.userNationId,
            awayNationId: generatedSeries.opponentNationId,
            homeTeamId: generatedSeries.userNationId,
            awayTeamId: generatedSeries.opponentNationId
          };
        });

        workingSeries = {
          ...generatedSeries,
          format: 'T20',
          matches: syncedMatches
        };
        targetIdx = workingDates.length;
        workingDates = [...workingDates, ...newCalendarEntries];
        generatedNewTour = true;
        statusMessage = `Scheduled new international tour: ${generatedSeries.userNationName} tour of ${generatedSeries.opponentNationName}!`;
      } catch (err: any) {
        return unchanged(err?.message || 'Unable to schedule a new international tour.');
      }
    }
  } else {
    // A valid future playable fixture already exists on the calendar at targetIdx!
    // If workingSeries is missing or does not belong to userNat, synchronize workingSeries with the calendar tour
    const targetDay = workingDates[targetIdx];
    const targetFix = getDayIntlFixtures(targetDay).find(m => m && !m.completed && doesFixtureInvolveUserNat(m));
    if (
      targetFix &&
      (!workingSeries ||
        workingSeries.userNationId !== userNat.id ||
        !workingSeries.seriesId ||
        (wasSeriesAlreadyCompleteOnEntry && workingSeries.matches.every(m => m.completed)))
    ) {
      const oppKey =
        targetFix.homeTeamId === userNat.id ||
        targetFix.homeTeamId.trim().toLowerCase() === userNatNameLower ||
        (targetFix.homeShortName || '').trim().toLowerCase() === userNatCodeLower
          ? targetFix.awayTeamId || targetFix.awayShortName || ''
          : targetFix.homeTeamId || targetFix.homeShortName || '';
      const oppNat = nations.find(
        n =>
          n &&
          n.id !== userNat.id &&
          (n.id === oppKey ||
            n.name.trim().toLowerCase() === oppKey.trim().toLowerCase() ||
            (n.code && n.code.trim().toLowerCase() === oppKey.trim().toLowerCase()))
      );
      if (oppNat) {
        // Collect all uncompleted calendar fixtures between userNat and oppNat from targetIdx onwards
        const tourDayIndices: number[] = [];
        for (let idx = targetIdx; idx < workingDates.length; idx++) {
          const cd = workingDates[idx];
          const hasMatchWithOpp = getDayIntlFixtures(cd).some(
            m =>
              m &&
              doesFixtureInvolveUserNat(m) &&
              (m.homeTeamId === oppNat.id ||
                m.awayTeamId === oppNat.id ||
                m.homeTeamId.trim().toLowerCase() === oppNat.name.trim().toLowerCase() ||
                m.awayTeamId.trim().toLowerCase() === oppNat.name.trim().toLowerCase() ||
                (oppNat.code &&
                  ((m.homeShortName || '').toLowerCase() === oppNat.code.toLowerCase() ||
                    (m.awayShortName || '').toLowerCase() === oppNat.code.toLowerCase())))
          );
          if (hasMatchWithOpp) {
            tourDayIndices.push(idx);
          }
        }
        const existingSeriesIds = [
          ...updatedCompletedIds,
          ...(workingSeries?.seriesId ? [workingSeries.seriesId] : [])
        ];
        const baseSeries = buildInitialSeriesForNation(
          userNat,
          nations,
          oppNat.id,
          updatedCompletedIds.length + 1,
          undefined,
          existingSeriesIds
        );
        workingSeries = {
          ...baseSeries,
          format: targetFix.format || 'T20',
          matches:
            tourDayIndices.length > 0
              ? tourDayIndices.map((tdIdx, idx) => {
                  const td = workingDates[tdIdx];
                  const tf = getDayIntlFixtures(td).find(m => m && doesFixtureInvolveUserNat(m)) || targetFix;
                  const resolvedFormat = tf.format || 'T20';
                  const syncedTf: CalendarMatchFixture = {
                    ...tf,
                    homeTeamId: baseSeries.userNationId,
                    awayTeamId: baseSeries.opponentNationId,
                    dateStr: td.dateStr,
                    format: resolvedFormat,
                    isInternational: true
                  };
                  workingDates[tdIdx] = {
                    ...td,
                    matchFixture: syncedTf,
                    internationalMatches: [syncedTf]
                  };
                  return {
                    matchNumber: idx + 1,
                    city: oppNat.name,
                    venue: tf.venue || `${oppNat.name} Stadium`,
                    completed: Boolean(tf.completed),
                    summary: tf.resultSummary,
                    fixtureId: tf.id,
                    dateStr: td.dateStr,
                    format: resolvedFormat,
                    homeNationId: baseSeries.userNationId,
                    awayNationId: baseSeries.opponentNationId,
                    homeTeamId: baseSeries.userNationId,
                    awayTeamId: baseSeries.opponentNationId
                  };
                })
              : baseSeries.matches
        };
      }
    }
  }

  if (targetIdx < 0 || targetIdx >= workingDates.length) {
    return unchanged('No valid future tour fixture could be resolved.');
  }

  // 4. Process intervening days [startIdx ... targetIdx - 1] in strict chronological order, simulating each uncompleted non-user fixture once
  let workingPlayers = [...players];
  let workingStandings = [...(activeLeague.standings || [])];
  const simulatedFixtureIds: string[] = [];
  const nextCompletedHistory: CompletedMatchRecord[] = [...completedMatchesHistory];
  const activeSeasonKey = normalizeSeasonYear(activeLeague.seasonName || activeLeague.seasonYear);
  let daysAdvanced = 0;

  for (let dIdx = startIdx; dIdx < targetIdx; dIdx++) {
    const dayObj = workingDates[dIdx];
    if (!dayObj) continue;

    // Never advance past an uncompleted user-nation fixture
    if (hasUncompletedUserMatchOnDay(dayObj)) {
      targetIdx = dIdx;
      break;
    }

    const nextOtherMatches = (dayObj.otherMatches || []).map((om, omIdx) => {
      if (!om || om.completed) return om;
      const homeTeamObj = teams.find(t => t.id === om.homeTeamId);
      const awayTeamObj = teams.find(t => t.id === om.awayTeamId);
      if (!homeTeamObj || !awayTeamObj || homeTeamObj.id === awayTeamObj.id) {
        return om;
      }
      const simRes = simulateAiFixtureScorecard(
        om.id,
        homeTeamObj,
        awayTeamObj,
        om.venue || `${homeTeamObj.city} Stadium`,
        om.format || 'T20',
        activeLeague.id,
        workingPlayers,
        dIdx * 17 + omIdx * 11 + 3
      );
      workingPlayers = applyMatchToPlayerList(workingPlayers, simRes.matchState, activeSeasonKey);
      simulatedFixtureIds.push(om.id);

      workingStandings = workingStandings.map(st => {
        if (!simRes.winnerId && (st.teamId === om.homeTeamId || st.teamId === om.awayTeamId)) {
          if (st.played >= 18) return st;
          return {
            ...st,
            played: st.played + 1,
            tied: (st.tied || 0) + 1,
            points: st.points + 1,
            recentForm: ['T' as const, ...st.recentForm].slice(0, 5)
          };
        }
        if (st.teamId === simRes.winnerId) {
          if (st.played >= 18) return st;
          return {
            ...st,
            played: st.played + 1,
            won: st.won + 1,
            points: st.points + 2,
            nrr: Number((st.nrr + simRes.nrrDelta).toFixed(2)),
            recentForm: ['W' as const, ...st.recentForm].slice(0, 5)
          };
        }
        if (st.teamId === simRes.loserId) {
          if (st.played >= 18) return st;
          return {
            ...st,
            played: st.played + 1,
            lost: st.lost + 1,
            nrr: Number((st.nrr - simRes.nrrDelta).toFixed(2)),
            recentForm: ['L' as const, ...st.recentForm].slice(0, 5)
          };
        }
        return st;
      });

      return {
        ...om,
        completed: true,
        resultSummary: simRes.summary,
        completedMatchState: simRes.matchState
      };
    });

    const nextIntlMatches = (dayObj.internationalMatches || []).map((im, imIdx) => {
      if (!im || im.completed || (im.completedMatchState && im.completedMatchState.status === 'finished') || doesFixtureInvolveUserNat(im)) return im;
      const homeNatObj =
        resolveInternationalMatchParticipant(im.homeTeamId, nations) ||
        resolveInternationalMatchParticipant(im.homeTeamName, nations);
      const awayNatObj =
        resolveInternationalMatchParticipant(im.awayTeamId, nations) ||
        resolveInternationalMatchParticipant(im.awayTeamName, nations);
      if (!homeNatObj || !awayNatObj || homeNatObj.id === awayNatObj.id) return im;

      const homeNat = buildTempNationalTeamFromPool(homeNatObj.id, nations, workingPlayers);
      const awayNat = buildTempNationalTeamFromPool(awayNatObj.id, nations, workingPlayers);
      if (!homeNat || !awayNat || homeNat.id === awayNat.id) return im;

      const simRes = simulateAiFixtureScorecard(
        im.id,
        homeNat,
        awayNat,
        im.venue || `${homeNat.name} Stadium`,
        im.format || 'T20',
        'intl',
        workingPlayers,
        dIdx * 23 + imIdx * 13 + 7
      );
      workingPlayers = applyMatchToPlayerList(workingPlayers, simRes.matchState, activeSeasonKey);
      simulatedFixtureIds.push(im.id);
      nextCompletedHistory.push({
        id: im.id,
        dateStr: dayObj.dateStr,
        homeTeam: homeNat.shortName,
        awayTeam: awayNat.shortName,
        summary: simRes.summary,
        playerOfMatch: simRes.matchState.innings1?.batters?.[0]?.name || 'Player of the Match',
        innings1: {
          team: homeNat.shortName,
          runs: simRes.matchState.innings1?.runs || 0,
          wickets: simRes.matchState.innings1?.wickets || 0,
          overs: String(simRes.matchState.innings1?.overs || 20),
          batters: [],
          bowlers: []
        },
        innings2: {
          team: awayNat.shortName,
          runs: simRes.matchState.innings2?.runs || 0,
          wickets: simRes.matchState.innings2?.wickets || 0,
          overs: String(simRes.matchState.innings2?.overs || 20),
          batters: [],
          bowlers: []
        }
      });
      return {
        ...im,
        completed: true,
        resultSummary: simRes.summary,
        completedMatchState: simRes.matchState
      };
    });

    let nextMatchFixture = dayObj.matchFixture;
    if (
      dayObj.type === 'international' &&
      nextMatchFixture &&
      !nextMatchFixture.completed &&
      !(nextMatchFixture.completedMatchState && nextMatchFixture.completedMatchState.status === 'finished') &&
      !doesFixtureInvolveUserNat(nextMatchFixture)
    ) {
      const matchingIntl = nextIntlMatches.find(im => im && im.id === nextMatchFixture!.id);
      if (matchingIntl && (matchingIntl.completed || matchingIntl.completedMatchState?.status === 'finished')) {
        nextMatchFixture = {
          ...nextMatchFixture,
          completed: true,
          resultSummary: matchingIntl.resultSummary || 'Match completed',
          completedMatchState: matchingIntl.completedMatchState
        };
      } else {
        const homeNatObj =
          resolveInternationalMatchParticipant(nextMatchFixture.homeTeamId, nations) ||
          resolveInternationalMatchParticipant(nextMatchFixture.homeTeamName, nations);
        const awayNatObj =
          resolveInternationalMatchParticipant(nextMatchFixture.awayTeamId, nations) ||
          resolveInternationalMatchParticipant(nextMatchFixture.awayTeamName, nations);
        if (homeNatObj && awayNatObj && homeNatObj.id !== awayNatObj.id) {
          const homeNat = buildTempNationalTeamFromPool(homeNatObj.id, nations, workingPlayers);
          const awayNat = buildTempNationalTeamFromPool(awayNatObj.id, nations, workingPlayers);
          if (homeNat && awayNat && homeNat.id !== awayNat.id) {
            const simRes = simulateAiFixtureScorecard(
              nextMatchFixture.id,
              homeNat,
              awayNat,
              nextMatchFixture.venue || `${homeNat.name} Stadium`,
              nextMatchFixture.format || 'T20',
              'intl',
              workingPlayers,
              dIdx * 29 + 5
            );
            workingPlayers = applyMatchToPlayerList(workingPlayers, simRes.matchState, activeSeasonKey);
            simulatedFixtureIds.push(nextMatchFixture.id);
            nextCompletedHistory.push({
              id: nextMatchFixture.id,
              dateStr: dayObj.dateStr,
              homeTeam: homeNat.shortName,
              awayTeam: awayNat.shortName,
              summary: simRes.summary,
              playerOfMatch: simRes.matchState.innings1?.batters?.[0]?.name || 'Player of the Match',
              innings1: {
                team: homeNat.shortName,
                runs: simRes.matchState.innings1?.runs || 0,
                wickets: simRes.matchState.innings1?.wickets || 0,
                overs: String(simRes.matchState.innings1?.overs || 20),
                batters: [],
                bowlers: []
              },
              innings2: {
                team: awayNat.shortName,
                runs: simRes.matchState.innings2?.runs || 0,
                wickets: simRes.matchState.innings2?.wickets || 0,
                overs: String(simRes.matchState.innings2?.overs || 20),
                batters: [],
                bowlers: []
              }
            });
            nextMatchFixture = {
              ...nextMatchFixture,
              completed: true,
              resultSummary: simRes.summary,
              completedMatchState: simRes.matchState
            };
          }
        }
      }
    }

    workingDates[dIdx] = {
      ...dayObj,
      otherMatches: nextOtherMatches,
      internationalMatches: nextIntlMatches,
      matchFixture: nextMatchFixture
    };
    daysAdvanced++;
  }

  workingStandings.sort((a, b) => b.points - a.points || b.nrr - a.nrr);

  const updatedTeams = teams.map(t => ({
    ...t,
    squad: Array.isArray(t.squad)
      ? t.squad.map(sp => workingPlayers.find(wp => wp.id === sp.id) || sp)
      : []
  }));

  const updatedLeagues = leagues.map(l =>
    l && typeof l === 'object' && l.id === activeLeague.id
      ? {
          ...l,
          standings: workingStandings,
          calendarDates: workingDates,
          currentDateIndex: targetIdx
        }
      : l
  );

  const finalCoachProfile: CoachProfile = {
    ...enforcedCoachProfile,
    completedInternationalSeriesIds: updatedCompletedIds
  };

  const targetDayObj = workingDates[targetIdx];
  const finalMessage =
    statusMessage ||
    (daysAdvanced > 0
      ? `Advanced ${daysAdvanced} day(s) to ${targetDayObj.month} ${targetDayObj.dayNumber} (${targetDayObj.title})`
      : `Ready for ${targetDayObj.month} ${targetDayObj.dayNumber} (${targetDayObj.title})`);

  return {
    success: true,
    message: finalMessage,
    daysAdvanced,
    targetDateIndex: targetIdx,
    generatedNewTour,
    simulatedFixtureIds,
    processedInterveningFixtureIds: simulatedFixtureIds,
    coachProfile: finalCoachProfile,
    leagues: updatedLeagues,
    players: workingPlayers,
    teams: updatedTeams,
    internationalSeries: workingSeries || fallbackSeries,
    completedMatchesHistory: nextCompletedHistory,
    careerPhase: 'international_series'
  };
}

// ============================================================================
// STORAGE QUOTA GUARD & COMPACT SERIALIZATION HELPERS
// ============================================================================
export function pruneLegacyCacheKeys() {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (
        k.includes('_v1') || k.includes('_v2') || k.includes('_v3') || k.includes('_v4') || k.includes('_v5') ||
        k.startsWith('crick_') || k.startsWith('cb_cache')
      )) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch {}
}

if (typeof window !== 'undefined') {
  pruneLegacyCacheKeys();
}

export function safeStorageSet(key: string, value: string): boolean {
  if (typeof localStorage === 'undefined') {
    return true;
  }
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err: any) {
    if (err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014 || err.number === -2147024882)) {
      console.warn(`[SafeStorage] QuotaExceededError on key "${key}". Performing storage cleanup...`);
      try {
        pruneLegacyCacheKeys();
        // If still full, prune completed matches cache
        localStorage.removeItem('ms_completed_matches_v6');
        localStorage.setItem(key, value);
        return true;
      } catch {
        console.warn(`[SafeStorage] Unable to persist "${key}" due to origin quota. Suppressing QuotaExceededError crash.`);
        return false;
      }
    }
    return false;
  }
}

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<MainTab>('landing');
  const [activeSaveSlot, setActiveSaveSlotState] = useState<1 | 2 | 3>(() => {
    const saved = localStorage.getItem('ms_active_slot_v6');
    if (saved === '2') return 2;
    if (saved === '3') return 3;
    return 1;
  });

  const setActiveSaveSlot = useCallback((slot: 1 | 2 | 3) => {
    setActiveSaveSlotState(slot);
    safeStorageSet('ms_active_slot_v6', String(slot));
  }, []);

  const [players, setPlayers] = useState<Player[]>(() => {
    const saved = localStorage.getItem('ms_players_v6');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 200) {
          return parsed;
        }
      } catch {}
    }
    const fresh = createFreshPlayers();
    safeStorageSet('ms_players_v6', JSON.stringify(fresh));
    return fresh;
  });

  const [teams, setTeams] = useState<Team[]>(() => {
    const freshPlayers = createFreshPlayers();
    const saved = localStorage.getItem('ms_teams_v6');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 10) {
          const normalized = parsed.map((team: Team) => {
            const normShort = team.id === 'team_blr' || team.shortName === 'BLR'
              ? 'RCB'
              : team.id === 'team_kol' || team.shortName === 'KOL'
              ? 'KKR'
              : team.shortName;
            return {
              ...team,
              shortName: normShort,
              squad: team.squad && team.squad.length > 5
                ? team.squad
                : freshPlayers.filter(p => p.clubId === team.id)
            };
          });
          safeStorageSet('ms_teams_v6', JSON.stringify(normalized.map((t: Team) => ({ ...t, squad: [] }))));
          return normalized;
        }
      } catch {}
    }

    const updatedTeams = INITIAL_TEAMS.map(team => ({
      ...team,
      squad: freshPlayers.filter(p => p.clubId === team.id)
    }));
    const compactTeams = updatedTeams.map(t => ({ ...t, squad: [] }));
    safeStorageSet('ms_teams_v6', JSON.stringify(compactTeams));
    return updatedTeams;
  });

  const [leagues, setLeagues] = useState<League[]>(() => {
    const saved = localStorage.getItem('ms_leagues_v6');
    const savedProfile = localStorage.getItem('ms_profile_v6');
    let activeUserTeamId = INITIAL_COACH_PROFILE.clubTeamId;
    if (savedProfile) {
      try {
        activeUserTeamId = JSON.parse(savedProfile).clubTeamId || activeUserTeamId;
      } catch {}
    }

    if (saved) {
      try {
        const parsed: League[] = JSON.parse(saved);
        const validSavedLeagues = Array.isArray(parsed)
          ? parsed.filter(l => Boolean(l && typeof l.id === 'string' && Array.isArray(l.standings) && l.standings.length > 0))
          : [];
        if (validSavedLeagues.length > 0) {
          const result = validSavedLeagues.map(l => {
            const hasFullSchedule = l.calendarDates && l.calendarDates.length >= 45;
            const normYear = normalizeSeasonYear(l.seasonName || l.seasonYear);
            const cleanedHistory: Record<string, TeamSeasonRecord[]> = {};
            if (l.teamSeasonHistory && typeof l.teamSeasonHistory === 'object') {
              Object.entries(l.teamSeasonHistory).forEach(([tId, records]) => {
                if (Array.isArray(records)) {
                  cleanedHistory[tId] = records.filter(r => parseInt(String(r.seasonYear), 10) >= 2026);
                }
              });
            }
            return {
              ...l,
              seasonName: normYear,
              seasonYear: parseInt(normYear, 10) || 2026,
              teamSeasonHistory: cleanedHistory,
              playoffs: l.playoffs || createInitialPlayoffs(l.standings),
              currentDateIndex: hasFullSchedule ? l.currentDateIndex : 0,
              calendarDates: hasFullSchedule
                ? l.calendarDates.map(cd => {
                    const normShort = (s?: string) => s === 'BLR' ? 'RCB' : s === 'KOL' ? 'KKR' : s;
                    return {
                      ...cd,
                      matchFixture: cd.matchFixture ? {
                        ...cd.matchFixture,
                        homeShortName: normShort(cd.matchFixture.homeShortName) || cd.matchFixture.homeShortName,
                        awayShortName: normShort(cd.matchFixture.awayShortName) || cd.matchFixture.awayShortName
                      } : undefined,
                      otherMatches: (cd.otherMatches || []).map(om => ({
                        ...om,
                        homeShortName: normShort(om.homeShortName) || om.homeShortName,
                        awayShortName: normShort(om.awayShortName) || om.awayShortName
                      }))
                    };
                  })
                : buildSeasonCalendarForTeam(activeUserTeamId || 'team_kol', INITIAL_TEAMS, false, parseInt(normYear, 10) || 2026)
            };
          });
          safeStorageSet('ms_leagues_v6', JSON.stringify(result));
          return result;
        }
      } catch {}
    }
    const seededLeagues = INITIAL_LEAGUES.map(l => ({
      ...l,
      seasonName: '2026',
      seasonYear: 2026,
      teamSeasonHistory: {},
      currentDateIndex: 0,
      calendarDates: buildSeasonCalendarForTeam(activeUserTeamId || 'team_kol', INITIAL_TEAMS, false, 2026)
    }));
    safeStorageSet('ms_leagues_v6', JSON.stringify(seededLeagues));
    return seededLeagues;
  });

  const [currentLeagueId, setCurrentLeagueIdState] = useState<string>(() => {
    const saved = localStorage.getItem('ms_current_league_id_v6');
    return saved && saved.trim().length > 0 ? saved.trim() : 'pt20';
  });

  const setCurrentLeagueId = useCallback((id: string) => {
    setCurrentLeagueIdState(id);
    safeStorageSet('ms_current_league_id_v6', id);
  }, []);

  const [nations, setNations] = useState<Nation[]>(() => {
    const saved = localStorage.getItem('ms_nations_v6');
    return saved ? JSON.parse(saved) : INITIAL_NATIONS;
  });

  const [coachProfile, setCoachProfile] = useState<CoachProfile>(() => {
    const saved = localStorage.getItem('ms_profile_v6');
    if (saved) {
      try {
        return { ...INITIAL_COACH_PROFILE, ...JSON.parse(saved), proUnlocked: true };
      } catch {}
    }
    return { ...INITIAL_COACH_PROFILE, proUnlocked: true };
  });

  const [achievements, setAchievements] = useState<Achievement[]>(() => {
    const saved = localStorage.getItem('ms_achievements_v6');
    if (saved) {
      try {
        const parsed: Achievement[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 79) {
          return parsed;
        }
      } catch {}
    }
    return INITIAL_ACHIEVEMENTS;
  });

  const [jobOffers, setJobOffers] = useState<JobOffer[]>(() => {
    const saved = localStorage.getItem('ms_job_offers_v6');
    return saved ? JSON.parse(saved) : INITIAL_JOB_OFFERS;
  });

  const [homePitch, setHomePitchState] = useState<string>(() => {
    return localStorage.getItem('ms_home_pitch_v6') || 'Natural';
  });

  const setHomePitch = useCallback((pitch: string) => {
    setHomePitchState(pitch);
    localStorage.setItem('ms_home_pitch_v6', pitch);
  }, []);

  const [simTokens, setSimTokens] = useState<number>(() => {
    const saved = localStorage.getItem('ms_sim_tokens_v6');
    return saved !== null ? Math.max(999, Number(saved)) : 999;
  });

  const [squadStamina, setSquadStamina] = useState<number>(() => {
    const saved = localStorage.getItem('ms_squad_stamina_v6');
    return saved !== null ? Math.max(40, Math.min(100, Number(saved))) : 100;
  });

  const [completedMatchesHistory, setCompletedMatchesHistory] = useState<CompletedMatchRecord[]>(() => {
    const saved = localStorage.getItem('ms_completed_matches_v6');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return INITIAL_COMPLETED_MATCHES;
  });

  const [tournamentHonors, setTournamentHonors] = useState<TournamentHonor[]>(() => {
    const saved = localStorage.getItem('ms_tournament_honors_v6');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const cleaned = sanitizeTournamentHonors(parsed);
          safeStorageSet('ms_tournament_honors_v6', JSON.stringify(cleaned));
          return cleaned;
        }
      } catch {}
    }
    return [];
  });

  const userTeam = useMemo(() => {
    const found = teams.find(t => t.id === coachProfile.clubTeamId);
    return found || teams[0];
  }, [teams, coachProfile.clubTeamId]);

  const [inboxMessages, setInboxMessages] = useState<InboxMessage[]>(() => {
    const saved = localStorage.getItem('ms_inbox_messages_v6');
    if (saved) {
      try {
        const parsed: InboxMessage[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {}
    }
    const initTeam = INITIAL_TEAMS.find(t => t.id === INITIAL_COACH_PROFILE.clubTeamId) || INITIAL_TEAMS[0];
    return buildInitialInboxMessages(initTeam, INITIAL_PLAYERS);
  });

  const [nationalSquadIds, setNationalSquadIdsState] = useState<string[]>(() => {
    const saved = localStorage.getItem('ms_national_squad_ids_v6');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 11) return parsed;
      } catch {}
    }
    return INITIAL_PLAYERS.filter(p => p.country === 'India').slice(0, 15).map(p => p.id);
  });

  const setNationalSquadIds = useCallback((ids: string[]) => {
    setNationalSquadIdsState(ids);
    localStorage.setItem('ms_national_squad_ids_v6', JSON.stringify(ids));
  }, []);

  const [careerPhase, setCareerPhaseState] = useState<CareerPhase>(() => {
    const saved = localStorage.getItem('ms_career_phase_v6');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed) return parsed as CareerPhase;
      } catch {}
    }
    return 'league_stage';
  });

  const setCareerPhase = useCallback((phase: CareerPhase) => {
    setCareerPhaseState(phase);
    localStorage.setItem('ms_career_phase_v6', JSON.stringify(phase));
  }, []);

  const [careerBoardReview, setCareerBoardReviewState] = useState<CareerBoardReview | null>(() => {
    const saved = localStorage.getItem('ms_career_board_review_v6');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.scorePct === 'number') return parsed as CareerBoardReview;
      } catch {}
    }
    return null;
  });

  const setCareerBoardReview = useCallback((review: CareerBoardReview | null) => {
    setCareerBoardReviewState(review);
    if (review) {
      localStorage.setItem('ms_career_board_review_v6', JSON.stringify(review));
    } else {
      localStorage.removeItem('ms_career_board_review_v6');
    }
  }, []);

  const [internationalSeries, setInternationalSeriesState] = useState<InternationalSeriesState>(() => {
    const saved = localStorage.getItem('ms_intl_series_v6');
    const savedCompletedIds = coachProfile.completedInternationalSeriesIds || [];
    const activeNations = Array.isArray(nations) && nations.length > 0 ? nations : INITIAL_NATIONS;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.userNationName && Array.isArray(parsed.matches)) {
          if (typeof parsed.seriesId === 'string' && parsed.seriesId.trim().length > 0) {
            return { ...parsed, seriesId: parsed.seriesId.trim() } as InternationalSeriesState;
          }
          const mig = migrateLegacyInternationalSeries(parsed, activeNations, savedCompletedIds);
          if (mig.canMigrate && mig.series) {
            safeStorageSet('ms_intl_series_v6', JSON.stringify(mig.series));
            return mig.series;
          }
        }
      } catch {}
    }
    const initNation =
      activeNations.find(n => n.id === coachProfile.nationalTeamId) ||
      activeNations.find(n => n.id === INITIAL_COACH_PROFILE.nationalTeamId) ||
      activeNations[0];
    const freshSeries = buildInitialSeriesForNation(
      initNation,
      activeNations,
      undefined,
      savedCompletedIds.length + 1,
      undefined,
      savedCompletedIds
    );
    safeStorageSet('ms_intl_series_v6', JSON.stringify(freshSeries));
    return freshSeries;
  });

  const setInternationalSeries = useCallback(
    (updater: InternationalSeriesState | ((prev: InternationalSeriesState) => InternationalSeriesState)) => {
      setInternationalSeriesState(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        safeStorageSet('ms_intl_series_v6', JSON.stringify(next));
        return next;
      });
    },
    []
  );

  // Separate one-time startup migration from active-league and persisted-state reconciliation
  const hasRunStartupMigrationRef = useRef<boolean>(false);
  const lastValidatedLeagueIdRef = useRef<string | null>(null);
  const lastValidatedSignatureRef = useRef<string | null>(null);
  const completedIntlSeriesRef = useRef<Set<string>>(
    new Set(coachProfile.completedInternationalSeriesIds || [])
  );
  const lastInitializedSeasonKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const isInitialStartupMigration = !hasRunStartupMigrationRef.current;
    const phaseToValidate: unknown = isInitialStartupMigration
      ? (() => {
          const s = localStorage.getItem('ms_career_phase_v6');
          if (!s) return careerPhase;
          try {
            return JSON.parse(s);
          } catch {
            return s;
          }
        })()
      : careerPhase;

    const currentSig = buildCareerValidationSignature({
      currentLeagueId,
      leagues,
      coachProfile,
      careerBoardReview,
      internationalSeries,
      nationalSquadIds,
      careerPhase: phaseToValidate
    });

    if (
      !isInitialStartupMigration &&
      lastValidatedLeagueIdRef.current === currentLeagueId &&
      lastValidatedSignatureRef.current === currentSig
    ) {
      return;
    }

    hasRunStartupMigrationRef.current = true;
    const recovered = validateAndRecoverCareerState({
      rawPhase: phaseToValidate,
      coachProfile,
      teams,
      leagues,
      currentLeagueId,
      nations,
      nationalSquadIds,
      careerBoardReview,
      players,
      internationalSeries
    });

    const effectiveLeagueId = recovered.resolvedLeagueId || currentLeagueId;
    const nextSeries = recovered.internationalSeries || internationalSeries;
    const nextSig = buildCareerValidationSignature({
      currentLeagueId: effectiveLeagueId,
      leagues,
      coachProfile: recovered.coachProfile,
      careerBoardReview: recovered.careerBoardReview,
      internationalSeries: nextSeries,
      nationalSquadIds: recovered.nationalSquadIds,
      careerPhase: recovered.careerPhase
    });

    lastValidatedLeagueIdRef.current = effectiveLeagueId;
    lastValidatedSignatureRef.current = nextSig;

    if (recovered.resolvedLeagueId && recovered.resolvedLeagueId !== currentLeagueId) {
      setCurrentLeagueId(recovered.resolvedLeagueId);
    }

    if (recovered.careerPhase !== careerPhase) {
      setCareerPhase(recovered.careerPhase);
    }

    const reviewChanged =
      recovered.careerBoardReview !== careerBoardReview &&
      JSON.stringify(recovered.careerBoardReview) !== JSON.stringify(careerBoardReview);
    if (reviewChanged) {
      setCareerBoardReview(recovered.careerBoardReview);
    }

    const natSquadChanged =
      recovered.nationalSquadIds.length !== nationalSquadIds.length ||
      recovered.nationalSquadIds.some((id, idx) => id !== nationalSquadIds[idx]);
    if (natSquadChanged) {
      setNationalSquadIds(recovered.nationalSquadIds);
    }

    if (recovered.coachProfile !== coachProfile) {
      setCoachProfile(recovered.coachProfile);
    }

    if (
      recovered.internationalSeries &&
      recovered.internationalSeries.seriesId !== internationalSeries.seriesId
    ) {
      setInternationalSeries(recovered.internationalSeries);
    }
  }, [
    careerPhase,
    coachProfile,
    teams,
    leagues,
    currentLeagueId,
    nations,
    nationalSquadIds,
    careerBoardReview,
    players,
    internationalSeries,
    setCurrentLeagueId,
    setCareerPhase,
    setCareerBoardReview,
    setNationalSquadIds,
    setInternationalSeries
  ]);

  const [settings, setSettingsState] = useState<GameSettings>(() => {
    const saved = localStorage.getItem('ms_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.coachTips === 'boolean') return parsed;
      } catch {}
    }
    return {
      coachTips: true,
      tacticsAuto: 'key_moments',
      matchAnimations: 'quick'
    };
  });

  const updateSettings = useCallback((partial: Partial<GameSettings>) => {
    setSettingsState(prev => {
      const next = { ...prev, ...partial };
      localStorage.setItem('ms_settings', JSON.stringify(next));
      return next;
    });
  }, []);

  const readSaveSlots = useCallback((): SaveSlotMeta[] => {
    const slots: SaveSlotMeta[] = [];
    for (const slotNum of [1, 2, 3] as const) {
      const raw = localStorage.getItem(`ms_save_slot_v6_${slotNum}`);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const rawSlotShort = parsed.teamShortName || userTeam.shortName;
          const normSlotShort = rawSlotShort === 'BLR' ? 'RCB' : rawSlotShort === 'KOL' ? 'KKR' : rawSlotShort;
          slots.push({
            slotNumber: slotNum,
            hasSave: true,
            teamName: parsed.teamName || userTeam.name,
            teamShortName: normSlotShort,
            logoEmoji: parsed.logoEmoji || userTeam.logoEmoji || '🏏',
            seasonName: normalizeSeasonYear(parsed.seasonName),
            savedAt: parsed.savedAt || 'Saved'
          });
          continue;
        } catch {}
      }
      slots.push({
        slotNumber: slotNum,
        hasSave: false,
        teamName: 'Empty Slot',
        teamShortName: '---',
        logoEmoji: '📂',
        seasonName: 'No career saved',
        savedAt: ''
      });
    }
    return slots;
  }, [userTeam.name, userTeam.shortName, userTeam.logoEmoji]);

  const [saveSlots, setSaveSlots] = useState<SaveSlotMeta[]>(() => readSaveSlots());

  useEffect(() => {
    setSaveSlots(readSaveSlots());
  }, [readSaveSlots]);

  const writeSlotSnapshot = useCallback((
    slotNumber: 1 | 2 | 3,
    snap: {
      team: Team;
      seasonName: string;
      coach: CoachProfile;
      teams: Team[];
      players: Player[];
      leagues: League[];
      currentLeagueId?: string;
      nations: Nation[];
      achievements: Achievement[];
      homePitch: string;
      simTokens: number;
      squadStamina: number;
      completedMatchesHistory: CompletedMatchRecord[];
      inboxMessages: InboxMessage[];
      nationalSquadIds: string[];
      internationalSeries: InternationalSeriesState;
      tournamentHonors: TournamentHonor[];
      careerPhase?: CareerPhase;
      careerBoardReview?: CareerBoardReview | null;
    }
  ) => {
    const nowStr = new Date().toLocaleString([], {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });

    // 1. Strip redundant squad array duplication from teams (reconstructed on load from players, saving ~1.2 MB)
    const compactTeams = (snap.teams || []).map(t => ({
      ...t,
      squad: []
    }));

    // 2. Strip heavy match simulation telemetry from calendar dates (saving ~1.5 MB)
    const compactLeagues = (snap.leagues || []).map(l => ({
      ...l,
      calendarDates: (l.calendarDates || []).map(cd => ({
        ...cd,
        matchFixture: cd.matchFixture ? {
          ...cd.matchFixture,
          completedMatchState: undefined
        } : undefined,
        otherMatches: (cd.otherMatches || []).map(om => ({
          ...om,
          completedMatchState: undefined
        }))
      }))
    }));

    // 3. Keep latest 10 completed matches for historical archive
    const compactHistory = (snap.completedMatchesHistory || []).slice(0, 10);

    const normSeason = normalizeSeasonYear(snap.seasonName);

    const payload = {
      slotNumber,
      teamName: snap.team.name,
      teamShortName: snap.team.shortName,
      logoEmoji: snap.team.logoEmoji || '🏏',
      seasonName: normSeason,
      savedAt: nowStr,
      coachProfile: snap.coach,
      teams: compactTeams,
      players: snap.players,
      leagues: compactLeagues,
      currentLeagueId: snap.currentLeagueId || currentLeagueId,
      nations: snap.nations,
      achievements: snap.achievements,
      homePitch: snap.homePitch,
      simTokens: snap.simTokens,
      squadStamina: snap.squadStamina,
      completedMatchesHistory: compactHistory,
      inboxMessages: (snap.inboxMessages || []).slice(0, 8),
      nationalSquadIds: snap.nationalSquadIds,
      internationalSeries: snap.internationalSeries,
      tournamentHonors: sanitizeTournamentHonors(snap.tournamentHonors),
      careerPhase: snap.careerPhase || careerPhase,
      careerBoardReview: snap.careerBoardReview !== undefined ? snap.careerBoardReview : careerBoardReview
    };

    const serialized = JSON.stringify(payload);
    safeStorageSet(`ms_save_slot_v6_${slotNumber}`, serialized);

    setSaveSlots(prev => prev.map(s =>
      s.slotNumber === slotNumber
        ? {
            slotNumber,
            hasSave: true,
            teamName: snap.team.name,
            teamShortName: snap.team.shortName,
            logoEmoji: snap.team.logoEmoji || '🏏',
            seasonName: normSeason,
            savedAt: nowStr
          }
        : s
    ));
  }, [currentLeagueId, careerPhase, careerBoardReview]);

  const saveToSlot = useCallback((slotNumber: 1 | 2 | 3) => {
    const activeLeague = leagues.find(l => l.id === currentLeagueId) || leagues[0];
    setActiveSaveSlot(slotNumber);
    writeSlotSnapshot(slotNumber, {
      team: userTeam,
      seasonName: normalizeSeasonYear(activeLeague?.seasonName),
      coach: coachProfile,
      teams,
      players,
      leagues,
      currentLeagueId,
      nations,
      achievements,
      homePitch,
      simTokens,
      squadStamina,
      completedMatchesHistory,
      inboxMessages,
      nationalSquadIds,
      internationalSeries,
      tournamentHonors,
      careerPhase,
      careerBoardReview
    });
    sound.playTap();
  }, [
    leagues, currentLeagueId, userTeam, coachProfile, teams, players,
    nations, achievements, homePitch, simTokens, squadStamina,
    completedMatchesHistory, inboxMessages, nationalSquadIds,
    internationalSeries, tournamentHonors, careerPhase, careerBoardReview,
    setActiveSaveSlot, writeSlotSnapshot
  ]);

  const loadFromSlot = useCallback((slotNumber: 1 | 2 | 3): boolean => {
    const raw = localStorage.getItem(`ms_save_slot_v6_${slotNumber}`);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      setActiveSaveSlot(slotNumber);
      recordedMatchIdsRef.current.clear();
      setMatchLiveState(null);
      if (parsed.coachProfile) setCoachProfile(parsed.coachProfile);

      const loadedPlayers: Player[] = Array.isArray(parsed.players) ? parsed.players : players;
      if (Array.isArray(parsed.players)) setPlayers(loadedPlayers);

      let resolvedTeams = teams;
      if (Array.isArray(parsed.teams)) {
        const hydratedTeams = parsed.teams.map((t: Team) => {
          const normShort = t.id === 'team_blr' || t.shortName === 'BLR'
            ? 'RCB'
            : t.id === 'team_kol' || t.shortName === 'KOL'
            ? 'KKR'
            : t.shortName;
          return {
            ...t,
            shortName: normShort,
            squad: t.squad && t.squad.length > 5
              ? t.squad
              : loadedPlayers.filter(p => p.clubId === t.id)
          };
        });
        resolvedTeams = hydratedTeams;
        setTeams(hydratedTeams);
      }

      let resolvedLeagues = leagues;
      if (Array.isArray(parsed.leagues) && parsed.leagues.length > 0) {
        const normalizedLeagues = parsed.leagues
          .filter((l: League) => Boolean(l && l.id && Array.isArray(l.standings)))
          .map((l: League) => {
            const normYr = normalizeSeasonYear(l.seasonName || l.seasonYear);
            const cleanedHistory: Record<string, TeamSeasonRecord[]> = {};
            if (l.teamSeasonHistory && typeof l.teamSeasonHistory === 'object') {
              Object.entries(l.teamSeasonHistory).forEach(([tId, records]) => {
                if (Array.isArray(records)) {
                  cleanedHistory[tId] = records.filter(r => parseInt(String(r.seasonYear), 10) >= 2026);
                }
              });
            }
            return {
              ...l,
              seasonName: normYr,
              seasonYear: parseInt(normYr, 10) || 2026,
              teamSeasonHistory: cleanedHistory
            };
          });
        if (normalizedLeagues.length > 0) {
          resolvedLeagues = normalizedLeagues;
          setLeagues(normalizedLeagues);
        }
      }

      const resolvedNations: Nation[] = Array.isArray(parsed.nations) ? parsed.nations : nations;
      if (Array.isArray(parsed.nations)) setNations(resolvedNations);
      if (Array.isArray(parsed.achievements)) setAchievements(parsed.achievements);
      if (parsed.homePitch) setHomePitch(parsed.homePitch);
      if (typeof parsed.simTokens === 'number') setSimTokens(parsed.simTokens);
      if (typeof parsed.squadStamina === 'number') setSquadStamina(parsed.squadStamina);
      if (Array.isArray(parsed.completedMatchesHistory)) setCompletedMatchesHistory(parsed.completedMatchesHistory);
      if (Array.isArray(parsed.inboxMessages)) setInboxMessages(parsed.inboxMessages);

      const expectedSeasonYear = parsed.seasonName
        ? parseInt(normalizeSeasonYear(parsed.seasonName), 10) || undefined
        : undefined;
      const recovered = validateAndRecoverCareerState({
        rawPhase: parsed.careerPhase ?? 'league_stage',
        coachProfile: parsed.coachProfile || coachProfile,
        teams: resolvedTeams,
        leagues: resolvedLeagues,
        currentLeagueId: typeof parsed.currentLeagueId === 'string' ? parsed.currentLeagueId : currentLeagueId,
        expectedSeasonYear,
        nations: resolvedNations,
        nationalSquadIds: Array.isArray(parsed.nationalSquadIds) ? parsed.nationalSquadIds : nationalSquadIds,
        careerBoardReview: parsed.careerBoardReview !== undefined ? parsed.careerBoardReview : null,
        players: loadedPlayers,
        internationalSeries: parsed.internationalSeries || internationalSeries
      });

      const effectiveLeagueId = recovered.resolvedLeagueId || currentLeagueId;
      if (recovered.resolvedLeagueId && recovered.resolvedLeagueId !== currentLeagueId) {
        setCurrentLeagueId(recovered.resolvedLeagueId);
      }
      const nextSeries = recovered.internationalSeries || parsed.internationalSeries || internationalSeries;
      lastValidatedLeagueIdRef.current = effectiveLeagueId;
      lastValidatedSignatureRef.current = buildCareerValidationSignature({
        currentLeagueId: effectiveLeagueId,
        leagues: resolvedLeagues,
        coachProfile: recovered.coachProfile,
        careerBoardReview: recovered.careerBoardReview,
        internationalSeries: nextSeries,
        nationalSquadIds: recovered.nationalSquadIds,
        careerPhase: recovered.careerPhase
      });
      completedIntlSeriesRef.current = new Set(recovered.coachProfile.completedInternationalSeriesIds || []);
      lastInitializedSeasonKeyRef.current = null;

      if (recovered.internationalSeries) {
        setInternationalSeries(recovered.internationalSeries);
      } else if (parsed.internationalSeries) {
        setInternationalSeries(parsed.internationalSeries);
      }

      setCoachProfile(recovered.coachProfile);
      setNationalSquadIds(recovered.nationalSquadIds);
      setCareerPhase(recovered.careerPhase);
      setCareerBoardReview(recovered.careerBoardReview);

      const cleanedHonors = sanitizeTournamentHonors(parsed.tournamentHonors);
      setTournamentHonors(cleanedHonors);
      localStorage.setItem('ms_tournament_honors_v6', JSON.stringify(cleanedHonors));
      sound.playCrowdCheer(0.7);
      return true;
    } catch {
      return false;
    }
  }, [
    setHomePitch,
    setNationalSquadIds,
    setActiveSaveSlot,
    setCareerPhase,
    setCareerBoardReview,
    players,
    teams,
    leagues,
    currentLeagueId,
    nations,
    coachProfile,
    nationalSquadIds,
    internationalSeries
  ]);

  const deleteSlot = useCallback((slotNumber: 1 | 2 | 3) => {
    localStorage.removeItem(`ms_save_slot_v6_${slotNumber}`);
    AsyncStorage.removeItem(`ms_save_slot_v6_${slotNumber}`).catch(() => {});
    setSaveSlots(prev => prev.map(s => {
      if (s.slotNumber === slotNumber) {
        return {
          slotNumber,
          hasSave: false,
          teamName: 'Empty Slot',
          teamShortName: '---',
          logoEmoji: '📂',
          seasonName: 'No career saved',
          savedAt: ''
        };
      }
      return s;
    }));
    sound.playTap();
  }, []);

  const [matchLiveState, setMatchLiveState] = useState<MatchLiveState | null>(null);
  const [pendingRetentionModal, setPendingRetentionModal] = useState<boolean>(false);
  const recordedMatchIdsRef = useRef<Set<string>>(new Set());

  // Auction State
  const [auctionLot, setAuctionLot] = useState<AuctionLot | null>(null);
  const [auctionPool, setAuctionPool] = useState<Player[]>([]);
  const [currentAuctionIndex, setCurrentAuctionIndex] = useState<number>(0);
  const [isAiBidding, setIsAiBidding] = useState<boolean>(false);
  const [aiBiddingSpeed, setAiBiddingSpeed] = useState<'instant' | 'fast' | 'normal'>('normal');

  // Save changes to v6 keys safely with compact data and auto-sync to the currently active save slot
  useEffect(() => {
    safeStorageSet('ms_players_v6', JSON.stringify(players));
  }, [players]);

  useEffect(() => {
    // Strip redundant 250-player squad arrays to prevent duplicate megabytes of data
    const compactTeams = teams.map(t => ({ ...t, squad: [] }));
    safeStorageSet('ms_teams_v6', JSON.stringify(compactTeams));
  }, [teams]);

  useEffect(() => {
    // Strip heavy match telemetry from calendar fixtures
    const compactLeagues = leagues.map(l => ({
      ...l,
      calendarDates: (l.calendarDates || []).map(cd => ({
        ...cd,
        matchFixture: cd.matchFixture ? { ...cd.matchFixture, completedMatchState: undefined } : undefined,
        otherMatches: (cd.otherMatches || []).map(om => ({ ...om, completedMatchState: undefined }))
      }))
    }));
    safeStorageSet('ms_leagues_v6', JSON.stringify(compactLeagues));
  }, [leagues]);

  useEffect(() => {
    safeStorageSet('ms_nations_v6', JSON.stringify(nations));
  }, [nations]);

  useEffect(() => {
    safeStorageSet('ms_profile_v6', JSON.stringify(coachProfile));
  }, [coachProfile]);

  useEffect(() => {
    safeStorageSet('ms_achievements_v6', JSON.stringify(achievements));
  }, [achievements]);

  useEffect(() => {
    safeStorageSet('ms_sim_tokens_v6', String(simTokens));
  }, [simTokens]);

  useEffect(() => {
    safeStorageSet('ms_squad_stamina_v6', String(squadStamina));
  }, [squadStamina]);

  useEffect(() => {
    safeStorageSet('ms_completed_matches_v6', JSON.stringify((completedMatchesHistory || []).slice(0, 10)));
  }, [completedMatchesHistory]);

  useEffect(() => {
    safeStorageSet('ms_inbox_messages_v6', JSON.stringify((inboxMessages || []).slice(0, 8)));
  }, [inboxMessages]);

  useEffect(() => {
    safeStorageSet('ms_intl_series_v6', JSON.stringify(internationalSeries));
  }, [internationalSeries]);

  useEffect(() => {
    safeStorageSet('ms_tournament_honors_v6', JSON.stringify(tournamentHonors));
  }, [tournamentHonors]);

  // Automatically keep the active save slot synced with debouncing to prevent thrashing storage quota
  useEffect(() => {
    const timer = setTimeout(() => {
      const activeLeague = leagues.find(l => l.id === currentLeagueId) || leagues[0];
      writeSlotSnapshot(activeSaveSlot, {
        team: userTeam,
        seasonName: normalizeSeasonYear(activeLeague?.seasonName),
        coach: coachProfile,
        teams,
        players,
        leagues,
        nations,
        achievements,
        homePitch,
        simTokens,
        squadStamina,
        completedMatchesHistory,
        inboxMessages,
        nationalSquadIds,
        internationalSeries,
        tournamentHonors
      });
    }, 1500);

    return () => clearTimeout(timer);
  }, [
    activeSaveSlot, userTeam, leagues, currentLeagueId, coachProfile,
    teams, players, nations, achievements, homePitch, simTokens,
    squadStamina, completedMatchesHistory, inboxMessages,
    nationalSquadIds, internationalSeries, tournamentHonors, writeSlotSnapshot
  ]);

  const unlockAchievement = useCallback((id: string) => {
    setAchievements(prev => prev.map(a => {
      if (a.id === id && !a.unlocked) {
        sound.playCrowdCheer(0.6);
        return {
          ...a,
          unlocked: true,
          unlockedDate: 'TODAY'
        };
      }
      return a;
    }));
  }, []);

  const updatePlayer = useCallback((updated: Player) => {
    setPlayers(prev => prev.map(p => p.id === updated.id ? updated : p));
    setTeams(prev => prev.map(t => ({
      ...t,
      squad: t.squad.map(p => p.id === updated.id ? updated : p)
    })));
  }, []);

  // Complete career reset starting from 0 for all players, teams, standings, and coach stats
  const startNewCareer = useCallback((
    teamId: string,
    coachOverrides?: Partial<CoachProfile>,
    targetSlot?: 1 | 2 | 3
  ) => {
    const slotToUse = targetSlot || activeSaveSlot;
    setActiveSaveSlot(slotToUse);

    const freshPlayers = createFreshPlayers();
    const freshTeams = INITIAL_TEAMS.map(t => ({
      ...t,
      isUserTeam: t.id === teamId,
      squad: freshPlayers.filter(p => p.clubId === t.id)
    }));
    const chosenTeam = freshTeams.find(t => t.id === teamId) || freshTeams[0];

    const freshStandings = INITIAL_TEAMS.map(t => ({
      teamId: t.id,
      played: 0,
      won: 0,
      lost: 0,
      tied: 0,
      points: 0,
      nrr: 0,
      recentForm: [] as ('W' | 'L' | 'T')[]
    }));

    const freshLeagues: League[] = INITIAL_LEAGUES.map(l => ({
      ...l,
      seasonName: '2026',
      seasonYear: 2026,
      teamSeasonHistory: {},
      standings: freshStandings,
      playoffs: createInitialPlayoffs(freshStandings),
      currentDateIndex: 0,
      calendarDates: buildSeasonCalendarForTeam(teamId, freshTeams, false, 2026)
    }));

    const freshNations = INITIAL_NATIONS.map(n => ({
      ...n,
      isUserManaging: false,
      isCoachedByPlayer: false
    }));

    const freshCoach: CoachProfile = {
      ...INITIAL_COACH_PROFILE,
      name: coachOverrides?.name || coachProfile.name || 'Arjun Rao',
      age: coachOverrides?.age || coachProfile.age || 44,
      nationality: coachOverrides?.nationality || coachProfile.nationality || 'India',
      difficulty: coachOverrides?.difficulty || coachProfile.difficulty || 'Normal',
      reputation: 'Rookie',
      proUnlocked: true,
      clubTeamId: teamId,
      nationalTeamId: null,
      domesticTitles: 0,
      internationalTitles: 0,
      domesticStats: {
        seasons: 1,
        matches: 0,
        wins: 0,
        losses: 0,
        winPct: 0,
        titles: 0,
        playoffRuns: 0,
        bestStreak: 0,
        currentStreak: 0
      },
      nationalStats: {
        matches: 0,
        wins: 0,
        losses: 0,
        winPct: 0,
        worldCups: 0,
        rank: 1
      },
      stats: {
        matchesCoached: 0,
        matchesWon: 0,
        matchesLost: 0,
        matchesTied: 0,
        winPercentage: 0,
        bestWinStreak: 0,
        trophies: []
      },
      boardTargets: INITIAL_COACH_PROFILE.boardTargets.map(bt => ({ ...bt, completed: false })),
      clubStints: [
        {
          id: `stint_${teamId}_2026`,
          teamId,
          teamName: chosenTeam.city || chosenTeam.name,
          period: '2026–present',
          seasons: 1,
          matches: 0,
          wins: 0,
          losses: 0,
          winPct: 0,
          titles: 0
        }
      ]
    };

    const freshAchievements = INITIAL_ACHIEVEMENTS.map(a => ({
      ...a,
      unlocked: false,
      unlockedDate: undefined
    }));
    const freshInbox = buildInitialInboxMessages(chosenTeam, freshPlayers);
    const freshIntlSeries = buildInitialSeriesForNation(freshNations[0], freshNations);
    const freshNatSquadIds = freshPlayers.filter(p => p.country === 'India').slice(0, 15).map(p => p.id);

    recordedMatchIdsRef.current.clear();
    completedIntlSeriesRef.current.clear();
    lastInitializedSeasonKeyRef.current = null;
    setMatchLiveState(null);
    setCurrentLeagueId('pt20');
    setCareerPhase('league_stage');
    setCareerBoardReview(null);
    setPlayers(freshPlayers);
    setTeams(freshTeams);
    setLeagues(freshLeagues);
    setNations(freshNations);
    setCoachProfile(freshCoach);
    setAchievements(freshAchievements);
    setCompletedMatchesHistory([]);
    setInboxMessages(freshInbox);
    setInternationalSeries(freshIntlSeries);
    setNationalSquadIds(freshNatSquadIds);
    lastValidatedLeagueIdRef.current = 'pt20';
    lastValidatedSignatureRef.current = buildCareerValidationSignature({
      currentLeagueId: 'pt20',
      leagues: freshLeagues,
      coachProfile: freshCoach,
      careerBoardReview: null,
      internationalSeries: freshIntlSeries,
      nationalSquadIds: freshNatSquadIds,
      careerPhase: 'league_stage'
    });
    setTournamentHonors([]);
    safeStorageSet('ms_tournament_honors_v6', JSON.stringify([]));
    setSquadStamina(100);
    setHomePitch('Natural');

    writeSlotSnapshot(slotToUse, {
      team: chosenTeam,
      seasonName: '2026',
      coach: freshCoach,
      teams: freshTeams,
      players: freshPlayers,
      leagues: freshLeagues,
      nations: freshNations,
      achievements: freshAchievements,
      homePitch: 'Natural',
      simTokens: 999,
      squadStamina: 100,
      completedMatchesHistory: [],
      inboxMessages: freshInbox,
      nationalSquadIds: freshNatSquadIds,
      internationalSeries: freshIntlSeries,
      tournamentHonors: []
    });

    sound.playTap();
  }, [activeSaveSlot, coachProfile.name, coachProfile.age, coachProfile.nationality, coachProfile.difficulty, setActiveSaveSlot, setHomePitch, setNationalSquadIds, writeSlotSnapshot]);

  const switchUserClub = useCallback((newClubId: string) => {
    const res = applySwitchUserClubState(
      {
        coachProfile,
        teams,
        nations,
        leagues,
        currentLeagueId,
        careerPhase
      },
      newClubId
    );
    if (!res.success) return;
    setTeams(res.teams);
    setNations(res.nations);
    setCoachProfile(res.coachProfile);
    setCareerPhase(res.careerPhase);
    sound.playTap();
  }, [coachProfile, teams, nations, leagues, currentLeagueId, careerPhase, setCareerPhase]);

  const selectUserTeam = useCallback((teamId: string) => {
    switchUserClub(teamId);
  }, [switchUserClub]);

  const replyToInboxMessage = useCallback((
    messageId: string,
    replyOption: 'promise_game_time' | 'demand_nets' | 'back_current_xi'
  ) => {
    const targetMsg = inboxMessages.find(m => m.id === messageId);
    if (!targetMsg || targetMsg.resolved) return;

    sound.playTap();
    let replyLabel = '';
    let impactSummary = '';

    if (replyOption === 'promise_game_time') {
      replyLabel = 'Promised upcoming game time';
      impactSummary = '+10 Morale · +3 Form';
      const applyBoost = (p: Player): Player => {
        if (p.id === targetMsg.playerId) {
          return {
            ...p,
            morale: Math.min(100, (p.morale || 80) + 10),
            form: Math.min(100, (p.form || 75) + 3)
          };
        }
        return p;
      };
      setPlayers(prev => prev.map(applyBoost));
      setTeams(prev => prev.map(t => ({ ...t, squad: t.squad.map(applyBoost) })));
    } else if (replyOption === 'demand_nets') {
      replyLabel = 'Demanded harder work in nets';
      impactSummary = '+8 Form · +1 Temp · -4 Morale';
      const applyBoost = (p: Player): Player => {
        if (p.id === targetMsg.playerId) {
          return {
            ...p,
            form: Math.min(100, (p.form || 75) + 8),
            morale: Math.max(40, (p.morale || 80) - 4),
            ratings: {
              ...p.ratings,
              tmp: Math.min(99, (p.ratings.tmp || 75) + 1)
            }
          };
        }
        return p;
      };
      setPlayers(prev => prev.map(applyBoost));
      setTeams(prev => prev.map(t => ({ ...t, squad: t.squad.map(applyBoost) })));
    } else if (replyOption === 'back_current_xi') {
      replyLabel = 'Backed the current Starting XI';
      impactSummary = '+6 Captain Morale · +2 XI Morale';
      const applyBoost = (p: Player): Player => {
        if (p.clubId !== userTeam.id) return p;
        if (p.id === userTeam.captainId || p.isCaptain) {
          return { ...p, morale: Math.min(100, (p.morale || 82) + 6) };
        }
        if (userTeam.playingXIIds.includes(p.id)) {
          return { ...p, morale: Math.min(100, (p.morale || 80) + 2) };
        }
        if (p.id === targetMsg.playerId) {
          return { ...p, morale: Math.max(45, (p.morale || 78) - 2) };
        }
        return p;
      };
      setPlayers(prev => prev.map(applyBoost));
      setTeams(prev => prev.map(t => ({ ...t, squad: t.squad.map(applyBoost) })));
    }

    setInboxMessages(prev => prev.map(m =>
      m.id === messageId
        ? { ...m, resolved: true, selectedReply: replyLabel, impactSummary }
        : m
    ));
  }, [inboxMessages, userTeam.id, userTeam.captainId, userTeam.playingXIIds]);

  const updateCoachProfile = useCallback((updater: Partial<CoachProfile>) => {
    setCoachProfile(prev => ({ ...prev, ...updater }));
  }, []);

  const updateUserTeamXI = useCallback((newXIIds: string[]) => {
    setTeams(prev => prev.map(t => {
      if (t.id === userTeam.id) {
        return { ...t, playingXIIds: newXIIds };
      }
      return t;
    }));
    sound.playTap();
  }, [userTeam.id]);

  const setTeamCaptain = useCallback((playerId: string) => {
    setTeams(prev => prev.map(t => {
      if (t.id === userTeam.id) {
        return {
          ...t,
          captainId: playerId,
          squad: t.squad.map(p => ({ ...p, isCaptain: p.id === playerId }))
        };
      }
      return t;
    }));
    setPlayers(prev => prev.map(p => {
      if (p.clubId === userTeam.id) {
        return { ...p, isCaptain: p.id === playerId };
      }
      return p;
    }));
    sound.playCrowdCheer(0.5);
  }, [userTeam.id]);

  const acceptJobOffer = useCallback((offer: JobOffer) => {
    const res = applyAcceptJobOfferState(
      {
        coachProfile,
        teams,
        nations,
        players,
        leagues,
        currentLeagueId,
        nationalSquadIds,
        internationalSeries,
        careerPhase
      },
      offer
    );
    if (!res.success) return;

    setCoachProfile(res.coachProfile);
    setTeams(res.teams);
    setNations(res.nations);
    setNationalSquadIds(res.nationalSquadIds);
    setInternationalSeries(res.internationalSeries);
    setCareerPhase(res.careerPhase);

    if (res.acceptedNation) {
      unlockAchievement('ach_55');
      if (
        (res.acceptedNation.rankT20 ?? 99) <= 4 ||
        (res.acceptedNation.rankODI ?? 99) <= 4 ||
        (res.acceptedNation.rankTest ?? 99) <= 4
      ) {
        unlockAchievement('ach_59');
      }
    }

    sound.playCrowdCheer(0.7);
    setActiveTab('hub');
  }, [
    coachProfile,
    teams,
    nations,
    players,
    leagues,
    currentLeagueId,
    nationalSquadIds,
    internationalSeries,
    careerPhase,
    setNationalSquadIds,
    setInternationalSeries,
    setCareerPhase,
    unlockAchievement
  ]);

  const resignNationalJob = useCallback(() => {
    const res = applyResignNationalJobState({
      coachProfile,
      teams,
      nations,
      careerPhase
    });
    setCoachProfile(res.coachProfile);
    setTeams(res.teams);
    setNations(res.nations);
    setCareerPhase(res.careerPhase);
    sound.playTap();
  }, [coachProfile, teams, nations, careerPhase, setCareerPhase]);

  const applyCareerJobDecision = useCallback((selectedClubId: string, selectedCountryId?: string | null) => {
    const next = applyCareerJobDecisionState(
      {
        coachProfile,
        teams,
        nations,
        players,
        leagues,
        currentLeagueId,
        nationalSquadIds,
        internationalSeries,
        careerPhase,
        careerBoardReview
      },
      selectedClubId,
      selectedCountryId
    );
    setCoachProfile(next.coachProfile);
    setTeams(next.teams);
    setNations(next.nations);
    setNationalSquadIds(next.nationalSquadIds);
    setInternationalSeries(next.internationalSeries);
    setCareerPhase(next.careerPhase);
    setCareerBoardReview(next.careerBoardReview);
    sound.playTap();
  }, [
    coachProfile,
    teams,
    nations,
    players,
    leagues,
    currentLeagueId,
    nationalSquadIds,
    internationalSeries,
    careerPhase,
    careerBoardReview,
    setNationalSquadIds,
    setCareerPhase,
    setCareerBoardReview
  ]);

  const confirmNationalSquad = useCallback((nationIdOrName: string, selectedPlayerIds: string[]): { success: boolean; error?: string } => {
    const res = applyConfirmNationalSquadState(
      {
        nations,
        players,
        coachProfile,
        nationalSquadIds,
        internationalSeries,
        careerPhase
      },
      nationIdOrName,
      selectedPlayerIds
    );
    if (!res.success) {
      return { success: false, error: res.error };
    }
    setNations(res.nextState.nations);
    setCoachProfile(res.nextState.coachProfile);
    setNationalSquadIds(res.nextState.nationalSquadIds);
    setInternationalSeries(res.nextState.internationalSeries);
    setCareerPhase(res.nextState.careerPhase);
    sound.playCrowdCheer(0.8);
    return { success: true };
  }, [nations, players, coachProfile, nationalSquadIds, internationalSeries, careerPhase, setNationalSquadIds, setCareerPhase]);

  const completeInternationalSeries = useCallback((options?: { nextOpponentId?: string; requireSquadReselection?: boolean }): { success: boolean; error?: string; alreadyCompleted?: boolean } => {
    const activeSeriesKey = internationalSeries.seriesId || '';
    if (activeSeriesKey && completedIntlSeriesRef.current.has(activeSeriesKey)) {
      return {
        success: false,
        alreadyCompleted: true,
        error: `International series "${activeSeriesKey}" has already been completed.`
      };
    }

    const next = applyCompleteInternationalSeriesState(
      {
        nations,
        coachProfile,
        nationalSquadIds,
        internationalSeries,
        careerPhase
      },
      options
    );
    if (!next.success) {
      return {
        success: false,
        alreadyCompleted: next.alreadyCompleted,
        error: next.error
      };
    }
    const completedKey =
      next.coachProfile.completedInternationalSeriesIds?.[
        next.coachProfile.completedInternationalSeriesIds.length - 1
      ] || activeSeriesKey;
    if (completedKey) {
      completedIntlSeriesRef.current.add(completedKey);
    }
    setInternationalSeries(next.internationalSeries);
    setCareerPhase(next.careerPhase);
    setCoachProfile(next.coachProfile);
    sound.playCrowdCheer(0.8);
    return { success: true, alreadyCompleted: false };
  }, [nations, coachProfile, nationalSquadIds, internationalSeries, careerPhase, setCareerPhase, setInternationalSeries]);

  const validateClubSquad = useCallback((teamId?: string): { isValid: boolean; errors: string[] } => {
    const targetId = teamId || userTeam.id;
    const targetTeam = teams.find(t => t.id === targetId) || userTeam;
    const squad = targetTeam.squad || [];
    const errors: string[] = [];

    if (squad.length < 16) {
      errors.push(`Squad size (${squad.length}) is below the minimum IPL limit of 16 players.`);
    } else if (squad.length > 25) {
      errors.push(`Squad size (${squad.length}) exceeds the maximum IPL limit of 25 players.`);
    }

    const overseasCount = squad.filter(p => p.isOverseas || (p.country && p.country.toLowerCase() !== 'india')).length;
    if (overseasCount > 8) {
      errors.push(`Overseas player count (${overseasCount}) exceeds the maximum IPL limit of 8.`);
    }

    const uniqueIds = new Set(squad.map(p => p.id));
    if (uniqueIds.size !== squad.length) {
      errors.push('Squad contains duplicate player IDs.');
    }

    const foreignClubPlayers = squad.filter(p => p.clubId && p.clubId !== targetTeam.id);
    if (foreignClubPlayers.length > 0) {
      errors.push(`Squad contains ${foreignClubPlayers.length} player(s) registered to another franchise.`);
    }

    return { isValid: errors.length === 0, errors };
  }, [teams, userTeam]);

  const confirmClubSquad = useCallback((teamId: string, squadPlayerIds: string[]): { success: boolean; error?: string } => {
    const res = applyConfirmClubSquadState(
      {
        teams,
        players,
        careerPhase
      },
      teamId,
      squadPlayerIds
    );
    if (!res.success) {
      return { success: false, error: res.error };
    }
    setTeams(res.nextState.teams);
    setPlayers(res.nextState.players);
    setCareerPhase(res.nextState.careerPhase);
    sound.playTap();
    return { success: true };
  }, [teams, players, careerPhase, setCareerPhase]);

  const buildTempNationalTeam = useCallback((nationName: string, playerPool: Player[]): Team => {
    const natObj = nations.find(n => n.name.toLowerCase() === nationName.toLowerCase());
    const countryMatches = playerPool.filter(p => p.country.toLowerCase() === nationName.toLowerCase());
    const squad = countryMatches.slice(0, 15);
    return {
      id: natObj?.id || `nat_${nationName.toLowerCase().replace(/\s+/g, '_')}`,
      name: nationName,
      shortName: natObj?.code || nationName.slice(0, 3).toUpperCase(),
      city: nationName,
      primaryColor: '#0284c7',
      secondaryColor: '#38bdf8',
      logoEmoji: natObj?.flag || '🌐',
      purseCr: 100,
      rtmCards: 0,
      captainId: squad[0]?.id || 'p1',
      playingXIIds: squad.slice(0, 11).map(p => p.id),
      squad
    };
  }, [nations]);

  const simSingleIntlMatch = useCallback((
    homeNationName: string,
    awayNationName: string,
    format: 'T20' | 'ODI' | 'TEST'
  ): string => {
    const homeNat = buildTempNationalTeam(homeNationName, players);
    const awayNat = buildTempNationalTeam(awayNationName, players);
    const simRes = simulateAiFixtureScorecard(
      `intl_sim_${Date.now()}`,
      homeNat,
      awayNat,
      `${homeNationName} International Cricket Ground`,
      format,
      'intl',
      players,
      Date.now() % 1000
    );
    const nextPlayers = applyMatchToPlayerList(players, simRes.matchState);
    setPlayers(nextPlayers);
    setTeams(prev => prev.map(t => ({
      ...t,
      squad: t.squad.map(sp => nextPlayers.find(np => np.id === sp.id) || sp)
    })));
    return simRes.summary;
  }, [players, buildTempNationalTeam]);

  // Calendar advancement — dynamically simulates all AI domestic & international fixtures and updates every player's stats
  const advanceCalendarDay = useCallback((): boolean => {
    let activeLeague = leagues.find(l => l && l.id === currentLeagueId);
    if (!activeLeague) {
      // Attempt explicit legacy-save recovery through existing recovery mechanism (Requirement 3)
      const recovery = resolveActiveLeagueForRecovery({
        leagues,
        currentLeagueId,
        coachProfile: coachProfile || INITIAL_COACH_PROFILE,
        careerBoardReview,
        internationalSeries
      });
      if (recovery.recoveredByPolicy && recovery.league) {
        activeLeague = recovery.league;
        setCurrentLeagueId(recovery.league.id);
      } else {
        console.warn(`[advanceCalendarDay] Failed to strictly resolve active league for ID "${currentLeagueId}". Advancement cancelled.`);
        return false;
      }
    }

    const res = applyAdvanceCalendarDayState({
      league: activeLeague,
      leagues,
      currentLeagueId: activeLeague.id,
      teams,
      players,
      coachProfile,
      userTeamId: userTeam?.id,
      nations,
      careerPhase,
      tournamentHonors,
      careerBoardReview,
      internationalSeries
    });

    if (!res.advanced) {
      console.log(`[advanceCalendarDay] Advancement prevented: ${res.blockedReason}`);
      return false;
    }

    setCareerPhase(res.careerPhase);
    if (res.careerBoardReview !== careerBoardReview) {
      setCareerBoardReview(res.careerBoardReview);
    }
    if (res.tournamentHonors !== tournamentHonors) {
      setTournamentHonors(res.tournamentHonors);
      safeStorageSet('ms_tournament_honors_v6', JSON.stringify(res.tournamentHonors));
    }
    if (res.coachProfile && res.coachProfile !== coachProfile) {
      setCoachProfile(res.coachProfile);
    }

    if (res.leagues) {
      setLeagues(res.leagues);
    } else {
      setLeagues(prev => prev.map(l => (l.id === res.league.id ? res.league : l)));
    }

    const nextIdx = res.league.currentDateIndex % Math.max(1, res.league.calendarDates.length);
    const nextDayType = res.league.calendarDates[nextIdx]?.type || 'training';

    // Update squad stamina and replenish sim tokens on rest days
    if (nextDayType === 'rest') {
      setSquadStamina(99);
      setSimTokens(prev => Math.min(7, prev + 1));
    } else if (nextDayType === 'match') {
      setSquadStamina(prev => Math.max(78, prev - 2));
    } else {
      setSquadStamina(prev => Math.min(96, Math.max(82, prev + 3)));
    }

    // Natural recovery for tired/injured players + persist AI match stat updates (enhanced by Medical Center facility)
    const userInfra = (() => {
      try {
        const raw = localStorage.getItem(`cc26_infra_${userTeam.id}`);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    })();
    const medCenterTier = userInfra?.medicalCenterTier || 1;
    const fitnessRecovery = 2 + Math.floor(medCenterTier * 1.5);

    const finalPlayers = res.players.map(p => ({
      ...p,
      fitness: Math.min(100, p.fitness + fitnessRecovery),
      injuryDays: Math.max(0, p.injuryDays - (medCenterTier >= 3 ? 2 : 1)),
      isInjured: p.injuryDays - (medCenterTier >= 3 ? 2 : 1) > 0
    }));

    setPlayers(prevPlayers => {
      return prevPlayers.map(p => {
        const wp = finalPlayers.find(fp => fp.id === p.id);
        if (!wp) return p;
        return {
          ...p,
          fitness: wp.fitness,
          injuryDays: wp.injuryDays,
          isInjured: wp.isInjured,
          form: wp.form,
          stats: wp.stats ? { ...wp.stats } : p.stats,
          competitionStats: wp.competitionStats ? { ...wp.competitionStats } : p.competitionStats
        };
      });
    });
    setTeams(prev => prev.map(t => ({
      ...t,
      squad: t.squad.map(sp => {
        const fp = finalPlayers.find(f => f.id === sp.id);
        if (!fp) return sp;
        return {
          ...sp,
          fitness: fp.fitness,
          injuryDays: fp.injuryDays,
          isInjured: fp.isInjured,
          form: fp.form,
          stats: fp.stats ? { ...fp.stats } : sp.stats,
          competitionStats: fp.competitionStats ? { ...fp.competitionStats } : sp.competitionStats
        };
      })
    })));

    sound.playTap();
    return true;
  }, [
    currentLeagueId,
    leagues,
    players,
    teams,
    coachProfile,
    userTeam?.id,
    nations,
    careerPhase,
    tournamentHonors,
    careerBoardReview,
    internationalSeries,
    userTeam.id,
    setCurrentLeagueId
  ]);

  const setCalendarDateIndex = useCallback((idx: number) => {
    setLeagues(prev => prev.map(l => {
      if (l.id === currentLeagueId) {
        const clamped = Math.max(0, Math.min(l.calendarDates.length - 1, idx));
        const dayType = l.calendarDates[clamped]?.type;
        if (dayType === 'rest') {
          setSquadStamina(99);
        }
        return { ...l, currentDateIndex: clamped };
      }
      return l;
    }));
    sound.playTap();
  }, [currentLeagueId]);

  // Training drill with intensity & individual player XP progression (enhanced by Training Complex facility)
  const trainSquad = useCallback((drillType: string, intensity: string = 'STANDARD') => {
    const focus = drillType.toLowerCase();
    const normIntensity = intensity.toUpperCase();
    const proMult = 1.5;
    const intMult = normIntensity === 'HARD' ? 2 : normIntensity === 'LIGHT' ? 1 : 1.5;
    const statDelta = Math.max(1, Math.round(intMult));

    const userInfra = (() => {
      try {
        const raw = localStorage.getItem(`cc26_infra_${userTeam.id}`);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    })();
    const trainComplexTier = userInfra?.trainingComplexTier || 1;
    const infraXpMult = 1 + (trainComplexTier * 0.12);

    // Stamina adjustment based on intensity and focus
    const staminaDelta = focus === 'fitness'
      ? (normIntensity === 'LIGHT' ? +6 : +3)
      : (normIntensity === 'HARD' ? -8 : normIntensity === 'LIGHT' ? -2 : -5);
    setSquadStamina(prev => Math.max(50, Math.min(100, prev + staminaDelta)));

    let attributeUpdated = 'Squad Attributes';
    const xpGains: TrainingTraineeGain[] = [];

    const applyTrainingToPlayer = (p: Player): Player => {
      if (p.clubId !== userTeam.id) return p;

      const updated: Player = { ...p, ratings: { ...p.ratings } };
      let baseXp = 2;
      let statBoosted = 'BAT';

      if (focus === 'batting') {
        const isBatter = p.role === 'Top-order' || p.role === 'Middle-order' || p.role === 'Wk-bat' || p.role === 'All-rounder';
        baseXp = isBatter ? (p.age <= 25 ? 5 : 4) : 1;
        const xp = Math.max(1, Math.round(baseXp * intMult * (proMult > 1 ? 1.2 : 1) * infraXpMult));
        updated.ratings.bat = Math.min(99, updated.ratings.bat + (isBatter ? statDelta : 1));
        updated.ratings.pow = Math.min(99, updated.ratings.pow + (normIntensity === 'HARD' && isBatter ? 2 : 1));
        updated.ratings.tec = Math.min(99, (updated.ratings.tec || updated.ratings.bat) + 1);
        updated.form = Math.min(100, updated.form + (normIntensity === 'HARD' ? 3 : 2));
        statBoosted = 'BAT / POW';
        attributeUpdated = 'Batting technique & Power';
        xpGains.push({ playerId: p.id, name: p.name, role: p.role, xp, statBoosted });
      } else if (focus === 'bowling') {
        const isBowler = p.role === 'Pace' || p.role === 'Spin' || p.role === 'All-rounder';
        baseXp = isBowler ? (p.age <= 26 ? 5 : 4) : 1;
        const xp = Math.max(1, Math.round(baseXp * intMult * (proMult > 1 ? 1.2 : 1)));
        updated.ratings.bowl = Math.min(99, updated.ratings.bowl + (isBowler ? statDelta : 1));
        updated.ratings.ctrl = Math.min(99, updated.ratings.ctrl + (normIntensity === 'HARD' && isBowler ? 2 : 1));
        updated.ratings.dth = Math.min(99, updated.ratings.dth + 1);
        updated.form = Math.min(100, updated.form + (normIntensity === 'HARD' ? 3 : 2));
        statBoosted = 'BOWL / CTRL';
        attributeUpdated = 'Bowling accuracy & Potency';
        xpGains.push({ playerId: p.id, name: p.name, role: p.role, xp, statBoosted });
      } else if (focus === 'fielding') {
        baseXp = p.role === 'Wk-bat' || p.age <= 26 ? 4 : 3;
        const xp = Math.max(1, Math.round(baseXp * intMult));
        updated.ratings.cat = Math.min(99, (updated.ratings.cat ?? 70) + statDelta);
        updated.ratings.fld = Math.min(99, (updated.ratings.fld || updated.ratings.cat) + statDelta);
        updated.morale = Math.min(100, updated.morale + 3);
        statBoosted = 'CAT / FLD';
        attributeUpdated = 'Catching & Fielding Reflexes';
        xpGains.push({ playerId: p.id, name: p.name, role: p.role, xp, statBoosted });
      } else if (focus === 'fitness') {
        baseXp = p.fitness < 90 ? 5 : 3;
        const xp = Math.max(1, Math.round(baseXp * intMult));
        updated.fitness = Math.min(100, updated.fitness + 8 * statDelta);
        updated.ratings.fit = Math.min(99, (updated.ratings.fit || updated.fitness) + statDelta);
        updated.morale = Math.min(100, updated.morale + 2);
        statBoosted = 'FIT / STA';
        attributeUpdated = 'Stamina & Athletic Conditioning';
        xpGains.push({ playerId: p.id, name: p.name, role: p.role, xp, statBoosted });
      } else {
        // Mental focus
        baseXp = p.isCaptain || p.age <= 24 ? 5 : 3;
        const xp = Math.max(1, Math.round(baseXp * intMult));
        updated.ratings.tmp = Math.min(99, updated.ratings.tmp + statDelta);
        updated.ratings.comp = Math.min(99, (updated.ratings.comp || updated.ratings.tmp) + statDelta);
        updated.morale = Math.min(100, updated.morale + 4);
        updated.form = Math.min(100, updated.form + 2);
        statBoosted = 'TMP / MORALE';
        attributeUpdated = 'Temperament, Composure & Morale';
        xpGains.push({ playerId: p.id, name: p.name, role: p.role, xp, statBoosted });
      }
      return updated;
    };

    const nextPlayers = players.map(applyTrainingToPlayer);
    setPlayers(nextPlayers);
    setTeams(prev => prev.map(t => (
      t.id === userTeam.id
        ? { ...t, squad: t.squad.map(sp => nextPlayers.find(np => np.id === sp.id) || sp) }
        : t
    )));

    xpGains.sort((a, b) => b.xp - a.xp);

    sound.playTap();
    return {
      success: true,
      message: `Completed ${normIntensity} ${drillType.toUpperCase()} session! Boosted ${attributeUpdated}.`,
      xpGains
    };
  }, [coachProfile.proUnlocked, players, userTeam.id]);

  // Double XP boost for top 3 trainees on HubScreen
  const claimDoubleTrainingXp = useCallback((drillType: string, topPlayerIds: string[]) => {
    const focus = drillType.toLowerCase();
    const idSet = new Set(topPlayerIds);

    const applyBonus = (p: Player): Player => {
      if (!idSet.has(p.id)) return p;
      const updated: Player = { ...p, ratings: { ...p.ratings } };
      if (focus === 'batting') {
        updated.ratings.bat = Math.min(99, updated.ratings.bat + 1);
        updated.ratings.pow = Math.min(99, updated.ratings.pow + 1);
      } else if (focus === 'bowling') {
        updated.ratings.bowl = Math.min(99, updated.ratings.bowl + 1);
        updated.ratings.ctrl = Math.min(99, updated.ratings.ctrl + 1);
      } else if (focus === 'fielding') {
        updated.ratings.cat = Math.min(99, (updated.ratings.cat ?? 70) + 1);
        updated.ratings.fld = Math.min(99, (updated.ratings.fld || updated.ratings.cat) + 1);
      } else if (focus === 'fitness') {
        updated.fitness = Math.min(100, updated.fitness + 5);
        updated.ratings.fit = Math.min(99, (updated.ratings.fit || updated.fitness) + 1);
      } else {
        updated.ratings.tmp = Math.min(99, updated.ratings.tmp + 1);
        updated.morale = Math.min(100, updated.morale + 3);
      }
      updated.form = Math.min(100, updated.form + 2);
      return updated;
    };

    setPlayers(prev => prev.map(applyBonus));
    setTeams(prev => prev.map(t => (
      t.id === userTeam.id
        ? { ...t, squad: t.squad.map(applyBonus) }
        : t
    )));
  }, [userTeam.id]);

  // Boost squad morale & form from Hub Team Talk or Pre-Match Pep Talk
  const boostTeamMorale = useCallback((teamId: string, delta: number = 5) => {
    const applyMorale = (p: Player): Player => {
      if (p.clubId !== teamId) return p;
      return {
        ...p,
        morale: Math.max(0, Math.min(100, (p.morale || 80) + delta)),
        form: Math.max(0, Math.min(100, (p.form || 75) + Math.max(1, Math.round(delta / 2))))
      };
    };
    setPlayers(prev => prev.map(applyMorale));
    setTeams(prev => prev.map(t => (
      t.id === teamId
        ? { ...t, squad: t.squad.map(applyMorale) }
        : t
    )));
    sound.playCrowdCheer(0.6);
  }, []);

  // Release players into the auction pool and update team purse idempotently
  const releasePlayersForAuction = useCallback((teamId: string, releasedPlayerIds: string[], _updatedPurseCr?: number) => {
    const res = applyReleasePlayersForAuctionState(
      {
        teams,
        players,
        careerPhase
      },
      teamId,
      releasedPlayerIds
    );
    if (res.alreadyReleased) {
      return;
    }
    setPlayers(res.players);
    setTeams(res.teams);
    setCareerPhase(res.careerPhase);
  }, [teams, players, careerPhase, setCareerPhase]);

  // Transition to a new franchise season using the authoritative pure helper
  const startNewSeason = useCallback((selectedClubId?: string, selectedNationId?: string | null, nextYear?: number) => {
    const activeLeague = leagues.find(l => l.id === currentLeagueId) || leagues[0];
    const outgoingYr = parseInt(normalizeSeasonYear(activeLeague?.seasonName || activeLeague?.seasonYear), 10) || 2026;
    const targetYr = nextYear && nextYear > outgoingYr ? nextYear : outgoingYr + 1;
    const transitionKey = `${activeLeague?.id || currentLeagueId}_${targetYr}`;
    if (lastInitializedSeasonKeyRef.current === transitionKey) {
      return;
    }

    const res = applyStartNewFranchiseSeasonState(
      {
        players,
        teams,
        leagues,
        currentLeagueId,
        coachProfile,
        nations,
        tournamentHonors,
        careerPhase,
        careerBoardReview
      },
      selectedClubId,
      selectedNationId,
      nextYear
    );
    if (res.alreadyInitialized) {
      return;
    }
    lastInitializedSeasonKeyRef.current = transitionKey;
    setPlayers(res.players);
    setTeams(res.teams);
    setLeagues(res.leagues);
    setCoachProfile(res.coachProfile);
    setNations(res.nations);
    setTournamentHonors(res.tournamentHonors);
    safeStorageSet('ms_tournament_honors_v6', JSON.stringify(res.tournamentHonors));
    setCareerPhase(res.careerPhase);
    setCareerBoardReview(res.careerBoardReview);
    setSquadStamina(res.squadStamina);
    sound.playCrowdCheer(0.9);
  }, [
    players,
    teams,
    leagues,
    currentLeagueId,
    coachProfile,
    nations,
    tournamentHonors,
    careerPhase,
    careerBoardReview,
    setCareerPhase,
    setCareerBoardReview
  ]);

  const advanceOffSeasonToNextSeason = useCallback((nextYear?: number) => {
    const activeLeague = leagues.find(l => l.id === currentLeagueId) || leagues[0];
    const outgoingYr = parseInt(normalizeSeasonYear(activeLeague?.seasonName || activeLeague?.seasonYear), 10) || 2026;
    const targetYr = nextYear && nextYear > outgoingYr ? nextYear : outgoingYr + 1;
    const transitionKey = `${activeLeague?.id || currentLeagueId}_${targetYr}`;
    if (lastInitializedSeasonKeyRef.current === transitionKey) {
      return;
    }

    const res = applyAdvanceOffSeasonState(
      {
        players,
        teams,
        leagues,
        currentLeagueId,
        coachProfile,
        nations,
        tournamentHonors,
        careerPhase,
        careerBoardReview,
        squadStamina
      },
      nextYear
    );
    if (res.restDaysProcessed === 0) {
      return;
    }
    lastInitializedSeasonKeyRef.current = transitionKey;
    setPlayers(res.players);
    setTeams(res.teams);
    setLeagues(res.leagues);
    setCoachProfile(res.coachProfile);
    setNations(res.nations);
    setTournamentHonors(res.tournamentHonors);
    safeStorageSet('ms_tournament_honors_v6', JSON.stringify(res.tournamentHonors));
    setCareerPhase(res.careerPhase);
    setCareerBoardReview(res.careerBoardReview);
    setSquadStamina(res.squadStamina);
    sound.playCrowdCheer(0.9);
  }, [
    players,
    teams,
    leagues,
    currentLeagueId,
    coachProfile,
    nations,
    tournamentHonors,
    careerPhase,
    careerBoardReview,
    squadStamina,
    setCareerPhase,
    setCareerBoardReview
  ]);

  // START MATCH
  const startMatch = useCallback((
    opponentTeamId?: string,
    format: 'T20' | 'ODI' | 'TEST' = 'T20',
    isAwayMatch: boolean = false,
    fixtureId?: string
  ) => {
    const opp = (opponentTeamId ? teams.find(t => t.id === opponentTeamId && t.id !== userTeam.id) : null)
      || teams.find(t => t.id !== userTeam.id)
      || teams[1];

    // Build user XI and opp XI preserving batting lineup order
    const userXIPlayers = userTeam.playingXIIds
      .map(id => players.find(p => p.id === id))
      .filter((p): p is Player => Boolean(p));
    const oppXIPlayers = opp.playingXIIds
      .map(id => players.find(p => p.id === id))
      .filter((p): p is Player => Boolean(p));

    // Fallbacks if list incomplete
    const finalUserXI = userXIPlayers.length >= 2 ? userXIPlayers : players.filter(p => p.clubId === userTeam.id).slice(0, 11);
    const finalOppXI = oppXIPlayers.length >= 2 ? oppXIPlayers : players.filter(p => p.clubId === opp.id).slice(0, 11);

    // Innings 1: User team batting, Opponent bowling
    const initBatters: BatterInningsScorecard[] = finalUserXI.map((p, idx) => ({
      playerId: p.id,
      name: p.name,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      dismissal: 'not out',
      strikeRate: 0,
      isOnStrike: idx === 0
    }));

    const initBowlers: BowlerInningsScorecard[] = buildBowlerScorecardPool(finalOppXI);

    const maxOversForFormat = format === 'TEST' ? 90 : format === 'ODI' ? 50 : 20;

    const innings1: InningsData = {
      battingTeamId: userTeam.id,
      bowlingTeamId: opp.id,
      runs: 0,
      wickets: 0,
      overs: 0,
      ballsCompleted: 0,
      maxOvers: maxOversForFormat,
      currentOverRuns: 0,
      extras: { total: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0 },
      batters: initBatters,
      bowlers: initBowlers,
      currentStrikerId: finalUserXI[0]?.id || players[0]?.id,
      currentNonStrikerId: finalUserXI[1]?.id || players[1]?.id,
      currentBowlerId: initBowlers[0]?.playerId || finalOppXI[0]?.id,
      ballHistory: [],
      fallOfWickets: [],
      overRuns: []
    };

    const hostTeam = isAwayMatch ? opp : userTeam;
    const venue = hostTeam.id === 'team_kol'
      ? 'Eden Gardens, Kolkata'
      : hostTeam.id === 'team_che'
      ? 'M.A. Chidambaram Stadium, Chennai'
      : hostTeam.id === 'team_mum'
      ? 'Wankhede Stadium, Mumbai'
      : hostTeam.id === 'team_blr'
      ? 'M. Chinnaswamy Stadium, Bengaluru'
      : `${hostTeam.city} Cricket Stadium`;

    const mapPitch = (p: string): MatchLiveState['pitchType'] => {
      if (p === 'Dry Turner' || p === 'Dry & Turning') return 'Dry & Turning';
      if (p === 'Flat Track' || p === 'Flat Belter') return 'Flat Belter';
      if (p === 'Green Seamer') return 'Green Seamer';
      if (p === 'Sluggish Gripper') return 'Sluggish Gripper';
      return 'Natural';
    };

    const resolvedPitchType: MatchLiveState['pitchType'] = !isAwayMatch
      ? mapPitch(homePitch)
      : (opp.id === 'team_che' || opp.id === 'team_lko'
          ? 'Dry & Turning'
          : opp.id === 'team_blr' || opp.id === 'team_mum' || opp.id === 'team_hyd'
          ? 'Flat Belter'
          : opp.id === 'team_pun'
          ? 'Green Seamer'
          : 'Natural');

    const newMatch: MatchLiveState = {
      id: fixtureId || `match_${Date.now()}`,
      fixtureId,
      leagueId: currentLeagueId || 'pt20',
      format,
      homeTeam: isAwayMatch ? opp : userTeam,
      awayTeam: isAwayMatch ? userTeam : opp,
      venue,
      pitchType: resolvedPitchType,
      weather: 'Clear Night',
      currentInningsIndex: 1,
      innings1,
      innings2: null,
      targetRuns: null,
      status: 'in_progress',
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
        fielders: INITIAL_DEFAULT_FIELD
      },
      battingTactics: {
        approach: 'balanced',
        targetSide: 'all',
        runningRisk: 'normal'
      }
    };

    setMatchLiveState(newMatch);
    setActiveTab('live_match');
  }, [teams, userTeam, players, currentLeagueId, homePitch]);

  // FIX-05 & PHASE 12: START INTERNATIONAL MATCH USING SELECTED NATIONAL SQUAD
  const startInternationalMatch = useCallback((
    homeCountry: string = 'South Africa',
    awayCountry: string = 'India',
    venue: string = 'SuperSport Park, Centurion',
    format: 'T20' | 'ODI' | 'TEST' = 'T20',
    fixtureId?: string,
    competitionId?: string
  ) => {
    const coachedNation = coachProfile.nationalTeamId
      ? nations.find(n => n.id === coachProfile.nationalTeamId)
      : null;

    if (!coachedNation) {
      console.warn("Unplayable international fixture: Coach has no international contract.");
      return;
    }

    const homeNatObj = resolveInternationalMatchParticipant(homeCountry, nations);
    const awayNatObj = resolveInternationalMatchParticipant(awayCountry, nations);
    const resolvedHomeName = homeNatObj?.name || homeCountry;
    const resolvedAwayName = awayNatObj?.name || awayCountry;

    const isHomeCoached = Boolean(
      (homeNatObj && homeNatObj.id === coachedNation.id) ||
      resolvedHomeName.toLowerCase() === coachedNation.name.toLowerCase()
    );
    const isAwayCoached = Boolean(
      (awayNatObj && awayNatObj.id === coachedNation.id) ||
      resolvedAwayName.toLowerCase() === coachedNation.name.toLowerCase()
    );

    if (!isHomeCoached && !isAwayCoached) {
      console.warn(`Unplayable fixture: User represents ${coachedNation.name} and can only play matches for ${coachedNation.name}.`);
      return;
    }

    const getNationalXI = (countryName: string, useSelectedSquad: boolean): Player[] => {
      const countryLower = countryName.trim().toLowerCase();
      if (useSelectedSquad && nationalSquadIds.length >= 11) {
        const selected = nationalSquadIds
          .map(id => players.find(p => p.id === id))
          .filter((p): p is Player => Boolean(p && p.country && p.country.trim().toLowerCase() === countryLower))
          .slice(0, 11);
        if (selected.length >= 11) return selected;
      }
      const countryRoster = players.filter(
        p => p.country && p.country.trim().toLowerCase() === countryLower
      );
      return countryRoster.slice(0, 11);
    };

    const finalHomeXI = getNationalXI(resolvedHomeName, isHomeCoached);
    const finalAwayXI = getNationalXI(resolvedAwayName, isAwayCoached);

    const nationalHomeTeam: Team = {
      id: homeNatObj?.id || `nat_${resolvedHomeName.toLowerCase().replace(/\s+/g, '_')}`,
      name: resolvedHomeName,
      shortName: homeNatObj?.code || (resolvedHomeName === 'South Africa' ? 'SA' : resolvedHomeName === 'Australia' ? 'AUS' : resolvedHomeName.slice(0, 3).toUpperCase()),
      logoEmoji: homeNatObj?.flag || (resolvedHomeName === 'South Africa' ? '🇿🇦' : resolvedHomeName === 'Australia' ? '🇦🇺' : resolvedHomeName === 'England' ? '🏴󠁧󠁢󠁥󠁮󠁧󠁿' : '🏏'),
      primaryColor: '#007749',
      secondaryColor: '#FFB81C',
      leagueId: 'intl',
      city: resolvedHomeName === 'South Africa' ? 'Centurion' : 'Sydney',
      purseCr: 100,
      rtmCards: 0,
      captainId: finalHomeXI[0]?.id || '',
      playingXIIds: finalHomeXI.map(p => p.id),
      squad: finalHomeXI,
      isUserTeam: isHomeCoached
    };

    const nationalAwayTeam: Team = {
      id: awayNatObj?.id || `nat_${resolvedAwayName.toLowerCase().replace(/\s+/g, '_')}`,
      name: resolvedAwayName,
      shortName: awayNatObj?.code || (resolvedAwayName === 'India' ? 'IND' : resolvedAwayName.slice(0, 3).toUpperCase()),
      logoEmoji: awayNatObj?.flag || (resolvedAwayName === 'India' ? '🇮🇳' : '🏏'),
      primaryColor: '#0080FF',
      secondaryColor: '#FF9933',
      leagueId: 'intl',
      city: 'Mumbai',
      purseCr: 100,
      rtmCards: 0,
      captainId: finalAwayXI[0]?.id || '',
      playingXIIds: finalAwayXI.map(p => p.id),
      squad: finalAwayXI,
      isUserTeam: isAwayCoached
    };

    const firstBatXI = isAwayCoached ? finalAwayXI : finalHomeXI;
    const firstBowlXI = isAwayCoached ? finalHomeXI : finalAwayXI;
    const firstBatTeam = isAwayCoached ? nationalAwayTeam : nationalHomeTeam;
    const firstBowlTeam = isAwayCoached ? nationalHomeTeam : nationalAwayTeam;

    const initBatters: BatterInningsScorecard[] = firstBatXI.map((p, idx) => ({
      playerId: p.id,
      name: p.name,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      dismissal: 'not out',
      strikeRate: 0,
      isOnStrike: idx === 0
    }));

    const initBowlers: BowlerInningsScorecard[] = buildBowlerScorecardPool(firstBowlXI);

    const maxOversForFormat = format === 'TEST' ? 90 : format === 'ODI' ? 50 : 20;

    const innings1: InningsData = {
      battingTeamId: firstBatTeam.id,
      bowlingTeamId: firstBowlTeam.id,
      runs: 0,
      wickets: 0,
      overs: 0,
      ballsCompleted: 0,
      maxOvers: maxOversForFormat,
      currentOverRuns: 0,
      extras: { total: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0 },
      batters: initBatters,
      bowlers: initBowlers,
      currentStrikerId: firstBatXI[0]?.id || '',
      currentNonStrikerId: firstBatXI[1]?.id || '',
      currentBowlerId: initBowlers[0]?.playerId || firstBowlXI[0]?.id || '',
      ballHistory: [],
      fallOfWickets: [],
      overRuns: []
    };

    const isExplicitWtc =
      competitionId === 'wtc_test' ||
      competitionId === 'wtc' ||
      Boolean(fixtureId && fixtureId.startsWith('wtc_'));
    const isExplicitBilateral =
      competitionId === 'test_bilateral' ||
      competitionId === 't20i_bilateral' ||
      competitionId === 'odi_bilateral' ||
      competitionId === 'bilateral' ||
      Boolean(fixtureId && (fixtureId.startsWith('intl_fix_') || fixtureId.startsWith('cal_intl_')));

    let assignedLeagueId = 'intl';
    if (isExplicitWtc) {
      assignedLeagueId = 'wtc_test';
    } else if (isExplicitBilateral) {
      assignedLeagueId = format === 'TEST' ? 'test_bilateral' : format === 'ODI' ? 'odi_bilateral' : 't20i_bilateral';
    } else {
      const isSeriesMatch = Boolean(
        internationalSeries && Array.isArray(internationalSeries.matches) && (
          internationalSeries.matches.some(m => m && (m.fixtureId === fixtureId || (internationalSeries.seriesId && `intl_fix_${internationalSeries.seriesId}_${m.matchNumber}` === fixtureId))) ||
          (internationalSeries.format === format && (
            (resolvedHomeName === internationalSeries.userNationName && resolvedAwayName === internationalSeries.opponentNationName) ||
            (resolvedAwayName === internationalSeries.userNationName && resolvedHomeName === internationalSeries.opponentNationName)
          ))
        )
      );
      if (isSeriesMatch) {
        assignedLeagueId = format === 'TEST' ? 'test_bilateral' : format === 'ODI' ? 'odi_bilateral' : 't20i_bilateral';
      } else {
        // Unknown or ambiguous competition identity: keep as 'intl', do not assume WTC solely because format is 'TEST'
        assignedLeagueId = 'intl';
      }
    }

    const newMatch: MatchLiveState = {
      id: fixtureId || `intl_match_${Date.now()}`,
      fixtureId,
      leagueId: assignedLeagueId,
      format,
      homeTeam: nationalHomeTeam,
      awayTeam: nationalAwayTeam,
      venue,
      pitchType: 'Green Seamer',
      weather: format === 'TEST' ? 'Sunny & Hot' : 'Clear Night',
      currentInningsIndex: 1,
      innings1,
      innings2: null,
      targetRuns: null,
      status: 'in_progress',
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
        fielders: INITIAL_DEFAULT_FIELD
      },
      battingTactics: {
        approach: 'balanced',
        targetSide: 'all',
        runningRisk: 'normal'
      }
    };

    setMatchLiveState(newMatch);
    setActiveTab('live_match');
  }, [players, nations, coachProfile.nationalTeamId, nationalSquadIds, internationalSeries]);

  // TACTICAL UPDATERS
  const updateBowlingTactics = useCallback((tactics: Partial<MatchLiveState['bowlingTactics']>) => {
    setMatchLiveState(prev => {
      if (!prev) return null;
      return {
        ...prev,
        bowlingTactics: { ...prev.bowlingTactics, ...tactics }
      };
    });
    sound.playTap();
  }, []);

  const updateBattingTactics = useCallback((tactics: Partial<MatchLiveState['battingTactics']>) => {
    setMatchLiveState(prev => {
      if (!prev) return null;
      return {
        ...prev,
        battingTactics: { ...prev.battingTactics, ...tactics }
      };
    });
    sound.playTap();
  }, []);

  const updateFielders = useCallback((fielders: FielderPosition[]) => {
    setMatchLiveState(prev => {
      if (!prev) return null;
      return {
        ...prev,
        bowlingTactics: { ...prev.bowlingTactics, fielders }
      };
    });
    sound.playTap();
  }, []);

  const activateImpactPlayer = useCallback((benchPlayerId: string, outPlayerId: string) => {
    const benchPlayer = players.find(p => p.id === benchPlayerId);
    if (!benchPlayer) return;

    setMatchLiveState(prev => {
      if (!prev) return null;
      const isFirst = prev.currentInningsIndex === 1;
      const curInnings = isFirst ? prev.innings1 : prev.innings2;
      if (!curInnings) return prev;

      // Determine which team the player belongs to
      const isHomeTeamSub = prev.homeTeam.playingXIIds.includes(outPlayerId);
      const isAwayTeamSub = prev.awayTeam.playingXIIds.includes(outPlayerId);
      const isHomeUser = prev.homeTeam.id === userTeam.id || prev.homeTeam.isUserTeam;
      const teamKey: 'homeTeam' | 'awayTeam' = isHomeTeamSub
        ? 'homeTeam'
        : isAwayTeamSub
        ? 'awayTeam'
        : isHomeUser
        ? 'homeTeam'
        : 'awayTeam';
      const activeTeam = prev[teamKey];

      const outBatterCard = curInnings.batters.find(b => b.playerId === outPlayerId);
      const validation = validateImpactPlayerSubstitution({
        benchPlayerId,
        outPlayerId,
        activeXIIds: activeTeam.playingXIIds,
        allPlayers: players,
        impactPlayerAlreadyUsed: prev.impactPlayerUsed,
        isInternational: Boolean(prev.isInternational),
        maxOverseasInXI: 4,
        outPlayerDismissalStatus: outBatterCard?.dismissal
      });

      if (!validation.isValid) {
        console.warn(`[Impact Player Blocked] ${validation.reason}`);
        return prev;
      }

      const updatedBatters = curInnings.batters.map(b => {
        if (b.playerId === outPlayerId && b.dismissal === 'not out') {
          return { ...b, dismissal: 'substituted (Impact Sub)', isOnStrike: false };
        }
        return b;
      });

      if (!updatedBatters.some(b => b.playerId === benchPlayer.id)) {
        updatedBatters.push({
          playerId: benchPlayer.id,
          name: benchPlayer.name,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          dismissal: 'not out',
          strikeRate: 0,
          isOnStrike: curInnings.currentStrikerId === outPlayerId
        });
      }

      const updatedBowlers = [...curInnings.bowlers];
      if (!updatedBowlers.some(b => b.playerId === benchPlayer.id)) {
        updatedBowlers.push({
          playerId: benchPlayer.id,
          name: benchPlayer.name,
          overs: 0,
          ballsInCurrentOver: 0,
          maidens: 0,
          runs: 0,
          wickets: 0,
          economy: 0,
          isCurrentBowler: curInnings.currentBowlerId === outPlayerId
        });
      }

      const nextStrikerId = curInnings.currentStrikerId === outPlayerId ? benchPlayer.id : curInnings.currentStrikerId;
      const nextNonStrikerId = curInnings.currentNonStrikerId === outPlayerId ? benchPlayer.id : curInnings.currentNonStrikerId;
      const nextBowlerId = curInnings.currentBowlerId === outPlayerId ? benchPlayer.id : curInnings.currentBowlerId;

      const updatedInnings: InningsData = {
        ...curInnings,
        batters: updatedBatters.map(b => ({ ...b, isOnStrike: b.playerId === nextStrikerId })),
        bowlers: updatedBowlers,
        currentStrikerId: nextStrikerId,
        currentNonStrikerId: nextNonStrikerId,
        currentBowlerId: nextBowlerId
      };

      const newPlayingXIIds = activeTeam.playingXIIds.map(id => id === outPlayerId ? benchPlayerId : id);

      return {
        ...prev,
        impactPlayerUsed: true,
        homeTeam: teamKey === 'homeTeam'
          ? { ...prev.homeTeam, playingXIIds: newPlayingXIIds }
          : prev.homeTeam,
        awayTeam: teamKey === 'awayTeam'
          ? { ...prev.awayTeam, playingXIIds: newPlayingXIIds }
          : prev.awayTeam,
        innings1: isFirst ? updatedInnings : prev.innings1,
        innings2: isFirst ? prev.innings2 : updatedInnings
      };
    });
    sound.playCrowdCheer(0.5);
  }, [players, userTeam.id]);

  // PURE STATE TRANSITION HELPER FOR SINGLE DELIVERY (Delegates to Authoritative Engine)
  const simulateSingleDeliveryState = useCallback((
    state: MatchLiveState,
    autoRotateBowler: boolean = false
  ): {
    nextState: MatchLiveState;
    matchJustFinished: boolean;
    userWon: boolean;
    inningsJustBroke: boolean;
    lastOutcome: BallOutcome | null;
  } => {
    if (!state || state.status === 'finished' || state.activeDrsReview?.isActive) {
      return { nextState: state, matchJustFinished: false, userWon: false, inningsJustBroke: false, lastOutcome: null };
    }

    const isFirstInnings = state.currentInningsIndex === 1;
    const currentInnings = isFirstInnings ? state.innings1 : state.innings2;
    if (!currentInnings) {
      return { nextState: state, matchJustFinished: false, userWon: false, inningsJustBroke: false, lastOutcome: null };
    }

    const quota = getFormatQuotaConfig(state.format, currentInnings.maxOvers);
    const maxBalls = quota.maxBalls;

    const bowlingTeam = currentInnings.bowlingTeamId === state.homeTeam.id ? state.homeTeam : state.awayTeam;
    const battingTeam = currentInnings.battingTeamId === state.homeTeam.id ? state.homeTeam : state.awayTeam;

    const striker =
      players.find(p => p.id === currentInnings.currentStrikerId) ||
      battingTeam.squad.find(p => p.id === currentInnings.currentStrikerId) ||
      players[0];
    const bowler =
      players.find(p => p.id === currentInnings.currentBowlerId) ||
      bowlingTeam.squad.find(p => p.id === currentInnings.currentBowlerId) ||
      bowlingTeam.squad[0] ||
      players[2];

    const overNum = Math.floor(currentInnings.ballsCompleted / 6);

    // Compute live Opposition Tactical AI & Match-Up Trap alert
    let liveTrapAlert: string | null = null;
    if (bowler && striker) {
      if (bowler.bowlingArm === 'LAF' && striker.battingHand === 'RHB') {
        liveTrapAlert = `MATCH-UP TRAP: ${bowler.name} (Left-Arm Pace) targeting ${striker.name}'s incoming off-stump pad!`;
      } else if ((bowler.bowlingArm === 'LS' || bowler.role === 'Spin') && (striker.ratings.vs || 78) < 77) {
        liveTrapAlert = `SPIN WEAKNESS TRAP: ${bowler.name} brought on against ${striker.name} (vs Spin ${striker.ratings.vs || 74})!`;
      } else if ((state.bowlingTactics.length === 'bouncer' || state.bowlingTactics.length === 'short') && (striker.ratings.vp || 78) < 76) {
        liveTrapAlert = `BOUNCER BARRAGE: Short-pitched trap set for ${striker.name}!`;
      }
    }

    const isUserBatting =
      currentInnings.battingTeamId === userTeam.id ||
      (Boolean(state.homeTeam.isUserTeam) && currentInnings.battingTeamId === state.homeTeam.id) ||
      (Boolean(state.awayTeam.isUserTeam) && currentInnings.battingTeamId === state.awayTeam.id);
    const isUserBowling =
      currentInnings.bowlingTeamId === userTeam.id ||
      (Boolean(state.homeTeam.isUserTeam) && currentInnings.bowlingTeamId === state.homeTeam.id) ||
      (Boolean(state.awayTeam.isUserTeam) && currentInnings.bowlingTeamId === state.awayTeam.id);

    let effectiveBattingTactics = state.battingTactics;
    if (!isUserBatting) {
      const rrr = (!isFirstInnings && state.targetRuns)
        ? (state.targetRuns - currentInnings.runs) / Math.max(0.1, (maxBalls - currentInnings.ballsCompleted) / 6)
        : null;
      let aiApproach: 'defensive' | 'balanced' | 'aggressive' | 'smash' = 'balanced';
      if (overNum >= Math.floor(maxBalls / 6) - 4 || (rrr && rrr > 12)) {
        aiApproach = 'smash';
      } else if (overNum < 6 || (rrr && rrr > 9)) {
        aiApproach = 'aggressive';
      } else if (currentInnings.wickets >= 4 && overNum < 10) {
        aiApproach = 'defensive';
      }
      effectiveBattingTactics = {
        approach: aiApproach,
        targetSide: 'all',
        runningRisk: 'normal',
        pairRunning: 'standard'
      };
    }

    let effectiveBowlingTactics = state.bowlingTactics;
    if (!isUserBowling) {
      effectiveBowlingTactics = {
        length: overNum >= Math.floor(maxBalls / 6) - 4 ? 'yorker' : 'good',
        line: 'off_stump',
        angle: 'over',
        variation: 'Stock ball',
        intent: overNum >= Math.floor(maxBalls / 6) - 4 ? 'contain' : overNum < 6 ? 'attack' : 'standard',
        effort: 'standard',
        keeperPos: bowler?.role === 'Spin' ? 'stumps' : 'normal',
        speed: 'standard',
        fielders: state.bowlingTactics.fielders
      };
    }

    const inputStateForDelivery: MatchLiveState = {
      ...state,
      battingTactics: effectiveBattingTactics,
      bowlingTactics: effectiveBowlingTactics
    };

    const resolved = resolveSingleDeliveryState(inputStateForDelivery, players);
    const ballOutcome = resolved.lastBallOutcome;

    // Preserve user's selected tactics while swapping striker/non-striker approaches if strike rotated
    const postInn = isFirstInnings ? resolved.innings1 : resolved.innings2;
    const strikeRotated =
      postInn &&
      postInn.currentStrikerId !== currentInnings.currentStrikerId &&
      !ballOutcome?.isWicket;
    const updatedUserBattingTactics =
      strikeRotated && state.battingTactics.nonStrikerApproach
        ? {
            ...state.battingTactics,
            approach: state.battingTactics.nonStrikerApproach,
            nonStrikerApproach: state.battingTactics.approach
          }
        : state.battingTactics;

    // Check if Innings 1 just transitioned to Innings 2
    if (isFirstInnings && resolved.currentInningsIndex === 2) {
      const inn2MaxOvers = state.dlsState?.revisedMaxOvers || state.innings1.maxOvers || quota.maxOvers;
      const computedTarget = state.dlsState?.isInterrupted
        ? calculateDLSTarget(
            resolved.innings1.runs,
            state.dlsState.originalMaxOvers,
            state.dlsState.revisedMaxOvers,
            0
          ).dlsTargetRuns
        : resolved.innings1.runs + 1;

      const nextStateInningsBreak: MatchLiveState = {
        ...resolved,
        currentInningsIndex: 1,
        status: 'innings_break',
        targetRuns: computedTarget,
        innings2: resolved.innings2
          ? { ...resolved.innings2, maxOvers: inn2MaxOvers }
          : null,
        battingTactics: updatedUserBattingTactics,
        bowlingTactics: state.bowlingTactics,
        tacticalTrapAlert: liveTrapAlert,
        isBallInFlight: true
      };

      return {
        nextState: nextStateInningsBreak,
        matchJustFinished: false,
        userWon: false,
        inningsJustBroke: true,
        lastOutcome: ballOutcome
      };
    }

    // Check if Match just finished
    if (resolved.status === 'finished') {
      const winnerId = resolved.winnerTeamId;
      const isUserWinner = Boolean(
        winnerId &&
          (winnerId === userTeam.id ||
            (winnerId === resolved.homeTeam.id && resolved.homeTeam.isUserTeam) ||
            (winnerId === resolved.awayTeam.id && resolved.awayTeam.isUserTeam))
      );

      return {
        nextState: {
          ...resolved,
          battingTactics: updatedUserBattingTactics,
          bowlingTactics: state.bowlingTactics,
          tacticalTrapAlert: liveTrapAlert,
          isBallInFlight: true
        },
        matchJustFinished: true,
        userWon: isUserWinner,
        inningsJustBroke: false,
        lastOutcome: ballOutcome
      };
    }

    return {
      nextState: {
        ...resolved,
        battingTactics: updatedUserBattingTactics,
        bowlingTactics: state.bowlingTactics,
        tacticalTrapAlert: liveTrapAlert,
        isBallInFlight: true
      },
      matchJustFinished: false,
      userWon: false,
      inningsJustBroke: false,
      lastOutcome: ballOutcome
    };
  }, [players, teams, userTeam]);

  // RUN A SINGLE BALL SIMULATION
  const runBallSimulation = useCallback(() => {
    let outcomeToPlay: BallOutcome | null = null;
    let didFinish = false;
    let didUserWin = false;
    let didBreak = false;
    let finalRuns = 0;

    setMatchLiveState(prev => {
      if (!prev || prev.status === 'finished') return prev;
      const res = simulateSingleDeliveryState(prev, false);
      outcomeToPlay = res.lastOutcome;
      didFinish = res.matchJustFinished;
      didUserWin = res.userWon;
      didBreak = res.inningsJustBroke;
      const curInn = res.nextState.currentInningsIndex === 1 ? res.nextState.innings1 : res.nextState.innings2;
      finalRuns = curInn?.runs || 0;
      return res.nextState;
    });

    if (outcomeToPlay) {
      const lbo = outcomeToPlay as BallOutcome;
      if (lbo.isWicket) {
        sound.playWicketCrash();
      } else {
        const isBatContact = (lbo.batterRuns ?? 0) > 0 || (!lbo.isExtra && lbo.runs > 0);
        if (isBatContact) {
          if (lbo.isSix) {
            sound.playBatHit(true, true);
          } else if (lbo.isFour) {
            sound.playBatHit(true, false);
          } else {
            sound.playBatHit(false, false);
          }
        }
      }
    }

    if (didBreak) {
      sound.playCrowdCheer(0.6);
    } else if (didFinish && didUserWin) {
      sound.playCrowdCheer(1.5);
      confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });
      unlockAchievement('ach_first_blood');
      if (finalRuns >= 200) unlockAchievement('ach_two_hundred_up');
    }

    setTimeout(() => {
      setMatchLiveState(prev => prev ? { ...prev, isBallInFlight: false } : null);
    }, 400);
  }, [simulateSingleDeliveryState, unlockAchievement]);

  // SIM OVER (Simulate remaining balls in current over, or multiple overs with automatic bowler rotation)
  const simCurrentOver = useCallback((oversCount: number = 1) => {
    let didFinish = false;
    let didUserWin = false;
    const totalOversToSim = Math.max(1, oversCount);

    setMatchLiveState(prev => {
      if (!prev || prev.status === 'finished') return prev;
      let curr = prev;
      const defaultMaxOvers = curr.format === 'TEST' ? 90 : curr.format === 'ODI' ? 50 : 4;

      for (let ovIdx = 0; ovIdx < totalOversToSim; ovIdx++) {
        if (curr.status !== 'in_progress') break;

        // If we are at the start of a new over (ballsCompleted > 0 && % 6 === 0) and the current bowler
        // just bowled the previous ball, rotate to an eligible bowler before bowling this over
        const startInn = curr.currentInningsIndex === 1 ? curr.innings1 : curr.innings2;
        if (startInn && startInn.ballsCompleted > 0 && startInn.ballsCompleted % 6 === 0) {
          const quota = getFormatQuotaConfig(curr.format, startInn.maxOvers);
          const prevBallBowlerId = startInn.ballHistory[0]?.bowlerId;
          if (prevBallBowlerId && startInn.currentBowlerId === prevBallBowlerId) {
            const nextBowlerId = selectNextEligibleBowler(
              startInn.bowlers,
              prevBallBowlerId,
              quota.maxBallsPerBowler,
              Math.floor(startInn.ballsCompleted / 6),
              curr.format,
              players
            );
            if (nextBowlerId && nextBowlerId !== startInn.currentBowlerId) {
              const rotatedInn: InningsData = {
                ...startInn,
                currentBowlerId: nextBowlerId,
                bowlers: startInn.bowlers.map(b => ({
                  ...b,
                  isCurrentBowler: b.playerId === nextBowlerId
                }))
              };
              curr = {
                ...curr,
                innings1: curr.currentInningsIndex === 1 ? rotatedInn : curr.innings1,
                innings2: curr.currentInningsIndex === 1 ? curr.innings2 : rotatedInn
              };
            }
          }
        }

        let legalBallsSimulated = 0;
        const shouldAutoRotateAtOverEnd = totalOversToSim > 1 && ovIdx < totalOversToSim - 1;

        while (legalBallsSimulated < 6 && curr.status === 'in_progress') {
          const res = simulateSingleDeliveryState(curr, shouldAutoRotateAtOverEnd);
          curr = res.nextState;
          if (res.matchJustFinished) {
            didFinish = true;
            didUserWin = res.userWon;
            break;
          }
          if (res.inningsJustBroke) {
            break;
          }
          const wasLegal = res.lastOutcome
            ? isLegalBallForBowler(res.lastOutcome.isExtra, res.lastOutcome.extraType)
            : true;
          if (wasLegal) {
            legalBallsSimulated++;
          }
          const activeInn = curr.currentInningsIndex === 1 ? curr.innings1 : curr.innings2;
          if (activeInn && activeInn.ballsCompleted > 0 && activeInn.ballsCompleted % 6 === 0 && wasLegal) {
            break;
          }
        }
      }
      return { ...curr, isBallInFlight: false };
    });

    sound.playTap();
    if (didFinish && didUserWin) {
      sound.playCrowdCheer(1.5);
      confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });
      unlockAchievement('ach_first_blood');
    }
  }, [simulateSingleDeliveryState, unlockAchievement]);

  // SIM ENTIRE MATCH (Pure functional loop across both innings)
  const simEntireMatch = useCallback(() => {
    let didFinish = false;
    let didUserWin = false;
    let finalRuns = 0;

    setMatchLiveState(prev => {
      if (!prev || prev.status === 'finished') return prev;
      let curr: MatchLiveState = { ...prev, status: 'in_progress' };
      let safetyCounter = 0;

      while (curr.status !== 'finished' && safetyCounter < 1500) {
        safetyCounter++;
        if (curr.status === 'innings_break') {
          curr = {
            ...curr,
            currentInningsIndex: 2,
            hasDew: curr.weather === 'Clear Night' || curr.weather === 'Overcast & Humid',
            status: 'in_progress'
          };
        }
        const res = simulateSingleDeliveryState(curr, true);
        curr = res.nextState;
        if (res.matchJustFinished) {
          didFinish = true;
          didUserWin = res.userWon;
          finalRuns = Math.max(curr.innings1.runs, curr.innings2?.runs || 0);
          break;
        }
      }

      return { ...curr, isBallInFlight: false };
    });

    sound.playCrowdCheer(1.0);
    if (didFinish && didUserWin) {
      confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });
      unlockAchievement('ach_first_blood');
      if (finalRuns >= 200) unlockAchievement('ach_two_hundred_up');
    }
  }, [simulateSingleDeliveryState, unlockAchievement]);

  // RECORD COMPLETED MATCH OUTCOMES (Player Stats, Standings, NRR, Playoffs & Coach KPIs)
  const recordCompletedMatch = useCallback((finishedMatch: MatchLiveState) => {
    if (!finishedMatch || finishedMatch.status !== 'finished') return;
    if (recordedMatchIdsRef.current.has(finishedMatch.id)) return;
    recordedMatchIdsRef.current.add(finishedMatch.id);

    const inn1 = finishedMatch.innings1;
    const inn2 = finishedMatch.innings2;

    const batterMap = new Map<string, BatterInningsScorecard>();
    inn1.batters.forEach(b => batterMap.set(b.playerId, b));
    inn2?.batters.forEach(b => batterMap.set(b.playerId, b));

    const bowlerMap = new Map<string, BowlerInningsScorecard>();
    const bowlerEntriesMap = new Map<string, BowlerInningsScorecard[]>();
    inn1.bowlers.forEach(bw => {
      bowlerMap.set(bw.playerId, bw);
      const list = bowlerEntriesMap.get(bw.playerId) || [];
      list.push(bw);
      bowlerEntriesMap.set(bw.playerId, list);
    });
    inn2?.bowlers.forEach(bw => {
      bowlerMap.set(bw.playerId, bw);
      const list = bowlerEntriesMap.get(bw.playerId) || [];
      list.push(bw);
      bowlerEntriesMap.set(bw.playerId, list);
    });

    // Check match feat achievements
    batterMap.forEach(b => {
      if (b.runs >= 100) {
        unlockAchievement('ach_4');
      }
    });
    bowlerMap.forEach(bw => {
      if (bw.wickets >= 5) {
        unlockAchievement('ach_5');
      }
      if (bw.overs >= 4 && bw.economy < 4) {
        unlockAchievement('ach_16');
      }
    });

    const winnerId = finishedMatch.winnerTeamId || finishedMatch.homeTeam.id;
    const loserId = winnerId === finishedMatch.homeTeam.id ? finishedMatch.awayTeam.id : finishedMatch.homeTeam.id;
    const didUserWin = winnerId === userTeam.id ||
      (winnerId === finishedMatch.homeTeam.id && finishedMatch.homeTeam.isUserTeam) ||
      (winnerId === finishedMatch.awayTeam.id && finishedMatch.awayTeam.isUserTeam);

    if (didUserWin) {
      unlockAchievement('ach_1');
      if (finishedMatch.impactPlayerUsed) {
        unlockAchievement('ach_18');
      }
      if (finishedMatch.dlsState?.isInterrupted) {
        unlockAchievement('ach_74');
      }
      const oppInnings = inn1.battingTeamId === userTeam.id ? inn2 : inn1;
      const userInnings = inn1.battingTeamId === userTeam.id ? inn1 : inn2;
      if (oppInnings && oppInnings.wickets >= 10 && oppInnings.runs < 100) {
        unlockAchievement('ach_6');
      }
      if (userInnings && inn1.battingTeamId === userTeam.id && userInnings.runs <= 140) {
        unlockAchievement('ach_7');
      }
      if (userInnings && userInnings.runs >= 200) {
        unlockAchievement('ach_8');
      }
      if (inn2 && inn2.battingTeamId === userTeam.id && inn2.wickets === 0) {
        unlockAchievement('ach_9');
      }
      if (userInnings && userInnings.batters.reduce((s, b) => s + b.sixes, 0) >= 12) {
        unlockAchievement('ach_12');
      }
      if (inn2 && inn2.battingTeamId === userTeam.id && (finishedMatch.targetRuns || 0) >= 180) {
        unlockAchievement('ach_15');
      }
    }

    // 1. Update participating players' season & career stats
    const activeLeague = leagues.find(l => l.id === currentLeagueId) || leagues[0];
    const currentActiveSeasonKey = normalizeSeasonYear(activeLeague?.seasonName);
    const applyStatsToPlayer = (p: Player): Player => recordMatchToPlayerStats(p, finishedMatch, currentActiveSeasonKey);

    setPlayers(prev => prev.map(applyStatsToPlayer));
    setTeams(prev => prev.map(t => ({
      ...t,
      squad: t.squad.map(applyStatsToPlayer)
    })));

    // 2. Update League Standings, NRR, Background AI Fixture & Playoff Bracket
    const isInternational =
      finishedMatch.leagueId === 'wtc_test' ||
      finishedMatch.leagueId === 't20i_bilateral' ||
      finishedMatch.leagueId === 'odi_bilateral' ||
      finishedMatch.leagueId === 'test_bilateral' ||
      finishedMatch.leagueId === 'intl' ||
      Boolean(finishedMatch.fixtureId?.startsWith('intl_fix_')) ||
      Boolean(finishedMatch.fixtureId?.startsWith('cal_intl_')) ||
      Boolean(finishedMatch.fixtureId?.startsWith('wtc_')) ||
      (finishedMatch as any).competitionId === 'wtc_test' ||
      (finishedMatch as any).competitionId === 'bilateral' ||
      (finishedMatch.homeTeam?.leagueId === 'intl' && finishedMatch.awayTeam?.leagueId === 'intl');
    let userUpdatedStandingRank = 1;
    let userUpdatedNrr = 0.5;

    if (isInternational) {
      // Phase 12: Authoritative International Tour & Calendar Synchronization
      const intlSync = applyRecordCompletedInternationalMatchState({
        finishedMatch,
        nations,
        internationalSeries,
        leagues,
        currentLeagueId,
        coachProfile
      });
      setNations(intlSync.nations);
      setInternationalSeries(intlSync.internationalSeries);
      setLeagues(intlSync.leagues);
    } else {
      setLeagues(prevLeagues => prevLeagues.map(league => {
        if (league.id !== finishedMatch.leagueId) return league;

        const shortScoreSummary = `${finishedMatch.homeTeam.shortName} ${inn1.battingTeamId === finishedMatch.homeTeam.id ? `${inn1.runs}/${inn1.wickets}` : `${inn2?.runs || 0}/${inn2?.wickets || 0}`} vs ${finishedMatch.awayTeam.shortName} ${inn1.battingTeamId === finishedMatch.awayTeam.id ? `${inn1.runs}/${inn1.wickets}` : `${inn2?.runs || 0}/${inn2?.wickets || 0}`} · ${finishedMatch.resultText || ''}`;

        // Playoff Bracket Stage Update
        if (finishedMatch.playoffStage) {
          const currentPlayoffs = league.playoffs || createInitialPlayoffs(league.standings);
          const stage = finishedMatch.playoffStage;
          if (currentPlayoffs[stage]?.completed) {
            return league;
          }
          const updatedPlayoffs = { ...currentPlayoffs };

          if (stage === 'q1') {
            updatedPlayoffs.q1 = {
              ...updatedPlayoffs.q1,
              homeTeamId: finishedMatch.homeTeam.id,
              awayTeamId: finishedMatch.awayTeam.id,
              winnerTeamId: winnerId,
              loserTeamId: loserId,
              completed: true,
              resultSummary: shortScoreSummary
            };
            updatedPlayoffs.q2 = {
              ...updatedPlayoffs.q2,
              homeTeamId: loserId
            };
            updatedPlayoffs.final = {
              ...updatedPlayoffs.final,
              homeTeamId: winnerId
            };
          } else if (stage === 'eliminator') {
            updatedPlayoffs.eliminator = {
              ...updatedPlayoffs.eliminator,
              homeTeamId: finishedMatch.homeTeam.id,
              awayTeamId: finishedMatch.awayTeam.id,
              winnerTeamId: winnerId,
              loserTeamId: loserId,
              completed: true,
              resultSummary: shortScoreSummary
            };
            updatedPlayoffs.q2 = {
              ...updatedPlayoffs.q2,
              awayTeamId: winnerId
            };
          } else if (stage === 'q2') {
            updatedPlayoffs.q2 = {
              ...updatedPlayoffs.q2,
              homeTeamId: finishedMatch.homeTeam.id,
              awayTeamId: finishedMatch.awayTeam.id,
              winnerTeamId: winnerId,
              loserTeamId: loserId,
              completed: true,
              resultSummary: shortScoreSummary
            };
            updatedPlayoffs.final = {
              ...updatedPlayoffs.final,
              awayTeamId: winnerId
            };
          } else if (stage === 'final') {
            updatedPlayoffs.final = {
              ...updatedPlayoffs.final,
              homeTeamId: finishedMatch.homeTeam.id,
              awayTeamId: finishedMatch.awayTeam.id,
              winnerTeamId: winnerId,
              loserTeamId: loserId,
              completed: true,
              resultSummary: shortScoreSummary
            };
            updatedPlayoffs.championTeamId = winnerId;
            setCareerPhase('board_review');

            const champTeamObj = winnerId === finishedMatch.homeTeam.id ? finishedMatch.homeTeam : finishedMatch.awayTeam;
            const seasonYr = normalizeSeasonYear(activeLeague?.seasonName);
            setTournamentHonors(prev => {
              const cleaned = sanitizeTournamentHonors(prev);
              const exists = cleaned.some(h => normalizeSeasonYear(h.year) === seasonYr && h.tournamentName === activeLeague.name);
              if (exists) return cleaned;
              const nextHonors = [
                {
                  year: seasonYr,
                  tournamentName: activeLeague.name || 'Indian Premier League',
                  championTeamId: champTeamObj.id,
                  championTeamName: champTeamObj.name,
                  championLogo: champTeamObj.logoEmoji || '🏆'
                },
                ...cleaned
              ];
              localStorage.setItem('ms_tournament_honors_v6', JSON.stringify(nextHonors));
              return nextHonors;
            });

            confetti({ particleCount: 150, spread: 100, origin: { y: 0.5 } });
            unlockAchievement('ach_22');
          }

          const syncedPlayoffCal = syncPlayoffCalendarDates(
            league.calendarDates,
            updatedPlayoffs,
            [...teams, ...(league.teams || [])]
          ).map(cd =>
            cd && (cd.id === `cal_playoff_${stage}` || cd.matchFixture?.id === `fix_playoff_${stage}`) && cd.matchFixture
              ? {
                  ...cd,
                  matchFixture: {
                    ...cd.matchFixture,
                    completed: true,
                    resultSummary: shortScoreSummary,
                    completedMatchState: finishedMatch
                  }
                }
              : cd
          );

          const candidateLeagueAfterStage: League = {
            ...league,
            playoffs: updatedPlayoffs,
            calendarDates: syncedPlayoffCal
          };

          if (stage === 'final') {
            const generatedReview = buildFranchiseBoardReviewSnapshot(
              candidateLeagueAfterStage,
              userTeam,
              players.map(applyStatsToPlayer)
            );
            setCareerBoardReview(generatedReview);
            return candidateLeagueAfterStage;
          }

          const aiPlayoffRes = applyAdvanceAiPlayoffMatchesState({
            league: candidateLeagueAfterStage,
            teams,
            players: players.map(applyStatsToPlayer),
            coachProfile,
            careerPhase: 'playoffs',
            tournamentHonors,
            careerBoardReview
          });
          if (aiPlayoffRes.stagesSimulated.length > 0) {
            setPlayers(aiPlayoffRes.players);
            setTeams(prevT => prevT.map(t => ({
              ...t,
              squad: t.squad.map(sp => aiPlayoffRes.players.find(ap => ap.id === sp.id) || sp)
            })));
            setCareerPhase(aiPlayoffRes.careerPhase);
            if (aiPlayoffRes.careerBoardReview !== careerBoardReview) {
              setCareerBoardReview(aiPlayoffRes.careerBoardReview);
            }
            if (aiPlayoffRes.stagesSimulated.includes('final')) {
              setTournamentHonors(aiPlayoffRes.tournamentHonors);
              safeStorageSet('ms_tournament_honors_v6', JSON.stringify(aiPlayoffRes.tournamentHonors));
              setCoachProfile(aiPlayoffRes.coachProfile);
            }
            return aiPlayoffRes.league;
          }

          return candidateLeagueAfterStage;
        }

        // Regular League Stage Match: Compute NRR Adjustment
        const isPlayoffMatch = Boolean(finishedMatch.playoffStage);
        const maxOv = inn1.maxOvers || 20;
        const overs1 = inn1.wickets >= 10 ? maxOv : Math.max(1, inn1.ballsCompleted / 6);
        const overs2 = (inn2?.wickets || 0) >= 10 ? (inn2?.maxOvers || maxOv) : Math.max(1, (inn2?.ballsCompleted || 60) / 6);
        const rr1 = inn1.runs / overs1;
        const rr2 = (inn2?.runs || 0) / overs2;
        const rrDiffInnings1Team = (rr1 - rr2) * 0.15;

        const isTiedMatch = !finishedMatch.winnerTeamId;
        const updatedStandings = league.standings.map(row => {
          if (isPlayoffMatch) return row;
          if (isTiedMatch && (row.teamId === finishedMatch.homeTeam.id || row.teamId === finishedMatch.awayTeam.id)) {
            if (row.played >= 18) return row;
            return {
              ...row,
              played: row.played + 1,
              tied: (row.tied || 0) + 1,
              points: row.points + 1,
              recentForm: [...row.recentForm, 'T' as const].slice(-5)
            };
          }
          if (row.teamId === winnerId) {
            if (row.played >= 18) return row;
            const delta = Math.abs(rrDiffInnings1Team);
            return {
              ...row,
              played: row.played + 1,
              won: row.won + 1,
              points: row.points + 2,
              nrr: Number((row.nrr + delta).toFixed(2)),
              recentForm: [...row.recentForm, 'W' as const].slice(-5)
            };
          }
          if (row.teamId === loserId) {
            if (row.played >= 18) return row;
            const delta = Math.abs(rrDiffInnings1Team);
            return {
              ...row,
              played: row.played + 1,
              lost: row.lost + 1,
              nrr: Number((row.nrr - delta).toFixed(2)),
              recentForm: [...row.recentForm, 'L' as const].slice(-5)
            };
          }
          return row;
        });

        updatedStandings.sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          return b.nrr - a.nrr;
        });

        const userIdx = updatedStandings.findIndex(r => r.teamId === userTeam.id);
        if (userIdx !== -1) {
          userUpdatedStandingRank = userIdx + 1;
          userUpdatedNrr = updatedStandings[userIdx].nrr;
        }

        // Mark current calendar fixture completed if applicable and persist full completedMatchState
        const updatedCalendarRaw = league.calendarDates.map((cd, idx) => {
          const isExactFixture = Boolean(
            (finishedMatch.fixtureId && cd.matchFixture?.id === finishedMatch.fixtureId) ||
            (finishedMatch.id && cd.matchFixture?.id === finishedMatch.id)
          );
          const isCurrentMatchDay = idx === league.currentDateIndex && (cd.type === 'match' || cd.type === 'international');
          const isMatchingUncompleted = Boolean(
            !finishedMatch.fixtureId &&
            idx === league.currentDateIndex &&
            cd.matchFixture &&
            !cd.matchFixture.completed &&
            ((cd.matchFixture.homeTeamId === finishedMatch.homeTeam.id && cd.matchFixture.awayTeamId === finishedMatch.awayTeam.id) ||
             (cd.matchFixture.homeTeamId === finishedMatch.awayTeam.id && cd.matchFixture.awayTeamId === finishedMatch.homeTeam.id))
          );

          if (isExactFixture || isCurrentMatchDay || isMatchingUncompleted) {
            if (!cd.matchFixture) return cd;
            return {
              ...cd,
              matchFixture: {
                ...cd.matchFixture,
                completed: true,
                resultSummary: shortScoreSummary,
                completedMatchState: finishedMatch
              }
            };
          }
          return cd;
        });

        const existingPlayoffs = league.playoffs || createInitialPlayoffs(updatedStandings);
        const leagueStageDone = isDomesticLeagueStageComplete({
          ...league,
          standings: updatedStandings,
          calendarDates: updatedCalendarRaw
        });
        const syncedPlayoffs =
          !existingPlayoffs.q1.completed && !existingPlayoffs.eliminator.completed
            ? leagueStageDone
              ? seedQualifiedPlayoffsFromStandings(updatedStandings, existingPlayoffs)
              : createInitialPlayoffs(updatedStandings)
            : existingPlayoffs;
        const updatedCalendar = syncPlayoffCalendarDates(
          updatedCalendarRaw,
          syncedPlayoffs,
          [...teams, ...(league.teams || [])]
        );

        return {
          ...league,
          standings: updatedStandings,
          playoffs: syncedPlayoffs,
          calendarDates: updatedCalendar
        };
      }));
    }

    // 2B. Append full match scorecard to completedMatchesHistory for Inbox News & Schedule Modals
    const inn1TeamObj = inn1.battingTeamId === finishedMatch.homeTeam.id ? finishedMatch.homeTeam : finishedMatch.awayTeam;
    const inn2TeamObj = inn2?.battingTeamId === finishedMatch.homeTeam.id ? finishedMatch.homeTeam : finishedMatch.awayTeam;
    const formatOvers = (ballsComp: number) => `${Math.floor(ballsComp / 6)}.${ballsComp % 6}`;

    // Pick Player of the Match by highest impact points (runs + wickets * 25)
    let bestPotmName = finishedMatch.homeTeam.shortName + ' Star';
    let bestPotmScore = -1;
    batterMap.forEach((b, pid) => {
      const bw = bowlerMap.get(pid);
      const score = b.runs + (bw ? bw.wickets * 25 : 0);
      if (score > bestPotmScore) {
        bestPotmScore = score;
        bestPotmName = b.name;
      }
    });
    bowlerMap.forEach((bw, pid) => {
      const b = batterMap.get(pid);
      const score = (b ? b.runs : 0) + bw.wickets * 25;
      if (score > bestPotmScore) {
        bestPotmScore = score;
        bestPotmName = bw.name;
      }
    });

    const summaryStr = finishedMatch.resultText
      ? `${inn1TeamObj.shortName} ${inn1.runs}/${inn1.wickets} vs ${inn2TeamObj.shortName} ${inn2?.runs || 0}/${inn2?.wickets || 0} · ${finishedMatch.resultText}`
      : `${finishedMatch.homeTeam.shortName} vs ${finishedMatch.awayTeam.shortName}`;

    const newCompletedRecord: CompletedMatchRecord = {
      id: finishedMatch.id,
      dateStr: 'TODAY',
      homeTeam: finishedMatch.homeTeam.shortName,
      awayTeam: finishedMatch.awayTeam.shortName,
      summary: summaryStr,
      playerOfMatch: bestPotmName,
      innings1: {
        team: inn1TeamObj.name.toUpperCase(),
        runs: inn1.runs,
        wickets: inn1.wickets,
        overs: formatOvers(inn1.ballsCompleted),
        batters: inn1.batters
          .filter(b => b.balls > 0 || b.dismissal !== 'not out' || b.isOnStrike)
          .map(b => ({
            name: b.dismissal === 'not out' ? `${b.name} *` : b.name,
            runs: b.runs,
            balls: b.balls,
            fours: b.fours,
            sixes: b.sixes,
            sr: b.balls > 0 ? Number(((b.runs / b.balls) * 100).toFixed(1)) : 0,
            isOut: b.dismissal !== 'not out',
            outDesc: b.dismissal !== 'not out' ? b.dismissal : undefined
          })),
        bowlers: inn1.bowlers
          .filter(bw => bw.overs > 0 || bw.ballsInCurrentOver > 0)
          .map(bw => ({
            name: bw.name,
            overs: bw.overs,
            maidens: bw.maidens || 0,
            runs: bw.runs,
            wickets: bw.wickets,
            econ: bw.economy > 0 ? bw.economy : calculateBowlingEconomy(bw.runs, bw.overs)
          }))
      },
      innings2: {
        team: inn2TeamObj.name.toUpperCase(),
        runs: inn2?.runs || 0,
        wickets: inn2?.wickets || 0,
        overs: formatOvers(inn2?.ballsCompleted || 0),
        batters: (inn2?.batters || [])
          .filter(b => b.balls > 0 || b.dismissal !== 'not out' || b.isOnStrike)
          .map(b => ({
            name: b.dismissal === 'not out' ? `${b.name} *` : b.name,
            runs: b.runs,
            balls: b.balls,
            fours: b.fours,
            sixes: b.sixes,
            sr: b.balls > 0 ? Number(((b.runs / b.balls) * 100).toFixed(1)) : 0,
            isOut: b.dismissal !== 'not out',
            outDesc: b.dismissal !== 'not out' ? b.dismissal : undefined
          })),
        bowlers: (inn2?.bowlers || [])
          .filter(bw => bw.overs > 0 || bw.ballsInCurrentOver > 0)
          .map(bw => ({
            name: bw.name,
            overs: bw.overs,
            maidens: bw.maidens || 0,
            runs: bw.runs,
            wickets: bw.wickets,
            econ: bw.economy > 0 ? bw.economy : calculateBowlingEconomy(bw.runs, bw.overs)
          }))
      }
    };

    setCompletedMatchesHistory(prev => [newCompletedRecord, ...prev.filter(m => m.id !== newCompletedRecord.id)].slice(0, 25));

    // 3. Update Coach Career KPIs & Board Targets (only if user's team or coached nation played in this match)
    const isUserInMatch =
      finishedMatch.homeTeam.id === userTeam.id ||
      finishedMatch.awayTeam.id === userTeam.id ||
      Boolean(finishedMatch.homeTeam.isUserTeam || finishedMatch.awayTeam.isUserTeam) ||
      (isInternational && Boolean(coachProfile.nationalTeamId && (finishedMatch.homeTeam.id === coachProfile.nationalTeamId || finishedMatch.awayTeam.id === coachProfile.nationalTeamId)));

    const wonGrandFinal = isUserInMatch && finishedMatch.playoffStage === 'final' && didUserWin;
    if (isUserInMatch && finishedMatch.playoffStage === 'final') {
      unlockAchievement('ach_27');
    }
    if (wonGrandFinal) {
      sound.playCrowdCheer(1.8);
      confetti({ particleCount: 120, spread: 90, origin: { y: 0.5 } });
      unlockAchievement('ach_22');
      setPendingRetentionModal(true);
    }

    if (!isUserInMatch) return;

    // Stadium & Hospitality Facility Gate Revenue Payout for Home Matches
    if (!isInternational && finishedMatch.homeTeam.id === userTeam.id) {
      try {
        const rawInfra = localStorage.getItem(`cc26_infra_${userTeam.id}`);
        const infra = rawInfra ? JSON.parse(rawInfra) : null;
        const stadiumTier = infra?.stadiumTier || 1;
        const gateRevenueCr = Number((0.25 + (stadiumTier - 1) * 0.45).toFixed(2));
        setTeams(prev => prev.map(t =>
          t.id === userTeam.id
            ? { ...t, purseCr: Number((t.purseCr + gateRevenueCr).toFixed(2)) }
            : t
        ));
      } catch {
        // ignore
      }
    }

    setCoachProfile(prev => {
      if (isInternational) {
        const nextMatches = (prev.nationalStats?.matches || 0) + 1;
        const nextWins = (prev.nationalStats?.wins || 0) + (didUserWin ? 1 : 0);
        const nextLosses = (prev.nationalStats?.losses || 0) + (didUserWin ? 0 : 1);
        const nextWinPct = Number(((nextWins / nextMatches) * 100).toFixed(1));
        return {
          ...prev,
          nationalStats: {
            ...prev.nationalStats,
            matches: nextMatches,
            wins: nextWins,
            losses: nextLosses,
            winPct: nextWinPct
          }
        };
      }

      const dom = prev.domesticStats || {
        seasons: 1, matches: 0, wins: 0, losses: 0, winPct: 0,
        titles: 0, playoffRuns: 0, bestStreak: 0, currentStreak: 0
      };
      const nextMatches = dom.matches + 1;
      const nextWins = dom.wins + (didUserWin ? 1 : 0);
      const nextLosses = dom.losses + (didUserWin ? 0 : 1);
      const nextWinPct = Number(((nextWins / nextMatches) * 100).toFixed(1));
      const nextStreak = didUserWin ? dom.currentStreak + 1 : 0;
      const nextBestStreak = Math.max(dom.bestStreak, nextStreak);
      const nextTitles = dom.titles + (wonGrandFinal ? 1 : 0);

      const totalCoached = (prev.stats?.matchesCoached ?? 0) + 1;
      const totalWon = (prev.stats?.matchesWon ?? 0) + (didUserWin ? 1 : 0);
      const totalLost = (prev.stats?.matchesLost ?? 0) + (didUserWin ? 0 : 1);

      const updatedTargets = (prev.boardTargets || []).map(bt => {
        if (bt.id === 'bt_1') {
          return { ...bt, completed: userUpdatedStandingRank <= 4 };
        }
        if (bt.id === 'bt_2') {
          return { ...bt, completed: userUpdatedNrr > 0.40 };
        }
        if (bt.id === 'bt_3') {
          const hasYoungster5Matches = players.some(p => p.clubId === userTeam.id && p.age <= 23 && (p.stats?.matches || 0) >= 5);
          return { ...bt, completed: bt.completed || hasYoungster5Matches };
        }
        return bt;
      });

      const currentStints = prev.clubStints && prev.clubStints.length > 0
        ? prev.clubStints
        : [
            {
              id: `stint_${userTeam.id}_2026`,
              teamId: userTeam.id,
              teamName: userTeam.city || userTeam.name,
              period: '2026–present',
              seasons: 1,
              matches: 0,
              wins: 0,
              losses: 0,
              winPct: 0,
              titles: 0
            }
          ];

      const updatedStints = currentStints.map((stint, idx) => {
        if (idx === currentStints.length - 1 || stint.teamId === userTeam.id) {
          const sMatches = stint.matches + 1;
          const sWins = (stint.wins || 0) + (didUserWin ? 1 : 0);
          const sLosses = (stint.losses || 0) + (didUserWin ? 0 : 1);
          return {
            ...stint,
            matches: sMatches,
            wins: sWins,
            losses: sLosses,
            winPct: Number(((sWins / sMatches) * 100).toFixed(1)),
            titles: stint.titles + (wonGrandFinal ? 1 : 0)
          };
        }
        return stint;
      });

      return {
        ...prev,
        domesticTitles: (prev.domesticTitles ?? 0) + (wonGrandFinal ? 1 : 0),
        domesticStats: {
          ...dom,
          matches: nextMatches,
          wins: nextWins,
          losses: nextLosses,
          winPct: nextWinPct,
          currentStreak: nextStreak,
          bestStreak: nextBestStreak,
          titles: nextTitles
        },
        stats: prev.stats ? {
          ...prev.stats,
          matchesCoached: totalCoached,
          matchesWon: totalWon,
          matchesLost: totalLost,
          winPercentage: Number(((totalWon / totalCoached) * 100).toFixed(1)),
          bestWinStreak: Math.max(prev.stats.bestWinStreak ?? 0, nextBestStreak)
        } : prev.stats,
        boardTargets: updatedTargets,
        clubStints: updatedStints
      };
    });
  }, [players, userTeam, unlockAchievement]);

  // Automatically record match outcome when matchLiveState transitions to finished
  useEffect(() => {
    if (matchLiveState && matchLiveState.status === 'finished') {
      recordCompletedMatch(matchLiveState);
    }
  }, [matchLiveState, recordCompletedMatch]);

  // Helper to construct a MatchLiveState between any two franchise teams (including Playoff fixtures)
  const createFranchiseMatchState = useCallback((
    homeTeamObj: Team,
    awayTeamObj: Team,
    leagueId: string,
    format: 'T20' | 'ODI' | 'TEST',
    playoffStage?: 'q1' | 'eliminator' | 'q2' | 'final',
    fixtureId?: string
  ): MatchLiveState => {
    const homeXIPlayers = homeTeamObj.playingXIIds
      .map(id => players.find(p => p.id === id))
      .filter((p): p is Player => Boolean(p));
    const awayXIPlayers = awayTeamObj.playingXIIds
      .map(id => players.find(p => p.id === id))
      .filter((p): p is Player => Boolean(p));

    const finalHomeXI = homeXIPlayers.length >= 2
      ? homeXIPlayers
      : (homeTeamObj.squad && homeTeamObj.squad.length >= 2 ? homeTeamObj.squad.slice(0, 11) : players.slice(0, 11));
    const finalAwayXI = awayXIPlayers.length >= 2
      ? awayXIPlayers
      : (awayTeamObj.squad && awayTeamObj.squad.length >= 2 ? awayTeamObj.squad.slice(0, 11) : players.slice(11, 22));

    const initBatters: BatterInningsScorecard[] = finalHomeXI.map((p, idx) => ({
      playerId: p.id,
      name: p.name,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      dismissal: 'not out',
      strikeRate: 0,
      isOnStrike: idx === 0
    }));

    const initBowlers: BowlerInningsScorecard[] = buildBowlerScorecardPool(finalAwayXI);

    const maxOversForFormat = format === 'TEST' ? 90 : format === 'ODI' ? 50 : 20;

    const innings1: InningsData = {
      battingTeamId: homeTeamObj.id,
      bowlingTeamId: awayTeamObj.id,
      runs: 0,
      wickets: 0,
      overs: 0,
      ballsCompleted: 0,
      maxOvers: maxOversForFormat,
      currentOverRuns: 0,
      extras: { total: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0 },
      batters: initBatters,
      bowlers: initBowlers,
      currentStrikerId: finalHomeXI[0]?.id || players[0]?.id,
      currentNonStrikerId: finalHomeXI[1]?.id || players[1]?.id,
      currentBowlerId: initBowlers[0]?.playerId || finalAwayXI[0]?.id,
      ballHistory: [],
      fallOfWickets: [],
      overRuns: []
    };

    return {
      id: fixtureId || `match_${leagueId}_${playoffStage || 'reg'}_${Date.now()}`,
      fixtureId,
      leagueId,
      format,
      playoffStage,
      homeTeam: homeTeamObj,
      awayTeam: awayTeamObj,
      venue: playoffStage === 'final' ? 'Wankhede Stadium · Championship Final' : `${homeTeamObj.city} Cricket Stadium`,
      pitchType: 'Flat Belter',
      weather: 'Clear Night',
      currentInningsIndex: 1,
      innings1,
      innings2: null,
      targetRuns: null,
      status: 'in_progress',
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
        fielders: INITIAL_DEFAULT_FIELD
      },
      battingTactics: {
        approach: 'balanced',
        targetSide: 'all',
        runningRisk: 'normal'
      }
    };
  }, [players]);

  const resolvePlayoffStageTeams = useCallback((leagueId: string, stage: 'q1' | 'eliminator' | 'q2' | 'final'): {
    homeTeamObj: Team | null;
    awayTeamObj: Team | null;
    format: 'T20';
    error?: string;
  } => {
    const league = leagues.find(l => l.id === leagueId) || leagues[0];
    if (!league) {
      return { homeTeamObj: null, awayTeamObj: null, format: 'T20', error: 'League not found.' };
    }
    const eligibility = validatePlayoffEligibility({
      careerPhase,
      league,
      userClubId: coachProfile.clubTeamId,
      stage,
      isUserAction: false
    });
    if (!eligibility.homeTeamId || !eligibility.awayTeamId) {
      return {
        homeTeamObj: null,
        awayTeamObj: null,
        format: 'T20',
        error: eligibility.reason || 'Playoff team IDs are missing, invalid, or non-distinct.'
      };
    }

    const allTeamsPool = [...teams, ...(league.teams || [])];
    const homeId = eligibility.homeTeamId;
    const awayId = eligibility.awayTeamId;

    if (!homeId || !awayId || homeId === awayId) {
      return { homeTeamObj: null, awayTeamObj: null, format: 'T20', error: 'Playoff team IDs are missing, invalid, or non-distinct.' };
    }

    const homeTeamObj = allTeamsPool.find(t => t.id === homeId) || null;
    const awayTeamObj = allTeamsPool.find(t => t.id === awayId) || null;

    if (!homeTeamObj || !awayTeamObj) {
      return { homeTeamObj: null, awayTeamObj: null, format: 'T20', error: `Unresolvable team ID(s): home=${homeId}, away=${awayId}` };
    }

    return { homeTeamObj, awayTeamObj, format: 'T20' };
  }, [leagues, teams, careerPhase, coachProfile.clubTeamId]);

  const playPlayoffMatch = useCallback((leagueId: string, stage: 'q1' | 'eliminator' | 'q2' | 'final'): { success: boolean; reason?: string } => {
    const targetLeague = leagues.find(l => l.id === leagueId) || leagues[0];
    if (!targetLeague) {
      return { success: false, reason: 'League not found.' };
    }

    const eligibility = validatePlayoffEligibility({
      careerPhase,
      league: targetLeague,
      userClubId: coachProfile.clubTeamId,
      stage,
      isUserAction: true
    });

    if (!eligibility.canPlay) {
      return { success: false, reason: eligibility.reason || 'Playoff match is not eligible to play.' };
    }

    const { homeTeamObj, awayTeamObj, format, error } = resolvePlayoffStageTeams(leagueId, stage);
    if (!homeTeamObj || !awayTeamObj || homeTeamObj.id === awayTeamObj.id) {
      return { success: false, reason: error || 'Unresolvable or non-distinct playoff teams.' };
    }

    const newMatch = createFranchiseMatchState(homeTeamObj, awayTeamObj, leagueId, format, stage, `fix_playoff_${stage}`);
    setMatchLiveState(newMatch);
    setActiveTab('live_match');
    sound.playCrowdCheer(0.8);
    return { success: true };
  }, [leagues, careerPhase, coachProfile.clubTeamId, resolvePlayoffStageTeams, createFranchiseMatchState]);

  const simPlayoffMatch = useCallback((leagueId: string, stage: 'q1' | 'eliminator' | 'q2' | 'final', isUserAction: boolean = false): { success: boolean; reason?: string } => {
    const targetLeague = leagues.find(l => l.id === leagueId) || leagues[0];
    if (!targetLeague) {
      return { success: false, reason: 'League not found.' };
    }

    const eligibility = validatePlayoffEligibility({
      careerPhase,
      league: targetLeague,
      userClubId: coachProfile.clubTeamId,
      stage,
      isUserAction
    });

    if (!eligibility.canSimulate) {
      return { success: false, reason: eligibility.reason || 'Playoff match is not eligible to simulate.' };
    }

    if (targetLeague?.playoffs?.[stage]?.completed) {
      return { success: false, reason: 'Playoff match already completed.' };
    }

    const { homeTeamObj, awayTeamObj, format, error } = resolvePlayoffStageTeams(leagueId, stage);
    if (!homeTeamObj || !awayTeamObj || homeTeamObj.id === awayTeamObj.id) {
      return { success: false, reason: error || 'Unresolvable or non-distinct playoff teams.' };
    }

    let curr = createFranchiseMatchState(homeTeamObj, awayTeamObj, leagueId, format, stage, `fix_playoff_${stage}`);
    let safetyCounter = 0;

    while (curr.status !== 'finished' && safetyCounter < 1500) {
      safetyCounter++;
      if (curr.status === 'innings_break') {
        curr = {
          ...curr,
          currentInningsIndex: 2,
          hasDew: true,
          status: 'in_progress'
        };
      }
      const res = simulateSingleDeliveryState(curr, true);
      curr = res.nextState;
      if (res.matchJustFinished) break;
    }

    recordCompletedMatch(curr);
    sound.playCrowdCheer(1.0);
    return { success: true };
  }, [leagues, careerPhase, coachProfile.clubTeamId, resolvePlayoffStageTeams, createFranchiseMatchState, simulateSingleDeliveryState, recordCompletedMatch]);

  const advanceCalendarToNextTour = useCallback((): { success: boolean; message: string } => {
    const res = applyAdvanceCalendarToNextTourState({
      coachProfile,
      nations,
      leagues,
      currentLeagueId,
      players,
      teams,
      internationalSeries,
      careerPhase
    });

    if (!res.success) {
      return { success: false, message: res.message };
    }

    setCoachProfile(res.coachProfile);
    setLeagues(res.leagues);
    setPlayers(res.players);
    setTeams(res.teams);
    setInternationalSeries(res.internationalSeries);
    setCareerPhase(res.careerPhase);
    sound.playTap();
    return {
      success: true,
      message: res.message
    };
  }, [coachProfile, nations, leagues, currentLeagueId, players, teams, internationalSeries, careerPhase, setInternationalSeries, setCareerPhase]);

  const resetPlayoffBracket = useCallback((leagueId: string) => {
    setLeagues(prev => prev.map(l => {
      if (l.id !== leagueId) return l;
      return {
        ...l,
        playoffs: createInitialPlayoffs(l.standings)
      };
    }));
    sound.playTap();
  }, []);

  const finishMatch = useCallback(() => {
    if (matchLiveState && matchLiveState.status === 'finished') {
      recordCompletedMatch(matchLiveState);
    }
    setMatchLiveState(null);
    setActiveTab('hub');
  }, [matchLiveState, recordCompletedMatch]);

  const startSecondInnings = useCallback(() => {
    setMatchLiveState(prev => {
      if (!prev) return null;
      const initRevs = getInitialReviewsForFormat(prev.format);
      return {
        ...prev,
        currentInningsIndex: 2,
        lastBallOutcome: null,
        activeDrsReview: undefined,
        reviewsRemaining: { home: initRevs, away: initRevs },
        hasDew: prev.weather === 'Clear Night' || prev.weather === 'Overcast & Humid',
        status: 'in_progress'
      };
    });
    sound.playTap();
  }, []);

  // FEATURE 6.1: DRS & BALL-TRACKING REVIEW
  const triggerDrsReview = useCallback(() => {
    setMatchLiveState(prev => applyTriggerDrsReviewState(prev, userTeam.id, players));
  }, [players, userTeam.id]);

  const resolveDrsReview = useCallback((finalVerdict: 'OUT' | 'NOT OUT', reviewRetained: boolean) => {
    setMatchLiveState(prev => {
      if (!prev || !prev.activeDrsReview) return prev;
      const isFirst = prev.currentInningsIndex === 1;
      const curInnings = isFirst ? prev.innings1 : prev.innings2;
      if (!curInnings) return prev;

      const rev = prev.activeDrsReview;
      const isReviewerHome = rev.reviewingTeamId === prev.homeTeam.id;
      const initRevs = getInitialReviewsForFormat(prev.format);
      const currentHomeRevs = prev.reviewsRemaining?.home ?? initRevs;
      const currentAwayRevs = prev.reviewsRemaining?.away ?? initRevs;
      const nextHomeRevs = isReviewerHome
        ? (reviewRetained ? currentHomeRevs : Math.max(0, currentHomeRevs - 1))
        : currentHomeRevs;
      const nextAwayRevs = !isReviewerHome
        ? (reviewRetained ? currentAwayRevs : Math.max(0, currentAwayRevs - 1))
        : currentAwayRevs;

      let updatedInnings: InningsData = {
        ...curInnings,
        batters: [...curInnings.batters],
        bowlers: [...curInnings.bowlers],
        fallOfWickets: [...curInnings.fallOfWickets],
        ballHistory: [...curInnings.ballHistory],
        overRuns: [...curInnings.overRuns]
      };
      let updatedLastBall: BallOutcome | null = prev.lastBallOutcome ? { ...prev.lastBallOutcome, drsReviewed: true } : null;
      let nextStatus: MatchLiveState['status'] = prev.status;
      let nextWinnerTeamId = prev.winnerTeamId;
      let nextResultText = prev.resultText;
      let nextTargetRuns = prev.targetRuns;
      let nextInnings2 = prev.innings2;

      const wasOverEnd = updatedInnings.ballsCompleted > 0 && updatedInnings.ballsCompleted % 6 === 0 && !prev.lastBallOutcome?.isExtra;
      const survivingPartnerId = prev.lastBallOutcome?.nonStrikerId || updatedInnings.currentNonStrikerId;

      // CASE 1: OUT OVERTURNED TO NOT OUT (Batter survives and returns to the crease!)
      if (rev.originalDecision === 'OUT' && finalVerdict === 'NOT OUT') {
        const restoredBatterId = rev.batterId || prev.lastBallOutcome?.dismissedPlayerId || prev.lastBallOutcome?.strikerId || updatedInnings.currentStrikerId;
        updatedInnings.wickets = Math.max(0, updatedInnings.wickets - 1);

        // Put restored batter back in the crease in place of the temporary incoming batter
        if (wasOverEnd) {
          updatedInnings.currentStrikerId = survivingPartnerId;
          updatedInnings.currentNonStrikerId = restoredBatterId;
        } else {
          updatedInnings.currentStrikerId = restoredBatterId;
          updatedInnings.currentNonStrikerId = survivingPartnerId;
        }

        updatedInnings.batters = updatedInnings.batters.map(b => {
          if (b.playerId === restoredBatterId || b.name === rev.batterName) {
            return {
              ...b,
              dismissal: 'not out',
              isOnStrike: b.playerId === updatedInnings.currentStrikerId
            };
          }
          return {
            ...b,
            isOnStrike: b.playerId === updatedInnings.currentStrikerId
          };
        });

        // Remove the overturned wicket from fallOfWickets
        if (updatedInnings.fallOfWickets.length > 0) {
          updatedInnings.fallOfWickets = updatedInnings.fallOfWickets.slice(0, -1);
        }

        // Remove wicket from bowler figures
        updatedInnings.bowlers = updatedInnings.bowlers.map(bw => {
          if (bw.playerId === rev.bowlerId || bw.name === rev.bowlerName) {
            return {
              ...bw,
              wickets: Math.max(0, bw.wickets - 1),
              runsConceded: bw.runs
            };
          }
          return bw;
        });

        if (updatedLastBall) {
          updatedLastBall = {
            ...updatedLastBall,
            isWicket: false,
            wicketType: undefined,
            dismissedPlayerId: undefined,
            dismissedPlayerName: undefined,
            dismissalText: undefined,
            incomingBatterId: undefined,
            drsReviewed: true,
            commentary: `DRS OVERTURNED — NOT OUT! ${rev.batterName} survives on review and stays at the crease!`,
            tacticalNote: rev.snickoSpike && rev.type === 'lbw'
              ? 'UltraEdge detected an inside edge onto the pad! Decision overturned.'
              : 'Third Umpire technology overturned the on-field OUT decision.'
          };
          if (updatedInnings.ballHistory.length > 0) {
            updatedInnings.ballHistory[0] = updatedLastBall;
          }
        }

        // If 10th wicket had ended the innings/match, resume play
        if (nextStatus !== 'in_progress') {
          nextStatus = 'in_progress';
          nextWinnerTeamId = undefined;
          nextResultText = undefined;
        }
      }
      // CASE 2: NOT OUT OVERTURNED TO OUT (Bowling review succeeds! Batter dismissed & next batter comes in!)
      else if (rev.originalDecision === 'NOT OUT' && finalVerdict === 'OUT') {
        const outBatterId = rev.batterId || prev.lastBallOutcome?.strikerId || updatedInnings.currentStrikerId;
        const runsToRevert = prev.lastBallOutcome?.runs || 0;

        // Revert any runs scored on the reviewed delivery
        if (runsToRevert > 0) {
          updatedInnings.runs = Math.max(0, updatedInnings.runs - runsToRevert);
          updatedInnings.currentOverRuns = Math.max(0, (updatedInnings.currentOverRuns || 0) - runsToRevert);
          const overIdx = prev.lastBallOutcome?.over ?? Math.floor(Math.max(0, updatedInnings.ballsCompleted - 1) / 6);
          if (updatedInnings.overRuns[overIdx] !== undefined) {
            updatedInnings.overRuns[overIdx] = Math.max(0, updatedInnings.overRuns[overIdx] - runsToRevert);
          }
        }

        updatedInnings.wickets = Math.min(10, updatedInnings.wickets + 1);
        const bowlerLast = (rev.bowlerName || 'Bowler').split(' ').pop() || 'Bowler';
        const dismissalStr = rev.type === 'lbw' ? `lbw b ${bowlerLast}` : `c Keeper b ${bowlerLast}`;

        // Find next unused batter in lineup
        const nextUnusedBatter = updatedInnings.batters.find(
          b => b.dismissal === 'not out' && b.playerId !== outBatterId && b.playerId !== survivingPartnerId
        );
        const replacementId = nextUnusedBatter ? nextUnusedBatter.playerId : outBatterId;

        if (wasOverEnd) {
          updatedInnings.currentStrikerId = survivingPartnerId;
          updatedInnings.currentNonStrikerId = replacementId;
        } else {
          updatedInnings.currentStrikerId = replacementId;
          updatedInnings.currentNonStrikerId = survivingPartnerId;
        }

        updatedInnings.batters = updatedInnings.batters.map(b => {
          if (b.playerId === outBatterId || b.name === rev.batterName) {
            const adjRuns = Math.max(0, b.runs - (prev.lastBallOutcome?.isExtra ? 0 : runsToRevert));
            return {
              ...b,
              runs: adjRuns,
              fours: Math.max(0, b.fours - (prev.lastBallOutcome?.isFour ? 1 : 0)),
              sixes: Math.max(0, b.sixes - (prev.lastBallOutcome?.isSix ? 1 : 0)),
              dismissal: dismissalStr,
              strikeRate: b.balls > 0 ? Number(((adjRuns / b.balls) * 100).toFixed(1)) : 0,
              isOnStrike: false
            };
          }
          return {
            ...b,
            isOnStrike: b.playerId === updatedInnings.currentStrikerId
          };
        });

        // Credit bowler with the wicket and revert runs on that ball
        updatedInnings.bowlers = updatedInnings.bowlers.map(bw => {
          if (bw.playerId === rev.bowlerId || bw.name === rev.bowlerName) {
            const adjRuns = Math.max(0, bw.runs - runsToRevert);
            return {
              ...bw,
              runs: adjRuns,
              runsConceded: adjRuns,
              wickets: bw.wickets + 1,
              economy: calculateBowlingEconomy(adjRuns, bw.overs)
            };
          }
          return bw;
        });

        updatedInnings.fallOfWickets = [
          ...updatedInnings.fallOfWickets,
          {
            runs: updatedInnings.runs,
            wicketNum: updatedInnings.wickets,
            over: updatedInnings.overs,
            batterName: rev.batterName
          }
        ];

        if (updatedLastBall) {
          updatedLastBall = {
            ...updatedLastBall,
            runs: 0,
            isFour: false,
            isSix: false,
            isWicket: true,
            wicketType: rev.type,
            dismissedPlayerId: outBatterId,
            dismissedPlayerName: rev.batterName,
            dismissalText: dismissalStr,
            incomingBatterId: nextUnusedBatter?.playerId,
            drsReviewed: true,
            commentary: `DRS OVERTURNED — OUT! Third Umpire rules ${rev.batterName} OUT (${dismissalStr})! Brilliant review!`,
            tacticalNote: rev.type === 'lbw'
              ? 'Hawk-Eye showed THREE REDS (Pitching In-line, Impact In-line, Hitting Stumps)!'
              : 'UltraEdge detected a sharp spike as the ball passed the bat edge!'
          };
          if (updatedInnings.ballHistory.length > 0) {
            updatedInnings.ballHistory[0] = updatedLastBall;
          }
        }

        // Check if this 10th wicket ended the innings or won the match!
        if (updatedInnings.wickets >= 10) {
          if (isFirst) {
            const secondBattingTeam = updatedInnings.battingTeamId === prev.homeTeam.id ? prev.awayTeam : prev.homeTeam;
            const secondBowlingTeam = updatedInnings.battingTeamId === prev.homeTeam.id ? prev.homeTeam : prev.awayTeam;
            const batXI = secondBattingTeam.playingXIIds
              .map(id => players.find(p => p.id === id))
              .filter((p): p is Player => Boolean(p));
            const bowlXI = secondBowlingTeam.playingXIIds
              .map(id => players.find(p => p.id === id))
              .filter((p): p is Player => Boolean(p));
            const finalBats = batXI.length >= 2 ? batXI : players.filter(p => p.clubId === secondBattingTeam.id).slice(0, 11);
            const finalBowls = bowlXI.length >= 2 ? bowlXI : players.filter(p => p.clubId === secondBowlingTeam.id).slice(0, 11);
            const initBowlers2 = buildBowlerScorecardPool(finalBowls);

            nextTargetRuns = updatedInnings.runs + 1;
            nextStatus = 'innings_break';
            nextInnings2 = {
              battingTeamId: secondBattingTeam.id,
              bowlingTeamId: secondBowlingTeam.id,
              runs: 0,
              wickets: 0,
              overs: 0,
              ballsCompleted: 0,
              maxOvers: updatedInnings.maxOvers,
              currentOverRuns: 0,
              extras: { total: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0 },
              batters: finalBats.map((p, idx) => ({
                playerId: p.id,
                name: p.name,
                runs: 0,
                balls: 0,
                fours: 0,
                sixes: 0,
                dismissal: 'not out',
                strikeRate: 0,
                isOnStrike: idx === 0
              })),
              bowlers: initBowlers2,
              currentStrikerId: finalBats[0]?.id || 'p1',
              currentNonStrikerId: finalBats[1]?.id || 'p2',
              currentBowlerId: initBowlers2[0]?.playerId || finalBowls[0]?.id || 'p3',
              ballHistory: [],
              fallOfWickets: [],
              overRuns: []
            };
          } else {
            const target = prev.targetRuns || (prev.innings1.runs + 1);
            nextStatus = 'finished';
            if (updatedInnings.runs >= target) {
              const winnerId = updatedInnings.battingTeamId;
              const winnerTeam = winnerId === prev.homeTeam.id ? prev.homeTeam : prev.awayTeam;
              const wktsLeft = Math.max(1, 10 - updatedInnings.wickets);
              nextWinnerTeamId = winnerId;
              nextResultText = `${winnerTeam.name.toUpperCase()} WON BY ${wktsLeft} WICKET${wktsLeft > 1 ? 'S' : ''}!`;
            } else if (updatedInnings.runs === target - 1) {
              nextWinnerTeamId = undefined;
              nextResultText = `MATCH TIED! (${prev.homeTeam.shortName} ${prev.innings1.runs}/${prev.innings1.wickets} & ${prev.awayTeam.shortName} ${updatedInnings.runs}/${updatedInnings.wickets})`;
            } else {
              const winnerId = prev.innings1.battingTeamId;
              const winnerTeam = winnerId === prev.homeTeam.id ? prev.homeTeam : prev.awayTeam;
              const runsDiff = Math.max(1, target - updatedInnings.runs - 1);
              nextWinnerTeamId = winnerId;
              nextResultText = `${winnerTeam.name.toUpperCase()} WON BY ${runsDiff} RUN${runsDiff > 1 ? 'S' : ''}!`;
            }
          }
        }
      } else {
        // Decision Upheld
        if (updatedLastBall) {
          updatedLastBall = {
            ...updatedLastBall,
            drsReviewed: true,
            commentary: `DRS REVIEW UPHELD (${finalVerdict}): ${updatedLastBall.commentary}`
          };
          if (updatedInnings.ballHistory.length > 0) {
            updatedInnings.ballHistory[0] = updatedLastBall;
          }
        }
      }

      if (rev.isOverturned) {
        unlockAchievement('ach_73');
      }

      return {
        ...prev,
        status: nextStatus,
        winnerTeamId: nextWinnerTeamId,
        resultText: nextResultText,
        targetRuns: nextTargetRuns,
        lastBallOutcome: updatedLastBall,
        activeDrsReview: null,
        reviewsRemaining: {
          home: nextHomeRevs,
          away: nextAwayRevs
        },
        innings1: isFirst ? updatedInnings : prev.innings1,
        innings2: isFirst ? nextInnings2 : updatedInnings
      };
    });
  }, [players, userTeam.id, unlockAchievement]);

  // FEATURE 6.2: DLS (DUCKWORTH-LEWIS-STERN) RAIN INTERRUPTION
  const triggerRainDLSInterruption = useCallback(() => {
    sound.playTap();
    setMatchLiveState(prev => {
      if (!prev) return null;
      const isFirst = prev.currentInningsIndex === 1;
      const curInnings = isFirst ? prev.innings1 : prev.innings2;
      if (!curInnings) return prev;

      const oversLost = 5;
      const originalMaxOvers = prev.dlsState?.originalMaxOvers || curInnings.maxOvers || 20;
      const currentOversBowled = Math.ceil(curInnings.ballsCompleted / 6);
      const revisedMaxOvers = Math.max(Math.max(5, currentOversBowled + 1), Math.floor(originalMaxOvers - oversLost));
      const baseScore = prev.innings1.runs || 165;
      const computedDls = calculateDLSTarget(baseScore, originalMaxOvers, revisedMaxOvers, curInnings.wickets);
      const dlsTargetRuns = Math.max(curInnings.runs + 6, computedDls.dlsTargetRuns);

      const updatedInnings: InningsData = {
        ...curInnings,
        maxOvers: revisedMaxOvers
      };

      return {
        ...prev,
        weather: 'Overcast & Humid',
        targetRuns: isFirst ? prev.targetRuns : dlsTargetRuns,
        dlsState: {
          ...computedDls,
          dlsTargetRuns
        },
        innings1: isFirst ? updatedInnings : prev.innings1,
        innings2: isFirst ? prev.innings2 : updatedInnings
      };
    });
  }, []);

  // FEATURE 6.6: BBL POWER SURGE (2 OVERS) & TEST DECLARATION
  const activatePowerSurge = useCallback(() => {
    sound.playCrowdCheer(0.7);
    setMatchLiveState(prev => {
      if (!prev || prev.powerSurgeTaken) return prev;
      return {
        ...prev,
        powerSurgeTaken: true,
        powerSurgeOversLeft: 2
      };
    });
  }, []);

  const declareInnings = useCallback(() => {
    sound.playCrowdCheer(0.8);
    setMatchLiveState(prev => {
      if (!prev) return null;
      if (prev.currentInningsIndex === 1) {
        const secondBattingTeam = prev.innings1.battingTeamId === prev.homeTeam.id ? prev.awayTeam : prev.homeTeam;
        const secondBowlingTeam = prev.innings1.battingTeamId === prev.homeTeam.id ? prev.homeTeam : prev.awayTeam;
        const batXI = secondBattingTeam.playingXIIds
          .map(id => players.find(p => p.id === id))
          .filter((p): p is Player => Boolean(p));
        const bowlXI = secondBowlingTeam.playingXIIds
          .map(id => players.find(p => p.id === id))
          .filter((p): p is Player => Boolean(p));
        const finalBats = batXI.length >= 2 ? batXI : players.filter(p => p.clubId === secondBattingTeam.id).slice(0, 11);
        const finalBowls = bowlXI.length >= 2 ? bowlXI : players.filter(p => p.clubId === secondBowlingTeam.id).slice(0, 11);
        const initBowlers2 = buildBowlerScorecardPool(finalBowls);

        const innings2: InningsData = prev.innings2 || {
          battingTeamId: secondBattingTeam.id,
          bowlingTeamId: secondBowlingTeam.id,
          runs: 0,
          wickets: 0,
          overs: 0,
          ballsCompleted: 0,
          maxOvers: prev.innings1.maxOvers || 90,
          currentOverRuns: 0,
          extras: { total: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0 },
          batters: finalBats.map((p, idx) => ({
            playerId: p.id,
            name: p.name,
            runs: 0,
            balls: 0,
            fours: 0,
            sixes: 0,
            dismissal: 'not out',
            strikeRate: 0,
            isOnStrike: idx === 0
          })),
          bowlers: initBowlers2,
          currentStrikerId: finalBats[0]?.id || 'p1',
          currentNonStrikerId: finalBats[1]?.id || 'p2',
          currentBowlerId: initBowlers2[0]?.playerId || finalBowls[0]?.id || 'p3',
          ballHistory: [],
          fallOfWickets: [],
          overRuns: []
        };

        return {
          ...prev,
          status: 'innings_break',
          targetRuns: prev.innings1.runs + 1,
          innings2
        };
      }
      return {
        ...prev,
        status: 'finished',
        resultText: `${prev.homeTeam.shortName} declared! Match drawn / concluded.`
      };
    });
  }, [players]);

  const selectNewBowler = useCallback((bowlerId: string) => {
    setMatchLiveState(prev => applySelectNewBowlerState(prev, bowlerId, players));
    sound.playTap();
  }, [players]);

  const selectNextBatter = useCallback((batterId: string) => {
    setMatchLiveState(prev => {
      if (!prev) return null;
      const isFirst = prev.currentInningsIndex === 1;
      const curInnings = isFirst ? prev.innings1 : prev.innings2;
      if (!curInnings) return prev;

      const survivingPartnerId = prev.lastBallOutcome?.nonStrikerId || curInnings.currentNonStrikerId;
      const wasOverEnd = curInnings.ballsCompleted > 0 && curInnings.ballsCompleted % 6 === 0 && !prev.lastBallOutcome?.isExtra;

      // If the wicket fell on the last ball of the over, the surviving partner is now on strike for the next over
      // and the new incoming batter takes the non-striker's end!
      const nextStrikerId = wasOverEnd ? survivingPartnerId : batterId;
      const nextNonStrikerId = wasOverEnd ? batterId : survivingPartnerId;

      let updatedBatters = curInnings.batters.map(b => ({
        ...b,
        isOnStrike: b.playerId === nextStrikerId
      }));

      if (!updatedBatters.some(b => b.playerId === batterId)) {
        const pObj = players.find(p => p.id === batterId);
        if (pObj) {
          updatedBatters.push({
            playerId: pObj.id,
            name: pObj.name,
            runs: 0,
            balls: 0,
            fours: 0,
            sixes: 0,
            dismissal: 'not out',
            strikeRate: 0,
            isOnStrike: pObj.id === nextStrikerId
          });
        }
      }

      const newInnings: InningsData = {
        ...curInnings,
        currentStrikerId: nextStrikerId,
        currentNonStrikerId: nextNonStrikerId,
        batters: updatedBatters
      };

      const updatedLastBall = prev.lastBallOutcome
        ? { ...prev.lastBallOutcome, incomingBatterId: batterId }
        : null;

      return {
        ...prev,
        lastBallOutcome: updatedLastBall,
        innings1: isFirst ? newInnings : prev.innings1,
        innings2: isFirst ? prev.innings2 : newInnings
      };
    });
    sound.playTap();
  }, [players]);

  const selectOpeners = useCallback((strikerId: string, nonStrikerId: string) => {
    setMatchLiveState(prev => {
      if (!prev) return null;
      const isFirst = prev.currentInningsIndex === 1;
      const curInnings = isFirst ? prev.innings1 : prev.innings2;
      if (!curInnings) return prev;

      const strikerObj = players.find(p => p.id === strikerId);
      const nonStrikerObj = players.find(p => p.id === nonStrikerId);

      const ensureBatterEntry = (pid: string, nameFallback: string, onStrike: boolean): BatterInningsScorecard => {
        const existing = curInnings.batters.find(b => b.playerId === pid);
        if (existing) {
          return { ...existing, isOnStrike: onStrike };
        }
        return {
          playerId: pid,
          name: nameFallback,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          dismissal: 'not out',
          strikeRate: 0,
          isOnStrike: onStrike
        };
      };

      const strikerEntry = ensureBatterEntry(strikerId, strikerObj?.name || 'Striker', true);
      const nonStrikerEntry = ensureBatterEntry(nonStrikerId, nonStrikerObj?.name || 'Non-Striker', false);
      const remainingEntries = curInnings.batters
        .filter(b => b.playerId !== strikerId && b.playerId !== nonStrikerId)
        .map(b => ({ ...b, isOnStrike: false }));

      const newInnings: InningsData = {
        ...curInnings,
        currentStrikerId: strikerId,
        currentNonStrikerId: nonStrikerId,
        batters: [strikerEntry, nonStrikerEntry, ...remainingEntries]
      };

      return {
        ...prev,
        innings1: isFirst ? newInnings : prev.innings1,
        innings2: isFirst ? prev.innings2 : newInnings
      };
    });
    sound.playTap();
  }, [players]);

  const setTossDecision = useCallback((decision: 'bat' | 'bowl') => {
    setMatchLiveState(prev => {
      if (!prev) return null;
      const userSide = prev.homeTeam.id === userTeam.id || prev.homeTeam.isUserTeam
        ? prev.homeTeam
        : prev.awayTeam.id === userTeam.id || prev.awayTeam.isUserTeam
        ? prev.awayTeam
        : prev.homeTeam;
      const opp = userSide.id === prev.homeTeam.id ? prev.awayTeam : prev.homeTeam;
      const isBat = decision === 'bat';
      const battingTeam = isBat ? userSide : opp;
      const bowlingTeam = isBat ? opp : userSide;

      const battingXIPlayers = battingTeam.playingXIIds
        .map(id => players.find(p => p.id === id))
        .filter((p): p is Player => Boolean(p));
      const bowlingXIPlayers = bowlingTeam.playingXIIds
        .map(id => players.find(p => p.id === id))
        .filter((p): p is Player => Boolean(p));

      const finalBatters = battingXIPlayers.length >= 2 ? battingXIPlayers : players.filter(p => p.clubId === battingTeam.id).slice(0, 11);
      const finalBowlers = bowlingXIPlayers.length >= 2 ? bowlingXIPlayers : players.filter(p => p.clubId === bowlingTeam.id).slice(0, 11);

      const initBatters: BatterInningsScorecard[] = finalBatters.map((p, idx) => ({
        playerId: p.id,
        name: p.name,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        dismissal: 'not out',
        strikeRate: 0,
        isOnStrike: idx === 0
      }));

      const initBowlers: BowlerInningsScorecard[] = buildBowlerScorecardPool(finalBowlers);

      const innings1: InningsData = {
        battingTeamId: battingTeam.id,
        bowlingTeamId: bowlingTeam.id,
        runs: 0,
        wickets: 0,
        overs: 0,
        ballsCompleted: 0,
        maxOvers: prev.innings1.maxOvers || (prev.format === 'TEST' ? 90 : prev.format === 'ODI' ? 50 : 20),
        currentOverRuns: 0,
        batters: initBatters,
        bowlers: initBowlers,
        currentStrikerId: finalBatters[0]?.id || 'p1',
        currentNonStrikerId: finalBatters[1]?.id || 'p2',
        currentBowlerId: initBowlers[0]?.playerId || finalBowlers[0]?.id,
        ballHistory: [],
        fallOfWickets: [],
        overRuns: []
      };

      return {
        ...prev,
        innings1,
        status: 'in_progress'
      };
    });
    sound.playTap();
  }, [userTeam, players]);

  // AUCTION LOGIC
  const startAuctionSession = useCallback(() => {
    const pool = players.filter(p => !p.clubId || p.tier === 'Platinum' || p.tier === 'Gold');
    setAuctionPool(pool);
    setCurrentAuctionIndex(0);

    const firstPlayer = pool[0] || players[0];
    const initialLot: AuctionLot = {
      lotIndex: 1,
      totalLots: pool.length,
      player: firstPlayer,
      currentBidCr: firstPlayer.basePriceCr,
      currentBidderTeamId: null,
      bidsHistory: [],
      status: 'active',
      soldToTeamId: null
    };

    setAuctionLot(initialLot);
    setActiveTab('auction');
  }, [players]);

  const placeUserBid = useCallback(() => {
    if (!auctionLot || auctionLot.status !== 'active') return;
    if (auctionLot.currentBidderTeamId === userTeam.id) return; // Cannot outbid self

    const hasOpeningBid = auctionLot.currentBidderTeamId !== null;
    const increment =
      auctionLot.currentBidCr < 1.0
        ? 0.05
        : auctionLot.currentBidCr < 2.0
        ? 0.1
        : auctionLot.currentBidCr < 5.0
        ? 0.2
        : 0.25;
    const nextAmount = hasOpeningBid
      ? Number((auctionLot.currentBidCr + increment).toFixed(2))
      : Number(auctionLot.currentBidCr.toFixed(2));

    const userSquadPlayers = players.filter(p => p.clubId === userTeam.id);
    const userOverseasCount = userSquadPlayers.filter(p => isOverseasPlayer(p)).length;

    if (userSquadPlayers.length >= 25) return; // Max 25 squad limit
    if (isOverseasPlayer(auctionLot.player) && userOverseasCount >= 8) return; // Max 8 overseas limit
    if (userTeam.purseCr < nextAmount) {
      return; // Not enough purse
    }

    sound.playGavel();
    const newBid = {
      teamId: userTeam.id,
      teamShortName: userTeam.shortName,
      amountCr: nextAmount,
      timeStr: 'Just now'
    };

    setAuctionLot(prev => {
      if (!prev) return null;
      return {
        ...prev,
        currentBidCr: nextAmount,
        currentBidderTeamId: userTeam.id,
        bidsHistory: [newBid, ...prev.bidsHistory]
      };
    });

    // AI Counter-bid trigger
    setIsAiBidding(true);
    const delayMs = aiBiddingSpeed === 'instant' ? 120 : aiBiddingSpeed === 'fast' ? 450 : 1000;
    setTimeout(() => {
      const aiInc =
        nextAmount < 1.0 ? 0.05 : nextAmount < 2.0 ? 0.1 : nextAmount < 5.0 ? 0.2 : 0.25;
      const aiAmount = Number((nextAmount + aiInc).toFixed(2));
      const shouldAiBid = Math.random() < 0.65 && aiAmount <= 18.5;
      if (shouldAiBid) {
        const otherTeams = teams.filter(t => {
          if (t.id === userTeam.id) return false;
          const tSquad = players.filter(p => p.clubId === t.id);
          const tOverseas = tSquad.filter(p => p.isOverseas).length;
          if (tSquad.length >= 25) return false;
          if (auctionLot.player.isOverseas && tOverseas >= 8) return false;
          return t.purseCr >= aiAmount;
        });
        const aiTeam = otherTeams[Math.floor(Math.random() * otherTeams.length)];
        if (aiTeam) {
          sound.playGavel();
          setAuctionLot(lot => {
            if (!lot || lot.status !== 'active') return lot;
            return {
              ...lot,
              currentBidCr: aiAmount,
              currentBidderTeamId: aiTeam.id,
              bidsHistory: [{
                teamId: aiTeam.id,
                teamShortName: aiTeam.shortName,
                amountCr: aiAmount,
                timeStr: 'Just now'
              }, ...lot.bidsHistory]
            };
          });
        }
      }
      setIsAiBidding(false);
    }, delayMs);
  }, [auctionLot, userTeam, teams, players, aiBiddingSpeed]);

  const skipAuctionLot = useCallback(() => {
    if (!auctionLot || auctionLot.status !== 'active') return;

    // Finalize sale to current bidder or unsold
    sound.playGavel();
    if (auctionLot.currentBidderTeamId) {
      const winnerId = auctionLot.currentBidderTeamId;
      const winningPrice = auctionLot.currentBidCr;

      // Deduct purse and assign player
      setTeams(prev => prev.map(t => {
        if (t.id === winnerId) {
          return {
            ...t,
            purseCr: Math.max(0, Number((t.purseCr - winningPrice).toFixed(2))),
            squad: [...t.squad.filter(sp => sp.id !== auctionLot.player.id), { ...auctionLot.player, clubId: winnerId, salaryCr: winningPrice }]
          };
        }
        return t;
      }));

      setAuctionLot(prev => prev ? {
        ...prev,
        status: 'sold',
        soldToTeamId: winnerId,
        soldPriceCr: winningPrice
      } : null);

      if (winnerId === userTeam.id) {
        sound.playCrowdCheer(0.8);
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
        unlockAchievement('ach_3');
        if (winningPrice >= 20) {
          unlockAchievement('ach_32');
        }
        if (Math.max(auctionLot.player.ratings.bat, auctionLot.player.ratings.bowl) >= 88 && winningPrice < 5) {
          unlockAchievement('ach_33');
        }
      }
    } else {
      setAuctionLot(prev => prev ? { ...prev, status: 'unsold' } : null);
    }
  }, [auctionLot, userTeam.id, unlockAchievement]);

  const useRtmCard = useCallback(() => {
    if (!auctionLot || auctionLot.status !== 'active' || userTeam.rtmCards <= 0) return;
    if (userTeam.purseCr < auctionLot.currentBidCr) return;
    const userSquadPlayers = players.filter(p => p.clubId === userTeam.id);
    if (userSquadPlayers.length >= 25) return;
    if (auctionLot.player.isOverseas && userSquadPlayers.filter(p => p.isOverseas).length >= 8) return;

    sound.playGavel();
    sound.playCrowdCheer(1.0);
    confetti({ particleCount: 60, spread: 70, origin: { y: 0.5 } });

    const winningPrice = auctionLot.currentBidCr;
    unlockAchievement('ach_3');
    if (winningPrice >= 20) {
      unlockAchievement('ach_32');
    }
    if (Math.max(auctionLot.player.ratings.bat, auctionLot.player.ratings.bowl) >= 88 && winningPrice < 5) {
      unlockAchievement('ach_33');
    }

    // Deduct RTM card and purse
    setTeams(prev => prev.map(t => {
      if (t.id === userTeam.id) {
        return {
          ...t,
          rtmCards: t.rtmCards - 1,
          purseCr: Math.max(0, Number((t.purseCr - auctionLot.currentBidCr).toFixed(2))),
          squad: [...t.squad.filter(sp => sp.id !== auctionLot.player.id), { ...auctionLot.player, clubId: userTeam.id, salaryCr: winningPrice }]
        };
      }
      return t;
    }));

    setAuctionLot(prev => prev ? {
      ...prev,
      status: 'sold',
      soldToTeamId: userTeam.id,
      soldPriceCr: prev.currentBidCr
    } : null);
  }, [auctionLot, userTeam, players, unlockAchievement]);

  const nextAuctionLot = useCallback(() => {
    const nextIdx = currentAuctionIndex + 1;
    if (nextIdx < auctionPool.length) {
      setCurrentAuctionIndex(nextIdx);
      const nextPlayer = auctionPool[nextIdx];
      setAuctionLot({
        lotIndex: nextIdx + 1,
        totalLots: auctionPool.length,
        player: nextPlayer,
        currentBidCr: nextPlayer.basePriceCr,
        currentBidderTeamId: null,
        bidsHistory: [],
        status: 'active',
        soldToTeamId: null
      });
      sound.playTap();
    } else {
      setActiveTab('hub');
    }
  }, [currentAuctionIndex, auctionPool]);

  // AUCTION SANDBOX IMPLEMENTATION (Completely isolated from career save slots)
  const [auctionSandbox, setAuctionSandbox] = useState<AuctionSandboxSessionState | null>(null);

  const startAuctionSandbox = useCallback((params: {
    franchiseId: string;
    mode: AuctionSandboxMode;
    userRetainedPlayerIds: string[];
  }) => {
    const sandboxData = buildAuctionSandboxState({
      userTeamId: params.franchiseId,
      mode: params.mode,
      userRetainedPlayerIds: params.userRetainedPlayerIds,
      allTeams: teams,
      allPlayers: players
    });

    setAuctionSandbox({
      isActive: true,
      franchiseId: params.franchiseId,
      mode: params.mode,
      userRetainedPlayerIds: params.userRetainedPlayerIds,
      sandboxTeams: sandboxData.updatedTeams,
      sandboxPlayers: sandboxData.updatedPlayers,
      sandboxLots: sandboxData.auctionPoolLots,
      teamPursesByShort: sandboxData.teamPursesByShort,
      userPurseCr: sandboxData.userPurseCr,
      userRtmCards: sandboxData.userRtmCards,
      releasedPlayerIds: sandboxData.releasedPlayerIds
    });

    setActiveTab('auction');
    sound.playCrowdCheer(0.8);
  }, [teams, players]);

  const exitAuctionSandbox = useCallback(() => {
    setAuctionSandbox(null);
    setActiveTab('landing');
    sound.playTap();
  }, []);

  const commitSandboxAuctionSale = useCallback((lot: AuctionPlayerItem, buyerShort: string, priceCr: number) => {
    setAuctionSandbox(prev => {
      if (!prev) return null;
      const buyerTeam = prev.sandboxTeams.find(
        t => t.shortName.toUpperCase() === buyerShort.toUpperCase()
      );
      if (!buyerTeam) return prev;

      const existingPlayer = prev.sandboxPlayers.find(
        p => p.id === lot.id || p.name.toLowerCase() === lot.name.toLowerCase()
      );
      const isOverseas = isOverseasPlayer(lot) || isOverseasPlayer(existingPlayer || {});
      const mappedPlayer: Player = existingPlayer
        ? {
            ...existingPlayer,
            name: lot.name,
            country: lot.country || existingPlayer.country || 'India',
            isOverseas,
            clubId: buyerTeam.id,
            salaryCr: priceCr
          }
        : {
            id: lot.id,
            name: lot.name,
            jerseyNumber: lot.jerseyNumber || 45,
            age: lot.age,
            country: lot.country || 'India',
            isOverseas,
            role: lot.role,
            battingHand: lot.battingHand,
            bowlingArm: lot.bowlingArm || 'RAM',
            bowlingStyle: lot.bowlingStyle || undefined,
            clubId: buyerTeam.id,
            salaryCr: priceCr,
            basePriceCr: lot.basePriceCr || 0.3,
            tier: lot.tier,
            ratings: {
              bat: lot.ratings.bat,
              pow: lot.ratings.pow ?? 75,
              bowl: lot.ratings.bowl,
              ctrl: lot.ratings.ctrl ?? 75,
              pace: lot.ratings.pace ?? 50,
              dth: lot.ratings.dth ?? 50,
              tmp: lot.ratings.tmp ?? 80,
              fit: 95
            },
            form: lot.form || 80,
            morale: lot.morale || 85,
            fitness: 95,
            isInjured: false,
            injuryDays: 0,
            stats: {
              matches: lot.iplMatches || 0,
              runs: 0,
              balls: 0,
              fours: 0,
              sixes: 0,
              fifties: 0,
              hundreds: 0,
              highestScore: 0,
              average: 0,
              strikeRate: 0,
              wickets: 0,
              oversBowled: 0,
              runsConceded: 0,
              maidens: 0,
              bestBowling: '0/0',
              economy: 0
            }
          };

      const nextPlayers = existingPlayer
        ? prev.sandboxPlayers.map(p => p.id === existingPlayer.id ? mappedPlayer : p)
        : [...prev.sandboxPlayers, mappedPlayer];

      const nextTeams = prev.sandboxTeams.map(t => {
        if (t.id === buyerTeam.id) {
          const updatedPurse = Math.max(0, Number((t.purseCr - priceCr).toFixed(2)));
          const currentSquad = t.squad.filter(p => p.id !== mappedPlayer.id);
          return {
            ...t,
            purseCr: updatedPurse,
            squad: [...currentSquad, mappedPlayer],
            playingXIIds: t.playingXIIds.length < 11 && !t.playingXIIds.includes(mappedPlayer.id)
              ? [...t.playingXIIds, mappedPlayer.id]
              : t.playingXIIds
          };
        }
        return t;
      });

      const nextPurses = {
        ...prev.teamPursesByShort,
        [buyerShort]: Math.max(0, Number(((prev.teamPursesByShort[buyerShort] || 0) - priceCr).toFixed(2)))
      };

      const isUserBuyer = buyerTeam.id === prev.franchiseId;

      return {
        ...prev,
        sandboxTeams: nextTeams,
        sandboxPlayers: nextPlayers,
        teamPursesByShort: nextPurses,
        userPurseCr: isUserBuyer ? Math.max(0, Number((prev.userPurseCr - priceCr).toFixed(2))) : prev.userPurseCr
      };
    });
  }, []);

  return (
    <GameContext.Provider
      value={{
        activeTab,
        setActiveTab,
        careerPhase,
        setCareerPhase,
        careerBoardReview,
        setCareerBoardReview,
        players,
        setPlayers,
        updatePlayer,
        teams,
        setTeams,
        userTeam,
        selectUserTeam,
        startNewCareer,
        activeSaveSlot,
        setActiveSaveSlot,
        updateUserTeamXI,
        setTeamCaptain,
        leagues,
        currentLeagueId,
        setCurrentLeagueId,
        nations,
        nationalSquadIds,
        setNationalSquadIds,
        internationalSeries,
        coachProfile,
        updateCoachProfile,
        achievements,
        unlockAchievement,
        jobOffers,
        acceptJobOffer,
        resignNationalJob,
        applyCareerJobDecision,
        confirmNationalSquad,
        completeInternationalSeries,
        switchUserClub,
        validateClubSquad,
        confirmClubSquad,
        advanceOffSeasonToNextSeason,
        advanceCalendarToNextTour,
        advanceCalendarDay,
        setCalendarDateIndex,
        settings,
        updateSettings,
        saveSlots,
        saveToSlot,
        loadFromSlot,
        deleteSlot,
        simSingleIntlMatch,
        homePitch,
        setHomePitch,
        simTokens,
        setSimTokens,
        squadStamina,
        setSquadStamina,
        completedMatchesHistory,
        inboxMessages,
        replyToInboxMessage,
        matchLiveState,
        startMatch,
        createFranchiseMatchState,
        startInternationalMatch,
        playPlayoffMatch,
        simPlayoffMatch,
        resetPlayoffBracket,
        pendingRetentionModal,
        setPendingRetentionModal,
        finishMatch,
        runBallSimulation,
        simCurrentOver,
        simEntireMatch,
        updateBowlingTactics,
        updateBattingTactics,
        updateFielders,
        activateImpactPlayer,
        startSecondInnings,
        selectNewBowler,
        selectNextBatter,
        selectOpeners,
        setTossDecision,
        triggerDrsReview,
        resolveDrsReview,
        triggerRainDLSInterruption,
        activatePowerSurge,
        declareInnings,
        trainSquad,
        claimDoubleTrainingXp,
        boostTeamMorale,
        releasePlayersForAuction,
        startNewSeason,
        auctionLot,
        startAuctionSession,
        placeUserBid,
        skipAuctionLot,
        useRtmCard,
        nextAuctionLot,
        isAiBidding,
        aiBiddingSpeed,
        setAiBiddingSpeed,
        auctionSandbox,
        startAuctionSandbox,
        exitAuctionSandbox,
        commitSandboxAuctionSale,
        tournamentHonors
      }}
    >
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
};
