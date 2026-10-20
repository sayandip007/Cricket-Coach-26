# Complete App Audit, Bug Report & Feature Implementation Plan (`plan.md`)

This document serves as the authoritative technical audit and engineering roadmap for **Cricket Coach 26**. It is structured so that any developer or autonomous coding agent can pick up individual tasks, understand the exact root cause down to file paths and line numbers, and verify or extend the implementation without ambiguity.

---

## Part 1: Complete Application Audit — Broken Functions & Bugs (ALL FIXED ✅)

### 1. [x] FIXED — CRITICAL: Auction Room Does Not Persist Roster or Purse Changes to Global State
- **File(s):** `src/components/auction/AuctionRoom.tsx` & `src/context/GameContext.tsx`
- **Status:** ✅ **FIXED**
- **Root Cause:**
  - `AuctionRoom.tsx` maintained local component state (`teamPurses`, `soldPlayers`, `unsoldPlayers`, `currentLotIndex`) without committing auction outcomes to `GameContext` (`players` and `teams`).
  - Furthermore, the "SQUAD PLANNER" modal inside `AuctionRoom.tsx` read from a static hardcoded `KOLKATA_SQUAD_DATA` array instead of `players.filter(p => p.clubId === userTeam.id)`, so newly acquired players did not appear in the Squad Planner and all auction purchases vanished when exiting to the Hub.
- **Resolution Implemented:**
  1. In `src/components/auction/AuctionRoom.tsx`, destructured `players` and `setPlayers` alongside `teams` and `setTeams` from `useGame()`.
  2. Initialized `teamPurses` from the live `teams` state (`t.purseCr`) so pre-auction releases and retentions carry over into the Auction Room.
  3. Added `commitAuctionSale(player, winningClubId, winningAmountCr)` inside `AuctionRoom.tsx`, invoked whenever a player is sold (live bid, RTM, or simulated via `SKIP SET`):
     - Updates `players`: sets `clubId: winningTeam.id` and `salaryCr: winningAmountCr` on existing players, or instantiates and appends a complete `Player` object if the auction lot was not previously in `players`.
     - Updates `teams`: removes the player from any previous franchise, adds the player to `winningTeam.squad` (and fills `playingXIIds` up to 11 if needed), and deducts `winningAmountCr` from `t.purseCr`.
  4. Replaced the static `KOLKATA_SQUAD_DATA` in the Squad Planner modal with a live `useMemo` over `players.filter(p => p.clubId === userTeam.id)`.

---

### 2. [x] FIXED — CRITICAL: Trade Window Does Not Mutate Squads or Player `clubId`
- **File(s):** `src/components/dynasty/TradeWindowModal.tsx`
- **Status:** ✅ **FIXED**
- **Root Cause:**
  1. **Hardcoded Incoming Offers:** `initialOffers` hardcoded specific players regardless of which franchise (`userTeam`) the user was coaching.
  2. **No State Persistence on Accept:** Accepting an incoming trade offer only updated local UI state without swapping `player.clubId` in `players` or updating `team.squad` / `team.playingXIIds` / `team.purseCr` in `teams`.
  3. **Custom Trade Proposal Missing Target Player Selection:** Proposing a custom trade did not allow picking a specific player from the rival franchise or executing the roster swap when accepted.
- **Resolution Implemented:**
  1. Connected `TradeWindowModal.tsx` to `useGame()` (`players`, `teams`, `setPlayers`, `setTeams`).
  2. Dynamically generated incoming trade offers from real players on `userTeam` paired with similarly rated players from rival IPL franchises.
  3. Added a **Target Rival Player Selector** in the Custom Trade Proposal builder so the manager can select any player from the chosen rival franchise, with automatic cash delta calculation (`cashDeltaCr`).
  4. Implemented `executeRosterSwap(outgoingPlayerId, incomingPlayerId, rivalTeamId, purseDeltaCr)` which atomically swaps `clubId` in `players`, updates `squad` and `playingXIIds` for both franchises in `teams`, and adjusts `purseCr`.

---

### 3. [x] FIXED — CRITICAL: Mini-Auction Player Releases & Pre-Auction Retentions Do Not Update Rosters
- **File(s):**
  - `src/components/dynasty/MiniAuctionReleasesModal.tsx`
  - `src/components/dynasty/RetentionModal.tsx`
  - `src/context/GameContext.tsx`
- **Status:** ✅ **FIXED**
- **Root Cause:**
  - `MiniAuctionReleasesModal` and `RetentionModal` computed released players and updated purse values locally, but never removed released/unretained players from `userTeam.squad` or updated `players` (`clubId: 'free_agent'`) and `userTeam.purseCr` in `GameContext`.
- **Resolution Implemented:**
  1. Added `releasePlayersForAuction(releasedPlayerIds: string[], updatedPurseCr?: number)` to `GameContext.tsx`, which sets `clubId = 'free_agent'` on released players, removes them from `userTeam.squad` and `userTeam.playingXIIds` (auto-backfilling the XI from remaining squad members), and updates `userTeam.purseCr`.
  2. Wired `MiniAuctionReleasesModal.tsx` to call `releasePlayersForAuction(releasedIds, effectivePurseCr)` when proceeding to the Auction Hall.
  3. Updated `RetentionModal.tsx` (`handleFinalizeSeason`) to move all unretained `userTeam` players to `'free_agent'`, update `userTeam.squad` and `userTeam.playingXIIds` to the retained set, and persist `remainingPurseCr`.

---

### 4. [x] FIXED — CRITICAL: Next Season Transition Does Not Reset League Table, Fixtures, or Advance Season Year
- **File(s):** `src/components/dynasty/NextSeasonSetupModal.tsx`, `src/components/hub/HubScreen.tsx`, & `src/context/GameContext.tsx`
- **Status:** ✅ **FIXED**
- **Root Cause:**
  - Completing `NextSeasonSetupModal` and `SeasonTransitionModal` only closed the modals and displayed a toast without switching the user's club/national team contract, applying player age/rating progression, resetting the IPL standings table, or generating a fresh unplayed season calendar.
  - Additionally, the top Club summary card in `NextSeasonSetupModal.tsx` was hardcoded to show `userTeam.shortName` and `"staying"` even when selecting an offer from another franchise.
- **Resolution Implemented:**
  1. Added `startNewSeason(selectedClubId?: string, selectedCountryId?: string | null)` to `GameContext.tsx`:
     - Updates `userTeamId` if the manager accepted an offer from a new IPL franchise, and updates `coachProfile.nationalTeamId` if a national side was selected.
     - Applies annual age (`age + 1`) and progression curves (`+bat/+pow/+bowl/+tmp` for U-24 prospects; fitness tapering for 34+ veterans) across all `players`.
     - Resets `league_ipl` standings (`played: 0, won: 0, lost: 0, tied: 0, points: 0, nrr: 0`) and rebuilds a fresh unplayed `calendarDates` schedule via `buildSeasonCalendarForTeam(targetClubId, teams, false)` with `currentDateIndex: 0`.
  2. Wired `NextSeasonSetupModal` and `SeasonTransitionModal` in `HubScreen.tsx` to pass `selectedClubId` and `selectedCountryId` into `startNewSeason(...)`.
  3. Updated the Club summary card in `NextSeasonSetupModal.tsx` to dynamically reflect the selected franchise offer.

---

### 5. [x] FIXED — HIGH: Completed Match "FULL SCORECARD" & Last Result Preview Show Fake/Blank Data in Hub
- **File(s):** `src/types/cricket.ts`, `src/context/GameContext.tsx`, & `src/components/hub/HubScreen.tsx`
- **Status:** ✅ **FIXED**
- **Root Cause:**
  - When viewing a completed match in `HubScreen.tsx`:
    1. The innings summary card hardcoded static strings (`132/7 (20.0)`, `Jaiswal 42(47)`, `Allen 61(39)`) regardless of the actual match played.
    2. Clicking **"FULL SCORECARD"** called `createFranchiseMatchState(...)`, which created a brand-new `0/0 (0.0 ov)` unplayed match state instead of displaying the completed match's scorecard.
- **Resolution Implemented:**
  1. Added `completedMatchState?: MatchLiveState` to `CalendarMatchFixture` in `src/types/cricket.ts`.
  2. Updated `GameContext.tsx` (`simEntireMatch` and ball-by-ball match completion) to store `completedMatchState: state` on the active day's `matchFixture` in `calendarDates`.
  3. Updated `HubScreen.tsx` to dynamically render the actual 1st and 2nd innings scores, top 2 batters, and top bowler from `activeDay.matchFixture.completedMatchState`, and to pass `savedMatch` directly to `MatchAnalysisModal` when clicking **"FULL SCORECARD"**.

---

### 6. [x] FIXED — HIGH: "Simulate Next 5 Overs" Violates Cricket Rules by Keeping Same Bowler for 5 Consecutive Overs
- **File(s):** `src/context/GameContext.tsx` & `src/components/match/LiveMatchEngine.tsx`
- **Status:** ✅ **FIXED**
- **Root Cause:**
  - In `LiveMatchEngine.tsx`, clicking "Next 5 overs" called `simCurrentOver()` 5 times in a synchronous loop (`for (let i = 0; i < 5; i++) simCurrentOver()`) while `simCurrentOver` passed `autoRotateBowler = false` on every delivery. Because React state updates batch asynchronously, the loop also read stale state and failed to rotate bowlers between intermediate overs.
- **Resolution Implemented:**
  1. Updated `LiveMatchEngine.tsx` so the "Next 5 overs" button calls `simCurrentOver(5)` in a single state transition.
  2. Updated `simCurrentOver(oversCount)` in `src/context/GameContext.tsx` to track completed overs inside the `oversCount` loop (`oversSimulatedSoFar`) and pass `autoRotateBowler = true` on intermediate over boundaries (`isEndOfOverDelivery && !isFinalOverOfBatch`), ensuring bowlers rotate after every 6 legal balls while respecting the `maxOversPerBowler` quota.

---

### 7. [x] FIXED — MEDIUM: Season Calendar Date Overflow Bug (`May 35`, `May 42`)
- **File(s):** `src/context/GameContext.tsx`
- **Status:** ✅ **FIXED**
- **Root Cause:**
  - `buildSeasonCalendarForTeam` only handled a single rollover from `'Apr'` (30 days) to `'May'` (`if (curDay > 30 && curMonth === 'Apr')`), causing dates beyond May 31 to overflow into invalid dates like `May 32`–`May 65`.
- **Resolution Implemented:**
  - Replaced the single-month check in `buildSeasonCalendarForTeam` (`src/context/GameContext.tsx`) with a multi-month `advanceDays(days)` helper backed by `MONTH_META` (`Apr: 30`, `May: 31`, `Jun: 30`, `Jul: 31`, `Aug: 31`), ensuring accurate `YYYY-MM-DD`, month names, and day-of-week progression across the entire calendar.

---

### 8. [x] FIXED — MEDIUM: Hub "TEAM TALK" Is Cosmetic-Only
- **File(s):** `src/context/GameContext.tsx` & `src/components/hub/HubScreen.tsx`
- **Status:** ✅ **FIXED**
- **Root Cause:**
  - Clicking **"TEAM TALK 💬"** in `HubScreen.tsx` only showed a toast without updating player `morale` or `form` in `GameContext`.
- **Resolution Implemented:**
  - Added `boostTeamMorale(bonus?: number)` to `GameContext.tsx` (boosting all `userTeam` players' `morale` by `+4` and `form` by `+2`, clamped to `99`) and wired the **"TEAM TALK"** button in `HubScreen.tsx` to invoke `boostTeamMorale(4)`.

---

### 9. [x] FIXED — MEDIUM: Legacy Save Slot Loader (`loadFromSlot`) Can Restore Removed Domestic T20 Leagues
- **File(s):** `src/context/GameContext.tsx`
- **Status:** ✅ **FIXED**
- **Root Cause:**
  - `loadFromSlot` in `GameContext.tsx` called `setLeagues(parsed.leagues)` without filtering out deprecated non-IPL domestic leagues from older save snapshots.
- **Resolution Implemented:**
  - Updated `loadFromSlot` in `src/context/GameContext.tsx` to filter `parsed.leagues` so only `'league_ipl'` (with fallback to `INITIAL_LEAGUES`) is restored.

---

### 10. [x] FIXED — LOW: Minor Data & Commentary Inaccuracies
- **File(s):** `src/context/GameContext.tsx` & `src/engine/cricketEngine.ts`
- **Status:** ✅ **FIXED**
- **Resolution Implemented:**
  1. Updated `cb_intl_4` ("New Zealand tour of Ireland, 2026") in `src/context/GameContext.tsx` to set `homeNation: 'Ireland'` instead of `'England'`.
  2. Updated the bowled dismissal commentary in `src/engine/cricketEngine.ts` to convert `bowlerSpeedMps` from `m/s` to `km/h` via `Math.round(bowlerSpeedMps * 3.6)`.

---

## Part 2: Suggested New Features & Architectural Blueprint

Below are high-impact features recommended to elevate **Cricket Coach 26** into an even deeper franchise & international management simulation, complete with implementation details for any agent.

### Feature Suggestion 1: Interactive IPL Playoffs & Knockout Bracket Engine
- **Why Add It:** Currently, the IPL season has 14 group-stage fixtures, and the Playoffs tab in `WorldScreen.tsx` displays static placeholder text (`1st Place vs 2nd Place`) until manually populated. Automatically generating **Qualifier 1, Eliminator, Qualifier 2, and the IPL Final** once the 14 group games conclude makes the championship chase rewarding.
- **How to Implement:**
  1. **File:** `src/context/GameContext.tsx` & `src/components/world/WorldScreen.tsx`
  2. When all IPL group fixtures are marked `completed: true`:
     - Sort `league_ipl.standings` by `points` DESC, then `nrr` DESC.
     - Automatically append `Qualifier 1` (Rank 1 vs Rank 2) and `Eliminator` (Rank 3 vs Rank 4) fixtures to `calendarDates` (if `userTeam` qualified in the Top 4).
     - After `Qualifier 1` and `Eliminator` finish, generate `Qualifier 2` (Loser of Q1 vs Winner of Eliminator), followed by the `IPL Final` (Winner of Q1 vs Winner of Q2).
     - Unlock `'ach_ipl_champ'` and increment `coachProfile.domesticStats.titles` if `userTeam` wins the Final.

### Feature Suggestion 2: Orange Cap, Purple Cap & Tournament MVP Leaderboards
- **Why Add It:** Every cricket management fan tracks top run-scorers (Orange Cap), top wicket-takers (Purple Cap), best strike rates, and MVP points across the tournament. Player stats (`player.stats.runs`, `player.stats.wickets`) are already updated after user matches!
- **How to Implement:**
  1. **File:** `src/components/world/WorldScreen.tsx` & `src/context/GameContext.tsx`
  2. When simulating AI-vs-AI fixtures on `advanceCalendarDay`, also increment `stats.runs`, `stats.balls`, `stats.wickets`, and `stats.matches` for AI fixture participants so the entire league's player stats progress realistically alongside the user's squad.
  3. Add a **"STATS & CAPS"** sub-tab in `WorldScreen.tsx` displaying:
     - **Orange Cap Top 10** (sorted by `stats.runs` DESC, showing Matches, Runs, Avg, SR, 50s/100s).
     - **Purple Cap Top 10** (sorted by `stats.wickets` DESC, showing Matches, Wickets, Econ, Best Bowling).
     - **MVP Leaderboard** (`runs * 1 + fours * 1 + sixes * 2 + wickets * 20 + catches * 8`).

### Feature Suggestion 3: Post-Match Presentation Ceremony & Man of the Match (MOTM) Award
- **Why Add It:** When a live match concludes (`matchState.isCompleted`), showing a broadcast-style **Post-Match Presentation Card** with Man of the Match, Fantasy/Impact points, turning point of the match, and coach press-conference quotes adds strong immersion.
- **How to Implement:**
  1. **File:** `src/components/match/PostMatchPresentationModal.tsx` (new component) & `src/components/match/LiveMatchEngine.tsx`
  2. Compute a Match Impact Score for all 22 players in `innings1` and `innings2`:
     - `battingImpact = runs + (runs >= 50 ? 20 : 0) + (sixes * 3) + ((runs / balls) - 1.3) * 15`
     - `bowlingImpact = wickets * 25 + (wickets >= 3 ? 20 : 0) + (overs >= 2 ? (8.5 - runsConceded / overs) * 10 : 0)`
     - Bonus `+25` if on the winning team.
  3. Award **Player of the Match** to the highest-scoring player, grant `+5 Form` and `+8 Morale` to that player in `GameContext`, and display a press-conference choice (Praise Team / Demand Improvement / Praise MOTM) that affects squad morale.

### Feature Suggestion 4: Interactive Pitch Curator & Home Stadium Upgrades
- **Why Add It:** Giving the Head Coach control over home pitch preparation before home fixtures (e.g., instructing the curator to prepare a **Rank Turner**, **Green Seam Track**, or **Flat Batting Road**) creates strategic synergy with squad composition (e.g., spin-heavy CSK vs pace-heavy MI).
- **How to Implement:**
  1. **File:** `src/components/hub/HubScreen.tsx` & `src/context/GameContext.tsx`
  2. When the upcoming fixture in `calendarDates` is a home match (`isHome === true`), show a **"🌱 PITCH CURATOR DIRECTIVE"** quick-selector directly on the Match Day card in `HubScreen.tsx` (synced with `homePitch` in `GameContext`).

### Feature Suggestion 5: Head-to-Head Rivalry History & Match Archive Vault
- **Why Add It:** Saving completed match scorecards into a searchable **Season Match Archive** allows users to revisit any match from the current or past seasons, view full batting/bowling cards, and track Head-to-Head (H2H) records against rival franchises.
- **How to Implement:**
  1. **File:** `src/types/cricket.ts`, `src/context/GameContext.tsx`, and `src/components/hub/SeasonScheduleModal.tsx`
  2. `CalendarMatchFixture` now includes `completedMatchState?: MatchLiveState`.
  3. Wire completed fixture rows in `SeasonScheduleModal.tsx` to read `completedMatchState` when available so past live scorecards can be inspected from the schedule view as well.

---

## Part 3: Execution Status Summary

1. **Phase 1 — State Persistence Fixes (Bugs #1, #2, #3, #4):** ✅ **COMPLETED**
   - Wired `AuctionRoom.tsx`, `TradeWindowModal.tsx`, `MiniAuctionReleasesModal.tsx`, `RetentionModal.tsx`, and `NextSeasonSetupModal.tsx` to persist changes to `players`, `teams`, `leagues`, and `calendarDates` in `GameContext.tsx`.
2. **Phase 2 — Match Engine & Hub Scorecard Fixes (Bugs #5, #6, #7, #8, #9, #10):** ✅ **COMPLETED**
   - Persisted completed scorecards (`completedMatchState`) onto `CalendarMatchFixture` and wired Hub's "FULL SCORECARD" and top performer summary (`Bug #5`).
   - Fixed multi-over bowler rotation in `LiveMatchEngine.tsx` and `GameContext.tsx` (`Bug #6`).
   - Fixed multi-month calendar date rollover (`Bug #7`), wired Team Talk morale/form boost (`Bug #8`), filtered legacy leagues in `loadFromSlot` (`Bug #9`), fixed Ireland tour host nation and converted commentary bowling speed from `m/s` to `km/h` (`Bug #10`).
3. **Phase 3 — Roadmap Features (#1–#5) & Advanced Directive Rollout (Steps 1–5):** ✅ **COMPLETED & VERIFIED**
   - **IPL Playoff Bracket Engine (`LeagueScreen.tsx` & `GameContext.tsx`):** Verified full 4-team playoff qualification (`Qualifier 1`, `Eliminator`, `Qualifier 2`, `Grand Final`) with automatic winner/loser progression, championship crowning, achievement unlocking, and dynasty retention triggers.
   - **Orange Cap, Purple Cap & MVP Leaderboards (`LeagueScreen.tsx` & `SeasonScheduleModal.tsx`):** Added the Tournament MVP Impact Index Leaderboard alongside Orange Cap and Purple Cap, driven by live user + AI-vs-AI match statistics (`simulateAiFixtureScorecard` & `applyMatchToPlayerList`).
   - **Post-Match Presentation & Player of the Match (`LiveMatchEngine.tsx` & `GameContext.tsx`):** Derived Player of the Match from recorded match impact and persisted post-match press conference morale/form effects.
   - **Home Pitch Curator (`MenuDrawerModal.tsx`, `HubScreen.tsx`, & `GameContext.tsx`):** Connected home pitch curator directives (`Flat Track`, `Balanced Sporting`, `Green Seamer`, `Dry & Turning`, `Two-Paced`) directly to match initialization and ball-by-ball physics.
   - **Searchable Match Archive & Head-to-Head Explorer (`SeasonScheduleModal.tsx` & `src/services/cricketServices.ts`):** Fixed `SeasonScheduleModal` calendar date lookup crash (`leagues[0]?.calendarDates`) and added live search + Head-to-Head (`H2H`) franchise filtering.
   - **Dedicated Domain Service Layer (`src/services/cricketServices.ts`) & Tactical Command Suite (`src/components/hub/TacticalCommandSuiteModal.tsx`):**
     - **Interactive Field Editor:** Top-down interactive radar with 7 reusable presets, live click-to-reposition fielder coordinates, format/phase circle restriction validation, and direct physics hooks in `simulateBall` (`src/engine/cricketEngine.ts`) affecting boundary saves, catching chances, and inner-ring dot ball pressure.
     - **Batter-Bowler Analytics:** Matchup analyzer computing vs-Pace, vs-Spin, left-arm angle modifiers, phase strike rates (Powerplay, Middle, Death), historical ball-by-ball H2H records, and recommended line/length plans.
     - **Tactical Scenario Simulator:** Sandbox Monte Carlo match simulator running 10–35 full 20-over simulations to compare XIs, pitch surfaces, batting intent, and field templates without mutating official career state.
     - **Player Personalities & Dressing-Room Dynamics (`TeamManagementScreen.tsx`):** Added personality archetypes, leadership/work-ethic ratings, playing-time expectations, and mentorship/morale status to player detail modals.
      - **Stadium & Training Infrastructure:** Added 5 upgradeable club facilities (`Stadium Bowl`, `Biomechanics Nets`, `Sports Science Clinic`, `Youth Scouting Network`, `AI Analytics War Room`) funded by franchise purse.
5. **Phase 5 — Manager Career Progression & Infrastructure Economy Integration:** ✅ **COMPLETED & VERIFIED**
   - **Board Objectives & Directives (`ProfileScreen.tsx`):** Added interactive Board Mandates view displaying franchise targets (`Qualify for Playoffs`, `Maintain Net Run Rate > +0.40`, `Develop Domestic Youngster`) with dynamic checkmark indicators and descriptions.
   - **Job Security Gauge & Reputation Tiers (`ProfileScreen.tsx`):** Added a job security rating meter (20–100%) and confidence tiers (`Board Delighted`, `Secure`, `Stable`, `Under Review`) calculated from board targets, win percentage, and winning streak. Added dynamic reputation ranks (`World-Class Tactician`, `Championship Winner`, `Elite Mastermind`, `Established Strategist`, `Emerging Coach`).
   - **Manager Vacancies & Direct Contract Signing (`ProfileScreen.tsx`):** Integrated open franchise & national contract offers directly into `ProfileScreen.tsx` with expectations, salary Cr/yr, and one-tap contract acceptance (`acceptJobOffer`).
   - **Facility Economy & Progression Effects (`GameContext.tsx`):**
     - **Stadium & Hospitality:** Automatically pays out matchday gate revenue (0.25 Cr to 1.60 Cr based on stadium tier) to the franchise purse after home matches in `recordCompletedMatch`.
     - **Medical Center:** Accelerates natural player fitness recovery and injury days healing in `advanceCalendarDay`.
     - **Training Complex:** Applies facility XP multipliers to trainee skill progression in `trainSquad`.
   - **Automated Verification:** Verified 17/17 automated unit, smoke, and regression tests passing in `src/tests/runAllTests.ts`. Verified production compilation (`npm run build`).
6. **Phase 6 — Storage Quota Defense & Compact Serialization (`GameContext.tsx`):** ✅ **COMPLETED & VERIFIED**
   - **QuotaExceededError Resolution:** Fixed browser storage crash (`Failed to execute 'setItem' on 'Storage': Setting the value of 'ms_save_slot_v6_1' exceeded the quota`) caused by duplicate serialization of all 265 players inside teams squads and full match simulation telemetry inside calendar dates.
   - **Compact Serialization Architecture:** Stripped redundant `squad: Player[]` arrays from `teams` snapshots (dynamically rehydrated from `players` on load) and stripped heavy ball-by-ball match telemetry (`completedMatchState`) from calendar fixtures, shrinking save slot footprints by ~97% from 2.8 MB to ~90 KB.
   - **Safe Storage Guard (`safeStorageSet` & `pruneLegacyCacheKeys`):** Implemented quota guard utility that automatically purges stale/legacy cache keys and safely handles storage constraints without unhandled exceptions.
   - **Debounced Save Synchronization:** Replaced immediate re-render save synchronization with a 1500ms debounced timer to prevent storage quota thrashing.
7. **Phase 7 — Complete 8-Feature Advanced Enhancement Suite & Verification:** ✅ **COMPLETED & VERIFIED**
   - **1. AI Cricket Director (`src/services/cricketServices.ts`, `TacticalCommandSuiteModal.tsx`, `HubScreen.tsx`):** Added executive domain service and modal tab featuring franchise-tailored directors (Stephen Fleming, Mahela Jayawardene, Gautam Gambhir, Mo Bobat, etc.), comprehensive opponent assessments, tactical Playing XI recommendations with 1-click apply, Home Pitch Curator directives with 1-click orders, 3-phase tactical game plans (Powerplay, Middle, Death), squad workload & morale alerts, and scouting directives.
   - **2. Batter-Bowler Intelligence (`cricketServices.ts`, `TacticalCommandSuiteModal.tsx`, `EndOverBowlerModal.tsx`):** End-to-end matchup analytics calculating vs-Pace, vs-Spin, left-arm angle modifiers, phase strike rates, head-to-head dismissals, dismissal risk %, boundary threat %, and channel plans.
   - **3. What-If Simulation Laboratory (`cricketServices.ts`, `TacticalCommandSuiteModal.tsx`):** Multi-iteration Monte Carlo sandbox testing custom pitches, batting intent, bowling aggression, and field setups without mutating official game saves.
   - **4. Save Integrity & Regression Suite (`src/tests/runAllTests.ts`, `GameContext.tsx`):** Comprehensive 20-test automated regression suite covering all 8 features, quota defense, and data schemas.
   - **5. Interactive Field Editor (`TacticalCommandSuiteModal.tsx`, `cricketEngine.ts`):** Top-down SVG cricket oval with 7 presets, live click-to-reposition fielders, boundary vs ring detection, phase restriction validation, and ball-by-ball physics impact.
   - **6. Living Cricket Universe (`LeagueScreen.tsx`, `WorldScreen.tsx`, `InboxModal.tsx`):** 10-team standings, dynamic Net Run Rate, Orange/Purple Cap & MVP leaderboards, Cricbuzz 2026 International calendar, bilateral tours, and dynamic news wire.
   - **7. Player Personalities (`TeamManagementScreen.tsx`, `cricketServices.ts`):** 6 archetypes, leadership/temperament scores, playing-time expectations, and dynamic dressing-room statuses.
   - **8. Manager Career & Job Market (`ProfileScreen.tsx`, `GameContext.tsx`):** Board targets, job security meter, reputation ranks, and open franchise/international contract offers with direct signing.
   - **Automated Verification:** 20/20 unit, smoke, and regression tests passing (`npm test`). Production build verified (`npm run build`).


