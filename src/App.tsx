import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart as ReLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { defaultPersonalSettings, loadData, saveData, loadSession, makeId, savePersonalSettings } from './services/storage';
import { isSupabaseConfigured } from './services/supabase/config';
import { authService } from './services/auth';
import { loadAppData } from './services/appData';
import {
  deleteAnamnesisRemote,
  deleteAssessmentRemote,
  deleteCheckInRemote,
  deletePaymentRemote,
  deletePeriodizationRemote,
  deleteStudentRemote,
  deleteWorkoutRemote,
  createStudentAccessRemote,
  findStudentByEmail,
  findStudentProfileByEmail,
  linkStudentProfileRemote,
  saveAssessmentRemote,
  saveAnamnesisRemote,
  saveCheckInRemote,
  savePaymentRemote,
  savePeriodizationRemote,
  saveStudentRemote,
  saveWorkoutLogRemote,
  saveWorkoutRemote
} from './services/remoteActions';
import { calculateImc, daysUntil, formatCurrency, formatDate, latestAssessment, studentInitials } from './utils/metrics';
import type { Anamnesis, AppData, CheckIn, Exercise, MarketingIdea, MessageTemplate, Payment, Periodization, PeriodizationPhase, PersonalSettings, PhysicalAssessment, Student, User, Workout, WorkoutLog } from './types';

type IconProps = { size?: number; className?: string };
type IconComponent = (props: IconProps) => React.JSX.Element;

class TrainingErrorBoundary extends Component<{ componentName: string; children: ReactNode }, { error?: Error; stack?: string }> {
  state: { error?: Error; stack?: string } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro ao carregar Treinos:', error, info);
    this.setState({ error, stack: info.componentStack ?? '' });
  }

  render() {
    if (this.state.error) {
      return (
        <section className="rounded-lg border border-fitorange/40 bg-fitorange/10 p-4 text-slate-100">
          <h2 className="text-lg font-black text-fitorange">Erro ao carregar Treinos</h2>
          <p className="mt-2 text-sm">Componente: {this.props.componentName}</p>
          <p className="mt-2 text-sm">Mensagem: {this.state.error.message}</p>
          {this.state.stack && (
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-ink/70 p-3 text-xs text-slate-300">
              {this.state.stack.split('\n').slice(0, 8).join('\n')}
            </pre>
          )}
        </section>
      );
    }

    return this.props.children;
  }
}

const makeIcon = (symbol: string): IconComponent => ({ size = 18, className = '' }) => (
  <span
    className={`inline-grid place-items-center rounded text-[11px] font-black ${className}`}
    style={{ width: size, height: size, lineHeight: 1 }}
    aria-hidden="true"
  >
    {symbol}
  </span>
);

const Activity = makeIcon('A');
const BarChart3 = makeIcon('B');
const CalendarCheck = makeIcon('C');
const CreditCard = makeIcon('$');
const Dumbbell = makeIcon('D');
const LineChart = makeIcon('L');
const LogOut = makeIcon('S');
const Megaphone = makeIcon('M');
const MessageCircle = makeIcon('@');
const Plus = makeIcon('+');
const ShieldCheck = makeIcon('P');
const SettingsIcon = makeIcon('⚙');
const Sparkles = makeIcon('*');
const UserRound = makeIcon('U');
const Users = makeIcon('G');
const Menu = makeIcon('=');
const X = makeIcon('x');

type AdminTab =
  | 'dashboard'
  | 'students'
  | 'assessments'
  | 'anamnesis'
  | 'workouts'
  | 'periodization'
  | 'journey'
  | 'checkins'
  | 'evolution'
  | 'finance'
  | 'messages'
  | 'marketing'
  | 'settings';
type StudentTab = 'home' | 'workout' | 'journey' | 'evolution' | 'checkin' | 'profile';

const adminTabs: { id: AdminTab; label: string; icon: IconComponent }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'settings', label: 'Configurações', icon: SettingsIcon },
  { id: 'students', label: 'Alunos', icon: Users },
  { id: 'assessments', label: 'Avaliação', icon: Activity },
  { id: 'anamnesis', label: 'Anamnese', icon: ShieldCheck },
  { id: 'workouts', label: 'Treinos', icon: Dumbbell },
  { id: 'periodization', label: 'Periodização', icon: CalendarCheck },
  { id: 'journey', label: 'Jornada', icon: Sparkles },
  { id: 'checkins', label: 'Check-ins', icon: CalendarCheck },
  { id: 'evolution', label: 'Evolução', icon: LineChart },
  { id: 'finance', label: 'Financeiro', icon: CreditCard },
  { id: 'messages', label: 'Mensagens', icon: MessageCircle },
  { id: 'marketing', label: 'Marketing', icon: Megaphone }
];

const studentTabs: { id: StudentTab; label: string; icon: IconComponent }[] = [
  { id: 'home', label: 'Início', icon: BarChart3 },
  { id: 'workout', label: 'Treino', icon: Dumbbell },
  { id: 'journey', label: 'Jornada', icon: Sparkles },
  { id: 'evolution', label: 'Evolução', icon: LineChart },
  { id: 'checkin', label: 'Check-in', icon: CalendarCheck },
  { id: 'profile', label: 'Perfil', icon: UserRound }
];

type AiPlanId = 'basic' | 'premium' | 'pro' | 'admin-test';

type AiUsage = {
  userId: string;
  plan: AiPlanId;
  month: string;
  used: number;
  limit: number;
};

const aiPlans: Record<AiPlanId, { label: string; aiLimit: number }> = {
  basic: { label: 'Básico', aiLimit: 0 },
  premium: { label: 'Premium', aiLimit: 100 },
  pro: { label: 'Pro', aiLimit: 300 },
  'admin-test': { label: 'Admin/Teste', aiLimit: 9999 }
};

function currentAiUsageMonth() {
  return new Date().toISOString().slice(0, 7);
}

function aiUsageStorageKey(userId: string) {
  return `personalpro:ai-usage:${userId}`;
}

function normalizeAiUsage(value: Partial<AiUsage> | null | undefined, userId: string): AiUsage {
  const plan = value?.plan && aiPlans[value.plan] ? value.plan : 'admin-test';
  const month = currentAiUsageMonth();
  const used = value?.month === month ? Math.max(0, Number(value?.used ?? 0)) : 0;
  return {
    userId,
    plan,
    month,
    used,
    limit: aiPlans[plan].aiLimit
  };
}

function loadAiUsage(userId: string): AiUsage {
  if (typeof window === 'undefined') return normalizeAiUsage(null, userId);
  try {
    // Controle local para versão de teste. Para venda, migrar para Supabase.
    const parsed = JSON.parse(localStorage.getItem(aiUsageStorageKey(userId)) || 'null') as Partial<AiUsage> | null;
    const usage = normalizeAiUsage(parsed, userId);
    localStorage.setItem(aiUsageStorageKey(userId), JSON.stringify(usage));
    return usage;
  } catch (error) {
    console.error('Erro ao carregar controle local de IA:', error);
    return normalizeAiUsage(null, userId);
  }
}

function saveAiUsage(usage: AiUsage) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(aiUsageStorageKey(usage.userId), JSON.stringify(usage));
}

function getAiUsageSummary(usage: AiUsage) {
  const remaining = Math.max(0, usage.limit - usage.used);
  const progress = usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 100;
  const tone = progress >= 90 ? 'red' : progress >= 65 ? 'yellow' : 'green';
  return {
    planLabel: aiPlans[usage.plan]?.label ?? usage.plan,
    remaining,
    progress,
    tone,
    hasAvailableUsage: remaining > 0
  };
}

function incrementAiUsage(usage: AiUsage): AiUsage {
  const normalized = normalizeAiUsage(usage, usage.userId);
  if (normalized.used >= normalized.limit) return normalized;
  return { ...normalized, used: normalized.used + 1 };
}

const emptyStudent: Student = {
  id: '',
  profileId: '',
  fullName: '',
  email: '',
  phone: '',
  birthDate: '',
  sex: 'Feminino',
  goal: '',
  level: 'iniciante',
  status: 'teste',
  plan: '',
  startDate: new Date().toISOString().slice(0, 10),
  notes: '',
  target: '',
  initialWeight: 0,
  currentWeight: 0
};

function studentToForm(student?: Student): Student {
  if (!student) return { ...emptyStudent };
  return {
    ...emptyStudent,
    ...student,
    id: student.id ?? '',
    profileId: student.profileId ?? '',
    fullName: student.fullName ?? '',
    email: student.email ?? '',
    phone: student.phone ?? '',
    birthDate: student.birthDate ?? '',
    sex: student.sex ?? 'Feminino',
    goal: student.goal ?? '',
    level: student.level ?? 'iniciante',
    status: student.status ?? 'pendente',
    plan: student.plan ?? '',
    startDate: student.startDate ?? '',
    initialWeight: Number(student.initialWeight ?? 0),
    currentWeight: Number(student.currentWeight ?? 0),
    target: student.target ?? '',
    notes: student.notes ?? '',
    avatar: student.avatar
  };
}

function numberOrZero(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function parseAssessmentNumber(value: string) {
  if (value.trim() === '') return 0;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const element = document.createElement('textarea');
  element.value = text;
  element.setAttribute('readonly', '');
  element.style.position = 'fixed';
  element.style.opacity = '0';
  document.body.appendChild(element);
  element.select();
  document.execCommand('copy');
  document.body.removeChild(element);
}

function applyPersonalTemplate(
  template: string,
  variables: { personalName: string; studentName: string; brandName: string }
) {
  return template
    .split('{personalName}')
    .join(variables.personalName)
    .split('{studentName}')
    .join(variables.studentName)
    .split('{brandName}')
    .join(variables.brandName);
}

function formatDateTimeParts(value?: string) {
  if (!value) return { date: '-', time: '-' };
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat('pt-BR').format(date),
    time: new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date)
  };
}

function workoutName(data: AppData, workoutId: string) {
  return data.workouts.find((workout) => workout.id === workoutId)?.name ?? 'Treino removido';
}

function workoutLogsForStudent(data: AppData, studentId: string) {
  return data.workoutLogs.filter((log) => log.studentId === studentId).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

function daysSince(value?: string) {
  if (!value) return '-';
  const today = new Date();
  const last = new Date(value);
  return Math.max(0, Math.floor((today.getTime() - last.getTime()) / 86400000));
}

function monthWorkoutCount(logs: WorkoutLog[]) {
  const now = new Date();
  return logs.filter((log) => {
    const date = new Date(log.completedAt);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }).length;
}

function expectedMonthlyWorkouts(data: AppData, studentId: string) {
  const weeklyTotal = data.workouts
    .filter((workout) => workout.studentId === studentId)
    .reduce((sum, workout) => sum + Number(workout.weeklyFrequency.match(/\d+/)?.[0] ?? 0), 0);
  return weeklyTotal ? weeklyTotal * 4 : 12;
}

function normalizeExercise(rawExercise: unknown, index: number): Exercise {
  const source = (rawExercise && typeof rawExercise === 'object' ? rawExercise : {}) as Partial<Exercise>;
  return {
    id: String(source.id ?? `exercise-${index}`),
    name: String(source.name ?? ''),
    muscleGroup: String(source.muscleGroup ?? ''),
    sets: String(source.sets ?? ''),
    reps: String(source.reps ?? ''),
    load: String(source.load ?? ''),
    rest: String(source.rest ?? ''),
    notes: String(source.notes ?? ''),
    videoUrl: String(source.videoUrl ?? ''),
    status: source.status === 'concluido' ? 'concluido' : 'ativo'
  };
}

function safeWorkoutExercises(workout?: Workout | null) {
  const rawExercises = (workout as unknown as { exercises?: unknown } | undefined)?.exercises;
  let exercises: unknown[] = [];
  if (Array.isArray(rawExercises)) {
    exercises = rawExercises;
  } else if (typeof rawExercises === 'string' && rawExercises.trim()) {
    try {
      const parsed = JSON.parse(rawExercises);
      exercises = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Erro ao normalizar exercícios do treino:', error);
      exercises = [];
    }
  }
  return exercises.map((exercise, index) => normalizeExercise(exercise, index));
}

function normalizeWorkout(workout: Workout): Workout {
  return {
    ...workout,
    id: String(workout.id ?? ''),
    studentId: String(workout.studentId ?? ''),
    name: String(workout.name ?? ''),
    objective: String(workout.objective ?? ''),
    estimatedDuration: String(workout.estimatedDuration ?? ''),
    weeklyFrequency: String(workout.weeklyFrequency ?? ''),
    notes: String(workout.notes ?? ''),
    exercises: safeWorkoutExercises(workout)
  };
}

function planAdherence(data: AppData, student: Student, logs: WorkoutLog[]) {
  const expected = expectedMonthlyWorkouts(data, student.id);
  if (!expected) return 0;
  return Math.min(100, Math.round((monthWorkoutCount(logs) / expected) * 100));
}

function assessmentField(assessment: PhysicalAssessment, keys: string[]) {
  const source = assessment as unknown as Record<string, any>;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
  }
  return undefined;
}

function getAssessmentStudentId(assessment: PhysicalAssessment) {
  return String(assessmentField(assessment, ['studentId', 'student_id']) ?? (assessment as unknown as { student?: { id?: string } }).student?.id ?? '');
}

function getAssessmentDateValue(assessment: PhysicalAssessment) {
  return String(assessmentField(assessment, ['date', 'assessmentDate', 'assessment_date', 'createdAt', 'created_at']) ?? '');
}

function getAssessmentNumber(assessment: PhysicalAssessment, keys: string[]) {
  const value = Number(assessmentField(assessment, keys));
  return Number.isFinite(value) ? value : 0;
}

function recordField<T>(record: T, keys: string[]) {
  const source = record as unknown as Record<string, any>;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
  }
  return undefined;
}

function getWorkoutLogCompletedAt(log: WorkoutLog) {
  return String(recordField(log, ['completedAt', 'completed_at', 'date', 'createdAt', 'created_at']) ?? '');
}

function getStudentEvolutionSummary(student: Student, assessments: PhysicalAssessment[]) {
  const studentAssessments = assessments
    .filter((assessment) => getAssessmentStudentId(assessment) === student.id)
    .sort((a, b) => getAssessmentDateValue(a).localeCompare(getAssessmentDateValue(b)));
  const firstAssessment = studentAssessments[0];
  const lastAssessment = studentAssessments[studentAssessments.length - 1];
  const fallbackInitialWeight = numberOrZero(student.initialWeight);
  const fallbackCurrentWeight = numberOrZero(student.currentWeight);

  if (firstAssessment && lastAssessment) {
    return {
      initialWeight: getAssessmentNumber(firstAssessment, ['weight', 'peso']),
      currentWeight: getAssessmentNumber(lastAssessment, ['weight', 'peso']),
      initialBodyFat: getAssessmentNumber(firstAssessment, ['bodyFat', 'body_fat', 'gordura']),
      currentBodyFat: getAssessmentNumber(lastAssessment, ['bodyFat', 'body_fat', 'gordura']),
      source: 'Avaliação física',
      firstAssessment,
      lastAssessment,
      assessmentCount: studentAssessments.length,
      assessments: studentAssessments
    };
  }

  return {
    initialWeight: fallbackInitialWeight,
    currentWeight: fallbackCurrentWeight,
    initialBodyFat: 0,
    currentBodyFat: 0,
    source: 'Cadastro do aluno',
    firstAssessment: undefined,
    lastAssessment: undefined,
    assessmentCount: 0,
    assessments: studentAssessments
  };
}

function buildEvolutionChartData(summary: ReturnType<typeof getStudentEvolutionSummary>) {
  if (summary.assessmentCount) {
    return summary.assessments.map((assessment, index) => ({
      name: formatDate(getAssessmentDateValue(assessment)).slice(0, 5) || `Avaliação ${index + 1}`,
      peso: getAssessmentNumber(assessment, ['weight', 'peso']),
      gordura: getAssessmentNumber(assessment, ['bodyFat', 'body_fat', 'gordura'])
    }));
  }

  return [
    { name: 'Peso inicial', peso: summary.initialWeight, gordura: 0 },
    { name: 'Peso atual', peso: summary.currentWeight, gordura: 0 }
  ];
}

function dateKey(value?: string) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isSameDate(value?: string) {
  if (!value) return false;
  return dateKey(value) === dateKey(new Date().toISOString());
}

function getCheckInDateValue(checkIn: CheckIn) {
  return String(recordField(checkIn, ['checkinDate', 'checkin_date', 'date', 'createdAt', 'created_at']) ?? '');
}

function getCheckInPhotoUrl(checkIn: CheckIn) {
  return String(recordField(checkIn, ['photoUrl', 'photo_url', 'photo']) ?? '');
}

type IntelligentRisk = 'Baixo' | 'Médio' | 'Alto';

interface IntelligentAnalysisResult {
  risk: IntelligentRisk;
  riskBadge: string;
  headline: string;
  summary: string;
  insights: string[];
  recommendedAction: string;
  metrics: { label: string; value: string | number }[];
}

interface StudentSmartReport {
  student: Student;
  reportDate: string;
  executiveSummary: string;
  bodyEvolution: {
    initialWeight: number;
    currentWeight: number;
    weightDiff: number;
    initialBodyFat: number;
    currentBodyFat: number;
    bodyFatDiff: number;
    lastAssessment: string;
  };
  trainingConsistency: {
    totalWorkouts: number;
    monthWorkouts: number;
    latestWorkout: string;
    daysWithoutTraining: string | number;
    adherence: number;
  };
  checkinBehavior: {
    latestCheckIn: string;
    currentWeight: string | number;
    motivation: string | number;
    stress: string | number;
    sleep: string;
    food: string;
    difficulty: string;
    victory: string;
  };
  hydration: {
    goal: number;
    consumed: number;
    progress: number;
    status: string;
  };
  journey: {
    day: number;
    phase: string;
    score: number;
    activeAchievements: number;
  };
  periodization: {
    active: string;
    duration: string;
    status: string;
  };
  financial: {
    status: string;
    dueDate: string;
    summary: string;
  };
  weeklyGoals: {
    total: number;
    inProgress: number;
    completed: number;
    overdue: number;
    canceled: number;
    summary: string;
    items: { title: string; category: string; progress: number; status: WeeklyGoalStatus }[];
  };
  positives: string[];
  attentionPoints: string[];
  abandonmentRisk: IntelligentRisk;
  abandonmentRiskBadge: string;
  riskExplanation: string;
  nextAction: string;
}

function buildIntelligentAnalysis(
  data: AppData,
  student?: Student,
  waterRecords: { studentId: string; date: string; waterGoal: number; waterConsumed: number }[] = [],
  mode: 'admin' | 'student' = 'admin'
): IntelligentAnalysisResult {
  if (!student) {
    const studentsWithoutCheckIn = data.students.filter((item) => !data.checkIns.some((checkIn) => checkIn.studentId === item.id)).length;
    const inactiveStudents = data.students.filter((item) => {
      const latestLog = workoutLogsForStudent(data, item.id)[0];
      const inactiveDays = latestLog ? Number(daysSince(getWorkoutLogCompletedAt(latestLog))) : Number.POSITIVE_INFINITY;
      return inactiveDays > 7;
    }).length;
    const pendingPayments = data.payments.filter((payment) => payment.status !== 'pago').length;
    const hasEnoughData = data.students.length > 0 && (data.workoutLogs.length > 0 || data.checkIns.length > 0 || data.assessments.length > 0);

    return {
      risk: inactiveStudents > 0 || studentsWithoutCheckIn > 0 ? 'Médio' : 'Baixo',
      riskBadge: inactiveStudents > 0 || studentsWithoutCheckIn > 0 ? '🟡 Médio' : '🟢 Baixo',
      headline: hasEnoughData ? 'Visão inteligente da operação' : 'Dados ainda insuficientes para análise completa.',
      summary: hasEnoughData
        ? 'Acompanhe alunos com baixa frequência, check-ins pendentes e próximos contatos prioritários.'
        : 'Registre avaliação, treino e check-in para gerar insights mais precisos.',
      insights: hasEnoughData
        ? [
            `${inactiveStudents} aluno(s) sem treinar há mais de 7 dias.`,
            `${studentsWithoutCheckIn} aluno(s) sem check-in registrado.`,
            `${pendingPayments} pagamento(s) pendente(s) ou atrasado(s).`
          ]
        : ['Dados ainda insuficientes para análise completa.'],
      recommendedAction: inactiveStudents > 0 ? 'Enviar mensagem para alunos sem treino recente.' : 'Manter acompanhamento e reforçar check-ins semanais.',
      metrics: [
        { label: 'Alunos', value: data.students.length },
        { label: 'Treinos concluídos', value: data.workoutLogs.length },
        { label: 'Check-ins', value: data.checkIns.length },
        { label: 'Avaliações', value: data.assessments.length }
      ]
    };
  }

  const logs = workoutLogsForStudent(data, student.id);
  const latestLog = logs[0];
  const daysWithoutTraining = latestLog ? Number(daysSince(getWorkoutLogCompletedAt(latestLog))) : Number.POSITIVE_INFINITY;
  const checkIns = data.checkIns.filter((item) => item.studentId === student.id).sort((a, b) => getCheckInDateValue(b).localeCompare(getCheckInDateValue(a)));
  const latestCheckIn = checkIns[0];
  const daysWithoutCheckIn = latestCheckIn ? Number(daysSince(getCheckInDateValue(latestCheckIn))) : Number.POSITIVE_INFINITY;
  const summary = getStudentEvolutionSummary(student, data.assessments);
  const activePeriodization = data.periodizations.some((item) => item.studentId === student.id && item.status === 'ativo');
  const today = dateKey(new Date().toISOString());
  const todayWater = waterRecords.find((record) => record.studentId === student.id && record.date === today);
  const waterCompleted = Boolean(todayWater && todayWater.waterConsumed >= todayWater.waterGoal);
  const motivation = Number(latestCheckIn?.motivation ?? 0);
  const stress = Number(latestCheckIn?.stress ?? 0);
  const weightDiff = Number((summary.currentWeight - summary.initialWeight).toFixed(1));
  const bodyFatDiff = Number((summary.currentBodyFat - summary.initialBodyFat).toFixed(1));

  let riskScore = 0;
  if (!latestLog || daysWithoutTraining > 10) riskScore += 2;
  else if (daysWithoutTraining > 5) riskScore += 1;
  if (!latestCheckIn || daysWithoutCheckIn > 10) riskScore += 1;
  if (motivation && motivation <= 4) riskScore += 2;
  else if (motivation && motivation <= 6) riskScore += 1;
  if (stress >= 8) riskScore += 2;
  else if (stress >= 6) riskScore += 1;
  if (String(latestCheckIn?.sleep ?? '').toLowerCase().includes('ruim')) riskScore += 1;

  const risk: IntelligentRisk = riskScore >= 4 ? 'Alto' : riskScore >= 2 ? 'Médio' : 'Baixo';
  const riskBadge = risk === 'Alto' ? '🔴 Alto' : risk === 'Médio' ? '🟡 Médio' : '🟢 Baixo';
  const insights: string[] = [];

  if (!logs.length && !checkIns.length && !summary.assessmentCount) {
    insights.push('Dados ainda insuficientes para análise completa. Registre avaliação, treino e check-in para gerar insights mais precisos.');
  }
  if (!latestLog) insights.push('⚠️ O aluno ainda não possui treino concluído registrado.');
  else if (daysWithoutTraining > 5) insights.push('⚠️ O aluno está há alguns dias sem registrar treino. Recomenda-se contato rápido para reforçar consistência.');
  else insights.push('✅ Frequência de treino recente registrada. Mantenha o reforço positivo.');

  if (summary.assessmentCount) {
    if (weightDiff < 0) insights.push('📈 O aluno apresentou evolução positiva no peso. Reforce o progresso para manter aderência.');
    else if (weightDiff > 0) insights.push('📌 O peso atual subiu. Vale revisar objetivo, treino, rotina e alimentação.');
    else insights.push('⚖️ Peso estável nas avaliações. Continue monitorando composição e consistência.');
    if (summary.currentBodyFat && summary.initialBodyFat && bodyFatDiff < 0) insights.push('🔥 Percentual de gordura em queda. Excelente sinal de evolução corporal.');
  } else {
    insights.push('📏 Atualizar avaliação física vai melhorar a precisão da análise.');
  }

  if (latestCheckIn) {
    if (motivation && motivation <= 5) insights.push('📉 A motivação recente está baixa. Uma meta curta pode ajudar na retomada.');
    if (stress >= 7) insights.push('🧠 Estresse elevado no check-in. Ajustar carga e recuperação pode ser importante.');
    if (latestCheckIn.sleep) insights.push(`😴 Sono relatado: ${latestCheckIn.sleep}.`);
  } else {
    insights.push('📋 Solicite um check-in para entender motivação, sono, estresse e dificuldades.');
  }

  if (waterCompleted) insights.push('💧 Boa hidratação registrada hoje. Isso contribui para consistência e recuperação.');
  if (activePeriodization) insights.push('📅 Periodização ativa encontrada. Use as fases para orientar os próximos ajustes.');

  const recommendedAction =
    risk === 'Alto'
      ? 'Enviar mensagem pelo WhatsApp e alinhar uma meta simples para as próximas 24 horas.'
      : motivation && motivation <= 5
        ? 'Reforçar uma meta curta e parabenizar qualquer progresso recente.'
        : !summary.assessmentCount
          ? 'Atualizar avaliação física para melhorar o acompanhamento.'
          : !latestCheckIn
            ? 'Solicitar novo check-in semanal.'
            : waterCompleted
              ? 'Parabenizar hidratação e manter o foco no próximo treino.'
              : 'Reforçar consistência de treino, check-in e hidratação.';

  if (mode === 'student') {
    const studentInsights = [
      logs.length
        ? 'Você está construindo consistência. Continue registrando seus treinos e check-ins.'
        : 'Seu progresso começa com pequenos registros. O próximo treino já conta para sua evolução.',
      summary.assessmentCount
        ? 'Seu progresso já começou. Pequenas ações diárias vão acelerar sua evolução.'
        : 'Quando sua avaliação física for registrada, sua evolução ficará mais clara aqui.',
      waterCompleted
        ? 'Sua hidratação de hoje está concluída. Ótimo cuidado com recuperação e energia.'
        : 'Hoje sua meta é simples: registrar água, concluir o treino e responder seu check-in.'
    ];

    return {
      risk,
      riskBadge,
      headline: 'Seu assistente de evolução',
      summary: studentInsights[0],
      insights: studentInsights,
      recommendedAction: waterCompleted ? 'Mantenha o ritmo e prepare o próximo treino.' : 'Complete uma ação pequena hoje para seguir evoluindo.',
      metrics: [
        { label: 'Treinos', value: logs.length },
        { label: 'Check-ins', value: checkIns.length },
        { label: 'Avaliações', value: summary.assessmentCount },
        { label: 'Água hoje', value: waterCompleted ? 'Concluída' : 'Pendente' }
      ]
    };
  }

  return {
    risk,
    riskBadge,
    headline: risk === 'Alto' ? 'Aluno precisa de atenção rápida' : risk === 'Médio' ? 'Acompanhamento recomendado' : 'Aluno em boa condição de acompanhamento',
    summary: insights[0],
    insights,
    recommendedAction,
    metrics: [
      { label: 'Treinos concluídos', value: logs.length },
      { label: 'Dias sem treinar', value: Number.isFinite(daysWithoutTraining) ? daysWithoutTraining : 'Sem treino' },
      { label: 'Check-ins', value: checkIns.length },
      { label: 'Motivação', value: motivation ? `${motivation}/10` : 'Sem registro' }
    ]
  };
}

function buildStudentSmartReport(
  studentId: string,
  data: AppData,
  waterRecords: { studentId: string; date: string; waterGoal: number; waterConsumed: number }[] = []
): StudentSmartReport | null {
  const student = data.students.find((item) => item.id === studentId);
  if (!student) return null;

  const analysis = buildIntelligentAnalysis(data, student, waterRecords, 'admin');
  const evolution = getStudentEvolutionSummary(student, data.assessments);
  const workoutLogs = workoutLogsForStudent(data, student.id);
  const latestWorkoutLog = workoutLogs[0];
  const latestWorkoutCompletedAt = latestWorkoutLog ? getWorkoutLogCompletedAt(latestWorkoutLog) : '';
  const latestWorkoutDateTime = formatDateTimeParts(latestWorkoutCompletedAt);
  const checkIns = data.checkIns
    .filter((item) => item.studentId === student.id)
    .sort((a, b) => getCheckInDateValue(b).localeCompare(getCheckInDateValue(a)));
  const latestCheckIn = checkIns[0];
  const latestCheckInDate = latestCheckIn ? getCheckInDateValue(latestCheckIn) : '';
  const todayWater = getWaterRecord(waterRecords, student.id);
  const waterProgress = Math.min(100, Math.round((todayWater.waterConsumed / todayWater.waterGoal) * 100));
  const weeklyGoals = getStudentWeeklyGoals(loadWeeklyGoals(), student.id, data, waterRecords);
  const weeklyGoalSummary = summarizeWeeklyGoals(weeklyGoals);
  const activePeriodization = data.periodizations.find((item) => item.studentId === student.id && item.status === 'ativo');
  const payments = data.payments.filter((payment) => payment.studentId === student.id);
  const financialStatus = payments.find((payment) => payment.status === 'atrasado') ?? payments.find((payment) => payment.status === 'pendente') ?? payments[0];
  const startSource =
    dateKey(student.startDate) ||
    dateKey(String(recordField(student, ['createdAt', 'created_at']) ?? '')) ||
    (evolution.firstAssessment ? dateKey(getAssessmentDateValue(evolution.firstAssessment)) : '') ||
    dateKey(latestWorkoutCompletedAt) ||
    dateKey(latestCheckInDate);
  const startDate = startSource ? new Date(`${startSource}T00:00:00`) : undefined;
  const rawJourneyDay = startDate && !Number.isNaN(startDate.getTime()) ? Math.floor((Date.now() - startDate.getTime()) / 86400000) + 1 : 1;
  const journeyDay = Math.min(90, Math.max(1, rawJourneyDay));
  const completedWorkoutsCount = workoutLogs.length;
  const journeyScore = Math.min(100,
    (evolution.assessmentCount > 0 ? 30 : 0) +
    (completedWorkoutsCount > 0 ? 25 : 0) +
    (checkIns.length > 0 ? 20 : 0) +
    (activePeriodization ? 15 : 0) +
    (completedWorkoutsCount >= 5 ? 10 : 0) +
    (todayWater.waterConsumed >= todayWater.waterGoal ? 10 : 0)
  );
  const journeyPhase = journeyScore <= 30 ? 'Início' : journeyScore <= 60 ? 'Em evolução' : journeyScore <= 80 ? 'Consistente' : 'Transformação';
  const bodyFatDiff = Number((evolution.currentBodyFat - evolution.initialBodyFat).toFixed(1));
  const weightDiff = Number((evolution.currentWeight - evolution.initialWeight).toFixed(1));
  const positives = [
    evolution.assessmentCount ? 'Avaliação física registrada' : '',
    checkIns.length ? 'Check-in respondido' : '',
    activePeriodization ? 'Periodização ativa' : '',
    workoutLogs.length ? 'Treino concluído registrado' : '',
    todayWater.waterConsumed >= todayWater.waterGoal ? 'Meta de água batida hoje' : '',
    weeklyGoalSummary.completed ? 'Meta semanal concluída' : ''
  ].filter(Boolean);
  const attentionPoints = [
    !evolution.assessmentCount ? 'Sem avaliação física registrada' : '',
    !latestCheckIn || Number(daysSince(latestCheckInDate)) > 10 ? 'Check-in pendente ou antigo' : '',
    !latestWorkoutLog || Number(daysSince(latestWorkoutCompletedAt)) > 7 ? 'Baixa frequência recente de treinos' : '',
    todayWater.waterConsumed < todayWater.waterGoal ? 'Hidratação abaixo da meta diária' : '',
    weeklyGoalSummary.overdue || weeklyGoalSummary.inProgress ? 'Existem metas semanais pendentes ou atrasadas' : '',
    financialStatus && financialStatus.status !== 'pago' ? `Financeiro ${financialStatus.status}` : ''
  ].filter(Boolean);
  const hasEnoughData = Boolean(evolution.assessmentCount && workoutLogs.length && checkIns.length);

  return {
    student,
    reportDate: formatDate(new Date().toISOString()),
    executiveSummary: hasEnoughData
      ? `O aluno apresenta acompanhamento ativo, com ${evolution.assessmentCount ? 'avaliação física registrada' : 'avaliação pendente'} e ${checkIns.length ? 'check-ins disponíveis' : 'check-in pendente'}. A próxima ação recomendada é ${analysis.recommendedAction.toLowerCase()}`
      : 'Dados insuficientes para gerar um relatório completo. Registre avaliação, treino e check-in para uma análise mais precisa.',
    bodyEvolution: {
      initialWeight: evolution.initialWeight,
      currentWeight: evolution.currentWeight,
      weightDiff,
      initialBodyFat: evolution.initialBodyFat,
      currentBodyFat: evolution.currentBodyFat,
      bodyFatDiff,
      lastAssessment: evolution.lastAssessment ? formatDate(getAssessmentDateValue(evolution.lastAssessment)) : 'Sem registro'
    },
    trainingConsistency: {
      totalWorkouts: workoutLogs.length,
      monthWorkouts: monthWorkoutCount(workoutLogs),
      latestWorkout: latestWorkoutLog ? `${workoutName(data, latestWorkoutLog.workoutId)} - ${latestWorkoutDateTime.date}` : 'Sem registro',
      daysWithoutTraining: latestWorkoutLog ? daysSince(latestWorkoutCompletedAt) : 'Sem treino',
      adherence: planAdherence(data, student, workoutLogs)
    },
    checkinBehavior: {
      latestCheckIn: latestCheckIn ? formatDate(latestCheckInDate) : 'Sem registro',
      currentWeight: latestCheckIn?.currentWeight ?? 'Sem registro',
      motivation: latestCheckIn?.motivation ? `${latestCheckIn.motivation}/10` : 'Sem registro',
      stress: latestCheckIn?.stress ? `${latestCheckIn.stress}/10` : 'Sem registro',
      sleep: latestCheckIn?.sleep || 'Sem registro',
      food: latestCheckIn?.food || 'Sem registro',
      difficulty: latestCheckIn?.difficulty || 'Sem registro',
      victory: latestCheckIn?.victory || 'Sem registro'
    },
    hydration: {
      goal: todayWater.waterGoal,
      consumed: todayWater.waterConsumed,
      progress: waterProgress,
      status: todayWater.waterConsumed >= todayWater.waterGoal ? 'Meta batida' : 'Pendente'
    },
    journey: {
      day: journeyDay,
      phase: journeyPhase,
      score: journeyScore,
      activeAchievements: positives.length
    },
    periodization: {
      active: activePeriodization ? 'Sim' : 'Não',
      duration: activePeriodization ? `${activePeriodization.weeks} semanas` : 'Sem periodização ativa',
      status: activePeriodization?.status ?? 'Sem registro'
    },
    financial: {
      status: financialStatus?.status ?? 'Sem registro',
      dueDate: financialStatus ? formatDate(financialStatus.dueDate) : 'Sem registro',
      summary: financialStatus ? `${financialStatus.status} - ${formatCurrency(financialStatus.amount)}` : 'Sem pagamentos registrados'
    },
    weeklyGoals: {
      ...weeklyGoalSummary,
      summary: weeklyGoalSummary.total
        ? `${weeklyGoalSummary.inProgress} em andamento, ${weeklyGoalSummary.completed} concluídas e ${weeklyGoalSummary.overdue} atrasadas.`
        : 'Nenhuma meta semanal cadastrada.',
      items: weeklyGoals.slice(0, 6).map((goal) => ({
        title: goal.title,
        category: goal.category,
        progress: goal.progress,
        status: goal.status
      }))
    },
    positives: positives.length ? positives : ['Cadastro do aluno disponível'],
    attentionPoints: attentionPoints.length ? attentionPoints : ['Nenhum ponto crítico encontrado agora'],
    abandonmentRisk: analysis.risk,
    abandonmentRiskBadge: analysis.riskBadge,
    riskExplanation:
      analysis.risk === 'Alto'
        ? 'Risco alto por ausência de sinais recentes de treino, check-in ou avaliação.'
        : analysis.risk === 'Médio'
          ? 'Risco médio porque há sinais que merecem acompanhamento, como check-ins pendentes ou baixa frequência recente.'
          : 'Risco baixo porque há registros recentes suficientes para acompanhamento.',
    nextAction: analysis.recommendedAction
  };
}

function scrollToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
}

const emptyAppData: AppData = {
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

function App() {
  const [data, setData] = useState<AppData>(() => (isSupabaseConfigured() ? emptyAppData : loadData()));
  const [sessionId, setSessionId] = useState<string | null>(() => loadSession());
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'recover'>('login');
  const [toast, setToast] = useState('');
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured());
  const user = data.users.find((item) => item.id === sessionId) ?? null;

  useEffect(() => {
    if (user) scrollToTop();
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let active = true;
    authService
      .getCurrentUser()
      .then(async (currentUser) => {
        if (!active) return;
        if (currentUser) {
          setSessionId(currentUser.id);
          setData(await loadAppData(currentUser));
        }
      })
      .catch((error) => setToast(error.message))
      .finally(() => active && setAuthLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const commit = (next: AppData, message?: string) => {
    setData(next);
    if (!isSupabaseConfigured()) {
      saveData(next);
    }
    if (message) {
      setToast(message);
      window.setTimeout(() => setToast(''), 2600);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const found = await authService.signIn(email, password);
      const nextData = isSupabaseConfigured() ? await loadAppData(found) : data;
      setData({ ...nextData, users: nextData.users.some((item) => item.id === found.id) ? nextData.users : [...nextData.users, found] });
      setSessionId(found.id);
      scrollToTop();
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'E-mail ou senha inválidos.');
    }
  };

  const register = async (name: string, email: string, password: string, _role: User['role']) => {
    const accountRole: User['role'] = 'admin';
    if (isSupabaseConfigured()) {
      try {
        await authService.signUp(name, email, password, accountRole);
        setToast('Cadastro criado. Verifique seu e-mail se a confirmação estiver ativa no Supabase.');
        setAuthMode('login');
      } catch (error) {
        setToast(error instanceof Error ? error.message : 'Não foi possível cadastrar.');
      }
      return;
    }
    if (data.users.some((item) => item.email === email)) {
      setToast('Este e-mail já está cadastrado.');
      return;
    }
    const next: AppData = {
      ...data,
      users: [...data.users, { id: makeId('u'), name, email, password, role: accountRole }],
      students: data.students
    };
    commit(next, 'Cadastro criado. Você já pode entrar.');
    setAuthMode('login');
  };

  const recoverPassword = async (email: string) => {
    try {
      await authService.resetPassword(email);
      setToast(isSupabaseConfigured() ? 'E-mail de recuperação enviado.' : 'No modo local, a recuperação é apenas visual.');
      setAuthMode('login');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Não foi possível recuperar a senha.');
    }
  };

  if (authLoading) {
    return <main className="grid min-h-screen place-items-center bg-ink text-white">Carregando sessão...</main>;
  }

  if (!user) {
    return <AuthScreen mode={authMode} setMode={setAuthMode} onLogin={login} onRegister={register} onRecover={recoverPassword} toast={toast} />;
  }

  return (
    <Shell
      user={user}
      onLogout={() => {
        authService.signOut();
        setSessionId(null);
      }}
      toast={toast}
      settings={data.personalSettings}
    >
      {user.role === 'admin' ? (
        <AdminArea user={user} data={data} commit={commit} />
      ) : (
        <StudentArea user={user} data={data} commit={commit} />
      )}
    </Shell>
  );
}

function AuthScreen({
  mode,
  setMode,
  onLogin,
  onRegister,
  onRecover,
  toast
}: {
  mode: 'login' | 'register' | 'recover';
  setMode: (mode: 'login' | 'register' | 'recover') => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (name: string, email: string, password: string, role: User['role']) => Promise<void>;
  onRecover: (email: string) => Promise<void>;
  toast: string;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const title = mode === 'login' ? 'Entrar no sistema' : mode === 'register' ? 'Criar conta de Personal' : 'Recuperar senha';

  return (
    <main className="min-h-screen bg-ink text-white">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative flex min-h-[42vh] flex-col justify-between overflow-hidden px-5 py-7 sm:px-10 lg:min-h-screen lg:px-14">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(58,183,255,.28),transparent_28%),linear-gradient(140deg,#06101d_0%,#0d1726_52%,#10201d_100%)]" />
          <div className="relative z-10 flex items-center gap-3">
            <Logo />
            <span className="text-xl font-bold tracking-wide">PersonalPro Evolution</span>
          </div>
          <div className="relative z-10 max-w-2xl py-10 lg:py-0">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-fitgreen">PWA fitness premium</p>
            <h1 className="text-3xl font-black leading-tight sm:text-5xl lg:text-6xl">
              Gestão, treino e progresso no mesmo app.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
              Personal gerencia alunos, treinos, check-ins, avaliações e evolução em um só lugar.
            </p>
          </div>
        </section>
        <section className="flex items-center justify-center bg-[#091422] px-5 py-10">
          <form
            className="w-full max-w-md rounded-lg border border-line bg-panel/95 p-6 shadow-glow"
            onSubmit={(event) => {
              event.preventDefault();
              if (mode === 'recover') {
                onRecover(email);
                return;
              }
              if (mode === 'login') onLogin(email, password);
              else onRegister(name, email, password, 'admin');
            }}
          >
            <h2 className="text-2xl font-bold">{title}</h2>
            <p className="mt-2 text-sm text-slate-400">
              {mode === 'recover'
                ? 'Informe seu e-mail para receber as instruções de recuperação.'
                : mode === 'register'
                  ? 'Crie sua conta de Personal para gerenciar alunos, treinos, avaliações e relatórios.'
                  : 'Use seus dados de acesso.'}
            </p>
            {mode !== 'recover' && (
              <p className="mt-2 rounded-md border border-fitblue/25 bg-fitblue/10 px-3 py-2 text-sm text-slate-200">
                É aluno? Use o e-mail e senha enviados pelo seu Personal. Alunos recebem acesso diretamente pelo Personal.
              </p>
            )}
            {toast && <div className="mt-4 rounded-md border border-fitorange/40 bg-fitorange/10 p-3 text-sm">{toast}</div>}
            <div className="mt-6 space-y-4">
              {mode === 'register' && <Input label="Nome completo" value={name} onChange={setName} required />}
              <Input label="E-mail" type="email" value={email} onChange={setEmail} required />
              {mode !== 'recover' && <Input label="Senha" type="password" value={password} onChange={setPassword} required />}
              <button className="btn-primary w-full" type="submit">
                {mode === 'login' ? 'Entrar' : mode === 'register' ? 'Criar conta de Personal' : 'Enviar instrução'}
              </button>
            </div>
            <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm text-slate-300">
              <button type="button" onClick={() => setMode(mode === 'register' ? 'login' : 'register')}>
                {mode === 'register' ? 'Já tenho conta' : 'Criar conta de Personal'}
              </button>
              <button type="button" onClick={() => setMode(mode === 'recover' ? 'login' : 'recover')}>
                {mode === 'recover' ? 'Voltar ao login' : 'Esqueci minha senha'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

function Shell({ user, onLogout, toast, settings, children }: { user: User; onLogout: () => void; toast: string; settings: PersonalSettings; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-ink text-white">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/90 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Logo />
            <div className="min-w-0">
              <p className="truncate font-bold">{settings.brandName || defaultPersonalSettings.brandName}</p>
              <p className="truncate text-xs text-slate-400">{user.role === 'admin' ? 'Área do Personal' : settings.slogan || 'Área do Aluno'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-300 sm:inline">{user.name}</span>
            <button className="icon-btn" type="button" onClick={onLogout} title="Sair">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>
      {toast && <div className="fixed right-4 top-20 z-40 rounded-md border border-fitgreen/40 bg-fitgreen/15 px-4 py-3 text-sm">{toast}</div>}
      {children}
    </main>
  );
}

function AdminArea({ user, data, commit }: { user: User; data: AppData; commit: (data: AppData, message?: string) => void }) {
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(data.students[0]?.id ?? '');
  const [aiUsage, setAiUsage] = useState<AiUsage>(() => loadAiUsage(user.id));
  const selectedStudent = data.students.find((student) => student.id === selectedStudentId);
  const handleSelectStudent = (studentId: string) => {
    setSelectedStudentId(studentId);
  };
  useEffect(() => {
    if (selectedStudentId && !data.students.some((student) => student.id === selectedStudentId)) {
      setSelectedStudentId('');
    }
  }, [data.students, selectedStudentId]);
  useEffect(() => {
    setAiUsage(loadAiUsage(user.id));
  }, [user.id]);
  const registerAiUsage = () => {
    setAiUsage((current) => {
      const nextUsage = incrementAiUsage(current);
      saveAiUsage(nextUsage);
      return nextUsage;
    });
  };
  const selectTab = (nextTab: AdminTab) => {
    setTab(nextTab);
    setMenuOpen(false);
    scrollToTop();
  };

  return (
    <div className="mx-auto grid max-w-7xl gap-3 px-3 pb-28 pt-4 md:grid-cols-[240px_1fr] md:gap-5 md:px-6 md:py-5">
      <div className="md:hidden">
        <button className="btn-secondary w-full justify-between" onClick={() => setMenuOpen(!menuOpen)}>
          <span className="inline-flex items-center gap-2">
            <Menu size={16} /> Menu do personal
          </span>
          {menuOpen ? <X size={16} /> : <span className="text-xs text-slate-400">{adminTabs.find((item) => item.id === tab)?.label}</span>}
        </button>
      </div>
      <nav className={`scrollbar rounded-lg border border-line bg-panel p-2 md:sticky md:top-20 md:block md:h-[calc(100vh-6.5rem)] md:overflow-y-auto ${menuOpen ? 'block' : 'hidden'}`}>
        {adminTabs.map((item) => (
          <NavButton key={item.id} active={tab === item.id} icon={item.icon} label={item.label} onClick={() => selectTab(item.id)} />
        ))}
      </nav>
      <section className="min-w-0">
        {data.students.length > 0 && <StudentSelector students={data.students} value={selectedStudentId} onChange={handleSelectStudent} />}
        {tab === 'dashboard' && <AdminDashboard data={data} selectedStudentId={selectedStudentId} selectedStudent={selectedStudent} aiUsage={aiUsage} onAiUsageIncrement={registerAiUsage} />}
        {tab === 'students' && <StudentCrud data={data} selectedStudentId={selectedStudentId} selectedStudent={selectedStudent} onSelect={handleSelectStudent} commit={commit} />}
        {tab === 'assessments' && selectedStudent && <Assessments data={data} student={selectedStudent} commit={commit} />}
        {tab === 'anamnesis' && selectedStudent && <AnamnesisView data={data} student={selectedStudent} commit={commit} />}
        {tab === 'workouts' && selectedStudent && (
          <TrainingErrorBoundary key={`admin-workouts-${selectedStudent.id}`} componentName="WorkoutCrud">
            <WorkoutCrud data={data} student={selectedStudent} user={user} commit={commit} />
          </TrainingErrorBoundary>
        )}
        {tab === 'periodization' && selectedStudent && <PeriodizationView data={data} student={selectedStudent} commit={commit} />}
        {tab === 'journey' && selectedStudent && <JourneyView data={data} student={selectedStudent} canEditWater={false} />}
        {tab === 'checkins' && <CheckinsView data={data} selectedStudentId={selectedStudentId} selectedStudent={selectedStudent} commit={commit} />}
        {tab === 'evolution' && selectedStudent && <EvolutionView data={data} student={selectedStudent} />}
        {tab === 'finance' && <FinanceView data={data} student={selectedStudent} commit={commit} />}
        {tab === 'messages' && <MessagesView data={data} />}
        {tab === 'marketing' && <MarketingView data={data} />}
        {tab === 'settings' && <PersonalSettingsView data={data} commit={commit} />}
        {tab !== 'dashboard' && data.students.length === 0 && ['assessments', 'anamnesis', 'workouts', 'periodization', 'journey', 'evolution'].includes(tab) && (
          <Empty title="Base limpa" text="Cadastre um aluno para usar este módulo." />
        )}
      </section>
    </div>
  );
}

function StudentArea({ user, data, commit }: { user: User; data: AppData; commit: (data: AppData, message?: string) => void }) {
  const [tab, setTab] = useState<StudentTab>('home');
  const student = resolveStudentForUser(data, user);
  const selectTab = (nextTab: StudentTab) => {
    setTab(nextTab);
    scrollToTop();
  };
  if (!student) return <Empty title="Perfil não encontrado" text="Entre em contato com o personal." />;
  const buildPersonalWhatsAppUrl = () => {
    const settings = data.personalSettings ?? defaultPersonalSettings;
    const studentNameForMessage = studentDisplayName(student) || 'aluno';
    const personalName = settings.personalName || defaultPersonalSettings.personalName;
    const brandName = settings.brandName || defaultPersonalSettings.brandName;
    const baseTemplate =
      settings.whatsappMessage ||
      settings.whatsappMessageTemplate ||
      defaultPersonalSettings.whatsappMessage;
    const applyTemplate = (template: string) =>
      applyPersonalTemplate(template, {
        personalName,
        studentName: studentNameForMessage,
        brandName
      });
    const message = applyTemplate(baseTemplate);
    const configuredPhone = String(settings.personalWhatsApp || '').replace(/\D/g, '');
    const fallbackPhone = String(defaultPersonalSettings.personalWhatsApp).replace(/\D/g, '');
    const phone = configuredPhone || fallbackPhone;
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  };
  const whatsappUrl = buildPersonalWhatsAppUrl();

  return (
    <div className="mx-auto max-w-4xl px-3 pb-32 pt-4 sm:px-4 md:pb-24 md:pt-5">
      {tab === 'home' && <StudentDashboard data={data} student={student} />}
      {tab === 'workout' && (
        <TrainingErrorBoundary key={`student-workout-${student.id}`} componentName="StudentWorkout">
          <StudentWorkout data={data} student={student} commit={commit} />
        </TrainingErrorBoundary>
      )}
      {tab === 'journey' && <JourneyView data={data} student={student} canEditWater />}
      {tab === 'evolution' && <EvolutionView data={data} student={student} compact />}
      {tab === 'checkin' && <StudentCheckin data={data} student={student} commit={commit} />}
      {tab === 'profile' && <StudentProfile data={data} student={student} commit={commit} />}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="student-whatsapp-button"
        aria-label="Falar com o Personal pelo WhatsApp"
        title={whatsappUrl}
      >
        <span aria-hidden="true">💬</span>
        <span>Falar com o Personal</span>
      </a>
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-line bg-ink/95 px-2 py-2 backdrop-blur">
        <div className="mx-auto grid max-w-4xl grid-cols-6 gap-1">
          {studentTabs.map((item) => (
            <MobileTab key={item.id} active={tab === item.id} icon={item.icon} label={item.label} onClick={() => selectTab(item.id)} />
          ))}
        </div>
      </nav>
    </div>
  );
}

function AdminDashboard({
  data,
  selectedStudentId,
  selectedStudent,
  aiUsage,
  onAiUsageIncrement
}: {
  data: AppData;
  selectedStudentId: string;
  selectedStudent?: Student;
  aiUsage: AiUsage;
  onAiUsageIncrement: () => void;
}) {
  const [showStudentSummary, setShowStudentSummary] = useState(false);
  const [showWorkoutHistory, setShowWorkoutHistory] = useState(false);
  const [showSmartReport, setShowSmartReport] = useState(false);
  const { goals: dashboardWeeklyGoals } = useWeeklyGoalsStore();
  const [workoutHistoryFilter, setWorkoutHistoryFilter] = useState<'today' | 'week' | 'month' | 'date' | ''>('');
  const [workoutHistoryDate, setWorkoutHistoryDate] = useState('');
  const studentsWithCheckIn = new Set(data.checkIns.map((item) => item.studentId));
  const studentsWithAssessment = new Set(data.assessments.map((item) => getAssessmentStudentId(item)).filter(Boolean));
  const pendingCheckinStudents = data.students.filter((student) => !studentsWithCheckIn.has(student.id));
  const pendingPaymentItems = data.payments.filter((payment) => payment.status !== 'pago');
  const noEvolutionStudents = data.students.filter((student) => !studentsWithAssessment.has(student.id));
  const latest = data.assessments.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const now = new Date();
  const workoutsToday = data.workoutLogs.filter((log) => {
    const completedAt = getWorkoutLogCompletedAt(log);
    if (!completedAt) return false;
    const date = new Date(completedAt);
    if (Number.isNaN(date.getTime())) return false;
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  }).length;
  const monthRevenue = data.payments
    .filter((payment) => {
      const date = new Date(`${payment.dueDate}T00:00:00`);
      return payment.status === 'pago' && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    })
    .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
  const currentStudent = selectedStudent ?? data.students.find((student) => student.id === selectedStudentId);
  const selectedWorkoutLogs = selectedStudentId ? workoutLogsForStudent(data, selectedStudentId) : [];
  const selectedLatestWorkoutLog = selectedWorkoutLogs[0];
  const selectedLatestWorkoutDateTime = formatDateTimeParts(selectedLatestWorkoutLog?.completedAt);
  const selectedCheckIns = selectedStudentId ? data.checkIns.filter((checkIn) => checkIn.studentId === selectedStudentId).sort((a, b) => b.date.localeCompare(a.date)) : [];
  const selectedPayments = selectedStudentId ? data.payments.filter((payment) => payment.studentId === selectedStudentId) : [];
  const selectedPeriodization = selectedStudentId ? data.periodizations.find((periodization) => periodization.studentId === selectedStudentId && periodization.status === 'ativo') : undefined;
  const evolutionSummary = currentStudent ? getStudentEvolutionSummary(currentStudent, data.assessments) : undefined;
  const smartReportWaterRecords = loadWaterRecords();
  const smartReport = currentStudent ? buildStudentSmartReport(currentStudent.id, data, smartReportWaterRecords) : null;
  const aiUsageSummary = getAiUsageSummary(aiUsage);
  const selectedWeeklyGoals = currentStudent ? getStudentWeeklyGoals(dashboardWeeklyGoals, currentStudent.id, data, smartReportWaterRecords) : [];
  const selectedWeeklyGoalSummary = summarizeWeeklyGoals(selectedWeeklyGoals);
  const selectedAssessments = evolutionSummary?.assessments ?? [];
  const selectedFinancialStatus = selectedPayments.find((payment) => payment.status === 'atrasado') ?? selectedPayments.find((payment) => payment.status === 'pendente') ?? selectedPayments[0];
  const hasDashboardWeightData = Boolean(evolutionSummary && (evolutionSummary.initialWeight || evolutionSummary.currentWeight || evolutionSummary.assessmentCount));
  const dashboardEvolutionMetrics = evolutionSummary ? [
    { label: 'Peso inicial', value: `${evolutionSummary.initialWeight} kg`, tone: 'green' },
    { label: 'Peso atual', value: `${evolutionSummary.currentWeight} kg`, tone: 'green' },
    { label: 'Gordura inicial', value: evolutionSummary.assessmentCount ? `${evolutionSummary.initialBodyFat}%` : 'Sem registro', tone: 'blue' },
    { label: 'Gordura atual', value: evolutionSummary.assessmentCount ? `${evolutionSummary.currentBodyFat}%` : 'Sem registro', tone: 'blue' }
  ] : [];
  const selectedChart = evolutionSummary ? [
    { name: 'Peso inicial', valor: evolutionSummary.initialWeight, unidade: 'kg' },
    { name: 'Peso atual', valor: evolutionSummary.currentWeight, unidade: 'kg' },
    { name: 'Gordura inicial', valor: evolutionSummary.assessmentCount ? evolutionSummary.initialBodyFat : 0, unidade: '%' },
    { name: 'Gordura atual', valor: evolutionSummary.assessmentCount ? evolutionSummary.currentBodyFat : 0, unidade: '%' }
  ] : [];
  const selectedFilteredWorkoutLogs = selectedWorkoutLogs.filter((log) => {
    const completedAt = getWorkoutLogCompletedAt(log);
    const completedDate = dateKey(completedAt);
    if (!workoutHistoryFilter) return false;
    if (workoutHistoryFilter === 'date') return Boolean(workoutHistoryDate) && completedDate === workoutHistoryDate;
    const date = new Date(completedAt);
    if (Number.isNaN(date.getTime())) return false;
    if (workoutHistoryFilter === 'today') return isSameDate(completedAt);
    if (workoutHistoryFilter === 'week') return Date.now() - date.getTime() <= 7 * 86400000;
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });
  const hasSelectedStudentData = Boolean(
    currentStudent &&
      (selectedWorkoutLogs.length || selectedCheckIns.length || selectedPayments.length || selectedPeriodization || selectedAssessments.length || evolutionSummary?.initialWeight || evolutionSummary?.currentWeight)
  );
  const selectedHasAssessment = Boolean(evolutionSummary?.assessmentCount);
  const selectedHasRecentCheckIn = Boolean(selectedCheckIns[0] && Number(daysSince(selectedCheckIns[0].date)) <= 10);
  const selectedHasWorkout = selectedWorkoutLogs.length > 0;
  const selectedMissingSignals = [!selectedHasAssessment, !selectedHasRecentCheckIn, !selectedHasWorkout].filter(Boolean).length;
  const selectedAbandonmentRisk = selectedMissingSignals >= 3 ? '🔴 Alto' : selectedMissingSignals >= 1 ? '🟡 Médio' : '🟢 Baixo';
  const selectedStudentPhone = getStudentContactPhone(currentStudent);
  const selectedStudentWhatsAppUrl = selectedStudentPhone
    ? `https://wa.me/${selectedStudentPhone}?text=${encodeURIComponent(`Olá, ${currentStudent ? studentDisplayName(currentStudent) : 'aluno'}! Analisei sua evolução no PersonalPro Evolution e quero alinhar alguns pontos com você para a próxima semana.`)}`
    : '';
  const inactiveWorkoutAlerts = data.students
    .map((student) => {
      const latestLog = workoutLogsForStudent(data, student.id)[0];
      const inactiveDays = latestLog ? Number(daysSince(latestLog.completedAt)) : Number.POSITIVE_INFINITY;
      return { student, latestLog, inactiveDays };
    })
    .filter((item) => item.inactiveDays > 7);
  useEffect(() => {
    setShowStudentSummary(false);
    setShowWorkoutHistory(false);
    setShowSmartReport(false);
    setWorkoutHistoryFilter('');
    setWorkoutHistoryDate('');
  }, [selectedStudentId]);

  return (
    <div className="admin-dashboard">
    <Stack>
      <PageTitle title="Dashboard" subtitle="Visão rápida da operação, evolução e pendências dos alunos." />

      <Panel title="Resumo geral da operação">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          <StatCard label="Alunos ativos" value={data.students.length} icon={Users} accent="blue" />
          <StatCard label="Check-ins pendentes" value={pendingCheckinStudents.length} icon={CalendarCheck} accent="orange" />
          <StatCard label="Pagamentos pendentes" value={pendingPaymentItems.length} icon={CreditCard} accent="orange" />
          <StatCard label="Evoluções recentes" value={latest.length} icon={LineChart} accent="green" />
          <StatCard label="Treinos concluídos hoje" value={workoutsToday} icon={Dumbbell} accent="green" />
          <StatCard label="Receita do mês" value={formatCurrency(monthRevenue)} icon={CreditCard} accent="blue" />
          <div className="rounded-lg border border-fitblue/30 bg-fitblue/10 p-4 shadow-[0_16px_36px_rgba(14,165,233,0.12)]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-black text-white">🤖 Uso de IA</p>
              <span className="rounded-full border border-line bg-ink/55 px-2 py-1 text-[11px] font-black text-slate-200">{aiUsageSummary.planLabel}</span>
            </div>
            <p className="mt-3 text-2xl font-black text-white">{aiUsage.used} / {aiUsage.limit}</p>
            <p className="mt-1 text-sm text-slate-300">{aiUsageSummary.remaining} restantes em {aiUsage.month}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/70">
              <div
                className={`h-full rounded-full transition-all ${
                  aiUsageSummary.tone === 'red' ? 'bg-red-400' : aiUsageSummary.tone === 'yellow' ? 'bg-yellow-300' : 'bg-fitgreen'
                }`}
                style={{ width: `${aiUsageSummary.progress}%` }}
              />
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Resumo do aluno selecionado">
        {currentStudent ? (
          <Stack>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <InfoBox label="Nome do aluno" value={studentDisplayName(currentStudent)} />
              <InfoBox label="Peso atual" value={`${evolutionSummary?.currentWeight ?? 0} kg`} />
              <InfoBox label="Último treino" value={selectedLatestWorkoutLog ? workoutName(data, selectedLatestWorkoutLog.workoutId) : 'Sem registros'} />
              <InfoBox label="Aderência" value={`${planAdherence(data, currentStudent, selectedWorkoutLogs)}%`} />
            </div>
            <button className="btn-secondary w-full sm:w-auto" onClick={() => setShowStudentSummary(!showStudentSummary)}>
              {showStudentSummary ? 'Ocultar resumo' : 'Ver resumo do aluno'}
            </button>

            <Panel title="🤖 Análise Inteligente do Aluno">
              <div className="rounded-xl border border-fitblue/40 bg-[linear-gradient(135deg,rgba(56,189,248,.14),rgba(34,197,94,.08),rgba(13,23,38,.94))] p-4 shadow-[0_18px_44px_rgba(14,165,233,0.14)]">
                <p className="text-sm font-semibold text-slate-300">Leitura automática dos dados recentes do aluno selecionado.</p>
                <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_.9fr]">
                  <div className="space-y-3">
                    <div className="rounded-lg border border-fitblue/25 bg-fitblue/10 p-3">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-fitblue">Status geral</p>
                      <p className="mt-2 text-base font-semibold text-white">Aluno em acompanhamento ativo.</p>
                    </div>
                    <div className="rounded-lg border border-line bg-ink/45 p-3">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Risco de abandono</p>
                      <p className="mt-2 text-2xl font-black text-white">{selectedAbandonmentRisk}</p>
                    </div>
                    <div className="rounded-lg border border-fitgreen/30 bg-fitgreen/10 p-3">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-fitgreen">Próxima ação recomendada</p>
                      <p className="mt-2 text-sm leading-6 text-slate-100">Enviar mensagem de incentivo e reforçar a meta da semana.</p>
                      {selectedStudentWhatsAppUrl ? (
                        <a className="btn-secondary mt-3 w-full sm:w-auto" href={selectedStudentWhatsAppUrl} target="_blank" rel="noopener noreferrer">
                          💬 Enviar mensagem para o aluno
                        </a>
                      ) : (
                        <p className="mt-3 rounded-md border border-line bg-ink/50 px-3 py-2 text-sm font-semibold text-slate-300">Telefone do aluno não cadastrado</p>
                      )}
                      <button className="btn-primary mt-3 w-full sm:w-auto" onClick={() => setShowSmartReport(!showSmartReport)}>
                        {showSmartReport ? 'Ocultar relatório inteligente' : '📊 Ver relatório inteligente'}
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1">
                    <div className="rounded-lg border border-fitgreen/25 bg-fitgreen/10 p-3">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-fitgreen">Pontos positivos</p>
                      <div className="mt-3 space-y-2 text-sm leading-6 text-slate-200">
                        <p>{selectedHasAssessment ? '✅ Avaliação física registrada' : '✅ Cadastro do aluno disponível'}</p>
                        <p>{selectedHasRecentCheckIn ? '✅ Check-in respondido recentemente' : '✅ Acompanhamento pronto para receber check-ins'}</p>
                        <p>{selectedPeriodization ? '✅ Periodização ativa' : '✅ Plano pode ser estruturado por periodização'}</p>
                        <p>{selectedWeeklyGoalSummary.completed ? '✅ Meta semanal concluída' : '✅ Metas semanais prontas para acompanhamento'}</p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-fitorange/25 bg-fitorange/10 p-3">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-fitorange">Pontos de atenção</p>
                      <div className="mt-3 space-y-2 text-sm leading-6 text-slate-200">
                        <p>{selectedHasWorkout ? '⚠️ Verificar frequência de treino' : '⚠️ Nenhum treino concluído registrado'}</p>
                        <p>{selectedHasRecentCheckIn ? '⚠️ Acompanhar hidratação' : '⚠️ Aluno está sem check-in recente'}</p>
                        {(selectedWeeklyGoalSummary.inProgress || selectedWeeklyGoalSummary.overdue) ? <p>⚠️ Existem metas semanais pendentes ou atrasadas.</p> : null}
                        {!selectedHasAssessment && <p>⚠️ Aluno ainda não possui avaliação física registrada.</p>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Panel>

            <WeeklyGoalsAdminCard data={data} student={currentStudent} waterRecords={smartReportWaterRecords} />

            {showSmartReport && smartReport && <StudentSmartReportPanel report={smartReport} settings={data.personalSettings} aiUsage={aiUsage} onAiUsageIncrement={onAiUsageIncrement} />}

            {showStudentSummary && (
              <Stack>
                {!hasSelectedStudentData && <Empty title="Este aluno ainda não possui dados suficientes." text="Registre treinos, check-ins, pagamentos ou periodização para enriquecer o resumo." />}
                <div className="grid grid-cols-2 gap-2 md:gap-3 xl:grid-cols-4">
                  <InfoBox label="Nome do aluno" value={studentDisplayName(currentStudent)} />
                  <InfoBox label="Peso inicial" value={`${evolutionSummary?.initialWeight ?? 0} kg`} />
                  <InfoBox label="Peso atual" value={`${evolutionSummary?.currentWeight ?? 0} kg`} />
                  <InfoBox label="Gordura inicial" value={evolutionSummary?.assessmentCount ? `${evolutionSummary.initialBodyFat}%` : 'Sem registro'} />
                  <InfoBox label="Gordura atual" value={evolutionSummary?.assessmentCount ? `${evolutionSummary.currentBodyFat}%` : 'Sem registro'} />
                  <InfoBox label="Fonte dos dados" value={evolutionSummary?.source ?? '-'} />
                  <InfoBox label="Último treino realizado" value={selectedLatestWorkoutLog ? workoutName(data, selectedLatestWorkoutLog.workoutId) : 'Sem registros'} />
                  <InfoBox label="Data do último treino" value={selectedLatestWorkoutLog ? selectedLatestWorkoutDateTime.date : 'Sem registros'} />
                  <InfoBox label="Hora do último treino" value={selectedLatestWorkoutLog ? selectedLatestWorkoutDateTime.time : 'Sem registros'} />
                  <InfoBox label="Dias sem treinar" value={selectedLatestWorkoutLog ? `${daysSince(selectedLatestWorkoutLog.completedAt)} dias` : 'Sem registros'} />
                  <InfoBox label="Treinos concluídos no mês" value={monthWorkoutCount(selectedWorkoutLogs)} />
                  <InfoBox label="Aderência ao plano" value={`${planAdherence(data, currentStudent, selectedWorkoutLogs)}%`} />
                  <InfoBox label="Último check-in" value={selectedCheckIns[0] ? formatDate(selectedCheckIns[0].date) : 'Sem registros'} />
                  <InfoBox label="Status financeiro" value={selectedFinancialStatus ? `${selectedFinancialStatus.status} - ${formatDate(selectedFinancialStatus.dueDate)}` : 'Sem registro'} />
                  <InfoBox label="Periodização ativa" value={selectedPeriodization ? `${selectedPeriodization.weeks} semanas` : 'Sem periodização ativa'} />
                </div>

                <Panel title="Peso e gordura do aluno">
                  <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                    {dashboardEvolutionMetrics.map((metric) => (
                      <div key={metric.label} className={`rounded-lg border p-3 ${metric.tone === 'green' ? 'border-fitgreen/35 bg-fitgreen/10' : 'border-fitblue/35 bg-fitblue/10'}`}>
                        <p className="text-sm font-semibold text-slate-300 md:text-xs md:uppercase md:tracking-[0.14em]">{metric.label}</p>
                        <p className="mt-1 text-2xl font-black text-white md:text-xl">{metric.value}</p>
                      </div>
                    ))}
                  </div>
                  {hasDashboardWeightData ? (
                    <div className="h-56 md:h-60">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={selectedChart} layout="vertical" margin={{ top: 8, right: 16, left: 12, bottom: 8 }}>
                          <CartesianGrid stroke="#1d2b3d" />
                          <XAxis type="number" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                          <YAxis dataKey="name" type="category" stroke="#cbd5e1" width={108} tick={{ fontSize: 13, fontWeight: 700 }} />
                          <Tooltip
                            formatter={(value, _name, item) => [`${value} ${(item.payload as { unidade?: string }).unidade ?? ''}`, item.payload.name]}
                            contentStyle={{ background: '#0d1726', border: '1px solid #1d2b3d' }}
                          />
                          <Bar dataKey="valor" name="Valor" fill="#38bdf8" radius={[0, 6, 6, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <Empty title="Este aluno ainda não possui dados de peso registrados." text="Informe peso no cadastro ou registre uma avaliação física." />}
                </Panel>

                <Panel title="Histórico de treinos realizados">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <InfoBox label="Total concluído" value={selectedWorkoutLogs.length} />
                    <InfoBox label="Último treino" value={selectedLatestWorkoutLog ? workoutName(data, selectedLatestWorkoutLog.workoutId) : 'Sem registros'} />
                    <InfoBox label="Data do último treino" value={selectedLatestWorkoutLog ? selectedLatestWorkoutDateTime.date : 'Sem registros'} />
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-4">
                    <button className={`btn-secondary ${workoutHistoryFilter === 'today' ? '!border-fitblue !bg-fitblue/15' : ''}`} onClick={() => { setWorkoutHistoryFilter('today'); setShowWorkoutHistory(true); }}>Hoje</button>
                    <button className={`btn-secondary ${workoutHistoryFilter === 'week' ? '!border-fitblue !bg-fitblue/15' : ''}`} onClick={() => { setWorkoutHistoryFilter('week'); setShowWorkoutHistory(true); }}>Últimos 7 dias</button>
                    <button className={`btn-secondary ${workoutHistoryFilter === 'month' ? '!border-fitblue !bg-fitblue/15' : ''}`} onClick={() => { setWorkoutHistoryFilter('month'); setShowWorkoutHistory(true); }}>Este mês</button>
                    <Input label="Escolher data" type="date" value={workoutHistoryDate} onChange={(value) => { setWorkoutHistoryDate(value); setWorkoutHistoryFilter('date'); setShowWorkoutHistory(true); }} />
                  </div>
                  <button className="btn-secondary mt-3 w-full sm:w-auto" onClick={() => setShowWorkoutHistory(!showWorkoutHistory)}>
                    {showWorkoutHistory ? 'Ocultar histórico' : 'Ver histórico'}
                  </button>
                  {showWorkoutHistory ? (
                    workoutHistoryFilter ? (
                      <WorkoutLogHistory data={data} logs={selectedFilteredWorkoutLogs} showStudent={false} emptyText="Nenhum treino encontrado para o período selecionado." compactLimit={3} />
                    ) : (
                      <Empty title="Selecione um período para visualizar os treinos." text="Use os filtros acima para abrir o histórico do aluno." />
                    )
                  ) : null}
                </Panel>
              </Stack>
            )}
          </Stack>
        ) : (
          <Stack>
            <Empty title="Nenhum aluno selecionado" text="Selecione um aluno no seletor superior para ver o resumo individual." />
            <Panel title="🤖 Análise Inteligente Geral">
              <div className="rounded-xl border border-fitblue/40 bg-[linear-gradient(135deg,rgba(56,189,248,.14),rgba(13,23,38,.94))] p-4">
                <p className="text-sm font-semibold text-slate-300">Leitura automática dos dados recentes do aluno selecionado.</p>
                <p className="mt-3 text-base font-semibold text-white">Selecione um aluno para visualizar a análise inteligente.</p>
                <button className="btn-primary mt-3 w-full cursor-not-allowed opacity-60 sm:w-auto" disabled>📊 Ver relatório inteligente</button>
              </div>
            </Panel>
          </Stack>
        )}
      </Panel>

      <Panel title="Alertas gerais">
        <div className="grid gap-3 lg:grid-cols-2">
          <DashboardAlertList
            title="Alunos sem evolução registrada"
            items={noEvolutionStudents.map((student) => ({ name: studentDisplayName(student), reason: 'Sem avaliação física registrada', date: 'Sem registro' }))}
            empty="Todos possuem avaliação."
            tone="blue"
          />
          <DashboardAlertList
            title="Alunos com check-in pendente"
            items={pendingCheckinStudents.map((student) => ({ name: studentDisplayName(student), reason: 'Check-in pendente', date: 'Sem check-in registrado' }))}
            empty="Todos responderam check-in."
            tone="orange"
          />
          <DashboardAlertList
            title="Alunos com pagamento pendente"
            items={pendingPaymentItems.map((payment) => ({ name: studentName(data, payment.studentId), reason: `Pagamento ${payment.status}`, date: formatDate(payment.dueDate) }))}
            empty="Sem cobranças pendentes."
            tone="green"
          />
          <DashboardAlertList
            title="Alunos sem treinar há mais de 7 dias"
            items={inactiveWorkoutAlerts.map(({ student, latestLog }) => ({
              name: studentDisplayName(student),
              reason: latestLog ? `Sem treinar há ${daysSince(latestLog.completedAt)} dias` : 'Nenhum treino concluído',
              date: latestLog ? formatDateTimeParts(latestLog.completedAt).date : 'Sem registro'
            }))}
            empty="Todos treinaram nos últimos 7 dias."
            tone="orange"
          />
        </div>
      </Panel>

    </Stack>
    </div>
  );
}

function IntelligentAnalysisCard({
  data,
  student,
  mode,
  waterRecords = []
}: {
  data: AppData;
  student?: Student;
  mode: 'admin' | 'student';
  waterRecords?: { studentId: string; date: string; waterGoal: number; waterConsumed: number }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const analysis = buildIntelligentAnalysis(data, student, waterRecords, mode);
  const positiveInsights = analysis.insights.filter((insight) => /✅|📈|🔥|💧|📅|⚖️|frequência|Periodização ativa|Boa hidratação/i.test(insight));
  const attentionInsights = analysis.insights.filter((insight) => !positiveInsights.includes(insight));
  const visiblePositiveInsights = expanded ? positiveInsights : positiveInsights.slice(0, 3);
  const visibleAttentionInsights = expanded ? attentionInsights : attentionInsights.slice(0, 3);
  const riskClass =
    analysis.risk === 'Alto'
      ? 'border-red-400/40 bg-red-500/10 text-red-200'
      : analysis.risk === 'Médio'
        ? 'border-yellow-400/40 bg-yellow-500/10 text-yellow-100'
        : 'border-fitgreen/40 bg-fitgreen/10 text-fitgreen';
  const cleanPhone = String(student?.phone || '').replace(/\D/g, '');
  const whatsappUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Olá, ${studentDisplayName(student)}! Passando para acompanhar sua evolução no PersonalPro Evolution.`)}`
    : '';

  if (!student) {
    return (
      <Panel title="🤖 Análise Inteligente Geral">
        <div className="rounded-xl border border-fitblue/30 bg-[linear-gradient(135deg,rgba(56,189,248,.12),rgba(13,23,38,.92))] p-4">
          <p className="text-lg font-black text-white">Selecione um aluno para visualizar a análise inteligente individual.</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">A análise usa avaliações, treinos, check-ins, água e periodização do aluno selecionado no Dashboard.</p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="🤖 Análise Inteligente do Aluno" action={<Badge label={`Risco: ${analysis.riskBadge}`} />}>
      <div className="rounded-xl border border-fitblue/30 bg-[linear-gradient(135deg,rgba(56,189,248,.12),rgba(34,197,94,.08),rgba(13,23,38,.92))] p-4 shadow-[0_18px_48px_rgba(14,165,233,0.12)]">
        <p className="mb-4 text-sm font-semibold text-slate-300">Leitura automática dos dados recentes do aluno selecionado.</p>
        <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${riskClass}`}>
                {analysis.riskBadge}
              </span>
              <span className="rounded-full border border-line bg-ink/50 px-3 py-1 text-xs font-semibold text-slate-300">{studentDisplayName(student)}</span>
            </div>
            <p className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-fitblue">Status geral</p>
            <h3 className="mt-2 text-xl font-black text-white sm:text-2xl">{analysis.headline}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300 sm:text-base">{analysis.summary}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-fitgreen/25 bg-fitgreen/10 p-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-fitgreen">Pontos positivos</p>
                <div className="mt-3 space-y-2">
                  {(visiblePositiveInsights.length ? visiblePositiveInsights : ['✅ Existem dados para iniciar o acompanhamento.']).map((insight) => (
                    <p key={insight} className="text-sm leading-6 text-slate-200">{insight}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-fitorange/25 bg-fitorange/10 p-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-fitorange">Pontos de atenção</p>
                <div className="mt-3 space-y-2">
                  {(visibleAttentionInsights.length ? visibleAttentionInsights : ['Nenhum ponto crítico encontrado agora.']).map((insight) => (
                    <p key={insight} className="text-sm leading-6 text-slate-200">{insight}</p>
                  ))}
                </div>
              </div>
            </div>
            {analysis.insights.length > 6 && (
              <button className="btn-secondary mt-3 w-full sm:w-auto" onClick={() => setExpanded(!expanded)}>
                {expanded ? 'Ocultar análise completa' : 'Ver análise completa'}
              </button>
            )}
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {analysis.metrics.map((metric) => (
                <InfoBox key={metric.label} label={metric.label} value={metric.value} />
              ))}
            </div>
            <div className="rounded-lg border border-fitgreen/30 bg-fitgreen/10 p-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-fitgreen">Próxima ação recomendada</p>
              <p className="mt-2 text-sm leading-6 text-slate-100">{analysis.recommendedAction}</p>
              {whatsappUrl && (
                <a className="btn-secondary mt-3 w-full" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                  💬 Chamar no WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function StudentSmartReportPanel({
  report,
  settings,
  aiUsage,
  onAiUsageIncrement
}: {
  report: StudentSmartReport;
  settings?: PersonalSettings;
  aiUsage: AiUsage;
  onAiUsageIncrement: () => void;
}) {
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const aiUsageSummary = getAiUsageSummary(aiUsage);
  const studentPhone = getStudentContactPhone(report.student);
  const whatsappUrl = studentPhone
    ? `https://wa.me/${studentPhone}?text=${encodeURIComponent(`Olá, ${studentDisplayName(report.student)}! Analisei sua evolução no PersonalPro Evolution e quero alinhar alguns pontos com você para a próxima semana.`)}`
    : '';
  const weightDiffText = `${report.bodyEvolution.weightDiff > 0 ? '+' : ''}${report.bodyEvolution.weightDiff} kg`;
  const bodyFatDiffText = `${report.bodyEvolution.bodyFatDiff > 0 ? '+' : ''}${report.bodyEvolution.bodyFatDiff}%`;

  const generateAiStudentReport = async () => {
    if (!aiUsageSummary.hasAvailableUsage) {
      setAiError('Limite de análises com IA atingido para este mês.');
      return;
    }
    setAiLoading(true);
    setAiError('');
    try {
      const payload = buildAiStudentReportPayload(report);
      console.log('Gerando análise IA', { studentName: studentDisplayName(report.student), hasPayload: Boolean(payload) });
      const response = await fetch('/api/generate-student-ai-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        throw new Error(
          window.location.port === '5173'
            ? 'Para testar IA localmente, use npx vercel dev.'
            : 'Rota de IA não encontrada. Rode com npx vercel dev ou configure a Vercel.'
        );
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.analysis) {
        const errorMessage = String(result.error || '');
        if (response.status === 404) {
          throw new Error('Rota de IA não encontrada. Rode com npx vercel dev ou configure a Vercel.');
        }
        if (errorMessage.toLowerCase().includes('openai_api_key')) {
          throw new Error('OPENAI_API_KEY não configurada no ambiente.');
        }
        if (response.status >= 500 || response.status === 401 || response.status === 403 || response.status === 429) {
          throw new Error(errorMessage || 'Erro ao gerar análise com IA. Verifique sua chave ou saldo da API.');
        }
        throw new Error(errorMessage || 'Erro ao gerar análise com IA. Verifique sua chave ou saldo da API.');
      }
      setAiAnalysis(String(result.analysis));
      onAiUsageIncrement();
    } catch (error) {
      console.error('Erro ao gerar análise com IA:', error);
      setAiError(error instanceof Error ? error.message : 'Erro ao gerar análise com IA. Verifique sua chave ou saldo da API.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <Panel title="📊 Relatório Inteligente do Aluno" action={<Badge label={report.abandonmentRiskBadge} />}>
      <div className="space-y-4 rounded-xl border border-fitblue/35 bg-[linear-gradient(135deg,rgba(56,189,248,.1),rgba(13,23,38,.96))] p-4 shadow-[0_18px_44px_rgba(14,165,233,0.12)]">
        <div>
          <p className="text-sm font-semibold text-slate-300">Resumo profissional da evolução, consistência e pontos de atenção.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <InfoBox label="Aluno" value={studentDisplayName(report.student)} />
            <InfoBox label="Data do relatório" value={report.reportDate} />
            <InfoBox label="Status geral" value={report.student.status} />
            <InfoBox label="Risco de abandono" value={report.abandonmentRiskBadge} />
            <InfoBox label="Próxima ação" value={report.nextAction} />
          </div>
          <button className="btn-primary mt-4 w-full sm:w-auto" onClick={() => openStudentSmartReportPrint(report, settings)}>
            📄 Exportar PDF
          </button>
        </div>

        <div className="rounded-lg border border-fitblue/25 bg-fitblue/10 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-fitblue">🤖 Análise profissional gerada por IA</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {aiAnalysis
                  ? 'Análise personalizada gerada com base nos dados resumidos do aluno selecionado.'
                  : 'Clique em Gerar análise com IA para criar uma leitura profissional personalizada.'}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:min-w-[220px]">
              <div className="rounded-lg border border-line bg-ink/50 p-3 text-sm text-slate-200">
                <p className="font-semibold text-white">IA disponível</p>
                <p className="mt-1">{aiUsageSummary.remaining} análises restantes este mês</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel">
                  <div
                    className={`h-full rounded-full transition-all ${
                      aiUsageSummary.tone === 'red' ? 'bg-red-400' : aiUsageSummary.tone === 'yellow' ? 'bg-yellow-300' : 'bg-fitgreen'
                    }`}
                    style={{ width: `${aiUsageSummary.progress}%` }}
                  />
                </div>
              </div>
              <button className="btn-primary w-full" onClick={generateAiStudentReport} disabled={aiLoading || !aiUsageSummary.hasAvailableUsage}>
                {aiLoading ? 'Gerando análise com IA...' : '🤖 Gerar análise com IA'}
              </button>
              {!aiUsageSummary.hasAvailableUsage && (
                <p className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm font-semibold text-red-200">
                  Limite de análises com IA atingido para este mês.
                </p>
              )}
              <button className="btn-secondary w-full" onClick={() => { setAiAnalysis(''); setAiError(''); }} disabled={aiLoading || (!aiAnalysis && !aiError)}>
                Limpar análise de IA
              </button>
            </div>
          </div>
          {aiLoading && <p className="mt-4 rounded-lg border border-fitblue/20 bg-ink/50 p-3 text-sm font-semibold text-fitblue">Gerando análise com IA...</p>}
          {aiError && <p className="mt-4 rounded-lg border border-fitorange/30 bg-fitorange/10 p-3 text-sm font-semibold text-fitorange">{aiError}</p>}
          {aiAnalysis && (
            <div className="mt-4 whitespace-pre-wrap rounded-xl border border-line bg-ink/55 p-4 text-sm leading-7 text-slate-100">
              {aiAnalysis}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-fitblue/25 bg-fitblue/10 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-fitblue">Resumo executivo</p>
          <p className="mt-2 text-sm leading-6 text-slate-100">{report.executiveSummary}</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">{report.riskExplanation}</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-line bg-ink/45 p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fitgreen">Evolução corporal</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <InfoBox label="Peso inicial" value={`${report.bodyEvolution.initialWeight} kg`} />
              <InfoBox label="Peso atual" value={`${report.bodyEvolution.currentWeight} kg`} />
              <InfoBox label="Diferença de peso" value={weightDiffText} />
              <InfoBox label="Última avaliação" value={report.bodyEvolution.lastAssessment} />
              <InfoBox label="Gordura inicial" value={report.bodyEvolution.initialBodyFat ? `${report.bodyEvolution.initialBodyFat}%` : 'Sem registro'} />
              <InfoBox label="Gordura atual" value={report.bodyEvolution.currentBodyFat ? `${report.bodyEvolution.currentBodyFat}%` : 'Sem registro'} />
              <InfoBox label="Diferença de gordura" value={report.bodyEvolution.initialBodyFat || report.bodyEvolution.currentBodyFat ? bodyFatDiffText : 'Sem registro'} />
            </div>
          </div>

          <div className="rounded-lg border border-line bg-ink/45 p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fitgreen">Consistência de treino</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <InfoBox label="Treinos concluídos" value={report.trainingConsistency.totalWorkouts} />
              <InfoBox label="Treinos no mês" value={report.trainingConsistency.monthWorkouts} />
              <InfoBox label="Último treino" value={report.trainingConsistency.latestWorkout} />
              <InfoBox label="Dias sem treinar" value={report.trainingConsistency.daysWithoutTraining} />
              <InfoBox label="Aderência" value={`${report.trainingConsistency.adherence}%`} />
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-line bg-ink/45 p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fitblue">Check-in e comportamento</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <InfoBox label="Último check-in" value={report.checkinBehavior.latestCheckIn} />
              <InfoBox label="Peso no check-in" value={report.checkinBehavior.currentWeight} />
              <InfoBox label="Motivação" value={report.checkinBehavior.motivation} />
              <InfoBox label="Estresse" value={report.checkinBehavior.stress} />
              <InfoBox label="Sono" value={report.checkinBehavior.sleep} />
              <InfoBox label="Alimentação" value={report.checkinBehavior.food} />
              <InfoBox label="Dificuldade" value={report.checkinBehavior.difficulty} />
              <InfoBox label="Vitória" value={report.checkinBehavior.victory} />
            </div>
          </div>

          <div className="rounded-lg border border-line bg-ink/45 p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fitblue">Hidratação, jornada e plano</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <InfoBox label="Meta de água" value={`${report.hydration.goal} litros`} />
              <InfoBox label="Consumo hoje" value={`${report.hydration.consumed} litros`} />
              <InfoBox label="Progresso água" value={`${report.hydration.progress}%`} />
              <InfoBox label="Status água" value={report.hydration.status} />
              <InfoBox label="Dia da jornada" value={`Dia ${report.journey.day} de 90`} />
              <InfoBox label="Fase atual" value={report.journey.phase} />
              <InfoBox label="Score geral" value={`${report.journey.score}/100`} />
              <InfoBox label="Conquistas ativas" value={report.journey.activeAchievements} />
              <InfoBox label="Periodização ativa" value={report.periodization.active} />
              <InfoBox label="Duração" value={report.periodization.duration} />
              <InfoBox label="Status financeiro" value={report.financial.summary} />
              <InfoBox label="Próximo vencimento" value={report.financial.dueDate} />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-fitblue/25 bg-fitblue/10 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-fitblue">Metas semanais</p>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <InfoBox label="Em andamento" value={report.weeklyGoals.inProgress} />
            <InfoBox label="Concluídas" value={report.weeklyGoals.completed} />
            <InfoBox label="Atrasadas" value={report.weeklyGoals.overdue} />
            <InfoBox label="Total" value={report.weeklyGoals.total} />
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-200">{report.weeklyGoals.summary}</p>
          {report.weeklyGoals.items.length ? (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {report.weeklyGoals.items.map((goal) => (
                <div key={`${goal.title}-${goal.category}`} className="rounded-lg border border-line bg-ink/45 p-3">
                  <p className="font-semibold text-white">{goal.title}</p>
                  <p className="mt-1 text-sm text-slate-300">{goal.category} - {goal.progress}%</p>
                  <Badge label={goal.status} />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-fitgreen/25 bg-fitgreen/10 p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fitgreen">Pontos positivos</p>
            <div className="mt-3 space-y-2 text-sm leading-6 text-slate-100">
              {report.positives.map((item) => <p key={item}>✅ {item}</p>)}
            </div>
          </div>
          <div className="rounded-lg border border-fitorange/25 bg-fitorange/10 p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fitorange">Riscos e pontos de atenção</p>
            <div className="mt-3 space-y-2 text-sm leading-6 text-slate-100">
              {report.attentionPoints.map((item) => <p key={item}>⚠️ {item}</p>)}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-fitgreen/30 bg-fitgreen/10 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-fitgreen">Próxima ação recomendada</p>
          <p className="mt-2 text-sm leading-6 text-slate-100">{report.nextAction}</p>
          {whatsappUrl ? (
            <a className="btn-secondary mt-3 w-full sm:w-auto" href={whatsappUrl} target="_blank" rel="noopener noreferrer">💬 Enviar mensagem para o aluno</a>
          ) : (
            <p className="mt-3 rounded-md border border-line bg-ink/50 px-3 py-2 text-sm font-semibold text-slate-300">Telefone do aluno não cadastrado.</p>
          )}
        </div>
      </div>
    </Panel>
  );
}

function StudentCrud({
  data,
  selectedStudentId,
  selectedStudent,
  commit,
  onSelect
}: {
  data: AppData;
  selectedStudentId: string;
  selectedStudent?: Student;
  commit: (data: AppData, message?: string) => void;
  onSelect: (id: string) => void;
}) {
  const [form, setForm] = useState<Student>(emptyStudent);
  const [accessEmail, setAccessEmail] = useState('');
  const [accessPassword, setAccessPassword] = useState('');
  const [accessMessage, setAccessMessage] = useState('');
  const getDefaultSystemLink = () => (typeof window !== 'undefined' ? window.location.origin : '');
  const [systemLink, setSystemLink] = useState(getDefaultSystemLink);
  const [copyFeedback, setCopyFeedback] = useState('');
  const [linkStudentEmail, setLinkStudentEmail] = useState('');
  const [linkProfileEmail, setLinkProfileEmail] = useState('');
  const [linkProfileId, setLinkProfileId] = useState('');
  const [isCreatingAccess, setIsCreatingAccess] = useState(false);
  const [isEditing, setIsEditing] = useState(true);
  const studentProfiles = data.users.filter((user) => user.role === 'student');
  const handleEditStudent = (student: Student) => {
    setForm({
      ...emptyStudent,
      id: student.id || '',
      profileId: student.profileId || '',
      fullName: student.fullName || '',
      email: student.email || '',
      phone: student.phone || '',
      birthDate: student.birthDate || '',
      sex: student.sex || 'Feminino',
      goal: student.goal || '',
      level: student.level || 'iniciante',
      status: student.status || 'pendente',
      plan: student.plan || '',
      startDate: student.startDate || '',
      initialWeight: Number(student.initialWeight || 0),
      currentWeight: Number(student.currentWeight || 0),
      target: student.target || '',
      notes: student.notes || '',
      avatar: student.avatar
    });
    setAccessEmail(student.email || '');
    setAccessMessage('');
    setCopyFeedback('');
    setIsEditing(false);
  };
  const startNewStudent = () => {
    onSelect('');
    setForm({ ...emptyStudent });
    setAccessEmail('');
    setAccessPassword('');
    setAccessMessage('');
    setSystemLink(getDefaultSystemLink());
    setCopyFeedback('');
    setIsEditing(true);
  };
  const selectStudentForEdit = (studentId: string) => {
    onSelect(studentId);
    const student = data.students.find((item) => item.id === studentId);
    if (student) handleEditStudent(student);
  };
  useEffect(() => {
    if (!selectedStudentId) {
      setForm({ ...emptyStudent });
      setAccessEmail('');
      setAccessMessage('');
      setCopyFeedback('');
      setIsEditing(true);
      return;
    }
    const student = data.students.find((item) => item.id === selectedStudentId) ?? selectedStudent;
    if (!student) {
      setForm({ ...emptyStudent });
      setAccessEmail('');
      setAccessMessage('');
      setCopyFeedback('');
      setIsEditing(true);
      return;
    }
    handleEditStudent(student);
  }, [selectedStudentId, data.students, selectedStudent]);
  const save = async () => {
    if (!form.fullName || !form.email) return;
    const id = form.id || makeId('s');
    const nextStudent = { ...form, id, email: accessEmail || form.email, initialWeight: Number(form.initialWeight), currentWeight: Number(form.currentWeight) };
    const exists = data.students.some((student) => student.id === id);
    try {
      const remoteId = await saveStudentRemote(nextStudent);
      const savedStudent = { ...nextStudent, id: remoteId ?? nextStudent.id };
      commit({ ...data, students: exists ? data.students.map((student) => (student.id === id ? savedStudent : student)) : [...data.students, savedStudent] }, exists ? 'Atualizado com sucesso.' : 'Salvo com sucesso.');
      onSelect(savedStudent.id);
      setForm(savedStudent);
      setAccessEmail(savedStudent.email);
      setIsEditing(false);
    } catch (error) {
      console.error('Erro ao salvar aluno:', error);
      window.alert(error instanceof Error ? error.message : 'Não foi possível salvar o aluno.');
    }
  };
  const deleteStudent = async (student: Student) => {
    if (!window.confirm('Tem certeza que deseja excluir este aluno? Essa ação também poderá remover dados vinculados.')) return;
    try {
      await deleteStudentRemote(student.id);
      const remainingStudents = data.students.filter((item) => item.id !== student.id);
      commit({
        ...data,
        students: remainingStudents,
        assessments: data.assessments.filter((item) => item.studentId !== student.id),
        anamneses: data.anamneses.filter((item) => item.studentId !== student.id),
        workouts: data.workouts.filter((item) => item.studentId !== student.id),
        workoutLogs: data.workoutLogs.filter((item) => item.studentId !== student.id),
        periodizations: data.periodizations.filter((item) => item.studentId !== student.id),
        checkIns: data.checkIns.filter((item) => item.studentId !== student.id),
        payments: data.payments.filter((item) => item.studentId !== student.id)
      }, 'Excluído com sucesso.');
      onSelect(remainingStudents[0]?.id ?? '');
      setForm({ ...emptyStudent });
      setAccessEmail('');
      setIsEditing(true);
    } catch (error) {
      console.error('Erro ao excluir aluno:', error);
      window.alert('Não foi possível excluir o aluno. Tente novamente.');
    }
  };
  const buildAccessMessage = (overrides: { studentName?: string; email?: string; password?: string } = {}) => {
    const studentName = overrides.studentName || form.fullName || 'aluno';
    const emailForAccess = overrides.email || accessEmail || form.email || linkProfileEmail || '[email do aluno]';
    const password = overrides.password || accessPassword || '[senha definida]';
    const link = systemLink || getDefaultSystemLink() || '[link do sistema]';
    return `Olá, ${studentName}!

Seu acesso ao PersonalPro Evolution foi criado.

Link:
${link}

E-mail:
${emailForAccess}

Senha temporária:
${password}

Ao entrar, acompanhe seus treinos, check-ins, evolução, metas semanais e relatório.

Se tiver qualquer dúvida, fale comigo pelo WhatsApp dentro do sistema.`;
  };
  const createStudentAccess = async () => {
    const studentId = form.id;
    const emailForAccess = (accessEmail || form.email).trim().toLowerCase();
    const temporaryPassword = accessPassword.trim();
    if (!studentId) {
      window.alert('Salve o aluno antes de criar o acesso.');
      return;
    }
    if (!emailForAccess || !emailForAccess.includes('@')) {
      window.alert('Informe um e-mail de acesso válido para o aluno.');
      return;
    }
    if (temporaryPassword.length < 6) {
      window.alert('A senha temporária precisa ter pelo menos 6 caracteres.');
      return;
    }
    setIsCreatingAccess(true);
    try {
      const result = await createStudentAccessRemote({
        studentId,
        email: emailForAccess,
        password: temporaryPassword,
        fullName: form.fullName || emailForAccess
      });
      const updatedStudent = { ...form, email: result.email || emailForAccess, profileId: result.profileId };
      commit({
        ...data,
        students: data.students.map((student) => (student.id === studentId ? updatedStudent : student))
      }, 'Acesso do aluno criado com sucesso.');
      setForm(updatedStudent);
      setAccessEmail(updatedStudent.email);
      setAccessMessage(buildAccessMessage({ studentName: updatedStudent.fullName, email: updatedStudent.email, password: temporaryPassword }));
      setCopyFeedback('');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Não foi possível criar o acesso do aluno.');
    } finally {
      setIsCreatingAccess(false);
    }
  };
  const generateAccessInstructions = () => {
    setAccessMessage(buildAccessMessage());
    setCopyFeedback('');
  };
  const copyAccessMessage = async () => {
    const message = accessMessage || buildAccessMessage();
    setAccessMessage(message);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
      } else {
        const element = document.createElement('textarea');
        element.value = message;
        element.setAttribute('readonly', '');
        element.style.position = 'fixed';
        element.style.opacity = '0';
        document.body.appendChild(element);
        element.select();
        document.execCommand('copy');
        document.body.removeChild(element);
      }
      setCopyFeedback('Mensagem copiada com sucesso.');
    } catch (error) {
      window.alert('Não foi possível copiar a mensagem.');
    }
  };
  const sendAccessByWhatsApp = () => {
    const phone = form.phone.replace(/\D/g, '');
    if (!phone) {
      window.alert('Cadastre o telefone do aluno para enviar pelo WhatsApp.');
      return;
    }
    const message = accessMessage || buildAccessMessage();
    setAccessMessage(message);
    setCopyFeedback('');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };
  const linkStudentLogin = async () => {
    try {
      const student = await findStudentByEmail(linkStudentEmail);
      if (!student) throw new Error('Aluno não encontrado com este e-mail.');
      let profileId = linkProfileId;
      if (!profileId && linkProfileEmail) {
        const localProfile = studentProfiles.find((profile) => profile.email && profile.email.toLowerCase() === linkProfileEmail.trim().toLowerCase());
        const profile = localProfile ? { id: localProfile.id } : await findStudentProfileByEmail(linkProfileEmail);
        if (!profile?.id) {
          throw new Error('Profile ainda não existe. Crie o usuário aluno em Authentication > Users e tente novamente.');
        }
        profileId = profile.id;
      }
      if (!profileId) throw new Error('Selecione um profile student ou informe o e-mail de acesso do aluno.');
      await linkStudentProfileRemote(student.id, profileId);
      commit({
        ...data,
        students: data.students.map((item) => (item.id === student.id ? { ...item, profileId } : item))
      }, 'Login do aluno vinculado com sucesso.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Não foi possível vincular o login do aluno.');
    }
  };
  const accessStatus = form.profileId ? 'Perfil vinculado' : accessMessage ? 'Acesso criado' : 'Sem acesso criado';

  return (
    <Stack>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageTitle title="Gestão de alunos" subtitle="Cadastre, edite e acompanhe todos os alunos do personal." />
        <button className="btn-primary w-full sm:w-auto" onClick={startNewStudent}>
          <Plus size={16} /> Novo aluno
        </button>
      </div>
      <Panel key={form.id || 'new-student'} title={form.id ? `Aluno: ${studentDisplayName(form) || studentDisplayName(selectedStudent)}` : 'Novo aluno'}>
        {form.id && <FormModeNotice editing={isEditing} />}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Input label="Nome completo" value={form.fullName} onChange={(value) => setForm({ ...form, fullName: value })} required disabled={!isEditing} />
          <Input label="E-mail principal" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} required disabled={!isEditing} />
          <Input label="Telefone / WhatsApp" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} disabled={!isEditing} />
          <Input label="Data de nascimento" type="date" value={form.birthDate} onChange={(value) => setForm({ ...form, birthDate: value })} disabled={!isEditing} />
          <Select label="Sexo" value={form.sex} onChange={(value) => setForm({ ...form, sex: value })} disabled={!isEditing} options={[['Feminino', 'Feminino'], ['Masculino', 'Masculino'], ['Outro', 'Outro']]} />
          <Input label="Objetivo principal" value={form.goal} onChange={(value) => setForm({ ...form, goal: value })} disabled={!isEditing} />
          <Select label="Nível" value={form.level} onChange={(value) => setForm({ ...form, level: value as Student['level'] })} disabled={!isEditing} options={[['iniciante', 'Iniciante'], ['intermediario', 'Intermediário'], ['avancado', 'Avançado']]} />
          <Select label="Status" value={form.status} onChange={(value) => setForm({ ...form, status: value as Student['status'] })} disabled={!isEditing} options={[['ativo', 'Ativo'], ['inativo', 'Inativo'], ['teste', 'Teste'], ['pendente', 'Pendente']]} />
          <Select
            label="Perfil vinculado"
            value={form.profileId ?? ''}
            onChange={(value) => setForm({ ...form, profileId: value })}
            disabled={!isEditing}
            options={[['', 'Sem vínculo'], ...studentProfiles.map((profile) => [profile.id, `${profile.name || profile.email || profile.id} (${profile.role})`] as [string, string])]}
          />
          <Input label="E-mail de acesso do aluno" type="email" value={accessEmail} onChange={setAccessEmail} disabled={!isEditing} />
          <Input label="Plano contratado" value={form.plan} onChange={(value) => setForm({ ...form, plan: value })} disabled={!isEditing} />
          <Input label="Data de início" type="date" value={form.startDate} onChange={(value) => setForm({ ...form, startDate: value })} disabled={!isEditing} />
          <Input label="Peso inicial" type="number" value={String(form.initialWeight)} onChange={(value) => setForm({ ...form, initialWeight: Number(value) })} disabled={!isEditing} />
          <Input label="Peso atual" type="number" value={String(form.currentWeight)} onChange={(value) => setForm({ ...form, currentWeight: Number(value) })} disabled={!isEditing} />
          <Textarea label="Meta" value={form.target} onChange={(value) => setForm({ ...form, target: value })} disabled={!isEditing} />
          <Textarea label="Observações internas" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} disabled={!isEditing} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {isEditing ? (
            <>
              <button className="btn-primary w-full sm:w-auto" onClick={save}>{form.id ? 'Salvar alterações' : 'Salvar aluno'}</button>
              {form.id && <button className="btn-secondary w-full sm:w-auto" onClick={() => { const original = data.students.find((item) => item.id === form.id); if (original) handleEditStudent(original); }}>Cancelar</button>}
            </>
          ) : (
            <button className="btn-secondary w-full sm:w-auto" onClick={() => setIsEditing(true)}>Editar aluno</button>
          )}
          {form.id && <button className="btn-danger w-full sm:w-auto" onClick={() => deleteStudent(form)}>Excluir aluno</button>}
        </div>
      </Panel>
      <Panel title="🔐 Acesso do aluno">
        <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg border border-fitblue/25 bg-fitblue/10 p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fitblue">Status do acesso</p>
            <p className="mt-2 text-2xl font-black text-white">{accessStatus}</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              O aluno entra pela tela principal usando o e-mail e senha enviados pelo Personal. Por segurança, este painel gera as instruções e vincula um profile student existente, sem expor chave admin no frontend.
            </p>
            <div className="mt-4 grid gap-2 text-sm text-slate-200">
              <p><span className="font-semibold text-white">Aluno:</span> {form.fullName || 'Selecione ou cadastre um aluno'}</p>
              <p><span className="font-semibold text-white">E-mail de acesso:</span> {accessEmail || form.email || 'Não definido'}</p>
              <p><span className="font-semibold text-white">Profile:</span> {form.profileId || 'Sem vínculo'}</p>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-lg border border-line bg-ink/45 p-4">
              <p className="font-bold text-white">Gerar instruções de acesso</p>
              <p className="mt-1 text-sm text-slate-400">Defina o link e uma senha temporária para montar a mensagem que será enviada ao aluno.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Input label="E-mail de acesso do aluno" type="email" value={accessEmail} onChange={(value) => { setAccessEmail(value); setCopyFeedback(''); }} />
                <Input label="Senha temporária" value={accessPassword} onChange={(value) => { setAccessPassword(value); setCopyFeedback(''); }} />
                <Input label="Link do sistema" value={systemLink} onChange={(value) => { setSystemLink(value); setCopyFeedback(''); }} />
                <button className="btn-primary self-end" onClick={createStudentAccess} disabled={isCreatingAccess || Boolean(form.profileId)}>
                  {form.profileId ? 'Acesso já vinculado' : isCreatingAccess ? 'Criando acesso...' : 'Criar acesso do aluno'}
                </button>
              </div>
              <button className="btn-secondary mt-3 w-full sm:w-auto" onClick={generateAccessInstructions}>
                Gerar instruções de acesso
              </button>
              {accessMessage && (
                <label className="mt-3 block text-sm">
                  <span className="mb-1 block text-slate-300">Mensagem para WhatsApp</span>
                  <textarea className="field min-h-64 resize-y" value={accessMessage} onChange={(event) => { setAccessMessage(event.target.value); setCopyFeedback(''); }} />
                </label>
              )}
              {accessMessage && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button className="btn-secondary w-full sm:w-auto" onClick={copyAccessMessage}>Copiar instruções de acesso</button>
                  <button className="btn-primary w-full sm:w-auto" onClick={sendAccessByWhatsApp}>Enviar pelo WhatsApp</button>
                  {copyFeedback && <span className="text-sm font-semibold text-fitgreen">{copyFeedback}</span>}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-line bg-ink/45 p-4">
              <p className="font-bold text-white">Vincular acesso existente</p>
              <p className="mt-1 text-sm text-slate-400">Use quando o usuário aluno já existir no Supabase Authentication e possuir profile com role student.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <Input label="Buscar aluno por e-mail" type="email" value={linkStudentEmail} onChange={setLinkStudentEmail} />
                <Input label="Buscar profile por e-mail" type="email" value={linkProfileEmail} onChange={setLinkProfileEmail} />
                <Select
                  label="Ou selecione um profile student"
                  value={linkProfileId}
                  onChange={setLinkProfileId}
                  options={[['', 'Selecionar profile'], ...studentProfiles.map((profile) => [profile.id, `${profile.name || profile.email || profile.id}`] as [string, string])]}
                />
              </div>
              <button className="btn-primary mt-4 w-full sm:w-auto" onClick={linkStudentLogin}>Vincular acesso existente</button>
            </div>
          </div>
        </div>
      </Panel>
      {data.students.length ? <div className="grid gap-3 lg:grid-cols-2">
        {data.students.map((student) => (
          <div key={student.id} className="rounded-lg border border-line bg-panel p-4 transition hover:border-fitblue">
            <div className="flex items-center gap-3">
              <Avatar student={student} />
              <div className="min-w-0">
                <p className="truncate font-semibold">{studentDisplayName(student)}</p>
                <p className="truncate text-sm text-slate-400">{student.email || student.goal}</p>
              </div>
              <Badge label={student.status} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-secondary w-full sm:w-auto" onClick={() => selectStudentForEdit(student.id)}>Editar aluno</button>
              <button className="btn-danger w-full sm:w-auto" onClick={() => deleteStudent(student)}>Excluir aluno</button>
            </div>
          </div>
        ))}
      </div> : <Empty title="Nenhum aluno cadastrado" text="Use o botão Novo aluno para começar com a base limpa." />}
    </Stack>
  );
}

function Assessments({ data, student, commit }: { data: AppData; student: Student; commit: (data: AppData, message?: string) => void }) {
  const createAssessmentForm = (selectedStudent: Student): PhysicalAssessment => ({
    id: '',
    studentId: selectedStudent.id,
    date: new Date().toISOString().slice(0, 10),
    weight: numberOrZero(selectedStudent.currentWeight),
    height: 1.7,
    bodyFat: 0,
    leanMass: 0,
    fatMass: 0,
    abdomen: 0,
    waist: 0,
    hip: 0,
    rightArm: 0,
    leftArm: 0,
    rightThigh: 0,
    leftThigh: 0,
    rightCalf: 0,
    leftCalf: 0,
    photos: [],
    notes: ''
  });
  const studentAssessments = data.assessments.filter((item) => getAssessmentStudentId(item) === student.id).sort((a, b) => getAssessmentDateValue(b).localeCompare(getAssessmentDateValue(a)));
  const latestStudentAssessment = studentAssessments[0];
  const [form, setForm] = useState<PhysicalAssessment>(() => latestStudentAssessment ? { ...latestStudentAssessment } : createAssessmentForm(student));
  const [isAssessmentEditing, setIsAssessmentEditing] = useState(false);
  const [isCreatingAssessment, setIsCreatingAssessment] = useState(false);
  useEffect(() => {
    const latest = data.assessments
      .filter((item) => getAssessmentStudentId(item) === student.id)
      .sort((a, b) => getAssessmentDateValue(b).localeCompare(getAssessmentDateValue(a)))[0];
    setForm(latest ? { ...latest } : createAssessmentForm(student));
    setIsAssessmentEditing(false);
    setIsCreatingAssessment(false);
  }, [student.id, data.assessments]);
  const fields: [keyof PhysicalAssessment, string][] = [
    ['weight', 'Peso'], ['height', 'Altura'], ['bodyFat', '% gordura'], ['leanMass', 'Massa magra'], ['fatMass', 'Massa gorda'], ['abdomen', 'Abdômen'], ['waist', 'Cintura'], ['hip', 'Quadril'], ['rightArm', 'Braço dir.'], ['leftArm', 'Braço esq.'], ['rightThigh', 'Coxa dir.'], ['leftThigh', 'Coxa esq.'], ['rightCalf', 'Panturrilha dir.'], ['leftCalf', 'Panturrilha esq.']
  ];
  const save = async () => {
    if (!student?.id) {
      window.alert('Selecione um aluno antes de salvar a avaliação.');
      return;
    }
    const nextAssessment: PhysicalAssessment = {
      ...form,
      id: form.id || makeId('a'),
      studentId: student.id,
      weight: numberOrZero(form.weight),
      height: numberOrZero(form.height),
      bodyFat: numberOrZero(form.bodyFat),
      leanMass: numberOrZero(form.leanMass),
      fatMass: numberOrZero(form.fatMass),
      abdomen: numberOrZero(form.abdomen),
      waist: numberOrZero(form.waist),
      hip: numberOrZero(form.hip),
      rightArm: numberOrZero(form.rightArm),
      leftArm: numberOrZero(form.leftArm),
      rightThigh: numberOrZero(form.rightThigh),
      leftThigh: numberOrZero(form.leftThigh),
      rightCalf: numberOrZero(form.rightCalf),
      leftCalf: numberOrZero(form.leftCalf),
      photos: form.photos ?? [],
      notes: form.notes ?? ''
    };
    if (![nextAssessment.weight, nextAssessment.height, nextAssessment.bodyFat].every(Number.isFinite)) {
      window.alert('Preencha peso, altura e percentual de gordura com números válidos.');
      return;
    }
    try {
      const remoteAssessment = await saveAssessmentRemote(nextAssessment);
      const savedAssessment = { ...nextAssessment, ...(remoteAssessment ?? {}), id: remoteAssessment?.id ?? nextAssessment.id };
      const updatedStudent = { ...student, currentWeight: savedAssessment.weight };
      await saveStudentRemote(updatedStudent);
      commit({
        ...data,
        assessments: [...data.assessments.filter((item) => item.id !== nextAssessment.id && item.id !== savedAssessment.id), savedAssessment],
        students: data.students.map((item) => (item.id === student.id ? updatedStudent : item))
      }, form.id ? 'Avaliação atualizada com sucesso.' : 'Avaliação salva com sucesso.');
      setForm(savedAssessment);
      setIsAssessmentEditing(false);
      setIsCreatingAssessment(false);
    } catch (error) {
      console.error('Erro ao salvar avaliação:', error);
      window.alert('Não foi possível salvar a avaliação. Verifique se o aluno está selecionado e se os campos estão preenchidos corretamente.');
    }
  };
  const editAssessment = (assessment: PhysicalAssessment) => {
    setForm({ ...assessment });
    setIsAssessmentEditing(true);
    setIsCreatingAssessment(false);
    scrollToTop();
  };
  const viewAssessment = (assessment: PhysicalAssessment) => {
    setForm({ ...assessment });
    setIsAssessmentEditing(false);
    setIsCreatingAssessment(false);
    scrollToTop();
  };
  const startNewAssessment = () => {
    setForm(createAssessmentForm(student));
    setIsAssessmentEditing(true);
    setIsCreatingAssessment(true);
  };
  const cancelAssessmentEdit = () => {
    if (isCreatingAssessment) {
      if (latestStudentAssessment) {
        setForm({ ...latestStudentAssessment });
        setIsCreatingAssessment(false);
        setIsAssessmentEditing(false);
      } else {
        setForm(createAssessmentForm(student));
        setIsCreatingAssessment(false);
        setIsAssessmentEditing(false);
      }
      return;
    }
    const original = data.assessments.find((item) => item.id === form.id);
    if (original) {
      setForm({ ...original });
      setIsAssessmentEditing(false);
    }
  };
  const deleteCurrentAssessment = () => {
    if (!form.id) return;
    deleteAssessment(form);
  };
  const shouldShowForm = isCreatingAssessment || Boolean(form.id);
  const isLocked = Boolean(form.id) && !isAssessmentEditing;
  const deleteAssessment = async (assessment: PhysicalAssessment) => {
    if (!window.confirm('Tem certeza que deseja excluir esta avaliação?')) return;
    try {
      await deleteAssessmentRemote(assessment.id);
      commit({ ...data, assessments: data.assessments.filter((item) => item.id !== assessment.id) }, 'Excluído com sucesso.');
      if (form.id === assessment.id) {
        const remaining = data.assessments
          .filter((item) => item.id !== assessment.id && getAssessmentStudentId(item) === student.id)
          .sort((a, b) => getAssessmentDateValue(b).localeCompare(getAssessmentDateValue(a)));
        setForm(remaining[0] ? { ...remaining[0] } : createAssessmentForm(student));
        setIsAssessmentEditing(false);
        setIsCreatingAssessment(false);
      }
    } catch (error) {
      console.error('Erro ao excluir avaliação:', error);
      window.alert('Não foi possível excluir a avaliação.');
    }
  };

  return (
    <Stack>
      <PageTitle title="Avaliação física" subtitle={`${student.fullName} - IMC calculado: ${calculateImc(Number(form.weight), Number(form.height))}`} />
      {shouldShowForm ? (
        <Panel title={isCreatingAssessment ? 'Nova avaliação' : 'Avaliação selecionada'}>
          {isCreatingAssessment ? <p className="mb-4 rounded-md border border-fitgreen/30 bg-fitgreen/10 p-3 text-sm text-fitgreen">Nova avaliação.</p> : <FormModeNotice editing={isAssessmentEditing} />}
          <div className="grid gap-3 md:grid-cols-3">
            <Input label="Data da avaliação" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} disabled={isLocked} />
            {fields.map(([key, label]) => (
              <Input key={String(key)} label={label} type="number" value={String(form[key] ?? 0)} onChange={(value) => setForm({ ...form, [key]: parseAssessmentNumber(value) })} disabled={isLocked} />
            ))}
            <ImageUpload label="Fotos de evolução" value={form.photos} onChange={(photos) => setForm({ ...form, photos })} multiple disabled={isLocked} />
            <Textarea label="Observações" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} disabled={isLocked} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {isCreatingAssessment ? (
              <>
                <button className="btn-primary w-full sm:w-auto" onClick={save}>Salvar avaliação</button>
                <button className="btn-secondary w-full sm:w-auto" onClick={cancelAssessmentEdit}>Cancelar</button>
              </>
            ) : isAssessmentEditing ? (
              <>
                <button className="btn-primary w-full sm:w-auto" onClick={save}>Salvar alterações</button>
                <button className="btn-secondary w-full sm:w-auto" onClick={cancelAssessmentEdit}>Cancelar</button>
                <button className="btn-danger w-full sm:w-auto" onClick={deleteCurrentAssessment}>Excluir avaliação</button>
              </>
            ) : (
              <>
                <button className="btn-secondary w-full sm:w-auto" onClick={startNewAssessment}>Nova avaliação</button>
                <button className="btn-secondary w-full sm:w-auto" onClick={() => setIsAssessmentEditing(true)}>Editar avaliação</button>
                <button className="btn-danger w-full sm:w-auto" onClick={deleteCurrentAssessment}>Excluir avaliação</button>
              </>
            )}
          </div>
        </Panel>
      ) : (
        <Panel title="Avaliação física">
          <Empty title="Este aluno ainda não possui avaliação física." text="Crie a primeira avaliação para iniciar o histórico de evolução." />
          <button className="btn-primary mt-4 w-full sm:w-auto" onClick={startNewAssessment}>Nova avaliação</button>
        </Panel>
      )}
      <HistoryList assessments={studentAssessments} onView={viewAssessment} onEdit={editAssessment} onDelete={deleteAssessment} />
    </Stack>
  );
}

function AnamnesisView({ data, student, commit }: { data: AppData; student: Student; commit: (data: AppData, message?: string) => void }) {
  const anamnesis = data.anamneses.find((item) => item.studentId === student.id);
  const createAnamnesisForm = (selectedStudent: Student, current?: Anamnesis): Anamnesis => ({
    id: current?.id ?? '',
    studentId: selectedStudent.id,
    mainGoal: current?.mainGoal ?? selectedStudent.goal ?? '',
    trainingHistory: current?.trainingHistory ?? '',
    injuries: current?.injuries ?? '',
    medications: current?.medications ?? '',
    medicalRestrictions: current?.medicalRestrictions ?? '',
    workRoutine: current?.workRoutine ?? '',
    stressLevel: numberOrZero(current?.stressLevel || 5),
    sleepQuality: numberOrZero(current?.sleepQuality || 7),
    sleepHours: numberOrZero(current?.sleepHours || 7),
    eatingHabits: current?.eatingHabits ?? '',
    waterIntake: current?.waterIntake ?? '',
    emotionalExerciseRelation: current?.emotionalExerciseRelation ?? '',
    difficulties: current?.difficulties ?? '',
    demotivators: current?.demotivators ?? '',
    motivators: current?.motivators ?? '',
    weeklyAvailability: current?.weeklyAvailability ?? '',
    trainingLocation: current?.trainingLocation ?? ''
  });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Anamnesis>(() => createAnamnesisForm(student, anamnesis));
  useEffect(() => {
    setForm(createAnamnesisForm(student, anamnesis));
    setEditing(false);
  }, [student.id, anamnesis?.id]);
  const items = anamnesis
    ? [
        ['Objetivo', anamnesis.mainGoal],
        ['Histórico de treino', anamnesis.trainingHistory],
        ['Lesões ou dores', anamnesis.injuries],
        ['Medicamentos', anamnesis.medications],
        ['Restrições médicas', anamnesis.medicalRestrictions],
        ['Rotina de trabalho', anamnesis.workRoutine],
        ['Estresse', `${anamnesis.stressLevel}/10`],
        ['Sono', `${anamnesis.sleepQuality}/10 - ${anamnesis.sleepHours}h`],
        ['Alimentação', anamnesis.eatingHabits],
        ['Água', anamnesis.waterIntake],
        ['Relação com exercício', anamnesis.emotionalExerciseRelation],
        ['Dificuldades', anamnesis.difficulties],
        ['Desmotiva', anamnesis.demotivators],
        ['Motiva', anamnesis.motivators],
        ['Disponibilidade', anamnesis.weeklyAvailability],
        ['Local', anamnesis.trainingLocation]
      ]
    : [];
  const save = async () => {
    const nextAnamnesis: Anamnesis = {
      ...form,
      id: form.id || makeId('an'),
      studentId: student.id,
      stressLevel: numberOrZero(form.stressLevel),
      sleepQuality: numberOrZero(form.sleepQuality),
      sleepHours: numberOrZero(form.sleepHours)
    };
    try {
      const remoteId = await saveAnamnesisRemote(nextAnamnesis);
      const savedAnamnesis = { ...nextAnamnesis, id: remoteId ?? nextAnamnesis.id };
      commit({
        ...data,
        anamneses: [...data.anamneses.filter((item) => item.id !== savedAnamnesis.id && item.studentId !== student.id), savedAnamnesis]
      }, form.id ? 'Atualizado com sucesso.' : 'Salvo com sucesso.');
      setForm(savedAnamnesis);
      setEditing(false);
    } catch (error) {
      console.error('Erro ao salvar anamnese:', error);
      window.alert('Não foi possível salvar a anamnese. Verifique os campos e tente novamente.');
    }
  };
  const deleteAnamnesis = async () => {
    if (!anamnesis || !window.confirm('Tem certeza que deseja excluir esta anamnese?')) return;
    try {
      await deleteAnamnesisRemote(anamnesis.id);
      commit({ ...data, anamneses: data.anamneses.filter((item) => item.id !== anamnesis.id) }, 'Excluído com sucesso.');
      setForm(createAnamnesisForm(student));
      setEditing(false);
    } catch (error) {
      console.error('Erro ao excluir anamnese:', error);
      window.alert('Não foi possível excluir a anamnese.');
    }
  };
  return (
    <Stack>
      <PageTitle title="Anamnese e estilo de vida" subtitle={studentDisplayName(student)} />
      <Panel title="Formulário completo">
        {editing && <FormModeNotice editing />}
        {editing ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Objetivo principal" value={form.mainGoal} onChange={(value) => setForm({ ...form, mainGoal: value })} />
              <Input label="Histórico de treino" value={form.trainingHistory} onChange={(value) => setForm({ ...form, trainingHistory: value })} />
              <Input label="Lesões ou dores" value={form.injuries} onChange={(value) => setForm({ ...form, injuries: value })} />
              <Input label="Medicamentos" value={form.medications} onChange={(value) => setForm({ ...form, medications: value })} />
              <Input label="Restrições médicas" value={form.medicalRestrictions} onChange={(value) => setForm({ ...form, medicalRestrictions: value })} />
              <Input label="Rotina de trabalho" value={form.workRoutine} onChange={(value) => setForm({ ...form, workRoutine: value })} />
              <Input label="Estresse de 1 a 10" type="number" value={String(form.stressLevel)} onChange={(value) => setForm({ ...form, stressLevel: numberOrZero(value) })} />
              <Input label="Sono de 1 a 10" type="number" value={String(form.sleepQuality)} onChange={(value) => setForm({ ...form, sleepQuality: numberOrZero(value) })} />
              <Input label="Horas de sono" type="number" value={String(form.sleepHours)} onChange={(value) => setForm({ ...form, sleepHours: numberOrZero(value) })} />
              <Input label="Alimentação" value={form.eatingHabits} onChange={(value) => setForm({ ...form, eatingHabits: value })} />
              <Input label="Consumo de água" value={form.waterIntake} onChange={(value) => setForm({ ...form, waterIntake: value })} />
              <Input label="Relação com exercício" value={form.emotionalExerciseRelation} onChange={(value) => setForm({ ...form, emotionalExerciseRelation: value })} />
              <Textarea label="Dificuldades" value={form.difficulties} onChange={(value) => setForm({ ...form, difficulties: value })} />
              <Textarea label="Desmotivadores" value={form.demotivators} onChange={(value) => setForm({ ...form, demotivators: value })} />
              <Textarea label="Motivadores" value={form.motivators} onChange={(value) => setForm({ ...form, motivators: value })} />
              <Input label="Disponibilidade semanal" value={form.weeklyAvailability} onChange={(value) => setForm({ ...form, weeklyAvailability: value })} />
              <Select
                label="Local de treino"
                value={form.trainingLocation}
                onChange={(value) => setForm({ ...form, trainingLocation: value })}
                options={[['', 'Selecionar'], ['academia', 'Academia'], ['casa', 'Casa'], ['praia', 'Praia'], ['ar livre', 'Ar livre'], ['outro', 'Outro']]}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-primary w-full sm:w-auto" onClick={save}>{form.id ? 'Salvar alterações' : 'Salvar anamnese'}</button>
              {form.id && <button className="btn-secondary w-full sm:w-auto" onClick={() => { setForm(createAnamnesisForm(student, anamnesis)); setEditing(false); }}>Cancelar</button>}
            </div>
          </>
        ) : (
          items.length ? (
            <>
              <div className="grid gap-3 md:grid-cols-2">{items.map(([label, value]) => <InfoBox key={label} label={label} value={value} />)}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-secondary w-full sm:w-auto" onClick={() => setEditing(true)}>Editar anamnese</button>
                <button className="btn-danger w-full sm:w-auto" onClick={deleteAnamnesis}>Excluir anamnese</button>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-line bg-ink/40 p-5 text-center">
              <p className="font-semibold">Nenhuma anamnese cadastrada</p>
              <p className="mt-1 text-sm text-slate-400">Preencha o estilo de vida do aluno para orientar o plano com mais precisão.</p>
              <button className="btn-primary mt-4 w-full sm:w-auto" onClick={() => setEditing(true)}>Preencher anamnese</button>
            </div>
          )
        )}
      </Panel>
    </Stack>
  );
}

function WorkoutCrud({ data, student, user, commit }: { data: AppData; student: Student; user: User; commit: (data: AppData, message?: string) => void }) {
  const allWorkouts = (Array.isArray(data.workouts) ? data.workouts : []).map(normalizeWorkout);
  const createWorkoutForm = (studentId: string): Workout => ({
    id: '',
    studentId,
    name: '',
    objective: '',
    level: 'iniciante',
    place: 'academia',
    estimatedDuration: '45 min',
    weeklyFrequency: '3x',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    notes: '',
    completed: false,
    exercises: [emptyExercise()]
  });
  const [workout, setWorkout] = useState<Workout>(() => createWorkoutForm(student.id));
  const [isEditing, setIsEditing] = useState(true);
  useEffect(() => {
    setWorkout(createWorkoutForm(student.id));
    setIsEditing(true);
  }, [student.id]);
  const save = async () => {
    if (!workout.name) return;
    const nextWorkout = normalizeWorkout({ ...workout, id: workout.id || makeId('w'), studentId: workout.studentId || student.id, exercises: safeWorkoutExercises(workout) });
    try {
      const remoteId = await saveWorkoutRemote(nextWorkout, user.id);
      const savedWorkout = normalizeWorkout({ ...nextWorkout, id: remoteId ?? nextWorkout.id });
      commit({ ...data, workouts: [...allWorkouts.filter((item) => item.id !== nextWorkout.id), savedWorkout] }, workout.id ? 'Atualizado com sucesso.' : 'Salvo com sucesso.');
      setWorkout(savedWorkout);
      setIsEditing(false);
    } catch (error) {
      console.error('Erro ao salvar treino:', error);
      window.alert(error instanceof Error ? error.message : 'Não foi possível salvar o treino.');
    }
  };
  const editWorkout = (item: Workout) => {
    setWorkout(normalizeWorkout(item));
    setIsEditing(false);
    scrollToTop();
  };
  const deleteWorkout = async (item: Workout) => {
    if (!window.confirm('Tem certeza que deseja excluir este treino?')) return;
    try {
      await deleteWorkoutRemote(item.id);
      commit({
        ...data,
        workouts: allWorkouts.filter((workoutItem) => workoutItem.id !== item.id),
        workoutLogs: data.workoutLogs.filter((log) => log.workoutId !== item.id)
      }, 'Excluído com sucesso.');
      if (workout.id === item.id) {
        setWorkout(createWorkoutForm(student.id));
        setIsEditing(true);
      }
    } catch (error) {
      console.error('Erro ao excluir treino:', error);
      window.alert('Não foi possível excluir o treino.');
    }
  };

  return (
    <Stack>
      <PageTitle title="Criação de treinos" subtitle={`Treinos personalizados para ${studentDisplayName(student)}.`} />
      <Panel title={workout.id ? 'Treino selecionado' : 'Treino personalizado'}>
        {workout.id && <FormModeNotice editing={isEditing} />}
        <div className="grid gap-3 md:grid-cols-3">
          <Input label="Nome do treino" value={workout.name} onChange={(value) => setWorkout({ ...workout, name: value })} disabled={Boolean(workout.id) && !isEditing} />
          <Input label="Objetivo" value={workout.objective} onChange={(value) => setWorkout({ ...workout, objective: value })} disabled={Boolean(workout.id) && !isEditing} />
          <Select label="Nível" value={workout.level} onChange={(value) => setWorkout({ ...workout, level: value as Workout['level'] })} disabled={Boolean(workout.id) && !isEditing} options={[['iniciante', 'Iniciante'], ['intermediario', 'Intermediário'], ['avancado', 'Avançado']]} />
          <Select label="Local" value={workout.place} onChange={(value) => setWorkout({ ...workout, place: value as Workout['place'] })} disabled={Boolean(workout.id) && !isEditing} options={[['academia', 'Academia'], ['casa', 'Casa'], ['praia', 'Praia'], ['funcional', 'Funcional'], ['musculacao', 'Musculação'], ['caminhada', 'Caminhada'], ['outro', 'Outro']]} />
          <Input label="Duração estimada" value={workout.estimatedDuration} onChange={(value) => setWorkout({ ...workout, estimatedDuration: value })} disabled={Boolean(workout.id) && !isEditing} />
          <Input label="Frequência semanal" value={workout.weeklyFrequency} onChange={(value) => setWorkout({ ...workout, weeklyFrequency: value })} disabled={Boolean(workout.id) && !isEditing} />
          <Input label="Data de início" type="date" value={workout.startDate} onChange={(value) => setWorkout({ ...workout, startDate: value })} disabled={Boolean(workout.id) && !isEditing} />
          <Input label="Data de término" type="date" value={workout.endDate} onChange={(value) => setWorkout({ ...workout, endDate: value })} disabled={Boolean(workout.id) && !isEditing} />
          <Textarea label="Observações gerais" value={workout.notes} onChange={(value) => setWorkout({ ...workout, notes: value })} disabled={Boolean(workout.id) && !isEditing} />
        </div>
        <h3 className="mt-6 font-semibold">Exercícios</h3>
        <div className="mt-3 space-y-3">
          {safeWorkoutExercises(workout).map((exercise, index) => (
            <ExerciseEditor key={exercise.id} exercise={exercise} disabled={Boolean(workout.id) && !isEditing} onChange={(next) => setWorkout({ ...workout, exercises: safeWorkoutExercises(workout).map((item, itemIndex) => (itemIndex === index ? next : item)) })} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {isEditing && <button className="btn-secondary w-full sm:w-auto" onClick={() => setWorkout({ ...workout, exercises: [...safeWorkoutExercises(workout), emptyExercise()] })}><Plus size={16} /> Exercício</button>}
          {workout.id && !isEditing ? (
            <button className="btn-secondary w-full sm:w-auto" onClick={() => setIsEditing(true)}>Editar treino</button>
          ) : (
            <button className="btn-primary w-full sm:w-auto" onClick={save}>{workout.id ? 'Salvar alterações' : 'Salvar treino'}</button>
          )}
          {workout.id && isEditing && <button className="btn-secondary w-full sm:w-auto" onClick={() => { const original = allWorkouts.find((item) => item.id === workout.id); if (original) { setWorkout(normalizeWorkout(original)); setIsEditing(false); } }}>Cancelar</button>}
          {workout.id && <button className="btn-secondary w-full sm:w-auto" onClick={() => { setWorkout(createWorkoutForm(student.id)); setIsEditing(true); }}>Novo treino</button>}
        </div>
      </Panel>
      <div className="grid gap-3 lg:grid-cols-2">
        {allWorkouts.map((item) => (
          <Panel key={item.id} title={item.name} action={<Badge label={studentName(data, item.studentId)} />}>
            <p className="text-sm text-slate-400">{item.objective} - {item.estimatedDuration} - {item.weeklyFrequency}</p>
            <div className="mt-3 space-y-2">
              {safeWorkoutExercises(item).length ? (
                safeWorkoutExercises(item).map((exercise) => <Row key={exercise.id} title={exercise.name || 'Exercício sem nome'} meta={`${exercise.sets || '-'} x ${exercise.reps || '-'} - descanso ${exercise.rest || '-'}`} badge={exercise.status} />)
              ) : (
                <p className="rounded-md border border-line bg-ink/40 p-3 text-sm text-slate-300">Este treino ainda não possui exercícios cadastrados.</p>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-secondary w-full sm:w-auto" onClick={() => editWorkout(item)}>Editar treino</button>
              <button className="btn-danger w-full sm:w-auto" onClick={() => deleteWorkout(item)}>Excluir treino</button>
            </div>
          </Panel>
        ))}
      </div>
    </Stack>
  );
}

const phaseDescriptions: Record<string, string> = {
  Adaptação: 'preparar o corpo, aprender técnica e criar consistência.',
  Evolução: 'aumentar volume e melhorar resistência.',
  Intensificação: 'aumentar dificuldade, carga ou densidade do treino.',
  Manutenção: 'consolidar resultados e manter regularidade.',
  Recuperação: 'reduzir intensidade e favorecer recuperação.'
};

function buildPeriodizationPhases(weeks: 4 | 8 | 12): PeriodizationPhase[] {
  const plans: Record<4 | 8 | 12, { title: string; weeks: string; objective: string }[]> = {
    4: [
      { title: 'Adaptação', weeks: 'Semana 1', objective: 'Criar base técnica e rotina de treino.' },
      { title: 'Evolução', weeks: 'Semana 2', objective: 'Aumentar volume com controle.' },
      { title: 'Intensificação', weeks: 'Semana 3', objective: 'Elevar dificuldade sem perder qualidade.' },
      { title: 'Recuperação', weeks: 'Semana 4', objective: 'Reduzir intensidade e absorver adaptações.' }
    ],
    8: [
      { title: 'Adaptação', weeks: 'Semanas 1 e 2', objective: 'Consolidar técnica e consistência.' },
      { title: 'Evolução', weeks: 'Semanas 3 e 4', objective: 'Aumentar volume e resistência.' },
      { title: 'Intensificação', weeks: 'Semanas 5 e 6', objective: 'Subir carga, densidade ou complexidade.' },
      { title: 'Manutenção', weeks: 'Semana 7', objective: 'Sustentar desempenho e regularidade.' },
      { title: 'Recuperação', weeks: 'Semana 8', objective: 'Reduzir fadiga e favorecer recuperação.' }
    ],
    12: [
      { title: 'Adaptação', weeks: 'Semanas 1 e 2', objective: 'Preparar o corpo e ajustar execução.' },
      { title: 'Evolução', weeks: 'Semanas 3 a 5', objective: 'Progredir volume e resistência.' },
      { title: 'Intensificação', weeks: 'Semanas 6 a 8', objective: 'Aumentar carga, dificuldade ou densidade.' },
      { title: 'Manutenção', weeks: 'Semanas 9 e 10', objective: 'Consolidar resultados e frequência.' },
      { title: 'Recuperação', weeks: 'Semanas 11 e 12', objective: 'Reduzir intensidade e recuperar bem.' }
    ]
  };
  return plans[weeks].map((phase) => ({ ...phase, description: phaseDescriptions[phase.title] }));
}

function PeriodizationView({ data, student, commit }: { data: AppData; student: Student; commit: (data: AppData, message?: string) => void }) {
  const [weeks, setWeeks] = useState<4 | 8 | 12>(8);
  const periodization = data.periodizations.find((item) => item.studentId === student.id);
  const [isEditing, setIsEditing] = useState(!periodization);
  useEffect(() => {
    setWeeks(periodization?.weeks ?? 8);
    setIsEditing(!periodization);
  }, [student.id, periodization?.id]);
  const previewPhases = buildPeriodizationPhases(weeks);
  const savePeriodization = async () => {
    if (periodization && !window.confirm('Este aluno já possui uma periodização. Deseja substituir?')) return;
    const now = new Date().toISOString();
    const nextPeriodization: Periodization = {
      id: periodization?.id || makeId('p'),
      studentId: student.id,
      weeks,
      phases: previewPhases,
      startDate: periodization?.startDate || now.slice(0, 10),
      status: 'ativo',
      createdAt: periodization?.createdAt || now,
      updatedAt: now
    };
    try {
      const remoteId = await savePeriodizationRemote(nextPeriodization);
      const savedPeriodization = { ...nextPeriodization, id: remoteId ?? nextPeriodization.id };
      commit({
        ...data,
        periodizations: periodization
          ? data.periodizations.map((item) => (item.id === periodization.id ? savedPeriodization : item))
          : [...data.periodizations, savedPeriodization]
      }, periodization ? 'Periodização atualizada com sucesso.' : 'Periodização criada com sucesso.');
      setIsEditing(false);
    } catch (error) {
      console.error('Erro ao salvar periodização:', error);
      window.alert('Não foi possível salvar a periodização.');
    }
  };
  const editPeriodization = () => {
    if (periodization) {
      setWeeks(periodization.weeks);
      setIsEditing(true);
    }
  };
  const deletePeriodization = async () => {
    if (!periodization) return;
    if (!window.confirm('Tem certeza que deseja excluir a periodização deste aluno?')) return;
    try {
      await deletePeriodizationRemote(periodization.id);
      commit({ ...data, periodizations: data.periodizations.filter((item) => item.id !== periodization.id) }, 'Periodização excluída com sucesso.');
      setIsEditing(true);
    } catch (error) {
      console.error('Erro ao excluir periodização:', error);
      window.alert('Não foi possível excluir a periodização.');
    }
  };
  return (
    <Stack>
      <PageTitle title="Periodização" subtitle={`${studentDisplayName(student)} - planejamento visual de ciclos por fase.`} />
      <Panel title="Criar periodização">
        {periodization && <FormModeNotice editing={isEditing} />}
        <div className="flex flex-wrap gap-2">
          {[4, 8, 12].map((item) => <button key={item} className={weeks === item ? 'chip-active' : 'chip'} disabled={Boolean(periodization) && !isEditing} onClick={() => setWeeks(item as 4 | 8 | 12)}>{item} semanas</button>)}
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {previewPhases.map((phase, index) => (
            <div key={`${phase.title}-${phase.weeks}`} className="rounded-md border border-line bg-ink/50 p-4">
              <p className="text-xs text-slate-500">Fase {index + 1}</p>
              <p className="font-semibold">{phase.title}</p>
              <p className="mt-1 text-sm text-fitblue">{phase.weeks}</p>
              <p className="mt-2 text-sm text-slate-300">{phase.description}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {periodization && !isEditing ? (
            <button className="btn-secondary w-full sm:w-auto" onClick={editPeriodization}>Editar periodização</button>
          ) : (
            <button className="btn-primary w-full sm:w-auto" onClick={savePeriodization}>{periodization ? 'Salvar alterações' : 'Criar periodização'}</button>
          )}
          {periodization && isEditing && <button className="btn-secondary w-full sm:w-auto" onClick={() => { setWeeks(periodization.weeks); setIsEditing(false); }}>Cancelar</button>}
        </div>
      </Panel>
      {periodization ? (
        <Panel title="Periodização ativa" action={<Badge label={periodization.status} />}>
          <div className="grid gap-3 md:grid-cols-3">
            <InfoBox label="Aluno" value={studentDisplayName(student)} />
            <InfoBox label="Duração escolhida" value={`${periodization.weeks} semanas`} />
            <InfoBox label="Data de criação" value={formatDate(periodization.startDate || periodization.createdAt)} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {periodization.phases.map((phase, index) => (
              <div key={`${periodization.id}-${phase.title}-${index}`} className="rounded-md border border-line bg-ink/40 p-4">
                <p className="text-xs text-slate-500">Fase {index + 1}</p>
                <h3 className="mt-1 font-bold">{phase.title}</h3>
                <p className="mt-1 text-sm font-semibold text-fitgreen">{phase.weeks}</p>
                <p className="mt-2 text-sm text-slate-300">{phase.objective}</p>
                <p className="mt-2 text-xs leading-5 text-slate-400">{phase.description}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-secondary w-full sm:w-auto" onClick={editPeriodization}>Editar periodização</button>
            <button className="btn-danger w-full sm:w-auto" onClick={deletePeriodization}>Excluir periodização</button>
          </div>
        </Panel>
      ) : (
        <Empty title="Nenhuma periodização criada para este aluno." text="Escolha a duração do ciclo e crie uma periodização vinculada ao aluno selecionado." />
      )}
    </Stack>
  );
}

function CheckinsView({
  data,
  selectedStudentId,
  selectedStudent,
  commit
}: {
  data: AppData;
  selectedStudentId: string;
  selectedStudent?: Student;
  commit: (data: AppData, message?: string) => void;
}) {
  const [copyFeedback, setCopyFeedback] = useState('');
  const [expandedCheckIns, setExpandedCheckIns] = useState<Record<string, boolean>>({});
  const currentStudent = selectedStudent ?? data.students.find((student) => student.id === selectedStudentId);
  const selectedCheckins = data.checkIns.filter(
    (item) => item.studentId === selectedStudentId
  ).sort((a, b) => getCheckInDateValue(b).localeCompare(getCheckInDateValue(a)));
  useEffect(() => {
    setCopyFeedback('');
    setExpandedCheckIns({});
  }, [selectedStudentId]);
  const copyReminder = async () => {
    const student = currentStudent;
    if (!student) {
      window.alert('Selecione um aluno para copiar o lembrete.');
      return;
    }
    const message = `Olá, ${studentDisplayName(student)}! Não esqueça de responder seu check-in semanal no app para eu acompanhar sua evolução e ajustar seu treino.`;
    try {
      await copyTextToClipboard(message);
      setCopyFeedback('Lembrete copiado com sucesso.');
    } catch (error) {
      window.alert('Não foi possível copiar o lembrete.');
    }
  };
  const deleteCheckIn = async (checkIn: CheckIn) => {
    if (!window.confirm('Tem certeza que deseja excluir este check-in?')) return;
    try {
      await deleteCheckInRemote(checkIn.id);
      commit({ ...data, checkIns: data.checkIns.filter((item) => item.id !== checkIn.id) }, 'Excluído com sucesso.');
    } catch (error) {
      console.error('Erro ao excluir check-in:', error);
      window.alert('Não foi possível excluir o check-in.');
    }
  };
  return (
    <Stack>
      <PageTitle title="Check-in semanal" subtitle={`${currentStudent ? studentDisplayName(currentStudent) : 'Selecione um aluno'} - respostas para ajuste de treino e conduta.`} />
      {selectedCheckins.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {selectedCheckins.map((checkIn) => {
            const checkInStudent = data.students.find((student) => student.id === checkIn.studentId) ?? currentStudent;
            const photoUrl = getCheckInPhotoUrl(checkIn);
            const expanded = Boolean(expandedCheckIns[checkIn.id]);
            return (
              <Panel key={checkIn.id} title={`Check-in de ${checkInStudent ? studentDisplayName(checkInStudent) : studentName(data, checkIn.studentId)}`}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <InfoBox label="Aluno" value={checkInStudent ? studentDisplayName(checkInStudent) : studentName(data, checkIn.studentId)} />
                  <InfoBox label="Data do check-in" value={formatDate(getCheckInDateValue(checkIn))} />
                  <InfoBox label="Peso atual" value={checkIn.currentWeight ? `${checkIn.currentWeight} kg` : 'Não informado'} />
                  <InfoBox label="Motivação" value={`${checkIn.motivation || 0}/10`} />
                  <InfoBox label="Status" value={<Badge label="Respondido" />} />
                </div>
                <button
                  className="btn-secondary mt-4 w-full sm:w-auto"
                  onClick={() => setExpandedCheckIns({ ...expandedCheckIns, [checkIn.id]: !expanded })}
                >
                  {expanded ? 'Ocultar check-in completo' : 'Ver check-in completo'}
                </button>
                {expanded && (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <InfoBox label="Treinos feitos" value={`${checkIn.trainingsDone} na semana`} />
                      <InfoBox label="Como me senti" value={checkIn.energy || 'Não informado'} />
                      <InfoBox label="Sono" value={checkIn.sleep || 'Não informado'} />
                      <InfoBox label="Alimentação" value={checkIn.food || 'Não informado'} />
                      <InfoBox label="Energia" value={checkIn.energy || 'Não informado'} />
                      <InfoBox label="Estresse" value={`${checkIn.stress || 0}/10`} />
                      <InfoBox label="Objetivos" value={checkInStudent?.goal || 'Não informado'} />
                      <InfoBox label="Metas" value={checkInStudent?.target || 'Não informado'} />
                      <InfoBox label="Minha dificuldade" value={checkIn.difficulty || 'Não informado'} />
                      <InfoBox label="Minha vitória" value={checkIn.victory || 'Não informado'} />
                      <InfoBox label="Observações livres" value={checkIn.notes || 'Não informado'} />
                    </div>
                    <div className="rounded-md border border-line bg-ink/40 p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Foto anexada</p>
                      {photoUrl ? (
                        <img src={photoUrl} alt="Foto anexada ao check-in" className="mt-3 max-h-80 w-full rounded-md border border-line object-cover" />
                      ) : (
                        <p className="mt-2 text-sm text-slate-300">Sem foto anexada.</p>
                      )}
                    </div>
                  </div>
                )}
                <button className="btn-danger mt-4 w-full sm:w-auto" onClick={() => deleteCheckIn(checkIn)}>Excluir check-in</button>
              </Panel>
            );
          })}
        </div>
      ) : (
        <Panel title={selectedStudentId ? 'Nenhum check-in respondido ainda para este aluno.' : 'Nenhum check-in respondido ainda'}>
          <p className="text-sm text-slate-300">Peça para o aluno responder o check-in na área do aluno.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button className="btn-primary w-full sm:w-auto" onClick={copyReminder}>Copiar lembrete de check-in</button>
            {copyFeedback && <span className="text-sm font-semibold text-fitgreen">{copyFeedback}</span>}
          </div>
        </Panel>
      )}
    </Stack>
  );
}

function EvolutionView({ data, student, compact = false }: { data: AppData; student: Student; compact?: boolean }) {
  const evolutionSummary = getStudentEvolutionSummary(student, data.assessments);
  const assessments = evolutionSummary.assessments;
  const evolutionComparisonChart = [
    { name: 'Peso inicial', valor: evolutionSummary.initialWeight, unidade: 'kg' },
    { name: 'Peso atual', valor: evolutionSummary.currentWeight, unidade: 'kg' },
    ...(evolutionSummary.assessmentCount
      ? [
          { name: 'Gordura inicial', valor: evolutionSummary.initialBodyFat, unidade: '%' },
          { name: 'Gordura atual', valor: evolutionSummary.currentBodyFat, unidade: '%' }
        ]
      : [])
  ];
  const checkIns = data.checkIns.filter((item) => item.studentId === student.id);
  const workoutLogs = workoutLogsForStudent(data, student.id);
  const latestWorkoutLog = workoutLogs[0];
  const latestWorkoutDateTime = formatDateTimeParts(latestWorkoutLog?.completedAt);
  return (
    <Stack>
      <PageTitle title="Evolução do aluno" subtitle={`${student.fullName} - histórico, medidas, frequência e conquistas.`} />
      {!compact && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Peso inicial" value={`${evolutionSummary.initialWeight} kg`} icon={Activity} accent="blue" />
          <StatCard label="Peso atual" value={`${evolutionSummary.currentWeight} kg`} icon={LineChart} accent="green" />
          <StatCard label="Gordura inicial" value={evolutionSummary.assessmentCount ? `${evolutionSummary.initialBodyFat}%` : 'Sem registro'} icon={Activity} accent="orange" />
          <StatCard label="Gordura atual" value={evolutionSummary.assessmentCount ? `${evolutionSummary.currentBodyFat}%` : 'Sem registro'} icon={LineChart} accent="green" />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Check-ins" value={checkIns.length} icon={CalendarCheck} accent="orange" />
        <StatCard label="Treinos feitos" value={workoutLogs.length} icon={Dumbbell} accent="green" />
      </div>
      {!compact && <Panel title="Fonte dos dados">
        <p className="text-sm text-slate-300">{evolutionSummary.source}</p>
      </Panel>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Último treino realizado" value={latestWorkoutLog ? `${workoutName(data, latestWorkoutLog.workoutId)} - ${latestWorkoutDateTime.date} ${latestWorkoutDateTime.time}` : 'Sem registros'} icon={Dumbbell} accent="green" />
        <StatCard label="Dias sem treinar" value={latestWorkoutLog ? `${daysSince(latestWorkoutLog.completedAt)} dias` : '-'} icon={CalendarCheck} accent="orange" />
        <StatCard label="Treinos no mês" value={monthWorkoutCount(workoutLogs)} icon={Activity} accent="blue" />
        <StatCard label="Aderência ao plano" value={`${planAdherence(data, student, workoutLogs)}%`} icon={LineChart} accent="green" />
      </div>
      <Panel title="Gráfico de evolução física">
        {evolutionComparisonChart.length ? (
          <div className={compact ? 'h-56' : 'h-72'}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={evolutionComparisonChart} layout="vertical" margin={{ top: 8, right: 16, left: 12, bottom: 8 }}>
                <CartesianGrid stroke="#1d2b3d" />
                <XAxis type="number" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <YAxis dataKey="name" type="category" stroke="#cbd5e1" width={112} tick={{ fontSize: 13, fontWeight: 700 }} />
                <Tooltip
                  cursor={false}
                  formatter={(value, _name, item) => [`${value} ${(item.payload as { unidade?: string }).unidade ?? ''}`, item.payload.name]}
                  contentStyle={{ background: '#0d1726', border: '1px solid #1d2b3d', boxShadow: 'none' }}
                />
                <Bar dataKey="valor" name="Valor" fill="#38bdf8" radius={[0, 6, 6, 0]} activeBar={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <Empty title="Este aluno ainda não possui dados de peso." text="Informe peso no cadastro ou registre uma avaliação física." />}
      </Panel>
      <WorkoutLogHistory data={data} logs={workoutLogs} compactLimit={compact ? 3 : undefined} collapsible={compact} />
      <HistoryList assessments={assessments} />
    </Stack>
  );
}

function FinanceView({ data, student, commit }: { data: AppData; student?: Student; commit: (data: AppData, message?: string) => void }) {
  const createPaymentForm = (selectedStudent?: Student): Payment => ({
    id: '',
    studentId: selectedStudent?.id ?? '',
    plan: selectedStudent?.plan || 'Plano mensal',
    amount: 0,
    method: 'Pix',
    recurrence: 'mensal',
    status: 'pendente',
    dueDate: new Date().toISOString().slice(0, 10),
    notes: ''
  });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Payment>(() => createPaymentForm(student));
  const [isEditing, setIsEditing] = useState(true);
  useEffect(() => {
    setForm(createPaymentForm(student));
    setShowForm(false);
    setIsEditing(true);
  }, [student?.id]);
  const payments = student ? data.payments.filter((item) => item.studentId === student.id) : data.payments;
  const totalPending = data.payments.filter((item) => item.status !== 'pago').reduce((sum, item) => sum + item.amount, 0);
  const savePayment = async () => {
    if (!student?.id) {
      window.alert('Selecione um aluno antes de cadastrar pagamento.');
      return;
    }
    const nextPayment: Payment = { ...form, id: form.id || makeId('pay'), studentId: student.id, amount: numberOrZero(form.amount) };
    try {
      const remoteId = await savePaymentRemote(nextPayment);
      const savedPayment = { ...nextPayment, id: remoteId ?? nextPayment.id };
      commit({
        ...data,
        payments: [...data.payments.filter((item) => item.id !== savedPayment.id), savedPayment]
      }, form.id ? 'Atualizado com sucesso.' : 'Salvo com sucesso.');
      setForm(savedPayment);
      setShowForm(true);
      setIsEditing(false);
    } catch (error) {
      console.error('Erro ao salvar pagamento:', error);
      window.alert('Não foi possível salvar o pagamento. Verifique os campos e tente novamente.');
    }
  };
  const updatePaymentStatus = async (payment: Payment, status: Payment['status']) => {
    const nextPayment = { ...payment, status };
    try {
      await savePaymentRemote(nextPayment);
      commit({ ...data, payments: data.payments.map((item) => (item.id === payment.id ? nextPayment : item)) }, 'Status financeiro atualizado.');
    } catch (error) {
      console.error('Erro ao atualizar pagamento:', error);
      window.alert('Não foi possível atualizar o status do pagamento.');
    }
  };
  const editPayment = (payment: Payment) => {
    setForm({ ...payment });
    setShowForm(true);
    setIsEditing(false);
    scrollToTop();
  };
  const deletePayment = async (payment: Payment) => {
    if (!window.confirm('Tem certeza que deseja excluir este pagamento?')) return;
    try {
      await deletePaymentRemote(payment.id);
      commit({ ...data, payments: data.payments.filter((item) => item.id !== payment.id) }, 'Excluído com sucesso.');
      if (form.id === payment.id) {
        setForm(createPaymentForm(student));
        setShowForm(false);
        setIsEditing(true);
      }
    } catch (error) {
      console.error('Erro ao excluir pagamento:', error);
      window.alert('Não foi possível excluir o pagamento.');
    }
  };
  return (
    <Stack>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageTitle title="Gestão financeira" subtitle={`${student ? studentDisplayName(student) : 'Todos os alunos'} - pendências atuais: ${formatCurrency(totalPending)}.`} />
        <button className="btn-primary w-full sm:w-auto" onClick={() => { setForm(createPaymentForm(student)); setShowForm(true); setIsEditing(true); }}>Cadastrar pagamento</button>
      </div>
      {(showForm || payments.length === 0) && (
        <Panel title={form.id ? 'Pagamento selecionado' : 'Cadastrar pagamento'}>
          {!payments.length && <p className="mb-4 rounded-md border border-fitblue/30 bg-fitblue/10 p-3 text-sm text-slate-200">Nenhum pagamento cadastrado para este aluno. Registre o primeiro vencimento para acompanhar cobranças.</p>}
          {form.id && <FormModeNotice editing={isEditing} />}
          <div className="grid gap-3 md:grid-cols-3">
            <Input label="Plano" value={form.plan} onChange={(value) => setForm({ ...form, plan: value })} disabled={Boolean(form.id) && !isEditing} />
            <Input label="Valor" type="number" value={String(form.amount)} onChange={(value) => setForm({ ...form, amount: numberOrZero(value) })} disabled={Boolean(form.id) && !isEditing} />
            <Select label="Forma de pagamento" value={form.method} onChange={(value) => setForm({ ...form, method: value as Payment['method'] })} disabled={Boolean(form.id) && !isEditing} options={[['Pix', 'Pix'], ['cartao', 'Cartão'], ['dinheiro', 'Dinheiro']]} />
            <Select label="Recorrência" value={form.recurrence} onChange={(value) => setForm({ ...form, recurrence: value as Payment['recurrence'] })} disabled={Boolean(form.id) && !isEditing} options={[['semanal', 'Semanal'], ['mensal', 'Mensal'], ['trimestral', 'Trimestral'], ['avulso', 'Avulso']]} />
            <Select label="Status" value={form.status} onChange={(value) => setForm({ ...form, status: value as Payment['status'] })} disabled={Boolean(form.id) && !isEditing} options={[['pago', 'Pago'], ['pendente', 'Pendente'], ['atrasado', 'Atrasado']]} />
            <Input label="Vencimento" type="date" value={form.dueDate} onChange={(value) => setForm({ ...form, dueDate: value })} disabled={Boolean(form.id) && !isEditing} />
            <Textarea label="Observações" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} disabled={Boolean(form.id) && !isEditing} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {form.id && !isEditing ? (
              <button className="btn-secondary w-full sm:w-auto" onClick={() => setIsEditing(true)}>Editar pagamento</button>
            ) : (
              <button className="btn-primary w-full sm:w-auto" onClick={savePayment}>{form.id ? 'Salvar alterações' : 'Salvar pagamento'}</button>
            )}
            {form.id && isEditing && <button className="btn-secondary w-full sm:w-auto" onClick={() => { const original = data.payments.find((item) => item.id === form.id); if (original) { setForm({ ...original }); setIsEditing(false); } }}>Cancelar</button>}
            {form.id && <button className="btn-secondary w-full sm:w-auto" onClick={() => { setForm(createPaymentForm(student)); setShowForm(true); setIsEditing(true); }}>Novo pagamento</button>}
          </div>
        </Panel>
      )}
      <div className="grid gap-3">
        {payments.map((payment) => (
          <Panel key={payment.id} title={studentName(data, payment.studentId)} action={<Badge label={payment.status} />}>
            <div className="grid gap-3 md:grid-cols-4">
              <InfoBox label="Plano" value={payment.plan} />
              <InfoBox label="Valor" value={formatCurrency(payment.amount)} />
              <InfoBox label="Forma" value={payment.method} />
              <InfoBox label="Vencimento" value={`${formatDate(payment.dueDate)} (${daysUntil(payment.dueDate)} dias)`} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(['pago', 'pendente', 'atrasado'] as const).map((status) => (
                <button key={status} className={payment.status === status ? 'chip-active' : 'chip'} disabled>{status}</button>
              ))}
              <button className="btn-secondary w-full sm:w-auto" onClick={() => editPayment(payment)}>Editar pagamento</button>
              <button className="btn-danger w-full sm:w-auto" onClick={() => deletePayment(payment)}>Excluir pagamento</button>
            </div>
          </Panel>
        ))}
      </div>
    </Stack>
  );
}

function PersonalSettingsView({ data, commit }: { data: AppData; commit: (data: AppData, message?: string) => void }) {
  const rawSettings = data.personalSettings ?? defaultPersonalSettings;
  const currentSettings = {
    ...defaultPersonalSettings,
    ...rawSettings,
    whatsappMessage: rawSettings.whatsappMessage || rawSettings.whatsappMessageTemplate || defaultPersonalSettings.whatsappMessage,
    whatsappMessageTemplate: rawSettings.whatsappMessageTemplate || rawSettings.whatsappMessage || defaultPersonalSettings.whatsappMessageTemplate
  };
  const [form, setForm] = useState<PersonalSettings>(currentSettings);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const nextSettings = {
      ...defaultPersonalSettings,
      ...(data.personalSettings ?? {}),
      whatsappMessage:
        data.personalSettings?.whatsappMessage ||
        data.personalSettings?.whatsappMessageTemplate ||
        defaultPersonalSettings.whatsappMessage,
      whatsappMessageTemplate:
        data.personalSettings?.whatsappMessageTemplate ||
        data.personalSettings?.whatsappMessage ||
        defaultPersonalSettings.whatsappMessageTemplate
    };
    setForm(nextSettings);
    setIsEditing(false);
  }, [data.personalSettings]);

  const cancel = () => {
    setForm(currentSettings);
    setIsEditing(false);
  };

  const saveSettings = () => {
    const nextSettings = {
      ...defaultPersonalSettings,
      ...form,
      whatsappMessageTemplate: form.whatsappMessageTemplate || form.whatsappMessage
    };
    savePersonalSettings(nextSettings);
    commit({ ...data, personalSettings: nextSettings }, 'Configurações atualizadas com sucesso.');
    setIsEditing(false);
  };

  return (
    <Stack>
      <PageTitle title="⚙️ Configurações do Personal" subtitle="Personalize seus dados profissionais e informações de contato." />
      <Panel title="Dados do Personal">
        <p className={`mb-4 rounded-md border px-3 py-2 text-sm font-semibold ${isEditing ? 'border-fitblue/30 bg-fitblue/10 text-fitblue' : 'border-line bg-ink/40 text-slate-300'}`}>
          {isEditing ? 'Modo edição ativo.' : 'Modo visualização. Clique em Editar configurações para alterar os dados.'}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="Nome do personal" value={form.personalName} onChange={(value) => setForm({ ...form, personalName: value })} disabled={!isEditing} />
          <Input label="WhatsApp do personal" value={form.personalWhatsApp} onChange={(value) => setForm({ ...form, personalWhatsApp: value })} disabled={!isEditing} />
          <Input label="Instagram" value={form.instagram} onChange={(value) => setForm({ ...form, instagram: value })} disabled={!isEditing} />
          <Input label="Nome da marca" value={form.brandName} onChange={(value) => setForm({ ...form, brandName: value })} disabled={!isEditing} />
          <Input label="E-mail profissional" type="email" value={form.professionalEmail} onChange={(value) => setForm({ ...form, professionalEmail: value })} disabled={!isEditing} />
          <Input label="Cidade/atendimento" value={form.serviceCity} onChange={(value) => setForm({ ...form, serviceCity: value })} disabled={!isEditing} />
          <Textarea label="Slogan" value={form.slogan} onChange={(value) => setForm({ ...form, slogan: value })} disabled={!isEditing} />
          <Textarea label="Mensagem padrão do WhatsApp" value={form.whatsappMessage} onChange={(value) => setForm({ ...form, whatsappMessage: value, whatsappMessageTemplate: value })} disabled={!isEditing} />
          <div className="md:col-span-2">
            <Textarea label="Observações" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} disabled={!isEditing} />
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {isEditing ? (
            <>
              <button className="btn-primary w-full sm:w-auto" onClick={saveSettings}>Salvar alterações</button>
              <button className="btn-secondary w-full sm:w-auto" onClick={cancel}>Cancelar</button>
            </>
          ) : (
            <button className="btn-secondary w-full sm:w-auto" onClick={() => setIsEditing(true)}>Editar configurações</button>
          )}
        </div>
      </Panel>
      <Panel title="Prévia de contato">
        <div className="grid gap-3 md:grid-cols-3">
          <InfoBox label="Personal" value={currentSettings.personalName} />
          <InfoBox label="WhatsApp" value={currentSettings.personalWhatsApp} />
          <InfoBox label="Marca" value={currentSettings.brandName} />
        </div>
        <p className="mt-4 rounded-md border border-line bg-ink/40 p-3 text-sm leading-6 text-slate-300">
          {applyPersonalTemplate(currentSettings.whatsappMessage, {
            personalName: currentSettings.personalName,
            studentName: 'Aluno Teste',
            brandName: currentSettings.brandName
          })}
        </p>
      </Panel>
    </Stack>
  );
}

const defaultMessages: MessageTemplate[] = [
  { id: 'default-welcome', type: 'Boas-vindas', title: 'Boas-vindas', content: 'Olá! Seja bem-vindo ao acompanhamento. A partir de hoje vamos monitorar seus treinos, evolução e check-ins pelo app.' },
  { id: 'default-checkin', type: 'Lembrete de check-in', title: 'Lembrete de check-in', content: 'Olá! Não esqueça de responder seu check-in semanal no app para eu acompanhar sua evolução e ajustar seu treino.' },
  { id: 'default-motivation', type: 'Motivação', title: 'Motivação', content: 'Continue firme. O resultado vem da consistência, e cada treino concluído conta para sua evolução.' },
  { id: 'default-billing', type: 'Cobrança amigável', title: 'Cobrança amigável', content: 'Olá! Passando para lembrar do pagamento do seu plano. Qualquer dúvida, me chama por aqui.' },
  { id: 'default-progress', type: 'Parabéns pela evolução', title: 'Parabéns pela evolução', content: 'Parabéns pela evolução! Seu progresso mostra que o processo está funcionando. Vamos seguir ajustando para melhorar ainda mais.' }
];

const defaultMarketingIdeas: MarketingIdea[] = [
  { id: 'default-reels', category: 'Reels', title: 'Reels', content: 'Grave um antes e depois de execução: erro comum no agachamento, correção rápida e chamada para avaliação.' },
  { id: 'default-stories', category: 'Stories', title: 'Stories', content: 'Abra uma enquete: “Qual sua maior dificuldade para treinar essa semana?” e responda com uma dica prática.' },
  { id: 'default-whatsapp', category: 'WhatsApp', title: 'WhatsApp', content: 'Mensagem direta: “Tenho 3 horários para acompanhamento este mês. Quer fazer uma aula experimental?”' },
  { id: 'default-trial', category: 'Aula experimental', title: 'Aula experimental', content: 'Oferta simples: aula experimental com avaliação rápida de objetivo, rotina e nível de treino.' },
  { id: 'default-offer', category: 'Oferta de plano', title: 'Oferta de plano', content: 'Plano trimestral com check-in semanal, treino personalizado e avaliação mensal de evolução.' }
];

function MessagesView({ data }: { data: AppData }) {
  const [copiedId, setCopiedId] = useState('');
  const messages = data.messages.length ? data.messages : defaultMessages;
  const copyMessage = async (message: MessageTemplate) => {
    try {
      await copyTextToClipboard(message.content);
      setCopiedId(message.id);
    } catch (error) {
      window.alert('Não foi possível copiar a mensagem.');
    }
  };
  return (
    <Stack>
      <PageTitle title="Comunicação e mensagens" subtitle="Modelos prontos para WhatsApp e acompanhamento." />
      <div className="grid gap-3 lg:grid-cols-3">
        {messages.map((message) => (
          <Panel key={message.id} title={message.title} action={<Badge label={message.type} />}>
            <p className="text-sm leading-6 text-slate-300">{message.content}</p>
            <button className="btn-secondary mt-4 w-full" onClick={() => copyMessage(message)}>Copiar mensagem</button>
            {copiedId === message.id && <p className="mt-2 text-sm font-semibold text-fitgreen">Mensagem copiada.</p>}
          </Panel>
        ))}
      </div>
    </Stack>
  );
}

function MarketingView({ data }: { data: AppData }) {
  const [copiedId, setCopiedId] = useState('');
  const ideas = data.marketingIdeas.length ? data.marketingIdeas : defaultMarketingIdeas;
  const copyIdea = async (idea: MarketingIdea) => {
    try {
      await copyTextToClipboard(idea.content);
      setCopiedId(idea.id);
    } catch (error) {
      window.alert('Não foi possível copiar a ideia.');
    }
  };
  return (
    <Stack>
      <PageTitle title="Marketing para o personal" subtitle="Ideias de conteúdo, chamadas, ofertas e mensagens." />
      <div className="grid gap-3 lg:grid-cols-3">
        {ideas.map((idea) => (
          <Panel key={idea.id} title={idea.title} action={<Badge label={idea.category} />}>
            <p className="text-sm leading-6 text-slate-300">{idea.content}</p>
            <button className="btn-secondary mt-4 w-full" onClick={() => copyIdea(idea)}>Copiar ideia</button>
            {copiedId === idea.id && <p className="mt-2 text-sm font-semibold text-fitgreen">Ideia copiada.</p>}
          </Panel>
        ))}
      </div>
    </Stack>
  );
}

type TimelineEvent = {
  id: string;
  icon: string;
  title: string;
  date: string;
  details: string[];
};

type WaterRecord = {
  studentId: string;
  date: string;
  waterGoal: number;
  waterConsumed: number;
};

type WeeklyGoalCategory = 'Treino' | 'Água' | 'Check-in' | 'Peso' | 'Alimentação' | 'Sono' | 'Motivação' | 'Outro';
type WeeklyGoalStatus = 'Em andamento' | 'Concluída' | 'Atrasada' | 'Cancelada';

type WeeklyGoal = {
  id: string;
  studentId: string;
  weekStartDate: string;
  weekEndDate: string;
  title: string;
  category: WeeklyGoalCategory;
  targetValue: number;
  currentValue: number;
  unit: string;
  status: WeeklyGoalStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

const waterStorageKey = 'personalpro-water-records';
const weeklyGoalsStorageKey = 'personalpro-weekly-goals';
const waterGoalLiters = 3;
const weeklyGoalCategories: WeeklyGoalCategory[] = ['Treino', 'Água', 'Check-in', 'Peso', 'Alimentação', 'Sono', 'Motivação', 'Outro'];
const weeklyGoalStatuses: WeeklyGoalStatus[] = ['Em andamento', 'Concluída', 'Atrasada', 'Cancelada'];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeWaterValue(value: number) {
  return Math.max(0, Math.round(value * 100) / 100);
}

function loadWaterRecords(): WaterRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(waterStorageKey);
    return raw ? JSON.parse(raw) as WaterRecord[] : [];
  } catch (error) {
    console.error('Erro ao carregar controle de água:', error);
    return [];
  }
}

function saveWaterRecords(records: WaterRecord[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(waterStorageKey, JSON.stringify(records));
}

function loadWeeklyGoals(): WeeklyGoal[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(weeklyGoalsStorageKey);
    const parsed = raw ? JSON.parse(raw) as WeeklyGoal[] : [];
    return Array.isArray(parsed) ? parsed.map(normalizeWeeklyGoal).filter((goal) => goal.studentId) : [];
  } catch (error) {
    console.error('Erro ao carregar metas semanais:', error);
    return [];
  }
}

function saveWeeklyGoals(goals: WeeklyGoal[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(weeklyGoalsStorageKey, JSON.stringify(goals));
  window.dispatchEvent(new Event('personalpro-weekly-goals-updated'));
}

function normalizeWeeklyGoal(goal: Partial<WeeklyGoal>): WeeklyGoal {
  const now = new Date().toISOString();
  const week = getCurrentWeekRange();
  const category = weeklyGoalCategories.includes(goal.category as WeeklyGoalCategory) ? goal.category as WeeklyGoalCategory : 'Outro';
  const status = weeklyGoalStatuses.includes(goal.status as WeeklyGoalStatus) ? goal.status as WeeklyGoalStatus : 'Em andamento';
  return {
    id: String(goal.id || makeId('weekly-goal')),
    studentId: String(goal.studentId || ''),
    weekStartDate: dateKey(goal.weekStartDate) || week.start,
    weekEndDate: dateKey(goal.weekEndDate) || week.end,
    title: String(goal.title || ''),
    category,
    targetValue: Number(goal.targetValue || 0),
    currentValue: Number(goal.currentValue || 0),
    unit: String(goal.unit || ''),
    status,
    notes: String(goal.notes || ''),
    createdAt: String(goal.createdAt || now),
    updatedAt: String(goal.updatedAt || now)
  };
}

function getCurrentWeekRange(date = new Date()) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: dateKey(start.toISOString()), end: dateKey(end.toISOString()) };
}

function isDateBetween(value: string, start: string, end: string) {
  const key = dateKey(value);
  return Boolean(key && key >= start && key <= end);
}

function getWeeklyGoalComputedValue(goal: WeeklyGoal, data: AppData, waterRecords: WaterRecord[]) {
  if (goal.category === 'Treino') {
    return data.workoutLogs.filter((log) => log.studentId === goal.studentId && isDateBetween(getWorkoutLogCompletedAt(log), goal.weekStartDate, goal.weekEndDate)).length;
  }
  if (goal.category === 'Água') {
    return waterRecords.filter((record) => record.studentId === goal.studentId && isDateBetween(record.date, goal.weekStartDate, goal.weekEndDate) && record.waterConsumed >= record.waterGoal).length;
  }
  if (goal.category === 'Check-in') {
    return data.checkIns.filter((checkIn) => checkIn.studentId === goal.studentId && isDateBetween(getCheckInDateValue(checkIn), goal.weekStartDate, goal.weekEndDate)).length;
  }
  return goal.currentValue;
}

function resolveWeeklyGoal(goal: WeeklyGoal, data: AppData, waterRecords: WaterRecord[]) {
  const currentValue = getWeeklyGoalComputedValue(goal, data, waterRecords);
  const targetValue = Number(goal.targetValue || 0);
  const progress = targetValue > 0 ? Math.min(100, Math.round((currentValue / targetValue) * 100)) : 0;
  const today = todayKey();
  const computedStatus: WeeklyGoalStatus =
    goal.status === 'Cancelada' ? 'Cancelada' :
    currentValue >= targetValue && targetValue > 0 ? 'Concluída' :
    goal.weekEndDate < today ? 'Atrasada' :
    'Em andamento';
  return { ...goal, currentValue, status: computedStatus, progress };
}

function getStudentWeeklyGoals(goals: WeeklyGoal[], studentId: string, data: AppData, waterRecords: WaterRecord[]) {
  return goals
    .filter((goal) => goal.studentId === studentId)
    .map((goal) => resolveWeeklyGoal(goal, data, waterRecords))
    .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate) || b.updatedAt.localeCompare(a.updatedAt));
}

function summarizeWeeklyGoals(goals: ReturnType<typeof getStudentWeeklyGoals>) {
  return {
    total: goals.length,
    inProgress: goals.filter((goal) => goal.status === 'Em andamento').length,
    completed: goals.filter((goal) => goal.status === 'Concluída').length,
    overdue: goals.filter((goal) => goal.status === 'Atrasada').length,
    canceled: goals.filter((goal) => goal.status === 'Cancelada').length
  };
}

function weeklyGoalStatusClass(status: WeeklyGoalStatus) {
  if (status === 'Concluída') return 'border-fitgreen/40 bg-fitgreen/10 text-fitgreen';
  if (status === 'Atrasada') return 'border-fitorange/40 bg-fitorange/10 text-fitorange';
  if (status === 'Cancelada') return 'border-slate-500/30 bg-slate-500/10 text-slate-300';
  return 'border-fitblue/40 bg-fitblue/10 text-fitblue';
}

function waterCelebrationKey(studentId: string, date: string) {
  return `waterCelebrated_${studentId}_${date}`;
}

function hasCelebratedWaterGoal(studentId: string, date: string) {
  return typeof window !== 'undefined' && window.localStorage.getItem(waterCelebrationKey(studentId, date)) === 'true';
}

function markWaterGoalCelebrated(studentId: string, date: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(waterCelebrationKey(studentId, date), 'true');
}

function lastWaterActionKey(studentId: string, date: string) {
  return `personalpro-last-water-action:${studentId}:${date}`;
}

function loadLastWaterAction(studentId: string, date = todayKey()) {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(lastWaterActionKey(studentId, date));
}

function saveLastWaterAction(studentId: string, date: string, action: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(lastWaterActionKey(studentId, date), action);
}

function getWaterRecord(records: WaterRecord[], studentId: string, date = todayKey()) {
  return records.find((record) => record.studentId === studentId && record.date === date) ?? {
    studentId,
    date,
    waterGoal: waterGoalLiters,
    waterConsumed: 0
  };
}

function formatLiters(value: number) {
  return `${normalizeWaterValue(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} litros`;
}

function timelineTimestamp(value?: string) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const time = new Date(normalized).getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function formatTimelineDate(value?: string) {
  if (!value) return 'Sem data';
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  const formattedDate = formatDate(value);
  const hasTime = /\d{2}:\d{2}/.test(value) || value.includes('T');
  return hasTime ? `${formattedDate} às ${formatDateTimeParts(value).time}` : formattedDate;
}

function studentIdFromRecord<T>(record: T) {
  return String(recordField(record, ['studentId', 'student_id']) ?? '');
}

function buildStudentTimeline(studentId: string, data: AppData, waterRecords: WaterRecord[] = []): TimelineEvent[] {
  const assessmentEvents = data.assessments
    .filter((assessment) => getAssessmentStudentId(assessment) === studentId)
    .map<TimelineEvent>((assessment) => ({
      id: `assessment-${assessment.id}`,
      icon: 'A',
      title: '📏 Avaliação física registrada',
      date: getAssessmentDateValue(assessment),
      details: [
        `Peso: ${getAssessmentNumber(assessment, ['weight', 'peso'])} kg`,
        `Gordura: ${getAssessmentNumber(assessment, ['bodyFat', 'body_fat', 'gordura'])}%`,
        assessment.notes ? `Observações: ${assessment.notes}` : ''
      ].filter(Boolean)
    }));

  const workoutEvents = data.workoutLogs
    .filter((log) => studentIdFromRecord(log) === studentId)
    .map<TimelineEvent>((log) => ({
      id: `workout-log-${log.id}`,
      icon: 'T',
      title: '🏋️ Treino concluído',
      date: getWorkoutLogCompletedAt(log),
      details: [`Treino: ${workoutName(data, log.workoutId)}`, `Status: ${log.status === 'concluido' ? 'Concluído' : log.status}`]
    }));

  const uniqueCheckIns = Array.from(
    new Map(
      data.checkIns
        .filter((checkIn) => studentIdFromRecord(checkIn) === studentId)
        .sort((a, b) => getCheckInDateValue(b).localeCompare(getCheckInDateValue(a)))
        .map((checkIn) => [getCheckInDateValue(checkIn), checkIn])
    ).values()
  );

  const checkInEvents = uniqueCheckIns
    .map<TimelineEvent>((checkIn) => ({
      id: `checkin-${checkIn.id}`,
      icon: 'C',
      title: '📋 Check-in respondido',
      date: getCheckInDateValue(checkIn),
      details: [
        checkIn.currentWeight ? `Peso atual: ${checkIn.currentWeight} kg` : '',
        checkIn.energy ? `Como me senti: ${checkIn.energy}` : '',
        checkIn.motivation ? `Motivação: ${checkIn.motivation}/10` : '',
        checkIn.difficulty ? `Dificuldade: ${checkIn.difficulty}` : '',
        checkIn.victory ? `Vitória: ${checkIn.victory}` : ''
      ].filter(Boolean)
    }));

  const periodizationEvents = data.periodizations
    .filter((periodization) => studentIdFromRecord(periodization) === studentId)
    .map<TimelineEvent>((periodization) => ({
      id: `periodization-${periodization.id}`,
      icon: 'P',
      title: '📅 Periodização criada',
      date: periodization.createdAt || periodization.startDate,
      details: [`Duração: ${periodization.weeks} semanas`, `Status: ${periodization.status}`]
    }));

  const paymentEvents = data.payments
    .filter((payment) => studentIdFromRecord(payment) === studentId)
    .map<TimelineEvent>((payment) => ({
      id: `payment-${payment.id}`,
      icon: '$',
      title: '💰 Registro financeiro',
      date: payment.dueDate,
      details: [`Plano: ${payment.plan}`, `Valor: ${formatCurrency(payment.amount)}`, `Status: ${payment.status}`]
    }));

  const waterEvents = waterRecords
    .filter((record) => record.studentId === studentId && record.waterConsumed >= record.waterGoal)
    .map<TimelineEvent>((record) => ({
      id: `water-${record.studentId}-${record.date}`,
      icon: '💧',
      title: '💧 Meta de hidratação concluída',
      date: record.date,
      details: [`Meta: ${formatLiters(record.waterGoal)}`, `Consumido: ${formatLiters(record.waterConsumed)}`]
    }));

  const weeklyGoals = getStudentWeeklyGoals(loadWeeklyGoals(), studentId, data, waterRecords);
  const weeklyGoalEvents = weeklyGoals.flatMap<TimelineEvent>((goal) => {
    const createdEvent: TimelineEvent = {
      id: `weekly-goal-created-${goal.id}`,
      icon: '🎯',
      title: '🎯 Meta semanal criada',
      date: goal.createdAt,
      details: [`Meta: ${goal.title}`, `Período: ${formatDate(goal.weekStartDate)} a ${formatDate(goal.weekEndDate)}`]
    };
    if (goal.status !== 'Concluída') return [createdEvent];
    return [
      createdEvent,
      {
        id: `weekly-goal-completed-${goal.id}`,
        icon: '🏆',
        title: '🏆 Meta semanal concluída',
        date: goal.updatedAt || goal.weekEndDate,
        details: [`Meta: ${goal.title}`, `Progresso: ${goal.currentValue}/${goal.targetValue} ${goal.unit}`]
      }
    ];
  });

  return [...assessmentEvents, ...workoutEvents, ...checkInEvents, ...periodizationEvents, ...paymentEvents, ...waterEvents, ...weeklyGoalEvents]
    .sort((a, b) => timelineTimestamp(b.date) - timelineTimestamp(a.date));
}

function StudentTimeline({ data, studentId, waterRecords = [], compactInitial = false }: { data: AppData; studentId: string; waterRecords?: WaterRecord[]; compactInitial?: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const events = buildStudentTimeline(studentId, data, waterRecords);
  const initialLimit = compactInitial ? 3 : 10;
  const visibleEvents = showAll ? events : events.slice(0, initialLimit);

  return (
    <Panel title="Linha do tempo do aluno">
      {events.length ? (
        <>
          <div className="space-y-0">
            {visibleEvents.map((event, index) => (
              <div key={event.id} className={`grid grid-cols-[30px_1fr] gap-2 md:grid-cols-[34px_1fr] md:gap-3 ${!compactInitial && !showAll && index >= 3 ? 'hidden md:grid' : ''}`}>
                <div className="relative flex justify-center">
                  <span className="z-10 grid h-7 w-7 place-items-center rounded-full border border-fitblue/30 bg-fitblue/10 text-[11px] font-black text-fitblue md:h-8 md:w-8 md:text-xs">{event.icon}</span>
                  {index < visibleEvents.length - 1 && <span className="absolute top-7 h-full w-px bg-line md:top-8" />}
                </div>
                <div className="pb-3 md:pb-5">
                  <div className="rounded-lg border border-line bg-ink/40 p-2.5 md:p-3">
                    <p className="text-sm font-semibold leading-snug text-slate-100 md:text-base">{event.title}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-slate-500 md:text-xs md:tracking-[0.14em]">{formatTimelineDate(event.date)}</p>
                    <div className="mt-2 space-y-1 md:mt-3">
                      {event.details.map((detail) => <p key={detail} className="break-words text-xs text-slate-300 md:text-sm">{detail}</p>)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {events.length > 3 && (
            <button className="btn-secondary mt-2 w-full md:hidden" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Mostrar menos' : 'Ver linha do tempo completa'}
            </button>
          )}
          {events.length > initialLimit && (
            <button className="btn-secondary mt-2 hidden md:inline-flex" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Mostrar menos' : 'Ver linha do tempo completa'}
            </button>
          )}
        </>
      ) : (
        <Empty
          title="Nenhum evento registrado ainda na jornada deste aluno."
          text="Quando o aluno fizer avaliações, treinos, check-ins ou pagamentos, eles aparecerão aqui."
        />
      )}
    </Panel>
  );
}

function useWeeklyGoalsStore() {
  const [goals, setGoals] = useState<WeeklyGoal[]>(() => loadWeeklyGoals());

  useEffect(() => {
    const sync = () => setGoals(loadWeeklyGoals());
    window.addEventListener('personalpro-weekly-goals-updated', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('personalpro-weekly-goals-updated', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const persistGoals = (nextGoals: WeeklyGoal[]) => {
    saveWeeklyGoals(nextGoals);
    setGoals(nextGoals);
  };

  return { goals, persistGoals };
}

function createWeeklyGoalDraft(studentId: string): WeeklyGoal {
  const week = getCurrentWeekRange();
  const now = new Date().toISOString();
  return {
    id: '',
    studentId,
    weekStartDate: week.start,
    weekEndDate: week.end,
    title: '',
    category: 'Treino',
    targetValue: 3,
    currentValue: 0,
    unit: 'treinos',
    status: 'Em andamento',
    notes: '',
    createdAt: now,
    updatedAt: now
  };
}

function WeeklyGoalProgressCard({ goal, compact = false }: { goal: ReturnType<typeof getStudentWeeklyGoals>[number]; compact?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${weeklyGoalStatusClass(goal.status)}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-black text-white">{goal.title || 'Meta semanal'}</p>
          <p className="mt-1 text-sm text-slate-300">{goal.category} - {formatDate(goal.weekStartDate)} a {formatDate(goal.weekEndDate)}</p>
        </div>
        <Badge label={goal.status} />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-sm font-semibold text-slate-200">{goal.currentValue} / {goal.targetValue} {goal.unit}</p>
        <p className="text-lg font-black text-white">{goal.progress}%</p>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-ink/80">
        <div className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8,#35e68c)] transition-all duration-500" style={{ width: `${goal.progress}%` }} />
      </div>
      {!compact && goal.notes && <p className="mt-3 text-sm leading-6 text-slate-300">{goal.notes}</p>}
    </div>
  );
}

function WeeklyGoalsAdminCard({ data, student, waterRecords }: { data: AppData; student: Student; waterRecords: WaterRecord[] }) {
  const { goals, persistGoals } = useWeeklyGoalsStore();
  const [form, setForm] = useState<WeeklyGoal>(() => createWeeklyGoalDraft(student.id));
  const [isEditing, setIsEditing] = useState(false);
  const studentGoals = getStudentWeeklyGoals(goals, student.id, data, waterRecords);
  const summary = summarizeWeeklyGoals(studentGoals);

  useEffect(() => {
    setForm(createWeeklyGoalDraft(student.id));
    setIsEditing(false);
  }, [student.id]);

  const startNew = () => {
    setForm(createWeeklyGoalDraft(student.id));
    setIsEditing(true);
  };

  const editGoal = (goal: WeeklyGoal) => {
    setForm({ ...goal });
    setIsEditing(true);
  };

  const saveGoal = () => {
    if (!form.title.trim()) {
      window.alert('Informe o título da meta semanal.');
      return;
    }
    const now = new Date().toISOString();
    const nextGoal = normalizeWeeklyGoal({
      ...form,
      id: form.id || makeId('weekly-goal'),
      studentId: student.id,
      updatedAt: now,
      createdAt: form.createdAt || now
    });
    const nextGoals = goals.some((goal) => goal.id === nextGoal.id)
      ? goals.map((goal) => goal.id === nextGoal.id ? nextGoal : goal)
      : [...goals, nextGoal];
    persistGoals(nextGoals);
    setForm(nextGoal);
    setIsEditing(false);
    window.alert(form.id ? 'Meta semanal atualizada com sucesso.' : 'Meta semanal criada com sucesso.');
  };

  const deleteGoal = (goal: WeeklyGoal) => {
    if (!window.confirm('Tem certeza que deseja excluir esta meta semanal?')) return;
    persistGoals(goals.filter((item) => item.id !== goal.id));
    if (form.id === goal.id) setForm(createWeeklyGoalDraft(student.id));
    setIsEditing(false);
    window.alert('Meta semanal excluída com sucesso.');
  };

  const completeGoal = (goal: WeeklyGoal) => {
    const nextGoal = normalizeWeeklyGoal({
      ...goal,
      currentValue: goal.targetValue,
      status: 'Concluída',
      updatedAt: new Date().toISOString()
    });
    persistGoals(goals.map((item) => item.id === goal.id ? nextGoal : item));
    window.alert('Meta semanal concluída.');
  };

  return (
    <Panel title="🎯 Metas Semanais do Aluno">
      <div className="grid gap-3 sm:grid-cols-4">
        <InfoBox label="Em andamento" value={summary.inProgress} />
        <InfoBox label="Concluídas" value={summary.completed} />
        <InfoBox label="Atrasadas" value={summary.overdue} />
        <InfoBox label="Total" value={summary.total} />
      </div>

      {isEditing ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Input label="Título da meta" value={form.title} onChange={(value) => setForm({ ...form, title: value })} />
          <Select label="Categoria" value={form.category} onChange={(value) => setForm({ ...form, category: value as WeeklyGoalCategory })} options={weeklyGoalCategories.map((item) => [item, item])} />
          <Input label="Valor alvo" type="number" value={String(form.targetValue)} onChange={(value) => setForm({ ...form, targetValue: Number(value || 0) })} />
          <Input label="Valor atual" type="number" value={String(form.currentValue)} onChange={(value) => setForm({ ...form, currentValue: Number(value || 0) })} />
          <Input label="Unidade" value={form.unit} onChange={(value) => setForm({ ...form, unit: value })} />
          <Select label="Status" value={form.status} onChange={(value) => setForm({ ...form, status: value as WeeklyGoalStatus })} options={weeklyGoalStatuses.map((item) => [item, item])} />
          <Input label="Semana inicial" type="date" value={form.weekStartDate} onChange={(value) => setForm({ ...form, weekStartDate: value })} />
          <Input label="Semana final" type="date" value={form.weekEndDate} onChange={(value) => setForm({ ...form, weekEndDate: value })} />
          <Textarea label="Observações" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
          <div className="flex flex-col gap-2 md:col-span-2 sm:flex-row">
            <button className="btn-primary w-full sm:w-auto" onClick={saveGoal}>{form.id ? 'Salvar alterações' : 'Criar meta'}</button>
            <button className="btn-secondary w-full sm:w-auto" onClick={() => { setIsEditing(false); setForm(createWeeklyGoalDraft(student.id)); }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button className="btn-primary mt-4 w-full sm:w-auto" onClick={startNew}>Criar nova meta</button>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {studentGoals.length ? studentGoals.map((goal) => (
          <div key={goal.id} className="space-y-3 rounded-xl border border-fitblue/20 bg-ink/45 p-3">
            <WeeklyGoalProgressCard goal={goal} />
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button className="btn-secondary w-full sm:w-auto" onClick={() => editGoal(goal)}>Editar meta</button>
              <button className="btn-secondary w-full sm:w-auto" onClick={() => completeGoal(goal)}>Marcar como concluída</button>
              <button className="btn-danger w-full sm:w-auto" onClick={() => deleteGoal(goal)}>Excluir meta</button>
            </div>
          </div>
        )) : (
          <Empty title="Nenhuma meta semanal criada para este aluno." text="Crie metas de treino, água, check-in ou rotina para acompanhar a semana." />
        )}
      </div>
    </Panel>
  );
}

function StudentWeeklyGoalsCard({ data, student, waterRecords }: { data: AppData; student: Student; waterRecords: WaterRecord[] }) {
  const { goals } = useWeeklyGoalsStore();
  const week = getCurrentWeekRange();
  const studentGoals = getStudentWeeklyGoals(goals, student.id, data, waterRecords);
  const weeklyGoals = studentGoals.filter((goal) => goal.weekEndDate >= week.start && goal.weekStartDate <= week.end);
  const visibleGoals = weeklyGoals.length ? weeklyGoals : studentGoals.slice(0, 4);

  return (
    <Panel title="🎯 Minhas metas da semana">
      {visibleGoals.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {visibleGoals.map((goal) => <WeeklyGoalProgressCard key={goal.id} goal={goal} />)}
        </div>
      ) : (
        <Empty title="Nenhuma meta semanal definida ainda." text="Quando o personal criar uma meta para você, ela aparecerá aqui." />
      )}
    </Panel>
  );
}

function JourneyView({ data, student, canEditWater = false }: { data: AppData; student: Student; canEditWater?: boolean }) {
  const [waterRecords, setWaterRecords] = useState<WaterRecord[]>(() => loadWaterRecords());
  const [lastWaterAction, setLastWaterAction] = useState<string | null>(() => loadLastWaterAction(student.id));
  const [showWaterCelebration, setShowWaterCelebration] = useState(false);
  const [showStudentAvatar, setShowStudentAvatar] = useState(!canEditWater);
  const [showJourneyAssessment, setShowJourneyAssessment] = useState(!canEditWater);
  const [showAchievements, setShowAchievements] = useState(!canEditWater);
  const assessments = data.assessments.filter((item) => getAssessmentStudentId(item) === student.id);
  const evolutionSummary = getStudentEvolutionSummary(student, data.assessments);
  const workoutLogs = workoutLogsForStudent(data, student.id);
  const checkIns = data.checkIns.filter((item) => item.studentId === student.id);
  const activePeriodization = data.periodizations.find((item) => item.studentId === student.id && item.status === 'ativo');
  const todayWater = getWaterRecord(waterRecords, student.id);
  const waterProgress = Math.min(100, Math.round((todayWater.waterConsumed / todayWater.waterGoal) * 100));
  const bottleFill = Math.min(100, Math.max(0, waterProgress));
  const waterConsumedText = formatLiters(todayWater.waterConsumed);
  const waterGoalText = formatLiters(todayWater.waterGoal);
  const waterExtra = Math.max(0, todayWater.waterConsumed - todayWater.waterGoal);
  const hasWaterExtra = waterExtra > 0;
  const waterCompleted = todayWater.waterConsumed >= todayWater.waterGoal;
  const waterRegistered = todayWater.waterConsumed > 0;
  useEffect(() => {
    setLastWaterAction(loadLastWaterAction(student.id));
    setShowWaterCelebration(false);
    setShowStudentAvatar(!canEditWater);
    setShowJourneyAssessment(!canEditWater);
    setShowAchievements(!canEditWater);
  }, [student.id, canEditWater]);
  const triggerWaterCelebration = () => {
    setShowWaterCelebration(false);
    window.setTimeout(() => setShowWaterCelebration(true), 10);
    window.setTimeout(() => setShowWaterCelebration(false), 3010);
  };
  const waterButtonClass = (action: string) => {
    const active = lastWaterAction === action;
    return `btn-secondary w-full ${active ? '!border-blue-400 !bg-blue-500/20 !text-white shadow-[0_0_18px_rgba(56,189,248,0.35)] ring-2 ring-fitblue/30' : ''}`;
  };
  const handleWaterChange = (amount: number, actionKey: string) => {
    if (!canEditWater) return;
    const current = getWaterRecord(waterRecords, student.id);
    const wasCompleted = current.waterConsumed >= current.waterGoal;
    const nextRecord = {
      ...current,
      waterGoal: current.waterGoal || waterGoalLiters,
      waterConsumed: normalizeWaterValue(current.waterConsumed + amount)
    };
    const isCompleted = nextRecord.waterConsumed >= nextRecord.waterGoal;
    const nextRecords = [
      ...waterRecords.filter((record) => !(record.studentId === student.id && record.date === current.date)),
      nextRecord
    ];
    setLastWaterAction(actionKey);
    saveLastWaterAction(student.id, current.date, actionKey);
    if (!wasCompleted && isCompleted && !hasCelebratedWaterGoal(student.id, current.date)) {
      markWaterGoalCelebrated(student.id, current.date);
      triggerWaterCelebration();
    }
    setWaterRecords(nextRecords);
    saveWaterRecords(nextRecords);
  };
  const completedWorkoutsCount = workoutLogs.length;
  const journeyPhases = [
    { title: '🌱 Início', description: 'Primeiros passos da jornada.' },
    { title: '💪 Adaptação', description: 'Preparar o corpo, aprender técnica e criar consistência.' },
    { title: '🔥 Consistência', description: 'Manter frequência e transformar treino em rotina.' },
    { title: '🚀 Evolução', description: 'Aumentar volume e melhorar resistência.' },
    { title: '🏆 Transformação', description: 'Consolidar resultados e reconhecer a mudança.' }
  ];
  const phaseIndex = !assessments.length ? 0 : completedWorkoutsCount === 0 ? 1 : completedWorkoutsCount <= 3 ? 2 : completedWorkoutsCount <= 8 ? 3 : 4;
  const currentPhase = journeyPhases[phaseIndex];
  const fallbackJourneyDates = [
    ...assessments.map((assessment) => getAssessmentDateValue(assessment)),
    ...workoutLogs.map((log) => getWorkoutLogCompletedAt(log)),
    ...checkIns.map((checkIn) => checkIn.date)
  ].map((value) => dateKey(value)).filter(Boolean).sort();
  const startSource =
    dateKey(student.startDate) ||
    dateKey(String(recordField(student, ['createdAt', 'created_at']) ?? '')) ||
    fallbackJourneyDates[0] ||
    '';
  const startDate = startSource ? new Date(`${startSource}T00:00:00`) : undefined;
  const rawJourneyDay = startDate && !Number.isNaN(startDate.getTime()) ? Math.floor((Date.now() - startDate.getTime()) / 86400000) + 1 : 1;
  const journeyDay = Math.min(90, Math.max(1, rawJourneyDay));
  const journeyPercent = Math.min(100, Math.round((journeyDay / 90) * 100));
  const monthWorkouts = monthWorkoutCount(workoutLogs);
  const journeyScore = Math.min(100,
    (assessments.length > 0 ? 30 : 0) +
    (completedWorkoutsCount > 0 ? 25 : 0) +
    (checkIns.length > 0 ? 20 : 0) +
    (activePeriodization ? 15 : 0) +
    (completedWorkoutsCount >= 5 ? 10 : 0) +
    (waterCompleted ? 10 : 0)
  );
  const scoreStatus = journeyScore <= 30 ? '🌱 Começando' : journeyScore <= 60 ? '📈 Em evolução' : journeyScore <= 80 ? '🔥 Consistente' : '🏆 Excelente';
  const trainedToday = workoutLogs.some((log) => isSameDate(getWorkoutLogCompletedAt(log)));
  const checkedInToday = checkIns.some((checkIn) => isSameDate(checkIn.date));
  const achievements = [
    { label: '🏋️ Primeiro treino concluído', active: completedWorkoutsCount >= 1 },
    { label: '📋 Primeiro check-in respondido', active: checkIns.length >= 1 },
    { label: '📏 Primeira avaliação registrada', active: assessments.length >= 1 },
    { label: '📅 Periodização criada', active: Boolean(activePeriodization) },
    { label: '🔥 5 treinos concluídos', active: completedWorkoutsCount >= 5 },
    { label: '🏆 10 treinos concluídos', active: completedWorkoutsCount >= 10 },
    { label: '💧 Meta de água concluída', active: waterCompleted },
    { label: '💧 7 dias hidratado', active: false },
    { label: '💧 30 dias hidratado', active: false }
  ];
  const activeAchievements = achievements.filter((achievement) => achievement.active);
  const nextAchievement = achievements.find((achievement) => !achievement.active);
  const dailyGoals = [
    { label: '🏋️ Treino concluído hoje', status: trainedToday ? 'Concluído' : 'Pendente', active: trainedToday, neutral: false },
    { label: '📋 Check-in respondido hoje', status: checkedInToday ? 'Concluído' : 'Pendente', active: checkedInToday, neutral: false },
    { label: '💧 Água registrada', status: waterCompleted ? 'Concluído' : waterRegistered ? 'Registrado' : 'Pendente', active: waterRegistered, neutral: false },
    { label: '😴 Sono registrado', status: 'Em breve', active: false, neutral: true }
  ];
  const dayPhases = [
    'Dia 1 a 15 - Adaptação',
    'Dia 16 a 30 - Consistência',
    'Dia 31 a 60 - Evolução',
    'Dia 61 a 90 - Transformação'
  ];

  return (
    <Stack>
      <PageTitle title="Jornada do aluno" subtitle="Acompanhe progresso, consistência e evolução visual." />
      <Panel title="Aluno selecionado" action={<Badge label={currentPhase.title} />}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoBox label="Aluno" value={studentDisplayName(student)} />
          <InfoBox label="Treinos concluídos" value={completedWorkoutsCount} />
          <InfoBox label="Avaliações registradas" value={assessments.length} />
          <InfoBox label="Score atual" value={`${journeyScore}/100 - ${scoreStatus}`} />
        </div>
      </Panel>

      <Panel title="Avatar de evolução">
        {canEditWater && (
          <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <InfoBox label="Fase atual" value={currentPhase.title} />
            <button className="btn-secondary w-full sm:w-auto" onClick={() => setShowStudentAvatar(!showStudentAvatar)}>
              {showStudentAvatar ? 'Ocultar avatar' : 'Ver avatar de evolução'}
            </button>
          </div>
        )}
        {showStudentAvatar && (
          <>
            <div className="grid gap-3 sm:grid-cols-5">
              {journeyPhases.map((phase, index) => {
                const active = index <= phaseIndex;
                const current = index === phaseIndex;
                return (
                  <div key={phase.title} className={`rounded-lg border p-3 ${active ? 'border-fitgreen/40 bg-fitgreen/10' : 'border-line bg-ink/40'}`}>
                    <div className={`mb-3 grid h-10 w-10 place-items-center rounded-full border text-sm font-black ${current ? 'border-fitblue bg-fitblue text-ink' : active ? 'border-fitgreen text-fitgreen' : 'border-line text-slate-500'}`}>
                      {index + 1}
                    </div>
                    <p className="font-semibold">{phase.title}</p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">{phase.description}</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 rounded-lg border border-fitblue/20 bg-fitblue/10 p-4">
              <p className="font-semibold text-fitblue">Fase atual: {currentPhase.title}</p>
              <p className="mt-1 text-sm text-slate-300">
                {phaseIndex === 4
                  ? 'Parabéns! Você chegou à fase Transformação. Agora é hora de manter a consistência.'
                  : 'Continue acumulando treinos, check-ins e avaliações para evoluir até a fase Transformação.'}
              </p>
            </div>
          </>
        )}
      </Panel>

      {canEditWater && (
        <Panel title="Avaliação física">
          <div className="grid gap-3 sm:grid-cols-3">
            <InfoBox label="Peso atual" value={evolutionSummary.assessmentCount || evolutionSummary.currentWeight ? `${evolutionSummary.currentWeight} kg` : 'Sem registro'} />
            <InfoBox label="Gordura atual" value={evolutionSummary.assessmentCount ? `${evolutionSummary.currentBodyFat}%` : 'Sem registro'} />
            <InfoBox label="Última avaliação" value={evolutionSummary.lastAssessment ? formatDate(getAssessmentDateValue(evolutionSummary.lastAssessment)) : 'Sem registro'} />
          </div>
          <button className="btn-secondary mt-3 w-full sm:w-auto" onClick={() => setShowJourneyAssessment(!showJourneyAssessment)}>
            {showJourneyAssessment ? 'Ocultar' : 'Ver detalhes'}
          </button>
          {showJourneyAssessment && (
            <div className="mt-4">
              {evolutionSummary.assessmentCount ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <InfoBox label="Peso inicial" value={`${evolutionSummary.initialWeight} kg`} />
                  <InfoBox label="Peso atual" value={`${evolutionSummary.currentWeight} kg`} />
                  <InfoBox label="Gordura inicial" value={`${evolutionSummary.initialBodyFat}%`} />
                  <InfoBox label="Gordura atual" value={`${evolutionSummary.currentBodyFat}%`} />
                  <InfoBox label="Fonte dos dados" value={evolutionSummary.source} />
                  <InfoBox label="Total de avaliações" value={evolutionSummary.assessmentCount} />
                  <InfoBox label="Primeira avaliação" value={evolutionSummary.firstAssessment ? formatDate(getAssessmentDateValue(evolutionSummary.firstAssessment)) : 'Sem registro'} />
                  <InfoBox label="Última avaliação" value={evolutionSummary.lastAssessment ? formatDate(getAssessmentDateValue(evolutionSummary.lastAssessment)) : 'Sem registro'} />
                </div>
              ) : (
                <Empty title="Nenhuma avaliação física registrada ainda." text="Quando o personal registrar uma avaliação, os dados aparecerão aqui." />
              )}
            </div>
          )}
        </Panel>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Jornada de 90 dias">
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-3xl font-black text-fitgreen">Dia {journeyDay} de 90</p>
                <p className="text-sm text-slate-400">{journeyPercent}% concluído</p>
              </div>
              <Badge label={startSource ? `Início: ${formatDate(startSource)}` : 'Dia 1'} />
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-ink">
              <div className="h-full rounded-full bg-fitgreen" style={{ width: `${journeyPercent}%` }} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {dayPhases.map((phase) => <p key={phase} className="rounded-md border border-line bg-ink/40 px-3 py-2 text-sm text-slate-300">{phase}</p>)}
            </div>
          </div>
        </Panel>

        <Panel title="Score geral de consistência">
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Score geral</p>
              <p className="text-4xl font-black text-fitblue">{journeyScore}/100</p>
              <p className="text-sm font-semibold text-slate-300">{scoreStatus}</p>
              <p className="mt-1 text-xs text-slate-500">Baseado no histórico acumulado do aluno, separado das metas de hoje.</p>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-ink">
              <div className="h-full rounded-full bg-fitblue" style={{ width: `${journeyScore}%` }} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <InfoBox label="Avaliação física" value={assessments.length > 0 ? '+30 pontos' : '0 pontos'} />
              <InfoBox label="Treino concluído" value={completedWorkoutsCount > 0 ? '+25 pontos' : '0 pontos'} />
              <InfoBox label="Check-in respondido" value={checkIns.length > 0 ? '+20 pontos' : '0 pontos'} />
              <InfoBox label="Periodização ativa" value={activePeriodization ? '+15 pontos' : '0 pontos'} />
              <InfoBox label="5 ou mais treinos" value={completedWorkoutsCount >= 5 ? '+10 pontos' : '0 pontos'} />
              <InfoBox label="Meta de água hoje" value={waterCompleted ? '+10 pontos' : '0 pontos'} />
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="💧 Controle de água">
        <div className="grid gap-4 lg:grid-cols-[1fr_180px_220px] lg:items-center">
          <div className="relative overflow-visible rounded-lg">
            {showWaterCelebration && (
              <div className="water-celebration">
                {['🎉', '💧', '✨', '🎉', '💧', '✨', '🎉', '💧', '✨', '🎉', '💧', '✨'].map((item, index) => (
                  <span
                    key={`${item}-${index}`}
                    className="water-confetti"
                    style={{ left: `${8 + index * 7}%`, animationDelay: `${(index % 4) * 0.12}s` }}
                  >
                    {item}
                  </span>
                ))}
                <div className="water-celebration-message">🎉 Parabéns! Meta de hidratação concluída.</div>
              </div>
            )}
            {canEditWater && (
              <div className="mb-4 rounded-xl border border-fitblue/40 bg-fitblue/10 p-4 shadow-[0_0_24px_rgba(56,189,248,0.14)]">
                <p className="text-sm font-black uppercase tracking-[0.14em] text-fitblue">🎯 Meta diária de hidratação</p>
                <p className="mt-2 text-3xl font-black text-white">{formatLiters(todayWater.waterGoal)}</p>
                <p className="mt-1 text-base text-slate-300">Sua meta de água para hoje</p>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <InfoBox label="Meta diária" value={formatLiters(todayWater.waterGoal)} />
              <InfoBox label="Consumido hoje" value={formatLiters(todayWater.waterConsumed)} />
              <InfoBox label="Progresso" value={`${waterProgress}%`} />
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-ink">
              <div className="h-full rounded-full bg-fitblue" style={{ width: `${waterProgress}%` }} />
            </div>
            <p className="mt-3 text-sm text-slate-300">
              {todayWater.waterConsumed === 0
                ? 'Comece sua hidratação de hoje.'
                : hasWaterExtra
                  ? '🏆 Meta batida! Você passou da sua meta de hidratação.'
                  : waterCompleted
                  ? '🎉 Parabéns! Meta de hidratação concluída.'
                  : 'Continue, falta pouco para bater sua meta.'}
            </p>
            {!canEditWater && <p className="mt-2 text-xs font-semibold text-fitblue">Somente o aluno pode registrar o consumo de água.</p>}
          </div>
          <div className={`space-y-3 ${hasWaterExtra ? 'rounded-2xl border border-emerald-400/30 bg-emerald-500/5 p-2 shadow-[0_0_28px_rgba(16,185,129,0.16)]' : ''}`}>
            {hasWaterExtra && (
              <div className="mx-auto w-fit rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-emerald-200">
                🏆 Meta batida
              </div>
            )}
            <div className={`relative mx-auto flex w-full max-w-[170px] flex-col items-center rounded-2xl border p-4 ${
              hasWaterExtra
                ? 'border-emerald-300/80 bg-emerald-500/15 shadow-[0_0_36px_rgba(16,185,129,0.28)]'
                : waterCompleted
                  ? 'border-emerald-400/70 bg-emerald-500/10 shadow-[0_0_28px_rgba(16,185,129,0.22)]'
                  : 'border-fitblue/50 bg-fitblue/10 shadow-[0_0_22px_rgba(56,189,248,0.16)]'
            }`}>
              <div className="mb-1 h-3 w-12 rounded-t-lg border border-fitblue/50 bg-slate-700/80 shadow-inner" />
              <div className="relative h-44 w-20 overflow-hidden rounded-[1.6rem] border border-fitblue/60 bg-slate-950/80 shadow-[inset_10px_0_22px_rgba(255,255,255,0.08),inset_-10px_0_22px_rgba(0,0,0,0.35),0_18px_40px_rgba(14,165,233,0.18)]">
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-b-[1.4rem] bg-gradient-to-t from-blue-700 via-sky-400 to-cyan-200 transition-all duration-500 ease-out"
                  style={{ height: `${bottleFill}%` }}
                >
                  <div className="absolute -top-2 left-[-25%] h-5 w-[150%] rounded-[50%] bg-cyan-100/55 blur-[1px]" />
                  <div className="absolute left-2 top-3 h-[80%] w-3 rounded-full bg-white/25 blur-[1px]" />
                  <div className="absolute right-2 top-6 h-[60%] w-2 rounded-full bg-blue-900/20 blur-[1px]" />
                </div>
                <div className="absolute left-3 top-4 h-24 w-3 rounded-full bg-white/20 blur-[1px]" />
                <div className="pointer-events-none absolute inset-0 rounded-[1.6rem] bg-gradient-to-r from-white/20 via-transparent to-black/25" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="rounded-full bg-slate-950/35 px-2 py-1 text-lg font-black text-white drop-shadow">
                    {waterProgress}%
                  </span>
                </div>
              </div>
              <p className="mt-3 text-center text-xs font-semibold text-slate-200">
                Consumido: {waterConsumedText} / {waterGoalText}
              </p>
              {hasWaterExtra && (
                <p className="mt-1 text-center text-xs font-black text-emerald-200">
                  Extra: +{formatLiters(waterExtra)}
                </p>
              )}
            </div>
          </div>
          {canEditWater && (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              <button className={waterButtonClass('250')} onClick={() => handleWaterChange(0.25, '250')}>💧 +250 ml</button>
              <button className={waterButtonClass('500')} onClick={() => handleWaterChange(0.5, '500')}>💧 +500 ml</button>
              <button className={waterButtonClass('1000')} onClick={() => handleWaterChange(1, '1000')}>💧 +1 litro</button>
              <button className={waterButtonClass('-250')} onClick={() => handleWaterChange(-0.25, '-250')}>−250 ml</button>
            </div>
          )}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Metas de hoje">
          <div className="space-y-2">
            {dailyGoals.map((goal) => (
              <div key={goal.label} className={`flex items-center justify-between gap-3 rounded-md border px-3 py-3 ${goal.neutral ? 'border-fitblue/20 bg-fitblue/5' : 'border-line bg-ink/40'}`}>
                <div className="flex items-center gap-3">
                  <span className={`grid h-7 w-7 place-items-center rounded-full border text-xs font-black ${goal.active ? 'border-fitgreen bg-fitgreen text-ink' : goal.neutral ? 'border-fitblue/30 text-fitblue' : 'border-line text-slate-500'}`}>{goal.active ? '✓' : goal.neutral ? '•' : '-'}</span>
                  <p className="text-sm font-semibold text-slate-200">{goal.label}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${goal.active ? 'border-fitgreen/30 bg-fitgreen/10 text-fitgreen' : goal.neutral ? 'border-fitblue/20 bg-fitblue/5 text-slate-300' : 'border-fitorange/30 bg-fitorange/10 text-fitorange'}`}>{goal.status}</span>
              </div>
            ))}
          </div>
        </Panel>

        {canEditWater && <StudentWeeklyGoalsCard data={data} student={student} waterRecords={waterRecords} />}

        <Panel title="Conquistas">
          {canEditWater ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoBox label="Conquistas ativas" value={`${activeAchievements.length}/${achievements.length}`} />
                <InfoBox label="Próxima conquista" value={nextAchievement?.label ?? 'Todas liberadas'} />
              </div>
              <button className="btn-secondary mt-3 w-full sm:w-auto" onClick={() => setShowAchievements(!showAchievements)}>
                {showAchievements ? 'Ocultar' : 'Ver detalhes'}
              </button>
              {showAchievements && (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-2">
                  {achievements.slice().sort((a, b) => Number(b.active) - Number(a.active)).map((achievement) => (
                    <div key={achievement.label} className={`rounded-md border px-3 py-3 ${achievement.active ? 'border-fitgreen/40 bg-fitgreen/10' : 'border-line bg-ink/40'}`}>
                      <p className={`text-sm font-semibold leading-snug ${achievement.active ? 'text-fitgreen' : 'text-slate-400'}`}>{achievement.label}</p>
                      <p className="mt-1 text-sm text-slate-500">{achievement.active ? 'Conquista ativa' : 'Ainda não liberada'}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
              {achievements.slice().sort((a, b) => Number(b.active) - Number(a.active)).map((achievement) => (
                <div key={achievement.label} className={`rounded-md border px-3 py-3 ${achievement.active ? 'border-fitgreen/40 bg-fitgreen/10' : 'border-line bg-ink/40'}`}>
                  <p className={`text-xs font-semibold leading-snug sm:text-sm ${achievement.active ? 'text-fitgreen' : 'text-slate-400'}`}>{achievement.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{achievement.active ? 'Conquista ativa' : 'Ainda não liberada'}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <StudentTimeline data={data} studentId={student.id} waterRecords={waterRecords} compactInitial={canEditWater} />
    </Stack>
  );
}

function WorkoutLogHistory({
  data,
  logs,
  showStudent = true,
  emptyText = 'Quando o aluno concluir um treino, o registro aparecerá aqui.',
  compactLimit,
  collapsible = false
}: {
  data: AppData;
  logs: WorkoutLog[];
  showStudent?: boolean;
  emptyText?: string;
  compactLimit?: number;
  collapsible?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const [showHistory, setShowHistory] = useState(!collapsible);
  const visibleLogs = compactLimit && !showAll ? logs.slice(0, compactLimit) : logs;
  const latestLog = logs[0];
  const latestDateTime = formatDateTimeParts(latestLog?.completedAt);
  return (
    <Panel title="Histórico de treinos realizados">
      {collapsible && (
        <div className="mb-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <InfoBox label="Total de treinos concluídos" value={logs.length} />
            <InfoBox label="Último treino realizado" value={latestLog ? workoutName(data, latestLog.workoutId) : 'Sem registros'} />
            <InfoBox label="Data do último treino" value={latestLog ? latestDateTime.date : 'Sem registros'} />
          </div>
          <button className="btn-secondary w-full sm:w-auto" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? 'Ocultar histórico' : 'Ver histórico de treinos'}
          </button>
        </div>
      )}
      {showHistory && (
        logs.length ? (
          <div className="space-y-3">
            {visibleLogs.map((log) => {
              const completed = formatDateTimeParts(log.completedAt);
              return (
                <div key={log.id} className="rounded-md border border-line bg-ink/40 p-3">
                  <div className={`grid gap-3 sm:grid-cols-2 ${showStudent ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
                    {showStudent && <InfoBox label="Aluno" value={studentName(data, log.studentId)} />}
                    <InfoBox label="Treino" value={workoutName(data, log.workoutId)} />
                    <InfoBox label="Data" value={completed.date} />
                    <InfoBox label="Hora" value={completed.time} />
                    <InfoBox label="Status" value={<Badge label={log.status} />} />
                  </div>
                </div>
              );
            })}
            {compactLimit && logs.length > compactLimit && (
              <button className="btn-secondary w-full sm:w-auto" onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Mostrar menos' : 'Ver mais'}
              </button>
            )}
          </div>
        ) : (
          <Empty title="Sem treinos concluídos" text={emptyText} />
        )
      )}
    </Panel>
  );
}

function StudentDashboard({ data, student }: { data: AppData; student: Student }) {
  const nextWorkout = data.workouts.find((item) => item.studentId === student.id && !item.completed);
  const lastCheckIn = data.checkIns.filter((item) => item.studentId === student.id).sort((a, b) => b.date.localeCompare(a.date))[0];
  const message = data.messages.find((item) => item.type === 'Motivação' || item.type === 'Motivacao');
  return (
    <Stack>
      <section className="rounded-lg border border-line bg-[linear-gradient(135deg,#0d1726,#112a2a)] p-5 shadow-glow">
        <p className="text-sm text-fitgreen">Olá, {studentDisplayName(student).split(' ')[0]}</p>
        <h1 className="mt-2 text-3xl font-black">Seu plano está em movimento.</h1>
        <p className="mt-3 text-slate-300">{student.goal}</p>
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Próximo treino" value={nextWorkout?.name ?? 'Aguardando'} icon={Dumbbell} accent="blue" />
        <StatCard label="Progresso" value={`${Math.max(0, student.initialWeight - student.currentWeight).toFixed(1)} kg`} icon={LineChart} accent="green" />
        <StatCard label="Peso inicial" value={`${student.initialWeight} kg`} icon={Activity} accent="orange" />
        <StatCard label="Peso atual" value={`${student.currentWeight} kg`} icon={Activity} accent="green" />
      </div>
      <Panel title="Meta e check-in">
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoBox label="Meta" value={student.target} />
          <InfoBox label="Último check-in" value={lastCheckIn ? formatDate(lastCheckIn.date) : 'Pendente'} />
          <InfoBox label="Mensagem do personal" value={message?.content ?? 'Mantenha a consistencia.'} />
        </div>
      </Panel>
    </Stack>
  );
}

function StudentWorkout({ data, student, commit }: { data: AppData; student: Student; commit: (data: AppData, message?: string) => void }) {
  const allWorkouts = (Array.isArray(data.workouts) ? data.workouts : []).map(normalizeWorkout);
  const workouts = allWorkouts.filter((item) => item.studentId === student.id);
  const updateWorkout = (workout: Workout) => commit({ ...data, workouts: allWorkouts.map((item) => (item.id === workout.id ? normalizeWorkout(workout) : item)) }, 'Treino atualizado.');
  const startWorkout = (workout: Workout) => updateWorkout({ ...workout, completed: false });
  const completeWorkout = async (workout: Workout) => {
    try {
      const workoutLog = await saveWorkoutLogRemote(workout.id, student.id, student.profileId);
      commit({
        ...data,
        workouts: allWorkouts.map((item) => (item.id === workout.id ? normalizeWorkout({ ...workout, completed: true, exercises: safeWorkoutExercises(workout) }) : item)),
        workoutLogs: workoutLog ? [...data.workoutLogs, workoutLog] : data.workoutLogs
      }, 'Treino concluído.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Não foi possível concluir o treino.');
    }
  };
  return (
    <Stack>
      <PageTitle title="Meu treino" subtitle="Visualize os treinos liberados pelo personal." />
      {workouts.map((workout) => (
        <Panel key={workout.id} title={workout.name} action={<Badge label={workout.completed ? 'Treino concluído' : 'Ativo'} />}>
          <p className="text-sm text-slate-400">{workout.objective} - {workout.estimatedDuration} - {workout.weeklyFrequency}</p>
          {workout.completed && (
            <div className="mt-3 rounded-md border border-fitgreen/40 bg-fitgreen/10 p-3 text-sm text-fitgreen">
              Treino concluído. Excelente, este registro já aparece para o personal.
            </div>
          )}
          <div className="mt-4 space-y-3">
            {safeWorkoutExercises(workout).length ? (
              safeWorkoutExercises(workout).map((exercise) => (
                <div key={exercise.id} className="rounded-md border border-line bg-ink/50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{exercise.name || 'Exercício sem nome'}</p>
                      <p className="text-sm text-slate-400">{exercise.sets || '-'} séries - {exercise.reps || '-'} reps - descanso {exercise.rest || '-'}</p>
                    </div>
                    <button className={exercise.status === 'concluido' ? 'chip-active' : 'chip'} onClick={() => updateWorkout({ ...workout, exercises: safeWorkoutExercises(workout).map((item) => (item.id === exercise.id ? { ...item, status: item.status === 'concluido' ? 'ativo' : 'concluido' } : item)) })}>{exercise.status === 'concluido' ? 'Concluído' : 'Concluir'}</button>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{exercise.notes}</p>
                  {exercise.videoUrl && <a className="mt-2 inline-block text-sm text-fitblue" href={exercise.videoUrl} target="_blank">Vídeo explicativo</a>}
                </div>
              ))
            ) : (
              <p className="rounded-md border border-line bg-ink/40 p-3 text-sm text-slate-300">Este treino ainda não possui exercícios cadastrados.</p>
            )}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button className="btn-secondary" onClick={() => startWorkout(workout)}>Iniciar treino</button>
            <button className="btn-primary" onClick={() => completeWorkout(workout)}>Concluir treino</button>
          </div>
        </Panel>
      ))}
      {!workouts.length && <Empty title="Nenhum treino liberado" text="Você ainda não possui treino liberado. Fale com seu personal." />}
    </Stack>
  );
}

function StudentCheckin({ data, student, commit }: { data: AppData; student: Student; commit: (data: AppData, message?: string) => void }) {
  const [form, setForm] = useState({ trainingsDone: 0, food: '', sleep: '', energy: '', motivation: 8, stress: 5, currentWeight: student.currentWeight, difficulty: '', victory: '', notes: '', photo: '' });
  const [selectedCheckInId, setSelectedCheckInId] = useState('');
  const studentCheckIns = data.checkIns
    .filter((item) => item.studentId === student.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const selectedCheckIn = studentCheckIns.find((item) => item.id === selectedCheckInId);
  const save = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const checkIn: CheckIn = { id: makeId('c'), studentId: student.id, checkinDate: today, date: today, ...form, photoUrl: form.photo };
    try {
      const remoteId = await saveCheckInRemote(checkIn);
      commit({ ...data, checkIns: [...data.checkIns, { ...checkIn, id: remoteId ?? checkIn.id }], students: data.students.map((item) => (item.id === student.id ? { ...item, currentWeight: Number(form.currentWeight) } : item)) }, 'Check-in enviado ao personal.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Não foi possível enviar o check-in.');
    }
  };
  return (
    <Stack>
      <PageTitle title="Check-in semanal" subtitle="Conte como foi sua semana para o plano evoluir com você." />
      <Panel title="Responder check-in">
        <div className="space-y-3">
          <div className="rounded-md border border-line bg-ink/35 p-3">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-fitblue">Estado de hoje</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Treinei quantas vezes?" type="number" value={String(form.trainingsDone)} onChange={(value) => setForm({ ...form, trainingsDone: Number(value) })} />
              <Input label="Peso atual" type="number" value={String(form.currentWeight)} onChange={(value) => setForm({ ...form, currentWeight: Number(value) })} />
              <Input label="Como me senti?" value={form.energy} onChange={(value) => setForm({ ...form, energy: value })} />
              <Input label="Motivação 1 a 10" type="number" value={String(form.motivation)} onChange={(value) => setForm({ ...form, motivation: Number(value) })} />
              <Input label="Estresse 1 a 10" type="number" value={String(form.stress)} onChange={(value) => setForm({ ...form, stress: Number(value) })} />
            </div>
          </div>
          <div className="rounded-md border border-line bg-ink/35 p-3">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-fitblue">Alimentação e sono</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Alimentação" value={form.food} onChange={(value) => setForm({ ...form, food: value })} />
              <Input label="Sono" value={form.sleep} onChange={(value) => setForm({ ...form, sleep: value })} />
            </div>
          </div>
          <div className="rounded-md border border-line bg-ink/35 p-3">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-fitblue">Dificuldades e vitórias</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Textarea label="Minha dificuldade" value={form.difficulty} onChange={(value) => setForm({ ...form, difficulty: value })} />
              <Textarea label="Minha vitória" value={form.victory} onChange={(value) => setForm({ ...form, victory: value })} />
            </div>
          </div>
          <div className="rounded-md border border-line bg-ink/35 p-3">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-fitblue">Observações e foto</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Textarea label="Observações livres" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
              <ImageUpload label="Foto opcional" value={form.photo ? [form.photo] : []} onChange={(photos) => setForm({ ...form, photo: photos[0] ?? '' })} />
            </div>
          </div>
        </div>
        <button className="btn-primary mt-5 w-full sm:w-auto" onClick={save}>Enviar check-in</button>
      </Panel>
      <Panel title="Meus check-ins respondidos">
        {studentCheckIns.length ? (
          <div className="space-y-4">
            <Select
              label="Selecione uma data"
              value={selectedCheckInId}
              onChange={setSelectedCheckInId}
              options={[
                ['', 'Selecione uma data'],
                ...studentCheckIns.map((checkIn) => [checkIn.id, formatDate(checkIn.date)] as [string, string])
              ]}
            />
            {!selectedCheckIn ? (
              <p className="rounded-md border border-line bg-ink/40 p-3 text-sm text-slate-300">
                Selecione uma data para visualizar seu check-in respondido.
              </p>
            ) : (
              <div className="rounded-lg border border-line bg-ink/40 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoBox label="Data" value={formatDate(selectedCheckIn.date)} />
                  <InfoBox label="Peso atual" value={selectedCheckIn.currentWeight ? `${selectedCheckIn.currentWeight} kg` : 'Sem registro'} />
                  <InfoBox label="Como me senti" value={selectedCheckIn.energy || 'Sem registro'} />
                  <InfoBox label="Sono" value={selectedCheckIn.sleep || 'Sem registro'} />
                  <InfoBox label="Alimentação" value={selectedCheckIn.food || 'Sem registro'} />
                  <InfoBox label="Energia" value={selectedCheckIn.energy || 'Sem registro'} />
                  <InfoBox label="Motivação" value={`${selectedCheckIn.motivation}/10`} />
                  <InfoBox label="Estresse" value={`${selectedCheckIn.stress}/10`} />
                  <InfoBox label="Minha dificuldade" value={selectedCheckIn.difficulty || 'Sem registro'} />
                  <InfoBox label="Minha vitória" value={selectedCheckIn.victory || 'Sem registro'} />
                  <InfoBox label="Observações livres" value={selectedCheckIn.notes || 'Sem registro'} />
                  <div className="sm:col-span-2">
                    {selectedCheckIn.photoUrl || selectedCheckIn.photo ? (
                      <img className="max-h-72 w-full rounded-lg border border-line object-cover" src={selectedCheckIn.photoUrl || selectedCheckIn.photo} alt="Foto anexada no check-in" />
                    ) : (
                      <p className="rounded-md border border-line bg-ink/50 p-3 text-sm text-slate-300">Sem foto anexada.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <Empty title="Você ainda não respondeu nenhum check-in." text="Quando enviar um check-in, ele aparecerá aqui para consulta." />
        )}
      </Panel>
    </Stack>
  );
}

function StudentProfile({ data, student, commit }: { data: AppData; student: Student; commit: (data: AppData, message?: string) => void }) {
  const [form, setForm] = useState(student);
  const [isEditing, setIsEditing] = useState(false);
  useEffect(() => {
    setForm(student);
    setIsEditing(false);
  }, [student.id]);
  const cancel = () => {
    setForm(student);
    setIsEditing(false);
  };
  const saveProfile = async () => {
    try {
      await saveStudentRemote(form);
      commit({ ...data, students: data.students.map((item) => (item.id === student.id ? form : item)) }, 'Perfil atualizado com sucesso.');
      setIsEditing(false);
    } catch (error) {
      console.error('Erro ao atualizar perfil do aluno:', error);
      window.alert('Não foi possível atualizar o perfil. Verifique os dados e tente novamente.');
    }
  };
  return (
    <Stack>
      <PageTitle title="Meu perfil" subtitle="Consulte seus dados e edite apenas quando precisar atualizar algo." />
      <Panel title="Dados pessoais">
        <p className={`mb-4 rounded-md border px-3 py-2 text-sm font-semibold ${isEditing ? 'border-fitblue/30 bg-fitblue/10 text-fitblue' : 'border-line bg-ink/40 text-slate-300'}`}>
          {isEditing ? 'Modo edição ativo.' : 'Modo visualização. Clique em Editar perfil para alterar seus dados.'}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Nome" value={form.fullName} onChange={(value) => setForm({ ...form, fullName: value })} disabled={!isEditing} />
          <Input label="Telefone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} disabled={!isEditing} />
          <ImageUpload label="Foto de perfil" value={form.avatar ? [form.avatar] : []} onChange={(photos) => setForm({ ...form, avatar: photos[0] })} disabled={!isEditing} />
          <Input label="Objetivo" value={form.goal} onChange={(value) => setForm({ ...form, goal: value })} disabled={!isEditing} />
          <Textarea label="Meta" value={form.target} onChange={(value) => setForm({ ...form, target: value })} disabled={!isEditing} />
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {isEditing ? (
            <>
              <button className="btn-primary w-full sm:w-auto" onClick={saveProfile}>Salvar alterações</button>
              <button className="btn-secondary w-full sm:w-auto" onClick={cancel}>Cancelar</button>
            </>
          ) : (
            <button className="btn-secondary w-full sm:w-auto" onClick={() => setIsEditing(true)}>Editar perfil</button>
          )}
        </div>
      </Panel>
    </Stack>
  );
}

function ExerciseEditor({ exercise, onChange, disabled = false }: { exercise: Exercise; onChange: (exercise: Exercise) => void; disabled?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-ink/40 p-3">
      <div className="grid gap-3 md:grid-cols-4">
        <Input label="Nome do exercício" value={exercise.name} onChange={(value) => onChange({ ...exercise, name: value })} disabled={disabled} />
        <Input label="Grupo muscular" value={exercise.muscleGroup} onChange={(value) => onChange({ ...exercise, muscleGroup: value })} disabled={disabled} />
        <Input label="Séries" value={exercise.sets} onChange={(value) => onChange({ ...exercise, sets: value })} disabled={disabled} />
        <Input label="Repetições" value={exercise.reps} onChange={(value) => onChange({ ...exercise, reps: value })} disabled={disabled} />
        <Input label="Carga" value={exercise.load} onChange={(value) => onChange({ ...exercise, load: value })} disabled={disabled} />
        <Input label="Descanso" value={exercise.rest} onChange={(value) => onChange({ ...exercise, rest: value })} disabled={disabled} />
        <Input label="Vídeo explicativo" value={exercise.videoUrl} onChange={(value) => onChange({ ...exercise, videoUrl: value })} disabled={disabled} />
        <Select label="Status" value={exercise.status} onChange={(value) => onChange({ ...exercise, status: value as Exercise['status'] })} disabled={disabled} options={[['ativo', 'Ativo'], ['concluido', 'Concluído']]} />
        <Textarea label="Observações técnicas" value={exercise.notes} onChange={(value) => onChange({ ...exercise, notes: value })} disabled={disabled} />
      </div>
    </div>
  );
}

function emptyExercise(): Exercise {
  return { id: makeId('e'), name: '', muscleGroup: '', sets: '3', reps: '10', load: '', rest: '60s', notes: '', videoUrl: '', status: 'ativo' };
}

function StudentSelector({ students, value, onChange }: { students: Student[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="mb-4 rounded-lg border border-line bg-panel p-3">
      <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Aluno selecionado</label>
      <select className="field mt-2" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Selecionar aluno</option>
        {students.map((student) => <option key={student.id} value={student.id}>{studentDisplayName(student)}</option>)}
      </select>
    </div>
  );
}

function HistoryList({ assessments, onView, onEdit, onDelete }: { assessments: PhysicalAssessment[]; onView?: (assessment: PhysicalAssessment) => void; onEdit?: (assessment: PhysicalAssessment) => void; onDelete?: (assessment: PhysicalAssessment) => void }) {
  return (
    <Panel title="Histórico de avaliações">
      {assessments.length ? (
        <div className="space-y-3">
          {assessments.slice().sort((a, b) => b.date.localeCompare(a.date)).map((item) => (
            <div key={item.id} className="rounded-md border border-line bg-ink/40 p-3">
              <Row title={`${formatDate(item.date)} - ${item.weight} kg`} meta={`IMC ${calculateImc(item.weight, item.height)} - gordura ${item.bodyFat}% - cintura ${item.waist} cm`} badge="Avaliação" />
              {(onView || onEdit || onDelete) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {onView && <button className="btn-secondary w-full sm:w-auto" onClick={() => onView(item)}>Visualizar avaliação</button>}
                  {onEdit && <button className="btn-secondary w-full sm:w-auto" onClick={() => onEdit(item)}>Editar avaliação</button>}
                  {onDelete && <button className="btn-danger w-full sm:w-auto" onClick={() => onDelete(item)}>Excluir avaliação</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty title="Sem avaliações" text="Registre a primeira avaliação física para iniciar os gráficos." />
      )}
    </Panel>
  );
}

function Stack({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3 md:space-y-4">{children}</div>;
}

function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-[23px] font-black leading-tight sm:text-3xl">{title}</h1>
      <p className="mt-1 text-xs leading-relaxed text-slate-400 sm:text-sm">{subtitle}</p>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-fitblue/25 bg-panel/80 p-3 shadow-[0_20px_50px_rgba(0,0,0,.34)] sm:p-5">
      <div className="mb-3 flex flex-col gap-2 sm:mb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <h2 className="text-base font-black leading-tight text-white sm:text-lg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: string | number; icon: IconComponent; accent: 'blue' | 'orange' | 'green' }) {
  const color = accent === 'blue' ? 'text-fitblue' : accent === 'orange' ? 'text-fitorange' : 'text-fitgreen';
  return (
    <div className="rounded-2xl border border-fitblue/25 bg-[linear-gradient(135deg,rgba(15,23,42,.84),rgba(8,47,73,.42))] p-4 shadow-[0_18px_48px_rgba(0,0,0,.32)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold leading-snug text-slate-300 sm:text-base">{label}</p>
        <div className="grid h-10 w-10 place-items-center rounded-xl border border-fitblue/25 bg-fitblue/10 shadow-[0_0_26px_rgba(58,183,255,.16)] sm:h-11 sm:w-11">
          <Icon className={color} size={22} />
        </div>
      </div>
      <p className="mt-3 truncate text-3xl font-black text-white sm:text-4xl">{value}</p>
    </div>
  );
}

function NavButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: IconComponent; label: string; onClick: () => void }) {
  return (
    <button className={`flex min-w-max items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition md:mb-1 md:w-full ${active ? 'bg-[linear-gradient(135deg,#38bdf8,#35e68c)] text-ink shadow-[0_12px_28px_rgba(56,189,248,.24)]' : 'text-slate-300 hover:bg-fitblue/10 hover:text-white'}`} onClick={onClick}>
      <Icon size={18} />
      <span>{label}</span>
    </button>
  );
}

function MobileTab({ active, icon: Icon, label, onClick }: { active: boolean; icon: IconComponent; label: string; onClick: () => void }) {
  return (
    <button className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-bold sm:text-[11px] ${active ? 'bg-[linear-gradient(135deg,#38bdf8,#35e68c)] text-ink shadow-[0_8px_22px_rgba(53,230,140,.22)]' : 'text-slate-400'}`} onClick={onClick}>
      <Icon size={18} />
      <span className="truncate">{label}</span>
    </button>
  );
}

function Input({ label, value, onChange, type = 'text', required = false, disabled = false, readOnly = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; disabled?: boolean; readOnly?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-300">{label}</span>
      <input className={`field ${disabled || readOnly ? 'cursor-default bg-ink/70 text-slate-300 opacity-90' : ''}`} type={type} value={value ?? ''} required={required} disabled={disabled} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Select({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][]; disabled?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-300">{label}</span>
      <select className={`field ${disabled ? 'cursor-default bg-ink/70 text-slate-300 opacity-90' : ''}`} value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function Textarea({ label, value, onChange, disabled = false, readOnly = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; readOnly?: boolean }) {
  return (
    <label className="block text-sm md:col-span-2">
      <span className="mb-1 block text-slate-300">{label}</span>
      <textarea className={`field min-h-24 resize-y ${disabled || readOnly ? 'cursor-default bg-ink/70 text-slate-300 opacity-90' : ''}`} value={value ?? ''} disabled={disabled} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ImageUpload({ label, value, onChange, multiple = false, disabled = false }: { label: string; value: string[]; onChange: (value: string[]) => void; multiple?: boolean; disabled?: boolean }) {
  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    Promise.all(
      Array.from(files).map(
        (file) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.readAsDataURL(file);
          })
      )
    ).then((images) => onChange(multiple ? [...value, ...images] : images.slice(0, 1)));
  };

  return (
    <label className="block text-sm md:col-span-2">
      <span className="mb-1 block text-slate-300">{label}</span>
      <div className="rounded-md border border-dashed border-line bg-ink/60 p-3">
        <input className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-fitblue file:px-3 file:py-2 file:text-sm file:font-bold file:text-ink disabled:cursor-default disabled:opacity-50" type="file" accept="image/*" multiple={multiple} disabled={disabled} onChange={(event) => handleFiles(event.target.files)} />
        <p className="mt-2 text-xs text-slate-500">Pré-visualização local agora. Pronto para trocar por Supabase Storage depois.</p>
        {value.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {value.map((image, index) => (
              <div key={`${image.slice(0, 20)}-${index}`} className="relative aspect-square overflow-hidden rounded-md border border-line">
                <img src={image} alt="" className="h-full w-full object-cover" />
                <button type="button" className="absolute right-1 top-1 rounded bg-ink/80 px-2 py-1 text-xs" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}>
                  Remover
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </label>
  );
}

function InfoBox({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-fitblue/20 bg-ink/50 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.05)] sm:p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-fitblue sm:text-xs sm:tracking-[0.14em]">{label}</p>
      <p className="mt-1.5 break-words text-sm font-bold text-slate-100 sm:text-base">{value || '-'}</p>
    </div>
  );
}

function FormModeNotice({ editing }: { editing: boolean }) {
  return (
    <p className={`mb-4 rounded-md border p-3 text-sm ${editing ? 'border-fitgreen/30 bg-fitgreen/10 text-fitgreen' : 'border-fitblue/30 bg-fitblue/10 text-slate-200'}`}>
      {editing ? 'Modo edição ativo.' : 'Modo visualização. Clique em Editar para alterar os dados.'}
    </p>
  );
}

function Row({ title, meta, badge }: { title: string; meta: string; badge: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-ink/40 p-3">
      <div className="min-w-0">
        <p className="truncate font-semibold">{title}</p>
        <p className="truncate text-sm text-slate-400">{meta}</p>
      </div>
      <Badge label={badge} />
    </div>
  );
}

function Badge({ label }: { label: string }) {
  const display = label === 'concluido' ? 'Concluído' : label === 'ativo' ? 'Ativo' : label === 'pendente' ? 'Pendente' : label === 'atrasado' ? 'Atrasado' : label === 'pago' ? 'Pago' : label;
  return <span className="rounded-full border border-fitblue/40 bg-fitblue/15 px-3 py-1.5 text-xs font-black text-fitblue shadow-[0_0_20px_rgba(58,183,255,.12)]">{display}</span>;
}

function DashboardAlertList({
  title,
  items,
  empty,
  tone
}: {
  title: string;
  items: { name: string; reason: string; date: string }[];
  empty: string;
  tone: 'blue' | 'orange' | 'green';
}) {
  const color = tone === 'blue' ? 'border-fitblue/40 bg-fitblue/10' : tone === 'orange' ? 'border-fitorange/40 bg-fitorange/10' : 'border-fitgreen/40 bg-fitgreen/10';
  return (
    <div className={`rounded-md border p-4 ${color}`}>
      <p className="font-semibold">{title}</p>
      <div className="mt-3 space-y-2">
        {items.length ? items.slice(0, 8).map((item) => (
          <div key={`${title}-${item.name}-${item.reason}-${item.date}`} className="rounded bg-ink/40 px-3 py-2 text-sm text-slate-200">
            <p className="font-semibold">{item.name}</p>
            <p className="text-slate-300">{item.reason}</p>
            <p className="mt-1 text-xs text-slate-500">{item.date}</p>
          </div>
        )) : <p className="text-sm text-slate-300">{empty}</p>}
      </div>
    </div>
  );
}

function AlertBox({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone: 'blue' | 'orange' | 'green' }) {
  const color = tone === 'blue' ? 'border-fitblue/40 bg-fitblue/10' : tone === 'orange' ? 'border-fitorange/40 bg-fitorange/10' : 'border-fitgreen/40 bg-fitgreen/10';
  return (
    <div className={`rounded-md border p-4 ${color}`}>
      <p className="font-semibold">{title}</p>
      <div className="mt-3 space-y-2">
        {items.length ? items.slice(0, 5).map((item) => <p key={item} className="rounded bg-ink/40 px-3 py-2 text-sm text-slate-200">{item}</p>) : <p className="text-sm text-slate-300">{empty}</p>}
      </div>
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-panel p-6 text-center">
      <Sparkles className="mx-auto text-fitgreen" />
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{text}</p>
    </div>
  );
}

function Avatar({ student }: { student: Student }) {
  return (
    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-gradient-to-br from-fitblue to-fitgreen font-black text-ink">
      {student.avatar ? <img src={student.avatar} alt="" className="h-full w-full rounded-md object-cover" /> : studentInitials(student)}
    </div>
  );
}

function Logo() {
  return (
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-gradient-to-br from-fitblue via-fitgreen to-fitorange font-black text-ink">
      PP
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/5 p-3">
      <p className="text-xs uppercase tracking-[0.15em] text-slate-400">{label}</p>
      <p className="mt-1 truncate font-semibold">{value}</p>
    </div>
  );
}

function isEmailLike(value?: string | null) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}

function studentDisplayName(student?: Student | null) {
  if (!student) return 'Aluno sem nome';
  const legacyName = (student as Student & { name?: string }).name;
  const fullName = student.fullName?.trim();
  const name = legacyName?.trim();
  if (fullName && !isEmailLike(fullName)) return fullName;
  if (name && !isEmailLike(name)) return name;
  return fullName || name || student.email || 'Aluno sem nome';
}

function openStudentSmartReportPrint(report: StudentSmartReport, settings?: PersonalSettings) {
  if (typeof window === 'undefined') return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.alert('Use o navegador para salvar ou compartilhar o relatório em PDF.');
    return;
  }

  const brandName = settings?.brandName || defaultPersonalSettings.brandName || 'PersonalPro Evolution';
  const personalName = settings?.personalName || defaultPersonalSettings.personalName || '';
  const bodyFatDiffText = report.bodyEvolution.initialBodyFat || report.bodyEvolution.currentBodyFat
    ? `${report.bodyEvolution.bodyFatDiff > 0 ? '+' : ''}${report.bodyEvolution.bodyFatDiff}%`
    : 'Sem registro';
  const weightDiffText = `${report.bodyEvolution.weightDiff > 0 ? '+' : ''}${report.bodyEvolution.weightDiff} kg`;
  const html = buildStudentSmartReportPrintHtml({
    brandName,
    personalName,
    studentName: studentDisplayName(report.student),
    report,
    weightDiffText,
    bodyFatDiffText
  });

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => {
    printWindow.print();
  }, 450);
}

function buildAiStudentReportPayload(report: StudentSmartReport) {
  return {
    studentName: studentDisplayName(report.student),
    goal: report.student.goal || 'Sem objetivo registrado',
    bodyEvolution: {
      initialWeight: report.bodyEvolution.initialWeight,
      currentWeight: report.bodyEvolution.currentWeight,
      initialBodyFat: report.bodyEvolution.initialBodyFat,
      currentBodyFat: report.bodyEvolution.currentBodyFat,
      weightDiff: report.bodyEvolution.weightDiff,
      bodyFatDiff: report.bodyEvolution.bodyFatDiff
    },
    trainingConsistency: {
      totalWorkouts: report.trainingConsistency.totalWorkouts,
      monthWorkouts: report.trainingConsistency.monthWorkouts,
      latestWorkout: report.trainingConsistency.latestWorkout,
      daysWithoutTraining: report.trainingConsistency.daysWithoutTraining,
      adherence: report.trainingConsistency.adherence
    },
    checkinBehavior: report.checkinBehavior,
    hydration: report.hydration,
    weeklyGoals: report.weeklyGoals,
    abandonmentRisk: report.abandonmentRiskBadge,
    positives: report.positives,
    attentionPoints: report.attentionPoints
  };
}

function buildStudentSmartReportPrintHtml({
  brandName,
  personalName,
  studentName,
  report,
  weightDiffText,
  bodyFatDiffText
}: {
  brandName: string;
  personalName: string;
  studentName: string;
  report: StudentSmartReport;
  weightDiffText: string;
  bodyFatDiffText: string;
}) {
  const metric = (label: string, value: unknown) => `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value ?? 'Sem registro'))}</strong>
    </div>
  `;
  const list = (items: string[], icon: string) => items.length
    ? `<ul>${items.map((item) => `<li>${escapeHtml(icon)} ${escapeHtml(item)}</li>`).join('')}</ul>`
    : '<p class="muted">Sem registros suficientes.</p>';

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(brandName)} - Relatório Inteligente do Aluno</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f4f7fb;
      color: #172033;
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.45;
    }
    .page {
      max-width: 980px;
      margin: 0 auto;
      padding: 32px;
    }
    header {
      border-bottom: 3px solid #0ea5e9;
      padding-bottom: 18px;
      margin-bottom: 22px;
    }
    .brand {
      color: #0f766e;
      font-size: 22px;
      font-weight: 900;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    h1 {
      margin: 8px 0 6px;
      font-size: 30px;
      color: #0f172a;
    }
    .subline {
      display: grid;
      gap: 4px;
      color: #475569;
      font-size: 14px;
    }
    section {
      break-inside: avoid;
      background: #ffffff;
      border: 1px solid #dbe5f0;
      border-radius: 12px;
      margin: 14px 0;
      padding: 18px;
      box-shadow: 0 8px 22px rgba(15, 23, 42, .06);
    }
    h2 {
      margin: 0 0 12px;
      color: #075985;
      font-size: 18px;
    }
    p {
      margin: 0 0 8px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .metric {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 10px 12px;
      background: #f8fafc;
    }
    .metric span {
      display: block;
      color: #64748b;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    .metric strong {
      display: block;
      margin-top: 4px;
      color: #0f172a;
      font-size: 16px;
    }
    ul {
      margin: 0;
      padding-left: 18px;
    }
    li {
      margin: 6px 0;
    }
    .muted {
      color: #64748b;
    }
    .footer {
      margin-top: 24px;
      border-top: 1px solid #cbd5e1;
      padding-top: 14px;
      color: #64748b;
      font-size: 12px;
      text-align: center;
    }
    .print-actions {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 16px;
    }
    .print-actions button {
      border: 0;
      border-radius: 10px;
      background: #0ea5e9;
      color: #fff;
      cursor: pointer;
      font-size: 15px;
      font-weight: 800;
      padding: 11px 16px;
    }
    @media print {
      body { background: #fff; }
      .page { max-width: none; padding: 0; }
      section { box-shadow: none; }
      .print-actions { display: none; }
    }
    @media (max-width: 720px) {
      .page { padding: 18px; }
      .grid { grid-template-columns: 1fr; }
      h1 { font-size: 24px; }
    }
  </style>
</head>
<body>
  <main class="page">
    <div class="print-actions"><button onclick="window.print()">Salvar ou imprimir PDF</button></div>
    <header>
      <div class="brand">${escapeHtml(brandName)}</div>
      <h1>Relatório Inteligente do Aluno</h1>
      <div class="subline">
        <span><strong>Aluno:</strong> ${escapeHtml(studentName)}</span>
        <span><strong>Data do relatório:</strong> ${escapeHtml(report.reportDate)}</span>
        ${personalName ? `<span><strong>Personal:</strong> ${escapeHtml(personalName)}</span>` : ''}
      </div>
    </header>

    <section>
      <h2>1. Resumo executivo</h2>
      <p>${escapeHtml(report.executiveSummary)}</p>
      <p class="muted">${escapeHtml(report.riskExplanation)}</p>
    </section>

    <section>
      <h2>2. Evolução corporal</h2>
      <div class="grid">
        ${metric('Peso inicial', `${report.bodyEvolution.initialWeight} kg`)}
        ${metric('Peso atual', `${report.bodyEvolution.currentWeight} kg`)}
        ${metric('Diferença de peso', weightDiffText)}
        ${metric('Última avaliação', report.bodyEvolution.lastAssessment)}
        ${metric('Gordura inicial', report.bodyEvolution.initialBodyFat ? `${report.bodyEvolution.initialBodyFat}%` : 'Sem registro')}
        ${metric('Gordura atual', report.bodyEvolution.currentBodyFat ? `${report.bodyEvolution.currentBodyFat}%` : 'Sem registro')}
        ${metric('Diferença de gordura', bodyFatDiffText)}
      </div>
    </section>

    <section>
      <h2>3. Consistência de treino</h2>
      <div class="grid">
        ${metric('Total de treinos concluídos', report.trainingConsistency.totalWorkouts)}
        ${metric('Treinos no mês', report.trainingConsistency.monthWorkouts)}
        ${metric('Último treino', report.trainingConsistency.latestWorkout)}
        ${metric('Dias sem treinar', report.trainingConsistency.daysWithoutTraining)}
        ${metric('Aderência', `${report.trainingConsistency.adherence}%`)}
      </div>
    </section>

    <section>
      <h2>4. Check-in e comportamento</h2>
      <div class="grid">
        ${metric('Último check-in', report.checkinBehavior.latestCheckIn)}
        ${metric('Peso do check-in', report.checkinBehavior.currentWeight)}
        ${metric('Motivação', report.checkinBehavior.motivation)}
        ${metric('Estresse', report.checkinBehavior.stress)}
        ${metric('Sono', report.checkinBehavior.sleep)}
        ${metric('Alimentação', report.checkinBehavior.food)}
        ${metric('Dificuldade', report.checkinBehavior.difficulty)}
        ${metric('Vitória', report.checkinBehavior.victory)}
      </div>
    </section>

    <section>
      <h2>5. Hidratação</h2>
      <div class="grid">
        ${metric('Meta diária', `${report.hydration.goal} litros`)}
        ${metric('Consumido hoje', `${report.hydration.consumed} litros`)}
        ${metric('Progresso', `${report.hydration.progress}%`)}
        ${metric('Status da meta', report.hydration.status)}
      </div>
    </section>

    <section>
      <h2>6. Jornada e plano</h2>
      <div class="grid">
        ${metric('Dia da jornada', `Dia ${report.journey.day} de 90`)}
        ${metric('Score geral', `${report.journey.score}/100`)}
        ${metric('Fase atual', report.journey.phase)}
        ${metric('Conquistas ativas', report.journey.activeAchievements)}
        ${metric('Periodização ativa', report.periodization.active)}
        ${metric('Duração', report.periodization.duration)}
      </div>
    </section>

    <section>
      <h2>7. Metas semanais</h2>
      <div class="grid">
        ${metric('Em andamento', report.weeklyGoals.inProgress)}
        ${metric('Concluídas', report.weeklyGoals.completed)}
        ${metric('Atrasadas', report.weeklyGoals.overdue)}
        ${metric('Total de metas', report.weeklyGoals.total)}
      </div>
      <p class="muted">${escapeHtml(report.weeklyGoals.summary)}</p>
      ${report.weeklyGoals.items.length ? `<ul>${report.weeklyGoals.items.map((goal) => `<li>${escapeHtml(goal.title)} - ${escapeHtml(goal.category)} - ${goal.progress}% - ${escapeHtml(goal.status)}</li>`).join('')}</ul>` : '<p class="muted">Nenhuma meta semanal cadastrada.</p>'}
    </section>

    <section>
      <h2>8. Financeiro</h2>
      <div class="grid">
        ${metric('Status financeiro', report.financial.summary)}
        ${metric('Próximo vencimento', report.financial.dueDate)}
        ${metric('Situação', report.financial.status)}
      </div>
    </section>

    <section>
      <h2>9. Pontos positivos</h2>
      ${list(report.positives, '✓')}
    </section>

    <section>
      <h2>10. Pontos de atenção</h2>
      ${list(report.attentionPoints, '!')}
    </section>

    <section>
      <h2>11. Próxima ação recomendada</h2>
      <p>${escapeHtml(report.nextAction)}</p>
    </section>

    <div class="footer">Gerado pelo PersonalPro Evolution</div>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getStudentContactPhone(student?: Student | null) {
  const source = student as
    | (Student & {
        whatsapp?: string;
        whatsappNumber?: string;
        phoneNumber?: string;
        contact?: string;
        telefone?: string;
      })
    | null
    | undefined;
  const candidates = [
    source?.phone,
    source?.whatsapp,
    source?.whatsappNumber,
    source?.phoneNumber,
    source?.contact,
    source?.telefone
  ];
  return candidates
    .map((value) => String(value || '').replace(/\D/g, ''))
    .find((value) => value.length >= 8) || '';
}

function resolveStudentForUser(data: AppData, user: User) {
  const linkedStudents = data.students.filter((student) => student.profileId === user.id);
  const sessionStudent = data.students.find((student) => student.id === user.studentId);
  const studentsWithWorkout = linkedStudents.find((student) => data.workouts.some((workout) => workout.studentId === student.id));
  const studentByEmail = data.students.find((student) => student.email?.toLowerCase() === user.email?.toLowerCase());
  return studentsWithWorkout ?? sessionStudent ?? linkedStudents[0] ?? studentByEmail ?? null;
}

function studentName(data: AppData, studentId: string) {
  const student = data.students.find((item) => item.id === studentId);
  return student ? studentDisplayName(student) : 'Aluno removido';
}

export default App;
