import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const DATA_DIR = process.env.DATA_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })

export const db = new DatabaseSync(path.join(DATA_DIR, 'onionskin.db'))

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );

  -- Only a SHA-256 of each session token is stored, so a leaked database
  -- can't be used to sign in.
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id         TEXT PRIMARY KEY,
    owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    doc        TEXT NOT NULL,
    thumbnail  TEXT,
    frame_count INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- Signed-in people who have opened a project they don't own ("Shared with me").
  CREATE TABLE IF NOT EXISTS project_visits (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    visited_at INTEGER NOT NULL,
    PRIMARY KEY (project_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS projects_owner ON projects(owner_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS visits_user ON project_visits(user_id, visited_at DESC);
`)

const q = {
  insertUser: db.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)'),
  userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  userById: db.prepare('SELECT id, username FROM users WHERE id = ?'),

  insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
  sessionUser: db.prepare(
    'SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
  ),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  deleteExpiredSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),

  insertProject: db.prepare(
    'INSERT INTO projects (id, owner_id, title, doc, frame_count, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
  ),
  project: db.prepare(
    'SELECT p.id, p.title, p.owner_id, u.username AS owner_name, p.created_at, p.updated_at FROM projects p JOIN users u ON u.id = p.owner_id WHERE p.id = ?',
  ),
  projectDoc: db.prepare('SELECT doc FROM projects WHERE id = ?'),
  saveDoc: db.prepare('UPDATE projects SET doc = ?, frame_count = ?, updated_at = ? WHERE id = ?'),
  saveThumb: db.prepare('UPDATE projects SET thumbnail = ? WHERE id = ?'),
  rename: db.prepare('UPDATE projects SET title = ?, updated_at = ? WHERE id = ? AND owner_id = ?'),
  deleteProject: db.prepare('DELETE FROM projects WHERE id = ? AND owner_id = ?'),
  ownedProjects: db.prepare(
    `SELECT p.id, p.title, p.thumbnail, p.frame_count, p.updated_at, u.username AS owner_name, 1 AS owned
     FROM projects p JOIN users u ON u.id = p.owner_id WHERE p.owner_id = ? ORDER BY p.updated_at DESC`,
  ),
  sharedProjects: db.prepare(
    `SELECT p.id, p.title, p.thumbnail, p.frame_count, p.updated_at, u.username AS owner_name, 0 AS owned
     FROM project_visits v JOIN projects p ON p.id = v.project_id JOIN users u ON u.id = p.owner_id
     WHERE v.user_id = ? AND p.owner_id != ? ORDER BY v.visited_at DESC LIMIT 50`,
  ),
  recordVisit: db.prepare(
    `INSERT INTO project_visits (project_id, user_id, visited_at) VALUES (?, ?, ?)
     ON CONFLICT (project_id, user_id) DO UPDATE SET visited_at = excluded.visited_at`,
  ),
  forgetShared: db.prepare('DELETE FROM project_visits WHERE project_id = ? AND user_id = ?'),
}

export const users = {
  create: (id, username, passwordHash) => q.insertUser.run(id, username, passwordHash, Date.now()),
  byName: (username) => q.userByName.get(username),
  byId: (id) => q.userById.get(id),
}

export const sessions = {
  create: (tokenHash, userId, expiresAt) => q.insertSession.run(tokenHash, userId, expiresAt),
  user: (tokenHash) => q.sessionUser.get(tokenHash, Date.now()),
  delete: (tokenHash) => q.deleteSession.run(tokenHash),
  purgeExpired: () => q.deleteExpiredSessions.run(Date.now()),
}

export const projects = {
  create(id, ownerId, title, doc) {
    const now = Date.now()
    q.insertProject.run(id, ownerId, title, JSON.stringify(doc), now, now)
  },
  get: (id) => q.project.get(id),
  loadDoc(id) {
    const row = q.projectDoc.get(id)
    return row ? JSON.parse(row.doc) : null
  },
  saveDoc: (id, doc) => q.saveDoc.run(JSON.stringify(doc), doc.frames.length, Date.now(), id),
  saveThumbnail: (id, dataUrl) => q.saveThumb.run(dataUrl, id),
  rename: (id, ownerId, title) => q.rename.run(title, Date.now(), id, ownerId).changes > 0,
  delete: (id, ownerId) => q.deleteProject.run(id, ownerId).changes > 0,
  listFor: (userId) => ({ owned: q.ownedProjects.all(userId), shared: q.sharedProjects.all(userId, userId) }),
  recordVisit: (id, userId) => q.recordVisit.run(id, userId, Date.now()),
  forgetShared: (id, userId) => q.forgetShared.run(id, userId).changes > 0,
}
