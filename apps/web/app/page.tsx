'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

/**
 * Dashboard MVP (spec §29): Hoy (bitácora), qué necesita del usuario (aprobaciones),
 * contenido y generación. Vista mínima; crecerá con Rendimiento y Calendario.
 */

interface Activity {
  id: string;
  at: string;
  actor: string;
  summary: string;
  kind: string;
}

interface Approval {
  id: string;
  kind: string;
  summary: string;
  status: string;
  createdAt: string;
}

interface Piece {
  id: string;
  format: string;
  pillar: string;
  funnel: string;
  topic: string;
  hook: string;
  status: string;
  approval: string;
}

interface Health {
  status: string;
  instagramConnected: boolean;
}

export default function Dashboard() {
  const [health, setHealth] = useState<Health | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [content, setContent] = useState<Piece[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [h, a, ap, c] = await Promise.all([
        fetch('/health').then((r) => r.json()),
        fetch('/api/activity').then((r) => r.json()),
        fetch('/api/approvals?status=pending').then((r) => r.json()),
        fetch('/api/content').then((r) => r.json()),
      ]);
      setHealth(h);
      setActivity(a);
      setApprovals(ap);
      setContent(c);
      setError(null);
    } catch {
      setError('No se pudo conectar con la API (npm run dev:api)');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 10000);
    return () => clearInterval(t);
  }, [refresh]);

  async function onGenerate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setGenerating(true);
    try {
      await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: form.get('topic'),
          pillar: form.get('pillar'),
          funnel: form.get('funnel'),
          format: form.get('format'),
        }),
      });
      await refresh();
    } finally {
      setGenerating(false);
    }
  }

  async function resolveApproval(id: string, action: 'approve' | 'reject') {
    await fetch(`/api/approvals/${id}/${action}`, { method: 'POST' });
    await refresh();
  }

  return (
    <div className="container">
      <header className="top">
        <h1>Empleado Digital · Marketing</h1>
        <span className="status">
          <span className={`dot ${health?.instagramConnected ? 'ok' : 'off'}`} />
          {health
            ? health.instagramConnected
              ? 'Instagram conectado'
              : 'Instagram sin conectar'
            : 'Conectando...'}
          {health && !health.instagramConnected && (
            <>
              {' · '}
              <a href="/auth/instagram/login">Conectar Instagram</a>
            </>
          )}
        </span>
      </header>

      {error && <div className="card" style={{ marginBottom: 16, color: 'var(--danger)' }}>{error}</div>}

      <div className="grid">
        <section className="card">
          <h2>Necesita tu aprobación ({approvals.length})</h2>
          {approvals.length === 0 && <p className="empty">Nada pendiente. Todo al día.</p>}
          <ul className="plain">
            {approvals.map((a) => (
              <li key={a.id}>
                <span className="badge pending">{a.kind}</span>
                {a.summary}
                <div className="actions">
                  <button className="small" onClick={() => resolveApproval(a.id, 'approve')}>
                    Aprobar
                  </button>
                  <button className="small secondary" onClick={() => resolveApproval(a.id, 'reject')}>
                    Rechazar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>Crear contenido</h2>
          <form className="gen" onSubmit={onGenerate}>
            <input name="topic" placeholder="Tema (ej. errores al importar desde China)" required minLength={3} />
            <select name="pillar" defaultValue="Educación">
              {['Educación', 'Prevención', 'Errores frecuentes', 'Casos', 'Actualidad', 'Preguntas frecuentes', 'Mitos', 'Consejos prácticos', 'Autoridad profesional', 'Conversión'].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <select name="funnel" defaultValue="TOFU">
              <option value="TOFU">TOFU · Descubrimiento</option>
              <option value="MOFU">MOFU · Confianza</option>
              <option value="BOFU">BOFU · Conversión</option>
            </select>
            <select name="format" defaultValue="carousel">
              <option value="carousel">Carrusel</option>
              <option value="reel">Reel (guion)</option>
              <option value="image">Imagen</option>
              <option value="story">Historia</option>
              <option value="text">Texto</option>
            </select>
            <button type="submit" disabled={generating}>
              {generating ? 'Generando…' : 'Generar borrador'}
            </button>
          </form>
        </section>

        <section className="card">
          <h2>Contenido</h2>
          {content.length === 0 && <p className="empty">Aún no hay piezas. Genera la primera.</p>}
          <ul className="plain">
            {content.slice(0, 8).map((p) => (
              <li key={p.id}>
                <span className={`badge ${p.status}`}>{p.status}</span>
                <strong>{p.hook || p.topic}</strong>
                <div className="muted">
                  {p.format} · {p.pillar} · {p.funnel}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>Bitácora del empleado</h2>
          {activity.length === 0 && <p className="empty">Sin actividad todavía.</p>}
          <ul className="plain">
            {activity.slice(0, 10).map((a) => (
              <li key={a.id}>
                {a.summary}
                <div className="muted">
                  {new Date(a.at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} · {a.actor}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
