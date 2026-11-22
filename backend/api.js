import { randomInt, randomUUID } from 'node:crypto'
import { createFrame } from '../shared/ops.js'
import { projects } from './db.js'
import { signUp, logIn, startSession, endSession, userFromRequest, tooManyAttempts, recordFailedAttempt } from './auth.js'
import { closeRoom, notifyRenamed } from './rooms.js'
import { promptFor, validDate, streakFrom, addDays, dailyInfo } from './daily.js'

const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O or 1/I lookalikes
const DEFAULT_TITLE = 'Untitled animation'

/** 10 characters from a 32-letter alphabet: ~10^15 possibilities, so links can't be guessed. */
function newProjectId() {
  let id = ''
  for (let i = 0; i < 10; i++) id += ID_ALPHABET[randomInt(ID_ALPHABET.length)]
  return id
}

function newDoc() {
  return { frames: [createFrame(randomUUID())] }
}

/** Today's prompt, plus your project and streak for it when signed in. */
function dailyState(user, date) {
  const state = { date, prompt: promptFor(date), project: null, streak: 0, week: [] }
  if (!user) return state
  const project = projects.daily(user.id, date)
  const done = projects.drawnDailyDates(user.id)
  const doneSet = new Set(done)
  state.project = project ? { id: project.id, title: project.title, drawn: !!project.drawn } : null
  state.streak = streakFrom(done, date)
  state.week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(date, i - 6)
    return { date: day, done: doneSet.has(day) }
  })
  return state
}

const cleanTitle = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, 60) : '')

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
  return true
}

function readJson(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(Object.assign(new Error('Body too large'), { status: 413 }))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }))
      }
    })
    req.on('error', reject)
  })
}

/** Blocks cross-site form posts: a write must come from our own page. */
function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

const clientIp = (req) => req.socket.remoteAddress ?? 'unknown'

/** Handles /api/* requests. Returns false for anything else. */
export async function handleApi(req, res) {
  const { pathname } = new URL(req.url, 'http://x')
  if (!pathname.startsWith('/api/')) return false
  const method = req.method

  try {
    if (method !== 'GET' && !sameOrigin(req)) return json(res, 403, { error: 'Cross-site request blocked' })
    const user = userFromRequest(req)

    // --- accounts ---
    if (pathname === '/api/me' && method === 'GET') return json(res, 200, { user })

    if ((pathname === '/api/signup' || pathname === '/api/login') && method === 'POST') {
      const ip = clientIp(req)
      if (tooManyAttempts(ip)) return json(res, 429, { error: 'Too many attempts. Try again in a few minutes.' })
      const { username, password } = await readJson(req)
      const result = pathname === '/api/signup' ? await signUp(username, password) : await logIn(username, password)
      if (result.error) {
        recordFailedAttempt(ip)
        return json(res, 400, { error: result.error })
      }
      startSession(req, res, result.user.id)
      return json(res, 200, { user: result.user })
    }

    if (pathname === '/api/logout' && method === 'POST') {
      endSession(req, res)
      return json(res, 200, { ok: true })
    }

    // --- daily prompt ---
    if (pathname === '/api/daily') {
      const date = method === 'GET' ? new URL(req.url, 'http://x').searchParams.get('date') : (await readJson(req)).date
      if (!validDate(date)) return json(res, 400, { error: 'Send your local date as YYYY-MM-DD' })
      if (method === 'GET') return json(res, 200, dailyState(user, date))
      if (method === 'POST') {
        if (!user) return json(res, 401, { error: 'Sign in to start the daily prompt' })
        // One daily project per person per day: open the existing one if there is one.
        if (!projects.daily(user.id, date)) {
          const prompt = promptFor(date)
          try {
            projects.create(newProjectId(), user.id, prompt, newDoc(), { date, prompt })
          } catch (err) {
            if (!projects.daily(user.id, date)) throw err // otherwise a double-click raced us; fine
          }
        }
        return json(res, 200, dailyState(user, date))
      }
    }

    // --- projects ---
    if (pathname === '/api/projects') {
      if (!user) return json(res, 401, { error: 'Sign in to see your projects' })
      if (method === 'GET') return json(res, 200, projects.listFor(user.id))
      if (method === 'POST') {
        const { title } = await readJson(req)
        const id = newProjectId()
        projects.create(id, user.id, cleanTitle(title) || DEFAULT_TITLE, newDoc())
        return json(res, 201, { project: projects.get(id) })
      }
    }

    const match = pathname.match(/^\/api\/projects\/([A-Za-z0-9]{1,32})$/)
    if (match) {
      const id = match[1].toUpperCase()
      const project = projects.get(id)
      if (!project) return json(res, 404, { error: 'Project not found' })

      // Anyone with the link can see the title and join; only the owner can change it.
      if (method === 'GET') {
        return json(res, 200, { project: { id, title: project.title, ownerName: project.owner_name, isOwner: user?.id === project.owner_id, daily: dailyInfo(project) } })
      }
      if (!user) return json(res, 401, { error: 'Sign in first' })

      if (method === 'PATCH') {
        if (user.id !== project.owner_id) return json(res, 403, { error: 'Only the owner can rename this project' })
        const title = cleanTitle((await readJson(req)).title)
        if (!title) return json(res, 400, { error: 'Title can’t be empty' })
        projects.rename(id, user.id, title)
        notifyRenamed(id, title)
        return json(res, 200, { project: { ...project, title } })
      }

      if (method === 'DELETE') {
        if (user.id === project.owner_id) {
          projects.delete(id, user.id)
          closeRoom(id)
        } else {
          // Not yours: just remove it from your "Shared with me" list.
          projects.forgetShared(id, user.id)
        }
        return json(res, 200, { ok: true })
      }
    }

    return json(res, 404, { error: 'Not found' })
  } catch (err) {
    if (err.status) return json(res, err.status, { error: err.message })
    console.error(err)
    return json(res, 500, { error: 'Something went wrong' })
  }
}
