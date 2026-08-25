'use client';

import { usePathname } from 'next/navigation';

/** Navegación principal por pestañas; la activa se marca en oro. */
const TABS: Array<{ href: string; label: string }> = [
  { href: '/', label: 'Panel' },
  { href: '/bitacora', label: 'Bitácora' },
  { href: '/marca', label: 'Configurar marca' },
  { href: '/rol', label: 'Rol del empleado' },
  { href: '/reporte', label: 'Reporte semanal' },
];

export function Tabs() {
  const pathname = usePathname();
  return (
    <nav className="tabs" aria-label="Secciones">
      {TABS.map((t) => (
        <a key={t.href} href={t.href} className={pathname === t.href ? 'tab active' : 'tab'}>
          {t.label}
        </a>
      ))}
    </nav>
  );
}
