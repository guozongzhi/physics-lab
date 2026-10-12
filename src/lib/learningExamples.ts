import { mockExamples } from '../data/mockExamples';
import builtinQuestions from '../../backend/app/physics_questions.json';
import supplementalExamples from '../data/supplementalExamples.json';
import { mockTopics } from '../data/mockTopics';
import { getRelatedQuestions } from './knowledgeSystem';
import type { Question } from '../types';

// A point must belong to the selected topic before any example can be shown.
export function getLearningExamples(topicId: string, point: string | null, questions: Question[]) {
  if (!point || !mockTopics.find((topic) => topic.id === topicId)?.outline.some((chapter) => chapter.points.includes(point))) return [];
  const prepared = [...mockExamples, ...supplementalExamples].find((example) => example.point === point);
  if (prepared) return prepared.questions;
  return getRelatedQuestions(topicId, point, questions).slice(0, 2).map((question) => {
    // Student API hides answers. Only use the reviewed answer when content still matches exactly.
    const builtin = builtinQuestions.find((item) => item.id === question.id && item.topicId === topicId && item.stem === question.stem && JSON.stringify(item.options) === JSON.stringify(question.options));
    const answer = question.answer ?? builtin?.answer;
    return ({
      question: [question.stem, ...question.options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`)].join('\n'),
      answer: answer == null ? '请进入主题练习，提交答卷后查看参考答案。' : question.type === 'judge' ? (answer ? '正确' : '错误') :
        (Array.isArray(answer) ? answer : [answer as number]).map((index) => `${String.fromCharCode(65 + index)}. ${question.options[index]}`).join('；'),
      analysis: '',
    });
  });
}
