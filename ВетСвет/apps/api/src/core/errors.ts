export class DomainError extends Error {
  constructor(
    public readonly code: 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION',
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
