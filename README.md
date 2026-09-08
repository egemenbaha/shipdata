# shipdata — Lovable event

**This repository is for a [Lovable](https://lovable.dev) event.**

## Dark Tide Watch

Build a dark-themed maritime cyber-situational-awareness dashboard. The threat model is AIS layer manipulation: we detect two anomaly classes — signal loss (a vessel going dark) and spoofing (physically implausible position jumps / identity anomalies). Center: a full-screen Leaflet map using CARTO dark_matter tiles, initial view on the Mediterranean (center lat 35, lng 18, zoom 5). Left sidebar: KPI counters at top (Total Vessels, Active Alerts, Dark Vessels, Spoofing Alerts) and a scrollable, priority-sorted alert feed below. Tactical color scheme: near-black background, cyan accents, amber for course deviation, red for dark/spoofing. Wire everything to empty placeholders for now.

Built with [Lovable](https://lovable.dev).

**Live app**: https://shipdata.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2721e83c-775c-46f6-978e-4f41ff357f28).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone https://github.com/egemenbaha/shipdata.git
cd shipdata
npm i
npm run dev
```
