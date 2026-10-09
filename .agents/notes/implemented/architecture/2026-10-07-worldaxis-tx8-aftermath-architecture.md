# Agent Note: TX8 aftermath.js (v2.171.0) — location effects and repair lifecycle
Status: implemented

## Module: engines/aftermath.js
- **Purpose**: Register time-limited location effects (road damage, facility repair-in-progress, trade halt) and manage repair lifecycle.
- **13 exports**: getSettings/setSettings + register/repair/inspect/active/pending/view/cancel + buildBlock/diagnose/stat/reset
- **DEF**: { enabled: false, maxEffects: 48 }
- **LS_KEY**: worldaxis_aftermath_settings_v1

## Dependencies (read-only coordination, no replacement)
- region.places() - validates placeId existence before registering effects
- sediment.feel() - read-only perception layer in inspect() (does not prove effect resolved)
- store.transact() - persistence
- clock.now() - timestamps
- evict.array() - capacity management
- settingsBus - configuration

## Eight Negative Boundaries
1. Default off (enabled:false)
2. Sediment trace text does not auto-trigger resource penalty - must register to take effect
3. Sediment decay does not auto-prove repair - decay only affects perception, effect validity judged by this module
4. Same event effect only registered once - eventId dedup
5. Weather effects only use existing explicit conditions
6. Does not re-propagate near/far field - does not rebuild region propagation chain
7. Does not create physical state for unknown places - placeId must exist in region.places
8. Effect expiry, work interruption, cancellation, concurrent repair, and reload all produce consistent results

## Reject Codes (DEAD table)
- duplicate-event: same eventId already registered
- effects-full: maxEffects reached (cap=48)
- disabled, missing-fields, not-found, not-active: shared with other modules

## Injection Chain (7 points + tool-diag 4 points)
- render/inject.js: SOURCES, __REG.def, SRC_NAME, SRC_MOD_SETTING, injection branch
- ui/panel.js: VIS_NAMES
- engines/inject-budget.js: PRIORITY + ACCOUNTS
- index.js: VERSION 2.171.0 + LOAD_ORDER
- engines/tool-diag.js: module map, secAftermath(), UI_BINDINGS (8 controls wa-af-*), diag object

## Problem
> 本节为 O7（v2.187.0）格式补登：本篇原文未设 Problem 节；问题面即上方「Module: engines/aftermath.js」与「Dependencies (read-only coordination, no replacement)」两节 —— 登记限时地点效果（路损 / 设施维修中 / 通商中断）并管理修复生命周期，正文未重排、未改写。

## Decision
> 本节为 O7（v2.187.0）格式补登：本篇原文未设 Decision 节；决策正文即上方「Eight Negative Boundaries」一节（默认关、沉积不自动生效/不自动证明修复、eventId 去重、不重推远近场、不为未知地点造物态、到期与中断等一致），正文未重排、未改写。

## Consequences
> 本节为 O7（v2.187.0）格式补登：本篇原文未设 Consequences 节；其后果面已散见上方「Reject Codes (DEAD table)」与「Injection Chain (7 points + tool-diag 4 points)」两节，正文未重排、未改写。

## Alternatives considered
> 本节为 O7（v2.187.0）格式补登：本篇原文未记录被否决方案，此处**如实留空**：O7 只做结构补齐，不为历史笔记事后追补当时未记录的取舍。
