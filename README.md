# OnionSkin

A collaborative whiteboard for frame-by-frame animation. Everyone in a room draws on the same frames in real time, adds and reorders frames, and plays the animation back. Onion skinning shows the previous frame in red and the next frame in blue.

## Run it

```powershell
npm install
npm run dev
```

Open http://localhost:5173, pick a name, and create or join a room. Share the **Invite** link, or the room code, with others. The dev server listens on your local network, so people on the same Wi-Fi can join using your computer's IP address (Vite prints it as `Network:`).

> On Windows, if PowerShell blocks `npm` ("running scripts is disabled"), run `npm.cmd` instead, or run
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

### Production

```powershell
npm run build
npm start
```

The server at http://localhost:3001 serves both the built app and the WebSocket. Set `PORT` to change it.

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

- `backend/server.js`: a Node HTTP and WebSocket (`ws`) server. Rooms live in memory and are dropped 30 minutes after the last person leaves.
- `shared/ops.js`: the document model and the operations that change it (`stroke_start`, `stroke_points`, `stroke_remove`, `frame_add`, `frame_delete`, `frame_move`, `frame_clear`). Both server and client apply operations with the same code.
- Strokes are applied locally first and relayed to everyone else, so drawing feels instant. Frame operations go through the server first and are echoed to everyone, so every client sees the same frame order.
- `frontend/`: a React and Vite app. `src/lib/useRoom.js` handles the connection and keeps the local copy in sync. `Stage.jsx` draws and captures input. `Timeline.jsx` shows the frames.
