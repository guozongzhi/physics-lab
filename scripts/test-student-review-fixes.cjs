const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function arrow(file, name) {
  const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found, `${name} must exist`);
  return found;
}
async function quizOrder() {
  const calls = [], pending = deferred();
  const api = { get() {}, post: async (url) => {
    calls.push(url);
    if (url.endsWith('/answer') && calls.length === 1) await pending.promise;
    return { submissions: [], score: 100 };
  } };
  const exports = {};
  vm.runInNewContext(compile(fs.readFileSync('src/lib/api/theory.ts', 'utf8')), {
    exports, require: (name) => name.endsWith('apiClient') ? { api } : {},
  });
  const submitting = exports.theoryApi.submitQuiz('s', { a: 0, b: false });
  assert.equal(calls.length, 1, '第二题不能在第一题保存前提交');
  pending.resolve();
  assert.equal((await submitting).score, 100);
  assert.deepEqual(calls, ['/api/quiz/s/answer', '/api/quiz/s/answer', '/api/quiz/s/grade']);
  calls.length = 0;
  api.post = async (url) => { calls.push(url); throw new Error('offline'); };
  await assert.rejects(exports.theoryApi.submitQuiz('s', { a: 0, b: 1 }), /offline/);
  assert.equal(calls.length, 1, '保存失败后不可继续交卷判分');
}
async function challengeResult() {
  let submitted;
  const toasts = [];
  const run = vm.runInNewContext(compile(`const handler = ${arrow('src/pages/QuizPage.tsx', 'submitAnswers')}; handler;`), {
    questions: [{ id: 'm', type: 'multiple', answer: null }], answers: { m: [1, 0] },
    apiEnabled: true, mode: 'challenge', challengeId: 'c', groupId: 'g',
    theoryApi: { submitChallenge: async () => ({
      submissions: [{ groupId: 'g', accuracy: 1, earned: 5 }],
      questionResults: [{ qid: 'm', correct: true, correctAns: [0, 1], userAns: [1, 0], knowledgePoint: 'k' }],
    }) },
    meta: { passScore: 60 }, setSubmitted: (s) => { submitted = s; },
    pushToast: (...args) => toasts.push(args), bootstrapFromApi: async () => {},
  });
  await run();
  assert.equal(submitted.score, 100);
  assert.equal(submitted.correctCount, 1);
  assert.equal(submitted.questionResults[0].correct, true);
  assert.ok(!toasts.some(([, type]) => type === 'error'));
}
async function recruitmentAcknowledgment() {
  const source = compile(fs.readFileSync('src/store/projectStore.ts', 'utf8'));
  const state = { projects: [], recruitments: [{ id: 'r', status: 'assigned', reward: 20 }], showcaseItems: [] };
  let request = deferred();
  let store;
  const mocks = {
    zustand: { create: (init) => { store = init((s) => Object.assign(state, s), () => state); return store; } },
    '../lib/storage': { LS_KEYS: {}, loadLS: (_key, fallback) => fallback, saveLS() {} },
    '../lib/apiClient': { apiEnabled: true },
    '../lib/apiService': {
      recruitmentsApi: { assign: () => request.promise, resolve: () => request.promise },
      groupsApi: { list: async () => [] }, usersApi: { list: async () => [] }, coinsApi: { transactions: async () => [] },
    },
    './groupStore': { useGroupStore: { setState() {} } },
    './coinStore': { useCoinStore: { setState() {}, getState: () => { throw Error('线上不能进行本地结算'); } } },
    './uiStore': { useUIStore: { getState: () => ({ pushToast() {} }) } },
    '../lib/syncQueue': { syncToApi: () => { throw Error('必须等待写入确认'); } },
    '../lib/reviveDates': { reviveDates: (rows) => rows },
    '../lib/activityWindow': {},
  };
  vm.runInNewContext(source, { exports: {}, Date, Set, require: (name) => {
    assert.ok(name in mocks, `Unexpected dependency ${name}`); return mocks[name];
  } });
  const before = JSON.stringify(state);
  const rejected = store.resolveRecruitment('r', 'success');
  assert.equal(JSON.stringify(state), before, '等待期间不能改变招募状态或结算');
  request.reject(new Error('禁止裁决'));
  await assert.rejects(rejected, /禁止裁决/);
  assert.equal(JSON.stringify(state), before, '服务端拒绝后保留原状态');
  request = deferred();
  const assigned = store.assignRecruitment('r', 'u');
  assert.equal(JSON.stringify(state), before);
  request.resolve({ id: 'r', status: 'assigned', assigneeUserId: 'u' }); await assigned;
  assert.equal(state.recruitments[0].assigneeUserId, 'u');
  request = deferred();
  const settled = store.resolveRecruitment('r', 'partial');
  request.resolve({ id: 'r', status: 'done', actualPay: 7 }); await settled;
  assert.equal(state.recruitments[0].actualPay, 7, '实际报酬必须采用服务端值');
}
async function manageDialog() {
  let request = deferred(), closed = false, busy = false;
  const toasts = [];
  const run = vm.runInNewContext(compile(`const handler = ${arrow('src/pages/ResearchMarketplace.tsx', 'handleManage')}; handler;`), {
    manageBusy: false, setManageBusy: (v) => { busy = v; },
    assignRecruitment: () => request.promise, resolveRecruitment: () => request.promise,
    pushToast: (...v) => toasts.push(v), setManageRecId: () => { closed = true; },
  });
  const pending = run('r', 'success');
  assert.equal(busy, true); assert.equal(toasts.length, 0); assert.equal(closed, false);
  request.reject(new Error('network failed')); await pending;
  assert.equal(closed, false); assert.equal(busy, false); assert.equal(toasts[0][1], 'error');
  request = deferred(); toasts.length = 0;
  const success = run('r', 'partial');
  request.resolve(); await success;
  assert.equal(closed, true); assert.equal(toasts[0][1], 'success');
}
function frozenCount() {
  const expression = arrow('src/pages/SafetyLab.tsx', 'frozenCount');
  const count = vm.runInNewContext(compile(expression), {
    useMemo: (fn) => fn(), scopedProjects: [
      { status: 'planning', safetyPassed: {} },
      { status: 'frozen', safetyPassed: { u: true } },
      { status: 'done', safetyPassed: {} },
    ], passedCount: 1,
  });
  assert.equal(count, 1, '冻结统计只依据项目真实状态');
}
(async () => {
  await quizOrder(); await challengeResult(); await recruitmentAcknowledgment(); await manageDialog(); frozenCount();
  console.log('Student review fixes: quiz ordering/failure, authoritative results, recruitment acknowledgment/dialog and frozen status passed');
})().catch((e) => { console.error(e); process.exitCode = 1; });
