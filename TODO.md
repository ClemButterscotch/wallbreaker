# TODO

## Wild Roles advanced play pack — implemented

The free, optional **Wild Roles** host setting is implemented for standard games with
4–11 players. When enabled, every Specialist seat receives a different secret Wild
Role. Wild Roles are Loyal: each Wild player must satisfy a private goal and the
Wallfacer team must win. The plan remains hidden from the Wild player.
Every Wild Role uses a normal `+1` / `-1` dial action. Wrapper also has its persistent
wrapping power.

### Role bank

- **Bounty** — At setup, receive two players who are neither Police nor
  Wallfacer; complete the goal if Police arrests both of them at least once each. The role is
  omitted from four-player draws because there are not two valid targets.
- **Extremist** — Receive the most extreme dial outside the Wallfacer's plan;
  complete the goal after it reaches the opposite endpoint (`0` or `9`) at least once.
- **Conservationist** — Complete the goal when the sum of all six
  dials exactly equals the starting sum after any round from round 4 onward. Matching
  during rounds 1–3 does not count.
- **Moderate** — Complete the goal whenever all six dials are
  simultaneously in the inclusive `3`–`7` range. The starting board can qualify.
- **Disruptor** — Complete the goal after an uncancelled move goes away from the target
  on each of the three hidden plan dials. The Disruptor does not know the plan and
  may need trial and error; repeated successes on one dial and arrested moves do not add progress.
- **Loner** — Complete the goal after, in four separate rounds, choosing a dial color no other
  player chose that round. A round does not count if Police arrests the Loner.
- **Oddball** — Complete the goal after any completed round ends with
  at least five of the six dials showing odd numbers. The starting board does not count.
- **Numerologist** — Complete the goal after any completed round ends
  with three or more dials showing the same number. The starting board does not count.
- **Wrapper** — A dial touched by Wrapper’s uncancelled move uses modulo-10
  wrapping for that round instead of stopping at 0 or 9. Complete the goal after this
  power wraps three different dial colors; the power remains active afterward.

### Implemented design

- The pack requires 4–11 players and replaces every Specialist with a unique Wild
  Role; it never alters the Wallfacer, Wallbreaker, or Police seats. The cap ensures
  at least one of the nine roles is always unoccupied.
- The setting is host-controlled, persisted in authoritative state, and restored
  after reload or return to the lobby.
- Assignments, setup data, and progress stay private. Police receives no partial
  Wild information. Wallbreaker privately learns exactly one randomly selected
  unoccupied role and may use it as a cover identity. A public reference popup lists
  all nine generic roles.
- The private role card shows live progress meters for countable objectives and
  the starting and current totals for Conservationist. Moderate, Oddball, and Numerologist
  have no partial progress display because their completed-round conditions are binary.
- Wild players never receive a Wallfacer plan display or its target values. Every
  Wild Role stays complete once achieved. A Wild player wins exactly when their goal is satisfied and the Wallfacer team wins, including
  after an incorrect Wallbreaker guess.
- After any Wild goal is achieved, its progress panel and dial markers
  disappear, the player screen gains a subtle purple tint, and Show Role confirms completion.
- Wild players use normal `+1` / `-1` dial actions; simultaneous resolution,
  write-once selections, and Police arrests retain their standard behavior.

### Automated test coverage added

- Unique multi-role assignment, preservation of all three core roles, the eleven-player
  cap, Bounty eligibility, and the no-eligible-seat case.
- Pure-rules evaluation for all nine objectives, including arrest cancellation,
  simultaneous actions, repeated-round counters, boundary values, and final-round
  timing.
- Active-game/postgame disclosure boundaries, plan privacy, goal completion timing,
  and Loyal-aligned Wild results.
- Regression coverage for standard role composition, legal actions, round
  resolution, tutorial disclosure, and Wild Roles disabled.

### Manual verification remaining

- Exercise host toggle persistence, the private player role card, phone layout,
  observer view, and the postgame result in a real multi-browser room.
- Compare and select the preferred per-role information treatments in the Wild
  Roles tab of the visual preview lab.
