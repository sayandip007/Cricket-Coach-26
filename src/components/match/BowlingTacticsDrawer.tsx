import React, { useState, useEffect } from 'react';
import { X, Zap } from 'lucide-react';
import { Player, PitchLength, PitchLine, BowlingAngle, FielderPosition } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';

interface BowlingTacticsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  bowler: Player;
  bowlerFigures: string;
  bowlerEcon: string;
  bowlerOversBowled?: number;
  fieldingPlayers?: Player[];
  bowlingTactics: {
    length: PitchLength;
    line: PitchLine;
    angle: BowlingAngle;
    variation: string;
    fielders: FielderPosition[];
    intent?: 'contain' | 'standard' | 'attack';
    effort?: 'conserve' | 'standard' | 'max';
    keeperPos?: 'stumps' | 'normal';
    speed?: 'slower' | 'standard' | 'quicker';
  };
  onUpdateTactics: (tactics: Partial<{
    length: PitchLength;
    line: PitchLine;
    angle: BowlingAngle;
    variation: string;
    intent: 'contain' | 'standard' | 'attack';
    effort: 'conserve' | 'standard' | 'max';
    keeperPos: 'stumps' | 'normal';
    speed: 'slower' | 'standard' | 'quicker';
  }>) => void;
  fielders: FielderPosition[];
  onApplyFieldPreset: (presetName: 'auto' | 'off_heavy' | 'attack' | 'death' | 'clear_slips' | 'balanced') => void;
  onFielderMove: (id: number, x: number, y: number) => void;
  onOpenImpactModal: () => void;
  impactPlayerUsed: boolean;
  ballHistory: Array<{ over: number; ballNumber: number; runs: number; isWicket: boolean; isFour: boolean; isSix: boolean; commentary: string }>;
  striker: Player;
}

export const BowlingTacticsDrawer: React.FC<BowlingTacticsDrawerProps> = ({
  isOpen,
  onClose,
  bowler,
  bowlerFigures,
  bowlerEcon,
  bowlerOversBowled,
  fieldingPlayers = [],
  bowlingTactics,
  onUpdateTactics,
  fielders,
  onApplyFieldPreset,
  onFielderMove,
  onOpenImpactModal,
  impactPlayerUsed,
  ballHistory,
  striker
}) => {
  const [activeTab, setActiveTab] = useState<'tactics' | 'fielding' | 'commentary'>('tactics');
  const [tacticsLevel, setTacticsLevel] = useState<'simple' | 'advanced'>('simple');
  const [assistantMode, setAssistantMode] = useState<boolean>(false);
  const [selectedFielder, setSelectedFielder] = useState<FielderPosition | null>(null);
  const [draggingRadarFielderId, setDraggingRadarFielderId] = useState<number | null>(null);
  const [fieldHistory, setFieldHistory] = useState<FielderPosition[][]>([]);
  const [overMixPlan, setOverMixPlan] = useState<'all_over' | 'mix'>('all_over');
  const [activePlanBallIdx, setActivePlanBallIdx] = useState<number>(0);

  // Bowling settings
  const isSpin = bowler.role === 'Spin';
  const [intent, setIntent] = useState<'contain' | 'standard' | 'attack'>(bowlingTactics.intent || 'attack');
  const [effort, setEffort] = useState<'conserve' | 'standard' | 'max'>(bowlingTactics.effort || 'standard');
  const [keeperPos, setKeeperPos] = useState<'normal' | 'stumps'>(bowlingTactics.keeperPos || (isSpin ? 'stumps' : 'normal'));
  const [planFor, setPlanFor] = useState<'both' | 'batter'>('both');
  const [selectedAngle, setSelectedAngle] = useState<BowlingAngle>(bowlingTactics.angle || 'over');
  const [selectedLength, setSelectedLength] = useState<PitchLength>(bowlingTactics.length || 'good');
  const [selectedLine, setSelectedLine] = useState<PitchLine>(bowlingTactics.line || 'off_stump');
  const [movement, setMovement] = useState<string>(bowlingTactics.variation || 'Stock ball');
  const [speed, setSpeed] = useState<'slower' | 'standard' | 'quicker'>(bowlingTactics.speed || 'standard');

  useEffect(() => {
    if (isOpen) {
      setIntent(bowlingTactics.intent || 'attack');
      setEffort(bowlingTactics.effort || 'standard');
      setKeeperPos(bowlingTactics.keeperPos || (isSpin ? 'stumps' : 'normal'));
      setSelectedAngle(bowlingTactics.angle || 'over');
      setSelectedLength(bowlingTactics.length || 'good');
      setSelectedLine(bowlingTactics.line || 'off_stump');
      setMovement(bowlingTactics.variation || 'Stock ball');
      setSpeed(bowlingTactics.speed || 'standard');
    }
  }, [isOpen, bowlingTactics, isSpin]);

  if (!isOpen) return null;

  // Dynamic batter scouting based on striker.ratings (vp, vs, pow, ctrl)
  const strikerVp = striker.ratings.vp ?? striker.ratings.bat;
  const strikerVs = striker.ratings.vs ?? striker.ratings.bat;
  const strikerPow = striker.ratings.pow;
  const strikerCtrl = striker.ratings.ctrl ?? 75;

  const suggestedTactic = (() => {
    if (isSpin && strikerVs < strikerVp) {
      return {
        title: `FLIGHTED ON STUMPS (vS ${strikerVs})`,
        reason: `Exploit ${striker.name.split(' ').pop()}'s spin vulnerability with tossed-up turn.`,
        length: 'full' as PitchLength,
        line: 'stumps' as PitchLine,
        movement: "Wrong'un",
        intent: 'attack' as const
      };
    }
    if (!isSpin && strikerVp < strikerVs) {
      return {
        title: `SHORT BOUNCER AT BODY (vP ${strikerVp})`,
        reason: `Target ${striker.name.split(' ').pop()}'s discomfort against high pace (${strikerVp}).`,
        length: 'bouncer' as PitchLength,
        line: 'stumps' as PitchLine,
        movement: 'Off pitch',
        intent: 'attack' as const
      };
    }
    if (strikerPow >= 86) {
      return {
        title: `WIDE YORKER OUTSIDE OFF (POW ${strikerPow})`,
        reason: `Deny boundary leverage against elite power hitter (POW ${strikerPow}).`,
        length: 'yorker' as PitchLength,
        line: 'wide_outside_off' as PitchLine,
        movement: isSpin ? 'Arm ball' : 'Cuts away',
        intent: 'contain' as const
      };
    }
    return {
      title: `GOOD LENGTH, OFF STUMP (CTRL ${strikerCtrl})`,
      reason: `Probe the 4th-stump channel against ${striker.battingHand} to induce an edge.`,
      length: 'good' as PitchLength,
      line: 'off_stump' as PitchLine,
      movement: isSpin ? 'Stock ball' : 'Swings away',
      intent: 'standard' as const
    };
  })();

  const batterScoringZones = strikerPow >= 86
    ? ['LOFTED DRIVE', 'COW CORNER', 'PULL SHOT']
    : strikerVp >= strikerVs
    ? ['COVER DRIVE', 'STRAIGHT DRIVE', 'SQUARE CUT']
    : ['SWEEP SHOT', 'LATE CUT', 'FLICK'];

  const batterWeaknessSummary = strikerVs < strikerVp - 4
    ? `Spin & Flight (vS ${strikerVs})`
    : strikerVp < strikerVs - 4
    ? `High Pace & Short Ball (vP ${strikerVp})`
    : strikerCtrl < 76
    ? `Late Swing & Yorkers (CTRL ${strikerCtrl})`
    : `4th-Stump Seam & Slower Balls`;

  // Dynamic Bowler Stamina
  const parsedOvers = bowlerOversBowled !== undefined
    ? bowlerOversBowled
    : (parseFloat(bowlerFigures.split('-')[0]) || 0);
  const bowlerStamina = Math.max(
    40,
    Math.min(100, Math.round((bowler.fitness || 95) - parsedOvers * (effort === 'max' ? 8 : effort === 'conserve' ? 3 : 5)))
  );

  // Dynamic Execution Landing Accuracy
  const maxAccuracy = Math.min(99, Math.max(60, Math.round(bowler.ratings.ctrl * (effort === 'max' ? 0.92 : effort === 'conserve' ? 1.03 : 1.0))));
  const minAccuracy = Math.max(52, maxAccuracy - 7);

  const handleApply = () => {
    sound.playTap();
    onUpdateTactics({
      length: assistantMode ? suggestedTactic.length : selectedLength,
      line: assistantMode ? suggestedTactic.line : selectedLine,
      angle: selectedAngle,
      variation: assistantMode ? suggestedTactic.movement : movement,
      intent: assistantMode ? suggestedTactic.intent : intent,
      effort,
      keeperPos,
      speed
    });
    onClose();
  };

  const spinLengths = [
    { id: 'good' as PitchLength, label: 'Stock', sub: 'His natural length' },
    { id: 'full' as PitchLength, label: 'Flighted', sub: 'Tossed up · tempts drives · needs VAR + CTR' },
    { id: 'short' as PitchLength, label: 'Darted', sub: 'Flat & fast · containment · needs CTR' },
    { id: 'yorker' as PitchLength, label: 'Wide line', sub: 'Outside off · containment' }
  ];

  const paceLengths = [
    { id: 'yorker' as PitchLength, label: 'Yorker', sub: 'Death nail · needs CTR + DTH' },
    { id: 'good' as PitchLength, label: 'Stock', sub: 'His natural length' },
    { id: 'bouncer' as PitchLength, label: 'Bouncer', sub: 'Short into the body · needs PACE' },
    { id: 'full' as PitchLength, label: 'Wide line', sub: 'Outside off · containment' }
  ];

  const movements = isSpin
    ? [
        { id: 'Arm ball', label: 'ARM BALL', sub: 'drifts in' },
        { id: 'Stock ball', label: 'STOCK BALL', sub: 'turns away' },
        { id: "Wrong'un", label: "WRONG'UN", sub: 'turns in' },
        { id: 'Off pitch', label: 'OFF THE PITCH', sub: 'skids through' }
      ]
    : [
        { id: 'Swings in', label: 'SWINGS IN', sub: 'at the stumps' },
        { id: 'Stock ball', label: 'STOCK BALL', sub: 'his natural ball' },
        { id: 'Swings away', label: 'SWINGS AWAY', sub: 'for the edge' },
        { id: 'Cuts in', label: 'CUTS IN', sub: 'at the stumps' },
        { id: 'Off pitch', label: 'OFF THE PITCH', sub: 'seam seam' },
        { id: 'Cuts away', label: 'CUTS AWAY', sub: 'for the edge' }
      ];

  const lengthRows: { id: PitchLength; label: string }[] = isSpin
    ? [
        { id: 'short', label: 'FLAT' },
        { id: 'good', label: 'STOCK' },
        { id: 'full', label: 'FLIGHTED' }
      ]
    : [
        { id: 'bouncer', label: 'BOUNCER' },
        { id: 'short', label: 'SHORT' },
        { id: 'good', label: 'GOOD' },
        { id: 'full', label: 'FULL' },
        { id: 'yorker', label: 'YORKER' }
      ];

  const lineCols: { id: PitchLine; label: string }[] = [
    { id: 'leg_side', label: 'LEG SIDE' },
    { id: 'stumps', label: 'STUMPS' },
    { id: 'off_stump', label: 'OFF STUMP' },
    { id: 'wide_outside_off', label: 'WIDE OF OFF' }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center">
      <div className="bg-[#080d18] border-t border-slate-800 rounded-t-3xl w-full max-w-md max-h-[88vh] flex flex-col p-4 shadow-2xl overflow-y-auto">
        {/* Top Header Tabs */}
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
              onClick={() => { sound.playTap(); setActiveTab('fielding'); }}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'fielding' ? 'bg-[#f5b82e] text-black shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              FIELDING
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

        {/* TAB 1: TACTICS */}
        {activeTab === 'tactics' && (
          <div className="py-3 flex flex-col gap-4 text-xs">
            {/* Simple / Advanced Toggle */}
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
              Set up the current bowler for the next over.
            </span>

            {/* Current Bowler Card */}
            <div className="p-3.5 rounded-2xl bg-[#0e1626] border border-slate-800/90 shadow-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono text-cyan-400 uppercase font-bold tracking-wider">
                  CURRENT BOWLER
                </span>
                <span className="text-xs font-mono font-bold text-slate-300">
                  {bowlerFigures}
                </span>
              </div>

              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-7 h-7 rounded-lg bg-[#ef4444] text-white flex items-center justify-center font-mono font-black text-xs shrink-0 shadow-sm">
                  {bowler.jerseyNumber || 11}
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-black text-white font-display truncate leading-tight">
                    {bowler.name.split(' ').pop()} <span className="text-xs text-slate-400 font-sans font-normal">{bowler.age || 34}y</span>
                  </h4>
                  <span className="text-[10px] font-mono text-slate-400">{bowler.role} · {bowler.bowlingArm}</span>
                </div>
              </div>

              {/* 5 Rating Badges */}
              <div className="grid grid-cols-5 gap-1.5 mb-3 text-center font-mono">
                <div className="p-1 rounded bg-[#172238] border border-slate-800 text-[10px]">
                  <span className="block text-[8px] text-slate-400">BOWL</span>
                  <span className="font-bold text-amber-400">{bowler.ratings.bowl}</span>
                </div>
                <div className="p-1 rounded bg-[#172238] border border-slate-800 text-[10px]">
                  <span className="block text-[8px] text-slate-400">MOV</span>
                  <span className="font-bold text-cyan-400">{bowler.ratings.pace}</span>
                </div>
                <div className="p-1 rounded bg-[#172238] border border-slate-800 text-[10px]">
                  <span className="block text-[8px] text-slate-400">CTR</span>
                  <span className="font-bold text-cyan-400">{bowler.ratings.ctrl}</span>
                </div>
                <div className="p-1 rounded bg-[#172238] border border-slate-800 text-[10px]">
                  <span className="block text-[8px] text-slate-400">DTH</span>
                  <span className="font-bold text-cyan-400">{bowler.ratings.dth}</span>
                </div>
                <div className="p-1 rounded bg-[#172238] border border-slate-800 text-[10px]">
                  <span className="block text-[8px] text-slate-400">COMP</span>
                  <span className="font-bold text-cyan-400">{bowler.ratings.tmp || 87}</span>
                </div>
              </div>

              {/* Stamina Meter */}
              <div>
                <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                  <span className="text-slate-400 font-bold">STAMINA</span>
                  <span className={`font-bold ${bowlerStamina > 75 ? 'text-cyan-400' : bowlerStamina > 55 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {bowlerStamina}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      bowlerStamina > 75 ? 'bg-cyan-400' : bowlerStamina > 55 ? 'bg-amber-400' : 'bg-rose-500'
                    }`}
                    style={{ width: `${bowlerStamina}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Assistant Toggle */}
            <div className="flex items-center justify-between p-3.5 bg-[#0e1626] border border-slate-800/90 rounded-2xl">
              <div className="min-w-0 pr-3">
                <span className="text-xs font-bold text-cyan-300 block uppercase font-mono tracking-wider">
                  LET MY ASSISTANT PICK EVERY BALL
                </span>
                <span className="text-[10px] text-slate-400 leading-tight block">
                  Auto-selects {suggestedTactic.title.toLowerCase()} to exploit {striker.name.split(' ').pop()}. Keeps your EFFORT setting.
                </span>
              </div>
              <button
                onClick={() => {
                  sound.playTap();
                  const nextMode = !assistantMode;
                  setAssistantMode(nextMode);
                  if (nextMode) {
                    setSelectedLength(suggestedTactic.length);
                    setSelectedLine(suggestedTactic.line);
                    setMovement(suggestedTactic.movement);
                    setIntent(suggestedTactic.intent);
                  }
                }}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors shrink-0 ${
                  assistantMode ? 'bg-[#f5b82e] justify-end' : 'bg-slate-800 justify-start'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-black block shadow-md" />
              </button>
            </div>

            {/* ========================================= */}
            {/* SIMPLE MODE VIEW */}
            {/* ========================================= */}
            {tacticsLevel === 'simple' ? (
              <>
                {/* Line & Length (4 cards) */}
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1.5">
                    LINE & LENGTH
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(isSpin ? spinLengths : paceLengths).map((opt) => {
                      const isSelected = selectedLength === opt.id;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => {
                            sound.playTap();
                            setSelectedLength(opt.id);
                          }}
                          className={`p-2.5 rounded-xl text-left border transition-all active:scale-98 ${
                            isSelected
                              ? 'bg-[#172554] border-[#38bdf8] text-white shadow-md'
                              : 'bg-[#0e1626] border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <span className={`text-xs font-bold block mb-0.5 ${isSelected ? 'text-[#38bdf8]' : 'text-white'}`}>
                            {opt.label}
                          </span>
                          <span className="text-[9px] text-slate-400 block leading-tight">
                            {opt.sub}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Intent (3 pills) */}
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1.5">
                    INTENT
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'contain' as const, label: 'Contain', sub: 'Fewer wickets, fewer runs' },
                      { id: 'standard' as const, label: 'Standard', sub: 'Balanced' },
                      { id: 'attack' as const, label: 'Attack', sub: 'Bowl for wickets · leaks more' }
                    ].map(item => {
                      const isSelected = intent === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            sound.playTap();
                            setIntent(item.id);
                          }}
                          className={`p-2.5 rounded-xl text-center border transition-all active:scale-98 ${
                            isSelected
                              ? item.id === 'attack'
                                ? 'bg-rose-950/40 border-rose-500 text-rose-300 shadow-sm'
                                : 'bg-amber-500/20 border-amber-400 text-white shadow-sm'
                              : 'bg-[#0e1626] border-slate-800 text-slate-400'
                          }`}
                        >
                          <span className={`text-xs font-black block uppercase ${isSelected ? (item.id === 'attack' ? 'text-rose-400' : 'text-amber-400') : 'text-slate-200'}`}>
                            {item.label}
                          </span>
                          <span className="text-[9px] text-slate-400 block leading-tight mt-0.5">
                            {item.sub}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Effort (3 pills) */}
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1.5">
                    EFFORT
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'conserve' as const, label: 'Conserve', sub: 'Easy on the body · saves STA' },
                      { id: 'standard' as const, label: 'Standard', sub: 'Normal effort' },
                      { id: 'max' as const, label: 'Max effort', sub: 'More pace · tires fast' }
                    ].map(item => {
                      const isSelected = effort === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            sound.playTap();
                            setEffort(item.id);
                          }}
                          className={`p-2.5 rounded-xl text-center border transition-all active:scale-98 ${
                            isSelected
                              ? 'bg-amber-500/20 border-amber-400 text-white shadow-sm'
                              : 'bg-[#0e1626] border-slate-800 text-slate-400'
                          }`}
                        >
                          <span className={`text-xs font-black block uppercase ${isSelected ? 'text-amber-400' : 'text-slate-200'}`}>
                            {item.label}
                          </span>
                          <span className="text-[9px] text-slate-400 block leading-tight mt-0.5">
                            {item.sub}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              /* ========================================= */
              /* ADVANCED MODE VIEW */
              /* ========================================= */
              <>
                {/* Effort Slider + 3 Stops (Exact match to Video 2 at 0:15) */}
                <div className="p-3 rounded-2xl bg-[#0e1626] border border-slate-800">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-2 uppercase font-bold">
                    <span>EFFORT</span>
                    <span className="text-amber-400">
                      {effort === 'conserve' ? 'SAVE ENERGY · tires slower' : effort === 'max' ? 'MAX EFFORT · more pace, tires fast' : 'NORMAL · his usual'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={1}
                    value={effort === 'conserve' ? 0 : effort === 'standard' ? 1 : 2}
                    onChange={(e) => {
                      sound.playTap();
                      const val = Number(e.target.value);
                      setEffort(val === 0 ? 'conserve' : val === 1 ? 'standard' : 'max');
                    }}
                    className="w-full accent-[#f5b82e] h-1.5 bg-slate-800 rounded-lg cursor-pointer mb-2"
                  />
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { id: 'conserve' as const, label: 'SAVE ENERGY', sub: 'tires slower' },
                      { id: 'standard' as const, label: 'NORMAL', sub: 'his usual' },
                      { id: 'max' as const, label: 'MAX EFFORT', sub: 'more pace, tires fast' }
                    ].map(e => (
                      <button
                        key={e.id}
                        onClick={() => { sound.playTap(); setEffort(e.id); }}
                        className={`p-2 rounded-xl border text-center transition-all ${
                          effort === e.id ? 'bg-amber-500/20 border-amber-400 text-white' : 'bg-[#0b111e] border-slate-800 text-slate-400'
                        }`}
                      >
                        <span className="text-[10px] font-bold block">{e.label}</span>
                        <span className="text-[8px] text-slate-400">{e.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Keeper Position */}
                <div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1.5 uppercase font-bold">
                    <span>KEEPER</span>
                    <span className="text-slate-400 font-normal">Up: pins batter in crease</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => { sound.playTap(); setKeeperPos('normal'); }}
                      className={`p-2 rounded-xl font-bold uppercase text-xs border ${
                        keeperPos === 'normal' ? 'bg-amber-400 text-black border-amber-400' : 'bg-[#0e1626] border-slate-800 text-slate-300'
                      }`}
                    >
                      BACK
                    </button>
                    <button
                      onClick={() => { sound.playTap(); setKeeperPos('stumps'); }}
                      className={`p-2 rounded-xl font-bold uppercase text-xs border ${
                        keeperPos === 'stumps' ? 'bg-amber-400 text-black border-amber-400' : 'bg-[#0e1626] border-slate-800 text-slate-300'
                      }`}
                    >
                      UP TO THE STUMPS
                    </button>
                  </div>
                </div>

                {/* Suggested Chip */}
                <div className="p-3 rounded-2xl bg-[#0e1626] border border-cyan-500/40 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-cyan-300 block truncate">
                      💡 SUGGESTED: {suggestedTactic.title}
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      {suggestedTactic.reason}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      sound.playTap();
                      setSelectedLength(suggestedTactic.length);
                      setSelectedLine(suggestedTactic.line);
                      setMovement(suggestedTactic.movement);
                      setIntent(suggestedTactic.intent);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-black font-black text-xs uppercase shadow-sm shrink-0"
                  >
                    USE
                  </button>
                </div>

                {/* Plan For */}
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">PLAN FOR</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => { sound.playTap(); setPlanFor('both'); }}
                      className={`p-2 rounded-xl font-bold uppercase text-xs border ${
                        planFor === 'both' ? 'bg-amber-400 text-black border-amber-400' : 'bg-[#0e1626] border-slate-800 text-slate-300'
                      }`}
                    >
                      BOTH BATTERS
                    </button>
                    <button
                      onClick={() => { sound.playTap(); setPlanFor('batter'); }}
                      className={`p-2 rounded-xl font-bold uppercase text-xs border ${
                        planFor === 'batter' ? 'bg-amber-400 text-black border-amber-400' : 'bg-[#0e1626] border-slate-800 text-slate-300'
                      }`}
                    >
                      {striker.name.split(' ').pop()?.toUpperCase()} ONLY
                    </button>
                  </div>
                </div>

                {/* Where it lands - Angle & 2D Pitch Grid */}
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                    WHERE IT LANDS - TO THE {striker.battingHand}
                  </span>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <button
                      onClick={() => { sound.playTap(); setSelectedAngle('round'); }}
                      className={`p-2 rounded-xl border text-left ${
                        selectedAngle === 'round' ? 'bg-amber-500/20 border-amber-400 text-white' : 'bg-[#0e1626] border-slate-800 text-slate-400'
                      }`}
                    >
                      <span className="text-xs font-bold block">ROUND THE WICKET</span>
                      <span className="text-[8px] text-slate-400">angles across him</span>
                    </button>
                    <button
                      onClick={() => { sound.playTap(); setSelectedAngle('over'); }}
                      className={`p-2 rounded-xl border text-left ${
                        selectedAngle === 'over' ? 'bg-amber-500/20 border-amber-400 text-white' : 'bg-[#0e1626] border-slate-800 text-slate-400'
                      }`}
                    >
                      <span className="text-xs font-bold block text-amber-400">OVER THE WICKET</span>
                      <span className="text-[8px] text-slate-400">angles in at him</span>
                    </button>
                  </div>

                  {/* 2D Interactive Pitch Target Matrix */}
                  <div className="p-3 rounded-2xl bg-[#14231b] border border-emerald-600/40 relative select-none">
                    <div className="flex flex-col gap-1.5">
                      {lengthRows.map(len => (
                        <div key={len.id} className="flex items-center gap-1.5">
                          <span className="w-16 text-[9px] font-mono font-bold text-slate-400 uppercase tracking-tight">
                            {len.label}
                          </span>
                          <div className="flex-1 grid grid-cols-4 gap-1">
                            {lineCols.map(ln => {
                              const isTarget = selectedLength === len.id && selectedLine === ln.id;
                              return (
                                <button
                                  key={ln.id}
                                  onClick={() => {
                                    sound.playTap();
                                    setSelectedLength(len.id);
                                    setSelectedLine(ln.id);
                                  }}
                                  className={`h-7 rounded-md border flex items-center justify-center transition-all ${
                                    isTarget
                                      ? 'bg-amber-400 border-white shadow-lg scale-105 z-10'
                                      : 'bg-[#0f172a]/70 border-slate-700/60 hover:bg-slate-800/80'
                                  }`}
                                >
                                  {isTarget && (
                                    <div className="w-3.5 h-3.5 rounded-full bg-black flex items-center justify-center">
                                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Column Labels */}
                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-700/60">
                      <span className="w-16 text-[8px] font-mono text-slate-500">LINE</span>
                      <div className="flex-1 grid grid-cols-4 gap-1 text-center">
                        {lineCols.map(ln => (
                          <span key={ln.id} className="text-[8px] font-mono text-slate-400 uppercase leading-none">
                            {ln.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* How It Moves */}
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                    HOW IT MOVES
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {movements.map(m => {
                      const isSelected = movement === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => { sound.playTap(); setMovement(m.id); }}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            isSelected
                              ? 'bg-amber-500/20 border-amber-400 text-white shadow-sm'
                              : 'bg-[#0e1626] border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <span className={`text-xs font-bold block ${isSelected ? 'text-amber-400' : 'text-slate-200'}`}>
                            {m.label}
                          </span>
                          <span className="text-[9px] text-slate-400 block">{m.sub}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Speed Slider + 3 Stops (Exact match to Video 2 at 0:34) */}
                <div className="p-3 rounded-2xl bg-[#0e1626] border border-slate-800">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-2 font-bold">
                    <span>SPEED</span>
                    <span className="text-amber-400 uppercase">
                      {speed === 'slower' ? 'SLOWER · reach for it' : speed === 'quicker' ? 'QUICKER · beat for pace' : 'NORMAL PACE · his rhythm'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={1}
                    value={speed === 'slower' ? 0 : speed === 'standard' ? 1 : 2}
                    onChange={(e) => {
                      sound.playTap();
                      const val = Number(e.target.value);
                      setSpeed(val === 0 ? 'slower' : val === 1 ? 'standard' : 'quicker');
                    }}
                    className="w-full accent-[#f5b82e] h-1.5 bg-slate-800 rounded-lg cursor-pointer mb-2"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'slower' as const, label: 'SLOWER', sub: 'reach for it' },
                      { id: 'standard' as const, label: 'NORMAL PACE', sub: 'his rhythm' },
                      { id: 'quicker' as const, label: 'QUICKER', sub: 'beat for pace' }
                    ].map(s => (
                      <button
                        key={s.id}
                        onClick={() => { sound.playTap(); setSpeed(s.id); }}
                        className={`p-2 rounded-xl border text-center ${
                          speed === s.id ? 'bg-amber-500/20 border-amber-400 text-white' : 'bg-[#0b111e] border-slate-800 text-slate-400'
                        }`}
                      >
                        <span className="text-[10px] font-bold block">{s.label}</span>
                        <span className="text-[8px] text-slate-400">{s.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tactical Plan Summary Box + 6-Ball Over Sequence (Exact match to Video 2 at 0:36-0:41) */}
                <div className="p-3.5 rounded-2xl bg-[#0e1626] border border-slate-800 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-slate-400 block font-bold">
                        THE BALL {overMixPlan === 'mix' ? `(BALL ${activePlanBallIdx + 1}/6)` : ''}
                      </span>
                      <span className="text-xs font-bold text-white block">
                        {movement}, {selectedLength} length on {selectedLine.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {selectedAngle} the wicket · {intent} intent · {keeperPos === 'stumps' ? 'keeper up' : 'keeper back'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-mono text-slate-400 block">LANDS</span>
                      <span className="text-sm font-black font-mono text-emerald-400">{minAccuracy}-{maxAccuracy}%</span>
                    </div>
                  </div>

                  {/* Plan Mode Toggle: BOWL IT ALL OVER <-> MIX IT UP */}
                  <div className="pt-2.5 border-t border-slate-800/80">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1.5 font-bold">
                      <span>PLAN</span>
                      <span className="text-amber-400">
                        {overMixPlan === 'all_over' ? 'BOWL IT ALL OVER' : 'MIX IT UP (6-BALL SEQUENCE)'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <button
                        onClick={() => { sound.playTap(); setOverMixPlan('all_over'); }}
                        className={`py-1.5 rounded-xl font-mono font-bold text-[10px] uppercase border ${
                          overMixPlan === 'all_over'
                            ? 'bg-amber-400 text-black border-amber-400'
                            : 'bg-[#0b111e] text-slate-400 border-slate-800'
                        }`}
                      >
                        BOWL IT ALL OVER
                      </button>
                      <button
                        onClick={() => { sound.playTap(); setOverMixPlan('mix'); }}
                        className={`py-1.5 rounded-xl font-mono font-bold text-[10px] uppercase border ${
                          overMixPlan === 'mix'
                            ? 'bg-amber-400 text-black border-amber-400'
                            : 'bg-[#0b111e] text-slate-400 border-slate-800'
                        }`}
                      >
                        MIX IT UP
                      </button>
                    </div>

                    {/* 6-Ball Sequence Dots (1 2 3 4 5 6) */}
                    <div className="grid grid-cols-6 gap-1.5">
                      {[0, 1, 2, 3, 4, 5].map((bIdx) => {
                        const isFocused = overMixPlan === 'all_over' || activePlanBallIdx === bIdx;
                        return (
                          <button
                            key={bIdx}
                            onClick={() => {
                              sound.playTap();
                              setOverMixPlan('mix');
                              setActivePlanBallIdx(bIdx);
                            }}
                            className={`h-7 rounded-lg font-mono font-black text-xs flex items-center justify-center border transition-all ${
                              isFocused
                                ? 'bg-[#f5b82e]/20 border-[#f5b82e] text-[#f5b82e]'
                                : 'bg-[#0b111e] border-slate-800 text-slate-400'
                            }`}
                          >
                            {bIdx + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}

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
        )}

        {/* TAB 2: FIELDING & RADAR (Exact match to Video 1 at 1:05-1:18 & Video 2 at 0:42-0:55) */}
        {activeTab === 'fielding' && (() => {
          const isPowerplay = (ballHistory.length / 6) < 6;
          const maxOutsideAllowed = isPowerplay ? 2 : 5;
          const currentOutsideCount = fielders.filter(f => f.isDeep || Math.hypot(f.x, f.y) > 55).length;

          return (
            <div className="py-3 flex flex-col gap-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400 font-sans flex-1">
                  Drag fielders into place. Gold: where he scores. Amber: where he gets out.
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => {
                      if (fieldHistory.length === 0) return;
                      sound.playTap();
                      const prev = fieldHistory[fieldHistory.length - 1];
                      setFieldHistory(h => h.slice(0, -1));
                      prev.forEach(pf => onFielderMove(pf.id, pf.x, pf.y));
                    }}
                    disabled={fieldHistory.length === 0}
                    className="px-2.5 py-1 rounded-lg bg-[#121927] border border-slate-700 text-[10px] font-mono font-bold text-slate-300 disabled:opacity-40"
                  >
                    ↩ Undo
                  </button>
                  <button
                    onClick={() => {
                      sound.playTap();
                      setFieldHistory(h => [...h, fielders]);
                      onApplyFieldPreset('auto');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#121927] border border-slate-700 text-[10px] font-mono font-bold text-slate-300"
                  >
                    ↺ Reset
                  </button>
                  <span className="px-2 py-1 rounded-lg bg-[#172238] border border-amber-500/40 text-amber-300 font-mono font-bold text-[10px]">
                    OUTSIDE {currentOutsideCount}/{maxOutsideAllowed}
                  </span>
                </div>
              </div>

              {/* Batter Profile Header */}
              <div className="p-3 bg-[#0e1626] rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="font-bold text-white text-xs block">
                    #{striker.jerseyNumber || 9} {striker.name.split(' ').pop()} ({striker.battingHand})
                  </span>
                  <p className="text-[10px] text-slate-400">
                    Scores: <span className="text-amber-400 font-bold">{batterScoringZones.join(' · ')}</span>
                    {' · '}Gets out to: <span className="text-rose-400 font-bold">{batterWeaknessSummary}</span>
                  </p>
                </div>
              </div>

              {/* Field Preset Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { setFieldHistory(h => [...h, fielders]); onApplyFieldPreset('auto'); }}
                  className="p-2.5 rounded-xl bg-amber-400 text-black font-bold text-left active:scale-95 shadow-md"
                >
                  <span className="block text-xs uppercase font-black">AUTO CAPTAIN</span>
                  <span className="text-[9px] opacity-80">Default balance</span>
                </button>
                <button
                  onClick={() => { setFieldHistory(h => [...h, fielders]); onApplyFieldPreset('off_heavy'); }}
                  className="p-2.5 rounded-xl bg-[#0e1626] border border-slate-800 text-white font-bold text-left hover:border-slate-700 active:scale-95"
                >
                  <span className="block text-xs uppercase font-black text-amber-400">7-2 OFF</span>
                  <span className="text-[9px] text-slate-400">Pack the off side</span>
                </button>
                <button
                  onClick={() => { setFieldHistory(h => [...h, fielders]); onApplyFieldPreset('attack'); }}
                  className="p-2.5 rounded-xl bg-[#0e1626] border border-rose-500/40 text-white font-bold text-left hover:border-rose-400 active:scale-95"
                >
                  <span className="block text-xs uppercase font-black text-rose-400">ATTACK (SLIPS)</span>
                  <span className="text-[9px] text-slate-400">Catching ring</span>
                </button>
                <button
                  onClick={() => { setFieldHistory(h => [...h, fielders]); onApplyFieldPreset('death'); }}
                  className="p-2.5 rounded-xl bg-[#0e1626] border border-cyan-500/40 text-white font-bold text-left hover:border-cyan-400 active:scale-95"
                >
                  <span className="block text-xs uppercase font-black text-cyan-400">DEATH STIFLER</span>
                  <span className="text-[9px] text-slate-400">Boundary riders</span>
                </button>
              </div>

              {/* Circular Field Radar with Direct Pointer Dragging & Gold Shot-Zone Labels */}
              <div
                onPointerDown={(e) => {
                  if (!selectedFielder || draggingRadarFielderId !== null) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const relX = ((e.clientX - rect.left) / rect.width - 0.5) / 0.42;
                  const relY = ((e.clientY - rect.top) / rect.height - 0.5) / 0.42;
                  const clampedX = Math.max(-92, Math.min(92, Math.round(relX)));
                  const clampedY = Math.max(-92, Math.min(92, Math.round(relY)));
                  setFieldHistory(h => [...h, fielders]);
                  onFielderMove(selectedFielder.id, clampedX, clampedY);
                  setSelectedFielder(prev => prev ? { ...prev, x: clampedX, y: clampedY, isDeep: Math.hypot(clampedX, clampedY) > 55 } : null);
                }}
                onPointerMove={(e) => {
                  if (draggingRadarFielderId === null) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const relX = ((e.clientX - rect.left) / rect.width - 0.5) / 0.42;
                  const relY = ((e.clientY - rect.top) / rect.height - 0.5) / 0.42;
                  const clampedX = Math.max(-92, Math.min(92, Math.round(relX)));
                  const clampedY = Math.max(-92, Math.min(92, Math.round(relY)));
                  onFielderMove(draggingRadarFielderId, clampedX, clampedY);
                }}
                onPointerUp={() => setDraggingRadarFielderId(null)}
                onPointerCancel={() => setDraggingRadarFielderId(null)}
                className="relative w-[95%] aspect-square max-w-[420px] mx-auto rounded-full bg-gradient-to-b from-[#2e6b3b] via-[#255e32] to-[#1b4a25] border-4 border-slate-800 shadow-inner flex items-center justify-center overflow-hidden my-1 cursor-crosshair touch-none select-none"
              >
                {/* Boundary Rope & 30-yard Circle */}
                <div className="absolute w-[92%] h-[92%] rounded-full border border-white/45 pointer-events-none" />
                <div className="absolute w-[58%] h-[58%] rounded-full border border-dashed border-white/50 pointer-events-none" />

                {/* Pitch in Center */}
                <div className="absolute w-7 h-16 bg-[#c7a77b] rounded border border-[#a18359] shadow-md flex flex-col justify-between items-center py-1 pointer-events-none z-10">
                  <div className="w-5 h-0.5 bg-white" />
                  <div className="w-5 h-0.5 bg-white" />
                </div>

                {/* Dynamic Gold Shot-Zone Labels on Turf (Matching Video 1 at 1:06 & Video 2 at 0:42) */}
                <div className="absolute top-5 inset-x-0 text-center pointer-events-none z-10">
                  <span className="px-2 py-0.5 rounded bg-black/55 text-[#f5b82e] font-mono text-[8.5px] font-black border border-dashed border-[#f5b82e]/60">
                    {batterScoringZones[0]}
                  </span>
                </div>
                <div className="absolute top-16 right-4 pointer-events-none z-10">
                  <span className="px-2 py-0.5 rounded bg-black/55 text-[#f5b82e] font-mono text-[8.5px] font-black border border-dashed border-[#f5b82e]/60">
                    {batterScoringZones[1]}
                  </span>
                </div>
                <div className="absolute top-1/2 left-3 pointer-events-none z-10">
                  <span className="px-2 py-0.5 rounded bg-black/55 text-[#f5b82e] font-mono text-[8.5px] font-black border border-dashed border-[#f5b82e]/60">
                    {batterScoringZones[2]}
                  </span>
                </div>

                {/* 9 Draggable Fielders on Radar */}
                {fielders.map((f, idx) => {
                  const fPlayer = fieldingPlayers[idx % Math.max(1, fieldingPlayers.length)];
                  const defaultJerseys = [17, 47, 8, 2, 56, 18, 23, 24, 4];
                  const jNum = fPlayer?.jerseyNumber || defaultJerseys[idx % defaultJerseys.length];
                  const isSelected = selectedFielder?.id === f.id || draggingRadarFielderId === f.id;

                  const leftPercent = 50 + (f.x * 0.42);
                  const topPercent = 50 + (f.y * 0.42);

                  return (
                    <div
                      key={f.id}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        sound.playTap();
                        setFieldHistory(h => [...h, fielders]);
                        setSelectedFielder(f);
                        setDraggingRadarFielderId(f.id);
                      }}
                      style={{ left: `${leftPercent}%`, top: `${topPercent}%` }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-20 transition-transform ${
                        isSelected ? 'scale-125 z-30' : 'hover:scale-110'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center font-mono font-black text-[9px] shadow-lg border-2 ${
                        isSelected
                          ? 'bg-[#f59e0b] text-black border-white shadow-amber-500/50'
                          : 'bg-[#ef4444] text-white border-white'
                      }`}>
                        {jNum}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-[10px] text-slate-400 font-sans text-center">
                Drag any fielder circle directly on the turf, or tap a fielder and tap a new spot.
              </p>

              <button
                onClick={handleApply}
                className="w-full py-4 bg-[#f5b82e] hover:bg-[#eab308] text-black font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-amber-500/20 active:scale-98 transition-all"
              >
                APPLY TACTICS
              </button>
            </div>
          );
        })()}

        {/* TAB 3: COMMENTARY */}
        {activeTab === 'commentary' && (
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
