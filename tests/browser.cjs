/* Run against a local HTTP server. Requires Playwright and private fixtures outside the repo. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const fixtures = process.env.FNIRSI_FIXTURES;
if (!fixtures) throw new Error('Set FNIRSI_FIXTURES to private BMP/BIN directory; never commit those files.');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    const errors = [], uploads = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.method() !== 'GET') uploads.push(request.url()); });
    await page.goto(process.env.FNIRSI_TEST_URL || 'http://127.0.0.1:8765');
    await page.locator('[data-go=experiment]').click();
    async function importPair(n) {
      await page.locator('#bmpFile').setInputFiles(path.join(fixtures, `${n}.bmp`));
      await page.locator('#binFile').setInputFiles(path.join(fixtures, `${n}.bin`));
      await page.locator('#importCapture').click();
      await page.waitForFunction(() => document.getElementById('importStatus').textContent.includes('Filpar indlæst'));
    }
    await importPair(3);
    assert.match(await page.locator('#pairCheck').innerText(), /458\/461/);
    assert.match(await page.locator('#waveformCaption').innerText(), /skærmkode/);
    assert.match(await page.locator('#captureMetrics').innerText(), /Ingen fysiske/);
    await page.locator('#voltsPerDiv').selectOption('0.5');
    await page.locator('#secondsPerDiv').selectOption('0.0002');
    await page.locator('#probeRatio').selectOption('10');
    await page.locator('#captureCoupling').selectOption('DC');
    const suggestion = await page.locator('#zeroSuggestion').innerText();
    const zero = suggestion.match(/kode (\d+)/)[1];
    await page.locator('#zeroCode').fill(zero);
    await page.locator('#scalesConfirmed').check();
    await page.locator('#applyScales').click();
    assert.match(await page.locator('#captureMetrics').innerText(), /2\.844 V/);
    await page.locator('#sampleId').fill('PRIVATE-TEST-CAPTURE');
    await page.locator('#captureOrigin').selectOption('physical');
    await page.locator('#captureNotes').fill('Internal capture validation; not a material performance result.');
    await page.locator('#logCapture').click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#exportCaptureLog').click();
    const download = await downloadPromise;
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    const record = exported.records[0];
    assert.equal(record.origin, 'physical'); assert.equal(record.evidenceStatus, 'UNASSESSED');
    assert.equal(record.reviewStatus, 'pending'); assert.equal(record.measuredAt, null);
    assert.equal(record.derived.vpp, 2.84375); assert.equal(record.settings.probeRatio, 10);
    for (const file of record.originalFiles) {
      const original = fs.readFileSync(path.join(fixtures, file.name));
      assert.deepEqual(Buffer.from(file.data, 'base64'), original);
      assert.equal(file.sha256, crypto.createHash('sha256').update(original).digest('hex'));
    }
    // Editing a scale invalidates previous derived numbers and cannot alter a logged snapshot.
    await page.locator('#voltsPerDiv').selectOption('1');
    assert.equal(await page.locator('#scalesConfirmed').isChecked(), false);
    assert.match(await page.locator('#captureMetrics').innerText(), /Ingen fysiske/);
    // Real incomplete capture is blocked, never silently treated as a complete acquisition.
    await importPair(2);
    assert.equal(await page.locator('#applyScales').isDisabled(), true);
    assert.match(await page.locator('#pairCheck').innerText(), /IKKE godkendt/);
    // Mismatched names must hide any prior valid capture.
    await page.locator('#bmpFile').setInputFiles(path.join(fixtures, '1.bmp'));
    await page.locator('#importCapture').click();
    assert.match(await page.locator('#importStatus').innerText(), /samme filnummer/);
    assert.equal(await page.locator('#capturePanel').isVisible(), false);
    assert.equal(await page.locator('#captureLog li').count(), 1);
    assert.deepEqual(errors, []); assert.deepEqual(uploads, []);
    // Every existing destination remains navigable and exclusive.
    for (const name of ['mission', 'study', 'simulator', 'experiment', 'ip', 'world', 'truesignal']) {
      await page.evaluate(name => window.go(name), name);
      assert.equal(await page.locator('.screen:not([hidden])').count(), 1);
      assert.equal(await page.locator(`.screen[data-screen=${name}]`).isVisible(), true);
    }
    await page.evaluate(() => window.go('experiment'));
    await importPair(3);
    if (process.env.FNIRSI_SCREENSHOT) await page.screenshot({ path: process.env.FNIRSI_SCREENSHOT });
    console.log('Browser passed: real import, scale gating, hashes, original-byte export, incomplete/mismatched rejection, session log and seven-screen navigation.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
