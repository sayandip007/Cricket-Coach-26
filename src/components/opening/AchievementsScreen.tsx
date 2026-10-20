import React, { useState } from 'react';
import { ArrowLeft, Trophy, Lock, Award, Calendar, Gavel, Shield, Zap, Target, Star, Globe, TrendingUp, Users, Flag, Briefcase, DollarSign, Building } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { sound } from '../../utils/soundEffects';

interface AchievementsScreenProps {
  onBack: () => void;
}

export const AchievementsScreen: React.FC<AchievementsScreenProps> = ({ onBack }) => {
  const { achievements } = useGame();
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'GETTING STARTED' | 'MATCH FEATS' | 'SEASON' | 'CAREER' | 'INTERNATIONAL'>('ALL');

  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const totalCount = achievements.length;

  const categories: Array<'GETTING STARTED' | 'MATCH FEATS' | 'SEASON' | 'CAREER' | 'INTERNATIONAL'> = [
    'GETTING STARTED',
    'MATCH FEATS',
    'SEASON',
    'CAREER',
    'INTERNATIONAL'
  ];

  const renderIcon = (type: string, unlocked: boolean) => {
    const color = unlocked ? 'text-amber-400' : 'text-slate-500';
    switch (type) {
      case 'trophy': return <Trophy className={`w-5 h-5 ${color}`} />;
      case 'calendar': return <Calendar className={`w-5 h-5 ${color}`} />;
      case 'gavel': return <Gavel className={`w-5 h-5 ${color}`} />;
      case 'award': return <Award className={`w-5 h-5 ${color}`} />;
      case 'target': return <Target className={`w-5 h-5 ${color}`} />;
      case 'shield': return <Shield className={`w-5 h-5 ${color}`} />;
      case 'zap': return <Zap className={`w-5 h-5 ${color}`} />;
      case 'star': return <Star className={`w-5 h-5 ${color}`} />;
      case 'trending': return <TrendingUp className={`w-5 h-5 ${color}`} />;
      case 'globe': return <Globe className={`w-5 h-5 ${color}`} />;
      case 'flag': return <Flag className={`w-5 h-5 ${color}`} />;
      case 'dollar': return <DollarSign className={`w-5 h-5 ${color}`} />;
      case 'users': return <Users className={`w-5 h-5 ${color}`} />;
      case 'building': return <Building className={`w-5 h-5 ${color}`} />;
      case 'briefcase': return <Briefcase className={`w-5 h-5 ${color}`} />;
      default: return <Lock className={`w-5 h-5 ${color}`} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 flex flex-col max-w-7xl mx-auto w-full select-none">
      {/* Top Bar matching video: Back Arrow, ACHIEVEMENTS, Counter X OF 79 */}
      <div className="px-6 py-3.5 bg-[#0a0f1c] border-b border-slate-800/90 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { sound.playTap(); onBack(); }}
            className="p-1 text-slate-300 hover:text-white active:scale-95 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-sm font-black font-display tracking-wider text-white uppercase">
            ACHIEVEMENTS
          </h1>
        </div>

        <div className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1">
          <span>{unlockedCount} OF {totalCount}</span>
        </div>
      </div>

      {/* Gold Accent Progress Bar */}
      <div className="w-full bg-[#1e293b] h-1">
        <div
          className="bg-gradient-to-r from-amber-500 to-amber-300 h-full transition-all duration-500"
          style={{ width: `${(unlockedCount / Math.max(1, totalCount)) * 100}%` }}
        />
      </div>

      {/* Category Filter Pills */}
      <div className="px-6 py-2.5 flex items-center gap-2 overflow-x-auto bg-[#0a0f1c]/90 border-b border-slate-800/60 no-scrollbar">
        <button
          onClick={() => setActiveFilter('ALL')}
          className={`px-3 py-1 rounded-lg text-[11px] font-mono font-bold whitespace-nowrap transition-all ${
            activeFilter === 'ALL'
              ? 'bg-amber-400 text-black'
              : 'bg-[#141d2c] text-slate-400 hover:text-white'
          }`}
        >
          ALL ({totalCount})
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveFilter(cat)}
            className={`px-3 py-1 rounded-lg text-[11px] font-mono font-bold whitespace-nowrap transition-all ${
              activeFilter === cat
                ? 'bg-amber-400 text-black'
                : 'bg-[#141d2c] text-slate-400 hover:text-white'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Achievements List */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {categories.map(category => {
          if (activeFilter !== 'ALL' && activeFilter !== category) return null;
          const items = achievements.filter(a => a.category.toUpperCase() === category);
          if (items.length === 0) return null;

          return (
            <div key={category} className="space-y-2.5">
              <div className="text-[11px] font-mono tracking-widest text-slate-400 uppercase font-black px-1">
                {category}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {items.map(item => (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                      item.unlocked
                        ? 'bg-[#141c2c] border-amber-500/40 shadow-sm'
                        : 'bg-[#0f1726]/80 border-slate-800/80 opacity-90'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                        item.unlocked
                          ? 'bg-amber-400/10 border-amber-500/50'
                          : 'bg-slate-900 border-slate-800'
                      }`}>
                        {renderIcon(item.iconType, item.unlocked)}
                      </div>

                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white tracking-wide truncate">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-slate-400 line-clamp-1">
                          {item.description}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      {item.unlocked ? (
                        <div className="flex flex-col items-end">
                          <Trophy className="w-4 h-4 text-amber-400 fill-amber-400/30" />
                          {item.unlockedDate && (
                            <span className="text-[9px] font-mono text-amber-300 font-semibold mt-0.5 whitespace-nowrap">
                              {item.unlockedDate}
                            </span>
                          )}
                        </div>
                      ) : item.progress ? (
                        <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-mono font-bold">
                          <span>{item.progress}</span>
                          <Lock className="w-3.5 h-3.5 text-slate-500" />
                        </div>
                      ) : (
                        <Lock className="w-4 h-4 text-slate-600" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
