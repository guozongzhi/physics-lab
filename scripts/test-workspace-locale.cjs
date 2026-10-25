const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function environment(saved = {}, blocked = false) {
  const values = new Map(Object.entries(saved));
  const document = { documentElement: { lang: '' }, title: '' };
  const localStorage = {
    getItem(key) { if (blocked) throw Error('Storage unavailable'); return values.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw Error('Storage unavailable'); values.set(key, String(value)); },
  };
  const cache = new Map();
  function load(file) {
    const filename = path.resolve(file);
    if (cache.has(filename)) return cache.get(filename);
    const exports = {}; cache.set(filename, exports);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, { exports, document, localStorage, require: (name) => {
      if (name === 'zustand') return { create: (init) => {
        let state;
        const store = (selector) => selector(state);
        store.getState = () => state;
        state = init((patch) => { state = { ...state, ...patch }; });
        return store;
      } };
      return load(path.resolve(path.dirname(filename), name + '.ts'));
    } }, { filename });
    return exports;
  }
  return { document, values, load };
}
const env = environment();
const { translate, useLocaleStore, LOCALE_KEY } = env.load('src/i18n/useLocale.ts');
assert.equal(useLocaleStore.getState().locale, 'zh-CN');
assert.equal(env.document.documentElement.lang, 'zh-CN');
assert.equal(translate('en', '主控看板'), 'Dashboard');
assert.equal(translate('zh-CN', '主控看板'), '主控看板');
assert.equal(translate('en', '项目进度 {count}%', { count: 0 }), 'Project progress 0%');
assert.equal(translate('en', '已完成 {done}/{total} 阶段', { done: 3, total: 11 }), '3/11 stages completed');
assert.equal(translate('en', 'Unknown {value}', { value: '$&' }), 'Unknown $&');
assert.equal(translate('en', 'Unknown {value}'), 'Unknown {value}');
assert.equal(translate('en', null), '');
assert.equal(translate('en', undefined), '');
for (const text of ['我的自制作品', 'constructor', '__proto__', 'toString']) {
  assert.equal(translate('en', text), text, 'Unknown or inherited keys must remain unchanged');
}
useLocaleStore.getState().setLocale('en');
assert.equal(env.values.get(LOCALE_KEY), 'en');
assert.equal(env.document.documentElement.lang, 'en');
assert.match(env.document.title, /Physics Mission Control/);
assert.equal(environment(Object.fromEntries(env.values)).load('src/i18n/useLocale.ts').useLocaleStore.getState().locale, 'en');
assert.equal(environment({ [LOCALE_KEY]: 'invalid' }).load('src/i18n/useLocale.ts').useLocaleStore.getState().locale, 'zh-CN');
useLocaleStore.getState().setLocale('zh-CN');
assert.equal(env.document.documentElement.lang, 'zh-CN');
const blocked = environment({}, true);
const blockedStore = blocked.load('src/i18n/useLocale.ts').useLocaleStore;
blockedStore.getState().setLocale('en');
assert.equal(blockedStore.getState().locale, 'en', 'Language switching must work without local storage');
const nav = env.load('src/lib/navigationPreference.ts');
assert.equal(nav.readNavCollapsed(), false);
nav.saveNavCollapsed(true);
assert.equal(nav.readNavCollapsed(), true);
assert.equal(environment(Object.fromEntries(env.values)).load('src/lib/navigationPreference.ts').readNavCollapsed(), true);
nav.saveNavCollapsed(false);
assert.equal(nav.readNavCollapsed(), false);
const blockedNav = blocked.load('src/lib/navigationPreference.ts');
assert.equal(blockedNav.readNavCollapsed(), false);
assert.doesNotThrow(() => blockedNav.saveNavCollapsed(true));
const { english } = env.load('src/i18n/en.ts');
const placeholders = (text) => [...new Set(text.match(/\{\w+\}/g) || [])].sort();
for (const [source, target] of Object.entries(english)) {
  assert.ok(target.trim(), `Empty translation: ${source}`);
  assert.deepEqual(placeholders(target), placeholders(source), `Placeholder mismatch: ${source}`);
}
console.log(`PASS: locale persistence, interpolation, content fallback, storage failures, navigation preference; ${Object.keys(english).length} translations checked`);
