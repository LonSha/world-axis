/**
 * WorldAxis engines/horizon.js (v0.5)
 * 远方/近端随机事件引擎
 * 缝合来源：DlSNlGHT World —— world-engine-evolution.js 远方/近端事件完整机制
 *
 * 机制规格（源自深读笔记）：
 *  - 每轮各掷一次：远方(distant) / 近端(near)
 *  - Ledger计数阈值：累计未触发轮数 ≥ LEDGER_THRESHOLD(10) 时强制触发并重置
 *  - cooldown：触发后冷却 COOLDOWN(5) 轮，期间不再掷骰
 *  - pending重试：已生成但未被backstage采纳的结果挂起，下轮重试（最多RETRY_MAX次后丢弃）
 *  - 临时标记 _distantGenerated/_nearGenerated：仅本轮有效，写入正式状态前剥离
 *  - 类型分配：50% event（具体事件）/ 50% wind（风声传闻）
 */
(function () {
  const WA = (window.WorldAxis = window.WorldAxis || {});
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  /** v2.36.0: 轮次读口——唯一真源 WA.evolution.roundOf（未加载时兜底 evolution.round）。 */
  function roundOfSafe(state) {
    try { if (WA.evolution && typeof WA.evolution.roundOf === 'function') return WA.evolution.roundOf(state); } catch (e) {}
    try { const s = state || WA.store.get(); if (s && s.evolution && typeof s.evolution.round === 'number') return s.evolution.round; } catch (e) {}
    return 0;
  }
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  // v2.3.0 块3: 以下四项此前是**模块常量**——用户完全不可配（随机事件关不掉、
  //   触发率改不了、冷却与保底轮数均无法调整）。现降级为「默认值」语义，
  //   真实生效值由 worldaxis_horizon_settings_v1 提供，默认与常量一致（行为不变）。
  const LEDGER_THRESHOLD = 10;   // 默认：未触发累计轮数阈值，达到则强制触发
  const COOLDOWN_ROUNDS  = 5;    // 默认：触发后的冷却轮数
  const RETRY_MAX        = 3;    // pending 结果最大重试轮数，超过丢弃
  const BASE_CHANCE      = 0.18; // 默认：每轮自然触发基础概率（Ledger未达阈值时）

  // ── v2.3.0 块3: 设置键（此前是常量，无任何配置入口）──
  const LS_KEY = 'worldaxis_horizon_settings_v1';
  const MIN_CHANCE_PCT = 1, MAX_CHANCE_PCT = 100;
  const MIN_COOLDOWN   = 0, MAX_COOLDOWN   = 20;
  const MIN_LEDGER     = 3, MAX_LEDGER     = 30;
  const __REG = { key: LS_KEY, def: {
    distantEnabled: true, distantChance: Math.round(BASE_CHANCE * 100), distantCooldown: COOLDOWN_ROUNDS, distantLedger: LEDGER_THRESHOLD,
    nearEnabled:    true, nearChance:    Math.round(BASE_CHANCE * 100), nearCooldown:    COOLDOWN_ROUNDS, nearLedger:    LEDGER_THRESHOLD
  },
  // v2.7.0（收口）: 区间声明上收到登记表——写路径（`normalize`）与 UI（`bounds()`）取同一份。
  //   键名用 **def 子键名**（distantChance 而非 UI 的 chancePct）：归一是按键名逐字段作用的，
  //   声明若不与 def 对齐就永远匹配不上（这正是「两套口径」的典型来源）。
  bounds: {
    distantChance: [MIN_CHANCE_PCT, MAX_CHANCE_PCT], distantCooldown: [MIN_COOLDOWN, MAX_COOLDOWN], distantLedger: [MIN_LEDGER, MAX_LEDGER],
    nearChance:    [MIN_CHANCE_PCT, MAX_CHANCE_PCT], nearCooldown:    [MIN_COOLDOWN, MAX_COOLDOWN], nearLedger:    [MIN_LEDGER, MAX_LEDGER]
  }, module: 'horizon' };
  function loadSettings() { return WA.settingsBus.read(__REG); }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  // v2.6.0: 走 saveOrThrow 以便回传失败原因（save() 的布尔不足以说明「为什么没落盘」）
  function saveSettings(s) { return WA.settingsBus.saveOrThrow(__REG, s); }

  /** 区间夹取：历史存档/手改值越界（如概率写成 500）会让判定永久为真——读入即夹取 */
  /** 区间夹取（读路径用）：委托 settingsBus.clampNum —— v2.7.0 起本库只有一份数学实现。
   *   （与 regional 的同名函数、设置页的 min/max 此前是「同一条规则的三份拷贝」。） */
  function clampInt(v, def, min, max) { return WA.settingsBus.clampNum(v, def, min, max); }
  /**
   * 概率归一（v2.7.0 收窄）——**只做区间夹取，不再把 ≤1 的正数解释为小数比率**。
   *
   * 为什么收窄（本版实测的歧义）：旧判据是 `n > 0 && n <= 1 → ×100`，而概率区间下限恰好是
   *   **1**，于是语义在边界上塌陷：填 `1` 得 100%（拉满），填 `0.5` 得 50%——两个相邻输入
   *   相差 50 倍，且用户无从预期。本版「写入即归一」把这个歧义摆到了写路径上：落盘前就要
   *   归一，若沿用旧判据，**用户填 1% 会被静默存成 100%**（随机事件触发率被拉满）。
   *
   * 收窄是否安全（判定依据，非估计）：本插件写入的概率值**从来都是百分比**——
   *   登记 def 是 `distantChance: 18`，设置页滑块 `min=1 max=100`；仓库内所有落盘值
   *   均为 1..100 的整数。小数比率写法只可能来自手改 localStorage，而它现在会得到
   *   与「百分比」一致的解释（0.5 → 夹取到 1 = 1%），不再有第二种读法。
   *   代价是明确的：手写的 0.5 不再等于 50%。这是**有意收窄**，用一条断言钉住
   *   （见 v2.7.0 块：'小数写法不再被解释为分数'），以免日后有人「宽容地」把 ×100 加回来。
   */
  function normChancePct(v, defPct) {
    // v2.7.0（收口）: 判据收敛到 settingsBus.clampNum 单一实现——此处只保留「概率」这个
    //   语义名字与上面的收窄说明。两份 parseFloat+round+夹取 从来不是「同一个规则写两遍」，
    //   而是两个会各自漂移的口径（本仓库已有多次同型实证）。
    return WA.settingsBus.clampNum(v, defPct, MIN_CHANCE_PCT, MAX_CHANCE_PCT);
  }
  /** 单泳道生效配置（已夹取）。kind: 'distant'|'near' */
  function laneCfg(kind, cfg) {
    const c = cfg || loadSettings();
    const d = __REG.def;
    const isD = kind === 'distant';
    return {
      kind: kind,
      // 经 settingsBus.toBool 归一化：字符串 'false' 必须真的表示关闭
      //   （此前 `!== false` 把 'false' 判成开启 = 关闭意图静默失效）
      enabled:   WA.settingsBus.toBool(isD ? c.distantEnabled : c.nearEnabled, isD ? d.distantEnabled : d.nearEnabled),
      chancePct: normChancePct(isD ? c.distantChance : c.nearChance, isD ? d.distantChance : d.nearChance),
      cooldown:  clampInt(isD ? c.distantCooldown : c.nearCooldown, isD ? d.distantCooldown : d.nearCooldown, MIN_COOLDOWN, MAX_COOLDOWN),
      ledger:    clampInt(isD ? c.distantLedger : c.nearLedger, isD ? d.distantLedger : d.nearLedger, MIN_LEDGER, MAX_LEDGER)
    };
  }
  /** 掷骰留痕（面板/诊断消费）：关闭通道导致「什么都没发生」与「掷了没中」必须可区分 */
  const __hzStat = { rolls: 0, distantFired: 0, nearFired: 0, skipped: 0, lastReason: '', lastAt: 0 };
  // v1.3.0: chronicle 容量同源化——此前 3 处内联 cap=80 与登记表/backstage 的 200 冲突，
  // horizon 入账一次即把满载 200 条纪事砍到 80（静默丢失 120 条，且按位置丢最旧的带溯源条目）。
  const CHRONICLE_CAP = 200;     // v2.13.0: 仅作降级兜底；真源为 core/evict.js 站点表 backstage.chronicle

  // ── 工具 ──────────────────────────────────────────────
  // v2.14.0: 决策流（远景通道是否开火）——此前裸调 Math.random，同种子无法复现「本轮开没开火」。
  function roll01() { return WA.rand.next('horizon.roll'); }

  function defaultLane() {
    return {
      ledger: 0,        // 距上次触发的累计轮数
      cooldown: 0,      // 剩余冷却轮数
      pending: null,    // { result, retries } 待重试的生成结果
      lastFired: 0      // 上次触发的轮次（记录用）
    };
  }

  function ensureState() {
    const st = WA.store.get();
    if (!st.evolution) st.evolution = {};
    if (!st.evolution.horizon) {
      // v0.1.33: 事务化创建（原先直改 live store + 裸 save）
      WA.store.transact(d => {
        if (!d.evolution) d.evolution = {};
        if (!d.evolution.horizon) d.evolution.horizon = { distant: defaultLane(), near: defaultLane() };
      });
      return WA.store.get();
    }
    return st;
  }

  // ── 单条泳道掷骰 ───────────────────────────────────────
  /**
   * @param {'distant'|'near'} kind
   * @returns {{ fired:boolean, forced:boolean, type?:'event'|'wind', reason:string }}
   */
  function rollLane(kind, opts) {
    const o = opts || {};
    const cf = laneCfg(kind, o.cfg);
    __hzStat.rolls++;
    __hzStat.lastAt = clockWall();
    // v2.3.0 块3: 通道关闭时**完全不掷骰**——此前用户无法拒绝随机事件，
    //   即便把触发率调到 0，ledger 保底仍会在第 10 轮强制触发（关不掉）。
    if (!cf.enabled && o.force !== true) {
      __hzStat.skipped++;
      __hzStat.lastReason = kind + ':disabled';
      return { fired: false, forced: false, skipped: true, reason: 'disabled' };
    }
    // v0.1.33: 整体单事务——掷骰各分支只改 draft，由 transact 统一落盘
    // （原先「直改 live store + 裸 save」绕过事务计量与批作用域，批内会提前打破写合并）
    let out = null;
    WA.store.transact(d => {
      const lane = d.evolution.horizon[kind];
      // v2.36.0: 轮次单一真源（此前 `meta.round` 全库零写入方 ⇒ 纪事轮次恒 0）
      const round = roundOfSafe(d);
      if (lane.cooldown > 0) {
        lane.cooldown--;
        out = { fired: false, forced: false, reason: `cooldown(${lane.cooldown + 1}→${lane.cooldown})` };
        return;
      }
      if (lane.pending) {
        if (lane.pending.retries >= RETRY_MAX) {
          lane.pending = null;
          out = { fired: false, forced: false, reason: 'pending_dropped' };
          return;
        }
        lane.pending.retries++;
        out = {
          fired: true, forced: true,
          type: lane.pending.result && lane.pending.result.type || 'event',
          reason: `pending_retry(${lane.pending.retries}/${RETRY_MAX})`
        };
        return;
      }
      lane.ledger++;
      const forced = lane.ledger >= cf.ledger;
      const fired  = forced || roll01() < (cf.chancePct / 100);
      if (fired) {
        lane.ledger     = 0;
        lane.cooldown   = cf.cooldown;
        lane.lastFired  = round;
        const type = roll01() < 0.5 ? 'event' : 'wind';
        lane.pending = { result: { type, kind }, retries: 0 };
        out = { fired: true, forced, type, reason: forced ? `ledger>=${cf.ledger}` : `chance(${cf.chancePct}%)` };
        return;
      }
      out = { fired: false, forced: false, reason: `ledger=${lane.ledger}` };
    });
    if (out) {
      if (out.fired) { if (kind === 'distant') __hzStat.distantFired++; else __hzStat.nearFired++; }
      __hzStat.lastReason = kind + ':' + out.reason;
    }
    return out;
  }

  // ── backstage结果入账 ─────────────────────────────────
  /**
   * backstage返回结果后调用：
   *  - 成功：清除pending，剥离临时标记，正式写入
   *  - 失败（空/格式错）：pending保留待重试
   * @param {'distant'|'near'} kind
   * @param {object|null} result  backstage返回的单对象，null/{}视为失败
   */
  function acceptResult(kind, result) {
    // 校验：必须是单对象且含核心字段
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      WA.log('info', `horizon[${kind}] 结果无效，保留pending重试`);
      return false;
    }
    const hasCore = kind === 'distant'
      ? (result.title || (result.type === 'wind' && result.content))
      : (result.description || result.title);

    if (!hasCore) {
      WA.log('info', `horizon[${kind}] 结果缺核心字段，保留pending重试`);
      return false;
    }

    // 剥离临时标记
    delete result._distantGenerated;
    delete result._nearGenerated;
    delete result._generated;
    delete result._temp;

    // 清除pending（重新get确保引用新鲜）
    // v0.1.33: 事务化清除 pending（原先直改 live store，靠后续分支的 transact 兜底持久化）
    WA.store.transact(d => { const lane = d.evolution && d.evolution.horizon && d.evolution.horizon[kind]; if (lane) lane.pending = null; });

    // 写入正式状态
    if (kind === 'distant') {
      if (result.type === 'wind') {
        // 风声走evolution的addWind
        if (WA.evolution && WA.evolution.addWind) {
          WA.evolution.addWind({
            topic:   result.topic || result.title || '远方传闻',
            content: String(result.content || result.title || '').slice(0, 50),
            level:   Math.min(5, Math.max(1, parseInt(result.level) || 2)),
            source:  'horizon_distant'
          });
        } else {
            // v0.1.33: evolution 模块缺失时的兜底入账（原先此分支无任何写路径）
            WA.store.transact(tx => {
              tx.chronicle = tx.chronicle || [];
              tx.chronicle.push({ kind: 'horizon_distant', title: String(result.topic || result.title || '').slice(0, 30), desc: String(result.content || '').slice(0, 50), at: clockNow('horizon'), round: roundOfSafe(tx), horizon: true });
              // v2.13.0: 第二写入方同样走单一出口（同一容器 = 同一站点 backstage.chronicle）。
          if (WA.evict) WA.evict.array(tx.chronicle, 'backstage.chronicle');
          else if (tx.chronicle.length > CHRONICLE_CAP) tx.chronicle = tx.chronicle.slice(-CHRONICLE_CAP);
            });
          }
      } else {
        // 事件入chronicle
        WA.store.transact(tx => {
          tx.chronicle = tx.chronicle || [];
          tx.chronicle.push({
            kind:  'horizon_distant',
            title: String(result.title || '').slice(0, 30),
            desc:  String(result.desc || result.description || '').slice(0, 50),
            at:    clockNow('horizon'),
            round: roundOfSafe(tx),
            horizon: true
          });
          // v2.13.0: 第二写入方同样走单一出口（同一容器 = 同一站点 backstage.chronicle）。
          if (WA.evict) WA.evict.array(tx.chronicle, 'backstage.chronicle');
          else if (tx.chronicle.length > CHRONICLE_CAP) tx.chronicle = tx.chronicle.slice(-CHRONICLE_CAP);
        });
      }
    } else {
      // near：近端事件，注入nextTurnInjection提示
      WA.store.transact(tx => {
        tx.nextTurnInjection = tx.nextTurnInjection || {};
        tx.nextTurnInjection.nearEvent = {
          title: String(result.title || '').slice(0, 30),
          desc:  String(result.desc || result.description || '').slice(0, 50),
          urgent: !!result.urgent
        };
        tx.chronicle = tx.chronicle || [];
        tx.chronicle.push({
          kind:  'horizon_near',
          title: String(result.title || '').slice(0, 30),
          desc:  String(result.desc || result.description || '').slice(0, 50),
          at:    clockNow('horizon'),
          round: roundOfSafe(tx),
          horizon: true
        });
        // v2.13.0: 第二写入方同样走单一出口（同一容器 = 同一站点 backstage.chronicle）。
          if (WA.evict) WA.evict.array(tx.chronicle, 'backstage.chronicle');
          else if (tx.chronicle.length > CHRONICLE_CAP) tx.chronicle = tx.chronicle.slice(-CHRONICLE_CAP);
      });
    }

    // v0.1.33: 移除收尾裸 save——上方各分支已通过 transact 落盘（嵌套时延迟到最外层统一提交）
    WA.log('info', `horizon[${kind}] 结果已入账`, { title: result.title || result.topic });
    return true;
  }

  // ── 生成backstage提示词块 ─────────────────────────────
  /**
   * 返回需要backstage生成的远方/近端事件提示词，无触发时返回null
   */
  function buildPromptBlock(cfgArg) {
    const c = cfgArg || loadSettings();
    const lines = [];
    const st = ensureState();

    // v2.3.0 块3: 关闭的通道**连掷骰都不做**（不出现在 reason 里、不消耗 ledger/冷却）
    if (laneCfg('distant', c).enabled) {
      const d = rollLane('distant', { cfg: c });
      if (d.fired) {
        const isWind = d.type === 'wind';
        lines.push(`【远方${isWind ? '风声' : '事件'}生成指令${d.forced ? '（强制）' : ''}】`);
        lines.push(isWind
          ? '生成一条远方传闻风声：topic(≤10字)、content(≤50字)、level(1-5)。'
          : '生成一个远方具体事件：title(≤30字)、desc(≤50字)。该事件发生在玩家视野之外。');
        lines.push(`输出字段：distantEvent: { type:"${d.type}", ...(对应字段) }`);
      }
    }

    if (laneCfg('near', c).enabled) {
      const n = rollLane('near', { cfg: c });
      if (n.fired) {
        lines.push(`【近端事件生成指令${n.forced ? '（强制）' : ''}】`);
        lines.push('生成一个近端突发事件：title(≤30字)、desc(≤50字)、urgent(bool)。该事件发生在玩家附近，下轮可能直接影响剧情。');
        lines.push('输出字段：nearEvent: { title, desc, urgent }');
      }
    }

    return lines.length ? lines.join('\n') : null;
  }

  // ── 状态摘要（供注入/调试）─────────────────────────────
  function snapshot() {
    const st = ensureState();
    const c = loadSettings();
    const tag = k => (laneCfg(k, c).enabled ? '' : '（关）');
    const fmt = l => `ledger=${l.ledger} cd=${l.cooldown}${l.pending ? ' pending' : ''}`;
    return `distant${tag('distant')}[${fmt(st.evolution.horizon.distant)}] near${tag('near')}[${fmt(st.evolution.horizon.near)}]`;
  }

  /** v2.3.0 块3: 只读运行留痕（面板/诊断消费）——「通道关了」与「掷了没中」可区分 */
  function stat() {
    const c = loadSettings();
    return {
      config: { distant: laneCfg('distant', c), near: laneCfg('near', c) },
      enabled: { distant: laneCfg('distant', c).enabled, near: laneCfg('near', c).enabled },
      rolls: __hzStat.rolls, distantFired: __hzStat.distantFired, nearFired: __hzStat.nearFired,
      skipped: __hzStat.skipped, lastReason: __hzStat.lastReason, lastAt: __hzStat.lastAt
    };
  }

  WA.horizon = {
    rollLane, acceptResult, buildPromptBlock, snapshot, stat, laneCfg,
    getSettings: loadSettings,
    /**
     * v2.7.0: 写入即归一——与 regional 同型缺陷，同版一并收口。
     *   此前 `setSettings` 把**调用方原值**直接落盘，而引擎一律用 laneCfg()（normChancePct +
     *   clampInt）夹取后判定：概率填 500 时，磁盘上是 500、引擎按 100 掷骰，而面板那句
     *   「已保存（生效值经区间夹取：概率 1-100%…）」说的是**另一个数**——用户看到的、磁盘存的、
     *   系统执行的可以三不一致。落盘的就是生效值，界面上那句话才不是空话。
     */
    setSettings(o) {
      // v2.7.0（收口）: 归并到 settingsBus.normalize（区间取自登记表声明 __REG.bounds）。
      //   此前本文件自持一份 toBool+normChancePct+clampInt，与 regional 各写一遍 ——
      //   而 laneCfg（读）与 setSettings（写）又各是一份，同一条规则在本文件里就有两处实现。
      return saveSettings(WA.settingsBus.normalize(__REG, Object.assign(loadSettings(), o || {})));
    },
    /** v2.7.0: 夹取边界（UI 取用）。由登记表声明映射而来——UI 侧的键名（chancePct/cooldown/ledger）
     *   与 def 子键名（distantChance/distantCooldown/distantLedger）不是同一个命名空间，
     *   故此处做一次**显式**的键名映射；map 里若出现 def 不认识的字段，说明两边命名已漂移（此时
     *   返回的数组仍是引擎真正使用的区间，UI 只是标签过时，不会导致「滑块能拖到的值被夹掉」）。 */
    bounds() {
      const b = WA.settingsBus.boundsOf(LS_KEY);
      return { chancePct: b.distantChance || [MIN_CHANCE_PCT, MAX_CHANCE_PCT],
        cooldown: b.distantCooldown || [MIN_COOLDOWN, MAX_COOLDOWN],
        ledger: b.distantLedger || [MIN_LEDGER, MAX_LEDGER] };
    },
    LEDGER_THRESHOLD, COOLDOWN_ROUNDS, BASE_CHANCE,
    MIN_CHANCE_PCT, MAX_CHANCE_PCT, MIN_COOLDOWN, MAX_COOLDOWN, MIN_LEDGER, MAX_LEDGER
  };
})();
