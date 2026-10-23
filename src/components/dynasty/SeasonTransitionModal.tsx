import React, { useState } from 'react';
import { Gavel, RefreshCw, Play } from 'lucide-react';
import { sound } from '../../utils/soundEffects';
import { getAuctionCycleInfo } from '../../utils/auctionSandboxEngine';

interface SeasonTransitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMiniAuction: () => void;
  onSelectContinueSquads: () => void;
  nextSeasonYear?: number;
}

export const SeasonTransitionModal: React.FC<SeasonTransitionModalProps> = ({
  isOpen,
  onSelectMiniAuction,
  onSelectContinueSquads,
  nextSeasonYear = 2027
}) => {
  const [selectedMode, setSelectedMode] = useState<'auction' | 'continue'>('auction');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#070b12]/95 backdrop-blur-md flex flex-col justify-end max-w-md mx-auto animate-in fade-in duration-200">
      <div className="bg-[#0f172a] border-t border-slate-800 rounded-t-3xl p-5 shadow-2xl flex flex-col gap-4">
        {/* Handle bar */}
        <div className="w-12 h-1 bg-slate-700/80 rounded-full mx-auto" />

        {/* Badge & Title */}
        <div className="text-center">
          <span className="px-3 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-black uppercase tracking-widest inline-block">
            SEASON {nextSeasonYear} BEGINS
          </span>
          <h2 className="text-base font-black font-display text-white mt-2.5">
            How do you want to start the new season?
          </h2>
          <p className="text-xs text-slate-300 mt-0.5">
            {getAuctionCycleInfo(nextSeasonYear).megaAuctionNotice}
          </p>
        </div>

        {/* Option 1: MINI AUCTION + TRADES */}
        <div
          onClick={() => {
            sound.playTap();
            setSelectedMode('auction');
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 ${
            selectedMode === 'auction'
              ? 'bg-[#151f33] border-amber-500/70 shadow-lg shadow-amber-500/15'
              : 'bg-[#101726]/80 border-slate-800/80 hover:border-slate-700'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
            <Gavel className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">
              MINI AUCTION + TRADES
            </h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Release the players you want to move on from, then bid for the released pool and new uncapped talent.
            </p>
          </div>
        </div>

        {/* Option 2: CONTINUE WITH CURRENT SQUADS */}
        <div
          onClick={() => {
            sound.playTap();
            setSelectedMode('continue');
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 ${
            selectedMode === 'continue'
              ? 'bg-[#151f33] border-amber-500/70 shadow-lg shadow-amber-500/15'
              : 'bg-[#101726]/80 border-slate-800/80 hover:border-slate-700'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
            <RefreshCw className="w-5 h-5 text-slate-300" />
          </div>
          <div className="flex-1">
            <h4 className="text-xs font-black uppercase tracking-wider text-white">
              CONTINUE WITH CURRENT SQUADS
            </h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Roll over without trading. Every player ages one year: top performers improve, veterans decline and youth replace retirees.
            </p>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={() => {
            sound.playCrowdCheer(0.8);
            if (selectedMode === 'auction') {
              onSelectMiniAuction();
            } else {
              onSelectContinueSquads();
            }
          }}
          className="w-full py-4 bg-gradient-to-r from-[#eab308] via-[#f5b82e] to-[#eab308] hover:from-[#facc15] hover:to-[#f5b82e] text-black font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 active:scale-98 transition-all mt-1"
        >
          <Play className="w-4 h-4 fill-current" />
          {selectedMode === 'auction' ? 'ENTER TRADE WINDOW & AUCTION' : `START SEASON ${nextSeasonYear}`}
        </button>
      </div>
    </div>
  );
};
