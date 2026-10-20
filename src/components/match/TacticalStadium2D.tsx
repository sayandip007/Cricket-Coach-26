import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
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
} from '../../utils/cricketAnimationTimeline';
import { sound } from '../../utils/soundEffects';

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
}) => {
  const [animProgress, setAnimProgress] = useState<number>(1);
  const [draggingFielderId, setDraggingFielderId] = useState<number | null>(null);
  const lastBallKeyRef = useRef<string>('');
  const svgContainerRef = useRef<HTMLDivElement | null>(null);
  const audioPlayedRef = useRef<{ hit: boolean; wicket: boolean }>({ hit: false, wicket: false });

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || !lastBallOutcome) {
      setAnimProgress(1);
      return;
    }

    const key = `${lastBallOutcome.over}.${lastBallOutcome.ballNumber}-${lastBallOutcome.runs}-${lastBallOutcome.isWicket}-${lastBallOutcome.commentary}`;
    if (key === lastBallKeyRef.current) return;
    lastBallKeyRef.current = key;
    audioPlayedRef.current = { hit: false, wicket: false };

    let frameId: number;
    const start = performance.now();
    const duration = 1250;
    setAnimProgress(0);

    const step = (now: number) => {
      const elapsed = now - start;
      const p = Math.min(1, elapsed / duration);
      setAnimProgress(p);

      // Synchronized Sound Triggers
      if (p >= 0.30 && !audioPlayedRef.current.hit) {
        audioPlayedRef.current.hit = true;
        if (lastBallOutcome.runs > 0 || lastBallOutcome.isFour || lastBallOutcome.isSix) {
          sound.playBatHit(lastBallOutcome.isFour || lastBallOutcome.isSix, lastBallOutcome.isSix);
        }
      }

      if (p >= 0.32 && !audioPlayedRef.current.wicket && lastBallOutcome.isWicket) {
        audioPlayedRef.current.wicket = true;
        sound.playWicketCrash();
      }

      if (p < 1) {
        frameId = requestAnimationFrame(step);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [lastBallOutcome]);

  const frameState: AnimationFrameState = computeAnimationFrame(
    animProgress,
    lastBallOutcome,
    fielders,
    plannedLength,
    plannedLine,
    strikerHand,
    bowlerRole
  );

  const theme = getStadiumTheme(
    venueName,
    homeTeamColors?.shortName,
    homeTeamColors?.primary,
    homeTeamColors?.secondary,
    pitchType
  );

  const batColor = resolveKitColor(battingTeamColors?.shortName, battingTeamColors?.primary, '#7c3aed');
  const bowlColor = resolveKitColor(bowlingTeamColors?.shortName, bowlingTeamColors?.primary, '#ef4444');

  const cx = 200;
  const cy = 200;
  const outerR = 178;
  const boundaryR = 163;
  const circle30R = 95;

  const topCreaseY = 168;
  const bottomCreaseY = 232;

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

          {/* 1. Stadium Outer Rim & Turf */}
          <Circle cx={cx} cy={cy} r={outerR + 8} fill="#111827" stroke="#1f2937" strokeWidth={2} />
          <Circle
            cx={cx}
            cy={cy}
            r={outerR}
            fill="url(#turfGrad)"
            stroke={theme.boundaryBoardColor}
            strokeWidth={3.2}
            strokeOpacity={0.65}
          />

          {/* 2. Concentric Mowed Grass Rings */}
          <Circle cx={cx} cy={cy} r={144} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={16} />
          <Circle cx={cx} cy={cy} r={112} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={16} />
          <Circle cx={cx} cy={cy} r={78} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={14} />
          <Circle cx={cx} cy={cy} r={46} fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth={12} />
          <Circle cx={cx} cy={cy} r={outerR} fill="url(#sheenGrad)" />

          {/* 3. Boundary Rope & 30-Yard Circle */}
          <Circle cx={cx} cy={cy} r={boundaryR} fill="none" stroke="rgba(255,255,255,0.52)" strokeWidth={1.6} />
          <Circle cx={cx} cy={cy} r={circle30R} fill="none" stroke="rgba(255,255,255,0.48)" strokeWidth={1.4} strokeDasharray="5 5" />

          {/* Boundary Splash Effect */}
          {frameState.isBoundarySplash && (
            <Circle cx={cx} cy={cy} r={boundaryR} fill="none" stroke="#f59e0b" strokeWidth={3.5} opacity={0.7} />
          )}

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
          <Line x1={cx - 14} y1={topCreaseY} x2={cx + 14} y2={topCreaseY} stroke="rgba(255,255,255,0.85)" strokeWidth={1.2} />
          <Line x1={cx - 14} y1={bottomCreaseY} x2={cx + 14} y2={bottomCreaseY} stroke="rgba(255,255,255,0.85)" strokeWidth={1.2} />
          <Line x1={cx - 9} y1={topCreaseY} x2={cx - 9} y2={bottomCreaseY} stroke="rgba(255,255,255,0.22)" strokeWidth={0.8} />
          <Line x1={cx + 9} y1={topCreaseY} x2={cx + 9} y2={bottomCreaseY} stroke="rgba(255,255,255,0.22)" strokeWidth={0.8} />

          {/* Stumps Top End */}
          <Rect x={cx - 4} y={cy - 41} width={8} height={2.5} fill="#ffffff" />
          
          {/* Stumps Bottom End & Bails */}
          <Rect x={cx - 4} y={cy + 38.5} width={8} height={2.5} fill="#ffffff" />
          {frameState.bailsDislodged ? (
            <G>
              <Rect x={cx - 6 + frameState.bailLeftOffset.x} y={cy + 37 + frameState.bailLeftOffset.y} width={4} height={1.5} fill="#f43f5e" />
              <Rect x={cx + 2 + frameState.bailRightOffset.x} y={cy + 37 + frameState.bailRightOffset.y} width={4} height={1.5} fill="#f43f5e" />
            </G>
          ) : (
            <Rect x={cx - 4} y={cy + 37} width={8} height={1.5} fill="#e2e8f0" />
          )}

          {/* Turf Dust Ripple on Pitch Bounce */}
          {frameState.isTurfDust && (
            <Circle cx={bouncePoint.x} cy={bouncePoint.y} r={6} fill="none" stroke="#d8b47c" strokeWidth={1.5} opacity={0.8} />
          )}

          {/* Contact Impact Flash */}
          {frameState.isContactImpact && (
            <G transform={`translate(${cx}, ${bottomCreaseY})`}>
              <Circle cx={0} cy={0} r={10} fill="rgba(245,158,11,0.35)" />
              <Circle cx={0} cy={0} r={5} fill="#ffffff" />
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
                  : 'rgba(255,255,255,0.55)'
              }
              strokeWidth={lastBallOutcome?.isFour || lastBallOutcome?.isSix ? 2.4 : 1.5}
              strokeDasharray={lastBallOutcome?.isSix ? '4 3' : undefined}
              opacity={0.7}
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
                <SvgText x={f.x} y={f.y - 14} fill="rgba(226,232,240,0.88)" fontSize={8.5} fontWeight="700" fontFamily="monospace" textAnchor="middle">
                  F
                </SvgText>

                {/* Chasing / Action Indicator Ring */}
                {f.isChasing && (
                  <Circle cx={f.x} cy={f.y} r={13.5} fill="none" stroke="#38bdf8" strokeWidth={1.8} strokeDasharray="3 2" />
                )}

                {isSelected && (
                  <Circle cx={f.x} cy={f.y} r={14.5} fill="none" stroke="#f5b82e" strokeWidth={2} strokeDasharray="3 2" />
                )}

                <Circle cx={f.x} cy={f.y} r={10.5} fill={bowlColor} stroke="#ffffff" strokeWidth={1.8} />
                <SvgText x={f.x} y={f.y + 3.2} fill={bowlColor === '#eab308' ? '#000000' : '#ffffff'} fontSize={9.5} fontWeight="800" fontFamily="monospace" textAnchor="middle">
                  {jNum}
                </SvgText>
              </G>
            );
          })}

          {/* 7. Bowler Token & Delivery Action Stride */}
          <G transform={`translate(${frameState.bowlerPos.x}, ${frameState.bowlerPos.y})`}>
            <SvgText x={0} y={-14} fill="rgba(226,232,240,0.9)" fontSize={8.5} fontWeight="700" fontFamily="monospace" textAnchor="middle">
              B
            </SvgText>
            {/* Bowling Arm Rotation Arc */}
            {frameState.bowlerArmAngle !== 0 && (
              <Line
                x1={0}
                y1={0}
                x2={Math.sin((frameState.bowlerArmAngle * Math.PI) / 180) * 12}
                y2={Math.cos((frameState.bowlerArmAngle * Math.PI) / 180) * 12}
                stroke="#ffffff"
                strokeWidth={2}
              />
            )}
            <Circle cx={0} cy={0} r={10.5} fill={bowlColor} stroke="#ffffff" strokeWidth={1.8} />
            <SvgText x={0} y={3.2} fill={bowlColor === '#eab308' ? '#000000' : '#ffffff'} fontSize={9.5} fontWeight="800" fontFamily="monospace" textAnchor="middle">
              {bowlerJersey}
            </SvgText>
          </G>

          {/* 8. Wicketkeeper Token */}
          <G transform={`translate(${frameState.keeperPos.x}, ${frameState.keeperPos.y})`}>
            <Circle cx={0} cy={0} r={10.5} fill={bowlColor} stroke="#ffffff" strokeWidth={1.8} />
            <SvgText x={0} y={3.2} fill={bowlColor === '#eab308' ? '#000000' : '#ffffff'} fontSize={9.5} fontWeight="800" fontFamily="monospace" textAnchor="middle">
              {keeperJersey}
            </SvgText>
            <SvgText x={0} y={20} fill="rgba(226,232,240,0.9)" fontSize={8.5} fontWeight="700" fontFamily="monospace" textAnchor="middle">
              WK
            </SvgText>
          </G>

          {/* 9. Non-Striker & Striker Tokens */}
          <G transform={`translate(${frameState.nonStrikerPos.x}, ${frameState.nonStrikerPos.y})`}>
            <Circle cx={0} cy={0} r={10.5} fill={batColor} stroke="#ffffff" strokeWidth={1.8} />
            <SvgText x={0} y={3.2} fill={batColor === '#eab308' ? '#000000' : '#ffffff'} fontSize={9.5} fontWeight="800" fontFamily="monospace" textAnchor="middle">
              {nonStrikerJersey}
            </SvgText>
          </G>

          {/* Striker Player Shape with Separate Bat Element & Pivot Rotation */}
          <G transform={`translate(${frameState.strikerPos.x}, ${frameState.strikerPos.y})`}>
            <Circle cx={0} cy={0} r={13} fill="none" stroke="#f5b82e" strokeWidth={2.2} />
            <Circle cx={0} cy={0} r={10.5} fill={batColor} stroke="#ffffff" strokeWidth={1.6} />
            <SvgText x={0} y={3.2} fill={batColor === '#eab308' ? '#000000' : '#ffffff'} fontSize={9.5} fontWeight="800" fontFamily="monospace" textAnchor="middle">
              {strikerJersey}
            </SvgText>
            
            {/* Separate Bat Element attached to Striker */}
            <G transform={`rotate(${frameState.strikerBatAngle})`}>
              <Rect x={7} y={-2} width={10} height={3} rx={1} fill="#eab308" stroke="#78350f" strokeWidth={0.8} />
            </G>
          </G>

          {/* 10. Ball Shadow & Live Ball Element */}
          {frameState.showBall && (
            <G>
              {/* Ground Shadow Offset for Elevation Height */}
              {frameState.ballHeight > 1 && (
                <Circle cx={frameState.ballShadowPos.x} cy={frameState.ballShadowPos.y} r={3} fill="rgba(0,0,0,0.35)" />
              )}

              {/* Main Ball Dot with Scale Expansion when Elevated in Air */}
              <G transform={`translate(${frameState.ballPos.x}, ${frameState.ballPos.y - frameState.ballHeight})`}>
                <Circle cx={0} cy={0} r={6.5 + frameState.ballHeight * 0.12} fill="rgba(255,255,255,0.28)" />
                <Circle cx={0} cy={0} r={3.8 + frameState.ballHeight * 0.08} fill="#ffffff" stroke="#f59e0b" strokeWidth={1} />
              </G>
            </G>
          )}

          {/* 11. Corner Floodlight Glow Cones & LED Towers */}
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
