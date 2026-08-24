import { describe, expect, it } from 'vitest';
import { buildPilotBrandMemory } from '@empleado/brand';
import { renderResponseTemplate } from '../src/pipeline/template.js';

describe('renderResponseTemplate (embudo de conversión, spec §78)', () => {
  const base = buildPilotBrandMemory('t1');

  it('reemplaza {{username}} y {{whatsapp}} con el enlace wa.me', () => {
    const brand = {
      ...base,
      contact: { whatsappNumber: '+57 300 123-4567', whatsappGreeting: 'Hola, vengo de Instagram' },
    };
    const { text, missingWhatsapp } = renderResponseTemplate(
      'Hola {{username}}, escríbenos: {{whatsapp}}',
      brand,
      { username: 'cliente1' },
    );
    expect(missingWhatsapp).toBe(false);
    expect(text).toContain('Hola cliente1');
    expect(text).toContain('https://wa.me/573001234567?text=Hola%2C%20vengo%20de%20Instagram');
  });

  it('marca missingWhatsapp cuando la plantilla lo usa y la marca no tiene número', () => {
    const { missingWhatsapp } = renderResponseTemplate('Escríbenos: {{whatsapp}}', base);
    expect(missingWhatsapp).toBe(true);
  });

  it('sin username (DMs) no deja huecos raros', () => {
    const brand = { ...base, contact: { whatsappNumber: '573001234567' } };
    const { text } = renderResponseTemplate('Hola {{username}}, escríbenos: {{whatsapp}}', brand);
    expect(text.startsWith('Hola ,')).toBe(true);
  });
});
