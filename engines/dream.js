/* dream.js —— 长梦·长卷引擎（WA.dream）
 *
 * 治什么：跨多宿的梦脉（长梦）不被写崩。
 *   - 梦脉织录：七个操作白名单（set_state / append_transition / open_thread /
 *     advance_thread / resolve_thread / abandon_thread / upsert_deviation），其余操作一律拒。
 *   - 梦卷归档：长卷有硬上限（文件数 / 总体量），超限挤出最旧卷，不静默丢。
 *
 * 缝合来源：st-theater（long-dream-memory.js 的增量织录操作白名单、long-dream-archive.js 的
 *   512MB / 5000 文件上限）
 *
 * 与邻座分工：memory.js 管分层记忆，pmem.js 管人物主观记忆，sediment 管地点沉积；
 *   dream 只管「梦里的线怎么织、梦卷怎么封存」。
 *
 * 边界（否定式）：
 *   1. 操作名只认白名单，其余按 bad-op 拒（不静默忽略）。
 *   2. 已解决的线不能再前进（resolve 后 advance 一律拒）。
 *   3. 偏离登记只记，不改主线。
 *   4. 归卷上限到顶后挤出最旧卷，并记 evicted 数。
 *   5. 线槽上限、偏离上限都有硬顶，不静默扩容。
 *   6. 不写正文、不占注入块正文位。
 *   7. 不进 __BOUNDED_CAPS 之外，所有容器均登记与骨架同源。
 *   8. 不代替 sediment 做地点沉淀，不代替 memory 分层。
 *   9. 卷内不存原文，只存摘要与线号（体量上限才可守）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  /** v2.230.0：决策时间统一出口（裸调 Date.now 会绕过冻结，回放对不上时只能全库通读）。 */
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_dream_settings_v1';
  const DEF = { enabled: false, maxThreads: 24, maxDeviations: 24, maxVolumes: 40, maxVolumeKB: 512 };
  const __REG = { key: LS_KEY, def: DEF, module: 'dream',
    bounds: { maxThreads: [4, 96], maxDeviations: [4, 96], maxVolumes: [4, 200], maxVolumeKB: [16, 4096] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const OPS = ['set_state', 'append_transition', 'open_thread', 'advance_thread', 'resolve_thread', 'abandon_thread', 'upsert_deviation'];
  const OP_LABEL = { set_state: '定梦态', append_transition: '押一笔转场', open_thread: '开线',
    advance_thread: '推线', resolve_thread: '结线', abandon_thread: '弃线', upsert_deviation: '登记偏离' };
  const THREAD_STATES = ['open', 'advanced', 'resolved', 'abandoned'];
  const THREAD_STATE_LABEL = { open: '已开', advanced: '推进中', resolved: '已结', abandoned: '已弃' };
  const MOODS = ['平静', '缠结', '惊惶', '温存', '荒谬'];
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  const stat = { ops: 0, threads: 0, resolved: 0, abandoned: 0, deviations: 0, volumes: 0, evicted: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function refuse(reason) { stat.refused++; noteFault(reason); return { ok: false, reason: reason }; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 120) : String(v == null ? '' : v).slice(0, max || 120); }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  const EMPTY_DREAM = function () { return { state: '', mood: '', transitions: [], threads: [], deviations: [], volumes: [] }; };
  /** 纯补齐：只在**传入对象**上补默认字段，不新挂任何 live 引用。 */
  function mkBucket(b) {
    ['transitions', 'threads', 'deviations', 'volumes'].forEach(function (k) { if (!Array.isArray(b[k])) b[k] = []; });
    if (typeof b.state !== 'string') b.state = '';
    if (typeof b.mood !== 'string') b.mood = '';
    return b;
  }
  /**
   * 只读影子：**读口不得改 live**。
   *   现场（v2.230.0 收口）：`store.get()` 返回 live 引用，旧实现在无参调用时
   *   原地给 live 补 `dream` 桶 ⇒ 任何一次读口（view / buildBlock / onset /
   *   volumeList / volumeGet / deviationList / threads）都成了写方，
   *   于是「观测改变被观测对象」—— tests/perf-observability-v2109.js 的 B13
   *   「取证不得改变被取证对象」当场现形。此处改为**影子**：没有桶就给空桶，
   *   有桶就补齐后返回（补齐发生在一个新建壳上，绝不挂回 state()）。
   */
  function bucket() {
    const r = state() || {};
    const raw = (r.dream && typeof r.dream === 'object' && !Array.isArray(r.dream)) ? r.dream : null;
    const shell = raw ? Object.assign({}, raw) : EMPTY_DREAM();
    if (raw) {
      ['transitions', 'threads', 'deviations', 'volumes'].forEach(function (k) {
        shell[k] = Array.isArray(raw[k]) ? raw[k].slice() : [];
      });
    }
    return mkBucket(shell);
  }
  /** 写路径专用：在 draft 上原地补桶（事务内，写回由 store 负责）。 */
  function bucketW(draft) {
    const r = draft || state();
    if (!r.dream || typeof r.dream !== 'object' || Array.isArray(r.dream)) r.dream = EMPTY_DREAM();
    return mkBucket(r.dream);
  }
  function threads() { return bucket().threads; }
  function onset() {
    const b = bucket();
    return { state: b.state, mood: b.mood, transitions: b.transitions.length, threads: b.threads.length, deviations: b.deviations.length, volumes: b.volumes.length };
  }
  function threadOf(id) { const k = clean(id, 40); return threads().filter(function (t) { return t && t.id === k; })[0] || null; }
  /** 织录：七个操作白名单。其余 op 一律 bad-op（不静默忽略）。 */
  function weave(op, payload) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = clean(op, 40);
    if (OPS.indexOf(o) < 0) return refuse('bad-op');
    const p = payload && typeof payload === 'object' ? payload : {};
    let out = null;
    WA.store.transact(function (draft) {
      const b = bucketW(draft);
      if (o === 'set_state') {
        const st = clean(p.state, 200);
        if (!st) { out = { ok: false, reason: 'empty-state' }; return false; }
        b.state = st;
        if (p.mood != null) b.mood = MOODS.indexOf(clean(p.mood, 10)) >= 0 ? clean(p.mood, 10) : b.mood;
        out = { ok: true, reason: 'ok', op: o, label: OP_LABEL[o], state: st, mood: b.mood };
        return true;
      }
      if (o === 'append_transition') {
        const t = clean(p.text, 200);
        if (!t) { out = { ok: false, reason: 'empty-transition' }; return false; }
        b.transitions = b.transitions.slice(-19).concat([{ text: t, at: clockNow('dream') }]);
        out = { ok: true, reason: 'ok', op: o, label: OP_LABEL[o], count: b.transitions.length };
        return true;
      }
      if (o === 'open_thread') {
        const id = clean(p.id, 40);
        if (!id) { out = { ok: false, reason: 'no-id' }; return false; }
        if (b.threads.filter(function (x) { return x && x.id === id; })[0]) { out = { ok: false, reason: 'dup-thread' }; return false; }
        const cap = cfg.maxThreads;
        const base = b.threads.length + 1 > cap ? b.threads.slice(b.threads.length + 1 - cap) : b.threads;
        const row = { id: id, title: clean(p.title, 80), state: 'open', steps: [], deviations: 0, openedAt: clockNow('dream'), updatedAt: clockNow('dream') };
        const _keptDt = base.concat([row]);
        // v2.231.0（OPT-2/OPT-4）：挤出器是**原地截断 + 返回报告**，不是「返回新数组」。
        //   把报告赋回数据槽 ⇒ 下一次进桶被 bucket() 重置为 [] ⇒ 整张表静默清空。
        if (WA.evict && WA.evict.array) WA.evict.array(_keptDt, 'dream.threads');
        b.threads = _keptDt;
        out = { ok: true, reason: 'ok', op: o, label: OP_LABEL[o], id: id, state: 'open' };
        return true;
      }
      const key = clean(p.id, 40);
      if (!key) { out = { ok: false, reason: 'no-id' }; return false; }
      const t0 = b.threads.filter(function (x) { return x && x.id === key; })[0];
      if (!t0) { out = { ok: false, reason: 'unknown-thread' }; return false; }
      if (o === 'advance_thread') {
        if (t0.state === 'resolved' || t0.state === 'abandoned') { out = { ok: false, reason: 'closed-thread' }; return false; }
        const step = clean(p.text, 120);
        if (!step) { out = { ok: false, reason: 'empty-step' }; return false; }
        t0.steps = (t0.steps || []).slice(-19).concat([step]);
        t0.state = 'advanced';
        t0.updatedAt = clockNow('dream');
        out = { ok: true, reason: 'ok', op: o, label: OP_LABEL[o], id: key, steps: t0.steps.length };
        return true;
      }
      if (o === 'resolve_thread') {
        if (t0.state === 'resolved') { out = { ok: false, reason: 'already-resolved' }; return false; }
        t0.state = 'resolved';
        t0.result = clean(p.result, 160);
        t0.updatedAt = clockNow('dream');
        out = { ok: true, reason: 'ok', op: o, label: OP_LABEL[o], id: key, result: t0.result };
        return true;
      }
      if (o === 'abandon_thread') {
        if (t0.state === 'abandoned') { out = { ok: false, reason: 'already-abandoned' }; return false; }
        t0.state = 'abandoned';
        t0.reason = clean(p.reason, 120);
        t0.updatedAt = clockNow('dream');
        out = { ok: true, reason: 'ok', op: o, label: OP_LABEL[o], id: key };
        return true;
      }
      if (o === 'upsert_deviation') {
        const did = clean(p.id, 40) || ('dv_' + (WA.rand && WA.rand.id ? WA.rand.id('', 6, 'id') : String(clockNow('dream'))));
        const text = clean(p.text, 200);
        if (!text) { out = { ok: false, reason: 'empty-deviation' }; return false; }
        const exist = b.deviations.filter(function (x) { return x && x.id === did; })[0];
        if (exist) { exist.text = text; exist.upserts = (exist.upserts || 1) + 1; exist.updatedAt = clockNow('dream'); out = { ok: true, reason: 'updated', op: o, label: OP_LABEL[o], id: did }; return true; }
        const cap = cfg.maxDeviations;
        const base = b.deviations.length + 1 > cap ? b.deviations.slice(b.deviations.length + 1 - cap) : b.deviations;
        const row = { id: did, text: text, thread: clean(p.thread, 40), upserts: 1, at: clockNow('dream'), updatedAt: clockNow('dream') };
        const _keptDd = base.concat([row]);
        // v2.231.0（OPT-2/OPT-4）：挤出器是**原地截断 + 返回报告**，不是「返回新数组」。
        //   把报告赋回数据槽 ⇒ 下一次进桶被 bucket() 重置为 [] ⇒ 整张表静默清空。
        if (WA.evict && WA.evict.array) WA.evict.array(_keptDd, 'dream.deviations');
        b.deviations = _keptDd;
        out = { ok: true, reason: 'ok', op: o, label: OP_LABEL[o], id: did };
        return true;
      }
      out = { ok: false, reason: 'bad-op' };
      return false;
    }, 'dream:weave');
    if (out && out.ok) {
      stat.ops++;
      if (o === 'open_thread') stat.threads++;
      if (o === 'resolve_thread') stat.resolved++;
      if (o === 'abandon_thread') stat.abandoned++;
      if (o === 'upsert_deviation') stat.deviations++;
    } else if (out && !out.ok) { stat.refused++; noteFault(out.reason); }
    return out || refuse('tx-failed');
  }
  function threadList(opts) {
    const o = opts || {};
    const st = clean(o.state, 20);
    const list = (st && THREAD_STATES.indexOf(st) >= 0) ? threads().filter(function (t) { return t && t.state === st; }) : threads();
    return { ok: true, reason: 'ok', count: list.length,
      open: threads().filter(function (t) { return t && (t.state === 'open' || t.state === 'advanced'); }).length,
      threads: list.slice(-16).map(function (t) { return { id: t.id, title: t.title, state: t.state, stateLabel: THREAD_STATE_LABEL[t.state], steps: (t.steps || []).length }; }) };
  }
  /** 梦卷归档：卷内只存摘要与线号。卷数到顶挤出最旧，体量按 KB 合计守顶。 */
  function archive(summary, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const sum = clean(summary, 400);
    if (!sum) return refuse('empty-summary');
    const b0 = bucket();
    const kb = Math.max(1, Math.ceil((sum.length + 64) / 1024));
    const totalKB = b0.volumes.reduce(function (n, v) { return n + (Number(v && v.kb) || 0); }, 0);
    if (totalKB + kb > cfg.maxVolumeKB * 1024) {
      let over = totalKB + kb - cfg.maxVolumeKB * 1024;
      let dropped = 0;
      while (over > 0 && bucket().volumes.length > 1) {
        const oldest = bucket().volumes[0];
        over -= Number(oldest && oldest.kb) || 0;
        dropped++;
        WA.store.transact(function (draft) { const b = bucketW(draft); b.volumes.shift(); return true; }, 'dream:archiveDrop');
      }
      stat.evicted += dropped;
      if (over > 0) return refuse('volume-overflow');
    }
    const openIds = threads().filter(function (t) { return t && (t.state === 'open' || t.state === 'advanced'); }).map(function (t) { return t.id; });
    const vol = { id: 'v_' + (WA.rand && WA.rand.id ? WA.rand.id('', 6, 'id') : String(clockNow('dream'))),
      summary: sum, kb: kb, threads: openIds.slice(0, 12), state: clean(o.state, 120), at: clockNow('dream') };
    let out = null;
    WA.store.transact(function (draft) {
      const b = bucketW(draft);
      const cap = cfg.maxVolumes;
      const base = b.volumes.length + 1 > cap ? b.volumes.slice(b.volumes.length + 1 - cap) : b.volumes;
      if (b.volumes.length + 1 > cap) stat.evicted += b.volumes.length + 1 - cap;
      const _keptDv = base.concat([vol]);
      // v2.231.0（OPT-2/OPT-4）：挤出器是**原地截断 + 返回报告**，不是「返回新数组」。
      //   把报告赋回数据槽 ⇒ 下一次进桶被 bucket() 重置为 [] ⇒ 整张表静默清空。
      if (WA.evict && WA.evict.array) WA.evict.array(_keptDv, 'dream.volumes');
      b.volumes = _keptDv;
      out = { ok: true, reason: 'ok', id: vol.id, kb: kb, volumes: b.volumes.length };
      return true;
    }, 'dream:archive');
    if (out && out.ok) stat.volumes++;
    return out || refuse('tx-failed');
  }
  function volumeList() {
    const vs = bucket().volumes;
    return { ok: true, reason: 'ok', count: vs.length,
      totalKB: vs.reduce(function (n, v) { return n + (Number(v && v.kb) || 0); }, 0),
      volumes: vs.slice(-12).map(function (v) { return { id: v.id, summary: v.summary, kb: v.kb, at: v.at }; }) };
  }
  function volumeGet(id) {
    const k = clean(id, 40);
    const v = bucket().volumes.filter(function (x) { return x && x.id === k; })[0];
    if (!v) return { ok: false, reason: 'unknown-volume' };
    return { ok: true, reason: 'ok', volume: v };
  }
  function deviationList() {
    const ds = bucket().deviations;
    return { ok: true, reason: 'ok', count: ds.length, deviations: ds.slice(-16).map(function (d) { return { id: d.id, text: d.text, thread: d.thread, upserts: d.upserts }; }) };
  }
  function view() {
    const cfg = settings();
    const b = bucket();
    return { enabled: cfg.enabled, state: b.state, mood: b.mood,
      transitions: b.transitions.length, threads: b.threads.length, deviations: b.deviations.length, volumes: b.volumes.length,
      limits: { maxThreads: cfg.maxThreads, maxDeviations: cfg.maxDeviations, maxVolumes: cfg.maxVolumes, maxVolumeKB: cfg.maxVolumeKB },
      ops: OPS.slice() };
  }
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const b = bucket();
    const lines = [];
    if (b.state) lines.push('· 梦态：' + b.state + (b.mood ? '（' + b.mood + '）' : ''));
    const open = b.threads.filter(function (t) { return t && (t.state === 'open' || t.state === 'advanced'); });
    if (open.length) lines.push('· 未结之线：' + open.slice(-8).map(function (t) { return t.title || t.id; }).join('、'));
    if (b.deviations.length) lines.push('· 已录偏离：' + b.deviations.slice(-4).map(function (d) { return d.text; }).join('；'));
    lines.push('· 梦卷：' + b.volumes.length + ' 卷（封存账，不逐字复述）');
    return ['【长梦】'].concat(lines).join('\n');
  }
  function reset() {
    stat.ops = 0; stat.threads = 0; stat.resolved = 0; stat.abandoned = 0; stat.deviations = 0;
    stat.volumes = 0; stat.evicted = 0; stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }
  WA.dream = {
    getSettings: settings, setSettings: saveSettings, view: view,
    weave: weave, onset: onset, threadOf: threadOf, threadList: threadList,
    archive: archive, volumeList: volumeList, volumeGet: volumeGet, deviationList: deviationList,
    buildBlock: buildBlock, stat: function () { return JSON.parse(JSON.stringify(stat)); }, reset: reset,
    OPS: OPS, OP_LABEL: OP_LABEL, THREAD_STATES: THREAD_STATES, THREAD_STATE_LABEL: THREAD_STATE_LABEL,
    MOODS: MOODS, MAX_VOLUME_KB: DEF.maxVolumeKB, MAX_VOLUMES: DEF.maxVolumes,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/dream.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'dream 已加载（2.230.0）');
})();
