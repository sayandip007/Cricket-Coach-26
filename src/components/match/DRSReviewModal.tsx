import React, { useState, useEffect, useRef } from 'react';
import { Radio, Activity, RefreshCw } from 'lucide-react';
import { DRSReviewState } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';

interface DRSReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  reviewState: DRSReviewState;
  onDecisionFinalized: (finalVerdict: 'OUT' | 'NOT OUT', reviewRetained: boolean) => void;
}

export const DRSReviewModal: React.FC<DRSReviewModalProps> = ({
  isOpen,
  onClose,
  reviewState,
  onDecisionFinalized
}) => {
  const [stage, setStage] = useState<'snicko' | 'hawkeye' | 'verdict'>('snicko');
  const [frameIndex, setFrameIndex] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStage('snicko');
      setFrameIndex(0);
      return;
    }

    // Stage progression timer
    const t1 = setTimeout(() => {
      sound.playTap();
      setStage('hawkeye');
    }, 2800);

    const t2 = setTimeout(() => {
      if (reviewState.finalDecision === 'OUT') {
        sound.playWicketCrash();
      } else {
        sound.playCrowdCheer(0.9);
      }
      setStage('verdict');
    }, 5600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isOpen, reviewState]);

  // UltraEdge Snickometer Canvas Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || stage !== 'snicko') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let t = 0;

    const render = () => {
      t += 0.08;
      ctx.fillStyle = '#050a14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const midY = canvas.height / 2;

      // Grid background
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.5)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 25) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      // Draw audio waveform
      ctx.beginPath();
      ctx.moveTo(0, midY);

      for (let x = 0; x < canvas.width; x += 3) {
        // Center spike at x ~ 150
        const distFromCenter = Math.abs(x - canvas.width / 2);
        let amplitude = 2.5;

        if (reviewState.snickoSpike && distFromCenter < 35) {
          // Sharp UltraEdge spike
          amplitude = Math.sin(t * 12 + x) * (38 - distFromCenter);
        } else {
          // Ambient low vibration
          amplitude = Math.sin(t * 4 + x * 0.1) * 3;
        }

        ctx.lineTo(x, midY + amplitude);
      }

      ctx.strokeStyle = reviewState.snickoSpike ? '#f43f5e' : '#38bdf8';
      ctx.lineWidth = 2;
      ctx.shadowColor = reviewState.snickoSpike ? '#f43f5e' : '#38bdf8';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Ball frame indicator
      const ballX = ((t * 40) % (canvas.width + 40)) - 20;
      ctx.beginPath();
      ctx.arc(ballX, midY - 25, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();

      // Bat edge representation line
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(canvas.width / 2 - 2, 8, 4, canvas.height - 16);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [stage, reviewState.snickoSpike]);

  if (!isOpen) return null;

  const handleDone = () => {
    sound.playTap();
    onDecisionFinalized(reviewState.finalDecision, reviewState.reviewRetained);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-3 select-none animate-fadeIn">
      <div className="bg-[#070c18] border border-cyan-500/40 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        {/* Top TV Umpire Header */}
        <div className="px-4 py-3 bg-[#0d1627] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-rose-500 animate-pulse" />
            <span className="text-xs font-mono font-black uppercase text-cyan-400 tracking-wider">
              DRS · THIRD UMPIRE REVIEW
            </span>
          </div>
          <span className="text-[10px] font-mono font-bold text-slate-300 px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
            {reviewState.type === 'lbw' ? 'LBW BALL TRACKING' : 'CAUGHT BEHIND / EDGE'}
          </span>
        </div>

        {/* Interactive Stage Switcher Tabs */}
        <div className="grid grid-cols-3 bg-[#090f1d] border-b border-slate-800 text-[10px] font-mono font-bold">
          <button
            onClick={() => { sound.playTap(); setStage('snicko'); }}
            className={`py-2 text-center border-b-2 transition-all ${
              stage === 'snicko'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-950/30'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            1. ULTRAEDGE
          </button>
          <button
            onClick={() => { sound.playTap(); setStage('hawkeye'); }}
            className={`py-2 text-center border-b-2 transition-all ${
              stage === 'hawkeye'
                ? 'border-amber-400 text-amber-300 bg-amber-950/30'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            2. HAWK-EYE
          </button>
          <button
            onClick={() => { sound.playTap(); setStage('verdict'); }}
            className={`py-2 text-center border-b-2 transition-all ${
              stage === 'verdict'
                ? 'border-emerald-400 text-emerald-300 bg-emerald-950/30'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            3. VERDICT
          </button>
        </div>

        {/* Players & Review Info */}
        <div className="px-4 py-2.5 bg-[#0a101f] border-b border-slate-800/80 flex items-center justify-between text-xs font-mono">
          <div>
            <span className="text-slate-400 block text-[10px]">BATTER</span>
            <span className="text-white font-bold">{reviewState.batterName}</span>
          </div>
          <div className="text-center">
            <span className="text-slate-400 block text-[10px]">ON-FIELD CALL</span>
            <span className={`font-black ${reviewState.originalDecision === 'OUT' ? 'text-rose-400' : 'text-emerald-400'}`}>
              {reviewState.originalDecision}
            </span>
          </div>
          <div className="text-right">
            <span className="text-slate-400 block text-[10px]">BOWLER</span>
            <span className="text-white font-bold">{reviewState.bowlerName}</span>
          </div>
        </div>

        {/* Stage Content */}
        <div className="p-4 flex-1 flex flex-col gap-3">
          {/* STEP 1: SNICKOMETER / ULTRAEDGE */}
          {stage === 'snicko' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono text-cyan-300 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  ULTRAEDGE™ AUDIO WAVEFORM
                </span>
                <span className="text-[10px] font-mono text-slate-400">ROCK & ROLL FRAME</span>
              </div>

              <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-black">
                <canvas ref={canvasRef} width={340} height={130} className="w-full h-32 block" />
                <div className={`absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 text-[9px] font-mono font-bold border ${
                  reviewState.snickoSpike
                    ? 'text-rose-400 border-rose-500/40'
                    : 'text-cyan-300 border-cyan-500/30'
                }`}>
                  {reviewState.snickoSpike ? '⚡ SPIKE DETECTED AS BALL PASSES BAT' : '— FLAT NOISE FLOOR (NO BAT INVOLVED)'}
                </div>
              </div>

              <p className="text-[11px] text-slate-300 font-sans italic bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                TV Umpire: &ldquo;{reviewState.snickoSpike
                  ? (reviewState.type === 'lbw'
                      ? 'Clear spike on UltraEdge as the ball passes the inside edge! Bat involved before pad.'
                      : 'I have a clear spike as the ball passes the bat edge. Bat is involved.')
                  : 'Clear gap between bat and ball. Flat line on UltraEdge. Proceeding to Hawk-Eye ball tracking...'}&rdquo;
              </p>
            </div>
          )}

          {/* STEP 2: HAWK-EYE 3D BALL TRACKING */}
          {stage === 'hawkeye' && (
            <div className="flex flex-col gap-2.5">
              <span className="text-xs font-bold font-mono text-amber-400 flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-amber-400" />
                HAWK-EYE™ 3D BALL TRACKING TRAJECTORY
              </span>

              {/* 3 Hawk-Eye Criteria Cards */}
              <div className="grid grid-cols-3 gap-2">
                {/* 1. Pitching */}
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
                  <span className="text-[9px] font-mono text-slate-400 block mb-1">PITCHING</span>
                  <span className={`text-[11px] font-mono font-black ${
                    reviewState.hawkeye.pitching === 'In-line' || reviewState.hawkeye.pitching === 'Outside Off'
                      ? 'text-rose-400'
                      : 'text-emerald-400'
                  }`}>
                    {reviewState.hawkeye.pitching.toUpperCase()}
                  </span>
                </div>

                {/* 2. Impact */}
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
                  <span className="text-[9px] font-mono text-slate-400 block mb-1">IMPACT</span>
                  <span className={`text-[11px] font-mono font-black ${
                    reviewState.hawkeye.impact === 'In-line'
                      ? 'text-rose-400'
                      : reviewState.hawkeye.impact === "Umpire's Call"
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}>
                    {reviewState.hawkeye.impact.toUpperCase()}
                  </span>
                </div>

                {/* 3. Wickets */}
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-center">
                  <span className="text-[9px] font-mono text-slate-400 block mb-1">WICKETS</span>
                  <span className={`text-[11px] font-mono font-black ${
                    reviewState.hawkeye.wickets === 'Hitting Stumps'
                      ? 'text-rose-400'
                      : reviewState.hawkeye.wickets === "Umpire's Call"
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}>
                    {reviewState.hawkeye.wickets.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Graphical 3D-style Stumps & Pitch Strip Trajectory Indicator */}
              <div className="p-3 bg-gradient-to-b from-[#132338] to-[#0a121f] rounded-2xl border border-cyan-500/30 text-center flex flex-col items-center relative overflow-hidden">
                <svg viewBox="0 0 260 110" className="w-full h-28">
                  {/* Perspective Pitch Mat (Blue/Cyan in-line zone) */}
                  <polygon points="85,105 175,105 152,25 108,25" fill="rgba(194, 161, 110, 0.25)" stroke="#475569" strokeWidth="1" />
                  <polygon points="108,105 152,105 142,25 118,25" fill="rgba(56, 189, 248, 0.22)" />
                  {/* Stumps at far end */}
                  <rect x="120" y="10" width="3" height="22" rx="1" fill="#f8fafc" />
                  <rect x="128.5" y="10" width="3" height="22" rx="1" fill="#f8fafc" />
                  <rect x="137" y="10" width="3" height="22" rx="1" fill="#f8fafc" />
                  <line x1="120" y1="10" x2="140" y2="10" stroke="#fbbf24" strokeWidth="2" />

                  {/* Ball Trajectory Path */}
                  {(() => {
                    const hitX = reviewState.hawkeye.wickets === 'Hitting Stumps'
                      ? 130
                      : reviewState.hawkeye.wickets === "Umpire's Call"
                      ? 140
                      : 158;
                    const hitY = reviewState.hawkeye.wickets === 'Missing Stumps' ? 6 : 18;
                    const impactX = reviewState.hawkeye.impact === 'Outside Off' ? 148 : 131;
                    const pitchX = reviewState.hawkeye.pitching === 'Outside Leg' ? 105 : 132;
                    return (
                      <>
                        {/* Bowled to Pitching */}
                        <path
                          d={`M 136 104 Q 134 88 ${pitchX} 74`}
                          fill="none"
                          stroke="#f43f5e"
                          strokeWidth="3"
                        />
                        {/* Pitching to Impact */}
                        <path
                          d={`M ${pitchX} 74 Q ${(pitchX + impactX) / 2} 58 ${impactX} 45`}
                          fill="none"
                          stroke="#f43f5e"
                          strokeWidth="3"
                        />
                        {/* Predicted Path to Stumps */}
                        <path
                          d={`M ${impactX} 45 Q ${(impactX + hitX) / 2} 30 ${hitX} ${hitY}`}
                          fill="none"
                          stroke={reviewState.hawkeye.wickets === 'Missing Stumps' ? '#38bdf8' : '#fbbf24'}
                          strokeWidth="2.5"
                          strokeDasharray="4 2"
                        />
                        {/* Pitching Dot */}
                        <circle cx={pitchX} cy={74} r="4" fill="#ef4444" stroke="#ffffff" strokeWidth="1" />
                        {/* Impact Dot */}
                        <circle cx={impactX} cy={45} r="4.5" fill="#f59e0b" stroke="#ffffff" strokeWidth="1" />
                        {/* Stump / Final Dot */}
                        <circle
                          cx={hitX}
                          cy={hitY}
                          r="5"
                          fill={reviewState.hawkeye.wickets === 'Missing Stumps' ? '#10b981' : '#f43f5e'}
                          stroke="#ffffff"
                          strokeWidth="1.5"
                        />
                      </>
                    );
                  })()}
                </svg>
                <span className="text-[11px] font-mono font-bold text-white mt-0.5">
                  Projection: {reviewState.hawkeye.wickets} ({reviewState.hawkeye.impact})
                </span>
              </div>
            </div>
          )}

          {/* STEP 3: FINAL VERDICT */}
          {stage === 'verdict' && (
            <div className="flex flex-col gap-3 py-2 items-center text-center animate-fadeIn">
              <div className={`w-16 h-16 rounded-3xl flex items-center justify-center text-3xl shadow-xl ${
                reviewState.finalDecision === 'OUT'
                  ? 'bg-rose-500/20 border-2 border-rose-500 text-rose-400 shadow-rose-500/20'
                  : 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 shadow-emerald-500/20'
              }`}>
                {reviewState.finalDecision === 'OUT' ? '🔴' : '🟢'}
              </div>

              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block">
                  THIRD UMPIRE FINAL VERDICT
                </span>
                <h3 className={`text-3xl font-black font-display uppercase tracking-wider ${
                  reviewState.finalDecision === 'OUT' ? 'text-rose-400' : 'text-emerald-400'
                }`}>
                  {reviewState.finalDecision}
                </h3>
              </div>

              {/* Overturned / Retained badge */}
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold border ${
                  reviewState.isOverturned
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}>
                  {reviewState.isOverturned ? 'DECISION OVERTURNED!' : 'DECISION UPHELD'}
                </span>
                <span className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold border ${
                  reviewState.reviewRetained
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                    : 'bg-rose-500/20 border-rose-400 text-rose-300'
                }`}>
                  {reviewState.reviewRetained ? 'REVIEW RETAINED' : 'REVIEW LOST (-1)'}
                </span>
              </div>

              <p className="text-xs text-slate-300 max-w-xs">
                {reviewState.finalDecision === 'OUT'
                  ? (reviewState.isOverturned
                      ? `Brilliant review! On-field NOT OUT is overturned to OUT! ${reviewState.batterName} must depart!`
                      : `Dismissal stands. ${reviewState.batterName} departs!`)
                  : (reviewState.isOverturned
                      ? `Overturned to NOT OUT! ${reviewState.batterName} survives and continues at the crease!`
                      : `Not out stands! ${reviewState.batterName} remains at the crease.`)}
              </p>
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="p-4 bg-[#0a101f] border-t border-slate-800/80">
          {stage === 'verdict' ? (
            <button
              onClick={handleDone}
              className="w-full py-3.5 bg-amber-400 hover:bg-amber-300 text-black font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-amber-500/20 active:scale-95 transition-all"
            >
              APPLY VERDICT & RESUME MATCH
            </button>
          ) : (
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span className="flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                Processing 3rd Umpire telemetry...
              </span>
              <button
                onClick={() => {
                  sound.playTap();
                  setStage('verdict');
                }}
                className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/50 text-[10px] font-bold text-amber-300 hover:bg-amber-500/30"
              >
                Skip to Verdict ▶
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
