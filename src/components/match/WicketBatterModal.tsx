import React, { useState, useEffect } from 'react';
import { Player } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';
import { Zap, AlertTriangle, Radio, ShieldCheck } from 'lucide-react';

interface WicketBatterModalProps {
  isOpen: boolean;
  outBatterName: string;
  outBatterRuns: number;
  outBatterBalls: number;
  dismissalText: string;
  bowlerName: string;
  tacticalNote: string;
  availableBatters: Player[];
  onSelectBatter: (batterId: string) => void;
  onOpenImpactModal: () => void;
  onTriggerDrs?: () => void;
  reviewsRemaining?: number;
  drsAlreadyReviewed?: boolean;
}

export const WicketBatterModal: React.FC<WicketBatterModalProps> = ({
  isOpen,
  outBatterName,
  outBatterBalls,
  outBatterRuns,
  dismissalText,
  bowlerName,
  tacticalNote,
  availableBatters,
  onSelectBatter,
  onOpenImpactModal,
  onTriggerDrs,
  reviewsRemaining = 2,
  drsAlreadyReviewed = false
}) => {
  const [selectedId, setSelectedId] = useState<string>(availableBatters[0]?.id || '');

  // Always keep selectedId synced to the first available batter in the dugout when modal opens
  useEffect(() => {
    if (isOpen && availableBatters.length > 0) {
      if (!selectedId || !availableBatters.some(b => b.id === selectedId)) {
        setSelectedId(availableBatters[0].id);
      }
    }
  }, [isOpen, availableBatters, selectedId]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    sound.playTap();
    const targetId = (selectedId && availableBatters.some(b => b.id === selectedId))
      ? selectedId
      : (availableBatters[0]?.id || '');
    if (targetId) {
      onSelectBatter(targetId);
    }
  };

  const selectedBatterObj = availableBatters.find(b => b.id === selectedId) || availableBatters[0];
  const selectedLastName = selectedBatterObj?.name.split(' ').pop()?.toUpperCase() || 'BATTER';

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[#0b101c] border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90vh] p-5 shadow-2xl flex flex-col justify-between overflow-hidden">
        <div>
          {/* Wicket Header Card + Instant DRS Review Challenge */}
          <div className="p-3 rounded-2xl bg-rose-950/40 border border-rose-500/40 mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono uppercase font-bold text-rose-400 tracking-wider">
                WICKET FALLEN · ON-FIELD CALL: OUT
              </span>
              <span className="text-[10px] font-mono text-cyan-300 font-bold">
                DRS: {reviewsRemaining} LEFT
              </span>
            </div>
            <div className="flex items-baseline justify-between mb-1">
              <h3 className="text-base font-black text-white font-display">
                {outBatterName} <span className="font-mono text-xs text-amber-300">{outBatterRuns} ({outBatterBalls})</span>
              </h3>
              <span className="text-[11px] font-mono font-bold text-rose-300">
                {dismissalText && dismissalText !== 'not out' ? dismissalText : `b ${bowlerName.split(' ').pop()}`}
              </span>
            </div>
            <p className="text-[10px] text-rose-300/90 font-sans flex items-center gap-1.5 leading-snug mb-2.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>{tacticalNote || `${outBatterName} dismissed by ${bowlerName}.`}</span>
            </p>

            {/* DRS Challenge Button inside Wicket Modal - Strictly for LBWs and Edges to Keeper/Slip */}
            {onTriggerDrs && (() => {
              const dLower = (dismissalText || '').toLowerCase();
              const isLbw = dLower.startsWith('lbw') || dLower.includes('lbw');
              const isKeeperOrSlipEdge =
                dLower.includes('c keeper') ||
                dLower.includes('c †') ||
                dLower.includes('c slip') ||
                dLower.includes('c wicketkeeper');
              const isDrsPermitted = isLbw || isKeeperOrSlipEdge;

              if (drsAlreadyReviewed) {
                return (
                  <div className="w-full py-2 px-3 rounded-xl bg-slate-900/90 border border-rose-500/40 text-rose-300 font-mono font-bold text-[10px] uppercase flex items-center justify-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
                    3RD UMPIRE DRS VERDICT: DECISION UPHELD (OUT)
                  </div>
                );
              }

              if (!isDrsPermitted) {
                return (
                  <div className="w-full py-2 px-3 rounded-xl bg-slate-900/70 border border-slate-800 text-slate-400 font-mono text-[10px] text-center flex items-center justify-center gap-1">
                    <span>🚫 DRS Unavailable for outfield catches / clean bowled (LBW &amp; Edges only)</span>
                  </div>
                );
              }

              if (reviewsRemaining > 0) {
                return (
                  <button
                    onClick={() => {
                      sound.playTap();
                      onTriggerDrs();
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-950 via-[#0f2942] to-cyan-950 hover:from-cyan-900 hover:to-cyan-900 border border-cyan-400/70 text-cyan-300 font-mono font-black text-[11px] uppercase flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/15 active:scale-98 transition-all"
                  >
                    <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                    📺 CHALLENGE WITH DRS · {isLbw ? 'HAWK-EYE (LBW)' : 'ULTRAEDGE (EDGE)'} ({reviewsRemaining} LEFT)
                  </button>
                );
              }

              return (
                <div className="w-full py-1.5 px-3 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-500 font-mono font-bold text-[10px] uppercase text-center">
                  NO DRS REVIEWS REMAINING (0 LEFT)
                </div>
              );
            })()}
          </div>

          {/* Table Header */}
          <div className="grid grid-cols-12 px-2 py-1 text-[9px] font-mono text-slate-400 uppercase border-b border-slate-800/80 mb-1">
            <span className="col-span-6">NEXT BATTER IN DUGOUT</span>
            <span className="col-span-2 text-center">FORM</span>
            <span className="col-span-2 text-center">BAT</span>
            <span className="col-span-2 text-center">POW</span>
          </div>

          {/* Available Batters List */}
          <div className="overflow-y-auto max-h-56 flex flex-col gap-1.5 py-1">
            {availableBatters.map(batter => {
              const isSelected = selectedBatterObj?.id === batter.id;
              const vp = batter.ratings.vp ?? batter.ratings.bat;
              const vs = batter.ratings.vs ?? batter.ratings.bat;
              const weaknessLabel = vs < vp ? `Spin (${vs})` : `Pace (${vp})`;
              const starCount = Math.max(1, Math.min(5, Math.round((batter.form || 75) / 20)));
              const starsDisplay = '★'.repeat(starCount) + '☆'.repeat(5 - starCount);

              return (
                <button
                  key={batter.id}
                  onClick={() => {
                    sound.playTap();
                    setSelectedId(batter.id);
                  }}
                  className={`p-2.5 rounded-xl text-left border transition-all ${
                    isSelected
                      ? 'bg-amber-500/20 border-amber-400 text-white shadow-md'
                      : 'bg-[#121927] border-slate-800/80 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="grid grid-cols-12 items-center text-xs">
                    {/* Player Info */}
                    <div className="col-span-6 flex items-center gap-2 min-w-0">
                      <div className={`w-6 h-6 rounded flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                        isSelected ? 'bg-amber-400 text-black' : 'bg-slate-800 text-slate-300'
                      }`}>
                        {batter.jerseyNumber || 18}
                      </div>
                      <div className="min-w-0">
                        <span className={`font-bold block truncate text-xs ${isSelected ? 'text-amber-300' : 'text-white'}`}>
                          {batter.name} <span className="text-[10px] text-slate-400 font-normal">{batter.age || 26}y</span>
                        </span>
                        <span className="text-[9px] text-slate-400 block truncate">
                          {batter.role} · <span className="text-amber-400/80">weak: {weaknessLabel}</span>
                        </span>
                      </div>
                    </div>

                    {/* Form Stars */}
                    <div className="col-span-2 text-center">
                      <span className="text-[10px] text-amber-400 font-mono">{starsDisplay}</span>
                    </div>

                    {/* Ratings */}
                    <span className="col-span-2 text-center font-mono text-xs font-bold text-emerald-400">
                      {batter.ratings.bat}
                    </span>
                    <span className="col-span-2 text-center font-mono text-xs font-bold text-amber-400">
                      {batter.ratings.pow}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Impact Player Shortcut */}
          <button
            onClick={() => {
              sound.playTap();
              onOpenImpactModal();
            }}
            className="w-full mt-2 py-2 px-3 rounded-xl bg-[#141d2f] hover:bg-[#1a263d] border border-amber-500/30 text-amber-400 font-bold text-[11px] uppercase flex items-center justify-center gap-1.5 transition-all"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30" />
            BRING ON IMPACT PLAYER
          </button>
        </div>

        {/* Send In Batter Button */}
        <button
          onClick={handleConfirm}
          className="mt-3 w-full py-3.5 bg-[#f5b82e] hover:bg-[#eab308] text-black font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-amber-500/20 active:scale-98 transition-all"
        >
          SEND IN {selectedLastName}
        </button>
      </div>
    </div>
  );
};
