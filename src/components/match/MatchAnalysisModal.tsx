import React, { useState } from 'react';
import { X, BarChart3 } from 'lucide-react';
import { MatchLiveState, InningsData } from '../../types/cricket';
import { resolveKitColor } from './TacticalStadium2D';
import { sound } from '../../utils/soundEffects';
import { calculateBowlingEconomy, formatOversDisplay } from '../../utils/bowlingStats';

interface MatchAnalysisModalProps {
  matchState: MatchLiveState;
  onClose: () => void;
}

export const MatchAnalysisModal: React.FC<MatchAnalysisModalProps> = ({ matchState, onClose }) => {
  const [viewMode, setViewMode] = useState<'scorecard' | 'easy' | 'graphs'>('scorecard');
  const [graphTab, setGraphTab] = useState<'manhattan' | 'worm' | 'wagon'>('manhattan');
  const [wagonInnings, setWagonInnings] = useState<1 | 2>(
    matchState.innings2 ? (matchState.currentInningsIndex as 1 | 2) : 1
  );
  const [wagonFilter, setWagonFilter] = useState<'all' | '1-3' | '4s' | '6s'>('all');
  const [selectedBatterId, setSelectedBatterId] = useState<string>('all');

  const inn1Team =
    matchState.homeTeam.id === matchState.innings1.battingTeamId
      ? matchState.homeTeam
      : matchState.awayTeam;
  const inn2Team =
    matchState.homeTeam.id === matchState.innings1.bowlingTeamId
      ? matchState.homeTeam
      : matchState.awayTeam;

  const inn1Color = resolveKitColor(inn1Team.shortName, inn1Team.primaryColor, '#7c3aed');
  const inn2Color = resolveKitColor(inn2Team.shortName, inn2Team.primaryColor, '#ef4444');

  const displayShort = (s?: string) => (s === 'PBKS' ? 'PUN' : s || 'TEAM');

  const renderInningsScorecard = (inn: InningsData, innNum: 1 | 2) => {
    const batTeam =
      matchState.homeTeam.id === inn.battingTeamId ? matchState.homeTeam : matchState.awayTeam;
    const kitHex = resolveKitColor(batTeam.shortName, batTeam.primaryColor, innNum === 1 ? '#7c3aed' : '#ef4444');
    const oversStr = `${Math.floor(inn.ballsCompleted / 6)}.${inn.ballsCompleted % 6}`;
    const rr = inn.ballsCompleted > 0 ? ((inn.runs / inn.ballsCompleted) * 6).toFixed(2) : '0.00';

    const activeBatters = inn.batters.filter(
      (b) => b.balls > 0 || b.runs > 0 || b.dismissal !== 'not out' || b.isOnStrike || b.playerId === inn.currentStrikerId || b.playerId === inn.currentNonStrikerId
    );
    const didNotBat = inn.batters.filter((b) => !activeBatters.some((ab) => ab.playerId === b.playerId));

    return (
      <div key={innNum} className="mb-5 rounded-2xl bg-[#0e1525] border border-slate-800/90 overflow-hidden shadow-lg">
        {/* Innings Header Strip */}
        <div
          className="px-3.5 py-2.5 flex items-center justify-between border-b border-slate-800"
          style={{ background: `linear-gradient(90deg, ${kitHex}28 0%, rgba(15,23,42,0.95) 100%)` }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: kitHex }}
            />
            <span className="text-xs font-black text-white uppercase tracking-wide font-display">
              {batTeam.city || batTeam.name} · {innNum === 1 ? '1st Innings' : '2nd Innings'}
            </span>
          </div>
          <div className="font-mono text-right">
            <span className="text-sm font-black text-white">
              {inn.runs}/{inn.wickets}
            </span>
            <span className="text-[11px] text-slate-400 ml-1">({oversStr})</span>
          </div>
        </div>

        {/* Batting Table (Exact columns from Video 1 at 0:30: BATTER | R | B | 4s | 6s | SR) */}
        <div className="grid grid-cols-12 px-3 py-1.5 bg-[#0a101d] text-[10px] font-mono font-bold text-slate-400 border-b border-slate-800/80 uppercase">
          <span className="col-span-5">BATTER</span>
          <span className="col-span-1 text-right">R</span>
          <span className="col-span-2 text-right">B</span>
          <span className="col-span-1 text-right">4s</span>
          <span className="col-span-1 text-right">6s</span>
          <span className="col-span-2 text-right">SR</span>
        </div>

        <div className="divide-y divide-slate-800/50 text-xs">
          {activeBatters.map((b) => {
            const isAtCrease =
              b.dismissal === 'not out' &&
              (b.playerId === inn.currentStrikerId || b.playerId === inn.currentNonStrikerId || b.isOnStrike);
            const srVal = b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(0) : '0';
            return (
              <div
                key={b.playerId}
                className={`grid grid-cols-12 px-3 py-2 items-center ${
                  isAtCrease ? 'bg-amber-500/10' : ''
                }`}
              >
                <div className="col-span-5 min-w-0 pr-1">
                  <div className="font-bold text-white truncate flex items-center gap-1">
                    <span className="truncate">{b.name}</span>
                    {isAtCrease && <span className="text-amber-400 font-black">*</span>}
                  </div>
                  <span
                    className={`text-[10px] block truncate ${
                      b.dismissal === 'not out' ? 'text-emerald-400 font-semibold' : 'text-slate-400'
                    }`}
                  >
                    {b.dismissal}
                  </span>
                </div>
                <span className="col-span-1 text-right font-mono font-black text-white">{b.runs}</span>
                <span className="col-span-2 text-right font-mono text-slate-400">{b.balls}</span>
                <span className="col-span-1 text-right font-mono text-slate-300">{b.fours}</span>
                <span className="col-span-1 text-right font-mono text-amber-400 font-bold">{b.sixes}</span>
                <span className="col-span-2 text-right font-mono text-slate-300">{srVal}</span>
              </div>
            );
          })}
        </div>

        {/* Extras & Total Footer */}
        <div className="px-3 py-2 bg-[#0b111e] border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
          <span className="text-slate-400">
            Extras: <strong className="text-slate-200">{Math.max(0, inn.runs - inn.batters.reduce((s, b) => s + b.runs, 0))}</strong>
          </span>
          <span className="text-slate-300">
            Total: <strong className="text-white">{inn.runs}/{inn.wickets}</strong> ({oversStr} ov · RR {rr})
          </span>
        </div>

        {didNotBat.length > 0 && (
          <div className="px-3 py-1.5 bg-[#090e19] border-t border-slate-800/60 text-[10px] text-slate-400">
            <span className="font-mono font-bold text-slate-500 uppercase mr-1">Yet to bat:</span>
            {didNotBat.map((b) => b.name.split(' ').pop()).join(', ')}
          </div>
        )}

        {/* Bowling Table (BOWLER | O | M | R | W | ECON) */}
        <div className="grid grid-cols-12 px-3 py-1.5 bg-[#0a101d] text-[10px] font-mono font-bold text-slate-400 border-y border-slate-800/80 uppercase mt-1">
          <span className="col-span-5">BOWLER</span>
          <span className="col-span-1 text-right">O</span>
          <span className="col-span-1 text-right">M</span>
          <span className="col-span-2 text-right">R</span>
          <span className="col-span-1 text-right">W</span>
          <span className="col-span-2 text-right">ECON</span>
        </div>

        <div className="divide-y divide-slate-800/50 text-xs">
          {inn.bowlers.map((bw) => {
            const econStr = calculateBowlingEconomy(bw.runs, bw.overs).toFixed(2);
            const oversDisplay = formatOversDisplay(bw.overs, false, true);
            return (
              <div key={bw.playerId} className="grid grid-cols-12 px-3 py-2 items-center">
                <span className="col-span-5 font-bold text-white truncate pr-1">{bw.name}</span>
                <span className="col-span-1 text-right font-mono text-slate-300">{oversDisplay}</span>
                <span className="col-span-1 text-right font-mono text-slate-400">{bw.maidens || 0}</span>
                <span className="col-span-2 text-right font-mono text-slate-200">{bw.runs}</span>
                <span className="col-span-1 text-right font-mono font-black text-amber-400">{bw.wickets}</span>
                <span className="col-span-2 text-right font-mono text-slate-300">{econStr}</span>
              </div>
            );
          })}
        </div>

        {/* Fall of Wickets (Exact match to Video 1 at 0:36) */}
        {inn.fallOfWickets && inn.fallOfWickets.length > 0 && (
          <div className="px-3 py-2.5 bg-[#090e19] border-t border-slate-800/80">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block mb-1.5">
              FALL OF WICKETS
            </span>
            <div className="flex flex-wrap gap-1.5">
              {inn.fallOfWickets.map((fow, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-md bg-[#131c2e] border border-slate-800 text-[10px] font-mono text-slate-300"
                >
                  <strong className="text-white">{fow.runs}-{fow.wicketNum}</strong> ({fow.batterName.split(' ').pop()}, {fow.over})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Wagon wheel active innings data
  const activeWagonInnings =
    wagonInnings === 2 && matchState.innings2 ? matchState.innings2 : matchState.innings1;
  const allWagonShots = activeWagonInnings.ballHistory.filter((b) => {
    if (b.runs <= 0 && !b.isWicket) return false;
    if (selectedBatterId !== 'all' && b.strikerId !== selectedBatterId) return false;
    if (wagonFilter === '1-3') return b.runs >= 1 && b.runs <= 3 && !b.isFour && !b.isSix;
    if (wagonFilter === '4s') return b.isFour;
    if (wagonFilter === '6s') return b.isSix;
    return true;
  });

  const onesToThrees = activeWagonInnings.ballHistory.filter(
    (b) =>
      (selectedBatterId === 'all' || b.strikerId === selectedBatterId) &&
      b.runs >= 1 &&
      b.runs <= 3 &&
      !b.isFour &&
      !b.isSix
  ).length;
  const foursCount = activeWagonInnings.ballHistory.filter(
    (b) => (selectedBatterId === 'all' || b.strikerId === selectedBatterId) && b.isFour
  ).length;
  const sixesCount = activeWagonInnings.ballHistory.filter(
    (b) => (selectedBatterId === 'all' || b.strikerId === selectedBatterId) && b.isSix
  ).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center">
      <div className="bg-[#080d18] border-t border-slate-800 rounded-t-3xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Top Handle */}
        <div className="pt-2.5 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-slate-700" />
        </div>

        {/* ========================================================= */}
        {/* MODE A: SCORECARD | EASY SHEET (Video 1 at 0:28 - 0:45)   */}
        {/* ========================================================= */}
        {viewMode !== 'graphs' ? (
          <>
            {/* Top Segmented Toggle: SCORECARD | EASY */}
            <div className="px-4 py-2 border-b border-slate-800/80 flex items-center justify-between gap-2">
              <div className="flex-1 grid grid-cols-2 gap-1.5 bg-[#121927] p-1 rounded-xl">
                <button
                  onClick={() => {
                    sound.playTap();
                    setViewMode('scorecard');
                  }}
                  className={`py-2 rounded-lg font-mono font-black text-xs uppercase transition-all ${
                    viewMode === 'scorecard'
                      ? 'bg-[#f5b82e] text-black shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  SCORECARD
                </button>
                <button
                  onClick={() => {
                    sound.playTap();
                    setViewMode('easy');
                  }}
                  className={`py-2 rounded-lg font-mono font-black text-xs uppercase transition-all ${
                    viewMode === 'easy'
                      ? 'bg-[#f5b82e] text-black shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  EASY
                </button>
              </div>
              <button
                onClick={() => {
                  sound.playTap();
                  onClose();
                }}
                className="p-2 text-slate-400 hover:text-white rounded-xl bg-[#121927] border border-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4">
              {viewMode === 'scorecard' ? (
                <>
                  {matchState.innings2 && renderInningsScorecard(matchState.innings2, 2)}
                  {renderInningsScorecard(matchState.innings1, 1)}
                </>
              ) : (
                /* EASY DIGEST VIEW */
                <div className="flex flex-col gap-3">
                  {[
                    ...(matchState.innings2 ? [{ inn: matchState.innings2, num: 2 as const }] : []),
                    { inn: matchState.innings1, num: 1 as const },
                  ].map(({ inn, num }) => {
                    const batTeam =
                      matchState.homeTeam.id === inn.battingTeamId
                        ? matchState.homeTeam
                        : matchState.awayTeam;
                    const topBatters = [...inn.batters]
                      .filter((b) => b.balls > 0 || b.runs > 0)
                      .sort((a, b) => b.runs - a.runs)
                      .slice(0, 3);
                    const topBowlers = [...inn.bowlers]
                      .filter((b) => b.overs > 0)
                      .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)
                      .slice(0, 3);

                    return (
                      <div
                        key={num}
                        className="p-3.5 rounded-2xl bg-[#0e1525] border border-slate-800 flex flex-col gap-2.5"
                      >
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <span className="text-xs font-black text-white uppercase font-display">
                            {batTeam.name} ({num === 1 ? '1st Inn' : '2nd Inn'})
                          </span>
                          <span className="text-sm font-mono font-black text-amber-400">
                            {inn.runs}/{inn.wickets} ({Math.floor(inn.ballsCompleted / 6)}.{inn.ballsCompleted % 6})
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-[10px] font-mono text-slate-400 uppercase block mb-1 font-bold">
                              TOP BATTERS
                            </span>
                            {topBatters.length === 0 ? (
                              <span className="text-[11px] text-slate-500">Yet to bat</span>
                            ) : (
                              topBatters.map((tb) => (
                                <div key={tb.playerId} className="flex justify-between py-0.5 font-mono text-[11px]">
                                  <span className="text-white truncate pr-1">{tb.name.split(' ').pop()}</span>
                                  <span className="text-amber-300 font-bold">
                                    {tb.runs} ({tb.balls})
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                          <div>
                            <span className="text-[10px] font-mono text-slate-400 uppercase block mb-1 font-bold">
                              BEST BOWLERS
                            </span>
                            {topBowlers.length === 0 ? (
                              <span className="text-[11px] text-slate-500">No overs bowled</span>
                            ) : (
                              topBowlers.map((bw) => (
                                <div key={bw.playerId} className="flex justify-between py-0.5 font-mono text-[11px]">
                                  <span className="text-white truncate pr-1">{bw.name.split(' ').pop()}</span>
                                  <span className="text-cyan-300 font-bold">
                                    {bw.wickets}-{bw.runs} ({bw.overs})
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom Sticky Bar: 📊 GRAPHS + RESUME MATCH (Exact match to Video 1 at 0:30) */}
            <div className="p-3.5 bg-[#0b101c] border-t border-slate-800 flex items-center gap-2.5">
              <button
                onClick={() => {
                  sound.playTap();
                  setViewMode('graphs');
                }}
                className="px-4 py-3.5 rounded-2xl bg-[#141d2c] hover:bg-[#1e293b] border border-slate-700 text-white font-mono font-bold text-xs uppercase flex items-center gap-2 active:scale-95 transition-all"
              >
                <BarChart3 className="w-4 h-4 text-amber-400" />
                GRAPHS
              </button>
              <button
                onClick={() => {
                  sound.playTap();
                  onClose();
                }}
                className="flex-1 py-3.5 rounded-2xl bg-[#f5b82e] hover:bg-[#eab308] text-black font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 active:scale-98 transition-all"
              >
                RESUME MATCH
              </button>
            </div>
          </>
        ) : (
          /* ========================================================= */
          /* MODE B: MATCH GRAPHS SHEET (Video 1 at 0:46 - 0:54)       */
          /* ========================================================= */
          <>
            <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
              <span className="text-sm font-black font-display uppercase tracking-wider text-white">
                MATCH GRAPHS
              </span>
              <button
                onClick={() => {
                  sound.playTap();
                  setViewMode('scorecard');
                }}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* MANHATTAN | WORM | WAGON Tabs */}
            <div className="px-4 pt-2.5 pb-1">
              <div className="grid grid-cols-3 gap-1.5 bg-[#121927] p-1 rounded-xl">
                {(['manhattan', 'worm', 'wagon'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      sound.playTap();
                      setGraphTab(t);
                    }}
                    className={`py-1.5 rounded-lg font-mono font-black text-xs uppercase transition-all ${
                      graphTab === t
                        ? 'bg-[#f5b82e] text-black shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Team Legend Strip */}
            <div className="px-4 py-2 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 font-bold text-white">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: inn1Color }} />
                  {displayShort(inn1Team.shortName)} {matchState.innings1.runs}/{matchState.innings1.wickets}
                </span>
                {matchState.innings2 && (
                  <span className="flex items-center gap-1.5 font-bold text-white">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: inn2Color }} />
                    {displayShort(inn2Team.shortName)} {matchState.innings2.runs}/{matchState.innings2.wickets}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <span className="w-3.5 h-3.5 rounded-full bg-white text-black font-black text-[8px] inline-flex items-center justify-center">
                  W
                </span>
                Wicket
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {/* 1. MANHATTAN (Dual-team side-by-side over bars + white W circles) */}
              {graphTab === 'manhattan' && (() => {
                const totalOvers = 20;
                const maxOverRuns = Math.max(
                  20,
                  ...matchState.innings1.overRuns,
                  ...(matchState.innings2?.overRuns || []),
                  1
                );

                return (
                  <div className="bg-[#0d1424] border border-slate-800 rounded-2xl p-3.5">
                    <span className="text-[10px] font-mono text-slate-400 uppercase block mb-2">
                      RUNS PER OVER · W = WICKET
                    </span>
                    <div className="h-56 flex items-end gap-1 pt-6 pb-2 border-b border-slate-800">
                      {Array.from({ length: totalOvers }).map((_, ovIdx) => {
                        const r1 = matchState.innings1.overRuns[ovIdx] || 0;
                        const r2 = matchState.innings2?.overRuns[ovIdx] || 0;
                        const h1 = r1 > 0 ? Math.max(8, (r1 / maxOverRuns) * 100) : 2;
                        const h2 = r2 > 0 ? Math.max(8, (r2 / maxOverRuns) * 100) : 0;

                        const w1 =
                          matchState.innings1.ballHistory.filter((b) => b.over === ovIdx && b.isWicket).length ||
                          matchState.innings1.fallOfWickets.filter((f) => Math.floor(f.over) === ovIdx).length;
                        const w2 =
                          matchState.innings2?.ballHistory.filter((b) => b.over === ovIdx && b.isWicket).length ||
                          matchState.innings2?.fallOfWickets.filter((f) => Math.floor(f.over) === ovIdx).length ||
                          0;

                        return (
                          <div key={ovIdx} className="flex-1 h-full flex flex-col justify-end items-center">
                            <div className="w-full h-full flex items-end justify-center gap-0.5">
                              {/* Innings 1 Bar */}
                              <div className="flex-1 h-full flex flex-col justify-end items-center">
                                {w1 > 0 && (
                                  <span className="w-3 h-3 rounded-full bg-white text-black font-black text-[7px] flex items-center justify-center mb-0.5 shadow">
                                    W
                                  </span>
                                )}
                                <div
                                  style={{ height: `${h1}%`, backgroundColor: inn1Color }}
                                  className="w-full rounded-t-xs transition-all"
                                />
                              </div>
                              {/* Innings 2 Bar */}
                              {matchState.innings2 && (
                                <div className="flex-1 h-full flex flex-col justify-end items-center">
                                  {w2 > 0 && (
                                    <span className="w-3 h-3 rounded-full bg-white text-black font-black text-[7px] flex items-center justify-center mb-0.5 shadow">
                                      W
                                    </span>
                                  )}
                                  <div
                                    style={{ height: `${h2}%`, backgroundColor: inn2Color }}
                                    className="w-full rounded-t-xs transition-all"
                                  />
                                </div>
                              )}
                            </div>
                            <span className="text-[8px] font-mono text-slate-400 mt-1">{ovIdx + 1}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* 2. WORM (Cumulative runs trajectories for both teams) */}
              {graphTab === 'worm' && (() => {
                const maxOversPlot = 20;
                const maxRunsPlot = Math.max(
                  150,
                  matchState.innings1.runs + 15,
                  (matchState.innings2?.runs || 0) + 15
                );
                const toX = (ov: number) => 28 + (Math.min(maxOversPlot, ov) / maxOversPlot) * 254;
                const toY = (runs: number) => 136 - (Math.min(maxRunsPlot, runs) / maxRunsPlot) * 114;

                const buildWorm = (inn: InningsData | null) => {
                  if (!inn) return { pts: '', wkts: [] as { x: number; y: number }[] };
                  const pts: string[] = [`${toX(0).toFixed(1)},${toY(0).toFixed(1)}`];
                  const wkts: { x: number; y: number }[] = [];
                  let cum = 0;
                  if (inn.overRuns.length > 0) {
                    inn.overRuns.forEach((r, idx) => {
                      cum += r || 0;
                      const x = toX(idx + 1);
                      const y = toY(cum);
                      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
                      const hadW =
                        inn.ballHistory.some((b) => b.over === idx && b.isWicket) ||
                        inn.fallOfWickets.some((f) => Math.floor(f.over) === idx);
                      if (hadW) wkts.push({ x, y });
                    });
                  } else if (inn.ballsCompleted > 0) {
                    pts.push(`${toX(inn.ballsCompleted / 6).toFixed(1)},${toY(inn.runs).toFixed(1)}`);
                  }
                  return { pts: pts.join(' '), wkts };
                };

                const w1 = buildWorm(matchState.innings1);
                const w2 = buildWorm(matchState.innings2);

                return (
                  <div className="bg-[#0d1424] border border-slate-800 rounded-2xl p-3.5">
                    <span className="text-[10px] font-mono text-slate-400 uppercase block mb-2">
                      CUMULATIVE RUNS · W = WICKET
                    </span>
                    <div className="h-56 flex items-center justify-center">
                      <svg className="w-full h-full" viewBox="0 0 300 155">
                        {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
                          const val = Math.round(maxRunsPlot * frac);
                          const y = toY(val);
                          return (
                            <g key={i}>
                              <line x1="28" y1={y} x2="282" y2={y} stroke="#1e293b" strokeDasharray="3 3" />
                              <text x="4" y={y + 3} fill="#64748b" fontSize="8" fontFamily="monospace">
                                {val}
                              </text>
                            </g>
                          );
                        })}
                        {[1, 5, 10, 15, 20].map((ov) => (
                          <text
                            key={ov}
                            x={toX(ov) - 4}
                            y="150"
                            fill="#64748b"
                            fontSize="8"
                            fontFamily="monospace"
                          >
                            {ov}
                          </text>
                        ))}
                        {w1.pts && (
                          <polyline
                            points={w1.pts}
                            fill="none"
                            stroke={inn1Color}
                            strokeWidth="2.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                        {w1.wkts.map((pt, idx) => (
                          <circle
                            key={`w1_${idx}`}
                            cx={pt.x}
                            cy={pt.y}
                            r="3.5"
                            fill="#ffffff"
                            stroke={inn1Color}
                            strokeWidth="1.5"
                          />
                        ))}
                        {w2.pts && (
                          <polyline
                            points={w2.pts}
                            fill="none"
                            stroke={inn2Color}
                            strokeWidth="2.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                        {w2.wkts.map((pt, idx) => (
                          <circle
                            key={`w2_${idx}`}
                            cx={pt.x}
                            cy={pt.y}
                            r="3.5"
                            fill="#ffffff"
                            stroke={inn2Color}
                            strokeWidth="1.5"
                          />
                        ))}
                      </svg>
                    </div>
                  </div>
                );
              })()}

              {/* 3. WAGON WHEEL (Exact match to Video 1 at 0:51 with Innings, Shot Type & Batter filters) */}
              {graphTab === 'wagon' && (
                <div className="bg-[#0d1424] border border-slate-800 rounded-2xl p-3.5 flex flex-col items-center gap-3">
                  {/* Innings & Shot Type Filter Row */}
                  <div className="w-full flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1 bg-[#121a2d] p-1 rounded-lg">
                      <button
                        onClick={() => {
                          sound.playTap();
                          setWagonInnings(1);
                          setSelectedBatterId('all');
                        }}
                        className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold ${
                          wagonInnings === 1 ? 'bg-amber-400 text-black' : 'text-slate-400'
                        }`}
                      >
                        {displayShort(inn1Team.shortName)}
                      </button>
                      {matchState.innings2 && (
                        <button
                          onClick={() => {
                            sound.playTap();
                            setWagonInnings(2);
                            setSelectedBatterId('all');
                          }}
                          className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold ${
                            wagonInnings === 2 ? 'bg-amber-400 text-black' : 'text-slate-400'
                          }`}
                        >
                          {displayShort(inn2Team.shortName)}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1 bg-[#121a2d] p-1 rounded-lg text-[10px] font-mono font-bold">
                      {(
                        [
                          { id: 'all', label: 'ALL' },
                          { id: '1-3', label: `1-3 (${onesToThrees})` },
                          { id: '4s', label: `4s (${foursCount})` },
                          { id: '6s', label: `6s (${sixesCount})` },
                        ] as const
                      ).map((f) => (
                        <button
                          key={f.id}
                          onClick={() => {
                            sound.playTap();
                            setWagonFilter(f.id);
                          }}
                          className={`px-2 py-1 rounded ${
                            wagonFilter === f.id ? 'bg-amber-400 text-black' : 'text-slate-400'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Batter Filter Pills */}
                  <div className="w-full flex items-center gap-1.5 overflow-x-auto pb-1">
                    <button
                      onClick={() => {
                        sound.playTap();
                        setSelectedBatterId('all');
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold shrink-0 border ${
                        selectedBatterId === 'all'
                          ? 'bg-amber-400 text-black border-amber-400'
                          : 'bg-[#121a2d] text-slate-300 border-slate-800'
                      }`}
                    >
                      ALL BATTERS
                    </button>
                    {activeWagonInnings.batters
                      .filter((b) => b.balls > 0 || b.runs > 0)
                      .map((b) => (
                        <button
                          key={b.playerId}
                          onClick={() => {
                            sound.playTap();
                            setSelectedBatterId(b.playerId);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold shrink-0 border ${
                            selectedBatterId === b.playerId
                              ? 'bg-amber-400 text-black border-amber-400'
                              : 'bg-[#121a2d] text-slate-300 border-slate-800'
                          }`}
                        >
                          {b.name.split(' ').pop()} {b.runs}({b.balls})
                        </button>
                      ))}
                  </div>

                  {/* Circular Wagon Wheel Turf */}
                  <div className="relative w-60 h-60 rounded-full bg-[#1e5231] border-4 border-[#2d6a4f] shadow-inner flex items-center justify-center overflow-hidden">
                    <div className="w-34 h-34 rounded-full border border-dashed border-white/35 absolute" />
                    <div className="w-5 h-12 bg-[#c8a677] rounded-xs border border-[#9c7b50] z-10" />
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="-100 -100 200 200">
                      {allWagonShots.map((shot, idx) => {
                        const rad = ((shot.shotAngleDeg - 90) * Math.PI) / 180;
                        const dist = Math.min(92, Math.max(18, (shot.shotDistanceM / 85) * 90));
                        const x = Math.cos(rad) * dist;
                        const y = Math.sin(rad) * dist;
                        const stroke = shot.isSix
                          ? '#f59e0b'
                          : shot.isFour
                          ? '#38bdf8'
                          : '#e2e8f0';
                        const width = shot.isSix ? 2.6 : shot.isFour ? 2.0 : 1.2;
                        return (
                          <g key={idx}>
                            <line
                              x1="0"
                              y1="0"
                              x2={x}
                              y2={y}
                              stroke={stroke}
                              strokeWidth={width}
                              strokeLinecap="round"
                            />
                            <circle cx={x} cy={y} r={shot.isSix ? 2.8 : 2} fill={stroke} />
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Sticky Bar in Graphs Mode */}
            <div className="p-3.5 bg-[#0b101c] border-t border-slate-800 flex items-center gap-2.5">
              <button
                onClick={() => {
                  sound.playTap();
                  setViewMode('scorecard');
                }}
                className="px-4 py-3.5 rounded-2xl bg-[#141d2c] border border-slate-700 text-white font-mono font-bold text-xs uppercase"
              >
                ← SCORECARD
              </button>
              <button
                onClick={() => {
                  sound.playTap();
                  onClose();
                }}
                className="flex-1 py-3.5 rounded-2xl bg-[#f5b82e] hover:bg-[#eab308] text-black font-black text-xs uppercase tracking-wider"
              >
                RESUME MATCH
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
