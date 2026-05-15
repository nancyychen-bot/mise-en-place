const BASE = 'https://api.resy.com';

interface BookingDetails {
  bookToken: string;
  paymentMethodId: number | null;
}

interface BookingResult {
  success: boolean;
  confirmationId?: string;
  error?: string;
  authExpired?: boolean;
}

function resyHeaders(apiKey: string, authToken: string) {
  return {
    Authorization: `ResyAPI api_key="${apiKey}"`,
    'x-resy-auth-token': authToken,
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    'X-Origin': 'https://resy.com',
    Referer: 'https://resy.com/',
  };
}

export async function getResyBookingDetails(
  apiKey: string,
  authToken: string,
  configId: string,
  day: string,
  partySize: number,
): Promise<BookingDetails> {
  const params = new URLSearchParams({
    config_id: configId,
    day,
    party_size: String(partySize),
  });

  const res = await fetch(`${BASE}/3/details`, {
    method: 'POST',
    headers: resyHeaders(apiKey, authToken),
    body: params.toString(),
  });

  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error('RESY_AUTH_EXPIRED'), { authExpired: true });
  }
  if (!res.ok) throw new Error(`details_http_${res.status}`);

  const data = await res.json() as Record<string, unknown>;
  const bookToken = (data as { book_token?: { value?: string } }).book_token?.value;
  if (!bookToken) throw new Error('no_book_token');

  const paymentMethodId = (data as { user?: { payment_methods?: { id: number }[] } })
    .user?.payment_methods?.[0]?.id ?? null;

  return { bookToken, paymentMethodId };
}

export async function bookResySlot(
  apiKey: string,
  authToken: string,
  bookToken: string,
  paymentMethodId: number | null,
): Promise<BookingResult> {
  const params = new URLSearchParams({ book_token: bookToken });
  if (paymentMethodId != null) {
    params.set('struct_payment_method', JSON.stringify({ id: paymentMethodId }));
  }

  const res = await fetch(`${BASE}/3/book`, {
    method: 'POST',
    headers: resyHeaders(apiKey, authToken),
    body: params.toString(),
  });

  if (res.status === 401 || res.status === 403) {
    return { success: false, error: 'auth_expired', authExpired: true };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { success: false, error: `http_${res.status}: ${text.slice(0, 200)}` };
  }

  const data = await res.json() as Record<string, unknown>;
  const resyToken = (data as { resy_token?: string }).resy_token;
  return { success: true, confirmationId: resyToken ?? 'confirmed' };
}
