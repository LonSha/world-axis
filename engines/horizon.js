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
  const LEDGER_THRESHOLD = 10;   // 未触发累计轮数阈值，达到则强制触发
  const COOLDOWN_ROUNDS  = 5;    // 触发后的冷却轮数
  const RETRY_MAX        = 3;    // pending 结果最大重试轮数，超过丢弃
  const BASE_CHANCE      = 0.18; // 每轮自然触发基础概率（Ledger未达阈值时）
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
  function rollLane(kind) {
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
      const forced = lane.ledger >= LEDGER_THRESHOLD;
      const fired  = forced || roll01() < BASE_CHANCE;
      if (fired) {
        lane.ledger     = 0;
        lane.cooldown   = COOLDOWN_ROUNDS;
        lane.lastFired  = round;
        const type = roll01() < 0.5 ? 'event' : 'wind';
        lane.pending = { result: { type, kind }, retries: 0 };
        out = { fired: true, forced, type, reason: forced ? `ledger>=${LEDGER_THRESHOLD}` : `chance(${BASE_CHANCE})` };
        return;
      }
      out = { fired: false, forced: false, reason: `ledger=${lane.ledger}` };
    });
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
  function buildPromptBlock() {
    const lines = [];
    const st = ensureState();

    const d = rollLane('distant');
    if (d.fired) {
      const isWind = d.type === 'wind';
      lines.push(`【远方${isWind ? '风声' : '事件'}生成指令${d.forced ? '（强制）' : ''}】`);
      lines.push(isWind
        ? '生成一条远方传闻风声：topic(≤10字)、content(≤50字)、level(1-5)。'
        : '生成一个远方具体事件：title(≤30字)、desc(≤50字)。该事件发生在玩家视野之外。');
      lines.push(`输出字段：distantEvent: { type:"${d.type}", ...(对应字段) }`);
    }

    const n = rollLane('near');
    if (n.fired) {
      lines.push(`【近端事件生成指令${n.forced ? '（强制）' : ''}】`);
      lines.push('生成一个近端突发事件：title(≤30字)、desc(≤50字)、urgent(bool)。该事件发生在玩家附近，下轮可能直接影响剧情。');
      lines.push('输出字段：nearEvent: { title, desc, urgent }');
    }

    return lines.length ? lines.join('\n') : null;
  }

  // ── 状态摘要（供注入/调试）─────────────────────────────
  function snapshot() {
    const st = ensureState();
    const fmt = l => `ledger=${l.ledger} cd=${l.cooldown}${l.pending ? ' pending' : ''}`;
    return `distant[${fmt(st.evolution.horizon.distant)}] near[${fmt(st.evolution.horizon.near)}]`;
  }

  WA.horizon = { rollLane, acceptResult, buildPromptBlock, snapshot, LEDGER_THRESHOLD, COOLDOWN_ROUNDS, BASE_CHANCE };
})();
