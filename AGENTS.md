# Nahida Page Chat - Development Guide

## Cursor Cloud specific instructions

This is a Chrome/Edge browser extension (Manifest V3) with no backend server. The codebase uses vanilla JavaScript with esbuild for bundling.

### Key commands

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Build once | `npm run build` |
| Dev watch mode | `npm run dev` |
| Generate icons | `npm run icons` |

### Architecture

- `src/content/index.js` → bundled to `content.js` (injected into webpages)
- `src/background/index.js` → bundled to `background.js` (MV3 service worker)
- Build injects `.env` variables (`LLM_API_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`) at compile time via esbuild `define`

### Testing the extension in Chrome

There is no automated test suite. To manually test:

```bash
google-chrome --no-sandbox --disable-gpu --load-extension=/workspace --user-data-dir=/tmp/chrome-ext-test http://example.com
```

Then navigate to `chrome://extensions`, enable Developer mode, and load unpacked from `/workspace` if the `--load-extension` flag doesn't work directly.

### Notes

- No lint or test scripts exist in `package.json`. No ESLint, Prettier, or testing framework is configured.
- The `.env` file is required for build but the build won't fail without it (defaults are used). A `.env` file is created from `.env.example` during setup.
- `npm run icons` requires `assets/floating-icon.png` to exist (it's committed to the repo).
- The dev watch mode (`npm run dev`) rebuilds `content.js` and `background.js` on file changes, but Chrome requires manually reloading the extension to pick up changes.
