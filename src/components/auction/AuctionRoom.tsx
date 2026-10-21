import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  Gavel
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useGame } from '../../context/GameContext';
import { sound } from '../../utils/soundEffects';
import {
  AUCTION_PLAYERS_2026,
  AUCTION_SETS_META,
  AUCTION_SET_SEQUENCE,
  INITIAL_AUCTION_CLUBS,
  AuctionPlayerItem,
  AuctionSetType,
  AiTeamSnapshot,
  resolveAuctionFranchise,
  getNextAuctionBidCr,
  formatAuctionPriceCr,
  canFranchiseBidOnLot,
  evaluateAiCounterBid,
  settleAuctionLotAmongAi
} from '../../data/auctionSets2026';
import { Player } from '../../types/cricket';
import { AuctionSandboxModal } from './AuctionSandboxModal';
import { isOverseasPlayer } from '../../utils/auctionSandboxEngine';

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
    unlockAchievement,
    auctionSandbox,
    exitAuctionSandbox,
    commitSandboxAuctionSale
  } = useGame();

  const isSandbox = Boolean(auctionSandbox?.isActive);
  const [showSandboxConfigModal, setShowSandboxConfigModal] = useState(false);

  const activeFranchiseTeam = useMemo(() => {
    if (isSandbox && auctionSandbox) {
      return auctionSandbox.sandboxTeams.find(t => t.id === auctionSandbox.franchiseId) || userTeam;
    }
    return userTeam;
  }, [isSandbox, auctionSandbox, userTeam]);

  const effectiveTeams = useMemo(() => {
    return isSandbox && auctionSandbox ? auctionSandbox.sandboxTeams : teams;
  }, [isSandbox, auctionSandbox, teams]);

  const effectivePlayers = useMemo(() => {
    return isSandbox && auctionSandbox ? auctionSandbox.sandboxPlayers : players;
  }, [isSandbox, auctionSandbox, players]);

  const userFranchise = useMemo(
    () => resolveAuctionFranchise(activeFranchiseTeam.id) || resolveAuctionFranchise(activeFranchiseTeam.shortName),
    [activeFranchiseTeam.id, activeFranchiseTeam.shortName]
  );
  const userShort = userFranchise?.shortName || activeFranchiseTeam.shortName;

  // -------------------------------------------------------------
  // STATE MANAGEMENT
  // -------------------------------------------------------------
  const allLots = useMemo<AuctionPlayerItem[]>(() => {
    if (isSandbox && auctionSandbox?.sandboxLots && auctionSandbox.sandboxLots.length > 0) {
      return auctionSandbox.sandboxLots;
    }
    return AUCTION_PLAYERS_2026;
  }, [isSandbox, auctionSandbox?.sandboxLots]);

  const [currentLotIndex, setCurrentLotIndex] = useState<number>(0);
  const safeLotIndex = Math.min(currentLotIndex, Math.max(0, allLots.length - 1));
  const currentPlayer = allLots[safeLotIndex] || allLots[0];
  const activeLiveSetId = currentPlayer?.set || 'BA1';

  // Set Sheet Scouting state (which set is being inspected in the preview drawer)
  const [previewSetId, setPreviewSetId] = useState<AuctionSetType>(activeLiveSetId);
  const [isPoolDropdownOpen, setIsPoolDropdownOpen] = useState<boolean>(false);
  const [isSetSheetOpen, setIsSetSheetOpen] = useState<boolean>(false);
  const [isSquadPlannerOpen, setIsSquadPlannerOpen] = useState<boolean>(false);
  const [viewingSquadTeamId, setViewingSquadTeamId] = useState<string>(activeFranchiseTeam.id);

  // Sync viewingSquadTeamId when active franchise changes
  useEffect(() => {
    setViewingSquadTeamId(activeFranchiseTeam.id);
  }, [activeFranchiseTeam.id]);

  // Speed controls: 1x, 2x, 3x, instant
  const [speed, setSpeed] = useState<'1x' | '2x' | '3x' | 'instant'>('1x');
  const [showSpeedMenu, setShowSpeedMenu] = useState<boolean>(false);
  const [isMuted] = useState<boolean>(false);
  const [showHelpBanner, setShowHelpBanner] = useState<boolean>(true);
  const [showAllStats, setShowAllStats] = useState<boolean>(false);
  const [showMoreTeams, setShowMoreTeams] = useState<boolean>(false);

  // Current Lot Bidding States
  const [currentBidCr, setCurrentBidCr] = useState<number>(
    allLots[0]?.basePriceCr ?? 2.0
  );
  const [currentBidderShort, setCurrentBidderShort] = useState<string | null>(null);
  const [bidHistory, setBidHistory] = useState<BidRecord[]>([]);
  const [lotStatus, setLotStatus] = useState<'bidding' | 'sold' | 'unsold'>('bidding');
  const [lastSoldInfo, setLastSoldInfo] = useState<SoldOutcome | null>(null);

  // Overall Sales & Unsold Records { [playerId]: ... }
  const [salesRecord, setSalesRecord] = useState<Record<string, SoldOutcome>>({});
  const [unsoldIds, setUnsoldIds] = useState<Record<string, boolean>>({});

  // Timer Refs to prevent race conditions when skipping or changing lots
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAuctionTimers = useCallback(() => {
    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearAuctionTimers();
  }, [clearAuctionTimers]);

  // Cleanly reset auction state when starting or switching sandbox
  useEffect(() => {
    if (isSandbox) {
      clearAuctionTimers();
      setCurrentLotIndex(0);
      setSalesRecord({});
      setUnsoldIds({});
      setBidHistory([]);
      setLotStatus('bidding');
      setLastSoldInfo(null);
    }
  }, [isSandbox, auctionSandbox?.franchiseId, auctionSandbox?.mode, clearAuctionTimers]);

  // Team Purses mapping synced with global teams state & sandbox
  const [teamPurses, setTeamPurses] = useState<Record<string, number>>(() => {
    if (isSandbox && auctionSandbox?.teamPursesByShort) {
      return { ...auctionSandbox.teamPursesByShort };
    }
    const map: Record<string, number> = {};
    INITIAL_AUCTION_CLUBS.forEach(c => {
      const liveTeam = effectiveTeams.find(
        t => t.id === c.teamId || t.shortName.toUpperCase() === c.shortName.toUpperCase()
      );
      map[c.shortName] =
        liveTeam && liveTeam.purseCr > 0 && liveTeam.purseCr <= 120
          ? liveTeam.purseCr
          : c.purseCr;
    });
    if (activeFranchiseTeam.purseCr > 0 && activeFranchiseTeam.purseCr <= 120) {
      map[userShort] = activeFranchiseTeam.purseCr;
    }
    return map;
  });

  // Sync teamPurses when sandbox state updates
  useEffect(() => {
    if (isSandbox && auctionSandbox?.teamPursesByShort) {
      setTeamPurses({ ...auctionSandbox.teamPursesByShort });
    }
  }, [isSandbox, auctionSandbox?.teamPursesByShort]);

  // Compute live squad & overseas counts for every franchise from effective state
  const franchiseMetricsMap = useMemo(() => {
    const metrics: Record<string, { squadCount: number; overseasCount: number; teamId: string }> = {};
    INITIAL_AUCTION_CLUBS.forEach(c => {
      const liveTeam = effectiveTeams.find(
        t => t.id === c.teamId || t.shortName.toUpperCase() === c.shortName.toUpperCase()
      );
      const tId = liveTeam?.id || c.teamId;
      const clubPlayers = effectivePlayers.filter(p => p.clubId === tId);
      const squadList = clubPlayers.length > 0 ? clubPlayers : (liveTeam?.squad || []);
      const squadCount = isSandbox ? clubPlayers.length : (clubPlayers.length > 0 ? clubPlayers.length : c.keptCount);
      const overseasCount = squadList.filter(p => isOverseasPlayer(p)).length;
      metrics[c.shortName] = {
        squadCount,
        overseasCount,
        teamId: tId
      };
    });
    return metrics;
  }, [effectivePlayers, effectiveTeams, isSandbox]);

  // Helper to commit a completed lot sale into global players & teams state
  const commitAuctionSale = useCallback(
    (lot: AuctionPlayerItem, buyerShort: string, priceCr: number) => {
      if (isSandbox) {
        commitSandboxAuctionSale(lot, buyerShort, priceCr);
        return;
      }

      const clubMeta = resolveAuctionFranchise(buyerShort);
      const winnerTeam = teams.find(
        t =>
          (clubMeta && t.id === clubMeta.teamId) ||
          t.shortName.toUpperCase() === buyerShort.toUpperCase()
      );
      if (!winnerTeam) return;

      const existingPlayer = players.find(
        p => p.id === lot.id || p.name.toLowerCase() === lot.name.toLowerCase()
      );

      const isOverseas = isOverseasPlayer(lot) || isOverseasPlayer(existingPlayer || {});
      const mappedPlayer: Player = existingPlayer
        ? {
            ...existingPlayer,
            name: lot.name,
            age: lot.age,
            country: lot.country,
            isOverseas,
            battingHand: lot.battingHand,
            bowlingArm: lot.bowlingArm || existingPlayer.bowlingArm || 'RAM',
            bowlingStyle: lot.bowlingStyle || existingPlayer.bowlingStyle,
            clubId: winnerTeam.id,
            salaryCr: priceCr,
            basePriceCr: lot.basePriceCr
          }
        : {
            id: lot.id,
            name: lot.name,
            jerseyNumber: lot.jerseyNumber || 45,
            role: lot.role,
            bowlingArm: lot.bowlingArm || 'RAM',
            bowlingStyle: lot.bowlingStyle || undefined,
            battingHand: lot.battingHand || 'RHB',
            age: lot.age,
            country: lot.country,
            clubId: winnerTeam.id,
            isOverseas,
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
              matches: lot.iplMatches ?? 0,
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
            const currentTeamPurse =
              teamPurses[buyerShort] ?? (t.purseCr <= 65 ? t.purseCr : clubMeta?.purseCr ?? 25);
            return {
              ...t,
              purseCr: Math.max(0, Number((currentTeamPurse - priceCr).toFixed(2))),
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
    },
    [players, setPlayers, setTeams, teamPurses, teams]
  );

  // Current Set Metadata
  const currentSetMeta =
    AUCTION_SETS_META.find(s => s.id === activeLiveSetId) || AUCTION_SETS_META[0];
  const previewSetMeta =
    AUCTION_SETS_META.find(s => s.id === previewSetId) || AUCTION_SETS_META[0];

  // Initialize lot strictly when currentLotIndex or active player changes
  useEffect(() => {
    clearAuctionTimers();
    if (!currentPlayer) return;
    const existingSale = salesRecord[currentPlayer.id];
    const existingUnsold = unsoldIds[currentPlayer.id];

    if (existingSale) {
      setCurrentBidCr(existingSale.finalPriceCr);
      setCurrentBidderShort(existingSale.buyerTeamShort);
      setBidHistory([
        {
          teamShort: existingSale.buyerTeamShort,
          teamColor: existingSale.buyerTeamColor,
          amountCr: existingSale.finalPriceCr
        }
      ]);
      setLotStatus('sold');
      setLastSoldInfo(existingSale);
    } else if (existingUnsold) {
      setCurrentBidCr(currentPlayer.basePriceCr);
      setCurrentBidderShort(null);
      setBidHistory([]);
      setLotStatus('unsold');
      setLastSoldInfo(null);
    } else {
      setCurrentBidCr(currentPlayer.basePriceCr);
      setCurrentBidderShort(null);
      setBidHistory([]);
      setLotStatus('bidding');
      setLastSoldInfo(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLotIndex, currentPlayer?.id, clearAuctionTimers]);

  // Keep previewSetId defaulted to activeLiveSetId when drawer is not open
  useEffect(() => {
    if (!isSetSheetOpen) {
      setPreviewSetId(activeLiveSetId);
    }
  }, [activeLiveSetId, isSetSheetOpen]);

  // -------------------------------------------------------------
  // AUCTION SOUND & AI BIDDING SPEED
  // -------------------------------------------------------------
  const aiDelayMs =
    speed === 'instant' ? 90 : speed === '3x' ? 220 : speed === '2x' ? 450 : 850;

  // Build AI team snapshots for eligibility checks
  const buildAiSnapshots = useCallback(
    (pursesOverride?: Record<string, number>): AiTeamSnapshot[] => {
      const activePurses = pursesOverride || teamPurses;
      return INITIAL_AUCTION_CLUBS.map(c => {
        const m = franchiseMetricsMap[c.shortName] || {
          squadCount: c.keptCount,
          overseasCount: 4,
          teamId: c.teamId
        };
        return {
          shortName: c.shortName,
          teamName: c.teamName,
          primaryColor: c.primaryColor,
          purseCr: activePurses[c.shortName] ?? c.purseCr,
          squadCount: m.squadCount,
          overseasCount: m.overseasCount
        };
      });
    },
    [franchiseMetricsMap, teamPurses]
  );

  // User Squad numbers dynamically computed from live effective state (retained players + bought players)
  const liveUserSquad = useMemo(
    () => effectivePlayers.filter(p => p.clubId === activeFranchiseTeam.id),
    [effectivePlayers, activeFranchiseTeam.id]
  );
  const userPurseRemaining =
    teamPurses[userShort] ??
    (activeFranchiseTeam.purseCr <= 120 ? activeFranchiseTeam.purseCr : userFranchise?.purseCr ?? 28.65);
  const userSquadCount = liveUserSquad.length;
  const userOverseasCount = liveUserSquad.filter(p => isOverseasPlayer(p)).length;

  // Next bid amount calculation using official IPL increments
  const nextBidAmountCr = useMemo(
    () => getNextAuctionBidCr(currentBidCr, currentBidderShort !== null),
    [currentBidCr, currentBidderShort]
  );

  // Canonical eligibility check for User Bid button
  const userBidEligibility = useMemo(
    () =>
      canFranchiseBidOnLot({
        franchiseShort: userShort,
        currentBidderShort,
        lotStatus,
        nextBidCr: nextBidAmountCr,
        purseCr: userPurseRemaining,
        squadCount: userSquadCount,
        overseasCount: userOverseasCount,
        isOverseasLot: isOverseasPlayer(currentPlayer)
      }),
    [
      userShort,
      currentBidderShort,
      lotStatus,
      nextBidAmountCr,
      userPurseRemaining,
      userSquadCount,
      userOverseasCount,
      currentPlayer
    ]
  );

  // AI Counter-Bid Response after User Bid
  const triggerAiResponse = useCallback(
    (newAmount: number, bidderShort: string) => {
      clearAuctionTimers();
      aiTimerRef.current = setTimeout(() => {
        const counter = evaluateAiCounterBid({
          lot: currentPlayer,
          currentBidCr: newAmount,
          currentBidderShort: bidderShort,
          userTeamShort: userShort,
          aiTeams: buildAiSnapshots()
        });
        if (!counter) return;

        if (!isMuted) sound.playGavel();

        setCurrentBidCr(counter.amountCr);
        setCurrentBidderShort(counter.teamShort);
        setBidHistory(prev => [
          ...prev,
          {
            teamShort: counter.teamShort,
            teamColor: counter.teamColor,
            amountCr: counter.amountCr
          }
        ]);
      }, aiDelayMs);
    },
    [aiDelayMs, buildAiSnapshots, clearAuctionTimers, currentPlayer, isMuted, userShort]
  );

  // Place User Bid
  const handleUserBid = () => {
    if (!userBidEligibility.allowed) {
      sound.playTap();
      return;
    }

    if (!isMuted) sound.playGavel();

    const bidAmount = nextBidAmountCr;
    setCurrentBidCr(bidAmount);
    setCurrentBidderShort(userShort);
    setBidHistory(prev => [
      ...prev,
      {
        teamShort: userShort,
        teamColor: userFranchise?.primaryColor || '#f5b82e',
        amountCr: bidAmount
      }
    ]);

    triggerAiResponse(bidAmount, userShort);
  };

  const handleNextLot = useCallback(() => {
    clearAuctionTimers();
    sound.playTap();
    setCurrentLotIndex(prev => {
      if (prev < allLots.length - 1) {
        return prev + 1;
      } else {
        setIsSquadPlannerOpen(true);
        return prev;
      }
    });
  }, [allLots.length, clearAuctionTimers]);

  // Finalize Lot (HAMMER / PASS / SETTLE)
  const handleSkipOrFinalize = () => {
    if (lotStatus !== 'bidding') {
      handleNextLot();
      return;
    }
    clearAuctionTimers();
    if (!isMuted) sound.playGavel();

    // Case 1: User already holds the leading bid -> Hammer down & sell to user
    if (currentBidderShort === userShort) {
      const winnerName = userFranchise?.teamName || activeFranchiseTeam.name;
      const winnerColor = userFranchise?.primaryColor || activeFranchiseTeam.primaryColor || '#f5b82e';
      const finalPrice = currentBidCr;

      const outcome: SoldOutcome = {
        playerId: currentPlayer.id,
        buyerTeamShort: userShort,
        buyerTeamName: winnerName,
        buyerTeamColor: winnerColor,
        finalPriceCr: finalPrice
      };

      setSalesRecord(prev => ({ ...prev, [currentPlayer.id]: outcome }));
      setLastSoldInfo(outcome);
      setLotStatus('sold');

      setTeamPurses(prev => ({
        ...prev,
        [userShort]: Math.max(0, Number(((prev[userShort] ?? userPurseRemaining) - finalPrice).toFixed(2)))
      }));
      commitAuctionSale(currentPlayer, userShort, finalPrice);

      if (!isMuted) sound.playCrowdCheer(1.0);
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
      unlockAchievement('ach_3');
      if (finalPrice >= 15) unlockAchievement('ach_32');

      advanceTimerRef.current = setTimeout(() => {
        handleNextLot();
      }, speed === 'instant' ? 500 : 1500);
      return;
    }

    // Case 2: User passes / drops out -> Settle lot among eligible AI franchises
    const settlement = settleAuctionLotAmongAi({
      lot: currentPlayer,
      startingBidCr: currentBidCr,
      startingBidderShort: currentBidderShort,
      userTeamShort: userShort,
      aiTeams: buildAiSnapshots()
    });

    if (settlement.status === 'sold' && settlement.buyerTeamShort && settlement.finalPriceCr) {
      const outcome: SoldOutcome = {
        playerId: currentPlayer.id,
        buyerTeamShort: settlement.buyerTeamShort,
        buyerTeamName: settlement.buyerTeamName || `${settlement.buyerTeamShort} Franchise`,
        buyerTeamColor: settlement.buyerTeamColor || '#0057b8',
        finalPriceCr: settlement.finalPriceCr
      };

      if (settlement.bids.length > 0) {
        setBidHistory(prev => [...prev, ...settlement.bids]);
      }
      setCurrentBidCr(settlement.finalPriceCr);
      setCurrentBidderShort(settlement.buyerTeamShort);
      setSalesRecord(prev => ({ ...prev, [currentPlayer.id]: outcome }));
      setLastSoldInfo(outcome);
      setLotStatus('sold');

      const buyerShort = settlement.buyerTeamShort;
      const finalPrice = settlement.finalPriceCr;
      setTeamPurses(prev => ({
        ...prev,
        [buyerShort]: Math.max(0, Number(((prev[buyerShort] || 0) - finalPrice).toFixed(2)))
      }));
      commitAuctionSale(currentPlayer, buyerShort, finalPrice);

      advanceTimerRef.current = setTimeout(() => {
        handleNextLot();
      }, speed === 'instant' ? 500 : 1400);
    } else {
      setUnsoldIds(prev => ({ ...prev, [currentPlayer.id]: true }));
      setLotStatus('unsold');
      advanceTimerRef.current = setTimeout(() => {
        handleNextLot();
      }, speed === 'instant' ? 450 : 1100);
    }
  };

  // Open Set Sheet Drawer to scout a set (does NOT jump active bidding lot out of sequence)
  const handleOpenSetScout = (setId: AuctionSetType) => {
    sound.playTap();
    setPreviewSetId(setId);
    setIsPoolDropdownOpen(false);
    setIsSetSheetOpen(true);
  };

  // Skip remaining lots in current set (simulates AI-only bidding, respects purses/quotas, advances to next set)
  const handleSkipCurrentSet = () => {
    clearAuctionTimers();
    sound.playTap();

    const nextSales: Record<string, SoldOutcome> = { ...salesRecord };
    const nextUnsold: Record<string, boolean> = { ...unsoldIds };
    const runningPurses: Record<string, number> = { ...teamPurses };
    const runningMetrics: Record<string, { squadCount: number; overseasCount: number }> = {};

    INITIAL_AUCTION_CLUBS.forEach(c => {
      const m = franchiseMetricsMap[c.shortName] || {
        squadCount: c.keptCount,
        overseasCount: 4
      };
      runningMetrics[c.shortName] = {
        squadCount: m.squadCount,
        overseasCount: m.overseasCount
      };
    });

    const currentSetLots = allLots.filter(p => p.set === activeLiveSetId);
    currentSetLots.forEach(pl => {
      if (nextSales[pl.id] || nextUnsold[pl.id]) return;

      const aiSnapshots: AiTeamSnapshot[] = INITIAL_AUCTION_CLUBS.map(c => ({
        shortName: c.shortName,
        teamName: c.teamName,
        primaryColor: c.primaryColor,
        purseCr: runningPurses[c.shortName] ?? c.purseCr,
        squadCount: runningMetrics[c.shortName]?.squadCount ?? c.keptCount,
        overseasCount: runningMetrics[c.shortName]?.overseasCount ?? 4
      }));

      const res = settleAuctionLotAmongAi({
        lot: pl,
        startingBidCr: pl.basePriceCr,
        startingBidderShort: null,
        userTeamShort: userShort,
        aiTeams: aiSnapshots
      });

      if (res.status === 'sold' && res.buyerTeamShort && res.finalPriceCr) {
        const winnerShort = res.buyerTeamShort;
        const price = res.finalPriceCr;
        nextSales[pl.id] = {
          playerId: pl.id,
          buyerTeamShort: winnerShort,
          buyerTeamName: res.buyerTeamName || winnerShort,
          buyerTeamColor: res.buyerTeamColor || '#0057b8',
          finalPriceCr: price
        };
        runningPurses[winnerShort] = Math.max(
          0,
          Number(((runningPurses[winnerShort] ?? 0) - price).toFixed(2))
        );
        if (runningMetrics[winnerShort]) {
          runningMetrics[winnerShort].squadCount += 1;
          if (isOverseasPlayer(pl)) {
            runningMetrics[winnerShort].overseasCount += 1;
          }
        }
        commitAuctionSale(pl, winnerShort, price);
      } else {
        nextUnsold[pl.id] = true;
      }
    });

    setSalesRecord(nextSales);
    setUnsoldIds(nextUnsold);
    setTeamPurses(runningPurses);
    setIsSetSheetOpen(false);

    // Advance to the first lot of the NEXT set in AUCTION_SET_SEQUENCE
    const curSetSeqIdx = AUCTION_SET_SEQUENCE.indexOf(activeLiveSetId);
    if (curSetSeqIdx !== -1 && curSetSeqIdx < AUCTION_SET_SEQUENCE.length - 1) {
      const nextSetId = AUCTION_SET_SEQUENCE[curSetSeqIdx + 1];
      const nextSetFirstLotIdx = allLots.findIndex(p => p.set === nextSetId);
      if (nextSetFirstLotIdx !== -1) {
        setPreviewSetId(nextSetId);
        setCurrentLotIndex(nextSetFirstLotIdx);
        return;
      }
    }
    setIsSquadPlannerOpen(true);
  };

  // Compute set counts for preview drawer
  const previewSetPlayers = useMemo(() => {
    return allLots.filter(p => p.set === previewSetId);
  }, [allLots, previewSetId]);

  const resolvedInPreviewSetCount = previewSetPlayers.filter(
    p => salesRecord[p.id] || unsoldIds[p.id]
  ).length;
  const remainingInPreviewSetCount = previewSetPlayers.length - resolvedInPreviewSetCount;

  // Compute set counts for currently active live set on stage
  const liveSetPlayers = useMemo(() => {
    return allLots.filter(p => p.set === activeLiveSetId);
  }, [allLots, activeLiveSetId]);
  const resolvedInLiveSetCount = liveSetPlayers.filter(
    p => salesRecord[p.id] || unsoldIds[p.id]
  ).length;
  const remainingInLiveSetCount = liveSetPlayers.length - resolvedInLiveSetCount;

  // Formatted attribute stats for current player
  const statsKey = currentPlayer.statsKey || {
    stat1Label: 'BAT',
    stat1Val: currentPlayer.ratings?.bat || 70,
    stat2Label: 'POW',
    stat2Val: currentPlayer.ratings?.pow || 70,
    stat3Label: 'BOWL',
    stat3Val: currentPlayer.ratings?.bowl || 60,
    stat4Label: 'DTH',
    stat4Val: currentPlayer.ratings?.dth || 65
  };

  // Announcer text
  const announcerMessage = currentBidderShort
    ? `${currentBidderShort} leads the bidding at ${formatAuctionPriceCr(currentBidCr)}!`
    : `Opening reserve price: ${formatAuctionPriceCr(currentPlayer.basePriceCr)}`;

  // Viewing Squad dynamically computed for selected franchise (active user team or any other team selected)
  const selectedViewingTeam = useMemo(() => {
    return (
      effectiveTeams.find(
        t => t.id === viewingSquadTeamId || t.shortName.toUpperCase() === viewingSquadTeamId.toUpperCase()
      ) || activeFranchiseTeam
    );
  }, [effectiveTeams, viewingSquadTeamId, activeFranchiseTeam]);

  const viewingTeamClubMeta = useMemo(() => {
    return (
      resolveAuctionFranchise(selectedViewingTeam.id) ||
      resolveAuctionFranchise(selectedViewingTeam.shortName) ||
      INITIAL_AUCTION_CLUBS.find(
        c => c.teamId === selectedViewingTeam.id || c.shortName === selectedViewingTeam.shortName
      )
    );
  }, [selectedViewingTeam]);

  const viewingTeamShort = viewingTeamClubMeta?.shortName || selectedViewingTeam.shortName;
  const isViewingUserTeam = viewingTeamShort === userShort;

  const viewingTeamSquad = useMemo(() => {
    return effectivePlayers.filter(
      p => p.clubId === selectedViewingTeam.id || (p.clubId && viewingTeamClubMeta?.aliases?.includes(p.clubId))
    );
  }, [effectivePlayers, selectedViewingTeam.id, viewingTeamClubMeta]);

  const viewingTeamPurseRemaining = useMemo(() => {
    return (
      teamPurses[viewingTeamShort] ??
      (selectedViewingTeam.purseCr <= 120 ? selectedViewingTeam.purseCr : viewingTeamClubMeta?.purseCr ?? 25.0)
    );
  }, [teamPurses, viewingTeamShort, selectedViewingTeam.purseCr, viewingTeamClubMeta?.purseCr]);

  const viewingSquadCount = viewingTeamSquad.length;
  const viewingOverseasCount = viewingTeamSquad.filter(p => p.isOverseas).length;

  const viewingBatters = useMemo(
    () =>
      viewingTeamSquad.filter(
        p => p.role === 'Top-order' || p.role === 'Middle-order' || p.role === 'Batter' || p.role === 'Batsman'
      ),
    [viewingTeamSquad]
  );
  const viewingAllRounders = useMemo(
    () => viewingTeamSquad.filter(p => p.role === 'All-rounder' || p.role === 'All-Rounder'),
    [viewingTeamSquad]
  );
  const viewingBowlers = useMemo(
    () => viewingTeamSquad.filter(p => p.role === 'Pace' || p.role === 'Spin' || p.role === 'Bowler'),
    [viewingTeamSquad]
  );
  const viewingKeepers = useMemo(
    () => viewingTeamSquad.filter(p => p.role === 'Wk-bat' || p.role === 'Wicketkeeper'),
    [viewingTeamSquad]
  );

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col justify-between max-w-5xl mx-auto w-full relative overflow-hidden select-none border-x border-slate-800/60">
      {/* ========================================================= */}
      {/* 1. TOP BAR                                                */}
      {/* ========================================================= */}
      <div className="px-4 sm:px-6 py-3 flex items-center justify-between border-b border-slate-800/80 bg-[#0d131f]/95 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              clearAuctionTimers();
              sound.playTap();
              if (isSandbox) {
                exitAuctionSandbox();
              } else {
                setActiveTab('hub');
              }
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
            title={isSandbox ? "Exit Sandbox to Title Screen" : "Back to Career Dashboard"}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div>
            <span className="text-[10px] font-mono text-slate-400 block tracking-widest uppercase">
              LOT {currentPlayer.listSrNo} / {allLots.length} · {currentSetMeta.categoryLabel}
            </span>

            {/* Set Dropdown Trigger */}
            <button
              onClick={() => {
                sound.playTap();
                setIsPoolDropdownOpen(!isPoolDropdownOpen);
              }}
              className="flex items-center gap-1.5 text-[11px] font-black font-mono text-amber-300 uppercase tracking-wider py-0.5 px-2.5 rounded-lg bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 transition-all mt-0.5"
            >
              <span>{currentSetMeta.name}</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Top Right Controls: Autosaved / Sandbox Mode, Speed, Menu */}
        <div className="flex items-center gap-2 relative">
          {isSandbox ? (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold shadow-sm">
                <span>LAB</span>
                <span>·</span>
                <span className="uppercase">{auctionSandbox?.mode}</span>
                <span>·</span>
                <span>{userShort}</span>
              </span>
              <button
                onClick={() => {
                  sound.playTap();
                  setShowSandboxConfigModal(true);
                }}
                className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono font-bold border border-slate-700 hover:text-white"
                title="Reconfigure Sandbox"
              >
                SETUP
              </button>
              <button
                onClick={() => {
                  sound.playTap();
                  exitAuctionSandbox();
                }}
                className="px-2 py-0.5 rounded-lg bg-red-950/70 hover:bg-red-900 text-red-300 text-[10px] font-mono font-bold border border-red-800/60 hover:text-white"
                title="Exit Sandbox without altering career saves"
              >
                EXIT
              </button>
            </div>
          ) : (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 text-[10px] font-mono font-bold">
              <Check className="w-3 h-3" />
              AUTOSAVED
            </span>
          )}

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

          {/* Set Sheet Trigger */}
          <button
            onClick={() => {
              sound.playTap();
              setPreviewSetId(activeLiveSetId);
              setIsSetSheetOpen(true);
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
            title="View Active Set Lots"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. AUCTION POOLS DROPDOWN (ALL 42 OFFICIAL PDF SETS)      */}
      {/* ========================================================= */}
      {isPoolDropdownOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-start justify-center pt-14 p-4">
          <div className="w-full max-w-md max-h-[80vh] bg-[#121927] border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-3 border-b border-slate-800 bg-[#0f1522] flex items-center justify-between shrink-0">
              <div>
                <span className="text-xs font-black font-mono uppercase tracking-widest text-slate-200 block">
                  TATA IPL 2026 AUCTION SETS (42 SETS · 350 LOTS)
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  Sequential Order · Tap any set to scout upcoming lots
                </span>
              </div>
              <button
                onClick={() => setIsPoolDropdownOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto py-1 flex-1">
              {AUCTION_SETS_META.map(setMeta => {
                const isLive = setMeta.id === activeLiveSetId;
                const setLots = allLots.filter(p => p.set === setMeta.id);
                const resolvedCnt = setLots.filter(p => salesRecord[p.id] || unsoldIds[p.id]).length;
                const isCompleted = setLots.length > 0 && resolvedCnt === setLots.length;

                return (
                  <button
                    key={setMeta.id}
                    onClick={() => handleOpenSetScout(setMeta.id)}
                    className={`w-full px-4 py-2.5 flex items-center justify-between text-left transition-all border-b border-slate-800/40 last:border-none ${
                      isLive ? 'bg-amber-500/10 hover:bg-amber-500/20' : 'hover:bg-slate-800/60'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs font-black font-mono uppercase tracking-wider block ${
                            isLive ? 'text-amber-400' : isCompleted ? 'text-slate-400' : 'text-slate-200'
                          }`}
                        >
                          {setMeta.name}
                        </span>
                        {isLive && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        {setMeta.categoryLabel} · {setLots.length} lots ({resolvedCnt}/{setLots.length} done)
                      </span>
                    </div>
                    {isLive ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 font-bold">
                        LIVE NOW
                      </span>
                    ) : isCompleted ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 font-semibold">
                        DONE ✓
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900/60 text-slate-400 border border-slate-800/80">
                        SCOUT 🔒
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
              <span>Official IPL 2026 Auction Rules</span>
            </div>
            <button
              onClick={() => {
                sound.playTap();
                setShowHelpBanner(false);
              }}
              className="px-3 py-1 rounded-xl bg-[#f5b82e] hover:bg-amber-300 text-black text-[10px] font-black uppercase tracking-wider shadow-md"
            >
              GOT IT
            </button>
          </div>
          <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
            Tap BID to open at reserve price or raise, or tap PASS / HAMMER to settle the lot. Squads are capped at 25 players (max 8 overseas).
          </p>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. MAIN PLAYER SHOWCASE CARD                              */}
      {/* ========================================================= */}
      <div className="px-4 py-2 flex-1 flex flex-col justify-between overflow-y-auto">
        <div className="bg-[#0f172a]/95 rounded-2xl border border-slate-800/90 p-4 shadow-xl relative">
          {/* Top Badges: Set + Capped/Uncapped + Country */}
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[10px] font-black font-mono uppercase tracking-wider">
                SET {currentPlayer.setNumber} · {currentPlayer.set}
              </span>
              <span
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono uppercase border ${
                  currentPlayer.cappedStatus === 'Capped'
                    ? 'bg-emerald-950/60 border-emerald-700/50 text-emerald-300'
                    : 'bg-sky-950/60 border-sky-700/50 text-sky-300'
                }`}
              >
                {currentPlayer.cappedStatus}
              </span>
              {currentPlayer.isOverseas && (
                <span className="px-2 py-0.5 rounded-lg bg-purple-950/60 border border-purple-700/50 text-purple-300 text-[10px] font-mono font-bold uppercase">
                  OVERSEAS
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs font-mono font-bold text-slate-200">
              <span>{currentPlayer.countryFlag}</span>
              <span>{currentPlayer.country}</span>
              {currentPlayer.stateAssociation && (
                <span className="text-slate-400">· {currentPlayer.stateAssociation}</span>
              )}
            </div>
          </div>

          {/* Big Circular Avatar with Initial & #Lot Badge */}
          <div className="flex flex-col items-center justify-center my-1 relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#0284c7] to-[#38bdf8] border-2 border-sky-400/50 flex items-center justify-center text-3xl font-black font-display text-white shadow-2xl relative">
              {currentPlayer.firstName.charAt(0)}
              {currentPlayer.surname.charAt(0)}

              {/* Lot Sr. No. Badge */}
              <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full bg-amber-500 text-black font-mono font-black text-[10px] border-2 border-[#0f172a] shadow-md">
                #{currentPlayer.listSrNo}
              </div>
            </div>

            <h3 className="text-lg sm:text-xl font-black font-display uppercase tracking-wider text-white mt-2.5 text-center flex items-center justify-center gap-2">
              <span>{currentPlayer.name}</span>
              {isOverseasPlayer(currentPlayer) && <span title="Overseas Player">✈️</span>}
            </h3>
            <p className="text-xs text-slate-300 font-medium mt-0.5 text-center">
              {currentPlayer.pdfSpecialism} · {currentPlayer.battingHand}
              {currentPlayer.bowlingStyle ? ` · ${currentPlayer.bowlingStyle}` : ''} · Age {currentPlayer.age}
            </p>

            {/* Factual PDF Bio & Caps Strip */}
            <div className="flex items-center justify-center gap-2 flex-wrap mt-1.5 text-[10px] font-mono text-slate-400">
              {currentPlayer.dob && <span>DOB: {currentPlayer.dob}</span>}
              {currentPlayer.previousIplTeam && (
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300">
                  2025: {currentPlayer.previousIplTeam}
                  {currentPlayer.ipl2025Matches !== null ? ` (${currentPlayer.ipl2025Matches}m)` : ''}
                </span>
              )}
              {currentPlayer.iplMatches !== null && (
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200">
                  IPL: {currentPlayer.iplMatches}m
                </span>
              )}
              {currentPlayer.testCaps !== null && <span>Test: {currentPlayer.testCaps}</span>}
              {currentPlayer.odiCaps !== null && <span>ODI: {currentPlayer.odiCaps}</span>}
              {currentPlayer.t20Caps !== null && <span>T20I: {currentPlayer.t20Caps}</span>}
            </div>
          </div>

          {/* 4 Attribute Progress Bars */}
          <div className="grid grid-cols-4 gap-2 my-3">
            {[
              { label: statsKey.stat1Label, val: statsKey.stat1Val },
              { label: statsKey.stat2Label, val: statsKey.stat2Val },
              { label: statsKey.stat3Label, val: statsKey.stat3Val },
              { label: statsKey.stat4Label, val: statsKey.stat4Val }
            ].map((st, idx) => (
              <div key={idx}>
                <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                  <span className="text-slate-400">{st.label}</span>
                  <strong className={st.val >= 75 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                    {st.val}
                  </strong>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${st.val >= 75 ? 'bg-emerald-400' : 'bg-amber-400'}`}
                    style={{ width: `${Math.min(100, st.val)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Tap for all stats toggle */}
          <button
            onClick={() => {
              sound.playTap();
              setShowAllStats(!showAllStats);
            }}
            className="w-full text-center text-[10px] font-mono text-slate-400 hover:text-slate-200 uppercase tracking-widest flex items-center justify-center gap-1 py-1"
          >
            TAP FOR SOURCE & GAMEPLAY DETAILS
            {showAllStats ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showAllStats && (
            <div className="mt-2 pt-2 border-t border-slate-800 grid grid-cols-3 gap-2 text-[10px] font-mono animate-in fade-in duration-150">
              <div className="bg-[#121927] p-2 rounded-lg">
                <span className="text-slate-500 block">RESERVE PRICE</span>
                <strong className="text-amber-300 text-xs">
                  ₹{currentPlayer.reservePriceLakh}L ({currentPlayer.basePriceCr.toFixed(2)} cr)
                </strong>
              </div>
              <div className="bg-[#121927] p-2 rounded-lg">
                <span className="text-slate-500 block">BOWLING STYLE</span>
                <strong className="text-white text-xs">
                  {currentPlayer.bowlingStyle || 'Not listed'}
                </strong>
              </div>
              <div className="bg-[#121927] p-2 rounded-lg">
                <span className="text-slate-500 block">FIELD / TEMP / EXP</span>
                <strong className="text-white text-xs">
                  {currentPlayer.ratings.fld || 80} / {currentPlayer.ratings.tmp || 78} / {currentPlayer.ratings.exp || 75}
                </strong>
              </div>
            </div>
          )}

          {/* Bid History Carousel Pills */}
          <div className="mt-3 bg-[#111827] rounded-xl border border-slate-800 p-2 overflow-x-auto flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700/60 shrink-0">
              <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">
                RESERVE
              </span>
              <strong className="text-xs font-mono font-bold text-white">
                {formatAuctionPriceCr(currentPlayer.basePriceCr)}
              </strong>
            </div>

            {bidHistory.length === 0 ? (
              <span className="text-xs text-slate-500 italic px-2">No bids placed yet</span>
            ) : (
              bidHistory.map((bid, bIdx) => (
                <div
                  key={bIdx}
                  className="px-3 py-1.5 rounded-lg bg-[#141d30] border border-cyan-500/40 shrink-0 flex items-center gap-1.5 animate-in slide-in-from-right-3 duration-150"
                >
                  <span
                    className="text-[10px] font-black font-display text-white px-1.5 py-0.5 rounded"
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
        {/* 5. TEAM PURSES GRID                                     */}
        {/* ======================================================= */}
        <div className="my-2">
          <div className="flex items-center justify-between px-1 mb-1.5">
            <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <span>FRANCHISE PURSES</span>
              <span className="text-[9px] text-amber-400/90 font-normal">· TAP ANY TEAM TO VIEW SQUAD</span>
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {INITIAL_AUCTION_CLUBS.slice(0, showMoreTeams ? 10 : 5).map(c => {
              const isUser = c.shortName === userShort;
              const isCurrentLead = currentBidderShort === c.shortName;
              const purse = teamPurses[c.shortName] ?? c.purseCr;
              const metric = franchiseMetricsMap[c.shortName];
              const squadCount = metric?.squadCount ?? c.keptCount;

              return (
                <button
                  type="button"
                  key={c.teamId}
                  onClick={() => {
                    sound.playTap();
                    setViewingSquadTeamId(c.teamId);
                    setIsSquadPlannerOpen(true);
                  }}
                  className={`p-2 rounded-xl border flex flex-col items-center justify-center text-center transition-all cursor-pointer hover:scale-[1.02] active:scale-95 group ${
                    isCurrentLead
                      ? 'bg-cyan-950/40 border-cyan-400 shadow-md shadow-cyan-500/20'
                      : isUser
                      ? 'bg-amber-950/30 border-amber-500/70 hover:border-amber-400'
                      : 'bg-[#0f172a]/90 border-slate-800 hover:border-slate-700 hover:bg-[#131c31]'
                  }`}
                  title={`Tap to view ${c.teamName} squad & retentions`}
                >
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-xs text-white mb-1 shrink-0 shadow-sm"
                    style={{ backgroundColor: c.primaryColor }}
                  >
                    {c.logo}
                  </div>
                  <span className="text-[9px] font-mono text-slate-400 font-bold group-hover:text-white">
                    {c.shortName}
                  </span>
                  <span className="text-[9px] font-mono font-black text-white truncate max-w-full">
                    {purse.toFixed(2)} cr
                  </span>
                  <span className="text-[8px] font-mono text-slate-500 group-hover:text-amber-400 transition-colors">
                    {squadCount}/25
                  </span>
                </button>
              );
            })}
          </div>

          <div className="text-center mt-1">
            <button
              onClick={() => {
                sound.playTap();
                setShowMoreTeams(!showMoreTeams);
              }}
              className="text-[10px] font-mono text-slate-400 hover:text-white uppercase tracking-widest flex items-center justify-center gap-1 mx-auto"
            >
              {showMoreTeams ? 'LESS ˄' : 'ALL 10 TEAMS ˅'}
            </button>
          </div>
        </div>

        {/* ======================================================= */}
        {/* 6. OUTCOME BANNERS OR BID CONTROLS                      */}
        {/* ======================================================= */}
        {lotStatus === 'sold' && lastSoldInfo ? (
          <div className="flex flex-col gap-2 animate-in zoom-in-95 duration-200">
            <div
              onClick={handleNextLot}
              className="rounded-2xl p-4 shadow-2xl flex items-center justify-between cursor-pointer hover:brightness-105 active:scale-99 transition-all border border-white/20"
              style={{ backgroundColor: lastSoldInfo.buyerTeamColor }}
              title="Click to advance to next lot immediately"
            >
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded bg-black/50 text-white font-black text-xs uppercase tracking-widest -rotate-6 border border-white/30 shadow-md">
                  SOLD
                </span>
                <div>
                  <h4 className="text-sm font-black font-display text-white uppercase tracking-wider">
                    {currentPlayer.name}
                  </h4>
                  <p className="text-[11px] font-medium text-white/90">
                    TO {lastSoldInfo.buyerTeamName.toUpperCase()} ({lastSoldInfo.buyerTeamShort})
                  </p>
                </div>
              </div>

              <div className="text-right flex items-center gap-3">
                <div>
                  <span className="text-[9px] font-mono text-white/70 uppercase block tracking-wider">
                    FINAL
                  </span>
                  <strong className="text-base font-black font-mono text-white">
                    {lastSoldInfo.finalPriceCr.toFixed(2)} cr
                  </strong>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNextLot();
                  }}
                  className="px-3.5 py-2.5 rounded-xl bg-black/60 hover:bg-black/80 text-white text-xs font-mono font-bold uppercase tracking-wider border border-white/30 flex items-center gap-1.5 shadow-lg active:scale-95 transition-all"
                >
                  <span>NEXT</span>
                  <FastForward className="w-3.5 h-3.5 text-amber-300" />
                </button>
              </div>
            </div>
          </div>
        ) : lotStatus === 'unsold' ? (
          <div className="flex flex-col gap-2 animate-in zoom-in-95 duration-200">
            <div
              onClick={handleNextLot}
              className="bg-slate-800/90 rounded-2xl p-4 border border-slate-700 flex items-center justify-between cursor-pointer hover:bg-slate-800 transition-all"
              title="Click to advance to next lot immediately"
            >
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded bg-slate-900 text-slate-400 font-bold text-xs uppercase tracking-widest">
                  UNSOLD
                </span>
                <span className="text-xs text-slate-300 italic">
                  {currentPlayer.name} goes unsold at {formatAuctionPriceCr(currentPlayer.basePriceCr)}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleNextLot();
                }}
                className="px-3.5 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-mono font-bold uppercase tracking-wider border border-slate-600 flex items-center gap-1.5 shadow active:scale-95 transition-all"
              >
                <span>NEXT</span>
                <FastForward className="w-3.5 h-3.5 text-amber-300" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Announcer Voice Line */}
            <div className="flex items-center justify-between px-1 text-xs">
              <div>
                <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500 block">
                  {currentBidderShort ? 'CURRENT BID' : 'RESERVE PRICE'}
                </span>
                <strong className="text-sm font-black font-mono text-amber-300">
                  {formatAuctionPriceCr(currentBidCr)}
                </strong>
              </div>

              <div className="flex items-center gap-1 text-[11px] text-cyan-400 italic max-w-[260px] truncate">
                <span>📢</span>
                <span>{announcerMessage}</span>
              </div>
            </div>

            {/* BID and SKIP/HAMMER Buttons */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={handleUserBid}
                disabled={!userBidEligibility.allowed}
                className={`col-span-2 py-4 font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-1.5 transition-all ${
                  userBidEligibility.allowed
                    ? 'bg-gradient-to-r from-[#eab308] via-[#f5b82e] to-[#eab308] hover:from-[#facc15] hover:to-[#f5b82e] text-black shadow-xl shadow-amber-500/25 active:scale-98'
                    : 'bg-slate-800/80 text-slate-500 border border-slate-700/60 cursor-not-allowed'
                }`}
              >
                <Gavel className="w-4 h-4 fill-current" />
                {userBidEligibility.allowed
                  ? `BID ${nextBidAmountCr.toFixed(2)} cr`
                  : `${userBidEligibility.reason} (${nextBidAmountCr.toFixed(2)} cr)`}
              </button>

              <button
                onClick={handleSkipOrFinalize}
                className="py-4 bg-[#111827] hover:bg-slate-800 text-slate-200 font-bold text-xs uppercase tracking-wider rounded-2xl border border-slate-700/80 active:scale-98 transition-all flex items-center justify-center gap-1"
              >
                <FastForward className="w-3.5 h-3.5" />
                {currentBidderShort === userShort ? 'SELL / CLAIM' : 'SKIP'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* 7. STICKY BOTTOM STATS BAR & SQUAD BUTTON                 */}
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
      {/* 8. SET PREVIEW / SCOUTING DRAWER                          */}
      {/* ========================================================= */}
      {isSetSheetOpen && (() => {
        const isViewingLiveSet = previewSetId === activeLiveSetId;
        const setMetaToDisplay = isViewingLiveSet ? currentSetMeta : previewSetMeta;
        const playersToDisplay = isViewingLiveSet ? liveSetPlayers : previewSetPlayers;
        const resolvedCount = isViewingLiveSet ? resolvedInLiveSetCount : resolvedInPreviewSetCount;
        const remainingCount = isViewingLiveSet ? remainingInLiveSetCount : remainingInPreviewSetCount;

        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Drawer Header */}
              <div className="p-4 border-b border-slate-800 bg-[#0d131f]">
                <div className="w-12 h-1 bg-slate-700/80 rounded-full mx-auto mb-3" />

                <div className="flex items-start gap-2 text-amber-300 text-xs italic mb-2">
                  <span>🎤</span>
                  <span>&ldquo;{setMetaToDisplay.quote}&rdquo;</span>
                </div>

                {!isViewingLiveSet && (
                  <div className="mb-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-mono flex items-center gap-2">
                    <span>🔒</span>
                    <span>SCOUTING MODE: Sequential auction order is strictly enforced. Live bidding will unlock when this set is reached on stage.</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded font-bold uppercase ${
                        isViewingLiveSet
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {isViewingLiveSet ? 'LIVE ON STAGE' : 'SCOUTING PREVIEW'}
                    </span>
                    <strong className="text-white font-bold">
                      {setMetaToDisplay.name} · {setMetaToDisplay.categoryLabel}
                    </strong>
                  </div>
                  <span className="text-slate-400 font-bold">
                    {remainingCount} / {playersToDisplay.length} REMAINING
                  </span>
                </div>
              </div>

              {/* List of Players in Set */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
                {playersToDisplay.map(p => {
                  const sold = salesRecord[p.id];
                  const isUnsold = unsoldIds[p.id];
                  const isCurrentLot = isViewingLiveSet && p.id === currentPlayer.id;

                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        if (isCurrentLot) {
                          sound.playTap();
                          setIsSetSheetOpen(false);
                        }
                      }}
                      className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${
                        isCurrentLot
                          ? 'bg-amber-950/30 border-amber-500/80 shadow-md cursor-pointer ring-1 ring-amber-400/50'
                          : 'bg-[#121927]/90 border-slate-800/80'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-[11px] font-mono font-bold text-slate-200 shrink-0">
                          #{p.listSrNo}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-xs font-bold text-white leading-tight flex items-center gap-1">
                              <span>{p.name}</span>
                              {isOverseasPlayer(p) && <span title="Overseas Player">✈️</span>}
                            </h4>
                            {isCurrentLot && (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-700 text-[9px] font-mono font-bold">
                                ON STAGE NOW
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {p.pdfSpecialism} · {p.countryCode} · Age {p.age} · {p.cappedStatus}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-white">
                          <span className="text-[9px] text-slate-400 mr-1 uppercase">
                            {p.pdfSpecialism === 'BOWLER' ? 'BWL' : 'BAT'}
                          </span>
                          <span>{Math.max(p.ratings.bat, p.ratings.bowl)}</span>
                        </div>

                        {sold ? (
                          <div
                            className="text-[11px] font-mono font-bold"
                            style={{ color: sold.buyerTeamColor }}
                          >
                            SOLD · {sold.buyerTeamShort} {sold.finalPriceCr.toFixed(2)} cr
                          </div>
                        ) : isUnsold ? (
                          <div className="text-[11px] font-mono font-bold text-slate-500">
                            UNSOLD ({p.basePriceCr.toFixed(2)} cr)
                          </div>
                        ) : (
                          <div className="text-[11px] font-mono font-bold text-amber-300">
                            {formatAuctionPriceCr(p.basePriceCr)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Actions */}
              <div className="p-4 border-t border-slate-800 bg-[#0c121d] flex items-center gap-3">
                {isViewingLiveSet ? (
                  <>
                    <button
                      onClick={handleSkipCurrentSet}
                      className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs uppercase rounded-xl border border-amber-500/30 transition-all"
                    >
                      ⏩ SIMULATE & ADVANCE {activeLiveSetId}
                    </button>

                    <button
                      onClick={() => {
                        sound.playTap();
                        setIsSetSheetOpen(false);
                      }}
                      className="flex-1 py-3 bg-[#f5b82e] hover:bg-amber-300 text-black font-black text-xs uppercase rounded-xl shadow-lg transition-all"
                    >
                      RESUME LIVE STAGE
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      sound.playTap();
                      setIsSetSheetOpen(false);
                    }}
                    className="w-full py-3 bg-[#f5b82e] hover:bg-amber-300 text-black font-black text-xs uppercase rounded-xl shadow-lg transition-all"
                  >
                    BACK TO LIVE AUCTION ({currentSetMeta.name})
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* 9. SQUAD & RETENTIONS VIEWER (MULTI-FRANCHISE)           */}
      {/* ========================================================= */}
      {isSquadPlannerOpen && (
        <div className="fixed inset-0 z-50 bg-[#070b12]/95 backdrop-blur-md text-slate-100 flex flex-col justify-between max-w-5xl mx-auto w-full overflow-hidden animate-in fade-in duration-200 border-x border-slate-800">
          {/* Header */}
          <div className="px-4 py-3 flex items-center justify-between border-b border-slate-800/80 bg-[#0c121d]/90">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSquadPlannerOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
                title="Back to Auction Stage"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-lg text-white text-xs font-bold flex items-center justify-center shadow"
                  style={{ backgroundColor: viewingTeamClubMeta?.primaryColor || '#3a225d' }}
                >
                  {viewingTeamClubMeta?.logo || viewingTeamShort}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-black font-display uppercase text-white tracking-wider">
                      {selectedViewingTeam.name}
                    </h3>
                    <span
                      className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                        isViewingUserTeam
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {isViewingUserTeam ? '★ YOUR FRANCHISE' : 'OPPONENT FRANCHISE'}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-amber-400">
                    SQUAD &amp; RETENTIONS · {currentSetMeta.name} ({currentSetMeta.categoryLabel})
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsSquadPlannerOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Franchise Tabs Switcher across all 10 IPL Teams */}
          <div className="px-4 py-2 border-b border-slate-800/70 bg-[#080d17] overflow-x-auto flex items-center gap-1.5">
            <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest shrink-0 mr-1">
              TEAMS:
            </span>
            {INITIAL_AUCTION_CLUBS.map(club => {
              const isSelected =
                selectedViewingTeam.id === club.teamId ||
                viewingTeamShort.toUpperCase() === club.shortName.toUpperCase();
              const isUserClub = club.shortName.toUpperCase() === userShort.toUpperCase();
              const metric = franchiseMetricsMap[club.shortName];
              const squadCount = metric?.squadCount ?? club.keptCount;

              return (
                <button
                  type="button"
                  key={club.teamId}
                  onClick={() => {
                    sound.playTap();
                    setViewingSquadTeamId(club.teamId);
                  }}
                  className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-mono shrink-0 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500 text-black border-amber-400 font-bold shadow-md shadow-amber-500/20 ring-1 ring-amber-400'
                      : isUserClub
                      ? 'bg-amber-950/30 border-amber-500/40 text-amber-300 hover:bg-amber-950/50'
                      : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <span
                    className="w-4 h-4 rounded text-[9px] flex items-center justify-center text-white"
                    style={{ backgroundColor: club.primaryColor }}
                  >
                    {club.logo}
                  </span>
                  <span>{club.shortName}</span>
                  <span
                    className={`text-[9px] px-1 py-0.2 rounded-full font-bold ${
                      isSelected
                        ? 'bg-black/25 text-black'
                        : isUserClub
                        ? 'bg-amber-900/60 text-amber-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {squadCount}
                  </span>
                  {isUserClub && <span className="text-[9px] text-amber-400 font-black">★</span>}
                </button>
              );
            })}
          </div>

          {/* Stats Bar */}
          <div className="p-4 pb-2">
            <div className="bg-[#0f172a] rounded-2xl border border-slate-800 p-4">
              <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                <div>
                  <span className="text-[9px] text-slate-500 uppercase block tracking-wider">REMAINING PURSE</span>
                  <strong className="text-amber-400 font-bold">{viewingTeamPurseRemaining.toFixed(2)} cr</strong>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 uppercase block tracking-wider">SQUAD SLOTS</span>
                  <strong className="text-amber-500 font-bold">{viewingSquadCount} / 25</strong>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 uppercase block tracking-wider">OVERSEAS</span>
                  <strong className="text-sky-400 font-bold">{viewingOverseasCount} / 8</strong>
                </div>
              </div>

              {viewingSquadCount < 18 && (
                <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center gap-1.5 text-xs text-amber-300">
                  <span>ⓘ</span>
                  <span>
                    {isViewingUserTeam ? 'You need' : `${selectedViewingTeam.name} needs`}{' '}
                    {18 - viewingSquadCount} more player{18 - viewingSquadCount === 1 ? '' : 's'} to hit the official 18-player minimum roster floor.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Categorized Squad Lists (Selected Franchise Squad: Retained + Purchases) */}
          <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-4">
            {[
              { title: 'BATTERS', items: viewingBatters, statLabel: 'BAT' as const },
              { title: 'ALL-ROUNDERS', items: viewingAllRounders, statLabel: 'BAT' as const },
              { title: 'BOWLERS', items: viewingBowlers, statLabel: 'BWL' as const },
              { title: 'WICKET-KEEPERS', items: viewingKeepers, statLabel: 'BAT' as const }
            ].map(group => (
              <div key={group.title}>
                <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block mb-1.5 font-bold">
                  {group.title} · {group.items.length}
                </span>
                <div className="flex flex-col gap-1.5">
                  {group.items.length === 0 ? (
                    <div className="p-3 rounded-xl bg-[#0f172a]/60 border border-slate-800/60 text-xs text-slate-500 italic text-center">
                      No {group.title.toLowerCase()} in squad yet
                    </div>
                  ) : (
                    group.items.map(p => {
                      const rtg = group.statLabel === 'BWL' ? p.ratings.bowl : p.ratings.bat;
                      const sale = salesRecord[p.id];
                      const isAuctionBuy = Boolean(sale);
                      const buyPrice = sale ? sale.finalPriceCr : (p.salaryCr || p.basePriceCr || 2.0);
                      const priceStr = formatAuctionPriceCr(buyPrice);

                      return (
                        <div
                          key={p.id}
                          className="p-2.5 rounded-xl bg-[#0f172a] border border-slate-800 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-slate-800 text-xs font-bold flex items-center justify-center text-slate-300">
                              {p.jerseyNumber || 18}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <h4 className="text-xs font-bold text-white flex items-center gap-1">
                                  <span>{p.name}</span>
                                  {isOverseasPlayer(p) && <span title="Overseas Player">✈️</span>}
                                </h4>
                                {isOverseasPlayer(p) && (
                                  <span className="text-[9px] px-1 rounded bg-sky-950 text-sky-400 border border-sky-800 font-bold">
                                    {p.country?.slice(0, 3).toUpperCase() || 'OS'} ✈️
                                  </span>
                                )}
                                {isAuctionBuy ? (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 font-mono font-bold">
                                    AUCTION BUY
                                  </span>
                                ) : (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-700/60 font-mono font-bold">
                                    RETAINED
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400">
                                {p.role} · age {p.age}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-mono font-bold text-emerald-400">
                              {group.statLabel} {rtg}
                            </span>
                            <span className="text-[10px] font-mono text-amber-300 block">
                              {priceStr}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons Footer */}
          <div className="p-4 border-t border-slate-800 bg-[#0c121d] flex flex-col gap-2">
            <button
              onClick={() => {
                sound.playTap();
                setIsSquadPlannerOpen(false);
              }}
              className="w-full py-3.5 bg-gradient-to-r from-[#eab308] via-[#f5b82e] to-[#eab308] hover:from-[#facc15] hover:to-[#f5b82e] text-black font-black text-xs uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 active:scale-98 transition-all cursor-pointer"
            >
              <Gavel className="w-4 h-4 fill-current" />
              RESUME AUCTION ({currentSetMeta.name})
            </button>

            {isSandbox && (
              <button
                onClick={() => {
                  sound.playTap();
                  exitAuctionSandbox();
                }}
                className="w-full py-3 bg-red-950/70 hover:bg-red-900 border border-red-700/60 text-red-200 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
              >
                EXIT AUCTION SANDBOX (RETURN TO TITLE SCREEN)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sandbox Config Modal inside Auction Room */}
      {showSandboxConfigModal && (
        <AuctionSandboxModal
          isOpen={showSandboxConfigModal}
          onClose={() => setShowSandboxConfigModal(false)}
          initialFranchiseId={activeFranchiseTeam.id}
          initialMode={auctionSandbox?.mode}
        />
      )}
    </div>
  );
};
