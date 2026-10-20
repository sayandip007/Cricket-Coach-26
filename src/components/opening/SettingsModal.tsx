import React, { useState } from 'react';
import { X, Settings, Lightbulb, RotateCcw, Folder, Edit3, ChevronRight, Volume2, VolumeX, Database, Trash2, Upload, Download } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { DataPortabilityModal } from '../data/DataPortabilityModal';
import { sound } from '../../utils/soundEffects';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenRosterEditor?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onOpenRosterEditor
}) => {
  const {
    settings,
    updateSettings,
    saveSlots,
    saveToSlot,
    loadFromSlot,
    deleteSlot,
    setActiveTab
  } = useGame();

  const [tipsResetNotice, setTipsResetNotice] = useState<boolean>(false);
  const [showSavesModal, setShowSavesModal] = useState<boolean>(false);
  const [showDataPortability, setShowDataPortability] = useState<boolean>(false);
  const [slotNotice, setSlotNotice] = useState<string | null>(null);
  const [soundVolume, setSoundVolume] = useState<number>(sound.volume);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(sound.enabled);

  if (!isOpen) return null;

  const handleResetCoachTips = () => {
    sound.playTap();
    updateSettings({ coachTips: true });
    setTipsResetNotice(true);
    setTimeout(() => setTipsResetNotice(false), 2000);
  };

  const triggerSlotNotice = (msg: string) => {
    setSlotNotice(msg);
    setTimeout(() => setSlotNotice(null), 2500);
  };

  const usedSlotsCount = saveSlots.filter(s => s.hasSave).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-fadeIn">
      <div className="w-full max-w-2xl bg-[#0e1422] border border-slate-700/80 rounded-3xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm font-black font-display tracking-wider text-white uppercase">
              SETTINGS
            </h2>
          </div>
          <button
            onClick={() => { sound.playTap(); onClose(); }}
            className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Coach tips */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-slate-800/80 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                <Lightbulb className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Coach tips</div>
                <div className="text-[11px] text-slate-400">
                  Show one-time hints at new screens to learn the game.
                </div>
              </div>
            </div>

            {/* iOS-style toggle */}
            <button
              onClick={() => {
                sound.playTap();
                updateSettings({ coachTips: !settings.coachTips });
              }}
              className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                settings.coachTips ? 'bg-amber-400' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-black shadow transform transition-transform ${
                  settings.coachTips ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {settings.coachTips && (
            <div className="pl-11 pt-1">
              <button
                onClick={handleResetCoachTips}
                className="flex items-center gap-2 text-xs font-bold text-amber-400 hover:text-amber-300 active:scale-95 transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset coach tips</span>
              </button>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {tipsResetNotice ? 'Hints reset successfully!' : 'Show every hint again from scratch.'}
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-800/80" />

        {/* FIX-06: Audio & Synthetic FX Volume Slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-slate-800/80 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                {soundEnabled && soundVolume > 0 ? (
                  <Volume2 className="w-4 h-4 text-amber-400" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-500" />
                )}
              </div>
              <div>
                <div className="text-xs font-bold text-white">Audio & Synthetic FX</div>
                <div className="text-[11px] text-slate-400">
                  Bat cracks, timber crash, crowd roar & auction gavel.
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                const next = !soundEnabled;
                sound.enabled = next;
                setSoundEnabled(next);
                if (next) sound.playTap();
              }}
              className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                soundEnabled ? 'bg-amber-400' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-black shadow transform transition-transform ${
                  soundEnabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {soundEnabled && (
            <div className="p-3 bg-[#141b2a] border border-slate-800 rounded-2xl flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Master Volume</span>
                <span className="text-amber-400 font-bold">{Math.round(soundVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={soundVolume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setSoundVolume(val);
                  sound.setVolume(val);
                }}
                className="w-full accent-amber-400 cursor-pointer h-1.5 bg-slate-700 rounded-lg appearance-none"
              />
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => sound.playBatHit(true, false)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-amber-300 rounded-lg border border-slate-700 active:scale-95"
                >
                  Test Bat Crack
                </button>
                <button
                  type="button"
                  onClick={() => sound.playWicketCrash()}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-rose-300 rounded-lg border border-slate-700 active:scale-95"
                >
                  Test Stumps
                </button>
                <button
                  type="button"
                  onClick={() => sound.playCrowdCheer(0.6)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-cyan-300 rounded-lg border border-slate-700 active:scale-95"
                >
                  Test Cheer
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-800/80" />

        {/* 2. Open tactics automatically */}
        <div className="space-y-2">
          <div className="text-xs font-bold text-white">Open tactics automatically</div>

          <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#141b2a] rounded-xl border border-slate-800">
            <button
              onClick={() => { sound.playTap(); updateSettings({ tacticsAuto: 'key_moments' }); }}
              className={`py-2 rounded-lg text-xs font-bold transition-all ${
                settings.tacticsAuto === 'key_moments'
                  ? 'bg-amber-400 text-black shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Key moments
            </button>
            <button
              onClick={() => { sound.playTap(); updateSettings({ tacticsAuto: 'every_over' }); }}
              className={`py-2 rounded-lg text-xs font-bold transition-all ${
                settings.tacticsAuto === 'every_over'
                  ? 'bg-amber-400 text-black shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Every over
            </button>
            <button
              onClick={() => { sound.playTap(); updateSettings({ tacticsAuto: 'never' }); }}
              className={`py-2 rounded-lg text-xs font-bold transition-all ${
                settings.tacticsAuto === 'never'
                  ? 'bg-amber-400 text-black shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Never
            </button>
          </div>

          <p className="text-[11px] text-slate-400 font-mono">
            {settings.tacticsAuto === 'key_moments' && 'At the start of each innings, when a new batter comes in and when the powerplay and death overs begin.'}
            {settings.tacticsAuto === 'every_over' && 'Before every over and after every wicket, plus the key moments.'}
            {settings.tacticsAuto === 'never' && 'Only when you tap TACTICS.'}
          </p>
        </div>

        <div className="border-t border-slate-800/80" />

        {/* 3. Match animations */}
        <div className="space-y-2">
          <div className="text-xs font-bold text-white">Match animations</div>

          <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#141b2a] rounded-xl border border-slate-800">
            <button
              onClick={() => { sound.playTap(); updateSettings({ matchAnimations: 'full' }); }}
              className={`py-2 rounded-lg text-xs font-bold transition-all ${
                settings.matchAnimations === 'full'
                  ? 'bg-amber-400 text-black shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Full
            </button>
            <button
              onClick={() => { sound.playTap(); updateSettings({ matchAnimations: 'quick' }); }}
              className={`py-2 rounded-lg text-xs font-bold transition-all ${
                settings.matchAnimations === 'quick'
                  ? 'bg-amber-400 text-black shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Quick
            </button>
            <button
              onClick={() => { sound.playTap(); updateSettings({ matchAnimations: 'classic' }); }}
              className={`py-2 rounded-lg text-xs font-bold transition-all ${
                settings.matchAnimations === 'classic'
                  ? 'bg-amber-400 text-black shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Classic
            </button>
          </div>

          <p className="text-[11px] text-slate-400 font-mono">
            {settings.matchAnimations === 'full' && 'Detailed, true to life animations. At 1x and 2x.'}
            {settings.matchAnimations === 'quick' && 'The same animations, with less time between balls.'}
            {settings.matchAnimations === 'classic' && 'The classic pitch, as before.'}
          </p>
        </div>

        <div className="border-t border-slate-800/80" />

        {/* 4. Manage saves */}
        <button
          onClick={() => { sound.playTap(); setShowSavesModal(!showSavesModal); }}
          className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#141b2a] hover:bg-[#1a2336] border border-slate-800 text-left transition-all active:scale-98"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-800/80 flex items-center justify-center text-amber-400">
              <Folder className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">Manage saves</div>
              <div className="text-[11px] text-slate-400">
                Browse, save, load, or delete any of your 3 save slots.
              </div>
            </div>
          </div>
          <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${showSavesModal ? 'rotate-90' : ''}`} />
        </button>

        {/* Saves slot manager */}
        {showSavesModal && (
          <div className="p-3 bg-[#0a0f1b] border border-slate-800 rounded-2xl space-y-2.5 mt-1">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                Save Slots ({usedSlotsCount} / 3 Used)
              </div>
              <button
                onClick={() => { sound.playTap(); setShowDataPortability(true); }}
                className="text-[10px] font-mono font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-950/50 border border-cyan-500/40 px-2 py-0.5 rounded-lg"
              >
                <Database className="w-3 h-3" />
                <span>JSON / CSV</span>
              </button>
            </div>

            {slotNotice && (
              <div className="p-2 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[11px] font-mono text-center">
                {slotNotice}
              </div>
            )}

            <div className="space-y-2 text-xs font-mono">
              {saveSlots.map(slot => (
                <div
                  key={slot.slotNumber}
                  className={`p-2.5 bg-slate-900 rounded-xl border flex justify-between items-center gap-2 ${
                    slot.hasSave ? 'border-amber-500/30' : 'border-slate-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span>{slot.logoEmoji}</span>
                      <span className="text-white font-bold truncate">
                        Slot {slot.slotNumber} {slot.slotNumber === 1 ? '(Primary)' : ''}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">
                      {slot.hasSave
                        ? `${slot.teamName} · ${slot.seasonName} (${slot.savedAt})`
                        : 'Empty Slot — Tap SAVE to store current career'}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => {
                        saveToSlot(slot.slotNumber);
                        triggerSlotNotice(`Saved ${slot.teamShortName !== '---' ? slot.teamShortName : 'career'} to Slot ${slot.slotNumber}!`);
                      }}
                      className="px-2 py-1 rounded bg-amber-400 hover:bg-amber-300 text-black text-[10px] font-bold flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>SAVE</span>
                    </button>
                    {slot.hasSave && (
                      <>
                        <button
                          onClick={() => {
                            const ok = loadFromSlot(slot.slotNumber);
                            if (ok) {
                              triggerSlotNotice(`Loaded Slot ${slot.slotNumber} (${slot.teamName})!`);
                            }
                          }}
                          className="px-2 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold flex items-center gap-1"
                        >
                          <Upload className="w-3 h-3" />
                          <span>LOAD</span>
                        </button>
                        <button
                          onClick={() => {
                            deleteSlot(slot.slotNumber);
                            triggerSlotNotice(`Cleared Slot ${slot.slotNumber}.`);
                          }}
                          className="p-1 rounded bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30"
                          title="Delete Slot"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. Roster editor */}
        <button
          onClick={() => {
            sound.playTap();
            onClose();
            if (onOpenRosterEditor) {
              onOpenRosterEditor();
            } else {
              setActiveTab('profile');
            }
          }}
          className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#141b2a] hover:bg-[#1a2336] border border-slate-800 text-left transition-all active:scale-98"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-800/80 flex items-center justify-center text-cyan-400">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">Roster editor</div>
              <div className="text-[11px] text-slate-400">
                Edit teams and players, build custom rosters for new careers, share them as files.
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      <DataPortabilityModal
        isOpen={showDataPortability}
        onClose={() => setShowDataPortability(false)}
      />
    </div>
  );
};
