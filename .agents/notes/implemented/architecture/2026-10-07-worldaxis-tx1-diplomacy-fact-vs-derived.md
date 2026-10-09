# Agent Note: Diplomacy fact layer vs. faction-graph derived layer — six boundaries and the wiring-not-update decision
Status: implemented

## Problem

faction-graph (`engines/faction-graph.js`) computes pairwise relationship
edges from each side's attitude, marking every edge `derived: true` with a
`basis`. That answers "what relationship should these two have?" — it does
not record what was actually negotiated, signed, or breached. TX1 adds
`engines/diplomacy.js` to carry that fact layer: stable pairId, bilateral
attitudes, active treaties, expiry, and fulfilment receipts.

The core architectural question: how to add a new engine with 21 exports,
6 of which were initially dead (getSettings, setSettings, applies,
buildBlock, pairId, diagnose), without violating the repository rule that
**every new export must have a real consumer** — and without blurring the
line between derived values and recorded facts.

## Decision

Wire every dead export to a real product consumer rather than use
`dead-export-gate --update` to register them as accepted dead. The six
consumers:

| Export      | Consumer                                      |
|-------------|-----------------------------------------------|
| getSettings | panel `wa-dp-enabled` checkbox (read)         |
| setSettings | panel `wa-dp-enabled` checkbox (write)        |
| applies     | panel `wa-dp-applies` button                  |
| buildBlock  | `render/inject.js` new source "外交事实"      |
| pairId      | `tool-diag` secDiplomacy `pairSymmetry` probe |
| diagnose    | `tool-diag` secDiplomacy `self` proof         |

### Six fact-vs-derived boundaries

1. **pairId is a fact-layer identifier**, not a derivation. It is
   `'dp_' + FNV1a(sort(a,b).join('|'))` — symmetric by construction
   (pairId(甲,乙) === pairId(乙,甲)), but this symmetry is a property of
   the fact layer. The derived attitude has no symmetry guarantee.

2. **The injection source name is "外交事实" (diplomacy facts), not
   "势力外交" (faction diplomacy).** The injection item name must answer
   "what is this block?" not "which module produced it?" — it carries
   only negotiated facts, not the relationship graph's derived values.

3. **PRIORITY rank 5**, same tier as "组织制度" and "用户锁定". Active
   treaties are adjudication baselines for subsequent plot (who owes whom,
   what is permitted). They do not belong in rank 6/7 ambient atmosphere.

4. **No automatic migration from derived to fact.** Unknown pairs stay
   `unknown`; old derived edges keep their labels and do not auto-promote
   to alliance or war.

5. **Terms and states are closed vocabularies.** TERMS = [trade,
   mutual-aid, armistice, embargo]; STATES = [unknown, contact, accord,
   alliance, cold, hostile]; STAGES = [proposed, countered, accepted,
   signed, rejected]. AI text proposals pass through structural
   pre-checks; pure rules only execute declared data.

6. **Signing does not auto-leak to uninformed characters.** The fact layer
   records what happened; who knows about it is a separate concern.

### Injection chain seven-point same-batch registration

Following the v2.56.0 rule (add branch without source = switch does
nothing; add source without branch = declared but unconsumed):

1. `render/inject.js` SOURCES array: `'diplomacy'` inserted between
   `'sediment'` and `'chrono'` (chrono row is v2.127.0 anchor zone,
   immovable)
2. `render/inject.js` `__REG.def`: `diplomacy: true`
3. `render/inject.js` SRC_NAME: `diplomacy: '外交事实'`
4. `render/inject.js` SRC_MOD_SETTING: `diplomacy: 'worldaxis_diplomacy_settings_v1'`
5. `render/inject.js` injection branch: `if (vis.diplomacy && WA.diplomacy) { ... }`
6. `ui/panel.js` VIS_NAMES: `diplomacy: '外交事实'`
7. `engines/inject-budget.js` PRIORITY + ACCOUNTS: `'外交事实': { rank: 5, fold: true }` + `['外交事实', '叙事推进', '承载']`

The display name "外交事实" is character-for-character identical across
all seven sites.

## Alternatives considered

- **Use `dead-export-gate --update` to accept the six dead exports.**
  Rejected: `--update` refreshes the ledger to match reality, but the
  repository rule is "every new export must have a real consumer."
  Registering dead exports as accepted-dead would mask the fact that the
  engine declared six functions nobody calls — exactly the silent growth
  surface the dead-export gate was built to catch.

- **Name the injection source "势力外交" (faction diplomacy).** Rejected:
  the injection item name answers "what is this block?" not "which module
  produced it?" — and the block carries only negotiated facts, not derived
  relationship values. "外交事实" makes the boundary explicit.

- **Put diplomacy in rank 6/7 (ambient atmosphere).** Rejected: active
  treaties are adjudication baselines. Losing them means breach and
  fulfilment have no reference point. Rank 5 puts them alongside
  institutional rules and user locks.

## Consequences

- **`__diplomacyWarn` internal namespace registration.** The
  self-verification block at the tail of `engines/diplomacy.js` writes
  `WA.__diplomacyWarn` when write-port counts mismatch. This is a `__`-
  prefixed internal ns that was not in the `NS_FACE_EXPECT.internalPrefixed`
  exception table in `tests/module-cycle-gate.js` (which had 6 entries:
  `__settingsRegs`, `__loaderState`, `__loadOrder`, `__loadFailed`,
  `__inited`, `__inputGuardInternal`). Adding `__diplomacyWarn` to the
  table (now 7 entries) resolved the nsFaceDrift red light. Same nature
  as the existing 6 internal ns entries.

- **`DP.getSettings` local alias caused dead-export-gate false positive.**
  `ui/panel.js` used `DP.getSettings()` (local alias) but the gate's
  attribution scanner only recognizes fully-qualified references
  (`WA.diplomacy.getSettings`). Changed to `WA.diplomacy.getSettings` —
  this is a gate scanning-surface limitation, not a product defect, but
  it also means the "local alias bypasses the gate" path is now closed.

- **settle-v2830 count nails updated.** Two assertions hardcoded
  loadEdges/callRefs and nsCount/loadedCount from the pre-diplomacy
  ledger. Updated to 83/164 and 189/181 respectively, with v2.165.0
  lineage notes appended.

- **tools/tx1_smoke.js retained as development verification tool.** It is
  neither a product file nor a dedicated gate; it is a vm-sandbox smoke
  test with minimal load order and localStorage stub. Committed with TX1
  as an engineering artifact.
