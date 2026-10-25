import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyPreclearedCheck,
  clearLeadForOutreach,
  companyUnavailableClearance,
  denialMessage,
  isPreclearedHoldError,
  PRECLEARED_API_URL,
  PRECLEARED_BUY_URL,
  PRECLEARED_GET_KEY_URL,
  preclearedHoldRecord,
  preclearedInputsHash,
  preclearedSettingsFromCompany,
  PreclearedHoldError,
  type PreclearedDeps,
  type PreclearedSettings,
  type PreclearedStore,
} from './precleared';
import type { PreclearedCheck } from '../types';

const NOW = new Date('2026-10-25T10:00:00Z');
const KEY = 'pc_live_SECRETKEY123';

const settings: PreclearedSettings = {
  enabled: true,
  senderCountry: 'GB',
  addressSource: 'published',
  prospectCountry: null,
  pitch: 'Daily cold outbound on autopilot for B2B teams.',
};

const okBody = {
  verdict: 'ok_to_email',
  reasons: [{ rule_key: 'uk_pecr_corporate', text: 'Corporate subscribers may be emailed without prior consent.', source_title: 'PECR reg. 22', source_url: 'https://www.legislation.gov.uk/uksi/2003/2426/regulation/22' }],
  footer_text: 'Identify the sender and give a working opt-out.',
  next_step: 'Send with the footer requirements met.',
  receipt: { id: 'rcpt_ok_1' },
  facts: { recipient_country: 'GB' },
};

const consentBody = {
  verdict: 'consent_needed',
  reasons: [{ rule_key: 'de_uwg_7', text: 'Germany requires prior express consent for marketing email, including to businesses.', source_title: 'UWG §7', source_url: 'https://www.gesetze-im-internet.de/uwg_2004/__7.html' }],
  footer_text: '',
  next_step: 'Ask for consent through another channel first.',
  receipt: { id: 'rcpt_consent_1' },
  facts: { recipient_country: 'DE' },
};

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(text, { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function memoryStore() {
  const rows = new Map<string, PreclearedCheck>();
  const store: PreclearedStore & { rows: Map<string, PreclearedCheck> } = {
    rows,
    get: vi.fn(async (email: string, inputsHash: string) => rows.get(`${email}|${inputsHash}`) ?? null),
    save: vi.fn(async (check: PreclearedCheck) => {
      rows.set(`${check.email}|${check.inputs_hash}`, check);
    }),
  };
  return store;
}

function makeDeps(fetchImpl: PreclearedDeps['fetchImpl'], overrides: Partial<PreclearedDeps> = {}) {
  const store = memoryStore();
  const deps = {
    fetchImpl,
    store,
    apiKey: undefined as string | undefined,
    now: () => NOW,
    markSkipped: vi.fn(async () => {}),
    recordHold: vi.fn(async () => {}),
    ...overrides,
  };
  return { deps, store };
}

function fetchReturning(...responses: Array<Response | Error>) {
  const queue = [...responses];
  return vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error('no more mocked responses');
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as PreclearedDeps['fetchImpl'];
}

function sentRequest(fetchImpl: PreclearedDeps['fetchImpl'], call = 0) {
  const mock = fetchImpl as unknown as ReturnType<typeof vi.fn>;
  const [url, init] = mock.mock.calls[call] as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) as Record<string, unknown> };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('preclearedSettingsFromCompany', () => {
  it('reads an un-migrated or empty company row as "check off" with safe defaults', () => {
    expect(preclearedSettingsFromCompany(undefined)).toEqual({ enabled: false, senderCountry: 'GB', addressSource: 'unknown', prospectCountry: null, pitch: '' });
    expect(preclearedSettingsFromCompany({ description: 'x' }).enabled).toBe(false);
  });

  it('maps the company columns, trims the pitch to 200 characters and normalises the prospect country', () => {
    const s = preclearedSettingsFromCompany({
      precleared_enabled: true,
      precleared_sender_country: 'US',
      precleared_address_source: 'scraped',
      precleared_prospect_country: ' ca ',
      description: 'a'.repeat(250),
    });
    expect(s).toMatchObject({ enabled: true, senderCountry: 'US', addressSource: 'scraped', prospectCountry: 'CA' });
    expect(s.pitch).toHaveLength(200);
  });

  it('falls back to defaults for values outside the allowed sets', () => {
    const s = preclearedSettingsFromCompany({ precleared_enabled: true, precleared_sender_country: 'FR', precleared_address_source: 'stolen', precleared_prospect_country: 'USA' });
    expect(s).toMatchObject({ senderCountry: 'GB', addressSource: 'unknown', prospectCountry: null });
  });
});

describe('preclearedInputsHash', () => {
  it('changes when any fact Precleared decides on changes, and ignores an unset prospect country', () => {
    const base = preclearedInputsHash(settings);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(preclearedInputsHash({ ...settings })).toBe(base);
    expect(preclearedInputsHash({ ...settings, senderCountry: 'US' })).not.toBe(base);
    expect(preclearedInputsHash({ ...settings, addressSource: 'bought' })).not.toBe(base);
    expect(preclearedInputsHash({ ...settings, pitch: 'Something else' })).not.toBe(base);
    expect(preclearedInputsHash({ ...settings, prospectCountry: 'GB' })).not.toBe(base);
    expect(preclearedInputsHash({ ...settings, enabled: false })).toBe(base);
  });
});

describe('clearLeadForOutreach', () => {
  it('asks nothing when the check is off', async () => {
    const fetchImpl = fetchReturning();
    const { deps, store } = makeDeps(fetchImpl);
    const result = await clearLeadForOutreach({ email: 'a@example.com', settings: { ...settings, enabled: false }, deps });
    expect(result).toEqual({ status: 'not_checked' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.get).not.toHaveBeenCalled();
  });

  it('sends exactly the documented fields, keyless, and allows ok_to_email with the receipt', async () => {
    const fetchImpl = fetchReturning(response(200, okBody));
    const { deps, store } = makeDeps(fetchImpl);

    const result = await clearLeadForOutreach({ email: '  Jane.Doe@Example.COM ', settings, deps });

    expect(result).toEqual({ status: 'allowed', verdict: 'ok_to_email', receiptId: 'rcpt_ok_1', cached: false });
    const { url, init, headers, body } = sentRequest(fetchImpl);
    expect(url).toBe(PRECLEARED_API_URL);
    expect(init.method).toBe('POST');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(body).toEqual({
      recipient_email: 'jane.doe@example.com',
      sender_country: 'GB',
      address_source: 'published',
      existing_customer: false,
      pitch: settings.pitch,
    });
    expect(body).not.toHaveProperty('default_recipient_country');
    expect(headers.Authorization).toBeUndefined();
    expect(headers['User-Agent']).toContain('autogtm');
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(store.rows.get(`jane.doe@example.com|${preclearedInputsHash(settings)}`)).toMatchObject({
      verdict: 'ok_to_email',
      receipt_id: 'rcpt_ok_1',
      recipient_country: 'GB',
      checked_at: NOW.toISOString(),
    });
  });

  it('sends the bearer key and default_recipient_country when configured, never the email copy or lead name', async () => {
    const fetchImpl = fetchReturning(response(200, okBody));
    const { deps } = makeDeps(fetchImpl, { apiKey: KEY });
    await clearLeadForOutreach({ email: 'a@example.com', settings: { ...settings, prospectCountry: 'US' }, deps });
    const { headers, body } = sentRequest(fetchImpl);
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(body.default_recipient_country).toBe('US');
    expect(Object.keys(body).sort()).toEqual(['address_source', 'default_recipient_country', 'existing_customer', 'pitch', 'recipient_email', 'sender_country']);
  });

  it('holds consent_needed as a denial with the rule, its source and the next step, and caches it', async () => {
    const fetchImpl = fetchReturning(response(200, consentBody));
    const { deps, store } = makeDeps(fetchImpl);
    const result = await clearLeadForOutreach({ email: 'hans@example.de', settings, deps });
    expect(result).toMatchObject({ status: 'denied', verdict: 'consent_needed', receiptId: 'rcpt_consent_1', cached: false });
    expect(result.status === 'denied' && result.message).toBe(
      'Precleared: Germany requires prior express consent for marketing email, including to businesses. (UWG §7). Ask for consent through another channel first.',
    );
    expect(store.rows.size).toBe(1);
    expect([...store.rows.values()][0]).toMatchObject({ verdict: 'consent_needed', reason: 'Germany requires prior express consent for marketing email, including to businesses. (UWG §7)', next_step: 'Ask for consent through another channel first.' });
  });

  it('holds blocked and caches it', async () => {
    const fetchImpl = fetchReturning(response(200, { verdict: 'blocked', reasons: [{ rule_key: 'suppressed', text: 'This address has opted out.', source_title: 'Suppression list' }], next_step: 'Do not email.', receipt: { id: 'r' } }));
    const { deps, store } = makeDeps(fetchImpl);
    const result = await clearLeadForOutreach({ email: 'no@example.com', settings, deps });
    expect(result).toMatchObject({ status: 'denied', verdict: 'blocked', message: 'Precleared: This address has opted out. (Suppression list). Do not email.' });
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it('holds unknown but does not cache it, and adds a next step when Precleared gives none', async () => {
    const fetchImpl = fetchReturning(response(200, { verdict: 'unknown', reasons: [{ note: 'Could not establish the recipient country.' }], receipt: { id: 'rcpt_unknown' } }));
    const { deps, store } = makeDeps(fetchImpl);
    const result = await clearLeadForOutreach({ email: 'who@example.io', settings, deps });
    expect(result).toMatchObject({ status: 'denied', verdict: 'unknown', receiptId: 'rcpt_unknown' });
    expect(result.status === 'denied' && result.message).toBe(
      "Precleared: Could not establish the recipient country. If all your leads are in one country, set the prospects' country in the Autopilot tab, then press Undo on the lead to check it again.",
    );
    expect(store.save).not.toHaveBeenCalled();
  });

  it('treats a 400 invalid_request as a per-lead denial that is not cached', async () => {
    const fetchImpl = fetchReturning(response(400, { error: 'invalid_request', message: 'recipient_email is not a valid address' }));
    const { deps, store } = makeDeps(fetchImpl);
    const result = await clearLeadForOutreach({ email: 'not-an-email', settings, deps });
    expect(result).toMatchObject({ status: 'denied', verdict: 'invalid_request', message: 'Precleared: request rejected (recipient_email is not a valid address). Check the address, then press Undo on the lead to check it again.' });
    expect(store.save).not.toHaveBeenCalled();
  });

  it('maps a keyless 429 daily_limit to a hold that points at the free key', async () => {
    const fetchImpl = fetchReturning(response(429, { error: 'daily_limit', get_key_url: 'https://precleared.dev/get-key?src=autogtm' }));
    const { deps, store } = makeDeps(fetchImpl);
    const result = await clearLeadForOutreach({ email: 'a@example.com', settings, deps });
    expect(result).toMatchObject({ status: 'held', kind: 'daily_limit', fixUrl: 'https://precleared.dev/get-key?src=autogtm' });
    expect(result.status === 'held' && result.message).toContain('PRECLEARED_API_KEY');
    expect(result.status === 'held' && result.message).toContain('Leads stay in Ready to Add');
    expect(store.save).not.toHaveBeenCalled();
  });

  it('words a 429 daily_limit differently when a key is already set, and ignores a get_key_url on another host', async () => {
    const fetchImpl = fetchReturning(response(429, { error: 'daily_limit', get_key_url: 'https://evil.example/get-key' }));
    const { deps } = makeDeps(fetchImpl, { apiKey: KEY });
    const result = await clearLeadForOutreach({ email: 'a@example.com', settings, deps });
    expect(result).toMatchObject({ status: 'held', kind: 'daily_limit', fixUrl: PRECLEARED_GET_KEY_URL });
    expect(result.status === 'held' && result.message).toContain('for your key');
  });

  it('maps a 429 rate_limited to a retry-later hold with the retry_after', async () => {
    const fetchImpl = fetchReturning(response(429, { error: 'rate_limited', retry_after: 30 }));
    const { deps } = makeDeps(fetchImpl);
    const result = await clearLeadForOutreach({ email: 'a@example.com', settings, deps });
    expect(result).toMatchObject({ status: 'held', kind: 'rate_limited', fixUrl: null });
    expect(result.status === 'held' && result.message).toContain('retry after 30s');
  });

  it('maps a 402 to out_of_checks with the checkout link from the body', async () => {
    const buy = 'https://checkout.stripe.com/c/pay/cs_test_123';
    const fetchImpl = fetchReturning(response(402, { error: 'payment_required', buy_url: buy }));
    const { deps } = makeDeps(fetchImpl, { apiKey: KEY });
    const result = await clearLeadForOutreach({ email: 'a@example.com', settings, deps });
    expect(result).toMatchObject({ status: 'held', kind: 'out_of_checks', fixUrl: buy });
    expect(result.status === 'held' && result.message).toContain(buy);
  });

  it('falls back to the buy page when the 402 link is not https, not Precleared, or carries the key', async () => {
    for (const buy_url of ['http://precleared.dev/buy', 'https://attacker.example/buy', `https://precleared.dev/buy?key=${KEY}`, 'https://precleared.dev/buy with space', 42]) {
      const fetchImpl = fetchReturning(response(402, { error: 'payment_required', buy_url }));
      const { deps } = makeDeps(fetchImpl, { apiKey: KEY });
      const result = await clearLeadForOutreach({ email: 'a@example.com', settings, deps });
      expect(result).toMatchObject({ status: 'held', kind: 'out_of_checks', fixUrl: PRECLEARED_BUY_URL });
      expect(result.status === 'held' && result.message).not.toContain(KEY);
    }
  });

  it('maps a 401 to key_rejected', async () => {
    const fetchImpl = fetchReturning(response(401, { error: 'unauthorized' }));
    const { deps } = makeDeps(fetchImpl, { apiKey: KEY });
    const result = await clearLeadForOutreach({ email: 'a@example.com', settings, deps });
    expect(result).toMatchObject({ status: 'held', kind: 'key_rejected', fixUrl: PRECLEARED_GET_KEY_URL });
  });

  it('holds as unavailable on a 5xx, a network error, a timeout, a non-JSON body and an unknown verdict', async () => {
    const cases: Array<[Response | Error, string]> = [
      [response(503, { error: 'maintenance' }), 'HTTP 503'],
      [new TypeError('fetch failed'), 'fetch failed'],
      [new DOMException('The operation was aborted due to timeout', 'TimeoutError'), 'timed out after 10s'],
      [response(200, '<html>not json</html>'), 'not a JSON object'],
      [response(200, { verdict: 'maybe' }), 'without a known verdict'],
      [response(200, [1, 2, 3]), 'not a JSON object'],
    ];
    for (const [answer, fragment] of cases) {
      const fetchImpl = fetchReturning(answer);
      const { deps, store } = makeDeps(fetchImpl);
      const result = await clearLeadForOutreach({ email: 'a@example.com', settings, deps });
      expect(result).toMatchObject({ status: 'held', kind: 'unavailable', fixUrl: null });
      expect(result.status === 'held' && result.message).toContain(fragment);
      expect(store.save).not.toHaveBeenCalled();
    }
  });

  it('never lets the API key into a message', async () => {
    const fetchImpl = fetchReturning(
      response(500, { error: `bad key ${KEY}` }),
      response(200, { verdict: 'consent_needed', reasons: [{ text: `token ${KEY} rejected`, source_title: KEY }], next_step: `see ${encodeURIComponent(KEY)}` }),
    );
    const { deps } = makeDeps(fetchImpl, { apiKey: KEY });
    const held = await clearLeadForOutreach({ email: 'a@example.com', settings, deps });
    expect(JSON.stringify(held)).not.toContain(KEY);
    const denied = await clearLeadForOutreach({ email: 'b@example.com', settings, deps });
    expect(JSON.stringify(denied)).not.toContain(KEY);
    expect(denied.status === 'denied' && denied.message).toContain('[redacted]');
  });

  it('serves a cached verdict without calling Precleared, and reports it as cached', async () => {
    const fetchImpl = fetchReturning(response(200, okBody), response(200, consentBody));
    const { deps, store } = makeDeps(fetchImpl);
    const first = await clearLeadForOutreach({ email: 'a@example.com', settings, deps });
    const second = await clearLeadForOutreach({ email: 'A@example.com', settings, deps });
    expect(first).toMatchObject({ status: 'allowed', cached: false });
    expect(second).toEqual({ status: 'allowed', verdict: 'ok_to_email', receiptId: 'rcpt_ok_1', cached: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(store.get).toHaveBeenCalledTimes(2);

    const deniedFresh = await clearLeadForOutreach({ email: 'hans@example.de', settings, deps });
    const deniedCached = await clearLeadForOutreach({ email: 'hans@example.de', settings, deps });
    expect(deniedFresh).toMatchObject({ status: 'denied', cached: false });
    expect(deniedCached).toMatchObject({ status: 'denied', verdict: 'consent_needed', cached: true, receiptId: 'rcpt_consent_1' });
    expect(deniedCached.status === 'denied' && deniedCached.message).toBe(deniedFresh.status === 'denied' ? deniedFresh.message : '');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('ignores a cache row older than 30 days and asks again', async () => {
    const fetchImpl = fetchReturning(response(200, okBody));
    const { deps, store } = makeDeps(fetchImpl);
    store.rows.set(`a@example.com|${preclearedInputsHash(settings)}`, {
      email: 'a@example.com',
      inputs_hash: preclearedInputsHash(settings),
      verdict: 'blocked',
      reason: 'old',
      next_step: null,
      receipt_id: 'old',
      recipient_country: null,
      checked_at: new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const result = await clearLeadForOutreach({ email: 'a@example.com', settings, deps });
    expect(result).toMatchObject({ status: 'allowed', cached: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('asks again when the settings behind the fingerprint change', async () => {
    const fetchImpl = fetchReturning(response(200, okBody), response(200, consentBody));
    const { deps } = makeDeps(fetchImpl);
    await clearLeadForOutreach({ email: 'a@example.com', settings, deps });
    const changed = await clearLeadForOutreach({ email: 'a@example.com', settings: { ...settings, addressSource: 'bought' }, deps });
    expect(changed).toMatchObject({ status: 'denied', verdict: 'consent_needed', cached: false });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('treats a failing cache as a miss and still answers', async () => {
    const fetchImpl = fetchReturning(response(200, okBody));
    const broken: PreclearedStore = {
      get: vi.fn(async () => { throw new Error('relation "precleared_checks" does not exist'); }),
      save: vi.fn(async () => { throw new Error('relation "precleared_checks" does not exist'); }),
    };
    const { deps } = makeDeps(fetchImpl, { store: broken });
    const result = await clearLeadForOutreach({ email: 'a@example.com', settings, deps });
    expect(result).toMatchObject({ status: 'allowed', receiptId: 'rcpt_ok_1' });
  });
});

describe('denialMessage', () => {
  it('formats "Precleared: <rule> (<source>). <next step>" without doubling the full stop', () => {
    expect(denialMessage('consent_needed', 'Rule text (Source)', 'Do this next.')).toBe('Precleared: Rule text (Source). Do this next.');
    expect(denialMessage('blocked', 'Already ends with a stop.', '')).toBe('Precleared: Already ends with a stop.');
    expect(denialMessage('consent_needed', '', '')).toBe('Precleared: consent is needed before a cold email can go to this address.');
  });

  it('keeps the line to 300 characters and strips control characters', () => {
    const long = denialMessage('blocked', 'x'.repeat(400), 'y');
    expect(long.length).toBeLessThanOrEqual(300);
    const cleaned = denialMessage('blocked', 'line\u001b[2Jbreak\nhere\u0007', 'next\r\nstep');
    expect(cleaned).not.toMatch(/\p{Cc}/u);
    expect(cleaned).toBe('Precleared: line [2Jbreak here. next step');
  });
});

describe('applyPreclearedCheck', () => {
  const company = { id: 'company-1', description: settings.pitch, precleared_enabled: true, precleared_sender_country: 'GB', precleared_address_source: 'published', precleared_prospect_country: null, precleared_last_hold: null };

  it('does nothing when the check is off or the company is missing', async () => {
    const fetchImpl = fetchReturning();
    const { deps } = makeDeps(fetchImpl);
    expect(await applyPreclearedCheck({ leadId: 'lead-1', email: 'a@example.com', company: { ...company, precleared_enabled: false }, deps })).toEqual({ status: 'not_checked' });
    expect(await applyPreclearedCheck({ leadId: 'lead-1', email: 'a@example.com', company: null, deps })).toEqual({ status: 'not_checked' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(deps.markSkipped).not.toHaveBeenCalled();
    expect(deps.recordHold).not.toHaveBeenCalled();
  });

  it('marks a denied lead Skipped with the Precleared message', async () => {
    const fetchImpl = fetchReturning(response(200, consentBody));
    const { deps } = makeDeps(fetchImpl);
    const result = await applyPreclearedCheck({ leadId: 'lead-1', email: 'hans@example.de', company, deps });
    expect(result.status).toBe('denied');
    expect(deps.markSkipped).toHaveBeenCalledWith('lead-1', expect.stringMatching(/^Precleared: Germany requires prior express consent/));
    expect(deps.recordHold).not.toHaveBeenCalled();
  });

  it('records a hold on the company and leaves the lead alone when the check cannot be made', async () => {
    const fetchImpl = fetchReturning(response(429, { error: 'daily_limit' }));
    const { deps } = makeDeps(fetchImpl);
    const result = await applyPreclearedCheck({ leadId: 'lead-1', email: 'a@example.com', company, deps });
    expect(result).toMatchObject({ status: 'held', kind: 'daily_limit' });
    expect(deps.markSkipped).not.toHaveBeenCalled();
    expect(deps.recordHold).toHaveBeenCalledWith('company-1', {
      kind: 'daily_limit',
      message: expect.stringContaining('PRECLEARED_API_KEY'),
      fix_url: PRECLEARED_GET_KEY_URL,
      at: NOW.toISOString(),
    });
  });

  it('clears an earlier hold on the next fresh answer, but not on a cache hit', async () => {
    const fetchImpl = fetchReturning(response(200, okBody));
    const { deps } = makeDeps(fetchImpl);
    const heldCompany = { ...company, precleared_last_hold: { kind: 'unavailable', message: 'x', fix_url: null, at: NOW.toISOString() } as const };
    const fresh = await applyPreclearedCheck({ leadId: 'lead-1', email: 'a@example.com', company: heldCompany, deps });
    expect(fresh).toMatchObject({ status: 'allowed', receiptId: 'rcpt_ok_1' });
    expect(deps.recordHold).toHaveBeenCalledWith('company-1', null);

    (deps.recordHold as ReturnType<typeof vi.fn>).mockClear();
    const cached = await applyPreclearedCheck({ leadId: 'lead-2', email: 'a@example.com', company: heldCompany, deps });
    expect(cached).toMatchObject({ status: 'allowed', cached: true });
    expect(deps.recordHold).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('still reports the hold when recording it fails', async () => {
    const fetchImpl = fetchReturning(new TypeError('fetch failed'));
    const { deps } = makeDeps(fetchImpl, { recordHold: vi.fn(async () => { throw new Error('db down'); }) });
    const result = await applyPreclearedCheck({ leadId: 'lead-1', email: 'a@example.com', company, deps });
    expect(result).toMatchObject({ status: 'held', kind: 'unavailable' });
  });
});

describe('PreclearedHoldError', () => {
  it('carries the clearance and its message, and is recognised across module copies by name', () => {
    const fetchImpl = fetchReturning(response(402, { error: 'payment_required' }));
    const { deps } = makeDeps(fetchImpl, { apiKey: KEY });
    return clearLeadForOutreach({ email: 'a@example.com', settings, deps }).then((clearance) => {
      if (clearance.status !== 'held') throw new Error('expected a hold');
      const error = new PreclearedHoldError(clearance);
      expect(error.message).toBe(clearance.message);
      expect(error.name).toBe('PreclearedHoldError');
      expect(isPreclearedHoldError(error)).toBe(true);
      const lookalike = Object.assign(new Error(clearance.message), { name: 'PreclearedHoldError', clearance });
      expect(isPreclearedHoldError(lookalike)).toBe(true);
      expect(isPreclearedHoldError(new Error('other'))).toBe(false);
      expect(preclearedHoldRecord(clearance, NOW)).toEqual({ kind: 'out_of_checks', message: clearance.message, fix_url: PRECLEARED_BUY_URL, at: NOW.toISOString() });
    });
  });
});

describe('companyUnavailableClearance', () => {
  it('is a hold, never a send, when the company row cannot be loaded', () => {
    // Supabase reports a PostgrestError as a plain object, not an Error.
    const clearance = companyUnavailableClearance({ message: 'connection refused', code: '08006', details: null, hint: null });
    expect(clearance).toMatchObject({ status: 'held', kind: 'unavailable', fixUrl: null });
    expect(clearance.message).toContain("company's settings could not be loaded (connection refused)");
    expect(clearance.message).toContain('Leads stay in Ready to Add');
    expect(new PreclearedHoldError(clearance).message).toBe(clearance.message);
  });

  it('handles an Error and a missing row the same way', () => {
    expect(companyUnavailableClearance(new TypeError('fetch failed')).message).toContain('(TypeError: fetch failed)');
    const noRow = companyUnavailableClearance(null);
    expect(noRow).toMatchObject({ status: 'held', kind: 'unavailable' });
    expect(noRow.message).toBe(
      "The company's settings could not be loaded, so the compliance check could not be made. Leads stay in Ready to Add and are checked again on the next run.",
    );
  });

  it('keeps the message to one readable line', () => {
    const clearance = companyUnavailableClearance({ message: 'line one\nline two\t' + 'x'.repeat(400) });
    expect(clearance.message).not.toMatch(/[\n\t]/);
    expect(clearance.message.length).toBeLessThanOrEqual(300);
  });
});
