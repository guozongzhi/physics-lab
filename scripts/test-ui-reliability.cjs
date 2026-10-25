const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, Date, Set, console, require: name => {
    if (!(name in mocks)) throw new Error(`Unexpected dependency ${name}`);
    return mocks[name];
  } });
  return exports;
}
const { challengeQuestions } = load('src/lib/challengeQuestions.ts');
const q = { id: 'q1', topicId: 'mechanics' };
const challenge = { id: 'c1', topicId: 'mechanics', questionIds: ['q1'], status: 'open', deadline: new Date(Date.now() + 60000) };
assert.equal(challengeQuestions(challenge, [q])[0], q);
for (const bad of [undefined, { ...challenge, status: 'closed' }, { ...challenge, deadline: new Date(0) },
  { ...challenge, questionIds: [] }, { ...challenge, questionIds: ['missing'] }, { ...challenge, questionIds: ['q1', 'q1'] }]) {
  assert.throws(() => challengeQuestions(bad, [q]));
}
assert.throws(() => challengeQuestions(challenge, [{ ...q, topicId: 'electricity' }]));
assert.throws(() => challengeQuestions(challenge, [{ ...q, safetyCategory: 'electric' }]));
const { topicCompletion } = load('src/lib/learningMetrics.ts');
const base = { userId: 'u1', topicId: 't1', graded: true, passed: true };
const metric = topicCompletion([base, base, { ...base, userId: 'u2', topicId: 't2' },
  { ...base, passed: false, topicId: 't2' }, { ...base, graded: false, topicId: 't2' }], 'u1', ['t1', 't2']);
assert.equal(metric.percent, 50);
assert.equal(metric.completed.size, 1);
assert.equal(topicCompletion([], 'u1', []).percent, 0);
assert.equal(topicCompletion([{ ...base, userId: undefined }], 'u1', ['t1'], true).percent, 100);
assert.equal(topicCompletion([{ ...base, userId: undefined }], 'u1', ['t1'], false).percent, 0);
const drafts = load('src/lib/showcaseDraft.ts');
const media = load('src/lib/showcaseMedia.ts');
assert.equal(media.getMediaBadgeLabel('', 'video'), '实验视频 · 可播放');
assert.equal(media.getMediaBadgeLabel('', 'paper'), '研究论文 · 全文阅读');
assert.equal(media.getMediaBadgeLabel('', 'model3d'), '3D 模型 · 360° 检视');
assert.equal(media.getMediaBadgeLabel('', 'html'), 'HTML 交互演示');
assert.equal(media.getMediaBadgeLabel('', 'none'), null);
const data = new Map();
const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
const key = drafts.showcaseDraftKey('u1', 'g1', '/');
const form = { type: 'html', title: 'Draft', projectId: '', description: '', imageUrl: '', htmlContent: '<button>Test</button>' };
assert.equal(drafts.writeShowcaseDraft(storage, key, form, null), true);
assert.equal(drafts.readShowcaseDraft(storage, key).form.title, 'Draft');
assert.equal(drafts.readShowcaseDraft(storage, drafts.showcaseDraftKey('u2', 'g1', '/')), null);
assert.equal(drafts.readShowcaseDraft(storage, drafts.showcaseDraftKey('u1', 'g2', '/')), null);
assert.equal(drafts.readShowcaseDraft(storage, key, Date.now() + 8 * 86400000), null);
assert.equal(drafts.writeShowcaseDraft({ setItem: () => { throw new Error('Quota'); } }, key, form, null), false);
storage.setItem(key, '{bad json'); assert.equal(drafts.readShowcaseDraft(storage, key), null);
drafts.writeShowcaseDraft(storage, key, { ...form, title: '', htmlContent: '' }, null);
assert.equal(storage.getItem(key), null);

// Exercise the actual store against controlled API acknowledgments and rejections.
let state, token = 'user1', resolveRequest, rejectRequest;
const pending = () => new Promise((resolve, reject) => { resolveRequest = resolve; rejectRequest = reject; });
const item = { id: 'sc1', title: 'Original', status: 'pending', lovedBy: [], loves: 0, htmlContent: '', createdAt: new Date() };
let writes = 0;
const api = { update: pending, remove: pending, review: pending, get: pending, toggleLove: pending };
const { useProjectStore } = load('src/store/projectStore.ts', {
  zustand: { create: init => {
    const set = update => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; };
    state = init(set, () => state); return { getState: () => state };
  } },
  '../lib/storage': { LS_KEYS: {}, loadLS: () => [], saveLS: () => writes++ },
  './coinStore': { useCoinStore: { setState: () => {} } },
  './groupStore': { useGroupStore: { setState: () => {} } },
  './uiStore': { useUIStore: { getState: () => ({ pushToast: () => {} }) } },
  '../lib/apiService': { showcaseApi: api, groupsApi: { list: async () => [] }, usersApi: { list: async () => [] }, coinsApi: { transactions: async () => [] } },
  '../lib/apiClient': { apiEnabled: true, getToken: () => token },
  '../lib/syncQueue': { syncToApi: () => { throw new Error('Should not enqueue showcase mutations'); } },
  '../lib/reviveDates': { reviveDates: items => items },
  '../lib/activityWindow': {},
});
(async () => {
  state.showcaseItems = [item];
  let action = useProjectStore.getState().updateShowcaseItem('sc1', { title: 'Changed' });
  assert.equal(state.showcaseItems[0].title, 'Original', 'No local success before acknowledgment');
  rejectRequest(new Error('Offline'));
  await assert.rejects(action, /Offline/);
  assert.equal(state.showcaseItems[0].title, 'Original');
  action = state.updateShowcaseItem('sc1', { title: 'Changed' });
  resolveRequest({ ...item, title: 'Changed' }); await action;
  assert.equal(state.showcaseItems[0].title, 'Changed');
  action = state.reviewShowcaseItem('sc1', 'reject', undefined, 'Reason');
  assert.equal(state.showcaseItems[0].status, 'pending');
  rejectRequest(new Error('Rejected request')); await assert.rejects(action);
  assert.equal(state.showcaseItems[0].status, 'pending');
  action = state.deleteShowcaseItem('sc1');
  assert.equal(state.showcaseItems.length, 1);
  rejectRequest(new Error('Offline')); await assert.rejects(action);
  assert.equal(state.showcaseItems.length, 1);
  action = state.deleteShowcaseItem('sc1'); resolveRequest({ ok: true }); await action;
  assert.equal(state.showcaseItems.length, 0);
  assert.equal(writes, 0, 'API content must not leak into offline localStorage cache');
  console.log('UI reliability: challenge binding, learning metrics, isolated drafts and acknowledged store mutations passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
