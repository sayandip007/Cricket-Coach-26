import React from 'react';
import { ArrowLeft, Gavel } from 'lucide-react';
import { INITIAL_AUCTION_CLUBS, AuctionClubReleaseData } from '../../data/auctionSets2026';
import { Team } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';

interface AuctionHallScreenProps {
  isOpen: boolean;
  onClose: () => void;
  onStartAuction: () => void;
  userTeam: Team;
  userPurseCr?: number;
  userReleasedNames?: string[];
}

export const AuctionHallScreen: React.FC<AuctionHallScreenProps> = ({
  isOpen,
  onClose,
  onStartAuction,
  userTeam,
  userPurseCr = 28.65,
  userReleasedNames = ['Pandey', 'U. Malik', 'Saurabh', 'Ramandeep', 'Ranjan']
}) => {
  if (!isOpen) return null;

  const clubs: AuctionClubReleaseData[] = INITIAL_AUCTION_CLUBS.map(c => {
    if (c.shortName === userTeam.shortName || c.teamId === userTeam.id) {
      return {
        ...c,
        purseCr: userPurseCr,
        releasedCount: userReleasedNames.length,
        keptCount: 19 - userReleasedNames.length,
        releasedPlayers: userReleasedNames
      };
    }
    return c;
  });

  return (
    <div className="fixed inset-0 z-50 bg-[#070b12] text-slate-100 flex flex-col justify-between max-w-md mx-auto overflow-hidden animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-800/80 bg-[#0c121d]/90">
        <button
          onClick={() => { sound.playTap(); onClose(); }}
          className="p-1 rounded-lg text-slate-400 hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xs font-black font-display tracking-widest text-white uppercase">
          AUCTION HALL
        </h2>
      </div>

      {/* Intro note */}
      <div className="px-4 pt-3 pb-1">
        <p className="text-xs text-slate-400 leading-relaxed">
          Mini auction: every club keeps its squad and releases a few players into the pool. Check who each side let go, then tap START AUCTION.
        </p>
      </div>

      {/* Clubs List */}
      <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-2.5">
        {clubs.map(club => {
          const isUser = club.shortName === userTeam.shortName || club.teamId === userTeam.id;
          return (
            <div
              key={club.teamId}
              className={`p-3.5 rounded-2xl border transition-all ${
                isUser
                  ? 'bg-[#151a26] border-amber-500/80 shadow-lg shadow-amber-500/10'
                  : 'bg-[#0f172a]/90 border-slate-800/80'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black text-white shrink-0"
                    style={{ backgroundColor: club.primaryColor }}
                  >
                    {club.logo}
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase text-white tracking-wider">
                      {club.teamName}
                    </h4>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {club.keptCount} kept · {club.releasedCount} released
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest block">
                    PURSE
                  </span>
                  <span className="text-xs font-mono font-black text-amber-300">
                    {club.purseCr.toFixed(2)} cr
                  </span>
                </div>
              </div>

              {/* Released players sub-line */}
              <div className="pt-2 border-t border-slate-800/60 text-[11px] font-mono text-slate-400">
                {club.releasedPlayers.length > 0 ? (
                  <span>
                    Released: <strong className="text-slate-300 font-normal">{club.releasedPlayers.join(', ')}</strong>
                  </span>
                ) : (
                  <span className="text-slate-500 italic">Released nobody.</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sticky Bottom START AUCTION Button */}
      <div className="p-4 border-t border-slate-800/80 bg-[#0c121d]/95">
        <button
          onClick={() => {
            sound.playGavel();
            sound.playCrowdCheer(0.8);
            onStartAuction();
          }}
          className="w-full py-4 bg-gradient-to-r from-[#eab308] via-[#f5b82e] to-[#eab308] hover:from-[#facc15] hover:to-[#f5b82e] text-black font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 active:scale-98 transition-all"
        >
          <Gavel className="w-4 h-4 fill-current" />
          START AUCTION
        </button>
      </div>
    </div>
  );
};
