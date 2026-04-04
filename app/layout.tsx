import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ventura Barber',
  description: 'Sistema de agendamento para barbearias com painel admin, painel do barbeiro e site do cliente.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
