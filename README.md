# Wallfacers prototype

A browser prototype for the Wallfacer / Wallbreaker deduction game, supporting flexible player counts.

## Current rules implemented

- The host chooses the number of Wallfacers in the lobby; the same number of Wallbreakers is assigned automatically, and all remaining players are Loyal. Any room size with at least two players can start.
- Four bounded dials: orange, yellow, blue, red; each ranges from 0 to 9.
- Each Wallfacer has a secret three-dial exact-value plan.
- Each round, every player privately selects one dial and one change: -2, -1, 0, +1, or +2.
- The host resolves all committed selections simultaneously.
- One completed Wallfacer plan immediately wins for the Loyal team.
- A Wallbreaker may pause once to submit a three-dial guess.
- All three dials must be correct and all values must be within 1.
- A correct guess wins for the Wallbreakers; a wrong guess immediately wins for the Loyal team.
- Wallbreakers win if Round 10 ends without either Wallfacer completing a plan.

## Run locally

Start the included server (Node 18+ is enough; no package install is required):

```bash
npm start
```

Open `/host` to create a room and share its four-digit code. The normal site address is the player join page. The host can watch without taking a slot, or enable **Admin also plays** to join as a player.

To run the checks:

```bash
npm test
```

For a free public version later, deploy this folder as a static site on Cloudflare Pages. The app has no server-side routes or build step; set the build command to empty and the output directory to the project root. PeerJS handles room signaling and WebRTC connections in the browser.

## Networking

The prototype uses PeerJS. The room host receives a four-digit code and is the authoritative game peer. PeerJS provides connection discovery/signaling; game messages travel through WebRTC data channels when available.

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
