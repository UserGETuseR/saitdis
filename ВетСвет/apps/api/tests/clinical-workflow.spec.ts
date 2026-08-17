import assert from 'node:assert/strict';
import { canAmendClinicalRecord, canEditClinicalRecord, clinicalReadiness, clinicalSignature } from '../src/clinical-workflow';

const complete = {
  complaint: 'Снижение аппетита', subjective: 'Владелец заметил отказ от корма.', objective: 'Осмотр слизистых и живота выполнен.',
  assessment: 'Рабочая оценка требует наблюдения в динамике.', plan: 'Поддерживающая терапия и контроль состояния.',
  dischargeSummary: 'Наблюдать аппетит и активность, повторный осмотр по сроку.', diagnoses: [{ display: 'Снижение аппетита', diagnosisType: 'PROBLEM', certainty: 'SUSPECTED' }]
};
assert.equal(clinicalReadiness(complete).ready, true);
assert.deepEqual(clinicalReadiness({ ...complete, dischargeSummary: '' }).missing, ['dischargeSummary']);
assert.equal(clinicalSignature({ ...complete, encounterId: 'e-1', version: 1, clinicianId: 'vet-1' }), clinicalSignature({ ...complete, encounterId: 'e-1', version: 1, clinicianId: 'vet-1' }));
assert.equal(canEditClinicalRecord('DRAFT'), true);
assert.equal(canEditClinicalRecord('FINALIZED'), false);
assert.equal(canAmendClinicalRecord('FINALIZED'), true);
assert.equal(canAmendClinicalRecord('AMENDED'), false);
console.log('VetSvet clinical workflow: readiness, signature and immutable state checks passed');
