(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  if (!$('importCapture')) return;
  let capture = null, analysis = null, confirmedSettings = null, revision = 0;
  const log = [];
  const settingIds = ['voltsPerDiv', 'secondsPerDiv', 'probeRatio', 'captureCoupling', 'zeroCode', 'scalesConfirmed'];
  function setText(id, value) { $(id).textContent = value; }
  function reset() {
    revision++;
    capture = analysis = confirmedSettings = null;
    $('capturePanel').hidden = true;
    $('captureSettings').reset();
    $('captureLogForm').reset();
    setText('importStatus', 'Filvalg ændret. Tryk Læs filpar.');
  }
  ['bmpFile', 'binFile'].forEach(id => $(id).addEventListener('change', reset));
  function rawPlot() {
    analysis = confirmedSettings = null;
    if (!capture) return;
    plot(capture.bin.codes, false);
    setText('captureMetrics', 'Ingen fysiske beregninger: skalaer skal bekræftes, og filparret skal passe.');
  }
  settingIds.forEach(id => $(id).addEventListener('change', () => {
    if (id !== 'scalesConfirmed') $('scalesConfirmed').checked = false;
    rawPlot();
  }));
  async function hash(buffer) {
    if (!globalThis.crypto?.subtle) throw new Error('SHA-256 kræver en sikker browserkontekst (HTTPS eller localhost).');
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
  }
  $('importCapture').addEventListener('click', async () => {
    reset();
    const ticket = revision;
    const bmpFile = $('bmpFile').files[0], binFile = $('binFile').files[0];
    try {
      if (!bmpFile || !binFile) throw new Error('Vælg både BMP og BIN. Et billede alene er ikke numeriske måledata.');
      if (!/\.bmp$/i.test(bmpFile.name) || !/\.bin$/i.test(binFile.name) ||
          bmpFile.name.slice(0, -4).toLowerCase() !== binFile.name.slice(0, -4).toLowerCase()) throw new Error('Vælg BMP/BIN med samme filnummer.');
      if (bmpFile.size !== 261174 || binFile.size !== 927) throw new Error('Filstørrelsen passer ikke til det understøttede 2C53P-format.');
      setText('importStatus', 'Læser originaler og beregner SHA-256…');
      const [bmpBuffer, binBuffer] = await Promise.all([bmpFile.arrayBuffer(), binFile.arrayBuffer()]);
      const bmp = FNIRSI.decodeBmp(bmpBuffer), bin = FNIRSI.decodeBin(binBuffer);
      const check = FNIRSI.compare(bin, bmp);
      const [bmpHash, binHash] = await Promise.all([hash(bmpBuffer), hash(binBuffer)]);
      if (ticket !== revision) return;
      capture = { bmp, bin, check, importedAt: new Date().toISOString(), files: [
        { name: bmpFile.name, bytes: bmpFile.size, sha256: bmpHash, buffer: bmpBuffer, role: 'screenshot' },
        { name: binFile.name, bytes: binFile.size, sha256: binHash, buffer: binBuffer, role: 'display_waveform' }
      ] };
      const context = $('captureImage').getContext('2d');
      context.putImageData(new ImageData(bmp.pixels, bmp.width, bmp.height), 0, 0);
      setText('pairCheck', `${check.count}/461 punkter matcher billedets kurve inden for ±1 pixel. ${check.paired ? 'Filparret er konsistent; målingen afventer stadig validering.' : 'Filparret er IKKE godkendt til fysiske beregninger.'}`);
      $('captureWarnings').replaceChildren(...check.warnings.map(message => {
        const li = document.createElement('li'); li.textContent = message; return li;
      }));
      setText('fileProvenance', capture.files.map(f => `${f.name} · ${f.bytes} byte\nSHA-256 ${f.sha256}`).join('\n\n'));
      setText('zeroSuggestion', check.zeroCodeSuggestion === null ? 'Nulmarkør kunne ikke findes entydigt.' : `Forslag fra billedets nulmarkør: kode ${check.zeroCodeSuggestion}. Kontrollér markøren, og indtast koden ovenfor.`);
      $('applyScales').disabled = !check.paired;
      $('capturePanel').hidden = false;
      rawPlot();
      setText('importStatus', 'Filpar indlæst lokalt. Ingen evidensstatus er opgraderet.');
    } catch (error) {
      if (ticket === revision) setText('importStatus', `Import afvist: ${error.message}`);
    }
  });
  function plot(values, physical) {
    const canvas = $('waveform'), c = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height, left = 70, top = 24, right = 20, bottom = 48;
    c.fillStyle = '#061018'; c.fillRect(0, 0, w, h);
    let min = physical ? Math.min(...values) : 0, max = physical ? Math.max(...values) : 255;
    const padding = Math.max((max - min) * 0.12, physical ? analysis.verticalStepV * 2 : 1);
    min -= padding; max += padding;
    c.font = '14px sans-serif';
    for (let i = 0; i <= 4; i++) {
      const y = top + i * (h - top - bottom) / 4;
      c.strokeStyle = '#25444a'; c.beginPath(); c.moveTo(left, y); c.lineTo(w - right, y); c.stroke();
      c.fillStyle = '#c0d7da'; c.fillText((max - i * (max - min) / 4).toPrecision(3), 4, y + 5);
    }
    c.fillStyle = '#c0d7da'; c.fillText(physical ? 'V' : 'Kode', 6, 16);
    c.fillText('0', left, h - 22);
    c.fillText(physical ? `${(analysis.durationSeconds * 1000).toPrecision(4)} ms` : '460', w - 100, h - 22);
    c.strokeStyle = '#ffe35c'; c.lineWidth = 2; c.beginPath();
    values.forEach((v, i) => {
      const x = left + i / 460 * (w - left - right), y = top + (max - v) / (max - min) * (h - top - bottom);
      if (!i) c.moveTo(x, y); else c.lineTo(x, y);
    }); c.stroke();
    const label = physical ? 'CH1 · afledt spænding mod relativ tid. Skalaer bekræftet manuelt.' : 'CH1 · punktnummer og skærmkode. Skalaer ubekræftede.';
    canvas.setAttribute('aria-label', label); setText('waveformCaption', label);
  }
  $('captureSettings').addEventListener('submit', event => {
    event.preventDefault();
    if (!capture?.check.paired || !$('captureSettings').reportValidity()) return;
    confirmedSettings = { voltsPerDiv: Number($('voltsPerDiv').value), secondsPerDiv: Number($('secondsPerDiv').value),
      zeroCode: Number($('zeroCode').value), probeRatio: Number($('probeRatio').value), coupling: $('captureCoupling').value,
      source: 'manual_confirmation_against_bmp', confirmedAt: new Date().toISOString() };
    analysis = FNIRSI.analyze(capture.bin, confirmedSettings);
    plot(analysis.values, true);
    setText('captureMetrics', `Afledt Vpp ≈ ${analysis.vpp.toPrecision(4)} V · ${analysis.frequencyHz === null ? 'Frekvens: utilstrækkelig variation eller antal perioder.' : `f ≈ ${analysis.frequencyHz.toPrecision(4)} Hz (${analysis.frequencyPeriods} målt(e) periode(r)).`} Skærmtrin: ${analysis.verticalStepV.toPrecision(3)} V og ${analysis.dt.toPrecision(3)} s; dette er ikke samlet måleusikkerhed.`);
  });
  function base64(buffer) {
    const bytes = new Uint8Array(buffer); let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  }
  $('captureLogForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!capture || !$('captureLogForm').reportValidity()) return;
    if (!$('sampleId').value.trim()) { setText('logStatus', 'Angiv et prøve-/test-ID.'); return; }
    // Deep snapshot: later scale/file edits cannot rewrite an existing log entry.
    const record = {
      schemaVersion: 1, id: crypto.randomUUID(), sampleId: $('sampleId').value.trim(),
      instrument: { model: 'FNIRSI 2C53P', firmware: null, calibration: 'unknown' },
      origin: $('captureOrigin').value, captureMethod: 'file', representation: 'display_waveform',
      evidenceStatus: 'UNASSESSED', reviewStatus: 'pending',
      measuredAt: $('measuredAt').value ? new Date($('measuredAt').value).toISOString() : null,
      measuredAtSource: $('measuredAt').value ? 'manual_local_time' : 'unknown',
      importedAt: capture.importedAt, loggedAt: new Date().toISOString(),
      notes: $('captureNotes').value, settings: confirmedSettings ? { ...confirmedSettings } : null,
      consistency: { matched: capture.check.count, total: 461, threshold: 0.9, passed: capture.check.paired,
        warnings: [...capture.check.warnings], method: 'display_pixels_within_one_pixel' },
      decoder: { version: '2c53p-display-v1', unofficial: true, channel: 'CH1',
        storedExtremaConsistent: capture.bin.extremaConsistent },
      codes: [...capture.bin.codes], derived: analysis ? JSON.parse(JSON.stringify(analysis)) : null,
      originalFiles: capture.files.map(f => ({ name: f.name, role: f.role, bytes: f.bytes, sha256: f.sha256,
        encoding: 'base64', data: base64(f.buffer) }))
    };
    log.push(record);
    const li = document.createElement('li');
    const originLabels = { physical: 'Fysisk instrumentoptagelse', simulated: 'Simuleret/testfil', unknown: 'Ukendt oprindelse' };
    li.textContent = `${record.sampleId} · ${originLabels[record.origin]} · afventer validering · ${record.settings ? 'bekræftede skalaer' : 'kun skærmkoder'} · importeret ${new Date(record.importedAt).toLocaleString()}`;
    $('captureLog').append(li);
    $('exportCaptureLog').disabled = false;
    setText('logStatus', `${log.length} post(er) i sessionen. Eksportér for at bevare dem.`);
  });
  $('exportCaptureLog').addEventListener('click', () => {
    const payload = { schema: 'wit-signal-instrument-log-v1', exportedAt: new Date().toISOString(), records: log };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'WIT_SIGNAL_instrument_log.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setText('logStatus', 'JSON-download startet. Kontrollér, at filen er gemt.');
  });
  window.addEventListener('beforeunload', event => {
    if (log.length) { event.preventDefault(); event.returnValue = ''; }
  });
})();
