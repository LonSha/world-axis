# Agent Note: Keep chat-switch prompt cleanup out of the world store
Status: implemented

## Problem
SillyTavern 1.19.0 exposes the incoming chat ID before WorldAxis reloads the world. The cleanup handler still needs the outgoing cache to identify landed host prompt slots. Persisting its cleanup snapshot in this window can write the outgoing world to the incoming key. In the isolated host the same test letter was present in two main state keys and their backups, not just the journal DOM. The old test fixture has no per-write trace establishing when that particular copy was made.

## Decision
On the chat-changed trigger, clear the host slots and reset the inspector, but do not transact the snapshot or append a per-chat cleanup receipt. Manual cleanup retains its existing behavior.

## Alternatives considered
Loading the new world first loses the outgoing slot list. Filtering the journal would hide a persisted problem. Deleting apparent duplicates would destroy legitimate branch history.

## Consequences
Historical snapshots remain historical; this change does not recover a previously overwritten world. There is no change to state format or legitimate branch inheritance.

## Verification
The tool-diag regression checks host clearing with no committed revision or ledger change. With the journal open, the isolated host switched A, B, care, A, care. The two test markers were present in A, neither in B, only the first in care; persisted letter arrays matched their pre-switch snapshots throughout. After a page reload, care contained only lt_5_1 in memory and storage and the journal showed its reply. No external model or real player save was used.
