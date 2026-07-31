# Wallfacers project instructions

## Architecture

- This is a static browser app using PeerJS for room signaling and WebRTC data connections.
- The host/observer browser is authoritative for game state; players do not mutate state directly.
- Do not add or restore a central WebSocket/Tunnel transport unless explicitly requested.
- Keep direct PeerJS mode working for both the deployed Vercel app and the local development server.

## Routing and assets

- `index.html` lives at the repository root; browser assets live under `public/`.
- Any JavaScript module imported by `public/app.js` must be included in `vercel.json` builds and have an explicit route with a JavaScript MIME type.
- After adding or moving an asset, verify both local and production responses with status code and `Content-Type` checks. A missing module commonly appears as `text/html is not a valid JavaScript MIME type`.
- The local server must map `/` and `/host` to the root `index.html`, and `/app.js`, `/brand.js`, and `/styles.css` to their files under `public/`.

## Game state and UI

- Every state transition must update both authoritative game state and the relevant local screen state. In particular, starting a game must move the host from `lobby` to `game`.
- Answer locks are write-once per player per round. Never reintroduce a mutable selection protocol or allow stale/duplicate messages to overwrite a lock.
- Host-only actions must be restricted by `isHost` and, where applicable, by game phase.
- Host reload recovery must preserve the saved room and retry reclaiming the same PeerJS room ID instead of clearing the session immediately.

## Verification before handoff

## Mistake-prevention workflow

- Read the relevant current implementation before changing it; do not rely on assumptions from an earlier version of the file.
- Check `git status` and preserve unrelated user changes. Do not reset, overwrite, or delete existing work without explicit permission.
- Make the smallest coherent change that addresses the request. Do not remove a mode, feature, or dependency unless the user explicitly asks for its removal.
- For transport, persistence, or host-authority changes, trace the full message path: UI action → client message → host validation → state update → broadcast → receiving UI.
- Test both important roles separately: host/observer behavior and player behavior. A change that works for players but leaves the host on the lobby is incomplete.
- Do not claim a browser or production verification unless it was actually run. Report sandbox or network limitations plainly.
- Before deployment, inspect the diff, run the project checks, verify production asset routes, and confirm the deployment reaches `READY`.

Run:

```bash
npm test
node --check public/app.js
node --check scripts/local-server.mjs
git diff --check
```

When deploying, also verify:

```bash
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://wallbreaker.27trees.com/app.js
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://wallbreaker.27trees.com/brand.js
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://wallbreaker.27trees.com/host
```

The expected results are JavaScript MIME types for module files and HTML for `/host`.
