import React, { useState } from 'react';
import { Star, Dumbbell, Smile, Sparkles, AlertCircle, Info, Zap, X } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { Player } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';
import { derivePlayerPersonality } from '../../services/cricketServices';
import { TeamLogo } from '../common/TeamLogo';
import { PlayerCareerStatsCard } from '../common/PlayerCareerStatsCard';

export const TeamManagementScreen: React.FC = () => {
  const {
    userTeam,
    updateUserTeamXI,
    setTeamCaptain,
    players,
    trainSquad,
    coachProfile
  } = useGame();

  const [activeTab, setActiveTab] = useState<'squad' | 'training'>('squad');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [swapSourceId, setSwapSourceId] = useState<string | null>(null);
  const [swapWarning, setSwapWarning] = useState<string | null>(null);
  const [trainingMessage, setTrainingMessage] = useState<string | null>(null);

  // Get all user team players & preserve batting order in Playing XI
  const teamPlayers = players.filter(p => p.clubId === userTeam.id);
  const orderedXI = userTeam.playingXIIds
    .map(id => teamPlayers.find(p => p.id === id))
    .filter((p): p is Player => Boolean(p));
  const playingXI = orderedXI.length > 0 ? orderedXI : teamPlayers.slice(0, 11);
  const playingXISet = new Set(playingXI.map(p => p.id));
  const bench = teamPlayers.filter(p => !playingXISet.has(p.id));

  // Impact Players (5 nominated bench players)
  const impactPlayerIds = userTeam.impactPlayerIds || [];
  let impactPlayers: Player[] = [];
  if (impactPlayerIds.length > 0) {
    impactPlayers = bench.filter(p => impactPlayerIds.includes(p.id)).slice(0, 5);
  }
  if (impactPlayers.length < 5) {
    const existingIds = new Set(impactPlayers.map(p => p.id));
    for (const p of bench) {
      if (impactPlayers.length >= 5) break;
      if (!existingIds.has(p.id)) {
        impactPlayers.push(p);
      }
    }
  }
  const impactPlayerSet = new Set(impactPlayers.map(p => p.id));
  const benchReserves = bench.filter(p => !impactPlayerSet.has(p.id));

  const overseasCount = playingXI.filter(p => p.isOverseas).length;

  // Dynamic Team Ratings (BAT, BWL, DPT)
  const avgBat = Math.round(
    playingXI.slice(0, 7).reduce((s, p) => s + p.ratings.bat, 0) /
    Math.max(1, Math.min(7, playingXI.length))
  );
  const qualifiedBowlers = playingXI.filter(p => p.ratings.bowl >= 65).slice(0, 5);
  const top5Bowlers = qualifiedBowlers.length >= 5
    ? qualifiedBowlers
    : [...playingXI].sort((a, b) => b.ratings.bowl - a.ratings.bowl).slice(0, 5);
  const avgBowl = Math.round(
    top5Bowlers.reduce((s, p) => s + p.ratings.bowl, 0) / Math.max(1, top5Bowlers.length)
  );
  const avgDpt = Math.round(
    teamPlayers.reduce((s, p) => s + Math.max(p.ratings.bat, p.ratings.bowl), 0) /
    Math.max(1, teamPlayers.length)
  );

  // Filtered view
  const filterList = (list: Player[]) => {
    if (roleFilter === 'ALL') return list;
    if (roleFilter === 'BAT') return list.filter(p => p.role === 'Top-order' || p.role === 'Middle-order');
    if (roleFilter === 'BOWL') return list.filter(p => p.role === 'Pace' || p.role === 'Spin');
    if (roleFilter === 'AR') return list.filter(p => p.role === 'All-rounder');
    if (roleFilter === 'WK') return list.filter(p => p.role === 'Wk-bat');
    return list;
  };

  // Swap XI and Bench or reorder Batting Lineup
  const handlePlayerClick = (player: Player) => {
    sound.playTap();
    setSwapWarning(null);
    if (!swapSourceId) {
      setSwapSourceId(player.id);
    } else if (swapSourceId === player.id) {
      setSwapSourceId(null);
      setSelectedPlayer(player);
    } else {
      const currentXIIds = playingXI.map(p => p.id);
      const isSourceInXI = currentXIIds.includes(swapSourceId);
      const isTargetInXI = currentXIIds.includes(player.id);

      if (isSourceInXI && isTargetInXI) {
        // Case 1: Both in Playing XI -> Swap their batting lineup order positions
        const newXI = currentXIIds.map(id => {
          if (id === swapSourceId) return player.id;
          if (id === player.id) return swapSourceId;
          return id;
        });
        updateUserTeamXI(newXI);
        setSwapSourceId(null);
      } else if (isSourceInXI !== isTargetInXI) {
        // Case 2: One in Playing XI, one on Bench -> Validate 4-overseas cap then swap
        const xiPlayerId = isSourceInXI ? swapSourceId : player.id;
        const benchPlayerId = isSourceInXI ? player.id : swapSourceId;
        const xiPlayer = teamPlayers.find(p => p.id === xiPlayerId);
        const benchPlayer = teamPlayers.find(p => p.id === benchPlayerId);

        if (benchPlayer?.isOverseas && !xiPlayer?.isOverseas && overseasCount >= 4) {
          setSwapWarning('Max 4 Overseas players allowed in Playing XI!');
          setSwapSourceId(null);
          setTimeout(() => setSwapWarning(null), 3500);
          return;
        }

        const newXI = currentXIIds.map(id => (id === xiPlayerId ? benchPlayerId : id));
        updateUserTeamXI(newXI);
        setSwapSourceId(null);
      } else {
        // Case 3: Both on Bench -> Switch selection to newly tapped bench player
        setSwapSourceId(player.id);
      }
    }
  };

  // FIX-08: Reset to Recommended XI
  const handleResetToRecommendedXI = () => {
    sound.playTap();
    let overseasPicked = 0;
    const picked: Player[] = [];

    const tryAdd = (p: Player) => {
      if (picked.some(x => x.id === p.id)) return false;
      if (p.isOverseas && overseasPicked >= 4) return false;
      picked.push(p);
      if (p.isOverseas) overseasPicked++;
      return true;
    };

    // 1. Captain always starts
    const captain = teamPlayers.find(p => p.id === userTeam.captainId || p.isCaptain);
    if (captain) tryAdd(captain);

    // 2. Best Wicketkeeper
    const wks = teamPlayers.filter(p => p.role === 'Wk-bat').sort((a, b) => b.ratings.bat - a.ratings.bat);
    if (wks[0]) tryAdd(wks[0]);

    // 3. Top Order Batters (aim for up to 5)
    const topBatters = teamPlayers
      .filter(p => p.role === 'Top-order' || p.role === 'Middle-order')
      .sort((a, b) => b.ratings.bat - a.ratings.bat);
    for (const b of topBatters) {
      if (picked.length >= 5) break;
      tryAdd(b);
    }

    // 4. All-Rounders (aim for up to 7)
    const allRounders = teamPlayers
      .filter(p => p.role === 'All-rounder')
      .sort((a, b) => (b.ratings.bat + b.ratings.bowl) - (a.ratings.bat + a.ratings.bowl));
    for (const ar of allRounders) {
      if (picked.length >= 7) break;
      tryAdd(ar);
    }

    // 5. Specialist Bowlers (Pace & Spin)
    const bowlers = teamPlayers
      .filter(p => p.role === 'Pace' || p.role === 'Spin')
      .sort((a, b) => b.ratings.bowl - a.ratings.bowl);
    for (const bwl of bowlers) {
      if (picked.length >= 11) break;
      tryAdd(bwl);
    }

    // 6. Fill any remaining slots with highest-rated available players
    const remaining = teamPlayers
      .filter(p => !picked.some(x => x.id === p.id))
      .sort((a, b) => Math.max(b.ratings.bat, b.ratings.bowl) - Math.max(a.ratings.bat, a.ratings.bowl));
    for (const rem of remaining) {
      if (picked.length >= 11) break;
      tryAdd(rem);
    }

    if (picked.length >= 11) {
      updateUserTeamXI(picked.map(p => p.id));
    }
  };

  const handleTrain = (type: 'batting' | 'bowling' | 'fielding' | 'fitness') => {
    const result = trainSquad(type);
    setTrainingMessage(result.message);
    setTimeout(() => setTrainingMessage(null), 4000);
  };

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col justify-between max-w-7xl mx-auto w-full pb-24 select-none">
      {/* Top Team Header Bar */}
      <div className="px-6 py-3.5 bg-[#0c121e] border-b border-slate-800/80 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-lg font-black text-white font-display uppercase tracking-wide flex items-center gap-2">
              <TeamLogo teamId={userTeam.id} shortName={userTeam.shortName} size={24} fallbackEmoji={userTeam.logoEmoji} />
              <span>{userTeam.name}</span>
            </h1>
            <span className="text-[11px] text-slate-400 font-mono">
              Squad: {teamPlayers.length} players · BAT {avgBat} · BWL {avgBowl} · DPT {avgDpt}
            </span>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            ★ CAPT: {players.find(p => p.id === userTeam.captainId)?.name || teamPlayers.find(p => p.isCaptain)?.name || teamPlayers[0]?.name || 'Captain'}
          </span>
        </div>

        {/* Segmented Mode Switcher */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900 rounded-xl max-w-xl">
          <button
            onClick={() => { sound.playTap(); setActiveTab('squad'); }}
            className={`py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
              activeTab === 'squad' ? 'bg-amber-400 text-black shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            SQUAD & PLAYING XI
          </button>
          <button
            onClick={() => { sound.playTap(); setActiveTab('training'); }}
            className={`py-1.5 rounded-lg text-xs font-bold uppercase transition-all flex items-center justify-center gap-1 ${
              activeTab === 'training' ? 'bg-amber-400 text-black shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Dumbbell className="w-3.5 h-3.5" />
            TRAINING NETS
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 px-6 py-4 flex flex-col gap-4">
        {activeTab === 'squad' ? (
          <>
            {/* Filter buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
              {['ALL', 'BAT', 'BOWL', 'AR', 'WK'].map(role => (
                <button
                  key={role}
                  onClick={() => { sound.playTap(); setRoleFilter(role); }}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                    roleFilter === role
                      ? 'bg-slate-700 text-white border border-slate-600'
                      : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>

            {/* Instruction Banner */}
            <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-900/40 px-3 py-2 rounded-xl border border-slate-800/60">
              <span>Tap two XI players to reorder or XI + Bench to swap</span>
              <span className={`font-mono font-bold text-[11px] ${overseasCount > 4 ? 'text-rose-400' : 'text-cyan-400'}`}>
                Overseas {overseasCount}/4 max
              </span>
            </div>

            {swapWarning && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-950/80 border border-rose-500/60 text-xs text-rose-300 font-bold">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{swapWarning}</span>
              </div>
            )}

            {/* Playing XI List (Screenshot 5) */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold block">
                  ● PLAYING XI ({playingXI.length})
                </span>
                {/* FIX-08: Reset to Recommended XI button */}
                <button
                  type="button"
                  onClick={handleResetToRecommendedXI}
                  className="px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-mono font-bold text-[10px] uppercase flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                >
                  <Sparkles className="w-3 h-3 fill-black" />
                  <span>RECOMMENDED XI</span>
                </button>
              </div>
              {filterList(playingXI).map(player => {
                const isSelectedForSwap = swapSourceId === player.id;
                return (
                  <div
                    key={player.id}
                    onClick={() => handlePlayerClick(player)}
                    className={`flex items-center justify-between p-2.5 rounded-2xl border transition-all cursor-pointer ${
                      isSelectedForSwap
                        ? 'bg-amber-500/20 border-amber-400 shadow-lg shadow-amber-500/20 scale-[1.01]'
                        : 'bg-[#0f172a] hover:bg-slate-800/80 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-mono font-bold text-slate-400 w-6">
                        #{player.jerseyNumber || 99}
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white block">
                            {player.name}
                          </span>
                          {player.isOverseas && (
                            <span className="text-[10px] text-cyan-400 font-mono">✈</span>
                          )}
                          {player.isCaptain && (
                            <span className="text-[9px] px-1 bg-amber-500 text-black font-black rounded">C</span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {player.role} · {player.country}
                        </span>
                      </div>
                    </div>

                    {/* Form Ring, Info & Morale Indicator */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          sound.playTap();
                          setSelectedPlayer(player);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                        title="View Attributes"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-mono-nums font-bold text-emerald-400">
                          {player.form}
                        </span>
                        <Smile className="w-3.5 h-3.5 text-amber-400" />
                      </div>
                      <div className="w-10 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${player.fitness}%` }}
                          className="h-full bg-emerald-500"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Impact Players Section (5 Nominated Substitutes) */}
            <div className="flex flex-col gap-1.5 mt-3">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-black flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  IMPACT PLAYERS ({impactPlayers.length})
                </span>
                <span className="text-[9px] font-mono text-slate-400 font-bold">
                  5 NOMINATED SUBSTITUTES
                </span>
              </div>
              {filterList(impactPlayers).length === 0 ? (
                <span className="text-xs text-slate-500 italic p-3 text-center bg-slate-900/40 rounded-xl border border-slate-800">
                  No impact players in this role filter.
                </span>
              ) : (
                filterList(impactPlayers).map(player => {
                  const isSelectedForSwap = swapSourceId === player.id;
                  return (
                    <div
                      key={player.id}
                      onClick={() => handlePlayerClick(player)}
                      className={`flex items-center justify-between p-2.5 rounded-2xl border transition-all cursor-pointer ${
                        isSelectedForSwap
                          ? 'bg-amber-500/20 border-amber-400 shadow-lg scale-[1.01]'
                          : 'bg-[#0a1526] hover:bg-[#101e36] border-cyan-500/30 shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-mono font-bold text-slate-400 w-6">
                          #{player.jerseyNumber || 99}
                        </span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white block">
                              {player.name}
                            </span>
                            {player.isOverseas && <span className="text-[10px] text-cyan-400 font-mono">✈</span>}
                            <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-mono text-[9px] font-bold border border-cyan-500/30 flex items-center gap-0.5">
                              ⚡ IMPACT
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {player.role} · {player.country}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            sound.playTap();
                            setSelectedPlayer(player);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                          title="View Attributes"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[11px] font-mono-nums font-bold text-emerald-400">
                          {player.form}
                        </span>
                        <span className="text-xs text-amber-400 font-bold">SWAP ▶</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bench Reserves Section */}
            <div className="flex flex-col gap-1.5 mt-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold block">
                BENCH RESERVES ({benchReserves.length})
              </span>
              {filterList(benchReserves).length === 0 ? (
                <span className="text-xs text-slate-500 italic p-3 text-center">No remaining bench reserves in this role filter.</span>
              ) : (
                filterList(benchReserves).map(player => {
                  const isSelectedForSwap = swapSourceId === player.id;
                  return (
                    <div
                      key={player.id}
                      onClick={() => handlePlayerClick(player)}
                      className={`flex items-center justify-between p-2.5 rounded-2xl border transition-all cursor-pointer ${
                        isSelectedForSwap
                          ? 'bg-amber-500/20 border-amber-400 shadow-lg scale-[1.01]'
                          : 'bg-[#0f172a]/60 hover:bg-slate-800/80 border-slate-800/80'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-mono font-bold text-slate-400 w-6">
                          #{player.jerseyNumber || 99}
                        </span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white block">
                              {player.name}
                            </span>
                            {player.isOverseas && <span className="text-[10px] text-cyan-400">✈</span>}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {player.role} · {player.country}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            sound.playTap();
                            setSelectedPlayer(player);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                          title="View Attributes"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[11px] font-mono-nums text-slate-400">
                          FORM {player.form}
                        </span>
                        <span className="text-xs text-amber-400 font-bold">SWAP ▶</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          /* TRAINING NETS TAB (Screenshot 5 right mockup) */
          <div className="flex flex-col gap-3">
            <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  DAILY TRAINING COMPLEX
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  2X XP ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-300 mb-3">
                Focus your squad drills to improve form, batting power, bowling potency, and injury recovery before the next fixture.
              </p>

              {trainingMessage && (
                <div className="p-3 mb-3 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-xs text-emerald-300 font-medium">
                  {trainingMessage}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleTrain('batting')}
                  className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-2xl text-left transition-all active:scale-95"
                >
                  <span className="text-xs font-bold text-white block mb-0.5">HARD BATTING NETS</span>
                  <span className="text-[10px] text-slate-400 block">+Technique, +Power Hitting</span>
                  <span className="text-[10px] font-mono text-amber-400 font-bold mt-1 block">START DRILL ▶</span>
                </button>

                <button
                  onClick={() => handleTrain('bowling')}
                  className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-2xl text-left transition-all active:scale-95"
                >
                  <span className="text-xs font-bold text-white block mb-0.5">TARGET BOWLING</span>
                  <span className="text-[10px] text-slate-400 block">+Line & Length, +Yorkers</span>
                  <span className="text-[10px] font-mono text-emerald-400 font-bold mt-1 block">START DRILL ▶</span>
                </button>

                <button
                  onClick={() => handleTrain('fielding')}
                  className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-2xl text-left transition-all active:scale-95"
                >
                  <span className="text-xs font-bold text-white block mb-0.5">CATCHING & AGILITY</span>
                  <span className="text-[10px] text-slate-400 block">+Catching %, +Morale</span>
                  <span className="text-[10px] font-mono text-cyan-400 font-bold mt-1 block">START DRILL ▶</span>
                </button>

                <button
                  onClick={() => handleTrain('fitness')}
                  className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-2xl text-left transition-all active:scale-95"
                >
                  <span className="text-xs font-bold text-white block mb-0.5">PHYSIO & REHAB</span>
                  <span className="text-[10px] text-slate-400 block">+15 Fitness, Heal Sprains</span>
                  <span className="text-[10px] font-mono text-rose-400 font-bold mt-1 block">START DRILL ▶</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Player Detail Bottom Sheet Modal */}
      {selectedPlayer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center">
          <div className="bg-[#0b101c] border-t border-slate-800 rounded-t-3xl w-full max-w-md p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="font-display font-black text-xl text-white uppercase">
                  {selectedPlayer.name}
                </h3>
                <span className="text-xs text-slate-400 block">
                  {selectedPlayer.primaryRole || selectedPlayer.role} · {selectedPlayer.battingHand}
                  {selectedPlayer.bowlingStyle ? ` · ${selectedPlayer.bowlingStyle}` : ''} · {selectedPlayer.age}y
                </span>
                {selectedPlayer.dataConfidence && (
                  <span className="text-[10px] text-amber-400/90 font-mono block mt-0.5">
                    Verified: {selectedPlayer.dataConfidence}
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelectedPlayer(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Condition & Status */}
            <div className="grid grid-cols-3 gap-2 my-3 text-center font-mono">
              <div className="p-2 bg-slate-900 rounded-xl border border-slate-800">
                <span className="text-[9px] text-slate-400 block uppercase font-bold">FORM</span>
                <span className="text-sm font-bold text-emerald-400">{selectedPlayer.form}</span>
              </div>
              <div className="p-2 bg-slate-900 rounded-xl border border-slate-800">
                <span className="text-[9px] text-slate-400 block uppercase font-bold">MORALE</span>
                <span className="text-sm font-bold text-amber-400">{Math.round(selectedPlayer.morale / 10)}/10</span>
              </div>
              <div className="p-2 bg-slate-900 rounded-xl border border-slate-800">
                <span className="text-[9px] text-slate-400 block uppercase font-bold">STAMINA</span>
                <span className="text-sm font-bold text-cyan-400">{selectedPlayer.fitness}%</span>
              </div>
            </div>

            {/* Player Personality & Dressing Room Dynamics */}
            {(() => {
              const isInXI = userTeam.playingXIIds.includes(selectedPlayer.id);
              const pers = derivePlayerPersonality(selectedPlayer, isInXI);
              return (
                <div className="p-3 bg-slate-900/80 rounded-2xl border border-purple-500/30 mb-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-purple-300 uppercase tracking-wider font-bold">
                      PERSONALITY · {pers.archetype.toUpperCase()}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        pers.dressingRoomStatus === 'Thriving'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : pers.dressingRoomStatus === 'Content'
                          ? 'bg-cyan-500/20 text-cyan-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {pers.dressingRoomStatus} ({pers.playingTimeExpectation})
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-[11px]">
                    <div className="p-1.5 rounded-lg bg-[#141d2f] border border-slate-800">
                      <span className="text-[9px] text-slate-400 block">LEADERSHIP</span>
                      <span className="font-bold text-amber-400">{pers.leadershipScore}</span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-[#141d2f] border border-slate-800">
                      <span className="text-[9px] text-slate-400 block">PRO WORK ETHIC</span>
                      <span className="font-bold text-emerald-400">{pers.professionalism}</span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-[#141d2f] border border-slate-800">
                      <span className="text-[9px] text-slate-400 block">MEDIA</span>
                      <span className="font-bold text-cyan-300">{pers.mediaHandling}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-snug">
                    {pers.mentorBonusDescription}
                  </p>
                </div>
              );
            })()}

            {/* Batting Ratings Grid */}
            <div className="p-3 bg-slate-900/60 rounded-2xl border border-slate-800 mb-3">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-2 font-bold">
                BATTING ATTRIBUTES
              </span>
              <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-xs">
                <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                  <span className="text-[9px] text-slate-400 block">BAT</span>
                  <span className="font-bold text-white">{selectedPlayer.ratings.bat}</span>
                </div>
                <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                  <span className="text-[9px] text-slate-400 block">POW</span>
                  <span className="font-bold text-amber-400">{selectedPlayer.ratings.pow}</span>
                </div>
                <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                  <span className="text-[9px] text-slate-400 block">TEC</span>
                  <span className="font-bold text-cyan-400">{selectedPlayer.ratings.tec ?? selectedPlayer.ratings.ctrl}</span>
                </div>
                <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                  <span className="text-[9px] text-slate-400 block">TMP</span>
                  <span className="font-bold text-slate-200">{selectedPlayer.ratings.tmp}</span>
                </div>
                <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                  <span className="text-[9px] text-slate-400 block">AGG</span>
                  <span className="font-bold text-amber-300">{selectedPlayer.ratings.agg ?? 75}</span>
                </div>
                <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                  <span className="text-[9px] text-slate-400 block">STY</span>
                  <span className="font-bold text-purple-300">{selectedPlayer.ratings.sty ?? 75}</span>
                </div>
                <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                  <span className="text-[9px] text-slate-400 block">vP</span>
                  <span className="font-bold text-emerald-400">{selectedPlayer.ratings.vp ?? 75}</span>
                </div>
                <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                  <span className="text-[9px] text-slate-400 block">vS</span>
                  <span className="font-bold text-blue-400">{selectedPlayer.ratings.vs ?? 75}</span>
                </div>
              </div>
            </div>

            {/* Bowling & Fielding Ratings Grid */}
            <div className="p-3 bg-slate-900/60 rounded-2xl border border-slate-800 mb-3">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-2 font-bold">
                BOWLING & FIELDING ATTRIBUTES
              </span>
              <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-xs">
                <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                  <span className="text-[9px] text-slate-400 block">BOWL</span>
                  <span className="font-bold text-emerald-400">{selectedPlayer.ratings.bowl}</span>
                </div>
                <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                  <span className="text-[9px] text-slate-400 block">PAC</span>
                  <span className="font-bold text-cyan-400">{selectedPlayer.ratings.pace}</span>
                </div>
                <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                  <span className="text-[9px] text-slate-400 block">CTR</span>
                  <span className="font-bold text-blue-400">{selectedPlayer.ratings.ctrl}</span>
                </div>
                <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                  <span className="text-[9px] text-slate-400 block">DTH</span>
                  <span className="font-bold text-rose-400">{selectedPlayer.ratings.dth}</span>
                </div>
                <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                  <span className="text-[9px] text-slate-400 block">VAR</span>
                  <span className="font-bold text-amber-300">{selectedPlayer.ratings.var ?? 75}</span>
                </div>
                <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                  <span className="text-[9px] text-slate-400 block">COMP</span>
                  <span className="font-bold text-teal-300">{selectedPlayer.ratings.comp ?? 75}</span>
                </div>
                <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                  <span className="text-[9px] text-slate-400 block">CAT</span>
                  <span className="font-bold text-amber-400">{selectedPlayer.ratings.cat}</span>
                </div>
                <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                  <span className="text-[9px] text-slate-400 block">FIT</span>
                  <span className="font-bold text-emerald-300">{selectedPlayer.ratings.fit ?? selectedPlayer.fitness}</span>
                </div>
              </div>
            </div>

            {/* Role-Specific Career Stats Card */}
            <PlayerCareerStatsCard player={selectedPlayer} className="mb-4" />

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setTeamCaptain(selectedPlayer.id);
                  setSelectedPlayer(prev => prev ? { ...prev, isCaptain: true } : null);
                }}
                disabled={userTeam.captainId === selectedPlayer.id || selectedPlayer.isCaptain}
                className={`py-3 font-black text-xs uppercase rounded-xl tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                  userTeam.captainId === selectedPlayer.id || selectedPlayer.isCaptain
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-default'
                    : 'bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-400/40 active:scale-95'
                }`}
              >
                <Star className="w-3.5 h-3.5 fill-current" />
                <span>
                  {userTeam.captainId === selectedPlayer.id || selectedPlayer.isCaptain
                    ? 'TEAM CAPTAIN (★)'
                    : 'MAKE CAPTAIN (★)'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedPlayer(null)}
                className="py-3 bg-amber-400 text-black font-black text-xs uppercase rounded-xl tracking-wider"
              >
                DONE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
