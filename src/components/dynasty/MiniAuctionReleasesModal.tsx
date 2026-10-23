import React, { useState } from 'react';
import { ArrowLeft, MinusCircle, CheckCircle, Calendar, ChevronRight } from 'lucide-react';
import { Team, Player } from '../../types/cricket';
import { useGame } from '../../context/GameContext';
import { sound } from '../../utils/soundEffects';
import { getAuctionCycleInfo, getPlayerAuthoritativeSalaryCr } from '../../utils/auctionSandboxEngine';

interface MiniAuctionReleasesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceedToAuctionHall: (releasedPlayerIds: string[], finalPurseCr: number) => void;
  userTeam: Team;
  userSquad: Player[];
  currentPurseCr?: number;
  seasonYear?: number;
}

export const MiniAuctionReleasesModal: React.FC<MiniAuctionReleasesModalProps> = ({
  isOpen,
  onClose,
  onProceedToAuctionHall,
  userTeam,
  userSquad,
  currentPurseCr = 20.85,
  seasonYear = 2026
}) => {
  const { releasePlayersForAuction } = useGame();
  const [releasedIds, setReleasedIds] = useState<string[]>([]);

  if (!isOpen) return null;

  // Determine auction cycle and upcoming mega auction dynamically
  const cycle = getAuctionCycleInfo(seasonYear + 1);

  // Authoritative player salary from contract/retention values
  const getSalaryCr = (p: Player): number => getPlayerAuthoritativeSalaryCr(p);

  const totalRefundCr = releasedIds.reduce((sum, id) => {
    const p = userSquad.find(pl => pl.id === id);
    return sum + (p ? getSalaryCr(p) : 0);
  }, 0);

  const effectivePurseCr = Number((currentPurseCr + totalRefundCr).toFixed(2));
  const remainingSquadCount = userSquad.length - releasedIds.length;

  const toggleRelease = (playerId: string) => {
    sound.playTap();
    setReleasedIds(prev =>
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#070b12] text-slate-100 flex flex-col justify-between max-w-md mx-auto overflow-hidden animate-in fade-in duration-200">
      {/* Top Bar */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-800/80 bg-[#0c121d]/90">
        <button
          onClick={() => { sound.playTap(); onClose(); }}
          className="p-1 rounded-lg text-slate-400 hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xs font-black font-display tracking-widest text-white uppercase">
          {cycle.auctionTypeLabel} RELEASES
        </h2>
      </div>

      {/* Team Header Banner */}
      <div className="px-4 pt-3 pb-2 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#2a1b40] border border-amber-500/30 flex items-center justify-center text-xl shrink-0">
            {userTeam.logoEmoji || '🐾'}
          </div>
          <div>
            <h3 className="text-sm font-black font-display text-white uppercase tracking-wider">
              {userTeam.name.toUpperCase()}
            </h3>
            <p className="text-[11px] text-slate-400">
              Tap a player to release them and free their contract salary
            </p>
          </div>
        </div>

        {/* Dynamic auction alert box */}
        <div className="bg-[#0f172a] rounded-xl border border-slate-800/80 px-3 py-2 flex items-center gap-2 text-slate-300 text-xs">
          <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{cycle.megaAuctionNotice}</span>
        </div>
      </div>

      {/* Squad Players Scrollable List */}
      <div className="flex-1 overflow-y-auto px-4 py-1 flex flex-col gap-2">
        {userSquad.map(player => {
          const isReleased = releasedIds.includes(player.id);
          const salary = getSalaryCr(player);
          const salaryText = salary >= 1.0 ? `${salary.toFixed(salary % 1 === 0 ? 0 : 2)} cr` : `${Math.round(salary * 100)}L`;
          const primaryRating = Math.max(player.ratings.bat, player.ratings.bowl);
          const isBowlDominant = player.ratings.bowl > player.ratings.bat;

          return (
            <div
              key={player.id}
              onClick={() => toggleRelease(player.id)}
              className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                isReleased
                  ? 'bg-rose-950/25 border-rose-500/60 opacity-80'
                  : 'bg-[#0f172a]/90 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Jersey Badge */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black font-mono shrink-0 ${
                  isReleased ? 'bg-rose-900/40 text-rose-300' : 'bg-slate-800 text-slate-300'
                }`}>
                  {player.jerseyNumber || 11}
                </div>

                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className={`text-xs font-bold leading-tight ${isReleased ? 'text-rose-300 line-through' : 'text-white'}`}>
                      {player.name}
                    </h4>
                    {player.isOverseas && (
                      <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-sky-950 text-sky-400 border border-sky-800/60 font-semibold">
                        {player.country?.slice(0, 2).toUpperCase() || 'WI'}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {player.role} · age {player.age}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs font-mono font-bold text-white">
                    <span className="text-[9px] text-slate-400 mr-1 uppercase">
                      {isBowlDominant ? 'BWL' : 'BAT'}
                    </span>
                    <strong className={primaryRating >= 85 ? 'text-emerald-400' : primaryRating >= 75 ? 'text-amber-400' : 'text-slate-300'}>
                      {primaryRating}
                    </strong>
                  </div>
                  <span className={`text-[10px] font-mono block ${isReleased ? 'text-rose-400 font-bold' : 'text-emerald-400'}`}>
                    frees {salaryText}
                  </span>
                </div>

                <div className="text-slate-500">
                  {isReleased ? (
                    <CheckCircle className="w-5 h-5 text-rose-400" />
                  ) : (
                    <MinusCircle className="w-5 h-5 text-slate-600 hover:text-slate-400" />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sticky Bottom Stats & Action Bar */}
      <div className="p-4 border-t border-slate-800/80 bg-[#0c121d]/95">
        <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono mb-3">
          <div>
            <span className="text-[9px] text-slate-500 uppercase block tracking-wider">RELEASED</span>
            <strong className="text-white font-bold">{releasedIds.length}</strong>
          </div>
          <div>
            <span className="text-[9px] text-slate-500 uppercase block tracking-wider">REFUND</span>
            <strong className="text-slate-300 font-bold">
              {totalRefundCr > 0 ? `${totalRefundCr.toFixed(2)} cr` : '—'}
            </strong>
          </div>
          <div>
            <span className="text-[9px] text-slate-500 uppercase block tracking-wider">PURSE</span>
            <strong className="text-amber-400 font-bold">{effectivePurseCr.toFixed(2)} cr</strong>
          </div>
          <div>
            <span className="text-[9px] text-slate-500 uppercase block tracking-wider">SQUAD</span>
            <strong className="text-white font-bold">{remainingSquadCount}</strong>
          </div>
        </div>

        <button
          onClick={() => {
            sound.playCrowdCheer(0.8);
            releasePlayersForAuction(userTeam.id, releasedIds, effectivePurseCr);
            onProceedToAuctionHall(releasedIds, effectivePurseCr);
          }}
          className="w-full py-4 bg-gradient-to-r from-[#eab308] via-[#f5b82e] to-[#eab308] hover:from-[#facc15] hover:to-[#f5b82e] text-black font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 active:scale-98 transition-all"
        >
          {releasedIds.length > 0
            ? `RELEASE ${releasedIds.length} PLAYERS · TO AUCTION`
            : 'NO RELEASES · TO AUCTION'}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
