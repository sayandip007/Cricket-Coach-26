import React, { useState } from 'react';
import { Lock, Check } from 'lucide-react';
import { Team } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';

interface FranchiseJobOption {
  id: string;
  title: string;
  league: string;
  note: string;
  dateBadge: string;
  ovr?: number;
  icon: string;
  isCurrentClub: boolean;
}

interface CountryJobOption {
  id: string;
  name: string;
  dutyStr: string;
  dateBadge: string;
  icon: string;
  isLocked: boolean;
  lockRequirement?: string;
}

interface NextSeasonSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed: (selectedClubId: string, selectedCountryId: string | null) => void;
  userTeam: Team;
}

export const NextSeasonSetupModal: React.FC<NextSeasonSetupModalProps> = ({
  isOpen,
  onProceed,
  userTeam
}) => {
  const [selectedClubId, setSelectedClubId] = useState<string>(userTeam.id);
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(null);

  if (!isOpen) return null;

  const franchiseOffers: FranchiseJobOption[] = [
    {
      id: userTeam.id,
      title: `Stay at ${userTeam.name}`,
      league: 'Indian Premier League (IPL)',
      note: 're-sign for next season',
      dateBadge: 'Mar 30 starts',
      icon: userTeam.logoEmoji || '⚔️',
      isCurrentClub: true
    },
    {
      id: 'team_mum',
      title: 'Offer from Mumbai Indians',
      league: 'Indian Premier League (IPL)',
      note: 'replacement only',
      dateBadge: 'Mar 30',
      ovr: 85,
      icon: '🌀',
      isCurrentClub: false
    },
    {
      id: 'team_che',
      title: 'Offer from Chennai Super Kings',
      league: 'Indian Premier League (IPL)',
      note: 'replacement only',
      dateBadge: 'Mar 30',
      ovr: 84,
      icon: '🦁',
      isCurrentClub: false
    },
    {
      id: 'team_blr',
      title: 'Offer from Royal Challengers Bengaluru',
      league: 'Indian Premier League (IPL)',
      note: 'replacement only',
      dateBadge: 'Mar 30',
      ovr: 83,
      icon: '👑',
      isCurrentClub: false
    },
    {
      id: 'team_hyd',
      title: 'Offer from Sunrisers Hyderabad',
      league: 'Indian Premier League (IPL)',
      note: 'replacement only',
      dateBadge: 'Mar 30',
      ovr: 84,
      icon: '🦅',
      isCurrentClub: false
    }
  ];

  const countryOffers: CountryJobOption[] = [
    {
      id: 'none',
      name: 'No national side',
      dutyStr: 'Focus on the club',
      dateBadge: '',
      icon: '—',
      isLocked: false
    },
    {
      id: 'nat_wi',
      name: 'West Indies',
      dutyStr: 'International duty · from Jul 3',
      dateBadge: 'Jul 3 starts',
      icon: '🌴',
      isLocked: false
    },
    {
      id: 'nat_sl',
      name: 'Sri Lanka',
      dutyStr: 'International duty · from Jul 5',
      dateBadge: 'Jul 5 starts',
      icon: '🇱🇰',
      isLocked: false
    },
    {
      id: 'nat_ban',
      name: 'Bangladesh',
      dutyStr: 'International duty · from Sep 8',
      dateBadge: 'Sep 8 starts',
      icon: '🇧🇩',
      isLocked: false
    },
    {
      id: 'nat_afg',
      name: 'Afghanistan',
      dutyStr: 'International duty · from Aug 1',
      dateBadge: 'Aug 1 starts',
      icon: '🇦🇫',
      isLocked: false
    },
    {
      id: 'nat_usa',
      name: 'USA',
      dutyStr: 'International duty · from Jul 3',
      dateBadge: 'Jul 3 starts',
      icon: '🇺🇸',
      isLocked: false
    },
    {
      id: 'nat_nep',
      name: 'Nepal',
      dutyStr: 'International duty · from Jul 16',
      dateBadge: 'Jul 16 starts',
      icon: '🇳🇵',
      isLocked: false
    },
    {
      id: 'nat_nz',
      name: 'New Zealand',
      dutyStr: 'Win a league title',
      dateBadge: '',
      icon: '🇳🇿',
      isLocked: true,
      lockRequirement: 'Win a league title'
    },
    {
      id: 'nat_pak',
      name: 'Pakistan',
      dutyStr: 'Win a league title',
      dateBadge: '',
      icon: '🇵🇰',
      isLocked: true,
      lockRequirement: 'Win a league title'
    },
    {
      id: 'nat_sa',
      name: 'South Africa',
      dutyStr: 'Win 3 league titles (0/3)',
      dateBadge: '',
      icon: '🇿🇦',
      isLocked: true,
      lockRequirement: 'Win 3 league titles (0/3)'
    },
    {
      id: 'nat_eng',
      name: 'England',
      dutyStr: 'Win 3 league titles (0/3)',
      dateBadge: '',
      icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
      isLocked: true,
      lockRequirement: 'Win 3 league titles (0/3)'
    },
    {
      id: 'nat_aus',
      name: 'Australia',
      dutyStr: 'Win 3 league titles (0/3)',
      dateBadge: '',
      icon: '🇦🇺',
      isLocked: true,
      lockRequirement: 'Win 3 league titles (0/3)'
    },
    {
      id: 'nat_ind',
      name: 'India',
      dutyStr: 'Win 3 league titles (0/3)',
      dateBadge: '',
      icon: '🇮🇳',
      isLocked: true,
      lockRequirement: 'Win 3 league titles (0/3)'
    }
  ];

  const selectedClub = franchiseOffers.find(f => f.id === selectedClubId) || franchiseOffers[0];
  const selectedCountry = countryOffers.find(c => c.id === (selectedCountryId || 'none'));

  const ctaLabel = selectedClubId === userTeam.id
    ? `STAY AT ${userTeam.name.split(' ')[0].toUpperCase()}`
    : `ACCEPT OFFER FROM ${selectedClub.title.replace('Offer from ', '').toUpperCase()}`;

  return (
    <div className="fixed inset-0 z-50 bg-[#070b12] text-slate-100 flex flex-col justify-between max-w-md mx-auto overflow-hidden animate-in fade-in duration-200">
      {/* Header */}
      <div className="p-4 border-b border-slate-800/80 bg-[#0c121d]/90 text-center">
        <h2 className="text-sm font-black font-display tracking-widest text-white uppercase">
          SET UP YOUR NEXT SEASON
        </h2>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Review the offers your results have earned.
        </p>

        {/* Selected Club & Country Cards */}
        <div className="grid grid-cols-2 gap-2.5 mt-3">
          {/* Club Card */}
          <div className="bg-[#121927] border border-amber-500/50 rounded-2xl p-3 text-left relative">
            <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest block mb-1">
              CLUB
            </span>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-xs font-black font-display text-amber-300">
                {selectedClub.isCurrentClub ? userTeam.shortName : selectedClub.icon}
              </div>
              <div>
                <h4 className="text-xs font-black text-white leading-tight truncate max-w-[110px]">
                  {selectedClub.isCurrentClub
                    ? userTeam.shortName
                    : selectedClub.title.replace('Offer from ', '')}
                </h4>
                <span className="text-[10px] text-slate-400 block truncate">
                  Premier T20 (India)
                </span>
              </div>
            </div>
            <span className="text-[10px] font-semibold text-emerald-400 mt-1 block">
              {selectedClub.isCurrentClub ? 'staying' : 'new contract'}
            </span>
          </div>

          {/* Country Card */}
          <div className="bg-[#121927] border border-slate-800 rounded-2xl p-3 text-left relative">
            <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest block mb-1">
              COUNTRY
            </span>
            <div className="flex items-center gap-2">
              <span className="text-base">{selectedCountry?.icon}</span>
              <div>
                <h4 className="text-xs font-bold text-white leading-tight truncate">
                  {selectedCountry?.id === 'none' ? 'no national side' : selectedCountry?.name}
                </h4>
                <span className="text-[10px] text-slate-400 block truncate">
                  {selectedCountry?.id === 'none' ? 'focus on club' : 'international duty'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Offers List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-5">
        {/* Section 1: FRANCHISE JOBS */}
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block mb-2 font-bold">
            FRANCHISE JOBS · NEXT SEASON
          </span>
          <div className="flex flex-col gap-2">
            {franchiseOffers.map(job => {
              const isSelected = selectedClubId === job.id;
              return (
                <div
                  key={job.id}
                  onClick={() => {
                    sound.playTap();
                    setSelectedClubId(job.id);
                  }}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'bg-[#141b2a] border-amber-500/70 shadow-lg shadow-amber-500/10'
                      : 'bg-[#0f172a]/80 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-lg shrink-0">
                      {job.icon}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">
                        {job.title}
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {job.league} · {job.note}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[11px] font-mono font-bold text-slate-300 block">
                      {job.dateBadge}
                    </span>
                    {job.ovr && (
                      <span className="text-[10px] font-mono text-slate-400">
                        OVR {job.ovr}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 2: COUNTRY */}
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block mb-2 font-bold">
            COUNTRY · THE WINDOW IN BETWEEN
          </span>
          <div className="flex flex-col gap-2">
            {countryOffers.map(c => {
              const isSelected = (selectedCountryId || 'none') === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    if (c.isLocked) return;
                    sound.playTap();
                    setSelectedCountryId(c.id === 'none' ? null : c.id);
                  }}
                  className={`p-3 rounded-2xl border transition-all flex items-center justify-between ${
                    c.isLocked
                      ? 'bg-[#0b1019]/60 border-slate-800/40 opacity-60 cursor-not-allowed'
                      : isSelected
                      ? 'bg-[#141b2a] border-amber-500/70 shadow-lg shadow-amber-500/10 cursor-pointer'
                      : 'bg-[#0f172a]/80 border-slate-800/80 hover:border-slate-700 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg w-7 text-center">{c.icon}</span>
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        {c.name}
                        {isSelected && !c.isLocked && (
                          <Check className="w-3.5 h-3.5 text-amber-400" />
                        )}
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {c.dutyStr}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {c.isLocked ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                        <Lock className="w-3 h-3" />
                        LOCKED
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono font-bold text-slate-300">
                        {c.dateBadge}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Sticky Action Button */}
      <div className="p-4 border-t border-slate-800/80 bg-[#0c121d]/90">
        <button
          onClick={() => {
            sound.playCrowdCheer(0.8);
            onProceed(selectedClubId, selectedCountryId);
          }}
          className="w-full py-4 bg-gradient-to-r from-[#eab308] via-[#f5b82e] to-[#eab308] hover:from-[#facc15] hover:to-[#f5b82e] text-black font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 active:scale-98 transition-all"
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
};
