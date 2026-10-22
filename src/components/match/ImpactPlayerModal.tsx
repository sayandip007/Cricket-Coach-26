import React, { useState, useEffect } from 'react';
import { Player } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';
import { isOverseasPlayer, validateImpactPlayerSubstitution } from '../../utils/playerStatsHelpers';
import { X, AlertCircle } from 'lucide-react';

interface ImpactPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamName: string;
  benchPlayers: Player[];
  activeXIPlayers: Player[];
  allPlayers?: Player[];
  leagueId?: string;
  isInternational?: boolean;
  onConfirmSubstitution: (benchPlayerId: string, outPlayerId: string) => void;
}

export const ImpactPlayerModal: React.FC<ImpactPlayerModalProps> = ({
  isOpen,
  onClose,
  teamName,
  benchPlayers,
  activeXIPlayers,
  allPlayers,
  leagueId = 'ipl',
  isInternational = false,
  onConfirmSubstitution
}) => {
  const [selectedBenchId, setSelectedBenchId] = useState<string>(benchPlayers[0]?.id || '');
  const [selectedOutId, setSelectedOutId] = useState<string>(activeXIPlayers[0]?.id || '');

  useEffect(() => {
    if (isOpen) {
      if (benchPlayers.length > 0 && !benchPlayers.some(p => p.id === selectedBenchId)) {
        setSelectedBenchId(benchPlayers[0].id);
      }
      if (activeXIPlayers.length > 0 && !activeXIPlayers.some(p => p.id === selectedOutId)) {
        setSelectedOutId(activeXIPlayers[0].id);
      }
    }
  }, [isOpen, benchPlayers, activeXIPlayers, selectedBenchId, selectedOutId]);

  if (!isOpen) return null;

  const combinedPlayerPool = allPlayers && allPlayers.length > 0
    ? allPlayers
    : [...benchPlayers, ...activeXIPlayers];

  const activeXIIds = activeXIPlayers.map(p => p.id);

  const validation = validateImpactPlayerSubstitution({
    benchPlayerId: selectedBenchId,
    outPlayerId: selectedOutId,
    activeXIIds,
    allPlayers: combinedPlayerPool,
    isInternational,
    maxOverseasInXI: 4
  });

  const currentOverseasCount = activeXIPlayers.filter(p => isOverseasPlayer(p)).length;

  const handleConfirm = () => {
    if (!selectedBenchId || !selectedOutId || !validation.isValid) return;
    sound.playTap();
    onConfirmSubstitution(selectedBenchId, selectedOutId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[#0b101c] border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90vh] p-5 shadow-2xl flex flex-col justify-between overflow-hidden">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono uppercase font-bold text-cyan-400">
                  IMPACT PLAYER
                </span>
                <span className="text-xs text-slate-400">· {teamName}</span>
              </div>
              <span className="text-[10px] text-slate-400 font-sans block">
                One sub per match. Max 4 overseas players allowed in Playing XI.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded font-mono text-[9px] font-bold border ${
                currentOverseasCount >= 4
                  ? 'bg-amber-950 border-amber-600/60 text-amber-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}>
                ✈️ {currentOverseasCount}/4 OS
              </span>
              <button onClick={onClose} className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Validation Warning Alert */}
          {!validation.isValid && (
            <div className="mb-2 p-2 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-300 text-[10px] flex items-start gap-1.5 leading-tight">
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
              <span>{validation.reason}</span>
            </div>
          )}

          {/* Section 1: BRING ON */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
                BRING ON (BENCH)
              </span>
            </div>
            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
              {benchPlayers.map(p => {
                const isSelected = selectedBenchId === p.id;
                const isOverseas = isOverseasPlayer(p);
                const overall = Math.round((p.ratings.bat + p.ratings.bowl + p.ratings.pow + p.ratings.ctrl) / 4);
                return (
                  <button
                    key={p.id}
                    onClick={() => { sound.playTap(); setSelectedBenchId(p.id); }}
                    className={`p-2 rounded-xl border text-xs flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-400 text-white'
                        : 'bg-[#121927] border-slate-800/80 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                        isSelected ? 'border-amber-400 bg-amber-400' : 'border-slate-600'
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                      </div>
                      <div className="text-left min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold truncate leading-tight">{p.name.split(' ').pop()}</span>
                          <span className={`px-1 py-0.2 rounded font-mono text-[8px] font-bold ${
                            isOverseas
                              ? 'bg-sky-950 text-sky-300 border border-sky-600/40'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-600/40'
                          }`}>
                            {isOverseas ? '✈️ OS' : '🇮🇳 IND'}
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-400 block truncate">{p.role}</span>
                      </div>
                    </div>
                    <div className="text-right font-mono shrink-0 ml-2">
                      <span className="font-bold text-white text-xs">{overall}</span>
                      <span className="text-[8px] text-slate-400 block uppercase">{p.role === 'Pace' || p.role === 'Spin' ? 'BWL' : 'BAT'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: REPLACE */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
                REPLACE (ACTIVE XI)
              </span>
            </div>
            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
              {activeXIPlayers.map(p => {
                const isSelected = selectedOutId === p.id;
                const isOverseas = isOverseasPlayer(p);
                const overall = Math.round((p.ratings.bat + p.ratings.bowl + p.ratings.pow + p.ratings.ctrl) / 4);
                return (
                  <button
                    key={p.id}
                    onClick={() => { sound.playTap(); setSelectedOutId(p.id); }}
                    className={`p-2 rounded-xl border text-xs flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-rose-500/20 border-rose-400 text-white'
                        : 'bg-[#121927] border-slate-800/80 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                        isSelected ? 'border-rose-400 bg-rose-400' : 'border-slate-600'
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                      </div>
                      <div className="text-left min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold truncate leading-tight">{p.name.split(' ').pop()}</span>
                          <span className={`px-1 py-0.2 rounded font-mono text-[8px] font-bold ${
                            isOverseas
                              ? 'bg-sky-950 text-sky-300 border border-sky-600/40'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-600/40'
                          }`}>
                            {isOverseas ? '✈️ OS' : '🇮🇳 IND'}
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-400 block truncate">{p.role}</span>
                      </div>
                    </div>
                    <div className="text-right font-mono shrink-0 ml-2">
                      <span className="font-bold text-white text-xs">{overall}</span>
                      <span className="text-[8px] text-slate-400 block uppercase">{p.role === 'Pace' || p.role === 'Spin' ? 'BWL' : 'BAT'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bring on Now Button */}
        <button
          onClick={handleConfirm}
          disabled={!validation.isValid}
          className={`mt-3 w-full py-4 font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl transition-all ${
            validation.isValid
              ? 'bg-[#f5b82e] hover:bg-[#eab308] text-black shadow-amber-500/20 active:scale-98 cursor-pointer'
              : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
          }`}
        >
          {validation.isValid ? 'BRING ON NOW' : 'INVALID SUBSTITUTION'}
        </button>
      </div>
    </div>
  );
};
