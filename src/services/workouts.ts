import { loadData, saveData } from './storage';
import { createCrudService } from './supabase/crud';
import type { Workout } from '../types';

export const workoutsService = createCrudService<Workout>(
  'workouts',
  () => loadData().workouts,
  (workouts) => saveData({ ...loadData(), workouts })
);
