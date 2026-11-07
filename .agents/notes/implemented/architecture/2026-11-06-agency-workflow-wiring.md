# Connect existing agency admission and receipts to workflow

## Evidence and gate
All 328 engine files inventoried by tools/engine-integration-audit.py. Textual references are not runtime reachability. Existing act.advance runs in after order 21; agency.schedule/processReceipts had no direct production callers found. Local Fix Only for agency workflow boundary: agency.js and focused test, under 80 added lines. Separate broad inventory tooling does not change runtime.

## Contract and decision
Register admission at after 20.5 and feedback at 21.5 using existing owner APIs and enabled=false default. Never synthesize plans, goal steps, completed events or routine receipts. maxSchedulePerTurn bounds dispatch. Existing action clock retained; no new time conversion. This is workflow glue, not a replacement scheduler.

## Rejected alternatives
Do not call all 328 engines blindly, switch all features on, or fabricate required event inputs. Do not create a second world store or duplicate act.advance. Do not treat static consumers as executable call evidence.

## Verification
agency-workflow-integration.js passes: registration/order, disabled gate, bounded dispatch, feedback invocation (stubbed owner calls).
s3-u2-v2194.js passes 67/67: owner receipt transaction regressions.
s3-tx2-v2166.js has 45 passes and two failures in manifest/index historical version assertions; no blanket full pass claim. Requires baseline comparison before classifying as pre-existing.
git diff --check clean.

## Remaining work
Bounded admission currently selects first eligible people; fairness across repeated turns requires a separately tested contract. Background simulation is requested asynchronously; workflow order alone does not establish completion of new simulation. No live-host acceptance or 328-module integration completion. Inventory must also inspect dynamic registries and render consumers. Existing full regression snapshot predates this patch and cannot validate it.