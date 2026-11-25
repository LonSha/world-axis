/**
 * WorldAxis engines/reject-phrase.js (v2.524.0)
 * OPV27-7 拒收码话术：把「engine 甩出一个英文码」翻成「玩家能做什么」。
 *
 * 立项事实：`tests/reject-code-ledger.json` 的 base 已到 **943** 条，而「哪些码能翻成一句
 *   人话、哪些只会甩裸码」从没有读数。玩家看到 `unknown-owner` / `pending` 的第一反应
 *   不是「哦我超出时序了」，而是「这游戏坏了」。
 *
 * 本轮只补**最常撞的五簇**（容量 / 权限 / 缺参 / 时序 / 归属），其余如实记为「未覆盖」：
 *   1 覆盖率是读数，不是目标——把 943 条硬凑成 100% 只会写出 943 句没人看的模板话。
 *   2 一族一个模式，匹配的是码的**语义簇**，不是逐条查表；逐条查表在下一批新码加入时必然漂移。
 *   3 未覆盖的码**原样返回码本身**，不编一句「操作失败，请重试」——那种话术等于把问题藏起来。
 *
 * 边界（否定式）：
 *   1 不改 action-desk 的拒收判定，只在已有拒收上挂一句人话。
 *   2 不新造拒收码，不覆盖原有 reason（码是机器判据，话术是给人看的，两栏并存）。
 *   3 查不到簇时返回 ok:false + reason:'no-phrase'，调用方据此显示裸码。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_reject_phrase_settings_v1';
  const DEF = { enabled: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'rejectPhrase' };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = Object.assign({}, DEF);
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
      : Object.assign(base, raw || {});
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  /**
   * 五簇：一条正则 + 一句「玩家能做什么」。
   * 话术刻意写成**动作句**（先…再…），不是道歉句（"抱歉，操作失败"）——玩家要的是下一步。
   */
  const CLUSTERS = [
    {
      id: 'capacity', label: '容量/上限',
      re: /(cap(acity)?|limit|too-?many|overflow|exceed|max-?rows|full|budget|quota)/i,
      phrase: '这件事已经到上限了：先把旧的清掉（或调高上限）再试。'
    },
    {
      id: 'permission', label: '权限/开关',
      re: /(denied|permission|forbidden|disabled|not-?allowed|unauthor|no-?access|blocked|gate)/i,
      phrase: '这条被权限或开关挡住了：先确认对应功能是开着的，且你有这个身份。'
    },
    {
      id: 'missing', label: '缺少信息',
      // v2.542.8 补「场上没有」家族：v2.524.0 之后新增的判不出面码用的是 no-field / no-line /
      //   no-text / no-agenda / no-tension / none-developing 这套写法（缺字段、缺那句台词、
      //   场上没有这件事在推进、没有张力），它们说的就是「信息没给全」，此前一条都不命中任何簇，
      //   于是覆盖率被新码拉低到 45.0%（跌破 phrase-coverage 冻结的 45.2 守卫线）。
      //   这里只点名这六个具体形态，不做 `no-.*` 泛化 —— 泛化会把 no-such-person 一类从
      //   owner 簇抢过来（那类是「对象不存在」，不是「信息没给全」）。
      re: /(missing|absent|bad-|invalid|malformed|empty|required|no-?arg|mismatch|no-(field|line|text|agenda|tension)\b|none-\w+)/i,
      phrase: '信息没给全（缺人 / 缺地点 / 缺数量）：把这几个补齐再提一次。'
    },
    {
      id: 'timing', label: '时序/冷却',
      re: /(pending|cooldown|busy|not-?yet|expired|stale|too-?early|too-?late|inflight|in-?flight|locked)/i,
      phrase: '时机不对（还没到 / 已经过了 / 上一件还没完）：等一等，或换个时点。'
    },
    {
      id: 'owner', label: '归属/未知',
      re: /(unknown|not-?found|no-?owner|no-?such|unregistered|orphan|nobody|unresolved)/i,
      phrase: '找不到这件事的对象（人或物不存在 / 没登记）：先把它立起来，或换一个对象。'
    },
    // ── v2.569.0 三簇补面（由覆盖率真实读数驱动，不是为凑数）────────────
    //   现场事实：未覆盖 1027 条里有三大**语义极清楚**的家族一直在甩裸码 ——
    //   `already-*`（三十余条：已经做过的事）、`*-unavailable`（本局没装这个模块）、
    //   `*-threw`（内部出错，不是玩法限制）。三者对玩家的含义完全不同，
    //   却都被当成「未知错误」原样显示。加簇而不是加 1027 张逐条表：
    //   本引擎立的规矩就是「一族一个模式」，逐条表在下一批新码进来时必然漂移。
    {
      id: 'already', label: '已经做过',
      re: /(^already(-|$)|-already-)/i,
      phrase: '这一步已经做过了 —— 不用重复点：先刷新看当前状态，再决定下一步。'
    },
    {
      id: 'unavailable', label: '本局没装这个模块',
      re: /(-unavailable|-not-?loaded|-absent)/i,
      phrase: '本局没装 / 没开这个模块 —— 不是你操作错了：到设置里确认对应开关，或换一条路继续。'
    },
    {
      id: 'threw', label: '内部出错',
      re: /(-threw$|-throw$|^throw-|exception|crashed)/i,
      phrase: '内部出错了（不是玩法限制）：先重试一次；仍失败就记下这一步，反馈时带上它。'
    },
    // ── v2.569.0 第二批八簇（同一动因：覆盖率读数把「真裸码」点名到 248 条）──────
    //   这一批与上面三簇的区别只有一点：上面三簇是「一条码一个后缀」，
    //   这一批是「一条码一种**下一步动作**」——每个簇的 phrase 都能直接答
    //   「我现在该做什么」，而不是「哪里不对」。
    {
      id: 'failed', label: '这一步没做成',
      re: /(-failed$|-fail$|^fail-|_failed$)/i,
      phrase: '这一步没做成（不是你没权限，是真的执行失败）：原样再试一次；连着两次这样，就换一条路走。'
    },
    {
      id: 'conflict', label: '与已有的事撞了',
      re: /(conflict|collided|duplicate|^dedup$|^near-dup$|^dup-|cannot-(clash|conflict|encounter)-self|^same-|^occupied$|^role-taken$|^name-taken$|^slot-taken$|^overlap$)/i,
      phrase: '这件事和已经有的东西撞了（重名 / 同一件事已经立过 / 不能拿自己跟自己比）：换一个对象，或先把旧的改掉。'
    },
    {
      id: 'closed', label: '这条路已经关了',
      re: /(-closed$|^closed|^closed_|^sealed$|-sealed$|^settled$|^settle-|^terminal$|-terminal$|^frozen$|^finished$|^irreversible$|^tries-exhausted$|^design-exhausted$|^redesign-exhausted$)/i,
      phrase: '这条路已经关了（结案 / 封了 / 次数用完 / 不可逆）：别再试同一条，去开另一条线。'
    },
    {
      id: 'off-target', label: '量不对（尺寸/距离/时机偏了）',
      // 「too-short / too-long / too-small / too-big / below-min / out-of-range」这一族的
      //   共同点是「值是真的，只是不在允许区间里」—— 与 capacity（到上限了）不同：
      //   这里往往能靠调参数解决，而不是靠清理。
      re: /(-range$|^out-of-|threshold|below-|above-|^too-|-(too)-(short|long|big|small|deep|new|soon|close)$|^short-(input|material|stock|supply|cost|fine)$|^shortfall$)/i,
      phrase: '这个数值偏了（太长 / 太短 / 太大 / 不够门槛 / 不在允许区间）：按提示把量调到区间内再试。'
    },
    {
      id: 'switched-off', label: '这个面被关掉了',
      re: /(-off$|^off-|^off_)/i,
      phrase: '对应的那个面被关掉了（不是坏）：到设置里把它打开，或换用开着的那个面。'
    },
    {
      id: 'unconfigured', label: '还没配置 / 没登记',
      //   与 owner（「找不到这个对象」）不同：这里是「对象在，但它还没被配好/没启用」。
      re: /(unconfigured|not-?configured|not-?registered|^no-?\w*-registered|not-?active$|-not-active$|^no-?\w*-active$|^blueprint-not-installed$|^not-in-table$)/i,
      phrase: '这件事还没配好 / 没登记进系统：先去对应页面把它配上（或让它先生效），再回来。'
    },
    {
      id: 'absent', label: '场上压根没有这件东西',
      //   本仓最大的一族（139 条）：`no-actor / no-clock / no-entry / no-goal / no-grounds…`。
      //   phrase 必须与 missing 区分开：missing 是「你少填了一项」，absent 是「世界里没有它」。
      re: /^(no|nothing|none)(-|_|$)/i,
      phrase: '场上没有这件东西（没有人 / 没有那条线 / 没有这个存档…）：先把它造出来或换一个存在的对象。'
    },
    {
      id: 'attire',
      label: '穿着状态 / 外貌',
      //   v2.584.0（R256）：这两个码是 attire-state / appearance 特有的，**逐名登记**而不是按词根猜 ——
      //   `scope` 与 `coverage` 在别处指的是别的事（作用域 / 覆盖率），按词根归会给出一句与病因无关的话术。
      //   实测：本批十个新码里只有这两条未被既有簇收住（其余八条各自命中 permission / absent / unmet 等）。
      re: /^(cause-scope|downgrade-coverage)$/i,
      phrase: '这身衣服的这次变更说不通：原因要解释得清（动作 / 环境 / 姿态 / 时间各只管自己够得着的那几处），升级也不能推翻已经写好的描写。'
    },
    {
      id: 'unmet', label: '条件还没满足',
      //   `not-authorized` 已被 permission 抢先命中（它更具体）；这里收剩下的 `not-*`。
      re: /^not(-|_)/i,
      phrase: '条件还没满足（还不够格 / 还没到位 / 还不在那个状态）：先满足它，再回来做这一步。'
    }
  ];

  const stat = { asks: 0, covered: 0, noPhrase: 0, lastCode: '', lastCluster: '' };
  const memo = {};

  /** 分类：返回命中的簇（按 CLUSTERS 顺序，第一个命中为准）。 */
  function classify(code) {
    const c = String(code == null ? '' : code);
    if (memo[c] !== undefined) return memo[c];
    let hit = null;
    for (let i = 0; i < CLUSTERS.length; i++) {
      if (CLUSTERS[i].re.test(c)) { hit = CLUSTERS[i]; break; }
    }
    memo[c] = hit ? { ok: true, cluster: hit.id, label: hit.label, phrase: hit.phrase } : { ok: false, reason: 'no-phrase' };
    return memo[c];
  }

  /** 一行话术：命中给「码 → 人话」，未命中如实说「还没有人话」。 */
  function phraseOf(code) {
    stat.asks++;
    const c = String(code == null ? '' : code);
    const k = classify(c);
    stat.lastCode = c;
    if (!k.ok) {
      stat.noPhrase++;
      return { ok: false, code: c, reason: 'no-phrase',
        text: '这条拒收码还没有人话话术（原样显示码本身）：' + c };
    }
    stat.covered++; stat.lastCluster = k.cluster;
    return { ok: true, code: c, cluster: k.cluster, label: k.label,
      text: '「' + c + '」→ ' + k.phrase };
  }

  /**
   * 覆盖率读数：传一组码（如 reject-code-ledger 的 base）→ 覆盖几条 / 百分比 / 未覆盖清单。
   * text 一行可供面板与诊断直接显示。
   *
   * v2.569.0 口径修正（这是本轮唯一一处「读数本身是错的」）：
   *   旧口径把**全部在用码**都当成「该有拒收话术的码」，于是 220 条**根本不表示拒收**的码
   *   也在分母里，永远算未覆盖 —— 其中 144 条是 `reject-recovery-tables.SUCCESS_FACE`
   *   （成功面：`ok:true` 的信封，如 applied / landed / committed）、90 条是 `NEUTRAL_FACE`
   *   （中性面：既不是失败也不是成功，如 `no-console` 这类「没事发生」）。
   *   给成功面补一句「出错了怎么办」的话术是**语义错误**，不是没做完。
   *   于是覆盖率读数长期被这 220 条按在地上（59.5% 的上限就是这么来的）。
   *   现改为「可判面」口径：允许调用方传 `opts.exclude`（引擎不认识这两张表，
   *   由工具侧把面表传进来 —— 引擎不复制第二份真源）。
   *   分母变成 `total − excluded`，同时**如实报出** excluded 的条数，
   *   `percent` 是**可判面**上的百分比；`text` 会写明「分母里剔掉了 N 条非拒收面」。
   *   判据形态没放宽：被剔除的只是「本来就该没有这句话」的码，不是「难写的码」。
   */
  function coverage(codes, opts) {
    const o = opts || {};
    const list = Array.isArray(codes) ? codes : [];
    const exList = Array.isArray(o.exclude) ? o.exclude : [];
    const ex = {};
    exList.forEach(function (c) { ex[String(c)] = 1; });
    const total = list.length;
    let covered = 0, excluded = 0;
    const byCluster = {};
    CLUSTERS.forEach(function (c) { byCluster[c.id] = 0; });
    const missing = [];
    const excludedList = [];
    list.forEach(function (code) {
      const s = String(typeof code === 'string' ? code : (code && code.code));
      if (ex[s]) { excluded++; if (excludedList.length < (o.maxExcluded || 40)) excludedList.push(s); return; }
      const k = classify(s);
      if (k.ok) { covered++; byCluster[k.cluster]++; }
      else if (missing.length < (o.maxMissing || 40)) missing.push(s);
    });
    const judged = total - excluded;
    const percent = judged ? Math.round((covered / judged) * 1000) / 10 : 0;
    return {
      ok: true, at: clockNow('rejectPhrase'),
      total: total, judged: judged, excluded: excluded,
      covered: covered, uncovered: judged - covered,
      percent: percent, byCluster: byCluster,
      missing: missing, missingTotal: judged - covered,
      excludedList: excludedList,
      text: '拒收码话术覆盖：' + covered + '/' + judged + '（' + percent + '%）；'
        + '分母 ' + total + ' 条 − 非拒收面 ' + excluded + ' 条（成功面 / 中性面，本来就不该有拒收话术）；'
        + CLUSTERS.map(function (c) { return c.label + ' ' + byCluster[c.id]; }).join(' · ')
        + '；未覆盖 ' + (judged - covered) + ' 条仍原样甩码'
    };
  }

  WA.rejectPhrase = {
    phraseOf: phraseOf, classify: classify, coverage: coverage,
    clusters: function () { return CLUSTERS.map(function (c) { return { id: c.id, label: c.label, phrase: c.phrase }; }); },
    settings: settings,
    stat: function () { return Object.assign({}, stat); }
  };
  // 装载面登记与自述行：与全部引擎同形态（少这两行会在装载汇报里被算成「未自述」，
  //   而 module-registry 的装载期边也要靠 registerModule 才能记到这台）。
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/reject-phrase.js', { kind: 'engine', ver: '2.524.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/reject-phrase 已加载（2.524.0）');
})();