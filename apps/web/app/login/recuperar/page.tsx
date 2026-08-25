'use client';

import { useState, type FormEvent } from 'react';

/** Restablece la contraseña con el código de respaldo (sin correo, spec de despliegue). */
export default function RecuperarPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/account/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.get('email'),
          recoveryCode: form.get('recoveryCode'),
          newPassword: form.get('newPassword'),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? 'No se pudo restablecer la contraseña.');
        return;
      }
      setNewCode(data.recoveryCode);
    } finally {
      setBusy(false);
    }
  }

  if (newCode) {
    return (
      <div className="container" style={{ maxWidth: 480 }}>
        <header className="top">
          <h1>Contraseña restablecida</h1>
        </header>
        <section className="card">
          <p className="muted" style={{ marginBottom: 12 }}>
            Tu código de respaldo anterior ya no sirve: aquí está el nuevo. Guárdalo, no se vuelve a
            mostrar.
          </p>
          <p
            className="metric"
            style={{
              fontSize: 24,
              fontWeight: 700,
              textAlign: 'center',
              letterSpacing: 2,
              background: 'var(--gold-soft)',
              border: '1px solid var(--border-strong)',
              borderRadius: 12,
              padding: 16,
              color: 'var(--gold-deep)',
            }}
          >
            {newCode}
          </p>
          <div className="actions">
            <a href="/login">Ir a iniciar sesión</a>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 420 }}>
      <header className="top">
        <h1>Recuperar acceso</h1>
      </header>
      <section className="card">
        <p className="muted" style={{ marginBottom: 12 }}>
          Ingresa tu correo, el código de respaldo que guardaste al crear la cuenta (o la última vez
          que se regeneró) y tu nueva contraseña.
        </p>
        <form className="gen" onSubmit={onSubmit}>
          <label className="field">
            Correo
            <input name="email" type="email" required maxLength={200} />
          </label>
          <label className="field">
            Código de respaldo
            <input name="recoveryCode" required placeholder="XXXX-XXXX-XXXX" maxLength={20} />
          </label>
          <label className="field">
            Nueva contraseña
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                name="newPassword"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                maxLength={200}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="small secondary"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </label>
          <button type="submit" disabled={busy}>
            {busy ? 'Restableciendo…' : 'Restablecer contraseña'}
          </button>
        </form>
        {error && <p className="gate-fail" style={{ marginTop: 12 }}>{error}</p>}
        <p className="muted" style={{ marginTop: 12 }}>
          <a href="/login">Volver a iniciar sesión</a>
        </p>
      </section>
    </div>
  );
}
