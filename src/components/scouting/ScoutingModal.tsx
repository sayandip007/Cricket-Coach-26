import React, { useState } from 'react';
import { X, Binoculars, UserPlus, GraduationCap, Check } from 'lucide-react';
import { UncappedProspect } from '../../types/cricket';
import { useGame } from '../../context/GameContext';
import { sound } from '../../utils/soundEffects';

interface ScoutingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const INITIAL_PROSPECTS: UncappedProspect[] = [
  {
    id: 'scout_ayush_sharma',
    name: 'Ayush Sharma',
    age: 18,
    role: 'Top-order',
    primaryRole: 'Aggressive opening batter',
    bowlingArm: 'ROB',
    battingHand: 'RHB',
    country: 'India',
    currentRating: 75,
    potentialCeiling: 94,
    scoutingGrade: 'S-Tier',
    tournamentSource: 'ICC U-19 World Cup',
    assignedCoach: 'batting',
    signed: false
  },
  {
    id: 'scout_manan_hingorani',
    name: 'Manan Hingorani',
    age: 19,
    role: 'Spin',
    primaryRole: 'Left-arm wrist spin mystery',
    bowlingArm: 'LS',
    battingHand: 'LHB',
    country: 'India',
    currentRating: 74,
    potentialCeiling: 92,
    scoutingGrade: 'A+',
    tournamentSource: 'Syed Mushtaq Ali Trophy',
    assignedCoach: 'bowling',
    signed: false
  },
  {
    id: 'scout_samir_khilji',
    name: 'Samir Khilji',
    age: 20,
    role: 'Pace',
    primaryRole: '148kph sling pacer & yorker specialist',
    bowlingArm: 'RAF',
    battingHand: 'RHB',
    country: 'India',
    currentRating: 76,
    potentialCeiling: 96,
    scoutingGrade: 'Prodigy',
    tournamentSource: 'Ranji Trophy',
    assignedCoach: 'none',
    signed: false
  },
  {
    id: 'scout_dev_rathore',
    name: 'Dev Rathore',
    age: 19,
    role: 'All-rounder',
    primaryRole: 'Finisher & medium-pace cutter bowler',
    bowlingArm: 'RAF',
    battingHand: 'LHB',
    country: 'India',
    currentRating: 73,
    potentialCeiling: 89,
    scoutingGrade: 'A+',
    tournamentSource: 'Syed Mushtaq Ali Trophy',
    assignedCoach: 'none',
    signed: false
  }
];

export const ScoutingModal: React.FC<ScoutingModalProps> = ({ isOpen, onClose }) => {
  const { userTeam, players, setPlayers, setTeams, unlockAchievement } = useGame();
  const [prospects, setProspects] = useState<UncappedProspect[]>(() => {
    const saved = localStorage.getItem('ms_scout_prospects');
    return saved ? JSON.parse(saved) : INITIAL_PROSPECTS;
  });

  const [activeTab, setActiveTab] = useState<'prospects' | 'missions'>('prospects');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSignProspect = (prospect: UncappedProspect) => {
    sound.playGavel();
    const updated = prospects.map(p => p.id === prospect.id ? { ...p, signed: true } : p);
    setProspects(updated);
    localStorage.setItem('ms_scout_prospects', JSON.stringify(updated));
    unlockAchievement('ach_39');
    if (updated.filter(p => p.signed).length >= 5) {
      unlockAchievement('ach_40');
    }

    // Also promote prospect to active userTeam squad if not already present
    if (!players.some(p => p.id === prospect.id)) {
      const isBowler = prospect.role === 'Pace' || prospect.role === 'Spin';
      const newPlayer = {
        id: prospect.id,
        name: prospect.name,
        jerseyNumber: 90 + Math.floor(Math.random() * 9),
        role: prospect.role,
        primaryRole: prospect.primaryRole,
        bowlingArm: prospect.bowlingArm,
        battingHand: prospect.battingHand,
        age: prospect.age,
        country: prospect.country,
        clubId: userTeam.id,
        isOverseas: false,
        tier: 'Silver' as const,
        basePriceCr: 0.2,
        salaryCr: 0.2,
        form: 88,
        morale: 95,
        fitness: 98,
        isInjured: false,
        injuryDays: 0,
        stats: {
          matches: 4,
          runs: isBowler ? 28 : 165,
          balls: isBowler ? 22 : 112,
          fours: isBowler ? 2 : 18,
          sixes: isBowler ? 1 : 8,
          fifties: isBowler ? 0 : 1,
          hundreds: 0,
          highestScore: isBowler ? 16 : 68,
          wickets: isBowler ? 9 : 1,
          oversBowled: isBowler ? 16 : 2,
          runsConceded: isBowler ? 112 : 18,
          maidens: 1,
          bestBowling: isBowler ? '3/19' : '1/18'
        },
        ratings: {
          bat: isBowler ? 55 : prospect.currentRating,
          pow: isBowler ? 58 : prospect.currentRating + 3,
          tec: prospect.currentRating,
          tmp: 82,
          agg: 84,
          sty: 80,
          run: 85,
          vp: 78,
          vs: 78,
          bowl: isBowler ? prospect.currentRating + 4 : 48,
          pace: isBowler ? prospect.currentRating + 5 : 50,
          ctrl: isBowler ? prospect.currentRating + 2 : 55,
          var: 80,
          dth: 78,
          comp: 80,
          cat: 82,
          fld: 85,
          fit: 95
        }
      };

      const nextPlayers = [...players, newPlayer];
      setPlayers(nextPlayers);
      localStorage.setItem('ms_players_csv_v2', JSON.stringify(nextPlayers));
      setTeams(prev => prev.map(t => t.id === userTeam.id ? { ...t, squad: [...t.squad, newPlayer] } : t));
    }

    showToast(`Signed ${prospect.name} to ${userTeam.name} Academy & First-Team Squad!`);
  };

  const handleAssignCoach = (prospectId: string, coachType: 'batting' | 'bowling') => {
    sound.playTap();
    const updated = prospects.map(p => p.id === prospectId ? { ...p, assignedCoach: coachType } : p);
    setProspects(updated);
    localStorage.setItem('ms_scout_prospects', JSON.stringify(updated));
    showToast(`Assigned ${coachType.toUpperCase()} specialist coach! Weekly growth boosted +25%.`);
  };

  const handleDeployScout = (tournament: string, costCr: number) => {
    if (userTeam.purseCr < costCr) {
      sound.playTap();
      showToast(`Insufficient purse (₹${userTeam.purseCr.toFixed(2)} Cr) to deploy scouts!`);
      return;
    }
    sound.playCrowdCheer(0.6);

    const candidateTemplates: Omit<UncappedProspect, 'id'>[] = [
      {
        name: 'Aarav Suryavanshi',
        age: 17,
        role: 'Top-order',
        primaryRole: '360° fearless powerplay dasher',
        bowlingArm: 'ROB',
        battingHand: 'LHB',
        country: 'India',
        currentRating: 77,
        potentialCeiling: 96,
        scoutingGrade: 'Prodigy',
        tournamentSource: tournament,
        assignedCoach: 'batting',
        signed: false
      },
      {
        name: 'Zeeshan Tyagi',
        age: 19,
        role: 'Pace',
        primaryRole: '151kph left-arm thunderbolt pacer',
        bowlingArm: 'LAF',
        battingHand: 'LHB',
        country: 'India',
        currentRating: 76,
        potentialCeiling: 95,
        scoutingGrade: 'S-Tier',
        tournamentSource: tournament,
        assignedCoach: 'bowling',
        signed: false
      },
      {
        name: 'Karthikeya Nair',
        age: 18,
        role: 'Wk-bat',
        primaryRole: 'explosive gloveman & spin basher',
        bowlingArm: 'ROB',
        battingHand: 'RHB',
        country: 'India',
        currentRating: 75,
        potentialCeiling: 93,
        scoutingGrade: 'S-Tier',
        tournamentSource: tournament,
        assignedCoach: 'batting',
        signed: false
      },
      {
        name: 'Rudra Pratap Bishnoi',
        age: 19,
        role: 'Spin',
        primaryRole: 'Carrom-ball & wrong-un specialist',
        bowlingArm: 'LS',
        battingHand: 'RHB',
        country: 'India',
        currentRating: 76,
        potentialCeiling: 94,
        scoutingGrade: 'Prodigy',
        tournamentSource: tournament,
        assignedCoach: 'bowling',
        signed: false
      }
    ];

    const availableTemplate = candidateTemplates.find(
      tpl => !prospects.some(p => p.name === tpl.name)
    ) || {
      ...candidateTemplates[prospects.length % candidateTemplates.length],
      name: `${candidateTemplates[prospects.length % candidateTemplates.length].name} II`
    };

    const newProspect: UncappedProspect = {
      ...availableTemplate,
      id: `scout_${Date.now()}`
    };

    const updatedProspects = [newProspect, ...prospects];
    setProspects(updatedProspects);
    localStorage.setItem('ms_scout_prospects', JSON.stringify(updatedProspects));
    setTeams(prev =>
      prev.map(t =>
        t.id === userTeam.id
          ? { ...t, purseCr: Math.max(0, Number((t.purseCr - costCr).toFixed(2))) }
          : t
      )
    );
    setActiveTab('prospects');
    showToast(`Scouted ${newProspect.name} (${newProspect.scoutingGrade}) from ${tournament}! (-₹${costCr} Cr)`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 select-none animate-fadeIn">
      <div className="bg-[#0b101c] border border-cyan-500/40 rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 bg-[#0f172a] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Binoculars className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white font-display uppercase tracking-wider flex items-center gap-1.5">
                SCOUTING & TALENT ACADEMY
              </h2>
              <span className="text-[10px] text-slate-400 font-mono">
                {userTeam.name} Youth Complex · Uncapped Wonderkids
              </span>
            </div>
          </div>
          <button
            onClick={() => { sound.playTap(); onClose(); }}
            className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-5 pt-3">
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800">
            <button
              onClick={() => { sound.playTap(); setActiveTab('prospects'); }}
              className={`py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                activeTab === 'prospects' ? 'bg-amber-400 text-black shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              PROSPECTS ({prospects.length})
            </button>
            <button
              onClick={() => { sound.playTap(); setActiveTab('missions'); }}
              className={`py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                activeTab === 'missions' ? 'bg-amber-400 text-black shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              DEPLOY SCOUTS
            </button>
          </div>
        </div>

        {toastMessage && (
          <div className="mx-5 mt-2 p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-mono text-center">
            {toastMessage}
          </div>
        )}

        {/* Content Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-3">
          {activeTab === 'prospects' && (
            <div className="flex flex-col gap-3">
              {prospects.map(p => (
                <div
                  key={p.id}
                  className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 flex flex-col gap-2.5 transition-all shadow-md"
                >
                  {/* Top line with badges */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-black text-white font-display flex items-center gap-1.5">
                        <span>{p.name}</span>
                        <span className="text-[10px] font-mono text-slate-400">({p.age}y · {p.battingHand}/{p.bowlingArm})</span>
                      </h4>
                      <span className="text-[10px] text-cyan-300 font-mono">
                        {p.primaryRole} · {p.tournamentSource}
                      </span>
                    </div>

                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                      p.scoutingGrade === 'Prodigy'
                        ? 'bg-purple-950/70 border-purple-500 text-purple-300 shadow-sm'
                        : p.scoutingGrade === 'S-Tier'
                        ? 'bg-amber-950/70 border-amber-500 text-amber-300'
                        : 'bg-cyan-950/70 border-cyan-500 text-cyan-300'
                    }`}>
                      ★ {p.scoutingGrade}
                    </span>
                  </div>

                  {/* Rating & Ceiling Progress Bar */}
                  <div className="bg-[#0b101c] p-2 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-mono">
                    <div>
                      <span className="text-[9px] text-slate-400 block">CURRENT</span>
                      <span className="text-white font-black">{p.currentRating} OVR</span>
                    </div>
                    <div className="flex-1 mx-3">
                      <div className="flex items-center justify-between text-[9px] text-slate-400 mb-0.5">
                        <span>Development Ceiling</span>
                        <span className="text-amber-400 font-bold">{p.potentialCeiling} MAX</span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-amber-400 rounded-full"
                          style={{ width: `${(p.currentRating / p.potentialCeiling) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] text-slate-400 block">COACH</span>
                      <span className="text-cyan-400 font-bold text-[10px] uppercase">
                        {p.assignedCoach ? p.assignedCoach : 'None'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1">
                    {p.signed ? (
                      <span className="flex-1 py-1.5 px-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-400 text-xs font-bold font-mono text-center flex items-center justify-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        ACADEMY CONTRACT SIGNED
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSignProspect(p)}
                        className="flex-1 py-2 bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase rounded-xl tracking-wider flex items-center justify-center gap-1.5 shadow active:scale-95 transition-all"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        SIGN ACADEMY CONTRACT (₹0.2 Cr)
                      </button>
                    )}

                    {p.signed && (
                      <button
                        onClick={() => handleAssignCoach(p.id, p.role === 'Pace' || p.role === 'Spin' ? 'bowling' : 'batting')}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-mono font-bold flex items-center gap-1 active:scale-95"
                      >
                        <GraduationCap className="w-3.5 h-3.5 text-amber-400" />
                        ASSIGN COACH
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'missions' && (
            <div className="flex flex-col gap-3">
              {[
                {
                  title: 'Ranji Trophy Scouting Drive',
                  region: 'Domestic Red-Ball',
                  description: 'Uncover disciplined, high-technique middle-order anchors and conventional swing pacers.',
                  costCr: 0.5,
                  duration: '3 Match Days',
                  yield: 'Top-tier first class prodigies'
                },
                {
                  title: 'Syed Mushtaq Ali T20 Blitz',
                  region: 'Domestic T20 Leagues',
                  description: 'Target fearless boundary strikers, left-arm angles, and mystery leg-spinners for franchise death overs.',
                  costCr: 0.75,
                  duration: '2 Match Days',
                  yield: 'Power hitters & mystery spinners'
                },
                {
                  title: 'ICC Under-19 World Championship',
                  region: 'Global Youth Circuit',
                  description: 'Deploy elite international scouts to scout raw teenage wonderkids with 95+ potential ceilings.',
                  costCr: 1.2,
                  duration: '4 Match Days',
                  yield: 'Generational S-Tier talent'
                }
              ].map((m, i) => (
                <div key={i} className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col gap-2 shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black text-white uppercase font-display">{m.title}</h4>
                      <span className="text-[10px] text-slate-400 font-mono">{m.region} · {m.duration}</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                      ₹{m.costCr} Cr
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-snug">{m.description}</p>
                  <button
                    onClick={() => handleDeployScout(m.title, m.costCr)}
                    className="mt-1 w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xs uppercase rounded-xl tracking-wider shadow-md active:scale-95 transition-all"
                  >
                    DEPLOY SCOUTS TO MISSION
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
