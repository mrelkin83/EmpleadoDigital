'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Login del panel. Primera visita (sin cuenta creada): formulario de alta con
 * el código de respaldo mostrado UNA sola vez. Visitas siguientes: login con
 * correo/contraseña, con enlace a recuperación por código de respaldo.
 */
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [checking, setChecking] = useState(true);
  const [hasAccount, setHasAccount] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [savedCode, setSavedCode] = useState(false);

  useEffect(() => {
    fetch('/api/account/status')
      .then((r) => r.json())
      .then((d) => setHasAccount(Boolean(d.hasAccount)))
      .catch(() => setError('No se pudo conectar con la API.'))
      .finally(() => setChecking(false));
  }, []);

  async function onSetup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/account/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          email: form.get('email'),
          password: form.get('password'),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? 'No se pudo crear la cuenta.');
        return;
      }
      setRecoveryCode(data.recoveryCode);
    } finally {
      setBusy(false);
    }
  }

  async function onLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/account/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.message ?? 'No se pudo iniciar sesión.');
        return;
      }
      router.push(params.get('from') || '/');
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <div className="container" style={{ maxWidth: 420 }}>
        <p className="empty">Cargando…</p>
      </div>
    );
  }

  // Cuenta recién creada: mostrar el código de respaldo una única vez.
  if (recoveryCode) {
    return (
      <div className="container" style={{ maxWidth: 480 }}>
        <header className="top">
          <h1>Guarda tu código de respaldo</h1>
        </header>
        <section className="card">
          <p className="muted" style={{ marginBottom: 12 }}>
            Este código es la única forma de recuperar tu cuenta si olvidas la contraseña. No se
            muestra de nuevo: guárdalo en un lugar seguro (gestor de contraseñas, papel) antes de
            continuar.
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
              padding: '16px',
              color: 'var(--gold-deep)',
            }}
          >
            {recoveryCode}
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, fontSize: 13 }}>
            <input type="checkbox" checked={savedCode} onChange={(e) => setSavedCode(e.target.checked)} />
            Ya guardé mi código de respaldo en un lugar seguro
          </label>
          <div className="actions">
            <button disabled={!savedCode} onClick={() => router.push('/')}>
              Continuar al panel
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 420 }}>
      <header className="top">
        <h1>{hasAccount ? 'Iniciar sesión' : 'Crear cuenta'}</h1>
      </header>
      <section className="card">
        {!hasAccount && (
          <p className="muted" style={{ marginBottom: 12 }}>
            Primera vez aquí: crea la cuenta del panel. Al terminar verás un código de respaldo
            único para recuperar el acceso si olvidas la contraseña.
          </p>
        )}
        <form className="gen" onSubmit={hasAccount ? onLogin : onSetup}>
          {!hasAccount && (
            <label className="field">
              Nombre
              <input name="name" required maxLength={120} />
            </label>
          )}
          <label className="field">
            Correo
            <input name="email" type="email" required maxLength={200} />
          </label>
          <label className="field">
            Contraseña
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                name="password"
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
            {busy ? 'Procesando…' : hasAccount ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>
        {hasAccount && (
          <p className="muted" style={{ marginTop: 12 }}>
            <a href="/login/recuperar">¿Olvidaste tu contraseña?</a>
          </p>
        )}
        {error && <p className="gate-fail" style={{ marginTop: 12 }}>{error}</p>}
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
