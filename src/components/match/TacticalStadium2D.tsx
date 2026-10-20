import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
  Circle,
  Rect,
  Line,
  G,
  Text as SvgText,
  Defs,
  RadialGradient,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import { FielderPosition, BallOutcome, PitchLength, PitchLine } from '../../types/cricket';

export type CameraViewMode = 'broadcast' | 'tactical' | 'pitch';

interface TacticalStadium2DProps {
  fielders: FielderPosition[];
  selectedFielderId: number | null;
  onSelectFielder: (id: number | null) => void;
  onMoveFielder: (id: number, x: number, y: number) => void;
  lastBallOutcome: BallOutcome | null;
  isBallInFlight: boolean;
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
  if (code === 'KOL' || code === 'KKR') return '#7c3aed'; // Vibrant KKR Purple
  if (code === 'PUN' || code === 'PBKS') return '#ef4444'; // Punjab Red
  if (code === 'CSK' || code === 'CHE') return '#eab308'; // Chennai Yellow
  if (code === 'MI' || code === 'MUM') return '#2563eb'; // Mumbai Royal Blue
  if (code === 'BLR' || code === 'RCB') return '#dc2626'; // Bengaluru Crimson Red
  if (code === 'SRH' || code === 'HYD') return '#f97316'; // Sunrisers Orange
  if (code === 'DC' || code === 'DEL') return '#1d4ed8'; // Delhi Blue
  if (code === 'GT' || code === 'GUJ') return '#1e293b'; // Gujarat Dark Navy
  if (code === 'RR' || code === 'RAJ') return '#db2777'; // Rajasthan Pink
  if (code === 'LSG' || code === 'LKO') return '#0284c7'; // Lucknow Cyan Blue
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
    pitchWearColor = 'rgba(146, 102, 56, 0.5)';
  } else if (v.includes('wankhede') || v.includes('mumbai') || h === 'MI' || h === 'MUM') {
    roofRingColor = '#1e3a8a';
    ledPerimeterColor = '#2563eb';
    boundaryBoardColor = '#f59e0b';
    turfStops = ['#2f7e49', '#276c3e', '#1e5a32', '#154324'];
    pitchSoilColor = '#ca986b';
    pitchWearColor = 'rgba(153, 94, 52, 0.45)';
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
    pitchWearColor = 'rgba(92, 130, 72, 0.42)';
  } else if (pitchType === 'Dry & Turning' || pitchType === 'Dry Turner') {
    pitchSoilColor = '#d8b47c';
    pitchBorderColor = '#a6824e';
    pitchWearColor = 'rgba(142, 98, 52, 0.5)';
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
  shotZoneLabels,
}) => {
  // Smooth animation progress (0 -> 1) whenever a new delivery arrives
  const [animProgress, setAnimProgress] = useState<number>(1);
  const [draggingFielderId, setDraggingFielderId] = useState<number | null>(null);
  const lastBallKeyRef = useRef<string>('');
  const svgContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!lastBallOutcome) {
      setAnimProgress(1);
      return;
    }
    const key = `${lastBallOutcome.over}.${lastBallOutcome.ballNumber}-${lastBallOutcome.runs}-${lastBallOutcome.isWicket}-${lastBallOutcome.commentary}`;
    if (key === lastBallKeyRef.current) return;
    lastBallKeyRef.current = key;

    let frameId: number;
    const start = performance.now();
    const duration = 980; // Full sequence: Bowler run-up & pitch delivery -> Shot travel -> Fielder chase & return throw + Batter crease runs
    setAnimProgress(0);

    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setAnimProgress(p);
      if (p < 1) {
        frameId = requestAnimationFrame(step);
      }
    };
    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [lastBallOutcome]);

  const theme = getStadiumTheme(
    venueName,
    homeTeamColors?.shortName,
    homeTeamColors?.primary,
    homeTeamColors?.secondary,
    pitchType
  );

  const batColor = resolveKitColor(battingTeamColors?.shortName, battingTeamColors?.primary, '#7c3aed');
  const bowlColor = resolveKitColor(bowlingTeamColors?.shortName, bowlingTeamColors?.primary, '#ef4444');

  // Coordinate space: 400 x 400 with center at (200, 200)
  const cx = 200;
  const cy = 200;
  const outerR = 178;
  const boundaryR = 163;
  const circle30R = 95;

  // Pitch geometry matching Video 1 & Video 2:
  // Bowler ('B') at top of pitch, Striker (gold ring) & Non-Striker at popping creases, Keeper ('WK') below bottom crease
  const topCreaseY = 168;
  const bottomCreaseY = 232;
  const bowlerBaseY = 147;
  const keeperBaseY = 254;

  const toSvg = (fx: number, fy: number) => ({
    x: cx + fx * 1.52,
    y: cy + fy * 1.52,
  });

  // Live positions during delivery animation
  let bowlerAnimY = bowlerBaseY;
  let ballX = cx;
  let ballY = topCreaseY;
  let shotOriginY = bottomCreaseY;
  let showBall = false;
  let showShotTrail = false;
  let activeChaserIdx = -1;

  // In Video 1 & 2, Striker stands at bottomCreaseY facing Bowler at top, or topCreaseY; let's position Striker at bottomCreaseY (facing bowler at top) and Non-Striker at topCreaseY, swapping on runs!
  let strikerY = bottomCreaseY;
  let nonStrikerY = topCreaseY;

  if (lastBallOutcome && animProgress < 1) {
    showBall = true;
    const rad = ((lastBallOutcome.shotAngleDeg - 90) * Math.PI) / 180;
    const rawDist = Math.min(
      boundaryR + 8,
      Math.max(20, (lastBallOutcome.shotDistanceM / 82) * boundaryR)
    );
    const targetX = cx + Math.cos(rad) * rawDist;
    const targetY = cy + Math.sin(rad) * rawDist;

    // Find closest fielder to the shot target
    if (!lastBallOutcome.isSix && !lastBallOutcome.isFour && fielders.length > 0) {
      let minDist = Infinity;
      fielders.forEach((f, idx) => {
        const pos = toSvg(f.x, f.y);
        const d = Math.hypot(pos.x - targetX, pos.y - targetY);
        if (d < minDist) {
          minDist = d;
          activeChaserIdx = idx;
        }
      });
    }

    // Phase A (0.00 -> 0.22): Bowler runs in & bowls ball down the pitch from topCreaseY to bottomCreaseY
    if (animProgress < 0.22) {
      const pitchT = animProgress / 0.22;
      bowlerAnimY = (bowlerBaseY - 9) + 9 * pitchT;
      ballX = cx;
      ballY = topCreaseY + (bottomCreaseY - topCreaseY) * pitchT;
    } else {
      // Phase B (0.22 -> 0.65): Ball travels off the bat into the outfield
      // Phase C (0.65 -> 1.00): Fielder returns throw to keeper/bowler end (if not boundary)
      showShotTrail = true;
      const postContactT = (animProgress - 0.22) / 0.78;
      if (postContactT <= 0.58 || lastBallOutcome.isFour || lastBallOutcome.isSix) {
        const t = Math.min(1, postContactT / 0.58);
        const easeOut = 1 - Math.pow(1 - t, 2);
        ballX = cx + (targetX - cx) * easeOut;
        ballY = shotOriginY + (targetY - shotOriginY) * easeOut;
      } else {
        const t = (postContactT - 0.58) / 0.42;
        ballX = targetX + (cx - targetX) * t;
        ballY = targetY + (topCreaseY - targetY) * t;
      }

      // Batter crease-to-crease running animation on 1, 2, or 3 runs
      const runsTaken = lastBallOutcome.isFour || lastBallOutcome.isSix || lastBallOutcome.isExtra ? 0 : lastBallOutcome.runs;
      if (runsTaken > 0) {
        const totalRunProgress = Math.min(1, postContactT * 1.2) * runsTaken;
        const currentLeg = Math.floor(totalRunProgress);
        const legFrac = totalRunProgress - currentLeg;
        const evenLeg = currentLeg % 2 === 0;
        if (evenLeg) {
          strikerY = bottomCreaseY - (bottomCreaseY - topCreaseY) * legFrac;
          nonStrikerY = topCreaseY + (bottomCreaseY - topCreaseY) * legFrac;
        } else {
          strikerY = topCreaseY + (bottomCreaseY - topCreaseY) * legFrac;
          nonStrikerY = bottomCreaseY - (bottomCreaseY - topCreaseY) * legFrac;
        }
      }
    }
  }

  const updateFielderFromClientPoint = (id: number, clientX: number, clientY: number) => {
    if (!svgContainerRef.current) return;
    const rect = svgContainerRef.current.getBoundingClientRect();
    const clickX = ((clientX - rect.left) / rect.width) * 400;
    const clickY = ((clientY - rect.top) / rect.height) * 400;
    const normX = Math.round((clickX - cx) / 1.52);
    const normY = Math.round((clickY - cy) / 1.52);
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

  // Helper to render each of the 4 corner 3x5 LED floodlight matrices (exact match to Video 1 & 2)
  const renderCornerFloodlight = (cornerX: number, cornerY: number, angleDeg: number, key: string) => {
    const bulbs: { bx: number; by: number }[] = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        bulbs.push({ bx: (c - 2) * 6.5, by: (r - 1) * 6.5 });
      }
    }
    return (
      <G key={key} transform={`translate(${cornerX}, ${cornerY}) rotate(${angleDeg})`}>
        <Rect
          x={-20}
          y={-13}
          width={40}
          height={26}
          rx={4}
          fill="#0b101b"
          stroke="#475569"
          strokeWidth={1.5}
        />
        {bulbs.map((b, i) => (
          <Circle
            key={i}
            cx={b.bx}
            cy={b.by}
            r={2.1}
            fill="#fefce8"
            opacity={0.95}
          />
        ))}
      </G>
    );
  };

  return (
    <View style={styles.wrapper}>
      <div
        ref={svgContainerRef}
        onPointerDown={handleSvgPointerDown}
        onPointerMove={handleSvgPointerMove}
        onPointerUp={handleSvgPointerUp}
        onPointerCancel={handleSvgPointerUp}
        className="w-full max-w-[365px] aspect-square relative select-none cursor-pointer touch-none"
      >
        <Svg viewBox="0 0 400 400" width="100%" height="100%">
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

          {/* 1. Outer Dark Stadium Rim */}
          <Circle
            cx={cx}
            cy={cy}
            r={outerR + 8}
            fill="#111827"
            stroke="#1f2937"
            strokeWidth={2}
          />
          <Circle
            cx={cx}
            cy={cy}
            r={outerR}
            fill="url(#turfGrad)"
            stroke={theme.boundaryBoardColor}
            strokeWidth={3.2}
            strokeOpacity={0.65}
          />

          {/* 2. Concentric Mowed Grass Rings (Matching Video 1 & 2) */}
          <Circle cx={cx} cy={cy} r={144} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={16} />
          <Circle cx={cx} cy={cy} r={112} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={16} />
          <Circle cx={cx} cy={cy} r={78} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={14} />
          <Circle cx={cx} cy={cy} r={46} fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth={12} />

          {/* Subtle floodlight diagonal sheen */}
          <Circle cx={cx} cy={cy} r={outerR} fill="url(#sheenGrad)" />

          {/* 3. Crisp Boundary Rope & 30-Yard Dashed Inner Circle */}
          <Circle
            cx={cx}
            cy={cy}
            r={boundaryR}
            fill="none"
            stroke="rgba(255,255,255,0.52)"
            strokeWidth={1.6}
          />
          <Circle
            cx={cx}
            cy={cy}
            r={circle30R}
            fill="none"
            stroke="rgba(255,255,255,0.48)"
            strokeWidth={1.4}
            strokeDasharray="5 5"
          />

          {/* Optional Shot-Zone Labels */}
          {shotZoneLabels?.map((lbl, idx) => (
            <SvgText
              key={idx}
              x={lbl.x}
              y={lbl.y}
              fill={lbl.color || '#f5b82e'}
              fontSize={9}
              fontWeight="800"
              fontFamily="monospace"
              textAnchor="middle"
              opacity={0.9}
            >
              {lbl.text}
            </SvgText>
          ))}

          {/* 4. Center Cricket Pitch Strip */}
          <Rect
            x={cx - 14}
            y={cy - 44}
            width={28}
            height={88}
            rx={3}
            fill={theme.pitchSoilColor}
            stroke={theme.pitchBorderColor}
            strokeWidth={1.4}
          />
          {/* Pitch center lane & popping creases */}
          <Line x1={cx - 14} y1={topCreaseY} x2={cx + 14} y2={topCreaseY} stroke="rgba(255,255,255,0.85)" strokeWidth={1.2} />
          <Line x1={cx - 14} y1={bottomCreaseY} x2={cx + 14} y2={bottomCreaseY} stroke="rgba(255,255,255,0.85)" strokeWidth={1.2} />
          <Line x1={cx - 9} y1={topCreaseY} x2={cx - 9} y2={bottomCreaseY} stroke="rgba(255,255,255,0.22)" strokeWidth={0.8} />
          <Line x1={cx + 9} y1={topCreaseY} x2={cx + 9} y2={bottomCreaseY} stroke="rgba(255,255,255,0.22)" strokeWidth={0.8} />

          {/* Top & Bottom Stumps */}
          <Rect x={cx - 4} y={cy - 41} width={8} height={2} fill="#ffffff" />
          <Rect x={cx - 4} y={cy + 39} width={8} height={2} fill="#ffffff" />

          {/* 5. Ball Trajectory Trail */}
          {lastBallOutcome && showShotTrail && (
            <Line
              x1={cx}
              y1={shotOriginY}
              x2={ballX}
              y2={ballY}
              stroke={
                lastBallOutcome.isWicket
                  ? '#f43f5e'
                  : lastBallOutcome.isSix
                  ? '#f59e0b'
                  : lastBallOutcome.isFour
                  ? '#38bdf8'
                  : 'rgba(255,255,255,0.6)'
              }
              strokeWidth={lastBallOutcome.isFour || lastBallOutcome.isSix ? 2.4 : 1.6}
              strokeDasharray={lastBallOutcome.isSix ? '4 3' : undefined}
              opacity={animProgress < 1 ? 0.92 : 0.35}
            />
          )}

          {/* 6. 9 Fielder Circular Tokens (with 'F' label above and Jersey Number inside) */}
          {fielders.map((f, idx) => {
            const basePos = toSvg(f.x, f.y);
            let fx = basePos.x;
            let fy = basePos.y;
            if (idx === activeChaserIdx && animProgress >= 0.22 && animProgress < 1) {
              const postT = (animProgress - 0.22) / 0.78;
              const chaseT = postT <= 0.58 ? postT / 0.58 : 1 - (postT - 0.58) / 0.85;
              fx = basePos.x + (ballX - basePos.x) * Math.min(0.85, chaseT);
              fy = basePos.y + (ballY - basePos.y) * Math.min(0.85, chaseT);
            }

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
                  x={fx}
                  y={fy - 14}
                  fill="rgba(226,232,240,0.88)"
                  fontSize={8.5}
                  fontWeight="700"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  F
                </SvgText>
                {isSelected && (
                  <Circle
                    cx={fx}
                    cy={fy}
                    r={14.5}
                    fill="none"
                    stroke="#f5b82e"
                    strokeWidth={2}
                    strokeDasharray="3 2"
                  />
                )}
                <Circle
                  cx={fx}
                  cy={fy}
                  r={10.5}
                  fill={bowlColor}
                  stroke="#ffffff"
                  strokeWidth={1.8}
                />
                <SvgText
                  x={fx}
                  y={fy + 3.2}
                  fill={bowlColor === '#eab308' ? '#000000' : '#ffffff'}
                  fontSize={9.5}
                  fontWeight="800"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {jNum}
                </SvgText>
              </G>
            );
          })}

          {/* 7. Bowler Token ('B' at top of pitch with live run-up) */}
          <G>
            <SvgText
              x={cx}
              y={bowlerAnimY - 14}
              fill="rgba(226,232,240,0.9)"
              fontSize={8.5}
              fontWeight="700"
              fontFamily="monospace"
              textAnchor="middle"
            >
              B
            </SvgText>
            <Circle
              cx={cx}
              cy={bowlerAnimY}
              r={10.5}
              fill={bowlColor}
              stroke="#ffffff"
              strokeWidth={1.8}
            />
            <SvgText
              x={cx}
              y={bowlerAnimY + 3.2}
              fill={bowlColor === '#eab308' ? '#000000' : '#ffffff'}
              fontSize={9.5}
              fontWeight="800"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {bowlerJersey}
            </SvgText>
          </G>

          {/* 8. Wicketkeeper Token ('WK' below bottom of pitch) */}
          <G>
            <Circle
              cx={cx - 4}
              cy={keeperBaseY}
              r={10.5}
              fill={bowlColor}
              stroke="#ffffff"
              strokeWidth={1.8}
            />
            <SvgText
              x={cx - 4}
              y={keeperBaseY + 3.2}
              fill={bowlColor === '#eab308' ? '#000000' : '#ffffff'}
              fontSize={9.5}
              fontWeight="800"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {keeperJersey}
            </SvgText>
            <SvgText
              x={cx - 4}
              y={keeperBaseY + 20}
              fill="rgba(226,232,240,0.9)"
              fontSize={8.5}
              fontWeight="700"
              fontFamily="monospace"
              textAnchor="middle"
            >
              WK
            </SvgText>
          </G>

          {/* 9. Striker & Non-Striker Tokens on the Pitch */}
          {/* Non-Striker Token */}
          <G>
            <Circle
              cx={cx + 2}
              cy={nonStrikerY}
              r={10.5}
              fill={batColor}
              stroke="#ffffff"
              strokeWidth={1.8}
            />
            <SvgText
              x={cx + 2}
              y={nonStrikerY + 3.2}
              fill={batColor === '#eab308' ? '#000000' : '#ffffff'}
              fontSize={9.5}
              fontWeight="800"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {nonStrikerJersey}
            </SvgText>
          </G>

          {/* Striker Token (with bright gold ring matching Video 1 & 2) */}
          <G>
            <Circle
              cx={cx - 2}
              cy={strikerY}
              r={13}
              fill="none"
              stroke="#f5b82e"
              strokeWidth={2.2}
            />
            <Circle
              cx={cx - 2}
              cy={strikerY}
              r={10.5}
              fill={batColor}
              stroke="#ffffff"
              strokeWidth={1.6}
            />
            <SvgText
              x={cx - 2}
              y={strikerY + 3.2}
              fill={batColor === '#eab308' ? '#000000' : '#ffffff'}
              fontSize={9.5}
              fontWeight="800"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {strikerJersey}
            </SvgText>
          </G>

          {/* 10. Live Cricket Ball Dot */}
          {showBall && (
            <G>
              <Circle cx={ballX} cy={ballY} r={6.5} fill="rgba(255,255,255,0.28)" />
              <Circle cx={ballX} cy={ballY} r={3.8} fill="#ffffff" stroke="#f59e0b" strokeWidth={1} />
            </G>
          )}

          {/* 11. 4 Corner Floodlight Glow Cones & 3x5 LED Floodlight Towers */}
          <Circle cx={cx} cy={cy} r={outerR + 8} fill="url(#cornerGlowTL)" pointerEvents="none" />
          <Circle cx={cx} cy={cy} r={outerR + 8} fill="url(#cornerGlowTR)" pointerEvents="none" />
          <Circle cx={cx} cy={cy} r={outerR + 8} fill="url(#cornerGlowBL)" pointerEvents="none" />
          <Circle cx={cx} cy={cy} r={outerR + 8} fill="url(#cornerGlowBR)" pointerEvents="none" />

          {renderCornerFloodlight(34, 34, -45, 'fl_tl')}
          {renderCornerFloodlight(366, 34, 45, 'fl_tr')}
          {renderCornerFloodlight(34, 366, 45, 'fl_bl')}
          {renderCornerFloodlight(366, 366, -45, 'fl_br')}
        </Svg>
      </div>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
