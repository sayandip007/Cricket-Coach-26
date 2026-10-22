import React, { useState } from 'react';
import { Trophy, ChevronRight, Play, Settings, Info, X, Folder, Gavel } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { SettingsModal } from './SettingsModal';
import { AchievementsScreen } from './AchievementsScreen';
import { AuctionSandboxModal } from '../auction/AuctionSandboxModal';
import { sound } from '../../utils/soundEffects';

export const OpeningLandingScreen: React.FC = () => {
  const {
    setActiveTab,
    userTeam,
    coachProfile,
    teams,
    startAuctionSession,
    startNewCareer,
    saveSlots,
    activeSaveSlot,
    loadFromSlot
  } = useGame();
  const [showSettings, setShowSettings] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showNewGameModal, setShowNewGameModal] = useState(false);
  const [showSandboxModal, setShowSandboxModal] = useState(false);
  const [newGameSlot, setNewGameSlot] = useState<1 | 2 | 3>(() => {
    const empty = saveSlots.find(s => !s.hasSave);
    return empty ? empty.slotNumber : activeSaveSlot;
  });
  const [newCoachName, setNewCoachName] = useState<string>(coachProfile.name || 'Arjun Rao');
  const [imageError, setImageError] = useState(false);

  if (showAchievements) {
    return <AchievementsScreen onBack={() => setShowAchievements(false)} />;
  }

  const openNewGameModal = () => {
    sound.playTap();
    const empty = saveSlots.find(s => !s.hasSave);
    setNewGameSlot(empty ? empty.slotNumber : activeSaveSlot);
    setNewCoachName(coachProfile.name || 'Arjun Rao');
    setShowNewGameModal(true);
  };

  return (
    <div className="relative min-h-screen bg-[#070b12] text-slate-100 flex flex-col justify-between w-full overflow-hidden select-none">
      {/* Background Night Stadium under Floodlights with Atmosphere */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#050811] via-[#091122] to-[#04060c]" />

        {/* Left Floodlight Tower */}
        <div className="absolute -top-6 left-4 lg:left-20 w-72 h-96 opacity-90">
          <div className="absolute top-16 left-12 w-32 h-24 bg-gradient-to-br from-amber-200/90 via-amber-400/80 to-transparent blur-md rounded-full transform -rotate-12" />
          <div className="absolute top-18 left-14 w-24 h-16 bg-white/95 blur-xs rounded-full" />
          <div className="absolute top-24 left-18 w-[550px] h-[650px] bg-gradient-to-br from-amber-100/25 via-amber-300/5 to-transparent transform -rotate-45 blur-2xl origin-top-left" />
        </div>

        {/* Right Floodlight Tower */}
        <div className="absolute -top-6 right-4 lg:right-20 w-72 h-96 opacity-90">
          <div className="absolute top-16 right-12 w-32 h-24 bg-gradient-to-bl from-amber-200/90 via-amber-400/80 to-transparent blur-md rounded-full transform rotate-12" />
          <div className="absolute top-18 right-14 w-24 h-16 bg-white/95 blur-xs rounded-full" />
          <div className="absolute top-24 right-18 w-[550px] h-[650px] bg-gradient-to-bl from-amber-100/25 via-amber-300/5 to-transparent transform rotate-45 blur-2xl origin-top-right" />
        </div>

        <div className="absolute inset-x-0 bottom-0 h-80 bg-gradient-to-t from-[#070b12] via-[#070b12]/90 to-transparent" />
      </div>

      {/* Top Action Bar */}
      <div className="relative z-10 max-w-7xl mx-auto w-full px-6 pt-6 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-mono text-amber-400/90 bg-[#141b2a]/80 border border-amber-500/30 px-3 py-1.5 rounded-xl backdrop-blur-md">
          <Folder className="w-3.5 h-3.5" />
          <span>ACTIVE SLOT {activeSaveSlot}: {userTeam.name.toUpperCase()}</span>
        </div>

        <button
          onClick={() => { sound.playTap(); setShowAchievements(true); }}
          className="px-3.5 py-2 rounded-2xl bg-[#141b2a]/90 hover:bg-[#1c273c] border border-amber-500/70 text-amber-400 flex items-center gap-2 shadow-lg shadow-amber-500/10 active:scale-95 transition-all backdrop-blur-md text-xs font-mono font-bold"
          title="Achievements"
        >
          <Trophy className="w-4 h-4 text-amber-400" />
          <span>ACHIEVEMENTS</span>
        </button>
      </div>

      {/* Main Browser Widescreen Grid */}
      <div className="relative z-10 max-w-7xl mx-auto w-full px-6 py-6 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left Column (7 cols): Official App Artwork Collector's Chassis */}
        <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left space-y-3.5">
          <div className="w-full max-w-[580px] relative group">
            {/* Ambient Dual-Radiance Backlight Glow (Warm Amber & Stadium Sapphire) */}
            <div className="absolute -inset-1.5 bg-gradient-to-tr from-amber-500/25 via-amber-400/15 to-blue-600/20 rounded-[34px] blur-2xl opacity-75 group-hover:opacity-100 transition duration-700 pointer-events-none" />

            {/* Main App Cover Art Container - Luxury Chamfered Chassis */}
            <div className="relative p-2 sm:p-2.5 rounded-[24px] sm:rounded-[30px] bg-gradient-to-b from-amber-500/30 via-slate-800/50 to-[#070b14] border border-amber-500/40 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.95)] backdrop-blur-xl">
              <div className="relative rounded-[18px] sm:rounded-[22px] overflow-hidden bg-[#050811] ring-1 ring-inset ring-white/10">
                {!imageError ? (
                  <>
                    <img
                      src="/assets/aistudio/file_000000009f3481faad2d0f6e1e900053_77824179.png"
                      alt="Cricket Coach 26 - Tactical Cricket Management Simulation"
                      referrerPolicy="no-referrer"
                      onError={() => setImageError(true)}
                      className="w-full h-auto object-cover rounded-[18px] sm:rounded-[22px] transform transition-transform duration-700 ease-out group-hover:scale-[1.015]"
                    />
                    {/* Inner Edge Depth Shadow */}
                    <div className="absolute inset-0 shadow-[inset_0_0_30px_rgba(0,0,0,0.65)] pointer-events-none rounded-[18px] sm:rounded-[22px]" />
                    
                    {/* Seamless Bottom Vignette Scrim */}
                    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#050811]/95 via-[#050811]/45 to-transparent pointer-events-none" />

                    {/* Integrated Chassis Footer Overlay */}
                    <div className="absolute inset-x-0 bottom-0 px-3.5 sm:px-4 py-2 sm:py-3 flex items-center justify-between text-[10px] sm:text-xs font-mono font-medium tracking-wider text-amber-200/90 pointer-events-none">
                      <span className="flex items-center gap-1.5 drop-shadow-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        TATA IPL 2026 EDITION
                      </span>
                      <span className="text-slate-300 drop-shadow-md">
                        2D PITCH ENGINE
                      </span>
                    </div>
                  </>
                ) : (
                  /* Zero-Broken-Image Fallback Canvas */
                  <div className="w-full aspect-[3/2] flex flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-900 via-[#070b14] to-slate-950 text-center">
                    <Trophy className="w-12 h-12 text-amber-400 mb-3" />
                    <div className="text-xl font-black font-display tracking-widest text-white uppercase">
                      CRICKET COACH 26
                    </div>
                    <div className="text-xs font-mono text-amber-400 mt-1">
                      TACTICAL CRICKET SIMULATION
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Clean Unboxed Metadata Feature Strip (Zero-Pill Discipline) */}
          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-2.5 gap-y-1 text-xs font-medium text-slate-400 px-1">
            <span className="text-amber-400/95 font-semibold tracking-wider">TACTICAL 2D PITCH</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>10 IPL FRANCHISES</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>MEGA AUCTION</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>3 CAREER SLOTS</span>
          </div>
        </div>

        {/* Right Column (5 cols): Career Navigation & Save Slot Identities */}
        <div className="lg:col-span-5 w-full max-w-lg mx-auto space-y-3.5">
          {/* Save Slot Identity Switcher */}
          <div className="p-3.5 rounded-2xl bg-[#101726]/90 border border-slate-800 backdrop-blur-md space-y-2">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
              <span>CAREER SAVE SLOTS (SEPARATE IDENTITIES)</span>
              <span className="text-amber-400">SLOT {activeSaveSlot} ACTIVE</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {saveSlots.map(slot => {
                const isCurrent = activeSaveSlot === slot.slotNumber;
                return (
                  <button
                    key={slot.slotNumber}
                    onClick={() => {
                      sound.playTap();
                      if (slot.hasSave) {
                        loadFromSlot(slot.slotNumber);
                      } else {
                        setNewGameSlot(slot.slotNumber);
                        setShowNewGameModal(true);
                      }
                    }}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      isCurrent
                        ? 'bg-amber-500/20 border-amber-400 text-white shadow'
                        : slot.hasSave
                        ? 'bg-slate-900/90 hover:bg-slate-800 border-slate-700 text-slate-200'
                        : 'bg-slate-950/60 hover:bg-slate-900 border-slate-800/80 text-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono font-bold">
                      <span>SLOT {slot.slotNumber}</span>
                      <span>{slot.hasSave ? slot.logoEmoji : '＋'}</span>
                    </div>
                    <div className="text-xs font-bold truncate mt-0.5">
                      {slot.hasSave ? slot.teamShortName : 'New Career'}
                    </div>
                    <div className="text-[9px] font-mono text-slate-400 truncate">
                      {slot.hasSave ? slot.seasonName : 'Empty Slot'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 1. CONTINUE CAREER (Large Vibrant Gold Button) */}
          <button
            onClick={() => {
              sound.playTap();
              setActiveTab('hub');
            }}
            className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-[#f5b82e] to-[#e5a61e] hover:from-[#fbc54d] hover:to-[#efa819] text-black text-left shadow-2xl shadow-amber-500/25 flex items-center justify-between active:scale-[0.98] transition-all group"
          >
            <div>
              <div className="text-base font-black font-display tracking-wider uppercase leading-tight">
                CONTINUE CAREER (SLOT {activeSaveSlot})
              </div>
              <div className="text-xs font-semibold text-black/80 mt-0.5">
                {coachProfile.name} · {userTeam.name} ({coachProfile.domesticStats.matches} Mat)
              </div>
            </div>
            <ChevronRight className="w-6 h-6 text-black group-hover:translate-x-1 transition-transform" />
          </button>

          {/* 2. AUCTION ONLY SANDBOX (Dedicated Isolated Lab Card) */}
          <button
            onClick={() => {
              sound.playTap();
              setShowSandboxModal(true);
            }}
            className="w-full py-3.5 px-5 rounded-2xl bg-[#141d33]/90 hover:bg-[#1a2745] border border-amber-500/50 text-left flex items-center justify-between shadow-xl active:scale-[0.98] transition-all group backdrop-blur-md"
          >
            <div>
              <div className="flex items-center gap-2">
                <div className="text-sm font-black font-display tracking-wider uppercase text-amber-400 leading-tight">
                  AUCTION ONLY SANDBOX
                </div>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  ISOLATED LAB
                </span>
              </div>
              <div className="text-xs text-slate-300 mt-0.5">
                Play standalone Mega or Mini Auction as any of the 10 franchises with custom retentions
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
              <Gavel className="w-4 h-4 fill-current" />
            </div>
          </button>

          {/* 3. NEW GAME (Dark Card) */}
          <button
            onClick={openNewGameModal}
            className="w-full py-3.5 px-5 rounded-2xl bg-[#121927]/90 hover:bg-[#1a2336] border border-slate-800 text-left flex items-center justify-between shadow-xl active:scale-[0.98] transition-all group backdrop-blur-md"
          >
            <div>
              <div className="text-sm font-black font-display tracking-wider uppercase text-white leading-tight">
                NEW CAREER (START FROM 0)
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Start a fresh career in any Save Slot or enter the Mega Auction
              </div>
            </div>
            <div className="w-7 h-7 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-300 group-hover:text-amber-400 transition-colors">
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            </div>
          </button>

          {/* 3. SETTINGS (Dark Card) */}
          <button
            onClick={() => {
              sound.playTap();
              setShowSettings(true);
            }}
            className="w-full py-3.5 px-5 rounded-2xl bg-[#121927]/90 hover:bg-[#1a2336] border border-slate-800 text-left flex items-center justify-between shadow-xl active:scale-[0.98] transition-all group backdrop-blur-md"
          >
            <div>
              <div className="text-sm font-black font-display tracking-wider uppercase text-white leading-tight">
                SETTINGS &amp; SAVE MANAGER
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Edit players and teams, manage 3 save slots, audio &amp; coach tips
              </div>
            </div>
            <div className="w-7 h-7 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-300 group-hover:text-amber-400 transition-colors">
              <Settings className="w-4 h-4" />
            </div>
          </button>
        </div>
      </div>

      {/* Footer Info (ABOUT & Version tag) */}
      <div className="relative z-10 max-w-7xl mx-auto w-full px-6 pb-5 flex items-center justify-center gap-6 text-xs font-mono text-slate-400">
        <button
          onClick={() => { sound.playTap(); setShowAboutModal(true); }}
          className="flex items-center gap-1.5 hover:text-white transition-colors"
        >
          <Info className="w-3.5 h-3.5" />
          <span>ABOUT</span>
        </button>
        <span className="text-slate-600">·</span>
        <div className="flex items-center gap-1.5 text-slate-500">
          <Settings className="w-3.5 h-3.5" />
          <span>V1.13.0 · BROWSER EDITION</span>
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onOpenRosterEditor={() => setActiveTab('profile')}
      />

      {/* About Modal */}
      {showAboutModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0e1422] border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-black font-display tracking-wider text-white uppercase">
                ABOUT CRICKET COACH 26
              </h3>
              <button onClick={() => setShowAboutModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative rounded-2xl overflow-hidden border border-amber-500/40 shadow-xl bg-[#060a12] ring-1 ring-inset ring-white/10">
              <img
                src="/assets/aistudio/file_000000009f3481faad2d0f6e1e900053_77824179.png"
                alt="Cricket Coach 26"
                referrerPolicy="no-referrer"
                className="w-full h-auto object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#060a12]/90 to-transparent pointer-events-none" />
              <div className="absolute inset-x-0 bottom-0 px-3 py-1.5 flex items-center justify-between text-[10px] font-mono text-amber-300/90 pointer-events-none">
                <span>OFFICIAL KEY ART</span>
                <span>TATA IPL 2026</span>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Cricket Coach 26 is an authentic tactical cricket management simulator featuring ball-by-ball physics, IPL Mega Auctions, dynamic player development, and international ICC rankings.
            </p>
            <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 text-xs font-mono text-slate-400 space-y-1">
              <div>Version: 1.13.0 (Browser Widescreen Edition)</div>
              <div>Engine: Tactical 2D Pitch Canvas + 10 IPL Franchises</div>
              <div>Author: Sayandip Lynn</div>
            </div>
            <button
              onClick={() => setShowAboutModal(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      {/* New Game Career Picker Modal */}
      {showNewGameModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#0e1422] border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black font-display tracking-wider text-white uppercase">
                  START NEW CAREER (ALL STATS RESET TO 0)
                </h3>
                <p className="text-xs text-slate-400">
                  Choose a Save Slot, enter your Manager Name, and select your starting IPL franchise
                </p>
              </div>
              <button onClick={() => setShowNewGameModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Save Slot Selection & Coach Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800">
              <div>
                <label className="text-[10px] font-mono uppercase text-amber-400 font-bold block mb-1.5">
                  1. TARGET SAVE SLOT
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([1, 2, 3] as const).map(slotNum => {
                    const slotInfo = saveSlots.find(s => s.slotNumber === slotNum);
                    return (
                      <button
                        key={slotNum}
                        type="button"
                        onClick={() => { sound.playTap(); setNewGameSlot(slotNum); }}
                        className={`py-2 px-2 rounded-xl font-mono text-xs font-bold border transition-all ${
                          newGameSlot === slotNum
                            ? 'bg-amber-400 text-black border-amber-300 shadow'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                        }`}
                      >
                        <div>Slot {slotNum}</div>
                        <div className="text-[9px] opacity-80 truncate">
                          {slotInfo?.hasSave ? slotInfo.teamShortName : 'Empty'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase text-amber-400 font-bold block mb-1.5">
                  2. HEAD COACH NAME
                </label>
                <input
                  type="text"
                  value={newCoachName}
                  onChange={e => setNewCoachName(e.target.value)}
                  placeholder="Enter Coach Name..."
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div>
              <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block mb-2">
                3. SELECT STARTING FRANCHISE (STARTS SEASON FROM DAY 1 WITH 0 MATCHES)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                {teams.map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      startNewCareer(
                        t.id,
                        { name: newCoachName.trim() || 'Arjun Rao' },
                        newGameSlot
                      );
                      setShowNewGameModal(false);
                      setActiveTab('hub');
                    }}
                    className="w-full p-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 flex items-center justify-between text-left transition-all active:scale-98"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{t.logoEmoji}</span>
                      <div>
                        <div className="text-xs font-bold text-white">{t.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">Purse: ₹{t.purseCr} Cr · 0 Matches</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-amber-400" />
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex gap-2">
              <button
                onClick={() => {
                  sound.playTap();
                  startNewCareer(
                    userTeam.id,
                    { name: newCoachName.trim() || 'Arjun Rao' },
                    newGameSlot
                  );
                  setShowNewGameModal(false);
                  startAuctionSession();
                }}
                className="flex-1 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase tracking-wider"
              >
                RESET &amp; ENTER MEGA AUCTION (SLOT {newGameSlot})
              </button>
            </div>
          </div>
        </div>
      )}

      {showSandboxModal && (
        <AuctionSandboxModal
          isOpen={showSandboxModal}
          onClose={() => setShowSandboxModal(false)}
        />
      )}
    </div>
  );
};
