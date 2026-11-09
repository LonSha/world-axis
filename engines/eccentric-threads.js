/**
 * WorldAxis engines/eccentric-threads.js (v2.323.0) — 通用跨题材怪诞支线、市井暗线与搞笑乌龙演化引擎
 *
 * ── 它治什么（核心哲学与工业级缺口）────────────────────────────────────────
 *   1. 打破单一宏大叙事的压抑与单调：生活世界充满了市井烟火、尴尬乌龙、荒诞奇闻与柴米油盐的小算盘；
 *   2. 普适跨题材世界：支持现代都市、古代历史、玄幻修仙、星际科幻、西幻魔法等全题材世界观；
 *   3. 独立自治演化：这些支线与暗线不依赖主角强行触发，可以在世俗街角自行发酵、产生滑稽碰撞并市井式和解；
 *   4. 全链路可证伪：严密的数据持久化、状态机阶段演进、注入管线与真负控制门禁。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_eccentric_threads_settings_v1';
  const DEF = { enabled: true, maxThreads: 32, maxLeadsPerThread: 6, defaultGenre: 'generic' };
  const __REG = { key: LS_KEY, def: DEF, module: 'eccentricThreads' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    const raw = WA.settingsBus.read(__REG);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80);
  }

  const VALID_KINDS = ['farce', 'quirk', 'subtext', 'mundane_quest'];
  const KIND_LABELS = {
    farce: '市井乌龙',
    quirk: '荒诞怪闻',
    subtext: '日常暗流',
    mundane_quest: '生计琐事'
  };

  const STAGES = ['rumor_spark', 'entanglement', 'farce_climax', 'settled'];
  const STAGE_LABELS = {
    rumor_spark: '风声起端',
    entanglement: '啼笑纠葛',
    farce_climax: '滑稽高潮',
    settled: '市井化解'
  };

  const stat = { opened: 0, advanced: 0, settled: 0, refused: 0, lastReason: '' };

  function ensureBucket(draft) {
    if (!draft.eccentricThreads || typeof draft.eccentricThreads !== 'object' || Array.isArray(draft.eccentricThreads)) {
      draft.eccentricThreads = { threads: [], history: [] };
    }
    if (!Array.isArray(draft.eccentricThreads.threads)) {
      draft.eccentricThreads.threads = [];
    }
    if (!Array.isArray(draft.eccentricThreads.history)) {
      draft.eccentricThreads.history = [];
    }
    return draft.eccentricThreads;
  }

  function getThreadById(id) {
    const tid = clean(id, 60);
    if (!tid || !WA.store || !WA.store.get) return null;
    const st = WA.store.get() || {};
    const b = st.eccentricThreads;
    if (!b || !Array.isArray(b.threads)) return null;
    for (let i = 0; i < b.threads.length; i++) {
      if (b.threads[i] && b.threads[i].id === tid) return b.threads[i];
    }
    return null;
  }

  /**
   * 开启一条怪诞市井支线/暗线
   * @param {object} spec { id?, title, kind, genre?, participants?, premise?, leadText? }
   */
  function openThread(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const title = clean(s.title, 80);
    if (!title) { stat.refused++; stat.lastReason = 'missing-title'; return { ok: false, reason: 'missing-title' }; }

    const kind = clean(s.kind, 30);
    if (VALID_KINDS.indexOf(kind) < 0) {
      stat.refused++; stat.lastReason = 'invalid-kind';
      return { ok: false, reason: 'invalid-kind', validKinds: VALID_KINDS };
    }

    const genre = clean(s.genre || cfg.defaultGenre || 'generic', 30);
    const id = clean(s.id || ('ethread_' + clockNow('eccentricThreads') + '_' + Math.floor(WA.rand.next('eccentric-threads') * 1000)), 60);
    const at = Number.isFinite(s.at) ? s.at : clockNow('eccentricThreads');

    const participants = [];
    if (Array.isArray(s.participants)) {
      s.participants.forEach(function (p) {
        const cp = clean(p, 40);
        if (cp && participants.indexOf(cp) < 0) participants.push(cp);
      });
    }

    const initialLead = clean(s.leadText || s.premise || '街坊邻里流传的奇妙谈资', 120);

    let out = null;
    WA.store.transact(function (draft) {
      const b = ensureBucket(draft);
      const cap = cfg.maxThreads || 32;
      // 查重
      for (let i = 0; i < b.threads.length; i++) {
        if (b.threads[i] && b.threads[i].id === id) {
          out = { ok: true, thread: b.threads[i], already: true };
          return;
        }
      }

      if (b.threads.length >= cap) {
        // 挤出最旧的一条进入 history
        const popped = b.threads.shift();
        if (popped) {
          // v2.382.0：本条站的丢弃记账。threads 被 shift 掉的那条**并不消失**——它马上被
          //   搬进 history（见下）。所以这里记的是「从活跃环转出」这件事，不是数据蒸发。
          //   与 history 那条同口径：两站都静态 cap，note() 走 capOf(site)、忽略第三参。
          if (WA.evict && typeof WA.evict.note === 'function') {
            WA.evict.note('eccentricThreads.threads', [popped], cfg.maxThreads || 32);
          }
          b.history.push({ id: popped.id, title: popped.title, stage: popped.stage, closedAt: at });
          // v2.382.0 修复（A 面「悬空站点」：站点表声明了 `eccentricThreads.history` 却零调用）：
          //   此处与下一行的 `eccentricThreads.threads` 是**归档式挤出**，不是静默丢弃——
          //   threads 满 ⇒ 最旧一条**转入** history（内容还在，只是换了容器语义）。
          //   这种形态不能用 `evict.array`：array() 的语义是「切掉尾部并记账」，而这里
          //   必须先把被挤出的那条**搬进 history** 再腾位，搬运动作只有本模块知道。
          //   故用 `evict.note(site, droppedItems, limit)`——它是仓库给「调用方已完成挤出、
          //   只申请记账」准备的接口（先例：chapters.history / enemies / parallelWorld.*）。
          //   记账的意义：诊断面与 `evict.stat()` 从此能看见这两条站的丢弃读数，
          //   而不是「数据悄悄换了容器、任何读数都不动」。
          //   limit 传的是**本条站的静态 cap**（history 20 / threads cfg.maxThreads）：
          //   两站在 SITES 里都是静态数字，note() 会走 capOf(site)、忽略第三参，
          //   传进去只为将来升级成 'per-call' 时无需再改这一行。
          if (b.history.length > 20) {
            if (WA.evict && typeof WA.evict.note === 'function') {
              WA.evict.note('eccentricThreads.history', b.history.slice(0, b.history.length - 20), 20);
            }
            b.history.shift();
          }
        }
      }

      const thread = {
        id: id,
        title: title,
        kind: kind,
        genre: genre,
        stage: 'rumor_spark',
        participants: participants,
        premise: clean(s.premise || title, 150),
        leads: [{ text: initialLead, stage: 'rumor_spark', at: at }],
        resolution: '',
        createdAt: at,
        updatedAt: at
      };

      b.threads.push(thread);
      stat.opened++;
      stat.lastReason = 'opened';
      out = { ok: true, thread: thread };
    }, 'eccentricThreads:openThread');

    return out || { ok: false, reason: 'transact-failed' };
  }

  /**
   * 推进支线阶段并追加市井新线索或意外转折
   * @param {string} threadId
   * @param {object} step { nextStage?, leadText, actor? }
   */
  function advanceThread(threadId, step) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const tid = clean(threadId, 60);
    if (!tid) { stat.refused++; stat.lastReason = 'missing-id'; return { ok: false, reason: 'missing-id' }; }

    const st = step && typeof step === 'object' ? step : {};
    const leadText = clean(st.leadText, 120);
    if (!leadText) { stat.refused++; stat.lastReason = 'missing-lead-text'; return { ok: false, reason: 'missing-lead-text' }; }

    const at = Number.isFinite(st.at) ? st.at : clockNow('eccentricThreads');

    let out = null;
    WA.store.transact(function (draft) {
      const b = ensureBucket(draft);
      let target = null;
      for (let i = 0; i < b.threads.length; i++) {
        if (b.threads[i] && b.threads[i].id === tid) { target = b.threads[i]; break; }
      }

      if (!target) {
        out = { ok: false, reason: 'thread-not-found' };
        return false;
      }

      if (target.stage === 'settled') {
        out = { ok: false, reason: 'already-settled', note: '该支线已市井化解完结，不可继续推进' };
        return false;
      }

      const currIdx = STAGES.indexOf(target.stage);
      let nextStage = target.stage;
      if (st.nextStage && STAGES.indexOf(st.nextStage) >= 0) {
        nextStage = st.nextStage;
      } else if (currIdx >= 0 && currIdx < STAGES.length - 2) {
        nextStage = STAGES[currIdx + 1];
      }

      target.stage = nextStage;
      target.updatedAt = at;

      if (!Array.isArray(target.leads)) target.leads = [];
      target.leads.push({
        text: leadText,
        stage: nextStage,
        actor: clean(st.actor || '', 40),
        at: at
      });

      const maxLeads = cfg.maxLeadsPerThread || 6;
      if (target.leads.length > maxLeads) target.leads.shift();

      if (st.actor) {
        const ca = clean(st.actor, 40);
        if (ca && target.participants.indexOf(ca) < 0) target.participants.push(ca);
      }

      stat.advanced++;
      stat.lastReason = 'advanced';
      out = { ok: true, thread: target };
    }, 'eccentricThreads:advanceThread');

    return out || { ok: false, reason: 'transact-failed' };
  }

  /**
   * 市井收敛与荒诞和解（结案）
   * @param {string} threadId
   * @param {object} resolutionSpec { resolution, finalStage?: 'settled' }
   */
  function resolveThread(threadId, resolutionSpec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const tid = clean(threadId, 60);
    if (!tid) { stat.refused++; stat.lastReason = 'missing-id'; return { ok: false, reason: 'missing-id' }; }

    const rs = resolutionSpec && typeof resolutionSpec === 'object' ? resolutionSpec : {};
    const resolution = clean(rs.resolution, 150);
    if (!resolution) {
      stat.refused++; stat.lastReason = 'missing-resolution';
      return { ok: false, reason: 'missing-resolution', note: '市井化解必须具备明确的结局与依据' };
    }

    const at = Number.isFinite(rs.at) ? rs.at : clockNow('eccentricThreads');

    let out = null;
    WA.store.transact(function (draft) {
      const b = ensureBucket(draft);
      let target = null;
      for (let i = 0; i < b.threads.length; i++) {
        if (b.threads[i] && b.threads[i].id === tid) { target = b.threads[i]; break; }
      }

      if (!target) {
        out = { ok: false, reason: 'thread-not-found' };
        return false;
      }

      if (target.stage === 'settled') {
        out = { ok: false, reason: 'already-settled' };
        return false;
      }

      target.stage = 'settled';
      target.resolution = resolution;
      target.updatedAt = at;

      if (!Array.isArray(target.leads)) target.leads = [];
      target.leads.push({
        text: '【结局】' + resolution,
        stage: 'settled',
        at: at
      });

      stat.settled++;
      stat.lastReason = 'settled';
      out = { ok: true, thread: target };
    }, 'eccentricThreads:resolveThread');

    return out || { ok: false, reason: 'transact-failed' };
  }

  /**
   * 查询活跃或历史支线
   */
  function listThreads(filter) {
    if (!WA.store || !WA.store.get) return [];
    const st = WA.store.get() || {};
    const b = st.eccentricThreads;
    if (!b || !Array.isArray(b.threads)) return [];
    const f = filter || {};
    return b.threads.filter(function (t) {
      if (!t) return false;
      if (f.kind && t.kind !== f.kind) return false;
      if (f.genre && t.genre !== f.genre) return false;
      if (f.stage && t.stage !== f.stage) return false;
      if (f.activeOnly && t.stage === 'settled') return false;
      return true;
    });
  }

  /**
   * 提示词汇流管线输出
   */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled || !WA.store || !WA.store.get) return '';
    const active = listThreads({ activeOnly: true }).slice(0, 2);
    if (!active.length) return '';

    const lines = ['【市井奇闻与日常暗流】（生活中的滑稽乌龙、怪诞爱好或小算盘，让世界充满烟火趣味）：'];
    active.forEach(function (t) {
      const kl = KIND_LABELS[t.kind] || '市井琐事';
      const sl = STAGE_LABELS[t.stage] || t.stage;
      const lastLead = (t.leads && t.leads.length) ? t.leads[t.leads.length - 1].text : t.premise;
      let line = '· [' + kl + '·' + sl + ']《' + t.title + '》';
      if (t.participants && t.participants.length) {
        line += '（关联：' + t.participants.join('、') + '）';
      }
      line += '：' + lastLead;
      lines.push(line);
    });
    return lines.join('\n') + '\n';
  }

  WA.eccentricThreads = {
    VALID_KINDS: VALID_KINDS,
    KIND_LABELS: KIND_LABELS,
    STAGES: STAGES,
    STAGE_LABELS: STAGE_LABELS,
    openThread: openThread,
    advanceThread: advanceThread,
    resolveThread: resolveThread,
    listThreads: listThreads,
    buildBlock: buildBlock
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/eccentric-threads.js', { kind: 'engine', ver: '2.323.0' });
  }
})();