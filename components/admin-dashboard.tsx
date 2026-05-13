'use client';

import { useState } from 'react';
import { BarberProductsPanel } from './barber-products-panel';

type Barbershop = {
  id?: string;
  name?: string;
  slug?: string;
  description?: string | null;
  logo_url?: string | null;
  cover_image_url?: string | null;
  primary_color?: string | null;
  whatsapp_number?: string | null;
  address?: string | null;
  opening_hours_text?: string | null;
};

type Professional = {
  id: string;
  name: string;
  whatsapp_number?: string | null;
  specialty?: string | null;
  photo_url?: string | null;
};

type Service = {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
};

type Loyalty =
  | {
      enabled?: boolean;
      rules_text?: string | null;
      reward_message?: string | null;
      visits_required?: number | null;
      reward_label?: string | null;
    }
  | null;

export function AdminDashboard({
  initialBarbershop,
  professionals,
  services,
  loyalty,
}: {
  initialBarbershop: Barbershop | null;
  professionals: Professional[];
  services: Service[];
  loyalty: Loyalty;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [credentials, setCredentials] = useState<null | {
    email: string;
    password: string;
    barberName: string;
  }>(null);

  async function post(path: string, payload: Record<string, unknown>) {
    setLoading(true);
    setMessage('');
    setCredentials(null);

    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    setLoading(false);

    setMessage(data.message || (res.ok ? 'Salvo com sucesso.' : data.error || 'Erro ao salvar.'));

    if (res.ok && data.createdLogin) {
      setCredentials({
        email: data.createdLogin.email,
        password: data.createdLogin.password,
        barberName: data.createdLogin.barberName,
      });
    }

    if (res.ok) {
      window.location.reload();
    }
  }

  return (
    <div className="space-y-8">
      <section className="panel p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Site 1 — seu painel admin</h2>
            <p className="text-sm text-white/70">
              Cadastre barbearia, identidade visual, serviços, barbeiros, dias e horários de trabalho.
            </p>
          </div>
          {initialBarbershop?.slug ? (
            <a href={`/${initialBarbershop.slug}`} className="badge" target="_blank">
              Abrir site do cliente
            </a>
          ) : null}
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              post('/api/admin/barbershops', Object.fromEntries(fd.entries()));
            }}
          >
            <h3 className="text-lg font-semibold">Dados da barbearia</h3>
            <input className="field" name="id" type="hidden" defaultValue={initialBarbershop?.id || ''} />
            <input className="field" name="name" placeholder="Nome da barbearia" defaultValue={initialBarbershop?.name || ''} required />
            <input className="field" name="slug" placeholder="slug-da-barbearia" defaultValue={initialBarbershop?.slug || ''} required />
            <textarea className="field min-h-24" name="description" placeholder="Descrição curta" defaultValue={initialBarbershop?.description || ''} />
            <div className="grid gap-3 md:grid-cols-2">
              <input className="field" name="logo_url" placeholder="URL da logo" defaultValue={initialBarbershop?.logo_url || ''} />
              <input className="field" name="cover_image_url" placeholder="URL da capa/fundo" defaultValue={initialBarbershop?.cover_image_url || ''} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input className="field" name="primary_color" type="color" defaultValue={initialBarbershop?.primary_color || '#c49b63'} />
              <input className="field" name="whatsapp_number" placeholder="Número que recebe novos agendamentos" defaultValue={initialBarbershop?.whatsapp_number || ''} />
            </div>
            <input className="field" name="address" placeholder="Endereço" defaultValue={initialBarbershop?.address || ''} />
            <input className="field" name="opening_hours_text" placeholder="Ex: Seg a sáb · 8h às 18h" defaultValue={initialBarbershop?.opening_hours_text || ''} />
            <button className="btn btn-primary" disabled={loading}>
              Salvar barbearia
            </button>
          </form>

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              post('/api/admin/loyalty', Object.fromEntries(fd.entries()));
            }}
          >
            <h3 className="text-lg font-semibold">Cartão fidelidade</h3>
            <input className="field" type="hidden" name="barbershop_id" defaultValue={initialBarbershop?.id || ''} />
            <select className="field" name="enabled" defaultValue={loyalty?.enabled ? 'true' : 'false'}>
              <option value="false">Desativado</option>
              <option value="true">Ativado</option>
            </select>
            <input className="field" name="visits_required" type="number" min={1} defaultValue={loyalty?.visits_required || 10} placeholder="Quantidade de visitas" />
            <input className="field" name="reward_label" defaultValue={loyalty?.reward_label || 'Corte grátis'} placeholder="Prêmio" />
            <textarea className="field min-h-24" name="rules_text" defaultValue={loyalty?.rules_text || ''} placeholder="Regras do cartão fidelidade" />
            <textarea className="field min-h-24" name="reward_message" defaultValue={loyalty?.reward_message || ''} placeholder="Mensagem quando o cliente ganhar o prêmio" />
            <button className="btn btn-primary" disabled={loading || !initialBarbershop?.id}>
              Salvar fidelidade
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <form
          className="panel p-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            post('/api/admin/professionals', Object.fromEntries(fd.entries()));
          }}
        >
          <h3 className="text-lg font-semibold">Adicionar barbeiro + criar login</h3>

          <input className="field" type="hidden" name="barbershop_id" defaultValue={initialBarbershop?.id || ''} />

          <input className="field" name="name" placeholder="Nome do barbeiro" required />
          <input className="field" name="email" type="email" placeholder="Email de login do barbeiro" required />
          <input className="field" name="password" type="text" placeholder="Senha inicial do barbeiro" required />

          <input className="field" name="specialty" placeholder="Especialidade" />
          <input className="field" name="whatsapp_number" placeholder="Número do barbeiro" />
          <input className="field" name="photo_url" placeholder="URL da foto de perfil" />
          <textarea className="field min-h-24" name="description" placeholder="Descrição curta do barbeiro" />

          <button className="btn btn-primary" disabled={loading || !initialBarbershop?.id}>
            Adicionar barbeiro
          </button>
        </form>

        <form
          className="panel p-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            post('/api/admin/services', Object.fromEntries(fd.entries()));
          }}
        >
          <h3 className="text-lg font-semibold">Adicionar serviço</h3>
          <input className="field" type="hidden" name="barbershop_id" defaultValue={initialBarbershop?.id || ''} />
          <input className="field" name="name" placeholder="Nome do serviço" required />
          <div className="grid gap-3 md:grid-cols-2">
            <input className="field" name="price" type="number" step="0.01" placeholder="Valor" required />
            <input className="field" name="duration_minutes" type="number" placeholder="Duração em minutos" required />
          </div>
          <textarea className="field min-h-24" name="description" placeholder="Descrição" />
          <button className="btn btn-primary" disabled={loading || !initialBarbershop?.id}>
            Adicionar serviço
          </button>
        </form>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <form
          className="panel p-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            post('/api/admin/working-hours', Object.fromEntries(fd.entries()));
          }}
        >
          <h3 className="text-lg font-semibold">Dias e horários de trabalho</h3>
          <select className="field" name="professional_id" required>
            <option value="">Escolha o barbeiro</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select className="field" name="weekday" required>
            <option value="1">Segunda</option>
            <option value="2">Terça</option>
            <option value="3">Quarta</option>
            <option value="4">Quinta</option>
            <option value="5">Sexta</option>
            <option value="6">Sábado</option>
            <option value="0">Domingo</option>
          </select>
          <div className="grid gap-3 md:grid-cols-2">
            <input className="field" name="start_time" type="time" required />
            <input className="field" name="end_time" type="time" required />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input className="field" name="break_start_time" type="time" />
            <input className="field" name="break_end_time" type="time" />
          </div>
          <button className="btn btn-primary" disabled={loading}>
            Salvar horário
          </button>
        </form>

        <div className="panel p-6">
          <h3 className="mb-4 text-lg font-semibold">Resumo do cadastro</h3>

          <div className="space-y-4 text-sm">
            <div>
              <div className="mb-2 font-semibold">Barbeiros</div>
              <div className="space-y-2">
                {professionals.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-white/10 p-3">
                    {p.name} — {p.whatsapp_number || 'sem número'}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 font-semibold">Serviços</div>
              <div className="space-y-2">
                {services.map((s) => (
                  <div key={s.id} className="rounded-2xl border border-white/10 p-3">
                    {s.name} — R$ {Number(s.price).toFixed(2)} — {s.duration_minutes} min
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}

      {/* Shopping do Barbeiro — Admin */}
      <section className="panel p-6">
        <div className="mb-4">
          <h2 className="text-2xl font-bold" style={{
            background: 'linear-gradient(90deg, #c49b63, #f0c97a)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            🛒 Shopping do Barbeiro
          </h2>
          <p className="text-sm text-white/60 mt-1">
            Gerencie todos os produtos de todas as barbearias.
          </p>
        </div>

        {!initialBarbershop?.id ? (
          <p className="text-white/45 text-sm">Nenhuma barbearia configurada.</p>
        ) : (
          <BarberProductsPanel
            barbershopId={initialBarbershop.id}
            title="Gerenciar Produtos"
          />
        )}
      </section>

      {credentials ? (
        <div className="panel p-6">
          <h3 className="text-lg font-semibold">Login criado com sucesso</h3>
          <div className="mt-3 space-y-2 text-sm text-white/80">
            <p>
              <strong>Barbeiro:</strong> {credentials.barberName}
            </p>
            <p>
              <strong>Email:</strong> {credentials.email}
            </p>
            <p>
              <strong>Senha inicial:</strong> {credentials.password}
            </p>
            <p className="text-amber-300">
              Guarde esses dados. Você pode passar isso para o barbeiro entrar em /login.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}