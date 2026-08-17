export type CareSignal = {
  key: string;
  kind: string;
  title: string;
  explanation: string;
  expectedOutcome: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  dueAt?: Date;
  assignedRole?: string;
};

export type JourneyStage = {
  key: 'ACCEPTED' | 'STARTED' | 'RECOMMENDATIONS_READY' | 'READY_FOR_PICKUP' | 'NEXT_STEP';
  label: string;
  state: 'DONE' | 'ACTIVE' | 'UPCOMING';
};

export function appointmentJourney(state: string, hasRecommendations = false): JourneyStage[] {
  const stages: Omit<JourneyStage, 'state'>[] = [
    { key: 'ACCEPTED', label: 'Питомец принят' },
    { key: 'STARTED', label: 'Специалист начал работу' },
    { key: 'RECOMMENDATIONS_READY', label: 'Рекомендации готовы' },
    { key: 'READY_FOR_PICKUP', label: 'Можно забирать' },
    { key: 'NEXT_STEP', label: 'Следующий шаг' }
  ];
  const index = state === 'CHECKED_IN' ? 0
    : state === 'IN_SERVICE' ? 1
      : state === 'READY' ? (hasRecommendations ? 3 : 2)
        : state === 'COMPLETED' ? 4
          : -1;
  return stages.map((stage, position) => ({
    ...stage,
    state: index < 0 ? 'UPCOMING' : position < index ? 'DONE' : position === index ? 'ACTIVE' : 'UPCOMING'
  }));
}

export function deriveCareSignals(input: {
  now: Date;
  vaccinationDueAt?: Date | null;
  prescriptions?: { id: string; medicationName: string; endsAt?: Date | null; state: string }[];
  labs?: { id: string; testName: string; state: string; resultSummary?: string | null }[];
  groomingNextCareAt?: Date | null;
  requestedAppointment?: { id: string; createdAt: Date } | null;
  unsignedDocument?: { id: string; createdAt: Date } | null;
}) {
  const signals: CareSignal[] = [];
  const threeDays = new Date(input.now.valueOf() + 3 * 86_400_000);
  if (input.vaccinationDueAt && input.vaccinationDueAt <= new Date(input.now.valueOf() + 30 * 86_400_000)) {
    signals.push({
      key: `vaccination:${input.vaccinationDueAt.toISOString().slice(0, 10)}`,
      kind: 'VACCINATION_DUE',
      title: 'Проверить срок вакцинации',
      explanation: `В паспорте указан срок ${input.vaccinationDueAt.toLocaleDateString('ru-RU')}.`,
      expectedOutcome: 'Команда сверит историю и предложит безопасную дату профилактики.',
      priority: input.vaccinationDueAt < input.now ? 'HIGH' : 'NORMAL',
      dueAt: input.vaccinationDueAt,
      assignedRole: 'VETERINARIAN'
    });
  }
  for (const item of input.prescriptions ?? []) {
    if (item.state === 'ACTIVE' && item.endsAt && item.endsAt <= threeDays) signals.push({
      key: `medication:${item.id}`,
      kind: 'MEDICATION_ENDING',
      title: `Заканчивается ${item.medicationName}`,
      explanation: `Назначенный курс заканчивается ${item.endsAt.toLocaleDateString('ru-RU')}.`,
      expectedOutcome: 'Врач проверит результат курса и решит, требуется ли контроль или продление.',
      priority: 'HIGH',
      dueAt: item.endsAt,
      assignedRole: 'VETERINARIAN'
    });
  }
  for (const item of input.labs ?? []) {
    if (['RESULT_READY', 'REVIEW_REQUIRED'].includes(item.state)) signals.push({
      key: `lab:${item.id}`,
      kind: 'LAB_REVIEW',
      title: `Проверить результат: ${item.testName}`,
      explanation: item.resultSummary
        ? `Лаборатория вернула результат: ${item.resultSummary}`
        : 'Лабораторный результат готов и ещё не проверен врачом.',
      expectedOutcome: 'Ветеринарный сотрудник интерпретирует результат и свяжет его с планом лечения.',
      priority: 'HIGH',
      assignedRole: 'VETERINARIAN'
    });
  }
  if (input.groomingNextCareAt && input.groomingNextCareAt <= new Date(input.now.valueOf() + 14 * 86_400_000)) {
    signals.push({
      key: `grooming:${input.groomingNextCareAt.toISOString().slice(0, 10)}`,
      kind: 'GROOMING_REBOOK',
      title: 'Пора повторить уход',
      explanation: `После прошлого визита мастер рекомендовал следующий уход к ${input.groomingNextCareAt.toLocaleDateString('ru-RU')}.`,
      expectedOutcome: 'Администратор предложит подходящее окно с учётом рецепта и медицинских ограничений.',
      priority: 'NORMAL',
      dueAt: input.groomingNextCareAt,
      assignedRole: 'GROOMER'
    });
  }
  if (input.requestedAppointment && input.requestedAppointment.createdAt <= new Date(input.now.valueOf() - 2 * 3_600_000)) {
    signals.push({
      key: `booking:${input.requestedAppointment.id}`,
      kind: 'BOOKING_UNCONFIRMED',
      title: 'Подтвердить запись владельцу',
      explanation: 'Заявка ожидает решения команды более двух часов.',
      expectedOutcome: 'Владелец получит понятный статус: запись подтверждена или предложено другое время.',
      priority: 'HIGH',
      assignedRole: 'RECEPTIONIST'
    });
  }
  if (input.unsignedDocument && input.unsignedDocument.createdAt <= new Date(input.now.valueOf() - 24 * 3_600_000)) {
    signals.push({
      key: `document:${input.unsignedDocument.id}`,
      kind: 'DOCUMENT_INCOMPLETE',
      title: 'Завершить документ',
      explanation: 'Документ ожидает подписи или проверки больше суток.',
      expectedOutcome: 'Ответственный сотрудник проверит документ и безопасно завершит цикл.',
      priority: 'NORMAL',
      assignedRole: 'RECEPTIONIST'
    });
  }
  return signals;
}

export function memorySeverity(value: string) {
  return ['URGENT', 'HIGH'].includes(value.toUpperCase()) ? 'ALERT'
    : value.toUpperCase() === 'MEDIUM' ? 'WATCH'
      : 'INFO';
}
