import React, { useState, useMemo } from 'react';
import { Trophy, ChevronDown, Flame, Star, Play, FastForward, RotateCcw, Sparkles, CheckCircle2, Lock } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { createInitialPlayoffs } from '../../data/initialData';
import { RetentionModal } from '../dynasty/RetentionModal';
import { sound } from '../../utils/soundEffects';
import { TeamLogo } from '../common/TeamLogo';

export const LeagueScreen: React.FC = () => {
  const {
    leagues,
    currentLeagueId,
    setCurrentLeagueId,
    teams,
    userTeam,
    players,
    playPlayoffMatch,
    simPlayoffMatch,
    resetPlayoffBracket,
    pendingRetentionModal,
    setPendingRetentionModal
  } = useGame();

  const [activeTab, setActiveTab] = useState<'standings' | 'playoffs' | 'leaders'>('standings');
  const [showLeagueDropdown, setShowLeagueDropdown] = useState(false);
  const [leaderFilter, setLeaderFilter] = useState<'all' | 'franchise'>('all');
  const [showRetentionModal, setShowRetentionModal] = useState(false);

  const currentLeague = leagues.find(l => l.id === currentLeagueId) || leagues[0];
  const allLeagueTeams = useMemo(() => {
    const map = new Map<string, typeof teams[0]>();
    teams.forEach(t => map.set(t.id, t));
    (currentLeague.teams || []).forEach(t => map.set(t.id, t));
    return Array.from(map.values());
  }, [teams, currentLeague.teams]);

  const resolveTeam = (teamId: string | null | undefined) => {
    if (!teamId) return undefined;
    return allLeagueTeams.find(t => t.id === teamId);
  };

  const playoffs = currentLeague.playoffs || createInitialPlayoffs(currentLeague.standings);

  const handleSelectLeague = (id: string) => {
    sound.playTap();
    setCurrentLeagueId(id);
    setShowLeagueDropdown(false);
  };

  // Resolve active player pool for Orange Cap & Purple Cap
  const leaderboardPool = useMemo(() => {
    if (leaderFilter === 'franchise') {
      return players
        .filter(p => p.clubId === userTeam.id)
        .map(p => ({ player: p, teamShort: userTeam.shortName }));
    }
    if (currentLeague.id !== 'pt20' && currentLeague.teams && currentLeague.teams.length > 0) {
      const entries: { player: typeof players[0]; teamShort: string }[] = [];
      const seen = new Set<string>();
      currentLeague.teams.forEach(lt => {
        lt.playingXIIds.forEach(pid => {
          if (seen.has(pid)) return;
          const livePlayer = players.find(p => p.id === pid);
          if (livePlayer) {
            seen.add(pid);
            entries.push({ player: livePlayer, teamShort: lt.shortName });
          }
        });
      });
      if (entries.length > 0) return entries;
    }
    return players.map(p => {
      const t = teams.find(tm => tm.id === p.clubId);
      return { player: p, teamShort: t?.shortName || 'IPL' };
    });
  }, [leaderFilter, players, userTeam, currentLeague, teams]);

  const orangeCapLeaders = useMemo(() => {
    return [...leaderboardPool]
      .sort((a, b) => (b.player.stats?.runs || 0) - (a.player.stats?.runs || 0))
      .slice(0, 8)
      .map(({ player: p, teamShort }) => {
        const runs = p.stats?.runs || 0;
        const balls = p.stats?.balls || 1;
        const matches = Math.max(1, p.stats?.matches || 1);
        const avg = p.stats?.average ?? Number((runs / Math.max(1, Math.round(matches * 0.82))).toFixed(1));
        const sr = p.stats?.strikeRate ?? Number(((runs / Math.max(1, balls)) * 100).toFixed(1));
        return {
          id: p.id,
          name: p.name,
          team: teamShort,
          runs,
          matches,
          avg,
          sr
        };
      });
  }, [leaderboardPool]);

  const purpleCapLeaders = useMemo(() => {
    return [...leaderboardPool]
      .filter(({ player: p }) => (p.stats?.wickets || 0) > 0 || p.role === 'Pace' || p.role === 'Spin' || p.role === 'All-rounder')
      .sort((a, b) => (b.player.stats?.wickets || 0) - (a.player.stats?.wickets || 0))
      .slice(0, 8)
      .map(({ player: p, teamShort }) => {
        const wkts = p.stats?.wickets || 0;
        const overs = Math.max(1, p.stats?.oversBowled || 1);
        const runsConceded = p.stats?.runsConceded || 0;
        const econ = p.stats?.economy ?? Number((runsConceded / overs).toFixed(1));
        const best = p.stats?.bestBowling && p.stats.bestBowling !== '0/0'
          ? p.stats.bestBowling
          : `${Math.min(5, Math.max(1, Math.round(wkts / 18)))}/${18 + (p.age % 9)}`;
        return {
          id: p.id,
          name: p.name,
          team: teamShort,
          wkts,
          econ,
          best
        };
      });
  }, [leaderboardPool]);

  const mvpLeaders = useMemo(() => {
    return [...leaderboardPool]
      .map(({ player: p, teamShort }) => {
        const runs = p.stats?.runs || 0;
        const wkts = p.stats?.wickets || 0;
        const fours = p.stats?.fours || Math.round(runs * 0.09);
        const sixes = p.stats?.sixes || Math.round(runs * 0.04);
        const econ = p.stats?.economy || 8.0;
        const econBonus = wkts > 0 && econ < 7.5 ? Math.round((7.5 - econ) * 8) : 0;
        const pts = Number(((runs * 0.5) + (fours * 1) + (sixes * 2) + (wkts * 12) + econBonus).toFixed(1));
        return {
          id: p.id,
          name: p.name,
          team: teamShort,
          pts,
          runs,
          wkts,
          matches: Math.max(1, p.stats?.matches || 0)
        };
      })
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 8);
  }, [leaderboardPool]);

  // Playoff bracket team resolution
  const q1Home = resolveTeam(playoffs.q1.homeTeamId || currentLeague.standings[0]?.teamId);
  const q1Away = resolveTeam(playoffs.q1.awayTeamId || currentLeague.standings[1]?.teamId);
  const elimHome = resolveTeam(playoffs.eliminator.homeTeamId || currentLeague.standings[2]?.teamId);
  const elimAway = resolveTeam(playoffs.eliminator.awayTeamId || currentLeague.standings[3]?.teamId);
  const q2Home = resolveTeam(playoffs.q2.homeTeamId || playoffs.q1.loserTeamId);
  const q2Away = resolveTeam(playoffs.q2.awayTeamId || playoffs.eliminator.winnerTeamId);
  const finalHome = resolveTeam(playoffs.final.homeTeamId || playoffs.q1.winnerTeamId);
  const finalAway = resolveTeam(playoffs.final.awayTeamId || playoffs.q2.winnerTeamId);
  const championTeam = resolveTeam(playoffs.championTeamId || playoffs.final.winnerTeamId);

  const canPlayQ2 = playoffs.q1.completed && playoffs.eliminator.completed && !!q2Home && !!q2Away;
  const canPlayFinal = playoffs.q1.completed && playoffs.q2.completed && !!finalHome && !!finalAway;

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col justify-between max-w-7xl mx-auto w-full pb-24 select-none">
      {/* Top Header */}
      <div className="px-6 py-3.5 bg-[#0c121e] border-b border-slate-800/80 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-2">
          {leagues.length > 1 ? (
            <button
              onClick={() => { sound.playTap(); setShowLeagueDropdown(!showLeagueDropdown); }}
              className="flex items-center gap-1.5 p-1 rounded-lg hover:bg-slate-800/60 transition-all text-left"
            >
              <div>
                <h1 className="text-base font-black text-white font-display uppercase tracking-wide flex items-center gap-1">
                  {currentLeague.name} <ChevronDown className="w-4 h-4 text-amber-400" />
                </h1>
                <span className="text-[11px] text-slate-400 font-mono">
                  {currentLeague.seasonName} · 20 Overs · 10 Franchises
                </span>
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <h1 className="text-base font-black text-white font-display uppercase tracking-wide">
                  {currentLeague.name}
                </h1>
                <span className="text-[11px] text-slate-400 font-mono">
                  {currentLeague.seasonName} · 20 Overs · 10 Franchises
                </span>
              </div>
            </div>
          )}

          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            {currentLeague.country}
          </span>
        </div>

        {/* League Selector Dropdown */}
        {showLeagueDropdown && (
          <div className="mb-2 p-1.5 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col gap-1 max-w-md">
            {leagues.map(l => (
              <button
                key={l.id}
                onClick={() => handleSelectLeague(l.id)}
                className={`p-2 rounded-xl text-left text-xs font-bold flex items-center justify-between ${
                  l.id === currentLeagueId ? 'bg-amber-400 text-black' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>{l.name}</span>
                <span className="text-[10px] font-mono opacity-80">
                  {l.rules.overs === 100 ? '100-Ball' : l.rules.powerSurge ? 'T20 · Surge' : 'T20'}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Tab Switcher */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 rounded-xl text-xs font-bold uppercase max-w-xl">
          <button
            onClick={() => { sound.playTap(); setActiveTab('standings'); }}
            className={`py-1.5 rounded-lg transition-all ${
              activeTab === 'standings' ? 'bg-amber-400 text-black shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            STANDINGS
          </button>
          <button
            onClick={() => { sound.playTap(); setActiveTab('playoffs'); }}
            className={`py-1.5 rounded-lg transition-all ${
              activeTab === 'playoffs' ? 'bg-amber-400 text-black shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            PLAYOFFS
          </button>
          <button
            onClick={() => { sound.playTap(); setActiveTab('leaders'); }}
            className={`py-1.5 rounded-lg transition-all ${
              activeTab === 'leaders' ? 'bg-amber-400 text-black shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            CAPS & STATS
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 px-6 py-4 flex flex-col gap-4">
        {activeTab === 'standings' && (
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span>Top 4 qualify for Finals Series</span>
              <span className="font-mono text-[10px]">P W L PTS NRR</span>
            </div>

            {/* Standings Table */}
            <div className="bg-[#0f172a] rounded-3xl border border-slate-800 overflow-hidden text-xs">
              <div className="grid grid-cols-12 px-3 py-2 bg-slate-900/90 text-[10px] font-mono text-slate-400 border-b border-slate-800">
                <span className="col-span-1 text-center">#</span>
                <span className="col-span-5">TEAM</span>
                <span className="col-span-1 text-center">P</span>
                <span className="col-span-1 text-center">W</span>
                <span className="col-span-1 text-center">L</span>
                <span className="col-span-1 text-center font-bold text-white">PTS</span>
                <span className="col-span-2 text-right">NRR</span>
              </div>

              {currentLeague.standings.map((row, idx) => {
                const team = resolveTeam(row.teamId);
                const isUser = team?.id === userTeam.id;
                const isPlayoffSpot = idx < 4;

                return (
                  <div
                    key={row.teamId}
                    className={`grid grid-cols-12 px-3 py-2.5 items-center border-b border-slate-800/50 ${
                      isUser ? 'bg-amber-500/15' : isPlayoffSpot ? 'bg-slate-900/40' : ''
                    }`}
                  >
                    <span className={`col-span-1 text-center font-mono font-bold ${
                      idx === 0 ? 'text-amber-400' : isPlayoffSpot ? 'text-cyan-400' : 'text-slate-500'
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="col-span-5 flex items-center gap-2 min-w-0">
                      <TeamLogo teamId={team?.id} shortName={team?.shortName} size={22} fallbackEmoji={team?.logoEmoji} />
                      <div className="min-w-0">
                        <span className={`font-bold truncate block ${isUser ? 'text-amber-300' : 'text-white'}`}>
                          {team?.name || row.teamId}
                        </span>
                        <div className="flex items-center gap-0.5 mt-0.5">
                          {(row.recentForm || []).map((f, fIdx) => (
                            <span
                              key={fIdx}
                              className={`text-[8px] font-mono px-1 rounded ${
                                f === 'W'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-rose-500/20 text-rose-400'
                              }`}
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <span className="col-span-1 text-center font-mono-nums text-slate-400">{row.played}</span>
                    <span className="col-span-1 text-center font-mono-nums text-emerald-400 font-semibold">{row.won}</span>
                    <span className="col-span-1 text-center font-mono-nums text-rose-400">{row.lost}</span>
                    <span className="col-span-1 text-center font-mono-nums font-black text-white">{row.points}</span>
                    <span className={`col-span-2 text-right font-mono-nums ${
                      row.nrr >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {row.nrr >= 0 ? `+${row.nrr.toFixed(2)}` : row.nrr.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PLAYABLE 4-STAGE PLAYOFFS BRACKET */}
        {activeTab === 'playoffs' && (
          <div className="flex flex-col gap-3">
            {/* Stage 1: Qualifier 1 */}
            <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold">
                  QUALIFIER 1 · 1st vs 2nd
                </span>
                {playoffs.q1.completed && (
                  <span className="text-[10px] font-mono font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> COMPLETED
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
                <span className={`font-bold flex items-center gap-1.5 text-xs truncate max-w-[44%] ${
                  playoffs.q1.winnerTeamId === q1Home?.id ? 'text-emerald-400' : 'text-white'
                }`}>
                  <TeamLogo teamId={q1Home?.id} shortName={q1Home?.shortName} size={20} fallbackEmoji={q1Home?.logoEmoji} />
                  <span className="truncate">{q1Home?.name || '1st Place'} (1st)</span>
                </span>
                <span className="text-xs font-mono font-bold text-amber-400 px-1">VS</span>
                <span className={`font-bold flex items-center gap-1.5 text-xs truncate max-w-[44%] ${
                  playoffs.q1.winnerTeamId === q1Away?.id ? 'text-emerald-400' : 'text-white'
                }`}>
                  <TeamLogo teamId={q1Away?.id} shortName={q1Away?.shortName} size={20} fallbackEmoji={q1Away?.logoEmoji} />
                  <span className="truncate">{q1Away?.name || '2nd Place'} (2nd)</span>
                </span>
              </div>
              {playoffs.q1.completed && playoffs.q1.resultSummary ? (
                <p className="text-[11px] text-emerald-300 font-mono mt-2 bg-emerald-950/30 border border-emerald-500/20 rounded-xl px-2.5 py-1.5">
                  {playoffs.q1.resultSummary}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 mt-2.5">
                  <button
                    onClick={() => playPlayoffMatch(currentLeague.id, 'q1')}
                    className="py-2 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-[11px] uppercase flex items-center justify-center gap-1.5 shadow active:scale-95"
                  >
                    <Play className="w-3.5 h-3.5 fill-black" /> PLAY PLAYOFF MATCH
                  </button>
                  <button
                    onClick={() => simPlayoffMatch(currentLeague.id, 'q1')}
                    className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 font-bold text-[11px] uppercase flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <FastForward className="w-3.5 h-3.5" /> SIM PLAYOFF MATCH
                  </button>
                </div>
              )}
              <span className="text-[10px] text-slate-400 font-mono mt-1.5 block">
                Winner advances to Grand Final · Loser plays Qualifier 2
              </span>
            </div>

            {/* Stage 2: Eliminator */}
            <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                  ELIMINATOR · 3rd vs 4th
                </span>
                {playoffs.eliminator.completed && (
                  <span className="text-[10px] font-mono font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> COMPLETED
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
                <span className={`font-bold flex items-center gap-1.5 text-xs truncate max-w-[44%] ${
                  playoffs.eliminator.winnerTeamId === elimHome?.id ? 'text-emerald-400' : 'text-white'
                }`}>
                  <TeamLogo teamId={elimHome?.id} shortName={elimHome?.shortName} size={20} fallbackEmoji={elimHome?.logoEmoji} />
                  <span className="truncate">{elimHome?.name || '3rd Place'} (3rd)</span>
                </span>
                <span className="text-xs font-mono font-bold text-cyan-400 px-1">VS</span>
                <span className={`font-bold flex items-center gap-1.5 text-xs truncate max-w-[44%] ${
                  playoffs.eliminator.winnerTeamId === elimAway?.id ? 'text-emerald-400' : 'text-white'
                }`}>
                  <TeamLogo teamId={elimAway?.id} shortName={elimAway?.shortName} size={20} fallbackEmoji={elimAway?.logoEmoji} />
                  <span className="truncate">{elimAway?.name || '4th Place'} (4th)</span>
                </span>
              </div>
              {playoffs.eliminator.completed && playoffs.eliminator.resultSummary ? (
                <p className="text-[11px] text-emerald-300 font-mono mt-2 bg-emerald-950/30 border border-emerald-500/20 rounded-xl px-2.5 py-1.5">
                  {playoffs.eliminator.resultSummary}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 mt-2.5">
                  <button
                    onClick={() => playPlayoffMatch(currentLeague.id, 'eliminator')}
                    className="py-2 px-3 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-black text-[11px] uppercase flex items-center justify-center gap-1.5 shadow active:scale-95"
                  >
                    <Play className="w-3.5 h-3.5 fill-black" /> PLAY PLAYOFF MATCH
                  </button>
                  <button
                    onClick={() => simPlayoffMatch(currentLeague.id, 'eliminator')}
                    className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 font-bold text-[11px] uppercase flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <FastForward className="w-3.5 h-3.5" /> SIM PLAYOFF MATCH
                  </button>
                </div>
              )}
              <span className="text-[10px] text-slate-400 font-mono mt-1.5 block">
                Winner advances to Qualifier 2 · Loser is eliminated
              </span>
            </div>

            {/* Stage 3: Qualifier 2 */}
            <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-purple-400 font-bold">
                  QUALIFIER 2 · Loser Q1 vs Winner Elim
                </span>
                {playoffs.q2.completed ? (
                  <span className="text-[10px] font-mono font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> COMPLETED
                  </span>
                ) : !canPlayQ2 ? (
                  <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> AWAITING Q1 & ELIM
                  </span>
                ) : null}
              </div>
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
                <span className={`font-bold flex items-center gap-1.5 text-xs truncate max-w-[44%] ${
                  playoffs.q2.winnerTeamId && playoffs.q2.winnerTeamId === q2Home?.id ? 'text-emerald-400' : 'text-white'
                }`}>
                  <TeamLogo teamId={q2Home?.id} shortName={q2Home?.shortName} size={20} fallbackEmoji={q2Home?.logoEmoji || '⏳'} />
                  <span className="truncate">{q2Home?.name || 'Loser Qualifier 1'}</span>
                </span>
                <span className="text-xs font-mono font-bold text-purple-400 px-1">VS</span>
                <span className={`font-bold flex items-center gap-1.5 text-xs truncate max-w-[44%] ${
                  playoffs.q2.winnerTeamId && playoffs.q2.winnerTeamId === q2Away?.id ? 'text-emerald-400' : 'text-white'
                }`}>
                  <TeamLogo teamId={q2Away?.id} shortName={q2Away?.shortName} size={20} fallbackEmoji={q2Away?.logoEmoji || '⏳'} />
                  <span className="truncate">{q2Away?.name || 'Winner Eliminator'}</span>
                </span>
              </div>
              {playoffs.q2.completed && playoffs.q2.resultSummary ? (
                <p className="text-[11px] text-emerald-300 font-mono mt-2 bg-emerald-950/30 border border-emerald-500/20 rounded-xl px-2.5 py-1.5">
                  {playoffs.q2.resultSummary}
                </p>
              ) : canPlayQ2 ? (
                <div className="grid grid-cols-2 gap-2 mt-2.5">
                  <button
                    onClick={() => playPlayoffMatch(currentLeague.id, 'q2')}
                    className="py-2 px-3 rounded-xl bg-purple-400 hover:bg-purple-300 text-black font-black text-[11px] uppercase flex items-center justify-center gap-1.5 shadow active:scale-95"
                  >
                    <Play className="w-3.5 h-3.5 fill-black" /> PLAY PLAYOFF MATCH
                  </button>
                  <button
                    onClick={() => simPlayoffMatch(currentLeague.id, 'q2')}
                    className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-500/30 font-bold text-[11px] uppercase flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <FastForward className="w-3.5 h-3.5" /> SIM PLAYOFF MATCH
                  </button>
                </div>
              ) : null}
              <span className="text-[10px] text-slate-400 font-mono mt-1.5 block">
                Winner advances to face {finalHome?.shortName || 'Qualifier 1 Winner'} in the Grand Final
              </span>
            </div>

            {/* Stage 4: The Grand Final */}
            <div className="bg-gradient-to-b from-amber-950/50 to-[#0f172a] border border-amber-500/40 rounded-3xl p-4 text-center">
              <Trophy className="w-8 h-8 text-amber-400 mx-auto mb-1" />
              <span className="font-display font-black text-xl text-white uppercase block">
                THE GRAND FINAL
              </span>
              <span className="text-[11px] text-amber-300 font-mono block mb-3">
                Championship Showdown · Winner Q1 vs Winner Q2
              </span>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/90 border border-amber-500/30 text-left">
                <span className={`font-bold flex items-center gap-1.5 text-xs truncate max-w-[44%] ${
                  playoffs.final.winnerTeamId && playoffs.final.winnerTeamId === finalHome?.id ? 'text-amber-400' : 'text-white'
                }`}>
                  <TeamLogo teamId={finalHome?.id} shortName={finalHome?.shortName} size={20} fallbackEmoji={finalHome?.logoEmoji || '🏆'} />
                  <span className="truncate">{finalHome?.name || 'Winner Qualifier 1'}</span>
                </span>
                <span className="text-xs font-mono font-bold text-amber-400 px-1">VS</span>
                <span className={`font-bold flex items-center gap-1.5 text-xs truncate max-w-[44%] ${
                  playoffs.final.winnerTeamId && playoffs.final.winnerTeamId === finalAway?.id ? 'text-amber-400' : 'text-white'
                }`}>
                  <TeamLogo teamId={finalAway?.id} shortName={finalAway?.shortName} size={20} fallbackEmoji={finalAway?.logoEmoji || '🏆'} />
                  <span className="truncate">{finalAway?.name || 'Winner Qualifier 2'}</span>
                </span>
              </div>

              {playoffs.final.completed && championTeam ? (
                <div className="mt-3 p-3 rounded-2xl bg-amber-500/15 border border-amber-400/50 flex flex-col items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-amber-300 font-bold">
                    {currentLeague.name} CHAMPIONS
                  </span>
                  <div className="text-base font-black text-white font-display uppercase flex items-center gap-2">
                    <TeamLogo teamId={championTeam.id} shortName={championTeam.shortName} size={28} fallbackEmoji={championTeam.logoEmoji} />
                    <span>{championTeam.name}</span>
                    <span>🏆</span>
                  </div>
                  {playoffs.final.resultSummary && (
                    <span className="text-[11px] font-mono text-emerald-300">
                      {playoffs.final.resultSummary}
                    </span>
                  )}
                  <div className="grid grid-cols-2 gap-2 w-full mt-1">
                    <button
                      onClick={() => { sound.playTap(); setShowRetentionModal(true); }}
                      className="py-2 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-[11px] uppercase flex items-center justify-center gap-1.5 shadow"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> RETENTION & DYNASTY
                    </button>
                    <button
                      onClick={() => resetPlayoffBracket(currentLeague.id)}
                      className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] uppercase flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> RESET BRACKET
                    </button>
                  </div>
                </div>
              ) : canPlayFinal ? (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button
                    onClick={() => playPlayoffMatch(currentLeague.id, 'final')}
                    className="py-2.5 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase flex items-center justify-center gap-1.5 shadow-lg active:scale-95"
                  >
                    <Play className="w-3.5 h-3.5 fill-black" /> PLAY PLAYOFF MATCH
                  </button>
                  <button
                    onClick={() => simPlayoffMatch(currentLeague.id, 'final')}
                    className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 font-bold text-xs uppercase flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <FastForward className="w-3.5 h-3.5" /> SIM PLAYOFF MATCH
                  </button>
                </div>
              ) : (
                <span className="text-[10px] font-mono text-slate-400 mt-2 block">
                  Complete Qualifier 1, Eliminator & Qualifier 2 to unlock The Grand Final
                </span>
              )}
            </div>
          </div>
        )}

        {/* REAL DYNAMIC CAPS & LEADERS */}
        {activeTab === 'leaders' && (
          <div className="flex flex-col gap-3">
            {/* Filter toggle: All Players vs Franchise Only */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800">
              <button
                onClick={() => { sound.playTap(); setLeaderFilter('all'); }}
                className={`py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                  leaderFilter === 'all'
                    ? 'bg-amber-400 text-black shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                ALL PLAYERS
              </button>
              <button
                onClick={() => { sound.playTap(); setLeaderFilter('franchise'); }}
                className={`py-1.5 rounded-lg text-xs font-bold uppercase transition-all flex items-center justify-center gap-1.5 ${
                  leaderFilter === 'franchise'
                    ? 'bg-amber-400 text-black shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>{userTeam.logoEmoji}</span>
                <span>{userTeam.shortName} ONLY</span>
              </button>
            </div>

            {/* Orange Cap (Most Runs - Top 8) */}
            <div className="bg-[#0f172a] border border-amber-500/30 rounded-3xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-1.5 font-display">
                  <Flame className="w-4 h-4 fill-amber-400" />
                  ORANGE CAP · MOST RUNS
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {leaderFilter === 'all' ? 'TOP 8 LEADERS' : `${userTeam.shortName} SQUAD`}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {orangeCapLeaders.map((item, i) => (
                  <div key={item.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-mono font-bold w-4 ${i === 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                        {i + 1}.
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white truncate">{item.name}</span>
                          <span className="text-[10px] font-mono text-amber-300/90 px-1.5 py-0.5 rounded bg-amber-500/10">
                            {item.team}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          Mat {item.matches} · Avg {item.avg} · SR {item.sr}
                        </span>
                      </div>
                    </div>
                    <div className="font-mono-nums font-black text-amber-400 text-right">
                      {item.runs} <span className="text-[10px] text-slate-400 font-normal">runs</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Purple Cap (Most Wickets - Top 8) */}
            <div className="bg-[#0f172a] border border-purple-500/30 rounded-3xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-purple-400 uppercase tracking-wider flex items-center gap-1.5 font-display">
                  <Star className="w-4 h-4 fill-purple-400" />
                  PURPLE CAP · MOST WICKETS
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {leaderFilter === 'all' ? 'TOP 8 LEADERS' : `${userTeam.shortName} SQUAD`}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {purpleCapLeaders.map((item, i) => (
                  <div key={item.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-mono font-bold w-4 ${i === 0 ? 'text-purple-400' : 'text-slate-400'}`}>
                        {i + 1}.
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white truncate">{item.name}</span>
                          <span className="text-[10px] font-mono text-purple-300/90 px-1.5 py-0.5 rounded bg-purple-500/10">
                            {item.team}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          Econ {item.econ} · Best {item.best}
                        </span>
                      </div>
                    </div>
                    <div className="font-mono-nums font-black text-purple-400 text-right">
                      {item.wkts} <span className="text-[10px] text-slate-400 font-normal">wkts</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Most Valuable Player (MVP Points - Top 8) */}
            <div className="bg-[#0f172a] border border-emerald-500/30 rounded-3xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 font-display">
                  <Sparkles className="w-4 h-4 fill-emerald-400" />
                  MOST VALUABLE PLAYER · MVP RACE
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  IMPACT INDEX
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {mvpLeaders.map((item, i) => (
                  <div key={item.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-mono font-bold w-4 ${i === 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                        {i + 1}.
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white truncate">{item.name}</span>
                          <span className="text-[10px] font-mono text-emerald-300/90 px-1.5 py-0.5 rounded bg-emerald-500/10">
                            {item.team}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          {item.runs} runs · {item.wkts} wkts
                        </span>
                      </div>
                    </div>
                    <div className="font-mono-nums font-black text-emerald-400 text-right">
                      {item.pts} <span className="text-[10px] text-slate-400 font-normal">pts</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Season Retention & Dynasty Modal */}
      <RetentionModal
        isOpen={showRetentionModal || pendingRetentionModal}
        onClose={() => {
          setShowRetentionModal(false);
          setPendingRetentionModal(false);
        }}
      />
    </div>
  );
};
