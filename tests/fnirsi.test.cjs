const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const reader = require('../fnirsi.js');

// Synthetic display codes only. No user's measurement files are committed.
function bin(codes) {
  const bytes = new Uint8Array(927);
  bytes.set(codes); bytes[461] = Math.max(...codes); bytes[462] = Math.min(...codes); bytes[926] = 1;
  return bytes;
}
function bmp(codes, count = 461) {
  const bytes = new Uint8Array(261174), view = new DataView(bytes.buffer);
  bytes.set([66, 77]); view.setUint32(2, bytes.length, true); view.setUint32(10, 54, true);
  view.setUint32(14, 40, true); view.setInt32(18, 480, true); view.setInt32(22, 272, true);
  view.setUint16(26, 1, true); view.setUint16(28, 16, true);
  for (let i = 0; i < count; i++) {
    const y = 270 - codes[i];
    view.setUint16(54 + ((271 - y) * 480 + 9 + i) * 2, 0xffe0, true);
  }
  return bytes;
}
test('invalid lengths, other channel layouts and malformed BMPs fail closed', () => {
  assert.throws(() => reader.decodeBin(new Uint8Array(926)), /927/);
  const bytes = bin(Array(461).fill(120)); bytes[926] = 3;
  assert.throws(() => reader.decodeBin(bytes), /CH1/);
  assert.throws(() => reader.decodeBmp(new Uint8Array(53)), /afkortet/);
  const image = bmp(Array(461).fill(120)); image[28] = 24;
  assert.throws(() => reader.decodeBmp(image), /original/);
});
test('display scale includes X10 already; time step is time/div divided by 50', () => {
  const codes = Array.from({ length: 461 }, (_, i) => i % 250 < 125 ? 64 : 128);
  const decoded = reader.decodeBin(bin(codes));
  const result = reader.analyze(decoded, { voltsPerDiv: 0.5, secondsPerDiv: 0.0002, zeroCode: 64, probeRatio: 10 });
  assert.equal(result.vpp, 1); assert.equal(result.values[0], 0);
  assert.ok(Math.abs(result.frequencyHz - 1000) < 1e-8);
  assert.ok(Math.abs(result.dt - 0.000004) < 1e-12);
  assert.throws(() => reader.analyze(decoded, { voltsPerDiv: 0, secondsPerDiv: 0.1, zeroCode: 64 }));
});
test('flat captures have no frequency and stored extrema do not override actual points', () => {
  const bytes = bin(Array(461).fill(120)); bytes[461] = 200;
  const decoded = reader.decodeBin(bytes);
  assert.equal(decoded.extremaConsistent, false);
  const result = reader.analyze(decoded, { voltsPerDiv: 1, secondsPerDiv: 1, zeroCode: 120 });
  assert.equal(result.frequencyHz, null); assert.equal(result.vpp, 0);
});
test('correct pairs match while incomplete tails and unrelated screenshots block physical analysis', () => {
  const codes = Array.from({ length: 461 }, (_, i) => i % 180 < 90 ? 40 : 180);
  const decoded = reader.decodeBin(bin(codes));
  assert.equal(reader.compare(decoded, reader.decodeBmp(bmp(codes))).count, 461);
  const incomplete = reader.compare(decoded, reader.decodeBmp(bmp(codes, 369)));
  assert.equal(incomplete.paired, false); assert.equal(incomplete.count, 369);
  const unrelated = reader.compare(decoded, reader.decodeBmp(bmp(Array(461).fill(120))));
  assert.equal(unrelated.paired, false);
});
const fixtureDir = process.env.FNIRSI_FIXTURES;
test('private physical captures: incomplete capture rejected, capture 3 reconstructs observed signal', { skip: !fixtureDir }, () => {
  const read = n => {
    const decoded = reader.decodeBin(fs.readFileSync(path.join(fixtureDir, `${n}.bin`)));
    return { decoded, check: reader.compare(decoded, reader.decodeBmp(fs.readFileSync(path.join(fixtureDir, `${n}.bmp`)))) };
  };
  const first = read(1), incomplete = read(2), third = read(3);
  assert.ok(first.check.paired); assert.equal(first.check.zeroCodeSuggestion, 121);
  assert.equal(incomplete.check.paired, false); assert.equal(incomplete.check.zeroCodeSuggestion, 84);
  assert.equal(third.check.count, 458); assert.equal(third.check.paired, true);
  assert.equal(third.decoded.extremaConsistent, true);
  const result = reader.analyze(third.decoded, { voltsPerDiv: 0.5, secondsPerDiv: 0.0002, zeroCode: third.check.zeroCodeSuggestion });
  assert.equal(result.vpp, 2.84375); assert.ok(result.frequencyHz > 980 && result.frequencyHz < 1020);
});
