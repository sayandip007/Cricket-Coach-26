import { spawn, ChildProcess } from 'node:child_process';
import http from 'node:http';

function checkHttpReady(url: string, timeoutMs: number = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url: string, maxWaitMs: number = 30000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const isReady = await checkHttpReady(url, 1500);
    if (isReady) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function terminateProcess(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (proc.killed || proc.exitCode !== null) {
      resolve();
      return;
    }

    let resolved = false;
    const forceKillTimer = setTimeout(() => {
      if (!resolved) {
        try {
          proc.kill('SIGKILL');
        } catch {}
        resolved = true;
        resolve();
      }
    }, 2000);

    proc.once('exit', () => {
      clearTimeout(forceKillTimer);
      if (!resolved) {
        resolved = true;
        resolve();
      }
    });

    try {
      proc.kill('SIGTERM');
    } catch {
      proc.kill('SIGKILL');
    }
  });
}

async function main() {
  const targetUrl = 'http://127.0.0.1:3000';
  let serverProcess: ChildProcess | null = null;
  let didSpawnServer = false;

  console.log('[E2E Launcher] Checking if dev server is already running on port 3000...');
  const alreadyRunning = await checkHttpReady(targetUrl, 1200);

  if (alreadyRunning) {
    console.log('[E2E Launcher] Verified dev server is actively responding on port 3000.');
  } else {
    console.log('[E2E Launcher] Port 3000 is not responding. Starting Vite server...');
    serverProcess = spawn('npx', ['vite', '--port', '3000', '--host', '0.0.0.0'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' }
    });
    didSpawnServer = true;

    serverProcess.stdout?.on('data', (d) => {
      const msg = d.toString();
      if (msg.includes('ready in') || msg.includes('Local:')) {
        console.log(`[Vite Server] ${msg.trim()}`);
      }
    });

    serverProcess.stderr?.on('data', (d) => {
      console.error(`[Vite Server Error] ${d.toString().trim()}`);
    });

    serverProcess.on('error', (err) => {
      console.error('[E2E Launcher] Failed to spawn Vite server:', err);
    });

    console.log('[E2E Launcher] Waiting for Vite server to become ready at', targetUrl);
    const ready = await waitForServer(targetUrl, 30000);

    if (!ready) {
      console.error('[E2E Launcher] ERROR: Vite server failed to become ready within 30 seconds.');
      if (serverProcess) {
        await terminateProcess(serverProcess);
      }
      process.exit(1);
    }
    console.log('[E2E Launcher] Vite server is ready on port 3000.');
  }

  // Run the Playwright test suite
  let testExitCode = 1;
  try {
    console.log('[E2E Launcher] Launching Playwright browser test suite...');
    const testProcess = spawn('npx', ['tsx', 'src/tests/e2eBrowserGameplay.test.ts'], {
      stdio: 'inherit',
      env: process.env
    });

    testExitCode = await new Promise<number>((resolve) => {
      testProcess.on('close', (code) => {
        resolve(code ?? 1);
      });
      testProcess.on('error', (err) => {
        console.error('[E2E Launcher] Failed to run test runner:', err);
        resolve(1);
      });
    });
  } catch (err) {
    console.error('[E2E Launcher] Unexpected error during test execution:', err);
    testExitCode = 1;
  } finally {
    if (didSpawnServer && serverProcess) {
      console.log('[E2E Launcher] Stopping spawned Vite server...');
      await terminateProcess(serverProcess);
      console.log('[E2E Launcher] Vite server stopped.');
    }
  }

  process.exit(testExitCode);
}

main().catch((err) => {
  console.error('[E2E Launcher] Fatal launcher failure:', err);
  process.exit(1);
});
