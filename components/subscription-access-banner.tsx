import type { SubscriptionAccessStatus } from '@/lib/subscriptions';
import { SubscriptionPixButton } from '@/components/subscription-pix-button';

type Props = {
  subscription: SubscriptionAccessStatus;
};

export function SubscriptionAccessBanner({ subscription }: Props) {
  if (!subscription.known || !subscription.message) {
    return null;
  }

  return (
    <div className="panel mb-6 border-amber-500/30 bg-amber-500/10 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-bold">
            {subscription.blocked ? 'Sistema bloqueado' : 'Aviso de vencimento'}
          </h2>
          <p className="mt-1 text-sm text-white/75">{subscription.message}</p>
          {subscription.endDate ? (
            <p className="mt-1 text-xs text-white/55">
              Vencimento: {subscription.endDate.split('-').reverse().join('/')} · Valor: R${' '}
              {subscription.amountMonthly.toFixed(2)}
            </p>
          ) : null}
        </div>

        <SubscriptionPixButton />
      </div>
    </div>
  );
}
