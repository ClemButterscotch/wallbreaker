# wallbreaker

## Rebranding

Technical namespaces are isolated in `public/brand.js`. Change `storageNamespace` or `peerNamespace` only when intentionally separating a renamed game from existing saved sessions and PeerJS rooms. Product branding is separate from the Wallfacer and Wallbreaker role names.

The official product mark is `public/logo.svg`: six gapless color fields arranged in the Mathematics, Science, and Agriculture specialty pairs.

A browser prototype for the Wallfacer / Wallbreaker deduction game, supporting flexible player counts.

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

Standard-game hosts may enable the free optional Wild Roles pack with 4–11 players. Every Specialist seat becomes a different secretly assigned Wild Role, so no Wild Role can appear twice and at least one role always remains unoccupied. The core Wallfacer, Wallbreaker, and Police roles do not change, and disabling the pack preserves the standard role composition and rules.

Wild Roles are Loyal Specialists with an additional private goal. A Wild player wins if and only if their goal is satisfied and the Wallfacer team wins, whether by completing the plan or receiving the win after an incorrect Wallbreaker guess. Wild players never receive a Wallfacer plan display or its target values. A completed Wild goal stays complete. Wild Roles use normal -1/+1 moves. Wrapper additionally makes a touched dial use modulo-10 wrapping for that round when its move is not cancelled.

During the game, a public **Wild roles** button opens a reference popup containing all nine role names and generic goals. It reveals neither assignments nor private setup data. Police receives no special Wild Role information. The Wallbreaker privately learns exactly one randomly selected unoccupied role and may use it as a cover identity.

- **Bounty:** complete after two assigned players who are neither Police nor Wallfacer have each been arrested. Bounty is omitted from four-player draws because only one valid target exists.
- **Extremist:** complete after the assigned extreme non-plan dial reaches its opposite endpoint (0 or 9) at least once.
- **Conservationist:** complete when a round from round 4 onward ends with the six-dial total exactly equal to its starting sum. Matching during rounds 1–3 does not count.
- **Moderate:** complete whenever all six dials are simultaneously in the inclusive 3–7 range. The starting board can qualify.
- **Disruptor:** complete after making an uncancelled move away from its exact target on each of the three hidden plan dials. The player is not told the plan and learns by trial and error which moves qualify.
- **Loner:** complete after four non-arrested rounds in which no other player chose the same dial color.
- **Oddball:** complete after any completed round ends with at least five of the six dials showing odd numbers. The starting board does not count.
- **Numerologist:** complete after any completed round ends with three or more dials showing the same number. The starting board does not count.
- **Wrapper:** complete after Wrapper’s persistent power has made three different dials wrap past 0 or 9. Any dial touched by Wrapper’s uncancelled move uses modulo-10 wrapping for that round, and the power remains active after completion.

When any Wild goal is complete, its live progress panel and dial markers disappear. The player screen gains a subtle purple tint, and **Show role** confirms the achievement. Oddball and Numerologist have no partial progress display before completion because each qualifying board either occurs or does not.

## Match controls and recovery

- The lobby shows the fixed core role composition and offers 6-, 8-, 10-, or 12-round matches. Hosts may also enable the Wild Roles pack.
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
- `/host` hosts the standard Wallbreaker game.

To run the checks:

```bash
npm test
```

The test suite imports the same pure rules module used by the browser. It covers fixed role composition, unique multi-Wild assignment, every Wild goal, active-game plan privacy, Loyal-aligned Wild wins, role-specific movement, mutually exclusive Sophon actions, Police arrests, write-once locks, simultaneous resolution, dial bounds, disconnected no-ops, color-only plan guesses, replay records, and postgame privacy.

For a free public version later, deploy this folder as a static site on Cloudflare Pages. The app has no server-side routes or build step; set the build command to empty and the output directory to the project root. PeerJS handles room signaling and WebRTC connections in the browser.

## Networking

The prototype uses PeerJS. The room host receives a six-digit code and is the authoritative game peer. PeerJS provides connection discovery/signaling; game messages travel through WebRTC data channels when available.

For a production deployment, use a dedicated signaling service and add reconnect/host-migration handling.

## Important prototype limitations

- Six-digit room codes can collide.
- A host closing the tab ends the game.
- No authentication or anti-cheat protections.
- PeerJS public signaling availability is outside this app's control.
