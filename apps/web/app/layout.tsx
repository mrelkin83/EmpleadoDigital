import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { Tabs } from './components/Tabs';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Empleado Digital',
  description: 'Tu equipo de marketing digital con IA',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body>
        <div className="tabs-bar">
          <Tabs />
        </div>
        {children}
      </body>
    </html>
  );
}
