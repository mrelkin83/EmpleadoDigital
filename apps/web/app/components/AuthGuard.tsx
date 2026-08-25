'use client';

import { useEffect } from 'react';

/**
 * Si cualquier llamada a la API responde 401 (sesión caducada o revocada) y
 * no estamos ya en /login, redirige. Complementa al middleware de borde, que
 * solo comprueba que la cookie exista, no que la sesión siga siendo válida.
 */
export function AuthGuard() {
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      if (res.status === 401 && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
      return res;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);
  return null;
}
