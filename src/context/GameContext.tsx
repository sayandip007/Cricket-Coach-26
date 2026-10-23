import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Player, Team, League, Nation, Achievement, JobOffer, CoachProfile,
  MatchLiveState, InningsData, AuctionLot, BatterInningsScorecard, BowlerInningsScorecard, FielderPosition, BallOutcome,
  CompletedMatchRecord, InboxMessage, TournamentHonor, TeamSeasonRecord,
  CareerPhase, CareerBoardReview
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
}

export interface InternationalSeriesState {
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

export function buildInitialSeriesForNation(
  userNat: Nation,
  allNations: Nation[],
  preferredOpponentId?: string
): InternationalSeriesState {
  const candidates = allNations.filter(n => n.id !== userNat.id && n.name.toLowerCase() !== userNat.name.toLowerCase());
  const oppNat =
    (preferredOpponentId ? candidates.find(n => n.id === preferredOpponentId || n.name.toLowerCase() === preferredOpponentId.toLowerCase()) : undefined) ||
    (userNat.name === 'South Africa'
      ? candidates.find(n => n.name === 'India')
      : candidates.find(n => n.name === 'South Africa')) ||
    candidates[0] ||
    allNations[0];

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

  return {
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
 * Validates and recovers restored career state at the persistence boundary (save/load and startup).
 * - Validates `rawPhase` against `VALID_CAREER_PHASES` and migrates legacy phase strings
 * - Prevents franchise-only saves from resuming in international-only phases and vice versa
 * - Prevents an already-completed final/board review/auction from repeating on reload
 * - Scopes `careerBoardReview` to the active `(seasonYear, teamId)` and archives mismatched reviews
 */
export function validateAndRecoverCareerState(params: {
  rawPhase: unknown;
  coachProfile: CoachProfile;
  teams: Team[];
  leagues: League[];
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
  migrated: boolean;
  recoveryReason?: string;
} {
  const {
    rawPhase,
    coachProfile,
    leagues,
    nations,
    nationalSquadIds,
    careerBoardReview,
    players
  } = params;

  const activeLeague = leagues[0];
  const activeSeasonYear =
    activeLeague?.seasonYear ||
    parseInt(normalizeSeasonYear(activeLeague?.seasonName), 10) ||
    2026;
  const activeTeamId = coachProfile.clubTeamId;
  const coachedNation = coachProfile.nationalTeamId
    ? nations.find(n => n.id === coachProfile.nationalTeamId) || null
    : null;

  let migrated = false;
  let recoveryReason: string | undefined;

  // 1. Scope board review to active (seasonYear, teamId)
  let updatedHistory = [...(coachProfile.boardReviewsHistory || [])];
  let scopedReview: CareerBoardReview | null = careerBoardReview;
  if (
    scopedReview &&
    (scopedReview.teamId !== activeTeamId || scopedReview.seasonYear !== activeSeasonYear)
  ) {
    const alreadyArchived = updatedHistory.some(
      r => r.seasonYear === scopedReview!.seasonYear && r.teamId === scopedReview!.teamId
    );
    if (!alreadyArchived) {
      updatedHistory = [scopedReview, ...updatedHistory];
    }
    scopedReview =
      updatedHistory.find(r => r.seasonYear === activeSeasonYear && r.teamId === activeTeamId) ||
      null;
    migrated = true;
    recoveryReason = 'Scoped board review to active team and season';
  }

  // 2. Reconcile nationalSquadIds with coached nation if applicable
  let reconciledNatSquadIds = Array.isArray(nationalSquadIds) ? [...nationalSquadIds] : [];
  if (coachedNation) {
    const nationLower = coachedNation.name.trim().toLowerCase();
    const eligibleSet = new Set(
      players
        .filter(p => p.country && p.country.trim().toLowerCase() === nationLower)
        .map(p => p.id)
    );
    const seen = new Set<string>();
    reconciledNatSquadIds = reconciledNatSquadIds.filter(id => {
      if (!eligibleSet.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  // 3. Migrate legacy phase aliases
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
  }

  const finalCompleted = Boolean(activeLeague?.playoffs?.final?.completed);
  const allLeagueMatchesPlayed = Boolean(
    activeLeague?.standings &&
      activeLeague.standings.length > 0 &&
      activeLeague.standings.every(s => s.played >= 18)
  );

  // Helper to infer franchise phase from league state
  const inferFranchisePhase = (): CareerPhase => {
    if (finalCompleted) {
      return scopedReview ? 'career_decision' : 'board_review';
    }
    if (allLeagueMatchesPlayed) {
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

  // 4. Cross-mode & idempotency recovery guards
  const isInternationalOnlyPhase =
    resolvedPhase === 'international_squad_selection' ||
    resolvedPhase === 'international_series';

  if (isInternationalOnlyPhase && !coachedNation) {
    // Franchise-only career cannot resume in an international-only phase
    resolvedPhase = inferFranchisePhase();
    migrated = true;
    recoveryReason = 'Recovered franchise-only save from international phase';
  } else if (resolvedPhase === 'international_series' && coachedNation && reconciledNatSquadIds.length !== 15) {
    // International series requires a valid 15-player native squad
    resolvedPhase = 'international_squad_selection';
    migrated = true;
    recoveryReason = 'Recovered international_series with incomplete national squad to international_squad_selection';
  } else if (resolvedPhase === 'season_final' && finalCompleted) {
    // Prevent a completed final from re-running final or triggering duplicate board review
    resolvedPhase = scopedReview ? 'career_decision' : 'board_review';
    migrated = true;
    recoveryReason = 'Advanced completed season_final to post-final review/decision phase';
  }

  return {
    careerPhase: resolvedPhase,
    careerBoardReview: scopedReview,
    nationalSquadIds: reconciledNatSquadIds,
    coachProfile: {
      ...coachProfile,
      boardReviewsHistory: updatedHistory
    },
    migrated,
    recoveryReason
  };
}

/**
 * Authoritative pure state transition for Career Job Decision (Franchise & International).
 * Never mutates objects in place.
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
    careerBoardReview
  } = state;

  const targetClub = teams.find(t => t.id === selectedClubId) || teams.find(t => t.id === coachProfile.clubTeamId) || teams[0];
  const resolvedClubId = targetClub.id;
  const clubChanged = resolvedClubId !== coachProfile.clubTeamId;

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
    const exists = nextBoardReviewsHistory.some(
      r => r.seasonYear === careerBoardReview.seasonYear && r.teamId === careerBoardReview.teamId
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

  const hasCountrySelection = Boolean(selectedCountryId && selectedCountryId !== 'none');
  const targetNation = hasCountrySelection
    ? nations.find(
        n =>
          n.id === selectedCountryId ||
          n.name.toLowerCase() === String(selectedCountryId).toLowerCase()
      ) || null
    : null;

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

    const nextSeries =
      internationalSeries.userNationId === targetNation.id &&
      internationalSeries.matches.some(m => !m.completed)
        ? internationalSeries
        : buildInitialSeriesForNation(targetNation, updatedNations);

    return {
      coachProfile: {
        ...coachProfile,
        clubTeamId: resolvedClubId,
        nationalTeamId: targetNation.id,
        clubStints: updatedStints,
        boardReviewsHistory: nextBoardReviewsHistory
      },
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

  return {
    coachProfile: {
      ...coachProfile,
      clubTeamId: resolvedClubId,
      nationalTeamId: null,
      clubStints: updatedStints,
      boardReviewsHistory: nextBoardReviewsHistory
    },
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

  const targetNation = nations.find(
    n => n.id === nationIdOrName || n.name.toLowerCase() === (nationIdOrName || '').toLowerCase()
  );
  if (!targetNation) {
    return {
      success: false,
      error: `Nation "${nationIdOrName}" was not found.`,
      nextState: unchanged
    };
  }

  const nationLower = targetNation.name.trim().toLowerCase();
  const eligiblePool = players.filter(
    p => p.country && p.country.trim().toLowerCase() === nationLower
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
      error: `A national squad must contain exactly 15 players (selected: ${selectedPlayerIds?.length || 0}).`,
      nextState: unchanged
    };
  }

  const uniqueIds = new Set(selectedPlayerIds);
  if (uniqueIds.size !== 15) {
    return {
      success: false,
      error: 'Duplicate players selected in national squad.',
      nextState: unchanged
    };
  }

  for (const pid of selectedPlayerIds) {
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

  const updatedNations = nations.map(n => ({
    ...n,
    isUserManaging: n.id === targetNation.id
  }));

  const updatedSeries =
    internationalSeries.userNationId === targetNation.id &&
    internationalSeries.matches.length > 0 &&
    internationalSeries.matches.some(m => !m.completed)
      ? internationalSeries
      : buildInitialSeriesForNation(targetNation, updatedNations);

  return {
    success: true,
    nextState: {
      nations: updatedNations,
      coachProfile: {
        ...coachProfile,
        nationalTeamId: targetNation.id
      },
      nationalSquadIds: [...selectedPlayerIds],
      internationalSeries: updatedSeries,
      careerPhase: 'international_series'
    }
  };
}

/**
 * Authoritative pure state transition for completing an international series and advancing to the next international tour/series.
 * Never transitions into IPL franchise retention, auction, or franchise season reset.
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
  internationalSeries: InternationalSeriesState;
  careerPhase: CareerPhase;
  coachProfile: CoachProfile;
} {
  const { nations, coachProfile, internationalSeries } = state;
  const userNation =
    nations.find(n => n.id === coachProfile.nationalTeamId) ||
    nations.find(n => n.id === internationalSeries.userNationId) ||
    nations[0];

  const otherNations = nations.filter(n => n.id !== userNation.id);
  const currentOppIdx = otherNations.findIndex(n => n.id === internationalSeries.opponentNationId);
  const nextOpp =
    (options?.nextOpponentId
      ? otherNations.find(
          n =>
            n.id === options.nextOpponentId ||
            n.name.toLowerCase() === options.nextOpponentId!.toLowerCase()
        )
      : undefined) ||
    otherNations[(currentOppIdx + 1) % Math.max(1, otherNations.length)] ||
    otherNations[0];

  const wonSeries = internationalSeries.seriesWins > internationalSeries.seriesLosses;
  const nextSeries = buildInitialSeriesForNation(userNation, nations, nextOpp?.id);
  const nextPhase: CareerPhase = options?.requireSquadReselection
    ? 'international_squad_selection'
    : 'international_series';

  return {
    internationalSeries: nextSeries,
    careerPhase: nextPhase,
    coachProfile: {
      ...coachProfile,
      internationalTitles: (coachProfile.internationalTitles || 0) + (wonSeries ? 1 : 0)
    }
  };
}

/**
 * Authoritative pure state transition for Franchise Club Squad Confirmation.
 * Enforces IPL squad size (16-25), overseas limit (<= 8), unique IDs, and club eligibility.
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
  nextState: {
    teams: Team[];
    players: Player[];
    careerPhase: CareerPhase;
  };
} {
  const { teams, players, careerPhase } = state;
  const unchanged = { teams, players, careerPhase };

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
    nextState: {
      teams: updatedTeams,
      players: updatedPlayers,
      careerPhase: 'off_season_rest'
    }
  };
}

/**
 * Authoritative pure state transition for starting the next IPL franchise season.
 * Idempotent: if the active league is already at `resolvedNextYear` and in `league_stage` with 0 matches played,
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

  const activeLeague = leagues.find(l => l.id === currentLeagueId) || leagues[0];
  const outgoingYearStr = normalizeSeasonYear(activeLeague?.seasonName || activeLeague?.seasonYear);
  const outgoingYearNum = parseInt(outgoingYearStr, 10) || 2026;
  const resolvedNextYear = nextYear && nextYear > outgoingYearNum ? nextYear : outgoingYearNum + 1;

  // Idempotency guard: if the league was already initialized to `nextYear` and 0 matches have been played
  if (
    nextYear &&
    outgoingYearNum === nextYear &&
    careerPhase === 'league_stage' &&
    activeLeague?.standings?.every(s => s.played === 0)
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

  const userTeam = teams.find(t => t.id === coachProfile.clubTeamId) || teams[0];
  const targetClubId = selectedClubId || userTeam.id;
  const targetClubObj = teams.find(t => t.id === targetClubId) || userTeam;

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
      r => r.seasonYear === careerBoardReview.seasonYear && r.teamId === careerBoardReview.teamId
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

  const updatedCoachProfile: CoachProfile = {
    ...coachProfile,
    clubTeamId: targetClubId,
    nationalTeamId: selectedNationId !== undefined ? selectedNationId : coachProfile.nationalTeamId,
    domesticStats: {
      ...coachProfile.domesticStats,
      seasons: (coachProfile.domesticStats?.seasons || 1) + 1
    },
    clubStints: updatedStints,
    boardReviewsHistory: updatedBoardHistory
  };

  const updatedNations =
    selectedNationId !== undefined
      ? nations.map(n => ({
          ...n,
          isUserManaging: selectedNationId !== null && n.id === selectedNationId
        }))
      : nations;

  // 5. Archive completed season records and build new season schedule starting at Match 1 (currentDateIndex: 0)
  const updatedLeagues = leagues.map(l => {
    if (l.id === 'pt20') {
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
 * - Never triggers an IPL season reset if the active phase is an international-only workflow
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
    state.careerPhase === 'international_squad_selection' ||
    state.careerPhase === 'international_series'
  ) {
    return {
      ...state,
      restDaysProcessed: 0,
      intermediatePhase: state.careerPhase
    };
  }

  const activeLeague = state.leagues.find(l => l.id === state.currentLeagueId) || state.leagues[0];
  const remainingCalendarDays = activeLeague
    ? Math.max(7, activeLeague.calendarDates.length - activeLeague.currentDateIndex)
    : 7;

  // Process daily off-season recovery across remaining rest/training days
  let recoveredPlayers = state.players.map(p => ({ ...p }));
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

  const recoveredTeams = state.teams.map(t => ({
    ...t,
    squad: t.squad.map(sp => recoveredPlayers.find(rp => rp.id === sp.id) || sp)
  }));

  const nextSeasonRes = applyStartNewFranchiseSeasonState(
    {
      ...state,
      players: recoveredPlayers,
      teams: recoveredTeams,
      careerPhase: 'next_season_ready'
    },
    state.coachProfile.clubTeamId,
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
    restDaysProcessed: remainingCalendarDays,
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
  completeInternationalSeries: (options?: { nextOpponentId?: string; requireSquadReselection?: boolean }) => void;
  advanceOffSeasonToNextSeason: (targetNextYear?: number) => void;
  switchUserClub: (newClubId: string) => void;
  validateClubSquad: (teamId?: string) => { isValid: boolean; errors: string[] };
  confirmClubSquad: (teamId: string, squadPlayerIds: string[]) => { success: boolean; error?: string };
  advanceCalendarDay: () => void;
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
  startInternationalMatch: (homeCountry?: string, awayCountry?: string, venue?: string, format?: 'T20' | 'ODI' | 'TEST') => void;
  playPlayoffMatch: (leagueId: string, stage: 'q1' | 'eliminator' | 'q2' | 'final') => void;
  simPlayoffMatch: (leagueId: string, stage: 'q1' | 'eliminator' | 'q2' | 'final') => void;
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
        const iplLeagues = Array.isArray(parsed) ? parsed.filter(l => l.id === 'pt20') : [];
        if (iplLeagues.length > 0 && iplLeagues[0].standings && iplLeagues[0].standings.length > 0) {
          const result = iplLeagues.map(l => {
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
                : buildSeasonCalendarForTeam(activeUserTeamId, INITIAL_TEAMS, false, parseInt(normYear, 10) || 2026)
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
      calendarDates: buildSeasonCalendarForTeam(activeUserTeamId, INITIAL_TEAMS, false, 2026)
    }));
    safeStorageSet('ms_leagues_v6', JSON.stringify(seededLeagues));
    return seededLeagues;
  });

  const [currentLeagueId, setCurrentLeagueId] = useState<string>('pt20');

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

  const [internationalSeries, setInternationalSeries] = useState<InternationalSeriesState>(() => {
    const saved = localStorage.getItem('ms_intl_series_v6');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.userNationName && Array.isArray(parsed.matches)) return parsed;
      } catch {}
    }
    const initNation = INITIAL_NATIONS.find(n => n.id === INITIAL_COACH_PROFILE.nationalTeamId) || INITIAL_NATIONS[0];
    return buildInitialSeriesForNation(initNation, INITIAL_NATIONS);
  });

  // Validate and recover persisted career state on initial mount
  const didValidateInitialMountRef = useRef(false);
  useEffect(() => {
    if (didValidateInitialMountRef.current) return;
    didValidateInitialMountRef.current = true;
    const rawSavedPhase = (() => {
      const s = localStorage.getItem('ms_career_phase_v6');
      if (!s) return careerPhase;
      try {
        return JSON.parse(s);
      } catch {
        return s;
      }
    })();
    const recovered = validateAndRecoverCareerState({
      rawPhase: rawSavedPhase,
      coachProfile,
      teams,
      leagues,
      nations,
      nationalSquadIds,
      careerBoardReview,
      players,
      internationalSeries
    });
    if (recovered.migrated) {
      setCareerPhase(recovered.careerPhase);
      setCareerBoardReview(recovered.careerBoardReview);
      setNationalSquadIds(recovered.nationalSquadIds);
      setCoachProfile(recovered.coachProfile);
    }
  }, [
    careerPhase,
    coachProfile,
    teams,
    leagues,
    nations,
    nationalSquadIds,
    careerBoardReview,
    players,
    internationalSeries,
    setCareerPhase,
    setCareerBoardReview,
    setNationalSquadIds
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
  }, []);

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
    sound.playTap();
  }, [
    leagues, currentLeagueId, userTeam, coachProfile, teams, players,
    nations, achievements, homePitch, simTokens, squadStamina,
    completedMatchesHistory, inboxMessages, nationalSquadIds,
    internationalSeries, tournamentHonors, setActiveSaveSlot, writeSlotSnapshot
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
      if (Array.isArray(parsed.leagues)) {
        const filteredLeagues = parsed.leagues
          .filter((l: League) => l.id === 'pt20' || l.id === 'league_ipl' || l.name?.toLowerCase().includes('indian premier'))
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
        if (filteredLeagues.length > 0) {
          resolvedLeagues = filteredLeagues;
          setLeagues(filteredLeagues);
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
      if (parsed.internationalSeries) setInternationalSeries(parsed.internationalSeries);

      const recovered = validateAndRecoverCareerState({
        rawPhase: parsed.careerPhase ?? 'league_stage',
        coachProfile: parsed.coachProfile || coachProfile,
        teams: resolvedTeams,
        leagues: resolvedLeagues,
        nations: resolvedNations,
        nationalSquadIds: Array.isArray(parsed.nationalSquadIds) ? parsed.nationalSquadIds : nationalSquadIds,
        careerBoardReview: parsed.careerBoardReview !== undefined ? parsed.careerBoardReview : null,
        players: loadedPlayers,
        internationalSeries: parsed.internationalSeries || internationalSeries
      });

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
    setMatchLiveState(null);
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
    const targetClub = teams.find(t => t.id === newClubId);
    if (!targetClub) return;

    setTeams(prev => prev.map(t => ({
      ...t,
      isUserTeam: t.id === newClubId
    })));

    setCoachProfile(prev => {
      const prevStints = prev.clubStints || [];
      const activeLeague = leagues.find(l => l.id === currentLeagueId) || leagues[0];
      const currentYearStr = normalizeSeasonYear(activeLeague?.seasonName || activeLeague?.seasonYear);
      const updatedStints = [
        ...prevStints.map((s, idx) =>
          idx === prevStints.length - 1 && s.teamId !== newClubId
            ? { ...s, period: s.period.replace('–present', `–${currentYearStr}`) }
            : s
        ),
        ...(prevStints.some(s => s.teamId === newClubId) ? [] : [{
          id: `stint_${newClubId}_${Date.now()}`,
          teamId: newClubId,
          teamName: targetClub.city || targetClub.name,
          period: `${currentYearStr}–present`,
          seasons: 1,
          matches: 0,
          wins: 0,
          losses: 0,
          winPct: 0,
          titles: 0
        }])
      ];

      return {
        ...prev,
        clubTeamId: newClubId,
        clubStints: updatedStints
      };
    });
    sound.playTap();
  }, [teams, leagues, currentLeagueId]);

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
    if (offer.type === 'club') {
      const newTeam = teams.find(t => t.name.toLowerCase().includes(offer.name.toLowerCase()));
      if (newTeam) {
        setTeams(prev => prev.map(t => ({
          ...t,
          isUserTeam: t.id === newTeam.id
        })));
        setCoachProfile(prev => {
          const existingStints = prev.clubStints && prev.clubStints.length > 0
            ? prev.clubStints.map((s, idx, arr) =>
                idx === arr.length - 1 && s.period.includes('present')
                  ? { ...s, period: s.period.replace('–present', '') }
                  : s
              )
            : [];
          const nextStints = prev.clubTeamId === newTeam.id
            ? existingStints
            : [
                ...existingStints,
                {
                  id: `stint_${newTeam.id}_${Date.now()}`,
                  teamId: newTeam.id,
                  teamName: newTeam.city || newTeam.name,
                  period: '2026–present',
                  seasons: 1,
                  matches: 0,
                  wins: 0,
                  losses: 0,
                  winPct: 0,
                  titles: 0
                }
              ];
          return {
            ...prev,
            clubTeamId: newTeam.id,
            clubStints: nextStints
          };
        });
      }
    } else {
      const nation = nations.find(n => offer.name.toLowerCase().includes(n.name.toLowerCase()));
      if (nation) {
        setCoachProfile(prev => ({
          ...prev,
          nationalTeamId: nation.id
        }));
        setNations(prev => prev.map(n => ({
          ...n,
          isUserManaging: n.id === nation.id
        })));
        const natPlayers = players.filter(p => p.country.toLowerCase() === nation.name.toLowerCase()).slice(0, 15).map(p => p.id);
        setNationalSquadIds(natPlayers);
        setInternationalSeries(buildInitialSeriesForNation(nation, nations));
        unlockAchievement('ach_55');
        if ((nation.rankT20 ?? 99) <= 4 || (nation.rankODI ?? 99) <= 4 || (nation.rankTest ?? 99) <= 4) {
          unlockAchievement('ach_59');
        }
      }
    }
    sound.playCrowdCheer(0.7);
    setActiveTab('hub');
  }, [teams, nations, players, setNationalSquadIds, unlockAchievement]);

  const resignNationalJob = useCallback(() => {
    setCoachProfile(prev => ({ ...prev, nationalTeamId: null }));
    setNations(prev => prev.map(n => ({ ...n, isUserManaging: false })));
    sound.playTap();
  }, []);

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

  const completeInternationalSeries = useCallback((options?: { nextOpponentId?: string; requireSquadReselection?: boolean }) => {
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
    setInternationalSeries(next.internationalSeries);
    setCareerPhase(next.careerPhase);
    setCoachProfile(next.coachProfile);
    sound.playCrowdCheer(0.8);
  }, [nations, coachProfile, nationalSquadIds, internationalSeries, careerPhase, setCareerPhase]);

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
  const advanceCalendarDay = useCallback(() => {
    const activeLeague = leagues.find(l => l.id === currentLeagueId) || leagues[0];
    const nextIdx = activeLeague
      ? (activeLeague.currentDateIndex + 1) % Math.max(1, activeLeague.calendarDates.length)
      : 0;
    const nextDayType = activeLeague?.calendarDates[nextIdx]?.type || 'training';

    let workingPlayers = [...players];
    const curDayIdx = activeLeague?.currentDateIndex || 0;
    const curDayObj = activeLeague?.calendarDates[curDayIdx];

    const simulatedOtherMap = new Map<string, { summary: string; winnerId: string; loserId: string; nrrDelta: number; matchState: MatchLiveState }>();
    const simulatedIntlMap = new Map<string, { summary: string; matchState: MatchLiveState }>();

    const activeSeasonKey = normalizeSeasonYear(activeLeague?.seasonName);

    if (curDayObj) {
      (curDayObj.otherMatches || []).forEach((om, omIdx) => {
        if (om.completed) return;
        const homeTeamObj = teams.find(t => t.id === om.homeTeamId) || teams[0];
        const awayTeamObj = teams.find(t => t.id === om.awayTeamId) || teams[1];
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

      (curDayObj.internationalMatches || []).forEach((im, imIdx) => {
        if (im.completed) return;
        const homeNat = buildTempNationalTeam(im.homeTeamId, workingPlayers);
        const awayNat = buildTempNationalTeam(im.awayTeamId, workingPlayers);
        const simRes = simulateAiFixtureScorecard(
          im.id,
          homeNat,
          awayNat,
          im.venue || `${im.homeTeamId} Stadium`,
          im.format || 'T20',
          'intl',
          workingPlayers,
          curDayIdx * 23 + imIdx * 13 + 7
        );
        workingPlayers = applyMatchToPlayerList(workingPlayers, simRes.matchState, activeSeasonKey);
        simulatedIntlMap.set(im.id, { summary: simRes.summary, matchState: simRes.matchState });
      });
    }

    setLeagues(prev => prev.map(l => {
      if (l.id === currentLeagueId) {
        const lDayIdx = l.currentDateIndex;
        let updatedStandings = [...l.standings];

        const updatedCalendarDates = l.calendarDates.map((d, dIdx) => {
          if (dIdx !== lDayIdx) return d;

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

          return {
            ...d,
            otherMatches: nextOtherMatches,
            internationalMatches: nextIntlMatches,
            matchFixture: d.type === 'international' && d.matchFixture && !d.matchFixture.completed
              ? {
                  ...d.matchFixture,
                  completed: true,
                  resultSummary: nextIntlMatches[0]?.resultSummary || 'Match completed',
                  completedMatchState: nextIntlMatches[0]?.completedMatchState
                }
              : d.matchFixture
          };
        });

        updatedStandings.sort((a, b) => b.points - a.points || b.nrr - a.nrr);
        if (updatedStandings.length > 0 && updatedStandings.every(s => s.played >= 18) && careerPhase === 'league_stage') {
          setCareerPhase('playoffs');
        }
        const idx = Math.min(l.calendarDates.length - 1, l.currentDateIndex + 1);
        return {
          ...l,
          standings: updatedStandings,
          calendarDates: updatedCalendarDates,
          currentDateIndex: idx
        };
      }
      return l;
    }));

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

    const finalPlayers = workingPlayers.map(p => ({
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
  }, [currentLeagueId, leagues, players, teams, buildTempNationalTeam, userTeam.id]);

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

  // Release players into the auction pool and update team purse
  const releasePlayersForAuction = useCallback((teamId: string, releasedPlayerIds: string[], updatedPurseCr: number) => {
    const releaseSet = new Set(releasedPlayerIds);
    setPlayers(prev => prev.map(p => (
      releaseSet.has(p.id)
        ? { ...p, clubId: '', isCaptain: false }
        : p
    )));
    setTeams(prev => prev.map(t => {
      if (t.id !== teamId) return t;
      const remainingSquad = t.squad.filter(p => !releaseSet.has(p.id));
      const keptXI = t.playingXIIds.filter(id => !releaseSet.has(id));
      const fillIds = remainingSquad.map(p => p.id).filter(id => !keptXI.includes(id));
      const nextXI = [...keptXI, ...fillIds].slice(0, 11);
      return {
        ...t,
        purseCr: Number(updatedPurseCr.toFixed(2)),
        squad: remainingSquad,
        playingXIIds: nextXI
      };
    }));
  }, []);

  // Transition to a new franchise season using the authoritative pure helper
  const startNewSeason = useCallback((selectedClubId?: string, selectedNationId?: string | null, nextYear?: number) => {
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
    format: 'T20' | 'ODI' | 'TEST' = 'T20'
  ) => {
    const coachedNation = coachProfile.nationalTeamId
      ? nations.find(n => n.id === coachProfile.nationalTeamId)
      : null;

    if (!coachedNation) {
      console.warn("Unplayable international fixture: Coach has no international contract.");
      return;
    }

    const isHomeCoached = Boolean(homeCountry.toLowerCase() === coachedNation.name.toLowerCase());
    const isAwayCoached = Boolean(awayCountry.toLowerCase() === coachedNation.name.toLowerCase());

    if (!isHomeCoached && !isAwayCoached) {
      console.warn(`Unplayable fixture: User represents ${coachedNation.name} and can only play matches for ${coachedNation.name}.`);
      return;
    }

    const getNationalXI = (country: string, useSelectedSquad: boolean): Player[] => {
      const countryLower = country.trim().toLowerCase();
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

    const finalHomeXI = getNationalXI(homeCountry, isHomeCoached);
    const finalAwayXI = getNationalXI(awayCountry, isAwayCoached);

    const homeNatObj = nations.find(n => n.name.toLowerCase() === homeCountry.toLowerCase());
    const awayNatObj = nations.find(n => n.name.toLowerCase() === awayCountry.toLowerCase());

    const nationalHomeTeam: Team = {
      id: `nat_${homeCountry.toLowerCase().replace(/\s+/g, '_')}`,
      name: homeCountry,
      shortName: homeNatObj?.code || (homeCountry === 'South Africa' ? 'SA' : homeCountry === 'Australia' ? 'AUS' : homeCountry.slice(0, 3).toUpperCase()),
      logoEmoji: homeNatObj?.flag || (homeCountry === 'South Africa' ? '🇿🇦' : homeCountry === 'Australia' ? '🇦🇺' : homeCountry === 'England' ? '🏴󠁧󠁢󠁥󠁮󠁧󠁿' : '🏏'),
      primaryColor: '#007749',
      secondaryColor: '#FFB81C',
      leagueId: 'intl',
      city: homeCountry === 'South Africa' ? 'Centurion' : 'Sydney',
      purseCr: 100,
      rtmCards: 0,
      captainId: finalHomeXI[0]?.id || '',
      playingXIIds: finalHomeXI.map(p => p.id),
      squad: finalHomeXI,
      isUserTeam: isHomeCoached
    };

    const nationalAwayTeam: Team = {
      id: `nat_${awayCountry.toLowerCase().replace(/\s+/g, '_')}`,
      name: awayCountry,
      shortName: awayNatObj?.code || (awayCountry === 'India' ? 'IND' : awayCountry.slice(0, 3).toUpperCase()),
      logoEmoji: awayNatObj?.flag || (awayCountry === 'India' ? '🇮🇳' : '🏏'),
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

    const newMatch: MatchLiveState = {
      id: `intl_match_${Date.now()}`,
      leagueId: format === 'TEST' ? 'wtc_test' : 't20i_bilateral',
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
  }, [players, nations, coachProfile.nationalTeamId, nationalSquadIds]);

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
    const isInternational = finishedMatch.leagueId === 'wtc_test' || finishedMatch.leagueId === 't20i_bilateral' || finishedMatch.leagueId === 'intl';
    let userUpdatedStandingRank = 1;
    let userUpdatedNrr = 0.5;

    if (isInternational) {
      // Phase 12: Update ICC World Rankings & Bilateral Series Progress
      const winnerTeamName = (winnerId === finishedMatch.homeTeam.id ? finishedMatch.homeTeam.name : finishedMatch.awayTeam.name).toLowerCase();
      const loserTeamName = (loserId === finishedMatch.homeTeam.id ? finishedMatch.homeTeam.name : finishedMatch.awayTeam.name).toLowerCase();

      setNations(prevNations => {
        const updated = prevNations.map(n => {
          const isWin = n.name.toLowerCase() === winnerTeamName;
          const isLoss = n.name.toLowerCase() === loserTeamName;
          if (!isWin && !isLoss) return n;
          const delta = isWin ? 3 : -2;
          return {
            ...n,
            ratingT20: finishedMatch.format === 'T20' ? Math.max(150, n.ratingT20 + delta) : n.ratingT20,
            ratingODI: finishedMatch.format === 'ODI' ? Math.max(50, n.ratingODI + delta) : n.ratingODI,
            ratingTest: finishedMatch.format === 'TEST' ? Math.max(40, n.ratingTest + delta) : n.ratingTest
          };
        });

        const byT20 = [...updated].sort((a, b) => b.ratingT20 - a.ratingT20);
        const byODI = [...updated].sort((a, b) => b.ratingODI - a.ratingODI);
        const byTest = [...updated].sort((a, b) => b.ratingTest - a.ratingTest);

        return updated.map(n => {
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
      });

      const homeShort = finishedMatch.homeTeam.shortName;
      const awayShort = finishedMatch.awayTeam.shortName;
      const homeScore = inn1.battingTeamId === finishedMatch.homeTeam.id ? `${inn1.runs}/${inn1.wickets}` : `${inn2?.runs || 0}/${inn2?.wickets || 0}`;
      const awayScore = inn1.battingTeamId === finishedMatch.awayTeam.id ? `${inn1.runs}/${inn1.wickets}` : `${inn2?.runs || 0}/${inn2?.wickets || 0}`;
      const intlShortSummary = `${awayShort} ${awayScore} vs ${homeShort} ${homeScore} · ${finishedMatch.resultText || ''}`;

      setInternationalSeries(prevSeries => {
        if (finishedMatch.leagueId === 'wtc_test' || finishedMatch.format === 'TEST') {
          return {
            ...prevSeries,
            wtcTestCompleted: true,
            wtcTestSummary: intlShortSummary
          };
        }
        const nextIdx = prevSeries.matches.findIndex(m => !m.completed);
        if (nextIdx === -1) return prevSeries;
        const updatedMatches = prevSeries.matches.map((m, idx) =>
          idx === nextIdx ? { ...m, completed: true, summary: intlShortSummary } : m
        );
        return {
          ...prevSeries,
          seriesWins: prevSeries.seriesWins + (didUserWin ? 1 : 0),
          seriesLosses: prevSeries.seriesLosses + (didUserWin ? 0 : 1),
          matches: updatedMatches
        };
      });

      // Also mark matching Cricbuzz 2026 international tour fixture on the calendar as completed
      setLeagues(prevLeagues => prevLeagues.map(league => ({
        ...league,
        calendarDates: league.calendarDates.map(cd => {
          const matchesTeams = (homeId: string, awayId: string) =>
            (homeId.toLowerCase() === finishedMatch.homeTeam.name.toLowerCase() &&
              awayId.toLowerCase() === finishedMatch.awayTeam.name.toLowerCase()) ||
            (homeId.toLowerCase() === finishedMatch.awayTeam.name.toLowerCase() &&
              awayId.toLowerCase() === finishedMatch.homeTeam.name.toLowerCase());

          const updatedMatchFixture =
            cd.matchFixture &&
            cd.matchFixture.isInternational &&
            !cd.matchFixture.completed &&
            matchesTeams(cd.matchFixture.homeTeamId, cd.matchFixture.awayTeamId)
              ? { ...cd.matchFixture, completed: true, resultSummary: intlShortSummary }
              : cd.matchFixture;

          const updatedIntlMatches = cd.internationalMatches?.map(im =>
            !im.completed && matchesTeams(im.homeTeamId, im.awayTeamId)
              ? { ...im, completed: true, resultSummary: intlShortSummary }
              : im
          );

          return {
            ...cd,
            matchFixture: updatedMatchFixture,
            internationalMatches: updatedIntlMatches
          };
        })
      })));
    } else {
      setLeagues(prevLeagues => prevLeagues.map(league => {
        if (league.id !== finishedMatch.leagueId) return league;

        const shortScoreSummary = `${finishedMatch.homeTeam.shortName} ${inn1.battingTeamId === finishedMatch.homeTeam.id ? `${inn1.runs}/${inn1.wickets}` : `${inn2?.runs || 0}/${inn2?.wickets || 0}`} vs ${finishedMatch.awayTeam.shortName} ${inn1.battingTeamId === finishedMatch.awayTeam.id ? `${inn1.runs}/${inn1.wickets}` : `${inn2?.runs || 0}/${inn2?.wickets || 0}`} · ${finishedMatch.resultText || ''}`;

        // Playoff Bracket Stage Update
        if (finishedMatch.playoffStage) {
          const currentPlayoffs = league.playoffs || createInitialPlayoffs(league.standings);
          const stage = finishedMatch.playoffStage;
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

          return {
            ...league,
            playoffs: updatedPlayoffs
          };
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

        // Keep top-4 playoff seeds synced if playoffs haven't started yet
        const existingPlayoffs = league.playoffs || createInitialPlayoffs(updatedStandings);
        const syncedPlayoffs = (!existingPlayoffs.q1.completed && !existingPlayoffs.eliminator.completed)
          ? createInitialPlayoffs(updatedStandings)
          : existingPlayoffs;

        // Mark current calendar fixture completed if applicable and persist full completedMatchState
        const updatedCalendar = league.calendarDates.map((cd, idx) => {
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

  const resolvePlayoffStageTeams = useCallback((leagueId: string, stage: 'q1' | 'eliminator' | 'q2' | 'final') => {
    const league = leagues.find(l => l.id === leagueId) || leagues[0];
    const allTeamsPool = [...teams, ...(league.teams || [])];
    const playoffs = league.playoffs || createInitialPlayoffs(league.standings);

    let homeId = playoffs[stage].homeTeamId;
    let awayId = playoffs[stage].awayTeamId;

    if (stage === 'q1') {
      homeId = homeId || league.standings[0]?.teamId || null;
      awayId = awayId || league.standings[1]?.teamId || null;
    } else if (stage === 'eliminator') {
      homeId = homeId || league.standings[2]?.teamId || null;
      awayId = awayId || league.standings[3]?.teamId || null;
    } else if (stage === 'q2') {
      homeId = homeId || playoffs.q1.loserTeamId || null;
      awayId = awayId || playoffs.eliminator.winnerTeamId || null;
    } else if (stage === 'final') {
      homeId = homeId || playoffs.q1.winnerTeamId || null;
      awayId = awayId || playoffs.q2.winnerTeamId || null;
    }

    const homeTeamObj = allTeamsPool.find(t => t.id === homeId) || teams[0];
    const awayTeamObj = allTeamsPool.find(t => t.id === awayId) || teams[1];
    const format: 'T20' = 'T20';

    return { homeTeamObj, awayTeamObj, format };
  }, [leagues, teams]);

  const playPlayoffMatch = useCallback((leagueId: string, stage: 'q1' | 'eliminator' | 'q2' | 'final') => {
    const { homeTeamObj, awayTeamObj, format } = resolvePlayoffStageTeams(leagueId, stage);
    const newMatch = createFranchiseMatchState(homeTeamObj, awayTeamObj, leagueId, format, stage);
    setMatchLiveState(newMatch);
    setActiveTab('live_match');
    sound.playCrowdCheer(0.8);
  }, [resolvePlayoffStageTeams, createFranchiseMatchState]);

  const simPlayoffMatch = useCallback((leagueId: string, stage: 'q1' | 'eliminator' | 'q2' | 'final') => {
    const { homeTeamObj, awayTeamObj, format } = resolvePlayoffStageTeams(leagueId, stage);
    let curr = createFranchiseMatchState(homeTeamObj, awayTeamObj, leagueId, format, stage);
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
  }, [resolvePlayoffStageTeams, createFranchiseMatchState, simulateSingleDeliveryState, recordCompletedMatch]);

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
    if (!auctionLot) return;

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
    if (!auctionLot || userTeam.rtmCards <= 0) return;
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
