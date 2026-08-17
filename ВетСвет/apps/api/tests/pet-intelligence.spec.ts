import assert from 'node:assert/strict';
import { appointmentJourney, deriveCareSignals, memorySeverity } from '../src/pet-intelligence';

const now = new Date('2026-08-17T10:00:00+03:00');
assert.equal(appointmentJourney('IN_SERVICE')[1].state, 'ACTIVE');
assert.equal(appointmentJourney('COMPLETED')[4].state, 'ACTIVE');
const signals = deriveCareSignals({ now, vaccinationDueAt: new Date('2026-08-10T00:00:00+03:00'), prescriptions: [{ id: 'rx1', medicationName: 'Препарат', state: 'ACTIVE', endsAt: new Date('2026-08-18T00:00:00+03:00') }], labs: [{ id: 'lab1', testName: 'ОАК', state: 'RESULT_READY' }], requestedAppointment: { id: 'a1', createdAt: new Date('2026-08-17T06:00:00+03:00') } });
assert.deepEqual(signals.map((item) => item.kind), ['VACCINATION_DUE', 'MEDICATION_ENDING', 'LAB_REVIEW', 'BOOKING_UNCONFIRMED']);
assert.equal(memorySeverity('urgent'), 'ALERT');
console.log('pet intelligence: ok');
