import type { AppData } from '../types';
import { defaultPersonalSettings } from './defaultSettings';

export const seedData: AppData = {
  users: [],
  students: [],
  assessments: [],
  anamneses: [],
  workouts: [],
  workoutLogs: [],
  periodizations: [],
  checkIns: [],
  payments: [],
  messages: [],
  marketingIdeas: [],
  personalSettings: defaultPersonalSettings
};
