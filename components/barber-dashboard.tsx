'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { BarberProductsPanel } from './barber-products-panel';

type Booking = {
  id: string;
  daily_order_number: number;
  booking_date: string;
  start_time: string;
  end_time?: string;
  status: string;
  customer_name: string;
  service_name: string;
  price?: number;
};

type Professional = {
  id: string;
  name: string;
  description?: string | null;
  photo_url?: string | null;
  specialty?: string | null;
  whatsapp_number?: string | null;
};

type Summary = {
  customers: number;
  revenue: number;
  bookings: number;
};

type Props = {
  professional: Professional;
  barbershopSlug: string;
  barbershopId: string;
  bookings: Booking[];
  summary: Summary;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function fmtMoney(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}
function fmtDate(d: string) {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
function fmtTime(t: string) {
  return t?.slice(0, 5) || t;
}
function statusColor(s: string) {
  if (s === 'confirmed') return '#4ade80';
  if (s === 'completed') return '#c49b63';
  if (s === 'cancelled') return '#f87171';
  return '#94a3b8';
}
function statusLabel(s: string) {
  if (s === 'confirmed') return 'Confirmado';
  if (s === 'completed') return 'Concluído';
  if (s === 'cancelled') return 'Cancelado';
  if (s === 'pending') return 'Pendente';
  return s;
}
function compressImage(dataUrl: string, maxW = 400, quality = 0.8): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });
}

const TABS = [
  { id: 'dash', label: '🏠 Início' },
  { id: 'agenda', label: '📅 Agenda' },
  { id: 'relatorio', label: '📊 Relatório' },
  { id: 'perfil', label: '👤 Perfil' },
  { id: 'shopping', label: '🛒 Shopping' },
] as const;

export function BarberDashboard({ professional, barbershopSlug, barbershopId, bookings, summary }: Props) {
  const [activeTab, setActiveTab] = useState<'dash' | 'agenda' | 'relatorio' | 'perfil' | 'shopping'>('dash');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [liveBookings, setLiveBookings] = useState<Booking[]>(bookings);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState(todayIso());
  const [mounted, setMounted] = useState(false);
  const [notifPermission, setNotifPermission] = useState<string>('default');
  const [notifActive, setNotifActive] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState(professional.photo_url || '');

  useEffect(() => {
    setMounted(true);
    if ('Notification' in window) setNotifPermission(Notification.permission);
  }, []);

  async function enableNotifications() {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    if (perm !== 'granted') return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const lastId = liveBookings[0]?.id || '';
      reg.active?.postMessage({ type: 'START_BOOKING_POLL', professionalId: professional.id, barbershopId, lastBookingId: lastId });
      setNotifActive(true);
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'NEW_BOOKINGS') {
          const incoming: Booking[] = event.data.bookings;
          setLiveBookings((prev) => {
            const ids = new Set(prev.map((b) => b.id));
            return [...incoming.filter((b) => !ids.has(b.id)), ...prev];
          });
          setNewCount((c) => c + incoming.length);
        }
      });
    } catch (e) { console.error('SW:', e); }
  }

  const filteredBookings = useMemo(() => {
    return liveBookings.filter((b) => {
      const matchDate = b.booking_date === dateFilter;
      const matchStatus = statusFilter === 'all' || b.status === statusFilter;
      const matchSearch = !search || b.customer_name.toLowerCase().includes(search.toLowerCase());
      return matchDate && matchStatus && matchSearch;
    });
  }, [liveBookings, dateFilter, statusFilter, search]);

  const report = useMemo(() => {
    const confirmed = liveBookings.filter((b) => b.status === 'confirmed' || b.status === 'completed');
    const cancelled = liveBookings.filter((b) => b.status === 'cancelled');
    const revenue = confirmed.reduce((s, b) => s + (b.price || 0), 0);
    const today = todayIso();
    const todayB = confirmed.filter((b) => b.booking_date === today);
    const todayRevenue = todayB.reduce((s, b) => s + (b.price || 0), 0);
    const uniqueClients = new Set(confirmed.map((b) => b.customer_name)).size;
    const byService: Record<string, { count: number; revenue: number }> = {};
    confirmed.forEach((b) => {
      const k = b.service_name || 'Outro';
      if (!byService[k]) byService[k] = { count: 0, revenue: 0 };
      byService[k].count++;
      byService[k].revenue += b.price || 0;
    });
    const topServices = Object.entries(byService).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
    const last7: { date: string; count: number; revenue: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const db = confirmed.filter((b) => b.booking_date === iso);
      last7.push({ date: iso, count: db.length, revenue: db.reduce((s, b) => s + (b.price || 0), 0) });
    }
    return { confirmed: confirmed.length, cancelled: cancelled.length, revenue, todayBookings: todayB.length, todayRevenue, uniqueClients, topServices, last7 };
  }, [liveBookings]);

  const maxRevenue = Math.max(...report.last7.map((d) => d.revenue), 1);

  async function patchBooking(id: string, payload: Record<string, unknown>) {
    setLoading(true); setMessage('');
    const res = await fetch(`/api/bookings/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setLiveBookings((prev) => prev.map((b) => b.id === id ? { ...b, status: payload.action === 'cancel' ? 'cancelled' : b.status } : b));
      setMessage(data.message || 'Atualizado.');
    } else { setMessage(data.error || 'Erro.'); }
  }

  async function createBlock(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const res = await fetch('/api/admin/time-blocks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ professional_id: professional.id, block_date: fd.get('block_date'), start_time: fd.get('start_time'), end_time: fd.get('end_time'), reason: fd.get('reason') }) });
    const data = await res.json();
    setLoading(false);
    setMessage(data.message || (res.ok ? 'Bloqueio salvo.' : data.error || 'Erro.'));
    if (res.ok) (e.target as HTMLFormElement).reset();
  }

  async function updateProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const res = await fetch('/api/admin/professionals', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: professional.id, name: fd.get('name'), specialty: fd.get('specialty'), whatsapp_number: fd.get('whatsapp_number'), photo_url: photoPreview, description: fd.get('description') }) });
    const data = await res.json();
    setLoading(false);
    setMessage(data.message || (res.ok ? 'Perfil atualizado.' : data.error || 'Erro.'));
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => { setPhotoPreview(await compressImage(String(reader.result))); };
    reader.readAsDataURL(file); e.target.value = '';
  }

  const card = { background: 'linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 24 } as const;

  return (
    <div style={{ fontFamily: 'Arial,Helvetica,sans-serif', color: '#f7f7f7' }}>

      {/* Notif Banner */}
      {mounted && notifPermission !== 'granted' && (
        <div style={{ background: 'linear-gradient(135deg,rgba(196,155,99,0.18),rgba(196,155,99,0.08))', border: '1px solid rgba(196,155,99,0.35)', borderRadius: 16, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' as const }}>
          <div>
            <span style={{ fontWeight: 700, color: '#c49b63' }}>🔔 Ative as notificações</span>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Receba alertas de novos agendamentos mesmo com o painel minimizado.</p>
          </div>
          <button onClick={enableNotifications} style={{ background: 'linear-gradient(135deg,#c49b63,#a07840)', color: '#0a0a0a', border: 'none', borderRadius: 12, padding: '10px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' as const }}>
            Ativar notificações
          </button>
        </div>
      )}

      {notifActive && (
        <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 12, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>●</span> Notificações ativas — você será avisado de novos agendamentos.
          {newCount > 0 && <strong style={{ marginLeft: 8, background: '#c49b63', color: '#0a0a0a', borderRadius: 999, padding: '2px 8px' }}>{newCount} novo(s)</strong>}
        </div>
      )}

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#111 0%,#1a1408 50%,#111 100%)', border: '1px solid rgba(196,155,99,0.2)', borderRadius: 20, padding: '20px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' as const }}>
        <div style={{ width: 60, height: 60, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '2px solid rgba(196,155,99,0.5)', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
          {professional.photo_url ? <img src={professional.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '✂️'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{professional.name}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{professional.specialty || 'Barbeiro'}</div>
        </div>
        <a href={`/${barbershopSlug}`} target="_blank" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', borderRadius: 12, padding: '8px 16px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          Site do cliente ↗
        </a>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Hoje', value: report.todayBookings, sub: fmtMoney(report.todayRevenue), icon: '📅' },
          { label: 'Total agend.', value: report.confirmed, sub: `${report.cancelled} cancelados`, icon: '✅' },
          { label: 'Faturamento', value: fmtMoney(report.revenue), sub: 'histórico', icon: '💰' },
          { label: 'Clientes únicos', value: report.uniqueClients, sub: 'cadastrados', icon: '👥' },
        ].map((kpi) => (
          <div key={kpi.label} style={{ background: 'linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: '16px 18px' }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{kpi.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>{kpi.value}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{kpi.label}</div>
            <div style={{ fontSize: 11, color: '#c49b63', marginTop: 4, fontWeight: 600 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Tab Nav */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, marginBottom: 20, scrollbarWidth: 'none' as const }}>
        {TABS.map(({ id, label }) => (
          <button key={id} onClick={() => { setActiveTab(id); setMessage(''); }} style={{ flexShrink: 0, padding: '10px 18px', borderRadius: 14, border: 'none', background: activeTab === id ? 'linear-gradient(135deg,#c49b63,#a07840)' : 'rgba(255,255,255,0.05)', color: activeTab === id ? '#0a0a0a' : 'rgba(255,255,255,0.65)', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Mensagem */}
      {message && (
        <div style={{ background: message.toLowerCase().includes('erro') ? 'rgba(248,113,113,0.1)' : 'rgba(74,222,128,0.1)', border: `1px solid ${message.toLowerCase().includes('erro') ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.3)'}`, borderRadius: 12, padding: '10px 16px', marginBottom: 16, color: message.toLowerCase().includes('erro') ? '#f87171' : '#4ade80', fontSize: 13 }}>
          {message}
        </div>
      )}

      {/* ═══ TAB: DASH ═══ */}
      {activeTab === 'dash' && (
        <div style={{ display: 'grid', gap: 20 }}>
          {/* Gráfico 7 dias */}
          <div style={card}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#c49b63' }}>📈 Últimos 7 dias</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
              {report.last7.map((d) => {
                const h = Math.max(4, (d.revenue / maxRevenue) * 100);
                const isToday = d.date === todayIso();
                return (
                  <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: 9, color: '#c49b63', fontWeight: 700, textAlign: 'center' }}>{d.revenue > 0 ? `R$${Math.round(d.revenue)}` : ''}</div>
                    <div style={{ width: '100%', height: `${h}%`, background: isToday ? 'linear-gradient(180deg,#c49b63,#a07840)' : 'rgba(196,155,99,0.3)', borderRadius: '6px 6px 0 0', minHeight: 4, transition: 'height 0.4s' }} />
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' as const }}>{d.date.slice(8)}/{d.date.slice(5, 7)}</div>
                    {d.count > 0 && <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>{d.count}x</div>}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Top serviços */}
            <div style={card}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>🏆 Top serviços</h3>
              {report.topServices.length === 0
                ? <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Sem dados ainda.</p>
                : report.topServices.map(([name, s], i) => (
                  <div key={name} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>#{i + 1} {name}</span>
                      <span style={{ color: '#c49b63', fontWeight: 700 }}>{s.count}x</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 99 }}>
                      <div style={{ height: '100%', width: `${(s.count / (report.topServices[0]?.[1].count || 1)) * 100}%`, background: 'linear-gradient(90deg,#c49b63,#a07840)', borderRadius: 99 }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{fmtMoney(s.revenue)}</div>
                  </div>
                ))
              }
            </div>

            {/* Próximos hoje */}
            <div style={card}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>🕐 Próximos hoje</h3>
              {liveBookings.filter((b) => b.booking_date === todayIso() && b.status === 'confirmed').length === 0
                ? <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Nenhum agendamento hoje.</p>
                : liveBookings.filter((b) => b.booking_date === todayIso() && b.status === 'confirmed').sort((a, b) => a.start_time.localeCompare(b.start_time)).slice(0, 5).map((b) => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '8px 12px' }}>
                    <span style={{ background: 'linear-gradient(135deg,#c49b63,#a07840)', color: '#0a0a0a', borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' as const }}>{fmtTime(b.start_time)}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{b.customer_name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{b.service_name}</div>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB: AGENDA ═══ */}
      {activeTab === 'agenda' && (
        <div style={{ display: 'grid', gap: 16 }}>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, alignItems: 'center' }}>
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="field" style={{ width: 'auto', flex: '0 0 auto' }} />
            <input placeholder="🔍 Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="field" style={{ flex: 1, minWidth: 160 }} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="field" style={{ width: 'auto' }}>
              <option value="all">Todos status</option>
              <option value="confirmed">Confirmados</option>
              <option value="completed">Concluídos</option>
              <option value="cancelled">Cancelados</option>
              <option value="pending">Pendentes</option>
            </select>
          </div>

          {/* Lista */}
          {filteredBookings.length === 0
            ? <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 32, textAlign: 'center' as const, color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>Nenhum agendamento encontrado.</div>
            : filteredBookings.map((b) => (
              <div key={b.id} style={{ background: 'linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' as const, borderLeft: `3px solid ${statusColor(b.status)}` }}>
                <div style={{ background: 'linear-gradient(135deg,#c49b63,#a07840)', color: '#0a0a0a', borderRadius: 10, padding: '6px 12px', fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
                  #{b.daily_order_number} · {fmtTime(b.start_time)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{b.customer_name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{fmtDate(b.booking_date)} · {b.service_name}{b.price ? ` · ${fmtMoney(b.price)}` : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: `${statusColor(b.status)}22`, color: statusColor(b.status), border: `1px solid ${statusColor(b.status)}44` }}>
                    {statusLabel(b.status)}
                  </span>
                  {b.status !== 'cancelled' && b.status !== 'completed' && (
                    <>
                      <button style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }} disabled={loading} onClick={() => confirm('Cancelar este agendamento?') && patchBooking(b.id, { action: 'cancel' })}>Cancelar</button>
                      <button style={{ background: 'linear-gradient(135deg,#c49b63,#a07840)', border: 'none', color: '#0a0a0a', borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }} disabled={loading} onClick={() => { const nd = window.prompt('Nova data (AAAA-MM-DD):', b.booking_date); const nt = window.prompt('Novo horário (HH:MM):', b.start_time); if (nd && nt) patchBooking(b.id, { action: 'reschedule', booking_date: nd, start_time: nt }); }}>Remarcar</button>
                    </>
                  )}
                </div>
              </div>
            ))
          }

          {/* Bloquear horários */}
          <div style={card}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>🚫 Fechar horários</h3>
            <form onSubmit={createBlock} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Data</label>
                <input className="field" type="date" name="block_date" required />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Início</label>
                <input className="field" type="time" name="start_time" required />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Fim</label>
                <input className="field" type="time" name="end_time" required />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Motivo</label>
                <input className="field" name="reason" placeholder="Ex: Folga, compromisso..." />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <button className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>{loading ? 'Salvando...' : 'Salvar bloqueio'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ TAB: RELATÓRIO ═══ */}
      {activeTab === 'relatorio' && (
        <div style={{ display: 'grid', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
            {[
              { label: 'Total confirmados', value: report.confirmed, color: '#4ade80', icon: '✅' },
              { label: 'Cancelamentos', value: report.cancelled, color: '#f87171', icon: '❌' },
              { label: 'Taxa de conclusão', value: report.confirmed + report.cancelled > 0 ? `${Math.round((report.confirmed / (report.confirmed + report.cancelled)) * 100)}%` : '—', color: '#c49b63', icon: '📊' },
              { label: 'Faturamento total', value: fmtMoney(report.revenue), color: '#c49b63', icon: '💰' },
              { label: 'Agendamentos hoje', value: report.todayBookings, color: '#60a5fa', icon: '📅' },
              { label: 'Receita hoje', value: fmtMoney(report.todayRevenue), color: '#60a5fa', icon: '💵' },
            ].map((item) => (
              <div key={item.label} style={{ background: 'linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: '16px 20px' }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>{item.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: item.color }}>{item.value}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{item.label}</div>
              </div>
            ))}
          </div>

          <div style={card}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>🏆 Desempenho por serviço</h3>
            {report.topServices.length === 0
              ? <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Nenhum dado disponível.</p>
              : <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {['Serviço', 'Qtd', 'Receita', 'Participação'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {report.topServices.map(([name, s]) => (
                      <tr key={name} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '12px', fontWeight: 600 }}>{name}</td>
                        <td style={{ padding: '12px', color: '#c49b63', fontWeight: 700 }}>{s.count}x</td>
                        <td style={{ padding: '12px', color: '#4ade80', fontWeight: 700 }}>{fmtMoney(s.revenue)}</td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 99, minWidth: 80 }}>
                            <div style={{ height: '100%', width: `${(s.count / (report.topServices[0]?.[1].count || 1)) * 100}%`, background: 'linear-gradient(90deg,#c49b63,#a07840)', borderRadius: 99 }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          </div>

          <div style={card}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>📆 Últimos 7 dias</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {['Data', 'Agendamentos', 'Receita'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {report.last7.map((d) => (
                    <tr key={d.date} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: d.date === todayIso() ? 'rgba(196,155,99,0.06)' : undefined }}>
                      <td style={{ padding: '10px 12px', fontWeight: d.date === todayIso() ? 700 : 400 }}>{fmtDate(d.date)}{d.date === todayIso() ? ' 👈' : ''}</td>
                      <td style={{ padding: '10px 12px', color: '#c49b63', fontWeight: 700 }}>{d.count}</td>
                      <td style={{ padding: '10px 12px', color: '#4ade80', fontWeight: 700 }}>{fmtMoney(d.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB: PERFIL ═══ */}
      {activeTab === 'perfil' && (
        <div style={card}>
          <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>👤 Meu perfil</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(196,155,99,0.5)', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, flexShrink: 0 }}>
              {photoPreview ? <img src={photoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '✂️'}
            </div>
            <div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
              <button onClick={() => fileRef.current?.click()} style={{ background: 'rgba(196,155,99,0.15)', border: '1px solid rgba(196,155,99,0.35)', color: '#c49b63', borderRadius: 12, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>📷 Trocar foto</button>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '6px 0 0' }}>JPG ou PNG, máx. 2MB</p>
            </div>
          </div>
          <form onSubmit={updateProfile} style={{ display: 'grid', gap: 14 }}>
            {[
              { label: 'Nome *', name: 'name', value: professional.name, ph: '' },
              { label: 'Especialidade', name: 'specialty', value: professional.specialty || '', ph: 'Ex: Degradê, Navalhado...' },
              { label: 'WhatsApp', name: 'whatsapp_number', value: professional.whatsapp_number || '', ph: 'Ex: 5588999999999' },
            ].map((f) => (
              <div key={f.name}>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>{f.label}</label>
                <input className="field" name={f.name} defaultValue={f.value} placeholder={f.ph} />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Bio</label>
              <textarea className="field" name="description" defaultValue={professional.description || ''} placeholder="Conte um pouco sobre você..." rows={3} />
            </div>
            <button className="btn btn-primary" disabled={loading} style={{ width: '100%', marginTop: 4 }}>{loading ? 'Salvando...' : 'Salvar perfil'}</button>
          </form>
        </div>
      )}

      {/* ═══ TAB: SHOPPING ═══ */}
      {activeTab === 'shopping' && (
        <BarberProductsPanel barbershopId={barbershopId} professionalId={professional.id} title="Meus Produtos" />
      )}
    </div>
  );
}
