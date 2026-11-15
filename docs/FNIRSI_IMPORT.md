# FNIRSI 2C53P saved capture import

This extends the existing Experiment screen. Other screens and the simulation preview
remain demonstrations. It is a local file importer, not instrument firmware, a USB
driver, a live link or a multimeter protocol.

## Use

Serve the app over HTTPS or localhost (Web Crypto is required). Open Experiment.
Choose `N.bmp` from `Screenshot file` and `N.bin` from `Screenshot simple file`, then
select **Læs filpar**. Both files must have the same stem. The hidden directory may
need its full path entered in the Windows file picker.

The original screenshot, SHA-256 of each original and code-domain plot appear first.
There is no OCR or automatic default voltage/time scale. Check the screenshot and
enter its displayed V/div, time/div, probe ratio, coupling and zero code. A zero-code
suggestion is provided only when a compact channel-colored marker can be identified.
It must be checked and entered manually. Confirm the checkbox and apply the scales.
Editing any scale immediately invalidates the previous derived result.

The displayed V/div already includes the instrument's probe setting: do **not**
multiply by X10 again. The physical probe switch must match the displayed ratio.

Add a sample/test ID, explicitly select physical, simulated/test-generated or unknown
origin, optionally enter measurement time and conditions, then add to the session log.
Logging can preserve unscaled or inconsistent files, but those records have no derived
physical results. Every entry remains `UNASSESSED` and review `pending`.

Export the log before reloading. JSON contains original files as base64, their hashes,
screen codes, manual settings and timestamps, consistency warnings and any derived
values. Import time and manually entered measurement time are separate. Original file
modification time is not treated as measurement time. There is no automatic localStorage,
server upload or automatic evidence promotion. JSON export contains the original
measurement contents and should be kept with the experiment records. A hash confirms
file identity, not calibration, physical provenance or authenticity.

This version does not restore a JSON log into the UI. Keep exported JSON and original
files; loading a new pair does not overwrite existing session entries. Exported
snapshots are immutable with respect to later UI changes.

## Supported profile and limitations

Conservative profile observed on the owner's device:

- 927-byte BIN, CH1-only flag `0x01`. Other flags/layouts are rejected.
- CH1: bytes 0–460; optional stored max/min at 461–462; CH2 occupies 463–923;
  stored CH2 extrema at 924–925; channel flag at 926.
- Exact stock BMP: 480 × 272, 16-bit RGB565, 40-byte DIB header, BI_RGB, bottom-up,
  offset 54, total 261174 bytes. Other BMP encodings are rejected rather than guessed.
  The RGB565 interpretation is device-specific despite the BI_RGB header.
- Screen position: `x = 9 + index`, `y = 270 - code`; 32 codes/vertical division,
  50 points/horizontal division. `V = (code - zeroCode) × displayed_V_div / 32`;
  `dt = time_div / 50`.
- Yellow and cyan display themes. Consistency checks look for channel-colored pixels
  within one pixel of the decoded trace. At least 90% must match for physical conversion.
  This threshold is a heuristic, not an authenticity or acquisition-completeness proof.
  All unmatched points are disclosed. No hidden tail trimming is performed.
- Stored extrema are compared with the actual 461 points and never used to compute Vpp.
- Frequency is estimated from hysteretic rising crossings, with at least one full
  period and a 15% consistency tolerance between observed periods. Flat/short/unstable
  traces have no frequency. The displayed sampling interval is not the ADC sampling
  rate; aliasing and screen quantization can affect all derived estimates.
- No full ADC buffer, live stream, calibrated uncertainty, FFT, 3D surface generation,
  multimeter import or verification claim is implemented in this change.

The format mapping was researched using the owner's actual files and checked against
their images, with the community description as supporting reference:
https://github.com/lexus2026HA/FNIRSI-2C53T-Decoder/blob/main/docs/FORMAT.md

The reader here is an independent implementation. No code, glyph templates or sample
files from that third-party project are incorporated.

## Validation performed

`npm run check` validates all application JavaScript syntax.
`npm test` runs synthetic decoder tests without dependencies. To also run private
capture/controller checks, set `FNIRSI_FIXTURES` to an external directory containing
the owner's original 1/2/3 BMP and BIN files. They are deliberately not committed.

On 15 November 2026, syntax and all six test groups passed with those private fixtures:

- malformed formats/unsupported channels rejected;
- known synthetic time and voltage scales, including no double X10 conversion;
- flat signal and inconsistent stored extrema;
- matching, unrelated and incomplete image/trace pairs;
- actual captures: 1 matches, 2 fails the pairing threshold, 3 matches 458/461 points;
- actual controller with a DOM adapter: default code-only view, explicit scales,
  original-byte/hash roundtrip in JSON, immutable snapshots, invalidation after scale
  changes, blocked conversion for incomplete capture, missing/mismatched file rejection.

Capture 3 reproduces approximately 2.84375 Vpp and 1 kHz from the screen representation
at the manually recorded 500 mV/div and 200 µs/div settings. This is a display-data
consistency test, not independent calibration or proof that the requested generator
waveform/settings were applied. The observed waveform remains square-like.

`tests/browser.cjs` is a real Playwright scenario for private fixtures. It checks import,
export and the seven existing destinations and can save a local screenshot. It requires
Playwright plus a browser installation; `CHROMIUM_PATH` optionally selects that browser.
The host Chromium run was blocked by `socket() failed: Operation not permitted` before
opening a page. **Real browser layout, physical iPhone/Safari and hardware-to-UI file
selection remain unverified.** DOM-adapter tests are not visual/browser validation.

## Review dependency

The implementation is based on the exact PR #2 head
`d4668e80d2c286ecb23d73b1df836410d4a63040` and preserves its mobile/accessibility fixes.
It does not merge PR #2, publish the app, or install anything on DISSART or the FNIRSI.
