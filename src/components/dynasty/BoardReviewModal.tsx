import React from 'react';
import { BookOpen, CheckCircle, XCircle, ChevronRight, Award } from 'lucide-react';
import { Team, StandingRow, CareerBoardReview, ObjectiveResult } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';

interface BoardReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceedToOffers: (isSatisfied: boolean) => void;
  userTeam: Team;
  userStanding?: StandingRow;
  userStandingRank?: number;
  seasonYear?: number;
  reviewData?: CareerBoardReview | null;
  topPlayerInLeaderboards?: boolean;
}

export function buildDefaultBoardReview(
  seasonYear: number,
  userTeam: Team,
  userStanding?: StandingRow,
  userStandingRank?: number,
  topPlayerInLeaderboards: boolean = true
): CareerBoardReview {
  const rank = userStandingRank ?? 4;
  const wonHomeMatches = userStanding?.won ? Math.min(4, Math.max(0, Math.floor(userStanding.won * 0.55))) : 4;

  const rankSuffix = rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : `${rank}th`;
  const primaryFulfilled = rank <= 4;
  const secondary1Fulfilled = wonHomeMatches >= 4;
  const secondary2Fulfilled = topPlayerInLeaderboards || rank <= 3;

  const objectives: ObjectiveResult[] = [
    {
      id: 'obj_playoffs',
      category: 'PRIMARY',
      title: 'Reach the playoffs (Top 4)',
      description: 'Finish in the top four positions on the league standings table.',
      targetStr: 'Top 4 finish',
      measuredStr: rank <= 4 ? `Finished ${rankSuffix} (Qualified)` : `Finished ${rankSuffix} (Eliminated)`,
      isFulfilled: primaryFulfilled
    },
    {
      id: 'obj_home_fortress',
      category: 'SECONDARY',
      title: 'Win at least 4 home matches',
      description: 'Defend your home venue and secure 4 or more victories.',
      targetStr: '4 home wins',
      measuredStr: `${wonHomeMatches} home wins`,
      isFulfilled: secondary1Fulfilled
    },
    {
      id: 'obj_star_performer',
      category: 'SECONDARY',
      title: 'Top 3 player on leaderboard',
      description: 'Have a squad member finish in the top 3 for Orange or Purple cap.',
      targetStr: 'Top 3 run/wicket scorer',
      measuredStr: secondary2Fulfilled ? 'Achieved (Top 3 player)' : 'Missed top 3 leaderboard',
      isFulfilled: secondary2Fulfilled
    }
  ];

  const fulfilledCount = objectives.filter(o => o.isFulfilled).length;
  const totalCount = objectives.length;
  const scorePct = totalCount > 0 ? Math.round((fulfilledCount / totalCount) * 100) : 100;
  const isSatisfied = scorePct >= 60; // 60% threshold

  const verdictTitle = isSatisfied
    ? 'The board is satisfied.'
    : 'The board expresses concern.';
  const verdictDesc = isSatisfied
    ? `Completed ${scorePct}% of assigned objectives (${fulfilledCount}/${totalCount}). The board backs your vision for another season.`
    : `Completed only ${scorePct}% of assigned objectives (${fulfilledCount}/${totalCount}). Targets were missed and your position is under review.`;

  return {
    seasonYear,
    teamId: userTeam.id,
    teamName: userTeam.name,
    objectives,
    fulfilledCount,
    totalCount,
    scorePct,
    isSatisfied,
    verdictTitle,
    verdictDesc
  };
}

export const BoardReviewModal: React.FC<BoardReviewModalProps> = ({
  isOpen,
  onProceedToOffers,
  userTeam,
  userStanding,
  userStandingRank,
  seasonYear = 2026,
  reviewData,
  topPlayerInLeaderboards = true
}) => {
  if (!isOpen) return null;

  const review = reviewData || buildDefaultBoardReview(
    seasonYear,
    userTeam,
    userStanding,
    userStandingRank,
    topPlayerInLeaderboards
  );

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
              SEASON {review.seasonYear}
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
                Objective score: <strong className={review.isSatisfied ? 'text-emerald-400' : 'text-rose-400'}>{review.scorePct}%</strong> ({review.fulfilledCount}/{review.totalCount} met)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Review Card */}
      <div className="px-4 py-2 flex-1 flex flex-col gap-3">
        {/* Header Tags */}
        <div className="flex items-center justify-between">
          <span className={`px-2.5 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-wider ${
            review.isSatisfied
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
          }`}>
            {review.isSatisfied ? 'PASS · SATISFIED' : 'NEEDS IMPROVEMENT'}
          </span>
          <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">
            {review.scorePct}% COMPLETED
          </span>
        </div>

        <h2 className="text-2xl font-black font-display text-white tracking-wide">
          {review.teamName}
        </h2>

        {/* Objectives List */}
        {review.objectives.map(obj => (
          <div key={obj.id} className="bg-[#0f172a]/90 rounded-2xl border border-slate-800/90 p-4">
            <div className="flex items-start gap-3">
              {obj.isFulfilled ? (
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block mb-0.5 font-bold">
                  {obj.category}
                </span>
                <p className="text-xs font-bold text-white leading-snug">
                  {obj.title}
                </p>
                <p className={`text-xs mt-1 font-semibold ${obj.isFulfilled ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {obj.measuredStr}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Target: {obj.targetStr}
                </p>
              </div>
            </div>
          </div>
        ))}

        {/* Board Verdict Card */}
        <div className={`rounded-2xl border p-4 mt-1 ${
          review.isSatisfied
            ? 'bg-gradient-to-b from-[#1a2f23] to-[#0f1f16] border-emerald-500/40'
            : 'bg-gradient-to-b from-[#2e1a1e] to-[#1a0f12] border-rose-500/40'
        }`}>
          <h4 className={`text-sm font-bold ${review.isSatisfied ? 'text-emerald-300' : 'text-rose-300'}`}>
            {review.verdictTitle}
          </h4>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            {review.verdictDesc}
          </p>
        </div>
      </div>

      {/* Bottom Action Button */}
      <div className="p-4 pt-2">
        <button
          onClick={() => {
            sound.playTap();
            onProceedToOffers(review.isSatisfied);
          }}
          className="w-full py-4 bg-gradient-to-r from-[#eab308] via-[#f5b82e] to-[#eab308] hover:from-[#facc15] hover:to-[#f5b82e] text-black font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 active:scale-98 transition-all"
        >
          VIEW CAREER OPTIONS
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

