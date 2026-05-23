import { createHmac, timingSafeEqual } from 'crypto';

const TOKEN_VERSION = 'v1';

function getSecret() {
  const secret =
    process.env.CANCEL_LINK_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    '';

  if (!secret) {
    throw new Error('Cancel link secret is not configured.');
  }

  return secret;
}

function encode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(payload: string) {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export function createBookingCancelToken(bookingId: string) {
  const payload = `${TOKEN_VERSION}.${bookingId}`;
  return `${encode(payload)}.${sign(payload)}`;
}

export function verifyBookingCancelToken(token: string) {
  const [encodedPayload, signature] = String(token || '').split('.');

  if (!encodedPayload || !signature) {
    return null;
  }

  const payload = decode(encodedPayload);
  const expected = sign(payload);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return null;
  }

  const [version, bookingId] = payload.split('.');

  if (version !== TOKEN_VERSION || !bookingId) {
    return null;
  }

  return { bookingId };
}

export function getPublicBaseUrl(req?: Request) {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '');
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, '');
  }

  if (req) {
    const url = new URL(req.url);
    return url.origin;
  }

  return '';
}

export function createBookingCancelUrl(bookingId: string, req?: Request) {
  const baseUrl = getPublicBaseUrl(req);
  const token = createBookingCancelToken(bookingId);
  return `${baseUrl}/cancelar/${token}`;
}
