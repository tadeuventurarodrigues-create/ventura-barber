import { notFound } from 'next/navigation';
import { CancelBookingForm } from '@/components/cancel-booking-form';
import { SiteHeader } from '@/components/site-header';
import { verifyBookingCancelToken } from '@/lib/booking-cancel-token';

export default async function CancelBookingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verified = verifyBookingCancelToken(token);

  if (!verified) {
    notFound();
  }

  return (
    <main>
      <SiteHeader />
      <section className="mx-auto max-w-md px-6 py-16">
        <CancelBookingForm token={token} />
      </section>
    </main>
  );
}
