export type IntegrationHealth = { key: string; state: 'DISABLED' | 'HEALTHY' | 'DEGRADED' | 'FAILED'; checkedAt: string; message?: string };
export interface IntegrationAdapter { readonly key: string; health(): Promise<IntegrationHealth>; }
export class IntegrationRegistry {
  constructor(private readonly adapters: readonly IntegrationAdapter[]) {}
  async health(): Promise<readonly IntegrationHealth[]> { return Promise.all(this.adapters.map(async (adapter) => { try { return await adapter.health(); } catch { return { key: adapter.key, state: 'FAILED', checkedAt: new Date().toISOString(), message: 'Health check failed.' }; } })); }
}
