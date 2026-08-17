# wallbreaker

## Rebranding

Technical namespaces are isolated in `public/brand.js`. Change `storageNamespace` or `peerNamespace` only when intentionally separating a renamed game from existing saved sessions and PeerJS rooms. Product branding is separate from the Wallfacer and Wallbreaker role names.

A browser prototype for the Wallfacer / Wallbreaker deduction game, supporting flexible player counts.

## Mathbreaker mode

Mathbreaker is a simpler alternate mode for 3 or more players. It always assigns exactly one Wallfacer, one Wallbreaker, no Police, and Specialists in every remaining seat.

- Its fields are Panopticon Theory, Far Lands Theory, Logic, Algebra, Lemon Theory, and Game Theory.
- The six fields begin between 2 and 4 with a combined value of 17. The Wallfacer secretly needs three fields to reach 7 or higher.
- The Wallfacer advances any field by +1. Each Specialist advances their private specialty by +2 or another field by +1.
- The Wallbreaker simultaneously assigns one -1 decay effect per good player, including the Wallfacer. Decay may be stacked on one field.
- Once everyone locks, advancements are publicly applied first; the already-committed decay is publicly applied immediately afterward.
- Once per turn, the Wallbreaker may privately guess an unused combination of three fields. Incorrect combinations remain private and cannot be repeated.
- A correct guess privately alerts the Wallbreaker and Wallfacer. The Wallbreaker must say “[Wallfacer], I am your Wallbreaker,” reveal the three fields aloud, and confirm the declaration to end the game.
- There is no Police and no round limit. The loyal team wins only if all three required fields remain at or above 7 after decay resolves.

## Current rules implemented

- The host chooses the number of Wallfacers in the lobby; the same number of Wallbreakers is assigned automatically, and all remaining players are Loyal. Any room size with at least two players can start.
- Six bounded dials: yellow and pink (mathematics), orange and red (agriculture), blue and green (science); each ranges from 0 to 9.
- Each Wallfacer has a secret three-dial exact-value plan.
- Each round, every non-observer player privately selects one dial and one change. Wallfacers and Wallbreakers are limited to -1, 0, or +1. Civilians may use -2 or +2 only on their profession's subject pair; all other civilian dial moves are limited to -1, 0, or +1.
- The host resolves all committed selections simultaneously.
- One completed Wallfacer plan immediately wins for the Loyal team.
- Each Wallbreaker chooses exactly one Sophon action per round: adjust one dial by -1, 0, or +1, or observe their target Wallfacer's locked move. There are no tokens, inventories, combined actions, or regeneration.
- A Wallbreaker may submit one complete three-dial plan guess. All three values must be exact: a correct guess wins for the Wallbreakers; a wrong guess immediately wins for the Loyal team.
- Wallbreakers win if the configured final round ends without a Wallfacer completing a plan.

## Match controls and recovery

- The lobby shows the complete planned role composition and offers a recommended balance, an optional Police role, and 6-, 8-, 10-, or 12-round matches.
- Players see connection recovery notices. The host sees each player's live connection state and can resolve a disconnected player as a no-op for the current round so the match does not hang.
- Host and player sessions attempt to reconnect after reload while preserving the room code and authoritative state.
- When a game ends, roles and Wallfacer plans become public, followed by an expandable round-by-round replay of dial changes, actions, arrests, Sophon observations, and connection no-ops. This information is not included in public state while a match is active.

## Accessibility

- Every colored dial also has a distinct symbol.
- Keyboard focus is visibly outlined, status changes are announced to assistive technology, and the interface respects the system reduced-motion preference.
- A persistent high-contrast toggle adds stronger borders and dial patterns.

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

The test suite imports the same pure rules module used by the browser. It covers role composition, role-specific movement, mutually exclusive Sophon actions, Police arrests, write-once locks, simultaneous resolution, dial bounds, disconnected no-ops, exact plan guesses, replay records, and postgame privacy.

For a free public version later, deploy this folder as a static site on Cloudflare Pages. The app has no server-side routes or build step; set the build command to empty and the output directory to the project root. PeerJS handles room signaling and WebRTC connections in the browser.

## Networking

The prototype uses PeerJS. The room host receives a six-digit code and is the authoritative game peer. PeerJS provides connection discovery/signaling; game messages travel through WebRTC data channels when available.

For a production deployment, use a dedicated signaling service and add reconnect/host-migration handling.

## Important prototype limitations

- Six-digit room codes can collide.
- A host closing the tab ends the game.
- No authentication or anti-cheat protections.
- PeerJS public signaling availability is outside this app's control.
