'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';

type Barbershop = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  logo_url?: string | null;
  cover_image_url?: string | null;
  primary_color?: string | null;
  whatsapp_number?: string | null;
  address?: string | null;
  opening_hours_text?: string | null;
};

type Profile = {
  id: string;
  email: string;
  name: string | null;
  role: 'shop_manager' | 'shop_barber';
  barbershop_id: string | null;
  professional_id: string | null;
};

type Professional = {
  id: string;
  barbershop_id: string;
  name: string;
  specialty?: string | null;
  description?: string | null;
  whatsapp_number?: string | null;
  photo_url?: string | null;
  is_active?: boolean | null;
  accepts_booking?: boolean | null;
  evolution_enabled?: boolean | null;
  evolution_api_url?: string | null;
  evolution_instance?: string | null;
  evolution_api_key?: string | null;
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

type Loyalty = {
  barbershop_id: string;
  enabled?: boolean;
  visits_required?: number | null;
  reward_label?: string | null;
  rules_text?: string | null;
  reward_message?: string | null;
};

type WorkingHour = {
  id: string;
  barbershop_id: string;
  professional_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  break_start_time?: string | null;
  break_end_time?: string | null;
  slot_interval_minutes?: number | null;
  is_active?: boolean | null;
};

type ProfessionalService = {
  id?: string;
  professional_id: string;
  service_id: string;
  custom_price?: number | null;
  custom_duration_minutes?: number | null;
};

type Subscription = {
  id: string;
  barbershop_id: string;
  status: 'active' | 'trial' | 'overdue' | 'cancelled';
  end_date?: string | null;
  billing_day?: number | null;
  amount_monthly?: number | null;
  trial_ends_at?: string | null;
  last_payment_at?: string | null;
  blocked_at?: string | null;
  notes?: string | null;
};

type ShopForm = {
  name: string;
  slug: string;
  description: string;
  logo_url: string;
  cover_image_url: string;
  primary_color: string;
  whatsapp_number: string;
  address: string;
  opening_hours_text: string;
};

type ManagerForm = {
  name: string;
  email: string;
  password: string;
};

type LoyaltyForm = {
  enabled: boolean;
  visits_required: string;
  reward_label: string;
  rules_text: string;
  reward_message: string;
};

type BarberForm = {
  id: string | null;
  name: string;
  email: string;
  password: string;
  specialty: string;
  description: string;
  whatsapp_number: string;
  photo_url: string;
  is_active: boolean;
  accepts_booking: boolean;
  evolution_enabled: boolean;
  evolution_api_url: string;
  evolution_instance: string;
  evolution_api_key: string;
  service_ids: string[];
};

type ServiceForm = {
  id: string | null;
  name: string;
  description: string;
  price: string;
  duration_minutes: string;
  is_active: boolean;
};

type HoursFormMap = Record<string, { enabled: boolean; start: string; end: string; break_start: string; break_end: string; slot: string }>;

const weekdays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const emptyShopForm: ShopForm = {
  name: '',
  slug: '',
  description: '',
  logo_url: '',
  cover_image_url: '',
  primary_color: '#c49b63',
  whatsapp_number: '',
  address: '',
  opening_hours_text: '',
};

const emptyManagerForm: ManagerForm = { name: '', email: '', password: '' };
const emptyLoyaltyForm: LoyaltyForm = {
  enabled: false,
  visits_required: '10',
  reward_label: 'Corte grátis',
  rules_text: '',
  reward_message: '',
};
const emptyBarberForm: BarberForm = {
  id: null,
  name: '',
  email: '',
  password: '',
  specialty: '',
  description: '',
  whatsapp_number: '',
  photo_url: '',
  is_active: true,
  accepts_booking: true,
  evolution_enabled: false,
  evolution_api_url: '',
  evolution_instance: '',
  evolution_api_key: '',
  service_ids: [],
};
const emptyServiceForm: ServiceForm = {
  id: null,
  name: '',
  description: '',
  price: '',
  duration_minutes: '30',
  is_active: true,
};

function buildHoursMap(hours: WorkingHour[]): HoursFormMap {
  const map: HoursFormMap = {};
  for (let i = 0; i < 7; i += 1) {
    const item = hours.find((hour) => hour.weekday === i);
    map[String(i)] = {
      enabled: Boolean(item?.is_active),
      start: item?.start_time?.slice(0, 5) || '08:00',
      end: item?.end_time?.slice(0, 5) || '18:00',
      break_start: item?.break_start_time?.slice(0, 5) || '12:00',
      break_end: item?.break_end_time?.slice(0, 5) || '13:00',
      slot: String(item?.slot_interval_minutes || 30),
    };
  }
  return map;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler imagem.'));
    reader.readAsDataURL(file);
  });
}

function formatPhoneHint(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return 'Padrão Evolution: 558596495575 (sem o 9).';
  return `Salvando no padrão Evolution: ${digits}`;
}

export function AdminSingleForm({
  initialBarbershops,
  initialProfiles,
  initialProfessionals,
  initialServices,
  initialLoyaltySettings,
  initialWorkingHours,
  initialProfessionalServices,
  initialSubscriptions,
}: {
  initialBarbershops: Barbershop[];
  initialProfiles: Profile[];
  initialProfessionals: Professional[];
  initialServices: Service[];
  initialLoyaltySettings: Loyalty[];
  initialWorkingHours: WorkingHour[];
  initialProfessionalServices: ProfessionalService[];
  initialSubscriptions?: Subscription[];
}) {
  const [barbershops, setBarbershops] = useState((initialBarbershops || []).filter(Boolean));
  const [profiles, setProfiles] = useState((initialProfiles || []).filter(Boolean));
  const [professionals, setProfessionals] = useState((initialProfessionals || []).filter(Boolean));
  const [services, setServices] = useState((initialServices || []).filter(Boolean));
  const [loyaltySettings, setLoyaltySettings] = useState((initialLoyaltySettings || []).filter(Boolean));
  const [workingHours] = useState((initialWorkingHours || []).filter(Boolean));
  const [professionalServices, setProfessionalServices] = useState((initialProfessionalServices || []).filter(Boolean));
  const [subscriptions, setSubscriptions] = useState((initialSubscriptions || []).filter(Boolean));

  const [selectedShopId, setSelectedShopId] = useState<string | null>(initialBarbershops?.[0]?.id || null);
  const [createMode, setCreateMode] = useState((initialBarbershops || []).length === 0);
  const [shopForm, setShopForm] = useState<ShopForm>(emptyShopForm);
  const [managerForm, setManagerForm] = useState<ManagerForm>(emptyManagerForm);
  const [loyaltyForm, setLoyaltyForm] = useState<LoyaltyForm>(emptyLoyaltyForm);
  const [barberForm, setBarberForm] = useState<BarberForm>(emptyBarberForm);
  const [serviceForm, setServiceForm] = useState<ServiceForm>(emptyServiceForm);
  const [hoursForm, setHoursForm] = useState<HoursFormMap>(buildHoursMap([]));
  const [message, setMessage] = useState('');
  const [loadingSection, setLoadingSection] = useState<string | null>(null);

  const selectedShop = useMemo(() => (barbershops || []).find((shop) => shop?.id === selectedShopId) || null, [barbershops, selectedShopId]);
  const currentManager = useMemo(() => {
    if (!selectedShop) return null;
    return (profiles || []).find((profile) => profile?.barbershop_id === selectedShop.id && profile?.role === 'shop_manager') || null;
  }, [profiles, selectedShop]);
  const currentLoyalty = useMemo(() => {
    if (!selectedShop) return null;
    return (loyaltySettings || []).find((item) => item?.barbershop_id === selectedShop.id) || null;
  }, [loyaltySettings, selectedShop]);
  const currentSubscription = useMemo(() => {
    if (!selectedShop) return null;
    return (subscriptions || []).find((item) => item?.barbershop_id === selectedShop.id) || null;
  }, [subscriptions, selectedShop]);
  const currentProfessionals = useMemo(() => {
    if (!selectedShop) return [];
    return (professionals || []).filter((item) => item?.barbershop_id === selectedShop.id);
  }, [professionals, selectedShop]);
  const currentServices = useMemo(() => {
    if (!selectedShop) return [];
    return (services || []).filter((item) => item?.barbershop_id === selectedShop.id);
  }, [services, selectedShop]);

  function resetCreateForms() {
    setShopForm(emptyShopForm);
    setManagerForm(emptyManagerForm);
    setLoyaltyForm(emptyLoyaltyForm);
    setBarberForm(emptyBarberForm);
    setServiceForm(emptyServiceForm);
    setHoursForm(buildHoursMap([]));
  }

  useEffect(() => {
    if (createMode || !selectedShop) {
      resetCreateForms();
      return;
    }

    setShopForm({
      name: selectedShop.name || '',
      slug: selectedShop.slug || '',
      description: selectedShop.description || '',
      logo_url: selectedShop.logo_url || '',
      cover_image_url: selectedShop.cover_image_url || '',
      primary_color: selectedShop.primary_color || '#c49b63',
      whatsapp_number: selectedShop.whatsapp_number || '',
      address: selectedShop.address || '',
      opening_hours_text: selectedShop.opening_hours_text || '',
    });
    setManagerForm({ name: currentManager?.name || '', email: currentManager?.email || '', password: '' });
    setLoyaltyForm({
      enabled: Boolean(currentLoyalty?.enabled),
      visits_required: String(currentLoyalty?.visits_required || 10),
      reward_label: currentLoyalty?.reward_label || 'Corte grátis',
      rules_text: currentLoyalty?.rules_text || '',
      reward_message: currentLoyalty?.reward_message || '',
    });
    setBarberForm(emptyBarberForm);
    setServiceForm(emptyServiceForm);
    setHoursForm(buildHoursMap([]));
  }, [createMode, selectedShop, currentManager, currentLoyalty]);

  async function uploadImage(event: ChangeEvent<HTMLInputElement>, kind: 'shop_logo' | 'shop_cover' | 'barber_photo') {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    if (kind === 'shop_logo') setShopForm((prev) => ({ ...prev, logo_url: dataUrl }));
    if (kind === 'shop_cover') setShopForm((prev) => ({ ...prev, cover_image_url: dataUrl }));
    if (kind === 'barber_photo') setBarberForm((prev) => ({ ...prev, photo_url: dataUrl }));
  }

  function startNewShop() {
    setCreateMode(true);
    setSelectedShopId(null);
    setMessage('');
    resetCreateForms();
  }

  function selectShop(shopId: string) {
    setCreateMode(false);
    setSelectedShopId(shopId);
    setMessage('');
  }

  async function saveShop() {
    setMessage('');
    setLoadingSection('shop');
    try {
      const payload = {
        barbershop: shopForm,
        shop: shopForm,
        shopManager: managerForm,
        loyalty: loyaltyForm,
        firstBarber: createMode
          ? {
              name: barberForm.name,
              email: barberForm.email,
              password: barberForm.password,
              specialty: barberForm.specialty,
              description: barberForm.description,
              whatsapp_number: barberForm.whatsapp_number,
              photo_url: barberForm.photo_url,
              evolution_enabled: barberForm.evolution_enabled,
              evolution_api_url: barberForm.evolution_api_url,
              evolution_instance: barberForm.evolution_instance,
              evolution_api_key: barberForm.evolution_api_key,
            }
          : undefined,
        firstService: createMode
          ? {
              name: serviceForm.name,
              description: serviceForm.description,
              price: serviceForm.price,
              duration_minutes: serviceForm.duration_minutes,
            }
          : undefined,
        firstBarberWorkingHours: createMode
          ? weekdays.map((_, weekday) => ({
              weekday,
              enabled: hoursForm[String(weekday)]?.enabled || false,
              start_time: hoursForm[String(weekday)]?.start || '08:00',
              end_time: hoursForm[String(weekday)]?.end || '18:00',
              break_start_time: hoursForm[String(weekday)]?.break_start || '',
              break_end_time: hoursForm[String(weekday)]?.break_end || '',
              slot_interval_minutes: Number(hoursForm[String(weekday)]?.slot || 30),
            }))
          : undefined,
      };

      const res = await fetch(createMode ? '/api/admin/setup-shop' : '/api/admin/barbershops', {
        method: createMode ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          createMode
            ? payload
            : {
                id: selectedShopId,
                ...payload,
                shopManager: {
                  profile_id: currentManager?.id || null,
                  ...managerForm,
                },
              }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Erro ao salvar barbearia.');
        return;
      }
      setMessage(data.message || 'Barbearia salva com sucesso.');
      window.location.reload();
    } catch {
      setMessage('Erro ao salvar barbearia.');
    } finally {
      setLoadingSection(null);
    }
  }

  function getBarberProfile(professionalId: string) {
    return profiles.find((item) => item.professional_id === professionalId) || null;
  }

  async function updateSubscription(action: string) {
    if (!selectedShop) return;

    setMessage('');
    setLoadingSection(`subscription-${action}`);

    try {
      const res = await fetch('/api/admin/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barbershop_id: selectedShop.id,
          action,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || 'Erro ao atualizar assinatura.');
        return;
      }

      setSubscriptions((prev) => {
        const next = (prev || []).filter((item) => item.barbershop_id !== selectedShop.id);
        return [...next, data.subscription].filter(Boolean);
      });
      setMessage('Assinatura atualizada com sucesso.');
    } catch {
      setMessage('Erro ao atualizar assinatura.');
    } finally {
      setLoadingSection(null);
    }
  }

  function editBarber(professional: Professional) {
    const linkedProfile = getBarberProfile(professional.id);
    const linkedServiceIds = professionalServices.filter((item) => item.professional_id === professional.id).map((item) => item.service_id);
    const linkedHours = workingHours.filter((item) => item.professional_id === professional.id);
    setBarberForm({
      id: professional.id,
      name: professional.name || '',
      email: linkedProfile?.email || '',
      password: '',
      specialty: professional.specialty || '',
      description: professional.description || '',
      whatsapp_number: professional.whatsapp_number || '',
      photo_url: professional.photo_url || '',
      is_active: Boolean(professional.is_active ?? true),
      accepts_booking: Boolean(professional.accepts_booking ?? true),
      evolution_enabled: Boolean(professional.evolution_enabled ?? false),
      evolution_api_url: professional.evolution_api_url || '',
      evolution_instance: professional.evolution_instance || '',
      evolution_api_key: professional.evolution_api_key || '',
      service_ids: linkedServiceIds,
    });
    setHoursForm(buildHoursMap(linkedHours));
    setMessage('Editando barbeiro.');
  }

  function resetBarberForm() {
    setBarberForm(emptyBarberForm);
    setHoursForm(buildHoursMap([]));
  }

  async function saveBarber() {
    if (!selectedShop) {
      setMessage('Crie ou selecione uma barbearia antes de salvar barbeiro.');
      return;
    }
    setMessage('');
    setLoadingSection('barber');
    try {
      const isNew = !barberForm.id;
      const res = await fetch('/api/admin/professionals', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: barberForm.id,
          barbershop_id: selectedShop.id,
          name: barberForm.name,
          email: barberForm.email,
          password: barberForm.password,
          specialty: barberForm.specialty,
          description: barberForm.description,
          whatsapp_number: barberForm.whatsapp_number,
          photo_url: barberForm.photo_url,
          is_active: barberForm.is_active,
          accepts_booking: barberForm.accepts_booking,
          evolution_enabled: barberForm.evolution_enabled,
          evolution_api_url: barberForm.evolution_api_url,
          evolution_instance: barberForm.evolution_instance,
          evolution_api_key: barberForm.evolution_api_key,
          service_ids: barberForm.service_ids,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Erro ao salvar barbeiro.');
        return;
      }
      const professional = (data.professional || null) as Professional | null;
      const profile = (data.profile || null) as Profile | null;
      const assignmentRows = ((data.professional_services || []) as ProfessionalService[]).filter(Boolean);
      if (professional) {
        if (isNew) {
          setProfessionals((prev) => [professional, ...prev.filter(Boolean)]);
          if (profile) setProfiles((prev) => [profile, ...prev.filter(Boolean)]);
        } else {
          setProfessionals((prev) => prev.filter(Boolean).map((item) => (item.id === professional.id ? professional : item)));
          if (profile) setProfiles((prev) => prev.filter(Boolean).map((item) => (item.id === profile.id ? profile : item)));
        }
        setProfessionalServices((prev) => {
          const filtered = prev.filter(Boolean).filter((item) => item.professional_id !== professional.id);
          return [...filtered, ...assignmentRows];
        });
      }
      const workingProfessionalId = professional?.id || barberForm.id;
      if (workingProfessionalId) {
        for (let weekday = 0; weekday < 7; weekday += 1) {
          const hour = hoursForm[String(weekday)];
          await fetch('/api/admin/working-hours', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              professional_id: workingProfessionalId,
              weekday,
              start_time: hour.start,
              end_time: hour.end,
              break_start_time: hour.break_start,
              break_end_time: hour.break_end,
              slot_interval_minutes: Number(hour.slot || 30),
              is_active: hour.enabled,
            }),
          });
        }
      }
      window.location.reload();
    } catch {
      setMessage('Erro ao salvar barbeiro.');
    } finally {
      setLoadingSection(null);
    }
  }

  async function removeBarber(professionalId: string, name: string) {
    const ok = window.confirm(`Excluir o barbeiro ${name}? Se ele já tiver agendamentos, use desativar.`);
    if (!ok) return;
    setMessage('');
    setLoadingSection('barber-delete');
    try {
      const res = await fetch('/api/admin/professionals', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: professionalId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Erro ao excluir barbeiro.');
        return;
      }
      setProfessionals((prev) => prev.filter((item) => item.id !== professionalId));
      setProfiles((prev) => prev.filter((item) => item.professional_id !== professionalId));
      setProfessionalServices((prev) => prev.filter((item) => item.professional_id !== professionalId));
      if (barberForm.id === professionalId) resetBarberForm();
      setMessage('Barbeiro excluído.');
    } catch {
      setMessage('Erro ao excluir barbeiro.');
    } finally {
      setLoadingSection(null);
    }
  }

  function editService(service: Service) {
    setServiceForm({
      id: service.id,
      name: service.name,
      description: service.description || '',
      price: String(service.price),
      duration_minutes: String(service.duration_minutes),
      is_active: Boolean(service.is_active ?? true),
    });
    setMessage('Editando serviço.');
  }

  function resetServiceForm() {
    setServiceForm(emptyServiceForm);
  }

  async function saveService() {
    if (!selectedShop) {
      setMessage('Crie ou selecione uma barbearia antes de salvar serviço.');
      return;
    }
    setLoadingSection('service');
    setMessage('');
    try {
      const isNew = !serviceForm.id;
      const res = await fetch('/api/admin/services', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: serviceForm.id,
          barbershop_id: selectedShop.id,
          name: serviceForm.name,
          description: serviceForm.description,
          price: serviceForm.price,
          duration_minutes: serviceForm.duration_minutes,
          is_active: serviceForm.is_active,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Erro ao salvar serviço.');
        return;
      }
      const service = data.service as Service;
      if (isNew) setServices((prev) => [service, ...prev]);
      else setServices((prev) => prev.map((item) => (item.id === service.id ? service : item)));
      setMessage(data.message || 'Serviço salvo.');
      resetServiceForm();
    } catch {
      setMessage('Erro ao salvar serviço.');
    } finally {
      setLoadingSection(null);
    }
  }

  async function removeService(serviceId: string, name: string) {
    const ok = window.confirm(`Excluir o serviço ${name}?`);
    if (!ok) return;
    setLoadingSection('service-delete');
    setMessage('');
    try {
      const res = await fetch('/api/admin/services', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: serviceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Erro ao excluir serviço.');
        return;
      }
      setServices((prev) => prev.filter((item) => item.id !== serviceId));
      setProfessionalServices((prev) => prev.filter((item) => item.service_id !== serviceId));
      if (serviceForm.id === serviceId) resetServiceForm();
      setMessage('Serviço excluído.');
    } catch {
      setMessage('Erro ao excluir serviço.');
    } finally {
      setLoadingSection(null);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
      <aside className="panel h-fit p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Barbearias</h2>
            <p className="mt-1 text-sm text-white/70">Abra uma loja para editar tudo no mesmo lugar.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={startNewShop}>Nova</button>
        </div>
        <div className="space-y-3">
          {barbershops.length ? barbershops.filter((shop): shop is Barbershop => Boolean(shop)).map((shop) => {
            const shopBarbers = professionals.filter((item) => item.barbershop_id === shop.id);
            return (
              <button key={shop.id} type="button" className={`w-full rounded-2xl border p-4 text-left transition ${selectedShopId === shop.id && !createMode ? 'border-white/30 bg-white/10' : 'border-white/10 bg-black/20 hover:bg-white/5'}`} onClick={() => selectShop(shop.id)}>
                <div className="font-semibold">{shop.name}</div>
                <div className="mt-1 text-sm text-white/60">/{shop.slug}</div>
                <div className="mt-2 text-xs text-white/45">{shopBarbers.length} barbeiro(s)</div>
              </button>
            );
          }) : <div className="rounded-2xl border border-white/10 p-4 text-white/65">Nenhuma barbearia cadastrada.</div>}
        </div>
      </aside>

      <div className="space-y-8">
        <section className="panel p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{createMode ? 'Cadastrar nova barbearia' : `Painel completo — ${selectedShop?.name || 'Barbearia'}`}</h1>
              <p className="mt-2 text-sm text-white/70">Tudo em uma tela: barbearia, conta da loja, barbeiros, serviços, fotos, horários e WhatsApp no padrão Evolution sem o nono dígito.</p>
            </div>
            {selectedShop && !createMode ? <a href={`/${selectedShop.slug}`} target="_blank" rel="noreferrer" className="btn btn-dark">Abrir site da loja</a> : null}
          </div>

          {!createMode && selectedShop ? (
            <div className="mb-6 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Assinatura</h2>
                  <p className="mt-1 text-sm text-white/70">
                    Status: {currentSubscription?.status || 'sem registro'} · Vencimento:{' '}
                    {currentSubscription?.end_date
                      ? currentSubscription.end_date.split('-').reverse().join('/')
                      : 'nao definido'}{' '}
                    · Valor: R$ {Number(currentSubscription?.amount_monthly || 30).toFixed(2)}
                  </p>
                  {currentSubscription?.notes ? (
                    <p className="mt-1 text-xs text-white/50">{currentSubscription.notes}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary" disabled={loadingSection === 'subscription-activate_30_days'} onClick={() => updateSubscription('activate_30_days')}>Liberar 30 dias</button>
                  <button type="button" className="btn btn-dark" disabled={loadingSection === 'subscription-start_trial_30_days'} onClick={() => updateSubscription('start_trial_30_days')}>Iniciar trial</button>
                  <button type="button" className="btn btn-dark" disabled={loadingSection === 'subscription-due_today'} onClick={() => updateSubscription('due_today')}>Vence hoje</button>
                  <button type="button" className="btn btn-danger" disabled={loadingSection === 'subscription-block'} onClick={() => updateSubscription('block')}>Bloquear</button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-8 xl:grid-cols-2">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Dados da barbearia</h2>
              <input className="field" placeholder="Nome da barbearia" value={shopForm.name} onChange={(e) => setShopForm((prev) => ({ ...prev, name: e.target.value }))} />
              <input className="field" placeholder="slug-da-barbearia" value={shopForm.slug} onChange={(e) => setShopForm((prev) => ({ ...prev, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))} />
              <textarea className="field min-h-24" placeholder="Descrição" value={shopForm.description} onChange={(e) => setShopForm((prev) => ({ ...prev, description: e.target.value }))} />
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <input className="field" placeholder="URL da logo" value={shopForm.logo_url} onChange={(e) => setShopForm((prev) => ({ ...prev, logo_url: e.target.value }))} />
                  <input className="field" type="file" accept="image/*" onChange={(e) => uploadImage(e, 'shop_logo')} />
                </div>
                <div className="space-y-2">
                  <input className="field" placeholder="URL da capa" value={shopForm.cover_image_url} onChange={(e) => setShopForm((prev) => ({ ...prev, cover_image_url: e.target.value }))} />
                  <input className="field" type="file" accept="image/*" onChange={(e) => uploadImage(e, 'shop_cover')} />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <input className="field" type="color" value={shopForm.primary_color} onChange={(e) => setShopForm((prev) => ({ ...prev, primary_color: e.target.value }))} />
                <div>
                  <input className="field" placeholder="WhatsApp da barbearia" value={shopForm.whatsapp_number} onChange={(e) => setShopForm((prev) => ({ ...prev, whatsapp_number: e.target.value }))} />
                  <p className="mt-1 text-xs text-white/45">{formatPhoneHint(shopForm.whatsapp_number)}</p>
                </div>
              </div>
              <input className="field" placeholder="Endereço" value={shopForm.address} onChange={(e) => setShopForm((prev) => ({ ...prev, address: e.target.value }))} />
              <input className="field" placeholder="Horário de funcionamento" value={shopForm.opening_hours_text} onChange={(e) => setShopForm((prev) => ({ ...prev, opening_hours_text: e.target.value }))} />
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Conta da loja + fidelidade</h2>
              <input className="field" placeholder="Nome do responsável" value={managerForm.name} onChange={(e) => setManagerForm((prev) => ({ ...prev, name: e.target.value }))} />
              <input className="field" type="email" placeholder="Email de login da barbearia" value={managerForm.email} onChange={(e) => setManagerForm((prev) => ({ ...prev, email: e.target.value }))} />
              <input className="field" type="text" placeholder={createMode ? 'Senha inicial da barbearia' : 'Nova senha da barbearia (opcional)'} value={managerForm.password} onChange={(e) => setManagerForm((prev) => ({ ...prev, password: e.target.value }))} />
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold">Cartão fidelidade</div>
                    <div className="text-sm text-white/60">Ative, defina meta e mensagem automática.</div>
                  </div>
                  <label className="badge cursor-pointer gap-2"><input type="checkbox" checked={loyaltyForm.enabled} onChange={(e) => setLoyaltyForm((prev) => ({ ...prev, enabled: e.target.checked }))} /> Ativado</label>
                </div>
                <div className="space-y-3">
                  <input className="field" type="number" min={1} placeholder="Visitas" value={loyaltyForm.visits_required} onChange={(e) => setLoyaltyForm((prev) => ({ ...prev, visits_required: e.target.value }))} />
                  <input className="field" placeholder="Prêmio" value={loyaltyForm.reward_label} onChange={(e) => setLoyaltyForm((prev) => ({ ...prev, reward_label: e.target.value }))} />
                  <textarea className="field min-h-24" placeholder="Regras" value={loyaltyForm.rules_text} onChange={(e) => setLoyaltyForm((prev) => ({ ...prev, rules_text: e.target.value }))} />
                  <textarea className="field min-h-24" placeholder="Mensagem do prêmio" value={loyaltyForm.reward_message} onChange={(e) => setLoyaltyForm((prev) => ({ ...prev, reward_message: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>

          {(shopForm.logo_url || shopForm.cover_image_url) ? <div className="mt-6 grid gap-4 md:grid-cols-2">{shopForm.logo_url ? <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="mb-2 text-sm text-white/70">Prévia da logo</div><img src={shopForm.logo_url} alt="Logo" className="max-h-40 rounded-2xl object-contain" /></div> : null}{shopForm.cover_image_url ? <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="mb-2 text-sm text-white/70">Prévia da capa</div><img src={shopForm.cover_image_url} alt="Capa" className="max-h-40 w-full rounded-2xl object-cover" /></div> : null}</div> : null}

          <div className="mt-6"><button className="btn btn-primary" type="button" disabled={loadingSection === 'shop'} onClick={saveShop}>{loadingSection === 'shop' ? 'Salvando...' : createMode ? 'Criar barbearia' : 'Salvar barbearia'}</button></div>
        </section>

        {!createMode && selectedShop ? <>
          <section className="panel p-6">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-bold">Barbeiros na mesma tela</h2><p className="mt-1 text-sm text-white/70">Adicione, edite, desative, escolha serviços, ajuste horários e mantenha o WhatsApp no formato Evolution.</p></div><button type="button" className="btn btn-dark" onClick={resetBarberForm}>Novo barbeiro</button></div>
            <div className="grid gap-8 xl:grid-cols-[1.1fr_.9fr]">
              <div className="grid gap-4 md:grid-cols-2">{currentProfessionals.length ? currentProfessionals.filter((professional): professional is Professional => Boolean(professional)).map((professional) => {
                const linkedProfile = getBarberProfile(professional.id);
                const linkedServiceCount = professionalServices.filter((item) => item.professional_id === professional.id).length;
                return <div key={professional.id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="mb-3 flex items-start gap-3"><div className="h-16 w-16 overflow-hidden rounded-2xl border border-white/10 bg-white/5">{professional.photo_url ? <img src={professional.photo_url} alt={professional.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-white/45">Sem foto</div>}</div><div className="min-w-0 flex-1"><div className="font-semibold">{professional.name}</div><div className="truncate text-sm text-white/60">{professional.specialty || 'Sem especialidade'}</div><div className="truncate text-xs text-white/45">{linkedProfile?.email || 'Sem login'}</div></div></div><div className="space-y-1 text-xs text-white/60"><div>{professional.whatsapp_number || 'Sem WhatsApp'}</div><div>{professional.is_active ? 'Ativo' : 'Inativo'} · {professional.accepts_booking ? 'Aceita agendamento' : 'Sem novos agendamentos'}</div><div>{professional.evolution_enabled ? `Evolution: ${professional.evolution_instance || 'ativada'}` : 'Evolution própria desativada'}</div><div>{linkedServiceCount} serviço(s) vinculado(s)</div></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" className="btn btn-primary" onClick={() => editBarber(professional)}>Editar</button><button type="button" className="btn btn-dark" onClick={() => removeBarber(professional.id, professional.name)} disabled={loadingSection === 'barber-delete'}>Excluir</button></div></div>;
              }) : <div className="rounded-2xl border border-white/10 p-4 text-white/65">Nenhum barbeiro cadastrado ainda.</div>}</div>
              <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-5">
                <h3 className="text-lg font-semibold">{barberForm.id ? 'Editar barbeiro' : 'Adicionar barbeiro'}</h3>
                <input className="field" placeholder="Nome do barbeiro" value={barberForm.name} onChange={(e) => setBarberForm((prev) => ({ ...prev, name: e.target.value }))} />
                <input className="field" type="email" placeholder="Email de login" value={barberForm.email} onChange={(e) => setBarberForm((prev) => ({ ...prev, email: e.target.value }))} />
                <input className="field" type="text" placeholder={barberForm.id ? 'Nova senha (opcional)' : 'Senha inicial'} value={barberForm.password} onChange={(e) => setBarberForm((prev) => ({ ...prev, password: e.target.value }))} />
                <input className="field" placeholder="Especialidade" value={barberForm.specialty} onChange={(e) => setBarberForm((prev) => ({ ...prev, specialty: e.target.value }))} />
                <textarea className="field min-h-24" placeholder="Descrição" value={barberForm.description} onChange={(e) => setBarberForm((prev) => ({ ...prev, description: e.target.value }))} />
                <div><input className="field" placeholder="WhatsApp do barbeiro" value={barberForm.whatsapp_number} onChange={(e) => setBarberForm((prev) => ({ ...prev, whatsapp_number: e.target.value }))} /><p className="mt-1 text-xs text-white/45">{formatPhoneHint(barberForm.whatsapp_number)}</p></div>
                <label className="badge cursor-pointer gap-2"><input type="checkbox" checked={barberForm.evolution_enabled} onChange={(e) => setBarberForm((prev) => ({ ...prev, evolution_enabled: e.target.checked }))} /> Usar Evolution própria deste barbeiro</label>
                <input className="field" placeholder="URL da Evolution do barbeiro" value={barberForm.evolution_api_url} onChange={(e) => setBarberForm((prev) => ({ ...prev, evolution_api_url: e.target.value }))} />
                <input className="field" placeholder="Nome da instância do barbeiro" value={barberForm.evolution_instance} onChange={(e) => setBarberForm((prev) => ({ ...prev, evolution_instance: e.target.value }))} />
                <input className="field" placeholder="API Key da Evolution do barbeiro" value={barberForm.evolution_api_key} onChange={(e) => setBarberForm((prev) => ({ ...prev, evolution_api_key: e.target.value }))} />
                <input className="field" placeholder="URL da foto" value={barberForm.photo_url} onChange={(e) => setBarberForm((prev) => ({ ...prev, photo_url: e.target.value }))} />
                <input className="field" type="file" accept="image/*" onChange={(e) => uploadImage(e, 'barber_photo')} />
                {barberForm.photo_url ? <img src={barberForm.photo_url} alt="Foto do barbeiro" className="max-h-44 rounded-2xl object-cover" /> : null}
                <div className="grid gap-3 md:grid-cols-2"><label className="badge cursor-pointer gap-2"><input type="checkbox" checked={barberForm.is_active} onChange={(e) => setBarberForm((prev) => ({ ...prev, is_active: e.target.checked }))} /> Barbeiro ativo</label><label className="badge cursor-pointer gap-2"><input type="checkbox" checked={barberForm.accepts_booking} onChange={(e) => setBarberForm((prev) => ({ ...prev, accepts_booking: e.target.checked }))} /> Aceita agendamento</label></div>
                <div><div className="mb-2 font-medium">Serviços desse barbeiro</div><div className="grid gap-2 md:grid-cols-2">{currentServices.length ? currentServices.filter((service): service is Service => Boolean(service)).map((service) => <label key={service.id} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm"><div className="flex items-center gap-2"><input type="checkbox" checked={barberForm.service_ids.includes(service.id)} onChange={(e) => setBarberForm((prev) => ({ ...prev, service_ids: e.target.checked ? [...prev.service_ids, service.id] : prev.service_ids.filter((item) => item !== service.id) }))} /><span>{service.name}</span></div><div className="mt-1 text-xs text-white/50">R$ {Number(service.price).toFixed(2)} · {service.duration_minutes} min</div></label>) : <div className="text-sm text-white/60">Cadastre serviços primeiro.</div>}</div></div>
                <div><div className="mb-2 font-medium">Horários semanais</div><div className="space-y-3">{weekdays.map((label, index) => <div key={label} className="rounded-2xl border border-white/10 p-3"><div className="mb-2 flex items-center justify-between gap-3"><div className="font-medium">{label}</div><label className="badge cursor-pointer gap-2"><input type="checkbox" checked={hoursForm[String(index)]?.enabled || false} onChange={(e) => setHoursForm((prev) => ({ ...prev, [String(index)]: { ...prev[String(index)], enabled: e.target.checked } }))} /> Ativo</label></div><div className="grid gap-2 md:grid-cols-3"><input className="field" type="time" value={hoursForm[String(index)]?.start || '08:00'} onChange={(e) => setHoursForm((prev) => ({ ...prev, [String(index)]: { ...prev[String(index)], start: e.target.value } }))} /><input className="field" type="time" value={hoursForm[String(index)]?.end || '18:00'} onChange={(e) => setHoursForm((prev) => ({ ...prev, [String(index)]: { ...prev[String(index)], end: e.target.value } }))} /><input className="field" type="number" min={5} step={5} placeholder="Intervalo" value={hoursForm[String(index)]?.slot || '30'} onChange={(e) => setHoursForm((prev) => ({ ...prev, [String(index)]: { ...prev[String(index)], slot: e.target.value } }))} /></div><div className="mt-2 grid gap-2 md:grid-cols-2"><input className="field" type="time" value={hoursForm[String(index)]?.break_start || '12:00'} onChange={(e) => setHoursForm((prev) => ({ ...prev, [String(index)]: { ...prev[String(index)], break_start: e.target.value } }))} /><input className="field" type="time" value={hoursForm[String(index)]?.break_end || '13:00'} onChange={(e) => setHoursForm((prev) => ({ ...prev, [String(index)]: { ...prev[String(index)], break_end: e.target.value } }))} /></div><div className="mt-1 text-xs text-white/50">Pausa de almoço (opcional).</div></div>)}</div></div>
                <div className="flex flex-wrap gap-3"><button type="button" className="btn btn-primary" disabled={loadingSection === 'barber'} onClick={saveBarber}>{loadingSection === 'barber' ? 'Salvando...' : barberForm.id ? 'Salvar barbeiro' : 'Adicionar barbeiro'}</button><button type="button" className="btn btn-dark" onClick={resetBarberForm}>Limpar</button></div>
              </div>
            </div>
          </section>

          <section className="panel p-6">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-bold">Serviços da barbearia</h2><p className="mt-1 text-sm text-white/70">Cadastre, edite, desative ou exclua serviços. Depois vincule aos barbeiros.</p></div><button type="button" className="btn btn-dark" onClick={resetServiceForm}>Novo serviço</button></div>
            <div className="grid gap-8 xl:grid-cols-[1.05fr_.95fr]">
              <div className="grid gap-4 md:grid-cols-2">{currentServices.length ? currentServices.filter((service): service is Service => Boolean(service)).map((service) => <div key={service.id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="font-semibold">{service.name}</div><div className="mt-2 text-sm text-white/60">R$ {Number(service.price).toFixed(2)} · {service.duration_minutes} min</div><div className="mt-1 text-xs text-white/45">{service.is_active ? 'Ativo' : 'Inativo'}</div>{service.description ? <div className="mt-3 text-sm text-white/70">{service.description}</div> : null}<div className="mt-4 flex flex-wrap gap-2"><button type="button" className="btn btn-primary" onClick={() => editService(service)}>Editar</button><button type="button" className="btn btn-dark" onClick={() => removeService(service.id, service.name)} disabled={loadingSection === 'service-delete'}>Excluir</button></div></div>) : <div className="rounded-2xl border border-white/10 p-4 text-white/65">Nenhum serviço cadastrado.</div>}</div>
              <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-5"><h3 className="text-lg font-semibold">{serviceForm.id ? 'Editar serviço' : 'Adicionar serviço'}</h3><input className="field" placeholder="Nome do serviço" value={serviceForm.name} onChange={(e) => setServiceForm((prev) => ({ ...prev, name: e.target.value }))} /><div className="grid gap-3 md:grid-cols-2"><input className="field" type="number" step="0.01" placeholder="Valor" value={serviceForm.price} onChange={(e) => setServiceForm((prev) => ({ ...prev, price: e.target.value }))} /><input className="field" type="number" placeholder="Duração em minutos" value={serviceForm.duration_minutes} onChange={(e) => setServiceForm((prev) => ({ ...prev, duration_minutes: e.target.value }))} /></div><textarea className="field min-h-24" placeholder="Descrição do serviço" value={serviceForm.description} onChange={(e) => setServiceForm((prev) => ({ ...prev, description: e.target.value }))} /><label className="badge cursor-pointer gap-2"><input type="checkbox" checked={serviceForm.is_active} onChange={(e) => setServiceForm((prev) => ({ ...prev, is_active: e.target.checked }))} /> Serviço ativo</label><div className="flex flex-wrap gap-3"><button type="button" className="btn btn-primary" disabled={loadingSection === 'service'} onClick={saveService}>{loadingSection === 'service' ? 'Salvando...' : serviceForm.id ? 'Salvar serviço' : 'Adicionar serviço'}</button><button type="button" className="btn btn-dark" onClick={resetServiceForm}>Limpar</button></div></div>
            </div>
          </section>
        </> : null}

        {message ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">{message}</div> : null}
      </div>
    </div>
  );
}
