import React, { useState, useEffect, useRef } from 'react';
import { Cloud, FastForward, Play, Pause, Sliders, FileText, ArrowLeft, AlertTriangle, Info, X, Trophy, Zap } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { MatchAnalysisModal } from './MatchAnalysisModal';
import { TacticalStadium2D } from './TacticalStadium2D';
import { BattingTacticsDrawer } from './BattingTacticsDrawer';
import { BowlingTacticsDrawer } from './BowlingTacticsDrawer';
import { EndOverBowlerModal } from './EndOverBowlerModal';
import { WicketBatterModal } from './WicketBatterModal';
import { ImpactPlayerModal } from './ImpactPlayerModal';
import { DRSReviewModal } from './DRSReviewModal';
import { OpenerSelectionModal } from './OpenerSelectionModal';
import { FielderPosition, Player } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';
import { TeamLogo } from '../common/TeamLogo';
import { PlayerCareerStatsCard } from '../common/PlayerCareerStatsCard';
import { checkDrsEligibility } from '../../utils/drsRules';
import { calculateBowlingEconomy, formatOversDisplay } from '../../utils/bowlingStats';

export const LiveMatchEngine: React.FC = () => {
  const {
    matchLiveState,
    finishMatch,
    runBallSimulation,
    simCurrentOver,
    simEntireMatch,
    updateBowlingTactics,
    updateBattingTactics,
    updateFielders,
    activateImpactPlayer,
    startSecondInnings,
    selectNewBowler,
    selectNextBatter,
    selectOpeners,
    setTossDecision,
    triggerDrsReview,
    resolveDrsReview,
    triggerRainDLSInterruption,
    activatePowerSurge,
    declareInnings,
    userTeam,
    teams,
    players,
    settings,
    simTokens,
    setSimTokens,
    setActiveTab
  } = useGame();

  // Pre-match states: Toss -> Conditions -> Openers / Opening Bowler -> Tactics Drawer
  const [showTossModal, setShowTossModal] = useState<boolean>(true);
  const [showConditionsModal, setShowConditionsModal] = useState<boolean>(false);
  const [showOpenersModal, setShowOpenersModal] = useState<boolean>(false);
  const [showOpeningBowlerModal, setShowOpeningBowlerModal] = useState<boolean>(false);
  const [selectedOpeningBowlerId, setSelectedOpeningBowlerId] = useState<string>('');
  const [inspectedPlayer, setInspectedPlayer] = useState<Player | null>(null);

  // In-match states
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showTacticsDrawer, setShowTacticsDrawer] = useState(false);
  const [tacticsDrawerTab, setTacticsDrawerTab] = useState<'tactics' | 'fielding' | 'commentary'>('tactics');
  const [tacticsLevel, setTacticsLevel] = useState<'simple' | 'advanced'>('simple');
  const [assistantMode, setAssistantMode] = useState<boolean>(false);
  const [showSimMenu, setShowSimMenu] = useState<boolean>(false);

  // New Modals & In-Match Tactical States
  const [showEndOverModal, setShowEndOverModal] = useState<boolean>(false);
  const [showWicketModal, setShowWicketModal] = useState<boolean>(false);
  const [showImpactModal, setShowImpactModal] = useState(false);
  const [impactPlayerUsed, setImpactPlayerUsed] = useState<boolean>(false);
  const [impactBanner, setImpactBanner] = useState<string | null>(null);
  const [pairRunning, setPairRunning] = useState<'hold_ones' | 'standard' | 'push_hard' | 'shield'>('standard');

  // Bowling intent & effort
  const [bowlingIntent, setBowlingIntent] = useState<'contain' | 'standard' | 'attack'>('attack');
  const [bowlingEffort, setBowlingEffort] = useState<'conserve' | 'standard' | 'max'>('standard');
  const [selectedSpeed, setSelectedSpeed] = useState<1 | 2 | 3>(2);
  const [autoPlaySpeed, setAutoPlaySpeed] = useState<number | null>(null); // null = paused/manual, 1, 2, 3
  const [selectedFielderId, setSelectedFielderId] = useState<number | null>(null);
  const [showOutcomeBanner, setShowOutcomeBanner] = useState<boolean>(false);

  const autoPlayRef = useRef<NodeJS.Timeout | null>(null);
  const lastBannerDeliveryKeyRef = useRef<string>('');

  const applyFieldPreset = (presetName: 'auto' | 'off_heavy' | 'attack' | 'death' | 'clear_slips' | 'balanced') => {
    sound.playTap();
    let newFielders: FielderPosition[] = [];
    if (presetName === 'off_heavy') {
      newFielders = [
        { id: 1, name: 'Slip', x: -18, y: -80, isDeep: false },
        { id: 2, name: 'Gully', x: -38, y: -65, isDeep: false },
        { id: 3, name: 'Point', x: -62, y: -20, isDeep: false },
        { id: 4, name: 'Cover', x: -55, y: 22, isDeep: false },
        { id: 5, name: 'Mid-off', x: -25, y: 48, isDeep: false },
        { id: 6, name: 'Deep Point', x: -85, y: -15, isDeep: true },
        { id: 7, name: 'Deep Cover', x: -78, y: 35, isDeep: true },
        { id: 8, name: 'Mid-on', x: 25, y: 48, isDeep: false },
        { id: 9, name: 'Deep Mid-wicket', x: 75, y: 25, isDeep: true },
      ];
    } else if (presetName === 'attack') {
      newFielders = [
        { id: 1, name: '1st Slip', x: -15, y: -82, isDeep: false },
        { id: 2, name: '2nd Slip', x: -28, y: -78, isDeep: false },
        { id: 3, name: 'Gully', x: -44, y: -58, isDeep: false },
        { id: 4, name: 'Silly Point', x: -22, y: -25, isDeep: false },
        { id: 5, name: 'Cover', x: -50, y: 20, isDeep: false },
        { id: 6, name: 'Mid-off', x: -24, y: 46, isDeep: false },
        { id: 7, name: 'Short Leg', x: 22, y: -25, isDeep: false },
        { id: 8, name: 'Mid-on', x: 24, y: 46, isDeep: false },
        { id: 9, name: 'Fine Leg', x: 35, y: -85, isDeep: true },
      ];
    } else if (presetName === 'death') {
      newFielders = [
        { id: 1, name: 'Third Man', x: -70, y: -72, isDeep: true },
        { id: 2, name: 'Deep Point', x: -85, y: -10, isDeep: true },
        { id: 3, name: 'Extra Cover', x: -45, y: 30, isDeep: false },
        { id: 4, name: 'Long-off', x: -30, y: 85, isDeep: true },
        { id: 5, name: 'Long-on', x: 30, y: 85, isDeep: true },
        { id: 6, name: 'Deep Mid-wicket', x: 80, y: 28, isDeep: true },
        { id: 7, name: 'Mid-wicket', x: 45, y: 20, isDeep: false },
        { id: 8, name: 'Square Leg', x: 50, y: -22, isDeep: false },
        { id: 9, name: 'Short Fine Leg', x: 30, y: -65, isDeep: false },
      ];
    } else if (presetName === 'clear_slips') {
      // Clear all slips and move them into the ring & deep covers
      newFielders = [
        { id: 1, name: 'Third Man', x: -65, y: -65, isDeep: true },
        { id: 2, name: 'Deep Point', x: -80, y: -15, isDeep: true },
        { id: 3, name: 'Point', x: -55, y: -15, isDeep: false },
        { id: 4, name: 'Cover', x: -50, y: 25, isDeep: false },
        { id: 5, name: 'Mid-off', x: -22, y: 48, isDeep: false },
        { id: 6, name: 'Mid-on', x: 22, y: 48, isDeep: false },
        { id: 7, name: 'Mid-wicket', x: 50, y: 22, isDeep: false },
        { id: 8, name: 'Square Leg', x: 55, y: -20, isDeep: false },
        { id: 9, name: 'Deep Mid-wicket', x: 75, y: 35, isDeep: true },
      ];
    } else if (presetName === 'balanced') {
      // Auto-Balanced standard 5-4 field
      newFielders = [
        { id: 1, name: 'Third Man', x: -60, y: -70, isDeep: true },
        { id: 2, name: 'Deep Point', x: -78, y: -12, isDeep: true },
        { id: 3, name: 'Cover', x: -52, y: 22, isDeep: false },
        { id: 4, name: 'Mid-off', x: -22, y: 46, isDeep: false },
        { id: 5, name: 'Mid-on', x: 22, y: 46, isDeep: false },
        { id: 6, name: 'Mid-wicket', x: 48, y: 20, isDeep: false },
        { id: 7, name: 'Square Leg', x: 52, y: -20, isDeep: false },
        { id: 8, name: 'Deep Mid-wicket', x: 78, y: 32, isDeep: true },
        { id: 9, name: 'Deep Square', x: 80, y: -20, isDeep: true },
      ];
    } else {
      newFielders = [
        { id: 1, name: 'Slip', x: -20, y: -75, isDeep: false },
        { id: 2, name: 'Point', x: -55, y: -15, isDeep: false },
        { id: 3, name: 'Cover', x: -50, y: 25, isDeep: false },
        { id: 4, name: 'Mid-off', x: -22, y: 48, isDeep: false },
        { id: 5, name: 'Mid-on', x: 22, y: 48, isDeep: false },
        { id: 6, name: 'Mid-wicket', x: 50, y: 22, isDeep: false },
        { id: 7, name: 'Deep Square', x: 82, y: -18, isDeep: true },
        { id: 8, name: 'Deep Mid-wicket', x: 75, y: 35, isDeep: true },
        { id: 9, name: 'Long-off', x: -35, y: 85, isDeep: true },
      ];
    }
    updateFielders(newFielders);
  };

  useEffect(() => {
    if (autoPlaySpeed !== null && matchLiveState && matchLiveState.status === 'in_progress' && !showTossModal && !showOpenersModal && !showOpeningBowlerModal) {
      const baseMs = settings.matchAnimations === 'full' ? 1800 : settings.matchAnimations === 'classic' ? 650 : 1200;
      const delay = Math.max(250, Math.round(baseMs / autoPlaySpeed));
      autoPlayRef.current = setTimeout(() => {
        runBallSimulation();
      }, delay);
    } else {
      if (autoPlayRef.current) clearTimeout(autoPlayRef.current);
    }
    return () => {
      if (autoPlayRef.current) clearTimeout(autoPlayRef.current);
    };
  }, [autoPlaySpeed, matchLiveState, showTossModal, showOpenersModal, showOpeningBowlerModal, runBallSimulation, settings.matchAnimations]);

  // Temporary top-of-stadium outcome notification lifecycle (non-stacking, clears after 2.4s or on innings reset)
  useEffect(() => {
    const curInn = matchLiveState
      ? (matchLiveState.currentInningsIndex === 1 ? matchLiveState.innings1 : (matchLiveState.innings2 || matchLiveState.innings1))
      : null;
    const outcome = matchLiveState?.lastBallOutcome;
    const isDrsActive = Boolean(matchLiveState?.activeDrsReview?.isActive);

    if (!outcome || !curInn || curInn.ballHistory.length === 0 || isDrsActive) {
      setShowOutcomeBanner(false);
      return;
    }

    const isNotableEvent = outcome.isFour || outcome.isSix || outcome.isWicket;
    if (!isNotableEvent) {
      setShowOutcomeBanner(false);
      return;
    }

    const key = `${matchLiveState.currentInningsIndex}-${curInn.ballsCompleted}-${outcome.over}.${outcome.ballNumber}-${outcome.runs}-${outcome.isWicket}-${Boolean(outcome.drsReviewed)}`;
    if (key !== lastBannerDeliveryKeyRef.current) {
      lastBannerDeliveryKeyRef.current = key;
      setShowOutcomeBanner(true);
    }

    const timer = setTimeout(() => {
      setShowOutcomeBanner(false);
    }, 2400);

    return () => clearTimeout(timer);
  }, [
    matchLiveState?.currentInningsIndex,
    matchLiveState?.innings1?.ballsCompleted,
    matchLiveState?.innings2?.ballsCompleted,
    matchLiveState?.lastBallOutcome,
    matchLiveState?.activeDrsReview?.isActive
  ]);

  if (!matchLiveState) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
        <h2 className="text-xl font-bold mb-4">No active match found</h2>
        <button
          onClick={() => setActiveTab('hub')}
          className="px-6 py-2 bg-amber-500 text-black font-semibold rounded-lg"
        >
          Return to Hub
        </button>
      </div>
    );
  }

  const {
    homeTeam,
    awayTeam,
    currentInningsIndex,
    innings1,
    innings2,
    targetRuns,
    status,
    resultText,
    lastBallOutcome,
    isBallInFlight,
    bowlingTactics,
    battingTactics
  } = matchLiveState;

  const currentInnings = currentInningsIndex === 1 ? innings1 : (innings2 || innings1);
  const battingTeam = currentInnings.battingTeamId === homeTeam.id ? homeTeam : awayTeam;
  const bowlingTeam = currentInnings.bowlingTeamId === homeTeam.id ? homeTeam : awayTeam;
  const activeUserMatchTeam =
    homeTeam.id === userTeam.id || Boolean(homeTeam.isUserTeam)
      ? homeTeam
      : awayTeam.id === userTeam.id || Boolean(awayTeam.isUserTeam)
      ? awayTeam
      : homeTeam;
  const isUserBatting = battingTeam.id === activeUserMatchTeam.id;

  // Active Players
  const striker = players.find(p => p.id === currentInnings.currentStrikerId) || battingTeam.squad?.find(p => p.id === currentInnings.currentStrikerId) || players[0];
  const nonStriker = players.find(p => p.id === currentInnings.currentNonStrikerId) || battingTeam.squad?.find(p => p.id === currentInnings.currentNonStrikerId) || players[1];
  const currentBowler = players.find(p => p.id === currentInnings.currentBowlerId) || bowlingTeam.squad?.find(p => p.id === currentInnings.currentBowlerId) || players[2];

  const strikerScore = currentInnings.batters.find(b => b.playerId === striker.id) || { runs: 0, balls: 0, fours: 0, sixes: 0, dismissal: 'not out', strikeRate: 0 };
  const nonStrikerScore = currentInnings.batters.find(b => b.playerId === nonStriker.id) || { runs: 0, balls: 0, fours: 0, sixes: 0, dismissal: 'not out', strikeRate: 0 };

  const isUserHome = activeUserMatchTeam.id === homeTeam.id;
  const userReviewsLeft = isUserHome
    ? (matchLiveState.reviewsRemaining?.home ?? 2)
    : (matchLiveState.reviewsRemaining?.away ?? 2);

  // Dismissed batter lookup for WicketBatterModal (must use the player who actually got out on lastBallOutcome)
  const dismissedBatterId = lastBallOutcome?.isWicket
    ? (lastBallOutcome.dismissedPlayerId || lastBallOutcome.strikerId)
    : striker.id;
  const dismissedBatterPlayer = players.find(p => p.id === dismissedBatterId) || striker;
  const dismissedBatterScore = currentInnings.batters.find(b => b.playerId === dismissedBatterId) || strikerScore;

  // Team player pools (ordered by playingXIIds)
  const userXIPlayers = activeUserMatchTeam.playingXIIds
    .map(id => players.find(p => p.id === id))
    .filter((p): p is Player => Boolean(p));
  const rawBenchPlayers = players.filter(
    p =>
      (p.clubId === activeUserMatchTeam.id ||
        (activeUserMatchTeam.leagueId === 'intl' && p.country.toLowerCase() === activeUserMatchTeam.name.toLowerCase())) &&
      !activeUserMatchTeam.playingXIIds.includes(p.id)
  );
  const impactIdsSet = new Set(activeUserMatchTeam.impactPlayerIds || []);
  const nominatedImpacts = rawBenchPlayers.filter(p => impactIdsSet.has(p.id));
  const benchPlayers = nominatedImpacts.length > 0
    ? nominatedImpacts.slice(0, 5)
    : rawBenchPlayers.slice(0, 5);
  const bowlingXIPlayers = bowlingTeam.playingXIIds
    .map(id => players.find(p => p.id === id))
    .filter((p): p is Player => Boolean(p))
    .filter(p => p.role === 'Pace' || p.role === 'Spin' || p.role === 'All-rounder');

  const survivingPartnerId = lastBallOutcome?.isWicket
    ? (lastBallOutcome.nonStrikerId || nonStriker.id)
    : nonStriker.id;
  const autoIncomingId = lastBallOutcome?.isWicket ? lastBallOutcome.incomingBatterId : undefined;
  const unavailableBatterIds = currentInnings.batters
    .filter(b =>
      b.dismissal !== 'not out' ||
      b.playerId === survivingPartnerId ||
      (!lastBallOutcome?.isWicket && b.playerId === striker.id) ||
      (b.balls > 0 && b.playerId !== autoIncomingId)
    )
    .map(b => b.playerId);
  const availableDugoutBatters = battingTeam.playingXIIds
    .map(id => players.find(p => p.id === id))
    .filter((p): p is Player => p !== undefined && !unavailableBatterIds.includes(p.id));

  // Run rates
  const runRate = currentInnings.overs > 0 ? (currentInnings.runs / currentInnings.overs).toFixed(2) : '0.00';
  const projectedScore = Math.round(Number(runRate) * 20);

  // Auto-pause and show modals on wicket or over completion
  const prevWicketBallRef = useRef<string>('');
  useEffect(() => {
    if (!matchLiveState) return;
    if (matchLiveState.status === 'finished' || matchLiveState.innings1.ballsCompleted > 0) {
      setShowTossModal(false);
    }
    if (matchLiveState.status === 'finished' || matchLiveState.status === 'innings_break') {
      setShowOpenersModal(false);
      setShowOpeningBowlerModal(false);
      setShowEndOverModal(false);
      setShowWicketModal(false);
      setAutoPlaySpeed(null);
      return;
    }
    if (!matchLiveState.lastBallOutcome) return;
    const lbo = matchLiveState.lastBallOutcome;
    const ballKey = `${lbo.over}.${lbo.ballNumber}-${lbo.isWicket}`;
    if (lbo.isWicket && ballKey !== prevWicketBallRef.current) {
      prevWicketBallRef.current = ballKey;
      if (isUserBatting) {
        setAutoPlaySpeed(null);
        setShowWicketModal(true);
      }
    }
  }, [matchLiveState?.lastBallOutcome, matchLiveState?.status, matchLiveState?.innings1?.ballsCompleted, isUserBatting]);

  const prevOverRef = useRef<number>(0);
  useEffect(() => {
    if (!matchLiveState) return;
    const curBalls = currentInnings.ballsCompleted;
    if (curBalls > 0 && curBalls % 6 === 0 && curBalls !== prevOverRef.current) {
      prevOverRef.current = curBalls;
      if (matchLiveState.status === 'in_progress') {
        if (settings.tacticsAuto === 'every_over') {
          setAutoPlaySpeed(null);
          setShowTacticsDrawer(true);
        }
        if (!isUserBatting && settings.tacticsAuto !== 'never') {
          setAutoPlaySpeed(null);
          setShowEndOverModal(true);
        }
      }
    }
  }, [currentInnings?.ballsCompleted, isUserBatting, matchLiveState?.status, settings.tacticsAuto]);

  const handleConfirmSubstitution = (benchPlayerId: string, outPlayerId: string) => {
    const benchP = players.find(p => p.id === benchPlayerId);
    const outP = players.find(p => p.id === outPlayerId);
    activateImpactPlayer(benchPlayerId, outPlayerId);
    setImpactPlayerUsed(true);
    if (benchP && outP) {
      setImpactBanner(`IMPACT PLAYER: ${benchP.name.split(' ').pop()} comes on for ${outP.name.split(' ').pop()}, who is out of the match.`);
    }
    sound.playCrowdCheer(0.6);
  };

  // Field tap repositioning handler
  const handleFielderMove = (id: number, x: number, y: number) => {
    const updated = bowlingTactics.fielders.map(f => {
      if (f.id === id) {
        return { ...f, x, y, isDeep: Math.hypot(x, y) > 55 };
      }
      return f;
    });
    updateFielders(updated);
    sound.playTap();
  };

  // Toss decisions: Bat First -> Pick Openers -> Batting Tactics; Bowl First -> Pick Opening Bowler -> Bowling Tactics
  const handleTossDecision = (decision: 'bat' | 'bowl') => {
    sound.playTap();
    setTossDecision(decision);
    setShowTossModal(false);
    if (decision === 'bat') {
      setShowOpenersModal(true);
    } else {
      setSelectedOpeningBowlerId('');
      setShowOpeningBowlerModal(true);
    }
  };

  const handleSelectOpeningBowler = (bowlerId: string) => {
    sound.playTap();
    setSelectedOpeningBowlerId(bowlerId);
  };

  const handleConfirmOpeningBowler = () => {
    if (!selectedOpeningBowlerId) return;
    sound.playTap();
    selectNewBowler(selectedOpeningBowlerId);
    setShowOpeningBowlerModal(false);
    setShowTacticsDrawer(true);
  };

  const bowlerScore = currentInnings.bowlers?.find(b => b.playerId === currentBowler.id);
  const bowlerFigures = bowlerScore
    ? `${formatOversDisplay(bowlerScore.overs, false, true)}-${bowlerScore.maidens}-${bowlerScore.runs}-${bowlerScore.wickets}`
    : `0.0-0-0-0`;
  const bowlerEcon = bowlerScore ? calculateBowlingEconomy(bowlerScore.runs, bowlerScore.overs).toFixed(2) : '0.00';
  const bowlerOversBowled = bowlerScore ? bowlerScore.overs : 0;
  const activeEffort = bowlingTactics.effort || 'standard';
  const liveBowlerStamina = Math.max(
    40,
    Math.min(100, Math.round((currentBowler.fitness || 95) - bowlerOversBowled * (activeEffort === 'max' ? 8 : activeEffort === 'conserve' ? 3 : 5)))
  );

  // Required Run Rate for 2nd innings
  const maxBallsInInnings = matchLiveState.format === '100BALL'
    ? 100
    : Math.round((currentInnings.maxOvers || 20) * 6);
  const ballsRemaining = Math.max(1, maxBallsInInnings - currentInnings.ballsCompleted);
  const requiredRunRate = currentInningsIndex === 2 && targetRuns
    ? Math.max(0, ((targetRuns - currentInnings.runs) / ballsRemaining) * 6)
    : null;
  const fieldingXIPlayers = players.filter(p => bowlingTeam.playingXIIds.includes(p.id));
  const keeperPlayer = fieldingXIPlayers.find(p => p.role === 'Wk-bat') || fieldingXIPlayers[0];
  const dynamicFielderJerseys = fieldingXIPlayers
    .filter(p => p.id !== currentBowler.id && p.id !== keeperPlayer?.id)
    .map((p, idx) => p.jerseyNumber || [17, 47, 8, 2, 56, 18, 23, 24, 4][idx % 9]);

  // Dynamic kit colors for scorecard badges
  const getTeamKitHex = (shortName?: string, primary?: string, fallback: string = '#ef4444') => {
    const code = (shortName || '').toUpperCase();
    if (code === 'KOL' || code === 'KKR') return '#7c3aed';
    if (code === 'PUN' || code === 'PBKS') return '#ef4444';
    if (code === 'CSK' || code === 'CHE') return '#eab308';
    if (code === 'MI' || code === 'MUM') return '#2563eb';
    if (code === 'BLR' || code === 'RCB') return '#dc2626';
    if (code === 'SRH' || code === 'HYD') return '#f97316';
    if (code === 'DC' || code === 'DEL') return '#1d4ed8';
    if (code === 'GT' || code === 'GUJ') return '#1e293b';
    if (code === 'RR' || code === 'RAJ') return '#db2777';
    if (code === 'LSG' || code === 'LKO') return '#0284c7';
    return primary || fallback;
  };
  const battingKitHex = getTeamKitHex(battingTeam.shortName, battingTeam.primaryColor, '#7c3aed');
  const bowlingKitHex = getTeamKitHex(bowlingTeam.shortName, bowlingTeam.primaryColor, '#ef4444');
  const bowlerBadgeTextHex = bowlingKitHex === '#eab308' ? '#000000' : '#ffffff';

  // Current over balls (6 boxes: bowled balls show '0', '1', '4', '6', 'W'; unbowled balls show '•')
  const ballsInThisOver = currentInnings.ballsCompleted % 6;
  const historyForThisOver = currentInnings.ballHistory.slice(0, ballsInThisOver === 0 && currentInnings.ballsCompleted > 0 ? 6 : ballsInThisOver).reverse();
  const overBoxes = Array.from({ length: 6 }).map((_, idx) => {
    if (idx < historyForThisOver.length) {
      const b = historyForThisOver[idx];
      return b.isWicket ? 'W' : String(b.runs);
    }
    return '•';
  });

  const displayShort = (s: string) => (s === 'PBKS' ? 'PUN' : s);
  const venueCityLabel = (matchLiveState.venue.split(',')[1] || homeTeam.city || matchLiveState.venue.split(',')[0]).trim();

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 flex flex-col justify-between max-w-6xl mx-auto w-full pb-2 relative select-none border-x border-slate-800/60">
      {/* 1. Top Header Bar */}
      <div className="px-6 py-3 flex items-center justify-between border-b border-slate-800/80 bg-[#0a0f1b] sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { sound.playTap(); finishMatch(); }}
            className="p-1 text-slate-300 hover:text-white active:scale-95 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="text-sm font-black font-display tracking-wide uppercase text-white flex items-center gap-1.5 leading-tight">
              <span>{displayShort(battingTeam.shortName)} v {displayShort(bowlingTeam.shortName)}</span>
            </div>
            <div className="text-[11px] text-slate-400 font-sans flex items-center gap-1.5 leading-tight">
              <span>{venueCityLabel} · {matchLiveState.format || 'T20'}</span>
              {matchLiveState.format === '100BALL' && (
                <span className="text-amber-400 font-mono font-bold">
                  · {matchLiveState.ballsRemainingInInnings ?? Math.max(0, 100 - currentInnings.ballsCompleted)} BALLS LEFT
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Conditions cloud button */}
          <button
            onClick={() => { sound.playTap(); setShowConditionsModal(true); }}
            className="w-8 h-8 rounded-lg bg-[#141c2c] hover:bg-[#1e2c44] border border-slate-700/70 flex items-center justify-center text-slate-300 active:scale-95 transition-all"
            title="Weather & Pitch Conditions"
          >
            <Cloud className="w-4 h-4" />
          </button>

          {/* SIM button (Opens Simulate ahead bottom sheet matching Video 2 at 1:46) */}
          <button
            onClick={() => {
              sound.playTap();
              setAutoPlaySpeed(null);
              setShowSimMenu(true);
            }}
            className="px-3 py-1.5 rounded-lg bg-[#141c2c] hover:bg-[#1e2c44] border border-slate-700/70 text-white font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-all shadow-sm"
          >
            <FastForward className="w-3.5 h-3.5 fill-current text-white" />
            SIM
          </button>

          {/* LIVE badge */}
          <div className="px-2.5 py-1.5 rounded-lg bg-[#231b08] border border-[#d97706]/80 text-[#f59e0b] font-black text-xs flex items-center gap-1">
            <span className="text-[10px] font-bold tracking-tighter">lll</span>
            LIVE
          </div>
        </div>
      </div>

      {/* 2. Scorecard Header (Exact 1:1 Match to Video 1 & Video 2) */}
      <div className="px-3.5 pt-2 pb-1.5 bg-[#090e19]">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <TeamLogo
              teamId={battingTeam.id}
              shortName={battingTeam.shortName}
              name={battingTeam.name}
              size={30}
              className="rounded-lg shadow"
            />
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-black text-white tracking-wide">{displayShort(battingTeam.shortName || 'KOL')}</span>
              <span className="text-[10px] text-slate-400 font-mono font-semibold">CRR</span>
              <span className="text-xs font-mono font-bold text-slate-200">{runRate}</span>
              {currentInningsIndex === 2 && requiredRunRate !== null && (
                <>
                  <span className="text-[10px] text-slate-400 font-mono font-semibold ml-1">RRR</span>
                  <span className="text-xs font-mono font-bold text-amber-400">{requiredRunRate.toFixed(2)}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 text-right font-mono">
            <span className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {currentInnings.runs} - {currentInnings.wickets}
            </span>
            <span className="text-xs sm:text-sm text-slate-400 font-bold">
              ({currentInnings.overs})
            </span>
          </div>
        </div>

        {/* 2nd Innings Gold Chase Target Pill Bar (Exact match to Video 1 at 0:02 - 1:46) */}
        {currentInningsIndex === 2 && targetRuns && (() => {
          const runsNeeded = Math.max(0, targetRuns - currentInnings.runs);
          const remOversWhole = Math.ceil(ballsRemaining / 6);
          const remainingText = ballsRemaining <= 18
            ? `${ballsRemaining} balls`
            : `${remOversWhole} overs`;
          return (
            <div className="mb-1.5 py-1 px-3 rounded-lg bg-[#1d180c] border border-[#b4821f]/60 text-center font-mono text-[11px] font-bold text-[#f5b82e]">
              Need {runsNeeded} from {remainingText} · Target {targetRuns}
            </div>
          );
        })()}

        {/* Striker & Non-Striker Cards (Side-by-side matching Video 1 & Video 2) */}
        <div className="grid grid-cols-2 gap-2 mb-1.5">
          {/* Striker Card (Gold Badge with Gold Star) */}
          <div className="p-2 rounded-xl bg-[#131b2c] border border-[#9a6b1f] shadow-sm">
            <div className="flex items-start justify-between gap-1">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded bg-[#f59e0b] text-black font-black text-xs flex items-center justify-center font-mono shrink-0 shadow">
                  {striker.jerseyNumber || 9}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white flex items-center gap-1 truncate leading-tight">
                    <span className="truncate">{striker.name.split(' ').slice(-1)[0]}</span>
                    <span className="text-[#f59e0b] font-black text-sm leading-none shrink-0">*</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 truncate mt-0.5">
                    <span className="text-white font-bold">{strikerScore.runs} ({strikerScore.balls})</span>
                    <span className="text-slate-400">{striker.age || 26}y</span>
                    <span className="text-slate-400">{striker.battingHand}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => { sound.playTap(); setInspectedPlayer(striker); }}
                className="text-slate-400 hover:text-amber-400 shrink-0 p-0.5 transition-colors"
                title="Inspect Striker Attributes"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Non-Striker Card (Slate Badge) */}
          <div className="p-2 rounded-xl bg-[#111827] border border-slate-800">
            <div className="flex items-start justify-between gap-1">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded bg-[#263042] text-white font-bold text-xs flex items-center justify-center font-mono shrink-0 shadow">
                  {nonStriker.jerseyNumber || 74}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-200 truncate leading-tight">
                    {nonStriker.name.split(' ').slice(-1)[0]}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 truncate mt-0.5">
                    <span className="text-slate-300 font-bold">{nonStrikerScore.runs} ({nonStrikerScore.balls})</span>
                    <span className="text-slate-400">{nonStriker.age || 37}y</span>
                    <span className="text-slate-400">{nonStriker.battingHand}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => { sound.playTap(); setInspectedPlayer(nonStriker); }}
                className="text-slate-400 hover:text-amber-400 shrink-0 p-0.5 transition-colors"
                title="Inspect Non-Striker Attributes"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Bowler Row (Dynamic Bowling Team Jersey Badge, Surname, Style Tag, Stamina, Figures, Econ) */}
        <div className="px-2.5 py-1.5 rounded-xl bg-[#0e1524] border border-slate-800/80 flex items-center justify-between text-xs mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-6 h-6 rounded font-bold text-xs flex items-center justify-center font-mono shrink-0 shadow"
              style={{ backgroundColor: bowlingKitHex, color: bowlerBadgeTextHex }}
            >
              {currentBowler.jerseyNumber || 15}
            </div>
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-bold text-white text-xs truncate">
                {currentBowler.name.split(' ').slice(-1)[0]}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-[#172554] text-[#38bdf8] text-[10px] font-mono font-bold shrink-0">
                {currentBowler.role === 'Spin'
                  ? (currentBowler.bowlingArm?.startsWith('L') ? 'L-Orth' : 'R-Spin')
                  : (currentBowler.bowlingArm?.startsWith('L') ? 'L-Fast' : 'R-Fast')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] shrink-0">
            <div className="flex items-center gap-1">
              <div className="w-8 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    liveBowlerStamina > 75 ? 'bg-cyan-400' : liveBowlerStamina > 55 ? 'bg-amber-400' : 'bg-rose-500'
                  }`}
                  style={{ width: `${liveBowlerStamina}%` }}
                />
              </div>
              <span className={`font-bold text-[10px] ${
                liveBowlerStamina > 75 ? 'text-cyan-400' : liveBowlerStamina > 55 ? 'text-amber-400' : 'text-rose-400'
              }`}>
                {liveBowlerStamina}%
              </span>
            </div>
            <span className="text-slate-200 font-mono-nums font-semibold">{bowlerFigures}</span>
            <span className="text-slate-400 font-mono-nums">{bowlerEcon} <span className="text-[9px]">e</span></span>
            <button
              onClick={() => { sound.playTap(); setInspectedPlayer(currentBowler); }}
              className="text-slate-400 hover:text-amber-400 p-0.5 transition-colors"
              title="Inspect Bowler Attributes"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Compact Horizontal Over Tracker Row (Exact match to Video 1 & 2: OVER X on left + 6 boxes on right) */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold shrink-0 w-12">
            OVER {Math.floor(currentInnings.ballsCompleted / 6) + 1}
          </span>
          <div className="flex-1 grid grid-cols-6 gap-1.5">
            {overBoxes.map((b, idx) => (
              <div
                key={idx}
                className={`h-6 rounded-md flex items-center justify-center font-mono font-bold text-xs transition-colors ${
                  b === 'W'
                    ? 'bg-rose-950/80 border border-rose-500 text-rose-300 shadow-sm'
                    : b === '4' || b === '6'
                    ? 'bg-amber-950/80 border border-amber-500 text-amber-300 shadow-sm'
                    : b === '•'
                    ? 'bg-[#0e1522] border border-slate-800/80 text-slate-600'
                    : 'bg-[#131b2c] border border-slate-700/80 text-white'
                }`}
              >
                {b}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. TACTICAL 2D STADIUM VISUALIZER (Dynamic Team & Home Ground Colors) */}
      <div className="flex-1 w-full flex flex-col items-center justify-center relative px-1 py-0.5 overflow-hidden">
        <TacticalStadium2D
          fielders={bowlingTactics.fielders}
          selectedFielderId={selectedFielderId}
          onSelectFielder={(id) => {
            sound.playTap();
            setSelectedFielderId(id);
          }}
          onMoveFielder={(id, x, y) => {
            if (!isUserBatting) handleFielderMove(id, x, y);
          }}
          lastBallOutcome={currentInnings.ballHistory.length > 0 ? lastBallOutcome : null}
          isBallInFlight={isBallInFlight}
          bowlerName={currentBowler.name}
          strikerName={striker.name}
          nonStrikerName={nonStriker.name}
          bowlerJersey={currentBowler.jerseyNumber || 15}
          strikerJersey={striker.jerseyNumber || 9}
          nonStrikerJersey={nonStriker.jerseyNumber || 74}
          keeperJersey={keeperPlayer?.jerseyNumber || 1}
          fielderJerseys={dynamicFielderJerseys}
          plannedLength={bowlingTactics.length}
          plannedLine={bowlingTactics.line}
          showHeatmaps={tacticsDrawerTab === 'fielding' && showTacticsDrawer}
          teamColors={{ primary: userTeam.primaryColor, secondary: userTeam.secondaryColor }}
          battingTeamColors={{
            primary: battingTeam.primaryColor,
            secondary: battingTeam.secondaryColor,
            shortName: battingTeam.shortName
          }}
          bowlingTeamColors={{
            primary: bowlingTeam.primaryColor,
            secondary: bowlingTeam.secondaryColor,
            shortName: bowlingTeam.shortName
          }}
          homeTeamColors={{
            primary: homeTeam.primaryColor,
            secondary: homeTeam.secondaryColor,
            shortName: homeTeam.shortName,
            city: homeTeam.city
          }}
          venueName={matchLiveState.venue}
          pitchType={matchLiveState.pitchType}
          strikerHand={striker.battingHand}
          bowlerRole={currentBowler.role}
          isDrsPending={Boolean(matchLiveState.activeDrsReview?.isActive)}
          isOverComplete={
            currentInnings.ballsCompleted > 0 &&
            currentInnings.ballsCompleted % 6 === 0 &&
            Boolean(lastBallOutcome && !lastBallOutcome.isExtra)
          }
          inningsIndex={currentInningsIndex}
          ballsCompleted={currentInnings.ballsCompleted}
          onPitchTargetClick={(length, line) => {
            if (!isUserBatting) {
              sound.playTap();
              updateBowlingTactics({ length, line });
            }
          }}
        />

        {/* Compact Top-of-Stadium Outcome Notification (Non-blocking, never covers pitch or umpire signals) */}
        {showOutcomeBanner &&
          lastBallOutcome &&
          !matchLiveState.activeDrsReview?.isActive &&
          (lastBallOutcome.isSix || lastBallOutcome.isFour || lastBallOutcome.isWicket) && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none z-30 transition-all duration-200">
              <div className="bg-[#0d1526]/95 backdrop-blur-md border border-slate-700/80 rounded-2xl px-3.5 py-1.5 shadow-2xl flex items-center gap-2.5 min-w-[124px]">
                {lastBallOutcome.isWicket ? (
                  <>
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-rose-500 to-red-700 border border-rose-300/50 flex items-center justify-center shrink-0 shadow-inner relative overflow-hidden">
                      <div className="w-8 h-0.5 bg-white/80 -rotate-45" />
                    </div>
                    <div className="flex flex-col leading-tight">
                      <span className="text-sm font-black font-display tracking-wider text-white uppercase">
                        OUT
                      </span>
                      <span className="text-[10px] text-slate-300 font-sans truncate max-w-[130px]">
                        {lastBallOutcome.dismissalText ||
                          `b ${(lastBallOutcome.bowlerName || currentBowler.name).split(' ').slice(-1)[0]}`}
                      </span>
                    </div>
                  </>
                ) : lastBallOutcome.isSix ? (
                  <>
                    <div className="w-7 h-7 rounded-lg bg-purple-600 border border-purple-400/60 text-white font-black text-base flex items-center justify-center shrink-0 shadow">
                      6
                    </div>
                    <span className="text-sm font-black font-display tracking-wider text-white uppercase pr-1">
                      SIX
                    </span>
                  </>
                ) : (
                  <>
                    <div className="w-7 h-7 rounded-lg bg-blue-600 border border-blue-400/60 text-white font-black text-base flex items-center justify-center shrink-0 shadow">
                      4
                    </div>
                    <span className="text-sm font-black font-display tracking-wider text-white uppercase pr-1">
                      FOUR
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
      </div>

      {/* Feature 6.2 & 6.4 & 6.6 Live Tactical Alerts (DLS, Power Surge, Opposition Match-Up Traps) */}
      {(matchLiveState.tacticalTrapAlert || matchLiveState.dlsState?.isInterrupted || (matchLiveState.powerSurgeOversLeft || 0) > 0) && (
        <div className="px-4 py-1.5 bg-[#131c31] border-t border-amber-500/30 text-[10px] font-mono flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 truncate text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">
              {(matchLiveState.powerSurgeOversLeft || 0) > 0
                ? `⚡ POWER SURGE ACTIVE (${matchLiveState.powerSurgeOversLeft} ov left): Only 2 fielders outside ring!`
                : matchLiveState.tacticalTrapAlert
                ? matchLiveState.tacticalTrapAlert
                : matchLiveState.dlsState?.dlsFormulaSummary}
            </span>
          </div>
          {!matchLiveState.powerSurgeTaken && isUserBatting && matchLiveState.format !== 'TEST' && (
            <button
              onClick={activatePowerSurge}
              className="px-2 py-0.5 rounded bg-amber-400 text-black font-black text-[9px] shrink-0 uppercase"
            >
              ⚡ SURGE
            </button>
          )}
        </div>
      )}

      {/* Impact Player Banner if active (Matching Video 2 at 1:34) */}
      {impactBanner && (
        <div className="px-4 py-1.5 bg-[#0e1726] border-t border-cyan-500/30 text-[10px] font-mono text-cyan-300 flex items-center justify-between">
          <div className="flex items-center gap-1.5 truncate">
            <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">{impactBanner}</span>
          </div>
          <button onClick={() => setImpactBanner(null)} className="text-slate-400 hover:text-white p-0.5 ml-2">✕</button>
        </div>
      )}

      {/* 4. Live Tactical Commentary Strip + Instant 1-Tap DRS Appeal/Challenge Button */}
      <div className="px-3.5 py-2 bg-[#090e19] border-t border-slate-800/80 text-xs flex items-center justify-between gap-2">
        <p className="font-mono text-slate-300 line-clamp-1 flex-1">
          {lastBallOutcome && currentInnings.ballHistory.length > 0
            ? lastBallOutcome.commentary
            : `Openers: ${striker.name.split(' ').pop()} & ${nonStriker.name.split(' ').pop()}.`}
        </p>
        {lastBallOutcome && currentInnings.ballHistory.length > 0 && (() => {
          const latestBall = currentInnings.ballHistory[0];
          const drs = checkDrsEligibility(lastBallOutcome, isUserBatting, userReviewsLeft, {
            isDrsActive: Boolean(matchLiveState.activeDrsReview?.isActive),
            matchStatus: status,
            latestBallOutcome: latestBall
          });
          if (
            lastBallOutcome.drsReviewed &&
            latestBall &&
            latestBall.over === lastBallOutcome.over &&
            latestBall.ballNumber === lastBallOutcome.ballNumber
          ) {
            return (
              <span className="px-2 py-1 rounded-lg bg-slate-800/90 border border-slate-700 text-[10px] font-mono font-bold text-slate-400 shrink-0">
                DRS USED
              </span>
            );
          }
          if (drs.canReview) {
            return (
              <button
                onClick={() => {
                  sound.playTap();
                  setAutoPlaySpeed(null);
                  triggerDrsReview();
                }}
                disabled={userReviewsLeft <= 0 || Boolean(matchLiveState.activeDrsReview?.isActive)}
                className="px-2.5 py-1 rounded-lg bg-cyan-950/90 hover:bg-cyan-900 border border-cyan-400/70 text-cyan-300 font-mono font-black text-[10px] uppercase flex items-center gap-1 shrink-0 shadow-sm shadow-cyan-500/20 active:scale-95 transition-all animate-pulse"
                title={drs.reason}
              >
                📺 DRS ({userReviewsLeft}) · {drs.reviewType === 'lbw' ? 'LBW' : 'EDGE'}
              </button>
            );
          }
          return null;
        })()}
      </div>

      {/* 5. Bottom Main Match Controls (Exact Match to Video 1 & 2: PLAY/PAUSE, TACTICS, CARD, 1x 2x 3x) */}
      <div className="px-3 pt-2 pb-2 bg-[#070b13] border-t border-slate-800/90 flex items-center justify-between gap-2">
        {/* Play / Pause button: toggles continuous auto-play at selectedSpeed */}
        <button
          disabled={status === 'finished'}
          onClick={() => {
            sound.playTap();
            if (autoPlaySpeed !== null) {
              setAutoPlaySpeed(null);
            } else {
              runBallSimulation();
              setAutoPlaySpeed(selectedSpeed);
            }
          }}
          className="flex-1 py-3 px-4 rounded-xl bg-[#f5b82e] hover:bg-[#eab308] text-black font-black text-sm uppercase flex items-center justify-center gap-2 shadow-lg shadow-[#f5b82e]/20 active:scale-95 transition-all"
        >
          {autoPlaySpeed !== null ? (
            <>
              <Pause className="w-4 h-4 fill-current" />
              PAUSE
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              PLAY
            </>
          )}
        </button>

        {/* Tactics Sheet Trigger */}
        <button
          onClick={() => {
            sound.playTap();
            setAutoPlaySpeed(null);
            setShowTacticsDrawer(true);
          }}
          className="px-3.5 py-3 rounded-xl bg-[#141d2c] hover:bg-[#1e293b] border border-slate-800 text-slate-200 font-bold text-xs uppercase flex items-center justify-center gap-1.5 active:scale-95 transition-all"
        >
          <Sliders className="w-3.5 h-3.5 text-[#38bdf8]" />
          TACTICS
        </button>

        {/* Card (Scorecard/Analysis modal) */}
        <button
          onClick={() => {
            sound.playTap();
            setAutoPlaySpeed(null);
            setShowAnalysis(true);
          }}
          className="px-3.5 py-3 rounded-xl bg-[#141d2c] hover:bg-[#1e293b] border border-slate-800 text-slate-200 font-bold text-xs uppercase flex items-center justify-center gap-1.5 active:scale-95 transition-all"
        >
          <FileText className="w-3.5 h-3.5 text-slate-300" />
          CARD
        </button>

        {/* Speed Pill Multipliers: 1x, 2x (Gold border/active), 3x (Lock) */}
        <div className="flex items-center bg-[#141d2c] p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => {
              sound.playTap();
              setSelectedSpeed(1);
              if (autoPlaySpeed !== null) setAutoPlaySpeed(1);
            }}
            className={`px-2 py-1 text-xs font-mono font-bold rounded-lg transition-all ${
              selectedSpeed === 1
                ? 'border border-[#f5b82e] text-[#f5b82e] bg-[#292010]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            1×
          </button>
          <button
            onClick={() => {
              sound.playTap();
              setSelectedSpeed(2);
              if (autoPlaySpeed !== null) setAutoPlaySpeed(2);
            }}
            className={`px-2 py-1 text-xs font-mono font-bold rounded-lg transition-all ${
              selectedSpeed === 2
                ? 'border border-[#f5b82e] text-[#f5b82e] bg-[#292010]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            2×
          </button>
          <button
            onClick={() => {
              sound.playTap();
              setSelectedSpeed(3);
              if (autoPlaySpeed !== null) setAutoPlaySpeed(3);
            }}
            className={`px-2 py-1 text-xs font-mono font-bold rounded-lg flex items-center gap-0.5 transition-all ${
              selectedSpeed === 3
                ? 'border border-[#f5b82e] text-[#f5b82e] bg-[#292010]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            3×
          </button>
        </div>
      </div>

      {/* SIMULATE AHEAD BOTTOM SHEET MODAL (Exact match to Video 2 at 1:46) */}
      {showSimMenu && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center">
          <div className="bg-[#0b101c] border-t border-slate-800 rounded-t-3xl w-full max-w-md p-4 shadow-2xl flex flex-col gap-3">
            <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto" />
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-base font-black text-white font-display">Simulate ahead</h3>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 font-mono font-bold text-xs">
                  Sim energy ⚡ UNLIMITED (FREE)
                </span>
                <button
                  onClick={() => setShowSimMenu(false)}
                  className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  sound.playTap();
                  simCurrentOver();
                  setShowSimMenu(false);
                }}
                className="w-full p-3.5 rounded-2xl bg-[#121a2b] hover:bg-[#172238] border border-slate-800 text-left flex items-center justify-between transition-all active:scale-98"
              >
                <div>
                  <span className="text-sm font-bold text-white block">End of this over</span>
                  <span className="text-xs text-slate-400">Finish the remaining balls in the current over</span>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-mono font-bold text-xs">
                  FREE
                </span>
              </button>

              <button
                onClick={() => {
                  sound.playTap();
                  simCurrentOver(5);
                  setShowSimMenu(false);
                }}
                className="w-full p-3.5 rounded-2xl bg-[#121a2b] hover:bg-[#172238] border border-slate-800 text-left flex items-center justify-between transition-all active:scale-98"
              >
                <div>
                  <span className="text-sm font-bold text-white block">Next 5 overs</span>
                  <span className="text-xs text-slate-400">Fast-forward 5 overs ahead</span>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono font-bold text-xs">
                  FREE
                </span>
              </button>

              <button
                onClick={() => {
                  sound.playTap();
                  simEntireMatch();
                  setShowSimMenu(false);
                }}
                className="w-full p-3.5 rounded-2xl bg-[#121a2b] hover:bg-[#172238] border border-amber-500/40 text-left flex items-center justify-between transition-all active:scale-98"
              >
                <div>
                  <span className="text-sm font-bold text-amber-300 block">To the end</span>
                  <span className="text-xs text-slate-400">Resolve the whole match</span>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-amber-400 text-black font-mono font-black text-xs">
                  FREE
                </span>
              </button>
            </div>

            {/* Secondary Match Tools Row (DRS / Rain DLS / Power Surge / Declare) */}
            <div className="pt-2 border-t border-slate-800/80 grid grid-cols-3 gap-2">
              {(() => {
                const latestBall = currentInnings.ballHistory.length > 0 ? currentInnings.ballHistory[0] : null;
                const drs = checkDrsEligibility(
                  currentInnings.ballHistory.length > 0 ? lastBallOutcome : null,
                  isUserBatting,
                  userReviewsLeft,
                  {
                    isDrsActive: Boolean(matchLiveState.activeDrsReview?.isActive),
                    matchStatus: status,
                    latestBallOutcome: latestBall
                  }
                );
                return (
                  <button
                    onClick={() => {
                      if (!drs.canReview) return;
                      sound.playTap();
                      setShowSimMenu(false);
                      triggerDrsReview();
                    }}
                    disabled={!drs.canReview}
                    title={drs.canReview ? `Challenge via DRS (${drs.reviewType.toUpperCase()}): ${drs.reason}` : drs.reason}
                    className="p-2 rounded-xl bg-[#121a2b] border border-slate-800 text-cyan-300 font-mono font-bold text-[10px] disabled:opacity-40 text-center"
                  >
                    📺 DRS ({userReviewsLeft})
                  </button>
                );
              })()}
              <button
                onClick={() => {
                  triggerRainDLSInterruption();
                  setShowSimMenu(false);
                }}
                className="p-2 rounded-xl bg-[#121a2b] border border-slate-800 text-cyan-300 font-mono font-bold text-[10px] text-center"
              >
                🌧️ Rain / DLS
              </button>
              {matchLiveState.format === 'TEST' ? (
                <button
                  onClick={() => {
                    declareInnings();
                    setShowSimMenu(false);
                  }}
                  className="p-2 rounded-xl bg-[#121a2b] border border-slate-800 text-rose-300 font-mono font-bold text-[10px] text-center"
                >
                  🏳️ Declare
                </button>
              ) : (
                <button
                  onClick={() => {
                    activatePowerSurge();
                    setShowSimMenu(false);
                  }}
                  disabled={Boolean(matchLiveState.powerSurgeTaken)}
                  className="p-2 rounded-xl bg-[#121a2b] border border-slate-800 text-amber-300 font-mono font-bold text-[10px] disabled:opacity-40 text-center"
                >
                  ⚡ Power Surge
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 1. PRE-MATCH: YOU WON THE TOSS MODAL (Screenshot 2) */}
      {showTossModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-sm p-5 shadow-2xl text-center">
            <div className="w-10 h-10 rounded-full bg-amber-400/20 text-amber-400 flex items-center justify-center mx-auto mb-3 text-lg font-bold">
              $
            </div>
            <h2 className="text-lg font-black text-white font-display uppercase tracking-wider mb-1">
              YOU WON THE TOSS
            </h2>
            <p className="text-xs text-slate-400 mb-2">
              {matchLiveState.pitchType} · {matchLiveState.weather}.
            </p>
            <button
              onClick={() => setShowConditionsModal(true)}
              className="text-xs text-amber-400 font-mono underline block mb-5 mx-auto"
            >
              VIEW CONDITIONS
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleTossDecision('bowl')}
                className="py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs uppercase"
              >
                BOWL FIRST
              </button>
              <button
                onClick={() => handleTossDecision('bat')}
                className="py-3 bg-amber-400 hover:bg-amber-300 text-black font-black rounded-xl text-xs uppercase shadow-md shadow-amber-500/20"
              >
                BAT FIRST
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. MATCH CONDITIONS SHEET (Screenshot 1) */}
      {showConditionsModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b101c] border border-slate-800 rounded-3xl w-full max-w-sm max-h-[85vh] p-5 shadow-2xl flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-3">
                <div>
                  <h3 className="font-display font-black text-lg text-white uppercase">
                    {matchLiveState.venue.split(',')[0] || 'Stadium'}
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono uppercase">
                    {(matchLiveState.venue.split(',')[1] || homeTeam.city || 'VENUE').trim()} · MATCH CONDITIONS
                  </span>
                </div>
                <button
                  onClick={() => setShowConditionsModal(false)}
                  className="p-1 rounded bg-slate-800 text-slate-400"
                >
                  ✕
                </button>
              </div>

              {/* Pitch */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">PITCH</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300">
                    {matchLiveState.pitchType}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80 text-xs flex flex-col gap-1.5">
                  <div className="flex justify-between">
                    <span>Seam movement</span>
                    <span className="text-white font-mono">
                      {matchLiveState.pitchType === 'Green Seamer' ? 'High' : matchLiveState.pitchType === 'Flat Belter' ? 'Minimal' : 'Low'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Bounce</span>
                    <span className="text-white font-mono">
                      {matchLiveState.pitchType === 'Flat Belter' ? 'True & Even' : matchLiveState.pitchType === 'Sluggish Gripper' ? 'Low' : 'Moderate'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Turn</span>
                    <span className="text-emerald-400 font-mono font-bold">
                      {matchLiveState.pitchType === 'Dry & Turning' || matchLiveState.pitchType === 'Sluggish Gripper' ? 'High' : 'Low'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Wear (late-game)</span>
                    <span className="text-white font-mono">
                      {matchLiveState.pitchType === 'Dry & Turning' ? 'Heavy' : 'Moderate'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Weather */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">WEATHER</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                    {matchLiveState.weather}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80 text-xs flex flex-col gap-1.5">
                  <div className="flex justify-between">
                    <span>Temperature</span>
                    <span className="text-white font-mono">{matchLiveState.weather === 'Sunny & Hot' ? '34°C' : '27°C'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Humidity</span>
                    <span className="text-white font-mono">{matchLiveState.weather === 'Overcast & Humid' ? 'High (82%)' : 'Moderate'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Evening dew</span>
                    <span className="text-white font-mono">{matchLiveState.hasDew ? 'Active (Wet Outfield)' : 'Moderate'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Rain risk</span>
                    <span className="text-white font-mono">{matchLiveState.weather === 'Overcast & Humid' ? 'Elevated' : 'Minimal'}</span>
                  </div>
                </div>
              </div>

              {/* Coach's Notes */}
              <div className="p-2.5 bg-slate-900 rounded-xl text-xs text-slate-300 border border-slate-800 mb-4">
                <span className="font-bold text-amber-400 block mb-1">COACH'S NOTES</span>
                <p className="text-[11px] text-slate-400">
                  {matchLiveState.pitchType === 'Green Seamer'
                    ? '• Live grass on the surface will assist seam and swing early on.\n• Look to bowl first and attack the stumps in the Powerplay.'
                    : matchLiveState.pitchType === 'Flat Belter'
                    ? '• A true batting paradise with short boundaries and true bounce.\n• Yorkers and slower variations will be vital at the death.'
                    : '• A dry surface that will grip. Spin is a real weapon here.\n• On a turner the ball given air does more, and cutters grip hard off the surface.'}
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowConditionsModal(false)}
              className="w-full py-3 bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase rounded-xl tracking-wider"
            >
              GOT IT
            </button>
          </div>
        </div>
      )}

      {/* 3A. OPENERS PICKER MODAL (Screenshot 3 - triggered after BAT FIRST or 2nd Innings Chase) */}
      <OpenerSelectionModal
        isOpen={showOpenersModal}
        onClose={() => setShowOpenersModal(false)}
        homeTeamName={activeUserMatchTeam.name.includes('Kolkata') ? 'Kolkata' : activeUserMatchTeam.name}
        awayTeamName={bowlingTeam.name}
        homeTeamShort={activeUserMatchTeam.shortName}
        awayTeamShort={bowlingTeam.shortName}
        homeTeamLogo={activeUserMatchTeam.logoEmoji || '⚔️'}
        venueName={matchLiveState.venue}
        players={userXIPlayers.length >= 2 ? userXIPlayers : players.filter(p => p.clubId === activeUserMatchTeam.id).slice(0, 11)}
        onOpenConditions={() => setShowConditionsModal(true)}
        onConfirmOpeners={(strikerId, nonStrikerId) => {
          selectOpeners(strikerId, nonStrikerId);
          setShowOpenersModal(false);
          setShowTacticsDrawer(true);
        }}
        onSimMatch={() => {
          setShowOpenersModal(false);
          simEntireMatch();
        }}
      />

      {/* 3B. OPENING BOWLER PICKER BOTTOM SHEET (Screenshot 8) */}
      {showOpeningBowlerModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center">
          <div className="bg-[#0b101c] border-t border-slate-800 rounded-t-3xl w-full max-w-md max-h-[82vh] p-4 shadow-2xl flex flex-col justify-between overflow-hidden">
            <div>
              {/* Drag handle */}
              <div className="w-10 h-1 bg-slate-600/60 rounded-full mx-auto mb-3" />

              <div className="pb-2.5 border-b border-slate-800 mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-[10px] font-mono text-amber-400 uppercase font-bold tracking-wider">
                    OPENING BOWLER
                  </span>
                  <Info className="w-4 h-4 text-slate-400" />
                </div>
                <span className="text-sm font-semibold text-slate-200 block">
                  Pick who takes the new ball.
                </span>
              </div>

              {/* Bowlers Table Header (Screenshot 8: PLAYER / TYPE, MU, BOWL, MOV, CTR, DTH) */}
              <div className="grid grid-cols-12 px-2 py-1.5 text-[10px] font-mono font-bold text-slate-400 uppercase border-b border-slate-800/80 mb-1">
                <span className="col-span-6">PLAYER / TYPE</span>
                <span className="col-span-1 text-center">MU</span>
                <span className="col-span-1 text-center">BOWL</span>
                <span className="col-span-1 text-center">MOV</span>
                <span className="col-span-1 text-center">CTR</span>
                <span className="col-span-2 text-right">DTH</span>
              </div>

              <div className="overflow-y-auto max-h-64 flex flex-col gap-1.5 py-1">
                {(userXIPlayers.filter(p => p.role === 'Pace' || p.role === 'Spin' || p.role === 'All-rounder').length > 0
                  ? userXIPlayers.filter(p => p.role === 'Pace' || p.role === 'Spin' || p.role === 'All-rounder')
                  : userXIPlayers.slice(0, 6)
                ).map(b => {
                  const isSelected = selectedOpeningBowlerId === b.id;
                  const movVal = b.ratings.var || b.ratings.pace || 78;
                  return (
                    <button
                      key={b.id}
                      onClick={() => handleSelectOpeningBowler(b.id)}
                      className={`p-2.5 rounded-xl border text-xs transition-all text-left ${
                        isSelected
                          ? 'bg-amber-500/20 border-amber-400 text-white shadow-md'
                          : 'bg-[#121927] border-slate-800/80 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="grid grid-cols-12 items-center">
                        <div className="col-span-6 flex items-center gap-2 min-w-0">
                          <div className={`w-6 h-6 rounded flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                            isSelected ? 'bg-amber-400 text-black' : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}>
                            {b.jerseyNumber || 11}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <span className={`font-bold truncate text-xs ${isSelected ? 'text-amber-300' : 'text-white'}`}>
                                {b.name.split(' ').pop()}
                              </span>
                              <span className="text-[10px] text-slate-400 shrink-0">{b.age || 26}y</span>
                            </div>
                            <span className="text-[10px] text-slate-400 block truncate">
                              {b.role} · {b.bowlingArm}
                            </span>
                          </div>
                        </div>

                        <span className="col-span-1 text-center text-xs font-bold text-emerald-400 font-mono">
                          {b.role === 'Spin' ? '++' : '+'}
                        </span>
                        <span className={`col-span-1 text-center font-mono font-bold text-xs ${b.ratings.bowl >= 84 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {b.ratings.bowl}
                        </span>
                        <span className={`col-span-1 text-center font-mono font-bold text-xs ${movVal >= 84 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {movVal}
                        </span>
                        <span className={`col-span-1 text-center font-mono font-bold text-xs ${b.ratings.ctrl >= 80 ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {b.ratings.ctrl}
                        </span>
                        <span className={`col-span-2 text-right font-mono font-bold text-xs ${b.ratings.dth >= 82 ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {b.ratings.dth}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleConfirmOpeningBowler}
              disabled={!selectedOpeningBowlerId}
              className={`mt-3 w-full py-3.5 font-black text-xs uppercase rounded-2xl tracking-wider transition-all ${
                selectedOpeningBowlerId
                  ? 'bg-[#f5b82e] hover:bg-[#eab308] text-black shadow-lg shadow-amber-500/20 active:scale-95'
                  : 'bg-slate-800/80 text-slate-500 cursor-not-allowed border border-slate-700/60'
              }`}
            >
              {selectedOpeningBowlerId
                ? `START WITH ${players.find(p => p.id === selectedOpeningBowlerId)?.name.split(' ').pop()?.toUpperCase() || 'BOWLER'}`
                : 'PICK A BOWLER'}
            </button>
          </div>
        </div>
      )}

      {/* 4. TACTICS DRAWER (Batting or Bowling strictly for user team) */}
      {isUserBatting ? (
        <BattingTacticsDrawer
          isOpen={showTacticsDrawer}
          onClose={() => setShowTacticsDrawer(false)}
          striker={striker}
          nonStriker={nonStriker}
          strikerRuns={strikerScore.runs}
          strikerBalls={strikerScore.balls}
          nonStrikerRuns={nonStrikerScore.runs}
          nonStrikerBalls={nonStrikerScore.balls}
          currentApproach={battingTactics.approach}
          nonStrikerApproach={battingTactics.nonStrikerApproach}
          onSelectApproach={(approach) => updateBattingTactics({ approach })}
          onSelectNonStrikerApproach={(nonStrikerApproach) => updateBattingTactics({ nonStrikerApproach })}
          pairRunning={battingTactics.pairRunning || pairRunning}
          onSelectPairRunning={(pr) => {
            setPairRunning(pr);
            updateBattingTactics({ pairRunning: pr });
          }}
          targetSide={battingTactics.targetSide}
          onUpdateBattingTactics={(tactics) => updateBattingTactics(tactics)}
          currentOver={Math.floor(currentInnings.ballsCompleted / 6)}
          wicketsLost={currentInnings.wickets}
          requiredRunRate={requiredRunRate}
          onOpenImpactModal={() => setShowImpactModal(true)}
          impactPlayerUsed={Boolean(matchLiveState.impactPlayerUsed || impactPlayerUsed)}
          ballHistory={currentInnings.ballHistory}
        />
      ) : (
        <BowlingTacticsDrawer
          isOpen={showTacticsDrawer}
          onClose={() => setShowTacticsDrawer(false)}
          bowler={currentBowler}
          bowlerFigures={bowlerFigures}
          bowlerEcon={bowlerEcon}
          bowlerOversBowled={bowlerOversBowled}
          fieldingPlayers={fieldingXIPlayers.length > 0 ? fieldingXIPlayers : players.filter(p => p.clubId === bowlingTeam.id).slice(0, 11)}
          bowlingTactics={bowlingTactics}
          onUpdateTactics={updateBowlingTactics}
          fielders={bowlingTactics.fielders}
          onApplyFieldPreset={applyFieldPreset}
          onFielderMove={handleFielderMove}
          onOpenImpactModal={() => setShowImpactModal(true)}
          impactPlayerUsed={Boolean(matchLiveState.impactPlayerUsed || impactPlayerUsed)}
          ballHistory={currentInnings.ballHistory}
          striker={striker}
        />
      )}

      {/* 5. END OF OVER: PICK A BOWLER MODAL (Video 1 at 0:15, 0:58, 1:24, 1:31) */}
      <EndOverBowlerModal
        isOpen={showEndOverModal}
        lastBowler={currentBowler}
        lastBowlerFigures={bowlerFigures}
        maxOversPerBowler={matchLiveState.format === 'TEST' ? 99 : matchLiveState.format === 'ODI' ? 10 : 4}
        bowlers={bowlingXIPlayers.map(p => {
          const bScore = currentInnings.bowlers.find(b => b.playerId === p.id);
          return {
            player: p,
            overs: bScore ? bScore.overs : 0,
            maidens: bScore ? bScore.maidens : 0,
            runs: bScore ? bScore.runs : 0,
            wickets: bScore ? bScore.wickets : 0,
            econ: bScore ? bScore.economy : 0
          };
        })}
        onSelectBowler={(bowlerId) => {
          selectNewBowler(bowlerId);
          setShowEndOverModal(false);
          setShowTacticsDrawer(true);
        }}
      />

      {/* 6. WICKET FALL: PICK A BATTER MODAL (Video 2 at 1:04, 1:40) */}
      <WicketBatterModal
        isOpen={showWicketModal}
        outBatterName={dismissedBatterPlayer.name}
        outBatterRuns={dismissedBatterScore.runs}
        outBatterBalls={dismissedBatterScore.balls}
        dismissalText={lastBallOutcome?.dismissalText || dismissedBatterScore.dismissal}
        bowlerName={lastBallOutcome?.bowlerName || currentBowler.name}
        tacticalNote={lastBallOutcome?.tacticalNote || `${dismissedBatterPlayer.name} dismissed by ${currentBowler.name}.`}
        availableBatters={availableDugoutBatters.length > 0 ? availableDugoutBatters : players.filter(p => p.clubId === battingTeam.id && p.id !== dismissedBatterPlayer.id && p.id !== survivingPartnerId).slice(0, 5)}
        onSelectBatter={(batterId) => {
          selectNextBatter(batterId);
          setShowWicketModal(false);
        }}
        onOpenImpactModal={() => setShowImpactModal(true)}
        onTriggerDrs={() => {
          setAutoPlaySpeed(null);
          triggerDrsReview();
        }}
        reviewsRemaining={userReviewsLeft}
        drsAlreadyReviewed={Boolean(lastBallOutcome?.drsReviewed)}
        lastBallOutcome={currentInnings.ballHistory.length > 0 ? lastBallOutcome : null}
      />

      {/* 7. IMPACT PLAYER MODAL (Video 2 at 1:17 - 1:34) */}
      <ImpactPlayerModal
        isOpen={showImpactModal}
        onClose={() => setShowImpactModal(false)}
        teamName={activeUserMatchTeam.name.includes('Kolkata') ? 'Kolkata' : activeUserMatchTeam.name}
        benchPlayers={benchPlayers.length > 0 ? benchPlayers : players.filter(p => p.clubId === activeUserMatchTeam.id).slice(8, 14)}
        activeXIPlayers={userXIPlayers.length > 0 ? userXIPlayers : players.filter(p => p.clubId === activeUserMatchTeam.id).slice(0, 8)}
        onConfirmSubstitution={handleConfirmSubstitution}
      />

      {/* 8. END OF INNINGS BREAK MODAL (Video 1 at 0:00) */}
      {status === 'innings_break' && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-amber-500/40 rounded-3xl w-full max-w-sm p-6 shadow-2xl text-center">
            <span className="text-[10px] font-mono uppercase text-amber-400 font-bold tracking-wider block mb-1">
              END OF INNINGS
            </span>
            <div className="text-3xl font-black text-white font-display mb-1">
              {(innings1.battingTeamId === homeTeam.id ? homeTeam.shortName : awayTeam.shortName) || 'BAT'} {innings1.runs}/{innings1.wickets}
            </div>
            <div className="text-xs text-slate-400 font-mono mb-4">
              ({(innings1.ballsCompleted / 6).toFixed(1)} overs)
            </div>
            <div className="py-2.5 px-4 bg-slate-900/80 rounded-2xl border border-slate-800 text-sm font-bold text-amber-300 font-mono mb-5">
              Target: {targetRuns || (innings1.runs + 1)}
            </div>
            <button
              onClick={() => {
                sound.playTap();
                const userBattedFirst = isUserBatting;
                startSecondInnings();
                if (userBattedFirst) {
                  setSelectedOpeningBowlerId('');
                  setShowOpeningBowlerModal(true);
                } else {
                  setShowOpenersModal(true);
                }
              }}
              className="w-full py-4 bg-[#f5b82e] hover:bg-[#eab308] text-black font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-amber-500/20 active:scale-98 transition-all"
            >
              Start 2nd Innings
            </button>
          </div>
        </div>
      )}

      {/* 9. MATCH RESULT MODAL (Video 1 at 1:47) */}
      {status === 'finished' && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              <span className="text-base font-black font-display uppercase tracking-wider text-white">
                {matchLiveState.winnerTeamId === activeUserMatchTeam.id ? 'YOU WON' : 'MATCH COMPLETED'}
              </span>
            </div>
            <div className="text-lg font-black text-white mb-2">
              {resultText || `${battingTeam.shortName} won`}
            </div>
            <div className="text-xs text-slate-400 font-mono mb-5">
              {(innings1.battingTeamId === homeTeam.id ? homeTeam.shortName : awayTeam.shortName) || 'INN 1'}: {innings1.runs}/{innings1.wickets} · {((innings2?.battingTeamId || innings1.bowlingTeamId) === homeTeam.id ? homeTeam.shortName : awayTeam.shortName) || 'INN 2'}: {innings2?.runs || 0}/{innings2?.wickets || 0}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  sound.playTap();
                  setShowAnalysis(true);
                }}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider rounded-2xl border border-slate-700 transition-all"
              >
                SCORECARD
              </button>
              <button
                onClick={() => {
                  sound.playTap();
                  finishMatch();
                }}
                className="flex-1 py-3 bg-[#f5b82e] hover:bg-[#eab308] text-black font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl active:scale-98 transition-all"
              >
                CONTINUE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. IN-MATCH PLAYER SCOUTING & ATTRIBUTES INSPECTOR MODAL */}
      {inspectedPlayer && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b101c] border border-slate-800 rounded-3xl w-full max-w-sm p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-400 text-black font-black font-mono text-sm flex items-center justify-center">
                  #{inspectedPlayer.jerseyNumber || 10}
                </div>
                <div>
                  <h3 className="text-base font-black text-white font-display leading-tight">
                    {inspectedPlayer.name}
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400">
                    {inspectedPlayer.role} · {inspectedPlayer.age}y · {inspectedPlayer.battingHand} · {inspectedPlayer.bowlingArm}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setInspectedPlayer(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-3">
              <span className="text-[10px] font-mono uppercase text-amber-400 font-bold block mb-1.5">
                BATTING & MATCH-UP RATINGS
              </span>
              <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-xs">
                {[
                  { label: 'BAT', val: inspectedPlayer.ratings.bat },
                  { label: 'POW', val: inspectedPlayer.ratings.pow },
                  { label: 'TEC', val: inspectedPlayer.ratings.tec || inspectedPlayer.ratings.ctrl || 75 },
                  { label: 'TMP', val: inspectedPlayer.ratings.tmp || 75 },
                  { label: 'vPACE', val: inspectedPlayer.ratings.vp || inspectedPlayer.ratings.bat },
                  { label: 'vSPIN', val: inspectedPlayer.ratings.vs || inspectedPlayer.ratings.bat },
                  { label: 'RUN', val: inspectedPlayer.ratings.run || 75 },
                  { label: 'FORM', val: inspectedPlayer.form || 78 }
                ].map(item => (
                  <div key={item.label} className="p-1.5 rounded-xl bg-[#121927] border border-slate-800">
                    <span className="block text-[9px] text-slate-400">{item.label}</span>
                    <span className={`font-bold ${item.val >= 82 ? 'text-emerald-400' : item.val >= 72 ? 'text-amber-400' : 'text-slate-300'}`}>
                      {item.val}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <span className="text-[10px] font-mono uppercase text-cyan-400 font-bold block mb-1.5">
                BOWLING & FIELDING RATINGS
              </span>
              <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-xs">
                {[
                  { label: 'BOWL', val: inspectedPlayer.ratings.bowl },
                  { label: 'PACE', val: inspectedPlayer.ratings.pace },
                  { label: 'CTRL', val: inspectedPlayer.ratings.ctrl },
                  { label: 'DTH', val: inspectedPlayer.ratings.dth },
                  { label: 'VAR', val: inspectedPlayer.ratings.var || inspectedPlayer.ratings.pace },
                  { label: 'CAT', val: inspectedPlayer.ratings.cat },
                  { label: 'FLD', val: inspectedPlayer.ratings.fld || inspectedPlayer.ratings.cat },
                  { label: 'FIT', val: inspectedPlayer.fitness || 95 }
                ].map(item => (
                  <div key={item.label} className="p-1.5 rounded-xl bg-[#121927] border border-slate-800">
                    <span className="block text-[9px] text-slate-400">{item.label}</span>
                    <span className={`font-bold ${(item.val ?? 70) >= 82 ? 'text-cyan-400' : (item.val ?? 70) >= 72 ? 'text-amber-400' : 'text-slate-300'}`}>
                      {item.val ?? 70}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <PlayerCareerStatsCard player={inspectedPlayer} className="mb-4" />

            <button
              onClick={() => setInspectedPlayer(null)}
              className="w-full py-3 bg-[#f5b82e] hover:bg-[#eab308] text-black font-black text-xs uppercase rounded-xl tracking-wider"
            >
              CLOSE SCOUTING CARD
            </button>
          </div>
        </div>
      )}

      {/* Match Analysis Modal (Wagon Wheel, Manhattan, Worm, Scorecard) */}
      {showAnalysis && (
        <MatchAnalysisModal
          matchState={matchLiveState}
          onClose={() => setShowAnalysis(false)}
        />
      )}

      {/* Feature 6.1: DRS Review Modal (UltraEdge Snickometer + Hawk-Eye Ball Tracking) */}
      {matchLiveState.activeDrsReview && (
        <DRSReviewModal
          isOpen={matchLiveState.activeDrsReview.isActive}
          onClose={() => {}}
          reviewState={matchLiveState.activeDrsReview}
          onDecisionFinalized={(finalVerdict, reviewRetained) => {
            resolveDrsReview(finalVerdict, reviewRetained);
            if (finalVerdict === 'NOT OUT') {
              setShowWicketModal(false);
            }
          }}
        />
      )}
    </div>
  );
};
