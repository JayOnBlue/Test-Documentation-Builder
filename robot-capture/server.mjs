// Local control panel for one-click documentation screenshot capture.
//   npm start   ->   open http://localhost:4322
//
// This is the whole auth story — there is no separate GitHub Actions auth to configure
// (no Connected App, no JWT certificate, no repo secrets). Pick an org your `sf` CLI is
// already logged into (no passkey/MFA), or click "Log in to a new org" to run a real
// `sf org login web` right from this page if you need one it doesn't know about yet.
// Click Capture & Build; when it finishes, the new screenshots are committed and pushed
// to GitHub straight from this machine using your own git credentials.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 4322;

// Only allow org/alias values that look like an sf alias/username — never let a
// client-supplied string reach a spawned argv unchecked.
const ORG_RE = /^[A-Za-z0-9_.@-]+$/;

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function sse(res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  return (msg) => res.write(`data: ${JSON.stringify(String(msg))}\n\n`);
}

// Environment that keeps the CLI fast and quiet (no auto-update check/warning, which
// otherwise slows the call and can make it exit non-zero).
const SF_ENV = { ...process.env, SF_AUTOUPDATE_DISABLE: 'true', SFDX_DISABLE_AUTOUPDATE: 'true', SF_SKIP_NEW_VERSION_CHECK: 'true' };

// Run a command and just report its exit code + stdout — used where a non-zero exit is a
// normal, expected outcome (e.g. "git diff --cached --quiet" meaning "nothing staged"),
// not a failure to surface as an error.
function run(cmd, args, opts) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { ...opts, shell: false });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out }));
    child.on('error', () => resolve({ code: -1, out: '' }));
  });
}

// Run each candidate command (argv array form — never a shell string) until one yields
// parseable Salesforce --json output. IMPORTANT: the CLI returns valid JSON on stdout even
// when it exits non-zero (e.g. an "update available" notice), so we parse stdout and ignore
// the exit code — we only care whether we got usable JSON.
function runJson(cmds) {
  return new Promise((resolve, reject) => {
    let lastErr = 'Salesforce CLI not available or not authenticated.';
    const attempt = (i) => {
      if (i >= cmds.length) return reject(new Error(lastErr));
      const [cmd, args] = cmds[i];
      const child = spawn(cmd, args, { cwd: PROJECT_ROOT, env: SF_ENV, shell: false });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('error', (err) => {
        if (/ENOENT/i.test(err.code || '')) lastErr = `"${cmd}" was not found on PATH. Open a terminal where \`${cmd} --version\` works and run \`npm start\` there.`;
        attempt(i + 1);
      });
      child.on('close', () => {
        let parsed = null;
        try { parsed = JSON.parse(stdout); } catch (e) { /* not JSON */ }
        if (parsed && (parsed.status === 0 || parsed.result)) return resolve(parsed);
        if (parsed && parsed.message) lastErr = parsed.message;
        else if (stderr) lastErr = stderr.trim().split('\n').pop();
        attempt(i + 1);
      });
    };
    attempt(0);
  });
}

async function listOrgs() {
  const data = await runJson([
    ['sf', ['org', 'list', '--json', '--skip-connection-status']],
    ['sfdx', ['force:org:list', '--json', '--skip-connection-status']],
  ]);
  const r = data.result || {};
  const rows = [].concat(r.nonScratchOrgs || [], r.scratchOrgs || [], r.other || [], r.devHubs || []);
  const seen = new Set();
  const orgs = [];
  for (const o of rows) {
    const value = o.alias || o.username;
    if (!value || seen.has(value)) continue;
    seen.add(value);
    orgs.push({ value, label: o.alias ? `${o.alias} (${o.username})` : o.username, default: !!o.isDefaultUsername });
  }
  return orgs;
}

// Run one command, streaming each stdout/stderr line to onLog as it arrives. Rejects with
// the last non-empty output line if the process exits non-zero, or with a friendly message
// if the executable itself can't be found.
function runStreamed(cmd, args, { cwd, onLog }) {
  return new Promise((resolve, reject) => {
    onLog(`$ ${cmd} ${args.join(' ')}`);
    const child = spawn(cmd, args, { cwd, env: SF_ENV, shell: false });
    let lastLine = '';
    const forward = (chunk) => {
      const text = chunk.toString();
      text.split(/\r?\n/).filter(Boolean).forEach((line) => { lastLine = line; onLog(line); });
    };
    child.stdout.on('data', forward);
    child.stderr.on('data', forward);
    child.on('error', (err) => {
      if (/ENOENT/i.test(err.code || '')) {
        reject(new Error(`"${cmd}" was not found on PATH. See robot-capture/README.md's one-time setup.`));
      } else {
        reject(err);
      }
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(lastLine || `${cmd} exited with code ${code}`));
    });
  });
}

// Commit + push docs/images and the manifest using the machine's own git identity/credentials
// (this server never touches git config or auth — it assumes you can already `git push` here).
async function commitAndPush(onLog) {
  await runStreamed('git', ['add', 'docs/images', 'docs/screenshot-manifest.json'], { cwd: PROJECT_ROOT, onLog });
  const staged = await run('git', ['diff', '--cached', '--quiet'], { cwd: PROJECT_ROOT });
  if (staged.code === 0) {
    onLog('Nothing new to commit — screenshots already match what\'s in git.');
    return;
  }
  await runStreamed('git', ['commit', '-m', 'docs: capture screenshots via robot-capture control panel'], { cwd: PROJECT_ROOT, onLog });
  await runStreamed('git', ['push'], { cwd: PROJECT_ROOT, onLog });
  onLog('Pushed to GitHub.');
  try {
    await runStreamed('gh', ['workflow', 'run', 'docs-pipeline.yml'], { cwd: PROJECT_ROOT, onLog });
  } catch (e) {
    onLog(`(Didn't trigger the Pages redeploy automatically: ${e.message}. Run it from the Actions tab, or it'll happen on the next push to force-app/.)`);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/') {
    return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(path.join(__dirname, 'control.html'), 'utf8'));
  }

  if (url.pathname === '/api/orgs') {
    try { return send(res, 200, 'application/json', JSON.stringify({ ok: true, orgs: await listOrgs() })); }
    catch (e) { return send(res, 200, 'application/json', JSON.stringify({ ok: false, error: e.message })); }
  }

  // Log in to an org this machine's sf CLI doesn't already know about. This does open a
  // real Salesforce login (and MFA/passkey if the org requires it) — there's no way around
  // that for a genuinely new session, but it only happens when you explicitly ask for it
  // here, not on every capture run.
  if (url.pathname === '/api/login') {
    const alias = url.searchParams.get('alias') || '';
    const emit = sse(res);
    if (!ORG_RE.test(alias)) {
      emit('ERROR: invalid alias (letters, numbers, . _ @ - only).');
      res.write(`event: done\ndata: ${JSON.stringify({ error: 'invalid alias' })}\n\n`);
      return res.end();
    }
    try {
      emit(`Opening Salesforce login for alias "${alias}" in your browser...`);
      await runStreamed('sf', ['org', 'login', 'web', '--alias', alias], { cwd: PROJECT_ROOT, onLog: emit });
      emit('\nLogged in. Refreshing the org list...');
      res.write(`event: done\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    } catch (e) {
      emit('ERROR: ' + e.message);
      res.write(`event: done\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
    }
    return res.end();
  }

  if (url.pathname === '/api/capture') {
    const org = url.searchParams.get('org') || '';
    const force = url.searchParams.get('force') === '1';
    const rebuild = url.searchParams.get('rebuild') !== '0';
    const push = url.searchParams.get('push') !== '0';

    const emit = sse(res);

    if (!ORG_RE.test(org)) {
      emit('ERROR: invalid org value.');
      res.write(`event: done\ndata: ${JSON.stringify({ error: 'invalid org value' })}\n\n`);
      return res.end();
    }

    try {
      emit('Regenerating the screenshot manifest from docs/business/**/*.md...');
      await runStreamed('node', ['docs/scripts/build-site.js'], { cwd: PROJECT_ROOT, onLog: emit });

      emit(`\nImporting org "${org}" into CumulusCI's keychain as "ci"...`);
      await runStreamed('cci', ['org', 'import', org, 'ci'], { cwd: __dirname, onLog: emit });

      emit('\nRunning the capture suite...');
      const taskArgs = ['task', 'run', 'capture_docs', '--org', 'ci'];
      if (force) taskArgs.push('-o', 'vars', 'FORCE:True');
      await runStreamed('cci', taskArgs, { cwd: __dirname, onLog: emit });

      if (rebuild) {
        emit('\nRebuilding the doc site with the new screenshots...');
        await runStreamed('node', ['docs/scripts/build-site.js'], { cwd: PROJECT_ROOT, onLog: emit });
      }

      if (push) {
        emit('\nStoring the new screenshots in GitHub...');
        await commitAndPush(emit);
      }

      emit('\nDone. See robot-capture/robot/OrderDemo/results/log.html for Robot Framework\'s own pass/fail/skip detail.');
      res.write(`event: done\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    } catch (e) {
      emit('ERROR: ' + e.message);
      res.write(`event: done\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
    }
    return res.end();
  }

  send(res, 404, 'text/plain', 'Not found');
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  Screenshot control panel:  ${url}\n`);
  console.log('  Uses your Salesforce CLI login — no passkey/MFA needed, unless you choose to log in to a new org.');
  console.log('  First time here? See robot-capture/README.md for one-time setup (CumulusCI, rfbrowser init).\n');

  // Open the control panel in the default browser automatically — this fixed, server-owned
  // URL is the only thing passed to the shell here, so there's no user input to inject.
  const openCmd = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(openCmd, () => { /* best-effort; console.log above is the fallback if this fails */ });
});
