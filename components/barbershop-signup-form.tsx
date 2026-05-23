'use client';

import { useState } from 'react';
import Link from 'next/link';

export function BarbershopSignupForm() {
  const [form, setForm] = useState({
    owner_name: '',
    shop_name: '',
    city: '',
    whatsapp: '',
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [siteUrl, setSiteUrl] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const res = await fetch('/api/signup-barbershop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || 'Nao foi possivel criar sua conta.');
        return;
      }

      setSiteUrl(data.siteUrl || '');
      setMessage('Conta criada com 30 dias gratis. Agora voce ja pode entrar no painel.');
    } catch {
      setMessage('Erro ao criar cadastro.');
    } finally {
      setLoading(false);
    }
  }

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form className="panel space-y-4 p-6" onSubmit={submit}>
      <div>
        <div className="badge mb-3">30 dias gratis</div>
        <h1 className="text-2xl font-bold">Cadastrar minha barbearia</h1>
        <p className="mt-2 text-sm text-white/70">
          Crie seu painel, site de agendamento e assinatura trial automaticamente.
        </p>
      </div>

      <input className="field" placeholder="Seu nome" value={form.owner_name} onChange={(e) => update('owner_name', e.target.value)} required />
      <input className="field" placeholder="Nome da barbearia" value={form.shop_name} onChange={(e) => update('shop_name', e.target.value)} required />
      <input className="field" placeholder="Cidade" value={form.city} onChange={(e) => update('city', e.target.value)} required />
      <input className="field" placeholder="WhatsApp com DDD" value={form.whatsapp} onChange={(e) => update('whatsapp', e.target.value)} required />
      <input className="field" type="email" placeholder="Email de login" value={form.email} onChange={(e) => update('email', e.target.value)} required />
      <input className="field" type="password" placeholder="Senha" value={form.password} onChange={(e) => update('password', e.target.value)} required minLength={6} />

      <button className="btn btn-primary w-full" disabled={loading}>
        {loading ? 'Criando conta...' : 'Comecar 30 dias gratis'}
      </button>

      {message ? <p className="text-sm text-white/80">{message}</p> : null}

      {siteUrl ? (
        <div className="flex flex-wrap gap-2">
          <Link className="btn btn-dark" href="/login">Entrar no painel</Link>
          <Link className="btn btn-dark" href={siteUrl}>Ver site</Link>
        </div>
      ) : null}
    </form>
  );
}
