import React from 'react';
import { Shield, Check, AlertCircle, ChevronRight, Users, Globe } from 'lucide-react';
import { Team, Player } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';

interface SquadConfirmationModalProps {
  isOpen: boolean;
  userTeam: Team;
  squad: Player[];
  nextSeasonYear: number;
  onConfirmNextSeason: () => void;
}

export function validateFranchiseSquadLimits(
  squad: Player[],
  teamId?: string
): {
  isValid: boolean;
  totalCount: number;
  overseasCount: number;
  isSquadSizeValid: boolean;
  isOverseasValid: boolean;
  hasUniqueIds: boolean;
  isTeamEligible: boolean;
  errors: string[];
} {
  const totalCount = squad.length;
  const uniqueIds = new Set(squad.map(p => p.id));
  const hasUniqueIds = uniqueIds.size === totalCount;
  const ineligiblePlayer = teamId
    ? squad.find(p => p.clubId && p.clubId !== teamId)
    : undefined;
  const isTeamEligible = !ineligiblePlayer;
  const overseasCount = squad.filter(p => p.isOverseas || (p.country && p.country.toLowerCase() !== 'india')).length;
  const isSquadSizeValid = totalCount >= 16 && totalCount <= 25;
  const isOverseasValid = overseasCount <= 8;
  const errors: string[] = [];
  if (!hasUniqueIds) errors.push('Duplicate player IDs found in franchise squad');
  if (!isTeamEligible && ineligiblePlayer) {
    errors.push(`Player ${ineligiblePlayer.name} is contracted to another franchise (${ineligiblePlayer.clubId})`);
  }
  if (totalCount < 16) errors.push(`Squad size (${totalCount}) is below minimum of 16 players`);
  if (totalCount > 25) errors.push(`Squad size (${totalCount}) exceeds maximum of 25 players`);
  if (overseasCount > 8) errors.push(`Overseas count (${overseasCount}) exceeds maximum of 8`);
  return {
    isValid: isSquadSizeValid && isOverseasValid && hasUniqueIds && isTeamEligible,
    totalCount,
    overseasCount,
    isSquadSizeValid,
    isOverseasValid,
    hasUniqueIds,
    isTeamEligible,
    errors
  };
}

export const SquadConfirmationModal: React.FC<SquadConfirmationModalProps> = ({
  isOpen,
  userTeam,
  squad,
  nextSeasonYear,
  onConfirmNextSeason
}) => {
  if (!isOpen) return null;

  const validation = validateFranchiseSquadLimits(squad, userTeam.id);
  const { totalCount, overseasCount, isSquadSizeValid, isOverseasValid, isValid } = validation;

  return (
    <div className="fixed inset-0 z-50 bg-[#070b12] text-slate-100 flex flex-col justify-between max-w-md mx-auto overflow-hidden animate-in fade-in duration-200">
      {/* Top Bar */}
      <div className="p-4 border-b border-slate-800/80 bg-[#0c121d]/90 text-center">
        <span className="px-2.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-black uppercase tracking-widest inline-block">
          SQUAD CONFIRMATION · SEASON {nextSeasonYear}
        </span>
        <h2 className="text-base font-black font-display tracking-wide text-white uppercase mt-1">
          {userTeam.name}
        </h2>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Verify squad limits before entering the off-season.
        </p>
      </div>

      {/* Roster Metrics */}
      <div className="p-4 flex flex-col gap-3">
        {/* Metric 1: Total Players */}
        <div className={`p-4 rounded-2xl border flex items-center justify-between ${
          isSquadSizeValid ? 'bg-slate-900/90 border-slate-800' : 'bg-rose-950/20 border-rose-500/60'
        }`}>
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-amber-400" />
            <div>
              <h4 className="text-xs font-bold text-white uppercase">TOTAL SQUAD SIZE</h4>
              <p className="text-[10px] text-slate-400">Required: 16 – 25 players</p>
            </div>
          </div>
          <span className={`text-base font-mono font-bold ${isSquadSizeValid ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalCount} / 25
          </span>
        </div>

        {/* Metric 2: Overseas Players */}
        <div className={`p-4 rounded-2xl border flex items-center justify-between ${
          isOverseasValid ? 'bg-slate-900/90 border-slate-800' : 'bg-rose-950/20 border-rose-500/60'
        }`}>
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-cyan-400" />
            <div>
              <h4 className="text-xs font-bold text-white uppercase">OVERSEAS PLAYERS</h4>
              <p className="text-[10px] text-slate-400">Maximum: 8 overseas</p>
            </div>
          </div>
          <span className={`text-base font-mono font-bold ${isOverseasValid ? 'text-emerald-400' : 'text-rose-400'}`}>
            {overseasCount} / 8
          </span>
        </div>
      </div>

      {/* Roster Roster Scrollable Overview */}
      <div className="flex-1 overflow-y-auto px-4 py-1 flex flex-col gap-1.5">
        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block font-bold mb-1">
          CONFIRMED SQUAD ROSTER ({squad.length})
        </span>
        {squad.map(p => (
          <div key={p.id} className="p-2.5 bg-[#0f172a]/90 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 font-mono text-[10px] font-bold flex items-center justify-center">
                {p.jerseyNumber || 10}
              </span>
              <span className="font-bold text-white truncate max-w-[140px]">{p.name}</span>
              {p.isOverseas && (
                <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60">
                  OS
                </span>
              )}
            </div>
            <span className="text-[10px] font-mono text-slate-400">{p.role}</span>
          </div>
        ))}
      </div>

      {/* Action button */}
      <div className="p-4 border-t border-slate-800/80 bg-[#0c121d]/90">
        {!isValid && (
          <p className="text-[11px] font-mono text-rose-400 text-center mb-2 flex items-center justify-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            Squad limits violated. Adjust squad before proceeding.
          </p>
        )}
        <button
          disabled={!isValid}
          onClick={() => {
            sound.playCrowdCheer(0.8);
            onConfirmNextSeason();
          }}
          className={`w-full py-4 font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 transition-all ${
            isValid
              ? 'bg-gradient-to-r from-[#eab308] via-[#f5b82e] to-[#eab308] hover:from-[#facc15] hover:to-[#f5b82e] text-black shadow-xl shadow-amber-500/25 active:scale-98 cursor-pointer'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
          }`}
        >
          CONFIRM SQUAD & PROCEED TO OFF-SEASON
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
