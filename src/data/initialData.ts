import { Player, Team, League, Nation, Achievement, JobOffer, CoachProfile, FielderPosition, LeaguePlayoffs } from '../types/cricket';
import { CSV_PLAYERS, CSV_TEAM_CAPTAINS, CSV_TEAM_XIS } from './csvPlayers';

export const ZERO_PLAYER_STATS = {
  matches: 0,
  runs: 0,
  balls: 0,
  fours: 0,
  sixes: 0,
  fifties: 0,
  hundreds: 0,
  highestScore: 0,
  wickets: 0,
  oversBowled: 0,
  runsConceded: 0,
  maidens: 0,
  bestBowling: '0/0'
};

import { buildCompleteInitialPlayers } from './internationalPlayerRosters';

export const createFreshPlayers = (): Player[] => {
  const basePlayers = CSV_PLAYERS.map(p => ({
    ...p,
    ratings: { ...p.ratings },
    stats: { ...ZERO_PLAYER_STATS }
  }));
  return buildCompleteInitialPlayers(basePlayers);
};

export const INITIAL_PLAYERS: Player[] = createFreshPlayers();

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
    shortName: 'KKR',
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
    shortName: 'RCB',
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

export const createInitialPlayoffs = (standings: { teamId: string }[]): LeaguePlayoffs => ({
  q1: {
    stage: 'q1' as const,
    title: 'QUALIFIER 1 (1st vs 2nd)',
    homeTeamId: null,
    awayTeamId: null,
    winnerTeamId: null,
    loserTeamId: null,
    completed: false
  },
  eliminator: {
    stage: 'eliminator' as const,
    title: 'ELIMINATOR (3rd vs 4th)',
    homeTeamId: null,
    awayTeamId: null,
    winnerTeamId: null,
    loserTeamId: null,
    completed: false
  },
  q2: {
    stage: 'q2' as const,
    title: 'QUALIFIER 2 (Loser Q1 vs Winner Elim)',
    homeTeamId: null,
    awayTeamId: null,
    winnerTeamId: null,
    loserTeamId: null,
    completed: false
  },
  final: {
    stage: 'final' as const,
    title: 'THE GRAND FINAL (Winner Q1 vs Winner Q2)',
    homeTeamId: null,
    awayTeamId: null,
    winnerTeamId: null,
    loserTeamId: null,
    completed: false
  },
  championTeamId: null
});

const PT20_STANDINGS = [
  { teamId: 'team_kol', played: 0, won: 0, lost: 0, tied: 0, points: 0, nrr: 0, recentForm: [] as ('W' | 'L' | 'T')[] },
  { teamId: 'team_che', played: 0, won: 0, lost: 0, tied: 0, points: 0, nrr: 0, recentForm: [] as ('W' | 'L' | 'T')[] },
  { teamId: 'team_mum', played: 0, won: 0, lost: 0, tied: 0, points: 0, nrr: 0, recentForm: [] as ('W' | 'L' | 'T')[] },
  { teamId: 'team_hyd', played: 0, won: 0, lost: 0, tied: 0, points: 0, nrr: 0, recentForm: [] as ('W' | 'L' | 'T')[] },
  { teamId: 'team_blr', played: 0, won: 0, lost: 0, tied: 0, points: 0, nrr: 0, recentForm: [] as ('W' | 'L' | 'T')[] },
  { teamId: 'team_raj', played: 0, won: 0, lost: 0, tied: 0, points: 0, nrr: 0, recentForm: [] as ('W' | 'L' | 'T')[] },
  { teamId: 'team_lko', played: 0, won: 0, lost: 0, tied: 0, points: 0, nrr: 0, recentForm: [] as ('W' | 'L' | 'T')[] },
  { teamId: 'team_del', played: 0, won: 0, lost: 0, tied: 0, points: 0, nrr: 0, recentForm: [] as ('W' | 'L' | 'T')[] },
  { teamId: 'team_guj', played: 0, won: 0, lost: 0, tied: 0, points: 0, nrr: 0, recentForm: [] as ('W' | 'L' | 'T')[] },
  { teamId: 'team_pun', played: 0, won: 0, lost: 0, tied: 0, points: 0, nrr: 0, recentForm: [] as ('W' | 'L' | 'T')[] }
];

export const INITIAL_LEAGUES: League[] = [
  {
    id: 'pt20',
    name: 'Indian Premier League (IPL)',
    country: 'India',
    seasonName: '2026',
    rules: {
      overs: 20,
      impactSub: true,
      powerSurge: false,
      maxOverseasInXI: 4,
      auctionType: 'live_auction'
    },
    teams: [],
    standings: PT20_STANDINGS,
    playoffs: createInitialPlayoffs(PT20_STANDINGS),
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
  // GETTING STARTED
  { id: 'ach_1', title: 'First Blood', description: 'Win your first match as a coach.', category: 'GETTING STARTED', unlocked: false, iconType: 'trophy' },
  { id: 'ach_2', title: 'Settling In', description: 'See out a full season in charge.', category: 'GETTING STARTED', unlocked: false, progress: '0/1', iconType: 'calendar' },
  { id: 'ach_3', title: 'Going Once', description: 'Win your first player at an auction.', category: 'GETTING STARTED', unlocked: false, iconType: 'gavel' },

  // MATCH FEATS
  { id: 'ach_4', title: 'Centurion', description: 'One of your batters scores a hundred.', category: 'MATCH FEATS', unlocked: false, iconType: 'award' },
  { id: 'ach_5', title: 'High Five', description: 'A bowler of yours takes five wickets.', category: 'MATCH FEATS', unlocked: false, iconType: 'target' },
  { id: 'ach_6', title: 'Skittled', description: 'Bowl a side out under 100 and win.', category: 'MATCH FEATS', unlocked: false, iconType: 'shield' },
  { id: 'ach_7', title: 'The Great Wall', description: 'Defend a total of 140 or less.', category: 'MATCH FEATS', unlocked: false, iconType: 'shield' },
  { id: 'ach_8', title: 'Two Hundred Up', description: 'Post 200 or more in a single innings.', category: 'MATCH FEATS', unlocked: false, iconType: 'zap' },
  { id: 'ach_9', title: 'Perfect Ten', description: 'Chase a target without losing a wicket.', category: 'MATCH FEATS', unlocked: false, iconType: 'star' },
  { id: 'ach_10', title: 'Hat-Trick Hero', description: 'A bowler of yours takes three wickets in three consecutive deliveries.', category: 'MATCH FEATS', unlocked: false, iconType: 'target' },
  { id: 'ach_11', title: 'Super Over Nerve', description: 'Hold your nerve to win a tied match in a Super Over.', category: 'MATCH FEATS', unlocked: false, iconType: 'zap' },
  { id: 'ach_12', title: 'Six Appeal', description: 'Hit 12 or more sixes in one innings.', category: 'MATCH FEATS', unlocked: false, iconType: 'zap' },
  { id: 'ach_13', title: 'Hammering', description: 'Win by 100 runs or more batting first.', category: 'MATCH FEATS', unlocked: false, iconType: 'award' },
  { id: 'ach_14', title: 'Last Pair', description: 'Win a match from 9 wickets down when chasing.', category: 'MATCH FEATS', unlocked: false, iconType: 'shield' },
  { id: 'ach_15', title: 'Mission Impossible', description: 'Chase a target of 180 or more and win.', category: 'MATCH FEATS', unlocked: false, iconType: 'zap' },
  { id: 'ach_16', title: 'Miser', description: 'Your bowler concedes under 4 runs per over in 4 overs.', category: 'MATCH FEATS', unlocked: false, iconType: 'shield' },
  { id: 'ach_17', title: 'Bold Call', description: 'Retire out a batter and go on to win the match.', category: 'MATCH FEATS', unlocked: false, iconType: 'target' },
  { id: 'ach_18', title: 'Game Changer', description: 'A match in which you used an Impact Player to win.', category: 'MATCH FEATS', unlocked: false, iconType: 'star' },
  { id: 'ach_19', title: 'Three Hundred Up', description: 'Post 300 or more in an ODI innings.', category: 'MATCH FEATS', unlocked: false, iconType: 'award' },

  // SEASON
  { id: 'ach_20', title: 'On a Roll', description: 'Win five matches in a row.', category: 'SEASON', unlocked: false, progress: '0/5', iconType: 'trending' },
  { id: 'ach_21', title: 'Playoff Push', description: 'Take your side into the playoffs.', category: 'SEASON', unlocked: false, iconType: 'award' },
  { id: 'ach_22', title: 'Champions', description: 'Win the league title.', category: 'SEASON', unlocked: false, iconType: 'trophy' },
  { id: 'ach_23', title: 'Dynasty', description: 'Win three league titles.', category: 'SEASON', unlocked: false, progress: '0/3', iconType: 'trophy' },
  { id: 'ach_24', title: 'Cap Collector', description: 'A player of yours tops runs or wickets.', category: 'SEASON', unlocked: false, iconType: 'star' },
  { id: 'ach_25', title: 'Back to Back', description: 'Win consecutive league titles.', category: 'SEASON', unlocked: false, iconType: 'trophy' },
  { id: 'ach_26', title: 'Untouchable', description: 'Win eight matches in a row.', category: 'SEASON', unlocked: false, progress: '0/8', iconType: 'trending' },
  { id: 'ach_27', title: 'Finalist', description: 'Reach the league final.', category: 'SEASON', unlocked: false, iconType: 'flag' },
  { id: 'ach_28', title: 'Home Fortress', description: 'Win all your home fixtures in the league stage.', category: 'SEASON', unlocked: false, iconType: 'shield' },

  // CAREER
  { id: 'ach_29', title: 'Fifty Up', description: 'Win 50 matches across your career.', category: 'CAREER', unlocked: false, progress: '0/50', iconType: 'award' },
  { id: 'ach_30', title: 'Veteran', description: 'Complete five full seasons in charge.', category: 'CAREER', unlocked: false, progress: '0/5', iconType: 'calendar' },
  { id: 'ach_31', title: 'Century Up', description: 'Win 100 matches across your career.', category: 'CAREER', unlocked: false, progress: '0/100', iconType: 'award' },
  { id: 'ach_32', title: 'Top Dollar', description: 'Sign a player for 20 crore or more at auction.', category: 'CAREER', unlocked: false, iconType: 'dollar' },
  { id: 'ach_33', title: 'Daylight Robbery', description: 'Sign a player rated 88 or above for under 5 crore.', category: 'CAREER', unlocked: false, iconType: 'gavel' },
  { id: 'ach_34', title: 'My Captain', description: 'Keep the same player as captain for three consecutive seasons.', category: 'CAREER', unlocked: false, iconType: 'users' },
  { id: 'ach_35', title: 'A Decade in the Dugout', description: 'Complete ten full seasons as a coach.', category: 'CAREER', unlocked: false, progress: '0/10', iconType: 'calendar' },
  { id: 'ach_36', title: 'World Tour', description: 'Win the IPL Championship title.', category: 'CAREER', unlocked: false, progress: '0/1', iconType: 'globe' },
  { id: 'ach_37', title: 'First Profit', description: 'Complete your first profitable club-finance season.', category: 'CAREER', unlocked: false, iconType: 'dollar' },
  { id: 'ach_38', title: 'Debt Free', description: 'Complete a club-finance season with no outstanding debt.', category: 'CAREER', unlocked: false, iconType: 'shield' },
  { id: 'ach_39', title: 'Made at Home', description: 'Promote your first Academy graduate to a senior squad.', category: 'CAREER', unlocked: false, iconType: 'users' },
  { id: 'ach_40', title: 'Class of Five', description: 'Promote five Academy graduates to a senior squad.', category: 'CAREER', unlocked: false, progress: '0/5', iconType: 'users' },
  { id: 'ach_41', title: 'One of Our Own', description: 'Make an Academy graduate your club captain.', category: 'CAREER', unlocked: false, iconType: 'star' },
  { id: 'ach_42', title: 'For Your Country', description: 'Graduate your first National Academy player.', category: 'CAREER', unlocked: false, iconType: 'flag' },
  { id: 'ach_43', title: 'Five-Star Club', description: 'Build a full five-star Club HQ.', category: 'CAREER', unlocked: false, iconType: 'building' },
  { id: 'ach_44', title: 'Commercial Powerhouse', description: 'Turn a club into a commercial powerhouse.', category: 'CAREER', unlocked: false, iconType: 'dollar' },
  { id: 'ach_45', title: "The Board's Favourite", description: 'Finish a club-finance season with all three board targets met.', category: 'CAREER', unlocked: false, iconType: 'star' },
  { id: 'ach_46', title: "Sponsor's Dream", description: 'Win your league on a Title sponsor deal.', category: 'CAREER', unlocked: false, iconType: 'award' },
  { id: 'ach_47', title: 'Built to Last', description: 'Unveil a Club Heritage landmark.', category: 'CAREER', unlocked: false, iconType: 'building' },
  { id: 'ach_48', title: 'Five-Star Nation', description: 'Build a full five-star National HQ.', category: 'CAREER', unlocked: false, iconType: 'building' },
  { id: 'ach_49', title: 'Continental Stage', description: 'Qualify your club for the Champions League.', category: 'CAREER', unlocked: false, iconType: 'globe' },
  { id: 'ach_50', title: 'Best of the Best', description: 'Win the Champions League with your club.', category: 'CAREER', unlocked: false, iconType: 'trophy' },
  { id: 'ach_51', title: 'Clean Books', description: 'Finish five club-finance seasons with no debt.', category: 'CAREER', unlocked: false, progress: '0/5', iconType: 'shield' },
  { id: 'ach_52', title: 'Master Builder', description: 'Complete ten Club HQ projects.', category: 'CAREER', unlocked: false, progress: '0/10', iconType: 'building' },
  { id: 'ach_53', title: 'Programme Director', description: 'Run five club programmes.', category: 'CAREER', unlocked: false, progress: '0/5', iconType: 'briefcase' },
  { id: 'ach_54', title: 'Rebuilder', description: 'Go debt free the season after Emergency Support.', category: 'CAREER', unlocked: false, iconType: 'shield' },

  // INTERNATIONAL
  { id: 'ach_55', title: 'The Call-Up', description: 'Accept a national team job.', category: 'INTERNATIONAL', unlocked: false, iconType: 'flag' },
  { id: 'ach_56', title: 'Series Winner', description: 'Win a series with your nation.', category: 'INTERNATIONAL', unlocked: false, iconType: 'award' },
  { id: 'ach_57', title: 'Continental Champion', description: 'Win a continental cup with your nation.', category: 'INTERNATIONAL', unlocked: false, iconType: 'trophy' },
  { id: 'ach_58', title: 'World Champion', description: 'Lift the World Cup with your nation.', category: 'INTERNATIONAL', unlocked: false, iconType: 'trophy' },
  { id: 'ach_59', title: 'The Big Job', description: 'Take charge of an elite cricket nation.', category: 'INTERNATIONAL', unlocked: false, iconType: 'star' },
  { id: 'ach_60', title: 'ODI Skipper', description: 'Win an ODI series with your national side.', category: 'INTERNATIONAL', unlocked: false, iconType: 'flag' },
  { id: 'ach_61', title: 'ODI Champion', description: 'Lift the ODI World Cup with your nation.', category: 'INTERNATIONAL', unlocked: false, iconType: 'trophy' },
  { id: 'ach_62', title: 'Trophy Room', description: 'Win the Champions Trophy with your nation.', category: 'INTERNATIONAL', unlocked: false, iconType: 'trophy' },
  { id: 'ach_63', title: 'The Mace', description: 'Win the World Test Championship with your nation.', category: 'INTERNATIONAL', unlocked: false, iconType: 'award' },
  { id: 'ach_64', title: 'Top of the World', description: 'Lead your nation to the T20I world number one rank.', category: 'INTERNATIONAL', unlocked: false, iconType: 'trending' },
  { id: 'ach_65', title: 'Fifty-Over Kings', description: 'Lead your nation to the ODI world number one rank.', category: 'INTERNATIONAL', unlocked: false, iconType: 'trending' },
  { id: 'ach_66', title: 'The Summit', description: 'Lead your nation to the Test world number one rank.', category: 'INTERNATIONAL', unlocked: false, iconType: 'trending' },
  { id: 'ach_67', title: 'Top Ten', description: 'Take your nation into a world top ten, in any format.', category: 'INTERNATIONAL', unlocked: false, iconType: 'trending' },
  { id: 'ach_68', title: 'Top Five', description: 'Take your nation into a world top five, in any format.', category: 'INTERNATIONAL', unlocked: false, iconType: 'trending' },
  { id: 'ach_69', title: 'On the Podium', description: 'Take your nation into a world top three, in any format.', category: 'INTERNATIONAL', unlocked: false, iconType: 'trending' },
  { id: 'ach_70', title: 'Through the Qualifier', description: 'Take your nation through a World Cup qualifier.', category: 'INTERNATIONAL', unlocked: false, iconType: 'flag' },
  { id: 'ach_71', title: 'Full Member', description: 'Win Test status for your nation.', category: 'INTERNATIONAL', unlocked: false, iconType: 'flag' },
  { id: 'ach_72', title: 'Series Maestro', description: 'Win five international series with your nation.', category: 'INTERNATIONAL', unlocked: false, progress: '0/5', iconType: 'award' },
  { id: 'ach_73', title: 'Successful DRS Overturn', description: "Successfully overturn an umpire's decision with a tactical DRS review.", category: 'INTERNATIONAL', unlocked: false, iconType: 'target' },
  { id: 'ach_74', title: 'DLS Masterclass', description: 'Win a rain-affected match decided via Duckworth-Lewis-Stern.', category: 'INTERNATIONAL', unlocked: false, iconType: 'shield' },
  { id: 'ach_75', title: 'Power Surge Carnage', description: 'Score 30 or more runs during a two-over Power Surge.', category: 'INTERNATIONAL', unlocked: false, iconType: 'zap' },
  { id: 'ach_76', title: 'Unbeaten Campaign', description: 'Win an international tournament without losing a single fixture.', category: 'INTERNATIONAL', unlocked: false, iconType: 'trophy' },
  { id: 'ach_77', title: 'Whitewash Series', description: 'Complete a 5-0 bilateral international series whitewash.', category: 'INTERNATIONAL', unlocked: false, iconType: 'award' },
  { id: 'ach_78', title: 'Golden Duck Hunter', description: 'Dismiss an opposition opening batter on the very first ball of an innings.', category: 'INTERNATIONAL', unlocked: false, iconType: 'target' },
  { id: 'ach_79', title: 'Cricket Coach Immortal', description: 'Complete the Grand Slam of IPL Champions, T20 World Cup, and ICC Champions Trophy.', category: 'INTERNATIONAL', unlocked: false, iconType: 'trophy' }
];

export const INITIAL_COACH_PROFILE: CoachProfile = {
  id: 'coach_arjun',
  name: 'Arjun Rao',
  age: 44,
  nationality: 'India',
  reputation: 'Rookie',
  clubTeamId: 'team_kol',
  nationalTeamId: null,
  difficulty: 'Normal',
  proUnlocked: true,
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
    matchesCoached: 0,
    matchesWon: 0,
    matchesLost: 0,
    matchesTied: 0,
    winPercentage: 0,
    bestWinStreak: 0,
    trophies: []
  },
  clubStints: [
    {
      id: 'stint_team_kol',
      teamId: 'team_kol',
      teamName: 'Kolkata',
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
  },
  {
    id: 'job_4',
    name: 'India Men',
    organizationName: 'BCCI',
    leagueOrType: 'ICC Full Member',
    ratingOvr: 95,
    salaryCr: 7.5,
    tag: 'PINNACLE',
    boardTarget: 'Win ICC T20 World Cup & WTC Final',
    nationId: 'nat_ind',
    role: 'Head Coach',
    format: 'All Formats',
    salaryPerYearCr: 7.5,
    expectations: 'Win ICC T20 World Cup & WTC Final',
    expiresDays: 30
  },
  {
    id: 'job_5',
    name: 'Australia Men',
    organizationName: 'Cricket Australia',
    leagueOrType: 'ICC Full Member',
    ratingOvr: 94,
    salaryCr: 7.0,
    tag: 'POWERHOUSE',
    boardTarget: 'Retain Border-Gavaskar Trophy & The Ashes',
    nationId: 'nat_aus',
    role: 'Head Coach',
    format: 'All Formats',
    salaryPerYearCr: 7.0,
    expectations: 'Retain Border-Gavaskar Trophy & The Ashes',
    expiresDays: 25
  }
];
