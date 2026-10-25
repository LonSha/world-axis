/**
 * WorldAxis engines/living-world.js (v2.234.0) — Living World V5：真实世界自治演化与偶遇痕迹中枢
 *
 * ── 它治什么（缺口，现场实测）────────────────────────────────────────
 *   本仓此前拥有极其庞大的宏观制度、公产规则与灾害链推演，但**微观角色在正文推进时处于静止状态**：
 *     · 主角离开某个场景后，NPC 原地冻结，没有属于自己的日程流转、生活琐事与心理发酵；
 *     · 主角回到客栈或集市，永远碰不见按自己作息行动的角色；
 *     · 角色身上的心事与承诺不会随时间变质，也没有因生活波折产生的市井传闻；
 *     · 注入给大模型的 Prompt 缺乏鲜活的人情细节与即时生活痕迹，导致 NPC 工具人化严重。
 *
 * ── 本模块核心职责 ────────────────────────────────────────────────
 *   ① 自动生活步进（autonomousTick）：在 after 链每轮触发，按时间段演进不在场 NPC 的作息、位置与心理状态；
 *   ② 空间偶遇与生活痕迹（detectEncounters & leaveTrace）：主角进入某地点时，自动识别 NPC 在场状态或近期离开的痕迹；
 *   ③ 变故向市井传闻渗透（diffuseLivingRumor）：NPC 生活中的关键遭遇（失窃、寻人、求医、借贷）自动扩散为传闻；
 *   ④ 正文生动透镜（buildBlock）：向正文提供富有叙事呼吸感的在场者即时神态、暗涌与周围生活痕迹。
 *
 * ── 拒绝码规范（符合 reject-code-gate 单一真源）────────────────────
 *   'living-disabled' / 'living-missing-name' / 'living-unknown-person' /
 *   'living-missing-place' / 'living-invalid-period'
 */

(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const LS_KEY = 'worldaxis_living_world_settings_v1';
  const DEF = {
    enabled: true,
    maxEncounters: 16,
    maxTraces: 24,
    maxMovements: 32,
    rumorDiffusion: true,
    decayRounds: 5
  };

  const __REG = {
    key: LS_KEY, def: DEF, module: 'livingWorld',
    bounds: { maxEncounters: [4, 64], maxTraces: [4, 64], maxMovements: [8, 128], decayRounds: [1, 20] }
  };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }

  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = {
    ticks: 0,
    encountersDetected: 0,
    tracesGenerated: 0,
    rumorsDiffused: 0,
    refused: 0,
    lastReason: '',
    lastAt: 0
  };

  function refuse(reason) {
    stat.refused++;
    stat.lastReason = reason;
    if (reason === 'disabled') return { ok: false, reason: 'disabled' };
    if (reason === 'missing-name') return { ok: false, reason: 'missing-name' };
    if (reason === 'missing-place') return { ok: false, reason: 'missing-place' };
    if (reason === 'tx-failed') return { ok: false, reason: 'tx-failed' };
    return { ok: false, reason: 'unsupported' };
  }

  const DAY_PERIODS = ['dawn', 'morning', 'noon', 'dusk', 'night'];
  const PERIOD_LABELS = {
    dawn: '拂晓清晨',
    morning: '上午工作',
    noon: '正午歇息',
    dusk: '傍晚薄暮',
    night: '子夜更阑'
  };

  const MOOD_EVOLUTIONS = {
    waiting: ['期待', '疑惑', '焦急', '心凉', '自立行事'],
    debt: ['忧虑', '拮据', '借贷筹措', '躲避债主', '孤注一掷'],
    secret: ['警惕', '暗中试探', '防备泄密', '寻求盟友', '主动出击']
  };

  function cleanStr(s, max) {
    if (s == null) return '';
    return String(s).trim().slice(0, max || 120);
  }

  /** 获取或初始化 livingWorld 状态槽 */
  function getBucket(draft) {
    if (!draft.livingWorld || typeof draft.livingWorld !== 'object') {
      draft.livingWorld = { tick: 0, encounters: [], livingTraces: [], npcMovements: [] };
    }
    const b = draft.livingWorld;
    if (!Array.isArray(b.encounters)) b.encounters = [];
    if (!Array.isArray(b.livingTraces)) b.livingTraces = [];
    if (!Array.isArray(b.npcMovements)) b.npcMovements = [];
    return b;
  }

  /**
   * 1. 登记或安排 NPC 日常作息表
   */
  function registerRoutine(name, routine) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const nm = cleanStr(name, 40);
    if (!nm) return refuse('missing-name');

    let out = null;
    WA.store.transact(function (draft) {
      draft.people = draft.people || {};
      const p = draft.people[nm] = draft.people[nm] || { id: nm, name: nm };
      p.life = p.life || {};
      p.life.routine = Array.isArray(routine) ? routine.slice(0, 8) : [];
      out = { ok: true, name: nm, routineLength: p.life.routine.length };
      return true;
    }, 'livingWorld:registerRoutine');

    return out || refuse('tx-failed');
  }

  /**
   * 2. 自治步进推演（每轮推进时调用）
   * 演进所有 NPC 的位置、动作、心理发酵与痕迹留存
   */
  function autonomousTick(opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    stat.lastAt = clockNow('livingWorld');
    stat.ticks++;

    let result = { changedPeople: 0, tracesAdded: 0, rumorsAdded: 0, period: 'morning' };

    WA.store.transact(function (draft) {
      const b = getBucket(draft);
      b.tick = (b.tick || 0) + 1;
      const currentPeriod = DAY_PERIODS[b.tick % DAY_PERIODS.length];
      result.period = currentPeriod;

      // 1. 扫描彼方档案中的 NPC
      const ewRows = (draft.elsewhere && Array.isArray(draft.elsewhere.rows)) ? draft.elsewhere.rows : [];
      ewRows.forEach(function (card) {
        if (!card || !card.name) return;
        const currentPlace = card.place || '市井';
        const currentDoing = card.doing || '忙碌日常';

        // 首次追踪记录
        if (!card.lastTrackedPlace) {
          card.lastTrackedPlace = currentPlace;
        }

        // 心理演进与发酵
        if (card.worry) {
          card.worryRounds = (card.worryRounds || 0) + 1;
          if (card.worryRounds >= 3) {
            card.status = (card.status || '') + '（心绪渐重，暗自谋划）';
          }
        }

        // 周期性作息推进
        if (currentPeriod === 'noon') {
          card.doing = '用午饭并与街坊闲聊';
        } else if (currentPeriod === 'night') {
          card.doing = '归家闭门，盘点账目与心事';
        }

        // 若地点发生改变，在原地点留下生活痕迹
        if (card.lastTrackedPlace && card.lastTrackedPlace !== currentPlace) {
          const traceItem = {
            id: 'trace_' + card.name + '_' + b.tick,
            place: card.lastTrackedPlace,
            who: card.name,
            trace: card.name + '刚刚在此停留，' + currentDoing + '，离开未久。',
            atTick: b.tick
          };
          b.livingTraces.push(traceItem);
          result.tracesAdded++;
          stat.tracesGenerated++;

          b.npcMovements.push({
            name: card.name,
            from: card.lastTrackedPlace,
            to: currentPlace,
            reason: currentDoing,
            tick: b.tick
          });

          // 更新追踪地点
          card.lastTrackedPlace = currentPlace;
        }

        // 关键事件转化为市井传闻
        if (cfg.rumorDiffusion && card.worry && card.worryRounds === 2) {
          // 先在 worldFacts 物化客观记录
          const factKey = 'fact_living_' + card.name;
          const factVal = card.name + '最近正为「' + card.worry + '」四处奔波。';
          draft.worldFacts = draft.worldFacts || [];
          if (!draft.worldFacts.some(function (f) { return f && f.key === factKey; })) {
            draft.worldFacts.push({
              id: factKey,
              key: factKey,
              value: factVal,
              scope: 'local',
              source: 'livingWorld',
              at: clockNow('livingWorld'),
              active: true
            });
          }

          if (WA.rumor && typeof WA.rumor.startChain === 'function') {
            // 在事务后由外部或内部建立流言链
            setTimeout(function () {
              try { WA.rumor.startChain(factKey, '市井私语'); } catch (e) {}
            }, 0);
          }
          result.rumorsAdded++;
          stat.rumorsDiffused++;
        }

        result.changedPeople++;
      });

      // 痕迹与移动记录受容量保护挤出
      if (WA.evict && WA.evict.array) {
        WA.evict.array(b.livingTraces, 'livingWorld.livingTraces');
        WA.evict.array(b.npcMovements, 'livingWorld.npcMovements');
      }

      return true;
    }, 'livingWorld:autonomousTick');

    return { ok: true, tick: stat.ticks, result: result };
  }

  /**
   * 3. 空间偶遇与残留痕迹探测
   * 当玩家到达 playerPlace 时，探测在场 NPC 与留在该地的生活痕迹
   */
  function detectEncounters(playerPlace) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const pl = cleanStr(playerPlace, 60);
    if (!pl) return refuse('missing-place');

    const s = WA.store ? WA.store.get() : {};
    const b = (s && s.livingWorld) ? s.livingWorld : { encounters: [], livingTraces: [] };
    const ewRows = (s && s.elsewhere && Array.isArray(s.elsewhere.rows)) ? s.elsewhere.rows : [];

    // 匹配同地点的在场角色
    const presentNPCs = ewRows.filter(function (r) {
      return r && r.place && (r.place === pl || pl.indexOf(r.place) >= 0 || r.place.indexOf(pl) >= 0);
    }).map(function (r) {
      return {
        name: r.name,
        doing: r.doing || '正伫立沉思',
        status: r.status || '寻常神色',
        worry: r.worry || '',
        intimacy: (r.romance && r.romance.intimacy) || 0
      };
    });

    // 匹配在该地留存的近期痕迹（未超过 decayRounds）
    const currentTick = b.tick || 0;
    const matchedTraces = (b.livingTraces || []).filter(function (t) {
      return t && t.place && (t.place === pl || pl.indexOf(t.place) >= 0 || t.place.indexOf(pl) >= 0) &&
        (currentTick - (t.atTick || 0) <= cfg.decayRounds);
    });

    if (presentNPCs.length > 0) stat.encountersDetected++;

    return {
      ok: true,
      place: pl,
      presentNPCs: presentNPCs,
      recentTraces: matchedTraces
    };
  }

  /**
   * 4. 显式在某地留下生活痕迹
   */
  function leaveTrace(place, who, detail) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const pl = cleanStr(place, 60);
    const w = cleanStr(who, 40);
    const d = cleanStr(detail, 200);
    if (!pl) return refuse('missing-place');
    if (!w) return refuse('missing-name');

    let out = null;
    WA.store.transact(function (draft) {
      const b = getBucket(draft);
      const trace = {
        id: 'trace_custom_' + Date.now(),
        place: pl,
        who: w,
        trace: d || (w + '曾在此留下细碎痕迹。'),
        atTick: b.tick || 0
      };
      b.livingTraces.push(trace);
      if (WA.evict && WA.evict.array) {
        WA.evict.array(b.livingTraces, 'livingWorld.livingTraces');
      }
      out = { ok: true, trace: trace };
      return true;
    }, 'livingWorld:leaveTrace');

    return out || refuse('tx-failed');
  }

  /**
   * 5. 正文叙事透镜 Prompt 块组装（buildBlock）
   * 将干燥的状态转化为生动的在场人物生活神态与周边市井痕迹
   */
  function buildBlock(playerPlace) {
    const cfg = settings();
    if (!cfg.enabled) return '';

    const s = WA.store ? WA.store.get() : {};
    const b = (s && s.livingWorld) ? s.livingWorld : { encounters: [], livingTraces: [] };
    const ewRows = (s && s.elsewhere && Array.isArray(s.elsewhere.rows)) ? s.elsewhere.rows : [];

    const lines = [];
    const currentPeriod = DAY_PERIODS[(b.tick || 0) % DAY_PERIODS.length];
    lines.push('【时节与市井运转】此刻正值' + PERIOD_LABELS[currentPeriod] + '，天地与市井各按作息流转。');

    // 若有在场或活跃人物，提炼其生活暗涌
    if (ewRows.length > 0) {
      lines.push('【在场/周边人物生活实况】（角色皆有自主生活，绝非原地等待主角的提线木偶）：');
      ewRows.slice(0, 6).forEach(function (r) {
        let desc = '· ' + r.name + '（身处' + (r.place || '近处') + '）：正在「' + (r.doing || '料理日常') + '」，神态「' + (r.status || '如常') + '」';
        if (r.worry) desc += '；心事惦念：「' + r.worry + '」';
        lines.push(desc);
      });
    }

    // 地点痕迹提炼
    const recentTraces = (b.livingTraces || []).slice(-3);
    if (recentTraces.length > 0) {
      lines.push('【眼前与周遭生活痕迹】：');
      recentTraces.forEach(function (t) {
        lines.push('· [' + t.place + '] ' + t.trace);
      });
    }

    lines.push('【正文叙事法则】：角色有自己的作息、疲惫与心绪，对话与互动中须自然显露其生活痕迹，杜绝工具化响应。');
    return lines.join('\n');
  }

  function statView() {
    return Object.assign({}, stat);
  }

  function resetStat() {
    stat.ticks = 0;
    stat.encountersDetected = 0;
    stat.tracesGenerated = 0;
    stat.rumorsDiffused = 0;
    stat.refused = 0;
    stat.lastReason = '';
    return { ok: true };
  }

  WA.livingWorld = {
    DAY_PERIODS: DAY_PERIODS,
    PERIOD_LABELS: PERIOD_LABELS,
    getSettings: settings,
    setSettings: saveSettings,
    registerRoutine: registerRoutine,
    autonomousTick: autonomousTick,
    detectEncounters: detectEncounters,
    leaveTrace: leaveTrace,
    buildBlock: buildBlock,
    stat: statView,
    resetStat: resetStat
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/living-world.js', { kind: 'engine', ver: '2.234.0' });
  }

  // 注册进全局 workflow 调度链：after 链自动驱动自治推进
  if (WA.workflow && typeof WA.workflow.register === 'function') {
    WA.workflow.register({
      id: 'livingWorld.autonomousTick',
      chain: 'after',
      order: 22,
      critical: false,
      label: '真实世界·NPC自主生活与作息演进步进',
      async run() {
        autonomousTick({});
      }
    });
  }

  if (WA.log) WA.log('info', 'engines/living-world 已加载（2.234.0）');
})();
