import React from 'react';
import { Player, PlayerStats } from '../../types/cricket';
import {
  getRoleDisciplines,
  getBattingStats,
  getBowlingStats,
  getKeepingStats
} from '../../utils/playerStatsHelpers';

interface PlayerCareerStatsCardProps {
  player: Player;
  customStats?: PlayerStats;
  className?: string;
  showTitle?: boolean;
  titleOverride?: string;
}

export const PlayerCareerStatsCard: React.FC<PlayerCareerStatsCardProps> = ({
  player,
  customStats,
  className = '',
  showTitle = true,
  titleOverride
}) => {
  const disciplines = getRoleDisciplines(player);
  const targetStats = customStats || player.stats;
  const batting = getBattingStats(targetStats);
  const bowling = getBowlingStats(targetStats);
  const keeping = getKeepingStats(targetStats, player.role);

  return (
    <div className={`space-y-3 ${className}`}>
      {showTitle && (
        <div className="flex items-center justify-between pb-1 border-b border-slate-800/80">
          <span className="text-[11px] font-mono text-amber-400 uppercase tracking-wider font-bold">
            {titleOverride || 'STATISTICS SUMMARY'}
          </span>
          <span className="text-[10px] font-mono text-slate-400 uppercase">
            {player.role}
          </span>
        </div>
      )}

      {/* BATTING CAREER CARD */}
      {disciplines.showBatting && (
        <div className="p-3 bg-slate-900/80 rounded-2xl border border-slate-800/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              BATTING CAREER
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {batting.hasBatted ? `${batting.runs} Runs` : 'No Batting Data'}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 text-center font-mono">
            <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800/80">
              <span className="text-[9px] text-slate-400 block uppercase">MAT</span>
              <span className="font-bold text-white text-xs">{batting.matches}</span>
            </div>
            <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800/80">
              <span className="text-[9px] text-slate-400 block uppercase">INN</span>
              <span className="font-bold text-slate-200 text-xs">{batting.innings}</span>
            </div>
            <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800/80">
              <span className="text-[9px] text-slate-400 block uppercase">RUNS</span>
              <span className="font-bold text-amber-400 text-xs">{batting.runs}</span>
            </div>
            <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800/80">
              <span className="text-[9px] text-slate-400 block uppercase">HS</span>
              <span className="font-bold text-white text-xs">{batting.highestScore}</span>
            </div>

            <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800/80">
              <span className="text-[9px] text-slate-400 block uppercase">AVG</span>
              <span className="font-bold text-emerald-400 text-xs">{batting.average}</span>
            </div>
            <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800/80">
              <span className="text-[9px] text-slate-400 block uppercase">S/R</span>
              <span className="font-bold text-cyan-400 text-xs">{batting.strikeRate}</span>
            </div>
            <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800/80">
              <span className="text-[9px] text-slate-400 block uppercase">BALLS</span>
              <span className="font-bold text-slate-300 text-xs">{batting.balls}</span>
            </div>
            <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800/80">
              <span className="text-[9px] text-slate-400 block uppercase">4s / 6s</span>
              <span className="font-bold text-slate-200 text-xs">{batting.fours !== '-' || batting.sixes !== '-' ? `${batting.fours}/${batting.sixes}` : '-'}</span>
            </div>

            <div className="col-span-2 p-1.5 bg-[#121927] rounded-xl border border-slate-800/80 flex items-center justify-around">
              <div>
                <span className="text-[9px] text-slate-400 block uppercase">50s</span>
                <span className="font-bold text-amber-300 text-xs">{batting.fifties}</span>
              </div>
              <div className="w-px h-6 bg-slate-800"></div>
              <div>
                <span className="text-[9px] text-slate-400 block uppercase">100s</span>
                <span className="font-bold text-amber-400 text-xs">{batting.hundreds}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BOWLING CAREER CARD */}
      {disciplines.showBowling && (
        <div className="p-3 bg-slate-900/80 rounded-2xl border border-slate-800/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
              BOWLING CAREER
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {bowling.hasBowled ? `${bowling.wickets} Wkts (${bowling.overs} Ov)` : 'No Bowling Data'}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 text-center font-mono">
            <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800/80">
              <span className="text-[9px] text-slate-400 block uppercase">MAT</span>
              <span className="font-bold text-white text-xs">{bowling.matches}</span>
            </div>
            <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800/80">
              <span className="text-[9px] text-slate-400 block uppercase">INN</span>
              <span className="font-bold text-slate-200 text-xs">{bowling.inningsBowled}</span>
            </div>
            <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800/80">
              <span className="text-[9px] text-slate-400 block uppercase">OVERS</span>
              <span className="font-bold text-cyan-300 text-xs">{bowling.overs}</span>
            </div>
            <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800/80">
              <span className="text-[9px] text-slate-400 block uppercase">MAIDENS</span>
              <span className="font-bold text-teal-300 text-xs">{bowling.maidens}</span>
            </div>

            <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800/80">
              <span className="text-[9px] text-slate-400 block uppercase">RUNS</span>
              <span className="font-bold text-slate-300 text-xs">{bowling.runsConceded}</span>
            </div>
            <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800/80">
              <span className="text-[9px] text-slate-400 block uppercase">WKTS</span>
              <span className="font-bold text-emerald-400 text-xs">{bowling.wickets}</span>
            </div>
            <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800/80">
              <span className="text-[9px] text-slate-400 block uppercase">BBI</span>
              <span className="font-bold text-cyan-400 text-xs">{bowling.bestBowling}</span>
            </div>
            <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800/80">
              <span className="text-[9px] text-slate-400 block uppercase">ECON</span>
              <span className="font-bold text-amber-300 text-xs">{bowling.economy}</span>
            </div>

            <div className="col-span-2 p-1.5 bg-[#121927] rounded-xl border border-slate-800/80 flex items-center justify-around">
              <div>
                <span className="text-[9px] text-slate-400 block uppercase">AVG</span>
                <span className="font-bold text-emerald-300 text-xs">{bowling.average}</span>
              </div>
              <div className="w-px h-6 bg-slate-800"></div>
              <div>
                <span className="text-[9px] text-slate-400 block uppercase">S/R</span>
                <span className="font-bold text-blue-300 text-xs">{bowling.strikeRate}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WICKETKEEPING CAREER CARD */}
      {disciplines.showKeeping && (
        <div className="p-3 bg-slate-900/80 rounded-2xl border border-slate-800/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-purple-400 uppercase tracking-wider font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
              WICKETKEEPING CAREER
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {keeping.hasKept ? `${keeping.totalDismissals} Dismissals` : 'No Keeping Data'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-center font-mono">
            <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800/80">
              <span className="text-[9px] text-slate-400 block uppercase">CATCHES</span>
              <span className="font-bold text-amber-300 text-xs">{keeping.catches}</span>
            </div>
            <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800/80">
              <span className="text-[9px] text-slate-400 block uppercase">STUMPINGS</span>
              <span className="font-bold text-purple-300 text-xs">{keeping.stumpings}</span>
            </div>
            <div className="p-1.5 bg-[#121927] rounded-xl border border-slate-800/80">
              <span className="text-[9px] text-slate-400 block uppercase">DISMISSALS</span>
              <span className="font-bold text-white text-xs">{keeping.totalDismissals}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
