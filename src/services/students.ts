import { loadData, saveData } from './storage';
import { createCrudService } from './supabase/crud';
import type { Student } from '../types';

export const studentsService = createCrudService<Student>(
  'students',
  () => loadData().students,
  (students) => saveData({ ...loadData(), students })
);
