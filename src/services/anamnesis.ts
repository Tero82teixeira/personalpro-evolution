import { loadData, saveData } from './storage';
import { createCrudService } from './supabase/crud';
import type { Anamnesis } from '../types';

export const anamnesisService = createCrudService<Anamnesis>(
  'anamnesis',
  () => loadData().anamneses,
  (anamneses) => saveData({ ...loadData(), anamneses })
);
