'use client';

import { useEffect, useMemo, useState } from 'react';

type Profile = {
  id: string;
  name: string | null;
  email: string;
  role: 'admin' | 'shop_manager' | 'shop_barber';
  barbershop_id: string | null;
  professional_id: string | null;
};

type Barbershop = {
  id: string;
  name: string;
  slug: string;
};

type Professional = {
  id: string;
  name: string;
};

type Service = {
  id: string;
  barbershop_id: string;
  name: string;
  description?: string | null;
  price: number;
  duration_minutes: number;
  is_active?: boolean | null;
};

type Booking = {
  id: string;
  daily_order_number?: number | null;
  customer_name: string;
  customer_whatsapp?: string | null;
  booking_date: string;
  start_time: string;
  end_time?: string | null;
  status: string;
  service_name?: string | null;
  service_id?: string | null;
  service?: {
    id: string;
    name: string;
    duration_minutes?: number | null;
  } | null;
  professional_id: string;
  professional?: {
    id: string;
    name: string;
  } | null;
  price?: number | null;
};

type WorkingHour = {
  id: string;
  professional_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  slot_interval_minutes?: number | null;
  is_active?: boolean | null;
};

const weekdayLabels = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

function formatMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));
}

function formatDate(value: string) {
  if (!value) return '-';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysIso(baseIso: string, days: number) {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function bookingMatchesProfile(profile: Profile, booking: Booking) {
  if (profile.role === 'admin') return true;
  if (profile.role === 'shop_manager') return true;
  if (profile.role === 'shop_barber') {
    return booking.professional_id === profile.professional_id;
  }
  return false;
}

function getBookingServiceId(booking: Booking) {
  return booking.service?.id || booking.service_id || '';
}

export function ShopDashboard({
  profile,
  barbershop,
  professionals,
  bookings,
  workingHours = [],
  services = [],
}: {
  profile: Profile;
  barbershop: Barbershop;
  professionals: Professional[];
  bookings: Booking[];
  workingHours?: WorkingHour[];
  services?: Service[];
}) {
  const [message, setMessage] = useState('');

  const [items, setItems] = useState<Booking[]>(bookings);
  const [hoursItems, setHoursItems] = useState<WorkingHour[]>(workingHours);
  const [serviceItems, setServiceItems] = useState<Service[]>(services);

  const [loadingBookingId, setLoadingBookingId] = useState<string | null>(null);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);

  const [cancelModalBooking, setCancelModalBooking] = useState<Booking | null>(null);
  const [cancelReason, setCancelReason] = useState('Cancelado pela barbearia');

  const [rescheduleOpenId, setRescheduleOpenId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleTimes, setRescheduleTimes] = useState<string[]>([]);
  const [loadingRescheduleTimes, setLoadingRescheduleTimes] = useState(false);

  const [hoursLoading, setHoursLoading] = useState(false);
  const [hoursForm, setHoursForm] = useState({
    professional_id:
      profile.role === 'shop_barber' ? profile.professional_id || '' : professionals[0]?.id || '',
    weekday: '1',
    start_time: '08:00',
    end_time: '18:00',
    slot_interval_minutes: '30',
    is_active: true,
  });

  const [serviceForm, setServiceForm] = useState({
    name: '',
    description: '',
    price: '',
    duration_minutes: '30',
    is_active: true,
  });

  const [agendaFilter, setAgendaFilter] = useState<'today' | 'tomorrow' | 'custom'>('today');
  const [customDate, setCustomDate] = useState(todayIso());

  useEffect(() => {
    setItems(bookings);
  }, [bookings]);

  useEffect(() => {
    setHoursItems(workingHours);
  }, [workingHours]);

  useEffect(() => {
    setServiceItems(services);
  }, [services]);

  useEffect(() => {
    if (profile.role === 'shop_barber' && profile.professional_id) {
      setHoursForm((prev) => ({
        ...prev,
        professional_id: profile.professional_id!,
      }));
    }
  }, [profile]);

  const visibleBookingsBase = useMemo(() => {
    return items
      .filter((booking) => bookingMatchesProfile(profile, booking))
      .sort((a, b) => {
        const aKey = `${a.booking_date} ${a.start_time}`;
        const bKey = `${b.booking_date} ${b.start_time}`;
        return aKey.localeCompare(bKey);
      });
  }, [items, profile]);

  const today = todayIso();
  const tomorrow = addDaysIso(today, 1);

  const selectedAgendaDate = useMemo(() => {
    if (agendaFilter === 'today') return today;
    if (agendaFilter === 'tomorrow') return tomorrow;
    return customDate;
  }, [agendaFilter, customDate, today, tomorrow]);

  const visibleBookings = useMemo(() => {
    return visibleBookingsBase.filter((booking) => booking.booking_date === selectedAgendaDate);
  }, [visibleBookingsBase, selectedAgendaDate]);

  const totalClients = useMemo(() => {
    return new Set(visibleBookingsBase.map((item) => item.customer_whatsapp || item.customer_name))
      .size;
  }, [visibleBookingsBase]);

  const totalRevenue = useMemo(() => {
    return visibleBookingsBase
      .filter((item) => item.status !== 'cancelled')
      .reduce((sum, item) => sum + Number(item.price || 0), 0);
  }, [visibleBookingsBase]);

  const canManageBooking = (booking: Booking) => {
    if (profile.role === 'admin') return true;
    if (profile.role === 'shop_manager') return true;
    if (profile.role === 'shop_barber') return booking.professional_id === profile.professional_id;
    return false;
  };

  function updateBookingInState(bookingId: string, updater: (current: Booking) => Booking) {
    setItems((current) =>
      current.map((item) => (item.id === bookingId ? updater(item) : item))
    );
  }

  function resetServiceForm() {
    setEditingServiceId(null);
    setServiceForm({
      name: '',
      description: '',
      price: '',
      duration_minutes: '30',
      is_active: true,
    });
  }

  function editService(service: Service) {
    setEditingServiceId(service.id);
    setServiceForm({
      name: service.name || '',
      description: service.description || '',
      price: String(Number(service.price || 0)).replace('.', ','),
      duration_minutes: String(service.duration_minutes || 30),
      is_active: service.is_active !== false,
    });
    setMessage('');
  }

  async function saveService(e: React.FormEvent) {
    e.preventDefault();
    setServicesLoading(true);
    setMessage('');

    try {
      const payload = {
        id: editingServiceId || undefined,
        barbershop_id: barbershop.id,
        name: serviceForm.name,
        description: serviceForm.description,
        price: serviceForm.price,
        duration_minutes: Number(serviceForm.duration_minutes || 0),
        is_active: serviceForm.is_active,
      };

      const res = await fetch('/api/admin/services', {
        method: editingServiceId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || 'Erro ao salvar serviço.');
        setServicesLoading(false);
        return;
      }

      const saved: Service | undefined = data.service;
      if (saved) {
        setServiceItems((current) => {
          const exists = current.some((item) => item.id === saved.id);
          if (exists) {
            return current.map((item) => (item.id === saved.id ? saved : item));
          }
          return [...current, saved];
        });
      }

      setMessage(data.message || 'Serviço salvo com sucesso.');
      resetServiceForm();
    } catch {
      setMessage('Erro ao salvar serviço.');
    } finally {
      setServicesLoading(false);
    }
  }

  async function removeService(service: Service) {
    const confirmed = window.confirm(
      `Excluir o serviço \"${service.name}\"? Se ele já tiver agendamentos, o sistema vai impedir a exclusão.`
    );

    if (!confirmed) return;

    setServicesLoading(true);
    setMessage('');

    try {
      const res = await fetch('/api/admin/services', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: service.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || 'Erro ao excluir serviço.');
        setServicesLoading(false);
        return;
      }

      setServiceItems((current) => current.filter((item) => item.id !== service.id));
      if (editingServiceId === service.id) {
        resetServiceForm();
      }
      setMessage(data.message || 'Serviço excluído com sucesso.');
    } catch {
      setMessage('Erro ao excluir serviço.');
    } finally {
      setServicesLoading(false);
    }
  }

  async function confirmCancelBooking() {
    if (!cancelModalBooking) return;

    const bookingId = cancelModalBooking.id;
    setLoadingBookingId(bookingId);
    setMessage('');

    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel',
          reason: cancelReason.trim() || 'Cancelado pela barbearia',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || 'Erro ao cancelar agendamento.');
        setLoadingBookingId(null);
        return;
      }

      updateBookingInState(bookingId, (item) => ({
        ...item,
        status: 'cancelled',
      }));

      setCancelModalBooking(null);
      setCancelReason('Cancelado pela barbearia');
      setMessage(data.message || 'Agendamento cancelado com sucesso.');
    } catch {
      setMessage('Erro ao cancelar agendamento.');
    } finally {
      setLoadingBookingId(null);
    }
  }

  function openReschedule(booking: Booking) {
    setRescheduleOpenId(booking.id);
    setRescheduleDate(booking.booking_date || '');
    setRescheduleTime('');
    setRescheduleTimes([]);
    setMessage('');
  }

  function closeReschedule() {
    setRescheduleOpenId(null);
    setRescheduleDate('');
    setRescheduleTime('');
    setRescheduleTimes([]);
    setLoadingRescheduleTimes(false);
  }

  useEffect(() => {
    async function loadAvailableRescheduleTimes() {
      if (!rescheduleOpenId || !rescheduleDate) {
        setRescheduleTimes([]);
        return;
      }

      const booking = items.find((item) => item.id === rescheduleOpenId);
      if (!booking) {
        setRescheduleTimes([]);
        return;
      }

      const serviceId = getBookingServiceId(booking);
      if (!serviceId || !booking.professional_id) {
        setRescheduleTimes([]);
        return;
      }

      setLoadingRescheduleTimes(true);

      try {
        const params = new URLSearchParams({
          service_id: serviceId,
          professional_id: booking.professional_id,
          booking_date: rescheduleDate,
        });

        const res = await fetch(`/api/available-times?${params.toString()}`, {
          method: 'GET',
          cache: 'no-store',
        });

        const data = await res.json();

        if (!res.ok) {
          setRescheduleTimes([]);
          return;
        }

        let times = Array.isArray(data.times) ? data.times : [];

        if (rescheduleDate === booking.booking_date && booking.start_time) {
          if (!times.includes(booking.start_time)) {
            times = [...times, booking.start_time].sort();
          }
        }

        setRescheduleTimes(times);
      } catch {
        setRescheduleTimes([]);
      } finally {
        setLoadingRescheduleTimes(false);
      }
    }

    loadAvailableRescheduleTimes();
  }, [items, rescheduleOpenId, rescheduleDate]);

  async function saveReschedule(bookingId: string) {
    if (!rescheduleDate || !rescheduleTime) {
      setMessage('Informe a nova data e o novo horário.');
      return;
    }

    setLoadingBookingId(bookingId);
    setMessage('');

    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reschedule',
          booking_date: rescheduleDate,
          start_time: rescheduleTime,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || 'Erro ao remarcar agendamento.');
        setLoadingBookingId(null);
        return;
      }

      updateBookingInState(bookingId, (item) => ({
        ...item,
        booking_date: rescheduleDate,
        start_time: rescheduleTime,
        status: 'confirmed',
      }));

      closeReschedule();
      setMessage(data.message || 'Agendamento remarcado com sucesso.');
    } catch {
      setMessage('Erro ao remarcar agendamento.');
    } finally {
      setLoadingBookingId(null);
    }
  }

  async function saveWorkingHours(e: React.FormEvent) {
    e.preventDefault();
    setHoursLoading(true);
    setMessage('');

    try {
      const res = await fetch('/api/admin/working-hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          professional_id: hoursForm.professional_id,
          weekday: Number(hoursForm.weekday),
          start_time: hoursForm.start_time,
          end_time: hoursForm.end_time,
          slot_interval_minutes: Number(hoursForm.slot_interval_minutes || 30),
          is_active: hoursForm.is_active,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || 'Erro ao salvar horário.');
        setHoursLoading(false);
        return;
      }

      const saved: WorkingHour | undefined = data.working_hour;

      if (saved) {
        setHoursItems((current) => {
          const exists = current.some(
            (item) =>
              item.professional_id === saved.professional_id && item.weekday === saved.weekday
          );

          if (exists) {
            return current
              .map((item) =>
                item.professional_id === saved.professional_id && item.weekday === saved.weekday
                  ? saved
                  : item
              )
              .sort((a, b) => a.weekday - b.weekday);
          }

          return [...current, saved].sort((a, b) => a.weekday - b.weekday);
        });
      }

      setMessage(data.message || 'Horário salvo com sucesso.');
    } catch {
      setMessage('Erro ao salvar horário.');
    } finally {
      setHoursLoading(false);
    }
  }

  const visibleHours = useMemo(() => {
    const list =
      profile.role === 'shop_barber'
        ? hoursItems.filter((item) => item.professional_id === profile.professional_id)
        : hoursItems;

    return [...list].sort((a, b) => {
      if (a.professional_id === b.professional_id) return a.weekday - b.weekday;
      return a.professional_id.localeCompare(b.professional_id);
    });
  }, [hoursItems, profile]);

  const visibleServices = useMemo(() => {
    return [...serviceItems].sort((a, b) => a.name.localeCompare(b.name));
  }, [serviceItems]);

  function getProfessionalName(professionalId: string) {
    return professionals.find((p) => p.id === professionalId)?.name || 'Barbeiro';
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="panel p-5">
          <div className="text-sm text-white/70">Clientes</div>
          <div className="mt-2 text-4xl font-bold">{totalClients}</div>
        </div>

        <div className="panel p-5">
          <div className="text-sm text-white/70">Financeiro</div>
          <div className="mt-2 text-4xl font-bold">{formatMoney(totalRevenue)}</div>
        </div>

        <div className="panel p-5">
          <div className="text-sm text-white/70">Agendamentos</div>
          <div className="mt-2 text-4xl font-bold">{visibleBookingsBase.length}</div>
        </div>
      </div>

      <section className="panel p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold uppercase">{barbershop.name}</h2>
            <p className="mt-1 text-white/70">
              {profile.role === 'shop_barber'
                ? 'Painel do barbeiro dentro da barbearia.'
                : 'Painel da barbearia.'}
            </p>
          </div>

          <a href={`/${barbershop.slug}`} target="_blank" rel="noreferrer" className="btn btn-dark">
            Abrir site público
          </a>
        </div>

        <div className="mb-5 flex flex-wrap gap-3">
          <button
            type="button"
            className={`btn ${agendaFilter === 'today' ? 'btn-primary' : 'btn-dark'}`}
            onClick={() => setAgendaFilter('today')}
          >
            Agendamentos de hoje
          </button>

          <button
            type="button"
            className={`btn ${agendaFilter === 'tomorrow' ? 'btn-primary' : 'btn-dark'}`}
            onClick={() => setAgendaFilter('tomorrow')}
          >
            Agendamentos de amanhã
          </button>

          <button
            type="button"
            className={`btn ${agendaFilter === 'custom' ? 'btn-primary' : 'btn-dark'}`}
            onClick={() => setAgendaFilter('custom')}
          >
            Escolher data
          </button>

          {agendaFilter === 'custom' ? (
            <input
              type="date"
              className="field max-w-[220px]"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
            />
          ) : null}
        </div>

        <p className="mb-4 text-white/70">
          Mostrando agendamentos de: <strong>{formatDate(selectedAgendaDate)}</strong>
        </p>

        {message ? (
          <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
            {message}
          </div>
        ) : null}

        {visibleBookings.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-black/30 p-5 text-white/70">
            Nenhum agendamento encontrado para esta data.
          </div>
        ) : (
          <div className="space-y-4">
            {visibleBookings.map((booking) => {
              const isLoading = loadingBookingId === booking.id;
              const isCancelled = booking.status === 'cancelled';

              return (
                <div key={booking.id} className="rounded-3xl border border-white/10 bg-black/30 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-lg font-semibold">
                        #{booking.daily_order_number || '-'} • {booking.customer_name}
                      </div>
                      <div className="text-sm text-white/70">
                        {formatDate(booking.booking_date)} às {booking.start_time}
                        {booking.end_time ? ` até ${booking.end_time}` : ''}
                      </div>
                      <div className="text-sm text-white/70">
                        Serviço: {booking.service_name || booking.service?.name || '-'}
                      </div>
                      <div className="text-sm text-white/70">
                        Profissional: {booking.professional?.name || getProfessionalName(booking.professional_id)}
                      </div>
                      <div className="text-sm text-white/70">
                        Valor: {formatMoney(Number(booking.price || 0))}
                      </div>
                      <div className="text-sm text-white/70">Status: {booking.status}</div>
                    </div>

                    {canManageBooking(booking) ? (
                      <div className="flex flex-wrap gap-2">
                        {!isCancelled ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-dark"
                              onClick={() => openReschedule(booking)}
                              disabled={isLoading}
                            >
                              Remarcar
                            </button>

                            <button
                              type="button"
                              className="btn btn-danger"
                              onClick={() => {
                                setCancelModalBooking(booking);
                                setMessage('');
                              }}
                              disabled={isLoading}
                            >
                              Cancelar
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {rescheduleOpenId === booking.id && !isCancelled ? (
                    <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="grid gap-3 md:grid-cols-3">
                        <div>
                          <label className="mb-2 block text-sm text-white/70">Nova data</label>
                          <input
                            type="date"
                            className="field"
                            value={rescheduleDate}
                            onChange={(e) => setRescheduleDate(e.target.value)}
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm text-white/70">Novo horário</label>
                          <select
                            className="field"
                            value={rescheduleTime}
                            onChange={(e) => setRescheduleTime(e.target.value)}
                            disabled={!rescheduleDate || loadingRescheduleTimes}
                          >
                            <option value="">
                              {loadingRescheduleTimes
                                ? 'Carregando horários...'
                                : rescheduleTimes.length
                                  ? 'Selecione um horário'
                                  : 'Nenhum horário disponível'}
                            </option>

                            {rescheduleTimes.map((time) => (
                              <option key={time} value={time}>
                                {time}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-end gap-2">
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => saveReschedule(booking.id)}
                            disabled={isLoading || !rescheduleDate || !rescheduleTime}
                          >
                            Salvar remarcação
                          </button>

                          <button
                            type="button"
                            className="btn btn-dark"
                            onClick={closeReschedule}
                            disabled={isLoading}
                          >
                            Fechar
                          </button>
                        </div>
                      </div>

                      {rescheduleDate ? (
                        <p className="mt-3 text-sm text-white/70">
                          Data escolhida: {formatDate(rescheduleDate)}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="panel p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-2xl font-bold">Serviços</h3>
              <p className="mt-1 text-sm text-white/70">
                {profile.role === 'shop_barber'
                  ? 'Aqui você pode adicionar, editar, desativar ou excluir serviços da sua barbearia.'
                  : 'Gerencie os serviços disponíveis na barbearia.'}
              </p>
            </div>

            {editingServiceId ? (
              <button type="button" className="btn btn-dark" onClick={resetServiceForm}>
                Novo serviço
              </button>
            ) : null}
          </div>

          <form className="mt-5 space-y-4" onSubmit={saveService}>
            <div>
              <label className="mb-2 block text-sm text-white/70">Nome do serviço</label>
              <input
                className="field"
                value={serviceForm.name}
                onChange={(e) => setServiceForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Corte degradê"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/70">Descrição</label>
              <textarea
                className="field min-h-[100px]"
                value={serviceForm.description}
                onChange={(e) =>
                  setServiceForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Detalhes do serviço"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-white/70">Valor</label>
                <input
                  className="field"
                  value={serviceForm.price}
                  onChange={(e) => setServiceForm((prev) => ({ ...prev, price: e.target.value }))}
                  placeholder="Ex: 35,00"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-white/70">Duração (minutos)</label>
                <input
                  type="number"
                  min={5}
                  step={5}
                  className="field"
                  value={serviceForm.duration_minutes}
                  onChange={(e) =>
                    setServiceForm((prev) => ({ ...prev, duration_minutes: e.target.value }))
                  }
                  required
                />
              </div>
            </div>

            <label className="flex items-center gap-3 text-sm text-white/80">
              <input
                type="checkbox"
                checked={serviceForm.is_active}
                onChange={(e) =>
                  setServiceForm((prev) => ({ ...prev, is_active: e.target.checked }))
                }
              />
              Serviço ativo para novos agendamentos
            </label>

            <div className="flex flex-wrap gap-3">
              <button type="submit" className="btn btn-primary" disabled={servicesLoading}>
                {servicesLoading
                  ? 'Salvando...'
                  : editingServiceId
                    ? 'Salvar alterações'
                    : 'Adicionar serviço'}
              </button>

              {editingServiceId ? (
                <button
                  type="button"
                  className="btn btn-dark"
                  onClick={resetServiceForm}
                  disabled={servicesLoading}
                >
                  Cancelar edição
                </button>
              ) : null}
            </div>
          </form>
        </div>

        <div className="panel p-6">
          <h3 className="text-2xl font-bold">Serviços cadastrados</h3>

          <div className="mt-5 space-y-3">
            {visibleServices.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-white/70">
                Nenhum serviço cadastrado ainda.
              </div>
            ) : (
              visibleServices.map((service) => (
                <div key={service.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-semibold">{service.name}</div>
                      <div className="text-sm text-white/70">
                        Valor: {formatMoney(Number(service.price || 0))}
                      </div>
                      <div className="text-sm text-white/70">
                        Duração: {service.duration_minutes || 0} min
                      </div>
                      <div className="text-sm text-white/70">
                        Status: {service.is_active === false ? 'Inativo' : 'Ativo'}
                      </div>
                      {service.description ? (
                        <div className="text-sm text-white/60">{service.description}</div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-dark"
                        onClick={() => editService(service)}
                        disabled={servicesLoading}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => removeService(service)}
                        disabled={servicesLoading}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="panel p-6">
          <h3 className="text-2xl font-bold">Meus dias e horários</h3>
          <form className="mt-5 space-y-4" onSubmit={saveWorkingHours}>
            {profile.role !== 'shop_barber' ? (
              <div>
                <label className="mb-2 block text-sm text-white/70">Barbeiro</label>
                <select
                  className="field"
                  value={hoursForm.professional_id}
                  onChange={(e) =>
                    setHoursForm((prev) => ({
                      ...prev,
                      professional_id: e.target.value,
                    }))
                  }
                >
                  {professionals.map((professional) => (
                    <option key={professional.id} value={professional.id}>
                      {professional.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <label className="mb-2 block text-sm text-white/70">Dia da semana</label>
              <select
                className="field"
                value={hoursForm.weekday}
                onChange={(e) =>
                  setHoursForm((prev) => ({
                    ...prev,
                    weekday: e.target.value,
                  }))
                }
              >
                {weekdayLabels.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-white/70">Início</label>
                <input
                  type="time"
                  className="field"
                  value={hoursForm.start_time}
                  onChange={(e) =>
                    setHoursForm((prev) => ({
                      ...prev,
                      start_time: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-white/70">Fim</label>
                <input
                  type="time"
                  className="field"
                  value={hoursForm.end_time}
                  onChange={(e) =>
                    setHoursForm((prev) => ({
                      ...prev,
                      end_time: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/70">Intervalo dos slots (minutos)</label>
              <input
                type="number"
                min={5}
                step={5}
                className="field"
                value={hoursForm.slot_interval_minutes}
                onChange={(e) =>
                  setHoursForm((prev) => ({
                    ...prev,
                    slot_interval_minutes: e.target.value,
                  }))
                }
              />
            </div>

            <label className="flex items-center gap-3 text-sm text-white/80">
              <input
                type="checkbox"
                checked={hoursForm.is_active}
                onChange={(e) =>
                  setHoursForm((prev) => ({
                    ...prev,
                    is_active: e.target.checked,
                  }))
                }
              />
              Horário ativo
            </label>

            <button type="submit" className="btn btn-primary" disabled={hoursLoading}>
              {hoursLoading ? 'Salvando...' : 'Salvar horário'}
            </button>
          </form>
        </div>

        <div className="panel p-6">
          <h3 className="text-2xl font-bold">Horários cadastrados</h3>

          <div className="mt-5 space-y-3">
            {visibleHours.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-white/70">
                Nenhum horário cadastrado ainda.
              </div>
            ) : (
              visibleHours.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="font-semibold">
                    {getProfessionalName(item.professional_id)} — {weekdayLabels[item.weekday]}
                  </div>
                  <div className="mt-1 text-sm text-white/70">
                    {item.start_time} até {item.end_time}
                  </div>
                  <div className="mt-1 text-sm text-white/70">
                    Intervalo: {item.slot_interval_minutes || 30} min
                  </div>
                  <div className="mt-1 text-sm text-white/70">
                    Status: {item.is_active === false ? 'Inativo' : 'Ativo'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {cancelModalBooking ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-zinc-950 p-6">
            <h3 className="text-2xl font-bold">Cancelar agendamento</h3>
            <p className="mt-2 text-sm text-white/70">
              Cliente: {cancelModalBooking.customer_name}
            </p>
            <p className="text-sm text-white/70">
              Horário: {formatDate(cancelModalBooking.booking_date)} às {cancelModalBooking.start_time}
            </p>

            <div className="mt-4">
              <label className="mb-2 block text-sm text-white/70">Motivo</label>
              <textarea
                className="field min-h-[110px]"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                className="btn btn-dark"
                onClick={() => {
                  setCancelModalBooking(null);
                  setCancelReason('Cancelado pela barbearia');
                }}
              >
                Fechar
              </button>

              <button
                type="button"
                className="btn btn-danger"
                onClick={confirmCancelBooking}
                disabled={loadingBookingId === cancelModalBooking.id}
              >
                {loadingBookingId === cancelModalBooking.id ? 'Cancelando...' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
