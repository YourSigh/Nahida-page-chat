# AGENTS.md

## Cursor Cloud specific instructions

This is a Chrome/Edge browser extension (Manifest V3) with no backend, no database, and no test framework.

### Key commands

| Action | Command |
|--------|---------|
| Install deps | `npm install` |
| Build (one-shot) | `npm run build` |
| Dev watch mode | `npm run dev` |
| Regenerate icons | `npm run icons` |

### Development workflow

1. Copy `.env.example` to `.env` and fill in LLM API credentials (or leave defaults for build-only).
2. Run `npm run dev` to start the esbuild watcher — it rebuilds `content.js` and `background.js` on file changes.
3. Load the extension as "unpacked" in Chrome (`chrome://extensions/` → Developer mode → Load unpacked → select `/workspace`).
4. After code changes rebuild automatically; click "reload" on the extension card in `chrome://extensions/` to pick up changes.

### Caveats

- **No lint or test scripts exist** in `package.json`. There is no ESLint, Prettier, or test framework configured.
- **`.env` is required at build time** — the build script reads it to inject `LLM_API_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` as compile-time constants. Without a valid API key, the chat feature won't get LLM responses but the UI still works.
- **`sharp` (dev dependency)** is only needed for `npm run icons` (icon regeneration). It's a native module and may fail on some platforms; this does not affect the main build.
- **Built output is committed** — `content.js` and `background.js` are in the repo root (not gitignored). They get overwritten by `npm run build`.
