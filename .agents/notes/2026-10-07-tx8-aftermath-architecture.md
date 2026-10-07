# TX8 aftermath.js (v2.171.0) Architecture Notes

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
