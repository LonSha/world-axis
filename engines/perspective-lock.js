/**
 * WorldAxis engines/perspective-lock.js (v2.142.0) — 视角锁（叙事视角闸门）
 *
 * ── 它治什么（缺口）────────────────────────────────────────────
 *   noesis（v2.140.0 / v2.141.0）把「这个角色此刻该不该知道这件事」从模型即兴
 *   变成了引擎判据，但它管的是**知情面**。正文里还有第二种穿帮，与知情面无关 ——
 *   一个**完全知道**的角色，被写成了它此刻不可能出现的样子：
 *     · 叙述者钻进了不在这场景里的人的脑子里（「远处那头的乙心里一沉」）；
 *     · 客观镜头视角下写出某人的内心独白；
 *     · 第一人称视角下交代视角人物看不见、听不到的角落；
 *     · 把「他没想过、也没人跟他说过的事」写成他的内心话（内心腔顶着推断档说话）。
 *   这些不是「谁知道什么」的问题，是**叙述取舍**的问题。而全仓此前零设施：
 *   实测 `grep -rn "视角|perspective|POV|pov|lens"` 在 engines / render / ui / core
 *   下**零命中** —— 视角完全由模型每轮即兴决定。后果与全知同族：
 *   读者读到的不是一个有边界的叙述者，而是一台随时能钻进任何人脑子里的摄像机。
 *
 * ── 缝合来源（显式写明，不冒称原创）────────────────────────────
 *   「鲜活世界」条目集里的叙事纪律条目，加上本仓既有的两条同源口径：
 *     ① 与 noesis 的分工沿用它自己的边界 6（「事实真源不在本模块」）——
 *        本模块**不裁决谁知道什么**，只裁决「这一笔能不能由这个视角交代」；
 *     ② 与 canon.deviation / noesis.gateScene 同一条纪律 —— **只报不改**：
 *        写作决定归作者，引擎只回答「哪些笔此刻不被这个视角允许」。
 *   判不了的（「视角要稳」「不要跳戏」「保持文风一致」）留在预设里，不进引擎 ——
 *   与 style / enigma / lifeline 头部同一条口径：「提示词里成立的写不进引擎」。
 *
 * ── 三张具名表（本模块的**全部词表**，其余一律拒收）──────────────
 *   LENSES   视角模式五档：omniscient（作者全知）/ first（第一人称）/
 *            limited（贴身第三人称）/ ensemble（多视角群像）/ camera（客观镜头）；
 *   CHANNELS 叙事渠道五档：narrator（叙述）/ interior（内心）/ dialogue（对白）/
 *            document（文本件）/ flashback（回忆）；
 *   ACCESS   取证档四档：witnessed（亲历）/ perceived（在场感知）/
 *            inferred（推断）/ exterior（外部叙述者交代）。
 *   为什么必须成表：自造视角等于自造判定 —— 不成表的档位，下一手（面板、诊断、
 *   下一位作者）无法接手，「随口写一个视角名」正是本模块要治的那种失真；
 *   与 inst 的 PERMS（自造权限等于自造权力）、lifeline 的 KINDS 同一条纪律。
 *
 * ── 判据顺序（硬约束，与 noesis 的时点闸门先行同规）──────────────
 *   更**锋利**的归因先报，否则它会被更笼统的那条盖掉：
 *     缺字段 → 表外值 → 未登记视角 → 全知例外 → **内心闸** → 在不在视角里。
 *   内心闸排在「who ∉ 视角人物」之前，是因为「他不在这场景里」是笼统说法，
 *   而「这一笔是内心，而它不是视角人物的内心」是**准确**的那一句 ——
 *   两者处置不同（补一个共视角 vs 换渠道或删这一句），
 *   而把后者报成前者，作者会去加人，加完人这句仍然越界。
 *
 * ── 八条否定式边界（本模块存在的全部理由）────────────────────
 *   ① 总开关默认关闭。关闭时 assign / current / allows / audit / leakScan 一律拒收 disabled。
 *   ② **不写正文、不改正文、不改人物认知**：本文件只有一处 store.transact（assign）——
 *      零 `WA.store.patch`、零对人们认知容器的写入。leakScan 检出越界**只留痕不删文**：
 *      删文是叙事决定，不是引擎决定（与 noesis 边界 2 同规）。
 *   ③ **未登记视角不回落成全知**：没有视角行就答 `no-scene`。回落成全知 = 又给了
 *      一台无边界摄像机，那正是本模块要治的病（与 lifeline「查不到不许冒充健康」同规）。
 *   ④ **不重裁决知情面**：本模块**不调用** noesis.knows / world.canBeAt 之外的任何判定，
 *      也不碰 noesis 的账。知情边界与叙事取舍是两个真源，合成一个之后就再也答不出
 *      「是他不知道，还是这一笔不该由这个视角交代」。两个闸门**串联**、互不取代：
 *      noesis 答「他知道吗」，本模块答「这笔该不该现在由这个视角写」。
 *   ⑤ 四种拒绝**不可合并**：out-of-lens（他不在本视角）/ interior-blocked（渠道被封闭）/
 *      no-scene（视角没登记）/ bad-lens（视角名不成表）。处置各不相同：
 *      加共视角 / 换渠道或删句 / 先登记视角 / 改词表 —— 合并成一个「不许写」，
 *      作者就再也知道该动哪一处。
 *   ⑥ **内心是唯一被闸死的渠道**：narrator / dialogue / document / flashback 都能靠
 *      「有人看得见、有人听得到」放行，只有 interior 不行 —— 除 omniscient 外，
 *      内心只属于视角人物本人（**这条在任何档位下都不放宽**，`strictInterior` 只放宽
 *      「客观镜头」与「取证档」两道细则），且取证档只收 witnessed / perceived：
 *      不许 inferred / exterior 顶着内心腔说话 —— 那是「把他没想过的事写成他的心声」。
 *   ⑦ 视角历史有界（slice(-8)）、场景行有界（maxScenes）、单场视角人物有界（MAX_POV）：
 *      视角账只增不减会让长局状态膨胀；而容量是**常量不做滑块**（两套容量治理会互相打架）。
 *   ⑧ 观测不得改变被观测对象：current / allows / audit / leakScan / boundary 是纯读
 *      （除 stat 计数），不落盘、不动世界状态、不触发挤出。
 *
 * ── 拒收/归因码（能复用则复用；缺对应说法才新开）──────────────────
 *   复用：disabled / missing-fields / bad-value / exists / rows-full / store-unavailable。
 *   新开（语义在既有词表无对应、塌进既有码会丢归因）：
 *     bad-lens         视角名不在 LENSES 五档里（自造视角等于自造判定）
 *     no-scene         该场景没有已登记的视角（**不回落成全知**）
 *     out-of-lens      此人不在本视角里（待补共视角，或换一个场景视角）
 *     interior-blocked 内心渠道被封闭（客观镜头 / 取证档非亲历感知 / 非视角人物）
 *     lens-leak        事后扫描检出的越界笔（留痕码，非拒收码）
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_perspective_settings_v1';
  const DEF = { enabled: false, maxScenes: 12, strictInterior: true, maxLeaks: 8, view: 'omniscient' };
  const __REG = { key: LS_KEY, def: DEF, module: 'perspective',
    bounds: { maxScenes: [2, 24], maxLeaks: [1, 32] } };

  // ── 三张具名表 ──────────────────────────────────────────────
  //   LENSES：视角模式。**顺序即「叙述者的可见范围」由宽到窄**（omniscient 最宽，
  //   camera 最窄）—— 面板与诊断按此序展示，判据不依赖顺序。
  const LENSES = ['omniscient', 'first', 'limited', 'ensemble', 'camera'];
  //   CHANNELS：叙事渠道。interior 是**唯一被闸死**的一条（见边界 6）。
  const CHANNELS = ['narrator', 'interior', 'dialogue', 'document', 'flashback'];
  //   ACCESS：取证档。这一笔是「怎么进正文的」——亲历 / 在场感知 / 推断 / 外部交代。
  const ACCESS = ['witnessed', 'perceived', 'inferred', 'exterior'];
  //   单场视角人物上限：常量，不做滑块（两套容量治理会互相打架，沿用本仓容量纪律）。
  const MAX_POV = 8;

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { assigns: 0, allows: 0, permits: 0, blocks: 0, audits: 0, scans: 0, leaks: 0,
    outOfLens: 0, interiorBlocked: 0, noScene: 0, lastReason: '', lastAt: 0, faults: {} };
  // v2.149.0（P3）：全局观测视角面。与此前的**叙事视角锁**（assign/verdict，管正文该怎么写）
  //   是两件事：这里是**面板该给谁看**（玩家视角 vs 全知上帝）。分开的理由：
  //     · 叙事视角是「这一笔能不能由这个视角交代」——写作决定；
  //     · 观测视角是「这一页该不该给玩家看」——呈现决定。
  //   合成一个「视角」会让「作者想这么写」与「玩家该看到这个吗」互相冒充。
  // VIEWS 成表（自造视角等于自造判定，与 LENSES 同规）。
  const VIEWS = ['omniscient', 'player'];
  const view = { current: null, switches: 0, lastAt: 0, filtered: 0, lastReason: '' };
  function viewNow() {
    const v = settings().view;
    return VIEWS.indexOf(v) >= 0 ? v : 'omniscient';
  }
  /** 切全局观测视角。返回旧值（面板据此重渲染），并留痕。 */
  function setView(next) {
    const to = String(next == null ? '' : next);
    if (VIEWS.indexOf(to) < 0) { noteFault('bad-value'); return { ok: false, reason: 'bad-value', field: 'view', allowed: VIEWS.slice() }; }
    const from = viewNow();
    if (from === to) return { ok: true, from: from, to: to, changed: false };
    saveSettings(Object.assign(settings(), { view: to }));
    view.switches++;
    view.lastAt = clockNow('perspective');
    view.lastReason = 'switched';
    return { ok: true, from: from, to: to, changed: true };
  }
  function getView() { return { view: viewNow(), switches: view.switches, lastAt: view.lastAt }; }
  /**
   * 观测面过滤：**在 DOM 层**就不渲染全知数据（不是 CSS 隐藏——CSS 隐藏的数据仍在 DOM 里可读）。
   *   判据：玩家视角下带 `data-omniscient` 标记的节点被摘除；全知视角下原样保留。
   *   为什么以属性为判据：面板的每个观测面各行自报「这一行是全知数据」，比在此维护一张
   *   页名清单更不易漏（漏一个页名 = 那一页在玩家视角下泄露全知数据）。
   * @returns {{ok:boolean, view:string, removed:number, kept:number}}
   */
  function applyView(root) {
    const cfg = settings();
    const v = viewNow();
    if (!cfg.enabled) return { ok: true, view: v, removed: 0, kept: 0, disabled: true };
    const doc = root || (typeof document !== 'undefined' ? document : null);
    if (!doc || !doc.querySelectorAll) return { ok: true, view: v, removed: 0, kept: 0, noDom: true };
    let omni = [];
    try { omni = Array.prototype.slice.call(doc.querySelectorAll('[data-omniscient]')); } catch (e) { omni = []; }
    if (v !== 'player') return { ok: true, view: v, removed: 0, kept: omni.length };
    let removed = 0;
    omni.forEach(function (el) {
      if (el && el.parentNode) { el.parentNode.removeChild(el); removed++; }
    });
    view.filtered += removed;
    view.lastReason = removed ? 'filtered' : view.lastReason;
    return { ok: true, view: v, removed: removed, kept: omni.length - removed };
  }
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocks++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard.text(v, max || 40); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().perspective; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  function rowOf(scene) { return rows().filter(function (r) { return r && r.scene === scene; })[0] || null; }
  /** 视角人物名单：去空、去重、有界。**不校验世界存在性** —— 视角是叙事选择，不是身份登记。 */
  function povList(list) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach(function (x) {
      const v = clean(x, 40);
      if (v && out.indexOf(v) < 0) out.push(v);
    });
    return out;
  }

  /**
   * 登记一处场景视角。**这是本模块唯一的写口** —— 视角只能被登记，不能被推断。
   *   同名重登记必须显式 `opts.replace`（不静默覆盖：覆盖之后没人答得出原来是哪一档）。
   *   除 camera（客观镜头）外，视角必须有至少一个视角人物 —— 没有叙述主体的视角
   *   就是「无主的摄像机」，那正是本模块要报出来的东西，不是要登记的。
   */
  function assign(scene, lens, persons, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const sc = clean(scene, 40), ln = clean(lens, 20);
    if (!sc || !ln) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (LENSES.indexOf(ln) < 0) {
      noteFault('bad-lens');
      return { ok: false, reason: 'bad-lens', allowed: LENSES.slice(),
        hint: '自造视角等于自造判定：视角名必须在 LENSES 五档里' };
    }
    const who = povList(persons);
    if (who.length > MAX_POV) {
      noteFault('bad-value');
      return { ok: false, reason: 'bad-value', field: 'persons', cap: MAX_POV };
    }
    if (!who.length && ln !== 'camera') {
      noteFault('missing-fields');
      return { ok: false, reason: 'missing-fields', field: 'persons',
        hint: '除 camera（客观镜头）外，视角必须有至少一个视角人物（无主摄像机不是视角）' };
    }
    const seen = rowOf(sc);
    if (seen && !o.replace) {
      noteFault('exists');
      return { ok: false, reason: 'exists', scene: sc, lens: seen.lens };
    }
    let out = null;
    const cfg = settings();
    const now = clockNow('perspective');
    WA.store.transact(function (draft) {
      draft.perspective = (draft.perspective && typeof draft.perspective === 'object') ? draft.perspective : { rows: [] };
      if (!Array.isArray(draft.perspective.rows)) draft.perspective.rows = [];
      let hit = draft.perspective.rows.filter(function (r) { return r && r.scene === sc; })[0];
      if (!hit) {
        if (draft.perspective.rows.length >= cfg.maxScenes) {
          out = { ok: false, reason: 'rows-full', cap: cfg.maxScenes }; return false;
        }
        hit = { scene: sc, lens: ln, persons: who.slice(),
          history: [{ lens: ln, persons: who.slice(), at: now }], at: now, updatedAt: now };
        draft.perspective.rows.push(hit);
      } else {
        hit.lens = ln; hit.persons = who.slice();
        hit.history = (Array.isArray(hit.history) ? hit.history : [])
          .concat([{ lens: ln, persons: who.slice(), at: now }]).slice(-8);
        hit.updatedAt = now;
        out = null;
      }
      WA.evict.array(draft.perspective.rows, 'perspective.rows');
      if (!out) out = { ok: true, scene: hit.scene, lens: hit.lens, persons: hit.persons.slice(), replaced: !!o.replace };
      return true;
    }, 'perspective:assign');
    if (out && out.ok) { stat.assigns++; stat.lastReason = 'assigned'; }
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 当前视角（只读）。给了 scene 取该场景；没给则取**最后登记的那一行**
   *   （「此刻在写哪一幕」的显式定义：最近登记的那一幕，不猜、不改）。
   *   一行都没有 ⇒ `no-scene`（**不回落成全知**，见边界 3）。
   */
  function current(scene) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const sc = clean(scene, 40);
    const list = rows();
    if (!list.length) { stat.noScene++; return { ok: false, reason: 'no-scene' }; }
    const hit = sc ? list.filter(function (r) { return r && r.scene === sc; })[0] : list[list.length - 1];
    if (!hit) { stat.noScene++; return { ok: false, reason: 'no-scene', scene: sc }; }
    stat.reads = (stat.reads || 0) + 1;
    return { ok: true, scene: hit.scene, lens: hit.lens, persons: (hit.persons || []).slice(),
      at: hit.at, updatedAt: hit.updatedAt, history: (hit.history || []).slice(-8) };
  }

  /** 内部：一笔的裁决（allows 与 audit 共用同一条判据，不写两份实现）。 */
  function verdict(entry) {
    const cfg = settings();
    const e = entry || {};
    const who = clean(e.who, 40), ch = clean(e.channel, 20), ac = clean(e.access, 20) || 'witnessed';
    if (!who || !ch) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (CHANNELS.indexOf(ch) < 0) {
      noteFault('bad-value');
      return { ok: false, reason: 'bad-value', field: 'channel', allowed: CHANNELS.slice() };
    }
    if (ACCESS.indexOf(ac) < 0) {
      noteFault('bad-value');
      return { ok: false, reason: 'bad-value', field: 'access', allowed: ACCESS.slice() };
    }
    const cur = current(clean(e.scene, 40));
    if (!cur.ok) {
      // current() 已在内部计过 no-scene / disabled，此处只透传，不重复拒收
      return { ok: false, reason: cur.reason || 'no-scene', scene: cur.scene };
    }
    if (LENSES.indexOf(cur.lens) < 0) { noteFault('bad-lens'); return { ok: false, reason: 'bad-lens', lens: cur.lens }; }
    // ── 全知例外：作者视角，任何笔都允许（**唯一的例外**，见边界 6）──
    if (cur.lens === 'omniscient') {
      return { ok: true, allowed: true, who: who, channel: ch, access: ac,
        lens: 'omniscient', reason: 'omniscient', scene: cur.scene };
    }
    const inLens = cur.persons.indexOf(who) >= 0;
    // ── 内心闸（先于「在不在视角里」，见文件头的判据顺序）──
    if (ch === 'interior') {
      if (!inLens) {
        stat.interiorBlocked++;
        noteFault('interior-blocked');
        return { ok: true, allowed: false, reason: 'interior-blocked', via: 'not-pov',
          who: who, channel: ch, access: ac, lens: cur.lens, scene: cur.scene,
          hint: '内心只属于视角人物本人（此条任何档位下都不放宽）' };
      }
      if (cfg.strictInterior !== false) {
        if (cur.lens === 'camera') {
          stat.interiorBlocked++;
          noteFault('interior-blocked');
          return { ok: true, allowed: false, reason: 'interior-blocked', via: 'objective',
            who: who, channel: ch, access: ac, lens: cur.lens, scene: cur.scene,
            hint: '客观镜头没有内心（真要写内心，先把视角换成 first / limited / omniscient）' };
        }
        if (ac !== 'witnessed' && ac !== 'perceived') {
          stat.interiorBlocked++;
          noteFault('interior-blocked');
          return { ok: true, allowed: false, reason: 'interior-blocked', via: 'access',
            who: who, channel: ch, access: ac, lens: cur.lens, scene: cur.scene,
            hint: '内心腔只收亲历与在场感知：不许用推断档与外部交代档冒充「他的心声」' };
        }
      }
    }
    if (!inLens && (cur.lens === 'first' || cur.lens === 'limited')) {
      stat.outOfLens++;
      noteFault('out-of-lens');
      return { ok: true, allowed: false, reason: 'out-of-lens',
        who: who, channel: ch, access: ac, lens: cur.lens, scene: cur.scene,
        pov: cur.persons.slice(), hint: '此人不在本视角里（补共视角，或换一个场景视角）' };
    }
    return { ok: true, allowed: true, who: who, channel: ch, access: ac, lens: cur.lens,
      reason: inLens ? 'in-lens' : 'co-pov', scene: cur.scene };
  }

  /**
   * 单笔裁决：这一笔能不能由当前视角交代。
   *   entry 形如 { who, channel, access?, scene? }。
   *   **不查知情面**（那是 noesis 的活，见边界 4）：本模块只回答叙事取舍。
   */
  function allows(entry) {
    stat.allows++;
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const r = verdict(entry);
    if (r.ok === true) {
      if (r.allowed) { stat.permits++; stat.lastReason = 'allowed'; }
      stat.lastAt = clockNow('perspective');
    }
    return r;
  }

  /**
   * 生成前闸门（批量）：一次问一排笔。返回 { ok, allow, blocked[], rows[], n }。
   *   与 noesis.gateScene 同形（口径一致：**只报不改正文**）。
   *   逐条走同一条 verdict —— 不写第二份判据（两份实现迟早会分家）。
   */
  function audit(entries) {
    stat.audits++;
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const list = Array.isArray(entries) ? entries : [];
    const rowOut = [], blocked = [];
    list.forEach(function (e) {
      const r = verdict(e);
      if (r.ok !== true) return;               // disabled / missing-fields / bad-value 已在 verdict 内留痕
      rowOut.push(r);
      if (!r.allowed) blocked.push({ who: r.who, channel: r.channel, access: r.access,
        reason: r.reason, via: r.via || null, lens: r.lens, scene: r.scene });
    });
    if (blocked.length) { stat.lastReason = blocked[0].reason; stat.lastAt = clockNow('perspective'); }
    return { ok: true, allow: blocked.length === 0, blocked: blocked, rows: rowOut,
      n: list.length, lens: (rowOut[0] || {}).lens || null };
  }

  /**
   * 事后扫描：在**已经写进正文**的笔里检出越界项（`written:true` 才核）。
   *   只留痕不删文（边界 2）—— 删文是叙事决定，不是引擎决定。
   */
  function leakScan(entries, opts) {
    stat.scans++;
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const list = Array.isArray(entries) ? entries : [];
    const found = [];
    list.forEach(function (c) {
      if (!c || c.written !== true) return;
      const r = verdict(c);
      if (r.ok === true && r.allowed === false) {
        found.push({ who: r.who, channel: r.channel, access: r.access,
          reason: r.reason, via: r.via || null, lens: r.lens, scene: r.scene });
      }
    });
    if (found.length) {
      stat.leaks += found.length;
      stat.lastReason = 'lens-leak';
      stat.lastAt = clockNow('perspective');
    }
    return { ok: true, leaks: found, count: found.length, scanned: list.length,
      truncated: found.length > settings().maxLeaks };
  }

  /**
   * 注入块（纪律 + 当前模式 + 留痕计数）。
   *   **不列视角人物名**：视角行里可能有作者预登记、尚未登场的角色 —— 列名就是剧透
   *   （与 noesis「不列秘密名」、lifeline「不列症状名」同一条纪律）。
   *   关闭时返回空串（零 token 占用）。
   */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled || !WA.store) return '';
    const cur = current();
    const NL = String.fromCharCode(10);
    const lines = [];
    lines.push('【视角锁】以下每条只陈述纪律，不带任何具体的人名与情节：');
    if (cur.ok) {
      lines.push('· 当前视角模式：' + cur.lens + '（在场视角人物 ' + cur.persons.length + ' 位）；本幕全部笔须落在这一模式的可见范围内。');
    } else {
      lines.push('· **本幕尚未登记视角**：叙事取舍无判据。请先登记本幕视角，不要默认按全知写。');
    }
    lines.push('· 除全知模式外，不得写不在此视角里的人的所见所想；客观镜头不得写任何人的内心；');
    lines.push('  内心腔只收亲历与在场感知 —— 不得把推断、以及叙述者替角色下的结论，写成他的心声。');
    if (stat.leaks > 0) lines.push('· 已留痕 ' + stat.leaks + ' 处疑似越界笔（细节见作者诊断面，不在此列名）。');
    return lines.join(NL);
  }

  /** 诊断面（只读）：引擎现场 + 四类拒绝分布。零副作用——不跑 verdict，不污染 stat。 */
  function boundary() {
    const cfg = settings();
    return {
      enabled: !!cfg.enabled, maxScenes: cfg.maxScenes,
      strictInterior: cfg.strictInterior !== false, maxLeaks: cfg.maxLeaks,
      LENSES: LENSES.slice(), CHANNELS: CHANNELS.slice(), ACCESS: ACCESS.slice(), MAX_POV: MAX_POV,
      assigns: stat.assigns, allows: stat.allows, permits: stat.permits, blocks: stat.blocks,
      audits: stat.audits, scans: stat.scans, leaks: stat.leaks,
      // 四类拒绝**分开报**（见边界 5）：合成一个「不许写」之后，作者就再也知道该动哪一处。
      outOfLens: stat.outOfLens || 0, interiorBlocked: stat.interiorBlocked || 0,
      noScene: stat.noScene || 0,
      rows: rows().length,
      lastReason: stat.lastReason, lastAt: stat.lastAt,
      faults: Object.assign({}, stat.faults),
      // v2.149.0（P3）：全局观测视角四字段。**必须挂在 boundary 上，不能只留在 stat()** ——
      //   诊断面（secPerspective）读的是 boundary()，不挂上去那一整段恒取默认值，
      //   而 `view: b.view || 'omniscient'` 会把「字段缺席」伪装成「默认档」：
      //   于是「谁把它切到了玩家视角」在诊断里永远看不见（这正是本版要治的那种静默）。
      view: viewNow(), viewSwitches: view.switches,
      viewFiltered: view.filtered, viewLastAt: view.lastAt
    };
  }

  WA.perspective = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    // 产品面七口：登记 / 当前 / 单笔裁决 / 批量闸门 / 事后扫描 / 注入块 / 诊断
    //   —— 每一口都有真消费方（面板「导演」页 / 注入链 perspective 源 / 诊断 secPerspective）。
    assign: assign, current: current, allows: allows, audit: audit, leakScan: leakScan,
    buildBlock: buildBlock, boundary: boundary,
    // v2.149.0（P3）：全局观测视角三口。真消费方三处（缺一不挂）：
    //   ① 面板顶部视角选择器（setView）与重渲染时的 DOM 过滤（applyView，玩家页真调）；
    //   ② 诊断 secPerspective 的 view 段（getView 的 switches 留痕）；
    //   ③ 面板重渲染钩子（每次 render 后 applyView 摘除 data-omniscient 节点）。
    VIEWS: VIEWS.slice(),
    setView: setView, getView: getView, applyView: applyView,
    stat: function () {
      return Object.assign({}, stat, { faults: Object.assign({}, stat.faults),
        enabled: settings().enabled, strictInterior: settings().strictInterior !== false,
        view: viewNow(), viewSwitches: view.switches, viewFiltered: view.filtered, viewLastAt: view.lastAt });
    }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/perspective-lock.js', { kind: 'engine', ver: '2.142.0' });
})();