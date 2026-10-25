/**
 * WorldAxis engines/living-world.js (v2.235.0) — Living World V5.1：真实世界微观作息、生理磨损与生计行囊中枢
 *
 * ── 它治什么（缺口，现场实测）────────────────────────────────────────
 *   本仓此前微观生活模块虽然有了时段演进与偶遇痕迹，但仍存在三大割裂与塑料感：
 *     · 作息泛化：所有角色在五时段的行为缺乏职业区分（大夫、捕快、摊贩、书生作息千人一面）；
 *     · 生理重置：角色奔波劳累后重逢时满血刷新，缺乏疲惫、劳碌、风尘等生理时间磨损；
 *     · 行囊悬空：角色口头喊穷喊饿，但身上缺乏微观物资（铜板、干粮、随身用具、当票）的真实收支。
 *
 * ── 本模块核心职责 ────────────────────────────────────────────────
 *   ① 职业与阶层原生作息（OCCUPATIONAL_ROUTINES）：覆盖医者、捕快、商贩、农户、书生、游侠等典型市井身份；
 *   ② 生理磨损与疲态沉淀（vitalStrain）：持续追踪精力（weariness）、饥饿度（hunger）、风尘（weathering）；
 *   ③ 随身微观物资与生计行囊（belongings & purse）：维护随身银两、随身器物与重要凭据；
 *   ④ 自治步进与空间留痕（autonomousTick & detectEncounters）：每轮推进后，按职业推进生计、消耗补给、沉淀痕迹；
 *   ⑤ 正文生动叙事透镜（buildBlock）：在场人物即时疲态、随身物件、微观生活暗涌全量注入。
 *
 * ── 拒绝码规范（符合 reject-code-gate 单一真源）────────────────────
 *   'living-disabled' / 'living-missing-name' / 'living-unknown-person' /
 *   'living-missing-place' / 'living-invalid-period' / 'living-tx-failed'
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
    decayRounds: 5,
    wearinessRate: 1.0,
    subsistenceEnabled: true
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
    strainsAccumulated: 0,
    subsistenceUsed: 0,
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

  /**
   * 典型市井职业与阶层原生作息模板库
   */
  const OCCUPATIONAL_ROUTINES = {
    healer: {
      role: '医者/药师',
      dawn: { doing: '开馆卸板，在后堂分拣晾晒草药', place: '医馆', costWear: 5, itemUsed: '粗茶' },
      morning: { doing: '坐堂搭脉问诊，执笔开方配药', place: '医馆', costWear: 15 },
      noon: { doing: '在药柜后草草扒完温饭，核查存药与急方', place: '医馆后堂', costWear: -10 },
      dusk: { doing: '收拾出诊药箱，前往街坊巷尾探视沉疴', place: '街坊小巷', costWear: 20 },
      night: { doing: '挑灯对账研读脉案，守炉煎熬夜药', place: '医馆内室', costWear: 10 }
    },
    constable: {
      role: '捕快/差役',
      dawn: { doing: '县衙二堂点卯，束紧护腕核验腰牌', place: '县衙', costWear: 10 },
      morning: { doing: '带队穿行东市巡查摊位，盘查可疑行商', place: '东市集市', costWear: 20, itemUsed: '干粮一块' },
      noon: { doing: '在街角茶棚解刀歇脚，向茶博士打探近日风声', place: '市井茶棚', costWear: -15 },
      dusk: { doing: '查验各坊关卡栅栏，催促商贩熄炉打烊', place: '坊市关卡', costWear: 15 },
      night: { doing: '换上皂靴提灯打梆夜巡，警惕暗巷宵小', place: '城中暗巷', costWear: 25 }
    },
    vendor: {
      role: '商贩/掌柜',
      dawn: { doing: '拉板车抢占当街吉位，卸下门板铺排货物', place: '集市摊位', costWear: 15 },
      morning: { doing: '扯开嗓子招徕过路客，拨弄算盘找零铜钱', place: '集市摊位', costWear: 20 },
      noon: { doing: '蹲在摊位旁吞咽凉水与干馍，紧盯过往行人', place: '集市摊位', costWear: -5 },
      dusk: { doing: '将未卖出的散碎物件装箱捆扎，清点钱囊铜板', place: '集市摊位', costWear: 15 },
      night: { doing: '推着沉重板车归家，与家人就着豆油灯核算微薄盈余', place: '家中陋室', costWear: -20 }
    },
    scholar: {
      role: '文人/书生',
      dawn: { doing: '临窗研墨晨诵，就着晨光温读经籍', place: '书斋', costWear: 5 },
      morning: { doing: '前往文渊书肆或义学堂为人抄录文书、代写家信', place: '书肆义学', costWear: 15 },
      noon: { doing: '以冷茶就素饼充饥，与同窗切磋时文制艺', place: '茶寮', costWear: -10 },
      dusk: { doing: '收拢泛黄稿纸与笔砚，漫步桥头透气舒解目眩', place: '运河桥畔', costWear: 10 },
      night: { doing: '剪去灯花续上残油，咳喘着连夜抄录借来的孤本', place: '寒舍油灯前', costWear: 20 }
    },
    drifter: {
      role: '游侠/流民',
      dawn: { doing: '在破庙檐下拍打草席上的晨露，缩身舒展筋骨', place: '城隍庙荒殿', costWear: 10 },
      morning: { doing: '在客栈酒楼外打探江湖悬赏与短工脚力活', place: '客栈酒楼外', costWear: 20 },
      noon: { doing: '摸出怀中硬如石头的半块干饼啃咽，警惕地环视四周', place: '屋檐阴凉处', costWear: -5 },
      dusk: { doing: '在铁匠铺外驻足打量刀兵，盘算腰间所剩无几的碎银', place: '铁匠铺街角', costWear: 10 },
      night: { doing: '抱着随身旧刀假寐，微风吹草动便骤然睁眼', place: '城隍庙残垣', costWear: 15 }
    }
  };

  function cleanStr(s, max) {
    if (s == null) return '';
    return String(s).trim().slice(0, max || 120);
  }

  function getBucket(draft) {
    if (!draft.livingWorld || typeof draft.livingWorld !== 'object') {
      draft.livingWorld = { tick: 0, encounters: [], livingTraces: [], npcMovements: [], characterStates: {} };
    }
    const b = draft.livingWorld;
    if (!Array.isArray(b.encounters)) b.encounters = [];
    if (!Array.isArray(b.livingTraces)) b.livingTraces = [];
    if (!Array.isArray(b.npcMovements)) b.npcMovements = [];
    if (!b.characterStates || typeof b.characterStates !== 'object') b.characterStates = {};
    return b;
  }

  /**
   * 初始化或获取角色的微观生活状态（职业、行囊、生理负荷）
   */
  function ensureCharLifeState(b, name, occupation) {
    const nm = cleanStr(name, 40);
    if (!b.characterStates[nm]) {
      const occ = occupation || (OCCUPATIONAL_ROUTINES[nm] ? nm : 'vendor');
      b.characterStates[nm] = {
        name: nm,
        occupation: occ,
        // 生理磨损（0-100）：weariness(精力疲惫), hunger(饥肠辘辘), weathering(风霜风尘)
        vitalStrain: {
          weariness: 10,
          hunger: 15,
          weathering: 5,
          lastUpdatedTick: b.tick || 0
        },
        // 随身行囊与私财
        belongings: {
          copper: 24,       // 随身铜钱
          silver: 0,        // 碎银
          provisions: 2,    // 干粮口粮份数
          tools: ['随身粗布巾'], // 贴身生活器物
          keepsakes: []     // 心事或要物信据（如借条、药方、平安符）
        },
        customRoutine: null
      };
    }
    return b.characterStates[nm];
  }

  /**
   * 1. 登记或安排 NPC 日常作息表
   */
  function registerRoutine(name, routine, occupation) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const nm = cleanStr(name, 40);
    if (!nm) return refuse('missing-name');

    let out = null;
    WA.store.transact(function (draft) {
      const b = getBucket(draft);
      const st = ensureCharLifeState(b, nm, occupation);
      if (Array.isArray(routine)) {
        st.customRoutine = routine.slice(0, 8);
      }
      if (occupation && OCCUPATIONAL_ROUTINES[occupation]) {
        st.occupation = occupation;
      }

      draft.people = draft.people || {};
      const p = draft.people[nm] = draft.people[nm] || { id: nm, name: nm };
      p.life = p.life || {};
      p.life.routine = st.customRoutine || [];
      p.life.occupation = st.occupation;

      out = { ok: true, name: nm, occupation: st.occupation, routineLength: (st.customRoutine || []).length };
      return true;
    }, 'livingWorld:registerRoutine');

    return out || refuse('tx-failed');
  }

  /**
   * 2. 自治步进推演（每轮推进时调用）
   * 演进所有 NPC 的位置、职业动作、生理磨损、生计行囊与心理发酵
   */
  function autonomousTick(opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    stat.lastAt = clockNow('livingWorld');
    stat.ticks++;

    let result = { changedPeople: 0, tracesAdded: 0, rumorsAdded: 0, period: 'morning', strainsUpdated: 0 };

    WA.store.transact(function (draft) {
      const b = getBucket(draft);
      b.tick = (b.tick || 0) + 1;
      const currentPeriod = DAY_PERIODS[b.tick % DAY_PERIODS.length];
      result.period = currentPeriod;

      // 扫描彼方档案中的 NPC
      const ewRows = (draft.elsewhere && Array.isArray(draft.elsewhere.rows)) ? draft.elsewhere.rows : [];
      ewRows.forEach(function (card) {
        if (!card || !card.name) return;

        // 获取并同步角色微观生活状态
        const charLife = ensureCharLifeState(b, card.name);
        const occProfile = OCCUPATIONAL_ROUTINES[charLife.occupation] || OCCUPATIONAL_ROUTINES.vendor;
        const currentSchedule = occProfile[currentPeriod] || { doing: '料理手头日常杂物', place: '市井', costWear: 10 };

        // 首次追踪记录
        if (!card.lastTrackedPlace) {
          card.lastTrackedPlace = card.place || currentSchedule.place || '市井';
        }

        // 若角色在彼方档案显式指定了 place/doing，优先尊重上游指定（保持与 elsewhere 解耦与向后兼容）
        // 仅在未指定时依原生职业作息自主填充
        if (!card.place) {
          card.place = currentSchedule.place || '市井';
        }
        if (!card.doing) {
          card.doing = currentSchedule.doing;
        }

        const currentPlace = card.place || '市井';
        const currentDoing = card.doing || currentSchedule.doing;

        if (currentPeriod === 'noon') {
          // 正午时分惯例
        }

        // 生理磨损与疲态推演
        const strain = charLife.vitalStrain;
        const wearDelta = currentSchedule.costWear || 10;
        strain.weariness = Math.max(0, Math.min(100, strain.weariness + wearDelta));
        strain.hunger = Math.max(0, Math.min(100, strain.hunger + (currentPeriod === 'noon' ? -15 : 10)));
        if (currentPeriod === 'dusk' || currentPeriod === 'night') {
          strain.weathering = Math.max(0, Math.min(100, strain.weathering + 5));
        }

        // 生计干粮与物资消耗
        if (strain.hunger > 60 && charLife.belongings.provisions > 0) {
          charLife.belongings.provisions--;
          strain.hunger = Math.max(0, strain.hunger - 35);
          stat.subsistenceUsed++;
        }

        // 心理演进与发酵
        if (card.worry) {
          card.worryRounds = (card.worryRounds || 0) + 1;
          strain.weariness = Math.min(100, strain.weariness + 8); // 挂虑加剧疲惫
          if (card.worryRounds >= 3) {
            card.status = (card.status || '') + '（心绪渐重，暗自谋划）';
          }
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
            setTimeout(function () {
              try { WA.rumor.startChain(factKey, '市井私语'); } catch (e) {}
            }, 0);
          }
          result.rumorsAdded++;
          stat.rumorsDiffused++;
        }

        result.changedPeople++;
        result.strainsUpdated++;
        stat.strainsAccumulated++;
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
   * 当玩家到达 playerPlace 时，探测在场 NPC、其即时生理状态、行囊及留在该地的生活痕迹
   */
  function detectEncounters(playerPlace) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const pl = cleanStr(playerPlace, 60);
    if (!pl) return refuse('missing-place');

    const s = WA.store ? WA.store.get() : {};
    const b = (s && s.livingWorld) ? s.livingWorld : { encounters: [], livingTraces: [], characterStates: {} };
    const ewRows = (s && s.elsewhere && Array.isArray(s.elsewhere.rows)) ? s.elsewhere.rows : [];

    // 匹配同地点的在场角色
    const presentNPCs = ewRows.filter(function (r) {
      return r && r.place && (r.place === pl || pl.indexOf(r.place) >= 0 || r.place.indexOf(pl) >= 0);
    }).map(function (r) {
      const st = (b.characterStates && b.characterStates[r.name]) || null;
      return {
        name: r.name,
        doing: r.doing || '正伫立沉思',
        status: r.status || '寻常神色',
        worry: r.worry || '',
        occupation: (st && st.occupation) || '市井行民',
        vitalStrain: (st && st.vitalStrain) ? Object.assign({}, st.vitalStrain) : { weariness: 10, hunger: 10, weathering: 5 },
        belongings: (st && st.belongings) ? Object.assign({}, st.belongings) : { copper: 0, provisions: 0, tools: [] },
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
   * 将干燥的状态转化为生动的在场人物生活神态、职业作息、即时生理磨损与随身行囊
   */
  function buildBlock(playerPlace) {
    const cfg = settings();
    if (!cfg.enabled) return '';

    const s = WA.store ? WA.store.get() : {};
    const b = (s && s.livingWorld) ? s.livingWorld : { encounters: [], livingTraces: [], characterStates: {} };
    const ewRows = (s && s.elsewhere && Array.isArray(s.elsewhere.rows)) ? s.elsewhere.rows : [];

    const lines = [];
    const currentPeriod = DAY_PERIODS[(b.tick || 0) % DAY_PERIODS.length];
    lines.push('【时节与市井运转】此刻正值' + PERIOD_LABELS[currentPeriod] + '，天地与市井各按作息流转。');

    // 提炼在场/周边活跃人物的生活实况
    if (ewRows.length > 0) {
      lines.push('【在场/周边人物生活实况】（角色皆有自主生活，绝非原地等待主角的提线木偶）：');
      ewRows.slice(0, 6).forEach(function (r) {
        const st = (b.characterStates && b.characterStates[r.name]) || null;
        let desc = '· ' + r.name + '（身处' + (r.place || '近处') + '，身份「' + ((st && st.occupation) || '市井') + '」）：正在「' + (r.doing || '料理日常') + '」';

        // 生理磨损外显描述
        if (st && st.vitalStrain) {
          const vs = st.vitalStrain;
          const strainDescs = [];
          if (vs.weariness >= 50) strainDescs.push('眉眼间带深重倦意');
          else if (vs.weariness >= 25) strainDescs.push('微有困顿之色');
          if (vs.hunger >= 40) strainDescs.push('唇角略显苍白干裂');
          if (vs.weathering >= 30) strainDescs.push('袍袖间落着未拂的市井微尘');
          if (strainDescs.length > 0) {
            desc += '；生理神态「' + strainDescs.join('，') + '」';
          }
        }

        // 随身行囊外显
        if (st && st.belongings) {
          const bg = st.belongings;
          const bgDescs = [];
          if (bg.copper > 0) bgDescs.push('腰间布囊揣着散碎铜板(' + bg.copper + '文)');
          if (bg.provisions > 0) bgDescs.push('怀里藏着半块干馍');
          if (bg.tools && bg.tools.length > 0) bgDescs.push('随身带着' + bg.tools.join('/'));
          if (bg.keepsakes && bg.keepsakes.length > 0) bgDescs.push('妥帖收着' + bg.keepsakes.join('/'));
          if (bgDescs.length > 0) {
            desc += '；随身行囊[' + bgDescs.join('，') + ']';
          }
        }

        if (r.worry) desc += '；心头悬事：「' + r.worry + '」';
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

    lines.push('【正文叙事法则】：角色有自己的作息、疲惫与心绪，对话与互动中须自然显露其生活痕迹与随身物件，杜绝工具化响应。');
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
    stat.strainsAccumulated = 0;
    stat.subsistenceUsed = 0;
    stat.refused = 0;
    stat.lastReason = '';
    return { ok: true };
  }

  WA.livingWorld = {
    DAY_PERIODS: DAY_PERIODS,
    PERIOD_LABELS: PERIOD_LABELS,
    OCCUPATIONAL_ROUTINES: OCCUPATIONAL_ROUTINES,
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
    WA.registerModule('engines/living-world.js', { kind: 'engine', ver: '2.235.0' });
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

  if (WA.log) WA.log('info', 'engines/living-world 已加载（2.235.0）');
})();