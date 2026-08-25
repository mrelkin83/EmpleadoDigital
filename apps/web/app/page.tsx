'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

/**
 * Dashboard MVP (spec §29): Hoy (bitácora), qué necesita del usuario (aprobaciones),
 * contenido y generación. Vista mínima; crecerá con Rendimiento y Calendario.
 */

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
  body: string;
  cta: string;
  status: string;
  approval: string;
  scheduledAt?: string;
  media?: {
    filename: string;
    mime: string;
    kind: 'image' | 'video' | 'carousel';
    items?: Array<{ filename: string; mime: string }>;
  };
}

const EDITABLE_STATUSES = new Set(['idea', 'draft', 'in_review', 'rejected', 'approved']);

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
  copilot: 'Copiloto: todo pasa por tu aprobación',
  assisted: 'Asistido: apruebas lo que elijas abajo',
  autonomous: 'Autónomo: publica y responde solo (salvo lo marcado)',
};

const STATUS_LABELS: Record<string, string> = {
  idea: 'idea',
  draft: 'borrador',
  in_review: 'en revisión',
  approved: 'aprobada',
  scheduled: 'programada',
  published: 'publicada',
  failed: 'fallida',
  rejected: 'rechazada',
  planned: 'planificada',
  content_ready: 'con borrador',
  skipped: 'omitida',
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

/** Traduce la respuesta de error de la API a texto legible, incluyendo el detalle de validación por campo si viene (invalid_body). */
function describeError(data: { message?: string; error?: string; details?: { fieldErrors?: Record<string, string[]> } }): string {
  const fieldErrors = data.details?.fieldErrors;
  if (fieldErrors) {
    const entries = Object.entries(fieldErrors).filter(([, msgs]) => msgs?.length);
    if (entries.length) {
      return entries.map(([field, msgs]) => `${field}: ${msgs.join(', ')}`).join(' · ');
    }
  }
  return data.message ?? data.error ?? 'error desconocido';
}

export default function Dashboard() {
  const [health, setHealth] = useState<Health | null>(null);
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
  const [expanded, setExpanded] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ hook: string; body: string; cta: string } | null>(null);
  const [gateFails, setGateFails] = useState<Record<string, string[]>>({});
  const [editSlot, setEditSlot] = useState<{ id: string; topic: string; date: string; time: string } | null>(null);
  const [slideIdx, setSlideIdx] = useState<Record<string, number>>({});
  const [newSlot, setNewSlot] = useState<{ date: string; time: string; format: string; funnel: string; pillar: string; topic: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [h, ap, c, cal, an, au, rec] = await Promise.all([
        fetch('/health').then((r) => r.json()),
        fetch('/api/approvals?status=pending').then((r) => r.json()),
        fetch('/api/content').then((r) => r.json()),
        fetch(`/api/calendar?from=${today}`).then((r) => r.json()),
        fetch('/api/analytics').then((r) => r.json()),
        fetch('/api/autonomy').then((r) => r.json()),
        fetch('/api/recommendations').then((r) => r.json()),
      ]);
      setHealth(h);
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
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    setGenerating(true);
    setNotice('Generando borrador…');
    try {
      const res = await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: form.get('topic'),
          pillar: form.get('pillar'),
          funnel: form.get('funnel'),
          format: form.get('format'),
        }),
      });
      const data = await res.json();
      setNotice(res.ok ? 'Borrador generado ✓' : `No se generó: ${describeError(data)}`);
      if (res.ok) formEl.reset();
      await refresh();
    } catch {
      setNotice('Error generando el borrador.');
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

  function toggleExpand(p: Piece) {
    if (expanded === p.id) {
      setExpanded(null);
      setEdit(null);
    } else {
      setExpanded(p.id);
      setEdit({ hook: p.hook, body: p.body, cta: p.cta });
    }
  }

  async function onSaveEdit(pieceId: string) {
    if (!edit) return;
    setBusyPiece(pieceId);
    try {
      const res = await fetch(`/api/content/${pieceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edit),
      });
      const data = await res.json();
      if (res.ok) {
        const failed = (data.qualityGate?.results ?? [])
          .filter((r: { passed: boolean }) => !r.passed)
          .map((r: { check: string; detail?: string }) => r.detail ?? r.check);
        setGateFails((g) => ({ ...g, [pieceId]: failed }));
        setNotice(failed.length ? 'Guardado; revisa los puntos del control de calidad.' : 'Guardado ✓');
      } else {
        setNotice(`No se guardó: ${describeError(data)}`);
      }
      await refresh();
    } finally {
      setBusyPiece(null);
    }
  }

  async function onSubmitReview(pieceId: string) {
    setBusyPiece(pieceId);
    setNotice(null);
    try {
      const res = await fetch(`/api/content/${pieceId}/submit`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setGateFails((g) => ({ ...g, [pieceId]: [] }));
        setNotice('Enviada a revisión: apruébala en "Necesita tu aprobación".');
      } else if (data.error === 'quality_gate_failed') {
        const failed = (data.qualityGate?.results ?? [])
          .filter((r: { passed: boolean }) => !r.passed)
          .map((r: { check: string; detail?: string }) => r.detail ?? r.check);
        setGateFails((g) => ({ ...g, [pieceId]: failed }));
        setNotice('El control de calidad detuvo la pieza; corrige lo señalado.');
      } else {
        setNotice(`No se pudo enviar: ${describeError(data)}`);
      }
      await refresh();
    } finally {
      setBusyPiece(null);
    }
  }

  async function onGenerateCarousel(pieceId: string) {
    setBusyPiece(pieceId);
    setNotice('Generando carrusel (portada IA + láminas)…');
    try {
      const res = await fetch(`/api/content/${pieceId}/media/generate-carousel`, { method: 'POST' });
      const data = await res.json();
      setNotice(
        res.ok
          ? `Carrusel generado: ${data.slides} láminas.`
          : `No se generó: ${describeError(data)}`,
      );
      await refresh();
    } finally {
      setBusyPiece(null);
    }
  }

  async function onGenerateVideoCheap(pieceId: string) {
    setBusyPiece(pieceId);
    setNotice('Generando video económico (voz + clips de stock)…');
    try {
      const res = await fetch(`/api/content/${pieceId}/media/generate-video-cheap`, { method: 'POST' });
      const data = await res.json();
      setNotice(res.ok ? 'Video generado y adjuntado (se publicará como reel).' : `No se generó: ${describeError(data)}`);
      await refresh();
    } catch {
      setNotice('Error generando el video.');
    } finally {
      setBusyPiece(null);
    }
  }

  async function onGenerateVideo(pieceId: string) {
    if (
      !confirm(
        'Generar video con IA (Veo) tarda 1-5 minutos y requiere plan de pago en Google AI Studio (se cobra por segundo de video). ¿Continuar?',
      )
    )
      return;
    setBusyPiece(pieceId);
    setNotice('Generando video con Veo… esto puede tardar varios minutos.');
    try {
      const res = await fetch(`/api/content/${pieceId}/media/generate-video`, { method: 'POST' });
      const data = await res.json();
      setNotice(res.ok ? 'Video generado y adjuntado (se publicará como reel).' : `No se generó: ${describeError(data)}`);
      await refresh();
    } catch {
      setNotice('Error generando el video.');
    } finally {
      setBusyPiece(null);
    }
  }

  async function onSaveSlot(slotId: string, changes: { topic: string; date: string; time: string }) {
    const res = await fetch(`/api/calendar/${slotId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    if (!res.ok) {
      const data = await res.json();
      setNotice(`No se guardó el slot: ${describeError(data)}`);
    }
    setEditSlot(null);
    await refresh();
  }

  async function onDeleteSlot(slotId: string) {
    if (!confirm('¿Eliminar esta publicación del calendario?')) return;
    await fetch(`/api/calendar/${slotId}`, { method: 'DELETE' });
    await refresh();
  }

  async function onDeletePiece(pieceId: string) {
    if (!confirm('¿Eliminar esta pieza y su material? Esta acción no se puede deshacer.')) return;
    const res = await fetch(`/api/content/${pieceId}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      setNotice(`No se eliminó: ${describeError(data)}`);
    } else {
      setNotice('Pieza eliminada.');
    }
    await refresh();
  }

  async function onCreateSlot() {
    if (!newSlot?.date || !newSlot.topic || newSlot.topic.length < 3) {
      setNotice('El nuevo slot necesita fecha y un tema de al menos 3 caracteres.');
      return;
    }
    const res = await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSlot),
    });
    if (res.ok) {
      setNewSlot(null);
    } else {
      const data = await res.json();
      setNotice(`No se creó: ${describeError(data)}`);
    }
    await refresh();
  }

  async function onVariant(pieceId: string) {
    setBusyPiece(pieceId);
    setNotice(null);
    try {
      const res = await fetch(`/api/content/${pieceId}/variant`, { method: 'POST' });
      setNotice(res.ok ? 'Variante creada con otro ángulo.' : 'No se pudo crear la variante.');
      await refresh();
    } finally {
      setBusyPiece(null);
    }
  }

  async function onGenerateImage(pieceId: string, mode?: 'ai' | 'template') {
    setBusyPiece(pieceId);
    setNotice(null);
    try {
      const res = await fetch(`/api/content/${pieceId}/media/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode ? { mode } : {}),
      });
      const data = await res.json();
      setNotice(res.ok ? 'Imagen generada.' : `No se generó: ${describeError(data)}`);
      await refresh();
    } finally {
      setBusyPiece(null);
    }
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
      setNotice(res.ok ? 'Pieza programada.' : `No se programó: ${describeError(data)}`);
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
    let reason: string | undefined;
    if (action === 'reject') {
      reason = prompt('¿Por qué la rechazas? (opcional — el empleado aprende de esto)') || undefined;
    }
    await fetch(`/api/approvals/${id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reason ? { reason } : {}),
    });
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
          : `No se pudo subir: ${describeError(data)}`,
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
      if (res.status === 202) {
        setNotice('Publicando en Instagram (los carruseles tardan varios minutos); el estado cambiará solo.');
      } else if (res.status === 422 && data.error === 'quality_gate_failed') {
        const failed = (data.qualityGate?.results ?? [])
          .filter((r: { passed: boolean }) => !r.passed)
          .map((r: { check: string; detail?: string }) => r.detail ?? r.check);
        setGateFails((g) => ({ ...g, [pieceId]: failed }));
        setNotice('El control de calidad detuvo la publicación; corrige lo señalado.');
      } else {
        setNotice(`No se publicó: ${describeError(data)}`);
      }
      await refresh();
    } catch {
      setNotice('Error de conexión al pedir la publicación.');
    } finally {
      setBusyPiece(null);
    }
  }

  return (
    <div className="container">
      <header className="top">
        <h1>
          Empleado Digital · Marketing
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
        <div className="col">
        
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
            <input
              name="topic"
              placeholder="Tema breve (ej. errores al importar desde China) — no pegues el post completo"
              required
              minLength={3}
              maxLength={200}
              title="Un tema corto para que la IA redacte el contenido; no el texto completo del post"
            />
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
        </div>

        <div className="col col-main">
        
<section className="card">
          <h2>Contenido</h2>
          {notice && <p className="notice">{notice}</p>}
          {content.length === 0 && <p className="empty">Aún no hay piezas. Genera la primera.</p>}
          <ul className="plain">
            {content.slice(0, 10).map((p) => (
              <li key={p.id}>
                <div className="piece-row">
                  {(p.media?.kind === 'image' || p.media?.kind === 'carousel') && (
                    <img className="thumb" src={`/media/${p.media.filename}`} alt="" />
                  )}
                  {p.media?.kind === 'video' && (
                    <video
                      className="thumb"
                      src={`/media/${p.media.filename}`}
                      muted
                      playsInline
                      preload="metadata"
                    />
                  )}
                  <div className="piece-main">
                    <span className={`badge ${p.status}`}>{STATUS_LABELS[p.status] ?? p.status}</span>
                    <button className="piece-title" onClick={() => toggleExpand(p)}>
                      {expanded === p.id ? '▾' : '▸'} {p.hook || p.topic}
                      <span className="muted" style={{ fontWeight: 400 }}>
                        {' '}
                        · {expanded === p.id ? 'cerrar' : 'ver / editar'}
                      </span>
                    </button>
                    <div className="muted">
                      {p.format} · {p.pillar} · {p.funnel}
                      {p.media?.kind === 'video' && <> · video adjunto (se publica como reel)</>}
                      {p.media?.kind === 'carousel' && (
                        <> · carrusel de {p.media.items?.length ?? 0} láminas</>
                      )}
                      {p.status === 'scheduled' && p.scheduledAt && (
                        <> · sale el {new Date(p.scheduledAt).toLocaleString('es-CO')}</>
                      )}
                    </div>

                    {expanded === p.id && p.media && (
                      <div className="media-preview">
                        {p.media.kind === 'video' ? (
                          <video src={`/media/${p.media.filename}`} controls playsInline />
                        ) : p.media.kind === 'carousel' ? (
                          (() => {
                            const items = p.media.items ?? [];
                            const idx = Math.min(slideIdx[p.id] ?? 0, items.length - 1);
                            const go = (d: number) =>
                              setSlideIdx((s) => ({
                                ...s,
                                [p.id]: (idx + d + items.length) % items.length,
                              }));
                            return (
                              <div className="carousel-viewer">
                                <div className="carousel-main">
                                  <button className="small secondary" aria-label="Lámina anterior" onClick={() => go(-1)}>
                                    ‹
                                  </button>
                                  <img src={`/media/${items[idx]?.filename}`} alt={`Lámina ${idx + 1}`} />
                                  <button className="small secondary" aria-label="Lámina siguiente" onClick={() => go(1)}>
                                    ›
                                  </button>
                                </div>
                                <p className="muted" style={{ textAlign: 'center' }}>
                                  {idx + 1} / {items.length}
                                </p>
                                <div className="carousel-strip">
                                  {items.map((it, i) => (
                                    <img
                                      key={it.filename}
                                      src={`/media/${it.filename}`}
                                      alt={`Lámina ${i + 1}`}
                                      className={i === idx ? 'active' : ''}
                                      onClick={() => setSlideIdx((s) => ({ ...s, [p.id]: i }))}
                                    />
                                  ))}
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <img src={`/media/${p.media.filename}`} alt="Material de la pieza" />
                        )}
                      </div>
                    )}

                    {expanded === p.id && edit && (
                      <div className="detail">
                        {EDITABLE_STATUSES.has(p.status) ? (
                          <>
                            <label className="field">
                              Hook
                              <textarea
                                rows={2}
                                value={edit.hook}
                                onChange={(e) => setEdit({ ...edit, hook: e.target.value })}
                              />
                            </label>
                            <label className="field">
                              Cuerpo
                              <textarea
                                rows={8}
                                value={edit.body}
                                onChange={(e) => setEdit({ ...edit, body: e.target.value })}
                              />
                            </label>
                            <label className="field">
                              Llamado a la acción
                              <textarea
                                rows={2}
                                value={edit.cta}
                                onChange={(e) => setEdit({ ...edit, cta: e.target.value })}
                              />
                            </label>
                            <div className="actions">
                              <button
                                className="small"
                                disabled={busyPiece === p.id}
                                onClick={() => void onSaveEdit(p.id)}
                              >
                                Guardar cambios
                              </button>
                              <span
                                className="muted metric"
                                style={
                                  [edit.hook, edit.body, edit.cta].filter(Boolean).join('\n\n')
                                    .length > 2200
                                    ? { color: 'var(--danger)' }
                                    : undefined
                                }
                              >
                                {[edit.hook, edit.body, edit.cta].filter(Boolean).join('\n\n').length}
                                {' / 2200 caracteres del caption'}
                              </span>
                            </div>
                          </>
                        ) : (
                          <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>
                            {[p.hook, p.body, p.cta].filter(Boolean).join('\n\n')}
                          </p>
                        )}
                      </div>
                    )}

                    {(gateFails[p.id]?.length ?? 0) > 0 && (
                      <div className="gate-fail" style={{ marginTop: 8 }}>
                        Control de calidad: {gateFails[p.id]!.join(' · ')}
                      </div>
                    )}

                    {p.status === 'scheduled' && (
                      <div className="actions">
                        <button
                          className="small danger"
                          disabled={busyPiece === p.id}
                          onClick={() => void onUnschedule(p.id)}
                        >
                          Cancelar programación
                        </button>
                      </div>
                    )}
                    {p.status !== 'published' && p.status !== 'scheduled' && (
                      <div className="actions">
                        {(p.status === 'draft' || p.status === 'rejected') && (
                          <button
                            className="small"
                            disabled={busyPiece === p.id}
                            onClick={() => void onSubmitReview(p.id)}
                          >
                            Enviar a revisión
                          </button>
                        )}
                        <button
                          className="small secondary"
                          disabled={busyPiece === p.id}
                          onClick={() => void onGenerateImage(p.id)}
                        >
                          {busyPiece === p.id ? 'Generando…' : p.media ? 'Regenerar imagen IA' : 'Imagen IA'}
                        </button>
                        <button
                          className="small secondary"
                          disabled={busyPiece === p.id}
                          onClick={() => void onGenerateImage(p.id, 'template')}
                        >
                          Plantilla
                        </button>
                        {p.format === 'carousel' && (
                          <button
                            className="small secondary"
                            disabled={busyPiece === p.id}
                            onClick={() => void onGenerateCarousel(p.id)}
                          >
                            Carrusel IA
                          </button>
                        )}
                        {p.format === 'reel' && (
                          <>
                            <button
                              className="small secondary"
                              disabled={busyPiece === p.id}
                              onClick={() => void onGenerateVideoCheap(p.id)}
                            >
                              Video económico
                            </button>
                            <button
                              className="small secondary"
                              disabled={busyPiece === p.id}
                              onClick={() => void onGenerateVideo(p.id)}
                            >
                              Video IA (Veo)
                            </button>
                          </>
                        )}
                        {(p.status === 'draft' || p.status === 'rejected') && (
                          <button
                            className="small secondary"
                            disabled={busyPiece === p.id}
                            onClick={() => void onVariant(p.id)}
                          >
                            Variante
                          </button>
                        )}
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
                        {p.status === 'approved' && p.media && (
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
                        {p.status === 'in_review' && (
                          <span className="muted">En revisión: apruébala arriba en &quot;Necesita tu aprobación&quot;.</span>
                        )}
                        <button
                          className="small danger"
                          disabled={busyPiece === p.id}
                          onClick={() => void onDeletePiece(p.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
        </div>

        <div className="col">
        
<section className="card">
          <h2>Próximamente · Calendario</h2>
          {calendar.length === 0 && (
            <p className="empty">Sin publicaciones planificadas para los próximos días.</p>
          )}
          <ul className="plain">
            {calendar.filter((s) => s.status !== 'skipped').slice(0, 8).map((s) => (
              <li key={s.id}>
                <span className={`badge ${s.status === 'planned' ? 'draft' : s.status}`}>{s.funnel}</span>
                {editSlot?.id === s.id ? (
                  <div className="detail">
                    <textarea
                      rows={3}
                      maxLength={200}
                      value={editSlot.topic}
                      onChange={(e) => setEditSlot({ ...editSlot, topic: e.target.value })}
                    />
                    <div className="actions">
                      <input
                        type="date"
                        value={editSlot.date}
                        onChange={(e) => setEditSlot({ ...editSlot, date: e.target.value })}
                      />
                      <input
                        type="time"
                        value={editSlot.time}
                        onChange={(e) => setEditSlot({ ...editSlot, time: e.target.value })}
                      />
                      <button
                        className="small"
                        onClick={() =>
                          void onSaveSlot(s.id, {
                            topic: editSlot.topic,
                            date: editSlot.date,
                            time: editSlot.time,
                          })
                        }
                      >
                        Guardar
                      </button>
                      <button className="small secondary" onClick={() => setEditSlot(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <strong style={{ overflowWrap: 'anywhere' }}>{s.topic}</strong>
                    <div className="muted">
                      {s.date} {s.time} · {s.format} · {s.pillar}
                    </div>
                    <div className="actions">
                      <button
                        className="small secondary"
                        onClick={() =>
                          setEditSlot({ id: s.id, topic: s.topic, date: s.date, time: s.time })
                        }
                      >
                        Editar
                      </button>
                      <button className="small danger" onClick={() => void onDeleteSlot(s.id)}>
                        Eliminar
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
          {newSlot ? (
            <div className="detail">
              <textarea
                rows={2}
                maxLength={200}
                placeholder="Tema de la publicación"
                value={newSlot.topic}
                onChange={(e) => setNewSlot({ ...newSlot, topic: e.target.value })}
              />
              <div className="actions">
                <input
                  type="date"
                  value={newSlot.date}
                  onChange={(e) => setNewSlot({ ...newSlot, date: e.target.value })}
                />
                <input
                  type="time"
                  value={newSlot.time}
                  onChange={(e) => setNewSlot({ ...newSlot, time: e.target.value })}
                />
                <select
                  value={newSlot.format}
                  onChange={(e) => setNewSlot({ ...newSlot, format: e.target.value })}
                >
                  <option value="image">Imagen</option>
                  <option value="carousel">Carrusel</option>
                  <option value="reel">Reel</option>
                  <option value="story">Historia</option>
                </select>
                <select
                  value={newSlot.funnel}
                  onChange={(e) => setNewSlot({ ...newSlot, funnel: e.target.value })}
                >
                  <option value="TOFU">TOFU</option>
                  <option value="MOFU">MOFU</option>
                  <option value="BOFU">BOFU</option>
                </select>
                <button className="small" onClick={() => void onCreateSlot()}>
                  Añadir
                </button>
                <button className="small secondary" onClick={() => setNewSlot(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}
          <div className="actions">
            <button className="small" onClick={onPlanWeek} disabled={planning}>
              {planning ? 'Planificando…' : 'Planificar próxima semana'}
            </button>
            {!newSlot && (
              <button
                className="small secondary"
                onClick={() =>
                  setNewSlot({
                    date: new Date().toISOString().slice(0, 10),
                    time: '11:00',
                    format: 'image',
                    funnel: 'TOFU',
                    pillar: 'Educación',
                    topic: '',
                  })
                }
              >
                Añadir publicación
              </button>
            )}
          </div>
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
                </div>
      
      </div>
    </div>
  );
}
