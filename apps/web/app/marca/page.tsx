'use client';

import { useEffect, useState, type FormEvent } from 'react';

/**
 * Configuración de la Brand Memory (spec §17): el nicho es configuración, no código.
 * Editor simple de los campos que más afectan a la generación y al Quality Gate.
 */
interface Brand {
  brandName: string;
  description: string;
  sector: string;
  niche: string;
  market: string;
  services: string[];
  differentiators: string[];
  audience: {
    segments: string[];
    painPoints: string[];
    goals: string[];
    location?: string;
    ageRange?: string;
    interests?: string[];
  };
  voice: {
    tone: string;
    allowedWords: string[];
    prohibitedWords: string[];
    approvedClaims: string[];
    languageCode: string;
  };
  disclaimers: string[];
  competitors: string[];
  contentPillars: string[];
  contact?: {
    whatsappNumber?: string;
    whatsappGreeting?: string;
    website?: string;
    email?: string;
    phoneDisplay?: string;
  };
  visual?: { primaryColor?: string; accentColor?: string; logoFilename?: string };
}

interface KeywordRule {
  id?: string;
  keyword: string;
  aliases: string[];
  matchType: 'exact' | 'contains' | 'word_boundary';
  priority: number;
  enabled: boolean;
  cooldownMinutes: number;
  responseTemplate: string;
}

const lines = (v: string) => v.split('\n').map((s) => s.trim()).filter(Boolean);
const commas = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);

export default function BrandPage() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rules, setRules] = useState<KeywordRule[]>([]);
  const [savingRules, setSavingRules] = useState(false);
  const [rulesMessage, setRulesMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/brand')
      .then((r) => r.json())
      .then(setBrand)
      .catch(() => setMessage('No se pudo cargar la marca (¿API corriendo?)'));
    fetch('/api/keywords')
      .then((r) => r.json())
      .then(setRules)
      .catch(() => {});
  }, []);

  function updateRule(index: number, changes: Partial<KeywordRule>) {
    setRules((rs) => rs.map((r, i) => (i === index ? { ...r, ...changes } : r)));
  }

  async function onSaveRules() {
    setSavingRules(true);
    setRulesMessage(null);
    try {
      const res = await fetch('/api/keywords', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rules),
      });
      if (res.ok) {
        setRules(await res.json());
        setRulesMessage('Reglas guardadas ✓');
      } else {
        const err = await res.json();
        setRulesMessage(`Error: ${err.error}`);
      }
    } finally {
      setSavingRules(false);
    }
  }

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!brand) return;
    const form = new FormData(e.currentTarget);
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        brandName: form.get('brandName'),
        description: form.get('description'),
        sector: form.get('sector'),
        niche: form.get('niche'),
        market: form.get('market'),
        services: lines(String(form.get('services') ?? '')),
        differentiators: lines(String(form.get('differentiators') ?? '')),
        audience: {
          segments: lines(String(form.get('segments') ?? '')),
          painPoints: lines(String(form.get('painPoints') ?? '')),
          goals: brand.audience.goals,
          ...(String(form.get('location') ?? '').trim()
            ? { location: String(form.get('location')).trim() }
            : {}),
          ...(String(form.get('ageRange') ?? '').trim()
            ? { ageRange: String(form.get('ageRange')).trim() }
            : {}),
          ...(commas(String(form.get('interests') ?? '')).length
            ? { interests: commas(String(form.get('interests') ?? '')) }
            : {}),
        },
        voice: {
          ...brand.voice,
          tone: form.get('tone'),
          prohibitedWords: commas(String(form.get('prohibitedWords') ?? '')),
        },
        disclaimers: lines(String(form.get('disclaimers') ?? '')),
        contentPillars: commas(String(form.get('contentPillars') ?? '')),
        contact: {
          ...(String(form.get('whatsappNumber') ?? '').trim()
            ? { whatsappNumber: String(form.get('whatsappNumber')).trim() }
            : {}),
          ...(String(form.get('whatsappGreeting') ?? '').trim()
            ? { whatsappGreeting: String(form.get('whatsappGreeting')).trim() }
            : {}),
          ...(String(form.get('website') ?? '').trim()
            ? { website: String(form.get('website')).trim() }
            : {}),
          ...(String(form.get('email') ?? '').trim()
            ? { email: String(form.get('email')).trim() }
            : {}),
          ...(String(form.get('phoneDisplay') ?? '').trim()
            ? { phoneDisplay: String(form.get('phoneDisplay')).trim() }
            : {}),
        },
        visual: {
          primaryColor: String(form.get('primaryColor') || '#12263f'),
          accentColor: String(form.get('accentColor') || '#d9a441'),
        },
      };
      const res = await fetch('/api/brand', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setBrand(await res.json());
        setMessage('Guardado ✓');
      } else {
        const err = await res.json();
        setMessage(`Error al guardar: ${err.error}`);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!brand) {
    return (
      <div className="container">
        <p className="empty">{message ?? 'Cargando…'}</p>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="top">
        <h1>Marca · {brand.brandName}</h1>
      </header>

      <form className="gen card" onSubmit={onSave}>
        <label>
          Nombre de la marca
          <input name="brandName" defaultValue={brand.brandName} maxLength={120} required />
        </label>
        <label>
          Descripción del negocio
          <textarea name="description" defaultValue={brand.description} rows={3} maxLength={3000} />
        </label>
        <label>
          Sector
          <input name="sector" defaultValue={brand.sector} maxLength={200} />
        </label>
        <label>
          Nicho
          <input name="niche" defaultValue={brand.niche} maxLength={200} />
        </label>
        <label>
          Mercado
          <input name="market" defaultValue={brand.market} maxLength={200} />
        </label>
        <label>
          Servicios (uno por línea)
          <textarea name="services" defaultValue={brand.services.join('\n')} rows={4} />
        </label>
        <label>
          Diferenciadores (uno por línea)
          <textarea name="differentiators" defaultValue={brand.differentiators.join('\n')} rows={3} />
        </label>
        <label>
          Segmentos de audiencia (uno por línea)
          <textarea name="segments" defaultValue={brand.audience.segments.join('\n')} rows={4} />
        </label>
        <label>
          Dolores de la audiencia (uno por línea)
          <textarea name="painPoints" defaultValue={brand.audience.painPoints.join('\n')} rows={4} />
        </label>
        <label>
          Ubicación de la audiencia (opcional)
          <input
            name="location"
            defaultValue={brand.audience.location ?? ''}
            maxLength={200}
            placeholder="ej. Colombia, principales ciudades y zonas de frontera"
          />
        </label>
        <label>
          Rango de edad (opcional)
          <input
            name="ageRange"
            defaultValue={brand.audience.ageRange ?? ''}
            maxLength={30}
            placeholder="ej. 28-55"
          />
        </label>
        <label>
          Intereses / temas afines (separados por coma, opcional)
          <input
            name="interests"
            defaultValue={(brand.audience.interests ?? []).join(', ')}
            placeholder="ej. importaciones, comercio exterior, emprendimiento"
          />
        </label>
        <label>
          Tono de voz
          <textarea name="tone" defaultValue={brand.voice.tone} rows={2} maxLength={1000} />
        </label>
        <label>
          Palabras prohibidas (separadas por coma)
          <input name="prohibitedWords" defaultValue={brand.voice.prohibitedWords.join(', ')} />
        </label>
        <label>
          Disclaimers obligatorios (uno por línea)
          <textarea name="disclaimers" defaultValue={brand.disclaimers.join('\n')} rows={2} />
        </label>
        <label>
          Pilares de contenido (separados por coma)
          <input name="contentPillars" defaultValue={brand.contentPillars.join(', ')} required />
        </label>
        <label>
          WhatsApp del embudo de conversión (con código de país, ej. 573001234567)
          <input
            name="whatsappNumber"
            defaultValue={brand.contact?.whatsappNumber ?? ''}
            maxLength={20}
            placeholder="573001234567"
          />
        </label>
        <label>
          Mensaje con el que llega el interesado al WhatsApp (opcional)
          <input
            name="whatsappGreeting"
            defaultValue={brand.contact?.whatsappGreeting ?? ''}
            maxLength={300}
            placeholder="Hola, vengo de Instagram y quiero una asesoría aduanera"
          />
        </label>
        <label>
          Página web (aparece en las piezas gráficas)
          <input name="website" defaultValue={brand.contact?.website ?? ''} maxLength={200} placeholder="www.pedroabogadoaduanero.com" />
        </label>
        <label>
          Correo (aparece en las piezas gráficas)
          <input name="email" defaultValue={brand.contact?.email ?? ''} maxLength={200} placeholder="contacto@..." />
        </label>
        <label>
          Teléfono para mostrar (aparece en las piezas gráficas)
          <input name="phoneDisplay" defaultValue={brand.contact?.phoneDisplay ?? ''} maxLength={40} placeholder="+57 300 123 4567" />
        </label>
        <div className="actions">
          <label className="field">
            Color principal
            <input type="color" name="primaryColor" defaultValue={brand.visual?.primaryColor ?? '#12263f'} />
          </label>
          <label className="field">
            Color de acento
            <input type="color" name="accentColor" defaultValue={brand.visual?.accentColor ?? '#d9a441'} />
          </label>
          <label className="field">
            Logo (PNG con fondo transparente)
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const fd = new FormData();
                fd.append('file', file);
                void fetch('/api/brand/logo', { method: 'POST', body: fd }).then(async (r) => {
                  setMessage(r.ok ? 'Logo subido ✓' : 'No se pudo subir el logo');
                  if (r.ok) setBrand(await fetch('/api/brand').then((x) => x.json()));
                });
                e.target.value = '';
              }}
            />
          </label>
          {brand.visual?.logoFilename && (
            <img
              src={`/media/${brand.visual.logoFilename}`}
              alt="Logo actual"
              style={{ height: 48, alignSelf: 'end' }}
            />
          )}
        </div>
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar marca'}
        </button>
        {message && <p className="muted">{message}</p>}
      </form>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Respuestas automáticas por palabra clave</h2>
        <p className="muted">
          Cuando un comentario o DM contiene la palabra clave, el empleado propone esta respuesta.
          Su envío respeta tu configuración de autonomía (en Copiloto siempre te pide aprobación).
        </p>
        <ul className="plain">
          {rules.map((r, i) => (
            <li key={r.id ?? i} style={{ borderBottom: '1px solid var(--border, #ddd)', paddingBottom: 8 }}>
              <div className="actions" style={{ alignItems: 'center' }}>
                <label>
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={(e) => updateRule(i, { enabled: e.target.checked })}
                  />{' '}
                  activa
                </label>
                <input
                  value={r.keyword}
                  onChange={(e) => updateRule(i, { keyword: e.target.value })}
                  placeholder="palabra clave"
                  maxLength={80}
                  style={{ width: 140 }}
                />
                <input
                  value={r.aliases.join(', ')}
                  onChange={(e) => updateRule(i, { aliases: commas(e.target.value) })}
                  placeholder="sinónimos, separados por coma"
                  style={{ flex: 1 }}
                />
                <button className="small secondary" onClick={() => setRules((rs) => rs.filter((_, j) => j !== i))}>
                  Quitar
                </button>
              </div>
              <textarea
                value={r.responseTemplate}
                onChange={(e) => updateRule(i, { responseTemplate: e.target.value })}
                rows={2}
                maxLength={1000}
                style={{ width: '100%', marginTop: 4 }}
              />
            </li>
          ))}
        </ul>
        <div className="actions">
          <button
            className="small secondary"
            onClick={() =>
              setRules((rs) => [
                ...rs,
                {
                  keyword: '',
                  aliases: [],
                  matchType: 'word_boundary',
                  priority: 100,
                  enabled: true,
                  cooldownMinutes: 1440,
                  responseTemplate: '',
                },
              ])
            }
          >
            Añadir regla
          </button>
          <button className="small" onClick={() => void onSaveRules()} disabled={savingRules}>
            {savingRules ? 'Guardando…' : 'Guardar reglas'}
          </button>
        </div>
        {rulesMessage && <p className="muted">{rulesMessage}</p>}
      </section>
    </div>
  );
}
