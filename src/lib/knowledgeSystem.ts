import guides from '../data/knowledgeGuides.json';
import type { Question } from '../types';

export function getKnowledgeGuide(topicId: string, point: string) {
  return guides.find((guide) => guide.topicId === topicId && guide.point === point);
}

export function getRelatedQuestions(topicId: string, point: string, questions: Question[]) {
  const guide = getKnowledgeGuide(topicId, point);
  if (!guide) return [];
  return questions.filter((question) => question.topicId === topicId && guide.questionPoints.includes(question.knowledgePoint));
}
