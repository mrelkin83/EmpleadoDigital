'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

/** Configuración de usuario del panel: datos, contraseña y código de respaldo. */
export default function CuentaPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ name: string; email: string } | null>(null);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/account/me')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setMe)
      .catch(() => router.push('/login'));
  }, [router]);

  async function onSaveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setProfileMsg(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/account/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.get('name'), email: form.get('email') }),
      });
      const data = await res.json();
      setProfileMsg(res.ok ? 'Guardado ✓' : (data.message ?? 'No se pudo guardar.'));
      if (res.ok) setMe(data);
    } finally {
      setBusy(false);
    }
  }

  async function onChangePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setPasswordMsg(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/account/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: form.get('currentPassword'),
          newPassword: form.get('newPassword'),
        }),
      });
      const data = await res.json();
      setPasswordMsg(res.ok ? 'Contraseña actualizada ✓' : (data.message ?? 'No se pudo cambiar.'));
      if (res.ok) e.currentTarget.reset();
    } finally {
      setBusy(false);
    }
  }

  async function onRegenerateCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setRecoveryError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/account/regenerate-recovery-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: form.get('currentPasswordForCode') }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRecoveryError(data.message ?? 'No se pudo regenerar el código.');
        return;
      }
      setRecoveryCode(data.recoveryCode);
      e.currentTarget.reset();
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    await fetch('/api/account/logout', { method: 'POST' });
    router.push('/login');
  }

  if (!me) {
    return (
      <div className="container">
        <p className="empty">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="top">
        <h1>Cuenta</h1>
        <button className="small danger" onClick={() => void onLogout()}>
          Cerrar sesión
        </button>
      </header>

      <div className="grid">
        <section className="card">
          <h2>Datos de la cuenta</h2>
          <form className="gen" onSubmit={onSaveProfile}>
            <label className="field">
              Nombre
              <input name="name" defaultValue={me.name} required maxLength={120} />
            </label>
            <label className="field">
              Correo
              <input name="email" type="email" defaultValue={me.email} required maxLength={200} />
            </label>
            <button type="submit" disabled={busy}>
              Guardar datos
            </button>
          </form>
          {profileMsg && <p className="muted" style={{ marginTop: 8 }}>{profileMsg}</p>}
        </section>

        <section className="card">
          <h2>Cambiar contraseña</h2>
          <form className="gen" onSubmit={onChangePassword}>
            <label className="field">
              Contraseña actual
              <input name="currentPassword" type="password" required maxLength={200} />
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
              Cambiar contraseña
            </button>
          </form>
          {passwordMsg && <p className="muted" style={{ marginTop: 8 }}>{passwordMsg}</p>}
        </section>

        <section className="card">
          <h2>Código de respaldo</h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            Si perdiste tu código de respaldo (o no lo guardaste), genera uno nuevo aquí. El anterior
            deja de funcionar de inmediato.
          </p>
          {recoveryCode ? (
            <>
              <p
                className="metric"
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  textAlign: 'center',
                  letterSpacing: 2,
                  background: 'var(--gold-soft)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 12,
                  padding: 14,
                  color: 'var(--gold-deep)',
                }}
              >
                {recoveryCode}
              </p>
              <p className="muted" style={{ marginTop: 8 }}>
                Guárdalo ahora: no se volverá a mostrar.
              </p>
              <button className="small secondary" style={{ marginTop: 8 }} onClick={() => setRecoveryCode(null)}>
                Listo
              </button>
            </>
          ) : (
            <form className="gen" onSubmit={onRegenerateCode}>
              <label className="field">
                Confirma tu contraseña
                <input name="currentPasswordForCode" type="password" required maxLength={200} />
              </label>
              <button type="submit" disabled={busy}>
                Generar nuevo código
              </button>
            </form>
          )}
          {recoveryError && <p className="gate-fail" style={{ marginTop: 8 }}>{recoveryError}</p>}
        </section>
      </div>
    </div>
  );
}
