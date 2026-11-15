/* Independent, conservative reader for FNIRSI 2C53P display captures.
 * Layout notes: docs/FNIRSI_IMPORT.md. Not a full ADC buffer or live protocol. */
(function (root) {
  'use strict';
  function decodeBin(input) {
    const bytes = new Uint8Array(input);
    if (bytes.length !== 927) throw new Error('2C53P BIN skal være præcis 927 byte.');
    if (bytes[926] !== 1) throw new Error('Kun optagelser med CH1 alene understøttes i denne version.');
    const codes = Array.from(bytes.slice(0, 461));
    const min = Math.min(...codes), max = Math.max(...codes);
    return { codes, min, max, flags: bytes[926], storedMax: bytes[461], storedMin: bytes[462],
      extremaConsistent: bytes[461] === max && bytes[462] === min };
  }
  function decodeBmp(input) {
    const bytes = new Uint8Array(input);
    if (bytes.length < 54) throw new Error('BMP-filen er afkortet.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const offset = view.getUint32(10, true), header = view.getUint32(14, true);
    const width = view.getInt32(18, true), height = view.getInt32(22, true);
    // Stock 2C53P BMP uses RGB565 despite BI_RGB. Do not generalize to arbitrary BMPs.
    if (bytes[0] !== 66 || bytes[1] !== 77 || header !== 40 || width !== 480 || height !== 272 ||
        view.getUint16(26, true) !== 1 || view.getUint16(28, true) !== 16 ||
        view.getUint32(30, true) !== 0 || offset !== 54 || bytes.length !== 261174 ||
        view.getUint32(2, true) !== bytes.length) {
      throw new Error('Forventet original 2C53P BMP: 480 × 272, 16-bit RGB565, 261174 byte.');
    }
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const word = view.getUint16(offset + ((height - 1 - y) * width + x) * 2, true);
        const p = (y * width + x) * 4;
        pixels[p] = Math.round(((word >> 11) & 31) * 255 / 31);
        pixels[p + 1] = Math.round(((word >> 5) & 63) * 255 / 63);
        pixels[p + 2] = Math.round((word & 31) * 255 / 31);
        pixels[p + 3] = 255;
      }
    }
    return { width, height, pixels };
  }
  function colorAt(bmp, x, y, theme) {
    if (x < 0 || x >= bmp.width || y < 0 || y >= bmp.height) return false;
    const p = (y * bmp.width + x) * 4;
    const [r, g, b] = bmp.pixels.slice(p, p + 3);
    return theme === 'yellow' ? r > 150 && g > 130 && b < 130 : r < 210 && g > 150 && b > 170 && g - r > 30;
  }
  function compare(bin, bmp) {
    const candidates = ['yellow', 'cyan'].map(theme => {
      const matched = bin.codes.map((code, i) => [-1, 0, 1].some(d => colorAt(bmp, 9 + i, 270 - code + d, theme)));
      return { theme, matched, count: matched.filter(Boolean).length };
    });
    const best = candidates.sort((a, b) => b.count - a.count)[0];
    const marker = [];
    for (let y = 30; y < 270; y++) {
      if (Array.from({ length: 9 }, (_, x) => x).some(x => colorAt(bmp, x, y, best.theme))) marker.push(y);
    }
    const markerValid = marker.length >= 3 && marker.length <= 11 && marker.at(-1) - marker[0] === marker.length - 1;
    // This is a consistency check, not authentication. Never silently discard unmatched tails.
    return { ...best, fraction: best.count / 461, paired: best.count / 461 >= 0.9,
      zeroCodeSuggestion: markerValid ? 270 - marker[Math.floor(marker.length / 2)] : null,
      warnings: [
        ...(best.count / 461 < 0.9 ? ['Lav billedoverensstemmelse: forkert filpar eller ufuldstændig tegning. Ingen fysiske beregninger.'] : []),
        ...(best.count < 461 ? [`${461 - best.count} punkter kunne ikke bekræftes på billedet; overlap og kanter kan skjule punkter.`] : []),
        ...(!bin.extremaConsistent ? ['BIN-felterne for maksimum/minimum afviger fra kurven og bruges ikke.'] : [])
      ] };
  }
  function analyze(bin, settings) {
    const { voltsPerDiv, secondsPerDiv, zeroCode } = settings;
    if (!(Number.isFinite(voltsPerDiv) && voltsPerDiv > 0 && Number.isFinite(secondsPerDiv) && secondsPerDiv > 0 &&
        Number.isFinite(zeroCode) && zeroCode >= 0 && zeroCode <= 255)) throw new Error('Bekræft gyldige skalaer og nulpunkt.');
    // voltsPerDiv is the displayed scale, already adjusted for the probe. No second X10 multiplication.
    const dt = secondsPerDiv / 50;
    const values = bin.codes.map(code => (code - zeroCode) * voltsPerDiv / 32);
    const span = bin.max - bin.min, crossings = [];
    if (span >= 4) {
      const low = bin.min + span * 0.35, high = bin.min + span * 0.65;
      let armed = false;
      for (let i = 0; i < bin.codes.length; i++) {
        if (bin.codes[i] <= low) armed = true;
        if (armed && bin.codes[i] >= high) { crossings.push(i); armed = false; }
      }
    }
    const periods = crossings.slice(1).map((x, i) => x - crossings[i]);
    const mean = periods.length ? periods.reduce((a, b) => a + b, 0) / periods.length : null;
    const stable = mean !== null && periods.every(p => Math.abs(p - mean) / mean < 0.15);
    return { values, dt, vpp: span * voltsPerDiv / 32,
      frequencyHz: stable ? 1 / (mean * dt) : null, frequencyPeriods: periods.length,
      verticalStepV: voltsPerDiv / 32, durationSeconds: 460 * dt };
  }
  const api = { decodeBin, decodeBmp, compare, analyze };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FNIRSI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
