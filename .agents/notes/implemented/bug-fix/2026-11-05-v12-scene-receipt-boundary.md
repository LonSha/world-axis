# Agent Note: V12 scene receipt truth boundary

Status: implemented

## Problem

The initial scene API accepts invented receipt strings and caller-provided terminal states. Its shallow views expose nested mutable arrays, and successful transaction callbacks can mask rejected commits.

## Decision

Scene resolution reads terminal act or liaison deal records from the transaction draft. The source record determines receipt status; caller-provided status, source and sceneStatus do not determine world outcomes. Scene APIs return detached JSON snapshots and expose persistence and deferred flags from the store transaction. New scenes stop at 40 records and receipts stop at 24 per scene, preserving existing deduplication records instead of silently evicting them.

## Alternatives considered

Accepting arbitrary receipt references allows future engine adapters without additional implementation, but currently lets model text impersonate world outcomes. Explicit act/deal adapters are used until additional source contracts are verified. Evicting old scenes keeps new work available but loses opId deduplication history; explicit capacity refusal preserves history pending a deliberate archive contract.

## Consequences

The API rejects fabricated and unfinished references and reports rejected transactions accurately. Store persistence failure remains distinct from memory application under the existing store contract. A matching terminal reference does not yet prove its relevance to scene participants or intent. Automatic settlement consumers, UI integration, reload tests and the complete broken-promise scenario remain outstanding.

The targeted VM probe checks fabricated/pending references, terminal status authority, detached views, disabled resolution, duplicate receipts and simulated transaction rejection. Its terminal deal is a fixture, not evidence of production settlement execution.

Existing TX6 commission notes overlap only in the general coordinator principle and remain unchanged. Historical capacity notes concern other bounded containers and are not superseded.
