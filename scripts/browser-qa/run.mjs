// Isolated, credential-free real Chromium extension QA. Never uses a personal profile.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const here = path.dirname(fileURLToPath(import.meta.url));
const extension = path.resolve(here, '../..');
const out = process.env.QA_OUTPUT || path.join(extension, 'qa-output');
await mkdir(out, { recursive: true });
const fixture = await readFile(path.join(here, 'fixture.html'));
let scenario = null;
const requests = [];
const response = (res, value) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
const tool = (name, args, id) => ({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] });
const unwrap = (text) => { const envelope = JSON.parse(text); return envelope.kind === 'external_data' ? JSON.parse(envelope.data) : envelope; };
const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(fixture); return; }
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    if (!body.tools) {
      if (body.stream) { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: 'QA turn ended; inspect actual DOM and verification evidence.' } }] })}\n\ndata: [DONE]\n\n`); }
      else response(res, { choices: [{ message: { content: '{"sticker":null}' } }] });
      return;
    }
    requests.push(body);
    if (scenario.greeting) {
      scenario.result = { verified: null };
      return response(res, { choices: [{ message: { role: 'assistant', content: 'Hello' } }] });
    }
    const results = body.messages.filter(m => m.role === 'tool').map(m => unwrap(m.content));
    // Only inspect tool results from the current turn, one new page per scenario.
    if (!results.length) return response(res, tool('get_page_state', { maxElements: 60, region: 'all' }, 'observe'));
    if (results.length === 1) {
      const target = results[0].targets.find(t => t.name === scenario.target);
      assert.ok(target, `Missing target ${scenario.target}: ${JSON.stringify(results[0].targets)}`);
      return response(res, tool(scenario.action, { targetId: target.targetId || target.id, ...scenario.args }, 'act'));
    }
    scenario.result = results.at(-1);
    return response(res, { choices: [{ message: { role: 'assistant', content: 'QA completed' } }] });
  } catch (error) { scenario && (scenario.error = String(error.stack)); res.writeHead(500); res.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(path.join(tmpdir(), 'nahida-browser-qa-'));
let context;
const report = { origin, realBrowser: true, model: 'deterministic local mock; not a real-model quality test', results: [] };
try {
  context = await chromium.launchPersistentContext(profile, {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }),
    headless: process.env.QA_HEADED !== '1',
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
  await worker.evaluate(async origin => chrome.storage.local.set({
    nahida_llm_config: { apiBaseUrl: `${origin}/v1`, model: 'local-fixture', apiKey: 'local-fixture-not-a-secret' },
    nahida_page_action_enabled: true, nahida_pure_mode: false
  }), origin);
  const cases = [
    { target: 'Covered button', action: 'click', args: {}, verified: false, setup: p => p.evaluate(() => window.showFixtureOverlay()), check: async p => { assert.equal(await p.evaluate(() => window.coveredClicks), 0); assert.equal(scenario.result.actionExecuted, false); } },
    { target: 'Modal background button', action: 'click', args: {}, verified: false, setup: p => p.evaluate(() => document.querySelector('#page-modal').hidden = false), check: async p => { assert.equal(await p.evaluate(() => window.coveredClicks), 0); assert.equal(scenario.result.status, 'blocked_occluded'); } },
    { target: 'Modal inside button', action: 'click', args: {}, verified: true, setup: p => p.evaluate(() => document.querySelector('#page-modal').hidden = false), check: async p => assert.equal(await p.locator('#modal-inside').getAttribute('aria-expanded'), 'true') },
    { target: 'Shadow button', action: 'click', args: {}, verified: true, check: async p => assert.equal(await p.locator('#shadow-fixture button').getAttribute('aria-expanded'), 'true') },
    { target: 'No-tool greeting', greeting: true, verified: null, check: async () => {} },
    { target: 'Expand details', action: 'click', args: {}, verified: true, check: async p => { assert.equal(await p.locator('#expand').getAttribute('aria-expanded'), 'true'); assert.equal(await p.evaluate(() => window.fixtureClicks), 1); } },
    { target: 'Display name', action: 'type', args: { text: 'Alice', clear: true }, verified: true, check: async p => assert.equal(await p.locator('#name').inputValue(), 'Alice') },
    { target: 'Color', action: 'select_option', args: { value: 'blue' }, verified: true, check: async p => assert.equal(await p.locator('#color').inputValue(), 'blue') },
    { target: 'Subscribe locally', action: 'set_checked', args: { checked: true }, verified: true, check: async p => assert.equal(await p.locator('#subscribe').isChecked(), true) },
    { target: 'No-op button', action: 'click', args: {}, verified: false, check: async p => assert.equal(await p.evaluate(() => window.fixtureClicks), 0) },
    { target: 'Accepted replacement', action: 'type', args: { text: 'Alice', clear: true }, verified: true, check: async p => assert.equal(await p.locator('#accepted').inputValue(), 'Alice') },
    { target: 'Rejected replacement', action: 'type', args: { text: 'Alice', clear: true }, verified: false, check: async p => assert.equal(await p.locator('#rejected').inputValue(), 'REJECTED') }
  ];
  for (const testCase of cases) {
    scenario = { ...testCase };
    const page = await context.newPage();
    try {
      await page.goto(origin);
      await testCase.setup?.(page);
      await page.getByRole('button', { name: '页面悬浮图标', exact: true }).click();
      const input = page.locator('#ys-floating-icon-extension-root').locator('textarea.input');
      await input.fill(testCase.greeting ? '你好' : `Local QA: ${testCase.action} ${testCase.target} ${JSON.stringify(testCase.args)}`);
      await input.press('Enter');
      await page.waitForFunction(() => !document.querySelector('#ys-floating-icon-extension-root').shadowRoot.querySelector('textarea.input').disabled, undefined, { timeout: 20000 });
      assert.ok(scenario.result, scenario.error || 'No tool result reached local mock');
      await testCase.check(page);
      assert.equal(scenario.result.verified, testCase.verified, JSON.stringify(scenario.result));
      const progress = await page.locator('.execution-progress-text').allTextContents();
      if (testCase.greeting) assert.deepEqual(progress, []);
      else {
        assert.equal(progress.length, 1, JSON.stringify(progress));
        assert.match(progress[0], /本轮已结束/);
        assert.doesNotMatch(progress[0], /预计剩余|[0-9]+\s*\/\s*[0-9]+/);
        if (!testCase.verified) assert.match(progress[0], /已核验操作 0 次/);
      }
      report.results.push({ target: testCase.target, passed: true, toolResult: scenario.result, progress });
    } catch (error) {
      report.results.push({ target: testCase.target, passed: false, error: String(error.stack), toolResult: scenario.result });
    }
    await page.screenshot({ path: path.join(out, `${testCase.target.replaceAll(' ', '-')}.png`) });
    await page.close();
  }
} finally {
  report.requests = requests.length;
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  await context?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true });
}
console.log(JSON.stringify(report, null, 2));
if (report.results.some(r => !r.passed)) process.exitCode = 1;
