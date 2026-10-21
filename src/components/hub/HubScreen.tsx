import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Mail, Calendar as CalendarIcon, Menu, Dumbbell, Moon, Cloud, Play, FastForward,
  PlayCircle, Search, Binoculars, Trophy, Database, Clock, MapPin, Globe, BookOpen,
  Shield, Sparkles
} from 'lucide-react';
import { useGame, TrainingTraineeGain } from '../../context/GameContext';
import { sound } from '../../utils/soundEffects';
import { MenuDrawerModal } from './MenuDrawerModal';
import { InboxModal } from './InboxModal';
import { SeasonScheduleModal } from './SeasonScheduleModal';
import { OpenerSelectionModal } from '../match/OpenerSelectionModal';
import { ScoutingModal } from '../scouting/ScoutingModal';
import { RetentionModal } from '../dynasty/RetentionModal';
import { BoardReviewModal } from '../dynasty/BoardReviewModal';
import { NextSeasonSetupModal } from '../dynasty/NextSeasonSetupModal';
import { SeasonTransitionModal } from '../dynasty/SeasonTransitionModal';
import { TradeWindowModal } from '../dynasty/TradeWindowModal';
import { MiniAuctionReleasesModal } from '../dynasty/MiniAuctionReleasesModal';
import { AuctionHallScreen } from '../auction/AuctionHallScreen';
import { DataPortabilityModal } from '../data/DataPortabilityModal';
import { TeamLogo } from '../common/TeamLogo';
import { MatchAnalysisModal } from '../match/MatchAnalysisModal';
import { TacticalCommandSuiteModal } from './TacticalCommandSuiteModal';
import { MatchLiveState } from '../../types/cricket';

export const HubScreen: React.FC = () => {
  const {
    userTeam,
    teams,
    leagues,
    currentLeagueId,
    startMatch,
    startInternationalMatch,
    simEntireMatch,
    players,
    advanceCalendarDay,
    setCalendarDateIndex,
    homePitch,
    setHomePitch,
    simTokens,
    setSimTokens,
    coachProfile,
    nations,
    setActiveTab,
    squadStamina,
    setSquadStamina,
    inboxMessages,
    trainSquad,
    claimDoubleTrainingXp,
    selectOpeners,
    createFranchiseMatchState,
    startNewSeason,
    boostTeamMorale
  } = useGame();

  const currentLeague = leagues.find(l => l.id === currentLeagueId) || leagues[0];
  const calendarDays = currentLeague.calendarDates || [];
  const presentDayIndex = Math.min(
    Math.max(0, currentLeague.currentDateIndex || 0),
    Math.max(0, calendarDays.length - 1)
  );

  const [viewedDayIndex, setViewedDayIndex] = useState<number>(presentDayIndex);
  const [autoSimOnAdvance, setAutoSimOnAdvance] = useState<boolean>(false);

  // Sync viewedDayIndex when presentDayIndex changes
  useEffect(() => {
    setViewedDayIndex(presentDayIndex);
  }, [presentDayIndex]);

  const isViewingPresent = viewedDayIndex === presentDayIndex;
  const selectedDayIndex = Math.min(
    Math.max(0, viewedDayIndex),
    Math.max(0, calendarDays.length - 1)
  );

  const activeDay = calendarDays[selectedDayIndex] || {
    id: 'd_fallback',
    dateStr: '2026-04-26',
    dayOfWeek: 'SUN',
    dayNumber: 26,
    month: 'Apr',
    type: 'training' as const,
    title: 'Squad Training',
    isHome: true
  };

  const ribbonRef = useRef<HTMLDivElement>(null);

  const [trainingCompleted, setTrainingCompleted] = useState(false);
  const [dayRested, setDayRested] = useState(false);
  const [selectedFocus, setSelectedFocus] = useState<'Batting' | 'Bowling' | 'Fielding' | 'Fitness' | 'Mental'>('Bowling');
  const [selectedIntensity, setSelectedIntensity] = useState<'LIGHT' | 'STANDARD' | 'HARD'>('HARD');
  const [sessionTrainees, setSessionTrainees] = useState<TrainingTraineeGain[]>([]);
  const [trainingSummaryMsg, setTrainingSummaryMsg] = useState<string>('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isOpenersModalOpen, setIsOpenersModalOpen] = useState(false);
  const [isScoutingOpen, setIsScoutingOpen] = useState(false);
  const [isRetentionOpen, setIsRetentionOpen] = useState(false);
  const [isBoardReviewOpen, setIsBoardReviewOpen] = useState(false);
  const [isNextSeasonSetupOpen, setIsNextSeasonSetupOpen] = useState(false);
  const [isSeasonTransitionOpen, setIsSeasonTransitionOpen] = useState(false);
  const [isTradeWindowOpen, setIsTradeWindowOpen] = useState(false);
  const [isReleasesModalOpen, setIsReleasesModalOpen] = useState(false);
  const [isAuctionHallOpen, setIsAuctionHallOpen] = useState(false);
  const [simToSeasonEndReady, setSimToSeasonEndReady] = useState(false);
  const [postSeasonPurseCr, setPostSeasonPurseCr] = useState(20.85);
  const [releasedPlayerNames, setReleasedPlayerNames] = useState<string[]>([
    'Pandey', 'U. Malik', 'Saurabh', 'Ramandeep', 'Ranjan'
  ]);
  const [isDataPortabilityOpen, setIsDataPortabilityOpen] = useState(false);
  const [selectedMatchFormat, setSelectedMatchFormat] = useState<'T20' | '100BALL' | 'TEST'>('T20');
  const [scheduleFilter, setScheduleFilter] = useState<'all' | 'my_team' | 'other_teams' | 'intl_tours'>('all');
  const [doubleXpClaimed, setDoubleXpClaimed] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedScorecardMatch, setSelectedScorecardMatch] = useState<MatchLiveState | null>(null);
  const [isTacticalSuiteOpen, setIsTacticalSuiteOpen] = useState(false);
  const [tacticalSuiteTab, setTacticalSuiteTab] = useState<'director' | 'field' | 'matchups' | 'simulator' | 'infrastructure'>('director');
  const [pendingNextClubId, setPendingNextClubId] = useState<string>(userTeam.id);
  const [pendingNextCountryId, setPendingNextCountryId] = useState<string | null>(null);

  const presentDay = calendarDays[presentDayIndex] || activeDay;

  const isPresentDayCompleted = useMemo(() => {
    if (!presentDay) return true;
    if (presentDay.type === 'training') {
      return trainingCompleted || dayRested;
    }
    if (presentDay.type === 'match' || presentDay.type === 'international') {
      return Boolean(presentDay.matchFixture?.completed || autoSimOnAdvance);
    }
    return true;
  }, [presentDay, trainingCompleted, dayRested, autoSimOnAdvance]);

  // Scroll active day button into view
  useEffect(() => {
    const container = ribbonRef.current;
    if (!container) return;
    const activeBtn = container.querySelector(`[data-day-idx="${selectedDayIndex}"]`) as HTMLElement | null;
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [selectedDayIndex]);

  const userTeamPlayers = useMemo(
    () => players.filter(p => p.clubId === userTeam.id),
    [players, userTeam.id]
  );

  const unresolvedInboxCount = useMemo(
    () => inboxMessages.filter(m => !m.resolved).length,
    [inboxMessages]
  );

  // Dynamically resolve scheduled opponent from activeDay or next upcoming match day
  const opponentTeam = useMemo(() => {
    const allLeagueTeams = [...teams, ...(currentLeague.teams || [])];
    if (activeDay.opponentTeamId) {
      const scheduled = allLeagueTeams.find(t => t.id === activeDay.opponentTeamId && t.id !== userTeam.id);
      if (scheduled) return scheduled;
    }
    if (activeDay.matchFixture) {
      const oppId = activeDay.matchFixture.homeTeamId === userTeam.id
        ? activeDay.matchFixture.awayTeamId
        : activeDay.matchFixture.homeTeamId;
      const fromFixture = allLeagueTeams.find(t => t.id === oppId);
      if (fromFixture) return fromFixture;
    }
    for (let i = selectedDayIndex; i < calendarDays.length; i++) {
      const d = calendarDays[i];
      if (d?.opponentTeamId) {
        const nextOpp = allLeagueTeams.find(t => t.id === d.opponentTeamId && t.id !== userTeam.id);
        if (nextOpp) return nextOpp;
      }
    }
    return teams.find(t => t.id !== userTeam.id) || teams[1];
  }, [activeDay, calendarDays, selectedDayIndex, teams, currentLeague.teams, userTeam.id]);

  // Compute days until next match & whether next match is Home or Away
  const nextMatchMeta = useMemo(() => {
    for (let i = selectedDayIndex; i < calendarDays.length; i++) {
      const d = calendarDays[i];
      if (d?.type === 'match') {
        const daysAway = Math.max(1, i - selectedDayIndex);
        return {
          daysAway,
          isHome: d.isHome !== false
        };
      }
    }
    return { daysAway: 1, isHome: true };
  }, [calendarDays, selectedDayIndex]);

  const isCurrentMatchHome = activeDay.isHome !== false;
  const activeMatchPitchBadge = useMemo(() => {
    if (isCurrentMatchHome) return homePitch.toUpperCase();
    if (opponentTeam.id === 'team_che' || opponentTeam.id === 'team_lko') return 'DRY TURNER';
    if (opponentTeam.id === 'team_blr' || opponentTeam.id === 'team_mum' || opponentTeam.id === 'team_hyd') return 'FLAT TRACK';
    if (opponentTeam.id === 'team_pun') return 'GREEN SEAMER';
    return 'NATURAL';
  }, [isCurrentMatchHome, homePitch, opponentTeam.id]);

  const playersToWatch = useMemo(() => {
    const userWatch = players.filter(p => p.clubId === userTeam.id).slice(0, 3).map(p => ({
      name: p.name.split(' ').pop() || p.name,
      fullName: p.name,
      overseas: p.isOverseas,
      team: userTeam.shortName,
      badge: p.isCaptain || p.id === userTeam.captainId ? '★ Captain' : `#${p.jerseyNumber || 10} Star`,
      role: p.role,
      stat: p.role === 'Pace' || p.role === 'Spin' ? `${p.ratings.bowl} Bowler` : `${p.ratings.bat} Batter`,
      form: p.form,
      formColor: p.form >= 80 ? 'emerald' : 'amber'
    }));

    const oppPool = players.filter(p => p.clubId === opponentTeam.id);
    const finalOppPool = oppPool.length >= 3 ? oppPool.slice(0, 3) : (opponentTeam.squad || []).slice(0, 3);
    const oppWatch = finalOppPool.map(p => ({
      name: p.name.split(' ').pop() || p.name,
      fullName: p.name,
      overseas: p.isOverseas,
      team: opponentTeam.shortName,
      badge: p.isCaptain || p.id === opponentTeam.captainId ? '★ Captain' : `#${p.jerseyNumber || 18} Star`,
      role: p.role,
      stat: p.role === 'Pace' || p.role === 'Spin' ? `${p.ratings.bowl} Bowler` : `${p.ratings.bat} Batter`,
      form: p.form,
      formColor: p.form >= 80 ? 'emerald' : 'amber'
    }));

    return [...userWatch, ...oppWatch];
  }, [players, userTeam, opponentTeam]);

  const showToast = (msg: string) => {
    sound.playTap();
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSimTraining = () => {
    const res = trainSquad(selectedFocus, selectedIntensity);
    setSessionTrainees(res.xpGains);
    setTrainingSummaryMsg(res.message);
    setTrainingCompleted(true);
    setDoubleXpClaimed(false);
    showToast(res.message);
  };

  const handleRestToday = () => {
    sound.playTap();
    setDayRested(true);
    setSquadStamina(99);
    showToast('Squad rested today! Stamina recovered to 99%. Option to Advance Day enabled!');
  };

  const handleDoubleXp = () => {
    if (doubleXpClaimed) return;
    sound.playCrowdCheer(0.6);
    const top3Ids = sessionTrainees.slice(0, 3).map(t => t.playerId);
    claimDoubleTrainingXp(selectedFocus, top3Ids);
    setDoubleXpClaimed(true);
    const topNames = sessionTrainees.slice(0, 3).map(t => t.name.split(' ').pop() || t.name).join(', ');
    showToast(`2x Training XP claimed! +1 bonus ${selectedFocus} attribute to ${topNames}!`);
  };

  const handleAdvanceDay = () => {
    sound.playTap();
    if (!isPresentDayCompleted) return;
    if (activeDay.type === 'match' && autoSimOnAdvance && !activeDay.matchFixture?.completed) {
      startMatch(opponentTeam.id, selectedMatchFormat, !isCurrentMatchHome, activeDay.matchFixture?.id);
      simEntireMatch();
    }
    advanceCalendarDay();
    setTrainingCompleted(false);
    setDayRested(false);
    setDoubleXpClaimed(false);
  };

  const handleQuickSimMatch = () => {
    sound.playCrowdCheer(0.6);
    startMatch(opponentTeam.id, selectedMatchFormat, !isCurrentMatchHome, activeDay.matchFixture?.id);
    setTimeout(() => simEntireMatch(), 200);
  };

  const matchCompletedSummary = activeDay.matchFixture?.completed ? activeDay.matchFixture.resultSummary : null;

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col justify-between max-w-7xl mx-auto w-full pb-24 select-none">
      {/* Top Header Bar */}
      <div className="px-6 pt-3.5 pb-2.5 bg-[#0c121e] border-b border-slate-800/80 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2.5">
            <TeamLogo
              teamId={userTeam.id}
              shortName={userTeam.shortName}
              name={userTeam.name}
              size={42}
              className="rounded-2xl shadow-md border border-slate-700/80"
            />
            <div>
              <h1 className="text-lg font-black text-white font-display tracking-tight leading-none uppercase">
                {userTeam.name}
              </h1>
              <span className="text-[11px] text-slate-400 font-mono">
                {activeDay.month} 2026 · {currentLeague.name}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Mail / Inbox Button with Unread Badge */}
            <button
              onClick={() => { sound.playTap(); setIsInboxOpen(true); }}
              className="relative p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all"
              title="Open Club Inbox"
            >
              <Mail className="w-5 h-5" />
              {unresolvedInboxCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-amber-400 text-black text-[9px] font-mono font-black flex items-center justify-center">
                  {unresolvedInboxCount}
                </span>
              )}
            </button>
            {/* Season Fixtures & Results Calendar Button */}
            <button
              onClick={() => { sound.playTap(); setIsScheduleModalOpen(true); }}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all"
              title="Season Schedule & Results"
            >
              <CalendarIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => { sound.playTap(); setIsMenuOpen(true); }}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all"
              title="Club Menu & Pitch Curator"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Full Season & International Date Ribbon Carousel */}
        <div ref={ribbonRef} className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
          {calendarDays.map((d, idx) => {
            const isToday = idx === presentDayIndex;
            const isSelected = idx === selectedDayIndex;
            const isUserMatch = d.type === 'match' || (!!d.matchFixture && d.type !== 'international');
            const isIntlDay = d.type === 'international' || (d.internationalMatches && d.internationalMatches.length > 0);
            const hasOtherMatches = d.otherMatches && d.otherMatches.length > 0;
            const isDoneMatch = !!d.matchFixture?.completed;
            return (
              <button
                key={d.id || idx}
                data-day-idx={idx}
                onClick={() => {
                  sound.playTap();
                  setViewedDayIndex(idx);
                  setTrainingCompleted(false);
                  setDoubleXpClaimed(false);
                }}
                className={`min-w-[52px] py-1.5 px-1 rounded-2xl flex flex-col items-center justify-center transition-all ${
                  isToday
                    ? 'bg-[#eab308] text-black font-black shadow-md shadow-amber-500/20 ring-1 ring-amber-300'
                    : isSelected
                    ? 'bg-slate-800 text-amber-300 font-bold border-2 border-amber-400'
                    : d.type === 'international'
                    ? 'bg-[#0e1b2e] text-cyan-300 hover:text-white border border-cyan-500/30'
                    : 'bg-[#101726] text-slate-400 hover:text-slate-200 border border-slate-800/80'
                }`}
              >
                <span className="text-[8px] font-mono uppercase tracking-wider block opacity-85">
                  {d.dayOfWeek} · {d.month.toUpperCase()}
                </span>
                <span className="text-sm font-mono-nums font-bold leading-none mt-0.5">
                  {d.dayNumber}
                </span>
                <div className="mt-1 flex items-center justify-center gap-0.5">
                  {isUserMatch && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isDoneMatch
                          ? isSelected ? 'bg-emerald-900' : 'bg-emerald-400'
                          : isSelected ? 'bg-purple-900' : 'bg-purple-500'
                      }`}
                      title={`${userTeam.shortName} Match`}
                    />
                  )}
                  {hasOtherMatches && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-amber-900' : 'bg-amber-400/80'
                      }`}
                      title="Other League Matches"
                    />
                  )}
                  {isIntlDay && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-cyan-950' : 'bg-cyan-400'
                      }`}
                      title="International Tour Match"
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {toastMessage && (
        <div className="mx-4 mt-2 p-2.5 bg-slate-900 border border-amber-500/40 rounded-xl text-amber-300 text-xs text-center font-mono animate-in fade-in">
          {toastMessage}
        </div>
      )}

      {!isViewingPresent && (
        <div className="mx-4 mt-2.5 px-1 py-1 text-slate-400 text-xs flex items-center gap-2">
          <CalendarIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span>
            Viewing {activeDay.dayOfWeek.charAt(0).toUpperCase() + activeDay.dayOfWeek.slice(1).toLowerCase()} · {activeDay.dayNumber} {activeDay.month} (tap today&apos;s date to return).
          </span>
        </div>
      )}

      {/* Main Content Card Container (Browser 12-Column Grid) */}
      <div className="flex-1 px-6 py-4 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 flex flex-col space-y-4">
        {/* End of Season Review Card if completed or ready */}
        {simToSeasonEndReady && (
          <div className="bg-[#101726]/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between text-[11px] font-mono mb-2">
              <span className="flex items-center gap-1.5 text-amber-400 font-bold tracking-wider uppercase">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                BOARD REVIEW
              </span>
              <span className="text-slate-400 uppercase tracking-widest font-semibold">
                COMPLETE
              </span>
            </div>

            <div className="flex items-start gap-3.5 mt-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-white tracking-wide">
                  End-of-season review
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  You've seen the verdict. Continue when ready.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* CASE 1: MATCH DAY CARD */}
        {/* ======================================================== */}
        {(activeDay.type === 'match' || (!activeDay.type && !!activeDay.matchFixture)) && (
          <div className="bg-gradient-to-b from-[#241334] via-[#111726] to-[#0f172a] border border-purple-500/30 rounded-3xl p-4 shadow-xl">
            {/* Match day header */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-300 font-bold flex items-center gap-1.5">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                </span>
                MATCH DAY · {isCurrentMatchHome ? 'HOME' : 'AWAY'}
              </span>
              <span className="text-[10px] font-mono text-cyan-300 bg-slate-900/90 border border-slate-700/60 px-2 py-0.5 rounded flex items-center gap-1">
                <Cloud className="w-3 h-3 text-cyan-300" /> {activeMatchPitchBadge}
              </span>
            </div>

            {/* Matchup Encounter Banner */}
            <div className="flex items-center justify-between py-3 border-y border-slate-800/80 my-1">
              <div className="flex items-center gap-2.5">
                <TeamLogo
                  teamId={userTeam.id}
                  shortName={userTeam.shortName}
                  name={userTeam.name}
                  size={42}
                  className="rounded-2xl shadow-md border border-slate-700/60"
                />
                <div>
                  <span className="font-display font-black text-base text-white block leading-none uppercase">
                    {userTeam.shortName}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                    <span className={isCurrentMatchHome ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                      {isCurrentMatchHome ? 'HOME' : 'AWAY'}
                    </span>{' '}
                    | {userTeam.city}
                  </span>
                </div>
              </div>

              <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-900 px-2.5 py-1 rounded-full border border-slate-800">
                VS
              </span>

              <div className="flex items-center gap-2.5 text-right">
                <div>
                  <span className="font-display font-black text-base text-white block leading-none uppercase">
                    {opponentTeam.shortName}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                    <span className={!isCurrentMatchHome ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                      {!isCurrentMatchHome ? 'HOME' : 'AWAY'}
                    </span>{' '}
                    | {opponentTeam.city}
                  </span>
                </div>
                <TeamLogo
                  teamId={opponentTeam.id}
                  shortName={opponentTeam.shortName}
                  name={opponentTeam.name}
                  size={42}
                  className="rounded-2xl shadow-md border border-slate-700/60"
                />
              </div>
            </div>

            <div className="text-center my-2 text-[11px] text-slate-400 font-mono flex items-center justify-center gap-1">
              <span>📍</span> {isCurrentMatchHome ? userTeam.city : opponentTeam.city} · 19:30 local · Pitch: {activeMatchPitchBadge}
            </div>

            {matchCompletedSummary ? (
              /* COMPLETED MATCH VIEW (Video Frames 0:09, 0:38-0:43) */
              <div className="mt-3 space-y-3">
                {/* Score Summary & Quick Action Buttons */}
                <div className="p-3 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-center">
                  <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase block tracking-wider">
                    🏆 FIXTURE RESULT
                  </span>
                  <span className="text-xs font-black text-white block mt-0.5">{matchCompletedSummary}</span>

                  <div className="grid grid-cols-2 gap-2 mt-2.5">
                    <button
                      type="button"
                      onClick={() => { sound.playTap(); setSquadStamina(99); showToast('⚡ Squad stamina recovered to 99% after fixture!'); }}
                      className="py-2 px-3 rounded-xl bg-slate-900 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-bold flex items-center justify-center gap-1.5 hover:bg-slate-800 active:scale-95 transition-all"
                    >
                      <span>RECOVERY</span>
                      <span className="text-amber-400">⚡</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        boostTeamMorale(userTeam.id, 4);
                        showToast('💬 Team Talk held: All squad players gained +4 Morale & +2 Form!');
                      }}
                      className="py-2 px-3 rounded-xl bg-slate-900 border border-purple-500/30 text-purple-300 text-xs font-mono font-bold flex items-center justify-center gap-1.5 hover:bg-slate-800 active:scale-95 transition-all"
                    >
                      <span>TEAM TALK</span>
                      <span className="text-cyan-300">💬</span>
                    </button>
                  </div>
                </div>

                {/* Scorecard Breakdown Card - Tapping opens full scorecard modal */}
                {(() => {
                  const savedMatch = activeDay.matchFixture?.completedMatchState;
                  const inn1 = savedMatch?.innings1;
                  const inn2 = savedMatch?.innings2;

                  const inn1TeamName = inn1
                    ? (inn1.battingTeamId === userTeam.id ? userTeam.name : opponentTeam.name)
                    : opponentTeam.name;
                  const b1Count = inn1?.ballsCompleted ?? inn1?.balls ?? 120;
                  const inn1ScoreStr = inn1
                    ? `${inn1.runs}/${inn1.wickets} (${Math.floor(b1Count / 6)}.${b1Count % 6})`
                    : '132/7 (20.0)';
                  const inn1TopBatters = inn1
                    ? [...inn1.batters].sort((a, b) => b.runs - a.runs).slice(0, 2)
                    : null;
                  const inn1TopBowler = inn1
                    ? [...inn1.bowlers].sort((a, b) => b.wickets - a.wickets || (a.runsConceded ?? a.runs) - (b.runsConceded ?? b.runs))[0]
                    : null;

                  const inn2TeamName = inn2
                    ? (inn2.battingTeamId === userTeam.id ? userTeam.name : opponentTeam.name)
                    : userTeam.name;
                  const b2Count = inn2?.ballsCompleted ?? inn2?.balls ?? 112;
                  const inn2ScoreStr = inn2
                    ? `${inn2.runs}/${inn2.wickets} (${Math.floor(b2Count / 6)}.${b2Count % 6})`
                    : '135/4 (18.4)';
                  const inn2TopBatters = inn2
                    ? [...inn2.batters].sort((a, b) => b.runs - a.runs).slice(0, 2)
                    : null;
                  const inn2TopBowler = inn2
                    ? [...inn2.bowlers].sort((a, b) => b.wickets - a.wickets || (a.runsConceded ?? a.runs) - (b.runsConceded ?? b.runs))[0]
                    : null;

                  return (
                    <div
                      onClick={() => {
                        sound.playTap();
                        if (savedMatch) {
                          setSelectedScorecardMatch(savedMatch);
                        } else {
                          const state = createFranchiseMatchState(userTeam, opponentTeam, currentLeague.id, selectedMatchFormat);
                          setSelectedScorecardMatch(state);
                        }
                      }}
                      className="p-3.5 rounded-2xl bg-[#0c1322] border border-slate-800 hover:border-amber-500/50 transition-all cursor-pointer space-y-2.5 shadow-lg group"
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 font-bold uppercase pb-2 border-b border-slate-800">
                        <span>SCORECARD SUMMARY</span>
                        <span className="text-amber-400 group-hover:underline flex items-center gap-1 font-bold">
                          <span>FULL SCORECARD</span>
                          <span>▶</span>
                        </span>
                      </div>

                      {/* 1st Innings Summary */}
                      <div>
                        <div className="text-xs font-bold text-amber-300 font-mono flex items-center justify-between mb-1">
                          <span>{inn1TeamName.toUpperCase()}</span>
                          <span className="text-white font-mono-nums">{inn1ScoreStr}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-900/80 p-2 rounded-xl border border-slate-800/80">
                          <div>
                            <span className="text-[9px] text-slate-400 block uppercase">Batting</span>
                            {inn1TopBatters && inn1TopBatters.length > 0 ? (
                              inn1TopBatters.map((b, i) => (
                                <div key={b.playerId} className={i === 0 ? 'text-white font-bold' : 'text-slate-300'}>
                                  {b.name.split(' ').pop()}{!b.isOut ? '*' : ''} {b.runs}({b.balls})
                                </div>
                              ))
                            ) : (
                              <>
                                <div className="text-white font-bold">Jaiswal 42(47)</div>
                                <div className="text-slate-300">Parag 29(25)</div>
                              </>
                            )}
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-400 block uppercase">Bowling</span>
                            {inn1TopBowler ? (
                              <div className="text-emerald-400 font-bold">
                                {inn1TopBowler.name.split(' ').pop()} {inn1TopBowler.overs}-{inn1TopBowler.maidens}-{inn1TopBowler.runsConceded}-{inn1TopBowler.wickets}
                              </div>
                            ) : (
                              <div className="text-emerald-400 font-bold">Sandeep 4-1-28-2</div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 2nd Innings Summary */}
                      <div>
                        <div className="text-xs font-bold text-cyan-300 font-mono flex items-center justify-between mb-1">
                          <span>{inn2TeamName.toUpperCase()}</span>
                          <span className="text-white font-mono-nums">{inn2ScoreStr}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-900/80 p-2 rounded-xl border border-slate-800/80">
                          <div>
                            <span className="text-[9px] text-slate-400 block uppercase">Batting</span>
                            {inn2TopBatters && inn2TopBatters.length > 0 ? (
                              inn2TopBatters.map((b, i) => (
                                <div key={b.playerId} className={i === 0 ? 'text-white font-bold' : 'text-slate-300'}>
                                  {b.name.split(' ').pop()}{!b.isOut ? '*' : ''} {b.runs}({b.balls})
                                </div>
                              ))
                            ) : (
                              <>
                                <div className="text-white font-bold">Allen 61(39)</div>
                                <div className="text-slate-300">Rahane* 50(35)</div>
                              </>
                            )}
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-400 block uppercase">Bowling</span>
                            {inn2TopBowler ? (
                              <div className="text-emerald-400 font-bold">
                                {inn2TopBowler.name.split(' ').pop()} {inn2TopBowler.overs}-{inn2TopBowler.maidens}-{inn2TopBowler.runsConceded}-{inn2TopBowler.wickets}
                              </div>
                            ) : (
                              <div className="text-emerald-400 font-bold">Green 4-0-18-2</div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-center pt-1 text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">
                        CLICK TO VIEW FULL MATCH SCORECARD &amp; STATS ▼
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              /* UNPLAYED MATCH DAY VIEW */
              <>
                {/* PLAYERS TO WATCH */}
                <div className="mt-3 pt-3 border-t border-slate-800/80">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                      PLAYERS TO WATCH
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setTacticalSuiteTab('director');
                          setIsTacticalSuiteOpen(true);
                        }}
                        className="px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-mono font-bold flex items-center gap-1 hover:bg-amber-950/40 active:scale-95 transition-all"
                      >
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        DIRECTOR
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          showToast(
                            `Scout report: ${opponentTeam.shortName} (${opponentTeam.city}) key threats highlighted. Pitch is ${activeMatchPitchBadge}.`
                          )
                        }
                        className="px-2 py-0.5 rounded-lg bg-slate-900 border border-cyan-500/30 text-cyan-300 text-[10px] font-mono font-bold flex items-center gap-1 hover:bg-cyan-950/40"
                      >
                        <Search className="w-3 h-3" />
                        SCOUT
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {playersToWatch.map((p, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-xl bg-slate-900/70 border border-slate-800/80 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white">{p.name}</span>
                            {p.overseas && <span className="text-[10px] text-cyan-400">✈</span>}
                            <span className="text-[10px] text-slate-400 font-mono">· {p.team}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
                            <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono text-[9px]">
                              {p.badge}
                            </span>
                            <span className="text-slate-400 font-mono">{p.role}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <span className="font-mono-nums font-bold text-slate-200">{p.stat}</span>
                          <div
                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-mono font-bold ${
                              p.formColor === 'emerald'
                                ? 'border-emerald-400 text-emerald-400 bg-emerald-950/40'
                                : 'border-amber-400 text-amber-400 bg-amber-950/40'
                            }`}
                          >
                            {p.form}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {!isViewingPresent && (
                  <div className="mt-3 p-2 rounded-xl bg-slate-900/90 border border-amber-500/30 text-center text-[10px] font-mono font-bold text-amber-300">
                    🔒 Viewing non-present date. Return to Today ({presentDay.dayOfWeek} {presentDay.dayNumber} {presentDay.month}) to play or simulate.
                  </div>
                )}

                {/* Advance: simulate result checkbox toggle */}
                <div className="mt-3.5 pt-2.5 border-t border-slate-800 flex items-center justify-center gap-2 text-xs font-mono text-slate-300">
                  <label className={`flex items-center gap-2 select-none ${!isViewingPresent ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      disabled={!isViewingPresent}
                      checked={autoSimOnAdvance}
                      onChange={e => {
                        sound.playTap();
                        setAutoSimOnAdvance(e.target.checked);
                      }}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-400 accent-amber-500"
                    />
                    <span className="font-bold text-slate-300">Advance: simulate result</span>
                  </label>
                </div>

                {/* CTAs: PLAY and SIMULATE */}
                <div className="grid grid-cols-2 gap-2.5 mt-3">
                  <button
                    type="button"
                    disabled={!isViewingPresent}
                    onClick={() => {
                      sound.playTap();
                      startMatch(opponentTeam.id, selectedMatchFormat, !isCurrentMatchHome, activeDay.matchFixture?.id);
                    }}
                    className={`py-3.5 font-black text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center gap-1.5 transition-all ${
                      !isViewingPresent
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                        : 'bg-[#eab308] hover:bg-amber-300 text-black shadow-lg shadow-amber-500/20 active:scale-95'
                    }`}
                  >
                    <Play className="w-4 h-4 fill-current" />
                    PLAY
                  </button>
                  <button
                    type="button"
                    disabled={!isViewingPresent}
                    onClick={handleQuickSimMatch}
                    className={`py-3.5 font-bold text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center gap-1.5 border transition-all ${
                      !isViewingPresent
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed border-slate-700'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700/80 active:scale-95'
                    }`}
                  >
                    <FastForward className="w-3.5 h-3.5 text-amber-400" />
                    Simulate ⚡ FREE (UNLIMITED)
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* CASE 2: TRAINING DAY */}
        {/* ======================================================== */}
        {activeDay.type === 'training' && (
          <div className="bg-gradient-to-b from-[#1e1530] via-[#131826] to-[#111622] border border-purple-500/30 rounded-3xl p-5 shadow-xl">
            {!isViewingPresent ? (
              /* Past / Non-present Day Replay Card (Video 00:00-00:02) */
              <div className="py-2 min-h-[240px] flex flex-col justify-start">
                <div className="flex items-start gap-3.5 mb-6">
                  <div className="w-11 h-11 rounded-2xl bg-[#271b3c] border border-purple-500/30 flex items-center justify-center text-[#f5b82e] shrink-0">
                    <Dumbbell className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-purple-400 block tracking-wider">
                      TRAINING DAY
                    </span>
                    <h2 className="text-base font-bold text-white leading-tight mt-0.5">
                      Prepare for {opponentTeam.city}
                    </h2>
                    <span className="text-xs text-slate-400">
                      {nextMatchMeta.isHome ? 'Home' : 'Away'} match today
                    </span>
                  </div>
                </div>

                {/* Stamina Meter */}
                <div className="mb-4">
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-slate-400 flex items-center gap-1 text-[11px] font-bold shrink-0">
                      <span className="text-[#f5b82e]">⚡</span> STAMINA
                    </span>
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#f5b82e] rounded-full transition-all duration-300"
                        style={{ width: `${squadStamina}%` }}
                      />
                    </div>
                    <span className="text-white font-bold text-xs shrink-0">{squadStamina}%</span>
                  </div>
                </div>

                <p className="text-xs text-slate-500 mt-1">
                  Replay: this day has already passed.
                </p>
              </div>
            ) : !trainingCompleted ? (
              /* View 1: Configure Training */
              <div>
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-2xl bg-amber-950/60 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                    <Dumbbell className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase font-bold text-amber-400 block tracking-wider">
                      TRAINING DAY
                    </span>
                    <h2 className="text-base font-black text-white leading-tight">
                      Prepare for {opponentTeam.city} ({opponentTeam.shortName})
                    </h2>
                    <span className="text-xs text-slate-400">
                      {nextMatchMeta.isHome ? 'Home' : 'Away'} match in {nextMatchMeta.daysAway} day{nextMatchMeta.daysAway === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>

                {/* Stamina Meter */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs mb-1 font-mono">
                    <span className="text-slate-400 flex items-center gap-1 text-[11px] font-bold">
                      ⚡ STAMINA
                    </span>
                    <span className="text-amber-400 font-bold">{squadStamina}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all duration-300"
                      style={{ width: `${squadStamina}%` }}
                    />
                  </div>
                </div>

                {/* FOCUS BUTTONS */}
                <div className="mb-4">
                  <span className="text-[10px] font-mono uppercase font-bold text-slate-400 block mb-2">
                    FOCUS
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(['Batting', 'Bowling', 'Fielding', 'Fitness', 'Mental'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => { sound.playTap(); setSelectedFocus(f); }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          selectedFocus === f
                            ? 'bg-amber-950/40 text-amber-400 border border-amber-500/80'
                            : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {/* INTENSITY OPTIONS */}
                <div className="mb-6">
                  <span className="text-[10px] font-mono uppercase font-bold text-slate-400 block mb-2">
                    INTENSITY
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: 'LIGHT', label: 'LIGHT', subtitle: '-2% STA · +1 STAT' },
                      { id: 'STANDARD', label: 'STANDARD', subtitle: '-5% STA · +2 STAT' },
                      { id: 'HARD', label: 'HARD', subtitle: '-8% STA · MAX XP' }
                    ] as const).map(int => (
                      <button
                        key={int.id}
                        onClick={() => { sound.playTap(); setSelectedIntensity(int.id); }}
                        className={`p-3 rounded-2xl flex flex-col items-center justify-center transition-all ${
                          selectedIntensity === int.id
                            ? 'bg-amber-950/30 border border-amber-500/80 text-amber-400'
                            : 'bg-slate-900/80 border border-slate-800 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        <span className="text-xs font-bold">{int.label}</span>
                        <span className="text-[9px] font-mono opacity-80 mt-0.5">{int.subtitle}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {!isViewingPresent && (
                  <div className="my-2 p-2 rounded-xl bg-slate-900/90 border border-amber-500/30 text-center text-[10px] font-mono font-bold text-amber-300">
                    🔒 Viewing non-present date. Return to Today ({presentDay.dayOfWeek} {presentDay.dayNumber} {presentDay.month}) to perform actions.
                  </div>
                )}

                {dayRested ? (
                  <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40 text-center space-y-1.5 my-2">
                    <div className="text-amber-400 font-black text-sm flex items-center justify-center gap-1.5 font-mono">
                      <Moon className="w-4 h-4" /> SQUAD RESTED TODAY
                    </div>
                    <p className="text-xs text-slate-300 font-mono">
                      Squad rested today. Stamina restored to {squadStamina}%. You can now advance to the next day!
                    </p>
                  </div>
                ) : (
                  /* Action CTAs: SIM TRAINING & REST */
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={!isViewingPresent}
                      onClick={handleSimTraining}
                      className={`py-3 font-black text-xs uppercase rounded-2xl flex items-center justify-center gap-1.5 transition-all ${
                        !isViewingPresent
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                          : 'bg-[#eab308] hover:bg-amber-300 text-black shadow-md active:scale-95'
                      }`}
                    >
                      <Dumbbell className="w-4 h-4 fill-current" />
                      SIM TRAINING
                    </button>
                    <button
                      type="button"
                      disabled={!isViewingPresent}
                      onClick={handleRestToday}
                      className={`py-3 font-bold text-xs uppercase rounded-2xl flex items-center justify-center gap-1.5 border transition-all ${
                        !isViewingPresent
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed border-slate-700'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-800 active:scale-95'
                      }`}
                    >
                      <Moon className="w-4 h-4 text-amber-400" />
                      REST
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* View 2: Real Squad Training Results */
              <div>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-start gap-2.5">
                    <div className="w-9 h-9 rounded-2xl bg-amber-950/60 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                      <Dumbbell className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[9px] font-mono uppercase font-bold text-amber-400 block tracking-wider">
                        TRAINING COMPLETE
                      </span>
                      <h2 className="text-base font-black text-white leading-tight">
                        {selectedFocus} session
                      </h2>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">
                    {selectedIntensity} · {selectedFocus.toUpperCase()}
                  </span>
                </div>

                <p className="text-xs text-emerald-400 mb-3 font-mono">
                  {trainingSummaryMsg || `XP banked & ${selectedFocus} attributes boosted across ${userTeam.shortName}.`}
                </p>

                {/* PROGRESS · ACTUAL USER TEAM PLAYERS SORTED BY XP GAINED */}
                <div className="mb-3">
                  <span className="text-[10px] font-mono uppercase font-bold text-slate-400 block mb-2">
                    PROGRESS · {selectedFocus.toUpperCase()} ({userTeam.shortName} SQUAD)
                  </span>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {sessionTrainees.map((item, idx) => {
                      const isTop3 = idx < 3;
                      const displayedXp = doubleXpClaimed ? item.xp * 2 : item.xp;
                      return (
                        <div key={item.playerId} className="flex items-center justify-between text-xs">
                          <div className="w-32 truncate flex items-center gap-1">
                            <span className="text-slate-200 font-semibold truncate">
                              {item.name.split(' ').pop() || item.name}
                            </span>
                            {doubleXpClaimed && isTop3 && (
                              <span className="text-[9px] font-mono font-black text-emerald-400 shrink-0">+1★</span>
                            )}
                          </div>
                          <div className="flex-1 mx-2.5 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                doubleXpClaimed && isTop3 ? 'bg-emerald-400' : 'bg-amber-400'
                              }`}
                              style={{ width: `${Math.min(100, displayedXp * 10)}%` }}
                            />
                          </div>
                          <span className="font-mono text-amber-400 text-[11px] font-bold w-10 text-right">
                            +{displayedXp} XP
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Stamina Meter */}
                <div className="mb-4 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between text-xs mb-1 font-mono">
                    <span className="text-slate-400 flex items-center gap-1 text-[11px] font-bold">
                      ⚡ STAMINA
                    </span>
                    <span className="text-amber-400 font-bold">{squadStamina}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full" style={{ width: `${squadStamina}%` }} />
                  </div>
                </div>

                {/* DOUBLE XP CLAIM BUTTON (FREE BY DEFAULT) */}
                <button
                  onClick={handleDoubleXp}
                  disabled={doubleXpClaimed}
                  className={`w-full py-3 rounded-2xl flex items-center justify-center gap-2 font-black text-xs uppercase tracking-wider transition-all ${
                    doubleXpClaimed
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                      : 'bg-[#10b981] hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/25 active:scale-95'
                  }`}
                >
                  <PlayCircle className="w-4 h-4 fill-current" />
                  {doubleXpClaimed ? 'DOUBLE XP & +1 TOP-3 BOOST CLAIMED' : 'CLAIM DOUBLE XP (+1 TOP-3 STAT)'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* CASE 3: RECOVERY DAY */}
        {/* ======================================================== */}
        {activeDay.type === 'rest' && (
          <div className="bg-[#121724] border border-slate-800/80 rounded-3xl p-5 shadow-xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-amber-950/40 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Moon className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase font-bold text-amber-400 block tracking-wider">
                  REST DAY
                </span>
                <h2 className="text-base font-black text-white leading-tight">
                  {activeDay.title || 'Recovery day'}
                </h2>
                <span className="text-xs text-slate-400">
                  Next fixture vs {opponentTeam.shortName} ({nextMatchMeta.isHome ? 'Home' : 'Away'}) in {nextMatchMeta.daysAway} days.
                </span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 font-mono mb-4">
              Squad rested. Stamina restored to {squadStamina}%. (Simulations are unlimited &amp; free in Dev mode).
            </div>

            {/* Stamina Meter */}
            <div className="mb-2">
              <div className="flex items-center justify-between text-xs mb-1 font-mono">
                <span className="text-slate-400 flex items-center gap-1 text-[11px] font-bold">
                  ⚡ STAMINA
                </span>
                <span className="text-amber-400 font-bold">{squadStamina}%</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full" style={{ width: `${squadStamina}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* CASE 4: INTERNATIONAL TOUR DAY (CRICBUZZ 2026 CALENDAR)  */}
        {/* ======================================================== */}
        {activeDay.type === 'international' && activeDay.matchFixture && (
          <div className="bg-gradient-to-b from-[#0d2238] via-[#10192b] to-[#0c1322] border border-cyan-500/40 rounded-3xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-300 font-bold flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                CRICBUZZ INTL TOUR · {activeDay.matchFixture.format || 'T20I'}
              </span>
              <span className="text-[10px] font-mono text-amber-300 bg-slate-900/90 border border-amber-500/30 px-2 py-0.5 rounded">
                {activeDay.dayOfWeek} {activeDay.dayNumber} {activeDay.month.toUpperCase()} 2026
              </span>
            </div>

            <div className="text-xs font-bold text-amber-400 font-mono mb-2">
              {activeDay.matchFixture.seriesName || 'Bilateral International Tour 2026'}
            </div>

            <div className="flex items-center justify-between py-3 border-y border-slate-800/80 my-1">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-slate-900 border border-cyan-500/30 flex items-center justify-center text-xl">
                  {activeDay.matchFixture.homeLogo || '🏏'}
                </div>
                <div>
                  <span className="font-display font-black text-base text-white block leading-none uppercase">
                    {activeDay.matchFixture.homeShortName || activeDay.matchFixture.homeTeamId}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                    HOST NATION · {activeDay.matchFixture.homeTeamId}
                  </span>
                </div>
              </div>

              <span className="text-[10px] font-mono font-bold text-cyan-300 bg-slate-900 px-2.5 py-1 rounded-full border border-cyan-500/30">
                VS
              </span>

              <div className="flex items-center gap-2.5 text-right">
                <div>
                  <span className="font-display font-black text-base text-white block leading-none uppercase">
                    {activeDay.matchFixture.awayShortName || activeDay.matchFixture.awayTeamId}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                    TOURING · {activeDay.matchFixture.awayTeamId}
                  </span>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-slate-900 border border-cyan-500/30 flex items-center justify-center text-xl">
                  {activeDay.matchFixture.awayLogo || '🏏'}
                </div>
              </div>
            </div>

            <div className="text-center my-2 text-[11px] text-slate-300 font-mono">
              📍 {activeDay.matchFixture.venue} · {activeDay.title}
            </div>

            {activeDay.matchFixture.completed && activeDay.matchFixture.resultSummary && (
              <div className="my-2 p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-center">
                <span className="text-xs font-bold text-emerald-300">{activeDay.matchFixture.resultSummary}</span>
              </div>
            )}

            {(() => {
              const coachedNat = nations.find(n => n.id === coachProfile.nationalTeamId);
              const coachedName = coachedNat ? coachedNat.name.toLowerCase() : '';
              const homeId = (activeDay.matchFixture?.homeTeamId || '').toLowerCase();
              const awayId = (activeDay.matchFixture?.awayTeamId || '').toLowerCase();
              const isAssociated = Boolean(coachedName && (homeId.includes(coachedName) || awayId.includes(coachedName)));

              if (!coachProfile.nationalTeamId) {
                return (
                  <div className="mt-3 p-3 rounded-2xl bg-slate-900/90 border border-rose-500/30 text-center flex flex-col gap-2">
                    <div className="flex items-center justify-center gap-1.5 text-rose-300 font-bold text-xs font-mono">
                      <span>🔒 UNPLAYABLE · NO NATIONAL TEAM ASSOCIATION</span>
                    </div>
                    <p className="text-[11px] text-slate-300 font-sans">
                      You are not associated with any international team. All international matches are unplayable until you sign a contract with a national cricket board.
                    </p>
                    <button
                      onClick={() => { sound.playTap(); setActiveTab('world'); }}
                      className="w-full py-2.5 px-3 bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase rounded-xl tracking-wider active:scale-98 transition-all"
                    >
                      Sign National Contract in World 📜
                    </button>
                  </div>
                );
              }

              if (!isAssociated) {
                return (
                  <div className="mt-3 p-3 rounded-2xl bg-slate-900/90 border border-slate-800 text-center flex flex-col gap-2">
                    <div className="flex items-center justify-center gap-1.5 text-amber-300 font-bold text-xs font-mono">
                      <span>🔒 UNPLAYABLE · NEUTRAL INTERNATIONAL FIXTURE</span>
                    </div>
                    <p className="text-[11px] text-slate-300 font-sans">
                      You are officially affiliated with <strong className="text-white">{coachedNat?.name}</strong>. You can only play cricket for {coachedNat?.name}. Neutral fixtures are unplayable for your team.
                    </p>
                    <div className="py-2 px-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-400 font-mono text-[10px] uppercase font-bold">
                      Fixture Locked ({activeDay.matchFixture?.homeTeamId} v {activeDay.matchFixture?.awayTeamId})
                    </div>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-2 gap-2.5 mt-3">
                  <button
                    disabled={!isViewingPresent}
                    onClick={() => {
                      sound.playTap();
                      startInternationalMatch(
                        activeDay.matchFixture?.homeTeamId || 'England',
                        activeDay.matchFixture?.awayTeamId || 'India',
                        activeDay.matchFixture?.venue || "Lord's, London",
                        activeDay.matchFixture?.format || 'T20'
                      );
                    }}
                    className={`py-3 font-black text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center gap-1.5 shadow-lg transition-all ${
                      !isViewingPresent
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                        : 'bg-[#eab308] hover:bg-amber-300 text-black active:scale-95'
                    }`}
                  >
                    <Play className="w-4 h-4 fill-current" />
                    PLAY INTL TOUR
                  </button>
                  <button
                    disabled={!isViewingPresent}
                    onClick={() => {
                      sound.playTap();
                      startInternationalMatch(
                        activeDay.matchFixture?.homeTeamId || 'England',
                        activeDay.matchFixture?.awayTeamId || 'India',
                        activeDay.matchFixture?.venue || "Lord's, London",
                        activeDay.matchFixture?.format || 'T20'
                      );
                      setTimeout(() => simEntireMatch(), 200);
                    }}
                    className={`py-3 font-bold text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center gap-1.5 border transition-all ${
                      !isViewingPresent
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed border-slate-700'
                        : 'bg-slate-900 hover:bg-slate-800 text-cyan-300 border-cyan-500/40 active:scale-95'
                    }`}
                  >
                    <FastForward className="w-3.5 h-3.5 text-cyan-400" />
                    SIM TOUR
                  </button>
                </div>
              );
            })()}
          </div>
        )}

        {/* BIG BOTTOM BUTTON: ADVANCE DAY OR GO TO PRESENT (Inside Left Column on Desktop) */}
        <div className="pt-1">
          {simToSeasonEndReady ? (
            <button
              onClick={() => {
                sound.playTap();
                setIsNextSeasonSetupOpen(true);
              }}
              className="w-full py-4 bg-[#eab308] hover:bg-amber-300 text-black font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 active:scale-98 transition-all animate-pulse"
            >
              <FastForward className="w-4 h-4 fill-current" />
              SIM TO SEASON END
            </button>
          ) : !isViewingPresent ? (
            <button
              onClick={() => {
                sound.playTap();
                setViewedDayIndex(presentDayIndex);
              }}
              className="w-full py-4 bg-[#f5b82e] hover:bg-amber-300 text-black font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 active:scale-98 transition-all"
            >
              <CalendarIcon className="w-4 h-4 text-black" />
              GO TO PRESENT
            </button>
          ) : !isPresentDayCompleted ? (
            <button
              disabled
              className="w-full py-4 bg-slate-800/90 text-slate-400 font-bold text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 border border-slate-700/80 cursor-not-allowed select-none opacity-80"
            >
              <Clock className="w-4 h-4 text-amber-400" />
              {activeDay.type === 'match'
                ? 'PLAY OR SIMULATE MATCH FIRST'
                : 'TRAIN OR REST SQUAD FIRST'}
            </button>
          ) : (
            <button
              onClick={handleAdvanceDay}
              className="w-full py-4 bg-[#eab308] hover:bg-amber-300 text-black font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 active:scale-98 transition-all animate-pulse"
            >
              <FastForward className="w-4 h-4 fill-current" />
              ADVANCE DAY ({activeDay.dayOfWeek} {activeDay.dayNumber} {activeDay.month}) ▶
            </button>
          )}
        </div>
        </div>

        {/* Right 5 Columns on Browser: Around the League, Franchise Suite & Live Table Snapshot */}
        <div className="lg:col-span-5 flex flex-col space-y-4">
        {/* ======================================================== */}
        {/* AROUND THE LEAGUE & INTERNATIONAL TOURS ON THIS DATE     */}
        {/* ======================================================== */}
        {((activeDay.otherMatches && activeDay.otherMatches.length > 0) ||
          (activeDay.internationalMatches && activeDay.internationalMatches.length > 0)) && (
          <div className="bg-[#0e1525] border border-slate-800/90 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5 text-amber-400" />
                OTHER FIXTURES &amp; TOURS ({activeDay.dayOfWeek} {activeDay.dayNumber} {activeDay.month.toUpperCase()})
              </span>
              <button
                onClick={() => {
                  sound.playTap();
                  setScheduleFilter('all');
                  setIsScheduleModalOpen(true);
                }}
                className="text-[10px] font-mono font-bold text-cyan-400 hover:underline"
              >
                VIEW ALL ({calendarDays.length}d) ▶
              </button>
            </div>

            <div className="space-y-1.5">
              {(activeDay.otherMatches || []).map(om => (
                <div
                  key={om.id}
                  className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-bold text-white">
                      <span>{om.homeLogo || '🏏'} {om.homeShortName}</span>
                      <span className="text-[10px] text-slate-500 font-mono">vs</span>
                      <span>{om.awayLogo || '🏏'} {om.awayShortName}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        {om.timeStr || '19:30 IST'}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                      {om.completed && om.resultSummary ? (
                        <span className="text-emerald-400">{om.resultSummary}</span>
                      ) : (
                        <span>📍 {om.venue} · League Fixture</span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-[9px] font-mono font-bold px-2 py-1 rounded-lg shrink-0 ml-2 ${
                      om.completed
                        ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-950/50 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {om.completed ? 'RESULT' : 'SCHEDULED'}
                  </span>
                </div>
              ))}

              {(activeDay.internationalMatches || []).map(im => (
                <div
                  key={im.id}
                  className="p-2.5 rounded-xl bg-[#0c192c] border border-cyan-500/30 flex items-center justify-between text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-bold text-white">
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold">
                        {im.format || 'INTL'}
                      </span>
                      <span>{im.homeLogo} {im.homeShortName} v {im.awayLogo} {im.awayShortName}</span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                      {im.completed && im.resultSummary ? (
                        <span className="text-emerald-400">{im.resultSummary}</span>
                      ) : (
                        <span className="text-cyan-300/90">{im.seriesName} · {im.venue}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      sound.playTap();
                      startInternationalMatch(
                        im.homeTeamId,
                        im.awayTeamId,
                        im.venue,
                        im.format || 'T20'
                      );
                    }}
                    className="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-black text-[10px] font-mono shrink-0 ml-2 uppercase"
                  >
                    PLAY
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* FRANCHISE DYNASTY, SCOUTING, DATA & MULTI-FORMAT HUB BAR */}
        {/* ======================================================== */}
        <div className="bg-[#0e1525] border border-slate-800/90 rounded-2xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
              FRANCHISE SUITE &amp; RULE FORMAT
            </span>
            <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[10px] font-mono font-bold">
              {(['T20', '100BALL', 'TEST'] as const).map(fmt => (
                <button
                  key={fmt}
                  onClick={() => {
                    sound.playTap();
                    setSelectedMatchFormat(fmt);
                  }}
                  className={`px-2 py-0.5 rounded transition-all ${
                    selectedMatchFormat === fmt ? 'bg-amber-400 text-black' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {fmt === '100BALL' ? '100-BALL' : fmt}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            <button
              onClick={() => { sound.playTap(); setTacticalSuiteTab('director'); setIsTacticalSuiteOpen(true); }}
              className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-amber-500/40 flex flex-col items-center gap-1 text-center active:scale-95 transition-all"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-[9px] font-bold text-white uppercase font-mono">Director</span>
            </button>
            <button
              onClick={() => { sound.playTap(); setTacticalSuiteTab('field'); setIsTacticalSuiteOpen(true); }}
              className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-purple-500/40 flex flex-col items-center gap-1 text-center active:scale-95 transition-all"
            >
              <Shield className="w-4 h-4 text-purple-400" />
              <span className="text-[9px] font-bold text-white uppercase font-mono">War Room</span>
            </button>
            <button
              onClick={() => { sound.playTap(); setIsScoutingOpen(true); }}
              className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-cyan-500/30 flex flex-col items-center gap-1 text-center active:scale-95 transition-all"
            >
              <Binoculars className="w-4 h-4 text-cyan-400" />
              <span className="text-[9px] font-bold text-white uppercase font-mono">Scouting</span>
            </button>
            <button
              onClick={() => { sound.playTap(); setIsBoardReviewOpen(true); }}
              className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-amber-500/30 flex flex-col items-center gap-1 text-center active:scale-95 transition-all"
            >
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="text-[9px] font-bold text-white uppercase font-mono">Dynasty</span>
            </button>
            <button
              onClick={() => { sound.playTap(); setIsDataPortabilityOpen(true); }}
              className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-emerald-500/30 flex flex-col items-center gap-1 text-center active:scale-95 transition-all"
            >
              <Database className="w-4 h-4 text-emerald-400" />
              <span className="text-[9px] font-bold text-white uppercase font-mono">Save / CSV</span>
            </button>
          </div>
        </div>

        {/* Live IPL Points Table Snapshot for Browser Right Panel */}
        <div className="bg-[#0e1525] border border-slate-800/90 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
              {currentLeague.shortName} STANDINGS SNAPSHOT
            </span>
            <button
              onClick={() => { sound.playTap(); setActiveTab('league'); }}
              className="text-[10px] font-mono font-bold text-amber-400 hover:underline"
            >
              FULL TABLE ▶
            </button>
          </div>
          <div className="divide-y divide-slate-800/60">
            {[...currentLeague.standings]
              .sort((a, b) => b.points - a.points || b.nrr - a.nrr)
              .slice(0, 5)
              .map((row, idx) => {
                const t = teams.find(tm => tm.id === row.teamId);
                const isUser = row.teamId === userTeam.id;
                return (
                  <div
                    key={row.teamId}
                    className={`py-2 px-2 flex items-center justify-between text-xs rounded-lg ${
                      isUser ? 'bg-amber-500/10 text-amber-300 font-bold' : 'text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-4 font-mono text-[10px] text-slate-500">{idx + 1}</span>
                      <span>{t?.logoEmoji}</span>
                      <span className="font-bold">{t?.shortName}</span>
                    </div>
                    <div className="flex items-center gap-4 font-mono text-[11px]">
                      <span className="text-slate-400">{row.played}P · {row.won}W · {row.lost}L</span>
                      <span className="font-bold text-white w-8 text-right">{row.points} pts</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
        </div>
      </div>

      {/* Season Schedule Modal (Exact reproduction of video & screenshots) */}
      <SeasonScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        userTeam={userTeam}
        teams={teams}
        players={players}
        leagueName={currentLeague.name}
      />

      {/* Inbox Modal */}
      <InboxModal
        isOpen={isInboxOpen}
        onClose={() => setIsInboxOpen(false)}
        teamShortName={userTeam.shortName}
      />

      {/* Hamburger Menu Drawer */}
      <MenuDrawerModal
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        homePitch={homePitch}
        onSelectPitch={setHomePitch}
        onRetire={() => showToast('Manager career ended. Archive saved to Legacy.')}
        onOpenSaveManager={() => setIsDataPortabilityOpen(true)}
      />

      {/* Feature 6.5: Scouting & Youth Academy Modal */}
      <ScoutingModal
        isOpen={isScoutingOpen}
        onClose={() => setIsScoutingOpen(false)}
      />

      {/* Feature 6.3: Multi-Season Dynasty & Retention Modal */}
      <RetentionModal
        isOpen={isRetentionOpen}
        onClose={() => setIsRetentionOpen(false)}
        onSeasonAdvance={(yr) => showToast(`Welcome to Season ${yr}! Squad retentions & progression applied.`)}
      />

      {/* 1. Board Review Modal (Screenshot_20261019_234411_f961f584.jpg) */}
      <BoardReviewModal
        isOpen={isBoardReviewOpen}
        onClose={() => setIsBoardReviewOpen(false)}
        onProceedToOffers={() => {
          setIsBoardReviewOpen(false);
          setSimToSeasonEndReady(true);
          setIsNextSeasonSetupOpen(true);
        }}
        userTeam={userTeam}
        userStanding={currentLeague.standings.find(s => s.teamId === userTeam.id)}
        userStandingRank={(() => {
          const sorted = [...(currentLeague.standings || [])].sort((a, b) => b.points - a.points || b.nrr - a.nrr);
          const idx = sorted.findIndex(s => s.teamId === userTeam.id);
          return idx >= 0 ? idx + 1 : 4;
        })()}
        seasonYear={2026}
      />

      {/* 2. Set Up Your Next Season (Offers) (Screenshot_2026_1019_234400_00e753b3.jpg) */}
      <NextSeasonSetupModal
        isOpen={isNextSeasonSetupOpen}
        onClose={() => setIsNextSeasonSetupOpen(false)}
        onProceed={(selectedClubId, selectedCountryId) => {
          setPendingNextClubId(selectedClubId);
          setPendingNextCountryId(selectedCountryId);
          setIsNextSeasonSetupOpen(false);
          setIsSeasonTransitionOpen(true);
        }}
        userTeam={userTeam}
      />

      {/* 3. Season Transition Modal (Screenshot_20261019_234437_ff67b4de.jpg) */}
      <SeasonTransitionModal
        isOpen={isSeasonTransitionOpen}
        onClose={() => setIsSeasonTransitionOpen(false)}
        onSelectMiniAuction={() => {
          startNewSeason(pendingNextClubId, pendingNextCountryId);
          setSimToSeasonEndReady(false);
          setIsSeasonTransitionOpen(false);
          setIsTradeWindowOpen(true);
        }}
        onSelectContinueSquads={() => {
          startNewSeason(pendingNextClubId, pendingNextCountryId);
          setSimToSeasonEndReady(false);
          setIsSeasonTransitionOpen(false);
          showToast('Season 2027 started! Standings & schedule reset, and squad progression applied.');
        }}
        nextSeasonYear={2027}
      />

      {/* 4. Trade Window Modal (Screenshot_2026_1019_234527_238b6681.jpg) */}
      <TradeWindowModal
        isOpen={isTradeWindowOpen}
        onClose={() => setIsTradeWindowOpen(false)}
        onProceedToReleases={(updatedPurseCr) => {
          setPostSeasonPurseCr(updatedPurseCr);
          setIsTradeWindowOpen(false);
          setIsReleasesModalOpen(true);
        }}
        userTeam={userTeam}
        userSquad={userTeamPlayers}
        allTeams={teams}
        initialPurseCr={postSeasonPurseCr}
      />

      {/* 5. Mini Auction Releases Modal (Screenshot_2026_1019_234623_cfd215e3.jpg) */}
      <MiniAuctionReleasesModal
        isOpen={isReleasesModalOpen}
        onClose={() => setIsReleasesModalOpen(false)}
        onProceedToAuctionHall={(releasedIds, finalPurseCr) => {
          setPostSeasonPurseCr(finalPurseCr);
          const names = releasedIds.map(id => {
            const p = userTeamPlayers.find(pl => pl.id === id);
            return p ? p.name : id;
          });
          if (names.length > 0) setReleasedPlayerNames(names);
          setIsReleasesModalOpen(false);
          setIsAuctionHallOpen(true);
        }}
        userTeam={userTeam}
        userSquad={userTeamPlayers}
        currentPurseCr={postSeasonPurseCr}
      />

      {/* 6. Auction Hall Overview Screen (Screenshot_2026_1019_234703_8f9ee5de.jpg) */}
      <AuctionHallScreen
        isOpen={isAuctionHallOpen}
        onClose={() => setIsAuctionHallOpen(false)}
        onStartAuction={() => {
          setIsAuctionHallOpen(false);
          setActiveTab('auction');
        }}
        userTeam={userTeam}
        userPurseCr={postSeasonPurseCr}
        userReleasedNames={releasedPlayerNames}
      />

      {/* Feature 6.7: Data Portability & Community CSV Rosters Modal */}
      <DataPortabilityModal
        isOpen={isDataPortabilityOpen}
        onClose={() => setIsDataPortabilityOpen(false)}
      />

      {/* Opener Selection Modal */}
      <OpenerSelectionModal
        isOpen={isOpenersModalOpen}
        onClose={() => setIsOpenersModalOpen(false)}
        homeTeamName={isCurrentMatchHome ? userTeam.name : opponentTeam.name}
        awayTeamName={isCurrentMatchHome ? opponentTeam.name : userTeam.name}
        homeTeamShort={isCurrentMatchHome ? userTeam.shortName : opponentTeam.shortName}
        awayTeamShort={isCurrentMatchHome ? opponentTeam.shortName : userTeam.shortName}
        homeTeamLogo={(isCurrentMatchHome ? userTeam.logoEmoji : opponentTeam.logoEmoji) || '🏏'}
        venueName={`${(isCurrentMatchHome ? userTeam : opponentTeam).city} Cricket Stadium`}
        players={userTeamPlayers}
        onConfirmOpeners={(strikerId, nonStrikerId) => {
          setIsOpenersModalOpen(false);
          startMatch(opponentTeam.id, selectedMatchFormat, !isCurrentMatchHome, activeDay.matchFixture?.id);
          setTimeout(() => selectOpeners(strikerId, nonStrikerId), 50);
        }}
        onSimMatch={() => {
          setIsOpenersModalOpen(false);
          startMatch(opponentTeam.id, selectedMatchFormat, !isCurrentMatchHome, activeDay.matchFixture?.id);
          setTimeout(() => simEntireMatch(), 200);
        }}
      />

      {/* Full Scorecard Analysis Modal */}
      {selectedScorecardMatch && (
        <MatchAnalysisModal
          matchState={selectedScorecardMatch}
          onClose={() => setSelectedScorecardMatch(null)}
        />
      )}

      {/* Tactical Command Suite & Club Facilities Modal */}
      <TacticalCommandSuiteModal
        isOpen={isTacticalSuiteOpen}
        onClose={() => setIsTacticalSuiteOpen(false)}
        initialTab={tacticalSuiteTab}
      />
    </div>
  );
};

