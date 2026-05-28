import { loadData, saveData } from './storage';
import { createCrudService } from './supabase/crud';
import type { Payment } from '../types';

export const financeService = createCrudService<Payment>(
  'financial_records',
  () => loadData().payments,
  (payments) => saveData({ ...loadData(), payments })
);
