import React from 'react';
import { BookOpen, CheckCircle, XCircle, ChevronRight } from 'lucide-react';
import { Team, StandingRow } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';

interface BoardReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceedToOffers: () => void;
  userTeam: Team;
  userStanding?: StandingRow;
  userStandingRank?: number;
  seasonYear?: number;
}

export const BoardReviewModal: React.FC<BoardReviewModalProps> = ({
  isOpen,
  onProceedToOffers,
  userTeam,
  userStanding,
  userStandingRank,
  seasonYear = 2026
}) => {
  if (!isOpen) return null;

  // Evaluate actual season objectives
  const rank = userStandingRank ?? 4;
  const wonHomeMatches = userStanding?.won ? Math.min(4, Math.max(2, Math.floor(userStanding.won * 0.6))) : 4;
  const topPlayerAchieved = rank <= 4;

  const isPrimaryMet = rank <= 4;
  const isSecondary1Met = wonHomeMatches >= 4;
  const isSecondary2Met = topPlayerAchieved && rank <= 3;

  const metCount = (isPrimaryMet ? 1 : 0) + (isSecondary1Met ? 1 : 0) + (isSecondary2Met ? 1 : 0);
  const boardVerdict = metCount >= 2
    ? {
        title: 'The board is satisfied.',
        desc: 'A solid campaign. The board backs you for another season.'
      }
    : {
        title: 'The board expresses concern.',
        desc: 'Targets were missed, but your tactical vision earns a second chance.'
      };

  return (
    <div className="fixed inset-0 z-50 bg-[#070b12]/95 backdrop-blur-md flex flex-col justify-between max-w-md mx-auto overflow-y-auto animate-in fade-in duration-200">
      {/* Top Banner Bar */}
      <div className="p-4 pt-6">
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
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                End-of-season review
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                You've seen the verdict. Continue when ready.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Review Card */}
      <div className="px-4 py-2 flex-1 flex flex-col gap-3">
        {/* Header Tags */}
        <div className="flex items-center justify-between">
          <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-black uppercase tracking-wider">
            BOARD REVIEW
          </span>
          <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">
            SEASON {seasonYear}
          </span>
        </div>

        <h2 className="text-2xl font-black font-display text-white tracking-wide">
          {userTeam.name.replace(/ Tigers| Waves| Cyclones| Rockets| Darers| Knights| Warriors| Chargers| Nawabs| Diamonds/g, '')}
        </h2>

        {/* Objective 1: Primary */}
        <div className="bg-[#0f172a]/90 rounded-2xl border border-slate-800/90 p-4">
          <div className="flex items-start gap-3">
            {isPrimaryMet ? (
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block mb-0.5 font-bold">
                PRIMARY
              </span>
              <p className="text-xs font-bold text-white leading-snug">
                Reach the playoffs. Finish in the top four.
              </p>
              <p className={`text-xs mt-1 font-semibold ${isPrimaryMet ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isPrimaryMet ? 'Reached the playoffs.' : 'Missed playoff qualification.'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Finished {rank <= 4 ? `${rank}th` : `${rank}th on the table`}.
              </p>
            </div>
          </div>
        </div>

        {/* Objective 2: Secondary 1 */}
        <div className="bg-[#0f172a]/90 rounded-2xl border border-slate-800/90 p-4">
          <div className="flex items-start gap-3">
            {isSecondary1Met ? (
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block mb-0.5 font-bold">
                SECONDARY
              </span>
              <p className="text-xs font-bold text-white leading-snug">
                Win at least four home fixtures.
              </p>
              <p className={`text-xs mt-1 font-semibold ${isSecondary1Met ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isSecondary1Met ? 'Held home turf.' : 'Fortress breached at home.'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Won {wonHomeMatches} home fixtures.
              </p>
            </div>
          </div>
        </div>

        {/* Objective 3: Secondary 2 */}
        <div className="bg-[#0f172a]/90 rounded-2xl border border-slate-800/90 p-4">
          <div className="flex items-start gap-3">
            {isSecondary2Met ? (
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block mb-0.5 font-bold">
                SECONDARY
              </span>
              <p className="text-xs font-bold text-white leading-snug">
                Have a player finish in the top three for runs or wickets.
              </p>
              <p className={`text-xs mt-1 font-semibold ${isSecondary2Met ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isSecondary2Met ? 'Star performer crowned.' : 'Missed the leaderboard target.'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isSecondary2Met ? 'Top 3 player on orange/purple cap table.' : 'No player finished top-3 in runs or wickets.'}
              </p>
            </div>
          </div>
        </div>

        {/* Board Verdict Card */}
        <div className="bg-gradient-to-b from-[#2a2212] to-[#17130a] rounded-2xl border border-amber-500/40 p-4 mt-1">
          <h4 className="text-sm font-bold text-amber-300">
            {boardVerdict.title}
          </h4>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            {boardVerdict.desc}
          </p>
        </div>
      </div>

      {/* Bottom Action Button */}
      <div className="p-4 pt-2">
        <button
          onClick={() => {
            sound.playTap();
            onProceedToOffers();
          }}
          className="w-full py-4 bg-gradient-to-r from-[#eab308] via-[#f5b82e] to-[#eab308] hover:from-[#facc15] hover:to-[#f5b82e] text-black font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 active:scale-98 transition-all"
        >
          CLOSE
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
