// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

const pages = await (await fetch('http://127.0.0.1:46882/json/list')).json();
const ws = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let nextId = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const [resolve, reject] = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(Error(message.error.message));
  else resolve(message.result);
};
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, [resolve, reject]);
    ws.send(JSON.stringify({ id, method, params }));
  });
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function waitFor(expression) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error(`Timed out waiting for ${expression}: ${await evaluate('document.body.innerText')}`);
}
await call('Page.enable');
await call('Page.navigate', { url: 'http://127.0.0.1:46881/taskpane.html' });
await waitFor('!!window.publicReversalSmoke?.bootComplete');
await waitFor('document.querySelector("#pane")?.innerText.includes("4 selected result rows")');
const result = await evaluate(`(() => {
  const pane = document.querySelector('#pane');
  const smoke = window.publicReversalSmoke;
  const html = document.documentElement.outerHTML;
  const text = pane?.innerText ?? '';
  const calls = { ...smoke.calls };
  const bad = Object.entries(smoke.canaries).filter(([, value]) => html.includes(value) || text.includes(value));
  return {
    text,
    html,
    calls,
    badCanaries: bad.map(([name]) => name),
    sourceMarkingGlobalInstalled: !!window.marqueOfficeSourceMarking,
    bootError: smoke.error,
    controls: pane?.querySelectorAll('button, input, form').length ?? -1,
  };
})()`);
const expectedZero = [
  'cabScopeRead',
  'cabInvalidationWatch',
  'applyCommitted',
  'wordRun',
  'sourceActiveDocumentId',
  'sourceOpen',
  'sourceCurrentBinding',
  'sourceInvalidationWatch',
  'sourceRead',
];
if (result.bootError) throw Error(`taskpane boot failed: ${result.bootError}`);
if (!result.text.includes('CLASSIFIED BY')) throw Error(`sanitized result did not render: ${result.text}`);
if (result.badCanaries.length) throw Error(`privileged canaries appeared in DOM: ${result.badCanaries.join(', ')}`);
if (!result.sourceMarkingGlobalInstalled) throw Error('global source-marking capability was not installed for the test');
if (result.controls !== 0) throw Error(`restricted pane rendered ${result.controls} write controls`);
for (const name of expectedZero) {
  if (result.calls[name] !== 0) throw Error(`expected zero ${name}, observed ${result.calls[name]}`);
}
if (result.calls.providerOpenWord !== 1) throw Error(`expected one provider open, observed ${result.calls.providerOpenWord}`);
if (result.calls.currentSemanticContext !== 1) throw Error(`expected one independent current-viewer read, observed ${result.calls.currentSemanticContext}`);
if (result.calls.semanticInvalidationWatch !== 1) throw Error(`expected one semantic invalidation subscription, observed ${result.calls.semanticInvalidationWatch}`);
console.log(JSON.stringify({
  result: 'pass',
  route: 'built Word taskpane restricted viewer',
  providerOpenWord: result.calls.providerOpenWord,
  independentlyReadSemanticContext: result.calls.currentSemanticContext,
  privilegedCabReads: result.calls.cabScopeRead,
  privilegedCabInvalidationSubscriptions: result.calls.cabInvalidationWatch,
  wordWrites: result.calls.applyCommitted,
  wordDocumentApiCalls: result.calls.wordRun,
  sourceMarkingProviderCalls: result.calls.sourceActiveDocumentId + result.calls.sourceOpen + result.calls.sourceCurrentBinding + result.calls.sourceInvalidationWatch + result.calls.sourceRead,
  sourceMarkingGlobalInstalled: result.sourceMarkingGlobalInstalled,
  canaries: 'clear',
  renderedRows: 4,
  controls: result.controls,
}, null, 2));
ws.close();
