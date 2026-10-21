import React, { useEffect, useState, useRef } from 'react';
import Svg, {
  Circle,
  Rect,
  Line,
  G,
  Path,
  Text as SvgText,
  Defs,
  RadialGradient,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import { FielderPosition, BallOutcome, PitchLength, PitchLine } from '../../types/cricket';
import {
  computeAnimationFrame,
  computeBouncePoint,
  AnimationFrameState,
  UmpireSignalType,
  resolveUmpireSignal,
} from '../../utils/cricketAnimationTimeline';
import { sound } from '../../utils/soundEffects';

export { resolveUmpireSignal };
export type { UmpireSignalType };
export type CameraViewMode = 'broadcast' | 'tactical' | 'pitch';

interface TacticalStadium2DProps {
  fielders: FielderPosition[];
  selectedFielderId: number | null;
  onSelectFielder: (id: number | null) => void;
  onMoveFielder: (id: number, x: number, y: number) => void;
  lastBallOutcome: BallOutcome | null;
  isBallInFlight?: boolean;
  bowlerName: string;
  strikerName: string;
  nonStrikerName: string;
  bowlerJersey: number;
  strikerJersey: number;
  nonStrikerJersey: number;
  keeperJersey: number;
  fielderJerseys?: number[];
  plannedLength?: PitchLength;
  plannedLine?: PitchLine;
  showHeatmaps?: boolean;
  shotZoneLabels?: { text: string; x: number; y: number; color?: string }[];
  teamColors?: { primary: string; secondary: string };
  battingTeamColors?: { primary: string; secondary: string; shortName?: string };
  bowlingTeamColors?: { primary: string; secondary: string; shortName?: string };
  homeTeamColors?: { primary: string; secondary: string; shortName?: string; city?: string };
  venueName?: string;
  pitchType?: string;
  strikerHand?: 'RHB' | 'LHB';
  bowlerRole?: string;
  isDrsPending?: boolean;
  isOverComplete?: boolean;
  inningsIndex?: number;
  ballsCompleted?: number;
  speedMultiplier?: number;
  onPitchTargetClick?: (length: PitchLength, line: PitchLine) => void;
}

export interface StadiumVisualTheme {
  roofRingColor: string;
  ledPerimeterColor: string;
  boundaryBoardColor: string;
  turfStops: [string, string, string, string];
  pitchSoilColor: string;
  pitchBorderColor: string;
  pitchWearColor: string;
}

export function resolveKitColor(shortName?: string, rawPrimary?: string, fallback: string = '#7c3aed'): string {
  const code = (shortName || '').toUpperCase();
  if (code === 'KOL' || code === 'KKR') return '#7c3aed';
  if (code === 'PUN' || code === 'PBKS') return '#ef4444';
  if (code === 'CSK' || code === 'CHE') return '#eab308';
  if (code === 'MI' || code === 'MUM') return '#2563eb';
  if (code === 'BLR' || code === 'RCB') return '#dc2626';
  if (code === 'SRH' || code === 'HYD') return '#f97316';
  if (code === 'DC' || code === 'DEL') return '#1d4ed8';
  if (code === 'GT' || code === 'GUJ') return '#1e293b';
  if (code === 'RR' || code === 'RAJ') return '#db2777';
  if (code === 'LSG' || code === 'LKO') return '#0284c7';
  if (code === 'IND') return '#2563eb';
  if (code === 'AUS') return '#eab308';
  if (code === 'ENG') return '#dc2626';
  if (code === 'SA' || code === 'RSA') return '#16a34a';
  if (code === 'NZ') return '#18181b';
  if (code === 'PAK') return '#15803d';
  if (code === 'WI') return '#881337';
  if (code === 'SL') return '#1e40af';
  if (code === 'BAN') return '#047857';
  if (code === 'AFG') return '#1d4ed8';
  return rawPrimary || fallback;
}

export function getStadiumTheme(
  venueName?: string,
  homeShort?: string,
  homePrimary?: string,
  homeSecondary?: string,
  pitchType?: string
): StadiumVisualTheme {
  const v = (venueName || '').toLowerCase();
  const h = (homeShort || '').toUpperCase();

  let roofRingColor = '#1e293b';
  let ledPerimeterColor = homePrimary || '#312e81';
  let boundaryBoardColor = homeSecondary || '#f59e0b';
  let turfStops: [string, string, string, string] = ['#387848', '#2e6b3b', '#255e32', '#1b4a25'];
  let pitchSoilColor = '#c7a77b';
  let pitchBorderColor = '#a18359';
  let pitchWearColor = 'rgba(168, 131, 88, 0.4)';

  if (v.includes('eden') || v.includes('kolkata') || h === 'KOL') {
    roofRingColor = '#3b0764';
    ledPerimeterColor = '#6d28d9';
    boundaryBoardColor = '#f59e0b';
    turfStops = ['#3b7a47', '#316b3c', '#285c32', '#1e4926'];
  } else if (v.includes('chidambaram') || v.includes('chennai') || h === 'CSK' || h === 'CHE') {
    roofRingColor = '#713f12';
    ledPerimeterColor = '#eab308';
    boundaryBoardColor = '#1d4ed8';
    turfStops = ['#3e7c44', '#336b38', '#295b2d', '#1d4520'];
    pitchSoilColor = '#d8b47c';
  } else if (v.includes('wankhede') || v.includes('mumbai') || h === 'MI' || h === 'MUM') {
    roofRingColor = '#1e3a8a';
    ledPerimeterColor = '#2563eb';
    boundaryBoardColor = '#f59e0b';
    turfStops = ['#2f7e49', '#276c3e', '#1e5a32', '#154324'];
    pitchSoilColor = '#ca986b';
  } else if (v.includes('chinnaswamy') || v.includes('bengaluru') || h === 'BLR' || h === 'RCB') {
    roofRingColor = '#7f1d1d';
    ledPerimeterColor = '#dc2626';
    boundaryBoardColor = '#eab308';
    turfStops = ['#3a844e', '#2f7241', '#256035', '#1b4a28'];
  } else if (v.includes('hyderabad') || h === 'SRH' || h === 'HYD') {
    roofRingColor = '#7c2d12';
    ledPerimeterColor = '#f97316';
    boundaryBoardColor = '#fbbf24';
    turfStops = ['#397945', '#2e6939', '#24582e', '#1a4422'];
  } else if (v.includes('delhi') || h === 'DC' || h === 'DEL') {
    roofRingColor = '#1e3a8a';
    ledPerimeterColor = '#dc2626';
    boundaryBoardColor = '#2563eb';
    turfStops = ['#357544', '#2b6439', '#22542e', '#184022'];
  } else if (v.includes('ahmedabad') || v.includes('modi') || h === 'GT' || h === 'GUJ') {
    roofRingColor = '#0f172a';
    ledPerimeterColor = '#eab308';
    boundaryBoardColor = '#38bdf8';
    turfStops = ['#377b49', '#2d6a3d', '#235932', '#194324'];
    pitchSoilColor = '#c99f74';
  } else if (v.includes('jaipur') || h === 'RR' || h === 'RAJ') {
    roofRingColor = '#831843';
    ledPerimeterColor = '#ec4899';
    boundaryBoardColor = '#2563eb';
    turfStops = ['#387644', '#2e6638', '#24552d', '#1a4221'];
  } else if (v.includes('lucknow') || v.includes('ekana') || h === 'LSG' || h === 'LKO') {
    roofRingColor = '#0c4a6e';
    ledPerimeterColor = '#0284c7';
    boundaryBoardColor = '#f97316';
    turfStops = ['#347344', '#2a6238', '#20512d', '#173e21'];
    pitchSoilColor = '#c4976d';
  } else if (v.includes('mohali') || v.includes('chandigarh') || v.includes('mullanpur') || h === 'PBKS' || h === 'PUN') {
    roofRingColor = '#7f1d1d';
    ledPerimeterColor = '#ef4444';
    boundaryBoardColor = '#eab308';
    turfStops = ['#368049', '#2b6f3d', '#215e32', '#174925'];
    pitchSoilColor = '#c3b282';
  }

  if (pitchType === 'Green Seamer') {
    pitchSoilColor = '#bfc288';
    pitchBorderColor = '#8c945a';
  } else if (pitchType === 'Dry & Turning' || pitchType === 'Dry Turner') {
    pitchSoilColor = '#d8b47c';
    pitchBorderColor = '#a6824e';
  }

  return {
    roofRingColor,
    ledPerimeterColor,
    boundaryBoardColor,
    turfStops,
    pitchSoilColor,
    pitchBorderColor,
    pitchWearColor,
  };
}

/**
 * Reusable SVG Umpire Marker & Unmistakable Hand Signal Component
 * Renders a white umpire circle with a black centre and large, unmistakable white SVG
 * hand/arm icons directly beside the relevant umpire marker for:
 * - FOUR: horizontal extended arm & hand
 * - SIX: both arms raised high overhead
 * - OUT: raised hand with prominent vertical index finger
 * - WIDE: horizontal extended arm(s)
 * - NO-BALL: distinct diagonal raised arm with free-hit ring
 * - OVER COMPLETE: hands arched overhead on umpire hat
 */
export const UmpireMarkerSvg: React.FC<{
  x: number;
  y: number;
  signal: UmpireSignalType;
  role: 'bowler_end' | 'square_leg';
}> = ({ x, y, signal }) => {
  const isSignaling = signal !== 'none';

  return (
    <G transform={`translate(${x}, ${y})`} pointerEvents="none">
      {/* 1. Unmistakable White SVG Hand / Arm Signal Icons Directly Beside Umpire Marker */}
      {signal === 'four' && (
        <G>
          {/* High-contrast dark backing plate behind extended horizontal arm */}
          <Rect
            x={7}
            y={-8.5}
            width={31}
            height={17}
            rx={8.5}
            fill="rgba(15, 23, 42, 0.85)"
            stroke="#38bdf8"
            strokeWidth={1.3}
          />
          {/* White horizontal sleeve & forearm */}
          <Rect
            x={8.5}
            y={-4.2}
            width={15}
            height={8.4}
            rx={2.2}
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth={1.4}
          />
          {/* Open white hand with thumb & extended fingers pointing horizontally */}
          <Path
            d="M 23 -3.6 L 27.5 -3.6 L 26.8 -6.6 C 26.8 -7.8 29 -7.8 29.2 -6.4 L 30 -3.4 L 34.8 -3.4 C 36.2 -3.4 36.2 3.4 34.8 3.4 L 23 3.4 Z"
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
          {/* Cuff divider & horizontal wave accent */}
          <Line x1={23} y1={-3.8} x2={23} y2={3.8} stroke="#0f172a" strokeWidth={1.3} />
          <Path
            d="M 38.5 -5.5 Q 41.5 0 38.5 5.5"
            fill="none"
            stroke="#ffffff"
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        </G>
      )}

      {signal === 'six' && (
        <G>
          {/* High-contrast dark backing arch behind both raised arms */}
          <Path
            d="M -21 -4 C -24 -28 -8 -35 0 -31 C 8 -35 24 -28 21 -4 Z"
            fill="rgba(15, 23, 42, 0.85)"
            stroke="#c084fc"
            strokeWidth={1.3}
          />
          {/* Left raised arm & open hand in V-shape */}
          <G transform="rotate(-24)">
            <Rect
              x={-7.8}
              y={-23.5}
              width={7}
              height={15}
              rx={2}
              fill="#ffffff"
              stroke="#0f172a"
              strokeWidth={1.4}
            />
            <Path
              d="M -7.6 -23.5 L -7.6 -30.5 C -7.6 -32.2 -1.2 -32.2 -1.2 -30.5 L -1.2 -27.2 L 1.2 -27.2 C 2.2 -27.2 2.2 -25 1.0 -25 L -1.2 -23.5 Z"
              fill="#ffffff"
              stroke="#0f172a"
              strokeWidth={1.3}
              strokeLinejoin="round"
            />
            <Line x1={-7.6} y1={-23.2} x2={-1} y2={-23.2} stroke="#0f172a" strokeWidth={1.2} />
          </G>
          {/* Right raised arm & open hand in V-shape */}
          <G transform="rotate(24)">
            <Rect
              x={0.8}
              y={-23.5}
              width={7}
              height={15}
              rx={2}
              fill="#ffffff"
              stroke="#0f172a"
              strokeWidth={1.4}
            />
            <Path
              d="M 1.2 -23.5 L -1.0 -25 C -2.2 -25 -2.2 -27.2 -1.2 -27.2 L 1.2 -27.2 L 1.2 -30.5 C 1.2 -32.2 7.6 -32.2 7.6 -30.5 L 7.6 -23.5 Z"
              fill="#ffffff"
              stroke="#0f172a"
              strokeWidth={1.3}
              strokeLinejoin="round"
            />
            <Line x1={1} y1={-23.2} x2={7.6} y2={-23.2} stroke="#0f172a" strokeWidth={1.2} />
          </G>
        </G>
      )}

      {signal === 'out' && (
        <G>
          {/* Connecting white arm from umpire shoulder to raised hand */}
          <Path
            d="M 7 -2 L 16 -4"
            stroke="#ffffff"
            strokeWidth={5}
            strokeLinecap="round"
          />
          {/* High-contrast dark circular shield behind raised index-finger hand */}
          <G transform="translate(21, -8)">
            <Circle
              cx={0}
              cy={-2}
              r={14}
              fill="rgba(15, 23, 42, 0.9)"
              stroke="#fb7185"
              strokeWidth={1.5}
            />
            {/* Wrist / Sleeve Cuff */}
            <Rect
              x={-5}
              y={5.2}
              width={10}
              height={4.5}
              rx={1.4}
              fill="#ffffff"
              stroke="#0f172a"
              strokeWidth={1.3}
            />
            {/* Clenched Palm & Curled Knuckles + Tall Raised Index Finger */}
            <Path
              d="M -5 5.2 L -5 -12.8 C -5 -14.8 -0.4 -14.8 -0.4 -12.8 L -0.4 -2.2 C 1.5 -2.5 2.4 -1.2 2.2 0.2 C 3.8 -0.1 4.6 1.0 4.4 2.4 C 5.8 2.2 6.4 3.3 5.8 4.6 L 5 5.2 Z"
              fill="#ffffff"
              stroke="#0f172a"
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
            {/* Tucked Thumb across palm */}
            <Path
              d="M -5 3.5 C -8.2 3.2 -8.2 -1.2 -5 -1.6 Z"
              fill="#ffffff"
              stroke="#0f172a"
              strokeWidth={1.3}
              strokeLinejoin="round"
            />
          </G>
        </G>
      )}

      {signal === 'wide' && (
        <G>
          {/* High-contrast dark backing across outstretched horizontal arms */}
          <Rect
            x={-35}
            y={-8}
            width={70}
            height={16}
            rx={8}
            fill="rgba(15, 23, 42, 0.85)"
            stroke="#facc15"
            strokeWidth={1.3}
          />
          {/* Left horizontal arm & hand */}
          <Rect
            x={-23.5}
            y={-4}
            width={15}
            height={8}
            rx={2}
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth={1.4}
          />
          <Path
            d="M -23 -3.4 L -32.5 -3.4 C -34 -3.4 -34 3.4 -32.5 3.4 L -23 3.4 Z"
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth={1.3}
          />
          {/* Right horizontal arm & hand */}
          <Rect
            x={8.5}
            y={-4}
            width={15}
            height={8}
            rx={2}
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth={1.4}
          />
          <Path
            d="M 23 -3.4 L 32.5 -3.4 C 34 -3.4 34 3.4 32.5 3.4 L 23 3.4 Z"
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth={1.3}
          />
        </G>
      )}

      {signal === 'no_ball' && (
        <G transform="rotate(-38)">
          {/* High-contrast dark backing behind diagonal No-Ball arm + ring */}
          <Rect
            x={7}
            y={-9}
            width={33}
            height={18}
            rx={9}
            fill="rgba(15, 23, 42, 0.88)"
            stroke="#f59e0b"
            strokeWidth={1.4}
          />
          {/* Diagonal extended white arm & hand */}
          <Rect
            x={8.5}
            y={-4}
            width={14.5}
            height={8}
            rx={2}
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth={1.4}
          />
          <Path
            d="M 22.5 -3.4 L 32 -3.4 C 33.5 -3.4 33.5 3.4 32 3.4 L 22.5 3.4 Z"
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth={1.3}
          />
          {/* Distinct Free-Hit / No-Ball circle indicator at hand */}
          <Circle
            cx={30}
            cy={0}
            r={6.5}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={1.8}
          />
        </G>
      )}

      {signal === 'over_complete' && (
        <G>
          {/* Symmetrical arms arched overhead touching white umpire hat */}
          <Circle
            cx={0}
            cy={-13}
            r={11}
            fill="rgba(15, 23, 42, 0.82)"
            stroke="#94a3b8"
            strokeWidth={1.2}
          />
          <Path
            d="M -8 -3.5 C -15 -8 -12.5 -15.5 -5.8 -16.5 L -4.5 -12.5 C -9 -11.5 -10 -7.5 -6 -4.8 Z"
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
          <Path
            d="M 8 -3.5 C 15 -8 12.5 -15.5 5.8 -16.5 L 4.5 -12.5 C 9 -11.5 10 -7.5 6 -4.8 Z"
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
          <Path
            d="M -7.8 -12.5 Q 0 -15 7.8 -12.5 C 9 -12 9 -10 7.2 -10 Q 0 -11.5 -7.2 -10 C -9 -10 -9 -12 -7.8 -12.5 Z"
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth={1.3}
          />
          <Path
            d="M -4.8 -13.2 Q 0 -18.5 4.8 -13.2 Z"
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth={1.3}
          />
        </G>
      )}

      {/* 2. Core Umpire Marker: White Outer Circle + Black Center Circle */}
      {isSignaling && (
        <Circle
          cx={0}
          cy={0}
          r={12.8}
          fill="none"
          stroke="#ffffff"
          strokeWidth={1.6}
          opacity={0.9}
        />
      )}
      <Circle cx={0} cy={1.4} r={10.6} fill="rgba(0,0,0,0.45)" />
      <Circle
        cx={0}
        cy={0}
        r={10}
        fill="#ffffff"
        stroke="#0f172a"
        strokeWidth={1.8}
      />
      <Circle cx={0} cy={0} r={4.5} fill="#0f172a" />
    </G>
  );
};

export const TacticalStadium2D: React.FC<TacticalStadium2DProps> = ({
  fielders,
  selectedFielderId,
  onSelectFielder,
  onMoveFielder,
  lastBallOutcome,
  bowlerJersey,
  strikerJersey,
  nonStrikerJersey,
  keeperJersey,
  fielderJerseys = [17, 47, 8, 2, 56, 18, 23, 24, 4],
  battingTeamColors,
  bowlingTeamColors,
  homeTeamColors,
  venueName,
  pitchType,
  plannedLength,
  plannedLine,
  shotZoneLabels,
  strikerHand = 'RHB',
  bowlerRole = 'Pace',
  isDrsPending = false,
  isOverComplete = false,
  inningsIndex = 1,
  ballsCompleted = 0,
  speedMultiplier = 2,
}) => {
  const [animProgress, setAnimProgress] = useState<number>(1);
  const [signalExpired, setSignalExpired] = useState<boolean>(false);
  const [draggingFielderId, setDraggingFielderId] = useState<number | null>(null);
  const lastBallKeyRef = useRef<string>('');
  const lastSignalKeyRef = useRef<string>('');
  const svgContainerRef = useRef<HTMLDivElement | null>(null);
  const audioPlayedRef = useRef<{ hit: boolean; wicket: boolean }>({ hit: false, wicket: false });

  // Reset signal state cleanly when innings changes or when lastBallOutcome is cleared
  useEffect(() => {
    if (!lastBallOutcome) {
      lastBallKeyRef.current = '';
      lastSignalKeyRef.current = '';
      setSignalExpired(false);
      setAnimProgress(1);
      return;
    }

    const signalKey = `${inningsIndex}-${ballsCompleted}-${lastBallOutcome.over}.${lastBallOutcome.ballNumber}-${lastBallOutcome.runs}-${lastBallOutcome.isWicket}-${lastBallOutcome.extraType || 'legal'}-${Boolean(lastBallOutcome.drsReviewed)}`;
    if (signalKey !== lastSignalKeyRef.current) {
      lastSignalKeyRef.current = signalKey;
      setSignalExpired(false);
    }

    const expireTimer = setTimeout(() => {
      setSignalExpired(true);
    }, 12000);

    return () => clearTimeout(expireTimer);
  }, [lastBallOutcome, inningsIndex, ballsCompleted]);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced || !lastBallOutcome) {
      setAnimProgress(1);
      return;
    }

    const key = `${inningsIndex}-${lastBallOutcome.over}.${lastBallOutcome.ballNumber}-${lastBallOutcome.runs}-${lastBallOutcome.isWicket}-${lastBallOutcome.commentary}`;
    if (key === lastBallKeyRef.current) return;
    lastBallKeyRef.current = key;
    audioPlayedRef.current = { hit: false, wicket: false };

    let frameId: number;
    const start = performance.now();
    const duration = speedMultiplier >= 3 ? 520 : speedMultiplier === 2 ? 720 : 950;
    setAnimProgress(0);

    const step = (now: number) => {
      const elapsed = now - start;
      const p = Math.min(1, elapsed / duration);
      setAnimProgress(p);

      if (p >= 0.24 && !audioPlayedRef.current.hit) {
        audioPlayedRef.current.hit = true;
        if (lastBallOutcome.runs > 0 || lastBallOutcome.isFour || lastBallOutcome.isSix) {
          sound.playBatHit(lastBallOutcome.isFour || lastBallOutcome.isSix, lastBallOutcome.isSix);
        }
      }

      if (p >= 0.26 && !audioPlayedRef.current.wicket && lastBallOutcome.isWicket && !isDrsPending) {
        audioPlayedRef.current.wicket = true;
        sound.playWicketCrash();
      }

      if (p < 1) {
        frameId = requestAnimationFrame(step);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [lastBallOutcome, inningsIndex, isDrsPending, speedMultiplier]);

  const frameState: AnimationFrameState = computeAnimationFrame(
    animProgress,
    lastBallOutcome,
    fielders,
    plannedLength,
    plannedLine,
    strikerHand,
    bowlerRole,
    {
      isDrsPending,
      isOverComplete,
    }
  );

  const activeBowlerUmpireSignal: UmpireSignalType = signalExpired
    ? 'none'
    : frameState.bowlerUmpireSignal;
  const activeSquareLegUmpireSignal: UmpireSignalType = signalExpired
    ? 'none'
    : frameState.squareLegUmpireSignal;

  const theme = getStadiumTheme(
    venueName,
    homeTeamColors?.shortName,
    homeTeamColors?.primary,
    homeTeamColors?.secondary,
    pitchType
  );

  const batColor = resolveKitColor(battingTeamColors?.shortName, battingTeamColors?.primary, '#7c3aed');
  const bowlColor = resolveKitColor(bowlingTeamColors?.shortName, bowlingTeamColors?.primary, '#ef4444');

  // Enlarged circular stadium filling 99% of the 400x400 coordinate system
  const cx = 200;
  const cy = 200;
  const outerR = 191;
  const boundaryR = 176;
  const circle30R = 102;

  const topCreaseY = 166;
  const bottomCreaseY = 234;

  const updateFielderFromClientPoint = (id: number, clientX: number, clientY: number) => {
    if (!svgContainerRef.current) return;
    const rect = svgContainerRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const clickX = ((clientX - rect.left) / rect.width) * 400;
    const clickY = ((clientY - rect.top) / rect.height) * 400;
    const normX = Math.round((clickX - cx) / 1.68);
    const normY = Math.round((clickY - cy) / 1.68);
    const dist = Math.hypot(normX, normY);
    if (dist <= 98 && dist >= 12) {
      onMoveFielder(id, normX, normY);
    }
  };

  const handleSvgPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (selectedFielderId !== null && draggingFielderId === null) {
      updateFielderFromClientPoint(selectedFielderId, e.clientX, e.clientY);
    }
  };

  const handleSvgPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingFielderId !== null) {
      updateFielderFromClientPoint(draggingFielderId, e.clientX, e.clientY);
    }
  };

  const handleSvgPointerUp = () => {
    if (draggingFielderId !== null) {
      setDraggingFielderId(null);
    }
  };

  const renderCornerFloodlight = (cornerX: number, cornerY: number, angleDeg: number, key: string) => {
    const bulbs: { bx: number; by: number }[] = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        bulbs.push({ bx: (c - 2) * 6.5, by: (r - 1) * 6.5 });
      }
    }
    return (
      <G key={key} transform={`translate(${cornerX}, ${cornerY}) rotate(${angleDeg})`}>
        <Rect x={-20} y={-13} width={40} height={26} rx={4} fill="#0b101b" stroke="#475569" strokeWidth={1.5} />
        {bulbs.map((b, i) => (
          <Circle key={i} cx={b.bx} cy={b.by} r={2.1} fill="#fefce8" opacity={0.95} />
        ))}
      </G>
    );
  };

  const bouncePoint = computeBouncePoint(plannedLength, plannedLine);

  return (
    <div className="w-full flex items-center justify-center px-0">
      <div
        ref={svgContainerRef}
        onPointerDown={handleSvgPointerDown}
        onPointerMove={handleSvgPointerMove}
        onPointerUp={handleSvgPointerUp}
        onPointerCancel={handleSvgPointerUp}
        style={{ width: '96.5%', maxWidth: 520, aspectRatio: '1 / 1' }}
        className="w-[96.5%] max-w-[520px] aspect-square mx-auto relative select-none cursor-pointer touch-none flex items-center justify-center"
      >
        <Svg
          viewBox="0 0 400 400"
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          <Defs>
            <RadialGradient id="turfGrad" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={theme.turfStops[0]} />
              <Stop offset="55%" stopColor={theme.turfStops[1]} />
              <Stop offset="85%" stopColor={theme.turfStops[2]} />
              <Stop offset="100%" stopColor={theme.turfStops[3]} />
            </RadialGradient>
            <LinearGradient id="sheenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.09" />
              <Stop offset="50%" stopColor="#ffffff" stopOpacity="0.0" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0.16" />
            </LinearGradient>
            <RadialGradient id="cornerGlowTL" cx="8%" cy="8%" r="48%">
              <Stop offset="0%" stopColor="#fef9c3" stopOpacity="0.22" />
              <Stop offset="100%" stopColor="#fef9c3" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="cornerGlowTR" cx="92%" cy="8%" r="48%">
              <Stop offset="0%" stopColor="#fef9c3" stopOpacity="0.22" />
              <Stop offset="100%" stopColor="#fef9c3" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="cornerGlowBL" cx="8%" cy="92%" r="48%">
              <Stop offset="0%" stopColor="#fef9c3" stopOpacity="0.22" />
              <Stop offset="100%" stopColor="#fef9c3" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="cornerGlowBR" cx="92%" cy="92%" r="48%">
              <Stop offset="0%" stopColor="#fef9c3" stopOpacity="0.22" />
              <Stop offset="100%" stopColor="#fef9c3" stopOpacity="0" />
            </RadialGradient>
          </Defs>

          {/* 1. Stadium Outer Rim & Turf (Fills 99% of 400x400 viewBox) */}
          <Circle cx={cx} cy={cy} r={outerR + 6} fill="#111827" stroke="#1f2937" strokeWidth={2} />
          <Circle
            cx={cx}
            cy={cy}
            r={outerR}
            fill="url(#turfGrad)"
            stroke={theme.boundaryBoardColor}
            strokeWidth={3.4}
            strokeOpacity={0.68}
          />

          {/* 2. Concentric Mowed Grass Rings */}
          <Circle cx={cx} cy={cy} r={156} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={17} />
          <Circle cx={cx} cy={cy} r={122} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={17} />
          <Circle cx={cx} cy={cy} r={86} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={15} />
          <Circle cx={cx} cy={cy} r={52} fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth={13} />
          <Circle cx={cx} cy={cy} r={outerR} fill="url(#sheenGrad)" />

          {/* 3. Boundary Rope & 30-Yard Dashed Inner Circle */}
          <Circle cx={cx} cy={cy} r={boundaryR} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1.8} />
          <Circle
            cx={cx}
            cy={cy}
            r={circle30R}
            fill="none"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />

          {/* Boundary Splash Effect */}
          {frameState.isBoundarySplash && (
            <Circle cx={cx} cy={cy} r={boundaryR} fill="none" stroke="#f59e0b" strokeWidth={4} opacity={0.75} />
          )}

          {/* Optional Shot-Zone Labels */}
          {shotZoneLabels?.map((lbl, idx) => (
            <SvgText
              key={idx}
              x={lbl.x}
              y={lbl.y}
              fill={lbl.color || '#f5b82e'}
              fontSize={9.5}
              fontWeight="800"
              fontFamily="monospace"
              textAnchor="middle"
              opacity={0.9}
            >
              {lbl.text}
            </SvgText>
          ))}

          {/* 4. Central Cricket Pitch Square & Strip */}
          <Rect
            x={cx - 27}
            y={cy - 45}
            width={54}
            height={90}
            rx={2}
            fill="rgba(255, 255, 255, 0.05)"
          />
          <Rect
            x={cx - 14.5}
            y={cy - 45}
            width={29}
            height={90}
            rx={3}
            fill={theme.pitchSoilColor}
            stroke={theme.pitchBorderColor}
            strokeWidth={1.5}
          />
          <Line x1={cx - 14.5} y1={topCreaseY} x2={cx + 14.5} y2={topCreaseY} stroke="rgba(255,255,255,0.88)" strokeWidth={1.3} />
          <Line x1={cx - 14.5} y1={bottomCreaseY} x2={cx + 14.5} y2={bottomCreaseY} stroke="rgba(255,255,255,0.88)" strokeWidth={1.3} />
          <Line x1={cx - 9.5} y1={topCreaseY} x2={cx - 9.5} y2={bottomCreaseY} stroke="rgba(255,255,255,0.24)" strokeWidth={0.9} />
          <Line x1={cx + 9.5} y1={topCreaseY} x2={cx + 9.5} y2={bottomCreaseY} stroke="rgba(255,255,255,0.24)" strokeWidth={0.9} />

          {/* Top & Bottom 3-Stump Pitch Extensions */}
          <Line x1={cx - 3.8} y1={cy - 51} x2={cx - 3.8} y2={cy - 41} stroke="rgba(255,255,255,0.58)" strokeWidth={1} />
          <Line x1={cx} y1={cy - 53} x2={cx} y2={cy - 41} stroke="rgba(255,255,255,0.72)" strokeWidth={1.2} />
          <Line x1={cx + 3.8} y1={cy - 51} x2={cx + 3.8} y2={cy - 41} stroke="rgba(255,255,255,0.58)" strokeWidth={1} />

          <Line x1={cx - 3.8} y1={cy + 41} x2={cx - 3.8} y2={cy + 51} stroke="rgba(255,255,255,0.58)" strokeWidth={1} />
          <Line x1={cx} y1={cy + 41} x2={cx} y2={cy + 53} stroke="rgba(255,255,255,0.72)" strokeWidth={1.2} />
          <Line x1={cx + 3.8} y1={cy + 41} x2={cx + 3.8} y2={cy + 51} stroke="rgba(255,255,255,0.58)" strokeWidth={1} />

          {/* Stumps Top End */}
          <Rect x={cx - 4.5} y={cy - 42} width={9} height={2.8} fill="#ffffff" />

          {/* Stumps Bottom End & Bails */}
          <Rect x={cx - 4.5} y={cy + 39} width={9} height={2.8} fill="#ffffff" />
          {frameState.bailsDislodged ? (
            <G>
              <Rect
                x={cx - 6.5 + frameState.bailLeftOffset.x}
                y={cy + 37.5 + frameState.bailLeftOffset.y}
                width={4.2}
                height={1.6}
                fill="#f43f5e"
              />
              <Rect
                x={cx + 2.2 + frameState.bailRightOffset.x}
                y={cy + 37.5 + frameState.bailRightOffset.y}
                width={4.2}
                height={1.6}
                fill="#f43f5e"
              />
            </G>
          ) : (
            <Rect x={cx - 4.5} y={cy + 37.5} width={9} height={1.6} fill="#e2e8f0" />
          )}

          {/* Turf Dust Ripple on Pitch Bounce */}
          {frameState.isTurfDust && (
            <Circle cx={bouncePoint.x} cy={bouncePoint.y} r={6.5} fill="none" stroke="#d8b47c" strokeWidth={1.6} opacity={0.85} />
          )}

          {/* Contact Impact Flash */}
          {frameState.isContactImpact && (
            <G transform={`translate(${cx}, ${bottomCreaseY})`}>
              <Circle cx={0} cy={0} r={11} fill="rgba(245,158,11,0.38)" />
              <Circle cx={0} cy={0} r={5.5} fill="#ffffff" />
            </G>
          )}

          {/* 5. Ball Motion Trail Path */}
          {frameState.ballTrailPoints.length > 1 && (
            <Path
              d={`M ${frameState.ballTrailPoints.map(p => `${p.x} ${p.y}`).join(' L ')}`}
              fill="none"
              stroke={
                lastBallOutcome?.isWicket
                  ? '#f43f5e'
                  : lastBallOutcome?.isSix
                  ? '#f59e0b'
                  : lastBallOutcome?.isFour
                  ? '#38bdf8'
                  : 'rgba(255,255,255,0.58)'
              }
              strokeWidth={lastBallOutcome?.isFour || lastBallOutcome?.isSix ? 2.6 : 1.7}
              strokeDasharray={lastBallOutcome?.isSix ? '4 3' : undefined}
              opacity={0.75}
            />
          )}

          {/* 6. Fielders with Realistic Pursuit Animations */}
          {frameState.fielders.map((f, idx) => {
            const isSelected = selectedFielderId === f.id || draggingFielderId === f.id;
            const jNum = fielderJerseys[idx % fielderJerseys.length] || f.id;

            return (
              <G
                key={f.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelectFielder(f.id);
                  setDraggingFielderId(f.id);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectFielder(selectedFielderId === f.id ? null : f.id);
                }}
              >
                <SvgText
                  x={f.x}
                  y={f.y - 14.5}
                  fill="rgba(226,232,240,0.9)"
                  fontSize={9}
                  fontWeight="700"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  F
                </SvgText>

                {f.isChasing && (
                  <Circle
                    cx={f.x}
                    cy={f.y}
                    r={14.5}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={1.9}
                    strokeDasharray="3 2"
                  />
                )}

                {isSelected && (
                  <Circle
                    cx={f.x}
                    cy={f.y}
                    r={15.5}
                    fill="none"
                    stroke="#f5b82e"
                    strokeWidth={2.2}
                    strokeDasharray="3 2"
                  />
                )}

                <Circle cx={f.x} cy={f.y} r={11.2} fill={bowlColor} stroke="#ffffff" strokeWidth={1.9} />
                <SvgText
                  x={f.x}
                  y={f.y + 3.4}
                  fill={bowlColor === '#eab308' ? '#000000' : '#ffffff'}
                  fontSize={10}
                  fontWeight="800"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {jNum}
                </SvgText>
              </G>
            );
          })}

          {/* 7. Non-Striker & Bowler Tokens at Bowler's End */}
          <G transform={`translate(${frameState.nonStrikerPos.x}, ${frameState.nonStrikerPos.y})`}>
            <Circle cx={0} cy={0} r={10} fill={batColor} stroke="#ffffff" strokeWidth={1.8} />
            <SvgText
              x={0}
              y={3.2}
              fill={batColor === '#eab308' ? '#000000' : '#ffffff'}
              fontSize={9.5}
              fontWeight="800"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {nonStrikerJersey}
            </SvgText>
          </G>

          <G transform={`translate(${frameState.bowlerPos.x}, ${frameState.bowlerPos.y})`}>
            {frameState.bowlerArmAngle !== 0 && (
              <Line
                x1={0}
                y1={0}
                x2={Math.sin((frameState.bowlerArmAngle * Math.PI) / 180) * 12}
                y2={Math.cos((frameState.bowlerArmAngle * Math.PI) / 180) * 12}
                stroke="#ffffff"
                strokeWidth={2.2}
              />
            )}
            <Circle cx={0} cy={0} r={9.8} fill={bowlColor} stroke="#ffffff" strokeWidth={1.8} />
            <SvgText
              x={0}
              y={3.2}
              fill={bowlColor === '#eab308' ? '#000000' : '#ffffff'}
              fontSize={9}
              fontWeight="800"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {bowlerJersey}
            </SvgText>
          </G>

          {/* 8. Wicketkeeper Token */}
          <G transform={`translate(${frameState.keeperPos.x}, ${frameState.keeperPos.y})`}>
            <Circle cx={0} cy={0} r={11} fill={bowlColor} stroke="#ffffff" strokeWidth={1.9} />
            <SvgText
              x={0}
              y={3.4}
              fill={bowlColor === '#eab308' ? '#000000' : '#ffffff'}
              fontSize={10}
              fontWeight="800"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {keeperJersey}
            </SvgText>
          </G>

          {/* 9. Striker Player Shape with Separate Bat Element & Pivot Rotation */}
          <G transform={`translate(${frameState.strikerPos.x}, ${frameState.strikerPos.y})`}>
            <Circle cx={0} cy={0} r={13.5} fill="none" stroke="#f5b82e" strokeWidth={2.3} />
            <Circle cx={0} cy={0} r={10.8} fill="#f5b82e" stroke="#0f172a" strokeWidth={1.6} />
            <SvgText
              x={0}
              y={3.4}
              fill="#0f172a"
              fontSize={10}
              fontWeight="900"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {strikerJersey}
            </SvgText>

            {/* Separate Bat Element attached to Striker */}
            <G transform={`rotate(${frameState.strikerBatAngle})`}>
              <Rect x={7.5} y={-2} width={11} height={3.2} rx={1} fill="#eab308" stroke="#78350f" strokeWidth={0.9} />
            </G>
          </G>

          {/* 10. Two On-Field Umpire Markers & Unmistakable Hand Signals (Rendered above player tokens so never occluded) */}
          {/* Bowler's-end umpire (immediately behind bowler's-end stumps) */}
          <UmpireMarkerSvg
            x={frameState.bowlerUmpirePos.x}
            y={frameState.bowlerUmpirePos.y}
            signal={activeBowlerUmpireSignal}
            role="bowler_end"
          />
          {/* Square-leg umpire (to the side of the pitch at square leg) */}
          <UmpireMarkerSvg
            x={frameState.squareLegUmpirePos.x}
            y={frameState.squareLegUmpirePos.y}
            signal={activeSquareLegUmpireSignal}
            role="square_leg"
          />

          {/* 11. Ball Shadow & Live Ball Element */}
          {frameState.showBall && (
            <G>
              {frameState.ballHeight > 1 && (
                <Circle cx={frameState.ballShadowPos.x} cy={frameState.ballShadowPos.y} r={3.4} fill="rgba(0,0,0,0.38)" />
              )}
              <G transform={`translate(${frameState.ballPos.x}, ${frameState.ballPos.y - frameState.ballHeight})`}>
                <Circle cx={0} cy={0} r={7.2 + frameState.ballHeight * 0.14} fill="rgba(255,255,255,0.3)" />
                <Circle cx={0} cy={0} r={4.2 + frameState.ballHeight * 0.09} fill="#ffffff" stroke="#f59e0b" strokeWidth={1.1} />
              </G>
            </G>
          )}

          {/* 12. Corner Floodlight Glow Cones & LED Towers */}
          <Circle cx={cx} cy={cy} r={outerR + 6} fill="url(#cornerGlowTL)" pointerEvents="none" />
          <Circle cx={cx} cy={cy} r={outerR + 6} fill="url(#cornerGlowTR)" pointerEvents="none" />
          <Circle cx={cx} cy={cy} r={outerR + 6} fill="url(#cornerGlowBL)" pointerEvents="none" />
          <Circle cx={cx} cy={cy} r={outerR + 6} fill="url(#cornerGlowBR)" pointerEvents="none" />

          {renderCornerFloodlight(27, 27, -45, 'fl_tl')}
          {renderCornerFloodlight(373, 27, 45, 'fl_tr')}
          {renderCornerFloodlight(27, 373, 45, 'fl_bl')}
          {renderCornerFloodlight(373, 373, -45, 'fl_br')}
        </Svg>
      </div>
    </div>
  );
};
