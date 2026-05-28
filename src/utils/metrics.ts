import type { PhysicalAssessment, Student } from '../types';

export function calculateImc(weight: number, height: number) {
  if (!weight || !height) return 0;
  return Number((weight / (height * height)).toFixed(1));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatDate(value: string) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value));
}

export function daysUntil(date: string) {
  const today = new Date();
  const target = new Date(`${date}T00:00:00`);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export function latestAssessment(assessments: PhysicalAssessment[], studentId: string) {
  return assessments
    .filter((assessment) => assessment.studentId === studentId)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

export function studentInitials(student: Pick<Student, 'fullName'>) {
  return student.fullName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
