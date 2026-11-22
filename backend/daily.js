import { dailyPrompts } from './db.js'

// Built-in daily prompts, used when no AI-generated prompt exists for a date
// (see promptgen.js). One idea per day, the same for everyone. Prompts are picked
// for motion, since this is an animation app. Keep each under ~50 characters so
// it fits as a project title.
const PROMPTS = [
  'A bouncing ball that gets tired',
  'A flower blooming',
  'A cat chasing its own tail',
  'Rain on a window',
  'A paper airplane loop-the-loop',
  'A candle flame in a draft',
  'A frog catching a fly',
  'A rocket launch',
  'Someone waving hello',
  'A fish jumping out of the water',
  'A balloon slowly deflating',
  'A leaf falling from a tree',
  'A dog shaking off water',
  'A pendulum swinging',
  'A sunrise over hills',
  'A jellyfish drifting',
  'A spinning top wobbling to a stop',
  'Popcorn popping',
  'A snail racing (very slowly)',
  'A heart beating',
  'A bird flapping its wings',
  'A ghost floating through a wall',
  'Ocean waves crashing',
  'A character blinking',
  'A slinky walking down stairs',
  'A campfire crackling',
  'A seed sprouting',
  'A yo-yo going up and down',
  'A sneeze',
  'A bubble floating and popping',
  'A clock’s hands spinning',
  'A squash and stretch jump',
  'A snowflake falling',
  'A walk cycle',
  'Smoke rising from a mug',
  'A butterfly landing on a flower',
  'A robot doing a dance',
  'A door creaking open',
  'A tornado forming',
  'A pancake flip',
  'A wind-up toy',
  'Lightning striking',
  'A whale breaching',
  'A head turn',
  'A dripping faucet',
  'A kite in the wind',
  'An egg hatching',
  'Fireworks',
  'A cup of coffee spilling',
  'A tree swaying in the wind',
  'A shooting star',
  'A bouncing jelly',
  'A character jumping over a puddle',
  'A snake slithering',
  'A volcano erupting',
  'Ink dropping into water',
  'A chick pecking at seeds',
  'A paper boat in a stream',
  'A morph from circle to square',
  'A plant growing toward the sun',
  'A hiccup',
  'A train passing by',
  'A dandelion blown apart',
  'A juggler',
  'A caterpillar inching along',
  'An umbrella opening',
  'A wave of dominoes falling',
  'Someone laughing',
  'A comet streaking past',
  'A rabbit hopping',
  'A ball rolling down a hill',
  'A cloud changing shape',
  'A soda fizzing over',
  'A spider spinning a web',
  'A character tiptoeing',
  'A jack-in-the-box',
  'A raindrop splash',
  'A windmill turning',
  'A yawn',
  'A cat stretching',
  'A sword swing',
  'An octopus swimming',
  'A bee buzzing around',
  'Hair blowing in the wind',
  'A boxing punch',
  'A melting ice cream cone',
  'A skateboard trick',
  'A pumpkin turning into a lantern',
  'A heavy box being lifted',
  'A bat flying out of a cave',
  'A balloon on a string',
  'A sandcastle washed away',
  'A trampoline bounce',
  'A crab scuttling sideways',
  'A record spinning',
  'Someone slipping on a banana peel',
  'A duck paddling',
  'A water balloon hitting the ground',
  'A firefly glowing',
  'A dragon breathing fire',
  'A wobbly table',
  'A breakdancing penguin',
  'A cork popping out of a bottle',
  'A sunflower following the sun',
  'A hand drawing itself',
  'A moon going through its phases',
  'A sleepy head nodding off',
  'A flag waving',
  'A bowling strike',
  'A hot air balloon rising',
  'A turtle poking its head out',
  'A storm cloud raining on one person',
  'A rubber duck squeaking',
  'Waves of a wheat field',
  'A magic trick',
  'A ladybug taking off',
  'A train of ants',
  'A surprised face',
  'A falling feather',
  'A bridge collapsing',
  'Something hatching that isn’t a bird',
]

const DAY_MS = 86_400_000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const gcd = (a, b) => (b ? gcd(b, a % b) : a)
// Step through the list with a stride that shares no factor with its length,
// so every prompt comes up once before any repeats, and neighbours differ.
let STRIDE = 41
while (gcd(STRIDE, PROMPTS.length) !== 1) STRIDE++

const dayNumber = (date) => Date.parse(`${date}T00:00:00Z`) / DAY_MS

export const BUILTIN_PROMPTS = PROMPTS

/** The built-in prompt for a date: used when no AI prompt was generated in time. */
export function builtinPromptFor(date) {
  const n = PROMPTS.length
  return PROMPTS[(((dayNumber(date) * STRIDE) % n) + n) % n]
}

/**
 * The prompt for a date. AI-generated prompts are stored ahead of time; if a date
 * has none, the built-in one is stored the first time it's shown, so the prompt
 * can't change partway through the day when a later top-up runs.
 */
export function promptFor(date) {
  const stored = dailyPrompts.get(date)
  if (stored) return stored
  const prompt = builtinPromptFor(date)
  dailyPrompts.add(date, prompt, 'builtin')
  return dailyPrompts.get(date) ?? prompt
}

export const todayUtc = () => new Date().toISOString().slice(0, 10)

export function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/**
 * The client sends its own local date, so "today" flips at the person's midnight.
 * Accept anything within a day of the server's UTC date (covers every time zone).
 */
export function validDate(date) {
  if (typeof date !== 'string' || !DATE_RE.test(date) || Number.isNaN(dayNumber(date))) return false
  if (addDays(date, 0) !== date) return false // rejects 2026-02-31
  const today = todayUtc()
  return Math.abs(dayNumber(date) - dayNumber(today)) <= 1
}

/** Consecutive days with a drawn daily project, ending today (or yesterday, if today isn't done yet). */
export function streakFrom(doneDates, today) {
  const done = new Set(doneDates)
  let day = done.has(today) ? today : addDays(today, -1)
  let streak = 0
  while (done.has(day)) {
    streak++
    day = addDays(day, -1)
  }
  return streak
}

/** What the editor needs to know about a daily-prompt project (null for regular ones). */
export const dailyInfo = (project) => (project.daily_date ? { date: project.daily_date, prompt: project.daily_prompt } : null)
