# WIT//SIGNAL

Open the app in the browser (no download):

https://htmlpreview.github.io/?https://github.com/witnese-sudo/wit-signal-app/blob/main/index.html

Repo: https://github.com/witnese-sudo/wit-signal-app

## Demonstration scope

This is a static interface prototype. Patent status, invention records, collaborations, network counts, material properties and research results are not documented by this app. Empty fields mean undocumented here, not zero or absent in the real project.

The demo button only changes its label temporarily; it does not run a scientific simulation or AI optimization. Workflow steps do not establish SIMULATED, MEASURED or VERIFIED status. Those statuses require separate evidence linked to a specific sample and method.

## Local instrument file import

Experiment now includes a local FNIRSI 2C53P BMP/BIN importer. Imported files, manually
confirmed scales and derived display-waveform values are explicitly separate from
the demo. Every logged record remains UNASSESSED and pending review. Files are not
uploaded by the importer. Export session JSON to preserve originals, hashes and notes.
There is no live USB or multimeter integration. See [usage, limitations and validation](docs/FNIRSI_IMPORT.md).

Run `npm run check` and `npm test` with Node.js. No packages are needed for the app or
core tests. Private-fixture and optional browser checks are documented in the guide.

