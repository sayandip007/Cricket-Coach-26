import fs from 'fs';
import path from 'path';

const content = `import { Player, Team, League, Nation, Achievement, JobOffer, CoachProfile, FielderPosition } from '../types/cricket';
import { CSV_PLAYERS, CSV_TEAM_CAPTAINS, CSV_TEAM_XIS } from './csvPlayers';

export const INITIAL_PLAYERS: Player[] = CSV_PLAYERS;

export const DEFAULT_FIELDERS: FielderPosition[] = [
  { id: 1, name: 'Slip', x: -28, y: -80, isDeep: false },
  { id: 2, name: 'Gully', x: -38, y: -62, isDeep: false },
  { id: 3, name: 'Point', x: -55, y: -15, isDeep: false },
  { id: 4, name: 'Cover', x: -48, y: 28, isDeep: false },
  { id: 5, name: 'Mid-off', x: -22, y: 52, isDeep: false },
  { id: 6, name: 'Mid-on', x: 22, y: 52, isDeep: false },
  { id: 7, name: 'Square Leg', x: 58, y: -5, isDeep: false },
  { id: 8, name: 'Deep Fine Leg', x: 70, y: -70, isDeep: true },
  { id: 9, name: 'Long-on', x: 30, y: 88, isDeep: true }
];

export const INITIAL_DEFAULT_FIELD: FielderPosition[] = DEFAULT_FIELDERS;

export const INITIAL_TEAMS: Team[] = [
  {
    id: 'team_kol',
    name: 'Kolkata Knight Riders',
    shortName: 'KOL',
    city: 'Kolkata',
    leagueId: 'pt20',
    primaryColor: '#3A225D',
    secondaryColor: '#F2A900',
    logoEmoji: '⚔️',
    purseCr: 110.0,
    rtmCards: 3,
    squad: [],
    playingXIIds: CSV_TEAM_XIS['team_kol'] || [],
    captainId: CSV_TEAM_CAPTAINS['team_kol'] || 'p_kkr_ajinkya_rahane',
    isUserTeam: true
  },
  {
    id: 'team_che',
    name: 'Chennai Super Kings',
    shortName: 'CSK',
    city: 'Chennai',
    leagueId: 'pt20',
    primaryColor: '#F9CD05',
    secondaryColor: '#00539F',
    logoEmoji: '🦁',
    purseCr: 105.0,
    rtmCards: 4,
    squad: [],
    playingXIIds: CSV_TEAM_XIS['team_che'] || [],
    captainId: CSV_TEAM_CAPTAINS['team_che'] || 'p_csk_ruturaj_gaikwad',
    isUserTeam: false
  },
  {
    id: 'team_mum',
    name: 'Mumbai Indians',
    shortName: 'MI',
    city: 'Mumbai',
    leagueId: 'pt20',
    primaryColor: '#004BA0',
    secondaryColor: '#D4AF37',
    logoEmoji: '🌀',
    purseCr: 120.0,
    rtmCards: 5,
    squad: [],
    playingXIIds: CSV_TEAM_XIS['team_mum'] || [],
    captainId: CSV_TEAM_CAPTAINS['team_mum'] || 'p_mi_hardik_pandya',
    isUserTeam: false
  },
  {
    id: 'team_blr',
    name: 'Royal Challengers Bengaluru',
    shortName: 'BLR',
    city: 'Bengaluru',
    leagueId: 'pt20',
    primaryColor: '#DA1818',
    secondaryColor: '#000000',
    logoEmoji: '👑',
    purseCr: 98.0,
    rtmCards: 3,
    squad: [],
    playingXIIds: CSV_TEAM_XIS['team_blr'] || [],
    captainId: CSV_TEAM_CAPTAINS['team_blr'] || 'p_rcb_rajat_patidar',
    isUserTeam: false
  },
  {
    id: 'team_hyd',
    name: 'Sunrisers Hyderabad',
    shortName: 'SRH',
    city: 'Hyderabad',
    leagueId: 'pt20',
    primaryColor: '#F26522',
    secondaryColor: '#000000',
    logoEmoji: '🦅',
    purseCr: 112.5,
    rtmCards: 4,
    squad: [],
    playingXIIds: CSV_TEAM_XIS['team_hyd'] || [],
    captainId: CSV_TEAM_CAPTAINS['team_hyd'] || 'p_srh_pat_cummins',
    isUserTeam: false
  },
  {
    id: 'team_del',
    name: 'Delhi Capitals',
    shortName: 'DC',
    city: 'Delhi',
    leagueId: 'pt20',
    primaryColor: '#004C97',
    secondaryColor: '#DC2626',
    logoEmoji: '🐯',
    purseCr: 114.0,
    rtmCards: 4,
    squad: [],
    playingXIIds: CSV_TEAM_XIS['team_del'] || [],
    captainId: CSV_TEAM_CAPTAINS['team_del'] || 'p_dc_axar_patel',
    isUserTeam: false
  },
  {
    id: 'team_guj',
    name: 'Gujarat Titans',
    shortName: 'GT',
    city: 'Ahmedabad',
    leagueId: 'pt20',
    primaryColor: '#1B2133',
    secondaryColor: '#D4AF37',
    logoEmoji: '⚡',
    purseCr: 115.0,
    rtmCards: 4,
    squad: [],
    playingXIIds: CSV_TEAM_XIS['team_guj'] || [],
    captainId: CSV_TEAM_CAPTAINS['team_guj'] || 'p_gt_shubman_gill',
    isUserTeam: false
  },
  {
    id: 'team_raj',
    name: 'Rajasthan Royals',
    shortName: 'RR',
    city: 'Jaipur',
    leagueId: 'pt20',
    primaryColor: '#EA1A85',
    secondaryColor: '#254AA5',
    logoEmoji: '👑',
    purseCr: 102.0,
    rtmCards: 4,
    squad: [],
    playingXIIds: CSV_TEAM_XIS['team_raj'] || [],
    captainId: CSV_TEAM_CAPTAINS['team_raj'] || 'p_rr_riyan_parag',
    isUserTeam: false
  },
  {
    id: 'team_lko',
    name: 'Lucknow Super Giants',
    shortName: 'LSG',
    city: 'Lucknow',
    leagueId: 'pt20',
    primaryColor: '#0057B8',
    secondaryColor: '#FF671F',
    logoEmoji: '🦅',
    purseCr: 108.0,
    rtmCards: 3,
    squad: [],
    playingXIIds: CSV_TEAM_XIS['team_lko'] || [],
    captainId: CSV_TEAM_CAPTAINS['team_lko'] || 'p_lsg_rishabh_pant',
    isUserTeam: false
  },
  {
    id: 'team_pun',
    name: 'Punjab Kings',
    shortName: 'PBKS',
    city: 'Mohali',
    leagueId: 'pt20',
    primaryColor: '#ED1B24',
    secondaryColor: '#D4AF37',
    logoEmoji: '🦁',
    purseCr: 125.0,
    rtmCards: 5,
    squad: [],
    playingXIIds: CSV_TEAM_XIS['team_pun'] || [],
    captainId: CSV_TEAM_CAPTAINS['team_pun'] || 'p_pbks_shreyas_iyer',
    isUserTeam: false
  }
];

export const INITIAL_LEAGUES: League[] = [
  {
    id: 'pt20',
    name: 'Indian Premier League (IPL)',
    country: 'India',
    seasonName: 'Season 2025/26',
    rules: {
      overs: 20,
      impactSub: true,
      powerSurge: false,
      maxOverseasInXI: 4,
      auctionType: 'live_auction'
    },
    teams: [],
    standings: [
      { teamId: 'team_kol', played: 9, won: 7, lost: 2, tied: 0, points: 14, nrr: +0.84, recentForm: ['W', 'W', 'W', 'W', 'L'] },
      { teamId: 'team_che', played: 9, won: 6, lost: 3, tied: 0, points: 12, nrr: +0.52, recentForm: ['W', 'L', 'W', 'W', 'W'] },
      { teamId: 'team_mum', played: 9, won: 6, lost: 3, tied: 0, points: 12, nrr: +0.48, recentForm: ['W', 'W', 'L', 'W', 'L'] },
      { teamId: 'team_hyd', played: 9, won: 6, lost: 3, tied: 0, points: 12, nrr: +0.41, recentForm: ['L', 'W', 'W', 'W', 'W'] },
      { teamId: 'team_blr', played: 9, won: 5, lost: 4, tied: 0, points: 10, nrr: +0.22, recentForm: ['W', 'L', 'W', 'L', 'W'] },
      { teamId: 'team_raj', played: 9, won: 5, lost: 4, tied: 0, points: 10, nrr: +0.15, recentForm: ['W', 'W', 'W', 'L', 'L'] },
      { teamId: 'team_lko', played: 8, won: 4, lost: 4, tied: 0, points: 8, nrr: -0.15, recentForm: ['L', 'W', 'L', 'W', 'L'] },
      { teamId: 'team_del', played: 8, won: 3, lost: 5, tied: 0, points: 6, nrr: -0.35, recentForm: ['L', 'L', 'W', 'L', 'W'] },
      { teamId: 'team_guj', played: 8, won: 3, lost: 5, tied: 0, points: 6, nrr: -0.42, recentForm: ['W', 'L', 'L', 'L', 'L'] },
      { teamId: 'team_pun', played: 8, won: 2, lost: 6, tied: 0, points: 4, nrr: -0.85, recentForm: ['L', 'L', 'L', 'W', 'L'] }
    ],
    currentDateIndex: 3,
    calendarDates: [
      { dateStr: '2025-04-30', dayOfWeek: 'THU', dayNumber: 30, month: 'APR', matchFixture: { id: 'm1', homeTeamId: 'team_lko', awayTeamId: 'team_che', venue: 'Ekana Stadium, Lucknow', completed: true, resultSummary: 'CSK 175/4 beat LSG 172/7 by 6 wkts' } },
      { dateStr: '2025-05-01', dayOfWeek: 'FRI', dayNumber: 1, month: 'MAY', matchFixture: { id: 'm2', homeTeamId: 'team_guj', awayTeamId: 'team_raj', venue: 'Narendra Modi Stadium, Ahmedabad', completed: true, resultSummary: 'GT 194/5 beat RR 190/8 by 4 runs' } },
      { dateStr: '2025-05-02', dayOfWeek: 'SAT', dayNumber: 2, month: 'MAY', matchFixture: { id: 'm3', homeTeamId: 'team_blr', awayTeamId: 'team_pun', venue: 'M. Chinnaswamy, Bengaluru', completed: true, resultSummary: 'RCB 218/3 beat PBKS 185/9 by 33 runs' } },
      { dateStr: '2025-05-03', dayOfWeek: 'SUN', dayNumber: 3, month: 'MAY', matchFixture: { id: 'm4', homeTeamId: 'team_hyd', awayTeamId: 'team_mum', venue: 'Rajiv Gandhi Stadium, Hyderabad', completed: false } },
      { dateStr: '2025-05-04', dayOfWeek: 'MON', dayNumber: 4, month: 'MAY', matchFixture: { id: 'm5', homeTeamId: 'team_kol', awayTeamId: 'team_del', venue: 'Eden Gardens, Kolkata', completed: false } },
      { dateStr: '2025-05-05', dayOfWeek: 'TUE', dayNumber: 5, month: 'MAY', matchFixture: { id: 'm6', homeTeamId: 'team_mum', awayTeamId: 'team_che', venue: 'Wankhede Stadium, Mumbai', completed: false } },
      { dateStr: '2025-05-06', dayOfWeek: 'WED', dayNumber: 6, month: 'MAY', matchFixture: { id: 'm7', homeTeamId: 'team_raj', awayTeamId: 'team_blr', venue: 'Sawai Mansingh Stadium, Jaipur', completed: false } }
    ]
  },
  {
    id: 'power_bash',
    name: 'Big Bash League (Australia)',
    country: 'Australia',
    seasonName: 'Season 2025/26',
    rules: {
      overs: 20,
      impactSub: false,
      powerSurge: true,
      maxOverseasInXI: 3,
      auctionType: 'draft'
    },
    teams: [],
    standings: [],
    currentDateIndex: 0,
    calendarDates: []
  },
  {
    id: 'city_100',
    name: 'The Hundred (England & Wales)',
    country: 'England & Wales',
    seasonName: 'Season 2025',
    rules: {
      overs: 20,
      impactSub: false,
      powerSurge: false,
      maxOverseasInXI: 3,
      auctionType: 'draft'
    },
    teams: [],
    standings: [],
    currentDateIndex: 0,
    calendarDates: []
  },
  {
    id: 'super_pak',
    name: 'Pakistan Super League (PSL)',
    country: 'Pakistan',
    seasonName: 'Season 2025/26',
    rules: {
      overs: 20,
      impactSub: false,
      powerSurge: false,
      maxOverseasInXI: 4,
      auctionType: 'draft'
    },
    teams: [],
    standings: [],
    currentDateIndex: 0,
    calendarDates: []
  },
  {
    id: 'sa_t20',
    name: 'SA20 League (South Africa)',
    country: 'South Africa',
    seasonName: 'Season 2025/26',
    rules: {
      overs: 20,
      impactSub: false,
      powerSurge: false,
      maxOverseasInXI: 4,
      auctionType: 'live_auction'
    },
    teams: [],
    standings: [],
    currentDateIndex: 0,
    calendarDates: []
  }
];

export const INITIAL_NATIONS: Nation[] = [
  { id: 'nat_ind', name: 'India', code: 'IND', flag: '🇮🇳', flagCode: 'in', rankT20: 1, rankODI: 1, rankTest: 2, t20Rank: 1, odiRank: 1, testRank: 2, ratingT20: 268, ratingODI: 122, ratingTest: 120, squad: [], isUserManaging: false, isCoachedByPlayer: false },
  { id: 'nat_aus', name: 'Australia', code: 'AUS', flag: '🇦🇺', flagCode: 'au', rankT20: 2, rankODI: 2, rankTest: 1, t20Rank: 2, odiRank: 2, testRank: 1, ratingT20: 258, ratingODI: 118, ratingTest: 124, squad: [], isUserManaging: false, isCoachedByPlayer: false },
  { id: 'nat_eng', name: 'England', code: 'ENG', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', flagCode: 'gb', rankT20: 3, rankODI: 4, rankTest: 3, t20Rank: 3, odiRank: 4, testRank: 3, ratingT20: 254, ratingODI: 105, ratingTest: 108, squad: [], isUserManaging: false, isCoachedByPlayer: false },
  { id: 'nat_sa', name: 'South Africa', code: 'SA', flag: '🇿🇦', flagCode: 'za', rankT20: 4, rankODI: 3, rankTest: 4, t20Rank: 4, odiRank: 3, testRank: 4, ratingT20: 250, ratingODI: 110, ratingTest: 104, squad: [], isUserManaging: false, isCoachedByPlayer: false },
  { id: 'nat_nz', name: 'New Zealand', code: 'NZ', flag: '🇳🇿', flagCode: 'nz', rankT20: 5, rankODI: 5, rankTest: 5, t20Rank: 5, odiRank: 5, testRank: 5, ratingT20: 245, ratingODI: 102, ratingTest: 101, squad: [], isUserManaging: false, isCoachedByPlayer: false },
  { id: 'nat_pak', name: 'Pakistan', code: 'PAK', flag: '🇵🇰', flagCode: 'pk', rankT20: 6, rankODI: 6, rankTest: 6, t20Rank: 6, odiRank: 6, testRank: 6, ratingT20: 240, ratingODI: 98, ratingTest: 92, squad: [], isUserManaging: false, isCoachedByPlayer: false },
  { id: 'nat_wi', name: 'West Indies', code: 'WI', flag: '🌴', flagCode: 'wi', rankT20: 7, rankODI: 9, rankTest: 8, t20Rank: 7, odiRank: 9, testRank: 8, ratingT20: 236, ratingODI: 88, ratingTest: 78, squad: [], isUserManaging: false, isCoachedByPlayer: false },
  { id: 'nat_sl', name: 'Sri Lanka', code: 'SL', flag: '🇱🇰', flagCode: 'lk', rankT20: 8, rankODI: 7, rankTest: 7, t20Rank: 8, odiRank: 7, testRank: 7, ratingT20: 230, ratingODI: 92, ratingTest: 84, squad: [], isUserManaging: false, isCoachedByPlayer: false },
  { id: 'nat_ban', name: 'Bangladesh', code: 'BAN', flag: '🇧🇩', flagCode: 'bd', rankT20: 9, rankODI: 8, rankTest: 9, t20Rank: 9, odiRank: 8, testRank: 9, ratingT20: 220, ratingODI: 90, ratingTest: 70, squad: [], isUserManaging: false, isCoachedByPlayer: false },
  { id: 'nat_afg', name: 'Afghanistan', code: 'AFG', flag: '🇦🇫', flagCode: 'af', rankT20: 10, rankODI: 10, rankTest: 10, t20Rank: 10, odiRank: 10, testRank: 10, ratingT20: 216, ratingODI: 85, ratingTest: 65, squad: [], isUserManaging: false, isCoachedByPlayer: false },
  { id: 'nat_ire', name: 'Ireland', code: 'IRE', flag: '🇮🇪', flagCode: 'ie', rankT20: 11, rankODI: 11, rankTest: 11, t20Rank: 11, odiRank: 11, testRank: 11, ratingT20: 195, ratingODI: 72, ratingTest: 50, squad: [], isUserManaging: false, isCoachedByPlayer: false },
  { id: 'nat_zim', name: 'Zimbabwe', code: 'ZIM', flag: '🇿🇼', flagCode: 'zw', rankT20: 12, rankODI: 12, rankTest: 12, t20Rank: 12, odiRank: 12, testRank: 12, ratingT20: 190, ratingODI: 68, ratingTest: 48, squad: [], isUserManaging: false, isCoachedByPlayer: false }
];

export const INITIAL_ACHIEVEMENTS: Achievement[] = [
  { id: 'ach_1', title: 'First Blood', description: 'Win your first competitive T20 match', unlocked: true, icon: '⚔️', iconName: 'Swords', category: 'Getting Started' },
  { id: 'ach_2', title: 'Going Once', description: 'Win a player bid in the live auction draft', unlocked: true, icon: '🔨', iconName: 'Gavel', category: 'Getting Started' },
  { id: 'ach_3', title: 'Centurion', description: 'Score a century (100+ runs) with any batter in an innings', unlocked: false, icon: '💯', iconName: 'Award', category: 'Match Feats' },
  { id: 'ach_4', title: 'High Five', description: 'Take a 5-wicket haul with a bowler in an innings', unlocked: false, icon: '🖐️', iconName: 'Target', category: 'Match Feats' },
  { id: 'ach_5', title: 'Skittled', description: 'Bowl out the opposition for under 100 runs in a T20', unlocked: false, icon: '🎳', iconName: 'ShieldAlert', category: 'Match Feats' },
  { id: 'ach_6', title: 'The Great Wall', description: 'Defend a target of under 130 runs in a T20 match', unlocked: false, icon: '🛡️', iconName: 'ShieldCheck', category: 'Match Feats' },
  { id: 'ach_7', title: 'Two Hundred Up', description: 'Post an innings team total of 200+ runs in a T20', unlocked: false, icon: '⚡', iconName: 'Zap', category: 'Match Feats' },
  { id: 'ach_8', title: 'IPL Champions', description: 'Lift the Indian Premier T20 trophy in Career Mode', unlocked: false, icon: '🏆', iconName: 'Trophy', category: 'Dynasty & Career' },
  { id: 'ach_9', title: 'National Hero', description: 'Accept a national head coach offer and win the T20 World Cup', unlocked: false, icon: '🌍', iconName: 'Globe', category: 'Dynasty & Career' },
  { id: 'ach_10', title: 'Masterstroke Genius', description: 'Execute a customized line, length, and field trap for a wicket', unlocked: true, icon: '🎯', iconName: 'Crosshair', category: 'Dynasty & Career' }
];

export const INITIAL_COACH_PROFILE: CoachProfile = {
  id: 'coach_arjun',
  name: 'Arjun Rao',
  age: 44,
  nationality: 'India',
  reputation: 'Elite',
  clubTeamId: 'team_kol',
  nationalTeamId: null,
  difficulty: 'Normal',
  proUnlocked: true,
  domesticTitles: 3,
  internationalTitles: 0,
  domesticStats: {
    seasons: 3,
    matches: 48,
    wins: 34,
    losses: 14,
    winPct: 70.8,
    titles: 2,
    playoffRuns: 3,
    bestStreak: 6,
    currentStreak: 2
  },
  nationalStats: {
    matches: 0,
    wins: 0,
    losses: 0,
    winPct: 0.0,
    worldCups: 0,
    rank: 1
  },
  boardTargets: [
    { id: 'bt_1', title: 'Qualify for Playoffs', description: 'Finish in the top 4 of the league stage standings.', completed: false },
    { id: 'bt_2', title: 'Maintain Net Run Rate > +0.40', description: 'Ensure the squad plays aggressive brand of modern T20 cricket.', completed: false },
    { id: 'bt_3', title: 'Develop Domestic Youngster', description: 'Give at least 5 matches to an uncapped player.', completed: false }
  ],
  stats: {
    matchesCoached: 142,
    matchesWon: 97,
    matchesLost: 43,
    matchesTied: 2,
    winPercentage: 68.3,
    bestWinStreak: 8,
    trophies: ['Premier T20 2022', 'Premier T20 2024', 'Champions Club Cup 2023']
  }
};

export const INITIAL_JOB_OFFERS: JobOffer[] = [
  {
    id: 'job_1',
    name: 'South Africa Men',
    organizationName: 'Cricket South Africa',
    leagueOrType: 'ICC Full Member',
    ratingOvr: 89,
    salaryCr: 4.5,
    tag: 'CONTENDER',
    boardTarget: 'Reach ICC World Cup Semi-Finals',
    nationId: 'nat_sa',
    role: 'Head Coach',
    format: 'T20 & ODI',
    salaryPerYearCr: 4.5,
    expectations: 'Reach World Cup Semi-Finals',
    expiresDays: 14
  },
  {
    id: 'job_2',
    name: 'West Indies',
    organizationName: 'Cricket West Indies',
    leagueOrType: 'ICC Full Member',
    ratingOvr: 84,
    salaryCr: 3.8,
    tag: 'REBUILD PROJECT',
    boardTarget: 'Climb into ICC Top 5 Rankings',
    nationId: 'nat_wi',
    role: 'White-Ball Head Coach',
    format: 'T20',
    salaryPerYearCr: 3.8,
    expectations: 'Climb into ICC Top 5 Rankings',
    expiresDays: 21
  },
  {
    id: 'job_3',
    name: 'England Men',
    organizationName: 'ECB',
    leagueOrType: 'ICC Full Member',
    ratingOvr: 92,
    salaryCr: 6.2,
    tag: 'WORLD STAGE',
    boardTarget: 'Win the World Test Championship',
    nationId: 'nat_eng',
    role: 'National Test & T20 Coach',
    format: 'All Formats',
    salaryPerYearCr: 6.2,
    expectations: 'Win the World Test Championship',
    expiresDays: 7
  }
];
`;

fs.writeFileSync(path.join(process.cwd(), 'src/data/initialData.ts'), content, 'utf8');
console.log('Successfully updated initialData.ts to use CSV_PLAYERS!');
