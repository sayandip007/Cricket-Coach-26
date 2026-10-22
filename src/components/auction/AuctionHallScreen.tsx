import React from 'react';
import { ArrowLeft, Gavel } from 'lucide-react';
import {
  INITIAL_AUCTION_CLUBS,
  AuctionClubReleaseData,
  resolveAuctionFranchise
} from '../../data/auctionSets2026';
import { Team } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';

interface AuctionHallScreenProps {
  isOpen: boolean;
  onClose: () => void;
  onStartAuction: () => void;
  userTeam: Team;
  userPurseCr?: number;
  userReleasedNames?: string[];
  seasonYear?: number;
}

export const AuctionHallScreen: React.FC<AuctionHallScreenProps> = ({
  isOpen,
  onClose,
  onStartAuction,
  userTeam,
  userPurseCr,
  userReleasedNames,
  seasonYear = 2026
}) => {
  if (!isOpen) return null;

  const isMega = (seasonYear - 2025) % 3 === 0;

  const matchedUserClub =
    resolveAuctionFranchise(userTeam.id) || resolveAuctionFranchise(userTeam.shortName);

  const clubs: AuctionClubReleaseData[] = INITIAL_AUCTION_CLUBS.map(c => {
    const isUser =
      c.teamId === userTeam.id ||
      c.shortName === userTeam.shortName ||
      (matchedUserClub && c.teamId === matchedUserClub.teamId);

    if (isUser) {
      const effectiveReleased =
        userReleasedNames && userReleasedNames.length > 0
          ? userReleasedNames
          : c.releasedPlayers;
      const effectivePurse =
        typeof userPurseCr === 'number' && userPurseCr <= 65
          ? userPurseCr
          : c.purseCr;

      return {
        ...c,
        purseCr: effectivePurse,
        releasedCount: effectiveReleased.length,
        keptCount: Math.max(12, 22 - effectiveReleased.length),
        releasedPlayers: effectiveReleased
      };
    }
    return c;
  });

  return (
    <div className="fixed inset-0 z-50 bg-[#070b12] text-slate-100 flex flex-col justify-between max-w-md mx-auto overflow-hidden animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-800/80 bg-[#0c121d]/90">
        <button
          onClick={() => {
            sound.playTap();
            onClose();
          }}
          className="p-1 rounded-lg text-slate-400 hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-xs font-black font-display tracking-widest text-white uppercase">
            TATA IPL {seasonYear} {isMega ? 'MEGA' : 'MINI'} AUCTION HALL
          </h2>
          <span className="text-[10px] font-mono text-amber-400 block">
            {isMega ? '350 OFFICIAL LOTS · MEGA AUCTION CYCLE' : 'OFFICIAL LOTS · MINI RETENTION & PURSE TOP-UP'}
          </span>
        </div>
      </div>

      {/* Intro note */}
      <div className="px-4 pt-3 pb-1">
        <p className="text-xs text-slate-400 leading-relaxed">
          Official TATA IPL 2026 Auction: 350 registered players across 42 sets (BA1 to UAL10). Review each franchise&apos;s purse and released players, then tap START AUCTION.
        </p>
      </div>

      {/* Clubs List */}
      <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-2.5">
        {clubs.map(club => {
          const isUser =
            club.teamId === userTeam.id ||
            club.shortName === userTeam.shortName ||
            (matchedUserClub && club.teamId === matchedUserClub.teamId);

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
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-black uppercase text-white tracking-wider">
                        {club.teamName}
                      </h4>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-bold">
                        {club.shortName}
                      </span>
                    </div>
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
                    Released:{' '}
                    <strong className="text-slate-300 font-normal">
                      {club.releasedPlayers.join(', ')}
                    </strong>
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
