'use client';

import { useEffect, useState } from 'react';

/**
 * Bitácora del empleado (spec §39): registro completo de acciones, decisiones
 * y alertas, con su explicación cuando existe.
 */
interface Activity {
  id: string;
  at: string;
  actor: string;
  summary: string;
  kind: string;
  explanation?: { objective?: string; evidence?: string; decision?: string; expectedResult?: string };
}

const KIND_LABELS: Record<string, string> = {
  info: 'info',
  action: 'acción',
  recommendation: 'recomendación',
  alert: 'alerta',
  approval_request: 'aprobación',
};

const KIND_BADGE: Record<string, string> = {
  action: 'approved',
  alert: 'failed',
  approval_request: 'pending',
  recommendation: 'draft',
  info: 'baja',
};

export default function BitacoraPage() {
  const [activity, setActivity] = useState<Activity[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/activity?limit=200')
      .then((r) => r.json())
      .then(setActivity)
      .catch(() => setError('No se pudo cargar la bitácora (¿API corriendo?)'));
  }, []);

  return (
    <div className="container">
      <header className="top">
        <h1>Bitácora del empleado</h1>
        <span className="status">{activity.length} registros</span>
      </header>
      {error && <p className="empty">{error}</p>}
      <section className="card">
        {activity.length === 0 && !error && <p className="empty">Sin actividad todavía.</p>}
        <ul className="plain">
          {activity.map((a) => (
            <li key={a.id}>
              <span className={`badge ${KIND_BADGE[a.kind] ?? 'baja'}`}>
                {KIND_LABELS[a.kind] ?? a.kind}
              </span>
              {a.summary}
              <div className="muted">
                {new Date(a.at).toLocaleString('es-CO', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · {a.actor}
              </div>
              {a.explanation && (
                <div className="muted" style={{ marginTop: 4 }}>
                  {[
                    a.explanation.objective && `Objetivo: ${a.explanation.objective}`,
                    a.explanation.decision && `Decisión: ${a.explanation.decision}`,
                    a.explanation.expectedResult && `Resultado esperado: ${a.explanation.expectedResult}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
