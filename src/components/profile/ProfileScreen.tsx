import React, { useState, useMemo } from 'react';
import { Trophy, Lock, Edit3, Search, Filter, Shield, Award, CheckCircle2, AlertCircle, Briefcase, TrendingUp } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { PlayerRole, JobOffer } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';
import { TeamLogo } from '../common/TeamLogo';

export const ProfileScreen: React.FC = () => {
  const {
    coachProfile,
    achievements,
    resignNationalJob,
    userTeam,
    teams,
    nations,
    players,
    updatePlayer,
    jobOffers,
    acceptJobOffer
  } = useGame();

  const [statsTab, setStatsTab] = useState<'domestic' | 'national'>('domestic');
  const [profileViewTab, setProfileViewTab] = useState<'stints' | 'board' | 'offers'>('board');
  const [showRosterEditor, setShowRosterEditor] = useState(false);

  // Phase 13: Full Searchable 265-Player Roster & Attribute Editor state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>('ALL');
  const [selectedPlayerForEdit, setSelectedPlayerForEdit] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    role: PlayerRole;
    age: number;
    bat: number;
    pow: number;
    bowl: number;
    ctrl: number;
  }>({
    name: '',
    role: 'Top-order',
    age: 25,
    bat: 80,
    pow: 80,
    bowl: 60,
    ctrl: 75
  });
  const [editorSaveToast, setEditorSaveToast] = useState<string | null>(null);

  const coachedNation = nations.find(n => n.id === coachProfile.nationalTeamId);
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  const filteredEditorPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return players.filter(p => {
      if (selectedTeamFilter !== 'ALL' && p.clubId !== selectedTeamFilter) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.country.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q)
      );
    });
  }, [players, searchQuery, selectedTeamFilter]);

  const handleStartEditPlayer = (playerId: string) => {
    const player = players.find(p => p.id === playerId);
    if (!player) return;
    sound.playTap();
    setSelectedPlayerForEdit(player.id);
    setEditForm({
      name: player.name,
      role: player.role,
      age: player.age,
      bat: player.ratings.bat,
      pow: player.ratings.pow,
      bowl: player.ratings.bowl,
      ctrl: player.ratings.ctrl
    });
  };

  const handleSavePlayerAttributes = (playerId: string) => {
    const player = players.find(p => p.id === playerId);
    if (!player || !editForm.name.trim()) return;

    const clampRating = (v: number) => Math.max(1, Math.min(99, Math.round(Number(v) || 50)));
    const clampAge = (v: number) => Math.max(15, Math.min(48, Math.round(Number(v) || 24)));

    const updatedPlayer = {
      ...player,
      name: editForm.name.trim(),
      role: editForm.role,
      age: clampAge(editForm.age),
      ratings: {
        ...player.ratings,
        bat: clampRating(editForm.bat),
        pow: clampRating(editForm.pow),
        bowl: clampRating(editForm.bowl),
        ctrl: clampRating(editForm.ctrl)
      }
    };

    updatePlayer(updatedPlayer);
    setSelectedPlayerForEdit(null);
    sound.playTap();
    setEditorSaveToast(`Updated ${updatedPlayer.name} (${updatedPlayer.role})!`);
    setTimeout(() => setEditorSaveToast(null), 2500);
  };

  const getTeamBadgeLabel = (clubId?: string) => {
    if (!clubId) return 'INTL';
    const found = teams.find(t => t.id === clubId);
    return found ? found.shortName : clubId.replace('team_', '').toUpperCase();
  };

  const completedBoardTargets = useMemo(() => {
    return (coachProfile.boardTargets || []).filter(bt => bt.completed).length;
  }, [coachProfile.boardTargets]);

  const totalBoardTargets = coachProfile.boardTargets?.length || 3;

  const jobSecurityPct = useMemo(() => {
    const base = 48;
    const targetBonus = completedBoardTargets * 14;
    const winRateEffect = ((coachProfile.domesticStats?.winPct || 50) - 50) * 0.55;
    const streakBonus = (coachProfile.domesticStats?.currentStreak || 0) * 3;
    return Math.min(99, Math.max(22, Math.round(base + targetBonus + winRateEffect + streakBonus)));
  }, [completedBoardTargets, coachProfile.domesticStats]);

  const jobSecurityBadge = useMemo(() => {
    if (jobSecurityPct >= 85) return { label: 'Board Delighted', color: 'text-emerald-400', border: 'border-emerald-500/40', bg: 'bg-emerald-500/10' };
    if (jobSecurityPct >= 70) return { label: 'Secure', color: 'text-emerald-300', border: 'border-emerald-500/30', bg: 'bg-emerald-950/40' };
    if (jobSecurityPct >= 50) return { label: 'Stable', color: 'text-amber-300', border: 'border-amber-500/30', bg: 'bg-amber-950/40' };
    return { label: 'Under Review', color: 'text-rose-400', border: 'border-rose-500/40', bg: 'bg-rose-950/40' };
  }, [jobSecurityPct]);

  const coachReputation = useMemo(() => {
    const titles = (coachProfile.domesticStats?.titles || 0) + (coachProfile.nationalStats?.worldCups || 0);
    const winPct = coachProfile.domesticStats?.winPct || 0;
    const matches = coachProfile.domesticStats?.matches || 0;
    if (titles >= 3) return { title: 'Legendary Mastermind', tier: 'S-TIER', color: 'text-amber-400' };
    if (titles >= 1) return { title: 'Championship Winner', tier: 'A-TIER', color: 'text-cyan-400' };
    if (winPct >= 65 && matches >= 5) return { title: 'Elite Tactician', tier: 'A-TIER', color: 'text-emerald-400' };
    if (matches >= 10) return { title: 'Proven Veteran', tier: 'B-TIER', color: 'text-slate-200' };
    return { title: 'Emerging Strategist', tier: 'RISING', color: 'text-slate-400' };
  }, [coachProfile.domesticStats, coachProfile.nationalStats]);

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col justify-between max-w-7xl mx-auto w-full pb-24 select-none">
      {/* Top Profile Header */}
      <div className="px-6 py-4 bg-[#0c121e] border-b border-slate-800/80 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-400 text-black flex items-center justify-center font-black text-lg font-display">
              {coachProfile.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-white font-display uppercase tracking-wide leading-none">
                  {coachProfile.name}
                </h1>
                <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-900 border border-slate-700 ${coachReputation.color}`}>
                  {coachReputation.tier} · {coachReputation.title.toUpperCase()}
                </span>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Head Coach · Age {coachProfile.age} · {userTeam.name}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold border ${jobSecurityBadge.bg} ${jobSecurityBadge.border} ${jobSecurityBadge.color}`}>
              SECURITY: {jobSecurityPct}% ({jobSecurityBadge.label.toUpperCase()})
            </span>
            <span className="px-2.5 py-1 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
              {coachProfile.difficulty.toUpperCase()}
            </span>
          </div>
        </div>

        {/* 4 Stat KPI Strip */}
        <div className="grid grid-cols-4 gap-3 pt-2.5 border-t border-slate-800/80 text-center max-w-3xl">
          <div>
            <span className="text-base font-black font-mono-nums text-white">
              {coachProfile.domesticStats.winPct}%
            </span>
            <span className="text-[9px] font-mono uppercase text-slate-400 block">WIN %</span>
          </div>
          <div>
            <span className="text-base font-black font-mono-nums text-emerald-400">
              W{coachProfile.domesticStats.bestStreak}
            </span>
            <span className="text-[9px] font-mono uppercase text-slate-400 block">BEST STREAK</span>
          </div>
          <div>
            <span className="text-base font-black font-mono-nums text-amber-400">
              {coachProfile.domesticStats.titles}
            </span>
            <span className="text-[9px] font-mono uppercase text-slate-400 block">DOMESTIC</span>
          </div>
          <div>
            <span className="text-base font-black font-mono-nums text-cyan-400">
              {coachProfile.nationalStats.worldCups}
            </span>
            <span className="text-[9px] font-mono uppercase text-slate-400 block">INTL</span>
          </div>
        </div>

        {/* Resign National Job Action */}
        {coachProfile.nationalTeamId && (
          <button
            onClick={resignNationalJob}
            className="mt-2.5 px-4 py-1.5 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-[10px] font-mono font-bold uppercase transition-all"
          >
            ← RESIGN NATIONAL JOB
          </button>
        )}
      </div>

      {/* Main Container (Browser 12-Column Grid) */}
      <div className="flex-1 px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-6 flex flex-col gap-4">
        {/* Active Teams */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-4 flex flex-col gap-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold block">
            MY TEAMS
          </span>

          <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs">
            <div className="flex items-center gap-2.5">
              <TeamLogo teamId={userTeam.id} shortName={userTeam.shortName} size={28} fallbackEmoji={userTeam.logoEmoji} />
              <div>
                <span className="font-bold text-white block">{userTeam.name}</span>
                <span className="text-[10px] text-slate-400">PT20 Premier League · Current Club</span>
              </div>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 font-bold">ACTIVE FRANCHISE</span>
          </div>

          {coachedNation && (
            <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-xl">{coachedNation.flag}</span>
                <div>
                  <span className="font-bold text-white block">{coachedNation.name}</span>
                  <span className="text-[10px] text-slate-400">International National Side</span>
                </div>
              </div>
              <span className="text-[10px] font-mono text-amber-400 font-bold bg-amber-500/20 px-2 py-0.5 rounded">
                ACTIVE
              </span>
            </div>
          )}
        </div>

        {/* Manager Progression Tab Switcher (Board Mandates / History / Job Offers) */}
        <div className="grid grid-cols-3 gap-1 bg-slate-900/90 p-1 rounded-2xl border border-slate-800 text-xs font-mono font-bold">
          <button
            onClick={() => { sound.playTap(); setProfileViewTab('board'); }}
            className={`py-2 rounded-xl transition-all uppercase flex items-center justify-center gap-1.5 ${
              profileViewTab === 'board' ? 'bg-amber-400 text-black shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>BOARD TARGETS</span>
          </button>
          <button
            onClick={() => { sound.playTap(); setProfileViewTab('stints'); }}
            className={`py-2 rounded-xl transition-all uppercase flex items-center justify-center gap-1.5 ${
              profileViewTab === 'stints' ? 'bg-amber-400 text-black shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>CLUB STINTS</span>
          </button>
          <button
            onClick={() => { sound.playTap(); setProfileViewTab('offers'); }}
            className={`py-2 rounded-xl transition-all uppercase flex items-center justify-center gap-1.5 ${
              profileViewTab === 'offers' ? 'bg-amber-400 text-black shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>OFFERS ({jobOffers.length})</span>
          </button>
        </div>

        {/* TAB A: BOARD TARGETS & JOB SECURITY GAUGE */}
        {profileViewTab === 'board' && (
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold block">
                  FRANCHISE BOARD MANDATE &amp; TARGETS
                </span>
                <h3 className="font-display font-black text-sm text-white uppercase mt-0.5">
                  {userTeam.name} Directives
                </h3>
              </div>
              <span className="text-xs font-mono font-bold text-amber-400">
                {completedBoardTargets} / {totalBoardTargets} ACHIEVED
              </span>
            </div>

            {/* Job Security Gauge */}
            <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-slate-300 font-bold uppercase flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  JOB SECURITY RATING
                </span>
                <span className={`font-mono font-black ${jobSecurityBadge.color}`}>
                  {jobSecurityPct}% · {jobSecurityBadge.label.toUpperCase()}
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  style={{ width: `${jobSecurityPct}%` }}
                  className={`h-full rounded-full transition-all duration-500 ${
                    jobSecurityPct >= 75 ? 'bg-emerald-400' : jobSecurityPct >= 50 ? 'bg-amber-400' : 'bg-rose-400'
                  }`}
                />
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed font-mono">
                Evaluated from playoff seeding, net run rate, squad rotation, and recent competitive form.
              </p>
            </div>

            {/* List of Board Targets */}
            <div className="space-y-2">
              {(coachProfile.boardTargets || []).map(bt => (
                <div
                  key={bt.id}
                  className={`p-3 rounded-2xl border flex items-start justify-between text-xs transition-all ${
                    bt.completed
                      ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-200'
                      : 'bg-slate-900/90 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="space-y-0.5 pr-2">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${bt.completed ? 'text-white' : 'text-slate-200'}`}>
                        {bt.title}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      {bt.description}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase shrink-0 ${
                      bt.completed
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {bt.completed ? '✓ COMPLETED' : 'IN PROGRESS'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB B: FRANCHISE STINT HISTORY */}
        {profileViewTab === 'stints' && (
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold">
                FRANCHISE STINT HISTORY (BY TEAM)
              </span>
              <span className="text-[10px] font-mono text-amber-400">
                {coachProfile.clubStints?.length || 1} {(coachProfile.clubStints?.length || 1) === 1 ? 'Club' : 'Clubs'}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {(coachProfile.clubStints || []).map((stint, idx) => {
                const isCurrentClub = stint.clubId === userTeam.id && stint.yearsLabel.includes('Present');
                return (
                  <div
                    key={`${stint.clubId}-${idx}`}
                    className={`p-2.5 rounded-2xl border flex items-center justify-between text-xs ${
                      isCurrentClub
                        ? 'bg-amber-950/20 border-amber-500/40'
                        : 'bg-slate-900/80 border-slate-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{stint.clubName}</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] font-mono text-slate-300">
                          {stint.yearsLabel}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                        {stint.seasons} {stint.seasons === 1 ? 'season' : 'seasons'} · {stint.matches} matches · {stint.titles} {stint.titles === 1 ? 'title' : 'titles'}
                      </span>
                    </div>
                    <span className={`text-[10px] font-mono font-bold ${isCurrentClub ? 'text-amber-400' : 'text-slate-500'}`}>
                      {isCurrentClub ? 'CURRENT' : 'FORMER'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB C: JOB OFFERS & VACANCIES */}
        {profileViewTab === 'offers' && (
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold">
                AVAILABLE MANAGER CONTRACTS ({jobOffers.length})
              </span>
              <span className="text-[10px] font-mono text-emerald-400 font-bold">
                VACANCIES OPEN
              </span>
            </div>

            <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-0.5">
              {jobOffers.map(offer => (
                <div
                  key={offer.id}
                  className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-xs flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-white text-sm">{offer.name}</h4>
                      <span className="text-[10px] font-mono text-slate-400">
                        {offer.organizationName} · {offer.leagueOrType}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      {offer.tag}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800/80">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-mono">SALARY &amp; TARGET</span>
                      <span className="font-mono text-amber-400 font-bold text-xs">{offer.salaryCr || 4.5} Cr/yr</span>
                      <span className="text-slate-400 text-[10px] ml-1.5">· {offer.boardTarget}</span>
                    </div>
                    <button
                      onClick={() => {
                        sound.playCrowdCheer(0.8);
                        acceptJobOffer(offer);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-[10px] font-mono uppercase transition-all"
                    >
                      ACCEPT ▶
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lifetime Stats Card */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold">
              LIFETIME STATS
            </span>

            <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg text-xs font-mono font-bold">
              <button
                onClick={() => { sound.playTap(); setStatsTab('domestic'); }}
                className={`px-3 py-1 rounded-md uppercase transition-all ${
                  statsTab === 'domestic' ? 'bg-amber-400 text-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                DOMESTIC
              </button>
              <button
                onClick={() => { sound.playTap(); setStatsTab('national'); }}
                className={`px-3 py-1 rounded-md uppercase transition-all ${
                  statsTab === 'national' ? 'bg-amber-400 text-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                NATIONAL
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 bg-slate-900/70 rounded-xl border border-slate-800/80">
              <span className="text-[10px] font-mono text-slate-400 block uppercase">MATCHES</span>
              <span className="text-lg font-black font-mono-nums text-white">
                {statsTab === 'domestic' ? coachProfile.domesticStats.matches : coachProfile.nationalStats.matches}
              </span>
            </div>
            <div className="p-2.5 bg-slate-900/70 rounded-xl border border-slate-800/80">
              <span className="text-[10px] font-mono text-slate-400 block uppercase">WINS / LOSSES</span>
              <span className="text-lg font-black font-mono-nums text-emerald-400">
                {statsTab === 'domestic' ? coachProfile.domesticStats.wins : coachProfile.nationalStats.wins}
                <span className="text-slate-400 text-xs font-normal"> / {statsTab === 'domestic' ? coachProfile.domesticStats.losses : coachProfile.nationalStats.losses}</span>
              </span>
            </div>
            <div className="p-2.5 bg-slate-900/70 rounded-xl border border-slate-800/80">
              <span className="text-[10px] font-mono text-slate-400 block uppercase">WIN %</span>
              <span className="text-lg font-black font-mono-nums text-amber-400">
                {statsTab === 'domestic' ? coachProfile.domesticStats.winPct : coachProfile.nationalStats.winPct}%
              </span>
            </div>
            <div className="p-2.5 bg-slate-900/70 rounded-xl border border-slate-800/80">
              <span className="text-[10px] font-mono text-slate-400 block uppercase">TITLES WON</span>
              <span className="text-lg font-black font-mono-nums text-cyan-400">
                {statsTab === 'domestic' ? coachProfile.domesticStats.titles : coachProfile.nationalStats.worldCups}
              </span>
            </div>
          </div>
        </div>

        {/* Roster Editor Button */}
        <button
          onClick={() => { sound.playTap(); setShowRosterEditor(true); }}
          className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase rounded-2xl flex items-center justify-center gap-2 border border-slate-700/80 transition-all"
        >
          <Edit3 className="w-4 h-4 text-amber-400" />
          CUSTOM ROSTER & PLAYER EDITOR ({players.length} PLAYERS)
        </button>
        </div>

        {/* Achievements Section (Right 6 Columns on Browser) */}
        <div className="lg:col-span-6 bg-[#0f172a] border border-slate-800 rounded-3xl p-5">
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="font-display font-black text-sm text-white uppercase flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-amber-400" />
              ACHIEVEMENTS
            </h3>
            <span className="text-xs font-mono font-bold text-amber-400">
              {unlockedCount} OF {achievements.length}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-3">
            <div
              style={{ width: `${(unlockedCount / Math.max(1, achievements.length)) * 100}%` }}
              className="h-full bg-amber-400 rounded-full"
            />
          </div>

          {/* Achievements Feed */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[600px] overflow-y-auto pr-1">
            {achievements.map(ach => (
              <div
                key={ach.id}
                className={`p-2.5 rounded-2xl border flex items-center justify-between text-xs transition-all ${
                  ach.unlocked
                    ? 'bg-slate-900/90 border-slate-800'
                    : 'bg-slate-950/50 border-slate-900 opacity-60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    ach.unlocked ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {ach.unlocked ? <Trophy className="w-4 h-4" /> : <Lock className="w-3.5 h-3.5" />}
                  </div>
                  <div>
                    <span className={`font-bold block ${ach.unlocked ? 'text-white' : 'text-slate-400'}`}>
                      {ach.title}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {ach.description}
                    </span>
                  </div>
                </div>

                {ach.unlocked && (
                  <span className="text-[9px] font-mono text-amber-400 font-bold whitespace-nowrap ml-2">
                    {ach.unlockedDate || 'UNLOCKED'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Full Searchable 265-Player Roster & Attribute Editor Modal */}
      {showRosterEditor && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="font-black font-display text-sm text-white uppercase tracking-wide">
                  CUSTOM ROSTER & ATTRIBUTE EDITOR
                </h3>
                <span className="text-[10px] font-mono text-slate-400">
                  Showing {filteredEditorPlayers.length} of {players.length} Players
                </span>
              </div>
              <button
                onClick={() => {
                  sound.playTap();
                  setShowRosterEditor(false);
                }}
                className="text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded-xl bg-slate-800 font-mono font-bold"
              >
                ✕ Close
              </button>
            </div>

            {editorSaveToast && (
              <div className="mt-2 p-2 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs font-mono text-center">
                {editorSaveToast}
              </div>
            )}

            {/* Search & Franchise Filter Bar */}
            <div className="py-2.5 space-y-2 border-b border-slate-800/80">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search any of 265 players by name, country or role..."
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400 shrink-0">
                  <Filter className="w-3 h-3 text-amber-400" />
                  <span>FRANCHISE:</span>
                </div>
                <select
                  value={selectedTeamFilter}
                  onChange={(e) => setSelectedTeamFilter(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-400"
                >
                  <option value="ALL">All Teams & International ({players.length})</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.logoEmoji} {t.name} ({t.shortName})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Player List */}
            <div className="overflow-y-auto py-2 flex flex-col gap-2 flex-1 pr-0.5">
              {filteredEditorPlayers.map(p => (
                <div key={p.id} className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs">
                  {selectedPlayerForEdit === p.id ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-amber-400 font-bold uppercase">
                          Editing Player Attributes
                        </span>
                        <button
                          onClick={() => setSelectedPlayerForEdit(null)}
                          className="text-[10px] font-mono text-slate-400 hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className="text-[9px] font-mono text-slate-400 block mb-0.5 uppercase">Name</label>
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-mono text-slate-400 block mb-0.5 uppercase">Age</label>
                          <input
                            type="number"
                            min={15}
                            max={48}
                            value={editForm.age}
                            onChange={(e) => setEditForm(prev => ({ ...prev, age: Number(e.target.value) }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[9px] font-mono text-slate-400 block mb-0.5 uppercase">Role</label>
                        <select
                          value={editForm.role}
                          onChange={(e) => setEditForm(prev => ({ ...prev, role: e.target.value as PlayerRole }))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs"
                        >
                          <option value="Top-order">Top-order</option>
                          <option value="Middle-order">Middle-order</option>
                          <option value="Wk-bat">Wk-bat</option>
                          <option value="All-rounder">All-rounder</option>
                          <option value="Pace">Pace</option>
                          <option value="Spin">Spin</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5">
                        <div>
                          <label className="text-[9px] font-mono text-amber-400 block mb-0.5">BAT</label>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={editForm.bat}
                            onChange={(e) => setEditForm(prev => ({ ...prev, bat: Number(e.target.value) }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs font-mono text-center"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-mono text-amber-400 block mb-0.5">POW</label>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={editForm.pow}
                            onChange={(e) => setEditForm(prev => ({ ...prev, pow: Number(e.target.value) }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs font-mono text-center"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-mono text-cyan-400 block mb-0.5">BOWL</label>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={editForm.bowl}
                            onChange={(e) => setEditForm(prev => ({ ...prev, bowl: Number(e.target.value) }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs font-mono text-center"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-mono text-cyan-400 block mb-0.5">CTRL</label>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={editForm.ctrl}
                            onChange={(e) => setEditForm(prev => ({ ...prev, ctrl: Number(e.target.value) }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs font-mono text-center"
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => handleSavePlayerAttributes(p.id)}
                        className="w-full py-2 bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase rounded-xl"
                      >
                        SAVE ATTRIBUTES
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white truncate">{p.name}</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] font-mono text-amber-400 font-bold">
                            {getTeamBadgeLabel(p.clubId)}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                          {p.role} · Age {p.age} · {p.country} · BAT {p.ratings.bat} / BWL {p.ratings.bowl}
                        </span>
                      </div>
                      <button
                        onClick={() => handleStartEditPlayer(p.id)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-bold shrink-0"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
