import React, { useState, useEffect } from 'react';
import { X, Sparkles, Zap, Shield, Flame, Activity, Compass } from 'lucide-react';
import { Player, BattingApproach } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';

interface BattingTacticsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  striker: Player;
  nonStriker: Player;
  strikerRuns: number;
  strikerBalls: number;
  nonStrikerRuns: number;
  nonStrikerBalls: number;
  currentApproach: BattingApproach;
  nonStrikerApproach?: BattingApproach;
  onSelectApproach: (approach: BattingApproach) => void;
  onSelectNonStrikerApproach?: (approach: BattingApproach) => void;
  pairRunning: 'hold_ones' | 'standard' | 'push_hard' | 'shield';
  onSelectPairRunning: (running: 'hold_ones' | 'standard' | 'push_hard' | 'shield') => void;
  targetSide?: 'all' | 'off_side' | 'leg_side' | 'straight';
  onUpdateBattingTactics?: (tactics: {
    approach: BattingApproach;
    nonStrikerApproach: BattingApproach;
    pairRunning: 'hold_ones' | 'standard' | 'push_hard' | 'shield';
    targetSide: 'all' | 'off_side' | 'leg_side' | 'straight';
  }) => void;
  currentOver?: number;
  wicketsLost?: number;
  requiredRunRate?: number | null;
  onOpenImpactModal: () => void;
  impactPlayerUsed: boolean;
  ballHistory: Array<{ over: number; ballNumber: number; runs: number; isWicket: boolean; isFour: boolean; isSix: boolean; commentary: string }>;
}

export const BattingTacticsDrawer: React.FC<BattingTacticsDrawerProps> = ({
  isOpen,
  onClose,
  striker,
  nonStriker,
  strikerRuns,
  strikerBalls,
  nonStrikerRuns,
  nonStrikerBalls,
  currentApproach,
  nonStrikerApproach,
  onSelectApproach,
  onSelectNonStrikerApproach,
  pairRunning,
  onSelectPairRunning,
  targetSide = 'all',
  onUpdateBattingTactics,
  currentOver = 0,
  wicketsLost = 0,
  requiredRunRate = null,
  onOpenImpactModal,
  impactPlayerUsed,
  ballHistory
}) => {
  const [activeTab, setActiveTab] = useState<'tactics' | 'commentary'>('tactics');
  const [tacticsLevel, setTacticsLevel] = useState<'simple' | 'advanced'>('simple');
  const [strikerTactics, setStrikerTactics] = useState<BattingApproach>(currentApproach || 'aggressive');
  const [nonStrikerTactics, setNonStrikerTactics] = useState<BattingApproach>(nonStrikerApproach || 'balanced');
  const [localPairRunning, setLocalPairRunning] = useState<'hold_ones' | 'standard' | 'push_hard' | 'shield'>(pairRunning || 'standard');
  const [localTargetSide, setLocalTargetSide] = useState<'all' | 'off_side' | 'leg_side' | 'straight'>(targetSide || 'all');

  useEffect(() => {
    if (isOpen) {
      setStrikerTactics(currentApproach || 'aggressive');
      setNonStrikerTactics(nonStrikerApproach || 'balanced');
      setLocalPairRunning(pairRunning || 'standard');
      setLocalTargetSide(targetSide || 'all');
    }
  }, [isOpen, currentApproach, nonStrikerApproach, pairRunning, targetSide]);

  if (!isOpen) return null;

  const handleApply = () => {
    sound.playTap();
    onSelectApproach(strikerTactics);
    onSelectNonStrikerApproach?.(nonStrikerTactics);
    onSelectPairRunning(localPairRunning);
    onUpdateBattingTactics?.({
      approach: strikerTactics,
      nonStrikerApproach: nonStrikerTactics,
      pairRunning: localPairRunning,
      targetSide: localTargetSide
    });
    onClose();
  };

  const approaches = [
    { id: 'defensive' as BattingApproach, label: 'DEFEND', sub: 'Lowest risk · low scoring', icon: Shield },
    { id: 'balanced' as BattingApproach, label: 'BUILD', sub: 'Balanced · default', icon: Activity },
    { id: 'aggressive' as BattingApproach, label: 'ATTACK', sub: 'Fours and gaps · more risk', icon: Flame },
    { id: 'smash' as BattingApproach, label: 'SLOG', sub: 'Go for sixes · high wicket risk', icon: Zap }
  ];

  const runningOptions = [
    { id: 'hold_ones' as const, label: 'Hold ones', sub: 'Refuse risky singles' },
    { id: 'standard' as const, label: 'Standard', sub: 'Take what is on' },
    { id: 'push_hard' as const, label: 'Push hard', sub: 'Convert 1s to 2s · run-out risk' },
    { id: 'shield' as const, label: 'Shield', sub: 'Farm strike to one batter' }
  ];

  const targetSideOptions = [
    { id: 'all' as const, label: 'ALL 360°', sub: 'Play on merit' },
    { id: 'off_side' as const, label: 'OFF SIDE', sub: 'Covers & Point' },
    { id: 'leg_side' as const, label: 'LEG SIDE', sub: 'Midwicket & Pull' },
    { id: 'straight' as const, label: 'STRAIGHT', sub: 'Down the V' }
  ];

  // Intelligent Assistant Recommendation Engine
  const getAssistantRecommendation = (batter: Player, ballsFaced: number): { approach: BattingApproach; label: string } => {
    const isTailender = batter.role === 'Pace' || batter.role === 'Spin';
    if (isTailender && currentOver < 17) {
      return { approach: 'defensive', label: 'Defend & survive (Tailender)' };
    }
    if (wicketsLost >= 3 && currentOver < 8) {
      return { approach: 'defensive', label: `Defend & rebuild (${wicketsLost} wkts lost)` };
    }
    if (currentOver >= 16 || (requiredRunRate !== null && requiredRunRate > 12)) {
      return {
        approach: 'smash',
        label: requiredRunRate !== null && requiredRunRate > 12
          ? `Slog now (RRR ${requiredRunRate.toFixed(1)})`
          : `Slog now (Death Over ${currentOver + 1})`
      };
    }
    if (currentOver < 6 || (requiredRunRate !== null && requiredRunRate > 9) || ballsFaced >= 12) {
      const reason = currentOver < 6
        ? 'Powerplay field up'
        : requiredRunRate !== null && requiredRunRate > 9
        ? `RRR ${requiredRunRate.toFixed(1)}`
        : `Set on ${ballsFaced}b`;
      return { approach: 'aggressive', label: `Attack now (${reason})` };
    }
    return { approach: 'balanced', label: 'Build partnership & rotate' };
  };

  // Dynamic Batter Weakness / Scouting Chip
  const getBatterScoutingNote = (batter: Player): string => {
    const vp = batter.ratings.vp ?? batter.ratings.bat;
    const vs = batter.ratings.vs ?? batter.ratings.bat;
    const pow = batter.ratings.pow;
    const tmp = batter.ratings.tmp ?? 74;

    if (vs < vp - 5) {
      return `💡 Weak vs Spin (vS ${vs} vs vP ${vp}) · Watch turning deliveries.`;
    }
    if (vp < vs - 5) {
      return `💡 Vulnerable to High Pace (vP ${vp} vs vS ${vs}) · Watch short balls.`;
    }
    if (pow >= 88) {
      return `💡 Elite Boundary Power (POW ${pow} · vP ${vp} / vS ${vs}) · Clears ropes easily.`;
    }
    return `💡 Balanced all-court technique (vP ${vp} / vS ${vs} · TMP ${tmp}).`;
  };

  const slowerRunner = (striker.ratings.run || 75) <= (nonStriker.ratings.run || 75) ? striker : nonStriker;
  const isNonStrikerTail = nonStriker.role === 'Pace' || nonStriker.role === 'Spin';
  const assistantRunningCall = isNonStrikerTail
    ? 'Shield now (Protect tailender)'
    : (slowerRunner.ratings.run || 75) >= 82
    ? 'Push hard (Fast running pair)'
    : (slowerRunner.ratings.run || 75) < 68
    ? 'Hold ones (Avoid run-out risk)'
    : 'Standard now';

  const renderBatterCard = (
    batter: Player,
    runs: number,
    balls: number,
    isStriker: boolean,
    selectedApproach: BattingApproach,
    setApproach: (app: BattingApproach) => void
  ) => {
    const isSet = balls >= 10;
    const setPercent = Math.min(95, Math.max(30, balls * 7 + (runs > 10 ? 25 : 10)));
    const baseFitness = batter.fitness || 95;
    const staminaPercent = Math.max(60, Math.min(100, baseFitness - Math.floor(balls * 1.2)));
    const assistantRec = getAssistantRecommendation(batter, balls);
    const scoutingNote = getBatterScoutingNote(batter);

    const nineAttributes = [
      { label: 'BAT', val: batter.ratings.bat, color: 'text-emerald-400' },
      { label: 'POW', val: batter.ratings.pow, color: 'text-amber-400' },
      { label: 'TEQ', val: batter.ratings.ctrl || 74, color: 'text-slate-200' },
      { label: 'TMP', val: batter.ratings.tmp || 76, color: 'text-slate-200' },
      { label: 'AEQ', val: batter.ratings.cat || 80, color: 'text-cyan-400' },
      { label: 'vPACE', val: batter.ratings.vp || batter.ratings.bat, color: 'text-emerald-300' },
      { label: 'vSPIN', val: batter.ratings.vs || batter.ratings.bat, color: 'text-amber-300' },
      { label: 'RUN', val: batter.ratings.run || 75, color: 'text-cyan-300' },
      { label: 'FORM', val: batter.form || 78, color: 'text-purple-300' }
    ];

    return (
      <div className="p-3.5 rounded-2xl bg-[#0e1626] border border-slate-800/90 shadow-md">
        {/* Header Tag */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-black uppercase tracking-wider ${
              isStriker ? 'bg-amber-400 text-black' : 'bg-slate-800 text-slate-300'
            }`}>
              {isStriker ? 'ON-STRIKE' : 'NON-STRIKER'}
            </span>
          </div>
          <span className="text-xs font-mono font-bold text-white">
            {runs}* ({balls})
          </span>
        </div>

        {/* Player Name & Jersey Badge */}
        <div className="flex items-center gap-2.5 mb-3">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-black text-xs shrink-0 ${
            isStriker ? 'bg-[#f59e0b] text-black shadow-sm' : 'bg-[#2a3547] text-white shadow-sm'
          }`}>
            {batter.jerseyNumber || (isStriker ? 9 : 74)}
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-black text-white font-display truncate leading-tight">
              {batter.name.split(' ').pop()} <span className="text-xs text-slate-400 font-sans font-normal">{batter.age || 26}y</span>
            </h4>
            <span className="text-[10px] font-mono text-slate-400">{batter.role} · {batter.battingHand}</span>
          </div>
        </div>

        {/* Settling In & Stamina Meters */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="p-2 rounded-xl bg-[#141d2f] border border-slate-800">
            <div className="flex items-center justify-between text-[10px] font-mono mb-1">
              <span className="text-slate-400 font-bold">SET</span>
              <span className="text-emerald-400 font-bold">{setPercent}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-1">
              <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${setPercent}%` }} />
            </div>
            <span className="text-[9px] text-slate-400 font-sans">{isSet ? 'In control' : 'Settling in'}</span>
          </div>

          <div className="p-2 rounded-xl bg-[#141d2f] border border-slate-800">
            <div className="flex items-center justify-between text-[10px] font-mono mb-1">
              <span className="text-slate-400 font-bold">STAMINA</span>
              <span className="text-cyan-400 font-bold">{staminaPercent}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-1">
              <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${staminaPercent}%` }} />
            </div>
            <span className="text-[9px] text-slate-400 font-sans">{staminaPercent > 85 ? 'Fresh' : 'Working'}</span>
          </div>
        </div>

        {/* Advanced Mode: Full 9-Attribute Matrix */}
        {tacticsLevel === 'advanced' && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 mb-3 text-center font-mono">
            {nineAttributes.map(attr => (
              <div key={attr.label} className="p-1 rounded bg-[#172238] border border-slate-800 text-[10px]">
                <span className="block text-[8px] text-slate-400">{attr.label}</span>
                <span className={`font-bold ${attr.color}`}>{attr.val}</span>
              </div>
            ))}
          </div>
        )}

        {/* Dynamic Matchup Weakness / Scouting Chip */}
        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-1.5 text-[10px] text-amber-300 mb-3 font-sans">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{scoutingNote}</span>
        </div>

        {/* Intelligent Assistant Call Button */}
        <button
          onClick={() => {
            sound.playTap();
            setApproach(assistantRec.approach);
          }}
          className="w-full mb-3 py-2 px-3 rounded-xl bg-[#172238] border border-cyan-500/40 text-cyan-300 font-bold text-xs flex items-center justify-between hover:bg-cyan-950/40 active:scale-98 transition-all"
        >
          <span className="uppercase text-[11px] font-mono tracking-wider">LET MY ASSISTANT PICK</span>
          <span className="text-[10px] text-slate-300 font-normal">Call: {assistantRec.label}</span>
        </button>

        {/* 4 Approach Buttons */}
        <div className="grid grid-cols-2 gap-2">
          {approaches.map(app => {
            const isSelected = selectedApproach === app.id;
            const Icon = app.icon;
            return (
              <button
                key={app.id}
                onClick={() => {
                  sound.playTap();
                  setApproach(app.id);
                }}
                className={`p-2.5 rounded-xl text-left border transition-all active:scale-98 ${
                  isSelected
                    ? 'bg-gradient-to-br from-amber-500/25 to-amber-600/10 border-amber-400 text-white shadow-md shadow-amber-500/10'
                    : 'bg-[#121b2d] border-slate-800/80 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-xs font-black uppercase font-display tracking-wide ${isSelected ? 'text-amber-400' : 'text-slate-200'}`}>
                    {app.label}
                  </span>
                  <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-amber-400' : 'text-slate-500'}`} />
                </div>
                <span className="text-[9px] text-slate-400 block leading-tight">
                  {app.sub}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center">
      <div className="bg-[#080d18] border-t border-slate-800 rounded-t-3xl w-full max-w-md max-h-[88vh] flex flex-col p-4 shadow-2xl overflow-y-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-1 bg-[#121927] p-1 rounded-xl text-xs font-bold uppercase">
            <button
              onClick={() => { sound.playTap(); setActiveTab('tactics'); }}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'tactics' ? 'bg-[#f5b82e] text-black shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              TACTICS
            </button>
            <button
              onClick={() => { sound.playTap(); setActiveTab('commentary'); }}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'commentary' ? 'bg-[#f5b82e] text-black shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              COMMENTARY
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {activeTab === 'tactics' ? (
          <div className="py-3 flex flex-col gap-4 text-xs">
            {/* Simple / Advanced sub-toggle */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#121927] rounded-xl">
              <button
                onClick={() => { sound.playTap(); setTacticsLevel('simple'); }}
                className={`py-1 rounded-lg uppercase font-bold text-[11px] transition-all ${
                  tacticsLevel === 'simple' ? 'bg-[#f5b82e] text-black shadow-sm' : 'text-slate-400'
                }`}
              >
                SIMPLE
              </button>
              <button
                onClick={() => { sound.playTap(); setTacticsLevel('advanced'); }}
                className={`py-1 rounded-lg uppercase font-bold text-[11px] transition-all ${
                  tacticsLevel === 'advanced' ? 'bg-[#f5b82e] text-black shadow-sm' : 'text-slate-400'
                }`}
              >
                ADVANCED
              </button>
            </div>

            <span className="text-[11px] text-slate-400 font-sans">
              {tacticsLevel === 'simple'
                ? 'Choose each batter’s tempo for the next over. Switch to ADVANCED for 9-stat scouting, Wagon-Wheel targeting & Pair Running.'
                : 'Full tactical control: 9-attribute scouting, Wagon-Wheel scoring arc, Pair Running & Tailender strike-farming.'}
            </span>

            {/* Striker Card */}
            {renderBatterCard(striker, strikerRuns, strikerBalls, true, strikerTactics, setStrikerTactics)}

            {/* Non-Striker Card */}
            {renderBatterCard(nonStriker, nonStrikerRuns, nonStrikerBalls, false, nonStrikerTactics, setNonStrikerTactics)}

            {/* Advanced Mode: Target Wagon-Wheel Scoring Zone */}
            {tacticsLevel === 'advanced' && (
              <div className="p-3.5 rounded-2xl bg-[#0e1626] border border-slate-800/90 shadow-md">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-cyan-400" />
                    TARGET SCORING ARC
                  </span>
                  <span className="text-[10px] font-mono text-cyan-400 uppercase font-bold">
                    {localTargetSide.replace('_', ' ')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {targetSideOptions.map(zone => {
                    const isSelected = localTargetSide === zone.id;
                    return (
                      <button
                        key={zone.id}
                        onClick={() => {
                          sound.playTap();
                          setLocalTargetSide(zone.id);
                        }}
                        className={`p-2 rounded-xl text-left border transition-all active:scale-98 ${
                          isSelected
                            ? 'bg-cyan-500/20 border-cyan-400 text-white'
                            : 'bg-[#141d2f] border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <span className={`text-xs font-bold block ${isSelected ? 'text-cyan-300' : 'text-slate-200'}`}>
                          {zone.label}
                        </span>
                        <span className="text-[9px] text-slate-400 block leading-tight">
                          {zone.sub}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pair Running Section (Visible in both Simple & Advanced per Screenshot) */}
            <div className="p-3.5 rounded-2xl bg-[#0e1626] border border-slate-800/90 shadow-md">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                  PAIR RUNNING
                </span>
                <span className="text-xs font-mono font-bold text-white flex items-center gap-1">
                  <span>{striker.name.split(' ').pop()}</span>
                  <span className="text-amber-400">🤝</span>
                  <span>{nonStriker.name.split(' ').pop()}</span>
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-sans mb-1">
                Pair speed is set by the slower runner ({slowerRunner.name.split(' ').pop()}, RUN {slowerRunner.ratings.run || 74}).
              </p>
              <p className="text-[10px] text-cyan-400 font-mono mb-2.5">
                Your assistant's call: {assistantRunningCall}
              </p>

              <div className="grid grid-cols-2 gap-2">
                {runningOptions.map(opt => {
                  const isSelected = localPairRunning === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        sound.playTap();
                        setLocalPairRunning(opt.id);
                      }}
                      className={`p-2 rounded-xl text-left border transition-all active:scale-98 ${
                        isSelected
                          ? 'bg-amber-500/20 border-amber-400 text-white'
                          : 'bg-[#141d2f] border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <span className={`text-xs font-bold block ${isSelected ? 'text-amber-400' : 'text-slate-200'}`}>
                        {opt.label}
                      </span>
                      <span className="text-[9px] text-slate-400 block leading-tight">
                        {opt.sub}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Strike-rotation preference toggle: Protect Tailender (Advanced Mode) */}
              {tacticsLevel === 'advanced' && (
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-amber-400" />
                      Protect Tailender (#9-#11)
                    </span>
                    <span className="text-[9px] text-slate-400 block">
                      Refuse singles on balls 1-4; take single on ball 5 or 6 to retain strike.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setLocalPairRunning(localPairRunning === 'shield' ? 'standard' : 'shield');
                    }}
                    className={`px-3 py-1 rounded-xl text-xs font-mono font-bold transition-all ${
                      localPairRunning === 'shield'
                        ? 'bg-amber-400 text-black shadow-md shadow-amber-500/20'
                        : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                    }`}
                  >
                    {localPairRunning === 'shield' ? 'PROTECT: ON' : 'OFF'}
                  </button>
                </div>
              )}
            </div>

            {/* Impact Player Button */}
            <button
              onClick={() => {
                sound.playTap();
                onOpenImpactModal();
              }}
              disabled={impactPlayerUsed}
              className={`w-full py-3 px-4 rounded-xl font-black text-xs uppercase flex items-center justify-center gap-2 border transition-all ${
                impactPlayerUsed
                  ? 'bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-[#141d2f] hover:bg-[#1a263d] border-amber-500/40 text-amber-400 active:scale-98 shadow-md'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30" />
              {impactPlayerUsed ? 'IMPACT PLAYER USED' : 'USE IMPACT PLAYER'}
            </button>

            {/* Apply Button */}
            <button
              onClick={handleApply}
              className="w-full py-4 bg-[#f5b82e] hover:bg-[#eab308] text-black font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-amber-500/20 active:scale-98 transition-all"
            >
              APPLY TACTICS
            </button>
          </div>
        ) : (
          /* Commentary Tab */
          <div className="py-3 flex flex-col gap-2 text-xs">
            <span className="text-[11px] text-slate-400 font-mono mb-2">
              Why each ball went the way it did: the stats and matchups behind it.
            </span>
            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
              {ballHistory.length === 0 ? (
                <div className="p-4 rounded-xl bg-[#0f172a] text-center text-slate-500 font-mono text-xs">
                  No balls bowled yet in this innings.
                </div>
              ) : (
                ballHistory.slice(0, 15).map((ball, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-[#0e1626] border border-slate-800 text-xs flex items-start gap-2.5">
                    <span className="text-[10px] font-mono font-bold text-slate-400 mt-0.5 shrink-0">
                      {ball.over}.{ball.ballNumber}
                    </span>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold shrink-0 ${
                      ball.isWicket ? 'bg-rose-600 text-white' : ball.isSix ? 'bg-amber-400 text-black' : ball.isFour ? 'bg-cyan-400 text-black' : 'bg-slate-800 text-slate-300'
                    }`}>
                      {ball.isWicket ? 'W' : ball.runs}
                    </span>
                    <p className="text-[11px] text-slate-200 font-mono flex-1">
                      {ball.commentary}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
