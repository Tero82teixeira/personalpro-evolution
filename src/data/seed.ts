import type { AppData } from '../types';

export const seedData: AppData = {
  users: [
    {
      id: 'u-admin',
      name: 'Marina Costa',
      email: 'personal@demo.com',
      password: '123456',
      role: 'admin'
    },
    {
      id: 'u-student',
      name: 'Lucas Almeida',
      email: 'aluno@demo.com',
      password: '123456',
      role: 'student',
      studentId: 's-1'
    }
  ],
  students: [
    {
      id: 's-1',
      profileId: 'u-student',
      fullName: 'Lucas Almeida',
      email: 'aluno@demo.com',
      phone: '(11) 98888-4545',
      birthDate: '1995-04-18',
      sex: 'Masculino',
      goal: 'Hipertrofia com reducao de gordura',
      level: 'intermediario',
      status: 'ativo',
      plan: 'Consultoria Premium',
      startDate: '2026-03-04',
      notes: 'Prefere treinos objetivos e feedbacks por WhatsApp.',
      target: 'Chegar a 82 kg com 13% de gordura',
      initialWeight: 91.5,
      currentWeight: 87.2
    },
    {
      id: 's-2',
      fullName: 'Beatriz Santos',
      email: 'bia@demo.com',
      phone: '(21) 97777-1010',
      birthDate: '1991-09-09',
      sex: 'Feminino',
      goal: 'Condicionamento e qualidade de vida',
      level: 'iniciante',
      status: 'pendente',
      plan: 'Plano Mensal',
      startDate: '2026-05-01',
      notes: 'Aguardar avaliação inicial.',
      target: 'Treinar 4x por semana',
      initialWeight: 68.4,
      currentWeight: 68.4
    },
    {
      id: 's-3',
      fullName: 'Rafael Lima',
      email: 'rafa@demo.com',
      phone: '(31) 96666-2020',
      birthDate: '1987-01-27',
      sex: 'Masculino',
      goal: 'Voltar a correr sem dor',
      level: 'avancado',
      status: 'ativo',
      plan: 'Performance',
      startDate: '2026-02-12',
      notes: 'Histórico de dor no joelho direito.',
      target: 'Completar 10 km em 50 min',
      initialWeight: 79.1,
      currentWeight: 77.6
    }
  ],
  assessments: [
    {
      id: 'a-1',
      studentId: 's-1',
      date: '2026-03-04',
      weight: 91.5,
      height: 1.78,
      bodyFat: 22.4,
      leanMass: 71,
      fatMass: 20.5,
      abdomen: 98,
      waist: 92,
      hip: 103,
      rightArm: 36,
      leftArm: 35.5,
      rightThigh: 59,
      leftThigh: 58.5,
      rightCalf: 39,
      leftCalf: 39,
      photos: [],
      notes: 'Início do acompanhamento.'
    },
    {
      id: 'a-2',
      studentId: 's-1',
      date: '2026-05-20',
      weight: 87.2,
      height: 1.78,
      bodyFat: 18.8,
      leanMass: 70.8,
      fatMass: 16.4,
      abdomen: 92,
      waist: 87,
      hip: 101,
      rightArm: 36.8,
      leftArm: 36.2,
      rightThigh: 60,
      leftThigh: 59.7,
      rightCalf: 39.5,
      leftCalf: 39.2,
      photos: [],
      notes: 'Boa reducao de medidas.'
    }
  ],
  anamneses: [
    {
      id: 'an-1',
      studentId: 's-1',
      mainGoal: 'Definicao muscular',
      trainingHistory: 'Treina musculacao ha 3 anos com pausas.',
      injuries: 'Sem lesoes ativas.',
      medications: 'Nenhum.',
      medicalRestrictions: 'Nenhuma.',
      workRoutine: 'Trabalho sentado, 8 horas por dia.',
      stressLevel: 7,
      sleepQuality: 6,
      sleepHours: 6.5,
      eatingHabits: 'Boa adesao durante a semana, falha no fim de semana.',
      waterIntake: '2 litros por dia',
      emotionalExerciseRelation: 'Sente-se melhor quando treina cedo.',
      difficulties: 'Organizar refeicoes.',
      demotivators: 'Resultados lentos.',
      motivators: 'Medidas e fotos comparativas.',
      weeklyAvailability: '5 dias',
      trainingLocation: 'academia'
    }
  ],
  workouts: [
    {
      id: 'w-1',
      studentId: 's-1',
      name: 'Treino A - Superiores',
      objective: 'Hipertrofia e tecnica',
      level: 'intermediario',
      place: 'academia',
      estimatedDuration: '55 min',
      weeklyFrequency: '2x',
      startDate: '2026-05-01',
      endDate: '2026-06-01',
      notes: 'Priorizar execucao controlada.',
      completed: false,
      exercises: [
        {
          id: 'e-1',
          name: 'Supino reto',
          muscleGroup: 'Peitoral',
          sets: '4',
          reps: '8-10',
          load: '70 kg',
          rest: '90s',
          notes: 'Escapulas encaixadas.',
          videoUrl: 'https://www.youtube.com/results?search_query=supino+reto+tecnica',
          status: 'ativo'
        },
        {
          id: 'e-2',
          name: 'Remada baixa',
          muscleGroup: 'Costas',
          sets: '4',
          reps: '10-12',
          load: '55 kg',
          rest: '75s',
          notes: 'Segurar 1s na contracao.',
          videoUrl: 'https://www.youtube.com/results?search_query=remada+baixa+tecnica',
          status: 'ativo'
        }
      ]
    }
  ],
  periodizations: [
    {
      id: 'p-1',
      studentId: 's-1',
      weeks: 8,
      phases: ['Adaptação', 'Evolução', 'Intensificação', 'Recuperação'],
      startDate: '2026-05-01'
    }
  ],
  checkIns: [
    {
      id: 'c-1',
      studentId: 's-1',
      date: '2026-05-18',
      trainingsDone: 4,
      food: 'Boa, com uma refeicao livre',
      sleep: 'Regular',
      energy: 'Alta',
      motivation: 8,
      stress: 5,
      currentWeight: 87.2,
      difficulty: 'Jantar tarde',
      victory: 'Completei todos os treinos',
      notes: 'Me senti mais disposto.'
    }
  ],
  payments: [
    {
      id: 'pay-1',
      studentId: 's-1',
      plan: 'Consultoria Premium',
      amount: 450,
      method: 'Pix',
      recurrence: 'mensal',
      status: 'pago',
      dueDate: '2026-05-10',
      notes: 'Pagamento recorrente.'
    },
    {
      id: 'pay-2',
      studentId: 's-2',
      plan: 'Plano Mensal',
      amount: 300,
      method: 'cartao',
      recurrence: 'mensal',
      status: 'pendente',
      dueDate: '2026-05-30',
      notes: 'Enviar lembrete.'
    }
  ],
  messages: [
    {
      id: 'm-1',
      type: 'Boas-vindas',
      title: 'Início premium',
      content: 'Bem-vindo ao PersonalPro Evolution. A partir de hoje vamos acompanhar treino, check-ins e evolução com clareza.'
    },
    {
      id: 'm-2',
      type: 'Lembrete de check-in',
      title: 'Check-in semanal',
      content: 'Passando para lembrar do seu check-in. Suas respostas ajudam a ajustar o treino da semana.'
    },
    {
      id: 'm-3',
      type: 'Motivação',
      title: 'Consistencia',
      content: 'O resultado vem da soma das semanas bem feitas. Foque no treino de hoje.'
    }
  ],
  marketingIdeas: [
    {
      id: 'mk-1',
      category: 'Reels',
      title: '3 erros no treino de pernas',
      content: 'Mostre erro, correção e benefício em cortes rápidos. CTA: envie "pernas" para receber uma avaliação.'
    },
    {
      id: 'mk-2',
      category: 'Stories',
      title: 'Enquete de dificuldade',
      content: 'Pergunte: "O que mais te trava: tempo, dor ou falta de plano?" Responda cada voto no direct.'
    },
    {
      id: 'mk-3',
      category: 'WhatsApp',
      title: 'Aula experimental',
      content: 'Tenho 3 horários para aula experimental nesta semana. Quer que eu veja o melhor encaixe para seu objetivo?'
    }
  ]
};
