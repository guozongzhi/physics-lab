import type { PhysicsTopic } from '../types';
import topics from '../../backend/app/physics_topics.json';

// Shared curriculum; stable topic IDs and existing chapter/point positions preserve saved progress.
export const mockTopics = topics as PhysicsTopic[];
