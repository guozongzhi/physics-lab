const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const requests = { groups: [], coins: [] };
const state = { groups: [], coinTxs: [] };
const request = (domain) => {
  const result = deferred();
  requests[domain].push(result);
  return result.promise;
};
const mocks = {
  './apiClient': { apiEnabled: true },
  './apiService': {
    groupsApi: { list: () => request('groups') },
    coinsApi: { transactions: () => request('coins') },
  },
  '../store/groupStore': { useGroupStore: { setState: (next) => Object.assign(state, next) } },
  '../store/coinStore': { useCoinStore: { setState: (next) => Object.assign(state, next) } },
  '../store/questionBankStore': {}, '../store/projectStore': {},
  '../store/theoryStore': {}, '../store/safetyStore': {},
  './reviveDates': { reviveDates: (items) => items },
};
const loaded = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/bootstrap.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: loaded, Date, require: (name) => {
  assert.ok(name in mocks, `Unexpected dependency: ${name}`);
  return mocks[name];
} });
const { refreshDomainsFromApi: refresh, resetBootstrap } = loaded;

(async () => {
  const older = refresh();
  const newer = refresh();
  requests.groups[1].resolve([{ id: 'g1', totalCoins: 600 }]);
  requests.coins[1].resolve([{ id: 'new', createdAt: '2026-10-25T10:00:00Z' }]);
  await newer;
  requests.groups[0].resolve([{ id: 'g1', totalCoins: 500 }]);
  requests.coins[0].resolve([{ id: 'old', createdAt: '2026-10-25T09:00:00Z' }]);
  await older;
  assert.equal(state.groups[0].totalCoins, 600, 'Old responses must not overwrite newer balances');
  assert.equal(state.coinTxs[0].id, 'new', 'Old responses must not overwrite newer transactions');

  const groupsOnly = refresh(['groups']);
  const coinsOnly = refresh(['coins']);
  requests.coins[2].resolve([]);
  await coinsOnly;
  requests.groups[2].resolve([{ id: 'g1', totalCoins: 700 }]);
  await groupsOnly;
  assert.equal(state.groups[0].totalCoins, 700, 'Independent domains must not cancel one another');

  const beforeLogout = refresh(['groups']);
  resetBootstrap();
  requests.groups[3].resolve([{ id: 'other-account' }]);
  await beforeLogout;
  assert.equal(state.groups[0].id, 'g1', 'Session reset must invalidate pending refreshes');

  const failed = refresh();
  requests.groups[4].reject(new Error('Offline'));
  requests.coins[3].resolve([]);
  await failed;
  assert.equal(state.groups[0].totalCoins, 700, 'Failed refresh must preserve existing groups');
  console.log('Dashboard refresh: stale responses, independent domains, session reset and errors passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
