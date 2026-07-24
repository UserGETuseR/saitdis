'use client';

import { useActionState } from 'react';
import { loginAction, type ActionState } from '../actions';

export function LoginForm() {
  const [state, formAction, pending] = useActionState<ActionState | null, FormData>(
    loginAction,
    null,
  );

  return (
    <div className="admin-login">
      <div className="box">
        <div className="brand" style={{ marginBottom: 20 }}>
          <span className="brand-mark" aria-hidden="true">
            🔥
          </span>
          <span className="brand-name">
            ОГОНЬ <span>ДУШИ</span>
          </span>
        </div>
        <h1 style={{ fontSize: '1.5rem' }}>Панель управления</h1>
        <p className="text-secondary" style={{ fontSize: '0.9rem' }}>
          Вход только для сотрудников.
        </p>

        <form action={formAction}>
          <div className="field">
            <label htmlFor="username">Логин</label>
            <input id="username" name="username" className="input" autoComplete="username" required />
          </div>
          <div className="field">
            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              autoComplete="current-password"
              required
            />
          </div>
          {state?.error && (
            <div className="notice notice-error" role="alert">
              {state.error}
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-block mt-8" disabled={pending}>
            {pending ? 'Вход…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}
