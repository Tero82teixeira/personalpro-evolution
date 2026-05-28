export type Role = 'admin' | 'student';
export type StudentStatus = 'ativo' | 'inativo' | 'teste' | 'pendente';
export type TrainingLevel = 'iniciante' | 'intermediario' | 'avancado';
export type TrainingPlace = 'academia' | 'casa' | 'praia' | 'funcional' | 'musculacao' | 'caminhada' | 'outro';
export type PaymentStatus = 'pago' | 'pendente' | 'atrasado';

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  studentId?: string;
  avatar?: string;
}

export interface Student {
  id: string;
  profileId?: string;
  fullName: string;
  email: string;
  phone: string;
  birthDate: string;
  sex: string;
  goal: string;
  level: TrainingLevel;
  status: StudentStatus;
  plan: string;
  startDate: string;
  notes: string;
  target: string;
  initialWeight: number;
  currentWeight: number;
  avatar?: string;
}

export interface PhysicalAssessment {
  id: string;
  studentId: string;
  date: string;
  weight: number;
  height: number;
  bodyFat: number;
  leanMass: number;
  fatMass: number;
  abdomen: number;
  waist: number;
  hip: number;
  rightArm: number;
  leftArm: number;
  rightThigh: number;
  leftThigh: number;
  rightCalf: number;
  leftCalf: number;
  photos: string[];
  notes: string;
}

export interface Anamnesis {
  id: string;
  studentId: string;
  mainGoal: string;
  trainingHistory: string;
  injuries: string;
  medications: string;
  medicalRestrictions: string;
  workRoutine: string;
  stressLevel: number;
  sleepQuality: number;
  sleepHours: number;
  eatingHabits: string;
  waterIntake: string;
  emotionalExerciseRelation: string;
  difficulties: string;
  demotivators: string;
  motivators: string;
  weeklyAvailability: string;
  trainingLocation: string;
}

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  sets: string;
  reps: string;
  load: string;
  rest: string;
  notes: string;
  videoUrl: string;
  status: 'ativo' | 'concluido';
}

export interface Workout {
  id: string;
  studentId: string;
  name: string;
  objective: string;
  level: TrainingLevel;
  place: TrainingPlace;
  estimatedDuration: string;
  weeklyFrequency: string;
  startDate: string;
  endDate: string;
  notes: string;
  exercises: Exercise[];
  completed: boolean;
}

export interface Periodization {
  id: string;
  studentId: string;
  weeks: 4 | 8 | 12;
  phases: string[];
  startDate: string;
}

export interface CheckIn {
  id: string;
  studentId: string;
  date: string;
  trainingsDone: number;
  food: string;
  sleep: string;
  energy: string;
  motivation: number;
  stress: number;
  currentWeight: number;
  difficulty: string;
  victory: string;
  notes: string;
  photo?: string;
}

export interface Payment {
  id: string;
  studentId: string;
  plan: string;
  amount: number;
  method: 'Pix' | 'cartao' | 'dinheiro';
  recurrence: 'mensal' | 'semanal' | 'trimestral' | 'avulso';
  status: PaymentStatus;
  dueDate: string;
  notes: string;
}

export interface MessageTemplate {
  id: string;
  type: string;
  title: string;
  content: string;
}

export interface MarketingIdea {
  id: string;
  category: string;
  title: string;
  content: string;
}

export interface AppData {
  users: User[];
  students: Student[];
  assessments: PhysicalAssessment[];
  anamneses: Anamnesis[];
  workouts: Workout[];
  periodizations: Periodization[];
  checkIns: CheckIn[];
  payments: Payment[];
  messages: MessageTemplate[];
  marketingIdeas: MarketingIdea[];
}
