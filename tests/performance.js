import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir, cpus, totalmem, release } from 'node:os';
const directory = await mkdtemp(tmpdir() + '/athens-perf-');
const server = spawn('node', ['server/index.js'], {
  env: { ...process.env, PORT: '3102', ATHENS_DATA_DIR: directory },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let browser;
try {
  await new Promise((r, j) => {
    server.stdout.once('data', r);
    server.once('error', j);
  });
  browser = await chromium.launch({
    executablePath: process.env.ATHENS_CHROMIUM || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => {
    localStorage.setItem(
      'athens-guest-draft',
      JSON.stringify({
        policy: 'equal',
        objects: Array.from({ length: 80 }, (_, i) => ({
          id: 'benchmark-' + i,
          kind: i % 4 === 0 ? 'solar' : 'home',
          position: [(i % 8) * 4 - 14, Math.floor(i / 8) * 3.5 - 15.75],
          rotation: 0,
          scale: 1,
          connected: true,
        })),
      }),
    );
  });
  await page.goto('http://127.0.0.1:3102');
  await page.getByRole('button', { name: 'Enter Athens' }).click();
  await page.getByRole('button', { name: 'Create a settlement' }).click();
  await page.getByRole('button', { name: 'Structural Vision OFF' }).click();
  const results = [];
  for (const quality of ['low', 'standard']) {
    await page.getByLabel('Graphics quality').selectOption(quality);
    await page.waitForTimeout(10000);
    await page.evaluate(() => (window.__ATHENS_METRICS__.frameMs.length = 0));
    console.log('Measuring ' + quality + ' for 60 seconds…');
    await page.waitForTimeout(60000);
    results.push(
      await page.evaluate((q) => {
        const m = window.__ATHENS_METRICS__,
          frames = [...m.frameMs].sort((a, b) => a - b);
        const gl = document.querySelector('canvas').getContext('webgl2');
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          quality: q,
          frames: frames.length,
          medianFrameMs: frames[Math.floor(frames.length * 0.5)],
          p95FrameMs: frames[Math.floor(frames.length * 0.95)],
          referenceTargetFps: q === 'low' ? 30 : 60,
          meanFps: 1000 / (frames.reduce((a, b) => a + b, 0) / frames.length),
          drawCalls: m.drawCalls,
          triangles: m.triangles,
          geometries: m.geometries,
          pixelRatio: m.pixelRatio,
          renderer: ext
            ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER),
        };
      }, quality),
    );
  }
  let quota = 'unknown',
    memory = 'unknown';
  try {
    quota = (await readFile('/sys/fs/cgroup/cpu.max', 'utf8')).trim();
    memory = (await readFile('/sys/fs/cgroup/memory.max', 'utf8')).trim();
  } catch {}
  const report = {
    measuredAt: new Date().toISOString(),
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    chromium: browser.version(),
    cpu: cpus()[0].model,
    hostLogicalCpus: cpus().length,
    hostMemoryBytes: totalmem(),
    containerCpuQuota: quota,
    containerMemoryLimit: memory,
    kernel: release(),
    viewport: [1280, 720],
    workload:
      '80 components (20 solar, 60 homes), Structural Vision, 10s warmup then 60s sampling per quality',
    limitations:
      'Headless software rendering on a cloud container; not a physical integrated-GPU certification. This is a stationary inspection workload. Frame-time tails include runtime and software renderer contention.',
    physicalGpuCertified: false,
    results: results.map((r) => ({ ...r, measuredTargetMet: r.meanFps >= r.referenceTargetFps })),
  };
  await writeFile('docs/performance-baseline.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser?.close();
  const done = new Promise((r) => server.once('exit', r));
  server.kill();
  await done;
  await rm(directory, { recursive: true, force: true });
}
