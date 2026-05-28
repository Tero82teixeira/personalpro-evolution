import { loadData, saveData } from './storage';
import { createCrudService } from './supabase/crud';
import type { User } from '../types';

export const profilesService = createCrudService<User>(
  'profiles',
  () => loadData().users,
  (users) => saveData({ ...loadData(), users })
);
