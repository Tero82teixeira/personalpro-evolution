import { loadData, saveData } from './storage';
import { createCrudService } from './supabase/crud';
import type { MessageTemplate } from '../types';

export const messagesService = createCrudService<MessageTemplate>(
  'message_templates',
  () => loadData().messages,
  (messages) => saveData({ ...loadData(), messages })
);
