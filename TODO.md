# TODO

## Wild Roles advanced play pack

Add a free, optional **Wild Roles** host setting for standard games. When enabled, a
single eligible non-core player is dealt one secret Wild Role from the bank below.
The lobby and in-game UI should disclose that a Wild Role is present, but not its
identity or the specific role. The Wild Role keeps a normal `+1` / `-1` dial action;
its private objective is evaluated in addition to the normal Loyal/Wallbreaker game
result.

### Role bank

- **Bounty** — At setup, receive one player; win if Police arrests that player at
  least once.
- **Archivist** — Win if the Loyal team wins and no arrest occurs in either of the
  final two rounds.
- **Doomsayer** — Receive one secret dial; win if it reaches `0` or `9` before the
  game ends.
- **Conservationist** — Win if the final sum of all six dials is within `1` of the
  sum at game start.
- **Curator** — Learn the three colors excluded from the Wallfacer's plan; win if
  all three finish in the inclusive `4`–`6` range.
- **Contrarian** — Win after, in three separate rounds, moving a dial opposite the
  combined uncancelled moves by every other player on that dial.
- **Hermit** — Win after, in three separate rounds, choosing a dial color no other
  player chose that round.

### Design and implementation tasks

- Decide and document the eligibility threshold and which current non-core role is
  replaced; do not alter the fixed core roles (Wallfacer, Wallbreaker, and Police).
- Add the host lobby control, persist its setting in authoritative game state, and
  include it in reconnect/reload recovery.
- Randomly assign exactly one Wild Role only when the option is enabled and an
  eligible seat exists.
- Keep role cards, setup targets, and progress private in active-game public state;
  add only the chosen role's private state to that player's view.
- Define a post-game Wild Role results panel that reports the personal objective,
  whether it was met, and the evidence needed to understand the result.
- Keep the existing simultaneous, write-once selection and Police arrest semantics
  intact. Record whatever extra per-round facts are needed for Wild Role evaluation
  in the authoritative round history.
- Decide whether a Wild Role can co-win independently of the main faction result
  (current working assumption) and make the final winner UI unambiguous.

### Tests to add

- Role-bank assignment: disabled games have no Wild Role; enabled, eligible games
  have exactly one; assigned setup data is valid and private.
- Public-state privacy: players, observers, reconnecting clients, and postgame
  recap reveal only what their view is allowed to reveal.
- One focused pure-rules test suite for each of the seven objective conditions,
  including boundary values, cancellation by arrest, simultaneous dial changes,
  repeated-round counters, and final-round timing.
- Integration tests for host setting propagation, role assignment, end-of-game
  evaluation, and the post-game explanation.
- Regression coverage proving standard games with Wild Roles disabled retain their
  current role composition, selection validation, resolution, and win conditions.

