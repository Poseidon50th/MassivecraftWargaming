# Multiplayer Architecture

## Goal

Massivecraft’s Wars v0.7.2 keeps the game itself on GitHub Pages while adding an authoritative, quota-hardened two-player service. The service keeps orders secret, enforces the existing rules, survives a browser refresh, and protects ongoing matches from exhausting the free allowance through wasteful transport or room spam.

## Components

| Component | Responsibility |
|---|---|
| GitHub Pages | Serves the public game interface, images, shared rules modules, and Worker address. |
| Online controller | Creates or joins rooms, renders the local perspective, holds only the player’s unsubmitted draft, and sends actions. |
| Worker router | Applies origin policy, creates rooms, hashes capability tokens, and forwards each request to its room. |
| Admission Durable Object | Applies a conservative daily new-room budget and a per-connection creation limit before any match room is created. |
| Durable Object | Serializes all actions for one room, persists state, broadcasts public snapshots, and expires inactive rooms. |
| Shared engine | Validates movement and facing, calculates terrain/control, resolves simultaneous orders, records casualties, and checks victory. |

## Room phases

| Phase | Host | Guest | Server transition |
|---|---|---|---|
| Lobby | Copies invitation; waits for guest. | Claims the invited seat with a display name. | Guest joins. |
| Proposal | Proposes random terrain or a complete manual field. | Approves or requests a different field. | Approval creates the game. |
| Deployment | Places one reserve unit when indicated. | Places one reserve unit when indicated. | Alternates until both reserves are empty. |
| Orders | Prepares and commits the required secret orders. | Prepares and commits the required secret orders. | Resolves only after both complete sets exist. |
| Ended | Reads the result or returns home. | Reads the result or returns home. | Victory check or resignation ends the room. |

## Information boundaries

The client may receive:

- terrain, unit positions, facing, reserves, round, phase, and public result;
- player display names and connected status;
- whether each side has committed orders; and
- structured reports from already resolved rounds.

The client never receives:

- the other player’s token or stored token hash;
- either side’s submitted orders before resolution;
- the Durable Object’s private order fields; or
- a client-trusted movement path, Initiative modifier, or terrain effect.

## Perspective

The canonical server uses `human` for the host and `computer` for the guest because those are the engine’s stable side identifiers. The guest browser rotates every coordinate and facing by 180 degrees and swaps the display colors. Consequently, both players see their own blue army at the bottom while all server actions still reference one canonical board.

## Order validation

For every submitted order, the server:

1. authenticates the seat;
2. finds the alive canonical unit belonging to that seat;
3. verifies that the requested final facing is available to that unit type;
4. regenerates all currently available moves for that unit;
5. matches the requested destination to one regenerated move;
6. uses the regenerated path and River penalty;
7. validates the whole allied order set for count, distinct units, and distinct destinations; and
8. resolves only when the other seat has also submitted a complete validated set.

## Reconnection and delivery

The invitation token is stored in the browser for that room and seat. A refresh requests one sanitized snapshot, then opens a hibernatable WebSocket. Battlefield approval, deployment, orders, withdrawal, resignation, state synchronization, and reconnect delivery all use that socket. There is no continuous polling loop.

If the connection closes, the client retries after 1, 2, 4, 8, 16, 32, and then at most 60 seconds. Returning focus to the page performs one synchronization; while connected it is a WebSocket message, and while disconnected it is one HTTP snapshot. A visible Reconnect button lets the player request the same recovery immediately.

Every live action has a unique identifier. The room retains a short bounded list of accepted identifiers for each seat. Re-delivering an identifier acknowledges the existing result without applying the action again.

## Quota and abuse controls

- Incoming live messages use Cloudflare's discounted WebSocket accounting; outgoing state broadcasts are not billed as incoming requests.
- Accepted room actions write the authoritative room once. The 30-day alarm is written when the room is created and rescheduled only if it wakes before a later activity deadline.
- New-room creation defaults to 400 rooms per UTC day and eight rooms per connection in ten minutes. Reaching the daily guard pauses only new rooms; existing rooms continue.
- A seat may send at most twelve actions in ten seconds. Oversized bodies, malformed messages, and repeated invalid invitation attempts are rejected.
- The creation and action limits are intentionally above ordinary human play speed but below useful automated abuse speed.

Room actions refresh the stored 30-day inactivity deadline without rewriting the alarm. When the existing alarm fires, it either reschedules itself to the newer deadline or closes connections and deletes the expired room. Turns themselves have no clock.

## Versioning

- Public room protocol: `2`
- Durable Object migration tag: `v1`
- Admission Durable Object migration tag: `v2`
- Game release: `0.7.2`

Do not remove or rename either Durable Object class or either deployment migration when publishing an ordinary update. Stored v0.7.0 rooms migrate to protocol 2 when first reopened. If the stored room shape changes later, add a room migration function and a new deployment migration tag rather than silently reinterpreting old state.
