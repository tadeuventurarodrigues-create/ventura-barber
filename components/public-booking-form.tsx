'use client';

import { useEffect, useMemo, useState } from 'react';

type Service = {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
};

type Professional = {
  id: string;
  name: string;
};

type CustomerLookupResponse = {
  found: boolean;
  customer?: {
    id: string;
    name: string;
    whatsapp_number: string | null;
    phone: string | null;
    total_bookings: number | null;
    last_booking_at: string | null;
  } | null;
};

type DateMode = 'today' | 'tomorrow' | 'custom';

type Props = {
  barbershopId: string;
  barbershopName: string;
  services: Service[];
  professionals: Professional[];
  loyaltyEnabled?: boolean;
  loyaltyRules?: string | null;
};

function onlyDigits(value: string) {
  return String(value || '').replace(/\D/g, '');
}

function isValidBrazilWhatsapp11Digits(value: string) {
  const digits = onlyDigits(value);

  if (digits.length !== 11) return false;

  const thirdDigit = digits.charAt(2);
  return thirdDigit === '9';
}

function formatWhatsappInput(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

// Usa o mesmo fuso do servidor (America/Fortaleza) para evitar divergencia de data
// entre o frontend (fuso do navegador do cliente) e o backend.
const APP_TIMEZONE_CLIENT = 'America/Fortaleza';

function getLocalIsoDate(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE_CLIENT,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function addDaysToIsoDate(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const dt = new Date(year, month - 1, day);
  dt.setDate(dt.getDate() + days);
  return getLocalIsoDate(dt);
}

function formatDateModeLabel(mode: DateMode) {
  if (mode === 'today') return 'Hoje';
  if (mode === 'tomorrow') return 'Amanhã';
  return 'Data escolhida';
}

export function PublicBookingForm({
  barbershopId,
  barbershopName,
  services,
  professionals,
  loyaltyEnabled,
  loyaltyRules,
}: Props) {
  // Recalcula a data atual a cada minuto para não congelar quando a página
  // fica aberta durante a virada do dia (ex: aberta às 23:59).
  const [todayIso, setTodayIso] = useState(() => getLocalIsoDate());
  const tomorrowIso = useMemo(() => addDaysToIsoDate(todayIso, 1), [todayIso]);
  const maxBookingDate = useMemo(() => addDaysToIsoDate(todayIso, 6), [todayIso]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTodayIso(getLocalIsoDate());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const [serviceId, setServiceId] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [dateMode, setDateMode] = useState<DateMode>('today');
  const [bookingDate, setBookingDate] = useState(todayIso);
  const [startTime, setStartTime] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [phoneStepUnlocked, setPhoneStepUnlocked] = useState(false);
  const [customerFound, setCustomerFound] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMessage, setLookupMessage] = useState('');
  const [times, setTimes] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedService = useMemo(
    () => services.find((item) => item.id === serviceId),
    [serviceId, services]
  );

  const whatsappDigits = useMemo(() => onlyDigits(customerWhatsapp), [customerWhatsapp]);
  const whatsappIsValid = useMemo(
    () => isValidBrazilWhatsapp11Digits(customerWhatsapp),
    [customerWhatsapp]
  );

  useEffect(() => {
    if (!phoneStepUnlocked) return;

    if (dateMode === 'today') {
      if (bookingDate !== todayIso) {
        setBookingDate(todayIso);
        setStartTime('');
      }
      return;
    }

    if (dateMode === 'tomorrow') {
      if (bookingDate !== tomorrowIso) {
        setBookingDate(tomorrowIso);
        setStartTime('');
      }
      return;
    }

    if (!bookingDate) {
      setBookingDate(todayIso);
    }
  }, [dateMode, phoneStepUnlocked, bookingDate, todayIso, tomorrowIso]);

  useEffect(() => {
    async function loadTimes() {
      if (!phoneStepUnlocked || !serviceId || !professionalId || !bookingDate) {
        setTimes([]);
        setStartTime('');
        return;
      }

      setLoadingTimes(true);
      setMessage('');

      try {
        const params = new URLSearchParams({
          service_id: serviceId,
          professional_id: professionalId,
          booking_date: bookingDate,
        });

        const res = await fetch(`/api/available-times?${params.toString()}`, {
          cache: 'no-store',
        });
        const data = await res.json();

        const receivedTimes = Array.isArray(data.times) ? data.times : [];
        setTimes(receivedTimes);
        setStartTime((current) => (receivedTimes.includes(current) ? current : ''));
        // Mostra erro vindo da API (ex: data fora do intervalo permitido)
        if (data.error && receivedTimes.length === 0) {
          setMessage(data.error);
        }
      } catch {
        setTimes([]);
        setStartTime('');
      } finally {
        setLoadingTimes(false);
      }
    }

    loadTimes();
  }, [phoneStepUnlocked, serviceId, professionalId, bookingDate]);

  async function handleLookupCustomer() {
    setLookupMessage('');
    setMessage('');

    if (!whatsappIsValid) {
      setPhoneStepUnlocked(false);
      setCustomerFound(false);
      setCustomerName('');
      setLookupMessage('Digite seu WhatsApp com DDD + dígito 9 + número. Exemplo: 88999999999');
      return;
    }

    setLookupLoading(true);

    try {
      const params = new URLSearchParams({
        barbershop_id: barbershopId,
        whatsapp: whatsappDigits,
      });

      const res = await fetch(`/api/public/customer?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      });

      const data: CustomerLookupResponse & { error?: string } = await res.json();

      if (!res.ok) {
        setPhoneStepUnlocked(false);
        setCustomerFound(false);
        setCustomerName('');
        setLookupMessage(data.error || 'Não foi possível verificar seu cadastro agora.');
        return;
      }

      setPhoneStepUnlocked(true);
      setDateMode('today');
      setBookingDate(todayIso);
      setStartTime('');

      if (data.found && data.customer) {
        setCustomerFound(true);
        setCustomerName(data.customer.name || '');
        setLookupMessage('Cliente encontrado. Seus dados já foram preenchidos.');
      } else {
        setCustomerFound(false);
        setCustomerName('');
        setLookupMessage('Número não encontrado. Preencha seu nome para continuar.');
      }
    } catch {
      setPhoneStepUnlocked(false);
      setCustomerFound(false);
      setCustomerName('');
      setLookupMessage('Erro ao consultar o cadastro. Tente novamente.');
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    if (!phoneStepUnlocked) {
      setMessage('Informe seu WhatsApp e clique em continuar antes de agendar.');
      setSaving(false);
      return;
    }

    if (!whatsappIsValid) {
      setMessage('Digite seu WhatsApp com DDD + dígito 9 + número.');
      setSaving(false);
      return;
    }

    if (!customerName.trim()) {
      setMessage('Informe seu nome para continuar.');
      setSaving(false);
      return;
    }

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barbershop_id: barbershopId,
          service_id: serviceId,
          professional_id: professionalId,
          customer_name: customerName.trim(),
          customer_whatsapp: whatsappDigits,
          booking_date: bookingDate,
          start_time: startTime,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || 'Erro ao salvar.');
        setSaving(false);
        return;
      }

      setMessage(
        `Agendamento confirmado em ${barbershopName}. Nº ${data.booking.daily_order_number}`
      );

      setServiceId('');
      setProfessionalId('');
      setDateMode('today');
      setBookingDate(todayIso);
      setStartTime('');
      setTimes([]);
      setSaving(false);
    } catch {
      setMessage('Erro ao salvar.');
      setSaving(false);
    }
  }

  function handleDateModeChange(mode: DateMode) {
    setDateMode(mode);
    setStartTime('');

    if (mode === 'today') {
      setBookingDate(todayIso);
      return;
    }

    if (mode === 'tomorrow') {
      setBookingDate(tomorrowIso);
      return;
    }

    if (!bookingDate) {
      setBookingDate(todayIso);
    }
  }

  const noTimesMessage = useMemo(() => {
    if (!phoneStepUnlocked || !serviceId || !professionalId || !bookingDate) return '';
    if (loadingTimes) return '';
    if (times.length > 0) return '';

    if (dateMode === 'today') {
      return 'Nenhum horário disponível hoje. Tente amanhã ou escolha outra data.';
    }

    if (dateMode === 'tomorrow') {
      return 'Nenhum horário disponível amanhã. Escolha outra data.';
    }

    return 'Nenhum horário disponível para esta data.';
  }, [phoneStepUnlocked, serviceId, professionalId, bookingDate, loadingTimes, times.length, dateMode]);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <label className="mb-2 block text-sm text-white/70">Seu WhatsApp</label>

        <input
          className="field"
          placeholder="Ex: 88999999999"
          inputMode="numeric"
          value={formatWhatsappInput(customerWhatsapp)}
          onChange={(e) => {
            const digits = onlyDigits(e.target.value).slice(0, 11);
            setCustomerWhatsapp(digits);

            if (phoneStepUnlocked) {
              setPhoneStepUnlocked(false);
              setCustomerFound(false);
              setCustomerName('');
              setServiceId('');
              setProfessionalId('');
              setDateMode('today');
              setBookingDate(todayIso);
              setStartTime('');
              setTimes([]);
              setLookupMessage('');
              setMessage('');
            }
          }}
          maxLength={16}
        />

        <p className="mt-2 text-xs text-white/55">
          Digite com DDD + dígito 9 + número. Exemplo: 88999999999
        </p>

        {!whatsappIsValid && whatsappDigits.length > 0 ? (
          <p className="mt-2 text-xs text-red-300">
            O número precisa ter 11 dígitos e incluir o dígito 9 após o DDD.
          </p>
        ) : null}

        <button
          type="button"
          className="btn btn-primary mt-4 w-full"
          onClick={handleLookupCustomer}
          disabled={lookupLoading || !whatsappIsValid}
        >
          {lookupLoading ? 'Verificando cadastro...' : 'Continuar'}
        </button>

        {lookupMessage ? <p className="mt-3 text-sm text-white/80">{lookupMessage}</p> : null}
      </div>

      {phoneStepUnlocked ? (
        <>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="badge">
                {customerFound ? 'Cliente reconhecido' : 'Novo cliente'}
              </span>

              {customerFound ? (
                <span className="text-xs text-emerald-300">
                  Seus dados foram encontrados neste número.
                </span>
              ) : (
                <span className="text-xs text-white/55">
                  Preencha os dados para concluir o agendamento.
                </span>
              )}
            </div>

            <label className="mb-2 block text-sm text-white/70">Seu nome</label>
            <input
              className="field"
              placeholder="Seu nome"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/70">Serviço</label>
            <select
              className="field"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              required
            >
              <option value="">Escolha</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} — R$ {Number(service.price).toFixed(2)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/70">Profissional</label>
            <select
              className="field"
              value={professionalId}
              onChange={(e) => setProfessionalId(e.target.value)}
              required
            >
              <option value="">Escolha</option>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <label className="mb-3 block text-sm text-white/70">Data</label>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                className={`btn ${dateMode === 'today' ? 'btn-primary' : 'btn-dark'}`}
                onClick={() => handleDateModeChange('today')}
              >
                Hoje
              </button>

              <button
                type="button"
                className={`btn ${dateMode === 'tomorrow' ? 'btn-primary' : 'btn-dark'}`}
                onClick={() => handleDateModeChange('tomorrow')}
              >
                Amanhã
              </button>

              <button
                type="button"
                className={`btn ${dateMode === 'custom' ? 'btn-primary' : 'btn-dark'}`}
                onClick={() => handleDateModeChange('custom')}
              >
                Escolher data
              </button>
            </div>

            <p className="mt-3 text-xs text-white/55">
              Selecionado: {formatDateModeLabel(dateMode)}
            </p>

            {dateMode === 'custom' ? (
              <div className="mt-3">
                <input
                  className="field"
                  type="date"
                  min={todayIso}
                  max={maxBookingDate}
                  value={bookingDate}
                  onChange={(e) => {
                    setBookingDate(e.target.value);
                    setStartTime('');
                  }}
                  required
                />
              </div>
            ) : null}
          </div>

          <div>
            <label className="mb-2 block text-sm text-white/70">Horário</label>
            <select
              className="field"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
              disabled={!serviceId || !professionalId || !bookingDate || loadingTimes}
            >
              <option value="">
                {loadingTimes
                  ? 'Carregando horários...'
                  : times.length
                    ? 'Escolha o horário'
                    : 'Nenhum horário disponível'}
              </option>

              {times.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>

            {noTimesMessage ? (
              <p className="mt-2 text-xs text-amber-200">{noTimesMessage}</p>
            ) : null}
          </div>

          {selectedService ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/80">
              Duração: {selectedService.duration_minutes} min
            </div>
          ) : null}

          {loyaltyEnabled ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-white/80">
              <strong>Cartão fidelidade ativo.</strong>
              <br />
              {loyaltyRules || 'Defina as regras no painel admin.'}
            </div>
          ) : null}

          <button className="btn btn-primary w-full" disabled={saving || !startTime}>
            {saving ? 'Salvando...' : 'Confirmar agendamento'}
          </button>
        </>
      ) : null}

      {message ? <p className="text-sm text-white/80">{message}</p> : null}
    </form>
  );
}
