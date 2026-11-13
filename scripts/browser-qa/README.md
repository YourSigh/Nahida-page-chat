# Real-browser extension regression harness

Run from the repository root:

```sh
npm install
npm install --no-save --no-package-lock playwright
npx playwright install chromium
npm run build
node scripts/browser-qa/run.mjs
```

This loads the actual unpacked extension into an isolated Chromium profile, serves a localhost fixture and deterministic OpenAI-compatible API, submits requests through the extension chat UI, and checks tool evidence plus the resulting DOM. No provider credentials, personal browser profile, or external website is used.

Set `CHROMIUM_PATH` to an installed Chromium executable if needed; `QA_HEADED=1` runs visibly. `QA_OUTPUT` chooses the report/screenshot directory (default ignored `qa-output/`). Twelve cases cover ordinary page-overlay blocking, modal-background blocking, an allowed control inside a modal, open-shadow click targeting, no-tool greeting, click, input, select, checkbox, no-op click, accepted re-render, and rejected re-render. A rejected replacement must not be called verified. This is integration/mechanics coverage, not a claim that real models succeed at arbitrary tasks.
