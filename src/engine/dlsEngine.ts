import { DLSState } from '../types/cricket';

/**
 * Standard T20 DLS Resource Percentages (Overs remaining vs Wickets down)
 * Approximated from standard ICC DLS Professional Edition tables for 20-over matches.
 */
const T20_RESOURCE_TABLE: Record<number, number[]> = {
  // overs: [0 wkts, 2 wkts, 4 wkts, 6 wkts, 8 wkts, 9 wkts]
  20: [100.0, 83.8, 63.8, 41.5, 20.0, 9.6],
  18: [92.8, 78.6, 60.5, 39.8, 19.4, 9.4],
  16: [85.1, 72.9, 56.8, 37.9, 18.7, 9.1],
  15: [81.0, 69.8, 54.8, 36.8, 18.3, 9.0],
  14: [76.7, 66.5, 52.6, 35.6, 17.8, 8.8],
  12: [67.8, 59.4, 47.7, 32.9, 16.7, 8.3],
  10: [58.2, 51.5, 42.0, 29.5, 15.3, 7.7],
  8:  [47.8, 42.7, 35.4, 25.4, 13.5, 6.9],
  6:  [36.7, 33.1, 27.9, 20.5, 11.2, 5.8],
  5:  [30.8, 27.9, 23.8, 17.7, 9.8, 5.1],
  4:  [24.8, 22.6, 19.4, 14.6, 8.2, 4.3],
  3:  [18.6, 17.1, 14.8, 11.3, 6.4, 3.4],
  2:  [12.5, 11.5, 10.0, 7.8, 4.5, 2.4],
  1:  [6.3,  5.8,  5.1,  4.0, 2.3, 1.2],
  0:  [0.0,  0.0,  0.0,  0.0, 0.0, 0.0],
};

function getResourcePercentage(oversLeft: number, wicketsLost: number): number {
  const roundedOvers = Math.max(0, Math.min(20, Math.round(oversLeft)));
  const tableKeys = Object.keys(T20_RESOURCE_TABLE).map(Number).sort((a, b) => b - a);
  
  // Find nearest or exact over
  let nearestKey = tableKeys[0];
  for (const k of tableKeys) {
    if (roundedOvers >= k) {
      nearestKey = k;
      break;
    }
  }

  const row = T20_RESOURCE_TABLE[nearestKey] || T20_RESOURCE_TABLE[0];
  const wktIdx = wicketsLost <= 1 ? 0 : wicketsLost <= 3 ? 1 : wicketsLost <= 5 ? 2 : wicketsLost <= 7 ? 3 : wicketsLost <= 8 ? 4 : 5;
  return row[wktIdx] ?? row[0];
}

/**
 * Calculates revised DLS Target for interrupted innings
 * @param innings1Runs Total runs scored by Team 1
 * @param originalMaxOvers Scheduled overs (usually 20)
 * @param revisedMaxOvers Reduced overs due to rain (e.g. 15, 12, 10, 5)
 * @param currentWickets Wickets lost by chasing team at rain interruption
 */
export function calculateDLSTarget(
  innings1Runs: number,
  originalMaxOvers: number = 20,
  revisedMaxOvers: number = 14,
  currentWickets: number = 0
): DLSState {
  const oversLost = Math.max(0, originalMaxOvers - revisedMaxOvers);
  
  const r1 = 100.0; // Team 1 had 100% resources
  const r2 = getResourcePercentage(revisedMaxOvers, currentWickets); // Team 2 resources

  let dlsTarget: number;
  if (r2 < r1) {
    // Standard rain reduction formula: Target = S * (R2 / R1) + 1
    dlsTarget = Math.floor(innings1Runs * (r2 / r1)) + 1;
  } else {
    // If team 2 somehow had more resources (standard G50 avg T20 score = 165)
    dlsTarget = Math.floor(innings1Runs + (r2 - r1) * 1.65) + 1;
  }

  // Ensure minimum realistic target
  dlsTarget = Math.max(Math.round(revisedMaxOvers * 5.5), dlsTarget);

  return {
    isInterrupted: true,
    revisedMaxOvers,
    originalMaxOvers,
    dlsTargetRuns: dlsTarget,
    oversLost,
    dlsFormulaSummary: `Match reduced to ${revisedMaxOvers} ov (${oversLost} ov lost). Team 2 resources: ${r2.toFixed(1)}%. Revised DLS target: ${dlsTarget} runs.`
  };
}

/**
 * Dew Factor modifier for night matches in 2nd innings
 * Under heavy dew, bowlers struggle to grip the wet ball:
 * - Spin turn & deviation reduces by 25%
 * - Wet outfield & skidding ball increases boundary leakage by 15%
 */
export function applyDewFactorModifier(
  dotProb: number,
  boundaryProb: number,
  wicketProb: number,
  hasDew: boolean
) {
  if (!hasDew) {
    return { dotProb, boundaryProb, wicketProb };
  }
  return {
    dotProb: dotProb * 0.88,
    boundaryProb: boundaryProb * 1.15,
    wicketProb: wicketProb * 0.90
  };
}
