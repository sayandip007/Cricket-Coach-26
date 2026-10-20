import React, { useState, useRef } from 'react';
import { Download, Upload, FileText, CheckCircle2, AlertTriangle, X, Database } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { Player, PlayerRole } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';

interface DataPortabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DataPortabilityModal: React.FC<DataPortabilityModalProps> = ({ isOpen, onClose }) => {
  const { players, setPlayers, teams, setTeams, coachProfile, updateCoachProfile, leagues, achievements } = useGame();
  const [activeTab, setActiveTab] = useState<'export' | 'import_json' | 'import_csv'>('export');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const showNotification = (msg: string, success: boolean = true) => {
    setStatusMessage(msg);
    setIsSuccess(success);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // 1. JSON SAVE EXPORT
  const handleExportJson = () => {
    sound.playTap();
    try {
      const exportData = {
        app: 'Cricket Coach 26',
        version: '2.0.0',
        exportedAt: new Date().toISOString(),
        coachProfile,
        teams,
        players,
        leagues,
        achievements
      };

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cricket_coach_26_save_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showNotification('Career save JSON exported successfully!');
    } catch {
      showNotification('Failed to export career save.', false);
    }
  };

  // 2. JSON SAVE IMPORT
  const handleJsonFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    sound.playTap();
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        if (!parsed.players || !parsed.teams) {
          showNotification('Invalid save file format. Missing core datasets.', false);
          return;
        }

        if (Array.isArray(parsed.players)) {
          setPlayers(parsed.players);
          localStorage.setItem('ms_players_csv_v2', JSON.stringify(parsed.players));
        }

        if (Array.isArray(parsed.teams)) {
          setTeams(parsed.teams);
          localStorage.setItem('ms_teams_csv_v2', JSON.stringify(parsed.teams));
        }

        if (parsed.coachProfile) {
          updateCoachProfile(parsed.coachProfile);
        }

        sound.playCrowdCheer(0.8);
        showNotification(`Career save loaded successfully! ${parsed.players.length} players and ${parsed.teams.length} teams restored.`);
      } catch {
        showNotification('Failed to read JSON save file. Corrupt syntax.', false);
      }
    };
    reader.readAsText(file);
  };

  // 3. CUSTOM CSV ROSTER IMPORT
  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    sound.playTap();
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);

        if (lines.length < 2) {
          showNotification('CSV file is empty or missing headers.', false);
          return;
        }

        // Parse CSV rows: Expecting columns like: Name, Role, Bat, Bowl, Pow, Country, Club
        const newPlayers: Player[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
          if (cols.length >= 3 && cols[0]) {
            const name = cols[0];
            const roleStr = cols[1]?.toLowerCase() || 'middle-order';
            const role: PlayerRole = roleStr.includes('top') ? 'Top-order'
              : roleStr.includes('wk') || roleStr.includes('keep') ? 'Wk-bat'
              : roleStr.includes('all') ? 'All-rounder'
              : roleStr.includes('spin') ? 'Spin'
              : roleStr.includes('pace') || roleStr.includes('fast') ? 'Pace'
              : 'Middle-order';

            const bat = parseInt(cols[2], 10) || 75;
            const bowl = parseInt(cols[3], 10) || 50;
            const pow = parseInt(cols[4], 10) || 75;
            const country = cols[5] || 'India';
            const clubId = cols[6] || 'team_kol';
            const isOverseas = country.toLowerCase() !== 'india';

            newPlayers.push({
              id: `custom_${Date.now()}_${i}`,
              name,
              jerseyNumber: (i % 99) + 1,
              role,
              primaryRole: cols[1] || 'Player',
              bowlingArm: 'RAF',
              battingHand: 'RHB',
              age: 24,
              country,
              clubId,
              isOverseas,
              tier: Math.max(bat, bowl) >= 88 ? 'Platinum' : Math.max(bat, bowl) >= 82 ? 'Gold' : 'Silver',
              basePriceCr: 1.0,
              salaryCr: 6.0,
              form: 85,
              morale: 90,
              fitness: 95,
              isInjured: false,
              injuryDays: 0,
              stats: {
                matches: 15,
                runs: 420,
                balls: 290,
                fours: 38,
                sixes: 18,
                fifties: 3,
                hundreds: 0,
                highestScore: 78,
                wickets: 12,
                oversBowled: 36,
                runsConceded: 295,
                maidens: 0,
                bestBowling: '3/24'
              },
              ratings: {
                bat,
                pow,
                tec: bat,
                tmp: 80,
                agg: 75,
                sty: 75,
                run: 75,
                vp: 75,
                vs: 75,
                bowl,
                pace: bowl,
                ctrl: 75,
                var: 75,
                dth: 75,
                comp: 75,
                cat: 75,
                fld: 75,
                fit: 90
              }
            });
          }
        }

        if (newPlayers.length > 0) {
          const merged = [...players, ...newPlayers];
          setPlayers(merged);
          localStorage.setItem('ms_players_csv_v2', JSON.stringify(merged));
          sound.playCrowdCheer(0.8);
          showNotification(`Imported ${newPlayers.length} custom players from CSV!`);
        } else {
          showNotification('No valid player rows found in CSV.', false);
        }
      } catch {
        showNotification('Error parsing CSV file format.', false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 select-none animate-fadeIn">
      <div className="bg-[#0b101c] border border-cyan-500/40 rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 bg-[#0f172a] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-sm font-black text-white font-display uppercase tracking-wide">
                DATA PORTABILITY & COMMUNITY ROSTERS
              </h2>
              <span className="text-[10px] text-slate-400 font-mono">
                JSON Backup/Restore & Custom CSV Importers
              </span>
            </div>
          </div>
          <button
            onClick={() => { sound.playTap(); onClose(); }}
            className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-5 pt-3">
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 text-[11px] font-mono font-bold">
            <button
              onClick={() => { sound.playTap(); setActiveTab('export'); }}
              className={`py-1.5 rounded-lg uppercase transition-all ${
                activeTab === 'export' ? 'bg-amber-400 text-black shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              1. EXPORT JSON
            </button>
            <button
              onClick={() => { sound.playTap(); setActiveTab('import_json'); }}
              className={`py-1.5 rounded-lg uppercase transition-all ${
                activeTab === 'import_json' ? 'bg-amber-400 text-black shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              2. LOAD SAVE
            </button>
            <button
              onClick={() => { sound.playTap(); setActiveTab('import_csv'); }}
              className={`py-1.5 rounded-lg uppercase transition-all ${
                activeTab === 'import_csv' ? 'bg-amber-400 text-black shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              3. CSV ROSTER
            </button>
          </div>
        </div>

        {statusMessage && (
          <div className={`mx-5 mt-2 p-2.5 rounded-xl text-xs font-mono text-center flex items-center justify-center gap-2 border ${
            isSuccess ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
          }`}>
            {isSuccess ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Tab Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {/* TAB 1: EXPORT JSON */}
          {activeTab === 'export' && (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                <span className="text-xs font-black text-white uppercase font-display block">
                  ONE-CLICK CAREER STATE EXPORT
                </span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Export your entire career save into a standalone transferable JSON file. Includes all 10 IPL franchises, custom rosters, standings, auction history, and coach profile.
                </p>
                <div className="pt-2">
                  <button
                    onClick={handleExportJson}
                    className="w-full py-3.5 bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase rounded-xl tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
                  >
                    <Download className="w-4 h-4" />
                    DOWNLOAD CAREER SAVE (.JSON)
                  </button>
                </div>
              </div>

              <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800 text-[11px] text-slate-400 font-mono">
                Active dataset: {players.length} Players · {teams.length} Teams · 10 IPL Franchises
              </div>
            </div>
          )}

          {/* TAB 2: IMPORT JSON SAVE */}
          {activeTab === 'import_json' && (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                <span className="text-xs font-black text-white uppercase font-display block">
                  RESTORE PREVIOUS CAREER SAVE
                </span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Select a previously exported Cricket Coach 26 `.json` save file from your device to restore your exact season progression and franchise rosters.
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleJsonFileUpload}
                  className="hidden"
                />

                <div className="pt-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-3.5 bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xs uppercase rounded-xl tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-95 transition-all"
                  >
                    <Upload className="w-4 h-4" />
                    CHOOSE SAVE FILE (.JSON)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CUSTOM CSV ROSTER IMPORTER */}
          {activeTab === 'import_csv' && (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                <span className="text-xs font-black text-white uppercase font-display block">
                  CUSTOM COMMUNITY ROSTER IMPORT (CSV)
                </span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Import custom historical tournament rosters (e.g. All-Time XI, IPL 2008 Classic, 90s World Cup) via CSV format.
                </p>

                <div className="p-2.5 rounded-xl bg-black/60 border border-slate-800 font-mono text-[10px] text-slate-400">
                  <span className="text-amber-400 block font-bold mb-1">Expected CSV Column Header Format:</span>
                  Name, Role, Bat, Bowl, Pow, Country, ClubId
                </div>

                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvFileUpload}
                  className="hidden"
                />

                <div className="pt-2">
                  <button
                    onClick={() => csvInputRef.current?.click()}
                    className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase rounded-xl tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                  >
                    <FileText className="w-4 h-4" />
                    SELECT ROSTER FILE (.CSV)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
