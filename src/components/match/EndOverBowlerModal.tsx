import React, { useState, useEffect } from 'react';
import { Player } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';

interface EndOverBowlerModalProps {
  isOpen: boolean;
  lastBowler: Player;
  lastBowlerFigures: string;
  maxOversPerBowler?: number;
  bowlers: Array<{
    player: Player;
    overs: number;
    maidens: number;
    runs: number;
    wickets: number;
    econ: number;
  }>;
  onSelectBowler: (bowlerId: string) => void;
}

export const EndOverBowlerModal: React.FC<EndOverBowlerModalProps> = ({
  isOpen,
  lastBowler,
  lastBowlerFigures,
  maxOversPerBowler = 4,
  bowlers,
  onSelectBowler
}) => {
  const [selectedId, setSelectedId] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const firstEligible = bowlers.find(
        b => b.player.id !== lastBowler.id && Math.floor(b.overs) < maxOversPerBowler
      ) || bowlers.find(b => b.player.id !== lastBowler.id) || bowlers[0];
      if (firstEligible) {
        setSelectedId(firstEligible.player.id);
      }
    }
  }, [isOpen, lastBowler.id, maxOversPerBowler, bowlers]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!selectedId) return;
    sound.playTap();
    onSelectBowler(selectedId);
  };

  const selectedBowlerObj = bowlers.find(b => b.player.id === selectedId);
  const selectedName = selectedBowlerObj?.player.name.split(' ').pop()?.toUpperCase() || 'BOWLER';

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[#0b101c] border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] p-5 shadow-2xl flex flex-col justify-between overflow-hidden">
        <div>
          {/* Header */}
          <div className="pb-3 border-b border-slate-800 mb-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase font-bold text-amber-400 tracking-wider block">
                END OF OVER
              </span>
              <h3 className="text-sm font-black text-white font-display">
                {lastBowler.name.split(' ').pop()} bowled {lastBowlerFigures}. Bring on...
              </h3>
            </div>
            {maxOversPerBowler < 50 && (
              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[9px] font-mono text-slate-400">
                MAX {maxOversPerBowler} OV
              </span>
            )}
          </div>

          {/* Bowlers Table Header */}
          <div className="grid grid-cols-12 px-2 py-1.5 text-[9px] font-mono text-slate-400 uppercase border-b border-slate-800/80 mb-1">
            <span className="col-span-5">PLAYER / TYPE</span>
            <span className="col-span-2 text-center">MU</span>
            <span className="col-span-1 text-center">O</span>
            <span className="col-span-1 text-center">M</span>
            <span className="col-span-1 text-center">R</span>
            <span className="col-span-1 text-center">W</span>
            <span className="col-span-1 text-right">ECON</span>
          </div>

          {/* Bowlers List */}
          <div className="overflow-y-auto max-h-72 flex flex-col gap-1.5 py-1">
            {bowlers.map(({ player, overs, maidens, runs, wickets, econ }) => {
              const isSelected = selectedId === player.id;
              const isLast = player.id === lastBowler.id;
              const isQuotaDone = Math.floor(overs) >= maxOversPerBowler;
              const isDisabled = isLast || isQuotaDone;

              return (
                <button
                  key={player.id}
                  disabled={isDisabled}
                  onClick={() => {
                    sound.playTap();
                    setSelectedId(player.id);
                  }}
                  className={`p-2 rounded-xl text-left border transition-all ${
                    isDisabled
                      ? 'opacity-40 bg-slate-900/40 border-slate-800 cursor-not-allowed'
                      : isSelected
                      ? 'bg-amber-500/20 border-amber-400 text-white shadow-md'
                      : 'bg-[#121927] border-slate-800/80 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="grid grid-cols-12 items-center text-xs">
                    {/* Player Info */}
                    <div className="col-span-5 flex items-center gap-2 min-w-0">
                      <div className={`w-6 h-6 rounded flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                        isSelected ? 'bg-amber-400 text-black' : 'bg-slate-800 text-slate-300'
                      }`}>
                        {player.jerseyNumber || 11}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className={`font-bold block truncate text-xs ${isSelected ? 'text-amber-300' : 'text-white'}`}>
                            {player.name.split(' ').pop()}
                          </span>
                          {isQuotaDone && (
                            <span className="px-1 py-0.2 rounded bg-rose-950 border border-rose-500/40 text-rose-300 font-mono text-[8px] font-bold shrink-0">
                              QUOTA DONE
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] text-slate-400 block truncate">
                          {player.role} · {player.bowlingArm}
                        </span>
                      </div>
                    </div>

                    {/* Matchup Tag */}
                    <div className="col-span-2 text-center">
                      <span className="text-[10px] font-mono font-bold text-amber-400">
                        {player.role === 'Spin' ? '++' : '+'}
                      </span>
                    </div>

                    {/* Spell Stats */}
                    <span className="col-span-1 text-center font-mono text-[11px] text-slate-300">{overs}</span>
                    <span className="col-span-1 text-center font-mono text-[11px] text-slate-400">{maidens}</span>
                    <span className="col-span-1 text-center font-mono text-[11px] text-slate-300">{runs}</span>
                    <span className="col-span-1 text-center font-mono text-[11px] text-emerald-400 font-bold">{wickets}</span>
                    <span className="col-span-1 text-right font-mono text-[11px] text-slate-400">{econ > 0 ? econ.toFixed(1) : '-'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Start Over Button */}
        <button
          onClick={handleConfirm}
          className="mt-3 w-full py-4 bg-[#f5b82e] hover:bg-[#eab308] text-black font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-amber-500/20 active:scale-98 transition-all"
        >
          START OVER WITH {selectedName}
        </button>
      </div>
    </div>
  );
};

