import assert from 'node:assert/strict';
import { advanceGroomingStage, canCompleteGrooming, createGroomingChecklist, toggleGroomingChecklist } from '../src/grooming-workflow';

const startedAt = new Date('2026-08-17T08:00:00.000Z');
const now = new Date('2026-08-17T08:05:00.000Z');
let checklist = createGroomingChecklist();
assert.equal(canCompleteGrooming('INTAKE', checklist), false);
assert.throws(() => advanceGroomingStage({ currentStage: 'INTAKE', stageStartedAt: startedAt, stageLog: [], checklist, now }), /CHECKLIST_INCOMPLETE/);
checklist = toggleGroomingChecklist(checklist, 'coat_assessed', now);
checklist = toggleGroomingChecklist(checklist, 'owner_request', now);
const advanced = advanceGroomingStage({ currentStage: 'INTAKE', stageStartedAt: startedAt, stageLog: [], checklist, now });
assert.equal(advanced.currentStage, 'BATH');
assert.equal(advanced.stageLog[0].durationSeconds, 300);
assert.equal(advanced.stageLog[0].stage, 'INTAKE');
for (const id of ['cleansing', 'drying', 'styling', 'final_check']) checklist = toggleGroomingChecklist(checklist, id, now);
assert.equal(canCompleteGrooming('FINISH', checklist), true);
assert.throws(() => toggleGroomingChecklist(checklist, 'unknown'), /NOT_FOUND/);
console.log('grooming workflow: ok');
