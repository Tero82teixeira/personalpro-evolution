import { loadData, saveData } from './storage';
import { createCrudService } from './supabase/crud';
import type { PhysicalAssessment } from '../types';

export const assessmentsService = createCrudService<PhysicalAssessment>(
  'assessments',
  () => loadData().assessments,
  (assessments) => saveData({ ...loadData(), assessments })
);
