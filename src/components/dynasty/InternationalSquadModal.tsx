import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Check, AlertCircle, ChevronRight } from 'lucide-react';
import { Player } from '../../types/cricket';
import { sound } from '../../utils/soundEffects';

export const REQUIRED_NATIONAL_SQUAD_SIZE = 15;

/**
 * Pure helper to reconcile selected player IDs when the selected nation or eligible player pool changes.
 * - Removes IDs not belonging to `eligiblePlayers` (no foreign players ever kept)
 * - Removes duplicate IDs while preserving selection order
 * - Preserves valid selections for the active nation
 * - If `autoFillWhenEmpty` is true and no valid selections remain (e.g., nation switched),
 *   populates up to `requiredCount` strictly from `eligiblePlayers` (never from another country)
 */
export function reconcileNationalSelection(
  prevSelectedIds: string[],
  eligiblePlayers: Player[],
  requiredCount: number = REQUIRED_NATIONAL_SQUAD_SIZE,
  autoFillWhenEmpty: boolean = false
): string[] {
  const eligibleIdSet = new Set(eligiblePlayers.map(p => p.id));
  const seen = new Set<string>();
  const validPreserved: string[] = [];

  for (const id of prevSelectedIds || []) {
    if (eligibleIdSet.has(id) && !seen.has(id)) {
      seen.add(id);
      validPreserved.push(id);
      if (validPreserved.length >= requiredCount) break;
    }
  }

  if (validPreserved.length === 0 && autoFillWhenEmpty && eligiblePlayers.length >= requiredCount) {
    return eligiblePlayers.slice(0, requiredCount).map(p => p.id);
  }

  return validPreserved;
}

/**
 * Pure authoritative validator for a national squad selection.
 */
export function validateNationalSquadSelection(
  selectedIds: string[],
  allPlayers: Player[],
  nationName: string,
  requiredCount: number = REQUIRED_NATIONAL_SQUAD_SIZE
): {
  isValid: boolean;
  error?: string;
  validatedIds: string[];
  eligibleCount: number;
} {
  const nationLower = (nationName || '').trim().toLowerCase();
  const eligiblePool = allPlayers.filter(
    p => p.country && p.country.trim().toLowerCase() === nationLower
  );

  if (eligiblePool.length < requiredCount) {
    return {
      isValid: false,
      error: `Insufficient eligible players for ${nationName}: only ${eligiblePool.length} available (${requiredCount} required).`,
      validatedIds: [],
      eligibleCount: eligiblePool.length
    };
  }

  if (!Array.isArray(selectedIds) || selectedIds.length !== requiredCount) {
    return {
      isValid: false,
      error: `Please select exactly ${requiredCount} eligible players for ${nationName} (currently ${selectedIds?.length || 0}/${requiredCount}).`,
      validatedIds: [],
      eligibleCount: eligiblePool.length
    };
  }

  const uniqueIds = new Set(selectedIds);
  if (uniqueIds.size !== requiredCount) {
    return {
      isValid: false,
      error: 'Duplicate player IDs detected in national squad selection.',
      validatedIds: [],
      eligibleCount: eligiblePool.length
    };
  }

  const eligibleMap = new Map(eligiblePool.map(p => [p.id, p]));
  for (const id of selectedIds) {
    const player = allPlayers.find(p => p.id === id);
    if (!player) {
      return {
        isValid: false,
        error: `Selected player ID "${id}" does not exist in the player pool.`,
        validatedIds: [],
        eligibleCount: eligiblePool.length
      };
    }
    if (!eligibleMap.has(id) || player.country.trim().toLowerCase() !== nationLower) {
      return {
        isValid: false,
        error: `Player ${player.name} (${player.country}) is not eligible for ${nationName}.`,
        validatedIds: [],
        eligibleCount: eligiblePool.length
      };
    }
  }

  return {
    isValid: true,
    validatedIds: Array.from(uniqueIds),
    eligibleCount: eligiblePool.length
  };
}

interface InternationalSquadModalProps {
  isOpen: boolean;
  nationName: string;
  playerPool: Player[];
  initialSelectedIds?: string[];
  onConfirmSquad: (selectedPlayerIds: string[]) => void;
}

export const InternationalSquadModal: React.FC<InternationalSquadModalProps> = ({
  isOpen,
  nationName,
  playerPool,
  initialSelectedIds = [],
  onConfirmSquad
}) => {
  // Filter eligible players strictly for this nation (never supplement with players from other countries)
  const eligiblePlayers = useMemo(() => {
    const nationLower = (nationName || '').trim().toLowerCase();
    return playerPool.filter(p => p.country && p.country.trim().toLowerCase() === nationLower);
  }, [nationName, playerPool]);

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    reconcileNationalSelection(initialSelectedIds, eligiblePlayers, REQUIRED_NATIONAL_SQUAD_SIZE, true)
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const lastNationRef = useRef<string>(nationName.trim().toLowerCase());

  // Reconcile selectedIds whenever nationName or eligiblePlayers changes while mounted
  useEffect(() => {
    const currentNationKey = (nationName || '').trim().toLowerCase();
    const didNationChange = lastNationRef.current !== currentNationKey;
    lastNationRef.current = currentNationKey;
    setSubmitError(null);

    setSelectedIds(prev => {
      const seedIds = didNationChange && initialSelectedIds && initialSelectedIds.length > 0
        ? initialSelectedIds
        : prev;
      const reconciled = reconcileNationalSelection(
        seedIds,
        eligiblePlayers,
        REQUIRED_NATIONAL_SQUAD_SIZE,
        didNationChange || prev.length === 0
      );
      if (
        reconciled.length === prev.length &&
        reconciled.every((id, idx) => id === prev[idx])
      ) {
        return prev;
      }
      return reconciled;
    });
  }, [nationName, eligiblePlayers, initialSelectedIds]);

  if (!isOpen) return null;

  const hasInsufficientPool = eligiblePlayers.length < REQUIRED_NATIONAL_SQUAD_SIZE;

  const toggleSelect = (id: string) => {
    // Only allow selecting players from the current nation's eligible pool
    if (!eligiblePlayers.some(p => p.id === id)) return;
    sound.playTap();
    setSubmitError(null);
    setSelectedIds(prev => {
      const sanitizedPrev = reconcileNationalSelection(prev, eligiblePlayers, REQUIRED_NATIONAL_SQUAD_SIZE, false);
      if (sanitizedPrev.includes(id)) {
        return sanitizedPrev.filter(x => x !== id);
      }
      if (sanitizedPrev.length >= REQUIRED_NATIONAL_SQUAD_SIZE) {
        return sanitizedPrev;
      }
      return [...sanitizedPrev, id];
    });
  };

  const validation = validateNationalSquadSelection(
    selectedIds,
    playerPool,
    nationName,
    REQUIRED_NATIONAL_SQUAD_SIZE
  );
  const count = selectedIds.length;
  const isValidSelection = validation.isValid;

  const handleConfirm = () => {
    const recheck = validateNationalSquadSelection(
      selectedIds,
      playerPool,
      nationName,
      REQUIRED_NATIONAL_SQUAD_SIZE
    );
    if (!recheck.isValid) {
      setSubmitError(recheck.error || 'Invalid national squad selection.');
      return;
    }
    setSubmitError(null);
    sound.playCrowdCheer(0.8);
    onConfirmSquad(recheck.validatedIds);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#070b12] text-slate-100 flex flex-col justify-between max-w-md mx-auto overflow-hidden animate-in fade-in duration-200">
      {/* Header */}
      <div className="p-4 border-b border-slate-800/80 bg-[#0c121d]/90 text-center">
        <span className="px-2.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-black uppercase tracking-widest inline-block">
          NATIONAL TEAM SELECTION
        </span>
        <h2 className="text-base font-black font-display tracking-wide text-white uppercase mt-1">
          {nationName} 15-MAN SQUAD
        </h2>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Select exactly 15 eligible {nationName} players for the upcoming international series.
        </p>
      </div>

      {/* Counter bar */}
      <div className="px-4 py-2.5 bg-[#101726] border-b border-slate-800 flex items-center justify-between font-mono text-xs">
        <span className="text-slate-400">ELIGIBLE: {eligiblePlayers.length} · SELECTED:</span>
        <span className={`font-bold px-2 py-0.5 rounded ${isValidSelection ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}`}>
          {count} / {REQUIRED_NATIONAL_SQUAD_SIZE}
        </span>
      </div>

      {/* Insufficient eligible players banner */}
      {hasInsufficientPool && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-200 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block text-rose-300 uppercase">Insufficient Eligible Players</span>
            <span>
              {nationName} only has {eligiblePlayers.length} eligible players in the dataset ({REQUIRED_NATIONAL_SQUAD_SIZE} required). Foreign players cannot be added as fallbacks.
            </span>
          </div>
        </div>
      )}

      {/* Players list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {eligiblePlayers.map(p => {
          const isSelected = selectedIds.includes(p.id);
          const primaryRating = Math.max(p.ratings.bat, p.ratings.bowl);
          return (
            <div
              key={p.id}
              onClick={() => toggleSelect(p.id)}
              className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                isSelected
                  ? 'bg-cyan-950/30 border-cyan-500/70 shadow-md shadow-cyan-500/10'
                  : 'bg-[#0f172a]/80 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black font-mono shrink-0 ${
                  isSelected ? 'bg-cyan-500 text-black' : 'bg-slate-800 text-slate-300'
                }`}>
                  {isSelected ? <Check className="w-4 h-4 stroke-[3]" /> : (p.jerseyNumber || 10)}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white leading-tight">
                    {p.name}
                  </h4>
                  <span className="text-[10px] text-slate-400">
                    {p.role} · age {p.age}
                  </span>
                </div>
              </div>

              <div className="text-right font-mono">
                <span className="text-xs font-bold text-amber-300 block">
                  OVR {primaryRating}
                </span>
                <span className="text-[9px] text-slate-400">
                  {p.country}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom confirm button */}
      <div className="p-4 border-t border-slate-800/80 bg-[#0c121d]/90">
        {(submitError || !isValidSelection) && (
          <p className="text-[11px] font-mono text-amber-400 text-center mb-2 flex items-center justify-center gap-1">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>
              {submitError ||
                (hasInsufficientPool
                  ? `Cannot confirm: ${nationName} has fewer than ${REQUIRED_NATIONAL_SQUAD_SIZE} eligible players`
                  : `Please select ${REQUIRED_NATIONAL_SQUAD_SIZE} eligible players (${Math.max(0, REQUIRED_NATIONAL_SQUAD_SIZE - count)} remaining)`)}
            </span>
          </p>
        )}
        <button
          disabled={!isValidSelection}
          onClick={handleConfirm}
          className={`w-full py-4 font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 transition-all ${
            isValidSelection
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-xl shadow-cyan-500/25 active:scale-98 cursor-pointer'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
          }`}
        >
          CONFIRM 15-MAN NATIONAL SQUAD
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
