# OnionSkin

A collaborative whiteboard for frame-by-frame animation. Everyone in a project draws on the same frames in real time, adds and reorders frames, and plays the animation back. Onion skinning shows the previous frame in red and the next frame in blue.

Create an account to save projects. Each project has an invite link. Anyone with the link can draw, either signed in or as a guest with just a name. Signed-in visitors see the project under **Shared with you**. Only the owner can rename or delete a project.

Every day there's a new **daily prompt**, the same for everyone, such as "A flower blooming" or "A walk cycle". It shows on the home page. Signed in, **Start drawing** opens that day's project; opening it again later the same day returns to it. Each day you draw something in your daily project adds to your streak, and the last 7 days are shown as dots. The day changes at your local midnight.

For timed practice like gesture drawing, use **Timer** in the editor. Anyone in the project can start one, and everyone sees the same countdown. Pick a preset or type a time such as `1:30`, `45s`, or `2`, which means 2 minutes. Turn on **Repeat rounds** to restart the countdown each time it ends. With **New frame each round**, a blank frame is added at the end of each round and everyone moves to it, so each pose gets its own frame. A chime plays when time is up; each person can turn it off for themselves. If everyone leaves, the timer pauses.

Use **Layers** (the stacked-squares button in the toolbar) to draw on separate layers, such as a background, a rough sketch, and clean lines. Layers are shared by every frame and everyone in the project. Click a layer to draw on it, and the eraser only erases that layer. Double-click a name to rename it, and drag layers or use the arrows to reorder them. The eye button hides a layer only for you; hidden layers are also left out of your GIF export. Clear frame clears only the layer you're on, and deleting a layer removes its drawings from every frame.

To save the animation, click **GIF** in the editor. Choose a size (480×270, 640×360 or 1280×720) and a speed, then click **Export** to download a looping GIF on a white background. The export runs in your browser, so nothing is uploaded.

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

### AI daily prompts

With an Anthropic API key, the server has Claude write new daily prompts so they don't repeat. Without one, it uses the built-in list of about 120 prompts, which repeats every few months.

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
npm run dev
```

The server keeps prompts ready for the next 30 days. When a date in the next two weeks has no prompt, it asks Claude for a new batch, roughly once every couple of weeks. Each batch is told to avoid the last year's prompts and the built-in list. If a request fails, the server tries again in 30 minutes, and any date still without a prompt gets one from the built-in list. Once a date has been shown, its prompt never changes.

Review or replace upcoming prompts. Stop the server first for `generate` and `regenerate`:

```powershell
npm run prompts -w backend                    # list the next 30 days
npm run prompts -w backend -- generate        # fill empty dates now
npm run prompts -w backend -- regenerate      # replace prompts from the day after tomorrow on
```

Set `DAILY_PROMPTS_AI=off` to turn this off, or `DAILY_PROMPTS_MODEL` to use a different model. The default is `claude-opus-5-5`.

## Shortcuts

| Key | Action |
| --- | --- |
| `B` / `E` | Pen / eraser |
| `[` / `]` | Smaller / bigger brush |
| `Ctrl+Z` | Undo your last stroke on this frame |
| `N` / `D` | New blank frame / duplicate frame |
| `,` `.` or `←` `→` | Previous / next frame |
| `O` | Toggle onion skin |
| `L` | Toggle looping (off: play through once and stop) |
| `Space` | Play / pause |

Drag thumbnails in the timeline to reorder frames.

## How it works

- `backend/server.js`: the Node HTTP server. It wires together:
  - `api.js`: JSON endpoints for accounts and projects.
  - `auth.js`: scrypt password hashes, 30-day HttpOnly session cookies, and limits on repeated login attempts.
  - `rooms.js`: live editing over WebSocket (`ws`). An open project is kept in memory, saved to the database at most every 2 seconds while people draw, and saved again when the last person leaves. It also runs each project's shared timer, so everyone sees a round end at the same moment.
  - `db.js`: the SQLite schema and queries, using Node's built-in `node:sqlite`. Older databases get new columns added on startup.
  - `daily.js`: the prompt for each date (a stored AI prompt, or the built-in list as a fallback) and streak counting.
  - `promptgen.js`: asks Claude for new batches of prompts and stores them ahead of time. `prompts-cli.js` is the review script.
- `shared/ops.js`: the document model and the operations that change it (`stroke_start`, `stroke_points`, `stroke_remove`, `frame_add`, `frame_delete`, `frame_move`, `frame_clear`, and `layer_add`, `layer_delete`, `layer_move`, `layer_rename`). Both server and client apply operations with the same code. Projects saved before layers existed are put on a single layer when opened.
- Strokes are applied locally first and relayed to everyone else, so drawing feels instant. Frame and layer operations go through the server first and are echoed to everyone, so every client sees the same frame order.
- `frontend/`: a React and Vite app.
  - `src/lib/useRoom.js` handles the live connection and keeps the local copy in sync.
  - `src/lib/render.js` draws frames one layer at a time, so an eraser stroke only affects its own layer.
  - `src/lib/api.js` calls the HTTP API.
  - `Projects.jsx`, `Welcome.jsx`, and `GuestJoin.jsx` are the screens outside the editor.
  - `Board.jsx`, `Stage.jsx`, and `Timeline.jsx` make up the editor.
