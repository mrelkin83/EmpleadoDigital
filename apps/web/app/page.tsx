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
  scheduledAt?: string;
  media?: { filename: string; mime: string; kind: 'image' | 'video' };
}

interface Health {
  status: string;
  instagramConnected: boolean;
}

interface PostAnalytics {
  pieceId: string;
  hook: string;
  topic: string;
  format: string;
  pillar: string;
  permalink?: string;
  metrics: Record<string, number>;
}

interface Analytics {
  connected: boolean;
  posts: PostAnalytics[];
  totals: Record<string, number>;
}

interface Recommendation {
  id: string;
  priority: 'alta' | 'media' | 'baja';
  title: string;
  detail: string;
}

interface Autonomy {
  mode: 'copilot' | 'assisted' | 'autonomous';
  requireApproval: Record<string, boolean>;
}

const MODE_LABELS: Record<Autonomy['mode'], string> = {
  copilot: 'Copiloto — todo pasa por tu aprobación',
  assisted: 'Asistido — apruebas lo que elijas abajo',
  autonomous: 'Autónomo — publica y responde solo (salvo lo marcado)',
};

/** Acciones configurables de la matriz; el resto es 'never'/'always' y no se toca. */
const CONFIGURABLE_ACTIONS: Array<{ key: string; label: string }> = [
  { key: 'publish_content', label: 'Publicar contenido' },
  { key: 'reply_comment', label: 'Responder comentarios' },
  { key: 'reply_dm', label: 'Responder mensajes (DM)' },
];

const METRIC_LABELS: Record<string, string> = {
  reach: 'Alcance',
  likes: 'Me gusta',
  comments: 'Comentarios',
  saved: 'Guardados',
  shares: 'Compartidos',
  total_interactions: 'Interacciones',
};

interface Slot {
  id: string;
  date: string;
  time: string;
  format: string;
  pillar: string;
  funnel: string;
  topic: string;
  status: string;
}

export default function Dashboard() {
  const [health, setHealth] = useState<Health | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [content, setContent] = useState<Piece[]>([]);
  const [calendar, setCalendar] = useState<Slot[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [autonomy, setAutonomy] = useState<Autonomy | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [planning, setPlanning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [busyPiece, setBusyPiece] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [h, a, ap, c, cal, an, au, rec] = await Promise.all([
        fetch('/health').then((r) => r.json()),
        fetch('/api/activity').then((r) => r.json()),
        fetch('/api/approvals?status=pending').then((r) => r.json()),
        fetch('/api/content').then((r) => r.json()),
        fetch(`/api/calendar?from=${today}`).then((r) => r.json()),
        fetch('/api/analytics').then((r) => r.json()),
        fetch('/api/autonomy').then((r) => r.json()),
        fetch('/api/recommendations').then((r) => r.json()),
      ]);
      setHealth(h);
      setActivity(a);
      setApprovals(ap);
      setContent(c);
      setCalendar(cal.slots ?? []);
      setAnalytics(an);
      setAutonomy(au);
      setRecommendations(rec.recommendations ?? []);
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

  async function onPlanWeek() {
    setPlanning(true);
    try {
      await fetch('/api/calendar/plan-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      await refresh();
    } finally {
      setPlanning(false);
    }
  }

  async function updateAutonomy(next: Autonomy) {
    setAutonomy(next);
    await fetch('/api/autonomy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    await refresh();
  }

  async function onSchedule(pieceId: string) {
    const value = scheduleAt[pieceId];
    if (!value) {
      setNotice('Elige fecha y hora antes de programar.');
      return;
    }
    setBusyPiece(pieceId);
    try {
      const res = await fetch(`/api/content/${pieceId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: new Date(value).toISOString() }),
      });
      const data = await res.json();
      setNotice(res.ok ? 'Pieza programada.' : `No se programó: ${data.message ?? data.error}`);
      await refresh();
    } finally {
      setBusyPiece(null);
    }
  }

  async function onUnschedule(pieceId: string) {
    setBusyPiece(pieceId);
    try {
      await fetch(`/api/content/${pieceId}/unschedule`, { method: 'POST' });
      setNotice('Programación cancelada.');
      await refresh();
    } finally {
      setBusyPiece(null);
    }
  }

  async function resolveApproval(id: string, action: 'approve' | 'reject') {
    await fetch(`/api/approvals/${id}/${action}`, { method: 'POST' });
    await refresh();
  }

  async function onUploadMedia(pieceId: string, file: File | undefined) {
    if (!file) return;
    setBusyPiece(pieceId);
    setNotice(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/content/${pieceId}/media`, { method: 'POST', body: form });
      const data = await res.json();
      setNotice(
        res.ok
          ? `Material subido (${file.name}).`
          : `No se pudo subir: ${data.message ?? data.error}`,
      );
      await refresh();
    } catch {
      setNotice('Error subiendo el material.');
    } finally {
      setBusyPiece(null);
    }
  }

  async function onPublish(pieceId: string) {
    if (!confirm('Esto publica la pieza en la cuenta REAL de Instagram. ¿Continuar?')) return;
    setBusyPiece(pieceId);
    setNotice(null);
    try {
      const res = await fetch(`/api/content/${pieceId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ humanApproved: true }),
      });
      const data = await res.json();
      setNotice(res.ok ? '¡Publicado en Instagram!' : `No se publicó: ${data.message ?? data.error}`);
      await refresh();
    } catch {
      setNotice('Error publicando la pieza.');
    } finally {
      setBusyPiece(null);
    }
  }

  return (
    <div className="container">
      <header className="top">
        <h1>
          Empleado Digital · Marketing <a href="/marca" style={{ fontSize: '0.8rem' }}>Configurar marca</a>
        </h1>
        <span className="status">
          <span className={`dot ${health?.instagramConnected ? 'ok' : 'off'}`} />
          {health
            ? health.instagramConnected
              ? 'Instagram conectado'
              : 'Instagram sin conectar'
            : 'Conectando...'}
          {health && (
            <>
              {' · '}
              <a href="/auth/instagram/login">
                {health.instagramConnected ? 'Reconectar' : 'Conectar Instagram'}
              </a>
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
          {notice && <p className="muted" style={{ marginBottom: 8 }}>{notice}</p>}
          {content.length === 0 && <p className="empty">Aún no hay piezas. Genera la primera.</p>}
          <ul className="plain">
            {content.slice(0, 8).map((p) => (
              <li key={p.id}>
                <span className={`badge ${p.status}`}>{p.status}</span>
                <strong>{p.hook || p.topic}</strong>
                <div className="muted">
                  {p.format} · {p.pillar} · {p.funnel}
                  {p.media && <> · 📎 {p.media.kind === 'image' ? 'imagen' : 'video'} adjunto</>}
                  {p.status === 'scheduled' && p.scheduledAt && (
                    <> · ⏰ programada: {new Date(p.scheduledAt).toLocaleString('es-CO')}</>
                  )}
                </div>
                {p.status === 'scheduled' && (
                  <div className="actions">
                    <button
                      className="small secondary"
                      disabled={busyPiece === p.id}
                      onClick={() => void onUnschedule(p.id)}
                    >
                      Cancelar programación
                    </button>
                  </div>
                )}
                {p.status !== 'published' && p.status !== 'scheduled' && (
                  <div className="actions">
                    <label className="small secondary" style={{ cursor: 'pointer' }}>
                      {busyPiece === p.id ? 'Procesando…' : p.media ? 'Cambiar material' : 'Subir material'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,video/mp4"
                        style={{ display: 'none' }}
                        disabled={busyPiece === p.id}
                        onChange={(e) => {
                          void onUploadMedia(p.id, e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {p.status === 'approved' && p.media?.kind === 'image' && (
                      <>
                        <button
                          className="small"
                          disabled={busyPiece === p.id}
                          onClick={() => void onPublish(p.id)}
                        >
                          Publicar ya
                        </button>
                        <input
                          type="datetime-local"
                          value={scheduleAt[p.id] ?? ''}
                          onChange={(e) =>
                            setScheduleAt((s) => ({ ...s, [p.id]: e.target.value }))
                          }
                        />
                        <button
                          className="small"
                          disabled={busyPiece === p.id || !scheduleAt[p.id]}
                          onClick={() => void onSchedule(p.id)}
                        >
                          Programar
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>Próximamente · Calendario</h2>
          {calendar.length === 0 && (
            <p className="empty">Sin publicaciones planificadas para los próximos días.</p>
          )}
          <ul className="plain">
            {calendar.slice(0, 7).map((s) => (
              <li key={s.id}>
                <span className={`badge ${s.status === 'planned' ? 'draft' : s.status}`}>{s.funnel}</span>
                <strong>{s.topic}</strong>
                <div className="muted">
                  {s.date} {s.time} · {s.format} · {s.pillar}
                </div>
              </li>
            ))}
          </ul>
          <div className="actions">
            <button className="small" onClick={onPlanWeek} disabled={planning}>
              {planning ? 'Planificando…' : 'Planificar próxima semana'}
            </button>
          </div>
        </section>

        <section className="card">
          <h2>Recomendaciones del analista</h2>
          {recommendations.length === 0 && (
            <p className="empty">Sin recomendaciones: todo marcha según el plan.</p>
          )}
          <ul className="plain">
            {recommendations.map((r) => (
              <li key={r.id}>
                <span className={`badge ${r.priority === 'alta' ? 'rejected' : r.priority === 'media' ? 'pending' : 'draft'}`}>
                  {r.priority}
                </span>
                <strong>{r.title}</strong>
                <div className="muted">{r.detail}</div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>Autonomía del empleado</h2>
          {!autonomy && <p className="empty">Cargando…</p>}
          {autonomy && (
            <>
              <select
                value={autonomy.mode}
                onChange={(e) =>
                  void updateAutonomy({ ...autonomy, mode: e.target.value as Autonomy['mode'] })
                }
              >
                {(Object.keys(MODE_LABELS) as Autonomy['mode'][]).map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABELS[m]}
                  </option>
                ))}
              </select>
              <ul className="plain" style={{ marginTop: 8 }}>
                {CONFIGURABLE_ACTIONS.map(({ key, label }) => (
                  <li key={key}>
                    <label style={{ cursor: autonomy.mode === 'copilot' ? 'default' : 'pointer' }}>
                      <input
                        type="checkbox"
                        disabled={autonomy.mode === 'copilot'}
                        checked={
                          autonomy.mode === 'copilot' || (autonomy.requireApproval[key] ?? true)
                        }
                        onChange={(e) =>
                          void updateAutonomy({
                            ...autonomy,
                            requireApproval: {
                              ...autonomy.requireApproval,
                              [key]: e.target.checked,
                            },
                          })
                        }
                      />{' '}
                      {label}: requiere mi aprobación
                    </label>
                  </li>
                ))}
              </ul>
              <p className="muted">
                Campañas pagadas, cambios de estrategia y de presupuesto siempre requieren
                aprobación humana (no configurable).
              </p>
            </>
          )}
        </section>

        <section className="card">
          <h2>Rendimiento</h2>
          {!analytics?.connected && <p className="empty">Conecta Instagram para ver métricas.</p>}
          {analytics?.connected && analytics.posts.length === 0 && (
            <p className="empty">Aún no hay publicaciones con métricas.</p>
          )}
          <ul className="plain">
            {analytics?.posts.map((p) => (
              <li key={p.pieceId}>
                <strong>
                  {p.permalink ? (
                    <a href={p.permalink} target="_blank" rel="noreferrer">
                      {p.hook || p.topic}
                    </a>
                  ) : (
                    p.hook || p.topic
                  )}
                </strong>
                <div className="muted">
                  {Object.entries(p.metrics).length === 0
                    ? 'Métricas aún no disponibles'
                    : Object.entries(p.metrics)
                        .map(([k, v]) => `${METRIC_LABELS[k] ?? k}: ${v}`)
                        .join(' · ')}
                </div>
              </li>
            ))}
          </ul>
          {analytics && Object.keys(analytics.totals).length > 0 && (
            <p className="muted">
              <strong>Total:</strong>{' '}
              {Object.entries(analytics.totals)
                .map(([k, v]) => `${METRIC_LABELS[k] ?? k}: ${v}`)
                .join(' · ')}
            </p>
          )}
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
