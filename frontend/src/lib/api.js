async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { status: res.status })
  return data
}

export const api = {
  me: () => request('GET', '/me').then((d) => d.user),
  signUp: (username, password) => request('POST', '/signup', { username, password }).then((d) => d.user),
  logIn: (username, password) => request('POST', '/login', { username, password }).then((d) => d.user),
  logOut: () => request('POST', '/logout'),

  listProjects: () => request('GET', '/projects'),
  createProject: (title) => request('POST', '/projects', { title }).then((d) => d.project),
  getProject: (id) => request('GET', `/projects/${id}`).then((d) => d.project),
  renameProject: (id, title) => request('PATCH', `/projects/${id}`, { title }).then((d) => d.project),
  /** Deletes your own project, or removes someone else's from your list. */
  deleteProject: (id) => request('DELETE', `/projects/${id}`),

  /** Today's prompt (and, when signed in, your project and streak for it). */
  daily: (date) => request('GET', `/daily?date=${date}`),
  /** Creates today's daily project, or returns the one you already started. */
  startDaily: (date) => request('POST', '/daily', { date }),
}
