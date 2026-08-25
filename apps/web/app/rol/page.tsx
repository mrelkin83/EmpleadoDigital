'use client';

import { useEffect, useState } from 'react';

/**
 * Rol/persona del empleado de IA: prompt maestro que gobierna la generación
 * de contenido (temas del calendario y borradores). No es código: es
 * configuración editable, como el resto de la Brand Memory (spec §6, §17).
 */
export default function RolPage() {
  const [role, setRole] = useState('');
  const [template, setTemplate] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/brand').then((r) => r.json()),
      fetch('/api/brand/role-template').then((r) => r.json()),
    ])
      .then(([brand, tpl]) => {
        setRole(brand.aiRole ?? '');
        setTemplate(tpl.template ?? '');
      })
      .catch(() => setMessage('No se pudo cargar (¿API corriendo?)'));
  }, []);

  async function onSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/brand', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiRole: role }),
      });
      setMessage(res.ok ? 'Guardado ✓ Se aplica desde la próxima generación.' : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container">
      <header className="top">
        <h1>Rol del empleado</h1>
      </header>

      <section className="card">
        <p className="muted" style={{ marginBottom: 12 }}>
          Este texto define cómo piensa y qué exige el empleado de IA antes de entregar cualquier
          contenido: temas del calendario y borradores (imagen, carrusel, video). Se combina con la
          configuración de marca; no reemplaza el tono ni las palabras prohibidas que ya definiste en
          Configurar marca.
        </p>

        <label className="field">
          Prompt maestro
          <textarea
            rows={16}
            maxLength={4000}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Ej.: Eres un Senior de Marketing Digital con 10 años de experiencia..."
          />
        </label>
        <p className="muted">{role.length} / 4000 caracteres</p>

        <div className="actions">
          <button className="small" onClick={() => void onSave()} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar rol'}
          </button>
          <button
            className="small secondary"
            disabled={!template}
            onClick={() => setRole(template)}
          >
            Usar plantilla sugerida
          </button>
        </div>
        {message && <p className="notice" style={{ marginTop: 12 }}>{message}</p>}
      </section>
    </div>
  );
}
