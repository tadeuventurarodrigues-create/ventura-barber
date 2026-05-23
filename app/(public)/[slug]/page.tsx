import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PublicBookingForm } from '@/components/public-booking-form';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getBarbershopSubscriptionStatus } from '@/lib/subscriptions';

export default async function PublicBarbershopPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { data: shop } = await supabaseAdmin
    .from('barbershops')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (!shop) {
    notFound();
  }

  const subscription = await getBarbershopSubscriptionStatus(shop.id);

  const { data: services } = await supabaseAdmin
    .from('services')
    .select('*')
    .eq('barbershop_id', shop.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  const { data: professionals } = await supabaseAdmin
    .from('professionals')
    .select('*')
    .eq('barbershop_id', shop.id)
    .eq('is_active', true)
    .eq('accepts_booking', true)
    .order('created_at', { ascending: true });

  const { data: loyalty } = await supabaseAdmin
    .from('loyalty_settings')
    .select('*')
    .eq('barbershop_id', shop.id)
    .maybeSingle();

  return (
    <main style={{ ['--brand' as string]: shop.primary_color || '#c49b63' }}>
      <section className="relative overflow-hidden border-b border-white/10">
        <div
          className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-20"
          style={{
            backgroundImage: `url(${
              shop.cover_image_url ||
              'https://images.unsplash.com/photo-1621605815971-fbc98d665033?q=80&w=1600&auto=format&fit=crop'
            })`,
          }}
        />

        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <div className="mb-4 flex items-center gap-4">
              <img
                src={shop.logo_url || 'https://dummyimage.com/96x96/222/fff&text=VB'}
                alt={shop.name}
                className="h-20 w-20 rounded-3xl border border-white/10 object-cover"
              />

              <div>
                <div className="badge">Link exclusivo de agendamento</div>
                <h1 className="mt-3 text-4xl font-bold">{shop.name}</h1>
              </div>
            </div>

            <p className="max-w-2xl text-lg text-white/75">
              {shop.description || 'Agende seu horário em poucos toques.'}
            </p>

            <div className="mt-6 flex flex-wrap gap-3 text-sm text-white/65">
              {shop.address ? <span className="badge">{shop.address}</span> : null}
              {shop.opening_hours_text ? (
                <span className="badge">{shop.opening_hours_text}</span>
              ) : null}
              {shop.whatsapp_number ? (
                <span className="badge">{shop.whatsapp_number}</span>
              ) : null}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`/${slug}#agendar`} className="btn btn-primary">
                Agendar agora
              </Link>
            </div>
          </div>

          <div id="agendar" className="panel relative z-10 p-6">
            <h2 className="mb-4 text-2xl font-bold">Agendar atendimento</h2>

            {subscription.blocked ? (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-white/80">
                Agenda temporariamente indisponivel. Entre em contato com a barbearia para mais
                informacoes.
              </div>
            ) : (
              <PublicBookingForm
                barbershopId={shop.id}
                barbershopName={shop.name}
                services={services || []}
                professionals={professionals || []}
                loyaltyEnabled={Boolean(loyalty?.enabled)}
                loyaltyRules={loyalty?.rules_text || ''}
                whatsappNumber={shop.whatsapp_number || null}
              />
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="panel p-6">
            <h2 className="mb-4 text-2xl font-bold">Serviços</h2>

            <div className="space-y-3">
              {(services || []).length ? (
                services!.map((service: any) => (
                  <div
                    key={service.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <strong>{service.name}</strong>
                      <span>R$ {Number(service.price).toFixed(2)}</span>
                    </div>

                    <div className="mt-2 text-sm text-white/65">
                      {service.description || 'Serviço disponível para agendamento.'}
                    </div>

                    <div className="mt-2 text-xs text-white/45">
                      {service.duration_minutes} min
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 p-4 text-white/65">
                  Nenhum serviço cadastrado.
                </div>
              )}
            </div>
          </div>

          <div className="panel p-6">
            <h2 className="mb-4 text-2xl font-bold">Barbeiros</h2>

            <div className="space-y-3">
              {(professionals || []).length ? (
                professionals!.map((professional: any) => (
                  <div
                    key={professional.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex gap-4">
                      <img
                        src={
                          professional.photo_url ||
                          'https://dummyimage.com/96x96/222/fff&text=B'
                        }
                        alt={professional.name}
                        className="h-16 w-16 rounded-2xl object-cover"
                      />

                      <div>
                        <strong>{professional.name}</strong>

                        <div className="mt-1 text-sm text-white/70">
                          {professional.specialty || 'Atendimento personalizado'}
                        </div>

                        <div className="mt-2 text-sm text-white/55">
                          {professional.description || 'Profissional disponível para agendamento.'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 p-4 text-white/65">
                  Nenhum barbeiro cadastrado.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
