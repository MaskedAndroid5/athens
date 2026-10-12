import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
const dir = await mkdtemp(tmpdir() + '/athens-browser-');
const child = spawn('node', ['server/index.js'], {
  env: { ...process.env, PORT: '3100', ATHENS_DATA_DIR: dir },
  stdio: 'inherit',
});
async function stop() {
  child.kill('SIGTERM');
  await new Promise((r) => child.once('exit', r));
  await rm(dir, { recursive: true, force: true });
  process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
child.once('exit', () => (process.exitCode = 0));
