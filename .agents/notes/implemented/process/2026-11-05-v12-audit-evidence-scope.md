# Agent Note: V12 audit evidence scope

Status: implemented

## Problem

Earlier V12 reports call regex indexes deep audits and final dispositions. They cover 338 top-level JavaScript files, while the tracked repository currently contains more than a thousand files. The first report loses filenames through shell interpolation; the behavior scanner counts literal backslash-n sequences.

## Decision

The repository manifest enumerates tracked paths and SHA-256 source hashes at generation time. Every entry starts with semanticReview pending: presence in an index does not imply semantic review. Existing report conclusions carry an explicit correction, the first report restores filenames through a checked-in generator, and line counts read actual newline-separated source. Product rollout conclusions require independently recorded semantic and runtime evidence.

## Alternatives considered

Keeping the 338-file scope makes reports smaller and preserves previous numbers, but omits entrypoints, nested source, tooling and tests despite the user's all-file requirement. Marking indexed files reviewed would simplify accounting but asserts evidence that does not exist. The manifest therefore retains the broader scope and pending states.

## Consequences

The scope gap becomes inspectable without claiming completion. Hashes describe bytes at generation time and must be refreshed after edits; generated reports are inventory artifacts, not runtime validation. The report repair still uses the existing scanner output and inherits its heuristic classification limitations.

The earlier scene-receipt note concerns runtime behavior and remains applicable; this process decision does not supersede it. Targeted validation checks filename uniqueness, report row coverage, source line counts and manifest hashes.