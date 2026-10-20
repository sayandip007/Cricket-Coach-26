import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Check,
  MoreVertical,
  Users,
  FastForward,
  Lightbulb,
  X,
  Volume2,
  VolumeX,
  Sparkles,
  Gavel
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useGame } from '../../context/GameContext';
import { sound } from '../../utils/soundEffects';
import {
  AUCTION_PLAYERS_2026,
  AUCTION_SETS_META,
  INITIAL_AUCTION_CLUBS,
  AuctionPlayerItem,
  AuctionSetType
} from '../../data/auctionSets2026';
import { Player } from '../../types/cricket';

interface BidRecord {
  teamShort: string;
  teamColor: string;
  amountCr: number;
}

interface SoldOutcome {
  playerId: string;
  buyerTeamShort: string;
  buyerTeamName: string;
  buyerTeamColor: string;
  finalPriceCr: number;
}

export const AuctionRoom: React.FC = () => {
  const {
    userTeam,
    teams,
    setTeams,
    players,
    setPlayers,
    setActiveTab,
    unlockAchievement
  } = useGame();

  // -------------------------------------------------------------
  // STATE MANAGEMENT
  // -------------------------------------------------------------
  const [allLots, setAllLots] = useState<AuctionPlayerItem[]>(AUCTION_PLAYERS_2026);
  const [currentLotIndex, setCurrentLotIndex] = useState<number>(0);
  const [activeSetId, setActiveSetId] = useState<AuctionSetType>('PLATINUM');
  const [isPoolDropdownOpen, setIsPoolDropdownOpen] = useState<boolean>(false);
  const [isSetSheetOpen, setIsSetSheetOpen] = useState<boolean>(false);
  const [isSquadPlannerOpen, setIsSquadPlannerOpen] = useState<boolean>(false);

  // Speed controls: 1x, 2x, 3x, instant
  const [speed, setSpeed] = useState<'1x' | '2x' | '3x' | 'instant'>('1x');
  const [showSpeedMenu, setShowSpeedMenu] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showHelpBanner, setShowHelpBanner] = useState<boolean>(true);
  const [showAllStats, setShowAllStats] = useState<boolean>(false);
  const [showMoreTeams, setShowMoreTeams] = useState<boolean>(false);

  // Current Lot Bidding States
  const [currentBidCr, setCurrentBidCr] = useState<number>(2.0);
  const [currentBidderShort, setCurrentBidderShort] = useState<string | null>(null);
  const [bidHistory, setBidHistory] = useState<BidRecord[]>([]);
  const [lotStatus, setLotStatus] = useState<'bidding' | 'sold' | 'unsold'>('bidding');
  const [lastSoldInfo, setLastSoldInfo] = useState<SoldOutcome | null>(null);

  // Overall Sales Record { [playerId]: SoldOutcome }
  const [salesRecord, setSalesRecord] = useState<Record<string, SoldOutcome>>({});

  // Team Purses mapping synced with global teams state
  const [teamPurses, setTeamPurses] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    INITIAL_AUCTION_CLUBS.forEach(c => {
      const liveTeam = teams.find(t => t.shortName === c.shortName);
      map[c.shortName] = liveTeam ? liveTeam.purseCr : c.purseCr;
    });
    map[userTeam.shortName] = userTeam.purseCr || 28.65;
    return map;
  });

  // Helper to commit a completed lot sale into global players & teams state
  const commitAuctionSale = (lot: AuctionPlayerItem, buyerShort: string, priceCr: number) => {
    const winnerTeam = teams.find(t => t.shortName === buyerShort);
    if (!winnerTeam) return;

    const existingPlayer = players.find(
      p => p.id === lot.id || p.name.toLowerCase() === lot.name.toLowerCase()
    );

    const mappedPlayer: Player = existingPlayer
      ? {
          ...existingPlayer,
          clubId: winnerTeam.id,
          salaryCr: priceCr,
          basePriceCr: lot.basePriceCr || existingPlayer.basePriceCr
        }
      : {
          id: lot.id,
          name: lot.name,
          jerseyNumber: lot.jerseyNumber || 45,
          role: lot.role,
          bowlingArm: lot.bowlingArm || 'RAF',
          battingHand: lot.battingHand || 'RHB',
          age: lot.age,
          country: lot.country || lot.countryCode || 'India',
          clubId: winnerTeam.id,
          isOverseas: lot.isOverseas,
          tier: lot.tier,
          basePriceCr: lot.basePriceCr,
          salaryCr: priceCr,
          ratings: {
            bat: lot.ratings.bat,
            pow: lot.ratings.pow ?? 75,
            tec: lot.ratings.tec ?? 75,
            tmp: lot.ratings.tmp ?? 78,
            agg: lot.ratings.agg ?? 75,
            run: lot.ratings.run ?? 76,
            vp: lot.ratings.vp ?? lot.ratings.bat,
            vs: lot.ratings.vs ?? lot.ratings.bat,
            bowl: lot.ratings.bowl,
            pace: lot.ratings.pace ?? 76,
            ctrl: lot.ratings.ctrl ?? 76,
            dis: lot.ratings.dis ?? 75,
            var: lot.ratings.var ?? 75,
            dth: lot.ratings.dth ?? 75,
            comp: lot.ratings.comp ?? 78,
            cat: lot.ratings.cat ?? 76,
            fld: lot.ratings.fld ?? 76,
            fit: lot.ratings.fit ?? 88,
            exp: lot.ratings.exp ?? 78
          },
          form: lot.form ?? 82,
          morale: lot.morale ?? 86,
          fitness: 96,
          isInjured: false,
          injuryDays: 0,
          stats: {
            matches: 0,
            runs: 0,
            balls: 0,
            fours: 0,
            sixes: 0,
            fifties: 0,
            hundreds: 0,
            highestScore: 0,
            wickets: 0,
            oversBowled: 0,
            runsConceded: 0,
            maidens: 0,
            bestBowling: '0/0'
          }
        };

    setPlayers(prev => {
      const exists = prev.some(p => p.id === mappedPlayer.id);
      if (exists) {
        return prev.map(p => (p.id === mappedPlayer.id ? mappedPlayer : p));
      }
      return [...prev, mappedPlayer];
    });

    setTeams(prev =>
      prev.map(t => {
        if (t.id === winnerTeam.id) {
          const filteredSquad = t.squad.filter(sp => sp.id !== mappedPlayer.id);
          const nextSquad = [...filteredSquad, mappedPlayer];
          const nextXI =
            t.playingXIIds.length < 11 && !t.playingXIIds.includes(mappedPlayer.id)
              ? [...t.playingXIIds, mappedPlayer.id]
              : t.playingXIIds;
          return {
            ...t,
            purseCr: Math.max(0, Number(((t.purseCr || 25) - priceCr).toFixed(2))),
            squad: nextSquad,
            playingXIIds: nextXI
          };
        }
        // Remove from previous club if transferred
        if (t.squad.some(sp => sp.id === mappedPlayer.id)) {
          return {
            ...t,
            squad: t.squad.filter(sp => sp.id !== mappedPlayer.id),
            playingXIIds: t.playingXIIds.filter(id => id !== mappedPlayer.id)
          };
        }
        return t;
      })
    );
  };

  // Current Player
  const currentPlayer = allLots[currentLotIndex] || allLots[0];
  const currentSetMeta = AUCTION_SETS_META.find(s => s.id === activeSetId) || AUCTION_SETS_META[0];

  // Initialize lot when currentLotIndex changes
  useEffect(() => {
    if (!currentPlayer) return;
    const base = currentPlayer.basePriceCr;
    setCurrentBidCr(base);
    setCurrentBidderShort(null);
    setBidHistory([]);
    setLotStatus('bidding');
    setLastSoldInfo(null);
  }, [currentLotIndex, currentPlayer]);

  // Keep activeSetId in sync with current player's set
  useEffect(() => {
    if (currentPlayer && currentPlayer.set !== activeSetId) {
      setActiveSetId(currentPlayer.set);
    }
  }, [currentPlayer, activeSetId]);

  // -------------------------------------------------------------
  // AUCTION SOUND & AI BIDDING SPEED
  // -------------------------------------------------------------
  const aiDelayMs = speed === 'instant' ? 100 : speed === '3x' ? 250 : speed === '2x' ? 500 : 900;

  // AI Bidding Logic
  const triggerAiResponse = (userJustBid: boolean, newAmount: number) => {
    setTimeout(() => {
      // 65% chance an AI franchise counters if price not absurdly high
      const shouldAiBid = Math.random() < 0.65 && newAmount < 18.0;
      if (!shouldAiBid) return;

      const candidates = INITIAL_AUCTION_CLUBS.filter(
        c => c.shortName !== userTeam.shortName && (teamPurses[c.shortName] || 0) > newAmount + 0.25
      );
      if (candidates.length === 0) return;

      const aiFranchise = candidates[Math.floor(Math.random() * candidates.length)];
      const nextAmount = Number((newAmount + 0.25).toFixed(2));

      if (!isMuted) sound.playGavel();

      setCurrentBidCr(nextAmount);
      setCurrentBidderShort(aiFranchise.shortName);
      setBidHistory(prev => [
        ...prev,
        {
          teamShort: aiFranchise.shortName,
          teamColor: aiFranchise.primaryColor,
          amountCr: nextAmount
        }
      ]);
    }, aiDelayMs);
  };

  // Place User Bid
  const handleUserBid = () => {
    const nextAmount = currentBidderShort ? Number((currentBidCr + 0.25).toFixed(2)) : currentBidCr;
    const userPurse = teamPurses[userTeam.shortName] || 28.65;

    if (userPurse < nextAmount) {
      sound.playTap();
      return;
    }

    if (!isMuted) sound.playGavel();

    setCurrentBidCr(nextAmount);
    setCurrentBidderShort(userTeam.shortName);
    setBidHistory(prev => [
      ...prev,
      {
        teamShort: userTeam.shortName,
        teamColor: '#f5b82e',
        amountCr: nextAmount
      }
    ]);

    triggerAiResponse(true, nextAmount);
  };

  // Finalize Lot (SKIP / SOLD / UNSOLD)
  const handleSkipOrFinalize = () => {
    if (!isMuted) sound.playGavel();

    if (currentBidderShort) {
      const winnerClub = INITIAL_AUCTION_CLUBS.find(c => c.shortName === currentBidderShort);
      const winnerName = winnerClub ? winnerClub.teamName : `${currentBidderShort} Franchise`;
      const winnerColor = winnerClub ? winnerClub.primaryColor : '#0057b8';
      const finalPrice = currentBidCr;

      const outcome: SoldOutcome = {
        playerId: currentPlayer.id,
        buyerTeamShort: currentBidderShort,
        buyerTeamName: winnerName,
        buyerTeamColor: winnerColor,
        finalPriceCr: finalPrice
      };

      setSalesRecord(prev => ({ ...prev, [currentPlayer.id]: outcome }));
      setLastSoldInfo(outcome);
      setLotStatus('sold');

      // Deduct purse locally & persist sale to global GameContext
      setTeamPurses(prev => ({
        ...prev,
        [currentBidderShort]: Math.max(0, Number(((prev[currentBidderShort] || 0) - finalPrice).toFixed(2)))
      }));
      commitAuctionSale(currentPlayer, currentBidderShort, finalPrice);

      // If user won
      if (currentBidderShort === userTeam.shortName) {
        if (!isMuted) sound.playCrowdCheer(1.0);
        confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
        unlockAchievement('ach_3');
        if (finalPrice >= 15) unlockAchievement('ach_32');
      }

      // Auto advance to next lot after delay
      setTimeout(() => {
        handleNextLot();
      }, speed === 'instant' ? 600 : 1800);
    } else {
      setLotStatus('unsold');
      setTimeout(() => {
        handleNextLot();
      }, speed === 'instant' ? 600 : 1400);
    }
  };

  const handleNextLot = () => {
    if (currentLotIndex < allLots.length - 1) {
      setCurrentLotIndex(prev => prev + 1);
    } else {
      // Completed all lots
      setIsSquadPlannerOpen(true);
    }
  };

  // Jump to specific set
  const handleSelectSet = (setId: AuctionSetType) => {
    setActiveSetId(setId);
    setIsPoolDropdownOpen(false);
    const targetIdx = allLots.findIndex(p => p.set === setId);
    if (targetIdx !== -1) {
      setCurrentLotIndex(targetIdx);
    }
  };

  // Compute set counts
  const currentSetPlayers = useMemo(() => {
    return allLots.filter(p => p.set === activeSetId);
  }, [allLots, activeSetId]);

  const soldInCurrentSetCount = currentSetPlayers.filter(p => salesRecord[p.id]).length;
  const remainingInSetCount = currentSetPlayers.length - soldInCurrentSetCount;

  // Formatted attribute stats for current player
  const statsKey = currentPlayer.statsKey || {
    stat1Label: 'BAT',
    stat1Val: currentPlayer.ratings?.bat || 70,
    stat2Label: 'POW',
    stat2Val: currentPlayer.ratings?.pow || 70,
    stat3Label: 'BOWL',
    stat3Val: currentPlayer.ratings?.bowl || 60,
    stat4Label: 'DTH',
    stat4Val: currentPlayer.ratings?.dth || 65,
  };
  const isBowler = currentPlayer.role === 'Bowler';

  // Announcer text
  const announcerMessage = currentBidderShort
    ? `${currentBidderShort} leads the bidding at ${currentBidCr.toFixed(2)} cr!`
    : 'No takers yet. Who opens the bidding?';

  // User Squad numbers dynamically computed from live global players state
  const liveUserSquad = useMemo(
    () => players.filter(p => p.clubId === userTeam.id),
    [players, userTeam.id]
  );
  const userPurseRemaining = teamPurses[userTeam.shortName] ?? userTeam.purseCr ?? 28.65;
  const userSquadCount = liveUserSquad.length;
  const userOverseasCount = liveUserSquad.filter(p => p.isOverseas).length;

  const plannerBatters = useMemo(
    () => liveUserSquad.filter(p => p.role === 'Top-order' || p.role === 'Middle-order' || p.role === 'Batter'),
    [liveUserSquad]
  );
  const plannerAllRounders = useMemo(
    () => liveUserSquad.filter(p => p.role === 'All-rounder' || p.role === 'All-Rounder'),
    [liveUserSquad]
  );
  const plannerBowlers = useMemo(
    () => liveUserSquad.filter(p => p.role === 'Pace' || p.role === 'Spin' || p.role === 'Bowler'),
    [liveUserSquad]
  );
  const plannerKeepers = useMemo(
    () => liveUserSquad.filter(p => p.role === 'Wk-bat' || p.role === 'Wicketkeeper'),
    [liveUserSquad]
  );

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col justify-between max-w-5xl mx-auto w-full relative overflow-hidden select-none border-x border-slate-800/60">
      {/* ========================================================= */}
      {/* 1. TOP BAR                                                */}
      {/* ========================================================= */}
      <div className="px-6 py-3 flex items-center justify-between border-b border-slate-800/80 bg-[#0d131f]/95 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { sound.playTap(); setActiveTab('hub'); }}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div>
            <span className="text-[10px] font-mono text-slate-400 block tracking-widest uppercase">
              LOT {currentLotIndex + 1} / {allLots.length}
            </span>

            {/* Set Dropdown Trigger */}
            <button
              onClick={() => {
                sound.playTap();
                setIsPoolDropdownOpen(!isPoolDropdownOpen);
              }}
              className="flex items-center gap-1 text-[11px] font-black font-mono text-amber-300 uppercase tracking-wider py-0.5 px-2 rounded-lg bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 transition-all"
            >
              <span>{activeSetId}</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Top Right Controls: Autosaved, Speed, Menu */}
        <div className="flex items-center gap-2 relative">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 text-[10px] font-mono font-bold">
            <Check className="w-3 h-3" />
            AUTOSAVED
          </span>

          {/* Speed Toggle Pill */}
          <button
            onClick={() => {
              sound.playTap();
              setShowSpeedMenu(!showSpeedMenu);
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 text-[11px] font-mono font-bold hover:text-white"
          >
            <FastForward className="w-3 h-3 text-amber-400" />
            {speed}
          </button>

          {/* Speed Menu Popup */}
          {showSpeedMenu && (
            <div className="absolute right-6 top-8 bg-[#121927] border border-slate-700 rounded-xl p-1 shadow-2xl flex flex-col gap-1 z-40 text-xs font-mono">
              {(['1x', '2x', '3x', 'instant'] as const).map(sp => (
                <button
                  key={sp}
                  onClick={() => {
                    setSpeed(sp);
                    setShowSpeedMenu(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-left uppercase font-bold transition-all ${
                    speed === sp ? 'bg-amber-400 text-black' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {sp} Speed
                </button>
              ))}
            </div>
          )}

          {/* More options (Mute / Set Sheet / Squad) */}
          <button
            onClick={() => {
              sound.playTap();
              setIsSetSheetOpen(true);
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
            title="View Upcoming Lots"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. AUCTION POOLS DROPDOWN (Screenshot_20261019_234929_f36edefa.jpg) */}
      {/* ========================================================= */}
      {isPoolDropdownOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-14 max-w-md mx-auto">
          <div className="w-11/12 bg-[#121927] border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-3 border-b border-slate-800 bg-[#0f1522] flex items-center justify-between">
              <span className="text-xs font-black font-mono uppercase tracking-widest text-slate-300">
                AUCTION POOLS
              </span>
              <button
                onClick={() => setIsPoolDropdownOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-1">
              {AUCTION_SETS_META.map(setMeta => {
                const isLive = setMeta.id === activeSetId;
                return (
                  <button
                    key={setMeta.id}
                    onClick={() => handleSelectSet(setMeta.id)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/60 transition-all border-b border-slate-800/40 last:border-none"
                  >
                    <span className={`text-xs font-black font-mono uppercase tracking-wider ${
                      isLive ? 'text-amber-400' : 'text-slate-300'
                    }`}>
                      {setMeta.name}
                    </span>
                    {isLive && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold">
                        LIVE
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. HELP BANNER (Dismissible "GOT IT")                     */}
      {/* ========================================================= */}
      {showHelpBanner && (
        <div className="mx-4 mt-3 bg-[#0d1424] border border-amber-500/30 rounded-2xl p-3 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold font-mono uppercase">
              <Lightbulb className="w-4 h-4" />
              <span>Bidding</span>
            </div>
            <button
              onClick={() => { sound.playTap(); setShowHelpBanner(false); }}
              className="px-3 py-1 rounded-xl bg-[#f5b82e] hover:bg-amber-300 text-black text-[10px] font-black uppercase tracking-wider shadow-md"
            >
              GOT IT
            </button>
          </div>
          <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
            Tap BID to raise, or SKIP to drop out and settle the lot at once. The speed control makes bidding faster.
          </p>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. MAIN PLAYER SHOWCASE CARD                              */}
      {/* ========================================================= */}
      <div className="px-4 py-2 flex-1 flex flex-col justify-between overflow-y-auto">
        <div className="bg-[#0f172a]/95 rounded-2xl border border-slate-800/90 p-4 shadow-xl relative">
          {/* Top Badges: Tier & Country */}
          <div className="flex items-center justify-between mb-2">
            <span className="px-2.5 py-0.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[10px] font-black uppercase tracking-wider">
              {currentPlayer.tier}
            </span>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs font-mono font-bold text-slate-200">
              <span>{currentPlayer.countryFlag}</span>
              <span>{currentPlayer.countryCode}</span>
            </div>
          </div>

          {/* Big Circular Avatar with Initial & #Jersey Badge */}
          <div className="flex flex-col items-center justify-center my-1 relative">
            <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#0284c7] to-[#38bdf8] border-2 border-sky-400/50 flex items-center justify-center text-4xl font-black font-display text-white shadow-2xl relative">
              {currentPlayer.name.charAt(0)}

              {/* Jersey Badge */}
              <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full bg-amber-500 text-black font-mono font-black text-[11px] border-2 border-[#0f172a] shadow-md">
                #{currentPlayer.jerseyNumber || 49}
              </div>
            </div>

            <h3 className="text-xl font-black font-display uppercase tracking-wider text-white mt-3 text-center">
              {currentPlayer.name}
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5 text-center">
              {currentPlayer.specialism}
            </p>
          </div>

          {/* 4 Attribute Progress Bars */}
          <div className="grid grid-cols-4 gap-2 my-3">
            <div>
              <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                <span className="text-slate-400">{statsKey.stat1Label}</span>
                <strong className="text-emerald-400 font-bold">{statsKey.stat1Val}</strong>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full"
                  style={{ width: `${Math.min(100, statsKey.stat1Val)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                <span className="text-slate-400">{statsKey.stat2Label}</span>
                <strong className={statsKey.stat2Val >= 75 ? 'text-amber-400' : 'text-slate-400'}>
                  {statsKey.stat2Val}
                </strong>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full ${statsKey.stat2Val >= 75 ? 'bg-amber-400' : 'bg-slate-600'}`}
                  style={{ width: `${Math.min(100, statsKey.stat2Val)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                <span className="text-slate-400">{statsKey.stat3Label}</span>
                <strong className="text-emerald-400 font-bold">{statsKey.stat3Val}</strong>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full"
                  style={{ width: `${Math.min(100, statsKey.stat3Val)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                <span className="text-slate-400">{statsKey.stat4Label}</span>
                <strong className="text-emerald-400 font-bold">{statsKey.stat4Val}</strong>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full"
                  style={{ width: `${Math.min(100, statsKey.stat4Val)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Tap for all stats toggle */}
          <button
            onClick={() => { sound.playTap(); setShowAllStats(!showAllStats); }}
            className="w-full text-center text-[10px] font-mono text-slate-400 hover:text-slate-200 uppercase tracking-widest flex items-center justify-center gap-1 py-1"
          >
            TAP FOR ALL STATS
            {showAllStats ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showAllStats && (
            <div className="mt-2 pt-2 border-t border-slate-800 grid grid-cols-3 gap-2 text-[10px] font-mono animate-in fade-in duration-150">
              <div className="bg-[#121927] p-2 rounded-lg">
                <span className="text-slate-500 block">FIELDING</span>
                <strong className="text-white text-xs">{currentPlayer.ratings.fld || 85}</strong>
              </div>
              <div className="bg-[#121927] p-2 rounded-lg">
                <span className="text-slate-500 block">TEMPERAMENT</span>
                <strong className="text-white text-xs">{currentPlayer.ratings.tmp || 85}</strong>
              </div>
              <div className="bg-[#121927] p-2 rounded-lg">
                <span className="text-slate-500 block">EXPERIENCE</span>
                <strong className="text-white text-xs">{currentPlayer.ratings.exp || 80}</strong>
              </div>
            </div>
          )}

          {/* Bid History Carousel Pills */}
          <div className="mt-3 bg-[#111827] rounded-xl border border-slate-800 p-2 overflow-x-auto flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700/60 shrink-0">
              <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">BASE</span>
              <strong className="text-xs font-mono font-bold text-white">{currentPlayer.basePriceCr} cr</strong>
            </div>

            {bidHistory.length === 0 ? (
              <span className="text-xs text-slate-500 italic px-2">No bids yet</span>
            ) : (
              bidHistory.map((bid, bIdx) => (
                <div
                  key={bIdx}
                  className="px-3 py-1.5 rounded-lg bg-[#141d30] border border-cyan-500/40 shrink-0 flex items-center gap-1.5 animate-in slide-in-from-right-3 duration-150"
                >
                  <span
                    className="text-[10px] font-black font-display text-white px-1 py-0.2 rounded"
                    style={{ backgroundColor: bid.teamColor }}
                  >
                    {bid.teamShort}
                  </span>
                  <strong className="text-xs font-mono font-black text-amber-300">
                    {bid.amountCr.toFixed(2)} cr
                  </strong>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ======================================================= */}
        {/* 5. TEAM PURSES GRID (Exact Screenshot_20261019_234719_5c4fe90a.jpg) */}
        {/* ======================================================= */}
        <div className="my-2">
          <div className="grid grid-cols-5 gap-1.5">
            {INITIAL_AUCTION_CLUBS.slice(0, showMoreTeams ? 10 : 5).map(c => {
              const isUser = c.shortName === userTeam.shortName;
              const isCurrentLead = currentBidderShort === c.shortName;
              const purse = teamPurses[c.shortName] || c.purseCr;

              return (
                <div
                  key={c.teamId}
                  className={`p-2 rounded-xl border flex flex-col items-center justify-center text-center transition-all ${
                    isCurrentLead
                      ? 'bg-cyan-950/40 border-cyan-400 shadow-md shadow-cyan-500/20'
                      : isUser
                      ? 'bg-amber-950/30 border-amber-500/70'
                      : 'bg-[#0f172a]/90 border-slate-800'
                  }`}
                >
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-xs text-white mb-1 shrink-0"
                    style={{ backgroundColor: c.primaryColor }}
                  >
                    {c.logo}
                  </div>
                  <span className="text-[9px] font-mono font-black text-white truncate max-w-full">
                    {purse.toFixed(2)} cr
                  </span>
                </div>
              );
            })}
          </div>

          <div className="text-center mt-1">
            <button
              onClick={() => { sound.playTap(); setShowMoreTeams(!showMoreTeams); }}
              className="text-[10px] font-mono text-slate-400 hover:text-white uppercase tracking-widest flex items-center justify-center gap-1 mx-auto"
            >
              {showMoreTeams ? 'LESS ˄' : 'MORE ˅'}
            </button>
          </div>
        </div>

        {/* ======================================================= */}
        {/* 6. OUTCOME BANNERS OR BID CONTROLS                      */}
        {/* ======================================================= */}
        {lotStatus === 'sold' && lastSoldInfo ? (
          <div
            className="rounded-2xl p-4 shadow-2xl flex items-center justify-between animate-in zoom-in-95 duration-200"
            style={{ backgroundColor: lastSoldInfo.buyerTeamColor }}
          >
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 rounded bg-black/40 text-white font-black text-xs uppercase tracking-widest -rotate-6 border border-white/20">
                SOLD
              </span>
              <div>
                <h4 className="text-sm font-black font-display text-white uppercase tracking-wider">
                  {currentPlayer.name}
                </h4>
                <p className="text-[11px] font-medium text-white/80">
                  TO {lastSoldInfo.buyerTeamName.toUpperCase()}
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[9px] font-mono text-white/70 uppercase block tracking-wider">
                FINAL
              </span>
              <strong className="text-base font-black font-mono text-white">
                {lastSoldInfo.finalPriceCr.toFixed(2)} cr
              </strong>
            </div>
          </div>
        ) : lotStatus === 'unsold' ? (
          <div className="bg-slate-800/90 rounded-2xl p-4 border border-slate-700 flex items-center justify-between">
            <span className="px-2.5 py-1 rounded bg-slate-900 text-slate-400 font-bold text-xs uppercase tracking-widest">
              UNSOLD
            </span>
            <span className="text-xs text-slate-400 italic">No bids placed</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Announcer Voice Line */}
            <div className="flex items-center justify-between px-1 text-xs">
              <div>
                <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500 block">
                  {currentBidderShort ? 'CURRENT' : 'OPENING'}
                </span>
                <strong className="text-sm font-black font-mono text-amber-300">
                  {currentBidCr.toFixed(2)} cr
                </strong>
              </div>

              <div className="flex items-center gap-1 text-[11px] text-cyan-400 italic max-w-[240px] truncate">
                <span>📢</span>
                <span>{announcerMessage}</span>
              </div>
            </div>

            {/* BID and SKIP Buttons */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={handleUserBid}
                className="col-span-2 py-4 bg-gradient-to-r from-[#eab308] via-[#f5b82e] to-[#eab308] hover:from-[#facc15] hover:to-[#f5b82e] text-black font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-amber-500/25 active:scale-98 transition-all flex items-center justify-center gap-1.5"
              >
                <Gavel className="w-4 h-4 fill-current" />
                BID {((currentBidderShort ? currentBidCr + 0.25 : currentBidCr)).toFixed(2)} cr
              </button>

              <button
                onClick={handleSkipOrFinalize}
                className="py-4 bg-[#111827] hover:bg-slate-800 text-slate-300 font-bold text-xs uppercase tracking-wider rounded-2xl border border-slate-700/80 active:scale-98 transition-all flex items-center justify-center gap-1"
              >
                <FastForward className="w-3.5 h-3.5" />
                SKIP
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* 7. STICKY BOTTOM STATS BAR & SQUAD BUTTON                */}
      {/* ========================================================= */}
      <div className="p-3 border-t border-slate-800/80 bg-[#0c121d]/95 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs font-mono">
          <div>
            <span className="text-[9px] text-slate-500 uppercase block tracking-wider">PURSE</span>
            <strong className="text-amber-400 font-bold">{userPurseRemaining.toFixed(2)} cr</strong>
          </div>
          <div>
            <span className="text-[9px] text-slate-500 uppercase block tracking-wider">SQUAD</span>
            <strong className="text-amber-500 font-bold">{userSquadCount} / 25</strong>
          </div>
          <div>
            <span className="text-[9px] text-slate-500 uppercase block tracking-wider">O/SEAS</span>
            <strong className="text-sky-400 font-bold">{userOverseasCount} / 8</strong>
          </div>
        </div>

        <button
          onClick={() => {
            sound.playTap();
            setIsSquadPlannerOpen(true);
          }}
          className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 active:scale-95 transition-all"
        >
          <Users className="w-3.5 h-3.5 text-slate-400" />
          SQUAD
        </button>
      </div>

      {/* ========================================================= */}
      {/* 8. SET PREVIEW DRAWER (Screenshot_2026_1019_234715_8649eea8.jpg & 234902_51932f0e.jpg) */}
      {/* ========================================================= */}
      {isSetSheetOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Drawer Header with Voice quote */}
            <div className="p-4 border-b border-slate-800">
              <div className="w-12 h-1 bg-slate-700/80 rounded-full mx-auto mb-3" />

              <div className="flex items-start gap-2 text-amber-300 text-xs italic mb-2">
                <span>🎤</span>
                <span>"{currentSetMeta.quote}"</span>
              </div>

              <div className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold uppercase">
                    {soldInCurrentSetCount > 0 ? 'CURRENT' : 'UPCOMING'}
                  </span>
                  <strong className="text-white font-bold">{activeSetId}</strong>
                </div>
                <span className="text-slate-400 font-bold">
                  {remainingInSetCount} / {currentSetPlayers.length} REMAINING
                </span>
              </div>
            </div>

            {/* List of Players in Set */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
              {currentSetPlayers.map(p => {
                const sold = salesRecord[p.id];
                const isCurrentLot = p.id === currentPlayer.id;

                return (
                  <div
                    key={p.id}
                    className={`p-3 rounded-2xl border flex items-center justify-between ${
                      isCurrentLot
                        ? 'bg-amber-950/20 border-amber-500/80 shadow-md'
                        : 'bg-[#121927]/90 border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-200 shrink-0">
                        {p.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white leading-tight">
                          {p.name}
                        </h4>
                        <span className="text-[10px] text-slate-400">
                          {p.specialism.split(' · ')[0]} · {p.countryCode} · age {p.age}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-white">
                        <span className="text-[9px] text-slate-400 mr-1 uppercase">
                          {p.role === 'Bowler' ? 'BWL' : 'BAT'}
                        </span>
                        <span>{Math.max(p.ratings.bat, p.ratings.bowl)}</span>
                      </div>

                      {sold ? (
                        <div className="text-[11px] font-mono font-bold" style={{ color: sold.buyerTeamColor }}>
                          {sold.buyerTeamShort} {sold.finalPriceCr.toFixed(2)} cr
                        </div>
                      ) : (
                        <div className="text-[11px] font-mono font-bold text-amber-300">
                          {p.basePriceCr} cr
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions */}
            <div className="p-4 border-t border-slate-800 grid grid-cols-2 gap-3 bg-[#0c121d]">
              <button
                onClick={() => {
                  sound.playTap();
                  // Skip remaining players in this set and persist sales
                  const nextSales = { ...salesRecord };
                  currentSetPlayers.forEach(pl => {
                    if (!nextSales[pl.id]) {
                      const randomFranchise = INITIAL_AUCTION_CLUBS[Math.floor(Math.random() * INITIAL_AUCTION_CLUBS.length)];
                      const finalPrice = Number((pl.basePriceCr + Math.random() * 4).toFixed(2));
                      nextSales[pl.id] = {
                        playerId: pl.id,
                        buyerTeamShort: randomFranchise.shortName,
                        buyerTeamName: randomFranchise.teamName,
                        buyerTeamColor: randomFranchise.primaryColor,
                        finalPriceCr: finalPrice
                      };
                      commitAuctionSale(pl, randomFranchise.shortName, finalPrice);
                    }
                  });
                  setSalesRecord(nextSales);
                  setIsSetSheetOpen(false);
                  handleNextLot();
                }}
                className="py-3 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs uppercase rounded-xl border border-amber-500/30"
              >
                ⏩ SKIP SET
              </button>

              <button
                onClick={() => {
                  sound.playTap();
                  setIsSetSheetOpen(false);
                }}
                className="py-3 bg-[#f5b82e] hover:bg-amber-300 text-black font-black text-xs uppercase rounded-xl shadow-lg"
              >
                {soldInCurrentSetCount > 0 ? 'CLOSE' : 'BEGIN SET'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 9. SQUAD PLANNER MODAL (Screenshot_2026_1019_234740_51bc6d21.jpg) */}
      {/* ========================================================= */}
      {isSquadPlannerOpen && (
        <div className="fixed inset-0 z-50 bg-[#070b12]/95 backdrop-blur-md text-slate-100 flex flex-col justify-between max-w-5xl mx-auto w-full overflow-hidden animate-in fade-in duration-200 border-x border-slate-800">
          {/* Header */}
          <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-800/80 bg-[#0c121d]/90">
            <button
              onClick={() => setIsSquadPlannerOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-[#3a225d] text-white text-xs font-bold flex items-center justify-center">
                {userTeam.shortName}
              </div>
              <div>
                <h3 className="text-xs font-black font-display uppercase text-white tracking-wider">
                  {userTeam.name}
                </h3>
                <span className="text-[10px] font-mono text-amber-400">
                  PLANNER · AUCTION PAUSED
                </span>
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="p-4 pb-2">
            <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-4">
              <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                <div>
                  <span className="text-[9px] text-slate-500 uppercase block tracking-wider">PURSE</span>
                  <strong className="text-amber-400 font-bold">{userPurseRemaining.toFixed(2)} cr</strong>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 uppercase block tracking-wider">SLOTS</span>
                  <strong className="text-amber-500 font-bold">{userSquadCount} / 25</strong>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 uppercase block tracking-wider">OVERSEAS</span>
                  <strong className="text-sky-400 font-bold">{userOverseasCount} / 8</strong>
                </div>
              </div>

              {userSquadCount < 18 && (
                <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center gap-1.5 text-xs text-amber-300">
                  <span>ⓘ</span>
                  <span>Need {18 - userSquadCount} more players to hit the 18-man floor.</span>
                </div>
              )}
            </div>
          </div>

          {/* Categorized Squad Lists (Live User Squad) */}
          <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-4">
            {[
              { title: 'BATTERS', items: plannerBatters, statLabel: 'BAT' as const },
              { title: 'ALL-ROUNDERS', items: plannerAllRounders, statLabel: 'BAT' as const },
              { title: 'BOWLERS', items: plannerBowlers, statLabel: 'BWL' as const },
              { title: 'WICKET-KEEPERS', items: plannerKeepers, statLabel: 'BAT' as const }
            ].map(group => (
              <div key={group.title}>
                <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block mb-1.5 font-bold">
                  {group.title} · {group.items.length}
                </span>
                <div className="flex flex-col gap-1.5">
                  {group.items.map(p => {
                    const rtg = group.statLabel === 'BWL' ? p.ratings.bowl : p.ratings.bat;
                    const priceVal = p.salaryCr || p.basePriceCr || 2.0;
                    const priceStr = priceVal >= 1 ? `${priceVal.toFixed(priceVal % 1 === 0 ? 0 : 2)} cr` : `${Math.round(priceVal * 100)}L`;
                    return (
                      <div key={p.id} className="p-2.5 rounded-xl bg-[#0f172a] border border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-slate-800 text-xs font-bold flex items-center justify-center text-slate-300">
                            {p.jerseyNumber || 18}
                          </div>
                          <div>
                            <div className="flex items-center gap-1">
                              <h4 className="text-xs font-bold text-white">{p.name}</h4>
                              {p.isOverseas && (
                                <span className="text-[9px] px-1 rounded bg-sky-950 text-sky-400 border border-sky-800 font-bold">
                                  {p.country?.slice(0, 3).toUpperCase() || 'OS'}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400">{p.role} · age {p.age}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-mono font-bold text-emerald-400">{group.statLabel} {rtg}</span>
                          <span className="text-[10px] font-mono text-amber-300 block">{priceStr}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Resume Auction Button */}
          <div className="p-4 border-t border-slate-800 bg-[#0c121d]">
            <button
              onClick={() => {
                sound.playTap();
                setIsSquadPlannerOpen(false);
              }}
              className="w-full py-4 bg-gradient-to-r from-[#eab308] via-[#f5b82e] to-[#eab308] hover:from-[#facc15] hover:to-[#f5b82e] text-black font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 active:scale-98 transition-all"
            >
              <Gavel className="w-4 h-4 fill-current" />
              RESUME AUCTION
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
