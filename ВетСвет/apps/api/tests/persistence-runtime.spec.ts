import assert from 'node:assert/strict';
import { createPersistenceRuntime } from '../src/platform/persistence-runtime';

const memory = createPersistenceRuntime({});
assert.equal(memory.mode, 'IN_MEMORY');

const prisma = createPersistenceRuntime({ DATABASE_URL: 'postgresql://vetsvet:vetsvet@127.0.0.1:5432/vetsvet' });
assert.equal(prisma.mode, 'POSTGRES_PRISMA');
if (prisma.mode === 'POSTGRES_PRISMA') void prisma.client.$disconnect();

console.log('VetSvet persistence runtime: 2/2 mode checks passed');
