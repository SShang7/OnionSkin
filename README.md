# OnionSkin

A collaborative whiteboard for frame-by-frame animation. Everyone in a project draws on the same frames in real time, adds and reorders frames, and plays the animation back. Onion skinning shows the previous frame in red and the next frame in blue.

Create an account to save projects. Each project has an invite link. Anyone with the link can draw, either signed in or as a guest with just a name. Signed-in visitors see the project under **Shared with you**. Only the owner can rename or delete a project.

## Run it

```powershell
npm install
npm run dev
```

Open http://localhost:5173, create an account, and start a project. Use **Invite** to copy its link for others. The dev server listens on your local network, so people on the same Wi-Fi can join using your computer's IP address (Vite prints it as `Network:`).

> On Windows, if PowerShell blocks `npm` ("running scripts is disabled"), run `npm.cmd` instead, or run
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

### Production

```powershell
npm run build
npm start
```

The server at http://localhost:3001 serves the built app, the API, and the WebSocket. Set `PORT` to change it.

Data is stored in SQLite at `backend/data/onionskin.db`. Set `DATA_DIR` to store it elsewhere, and back up that folder to keep your projects. Serve the app over HTTPS in production so session cookies are sent securely. If a proxy handles HTTPS, make sure it sets `X-Forwarded-Proto`.

## Shortcuts

| Key | Action |
| --- | --- |
| `B` / `E` | Pen / eraser |
| `[` / `]` | Smaller / bigger brush |
| `Ctrl+Z` | Undo your last stroke on this frame |
| `N` / `D` | New blank frame / duplicate frame |
| `,` `.` or `←` `→` | Previous / next frame |
| `O` | Toggle onion skin |
| `Space` | Play / pause |

Drag thumbnails in the timeline to reorder frames.

## How it works

- `backend/server.js`: the Node HTTP server. It wires together:
  - `api.js`: JSON endpoints for accounts and projects.
  - `auth.js`: scrypt password hashes, 30-day HttpOnly session cookies, and limits on repeated login attempts.
  - `rooms.js`: live editing over WebSocket (`ws`). An open project is kept in memory, saved to the database at most every 2 seconds while people draw, and saved again when the last person leaves.
  - `db.js`: the SQLite schema and queries, using Node's built-in `node:sqlite`.
- `shared/ops.js`: the document model and the operations that change it (`stroke_start`, `stroke_points`, `stroke_remove`, `frame_add`, `frame_delete`, `frame_move`, `frame_clear`). Both server and client apply operations with the same code.
- Strokes are applied locally first and relayed to everyone else, so drawing feels instant. Frame operations go through the server first and are echoed to everyone, so every client sees the same frame order.
- `frontend/`: a React and Vite app.
  - `src/lib/useRoom.js` handles the live connection and keeps the local copy in sync.
  - `src/lib/api.js` calls the HTTP API.
  - `Projects.jsx`, `Welcome.jsx`, and `GuestJoin.jsx` are the screens outside the editor.
  - `Board.jsx`, `Stage.jsx`, and `Timeline.jsx` make up the editor.
