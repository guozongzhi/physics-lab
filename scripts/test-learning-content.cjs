const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const cache = new Map();
function load(file) {
  file = path.resolve(file); if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop:true } }).outputText;
  vm.runInNewContext(source, { exports, require: (name) => name.endsWith('.json') ? JSON.parse(fs.readFileSync(path.resolve(path.dirname(file), name), 'utf8')) : load(path.resolve(path.dirname(file), name + '.ts')) }, { filename: file });
  return exports;
}
const { mockTopics } = load('src/data/mockTopics.ts');
const { mockExamples } = load('src/data/mockExamples.ts');
const { getLearningExamples } = load('src/lib/learningExamples.ts');
const { getKnowledgeGuide, getRelatedQuestions } = load('src/lib/knowledgeSystem.ts');
const guides = require('../src/data/knowledgeGuides.json');
const questions = require('../backend/app/physics_questions.json');
const checks = [];
for (const topic of mockTopics) {
  for (const point of topic.outline.flatMap((chapter) => chapter.points)) {
    const examples = getLearningExamples(topic.id, point, questions);
    const publicExamples = getLearningExamples(topic.id, point, questions.map(({answer, ...q}) => q));
    assert.equal(JSON.stringify(publicExamples), JSON.stringify(examples));
    assert.ok(!JSON.stringify(publicExamples).includes('undefined'));
    assert.equal(getLearningExamples('invalid-topic', point, questions).length, 0);
    const foreign = mockTopics.find((candidate) => candidate.id !== topic.id);
    assert.equal(getLearningExamples(foreign.id, point, questions).length, 0);
    for (const example of examples) { assert.ok(example.question); assert.ok(example.answer); }
    if (topic.id === 'topic-1') for (const example of examples) assert.ok(!/库仑|电势能|电场强度/.test(JSON.stringify(example)));
    const prepared = [...mockExamples, ...require('../src/data/supplementalExamples.json')].find((example) => example.point === point);
    if (prepared) assert.equal(JSON.stringify(examples), JSON.stringify(prepared.questions));
    else assert.equal(examples.length, Math.min(2, getRelatedQuestions(topic.id, point, questions).length));
    const guide = getKnowledgeGuide(topic.id, point);
    assert.ok(guide && guide.summary.length > 30);
    assert.ok(guide.questionPoints.includes(point));
    assert.ok(getRelatedQuestions(topic.id, point, questions).every(q => q.topicId === topic.id));
    assert.equal(getRelatedQuestions(topic.id, point + '其他', questions).length, 0);
    checks.push({topicId:topic.id,topic:topic.title,chapter:topic.outline.find(c=>c.points.includes(point)).chapter,pointIndex:topic.outline.find(c=>c.points.includes(point)).points.indexOf(point)+1,point,guide:getKnowledgeGuide(topic.id,point),related:getRelatedQuestions(topic.id,point,questions),examples:examples.length,expected:examples,kind:prepared?'prepared':'question-bank'});
  }
}
assert.equal(checks.length, 104);
assert.equal(guides.length, 104);
assert.equal(new Set(guides.map(g => g.topicId + ':' + g.point)).size, 104);
assert.equal(checks.filter(c => c.topicId === 'topic-1').length, 20);
assert.ok(checks.some(c => c.point === '动量守恒定律'));
assert.ok(checks.some(c => c.point === '机械能守恒定律'));
assert.ok(getRelatedQuestions('topic-1', '匀变速直线运动规律', questions).some(q => q.knowledgePoint === '自由落体'));
assert.equal(getRelatedQuestions('topic-2', '闭合电路欧姆定律', questions).length, 0);
for (const question of questions) assert.ok(guides.some(g => g.topicId === question.topicId && g.questionPoints.includes(question.knowledgePoint)), 'Unmapped question: ' + question.id);
assert.ok(guides.filter(g => g.topicId === 'topic-7').every(g => g.level === '拓展了解'));
assert.ok(checks.every((check) => check.examples > 0));
assert.equal(getLearningExamples('topic-1', '库仑定律与电场强度', questions).length, 0);
assert.equal(getLearningExamples('topic-1', null, questions).length, 0);
console.log(JSON.stringify({passed: true, knowledgePoints: checks.length, withExamples:checks.filter(c=>c.examples).length, checks}, null, 2));
