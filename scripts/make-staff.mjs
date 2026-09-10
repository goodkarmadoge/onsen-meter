#!/usr/bin/env node
/**
 * Prints the SQL to create a staff member, with the PIN hashed locally so no
 * raw PIN ever reaches a migration file, a terminal history on a server, or
 * this repository.
 *
 *   SESSION_SECRET=... node scripts/make-staff.mjs "Aiko Tan" manager 481902
 *
 * Paste the printed SQL into the Supabase SQL editor. SESSION_SECRET must be
 * the same value the deployment uses — it is the pepper for the lookup index.
 */
import { createHmac, randomBytes, scryptSync } from 'node:crypto'

const [, , name, role, pin] = process.argv
const secret = process.env.SESSION_SECRET
const slug = process.env.LOCATION_SLUG || 'singapore'

if (!name || !role || !pin) {
  console.error('Usage: SESSION_SECRET=... node scripts/make-staff.mjs "<name>" <operator|manager> <pin>')
  process.exit(1)
}
if (!secret) {
  console.error('SESSION_SECRET must be set, and must match the deployment.')
  process.exit(1)
}
if (!['operator', 'manager'].includes(role)) {
  console.error('Role must be "operator" or "manager".')
  process.exit(1)
}
if (!/^\d{4,12}$/.test(pin)) {
  console.error('PIN must be 4-12 digits. Six is the recommended minimum.')
  process.exit(1)
}
if (pin.length < 6) {
  console.error('Warning: PINs shorter than 6 digits are brute-forceable. Continuing anyway.')
}

const pepper = createHmac('sha256', secret).update('pin-pepper').digest('hex')
const salt = randomBytes(16)
const pinHash = `scrypt$${salt.toString('base64url')}$${scryptSync(pin, salt, 32).toString('base64url')}`

const esc = (s) => s.replace(/'/g, "''")

console.log(`
-- ${esc(name)} (${role}) at location "${slug}"
-- The PIN itself appears nowhere below; keep a record of it separately.
insert into public.staff_users (location_id, name, pin_hash, pin_lookup, role)
select l.id,
       '${esc(name)}',
       '${pinHash}',
       encode(hmac(l.id::text || ':${pin}', '${pepper}', 'sha256'), 'hex'),
       '${role}'
  from public.locations l
 where l.slug = '${esc(slug)}';
`)
