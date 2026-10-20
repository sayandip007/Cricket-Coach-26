import React, { useState, useMemo } from 'react';
import {
  X,
  Crosshair,
  Shield,
  FlaskConical,
  Building2,
  Play,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  UserCheck,
  Compass,
  ArrowRightLeft,
  ChevronRight,
  Flame,
  Award,
  Layers,
  HelpCircle
} from 'lucide-react';
import { useGame } from '../../context/GameContext';
import {
  FIELD_TEMPLATES,
  FieldTemplateId,
  validateFieldRestrictions,
  analyzeBatterBowlerMatchup,
  runTacticalScenarioSimulation,
  ScenarioSimResult,
  getDefaultInfrastructure,
  getFacilitySpecs,
  ClubInfrastructureState,
  generateCricketDirectorBriefing,
  CricketDirectorBriefing
} from '../../services/cricketServices';
import { FielderPosition, PitchType } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';

interface TacticalCommandSuiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'director' | 'field' | 'matchups' | 'simulator' | 'infrastructure';
}

export const TacticalCommandSuiteModal: React.FC<TacticalCommandSuiteModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'director'
}) => {
  const {
    userTeam,
    teams,
    players,
    setTeams,
    matchLiveState,
    updateFielders,
    completedMatchesHistory,
    homePitch,
    setHomePitch
  } = useGame();

  const [activeTab, setActiveTab] = useState<'director' | 'field' | 'matchups' | 'simulator' | 'infrastructure'>(initialTab);

  // ==========================================================================
  // 1. INTERACTIVE FIELD EDITOR STATE
  // ==========================================================================
  const [selectedPresetId, setSelectedPresetId] = useState<FieldTemplateId>('middle_squeeze');
  const [customFielders, setCustomFielders] = useState<FielderPosition[]>(
    matchLiveState?.bowlingTactics.fielders || FIELD_TEMPLATES[2].positions
  );
  const [selectedFielderId, setSelectedFielderId] = useState<number | null>(1);
  const [editorPhaseOver, setEditorPhaseOver] = useState<number>(matchLiveState?.innings1.overs || 4);
  const [fieldSavedBanner, setFieldSavedBanner] = useState<string | null>(null);

  const fieldValidation = useMemo(
    () => validateFieldRestrictions(customFielders, matchLiveState?.format || 'T20', editorPhaseOver),
    [customFielders, matchLiveState?.format, editorPhaseOver]
  );

  const handleApplyPreset = (presetId: FieldTemplateId) => {
    sound.playTap();
    setSelectedPresetId(presetId);
    const found = FIELD_TEMPLATES.find(t => t.id === presetId);
    if (found) {
      setCustomFielders(found.positions.map(p => ({ ...p })));
      if (matchLiveState) {
        updateFielders(found.positions.map(p => ({ ...p })));
      }
      setFieldSavedBanner(`Applied "${found.name}" to tactical formation.`);
      setTimeout(() => setFieldSavedBanner(null), 2500);
    }
  };

  const handleFieldClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (selectedFielderId === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = Math.max(8, Math.min(92, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
    const yPct = Math.max(8, Math.min(92, Math.round(((e.clientY - rect.top) / rect.height) * 100)));
    const dx = xPct - 50;
    const dy = yPct - 50;
    const isBoundary = Math.sqrt(dx * dx + dy * dy) > 26;

    sound.playTap();
    const next = customFielders.map(f =>
      f.id === selectedFielderId ? { ...f, x: xPct, y: yPct, isBoundary } : f
    );
    setCustomFielders(next);
    if (matchLiveState) {
      updateFielders(next);
    }
  };

  // ==========================================================================
  // 2. BATTER VS BOWLER ANALYTICS STATE
  // ==========================================================================
  const userSquad = useMemo(
    () => players.filter(p => p.clubId === userTeam.id),
    [players, userTeam.id]
  );
  const opponentTeams = useMemo(
    () => teams.filter(t => t.id !== userTeam.id),
    [teams, userTeam.id]
  );
  const [selectedOppTeamId, setSelectedOppTeamId] = useState<string>(opponentTeams[0]?.id || 'team_mum');
  const oppSquad = useMemo(
    () => players.filter(p => p.clubId === selectedOppTeamId),
    [players, selectedOppTeamId]
  );

  const [selectedBatterId, setSelectedBatterId] = useState<string>(userSquad[0]?.id || '');
  const [selectedBowlerId, setSelectedBowlerId] = useState<string>(oppSquad[0]?.id || '');

  const activeBatter = useMemo(
    () => players.find(p => p.id === selectedBatterId) || userSquad[0] || players[0],
    [players, selectedBatterId, userSquad]
  );
  const activeBowler = useMemo(
    () => players.find(p => p.id === selectedBowlerId) || oppSquad[0] || players[1],
    [players, selectedBowlerId, oppSquad]
  );

  const matchupReport = useMemo(() => {
    if (!activeBatter || !activeBowler) return null;
    return analyzeBatterBowlerMatchup(activeBatter, activeBowler, completedMatchesHistory);
  }, [activeBatter, activeBowler, completedMatchesHistory]);

  // ==========================================================================
  // 3. TACTICAL SCENARIO SIMULATOR STATE
  // ==========================================================================
  const [simPitch, setSimPitch] = useState<PitchType>('Balanced Sporting');
  const [simBatIntent, setSimBatIntent] = useState<'defensive' | 'balanced' | 'attacking'>('attacking');
  const [simBowlAggression, setSimBowlAggression] = useState<'defensive' | 'balanced' | 'attacking'>('balanced');
  const [simIterations, setSimIterations] = useState<number>(20);
  const [scenarioResult, setScenarioResult] = useState<ScenarioSimResult | null>(null);

  const selectedOppTeam = useMemo(
    () => teams.find(t => t.id === selectedOppTeamId) || opponentTeams[0] || teams[0],
    [teams, selectedOppTeamId, opponentTeams]
  );

  const handleRunScenario = () => {
    sound.playTap();
    const res = runTacticalScenarioSimulation(userTeam, selectedOppTeam, players, {
      iterations: simIterations,
      pitchType: simPitch,
      userBattingIntent: simBatIntent,
      userBowlingAggression: simBowlAggression,
      fieldPreset: selectedPresetId
    });
    setScenarioResult(res);
  };

  // ==========================================================================
  // 4. STADIUM & TRAINING INFRASTRUCTURE STATE
  // ==========================================================================
  const [infraState, setInfraState] = useState<ClubInfrastructureState>(() => {
    try {
      const saved = localStorage.getItem(`cc26_infra_${userTeam.id}`);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return getDefaultInfrastructure(userTeam.id);
  });
  const [infraMsg, setInfraMsg] = useState<string | null>(null);

  const facilitySpecs = useMemo(() => getFacilitySpecs(infraState), [infraState]);

  const handleUpgradeFacility = (key: keyof Omit<ClubInfrastructureState, 'teamId'>, costCr: number, name: string) => {
    if (userTeam.purseCr < costCr) {
      setInfraMsg(`Insufficient franchise purse (${userTeam.purseCr.toFixed(2)} Cr available, ${costCr.toFixed(2)} Cr required).`);
      return;
    }
    sound.playTap();
    const updated: ClubInfrastructureState = {
      ...infraState,
      [key]: Math.min(5, infraState[key] + 1)
    };
    setInfraState(updated);
    try {
      localStorage.setItem(`cc26_infra_${userTeam.id}`, JSON.stringify(updated));
    } catch {
      // ignore
    }
    setTeams(prev =>
      prev.map(t =>
        t.id === userTeam.id
          ? { ...t, purseCr: Number((t.purseCr - costCr).toFixed(2)) }
          : t
      )
    );
    setInfraMsg(`Upgraded ${name} to Tier ${updated[key]}! (-${costCr.toFixed(2)} Cr)`);
    setTimeout(() => setInfraMsg(null), 3500);
  };

  // ==========================================================================
  // 5. AI CRICKET DIRECTOR STATE & ACTIONS
  // ==========================================================================
  const [directorBanner, setDirectorBanner] = useState<string | null>(null);

  const directorBriefing = useMemo(
    () =>
      generateCricketDirectorBriefing(
        userTeam,
        selectedOppTeam,
        players,
        (homePitch || 'Balanced Sporting') as PitchType,
        completedMatchesHistory
      ),
    [userTeam, selectedOppTeam, players, homePitch, completedMatchesHistory]
  );

  const handleApplyDirectorXI = () => {
    sound.playTap();
    const recommendedIds = directorBriefing.recommendedXI.playerIds;
    setTeams(prev =>
      prev.map(t => (t.id === userTeam.id ? { ...t, playingXIIds: recommendedIds } : t))
    );
    setDirectorBanner(
      `✓ Applied ${directorBriefing.director.name}'s Recommended Starting XI (${recommendedIds.length} players updated).`
    );
    setTimeout(() => setDirectorBanner(null), 3500);
  };

  const handleOrderCuratorPitch = () => {
    sound.playTap();
    const pitch = directorBriefing.pitchRecommendation.suggestedPitch;
    setHomePitch(pitch);
    setDirectorBanner(`✓ Curator order placed: Home pitch prepared as "${pitch}".`);
    setTimeout(() => setDirectorBanner(null), 3500);
  };

  const handleDeployDirectorField = (presetId: FieldTemplateId, phaseName: string) => {
    sound.playTap();
    const found = FIELD_TEMPLATES.find(t => t.id === presetId);
    if (found) {
      setSelectedPresetId(presetId);
      setCustomFielders(found.positions.map(p => ({ ...p })));
      if (matchLiveState) {
        updateFielders(found.positions.map(p => ({ ...p })));
      }
      setDirectorBanner(`✓ Deployed ${phaseName} field formation: "${found.name}".`);
      setTimeout(() => setDirectorBanner(null), 3500);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="bg-[#0b101d] border border-slate-800 rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-[#101729] border-b border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold block">
              {userTeam.name.toUpperCase()} · WAR ROOM &amp; INFRASTRUCTURE
            </span>
            <h2 className="text-lg font-black text-white uppercase font-display tracking-wide">
              Tactical Command Suite &amp; Club Facilities
            </h2>
          </div>
          <button
            onClick={() => {
              sound.playTap();
              onClose();
            }}
            className="p-2 rounded-xl bg-slate-800/80 text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Feedback Banner */}
        {(directorBanner || fieldSavedBanner) && (
          <div className="px-6 py-2 bg-emerald-500/20 border-b border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{directorBanner || fieldSavedBanner}</span>
          </div>
        )}

        {/* Navigation Tabs (5 Tabs) */}
        <div className="px-6 py-2.5 bg-[#0d1322] border-b border-slate-800/80 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          <button
            onClick={() => { sound.playTap(); setActiveTab('director'); }}
            className={`py-2 px-3 rounded-xl text-xs font-bold uppercase flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'director'
                ? 'bg-amber-400 text-black shadow'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" /> AI Director
          </button>
          <button
            onClick={() => { sound.playTap(); setActiveTab('field'); }}
            className={`py-2 px-3 rounded-xl text-xs font-bold uppercase flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'field'
                ? 'bg-amber-400 text-black shadow'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Shield className="w-3.5 h-3.5" /> Field Editor
          </button>
          <button
            onClick={() => { sound.playTap(); setActiveTab('matchups'); }}
            className={`py-2 px-3 rounded-xl text-xs font-bold uppercase flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'matchups'
                ? 'bg-amber-400 text-black shadow'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" /> Matchups
          </button>
          <button
            onClick={() => { sound.playTap(); setActiveTab('simulator'); }}
            className={`py-2 px-3 rounded-xl text-xs font-bold uppercase flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'simulator'
                ? 'bg-amber-400 text-black shadow'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" /> What-If Lab
          </button>
          <button
            onClick={() => { sound.playTap(); setActiveTab('infrastructure'); }}
            className={`py-2 px-3 rounded-xl text-xs font-bold uppercase flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'infrastructure'
                ? 'bg-amber-400 text-black shadow'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" /> Facilities
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* ============================================================== */}
          {/* TAB 0: AI CRICKET DIRECTOR EXECUTIVE BRIEFING                   */}
          {/* ============================================================== */}
          {activeTab === 'director' && (
            <div className="space-y-6">
              {/* Director Profile & Opponent Selector */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-[#121c32] via-[#0f172a] to-[#1a1c2e] border border-amber-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-400/20 border border-amber-400/50 flex items-center justify-center text-amber-300 font-black text-lg font-mono shrink-0 shadow-lg">
                    {directorBriefing.director.avatarTag}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-white uppercase font-display tracking-wide">
                        {directorBriefing.director.name}
                      </h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        {directorBriefing.director.experience}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 font-mono block">
                      {directorBriefing.director.title} · {userTeam.name}
                    </span>
                  </div>
                </div>

                {/* Opponent Selector Dropdown */}
                <div className="flex items-center gap-2 bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                  <span className="text-[11px] font-mono text-slate-400 uppercase">Target Opponent:</span>
                  <select
                    value={selectedOppTeamId}
                    onChange={e => {
                      sound.playTap();
                      setSelectedOppTeamId(e.target.value);
                    }}
                    className="bg-[#0b101d] text-white text-xs font-bold rounded-lg px-2.5 py-1 border border-slate-700 outline-none"
                  >
                    {opponentTeams.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.shortName})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Executive Summary & Opponent Intel */}
              <div className="p-4 rounded-2xl bg-[#0f172a] border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> EXECUTIVE STRATEGIC BRIEFING
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    H2H: {directorBriefing.opponentAnalysis.h2h.teamAWins}W - {directorBriefing.opponentAnalysis.h2h.teamBWins}L ({directorBriefing.opponentAnalysis.h2h.totalPlayed} played)
                  </span>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed font-sans italic border-l-2 border-amber-400 pl-3">
                  "{directorBriefing.executiveSummary}"
                </p>

                {/* Opponent Danger Men Chips */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
                  {directorBriefing.opponentAnalysis.dangerBatter && (
                    <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[9px] font-mono text-amber-400 uppercase font-bold block">
                          Opponent Danger Batter
                        </span>
                        <span className="font-bold text-white">
                          {directorBriefing.opponentAnalysis.dangerBatter.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono block">
                          {directorBriefing.opponentAnalysis.dangerBatter.battingHand} · {directorBriefing.opponentAnalysis.dangerBatter.ratings.bat} BAT
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-mono text-rose-400 font-bold">
                          {directorBriefing.opponentAnalysis.dangerBatter.ratings.pow || 80} POW
                        </span>
                      </div>
                    </div>
                  )}

                  {directorBriefing.opponentAnalysis.dangerBowler && (
                    <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[9px] font-mono text-cyan-400 uppercase font-bold block">
                          Opponent Danger Bowler
                        </span>
                        <span className="font-bold text-white">
                          {directorBriefing.opponentAnalysis.dangerBowler.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono block">
                          {directorBriefing.opponentAnalysis.dangerBowler.bowlingStyle || 'Pace'} · {directorBriefing.opponentAnalysis.dangerBowler.ratings.bowl} BOWL
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-mono text-cyan-400 font-bold">
                          {directorBriefing.opponentAnalysis.dangerBowler.ratings.dth || 78} DTH
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Recommended Playing XI Card */}
              <div className="p-4 rounded-2xl bg-[#0f172a] border border-slate-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-black text-white uppercase font-display">
                        RECOMMENDED STARTING PLAYING XI
                      </h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        {directorBriefing.recommendedXI.pitchSuitabilityScore}% Matchup Fit
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Balance: {directorBriefing.recommendedXI.balance.batters} Batters · {directorBriefing.recommendedXI.balance.wicketkeeper} WK · {directorBriefing.recommendedXI.balance.allrounders} AR · {directorBriefing.recommendedXI.balance.pacers} Pace · {directorBriefing.recommendedXI.balance.spinners} Spin
                    </span>
                  </div>

                  <button
                    onClick={handleApplyDirectorXI}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black font-extrabold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-950/40 transition-all uppercase font-mono"
                  >
                    <UserCheck className="w-4 h-4" /> APPLY DIRECTOR'S XI
                  </button>
                </div>

                {/* Proposed Changes from Current Lineup */}
                {directorBriefing.recommendedXI.changesFromCurrent.length > 0 ? (
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-amber-500/30 space-y-2">
                    <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block">
                      PROPOSED ROTATIONS ({directorBriefing.recommendedXI.changesFromCurrent.length})
                    </span>
                    <div className="space-y-1.5">
                      {directorBriefing.recommendedXI.changesFromCurrent.map((c, idx) => (
                        <div
                          key={idx}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-2 rounded-lg bg-black/40 border border-slate-800 text-xs gap-1"
                        >
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300">
                              IN: {c.inPlayer.name} ({c.inPlayer.role})
                            </span>
                            <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-rose-500/20 text-rose-300">
                              OUT: {c.outPlayer.name} ({c.outPlayer.role})
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 italic">{c.rationale}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800 text-[11px] text-emerald-400 font-mono">
                    ✓ Current Playing XI is perfectly aligned with the Director's tactical blueprint.
                  </div>
                )}

                {/* Recommended XI Players Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {directorBriefing.recommendedXI.players.map((p, idx) => (
                    <div
                      key={p.id}
                      className="p-2 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-slate-800 text-[10px] font-mono font-bold text-slate-400 flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-white">{p.name}</span>
                            {p.isCaptain && <span className="text-[9px] text-amber-400 font-bold">(C)</span>}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {p.role} · {p.battingHand}
                          </span>
                        </div>
                      </div>
                      <div className="text-right font-mono text-[10px]">
                        <span className="text-slate-300 font-bold">
                          {p.role === 'Batsman' ? `${p.ratings.bat} BAT` : `${p.ratings.bowl} BOWL`}
                        </span>
                        <div className="text-[9px] text-slate-500">
                          {p.fitness}% Fit · {p.form} Form
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pitch Curator Directive Card */}
              <div className="p-4 rounded-2xl bg-[#0f172a] border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">
                      HOME PITCH CURATOR DIRECTIVE
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Recommended: {directorBriefing.pitchRecommendation.suggestedPitch}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200">
                    "{directorBriefing.pitchRecommendation.curatorInstruction}"
                  </p>
                  <p className="text-[11px] text-slate-400 italic">
                    Reason: {directorBriefing.pitchRecommendation.strategicReason} (Current setting: "{homePitch}")
                  </p>
                </div>

                <button
                  onClick={handleOrderCuratorPitch}
                  className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-95 text-black font-extrabold text-xs uppercase font-mono shadow-lg transition-all shrink-0"
                >
                  ORDER CURATOR DIRECTIVE
                </button>
              </div>

              {/* Tactical Phase Blueprint (Powerplay / Middle / Death) */}
              <div className="space-y-2">
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                  TACTICAL PHASE BLUEPRINTS &amp; FIELD FORMATIONS
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Powerplay */}
                  <div className="p-3.5 rounded-2xl bg-[#0f172a] border border-slate-800 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-white uppercase font-mono">
                          POWERPLAY (OVERS 1–6)
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-rose-500/20 text-rose-300">
                          {directorBriefing.tacticalGamePlan.powerplay.intent.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300">
                        {directorBriefing.tacticalGamePlan.powerplay.instructions}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        handleDeployDirectorField(
                          directorBriefing.tacticalGamePlan.powerplay.fieldPresetId,
                          'Powerplay'
                        )
                      }
                      className="w-full py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-amber-400 flex items-center justify-center gap-1 active:scale-98 transition-all"
                    >
                      <Shield className="w-3 h-3" /> Deploy Powerplay Formation
                    </button>
                  </div>

                  {/* Middle Overs */}
                  <div className="p-3.5 rounded-2xl bg-[#0f172a] border border-slate-800 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-white uppercase font-mono">
                          MIDDLE OVERS (OVERS 7–15)
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-cyan-500/20 text-cyan-300">
                          {directorBriefing.tacticalGamePlan.middleOvers.intent.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300">
                        {directorBriefing.tacticalGamePlan.middleOvers.instructions}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        handleDeployDirectorField(
                          directorBriefing.tacticalGamePlan.middleOvers.fieldPresetId,
                          'Middle Overs'
                        )
                      }
                      className="w-full py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-amber-400 flex items-center justify-center gap-1 active:scale-98 transition-all"
                    >
                      <Shield className="w-3 h-3" /> Deploy Squeeze Formation
                    </button>
                  </div>

                  {/* Death Overs */}
                  <div className="p-3.5 rounded-2xl bg-[#0f172a] border border-slate-800 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-white uppercase font-mono">
                          DEATH OVERS (OVERS 16–20)
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300">
                          {directorBriefing.tacticalGamePlan.deathOvers.intent.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300">
                        {directorBriefing.tacticalGamePlan.deathOvers.instructions}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        handleDeployDirectorField(
                          directorBriefing.tacticalGamePlan.deathOvers.fieldPresetId,
                          'Death Overs'
                        )
                      }
                      className="w-full py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-amber-400 flex items-center justify-center gap-1 active:scale-98 transition-all"
                    >
                      <Shield className="w-3 h-3" /> Deploy Death Fortress
                    </button>
                  </div>
                </div>
              </div>

              {/* Workload Alerts & Scouting Directives */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Workload & Dressing Room Alerts */}
                <div className="p-4 rounded-2xl bg-[#0f172a] border border-slate-800 space-y-2">
                  <span className="text-[10px] font-mono font-bold text-rose-400 uppercase tracking-wider block">
                    WORKLOAD &amp; DRESSING ROOM ALERTS ({directorBriefing.workloadAndMoraleAlerts.length})
                  </span>
                  {directorBriefing.workloadAndMoraleAlerts.length > 0 ? (
                    <div className="space-y-1.5">
                      {directorBriefing.workloadAndMoraleAlerts.map((a, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col gap-0.5 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white">{a.player.name}</span>
                            <span
                              className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                                a.severity === 'HIGH'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {a.status}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400">{a.recommendation}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 text-xs text-slate-400 font-mono">
                      ✓ Entire squad fitness and dressing room morale are in pristine condition.
                    </div>
                  )}
                </div>

                {/* Scouting & Transfer Pipeline Directives */}
                <div className="p-4 rounded-2xl bg-[#0f172a] border border-slate-800 space-y-2">
                  <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-wider block">
                    SCOUTING &amp; TRANSFER PIPELINE DIRECTIVES
                  </span>
                  <div className="space-y-1.5">
                    {directorBriefing.scoutingDirectives.map((s, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col gap-0.5 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white">{s.targetDepartment}</span>
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300">
                            {s.urgency}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-300">{s.scoutingNeed}</span>
                        <span className="text-[9px] text-slate-500 font-mono italic">
                          Target Profile: {s.suggestedArchetype}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Infrastructure Upgrade Priority Card */}
              <div className="p-4 rounded-2xl bg-[#0f172a] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider block">
                    RECOMMENDED INFRASTRUCTURE INVESTMENT
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">
                      {directorBriefing.infrastructurePriority.facilityName}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Cost: {directorBriefing.infrastructurePriority.costCr} Cr
                    </span>
                    <span
                      className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                        directorBriefing.infrastructurePriority.affordable
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {directorBriefing.infrastructurePriority.affordable ? 'Affordable' : 'Purse Deficit'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {directorBriefing.infrastructurePriority.strategicJustification}
                  </p>
                </div>

                <button
                  onClick={() =>
                    handleUpgradeFacility(
                      directorBriefing.infrastructurePriority.recommendedUpgrade,
                      directorBriefing.infrastructurePriority.costCr,
                      directorBriefing.infrastructurePriority.facilityName
                    )
                  }
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-amber-400 uppercase active:scale-95 transition-all shrink-0"
                >
                  UPGRADE FACILITY NOW
                </button>
              </div>
            </div>
          )}
          {/* ============================================================== */}
          {/* TAB 1: INTERACTIVE FIELD EDITOR                                */}
          {/* ============================================================== */}
          {activeTab === 'field' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left 6 cols: Interactive Top-Down Cricket Ground */}
              <div className="lg:col-span-6 bg-[#111827] border border-slate-800 rounded-2xl p-4 flex flex-col items-center">
                <div className="w-full flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-white uppercase font-mono">
                    TOP-DOWN TACTICAL RADAR (CLICK TO REPOSITION FIELDER)
                  </span>
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                      fieldValidation.valid
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    }`}
                  >
                    {fieldValidation.outsideCount}/{fieldValidation.maxAllowedOutside} Outside 30-Yd
                  </span>
                </div>

                <svg
                  viewBox="0 0 100 100"
                  onClick={handleFieldClick}
                  className="w-full max-w-[360px] aspect-square rounded-full bg-gradient-to-b from-emerald-900 via-emerald-800 to-emerald-950 border-4 border-slate-700 cursor-crosshair shadow-inner"
                >
                  {/* Boundary rope */}
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#f59e0b" strokeWidth="0.6" strokeDasharray="2 1" />
                  {/* 30-yard restriction circle */}
                  <circle cx="50" cy="50" r="26" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.5" strokeDasharray="1.5 1.5" />
                  {/* Pitch strip */}
                  <rect x="47" y="38" width="6" height="24" rx="1" fill="#d6b485" stroke="#a38054" strokeWidth="0.4" />
                  {/* Bowler & Keeper markers */}
                  <circle cx="50" cy="35" r="2" fill="#38bdf8" />
                  <text x="50" y="33" fontSize="2.8" fill="#e2e8f0" textAnchor="middle" fontWeight="bold">BOWL</text>
                  <circle cx="50" cy="29" r="2" fill="#f43f5e" />
                  <text x="50" y="26.5" fontSize="2.8" fill="#e2e8f0" textAnchor="middle" fontWeight="bold">WK</text>

                  {/* 9 Interactive Fielder Nodes */}
                  {customFielders.map(f => {
                    const isSel = selectedFielderId === f.id;
                    return (
                      <g
                        key={f.id}
                        onClick={ev => {
                          ev.stopPropagation();
                          sound.playTap();
                          setSelectedFielderId(f.id);
                        }}
                        className="cursor-pointer"
                      >
                        {isSel && (
                          <circle cx={f.x} cy={f.y} r="4.2" fill="none" stroke="#f5b82e" strokeWidth="0.8" />
                        )}
                        <circle
                          cx={f.x}
                          cy={f.y}
                          r="2.6"
                          fill={isSel ? '#f5b82e' : f.isBoundary ? '#a855f7' : '#10b981'}
                          stroke="#ffffff"
                          strokeWidth="0.5"
                        />
                        <text
                          x={f.x}
                          y={f.y - 3.5}
                          fontSize="2.5"
                          fill="#ffffff"
                          textAnchor="middle"
                          fontWeight="bold"
                        >
                          {f.name}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {fieldValidation.warning && (
                  <div className="mt-3 w-full p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/50 flex items-center gap-2 text-xs text-rose-300">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{fieldValidation.warning}</span>
                  </div>
                )}

                {fieldSavedBanner && (
                  <div className="mt-3 w-full p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/50 flex items-center gap-2 text-xs text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>{fieldSavedBanner}</span>
                  </div>
                )}
              </div>

              {/* Right 6 cols: Field Templates & Active Fielder List */}
              <div className="lg:col-span-6 space-y-4">
                <div className="bg-[#111827] border border-slate-800 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-amber-400 uppercase font-mono">
                      MATCH PHASE RESTRICTION CHECKER
                    </span>
                    <div className="flex items-center gap-1.5">
                      {[
                        { label: 'PP (Ov 1-6)', ov: 3 },
                        { label: 'Middle (Ov 7-15)', ov: 10 },
                        { label: 'Death (Ov 16-20)', ov: 18 }
                      ].map(p => (
                        <button
                          key={p.label}
                          onClick={() => { sound.playTap(); setEditorPhaseOver(p.ov); }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold ${
                            editorPhaseOver === p.ov
                              ? 'bg-amber-400 text-black'
                              : 'bg-slate-900 text-slate-400 border border-slate-800'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">
                    {fieldValidation.phaseName}. Select any fielder chip below, then click anywhere on the turf radar to fine-tune their coordinates.
                  </p>
                </div>

                {/* Preset Templates */}
                <div className="bg-[#111827] border border-slate-800 rounded-2xl p-4">
                  <span className="text-xs font-bold text-white uppercase font-mono block mb-2.5">
                    REUSABLE FIELD TEMPLATES (AFFECTS BOUNDARY SAVES &amp; CATCHING)
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {FIELD_TEMPLATES.map(preset => (
                      <button
                        key={preset.id}
                        onClick={() => handleApplyPreset(preset.id)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          selectedPresetId === preset.id
                            ? 'bg-amber-500/15 border-amber-400 text-white'
                            : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">{preset.name}</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-amber-300">
                            {preset.phase}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">{preset.description}</p>
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono">
                          <span className="text-emerald-400">Catch +{preset.catchChanceBonus}%</span>
                          <span className="text-cyan-400">Boundary Save {preset.boundarySaveBonus >= 0 ? `+${preset.boundarySaveBonus}%` : `${preset.boundarySaveBonus}%`}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Individual Fielder Selector */}
                <div className="bg-[#111827] border border-slate-800 rounded-2xl p-4">
                  <span className="text-xs font-bold text-slate-400 uppercase font-mono block mb-2">
                    SELECT FIELDER NODE TO DRAG / REPOSITION
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {customFielders.map(f => (
                      <button
                        key={f.id}
                        onClick={() => { sound.playTap(); setSelectedFielderId(f.id); }}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                          selectedFielderId === f.id
                            ? 'bg-amber-400 text-black'
                            : 'bg-slate-900 text-slate-300 border border-slate-800'
                        }`}
                      >
                        #{f.id} {f.name} ({f.isBoundary ? 'Deep' : 'Ring'})
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: BATTER-BOWLER ANALYTICS & MATCHUPS                      */}
          {/* ============================================================== */}
          {activeTab === 'matchups' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[#111827] border border-slate-800 rounded-2xl p-4">
                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                    SELECT YOUR BATTER ({userTeam.shortName})
                  </label>
                  <select
                    value={selectedBatterId}
                    onChange={e => setSelectedBatterId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  >
                    {userSquad.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.battingHand} · BAT {p.ratings.bat})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                    OPPONENT FRANCHISE
                  </label>
                  <select
                    value={selectedOppTeamId}
                    onChange={e => {
                      const nextTeamId = e.target.value;
                      setSelectedOppTeamId(nextTeamId);
                      const firstBowl = players.find(p => p.clubId === nextTeamId);
                      if (firstBowl) setSelectedBowlerId(firstBowl.id);
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  >
                    {opponentTeams.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.shortName})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                    OPPONENT BOWLER
                  </label>
                  <select
                    value={selectedBowlerId}
                    onChange={e => setSelectedBowlerId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  >
                    {oppSquad.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.role} · BOWL {p.ratings.bowl})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {matchupReport && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <span className="text-[10px] font-mono text-amber-400 uppercase font-bold">
                          HEAD-TO-HEAD TACTICAL BREAKDOWN
                        </span>
                        <h3 className="text-base font-black text-white mt-0.5">
                          {matchupReport.batterName} vs {matchupReport.bowlerName}
                        </h3>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-mono font-black ${
                          matchupReport.advantage === 'BATTER'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : matchupReport.advantage === 'BOWLER'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        EDGE: {matchupReport.advantage}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center font-mono">
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">VS PACE</span>
                        <span className="text-lg font-black text-emerald-400">{matchupReport.vsPaceRating}</span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">VS SPIN</span>
                        <span className="text-lg font-black text-cyan-400">{matchupReport.vsSpinRating}</span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">BOUNDARY %</span>
                        <span className="text-lg font-black text-amber-400">{matchupReport.boundaryThreatPct}%</span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">DISMISSAL RISK</span>
                        <span className="text-lg font-black text-rose-400">{matchupReport.dismissalRiskPct}%</span>
                      </div>
                    </div>

                    {/* Phase Strike Rates */}
                    <div>
                      <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block mb-2">
                        PHASE-BY-PHASE PROJECTED STRIKE RATE
                      </span>
                      <div className="grid grid-cols-3 gap-3 font-mono text-xs">
                        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                          <span className="text-[10px] text-slate-400 block">POWERPLAY (1-6)</span>
                          <span className="text-sm font-bold text-white">SR {matchupReport.powerplaySR}</span>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                          <span className="text-[10px] text-slate-400 block">MIDDLE (7-15)</span>
                          <span className="text-sm font-bold text-white">SR {matchupReport.middleOversSR}</span>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                          <span className="text-[10px] text-slate-400 block">DEATH (16-20)</span>
                          <span className="text-sm font-bold text-amber-400">SR {matchupReport.deathOversSR}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                    <div>
                      <span className="text-[10px] font-mono text-cyan-400 uppercase font-bold block mb-2">
                        ANALYST BOWLING PLAN &amp; VERDICT
                      </span>
                      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Optimal Length:</span>
                          <span className="font-mono font-bold text-amber-300">{matchupReport.recommendedLength}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Optimal Line:</span>
                          <span className="font-mono font-bold text-cyan-300">{matchupReport.recommendedLine}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Career H2H Recorded:</span>
                          <span className="font-mono font-bold text-white">
                            {matchupReport.historicalBalls > 0
                              ? `${matchupReport.historicalRuns} runs (${matchupReport.historicalBalls}b, ${matchupReport.historicalDismissals}x out)`
                              : 'First career encounter'}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 leading-relaxed">
                        <strong className="text-amber-400 block mb-1 font-mono uppercase">Tactical Recommendation:</strong>
                        {matchupReport.tacticalVerdict}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: TACTICAL SCENARIO SIMULATOR                             */}
          {/* ============================================================== */}
          {activeTab === 'simulator' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-2xl p-5 space-y-4">
                <div>
                  <span className="text-[10px] font-mono uppercase text-amber-400 font-bold block">
                    SANDBOX MONTE CARLO ENGINE
                  </span>
                  <h3 className="text-base font-black text-white">
                    Configure What-If Match Scenario
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Test XIs, pitch conditions, and tactical aggression without affecting your official career record.
                  </p>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                      OPPONENT TEAM
                    </label>
                    <select
                      value={selectedOppTeamId}
                      onChange={e => setSelectedOppTeamId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold"
                    >
                      {opponentTeams.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.shortName})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                      PITCH SURFACE CONDITION
                    </label>
                    <select
                      value={simPitch}
                      onChange={e => setSimPitch(e.target.value as PitchType)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold"
                    >
                      <option value="Balanced Sporting">Balanced Sporting</option>
                      <option value="Flat Track">Flat Track (High Scoring)</option>
                      <option value="Green Seamer">Green Seamer (Pace Aid)</option>
                      <option value="Dry & Turning">Dry &amp; Turning (Spin Aid)</option>
                      <option value="Two-Paced">Two-Paced</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                        BATTING INTENT
                      </label>
                      <select
                        value={simBatIntent}
                        onChange={e => setSimBatIntent(e.target.value as any)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold uppercase"
                      >
                        <option value="defensive">Conservative</option>
                        <option value="balanced">Balanced</option>
                        <option value="attacking">Aggressive</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                        BOWLING PLAN
                      </label>
                      <select
                        value={simBowlAggression}
                        onChange={e => setSimBowlAggression(e.target.value as any)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold uppercase"
                      >
                        <option value="defensive">Contain</option>
                        <option value="balanced">Standard</option>
                        <option value="attacking">Wicket Hunt</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                      SIMULATION SAMPLE SIZE ({simIterations} FULL MATCHES)
                    </label>
                    <div className="flex gap-2">
                      {[10, 20, 35].map(n => (
                        <button
                          key={n}
                          onClick={() => setSimIterations(n)}
                          className={`flex-1 py-2 rounded-xl font-mono font-bold ${
                            simIterations === n
                              ? 'bg-amber-400 text-black'
                              : 'bg-slate-900 text-slate-400 border border-slate-800'
                          }`}
                        >
                          {n} Runs
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleRunScenario}
                  className="w-full py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
                >
                  <Play className="w-4 h-4 fill-black" /> RUN {simIterations}-MATCH SCENARIO LAB
                </button>
              </div>

              <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-2xl p-5 flex flex-col justify-center">
                {!scenarioResult ? (
                  <div className="text-center py-12 space-y-2">
                    <FlaskConical className="w-10 h-10 text-amber-400 mx-auto opacity-80" />
                    <h4 className="text-sm font-bold text-white uppercase">Ready to Run Tactical Sandbox</h4>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Click "Run Scenario Lab" to execute {simIterations} ball-by-ball simulations between {userTeam.shortName} and {selectedOppTeam.shortName} using your active Playing XI and field template.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <span className="text-[10px] font-mono uppercase text-emerald-400 font-bold">
                          SANDBOX SIMULATION COMPLETE ({scenarioResult.iterations} MATCHES)
                        </span>
                        <h4 className="text-lg font-black text-white">
                          {userTeam.shortName} Win Probability: {scenarioResult.winProbabilityPct}%
                        </h4>
                      </div>
                      <div className="text-right font-mono text-xs">
                        <span className="text-emerald-400 font-bold">{scenarioResult.userWinCount}W</span>
                        <span className="text-slate-500 mx-1">–</span>
                        <span className="text-rose-400 font-bold">{scenarioResult.oppWinCount}L</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center font-mono">
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">AVG {userTeam.shortName} SCORE</span>
                        <span className="text-base font-black text-amber-400">{scenarioResult.avgFirstInningsScore}</span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">AVG {selectedOppTeam.shortName} SCORE</span>
                        <span className="text-base font-black text-slate-200">{scenarioResult.avgSecondInningsScore}</span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">AVG WKTS TAKEN</span>
                        <span className="text-base font-black text-emerald-400">{scenarioResult.avgWicketsTaken}</span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">DEATH OVERS AVG</span>
                        <span className="text-base font-black text-cyan-400">{scenarioResult.avgDeathScore} runs</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                        <span className="text-[10px] font-mono text-slate-400 uppercase block">TOP PROJECTED BATTER</span>
                        <span className="text-sm font-bold text-white block mt-0.5">
                          {scenarioResult.topProjectedScorer.name}
                        </span>
                        <span className="text-xs font-mono text-amber-400">
                          {scenarioResult.topProjectedScorer.avgRuns} avg runs · SR {scenarioResult.topProjectedScorer.sr}
                        </span>
                      </div>
                      <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                        <span className="text-[10px] font-mono text-slate-400 uppercase block">TOP PROJECTED BOWLER</span>
                        <span className="text-sm font-bold text-white block mt-0.5">
                          {scenarioResult.topProjectedBowler.name}
                        </span>
                        <span className="text-xs font-mono text-emerald-400">
                          {scenarioResult.topProjectedBowler.avgWickets} avg wkts · Econ {scenarioResult.topProjectedBowler.econ}
                        </span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200">
                      <strong className="text-emerald-400 font-mono uppercase block mb-0.5">Simulation Insight:</strong>
                      {scenarioResult.tacticalInsight}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: STADIUM & TRAINING INFRASTRUCTURE                       */}
          {/* ============================================================== */}
          {activeTab === 'infrastructure' && (
            <div className="space-y-4">
              <div className="bg-[#111827] border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-mono uppercase text-amber-400 font-bold block">
                    FRANCHISE CAPITAL INVESTMENTS
                  </span>
                  <h3 className="text-base font-black text-white">
                    {userTeam.name} Stadium &amp; Academy Infrastructure
                  </h3>
                </div>
                <div className="px-4 py-2 rounded-xl bg-slate-900 border border-amber-500/40 font-mono text-xs">
                  <span className="text-slate-400 mr-2">AVAILABLE PURSE:</span>
                  <span className="text-amber-400 font-black text-sm">{userTeam.purseCr.toFixed(2)} Cr</span>
                </div>
              </div>

              {infraMsg && (
                <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-xs text-emerald-300 font-mono flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{infraMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {facilitySpecs.map(spec => {
                  const isMax = spec.currentTier >= spec.maxTier;
                  return (
                    <div
                      key={spec.key}
                      className="bg-[#111827] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <span className="text-2xl">{spec.icon}</span>
                            <div>
                              <h4 className="text-sm font-bold text-white">{spec.name}</h4>
                              <span className="text-[10px] font-mono text-amber-400 font-bold uppercase">
                                TIER {spec.currentTier} / {spec.maxTier}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map(lvl => (
                              <span
                                key={lvl}
                                className={`w-2.5 h-2.5 rounded-full ${
                                  lvl <= spec.currentTier ? 'bg-amber-400' : 'bg-slate-800'
                                }`}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="mt-3 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs space-y-1">
                          <div className="text-emerald-400 font-medium">
                            Active Bonus: {spec.currentEffectLabel}
                          </div>
                          {!isMax && (
                            <div className="text-slate-400 text-[11px]">
                              Next Tier: {spec.nextEffectLabel}
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        disabled={isMax}
                        onClick={() => handleUpgradeFacility(spec.key, spec.upgradeCostCr, spec.name)}
                        className={`w-full py-2.5 rounded-xl font-mono font-black text-xs uppercase flex items-center justify-center gap-1.5 transition-all ${
                          isMax
                            ? 'bg-slate-800 text-slate-500 cursor-default'
                            : 'bg-amber-400 hover:bg-amber-300 text-black active:scale-95'
                        }`}
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                        {isMax ? 'MAX TIER REACHED' : `UPGRADE TO TIER ${spec.currentTier + 1} (${spec.upgradeCostCr} CR)`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
