import React, { useState, useMemo } from 'react';
import { ArrowLeft, Heart, ChevronRight, Check } from 'lucide-react';
import { sound } from '../../utils/soundEffects';
import { useGame } from '../../context/GameContext';
import { CompletedMatchRecord, Player } from '../../types/cricket';

interface InboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamShortName: string;
}

export const InboxModal: React.FC<InboxModalProps> = ({ isOpen, onClose, teamShortName }) => {
  const {
    userTeam,
    teams,
    players,
    leagues,
    currentLeagueId,
    coachProfile,
    inboxMessages,
    replyToInboxMessage,
    completedMatchesHistory
  } = useGame();

  const [activeTab, setActiveTab] = useState<'squad' | 'news' | 'fans'>('squad');
  const [selectedScorecard, setSelectedScorecard] = useState<CompletedMatchRecord | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [playerTab, setPlayerTab] = useState<'overview' | 'career'>('overview');
  const [statsCategory, setStatsCategory] = useState<'domestic' | 'national'>('domestic');
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});

  const currentLeague = leagues.find(l => l.id === currentLeagueId) || leagues[0];
  const squadPlayers = useMemo(() => players.filter(p => p.clubId === userTeam.id), [players, userTeam.id]);

  const captainPlayer = useMemo(() => {
    return squadPlayers.find(p => p.id === userTeam.captainId || p.isCaptain) || squadPlayers[0] || players[0];
  }, [squadPlayers, userTeam.captainId, players]);

  const avgSquadMorale = useMemo(() => {
    if (squadPlayers.length === 0) return 82;
    return Math.round(squadPlayers.reduce((sum, p) => sum + (p.morale || 80), 0) / squadPlayers.length);
  }, [squadPlayers]);

  const unresolvedCount = useMemo(() => inboxMessages.filter(m => !m.resolved).length, [inboxMessages]);

  // Dynamic Orange Cap, Purple Cap & User Team Top Scorer
  const orangeCapLeader = useMemo(() => {
    return [...players].sort((a, b) => (b.stats?.runs || 0) - (a.stats?.runs || 0))[0] || players[0];
  }, [players]);

  const purpleCapLeader = useMemo(() => {
    return [...players].sort((a, b) => (b.stats?.wickets || 0) - (a.stats?.wickets || 0))[0] || players[1];
  }, [players]);

  const userTopScorer = useMemo(() => {
    return [...squadPlayers].sort((a, b) => (b.stats?.runs || 0) - (a.stats?.runs || 0))[0] || captainPlayer;
  }, [squadPlayers, captainPlayer]);

  const nextScheduledOpponent = useMemo(() => {
    const activeCal = currentLeague?.calendarDates?.[currentLeague.currentDateIndex];
    const oppId = activeCal?.opponentTeamId;
    return (oppId ? teams.find(t => t.id === oppId) : null) || teams.find(t => t.id !== userTeam.id) || teams[1];
  }, [currentLeague, teams, userTeam.id]);

  const inspectedPlayer: Player | null = useMemo(() => {
    if (!selectedPlayerId) return null;
    return players.find(p => p.id === selectedPlayerId) || null;
  }, [selectedPlayerId, players]);

  if (!isOpen) return null;

  const toggleLikePost = (postId: string) => {
    sound.playTap();
    setLikedPosts(prev => ({ ...prev, [postId]: !prev[postId] }));
  };

  // Build synthetic scorecard if user taps a calendar fixture without a full record in completedMatchesHistory
  const openCalendarFixtureScorecard = (fixtureSummary: string, homeId: string, awayId: string) => {
    sound.playTap();
    const hTeam = teams.find(t => t.id === homeId) || userTeam;
    const aTeam = teams.find(t => t.id === awayId) || nextScheduledOpponent;
    const existing = completedMatchesHistory.find(
      m => (m.homeTeam === hTeam.shortName && m.awayTeam === aTeam.shortName) ||
           (m.homeTeam === aTeam.shortName && m.awayTeam === hTeam.shortName)
    );
    if (existing) {
      setSelectedScorecard(existing);
      return;
    }

    const hPlayers = players.filter(p => p.clubId === hTeam.id).slice(0, 6);
    const aPlayers = players.filter(p => p.clubId === aTeam.id).slice(0, 6);
    setSelectedScorecard({
      id: `cal_sc_${homeId}_${awayId}`,
      dateStr: 'SEASON ARCHIVE',
      homeTeam: hTeam.shortName,
      awayTeam: aTeam.shortName,
      summary: fixtureSummary,
      playerOfMatch: hPlayers[0]?.name || captainPlayer.name,
      innings1: {
        team: hTeam.name.toUpperCase(),
        runs: 184,
        wickets: 5,
        overs: '20.0',
        batters: hPlayers.slice(0, 4).map((p, idx) => ({
          name: idx === 1 ? `${p.name} *` : p.name,
          runs: idx === 0 ? 64 : idx === 1 ? 52 : idx === 2 ? 38 : 21,
          balls: idx === 0 ? 39 : idx === 1 ? 31 : idx === 2 ? 26 : 14,
          fours: idx === 0 ? 7 : 4,
          sixes: idx === 0 ? 3 : 2,
          sr: idx === 0 ? 164.1 : 167.7,
          isOut: idx !== 1,
          outDesc: idx !== 1 ? `b ${aPlayers[4]?.name || 'Bowler'}` : undefined
        })),
        bowlers: aPlayers.slice(2, 6).map((p, idx) => ({
          name: p.name,
          overs: 4,
          maidens: 0,
          runs: 32 + idx * 4,
          wickets: idx === 0 ? 2 : 1,
          econ: Number(((32 + idx * 4) / 4).toFixed(2))
        }))
      },
      innings2: {
        team: aTeam.name.toUpperCase(),
        runs: 172,
        wickets: 7,
        overs: '20.0',
        batters: aPlayers.slice(0, 4).map((p, idx) => ({
          name: idx === 2 ? `${p.name} *` : p.name,
          runs: idx === 0 ? 58 : idx === 1 ? 41 : idx === 2 ? 36 : 19,
          balls: idx === 0 ? 38 : idx === 1 ? 29 : idx === 2 ? 24 : 16,
          fours: 5,
          sixes: 2,
          sr: 152.6,
          isOut: idx !== 2,
          outDesc: idx !== 2 ? `c & b ${hPlayers[4]?.name || 'Spinner'}` : undefined
        })),
        bowlers: hPlayers.slice(2, 6).map((p, idx) => ({
          name: p.name,
          overs: 4,
          maidens: 0,
          runs: 29 + idx * 5,
          wickets: idx === 0 ? 3 : 1,
          econ: Number(((29 + idx * 5) / 4).toFixed(2))
        }))
      }
    });
  };

  const completedCalendarFixtures = (currentLeague?.calendarDates || []).filter(
    d => d.matchFixture && d.matchFixture.completed && d.matchFixture.resultSummary
  );

  const currentStreak = coachProfile.domesticStats?.currentStreak ?? 2;
  const fanPosts = [
    {
      id: 'fan_1',
      initial: userTeam.shortName[0] || 'K',
      badgeBg: 'bg-purple-900 text-purple-200',
      handle: `@${userTeam.shortName}tillIdie`,
      subtitle: `${userTeam.city} Ultra`,
      time: 'Today',
      text: currentStreak >= 2
        ? `${currentStreak} wins on the bounce for ${userTeam.shortName}! Wearing the lucky jersey all week. Bring on ${nextScheduledOpponent.shortName}! #${userTeam.shortName}v${nextScheduledOpponent.shortName}`
        : `Big game coming up against ${nextScheduledOpponent.shortName}. Trusting Coach ${coachProfile.name.split(' ')[0]} and ${captainPlayer.name} to turn the momentum around! #${userTeam.shortName}`,
      baseLikes: 1140
    },
    {
      id: 'fan_2',
      initial: 'R',
      badgeBg: 'bg-amber-900 text-amber-200',
      handle: '@RaviVellodi',
      subtitle: 'Ex-international opener & Pundit',
      time: 'Yesterday',
      text: `${userTopScorer.name} (${userTopScorer.stats?.runs || 245} runs) has been clinical for ${userTeam.shortName}, while ${purpleCapLeader.name} (${purpleCapLeader.stats?.wickets || 14} wkts) is dominating the Purple Cap race. #OrangeCap #PurpleCap`,
      baseLikes: 1620
    },
    {
      id: 'fan_3',
      initial: 'N',
      badgeBg: 'bg-cyan-950 text-cyan-200',
      handle: `@nightwatchman_${userTeam.shortName.toLowerCase()}`,
      subtitle: 'Season Ticket Holder',
      time: '2d ago',
      text: `Dressing room morale looks ${avgSquadMorale >= 82 ? 'sky-high' : 'focused'} under ${captainPlayer.name}'s captaincy. ${userTeam.city} is buzzing for matchday! #${userTeam.shortName}Brigade`,
      baseLikes: 918
    }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-[#070b13] text-slate-100 flex flex-col max-w-md mx-auto select-none">
      {/* Top Header */}
      <div className="px-4 py-3 bg-[#0a0f1c] border-b border-slate-800 flex items-center justify-between sticky top-0 z-20 shadow-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { sound.playTap(); onClose(); }}
            className="p-1 text-slate-300 hover:text-white active:scale-95 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-sm font-black font-display tracking-wider text-white uppercase">
              {userTeam.shortName} INBOX & MEDIA HUB
            </h1>
            <span className="text-[10px] font-mono text-slate-400 block">
              {unresolvedCount > 0 ? `${unresolvedCount} action item${unresolvedCount > 1 ? 's' : ''} awaiting coach reply` : 'All player messages resolved'}
            </span>
          </div>
        </div>
      </div>

      {/* 3 Tabs: SQUAD | NEWS | FANS */}
      <div className="p-3 bg-[#0a0f1c] border-b border-slate-800/80">
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#131b2a] rounded-xl border border-slate-800">
          <button
            onClick={() => { sound.playTap(); setActiveTab('squad'); }}
            className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'squad'
                ? 'bg-amber-400 text-black shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>SQUAD</span>
            {unresolvedCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black ${
                activeTab === 'squad' ? 'bg-black text-amber-400' : 'bg-amber-500/20 text-amber-300'
              }`}>
                {unresolvedCount}
              </span>
            )}
          </button>
          <button
            onClick={() => { sound.playTap(); setActiveTab('news'); }}
            className={`py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'news'
                ? 'bg-amber-400 text-black shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            NEWS ({completedMatchesHistory.length})
          </button>
          <button
            onClick={() => { sound.playTap(); setActiveTab('fans'); }}
            className={`py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'fans'
                ? 'bg-amber-400 text-black shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            FANS
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* TAB 1: SQUAD */}
        {activeTab === 'squad' && (
          <div className="space-y-4">
            <p className="text-[11px] text-slate-400">
              Messages from your {userTeam.name} players and leadership group. Your replies directly shift squad morale and form.
            </p>

            {/* Dynamic Dressing Room Status Card */}
            <div className="p-3.5 rounded-2xl bg-[#131b2a] border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">👔</span>
                <div>
                  <div className="text-xs font-bold text-white uppercase tracking-wider">
                    DRESSING ROOM: {avgSquadMorale >= 85 && unresolvedCount === 0 ? 'HARMONIOUS' : avgSquadMorale >= 75 ? 'SETTLED' : 'RESTLESS'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {unresolvedCount === 0
                      ? `All players aligned with Coach ${coachProfile.name}.`
                      : `${unresolvedCount} player conversation${unresolvedCount > 1 ? 's' : ''} waiting for your response.`}
                  </div>
                </div>
              </div>
              <div className="text-right font-mono">
                <span className="text-[10px] text-slate-400 block">MORALE</span>
                <span className="text-sm font-black text-emerald-400">{avgSquadMorale}%</span>
              </div>
            </div>

            {/* Dynamic Squad Messages List */}
            <div className="space-y-3">
              {inboxMessages.map(msg => {
                const livePlayer = players.find(p => p.id === msg.playerId) || captainPlayer;
                return (
                  <div key={msg.id} className="space-y-1.5">
                    <span className="text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase">
                      {msg.dateLabel}
                    </span>

                    <div className="p-3.5 rounded-2xl bg-[#131b2a] border border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => {
                            sound.playTap();
                            setSelectedPlayerId(livePlayer.id);
                          }}
                          className="flex items-center gap-2 text-left group"
                        >
                          <div className="w-7 h-7 rounded-lg bg-purple-900 text-purple-200 font-bold text-xs font-mono flex items-center justify-center">
                            {livePlayer.jerseyNumber || msg.jerseyNumber}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white group-hover:text-amber-300 uppercase">
                                {livePlayer.name}
                              </span>
                              {(msg.isCaptain || livePlayer.isCaptain) && (
                                <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                                  CAPT
                                </span>
                              )}
                              <span className="text-[10px] font-mono text-slate-400">· {livePlayer.role}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] font-mono mt-0.5">
                              <span className="text-emerald-400">Morale {livePlayer.morale}%</span>
                              <span className="text-slate-600">·</span>
                              <span className="text-amber-400">Form {livePlayer.form}</span>
                            </div>
                          </div>
                        </button>

                        <button
                          onClick={() => {
                            sound.playTap();
                            setSelectedPlayerId(livePlayer.id);
                          }}
                          className="text-[10px] font-mono font-bold text-amber-400 hover:text-amber-300"
                        >
                          Profile &gt;
                        </button>
                      </div>

                      <div className="text-xs font-bold text-slate-200">
                        {msg.subject}
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed italic bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                        {msg.body}
                      </p>

                      {/* 3 Interactive Coach Reply Buttons OR Resolved Summary */}
                      {!msg.resolved ? (
                        <div className="pt-1 space-y-1.5">
                          <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">
                            CHOOSE COACH REPLY:
                          </span>
                          <div className="grid grid-cols-1 gap-1.5">
                            <button
                              onClick={() => replyToInboxMessage(msg.id, 'promise_game_time')}
                              className="w-full py-2 px-3 rounded-xl bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-between transition-all active:scale-[0.99]"
                            >
                              <span>1. Promise game time</span>
                              <span className="text-[10px] font-mono text-emerald-400">+10 Morale · +3 Form</span>
                            </button>
                            <button
                              onClick={() => replyToInboxMessage(msg.id, 'demand_nets')}
                              className="w-full py-2 px-3 rounded-xl bg-amber-950/40 hover:bg-amber-900/50 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center justify-between transition-all active:scale-[0.99]"
                            >
                              <span>2. Demand harder work in nets</span>
                              <span className="text-[10px] font-mono text-amber-400">+8 Form · -4 Morale</span>
                            </button>
                            <button
                              onClick={() => replyToInboxMessage(msg.id, 'back_current_xi')}
                              className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold flex items-center justify-between transition-all active:scale-[0.99]"
                            >
                              <span>3. Back the current Starting XI</span>
                              <span className="text-[10px] font-mono text-cyan-400">+6 Capt Morale</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 text-emerald-300 font-bold">
                            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span>{msg.selectedReply}</span>
                          </div>
                          <span className="text-[10px] font-mono font-bold text-emerald-400">
                            {msg.impactSummary}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: NEWS */}
        {activeTab === 'news' && (
          <div className="space-y-4">
            <p className="text-[11px] text-slate-400">
              Live match scorecards and headlines from {currentLeague.name} and around the cricket world.
            </p>

            {/* COMPLETED MATCH SCORECARDS */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase">
                RECENT MATCH SCORECARDS (TAP TO VIEW)
              </span>
              <div className="space-y-2">
                {completedMatchesHistory.map(matchRec => (
                  <button
                    key={matchRec.id}
                    onClick={() => { sound.playTap(); setSelectedScorecard(matchRec); }}
                    className="w-full p-3 rounded-xl bg-[#131b2a] hover:bg-[#1a253a] border border-slate-800 flex items-center justify-between text-left active:scale-[0.99] transition-all"
                  >
                    <div className="pr-2">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-mono font-bold text-emerald-400">
                          {matchRec.homeTeam} vs {matchRec.awayTeam}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">· {matchRec.dateStr}</span>
                      </div>
                      <div className="text-xs font-bold text-white">{matchRec.summary}</div>
                      <div className="text-[10px] text-amber-400 font-mono mt-1">
                        ★ POTM: {matchRec.playerOfMatch} · Tap for full 1st &amp; 2nd innings scorecard
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-amber-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            {/* SEASON SCHEDULE COMPLETED FIXTURES */}
            {completedCalendarFixtures.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase">
                  {userTeam.shortName} SEASON RESULTS
                </span>
                <div className="space-y-1.5">
                  {completedCalendarFixtures.map((cd, idx) => (
                    <button
                      key={cd.id || idx}
                      onClick={() =>
                        openCalendarFixtureScorecard(
                          cd.matchFixture!.resultSummary!,
                          cd.matchFixture!.homeTeamId,
                          cd.matchFixture!.awayTeamId
                        )
                      }
                      className="w-full p-3 rounded-xl bg-[#131b2a] hover:bg-[#1a253a] border border-slate-800 flex items-center justify-between text-left transition-all"
                    >
                      <div>
                        <div className="text-xs font-bold text-white">
                          {cd.matchFixture?.resultSummary}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                          {cd.dayOfWeek} {cd.dayNumber} {cd.month} · {cd.matchFixture?.venue}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-amber-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* DYNAMIC LEAGUE HEADLINES */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase">
                LEAGUE WIRE &amp; CAP LEADERS
              </span>
              <div className="space-y-1.5">
                <div className="p-3 rounded-xl bg-[#131b2a] border border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-200 font-medium">
                    Next Blockbuster: {userTeam.shortName} take on {nextScheduledOpponent.shortName} ({nextScheduledOpponent.city}).
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[#131b2a] border border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-200 font-medium">
                    Orange Cap Race: {orangeCapLeader.name} leads the charts with {orangeCapLeader.stats?.runs || 375} runs.
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[#131b2a] border border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-200 font-medium">
                    Purple Cap Watch: {purpleCapLeader.name} tops the wicket column with {purpleCapLeader.stats?.wickets || 14} scalps.
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[#131b2a] border border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-200 font-medium">
                    {userTopScorer.name} spearheads {userTeam.shortName}'s batting unit with {userTopScorer.stats?.runs || 195} season runs.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: FANS */}
        {activeTab === 'fans' && (
          <div className="space-y-4">
            <p className="text-[11px] text-slate-400">
              The top posts from {teamShortName} supporters and pundits around {userTeam.city}.
            </p>

            <div className="space-y-3">
              {fanPosts.map(post => {
                const isLiked = !!likedPosts[post.id];
                const likeCount = post.baseLikes + (isLiked ? 1 : 0);
                return (
                  <div key={post.id} className="p-3.5 rounded-2xl bg-[#131b2a] border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full font-bold text-xs flex items-center justify-center ${post.badgeBg}`}>
                          {post.initial}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">{post.handle}</div>
                          <div className="text-[9px] text-slate-400">{post.subtitle}</div>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">{post.time}</span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed">
                      {post.text}
                    </p>
                    <button
                      onClick={() => toggleLikePost(post.id)}
                      className={`flex items-center gap-1.5 text-xs pt-1 transition-all ${
                        isLiked ? 'text-rose-400 font-bold' : 'text-slate-400 hover:text-rose-400'
                      }`}
                    >
                      <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-current text-rose-400' : ''}`} />
                      <span className="font-mono text-[11px]">{likeCount.toLocaleString()}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* FULL 1ST & 2ND INNINGS MATCH SCORECARD MODAL */}
      {selectedScorecard && (
        <div className="fixed inset-0 z-50 bg-[#070b13] flex flex-col max-w-md mx-auto overflow-y-auto">
          <div className="px-4 py-3 bg-[#0a0f1c] border-b border-slate-800 flex items-center justify-between sticky top-0 z-20">
            <div className="flex items-center gap-2">
              <button onClick={() => setSelectedScorecard(null)} className="p-1 text-slate-300 hover:text-white">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <span className="text-xs font-mono font-bold text-slate-300">
                {selectedScorecard.homeTeam} vs {selectedScorecard.awayTeam}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-emerald-400 font-bold">FULL SCORECARD</span>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Match Summary */}
            <div className="p-3.5 rounded-2xl bg-[#131b2a] border border-slate-800 space-y-1">
              <div className="text-xs font-bold text-white">{selectedScorecard.summary}</div>
              <div className="text-[11px] text-amber-400 font-medium">★ Player of the Match: {selectedScorecard.playerOfMatch}</div>
            </div>

            {/* Innings 1 Batters & Bowlers */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-white px-1">
                <span>1ST INNINGS · {selectedScorecard.innings1.team}</span>
                <span className="font-mono text-amber-400">{selectedScorecard.innings1.runs}/{selectedScorecard.innings1.wickets} ({selectedScorecard.innings1.overs} ov)</span>
              </div>
              <div className="bg-[#131b2a] rounded-2xl border border-slate-800 overflow-hidden text-xs">
                <div className="grid grid-cols-12 gap-1 p-2 bg-[#0d131f] text-[10px] font-mono text-slate-400 uppercase font-bold">
                  <span className="col-span-5">BATTER</span>
                  <span className="col-span-2 text-right">R</span>
                  <span className="col-span-2 text-right">B</span>
                  <span className="col-span-1 text-right">4s</span>
                  <span className="col-span-2 text-right">SR</span>
                </div>
                {selectedScorecard.innings1.batters.map((b, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1 px-2 py-1.5 border-t border-slate-800/60 font-mono text-xs items-center">
                    <div className="col-span-5 truncate">
                      <span className="text-white font-bold block truncate">{b.name}</span>
                      {b.outDesc && <span className="text-[9px] text-slate-400 block truncate">{b.outDesc}</span>}
                    </div>
                    <span className="col-span-2 text-right text-white font-bold">{b.runs}</span>
                    <span className="col-span-2 text-right text-slate-400">{b.balls}</span>
                    <span className="col-span-1 text-right text-slate-400">{b.fours}</span>
                    <span className="col-span-2 text-right text-amber-400 font-bold">{b.sr.toFixed(1)}</span>
                  </div>
                ))}
                {selectedScorecard.innings1.bowlers && selectedScorecard.innings1.bowlers.length > 0 && (
                  <>
                    <div className="grid grid-cols-12 gap-1 p-2 bg-[#0d131f] border-t border-slate-800 text-[10px] font-mono text-slate-400 uppercase font-bold">
                      <span className="col-span-5">BOWLER</span>
                      <span className="col-span-2 text-right">O</span>
                      <span className="col-span-2 text-right">R</span>
                      <span className="col-span-1 text-right">W</span>
                      <span className="col-span-2 text-right">ECON</span>
                    </div>
                    {selectedScorecard.innings1.bowlers.map((bw, i) => (
                      <div key={i} className="grid grid-cols-12 gap-1 px-2 py-1.5 border-t border-slate-800/60 font-mono text-xs items-center">
                        <span className="col-span-5 text-slate-200 font-bold truncate">{bw.name}</span>
                        <span className="col-span-2 text-right text-slate-400">{bw.overs}</span>
                        <span className="col-span-2 text-right text-slate-300">{bw.runs}</span>
                        <span className="col-span-1 text-right text-emerald-400 font-bold">{bw.wickets}</span>
                        <span className="col-span-2 text-right text-cyan-400">{bw.econ.toFixed(1)}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Innings 2 Batters & Bowlers */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-white px-1">
                <span>2ND INNINGS · {selectedScorecard.innings2.team}</span>
                <span className="font-mono text-amber-400">{selectedScorecard.innings2.runs}/{selectedScorecard.innings2.wickets} ({selectedScorecard.innings2.overs} ov)</span>
              </div>
              <div className="bg-[#131b2a] rounded-2xl border border-slate-800 overflow-hidden text-xs">
                <div className="grid grid-cols-12 gap-1 p-2 bg-[#0d131f] text-[10px] font-mono text-slate-400 uppercase font-bold">
                  <span className="col-span-5">BATTER</span>
                  <span className="col-span-2 text-right">R</span>
                  <span className="col-span-2 text-right">B</span>
                  <span className="col-span-1 text-right">4s</span>
                  <span className="col-span-2 text-right">SR</span>
                </div>
                {selectedScorecard.innings2.batters.map((b, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1 px-2 py-1.5 border-t border-slate-800/60 font-mono text-xs items-center">
                    <div className="col-span-5 truncate">
                      <span className="text-white font-bold block truncate">{b.name}</span>
                      {b.outDesc && <span className="text-[9px] text-slate-400 block truncate">{b.outDesc}</span>}
                    </div>
                    <span className="col-span-2 text-right text-white font-bold">{b.runs}</span>
                    <span className="col-span-2 text-right text-slate-400">{b.balls}</span>
                    <span className="col-span-1 text-right text-slate-400">{b.fours}</span>
                    <span className="col-span-2 text-right text-amber-400 font-bold">{b.sr.toFixed(1)}</span>
                  </div>
                ))}
                {selectedScorecard.innings2.bowlers && selectedScorecard.innings2.bowlers.length > 0 && (
                  <>
                    <div className="grid grid-cols-12 gap-1 p-2 bg-[#0d131f] border-t border-slate-800 text-[10px] font-mono text-slate-400 uppercase font-bold">
                      <span className="col-span-5">BOWLER</span>
                      <span className="col-span-2 text-right">O</span>
                      <span className="col-span-2 text-right">R</span>
                      <span className="col-span-1 text-right">W</span>
                      <span className="col-span-2 text-right">ECON</span>
                    </div>
                    {selectedScorecard.innings2.bowlers.map((bw, i) => (
                      <div key={i} className="grid grid-cols-12 gap-1 px-2 py-1.5 border-t border-slate-800/60 font-mono text-xs items-center">
                        <span className="col-span-5 text-slate-200 font-bold truncate">{bw.name}</span>
                        <span className="col-span-2 text-right text-slate-400">{bw.overs}</span>
                        <span className="col-span-2 text-right text-slate-300">{bw.runs}</span>
                        <span className="col-span-1 text-right text-emerald-400 font-bold">{bw.wickets}</span>
                        <span className="col-span-2 text-right text-cyan-400">{bw.econ.toFixed(1)}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LIVE PLAYER PROFILE SHEET MODAL */}
      {inspectedPlayer && (
        <div className="fixed inset-0 z-50 bg-[#070b13] flex flex-col max-w-md mx-auto overflow-y-auto">
          <div className="px-4 py-3 bg-[#0a0f1c] border-b border-slate-800 flex items-center justify-between sticky top-0 z-20">
            <div className="flex items-center gap-3">
              <button onClick={() => setSelectedPlayerId(null)} className="p-1 text-slate-300 hover:text-white">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-black text-white">{inspectedPlayer.name}</span>
                  {(inspectedPlayer.isCaptain || inspectedPlayer.id === userTeam.captainId) && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-400 text-black text-[9px] font-black">CAPT</span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400">
                  {inspectedPlayer.role} · {inspectedPlayer.age} yrs · {inspectedPlayer.battingHand} · {inspectedPlayer.bowlingArm}
                </div>
              </div>
            </div>
            <div className="w-8 h-8 rounded-xl bg-purple-900 text-purple-200 font-bold text-sm font-mono flex items-center justify-center">
              {inspectedPlayer.jerseyNumber || 10}
            </div>
          </div>

          <div className="p-4 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold text-white">
                {userTeam.shortName}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold text-white">
                {inspectedPlayer.country}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-950 border border-emerald-500/50 text-xs font-bold text-emerald-400 font-mono">
                FORM {inspectedPlayer.form}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-amber-950 border border-amber-500/50 text-xs font-bold text-amber-400 font-mono">
                MORALE {inspectedPlayer.morale}%
              </span>
            </div>

            {/* OVERVIEW | CAREER Tabs */}
            <div className="grid grid-cols-2 gap-2 border-b border-slate-800 pb-2">
              <button
                onClick={() => setPlayerTab('overview')}
                className={`py-1.5 text-xs font-bold uppercase transition-all ${
                  playerTab === 'overview' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-400'
                }`}
              >
                OVERVIEW
              </button>
              <button
                onClick={() => setPlayerTab('career')}
                className={`py-1.5 text-xs font-bold uppercase transition-all ${
                  playerTab === 'career' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-400'
                }`}
              >
                CAREER STATS
              </button>
            </div>

            {playerTab === 'overview' ? (
              <>
                <div className="p-3.5 rounded-2xl bg-[#131b2a] border border-slate-800 space-y-3">
                  <div className="text-xs font-bold text-white uppercase tracking-wider">BATTING &amp; MENTAL</div>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                    <div className="p-2 bg-slate-900 rounded-xl flex justify-between">
                      <span className="text-slate-400">BAT</span>
                      <span className="text-emerald-400 font-bold">{inspectedPlayer.ratings.bat}</span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded-xl flex justify-between">
                      <span className="text-slate-400">POW</span>
                      <span className="text-amber-400 font-bold">{inspectedPlayer.ratings.pow}</span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded-xl flex justify-between">
                      <span className="text-slate-400">TEC</span>
                      <span className="text-cyan-400 font-bold">{inspectedPlayer.ratings.tec || inspectedPlayer.ratings.bat}</span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded-xl flex justify-between">
                      <span className="text-slate-400">TMP</span>
                      <span className="text-white font-bold">{inspectedPlayer.ratings.tmp}</span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded-xl flex justify-between">
                      <span className="text-slate-400">vP</span>
                      <span className="text-slate-300 font-bold">{inspectedPlayer.ratings.vp || inspectedPlayer.ratings.bat}</span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded-xl flex justify-between">
                      <span className="text-slate-400">vS</span>
                      <span className="text-emerald-400 font-bold">{inspectedPlayer.ratings.vs || inspectedPlayer.ratings.bat}</span>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#131b2a] border border-slate-800 space-y-3">
                  <div className="text-xs font-bold text-white uppercase tracking-wider">BOWLING &amp; ATHLETICISM</div>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                    <div className="p-2 bg-slate-900 rounded-xl flex justify-between">
                      <span className="text-slate-400">BWL</span>
                      <span className="text-emerald-400 font-bold">{inspectedPlayer.ratings.bowl}</span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded-xl flex justify-between">
                      <span className="text-slate-400">CTRL</span>
                      <span className="text-cyan-400 font-bold">{inspectedPlayer.ratings.ctrl}</span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded-xl flex justify-between">
                      <span className="text-slate-400">DTH</span>
                      <span className="text-amber-400 font-bold">{inspectedPlayer.ratings.dth}</span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded-xl flex justify-between">
                      <span className="text-slate-400">CAT</span>
                      <span className="text-white font-bold">{inspectedPlayer.ratings.cat}</span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded-xl flex justify-between">
                      <span className="text-slate-400">RUN</span>
                      <span className="text-slate-300 font-bold">{inspectedPlayer.ratings.run}</span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded-xl flex justify-between">
                      <span className="text-slate-400">FIT</span>
                      <span className="text-emerald-400 font-bold">{inspectedPlayer.fitness}</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-3.5 rounded-2xl bg-[#131b2a] border border-slate-800 space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => setStatsCategory('domestic')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold ${
                      statsCategory === 'domestic' ? 'bg-amber-400 text-black' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    FRANCHISE / SEASON
                  </button>
                  <button
                    onClick={() => setStatsCategory('national')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold ${
                      statsCategory === 'national' ? 'bg-amber-400 text-black' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    CAREER ARCHIVE
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-2 text-xs font-mono text-center">
                  <div className="p-2 bg-slate-900 rounded-xl">
                    <div className="text-[10px] text-slate-400">MATCHES</div>
                    <div className="text-base font-bold text-white">
                      {statsCategory === 'domestic' ? (inspectedPlayer.stats?.matches || 9) : (inspectedPlayer.stats?.matches || 9) * 6}
                    </div>
                  </div>
                  <div className="p-2 bg-slate-900 rounded-xl">
                    <div className="text-[10px] text-slate-400">RUNS</div>
                    <div className="text-base font-bold text-amber-400">
                      {statsCategory === 'domestic' ? (inspectedPlayer.stats?.runs || 210) : (inspectedPlayer.stats?.runs || 210) * 5}
                    </div>
                  </div>
                  <div className="p-2 bg-slate-900 rounded-xl">
                    <div className="text-[10px] text-slate-400">WICKETS</div>
                    <div className="text-base font-bold text-emerald-400">
                      {statsCategory === 'domestic' ? (inspectedPlayer.stats?.wickets || 4) : (inspectedPlayer.stats?.wickets || 4) * 5}
                    </div>
                  </div>
                  <div className="p-2 bg-slate-900 rounded-xl">
                    <div className="text-[10px] text-slate-400">SR</div>
                    <div className="text-base font-bold text-cyan-400">
                      {inspectedPlayer.stats?.strikeRate || 144.2}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

