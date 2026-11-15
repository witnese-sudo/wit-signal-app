const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const fixtures = process.env.FNIRSI_FIXTURES;

test('instrument controller: original-byte export, provenance, invalidation and rejected imports', { skip: !fixtures }, async () => {
  // DOM adapter exercises the actual controller without claiming visual/browser coverage.
  const elements = new Map();
  function element(id = '') {
    const e = { id, value: '', checked: false, hidden: false, disabled: false, files: [], children: [], textContent: '', listeners: {},
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      setAttribute(name, value) { this[name] = value; },
      replaceChildren(...items) { this.children = items; }, append(item) { this.children.push(item); },
      reportValidity() { return true; },
      reset() {}, click() {},
      getContext() { return { putImageData() {}, fillRect() {}, fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} }; }
    };
    return e;
  }
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) {
    assert.equal(elements.has(id), false, `duplicate ID ${id}`); elements.set(id, element(id));
  }
  let exported;
  const context = { document: { getElementById: id => elements.get(id), createElement: () => element() },
    FNIRSI: require('../fnirsi.js'), crypto: crypto.webcrypto, console,
    ImageData: class {}, Blob, Uint8Array, Date, Number, JSON,
    URL: { createObjectURL(blob) { exported = blob; return 'blob:test'; }, revokeObjectURL() {} },
    btoa: s => Buffer.from(s, 'binary').toString('base64'), setTimeout() {},
    window: { addEventListener() {} }
  };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../instrument.js'), 'utf8'), context);
  const $ = id => { assert.ok(elements.has(id), `missing element ${id}`); return elements.get(id); };
  const event = async (id, type) => { for (const fn of $(id).listeners[type] || []) await fn({ preventDefault() {} }); };
  function file(n, ext) {
    const bytes = fs.readFileSync(path.join(fixtures, `${n}.${ext}`));
    return { name: `${n}.${ext}`, size: bytes.length,
      async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); } };
  }
  async function load(n) {
    $('bmpFile').files = [file(n, 'bmp')]; $('binFile').files = [file(n, 'bin')];
    await event('bmpFile', 'change'); await event('importCapture', 'click');
  }
  await load(3);
  assert.match($('pairCheck').textContent, /458\/461/);
  assert.match($('captureMetrics').textContent, /Ingen fysiske/);
  $('voltsPerDiv').value = '0.5'; $('secondsPerDiv').value = '0.0002';
  $('probeRatio').value = '10'; $('captureCoupling').value = 'DC'; $('zeroCode').value = '15';
  $('scalesConfirmed').checked = true;
  await event('captureSettings', 'submit');
  assert.match($('captureMetrics').textContent, /2\.844 V/);
  $('sampleId').value = 'TEST-ONLY'; $('captureOrigin').value = 'physical';
  await event('captureLogForm', 'submit');
  await event('exportCaptureLog', 'click');
  const firstExport = JSON.parse(await exported.text()), record = firstExport.records[0];
  assert.equal(record.evidenceStatus, 'UNASSESSED'); assert.equal(record.reviewStatus, 'pending');
  assert.equal(record.origin, 'physical'); assert.equal(record.measuredAt, null);
  assert.equal(record.derived.vpp, 2.84375); assert.equal(record.settings.probeRatio, 10);
  for (const f of record.originalFiles) {
    const bytes = Buffer.from(f.data, 'base64');
    assert.deepEqual(bytes, fs.readFileSync(path.join(fixtures, f.name)));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), f.sha256);
  }
  $('voltsPerDiv').value = '1'; await event('voltsPerDiv', 'change');
  assert.equal($('scalesConfirmed').checked, false); assert.match($('captureMetrics').textContent, /Ingen fysiske/);
  await event('exportCaptureLog', 'click');
  assert.equal(JSON.parse(await exported.text()).records[0].derived.vpp, 2.84375);
  await load(2); assert.equal($('applyScales').disabled, true);
  assert.match($('pairCheck').textContent, /IKKE godkendt/);
  await event('captureSettings', 'submit'); assert.match($('captureMetrics').textContent, /Ingen fysiske/);
  $('bmpFile').files = [file(1, 'bmp')]; await event('importCapture', 'click');
  assert.match($('importStatus').textContent, /samme filnummer/); assert.equal($('capturePanel').hidden, true);
  $('binFile').files = []; await event('importCapture', 'click');
  assert.match($('importStatus').textContent, /Vælg både/);
  assert.equal($('captureLog').children.length, 1);
});
