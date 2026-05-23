'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const ADMIN_SECRET_PATH = '/09fjf889n3bvy9332';

type LoginMode = 'shop' | 'admin';

type Props = {
  mode?: LoginMode;
};

export function LoginForm({ mode = 'shop' }: Props) {
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

    if (error) {
      setLoading(false);
      setMessage(error.message || 'Nao foi possivel entrar.');
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .single();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      setLoading(false);
      setMessage('Conta sem perfil de acesso configurado.');
      return;
    }

    if (mode === 'shop' && profile.role === 'admin') {
      await supabase.auth.signOut();
      setLoading(false);
      setMessage('Administradores devem acessar somente pelo link secreto.');
      return;
    }

    if (mode === 'admin' && profile.role !== 'admin') {
      await supabase.auth.signOut();
      setLoading(false);
      setMessage('Este login e exclusivo para administradores.');
      return;
    }

    const next = searchParams.get('next');
    const canUseNext =
      mode === 'admin'
        ? Boolean(next?.startsWith(ADMIN_SECRET_PATH))
        : Boolean(next?.startsWith('/shop'));

    setLoading(false);

    if (next && canUseNext) {
      router.push(next);
      router.refresh();
      return;
    }

    router.push(mode === 'admin' ? ADMIN_SECRET_PATH : '/shop');
    router.refresh();
  }

  return (
    <form className="panel p-6 space-y-4" onSubmit={handleSubmit}>
      <div>
        <h1 className="text-2xl font-bold">Entrar no Ventura Barber</h1>
        <p className="mt-2 text-sm text-white/70">
          {mode === 'admin'
            ? 'Acesso exclusivo do administrador do sistema.'
            : 'Use seu email e senha para acessar o painel da barbearia.'}
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
