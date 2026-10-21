import { Player, Team } from '../types/cricket';
import {
  AUCTION_PLAYERS_2026,
  AUCTION_SET_SEQUENCE,
  AuctionPlayerItem,
  AuctionSetType,
  INITIAL_AUCTION_CLUBS
} from '../data/auctionSets2026';

export type AuctionSandboxMode = 'mega' | 'mini';

export const MEGA_AUCTION_PURSE_CR = 120.0;
export const MEGA_CAPPED_RETENTION_SLABS_CR = [18.0, 14.0, 11.0, 18.0, 14.0];
export const MEGA_UNCAPPED_RETENTION_SLAB_CR = 4.0;
export const MAX_MEGA_RETENTIONS = 6;
export const MAX_MEGA_CAPPED_RETENTIONS = 5;
export const MAX_MEGA_UNCAPPED_RETENTIONS = 2;
export const MAX_MEGA_OVERSEAS_RETENTIONS = 2;
export const MAX_OVERSEAS_SQUAD_LIMIT = 8;

export interface RetentionSlabDetail {
  playerId: string;
  playerName: string;
  isUncapped: boolean;
  isOverseas: boolean;
  slabNumber: number;
  slabCostCr: number;
}

export interface MegaRetentionSummary {
  retainedPlayers: Player[];
  releasedPlayers: Player[];
  totalDeductionCr: number;
  remainingPurseCr: number;
  rtmCardsRemaining: number;
  cappedRetainedCount: number;
  uncappedRetainedCount: number;
  overseasRetainedCount: number;
  slabBreakdown: RetentionSlabDetail[];
}

export interface MiniRetentionSummary {
  retainedPlayers: Player[];
  releasedPlayers: Player[];
  basePurseCr: number;
  freedSalaryCr: number;
  totalAvailablePurseCr: number;
  overseasRetainedCount: number;
}

/**
 * Robustly checks if a player is an overseas player.
 */
export function isOverseasPlayer(player: { isOverseas?: boolean; country?: string }): boolean {
  if (player.isOverseas !== undefined) {
    if (player.isOverseas === true) return true;
    if (player.country && (player.country.trim().toLowerCase() === 'india' || player.country.trim().toLowerCase() === 'ind')) {
      return false;
    }
  }
  if (!player.country) return false;
  const c = player.country.trim().toLowerCase();
  return c !== 'india' && c !== 'ind';
}

/**
 * Determines if a squad player qualifies as an Uncapped Indian player for retention rules.
 */
export function isPlayerUncappedDomestic(player: Player): boolean {
  if (isOverseasPlayer(player)) {
    return false;
  }
  if (player.tier === 'Bronze') return true;
  if ((player.basePriceCr || 0) <= 0.35 && (player.salaryCr || 0) <= 4.0) return true;
  if ((player.ratings?.exp ?? 78) <= 68 && player.age <= 24) return true;
  return false;
}

/**
 * Validates whether a candidate player can be added to a Mega Auction retention list.
 */
export function canRetainPlayerInMega(
  currentRetainedPlayers: Player[],
  candidate: Player
): { allowed: boolean; reason?: string } {
  if (currentRetainedPlayers.some(p => p.id === candidate.id)) {
    return { allowed: true };
  }
  if (currentRetainedPlayers.length >= MAX_MEGA_RETENTIONS) {
    return { allowed: false, reason: `Maximum ${MAX_MEGA_RETENTIONS} retentions allowed in a Mega Auction.` };
  }
  if (isOverseasPlayer(candidate)) {
    const overseasCount = currentRetainedPlayers.filter(p => isOverseasPlayer(p)).length;
    if (overseasCount >= MAX_MEGA_OVERSEAS_RETENTIONS) {
      return {
        allowed: false,
        reason: `Maximum ${MAX_MEGA_OVERSEAS_RETENTIONS} Overseas players can be retained in a Mega Auction.`
      };
    }
  }
  const isUncapped = isPlayerUncappedDomestic(candidate);
  const cappedCount = currentRetainedPlayers.filter(p => !isPlayerUncappedDomestic(p)).length;
  const uncappedCount = currentRetainedPlayers.filter(p => isPlayerUncappedDomestic(p)).length;

  if (!isUncapped && cappedCount >= MAX_MEGA_CAPPED_RETENTIONS) {
    return { allowed: false, reason: `Maximum ${MAX_MEGA_CAPPED_RETENTIONS} Capped players can be retained.` };
  }
  if (isUncapped && uncappedCount >= MAX_MEGA_UNCAPPED_RETENTIONS) {
    return { allowed: false, reason: `Maximum ${MAX_MEGA_UNCAPPED_RETENTIONS} Uncapped players can be retained.` };
  }
  return { allowed: true };
}

/**
 * Computes official IPL Mega Auction retention slab deductions out of the ₹120.0 Cr purse.
 */
export function calculateMegaRetentionSummary(
  squad: Player[],
  retainedPlayerIds: string[]
): MegaRetentionSummary {
  const retainedIdSet = new Set(retainedPlayerIds);
  const retainedPlayers: Player[] = [];
  for (const id of retainedPlayerIds) {
    const found = squad.find(p => p.id === id);
    if (found && !retainedPlayers.some(rp => rp.id === found.id)) {
      const check = canRetainPlayerInMega(retainedPlayers, found);
      if (check.allowed) {
        retainedPlayers.push(found);
      }
    }
  }

  const releasedPlayers = squad.filter(p => !retainedPlayers.some(rp => rp.id === p.id) || !retainedIdSet.has(p.id));

  let cappedIdx = 0;
  let uncappedIdx = 0;
  let totalDeductionCr = 0;
  const slabBreakdown: RetentionSlabDetail[] = [];

  retainedPlayers.forEach((p, idx) => {
    const isUncapped = isPlayerUncappedDomestic(p);
    let slabCostCr = MEGA_UNCAPPED_RETENTION_SLAB_CR;
    if (isUncapped) {
      uncappedIdx += 1;
      slabCostCr = MEGA_UNCAPPED_RETENTION_SLAB_CR;
    } else {
      const slabValue =
        MEGA_CAPPED_RETENTION_SLABS_CR[cappedIdx] ??
        MEGA_CAPPED_RETENTION_SLABS_CR[MEGA_CAPPED_RETENTION_SLABS_CR.length - 1];
      cappedIdx += 1;
      slabCostCr = slabValue;
    }
    totalDeductionCr = Number((totalDeductionCr + slabCostCr).toFixed(2));
    slabBreakdown.push({
      playerId: p.id,
      playerName: p.name,
      isUncapped,
      isOverseas: p.isOverseas,
      slabNumber: idx + 1,
      slabCostCr
    });
  });

  const remainingPurseCr = Math.max(0, Number((MEGA_AUCTION_PURSE_CR - totalDeductionCr).toFixed(2)));
  const rtmCardsRemaining = Math.max(0, MAX_MEGA_RETENTIONS - retainedPlayers.length);

  return {
    retainedPlayers,
    releasedPlayers,
    totalDeductionCr,
    remainingPurseCr,
    rtmCardsRemaining,
    cappedRetainedCount: cappedIdx,
    uncappedRetainedCount: uncappedIdx,
    overseasRetainedCount: retainedPlayers.filter(p => isOverseasPlayer(p)).length,
    slabBreakdown
  };
}

/**
 * Resolves a player's effective contract salary for Mini Auction release calculations.
 */
export function getPlayerReleaseValueCr(player: Player): number {
  const raw = player.salaryCr || player.contractValueCr || player.basePriceCr || 0.5;
  return Number(Math.max(0.2, raw).toFixed(2));
}

/**
 * Computes Mini Auction purse and squad breakdown given retained player IDs.
 */
export function calculateMiniRetentionSummary(
  basePurseCr: number,
  squad: Player[],
  retainedPlayerIds: string[]
): MiniRetentionSummary {
  const retainedSet = new Set(retainedPlayerIds);
  const retainedPlayers = squad.filter(p => retainedSet.has(p.id));
  const releasedPlayers = squad.filter(p => !retainedSet.has(p.id));

  const freedSalaryCr = Number(
    releasedPlayers.reduce((sum, p) => sum + getPlayerReleaseValueCr(p), 0).toFixed(2)
  );
  const cleanBase = Number(Math.max(0, basePurseCr).toFixed(2));
  const totalAvailablePurseCr = Number(Math.min(120, cleanBase + freedSalaryCr).toFixed(2));

  return {
    retainedPlayers,
    releasedPlayers,
    basePurseCr: cleanBase,
    freedSalaryCr,
    totalAvailablePurseCr,
    overseasRetainedCount: retainedPlayers.filter(p => isOverseasPlayer(p)).length
  };
}

/**
 * Maps a Player's role and capped status to an official IPL 2026 PDF Set identifier.
 */
export function resolveAuctionSetForPlayer(player: Player): {
  setNo: number;
  set: AuctionSetType;
  specialism: 'BATTER' | 'ALL-ROUNDER' | 'WICKETKEEPER' | 'FAST BOWLER' | 'SPINNER';
  cappedStatus: 'Capped' | 'Uncapped';
} {
  const uncapped = isPlayerUncappedDomestic(player);
  const cappedStatus: 'Capped' | 'Uncapped' = uncapped ? 'Uncapped' : 'Capped';

  if (player.role === 'Wk-bat' || player.role === 'Wicketkeeper') {
    return {
      setNo: uncapped ? 8 : 3,
      set: uncapped ? 'UWK1' : 'WK1',
      specialism: 'WICKETKEEPER',
      cappedStatus
    };
  }
  if (player.role === 'All-rounder' || player.role === 'All-Rounder') {
    return {
      setNo: uncapped ? 7 : 2,
      set: uncapped ? 'UAL1' : 'AL1',
      specialism: 'ALL-ROUNDER',
      cappedStatus
    };
  }
  if (player.role === 'Spin' || player.bowlingArm === 'ROB' || player.bowlingArm === 'LSO' || player.bowlingArm === 'LS') {
    if (player.role === 'Top-order' || player.role === 'Middle-order' || player.role === 'Batter' || player.role === 'Batsman') {
      return {
        setNo: uncapped ? 6 : 1,
        set: uncapped ? 'UBA1' : 'BA1',
        specialism: 'BATTER',
        cappedStatus
      };
    }
    return {
      setNo: uncapped ? 10 : 5,
      set: uncapped ? 'USP1' : 'SP1',
      specialism: 'SPINNER',
      cappedStatus
    };
  }
  if (player.role === 'Pace' || player.role === 'Bowler') {
    return {
      setNo: uncapped ? 9 : 4,
      set: uncapped ? 'UFA1' : 'FA1',
      specialism: 'FAST BOWLER',
      cappedStatus
    };
  }
  return {
    setNo: uncapped ? 6 : 1,
    set: uncapped ? 'UBA1' : 'BA1',
    specialism: 'BATTER',
    cappedStatus
  };
}

/**
 * Converts a released franchise Player into an AuctionPlayerItem compatible with AuctionRoom.
 */
export function convertPlayerToAuctionLot(player: Player, listSrNo: number): AuctionPlayerItem {
  const setMeta = resolveAuctionSetForPlayer(player);
  const nameParts = player.name.trim().split(/\s+/);
  const firstName = nameParts[0] || player.name;
  const surname = nameParts.length > 1 ? nameParts.slice(1).join(' ') : firstName;
  const reserveCr = player.basePriceCr && player.basePriceCr > 0
    ? Number(Math.min(2.0, Math.max(0.3, player.basePriceCr)).toFixed(2))
    : setMeta.cappedStatus === 'Uncapped'
    ? 0.3
    : 2.0;

  return {
    id: player.id,
    listSrNo,
    setNumber: setMeta.setNo,
    set: setMeta.set,
    firstName,
    surname,
    name: player.name,
    country: player.country || 'India',
    countryCode: player.isOverseas ? 'OS' : 'IND',
    countryFlag: player.isOverseas ? '🌍' : '🇮🇳',
    stateAssociation: player.isOverseas ? null : 'BCCI',
    dob: null,
    age: player.age || 26,
    pdfSpecialism: (setMeta.specialism === 'SPINNER' || setMeta.specialism === 'FAST BOWLER' ? 'BOWLER' : setMeta.specialism) as 'BATTER' | 'ALL-ROUNDER' | 'WICKETKEEPER' | 'BOWLER',
    specialism: setMeta.specialism,
    battingHand: player.battingHand || 'RHB',
    bowlingStyle: player.bowlingStyle || null,
    bowlingArm: player.bowlingArm || 'RAM',
    testCaps: 0,
    odiCaps: 0,
    t20Caps: 0,
    iplMatches: player.stats?.matches ?? 0,
    previousIplTeam: null,
    ipl2025Matches: 0,
    cappedStatus: setMeta.cappedStatus,
    reservePriceLakh: Math.round(reserveCr * 100),
    basePriceCr: reserveCr,
    isOverseas: Boolean(player.isOverseas),
    role: player.role,
    tier: player.tier || (setMeta.cappedStatus === 'Uncapped' ? 'Bronze' : 'Gold'),
    clubId: '',
    salaryCr: 0,
    jerseyNumber: player.jerseyNumber || 45,
    form: player.form || 80,
    morale: player.morale || 85,
    isGeneratedAttributes: false,
    ratings: { ...player.ratings },
    statsKey: {
      stat1Label: 'BAT',
      stat1Val: player.ratings.bat,
      stat2Label: 'POW',
      stat2Val: player.ratings.pow,
      stat3Label: 'BOWL',
      stat3Val: player.ratings.bowl,
      stat4Label: 'CTRL',
      stat4Val: player.ratings.ctrl
    }
  };
}

/**
 * Selects recommended Mega Auction retentions (up to 4-5 core stars) for a franchise.
 */
export function getRecommendedMegaRetentionIds(team: Team, teamPlayers: Player[]): string[] {
  const sorted = [...teamPlayers].sort((a, b) => {
    const aCapt = a.id === team.captainId || a.isCaptain ? 15 : 0;
    const bCapt = b.id === team.captainId || b.isCaptain ? 15 : 0;
    const aOvr = Math.max(a.ratings.bat, a.ratings.bowl) + aCapt;
    const bOvr = Math.max(b.ratings.bat, b.ratings.bowl) + bCapt;
    return bOvr - aOvr;
  });

  const chosen: Player[] = [];
  for (const p of sorted) {
    if (chosen.length >= 4) break;
    if (canRetainPlayerInMega(chosen, p).allowed) {
      chosen.push(p);
    }
  }
  return chosen.map(p => p.id);
}

/**
 * Selects recommended Mini Auction retentions (keeps core 15-17 players, releases 3-5 fringe players).
 */
export function getRecommendedMiniRetentionIds(team: Team, teamPlayers: Player[]): string[] {
  if (teamPlayers.length <= 13) {
    let osCount = 0;
    const kept: string[] = [];
    for (const p of teamPlayers) {
      if (isOverseasPlayer(p)) {
        if (osCount >= 8) continue;
        osCount++;
      }
      kept.push(p.id);
    }
    return kept;
  }
  const xiSet = new Set(team.playingXIIds);
  const sorted = [...teamPlayers].sort((a, b) => {
    const aInXI = xiSet.has(a.id) || a.id === team.captainId || a.isCaptain ? 20 : 0;
    const bInXI = xiSet.has(b.id) || b.id === team.captainId || b.isCaptain ? 20 : 0;
    const aOvr = Math.max(a.ratings.bat, a.ratings.bowl) + aInXI;
    const bOvr = Math.max(b.ratings.bat, b.ratings.bowl) + bInXI;
    return bOvr - aOvr;
  });

  const chosen: Player[] = [];
  let overseasCount = 0;
  for (const p of sorted) {
    if (isOverseasPlayer(p)) {
      if (overseasCount >= 8) continue;
      overseasCount++;
    }
    chosen.push(p);
    if (chosen.length >= Math.max(12, teamPlayers.length - 4)) break;
  }
  return chosen.map(p => p.id);
}

/**
 * Builds the complete, self-consistent Auction Sandbox state for both Mega and Mini Auctions.
 * - Applies user franchise selection and exact user player retentions/releases.
 * - Applies realistic AI franchise retentions/releases.
 * - Updates team purses, RTM cards, squad rosters, and playingXIIds.
 * - Updates global players list (setting released players' clubId to '').
 * - Produces a deduplicated auction lot pool containing all released players + official 2026 auction pool,
 *   while excluding any player currently retained on a franchise roster.
 */
export function buildAuctionSandboxState(params: {
  userTeamId: string;
  mode: AuctionSandboxMode;
  userRetainedPlayerIds: string[];
  allTeams: Team[];
  allPlayers: Player[];
  baseAuctionLots?: AuctionPlayerItem[];
}): {
  updatedTeams: Team[];
  updatedPlayers: Player[];
  auctionPoolLots: AuctionPlayerItem[];
  teamPursesByShort: Record<string, number>;
  userPurseCr: number;
  userRtmCards: number;
  releasedPlayerIds: string[];
  retainedPlayerIdsAllTeams: string[];
} {
  const {
    userTeamId,
    mode,
    userRetainedPlayerIds,
    allTeams,
    allPlayers,
    baseAuctionLots = AUCTION_PLAYERS_2026
  } = params;

  const retainedMapByTeam = new Map<string, Set<string>>();
  const salaryOverrideByPlayer = new Map<string, number>();
  const teamPursesByShort: Record<string, number> = {};
  const teamPurseById = new Map<string, number>();
  const teamRtmById = new Map<string, number>();

  let userPurseCr = MEGA_AUCTION_PURSE_CR;
  let userRtmCards = 0;

  for (const team of allTeams) {
    const teamPlayers = allPlayers.filter(p => p.clubId === team.id);
    const clubMeta = INITIAL_AUCTION_CLUBS.find(
      c => c.teamId === team.id || c.shortName.toUpperCase() === team.shortName.toUpperCase()
    );

    const isUser = team.id === userTeamId;
    if (mode === 'mega') {
      const targetRetainedIds = isUser
        ? userRetainedPlayerIds
        : getRecommendedMegaRetentionIds(team, teamPlayers);
      const summary = calculateMegaRetentionSummary(teamPlayers, targetRetainedIds);
      const retainedSet = new Set(summary.retainedPlayers.map(p => p.id));
      retainedMapByTeam.set(team.id, retainedSet);

      summary.slabBreakdown.forEach(sb => {
        salaryOverrideByPlayer.set(sb.playerId, sb.slabCostCr);
      });

      teamPurseById.set(team.id, summary.remainingPurseCr);
      teamRtmById.set(team.id, summary.rtmCardsRemaining);
      teamPursesByShort[team.shortName] = summary.remainingPurseCr;

      if (isUser) {
        userPurseCr = summary.remainingPurseCr;
        userRtmCards = summary.rtmCardsRemaining;
      }
    } else {
      // Mini Auction mode
      const basePurse =
        clubMeta?.purseCr ?? (team.purseCr <= 65 ? team.purseCr : 18.5);
      const targetRetainedIds = isUser
        ? userRetainedPlayerIds
        : getRecommendedMiniRetentionIds(team, teamPlayers);
      const summary = calculateMiniRetentionSummary(basePurse, teamPlayers, targetRetainedIds);
      const retainedSet = new Set(summary.retainedPlayers.map(p => p.id));
      retainedMapByTeam.set(team.id, retainedSet);

      teamPurseById.set(team.id, summary.totalAvailablePurseCr);
      teamRtmById.set(team.id, 0);
      teamPursesByShort[team.shortName] = summary.totalAvailablePurseCr;

      if (isUser) {
        userPurseCr = summary.totalAvailablePurseCr;
        userRtmCards = 0;
      }
    }
  }

  const allRetainedIds = new Set<string>();
  retainedMapByTeam.forEach(set => {
    set.forEach(id => allRetainedIds.add(id));
  });

  const releasedPlayersList: Player[] = [];
  const releasedPlayerIds: string[] = [];

  const updatedPlayers: Player[] = allPlayers.map(p => {
    if (!p.clubId) return p;
    const teamRetained = retainedMapByTeam.get(p.clubId);
    if (!teamRetained) return p;

    if (teamRetained.has(p.id)) {
      const nextSalary = salaryOverrideByPlayer.get(p.id) ?? p.salaryCr;
      return {
        ...p,
        salaryCr: nextSalary
      };
    } else {
      const released: Player = {
        ...p,
        clubId: '',
        isCaptain: false
      };
      releasedPlayersList.push(released);
      releasedPlayerIds.push(p.id);
      return released;
    }
  });

  const updatedTeams: Team[] = allTeams.map(team => {
    const retainedSquad = updatedPlayers.filter(p => p.clubId === team.id);
    const keptXI = team.playingXIIds.filter(id => retainedSquad.some(p => p.id === id));
    const fillXI = retainedSquad
      .map(p => p.id)
      .filter(id => !keptXI.includes(id));
    const nextXI = [...keptXI, ...fillXI].slice(0, 11);
    const nextCaptainId = retainedSquad.some(p => p.id === team.captainId)
      ? team.captainId
      : retainedSquad[0]?.id || team.captainId;

    return {
      ...team,
      isUserTeam: team.id === userTeamId,
      purseCr: teamPurseById.get(team.id) ?? team.purseCr,
      rtmCards: teamRtmById.get(team.id) ?? team.rtmCards,
      squad: retainedSquad,
      playingXIIds: nextXI,
      captainId: nextCaptainId
    };
  });

  // Build deduplicated Auction Pool:
  // 1. Identify retained players by ID and by normalized (name + country) so retained stars are excluded from the auction block
  const retainedNameCountryKeys = new Set<string>();
  updatedPlayers
    .filter(p => p.clubId && allRetainedIds.has(p.id))
    .forEach(p => {
      retainedNameCountryKeys.add(`${p.name.trim().toLowerCase()}__${p.country.trim().toLowerCase()}`);
    });

  const poolLots: AuctionPlayerItem[] = [];
  const seenIds = new Set<string>();
  const seenNameCountryKeys = new Set<string>();

  // 2. Include base auction lots that are NOT retained on a franchise
  for (const lot of baseAuctionLots) {
    if (allRetainedIds.has(lot.id)) continue;
    const key = `${lot.name.trim().toLowerCase()}__${lot.country.trim().toLowerCase()}`;
    if (retainedNameCountryKeys.has(key)) continue;
    seenIds.add(lot.id);
    seenNameCountryKeys.add(key);
    poolLots.push(lot);
  }

  // 3. Convert and append any released squad players who aren't already in poolLots
  let nextSrNo = poolLots.reduce((max, l) => Math.max(max, l.listSrNo || 0), 350) + 1;
  for (const relPlayer of releasedPlayersList) {
    if (seenIds.has(relPlayer.id)) continue;
    const key = `${relPlayer.name.trim().toLowerCase()}__${relPlayer.country.trim().toLowerCase()}`;
    if (seenNameCountryKeys.has(key)) continue;

    const convertedLot = convertPlayerToAuctionLot(relPlayer, nextSrNo++);
    seenIds.add(convertedLot.id);
    seenNameCountryKeys.add(key);
    poolLots.push(convertedLot);
  }

  // 4. Sort poolLots by official AUCTION_SET_SEQUENCE order, then listSrNo
  const setOrderMap = new Map<AuctionSetType, number>();
  AUCTION_SET_SEQUENCE.forEach((setId, idx) => setOrderMap.set(setId, idx));

  poolLots.sort((a, b) => {
    const orderA = setOrderMap.get(a.set) ?? 999;
    const orderB = setOrderMap.get(b.set) ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return (a.listSrNo || 0) - (b.listSrNo || 0);
  });

  return {
    updatedTeams,
    updatedPlayers,
    auctionPoolLots: poolLots,
    teamPursesByShort,
    userPurseCr,
    userRtmCards,
    releasedPlayerIds,
    retainedPlayerIdsAllTeams: Array.from(allRetainedIds)
  };
}
