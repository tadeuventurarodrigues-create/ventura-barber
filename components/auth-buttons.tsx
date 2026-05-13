'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function AuthButtons() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <button className="badge" onClick={handleLogout}>
      Sair
    </button>
  );
}