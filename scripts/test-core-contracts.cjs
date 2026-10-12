const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const cache = new Map();
const memoryStorage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
};
const context = { Date, Set, Map, console, localStorage: memoryStorage(), sessionStorage: memoryStorage(), window: { location: { href: '' } }, fetch: undefined };
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const input = fs.readFileSync(file, 'utf8').replace(/import\.meta\.env\.VITE_API_BASE_URL/g, "'/'");
  const source = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { ...context, exports, fetch: (...args) => context.fetch(...args), require: (name) => load(path.resolve(path.dirname(file), name + '.ts')) }, { filename: file });
  return exports;
}
const { parseApiDate, autoReviveDate } = load('src/lib/dateReviver.ts');
const { reviveDates } = load('src/lib/reviveDates.ts');
const { LS_KEYS } = load('src/lib/storage.ts');
const { api, ApiError, getToken, setToken } = load('src/lib/apiClient.ts');
const { projectsApi } = load('src/lib/api/projects.ts');
async function run() {
  for (const value of ['2026-10-11T08:00:00', '2026-10-11T08:00:00Z', '2026-10-11T16:00:00+08:00']) {
    assert.equal(parseApiDate(value).toISOString(), '2026-10-11T08:00:00.000Z');
    const once = reviveDates([{ deadline: value }], ['deadline']);
    assert.equal(reviveDates(once, ['deadline'])[0].deadline.toISOString(), '2026-10-11T08:00:00.000Z');
  }
  const raw = { stem: '2026-10-11T08:00:00Z', submittedAt: '2026-10-11T08:00:00Z', createdAt: '2026-10-11T08:00:00', nested: { dueDate: '2026-10-11T16:00:00+08:00' } };
  const parsed = autoReviveDate(raw);
  assert.equal(parsed.stem, raw.stem);
  assert.equal(parsed.submittedAt, raw.submittedAt);
  assert.equal(parsed.createdAt.toISOString(), '2026-10-11T08:00:00.000Z');
  assert.equal(parsed.nested.dueDate.toISOString(), parsed.createdAt.toISOString());
  assert.equal(parseApiDate('invalid'), 'invalid');
  assert.equal(parseApiDate(null), null);
  const date = new Date(); assert.equal(autoReviveDate(date), date);

  context.fetch = async () => ({ status: 502, ok: false, statusText: 'Bad Gateway', text: async () => '<html>gateway</html>' });
  await assert.rejects(api.get('/api/test'), (error) => error instanceof ApiError && error.status === 502);
  context.fetch = async () => ({ status: 200, ok: true, text: async () => '<html>bad response</html>' });
  await assert.rejects(api.get('/api/test'), (error) => error instanceof ApiError && /JSON/.test(error.message));

  setToken('old');
  let respond;
  context.fetch = () => new Promise((resolve) => { respond = resolve; });
  const pending = api.get('/api/test');
  setToken('new');
  respond({ status: 401, ok: false, statusText: 'Unauthorized', text: async () => '<html>unauthorized</html>' });
  await assert.rejects(pending, (error) => error.status === 401);
  assert.equal(getToken(), 'new');
  assert.equal(context.window.location.href, '');

  context.fetch = () => new Promise((resolve) => { respond = resolve; });
  const oldSuccess = api.get('/api/test');
  setToken('newer');
  respond({ status: 200, ok: true, text: async () => '{}'});
  await assert.rejects(oldSuccess, (error) => error.status === 409);
  assert.equal(getToken(), 'newer');

  for (const key of Object.values(LS_KEYS)) context.localStorage.setItem(key, 'private');
  context.localStorage.setItem('plab_users_cache', 'private');
  context.fetch = async () => ({ status: 401, ok: false, statusText: 'Unauthorized', text: async () => '<html>expired</html>' });
  await assert.rejects(api.get('/api/test'), (error) => error.status === 401);
  assert.equal(getToken(), null);
  assert.equal(context.window.location.href, '/login');
  for (const key of Object.values(LS_KEYS)) assert.equal(context.localStorage.getItem(key), null);
  assert.equal(context.localStorage.getItem('plab_users_cache'), null);

  const calls = [];
  let initialStatus = 'progress';
  context.fetch = async (url, options) => {
    calls.push({url, method:options.method, body:options.body && JSON.parse(options.body)});
    return {status:200, ok:true, text:async()=>JSON.stringify({id:'p',status:options.method==='GET'?initialStatus:'done'})};
  };
  await projectsApi.update('p', {status:'done', rewardCoins:0});
  assert.equal(calls.map((call)=>call.method).join(','), 'GET,PUT,POST');
  assert.equal(calls[1].body.status, undefined);
  assert.equal(calls[1].body.rewardCoins, 0);
  assert.equal(calls[2].url, '/api/projects/p/done');
  initialStatus = 'done'; calls.length = 0;
  await projectsApi.update('p', {status:'done', title:'修改已完成项目'});
  assert.equal(calls.map((call)=>call.method).join(','), 'GET,PUT');

  // 静态依赖检查：共享类型/存储不依赖演示种子；仅 app 可调用种子初始化。
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { scan(file); continue; }
      if (!/\.tsx?$/.test(file)) continue;
      const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      for (const node of ast.statements) {
        if (!ts.isImportDeclaration(node)) continue;
        if (/mockData$/.test(node.moduleSpecifier.text)) {
          assert.ok([path.join('src', 'app', 'App.tsx'), path.join('src', 'store', 'groupStore.ts')].includes(file), `${file}: 不应依赖演示数据`);
          assert.ok(node.importClause.namedBindings.elements.every((item) => item.name.text === 'initMockData'));
        }
      }
    }
  }
  scan('src');
  console.log('Core contracts passed: dates, JSON errors, stale/current 401, cache cleanup, module boundaries');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
