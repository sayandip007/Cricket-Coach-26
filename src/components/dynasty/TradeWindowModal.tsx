import React, { useState, useMemo, useEffect } from 'react';
import { Wallet, CheckCircle, ChevronRight, X, ArrowRightLeft } from 'lucide-react';
import { Team, Player } from '../../types/cricket';
import { useGame } from '../../context/GameContext';
import { sound } from '../../utils/soundEffects';

interface TradeOffer {
  id: string;
  fromTeamId: string;
  fromTeamShort: string;
  fromTeamName: string;
  fromTeamColor: string;
  targetPlayerId: string;
  targetPlayerName: string;
  offeredPlayerId: string;
  offeredPlayerName: string;
  offeredPlayerRating: number;
  offeredPlayerRole: string;
  isCustom?: boolean;
}

interface CompletedTrade {
  withTeamShort: string;
  inPlayer: string;
  outPlayer: string;
}

interface TradeWindowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceedToReleases: (updatedPurseCr: number) => void;
  userTeam: Team;
  userSquad: Player[];
  allTeams: Team[];
  initialPurseCr?: number;
}

export const TradeWindowModal: React.FC<TradeWindowModalProps> = ({
  isOpen,
  onProceedToReleases,
  userTeam,
  userSquad,
  allTeams,
  initialPurseCr = 20.85
}) => {
  const { players, setPlayers, setTeams } = useGame();
  const [currentPurseCr, setCurrentPurseCr] = useState<number>(userTeam.purseCr || initialPurseCr);
  const [completedTrades, setCompletedTrades] = useState<CompletedTrade[]>([]);
  const [activeOfferModal, setActiveOfferModal] = useState<TradeOffer | null>(null);

  // Dynamically build incoming trade offers from real userSquad and rival franchise rosters
  const generatedOffers = useMemo<TradeOffer[]>(() => {
    const myPlayers = players.filter(p => p.clubId === userTeam.id);
    if (myPlayers.length === 0) return [];
    const rivalClubs = allTeams.filter(t => t.id !== userTeam.id).slice(0, 5);

    return rivalClubs.map((rival, idx) => {
      const targetUserPlayer = myPlayers[(idx + 1) % myPlayers.length] || myPlayers[0];
      const rivalRoster = players.filter(p => p.clubId === rival.id);
      const targetOvr = Math.max(targetUserPlayer.ratings.bat, targetUserPlayer.ratings.bowl);
      const offeredRivalPlayer =
        rivalRoster
          .slice()
          .sort(
            (a, b) =>
              Math.abs(Math.max(a.ratings.bat, a.ratings.bowl) - targetOvr) -
              Math.abs(Math.max(b.ratings.bat, b.ratings.bowl) - targetOvr)
          )[0] || rivalRoster[0];

      const offRating = offeredRivalPlayer
        ? Math.max(offeredRivalPlayer.ratings.bat, offeredRivalPlayer.ratings.bowl)
        : 82;

      return {
        id: `tr_${rival.id}_${idx}`,
        fromTeamId: rival.id,
        fromTeamShort: rival.shortName,
        fromTeamName: rival.name,
        fromTeamColor: rival.primaryColor || '#004ba0',
        targetPlayerId: targetUserPlayer.id,
        targetPlayerName: targetUserPlayer.name,
        offeredPlayerId: offeredRivalPlayer?.id || '',
        offeredPlayerName: offeredRivalPlayer?.name || `${rival.shortName} Player`,
        offeredPlayerRating: offRating,
        offeredPlayerRole: offeredRivalPlayer?.role || 'All-rounder'
      };
    });
  }, [allTeams, players, userTeam.id]);

  const [offers, setOffers] = useState<TradeOffer[]>(generatedOffers);

  useEffect(() => {
    if (offers.length === 0 && generatedOffers.length > 0 && completedTrades.length === 0) {
      setOffers(generatedOffers);
    }
  }, [generatedOffers, offers.length, completedTrades.length]);

  if (!isOpen) return null;

  const tradesMade = completedTrades.length;
  const tradesRemaining = Math.max(0, 3 - tradesMade);
  const isTradeLimitReached = tradesMade >= 3;

  const otherTeamsList = allTeams
    .filter(t => t.id !== userTeam.id)
    .map(t => {
      const tPlayers = players.filter(p => p.clubId === t.id);
      const avgBat = tPlayers.length > 0
        ? Math.round(tPlayers.reduce((s, p) => s + p.ratings.bat, 0) / tPlayers.length)
        : 82;
      const avgBwl = tPlayers.length > 0
        ? Math.round(tPlayers.reduce((s, p) => s + p.ratings.bowl, 0) / tPlayers.length)
        : 80;
      const stars = tPlayers.filter(p => Math.max(p.ratings.bat, p.ratings.bowl) >= 85).length;
      return {
        id: t.id,
        name: t.name,
        short: t.shortName,
        bat: avgBat,
        bwl: avgBwl,
        dpt: Math.min(90, 65 + tPlayers.length),
        stars: Math.max(2, stars),
        color: t.primaryColor || '#004ba0'
      };
    });

  const handleAcceptOffer = (offer: TradeOffer) => {
    sound.playCrowdCheer(0.8);

    const userOutgoing = players.find(p => p.id === offer.targetPlayerId);
    const rivalIncoming = players.find(p => p.id === offer.offeredPlayerId);

    const outSalary = userOutgoing?.salaryCr || userOutgoing?.basePriceCr || 2.0;
    const inSalary = rivalIncoming?.salaryCr || rivalIncoming?.basePriceCr || 2.0;
    const purseDelta = Number((outSalary - inSalary).toFixed(2));
    const nextPurse = Math.max(0.5, Number((currentPurseCr + purseDelta).toFixed(2)));

    // 1. Swap clubId in global players state
    if (userOutgoing && rivalIncoming) {
      const updatedOutgoing: Player = { ...userOutgoing, clubId: offer.fromTeamId, isCaptain: false };
      const updatedIncoming: Player = { ...rivalIncoming, clubId: userTeam.id, isCaptain: false };

      setPlayers(prev =>
        prev.map(p => {
          if (p.id === updatedOutgoing.id) return updatedOutgoing;
          if (p.id === updatedIncoming.id) return updatedIncoming;
          return p;
        })
      );

      // 2. Swap players in global teams state (squad & playingXIIds) and update purseCr
      setTeams(prev =>
        prev.map(t => {
          if (t.id === userTeam.id) {
            const newSquad = [
              ...t.squad.filter(sp => sp.id !== updatedOutgoing.id && sp.id !== updatedIncoming.id),
              updatedIncoming
            ];
            const newXI = t.playingXIIds.map(id => (id === updatedOutgoing.id ? updatedIncoming.id : id));
            return {
              ...t,
              purseCr: nextPurse,
              squad: newSquad,
              playingXIIds: newXI
            };
          }
          if (t.id === offer.fromTeamId) {
            const newSquad = [
              ...t.squad.filter(sp => sp.id !== updatedIncoming.id && sp.id !== updatedOutgoing.id),
              updatedOutgoing
            ];
            const newXI = t.playingXIIds.map(id => (id === updatedIncoming.id ? updatedOutgoing.id : id));
            return {
              ...t,
              purseCr: Math.max(0.5, Number(((t.purseCr || 20) - purseDelta).toFixed(2))),
              squad: newSquad,
              playingXIIds: newXI
            };
          }
          return t;
        })
      );
    }

    setCompletedTrades(prev => [
      { withTeamShort: offer.fromTeamShort, inPlayer: offer.offeredPlayerName, outPlayer: offer.targetPlayerName },
      ...prev
    ]);
    setOffers(prev => prev.filter(o => o.id !== offer.id && o.targetPlayerId !== offer.targetPlayerId));
    setCurrentPurseCr(nextPurse);
    setActiveOfferModal(null);
  };

  const handleRejectOffer = (offerId: string) => {
    sound.playTap();
    setOffers(prev => prev.filter(o => o.id !== offerId));
    setActiveOfferModal(null);
  };

  const liveUserSquad = players.filter(p => p.clubId === userTeam.id);
  const activeRivalSquad = activeOfferModal
    ? players.filter(p => p.clubId === activeOfferModal.fromTeamId)
    : [];

  return (
    <div className="fixed inset-0 z-50 bg-[#070b12] text-slate-100 flex flex-col justify-between max-w-md mx-auto overflow-hidden animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-slate-800/80 bg-[#0c121d]/90">
        <h2 className="text-xs font-black font-display tracking-widest text-white uppercase">
          TRADE WINDOW
        </h2>
        <button
          onClick={() => {
            sound.playTap();
            onProceedToReleases(currentPurseCr);
          }}
          className="text-xs font-black font-mono uppercase tracking-widest text-amber-400 hover:text-amber-300 py-1 px-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30"
        >
          DONE
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
        {/* Purse Box */}
        <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Wallet className="w-4 h-4" />
            </div>
            <span className="text-xs font-mono uppercase tracking-wider text-slate-300 font-bold">
              YOUR PURSE AFTER TRADES
            </span>
          </div>
          <span className="text-base font-black font-mono text-amber-300">
            {currentPurseCr.toFixed(2)} cr
          </span>
        </div>

        {/* Trade limit reached banner */}
        {isTradeLimitReached ? (
          <div className="bg-[#121927] rounded-2xl border border-slate-700/60 p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-300 leading-relaxed font-medium">
              You&apos;ve made your trades for this window (3 max). The rest is settled at the auction.
            </p>
          </div>
        ) : (
          /* OFFERS FOR YOU */
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block mb-2 font-bold">
              OFFERS FOR YOU
            </span>
            <div className="flex flex-col gap-2">
              {offers.map(offer => (
                <div
                  key={offer.id}
                  onClick={() => {
                    sound.playTap();
                    setActiveOfferModal(offer);
                  }}
                  className="p-3 rounded-2xl bg-[#0f172a]/90 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between cursor-pointer active:scale-99 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black font-display text-white shrink-0"
                      style={{ backgroundColor: offer.fromTeamColor }}
                    >
                      {offer.fromTeamShort}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">
                        {offer.fromTeamShort} want {offer.targetPlayerName}
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        They offer {offer.offeredPlayerName} (OVR {offer.offeredPlayerRating})
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MAKE A TRADE */}
        {!isTradeLimitReached && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold">
                MAKE A TRADE
              </span>
              <span className="text-[10px] font-mono text-amber-400 font-bold">
                {tradesRemaining} OF 3 LEFT
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {otherTeamsList.map(ot => (
                <div
                  key={ot.short}
                  onClick={() => {
                    sound.playTap();
                    const rivalSquad = players.filter(p => p.clubId === ot.id);
                    const defaultOutgoing = liveUserSquad[0] || userSquad[0];
                    const defaultIncoming = rivalSquad[0];
                    if (!defaultOutgoing || !defaultIncoming) return;
                    setActiveOfferModal({
                      id: `custom_${ot.short}_${Date.now()}`,
                      fromTeamId: ot.id,
                      fromTeamShort: ot.short,
                      fromTeamName: ot.name,
                      fromTeamColor: ot.color,
                      targetPlayerId: defaultOutgoing.id,
                      targetPlayerName: defaultOutgoing.name,
                      offeredPlayerId: defaultIncoming.id,
                      offeredPlayerName: defaultIncoming.name,
                      offeredPlayerRating: Math.max(defaultIncoming.ratings.bat, defaultIncoming.ratings.bowl),
                      offeredPlayerRole: defaultIncoming.role,
                      isCustom: true
                    });
                  }}
                  className="p-3 rounded-2xl bg-[#0f172a]/80 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between cursor-pointer active:scale-99 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black font-display text-white shrink-0"
                      style={{ backgroundColor: ot.color }}
                    >
                      {ot.short}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">
                        {ot.name}
                      </h4>
                      <div className="flex items-center gap-3 mt-0.5 text-[10px] font-mono">
                        <span className="text-slate-400">BAT <strong className="text-emerald-400 font-bold">{ot.bat}</strong></span>
                        <span className="text-slate-400">BWL <strong className="text-emerald-400 font-bold">{ot.bwl}</strong></span>
                        <span className="text-slate-400">DPT <strong className="text-amber-400 font-bold">{ot.dpt}</strong></span>
                        <span className="text-amber-400 font-bold">★ {ot.stars}</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DONE THIS WINDOW FEED */}
        {completedTrades.length > 0 && (
          <div className="mt-2 pt-3 border-t border-slate-800/60">
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block mb-1 font-bold">
              DONE THIS WINDOW
            </span>
            <div className="flex flex-col gap-1 text-[11px] font-mono text-slate-400">
              {completedTrades.map((t, idx) => (
                <div key={idx}>
                  with {t.withTeamShort}: in <span className="text-white font-bold">{t.inPlayer}</span> · out <span className="text-slate-400">{t.outPlayer}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Trade Proposal Sheet Modal */}
      {activeOfferModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center">
          <div className="bg-[#0f172a] border-t border-slate-800 w-full max-w-md rounded-t-3xl p-5 flex flex-col gap-4 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-widest text-amber-400 font-bold">
                TRADE PROPOSAL · {activeOfferModal.fromTeamShort}
              </span>
              <button
                onClick={() => setActiveOfferModal(null)}
                className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {activeOfferModal.isCustom && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[9px] font-mono uppercase text-slate-400 block mb-1">
                    SEND FROM {userTeam.shortName}
                  </label>
                  <select
                    value={activeOfferModal.targetPlayerId}
                    onChange={e => {
                      const found = liveUserSquad.find(p => p.id === e.target.value);
                      if (!found) return;
                      setActiveOfferModal({
                        ...activeOfferModal,
                        targetPlayerId: found.id,
                        targetPlayerName: found.name
                      });
                    }}
                    className="w-full bg-[#121927] border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white font-bold"
                  >
                    {liveUserSquad.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} (OVR {Math.max(p.ratings.bat, p.ratings.bowl)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[9px] font-mono uppercase text-slate-400 block mb-1">
                    REQUEST FROM {activeOfferModal.fromTeamShort}
                  </label>
                  <select
                    value={activeOfferModal.offeredPlayerId}
                    onChange={e => {
                      const found = activeRivalSquad.find(p => p.id === e.target.value);
                      if (!found) return;
                      setActiveOfferModal({
                        ...activeOfferModal,
                        offeredPlayerId: found.id,
                        offeredPlayerName: found.name,
                        offeredPlayerRating: Math.max(found.ratings.bat, found.ratings.bowl),
                        offeredPlayerRole: found.role
                      });
                    }}
                    className="w-full bg-[#121927] border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white font-bold"
                  >
                    {activeRivalSquad.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} (OVR {Math.max(p.ratings.bat, p.ratings.bowl)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="bg-[#121927] rounded-2xl border border-slate-800 p-4 flex items-center justify-between gap-3">
              <div className="text-center flex-1">
                <span className="text-[10px] font-mono text-rose-400 uppercase tracking-wider block font-bold">
                  OUTGOING
                </span>
                <h4 className="text-sm font-bold text-white mt-1">
                  {activeOfferModal.targetPlayerName}
                </h4>
                <span className="text-[10px] text-slate-400">from {userTeam.shortName}</span>
              </div>

              <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <ArrowRightLeft className="w-4 h-4" />
              </div>

              <div className="text-center flex-1">
                <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider block font-bold">
                  INCOMING
                </span>
                <h4 className="text-sm font-bold text-white mt-1">
                  {activeOfferModal.offeredPlayerName}
                </h4>
                <span className="text-[10px] text-slate-400">OVR {activeOfferModal.offeredPlayerRating} · {activeOfferModal.offeredPlayerRole}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-1">
              <button
                onClick={() => handleRejectOffer(activeOfferModal.id)}
                className="py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-xs uppercase rounded-xl tracking-wider transition-all"
              >
                DECLINE
              </button>
              <button
                onClick={() => handleAcceptOffer(activeOfferModal)}
                className="py-3.5 bg-gradient-to-r from-[#eab308] to-[#f5b82e] hover:from-[#facc15] text-black font-black text-xs uppercase rounded-xl tracking-wider shadow-lg shadow-amber-500/20 transition-all"
              >
                ACCEPT TRADE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
