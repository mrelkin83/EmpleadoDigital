import { whatsappLink, type BrandMemory } from '@empleado/brand';

/**
 * Renderiza la plantilla de respuesta del CM. Variables soportadas:
 * {{username}} → @usuario (vacío en DMs, donde Meta no da username),
 * {{whatsapp}} → enlace wa.me del embudo de conversión (spec §78).
 * Si la plantilla usa {{whatsapp}} y la marca no tiene número, se reporta
 * para escalar a humano en lugar de enviar un mensaje roto.
 */
export function renderResponseTemplate(
  template: string,
  brand: BrandMemory,
  vars: { username?: string } = {},
): { text: string; missingWhatsapp: boolean } {
  const link = whatsappLink(brand);
  const missingWhatsapp = !link && template.includes('{{whatsapp}}');
  const text = template
    .replaceAll('{{username}}', vars.username ?? '')
    .replaceAll('{{whatsapp}}', link ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return { text, missingWhatsapp };
}
