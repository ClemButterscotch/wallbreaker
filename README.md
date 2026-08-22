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

- Every standard game uses exactly one Wallfacer, one Wallbreaker, and one Shi Qiang. Every remaining player is a Loyal Specialist. At least three players are required.
- Six bounded dials: yellow and pink (mathematics), orange and red (agriculture), blue and green (science); each ranges from 0 to 9.
- The Wallfacer has a secret plan containing three dial colors and one exact target value for each.
- Each round, every non-observer player privately selects one action. The Wallfacer and Wallbreaker are limited to -1, 0, or +1. Specialists independently receive a random subject; they may use -2 or +2 only on that subject's dial pair, while all their other dial moves are limited to -1, 0, or +1. Duplicate specialties are allowed, and a subject may have no Specialist.
- The host resolves all committed selections simultaneously.
- Completing the plan exactly immediately wins for the Loyal team.
- The Wallbreaker chooses exactly one action per round: adjust one dial by -1, 0, or +1, or use the Sophon to observe the Wallfacer's locked move. There are no tokens, inventories, combined actions, or regeneration.
- The Wallbreaker may guess the three dial colors in the plan; target values are not part of the guess. A correct guess wins for the Wallbreaker, while a wrong guess immediately wins for the Loyal team.
- The Wallbreaker wins if the configured final round ends without the Wallfacer completing the plan.

## Match controls and recovery

- The standard and tutorial lobbies show the fixed core role composition and offer 6-, 8-, 10-, or 12-round matches.
- Players see connection recovery notices. The host sees each player's live connection state and can resolve a disconnected player as a no-op for the current round so the match does not hang.
- Host and player sessions attempt to reconnect after reload while preserving the room code and authoritative state.
- When a game ends, roles and Wallfacer plans become public, followed by an expandable round-by-round replay of dial changes, actions, arrests, Sophon observations, and connection no-ops. This information is not included in public state while a match is active.

## Accessibility

- Every dial is identified by its written color name; no dial symbols are used.
- Keyboard focus is visibly outlined, status changes are announced to assistive technology, and the interface respects the system reduced-motion preference.
- A persistent high-contrast toggle adds stronger borders and dial patterns.

## Run locally

Start the included server (Node 18+ is enough; no package install is required):

```bash
npm start
```

Use the host page for the game you intend to run, then share its six-digit room code. The normal site address remains the player join page, and the host watches without taking a player slot.

- `/rules` opens the complete visual Wallbreaker rulebook. It supports slide controls, keyboard and swipe navigation, deep links, fullscreen, and printing to a PDF handout.
- `/mathbreaker/rules` opens Mathbreaker’s separate visual rulebook.
- `/host` hosts the standard Wallbreaker game.
- `/tutorial/host` hosts the guided Wallbreaker tutorial.
- `/mathbreaker/host` hosts the experimental Mathbreaker mode.

Host recovery is isolated by mode, so a saved room on one host page cannot replace a room from another mode.

To run the checks:

```bash
npm test
```

The test suite imports the same pure rules module used by the browser. It covers fixed role composition, role-specific movement, mutually exclusive Sophon actions, Police arrests, write-once locks, simultaneous resolution, dial bounds, disconnected no-ops, color-only plan guesses, replay records, and postgame privacy.

For a free public version later, deploy this folder as a static site on Cloudflare Pages. The app has no server-side routes or build step; set the build command to empty and the output directory to the project root. PeerJS handles room signaling and WebRTC connections in the browser.

## Networking

The prototype uses PeerJS. The room host receives a six-digit code and is the authoritative game peer. PeerJS provides connection discovery/signaling; game messages travel through WebRTC data channels when available.

For a production deployment, use a dedicated signaling service and add reconnect/host-migration handling.

## Important prototype limitations

- Six-digit room codes can collide.
- A host closing the tab ends the game.
- No authentication or anti-cheat protections.
- PeerJS public signaling availability is outside this app's control.
