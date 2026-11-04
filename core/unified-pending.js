/**
 * WorldAxis core/unified-pending.js (v2.296.0) — 全仓统一待办中心（V10 OPV10-7）
 * 
 * 【它治什么】
 *   待办（pending）散落在 12+ 个独立业务模块中：
 *   storyChoice / commission / investigation / aftermath / operations / farfield /
 *   collab / coop / backstage / communityNote / deferToken / commit 等。
 *   此前没有任何只读聚合出口，玩家无法在一屏内获知“当前世界有哪些未决事务需要我决策或确认”。
 * 
 * 【设计纪律】
 *   ① 只读：不写 store，不触碰任何写事务，零副作用；
 *   ② 惰性安全查询：模块未加载或 disabled 时静默归零或标明 disabled，不崩溃；
 *   ③ 结构化输出：统一为 { id, module, kind, title, summary, actionKey, urgency } 格式；
 *   ④ 下钻支持：每条待办提供 module 与 targetPage，供 UI 一键跳转。
 *
 * 【v2.297.0（V11 立项轮）修正：别名形态】
 *   本文件初版把 WA 取成「`window.WorldAxis` 存在就用，否则回退 `global.WA`」——
 *   与全仓其余 300+ 模块的 `const WA = window.WorldAxis = window.WorldAxis || {};`
 *   **不是同一形态**。两个真实后果，都在 `tests/module-cycle-gate.js` 当场现形：
 *     ① 静态别名扫描（ALIAS_RE 只认上面那一种形态）识别不出本文件的 WA 别名 ⇒
 *        `unreflected` 报 `core/unified-pending.js → core/store.js (registerModule)`
 *        （静态扫不到这条装载期边，扫描器对它是瞎的）；
 *     ② `WA.unifiedPending = {...}` 也因此没进 `nsOwner` ⇒ 账本里有、静态提供方没有，
 *        `nsFaceDrift` 报 `unifiedPending: ledger-only`。
 *   还有一条静态扫描看不出来、但更严重的**顺序依赖**：旧写法在 `window.WorldAxis`
 *   尚不存在时回退到 `global.WA`（Node 下通常是 undefined）⇒ 拿到的是一份**游离空对象**，
 *   于是 `WA.unifiedPending = {...}` 写进了那份空对象，产品面静默拿不到聚合器。
 *   改成全仓统一形态后，三处读数同时归一。
 */
(function () {
  'use strict';

  const WA = window.WorldAxis = window.WorldAxis || {};

  /**
   * 待办收集聚合器
   */
  // ── v2.298.0（V11 OPV11-7）：三态可分辨的探针 ──────────────────────────
  //   立项实测缺陷：`collect()` 在空世界返回 `total=0 / highCount=0 / items=0`，
  //   而三件完全不同的事在读数上完全同形：
  //     ① 世界确实没事可做（empty：模块都在、都正常、只是没产出）
  //     ② 聚合器没接上模块（skipped：`WA.<mod>` 不存在或没有 pending 口）
  //     ③ 接了模块但调用报错（fault：`pending()` 抛异常，被 `catch (e) {}` 吃掉）
  //   修前七个分支全是 `catch (e) {}` —— 异常**静默消失**，读面永远看到「没事」。
  //   这正是 V11 要治的病：不是「有没有数据」，而是「读不出来时读面知不知道」。
  //
  //   口径（三态边界，写死在判据里）：
  //     · faults 非空 ⇒ state='fault'（有模块坏了，即使同时有产出也要报）
  //     · faults 为空且 list 非空 ⇒ state='ok'
  //     · faults 为空且 list 为空 ⇒ state='empty'
  //   `hands` / `skipped` / `faults` **无论什么态都全量给出** —— 不允许只在非 ok
  //   时才给（那样读面又得先判断态才能读细节，等于把同形问题挪了一层）。
  const PROBES = [
    { mod: 'storyChoice', need: 'pending' },
    { mod: 'commission', need: 'pending' },
    { mod: 'investigation', need: 'pending' },
    { mod: 'aftermath', need: 'pending' },
    { mod: 'operations', need: 'pending' },
    { mod: 'farfield', need: 'pending' },
    { mod: 'diplomacy', need: 'stat+view' }
  ];
  function collectPending() {
    const list = [];
    const now = (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('unifiedPending') : Date.now();
    // hands：真的接上并调用了的模块数；skipped：模块缺席/无入口（带原因）；
    //   faults：接上了但抛异常的模块（带原始错误文本，可定位，不是一句「失败了」）。
    const hands = [];
    const skipped = [];
    const faults = [];
    const notSkipped = function (mod, need) {
      // 判定「该模块是否可用」；不可用时**必须**给出原因，不许静默略过
      const m = WA[mod];
      if (!m) {
        skipped.push({ module: mod, reason: 'absent', detail: 'WA.' + mod + ' 不存在' });
        return false;
      }
      const parts = need.split('+');
      const missing = parts.filter(function (f) { return typeof m[f] !== 'function'; });
      if (missing.length) {
        skipped.push({ module: mod, reason: 'no-entry', detail: '缺 ' + missing.map(function (f) { return f + '()'; }).join('/') });
        return false;
      }
      return true;
    };
    const markHandled = function (mod) { hands.push(mod); };
    const markFault = function (mod, e) {
      faults.push({ module: mod, msg: String((e && (e.message || e)) || 'unknown') });
    };

    // 1. storyChoice (故事分支抉择)
    try {
      if (notSkipped('storyChoice', 'pending')) {
        markHandled('storyChoice');
        const sc = WA.storyChoice.pending();
        if (sc && sc.ok && Array.isArray(sc.points)) {
          sc.points.forEach(function (pt) {
            list.push({
              id: 'sc:' + (pt.id || pt.choiceId || 'unknown'),
              module: 'storyChoice',
              targetPage: 'storyChoice',
              kind: 'choice',
              title: pt.title || '故事分支抉择',
              summary: pt.prompt || pt.desc || '等待选择故事走向',
              urgency: 'high',
              data: pt
            });
          });
        }
      }
    } catch (e) { markFault('storyChoice', e); }

    // 2. commission (委托任务)
    try {
      if (notSkipped('commission', 'pending')) {
        markHandled('commission');
        const cm = WA.commission.pending();
        if (cm && cm.ok && Array.isArray(cm.items)) {
          cm.items.forEach(function (it) {
            list.push({
              id: 'cm:' + (it.id || 'unknown'),
              module: 'commission',
              targetPage: 'commission',
              kind: 'contract',
              title: it.title || '委托履约待验',
              summary: it.desc || '等待交付或验收',
              urgency: 'medium',
              data: it
            });
          });
        }
      }
    } catch (e) { markFault('commission', e); }

    // 3. investigation (线索调查)
    try {
      if (notSkipped('investigation', 'pending')) {
        markHandled('investigation');
        const iv = WA.investigation.pending();
        if (iv && iv.ok && Array.isArray(iv.items)) {
          iv.items.forEach(function (it) {
            list.push({
              id: 'iv:' + (it.id || 'unknown'),
              module: 'investigation',
              targetPage: 'investigation',
              kind: 'investigation',
              title: it.title || '线索调查定案',
              summary: it.clue || '等待定案裁决',
              urgency: 'medium',
              data: it
            });
          });
        }
      }
    } catch (e) { markFault('investigation', e); }

    // 4. aftermath (地点后果与修复)
    try {
      if (notSkipped('aftermath', 'pending')) {
        markHandled('aftermath');
        const af = WA.aftermath.pending();
        if (af && af.ok && Array.isArray(af.items)) {
          af.items.forEach(function (it) {
            list.push({
              id: 'af:' + (it.id || 'unknown'),
              module: 'aftermath',
              targetPage: 'aftermath',
              kind: 'remediation',
              title: it.placeName ? (it.placeName + ' 后果处置') : '地点后果处理',
              summary: it.effect || '等待复访或修复',
              urgency: 'low',
              data: it
            });
          });
        }
      }
    } catch (e) { markFault('aftermath', e); }

    // 5. operations (运营结算)
    try {
      if (notSkipped('operations', 'pending')) {
        markHandled('operations');
        const op = WA.operations.pending();
        if (op && op.ok && Array.isArray(op.items)) {
          op.items.forEach(function (it) {
            list.push({
              id: 'op:' + (it.id || 'unknown'),
              module: 'operations',
              targetPage: 'operations',
              kind: 'project',
              title: it.name || '运营项目待批',
              summary: it.stage || '等待阶段推进或审批',
              urgency: 'medium',
              data: it
            });
          });
        }
      }
    } catch (e) { markFault('operations', e); }

    // 6. farfield (远方脉搏在途)
    try {
      if (notSkipped('farfield', 'pending')) {
        markHandled('farfield');
        const ff = WA.farfield.pending();
        if (ff && ff.ok && Array.isArray(ff.rows)) {
          ff.rows.forEach(function (it) {
            list.push({
              id: 'ff:' + (it.id || 'unknown'),
              module: 'farfield',
              targetPage: 'farfield',
              kind: 'farfield',
              title: '远方在途传闻: ' + (it.place || '未知'),
              summary: it.headline || it.summary || '在途消息等待传播抵达',
              urgency: 'low',
              data: it
            });
          });
        }
      }
    } catch (e) { markFault('farfield', e); }

    // 7. diplomacy (外交提案待答)
    try {
      if (notSkipped('diplomacy', 'stat+view')) {
        markHandled('diplomacy');
        const dp = WA.diplomacy.stat();
        if (dp && dp.live && dp.live.open > 0 && typeof WA.diplomacy.view === 'function') {
          const v = WA.diplomacy.view();
          if (v && Array.isArray(v.proposals)) {
            v.proposals.filter(function (p) { return p.stage === 'proposed' || p.stage === 'countered'; }).forEach(function (p) {
              list.push({
                id: 'dp:' + p.id,
                module: 'diplomacy',
                targetPage: 'world',
                kind: 'treaty',
                title: '外交提案待答：' + (p.from || '某方') + ' → ' + (p.to || '某方'),
                summary: '条款: ' + (p.terms || []).map(function(t){ return t.label; }).join(', '),
                urgency: 'high',
                data: p
              });
            });
          }
        }
      }
    } catch (e) { markFault('diplomacy', e); }

    // 三态：fault 优先（有模块坏了就必须报，哪怕同时有正常产出）> ok > empty。
    //   为什么 fault 优先：若因为别的模块正好有产出就报 'ok'，那个坏掉的模块
    //   会永远沉默下去 —— 这正是修前 `catch (e) {}` 的静默在换了一层皮之后重现。
    const state = faults.length ? 'fault' : (list.length ? 'ok' : 'empty');
    return {
      at: now,
      // v2.298.0（V11 OPV11-7）：三态 + 三张名单 —— **无论什么态都全量给出**。
      //   不许只在非 ok 时才给细节：那样读面得先判态才能读，等于把同形问题挪了一层。
      state: state,
      hands: hands.slice(),
      skipped: skipped.slice(),
      faults: faults.slice(),
      total: list.length,
      highCount: list.filter(function (x) { return x.urgency === 'high'; }).length,
      items: list
    };
  }

  /**
   * 诊断面（只读）
   */
  function diagnose() {
    // v2.298.0（V11 OPV11-7）：诊断面与 collect 同源（同一个 collectPending 调用链，
    //   不另起一套计数）。三态与三张名单**逐字透传**，`summary` 按态给出不同的句子 ——
    //   修前不论什么处境都只说「共登记 0 项」，那句话在 empty / skipped / fault 三种
    //   情况下都一样，等于告诉读面「没事」而把真相吞掉。
    const report = collectPending();
    const st = report.state;
    const sk = report.skipped.map(function (x) { return x.module; });
    const fl = report.faults.map(function (x) { return x.module; });
    const summary = st === 'empty'
      ? ('世界没有待办可做：' + report.hands.length + ' 个模块都在且正常读回，只是都没产出'
        + (sk.length ? '；另有 ' + sk.length + ' 个模块没接上（' + sk.join('、') + '）' : ''))
      : (st === 'fault'
        ? ('待办读取有故障：' + fl.length + ' 个模块报错（' + fl.join('、') + '），其余 ' + report.hands.length
          + ' 个正常，共登记 ' + report.total + ' 项。这不是「世界没事」，是读面坏了。')
        : ('待办中心共登记 ' + report.total + ' 项（高优先级 ' + report.highCount + ' 项）'
          + (sk.length ? '；' + sk.length + ' 个模块没接上（' + sk.join('、') + '）' : '')));
    return {
      ok: true,
      state: st,
      hands: report.hands.slice(),
      skipped: report.skipped.slice(),
      faults: report.faults.slice(),
      pendingCount: report.total,
      highUrgency: report.highCount,
      summary: summary
    };
  }

  WA.unifiedPending = {
    collect: collectPending,
    pending: collectPending,
    diagnose: diagnose,
    stat: function () {
      // 三态一并透出：只报 total/high 会让「没接上」与「真没事」在 stat 面再次同形。
      const r = collectPending();
      return { total: r.total, high: r.highCount, at: r.at, state: r.state,
        hands: r.hands.length, skipped: r.skipped.length, faults: r.faults.length };
    }
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('core/unified-pending.js', { kind: 'core', ver: '2.298.0' });
  }
})();
