import { Player, PitchLength, PitchLine, BowlingAngle, BattingApproach, FielderPosition, BallOutcome } from '../types/cricket';
import { applyDewFactorModifier } from './dlsEngine';

interface DeliveryInput {
  bowler: Player;
  striker: Player;
  nonStriker: Player;
  over: number;
  ballInOver: number;
  pitchType: string;
  hasDew?: boolean;
  powerSurgeActive?: boolean;
  format?: 'T20' | 'ODI' | 'TEST' | '100BALL';
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
}

export function simulateBall(input: DeliveryInput): BallOutcome {
  const { bowler, striker, nonStriker, over, ballInOver, bowlingTactics, battingTactics, hasDew, powerSurgeActive, format } = input;
  const activePairRunning = input.pairRunning || battingTactics.pairRunning || 'standard';
  const activeIntent = input.intent || bowlingTactics.intent || 'standard';
  const activeEffort = input.effort || bowlingTactics.effort || 'standard';
  const activeKeeperPos = input.keeperPos || bowlingTactics.keeperPos || 'normal';
  const activeSpeed = input.speed || bowlingTactics.speed || 'standard';

  // Base bowler speed based on role
  let bowlerSpeedMps = 36.0; // ~130 km/h
  if (bowler.role === 'Pace') {
    bowlerSpeedMps = 37.5 + (bowler.ratings.pace / 100) * 4.5; // ~135 - 150 km/h
  } else if (bowler.role === 'Spin') {
    bowlerSpeedMps = 23.0 + (bowler.ratings.pace / 100) * 3.0; // ~85 - 95 km/h
  } else {
    bowlerSpeedMps = 34.0 + (bowler.ratings.pace / 100) * 3.0;
  }

  // Effort & Speed pace adjustments
  if (activeEffort === 'max') {
    bowlerSpeedMps += 1.5;
  } else if (activeEffort === 'conserve') {
    bowlerSpeedMps -= 1.2;
  }
  if (activeSpeed === 'slower') {
    bowlerSpeedMps -= bowler.role === 'Pace' ? 4.2 : 2.0;
  } else if (activeSpeed === 'quicker') {
    bowlerSpeedMps += 1.8;
  }

  // Calculate matchup factors
  let bowlerSkill = (bowler.ratings.bowl * 0.4) + (bowler.ratings.ctrl * 0.3) + (bowler.ratings.dth * 0.3);
  const batterSkill = (striker.ratings.bat * 0.4) + (striker.ratings.pow * 0.35) + (striker.ratings.tmp * 0.25);

  // Feature 6.2: Evening Dew Factor reduces spin turn by 25% & lowers bowler control grip
  if (hasDew) {
    if (bowler.role === 'Spin') {
      bowlerSkill *= 0.78;
    } else {
      bowlerSkill *= 0.91;
    }
  }

  // Feature 6.4: Specialist Match-Ups (Left-Arm Pace vs RHB, Leg-Spin vs low vs-spin, Bouncer Barrage)
  let matchupNote = '';
  if (bowler.bowlingArm === 'LAF' && striker.battingHand === 'RHB' && (bowlingTactics.line === 'off_stump' || bowlingTactics.line === 'stumps')) {
    bowlerSkill *= 1.12;
    matchupNote = ' [Match-Up Trap: Left-Arm angle across/into RHB]';
  } else if ((bowler.bowlingArm === 'LS' || bowler.role === 'Spin') && (striker.ratings.vs || 78) < 76) {
    bowlerSkill *= 1.15;
    matchupNote = ` [Spin Weakness Exploited: vs Spin ${striker.ratings.vs || 72}]`;
  } else if ((bowlingTactics.length === 'bouncer' || bowlingTactics.length === 'short') && (striker.ratings.vp || 78) < 75) {
    bowlerSkill *= 1.12;
    matchupNote = ' [Bouncer Barrage Trap vs back-foot weakness]';
  }

  // Speed variation vs batter temperament
  if ((activeSpeed === 'slower' || activeSpeed === 'quicker') && striker.ratings.tmp < 80) {
    bowlerSkill *= 1.07;
    if (!matchupNote) matchupNote = ` [Pace Change (${activeSpeed.toUpperCase()}) deceived timing]`;
  }

  // Feature 6.6: Test Match Red-Ball Swing & Reverse Swing (after 40 overs)
  if (format === 'TEST') {
    if (over < 12 && bowler.role === 'Pace') {
      bowlerSkill *= 1.12; // New Dukes/SG red ball swing
    } else if (over >= 40 && bowler.role === 'Pace') {
      bowlerSkill *= 1.15; // Old ball reverse swing
    }
  }

  // Approach modifiers
  let aggression = 1.0;
  let wicketRisk = 1.0;
  switch (battingTactics.approach) {
    case 'defensive':
      aggression = 0.4;
      wicketRisk = 0.35;
      break;
    case 'anchor':
      aggression = 0.75;
      wicketRisk = 0.65;
      break;
    case 'balanced':
      aggression = 1.0;
      wicketRisk = 1.0;
      break;
    case 'aggressive':
      aggression = 1.45;
      wicketRisk = 1.4;
      break;
    case 'smash':
      aggression = 1.9;
      wicketRisk = 1.95;
      break;
  }

  // Bowling Effort & Intent modifiers
  if (activeEffort === 'max') {
    wicketRisk *= 1.08;
    bowlerSkill *= 1.06;
  } else if (activeEffort === 'conserve') {
    aggression *= 1.05;
    wicketRisk *= 0.94;
  }

  if (activeIntent === 'attack') {
    wicketRisk *= 1.08;
    aggression *= 1.05;
  } else if (activeIntent === 'contain') {
    aggression *= 0.92;
    wicketRisk *= 0.92;
  }

  // Feature 6.6: BBL Power Surge boosts boundary hitting
  if (powerSurgeActive) {
    aggression *= 1.3;
  }

  // Death overs (over >= 15) naturally heighten pace
  const isDeathOvers = over >= 15 && format !== 'TEST';
  if (isDeathOvers) {
    aggression *= 1.25;
    wicketRisk *= 1.2;
  }

  // Pitch length & line tactical effect
  let tacticalBonus = 0;
  if (bowlingTactics.length === 'yorker' && bowlingTactics.line === 'stumps') {
    if (battingTactics.approach === 'smash') {
      tacticalBonus += 0.25; // Good bowler trap against wild slogger
    }
  } else if (bowlingTactics.length === 'short' && bowlingTactics.line === 'outside_off') {
    if (battingTactics.targetSide === 'off_side') {
      tacticalBonus -= 0.15; // Cut shot territory
    }
  }

  // Random variance seed
  const roll = Math.random();
  const contestDiff = (batterSkill * aggression) - (bowlerSkill * (1 + tacticalBonus));

  // Determine angle for wagon wheel
  let shotAngleDeg = Math.floor(Math.random() * 360);
  if (battingTactics.targetSide === 'off_side') {
    shotAngleDeg = (striker.battingHand === 'RHB') ? (270 + Math.random() * 80) % 360 : (90 + Math.random() * 80);
  } else if (battingTactics.targetSide === 'leg_side') {
    shotAngleDeg = (striker.battingHand === 'RHB') ? (90 + Math.random() * 80) : (270 + Math.random() * 80) % 360;
  } else if (battingTactics.targetSide === 'straight') {
    shotAngleDeg = (330 + Math.random() * 60) % 360;
  }

  let runs = 0;
  let isWicket = false;
  let wicketType: 'bowled' | 'caught' | 'lbw' | 'run out' | 'stumped' | undefined;
  let isFour = false;
  let isSix = false;
  let shotDistanceM = 15 + Math.floor(Math.random() * 20);
  let commentary = '';
  let tacticalNote = '';

  // Check extra (wide / no ball)
  const isWide = Math.random() < (bowlingTactics.line === 'wide_outside_off' ? 0.08 : 0.02);
  if (isWide) {
    return {
      over,
      ballNumber: ballInOver,
      bowlerId: bowler.id,
      bowlerName: bowler.name,
      strikerId: striker.id,
      strikerName: striker.name,
      nonStrikerId: nonStriker.id,
      nonStrikerName: nonStriker.name,
      runs: 1,
      isWicket: false,
      isFour: false,
      isSix: false,
      isExtra: true,
      extraType: 'wide',
      bowlerSpeedMps: Number(bowlerSpeedMps.toFixed(1)),
      shotAngleDeg: 0,
      shotDistanceM: 0,
      commentary: `${bowler.name} pushes it too far outside the tramline. Signalled WIDE.`,
      tacticalNote: 'Line was too wide of off-stump.'
    };
  }

  // Interactive Field Editor: compute boundary riders & close catchers from live fielders
  const activeFielders = bowlingTactics.fielders || [];
  const boundaryRidersCount = activeFielders.filter(f => {
    const dx = f.x - 50;
    const dy = f.y - 50;
    return Math.sqrt(dx * dx + dy * dy) > 26 || f.isBoundary;
  }).length;
  const closeCatchersCount = activeFielders.filter(f => {
    const dx = f.x - 50;
    const dy = f.y - 50;
    return Math.sqrt(dx * dx + dy * dy) <= 18 && !f.isBoundary;
  }).length;

  // Wicket & Dew factor calculation via dlsEngine + close catchers bonus
  const baseWicketProb = 0.065 * wicketRisk + (closeCatchersCount * 0.004);
  const rawWicketProb = Math.max(0.02, Math.min(0.28, baseWicketProb - (contestDiff / 300)));
  const dewMods = applyDewFactorModifier(0.32, 0.18, rawWicketProb, Boolean(hasDew));
  const adjustedWicketProb = dewMods.wicketProb;

  if (roll < adjustedWicketProb) {
    isWicket = true;
    shotDistanceM = 30 + Math.floor(Math.random() * 45);
    const bowlerLast = bowler.name.split(' ').pop() || bowler.name;
    let dismissalText = `b ${bowlerLast}`;
    let chosenFielder = 'Fielder';

    if (
      activeKeeperPos === 'stumps' &&
      (battingTactics.approach === 'aggressive' || battingTactics.approach === 'smash') &&
      Math.random() < 0.35
    ) {
      wicketType = 'stumped';
      chosenFielder = 'Wicketkeeper';
      dismissalText = `st Keeper b ${bowlerLast}`;
      commentary = `STUMPED! ${striker.name} charges down the track and misses! Keeper whips the bails off in a flash!`;
      tacticalNote = `Keeper up to the stumps punished aggressive footwork.`;
      shotDistanceM = 0;
    } else if (bowlingTactics.length === 'yorker' && (bowlingTactics.line === 'stumps' || bowlingTactics.line === 'off_stump')) {
      wicketType = 'bowled';
      dismissalText = `b ${bowlerLast}`;
      commentary = `CLEAN BOWLED! Spearing ${Math.round(bowlerSpeedMps * 3.6)} km/h yorker rattles off-stump! ${striker.name} beaten completely for pace!`;
      tacticalNote = `Pinpoint yorker on stumps (CTRL ${bowler.ratings.ctrl}) pierced defense.`;
      shotDistanceM = 0;
    } else if ((bowlingTactics.length === 'full' || bowlingTactics.length === 'good') && (bowlingTactics.line === 'stumps' || bowlingTactics.line === 'off_stump') && Math.random() < 0.42) {
      wicketType = 'lbw';
      dismissalText = `lbw b ${bowlerLast}`;
      commentary = `L.B.W.! Struck right in front of middle! Finger goes up without hesitation. Big breakthrough!`;
      tacticalNote = `Full length hitting front pad in line with middle stump.`;
      shotDistanceM = 0;
    } else {
      wicketType = 'caught';
      const namedFielders = activeFielders.map(f => f.name).filter(Boolean);
      const catchers = namedFielders.length > 0 ? namedFielders : ['Slip', 'Cover', 'Long-on', 'Deep Midwicket', 'Point', 'Keeper'];
      chosenFielder = catchers[Math.floor(Math.random() * catchers.length)];
      dismissalText = `c ${chosenFielder} b ${bowlerLast}`;
      commentary = `OUT! ${striker.name} slices ${bowler.name} in the air and taken neatly by ${chosenFielder}!`;
      tacticalNote = `Field trap paid off: caught at ${chosenFielder}.`;
    }

    return {
      over,
      ballNumber: ballInOver,
      bowlerId: bowler.id,
      bowlerName: bowler.name,
      strikerId: striker.id,
      strikerName: striker.name,
      nonStrikerId: nonStriker.id,
      nonStrikerName: nonStriker.name,
      runs: 0,
      isWicket: true,
      wicketType,
      fielderName: wicketType === 'caught' || wicketType === 'stumped' ? chosenFielder : undefined,
      dismissedPlayerId: striker.id,
      dismissedPlayerName: striker.name,
      dismissalText,
      isFour: false,
      isSix: false,
      isExtra: false,
      bowlerSpeedMps: Number(bowlerSpeedMps.toFixed(1)),
      shotAngleDeg,
      shotDistanceM,
      commentary,
      tacticalNote
    };
  }

  // Scoring shot logic with Dew Factor, Keeper position & Interactive Field Editor boundary modifiers
  const dewBoundaryBoost = hasDew ? 0.03 : 0;
  const keeperEdgeBoost = activeKeeperPos === 'stumps' && bowler.role === 'Pace' ? 0.025 : 0;
  const boundaryProtectionMod = (boundaryRidersCount - 4) * 0.015; // Positive when >4 boundary riders (harder to hit 4s/6s)
  const innerRingSqueezeMod = (5 - boundaryRidersCount) * 0.015;   // Positive when more fielders inside 30-yard circle
  const scoringChance = (striker.ratings.bat / 100) * aggression;
  const powerFactor = striker.ratings.pow / 100;

  if (roll > 0.88 - (scoringChance * 0.12) - dewBoundaryBoost + (boundaryProtectionMod * 0.6) && powerFactor > 0.75) {
    // SIX
    runs = 6;
    isSix = true;
    shotDistanceM = 78 + Math.floor(Math.random() * 24);
    commentary = `PURE POWER (POW ${striker.ratings.pow}): ${striker.name} heaves ${bowler.name} way over the ropes! SIX! (${shotDistanceM}m)`;
    tacticalNote = `Capitalized on ${bowlingTactics.length} delivery with aggressive intent.`;
  } else if (roll > 0.72 - (scoringChance * 0.1) - dewBoundaryBoost - keeperEdgeBoost + boundaryProtectionMod) {
    // FOUR
    runs = 4;
    isFour = true;
    shotDistanceM = 65 + Math.floor(Math.random() * 12);
    commentary = `CRACKING SHOT! ${striker.name} punches ${bowler.name} cleanly through the gap to the boundary! FOUR runs!`;
    tacticalNote = `Found the unfilled gap between fielders with supreme placement.`;
  } else if (roll > 0.52) {
    // Two runs
    runs = 2;
    shotDistanceM = 42 + Math.floor(Math.random() * 18);
    commentary = `Pushed into the deep pocket, good hustle between the wickets for a comfortable brace.`;
    tacticalNote = `Good running between wickets (RUN ${striker.ratings.run}).`;
  } else if (roll > Math.min(0.48, Math.max(0.18, dewMods.dotProb + innerRingSqueezeMod))) {
    // Single
    runs = 1;
    shotDistanceM = 25 + Math.floor(Math.random() * 20);
    commentary = `Tucked away softly for an easy single to rotate strike.`;
    tacticalNote = `Working the ball into vacant inner circle space.`;
  } else {
    // Dot ball
    runs = 0;
    shotDistanceM = 5 + Math.floor(Math.random() * 15);
    commentary = `Beaten outside off! Good probing line from ${bowler.name}, dot ball.`;
    tacticalNote = `Disciplined ${bowlingTactics.length} length on ${bowlingTactics.line.replace('_', ' ')}.`;
  }

  // Pair Running Tactical Modifiers ('hold_ones' | 'standard' | 'push_hard' | 'shield')
  if (runs === 1) {
    if (activePairRunning === 'hold_ones' && Math.random() < 0.25) {
      runs = 0;
      commentary = `${striker.name} taps it to the ring and holds back — cautious calling ('Hold 1s').`;
      tacticalNote = `Pair running set to Hold 1s: zero run-out risk.`;
    } else if (activePairRunning === 'shield' && ballInOver <= 4) {
      runs = 0;
      commentary = `${striker.name} turns down the single on ball ${ballInOver} to shield ${nonStriker.name.split(' ').pop()} at the non-striker's end!`;
      tacticalNote = `Strike Farming (Shield Tailender) active on balls 1-4.`;
    } else if (activePairRunning === 'push_hard') {
      const avgRunSkill = ((striker.ratings.run || 75) + (nonStriker.ratings.run || 75)) / 2;
      const pushChance = 0.22 + (avgRunSkill - 75) * 0.004;
      if (Math.random() < pushChance) {
        // Small run-out risk when pushing hard for 2nd run
        if (Math.random() < 0.08) {
          return {
            over,
            ballNumber: ballInOver,
            bowlerId: bowler.id,
            bowlerName: bowler.name,
            strikerId: striker.id,
            strikerName: striker.name,
            nonStrikerId: nonStriker.id,
            nonStrikerName: nonStriker.name,
            runs: 0,
            isWicket: true,
            wicketType: 'run out',
            fielderName: 'Deep Fielder',
            dismissedPlayerId: striker.id,
            dismissedPlayerName: striker.name,
            dismissalText: 'run out (Deep)',
            isFour: false,
            isSix: false,
            isExtra: false,
            bowlerSpeedMps: Number(bowlerSpeedMps.toFixed(1)),
            shotAngleDeg,
            shotDistanceM,
            commentary: `RUN OUT! ${striker.name} pushed hard for the extra run and caught short by a rocket throw from the deep!`,
            tacticalNote: `Aggressive 'Push Hard' running gambled against a strong throwing arm.`
          };
        }
        runs = 2;
        commentary = `Hustled hard! ${striker.name} & ${nonStriker.name.split(' ').pop()} turn a single into TWO with electric running!`;
        tacticalNote = `Push Hard running converted 1 into 2 (RUN ${striker.ratings.run}).`;
      }
    }
  } else if (runs === 0 && activePairRunning === 'shield' && ballInOver >= 5 && Math.random() < 0.35) {
    runs = 1;
    commentary = `Quick tip-and-run on ball ${ballInOver}! ${striker.name} retains strike for the next over!`;
    tacticalNote = `Shield Tailender: rotated strike at the end of the over.`;
  }

  return {
    over,
    ballNumber: ballInOver,
    bowlerId: bowler.id,
    bowlerName: bowler.name,
    strikerId: striker.id,
    strikerName: striker.name,
    nonStrikerId: nonStriker.id,
    nonStrikerName: nonStriker.name,
    runs,
    isWicket: false,
    isFour,
    isSix,
    isExtra: false,
    bowlerSpeedMps: Number(bowlerSpeedMps.toFixed(1)),
    shotAngleDeg,
    shotDistanceM,
    commentary,
    tacticalNote: `${tacticalNote}${matchupNote}`
  };
}

