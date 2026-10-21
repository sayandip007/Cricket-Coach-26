import React from 'react';
import { G, Circle, Rect, Path, Line, Text as SvgText } from 'react-native-svg';
import { UmpireSignal } from '../../utils/cricketAnimationTimeline';

interface Umpire2DProps {
  x: number;
  y: number;
  role: 'bowler_end' | 'square_leg';
  signal: UmpireSignal;
  headTurnAngle?: number;
  label?: string;
}

export const Umpire2D: React.FC<Umpire2DProps> = ({
  x,
  y,
  role,
  signal,
  headTurnAngle = 0,
  label,
}) => {
  // SVG Umpire Character Dimensions & Colors
  // Uniform: Light Powder Blue Shirt (#38bdf8), Dark Navy Trousers (#0f172a), White Sun Hat (#f8fafc)
  const shirtColor = '#0284c7'; // Official Powder Blue
  const trousersColor = '#0f172a'; // Dark Navy
  const hatColor = '#f8fafc'; // Crisp White Sunhat
  const skinColor = '#e2e8f0';

  // Determine Arm Rotations and Paths for Signals
  let leftArmPath = 'M -5 2 L -8 10'; // default neutral down
  let rightArmPath = 'M 5 2 L 8 10';

  let showSignalText = '';

  switch (signal) {
    case 'four':
      // Sweeping both arms horizontally
      leftArmPath = 'M -5 2 L -14 2';
      rightArmPath = 'M 5 2 L 14 2';
      showSignalText = 'FOUR';
      break;

    case 'six':
      // Both arms straight up in air
      leftArmPath = 'M -5 2 L -6 -14';
      rightArmPath = 'M 5 2 L 6 -14';
      showSignalText = 'SIX';
      break;

    case 'out':
      // Right arm raised with index finger pointing up
      leftArmPath = 'M -5 2 L -8 10';
      rightArmPath = 'M 5 2 L 4 -14';
      showSignalText = 'OUT';
      break;

    case 'not_out':
      // Hands held low in restrained neutral stance
      leftArmPath = 'M -5 2 L -7 8';
      rightArmPath = 'M 5 2 L 7 8';
      showSignalText = 'NOT OUT';
      break;

    case 'wide':
      // Both arms extended fully horizontal
      leftArmPath = 'M -5 2 L -15 2';
      rightArmPath = 'M 5 2 L 15 2';
      showSignalText = 'WIDE';
      break;

    case 'no_ball':
      // One arm extended fully horizontal
      leftArmPath = 'M -5 2 L -15 2';
      rightArmPath = 'M 5 2 L 8 10';
      showSignalText = 'NO BALL';
      break;

    case 'over_complete':
      // One arm raised high to signal end of over
      leftArmPath = 'M -5 2 L -8 10';
      rightArmPath = 'M 5 2 L 5 -12';
      showSignalText = 'OVER';
      break;

    default:
      leftArmPath = 'M -5 2 L -8 10';
      rightArmPath = 'M 5 2 L 8 10';
      break;
  }

  return (
    <G transform={`translate(${x}, ${y})`} pointerEvents="none">
      {/* Role Kicker Label above Umpire */}
      <SvgText
        x={0}
        y={-18}
        fill="rgba(248,250,252,0.85)"
        fontSize={8}
        fontWeight="800"
        fontFamily="monospace"
        textAnchor="middle"
      >
        {label || (role === 'bowler_end' ? 'UMP' : 'SQ UMP')}
      </SvgText>

      {/* Signal Text Banner */}
      {showSignalText !== '' && (
        <G transform="translate(0, -25)">
          <Rect
            x={-20}
            y={-7}
            width={40}
            height={13}
            rx={3}
            fill="#0f172a"
            stroke="#38bdf8"
            strokeWidth={1}
          />
          <SvgText
            x={0}
            y={2}
            fill="#38bdf8"
            fontSize={7.5}
            fontWeight="900"
            fontFamily="monospace"
            textAnchor="middle"
          >
            {showSignalText}
          </SvgText>
        </G>
      )}

      {/* Human Silhouette: Trousers / Legs */}
      <Rect x={-4} y={6} width={3.5} height={9} rx={1} fill={trousersColor} />
      <Rect x={0.5} y={6} width={3.5} height={9} rx={1} fill={trousersColor} />

      {/* Torso / Umpire Powder Blue Shirt */}
      <Rect x={-5.5} y={-3} width={11} height={10} rx={2} fill={shirtColor} stroke="#0284c7" strokeWidth={0.8} />

      {/* Animated Arms */}
      <Path d={leftArmPath} stroke={shirtColor} strokeWidth={2.5} strokeLinecap="round" />
      <Path d={rightArmPath} stroke={shirtColor} strokeWidth={2.5} strokeLinecap="round" />

      {/* Head with Head Turn Angle */}
      <G transform={`rotate(${headTurnAngle})`}>
        <Circle cx={0} cy={-6} r={3.8} fill={skinColor} />
        {/* White Sun Hat brim & crown */}
        <Ellipse cx={0} cy={-8} rx={6} ry={2} fill={hatColor} stroke="#cbd5e1" strokeWidth={0.6} />
        <Rect x={-3} y={-11} width={6} height={3} rx={1} fill={hatColor} />
      </G>
    </G>
  );
};

// Helper SVG Ellipse fallback component for react-native-svg
import { Ellipse } from 'react-native-svg';
