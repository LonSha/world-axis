# Agent Note: Elapsed time belongs to its scene or fortress

Status: implemented

## Problem
On a copy of the East Market save one GENERATION_ENDED event advanced round 4 to 5 and changed local exposure, concentration and ration days from [0,80,20] to [9.6,40,19]. No journey or calendar action had taken place. The bus supplied two 30-minute arguments and a one-day argument itself.

## Decision
dispatchTick accepts optional elapsedMinutes for scene actors and elapsedDays for registered fortresses. Both default to zero; an explicit positive day count must fit the siege owner's 1..60 range. They are scoped inputs, not a global clock: actor minutes do not prove siege days, and fortress days do not establish continuous presence for actors. Exposure also requires a single zone. Named eraAdvance remains separate. Round-based epoch progression, routine evaluation and encounter detection still run. Fatigue and gear inputs are points, not duration. The existing nighttime one-hour sleep assessment is non-mutating.

The ferry walk button reads back how many minutes each selected traveller actually walked. A player explicitly waiting for relief at the same place experiences that interval there; a traveller does not acquire exposure from the destination while on the road. An unrelated journey is not a participant. The generic world.advance ledger remains usable in rehearsals without changing live closure-backed physiology.

## Alternatives considered
Suppressing the entire reply pulse would also suppress encounters and turn-based progression. Passing zero or omitting the duration at the owner call would invoke the metabolism fallback or the siege minimum. Feeding a travel step into a second full pulse would duplicate unrelated turn work.

## Consequences
Direct pulse callers that expected a day or thirty minutes must specify the intended interval. This does not persist the environmental, metabolic or siege owners across chats or reloads. The separate V23 owner-state proposal concerns different owners.

Run tests/cascade-elapsed-time.js and tests/appointment-quota-v2562.js. The isolated ST 1.19.0 probe compares the HTTP-served product files with the worktree and reads owner state after a reply, duplicate, scoped ten-minute and two-day API calls, and two real walk-button clicks covering 10+4 minutes. Evidence: integration/time-before.log and integration/time-after.log under the 1128 acceptance workspace.
