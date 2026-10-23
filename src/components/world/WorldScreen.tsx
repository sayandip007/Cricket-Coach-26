import React, { useState, useEffect } from 'react';
import { Globe, Trophy, Users, Calendar } from 'lucide-react';
import { useGame, CRICBUZZ_2026_INTL_TOURS } from '../../context/GameContext';
import { sound } from '../../utils/soundEffects';

export const WorldScreen: React.FC = () => {
  const {
    nations,
    nationalSquadIds,
    setNationalSquadIds,
    internationalSeries,
    jobOffers,
    acceptJobOffer,
    coachProfile,
    players,
    startInternationalMatch,
    simEntireMatch
  } = useGame();

  const [activeTab, setActiveTab] = useState<'rankings' | 'duty' | 'offers'>('rankings');
  const [rankingFormat, setRankingFormat] = useState<'t20' | 'odi' | 'test'>('t20');
  const [showSquadSelector, setShowSquadSelector] = useState(false);
  const [selectedNationalPlayerIds, setSelectedNationalPlayerIds] = useState<string[]>(nationalSquadIds);

  useEffect(() => {
    setSelectedNationalPlayerIds(nationalSquadIds);
  }, [nationalSquadIds]);

  const coachedNation = coachProfile.nationalTeamId
    ? nations.find(n => n.id === coachProfile.nationalTeamId) || null
    : null;

  const sortedNations = [...nations].sort((a, b) => {
    if (rankingFormat === 't20') return b.ratingT20 - a.ratingT20;
    if (rankingFormat === 'odi') return b.ratingODI - a.ratingODI;
    return b.ratingTest - a.ratingTest;
  });

  const currentRank = coachedNation ? sortedNations.findIndex(n => n.id === coachedNation.id) + 1 : 1;

  // Candidate pool strictly for the coached nation (never supplemented with foreign players)
  const nationPool = coachedNation
    ? players.filter(p => p.country.toLowerCase() === coachedNation.name.toLowerCase())
    : [];

  const handleToggleNationalPlayer = (id: string) => {
    sound.playTap();
    if (selectedNationalPlayerIds.includes(id)) {
      if (selectedNationalPlayerIds.length <= 11) return; // Keep at least 11 for a valid Playing XI
      setSelectedNationalPlayerIds(prev => prev.filter(pId => pId !== id));
    } else {
      if (selectedNationalPlayerIds.length < 15) {
        setSelectedNationalPlayerIds(prev => [...prev, id]);
      }
    }
  };

  const completedSeriesMatches = internationalSeries.matches.filter(m => m.completed);
  const nextSeriesMatch = internationalSeries.matches.find(m => !m.completed);
  const ordinals = ['1st', '2nd', '3rd', '4th', '5th'];

  const seriesStatusLabel =
    internationalSeries.seriesWins > internationalSeries.seriesLosses
      ? `${internationalSeries.userNationCode} LEADS ${internationalSeries.seriesWins} - ${internationalSeries.seriesLosses}`
      : internationalSeries.seriesLosses > internationalSeries.seriesWins
      ? `${internationalSeries.opponentNationCode} LEADS ${internationalSeries.seriesLosses} - ${internationalSeries.seriesWins}`
      : `SERIES LEVEL ${internationalSeries.seriesWins} - ${internationalSeries.seriesLosses}`;

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col justify-between max-w-7xl mx-auto w-full pb-24 select-none">
      {/* Top Header */}
      <div className="px-6 py-3.5 bg-[#0c121e] border-b border-slate-800/80 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-base font-black text-white font-display uppercase tracking-wide flex items-center gap-2">
              <Globe className="w-4 h-4 text-amber-400" />
              WORLD STAGE & NATIONS
            </h1>
            <span className="text-[11px] text-slate-400 font-mono">
              Managing: {coachedNation ? `${coachedNation.flag} ${coachedNation.name} Senior Men` : 'Domestic Franchise Only'}
            </span>
          </div>

          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            RANK #{currentRank || (coachedNation ? (rankingFormat === 't20' ? coachedNation.rankT20 : rankingFormat === 'odi' ? coachedNation.rankODI : coachedNation.rankTest) : '-')}
          </span>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 rounded-xl text-xs font-bold uppercase max-w-xl">
          <button
            onClick={() => { sound.playTap(); setActiveTab('rankings'); }}
            className={`py-1.5 rounded-lg transition-all ${
              activeTab === 'rankings' ? 'bg-amber-400 text-black shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            RANKINGS
          </button>
          <button
            onClick={() => { sound.playTap(); setActiveTab('duty'); }}
            className={`py-1.5 rounded-lg transition-all ${
              activeTab === 'duty' ? 'bg-amber-400 text-black shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            INTL TOURS
          </button>
          <button
            onClick={() => { sound.playTap(); setActiveTab('offers'); }}
            className={`py-1.5 rounded-lg transition-all ${
              activeTab === 'offers' ? 'bg-amber-400 text-black shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            JOB OFFERS
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 px-6 py-4 flex flex-col gap-4">
        {/* TAB 1: WORLD RANKINGS (Screenshot 6) */}
        {activeTab === 'rankings' && (
          <div className="flex flex-col gap-2.5">
            {/* Format buttons: T20I / ODI / TEST */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Official ICC World Rankings</span>
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg text-xs font-mono font-bold">
                {(['t20', 'odi', 'test'] as const).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => { sound.playTap(); setRankingFormat(fmt); }}
                    className={`px-2.5 py-1 rounded uppercase transition-all ${
                      rankingFormat === fmt ? 'bg-amber-400 text-black' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Rankings List */}
            <div className="bg-[#0f172a] rounded-3xl border border-slate-800 overflow-hidden text-xs">
              <div className="grid grid-cols-12 px-3 py-2 bg-slate-900 text-[10px] font-mono text-slate-400 border-b border-slate-800">
                <span className="col-span-1 text-center">#</span>
                <span className="col-span-7">NATION</span>
                <span className="col-span-2 text-center">RTG</span>
                <span className="col-span-2 text-right">STATUS</span>
              </div>

              {sortedNations.map((nation, idx) => {
                const isCoached = Boolean(coachedNation && nation.id === coachedNation.id);
                const rating = rankingFormat === 't20' ? nation.ratingT20 : rankingFormat === 'odi' ? nation.ratingODI : nation.ratingTest;

                return (
                  <div
                    key={nation.id}
                    className={`grid grid-cols-12 px-3 py-2.5 items-center border-b border-slate-800/50 ${
                      isCoached ? 'bg-amber-500/15' : ''
                    }`}
                  >
                    <span className="col-span-1 text-center font-mono font-bold text-slate-400">
                      {idx + 1}
                    </span>
                    <div className="col-span-7 flex items-center gap-2">
                      <span className="text-base">{nation.flag}</span>
                      <span className={`font-bold ${isCoached ? 'text-amber-300' : 'text-white'}`}>
                        {nation.name}
                      </span>
                    </div>
                    <span className="col-span-2 text-center font-mono-nums font-bold text-cyan-400">
                      {rating}
                    </span>
                    <span className="col-span-2 text-right text-[10px] font-mono text-slate-400">
                      {isCoached ? 'YOUR TEAM' : 'TEST NATION'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: INTL DUTY & CRICBUZZ 2026 TOUR CALENDAR */}
        {activeTab === 'duty' && (
          <div className="flex flex-col gap-3">
            {!coachedNation ? (
              <div className="bg-[#0f172a] border border-amber-500/30 rounded-3xl p-5 text-center flex flex-col items-center gap-3 shadow-xl">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-2xl">
                  🔒
                </div>
                <div>
                  <h3 className="text-base font-black text-white font-display uppercase tracking-wider mb-1">
                    NO NATIONAL TEAM APPOINTMENT
                  </h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                    You currently manage domestic franchise cricket only. International matches are unplayable for you until you accept an appointment as head coach of a national team.
                  </p>
                </div>
                <button
                  onClick={() => { sound.playTap(); setActiveTab('offers'); }}
                  className="py-3 px-6 bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
                >
                  SIGN NATIONAL CONTRACT / VIEW OFFERS 📜
                </button>
              </div>
            ) : (
              /* Active International Series for Coached Nation */
              <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black text-amber-400 font-display uppercase tracking-wider">
                    {internationalSeries.userNationName.toUpperCase()} TOUR OF {internationalSeries.opponentNationName.toUpperCase()} · T20I
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 font-bold">
                    {seriesStatusLabel}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-400 block mb-3">
                  5 T20I Series · {completedSeriesMatches.length} of {internationalSeries.matches.length} played · Head Coach: {coachedNation.name} {coachedNation.flag}
                </span>

                {/* Series Matches */}
                <div className="flex flex-col gap-2">
                  {completedSeriesMatches.map(m => (
                    <div key={m.matchNumber} className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-white">
                          {ordinals[m.matchNumber - 1] || `${m.matchNumber}th`} T20I ({m.city})
                        </span>
                        <span className="text-[10px] font-mono text-emerald-400">COMPLETED</span>
                      </div>
                      <span className="text-[11px] text-slate-300 font-mono block">
                        {m.summary}
                      </span>
                    </div>
                  ))}

                  {nextSeriesMatch ? (
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-700/80 text-xs shadow-md">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-white flex items-center gap-1.5">
                          <span>{internationalSeries.opponentNationFlag} v {internationalSeries.userNationFlag}</span>
                          <span>{ordinals[nextSeriesMatch.matchNumber - 1] || `${nextSeriesMatch.matchNumber}th`} T20I ({nextSeriesMatch.city})</span>
                        </span>
                        <span className="text-[10px] font-mono text-amber-400 font-bold px-1.5 py-0.5 rounded bg-amber-400/10 border border-amber-400/30">
                          LIVE MATCH READY
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 block mb-2.5">
                        {nextSeriesMatch.venue} · Pace & Bounce pitch
                      </span>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => {
                            sound.playCrowdCheer(0.8);
                            startInternationalMatch(
                              internationalSeries.opponentNationName,
                              internationalSeries.userNationName,
                              nextSeriesMatch.venue,
                              'T20'
                            );
                          }}
                          className="py-2 px-3 bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase rounded-lg tracking-wider flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 transition-all"
                        >
                          <span>🏏 PLAY LIVE T20I</span>
                        </button>
                        <button
                          onClick={() => {
                            sound.playTap();
                            startInternationalMatch(
                              internationalSeries.opponentNationName,
                              internationalSeries.userNationName,
                              nextSeriesMatch.venue,
                              'T20'
                            );
                            setTimeout(() => simEntireMatch(), 250);
                          }}
                          className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-400/30 font-bold text-xs uppercase rounded-lg tracking-wider flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                        >
                          <span>⚡ SIM MATCH</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-xs text-center">
                      <Trophy className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                      <span className="font-black text-emerald-300 uppercase block">
                        BILATERAL T20I SERIES CONCLUDED ({seriesStatusLabel})
                      </span>
                    </div>
                  )}

                  {/* Feature 6.6: ICC World Test Championship (5-Day Red-Ball Test) */}
                  <div className="p-3 rounded-xl bg-slate-900 border border-rose-500/30 text-xs shadow-md">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <span>🇦🇺 v {coachedNation.flag}</span>
                        <span>1st Test · ICC World Test Championship</span>
                      </span>
                      <span className="text-[10px] font-mono text-rose-400 font-bold px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/30">
                        {internationalSeries.wtcTestCompleted ? 'COMPLETED' : 'RED BALL · 5 DAYS'}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 block mb-2.5">
                      {internationalSeries.wtcTestSummary || 'Optus Stadium, Perth · Dukes/Kookaburra Seam & Reverse Swing'}
                    </span>
                    <button
                      onClick={() => {
                        sound.playCrowdCheer(0.8);
                        startInternationalMatch(
                          coachedNation.name === 'Australia' ? 'England' : 'Australia',
                          coachedNation.name,
                          'Optus Stadium, Perth',
                          'TEST'
                        );
                      }}
                      className="w-full py-2 px-3 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase rounded-lg tracking-wider flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
                    >
                      <span>🔴 {internationalSeries.wtcTestCompleted ? 'PLAY ANOTHER WTC TEST' : 'PLAY 5-DAY WTC TEST MATCH'}</span>
                    </button>
                  </div>
                </div>

                {/* Select World Cup Squad Button (Screenshot 2) */}
                <button
                  onClick={() => { sound.playTap(); setShowSquadSelector(true); }}
                  className="w-full mt-3 py-2.5 bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase rounded-xl tracking-wider flex items-center justify-center gap-2"
                >
                  <Users className="w-4 h-4" />
                  SELECT {coachedNation.name.toUpperCase()} WORLD CUP SQUAD ({nationalSquadIds.length}/15)
                </button>
              </div>
            )}

            {/* Official 2026 Cricbuzz International Tour Calendar */}
            <div className="bg-[#0f172a] border border-cyan-500/30 rounded-3xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-cyan-300 font-display uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-cyan-400" />
                  2026 INTERNATIONAL TOUR CALENDAR (CRICBUZZ)
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {CRICBUZZ_2026_INTL_TOURS.length} FIXTURES
                </span>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {CRICBUZZ_2026_INTL_TOURS.map(tour => (
                  <div
                    key={tour.id}
                    className="p-2.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[9px] font-mono font-bold text-amber-400">
                          {tour.dayOfWeek} {tour.dayNumber} {tour.month.toUpperCase()}
                        </span>
                        <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-mono font-bold">
                          {tour.format}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono truncate">
                          · {tour.seriesName}
                        </span>
                      </div>
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <span>{tour.homeFlag} {tour.homeCode}</span>
                        <span className="text-slate-500 text-[10px]">vs</span>
                        <span>{tour.awayFlag} {tour.awayCode}</span>
                        <span className="text-[10px] text-slate-400 font-normal truncate">
                          ({tour.venue.split(',')[0]})
                        </span>
                      </div>
                      {tour.completed && tour.resultSummary && (
                        <div className="text-[10px] font-mono text-emerald-400 mt-0.5">
                          {tour.resultSummary}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        sound.playTap();
                        startInternationalMatch(tour.homeNation, tour.awayNation, tour.venue, tour.format);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-[10px] font-mono shrink-0 ml-2 uppercase"
                    >
                      PLAY
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: JOB OFFERS (Screenshot 6) */}
        {activeTab === 'offers' && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Franchise & National vacancies</span>
              <span className="font-mono text-[10px]">CAREER MOVES</span>
            </div>

            {jobOffers.map(offer => (
              <div
                key={offer.id}
                className="bg-[#0f172a] border border-slate-800 rounded-3xl p-4 flex flex-col gap-2 relative overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display font-black text-base text-white uppercase">
                      {offer.name}
                    </h3>
                    <span className="text-xs text-slate-400">
                      {offer.organizationName} · {offer.leagueOrType}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    {offer.tag}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-mono">EXPECTATION</span>
                    <span className="font-bold text-slate-200">{offer.boardTarget}</span>
                  </div>
                  <button
                    onClick={() => acceptJobOffer(offer)}
                    className="px-4 py-2 bg-slate-800 hover:bg-amber-400 hover:text-black text-white font-bold text-xs uppercase rounded-xl transition-all"
                  >
                    ACCEPT OFFER ▶
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* National Squad Selector Modal (Screenshot 2) */}
      {showSquadSelector && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-sm max-h-[85vh] flex flex-col p-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="font-bold text-sm text-white">
                  Select {coachedNation?.name || 'National'} T20I Squad
                </h3>
                <span className="text-xs text-slate-400">
                  {selectedNationalPlayerIds.length} of 15 selected (First 11 form Starting XI)
                </span>
              </div>
              <button
                onClick={() => setShowSquadSelector(false)}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800"
              >
                ✕ Close
              </button>
            </div>

            <div className="overflow-y-auto py-2 flex flex-col gap-1.5 flex-1">
              {nationPool.map(p => {
                const isSelected = selectedNationalPlayerIds.includes(p.id);
                const slotIdx = selectedNationalPlayerIds.indexOf(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => handleToggleNationalPlayer(p.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-400 text-white'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div>
                      <span className="font-bold block text-white">
                        {isSelected ? `#${slotIdx + 1} ` : ''}{p.name}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {p.role} · BAT {p.ratings.bat} · BWL {p.ratings.bowl} · age {p.age}
                      </span>
                    </div>
                    {isSelected ? (
                      <span className="text-xs font-bold text-amber-400">
                        {slotIdx < 11 ? '✓ XI' : '✓ SQUAD'}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">+ ADD</span>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => {
                setNationalSquadIds(selectedNationalPlayerIds);
                sound.playCrowdCheer(0.7);
                setShowSquadSelector(false);
              }}
              className="mt-3 w-full py-3 bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase rounded-xl tracking-wider"
            >
              CONFIRM SQUAD ({selectedNationalPlayerIds.length}/15)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

