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
}

const lines = (v: string) => v.split('\n').map((s) => s.trim()).filter(Boolean);
const commas = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);

export default function BrandPage() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/brand')
      .then((r) => r.json())
      .then(setBrand)
      .catch(() => setMessage('No se pudo cargar la marca (¿API corriendo?)'));
  }, []);

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
        <a href="/">← Volver al dashboard</a>
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
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar marca'}
        </button>
        {message && <p className="muted">{message}</p>}
      </form>
    </div>
  );
}
