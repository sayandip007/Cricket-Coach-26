import React, { useState } from 'react';
import { Sliders, Sprout, HelpCircle, Folder, Headphones, ArrowLeft, LogOut, X, Check, AlertTriangle } from 'lucide-react';
import { sound } from '../../utils/soundEffects';
import { useGame } from '../../context/GameContext';
import { PWAInstallButton } from '../common/PWAInstallButton';

interface MenuDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
  homePitch: string;
  onSelectPitch: (pitch: string) => void;
  onRetire: () => void;
  onOpenSaveManager?: () => void;
}

export const MenuDrawerModal: React.FC<MenuDrawerModalProps> = ({
  isOpen,
  onClose,
  homePitch,
  onSelectPitch,
  onRetire,
  onOpenSaveManager
}) => {
  const {
    setActiveTab,
    coachProfile,
    userTeam,
    currentLeagueId,
    leagues,
    achievements,
    saveSlots,
    saveToSlot,
    loadFromSlot,
    deleteSlot,
    activeSaveSlot
  } = useGame();
  const [showPitchOptions, setShowPitchOptions] = useState(false);
  const [showSaveSlots, setShowSaveSlots] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  if (!isOpen) return null;

  const pitchTypes = [
    { id: 'Natural', desc: 'Balanced bounce & carry. Equal contest.' },
    { id: 'Flat Track', desc: 'True bounce, heavy scoring, tough for pacers.' },
    { id: 'Dry Turner', desc: 'High spin grip & low bounce. Spinners paradise.' },
    { id: 'Green Seamer', desc: 'Generous grass cover. Seam and swing early.' },
    { id: 'Damp Pitch', desc: 'Slow surface, spongy bounce, rewards cutters.' }
  ];

  const handleShowNotification = (msg: string) => {
    sound.playTap();
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md mx-auto bg-[#131924] border-t border-slate-700/80 rounded-t-3xl shadow-2xl p-5 pb-8 max-h-[85vh] overflow-y-auto">
        {/* Drag handle */}
        <div className="w-12 h-1.5 bg-slate-600/70 rounded-full mx-auto mb-4" />

        {/* Title */}
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-slate-200 font-bold text-sm uppercase tracking-wider">
            <Sliders className="w-4 h-4 text-amber-400" />
            <span>MENU</span>
          </div>
          <button
            onClick={() => { sound.playTap(); onClose(); }}
            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {notification && (
          <div className="mb-4 p-2.5 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-emerald-300 text-xs font-medium text-center">
            {notification}
          </div>
        )}

        {/* Game Title Art Banner */}
        <div className="mb-5 relative rounded-2xl overflow-hidden border border-amber-500/30 bg-[#080d18] shadow-lg">
          <div className="flex items-center gap-3 p-2.5">
            <img
              src="/assets/aistudio/file_000000009f3481faad2d0f6e1e900053_77824179.png"
              alt="Cricket Coach 26"
              referrerPolicy="no-referrer"
              className="w-16 h-12 rounded-xl object-cover border border-amber-500/40 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-black font-display tracking-wider text-white uppercase truncate">
                CRICKET COACH 26
              </div>
              <div className="text-[10px] text-amber-400 font-mono truncate">
                {userTeam.name.toUpperCase()} · SLOT {activeSaveSlot}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                Head Coach: {coachProfile.name}
              </div>
            </div>
          </div>
        </div>

        {/* CLUB SECTION */}
        <div className="mb-5">
          <span className="text-[10px] font-mono font-bold tracking-widest text-slate-400 uppercase block mb-2">
            CLUB
          </span>
          <button
            onClick={() => { sound.playTap(); setShowPitchOptions(!showPitchOptions); }}
            className="w-full flex items-start gap-3.5 p-3 rounded-2xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/80 transition-all text-left"
          >
            <Sprout className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="text-sm font-semibold text-white block">
                Home pitch: {homePitch}
              </span>
              <span className="text-xs text-slate-400">
                Tell the curator how to prepare your home ground.
              </span>
            </div>
          </button>

          {/* Pitch options popup */}
          {showPitchOptions && (
            <div className="mt-2 ml-4 p-2 rounded-2xl bg-slate-900 border border-slate-700/80 space-y-1">
              {pitchTypes.map(pt => (
                <button
                  key={pt.id}
                  onClick={() => {
                    sound.playTap();
                    onSelectPitch(pt.id);
                    setShowPitchOptions(false);
                    handleShowNotification(`Home pitch updated to ${pt.id}!`);
                  }}
                  className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition-all ${
                    homePitch === pt.id ? 'bg-amber-400 text-black font-bold' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div>
                    <span className="block font-bold">{pt.id}</span>
                    <span className="text-[10px] opacity-80">{pt.desc}</span>
                  </div>
                  {homePitch === pt.id && <Check className="w-4 h-4 shrink-0 ml-2" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* HELP SECTION */}
        <div className="mb-5">
          <span className="text-[10px] font-mono font-bold tracking-widest text-slate-400 uppercase block mb-2">
            HELP
          </span>
          <button
            onClick={() => handleShowNotification("Tactics: Set pitch line & length on the 2D stadium map. Fielders: Drag all 9 fielders to set traps. Manage stamina between match days!")}
            className="w-full flex items-start gap-3.5 p-3 rounded-2xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/80 transition-all text-left"
          >
            <HelpCircle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-sm font-semibold text-white block">
                How to play
              </span>
              <span className="text-xs text-slate-400">
                Tactics, stats and every screen explained.
              </span>
            </div>
          </button>
        </div>

        {/* SAVES SECTION */}
        <div>
          <span className="text-[10px] font-mono font-bold tracking-widest text-slate-400 uppercase block mb-2">
            SAVES
          </span>
          <div className="space-y-1.5">
            <button
              onClick={() => {
                sound.playTap();
                setShowSaveSlots(!showSaveSlots);
              }}
              className="w-full flex items-start gap-3.5 p-3 rounded-2xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/80 transition-all text-left"
            >
              <Folder className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="text-sm font-semibold text-white block">
                  Load another save...
                </span>
                <span className="text-xs text-slate-400">
                  Switch into a different save slot or export/import JSON & CSV.
                </span>
              </div>
            </button>

            {showSaveSlots && (
              <div className="p-3 rounded-2xl bg-[#0b101c] border border-slate-800 space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-amber-400 font-bold uppercase">Save Slots (1–3)</span>
                  {onOpenSaveManager && (
                    <button
                      onClick={() => {
                        sound.playTap();
                        onClose();
                        onOpenSaveManager();
                      }}
                      className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold hover:bg-cyan-500/30"
                    >
                      JSON / CSV PORTABILITY →
                    </button>
                  )}
                </div>

                {saveSlots.map(slot => (
                  <div
                    key={slot.slotNumber}
                    className="p-2 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-white font-bold truncate">
                        {slot.logoEmoji} Slot {slot.slotNumber}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {slot.hasSave ? `${slot.teamName} · ${slot.savedAt}` : 'Empty Slot'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          saveToSlot(slot.slotNumber);
                          handleShowNotification(`Saved current career to Slot ${slot.slotNumber}!`);
                        }}
                        className="px-2 py-1 rounded bg-amber-400 text-black text-[10px] font-bold"
                      >
                        SAVE
                      </button>
                      {slot.hasSave && (
                        <>
                          <button
                            onClick={() => {
                              const ok = loadFromSlot(slot.slotNumber);
                              if (ok) {
                                handleShowNotification(`Loaded Slot ${slot.slotNumber} (${slot.teamName})!`);
                              }
                            }}
                            className="px-2 py-1 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold"
                          >
                            LOAD
                          </button>
                          <button
                            onClick={() => {
                              deleteSlot(slot.slotNumber);
                              handleShowNotification(`Deleted Slot ${slot.slotNumber}.`);
                            }}
                            className="px-1.5 py-1 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[10px] font-bold"
                          >
                            ✕
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => {
                const activeLeague = leagues.find(l => l.id === currentLeagueId) || leagues[0];
                const payload = JSON.stringify({
                  app: 'Cricket Coach 26',
                  version: '1.13.0',
                  timestamp: new Date().toISOString(),
                  coachProfile,
                  team: {
                    id: userTeam.id,
                    name: userTeam.name,
                    shortName: userTeam.shortName,
                    purseCr: userTeam.purseCr,
                    playingXIIds: userTeam.playingXIIds
                  },
                  leagueId: currentLeagueId,
                  standings: activeLeague?.standings || [],
                  unlockedAchievements: achievements.filter(a => a.unlocked).map(a => a.id),
                  homePitch
                }, null, 2);
                if (navigator?.clipboard?.writeText) {
                  navigator.clipboard.writeText(payload).catch(() => {});
                }
                handleShowNotification(`Full career JSON (${userTeam.shortName}) copied to clipboard for support!`);
              }}
              className="w-full flex items-start gap-3.5 p-3 rounded-2xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/80 transition-all text-left"
            >
              <Headphones className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-sm font-semibold text-white block">
                  Send save to support
                </span>
                <span className="text-xs text-slate-400">
                  Stuck or something wrong? Share this career so it can be fixed.
                </span>
              </div>
            </button>

            <button
              onClick={() => {
                sound.playTap();
                onClose();
                setActiveTab('landing');
              }}
              className="w-full flex items-start gap-3.5 p-3 rounded-2xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/80 transition-all text-left"
            >
              <ArrowLeft className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-sm font-semibold text-white block">
                  Back to title screen
                </span>
                <span className="text-xs text-slate-400">
                  Career is automatically saved.
                </span>
              </div>
            </button>

            {!confirmRetire ? (
              <button
                onClick={() => {
                  sound.playTap();
                  setConfirmRetire(true);
                }}
                className="w-full flex items-start gap-3.5 p-3 rounded-2xl bg-rose-950/20 hover:bg-rose-900/30 border border-rose-900/40 transition-all text-left group"
              >
                <LogOut className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-sm font-semibold text-rose-400 block group-hover:text-rose-300">
                    Retire from management
                  </span>
                  <span className="text-xs text-rose-400/70">
                    End your career now. Your record is kept in your legacy.
                  </span>
                </div>
              </button>
            ) : (
              <div className="p-3 bg-rose-950/50 border border-rose-500/60 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-rose-300 text-xs font-bold">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Permanently archive this career and retire?</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      sound.playCrowdCheer(0.8);
                      onRetire();
                      onClose();
                      setActiveTab('landing');
                    }}
                    className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase rounded-xl"
                  >
                    CONFIRM RETIRE
                  </button>
                  <button
                    onClick={() => setConfirmRetire(false)}
                    className="px-3 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
