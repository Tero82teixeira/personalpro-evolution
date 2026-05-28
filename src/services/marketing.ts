import { loadData, saveData } from './storage';
import { createCrudService } from './supabase/crud';
import type { MarketingIdea } from '../types';

export const marketingService = createCrudService<MarketingIdea>(
  'marketing_ideas',
  () => loadData().marketingIdeas,
  (marketingIdeas) => saveData({ ...loadData(), marketingIdeas })
);
