/**
 * Optional per-lead cold-email check through Precleared (https://precleared.dev).
 *
 * Off by default. With `companies.precleared_enabled` on, the routing core asks
 * Precleared about each lead before the lead is first pushed into an Instantly
 * campaign: may a cold marketing email go to this address under UK PECR, US
 * CAN-SPAM, Canada's CASL, Germany's UWG and the other rules it covers? Only
 * `ok_to_email` lets the lead through; the signed receipt id is stored on the
 * lead so the decision can be shown later.
 *
 * One check per address: a definite verdict (ok_to_email, consent_needed,
 * blocked) is cached in `precleared_checks` for PRECLEARED_CACHE_DAYS together
 * with a fingerprint of the facts it was decided on (sender country, address
 * source, pitch and, if set, prospect country). A cached verdict is reused only
 * while those facts are unchanged, so a settings change forces a fresh check.
 * `unknown` is never cached.
 *
 * An answer Precleared cannot vouch for (network trouble, the daily allowance
 * used up, a key out of checks or rejected, a malformed body) is a *hold*: the
 * caller leaves the lead in Ready to Add and records what fixes it. Nothing is
 * ever sent unchecked.
 *
 * Precleared receives the lead's email address, the sender country, the address
 * source, the company description (first PRECLEARED_PITCH_MAX characters, as the
 * pitch) and, if set, the prospects' country. Never the email copy, never the
 * lead's name or bio. The verdict is decision support with sources, not legal
 * advice.
 */

import { createHash } from 'crypto';
import type {
  PreclearedAddressSource,
  PreclearedCheck,
  PreclearedHold,
  PreclearedHoldKind,
  PreclearedSenderCountry,
} from '../types';
import { getPreclearedCheck, markLeadSkipped, recordPreclearedHold, savePreclearedCheck } from '../db/autogtmDbCalls';

export const PRECLEARED_API_URL = 'https://precleared.dev/api/v1/check';
export const PRECLEARED_GET_KEY_URL = 'https://precleared.dev/get-key';
export const PRECLEARED_BUY_URL = 'https://precleared.dev/buy';
export const PRECLEARED_TIMEOUT_MS = 10_000;
export const PRECLEARED_CACHE_DAYS = 30;
export const PRECLEARED_PITCH_MAX = 200;

export const PRECLEARED_SENDER_COUNTRIES: readonly PreclearedSenderCountry[] = ['GB', 'US', 'AE'];
export const PRECLEARED_ADDRESS_SOURCES: readonly PreclearedAddressSource[] = ['published', 'bought', 'scraped', 'given', 'unknown'];

/** Bump when the facts in the fingerprint change, so older cache rows are ignored rather than reused. */
const CACHE_VERSION = 1;
const USER_AGENT = 'autogtm (+https://github.com/cmn-labs/autogtm)';
const MAX_MESSAGE = 300;
const MAX_URL = 2048;
/** A 402's checkout link is only followed to Precleared itself or its card checkout. */
const BUY_HOSTS = ['precleared.dev', 'checkout.stripe.com'];
const KEY_HOSTS = ['precleared.dev'];
const VERDICTS = ['ok_to_email', 'consent_needed', 'blocked', 'unknown'] as const;
const DEFINITE_VERDICTS = ['ok_to_email', 'consent_needed', 'blocked'] as const;

type Verdict = (typeof VERDICTS)[number];
type DefiniteVerdict = (typeof DEFINITE_VERDICTS)[number];

export interface PreclearedSettings {
  enabled: boolean;
  senderCountry: PreclearedSenderCountry;
  addressSource: PreclearedAddressSource;
  /** ISO 3166-1 alpha-2, sent as default_recipient_country only when set. */
  prospectCountry: string | null;
  /** The company description, trimmed to PRECLEARED_PITCH_MAX characters. */
  pitch: string;
}

/** The company columns the settings are read from (all optional, so an un-migrated database reads as "check off"). */
export interface PreclearedCompanyFields {
  description?: string | null;
  precleared_enabled?: boolean | null;
  precleared_sender_country?: string | null;
  precleared_address_source?: string | null;
  precleared_prospect_country?: string | null;
}

export function preclearedSettingsFromCompany(company: PreclearedCompanyFields | null | undefined): PreclearedSettings {
  const senderCountry = company?.precleared_sender_country;
  const addressSource = company?.precleared_address_source;
  const prospectCountry = (company?.precleared_prospect_country || '').trim().toUpperCase();
  return {
    enabled: company?.precleared_enabled === true,
    senderCountry: (PRECLEARED_SENDER_COUNTRIES as readonly string[]).includes(senderCountry || '')
      ? (senderCountry as PreclearedSenderCountry)
      : 'GB',
    addressSource: (PRECLEARED_ADDRESS_SOURCES as readonly string[]).includes(addressSource || '')
      ? (addressSource as PreclearedAddressSource)
      : 'unknown',
    prospectCountry: /^[A-Z]{2}$/.test(prospectCountry) ? prospectCountry : null,
    pitch: (company?.description || '').trim().slice(0, PRECLEARED_PITCH_MAX),
  };
}

/** Precleared's answer for one address. */
export type Clearance =
  /** The check is switched off for this company; nothing was asked. */
  | { status: 'not_checked' }
  /** ok_to_email: push the lead. `receiptId` is the signed receipt. */
  | { status: 'allowed'; verdict: 'ok_to_email'; receiptId: string; cached: boolean }
  /** A verdict other than ok_to_email, or a request Precleared rejected: hold the lead as Skipped with `message`. */
  | {
      status: 'denied';
      verdict: 'consent_needed' | 'blocked' | 'unknown' | 'invalid_request';
      /** The rule that decided it with its source, or Precleared's note. */
      reason: string;
      nextStep: string;
      receiptId: string;
      cached: boolean;
      /** "Precleared: <rule> (<source>). <next step>", which is what goes into leads.skip_reason. */
      message: string;
    }
  /** The check could not be made. Leave the lead in Ready to Add; `message` says what fixes it. */
  | { status: 'held'; kind: PreclearedHoldKind; message: string; fixUrl: string | null };

export type HeldClearance = Extract<Clearance, { status: 'held' }>;
export type DeniedClearance = Extract<Clearance, { status: 'denied' }>;

/** Thrown by the synchronous send path (campaign activation) when the lead may not go out. */
export class PreclearedHoldError extends Error {
  readonly clearance: HeldClearance | DeniedClearance;

  constructor(clearance: HeldClearance | DeniedClearance) {
    super(clearance.message);
    this.name = 'PreclearedHoldError';
    this.clearance = clearance;
  }
}

export function isPreclearedHoldError(error: unknown): error is PreclearedHoldError {
  return error instanceof PreclearedHoldError
    || (error instanceof Error && error.name === 'PreclearedHoldError' && 'clearance' in error);
}

/**
 * The company row could not be loaded, so whether the check is on is unknown.
 * Both send paths treat that as a hold: nothing goes out unchecked. (A row that
 * loads without the precleared_* columns is a different case and reads as "off".)
 */
export function companyUnavailableClearance(error: unknown): HeldClearance {
  const detail = describeError(error);
  return held(
    'unavailable',
    `The company's settings could not be loaded${detail ? ` (${detail})` : ''}, so the compliance check could not be made. Leads stay in Ready to Add and are checked again on the next run.`,
  );
}

/** Where cached verdicts live. The default is the precleared_checks table; tests inject a Map. */
export interface PreclearedStore {
  get(email: string, inputsHash: string): Promise<PreclearedCheck | null>;
  save(check: PreclearedCheck): Promise<void>;
}

export interface PreclearedDeps {
  fetchImpl: typeof fetch;
  store: PreclearedStore;
  /** PRECLEARED_API_KEY. Never logged; redacted from any message it turns up in. */
  apiKey: string | undefined;
  now: () => Date;
  /** How a denied lead is held (leads.campaign_status = skipped with the reason). */
  markSkipped: (leadId: string, reason: string) => Promise<void>;
  /** How a hold is recorded on the company (null clears it). */
  recordHold: (companyId: string, hold: PreclearedHold | null) => Promise<void>;
}

const defaultStore: PreclearedStore = {
  get: getPreclearedCheck,
  save: savePreclearedCheck,
};

function resolveDeps(deps: Partial<PreclearedDeps> | undefined): PreclearedDeps {
  return {
    fetchImpl: deps?.fetchImpl ?? fetch,
    store: deps?.store ?? defaultStore,
    apiKey: deps && 'apiKey' in deps ? deps.apiKey : (process.env.PRECLEARED_API_KEY || undefined),
    now: deps?.now ?? (() => new Date()),
    markSkipped: deps?.markSkipped ?? markLeadSkipped,
    recordHold: deps?.recordHold ?? recordPreclearedHold,
  };
}

/** The company row as the send paths load it: the settings plus the hold marker. */
export interface PreclearedCompanyRow extends PreclearedCompanyFields {
  id: string;
  precleared_last_hold?: PreclearedHold | null;
}

/**
 * Run the check for one lead and apply the outcome: a hold is recorded on the
 * company, a verdict other than ok_to_email holds the lead as Skipped with the
 * reason, a fresh answer clears an earlier hold, and ok_to_email is logged with
 * its receipt. Returns the clearance so the caller decides how to report it (a
 * structured result for the sweep, a thrown PreclearedHoldError for a route).
 *
 * Used by both send paths (addLeadToCampaignCore and sendDraftCampaignForLead),
 * so the campaign activation route cannot bypass the check; when the core has
 * already asked, the second call is a cache hit.
 */
export async function applyPreclearedCheck(params: {
  leadId: string;
  email: string;
  company: PreclearedCompanyRow | null | undefined;
  deps?: Partial<PreclearedDeps>;
}): Promise<Clearance> {
  const { leadId, company } = params;
  const settings = preclearedSettingsFromCompany(company);
  if (!settings.enabled || !company) return { status: 'not_checked' };

  const deps = resolveDeps(params.deps);
  const clearance = await clearLeadForOutreach({ email: params.email, settings, deps });

  if (clearance.status === 'held') {
    console.warn('[precleared] check unavailable lead=%s kind=%s: %s', leadId, clearance.kind, clearance.message);
    try {
      await deps.recordHold(company.id, preclearedHoldRecord(clearance, deps.now()));
    } catch (e) {
      console.warn('[precleared] could not record the hold marker:', redact(describeError(e), deps.apiKey));
    }
    return clearance;
  }
  if (clearance.status !== 'not_checked' && !clearance.cached && company.precleared_last_hold) {
    // A fresh answer means the check is working again.
    try {
      await deps.recordHold(company.id, null);
    } catch (e) {
      console.warn('[precleared] could not clear the hold marker:', redact(describeError(e), deps.apiKey));
    }
  }
  if (clearance.status === 'denied') {
    await deps.markSkipped(leadId, clearance.message);
    console.log('[precleared] %s lead=%s receipt=%s cached=%s: %s', clearance.verdict, leadId, clearance.receiptId || '-', clearance.cached, clearance.message);
    return clearance;
  }
  if (clearance.status === 'allowed') {
    console.log('[precleared] ok_to_email lead=%s receipt=%s cached=%s', leadId, clearance.receiptId || '-', clearance.cached);
  }
  return clearance;
}

/**
 * Hash of the facts Precleared decides on, apart from the address. These are
 * exactly the fields sent with the address, so a cached verdict is only reused
 * for the same question.
 */
export function preclearedInputsHash(settings: PreclearedSettings): string {
  const facts: Record<string, unknown> = {
    v: CACHE_VERSION,
    sender_country: settings.senderCountry,
    address_source: settings.addressSource,
    pitch: settings.pitch,
    existing_customer: false,
  };
  if (settings.prospectCountry) facts.prospect_country = settings.prospectCountry;
  return createHash('sha256').update(JSON.stringify(facts, Object.keys(facts).sort())).digest('hex');
}

/**
 * Return the verdict for one address, from the cache when possible.
 * Never throws: anything unexpected comes back as a hold.
 */
export async function clearLeadForOutreach(params: {
  email: string;
  settings: PreclearedSettings;
  deps?: Partial<PreclearedDeps>;
}): Promise<Clearance> {
  const { settings } = params;
  if (!settings.enabled) return { status: 'not_checked' };

  const deps = resolveDeps(params.deps);
  const email = (params.email || '').trim().toLowerCase();
  const inputsHash = preclearedInputsHash(settings);

  const cached = await readCache(deps, email, inputsHash);
  if (cached) return cached;

  const result = await check(email, settings, deps);
  if (result.status !== 'held' && isDefinite(result.verdict)) {
    try {
      await deps.store.save({
        email,
        inputs_hash: inputsHash,
        verdict: result.verdict,
        reason: result.status === 'denied' ? result.reason : null,
        next_step: result.status === 'denied' ? result.nextStep : null,
        receipt_id: result.receiptId || null,
        recipient_country: result.recipientCountry || null,
        checked_at: deps.now().toISOString(),
      });
    } catch (e) {
      console.warn('[precleared] could not cache the verdict:', redact(describeError(e), deps.apiKey));
    }
  }
  return toClearance(result);
}

/** The hold record written to companies.precleared_last_hold. */
export function preclearedHoldRecord(clearance: HeldClearance, at: Date = new Date()): PreclearedHold {
  return { kind: clearance.kind, message: clearance.message, fix_url: clearance.fixUrl, at: at.toISOString() };
}

// ── Cache ──

async function readCache(deps: PreclearedDeps, email: string, inputsHash: string): Promise<Clearance | null> {
  let row: PreclearedCheck | null = null;
  try {
    row = await deps.store.get(email, inputsHash);
  } catch (e) {
    console.warn('[precleared] cache read failed, asking Precleared:', redact(describeError(e), deps.apiKey));
    return null;
  }
  if (!row || !isDefinite(row.verdict)) return null;
  const checkedAt = Date.parse(row.checked_at);
  if (!Number.isFinite(checkedAt)) return null;
  if (deps.now().getTime() - checkedAt > PRECLEARED_CACHE_DAYS * 24 * 60 * 60 * 1000) return null;

  const receiptId = text(row.receipt_id);
  if (row.verdict === 'ok_to_email') {
    return { status: 'allowed', verdict: 'ok_to_email', receiptId, cached: true };
  }
  const reason = text(row.reason);
  const nextStep = text(row.next_step);
  return {
    status: 'denied',
    verdict: row.verdict,
    reason,
    nextStep,
    receiptId,
    cached: true,
    message: denialMessage(row.verdict, reason, nextStep),
  };
}

function isDefinite(verdict: string): verdict is DefiniteVerdict {
  return (DEFINITE_VERDICTS as readonly string[]).includes(verdict);
}

// ── The call ──

type CheckResult =
  | HeldClearance
  | { status: 'allowed'; verdict: 'ok_to_email'; receiptId: string; recipientCountry: string }
  | {
      status: 'denied';
      verdict: DeniedClearance['verdict'];
      reason: string;
      nextStep: string;
      receiptId: string;
      recipientCountry: string;
    };

function toClearance(result: CheckResult): Clearance {
  if (result.status === 'held') return result;
  if (result.status === 'allowed') {
    return { status: 'allowed', verdict: 'ok_to_email', receiptId: result.receiptId, cached: false };
  }
  return {
    status: 'denied',
    verdict: result.verdict,
    reason: result.reason,
    nextStep: result.nextStep,
    receiptId: result.receiptId,
    cached: false,
    message: denialMessage(result.verdict, result.reason, result.nextStep),
  };
}

async function check(email: string, settings: PreclearedSettings, deps: PreclearedDeps): Promise<CheckResult> {
  const payload: Record<string, unknown> = {
    recipient_email: email,
    sender_country: settings.senderCountry,
    address_source: settings.addressSource,
    existing_customer: false,
  };
  if (settings.pitch) payload.pitch = settings.pitch;
  if (settings.prospectCountry) {
    // Precleared uses this only when the address, company records and the
    // company's website don't show the recipient's country.
    payload.default_recipient_country = settings.prospectCountry;
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': USER_AGENT,
  };
  if (deps.apiKey) headers.Authorization = `Bearer ${deps.apiKey}`;

  const fetchImpl = deps.fetchImpl;
  let response: Response;
  try {
    response = await fetchImpl(PRECLEARED_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(PRECLEARED_TIMEOUT_MS),
    });
  } catch (e) {
    return held('unavailable', `Precleared could not be reached (${redact(describeError(e), deps.apiKey)}). Leads stay in Ready to Add and are checked again on the next run.`);
  }

  let bodyText = '';
  try {
    bodyText = await response.text();
  } catch {
    bodyText = '';
  }
  const body = parseJson(bodyText);
  const errorCode = isRecord(body) ? text(body.error) : '';
  const errorMessage = isRecord(body) ? text(body.message) : '';

  switch (response.status) {
    case 200:
      return parseVerdict(body, deps.apiKey);
    case 400:
      // Precleared rejected the request itself, most likely a malformed address: a
      // per-lead problem, so the caller holds the lead as Skipped rather than
      // retrying it every day.
      return {
        status: 'denied',
        verdict: 'invalid_request',
        reason: `request rejected (${redact(errorMessage || errorCode || 'invalid request', deps.apiKey)})`,
        nextStep: 'Check the address, then press Undo on the lead to check it again.',
        receiptId: '',
        recipientCountry: '',
      };
    case 401:
      return held(
        'key_rejected',
        `Precleared rejected PRECLEARED_API_KEY (wrong or revoked). Check the key, or get a new free key at ${PRECLEARED_GET_KEY_URL}. Leads stay in Ready to Add.`,
        PRECLEARED_GET_KEY_URL,
      );
    case 402: {
      // The key's free checks for today are used and it has no credits left, so
      // another key won't help: a pack (or tomorrow's allowance) will.
      const buyUrl = safeUrl(isRecord(body) ? body.buy_url : undefined, BUY_HOSTS, deps.apiKey) || PRECLEARED_BUY_URL;
      return held(
        'out_of_checks',
        `Your Precleared key has used today's free checks and has no credits left. Add a pack (${buyUrl}) or try again tomorrow. Leads stay in Ready to Add.`,
        buyUrl,
      );
    }
    case 429: {
      if (errorCode === 'rate_limited') {
        const retryAfter = retryAfterSeconds(body, response);
        return held(
          'rate_limited',
          `Precleared is rate limiting requests${retryAfter ? ` (retry after ${retryAfter}s)` : ''}. Leads stay in Ready to Add and are checked again on the next run.`,
        );
      }
      const getKeyUrl = safeUrl(isRecord(body) ? body.get_key_url : undefined, KEY_HOSTS, deps.apiKey) || PRECLEARED_GET_KEY_URL;
      return held(
        'daily_limit',
        deps.apiKey
          ? 'Precleared\'s daily allowance for your key is used up. Try again tomorrow. Leads stay in Ready to Add.'
          : `Precleared's free daily allowance is used up (10 checks a day, shared by every app on this network address). Add PRECLEARED_API_KEY (free key: ${getKeyUrl}) or try again tomorrow. Leads stay in Ready to Add.`,
        getKeyUrl,
      );
    }
    default:
      return held(
        'unavailable',
        `Precleared answered HTTP ${response.status}${errorCode ? ` (${redact(errorCode, deps.apiKey)})` : ''}. Leads stay in Ready to Add and are checked again on the next run.`,
      );
  }
}

function parseVerdict(body: unknown, apiKey: string | undefined): CheckResult {
  // Only a JSON object with a known verdict counts as an answer. Anything else
  // is treated like an unavailable check, so the lead is held, not sent.
  if (!isRecord(body)) {
    return held('unavailable', 'Precleared returned an unexpected response (not a JSON object). Leads stay in Ready to Add and are checked again on the next run.');
  }
  const verdict = text(body.verdict);
  if (!isVerdict(verdict)) {
    return held('unavailable', 'Precleared returned a response without a known verdict. Leads stay in Ready to Add and are checked again on the next run.');
  }
  const receipt = isRecord(body.receipt) ? text(body.receipt.id) : '';
  const facts = isRecord(body.facts) ? body.facts : {};
  const recipientCountry = countryCode(facts.recipient_country);
  if (verdict === 'ok_to_email') {
    return { status: 'allowed', verdict, receiptId: receipt, recipientCountry };
  }
  // Precleared's `reasons` lead with the rule that decided it as
  // {rule_key, text, source_title, source_url}, or with a {note} when no rule applied.
  const reasons = Array.isArray(body.reasons) ? body.reasons : [];
  const first = isRecord(reasons[0]) ? reasons[0] : {};
  const ruleText = redact(text(first.text) || text(first.note), apiKey);
  const source = redact(text(first.source_title), apiKey);
  const reason = ruleText ? (source ? `${ruleText} (${source})` : ruleText) : '';
  return {
    status: 'denied',
    verdict,
    reason,
    nextStep: redact(text(body.next_step), apiKey),
    receiptId: receipt,
    recipientCountry,
  };
}

function isVerdict(value: string): value is Verdict {
  return (VERDICTS as readonly string[]).includes(value);
}

// ── Messages ──

const VERDICT_FALLBACK: Record<DeniedClearance['verdict'], string> = {
  consent_needed: 'consent is needed before a cold email can go to this address',
  blocked: 'a cold email to this address is blocked',
  unknown: 'could not establish whether a cold email to this address is allowed',
  invalid_request: 'request rejected',
};

/** "Precleared: <rule> (<source>). <next step>": one readable line for leads.skip_reason. */
export function denialMessage(verdict: DeniedClearance['verdict'], reason: string, nextStep: string): string {
  const rule = clean(reason) || VERDICT_FALLBACK[verdict];
  let step = clean(nextStep);
  if (!step && verdict === 'unknown') {
    step = 'If all your leads are in one country, set the prospects\' country in the Autopilot tab, then press Undo on the lead to check it again.';
  }
  const head = `Precleared: ${rule}${/[.!?]$/.test(rule) ? '' : '.'}`;
  return (step ? `${head} ${step}` : head).slice(0, MAX_MESSAGE);
}

function held(kind: PreclearedHoldKind, message: string, fixUrl: string | null = null): HeldClearance {
  return { status: 'held', kind, message: clean(message).slice(0, MAX_MESSAGE), fixUrl };
}

// ── Small helpers ──

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(raw: string): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** A trimmed string with control characters removed, or "" for anything that isn't a string. */
function text(value: unknown): string {
  return typeof value === 'string' ? clean(value) : '';
}

/** Text with control characters made spaces and whitespace collapsed, so text Precleared supplied reads as one line. */
function clean(value: string): string {
  return (value || '').replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
}

function countryCode(value: unknown): string {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z]{2}$/.test(code) ? code : '';
}

function describeError(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return `timed out after ${PRECLEARED_TIMEOUT_MS / 1000}s`;
    return `${e.name}: ${e.message}`;
  }
  // A Supabase PostgrestError is a plain object with a message, not an Error.
  if (isRecord(e) && typeof e.message === 'string') return clean(e.message);
  if (e === null || e === undefined) return '';
  return String(e);
}

/** The API key never reaches a log line, a stored message or the UI. */
function redact(value: string, apiKey: string | undefined): string {
  if (!apiKey || !value) return value;
  let out = value.split(apiKey).join('[redacted]');
  try {
    if (decodeURIComponent(out).includes(apiKey)) out = '[redacted]';
  } catch {
    // Not percent-encoded text; the plain replacement above is enough.
  }
  return out;
}

/**
 * A link from Precleared's answer, kept only when it is a plain https URL to one
 * of `hosts` (or a subdomain) and does not carry the API key. Otherwise null, and
 * the caller falls back to Precleared's own page.
 */
function safeUrl(value: unknown, hosts: string[], apiKey: string | undefined): string | null {
  if (typeof value !== 'string' || value.length > MAX_URL || /[\s\\\p{Cc}]/u.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!hosts.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  if (apiKey && redact(value, apiKey) !== value) return null;
  return value;
}

function retryAfterSeconds(body: unknown, response: Response): number | null {
  const fromBody = isRecord(body) ? body.retry_after : undefined;
  const fromHeader = typeof response.headers?.get === 'function' ? response.headers.get('retry-after') : null;
  const raw = typeof fromBody === 'number' || typeof fromBody === 'string' ? fromBody : fromHeader;
  const seconds = typeof raw === 'number' ? raw : raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}
