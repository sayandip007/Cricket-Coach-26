import {
  Player,
  Team,
  CompletedMatchRecord,
  FielderPosition,
  PitchType,
  PitchLength,
  PitchLine,
  BattingApproach
} from '../types/cricket';
import { simulateBall } from '../engine/cricketEngine';

export function createDefaultField(): FielderPosition[] {
  return [
    { id: 1, name: 'Slip', x: 42, y: 26, isBoundary: false },
    { id: 2, name: 'Point', x: 26, y: 45, isBoundary: false },
    { id: 3, name: 'Cover', x: 30, y: 58, isBoundary: false },
    { id: 4, name: 'Mid-off', x: 42, y: 68, isBoundary: false },
    { id: 5, name: 'Mid-on', x: 58, y: 68, isBoundary: false },
    { id: 6, name: 'Square Leg', x: 70, y: 44, isBoundary: false },
    { id: 7, name: 'Third Man', x: 22, y: 18, isBoundary: true },
    { id: 8, name: 'Long-on', x: 64, y: 88, isBoundary: true },
    { id: 9, name: 'Deep Midwicket', x: 86, y: 58, isBoundary: true },
  ];
}

// ============================================================================
// 1. FIELD PRESET TEMPLATES & FORMAT RESTRICTIONS SERVICE
// ============================================================================

export type FieldTemplateId =
  | 'powerplay_attacking'
  | 'powerplay_balanced'
  | 'middle_squeeze'
  | 'spin_web'
  | 'death_yorker'
  | 'boundary_riders'
  | 'slip_cordon';

export interface FieldTemplatePreset {
  id: FieldTemplateId;
  name: string;
  phase: 'Powerplay' | 'Middle' | 'Death' | 'All';
  description: string;
  boundarySaveBonus: number;
  catchChanceBonus: number;
  singlePreventBonus: number;
  positions: FielderPosition[];
}

export const FIELD_TEMPLATES: FieldTemplatePreset[] = [
  {
    id: 'powerplay_attacking',
    name: 'Powerplay Attack (2 Out)',
    phase: 'Powerplay',
    description: '2 slips, gully, point & attacking circle to hunt early new-ball wickets. Only 2 fielders outside 30-yard circle.',
    boundarySaveBonus: -4,
    catchChanceBonus: 18,
    singlePreventBonus: 12,
    positions: [
      { id: 1, name: 'First Slip', x: 43, y: 27, isBoundary: false },
      { id: 2, name: 'Second Slip', x: 39, y: 28, isBoundary: false },
      { id: 3, name: 'Gully', x: 33, y: 34, isBoundary: false },
      { id: 4, name: 'Point', x: 27, y: 46, isBoundary: false },
      { id: 5, name: 'Extra Cover', x: 32, y: 58, isBoundary: false },
      { id: 6, name: 'Mid-off', x: 42, y: 67, isBoundary: false },
      { id: 7, name: 'Mid-on', x: 58, y: 67, isBoundary: false },
      { id: 8, name: 'Third Man', x: 22, y: 18, isBoundary: true },
      { id: 9, name: 'Deep Fine Leg', x: 78, y: 18, isBoundary: true },
    ]
  },
  {
    id: 'powerplay_balanced',
    name: 'Powerplay Standard (2 Out)',
    phase: 'Powerplay',
    description: 'Balanced ring protection with Deep Cover-Point and Fine Leg sweeping boundaries.',
    boundarySaveBonus: 4,
    catchChanceBonus: 10,
    singlePreventBonus: 10,
    positions: [
      { id: 1, name: 'First Slip', x: 43, y: 27, isBoundary: false },
      { id: 2, name: 'Backward Point', x: 28, y: 40, isBoundary: false },
      { id: 3, name: 'Cover', x: 31, y: 55, isBoundary: false },
      { id: 4, name: 'Mid-off', x: 43, y: 68, isBoundary: false },
      { id: 5, name: 'Mid-on', x: 57, y: 68, isBoundary: false },
      { id: 6, name: 'Mid-wicket', x: 69, y: 54, isBoundary: false },
      { id: 7, name: 'Square Leg', x: 68, y: 42, isBoundary: false },
      { id: 8, name: 'Deep Point', x: 12, y: 46, isBoundary: true },
      { id: 9, name: 'Deep Fine Leg', x: 78, y: 18, isBoundary: true },
    ]
  },
  {
    id: 'middle_squeeze',
    name: 'Middle Overs Squeeze (4 Out)',
    phase: 'Middle',
    description: 'Cuts off singles and boundary sweeping lanes in overs 7–15.',
    boundarySaveBonus: 10,
    catchChanceBonus: 6,
    singlePreventBonus: 14,
    positions: createDefaultField()
  },
  {
    id: 'spin_web',
    name: 'Spin Trap Web (Silly Point & Leg Slip)',
    phase: 'Middle',
    description: 'Close-in catchers around the bat for turning tracks plus deep mid-wicket and long-on protection.',
    boundarySaveBonus: 5,
    catchChanceBonus: 20,
    singlePreventBonus: 15,
    positions: [
      { id: 1, name: 'First Slip', x: 44, y: 28, isBoundary: false },
      { id: 2, name: 'Silly Point', x: 43, y: 44, isBoundary: false },
      { id: 3, name: 'Short Leg', x: 57, y: 44, isBoundary: false },
      { id: 4, name: 'Cover', x: 32, y: 54, isBoundary: false },
      { id: 5, name: 'Mid-wicket', x: 68, y: 52, isBoundary: false },
      { id: 6, name: 'Deep Point', x: 13, y: 48, isBoundary: true },
      { id: 7, name: 'Long-off', x: 37, y: 88, isBoundary: true },
      { id: 8, name: 'Long-on', x: 63, y: 88, isBoundary: true },
      { id: 9, name: 'Deep Mid-wicket', x: 87, y: 58, isBoundary: true },
    ]
  },
  {
    id: 'death_yorker',
    name: 'Death Fortress (5 Out)',
    phase: 'Death',
    description: '5 boundary riders guarding Long-off, Long-on, Deep Cover, Deep Mid-wicket & Fine Leg for overs 16–20.',
    boundarySaveBonus: 18,
    catchChanceBonus: 12,
    singlePreventBonus: -5,
    positions: [
      { id: 1, name: 'Short Third Man', x: 34, y: 31, isBoundary: false },
      { id: 2, name: 'Point', x: 29, y: 46, isBoundary: false },
      { id: 3, name: 'Extra Cover', x: 34, y: 58, isBoundary: false },
      { id: 4, name: 'Short Fine Leg', x: 65, y: 32, isBoundary: false },
      { id: 5, name: 'Deep Cover Point', x: 13, y: 52, isBoundary: true },
      { id: 6, name: 'Long-off', x: 36, y: 89, isBoundary: true },
      { id: 7, name: 'Long-on', x: 64, y: 89, isBoundary: true },
      { id: 8, name: 'Deep Mid-wicket', x: 88, y: 58, isBoundary: true },
      { id: 9, name: 'Deep Square Leg', x: 87, y: 40, isBoundary: true },
    ]
  },
  {
    id: 'boundary_riders',
    name: 'Boundary Rope Protect (5 Out)',
    phase: 'Death',
    description: 'Maximum rope protection against power-hitters to turn 4s and 6s into 2s.',
    boundarySaveBonus: 22,
    catchChanceBonus: 10,
    singlePreventBonus: -8,
    positions: [
      { id: 1, name: 'Cover', x: 32, y: 54, isBoundary: false },
      { id: 2, name: 'Mid-off', x: 43, y: 66, isBoundary: false },
      { id: 3, name: 'Mid-on', x: 57, y: 66, isBoundary: false },
      { id: 4, name: 'Square Leg', x: 68, y: 44, isBoundary: false },
      { id: 5, name: 'Third Man', x: 20, y: 18, isBoundary: true },
      { id: 6, name: 'Deep Point', x: 12, y: 48, isBoundary: true },
      { id: 7, name: 'Long-off', x: 37, y: 90, isBoundary: true },
      { id: 8, name: 'Long-on', x: 63, y: 90, isBoundary: true },
      { id: 9, name: 'Deep Mid-wicket', x: 88, y: 60, isBoundary: true },
    ]
  },
  {
    id: 'slip_cordon',
    name: 'Test / Red-Ball Cordon',
    phase: 'All',
    description: '3 slips, gully, short leg and point for maximum wicket-taking threat.',
    boundarySaveBonus: -10,
    catchChanceBonus: 25,
    singlePreventBonus: 16,
    positions: [
      { id: 1, name: 'First Slip', x: 44, y: 27, isBoundary: false },
      { id: 2, name: 'Second Slip', x: 40, y: 28, isBoundary: false },
      { id: 3, name: 'Third Slip', x: 36, y: 30, isBoundary: false },
      { id: 4, name: 'Gully', x: 31, y: 36, isBoundary: false },
      { id: 5, name: 'Point', x: 27, y: 47, isBoundary: false },
      { id: 6, name: 'Cover', x: 33, y: 58, isBoundary: false },
      { id: 7, name: 'Mid-off', x: 44, y: 68, isBoundary: false },
      { id: 8, name: 'Mid-on', x: 56, y: 68, isBoundary: false },
      { id: 9, name: 'Fine Leg', x: 76, y: 22, isBoundary: true },
    ]
  }
];

export function validateFieldRestrictions(
  fielders: FielderPosition[],
  format: 'T20' | 'ODI' | 'TEST',
  currentOver: number
): {
  valid: boolean;
  outsideCount: number;
  maxAllowedOutside: number;
  phaseName: string;
  warning?: string;
} {
  const outsideCount = fielders.filter(f => {
    const dx = f.x - 50;
    const dy = f.y - 50;
    return Math.sqrt(dx * dx + dy * dy) > 26 || f.isBoundary;
  }).length;

  if (format === 'TEST') {
    return {
      valid: true,
      outsideCount,
      maxAllowedOutside: 9,
      phaseName: 'Test Match (No Circle Restrictions)'
    };
  }

  const isPowerplay = format === 'ODI' ? currentOver < 10 : currentOver < 6;
  const isDeath = format === 'ODI' ? currentOver >= 40 : currentOver >= 15;
  const maxAllowedOutside = isPowerplay ? 2 : 5;
  const phaseName = isPowerplay
    ? 'Powerplay (Max 2 Outside 30-Yd Circle)'
    : isDeath
    ? 'Death Overs (Max 5 Outside Circle)'
    : 'Middle Overs (Max 5 Outside Circle)';

  return {
    valid: outsideCount <= maxAllowedOutside,
    outsideCount,
    maxAllowedOutside,
    phaseName,
    warning:
      outsideCount > maxAllowedOutside
        ? `Powerplay restriction exceeded: ${outsideCount}/${maxAllowedOutside} fielders outside the 30-yard circle.`
        : undefined
  };
}

// ============================================================================
// 2. BATTER VS BOWLER ANALYTICS & MATCHUP ENGINE
// ============================================================================

export interface BatterBowlerMatchupReport {
  batterId: string;
  batterName: string;
  bowlerId: string;
  bowlerName: string;
  vsPaceRating: number;
  vsSpinRating: number;
  vsLeftArmModifier: number;
  powerplaySR: number;
  middleOversSR: number;
  deathOversSR: number;
  historicalBalls: number;
  historicalRuns: number;
  historicalDismissals: number;
  dismissalRiskPct: number;
  boundaryThreatPct: number;
  recommendedLine: string;
  recommendedLength: string;
  tacticalVerdict: string;
  advantage: 'BATTER' | 'BOWLER' | 'EVEN';
}

export function analyzeBatterBowlerMatchup(
  batter: Player,
  bowler: Player,
  completedMatches: CompletedMatchRecord[] = []
): BatterBowlerMatchupReport {
  const isSpinner = bowler.role === 'Spin' || (bowler.bowlingStyle || '').toLowerCase().includes('spin') || (bowler.bowlingStyle || '').toLowerCase().includes('orth');
  const isLeftArm = (bowler.bowlingStyle || '').toLowerCase().includes('left') || (bowler.bowlingStyle || '').toLowerCase().includes('sla') || (bowler.bowlingStyle || '').toLowerCase().includes('lf');

  const vsPace = batter.ratings.vp ?? batter.ratings.bat;
  const vsSpin = batter.ratings.vs ?? batter.ratings.bat;
  const relevantSkill = isSpinner ? vsSpin : vsPace;

  let histBalls = 0;
  let histRuns = 0;
  let histOuts = 0;

  (completedMatches || []).forEach(m => {
    if (!m) return;
    [m.innings1, m.innings2].forEach(inn => {
      const bHist = (inn as any)?.ballHistory;
      if (!Array.isArray(bHist)) return;
      bHist.forEach((ball: any) => {
        if (ball && ball.strikerId === batter.id && ball.bowlerId === bowler.id) {
          histBalls += ball.isExtra ? 0 : 1;
          histRuns += ball.runs || 0;
          if (ball.isWicket) histOuts += 1;
        }
      });
    });
  });

  const leftArmMod = isLeftArm
    ? batter.battingHand === 'RHB'
      ? -4
      : +3
    : 0;

  const netDiff = (relevantSkill + leftArmMod + (batter.form - 50) * 0.15) - (bowler.ratings.bowl + (bowler.form - 50) * 0.15);

  const dismissalRiskPct = Math.min(35, Math.max(4, Math.round(14 - netDiff * 0.35 + (bowler.ratings.dth - 75) * 0.15)));
  const boundaryThreatPct = Math.min(42, Math.max(6, Math.round(18 + netDiff * 0.4 + (batter.ratings.pow - 75) * 0.22)));

  const baseSR = 128 + (batter.ratings.pow - 75) * 0.8 + (batter.ratings.bat - 75) * 0.5;
  const powerplaySR = Math.round(baseSR + (vsPace - 75) * 0.6);
  const middleOversSR = Math.round(baseSR - 8 + (vsSpin - 75) * 0.7);
  const deathOversSR = Math.round(baseSR + 24 + (batter.ratings.pow - 75) * 0.9);

  let recommendedLength = 'Good Length';
  let recommendedLine = 'Fourth Stump';

  if (vsPace < vsSpin - 5) {
    recommendedLength = 'Short / Hard Length';
    recommendedLine = 'Corridor Outside Off';
  } else if (vsSpin < vsPace - 5) {
    recommendedLength = 'Full & Flighted';
    recommendedLine = 'Middle & Leg';
  } else if (batter.ratings.pow >= 88) {
    recommendedLength = 'Yorker';
    recommendedLine = 'Wide Outside Off';
  }

  const advantage: 'BATTER' | 'BOWLER' | 'EVEN' =
    netDiff >= 5 ? 'BATTER' : netDiff <= -5 ? 'BOWLER' : 'EVEN';

  const tacticalVerdict =
    advantage === 'BATTER'
      ? `${batter.name} dominates ${isSpinner ? 'spin' : 'pace'} (${relevantSkill} rating). Bowl ${recommendedLength} on ${recommendedLine} with boundary protection.`
      : advantage === 'BOWLER'
      ? `${bowler.name} holds a clear edge (+${Math.abs(Math.round(netDiff))} matchup delta). Attack the stumps with an aggressive ring.`
      : `Balanced contest between ${batter.name} and ${bowler.name}. Execution in the ${recommendedLine} channel will decide the duel.`;

  return {
    batterId: batter.id,
    batterName: batter.name,
    bowlerId: bowler.id,
    bowlerName: bowler.name,
    vsPaceRating: vsPace,
    vsSpinRating: vsSpin,
    vsLeftArmModifier: leftArmMod,
    powerplaySR,
    middleOversSR,
    deathOversSR,
    historicalBalls: histBalls,
    historicalRuns: histRuns,
    historicalDismissals: histOuts,
    dismissalRiskPct,
    boundaryThreatPct,
    recommendedLine,
    recommendedLength,
    tacticalVerdict,
    advantage
  };
}

// ============================================================================
// 3. TACTICAL SCENARIO SIMULATOR (SANDBOX WHAT-IF ENGINE)
// ============================================================================

export interface ScenarioSimConfig {
  iterations: number;
  pitchType: PitchType;
  userBattingIntent: 'defensive' | 'balanced' | 'attacking';
  userBowlingAggression: 'defensive' | 'balanced' | 'attacking';
  fieldPreset: FieldTemplateId;
  customPlayingXIIds?: string[];
}

export interface ScenarioSimResult {
  iterations: number;
  userWinCount: number;
  oppWinCount: number;
  winProbabilityPct: number;
  avgFirstInningsScore: number;
  avgSecondInningsScore: number;
  avgPowerplayScore: number;
  avgMiddleScore: number;
  avgDeathScore: number;
  avgWicketsTaken: number;
  topProjectedScorer: { name: string; avgRuns: number; sr: number };
  topProjectedBowler: { name: string; avgWickets: number; econ: number };
  tacticalInsight: string;
}

export function runTacticalScenarioSimulation(
  userTeam: Team,
  opponentTeam: Team,
  allPlayers: Player[],
  config: ScenarioSimConfig
): ScenarioSimResult {
  const runsCount = Math.max(5, Math.min(50, config.iterations || 15));
  const xiIds = config.customPlayingXIIds && config.customPlayingXIIds.length >= 11
    ? config.customPlayingXIIds
    : userTeam.playingXIIds;

  const userPlayers = xiIds
    .map(id => allPlayers.find(p => p.id === id))
    .filter((p): p is Player => Boolean(p));
  const oppPlayers = opponentTeam.playingXIIds
    .map(id => allPlayers.find(p => p.id === id))
    .filter((p): p is Player => Boolean(p));

  const activeUserXI = userPlayers.length >= 6 ? userPlayers : allPlayers.filter(p => p.clubId === userTeam.id).slice(0, 11);
  const activeOppXI = oppPlayers.length >= 6 ? oppPlayers : allPlayers.filter(p => p.clubId === opponentTeam.id).slice(0, 11);

  const preset = FIELD_TEMPLATES.find(t => t.id === config.fieldPreset) || FIELD_TEMPLATES[2];

  let userWins = 0;
  let totalUserRuns = 0;
  let totalOppRuns = 0;
  let totalPP = 0;
  let totalMid = 0;
  let totalDeath = 0;
  let totalUserWktsTaken = 0;

  const batterTotals = new Map<string, { name: string; runs: number; balls: number }>();
  const bowlerTotals = new Map<string, { name: string; wkts: number; runs: number; balls: number }>();

  for (let sim = 0; sim < runsCount; sim++) {
    let uRuns = 0;
    let uWkts = 0;
    let ppRuns = 0;
    let midRuns = 0;
    let deathRuns = 0;

    let strikerIdx = 0;
    let nonStrikerIdx = 1;
    let nextBatterIdx = 2;

    const oppBowlers = activeOppXI.filter(p => p.role === 'Pace' || p.role === 'Spin' || p.role === 'All-rounder');
    const validOppBowlers = oppBowlers.length >= 4 ? oppBowlers : activeOppXI.slice(-5);

    for (let over = 0; over < 20; over++) {
      if (uWkts >= 10) break;
      const bowler = validOppBowlers[over % validOppBowlers.length];
      for (let ball = 1; ball <= 6; ball++) {
        if (uWkts >= 10) break;
        const striker = activeUserXI[strikerIdx % activeUserXI.length];
        const bApproach: BattingApproach =
          config.userBattingIntent === 'attacking'
            ? 'aggressive'
            : config.userBattingIntent === 'defensive'
            ? 'defensive'
            : 'balanced';
        const bLength: PitchLength = over >= 16 ? 'yorker' : 'good';
        const bLine: PitchLine = 'off_stump';
        const outcome = simulateBall({
          over,
          ballInOver: ball,
          striker,
          nonStriker: activeUserXI[nonStrikerIdx % activeUserXI.length],
          bowler,
          pitchType: config.pitchType,
          format: 'T20',
          bowlingTactics: {
            length: bLength,
            line: bLine,
            angle: 'over',
            variation: 'Stock Delivery',
            fielders: preset.positions,
            intent: 'standard',
            effort: 'standard'
          },
          battingTactics: {
            approach: bApproach,
            targetSide: 'all',
            runningRisk: 'normal'
          }
        });

        uRuns += outcome.runs;
        if (over < 6) ppRuns += outcome.runs;
        else if (over < 15) midRuns += outcome.runs;
        else deathRuns += outcome.runs;

        const bStat = batterTotals.get(striker.id) || { name: striker.name, runs: 0, balls: 0 };
        bStat.runs += outcome.runs;
        bStat.balls += outcome.isExtra ? 0 : 1;
        batterTotals.set(striker.id, bStat);

        if (outcome.isWicket) {
          uWkts++;
          strikerIdx = nextBatterIdx++;
        } else if (outcome.runs % 2 === 1) {
          const tmp = strikerIdx;
          strikerIdx = nonStrikerIdx;
          nonStrikerIdx = tmp;
        }
      }
      const tmp = strikerIdx;
      strikerIdx = nonStrikerIdx;
      nonStrikerIdx = tmp;
    }

    let oRuns = 0;
    let oWkts = 0;
    let oStrikerIdx = 0;
    let oNonStrikerIdx = 1;
    let oNextBatterIdx = 2;

    const userBowlers = activeUserXI.filter(p => p.role === 'Pace' || p.role === 'Spin' || p.role === 'All-rounder');
    const validUserBowlers = userBowlers.length >= 4 ? userBowlers : activeUserXI.slice(-5);

    for (let over = 0; over < 20; over++) {
      if (oWkts >= 10 || oRuns > uRuns) break;
      const bowler = validUserBowlers[over % validUserBowlers.length];
      for (let ball = 1; ball <= 6; ball++) {
        if (oWkts >= 10 || oRuns > uRuns) break;
        const striker = activeOppXI[oStrikerIdx % activeOppXI.length];
        const bIntent =
          config.userBowlingAggression === 'attacking'
            ? 'attack'
            : config.userBowlingAggression === 'defensive'
            ? 'contain'
            : 'standard';
        const outcome = simulateBall({
          over,
          ballInOver: ball,
          striker,
          nonStriker: activeOppXI[oNonStrikerIdx % activeOppXI.length],
          bowler,
          pitchType: config.pitchType,
          format: 'T20',
          bowlingTactics: {
            length: over >= 16 ? 'yorker' : 'good',
            line: 'off_stump',
            angle: 'over',
            variation: 'Stock Delivery',
            fielders: preset.positions,
            intent: bIntent,
            effort: config.userBowlingAggression === 'attacking' ? 'max' : 'standard'
          },
          battingTactics: {
            approach: 'balanced',
            targetSide: 'all',
            runningRisk: 'normal'
          }
        });

        let adjRuns = outcome.runs;
        if ((outcome.isFour || outcome.isSix) && preset.boundarySaveBonus > 0 && Math.random() * 100 < preset.boundarySaveBonus) {
          adjRuns = 2;
        }

        oRuns += adjRuns;

        const bwStat = bowlerTotals.get(bowler.id) || { name: bowler.name, wkts: 0, runs: 0, balls: 0 };
        bwStat.runs += adjRuns;
        bwStat.balls += outcome.isExtra ? 0 : 1;
        if (outcome.isWicket) bwStat.wkts += 1;
        bowlerTotals.set(bowler.id, bwStat);

        if (outcome.isWicket) {
          oWkts++;
          oStrikerIdx = oNextBatterIdx++;
        } else if (adjRuns % 2 === 1) {
          const tmp = oStrikerIdx;
          oStrikerIdx = oNonStrikerIdx;
          oNonStrikerIdx = tmp;
        }
      }
      const tmp = oStrikerIdx;
      oStrikerIdx = oNonStrikerIdx;
      oNonStrikerIdx = tmp;
    }

    if (uRuns > oRuns) userWins++;
    totalUserRuns += uRuns;
    totalOppRuns += oRuns;
    totalPP += ppRuns;
    totalMid += midRuns;
    totalDeath += deathRuns;
    totalUserWktsTaken += oWkts;
  }

  let topScorer = { name: activeUserXI[0]?.name || 'Batter', avgRuns: 34, sr: 145 };
  batterTotals.forEach(v => {
    const avg = Math.round(v.runs / runsCount);
    if (avg >= topScorer.avgRuns) {
      topScorer = {
        name: v.name,
        avgRuns: avg,
        sr: v.balls > 0 ? Math.round((v.runs / v.balls) * 100) : 140
      };
    }
  });

  let topBowler = { name: activeUserXI[activeUserXI.length - 1]?.name || 'Bowler', avgWickets: 1.8, econ: 7.8 };
  bowlerTotals.forEach(v => {
    const avgW = Number((v.wkts / runsCount).toFixed(1));
    if (avgW >= topBowler.avgWickets) {
      topBowler = {
        name: v.name,
        avgWickets: avgW,
        econ: v.balls > 0 ? Number(((v.runs / v.balls) * 6).toFixed(2)) : 7.8
      };
    }
  });

  const winProb = Math.round((userWins / runsCount) * 100);
  const avgScore = Math.round(totalUserRuns / runsCount);
  const avgConceded = Math.round(totalOppRuns / runsCount);

  return {
    iterations: runsCount,
    userWinCount: userWins,
    oppWinCount: runsCount - userWins,
    winProbabilityPct: winProb,
    avgFirstInningsScore: avgScore,
    avgSecondInningsScore: avgConceded,
    avgPowerplayScore: Math.round(totalPP / runsCount),
    avgMiddleScore: Math.round(totalMid / runsCount),
    avgDeathScore: Math.round(totalDeath / runsCount),
    avgWicketsTaken: Number((totalUserWktsTaken / runsCount).toFixed(1)),
    topProjectedScorer: topScorer,
    topProjectedBowler: topBowler,
    tacticalInsight:
      winProb >= 60
        ? `Strong tactical edge (${winProb}% win rate). ${preset.name} limits ${opponentTeam.shortName} to ${avgConceded} avg runs on a ${config.pitchType} surface.`
        : winProb >= 45
        ? `Evenly poised contest (${winProb}% win rate). Consider increasing middle-overs spin control or adjusting batting intent.`
        : `High risk alert (${winProb}% win rate). ${opponentTeam.shortName}'s lineup exploits this setup—switch to ${config.pitchType === 'Flat Track' ? 'Death Fortress' : 'Spin Trap Web'} or bolster bowling depth.`
  };
}

// ============================================================================
// 4. PLAYER PERSONALITIES & DRESSING-ROOM DYNAMICS SERVICE
// ============================================================================

export type PersonalityArchetype =
  | 'Dressing Room Leader'
  | 'Ice-Cold Finisher'
  | 'High-Maintenance Superstar'
  | 'Dedicated Team Man'
  | 'Ambitious Maverick'
  | 'Composed Mentor';

export interface PlayerPersonalityProfile {
  archetype: PersonalityArchetype;
  playingTimeExpectation: 'Key Star' | 'Regular Starter' | 'Squad Rotation' | 'Prospect';
  leadershipScore: number;
  professionalism: number;
  temperament: number;
  mediaHandling: string;
  mentorBonusDescription: string;
  dressingRoomStatus: 'Thriving' | 'Content' | 'Restless' | 'Unhappy';
}

export function derivePlayerPersonality(player: Player, isInPlayingXI: boolean): PlayerPersonalityProfile {
  const maxSkill = Math.max(player.ratings.bat, player.ratings.bowl);
  const tmp = player.ratings.tmp || 78;
  const comp = player.ratings.comp || 78;

  let archetype: PersonalityArchetype = 'Dedicated Team Man';
  if (player.isCaptain || (player.age >= 29 && tmp >= 86)) {
    archetype = 'Dressing Room Leader';
  } else if (player.age >= 32 && comp >= 84) {
    archetype = 'Composed Mentor';
  } else if (maxSkill >= 89 && tmp < 78) {
    archetype = 'High-Maintenance Superstar';
  } else if (comp >= 88 && player.ratings.pow >= 84) {
    archetype = 'Ice-Cold Finisher';
  } else if (player.age <= 24 && player.ratings.agg && player.ratings.agg >= 85) {
    archetype = 'Ambitious Maverick';
  }

  const playingTimeExpectation: PlayerPersonalityProfile['playingTimeExpectation'] =
    maxSkill >= 87
      ? 'Key Star'
      : maxSkill >= 81
      ? 'Regular Starter'
      : player.age <= 22
      ? 'Prospect'
      : 'Squad Rotation';

  const leadershipScore = Math.min(99, Math.round((tmp * 0.55) + (comp * 0.35) + (player.isCaptain ? 12 : 0)));
  const professionalism = Math.min(99, Math.round((tmp * 0.6) + (player.fitness * 0.35)));

  let dressingRoomStatus: PlayerPersonalityProfile['dressingRoomStatus'] = 'Content';
  if (player.morale >= 85) dressingRoomStatus = 'Thriving';
  else if (player.morale < 65 && !isInPlayingXI && (playingTimeExpectation === 'Key Star' || playingTimeExpectation === 'Regular Starter')) {
    dressingRoomStatus = 'Unhappy';
  } else if (player.morale < 75 || (!isInPlayingXI && playingTimeExpectation === 'Key Star')) {
    dressingRoomStatus = 'Restless';
  }

  const mentorBonusDescription =
    archetype === 'Dressing Room Leader'
      ? '+4% team composure in tight chases & boosts young players’ morale.'
      : archetype === 'Composed Mentor'
      ? '+15% training XP gain for U-23 prospects in the same role.'
      : archetype === 'Ice-Cold Finisher'
      ? '+6% boundary execution in Overs 16–20 under high required run rates.'
      : archetype === 'High-Maintenance Superstar'
      ? 'Elite match-winner, but morale drops by -8 if benched for consecutive games.'
      : archetype === 'Ambitious Maverick'
      ? 'High ceiling X-factor; thrives when given attacking tactical freedom.'
      : 'Reliable squad professional; maintains steady morale even when rotated.';

  return {
    archetype,
    playingTimeExpectation,
    leadershipScore,
    professionalism,
    temperament: tmp,
    mediaHandling: tmp >= 85 ? 'Level-Headed' : tmp >= 76 ? 'Media Savvy' : 'Outspoken',
    mentorBonusDescription,
    dressingRoomStatus
  };
}

// ============================================================================
// 5. STADIUM & TRAINING INFRASTRUCTURE SERVICE
// ============================================================================

export interface ClubInfrastructureState {
  teamId: string;
  stadiumTier: number;
  trainingComplexTier: number;
  medicalCenterTier: number;
  scoutingAcademyTier: number;
  analyticsLabTier: number;
}

export interface FacilityUpgradeSpec {
  key: keyof Omit<ClubInfrastructureState, 'teamId'>;
  name: string;
  icon: string;
  currentTier: number;
  maxTier: number;
  upgradeCostCr: number;
  currentEffectLabel: string;
  nextEffectLabel: string;
}

export function getDefaultInfrastructure(teamId: string): ClubInfrastructureState {
  return {
    teamId,
    stadiumTier: 2,
    trainingComplexTier: 2,
    medicalCenterTier: 2,
    scoutingAcademyTier: 2,
    analyticsLabTier: 2
  };
}

export function getFacilitySpecs(infra: ClubInfrastructureState): FacilityUpgradeSpec[] {
  return [
    {
      key: 'stadiumTier',
      name: 'Stadium & Hospitality Bowl',
      icon: '🏟️',
      currentTier: infra.stadiumTier,
      maxTier: 5,
      upgradeCostCr: Number((infra.stadiumTier * 2.5).toFixed(2)),
      currentEffectLabel: `+${infra.stadiumTier * 0.45} Cr gate revenue per home match`,
      nextEffectLabel: `+${(infra.stadiumTier + 1) * 0.45} Cr gate revenue per home match`
    },
    {
      key: 'trainingComplexTier',
      name: 'High-Performance Biomechanics Nets',
      icon: '🏋️',
      currentTier: infra.trainingComplexTier,
      maxTier: 5,
      upgradeCostCr: Number((infra.trainingComplexTier * 2.0).toFixed(2)),
      currentEffectLabel: `+${infra.trainingComplexTier * 12}% Squad Training XP gain`,
      nextEffectLabel: `+${(infra.trainingComplexTier + 1) * 12}% Squad Training XP gain`
    },
    {
      key: 'medicalCenterTier',
      name: 'Sports Science & Cryo Rehab Clinic',
      icon: '🩺',
      currentTier: infra.medicalCenterTier,
      maxTier: 5,
      upgradeCostCr: Number((infra.medicalCenterTier * 1.8).toFixed(2)),
      currentEffectLabel: `+${infra.medicalCenterTier * 4}% daily stamina recovery & -${infra.medicalCenterTier * 15}% injury risk`,
      nextEffectLabel: `+${(infra.medicalCenterTier + 1) * 4}% daily stamina recovery & -${(infra.medicalCenterTier + 1) * 15}% injury risk`
    },
    {
      key: 'scoutingAcademyTier',
      name: 'Grassroots & Youth Scouting Network',
      icon: '🔭',
      currentTier: infra.scoutingAcademyTier,
      maxTier: 5,
      upgradeCostCr: Number((infra.scoutingAcademyTier * 1.6).toFixed(2)),
      currentEffectLabel: `Unlocks Tier-${infra.scoutingAcademyTier} domestic prodigies & +${infra.scoutingAcademyTier * 5} potential cap`,
      nextEffectLabel: `Unlocks Tier-${infra.scoutingAcademyTier + 1} domestic prodigies & +${(infra.scoutingAcademyTier + 1) * 5} potential cap`
    },
    {
      key: 'analyticsLabTier',
      name: 'AI Matchup & Auction War Room',
      icon: '📊',
      currentTier: infra.analyticsLabTier,
      maxTier: 5,
      upgradeCostCr: Number((infra.analyticsLabTier * 1.5).toFixed(2)),
      currentEffectLabel: `+${infra.analyticsLabTier * 3}% tactical fielding efficiency & auction bargain alerts`,
      nextEffectLabel: `+${(infra.analyticsLabTier + 1) * 3}% tactical fielding efficiency & auction bargain alerts`
    }
  ];
}

// ============================================================================
// 6. AI TACTICAL INTELLIGENCE SERVICE
// ============================================================================

export function selectOptimalAiPlayingXI(
  team: Team,
  allPlayers: Player[],
  pitchType: PitchType = 'Balanced Sporting'
): string[] {
  const squad = allPlayers.filter(p => p.clubId === team.id);
  if (squad.length <= 11) return squad.map(p => p.id);

  const scored = squad.map(p => {
    const isSpin = p.role === 'Spin' || (p.bowlingStyle || '').toLowerCase().includes('spin');
    const isPace = p.role === 'Pace' || (p.bowlingStyle || '').toLowerCase().includes('fast');
    let pitchBonus = 0;
    if ((pitchType === 'Dry & Turning' || pitchType === 'Dry Turner') && isSpin) pitchBonus = 7;
    if (pitchType === 'Green Seamer' && isPace) pitchBonus = 7;
    if (pitchType === 'Flat Track' && p.ratings.pow >= 84) pitchBonus = 5;

    const baseSkill = Math.max(p.ratings.bat, p.ratings.bowl);
    const allRoundBonus = p.role === 'All-rounder' ? 4 : 0;
    const captainBonus = p.isCaptain ? 20 : 0;
    const formMod = (p.form - 50) * 0.15;
    const fitnessMod = p.fitness < 65 ? -10 : 0;

    return {
      player: p,
      score: baseSkill + pitchBonus + allRoundBonus + captainBonus + formMod + fitnessMod
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected: Player[] = [];
  const addPlayer = (p: Player) => {
    if (selected.length < 11 && !selected.some(s => s.id === p.id)) {
      selected.push(p);
    }
  };

  const isWk = (p: Player) => {
    const r = (p.role || '').toLowerCase();
    const pr = (p.primaryRole || '').toLowerCase();
    return r.includes('wk') || r.includes('keeper') || pr.includes('wk');
  };

  const keeper = scored.find(s => isWk(s.player));
  if (keeper) addPlayer(keeper.player);

  const bowlers = scored.filter(s => s.player.role === 'Pace' || s.player.role === 'Spin' || s.player.role === 'All-rounder');
  bowlers.slice(0, 5).forEach(b => addPlayer(b.player));

  scored.forEach(s => addPlayer(s.player));

  return selected.slice(0, 11).map(p => p.id);
}

// ============================================================================
// 6B. AI CRICKET DIRECTOR EXECUTIVE INTELLIGENCE SERVICE
// ============================================================================

export interface DirectorRosterAlert {
  player: Player;
  severity: 'HIGH' | 'MODERATE' | 'LOW';
  status: string;
  recommendation: string;
}

export interface DirectorChangeItem {
  inPlayer: Player;
  outPlayer: Player;
  rationale: string;
}

export interface CricketDirectorBriefing {
  director: {
    name: string;
    title: string;
    experience: string;
    avatarTag: string;
  };
  executiveSummary: string;
  opponentAnalysis: {
    opponentTeam: Team;
    h2h: HeadToHeadSummary;
    dangerBatter?: Player;
    dangerBowler?: Player;
    tacticalVulnerability: string;
  };
  recommendedXI: {
    playerIds: string[];
    players: Player[];
    changesFromCurrent: DirectorChangeItem[];
    balance: {
      batters: number;
      wicketkeeper: number;
      allrounders: number;
      pacers: number;
      spinners: number;
    };
    pitchSuitabilityScore: number;
  };
  pitchRecommendation: {
    suggestedPitch: PitchType;
    curatorInstruction: string;
    strategicReason: string;
  };
  tacticalGamePlan: {
    powerplay: {
      fieldPresetId: FieldTemplateId;
      intent: 'aggressive' | 'balanced' | 'contain';
      instructions: string;
    };
    middleOvers: {
      fieldPresetId: FieldTemplateId;
      intent: 'aggressive' | 'balanced' | 'contain';
      instructions: string;
    };
    deathOvers: {
      fieldPresetId: FieldTemplateId;
      intent: 'aggressive' | 'balanced' | 'contain';
      instructions: string;
    };
  };
  workloadAndMoraleAlerts: DirectorRosterAlert[];
  scoutingDirectives: {
    targetDepartment: string;
    urgency: 'IMMEDIATE' | 'NEXT_WINDOW' | 'LONG_TERM';
    scoutingNeed: string;
    suggestedArchetype: string;
  }[];
  infrastructurePriority: {
    recommendedUpgrade: keyof Omit<ClubInfrastructureState, 'teamId'>;
    facilityName: string;
    costCr: number;
    affordable: boolean;
    strategicJustification: string;
  };
}

const DIRECTORS_MAP: Record<string, { name: string; title: string; experience: string; tag: string }> = {
  team_che: { name: 'Stephen Fleming', title: 'Director of Cricket Operations', experience: '5x Champion Strategist', tag: 'CSK' },
  team_csk: { name: 'Stephen Fleming', title: 'Director of Cricket Operations', experience: '5x Champion Strategist', tag: 'CSK' },
  team_mum: { name: 'Mahela Jayawardene', title: 'Global Head of Performance', experience: 'Tactical Mastermind', tag: 'MI' },
  team_kol: { name: 'Gautam Gambhir', title: 'Head of Cricket & Chief Mentor', experience: 'Championship Winning Leader', tag: 'KKR' },
  team_blr: { name: 'Mo Bobat', title: 'Director of High Performance', experience: 'ECB & Franchise Systems Leader', tag: 'RCB' },
  team_rcb: { name: 'Mo Bobat', title: 'Director of High Performance', experience: 'ECB & Franchise Systems Leader', tag: 'RCB' },
  team_guj: { name: 'Vikram Solanki', title: 'Director of Cricket', experience: 'Title-Winning Architect', tag: 'GT' },
  team_del: { name: 'Sourav Ganguly', title: 'Director of Cricket Operations', experience: 'Former National Captain & Leader', tag: 'DC' },
  team_raj: { name: 'Kumar Sangakkara', title: 'Director of Cricket', experience: 'Hall of Fame Legend', tag: 'RR' },
  team_luc: { name: 'Justin Langer', title: 'Director of Cricket & Head Coach', experience: 'Elite Culture & Performance Coach', tag: 'LSG' },
  team_hyd: { name: 'Daniel Vettori', title: 'Director of Cricket & Head Coach', experience: 'Ultra-Modern T20 Strategist', tag: 'SRH' },
  team_pun: { name: 'Ricky Ponting', title: 'Head of Cricket & Strategic Advisor', experience: '3x World Cup Champion', tag: 'PBKS' }
};

export function generateCricketDirectorBriefing(
  userTeam: Team,
  opponentTeam: Team,
  allPlayers: Player[],
  pitchType: PitchType = 'Balanced Sporting',
  completedMatches: CompletedMatchRecord[] = []
): CricketDirectorBriefing {
  const safeUserTeam: Team = userTeam || {
    id: 'team_kol',
    name: 'Kolkata Knight Riders',
    shortName: 'KKR',
    city: 'Kolkata',
    purseCr: 12.5,
    playingXIIds: [],
    squad: []
  } as unknown as Team;

  const safeOppTeam: Team = opponentTeam || {
    id: 'team_che',
    name: 'Chennai Super Kings',
    shortName: 'CSK',
    city: 'Chennai',
    purseCr: 10.0,
    playingXIIds: [],
    squad: []
  } as unknown as Team;

  const directorInfo = DIRECTORS_MAP[safeUserTeam.id] || {
    name: 'Sir Clive Lloyd',
    title: 'Senior Director of Cricket Operations',
    experience: 'Legendary Franchise & International Tactician',
    tag: safeUserTeam.shortName || 'DIRECTOR'
  };

  const safePlayers = Array.isArray(allPlayers) ? allPlayers : [];
  const userSquad = safePlayers.filter(p => p && p.clubId === safeUserTeam.id);
  const oppSquad = safePlayers.filter(p => p && p.clubId === safeOppTeam.id);

  // 1. OPPONENT & H2H ANALYSIS
  const userShort = safeUserTeam.shortName || (typeof safeUserTeam.id === 'string' ? safeUserTeam.id.replace('team_', '').toUpperCase() : 'MY TEAM');
  const oppShort = safeOppTeam.shortName || (typeof safeOppTeam.id === 'string' ? safeOppTeam.id.replace('team_', '').toUpperCase() : 'OPP');
  const h2h = computeHeadToHead(userShort, oppShort, completedMatches);
  const dangerBatter = [...oppSquad].sort((a, b) => {
    const sA = Math.max(a.ratings?.bat || 70, a.ratings?.vp ?? a.ratings?.bat ?? 70, a.ratings?.pow || 70);
    const sB = Math.max(b.ratings?.bat || 70, b.ratings?.vp ?? b.ratings?.bat ?? 70, b.ratings?.pow || 70);
    return sB - sA;
  })[0];

  const dangerBowler = [...oppSquad].sort((a, b) => {
    const sA = Math.max(a.ratings?.bowl || 70, a.ratings?.dth ?? a.ratings?.bowl ?? 70);
    const sB = Math.max(b.ratings?.bowl || 70, b.ratings?.dth ?? b.ratings?.bowl ?? 70);
    return sB - sA;
  })[0];

  const oppSpinners = oppSquad.filter(p => p.role === 'Spin' || (p.bowlingStyle || '').toLowerCase().includes('spin'));
  const oppDeathAvg =
    oppSquad.length > 0
      ? oppSquad.slice(0, 5).reduce((acc, p) => acc + (p.ratings?.dth || p.ratings?.bowl || 75), 0) / Math.min(5, oppSquad.length)
      : 75;

  const tacticalVulnerability =
    oppSpinners.length <= 1
      ? `Opponent lacks depth in slow bowling. Target middle overs 7–15 aggressively against secondary pacers.`
      : oppDeathAvg < 77
      ? `Opponent death bowling index is vulnerable (${Math.round(oppDeathAvg)} avg). Preserve wickets for death assault in overs 16–20.`
      : `${dangerBatter ? dangerBatter.name : 'Top Order'} is their primary engine. Bowling full & fourth-stump corridor in powerplay is essential.`;

  // 2. RECOMMENDED PLAYING XI
  const optimalIds = selectOptimalAiPlayingXI(safeUserTeam, safePlayers, pitchType);
  const optimalPlayers = optimalIds
    .map(id => safePlayers.find(p => p.id === id))
    .filter((p): p is Player => Boolean(p));

  const currentXIIds = new Set(safeUserTeam.playingXIIds || []);
  const missingFromCurrent = optimalPlayers.filter(p => !currentXIIds.has(p.id));
  const currentPlayers = (safeUserTeam.playingXIIds || [])
    .map(id => safePlayers.find(p => p.id === id))
    .filter((p): p is Player => Boolean(p));
  const droppedFromCurrent = currentPlayers.filter(p => !optimalIds.includes(p.id));

  const changesFromCurrent: DirectorChangeItem[] = [];
  for (let i = 0; i < Math.min(missingFromCurrent.length, droppedFromCurrent.length); i++) {
    const inP = missingFromCurrent[i];
    const outP = droppedFromCurrent[i];
    let rationale = `Tactical upgrade for ${pitchType} conditions.`;
    if (outP.fitness < 70) {
      rationale = `Workload management: ${outP.name} fitness is at ${outP.fitness}% (injury prevention).`;
    } else if (outP.form < 50) {
      rationale = `Form rotation: ${outP.name} struggling for rhythm (${outP.form} form).`;
    } else if (pitchType.includes('Turn') && inP.role === 'Spin') {
      rationale = `Surface exploitation: ${inP.name} provides turning weapon on dry surface.`;
    } else if (pitchType === 'Green Seamer' && inP.role === 'Pace') {
      rationale = `Seam exploit: ${inP.name} utilizes grass covering for early movement.`;
    }
    changesFromCurrent.push({ inPlayer: inP, outPlayer: outP, rationale });
  }

  const isWk = (p: Player) => {
    const r = (p.role || '').toLowerCase();
    const pr = (p.primaryRole || '').toLowerCase();
    return r.includes('wk') || r.includes('keeper') || pr.includes('wk');
  };

  const balance = {
    batters: optimalPlayers.filter(p => p.role === 'Batsman').length,
    wicketkeeper: optimalPlayers.filter(isWk).length,
    allrounders: optimalPlayers.filter(p => p.role === 'All-rounder').length,
    pacers: optimalPlayers.filter(p => p.role === 'Pace').length,
    spinners: optimalPlayers.filter(p => p.role === 'Spin').length
  };

  const userSpinCount = userSquad.filter(p => p.role === 'Spin').length;
  const userPaceCount = userSquad.filter(p => p.role === 'Pace').length;

  // 3. PITCH RECOMMENDATION & CURATOR DIRECTIVE
  let suggestedPitch: PitchType = 'Balanced Sporting';
  let curatorInstruction = 'Maintain standard rolling with 4mm grass cover for true bounce and fair pace.';
  let strategicReason = 'Balances seam early with reliable bounce for your middle-order stroke-makers.';

  const oppShortName = safeOppTeam.shortName || safeOppTeam.name || 'Opponent';
  if (userSpinCount >= 3 && oppSpinners.length <= 1) {
    suggestedPitch = 'Dry & Turning';
    curatorInstruction = 'Bake surface in sunlight, shave grass cover to 1mm, and prepare abrasive cracks for sharp finger & wrist spin.';
    strategicReason = `Our spin battery (${userSpinCount} options) neutralizes ${oppShortName}'s pace-heavy lineup on a turning deck.`;
  } else if (userPaceCount >= 4 && (dangerBatter?.ratings?.vp ?? 80) < 82) {
    suggestedPitch = 'Green Seamer';
    curatorInstruction = 'Leave 8mm green seam covering with moisture underneath for lateral deviation in overs 1–6.';
    strategicReason = `Exploits ${oppShortName}'s susceptibility to movement and unlocks early breakthroughs.`;
  } else if (userSquad.some(p => (p.ratings?.pow || 0) >= 86)) {
    suggestedPitch = 'Flat Track';
    curatorInstruction = 'Heavy roller treatment to pack clay firm; eliminate all lateral seam movement.';
    strategicReason = 'Maximizes power-hitting strike rates and rewards clean strokeplay.';
  }

  // 4. WORKLOAD & MORALE ALERTS
  const alerts: DirectorRosterAlert[] = [];
  userSquad.forEach(p => {
    if (p.isInjured || (p.injuryDays || 0) > 0) {
      alerts.push({
        player: p,
        severity: 'HIGH',
        status: `Injured (${p.injuryDays || 0} days remaining)`,
        recommendation: `Complete rehab in Sports Science Clinic; do not rush back.`
      });
    } else if (p.fitness < 72) {
      alerts.push({
        player: p,
        severity: 'HIGH',
        status: `Severe Fatigue (${p.fitness}% fitness)`,
        recommendation: `Rest from starting XI to prevent muscle strain.`
      });
    } else if (p.morale < 60) {
      const pers = derivePlayerPersonality(p, currentXIIds.has(p.id));
      alerts.push({
        player: p,
        severity: 'MODERATE',
        status: `Morale Low (${p.morale} · ${pers.dressingRoomStatus})`,
        recommendation: `Schedule 1-on-1 team talk or grant game time to restore confidence.`
      });
    }
  });

  // 5. TACTICAL GAME PLAN
  const tacticalGamePlan = {
    powerplay: {
      fieldPresetId: (suggestedPitch === 'Green Seamer' ? 'powerplay_attacking' : 'powerplay_balanced') as FieldTemplateId,
      intent: 'aggressive' as const,
      instructions: `Attack stumps in overs 1–4. If ${dangerBatter?.name || 'danger batter'} strikes, post slip and gully.`
    },
    middleOvers: {
      fieldPresetId: (suggestedPitch.includes('Turn') ? 'spin_web' : 'middle_squeeze') as FieldTemplateId,
      intent: 'contain' as const,
      instructions: `Choke run rate with 4 boundary riders and deep midwicket protection. Deny easy singles.`
    },
    deathOvers: {
      fieldPresetId: 'death_yorker' as FieldTemplateId,
      intent: 'contain' as const,
      instructions: `Wide yorkers and back-of-hand slower deliveries. 5 boundary riders guarding ropes.`
    }
  };

  // 6. SCOUTING DIRECTIVES
  const scoutingDirectives: CricketDirectorBriefing['scoutingDirectives'] = [];
  const deathSpecialists = userSquad.filter(p => (p.ratings.dth || 0) >= 82);
  if (deathSpecialists.length < 2) {
    scoutingDirectives.push({
      targetDepartment: 'Death Bowling Specialists',
      urgency: 'IMMEDIATE',
      scoutingNeed: 'Lacking certified death over yorker bowler (DTH rating >= 82).',
      suggestedArchetype: 'Fast / Left-arm Pace with 85+ Death execution'
    });
  }

  const keepers = userSquad.filter(isWk);
  if (keepers.length < 2) {
    scoutingDirectives.push({
      targetDepartment: 'Wicketkeeping Roster Depth',
      urgency: 'NEXT_WINDOW',
      scoutingNeed: 'Single keeper on books. Need backup gloveman to hedge injury risk.',
      suggestedArchetype: 'Dynamic WK-Batter capable of batting top 4'
    });
  }

  const powerHitters = userSquad.filter(p => (p.ratings?.pow || 0) >= 84);
  if (powerHitters.length < 3) {
    scoutingDirectives.push({
      targetDepartment: 'Lower-Order Finisher',
      urgency: 'NEXT_WINDOW',
      scoutingNeed: 'Need designated boundary clearer for overs 17–20.',
      suggestedArchetype: 'Ice-Cold Finisher with 85+ Power rating'
    });
  }

  if (scoutingDirectives.length === 0) {
    scoutingDirectives.push({
      targetDepartment: 'Youth Academy Pipeline',
      urgency: 'LONG_TERM',
      scoutingNeed: 'Squad is well-balanced. Focus on discovering U-21 talent.',
      suggestedArchetype: 'Ambitious Maverick prospect for development'
    });
  }

  // 7. INFRASTRUCTURE PRIORITY
  let recommendedUpgrade: keyof Omit<ClubInfrastructureState, 'teamId'> = 'trainingComplexTier';
  let facilityName = 'High-Performance Biomechanics Nets';
  let costCr = 4.0;
  let strategicJustification = 'Enhance squad training multipliers to accelerate talent development.';

  if (alerts.some(a => a.severity === 'HIGH')) {
    recommendedUpgrade = 'medicalCenterTier';
    facilityName = 'Sports Science & Cryo Rehab Clinic';
    costCr = 3.6;
    strategicJustification = 'Multiple squad fatigue/injury flags detected. Upgrading Clinic boosts daily recovery and reduces injury days.';
  } else if ((safeUserTeam.purseCr || 0) < 6.0) {
    recommendedUpgrade = 'stadiumTier';
    facilityName = 'Stadium & Hospitality Bowl';
    costCr = 5.0;
    strategicJustification = 'Boost matchday gate revenue by +0.45 Cr per home game to replenish franchise purse.';
  }

  const executiveSummary = `Director's Assessment: Facing ${safeOppTeam.name || 'Opponent'} (${safeOppTeam.shortName || 'OPP'}). ${
    h2h.totalPlayed > 0 ? `Historical record: ${h2h.teamAWins}W - ${h2h.teamBWins}L.` : 'First encounter this season.'
  } ${tacticalVulnerability} ${
    changesFromCurrent.length > 0
      ? `Recommending ${changesFromCurrent.length} tactical Playing XI adjustment(s).`
      : 'Current Playing XI is tactically aligned.'
  }`;

  return {
    director: {
      name: directorInfo.name,
      title: directorInfo.title,
      experience: directorInfo.experience,
      avatarTag: directorInfo.tag
    },
    executiveSummary,
    opponentAnalysis: {
      opponentTeam: safeOppTeam,
      h2h,
      dangerBatter,
      dangerBowler,
      tacticalVulnerability
    },
    recommendedXI: {
      playerIds: optimalIds,
      players: optimalPlayers,
      changesFromCurrent,
      balance,
      pitchSuitabilityScore: Math.min(98, Math.max(78, 85 + (optimalPlayers.length === 11 ? 5 : 0)))
    },
    pitchRecommendation: {
      suggestedPitch,
      curatorInstruction,
      strategicReason
    },
    tacticalGamePlan,
    workloadAndMoraleAlerts: alerts,
    scoutingDirectives,
    infrastructurePriority: {
      recommendedUpgrade,
      facilityName,
      costCr,
      affordable: (safeUserTeam.purseCr || 0) >= costCr,
      strategicJustification
    }
  };
}

// ============================================================================
// 7. HEAD-TO-HEAD & ARCHIVE ANALYTICS SERVICE
// ============================================================================

export interface HeadToHeadSummary {
  teamAShort: string;
  teamBShort: string;
  totalPlayed: number;
  teamAWins: number;
  teamBWins: number;
  highestScoreA: string;
  highestScoreB: string;
  recentMeetings: CompletedMatchRecord[];
}

function safeUpper(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.toUpperCase().trim();
  if (typeof val === 'number') return String(val).toUpperCase().trim();
  return '';
}

function normalizeCanonicalShort(code: string): string {
  const c = safeUpper(code);
  if (c === 'KOL' || c === 'KOLKATA' || c === 'KOLKATA KNIGHT RIDERS') return 'KKR';
  if (c === 'BLR' || c === 'BENGALURU' || c === 'ROYAL CHALLENGERS BENGALURU') return 'RCB';
  return c;
}

function resolveTeamShort(teamInput: any): string {
  if (!teamInput) return '';
  if (typeof teamInput === 'string') return normalizeCanonicalShort(teamInput);
  if (typeof teamInput === 'object') {
    const rawId = typeof teamInput.id === 'string' ? teamInput.id.replace('team_', '') : '';
    const cand = teamInput.shortName || rawId || teamInput.name || teamInput.code || teamInput.teamCode || '';
    return normalizeCanonicalShort(cand);
  }
  return normalizeCanonicalShort(teamInput);
}

function doesTextMatchTeamShort(text: string, shortCode: string, fallbackName: string = ''): boolean {
  const t = safeUpper(text);
  const s = safeUpper(shortCode);
  if (!t || !s) return false;
  if (t.includes(s)) return true;
  if (fallbackName && t.includes(safeUpper(fallbackName))) return true;
  if ((s === 'KKR' || s === 'KOL') && (t.includes('KOLKATA') || t.includes('KNIGHT RIDERS') || t.includes('KOL'))) return true;
  if ((s === 'RCB' || s === 'BLR') && (t.includes('BENGALURU') || t.includes('CHALLENGERS') || t.includes('BLR'))) return true;
  if ((s === 'CSK' || s === 'CHE') && (t.includes('CHENNAI') || t.includes('SUPER KINGS'))) return true;
  if ((s === 'MI' || s === 'MUM') && (t.includes('MUMBAI') || t.includes('INDIANS'))) return true;
  if ((s === 'SRH' || s === 'HYD') && (t.includes('HYDERABAD') || t.includes('SUNRISERS'))) return true;
  if ((s === 'DC' || s === 'DEL') && (t.includes('DELHI') || t.includes('CAPITALS'))) return true;
  if ((s === 'RR' || s === 'RAJ') && (t.includes('RAJASTHAN') || t.includes('ROYALS'))) return true;
  if ((s === 'GT' || s === 'GUJ') && (t.includes('GUJARAT') || t.includes('TITANS'))) return true;
  if ((s === 'LSG' || s === 'LKO') && (t.includes('LUCKNOW') || t.includes('SUPER GIANTS'))) return true;
  if ((s === 'PUN' || s === 'PBKS') && (t.includes('PUNJAB') || t.includes('KINGS'))) return true;
  return false;
}

function resolveTeamName(teamInput: any): string {
  if (!teamInput) return '';
  if (typeof teamInput === 'string') return safeUpper(teamInput);
  if (typeof teamInput === 'object') {
    const cand = teamInput.name || teamInput.teamName || teamInput.shortName || '';
    return safeUpper(cand);
  }
  return safeUpper(teamInput);
}

export function computeHeadToHead(
  teamAShort: string = '',
  teamBShort: string = '',
  completedMatches: CompletedMatchRecord[] = []
): HeadToHeadSummary {
  const a = normalizeCanonicalShort(teamAShort);
  const b = normalizeCanonicalShort(teamBShort);

  if (!a || !b || !Array.isArray(completedMatches)) {
    return {
      teamAShort: a || 'TEAM A',
      teamBShort: b || 'TEAM B',
      totalPlayed: 0,
      teamAWins: 0,
      teamBWins: 0,
      highestScoreA: '—',
      highestScoreB: '—',
      recentMeetings: []
    };
  }

  const meetings = completedMatches.filter(m => {
    if (!m) return false;
    const h = resolveTeamShort(m.homeTeam);
    const aw = resolveTeamShort(m.awayTeam);
    return (h === a && aw === b) || (h === b && aw === a);
  });

  let aWins = 0;
  let bWins = 0;
  let maxA = 0;
  let maxAWkts = 0;
  let maxB = 0;
  let maxBWkts = 0;

  meetings.forEach(m => {
    if (!m) return;
    const summary = safeUpper(m.summary || (m as any)?.resultSummary || '');
    const hShort = resolveTeamShort(m.homeTeam);
    const awShort = resolveTeamShort(m.awayTeam);
    const hName = resolveTeamName(m.homeTeam);
    const awName = resolveTeamName(m.awayTeam);

    if (
      (a && summary.includes(`${a} WON`)) ||
      (a && summary.startsWith(a)) ||
      (hShort === a && Boolean(hName) && summary.includes(`${hName} WON`)) ||
      (awShort === a && Boolean(awName) && summary.includes(`${awName} WON`))
    ) {
      aWins++;
    } else if (
      (b && summary.includes(`${b} WON`)) ||
      (b && summary.startsWith(b)) ||
      (hShort === b && Boolean(hName) && summary.includes(`${hName} WON`)) ||
      (awShort === b && Boolean(awName) && summary.includes(`${awName} WON`))
    ) {
      bWins++;
    } else if (m.innings1 && m.innings2) {
      const r1 = m.innings1.runs || 0;
      const r2 = m.innings2.runs || 0;
      const inn1Team = safeUpper(m.innings1.team || (m.innings1 as any)?.battingTeamId || '');
      const inn1IsA = doesTextMatchTeamShort(inn1Team, a, hShort === a ? hName : awName);
      if (r1 > r2) {
        if (inn1IsA) aWins++;
        else bWins++;
      } else if (r2 > r1) {
        if (inn1IsA) bWins++;
        else aWins++;
      }
    }

    [m.innings1, m.innings2].forEach(inn => {
      if (!inn) return;
      const innTeam = safeUpper(inn.team || (inn as any)?.battingTeamId || '');
      const isTeamA = doesTextMatchTeamShort(innTeam, a, hShort === a ? hName : awName);
      const runs = inn.runs || 0;
      const wickets = typeof inn.wickets === 'number' ? inn.wickets : 0;

      if (isTeamA && runs >= maxA) {
        maxA = runs;
        maxAWkts = wickets;
      } else if (!isTeamA && runs >= maxB) {
        maxB = runs;
        maxBWkts = wickets;
      }
    });
  });

  return {
    teamAShort: a,
    teamBShort: b,
    totalPlayed: meetings.length,
    teamAWins: aWins,
    teamBWins: bWins,
    highestScoreA: maxA > 0 ? `${maxA}/${maxAWkts}` : '—',
    highestScoreB: maxB > 0 ? `${maxB}/${maxBWkts}` : '—',
    recentMeetings: meetings.slice(0, 10)
  };
}
