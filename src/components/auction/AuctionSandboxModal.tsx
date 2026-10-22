import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Gavel,
  Check,
  AlertCircle,
  Shield,
  RefreshCw,
  Sparkles,
  ChevronRight,
  UserCheck,
  UserX,
  ArrowLeft,
  DollarSign,
  Award
} from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { Player, Team } from '../../types/cricket';
import { INITIAL_AUCTION_CLUBS } from '../../data/auctionSets2026';
import {
  AuctionSandboxMode,
  canRetainPlayerInMega,
  calculateMegaRetentionSummary,
  calculateMiniRetentionSummary,
  isPlayerUncappedDomestic,
  isOverseasPlayer,
  getRecommendedMegaRetentionIds,
  getRecommendedMiniRetentionIds,
  MEGA_AUCTION_PURSE_CR,
  MAX_MEGA_RETENTIONS,
  MAX_MEGA_CAPPED_RETENTIONS,
  MAX_MEGA_UNCAPPED_RETENTIONS,
  MAX_MEGA_OVERSEAS_RETENTIONS,
  MAX_OVERSEAS_SQUAD_LIMIT,
  MEGA_CAPPED_RETENTION_SLABS_CR,
  MEGA_UNCAPPED_RETENTION_SLAB_CR
} from '../../utils/auctionSandboxEngine';
import { sound } from '../../utils/soundEffects';

interface AuctionSandboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFranchiseId?: string;
  initialMode?: AuctionSandboxMode;
}

export const AuctionSandboxModal: React.FC<AuctionSandboxModalProps> = ({
  isOpen,
  onClose,
  initialFranchiseId,
  initialMode = 'mega'
}) => {
  const { teams, players, startAuctionSandbox, userTeam } = useGame();

  // Selected Franchise ID (defaults to initialFranchiseId, or userTeam.id, or team_kol)
  const [selectedFranchiseId, setSelectedFranchiseId] = useState<string>(
    initialFranchiseId || userTeam.id || 'team_kol'
  );

  // Selected Mode: 'mega' or 'mini'
  const [mode, setMode] = useState<AuctionSandboxMode>(initialMode);

  // Active Tab in Modal: 'setup' (Franchise + Mode) or 'retentions' (Player Roster Management)
  const [activeStep, setActiveStep] = useState<'setup' | 'retentions'>('setup');

  // Currently selected franchise object
  const activeFranchise = useMemo(() => {
    return (
      teams.find(t => t.id === selectedFranchiseId) ||
      teams.find(t => t.id === 'team_kol') ||
      teams[0]
    );
  }, [teams, selectedFranchiseId]);

  // Squad of the selected franchise
  const franchiseSquad = useMemo(() => {
    return players.filter(p => p.clubId === activeFranchise.id);
  }, [players, activeFranchise.id]);

  // Retained Player IDs
  const [retainedPlayerIds, setRetainedPlayerIds] = useState<string[]>([]);

  // Initialize or reset retentions when franchise or mode changes
  useEffect(() => {
    if (franchiseSquad.length > 0) {
      if (mode === 'mega') {
        const recommended = getRecommendedMegaRetentionIds(activeFranchise, franchiseSquad);
        setRetainedPlayerIds(recommended);
      } else {
        const recommended = getRecommendedMiniRetentionIds(activeFranchise, franchiseSquad);
        setRetainedPlayerIds(recommended);
      }
    }
  }, [activeFranchise, franchiseSquad, mode]);

  // Base purse for Mini Auction from INITIAL_AUCTION_CLUBS
  const clubMeta = useMemo(() => {
    return INITIAL_AUCTION_CLUBS.find(
      c =>
        c.teamId === activeFranchise.id ||
        c.shortName.toUpperCase() === activeFranchise.shortName.toUpperCase()
    );
  }, [activeFranchise]);

  const baseMiniPurse = clubMeta?.purseCr ?? 20.85;

  // Real-time Retention Calculations
  const megaSummary = useMemo(() => {
    return calculateMegaRetentionSummary(franchiseSquad, retainedPlayerIds);
  }, [franchiseSquad, retainedPlayerIds]);

  const miniSummary = useMemo(() => {
    return calculateMiniRetentionSummary(baseMiniPurse, franchiseSquad, retainedPlayerIds);
  }, [baseMiniPurse, franchiseSquad, retainedPlayerIds]);

  if (!isOpen) return null;

  // Toggle retention of a player
  const togglePlayerRetention = (candidate: Player) => {
    sound.playTap();
    const isCurrentlyRetained = retainedPlayerIds.includes(candidate.id);

    if (isCurrentlyRetained) {
      // Release the player
      setRetainedPlayerIds(prev => prev.filter(id => id !== candidate.id));
    } else {
      // Retain the player
      const currentRetained = franchiseSquad.filter(p => retainedPlayerIds.includes(p.id));
      if (mode === 'mega') {
        const validation = canRetainPlayerInMega(currentRetained, candidate);
        if (!validation.allowed) {
          sound.playGavel();
          return;
        }
      } else {
        const currentOverseas = currentRetained.filter(p => isOverseasPlayer(p)).length;
        if (isOverseasPlayer(candidate) && currentOverseas >= 8) {
          sound.playGavel();
          return;
        }
      }
      setRetainedPlayerIds(prev => [...prev, candidate.id]);
    }
  };

  const handleLaunchSandbox = () => {
    sound.playCrowdCheer(0.8);
    startAuctionSandbox({
      franchiseId: activeFranchise.id,
      mode,
      userRetainedPlayerIds: retainedPlayerIds
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-[#0c1322] border border-amber-500/40 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header Bar */}
        <div className="px-5 py-4 bg-gradient-to-r from-[#141d33] via-[#10192e] to-[#0c1322] border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner">
              <Gavel className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black font-display tracking-wider text-white uppercase">
                  AUCTION ONLY SANDBOX
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  ISOLATED LAB
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Safe sandbox mode: Test any franchise with Mega or Mini Auction rules. Does not alter your career save slots.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              sound.playTap();
              onClose();
            }}
            className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs: Step 1 (Franchise & Mode) vs Step 2 (Retention / Release) */}
        <div className="px-5 py-2.5 bg-[#090f1a] border-b border-slate-800 flex items-center justify-between text-xs font-mono shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                sound.playTap();
                setActiveStep('setup');
              }}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
                activeStep === 'setup'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
              }`}
            >
              <span>1. FRANCHISE &amp; MODE</span>
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <button
              onClick={() => {
                sound.playTap();
                setActiveStep('retentions');
              }}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
                activeStep === 'retentions'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
              }`}
            >
              <span>2. RETENTIONS &amp; SQUAD ROSTER</span>
              <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-black/30 font-bold">
                {retainedPlayerIds.length} Kept
              </span>
            </button>
          </div>

          {/* Quick Summary Badge */}
          <div className="hidden sm:flex items-center gap-3 text-slate-300 font-bold">
            <span className="flex items-center gap-1 text-amber-400">
              <span>{activeFranchise.logoEmoji}</span>
              <span>{activeFranchise.shortName}</span>
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-emerald-400 font-mono-nums">
              ₹{mode === 'mega' ? megaSummary.remainingPurseCr.toFixed(2) : miniSummary.totalAvailablePurseCr.toFixed(2)} Cr Purse
            </span>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {activeStep === 'setup' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* 1. SELECT AUCTION MODE */}
              <div>
                <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                  SELECT AUCTION FORMAT
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* Mega Auction Option */}
                  <div
                    onClick={() => {
                      sound.playTap();
                      setMode('mega');
                    }}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      mode === 'mega'
                        ? 'bg-amber-500/15 border-amber-400 shadow-lg shadow-amber-500/10'
                        : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🏆</span>
                        <span className="text-sm font-black font-display tracking-wider text-white uppercase">
                          MEGA AUCTION
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold text-amber-400">
                        ₹120.0 Cr Purse
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Official IPL retention slabs: ₹18 Cr, ₹14 Cr, ₹11 Cr, ₹18 Cr, ₹14 Cr (capped) &amp; ₹4 Cr (uncapped). Up to 6 retentions with dynamic RTM cards!
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-mono font-bold">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        Max 5 Capped
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        Max 2 Uncapped
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-amber-500/30">
                        6 - Retentions = RTMs
                      </span>
                    </div>
                  </div>

                  {/* Mini Auction Option */}
                  <div
                    onClick={() => {
                      sound.playTap();
                      setMode('mini');
                    }}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      mode === 'mini'
                        ? 'bg-amber-500/15 border-amber-400 shadow-lg shadow-amber-500/10'
                        : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">⚡</span>
                        <span className="text-sm font-black font-display tracking-wider text-white uppercase">
                          MINI AUCTION
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        Base + Released Salary
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Tactical off-season mini-auction: Keep core 15–20 players, release fringe players to gain 100% of their salary back into your purse for the auction!
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-mono font-bold">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        100% Salary Recouped
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        Flexible Retentions
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-300 border border-emerald-500/30">
                        Target Specific Gaps
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. SELECT FRANCHISE ACROSS ALL 10 IPL TEAMS */}
              <div>
                <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                  SELECT YOUR FRANCHISE (ALL 10 IPL TEAMS AVAILABLE)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {teams.map(t => {
                    const isSelected = t.id === activeFranchise.id;
                    const clubSquad = players.filter(p => p.clubId === t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          sound.playTap();
                          setSelectedFranchiseId(t.id);
                        }}
                        className={`p-3 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between h-24 ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-400 shadow-md ring-1 ring-amber-400'
                            : 'bg-slate-900/70 hover:bg-slate-800/80 border-slate-800 text-slate-300'
                        }`}
                        style={{
                          borderLeftColor: isSelected ? '#f59e0b' : t.primaryColor,
                          borderLeftWidth: '4px'
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-2xl">{t.logoEmoji}</span>
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/40 text-slate-300">
                            {t.shortName}
                          </span>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white truncate">
                            {t.name}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 truncate">
                            {clubSquad.length} Players
                          </div>
                        </div>
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-amber-400 text-black flex items-center justify-center font-bold text-[10px]">
                            ✓
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 1 Footer Action */}
              <div className="pt-2 flex items-center justify-between border-t border-slate-800/80">
                <div className="text-xs text-slate-400 font-mono">
                  Selected: <strong className="text-amber-400">{activeFranchise.name}</strong> ({mode.toUpperCase()} AUCTION)
                </div>
                <button
                  onClick={() => {
                    sound.playTap();
                    setActiveStep('retentions');
                  }}
                  className="px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs font-mono uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
                >
                  <span>CONFIGURE RETENTIONS</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {activeStep === 'retentions' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Franchise Switcher Bar across all 10 IPL Teams */}
              <div className="bg-[#090f1a] p-2.5 rounded-2xl border border-slate-800">
                <div className="text-[10px] font-mono text-slate-400 mb-2 px-1 uppercase tracking-wider flex items-center justify-between">
                  <span>INSPECT &amp; CONFIGURE FRANCHISE ROSTERS</span>
                  <span className="text-amber-400 font-bold">10 IPL TEAMS</span>
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {teams.map(t => {
                    const isSelected = t.id === activeFranchise.id;
                    const clubSquad = players.filter(p => p.clubId === t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          sound.playTap();
                          setSelectedFranchiseId(t.id);
                        }}
                        className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 shrink-0 transition-all font-mono text-xs font-bold ${
                          isSelected
                            ? 'bg-amber-500 text-black border-amber-400 shadow-md ring-1 ring-amber-400'
                            : 'bg-slate-900/80 hover:bg-slate-800 border-slate-800 text-slate-300'
                        }`}
                      >
                        <span>{t.logoEmoji}</span>
                        <span>{t.shortName}</span>
                        <span className={`text-[10px] px-1 py-0.2 rounded-full ${isSelected ? 'bg-black/25 text-black' : 'bg-slate-800 text-slate-400'}`}>
                          {clubSquad.length}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Retention Overview Strip */}
              <div className="p-4 rounded-2xl bg-[#080e1a] border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block">Starting Purse</span>
                  <span className="text-base font-bold text-white font-mono-nums">
                    ₹{mode === 'mega' ? MEGA_AUCTION_PURSE_CR.toFixed(2) : baseMiniPurse.toFixed(2)} Cr
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block">
                    {mode === 'mega' ? 'Retention Deduction' : 'Freed Salary'}
                  </span>
                  <span className={`text-base font-bold font-mono-nums ${mode === 'mega' ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {mode === 'mega' ? `-₹${megaSummary.totalDeductionCr.toFixed(2)} Cr` : `+₹${miniSummary.freedSalaryCr.toFixed(2)} Cr`}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block">Available Auction Purse</span>
                  <span className="text-base font-bold text-emerald-400 font-mono-nums">
                    ₹{mode === 'mega' ? megaSummary.remainingPurseCr.toFixed(2) : miniSummary.totalAvailablePurseCr.toFixed(2)} Cr
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block">
                    {mode === 'mega' ? 'RTM Cards Remaining' : 'Retained / Released'}
                  </span>
                  <span className="text-base font-bold text-amber-300 font-mono-nums">
                    {mode === 'mega' ? `${megaSummary.rtmCardsRemaining} RTMs` : `${retainedPlayerIds.length} Kept / ${franchiseSquad.length - retainedPlayerIds.length} Cut`}
                  </span>
                </div>
              </div>

              {/* Mega Auction Slab Breakdown (if Mega) */}
              {mode === 'mega' && megaSummary.slabBreakdown.length > 0 && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25">
                  <div className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>OFFICIAL RETENTION SLAB DEDUCTIONS</span>
                    <span>{megaSummary.slabBreakdown.length} / 6 USED</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs font-mono">
                    {megaSummary.slabBreakdown.map((sb, idx) => (
                      <div key={sb.playerId} className="p-2 rounded-xl bg-slate-900/80 border border-slate-700/80">
                        <div className="text-[9px] text-slate-400">
                          {sb.isUncapped ? 'Uncapped Slab' : `Capped Slab #${sb.slabNumber}`}
                        </div>
                        <div className="font-bold text-white truncate text-[11px] mt-0.5">
                          {sb.playerName}
                        </div>
                        <div className="text-amber-400 font-bold font-mono-nums text-[11px]">
                          ₹{sb.slabCostCr.toFixed(2)} Cr
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Roster Controls */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
                    {activeFranchise.name} SQUAD ({franchiseSquad.length} Players)
                  </span>
                  <span className="text-[11px] text-slate-400 block font-mono">
                    Tap any player to toggle retention or release into the auction pool.
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[10px] font-mono">
                  <button
                    onClick={() => {
                      sound.playTap();
                      if (mode === 'mega') {
                        setRetainedPlayerIds(getRecommendedMegaRetentionIds(activeFranchise, franchiseSquad));
                      } else {
                        setRetainedPlayerIds(getRecommendedMiniRetentionIds(activeFranchise, franchiseSquad));
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold border border-slate-700 flex items-center gap-1 transition-all"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>RECOMMENDED</span>
                  </button>
                  <button
                    onClick={() => {
                      sound.playTap();
                      setRetainedPlayerIds([]);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold border border-slate-700 transition-all"
                  >
                    RELEASE ALL
                  </button>
                  {mode === 'mini' && (
                    <button
                      onClick={() => {
                        sound.playTap();
                        setRetainedPlayerIds(franchiseSquad.map(p => p.id));
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold border border-slate-700 transition-all"
                    >
                      RETAIN ALL
                    </button>
                  )}
                </div>
              </div>

              {/* Squad List Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
                {franchiseSquad.map(player => {
                  const isRetained = retainedPlayerIds.includes(player.id);
                  const isUncapped = isPlayerUncappedDomestic(player);
                  const playerSalary = player.salaryCr || player.basePriceCr || 1.5;

                  return (
                    <div
                      key={player.id}
                      onClick={() => togglePlayerRetention(player)}
                      className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                        isRetained
                          ? 'bg-amber-500/15 border-amber-500/50 shadow-sm'
                          : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800/80 text-slate-400 opacity-80'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                            isRetained
                              ? 'bg-amber-500 text-black'
                              : 'bg-slate-800 text-slate-500 border border-slate-700'
                          }`}
                        >
                          {isRetained ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-white truncate flex items-center gap-1">
                              <span>{player.name}</span>
                              {isOverseasPlayer(player) && <span title="Overseas Player">✈️</span>}
                            </span>
                            {isOverseasPlayer(player) && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">
                                OS ✈️
                              </span>
                            )}
                            {isUncapped && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                UNCAPPED
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {player.role} · Age {player.age} · BAT {player.ratings.bat} / BOWL {player.ratings.bowl}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 pl-2">
                        <div className="text-xs font-bold font-mono text-white">
                          ₹{playerSalary.toFixed(2)} Cr
                        </div>
                        <div className={`text-[10px] font-mono font-bold ${isRetained ? 'text-amber-400' : 'text-slate-500'}`}>
                          {isRetained ? 'RETAINED' : 'RELEASED'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Step 2 Footer Navigation & Final Launch */}
              <div className="pt-3 flex items-center justify-between border-t border-slate-800">
                <button
                  onClick={() => {
                    sound.playTap();
                    setActiveStep('setup');
                  }}
                  className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>BACK TO SETUP</span>
                </button>

                <button
                  onClick={handleLaunchSandbox}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-black text-xs font-mono uppercase tracking-wider flex items-center gap-2 shadow-xl shadow-amber-500/25 active:scale-95 transition-all"
                >
                  <Gavel className="w-4 h-4 fill-current" />
                  <span>ENTER AUCTION SANDBOX (₹{mode === 'mega' ? megaSummary.remainingPurseCr.toFixed(2) : miniSummary.totalAvailablePurseCr.toFixed(2)} CR)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
