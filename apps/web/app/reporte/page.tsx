'use client';

import { useEffect, useState } from 'react';

/**
 * Reporte semanal imprimible para el cliente (D24): qué se publicó, cómo
 * rindió, leads captados y qué viene. Datos reales del API, nada inventado.
 */
interface ReportPost {
  pieceId: string;
  hook: string;
  topic: string;
  format: string;
  pillar: string;
  permalink?: string;
  metrics: Record<string, number>;
}

interface Report {
  generatedAt: string;
  since: string;
  published: ReportPost[];
  totals: Record<string, number>;
  newLeads: number;
  pendingApprovals: number;
  upcomingSlots: Array<{
    date: string;
    time: string;
    format: string;
    pillar: string;
    funnel: string;
    topic: string;
    status: string;
  }>;
  recommendations: Array<{ id: string; priority: string; title: string; detail: string }>;
}

const METRIC_LABELS: Record<string, string> = {
  reach: 'Alcance',
  likes: 'Me gusta',
  comments: 'Comentarios',
  saved: 'Guardados',
  shares: 'Compartidos',
  total_interactions: 'Interacciones',
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

export default function WeeklyReportPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/report/weekly')
      .then((r) => r.json())
      .then(setReport)
      .catch(() => setError('No se pudo cargar el reporte (¿API corriendo?)'));
  }, []);

  if (!report) {
    return (
      <div className="container">
        <p className="empty">{error ?? 'Generando reporte…'}</p>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="top">
        <h1>Reporte semanal</h1>
        <span>
          <button className="small" onClick={() => window.print()}>
            Imprimir / PDF
          </button>{' '}
          <a href="/">← Volver al dashboard</a>
        </span>
      </header>

      <p className="muted">
        Semana del {fmtDate(report.since)} al {fmtDate(report.generatedAt)}.
      </p>

      <section className="card">
        <h2>Publicaciones de la semana ({report.published.length})</h2>
        {report.published.length === 0 && (
          <p className="empty">No hubo publicaciones esta semana.</p>
        )}
        <ul className="plain">
          {report.published.map((p) => (
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
                {p.format} · {p.pillar}
                {Object.entries(p.metrics).length > 0 && (
                  <>
                    {' · '}
                    {Object.entries(p.metrics)
                      .map(([k, v]) => `${METRIC_LABELS[k] ?? k}: ${v}`)
                      .join(' · ')}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
        {Object.keys(report.totals).length > 0 && (
          <p className="muted">
            <strong>Totales:</strong>{' '}
            {Object.entries(report.totals)
              .map(([k, v]) => `${METRIC_LABELS[k] ?? k}: ${v}`)
              .join(' · ')}
          </p>
        )}
      </section>

      <section className="card">
        <h2>Gestión</h2>
        <p>
          Nuevos interesados registrados: <strong>{report.newLeads}</strong> · Aprobaciones
          pendientes de tu revisión: <strong>{report.pendingApprovals}</strong>
        </p>
      </section>

      <section className="card">
        <h2>Próximas publicaciones planificadas ({report.upcomingSlots.length})</h2>
        {report.upcomingSlots.length === 0 && <p className="empty">Sin plan hacia adelante.</p>}
        <ul className="plain">
          {report.upcomingSlots.map((s, i) => (
            <li key={i}>
              <strong>
                {s.date} {s.time}
              </strong>{' '}
              — {s.topic}
              <div className="muted">
                {s.format} · {s.pillar} · {s.funnel} · {s.status}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Recomendaciones</h2>
        {report.recommendations.length === 0 && (
          <p className="empty">Sin recomendaciones: todo marcha según el plan.</p>
        )}
        <ul className="plain">
          {report.recommendations.map((r) => (
            <li key={r.id}>
              <strong>{r.title}</strong>
              <div className="muted">{r.detail}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
