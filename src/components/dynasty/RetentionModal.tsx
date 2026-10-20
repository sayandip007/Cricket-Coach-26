import React, { useState } from 'react';
import { Trophy, ArrowRight, X, Sparkles, TrendingUp } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { Player } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';

interface RetentionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSeasonAdvance?: (year: number) => void;
}

const RETENTION_TIERS = [
  { rank: 1, costCr: 18.0, label: '1st Player Retention (Marquee)' },
  { rank: 2, costCr: 14.0, label: '2nd Player Retention' },
  { rank: 3, costCr: 11.0, label: '3rd Player Retention' },
  { rank: 4, costCr: 18.0, label: '4th Player Retention' },
  { rank: 5, costCr: 4.0, label: 'Uncapped Domestic Retention' }
];

export const RetentionModal: React.FC<RetentionModalProps> = ({ isOpen, onClose, onSeasonAdvance }) => {
  const { userTeam, players, setPlayers, setTeams, coachProfile, updateCoachProfile } = useGame();
  const [selectedRetentionIds, setSelectedRetentionIds] = useState<string[]>(() => {
    // Default: captain and top 2 players
    const teamSquad = players.filter(p => p.clubId === userTeam.id);
    const capt = teamSquad.find(p => p.id === userTeam.captainId || p.isCaptain);
    const others = teamSquad.filter(p => p.id !== capt?.id).sort((a, b) => b.ratings.bat - a.ratings.bat);
    const initial = [capt?.id, others[0]?.id, others[1]?.id].filter(Boolean) as string[];
    return initial;
  });

  const [currentSeasonYear, setCurrentSeasonYear] = useState<number>(2026);
  const [stage, setStage] = useState<'trophy' | 'retention' | 'progression'>('trophy');

  if (!isOpen) return null;

  const teamSquad = players.filter(p => p.clubId === userTeam.id);

  // Compute total retention cost
  let totalRetentionCost = 0;
  selectedRetentionIds.forEach((id, index) => {
    const tier = RETENTION_TIERS[index] || RETENTION_TIERS[RETENTION_TIERS.length - 1];
    totalRetentionCost += tier.costCr;
  });

  const remainingPurseCr = Math.max(0, 100.0 - totalRetentionCost);

  const toggleRetention = (player: Player) => {
    sound.playTap();
    if (selectedRetentionIds.includes(player.id)) {
      setSelectedRetentionIds(prev => prev.filter(id => id !== player.id));
    } else {
      if (selectedRetentionIds.length >= 5) return;
      setSelectedRetentionIds(prev => [...prev, player.id]);
    }
  };

  const handleFinalizeSeason = () => {
    sound.playCrowdCheer(1.0);

    // Apply Progression Curves and release unretained user team players into the open auction pool
    const updatedPlayers = players.map(p => {
      const isUnretainedUserPlayer =
        p.clubId === userTeam.id && !selectedRetentionIds.includes(p.id);
      const nextClubId = isUnretainedUserPlayer ? 'free_agent' : p.clubId;

      if (p.age <= 23) {
        return {
          ...p,
          clubId: nextClubId,
          age: p.age + 1,
          ratings: {
            ...p.ratings,
            bat: Math.min(99, p.ratings.bat + 2),
            pow: Math.min(99, p.ratings.pow + 3),
            tec: Math.min(99, (p.ratings.tec || 75) + 2),
            tmp: Math.min(99, p.ratings.tmp + 3)
          }
        };
      } else if (p.age >= 34) {
        return {
          ...p,
          clubId: nextClubId,
          age: p.age + 1,
          ratings: {
            ...p.ratings,
            tmp: Math.min(99, p.ratings.tmp + 1), // veteran poise
            fit: Math.max(70, (p.ratings.fit || 85) - 2)
          }
        };
      }
      return { ...p, clubId: nextClubId, age: p.age + 1 };
    });

    setPlayers(updatedPlayers);

    // Update user franchise purse and retained squad for the upcoming mega auction
    setTeams(prev => prev.map(t => {
      if (t.id === userTeam.id) {
        const retainedSquad = updatedPlayers.filter(p => p.clubId === userTeam.id);
        return {
          ...t,
          purseCr: remainingPurseCr,
          squad: retainedSquad,
          playingXIIds: [...selectedRetentionIds]
        };
      }
      return t;
    }));

    updateCoachProfile({
      domesticTitles: (coachProfile.domesticTitles || 0) + 1,
      domesticStats: {
        ...coachProfile.domesticStats,
        seasons: (coachProfile.domesticStats?.seasons || 1) + 1,
        titles: (coachProfile.domesticStats?.titles || 0) + 1
      }
    });

    setCurrentSeasonYear(prev => prev + 1);
    if (onSeasonAdvance) onSeasonAdvance(currentSeasonYear + 1);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 select-none animate-fadeIn">
      <div className="bg-[#0b101c] border border-amber-500/40 rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 bg-[#0f172a] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm font-black text-white font-display uppercase tracking-wide">
              {currentSeasonYear} DYNASTY & RETENTION WINDOW
            </h2>
          </div>
          <button
            onClick={() => { sound.playTap(); onClose(); }}
            className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Sub-header */}
        <div className="px-5 pt-3">
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 text-[11px] font-mono font-bold">
            <button
              onClick={() => { sound.playTap(); setStage('trophy'); }}
              className={`py-1.5 rounded-lg uppercase transition-all ${
                stage === 'trophy' ? 'bg-amber-400 text-black shadow' : 'text-slate-400'
              }`}
            >
              1. CHAMPIONS
            </button>
            <button
              onClick={() => { sound.playTap(); setStage('retention'); }}
              className={`py-1.5 rounded-lg uppercase transition-all ${
                stage === 'retention' ? 'bg-amber-400 text-black shadow' : 'text-slate-400'
              }`}
            >
              2. RETENTIONS ({selectedRetentionIds.length}/5)
            </button>
            <button
              onClick={() => { sound.playTap(); setStage('progression'); }}
              className={`py-1.5 rounded-lg uppercase transition-all ${
                stage === 'progression' ? 'bg-amber-400 text-black shadow' : 'text-slate-400'
              }`}
            >
              3. PROGRESSION
            </button>
          </div>
        </div>

        {/* Main Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-3">
          {/* STAGE 1: TROPHY & SEASON WRAP */}
          {stage === 'trophy' && (
            <div className="flex flex-col items-center text-center py-4 space-y-3">
              <div className="w-20 h-20 rounded-3xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-4xl shadow-xl shadow-amber-500/20">
                🏆
              </div>

              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold block">
                  SEASON {currentSeasonYear} CONCLUSION
                </span>
                <h3 className="text-xl font-black text-white font-display uppercase tracking-wide mt-1">
                  {userTeam.name} CHAMPIONS DYNASTY
                </h3>
              </div>

              <p className="text-xs text-slate-300 max-w-sm">
                Congratulations Manager! The board has rewarded the coaching staff with title bonuses. It is now time to lock in your squad retentions before the upcoming Mega Auction draft.
              </p>

              <div className="grid grid-cols-3 gap-2 w-full pt-2">
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
                  <span className="text-[9px] font-mono text-slate-400 block">SEASONS</span>
                  <span className="text-sm font-black text-white">{coachProfile.domesticStats?.seasons || 1}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
                  <span className="text-[9px] font-mono text-slate-400 block">TITLES</span>
                  <span className="text-sm font-black text-amber-400">{coachProfile.domesticStats?.titles || coachProfile.domesticTitles || 1} 🏆</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
                  <span className="text-[9px] font-mono text-slate-400 block">WIN %</span>
                  <span className="text-sm font-black text-emerald-400">{coachProfile.domesticStats?.winPct ?? 74.2}%</span>
                </div>
              </div>

              <button
                onClick={() => { sound.playTap(); setStage('retention'); }}
                className="w-full mt-2 py-3 bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase rounded-xl tracking-wider flex items-center justify-center gap-1.5 shadow-lg active:scale-95"
              >
                PROCEED TO RETENTION WINDOW <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* STAGE 2: PLAYER RETENTION SELECTOR */}
          {stage === 'retention' && (
            <div className="flex flex-col gap-3">
              {/* Purse Tracker Header */}
              <div className="p-3 bg-gradient-to-r from-[#172238] to-[#0f172a] rounded-2xl border border-cyan-500/30 flex items-center justify-between text-xs font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 block">RETENTION SLOTS</span>
                  <span className="text-white font-black">{selectedRetentionIds.length} / 5 MAX</span>
                </div>
                <div className="text-center">
                  <span className="text-[10px] text-slate-400 block">PURSE DEDUCTED</span>
                  <span className="text-rose-400 font-black">-₹{totalRetentionCost.toFixed(1)} Cr</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block">AUCTION PURSE LEFT</span>
                  <span className="text-amber-400 font-black">₹{remainingPurseCr.toFixed(1)} Cr</span>
                </div>
              </div>

              <span className="text-[11px] text-slate-400 font-sans block">
                Tap players to retain. Unretained players will be released into the open auction pool.
              </span>

              {/* Squad List */}
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                {teamSquad.map(player => {
                  const isRetained = selectedRetentionIds.includes(player.id);
                  const retentionRank = selectedRetentionIds.indexOf(player.id) + 1;
                  const tierInfo = isRetained ? RETENTION_TIERS[retentionRank - 1] : null;

                  return (
                    <div
                      key={player.id}
                      onClick={() => toggleRetention(player)}
                      className={`p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                        isRetained
                          ? 'bg-amber-950/30 border-amber-400 shadow-md'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold font-mono ${
                          isRetained ? 'bg-amber-400 text-black' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {isRetained ? `#${retentionRank}` : '○'}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white">{player.name}</span>
                            {player.isOverseas && <span className="text-[10px] text-cyan-400">✈</span>}
                            {player.isCaptain && <span className="text-[9px] px-1 bg-amber-500 text-black font-bold rounded">C</span>}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {player.role} · {player.country} · BAT {player.ratings.bat} · BWL {player.ratings.bowl}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        {isRetained ? (
                          <span className="text-xs font-mono font-bold text-amber-400 block">
                            ₹{tierInfo?.costCr.toFixed(1)} Cr
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-slate-500 block">
                            Release
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => { sound.playTap(); setStage('progression'); }}
                className="w-full mt-2 py-3 bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase rounded-xl tracking-wider flex items-center justify-center gap-1.5 shadow active:scale-95"
              >
                CONFIRM RETENTIONS & VIEW AGING <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* STAGE 3: AGING & PROGRESSION CURVES */}
          {stage === 'progression' && (
            <div className="flex flex-col gap-3">
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl flex items-center gap-2.5">
                <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-white uppercase font-display">
                    PLAYER PROGRESSION & AGING CYCLES
                  </h4>
                  <span className="text-[10px] text-slate-400">
                    Youngsters under 23 receive skill surges; veterans gain clutch temperament.
                  </span>
                </div>
              </div>

              {/* Sample Progression Cards */}
              <div className="space-y-2">
                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs flex items-center justify-between">
                  <div>
                    <span className="font-bold text-white block">Youngster Development (Age 18-23)</span>
                    <span className="text-[10px] text-slate-400">Match XP & Net Drills</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 font-mono font-bold border border-emerald-500/30 text-[11px]">
                    +2 BAT · +3 POW · +3 TMP
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs flex items-center justify-between">
                  <div>
                    <span className="font-bold text-white block">Prime Stars (Age 24-32)</span>
                    <span className="text-[10px] text-slate-400">Peak Performance Window</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-400 font-mono font-bold border border-cyan-500/30 text-[11px]">
                    MAX FIT · PRIME FORM
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs flex items-center justify-between">
                  <div>
                    <span className="font-bold text-white block">Veterans (Age 33+)</span>
                    <span className="text-[10px] text-slate-400">Tactical Leadership & Poise</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-amber-950/60 text-amber-400 font-mono font-bold border border-amber-500/30 text-[11px]">
                    +2 TMP · POISE 95+
                  </span>
                </div>
              </div>

              <button
                onClick={handleFinalizeSeason}
                className="w-full mt-2 py-3.5 bg-gradient-to-r from-amber-500 to-amber-400 text-black font-black text-xs uppercase rounded-xl tracking-wider flex items-center justify-center gap-1.5 shadow-xl shadow-amber-500/20 active:scale-95 transition-all"
              >
                <Sparkles className="w-4 h-4 fill-current" />
                ADVANCE TO SEASON {currentSeasonYear + 1}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
