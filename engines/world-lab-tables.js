/**
 * WorldAxis engines/world-lab-tables.js (v2.529.0) — world-lab 的语汇常量与设置登记表
 *
 * 原本长在 engines/world-lab.js 里：三条路径封闭集（ARMS / ARM_CN）、沙盒轮数上限（MAX_ROUNDS 等）、差异表（DIFF_ROWS）、拍面名单（BEAT_FACES 等）、适配器种子表（ADAPTERS）与 settings 登记表（__REG）。
 *
 * 为什么单独成文件（OPV29-11）：这些是**封闭集合与登记表**（改一个词要在一千多行引擎里翻，
 *   而它们恰恰是最需要「一眼看全」的东西）。搬家**不动语义**：引擎在求值期解构进来用，
 *   所有调用点一字未改；缺表当场抛错，不静默退化成空词表（空词表会让「不在表里就拒收」
 *   变成「什么都拒收」，或反过来「什么都不校验」—— 两种都是不崩的错）。
 *
 * 本文件零算法：无具名函数、无 fs / store，只有一个 IIFE 外壳挂表。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_world_lab_settings_v1';
  const DEF = { enabled: true, maxSteps: 6, armA: '', armB: '' };
  const __REG = {
    key: LS_KEY, def: DEF, module: 'worldLab',
    bounds: { maxSteps: [1, 12] }
  };
  const FORMAT = 1;
  const MOD_TAG = __REG.module;
  /** 三条路径的**封闭集**：hold = 什么都不做（一步「等待」，rehearsal 明说它不写任何状态面）。 */
  const ARMS = ['hold', 'a', 'b'];
  const ARM_CN = { hold: '什么都不做', a: '选 A', b: '选 B' };
  /** hold 臂的那一步：`wait` 是 rehearsal 三个动作里唯一「零状态面写入」的一个。 */
  const HOLD_STEP = { kind: 'wait', who: '世界', ms: 0 };
  // ── v2.203.0（Y9）四个常量 ─────────────────────────────────────
  /** 沙盒推进的轮数上限（**内部常量**，不进 bounds：bounds 管的是设置键，这是入参夹取）。 */
  const MAX_ROUNDS = 12;
  const DEF_SIM_ROUNDS = 3;
  /** 每一轮在沙盒里往前拨多久（内部常量：它只影响副本里的故事时钟，不影响 live）。 */
  const SIM_ROUND_MS = 60000;
  /** 与拍引擎联动时，最多往前投影几拍（**只投影、不落拍**）。 */
  const MAX_AHEAD = 12;


  const BEAT_FACES = ['beatLedger', 'beatReport', 'beatMask', 'beatFacade'];
  const BEAT_SANDBOX_MEMBERS = ['rehearse', 'preview', 'simulate'];

  const ADAPTERS = [
    { key: 'action', order: 10, label: '行动', kind: 'advance', engine: 'act', member: 'advance',
      why: '行动结算是逐字走 exec.mutate 的推进面 —— 它能把这一步真跑在副本上' },
    { key: 'economy', order: 20, label: '经济', kind: 'advance', engine: 'org', member: 'grant',
      why: '组织账本（供给 / 薪酬 / 项目欠账）—— 它的写口直调 store.transact，故必须逐条判能不能进副本' },
    { key: 'logistics', order: 30, label: '物流', kind: 'advance', engine: 'freight', member: 'arrive',
      why: '货运到货确认 —— 与世界经济同一本账，隔离范围必须与经济类分开验' },
    { key: 'deadline', order: 40, label: '期限', kind: 'read', engine: 'agenda', member: 'upcoming',
      why: '跨模块到期清单是纯读面：它不推进任何东西，只作每轮之后的一口观测' },
    { key: 'consequence', order: 50, label: '后果', kind: 'advance', engine: 'causal', member: 'tick',
      why: '因果推进（后果落地）—— 与行动面同族走 exec.mutate，但时序排在行动之后' }
  ];

  WA.worldLabTables = {
    LS_KEY: LS_KEY, DEF: DEF, __REG: __REG,
    FORMAT: FORMAT, MOD_TAG: MOD_TAG, ARMS: ARMS,
    ARM_CN: ARM_CN, HOLD_STEP: HOLD_STEP, MAX_ROUNDS: MAX_ROUNDS,
    DEF_SIM_ROUNDS: DEF_SIM_ROUNDS, SIM_ROUND_MS: SIM_ROUND_MS, MAX_AHEAD: MAX_AHEAD, BEAT_FACES: BEAT_FACES, BEAT_SANDBOX_MEMBERS: BEAT_SANDBOX_MEMBERS,
    ADAPTERS: ADAPTERS
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/world-lab-tables.js', { kind: 'data', ver: '2.529.0' });
  }
})();
