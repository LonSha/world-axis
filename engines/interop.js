/**
 * WorldAxis engines/interop.js (v2.101.0) — 跨插件互操作验收面（**纯读**）
 *
 * 【为什么需要这一面】
 *   v2.87.0（B7）建了 `theme.separation()`：三插件职责分离、缺席降级可见。
 *   本面开工时**实测**到它两处失真（不是渲染 bug，是读数与真源脱节）：
 *     ① **LonSha 那一行的 `state` 读的是 `s.state`**，而 `lonshaReader.lonshaSource()`
 *        从来只返回 `{ mounted, sourceState, lastError, hasSnapshot, reason }` ——
 *        该字段不存在 ⇒ 无论上游在不在、版本对不对，面板上一律念「unknown」。
 *     ② **RubyPhone 那一行的 `present: false` 是写死的**，不看 `phoneBridge` 现场 ⇒
 *        手机侧真的在推（`phaseOf().phase === 'pushing'`）时，读数仍是「未接入」。
 *   两处症状相同（永远说「不知道 / 没接入」），**处置完全相反**：一个是不知道，
 *   一个是没接。这正是 A1「运行时验收」要治的那类病——**降级可见写在代码里，
 *   但没人核过它读的是不是真源**。
 *
 * 【三条纪律（全是否定式，也就是本模块存在的全部理由）】
 *   ① **只读**：不碰存档、不写自己的 stat、**不驱动对方重建快照**。诊断是旁观，
 *      命令另一个插件干活会把「我这轮体检」变成「我改了别人的状态」。
 *   ② **五态分列、不合并**：`ready` / `partial`（在但能力不全）/ `absent`（不在）/
 *      `incompatible`（在、能力够，但契约版本与我们不一致）/ `unknown`（探不出）。
 *      尤其 **`unknown` 不得写成 `absent`**——「不知道它在不在」与「它不在」处置相反。
 *   ③ **不写死、不猜**：每一态都由**现场探测**得出，并带 `evidence` 说明凭什么这样判；
 *      三伙伴的判定源分别是 `compat.detect()` / `lonshaSource()` / `phoneBridge.phaseOf()`。
 *
 * 【与既有三处的关系（不新增第二套真源）】
 *   · 宿主能力 —— 复用 `compat.detect()`（compat/host.js），不另探一遍。
 *   · 上游证据读取 —— 复用 `lonshaReader.lonshaSource()` 与 `readLonshaSnapshot()`。
 *   · 下游交互执行 —— 复用 `phoneBridge.phaseOf()` 与它自报的 `version`。
 *   本模块只做**汇总与三态判定**：把散在四处、词汇各异的读数归一成一张可核对的矩阵。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  /** 伙伴封闭集合。顺序**写死**：面板与诊断按此序念出，不随装载顺序漂。 */
  const PARTNERS = ['host', 'lonsha', 'rubyphone'];
  const PARTNER_LABEL = {
    host: '宿主（TavernHelper / MVU 通道）',
    lonsha: 'LonSha 记忆插件（证据读取）',
    rubyphone: 'RubyPhone（交互执行）'
  };
  /** 状态封闭集合。`unknown` 是**合法结论**，不是失败态——它答的是「探不出」。 */
  const STATES = ['ready', 'partial', 'absent', 'incompatible', 'unknown'];
  /** 宿主侧「齐备」所需的最小能力集（缺任一项 ⇒ 不是 ready）。 */
  const HOST_NEED = ['sillyTavern', 'eventSource', 'generation', 'extensionPrompt'];
  /** 宿主侧「能用但会降级」的能力（缺它不减到 absent，只减到 partial）。 */
  const HOST_NICE = ['tavernHelper', 'variables', 'worldbook', 'chatChanged', 'appReady'];

  const _calls = { probes: 0, lastAt: 0 };
  function clean(v, max) {
    try { return WA.inputGuard && WA.inputGuard.text ? WA.inputGuard.text(v, max || 80) : String(v === null || v === undefined ? '' : v).slice(0, max || 80); }
    catch (e) { return String(v === null || v === undefined ? '' : v).slice(0, max || 80); }
  }

  /* ── 伙伴探测（三个各一个纯函数；整函数兜底，永不抛） ───────────────── */

  /** 宿主：复用 compat.detect()。ST 都没有 ⇒ absent；ST 在但生成/事件面缺 ⇒ partial。 */
  function probeHost() {
    try {
      const d = (WA.compat && typeof WA.compat.detect === 'function') ? WA.compat.detect() : null;
      if (!d) return { key: 'host', state: 'unknown', evidence: 'compat-unavailable', detail: 'compat/host.js 未加载或 detect() 不在（探不出宿主能力，不代表宿主不在）' };
      const missing = HOST_NEED.filter(function (k) { return d[k] !== true; });
      const niceMissing = HOST_NICE.filter(function (k) { return d[k] !== true; });
      if (!d.sillyTavern) return { key: 'host', state: 'absent', evidence: 'no-sillytavern', detail: '宿主上下文取不到（未在 SillyTavern 内运行）' };
      if (missing.length) return { key: 'host', state: 'partial', evidence: 'cap-missing:' + missing.join('+'), detail: '宿主在，但关键通道缺：' + missing.join(' / ') };
      if (niceMissing.length) return { key: 'host', state: 'partial', evidence: 'cap-optional-missing:' + niceMissing.join('+'), detail: '关键通道齐备，可选能力缺：' + niceMissing.join(' / ') + '（对应功能降级，不影响结算面）' };
      return { key: 'host', state: 'ready', evidence: 'cap-full', detail: '宿主能力齐备（含 TavernHelper 变量与世界书面）' };
    } catch (e) { return { key: 'host', state: 'unknown', evidence: 'probe-threw', detail: '探测抛错：' + (e && e.message) }; }
  }

  /** 上游：桥对象在不在 ⇒ absent/partial；契约版本不符 ⇒ incompatible；能取到快照 ⇒ ready。 */
  function probeLonsha() {
    try {
      const lr = WA.lonshaReader;
      if (!lr || typeof lr.lonshaSource !== 'function') {
        return { key: 'lonsha', state: 'absent', evidence: 'consumer-missing', detail: '本侧没有消费面（engines/lonsha-reader.js 未加载）——这是本扩展自己的问题，不是对方不在' };
      }
      // ★ 真源就是 lonshaSource()：它回的是 mounted/sourceState/lastError/hasSnapshot/reason。
      //   本模块**不再自行推断**（旧 separation() 读不存在的 s.state 就是这么错的）。
      const s = lr.lonshaSource(lr.LONSHA_BRIDGE_ID);
      if (!s || s.mounted !== true) {
        return { key: 'lonsha', state: s && s.reason === 'probe-threw' ? 'unknown' : 'absent',
          evidence: 'bridge-' + clean(s && s.reason, 40), detail: s && s.reason === 'probe-threw' ? '探针自身抛错（探不出，不等于不在）' : '上游桥对象不在全局上（插件未安装 / 未加载）' };
      }
      if (s.reason === 'engine-absent' || s.reason === 'engine-empty' || s.reason === 'thrown') {
        return { key: 'lonsha', state: 'partial', evidence: 'engine-' + clean(s.reason, 24),
          detail: '插件在，但记忆引擎未就位（' + clean(s.lastError, 60) + '）——能力不全，不是没接' };
      }
      // 版本面：只拦**显式**不匹配（缺失视为旧版放行，与 lonshaReader 同口径；此处只**报态**不拦读取）。
      const rd = (typeof lr.readLonshaSnapshot === 'function') ? lr.readLonshaSnapshot({ refresh: false }) : null;
      if (rd && rd.reason === 'contract-mismatch') {
        return { key: 'lonsha', state: 'incompatible', evidence: 'contract-mismatch', detail: '快照契约版本与本消费者不一致（本侧认 v' + lr.LONSHA_BRIDGE_VERSION + '）' };
      }
      if (rd && rd.ok) {
        const snap = rd.snapshot || {};
        return { key: 'lonsha', state: 'ready', evidence: 'snapshot-ok',
          detail: '快照可取（floor=' + (Number(snap.floor) || 0) + '，契约 v' + (snap.version === undefined || snap.version === null ? '旧版无字段' : snap.version) + '）' };
      }
      return { key: 'lonsha', state: 'partial', evidence: 'no-snapshot', detail: '桥在、引擎就绪，但尚无快照可读（还没演过一轮）' };
    } catch (e) { return { key: 'lonsha', state: 'unknown', evidence: 'probe-threw', detail: '探测抛错：' + (e && e.message) }; }
  }

  /** 下游：入站桥在不在 + 版本 + 手机侧此刻有没有在推（三态由桥自己算，本面照搬）。 */
  function probeRubyphone() {
    try {
      const pb = WA.phoneBridge;
      if (!pb || typeof pb.phaseOf !== 'function') {
        return { key: 'rubyphone', state: 'absent', evidence: 'inbound-bridge-missing', detail: '入站桥未加载（手机侧的操作无处可进）' };
      }
      const want = 1;
      if (Number(pb.version) !== want) {
        return { key: 'rubyphone', state: 'incompatible', evidence: 'ops-version:' + clean(pb.version, 12), detail: '入站桥操作契约版本与本面认的 v' + want + ' 不一致' };
      }
      const p = pb.phaseOf();
      const ph = clean(p && p.phase, 16);
      // ★ 这里**不再写死 present:false**：`unknown` 是桥自报的合法三态之一
      //   （「本会话尚未收到过任何上报」与「它没在推」是两件事），故原样透出。
      if (ph === 'disabled') return { key: 'rubyphone', state: 'partial', evidence: 'bridge-disabled', detail: '入站桥已关闭：手机侧的操作不会进世界台账（用户关闭 ≠ 对方不在）' };
      if (ph === 'unknown') return { key: 'rubyphone', state: 'unknown', evidence: 'no-report-yet', detail: clean(p && p.note, 80) || '本会话尚未收到任何手机侧上报' };
      if (ph === 'pushing') return { key: 'rubyphone', state: 'ready', evidence: 'pushing', detail: '近期有上报（活跃窗口内）' };
      if (ph === 'quiet') return { key: 'rubyphone', state: 'ready', evidence: 'quiet', detail: clean(p && p.note, 80) || '有过上报，但已超出活跃窗口' };
      return { key: 'rubyphone', state: 'unknown', evidence: 'phase-unknown:' + ph, detail: '桥自报的相位不在封闭集合内' };
    } catch (e) { return { key: 'rubyphone', state: 'unknown', evidence: 'probe-threw', detail: '探测抛错：' + (e && e.message) }; }
  }

  const PROBES = { host: probeHost, lonsha: probeLonsha, rubyphone: probeRubyphone };

  /**
   * 探测一个伙伴（纯读）。`key` 不在封闭集合内 ⇒ 如实报 unknown 并点名，**不回落成 host**。
   * @returns {{key:string, label:string, duty:string, state:string, evidence:string, detail:string}}
   */
  function probePartner(key) {
    const k = clean(key, 24);
    const fn = PROBES[k];
    if (!fn) return { key: k, label: '', duty: '', state: 'unknown', evidence: 'unknown-partner', detail: '不在伙伴封闭集合内（' + PARTNERS.join(' / ') + '）' };
    const r = fn();
    return { key: r.key, label: PARTNER_LABEL[r.key] || r.key,
      duty: r.key === 'lonsha' ? '证据读取' : (r.key === 'rubyphone' ? '交互执行' : '宿主运行时'),
      state: r.state, evidence: r.evidence, detail: r.detail };
  }

  /** 三态矩阵（计数）：把逐伙伴结论归一成一张表，面板与诊断念同一份。 */
  function matrixOf(rows) {
    const m = {}; STATES.forEach(function (s) { m[s] = 0; });
    rows.forEach(function (r) { if (m[r.state] === undefined) m[r.state] = 0; m[r.state]++; });
    return m;
  }

  /**
   * 全量探测（**纯读**：零存档写入、零 stat 写入、不驱动对方重建）。
   * @returns {{at:number, rows:Array, matrix:object, ready:number, degraded:Array, allReady:boolean}}
   */
  function probeAll() {
    _calls.probes++; _calls.lastAt = clockWall();
    const rows = PARTNERS.map(probePartner);
    const matrix = matrixOf(rows);
    const degraded = rows.filter(function (r) { return r.state !== 'ready'; }).map(function (r) { return r.key + ':' + r.state; });
    return { at: _calls.lastAt, rows: rows, matrix: matrix,
      ready: matrix.ready, degraded: degraded, allReady: degraded.length === 0 };
  }

  /**
   * 协议冻结面（**只读**）：外部读者要认的那些字符串，一处念全。
   *   为什么要有它：桥 id / 契约版本 / UI id 前缀 / 诊断节键 / 拒收码词表分散在十几个文件里，
   *   「哪些是对外承诺、哪些随时可改」此前只写在注释里。这里把**承诺**集中成可核对的清单
   *   （本面不做冻结动作，只如实报出当前值）。
   */
  function freeze() {
    const g = function (fn, d) { try { return fn(); } catch (e) { return d; } };
    return {
      at: clockWall(),
      bridges: [
        { id: g(function () { return WA.bridge.id; }, null), version: g(function () { return WA.bridge.version; }, null), direction: 'out', duty: '本扩展 → 外部（只读投影）' },
        { id: g(function () { return WA.lonshaReader.LONSHA_BRIDGE_ID; }, null), version: g(function () { return WA.lonshaReader.LONSHA_BRIDGE_VERSION; }, null), direction: 'in', duty: '上游快照（只读消费）' },
        { id: g(function () { return WA.phoneBridge.id; }, null), version: g(function () { return WA.phoneBridge.version; }, null), direction: 'in', duty: '手机侧操作（显式写入）' }
      ],
      diagSections: ['meta', 'env', 'modules', 'interop', 'bridge', 'phoneBridge', 'lonsha', 'compat'],
      rejectCodes: {
        inbound: ['missing-op', 'unknown-act', 'disabled', 'ops-full', 'store-unavailable', 'missing-fields', 'link-off', 'unknown-chain', 'no-ops', 'unknown-op', 'already-linked'],
        readFace: ['not-mounted', 'engine-absent', 'engine-empty', 'thrown', 'no-snapshot', 'contract-mismatch', 'pull-failed']
      },
      states: STATES.slice(),
      partners: PARTNERS.slice()
    };
  }

  /**
   * 兼容矩阵（**只读**）：旧存档 / 旧配置 / 缺席插件三种「老环境」下本扩展的既定处置。
   *   每条都带**判据落点**（哪个模块的哪条规则在兜），避免「文档说兼容、代码里没人管」。
   */
  function compatGaps() {
    return {
      oldSave: { rule: '骨架缺键由 store.defaultWorldState() 物化补全；schemaVersion 只升不回退',
        where: 'core/store.js（migrate / defaultWorldState）',
        evidence: (function () { try { return Object.keys(WA.store.defaultWorldState()).length; } catch (e) { return -1; } })() + ' 个顶层键可物化' },
      oldConfig: { rule: '未登记设置键走 define 默认值；已落盘但未登记的幽灵键由 store.orphanSettingsKeys() 如实报出（不静默删）',
        where: 'core/settings-bus.js',
        evidence: (function () { try { return (WA.store.orphanSettingsKeys() || []).length; } catch (e) { return -1; } })() + ' 个幽灵键' },
      absentPlugin: { rule: '缺席降级可见：absent / partial / incompatible / unknown 四态分开，**不得当作空集**',
        where: 'engines/interop.js（本面）+ engines/lonsha-reader.js（字段三态）',
        evidence: '三伙伴探测与字段在场三态（value / null / absent）分列' }
    };
  }

  /** 一句话归因（供面板/诊断念出；纯读）。 */
  function summaryText() {
    try {
      const r = probeAll();
      const bad = r.rows.filter(function (x) { return x.state !== 'ready'; });
      if (!bad.length) return '跨插件面就绪（3/3 ready）';
      return '跨插件面 ' + r.ready + '/3 ready：' + bad.map(function (x) { return x.label + '=' + x.state; }).join('；');
    } catch (e) { return '互操作面读取失败'; }
  }

  WA.interop = {
    PARTNERS: PARTNERS, PARTNER_LABEL: PARTNER_LABEL, STATES: STATES,
    HOST_NEED: HOST_NEED, HOST_NICE: HOST_NICE,
    probePartner: probePartner,
    probeAll: probeAll,
    freeze: freeze,
    compatGaps: compatGaps,
    summaryText: summaryText,
    // 只读计量：本面自己探了几次（**不是**世界状态，不进存档）
    stat: function () { return { probes: _calls.probes, lastAt: _calls.lastAt, partners: PARTNERS.length }; }
  };
  if (WA.log) WA.log('info', '跨插件互操作验收面已加载（纯读，三伙伴三态分列）');
})();
