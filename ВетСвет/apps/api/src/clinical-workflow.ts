import { createHash } from 'node:crypto';

export type ClinicalDraft = {
  complaint?: string | null;
  history?: Record<string, unknown> | null;
  vitals?: Record<string, unknown> | null;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  dischargeSummary?: string | null;
  diagnoses?: Array<{ code?: string | null; display?: string | null; diagnosisType?: string | null; certainty?: string | null }>;
};

const text = (value: unknown) => String(value ?? '').trim();

export function clinicalReadiness(draft: ClinicalDraft) {
  const missing: string[] = [];
  if (text(draft.complaint).length < 3) missing.push('complaint');
  if (text(draft.subjective).length < 3) missing.push('subjective');
  if (text(draft.objective).length < 3) missing.push('objective');
  if (text(draft.assessment).length < 10) missing.push('assessment');
  if (text(draft.plan).length < 10) missing.push('plan');
  if (text(draft.dischargeSummary).length < 20) missing.push('dischargeSummary');
  if (!(draft.diagnoses ?? []).some((item) => text(item.display).length >= 3)) missing.push('diagnosis');
  return { ready: missing.length === 0, missing };
}

export function clinicalSignature(input: ClinicalDraft & { encounterId: string; version: number; clinicianId: string }) {
  const canonical = JSON.stringify({
    encounterId: input.encounterId,
    version: input.version,
    clinicianId: input.clinicianId,
    complaint: text(input.complaint),
    history: input.history ?? {},
    vitals: input.vitals ?? {},
    subjective: text(input.subjective),
    objective: text(input.objective),
    assessment: text(input.assessment),
    plan: text(input.plan),
    dischargeSummary: text(input.dischargeSummary),
    diagnoses: (input.diagnoses ?? []).map((item) => ({ code: text(item.code), display: text(item.display), diagnosisType: text(item.diagnosisType), certainty: text(item.certainty) }))
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function canEditClinicalRecord(state: string) { return state === 'DRAFT'; }
export function canAmendClinicalRecord(state: string) { return state === 'FINALIZED'; }
