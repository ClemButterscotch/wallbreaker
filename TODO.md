# TODO

## Wild Roles advanced play pack — implemented

The free, optional **Wild Roles** host setting is implemented for standard games with
4–9 players. When enabled, every Specialist seat receives a different secret Wild
Role. Wild Roles are Loyal: each Wild player must satisfy a private goal and also
help the Wallfacer complete a plan that remains hidden from the Wild player.
Wild Roles normally keep a `+1` / `-1` dial action; Moderate also gets `+2` / `-2` on
its three assigned dials.

### Role bank

- **Bounty — happens once** — At setup, receive two players who are neither Police nor
  Wallfacer; complete the goal if Police arrests both of them at least once each. The role is
  omitted from four-player draws because there are not two valid targets.
- **Extremist — happens once** — Receive the most extreme dial outside the Wallfacer's plan;
  complete the goal after it reaches the opposite endpoint (`0` or `9`) at least once.
- **Conservationist — at finish** — The sum of all six dials must be within `3`
  of the starting sum when the game ends.
- **Moderate — at finish** — Learn the three colors excluded from the Wallfacer's plan;
  all three must be in the inclusive `4`–`6` range when the game ends. Those colors permit
  specialist-strength `-2`, `-1`, `+1`, and `+2` moves.
- **Disruptor — happens once** — Complete the goal after an uncancelled move goes away from the target
  on each of the three hidden plan dials. The Disruptor does not know the plan and
  may need trial and error; repeated successes on one dial and arrested moves do not add progress.
- **Loner — happens once** — Complete the goal after, in four separate rounds, choosing a dial color no other
  player chose that round. A round does not count if Police arrests the Loner.

### Implemented design

- The pack requires 4–9 players and replaces every Specialist with a unique Wild
  Role; it never alters the Wallfacer, Wallbreaker, or Police seats.
- The setting is host-controlled, persisted in authoritative state, and restored
  after reload or return to the lobby.
- Assignments, setup data, and progress stay private. Police and Wallbreaker receive
  no partial Wild information. A public reference popup lists all six generic roles.
- The private role card shows live progress meters for countable objectives and
  exact board requirements for Conservationist and Moderate.
- Wild players never receive a Wallfacer plan display or its target values. Bounty,
  Extremist, Disruptor, and Loner stay complete once achieved; Conservationist and
  Moderate are evaluated from the board state when the game ends.
  A Loyal result from a wrong Wallbreaker guess is not sufficient.
- Wild players use normal `+1` / `-1` dial actions; simultaneous resolution,
  write-once selections, and Police arrests retain their standard behavior.

### Automated test coverage added

- Unique multi-role assignment, preservation of all three core roles, the nine-player
  cap, Bounty eligibility, and the no-eligible-seat case.
- Pure-rules evaluation for all six objectives, including arrest cancellation,
  simultaneous actions, repeated-round counters, boundary values, and final-round
  timing.
- Active-game/postgame disclosure boundaries, plan privacy, happens-once versus
  at-finish timing, and Loyal-aligned Wild results.
- Regression coverage for standard role composition, legal actions, round
  resolution, Mathbreaker, tutorial disclosure, and Wild Roles disabled.

### Manual verification remaining

- Exercise host toggle persistence, the private player role card, phone layout,
  observer view, and the postgame result in a real multi-browser room.
- Compare and select the preferred per-role information treatments in the Wild
  Roles tab of the visual preview lab.
