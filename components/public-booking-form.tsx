'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarberShopStorefront } from './barber-shop-storefront';

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

type Props = {
  barbershopId: string;
  barbershopName: string;
  services: Service[];
  professionals: Professional[];
  loyaltyEnabled?: boolean;
  loyaltyRules?: string | null;
  whatsappNumber?: string | null;
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

export function PublicBookingForm({
  barbershopId,
  barbershopName,
  services,
  professionals,
  loyaltyEnabled,
  loyaltyRules,
  whatsappNumber,
}: Props) {
  const [serviceId, setServiceId] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [phoneStepUnlocked, setPhoneStepUnlocked] = useState(false);
  const [customerFound, setCustomerFound] = useState(false);
  const [customerVisits, setCustomerVisits] = useState<number | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMessage, setLookupMessage] = useState('');
  const [times, setTimes] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);

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

        const res = await fetch(`/api/available-times?${params.toString()}`);
        const data = await res.json();

        setTimes(data.times || []);
      } catch {
        setTimes([]);
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

      if (data.found && data.customer) {
        setCustomerFound(true);
        setCustomerName(data.customer.name || '');
        setCustomerVisits(data.customer.total_bookings || 0);
        setLookupMessage('Cliente encontrado. Seus dados já foram preenchidos.');
      } else {
        setCustomerFound(false);
        setCustomerName('');
        setCustomerVisits(null);
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
      setBookingDate('');
      setStartTime('');
      setTimes([]);
      setSaving(false);
      setBookingConfirmed(true);
      setTimeout(() => setShowShop(true), 800);
    } catch {
      setMessage('Erro ao salvar.');
      setSaving(false);
    }
  }

  return (
    <>
      {/* Botão Shopping antes do agendamento */}
      {!bookingConfirmed && (
        <button
          type="button"
          onClick={() => setShowShop(true)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '14px 20px',
            background: 'linear-gradient(135deg, rgba(196,155,99,0.15), rgba(196,155,99,0.08))',
            border: '1px solid rgba(196,155,99,0.35)',
            borderRadius: '18px',
            color: '#c49b63',
            fontWeight: 700,
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            marginBottom: '4px',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'linear-gradient(135deg, rgba(196,155,99,0.25), rgba(196,155,99,0.14))')}
          onMouseLeave={e => (e.currentTarget.style.background = 'linear-gradient(135deg, rgba(196,155,99,0.15), rgba(196,155,99,0.08))')}
        >
          <span style={{ fontSize: 20 }}>🛒</span>
          <span>Shopping do Barbeiro</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.6 }}>Ver produtos ›</span>
        </button>
      )}

      {/* Modal Shopping */}
      {showShop && (
        <BarberShopStorefront
          barbershopId={barbershopId}
          barbershopName={barbershopName}
          whatsappNumber={whatsappNumber}
          asModal
          onClose={() => setShowShop(false)}
        />
      )}

      {/* Confirmação pós-agendamento */}
      {bookingConfirmed && message && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(52,199,89,0.12), rgba(52,199,89,0.06))',
          border: '1px solid rgba(52,199,89,0.3)',
          borderRadius: '18px',
          padding: '20px',
          textAlign: 'center',
          marginBottom: '4px',
        }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
          <p style={{ color: '#4ade80', fontWeight: 700, fontSize: 15, margin: '0 0 8px' }}>
            {message}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: '0 0 16px' }}>
            Aguardamos você! Enquanto isso, conheça nossos produtos.
          </p>
          <button
            type="button"
            onClick={() => setShowShop(true)}
            style={{
              background: 'linear-gradient(135deg, #c49b63, #a07840)',
              color: '#0a0a0a',
              border: 'none',
              borderRadius: '14px',
              padding: '12px 24px',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            🛒 Ver produtos do Shopping
          </button>
        </div>
      )}

    <form onSubmit={handleSubmit} className="space-y-5" style={{ display: bookingConfirmed ? 'none' : undefined }}>
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
              setBookingDate('');
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

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm text-white/70">Data</label>
              <input
                className="field"
                type="date"
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
                required
              />
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
            </div>
          </div>

          {selectedService ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/80">
              Duração: {selectedService.duration_minutes} min
            </div>
          ) : null}

          {loyaltyEnabled ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-white/80" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>🏆</span>
                <strong>Cartão Fidelidade</strong>
              </div>
              {customerVisits !== null && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
                    Você tem <strong style={{ color: '#f0c97a' }}>{customerVisits} visita{customerVisits !== 1 ? 's' : ''}</strong> registradas.
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, (customerVisits / 10) * 100)}%`, background: 'linear-gradient(90deg, #c49b63, #f0c97a)', borderRadius: 99, transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    {customerVisits >= 10 ? '🎉 Você atingiu o prêmio!' : `${10 - customerVisits} visita(s) para o próximo prêmio`}
                  </div>
                </div>
              )}
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
                {loyaltyRules || 'Defina as regras no painel admin.'}
              </div>
            </div>
          ) : null}

          <button className="btn btn-primary w-full" disabled={saving || !startTime}>
            {saving ? 'Salvando...' : 'Confirmar agendamento'}
          </button>
        </>
      ) : null}

      {message ? <p className="text-sm text-white/80">{message}</p> : null}
    </form>
    </>
  );
}