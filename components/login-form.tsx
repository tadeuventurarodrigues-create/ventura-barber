'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setMessage(error.message || 'Não foi possível entrar.');
      return;
    }

    const next = searchParams.get('next');
    if (next) {
      router.push(next);
      router.refresh();
      return;
    }

    router.push('/auth/redirect');
    router.refresh();
  }

  return (
    <form className="panel p-6 space-y-4" onSubmit={handleSubmit}>
      <div>
        <h1 className="text-2xl font-bold">Entrar no Ventura Barber</h1>
        <p className="mt-2 text-sm text-white/70">
          Use seu email e senha para acessar o painel.
        </p>
      </div>

      <input
        className="field"
        type="email"
        placeholder="Seu email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <input
        className="field"
        type="password"
        placeholder="Sua senha"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      <button className="btn btn-primary w-full" disabled={loading}>
        {loading ? 'Entrando...' : 'Entrar'}
      </button>

      {message ? <p className="text-sm text-red-300">{message}</p> : null}
    </form>
  );
}