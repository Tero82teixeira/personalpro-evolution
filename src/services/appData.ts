import type { AppData, Anamnesis, CheckIn, Exercise, MarketingIdea, MessageTemplate, Payment, PhysicalAssessment, Student, User, Workout } from '../types';
import { loadData } from './storage';
import { requireSupabase } from './supabase/client';
import { isSupabaseConfigured } from './supabase/config';

type DbStudent = {
  id: string;
  profile_id?: string | null;
  full_name: string;
  email: string;
  phone?: string | null;
  birth_date?: string | null;
  sex?: string | null;
  goal?: string | null;
  level?: Student['level'];
  status?: Student['status'];
  plan?: string | null;
  start_date?: string | null;
  internal_notes?: string | null;
  target?: string | null;
  initial_weight?: number | null;
  current_weight?: number | null;
  avatar_url?: string | null;
};

type DbProfile = {
  id: string;
  full_name: string;
  email?: string | null;
  role: User['role'];
  avatar_url?: string | null;
};

const empty = '';

function isEmailLike(value?: string | null) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}

function pickStudentFullName(student: DbStudent, profile?: DbProfile) {
  const studentName = student.full_name?.trim() ?? '';
  const profileName = profile?.full_name?.trim() ?? '';
  if (studentName && !isEmailLike(studentName)) return studentName;
  if (profileName && !isEmailLike(profileName)) return profileName;
  return studentName || profileName || empty;
}

export async function loadAppData(currentUser?: User | null): Promise<AppData> {
  if (!isSupabaseConfigured()) return loadData();

  const supabase = requireSupabase();
  const [
    studentsResult,
    profilesResult,
    assessmentsResult,
    anamnesisResult,
    workoutsResult,
    exercisesResult,
    checkinsResult,
    financialResult,
    messagesResult,
    marketingResult
  ] = await Promise.all([
    supabase.from('students').select('*'),
    supabase.from('profiles').select('*'),
    supabase.from('assessments').select('*'),
    supabase.from('anamnesis').select('*'),
    supabase.from('workouts').select('*'),
    supabase.from('workout_exercises').select('*'),
    supabase.from('checkins').select('*'),
    supabase.from('financial_records').select('*'),
    supabase.from('message_templates').select('*'),
    supabase.from('marketing_ideas').select('*')
  ]);

  const firstError = [
    studentsResult.error,
    profilesResult.error,
    assessmentsResult.error,
    anamnesisResult.error,
    workoutsResult.error,
    exercisesResult.error,
    checkinsResult.error,
    financialResult.error,
    messagesResult.error,
    marketingResult.error
  ].find(Boolean);
  if (firstError) throw firstError;

  const exercises = ((exercisesResult.data ?? []) as Record<string, any>[]).map<Exercise>((item) => ({
    id: item.id,
    name: item.name ?? empty,
    muscleGroup: item.muscle_group ?? empty,
    sets: item.sets ?? empty,
    reps: item.reps ?? empty,
    load: item.load ?? empty,
    rest: item.rest ?? empty,
    notes: item.technical_notes ?? empty,
    videoUrl: item.video_url ?? empty,
    status: item.status ?? 'ativo'
  }));
  const rawStudents = (studentsResult.data ?? []) as DbStudent[];
  const profiles = (profilesResult.data ?? []) as DbProfile[];
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));

  return {
    users: profiles.map<User>((profile) => ({
      id: profile.id,
      name: profile.full_name,
      email: profile.email ?? (profile.id === currentUser?.id ? currentUser.email : ''),
      password: '',
      role: profile.role,
      avatar: profile.avatar_url ?? undefined,
      studentId: rawStudents.find((student) => student.profile_id === profile.id)?.id
    })),
    students: rawStudents.map<Student>((item) => {
      const profile = item.profile_id ? profilesById.get(item.profile_id) : undefined;
      return {
        id: item.id,
        profileId: item.profile_id ?? undefined,
        fullName: pickStudentFullName(item, profile),
        email: item.email,
        phone: item.phone ?? empty,
        birthDate: item.birth_date ?? empty,
        sex: item.sex ?? empty,
        goal: item.goal ?? empty,
        level: item.level ?? 'iniciante',
        status: item.status ?? 'pendente',
        plan: item.plan ?? empty,
        startDate: item.start_date ?? empty,
        notes: item.internal_notes ?? empty,
        target: item.target ?? empty,
        initialWeight: Number(item.initial_weight ?? 0),
        currentWeight: Number(item.current_weight ?? 0),
        avatar: item.avatar_url ?? undefined
      };
    }),
    assessments: ((assessmentsResult.data ?? []) as Record<string, any>[]).map<PhysicalAssessment>((item) => ({
      id: item.id,
      studentId: item.student_id,
      date: item.assessment_date,
      weight: Number(item.weight ?? 0),
      height: Number(item.height ?? 0),
      bodyFat: Number(item.body_fat ?? 0),
      leanMass: Number(item.lean_mass ?? 0),
      fatMass: Number(item.fat_mass ?? 0),
      abdomen: Number(item.abdomen ?? 0),
      waist: Number(item.waist ?? 0),
      hip: Number(item.hip ?? 0),
      rightArm: Number(item.right_arm ?? 0),
      leftArm: Number(item.left_arm ?? 0),
      rightThigh: Number(item.right_thigh ?? 0),
      leftThigh: Number(item.left_thigh ?? 0),
      rightCalf: Number(item.right_calf ?? 0),
      leftCalf: Number(item.left_calf ?? 0),
      photos: item.photos ?? [],
      notes: item.notes ?? empty
    })),
    anamneses: ((anamnesisResult.data ?? []) as Record<string, any>[]).map<Anamnesis>((item) => ({
      id: item.id,
      studentId: item.student_id,
      mainGoal: item.main_goal ?? empty,
      trainingHistory: item.training_history ?? empty,
      injuries: item.injuries ?? empty,
      medications: item.medications ?? empty,
      medicalRestrictions: item.medical_restrictions ?? empty,
      workRoutine: item.work_routine ?? empty,
      stressLevel: Number(item.stress_level ?? 0),
      sleepQuality: Number(item.sleep_quality ?? 0),
      sleepHours: Number(item.sleep_hours ?? 0),
      eatingHabits: item.eating_habits ?? empty,
      waterIntake: item.water_intake ?? empty,
      emotionalExerciseRelation: item.emotional_exercise_relation ?? empty,
      difficulties: item.difficulties ?? empty,
      demotivators: item.demotivators ?? empty,
      motivators: item.motivators ?? empty,
      weeklyAvailability: item.weekly_availability ?? empty,
      trainingLocation: item.training_location ?? empty
    })),
    workouts: ((workoutsResult.data ?? []) as Record<string, any>[]).map<Workout>((item) => ({
      id: item.id,
      studentId: item.student_id,
      name: item.name ?? empty,
      objective: item.objective ?? empty,
      level: item.level ?? 'iniciante',
      place: item.place ?? 'academia',
      estimatedDuration: item.estimated_duration ?? empty,
      weeklyFrequency: item.weekly_frequency ?? empty,
      startDate: item.start_date ?? empty,
      endDate: item.end_date ?? empty,
      notes: item.notes ?? empty,
      completed: Boolean(item.completed),
      exercises: exercises.filter((exercise) => (exercisesResult.data as Record<string, any>[]).find((raw) => raw.id === exercise.id)?.workout_id === item.id)
    })),
    periodizations: [],
    checkIns: ((checkinsResult.data ?? []) as Record<string, any>[]).map<CheckIn>((item) => ({
      id: item.id,
      studentId: item.student_id,
      date: item.checkin_date,
      trainingsDone: Number(item.trainings_done ?? 0),
      food: item.food ?? empty,
      sleep: item.sleep ?? empty,
      energy: item.energy ?? empty,
      motivation: Number(item.motivation ?? 0),
      stress: Number(item.stress ?? 0),
      currentWeight: Number(item.current_weight ?? 0),
      difficulty: item.difficulty ?? empty,
      victory: item.victory ?? empty,
      notes: item.notes ?? empty,
      photo: item.photo_url ?? undefined
    })),
    payments: ((financialResult.data ?? []) as Record<string, any>[]).map<Payment>((item) => ({
      id: item.id,
      studentId: item.student_id,
      plan: item.plan ?? empty,
      amount: Number(item.amount ?? 0),
      method: item.method ?? 'Pix',
      recurrence: item.recurrence ?? 'mensal',
      status: item.status ?? 'pendente',
      dueDate: item.due_date,
      notes: item.notes ?? empty
    })),
    messages: ((messagesResult.data ?? []) as Record<string, any>[]).map<MessageTemplate>((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      content: item.content
    })),
    marketingIdeas: ((marketingResult.data ?? []) as Record<string, any>[]).map<MarketingIdea>((item) => ({
      id: item.id,
      category: item.category,
      title: item.title,
      content: item.content
    }))
  };
}
