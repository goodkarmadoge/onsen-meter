#!/usr/bin/env node
/**
 * Prints the SQL to create a staff member, with the PIN hashed locally so no
 * raw PIN ever reaches a migration file, a shell history on a server, or this
 * repository.
 *
 * PowerShell:
 *   node scripts/make-staff.mjs "Aiko Tan" manager 481902 --secret <SESSION_SECRET>
 *
 * bash / zsh:
 *   SESSION_SECRET=... node scripts/make-staff.mjs "Aiko Tan" manager 481902
 *
 * The secret is also read from .env.local if present. It must match the
 * SESSION_SECRET the deployment uses — it is the pepper for the PIN lookup
 * index, so a mismatch produces a PIN that silently never authenticates.
 */
import { createHmac, randomBytes, scryptSync } from 'node:crypto'
import { readFileSync } from 'node:fs'

const argv = process.argv.slice(2)

function takeFlag(name) {
  const i = argv.indexOf(`--${name}`)
  if (i === -1) return undefined
  const value = argv[i + 1]
  argv.splice(i, 2)
  return value
}

const secretFlag = takeFlag('secret')
const slugFlag = takeFlag('slug')
const [name, role, pin] = argv

/** Read a key out of .env.local without pulling in a dotenv dependency. */
function fromEnvFile(key) {
  try {
    const line = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
      .split(/\r?\n/)
      .find((l) => l.trimStart().startsWith(`${key}=`))
    return line?.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
  } catch {
    return undefined
  }
}

const secret = secretFlag || process.env.SESSION_SECRET || fromEnvFile('SESSION_SECRET')
const slug = slugFlag || process.env.LOCATION_SLUG || fromEnvFile('LOCATION_SLUG') || 'singapore'

function fail(message) {
  console.error(`\n${message}\n`)
  console.error('PowerShell:')
  console.error('  node scripts/make-staff.mjs "Aiko Tan" manager 481902 --secret <SESSION_SECRET>')
  console.error('\nbash / zsh:')
  console.error('  SESSION_SECRET=... node scripts/make-staff.mjs "Aiko Tan" manager 481902\n')
  process.exit(1)
}

if (!name || !role || !pin) fail('Need a name, a role, and a PIN.')
if (!secret) {
  fail(
    'No SESSION_SECRET. Pass --secret <value>, set the environment variable, or\n' +
      'put it in .env.local. It must be the same value the deployment uses.',
  )
}
if (!['operator', 'manager'].includes(role)) {
  fail(`Role must be "operator" or "manager", not "${role}".`)
}
if (!/^\d{4,12}$/.test(pin)) fail('PIN must be 4-12 digits.')
if (pin.length < 6) {
  console.error('Warning: PINs shorter than 6 digits are brute-forceable. Continuing.\n')
}

const pepper = createHmac('sha256', secret).update('pin-pepper').digest('hex')
const salt = randomBytes(16)
const pinHash = `scrypt$${salt.toString('base64url')}$${scryptSync(pin, salt, 32).toString('base64url')}`

const esc = (s) => String(s).replace(/'/g, "''")

console.log(`
-- ${esc(name)} (${role}) at location "${esc(slug)}"
-- Paste into the Supabase SQL editor. The PIN itself is not in this SQL;
-- keep a record of it separately.
insert into public.staff_users (location_id, name, pin_hash, pin_lookup, role)
select l.id,
       '${esc(name)}',
       '${pinHash}',
       encode(hmac(l.id::text || ':${pin}', '${pepper}', 'sha256'), 'hex'),
       '${role}'
  from public.locations l
 where l.slug = '${esc(slug)}';
`)
