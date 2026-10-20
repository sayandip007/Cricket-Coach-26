import { BallOutcome, FielderPosition, PitchLength, PitchLine } from '../types/cricket';

export interface Point2D {
  x: number;
  y: number;
}

export interface FielderAnimState {
  id: number;
  name: string;
  x: number;
  y: number;
  isChasing: boolean;
  action: 'idle' | 'chasing' | 'diving' | 'catching' | 'throwing';
}

export interface AnimationFrameState {
  progress: number; // 0.0 to 1.0
  phase: number; // 1 to 10
  phaseName: string;
  
  // Bowler
  bowlerPos: Point2D;
  bowlerArmAngle: number; // degrees
  bowlerPhase: 'runup' | 'stride' | 'release' | 'followThrough' | 'recovery';
  
  // Ball
  ballPos: Point2D;
  ballHeight: number; // Z-axis height offset in pixels
  ballShadowPos: Point2D;
  showBall: boolean;
  ballTrailPoints: Point2D[];
  
  // Visual Effects
  isContactImpact: boolean;
  isTurfDust: boolean;
  isBoundarySplash: boolean;
  
  // Batting
  strikerPos: Point2D;
  strikerBatAngle: number;
  strikerPose: 'stance' | 'backlift' | 'drive' | 'cut' | 'pull' | 'loft' | 'defense' | 'miss' | 'wicket' | 'running';
  nonStrikerPos: Point2D;
  
  // Wicketkeeper
  keeperPos: Point2D;
  keeperAction: 'set' | 'collect' | 'catch' | 'stump' | 'runout';
  
  // Wickets & Bails
  bailsDislodged: boolean;
  bailLeftOffset: Point2D;
  bailRightOffset: Point2D;
  
  // Fielders
  fielders: FielderAnimState[];
  
  // Return throw
  throwLine?: {
    from: Point2D;
    to: Point2D;
    progress: number;
  };
}

const CX = 200;
const CY = 200;
const BOUNDARY_R = 163;
const TOP_CREASE_Y = 168;
const BOTTOM_CREASE_Y = 232;
const BOWLER_BASE_Y = 147;
const KEEPER_BASE_Y = 254;

export function toSvgCoords(fx: number, fy: number): Point2D {
  return {
    x: CX + fx * 1.52,
    y: CY + fy * 1.52,
  };
}

export function computeBouncePoint(length?: PitchLength, line?: PitchLine): Point2D {
  let y = TOP_CREASE_Y + (BOTTOM_CREASE_Y - TOP_CREASE_Y) * 0.65; // default good length
  if (length === 'bouncer' || length === 'short') {
    y = TOP_CREASE_Y + (BOTTOM_CREASE_Y - TOP_CREASE_Y) * 0.35;
  } else if (length === 'full') {
    y = TOP_CREASE_Y + (BOTTOM_CREASE_Y - TOP_CREASE_Y) * 0.80;
  } else if (length === 'yorker') {
    y = TOP_CREASE_Y + (BOTTOM_CREASE_Y - TOP_CREASE_Y) * 0.94;
  }

  let x = CX; // off stump / stumps
  if (line === 'wide_outside_off') {
    x = CX - 12;
  } else if (line === 'outside_off') {
    x = CX - 6;
  } else if (line === 'leg_side') {
    x = CX + 7;
  }

  return { x, y };
}

export function computeShotTarget(outcome: BallOutcome): Point2D {
  // If dot ball or missed/bowled/lbw without runs, target is near crease or keeper
  if (!outcome.runs && !outcome.isFour && !outcome.isSix && !outcome.isWicket) {
    return { x: CX, y: BOTTOM_CREASE_Y + 12 };
  }

  const rad = ((outcome.shotAngleDeg - 90) * Math.PI) / 180;
  let rawDist = Math.max(25, (outcome.shotDistanceM / 82) * BOUNDARY_R);

  if (outcome.isSix) {
    rawDist = BOUNDARY_R + 18; // Over boundary rope
  } else if (outcome.isFour) {
    rawDist = BOUNDARY_R + 6; // At or beyond rope
  }

  return {
    x: CX + Math.cos(rad) * rawDist,
    y: CY + Math.sin(rad) * rawDist,
  };
}

export function computeAnimationFrame(
  progress: number,
  outcome: BallOutcome | null,
  fielders: FielderPosition[],
  plannedLength?: PitchLength,
  plannedLine?: PitchLine,
  strikerHand: 'RHB' | 'LHB' = 'RHB',
  bowlerRole: string = 'Pace'
): AnimationFrameState {
  const p = Math.max(0, Math.min(1, progress));

  // Default Rest Frame
  if (!outcome) {
    return {
      progress: 1,
      phase: 10,
      phaseName: 'Setup',
      bowlerPos: { x: CX, y: BOWLER_BASE_Y },
      bowlerArmAngle: 0,
      bowlerPhase: 'recovery',
      ballPos: { x: CX, y: TOP_CREASE_Y },
      ballHeight: 0,
      ballShadowPos: { x: CX, y: TOP_CREASE_Y },
      showBall: false,
      ballTrailPoints: [],
      isContactImpact: false,
      isTurfDust: false,
      isBoundarySplash: false,
      strikerPos: { x: CX - 2, y: BOTTOM_CREASE_Y },
      strikerBatAngle: 0,
      strikerPose: 'stance',
      nonStrikerPos: { x: CX + 2, y: TOP_CREASE_Y },
      keeperPos: { x: CX - 4, y: KEEPER_BASE_Y },
      keeperAction: 'set',
      bailsDislodged: false,
      bailLeftOffset: { x: 0, y: 0 },
      bailRightOffset: { x: 0, y: 0 },
      fielders: fielders.map(f => ({
        id: f.id,
        name: f.name,
        ...toSvgCoords(f.x, f.y),
        isChasing: false,
        action: 'idle',
      })),
    };
  }

  const isSpin = bowlerRole.toLowerCase().includes('spin');
  const bouncePt = computeBouncePoint(plannedLength, plannedLine);
  const shotTarget = computeShotTarget(outcome);

  // Determine active chaser fielder index
  let activeChaserIdx = -1;
  let minFielderDist = Infinity;
  fielders.forEach((f, idx) => {
    const pos = toSvgCoords(f.x, f.y);
    const d = Math.hypot(pos.x - shotTarget.x, pos.y - shotTarget.y);
    if (d < minFielderDist) {
      minFielderDist = d;
      activeChaserIdx = idx;
    }
  });

  // Calculate 10-Phase Animation Progression
  let phase = 1;
  let phaseName = 'Run-up';
  let bowlerPos: Point2D = { x: CX, y: BOWLER_BASE_Y - 24 };
  let bowlerArmAngle = 0;
  let bowlerPhase: AnimationFrameState['bowlerPhase'] = 'runup';

  let ballPos: Point2D = { x: CX, y: TOP_CREASE_Y };
  let ballHeight = 0;
  let showBall = true;
  let ballTrailPoints: Point2D[] = [];

  let isContactImpact = false;
  let isTurfDust = false;
  let isBoundarySplash = false;

  let strikerPos: Point2D = { x: CX - 2, y: BOTTOM_CREASE_Y };
  let strikerBatAngle = 0;
  let strikerPose: AnimationFrameState['strikerPose'] = 'stance';

  let nonStrikerPos: Point2D = { x: CX + 2, y: TOP_CREASE_Y };

  let keeperPos: Point2D = { x: CX - 4, y: KEEPER_BASE_Y };
  let keeperAction: AnimationFrameState['keeperAction'] = 'set';

  let bailsDislodged = false;
  let bailLeftOffset = { x: 0, y: 0 };
  let bailRightOffset = { x: 0, y: 0 };

  // Phase Boundaries (0.0 to 1.0)
  // P1: 0.00 -> 0.18 (Run-up)
  // P2: 0.18 -> 0.22 (Stride & Release)
  // P3: 0.22 -> 0.27 (Delivery Flight)
  // P4: 0.27 -> 0.30 (Pitch Bounce)
  // P5: 0.22 -> 0.32 (Shot Backlift & Footwork)
  // P6: 0.30 -> 0.35 (Contact / Impact)
  // P7: 0.35 -> 0.70 (Ball Flight / Outfield Travel)
  // P8: 0.35 -> 0.85 (Running Between Wickets)
  // P9: 0.50 -> 0.90 (Fielding / Catch / Throw / Run-out)
  // P10: 0.90 -> 1.00 (Resolution / Recovery)

  if (p < 0.18) {
    // PHASE 1: BOWLER RUN-UP
    phase = 1;
    phaseName = 'Run-up';
    const t = p / 0.18;
    const runupDist = isSpin ? 14 : 26;
    bowlerPos = { x: CX, y: (BOWLER_BASE_Y - runupDist) + runupDist * t };
    bowlerArmAngle = Math.sin(t * Math.PI * 4) * 20;
    bowlerPhase = 'runup';
    showBall = false; // ball in hand
    strikerPose = 'stance';
    strikerBatAngle = -10;
  } else if (p < 0.22) {
    // PHASE 2: DELIVERY STRIDE & RELEASE
    phase = 2;
    phaseName = 'Release';
    const t = (p - 0.18) / 0.04;
    bowlerPos = { x: CX, y: BOWLER_BASE_Y };
    bowlerArmAngle = -180 * t; // High arm rotation
    bowlerPhase = 'release';
    showBall = true;
    ballPos = { x: CX, y: BOWLER_BASE_Y - 4 };
    ballHeight = 8;
    strikerPose = 'backlift';
    strikerBatAngle = -35;
  } else if (p < 0.30) {
    // PHASE 3 & 4: DELIVERY FLIGHT & PITCH BOUNCE
    const t = (p - 0.22) / 0.08;
    showBall = true;
    bowlerPos = { x: CX, y: BOWLER_BASE_Y + 4 };
    bowlerPhase = 'followThrough';

    if (t <= 0.65) {
      // Pre-bounce delivery flight down pitch
      phase = 3;
      phaseName = 'Delivery Flight';
      const subT = t / 0.65;
      ballPos = {
        x: CX + (bouncePt.x - CX) * subT,
        y: TOP_CREASE_Y + (bouncePt.y - TOP_CREASE_Y) * subT,
      };
      ballHeight = Math.sin(subT * Math.PI) * 12; // arc in air before bounce
    } else {
      // Pitch Bounce
      phase = 4;
      phaseName = 'Pitch Bounce';
      isTurfDust = true;
      const subT = (t - 0.65) / 0.35;
      ballPos = {
        x: bouncePt.x + (CX - bouncePt.x) * subT,
        y: bouncePt.y + (BOTTOM_CREASE_Y - bouncePt.y) * subT,
      };
      ballHeight = Math.sin(subT * Math.PI) * 5;
    }

    // Striker shot prep footwork
    strikerPose = plannedLength === 'short' || plannedLength === 'bouncer' ? 'pull' : 'drive';
    strikerBatAngle = -45 + t * 40;
  } else if (p < 0.35) {
    // PHASE 5 & 6: SHOT CONTACT & BAT SWING
    phase = 6;
    phaseName = 'Shot Contact';
    const t = (p - 0.30) / 0.05;
    bowlerPos = { x: CX, y: BOWLER_BASE_Y + 6 };
    bowlerPhase = 'recovery';

    isContactImpact = !outcome.isExtra && outcome.runs > 0 || outcome.isFour || outcome.isSix || outcome.wicketType === 'caught';
    
    // Position ball near bat / contact point
    ballPos = {
      x: CX + (shotTarget.x - CX) * (t * 0.15),
      y: BOTTOM_CREASE_Y + (shotTarget.y - BOTTOM_CREASE_Y) * (t * 0.15),
    };

    if (outcome.wicketType === 'bowled' || (outcome.isWicket && !outcome.runs && outcome.wicketType === 'lbw')) {
      ballPos = { x: CX, y: BOTTOM_CREASE_Y + 8 };
      if (outcome.wicketType === 'bowled') {
        bailsDislodged = true;
        bailLeftOffset = { x: -8, y: -12 };
        bailRightOffset = { x: 8, y: -10 };
      }
    }

    if (outcome.isFour || outcome.isSix) {
      strikerPose = 'loft';
      strikerBatAngle = 60;
    } else if (outcome.runs > 0) {
      strikerPose = 'drive';
      strikerBatAngle = 45;
    } else if (outcome.wicketType === 'bowled' || outcome.wicketType === 'lbw') {
      strikerPose = 'miss';
      strikerBatAngle = 15;
    } else {
      strikerPose = 'defense';
      strikerBatAngle = 10;
    }
  } else if (p < 0.70) {
    // PHASE 7: BALL FLIGHT & OUTFIELD TRAVEL
    phase = 7;
    phaseName = 'Ball Flight';
    const t = (p - 0.35) / 0.35;
    bowlerPos = { x: CX, y: BOWLER_BASE_Y + 4 };

    // Ball travel to shot target or stumps
    if (outcome.wicketType === 'bowled') {
      ballPos = { x: CX, y: BOTTOM_CREASE_Y + 10 };
      bailsDislodged = true;
      bailLeftOffset = { x: -14 * t, y: -18 * t };
      bailRightOffset = { x: 16 * t, y: -16 * t };
      keeperAction = 'collect';
    } else {
      const easeOut = 1 - Math.pow(1 - t, 2);
      ballPos = {
        x: CX + (shotTarget.x - CX) * easeOut,
        y: BOTTOM_CREASE_Y + (shotTarget.y - BOTTOM_CREASE_Y) * easeOut,
      };

      if (outcome.isSix) {
        ballHeight = Math.sin(t * Math.PI) * 32; // high lofted six arc
        if (t > 0.85) isBoundarySplash = true;
      } else if (outcome.wicketType === 'caught' && outcome.shotDistanceM > 40) {
        ballHeight = Math.sin(t * Math.PI) * 22; // catch trajectory
      } else if (outcome.isFour) {
        ballHeight = Math.sin(t * Math.PI * 2) * 4; // skimmer / bouncing four
        if (t > 0.90) isBoundarySplash = true;
      } else {
        ballHeight = Math.max(0, (1 - t) * 6); // ground shot rolling to a stop
      }
    }

    // Trail recording
    ballTrailPoints.push({ x: ballPos.x, y: ballPos.y });
  } else if (p < 0.90) {
    // PHASE 8 & 9: FIELDING, CATCH, THROW & RUNNING BETWEEN WICKETS
    phase = 9;
    phaseName = 'Fielding & Running';
    const t = (p - 0.70) / 0.20;

    if (outcome.wicketType === 'stumped') {
      keeperAction = 'stump';
      bailsDislodged = true;
      bailLeftOffset = { x: -8, y: -10 };
      bailRightOffset = { x: 8, y: -8 };
      ballPos = { x: CX - 2, y: BOTTOM_CREASE_Y + 12 };
    } else if (outcome.isFour || outcome.isSix) {
      ballPos = shotTarget;
      isBoundarySplash = true;
    } else if (outcome.wicketType === 'caught' && activeChaserIdx >= 0) {
      const catchPos = toSvgCoords(fielders[activeChaserIdx].x, fielders[activeChaserIdx].y);
      ballPos = catchPos;
      keeperAction = 'catch';
    } else {
      // Return throw to keeper or bowler end
      const tThrow = Math.min(1, t * 1.4);
      ballPos = {
        x: shotTarget.x + (CX - shotTarget.x) * tThrow,
        y: shotTarget.y + (TOP_CREASE_Y - shotTarget.y) * tThrow,
      };
      if (tThrow > 0.8 && outcome.wicketType === 'run out') {
        bailsDislodged = true;
        bailLeftOffset = { x: -10, y: -12 };
        bailRightOffset = { x: 10, y: -10 };
      }
    }
  } else {
    // PHASE 10: RESOLUTION & CELEBRATION
    phase = 10;
    phaseName = 'Resolution';
    bowlerPos = { x: CX, y: BOWLER_BASE_Y };
    bowlerPhase = 'recovery';
    ballPos = outcome.isFour || outcome.isSix ? shotTarget : { x: CX, y: TOP_CREASE_Y };
    showBall = !outcome.isFour && !outcome.isSix;
  }

  // Post-contact Striker Pose
  if (p >= 0.30) {
    if (outcome.isWicket) {
      if (outcome.wicketType === 'bowled' || outcome.wicketType === 'lbw' || outcome.wicketType === 'stumped') {
        strikerPose = 'miss';
      } else {
        strikerPose = 'wicket';
      }
    } else if (outcome.isFour || outcome.isSix) {
      strikerPose = 'loft';
    } else if (outcome.runs > 0) {
      strikerPose = 'drive';
    } else {
      strikerPose = 'defense';
    }
  }

  // Calculate Running Between Wickets (Phase 8)
  const runsTaken = outcome.isFour || outcome.isSix || outcome.isExtra ? 0 : outcome.runs;
  if (runsTaken > 0 && p >= 0.35 && p <= 0.88) {
    const runP = (p - 0.35) / 0.53;
    const totalLegs = runsTaken;
    const legProgress = runP * totalLegs;
    const currentLeg = Math.floor(legProgress);
    const legFrac = legProgress - currentLeg;
    const evenLeg = currentLeg % 2 === 0;

    if (evenLeg) {
      strikerPos = { x: CX - 2, y: BOTTOM_CREASE_Y - (BOTTOM_CREASE_Y - TOP_CREASE_Y) * legFrac };
      nonStrikerPos = { x: CX + 2, y: TOP_CREASE_Y + (BOTTOM_CREASE_Y - TOP_CREASE_Y) * legFrac };
    } else {
      strikerPos = { x: CX - 2, y: TOP_CREASE_Y + (BOTTOM_CREASE_Y - TOP_CREASE_Y) * legFrac };
      nonStrikerPos = { x: CX + 2, y: BOTTOM_CREASE_Y - (BOTTOM_CREASE_Y - TOP_CREASE_Y) * legFrac };
    }
    strikerPose = 'running';
  } else if (p > 0.88 && runsTaken > 0) {
    // Final crease swap positions after odd runs
    if (runsTaken % 2 === 1) {
      strikerPos = { x: CX - 2, y: TOP_CREASE_Y };
      nonStrikerPos = { x: CX + 2, y: BOTTOM_CREASE_Y };
    }
  }

  // Compute Animated Fielder States
  const animatedFielders: FielderAnimState[] = fielders.map((f, idx) => {
    const base = toSvgCoords(f.x, f.y);
    if (idx === activeChaserIdx && p >= 0.30 && p < 0.90 && !outcome.isFour && !outcome.isSix) {
      const chaseP = (p - 0.30) / 0.60;
      const targetT = Math.min(1, chaseP * 1.3);
      const curX = base.x + (shotTarget.x - base.x) * targetT;
      const curY = base.y + (shotTarget.y - base.y) * targetT;

      let act: FielderAnimState['action'] = 'chasing';
      if (chaseP > 0.5 && outcome.wicketType === 'caught') act = 'catching';
      else if (chaseP > 0.7) act = 'throwing';

      return {
        id: f.id,
        name: f.name,
        x: curX,
        y: curY,
        isChasing: true,
        action: act,
      };
    }

    return {
      id: f.id,
      name: f.name,
      ...base,
      isChasing: false,
      action: 'idle',
    };
  });

  // Calculate Shadow Offset based on Ball Height
  const ballShadowPos = {
    x: ballPos.x + ballHeight * 0.3,
    y: ballPos.y + ballHeight * 0.5,
  };

  return {
    progress: p,
    phase,
    phaseName,
    bowlerPos,
    bowlerArmAngle,
    bowlerPhase,
    ballPos,
    ballHeight,
    ballShadowPos,
    showBall,
    ballTrailPoints,
    isContactImpact,
    isTurfDust,
    isBoundarySplash,
    strikerPos,
    strikerBatAngle,
    strikerPose,
    nonStrikerPos,
    keeperPos,
    keeperAction,
    bailsDislodged,
    bailLeftOffset,
    bailRightOffset,
    fielders: animatedFielders,
  };
}
