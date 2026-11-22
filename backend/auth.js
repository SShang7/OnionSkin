import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { users, sessions } from './db.js'

const scryptAsync = promisify(scrypt)
const SESSION_COOKIE = 'onionskin_sid'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

export const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,24}$/
export const MIN_PASSWORD = 8

// --- passwords ---

async function hashPassword(password) {
  const salt = randomBytes(16)
  const key = await scryptAsync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p })
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`
}

async function verifyPassword(password, stored) {
  const [scheme, N, r, p, saltB64, keyB64] = stored.split('$')
  if (scheme !== 'scrypt') return false
  const expected = Buffer.from(keyB64, 'base64')
  const key = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: +N, r: +r, p: +p })
  return timingSafeEqual(key, expected)
}

// A fixed hash to compare against when the username doesn't exist, so
// login takes the same time either way and doesn't reveal which usernames exist.
const DUMMY_HASH = await hashPassword(randomUUID())

export async function signUp(username, password) {
  if (!USERNAME_RE.test(username ?? '')) {
    return { error: 'Username must be 3–24 characters: letters, numbers, _ . -' }
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > 200) {
    return { error: `Password must be at least ${MIN_PASSWORD} characters` }
  }
  if (users.byName(username)) return { error: 'That username is taken' }
  const id = randomUUID()
  users.create(id, username, await hashPassword(password))
  return { user: { id, username } }
}

export async function logIn(username, password) {
  const row = typeof username === 'string' ? users.byName(username) : null
  const ok = await verifyPassword(String(password ?? ''), row?.password_hash ?? DUMMY_HASH)
  if (!row || !ok) return { error: 'Wrong username or password' }
  return { user: { id: row.id, username: row.username } }
}

// --- sessions ---

const sha256 = (s) => createHash('sha256').update(s).digest('hex')

export function parseCookies(header = '') {
  const out = {}
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

/** Returns the signed-in user for a request (HTTP or WebSocket upgrade), or null. */
export function userFromRequest(req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  return token ? (sessions.user(sha256(token)) ?? null) : null
}

function isHttps(req) {
  return req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https'
}

function cookie(req, value, maxAgeSec) {
  const parts = [`${SESSION_COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`]
  if (isHttps(req)) parts.push('Secure')
  return parts.join('; ')
}

export function startSession(req, res, userId) {
  const token = randomBytes(32).toString('base64url')
  sessions.create(sha256(token), userId, Date.now() + SESSION_TTL_MS)
  res.setHeader('Set-Cookie', cookie(req, token, SESSION_TTL_MS / 1000))
}

export function endSession(req, res) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  if (token) sessions.delete(sha256(token))
  res.setHeader('Set-Cookie', cookie(req, '', 0))
}

setInterval(() => sessions.purgeExpired(), 60 * 60 * 1000).unref()

// --- brute-force protection: 10 failed attempts per IP per 15 minutes ---

const attempts = new Map() // ip -> { count, resetAt }
const WINDOW_MS = 15 * 60 * 1000

export function tooManyAttempts(ip) {
  const a = attempts.get(ip)
  return !!a && a.resetAt > Date.now() && a.count >= 10
}

export function recordFailedAttempt(ip) {
  const now = Date.now()
  const a = attempts.get(ip)
  if (!a || a.resetAt <= now) attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
  else a.count++
}

setInterval(() => {
  const now = Date.now()
  for (const [ip, a] of attempts) if (a.resetAt <= now) attempts.delete(ip)
}, WINDOW_MS).unref()
