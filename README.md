# Joker Forge (Desktop)

Joker Forge is a desktop app for building Balatro mod content.

This project uses:
- Tauri (Rust backend + desktop packaging)
- React + TypeScript (UI)

## What It Does

- Create and manage mod data through a desktop UI
- Export generated content for your mod workflow
- Run as a native desktop app on Windows and Linux (macOS support can be added later)

## Downloads

- Nightly builds are published in the GitHub Releases page for this repository.
- Nightly tags look like: `nightly-<base>-nightly.<YYYYMMDD>.<run_number>`

## Project Links

- Tauri docs: https://tauri.app/start/
- Tauri v2 docs: https://v2.tauri.app/
- React docs: https://react.dev/
- TypeScript docs: https://www.typescriptlang.org/docs/
- GitHub Actions docs: https://docs.github.com/actions

## Local Development

Requirements:
- Node.js 20+
- Rust toolchain
- Tauri prerequisites for your OS

Install and run:

```bash
npm ci
npm run dev
```

Run desktop dev in stable channel:

```bash
npm run stable
```

Run desktop dev in nightly channel:

```bash
npm run nightly
```

These commands automatically prepare the app identity/version for the selected channel before launching Tauri dev.

Build web assets:

```bash
npm run build
```

Build the desktop app:

```bash
npm run tauri build
```

## Versioning

- Global app version lives in `app-version.json`.
- `npm run version:sync` copies that version into:
	- `package.json`
	- `src-tauri/tauri.conf.json`
	- `src-tauri/Cargo.toml`

## Nightly Releases

- Workflow file: `.github/workflows/nightly-release.yml`
- Trigger: every push to `main`
- Builds: Windows + Linux
- Publishes a GitHub prerelease with commit messages since the previous nightly
- Retention: keeps latest 14 nightly releases and deletes older release tags
