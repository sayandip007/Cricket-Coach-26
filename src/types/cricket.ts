export type PitchType = 'Dry & Turning' | 'Green Seamer' | 'Flat Belter' | 'Sluggish Gripper' | 'Natural' | 'Dry Turner' | 'Flat Track' | 'Balanced Sporting' | 'Two-Paced' | string;

export type PlayerRole = 'Top-order' | 'Middle-order' | 'Wk-bat' | 'All-rounder' | 'Pace' | 'Spin' | 'Bowler' | 'Batter' | 'Batsman' | 'Wicketkeeper' | 'All-Rounder';
export type BowlingArm = 'RAF' | 'LAF' | 'RAM' | 'LAM' | 'ROB' | 'LSO' | 'LS';
export type BattingHand = 'RHB' | 'LHB';
export type PlayerTier = 'Platinum' | 'Gold' | 'Silver' | 'Bronze';

export interface PlayerStats {
  matches: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  fifties: number;
  hundreds: number;
  highestScore: number;
  wickets: number;
  oversBowled: number;
  runsConceded: number;
  maidens: number;
  bestBowling: string;
  average?: number;
  strikeRate?: number;
  economy?: number;
  innings?: number;
  dismissals?: number;
  inningsBowled?: number;
  bowlingAverage?: number;
  bowlingStrikeRate?: number;
  catches?: number;
  stumpings?: number;
  runOuts?: number;
}

export interface PlayerMatchLogEntry {
  matchId: string;
  dateStr?: string;
  opponent: string;
  competition: 'ipl' | 'international';
  format?: string;
  runs?: number;
  balls?: number;
  fours?: number;
  sixes?: number;
  isOut?: boolean;
  wickets?: number;
  overs?: number;
  runsConceded?: number;
}

export interface CompetitionStats {
  ipl?: PlayerStats;
  international?: PlayerStats;
  iplSeasons?: Record<string, PlayerStats>;
  internationalSeasons?: Record<string, PlayerStats>;
  recentPerformances?: PlayerMatchLogEntry[];
  processedMatchIds?: string[];
}

export interface Player {
  id: string;
  name: string;
  jerseyNumber?: number;
  role: PlayerRole;
  bowlingArm: BowlingArm;
  battingHand: BattingHand;
  age: number;
  country: string;
  clubId: string;
  isOverseas: boolean;
  tier: PlayerTier;
  basePriceCr: number;
  salaryCr: number;
  contractValueCr?: number;
  ratings: {
    bat: number; // 0-99
    pow: number; // Power hitting 0-99
    tec?: number; // Technique 0-99
    tmp: number; // Temperament & shot selection 0-99
    agg?: number; // Aggression 0-99
    sty?: number; // Style 0-99
    run?: number; // Running between wickets 0-99
    vp?: number; // vs Pace 0-99
    vs?: number; // vs Spin 0-99
    bowl: number; // Bowling potency 0-99
    pace: number; // Pace / Spin turn 0-99
    ctrl: number; // Line & Length control 0-99
    dis?: number; // Discipline / consistency 0-99
    var?: number; // Variation 0-99
    dth: number; // Death overs clutch 0-99
    comp?: number; // Composure 0-99
    cat?: number; // Catching & fielding 0-99
    fld?: number; // Fielding 0-99
    fit?: number; // Fitness 0-99
    exp?: number; // Experience 0-99
  };
  form: number; // 0-100
  morale: number; // 0-100
  fitness: number; // 0-100
  isInjured: boolean;
  injuryDays: number;
  stats: PlayerStats;
  competitionStats?: CompetitionStats;
  isImpactPlayer?: boolean;
  isCaptain?: boolean;
  primaryRole?: string;
  bowlingStyle?: string;
  ratingType?: string;
  dataConfidence?: string;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  city: string;
  leagueId?: string;
  primaryColor: string;
  secondaryColor: string;
  logoEmoji: string;
  purseCr: number;
  rtmCards: number;
  squad: Player[];
  playingXIIds: string[];
  impactPlayerIds?: string[];
  captainId: string;
  isUserTeam?: boolean;
}

export interface LeagueStanding {
  teamId: string;
  played: number;
  won: number;
  lost: number;
  tied: number;
  points: number;
  nrr: number;
  recentForm: ('W' | 'L' | 'T')[];
}

export type StandingRow = LeagueStanding;

export interface LeagueRules {
  overs: number; // 20 or 100 for English City 100
  impactSub: boolean;
  powerSurge: boolean;
  maxOverseasInXI: number;
  auctionType: 'live_auction' | 'draft';
}

export interface PlayoffMatchState {
  stage: 'q1' | 'eliminator' | 'q2' | 'final';
  title: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  winnerTeamId: string | null;
  loserTeamId: string | null;
  completed: boolean;
  resultSummary?: string;
}

export interface LeaguePlayoffs {
  q1: PlayoffMatchState;
  eliminator: PlayoffMatchState;
  q2: PlayoffMatchState;
  final: PlayoffMatchState;
  championTeamId?: string | null;
}

export interface CalendarMatchFixture {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeShortName?: string;
  awayShortName?: string;
  homeLogo?: string;
  awayLogo?: string;
  venue: string;
  timeStr?: string;
  completed: boolean;
  resultSummary?: string;
  completedMatchState?: MatchLiveState;
  isInternational?: boolean;
  seriesName?: string;
  format?: 'T20' | 'ODI' | 'TEST';
}

export interface TeamSeasonRecord {
  seasonYear: string;
  leagueName: string;
  country: string;
  rank: number;
  wonTitle: boolean;
  played: number;
  won: number;
  lost: number;
  tied: number;
  nrr: number;
  mostRunsPlayerName?: string;
  mostRunsValue?: number;
  mostWicketsPlayerName?: string;
  mostWicketsValue?: number;
}

export interface League {
  id: string;
  name: string;
  shortName?: string;
  seasonYear?: number | string;
  country: string;
  seasonName: string;
  rules: LeagueRules;
  teams: Team[];
  standings: LeagueStanding[];
  playoffs?: LeaguePlayoffs;
  teamSeasonHistory?: Record<string, TeamSeasonRecord[]>;
  currentDateIndex: number;
  calendarDates: {
    id?: string;
    dateStr: string;
    dayOfWeek: string;
    dayNumber: number;
    month: string;
    type?: 'match' | 'training' | 'rest' | 'international' | 'playoff';
    eventType?: string;
    title?: string;
    isHome?: boolean;
    opponentTeamId?: string;
    matchFixture?: CalendarMatchFixture;
    otherMatches?: CalendarMatchFixture[];
    internationalMatches?: CalendarMatchFixture[];
  }[];
}

export interface Nation {
  id: string;
  name: string;
  code?: string;
  flag?: string;
  flagCode?: string;
  rankT20?: number;
  rankODI?: number;
  rankTest?: number;
  t20Rank?: number;
  odiRank?: number;
  testRank?: number;
  ratingT20: number;
  ratingODI: number;
  ratingTest: number;
  squad?: Player[];
  isUserManaging?: boolean;
  isCoachedByPlayer?: boolean;
}

export interface AuctionBid {
  teamId: string;
  teamShortName: string;
  amountCr: number;
  timeStr: string;
}

export interface AuctionLot {
  lotIndex: number;
  totalLots: number;
  player: Player;
  currentBidCr: number;
  currentBidderTeamId: string | null;
  bidsHistory: AuctionBid[];
  status: 'active' | 'rtm_offered' | 'sold' | 'unsold';
  soldToTeamId: string | null;
  soldPriceCr?: number;
}

export type PitchLength = 'bouncer' | 'short' | 'good' | 'full' | 'yorker';
export type PitchLine = 'wide_outside_off' | 'outside_off' | 'off_stump' | 'stumps' | 'leg_side';
export type BowlingAngle = 'over' | 'round';
export type BattingApproach = 'defensive' | 'anchor' | 'balanced' | 'aggressive' | 'smash';

export interface FielderPosition {
  id: number;
  name: string;
  x: number; // -100 to 100 coordinate relative to pitch center
  y: number; // -100 to 100
  isDeep?: boolean;
  isBoundary?: boolean;
}

export interface BallOutcome {
  over: number;
  ballNumber: number;
  bowlerId: string;
  bowlerName: string;
  strikerId: string;
  strikerName: string;
  nonStrikerId: string;
  nonStrikerName: string;
  runs: number;
  batterRuns?: number;
  extraRuns?: number;
  bowlerChargedRuns?: number;
  isLegalDelivery?: boolean;
  isWicket: boolean;
  wicketType?: 'bowled' | 'caught' | 'lbw' | 'run out' | 'stumped';
  fielderId?: string;
  fielderName?: string;
  dismissedPlayerId?: string;
  dismissedPlayerName?: string;
  dismissalText?: string;
  incomingBatterId?: string;
  drsReviewed?: boolean;
  appealType?: 'lbw' | 'caught_behind' | 'none';
  isFour: boolean;
  isSix: boolean;
  isExtra: boolean;
  extraType?: 'wide' | 'no_ball' | 'bye' | 'leg_bye';
  bowlerSpeedMps: number;
  shotAngleDeg: number; // 0 to 360 degrees for wagon wheel
  shotDistanceM: number; // 10 to 95 meters
  commentary: string;
  tacticalNote: string;
}

export interface BatterInningsScorecard {
  playerId: string;
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dismissal: string;
  isOut?: boolean;
  strikeRate: number;
  isOnStrike: boolean;
}

export interface BowlerInningsScorecard {
  playerId: string;
  name: string;
  overs: number;
  ballsInCurrentOver: number;
  maidens: number;
  runs: number;
  runsConceded?: number;
  wickets: number;
  economy: number;
  isCurrentBowler: boolean;
}

export interface InningsExtrasBreakdown {
  total: number;
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
}

export interface InningsData {
  battingTeamId: string;
  bowlingTeamId: string;
  runs: number;
  wickets: number;
  overs: number; // e.g. 3.4
  balls?: number;
  ballsCompleted: number;
  maxOvers: number;
  currentOverRuns?: number;
  extras?: InningsExtrasBreakdown;
  batters: BatterInningsScorecard[];
  bowlers: BowlerInningsScorecard[];
  currentStrikerId: string;
  currentNonStrikerId: string;
  currentBowlerId: string;
  ballHistory: BallOutcome[];
  fallOfWickets: { runs: number; wicketNum: number; over: number; batterName: string }[];
  overRuns: number[]; // runs scored per over for Manhattan chart
}

export interface MatchLiveState {
  id: string;
  matchId?: string;
  fixtureId?: string;
  leagueId: string;
  isInternational?: boolean;
  seasonName?: string;
  dateStr?: string;
  homeTeamShort?: string;
  awayTeamShort?: string;
  format: 'T20' | 'ODI' | 'TEST';
  homeTeam: Team;
  awayTeam: Team;
  venue: string;
  pitchType: 'Dry & Turning' | 'Green Seamer' | 'Flat Belter' | 'Sluggish Gripper' | 'Natural' | 'Dry Turner' | 'Flat Track';
  weather: 'Sunny & Hot' | 'Clear Night' | 'Overcast & Humid' | 'Passing Clouds';
  currentInningsIndex: 1 | 2;
  innings1: InningsData;
  innings2: InningsData | null;
  targetRuns: number | null;
  status: 'in_progress' | 'innings_break' | 'finished';
  resultText?: string;
  winnerTeamId?: string;
  impactPlayerUsed?: boolean;
  playoffStage?: 'q1' | 'eliminator' | 'q2' | 'final';
  // Live ball animation states
  lastBallOutcome: BallOutcome | null;
  isBallInFlight: boolean;
  // Tactics
  bowlingTactics: {
    length: PitchLength;
    line: PitchLine;
    angle: BowlingAngle;
    variation: string;
    fielders: FielderPosition[];
    intent?: 'contain' | 'standard' | 'attack';
    effort?: 'conserve' | 'standard' | 'max';
    keeperPos?: 'stumps' | 'normal';
    speed?: 'slower' | 'standard' | 'quicker';
  };
  battingTactics: {
    approach: BattingApproach;
    nonStrikerApproach?: BattingApproach;
    targetSide: 'all' | 'off_side' | 'leg_side' | 'straight';
    runningRisk: 'cautious' | 'normal' | 'aggressive';
    pairRunning?: 'hold_ones' | 'standard' | 'push_hard' | 'shield';
  };
  // Feature 6.1: DRS & Review Allocation
  reviewsRemaining?: { home: number; away: number };
  activeDrsReview?: DRSReviewState | null;
  // Feature 6.2: DLS & Dynamic Weather / Dew
  dlsState?: DLSState | null;
  hasDew?: boolean;
  // Feature 6.4: Match-up trap warning
  tacticalTrapAlert?: string | null;
  // Feature 6.6: Multi-Format mechanics
  powerSurgeTaken?: boolean; // BBL
  powerSurgeOversLeft?: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  category: 'GETTING STARTED' | 'MATCH FEATS' | 'SEASON' | 'CAREER' | 'INTERNATIONAL' | 'Getting Started' | 'Match Feats' | 'Dynasty & Career';
  unlocked: boolean;
  unlockedDate?: string;
  progress?: string;
  iconType: string;
  iconName?: string;
  icon?: string;
}

export interface JobOffer {
  id: string;
  type?: 'club' | 'national';
  name: string;
  organizationName?: string;
  leagueOrType?: string;
  ratingOvr?: number;
  salaryCr?: number;
  tag?: 'REBUILD PROJECT' | 'CONTENDER' | 'LATERAL MOVE' | 'WORLD STAGE' | 'PINNACLE' | 'POWERHOUSE';
  boardTarget?: string;
  nationId?: string;
  role?: string;
  format?: string;
  salaryPerYearCr?: number;
  expectations?: string;
  expiresDays?: number;
}

export interface CoachProfile {
  id?: string;
  name: string;
  age: number;
  nationality?: string;
  reputation?: string;
  difficulty: 'Easy' | 'Normal' | 'Hard';
  proUnlocked: boolean;
  activeCareerMode?: 'franchise' | 'international';
  clubTeamId: string | null;
  nationalTeamId: string | null;
  domesticTitles?: number;
  internationalTitles?: number;
  stats?: {
    matchesCoached?: number;
    matchesWon?: number;
    matchesLost?: number;
    matchesTied?: number;
    winPercentage?: number;
    bestWinStreak?: number;
    trophies?: string[];
  };
  domesticStats: {
    seasons: number;
    matches: number;
    wins: number;
    losses: number;
    winPct: number;
    titles: number;
    playoffRuns: number;
    bestStreak: number;
    currentStreak: number;
  };
  nationalStats: {
    matches: number;
    wins: number;
    losses: number;
    winPct: number;
    worldCups: number;
    rank: number;
  };
  boardTargets: {
    id: string;
    title: string;
    description: string;
    completed: boolean;
  }[];
  clubStints?: {
    id: string;
    teamId: string | null;
    teamName: string;
    clubId?: string;
    clubName?: string;
    period: string;
    yearsLabel?: string;
    seasons: number;
    matches: number;
    wins?: number;
    losses?: number;
    winPct: number;
    titles: number;
  }[];
  boardReviewsHistory?: CareerBoardReview[];
  completedInternationalSeriesIds?: string[];
}

export type CareerPhase =
  | 'league_stage'
  | 'playoffs'
  | 'season_final'
  | 'board_review'
  | 'career_decision'
  | 'retention'
  | 'auction'
  | 'squad_confirmation'
  | 'off_season_rest'
  | 'international_squad_selection'
  | 'international_series'
  | 'next_season_ready';

export interface ObjectiveResult {
  id: string;
  category: 'PRIMARY' | 'SECONDARY';
  title: string;
  description: string;
  targetStr: string;
  measuredStr: string;
  isFulfilled: boolean;
}

export interface CareerBoardReview {
  seasonYear: number;
  competitionId?: string;
  teamId: string | null;
  teamName: string;
  objectives: ObjectiveResult[];
  fulfilledCount: number;
  totalCount: number;
  scorePct: number; // fulfilled / total * 100
  isSatisfied: boolean; // scorePct >= 60
  verdictTitle: string;
  verdictDesc: string;
}

// ==========================================
// FEATURE 6.1: DRS & BALL-TRACKING ENGINE
// ==========================================
export interface DRSReviewState {
  isActive: boolean;
  reviewingTeamId: string;
  batterId?: string;
  batterName: string;
  bowlerId?: string;
  bowlerName: string;
  replacedBatterId?: string;
  type: 'lbw' | 'caught';
  snickoSpike: boolean;
  hawkeye: {
    pitching: 'In-line' | 'Outside Off' | 'Outside Leg';
    impact: 'In-line' | "Umpire's Call" | 'Outside Off';
    wickets: 'Hitting Stumps' | 'Missing Stumps' | "Umpire's Call";
  };
  originalDecision: 'OUT' | 'NOT OUT';
  finalDecision: 'OUT' | 'NOT OUT';
  isOverturned: boolean;
  reviewRetained: boolean;
}

// ==========================================
// FEATURE 6.2: DLS (DUCKWORTH-LEWIS-STERN)
// ==========================================
export interface DLSState {
  isInterrupted: boolean;
  revisedMaxOvers: number;
  originalMaxOvers: number;
  dlsTargetRuns: number;
  oversLost: number;
  dlsFormulaSummary: string;
}

// ==========================================
// FEATURE 6.5: SCOUTING & YOUTH ACADEMY
// ==========================================
export interface ScoutMission {
  id: string;
  tournament: 'Ranji Trophy' | 'Syed Mushtaq Ali Trophy' | 'ICC U-19 World Cup';
  region: string;
  specialty: 'Batting prodigy' | 'Mystery spinner' | 'Express pacer';
  daysLeft: number;
  costCr: number;
  status: 'active' | 'completed';
}

export interface UncappedProspect {
  id: string;
  name: string;
  age: number;
  role: PlayerRole;
  primaryRole: string;
  bowlingArm: 'RAF' | 'LAF' | 'ROB' | 'LS' | 'LSO';
  battingHand: 'RHB' | 'LHB';
  country: string;
  currentRating: number;
  potentialCeiling: number; // 85-99
  scoutingGrade: 'A+' | 'S-Tier' | 'Prodigy';
  tournamentSource: string;
  assignedCoach?: 'batting' | 'bowling' | 'none';
  signed: boolean;
}

// ==========================================
// FEATURE 6.3: DYNASTY & RETENTIONS
// ==========================================
export interface RetentionOption {
  playerId: string;
  tier: 1 | 2 | 3 | 4 | 'uncapped';
  deductionCr: number; // 18, 14, 11, 18, 4
}

// ==========================================
// PHASE 11: COMPLETED MATCH RECORDS & INBOX
// ==========================================
export interface CompletedMatchRecord {
  id: string;
  dateStr: string;
  homeTeam: string;
  awayTeam: string;
  summary: string;
  playerOfMatch: string;
  innings1: {
    team: string;
    runs: number;
    wickets: number;
    overs: string;
    batters: { name: string; runs: number; balls: number; fours: number; sixes: number; sr: number; isOut: boolean; outDesc?: string }[];
    bowlers: { name: string; overs: number; maidens: number; runs: number; wickets: number; econ: number }[];
  };
  innings2: {
    team: string;
    runs: number;
    wickets: number;
    overs: string;
    batters: { name: string; runs: number; balls: number; fours: number; sixes: number; sr: number; isOut: boolean; outDesc?: string }[];
    bowlers: { name: string; overs: number; maidens: number; runs: number; wickets: number; econ: number }[];
  };
}

export interface InboxMessage {
  id: string;
  playerId: string;
  playerName: string;
  jerseyNumber: number;
  isCaptain: boolean;
  role: string;
  dateLabel: string;
  subject: string;
  body: string;
  resolved: boolean;
  selectedReply?: string;
  impactSummary?: string;
}

export interface TournamentHonor {
  year: string | number;
  tournamentName: string;
  championTeamId: string;
  championTeamName: string;
  championLogo: string;
}

