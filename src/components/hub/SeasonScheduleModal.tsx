import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Trophy,
  Star,
  Bookmark,
  Share2,
  X,
  Check
} from 'lucide-react';
import { Team, Player } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';
import { TeamLogo } from '../common/TeamLogo';
import { useGame } from '../../context/GameContext';

// ============================================================================
// TYPES FOR SEASON SCHEDULE, SCORECARDS, TOURS & TOURNAMENTS
// ============================================================================

export interface ScorecardBatterLine {
  name: string;
  dismissal: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  sr: string;
  isNotOut?: boolean;
  impactSubOut?: boolean; // Red arrow ->
  impactSubIn?: boolean;  // Green arrow ->
}

export interface ScorecardPartnershipLine {
  wicketNum: string; // e.g. "1st", "2nd"
  batter1Name: string;
  batter1Runs: number;
  batter2Name: string;
  batter2Runs: number;
  totalRuns: number;
  totalBalls: number;
  unbroken?: boolean;
}

export interface ScorecardBowlerLine {
  name: string;
  overs: string;
  maidens: number;
  runs: number;
  wickets: number;
  econ: string;
  impactSubIn?: boolean;
}

export interface ScorecardInningsData {
  teamShort: string;
  teamName: string;
  teamId?: string;
  flagEmoji?: string;
  totalRuns: number;
  wickets: number;
  overs: string;
  batters: ScorecardBatterLine[];
  didNotBat: { name: string; impactSubIn?: boolean }[];
  fallOfWickets: { score: string; batter: string; over: string }[];
  partnerships: ScorecardPartnershipLine[];
  bowlers: ScorecardBowlerLine[];
}

export interface ScheduleMatchItem {
  id: string;
  dateLabel: string; // e.g. "1 Apr", "24 Apr"
  matchLabel?: string; // e.g. "1st ODI", "ODI Group Stage", "1st T20I"
  homeShort: string;
  awayShort: string;
  homeFull: string;
  awayFull: string;
  homeFlag?: string;
  awayFlag?: string;
  completed: boolean;
  abandoned?: boolean;
  resultShort?: string; // e.g. "MUM 178/3 beat BLR 177/9 by ..."
  resultFull?: string;  // e.g. "MUM 178/3 beat BLR 177/9 by 7 wkts"
  winnerShort?: string;
  winnerFlag?: string;
  potm?: string;
  innings1?: ScorecardInningsData;
  innings2?: ScorecardInningsData;
}

export interface SeriesMostRunsRow {
  rank: number;
  name: string;
  flag: string;
  matches: number;
  innings: number;
  runs: number;
  avg: string;
  sr: string;
  hs: string;
}

export interface SeriesMostWicketsRow {
  rank: number;
  name: string;
  flag: string;
  matches: number;
  innings: number;
  wickets: number;
  avg: string;
  econ: string;
  bbi: string;
}

export interface TournamentGroupRow {
  rank: number;
  teamName: string;
  flag: string;
  qualifies: boolean;
  p: number;
  w: number;
  l: number;
  t: number;
  pts: number;
  nrr: string;
}

export interface IntlSeriesOrTournament {
  id: string;
  title: string;
  subtitle: string;
  formatLabel: string; // e.g. "ODI", "T20I", "Test"
  hostFlag: string;
  type: 'bilateral' | 'tournament';
  hasArrow: boolean;
  winnerBanner?: string; // e.g. "England", "Nepal"
  // Bilateral series fields
  hostName?: string;
  awayName?: string;
  awayFlag?: string;
  homeWins?: number;
  awayWins?: number;
  seriesStatusText?: string; // e.g. "ENGLAND WIN THE SERIES 3–0" or "3 T20I series · 0 of 3 played"
  seriesCompleted?: boolean;
  // Tournament fields
  knockouts?: {
    sf1Date: string;
    sf1Team1: string;
    sf1Team2: string;
    sf2Date: string;
    sf2Team1: string;
    sf2Team2: string;
    finalDate?: string;
    finalTeam1: string;
    finalTeam2: string;
  };
  groups?: {
    groupName: string;
    rows: TournamentGroupRow[];
  }[];
  mostRuns: SeriesMostRunsRow[];
  mostWickets: SeriesMostWicketsRow[];
  records?: { title: string; subtitle: string; value: string }[];
  matches: ScheduleMatchItem[];
}

// ============================================================================
// COUNTRY FLAG BADGE RENDERER
// ============================================================================

const NationFlagBadge: React.FC<{ flag?: string; country?: string; size?: 'sm' | 'md' | 'lg' }> = ({
  flag,
  country = '',
  size = 'sm'
}) => {
  const c = country.toLowerCase();
  const dim = size === 'lg' ? 'w-10 h-7 text-lg' : size === 'md' ? 'w-6 h-4.5 text-xs' : 'w-5 h-3.5 text-[11px]';

  if (c.includes('west indies') || flag === '🌴') {
    return (
      <span className={`${dim} rounded bg-[#581c3c] border border-amber-500/40 inline-flex items-center justify-center shrink-0`}>
        🌴
      </span>
    );
  }
  return (
    <span className={`${dim} rounded bg-slate-800/80 inline-flex items-center justify-center shrink-0 leading-none`}>
      {flag || '🏏'}
    </span>
  );
};

// ============================================================================
// DETERMINISTIC REALISTIC SCORECARD GENERATOR FOR COMPLETED MATCHES
// ============================================================================

const ROSTER_NAMES_BY_TEAM: Record<string, { batters: string[]; bowlers: string[]; fullName: string; teamId: string }> = {
  BLR: {
    fullName: 'BENGALURU',
    teamId: 'team_blr',
    batters: ['Kohli', 'Salt', 'Padikkal', 'Patidar', 'J. Sharma', 'V. Iyer', 'David', 'K. Pandya', 'B. Kumar', 'Duffy', 'Hazlewood', 'Dayal'],
    bowlers: ['B. Kumar', 'Hazlewood', 'Dayal', 'Duffy', 'K. Pandya', 'V. Iyer']
  },
  MUM: {
    fullName: 'MUMBAI',
    teamId: 'team_mum',
    batters: ['Rohit', 'Rickelton', 'Varma', 'Jacks', 'S. Yadav', 'H. Pandya', 'S. Thakur', 'Boult', 'D. Chahar', 'Bumrah', 'Ghazanfar'],
    bowlers: ['Bumrah', 'Boult', 'D. Chahar', 'H. Pandya', 'Ghazanfar', 'S. Thakur', 'Jacks']
  },
  KOL: {
    fullName: 'KOLKATA',
    teamId: 'team_kol',
    batters: ['Allen', 'Narine', 'Raghuvanshi', 'Rahane', 'Rinku', 'Ramandeep', 'A. Roy', 'H. Rana', 'Green', 'Pandey', 'Chakravarthy', 'Pathirana'],
    bowlers: ['H. Rana', 'Chakravarthy', 'Pathirana', 'Narine', 'Green', 'A. Roy']
  },
  CHE: {
    fullName: 'CHENNAI',
    teamId: 'team_che',
    batters: ['Short', 'Samson', 'Gaikwad', 'U. Patel', 'Dube', 'Mhatre', 'Sarfaraz', 'Veer', 'Hosein', 'R. Chahar', 'Ellis', 'Noor'],
    bowlers: ['Short', 'Veer', 'Hosein', 'R. Chahar', 'Ellis', 'Noor']
  },
  LKO: {
    fullName: 'LUCKNOW',
    teamId: 'team_lko',
    batters: ['Marsh', 'Pant', 'Pooran', 'Miller', 'Shahbaz', 'Bishnoi', 'Avesh', 'Digvesh', 'Ab. Samad', 'Mayank', 'Siddharth'],
    bowlers: ['Shahbaz', 'Bishnoi', 'Avesh', 'Digvesh', 'Mayank', 'Siddharth']
  },
  HYD: {
    fullName: 'HYDERABAD',
    teamId: 'team_hyd',
    batters: ['Head', 'Abhishek', 'Ishan', 'Klaasen', 'Nitish', 'Aniket', 'Cummins', 'Harshal', 'Shami', 'Zampa', 'Chahar'],
    bowlers: ['Cummins', 'Shami', 'Harshal', 'Zampa', 'Abhishek', 'Nitish']
  },
  DEL: {
    fullName: 'DELHI',
    teamId: 'team_del',
    batters: ['KL Rahul', 'Faf', 'Porel', 'Stubbs', 'Axar', 'Ashutosh', 'Vipraj', 'Starc', 'Kuldeep', 'Mukesh', 'Natarajan'],
    bowlers: ['Starc', 'Kuldeep', 'Axar', 'Natarajan', 'Mukesh', 'Vipraj']
  },
  RAJ: {
    fullName: 'RAJASTHAN',
    teamId: 'team_raj',
    batters: ['Jaiswal', 'V. Suryavanshi', 'Parag', 'Nitish Rana', 'Hetmyer', 'Jurel', 'Hasaranga', 'Archer', 'Theekshana', 'Sandeep', 'Deshpande'],
    bowlers: ['Archer', 'Sandeep', 'Hasaranga', 'Theekshana', 'Deshpande', 'Parag']
  },
  GUJ: {
    fullName: 'GUJARAT',
    teamId: 'team_guj',
    batters: ['Gill', 'Buttler', 'Sai Sudharsan', 'Rutherford', 'Tewatia', 'Shahrukh', 'Rashid', 'Rabada', 'Siraj', 'Prasidh', 'Sai Kishore'],
    bowlers: ['Rabada', 'Siraj', 'Rashid', 'Prasidh', 'Sai Kishore', 'Tewatia']
  },
  PUN: {
    fullName: 'PUNJAB',
    teamId: 'team_pun',
    batters: ['Prabhsimran', 'Priyansh', 'S. Iyer', 'Maxwell', 'Stoinis', 'Shashank', 'Nehal', 'Jansen', 'Brar', 'Arshdeep', 'Chahal'],
    bowlers: ['Arshdeep', 'Chahal', 'Jansen', 'Maxwell', 'Brar', 'Stoinis']
  }
};

function buildDetailedScorecard(
  matchId: string,
  firstBatShort: string,
  firstScore: number,
  firstWkts: number,
  firstOvers: string,
  secondBatShort: string,
  secondScore: number,
  secondWkts: number,
  secondOvers: string,
  potmName: string,
  customFlags?: { firstFlag?: string; secondFlag?: string; firstFull?: string; secondFull?: string }
): { innings1: ScorecardInningsData; innings2: ScorecardInningsData } {
  // Exact match templates from user's screenshots for MUM v BLR, MUM v KOL, CHE v LKO, ENG v BAN
  if (matchId === 'ipl_1') {
    // 1 Apr: BLR v MUM -> MUM 178/3 beat BLR 177/9 by 7 wkts (Screenshot 5 exact match!)
    return {
      innings1: {
        teamShort: 'BLR',
        teamName: 'BENGALURU',
        teamId: 'team_blr',
        totalRuns: 177,
        wickets: 9,
        overs: '20.0',
        batters: [
          { name: 'Kohli', dismissal: 'run out (Jacks)', runs: 57, balls: 39, fours: 8, sixes: 1, sr: '146.2', impactSubOut: true },
          { name: 'Salt', dismissal: 'c Jacks b Ghazanfar', runs: 59, balls: 33, fours: 6, sixes: 2, sr: '178.8' },
          { name: 'Padikkal', dismissal: 'c Rickelton b D. Chahar', runs: 0, balls: 1, fours: 0, sixes: 0, sr: '0.0' },
          { name: 'Patidar', dismissal: 'c Varma b S. Thakur', runs: 4, balls: 7, fours: 1, sixes: 0, sr: '57.1' },
          { name: 'J. Sharma', dismissal: 'c Boult b Bumrah', runs: 17, balls: 13, fours: 0, sixes: 1, sr: '130.8' },
          { name: 'V. Iyer', dismissal: 'run out (Boult)', runs: 5, balls: 9, fours: 0, sixes: 0, sr: '55.6' },
          { name: 'David', dismissal: 'lbw b Bumrah', runs: 10, balls: 4, fours: 1, sixes: 1, sr: '250.0' },
          { name: 'K. Pandya', dismissal: 'lbw b H. Pandya', runs: 8, balls: 3, fours: 0, sixes: 1, sr: '266.7' },
          { name: 'B. Kumar', dismissal: 'not out', runs: 6, balls: 6, fours: 0, sixes: 0, sr: '100.0', isNotOut: true },
          { name: 'Duffy', dismissal: 'b Bumrah', runs: 0, balls: 3, fours: 0, sixes: 0, sr: '0.0' },
          { name: 'Hazlewood', dismissal: 'not out', runs: 1, balls: 2, fours: 0, sixes: 0, sr: '50.0', isNotOut: true }
        ],
        didNotBat: [{ name: 'Dayal', impactSubIn: true }],
        fallOfWickets: [
          { score: '1-105', batter: 'Kohli', over: '10.5 ov' },
          { score: '2-105', batter: 'Padikkal', over: '11.0 ov' },
          { score: '3-113', batter: 'Patidar', over: '12.4 ov' },
          { score: '4-125', batter: 'Salt', over: '13.3 ov' },
          { score: '5-139', batter: 'V. Iyer', over: '15.4 ov' },
          { score: '6-156', batter: 'David', over: '17.0 ov' },
          { score: '7-167', batter: 'K. Pandya', over: '17.4 ov' },
          { score: '8-171', batter: 'J. Sharma', over: '18.3 ov' },
          { score: '9-171', batter: 'Duffy', over: '19.0 ov' }
        ],
        partnerships: [
          { wicketNum: '1st', batter1Name: 'Salt', batter1Runs: 45, batter2Name: 'Kohli', batter2Runs: 57, totalRuns: 105, totalBalls: 65 },
          { wicketNum: '2nd', batter1Name: 'Salt', batter1Runs: 0, batter2Name: 'Padikkal', batter2Runs: 0, totalRuns: 0, totalBalls: 1 },
          { wicketNum: '3rd', batter1Name: 'Salt', batter1Runs: 3, batter2Name: 'Patidar', batter2Runs: 4, totalRuns: 8, totalBalls: 10 },
          { wicketNum: '4th', batter1Name: 'J. Sharma', batter1Runs: 0, batter2Name: 'Salt', batter2Runs: 11, totalRuns: 12, totalBalls: 5 },
          { wicketNum: '5th', batter1Name: 'J. Sharma', batter1Runs: 9, batter2Name: 'V. Iyer', batter2Runs: 5, totalRuns: 14, totalBalls: 13 },
          { wicketNum: '6th', batter1Name: 'J. Sharma', batter1Runs: 5, batter2Name: 'David', batter2Runs: 10, totalRuns: 17, totalBalls: 8 },
          { wicketNum: '7th', batter1Name: 'J. Sharma', batter1Runs: 1, batter2Name: 'K. Pandya', batter2Runs: 8, totalRuns: 11, totalBalls: 4 },
          { wicketNum: '8th', batter1Name: 'B. Kumar', batter1Runs: 2, batter2Name: 'J. Sharma', batter2Runs: 2, totalRuns: 4, totalBalls: 5 },
          { wicketNum: '9th', batter1Name: 'B. Kumar', batter1Runs: 0, batter2Name: 'Duffy', batter2Runs: 0, totalRuns: 0, totalBalls: 3 },
          { wicketNum: '10th', batter1Name: 'Hazlewood', batter1Runs: 1, batter2Name: 'B. Kumar', batter2Runs: 4, totalRuns: 6, totalBalls: 6, unbroken: true }
        ],
        bowlers: [
          { name: 'Jacks', overs: '1', maidens: 0, runs: 14, wickets: 0, econ: '14.00' },
          { name: 'H. Pandya', overs: '4', maidens: 0, runs: 44, wickets: 1, econ: '11.00' },
          { name: 'S. Thakur', overs: '1', maidens: 0, runs: 8, wickets: 1, econ: '8.00' },
          { name: 'Boult', overs: '3', maidens: 0, runs: 22, wickets: 0, econ: '7.33' },
          { name: 'D. Chahar', overs: '3', maidens: 0, runs: 28, wickets: 1, econ: '9.33' },
          { name: 'Bumrah', overs: '4', maidens: 0, runs: 26, wickets: 3, econ: '6.50' },
          { name: 'Ghazanfar', overs: '4', maidens: 0, runs: 31, wickets: 1, econ: '7.75' }
        ]
      },
      innings2: {
        teamShort: 'MUM',
        teamName: 'MUMBAI',
        teamId: 'team_mum',
        totalRuns: 178,
        wickets: 3,
        overs: '17.3',
        batters: [
          { name: 'Rohit', dismissal: 'c Dayal b Hazlewood', runs: 2, balls: 4, fours: 0, sixes: 0, sr: '50.0' },
          { name: 'Rickelton', dismissal: 'c Padikkal b Duffy', runs: 46, balls: 29, fours: 7, sixes: 1, sr: '158.6' },
          { name: 'Varma', dismissal: 'run out (J. Sharma)', runs: 0, balls: 2, fours: 0, sixes: 0, sr: '0.0' },
          { name: 'Jacks', dismissal: 'not out', runs: 103, balls: 52, fours: 10, sixes: 6, sr: '198.1', isNotOut: true },
          { name: 'S. Yadav', dismissal: 'not out', runs: 22, balls: 12, fours: 3, sixes: 1, sr: '183.3', isNotOut: true }
        ],
        didNotBat: [
          { name: 'H. Pandya' },
          { name: 'S. Thakur' },
          { name: 'Boult' },
          { name: 'D. Chahar' },
          { name: 'Bumrah' },
          { name: 'Ghazanfar' }
        ],
        fallOfWickets: [
          { score: '1-3', batter: 'Rohit', over: '1.1 ov' },
          { score: '2-3', batter: 'Varma', over: '1.3 ov' },
          { score: '3-112', batter: 'Rickelton', over: '11.0 ov' }
        ],
        partnerships: [
          { wicketNum: '1st', batter1Name: 'Rickelton', batter1Runs: 1, batter2Name: 'Rohit', batter2Runs: 2, totalRuns: 3, totalBalls: 7 },
          { wicketNum: '2nd', batter1Name: 'Rickelton', batter1Runs: 0, batter2Name: 'Varma', batter2Runs: 0, totalRuns: 0, totalBalls: 2 },
          { wicketNum: '3rd', batter1Name: 'Jacks', batter1Runs: 61, batter2Name: 'Rickelton', batter2Runs: 45, totalRuns: 109, totalBalls: 57 },
          { wicketNum: '4th', batter1Name: 'S. Yadav', batter1Runs: 22, batter2Name: 'Jacks', batter2Runs: 42, totalRuns: 66, totalBalls: 33, unbroken: true }
        ],
        bowlers: [
          { name: 'K. Pandya', overs: '4', maidens: 0, runs: 40, wickets: 0, econ: '10.00' },
          { name: 'B. Kumar', overs: '3', maidens: 0, runs: 20, wickets: 0, econ: '6.67' },
          { name: 'Duffy', overs: '4', maidens: 1, runs: 40, wickets: 1, econ: '10.00' },
          { name: 'Hazlewood', overs: '2', maidens: 0, runs: 18, wickets: 1, econ: '9.00' },
          { name: 'Dayal', overs: '3.3', maidens: 0, runs: 58, wickets: 0, econ: '16.57', impactSubIn: true }
        ]
      }
    };
  }

  if (matchId === 'ipl_28') {
    // 24 Apr: MUM v KOL -> MUM 95/0 beat KOL 92/8 by 10 wkts (Video 00:08 exact match!)
    return {
      innings1: {
        teamShort: 'KOL',
        teamName: 'KOLKATA',
        teamId: 'team_kol',
        totalRuns: 92,
        wickets: 8,
        overs: '20.0',
        batters: [
          { name: 'Allen', dismissal: 'b Boult', runs: 1, balls: 4, fours: 0, sixes: 0, sr: '25.0', impactSubOut: true },
          { name: 'Narine', dismissal: 'b Bumrah', runs: 0, balls: 1, fours: 0, sixes: 0, sr: '0.0' },
          { name: 'Raghuvanshi', dismissal: 'c Varma b Bumrah', runs: 20, balls: 25, fours: 3, sixes: 0, sr: '80.0' },
          { name: 'Rahane', dismissal: 'c Varma b Bumrah', runs: 12, balls: 16, fours: 2, sixes: 0, sr: '75.0' },
          { name: 'Rinku', dismissal: 'c Varma b H. Pandya', runs: 6, balls: 4, fours: 1, sixes: 0, sr: '150.0' },
          { name: 'Ramandeep', dismissal: 'c D. Chahar b H. Pandya', runs: 11, balls: 7, fours: 1, sixes: 0, sr: '157.1' },
          { name: 'A. Roy', dismissal: 'c S. Yadav b H. Pandya', runs: 22, balls: 19, fours: 1, sixes: 1, sr: '115.8' },
          { name: 'H. Rana', dismissal: 'not out', runs: 2, balls: 3, fours: 0, sixes: 0, sr: '66.7', isNotOut: true },
          { name: 'Green', dismissal: 'lbw b Boult', runs: 8, balls: 6, fours: 0, sixes: 1, sr: '133.3' },
          { name: 'Pandey', dismissal: 'not out', runs: 5, balls: 4, fours: 0, sixes: 0, sr: '125.0', isNotOut: true, impactSubIn: true }
        ],
        didNotBat: [{ name: 'Chakravarthy' }, { name: 'Pathirana' }],
        fallOfWickets: [
          { score: '1-2', batter: 'Narine', over: '1.2 ov' },
          { score: '2-3', batter: 'Allen', over: '1.2 ov' },
          { score: '3-15', batter: 'Green', over: '3.1 ov' },
          { score: '4-47', batter: 'Raghuvanshi', over: '7.5 ov' },
          { score: '5-68', batter: 'Rahane', over: '11.4 ov' },
          { score: '6-72', batter: 'A. Roy', over: '12.5 ov' },
          { score: '7-75', batter: 'Rinku', over: '13.2 ov' },
          { score: '8-88', batter: 'Ramandeep', over: '14.1 ov' }
        ],
        partnerships: [
          { wicketNum: '1st', batter1Name: 'Allen', batter1Runs: 1, batter2Name: 'Narine', batter2Runs: 0, totalRuns: 2, totalBalls: 8 },
          { wicketNum: '2nd', batter1Name: 'Green', batter1Runs: 2, batter2Name: 'Allen', batter2Runs: 0, totalRuns: 2, totalBalls: 1 },
          { wicketNum: '3rd', batter1Name: 'Raghuvanshi', batter1Runs: 6, batter2Name: 'Green', batter2Runs: 6, totalRuns: 12, totalBalls: 12 },
          { wicketNum: '4th', batter1Name: 'Raghuvanshi', batter1Runs: 14, batter2Name: 'Rahane', batter2Runs: 12, totalRuns: 31, totalBalls: 28 }
        ],
        bowlers: [
          { name: 'Boult', overs: '4', maidens: 0, runs: 18, wickets: 2, econ: '4.50' },
          { name: 'Bumrah', overs: '4', maidens: 1, runs: 14, wickets: 3, econ: '3.50' },
          { name: 'H. Pandya', overs: '4', maidens: 0, runs: 24, wickets: 3, econ: '6.00' },
          { name: 'D. Chahar', overs: '4', maidens: 0, runs: 19, wickets: 0, econ: '4.75' },
          { name: 'Ghazanfar', overs: '4', maidens: 0, runs: 17, wickets: 0, econ: '4.25' }
        ]
      },
      innings2: {
        teamShort: 'MUM',
        teamName: 'MUMBAI',
        teamId: 'team_mum',
        totalRuns: 95,
        wickets: 0,
        overs: '9.4',
        batters: [
          { name: 'Rohit', dismissal: 'not out', runs: 54, balls: 31, fours: 6, sixes: 3, sr: '174.2', isNotOut: true },
          { name: 'Rickelton', dismissal: 'not out', runs: 39, balls: 27, fours: 5, sixes: 1, sr: '144.4', isNotOut: true }
        ],
        didNotBat: [
          { name: 'Varma' }, { name: 'Jacks' }, { name: 'S. Yadav' }, { name: 'H. Pandya' },
          { name: 'S. Thakur' }, { name: 'Boult' }, { name: 'D. Chahar' }, { name: 'Bumrah' }, { name: 'Ghazanfar' }
        ],
        fallOfWickets: [],
        partnerships: [
          { wicketNum: '1st', batter1Name: 'Rohit', batter1Runs: 54, batter2Name: 'Rickelton', batter2Runs: 39, totalRuns: 95, totalBalls: 58, unbroken: true }
        ],
        bowlers: [
          { name: 'H. Rana', overs: '3', maidens: 0, runs: 28, wickets: 0, econ: '9.33' },
          { name: 'Chakravarthy', overs: '3', maidens: 0, runs: 32, wickets: 0, econ: '10.67' },
          { name: 'Pathirana', overs: '2', maidens: 0, runs: 21, wickets: 0, econ: '10.50' },
          { name: 'Narine', overs: '1.4', maidens: 0, runs: 14, wickets: 0, econ: '8.40' }
        ]
      }
    };
  }

  if (matchId === 'ipl_32') {
    // 26 Apr: CHE v LKO -> CHE 164/5 beat LKO 161/8 by 5 wkts (Video 00:10-00:13 exact match!)
    return {
      innings1: {
        teamShort: 'LKO',
        teamName: 'LUCKNOW',
        teamId: 'team_lko',
        totalRuns: 161,
        wickets: 8,
        overs: '20.0',
        batters: [
          { name: 'Marsh', dismissal: 'c Short b Ellis', runs: 1, balls: 2, fours: 0, sixes: 0, sr: '50.0' },
          { name: 'Pant', dismissal: 'c Samson b Hosein', runs: 32, balls: 38, fours: 3, sixes: 1, sr: '84.2' },
          { name: 'Pooran', dismissal: 'c U. Patel b Veer', runs: 1, balls: 1, fours: 0, sixes: 0, sr: '100.0' },
          { name: 'Miller', dismissal: 'c Veer b Short', runs: 18, balls: 9, fours: 1, sixes: 1, sr: '200.0' },
          { name: 'Shahbaz', dismissal: 'not out', runs: 59, balls: 22, fours: 6, sixes: 4, sr: '268.2', isNotOut: true },
          { name: 'Bishnoi', dismissal: 'c U. Patel b Ellis', runs: 0, balls: 1, fours: 0, sixes: 0, sr: '0.0' },
          { name: 'Avesh', dismissal: 'c Hosein b Noor', runs: 4, balls: 6, fours: 0, sixes: 0, sr: '66.7' },
          { name: 'Digvesh', dismissal: 'not out', runs: 2, balls: 2, fours: 0, sixes: 0, sr: '100.0', isNotOut: true },
          { name: 'Ab. Samad', dismissal: 'c Dube b R. Chahar', runs: 3, balls: 10, fours: 0, sixes: 0, sr: '30.0' }
        ],
        didNotBat: [{ name: 'Mayank' }, { name: 'Siddharth', impactSubIn: true }],
        fallOfWickets: [
          { score: '1-1', batter: 'Marsh', over: '1.0 ov' },
          { score: '2-59', batter: 'Pant', over: '10.1 ov' },
          { score: '3-75', batter: 'Markram', over: '12.3 ov' },
          { score: '4-75', batter: 'Pooran', over: '13.0 ov' },
          { score: '5-76', batter: 'Ab. Samad', over: '13.3 ov' },
          { score: '6-92', batter: 'Miller', over: '15.2 ov' },
          { score: '7-93', batter: 'Bishnoi', over: '15.3 ov' },
          { score: '8-151', batter: 'Avesh', over: '19.1 ov' }
        ],
        partnerships: [
          { wicketNum: '1st', batter1Name: 'Markram', batter1Runs: 1, batter2Name: 'Marsh', batter2Runs: 0, totalRuns: 2, totalBalls: 5 },
          { wicketNum: '2nd', batter1Name: 'Markram', batter1Runs: 21, batter2Name: 'Pant', batter2Runs: 32, totalRuns: 58, totalBalls: 59 },
          { wicketNum: '3rd', batter1Name: 'Ab. Samad', batter1Runs: 2, batter2Name: 'Markram', batter2Runs: 14, totalRuns: 16, totalBalls: 14 },
          { wicketNum: '4th', batter1Name: 'Ab. Samad', batter1Runs: 0, batter2Name: 'Pooran', batter2Runs: 1, totalRuns: 1, totalBalls: 1 },
          { wicketNum: '5th', batter1Name: 'Miller', batter1Runs: 1, batter2Name: 'Ab. Samad', batter2Runs: 1, totalRuns: 2, totalBalls: 5 },
          { wicketNum: '6th', batter1Name: 'Shahbaz', batter1Runs: 4, batter2Name: 'Miller', batter2Runs: 17, totalRuns: 21, totalBalls: 11 },
          { wicketNum: '7th', batter1Name: 'Shahbaz', batter1Runs: 0, batter2Name: 'Bishnoi', batter2Runs: 0, totalRuns: 0, totalBalls: 1 },
          { wicketNum: '8th', batter1Name: 'Shahbaz', batter1Runs: 50, batter2Name: 'Avesh', batter2Runs: 4, totalRuns: 56, totalBalls: 22 },
          { wicketNum: '9th', batter1Name: 'Shahbaz', batter1Runs: 5, batter2Name: 'Digvesh', batter2Runs: 2, totalRuns: 7, totalBalls: 5, unbroken: true }
        ],
        bowlers: [
          { name: 'Short', overs: '1', maidens: 0, runs: 6, wickets: 2, econ: '6.00' },
          { name: 'Veer', overs: '3', maidens: 0, runs: 50, wickets: 2, econ: '16.67' },
          { name: 'Hosein', overs: '4', maidens: 0, runs: 26, wickets: 1, econ: '6.50' },
          { name: 'R. Chahar', overs: '4', maidens: 0, runs: 22, wickets: 1, econ: '5.50' },
          { name: 'Ellis', overs: '4', maidens: 0, runs: 32, wickets: 1, econ: '8.00' },
          { name: 'Noor', overs: '4', maidens: 0, runs: 20, wickets: 1, econ: '5.00', impactSubIn: true }
        ]
      },
      innings2: {
        teamShort: 'CHE',
        teamName: 'CHENNAI',
        teamId: 'team_che',
        totalRuns: 164,
        wickets: 5,
        overs: '19.0',
        batters: [
          { name: 'Short', dismissal: 'c Marsh b Avesh', runs: 20, balls: 11, fours: 4, sixes: 0, sr: '181.8' },
          { name: 'Samson', dismissal: 'run out (Pooran)', runs: 0, balls: 6, fours: 0, sixes: 0, sr: '0.0' },
          { name: 'Gaikwad', dismissal: 'c Pant b Avesh', runs: 4, balls: 3, fours: 1, sixes: 0, sr: '133.3' },
          { name: 'U. Patel', dismissal: 'b Shahbaz', runs: 37, balls: 30, fours: 4, sixes: 0, sr: '123.3' },
          { name: 'Dube', dismissal: 'c Miller b Shahbaz', runs: 0, balls: 1, fours: 0, sixes: 0, sr: '0.0' },
          { name: 'Mhatre', dismissal: 'not out', runs: 29, balls: 23, fours: 2, sixes: 2, sr: '126.1', isNotOut: true },
          { name: 'Sarfaraz', dismissal: 'not out', runs: 59, balls: 45, fours: 6, sixes: 3, sr: '153.3', isNotOut: true }
        ],
        didNotBat: [{ name: 'Veer' }, { name: 'Hosein' }, { name: 'R. Chahar' }, { name: 'Ellis' }, { name: 'Noor', impactSubIn: true }],
        fallOfWickets: [
          { score: '1-10', batter: 'Samson', over: '1.5 ov' },
          { score: '2-27', batter: 'Short', over: '3.1 ov' },
          { score: '3-31', batter: 'Gaikwad', over: '3.4 ov' },
          { score: '4-102', batter: 'U. Patel', over: '12.5 ov' },
          { score: '5-102', batter: 'Dube', over: '13.0 ov' }
        ],
        partnerships: [
          { wicketNum: '1st', batter1Name: 'Short', batter1Runs: 10, batter2Name: 'Samson', batter2Runs: 0, totalRuns: 10, totalBalls: 11 },
          { wicketNum: '2nd', batter1Name: 'Sarfaraz', batter1Runs: 7, batter2Name: 'Short', batter2Runs: 10, totalRuns: 17, totalBalls: 9 },
          { wicketNum: '3rd', batter1Name: 'Sarfaraz', batter1Runs: 0, batter2Name: 'Gaikwad', batter2Runs: 4, totalRuns: 4, totalBalls: 3 },
          { wicketNum: '4th', batter1Name: 'Sarfaraz', batter1Runs: 30, batter2Name: 'U. Patel', batter2Runs: 37, totalRuns: 71, totalBalls: 55 },
          { wicketNum: '5th', batter1Name: 'Sarfaraz', batter1Runs: 0, batter2Name: 'Dube', batter2Runs: 0, totalRuns: 0, totalBalls: 1 },
          { wicketNum: '6th', batter1Name: 'Mhatre', batter1Runs: 29, batter2Name: 'Sarfaraz', batter2Runs: 32, totalRuns: 62, totalBalls: 41, unbroken: true }
        ],
        bowlers: [
          { name: 'Shahbaz', overs: '3', maidens: 0, runs: 26, wickets: 2, econ: '8.67' },
          { name: 'Bishnoi', overs: '4', maidens: 0, runs: 27, wickets: 0, econ: '6.75' },
          { name: 'Avesh', overs: '3.5', maidens: 0, runs: 33, wickets: 2, econ: '8.61' },
          { name: 'Digvesh', overs: '4', maidens: 0, runs: 34, wickets: 0, econ: '8.50' },
          { name: 'Mayank', overs: '2', maidens: 0, runs: 20, wickets: 0, econ: '10.00' },
          { name: 'Siddharth', overs: '3', maidens: 0, runs: 24, wickets: 0, econ: '8.00', impactSubIn: true }
        ]
      }
    };
  }

  if (matchId === 'ban_eng_1') {
    // 6 Apr: 1st ODI Bangladesh v England -> ENG 113/1 beat BAN 112/10 by 9 wkts (Video 00:20-00:22 exact match!)
    return {
      innings1: {
        teamShort: 'BAN',
        teamName: 'BANGLADESH',
        flagEmoji: '🇧🇩',
        totalRuns: 112,
        wickets: 10,
        overs: '28.1',
        batters: [
          { name: 'Litton', dismissal: 'lbw b Archer', runs: 1, balls: 7, fours: 0, sixes: 0, sr: '14.3' },
          { name: 'Hridoy', dismissal: 'lbw b Archer', runs: 1, balls: 5, fours: 0, sixes: 0, sr: '20.0' },
          { name: 'Miraz', dismissal: 'c S. Curran b R. Ahmed', runs: 41, balls: 68, fours: 4, sixes: 0, sr: '60.3' },
          { name: 'Shakib', dismissal: 'b Archer', runs: 6, balls: 5, fours: 1, sixes: 0, sr: '120.0' },
          { name: 'Mahedi', dismissal: 'b S. Curran', runs: 1, balls: 3, fours: 0, sixes: 0, sr: '33.3' },
          { name: 'Rishad', dismissal: 'b Dawson', runs: 4, balls: 6, fours: 0, sixes: 0, sr: '66.7' },
          { name: 'Nasum', dismissal: 'c Livingstone b A. Rashid', runs: 1, balls: 5, fours: 0, sixes: 0, sr: '20.0' },
          { name: 'Taskin', dismissal: 'c Dawson b A. Rashid', runs: 21, balls: 31, fours: 0, sixes: 0, sr: '67.7' },
          { name: 'Taijul', dismissal: 'c Dawson b R. Ahmed', runs: 0, balls: 1, fours: 0, sixes: 0, sr: '0.0' },
          { name: 'Tanvir', dismissal: 'not out', runs: 23, balls: 33, fours: 0, sixes: 0, sr: '69.7', isNotOut: true },
          { name: 'Mustafizur', dismissal: 'c Archer b A. Rashid', runs: 3, balls: 5, fours: 0, sixes: 0, sr: '60.0' }
        ],
        didNotBat: [],
        fallOfWickets: [
          { score: '1-7', batter: 'Litton', over: '1.4 ov' },
          { score: '2-9', batter: 'Hridoy', over: '2.5 ov' },
          { score: '3-17', batter: 'Shakib', over: '4.2 ov' },
          { score: '4-19', batter: 'Mahedi', over: '5.0 ov' },
          { score: '5-34', batter: 'Rishad', over: '8.0 ov' },
          { score: '6-40', batter: 'Nasum', over: '11.2 ov' },
          { score: '7-78', batter: 'Miraz', over: '19.2 ov' },
          { score: '8-78', batter: 'Taijul', over: '19.4 ov' },
          { score: '9-104', batter: 'Taskin', over: '26.2 ov' },
          { score: '10-112', batter: 'Mustafizur', over: '28.1 ov' }
        ],
        partnerships: [
          { wicketNum: '1st', batter1Name: 'Hridoy', batter1Runs: 6, batter2Name: 'Litton', batter2Runs: 1, totalRuns: 7, totalBalls: 10 },
          { wicketNum: '2nd', batter1Name: 'Miraz', batter1Runs: 2, batter2Name: 'Hridoy', batter2Runs: 0, totalRuns: 2, totalBalls: 7 },
          { wicketNum: '7th', batter1Name: 'Miraz', batter1Runs: 22, batter2Name: 'Taskin', batter2Runs: 14, totalRuns: 38, totalBalls: 48 },
          { wicketNum: '9th', batter1Name: 'Tanvir', batter1Runs: 18, batter2Name: 'Taskin', batter2Runs: 7, totalRuns: 26, totalBalls: 40 },
          { wicketNum: '10th', batter1Name: 'Tanvir', batter1Runs: 5, batter2Name: 'Mustafizur', batter2Runs: 3, totalRuns: 8, totalBalls: 11 }
        ],
        bowlers: [
          { name: 'Jacks', overs: '3', maidens: 0, runs: 16, wickets: 0, econ: '5.33' },
          { name: 'R. Ahmed', overs: '4', maidens: 0, runs: 14, wickets: 2, econ: '3.50' },
          { name: 'S. Curran', overs: '4', maidens: 1, runs: 14, wickets: 1, econ: '3.50' },
          { name: 'Dawson', overs: '3', maidens: 0, runs: 15, wickets: 1, econ: '5.00' },
          { name: 'Archer', overs: '7', maidens: 1, runs: 17, wickets: 3, econ: '2.43' },
          { name: 'A. Rashid', overs: '7.1', maidens: 0, runs: 32, wickets: 3, econ: '4.47' }
        ]
      },
      innings2: {
        teamShort: 'ENG',
        teamName: 'ENGLAND',
        flagEmoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        totalRuns: 113,
        wickets: 1,
        overs: '16.5',
        batters: [
          { name: 'Salt', dismissal: 'not out', runs: 76, balls: 62, fours: 10, sixes: 1, sr: '122.6', isNotOut: true },
          { name: 'Buttler', dismissal: 'b Shakib', runs: 31, balls: 40, fours: 3, sixes: 0, sr: '77.5' },
          { name: 'Bethell', dismissal: 'not out', runs: 5, balls: 7, fours: 0, sixes: 0, sr: '71.4', isNotOut: true }
        ],
        didNotBat: [
          { name: 'Brook' }, { name: 'Jacks' }, { name: 'Livingstone' },
          { name: 'R. Ahmed' }, { name: 'S. Curran' }, { name: 'Dawson' }, { name: 'Archer' }, { name: 'A. Rashid' }
        ],
        fallOfWickets: [
          { score: '1-97', batter: 'Buttler', over: '15.3 ov' }
        ],
        partnerships: [
          { wicketNum: '1st', batter1Name: 'Salt', batter1Runs: 65, batter2Name: 'Buttler', batter2Runs: 31, totalRuns: 97, totalBalls: 93 },
          { wicketNum: '2nd', batter1Name: 'Bethell', batter1Runs: 5, batter2Name: 'Salt', batter2Runs: 11, totalRuns: 16, totalBalls: 15, unbroken: true }
        ],
        bowlers: [
          { name: 'Miraz', overs: '2', maidens: 0, runs: 7, wickets: 0, econ: '3.50' },
          { name: 'Shakib', overs: '5', maidens: 0, runs: 26, wickets: 1, econ: '5.20' },
          { name: 'Rishad', overs: '2', maidens: 0, runs: 18, wickets: 0, econ: '9.00' },
          { name: 'Nasum', overs: '3', maidens: 0, runs: 26, wickets: 0, econ: '8.67' },
          { name: 'Taijul', overs: '3', maidens: 0, runs: 20, wickets: 0, econ: '6.67' },
          { name: 'Tanvir', overs: '1.5', maidens: 0, runs: 16, wickets: 0, econ: '8.73' }
        ]
      }
    };
  }

  // Generic deterministic generator for all other completed matches
  const t1Info = ROSTER_NAMES_BY_TEAM[firstBatShort] || {
    fullName: customFlags?.firstFull || firstBatShort,
    teamId: undefined,
    batters: ['Opener 1', 'Opener 2', 'No. 3', 'Captain', 'Middle 5', 'Allrounder 6', 'Keeper 7', 'Bowler 8', 'Bowler 9', 'Bowler 10', 'Bowler 11'],
    bowlers: ['Bowler 8', 'Bowler 9', 'Bowler 10', 'Bowler 11', 'Allrounder 6']
  };
  const t2Info = ROSTER_NAMES_BY_TEAM[secondBatShort] || {
    fullName: customFlags?.secondFull || secondBatShort,
    teamId: undefined,
    batters: ['Opener A', 'Opener B', 'Star Batter', 'Middle D', 'Finisher E', 'Allrounder F', 'Keeper G', 'Pacer H', 'Pacer I', 'Spinner J', 'Spinner K'],
    bowlers: ['Pacer H', 'Pacer I', 'Spinner J', 'Spinner K', 'Allrounder F']
  };

  const makeInnings = (
    short: string,
    info: typeof t1Info,
    oppBowlers: string[],
    runs: number,
    wkts: number,
    overs: string,
    flag?: string
  ): ScorecardInningsData => {
    const numBatters = Math.min(11, Math.max(2, wkts + 2));
    const battersList: ScorecardBatterLine[] = [];
    let remRuns = Math.max(0, runs - 6);

    for (let i = 0; i < numBatters; i++) {
      const bName = info.batters[i] || `Player ${i + 1}`;
      const isLastTwo = i >= wkts;
      const share = i === 0 ? 0.34 : i === 1 ? 0.26 : i === 2 ? 0.18 : 1 / Math.max(1, numBatters - 2);
      const bRuns = i === numBatters - 1 ? Math.max(1, remRuns) : Math.max(0, Math.round(remRuns * share));
      remRuns = Math.max(0, remRuns - bRuns);
      const bBalls = Math.max(1, Math.round(bRuns / 1.48) + (bRuns === 0 ? 2 : 0));
      const fours = Math.floor(bRuns / 11);
      const sixes = Math.floor(bRuns / 24);
      const sr = ((bRuns / bBalls) * 100).toFixed(1);
      const bowlerName = oppBowlers[i % oppBowlers.length] || 'Bowler';
      const catcherName = oppBowlers[(i + 2) % oppBowlers.length] || 'Fielder';

      battersList.push({
        name: bName,
        dismissal: isLastTwo ? 'not out' : i % 3 === 0 ? `c ${catcherName} b ${bowlerName}` : i % 3 === 1 ? `b ${bowlerName}` : `lbw b ${bowlerName}`,
        runs: bRuns,
        balls: bBalls,
        fours,
        sixes,
        sr,
        isNotOut: isLastTwo
      });
    }

    const didNotBat = info.batters.slice(numBatters).map(name => ({ name }));
    const fow = [];
    let runningScore = 0;
    for (let w = 0; w < Math.min(wkts, battersList.length); w++) {
      runningScore += battersList[w].runs + 4;
      fow.push({
        score: `${w + 1}-${Math.min(runs, runningScore)}`,
        batter: battersList[w].name,
        over: `${Math.min(19, (w + 1) * 2)}.${(w * 2 + 1) % 6} ov`
      });
    }

    const partnerships: ScorecardPartnershipLine[] = [
      {
        wicketNum: '1st',
        batter1Name: battersList[0]?.name || 'Batter 1',
        batter1Runs: battersList[0]?.runs || 24,
        batter2Name: battersList[1]?.name || 'Batter 2',
        batter2Runs: Math.min(battersList[1]?.runs || 18, 22),
        totalRuns: (battersList[0]?.runs || 24) + Math.min(battersList[1]?.runs || 18, 22),
        totalBalls: 32
      },
      {
        wicketNum: '2nd',
        batter1Name: battersList[1]?.name || 'Batter 2',
        batter1Runs: Math.max(4, (battersList[1]?.runs || 18) - 10),
        batter2Name: battersList[2]?.name || 'Batter 3',
        batter2Runs: battersList[2]?.runs || 28,
        totalRuns: Math.max(12, (battersList[2]?.runs || 28) + 14),
        totalBalls: 26
      }
    ];

    const bowlersList: ScorecardBowlerLine[] = oppBowlers.slice(0, 5).map((bName, idx) => {
      const bWkts = idx === 0 ? Math.min(3, Math.ceil(wkts * 0.4)) : idx === 1 ? Math.floor(wkts * 0.3) : idx === 2 ? Math.max(0, wkts - Math.ceil(wkts * 0.4) - Math.floor(wkts * 0.3)) : 0;
      const bRuns = Math.max(16, Math.round(runs / 5) + (idx % 2 === 0 ? -3 : 4));
      return {
        name: bName,
        overs: '4',
        maidens: idx === 0 && bRuns < 24 ? 1 : 0,
        runs: bRuns,
        wickets: bWkts,
        econ: (bRuns / 4).toFixed(2)
      };
    });

    return {
      teamShort: short,
      teamName: info.fullName,
      teamId: info.teamId,
      flagEmoji: flag,
      totalRuns: runs,
      wickets: wkts,
      overs,
      batters: battersList,
      didNotBat,
      fallOfWickets: fow,
      partnerships,
      bowlers: bowlersList
    };
  };

  return {
    innings1: makeInnings(firstBatShort, t1Info, t2Info.bowlers, firstScore, firstWkts, firstOvers, customFlags?.firstFlag),
    innings2: makeInnings(secondBatShort, t2Info, t1Info.bowlers, secondScore, secondWkts, secondOvers, customFlags?.secondFlag)
  };
}

// ============================================================================
// EXACT 74 IPL 2026 SEASON SCHEDULE FIXTURES (MATCHING SCREENSHOT 2 & VIDEO)
// ============================================================================

interface RawLeagueFixture {
  id: string;
  date: string;
  home: string;
  away: string;
  abandoned?: boolean;
  upcoming?: boolean;
  firstBat: string;
  firstRuns: number;
  firstWkts: number;
  secondBat: string;
  secondRuns: number;
  secondWkts: number;
  margin: string;
  potm: string;
}

const IPL_2026_RAW_FIXTURES: RawLeagueFixture[] = [
  { id: 'ipl_1', date: '1 Apr', home: 'BLR', away: 'MUM', firstBat: 'BLR', firstRuns: 177, firstWkts: 9, secondBat: 'MUM', secondRuns: 178, secondWkts: 3, margin: 'by 7 wkts', potm: 'Jacks' },
  { id: 'ipl_2', date: '2 Apr', home: 'HYD', away: 'CHE', firstBat: 'HYD', firstRuns: 186, firstWkts: 9, secondBat: 'CHE', secondRuns: 184, secondWkts: 8, margin: 'by 2 runs', potm: 'Klaasen' },
  { id: 'ipl_3', date: '3 Apr', home: 'DEL', away: 'LKO', firstBat: 'LKO', firstRuns: 192, firstWkts: 5, secondBat: 'DEL', secondRuns: 172, secondWkts: 10, margin: 'by 20 runs', potm: 'Pooran' },
  { id: 'ipl_4', date: '4 Apr', home: 'KOL', away: 'PUN', firstBat: 'PUN', firstRuns: 196, firstWkts: 7, secondBat: 'KOL', secondRuns: 109, secondWkts: 10, margin: 'by 87 runs', potm: 'S. Iyer' },
  { id: 'ipl_5', date: '4 Apr', home: 'RAJ', away: 'GUJ', firstBat: 'GUJ', firstRuns: 162, firstWkts: 8, secondBat: 'RAJ', secondRuns: 163, secondWkts: 7, margin: 'by 3 wkts', potm: 'Jaiswal' },
  { id: 'ipl_6', date: '5 Apr', home: 'MUM', away: 'BLR', firstBat: 'BLR', firstRuns: 160, firstWkts: 7, secondBat: 'MUM', secondRuns: 163, secondWkts: 3, margin: 'by 7 wkts', potm: 'S. Yadav' },
  { id: 'ipl_7', date: '5 Apr', home: 'DEL', away: 'CHE', firstBat: 'DEL', firstRuns: 159, firstWkts: 5, secondBat: 'CHE', secondRuns: 160, secondWkts: 6, margin: 'by 4 wkts', potm: 'Gaikwad' },
  { id: 'ipl_8', date: '6 Apr', home: 'HYD', away: 'PUN', firstBat: 'PUN', firstRuns: 234, firstWkts: 3, secondBat: 'HYD', secondRuns: 205, secondWkts: 9, margin: 'by 29 runs', potm: 'Prabhsimran' },
  { id: 'ipl_9', date: '7 Apr', home: 'LKO', away: 'RAJ', firstBat: 'RAJ', firstRuns: 167, firstWkts: 9, secondBat: 'LKO', secondRuns: 156, secondWkts: 9, margin: 'by 11 runs', potm: 'Archer' },
  { id: 'ipl_10', date: '8 Apr', home: 'GUJ', away: 'KOL', firstBat: 'GUJ', firstRuns: 164, firstWkts: 8, secondBat: 'KOL', secondRuns: 165, secondWkts: 3, margin: 'by 7 wkts', potm: 'Narine' },
  { id: 'ipl_11', date: '9 Apr', home: 'LKO', away: 'MUM', firstBat: 'LKO', firstRuns: 142, firstWkts: 6, secondBat: 'MUM', secondRuns: 144, secondWkts: 4, margin: 'by 6 wkts', potm: 'Bumrah' },
  { id: 'ipl_12', date: '10 Apr', home: 'DEL', away: 'RAJ', firstBat: 'RAJ', firstRuns: 241, firstWkts: 7, secondBat: 'DEL', secondRuns: 179, secondWkts: 8, margin: 'by 62 runs', potm: 'Parag' },
  { id: 'ipl_13', date: '11 Apr', home: 'KOL', away: 'CHE', firstBat: 'KOL', firstRuns: 174, firstWkts: 8, secondBat: 'CHE', secondRuns: 150, secondWkts: 10, margin: 'by 24 runs', potm: 'Chakravarthy' },
  { id: 'ipl_14', date: '11 Apr', home: 'GUJ', away: 'PUN', firstBat: 'GUJ', firstRuns: 139, firstWkts: 7, secondBat: 'PUN', secondRuns: 149, secondWkts: 10, margin: 'by 10 runs', potm: 'Arshdeep' },
  { id: 'ipl_15', date: '12 Apr', home: 'HYD', away: 'BLR', firstBat: 'BLR', firstRuns: 228, firstWkts: 5, secondBat: 'HYD', secondRuns: 142, secondWkts: 10, margin: 'by 86 runs', potm: 'Kohli' },
  { id: 'ipl_16', date: '12 Apr', home: 'RAJ', away: 'DEL', firstBat: 'RAJ', firstRuns: 238, firstWkts: 7, secondBat: 'DEL', secondRuns: 123, secondWkts: 10, margin: 'by 115 runs', potm: 'Jaiswal' },
  { id: 'ipl_17', date: '13 Apr', home: 'KOL', away: 'LKO', firstBat: 'LKO', firstRuns: 93, firstWkts: 10, secondBat: 'KOL', secondRuns: 97, secondWkts: 2, margin: 'by 8 wkts', potm: 'H. Rana' },
  { id: 'ipl_18', date: '14 Apr', home: 'MUM', away: 'HYD', firstBat: 'HYD', firstRuns: 204, firstWkts: 5, secondBat: 'MUM', secondRuns: 207, secondWkts: 2, margin: 'by 8 wkts', potm: 'Rohit' },
  { id: 'ipl_19', date: '15 Apr', home: 'GUJ', away: 'CHE', firstBat: 'GUJ', firstRuns: 143, firstWkts: 8, secondBat: 'CHE', secondRuns: 147, secondWkts: 4, margin: 'by 6 wkts', potm: 'Dube' },
  { id: 'ipl_20', date: '16 Apr', home: 'PUN', away: 'BLR', firstBat: 'PUN', firstRuns: 184, firstWkts: 8, secondBat: 'BLR', secondRuns: 180, secondWkts: 5, margin: 'by 4 runs', potm: 'Chahal' },
  { id: 'ipl_21', date: '17 Apr', home: 'DEL', away: 'KOL', abandoned: true, firstBat: 'DEL', firstRuns: 0, firstWkts: 0, secondBat: 'KOL', secondRuns: 0, secondWkts: 0, margin: '', potm: '' },
  { id: 'ipl_22', date: '18 Apr', home: 'GUJ', away: 'LKO', firstBat: 'LKO', firstRuns: 54, firstWkts: 2, secondBat: 'GUJ', secondRuns: 56, secondWkts: 0, margin: 'by 10 wkts', potm: 'Gill' },
  { id: 'ipl_23', date: '18 Apr', home: 'PUN', away: 'MUM', firstBat: 'MUM', firstRuns: 176, firstWkts: 7, secondBat: 'PUN', secondRuns: 166, secondWkts: 9, margin: 'by 10 runs', potm: 'Bumrah' },
  { id: 'ipl_24', date: '19 Apr', home: 'BLR', away: 'HYD', firstBat: 'BLR', firstRuns: 207, firstWkts: 4, secondBat: 'HYD', secondRuns: 204, secondWkts: 5, margin: 'by 3 runs', potm: 'Salt' },
  { id: 'ipl_25', date: '19 Apr', home: 'CHE', away: 'RAJ', firstBat: 'RAJ', firstRuns: 180, firstWkts: 8, secondBat: 'CHE', secondRuns: 95, secondWkts: 10, margin: 'by 85 runs', potm: 'Hasaranga' },
  { id: 'ipl_26', date: '20 Apr', home: 'LKO', away: 'DEL', firstBat: 'DEL', firstRuns: 191, firstWkts: 7, secondBat: 'LKO', secondRuns: 192, secondWkts: 4, margin: 'by 6 wkts', potm: 'Pant' },
  { id: 'ipl_27', date: '21 Apr', home: 'CHE', away: 'KOL', firstBat: 'KOL', firstRuns: 129, firstWkts: 9, secondBat: 'CHE', secondRuns: 118, secondWkts: 10, margin: 'by 11 runs', potm: 'Narine' },
  { id: 'ipl_28_pre', date: '22 Apr', home: 'PUN', away: 'RAJ', firstBat: 'RAJ', firstRuns: 186, firstWkts: 9, secondBat: 'PUN', secondRuns: 137, secondWkts: 10, margin: 'by 49 runs', potm: 'Archer' },
  { id: 'ipl_29_pre', date: '23 Apr', home: 'HYD', away: 'GUJ', firstBat: 'GUJ', firstRuns: 189, firstWkts: 7, secondBat: 'HYD', secondRuns: 136, secondWkts: 10, margin: 'by 53 runs', potm: 'Rashid' },
  { id: 'ipl_28', date: '24 Apr', home: 'MUM', away: 'KOL', firstBat: 'KOL', firstRuns: 92, firstWkts: 8, secondBat: 'MUM', secondRuns: 95, secondWkts: 0, margin: 'by 10 wkts', potm: 'Rohit' },
  { id: 'ipl_29', date: '25 Apr', home: 'BLR', away: 'DEL', firstBat: 'DEL', firstRuns: 162, firstWkts: 6, secondBat: 'BLR', secondRuns: 166, secondWkts: 4, margin: 'by 6 wkts', potm: 'Patidar' },
  { id: 'ipl_30', date: '25 Apr', home: 'HYD', away: 'RAJ', firstBat: 'RAJ', firstRuns: 174, firstWkts: 8, secondBat: 'HYD', secondRuns: 167, secondWkts: 7, margin: 'by 7 runs', potm: 'Sandeep' },
  { id: 'ipl_31', date: '26 Apr', home: 'PUN', away: 'GUJ', firstBat: 'GUJ', firstRuns: 155, firstWkts: 6, secondBat: 'PUN', secondRuns: 159, secondWkts: 5, margin: 'by 5 wkts', potm: 'Shashank' },
  { id: 'ipl_32', date: '26 Apr', home: 'CHE', away: 'LKO', firstBat: 'LKO', firstRuns: 161, firstWkts: 8, secondBat: 'CHE', secondRuns: 164, secondWkts: 5, margin: 'by 5 wkts', potm: 'Shahbaz' },
  { id: 'ipl_33', date: '27 Apr', home: 'MUM', away: 'DEL', firstBat: 'DEL', firstRuns: 91, firstWkts: 0, secondBat: 'MUM', secondRuns: 96, secondWkts: 2, margin: 'by 8 wkts', potm: 'Boult' },
  { id: 'ipl_34', date: '28 Apr', home: 'KOL', away: 'BLR', firstBat: 'KOL', firstRuns: 170, firstWkts: 6, secondBat: 'BLR', secondRuns: 173, secondWkts: 5, margin: 'by 5 wkts', potm: 'Kohli' },
  { id: 'ipl_35', date: '29 Apr', home: 'RAJ', away: 'LKO', firstBat: 'RAJ', firstRuns: 190, firstWkts: 8, secondBat: 'LKO', secondRuns: 156, secondWkts: 9, margin: 'by 34 runs', potm: 'Hetmyer' },
  { id: 'ipl_36', date: '30 Apr', home: 'MUM', away: 'GUJ', firstBat: 'MUM', firstRuns: 181, firstWkts: 5, secondBat: 'GUJ', secondRuns: 182, secondWkts: 4, margin: 'by 6 wkts', potm: 'Buttler' },
  { id: 'ipl_37', date: '1 May', home: 'CHE', away: 'PUN', firstBat: 'PUN', firstRuns: 146, firstWkts: 5, secondBat: 'CHE', secondRuns: 149, secondWkts: 6, margin: 'by 4 wkts', potm: 'Noor' },
  { id: 'ipl_38', date: '2 May', home: 'DEL', away: 'HYD', firstBat: 'HYD', firstRuns: 200, firstWkts: 6, secondBat: 'DEL', secondRuns: 167, secondWkts: 8, margin: 'by 33 runs', potm: 'Head' },
  { id: 'ipl_39', date: '2 May', home: 'BLR', away: 'RAJ', firstBat: 'RAJ', firstRuns: 220, firstWkts: 9, secondBat: 'BLR', secondRuns: 163, secondWkts: 10, margin: 'by 57 runs', potm: 'Jaiswal' },
  { id: 'ipl_40', date: '3 May', home: 'LKO', away: 'CHE', firstBat: 'LKO', firstRuns: 140, firstWkts: 5, secondBat: 'CHE', secondRuns: 144, secondWkts: 5, margin: 'by 5 wkts', potm: 'Gaikwad' },
  { id: 'ipl_41', date: '3 May', home: 'GUJ', away: 'MUM', firstBat: 'MUM', firstRuns: 178, firstWkts: 8, secondBat: 'GUJ', secondRuns: 173, secondWkts: 5, margin: 'by 5 runs', potm: 'H. Pandya' },
  { id: 'ipl_42', date: '4 May', home: 'KOL', away: 'HYD', firstBat: 'KOL', firstRuns: 173, firstWkts: 6, secondBat: 'HYD', secondRuns: 177, secondWkts: 5, margin: 'by 5 wkts', potm: 'Abhishek' },
  { id: 'ipl_43', date: '5 May', home: 'BLR', away: 'PUN', firstBat: 'PUN', firstRuns: 205, firstWkts: 10, secondBat: 'BLR', secondRuns: 67, secondWkts: 10, margin: 'by 138 runs', potm: 'Arshdeep' },
  { id: 'ipl_44', date: '6 May', home: 'KOL', away: 'DEL', firstBat: 'DEL', firstRuns: 99, firstWkts: 6, secondBat: 'KOL', secondRuns: 115, secondWkts: 3, margin: 'by 7 wkts', potm: 'Rinku' },
  { id: 'ipl_45', date: '7 May', home: 'HYD', away: 'MUM', firstBat: 'HYD', firstRuns: 132, firstWkts: 10, secondBat: 'MUM', secondRuns: 133, secondWkts: 2, margin: 'by 8 wkts', potm: 'Bumrah' },
  { id: 'ipl_46', date: '8 May', home: 'LKO', away: 'GUJ', firstBat: 'GUJ', firstRuns: 203, firstWkts: 10, secondBat: 'LKO', secondRuns: 194, secondWkts: 6, margin: 'by 9 runs', potm: 'Sai Sudharsan' },
  { id: 'ipl_47', date: '9 May', home: 'PUN', away: 'DEL', firstBat: 'PUN', firstRuns: 172, firstWkts: 9, secondBat: 'DEL', secondRuns: 79, secondWkts: 10, margin: 'by 93 runs', potm: 'Chahal' },
  { id: 'ipl_48', date: '9 May', home: 'CHE', away: 'BLR', firstBat: 'CHE', firstRuns: 79, firstWkts: 10, secondBat: 'BLR', secondRuns: 84, secondWkts: 1, margin: 'by 9 wkts', potm: 'Hazlewood' },
  { id: 'ipl_49', date: '10 May', home: 'RAJ', away: 'HYD', firstBat: 'RAJ', firstRuns: 200, firstWkts: 7, secondBat: 'HYD', secondRuns: 199, secondWkts: 2, margin: 'by 1 run', potm: 'Sandeep' },
  { id: 'ipl_50', date: '10 May', home: 'LKO', away: 'KOL', firstBat: 'LKO', firstRuns: 95, firstWkts: 10, secondBat: 'KOL', secondRuns: 155, secondWkts: 7, margin: 'by 60 runs', potm: 'Narine' },
  { id: 'ipl_51', date: '11 May', home: 'CHE', away: 'MUM', firstBat: 'CHE', firstRuns: 171, firstWkts: 7, secondBat: 'MUM', secondRuns: 177, secondWkts: 1, margin: 'by 9 wkts', potm: 'Rickelton' },
  { id: 'ipl_52', date: '12 May', home: 'BLR', away: 'GUJ', firstBat: 'BLR', firstRuns: 197, firstWkts: 6, secondBat: 'GUJ', secondRuns: 203, secondWkts: 3, margin: 'by 7 wkts', potm: 'Gill' },
  { id: 'ipl_53', date: '13 May', home: 'DEL', away: 'PUN', firstBat: 'DEL', firstRuns: 145, firstWkts: 3, secondBat: 'PUN', secondRuns: 148, secondWkts: 5, margin: 'by 5 wkts', potm: 'Stoinis' },
  { id: 'ipl_54', date: '14 May', home: 'KOL', away: 'RAJ', firstBat: 'RAJ', firstRuns: 132, firstWkts: 7, secondBat: 'KOL', secondRuns: 135, secondWkts: 4, margin: 'by 6 wkts', potm: 'Rahane' },
  { id: 'ipl_55', date: '15 May', home: 'HYD', away: 'LKO', firstBat: 'HYD', firstRuns: 188, firstWkts: 5, secondBat: 'LKO', secondRuns: 189, secondWkts: 4, margin: 'by 6 wkts', potm: 'Pooran' },
  { id: 'ipl_56', date: '16 May', home: 'MUM', away: 'PUN', firstBat: 'MUM', firstRuns: 89, firstWkts: 7, secondBat: 'PUN', secondRuns: 91, secondWkts: 8, margin: 'by 2 wkts', potm: 'Jansen' },
  { id: 'ipl_57', date: '16 May', home: 'GUJ', away: 'BLR', firstBat: 'GUJ', firstRuns: 127, firstWkts: 10, secondBat: 'BLR', secondRuns: 130, secondWkts: 3, margin: 'by 7 wkts', potm: 'Salt' },
  { id: 'ipl_58', date: '17 May', home: 'RAJ', away: 'CHE', abandoned: true, firstBat: 'RAJ', firstRuns: 0, firstWkts: 0, secondBat: 'CHE', secondRuns: 0, secondWkts: 0, margin: '', potm: '' },
  { id: 'ipl_59', date: '18 May', home: 'BLR', away: 'KOL', firstBat: 'BLR', firstRuns: 118, firstWkts: 10, secondBat: 'KOL', secondRuns: 120, secondWkts: 2, margin: 'by 8 wkts', potm: 'Chakravarthy' },
  { id: 'ipl_60', date: '19 May', home: 'CHE', away: 'DEL', firstBat: 'DEL', firstRuns: 116, firstWkts: 10, secondBat: 'CHE', secondRuns: 146, secondWkts: 10, margin: 'by 30 runs', potm: 'Ellis' },
  { id: 'ipl_61', date: '20 May', home: 'GUJ', away: 'HYD', firstBat: 'GUJ', firstRuns: 171, firstWkts: 7, secondBat: 'HYD', secondRuns: 137, secondWkts: 6, margin: 'by 34 runs', potm: 'Rashid' },
  { id: 'ipl_62', date: '21 May', home: 'RAJ', away: 'MUM', firstBat: 'MUM', firstRuns: 138, firstWkts: 5, secondBat: 'RAJ', secondRuns: 137, secondWkts: 10, margin: 'by 1 run', potm: 'Bumrah' },
  { id: 'ipl_63', date: '22 May', home: 'PUN', away: 'LKO', firstBat: 'PUN', firstRuns: 134, firstWkts: 2, secondBat: 'LKO', secondRuns: 133, secondWkts: 10, margin: 'by 1 run', potm: 'Arshdeep' },
  { id: 'ipl_64', date: '23 May', home: 'RAJ', away: 'KOL', upcoming: true, firstBat: 'KOL', firstRuns: 185, firstWkts: 3, secondBat: 'RAJ', secondRuns: 125, secondWkts: 10, margin: 'by 60 runs', potm: 'Narine' },
  { id: 'ipl_65', date: '23 May', home: 'DEL', away: 'GUJ', upcoming: true, firstBat: 'DEL', firstRuns: 165, firstWkts: 7, secondBat: 'GUJ', secondRuns: 158, secondWkts: 5, margin: 'by 7 runs', potm: 'KL Rahul' },
  { id: 'ipl_66', date: '24 May', home: 'MUM', away: 'CHE', upcoming: true, firstBat: 'MUM', firstRuns: 162, firstWkts: 5, secondBat: 'CHE', secondRuns: 153, secondWkts: 9, margin: 'by 9 runs', potm: 'S. Yadav' },
  { id: 'ipl_67', date: '24 May', home: 'LKO', away: 'BLR', upcoming: true, firstBat: 'BLR', firstRuns: 207, firstWkts: 4, secondBat: 'LKO', secondRuns: 176, secondWkts: 5, margin: 'by 31 runs', potm: 'Kohli' },
  { id: 'ipl_68', date: '25 May', home: 'PUN', away: 'HYD', upcoming: true, firstBat: 'PUN', firstRuns: 230, firstWkts: 7, secondBat: 'HYD', secondRuns: 92, secondWkts: 10, margin: 'by 138 runs', potm: 'S. Iyer' },
  { id: 'ipl_69', date: '27 May', home: 'TBD', away: 'TBD', upcoming: true, firstBat: 'MUM', firstRuns: 144, firstWkts: 4, secondBat: 'PUN', secondRuns: 141, secondWkts: 8, margin: 'by 6 wkts', potm: 'Rohit' },
  { id: 'ipl_70', date: '28 May', home: 'TBD', away: 'TBD', upcoming: true, firstBat: 'RAJ', firstRuns: 128, firstWkts: 7, secondBat: 'KOL', secondRuns: 129, secondWkts: 5, margin: 'by 5 wkts', potm: 'Rinku' },
  { id: 'ipl_71', date: '30 May', home: 'TBD', away: 'TBD', upcoming: true, firstBat: 'PUN', firstRuns: 0, firstWkts: 0, secondBat: 'KOL', secondRuns: 0, secondWkts: 0, margin: '', potm: '' },
  { id: 'ipl_72', date: '2 Jun', home: 'TBD', away: 'TBD', upcoming: true, firstBat: 'MUM', firstRuns: 0, firstWkts: 0, secondBat: 'TBD', secondRuns: 0, secondWkts: 0, margin: '', potm: '' }
];

// ============================================================================
// INTERNATIONAL TOURS & TOURNAMENTS DATA (MATCHING SCREENSHOTS 1, 3, 4 & VIDEO)
// ============================================================================

const INTERNATIONAL_SERIES_AND_TOURNAMENTS: IntlSeriesOrTournament[] = [
  // 1. England tour of Bangladesh (Completed 0-3 - Screenshot 4 & Video 00:18-00:25)
  {
    id: 'tour_eng_ban_2026',
    title: 'England tour of Bangladesh',
    subtitle: '3 ODIs · 6 Apr – 12 Apr · Bangladesh',
    formatLabel: 'ODI',
    hostFlag: '🇧🇩',
    type: 'bilateral',
    hasArrow: true,
    winnerBanner: 'England',
    hostName: 'Bangladesh',
    awayName: 'England',
    awayFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    homeWins: 0,
    awayWins: 3,
    seriesStatusText: 'ENGLAND WIN THE SERIES 3–0',
    seriesCompleted: true,
    matches: [
      {
        id: 'ban_eng_1',
        dateLabel: '6 Apr',
        matchLabel: '1st ODI',
        homeShort: 'BAN',
        awayShort: 'ENG',
        homeFull: 'Bangladesh',
        awayFull: 'England',
        homeFlag: '🇧🇩',
        awayFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        completed: true,
        winnerShort: 'ENG',
        winnerFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        resultShort: 'ENG 113/1 beat BAN 112/10 b...',
        resultFull: 'ENG 113/1 beat BAN 112/10 by 9 wkts (rain-reduced, 48 ov/side)',
        potm: 'Archer',
        ...buildDetailedScorecard('ban_eng_1', 'BAN', 112, 10, '28.1', 'ENG', 113, 1, '16.5', 'Archer', {
          firstFlag: '🇧🇩',
          secondFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
          firstFull: 'BANGLADESH',
          secondFull: 'ENGLAND'
        })
      },
      {
        id: 'ban_eng_2',
        dateLabel: '9 Apr',
        matchLabel: '2nd ODI',
        homeShort: 'BAN',
        awayShort: 'ENG',
        homeFull: 'Bangladesh',
        awayFull: 'England',
        homeFlag: '🇧🇩',
        awayFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        completed: true,
        winnerShort: 'ENG',
        winnerFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        resultShort: 'ENG 387/5 beat BAN 82/10 by ...',
        resultFull: 'ENG 387/5 beat BAN 82/10 by 305 runs',
        potm: 'Buttler',
        ...buildDetailedScorecard('ban_eng_2', 'ENG', 387, 5, '50.0', 'BAN', 82, 10, '24.3', 'Buttler', {
          firstFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
          secondFlag: '🇧🇩',
          firstFull: 'ENGLAND',
          secondFull: 'BANGLADESH'
        })
      },
      {
        id: 'ban_eng_3',
        dateLabel: '12 Apr',
        matchLabel: '3rd ODI',
        homeShort: 'BAN',
        awayShort: 'ENG',
        homeFull: 'Bangladesh',
        awayFull: 'England',
        homeFlag: '🇧🇩',
        awayFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        completed: true,
        winnerShort: 'ENG',
        winnerFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        resultShort: 'ENG 381/9 beat BAN 135/10 b...',
        resultFull: 'ENG 381/9 beat BAN 135/10 by 246 runs',
        potm: 'Brook',
        ...buildDetailedScorecard('ban_eng_3', 'ENG', 381, 9, '50.0', 'BAN', 135, 10, '34.2', 'Brook', {
          firstFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
          secondFlag: '🇧🇩',
          firstFull: 'ENGLAND',
          secondFull: 'BANGLADESH'
        })
      }
    ],
    mostRuns: [
      { rank: 1, name: 'Brook', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', matches: 3, innings: 2, runs: 304, avg: '152.0', sr: '141.4', hs: '168' },
      { rank: 2, name: 'Buttler', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', matches: 3, innings: 3, runs: 236, avg: '118.0', sr: '121.0', hs: '205' },
      { rank: 3, name: 'Salt', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', matches: 3, innings: 3, runs: 225, avg: '112.5', sr: '109.8', hs: '120' },
      { rank: 4, name: 'Taskin', flag: '🇧🇩', matches: 3, innings: 3, runs: 74, avg: '24.7', sr: '73.3', hs: '34' },
      { rank: 5, name: 'Jacks', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', matches: 3, innings: 2, runs: 46, avg: '23.0', sr: '124.3', hs: '42' },
      { rank: 6, name: 'Miraz', flag: '🇧🇩', matches: 3, innings: 3, runs: 44, avg: '14.7', sr: '58.7', hs: '41' },
      { rank: 7, name: 'Shanto', flag: '🇧🇩', matches: 2, innings: 2, runs: 43, avg: '21.5', sr: '89.6', hs: '42' },
      { rank: 8, name: 'Litton', flag: '🇧🇩', matches: 3, innings: 3, runs: 37, avg: '12.3', sr: '64.9', hs: '20' },
      { rank: 9, name: 'Rishad', flag: '🇧🇩', matches: 2, innings: 2, runs: 25, avg: '12.5', sr: '56.8', hs: '21' },
      { rank: 10, name: 'Tanvir', flag: '🇧🇩', matches: 1, innings: 1, runs: 23, avg: '23.0', sr: '69.7', hs: '23' }
    ],
    mostWickets: [
      { rank: 1, name: 'Archer', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', matches: 3, innings: 3, wickets: 9, avg: '8.3', econ: '3.57', bbi: '5/30' },
      { rank: 2, name: 'S. Curran', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', matches: 3, innings: 3, wickets: 8, avg: '7.8', econ: '3.10', bbi: '5/30' },
      { rank: 3, name: 'A. Rashid', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', matches: 3, innings: 3, wickets: 7, avg: '12.3', econ: '3.85', bbi: '3/17' },
      { rank: 4, name: 'Shakib', flag: '🇧🇩', matches: 3, innings: 3, wickets: 5, avg: '27.6', econ: '5.52', bbi: '2/47' },
      { rank: 5, name: 'Mustafizur', flag: '🇧🇩', matches: 2, innings: 2, wickets: 5, avg: '34.8', econ: '8.70', bbi: '4/89' },
      { rank: 6, name: 'Jacks', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', matches: 3, innings: 2, wickets: 3, avg: '10.0', econ: '5.81', bbi: '3/14' },
      { rank: 7, name: 'Mahmud', flag: '🇧🇩', matches: 2, innings: 2, wickets: 3, avg: '43.0', econ: '7.59', bbi: '2/61' },
      { rank: 8, name: 'R. Ahmed', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', matches: 3, innings: 3, wickets: 2, avg: '23.0', econ: '4.60', bbi: '2/14' },
      { rank: 9, name: 'Dawson', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', matches: 1, innings: 1, wickets: 1, avg: '15.0', econ: '5.00', bbi: '1/15' },
      { rank: 10, name: 'Rishad', flag: '🇧🇩', matches: 2, innings: 2, wickets: 1, avg: '60.0', econ: '6.67', bbi: '1/42' }
    ]
  },

  // 2. USA ODI Tri-Series 2026 (Completed - Screenshot 3)
  {
    id: 'tour_usa_tri_2026',
    title: 'USA ODI Tri-Series 2026',
    subtitle: 'ODI · 1 May – 19 May · USA',
    formatLabel: 'ODI',
    hostFlag: '🇺🇸',
    type: 'tournament',
    hasArrow: true,
    winnerBanner: 'Nepal',
    groups: [
      {
        groupName: 'STANDINGS',
        rows: [
          { rank: 1, teamName: 'Nepal', flag: '🇳🇵', qualifies: true, p: 4, w: 3, l: 1, t: 0, pts: 6, nrr: '+1.42' },
          { rank: 2, teamName: 'Bangladesh', flag: '🇧🇩', qualifies: true, p: 4, w: 2, l: 2, t: 0, pts: 4, nrr: '-0.18' },
          { rank: 3, teamName: 'USA', flag: '🇺🇸', qualifies: false, p: 4, w: 1, l: 3, t: 0, pts: 2, nrr: '-1.15' }
        ]
      }
    ],
    matches: [
      {
        id: 'tri_1',
        dateLabel: '1 May',
        matchLabel: 'ODI Group Stage',
        homeShort: 'USA',
        awayShort: 'NEP',
        homeFull: 'USA',
        awayFull: 'Nepal',
        homeFlag: '🇺🇸',
        awayFlag: '🇳🇵',
        completed: true,
        resultShort: 'NEP 342/4 beat USA 172/10 by...',
        resultFull: 'NEP 342/4 beat USA 172/10 by 170 runs',
        potm: 'Paudel',
        ...buildDetailedScorecard('tri_1', 'NEP', 342, 4, '50.0', 'USA', 172, 10, '38.4', 'Paudel', {
          firstFlag: '🇳🇵', secondFlag: '🇺🇸', firstFull: 'NEPAL', secondFull: 'USA'
        })
      },
      {
        id: 'tri_2',
        dateLabel: '4 May',
        matchLabel: 'ODI Group Stage',
        homeShort: 'USA',
        awayShort: 'BAN',
        homeFull: 'USA',
        awayFull: 'Bangladesh',
        homeFlag: '🇺🇸',
        awayFlag: '🇧🇩',
        completed: true,
        resultShort: 'USA 249/10 beat BAN 111/10 ...',
        resultFull: 'USA 249/10 beat BAN 111/10 by 138 runs',
        potm: 'Netravalkar',
        ...buildDetailedScorecard('tri_2', 'USA', 249, 10, '49.2', 'BAN', 111, 10, '29.5', 'Netravalkar', {
          firstFlag: '🇺🇸', secondFlag: '🇧🇩', firstFull: 'USA', secondFull: 'BANGLADESH'
        })
      },
      {
        id: 'tri_3',
        dateLabel: '7 May',
        matchLabel: 'ODI Group Stage',
        homeShort: 'NEP',
        awayShort: 'BAN',
        homeFull: 'Nepal',
        awayFull: 'Bangladesh',
        homeFlag: '🇳🇵',
        awayFlag: '🇧🇩',
        completed: true,
        resultShort: 'BAN 287/6 beat NEP 284/8 by ...',
        resultFull: 'BAN 287/6 beat NEP 284/8 by 4 wkts',
        potm: 'Miraz',
        ...buildDetailedScorecard('tri_3', 'NEP', 284, 8, '50.0', 'BAN', 287, 6, '48.4', 'Miraz', {
          firstFlag: '🇳🇵', secondFlag: '🇧🇩', firstFull: 'NEPAL', secondFull: 'BANGLADESH'
        })
      },
      {
        id: 'tri_4',
        dateLabel: '10 May',
        matchLabel: 'ODI Group Stage',
        homeShort: 'NEP',
        awayShort: 'USA',
        homeFull: 'Nepal',
        awayFull: 'USA',
        homeFlag: '🇳🇵',
        awayFlag: '🇺🇸',
        completed: true,
        resultShort: 'NEP 222/3 beat USA 218/10 by...',
        resultFull: 'NEP 222/3 beat USA 218/10 by 7 wkts',
        potm: 'Airee',
        ...buildDetailedScorecard('tri_4', 'USA', 218, 10, '47.1', 'NEP', 222, 3, '41.2', 'Airee', {
          firstFlag: '🇺🇸', secondFlag: '🇳🇵', firstFull: 'USA', secondFull: 'NEPAL'
        })
      },
      {
        id: 'tri_5',
        dateLabel: '13 May',
        matchLabel: 'ODI Group Stage',
        homeShort: 'BAN',
        awayShort: 'USA',
        homeFull: 'Bangladesh',
        awayFull: 'USA',
        homeFlag: '🇧🇩',
        awayFlag: '🇺🇸',
        completed: true,
        resultShort: 'BAN 202/2 beat USA 200/10 b...',
        resultFull: 'BAN 202/2 beat USA 200/10 by 8 wkts',
        potm: 'Shanto',
        ...buildDetailedScorecard('tri_5', 'USA', 200, 10, '46.3', 'BAN', 202, 2, '35.4', 'Shanto', {
          firstFlag: '🇺🇸', secondFlag: '🇧🇩', firstFull: 'USA', secondFull: 'BANGLADESH'
        })
      },
      {
        id: 'tri_6',
        dateLabel: '16 May',
        matchLabel: 'ODI Group Stage',
        homeShort: 'BAN',
        awayShort: 'NEP',
        homeFull: 'Bangladesh',
        awayFull: 'Nepal',
        homeFlag: '🇧🇩',
        awayFlag: '🇳🇵',
        completed: true,
        resultShort: 'BAN 290/4 beat NEP 289/7 by ...',
        resultFull: 'BAN 290/4 beat NEP 289/7 by 6 wkts',
        potm: 'Litton',
        ...buildDetailedScorecard('tri_6', 'NEP', 289, 7, '50.0', 'BAN', 290, 4, '49.1', 'Litton', {
          firstFlag: '🇳🇵', secondFlag: '🇧🇩', firstFull: 'NEPAL', secondFull: 'BANGLADESH'
        })
      },
      {
        id: 'tri_7',
        dateLabel: '19 May',
        matchLabel: 'ODI Final',
        homeShort: 'BAN',
        awayShort: 'NEP',
        homeFull: 'Bangladesh',
        awayFull: 'Nepal',
        homeFlag: '🇧🇩',
        awayFlag: '🇳🇵',
        completed: true,
        resultShort: 'NEP 302/8 beat BAN 259/10 b...',
        resultFull: 'NEP 302/8 beat BAN 259/10 by 43 runs',
        potm: 'Lamichhane',
        ...buildDetailedScorecard('tri_7', 'NEP', 302, 8, '50.0', 'BAN', 259, 10, '46.2', 'Lamichhane', {
          firstFlag: '🇳🇵', secondFlag: '🇧🇩', firstFull: 'NEPAL', secondFull: 'BANGLADESH'
        })
      }
    ],
    mostRuns: [
      { rank: 1, name: 'Paudel', flag: '🇳🇵', matches: 5, innings: 5, runs: 312, avg: '78.0', sr: '96.4', hs: '118' },
      { rank: 2, name: 'Shanto', flag: '🇧🇩', matches: 5, innings: 5, runs: 265, avg: '66.2', sr: '91.0', hs: '94*' },
      { rank: 3, name: 'Airee', flag: '🇳🇵', matches: 5, innings: 5, runs: 228, avg: '57.0', sr: '114.0', hs: '89' }
    ],
    mostWickets: [
      { rank: 1, name: 'Lamichhane', flag: '🇳🇵', matches: 5, innings: 5, wickets: 13, avg: '14.2', econ: '4.12', bbi: '4/31' },
      { rank: 2, name: 'Taskin', flag: '🇧🇩', matches: 5, innings: 5, wickets: 10, avg: '19.8', econ: '5.05', bbi: '3/38' },
      { rank: 3, name: 'Netravalkar', flag: '🇺🇸', matches: 4, innings: 4, wickets: 8, avg: '21.0', econ: '4.75', bbi: '4/24' }
    ]
  },

  // 3. Australia tour of West Indies
  {
    id: 'tour_aus_wi_2026',
    title: 'Australia tour of West Indies',
    subtitle: '5 T20Is · 3 Jul – 11 Jul · West Indies',
    formatLabel: 'T20I',
    hostFlag: '🌴',
    type: 'bilateral',
    hasArrow: true,
    hostName: 'West Indies',
    awayName: 'Australia',
    awayFlag: '🇦🇺',
    homeWins: 0,
    awayWins: 0,
    seriesStatusText: '5 T20I series · 0 of 5 played',
    seriesCompleted: false,
    mostRuns: [],
    mostWickets: [],
    matches: [
      { id: 'wi_aus_1', dateLabel: '3 Jul', matchLabel: '1st T20I', homeShort: 'WI', awayShort: 'AUS', homeFull: 'West Indies', awayFull: 'Australia', completed: false },
      { id: 'wi_aus_2', dateLabel: '5 Jul', matchLabel: '2nd T20I', homeShort: 'WI', awayShort: 'AUS', homeFull: 'West Indies', awayFull: 'Australia', completed: false },
      { id: 'wi_aus_3', dateLabel: '7 Jul', matchLabel: '3rd T20I', homeShort: 'WI', awayShort: 'AUS', homeFull: 'West Indies', awayFull: 'Australia', completed: false },
      { id: 'wi_aus_4', dateLabel: '9 Jul', matchLabel: '4th T20I', homeShort: 'WI', awayShort: 'AUS', homeFull: 'West Indies', awayFull: 'Australia', completed: false },
      { id: 'wi_aus_5', dateLabel: '11 Jul', matchLabel: '5th T20I', homeShort: 'WI', awayShort: 'AUS', homeFull: 'West Indies', awayFull: 'Australia', completed: false }
    ]
  },

  // 4. Pakistan tour of USA
  {
    id: 'tour_pak_usa_2026',
    title: 'Pakistan tour of USA',
    subtitle: '3 T20Is · 3 ODIs · 3 Jul – 17 Jul · USA',
    formatLabel: 'ODI & T20I',
    hostFlag: '🇺🇸',
    type: 'bilateral',
    hasArrow: false,
    hostName: 'USA',
    awayName: 'Pakistan',
    awayFlag: '🇵🇰',
    homeWins: 0,
    awayWins: 0,
    seriesStatusText: '6-match tour · 0 of 6 played',
    seriesCompleted: false,
    mostRuns: [],
    mostWickets: [],
    matches: [
      { id: 'usa_pak_1', dateLabel: '3 Jul', matchLabel: '1st ODI', homeShort: 'USA', awayShort: 'PAK', homeFull: 'USA', awayFull: 'Pakistan', completed: false },
      { id: 'usa_pak_2', dateLabel: '6 Jul', matchLabel: '2nd ODI', homeShort: 'USA', awayShort: 'PAK', homeFull: 'USA', awayFull: 'Pakistan', completed: false },
      { id: 'usa_pak_3', dateLabel: '9 Jul', matchLabel: '3rd ODI', homeShort: 'USA', awayShort: 'PAK', homeFull: 'USA', awayFull: 'Pakistan', completed: false },
      { id: 'usa_pak_4', dateLabel: '13 Jul', matchLabel: '1st T20I', homeShort: 'USA', awayShort: 'PAK', homeFull: 'USA', awayFull: 'Pakistan', completed: false },
      { id: 'usa_pak_5', dateLabel: '15 Jul', matchLabel: '2nd T20I', homeShort: 'USA', awayShort: 'PAK', homeFull: 'USA', awayFull: 'Pakistan', completed: false },
      { id: 'usa_pak_6', dateLabel: '17 Jul', matchLabel: '3rd T20I', homeShort: 'USA', awayShort: 'PAK', homeFull: 'USA', awayFull: 'Pakistan', completed: false }
    ]
  },

  // 5. Sri Lanka tour of England
  {
    id: 'tour_sl_eng_2026',
    title: 'Sri Lanka tour of England',
    subtitle: '5 T20Is · 3 Tests · 5 Jul – 5 Aug · England',
    formatLabel: 'T20I & Test',
    hostFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    type: 'bilateral',
    hasArrow: false,
    hostName: 'England',
    awayName: 'Sri Lanka',
    awayFlag: '🇱🇰',
    homeWins: 0,
    awayWins: 0,
    seriesStatusText: '8-match tour · 0 of 8 played',
    seriesCompleted: false,
    mostRuns: [],
    mostWickets: [],
    matches: [
      { id: 'eng_sl_1', dateLabel: '5 Jul', matchLabel: '1st T20I', homeShort: 'ENG', awayShort: 'SL', homeFull: 'England', awayFull: 'Sri Lanka', completed: false },
      { id: 'eng_sl_2', dateLabel: '7 Jul', matchLabel: '2nd T20I', homeShort: 'ENG', awayShort: 'SL', homeFull: 'England', awayFull: 'Sri Lanka', completed: false },
      { id: 'eng_sl_3', dateLabel: '9 Jul', matchLabel: '3rd T20I', homeShort: 'ENG', awayShort: 'SL', homeFull: 'England', awayFull: 'Sri Lanka', completed: false },
      { id: 'eng_sl_4', dateLabel: '11 Jul', matchLabel: '4th T20I', homeShort: 'ENG', awayShort: 'SL', homeFull: 'England', awayFull: 'Sri Lanka', completed: false },
      { id: 'eng_sl_5', dateLabel: '13 Jul', matchLabel: '5th T20I', homeShort: 'ENG', awayShort: 'SL', homeFull: 'England', awayFull: 'Sri Lanka', completed: false },
      { id: 'eng_sl_6', dateLabel: '20 Jul', matchLabel: '1st Test', homeShort: 'ENG', awayShort: 'SL', homeFull: 'England', awayFull: 'Sri Lanka', completed: false },
      { id: 'eng_sl_7', dateLabel: '28 Jul', matchLabel: '2nd Test', homeShort: 'ENG', awayShort: 'SL', homeFull: 'England', awayFull: 'Sri Lanka', completed: false },
      { id: 'eng_sl_8', dateLabel: '5 Aug', matchLabel: '3rd Test', homeShort: 'ENG', awayShort: 'SL', homeFull: 'England', awayFull: 'Sri Lanka', completed: false }
    ]
  },

  // 6. Nepal tour of West Indies (Video 00:30-00:31 exact match!)
  {
    id: 'tour_nep_wi_2026',
    title: 'Nepal tour of West Indies',
    subtitle: '3 T20Is · 16 Jul – 20 Jul · West Indies',
    formatLabel: 'T20I',
    hostFlag: '🌴',
    type: 'bilateral',
    hasArrow: true,
    hostName: 'West Indies',
    awayName: 'Nepal',
    awayFlag: '🇳🇵',
    homeWins: 0,
    awayWins: 0,
    seriesStatusText: '3 T20I series · 0 of 3 played',
    seriesCompleted: false,
    mostRuns: [],
    mostWickets: [],
    matches: [
      { id: 'wi_nep_1', dateLabel: '16 Jul', matchLabel: '1st T20I', homeShort: 'WI', awayShort: 'NEP', homeFull: 'West Indies', awayFull: 'Nepal', completed: false },
      { id: 'wi_nep_2', dateLabel: '18 Jul', matchLabel: '2nd T20I', homeShort: 'WI', awayShort: 'NEP', homeFull: 'West Indies', awayFull: 'Nepal', completed: false },
      { id: 'wi_nep_3', dateLabel: '20 Jul', matchLabel: '3rd T20I', homeShort: 'WI', awayShort: 'NEP', homeFull: 'West Indies', awayFull: 'Nepal', completed: false }
    ]
  },

  // 7. New Zealand tour of USA
  {
    id: 'tour_nz_usa_2026',
    title: 'New Zealand tour of USA',
    subtitle: '3 T20Is · 22 Jul – 26 Jul · USA',
    formatLabel: 'T20I',
    hostFlag: '🇺🇸',
    type: 'bilateral',
    hasArrow: true,
    hostName: 'USA',
    awayName: 'New Zealand',
    awayFlag: '🇳🇿',
    homeWins: 0,
    awayWins: 0,
    seriesStatusText: '3 T20I series · 0 of 3 played',
    seriesCompleted: false,
    mostRuns: [],
    mostWickets: [],
    matches: [
      { id: 'usa_nz_1', dateLabel: '22 Jul', matchLabel: '1st T20I', homeShort: 'USA', awayShort: 'NZ', homeFull: 'USA', awayFull: 'New Zealand', completed: false },
      { id: 'usa_nz_2', dateLabel: '24 Jul', matchLabel: '2nd T20I', homeShort: 'USA', awayShort: 'NZ', homeFull: 'USA', awayFull: 'New Zealand', completed: false },
      { id: 'usa_nz_3', dateLabel: '26 Jul', matchLabel: '3rd T20I', homeShort: 'USA', awayShort: 'NZ', homeFull: 'USA', awayFull: 'New Zealand', completed: false }
    ]
  },

  // 8. South Africa tour of West Indies
  {
    id: 'tour_sa_wi_2026',
    title: 'South Africa tour of West Indies',
    subtitle: '3 T20Is · 3 ODIs · 3 Tests · 25 Jul – 31 Aug · West Indies',
    formatLabel: 'All Formats',
    hostFlag: '🌴',
    type: 'bilateral',
    hasArrow: false,
    hostName: 'West Indies',
    awayName: 'South Africa',
    awayFlag: '🇿🇦',
    homeWins: 0,
    awayWins: 0,
    seriesStatusText: '9-match tour · 0 of 9 played',
    seriesCompleted: false,
    mostRuns: [],
    mostWickets: [],
    matches: [
      { id: 'wi_sa_1', dateLabel: '25 Jul', matchLabel: '1st T20I', homeShort: 'WI', awayShort: 'SA', homeFull: 'West Indies', awayFull: 'South Africa', completed: false },
      { id: 'wi_sa_2', dateLabel: '27 Jul', matchLabel: '2nd T20I', homeShort: 'WI', awayShort: 'SA', homeFull: 'West Indies', awayFull: 'South Africa', completed: false },
      { id: 'wi_sa_3', dateLabel: '29 Jul', matchLabel: '3rd T20I', homeShort: 'WI', awayShort: 'SA', homeFull: 'West Indies', awayFull: 'South Africa', completed: false },
      { id: 'wi_sa_4', dateLabel: '2 Aug', matchLabel: '1st ODI', homeShort: 'WI', awayShort: 'SA', homeFull: 'West Indies', awayFull: 'South Africa', completed: false },
      { id: 'wi_sa_5', dateLabel: '5 Aug', matchLabel: '2nd ODI', homeShort: 'WI', awayShort: 'SA', homeFull: 'West Indies', awayFull: 'South Africa', completed: false },
      { id: 'wi_sa_6', dateLabel: '8 Aug', matchLabel: '3rd ODI', homeShort: 'WI', awayShort: 'SA', homeFull: 'West Indies', awayFull: 'South Africa', completed: false },
      { id: 'wi_sa_7', dateLabel: '15 Aug', matchLabel: '1st Test', homeShort: 'WI', awayShort: 'SA', homeFull: 'West Indies', awayFull: 'South Africa', completed: false },
      { id: 'wi_sa_8', dateLabel: '23 Aug', matchLabel: '2nd Test', homeShort: 'WI', awayShort: 'SA', homeFull: 'West Indies', awayFull: 'South Africa', completed: false },
      { id: 'wi_sa_9', dateLabel: '31 Aug', matchLabel: '3rd Test', homeShort: 'WI', awayShort: 'SA', homeFull: 'West Indies', awayFull: 'South Africa', completed: false }
    ]
  },

  // 9. Afghanistan tour of Australia
  {
    id: 'tour_afg_aus_2026',
    title: 'Afghanistan tour of Australia',
    subtitle: '2 ODIs · 1 Aug – 4 Aug · Australia',
    formatLabel: 'ODI',
    hostFlag: '🇦🇺',
    type: 'bilateral',
    hasArrow: true,
    hostName: 'Australia',
    awayName: 'Afghanistan',
    awayFlag: '🇦🇫',
    homeWins: 0,
    awayWins: 0,
    seriesStatusText: '2 ODI series · 0 of 2 played',
    seriesCompleted: false,
    mostRuns: [],
    mostWickets: [],
    matches: [
      { id: 'aus_afg_1', dateLabel: '1 Aug', matchLabel: '1st ODI', homeShort: 'AUS', awayShort: 'AFG', homeFull: 'Australia', awayFull: 'Afghanistan', completed: false },
      { id: 'aus_afg_2', dateLabel: '4 Aug', matchLabel: '2nd ODI', homeShort: 'AUS', awayShort: 'AFG', homeFull: 'Australia', awayFull: 'Afghanistan', completed: false }
    ]
  },

  // 10. Australia tour of USA
  {
    id: 'tour_aus_usa_2026',
    title: 'Australia tour of USA',
    subtitle: '3 T20Is · 15 Aug – 19 Aug · USA',
    formatLabel: 'T20I',
    hostFlag: '🇺🇸',
    type: 'bilateral',
    hasArrow: true,
    hostName: 'USA',
    awayName: 'Australia',
    awayFlag: '🇦🇺',
    homeWins: 0,
    awayWins: 0,
    seriesStatusText: '3 T20I series · 0 of 3 played',
    seriesCompleted: false,
    mostRuns: [],
    mostWickets: [],
    matches: [
      { id: 'usa_aus_1', dateLabel: '15 Aug', matchLabel: '1st T20I', homeShort: 'USA', awayShort: 'AUS', homeFull: 'USA', awayFull: 'Australia', completed: false },
      { id: 'usa_aus_2', dateLabel: '17 Aug', matchLabel: '2nd T20I', homeShort: 'USA', awayShort: 'AUS', homeFull: 'USA', awayFull: 'Australia', completed: false },
      { id: 'usa_aus_3', dateLabel: '19 Aug', matchLabel: '3rd T20I', homeShort: 'USA', awayShort: 'AUS', homeFull: 'USA', awayFull: 'Australia', completed: false }
    ]
  },

  // 11. India tour of Sri Lanka
  {
    id: 'tour_ind_sl_2026',
    title: 'India tour of Sri Lanka',
    subtitle: '2 Tests · 15 Aug – 24 Aug · Sri Lanka',
    formatLabel: 'Test',
    hostFlag: '🇱🇰',
    type: 'bilateral',
    hasArrow: true,
    hostName: 'Sri Lanka',
    awayName: 'India',
    awayFlag: '🇮🇳',
    homeWins: 0,
    awayWins: 0,
    seriesStatusText: '2 Test series · 0 of 2 played',
    seriesCompleted: false,
    mostRuns: [],
    mostWickets: [],
    matches: [
      { id: 'sl_ind_1', dateLabel: '15 Aug', matchLabel: '1st Test', homeShort: 'SL', awayShort: 'IND', homeFull: 'Sri Lanka', awayFull: 'India', completed: false },
      { id: 'sl_ind_2', dateLabel: '24 Aug', matchLabel: '2nd Test', homeShort: 'SL', awayShort: 'IND', homeFull: 'Sri Lanka', awayFull: 'India', completed: false }
    ]
  },

  // 12. Pakistan tour of England
  {
    id: 'tour_pak_eng_2026',
    title: 'Pakistan tour of England',
    subtitle: '5 T20Is · 3 ODIs · 24 Aug – 11 Sep · England',
    formatLabel: 'T20I & ODI',
    hostFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    type: 'bilateral',
    hasArrow: false,
    hostName: 'England',
    awayName: 'Pakistan',
    awayFlag: '🇵🇰',
    homeWins: 0,
    awayWins: 0,
    seriesStatusText: '8-match tour · 0 of 8 played',
    seriesCompleted: false,
    mostRuns: [],
    mostWickets: [],
    matches: [
      { id: 'eng_pak_1', dateLabel: '24 Aug', matchLabel: '1st T20I', homeShort: 'ENG', awayShort: 'PAK', homeFull: 'England', awayFull: 'Pakistan', completed: false },
      { id: 'eng_pak_2', dateLabel: '26 Aug', matchLabel: '2nd T20I', homeShort: 'ENG', awayShort: 'PAK', homeFull: 'England', awayFull: 'Pakistan', completed: false },
      { id: 'eng_pak_3', dateLabel: '28 Aug', matchLabel: '3rd T20I', homeShort: 'ENG', awayShort: 'PAK', homeFull: 'England', awayFull: 'Pakistan', completed: false },
      { id: 'eng_pak_4', dateLabel: '30 Aug', matchLabel: '4th T20I', homeShort: 'ENG', awayShort: 'PAK', homeFull: 'England', awayFull: 'Pakistan', completed: false },
      { id: 'eng_pak_5', dateLabel: '1 Sep', matchLabel: '5th T20I', homeShort: 'ENG', awayShort: 'PAK', homeFull: 'England', awayFull: 'Pakistan', completed: false },
      { id: 'eng_pak_6', dateLabel: '5 Sep', matchLabel: '1st ODI', homeShort: 'ENG', awayShort: 'PAK', homeFull: 'England', awayFull: 'Pakistan', completed: false },
      { id: 'eng_pak_7', dateLabel: '8 Sep', matchLabel: '2nd ODI', homeShort: 'ENG', awayShort: 'PAK', homeFull: 'England', awayFull: 'Pakistan', completed: false },
      { id: 'eng_pak_8', dateLabel: '11 Sep', matchLabel: '3rd ODI', homeShort: 'ENG', awayShort: 'PAK', homeFull: 'England', awayFull: 'Pakistan', completed: false }
    ]
  },

  // 13. New Zealand tour of Sri Lanka
  {
    id: 'tour_nz_sl_2026',
    title: 'New Zealand tour of Sri Lanka',
    subtitle: '2 T20Is · 2 Sep – 5 Sep · Sri Lanka',
    formatLabel: 'T20I',
    hostFlag: '🇱🇰',
    type: 'bilateral',
    hasArrow: true,
    hostName: 'Sri Lanka',
    awayName: 'New Zealand',
    awayFlag: '🇳🇿',
    homeWins: 0,
    awayWins: 0,
    seriesStatusText: '2 T20I series · 0 of 2 played',
    seriesCompleted: false,
    mostRuns: [],
    mostWickets: [],
    matches: [
      { id: 'sl_nz_1', dateLabel: '2 Sep', matchLabel: '1st T20I', homeShort: 'SL', awayShort: 'NZ', homeFull: 'Sri Lanka', awayFull: 'New Zealand', completed: false },
      { id: 'sl_nz_2', dateLabel: '5 Sep', matchLabel: '2nd T20I', homeShort: 'SL', awayShort: 'NZ', homeFull: 'Sri Lanka', awayFull: 'New Zealand', completed: false }
    ]
  },

  // 14. Bangladesh tour of Afghanistan
  {
    id: 'tour_ban_afg_2026',
    title: 'Bangladesh tour of Afghanistan',
    subtitle: '2 Tests · 8 Sep – 15 Sep · Afghanistan',
    formatLabel: 'Test',
    hostFlag: '🇦🇫',
    type: 'bilateral',
    hasArrow: true,
    hostName: 'Afghanistan',
    awayName: 'Bangladesh',
    awayFlag: '🇧🇩',
    homeWins: 0,
    awayWins: 0,
    seriesStatusText: '2 Test series · 0 of 2 played',
    seriesCompleted: false,
    mostRuns: [],
    mostWickets: [],
    matches: [
      { id: 'afg_ban_1', dateLabel: '8 Sep', matchLabel: '1st Test', homeShort: 'AFG', awayShort: 'BAN', homeFull: 'Afghanistan', awayFull: 'Bangladesh', completed: false },
      { id: 'afg_ban_2', dateLabel: '15 Sep', matchLabel: '2nd Test', homeShort: 'AFG', awayShort: 'BAN', homeFull: 'Afghanistan', awayFull: 'Bangladesh', completed: false }
    ]
  },

  // 15. South Africa tour of USA
  {
    id: 'tour_sa_usa_2026',
    title: 'South Africa tour of USA',
    subtitle: '3 T20Is · 9 Sep – 13 Sep · USA',
    formatLabel: 'T20I',
    hostFlag: '🇺🇸',
    type: 'bilateral',
    hasArrow: true,
    hostName: 'USA',
    awayName: 'South Africa',
    awayFlag: '🇿🇦',
    homeWins: 0,
    awayWins: 0,
    seriesStatusText: '3 T20I series · 0 of 3 played',
    seriesCompleted: false,
    mostRuns: [],
    mostWickets: [],
    matches: [
      { id: 'usa_sa_1', dateLabel: '9 Sep', matchLabel: '1st T20I', homeShort: 'USA', awayShort: 'SA', homeFull: 'USA', awayFull: 'South Africa', completed: false },
      { id: 'usa_sa_2', dateLabel: '11 Sep', matchLabel: '2nd T20I', homeShort: 'USA', awayShort: 'SA', homeFull: 'USA', awayFull: 'South Africa', completed: false },
      { id: 'usa_sa_3', dateLabel: '13 Sep', matchLabel: '3rd T20I', homeShort: 'USA', awayShort: 'SA', homeFull: 'USA', awayFull: 'South Africa', completed: false }
    ]
  },

  // 16. West Indies tour of Sri Lanka
  {
    id: 'tour_wi_sl_2026',
    title: 'West Indies tour of Sri Lanka',
    subtitle: '2 Tests · 11 Sep – 19 Sep · Sri Lanka',
    formatLabel: 'Test',
    hostFlag: '🇱🇰',
    type: 'bilateral',
    hasArrow: true,
    hostName: 'Sri Lanka',
    awayName: 'West Indies',
    awayFlag: '🌴',
    homeWins: 0,
    awayWins: 0,
    seriesStatusText: '2 Test series · 0 of 2 played',
    seriesCompleted: false,
    mostRuns: [],
    mostWickets: [],
    matches: [
      { id: 'sl_wi_1', dateLabel: '11 Sep', matchLabel: '1st Test', homeShort: 'SL', awayShort: 'WI', homeFull: 'Sri Lanka', awayFull: 'West Indies', completed: false },
      { id: 'sl_wi_2', dateLabel: '19 Sep', matchLabel: '2nd Test', homeShort: 'SL', awayShort: 'WI', homeFull: 'Sri Lanka', awayFull: 'West Indies', completed: false }
    ]
  },

  // 17. Australia tour of England
  {
    id: 'tour_aus_eng_2026',
    title: 'Australia tour of England',
    subtitle: '3 T20Is · 15 Sep – 20 Sep · England',
    formatLabel: 'T20I',
    hostFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    type: 'bilateral',
    hasArrow: true,
    hostName: 'England',
    awayName: 'Australia',
    awayFlag: '🇦🇺',
    homeWins: 0,
    awayWins: 0,
    seriesStatusText: '3 T20I series · 0 of 3 played',
    seriesCompleted: false,
    mostRuns: [],
    mostWickets: [],
    matches: [
      { id: 'eng_aus_1', dateLabel: '15 Sep', matchLabel: '1st T20I', homeShort: 'ENG', awayShort: 'AUS', homeFull: 'England', awayFull: 'Australia', completed: false },
      { id: 'eng_aus_2', dateLabel: '18 Sep', matchLabel: '2nd T20I', homeShort: 'ENG', awayShort: 'AUS', homeFull: 'England', awayFull: 'Australia', completed: false },
      { id: 'eng_aus_3', dateLabel: '20 Sep', matchLabel: '3rd T20I', homeShort: 'ENG', awayShort: 'AUS', homeFull: 'England', awayFull: 'Australia', completed: false }
    ]
  },

  // 18. T20 World Cup 2026 (Screenshot 1 & Video 00:36-00:43 exact match!)
  {
    id: 'tour_t20_wc_2026',
    title: 'T20 World Cup 2026',
    subtitle: 'T20I · 25 Sep – 21 Oct · Afghanistan',
    formatLabel: 'T20I',
    hostFlag: '🇦🇫',
    type: 'tournament',
    hasArrow: true,
    knockouts: {
      sf1Date: '17 Oct',
      sf1Team1: 'TBD',
      sf1Team2: 'TBD',
      sf2Date: '18 Oct',
      sf2Team1: 'TBD',
      sf2Team2: 'TBD',
      finalDate: '21 Oct',
      finalTeam1: 'TBD',
      finalTeam2: 'TBD'
    },
    groups: [
      {
        groupName: 'GROUP A',
        rows: [
          { rank: 1, teamName: 'West Indies', flag: '🌴', qualifies: true, p: 0, w: 0, l: 0, t: 0, pts: 0, nrr: '+0.00' },
          { rank: 2, teamName: 'Afghanistan', flag: '🇦🇫', qualifies: true, p: 0, w: 0, l: 0, t: 0, pts: 0, nrr: '+0.00' },
          { rank: 3, teamName: 'Pakistan', flag: '🇵🇰', qualifies: false, p: 0, w: 0, l: 0, t: 0, pts: 0, nrr: '+0.00' },
          { rank: 4, teamName: 'New Zealand', flag: '🇳🇿', qualifies: false, p: 0, w: 0, l: 0, t: 0, pts: 0, nrr: '+0.00' },
          { rank: 5, teamName: 'Australia', flag: '🇦🇺', qualifies: false, p: 0, w: 0, l: 0, t: 0, pts: 0, nrr: '+0.00' }
        ]
      },
      {
        groupName: 'GROUP B',
        rows: [
          { rank: 1, teamName: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', qualifies: true, p: 0, w: 0, l: 0, t: 0, pts: 0, nrr: '+0.00' },
          { rank: 2, teamName: 'South Africa', flag: '🇿🇦', qualifies: true, p: 0, w: 0, l: 0, t: 0, pts: 0, nrr: '+0.00' },
          { rank: 3, teamName: 'Sri Lanka', flag: '🇱🇰', qualifies: false, p: 0, w: 0, l: 0, t: 0, pts: 0, nrr: '+0.00' },
          { rank: 4, teamName: 'India', flag: '🇮🇳', qualifies: false, p: 0, w: 0, l: 0, t: 0, pts: 0, nrr: '+0.00' },
          { rank: 5, teamName: 'Bangladesh', flag: '🇧🇩', qualifies: false, p: 0, w: 0, l: 0, t: 0, pts: 0, nrr: '+0.00' }
        ]
      }
    ],
    mostRuns: [],
    mostWickets: [],
    records: [
      { title: 'Most MOTM', subtitle: 'No leader yet', value: '—' },
      { title: 'Most Fours', subtitle: 'No leader yet', value: '—' },
      { title: 'Most Sixes', subtitle: 'No leader yet', value: '—' },
      { title: 'Most Fifties', subtitle: 'No leader yet', value: '—' },
      { title: 'Most Hundreds', subtitle: 'No leader yet', value: '—' },
      { title: 'Highest Score', subtitle: 'No leader yet', value: '—' },
      { title: 'Most Catches', subtitle: 'No leader yet', value: '—' },
      { title: 'Most Dismissals', subtitle: 'No leader yet', value: '—' },
      { title: 'Most Maidens', subtitle: 'No leader yet', value: '—' },
      { title: 'Most Dots', subtitle: 'No leader yet', value: '—' },
      { title: 'Best Figures', subtitle: 'No leader yet', value: '—' }
    ],
    matches: [
      { id: 'wc_1', dateLabel: '25 Sep', matchLabel: 'T20I Group Stage', homeShort: 'AFG', awayShort: 'AUS', homeFull: 'Afghanistan', awayFull: 'Australia', completed: false },
      { id: 'wc_2', dateLabel: '26 Sep', matchLabel: 'T20I Group Stage', homeShort: 'PAK', awayShort: 'NZ', homeFull: 'Pakistan', awayFull: 'New Zealand', completed: false },
      { id: 'wc_3', dateLabel: '27 Sep', matchLabel: 'T20I Group Stage', homeShort: 'SA', awayShort: 'BAN', homeFull: 'South Africa', awayFull: 'Bangladesh', completed: false },
      { id: 'wc_4', dateLabel: '28 Sep', matchLabel: 'T20I Group Stage', homeShort: 'SL', awayShort: 'IND', homeFull: 'Sri Lanka', awayFull: 'India', completed: false },
      { id: 'wc_5', dateLabel: '29 Sep', matchLabel: 'T20I Group Stage', homeShort: 'WI', awayShort: 'AUS', homeFull: 'West Indies', awayFull: 'Australia', completed: false },
      { id: 'wc_6', dateLabel: '30 Sep', matchLabel: 'T20I Group Stage', homeShort: 'AFG', awayShort: 'PAK', homeFull: 'Afghanistan', awayFull: 'Pakistan', completed: false },
      { id: 'wc_7', dateLabel: '1 Oct', matchLabel: 'T20I Group Stage', homeShort: 'ENG', awayShort: 'BAN', homeFull: 'England', awayFull: 'Bangladesh', completed: false },
      { id: 'wc_8', dateLabel: '2 Oct', matchLabel: 'T20I Group Stage', homeShort: 'SA', awayShort: 'SL', homeFull: 'South Africa', awayFull: 'Sri Lanka', completed: false },
      { id: 'wc_9', dateLabel: '3 Oct', matchLabel: 'T20I Group Stage', homeShort: 'WI', awayShort: 'NZ', homeFull: 'West Indies', awayFull: 'New Zealand', completed: false },
      { id: 'wc_10', dateLabel: '4 Oct', matchLabel: 'T20I Group Stage', homeShort: 'PAK', awayShort: 'AUS', homeFull: 'Pakistan', awayFull: 'Australia', completed: false },
      { id: 'wc_11', dateLabel: '5 Oct', matchLabel: 'T20I Group Stage', homeShort: 'ENG', awayShort: 'IND', homeFull: 'England', awayFull: 'India', completed: false },
      { id: 'wc_12', dateLabel: '6 Oct', matchLabel: 'T20I Group Stage', homeShort: 'SL', awayShort: 'BAN', homeFull: 'Sri Lanka', awayFull: 'Bangladesh', completed: false },
      { id: 'wc_13', dateLabel: '7 Oct', matchLabel: 'T20I Group Stage', homeShort: 'WI', awayShort: 'PAK', homeFull: 'West Indies', awayFull: 'Pakistan', completed: false },
      { id: 'wc_14', dateLabel: '8 Oct', matchLabel: 'T20I Group Stage', homeShort: 'AFG', awayShort: 'NZ', homeFull: 'Afghanistan', awayFull: 'New Zealand', completed: false },
      { id: 'wc_15', dateLabel: '9 Oct', matchLabel: 'T20I Group Stage', homeShort: 'ENG', awayShort: 'SL', homeFull: 'England', awayFull: 'Sri Lanka', completed: false },
      { id: 'wc_16', dateLabel: '10 Oct', matchLabel: 'T20I Group Stage', homeShort: 'SA', awayShort: 'IND', homeFull: 'South Africa', awayFull: 'India', completed: false },
      { id: 'wc_17', dateLabel: '11 Oct', matchLabel: 'T20I Group Stage', homeShort: 'WI', awayShort: 'AFG', homeFull: 'West Indies', awayFull: 'Afghanistan', completed: false },
      { id: 'wc_18', dateLabel: '12 Oct', matchLabel: 'T20I Group Stage', homeShort: 'NZ', awayShort: 'AUS', homeFull: 'New Zealand', awayFull: 'Australia', completed: false },
      { id: 'wc_19', dateLabel: '13 Oct', matchLabel: 'T20I Group Stage', homeShort: 'ENG', awayShort: 'SA', homeFull: 'England', awayFull: 'South Africa', completed: false },
      { id: 'wc_20', dateLabel: '14 Oct', matchLabel: 'T20I Group Stage', homeShort: 'IND', awayShort: 'BAN', homeFull: 'India', awayFull: 'Bangladesh', completed: false },
      { id: 'wc_sf1', dateLabel: '17 Oct', matchLabel: 'T20I Semi-final', homeShort: 'TBD', awayShort: 'TBD', homeFull: 'TBD', awayFull: 'TBD', completed: false },
      { id: 'wc_sf2', dateLabel: '18 Oct', matchLabel: 'T20I Semi-final', homeShort: 'TBD', awayShort: 'TBD', homeFull: 'TBD', awayFull: 'TBD', completed: false },
      { id: 'wc_final', dateLabel: '21 Oct', matchLabel: 'T20I Final', homeShort: 'TBD', awayShort: 'TBD', homeFull: 'TBD', awayFull: 'TBD', completed: false }
    ]
  },

  // 19. South Africa tour of Australia
  {
    id: 'tour_sa_aus_2026',
    title: 'South Africa tour of Australia',
    subtitle: '3 T20Is · 26 Oct – 30 Oct · Australia',
    formatLabel: 'T20I',
    hostFlag: '🇦🇺',
    type: 'bilateral',
    hasArrow: true,
    hostName: 'Australia',
    awayName: 'South Africa',
    awayFlag: '🇿🇦',
    homeWins: 0,
    awayWins: 0,
    seriesStatusText: '3 T20I series · 0 of 3 played',
    seriesCompleted: false,
    mostRuns: [],
    mostWickets: [],
    matches: [
      { id: 'aus_sa_1', dateLabel: '26 Oct', matchLabel: '1st T20I', homeShort: 'AUS', awayShort: 'SA', homeFull: 'Australia', awayFull: 'South Africa', completed: false },
      { id: 'aus_sa_2', dateLabel: '28 Oct', matchLabel: '2nd T20I', homeShort: 'AUS', awayShort: 'SA', homeFull: 'Australia', awayFull: 'South Africa', completed: false },
      { id: 'aus_sa_3', dateLabel: '30 Oct', matchLabel: '3rd T20I', homeShort: 'AUS', awayShort: 'SA', homeFull: 'Australia', awayFull: 'South Africa', completed: false }
    ]
  },

  // 20. New Zealand tour of Bangladesh
  {
    id: 'tour_nz_ban_2026',
    title: 'New Zealand tour of Bangladesh',
    subtitle: '5 T20Is · 25 Oct – 3 Nov · Bangladesh',
    formatLabel: 'T20I',
    hostFlag: '🇧🇩',
    type: 'bilateral',
    hasArrow: true,
    hostName: 'Bangladesh',
    awayName: 'New Zealand',
    awayFlag: '🇳🇿',
    homeWins: 0,
    awayWins: 0,
    seriesStatusText: '5 T20I series · 0 of 5 played',
    seriesCompleted: false,
    mostRuns: [],
    mostWickets: [],
    matches: [
      { id: 'ban_nz_1', dateLabel: '25 Oct', matchLabel: '1st T20I', homeShort: 'BAN', awayShort: 'NZ', homeFull: 'Bangladesh', awayFull: 'New Zealand', completed: false },
      { id: 'ban_nz_2', dateLabel: '28 Oct', matchLabel: '2nd T20I', homeShort: 'BAN', awayShort: 'NZ', homeFull: 'Bangladesh', awayFull: 'New Zealand', completed: false },
      { id: 'ban_nz_3', dateLabel: '30 Oct', matchLabel: '3rd T20I', homeShort: 'BAN', awayShort: 'NZ', homeFull: 'Bangladesh', awayFull: 'New Zealand', completed: false },
      { id: 'ban_nz_4', dateLabel: '1 Nov', matchLabel: '4th T20I', homeShort: 'BAN', awayShort: 'NZ', homeFull: 'Bangladesh', awayFull: 'New Zealand', completed: false },
      { id: 'ban_nz_5', dateLabel: '3 Nov', matchLabel: '5th T20I', homeShort: 'BAN', awayShort: 'NZ', homeFull: 'Bangladesh', awayFull: 'New Zealand', completed: false }
    ]
  },

  // 21. Afghanistan tour of Nepal
  {
    id: 'tour_afg_nep_2026',
    title: 'Afghanistan tour of Nepal',
    subtitle: '3 T20Is · 27 Oct – 31 Oct · Nepal',
    formatLabel: 'T20I',
    hostFlag: '🇳🇵',
    type: 'bilateral',
    hasArrow: true,
    hostName: 'Nepal',
    awayName: 'Afghanistan',
    awayFlag: '🇦🇫',
    homeWins: 0,
    awayWins: 0,
    seriesStatusText: '3 T20I series · 0 of 3 played',
    seriesCompleted: false,
    mostRuns: [],
    mostWickets: [],
    matches: [
      { id: 'nep_afg_1', dateLabel: '27 Oct', matchLabel: '1st T20I', homeShort: 'NEP', awayShort: 'AFG', homeFull: 'Nepal', awayFull: 'Afghanistan', completed: false },
      { id: 'nep_afg_2', dateLabel: '29 Oct', matchLabel: '2nd T20I', homeShort: 'NEP', awayShort: 'AFG', homeFull: 'Nepal', awayFull: 'Afghanistan', completed: false },
      { id: 'nep_afg_3', dateLabel: '31 Oct', matchLabel: '3rd T20I', homeShort: 'NEP', awayShort: 'AFG', homeFull: 'Nepal', awayFull: 'Afghanistan', completed: false }
    ]
  },

  // 22. Champions Trophy 2026
  {
    id: 'tour_ct_2026',
    title: 'Champions Trophy 2026',
    subtitle: 'ODI · 5 Nov – 2 Dec · New Zealand',
    formatLabel: 'ODI',
    hostFlag: '🇳🇿',
    type: 'tournament',
    hasArrow: true,
    knockouts: {
      sf1Date: '28 Nov',
      sf1Team1: 'TBD',
      sf1Team2: 'TBD',
      sf2Date: '29 Nov',
      sf2Team1: 'TBD',
      sf2Team2: 'TBD',
      finalDate: '2 Dec',
      finalTeam1: 'TBD',
      finalTeam2: 'TBD'
    },
    groups: [
      {
        groupName: 'GROUP A',
        rows: [
          { rank: 1, teamName: 'New Zealand', flag: '🇳🇿', qualifies: true, p: 0, w: 0, l: 0, t: 0, pts: 0, nrr: '+0.00' },
          { rank: 2, teamName: 'Australia', flag: '🇦🇺', qualifies: true, p: 0, w: 0, l: 0, t: 0, pts: 0, nrr: '+0.00' },
          { rank: 3, teamName: 'India', flag: '🇮🇳', qualifies: false, p: 0, w: 0, l: 0, t: 0, pts: 0, nrr: '+0.00' },
          { rank: 4, teamName: 'Sri Lanka', flag: '🇱🇰', qualifies: false, p: 0, w: 0, l: 0, t: 0, pts: 0, nrr: '+0.00' }
        ]
      },
      {
        groupName: 'GROUP B',
        rows: [
          { rank: 1, teamName: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', qualifies: true, p: 0, w: 0, l: 0, t: 0, pts: 0, nrr: '+0.00' },
          { rank: 2, teamName: 'South Africa', flag: '🇿🇦', qualifies: true, p: 0, w: 0, l: 0, t: 0, pts: 0, nrr: '+0.00' },
          { rank: 3, teamName: 'Afghanistan', flag: '🇦🇫', qualifies: false, p: 0, w: 0, l: 0, t: 0, pts: 0, nrr: '+0.00' },
          { rank: 4, teamName: 'West Indies', flag: '🌴', qualifies: false, p: 0, w: 0, l: 0, t: 0, pts: 0, nrr: '+0.00' }
        ]
      }
    ],
    mostRuns: [],
    mostWickets: [],
    records: [
      { title: 'Most MOTM', subtitle: 'No leader yet', value: '—' },
      { title: 'Most Fours', subtitle: 'No leader yet', value: '—' },
      { title: 'Most Sixes', subtitle: 'No leader yet', value: '—' },
      { title: 'Most Fifties', subtitle: 'No leader yet', value: '—' },
      { title: 'Most Hundreds', subtitle: 'No leader yet', value: '—' },
      { title: 'Highest Score', subtitle: 'No leader yet', value: '—' },
      { title: 'Most Catches', subtitle: 'No leader yet', value: '—' },
      { title: 'Most Dismissals', subtitle: 'No leader yet', value: '—' },
      { title: 'Most Maidens', subtitle: 'No leader yet', value: '—' },
      { title: 'Most Dots', subtitle: 'No leader yet', value: '—' },
      { title: 'Best Figures', subtitle: 'No leader yet', value: '—' }
    ],
    matches: [
      { id: 'ct_1', dateLabel: '5 Nov', matchLabel: 'ODI Group Stage', homeShort: 'AUS', awayShort: 'NZ', homeFull: 'Australia', awayFull: 'New Zealand', completed: false },
      { id: 'ct_2', dateLabel: '6 Nov', matchLabel: 'ODI Group Stage', homeShort: 'AFG', awayShort: 'SA', homeFull: 'Afghanistan', awayFull: 'South Africa', completed: false },
      { id: 'ct_3', dateLabel: '7 Nov', matchLabel: 'ODI Group Stage', homeShort: 'SL', awayShort: 'IND', homeFull: 'Sri Lanka', awayFull: 'India', completed: false },
      { id: 'ct_4', dateLabel: '8 Nov', matchLabel: 'ODI Group Stage', homeShort: 'ENG', awayShort: 'WI', homeFull: 'England', awayFull: 'West Indies', completed: false },
      { id: 'ct_5', dateLabel: '9 Nov', matchLabel: 'ODI Group Stage', homeShort: 'AUS', awayShort: 'SA', homeFull: 'Australia', awayFull: 'South Africa', completed: false },
      { id: 'ct_6', dateLabel: '10 Nov', matchLabel: 'ODI Group Stage', homeShort: 'AFG', awayShort: 'NZ', homeFull: 'Afghanistan', awayFull: 'New Zealand', completed: false },
      { id: 'ct_7', dateLabel: '11 Nov', matchLabel: 'ODI Group Stage', homeShort: 'SL', awayShort: 'IND', homeFull: 'Sri Lanka', awayFull: 'India', completed: false },
      { id: 'ct_8', dateLabel: '12 Nov', matchLabel: 'ODI Group Stage', homeShort: 'ENG', awayShort: 'WI', homeFull: 'England', awayFull: 'West Indies', completed: false },
      { id: 'ct_9', dateLabel: '13 Nov', matchLabel: 'ODI Group Stage', homeShort: 'AUS', awayShort: 'AFG', homeFull: 'Australia', awayFull: 'Afghanistan', completed: false },
      { id: 'ct_10', dateLabel: '14 Nov', matchLabel: 'ODI Group Stage', homeShort: 'SA', awayShort: 'NZ', homeFull: 'South Africa', awayFull: 'New Zealand', completed: false },
      { id: 'ct_11', dateLabel: '15 Nov', matchLabel: 'ODI Group Stage', homeShort: 'SL', awayShort: 'ENG', homeFull: 'Sri Lanka', awayFull: 'England', completed: false }
    ]
  }
];

// ============================================================================
// MAIN COMPONENT: SEASON SCHEDULE MODAL + SUB-SCREENS + SCORECARD SHEET
// ============================================================================

interface SeasonScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  userTeam: Team;
  teams: Team[];
  players: Player[];
  leagueName?: string;
}

export const SeasonScheduleModal: React.FC<SeasonScheduleModalProps> = ({
  isOpen,
  onClose,
  userTeam
}) => {
  const { leagues = [], coachProfile, players = [], completedMatchesHistory = [] } = useGame();
  const calendarDays = leagues[0]?.calendarDates || coachProfile?.calendarDays || [];
  const currentDayIndex = leagues[0]?.currentDateIndex ?? coachProfile?.currentDateIndex ?? 0;
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [selectedMatchScorecard, setSelectedMatchScorecard] = useState<ScheduleMatchItem | null>(null);
  const [bookmarkedMatches, setBookmarkedMatches] = useState<Record<string, boolean>>({});
  const [shareCopied, setShareCopied] = useState(false);
  const [archiveSearchQuery, setArchiveSearchQuery] = useState('');
  const [h2hOpponentShort, setH2hOpponentShort] = useState<string>('ALL');

  // Total domestic league matches actually completed in this save slot
  const totalLeagueMatchesCompleted = useMemo(() => {
    const standings = leagues[0]?.standings || [];
    const totalTeamGames = standings.reduce((sum, r) => sum + r.played, 0);
    return Math.floor(totalTeamGames / 2);
  }, [leagues]);

  // Build the 74 IPL fixtures dynamically based on actual matches completed in this career
  const iplFixtures: ScheduleMatchItem[] = useMemo(() => {
    const completedCalFixtures = calendarDays.filter(
      d => d.eventType === 'match' && d.matchFixture?.completed && !d.matchFixture?.isInternational
    );

    return IPL_2026_RAW_FIXTURES.map((raw, idx) => {
      const isCompletedInCareer = idx < totalLeagueMatchesCompleted;

      if (!isCompletedInCareer) {
        return {
          id: raw.id,
          dateLabel: raw.date,
          homeShort: raw.home,
          awayShort: raw.away,
          homeFull: ROSTER_NAMES_BY_TEAM[raw.home]?.fullName || raw.home,
          awayFull: ROSTER_NAMES_BY_TEAM[raw.away]?.fullName || raw.away,
          completed: false,
          abandoned: false
        };
      }

      if (raw.abandoned) {
        return {
          id: raw.id,
          dateLabel: raw.date,
          homeShort: raw.home,
          awayShort: raw.away,
          homeFull: ROSTER_NAMES_BY_TEAM[raw.home]?.fullName || raw.home,
          awayFull: ROSTER_NAMES_BY_TEAM[raw.away]?.fullName || raw.away,
          completed: false,
          abandoned: true,
          resultShort: 'Match abandoned: persistent rain...'
        };
      }

      const calMatch = completedCalFixtures[idx]?.matchFixture;
      const secondWon = raw.secondRuns > raw.firstRuns;
      const winShort = secondWon ? raw.secondBat : raw.firstBat;
      const winRuns = secondWon ? raw.secondRuns : raw.firstRuns;
      const winWkts = secondWon ? raw.secondWkts : raw.firstWkts;
      const loseShort = secondWon ? raw.firstBat : raw.secondBat;
      const loseRuns = secondWon ? raw.firstRuns : raw.secondRuns;
      const loseWkts = secondWon ? raw.firstWkts : raw.secondWkts;

      const fullText = calMatch?.resultSummary || `${winShort} ${winRuns}/${winWkts} beat ${loseShort} ${loseRuns}/${loseWkts} ${raw.margin}`;
      const shortText = fullText.length > 34 ? `${fullText.slice(0, 33)}...` : fullText;

      const sc = buildDetailedScorecard(
        raw.id,
        raw.firstBat,
        raw.firstRuns,
        raw.firstWkts,
        '20.0',
        raw.secondBat,
        raw.secondRuns,
        raw.secondWkts,
        secondWon ? '18.4' : '20.0',
        raw.potm
      );

      return {
        id: raw.id,
        dateLabel: raw.date,
        homeShort: raw.home,
        awayShort: raw.away,
        homeFull: ROSTER_NAMES_BY_TEAM[raw.home]?.fullName || raw.home,
        awayFull: ROSTER_NAMES_BY_TEAM[raw.away]?.fullName || raw.away,
        completed: true,
        resultShort: shortText,
        resultFull: fullText,
        winnerShort: winShort,
        potm: raw.potm,
        innings1: sc.innings1,
        innings2: sc.innings2
      };
    });
  }, [totalLeagueMatchesCompleted, calendarDays]);

  // Dynamically compute International Series & Tournaments based on career progress and real player stats
  const dynamicSeriesList: IntlSeriesOrTournament[] = useMemo(() => {
    const completedIntlDays = calendarDays.filter(
      d => d.matchFixture?.isInternational && d.matchFixture?.completed
    ).length;
    const careerStartedPlaying = currentDayIndex > 3 || totalLeagueMatchesCompleted > 0 || completedIntlDays > 0;

    return INTERNATIONAL_SERIES_AND_TOURNAMENTS.map(series => {
      // Determine how many matches in this series are completed based on calendar progression
      const isAprilSeries = series.id === 'tour_eng_ban_2026';
      const isMaySeries = series.id === 'tour_usa_tri_2026';

      const seriesMatchesCompletedCount = !careerStartedPlaying
        ? 0
        : isAprilSeries
        ? Math.min(series.matches.length, Math.floor(currentDayIndex / 4))
        : isMaySeries
        ? Math.min(series.matches.length, Math.max(0, Math.floor((currentDayIndex - 25) / 4)))
        : 0;

      const updatedMatches = series.matches.map((m, idx) => {
        if (idx >= seriesMatchesCompletedCount) {
          return {
            ...m,
            completed: false,
            resultShort: undefined,
            resultFull: undefined,
            winnerShort: undefined,
            potm: undefined,
            innings1: undefined,
            innings2: undefined
          };
        }
        return m;
      });

      const allDone = seriesMatchesCompletedCount >= series.matches.length && series.matches.length > 0;

      // Dynamically compute Most Runs & Most Wickets from live players belonging to participating nations
      const seriesNations = new Set<string>();
      if (series.hostName) seriesNations.add(series.hostName.toLowerCase());
      if (series.awayName) seriesNations.add(series.awayName.toLowerCase());
      series.groups?.forEach(g => g.rows.forEach(r => seriesNations.add(r.teamName.toLowerCase())));

      const flagForCountry = (country?: string) => {
        const c = (country || '').toLowerCase();
        if (c.includes('england')) return '🏴󠁧󠁢󠁥󠁮󠁧󠁿';
        if (c.includes('bangladesh')) return '🇧🇩';
        if (c.includes('india')) return '🇮🇳';
        if (c.includes('australia')) return '🇦🇺';
        if (c.includes('pakistan')) return '🇵🇰';
        if (c.includes('south africa')) return '🇿🇦';
        if (c.includes('new zealand')) return '🇳🇿';
        if (c.includes('sri lanka')) return '🇱🇰';
        if (c.includes('afghanistan')) return '🇦🇫';
        if (c.includes('west indies')) return '🌴';
        if (c.includes('usa')) return '🇺🇸';
        if (c.includes('nepal')) return '🇳🇵';
        return '🏏';
      };

      const eligiblePlayers = seriesMatchesCompletedCount > 0
        ? players.filter(p => p.country && seriesNations.has(p.country.toLowerCase()) && p.stats.matches > 0)
        : [];

      const dynamicMostRuns: SeriesMostRunsRow[] = [...eligiblePlayers]
        .filter(p => p.stats.runs > 0)
        .sort((a, b) => b.stats.runs - a.stats.runs)
        .slice(0, 10)
        .map((p, i) => ({
          rank: i + 1,
          name: p.name,
          flag: flagForCountry(p.country),
          matches: p.stats.matches,
          innings: p.stats.matches,
          runs: p.stats.runs,
          avg: p.stats.average.toFixed(1),
          sr: p.stats.strikeRate.toFixed(1),
          hs: `${p.stats.highestScore || p.stats.runs}`
        }));

      const dynamicMostWickets: SeriesMostWicketsRow[] = [...eligiblePlayers]
        .filter(p => p.stats.wickets > 0)
        .sort((a, b) => b.stats.wickets - a.stats.wickets)
        .slice(0, 10)
        .map((p, i) => ({
          rank: i + 1,
          name: p.name,
          flag: flagForCountry(p.country),
          matches: p.stats.matches,
          innings: p.stats.matches,
          wickets: p.stats.wickets,
          avg: (p.stats.runsConceded && p.stats.wickets ? (p.stats.runsConceded / p.stats.wickets) : 18.5).toFixed(1),
          econ: p.stats.economy.toFixed(2),
          bbi: p.stats.bestBowling || `${p.stats.wickets}/${p.stats.runsConceded || 24}`
        }));

      let homeWins = 0;
      let awayWins = 0;
      updatedMatches.forEach(m => {
        if (m.completed) {
          if (m.winnerShort === m.homeShort) homeWins++;
          else awayWins++;
        }
      });

      const updatedGroups = series.groups?.map(g => ({
        ...g,
        rows: g.rows.map((r, idx) =>
          seriesMatchesCompletedCount === 0
            ? { ...r, rank: idx + 1, p: 0, w: 0, l: 0, t: 0, pts: 0, nrr: '+0.00' }
            : r
        )
      }));

      return {
        ...series,
        matches: updatedMatches,
        homeWins,
        awayWins,
        winnerBanner: allDone ? series.winnerBanner : undefined,
        seriesCompleted: allDone,
        seriesStatusText: allDone
          ? series.seriesStatusText
          : `${series.matches.length}-match series · ${seriesMatchesCompletedCount} of ${series.matches.length} played`,
        mostRuns: dynamicMostRuns,
        mostWickets: dynamicMostWickets,
        groups: updatedGroups
      };
    });
  }, [calendarDays, currentDayIndex, totalLeagueMatchesCompleted, players]);

  const selectedSeries = useMemo(
    () => dynamicSeriesList.find(s => s.id === selectedSeriesId) || null,
    [dynamicSeriesList, selectedSeriesId]
  );

  if (!isOpen) return null;

  const userShort = (userTeam.shortName || 'KOL').toUpperCase();

  // Render helper for "HOME v AWAY" highlighting user's team in gold
  const renderMatchupText = (homeCode: string, awayCode: string) => {
    const isHomeUser = homeCode.toUpperCase() === userShort;
    const isAwayUser = awayCode.toUpperCase() === userShort;
    return (
      <div className="flex items-center gap-1.5 text-[13px] tracking-tight">
        <span className={isHomeUser ? 'text-[#f5b82e] font-extrabold' : 'text-white font-bold'}>
          {homeCode}
        </span>
        <span className="text-slate-500 font-normal text-xs">v</span>
        <span className={isAwayUser ? 'text-[#f5b82e] font-extrabold' : 'text-white font-bold'}>
          {awayCode}
        </span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0b0e14]/95 backdrop-blur-md text-slate-100 flex flex-col max-w-6xl mx-auto w-full select-none overflow-hidden border-x border-slate-800/80 shadow-2xl">
      {/* ================================================================== */}
      {/* TOP STICKY BAR (Back Arrow + Screen Title)                         */}
      {/* ================================================================== */}
      <div className="px-6 py-4 bg-[#0b0e14] border-b border-slate-800/60 flex items-center gap-4 shrink-0 z-20">
        <button
          onClick={() => {
            sound.playTap();
            if (selectedSeries) {
              setSelectedSeriesId(null);
            } else {
              onClose();
            }
          }}
          className="p-1.5 -ml-1 rounded-lg text-slate-200 hover:text-white hover:bg-slate-800 active:scale-95 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-white tracking-tight truncate">
          {selectedSeries
            ? selectedSeries.type === 'bilateral'
              ? `${selectedSeries.title} · ${selectedSeries.formatLabel}`
              : selectedSeries.title
            : 'Season Schedule'}
        </h1>
      </div>

      {/* ================================================================== */}
      {/* VIEW 1: BILATERAL SERIES OR TOURNAMENT DRILL-DOWN SCREEN           */}
      {/* ================================================================== */}
      {selectedSeries ? (
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 pb-16">
          {selectedSeries.type === 'bilateral' ? (
            <>
              {/* BILATERAL SERIES SCOREBOARD BANNER CARD */}
              <div className="bg-[#151b26] border border-slate-800/80 rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between px-8 py-2 max-w-2xl mx-auto">
                  <div className="flex flex-col items-center gap-2 w-28 text-center">
                    <NationFlagBadge flag={selectedSeries.hostFlag} country={selectedSeries.hostName} size="lg" />
                    <span className="text-sm font-bold text-white">{selectedSeries.hostName}</span>
                  </div>

                  <div className="text-4xl font-extrabold text-white tracking-wider font-mono">
                    {selectedSeries.homeWins ?? 0} – {selectedSeries.awayWins ?? 0}
                  </div>

                  <div className="flex flex-col items-center gap-2 w-28 text-center">
                    <NationFlagBadge flag={selectedSeries.awayFlag} country={selectedSeries.awayName} size="lg" />
                    <span className="text-sm font-bold text-white">{selectedSeries.awayName}</span>
                  </div>
                </div>

                <div
                  className={`mt-4 py-2 px-3 rounded-lg text-center text-xs font-bold tracking-wider ${
                    selectedSeries.seriesCompleted
                      ? 'bg-[#2a2417] text-[#f5b82e] uppercase'
                      : 'bg-[#1c2331] text-slate-400'
                  }`}
                >
                  {selectedSeries.seriesStatusText}
                </div>
              </div>

              {/* MATCHES LIST IN SERIES */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 px-0.5">
                  MATCHES
                </h3>
                <div className="bg-[#151b26] border border-slate-800/80 rounded-2xl divide-y divide-slate-800/70 overflow-hidden">
                  {selectedSeries.matches.map((m) => (
                    <button
                      key={m.id}
                      disabled={!m.completed}
                      onClick={() => {
                        if (m.completed) {
                          sound.playTap();
                          setSelectedMatchScorecard(m);
                        }
                      }}
                      className={`w-full px-5 py-3.5 flex items-center justify-between text-left transition-colors ${
                        m.completed ? 'hover:bg-slate-800/40 active:bg-slate-800/70 cursor-pointer' : 'cursor-default'
                      }`}
                    >
                      <div className="shrink-0 pr-3">
                        <div className="text-xs font-bold text-white">{m.matchLabel}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{m.dateLabel}</div>
                      </div>

                      {m.completed ? (
                        <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                          <NationFlagBadge flag={m.winnerFlag} size="sm" />
                          <span className="text-xs text-slate-300 truncate">
                            {m.resultFull || m.resultShort}
                          </span>
                          <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">Upcoming</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* TOURNAMENT VIEW */
            <>
              {/* KNOCKOUTS BRACKET */}
              {selectedSeries.knockouts && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 px-0.5">
                    KNOCKOUTS
                  </h3>
                  <div className="bg-[#151b26] border border-slate-800/80 rounded-2xl p-4 overflow-x-auto">
                    <div className="flex items-center gap-4 min-w-[320px]">
                      {/* Left Column: SF1 & SF2 */}
                      <div className="flex-1 space-y-3">
                        {/* SF1 */}
                        <div className="bg-[#10151f] border border-slate-800 rounded-xl p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold text-[10px]">
                              SF1
                            </span>
                            <span className="text-[10px] text-slate-400">{selectedSeries.knockouts.sf1Date}</span>
                          </div>
                          <div className="space-y-1.5 pt-0.5">
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              <span className="w-5 h-3.5 rounded bg-slate-800 inline-flex items-center justify-center text-[10px]">—</span>
                              <span>{selectedSeries.knockouts.sf1Team1}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              <span className="w-5 h-3.5 rounded bg-slate-800 inline-flex items-center justify-center text-[10px]">—</span>
                              <span>{selectedSeries.knockouts.sf1Team2}</span>
                            </div>
                          </div>
                          <div className="text-[10px] italic text-slate-500 pt-0.5">
                            Determined by earlier results.
                          </div>
                        </div>

                        {/* SF2 */}
                        <div className="bg-[#10151f] border border-slate-800 rounded-xl p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold text-[10px]">
                              SF2
                            </span>
                            <span className="text-[10px] text-slate-400">{selectedSeries.knockouts.sf2Date}</span>
                          </div>
                          <div className="space-y-1.5 pt-0.5">
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              <span className="w-5 h-3.5 rounded bg-slate-800 inline-flex items-center justify-center text-[10px]">—</span>
                              <span>{selectedSeries.knockouts.sf2Team1}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              <span className="w-5 h-3.5 rounded bg-slate-800 inline-flex items-center justify-center text-[10px]">—</span>
                              <span>{selectedSeries.knockouts.sf2Team2}</span>
                            </div>
                          </div>
                          <div className="text-[10px] italic text-slate-500 pt-0.5">
                            Determined by earlier results.
                          </div>
                        </div>
                      </div>

                      {/* Bracket Connector Lines */}
                      <div className="w-4 h-36 flex flex-col justify-between items-center py-6 shrink-0">
                        <div className="w-full h-1/2 border-t border-r border-slate-700/80 rounded-tr" />
                        <div className="w-full h-1/2 border-b border-r border-slate-700/80 rounded-br" />
                      </div>

                      {/* Right Column: FINAL */}
                      <div className="w-48 shrink-0 bg-[#10151f] border border-slate-800 rounded-xl p-3 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Trophy className="w-3.5 h-3.5 text-[#f5b82e]" />
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-[#f5b82e] font-bold text-[10px]">
                            FINAL
                          </span>
                        </div>
                        <div className="space-y-1.5 pt-0.5">
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span className="w-5 h-3.5 rounded bg-slate-800 inline-flex items-center justify-center text-[10px]">—</span>
                            <span>{selectedSeries.knockouts.finalTeam1}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span className="w-5 h-3.5 rounded bg-slate-800 inline-flex items-center justify-center text-[10px]">—</span>
                            <span>{selectedSeries.knockouts.finalTeam2}</span>
                          </div>
                        </div>
                        <div className="text-[10px] italic text-slate-500 truncate pt-0.5">
                          Determined by earlier results.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* GROUP STANDINGS TABLES (GROUP A, GROUP B) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {selectedSeries.groups?.map((grp) => (
                  <div key={grp.groupName}>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 px-0.5">
                      {grp.groupName}
                    </h3>
                    <div className="bg-[#151b26] border border-slate-800/80 rounded-2xl overflow-hidden">
                      <div className="grid grid-cols-12 px-3 py-2.5 border-b border-slate-800/80 text-[10px] font-bold uppercase text-slate-500">
                        <div className="col-span-6">TEAM</div>
                        <div className="col-span-1 text-center">P</div>
                        <div className="col-span-1 text-center">W</div>
                        <div className="col-span-1 text-center">L</div>
                        <div className="col-span-1 text-center">T</div>
                        <div className="col-span-1 text-center">PTS</div>
                        <div className="col-span-1 text-right">NRR</div>
                      </div>
                      <div className="divide-y divide-slate-800/50">
                        {grp.rows.map((row) => (
                          <div key={row.teamName} className="grid grid-cols-12 items-center px-3 py-3 text-xs">
                            <div className="col-span-6 flex items-center gap-2.5 min-w-0">
                              <span className={`w-1 h-4 rounded-full shrink-0 ${row.qualifies ? 'bg-[#f5b82e]' : 'bg-transparent'}`} />
                              <span className="text-slate-400 w-3 text-center">{row.rank}</span>
                              <NationFlagBadge flag={row.flag} country={row.teamName} size="sm" />
                              <span className="font-semibold text-white truncate">{row.teamName}</span>
                            </div>
                            <div className="col-span-1 text-center text-slate-400">{row.p}</div>
                            <div className="col-span-1 text-center text-slate-400">{row.w}</div>
                            <div className="col-span-1 text-center text-slate-400">{row.l}</div>
                            <div className="col-span-1 text-center text-slate-400">{row.t}</div>
                            <div className="col-span-1 text-center font-bold text-white">{row.pts}</div>
                            <div className="col-span-1 text-right text-emerald-400 font-mono text-[11px]">{row.nrr}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* MOST RUNS SECTION */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 px-0.5">
                MOST RUNS
              </h3>
              {selectedSeries.mostRuns.length === 0 ? (
                <div className="bg-[#151b26] border border-slate-800/80 rounded-2xl py-6 text-center text-xs text-slate-500">
                  No runs scored yet in this series.
                </div>
              ) : (
                <div className="bg-[#151b26] border border-slate-800/80 rounded-2xl overflow-hidden">
                  <div className="grid grid-cols-12 px-3 py-2.5 border-b border-slate-800/80 text-[10px] font-bold uppercase text-slate-500">
                    <div className="col-span-5">PLAYER</div>
                    <div className="col-span-1 text-center">M</div>
                    <div className="col-span-1 text-center">INN</div>
                    <div className="col-span-1 text-center">R</div>
                    <div className="col-span-2 text-right">AVG</div>
                    <div className="col-span-1 text-right">SR</div>
                    <div className="col-span-1 text-right">HS</div>
                  </div>
                  <div className="divide-y divide-slate-800/50">
                    {selectedSeries.mostRuns.map((r) => (
                      <div key={r.rank} className="grid grid-cols-12 items-center px-3 py-2.5 text-xs">
                        <div className="col-span-5 flex items-center gap-2 min-w-0">
                          <span className="text-slate-500 w-4 text-[11px]">{r.rank}</span>
                          <NationFlagBadge flag={r.flag} size="sm" />
                          <span className="font-bold text-white truncate">{r.name}</span>
                        </div>
                        <div className="col-span-1 text-center text-slate-400">{r.matches}</div>
                        <div className="col-span-1 text-center text-slate-400">{r.innings}</div>
                        <div className="col-span-1 text-center font-bold text-white">{r.runs}</div>
                        <div className="col-span-2 text-right text-slate-400">{r.avg}</div>
                        <div className="col-span-1 text-right text-slate-400 text-[11px]">{r.sr}</div>
                        <div className="col-span-1 text-right text-slate-400">{r.hs}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* MOST WICKETS SECTION */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 px-0.5">
                MOST WICKETS
              </h3>
              {selectedSeries.mostWickets.length === 0 ? (
                <div className="bg-[#151b26] border border-slate-800/80 rounded-2xl py-6 text-center text-xs text-slate-500">
                  No wickets taken yet in this series.
                </div>
              ) : (
                <div className="bg-[#151b26] border border-slate-800/80 rounded-2xl overflow-hidden">
                  <div className="grid grid-cols-12 px-3 py-2.5 border-b border-slate-800/80 text-[10px] font-bold uppercase text-slate-500">
                    <div className="col-span-5">PLAYER</div>
                    <div className="col-span-1 text-center">M</div>
                    <div className="col-span-1 text-center">INN</div>
                    <div className="col-span-1 text-center">W</div>
                    <div className="col-span-1 text-right">AVG</div>
                    <div className="col-span-2 text-right">ECON</div>
                    <div className="col-span-1 text-right">BBI</div>
                  </div>
                  <div className="divide-y divide-slate-800/50">
                    {selectedSeries.mostWickets.map((w) => (
                      <div key={w.rank} className="grid grid-cols-12 items-center px-3 py-2.5 text-xs">
                        <div className="col-span-5 flex items-center gap-2 min-w-0">
                          <span className="text-slate-500 w-4 text-[11px]">{w.rank}</span>
                          <NationFlagBadge flag={w.flag} size="sm" />
                          <span className="font-bold text-white truncate">{w.name}</span>
                        </div>
                        <div className="col-span-1 text-center text-slate-400">{w.matches}</div>
                        <div className="col-span-1 text-center text-slate-400">{w.innings}</div>
                        <div className="col-span-1 text-center font-bold text-white">{w.wickets}</div>
                        <div className="col-span-1 text-right text-slate-400">{w.avg}</div>
                        <div className="col-span-2 text-right text-slate-400">{w.econ}</div>
                        <div className="col-span-1 text-right text-slate-400 text-[11px]">{w.bbi}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RECORDS SECTION FOR TOURNAMENTS */}
          {selectedSeries.records && selectedSeries.records.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 px-0.5">
                RECORDS
              </h3>
              <div className="bg-[#151b26] border border-slate-800/80 rounded-2xl divide-y divide-slate-800/60 overflow-hidden grid grid-cols-1 md:grid-cols-2">
                {selectedSeries.records.map((rec, idx) => (
                  <div key={idx} className="px-4 py-3 flex items-center justify-between border-b border-slate-800/40">
                    <div>
                      <div className="text-xs font-bold text-white">{rec.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{rec.subtitle}</div>
                    </div>
                    <span className="text-xs text-slate-500">{rec.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ================================================================== */
        /* VIEW 2: MAIN SEASON SCHEDULE SCROLL LIST (2-COLUMN BROWSER GRID)   */
        /* ================================================================== */
        <div className="flex-1 overflow-y-auto px-6 py-5 pb-16 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* SECTION 1: PREMIER T20 (INDIA) · 2026 (Left 6 Columns on Desktop) */}
          <div className="lg:col-span-6 bg-[#111622] border border-slate-800/80 rounded-2xl p-4">
            <div className="bg-[#151b26] border border-slate-800/80 rounded-2xl p-4 mb-3 flex items-center justify-between">
              <div>
                <div className="text-[15px] font-bold text-white">
                  Premier T20 (India) · {leagues[0]?.seasonYear || 2026}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  74 matches incl. playoffs · {totalLeagueMatchesCompleted} completed ({completedMatchesHistory.length} archived)
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-xs font-bold">
                IPL
              </span>
            </div>

            {/* Searchable Match Archive & Head-to-Head Filter Bar */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={archiveSearchQuery}
                onChange={e => setArchiveSearchQuery(e.target.value)}
                placeholder="Search archive by team, date, or POTM..."
                className="flex-1 min-w-[180px] bg-[#151b26] border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500"
              />
              <select
                value={h2hOpponentShort}
                onChange={e => setH2hOpponentShort(e.target.value)}
                className="bg-[#151b26] border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-amber-300 font-mono font-bold"
              >
                <option value="ALL">All Matchups</option>
                {Object.keys(ROSTER_NAMES_BY_TEAM)
                  .filter(code => code !== userShort)
                  .map(code => (
                    <option key={code} value={code}>
                      H2H: {userShort} v {code}
                    </option>
                  ))}
              </select>
            </div>

            {h2hOpponentShort !== 'ALL' && (() => {
              const h2hMatches = iplFixtures.filter(
                f =>
                  f.completed &&
                  ((f.homeShort === userShort && f.awayShort === h2hOpponentShort) ||
                    (f.homeShort === h2hOpponentShort && f.awayShort === userShort))
              );
              const uWins = h2hMatches.filter(f => f.winnerShort === userShort).length;
              const oWins = h2hMatches.length - uWins;
              return (
                <div className="mb-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs font-mono">
                  <span className="text-amber-300 font-bold">
                    HEAD-TO-HEAD: {userShort} vs {h2hOpponentShort}
                  </span>
                  <span className="text-white font-black">
                    {userShort} {uWins} – {oWins} {h2hOpponentShort} ({h2hMatches.length} played)
                  </span>
                </div>
              );
            })()}

            <div className="divide-y divide-slate-800/50 max-h-[70vh] overflow-y-auto pr-1">
              {iplFixtures
                .filter(m => {
                  if (h2hOpponentShort !== 'ALL') {
                    const isPair =
                      (m.homeShort === userShort && m.awayShort === h2hOpponentShort) ||
                      (m.homeShort === h2hOpponentShort && m.awayShort === userShort);
                    if (!isPair) return false;
                  }
                  if (archiveSearchQuery.trim()) {
                    const q = archiveSearchQuery.toLowerCase();
                    return (
                      m.homeShort.toLowerCase().includes(q) ||
                      m.awayShort.toLowerCase().includes(q) ||
                      m.dateLabel.toLowerCase().includes(q) ||
                      (m.potm || '').toLowerCase().includes(q) ||
                      (m.resultFull || '').toLowerCase().includes(q)
                    );
                  }
                  return true;
                })
                .map((m) => (
                <button
                  key={m.id}
                  disabled={!m.completed}
                  onClick={() => {
                    if (m.completed) {
                      sound.playTap();
                      setSelectedMatchScorecard(m);
                    }
                  }}
                  className={`w-full py-3 px-2 flex items-center justify-between text-left transition-colors ${
                    m.completed ? 'hover:bg-slate-800/30 active:bg-slate-800/60 cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 shrink-0">
                    <span className="text-xs text-slate-400 w-12 shrink-0">{m.dateLabel}</span>
                    {renderMatchupText(m.homeShort, m.awayShort)}
                  </div>

                  <div className="flex items-center gap-1.5 min-w-0 pl-3 justify-end">
                    {m.abandoned ? (
                      <span className="text-xs text-slate-400 truncate max-w-[220px]">
                        {m.resultShort}
                      </span>
                    ) : m.completed ? (
                      <>
                        <span className="text-xs text-slate-400 truncate max-w-[220px]">
                          {m.resultShort}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                      </>
                    ) : (
                      <span className="text-xs text-slate-600 pr-1">Upcoming</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* SECTION 2: ALL INTERNATIONAL TOURS, TRI-SERIES & TOURNAMENTS (Right 6 Columns on Desktop) */}
          <div className="lg:col-span-6 space-y-4 max-h-[78vh] overflow-y-auto pr-1">
            {dynamicSeriesList.map((series) => (
              <div key={series.id} className="bg-[#111622] border border-slate-800/80 rounded-2xl p-3">
                {/* Tour / Tournament Header Card */}
                <button
                  onClick={() => {
                    sound.playTap();
                    setSelectedSeriesId(series.id);
                  }}
                  className="w-full bg-[#151b26] hover:bg-[#1a2230] border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between text-left transition-all active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <NationFlagBadge flag={series.hostFlag} country={series.title} size="md" />
                    <div className="min-w-0">
                      <div className="text-[15px] font-bold text-white truncate">
                        {series.title}
                      </div>
                      <div className="text-xs text-slate-400 truncate mt-0.5">
                        {series.subtitle}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 pl-2">
                    {series.winnerBanner && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-[#f5b82e]">
                        <Trophy className="w-3.5 h-3.5 text-[#f5b82e] fill-current" />
                        {series.winnerBanner}
                      </span>
                    )}
                    {series.hasArrow && (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Individual Match Rows Under Tour */}
                <div className="divide-y divide-slate-800/50 mt-1">
                  {series.matches.map((m) => (
                    <button
                      key={m.id}
                      disabled={!m.completed}
                      onClick={() => {
                        if (m.completed) {
                          sound.playTap();
                          setSelectedMatchScorecard(m);
                        }
                      }}
                      className={`w-full py-2.5 px-2 flex items-center justify-between text-left transition-colors ${
                        m.completed ? 'hover:bg-slate-800/30 active:bg-slate-800/60 cursor-pointer' : 'cursor-default'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs text-slate-400 w-12 shrink-0">{m.dateLabel}</span>
                        <div className="min-w-0">
                          {m.matchLabel && (
                            <div className="text-[10px] text-slate-400 leading-tight">
                              {m.matchLabel}
                            </div>
                          )}
                          <div className="text-[13px] font-bold text-white truncate mt-0.5">
                            {m.homeFull} <span className="text-slate-500 font-normal text-xs">v</span> {m.awayFull}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 pl-2">
                        {m.completed ? (
                          <>
                            <span className="text-xs text-slate-400 truncate max-w-[200px]">
                              {m.resultShort}
                            </span>
                            <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                          </>
                        ) : (
                          <span className="text-xs text-slate-600 pr-1">Upcoming</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* SLIDE-UP FULL MATCH SCORECARD SHEET                                */}
      {/* ================================================================== */}
      {selectedMatchScorecard && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#11161f] border border-slate-800 rounded-3xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Drag Handle */}
            <div className="pt-2.5 pb-1 flex justify-center shrink-0">
              <div className="w-9 h-1 rounded-full bg-slate-700" />
            </div>

            {/* Top Action Row (SCORECARD | EASY ... Bookmark | Share | X) */}
            <div className="px-4 py-2.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-1 rounded bg-[#2b2414] text-[#f5b82e] font-bold text-[11px] uppercase tracking-wider">
                  SCORECARD
                </span>
                <span className="text-emerald-400 font-bold text-[11px] uppercase tracking-wider">
                  EASY
                </span>
              </div>

              <div className="flex items-center gap-4 text-slate-300">
                <button
                  onClick={() => {
                    sound.playTap();
                    setBookmarkedMatches(prev => ({
                      ...prev,
                      [selectedMatchScorecard.id]: !prev[selectedMatchScorecard.id]
                    }));
                  }}
                  className="hover:text-white transition-colors"
                  title="Bookmark Scorecard"
                >
                  <Bookmark
                    className={`w-4 h-4 ${
                      bookmarkedMatches[selectedMatchScorecard.id] ? 'text-[#f5b82e] fill-current' : ''
                    }`}
                  />
                </button>
                <button
                  onClick={() => {
                    sound.playTap();
                    setShareCopied(true);
                    setTimeout(() => setShareCopied(false), 2000);
                  }}
                  className="hover:text-white transition-colors"
                  title="Share Scorecard"
                >
                  {shareCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => {
                    sound.playTap();
                    setSelectedMatchScorecard(null);
                  }}
                  className="hover:text-white transition-colors"
                  title="Close Scorecard"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Match Result Title & Player of the Match */}
            <div className="px-4 pb-3 border-b border-slate-800/80 shrink-0">
              <h2 className="text-[15px] font-bold text-white">
                {selectedMatchScorecard.resultFull || selectedMatchScorecard.resultShort}
              </h2>
              {selectedMatchScorecard.potm && (
                <div className="flex items-center gap-1.5 mt-1 text-xs text-[#f5b82e] font-medium">
                  <Star className="w-3.5 h-3.5 fill-current text-[#f5b82e]" />
                  <span>Player of the Match: {selectedMatchScorecard.potm}</span>
                </div>
              )}
            </div>

            {/* Scrollable Innings 1 & Innings 2 Details */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80 pb-12">
              {[selectedMatchScorecard.innings1, selectedMatchScorecard.innings2]
                .filter((inn): inn is ScorecardInningsData => Boolean(inn))
                .map((inn, innIdx) => (
                  <div key={innIdx} className="p-4 space-y-4">
                    {/* Team Header */}
                    <div className="flex items-center gap-2.5">
                      {inn.teamId ? (
                        <TeamLogo
                          teamId={inn.teamId}
                          shortName={inn.teamShort}
                          name={inn.teamName}
                          size={24}
                          className="rounded-lg"
                        />
                      ) : (
                        <NationFlagBadge flag={inn.flagEmoji} country={inn.teamName} size="md" />
                      )}
                      <span className="text-sm font-bold text-white uppercase tracking-wider">
                        {inn.teamName}
                      </span>
                    </div>

                    {/* BATTER TABLE */}
                    <div>
                      <div className="grid grid-cols-12 pb-2 border-b border-slate-800/80 text-[10px] font-bold uppercase text-slate-500">
                        <div className="col-span-6">BATTER</div>
                        <div className="col-span-1 text-right">R</div>
                        <div className="col-span-1 text-right">B</div>
                        <div className="col-span-1 text-right">4s</div>
                        <div className="col-span-1 text-right">6s</div>
                        <div className="col-span-2 text-right">SR</div>
                      </div>

                      <div className="divide-y divide-slate-800/50">
                        {inn.batters.map((b, bIdx) => (
                          <div key={bIdx} className="grid grid-cols-12 items-center py-2.5 text-xs">
                            <div className="col-span-6 pr-2 min-w-0">
                              <div className="font-bold text-white flex items-center gap-1">
                                <span className="truncate">
                                  {b.name}
                                  {b.isNotOut ? ' *' : ''}
                                </span>
                                {b.impactSubOut && (
                                  <span className="text-rose-500 text-[11px] font-bold">→</span>
                                )}
                                {b.impactSubIn && (
                                  <span className="text-emerald-400 text-[11px] font-bold">→</span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 truncate mt-0.5">
                                {b.dismissal}
                              </div>
                            </div>
                            <div className="col-span-1 text-right font-bold text-white">{b.runs}</div>
                            <div className="col-span-1 text-right text-slate-400">{b.balls}</div>
                            <div className="col-span-1 text-right text-slate-400">{b.fours}</div>
                            <div className="col-span-1 text-right text-slate-400">{b.sixes}</div>
                            <div className="col-span-2 text-right text-slate-400">{b.sr}</div>
                          </div>
                        ))}
                      </div>

                      {/* Did not bat */}
                      {inn.didNotBat.length > 0 && (
                        <div className="pt-2.5 border-t border-slate-800/50 text-[11px] text-slate-500 leading-relaxed">
                          <span>Did not bat: </span>
                          {inn.didNotBat.map((d, dIdx) => (
                            <span key={dIdx}>
                              {d.name}
                              {d.impactSubIn && (
                                <span className="text-emerald-400 font-bold ml-0.5">→</span>
                              )}
                              {dIdx < inn.didNotBat.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* FALL OF WICKETS */}
                    {inn.fallOfWickets.length > 0 && (
                      <div className="pt-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                          FALL OF WICKETS
                        </div>
                        <div className="text-xs leading-relaxed text-slate-400">
                          {inn.fallOfWickets.map((f, fIdx) => (
                            <span key={fIdx}>
                              <span className="font-bold text-white">{f.score}</span>{' '}
                              <span>({f.batter}, {f.over})</span>
                              {fIdx < inn.fallOfWickets.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* PARTNERSHIPS */}
                    {inn.partnerships.length > 0 && (
                      <div className="pt-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                          PARTNERSHIPS
                        </div>
                        <div className="space-y-1.5">
                          {inn.partnerships.map((p, pIdx) => (
                            <div key={pIdx} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-slate-500 w-7 shrink-0 text-[11px]">{p.wicketNum}</span>
                                <span className="text-white font-semibold truncate">
                                  {p.batter1Name} {p.batter1Runs}{' '}
                                  <span className="text-slate-500 mx-0.5">·</span>{' '}
                                  {p.batter2Name} {p.batter2Runs}
                                </span>
                              </div>
                              <div className="shrink-0 pl-2 font-bold text-white">
                                {p.totalRuns}
                                {p.unbroken ? '*' : ''}{' '}
                                <span className="font-normal text-slate-400">({p.totalBalls})</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* BOWLER TABLE */}
                    <div className="pt-2">
                      <div className="grid grid-cols-12 pb-2 border-b border-slate-800/80 text-[10px] font-bold uppercase text-slate-500">
                        <div className="col-span-6">BOWLER</div>
                        <div className="col-span-1 text-right">O</div>
                        <div className="col-span-1 text-right">M</div>
                        <div className="col-span-1 text-right">R</div>
                        <div className="col-span-1 text-right">W</div>
                        <div className="col-span-2 text-right">ECON</div>
                      </div>

                      <div className="divide-y divide-slate-800/50">
                        {inn.bowlers.map((bw, bwIdx) => (
                          <div key={bwIdx} className="grid grid-cols-12 items-center py-2.5 text-xs">
                            <div className="col-span-6 font-bold text-white flex items-center gap-1 truncate pr-2">
                              <span className="truncate">{bw.name}</span>
                              {bw.impactSubIn && (
                                <span className="text-emerald-400 text-[11px] font-bold">→</span>
                              )}
                            </div>
                            <div className="col-span-1 text-right text-slate-400">{bw.overs}</div>
                            <div className="col-span-1 text-right text-slate-400">{bw.maidens}</div>
                            <div className="col-span-1 text-right text-slate-400">{bw.runs}</div>
                            <div className="col-span-1 text-right font-bold text-white">{bw.wickets}</div>
                            <div className="col-span-2 text-right text-slate-400">{bw.econ}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
