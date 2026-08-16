export const GROOMING_STAGES = ['INTAKE', 'BATH', 'DRY', 'STYLE', 'FINISH'] as const;
export type GroomingStage = typeof GROOMING_STAGES[number];

export type GroomingChecklistItem = {
  id: string;
  label: string;
  stage: GroomingStage;
  required: boolean;
  done: boolean;
  doneAt?: string;
};

export type GroomingStageLogItem = {
  stage: GroomingStage;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
};

export const createGroomingChecklist = (): GroomingChecklistItem[] => [
  { id: 'coat_assessed', label: 'Оценить шерсть, кожу и чувствительные зоны', stage: 'INTAKE', required: true, done: false },
  { id: 'owner_request', label: 'Сверить образ и пожелания владельца', stage: 'INTAKE', required: true, done: false },
  { id: 'cleansing', label: 'Выполнить согласованное очищение и уход', stage: 'BATH', required: true, done: false },
  { id: 'drying', label: 'Высушить в комфортном для питомца темпе', stage: 'DRY', required: true, done: false },
  { id: 'styling', label: 'Выполнить стрижку или оформление по рецепту', stage: 'STYLE', required: true, done: false },
  { id: 'final_check', label: 'Проверить результат, самочувствие и рекомендации', stage: 'FINISH', required: true, done: false }
];

export function normalizeGroomingChecklist(value: unknown): GroomingChecklistItem[] {
  const defaults = createGroomingChecklist();
  if (!Array.isArray(value)) return defaults;
  const saved = new Map(value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')).map((item) => [String(item.id ?? ''), item]));
  return defaults.map((item) => {
    const current = saved.get(item.id);
    return current ? { ...item, done: current.done === true, doneAt: typeof current.doneAt === 'string' ? current.doneAt : undefined } : item;
  });
}

export function toggleGroomingChecklist(value: unknown, itemId: string, now = new Date()): GroomingChecklistItem[] {
  const checklist = normalizeGroomingChecklist(value);
  if (!checklist.some((item) => item.id === itemId)) throw new Error('CHECKLIST_ITEM_NOT_FOUND');
  return checklist.map((item) => item.id === itemId ? { ...item, done: !item.done, doneAt: item.done ? undefined : now.toISOString() } : item);
}

export function advanceGroomingStage(input: { currentStage: string; stageStartedAt: Date; stageLog: unknown; checklist: unknown; now?: Date }) {
  const now = input.now ?? new Date();
  const index = GROOMING_STAGES.indexOf(input.currentStage as GroomingStage);
  if (index < 0 || index >= GROOMING_STAGES.length - 1) throw new Error('GROOMING_STAGE_CANNOT_ADVANCE');
  const stage = GROOMING_STAGES[index];
  const checklist = normalizeGroomingChecklist(input.checklist);
  if (checklist.some((item) => item.stage === stage && item.required && !item.done)) throw new Error('GROOMING_STAGE_CHECKLIST_INCOMPLETE');
  const existingLog = Array.isArray(input.stageLog) ? input.stageLog : [];
  return {
    currentStage: GROOMING_STAGES[index + 1],
    stageStartedAt: now,
    stageLog: [...existingLog, { stage, startedAt: input.stageStartedAt.toISOString(), completedAt: now.toISOString(), durationSeconds: Math.max(0, Math.round((now.valueOf() - input.stageStartedAt.valueOf()) / 1000)) }]
  };
}

export function canCompleteGrooming(currentStage: string, checklistValue: unknown) {
  const checklist = normalizeGroomingChecklist(checklistValue);
  return currentStage === 'FINISH' && checklist.every((item) => !item.required || item.done);
}
