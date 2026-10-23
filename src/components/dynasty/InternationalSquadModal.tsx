import React, { useState, useMemo } from 'react';
import { Shield, Check, AlertCircle, ChevronRight, UserCheck } from 'lucide-react';
import { Player } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';

interface InternationalSquadModalProps {
  isOpen: boolean;
  nationName: string;
  playerPool: Player[];
  initialSelectedIds?: string[];
  onConfirmSquad: (selectedPlayerIds: string[]) => void;
}

export const InternationalSquadModal: React.FC<InternationalSquadModalProps> = ({
  isOpen,
  nationName,
  playerPool,
  initialSelectedIds = [],
  onConfirmSquad
}) => {
  // Filter eligible players strictly for this nation (never supplement with players from other countries)
  const eligiblePlayers = useMemo(() => {
    const nationLower = nationName.toLowerCase();
    return playerPool.filter(p => p.country.toLowerCase() === nationLower);
  }, [nationName, playerPool]);

  // Initial 15 selection
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    if (initialSelectedIds && initialSelectedIds.length === 15) {
      return initialSelectedIds;
    }
    return eligiblePlayers.slice(0, 15).map(p => p.id);
  });

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    sound.playTap();
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id);
      }
      if (prev.length >= 15) {
        return prev;
      }
      return [...prev, id];
    });
  };

  const count = selectedIds.length;
  const isValidCount = count === 15;

  return (
    <div className="fixed inset-0 z-50 bg-[#070b12] text-slate-100 flex flex-col justify-between max-w-md mx-auto overflow-hidden animate-in fade-in duration-200">
      {/* Header */}
      <div className="p-4 border-b border-slate-800/80 bg-[#0c121d]/90 text-center">
        <span className="px-2.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-black uppercase tracking-widest inline-block">
          NATIONAL TEAM SELECTION
        </span>
        <h2 className="text-base font-black font-display tracking-wide text-white uppercase mt-1">
          {nationName} 15-MAN SQUAD
        </h2>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Select exactly 15 players for upcoming international series.
        </p>
      </div>

      {/* Counter bar */}
      <div className="px-4 py-2.5 bg-[#101726] border-b border-slate-800 flex items-center justify-between font-mono text-xs">
        <span className="text-slate-400">SELECTED PLAYERS:</span>
        <span className={`font-bold px-2 py-0.5 rounded ${isValidCount ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}`}>
          {count} / 15
        </span>
      </div>

      {/* Players list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {eligiblePlayers.map(p => {
          const isSelected = selectedIds.includes(p.id);
          const primaryRating = Math.max(p.ratings.bat, p.ratings.bowl);
          return (
            <div
              key={p.id}
              onClick={() => toggleSelect(p.id)}
              className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                isSelected
                  ? 'bg-cyan-950/30 border-cyan-500/70 shadow-md shadow-cyan-500/10'
                  : 'bg-[#0f172a]/80 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black font-mono shrink-0 ${
                  isSelected ? 'bg-cyan-500 text-black' : 'bg-slate-800 text-slate-300'
                }`}>
                  {isSelected ? <Check className="w-4 h-4 stroke-[3]" /> : (p.jerseyNumber || 10)}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white leading-tight">
                    {p.name}
                  </h4>
                  <span className="text-[10px] text-slate-400">
                    {p.role} · age {p.age}
                  </span>
                </div>
              </div>

              <div className="text-right font-mono">
                <span className="text-xs font-bold text-amber-300 block">
                  OVR {primaryRating}
                </span>
                <span className="text-[9px] text-slate-400">
                  {p.country}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom confirm button */}
      <div className="p-4 border-t border-slate-800/80 bg-[#0c121d]/90">
        {!isValidCount && (
          <p className="text-[11px] font-mono text-amber-400 text-center mb-2 flex items-center justify-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            Please select exactly 15 players ({15 - count} remaining)
          </p>
        )}
        <button
          disabled={!isValidCount}
          onClick={() => {
            sound.playCrowdCheer(0.8);
            onConfirmSquad(selectedIds);
          }}
          className={`w-full py-4 font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 transition-all ${
            isValidCount
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-xl shadow-cyan-500/25 active:scale-98 cursor-pointer'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
          }`}
        >
          CONFIRM 15-MAN NATIONAL SQUAD
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
