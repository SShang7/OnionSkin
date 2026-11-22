// Review and manage the daily prompts.
//   npm run prompts -w backend                 list the prompts for the next 30 days
//   npm run prompts -w backend -- generate     fill empty dates with AI prompts now
//   npm run prompts -w backend -- regenerate   replace upcoming AI prompts with new ones
// Stop the server before running "regenerate" or "generate", or it may fill dates in between.
import { dailyPrompts } from './db.js'
import { addDays, todayUtc } from './daily.js'
import { missingDates, topUpPrompts } from './promptgen.js'

const today = todayUtc()
const command = process.argv[2] ?? 'list'

function list() {
  const rows = new Map(dailyPrompts.between(addDays(today, -1), addDays(today, 30)).map((r) => [r.date, r]))
  for (let i = -1; i <= 30; i++) {
    const date = addDays(today, i)
    const row = rows.get(date)
    console.log(`${date}  ${row ? `${row.source.padEnd(7)}  ${row.prompt}` : '—        (built-in prompt will be used)'}`)
  }
}

if (command === 'list') {
  list()
} else if (command === 'generate' || command === 'regenerate') {
  if (command === 'regenerate') {
    // Leave today and tomorrow alone: someone may already be drawing them.
    const removed = dailyPrompts.deleteFrom(addDays(today, 2))
    console.log(`Removed ${removed} upcoming prompts.`)
  }
  console.log(`Asking Claude for ${missingDates(today).length} prompts…`)
  const { added, missing } = await topUpPrompts({ today, force: true })
  console.log(`Added ${added}. ${missing ? `${missing} dates still empty.` : ''}\n`)
  list()
} else {
  console.log('Usage: npm run prompts -w backend -- [list | generate | regenerate]')
  process.exitCode = 1
}
