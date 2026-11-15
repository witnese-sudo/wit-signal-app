/* Dependency-free native Chromium QA. Private fixtures stay outside the repository.
 * FNIRSI_FIXTURES, CHROMIUM_PATH required. FNIRSI_QA_OUTPUT optionally sets QA directory.
 * Runs the real DOM/controller/canvas, using DataTransfer to populate file inputs.
 * Does not claim a physical file-picker test, USB integration or Safari coverage. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
if (!process.env.FNIRSI_FIXTURES || !process.env.CHROMIUM_PATH) throw Error('Set FNIRSI_FIXTURES and CHROMIUM_PATH.');
const output = process.env.FNIRSI_QA_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'wit-signal-browser-'));
fs.mkdirSync(output, { recursive: true });
const fixtures = {};
for (const n of [1, 2, 3]) for (const ext of ['bmp', 'bin']) {
  fixtures[`${n}.${ext}`] = fs.readFileSync(path.join(process.env.FNIRSI_FIXTURES, `${n}.${ext}`)).toString('base64');
}
async function scenario() {
  const $ = id => document.getElementById(id);
  const passed = [];
  function check(condition, name) { if (!condition) throw Error(name); passed.push(name); }
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function until(fn) { for (let i = 0; i < 200; i++) { if (fn()) return; await delay(20); } throw Error('UI operation timed out: ' + $('importStatus').textContent); }
  function input(id, value) { $(id).value = value; $(id).dispatchEvent(new Event('change', { bubbles: true })); }
  function fileInput(id, name) {
    const bytes = Uint8Array.from(atob(window.PRIVATE_FIXTURES[name]), c => c.charCodeAt(0));
    const transfer = new DataTransfer(); transfer.items.add(new File([bytes], name));
    $(id).files = transfer.files; $(id).dispatchEvent(new Event('change', { bubbles: true }));
  }
  async function load(n) {
    fileInput('bmpFile', n + '.bmp'); fileInput('binFile', n + '.bin'); $('importCapture').click();
    await until(() => $('importStatus').textContent.includes('Filpar indlæst'));
  }
  try {
    let exported;
    const originalCreate = URL.createObjectURL;
    URL.createObjectURL = blob => { exported = blob; return originalCreate(blob); };
    // Prevent a test download. The application still constructs the real exported Blob.
    HTMLAnchorElement.prototype.click = function () {};
    window.go('experiment'); await load(3);
    check($('pairCheck').textContent.includes('458/461'), 'capture 3: 458/461 matched');
    check($('waveformCaption').textContent.includes('skærmkode'), 'unknown scales stay in code domain');
    input('voltsPerDiv', '0.5'); input('secondsPerDiv', '0.0002'); input('probeRatio', '10');
    input('captureCoupling', 'DC'); input('zeroCode', '15');
    $('applyScales').click();
    check($('captureMetrics').textContent.includes('Ingen fysiske'), 'native required-checkbox validation blocks conversion');
    $('scalesConfirmed').checked = true; $('applyScales').click();
    check($('captureMetrics').textContent.includes('2.844 V'), 'physical display estimate has correct X10 handling');
    input('sampleId', 'PRIVATE-QA'); input('captureOrigin', 'physical'); $('logCapture').click();
    check($('captureLog').children.length === 1, 'session log appended');
    $('exportCaptureLog').click();
    const payload = JSON.parse(await exported.text());
    const record = payload.records[0];
    check(record.evidenceStatus === 'UNASSESSED' && record.reviewStatus === 'pending', 'no automatic verification');
    check(record.origin === 'physical' && record.measuredAt === null, 'explicit origin and unknown measurement timestamp');
    check(record.derived.vpp === 2.84375, 'derived values exported');
    for (const original of record.originalFiles) {
      check(original.data === window.PRIVATE_FIXTURES[original.name], original.role + ': byte-identical export');
      const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(atob(original.data), c => c.charCodeAt(0)));
      const hex = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
      check(hex === original.sha256, original.role + ': matching SHA-256');
    }
    input('voltsPerDiv', '1');
    check(!$('scalesConfirmed').checked && $('captureMetrics').textContent.includes('Ingen fysiske'), 'scale edits invalidate derived results');
    $('exportCaptureLog').click();
    check(JSON.parse(await exported.text()).records[0].derived.vpp === 2.84375, 'log snapshots remain immutable');
    await load(2);
    check($('applyScales').disabled && $('pairCheck').textContent.includes('IKKE godkendt'), 'incomplete real capture cannot convert');
    fileInput('bmpFile', '1.bmp'); $('importCapture').click();
    await until(() => $('importStatus').textContent.includes('samme filnummer'));
    check($('capturePanel').hidden, 'mismatched files clear old result');
    for (const name of ['mission', 'study', 'simulator', 'experiment', 'ip', 'world', 'truesignal']) {
      window.go(name);
      check(document.querySelectorAll('.screen:not([hidden])').length === 1, name + ': exclusive navigation');
      check(document.activeElement.dataset.screen === name, name + ': focus transfer');
    }
    window.go('experiment'); await load(3);
    check(!$('scalesConfirmed').checked && $('voltsPerDiv').value === '', 'new file pair clears manual settings');
    const instrument = document.querySelector('.instrument');
    check(instrument.scrollWidth <= instrument.clientWidth + 1, 'instrument panel has no horizontal overflow');
    check(document.documentElement.scrollWidth <= window.innerWidth, 'page has no horizontal overflow');
    $('capturePanel').scrollIntoView({ block: 'start' });
    $('qaResult').textContent = JSON.stringify({ status: 'passed', checks: passed.length, passed, viewport: [innerWidth, innerHeight], browser: navigator.userAgent });
  } catch (error) {
    $('qaResult').textContent = JSON.stringify({ status: 'failed', error: error.message, passed });
  }
}
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// Standalone QA copy: avoid external requests; production application files are unchanged.
html = html.replace(/<link href="https:\/\/fonts[^>]+>/, '');
html = html.replace('<link rel="stylesheet" href="styles.css"/>', '<style>' + fs.readFileSync(path.join(root, 'styles.css'), 'utf8') + '</style>');
for (const name of ['app.js', 'fnirsi.js', 'instrument.js']) html = html.replace(`<script src="${name}"></script>`, '<script>' + fs.readFileSync(path.join(root, name), 'utf8') + '</script>');
html = html.replace('</body>', '<pre id="qaResult" hidden>pending</pre><script>window.PRIVATE_FIXTURES=' + JSON.stringify(fixtures) + ';(' + scenario.toString() + ')();</script></body>');
const pagePath = path.join(output, 'private-qa.html'); fs.writeFileSync(pagePath, html);
async function runViewport(width, height) {
  const profile = fs.mkdtempSync(path.join(output, 'profile-'));
  const child = spawn(process.env.CHROMIUM_PATH, ['--headless=new', '--disable-gpu', '--no-first-run',
    '--disable-background-networking', '--disable-extensions', '--no-default-browser-check', '--hide-scrollbars',
    '--user-data-dir=' + profile, '--remote-debugging-port=0', 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let stderr = '';
      const timeout = setTimeout(() => reject(Error('Browser endpoint timeout')), 15000);
      child.once('error', reject);
      child.stderr.on('data', chunk => {
        stderr += chunk.toString(); const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
    });
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let nextId = 0; const pending = new Map();
    socket.onmessage = event => {
      const response = JSON.parse(event.data);
      const entry = pending.get(response.id);
      if (entry) { pending.delete(response.id); response.error ? entry.reject(Error(JSON.stringify(response.error))) : entry.resolve(response.result); }
    };
    function send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
    }
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const page = (method, params) => send(method, params, sessionId);
    await page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    await page('Page.enable');
    await page('Page.navigate', { url: pathToFileURL(pagePath).href });
    const evaluation = await page('Runtime.evaluate', { expression: `(async()=>{for(let i=0;i<200;i++){const e=document.getElementById('qaResult');if(e&&e.textContent!=='pending')return JSON.parse(e.textContent);await new Promise(r=>setTimeout(r,100));}return {status:'failed',error:'page result timeout'};})()`, awaitPromise: true, returnByValue: true });
    const result = evaluation.result.value;
    if (!result) throw Error('Missing browser result: ' + JSON.stringify(evaluation));
    if (result.viewport[0] !== width || result.viewport[1] !== height) throw Error('Viewport mismatch: ' + JSON.stringify(result.viewport));
    const screenshot = path.join(output, `capture-${width}x${height}.png`);
    const shot = await page('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(screenshot, Buffer.from(shot.data, 'base64'));
    fs.writeFileSync(path.join(output, `result-${width}x${height}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ ...result, screenshot }));
    if (result.status !== 'passed') process.exitCode = 1;
    await send('Browser.close');
  } finally { if (socket) socket.close(); if (!child.killed) child.kill(); }
}
(async () => {
  for (const [width, height] of [[390, 844], [320, 740], [1280, 900]]) await runViewport(width, height);
})().catch(error => { console.error(error); process.exitCode = 1; });
