# Wallfacers prototype

## Rebranding

Technical namespaces are isolated in `public/brand.js`. Change `storageNamespace` or `peerNamespace` only when intentionally separating the renamed game from existing saved sessions and PeerJS rooms. The current visible title remains in `index.html`; game-role terminology is intentionally separate from product branding.

A browser prototype for the Wallfacer / Wallbreaker deduction game, supporting flexible player counts.

## Current rules implemented

- The host chooses the number of Wallfacers in the lobby; the same number of Wallbreakers is assigned automatically, and all remaining players are Loyal. Any room size with at least two players can start.
- Six bounded dials: yellow and pink (mathematics), orange and red (agriculture), blue and green (science); each ranges from 0 to 9.
- Each Wallfacer has a secret three-dial exact-value plan.
- Each round, every non-observer player privately selects one dial and one change. Wallfacers and Wallbreakers are limited to -1, 0, or +1. Civilians may use -2 or +2 only on their profession's subject pair; all other civilian dial moves are limited to -1, 0, or +1.
- The host resolves all committed selections simultaneously.
- One completed Wallfacer plan immediately wins for the Loyal team.
- Each Wallbreaker starts with two Sophon tokens and has an inventory limit of two. They gain one token per round up to that limit. They lock in whether to spend tokens on seeing their target Wallfacer's move, nudging one dial by exactly 1, both, or neither; the single uses cost one token and both costs two.
- A Wallbreaker may submit one complete three-dial plan guess. All three values must be exact: a correct guess wins for the Wallbreakers; a wrong guess immediately wins for the Loyal team.
- Wallbreakers win if Round 10 ends without either Wallfacer completing a plan.

## Run locally

Start the included server (Node 18+ is enough; no package install is required):

```bash
npm start
```

Open `/host` to create a room and share its six-digit code. The normal site address is the player join page. The host watches without taking a player slot.

To run the checks:

```bash
npm test
```

For a free public version later, deploy this folder as a static site on Cloudflare Pages. The app has no server-side routes or build step; set the build command to empty and the output directory to the project root. PeerJS handles room signaling and WebRTC connections in the browser.

## Networking

The prototype uses PeerJS. The room host receives a six-digit code and is the authoritative game peer. PeerJS provides connection discovery/signaling; game messages travel through WebRTC data channels when available.

For a production deployment, use a dedicated signaling service and add reconnect/host-migration handling.

## Admin modes

- Unchecked **Admin also plays**: the host watches and does not occupy a player slot.
- Checked **Admin also plays**: the host occupies one of the seven player slots.

## Important prototype limitations

- Four-digit room codes can collide.
- A host closing the tab ends the game.
- No reconnect recovery.
- No authentication or anti-cheat protections.
- PeerJS public signaling availability is outside this app's control.
