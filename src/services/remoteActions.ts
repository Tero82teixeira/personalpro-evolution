import type { Anamnesis, CheckIn, Exercise, Payment, Periodization, PhysicalAssessment, Student, Workout, WorkoutLog } from '../types';
import { makeSafeId } from './storage';
import { requireSupabase } from './supabase/client';
import { isSupabaseConfigured } from './supabase/config';

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function numberOrZero(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

const exerciseMediaPrefix = 'personalpro-media:';

function encodeExerciseMedia(exercise: Exercise) {
  const hasMediaMeta = Boolean(exercise.imageUrl || exercise.gifUrl || exercise.externalVideoUrl || (exercise.mediaType && exercise.mediaType !== 'auto'));
  if (!hasMediaMeta) return exercise.videoUrl;
  return `${exerciseMediaPrefix}${JSON.stringify({
    videoUrl: exercise.videoUrl || '',
    imageUrl: exercise.imageUrl || '',
    gifUrl: exercise.gifUrl || '',
    externalVideoUrl: exercise.externalVideoUrl || '',
    mediaType: exercise.mediaType || 'auto'
  })}`;
}

function assessmentToRow(assessment: PhysicalAssessment) {
  return {
    ...(isUuid(assessment.id) ? { id: assessment.id } : {}),
    student_id: assessment.studentId,
    assessment_date: assessment.date || new Date().toISOString().slice(0, 10),
    weight: numberOrZero(assessment.weight),
    height: numberOrZero(assessment.height),
    body_fat: numberOrZero(assessment.bodyFat),
    lean_mass: numberOrZero(assessment.leanMass),
    fat_mass: numberOrZero(assessment.fatMass),
    abdomen: numberOrZero(assessment.abdomen),
    waist: numberOrZero(assessment.waist),
    hip: numberOrZero(assessment.hip),
    right_arm: numberOrZero(assessment.rightArm),
    left_arm: numberOrZero(assessment.leftArm),
    right_thigh: numberOrZero(assessment.rightThigh),
    left_thigh: numberOrZero(assessment.leftThigh),
    right_calf: numberOrZero(assessment.rightCalf),
    left_calf: numberOrZero(assessment.leftCalf),
    photos: assessment.photos ?? [],
    notes: assessment.notes ?? ''
  };
}

function dateOnly(value: unknown) {
  return value ? String(value).slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function mapAssessmentFromSupabase(item: Record<string, any>): PhysicalAssessment {
  const assessmentDate = dateOnly(item.assessment_date ?? item.assessmentDate ?? item.date ?? item.created_at);
  return {
    id: item.id,
    studentId: item.student_id ?? item.studentId ?? item.student?.id ?? '',
    assessmentDate,
    date: assessmentDate,
    weight: numberOrZero(item.weight ?? item.peso),
    height: numberOrZero(item.height ?? item.altura),
    bodyFat: numberOrZero(item.body_fat ?? item.bodyFat ?? item.gordura),
    leanMass: numberOrZero(item.lean_mass ?? item.leanMass),
    fatMass: numberOrZero(item.fat_mass ?? item.fatMass),
    abdomen: numberOrZero(item.abdomen),
    waist: numberOrZero(item.waist),
    hip: numberOrZero(item.hip),
    rightArm: numberOrZero(item.right_arm ?? item.rightArm),
    leftArm: numberOrZero(item.left_arm ?? item.leftArm),
    rightThigh: numberOrZero(item.right_thigh ?? item.rightThigh),
    leftThigh: numberOrZero(item.left_thigh ?? item.leftThigh),
    rightCalf: numberOrZero(item.right_calf ?? item.rightCalf),
    leftCalf: numberOrZero(item.left_calf ?? item.leftCalf),
    photos: item.photos ?? [],
    notes: item.notes ?? ''
  };
}

export async function saveStudentRemote(student: Student): Promise<string | undefined> {
  if (!isSupabaseConfigured()) return student.id;
  const fullName = student.fullName?.trim() || student.email;
  const { data, error } = await requireSupabase()
    .from('students')
    .upsert({
      ...(isUuid(student.id) ? { id: student.id } : {}),
      profile_id: student.profileId || null,
      full_name: fullName,
      email: student.email,
      phone: student.phone,
      birth_date: student.birthDate || null,
      sex: student.sex,
      goal: student.goal,
      level: student.level,
      status: student.status,
      plan: student.plan,
      start_date: student.startDate || null,
      internal_notes: student.notes,
      target: student.target,
      initial_weight: student.initialWeight,
      current_weight: student.currentWeight,
      avatar_url: student.avatar ?? null
    })
    .select()
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function saveAssessmentRemote(assessment: PhysicalAssessment): Promise<PhysicalAssessment | undefined> {
  if (!isSupabaseConfigured()) return assessment;
  const { data, error } = await requireSupabase().from('assessments').upsert(assessmentToRow(assessment)).select('*').single();
  if (error) throw error;
  return mapAssessmentFromSupabase(data as Record<string, any>);
}

export async function saveAnamnesisRemote(anamnesis: Anamnesis): Promise<string | undefined> {
  if (!isSupabaseConfigured()) return anamnesis.id;
  const { data, error } = await requireSupabase()
    .from('anamnesis')
    .upsert({
      ...(isUuid(anamnesis.id) ? { id: anamnesis.id } : {}),
      student_id: anamnesis.studentId,
      main_goal: anamnesis.mainGoal,
      training_history: anamnesis.trainingHistory,
      injuries: anamnesis.injuries,
      medications: anamnesis.medications,
      medical_restrictions: anamnesis.medicalRestrictions,
      work_routine: anamnesis.workRoutine,
      stress_level: numberOrZero(anamnesis.stressLevel),
      sleep_quality: numberOrZero(anamnesis.sleepQuality),
      sleep_hours: numberOrZero(anamnesis.sleepHours),
      eating_habits: anamnesis.eatingHabits,
      water_intake: anamnesis.waterIntake,
      emotional_exercise_relation: anamnesis.emotionalExerciseRelation,
      difficulties: anamnesis.difficulties,
      demotivators: anamnesis.demotivators,
      motivators: anamnesis.motivators,
      weekly_availability: anamnesis.weeklyAvailability,
      training_location: anamnesis.trainingLocation
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

function exerciseToRow(exercise: Exercise, workoutId: string, position: number) {
  return {
    ...(isUuid(exercise.id) ? { id: exercise.id } : {}),
    workout_id: workoutId,
    name: exercise.name,
    muscle_group: exercise.muscleGroup,
    sets: exercise.sets,
    reps: exercise.reps,
    load: exercise.load,
    rest: exercise.rest,
    technical_notes: exercise.notes,
    video_url: encodeExerciseMedia(exercise),
    status: exercise.status,
    position
  };
}

export async function saveWorkoutRemote(workout: Workout, userId?: string): Promise<string | undefined> {
  if (!isSupabaseConfigured()) return workout.id;
  const { data, error } = await requireSupabase()
    .from('workouts')
    .upsert({
      ...(isUuid(workout.id) ? { id: workout.id } : {}),
      student_id: workout.studentId,
      created_by: userId,
      name: workout.name,
      objective: workout.objective,
      level: workout.level,
      place: workout.place,
      estimated_duration: workout.estimatedDuration,
      weekly_frequency: workout.weeklyFrequency,
      start_date: workout.startDate || null,
      end_date: workout.endDate || null,
      notes: workout.notes,
      completed: workout.completed
    })
    .select('id')
    .single();
  if (error) throw error;
  const workoutId = data.id as string;
  const { error: deleteError } = await requireSupabase().from('workout_exercises').delete().eq('workout_id', workoutId);
  if (deleteError) throw deleteError;
  if (workout.exercises.length) {
    const { error: exercisesError } = await requireSupabase()
      .from('workout_exercises')
      .insert(workout.exercises.map((exercise, index) => exerciseToRow(exercise, workoutId, index)));
    if (exercisesError) throw exercisesError;
  }
  return workoutId;
}

export async function saveCheckInRemote(checkIn: CheckIn): Promise<string | undefined> {
  if (!isSupabaseConfigured()) return checkIn.id;
  const { data, error } = await requireSupabase().from('checkins').insert({
    student_id: checkIn.studentId,
    checkin_date: checkIn.date,
    trainings_done: checkIn.trainingsDone,
    food: checkIn.food,
    sleep: checkIn.sleep,
    energy: checkIn.energy,
    motivation: checkIn.motivation,
    stress: checkIn.stress,
    current_weight: checkIn.currentWeight,
    difficulty: checkIn.difficulty,
    victory: checkIn.victory,
    notes: checkIn.notes,
    photo_url: checkIn.photoUrl ?? checkIn.photo ?? null
  }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function savePaymentRemote(payment: Payment): Promise<string | undefined> {
  if (!isSupabaseConfigured()) return payment.id;
  const { data, error } = await requireSupabase()
    .from('financial_records')
    .upsert({
      ...(isUuid(payment.id) ? { id: payment.id } : {}),
      student_id: payment.studentId,
      plan: payment.plan,
      amount: numberOrZero(payment.amount),
      method: payment.method,
      recurrence: payment.recurrence,
      status: payment.status,
      due_date: payment.dueDate,
      notes: payment.notes
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function savePeriodizationRemote(periodization: Periodization): Promise<string | undefined> {
  if (!isSupabaseConfigured()) return periodization.id;
  const { data, error } = await requireSupabase()
    .from('periodizations')
    .upsert({
      ...(isUuid(periodization.id) ? { id: periodization.id } : {}),
      student_id: periodization.studentId,
      duration_weeks: periodization.weeks,
      phases: periodization.phases,
      status: periodization.status || 'ativo',
      updated_at: new Date().toISOString()
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

async function deleteById(table: string, id: string) {
  if (!isSupabaseConfigured() || !id) return;
  const { error } = await requireSupabase().from(table).delete().eq('id', id);
  if (error) throw error;
}

export async function deleteStudentRemote(studentId: string) {
  await deleteById('students', studentId);
}

export async function deleteAssessmentRemote(assessmentId: string) {
  await deleteById('assessments', assessmentId);
}

export async function deleteAnamnesisRemote(anamnesisId: string) {
  await deleteById('anamnesis', anamnesisId);
}

export async function deleteWorkoutRemote(workoutId: string) {
  await deleteById('workouts', workoutId);
}

export async function deleteCheckInRemote(checkInId: string) {
  await deleteById('checkins', checkInId);
}

export async function deletePaymentRemote(paymentId: string) {
  await deleteById('financial_records', paymentId);
}

export async function deletePeriodizationRemote(periodizationId: string) {
  await deleteById('periodizations', periodizationId);
}

export async function saveWorkoutLogRemote(workoutId: string, studentId: string, profileId?: string): Promise<WorkoutLog | undefined> {
  const completedAt = new Date().toISOString();
  const log: WorkoutLog = {
    id: makeSafeId('log'),
    workoutId,
    studentId,
    profileId,
    completedAt,
    status: 'concluido'
  };
  if (!isSupabaseConfigured()) return log;
  const { data, error } = await requireSupabase().from('workout_logs').insert({
    workout_id: workoutId,
    student_id: studentId,
    profile_id: profileId ?? null,
    completed_at: completedAt,
    status: 'concluido'
  }).select('id,workout_id,student_id,profile_id,completed_at,status,notes').single();
  if (error) throw error;
  return {
    id: data.id,
    workoutId: data.workout_id,
    studentId: data.student_id,
    profileId: data.profile_id ?? undefined,
    completedAt: data.completed_at,
    status: data.status ?? 'concluido',
    notes: data.notes ?? undefined
  };
}

export async function findStudentByEmail(email: string) {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await requireSupabase().from('students').select('id,full_name,email,profile_id').ilike('email', email.trim()).maybeSingle();
  if (error) throw error;
  return data;
}

export async function findStudentProfileByEmail(email: string) {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('id,full_name,email,role')
    .eq('role', 'student')
    .ilike('email', email.trim())
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function linkStudentProfileRemote(studentId: string, profileId: string) {
  if (!isSupabaseConfigured()) return;
  const { error } = await requireSupabase().from('students').update({ profile_id: profileId }).eq('id', studentId);
  if (error) throw error;
}

export async function createStudentAccessRemote({
  studentId,
  email,
  password,
  fullName
}: {
  studentId: string;
  email: string;
  password: string;
  fullName: string;
}): Promise<{ profileId: string; studentId: string; email: string; message?: string }> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase não configurado. A criação de acesso Auth exige Supabase.');
  }
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('Sessão não encontrada. Entre como Personal/Admin novamente.');

  const response = await fetch('/api/create-student-access', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ studentId, email, password, fullName })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(body.error || 'Não foi possível criar o acesso do aluno.'));
  }
  return body;
}
