import React, { useState } from 'react';
import { ArrowLeft, Cloud, FastForward, Info } from 'lucide-react';
import { Player } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';

interface OpenerSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamShort: string;
  awayTeamShort: string;
  homeTeamLogo: string;
  venueName: string;
  players: Player[];
  onConfirmOpeners: (strikerId: string, nonStrikerId: string) => void;
  onSimMatch: () => void;
  onOpenConditions?: () => void;
}

export const OpenerSelectionModal: React.FC<OpenerSelectionModalProps> = ({
  isOpen,
  onClose,
  homeTeamName,
  awayTeamName,
  homeTeamShort,
  awayTeamShort,
  homeTeamLogo,
  venueName,
  players,
  onConfirmOpeners,
  onSimMatch,
  onOpenConditions
}) => {
  const [selectedStrikerId, setSelectedStrikerId] = useState<string | null>(null);
  const [selectedNonStrikerId, setSelectedNonStrikerId] = useState<string | null>(null);
  const [showInfoTip, setShowInfoTip] = useState<boolean>(false);

  if (!isOpen) return null;

  const strikerPlayer = players.find(p => p.id === selectedStrikerId);
  const nonStrikerPlayer = players.find(p => p.id === selectedNonStrikerId);

  const handleSelectPlayer = (player: Player) => {
    sound.playTap();
    if (!selectedStrikerId) {
      setSelectedStrikerId(player.id);
    } else if (selectedStrikerId === player.id) {
      setSelectedStrikerId(null);
    } else if (!selectedNonStrikerId) {
      setSelectedNonStrikerId(player.id);
    } else if (selectedNonStrikerId === player.id) {
      setSelectedNonStrikerId(null);
    } else {
      // Replace non-striker
      setSelectedNonStrikerId(player.id);
    }
  };

  const handleConfirm = () => {
    if (selectedStrikerId && selectedNonStrikerId) {
      sound.playCrowdCheer(0.8);
      onConfirmOpeners(selectedStrikerId, selectedNonStrikerId);
    }
  };

  const canConfirm = Boolean(selectedStrikerId && selectedNonStrikerId);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#070b12] text-slate-100 select-none overflow-hidden">
      {/* Top Match Bar (Screenshot 3) */}
      <div className="px-4 py-3 bg-[#0c121e] border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { sound.playTap(); onClose(); }}
            className="p-1 rounded-full hover:bg-slate-800 text-slate-300"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-sm font-black text-white font-mono uppercase tracking-wider">
              {homeTeamShort} v {awayTeamShort}
            </h1>
            <span className="text-[10px] text-slate-400 font-mono">
              {venueName.split(',')[0]} · T20
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { sound.playTap(); onOpenConditions?.(); }}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300"
            title="Match Conditions"
          >
            <Cloud className="w-4 h-4" />
          </button>
          <button
            onClick={() => { sound.playTap(); onSimMatch(); }}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-mono font-bold text-amber-400 flex items-center gap-1 border border-slate-700"
          >
            <FastForward className="w-3.5 h-3.5" />
            <span>SIM</span>
          </button>
          <div className="px-2 py-0.5 rounded-md bg-[#231b08] border border-[#d97706]/70 text-[#f59e0b] text-[10px] font-black font-mono">
            lll LIVE
          </div>
        </div>
      </div>

      {/* Match Score Strip */}
      <div className="px-4 py-2.5 bg-[#0f172a] border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-900/60 flex items-center justify-center text-sm border border-purple-500/30">
            {homeTeamLogo}
          </div>
          <div>
            <span className="text-xs font-bold text-white block">{homeTeamShort}</span>
            <span className="text-[10px] font-mono text-slate-400">CRR 0.00</span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xl font-black font-mono text-white">0 - 0</span>
          <span className="text-xs text-slate-400 font-mono ml-1.5">(0.0)</span>
        </div>
      </div>

      {/* Bottom Sheet Drawer for Openers (Screenshot 3) */}
      <div className="flex-1 flex flex-col bg-[#111723] overflow-hidden">
        {/* Drag handle */}
        <div className="w-10 h-1 bg-slate-600/60 rounded-full mx-auto my-2" />

        <div className="px-4 pb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[10px] font-bold tracking-wider font-mono uppercase">
              OPENERS
            </span>
            <button
              onClick={() => { sound.playTap(); setShowInfoTip(!showInfoTip); }}
              className="text-slate-400 hover:text-white p-0.5"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
          <h2 className="text-sm font-semibold text-slate-200">
            Choose the opening pair for {homeTeamName}.
          </h2>
          {showInfoTip && (
            <p className="mt-1.5 p-2 rounded-xl bg-slate-900 border border-amber-500/30 text-[10px] text-amber-300 font-mono">
              💡 First tap assigns STRIKER (faces ball 0.1). Second tap assigns NON-STRIKER. Left-Right hand combinations disrupt bowler lines.
            </p>
          )}
        </div>

        {/* 2 Opener Slots */}
        <div className="px-4 py-2 grid grid-cols-2 gap-2.5">
          {/* Striker Slot */}
          <div
            onClick={() => { if (selectedStrikerId) setSelectedStrikerId(null); }}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              strikerPlayer
                ? 'bg-amber-950/20 border-amber-500/60'
                : 'bg-slate-900/60 border-slate-800 border-dashed'
            }`}
          >
            <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-amber-400 block mb-1">
              STRIKER
            </span>
            {strikerPlayer ? (
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <span className="text-xs font-black text-white block truncate">
                    #{strikerPlayer.jerseyNumber} {strikerPlayer.name.split(' ').pop()}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    BAT {strikerPlayer.ratings.bat} · POW {strikerPlayer.ratings.pow}
                  </span>
                </div>
                <div className="w-5 h-5 rounded-full bg-amber-400 text-black flex items-center justify-center text-[10px] font-bold shrink-0">
                  ✓
                </div>
              </div>
            ) : (
              <span className="text-xs text-slate-500 italic">
                tap a player below
              </span>
            )}
          </div>

          {/* Non-Striker Slot */}
          <div
            onClick={() => { if (selectedNonStrikerId) setSelectedNonStrikerId(null); }}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              nonStrikerPlayer
                ? 'bg-amber-950/20 border-amber-500/60'
                : 'bg-slate-900/60 border-slate-800 border-dashed'
            }`}
          >
            <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-amber-400 block mb-1">
              NON-STRIKER
            </span>
            {nonStrikerPlayer ? (
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <span className="text-xs font-black text-white block truncate">
                    #{nonStrikerPlayer.jerseyNumber} {nonStrikerPlayer.name.split(' ').pop()}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    BAT {nonStrikerPlayer.ratings.bat} · POW {nonStrikerPlayer.ratings.pow}
                  </span>
                </div>
                <div className="w-5 h-5 rounded-full bg-amber-400 text-black flex items-center justify-center text-[10px] font-bold shrink-0">
                  ✓
                </div>
              </div>
            ) : (
              <span className="text-xs text-slate-500 italic">
                tap a player below
              </span>
            )}
          </div>
        </div>

        {/* Player Selection Table (Screenshot 3) */}
        <div className="flex-1 overflow-y-auto px-4 mt-2">
          {/* Table Header */}
          <div className="grid grid-cols-12 text-[10px] font-mono font-bold text-slate-400 py-1.5 border-b border-slate-800">
            <span className="col-span-5 uppercase">PLAYER</span>
            <span className="col-span-1 text-center">BAT</span>
            <span className="col-span-1 text-center">POW</span>
            <span className="col-span-1 text-center">TEC</span>
            <span className="col-span-1 text-center">TMP</span>
            <span className="col-span-1 text-center">AVG</span>
            <span className="col-span-2 text-right">SR</span>
          </div>

          {/* Player Rows */}
          <div className="divide-y divide-slate-800/60 pb-20">
            {players.map(player => {
              const isStriker = selectedStrikerId === player.id;
              const isNonStriker = selectedNonStrikerId === player.id;
              const isSelected = isStriker || isNonStriker;

              const vp = player.ratings.vp ?? player.ratings.bat;
              const vs = player.ratings.vs ?? player.ratings.bat;
              const weakness = vs < vp - 3 ? 'Spin' : vp < vs - 3 ? 'Pace' : player.ratings.pow < 74 ? 'Bouncer' : 'Swing';
              const tecVal = player.ratings.tec || player.ratings.ctrl || 74;
              const tmpVal = player.ratings.tmp || 74;
              const avgVal = player.stats.average || Math.max(18, Math.round(player.stats.runs / Math.max(1, player.stats.matches)));
              const srVal = player.stats.strikeRate ? Math.round(player.stats.strikeRate) : Math.min(220, Math.round((player.ratings.pow * 1.5) + 30));

              return (
                <div
                  key={player.id}
                  onClick={() => handleSelectPlayer(player)}
                  className={`grid grid-cols-12 items-center py-2.5 px-1 rounded-xl transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-400/15 border border-amber-500/40'
                      : 'hover:bg-slate-800/50'
                  }`}
                >
                  {/* Player info */}
                  <div className="col-span-5 flex items-center gap-2 min-w-0">
                    <div className={`w-6 h-6 rounded border flex items-center justify-center text-[10px] font-bold font-mono shrink-0 ${
                      isSelected ? 'bg-amber-400 border-amber-300 text-black' : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}>
                      {player.jerseyNumber || 11}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-white leading-tight truncate">
                          {player.name.split(' ').pop()}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">{player.age}y</span>
                        <span className="text-[9px] px-1 bg-slate-800 rounded text-slate-400 font-mono shrink-0">
                          {player.battingHand}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 block leading-tight truncate">
                        {player.role} · <span className="text-slate-500">weak: {weakness}</span>
                      </span>
                    </div>
                  </div>

                  {/* Ratings & Stats */}
                  <span className={`col-span-1 text-center font-mono font-bold text-xs ${player.ratings.bat >= 80 ? 'text-emerald-400' : 'text-slate-200'}`}>
                    {player.ratings.bat}
                  </span>
                  <span className={`col-span-1 text-center font-mono font-bold text-xs ${player.ratings.pow >= 85 ? 'text-emerald-400' : player.ratings.pow >= 70 ? 'text-amber-400' : 'text-slate-400'}`}>
                    {player.ratings.pow}
                  </span>
                  <span className="col-span-1 text-center font-mono text-xs text-slate-300">
                    {tecVal}
                  </span>
                  <span className="col-span-1 text-center font-mono text-xs text-slate-300">
                    {tmpVal}
                  </span>
                  <span className="col-span-1 text-center font-mono text-xs text-slate-400">
                    {avgVal}
                  </span>
                  <span className="col-span-2 text-right font-mono font-bold text-xs text-cyan-400">
                    {srVal}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom CTA Button */}
        <div className="p-4 bg-[#0d121c] border-t border-slate-800">
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`w-full py-3.5 rounded-2xl text-xs uppercase font-black tracking-wider transition-all ${
              canConfirm
                ? 'bg-amber-400 hover:bg-amber-300 text-black shadow-lg shadow-amber-500/20 active:scale-95'
                : 'bg-slate-800/80 text-slate-500 cursor-not-allowed border border-slate-700/60'
            }`}
          >
            {canConfirm ? 'START MATCH WITH OPENERS' : 'PICK 2 BATTERS'}
          </button>
        </div>
      </div>
    </div>
  );
};
