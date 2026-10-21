import React, { useState } from 'react';
import { Star, X, Info, Activity, Trophy, Calendar, Award } from 'lucide-react';
import { Player, PlayerStats } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';
import { derivePlayerPersonality } from '../../services/cricketServices';
import { PlayerCareerStatsCard } from '../common/PlayerCareerStatsCard';
import { getBattingStats, getBowlingStats } from '../../utils/playerStatsHelpers';

interface PlayerOverviewCareerDashboardProps {
  player: Player;
  onClose: () => void;
  onMakeCaptain?: (playerId: string) => void;
  isCaptain?: boolean;
  activeSeasonKey?: string;
  isInXI?: boolean;
}

export const PlayerOverviewCareerDashboard: React.FC<PlayerOverviewCareerDashboardProps> = ({
  player,
  onClose,
  onMakeCaptain,
  isCaptain = false,
  activeSeasonKey = 'Season 2026',
  isInXI = true
}) => {
  const [primaryTab, setPrimaryTab] = useState<'OVERVIEW' | 'CAREER'>('OVERVIEW');
  const [competitionTab, setCompetitionTab] = useState<'IPL' | 'INTERNATIONAL'>('IPL');
  const [careerFilter, setCareerFilter] = useState<'CAREER' | 'SEASON'>('CAREER');
  const [selectedSeasonKey, setSelectedSeasonKey] = useState<string>(activeSeasonKey);

  const pers = derivePlayerPersonality(player, isInXI);
  const compStats = player.competitionStats || {};
  const iplSeasonsMap = compStats.iplSeasons || {};
  const intlSeasonsMap = compStats.internationalSeasons || {};

  const availableSeasons = Array.from(
    new Set([
      activeSeasonKey,
      ...Object.keys(iplSeasonsMap),
      ...Object.keys(intlSeasonsMap)
    ])
  ).sort().reverse();

  // Selected IPL & International Stats
  const iplCareerStats: PlayerStats = compStats.ipl || player.stats;
  const iplSeasonStats: PlayerStats | undefined = iplSeasonsMap[selectedSeasonKey];

  const intlCareerStats: PlayerStats | undefined = compStats.international;
  const intlSeasonStats: PlayerStats | undefined = intlSeasonsMap[selectedSeasonKey];

  const recentPerformances = compStats.recentPerformances || [];

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-[#0b101c] border border-slate-800 rounded-3xl w-full max-w-lg max-h-[92vh] shadow-2xl flex flex-col overflow-hidden text-white">
        
        {/* HEADER & IDENTITY BANNER */}
        <div className="p-4 bg-[#121927] border-b border-slate-800 shrink-0">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-400 text-black font-black font-mono text-base flex items-center justify-center shadow-lg shadow-amber-500/20">
                #{player.jerseyNumber || 10}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black font-display leading-tight">
                    {player.name}
                  </h2>
                  {player.isOverseas && (
                    <span className="text-xs text-cyan-400" title="Overseas Player">✈️</span>
                  )}
                  {(isCaptain || player.isCaptain) && (
                    <span className="px-1.5 py-0.5 text-[9px] font-mono bg-amber-500/20 text-amber-300 rounded font-bold border border-amber-500/30">
                      ★ CAPTAIN
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  {player.primaryRole || player.role} · {player.country} · {player.age}y
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onClose();
              }}
              className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Badges & Status Pills */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] font-mono mb-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold border border-slate-700">
                {player.battingHand}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold border border-slate-700">
                {player.bowlingStyle || player.bowlingArm}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                Form: {player.form}
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                Morale: {Math.round(player.morale / 10)}/10
              </span>
              <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                Fit: {player.fitness}%
              </span>
            </div>
          </div>

          {/* PRIMARY TABS: OVERVIEW | CAREER */}
          <div className="grid grid-cols-2 p-1 bg-[#0b101c] rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => { sound.playTap(); setPrimaryTab('OVERVIEW'); }}
              className={`py-2 text-xs font-mono font-bold uppercase rounded-xl transition-all ${
                primaryTab === 'OVERVIEW'
                  ? 'bg-[#f5b82e] text-black shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              OVERVIEW
            </button>
            <button
              type="button"
              onClick={() => { sound.playTap(); setPrimaryTab('CAREER'); }}
              className={`py-2 text-xs font-mono font-bold uppercase rounded-xl transition-all ${
                primaryTab === 'CAREER'
                  ? 'bg-[#f5b82e] text-black shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              CAREER
            </button>
          </div>
        </div>

        {/* TAB BODY (SCROLLABLE) */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          
          {/* ==================== OVERVIEW TAB ==================== */}
          {primaryTab === 'OVERVIEW' && (
            <div className="space-y-3">

              {/* Present Season Summary Tile */}
              <div className="p-3 bg-slate-900/80 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider font-bold flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    PRESENT SEASON SUMMARY ({activeSeasonKey})
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-xs">
                  <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800">
                    <span className="text-[9px] text-slate-400 block uppercase">MAT</span>
                    <span className="font-bold text-white">{iplSeasonStats?.matches ?? player.stats.matches}</span>
                  </div>
                  <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800">
                    <span className="text-[9px] text-slate-400 block uppercase">RUNS</span>
                    <span className="font-bold text-amber-400">{iplSeasonStats?.runs ?? player.stats.runs}</span>
                  </div>
                  <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800">
                    <span className="text-[9px] text-slate-400 block uppercase">WKTS</span>
                    <span className="font-bold text-emerald-400">{iplSeasonStats?.wickets ?? player.stats.wickets}</span>
                  </div>
                  <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800">
                    <span className="text-[9px] text-slate-400 block uppercase">BEST</span>
                    <span className="font-bold text-cyan-400">{iplSeasonStats?.bestBowling || player.stats.bestBowling || '-'}</span>
                  </div>
                </div>
              </div>

              {/* Batting Attributes Grid */}
              <div className="p-3 bg-slate-900/60 rounded-2xl border border-slate-800">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-2 font-bold">
                  BATTING ATTRIBUTES
                </span>
                <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-xs">
                  <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">BAT</span>
                    <span className="font-bold text-white">{player.ratings.bat}</span>
                  </div>
                  <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">POW</span>
                    <span className="font-bold text-amber-400">{player.ratings.pow}</span>
                  </div>
                  <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">TEC</span>
                    <span className="font-bold text-cyan-400">{player.ratings.tec ?? player.ratings.ctrl}</span>
                  </div>
                  <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">TMP</span>
                    <span className="font-bold text-slate-200">{player.ratings.tmp}</span>
                  </div>
                  <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">AGG</span>
                    <span className="font-bold text-amber-300">{player.ratings.agg ?? 75}</span>
                  </div>
                  <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">STY</span>
                    <span className="font-bold text-purple-300">{player.ratings.sty ?? 75}</span>
                  </div>
                  <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">vP</span>
                    <span className="font-bold text-emerald-400">{player.ratings.vp ?? 75}</span>
                  </div>
                  <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">vS</span>
                    <span className="font-bold text-blue-400">{player.ratings.vs ?? 75}</span>
                  </div>
                </div>
              </div>

              {/* Bowling & Fielding Attributes Grid */}
              <div className="p-3 bg-slate-900/60 rounded-2xl border border-slate-800">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-2 font-bold">
                  BOWLING & FIELDING ATTRIBUTES
                </span>
                <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-xs">
                  <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">BOWL</span>
                    <span className="font-bold text-emerald-400">{player.ratings.bowl}</span>
                  </div>
                  <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">PAC</span>
                    <span className="font-bold text-cyan-400">{player.ratings.pace}</span>
                  </div>
                  <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">CTR</span>
                    <span className="font-bold text-blue-400">{player.ratings.ctrl}</span>
                  </div>
                  <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">DTH</span>
                    <span className="font-bold text-rose-400">{player.ratings.dth}</span>
                  </div>
                  <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">VAR</span>
                    <span className="font-bold text-amber-300">{player.ratings.var ?? 75}</span>
                  </div>
                  <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">COMP</span>
                    <span className="font-bold text-teal-300">{player.ratings.comp ?? 75}</span>
                  </div>
                  <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">CAT</span>
                    <span className="font-bold text-amber-400">{player.ratings.cat}</span>
                  </div>
                  <div className="p-1.5 bg-[#141d2f] rounded-lg border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">FIT</span>
                    <span className="font-bold text-emerald-300">{player.ratings.fit ?? player.fitness}</span>
                  </div>
                </div>
              </div>

              {/* Personality & Dressing Room Impact */}
              <div className="p-3 bg-slate-900/80 rounded-2xl border border-purple-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-purple-300 uppercase tracking-wider font-bold">
                    PERSONALITY · {pers.archetype.toUpperCase()}
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                    pers.dressingRoomStatus === 'Thriving'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : pers.dressingRoomStatus === 'Content'
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'bg-rose-500/20 text-rose-300'
                  }`}>
                    {pers.dressingRoomStatus} ({pers.playingTimeExpectation})
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-[11px]">
                  <div className="p-1.5 rounded-lg bg-[#141d2f] border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">LEADERSHIP</span>
                    <span className="font-bold text-amber-400">{pers.leadershipScore}</span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-[#141d2f] border border-slate-800">
                    <span className="text-[9px] text-slate-400 block">WORK ETHIC</span>
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

              {/* Recent Performances Log */}
              <div className="p-3 bg-slate-900/60 rounded-2xl border border-slate-800">
                <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider block mb-2 font-bold flex items-center gap-1.5">
                  <Activity className="w-3 h-3" />
                  RECENT MATCH PERFORMANCES
                </span>

                {recentPerformances.length > 0 ? (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {recentPerformances.map((perf, idx) => (
                      <div key={idx} className="p-2 bg-[#121927] rounded-xl border border-slate-800 flex items-center justify-between text-xs font-mono">
                        <div>
                          <span className="font-bold text-white block">vs {perf.opponent}</span>
                          <span className="text-[9px] text-slate-400 uppercase">{perf.competition} · {perf.dateStr}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-amber-300 block">
                            {perf.runs !== undefined ? `${perf.runs} (${perf.balls || 0}b)` : 'DNB'}
                          </span>
                          <span className="text-[9px] text-emerald-400 block">
                            {perf.wickets !== undefined && perf.wickets > 0 ? `${perf.wickets} wkt (${perf.overs || 0}ov)` : ''}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-3 text-xs text-slate-400 font-mono">
                    No recent match performances recorded in this session.
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ==================== CAREER TAB ==================== */}
          {primaryTab === 'CAREER' && (
            <div className="space-y-4">

              {/* Secondary Competition Tabs + Career/Season Filter Bar */}
              <div className="space-y-2 p-3 bg-slate-900/80 rounded-2xl border border-slate-800">
                
                {/* Secondary Competition Tabs */}
                <div className="grid grid-cols-2 p-1 bg-[#121927] rounded-xl border border-slate-800 text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => { sound.playTap(); setCompetitionTab('IPL'); }}
                    className={`py-1.5 font-bold uppercase rounded-lg transition-all ${
                      competitionTab === 'IPL'
                        ? 'bg-amber-400 text-black shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    IPL
                  </button>
                  <button
                    type="button"
                    onClick={() => { sound.playTap(); setCompetitionTab('INTERNATIONAL'); }}
                    className={`py-1.5 font-bold uppercase rounded-lg transition-all ${
                      competitionTab === 'INTERNATIONAL'
                        ? 'bg-cyan-400 text-black shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    INTERNATIONAL
                  </button>
                </div>

                {/* Filter Switcher: CAREER | SEASON */}
                <div className="flex items-center justify-between gap-2 pt-1 font-mono text-xs">
                  <div className="flex items-center p-0.5 bg-[#121927] rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => { sound.playTap(); setCareerFilter('CAREER'); }}
                      className={`px-3 py-1 font-bold uppercase rounded-lg transition-all ${
                        careerFilter === 'CAREER'
                          ? 'bg-slate-800 text-amber-300 border border-amber-400/30'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      CAREER
                    </button>
                    <button
                      type="button"
                      onClick={() => { sound.playTap(); setCareerFilter('SEASON'); }}
                      className={`px-3 py-1 font-bold uppercase rounded-lg transition-all ${
                        careerFilter === 'SEASON'
                          ? 'bg-slate-800 text-amber-300 border border-amber-400/30'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      SEASON
                    </button>
                  </div>

                  {/* Season Dropdown (Active when SEASON is selected) */}
                  {careerFilter === 'SEASON' && (
                    <select
                      value={selectedSeasonKey}
                      onChange={(e) => { sound.playTap(); setSelectedSeasonKey(e.target.value); }}
                      className="bg-[#121927] border border-slate-700 text-amber-300 font-bold text-xs rounded-xl px-2.5 py-1 focus:outline-none focus:border-amber-400"
                    >
                      {availableSeasons.map(sKey => (
                        <option key={sKey} value={sKey}>
                          {sKey}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* IPL CONTENT */}
              {competitionTab === 'IPL' && (
                <div className="space-y-3">
                  {careerFilter === 'CAREER' ? (
                    <PlayerCareerStatsCard
                      player={player}
                      customStats={iplCareerStats}
                      showTitle={true}
                      titleOverride="IPL CAREER CUMULATIVE STATS"
                    />
                  ) : (
                    iplSeasonStats && iplSeasonStats.matches > 0 ? (
                      <PlayerCareerStatsCard
                        player={player}
                        customStats={iplSeasonStats}
                        showTitle={true}
                        titleOverride={`IPL SEASON STATS (${selectedSeasonKey})`}
                      />
                    ) : (
                      <div className="p-6 bg-slate-900/60 rounded-2xl border border-slate-800 text-center font-mono">
                        <Trophy className="w-8 h-8 text-amber-400/40 mx-auto mb-2" />
                        <div className="text-sm font-bold text-slate-300">
                          No IPL match statistics recorded for {selectedSeasonKey} yet.
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Play or simulate IPL matches in this season to build records.
                        </div>
                      </div>
                    )
                  )}

                  {/* Season-by-Season History Table */}
                  {Object.keys(iplSeasonsMap).length > 0 && (
                    <div className="p-3 bg-slate-900/80 rounded-2xl border border-slate-800">
                      <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider block mb-2 font-bold">
                        IPL SEASON-BY-SEASON HISTORY
                      </span>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left font-mono text-xs">
                          <thead>
                            <tr className="text-[9px] text-slate-400 border-b border-slate-800 uppercase">
                              <th className="pb-1.5 font-normal">SEASON</th>
                              <th className="pb-1.5 font-normal text-center">MAT</th>
                              <th className="pb-1.5 font-normal text-right">RUNS</th>
                              <th className="pb-1.5 font-normal text-right">AVG</th>
                              <th className="pb-1.5 font-normal text-right">WKTS</th>
                              <th className="pb-1.5 font-normal text-right">ECON</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {Object.entries(iplSeasonsMap).map(([sKey, sStats]) => {
                              const bSt = getBattingStats(sStats);
                              const bwSt = getBowlingStats(sStats);
                              return (
                                <tr key={sKey} className="hover:bg-slate-800/40">
                                  <td className="py-2 font-bold text-amber-300">{sKey}</td>
                                  <td className="py-2 text-center text-white">{bSt.matches}</td>
                                  <td className="py-2 text-right font-bold text-amber-400">{bSt.runs}</td>
                                  <td className="py-2 text-right text-emerald-400">{bSt.average}</td>
                                  <td className="py-2 text-right font-bold text-emerald-300">{bwSt.wickets}</td>
                                  <td className="py-2 text-right text-cyan-300">{bwSt.economy}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* INTERNATIONAL CONTENT */}
              {competitionTab === 'INTERNATIONAL' && (
                <div className="space-y-3">
                  {careerFilter === 'CAREER' ? (
                    intlCareerStats && intlCareerStats.matches > 0 ? (
                      <PlayerCareerStatsCard
                        player={player}
                        customStats={intlCareerStats}
                        showTitle={true}
                        titleOverride="INTERNATIONAL CAREER CUMULATIVE STATS"
                      />
                    ) : (
                      <div className="p-8 bg-slate-900/60 rounded-2xl border border-slate-800 text-center font-mono">
                        <Award className="w-10 h-10 text-cyan-400/40 mx-auto mb-2" />
                        <div className="text-sm font-bold text-slate-200">
                          No international career records available yet.
                        </div>
                        <div className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                          Player has not participated in official international matches or international tours yet.
                        </div>
                      </div>
                    )
                  ) : (
                    intlSeasonStats && intlSeasonStats.matches > 0 ? (
                      <PlayerCareerStatsCard
                        player={player}
                        customStats={intlSeasonStats}
                        showTitle={true}
                        titleOverride={`INTERNATIONAL SEASON STATS (${selectedSeasonKey})`}
                      />
                    ) : (
                      <div className="p-8 bg-slate-900/60 rounded-2xl border border-slate-800 text-center font-mono">
                        <Award className="w-10 h-10 text-cyan-400/40 mx-auto mb-2" />
                        <div className="text-sm font-bold text-slate-200">
                          No international career records available for {selectedSeasonKey} yet.
                        </div>
                        <div className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                          No international fixtures played in this season.
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}

            </div>
          )}

        </div>

        {/* FOOTER ACTIONS */}
        <div className="p-4 bg-[#121927] border-t border-slate-800 shrink-0 grid grid-cols-2 gap-2">
          {onMakeCaptain ? (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onMakeCaptain(player.id);
              }}
              disabled={isCaptain || player.isCaptain}
              className={`py-3 font-black text-xs uppercase rounded-xl tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                isCaptain || player.isCaptain
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-default'
                  : 'bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-400/40 active:scale-95'
              }`}
            >
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>
                {isCaptain || player.isCaptain
                  ? 'TEAM CAPTAIN (★)'
                  : 'MAKE CAPTAIN (★)'}
              </span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={() => {
              sound.playTap();
              onClose();
            }}
            className="py-3 bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase rounded-xl tracking-wider transition-all"
          >
            DONE
          </button>
        </div>

      </div>
    </div>
  );
};
