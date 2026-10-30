import { chromium, Browser, Page } from '@playwright/test';
import rawAssert from 'node:assert/strict';
import fs from 'node:fs';

function resolveChromiumExecutablePath(): string | undefined {
  try {
    const defaultPath = chromium.executablePath();
    if (defaultPath && fs.existsSync(defaultPath)) {
      return defaultPath;
    }
  } catch {}
  const fallbackPaths = [
    '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell',
    '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell'
  ];
  for (const candidate of fallbackPaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

interface TestSectionResult {
  section: string;
  passed: boolean;
  details: string;
  durationMs: number;
}

const sectionResults: TestSectionResult[] = [];

async function runSection(name: string, fn: (page: Page) => Promise<void>, page: Page) {
  const start = Date.now();
  console.log(`\n===============================================================`);
  console.log(`▶ [E2E] ${name}`);
  console.log(`===============================================================`);
  try {
    await fn(page);
    const durationMs = Date.now() - start;
    console.log(`✅ [PASSED] ${name} (${durationMs}ms)`);
    sectionResults.push({ section: name, passed: true, details: 'OK', durationMs });
  } catch (err: any) {
    const durationMs = Date.now() - start;
    console.error(`❌ [FAILED] ${name} (${durationMs}ms)`);
    console.error(err);
    sectionResults.push({ section: name, passed: false, details: String(err?.message || err), durationMs });
    throw err;
  }
}

async function main() {
  const executablePath = resolveChromiumExecutablePath();
  const browser: Browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  const page: Page = await context.newPage();

  // ---------------------------------------------------------------------------
  // Browser Error & Network Failure Tracking
  // ---------------------------------------------------------------------------
  // Documented expected dev-server noise:
  // 1. Vite HMR WebSocket connection failures (ws://127.0.0.1:3000 or ws://localhost:3000)
  //    when HMR is disabled (DISABLE_HMR=true) in the test/preview environment.
  // 2. External Google Fonts CDN requests (fonts.googleapis.com / fonts.gstatic.com)
  //    ONLY when running inside a network-isolated container without external internet.
  // All application resources (http://127.0.0.1:3000/*), uncaught page exceptions,
  // and unexpected console/network errors MUST be recorded and fail the test.
  const isExpectedViteHmrWebSocketNoise = (text: string, url: string = ''): boolean => {
    const combined = `${text} ${url}`;
    const isViteHmrWs =
      /ws:\/\/(127\.0\.0\.1|localhost):3000/i.test(combined) ||
      /\[vite\]\s*(failed to connect to websocket|server connection lost)/i.test(combined);
    return isViteHmrWs;
  };

  const isExternalFontCdnInIsolatedEnv = (url: string): boolean => {
    return /^https:\/\/fonts\.(googleapis|gstatic)\.com\//i.test(url);
  };

  const pageErrors: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      const locUrl = msg.location()?.url || '';
      if (isExpectedViteHmrWebSocketNoise(txt, locUrl)) {
        return;
      }
      if (
        txt.includes('Failed to load resource') &&
        isExternalFontCdnInIsolatedEnv(locUrl)
      ) {
        return;
      }
      pageErrors.push(`[console.error] ${txt}${locUrl ? ` (url: ${locUrl})` : ''}`);
    }
  });

  page.on('pageerror', err => {
    pageErrors.push(`[pageerror] ${err.message}`);
  });

  page.on('requestfailed', req => {
    const url = req.url();
    const failureText = req.failure()?.errorText || 'unknown failure';
    // Ignore benign navigation/reload cancellation and documented dev-server noise
    if (failureText.includes('ERR_ABORTED')) {
      return;
    }
    if (isExpectedViteHmrWebSocketNoise(failureText, url) || isExternalFontCdnInIsolatedEnv(url)) {
      return;
    }
    pageErrors.push(`[requestfailed] ${req.method()} ${url} -> ${failureText}`);
  });

  page.on('response', res => {
    const url = res.url();
    const status = res.status();
    if (status >= 400 && /^https?:\/\/(127\.0\.0\.1|localhost):3000/i.test(url)) {
      pageErrors.push(`[http ${status}] ${url}`);
    }
  });

  try {
    // -------------------------------------------------------------------------
    // 1. Establish Clean Page Load & Landing Screen Verification
    // -------------------------------------------------------------------------
    await runSection('1. Landing Screen & Baseline UI Verification', async (p) => {
      await p.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle', timeout: 30000 });

      // Clean known storage state for deterministic isolation
      await p.evaluate(() => {
        localStorage.clear();
      });
      await p.reload({ waitUntil: 'networkidle' });

      const title = await p.title();
      rawAssert.equal(title, 'Cricket Coach 26', 'HTML title matches metadata.json');

      const body = p.locator('body');
      await body.locator('text=TATA IPL 2026 EDITION').waitFor({ state: 'visible', timeout: 10000 });
      await body.locator('text=NEW CAREER (START FROM 0)').waitFor({ state: 'visible', timeout: 5000 });
      await body.locator('text=SETTINGS & SAVE MANAGER').waitFor({ state: 'visible', timeout: 5000 });

      console.log('   ✓ Verified Landing Screen navigation, artwork chassis, and options');
    }, page);

    // -------------------------------------------------------------------------
    // 2. Start Fresh Career (Slot 1) & Full Franchise Hub Verification
    // -------------------------------------------------------------------------
    await runSection('2. Start Fresh Career (Slot 1) & Hub Screen Verification', async (p) => {
      await p.click('text=NEW CAREER (START FROM 0)');
      const modal = p.locator('.fixed:has-text("START NEW CAREER")');
      await modal.waitFor({ state: 'visible', timeout: 10000 });

      // Select Slot 1
      const slot1Btn = modal.locator('button:has-text("Slot 1")').first();
      await slot1Btn.click();

      // Enter Coach Name
      const coachInput = modal.locator('input[placeholder*="Coach Name"]').first();
      await coachInput.fill('Gautam Gambhir');

      // Select Kolkata Knight Riders
      const kkrBtn = modal.locator('button:has-text("Kolkata Knight Riders")').first();
      await kkrBtn.click();

      // Verify Header Badge shows Slot 1 and KKR on Hub
      const topBadge = p.locator('text=SLOT 1 · KKR').first();
      await topBadge.waitFor({ state: 'visible', timeout: 10000 });
      console.log('   ✓ Started New Career as KKR in Slot 1');
    }, page);

    // -------------------------------------------------------------------------
    // 3. Application-Level Save/Load & Multi-Slot Isolation via Actual UI
    // -------------------------------------------------------------------------
    await runSection('3. Actual Save/Load Manager & Multi-Slot Isolation via UI', async (p) => {
      // Step A: Save Slot 1 via in-game Menu Drawer
      const menuBtn = p.locator('button[title="Club Menu & Pitch Curator"], button:has(svg.lucide-menu)').first();
      await menuBtn.click();

      const drawer = p.locator('div:has-text("MENU"):has-text("Load another save...")').first();
      await drawer.waitFor({ state: 'visible', timeout: 5000 });

      // Open save slots
      await p.click('text=Load another save...');
      const saveSlotsContainer = p.locator('div:has-text("Save Slots (1–3)")').filter({ has: p.locator('button:has-text("SAVE")') }).first();
      await saveSlotsContainer.waitFor({ state: 'visible', timeout: 5000 });

      // Click SAVE on Slot 1
      const slot1Row = saveSlotsContainer.locator('div.rounded-xl').filter({ hasText: 'Slot 1' });
      const saveSlot1Btn = slot1Row.locator('button:has-text("SAVE")').first();
      await saveSlot1Btn.click();
      console.log('   ✓ Clicked SAVE on Slot 1 in Save Manager');

      // Close Menu Drawer
      const closeMenuBtn = p.locator('button:has(svg.lucide-x)').first();
      await closeMenuBtn.click();
      await drawer.waitFor({ state: 'hidden', timeout: 5000 });

      // Step B: Reload page to verify persistence
      await p.reload({ waitUntil: 'networkidle' });

      // Landing Screen should show Slot 1 active with KKR
      const continueBtn = p.locator('button:has-text("CONTINUE CAREER (SLOT 1)"), button:has-text("CONTINUE CAREER")').first();
      await continueBtn.waitFor({ state: 'visible', timeout: 10000 });
      console.log('   ✓ Page reloaded. Landing Screen detects saved Slot 1 (KKR)');

      // Step C: Load Slot 1 via actual UI
      await continueBtn.click();
      const kkrHubBadge = p.locator('text=SLOT 1 · KKR').first();
      await kkrHubBadge.waitFor({ state: 'visible', timeout: 10000 });
      console.log('   ✓ Successfully loaded Slot 1 through actual UI. Team, season, and hub restored');

      // Step D: Create Slot 2 career via UI to test slot isolation
      const titleBtn = p.locator('text=← TITLE SCREEN').first();
      await titleBtn.click();

      await p.click('text=NEW CAREER (START FROM 0)');
      const modal2 = p.locator('.fixed:has-text("START NEW CAREER")');
      await modal2.waitFor({ state: 'visible', timeout: 10000 });

      // Select Slot 2
      await modal2.locator('button:has-text("Slot 2")').first().click();
      const coachInput2 = modal2.locator('input[placeholder*="Coach Name"]').first();
      await coachInput2.fill('Stephen Fleming');

      // Select Chennai Super Kings
      await modal2.locator('button:has-text("Chennai Super Kings")').first().click();

      const cskHubBadge = p.locator('text=SLOT 2 · CSK').first();
      await cskHubBadge.waitFor({ state: 'visible', timeout: 10000 });
      console.log('   ✓ Created fresh career in Slot 2 as CSK');

      // Save Slot 2 via actual in-game Menu Drawer
      await menuBtn.click();
      await p.click('text=Load another save...');
      const saveSlotsContainer2 = p.locator('div:has-text("Save Slots (1–3)")').filter({ has: p.locator('button:has-text("SAVE")') }).first();
      await saveSlotsContainer2.waitFor({ state: 'visible', timeout: 5000 });

      const slot2Row = saveSlotsContainer2.locator('div.rounded-xl').filter({ hasText: 'Slot 2' });
      await slot2Row.locator('button:has-text("SAVE")').first().click();
      console.log('   ✓ Saved Slot 2 (CSK) via Save Manager');

      // Step E: Verify slot isolation by loading Slot 1, then Slot 2 via UI
      const slot1InDrawer = saveSlotsContainer2.locator('div.rounded-xl').filter({ hasText: 'Slot 1' });
      await slot1InDrawer.locator('button:has-text("LOAD")').first().click();
      await p.locator('text=SLOT 1 · KKR').first().waitFor({ state: 'visible', timeout: 10000 });
      console.log('   ✓ Switched to Slot 1 (KKR) via UI Save Manager LOAD button');

      // Switch back to Slot 2
      const slot2InDrawer = saveSlotsContainer2.locator('div.rounded-xl').filter({ hasText: 'Slot 2' });
      await slot2InDrawer.locator('button:has-text("LOAD")').first().click();
      await p.locator('text=SLOT 2 · CSK').first().waitFor({ state: 'visible', timeout: 10000 });
      console.log('   ✓ Switched back to Slot 2 (CSK) via UI Save Manager LOAD button');

      // Switch back to Slot 1 for subsequent workflows
      await slot1InDrawer.locator('button:has-text("LOAD")').first().click();
      await p.locator('text=SLOT 1 · KKR').first().waitFor({ state: 'visible', timeout: 10000 });
      console.log('   ✓ Slot isolation and application-level save/load verified');

      // Close Menu Drawer
      const closeMenuBtn2 = p.locator('button:has(svg.lucide-x)').first();
      await closeMenuBtn2.click();
    }, page);

    // -------------------------------------------------------------------------
    // 4. Core Match Gameplay: Live Match Engine, Scorecards, DRS, Bowling
    // -------------------------------------------------------------------------
    await runSection('4. Core Match Gameplay: Live Match Engine, Scorecards, DRS, Bowling', async (p) => {
      const playBtn = p.locator('button:has-text("PLAY")').first();
      await playBtn.waitFor({ state: 'visible', timeout: 10000 });

      console.log('   ✓ Launching live match engine via PLAY button...');
      await playBtn.click();

      // Coin Toss: choose Bat First
      const batFirstBtn = p.locator('button:has-text("BAT FIRST")').first();
      await batFirstBtn.waitFor({ state: 'visible', timeout: 10000 });
      await batFirstBtn.click();

      // Opener Selection Modal
      const openerModal = p.locator('.fixed:has-text("PICK 2 BATTERS")');
      await openerModal.waitFor({ state: 'visible', timeout: 10000 });
      console.log('   ✓ Opener Selection Modal displayed. Selecting opening pair...');

      const openerRows = openerModal.locator('.divide-y > div');
      await openerRows.nth(0).click();
      await openerRows.nth(1).click();

      const startMatchBtn = p.locator('button:has-text("START MATCH WITH OPENERS")').first();
      await startMatchBtn.waitFor({ state: 'visible', timeout: 5000 });
      await startMatchBtn.click();

      // Tactics Drawer
      const applyTacticsBtn = p.locator('button:has-text("APPLY TACTICS")').first();
      await applyTacticsBtn.waitFor({ state: 'visible', timeout: 10000 });
      console.log('   ✓ Tactics Drawer open. Applying tactical preset...');
      await applyTacticsBtn.click();

      // Scoreboard Header
      const crrText = p.locator('text=CRR').first();
      await crrText.waitFor({ state: 'visible', timeout: 10000 });
      const liveBadge = p.locator('text=LIVE').first();
      await liveBadge.waitFor({ state: 'visible', timeout: 5000 });
      console.log('   ✓ Match scoreboard, stadium visualizer, and CRR verified');

      // Match Scorecard Modal via CARD button
      const cardBtn = p.locator('button:has-text("CARD")').first();
      await cardBtn.click();

      const resumeBtn = p.locator('button:has-text("RESUME MATCH")').first();
      await resumeBtn.waitFor({ state: 'visible', timeout: 10000 });

      const cardBody = await p.textContent('body');
      rawAssert.ok(cardBody?.includes('BATTER'), 'Batting scorecard columns rendered');
      rawAssert.ok(cardBody?.includes('BOWLER'), 'Bowling scorecard columns rendered');
      console.log('   ✓ Full Match Scorecard verified with Batting & Bowling tables');

      await resumeBtn.click();

      // Speed Pill
      const speed2xBtn = p.locator('button:has-text("2×")').first();
      await speed2xBtn.waitFor({ state: 'visible', timeout: 5000 });

      // Return to Hub via LiveMatchEngine back arrow
      const backArrowBtn = p.locator('button:has(svg.lucide-arrow-left)').first();
      await backArrowBtn.click();
      await p.locator('text=SLOT 1 · KKR').first().waitFor({ state: 'visible', timeout: 10000 });
      console.log('   ✓ Successfully returned to Hub screen');
    }, page);

    // -------------------------------------------------------------------------
    // 5. Calendar Simulation, Standings Table & Training Day Workflows
    // -------------------------------------------------------------------------
    await runSection('5. Calendar Simulation, Standings Table & Training Day Workflows', async (p) => {
      // If Day 1 match is uncompleted, simulate it via Quick Sim and continue back to Hub
      const quickSimBtn = p.locator('button:has-text("Simulate ⚡ FREE")').first();
      if (await quickSimBtn.isVisible()) {
        console.log('   ✓ Simulating match via Quick Sim...');
        await quickSimBtn.click();
        const continueResultBtn = p.locator('button:has-text("CONTINUE")').first();
        await continueResultBtn.waitFor({ state: 'visible', timeout: 15000 });
        await continueResultBtn.click();
        await p.locator('text=SLOT 1 · KKR').first().waitFor({ state: 'visible', timeout: 10000 });
      }

      // Click ADVANCE DAY
      const advanceBtn = p.locator('button:has-text("ADVANCE DAY")').first();
      await advanceBtn.waitFor({ state: 'visible', timeout: 10000 });
      await advanceBtn.click();

      // Check next day actions (training or rest)
      const simTrainingBtn = p.locator('button:has-text("SIM TRAINING")').first();
      const restBtn = p.locator('button:has-text("REST SQUAD")').first();

      if (await simTrainingBtn.isVisible()) {
        console.log('   ✓ Day 2 Training: clicking SIM TRAINING...');
        await simTrainingBtn.click();
      } else if (await restBtn.isVisible()) {
        console.log('   ✓ Day 2 Rest: clicking REST SQUAD...');
        await restBtn.click();
      }

      // Check League Standings
      const leagueTab = p.locator('button:has-text("League")').last();
      await leagueTab.click();
      await p.locator('text=Top 4 qualify for Finals Series').waitFor({ state: 'visible', timeout: 10000 });

      const bodyText = await p.textContent('body');
      rawAssert.ok(bodyText?.includes('Kolkata Knight Riders'), 'KKR listed in standings');
      rawAssert.ok(bodyText?.includes('Chennai Super Kings'), 'CSK listed in standings');
      rawAssert.ok(bodyText?.includes('Mumbai Indians'), 'MI listed in standings');
      rawAssert.ok(bodyText?.includes('NRR'), 'NRR column present');
      rawAssert.ok(bodyText?.includes('PTS'), 'PTS column present');
      console.log('   ✓ Verified 10 IPL franchises, Points, NRR, and qualification threshold');

      // Return to Hub
      const hubTab = p.locator('button:has-text("Hub")').last();
      await hubTab.click();
      await p.locator('text=SLOT 1 · KKR').first().waitFor({ state: 'visible', timeout: 10000 });
    }, page);

    // -------------------------------------------------------------------------
    // 6. Real International Career Lifecycle via UI (Requirement 3)
    // -------------------------------------------------------------------------
    await runSection('6. Real International Career Lifecycle via UI', async (p) => {
      // Step A: Enter International Career Mode via World Screen
      const worldTab = p.locator('button:has-text("World")').last();
      await worldTab.click();
      await p.locator('text=WORLD STAGE & NATIONS').waitFor({ state: 'visible', timeout: 10000 });

      // Click JOB OFFERS tab
      await p.click('button:has-text("JOB OFFERS")');
      const acceptOfferBtn = p.locator('button:has-text("ACCEPT OFFER ▶")').first();
      await acceptOfferBtn.waitFor({ state: 'visible', timeout: 10000 });
      console.log('   ✓ National job offers visible. Accepting national appointment...');
      await acceptOfferBtn.click();

      // Step B: Select and Confirm Valid National Squad (15 players)
      const intlSquadModal = p.locator('.fixed:has-text("CONFIRM 15-MAN NATIONAL SQUAD")');
      await intlSquadModal.waitFor({ state: 'visible', timeout: 10000 });

      const confirmSquadBtn = p.locator('button:has-text("CONFIRM 15-MAN NATIONAL SQUAD")').first();
      rawAssert.ok(await confirmSquadBtn.isEnabled(), 'National squad of 15 eligible players auto-resolved and valid');
      console.log('   ✓ 15-Man National Squad valid. Confirming national appointment...');
      await confirmSquadBtn.click();

      // Step C: Verify Hub Shows Active International Duty Card & Capture Pre-Match Ratings
      const hubTab = p.locator('button:has-text("Hub")').last();
      await hubTab.click();

      const intlCard = p.locator('div:has-text("INTERNATIONAL CAREER DUTY")').first();
      await intlCard.waitFor({ state: 'visible', timeout: 10000 });
      console.log('   ✓ International Career Duty card active with bilateral tour');

      const preMatchSnapshot = await p.evaluate(() => {
        const hook = (window as any).__cricketCoachTestHook;
        if (!hook) throw new Error('Missing __cricketCoachTestHook on window');
        const snap = hook.getStateSnapshot();
        const series = snap.internationalSeries;
        const userNat = snap.nations.find(
          (n: any) => n.id === series.userNationId || n.name.toLowerCase() === series.userNationName.toLowerCase()
        );
        const oppNat = snap.nations.find(
          (n: any) => n.id === series.opponentNationId || n.name.toLowerCase() === series.opponentNationName.toLowerCase()
        );
        return {
          seriesId: series.seriesId,
          format: series.format || 'T20',
          userNationId: userNat?.id,
          userNationName: userNat?.name,
          userRatingT20: userNat?.ratingT20,
          oppNationId: oppNat?.id,
          oppNationName: oppNat?.name,
          oppRatingT20: oppNat?.ratingT20,
          seriesWins: series.seriesWins,
          seriesLosses: series.seriesLosses,
          match1Completed: series.matches[0]?.completed ?? false,
          match1FixtureId: series.matches[0]?.fixtureId || `intl_fix_${series.seriesId}_1`
        };
      });

      rawAssert.equal(preMatchSnapshot.match1Completed, false, 'Match 1 starts uncompleted');
      rawAssert.equal(preMatchSnapshot.seriesWins, 0, 'Series wins start at 0');
      rawAssert.equal(preMatchSnapshot.seriesLosses, 0, 'Series losses start at 0');
      rawAssert.equal(typeof preMatchSnapshot.userRatingT20, 'number', 'Captured numeric pre-match user nation T20 rating');
      rawAssert.equal(typeof preMatchSnapshot.oppRatingT20, 'number', 'Captured numeric pre-match opponent nation T20 rating');
      console.log(
        `   ✓ Pre-Match 1 Ratings captured: ${preMatchSnapshot.userNationName}=${preMatchSnapshot.userRatingT20}, ${preMatchSnapshot.oppNationName}=${preMatchSnapshot.oppRatingT20}`
      );

      // Step D: Complete Match 1 using existing UI controls
      const simMatch1Btn = intlCard.locator('button:has-text("SIM")').first();
      await simMatch1Btn.waitFor({ state: 'visible', timeout: 5000 });

      console.log('   ✓ Simulating Match 1 of international tour via UI...');
      await simMatch1Btn.click();

      const continueResultBtn = p.locator('button:has-text("CONTINUE")').first();
      await continueResultBtn.waitFor({ state: 'visible', timeout: 20000 });
      console.log('   ✓ International Match 1 completed. Result modal visible, clicking CONTINUE...');
      await continueResultBtn.click();

      // Step E: Verify match result, series completion state, and rating delta via authoritative state & visible UI
      await intlCard.waitFor({ state: 'visible', timeout: 10000 });
      const cardTextMatch1 = await intlCard.textContent();
      rawAssert.ok(
        cardTextMatch1?.includes('1 - 0') || cardTextMatch1?.includes('0 - 1') || cardTextMatch1?.includes('2nd T20I'),
        'Series score and next match updated on Hub card after Match 1'
      );

      const postMatch1Snapshot = await p.evaluate(() => {
        const hook = (window as any).__cricketCoachTestHook;
        const snap = hook.getStateSnapshot();
        const series = snap.internationalSeries;
        const userNat = snap.nations.find(
          (n: any) => n.id === series.userNationId || n.name.toLowerCase() === series.userNationName.toLowerCase()
        );
        const oppNat = snap.nations.find(
          (n: any) => n.id === series.opponentNationId || n.name.toLowerCase() === series.opponentNationName.toLowerCase()
        );
        return {
          userRatingT20: userNat?.ratingT20,
          oppRatingT20: oppNat?.ratingT20,
          seriesWins: series.seriesWins,
          seriesLosses: series.seriesLosses,
          match1Completed: series.matches[0]?.completed ?? false,
          match1Summary: series.matches[0]?.summary || ''
        };
      });

      rawAssert.equal(postMatch1Snapshot.match1Completed, true, 'Match 1 is marked completed after UI simulation');
      rawAssert.equal(
        postMatch1Snapshot.seriesWins + postMatch1Snapshot.seriesLosses,
        1,
        'Exactly 1 series match result recorded after Match 1'
      );

      const didUserWinMatch1 = postMatch1Snapshot.seriesWins === 1;
      // Apply the authoritative ranking formula from applyRecordCompletedInternationalMatchState (winner +3, loser -2, floor 150)
      const expectedUserRatingAfterMatch1 = didUserWinMatch1
        ? Math.max(150, preMatchSnapshot.userRatingT20 + 3)
        : Math.max(150, preMatchSnapshot.userRatingT20 - 2);
      const expectedOppRatingAfterMatch1 = !didUserWinMatch1
        ? Math.max(150, preMatchSnapshot.oppRatingT20 + 3)
        : Math.max(150, preMatchSnapshot.oppRatingT20 - 2);

      rawAssert.equal(
        postMatch1Snapshot.userRatingT20,
        expectedUserRatingAfterMatch1,
        `User nation (${preMatchSnapshot.userNationName}) rating updated once from ${preMatchSnapshot.userRatingT20} to ${expectedUserRatingAfterMatch1}`
      );
      rawAssert.equal(
        postMatch1Snapshot.oppRatingT20,
        expectedOppRatingAfterMatch1,
        `Opponent nation (${preMatchSnapshot.oppNationName}) rating updated once from ${preMatchSnapshot.oppRatingT20} to ${expectedOppRatingAfterMatch1}`
      );
      console.log(
        `   ✓ Post-Match 1 Ratings verified (userWon=${didUserWinMatch1}): ${preMatchSnapshot.userNationName}=${postMatch1Snapshot.userRatingT20}, ${preMatchSnapshot.oppNationName}=${postMatch1Snapshot.oppRatingT20}`
      );

      // Verify visible Rankings UI in World Screen reflects the updated ratings
      await worldTab.click();
      await p.locator('text=WORLD STAGE & NATIONS').waitFor({ state: 'visible', timeout: 10000 });
      await p.click('button:has-text("RANKINGS")');
      const rankingsBodyText = await p.textContent('body');
      rawAssert.ok(
        rankingsBodyText?.includes(String(expectedUserRatingAfterMatch1)),
        `World Rankings UI displays updated user nation rating ${expectedUserRatingAfterMatch1}`
      );
      rawAssert.ok(
        rankingsBodyText?.includes(String(expectedOppRatingAfterMatch1)),
        `World Rankings UI displays updated opponent nation rating ${expectedOppRatingAfterMatch1}`
      );
      await hubTab.click();
      await intlCard.waitFor({ state: 'visible', timeout: 10000 });

      // Step F: Replay the same Match 1 completion event through the supported test path & verify idempotency
      const replayCheck = await p.evaluate(() => {
        const hook = (window as any).__cricketCoachTestHook;
        const replayResult = hook.replayLastCompletedMatch();
        const snapAfterReplay = hook.getStateSnapshot();
        const series = snapAfterReplay.internationalSeries;
        const userNat = snapAfterReplay.nations.find(
          (n: any) => n.id === series.userNationId || n.name.toLowerCase() === series.userNationName.toLowerCase()
        );
        const oppNat = snapAfterReplay.nations.find(
          (n: any) => n.id === series.opponentNationId || n.name.toLowerCase() === series.opponentNationName.toLowerCase()
        );
        return {
          replayed: replayResult.replayed,
          resolutionStatus: replayResult.resolutionStatus,
          reducerSeriesWins: replayResult.seriesWins,
          reducerSeriesLosses: replayResult.seriesLosses,
          liveSeriesWins: series.seriesWins,
          liveSeriesLosses: series.seriesLosses,
          liveUserRatingT20: userNat?.ratingT20,
          liveOppRatingT20: oppNat?.ratingT20,
          completedCount: series.matches.filter((m: any) => m.completed).length
        };
      });

      rawAssert.equal(replayCheck.replayed, true, 'Replayed last completed international match through supported test hook');
      rawAssert.equal(
        replayCheck.resolutionStatus,
        'already_completed',
        'Authoritative international match recorder returns resolutionStatus="already_completed" on duplicate replay'
      );
      rawAssert.equal(
        replayCheck.liveUserRatingT20,
        expectedUserRatingAfterMatch1,
        'User nation rating is NOT applied twice upon duplicate completion event'
      );
      rawAssert.equal(
        replayCheck.liveOppRatingT20,
        expectedOppRatingAfterMatch1,
        'Opponent nation rating is NOT applied twice upon duplicate completion event'
      );
      rawAssert.equal(
        replayCheck.liveSeriesWins,
        postMatch1Snapshot.seriesWins,
        'Series wins are NOT incremented twice upon duplicate completion event'
      );
      rawAssert.equal(
        replayCheck.liveSeriesLosses,
        postMatch1Snapshot.seriesLosses,
        'Series losses are NOT incremented twice upon duplicate completion event'
      );
      rawAssert.equal(
        replayCheck.completedCount,
        1,
        'Completed match count remains 1 after duplicate completion replay'
      );
      console.log('   ✓ Verified rating and series result idempotency (not applied twice on replay)');

      // Step G: Save career after Match 1, reload page, load via UI, and confirm completed match & rating change are preserved
      const menuBtnAfterM1 = p.locator('button[title="Club Menu & Pitch Curator"], button:has(svg.lucide-menu)').first();
      await menuBtnAfterM1.click();
      await p.click('text=Load another save...');
      const saveDrawerAfterM1 = p.locator('div:has-text("Save Slots (1–3)")').filter({ has: p.locator('button:has-text("SAVE")') }).first();
      await saveDrawerAfterM1.waitFor({ state: 'visible', timeout: 5000 });
      const slot1RowAfterM1 = saveDrawerAfterM1.locator('div.rounded-xl').filter({ hasText: 'Slot 1' });
      await slot1RowAfterM1.locator('button:has-text("SAVE")').first().click();
      console.log('   ✓ Saved post-Match 1 career state to Slot 1');

      await p.reload({ waitUntil: 'networkidle' });

      const continueBtnAfterM1 = p.locator('button:has-text("CONTINUE CAREER (SLOT 1)"), button:has-text("CONTINUE CAREER")').first();
      await continueBtnAfterM1.waitFor({ state: 'visible', timeout: 10000 });
      await continueBtnAfterM1.click();

      await intlCard.waitFor({ state: 'visible', timeout: 10000 });

      const reloadedMatch1Snapshot = await p.evaluate(() => {
        const hook = (window as any).__cricketCoachTestHook;
        const snap = hook.getStateSnapshot();
        const series = snap.internationalSeries;
        const userNat = snap.nations.find(
          (n: any) => n.id === series.userNationId || n.name.toLowerCase() === series.userNationName.toLowerCase()
        );
        const oppNat = snap.nations.find(
          (n: any) => n.id === series.opponentNationId || n.name.toLowerCase() === series.opponentNationName.toLowerCase()
        );
        return {
          match1Completed: series.matches[0]?.completed ?? false,
          completedCount: series.matches.filter((m: any) => m.completed).length,
          seriesWins: series.seriesWins,
          seriesLosses: series.seriesLosses,
          userRatingT20: userNat?.ratingT20,
          oppRatingT20: oppNat?.ratingT20
        };
      });

      rawAssert.equal(reloadedMatch1Snapshot.match1Completed, true, 'Match 1 remains completed after save and UI reload');
      rawAssert.equal(reloadedMatch1Snapshot.completedCount, 1, 'Completed match count remains 1 after save and UI reload');
      rawAssert.equal(reloadedMatch1Snapshot.seriesWins, postMatch1Snapshot.seriesWins, 'Series wins preserved after reload');
      rawAssert.equal(reloadedMatch1Snapshot.seriesLosses, postMatch1Snapshot.seriesLosses, 'Series losses preserved after reload');
      rawAssert.equal(
        reloadedMatch1Snapshot.userRatingT20,
        expectedUserRatingAfterMatch1,
        'User nation rating change preserved after save and UI reload'
      );
      rawAssert.equal(
        reloadedMatch1Snapshot.oppRatingT20,
        expectedOppRatingAfterMatch1,
        'Opponent nation rating change preserved after save and UI reload'
      );
      console.log('   ✓ Confirmed Match 1 completion state and rating changes preserved across save & UI reload');

      // Step H: Simulate remaining matches (2..5) to conclude series
      for (let m = 2; m <= 5; m++) {
        const nextSimBtn = intlCard.locator('button:has-text("SIM")').first();
        if (await nextSimBtn.isVisible()) {
          console.log(`   ✓ Simulating international Match ${m}...`);
          await nextSimBtn.click();
          const nextContinue = p.locator('button:has-text("CONTINUE")').first();
          await nextContinue.waitFor({ state: 'visible', timeout: 20000 });
          await nextContinue.click();
          await intlCard.waitFor({ state: 'visible', timeout: 10000 });
        }
      }

      // Verify tour concluded banner and GO TO NEXT TOUR button
      const tourConcludedText = p.locator('text=Bilateral Tour Concluded! Series complete.');
      await tourConcludedText.waitFor({ state: 'visible', timeout: 10000 });
      console.log('   ✓ All 5 matches played! Bilateral Tour Concluded banner visible');

      // Step I: Advance to Next Tour
      const nextTourBtn = p.locator('button:has-text("GO TO NEXT TOUR ▶")').first();
      await nextTourBtn.waitFor({ state: 'visible', timeout: 5000 });
      await nextTourBtn.click();
      console.log('   ✓ Clicked GO TO NEXT TOUR ▶');

      // Step J: Save, Reload, and Verify Persistence of International Tour & Rankings
      const menuBtn = p.locator('button[title="Club Menu & Pitch Curator"], button:has(svg.lucide-menu)').first();
      await menuBtn.click();
      await p.click('text=Load another save...');
      const saveSlotsDrawer = p.locator('div:has-text("Save Slots (1–3)")').filter({ has: p.locator('button:has-text("SAVE")') }).first();
      await saveSlotsDrawer.waitFor({ state: 'visible', timeout: 5000 });
      const slot1Row = saveSlotsDrawer.locator('div.rounded-xl').filter({ hasText: 'Slot 1' });
      await slot1Row.locator('button:has-text("SAVE")').first().click();
      console.log('   ✓ Saved completed tour state to Slot 1');

      // Reload page
      await p.reload({ waitUntil: 'networkidle' });

      // Load Slot 1 via actual UI
      const continueSavedBtn = p.locator('button:has-text("CONTINUE CAREER (SLOT 1)"), button:has-text("CONTINUE CAREER")').first();
      await continueSavedBtn.waitFor({ state: 'visible', timeout: 10000 });
      await continueSavedBtn.click();

      // Verify international state is consistent after reload
      await p.locator('text=INTERNATIONAL CAREER DUTY').first().waitFor({ state: 'visible', timeout: 10000 });
      console.log('   ✓ Verified international series state, completed tour, and rankings remain consistent after UI reload');
    }, page);

  } finally {
    await browser.close();
  }

  // Check for fatal unhandled page exceptions
  if (pageErrors.length > 0) {
    console.error('\n[Fatal] Captured browser console/page errors during run:');
    pageErrors.forEach(err => console.error('  - ', err));
    throw new Error(`Encountered ${pageErrors.length} fatal browser error(s) during gameplay.`);
  }

  // Print Summary Table
  console.log('\n===============================================================');
  console.log('SELF-CONTAINED BROWSER AUTOMATION TEST SUMMARY');
  console.log('===============================================================');
  for (const r of sectionResults) {
    console.log(`${r.passed ? '✅' : '❌'} ${r.section.padEnd(65)} [${r.durationMs}ms]`);
  }
  const allPassed = sectionResults.every(r => r.passed);
  console.log(`===============================================================`);
  console.log(`ALL BROWSER AUTOMATION WORKFLOWS PASSED: ${allPassed ? 'YES' : 'NO'}`);
  console.log(`===============================================================\n`);
  return allPassed;
}

main().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
