import { loadData, saveData } from './storage';
import { createCrudService } from './supabase/crud';
import type { CheckIn } from '../types';

export const checkInsService = createCrudService<CheckIn>(
  'checkins',
  () => loadData().checkIns,
  (checkIns) => saveData({ ...loadData(), checkIns })
);
