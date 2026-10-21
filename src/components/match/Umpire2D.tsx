import React from 'react';
import { UmpireMarkerSvg, UmpireSignalType } from './TacticalStadium2D';

interface Umpire2DProps {
  x: number;
  y: number;
  role: 'bowler_end' | 'square_leg';
  signal: UmpireSignalType;
}

export const Umpire2D: React.FC<Umpire2DProps> = ({ x, y, role, signal }) => {
  return <UmpireMarkerSvg x={x} y={y} role={role} signal={signal} />;
};
