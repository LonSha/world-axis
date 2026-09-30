/**
 * WorldAxis engines/rhythm-loop.js (v2.129.0) — 呼吸式节奏环（缝 A4）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓已有的两个节奏模块量的都是**跨度**：
 *     · `engines/tempo.js`  —— 四挡速率（largo / andante / allegro / presto），答「这一章推进多快」；
 *     · `engines/temporal-lock.js` —— 锁定期的硬上限，答「这段时间不准跳」。
 *   而叙事真正缺的是**张弛**：「这一段该紧还是该松」。写成一场持续挤压的对峙（全 Hold）
 *   与写成一场有起有落的对峙，跨度可以完全一样，读者感受却相反。本仓对「张弛」零手段——
 *   `inhale` / `exhale` 全仓零命中。
 *
 *   缝合来源：st-beat-tracker `docs/storybeat-engine.md` §3.3「叙事控制塔」的四相位
 *   （Inhale 蓄势 / Hold 保持 / Exhale 释放 / Pause 停顿）+ 循环计数 + 最近章节强度记录
 *   + **叙事手法冷却**。
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `step()` —— 沿 `Inhale → Hold → Exhale → Pause` 单向推进一格，并累计循环数；
 *   ② `cool(device)` —— 「同一个叙事手法刚用过，不许立刻再来一次」（冷却）；
 *   ③ `buildBlock()` —— 把「当前相位 + 本相位的写法要求 + 冷却中的手法」交给正文。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 `step` 报 `disabled`、不推进相位、不计数。
 *   2 相位**单向**推进，不许跳（`next` 必须是 PHASES 里的下一项，或 `rewind` 显式回退）。
 *      跳跃会让「循环数」失去意义（循环数 = 走完全程几圈），那是本模块唯一的计量真源。
 *   3 `step` 不接受调用方指定目标相位 —— 相位由本模块自己的序列决定，
 *      否则「节奏环」退化成「手填一个字段」。
 *   4 冷却只记手法名与轮号，**不记手法内容**（内容是用词的事，不是账本的事）。
 *   5 冷却窗口内 `cool` 报 `too-soon` 并把「还要等几轮」一并带出（不静默说「不行」）。
 *   6 `buildBlock` 在关闭时返回空串（零 token 占用），相位为 `unset` 时也返回空串 ——
 *      从没推过相位就不该凭空给正文塞一段节奏约束。
 *   7 不写 store 之外的地方：相位与冷却都进存档（这是要跨轮延续的决策状态）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_rhythm_settings_v1';
  const PHASES = ['Inhale', 'Hold', 'Exhale', 'Pause'];
  const DEF = { enabled: false, coolRounds: 3, maxDevices: 24 };
  const __REG = { key: LS_KEY, def: DEF, module: 'rhythmLoop', bounds: { coolRounds: [1, 12], maxDevices: [4, 64] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { steps: 0, cycles: 0, cools: 0, blocks: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }

  const PHASE_HINT = {
    Inhale: '蓄势：只加压力，不给结果。让读者感到「要出事了」而事情还没出。',
    Hold: '保持：把当前张力维持在同一水位，不加速也不松劲。',
    Exhale: '释放：让积压的东西落地（动作、揭破、决断）。',
    Pause: '停顿：给一口气的余地。写日常细节、写身体感受，不推进冲突。'
  };

  function bucket(draft) {
    if (!draft.rhythm || typeof draft.rhythm !== 'object' || Array.isArray(draft.rhythm)) draft.rhythm = { phase: 'unset', seq: 0, cycles: 0, devices: [] };
    const b = draft.rhythm;
    if (typeof b.seq !== 'number') b.seq = 0;
    if (typeof b.cycles !== 'number') b.cycles = 0;
    if (typeof b.phase !== 'string') b.phase = 'unset';
    if (!Array.isArray(b.devices)) b.devices = [];
    return b;
  }
  function view() { const s = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; return (s.rhythm && typeof s.rhythm === 'object') ? s.rhythm : { phase: 'unset', seq: 0, cycles: 0, devices: [] }; }
  function phase() { return view().phase || 'unset'; }

  /** 相位单向推进一格。`rewind:true` 为显式回退（跳回 Inhale），是唯一允许的反向动作。 */
  function step(opts) {
    const o = opts || {};
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', phase: phase() }; }
    let out = null;
    const r = (WA.store && WA.store.transact) ? WA.store.transact(function (d) {
      const b = bucket(d);
      const cur = PHASES.indexOf(b.phase);
      let to;
      if (o.rewind === true) to = 0;
      else if (cur < 0) to = 0;                    // 首次推进：从 Inhale 起
      else to = (cur + 1) % PHASES.length;
      if (!o.rewind && cur >= 0 && to === 0) b.cycles++;    // 走完一圈
      b.phase = PHASES[to]; b.seq++;
      out = { ok: true, phase: b.phase, index: to, cycles: b.cycles, seq: b.seq };
      return true;
    }, 'rhythmLoop:step') : null;
    if (!out || !r || r.ok !== true) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.steps++; stat.cycles = out.cycles; stat.lastReason = out.phase;
    return out;
  }

  /** 叙事手法冷却：同一手法在 coolRounds 轮内不得复用。 */
  function cool(device) {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const name = clean(device, 60);
    if (!name) { noteFault('missing-key'); return { ok: false, reason: 'missing-key', detail: '手法名必填' }; }
    let out = null;
    const r = (WA.store && WA.store.transact) ? WA.store.transact(function (d) {
      const b = bucket(d);
      const now = b.seq;
      const win = settings().coolRounds;
      const hit = b.devices.filter(function (x) { return x && x.name === name; })[0];
      if (hit && (now - hit.at) < win) {
        out = { ok: false, reason: 'too-soon', name: name, usedAt: hit.at, wait: win - (now - hit.at) };
        return false;
      }
      if (hit) hit.at = now; else b.devices.push({ name: name, at: now });
      if (WA.evict) WA.evict.array(b.devices, 'rhythm.devices', settings().maxDevices);
      // maxDevices 的消费点在这里（设置项必须真管一件事）：v2.30.0 死键扫描要求
      // 每个设置键都有**生产消费点**——冷却表的上限就是它，per-call 传入。
      out = { ok: true, name: name, at: now };
      return true;
    }, 'rhythmLoop:cool') : null;
    if (!out) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    if (out.ok) stat.cools++; else noteFault(out.reason);
    return out;
  }

  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const v = view();
    if (!v.phase || v.phase === 'unset') return '';
    stat.blocks++;
    const hint = PHASE_HINT[v.phase] || '';
    const lines = ['[节奏环] 当前相位：**' + v.phase + '**（已走 ' + (v.cycles || 0) + ' 个完整循环）——' + hint];
    const now = v.seq || 0;
    const cooling = (v.devices || []).filter(function (x) { return x && (now - x.at) < cfg.coolRounds; });
    if (cooling.length) {
      lines.push('冷却中的叙事手法（' + cfg.coolRounds + ' 轮内用过，本期不得复用）：'
        + cooling.map(function (x) { return x.name; }).join('、'));
    }
    lines.push('节奏铁律：**张弛是相位，不是力度**——不要靠把每一段都写得更紧来制造紧张，要靠相位的推进。');
    return lines.join('\n') + '\n';
  }

  WA.rhythmLoop = {
    PHASES: PHASES.slice(),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    step: step, cool: cool, phase: phase, view: view, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/rhythm-loop.js', { kind: 'engine', ver: '2.129.0' });
})();