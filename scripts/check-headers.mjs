// Loads the built page under the production headers and asserts it actually
// BOOTS. Byte-identical output tells you nothing about a header that changes
// runtime behaviour: a CSP without script-src falls back to default-src and
// blocks the inline module the whole game lives in, which shipped a blank shell
// to production once. This is the check that would have caught it.
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8791;

const server = spawn(process.execPath, [new URL('./serve-local.mjs', import.meta.url).pathname, String(PORT)], { stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 700));

const run = async (args) => {
  const p = spawn(CHROME, ['--headless', '--no-sandbox', '--disable-gpu', '--no-proxy-server',
    '--virtual-time-budget=6000', ...args]);
  let out = '', err = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { err += d; });
  await once(p, 'close');
  return { out, err };
};

const { out } = await run(['--dump-dom', `http://localhost:${PORT}/`]);
const { err } = await run(['--enable-logging=stderr', '--v=0', `http://localhost:${PORT}/`]);
server.kill();

let fail = 0;
const t = (name, ok) => { console.log(ok ? 'ok  ' : 'FAIL', name); if (!ok) fail++; };

// these strings exist only if boot() ran and rendered
t('the build list rendered', /Sawmill/.test(out) && /Chapel/.test(out));
t('the quest ladder rendered', /Sow a farm|Raise a house/.test(out));
t('the valley was named', !/<span id="vname">—<\/span>/.test(out));
t('the page did not throw', !/<title>ERR:/.test(out));
t('nothing was refused by the CSP', !/Refused to (execute|load|apply)/i.test(err));

console.log(fail ? `\nFAILURES: ${fail}` : '\nALL HEADER CHECKS PASS');
process.exit(fail ? 1 : 0);
