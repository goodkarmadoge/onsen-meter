import 'server-only'
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'
import { cookies } from 'next/headers'
import { db } from './db'
import { env } from './env'

export const SESSION_COOKIE = 'onsen_staff'
const SESSION_TTL_HOURS = 12 // roughly one shift
const SCRYPT_KEYLEN = 32

export type StaffRole = 'operator' | 'manager'
export type Staff = {
  id: string
  name: string
  role: StaffRole
  locationId: string
}

// ---------------------------------------------------------------------------
// PIN hashing
// ---------------------------------------------------------------------------

function pepper(): string {
  return createHmac('sha256', env.sessionSecret()).update('pin-pepper').digest('hex')
}

/** Deterministic lookup key so a PIN-only login is a single indexed read. */
export function pinLookup(locationId: string, pin: string): string {
  return createHmac('sha256', pepper()).update(`${locationId}:${pin}`).digest('hex')
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(pin, salt, SCRYPT_KEYLEN)
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`
}

export function verifyPin(pin: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split('$')
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64url')
  const actual = scryptSync(pin, Buffer.from(saltB64, 'base64url'), expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

// ---------------------------------------------------------------------------
// Session cookie: a signed, stateless token. Role and is_active are re-read
// from the database on every request, so deactivating a staff member takes
// effect immediately rather than at token expiry.
// ---------------------------------------------------------------------------

type SessionPayload = { sid: string; exp: number }

function sign(data: string): string {
  return createHmac('sha256', env.sessionSecret()).update(data).digest('base64url')
}

export function mintSession(staffId: string): string {
  const payload: SessionPayload = {
    sid: staffId,
    exp: Date.now() + SESSION_TTL_HOURS * 3600_000,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body)}`
}

function readSession(token: string | undefined): SessionPayload | null {
  if (!token) return null
  const [body, signature] = token.split('.')
  if (!body || !signature) return null

  const expected = Buffer.from(sign(body))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

/** The signed-in staff member, or null. Verifies they are still active. */
export async function currentStaff(): Promise<Staff | null> {
  const payload = readSession(cookies().get(SESSION_COOKIE)?.value)
  if (!payload) return null

  const { data, error } = await db()
    .from('staff_users')
    .select('id, name, role, location_id, is_active')
    .eq('id', payload.sid)
    .maybeSingle()

  if (error || !data || !data.is_active) return null
  return {
    id: data.id,
    name: data.name,
    role: data.role as StaffRole,
    locationId: data.location_id,
  }
}

export async function requireStaff(): Promise<Staff | null> {
  return currentStaff()
}

export async function requireManager(): Promise<Staff | null> {
  const staff = await currentStaff()
  return staff && staff.role === 'manager' ? staff : null
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_TTL_HOURS * 3600,
}

// ---------------------------------------------------------------------------
// Brute-force throttling
// ---------------------------------------------------------------------------

const LOCKOUT_WINDOW_MINUTES = 15
const MAX_FAILURES_PER_WINDOW = 10

export function hashClient(ip: string): string {
  // Hashed, not stored raw: PRD §8.4 keeps guest/PII exposure at zero, and
  // there is no reason for a throttling table to hold real addresses.
  return createHmac('sha256', env.sessionSecret()).update(ip).digest('hex')
}

export async function isThrottled(ipHash: string): Promise<boolean> {
  const { data, error } = await db().rpc('recent_failed_logins', {
    p_ip_hash: ipHash,
    p_minutes: LOCKOUT_WINDOW_MINUTES,
  })
  if (error) return false
  return (data as number) >= MAX_FAILURES_PER_WINDOW
}

export async function recordAttempt(ipHash: string, succeeded: boolean): Promise<void> {
  await db().from('login_attempts').insert({ ip_hash: ipHash, succeeded })
}
