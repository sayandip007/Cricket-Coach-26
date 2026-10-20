import React, { useState, useEffect } from 'react';
import { Player } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';
import { X } from 'lucide-react';

interface ImpactPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamName: string;
  benchPlayers: Player[];
  activeXIPlayers: Player[];
  onConfirmSubstitution: (benchPlayerId: string, outPlayerId: string) => void;
}

export const ImpactPlayerModal: React.FC<ImpactPlayerModalProps> = ({
  isOpen,
  onClose,
  teamName,
  benchPlayers,
  activeXIPlayers,
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

  const handleConfirm = () => {
    if (!selectedBenchId || !selectedOutId) return;
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
                One sub per match. The player you replace is out for the rest of the match.
              </span>
            </div>
            <button onClick={onClose} className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Section 1: BRING ON */}
          <div className="mb-3">
            <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider block mb-1">
              BRING ON
            </span>
            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
              {benchPlayers.map(p => {
                const isSelected = selectedBenchId === p.id;
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
                    <div className="flex items-center gap-2">
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        isSelected ? 'border-amber-400 bg-amber-400' : 'border-slate-600'
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                      </div>
                      <div className="text-left">
                        <span className="font-bold block leading-tight">{p.name.split(' ').pop()}</span>
                        <span className="text-[9px] text-slate-400">{p.role}</span>
                      </div>
                    </div>
                    <div className="text-right font-mono">
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
            <span className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider block mb-1">
              REPLACE
            </span>
            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
              {activeXIPlayers.map(p => {
                const isSelected = selectedOutId === p.id;
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
                    <div className="flex items-center gap-2">
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        isSelected ? 'border-rose-400 bg-rose-400' : 'border-slate-600'
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                      </div>
                      <div className="text-left">
                        <span className="font-bold block leading-tight">{p.name.split(' ').pop()}</span>
                        <span className="text-[9px] text-slate-400">{p.role}</span>
                      </div>
                    </div>
                    <div className="text-right font-mono">
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
          className="mt-3 w-full py-4 bg-[#f5b82e] hover:bg-[#eab308] text-black font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-amber-500/20 active:scale-98 transition-all"
        >
          BRING ON NOW
        </button>
      </div>
    </div>
  );
};
