# Content Engine — desktop app

A Windows installer that colleagues download and run. No terminal, no Node,
no ffmpeg install, no `.env` file to set up.

## Building the installer

```bash
npm run desktop:build
```

That runs three steps: `next build`, then `electron/build-desktop.mjs` to stage
`release-resources/`, then electron-builder. The installer lands in
`release/Content Engine-Setup-<version>.exe`.

To test the shell without building an installer:

```bash
npm run build && npm run desktop:stage && npm run desktop:dev
```

## What ships, and what deliberately does not

The staging script strips things Next's standalone output would otherwise
include:

| Excluded | Why |
| --- | --- |
| `data/` | Your brands, calendars and QC decisions. Colleagues get an empty app, not a copy of your work. |
| `public/generated/` | ~50MB of your generated images and reels. |
| `src/`, configs, `*.md` | Not executed at runtime. |

Bundled: the standalone server (~29MB), the client bundle, and ffmpeg +
ffprobe (~156MB — the bulk of the installer, and unavoidable since video
rendering is the app's core feature).

## API keys

**The installer contains live API keys.** They are read from `.env.local` at
build time and written to `app.env` inside the package. This was a deliberate
choice so colleagues don't each need their own keys.

Two consequences worth being clear about:

- An `.exe` can be unpacked. Anyone who obtains the installer can read the
  keys. **Distribute inside the company only** — not via a public link.
- All usage bills to those keys, across everyone who installs it.

To rotate a key, change `.env.local` and rebuild. Keys are never written into
source and never committed.

### Per-install override

Any install can use different keys without a new build:
**File → Edit API keys** writes `settings.env` into the user's data folder.
Values there win over the bundled ones. Restart the app after editing.

## Where a user's data lives

`%APPDATA%\Content Engine\` — `data\` for records, `media\` for generated
images and video. Reachable from **File → Open data folder**.

Each install is independent: brands and assets are not shared between
colleagues. Making them shared needs either a network folder (point
`CONTENT_ENGINE_DATA_DIR` at one) or a hosted backend.

## How it works

Electron starts the Next standalone server as a child process on a free port,
waits for it to accept connections, then opens a window at it. Three things
are corrected for the packaged case before the server starts:

1. **Storage** — the install directory is read-only for a normal user, so
   `CONTENT_ENGINE_DATA_DIR` / `CONTENT_ENGINE_MEDIA_DIR` point at the user's
   profile. Every module resolves paths through `src/lib/app-paths.ts`.
2. **Media serving** — media no longer lives under `public/`, so
   `src/app/generated/[...path]/route.ts` serves it, with HTTP Range support
   so video scrubbing works.
3. **ffmpeg** — `FFMPEG_PATH` points at the bundled binary; `ffprobe` is
   derived from it.

The renderer runs with `nodeIntegration: false` and `contextIsolation: true`.
The app displays model-generated text, and a sandboxed renderer means an
injected string can never reach the filesystem.

## Known gaps

- **Unsigned.** Windows SmartScreen will warn on first run ("Windows protected
  your PC" → *More info* → *Run anyway*). Removing that needs a code-signing
  certificate (~$200–400/year).
- **No auto-update.** A new version means sending colleagues a new installer.
  electron-builder supports update feeds if that becomes tedious.
- **Windows only** so far. macOS needs `--mac` plus a Mac to build on.
