// Keeps a few weeks of daily prompts ready ahead of time, written by Claude.
// Prompts are generated in batches and stored per date, so a slow or failed API
// call never leaves anyone without a prompt: daily.js falls back to the built-in
// list for any date that has nothing stored.
import Anthropic from '@anthropic-ai/sdk'
import { dailyPrompts } from './db.js'
import { BUILTIN_PROMPTS, addDays, todayUtc } from './daily.js'

const MODEL = process.env.DAILY_PROMPTS_MODEL || 'claude-opus-5-5'
const AHEAD_DAYS = 30 // fill prompts this many days ahead
const REFILL_WITHIN = 14 // ...whenever a date this close has none
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const RETRY_AFTER_MS = 30 * 60 * 1000
const MAX_LENGTH = 50 // prompts become project titles (60 characters max)
const AVOID_RECENT = 365

const SYSTEM = `You write daily drawing prompts for OnionSkin, an app where people draw short frame-by-frame animations together.

A good prompt:
- describes something that moves or changes, so it animates well in a few frames (a flower blooming, a dog shaking off water, a sneeze)
- is concrete and easy to picture, with room for each person to interpret it
- works for beginners and is fun for experienced animators
- is suitable for all ages
- is short: a phrase, not a sentence, at most ${MAX_LENGTH} characters, with no trailing period

Vary the subjects across the batch: animals, people and faces, nature and weather, everyday objects, food, fantasy, physics and motion studies, and the occasional playful twist. Never repeat or closely rephrase a prompt from the avoid list.`

const SCHEMA = {
  type: 'object',
  properties: { prompts: { type: 'array', items: { type: 'string' } } },
  required: ['prompts'],
  additionalProperties: false,
}

/** A bad response from the model: worth retrying later. */
class PromptGenError extends Error {}

/** Lowercase letters and digits only, so "A Sneeze." and "a sneeze" count as the same prompt. */
const key = (prompt) => prompt.toLowerCase().replace(/[^a-z0-9]/g, '')

function tidy(raw) {
  if (typeof raw !== 'string') return null
  const prompt = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["“'‘]+|["”'’]+$/g, '')
    .replace(/[.!]+$/, '')
    .trim()
  if (prompt.length < 3 || prompt.length > MAX_LENGTH) return null
  return prompt[0].toUpperCase() + prompt.slice(1)
}

/** Dates in the next AHEAD_DAYS days that have no prompt yet. */
export function missingDates(today = todayUtc()) {
  const stored = new Set(dailyPrompts.between(today, addDays(today, AHEAD_DAYS)).map((r) => r.date))
  const missing = []
  for (let i = 0; i <= AHEAD_DAYS; i++) {
    const date = addDays(today, i)
    if (!stored.has(date)) missing.push(date)
  }
  return missing
}

/** Asks Claude for `count` new prompts that aren't in `avoid`. */
export async function generatePrompts(client, count, avoid) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // If a request is declined, the API retries it on a fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        // A few extra, since some may be dropped as too long or duplicates.
        content: `Write ${count + 10} new prompts.\n\nAvoid list (already used):\n${avoid.map((p) => `- ${p}`).join('\n')}`,
      },
    ],
  })
  if (response.stop_reason === 'refusal') throw new PromptGenError('Claude declined to write prompts')
  if (response.stop_reason === 'max_tokens') throw new PromptGenError('Prompt response was cut off')
  const text = response.content.find((b) => b.type === 'text')?.text
  if (!text) throw new PromptGenError('Claude returned no prompts')
  try {
    return JSON.parse(text).prompts
  } catch {
    throw new PromptGenError('Claude returned invalid JSON')
  }
}

/**
 * Fills empty dates in the next month with new AI prompts. Unless `force` is set,
 * it only calls the API once a date within the next two weeks is empty, so it
 * makes one request every couple of weeks, not one a day.
 */
export async function topUpPrompts({ client, today = todayUtc(), force = false } = {}) {
  const missing = missingDates(today)
  const urgent = missing.some((d) => d <= addDays(today, REFILL_WITHIN))
  if (missing.length === 0 || (!urgent && !force)) return { added: 0, missing: missing.length }

  const avoid = [...new Set([...dailyPrompts.recent(AVOID_RECENT), ...BUILTIN_PROMPTS])]
  const seen = new Set(avoid.map(key))
  const fresh = []
  for (const raw of await generatePrompts(client ?? new Anthropic(), missing.length, avoid)) {
    const prompt = tidy(raw)
    if (!prompt || seen.has(key(prompt))) continue
    seen.add(key(prompt))
    fresh.push(prompt)
  }

  let added = 0
  for (const [i, date] of missing.entries()) {
    if (i >= fresh.length) break
    if (dailyPrompts.add(date, fresh[i], 'ai')) added++
  }
  return { added, missing: missing.length - added }
}

/** Checks on startup and every few hours. Turn off with DAILY_PROMPTS_AI=off. */
export function startPromptScheduler() {
  if (process.env.DAILY_PROMPTS_AI === 'off') return
  const client = new Anthropic()
  let timer
  const run = async () => {
    let next = CHECK_EVERY_MS
    try {
      const { added } = await topUpPrompts({ client })
      if (added) console.log(`Daily prompts: added ${added} new AI prompts.`)
    } catch (err) {
      // Don't retry these until the server restarts with working credentials.
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        console.log(`Daily prompts: the Anthropic API rejected the credentials (${err.status}), using the built-in list.`)
        return
      }
      if (!(err instanceof Anthropic.APIError) && !(err instanceof PromptGenError)) {
        // The SDK found no API key (or other setup problem) before sending anything.
        console.log(`Daily prompts: AI prompts are off (${err.message.split('.')[0]}). Set ANTHROPIC_API_KEY to turn them on; using the built-in list.`)
        return
      }
      console.error('Daily prompts: top-up failed, will retry in 30 minutes.', err.message)
      next = RETRY_AFTER_MS
    }
    timer = setTimeout(run, next)
    timer.unref()
  }
  run()
}
