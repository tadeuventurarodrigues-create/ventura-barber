// Ventura Barber — Service Worker
// Gerencia notificações de novos agendamentos em background

const CACHE_NAME = 'ventura-barber-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Recebe mensagem do painel para começar polling
self.addEventListener('message', (event) => {
  if (event.data?.type === 'START_BOOKING_POLL') {
    startPolling(event.data.professionalId, event.data.barbershopId, event.data.lastBookingId);
  }
  if (event.data?.type === 'STOP_POLL') {
    stopPolling();
  }
});

let pollInterval = null;
let lastKnownBookingId = null;
let pollProfessionalId = null;
let pollBarbershopId = null;

function startPolling(professionalId, barbershopId, lastBookingId) {
  pollProfessionalId = professionalId;
  pollBarbershopId = barbershopId;
  lastKnownBookingId = lastBookingId;

  if (pollInterval) clearInterval(pollInterval);

  // Verifica a cada 30 segundos
  pollInterval = setInterval(checkNewBookings, 30000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function checkNewBookings() {
  if (!pollProfessionalId || !pollBarbershopId) return;

  try {
    const url = `/api/bookings/new-check?professional_id=${pollProfessionalId}&barbershop_id=${pollBarbershopId}&last_id=${lastKnownBookingId || ''}`;
    const res = await fetch(url);
    if (!res.ok) return;

    const data = await res.json();

    if (data.newBookings && data.newBookings.length > 0) {
      lastKnownBookingId = data.newBookings[0].id;

      for (const booking of data.newBookings) {
        await self.registration.showNotification('✂️ Novo agendamento!', {
          body: `${booking.customer_name} agendou ${booking.service_name} às ${booking.start_time}`,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: `booking-${booking.id}`,
          renotify: true,
          data: { bookingId: booking.id },
          actions: [
            { action: 'open', title: 'Ver painel' },
          ],
        });
      }

      // Notifica o painel para recarregar a lista
      const allClients = await clients.matchAll({ type: 'window' });
      allClients.forEach((client) => {
        client.postMessage({ type: 'NEW_BOOKINGS', bookings: data.newBookings });
      });
    }
  } catch (err) {
    // silently fail
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Se já tem o painel aberto, foca nele
      for (const client of clientList) {
        if (client.url.includes('/shop') && 'focus' in client) {
          return client.focus();
        }
      }
      // Senão abre uma nova janela
      if (clients.openWindow) {
        return clients.openWindow('/shop');
      }
    })
  );
});
