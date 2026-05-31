import { useEffect, useState } from 'react';
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
import { loadData, saveData, loadSession, makeId } from './services/storage';
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
import type { Anamnesis, AppData, CheckIn, Exercise, MarketingIdea, MessageTemplate, Payment, Periodization, PeriodizationPhase, PhysicalAssessment, Student, User, Workout, WorkoutLog } from './types';

type IconProps = { size?: number; className?: string };
type IconComponent = (props: IconProps) => React.JSX.Element;

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
  | 'checkins'
  | 'evolution'
  | 'finance'
  | 'messages'
  | 'marketing';
type StudentTab = 'home' | 'workout' | 'evolution' | 'checkin' | 'profile';

const adminTabs: { id: AdminTab; label: string; icon: IconComponent }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'students', label: 'Alunos', icon: Users },
  { id: 'assessments', label: 'Avaliação', icon: Activity },
  { id: 'anamnesis', label: 'Anamnese', icon: ShieldCheck },
  { id: 'workouts', label: 'Treinos', icon: Dumbbell },
  { id: 'periodization', label: 'Periodização', icon: CalendarCheck },
  { id: 'checkins', label: 'Check-ins', icon: CalendarCheck },
  { id: 'evolution', label: 'Evolução', icon: LineChart },
  { id: 'finance', label: 'Financeiro', icon: CreditCard },
  { id: 'messages', label: 'Mensagens', icon: MessageCircle },
  { id: 'marketing', label: 'Marketing', icon: Megaphone }
];

const studentTabs: { id: StudentTab; label: string; icon: IconComponent }[] = [
  { id: 'home', label: 'Início', icon: BarChart3 },
  { id: 'workout', label: 'Treino', icon: Dumbbell },
  { id: 'evolution', label: 'Evolução', icon: LineChart },
  { id: 'checkin', label: 'Check-in', icon: CalendarCheck },
  { id: 'profile', label: 'Perfil', icon: UserRound }
];

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

function buildAssessmentSummaryBars(firstAssessment?: PhysicalAssessment, latestAssessment?: PhysicalAssessment) {
  if (!firstAssessment) return [];
  const currentAssessment = latestAssessment ?? firstAssessment;
  return [
    { name: 'Peso inicial', valor: getAssessmentNumber(firstAssessment, ['weight', 'peso']) },
    { name: 'Peso atual', valor: getAssessmentNumber(currentAssessment, ['weight', 'peso']) },
    { name: 'Gordura inicial', valor: getAssessmentNumber(firstAssessment, ['bodyFat', 'body_fat', 'gordura']) },
    { name: 'Gordura atual', valor: getAssessmentNumber(currentAssessment, ['bodyFat', 'body_fat', 'gordura']) }
  ];
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
  marketingIdeas: []
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

  const register = async (name: string, email: string, password: string, role: User['role']) => {
    if (isSupabaseConfigured()) {
      try {
        await authService.signUp(name, email, password, role);
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
    const studentId = role === 'student' ? makeId('s') : undefined;
    const next: AppData = {
      ...data,
      users: [...data.users, { id: makeId('u'), name, email, password, role, studentId }],
      students:
        role === 'student'
          ? [
              ...data.students,
              {
                ...emptyStudent,
                id: studentId!,
                fullName: name,
                email,
                status: 'pendente',
                goal: 'Definir objetivo',
                target: 'Cadastrar meta',
                plan: 'Sem plano',
                startDate: new Date().toISOString().slice(0, 10)
              }
            ]
          : data.students
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
  const [role, setRole] = useState<User['role']>('student');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const title = mode === 'login' ? 'Entre com sua conta de Personal ou Aluno.' : mode === 'register' ? 'Criar acesso' : 'Recuperar senha';

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
              Entre com sua conta de Personal ou Aluno para acompanhar treinos, check-ins, avaliações e evolução com segurança.
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
              else onRegister(name, email, password, role);
            }}
          >
            <h2 className="text-2xl font-bold">{title}</h2>
            <p className="mt-2 text-sm text-slate-400">
              {mode === 'recover' ? 'Informe seu e-mail para receber as instruções de recuperação.' : 'Use o e-mail e senha cadastrados no sistema.'}
            </p>
            {toast && <div className="mt-4 rounded-md border border-fitorange/40 bg-fitorange/10 p-3 text-sm">{toast}</div>}
            <div className="mt-6 space-y-4">
              {mode === 'register' && <Input label="Nome completo" value={name} onChange={setName} required />}
              <Input label="E-mail" type="email" value={email} onChange={setEmail} required />
              {mode !== 'recover' && <Input label="Senha" type="password" value={password} onChange={setPassword} required />}
              {mode === 'register' && (
                <Select
                  label="Tipo de usuário"
                  value={role}
                  onChange={(value) => setRole(value as User['role'])}
                  options={[
                    ['student', 'Aluno / Cliente'],
                    ['admin', 'Personal Trainer']
                  ]}
                />
              )}
              <button className="btn-primary w-full" type="submit">
                {mode === 'login' ? 'Entrar' : mode === 'register' ? 'Cadastrar' : 'Enviar instrução'}
              </button>
            </div>
            <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm text-slate-300">
              <button type="button" onClick={() => setMode(mode === 'register' ? 'login' : 'register')}>
                {mode === 'register' ? 'Já tenho conta' : 'Criar cadastro'}
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

function Shell({ user, onLogout, toast, children }: { user: User; onLogout: () => void; toast: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-ink text-white">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/90 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Logo />
            <div className="min-w-0">
              <p className="truncate font-bold">PersonalPro Evolution</p>
              <p className="truncate text-xs text-slate-400">{user.role === 'admin' ? 'Área do Personal' : 'Área do Aluno'}</p>
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
  const selectedStudent = data.students.find((student) => student.id === selectedStudentId);
  const handleSelectStudent = (studentId: string) => {
    setSelectedStudentId(studentId);
  };
  useEffect(() => {
    if (selectedStudentId && !data.students.some((student) => student.id === selectedStudentId)) {
      setSelectedStudentId('');
    }
  }, [data.students, selectedStudentId]);
  const selectTab = (nextTab: AdminTab) => {
    setTab(nextTab);
    setMenuOpen(false);
    scrollToTop();
  };

  return (
    <div className="mx-auto grid max-w-7xl gap-4 px-3 py-4 md:grid-cols-[240px_1fr] md:gap-5 md:px-6 md:py-5">
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
        {tab === 'dashboard' && <AdminDashboard data={data} selectedStudentId={selectedStudentId} selectedStudent={selectedStudent} />}
        {tab === 'students' && <StudentCrud data={data} selectedStudentId={selectedStudentId} selectedStudent={selectedStudent} onSelect={handleSelectStudent} commit={commit} />}
        {tab === 'assessments' && selectedStudent && <Assessments data={data} student={selectedStudent} commit={commit} />}
        {tab === 'anamnesis' && selectedStudent && <AnamnesisView data={data} student={selectedStudent} commit={commit} />}
        {tab === 'workouts' && selectedStudent && <WorkoutCrud data={data} student={selectedStudent} user={user} commit={commit} />}
        {tab === 'periodization' && selectedStudent && <PeriodizationView data={data} student={selectedStudent} commit={commit} />}
        {tab === 'checkins' && <CheckinsView data={data} selectedStudentId={selectedStudentId} selectedStudent={selectedStudent} commit={commit} />}
        {tab === 'evolution' && selectedStudent && <EvolutionView data={data} student={selectedStudent} />}
        {tab === 'finance' && <FinanceView data={data} student={selectedStudent} commit={commit} />}
        {tab === 'messages' && <MessagesView data={data} />}
        {tab === 'marketing' && <MarketingView data={data} />}
        {tab !== 'dashboard' && data.students.length === 0 && ['assessments', 'anamnesis', 'workouts', 'periodization', 'evolution'].includes(tab) && (
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

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-5">
      {tab === 'home' && <StudentDashboard data={data} student={student} />}
      {tab === 'workout' && <StudentWorkout data={data} student={student} commit={commit} />}
      {tab === 'evolution' && <EvolutionView data={data} student={student} compact />}
      {tab === 'checkin' && <StudentCheckin data={data} student={student} commit={commit} />}
      {tab === 'profile' && <StudentProfile data={data} student={student} commit={commit} />}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-line bg-ink/95 px-2 py-2 backdrop-blur">
        <div className="mx-auto grid max-w-4xl grid-cols-5 gap-1">
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
  selectedStudent
}: {
  data: AppData;
  selectedStudentId: string;
  selectedStudent?: Student;
}) {
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
  const getStudentAssessments = (studentId: string) =>
    data.assessments
      .filter((assessment) => getAssessmentStudentId(assessment) === studentId)
      .sort((a, b) => getAssessmentDateValue(a).localeCompare(getAssessmentDateValue(b)));
  const selectedAssessments = selectedStudentId ? getStudentAssessments(selectedStudentId) : [];
  const firstAssessment = selectedAssessments[0];
  const latestSelectedAssessment = selectedAssessments[selectedAssessments.length - 1];
  const initialWeight = firstAssessment ? getAssessmentNumber(firstAssessment, ['weight', 'peso']) : 0;
  const currentWeight = latestSelectedAssessment ? getAssessmentNumber(latestSelectedAssessment, ['weight', 'peso']) : 0;
  const initialBodyFat = firstAssessment ? getAssessmentNumber(firstAssessment, ['bodyFat', 'body_fat', 'gordura']) : 0;
  const currentBodyFat = latestSelectedAssessment ? getAssessmentNumber(latestSelectedAssessment, ['bodyFat', 'body_fat', 'gordura']) : 0;
  const selectedFinancialStatus = selectedPayments.find((payment) => payment.status === 'atrasado') ?? selectedPayments.find((payment) => payment.status === 'pendente') ?? selectedPayments[0];
  const selectedChart = buildAssessmentSummaryBars(firstAssessment, latestSelectedAssessment);
  const hasSelectedStudentData = Boolean(
    currentStudent &&
      (selectedWorkoutLogs.length || selectedCheckIns.length || selectedPayments.length || selectedPeriodization || selectedAssessments.length)
  );
  const inactiveWorkoutAlerts = data.students
    .map((student) => {
      const latestLog = workoutLogsForStudent(data, student.id)[0];
      const inactiveDays = latestLog ? Number(daysSince(latestLog.completedAt)) : Number.POSITIVE_INFINITY;
      return { student, latestLog, inactiveDays };
    })
    .filter((item) => item.inactiveDays > 7);

  return (
    <Stack>
      <PageTitle title="Dashboard" subtitle="Visão rápida da operação, evolução e pendências dos alunos." />

      <Panel title="Resumo geral da operação">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard label="Alunos ativos" value={data.students.length} icon={Users} accent="blue" />
          <StatCard label="Check-ins pendentes" value={pendingCheckinStudents.length} icon={CalendarCheck} accent="orange" />
          <StatCard label="Pagamentos pendentes" value={pendingPaymentItems.length} icon={CreditCard} accent="orange" />
          <StatCard label="Evoluções recentes" value={latest.length} icon={LineChart} accent="green" />
          <StatCard label="Treinos concluídos hoje" value={workoutsToday} icon={Dumbbell} accent="green" />
          <StatCard label="Receita do mês" value={formatCurrency(monthRevenue)} icon={CreditCard} accent="blue" />
        </div>
      </Panel>

      <Panel title="Resumo do aluno selecionado">
        {currentStudent ? (
          <Stack>
            {!hasSelectedStudentData && <Empty title="Este aluno ainda não possui dados suficientes." text="Registre treinos, check-ins, pagamentos ou periodização para enriquecer o resumo." />}
            {!selectedAssessments.length && <Empty title="Este aluno ainda não possui avaliação física registrada." text="Cadastre uma avaliação para preencher peso, gordura e gráfico no Dashboard." />}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <InfoBox label="Nome do aluno" value={studentDisplayName(currentStudent)} />
              <InfoBox label="Peso inicial" value={firstAssessment ? `${initialWeight} kg` : 'Sem avaliação'} />
              <InfoBox label="Peso atual" value={latestSelectedAssessment ? `${currentWeight} kg` : 'Sem avaliação'} />
              <InfoBox label="Gordura inicial" value={firstAssessment ? `${initialBodyFat}%` : 'Sem avaliação'} />
              <InfoBox label="Gordura atual" value={latestSelectedAssessment ? `${currentBodyFat}%` : 'Sem avaliação'} />
              <InfoBox label="Último treino realizado" value={selectedLatestWorkoutLog ? workoutName(data, selectedLatestWorkoutLog.workoutId) : 'Sem registros'} />
              <InfoBox label="Data do último treino" value={selectedLatestWorkoutLog ? selectedLatestWorkoutDateTime.date : 'Sem registros'} />
              <InfoBox label="Hora do último treino" value={selectedLatestWorkoutLog ? selectedLatestWorkoutDateTime.time : 'Sem registros'} />
              <InfoBox label="Dias sem treinar" value={selectedLatestWorkoutLog ? `${daysSince(selectedLatestWorkoutLog.completedAt)} dias` : 'Sem registros'} />
              <InfoBox label="Treinos concluídos no mês" value={monthWorkoutCount(selectedWorkoutLogs)} />
              <InfoBox label="Aderência ao plano" value={`${planAdherence(data, currentStudent, selectedWorkoutLogs)}%`} />
              <InfoBox label="Último check-in" value={selectedCheckIns[0] ? formatDate(selectedCheckIns[0].date) : 'Sem registros'} />
              <InfoBox label="Status financeiro do aluno" value={selectedFinancialStatus ? `${selectedFinancialStatus.status} - ${formatDate(selectedFinancialStatus.dueDate)}` : 'Sem registro'} />
              <InfoBox label="Periodização ativa" value={selectedPeriodization ? `${selectedPeriodization.weeks} semanas` : 'Sem periodização ativa'} />
            </div>

            <Panel title="Peso e gordura do aluno">
              {selectedAssessments.length ? (
                <>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={selectedChart}>
                        <CartesianGrid stroke="#1d2b3d" />
                        <XAxis dataKey="name" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip contentStyle={{ background: '#0d1726', border: '1px solid #1d2b3d' }} />
                        <Bar dataKey="valor" name="Valor" fill="#35e68c" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : <Empty title="Este aluno ainda não possui avaliação física registrada." text="O gráfico será exibido quando houver pelo menos uma avaliação." />}
              <p className="mt-3 text-xs text-slate-500">Total de avaliações carregadas: {data.assessments.length}</p>
              <p className="text-xs text-slate-500">Total do aluno selecionado: {selectedAssessments.length}</p>
            </Panel>

            <WorkoutLogHistory data={data} logs={selectedWorkoutLogs} showStudent={false} emptyText="Este aluno ainda não concluiu nenhum treino." />
          </Stack>
        ) : (
          <Empty title="Nenhum aluno selecionado" text="Selecione um aluno no seletor superior para ver o resumo individual." />
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
  };
  const startNewStudent = () => {
    onSelect('');
    setForm({ ...emptyStudent });
    setAccessEmail('');
    setAccessPassword('');
    setAccessMessage('');
    setSystemLink(getDefaultSystemLink());
    setCopyFeedback('');
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
      return;
    }
    const student = data.students.find((item) => item.id === selectedStudentId) ?? selectedStudent;
    if (!student) {
      setForm({ ...emptyStudent });
      setAccessEmail('');
      setAccessMessage('');
      setCopyFeedback('');
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
    } catch (error) {
      console.error('Erro ao excluir aluno:', error);
      window.alert('Não foi possível excluir o aluno. Tente novamente.');
    }
  };
  const buildAccessMessage = () => {
    const studentName = form.fullName || 'aluno';
    const emailForAccess = accessEmail || form.email || linkProfileEmail || '[email do aluno]';
    const password = accessPassword || '[senha definida]';
    const link = systemLink || getDefaultSystemLink() || '[link do sistema]';
    return `Olá, ${studentName}! Seu acesso ao app de acompanhamento já está pronto.

Acesse pelo link:
${link}

E-mail: ${emailForAccess}
Senha: ${password}

Pelo app você poderá:
✅ Ver seus treinos
✅ Acompanhar sua evolução
✅ Responder seus check-ins semanais

Qualquer dúvida, me chama por aqui.`;
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

  return (
    <Stack>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageTitle title="Gestão de alunos" subtitle="Cadastre, edite e acompanhe todos os alunos do personal." />
        <button className="btn-primary w-full sm:w-auto" onClick={startNewStudent}>
          <Plus size={16} /> Novo aluno
        </button>
      </div>
      <Panel key={form.id || 'new-student'} title={form.id ? `Editando aluno: ${studentDisplayName(form) || studentDisplayName(selectedStudent)}` : 'Novo aluno'}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Input label="Nome completo" value={form.fullName} onChange={(value) => setForm({ ...form, fullName: value })} required />
          <Input label="E-mail principal" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} required />
          <Input label="Telefone / WhatsApp" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
          <Input label="Data de nascimento" type="date" value={form.birthDate} onChange={(value) => setForm({ ...form, birthDate: value })} />
          <Select label="Sexo" value={form.sex} onChange={(value) => setForm({ ...form, sex: value })} options={[['Feminino', 'Feminino'], ['Masculino', 'Masculino'], ['Outro', 'Outro']]} />
          <Input label="Objetivo principal" value={form.goal} onChange={(value) => setForm({ ...form, goal: value })} />
          <Select label="Nível" value={form.level} onChange={(value) => setForm({ ...form, level: value as Student['level'] })} options={[['iniciante', 'Iniciante'], ['intermediario', 'Intermediário'], ['avancado', 'Avançado']]} />
          <Select label="Status" value={form.status} onChange={(value) => setForm({ ...form, status: value as Student['status'] })} options={[['ativo', 'Ativo'], ['inativo', 'Inativo'], ['teste', 'Teste'], ['pendente', 'Pendente']]} />
          <Select
            label="Perfil vinculado"
            value={form.profileId ?? ''}
            onChange={(value) => setForm({ ...form, profileId: value })}
            options={[['', 'Sem vínculo'], ...studentProfiles.map((profile) => [profile.id, `${profile.name || profile.email || profile.id} (${profile.role})`] as [string, string])]}
          />
          <Input label="E-mail de acesso do aluno" type="email" value={accessEmail} onChange={setAccessEmail} />
          <Input label="Plano contratado" value={form.plan} onChange={(value) => setForm({ ...form, plan: value })} />
          <Input label="Data de início" type="date" value={form.startDate} onChange={(value) => setForm({ ...form, startDate: value })} />
          <Input label="Peso inicial" type="number" value={String(form.initialWeight)} onChange={(value) => setForm({ ...form, initialWeight: Number(value) })} />
          <Input label="Peso atual" type="number" value={String(form.currentWeight)} onChange={(value) => setForm({ ...form, currentWeight: Number(value) })} />
          <Textarea label="Meta" value={form.target} onChange={(value) => setForm({ ...form, target: value })} />
          <Textarea label="Observações internas" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
        </div>
        <button className="btn-primary mt-4 w-full sm:w-auto" onClick={save}>Salvar aluno</button>
      </Panel>
      <Panel title="Vincular login do aluno">
        <div className="grid gap-3 md:grid-cols-3">
          <Input label="Buscar aluno por e-mail" type="email" value={linkStudentEmail} onChange={setLinkStudentEmail} />
          <Input label="Buscar profile por e-mail" type="email" value={linkProfileEmail} onChange={setLinkProfileEmail} />
          <Select
            label="Ou selecione um profile student"
            value={linkProfileId}
            onChange={setLinkProfileId}
            options={[['', 'Selecionar profile'], ...studentProfiles.map((profile) => [profile.id, `${profile.name || profile.email || profile.id}`] as [string, string])]}
          />
        </div>
        <button className="btn-primary mt-4 w-full sm:w-auto" onClick={linkStudentLogin}>Vincular login do aluno</button>
      </Panel>
      <Panel title="Gerar instruções de acesso">
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="Link do sistema" value={systemLink} onChange={(value) => { setSystemLink(value); setCopyFeedback(''); }} />
          <Input label="Senha definida" value={accessPassword} onChange={setAccessPassword} />
          <button className="btn-secondary self-end" onClick={generateAccessInstructions}>Gerar instruções de acesso</button>
          {accessMessage && (
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-slate-300">Mensagem para WhatsApp</span>
              <textarea className="field min-h-64 resize-y" value={accessMessage} onChange={(event) => { setAccessMessage(event.target.value); setCopyFeedback(''); }} />
            </label>
          )}
          {accessMessage && (
            <div className="flex flex-col gap-2 md:col-span-2 sm:flex-row sm:items-center">
              <button className="btn-secondary w-full sm:w-auto" onClick={copyAccessMessage}>Copiar mensagem</button>
              <button className="btn-primary w-full sm:w-auto" onClick={sendAccessByWhatsApp}>Enviar pelo WhatsApp</button>
              {copyFeedback && <span className="text-sm font-semibold text-fitgreen">{copyFeedback}</span>}
            </div>
          )}
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
  const [form, setForm] = useState<PhysicalAssessment>(() => createAssessmentForm(student));
  useEffect(() => {
    setForm(createAssessmentForm(student));
  }, [student.id]);
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
      }, form.id ? 'Atualizado com sucesso.' : 'Salvo com sucesso.');
      setForm(createAssessmentForm(updatedStudent));
    } catch (error) {
      console.error('Erro ao salvar avaliação:', error);
      window.alert('Não foi possível salvar a avaliação. Verifique se o aluno está selecionado e se os campos estão preenchidos corretamente.');
    }
  };
  const editAssessment = (assessment: PhysicalAssessment) => {
    setForm({ ...assessment });
    scrollToTop();
  };
  const deleteAssessment = async (assessment: PhysicalAssessment) => {
    if (!window.confirm('Tem certeza que deseja excluir esta avaliação?')) return;
    try {
      await deleteAssessmentRemote(assessment.id);
      commit({ ...data, assessments: data.assessments.filter((item) => item.id !== assessment.id) }, 'Excluído com sucesso.');
      if (form.id === assessment.id) setForm(createAssessmentForm(student));
    } catch (error) {
      console.error('Erro ao excluir avaliação:', error);
      window.alert('Não foi possível excluir a avaliação.');
    }
  };

  return (
    <Stack>
      <PageTitle title="Avaliação física" subtitle={`${student.fullName} - IMC calculado: ${calculateImc(Number(form.weight), Number(form.height))}`} />
      <Panel title={form.id ? 'Editar avaliação' : 'Nova avaliação'}>
        <div className="grid gap-3 md:grid-cols-3">
          <Input label="Data da avaliação" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
          {fields.map(([key, label]) => (
            <Input key={String(key)} label={label} type="number" value={String(form[key] ?? 0)} onChange={(value) => setForm({ ...form, [key]: parseAssessmentNumber(value) })} />
          ))}
          <ImageUpload label="Fotos de evolução" value={form.photos} onChange={(photos) => setForm({ ...form, photos })} multiple />
          <Textarea label="Observações" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-primary w-full sm:w-auto" onClick={save}>{form.id ? 'Atualizar avaliação' : 'Salvar avaliação'}</button>
          {form.id && <button className="btn-secondary w-full sm:w-auto" onClick={() => setForm(createAssessmentForm(student))}>Nova avaliação</button>}
        </div>
      </Panel>
      <HistoryList assessments={data.assessments.filter((item) => item.studentId === student.id)} onEdit={editAssessment} onDelete={deleteAssessment} />
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
            <button className="btn-primary mt-4 w-full sm:w-auto" onClick={save}>Salvar anamnese</button>
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
  useEffect(() => {
    setWorkout(createWorkoutForm(student.id));
  }, [student.id]);
  const save = async () => {
    if (!workout.name) return;
    const nextWorkout = { ...workout, id: workout.id || makeId('w'), studentId: workout.studentId || student.id };
    try {
      const remoteId = await saveWorkoutRemote(nextWorkout, user.id);
      const savedWorkout = { ...nextWorkout, id: remoteId ?? nextWorkout.id };
      commit({ ...data, workouts: [...data.workouts.filter((item) => item.id !== nextWorkout.id), savedWorkout] }, workout.id ? 'Atualizado com sucesso.' : 'Salvo com sucesso.');
      setWorkout(createWorkoutForm(student.id));
    } catch (error) {
      console.error('Erro ao salvar treino:', error);
      window.alert(error instanceof Error ? error.message : 'Não foi possível salvar o treino.');
    }
  };
  const editWorkout = (item: Workout) => {
    setWorkout({ ...item, exercises: item.exercises.map((exercise) => ({ ...exercise })) });
    scrollToTop();
  };
  const deleteWorkout = async (item: Workout) => {
    if (!window.confirm('Tem certeza que deseja excluir este treino?')) return;
    try {
      await deleteWorkoutRemote(item.id);
      commit({
        ...data,
        workouts: data.workouts.filter((workoutItem) => workoutItem.id !== item.id),
        workoutLogs: data.workoutLogs.filter((log) => log.workoutId !== item.id)
      }, 'Excluído com sucesso.');
      if (workout.id === item.id) setWorkout(createWorkoutForm(student.id));
    } catch (error) {
      console.error('Erro ao excluir treino:', error);
      window.alert('Não foi possível excluir o treino.');
    }
  };

  return (
    <Stack>
      <PageTitle title="Criação de treinos" subtitle={`Treinos personalizados para ${studentDisplayName(student)}.`} />
      <Panel title={workout.id ? 'Editar treino' : 'Treino personalizado'}>
        <div className="grid gap-3 md:grid-cols-3">
          <Input label="Nome do treino" value={workout.name} onChange={(value) => setWorkout({ ...workout, name: value })} />
          <Input label="Objetivo" value={workout.objective} onChange={(value) => setWorkout({ ...workout, objective: value })} />
          <Select label="Nível" value={workout.level} onChange={(value) => setWorkout({ ...workout, level: value as Workout['level'] })} options={[['iniciante', 'Iniciante'], ['intermediario', 'Intermediário'], ['avancado', 'Avançado']]} />
          <Select label="Local" value={workout.place} onChange={(value) => setWorkout({ ...workout, place: value as Workout['place'] })} options={[['academia', 'Academia'], ['casa', 'Casa'], ['praia', 'Praia'], ['funcional', 'Funcional'], ['musculacao', 'Musculação'], ['caminhada', 'Caminhada'], ['outro', 'Outro']]} />
          <Input label="Duração estimada" value={workout.estimatedDuration} onChange={(value) => setWorkout({ ...workout, estimatedDuration: value })} />
          <Input label="Frequência semanal" value={workout.weeklyFrequency} onChange={(value) => setWorkout({ ...workout, weeklyFrequency: value })} />
          <Input label="Data de início" type="date" value={workout.startDate} onChange={(value) => setWorkout({ ...workout, startDate: value })} />
          <Input label="Data de término" type="date" value={workout.endDate} onChange={(value) => setWorkout({ ...workout, endDate: value })} />
          <Textarea label="Observações gerais" value={workout.notes} onChange={(value) => setWorkout({ ...workout, notes: value })} />
        </div>
        <h3 className="mt-6 font-semibold">Exercícios</h3>
        <div className="mt-3 space-y-3">
          {workout.exercises.map((exercise, index) => (
            <ExerciseEditor key={exercise.id} exercise={exercise} onChange={(next) => setWorkout({ ...workout, exercises: workout.exercises.map((item, itemIndex) => (itemIndex === index ? next : item)) })} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="btn-secondary w-full sm:w-auto" onClick={() => setWorkout({ ...workout, exercises: [...workout.exercises, emptyExercise()] })}><Plus size={16} /> Exercício</button>
          <button className="btn-primary w-full sm:w-auto" onClick={save}>{workout.id ? 'Atualizar treino' : 'Salvar treino'}</button>
          {workout.id && <button className="btn-secondary w-full sm:w-auto" onClick={() => setWorkout(createWorkoutForm(student.id))}>Novo treino</button>}
        </div>
      </Panel>
      <div className="grid gap-3 lg:grid-cols-2">
        {data.workouts.map((item) => (
          <Panel key={item.id} title={item.name} action={<Badge label={studentName(data, item.studentId)} />}>
            <p className="text-sm text-slate-400">{item.objective} - {item.estimatedDuration} - {item.weeklyFrequency}</p>
            <div className="mt-3 space-y-2">{item.exercises.map((exercise) => <Row key={exercise.id} title={exercise.name} meta={`${exercise.sets} x ${exercise.reps} - descanso ${exercise.rest}`} badge={exercise.status} />)}</div>
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
    } catch (error) {
      console.error('Erro ao salvar periodização:', error);
      window.alert('Não foi possível salvar a periodização.');
    }
  };
  const editPeriodization = () => {
    if (periodization) setWeeks(periodization.weeks);
  };
  const deletePeriodization = async () => {
    if (!periodization) return;
    if (!window.confirm('Tem certeza que deseja excluir a periodização deste aluno?')) return;
    try {
      await deletePeriodizationRemote(periodization.id);
      commit({ ...data, periodizations: data.periodizations.filter((item) => item.id !== periodization.id) }, 'Periodização excluída com sucesso.');
    } catch (error) {
      console.error('Erro ao excluir periodização:', error);
      window.alert('Não foi possível excluir a periodização.');
    }
  };
  return (
    <Stack>
      <PageTitle title="Periodização" subtitle={`${studentDisplayName(student)} - planejamento visual de ciclos por fase.`} />
      <Panel title="Criar periodização">
        <div className="flex flex-wrap gap-2">
          {[4, 8, 12].map((item) => <button key={item} className={weeks === item ? 'chip-active' : 'chip'} onClick={() => setWeeks(item as 4 | 8 | 12)}>{item} semanas</button>)}
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
        <button className="btn-primary mt-4 w-full sm:w-auto" onClick={savePeriodization}>Criar periodização</button>
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
  const currentStudent = selectedStudent ?? data.students.find((student) => student.id === selectedStudentId);
  const selectedCheckins = data.checkIns.filter(
    (item) => item.studentId === selectedStudentId
  );
  useEffect(() => {
    setCopyFeedback('');
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
          {selectedCheckins.map((checkIn) => (
            <Panel key={checkIn.id} title={studentName(data, checkIn.studentId)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoBox label="Treinos" value={`${checkIn.trainingsDone} na semana`} />
                <InfoBox label="Peso atual" value={`${checkIn.currentWeight} kg`} />
                <InfoBox label="Motivação" value={`${checkIn.motivation}/10`} />
                <InfoBox label="Estresse" value={`${checkIn.stress}/10`} />
                <InfoBox label="Alimentação" value={checkIn.food} />
                <InfoBox label="Sono" value={checkIn.sleep} />
                <InfoBox label="Dificuldade" value={checkIn.difficulty} />
                <InfoBox label="Vitória" value={checkIn.victory} />
              </div>
              <button className="btn-danger mt-4 w-full sm:w-auto" onClick={() => deleteCheckIn(checkIn)}>Excluir check-in</button>
            </Panel>
          ))}
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
  const assessments = data.assessments
    .filter((item) => getAssessmentStudentId(item) === student.id)
    .sort((a, b) => getAssessmentDateValue(a).localeCompare(getAssessmentDateValue(b)));
  const firstAssessment = assessments[0];
  const latestSelectedAssessment = assessments[assessments.length - 1];
  const initialWeight = firstAssessment ? getAssessmentNumber(firstAssessment, ['weight', 'peso']) : 0;
  const currentWeight = latestSelectedAssessment ? getAssessmentNumber(latestSelectedAssessment, ['weight', 'peso']) : 0;
  const initialBodyFat = firstAssessment ? getAssessmentNumber(firstAssessment, ['bodyFat', 'body_fat', 'gordura']) : 0;
  const currentBodyFat = latestSelectedAssessment ? getAssessmentNumber(latestSelectedAssessment, ['bodyFat', 'body_fat', 'gordura']) : 0;
  const summaryChart = buildAssessmentSummaryBars(firstAssessment, latestSelectedAssessment);
  const chart = assessments.map((item) => ({
    date: formatDate(getAssessmentDateValue(item)).slice(0, 5),
    peso: getAssessmentNumber(item, ['weight', 'peso']),
    imc: calculateImc(getAssessmentNumber(item, ['weight', 'peso']), getAssessmentNumber(item, ['height', 'altura'])),
    gordura: getAssessmentNumber(item, ['bodyFat', 'body_fat', 'gordura']),
    massa: getAssessmentNumber(item, ['leanMass', 'lean_mass'])
  }));
  const checkIns = data.checkIns.filter((item) => item.studentId === student.id);
  const workoutLogs = workoutLogsForStudent(data, student.id);
  const latestWorkoutLog = workoutLogs[0];
  const latestWorkoutDateTime = formatDateTimeParts(latestWorkoutLog?.completedAt);
  return (
    <Stack>
      <PageTitle title="Evolução do aluno" subtitle={`${student.fullName} - histórico, medidas, frequência e conquistas.`} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Peso inicial" value={firstAssessment ? `${initialWeight} kg` : 'Sem avaliação'} icon={Activity} accent="blue" />
        <StatCard label="Peso atual" value={latestSelectedAssessment ? `${currentWeight} kg` : 'Sem avaliação'} icon={LineChart} accent="green" />
        <StatCard label="Check-ins" value={checkIns.length} icon={CalendarCheck} accent="orange" />
        <StatCard label="Treinos feitos" value={workoutLogs.length} icon={Dumbbell} accent="green" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
        <StatCard label="Gordura inicial" value={firstAssessment ? `${initialBodyFat}%` : 'Sem avaliação'} icon={Activity} accent="orange" />
        <StatCard label="Gordura atual" value={latestSelectedAssessment ? `${currentBodyFat}%` : 'Sem avaliação'} icon={LineChart} accent="green" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Último treino realizado" value={latestWorkoutLog ? `${workoutName(data, latestWorkoutLog.workoutId)} - ${latestWorkoutDateTime.date} ${latestWorkoutDateTime.time}` : 'Sem registros'} icon={Dumbbell} accent="green" />
        <StatCard label="Dias sem treinar" value={latestWorkoutLog ? `${daysSince(latestWorkoutLog.completedAt)} dias` : '-'} icon={CalendarCheck} accent="orange" />
        <StatCard label="Treinos no mês" value={monthWorkoutCount(workoutLogs)} icon={Activity} accent="blue" />
        <StatCard label="Aderência ao plano" value={`${planAdherence(data, student, workoutLogs)}%`} icon={LineChart} accent="green" />
      </div>
      <Panel title="Evolução física">
        {assessments.length ? (
          <div className={compact ? 'h-64' : 'h-80'}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summaryChart}>
                <CartesianGrid stroke="#1d2b3d" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: '#0d1726', border: '1px solid #1d2b3d' }} />
                <Bar dataKey="valor" name="Valor" fill="#35e68c" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <Empty title="Este aluno ainda não possui avaliação física registrada." text="O gráfico será exibido quando houver pelo menos uma avaliação." />}
      </Panel>
      <WorkoutLogHistory data={data} logs={workoutLogs} />
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
  useEffect(() => {
    setForm(createPaymentForm(student));
    setShowForm(false);
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
      setForm(createPaymentForm(student));
      setShowForm(false);
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
        <button className="btn-primary w-full sm:w-auto" onClick={() => setShowForm(true)}>Cadastrar pagamento</button>
      </div>
      {(showForm || payments.length === 0) && (
        <Panel title="Cadastrar pagamento">
          {!payments.length && <p className="mb-4 rounded-md border border-fitblue/30 bg-fitblue/10 p-3 text-sm text-slate-200">Nenhum pagamento cadastrado para este aluno. Registre o primeiro vencimento para acompanhar cobranças.</p>}
          <div className="grid gap-3 md:grid-cols-3">
            <Input label="Plano" value={form.plan} onChange={(value) => setForm({ ...form, plan: value })} />
            <Input label="Valor" type="number" value={String(form.amount)} onChange={(value) => setForm({ ...form, amount: numberOrZero(value) })} />
            <Select label="Forma de pagamento" value={form.method} onChange={(value) => setForm({ ...form, method: value as Payment['method'] })} options={[['Pix', 'Pix'], ['cartao', 'Cartão'], ['dinheiro', 'Dinheiro']]} />
            <Select label="Recorrência" value={form.recurrence} onChange={(value) => setForm({ ...form, recurrence: value as Payment['recurrence'] })} options={[['semanal', 'Semanal'], ['mensal', 'Mensal'], ['trimestral', 'Trimestral'], ['avulso', 'Avulso']]} />
            <Select label="Status" value={form.status} onChange={(value) => setForm({ ...form, status: value as Payment['status'] })} options={[['pago', 'Pago'], ['pendente', 'Pendente'], ['atrasado', 'Atrasado']]} />
            <Input label="Vencimento" type="date" value={form.dueDate} onChange={(value) => setForm({ ...form, dueDate: value })} />
            <Textarea label="Observações" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary w-full sm:w-auto" onClick={savePayment}>{form.id ? 'Atualizar pagamento' : 'Salvar pagamento'}</button>
            {form.id && <button className="btn-secondary w-full sm:w-auto" onClick={() => { setForm(createPaymentForm(student)); setShowForm(false); }}>Novo pagamento</button>}
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
                <button key={status} className={payment.status === status ? 'chip-active' : 'chip'} onClick={() => updatePaymentStatus(payment, status)}>{status}</button>
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

function WorkoutLogHistory({ data, logs, showStudent = true, emptyText = 'Quando o aluno concluir um treino, o registro aparecerá aqui.' }: { data: AppData; logs: WorkoutLog[]; showStudent?: boolean; emptyText?: string }) {
  return (
    <Panel title="Histórico de treinos realizados">
      {logs.length ? (
        <div className="space-y-3">
          {logs.map((log) => {
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
        </div>
      ) : (
        <Empty title="Sem treinos concluídos" text={emptyText} />
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
  const workouts = data.workouts.filter((item) => item.studentId === student.id);
  const updateWorkout = (workout: Workout) => commit({ ...data, workouts: data.workouts.map((item) => (item.id === workout.id ? workout : item)) }, 'Treino atualizado.');
  const startWorkout = (workout: Workout) => updateWorkout({ ...workout, completed: false });
  const completeWorkout = async (workout: Workout) => {
    try {
      const workoutLog = await saveWorkoutLogRemote(workout.id, student.id, student.profileId);
      commit({
        ...data,
        workouts: data.workouts.map((item) => (item.id === workout.id ? { ...workout, completed: true } : item)),
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
            {workout.exercises.map((exercise) => (
              <div key={exercise.id} className="rounded-md border border-line bg-ink/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{exercise.name}</p>
                    <p className="text-sm text-slate-400">{exercise.sets} séries - {exercise.reps} reps - descanso {exercise.rest}</p>
                  </div>
                  <button className={exercise.status === 'concluido' ? 'chip-active' : 'chip'} onClick={() => updateWorkout({ ...workout, exercises: workout.exercises.map((item) => (item.id === exercise.id ? { ...item, status: item.status === 'concluido' ? 'ativo' : 'concluido' } : item)) })}>{exercise.status === 'concluido' ? 'Concluído' : 'Concluir'}</button>
                </div>
                <p className="mt-2 text-sm text-slate-300">{exercise.notes}</p>
                {exercise.videoUrl && <a className="mt-2 inline-block text-sm text-fitblue" href={exercise.videoUrl} target="_blank">Vídeo explicativo</a>}
              </div>
            ))}
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
  const save = async () => {
    const checkIn: CheckIn = { id: makeId('c'), studentId: student.id, date: new Date().toISOString().slice(0, 10), ...form };
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Treinei quantas vezes?" type="number" value={String(form.trainingsDone)} onChange={(value) => setForm({ ...form, trainingsDone: Number(value) })} />
          <Input label="Peso atual" type="number" value={String(form.currentWeight)} onChange={(value) => setForm({ ...form, currentWeight: Number(value) })} />
          <Input label="Como me senti?" value={form.energy} onChange={(value) => setForm({ ...form, energy: value })} />
          <Input label="Alimentação" value={form.food} onChange={(value) => setForm({ ...form, food: value })} />
          <Input label="Sono" value={form.sleep} onChange={(value) => setForm({ ...form, sleep: value })} />
          <ImageUpload label="Foto opcional" value={form.photo ? [form.photo] : []} onChange={(photos) => setForm({ ...form, photo: photos[0] ?? '' })} />
          <Input label="Motivação 1 a 10" type="number" value={String(form.motivation)} onChange={(value) => setForm({ ...form, motivation: Number(value) })} />
          <Input label="Estresse 1 a 10" type="number" value={String(form.stress)} onChange={(value) => setForm({ ...form, stress: Number(value) })} />
          <Textarea label="Minha dificuldade" value={form.difficulty} onChange={(value) => setForm({ ...form, difficulty: value })} />
          <Textarea label="Minha vitória" value={form.victory} onChange={(value) => setForm({ ...form, victory: value })} />
          <Textarea label="Observações livres" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
        </div>
        <button className="btn-primary mt-5 w-full sm:w-auto" onClick={save}>Enviar check-in</button>
      </Panel>
    </Stack>
  );
}

function StudentProfile({ data, student, commit }: { data: AppData; student: Student; commit: (data: AppData, message?: string) => void }) {
  const [form, setForm] = useState(student);
  return (
    <Stack>
      <PageTitle title="Meu perfil" subtitle="Atualize seus dados básicos e objetivo." />
      <Panel title="Dados pessoais">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Nome" value={form.fullName} onChange={(value) => setForm({ ...form, fullName: value })} />
          <Input label="Telefone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
          <ImageUpload label="Foto de perfil" value={form.avatar ? [form.avatar] : []} onChange={(photos) => setForm({ ...form, avatar: photos[0] })} />
          <Input label="Objetivo" value={form.goal} onChange={(value) => setForm({ ...form, goal: value })} />
          <Textarea label="Meta" value={form.target} onChange={(value) => setForm({ ...form, target: value })} />
        </div>
        <button className="btn-primary mt-4 w-full sm:w-auto" onClick={() => commit({ ...data, students: data.students.map((item) => (item.id === student.id ? form : item)) }, 'Perfil atualizado.')}>Salvar perfil</button>
      </Panel>
    </Stack>
  );
}

function ExerciseEditor({ exercise, onChange }: { exercise: Exercise; onChange: (exercise: Exercise) => void }) {
  return (
    <div className="rounded-md border border-line bg-ink/40 p-3">
      <div className="grid gap-3 md:grid-cols-4">
        <Input label="Nome do exercício" value={exercise.name} onChange={(value) => onChange({ ...exercise, name: value })} />
        <Input label="Grupo muscular" value={exercise.muscleGroup} onChange={(value) => onChange({ ...exercise, muscleGroup: value })} />
        <Input label="Séries" value={exercise.sets} onChange={(value) => onChange({ ...exercise, sets: value })} />
        <Input label="Repetições" value={exercise.reps} onChange={(value) => onChange({ ...exercise, reps: value })} />
        <Input label="Carga" value={exercise.load} onChange={(value) => onChange({ ...exercise, load: value })} />
        <Input label="Descanso" value={exercise.rest} onChange={(value) => onChange({ ...exercise, rest: value })} />
        <Input label="Vídeo explicativo" value={exercise.videoUrl} onChange={(value) => onChange({ ...exercise, videoUrl: value })} />
        <Select label="Status" value={exercise.status} onChange={(value) => onChange({ ...exercise, status: value as Exercise['status'] })} options={[['ativo', 'Ativo'], ['concluido', 'Concluído']]} />
        <Textarea label="Observações técnicas" value={exercise.notes} onChange={(value) => onChange({ ...exercise, notes: value })} />
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

function HistoryList({ assessments, onEdit, onDelete }: { assessments: PhysicalAssessment[]; onEdit?: (assessment: PhysicalAssessment) => void; onDelete?: (assessment: PhysicalAssessment) => void }) {
  return (
    <Panel title="Histórico de avaliações">
      {assessments.length ? (
        <div className="space-y-3">
          {assessments.slice().sort((a, b) => b.date.localeCompare(a.date)).map((item) => (
            <div key={item.id} className="rounded-md border border-line bg-ink/40 p-3">
              <Row title={`${formatDate(item.date)} - ${item.weight} kg`} meta={`IMC ${calculateImc(item.weight, item.height)} - gordura ${item.bodyFat}% - cintura ${item.waist} cm`} badge="Avaliação" />
              {(onEdit || onDelete) && (
                <div className="mt-3 flex flex-wrap gap-2">
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
  return <div className="space-y-4">{children}</div>;
}

function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-2xl font-black sm:text-3xl">{title}</h1>
      <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-panel p-3 shadow-[0_10px_30px_rgba(0,0,0,.18)] sm:p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: string | number; icon: IconComponent; accent: 'blue' | 'orange' | 'green' }) {
  const color = accent === 'blue' ? 'text-fitblue' : accent === 'orange' ? 'text-fitorange' : 'text-fitgreen';
  return (
    <div className="rounded-lg border border-line bg-[linear-gradient(135deg,rgba(13,23,38,.98),rgba(10,29,38,.82))] p-4 shadow-[0_12px_34px_rgba(0,0,0,.18)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">{label}</p>
        <div className="grid h-9 w-9 place-items-center rounded-md border border-white/10 bg-white/5">
          <Icon className={color} size={20} />
        </div>
      </div>
      <p className="mt-3 truncate text-2xl font-black">{value}</p>
    </div>
  );
}

function NavButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: IconComponent; label: string; onClick: () => void }) {
  return (
    <button className={`flex min-w-max items-center gap-3 rounded-md px-3 py-2 text-sm transition md:mb-1 md:w-full ${active ? 'bg-fitblue text-ink' : 'text-slate-300 hover:bg-white/5'}`} onClick={onClick}>
      <Icon size={18} />
      <span>{label}</span>
    </button>
  );
}

function MobileTab({ active, icon: Icon, label, onClick }: { active: boolean; icon: IconComponent; label: string; onClick: () => void }) {
  return (
    <button className={`flex flex-col items-center gap-1 rounded-md px-1 py-2 text-[11px] ${active ? 'bg-fitgreen text-ink' : 'text-slate-400'}`} onClick={onClick}>
      <Icon size={18} />
      <span className="truncate">{label}</span>
    </button>
  );
}

function Input({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-300">{label}</span>
      <input className="field" type={type} value={value ?? ''} required={required} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-300">{label}</span>
      <select className="field" value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm md:col-span-2">
      <span className="mb-1 block text-slate-300">{label}</span>
      <textarea className="field min-h-24 resize-y" value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ImageUpload({ label, value, onChange, multiple = false }: { label: string; value: string[]; onChange: (value: string[]) => void; multiple?: boolean }) {
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
        <input className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-fitblue file:px-3 file:py-2 file:text-sm file:font-bold file:text-ink" type="file" accept="image/*" multiple={multiple} onChange={(event) => handleFiles(event.target.files)} />
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
    <div className="rounded-md border border-line bg-ink/40 p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-200">{value || '-'}</p>
    </div>
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
  return <span className="rounded-full border border-fitblue/30 bg-fitblue/10 px-2.5 py-1 text-xs font-semibold text-fitblue">{display}</span>;
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
