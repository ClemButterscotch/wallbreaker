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
- Each round, every non-observer player privately selects one action; passing and zero-effect dial moves are not legal. The Wallfacer and Wallbreaker are limited to -1 or +1. Specialists independently receive a random subject; they may use -2 or +2 only on that subject's dial pair, while all their other dial moves are limited to -1 or +1. Duplicate specialties are allowed, and a subject may have no Specialist.
- The host resolves all committed selections simultaneously.
- Completing the plan exactly immediately wins for the Loyal team.
- The Wallbreaker chooses exactly one action per round: adjust one dial by -1 or +1, or use the Sophon to observe the Wallfacer's locked move. There are no tokens, inventories, combined actions, or regeneration.
- The Wallbreaker may guess the three dial colors in the plan; target values are not part of the guess. A correct guess wins for the Wallbreaker, while a wrong guess immediately wins for the Loyal team.
- The Wallbreaker wins if the configured final round ends without the Wallfacer completing the plan.

### Wild Roles advanced pack

Standard-game hosts may enable the free optional Wild Roles pack with 4–9 players. Every Specialist seat becomes a different secretly assigned Wild Role, so no Wild Role can appear twice. The core Wallfacer, Wallbreaker, and Police roles do not change, and disabling the pack preserves the standard role composition and rules.

Wild Roles are Loyal Specialists with an additional private goal. They never receive a Wallfacer plan display or its target values; they must help the Wallfacer complete the unknown plan while also satisfying their own goal. Bounty, Extremist, Disruptor, and Loner are one-time goals that stay complete. Conservationist and Moderate are at-finish board states checked when the game ends. A Loyal result caused by an incorrect Wallbreaker guess is not sufficient. Moderate has specialist-strength -2/+2 moves on its three assigned dials; other Wild Roles use -1/+1.

During the game, a public **Wild roles** button opens a reference popup containing all six role names, generic goals, and whether each happens once or is checked at the finish. It reveals neither assignments nor private setup data. Police and Wallbreaker receive no special Wild Role information.

- **Bounty — happens once:** complete after two assigned players who are neither Police nor Wallfacer have each been arrested. Bounty is omitted from four-player draws because only one valid target exists.
- **Extremist — happens once:** complete after the assigned extreme non-plan dial reaches its opposite endpoint (0 or 9) at least once.
- **Conservationist — at finish:** the six-dial total must be within 3 of its starting sum when the game ends.
- **Moderate — at finish:** the three non-plan dials must all be in the inclusive 4–6 range when the game ends; those dials allow -2, -1, +1, or +2 moves.
- **Disruptor — happens once:** complete after making an uncancelled move away from its exact target on each of the three hidden plan dials. The player is not told the plan and learns by trial and error which moves qualify.
- **Loner — happens once:** complete after four non-arrested rounds in which no other player chose the same dial color.

## Match controls and recovery

- The standard and tutorial lobbies show the fixed core role composition and offer 6-, 8-, 10-, or 12-round matches. Standard hosts may also enable the Wild Roles pack.
- Players see connection recovery notices. The host sees each player's live connection state and can resolve a disconnected player as a no-op for the current round so the match does not hang.
- Host and player sessions attempt to reconnect after reload while preserving the room code, the host's chosen participation mode, and authoritative state.
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

Use the host page for the game you intend to run, choose whether to join as a normal player or observe, then share its six-digit room code. Normal-player hosting is the default and requires the host to enter a name; observer mode does not take a player slot.

- `/rules` opens the complete visual Wallbreaker rulebook. It supports slide controls, keyboard and swipe navigation, deep links, fullscreen, and printing to a PDF handout.
- `/preview` opens the UI preview lab, including each Wild Role in full player-screen context and the retained visual alternatives for roles still under comparison.
- `/mathbreaker/rules` opens Mathbreaker’s separate visual rulebook.
- `/host` hosts the standard Wallbreaker game.
- `/tutorial/host` hosts the guided Wallbreaker tutorial.
- `/mathbreaker/host` hosts the experimental Mathbreaker mode.

Host recovery is isolated by mode, so a saved room on one host page cannot replace a room from another mode.

To run the checks:

```bash
npm test
```

The test suite imports the same pure rules module used by the browser. It covers fixed role composition, unique multi-Wild assignment, happens-once and at-finish Wild goals, active-game plan privacy, Loyal-aligned Wild wins, role-specific movement, mutually exclusive Sophon actions, Police arrests, write-once locks, simultaneous resolution, dial bounds, disconnected no-ops, color-only plan guesses, replay records, and postgame privacy.

For a free public version later, deploy this folder as a static site on Cloudflare Pages. The app has no server-side routes or build step; set the build command to empty and the output directory to the project root. PeerJS handles room signaling and WebRTC connections in the browser.

## Networking

The prototype uses PeerJS. The room host receives a six-digit code and is the authoritative game peer. PeerJS provides connection discovery/signaling; game messages travel through WebRTC data channels when available.

For a production deployment, use a dedicated signaling service and add reconnect/host-migration handling.

## Important prototype limitations

- Six-digit room codes can collide.
- A host closing the tab ends the game.
- No authentication or anti-cheat protections.
- PeerJS public signaling availability is outside this app's control.
