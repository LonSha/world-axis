# Agent Note: Preserve witnessed encounters across normal generation

Status: implemented

## Problem
A local SillyTavern chat recorded the player and A-Zhou at East Market but the next prompt had no witnessed encounter. Wiring a renderer alone still lost a 20-token fact with four tokens left. After fixing the budget registration, reload initially read round five correctly; the first normal generation reverted the world to round four in floorSettle.beginRound.

## Decision
The active chat owns up to 40 actual encounters. The renderer offers only the newest mutual encounter involving the player from the current or preceding round. A past-tense statement avoids implying both people are still present. The source has its own visibility switch and participates in the existing rank-four memory budget. The interceptor supplies the host generation type; a matching settled floor is not sufficient evidence to roll back on normal generation. Explicit regenerate and swipe retain signature-checked rollback. Untyped direct callers keep their previous behavior.

## Alternatives considered
Process history is cheap but cannot distinguish chats or survive reload. Pinning the message would defeat budget decisions. Reinstalling the persisted world on refresh would target the wrong layer: both storage and memory contained round five immediately before the normal interceptor ran.

## Consequences
One-sided sightings remain history, not player knowledge. A tight budget can still omit the line. Verification requires the actual host prompt, not just a successful builder. The encounter-history regression covers visibility of facts, eviction, expiry and normal versus reroll semantics. This change does not establish that an online model will use the prompt in its response.
