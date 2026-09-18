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
  }, module: 'horizon' };
  function loadSettings() { return WA.settingsBus.read(__REG); }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function saveSettings(s) { WA.settingsBus.save(__REG, s); }

  /** 区间夹取：历史存档/手改值越界（如概率写成 500）会让判定永久为真——读入即夹取 */
  function clampInt(v, def, min, max) {
    const n = parseInt(v, 10);
    if (!isFinite(n)) return def;
    return Math.min(max, Math.max(min, n));
  }
  /** 概率归一：兼容「百分比」(>1) 与「小数比率」(≤1) 两种写法 */
  function normChancePct(v, defPct) {
    let n = parseFloat(v);
    if (!isFinite(n)) return defPct;
    if (n > 0 && n <= 1) n = n * 100;   // 小数比率写法（0.18 → 18）
    return Math.min(MAX_CHANCE_PCT, Math.max(MIN_CHANCE_PCT, Math.round(n)));
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
  const CHRONICLE_CAP = 200;     // 与 __BOUNDED_CAPS['chronicle'] 登记同源（backstage slice(-200)）

  // ── 工具 ──────────────────────────────────────────────
  function roll01() { return Math.random(); }

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
    __hzStat.lastAt = Date.now();
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
      const round = (d.meta && d.meta.round) || 0;
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
              tx.chronicle.push({ kind: 'horizon_distant', title: String(result.topic || result.title || '').slice(0, 30), desc: String(result.content || '').slice(0, 50), at: Date.now(), round: (tx.meta && tx.meta.round) || 0, horizon: true });
              if (tx.chronicle.length > CHRONICLE_CAP) tx.chronicle = tx.chronicle.slice(-CHRONICLE_CAP);
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
            at:    Date.now(),
            round: (tx.meta && tx.meta.round) || 0,
            horizon: true
          });
          if (tx.chronicle.length > CHRONICLE_CAP) tx.chronicle = tx.chronicle.slice(-CHRONICLE_CAP);
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
          at:    Date.now(),
          round: (tx.meta && tx.meta.round) || 0,
          horizon: true
        });
        if (tx.chronicle.length > CHRONICLE_CAP) tx.chronicle = tx.chronicle.slice(-CHRONICLE_CAP);
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
    setSettings(o) { saveSettings(Object.assign(loadSettings(), o || {})); },
    LEDGER_THRESHOLD, COOLDOWN_ROUNDS, BASE_CHANCE,
    MIN_CHANCE_PCT, MAX_CHANCE_PCT, MIN_COOLDOWN, MAX_COOLDOWN, MIN_LEDGER, MAX_LEDGER
  };
})();
