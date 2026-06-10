import type { AppData, Anamnesis, CheckIn, Exercise, MarketingIdea, MessageTemplate, Payment, Periodization, PhysicalAssessment, Student, User, Workout, WorkoutLog } from '../types';
import { loadData, loadPersonalSettings } from './storage';
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
const exerciseMediaPrefix = 'personalpro-media:';

function decodeExerciseMedia(value: unknown) {
  const raw = String(value ?? '');
  if (!raw.startsWith(exerciseMediaPrefix)) {
    return {
      videoUrl: raw,
      imageUrl: empty,
      gifUrl: empty,
      externalVideoUrl: empty,
      mediaType: 'auto' as Exercise['mediaType']
    };
  }
  try {
    const parsed = JSON.parse(raw.slice(exerciseMediaPrefix.length)) as Partial<Exercise>;
    return {
      videoUrl: String(parsed.videoUrl ?? ''),
      imageUrl: String(parsed.imageUrl ?? ''),
      gifUrl: String(parsed.gifUrl ?? ''),
      externalVideoUrl: String(parsed.externalVideoUrl ?? ''),
      mediaType: parsed.mediaType ?? 'auto'
    };
  } catch {
    return {
      videoUrl: empty,
      imageUrl: empty,
      gifUrl: empty,
      externalVideoUrl: empty,
      mediaType: 'auto' as Exercise['mediaType']
    };
  }
}

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

function dateOnly(value: unknown) {
  return value ? String(value).slice(0, 10) : empty;
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function mapAssessmentFromSupabase(item: Record<string, any>): PhysicalAssessment {
  const assessmentDate = dateOnly(item.assessment_date ?? item.assessmentDate ?? item.date ?? item.created_at);
  return {
    id: item.id,
    studentId: item.student_id ?? item.studentId ?? item.student?.id ?? empty,
    assessmentDate,
    date: assessmentDate,
    weight: numberValue(item.weight ?? item.peso),
    height: numberValue(item.height ?? item.altura),
    bodyFat: numberValue(item.body_fat ?? item.bodyFat ?? item.gordura),
    leanMass: numberValue(item.lean_mass ?? item.leanMass),
    fatMass: numberValue(item.fat_mass ?? item.fatMass),
    abdomen: numberValue(item.abdomen),
    waist: numberValue(item.waist),
    hip: numberValue(item.hip),
    rightArm: numberValue(item.right_arm ?? item.rightArm),
    leftArm: numberValue(item.left_arm ?? item.leftArm),
    rightThigh: numberValue(item.right_thigh ?? item.rightThigh),
    leftThigh: numberValue(item.left_thigh ?? item.leftThigh),
    rightCalf: numberValue(item.right_calf ?? item.rightCalf),
    leftCalf: numberValue(item.left_calf ?? item.leftCalf),
    photos: item.photos ?? [],
    notes: item.notes ?? empty
  };
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
    workoutLogsResult,
    periodizationsResult,
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
    supabase.from('workout_logs').select('*'),
    supabase.from('periodizations').select('*'),
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
    workoutLogsResult.error,
    periodizationsResult.error,
    checkinsResult.error,
    financialResult.error,
    messagesResult.error,
    marketingResult.error
  ].find(Boolean);
  if (firstError) throw firstError;

  const exercises = ((exercisesResult.data ?? []) as Record<string, any>[]).map<Exercise>((item) => {
    const media = decodeExerciseMedia(item.video_url);
    return {
      id: item.id,
      name: item.name ?? empty,
      muscleGroup: item.muscle_group ?? empty,
      sets: item.sets ?? empty,
      reps: item.reps ?? empty,
      load: item.load ?? empty,
      rest: item.rest ?? empty,
      notes: item.technical_notes ?? empty,
      videoUrl: media.videoUrl,
      imageUrl: media.imageUrl,
      gifUrl: media.gifUrl,
      externalVideoUrl: media.externalVideoUrl,
      mediaType: media.mediaType,
      status: item.status ?? 'ativo'
    };
  });
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
    assessments: ((assessmentsResult.data ?? []) as Record<string, any>[]).map(mapAssessmentFromSupabase),
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
    workoutLogs: ((workoutLogsResult.data ?? []) as Record<string, any>[]).map<WorkoutLog>((item) => ({
      id: item.id,
      workoutId: item.workout_id,
      studentId: item.student_id,
      profileId: item.profile_id ?? undefined,
      completedAt: item.completed_at,
      status: item.status ?? 'concluido',
      notes: item.notes ?? undefined
    })),
    periodizations: ((periodizationsResult.data ?? []) as Record<string, any>[]).map<Periodization>((item) => ({
      id: item.id,
      studentId: item.student_id,
      weeks: Number(item.duration_weeks ?? 4) as Periodization['weeks'],
      phases: item.phases ?? [],
      startDate: item.created_at ? String(item.created_at).slice(0, 10) : empty,
      status: item.status ?? 'ativo',
      createdAt: item.created_at ?? empty,
      updatedAt: item.updated_at ?? undefined
    })),
    checkIns: ((checkinsResult.data ?? []) as Record<string, any>[]).map<CheckIn>((item) => {
      const checkinDate = item.checkin_date ?? item.checkinDate ?? item.date ?? empty;
      const photoUrl = item.photo_url ?? item.photoUrl ?? item.photo ?? undefined;
      return {
      id: item.id,
      studentId: item.student_id ?? item.studentId ?? item.student?.id ?? empty,
      checkinDate,
      date: checkinDate,
      trainingsDone: Number(item.trainings_done ?? item.trainingsDone ?? 0),
      food: item.food ?? empty,
      sleep: item.sleep ?? empty,
      energy: item.energy ?? empty,
      motivation: Number(item.motivation ?? 0),
      stress: Number(item.stress ?? 0),
      currentWeight: Number(item.current_weight ?? item.currentWeight ?? 0),
      difficulty: item.difficulty ?? empty,
      victory: item.victory ?? empty,
      notes: item.notes ?? empty,
      photoUrl,
      photo: photoUrl
    };
    }),
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
    })),
    personalSettings: loadPersonalSettings()
  };
}
