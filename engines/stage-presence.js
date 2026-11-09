/**
 * WorldAxis engines/stage-presence.js (v2.350.0)
 * 舞台聚光灯与退场角色自主运转中枢 (Stage Presence & Offstage Autonomy Hub)
 *
 * ── 它治什么（核心灵魂诉求）────────────────────────────────────────
 *   用户最本真的诉求：“我只是想要世界运转，就是在正文，进行聊天的时候，退场的角色会干其他的。”
 *   
 *   在此前：
 *   1. 角色一旦不在当前正文镜头，代码没有任何自动机制感知他“退场了”；
 *   2. offstage-life.js 必须由外部显式调用 markOffstage 才能建档，离开后不调 progressOffstage 就永远停滞；
 *   3. 聊了十轮，不在场的角色像冰冻木偶一样原地不动；
 *   4. 重逢时，正文不知道他刚才经历了什么、在什么地方、身上带着什么烟火气。
 *
 * ── 本模块四大自动闭环───────────────────────────────────────
 *   ① 舞台聚光灯自动感知 (sensePresence)：
 *      - 分析本轮聊天正文与发言者（speaker / mention / context）；
 *      - 识别“在场角色（onstage）”与“退场角色（offstage）”；
 *      - 新登场者自动记录活跃；已在世界中登记但本轮未出场的角色，自动判定退场并移入幕后流转。
 *   ② 退场角色每轮后台自主运转 (tickOffstageAutonomy)：
 *      - 挂载工作流 `workflow: after`（order: 22.5）；
 *      - 每轮正文对话完毕后，所有不在场的退场角色自动向前走一步；
 *      - 结合世界钟与题材（古代修仙/科幻/都市/西幻），自主轮换作息地点、扣减精力磨损、
 *        偶尔遭遇市井生活糗事（misadventures，如买补给被找错钱、被野狗追、运功炸炉、修义体死机）；
 *   ③ 提及与久别重逢自动谈资唤醒 (awakenReunion)：
 *      - 正文或玩家提及时，自动唤醒其退场生活切片（“他刚才在干什么、身上有什么痕迹”）；
 *      - 自然向提示词注入结构化上下文，让 AI 接话时自然流露角色的生活轨迹。
 *   ④ 零破坏性与严格负控制：
 *      - 空角色名拦截、禁用状态静默、在场角色禁止生成退场谈资。
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  WA.engines = WA.engines || {};

  const VERSION = '2.350.0';
  const LS_KEY = 'worldaxis_stage_presence_settings_v1';
  const DEF = {
    enabled: true,
    autoTrack: true,             // 自动从正文追踪出场/退场角色
    autonomousTick: true,        // 每轮聊天自动推进退场角色日常
    maxTrackedActors: 32,        // 最大追踪角色数量
    misadventureChance: 0.35,    // 离场角色经历市井小糗事/意外的概率 (35%)
    wearinessRate: 1.0           // 磨损速率倍率
  };

  const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'stagePresence',
    bounds: {
      maxTrackedActors: [4, 64],
      misadventureChance: [0.05, 1.0],
      wearinessRate: [0.1, 5.0]
    }
  };

  // v2.381.0: 此处原本读 WA.stagePresence.__customSettings —— 但本函数定义在
  //   `WA.stagePresence = api` 之前，模块内调用时 WA.stagePresence 恒为 undefined
  //   （只有外部/测试先行注入才可能命中）。改为读模块内的覆盖变量，
  //   并由 api.__customSettings 的 setter 同步写入，保持既有注入通路可用。
  let _customSettings = null;
  function settings() {
    if (_customSettings) {
      return Object.assign({}, DEF, _customSettings);
    }
    if (!WA.settingsBus) return Object.assign({}, DEF);
    const raw = WA.settingsBus.read(__REG);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = {
    scans: 0,
    onstageCount: 0,
    offstageTicks: 0,
    reunionsAwakened: 0,
    refused: 0,
    lastReason: '',
    faults: {}
  };

  function noteFault(code) {
    stat.faults[code] = (stat.faults[code] || 0) + 1;
    stat.refused++;
    stat.lastReason = code;
  }

  function cleanStr(s, max) {
    if (typeof s !== 'string') return '';
    return s.trim().slice(0, max || 60);
  }

  function ensurePresenceStore(draft) {
    if (!draft.stagePresence || typeof draft.stagePresence !== 'object' || Array.isArray(draft.stagePresence)) {
      draft.stagePresence = {
        lastSeenActors: {},    // name -> { lastSeenRound, status: 'onstage'|'offstage' }
        activeCast: [],        // 本轮在场角色名单
        offstageCast: [],      // 本轮离场角色名单
        currentRound: 0
      };
    }
    return draft.stagePresence;
  }

  /**
   * 从消息与正文中提取提及/出场的已知角色
   */
  function detectActorsInText(text, knownActors) {
    if (!text || typeof text !== 'string' || !Array.isArray(knownActors)) return [];
    const detected = [];
    knownActors.forEach(name => {
      if (name && text.includes(name)) {
        detected.push(name);
      }
    });
    return detected;
  }

  /**
   * 获取系统中所有已知/注册的人物名单
   */
  function getAllKnownActors() {
    const names = new Set();
    // 1. 从 registry 提取
    if (WA.actors && typeof WA.actors.list === 'function') {
      try { (WA.actors.list() || []).forEach(n => names.add(n)); } catch (e) {}
    }
    // 2. 从 store.people 提取
    if (WA.store && typeof WA.store.get === 'function') {
      const st = WA.store.get() || {};
      if (st.people && typeof st.people === 'object') {
        Object.keys(st.people).forEach(k => {
          const nm = String(k).replace(/^p_/, '').trim();
          if (nm) names.add(nm);
        });
      }
      // 3. 从 offstageLife 提取已有档案
      if (st.offstageLife && st.offstageLife.characters) {
        Object.keys(st.offstageLife.characters).forEach(n => names.add(n));
      }
    }
    return Array.from(names);
  }

  /**
   * 1. 舞台聚光灯自动分析：判定本轮在场 (onstage) 与退场 (offstage) 角色
   */
  function sensePresence(ctx) {
    const cfg = settings();
    if (!cfg.enabled || !cfg.autoTrack) {
      noteFault('disabled');
      return { ok: false, reason: 'disabled' };
    }

    const chatArr = (ctx && Array.isArray(ctx.chat)) ? ctx.chat : [];
    const tailMsg = chatArr.length ? chatArr[chatArr.length - 1] : null;
    const mesText = (tailMsg && typeof tailMsg.mes === 'string') ? tailMsg.mes : '';
    const speaker = (tailMsg && tailMsg.name) ? String(tailMsg.name).trim() : '';

    const knownActors = getAllKnownActors();
    const detected = detectActorsInText(mesText, knownActors);
    if (speaker && !detected.includes(speaker)) {
      detected.push(speaker);
    }

    let onstage = detected.slice();
    let offstage = knownActors.filter(n => !onstage.includes(n));

    let scanResult = null;
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(draft => {
        const ps = ensurePresenceStore(draft);
        ps.currentRound = (ps.currentRound || 0) + 1;
        ps.activeCast = onstage;
        ps.offstageCast = offstage;

        onstage.forEach(name => {
          ps.lastSeenActors[name] = {
            round: ps.currentRound,
            status: 'onstage',
            at: (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('stagePresence') : clockNow('stage-presence')
          };
          // 若之前在 offstageLife 中登记，重归正文后重置其 roundsAway
          if (draft.offstageLife && draft.offstageLife.characters && draft.offstageLife.characters[name]) {
            // 保留其 gossip 供重逢谈资使用，但 roundsAway 归零
            draft.offstageLife.characters[name].roundsAway = 0;
          }
        });

        offstage.forEach(name => {
          if (!ps.lastSeenActors[name]) {
            ps.lastSeenActors[name] = {
              round: 0,
              status: 'offstage',
              at: (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('stagePresence') : clockNow('stage-presence')
            };
          } else {
            ps.lastSeenActors[name].status = 'offstage';
          }
          // 自动确保在 offstageLife 中建立档案
          if (draft.offstageLife) {
            draft.offstageLife.characters = draft.offstageLife.characters || {};
            if (!draft.offstageLife.characters[name]) {
              draft.offstageLife.characters[name] = {
                name: name,
                genre: 'generic',
                role: 'dweller',
                place: '街巷各处',
                doing: '料理手头日常杂事',
                factStatus: 'last-known',
                candidateDoing: '料理手头日常杂事',
                carriedItem: '日常随身物',
                weariness: 10,
                spareCoins: 15,
                roundsAway: 1,
                misadventures: [],
                reunionGossip: '',
                offstageSince: clockNow('stage-presence'),
                lastTickAt: clockNow('stage-presence')
              };
            }
          }
        });

        // v2.382.0（死键族）：追踪角色规模改由登记的 maxTrackedActors 生效（此前零消费）。
        //   超限时按登记轮次最旧者挤出 —— 否则 lastSeenActors 会随出场人数无界增长。
        const seenKeys = Object.keys(ps.lastSeenActors || {});
        if (seenKeys.length > cfg.maxTrackedActors) {
          seenKeys.sort(function (a, b) {
            return ((ps.lastSeenActors[a] || {}).round || 0) - ((ps.lastSeenActors[b] || {}).round || 0);
          });
          seenKeys.slice(0, seenKeys.length - cfg.maxTrackedActors).forEach(function (k) {
            delete ps.lastSeenActors[k];
          });
        }

        stat.scans++;
        stat.onstageCount = onstage.length;
        scanResult = {
          round: ps.currentRound,
          onstage: onstage,
          offstage: offstage
        };
      }, 'stagePresence:sensePresence');
    }

    return scanResult ? { ok: true, data: scanResult } : { ok: false, reason: 'transact-failed' };
  }

  /**
   * 2. 退场角色每轮后台自主运转中枢：每轮正文对话完毕，退场角色自主过日子
   */
  function tickOffstageAutonomy(opts) {
    const cfg = settings();
    if (!cfg.enabled || !cfg.autonomousTick) {
      noteFault('disabled');
      return { ok: false, reason: 'disabled' };
    }

    if (!WA.store || typeof WA.store.transact !== 'function') {
      noteFault('store-unavailable');
      return { ok: false, reason: 'store-unavailable' };
    }

    let result = { progressedCount: 0, eventsTriggered: [] };

    WA.store.transact(draft => {
      const ps = ensurePresenceStore(draft);
      const b = draft.offstageLife;
      if (!b || !b.characters) return;

      const offstageList = ps.offstageCast.length ? ps.offstageCast : Object.keys(b.characters).filter(n => !ps.activeCast.includes(n));
      const presetPool = (WA.offstageLife && WA.offstageLife.GENRE_PRESETS) ? WA.offstageLife.GENRE_PRESETS : null;

      offstageList.forEach(name => {
        const card = b.characters[name];
        if (!card) return;

        // 离场轮次累加
        card.roundsAway = (card.roundsAway || 0) + 1;
        card.lastTickAt = (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('stagePresence') : clockNow('stage-presence');

        const genre = card.genre || 'generic';
        const genreData = (presetPool && presetPool[genre]) ? presetPool[genre] : (presetPool && presetPool.generic);
        const archetypes = (genreData && genreData.archetypes) ? genreData.archetypes : {};
        const archKeys = Object.keys(archetypes);

        // 如果作息空白，赋予符合题材的身份与活动
        if (archKeys.length > 0) {
          const currentArch = archetypes[card.role] || archetypes[archKeys[0]];
          if (currentArch) {
            card.candidateDoing = currentArch.doing;
            if (!card.place || card.place === '地点未知' || card.place === '街巷各处') {
              card.place = currentArch.place;
            }
          }
        }

        // 积累日常生计磨损 (精力与零钱花销)
        const wearRate = cfg.wearinessRate || 1.0;
        card.weariness = Math.min(100, Math.max(0, (card.weariness || 10) + Math.round(5 * wearRate)));
        if (card.roundsAway % 3 === 0 && card.spareCoins > 2) {
          card.spareCoins = Math.max(0, card.spareCoins - 2); // 日常茶水干粮花销
        }

        // 概率触发题材生活小糗事/市井小插曲 (misadventures)
        const misChance = cfg.misadventureChance || 0.35;
        if (WA.rand.next('stage-presence') < misChance && genreData && Array.isArray(genreData.misadventures) && genreData.misadventures.length > 0) {
          const pool = genreData.misadventures;
          const chosen = pool[Math.floor(WA.rand.next('stage-presence') * pool.length)];
          if (chosen && card.misadventures.indexOf(chosen) < 0) {
            card.misadventures = (card.misadventures || []).concat([chosen]).slice(-5);
            card.reunionGossip = chosen;
            card.factStatus = 'reported';
            b.log = b.log || [];
            b.log.push({ who: name, event: chosen, at: card.lastTickAt });
            result.eventsTriggered.push({ who: name, event: chosen });
          }
        }

        result.progressedCount++;
        stat.offstageTicks++;
      });
    }, 'stagePresence:tickOffstageAutonomy');

    return { ok: true, data: result };
  }

  /**
   * 3. 唤醒退场角色重逢/被提及切片
   */
  function awakenReunion(who) {
    const cfg = settings();
    if (!cfg.enabled) {
      noteFault('disabled');
      return { ok: false, reason: 'disabled' };
    }
    const name = cleanStr(who, 40);
    if (!name) {
      noteFault('missing-who');
      return { ok: false, reason: 'missing-who' };
    }

    if (!WA.store || typeof WA.store.get !== 'function') {
      return { ok: false, reason: 'store-unavailable' };
    }
    const st = WA.store.get() || {};
    const card = st.offstageLife && st.offstageLife.characters && st.offstageLife.characters[name];
    if (!card) {
      noteFault('no-offstage-record');
      return { ok: false, reason: 'no-offstage-record', note: '该角色从未离场或未建档' };
    }

    stat.reunionsAwakened++;
    return {
      ok: true,
      data: {
        who: name,
        genre: card.genre,
        roundsAway: card.roundsAway || 0,
        lastKnownPlace: card.place || '附近街区',
        currentActivity: card.candidateDoing || card.doing || '料理手头事务',
        carriedItem: card.carriedItem || '随身零碎',
        weariness: card.weariness >= 60 ? '面带明显疲惫风尘' : (card.weariness >= 30 ? '微有劳顿之色' : '精神头尚好'),
        spareCoins: card.spareCoins,
        reunionGossip: card.reunionGossip || (card.misadventures.length ? card.misadventures[card.misadventures.length - 1] : ''),
        dialogueCue: card.reunionGossip ? `（刚才的经历：${card.reunionGossip}）` : ''
      }
    };
  }

  /**
   * 4. 构造正文提示词注入块：将离场角色的真实生活动态无缝注入 AI 上下文
   */
  function buildPresenceBlock() {
    const cfg = settings();
    if (!cfg.enabled || !WA.store || typeof WA.store.get !== 'function') return '';
    const st = WA.store.get() || {};
    const ps = st.stagePresence;
    const b = st.offstageLife;
    if (!b || !b.characters) return '';

    const offstageChars = Object.keys(b.characters)
      .map(k => b.characters[k])
      .filter(c => c && c.roundsAway > 0);

    if (!offstageChars.length) return '';

    // 按离场轮次降序排列，取前 5 位活跃幕后角色
    offstageChars.sort((a, b) => (b.roundsAway || 0) - (a.roundsAway || 0));
    const lines = ['【幕后世界动态·退场人物生活参考】（镜头外的人物拥有独立生活，若正文偶遇或提及请自然体现其生计痕迹）：'];

    offstageChars.slice(0, 5).forEach(c => {
      let desc = `· ${c.name}（离场 ${c.roundsAway} 轮）：正在「${c.place || '周边'}」${c.candidateDoing || c.doing || '忙于营生'}`;
      if (c.reunionGossip) {
        desc += `；刚才发生的小插曲：「${c.reunionGossip}」`;
      }
      lines.push(desc);
    });

    return lines.join('\n') + '\n';
  }

  // 注册为工作流节点 (在每轮聊天 AI 回复完毕后自动推进)
  if (WA.workflow && typeof WA.workflow.register === 'function') {
    // 1. Before 链：扫描出场在场名单，注入幕后动态
    WA.workflow.register({
      id: 'stagePresence.scan',
      chain: 'before',
      order: 16,
      critical: false,
      label: '舞台聚光灯·正文在场/离场角色感知',
      async run(ctx) {
        try {
          sensePresence(ctx);
          const block = buildPresenceBlock();
          if (block && ctx && Array.isArray(ctx.injections)) {
            ctx.injections.push({
              source: '幕后生活',
              position: 'after_last_user',
              depth: 2,
              content: block
            });
          }
        } catch (e) {
          // 容错不阻断主链
        }
      }
    });

    // 2. After 链：退场角色后台自动过日子
    WA.workflow.register({
      id: 'stagePresence.advanceOffstage',
      chain: 'after',
      order: 22.5,
      critical: false,
      label: '退场角色自主运转·全题材幕后作息与市井生活流转',
      async run(actx) {
        try {
          tickOffstageAutonomy();
        } catch (e) {
          // 容错不阻断主链
        }
      }
    });
  }

  WA.stagePresence = {
    version: VERSION,
    settings: settings,
    sensePresence: sensePresence,
    tickOffstageAutonomy: tickOffstageAutonomy,
    awakenReunion: awakenReunion,
    buildPresenceBlock: buildPresenceBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  // v2.381.0: 把 __customSettings 接到模块闭包里的覆盖变量上。
  //   此前它是「凭空读一个不存在的属性」，测试却照样往 api 上写它 ——
  //   写进去对 settings() 完全无影响（两套真源）。现在读写同源。
  Object.defineProperty(WA.stagePresence, '__customSettings', {
    configurable: true,
    enumerable: false,
    get: function () { return _customSettings; },
    set: function (v) { _customSettings = (v && typeof v === 'object') ? v : null; }
  });

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/stage-presence.js', { kind: 'engine', ver: VERSION });
  }
})();
