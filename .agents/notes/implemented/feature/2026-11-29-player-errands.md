# Agent Note: Chat-owned player errands

Status: implemented

## Problem

A promise is stored on the actor who made it, not necessarily on the player. Lost items were retained by the engine instance rather than the chat. Showing either collection unfiltered would expose other people's business.

## Decision

The journal projects open appointments and active personal contracts from the current chat. Appointment windows use rounds; estimates of travel to an open meeting place use the story clock with an explicit offset. Neither estimate settles the appointment. Lost items live in `lostFound.rows`, with a per-chat sequence. Only the owner's item, reported location and known claim status enter the journal. A pocketed item looks like one that has not been found.

## Alternatives considered

Using `lostFound.view()` as the bulletin would also expose unsuccessful claims and their proof. Copying promises and contracts into a separate journal list would require independent rollback and reconciliation.

## Consequences

Old process-local lost items have no reliable chat owner and are not migrated. The engine's detailed records remain available to internal callers; the player summary never reuses a raw detail object as display text. Opening-time guidance is not a promise that an activity of unspecified duration can finish before closing.

The first full run flagged the declared `lostFound.rows` eviction site as unused: a local splice enforced the limit but bypassed eviction reporting. Report through the shared per-call eviction site using the chat writer's configured limit; the store registry still records the absolute ceiling of 96. A nine-report scenario at limit eight verifies both the retained count and order.
