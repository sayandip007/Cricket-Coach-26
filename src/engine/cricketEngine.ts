import {
  Player,
  BallOutcome,
  PitchLength,
  PitchLine,
  BowlingAngle,
  BattingApproach,
  FielderPosition,
  PitchType
} from '../types/cricket';

export interface MatchupTrapResult {
  isTrapTriggered: boolean;
  wicketMultiplier: number;
  trapName?: string;
  trapReason?: string;
}

export function evaluateMatchupTrap(
  striker: Player,
  bowler: Player,
  length: PitchLength,
  line: PitchLine
): MatchupTrapResult {
  const isPace =
    bowler.role === 'Pace' ||
    bowler.bowlingArm === 'RAF' ||
    bowler.bowlingArm === 'LAF' ||
    bowler.bowlingArm === 'RAM' ||
    bowler.bowlingArm === 'LAM';

  // 1. Explicit batter weakness matching
  const rawWeakness = (striker as Player & { weakness?: string; weaknessZone?: string }).weaknessZone || (striker as Player & { weakness?: string }).weakness;
  if (rawWeakness) {
    const w = rawWeakness.toLowerCase();
    if (w.includes('short') && (length === 'short' || length === 'bouncer') && isPace) {
      return {
        isTrapTriggered: true,
        wicketMultiplier: 1.38,
        trapName: 'Short-Ball Bodyline Trap',
        trapReason: `${bowler.name} exploits ${striker.name}'s short-ball weakness!`
      };
    }
    if (w.includes('spin') && !isPace) {
      return {
        isTrapTriggered: true,
        wicketMultiplier: 1.30,
        trapName: 'Spin Web Trap',
        trapReason: `${bowler.name} targets ${striker.name}'s vulnerability against spin!`
      };
    }
    if ((w.includes('off') || w.includes('swing')) && (line === 'outside_off' || line === 'off_stump') && isPace) {
      return {
        isTrapTriggered: true,
        wicketMultiplier: 1.32,
        trapName: '4th-Stump Corridor Trap',
        trapReason: `${bowler.name} probes ${striker.name}'s outside-off weakness!`
      };
    }
    if (w.includes('yorker') && length === 'yorker') {
      return {
        isTrapTriggered: true,
        wicketMultiplier: 1.35,
        trapName: 'Toe-Crusher Trap',
        trapReason: `${bowler.name} spears in the yorker at ${striker.name}'s base!`
      };
    }
  }

  // 2. Rating-based vulnerability traps
  const vsPace = striker.ratings.vp ?? striker.ratings.bat;
  const vsSpin = striker.ratings.vs ?? striker.ratings.bat;

  if (isPace && vsPace < 65 && (length === 'bouncer' || (length === 'good' && line === 'off_stump'))) {
    return {
      isTrapTriggered: true,
      wicketMultiplier: 1.25,
      trapName: 'High-Pace Examination',
      trapReason: `${bowler.name} tests ${striker.name}'s low vs-Pace rating (${vsPace})!`
    };
  }

  if (!isPace && vsSpin < 65 && (line === 'stumps' || line === 'outside_off')) {
    return {
      isTrapTriggered: true,
      wicketMultiplier: 1.25,
      trapName: 'Turning Track Examination',
      trapReason: `${bowler.name} attacks ${striker.name}'s low vs-Spin rating (${vsSpin})!`
    };
  }

  return { isTrapTriggered: false, wicketMultiplier: 1.0 };
}

export interface MatchSituationContext {
  currentInningsIndex?: 1 | 2;
  currentRuns?: number;
  wickets?: number;
  ballsCompleted?: number;
  maxBalls?: number;
  targetRuns?: number | null;
  strikerBallsFaced?: number;
  strikerRuns?: number;
}

export interface DeliveryInput {
  over: number;
  ballNumber?: number; // 0 to 5
  ballInOver?: number; // 1 to 6 (legacy alias)
  striker: Player;
  nonStriker: Player;
  bowler: Player;
  pitchType: PitchType;
  weather?: string;
  format?: 'T20' | 'ODI' | 'TEST';
  hasDew?: boolean;
  powerSurgeActive?: boolean;
  matchSituation?: MatchSituationContext;
  rng?: () => number;
  // Optional legacy top-level tactical overrides
  pairRunning?: 'hold_ones' | 'standard' | 'push_hard' | 'shield';
  intent?: 'contain' | 'standard' | 'attack';
  effort?: 'conserve' | 'standard' | 'max';
  keeperPos?: 'stumps' | 'normal';
  speed?: 'slower' | 'standard' | 'quicker';
  bowlingTactics: {
    length: PitchLength;
    line: PitchLine;
    angle: BowlingAngle;
    variation: string;
    fielders?: FielderPosition[];
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
}

export interface DeliveryProbabilityBreakdown {
  wideProb: number;
  noBallProb: number;
  byeLegByeProb: number;
  wicketProb: number;
  dotProb: number;
  singleProb: number;
  twoThreeProb: number;
  fourProb: number;
  sixProb: number;
  effectiveBat: number;
  effectiveBowl: number;
  skillDiff: number;
  isPace: boolean;
  isDeathOvers: boolean;
  isPowerplay: boolean;
}

/**
 * Deterministic Mulberry32 PRNG for reproducible tests and batch simulations.
 */
export function createSeededRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function isPaceBowler(bowler: Player): boolean {
  return (
    bowler.role === 'Pace' ||
    bowler.bowlingArm === 'RAF' ||
    bowler.bowlingArm === 'LAF' ||
    bowler.bowlingArm === 'RAM' ||
    bowler.bowlingArm === 'LAM'
  );
}

/**
 * Calculates effective batting skill (0-115 scale) factoring base rating, vsPace/vsSpin,
 * technique, temperament under pressure, form, fitness/fatigue, pitch, weather, dew, and settling-in.
 */
export function calculateEffectiveBattingSkill(
  striker: Player,
  bowler: Player,
  pitchType: PitchType,
  weather: string,
  hasDew?: boolean,
  matchSituation?: MatchSituationContext
): number {
  const isPace = isPaceBowler(bowler);
  const baseBat = striker.ratings.bat || 70;
  const matchupSkill = isPace
    ? (striker.ratings.vp ?? baseBat)
    : (striker.ratings.vs ?? baseBat);
  const tec = striker.ratings.tec ?? baseBat;
  const tmp = striker.ratings.tmp ?? 75;

  // Weighted core skill
  let effective = baseBat * 0.55 + matchupSkill * 0.30 + tec * 0.15;

  // Form modifier (-4.5 to +4.5)
  const form = striker.form ?? 75;
  effective += (form - 75) * 0.15;

  // Fitness / fatigue modifier
  const fitness = striker.fitness ?? 90;
  if (fitness < 75) {
    effective -= (75 - fitness) * 0.18;
  }

  // Settling-in modifier based on balls faced in current innings
  const ballsFaced = matchSituation?.strikerBallsFaced ?? 8;
  if (ballsFaced < 5) {
    effective -= (5 - ballsFaced) * 0.7; // New batter still getting sight of the pitch
  } else if (ballsFaced >= 15) {
    effective += Math.min(4.5, (ballsFaced - 14) * 0.22); // Set batter bonus
  }

  // Pitch effects on batting
  const normPitch = (pitchType || 'Natural').toLowerCase();
  if (normPitch.includes('flat')) {
    effective += 4.5;
  } else if (normPitch.includes('green')) {
    effective -= isPace ? 3.5 : 1.0;
  } else if (normPitch.includes('dry') || normPitch.includes('turn')) {
    effective -= isPace ? 0.5 : 3.5;
  } else if (normPitch.includes('sluggish') || normPitch.includes('two-paced')) {
    effective -= 2.5;
  }

  // Dew makes ball skid onto bat nicely
  if (hasDew) {
    effective += 2.5;
  }

  // Pressure / Temperament handling in chase or collapse
  const wickets = matchSituation?.wickets ?? 0;
  if (wickets >= 5) {
    // High temperament batters hold their nerve when wickets fall; low temperament batters suffer
    effective += (tmp - 72) * 0.14;
  }

  return clamp(effective, 30, 112);
}

/**
 * Calculates effective bowling skill (0-115 scale) factoring base bowling, control, death rating,
 * variation, discipline, pitch, weather, dew, new/old ball stage, and tactical alignment.
 */
export function calculateEffectiveBowlingSkill(
  bowler: Player,
  striker: Player,
  bowlingTactics: DeliveryInput['bowlingTactics'],
  pitchType: PitchType,
  weather: string,
  hasDew?: boolean,
  over: number = 0,
  format: 'T20' | 'ODI' | 'TEST' = 'T20'
): number {
  const isPace = isPaceBowler(bowler);
  const baseBowl = bowler.ratings.bowl || 70;
  const ctrl = bowler.ratings.ctrl || 70;
  const dth = bowler.ratings.dth || 68;
  const varRating = bowler.ratings.var ?? baseBowl;

  const isDeathOvers =
    (format === 'T20' && over >= 15) ||
    (format === 'ODI' && over >= 40);
  const isNewBall = over < 6;

  let effective = isDeathOvers
    ? baseBowl * 0.45 + dth * 0.35 + ctrl * 0.20
    : baseBowl * 0.55 + ctrl * 0.30 + varRating * 0.15;

  // Form & fitness
  const form = bowler.form ?? 75;
  effective += (form - 75) * 0.14;
  const fitness = bowler.fitness ?? 90;
  if (fitness < 75) {
    effective -= (75 - fitness) * 0.20;
  }

  // Pitch conditions
  const normPitch = (pitchType || 'Natural').toLowerCase();
  if (normPitch.includes('green')) {
    if (isPace) effective += isNewBall ? 6.0 : 4.0;
    else effective -= 1.5;
  } else if (normPitch.includes('dry') || normPitch.includes('turn')) {
    if (!isPace) effective += over >= 6 ? 6.0 : 4.0;
    else effective += bowlingTactics.speed === 'slower' ? 2.5 : -1.0;
  } else if (normPitch.includes('sluggish') || normPitch.includes('two-paced')) {
    if (!isPace || bowlingTactics.speed === 'slower' || bowlingTactics.variation === 'Off pitch') {
      effective += 4.5;
    }
  } else if (normPitch.includes('flat')) {
    effective -= 3.5;
  }

  // Weather conditions
  const normWeather = (weather || '').toLowerCase();
  if (normWeather.includes('overcast') || normWeather.includes('humid') || normWeather.includes('cloud')) {
    if (isPace) {
      effective += 3.5;
      if (bowlingTactics.variation === 'Swings in' || bowlingTactics.variation === 'Swings away') {
        effective += 2.0;
      }
    }
  } else if (normWeather.includes('sunny') || normWeather.includes('hot')) {
    if (!isPace && over >= 8) {
      effective += 2.5;
    }
  }

  // Dew penalizes grip (especially spinners)
  if (hasDew) {
    effective -= isPace ? 3.0 : 5.5;
  }

  // Bowling angle & handedness matchup
  const isLeftHandBatter = striker.battingHand === 'LHB';
  const isLeftArmBowler =
    bowler.bowlingArm === 'LAF' ||
    bowler.bowlingArm === 'LAM' ||
    bowler.bowlingArm === 'LSO';
  const angle = bowlingTactics.angle || 'over';
  // Classic tactical angles (e.g. round the wicket to LHB from RHB bowler or over the wicket cramping room)
  if ((isLeftHandBatter !== isLeftArmBowler && angle === 'round') || (isLeftHandBatter === isLeftArmBowler && angle === 'over')) {
    effective += 1.5;
  }

  // Variation synergy
  const variation = bowlingTactics.variation || 'Stock ball';
  if (variation !== 'Stock ball') {
    // High variation rating rewards using variations; low variation rating slightly penalizes execution
    effective += (varRating - 72) * 0.12;
  }

  return clamp(effective, 30, 112);
}

/**
 * Evaluates fielder geometry in [-100, 100] pitch-centered coordinates.
 * In LiveMatchEngine & TacticalStadium2D:
 * - Pitch center is (0, 0)
 * - Distance r = Math.hypot(x, y) in [0, 100], where r > 55 is boundary/deep, r <= 30 is close-catching
 * - Off-side vs Leg-side: for RHB, x > 0 is off-side and x < 0 is leg-side (reversed for LHB)
 * - Straight is |x| <= 28 and y > 15
 */
export function calculateFieldPlacementImpact(
  fielders: FielderPosition[] | undefined,
  targetSide: DeliveryInput['battingTactics']['targetSide'],
  battingHand: 'RHB' | 'LHB' = 'RHB'
): {
  boundaryRidersCount: number;
  closeCatchersCount: number;
  innerRingCount: number;
  targetSectorFielders: number;
  boundaryProtectionFactor: number;
  catchingPressureFactor: number;
  singleSqueezeFactor: number;
} {
  if (!fielders || fielders.length === 0) {
    return {
      boundaryRidersCount: 4,
      closeCatchersCount: 2,
      innerRingCount: 3,
      targetSectorFielders: 3,
      boundaryProtectionFactor: 1.0,
      catchingPressureFactor: 1.0,
      singleSqueezeFactor: 1.0
    };
  }

  const normalized = fielders.map(f => {
    const cx = f.x;
    const cy = f.y;
    const dist = Math.hypot(cx, cy);
    return { ...f, cx, cy, dist };
  });

  const boundaryRidersCount = normalized.filter(f => f.isBoundary || f.isDeep || f.dist > 55).length;
  const closeCatchersCount = normalized.filter(f => !f.isBoundary && !f.isDeep && f.dist <= 30).length;
  const innerRingCount = normalized.filter(f => !f.isBoundary && !f.isDeep && f.dist > 30 && f.dist <= 55).length;

  const isRHB = battingHand !== 'LHB';
  let targetSectorFielders = 3;
  if (targetSide === 'off_side') {
    targetSectorFielders = normalized.filter(f => (isRHB ? f.cx > 8 : f.cx < -8)).length;
  } else if (targetSide === 'leg_side') {
    targetSectorFielders = normalized.filter(f => (isRHB ? f.cx < -8 : f.cx > 8)).length;
  } else if (targetSide === 'straight') {
    targetSectorFielders = normalized.filter(f => Math.abs(f.cx) <= 32 && f.cy > 5).length;
  } else {
    targetSectorFielders = Math.round(normalized.length / 3);
  }

  // More boundary riders suppress 4s/6s; fewer boundary riders open up boundaries
  const boundaryProtectionFactor = clamp(1.0 - (boundaryRidersCount - 4) * 0.065, 0.72, 1.28);
  // Close catchers + crowding the target sector increase caught/wicket pressure
  const catchingPressureFactor = clamp(
    1.0 + (closeCatchersCount - 2) * 0.06 + (targetSectorFielders - 3) * 0.045,
    0.82,
    1.35
  );
  // Inner ring + close fielders squeeze quick singles
  const singleSqueezeFactor = clamp(
    1.0 - (innerRingCount + closeCatchersCount - 5) * 0.05,
    0.78,
    1.22
  );

  return {
    boundaryRidersCount,
    closeCatchersCount,
    innerRingCount,
    targetSectorFielders,
    boundaryProtectionFactor,
    catchingPressureFactor,
    singleSqueezeFactor
  };
}

/**
 * Selects a plausible fielder for a catch or run-out based on shotAngleDeg and shotDistanceM.
 */
export function selectDirectionalFielder(
  fielders: FielderPosition[] | undefined,
  shotAngleDeg: number,
  shotDistanceM: number,
  rng: () => number = Math.random
): string {
  if (!fielders || fielders.length === 0) {
    return shotDistanceM > 52 ? 'Deep Mid-Wicket' : 'Cover';
  }

  const isDeepShot = shotDistanceM >= 52;
  const isCloseShot = shotDistanceM <= 26;

  // Convert shotAngleDeg (0..360) to unit vector
  const rad = (shotAngleDeg * Math.PI) / 180;
  const targetUx = Math.cos(rad);
  const targetUy = Math.sin(rad);

  let bestFielder = fielders[0];
  let bestScore = Infinity;

  for (const f of fielders) {
    const cx = f.x;
    const cy = f.y;
    const dist = Math.hypot(cx, cy) || 1;
    const ux = cx / dist;
    const uy = cy / dist;

    // Cosine similarity in [ -1, 1 ] -> angular distance in [ 0, 2 ]
    const angularDist = 1 - (ux * targetUx + uy * targetUy);
    const fIsDeep = Boolean(f.isBoundary || f.isDeep || dist > 55);
    const fIsClose = dist <= 32;

    let ringPenalty = 0;
    if (isDeepShot && !fIsDeep) ringPenalty = 0.65;
    else if (isCloseShot && !fIsClose) ringPenalty = 0.55;
    else if (!isDeepShot && !isCloseShot && fIsDeep) ringPenalty = 0.35;

    const jitter = rng() * 0.08;
    const score = angularDist + ringPenalty + jitter;
    if (score < bestScore) {
      bestScore = score;
      bestFielder = f;
    }
  }

  return bestFielder?.name || 'Cover';
}

/**
 * Computes calibrated, bounded, mutually-exclusive delivery outcome probabilities summing to 1.0.
 */
export function calculateDeliveryProbabilities(input: DeliveryInput): DeliveryProbabilityBreakdown {
  const {
    over,
    striker,
    bowler,
    pitchType,
    weather = 'Clear Night',
    format = 'T20',
    hasDew,
    powerSurgeActive,
    matchSituation
  } = input;

  const bowlingTactics = {
    ...input.bowlingTactics,
    intent: input.bowlingTactics.intent || input.intent,
    effort: input.bowlingTactics.effort || input.effort,
    keeperPos: input.bowlingTactics.keeperPos || input.keeperPos,
    speed: input.bowlingTactics.speed || input.speed
  };
  const battingTactics = {
    ...input.battingTactics,
    pairRunning: input.battingTactics.pairRunning || input.pairRunning
  };

  const isPace = isPaceBowler(bowler);
  const isDeathOvers =
    (format === 'T20' && over >= 15) ||
    (format === 'ODI' && over >= 40);
  const isPowerplay =
    (format === 'T20' && over < 6) ||
    (format === 'ODI' && over < 10) ||
    Boolean(powerSurgeActive);

  const effectiveBat = calculateEffectiveBattingSkill(
    striker,
    bowler,
    pitchType,
    weather,
    hasDew,
    matchSituation
  );
  const effectiveBowl = calculateEffectiveBowlingSkill(
    bowler,
    striker,
    bowlingTactics,
    pitchType,
    weather,
    hasDew,
    over,
    format
  );

  // Positive skillDiff favors batter; negative favors bowler
  const skillDiff = clamp(effectiveBat - effectiveBowl, -28, 28);

  // 1. Format Baselines (calibrated for realistic scorecards across T20, ODI, TEST)
  let baseWicket = 0.046;
  let baseDot = 0.35;
  let baseSingle = 0.36;
  let baseTwoThree = 0.068;
  let baseFour = 0.112;
  let baseSix = 0.048;

  if (format === 'ODI') {
    baseWicket = 0.027;
    baseDot = 0.47;
    baseSingle = 0.355;
    baseTwoThree = 0.058;
    baseFour = 0.068;
    baseSix = 0.015;
  } else if (format === 'TEST') {
    baseWicket = 0.0185;
    baseDot = 0.715;
    baseSingle = 0.165;
    baseTwoThree = 0.042;
    baseFour = 0.048;
    baseSix = 0.005;
  }

  // 2. Extras probabilities (Wide, No-Ball, Bye/Leg-Bye)
  const ctrl = bowler.ratings.ctrl || 70;
  const dis = bowler.ratings.dis ?? ctrl;
  const controlDeficit = Math.max(0, 88 - (ctrl * 0.65 + dis * 0.35));

  let wideProb = format === 'TEST'
    ? 0.003 + controlDeficit * 0.00015
    : 0.012 + controlDeficit * 0.00055;
  let noBallProb = format === 'TEST'
    ? 0.002 + controlDeficit * 0.0001
    : 0.0035 + controlDeficit * 0.00018;
  let byeLegByeProb = 0.005;

  if (bowlingTactics.line === 'wide_outside_off' || bowlingTactics.line === 'leg_side') {
    wideProb *= 1.45;
  }
  if (bowlingTactics.effort === 'max' || bowlingTactics.speed === 'quicker') {
    wideProb *= 1.18;
    noBallProb *= 1.45;
  } else if (bowlingTactics.effort === 'conserve') {
    wideProb *= 0.82;
    noBallProb *= 0.75;
  }
  if (hasDew) {
    wideProb *= 1.25;
  }
  if (bowlingTactics.line === 'leg_side' || bowlingTactics.length === 'bouncer') {
    byeLegByeProb *= 1.4;
  }
  if (bowlingTactics.keeperPos === 'stumps' && isPace) {
    byeLegByeProb *= 1.5;
  }

  wideProb = clamp(wideProb, 0.001, 0.065);
  noBallProb = clamp(noBallProb, 0.0005, 0.025);
  byeLegByeProb = clamp(byeLegByeProb, 0.001, 0.025);

  // 3. Apply Skill Differential & Power Hitting
  let wicketProb = baseWicket * (1 - skillDiff * 0.009);
  let dotProb = baseDot * (1 - skillDiff * 0.0055);
  let singleProb = baseSingle * (1 + skillDiff * 0.0025);
  let twoThreeProb = baseTwoThree * (1 + skillDiff * 0.004);

  const power = striker.ratings.pow || 70;
  const powerFactorFour = 0.78 + (power / 100) * 0.44;
  const powerFactorSix = 0.55 + Math.pow(power / 100, 1.45) * 0.90;

  let fourProb = baseFour * (1 + skillDiff * 0.0085) * powerFactorFour;
  let sixProb = baseSix * (1 + skillDiff * 0.0095) * powerFactorSix;

  // 4. Batting Approach Modifiers (Meaningful & measurable trade-offs)
  const approach = battingTactics.approach || 'balanced';
  const strikerBalls = matchSituation?.strikerBallsFaced ?? 8;
  if (approach === 'defensive') {
    wicketProb *= 0.56;
    dotProb *= 1.11;
    singleProb *= 1.07;
    twoThreeProb *= 1.02;
    fourProb *= 0.72;
    sixProb *= 0.42;
  } else if (approach === 'anchor') {
    wicketProb *= 0.76;
    dotProb *= 1.05;
    singleProb *= 1.09;
    twoThreeProb *= 1.05;
    fourProb *= 0.85;
    sixProb *= 0.64;
  } else if (approach === 'aggressive') {
    wicketProb *= 1.24;
    dotProb *= 0.84;
    singleProb *= 1.00;
    twoThreeProb *= 1.08;
    fourProb *= 1.32;
    sixProb *= 1.46;
  } else if (approach === 'smash') {
    wicketProb *= 1.82;
    dotProb *= 0.78;
    singleProb *= 0.78;
    fourProb *= 1.48;
    sixProb *= 1.82;
    // Blind slogging before sighting the ball outside death overs carries extra edge/mis-hit risk
    if (!isDeathOvers && strikerBalls < 6) {
      wicketProb *= 1.22;
    }
  }

  // 5. Running Risk & Pair Running Modifiers
  const runningRisk = battingTactics.runningRisk || 'normal';
  const pairRunning = battingTactics.pairRunning || 'standard';
  const runSkill = striker.ratings.run ?? 75;
  const runSkillBonus = (runSkill - 75) * 0.003;

  if (runningRisk === 'cautious' || pairRunning === 'hold_ones') {
    singleProb *= 0.86;
    twoThreeProb *= 0.72;
    dotProb *= 1.08;
    wicketProb *= 0.94; // Few run-outs
  } else if (runningRisk === 'aggressive' || pairRunning === 'push_hard') {
    singleProb *= 1.14 + runSkillBonus;
    twoThreeProb *= 1.32 + runSkillBonus;
    dotProb *= 0.88;
    wicketProb *= 1.09; // Higher run-out risk
  } else if (pairRunning === 'shield') {
    singleProb *= 0.92;
    twoThreeProb *= 1.12;
  }

  // 6. Shot Direction (`targetSide`) vs Bowling Line & Field Placement
  const targetSide = battingTactics.targetSide || 'all';
  const line = bowlingTactics.line || 'outside_off';
  const fieldImpact = calculateFieldPlacementImpact(
    bowlingTactics.fielders,
    targetSide,
    striker.battingHand || 'RHB'
  );

  // Cross-batted / against-the-line risk vs with-the-line reward
  if (targetSide === 'leg_side' && (line === 'wide_outside_off' || line === 'outside_off')) {
    // Fetching from outside off to leg side: higher risk of leading edge / skying it
    wicketProb *= 1.16;
    fourProb *= 0.90;
  } else if (targetSide === 'off_side' && line === 'leg_side') {
    // Trying to force off-side off the pads: cramped for room
    wicketProb *= 1.14;
    fourProb *= 0.88;
  } else if (
    (targetSide === 'off_side' && (line === 'outside_off' || line === 'wide_outside_off')) ||
    (targetSide === 'leg_side' && line === 'leg_side') ||
    (targetSide === 'straight' && (line === 'stumps' || line === 'off_stump'))
  ) {
    // Playing with the line of the ball
    fourProb *= 1.12;
    sixProb *= 1.10;
    wicketProb *= 0.95;
  }

  // Apply actual field placement geometry factors
  fourProb *= fieldImpact.boundaryProtectionFactor;
  sixProb *= clamp(1.0 + (fieldImpact.boundaryProtectionFactor - 1.0) * 0.45, 0.84, 1.16);
  wicketProb *= fieldImpact.catchingPressureFactor;
  singleProb *= fieldImpact.singleSqueezeFactor;

  // 7. Bowling Length, Intent, Effort, Speed & Keeper Position Trade-offs
  const length = bowlingTactics.length || 'good';
  if (length === 'yorker') {
    // Yorkers depend heavily on bowler control & death skill: high control = lethal; low control = full-toss boundary risk
    const executionQuality = (ctrl * 0.55 + (bowler.ratings.dth || 70) * 0.45) / 80;
    if (executionQuality >= 1.0) {
      wicketProb *= 1.22;
      sixProb *= 0.52;
      fourProb *= 0.78;
      dotProb *= 1.12;
    } else {
      // Missed yorker becomes a slot ball / full toss
      wicketProb *= 1.05;
      fourProb *= 1.24;
      sixProb *= 1.15;
    }
  } else if (length === 'good') {
    dotProb *= 1.12;
    fourProb *= 0.88;
    sixProb *= 0.82;
    wicketProb *= 1.08;
  } else if (length === 'full') {
    wicketProb *= 1.14; // Swing/LBW/drive edge in play
    fourProb *= 1.15;   // Easier to drive
  } else if (length === 'short' || length === 'bouncer') {
    const pullHookSkill = (striker.ratings.vp ?? striker.ratings.bat) * 0.6 + power * 0.4;
    if (pullHookSkill >= 82) {
      fourProb *= 1.16;
      sixProb *= 1.22;
      wicketProb *= 1.08;
    } else {
      wicketProb *= 1.24;
      dotProb *= 1.08;
      fourProb *= 0.86;
    }
  }

  // Bowling intent
  const intent = bowlingTactics.intent || 'standard';
  if (intent === 'attack') {
    wicketProb *= 1.18;
    fourProb *= 1.14;
    sixProb *= 1.12;
  } else if (intent === 'contain') {
    wicketProb *= 0.84;
    fourProb *= 0.82;
    sixProb *= 0.78;
    dotProb *= 1.08;
    singleProb *= 1.06;
  }

  // Bowling effort
  const effort = bowlingTactics.effort || 'standard';
  if (effort === 'max') {
    wicketProb *= 1.10;
    fourProb *= 1.05;
  } else if (effort === 'conserve') {
    wicketProb *= 0.90;
    singleProb *= 1.06;
  }

  // Bowling speed variation
  const speed = bowlingTactics.speed || 'standard';
  const normPitch = (pitchType || 'Natural').toLowerCase();
  if (speed === 'slower') {
    if (isDeathOvers || normPitch.includes('sluggish') || normPitch.includes('dry')) {
      wicketProb *= 1.12;
      sixProb *= 0.82;
    } else {
      // Slower ball on a true pitch early on can be sat up and hit
      fourProb *= 1.10;
    }
  } else if (speed === 'quicker') {
    if (!isPace || normPitch.includes('green')) {
      dotProb *= 1.07;
      wicketProb *= 1.06;
    } else {
      fourProb *= 1.08; // Pace on the ball helps boundary hitters
    }
  }

  // Keeper position
  if (bowlingTactics.keeperPos === 'stumps') {
    // Standing up restricts batter charging and creates stumping chance, especially vs spin
    wicketProb *= isPace ? 1.04 : 1.10;
    dotProb *= 1.04;
  }

  // 8. Tactical Approach × Pitch / Matchup Interaction & Innings Phase Modifiers
  // Base pitch skill shift is already included in effectiveBat & effectiveBowl (no double counting).
  // Here we model how batting approach interacts with difficult vs flat conditions and matchup disadvantage:
  const isDifficultPitch =
    normPitch.includes('green') ||
    normPitch.includes('dry') ||
    normPitch.includes('turn') ||
    normPitch.includes('sluggish') ||
    normPitch.includes('two-paced');
  const isFlatPitch = normPitch.includes('flat');

  if (isDifficultPitch || skillDiff < -4) {
    if (approach === 'aggressive') {
      wicketProb *= 1.18;
      fourProb *= 0.90;
      sixProb *= 0.86;
    } else if (approach === 'smash') {
      wicketProb *= 1.30;
      fourProb *= 0.86;
      sixProb *= 0.82;
    } else if (approach === 'defensive' || approach === 'anchor') {
      // Watchful technique mitigates tricky pitch movement and rotates strike safely
      wicketProb *= 0.88;
      singleProb *= 1.05;
    }
  } else if (isFlatPitch && (approach === 'aggressive' || approach === 'smash') && skillDiff >= -2) {
    fourProb *= 1.08;
    sixProb *= 1.10;
    wicketProb *= 0.95;
  }

  if (isPowerplay && format !== 'TEST') {
    fourProb *= 1.16;
    dotProb *= 0.95;
  } else if (isDeathOvers) {
    sixProb *= 1.25;
    fourProb *= 1.12;
    wicketProb *= 1.20;
    dotProb *= 0.82;
  }

  // 9. Match Situation & Required Run Rate (Chase Urgency + Temperament)
  if (
    matchSituation &&
    matchSituation.targetRuns &&
    matchSituation.targetRuns > 0 &&
    matchSituation.maxBalls &&
    matchSituation.ballsCompleted !== undefined
  ) {
    const runsNeeded = Math.max(0, matchSituation.targetRuns - (matchSituation.currentRuns || 0));
    const ballsLeft = Math.max(1, matchSituation.maxBalls - matchSituation.ballsCompleted);
    const reqRunRate = (runsNeeded / ballsLeft) * 6;
    const tmp = striker.ratings.tmp || 75;

    if (reqRunRate > 11.5 && format !== 'TEST') {
      const urgency = clamp((reqRunRate - 10.5) / 6, 0.05, 0.45);
      fourProb *= 1 + urgency * 0.35;
      sixProb *= 1 + urgency * 0.55;
      dotProb *= 1 - urgency * 0.25;
      // High temperament mitigates panic wicket spike
      const panicFactor = clamp(1.15 - (tmp - 75) * 0.008, 0.85, 1.35);
      wicketProb *= 1 + urgency * 0.40 * panicFactor;
    } else if (reqRunRate < 6.0 && format !== 'TEST') {
      // Easy chase: lower risk
      wicketProb *= 0.82;
      singleProb *= 1.12;
    }
  }

  // 10. Matchup Trap Evaluation
  const trap = evaluateMatchupTrap(striker, bowler, bowlingTactics.length, bowlingTactics.line);
  if (trap.isTrapTriggered) {
    wicketProb *= trap.wicketMultiplier;
  }

  // 11. Clamp & Normalize so all mutually-exclusive probabilities sum to 1.0
  wicketProb = clamp(wicketProb, 0.004, format === 'TEST' ? 0.085 : 0.24);
  fourProb = clamp(fourProb, 0.01, 0.32);
  sixProb = clamp(sixProb, 0.001, 0.24);
  dotProb = clamp(dotProb, 0.08, 0.88);
  singleProb = clamp(singleProb, 0.05, 0.62);
  twoThreeProb = clamp(twoThreeProb, 0.01, 0.18);

  const nonExtraBudget = Math.max(0.85, 1.0 - (wideProb + noBallProb + byeLegByeProb));
  const rawSum = wicketProb + dotProb + singleProb + twoThreeProb + fourProb + sixProb;
  const scale = nonExtraBudget / (rawSum || 1);

  return {
    wideProb,
    noBallProb,
    byeLegByeProb,
    wicketProb: wicketProb * scale,
    dotProb: dotProb * scale,
    singleProb: singleProb * scale,
    twoThreeProb: twoThreeProb * scale,
    fourProb: fourProb * scale,
    sixProb: sixProb * scale,
    effectiveBat,
    effectiveBowl,
    skillDiff,
    isPace,
    isDeathOvers,
    isPowerplay
  };
}

function generateShotAngleForSide(
  targetSide: DeliveryInput['battingTactics']['targetSide'],
  battingHand: 'RHB' | 'LHB',
  rng: () => number
): number {
  const isRHB = battingHand !== 'LHB';
  if (targetSide === 'off_side') {
    // RHB off-side: roughly -60 to +70 deg (right half of wagon wheel)
    const base = isRHB ? -45 + rng() * 110 : 115 + rng() * 110;
    return (base + 360) % 360;
  }
  if (targetSide === 'leg_side') {
    const base = isRHB ? 115 + rng() * 110 : -45 + rng() * 110;
    return (base + 360) % 360;
  }
  if (targetSide === 'straight') {
    const base = 60 + rng() * 60;
    return (base + 360) % 360;
  }
  return Math.floor(rng() * 360);
}

export function simulateBall(input: DeliveryInput): BallOutcome {
  const {
    over,
    striker,
    nonStriker,
    bowler
  } = input;

  const ballNumber = input.ballNumber ?? (input.ballInOver ? input.ballInOver - 1 : 0);
  const bowlingTactics = {
    ...input.bowlingTactics,
    intent: input.bowlingTactics.intent || input.intent,
    effort: input.bowlingTactics.effort || input.effort,
    keeperPos: input.bowlingTactics.keeperPos || input.keeperPos,
    speed: input.bowlingTactics.speed || input.speed
  };
  const battingTactics = {
    ...input.battingTactics,
    pairRunning: input.battingTactics.pairRunning || input.pairRunning
  };

  const rng = input.rng || Math.random;
  const probs = calculateDeliveryProbabilities({
    ...input,
    ballNumber,
    bowlingTactics,
    battingTactics
  });
  const trap = evaluateMatchupTrap(striker, bowler, bowlingTactics.length, bowlingTactics.line);

  // Calculate realistic delivery speed in km/h and convert to m/s (bowlerSpeedMps)
  let baseKmh = probs.isPace
    ? 130 + (bowler.ratings.pace / 100) * 22
    : 82 + (bowler.ratings.pace / 100) * 16;
  if (bowlingTactics.speed === 'slower') baseKmh -= probs.isPace ? 14 : 6;
  else if (bowlingTactics.speed === 'quicker') baseKmh += probs.isPace ? 5 : 8;
  if (bowlingTactics.effort === 'max') baseKmh += 3;
  else if (bowlingTactics.effort === 'conserve') baseKmh -= 3;
  const speedKmh = Math.round(baseKmh + (rng() * 4 - 2));
  const speedMps = Number((speedKmh / 3.6).toFixed(1));

  const shotAngleDeg = Math.round(
    generateShotAngleForSide(battingTactics.targetSide, striker.battingHand || 'RHB', rng)
  );

  const roll = rng();

  // 1. WIDE DELIVERY (Illegal ball: +1 extra run, Charged to bowler, 0 batter runs, Stumping only if keeper up to spinner)
  if (roll < probs.wideProb) {
    const canBeStumpedOnWide =
      !probs.isPace &&
      bowlingTactics.keeperPos === 'stumps' &&
      (battingTactics.approach === 'aggressive' || battingTactics.approach === 'smash') &&
      rng() < 0.045;

    if (canBeStumpedOnWide) {
      return {
        over,
        ballNumber,
        bowlerId: bowler.id,
        bowlerName: bowler.name,
        strikerId: striker.id,
        strikerName: striker.name,
        nonStrikerId: nonStriker.id,
        nonStrikerName: nonStriker.name,
        runs: 1,
        batterRuns: 0,
        extraRuns: 1,
        bowlerChargedRuns: 1,
        isLegalDelivery: false,
        isWicket: true,
        wicketType: 'stumped',
        fielderName: 'Wicketkeeper',
        dismissedPlayerId: striker.id,
        dismissedPlayerName: striker.name,
        dismissalText: `st Wicketkeeper b ${bowler.name}`,
        appealType: 'none',
        isFour: false,
        isSix: false,
        isExtra: true,
        extraType: 'wide',
        bowlerSpeedMps: speedMps,
        shotAngleDeg: 0,
        shotDistanceM: 2,
        commentary: `WIDE & STUMPED! ${bowler.name} slips it down the side as ${striker.name} charges out, and the keeper whips the bails off in a flash!`,
        tacticalNote: `Standing up to the stumps on a wide delivery created the stumping!`
      };
    }

    return {
      over,
      ballNumber,
      bowlerId: bowler.id,
      bowlerName: bowler.name,
      strikerId: striker.id,
      strikerName: striker.name,
      nonStrikerId: nonStriker.id,
      nonStrikerName: nonStriker.name,
      runs: 1,
      batterRuns: 0,
      extraRuns: 1,
      bowlerChargedRuns: 1,
      isLegalDelivery: false,
      isWicket: false,
      isFour: false,
      isSix: false,
      isExtra: true,
      extraType: 'wide',
      bowlerSpeedMps: speedMps,
      shotAngleDeg: 0,
      shotDistanceM: 0,
      commentary: `${bowler.name} loses radar (${bowlingTactics.variation}, ${bowlingTactics.angle} the wicket) — signaled WIDE by the umpire.`,
      tacticalNote: `Extra run conceded. Pushing the line (${bowlingTactics.line.replace(/_/g, ' ')}) carries wide risk.`
    };
  }

  // 2. NO-BALL DELIVERY (Illegal ball: 1 penalty extra + possible runs off bat; ONLY run-out is legal dismissal!)
  if (roll < probs.wideProb + probs.noBallProb) {
    const batRoll = rng();
    let batterRuns = 0;
    if (batRoll < 0.14) batterRuns = 4;
    else if (batRoll < 0.22) batterRuns = 6;
    else if (batRoll < 0.52) batterRuns = 1;
    else if (batRoll < 0.60) batterRuns = 2;

    const totalRuns = 1 + batterRuns;
    const isFour = batterRuns === 4;
    const isSix = batterRuns === 6;

    return {
      over,
      ballNumber,
      bowlerId: bowler.id,
      bowlerName: bowler.name,
      strikerId: striker.id,
      strikerName: striker.name,
      nonStrikerId: nonStriker.id,
      nonStrikerName: nonStriker.name,
      runs: totalRuns,
      batterRuns,
      extraRuns: 1,
      bowlerChargedRuns: totalRuns,
      isLegalDelivery: false,
      isWicket: false, // Cannot be bowled/caught/lbw/stumped on a No-Ball
      isFour,
      isSix,
      isExtra: true,
      extraType: 'no_ball',
      bowlerSpeedMps: speedMps,
      shotAngleDeg: batterRuns > 0 ? shotAngleDeg : 0,
      shotDistanceM: isSix ? 82 : isFour ? 68 : batterRuns > 0 ? 32 : 5,
      commentary:
        batterRuns >= 4
          ? `NO BALL and punished! ${bowler.name} oversteps and ${striker.name} dispatches it for ${batterRuns}! (${totalRuns} total)`
          : `NO BALL! ${bowler.name} oversteps the front crease${batterRuns > 0 ? ` and they scamper ${batterRuns} off the bat` : ''}. Free Hit coming up!`,
      tacticalNote: `Overstepping costs ${totalRuns} run${totalRuns > 1 ? 's' : ''} and an extra delivery.`
    };
  }

  // 3. BYE / LEG-BYE DELIVERY (Legal delivery: counts in over & batter balls faced, 0 batter runs, 0 bowler runs conceded)
  if (roll < probs.wideProb + probs.noBallProb + probs.byeLegByeProb) {
    const extraType: 'bye' | 'leg_bye' =
      bowlingTactics.line === 'leg_side' || bowlingTactics.line === 'stumps' || rng() < 0.65
        ? 'leg_bye'
        : 'bye';
    const rRoll = rng();
    const extraRuns = rRoll < 0.08 ? 4 : rRoll < 0.22 ? 2 : 1;

    return {
      over,
      ballNumber,
      bowlerId: bowler.id,
      bowlerName: bowler.name,
      strikerId: striker.id,
      strikerName: striker.name,
      nonStrikerId: nonStriker.id,
      nonStrikerName: nonStriker.name,
      runs: extraRuns,
      batterRuns: 0,
      extraRuns,
      bowlerChargedRuns: 0,
      isLegalDelivery: true,
      isWicket: false,
      isFour: extraRuns === 4,
      isSix: false,
      isExtra: true,
      extraType,
      bowlerSpeedMps: speedMps,
      shotAngleDeg,
      shotDistanceM: extraRuns === 4 ? 66 : 22,
      commentary:
        extraType === 'leg_bye'
          ? `Clips the pad of ${striker.name} and rolls away for ${extraRuns} leg-bye${extraRuns > 1 ? 's' : ''}.`
          : `Beats bat and keeper! They cross for ${extraRuns} bye${extraRuns > 1 ? 's' : ''}.`,
      tacticalNote: `Legal delivery — ${extraRuns} ${extraType.replace('_', '-')} added to team extras (not charged to bowler).`
    };
  }

  // 4. WICKET OUTCOME (Legal delivery)
  const wThreshold = probs.wideProb + probs.noBallProb + probs.byeLegByeProb + probs.wicketProb;
  if (roll < wThreshold) {
    const wRoll = rng();
    let wicketType: 'bowled' | 'caught' | 'lbw' | 'run out' | 'stumped' = 'caught';

    const isAggressiveRun =
      battingTactics.runningRisk === 'aggressive' || battingTactics.pairRunning === 'push_hard';
    const isStumpLine = bowlingTactics.line === 'stumps' || bowlingTactics.line === 'off_stump';
    const isFullOrGood =
      bowlingTactics.length === 'yorker' ||
      bowlingTactics.length === 'full' ||
      bowlingTactics.length === 'good';

    if (isAggressiveRun && wRoll < 0.14) {
      wicketType = 'run out';
    } else if (
      !probs.isPace &&
      (bowlingTactics.keeperPos === 'stumps' || battingTactics.approach === 'aggressive' || battingTactics.approach === 'smash') &&
      wRoll < 0.24
    ) {
      wicketType = 'stumped';
    } else if (isStumpLine && isFullOrGood && wRoll < 0.52) {
      wicketType = wRoll < 0.30 ? 'bowled' : 'lbw';
    } else if (bowlingTactics.length === 'yorker' && wRoll < 0.62) {
      wicketType = 'bowled';
    } else {
      wicketType = 'caught';
    }

    const wicketDistanceM =
      wicketType === 'caught'
        ? battingTactics.approach === 'smash' || battingTactics.approach === 'aggressive'
          ? Math.round(48 + rng() * 28)
          : Math.round(16 + rng() * 34)
        : 8;

    const chosenFielderName =
      wicketType === 'caught' || wicketType === 'run out'
        ? selectDirectionalFielder(bowlingTactics.fielders, shotAngleDeg, wicketDistanceM, rng)
        : wicketType === 'stumped'
        ? 'Wicketkeeper'
        : undefined;

    let dismissalText = `b ${bowler.name}`;
    let commentary = '';

    if (wicketType === 'caught') {
      dismissalText = `c ${chosenFielderName || 'Fielder'} b ${bowler.name}`;
      commentary = `OUT! CAUGHT! ${striker.name} goes ${battingTactics.approach} (${battingTactics.targetSide.replace('_', ' ')}) against ${bowler.name}'s ${bowlingTactics.variation} and mistimes it straight to ${chosenFielderName || 'the fielder'}!`;
    } else if (wicketType === 'bowled') {
      dismissalText = `b ${bowler.name}`;
      commentary = `CLEAN BOWLED! ${bowler.name} (${speedKmh} km/h, ${bowlingTactics.angle} the wicket) beats ${striker.name} all ends up and crashes into the stumps!`;
    } else if (wicketType === 'lbw') {
      dismissalText = `lbw b ${bowler.name}`;
      commentary = `HUGE APPEAL AND GIVEN LBW! ${bowler.name} traps ${striker.name} right in front with a ${bowlingTactics.length} delivery on ${bowlingTactics.line.replace(/_/g, ' ')}!`;
    } else if (wicketType === 'stumped') {
      dismissalText = `st Wicketkeeper b ${bowler.name}`;
      commentary = `STUMPED! ${striker.name} dances down the track to ${bowler.name}, deceived in flight (${bowlingTactics.variation}), and the keeper whips off the bails!`;
    } else {
      dismissalText = `run out (${chosenFielderName || 'Fielder'})`;
      commentary = `RUN OUT! High-risk calling (${battingTactics.runningRisk}) backfires — ${chosenFielderName || 'the fielder'} hits the stumps directly with ${striker.name} short of the crease!`;
    }

    if (trap.isTrapTriggered && trap.trapName) {
      commentary = `🎯 TACTICAL MASTERCLASS (${trap.trapName})! ` + commentary;
    }

    const appealType: 'lbw' | 'caught_behind' | 'none' =
      wicketType === 'lbw'
        ? 'lbw'
        : wicketType === 'caught' && wicketDistanceM <= 25
        ? 'caught_behind'
        : 'none';

    return {
      over,
      ballNumber,
      bowlerId: bowler.id,
      bowlerName: bowler.name,
      strikerId: striker.id,
      strikerName: striker.name,
      nonStrikerId: nonStriker.id,
      nonStrikerName: nonStriker.name,
      runs: 0,
      batterRuns: 0,
      extraRuns: 0,
      bowlerChargedRuns: 0,
      isLegalDelivery: true,
      isWicket: true,
      wicketType,
      fielderName: chosenFielderName,
      dismissedPlayerId: striker.id,
      dismissedPlayerName: striker.name,
      dismissalText,
      appealType,
      isFour: false,
      isSix: false,
      isExtra: false,
      bowlerSpeedMps: speedMps,
      shotAngleDeg,
      shotDistanceM: wicketDistanceM,
      commentary,
      tacticalNote:
        trap.isTrapTriggered && trap.trapReason
          ? trap.trapReason
          : `Bowling plan (${bowlingTactics.length} / ${bowlingTactics.line.replace(/_/g, ' ')} / ${bowlingTactics.variation}) created the breakthrough!`
    };
  }

  // 5. SIX OUTCOME
  const sixThreshold = wThreshold + probs.sixProb;
  if (roll < sixThreshold) {
    const distance = Math.round(74 + (striker.ratings.pow / 100) * 24 + rng() * 8);
    return {
      over,
      ballNumber,
      bowlerId: bowler.id,
      bowlerName: bowler.name,
      strikerId: striker.id,
      strikerName: striker.name,
      nonStrikerId: nonStriker.id,
      nonStrikerName: nonStriker.name,
      runs: 6,
      batterRuns: 6,
      extraRuns: 0,
      bowlerChargedRuns: 6,
      isLegalDelivery: true,
      isWicket: false,
      isFour: false,
      isSix: true,
      isExtra: false,
      bowlerSpeedMps: speedMps,
      shotAngleDeg,
      shotDistanceM: distance,
      commentary: `MASSIVE SIX! ${striker.name} picks the ${bowlingTactics.variation} early and launches ${bowler.name} ${distance}m into the stands!`,
      tacticalNote: `Power (${striker.ratings.pow}) + ${battingTactics.approach} approach cleared the ropes.`
    };
  }

  // 6. FOUR OUTCOME
  const fourThreshold = sixThreshold + probs.fourProb;
  if (roll < fourThreshold) {
    return {
      over,
      ballNumber,
      bowlerId: bowler.id,
      bowlerName: bowler.name,
      strikerId: striker.id,
      strikerName: striker.name,
      nonStrikerId: nonStriker.id,
      nonStrikerName: nonStriker.name,
      runs: 4,
      batterRuns: 4,
      extraRuns: 0,
      bowlerChargedRuns: 4,
      isLegalDelivery: true,
      isWicket: false,
      isFour: true,
      isSix: false,
      isExtra: false,
      bowlerSpeedMps: speedMps,
      shotAngleDeg,
      shotDistanceM: 66,
      commentary: `CRACKING FOUR! ${striker.name} pierces the ${battingTactics.targetSide === 'all' ? 'infield' : battingTactics.targetSide.replace('_', ' ')} gap off ${bowler.name} (${speedKmh} km/h)!`,
      tacticalNote: `Clean placement beat the field protection.`
    };
  }

  // 7. TWO OR THREE RUNS
  const twoThreeThreshold = fourThreshold + probs.twoThreeProb;
  if (roll < twoThreeThreshold) {
    const runs = rng() < 0.86 ? 2 : 3;
    return {
      over,
      ballNumber,
      bowlerId: bowler.id,
      bowlerName: bowler.name,
      strikerId: striker.id,
      strikerName: striker.name,
      nonStrikerId: nonStriker.id,
      nonStrikerName: nonStriker.name,
      runs,
      batterRuns: runs,
      extraRuns: 0,
      bowlerChargedRuns: runs,
      isLegalDelivery: true,
      isWicket: false,
      isFour: false,
      isSix: false,
      isExtra: false,
      bowlerSpeedMps: speedMps,
      shotAngleDeg,
      shotDistanceM: Math.round(44 + rng() * 16),
      commentary: `Driven into the deep pocket — ${striker.name} and ${nonStriker.name} push hard (${battingTactics.runningRisk}) to come back for ${runs}!`,
      tacticalNote: `Good running between the wickets converts the gap into ${runs} runs.`
    };
  }

  // 8. SINGLE (1 RUN)
  const singleThreshold = twoThreeThreshold + probs.singleProb;
  if (roll < singleThreshold) {
    return {
      over,
      ballNumber,
      bowlerId: bowler.id,
      bowlerName: bowler.name,
      strikerId: striker.id,
      strikerName: striker.name,
      nonStrikerId: nonStriker.id,
      nonStrikerName: nonStriker.name,
      runs: 1,
      batterRuns: 1,
      extraRuns: 0,
      bowlerChargedRuns: 1,
      isLegalDelivery: true,
      isWicket: false,
      isFour: false,
      isSix: false,
      isExtra: false,
      bowlerSpeedMps: speedMps,
      shotAngleDeg,
      shotDistanceM: Math.round(24 + rng() * 20),
      commentary: `${striker.name} works ${bowler.name} into the gap and rotates the strike for a quick single.`,
      tacticalNote: `Smart strike rotation keeps the scoreboard ticking.`
    };
  }

  // 9. DOT BALL (0 RUNS)
  const isCloseLbwShout =
    (bowlingTactics.line === 'stumps' || bowlingTactics.line === 'off_stump') &&
    (bowlingTactics.length === 'good' || bowlingTactics.length === 'full') &&
    rng() < 0.14;
  const isCloseEdgeShout =
    (bowlingTactics.line === 'outside_off' || bowlingTactics.line === 'off_stump') &&
    rng() < 0.10;
  const dotAppealType: 'lbw' | 'caught_behind' | 'none' = isCloseLbwShout
    ? 'lbw'
    : isCloseEdgeShout
    ? 'caught_behind'
    : 'none';

  return {
    over,
    ballNumber,
    bowlerId: bowler.id,
    bowlerName: bowler.name,
    strikerId: striker.id,
    strikerName: striker.name,
    nonStrikerId: nonStriker.id,
    nonStrikerName: nonStriker.name,
    runs: 0,
    batterRuns: 0,
    extraRuns: 0,
    bowlerChargedRuns: 0,
    isLegalDelivery: true,
    isWicket: false,
    appealType: dotAppealType,
    isFour: false,
    isSix: false,
    isExtra: false,
    bowlerSpeedMps: speedMps,
    shotAngleDeg,
    shotDistanceM: Math.round(10 + rng() * 14),
    commentary:
      dotAppealType === 'lbw'
        ? `LOUD SHOUT FOR LBW! ${bowler.name} raps ${striker.name} on the pads (${speedKmh} km/h) — umpire shakes their head! Not Out!`
        : dotAppealType === 'caught_behind'
        ? ` OOH! Beats the outside edge of ${striker.name}! Keeper and slips go up for Caught Behind, but the umpire says Not Out!`
        : `${bowler.name} hits a probing ${bowlingTactics.length} length on ${bowlingTactics.line.replace(/_/g, ' ')} (${speedKmh} km/h) — defended solidly by ${striker.name}. Dot ball.`,
    tacticalNote:
      dotAppealType !== 'none'
        ? `Close shout (${dotAppealType.replace('_', ' ').toUpperCase()})! Fielding captain can consider a DRS review.`
        : `Tight bowling builds dot-ball pressure.`
  };
}

export * from './matchResolutionEngine';

