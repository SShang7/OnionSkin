/** Your local calendar date as YYYY-MM-DD, so the prompt changes at your midnight. */
export function localDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "Sunday, November 22" (or a shorter form) for a YYYY-MM-DD date. */
export function formatDay(date, options = { weekday: 'long', month: 'long', day: 'numeric' }) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, options)
}
