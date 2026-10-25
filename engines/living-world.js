/**
 * WorldAxis engines/living-world.js (v2.236.0) — Living World V5.2：真实世界全景自治演化中枢
 *
 * ── 核心职责全景 ──────────────────────────────────────────────────
 *   ① 原生职业作息网格（OCCUPATIONAL_ROUTINES）：医者/捕快/商贩/书生/游侠阶层行为；
 *   ② 生理磨损与疲态沉淀（vitalStrain）：精力疲惫/饥渴度/市井风尘动态增减与生计干粮补给；
 *   ③ 随身生计行囊（belongings）：铜钱/碎银/干粮/贴身器物/信据凭条真实收支；
 *   ④ 空间痕迹物理半衰期（decayTraces）：痕迹随时间推移逐渐冷却、风化、被掌柜清扫；
 *   ⑤ NPC之间横向社交碰撞（resolveIntersections）：主角不在场时，同处一室的NPC发生真实互动交集；
 *   ⑥ 市井生活窘迫微情境（vignettes）：偶遇时撞见角色数铜钱、当铺犹豫、小二催账等生动瞬间；
 *   ⑦ 认知视界与情报时差（epistemicGaps）：城东变故通过市井传闻慢速传导，角色保持信息不对称；
 *   ⑧ 玩家交互反向生活轨迹偏折（deflectTrajectory）：正文转交物资或解决危机后，NPC立即切换作息动因；
 *   ⑨ 重大离场历程向终身记忆沉淀（consolidateLivingMemory）：重大经历写回 actors/profile；
 *   ⑩ 正文叙事透镜（buildBlock）：全景多层次注入在场者神态、行囊、微观暗涌与周遭痕迹。
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
    maxIntersections: 16,
    maxVignettes: 16,
    maxGaps: 16,
    rumorDiffusion: true,
    decayRounds: 5,
    wearinessRate: 1.0,
    subsistenceEnabled: true,
    peerInteractions: true
  };

  const __REG = {
    key: LS_KEY, def: DEF, module: 'livingWorld',
    bounds: {
      maxEncounters: [4, 64], maxTraces: [4, 64], maxMovements: [8, 128],
      maxIntersections: [4, 64], maxVignettes: [4, 64], maxGaps: [4, 64],
      decayRounds: [1, 20]
    }
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
    tracesDecayed: 0,
    rumorsDiffused: 0,
    strainsAccumulated: 0,
    subsistenceUsed: 0,
    intersectionsResolved: 0,
    vignettesTriggered: 0,
    trajectoriesDeflected: 0,
    memoriesConsolidated: 0,
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

  const VIGNETTE_TEMPLATES = [
    { type: 'financial_pinch', desc: '正把衣袖翻出，小心翼翼地数着手心仅有的几个发黑铜板，眉头紧锁' },
    { type: 'pawn_hesitation', desc: '站在当铺高柜外攥紧怀中的旧物，迟迟没有迈步，神情颇多挣扎' },
    { type: 'merchant_haggling', desc: '正为几文钱的零碎与摊主争执不下，语气焦灼却又不得不据理力争' },
    { type: 'weary_slumber', desc: '靠在廊柱或长凳边缘闭目小憩，手里仍下意识紧紧护着包裹' }
  ];

  function cleanStr(s, max) {
    if (s == null) return '';
    return String(s).trim().slice(0, max || 120);
  }

  function getBucket(draft) {
    if (!draft.livingWorld || typeof draft.livingWorld !== 'object') {
      draft.livingWorld = {
        tick: 0,
        encounters: [],
        livingTraces: [],
        npcMovements: [],
        characterStates: {},
        intersections: [],
        epistemicGaps: [],
        vignettes: []
      };
    }
    const b = draft.livingWorld;
    if (!Array.isArray(b.encounters)) b.encounters = [];
    if (!Array.isArray(b.livingTraces)) b.livingTraces = [];
    if (!Array.isArray(b.npcMovements)) b.npcMovements = [];
    if (!Array.isArray(b.intersections)) b.intersections = [];
    if (!Array.isArray(b.epistemicGaps)) b.epistemicGaps = [];
    if (!Array.isArray(b.vignettes)) b.vignettes = [];
    if (!b.characterStates || typeof b.characterStates !== 'object') b.characterStates = {};
    return b;
  }

  function ensureCharLifeState(b, name, occupation) {
    const nm = cleanStr(name, 40);
    if (!b.characterStates[nm]) {
      const occ = occupation || (OCCUPATIONAL_ROUTINES[nm] ? nm : 'vendor');
      b.characterStates[nm] = {
        name: nm,
        occupation: occ,
        vitalStrain: {
          weariness: 10,
          hunger: 15,
          weathering: 5,
          lastUpdatedTick: b.tick || 0
        },
        belongings: {
          copper: 24,
          silver: 0,
          provisions: 2,
          tools: ['随身粗布巾'],
          keepsakes: []
        },
        customRoutine: null
      };
    }
    return b.characterStates[nm];
  }

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
   * 玩家正文交互反向偏折 NPC 生活动因（deflectTrajectory）
   */
  function deflectTrajectory(name, newGoal, newDoing, options) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const nm = cleanStr(name, 40);
    if (!nm) return refuse('missing-name');
    const opts = options || {};

    let out = null;
    WA.store.transact(function (draft) {
      const b = getBucket(draft);
      const st = ensureCharLifeState(b, nm);
      const ewRows = (draft.elsewhere && Array.isArray(draft.elsewhere.rows)) ? draft.elsewhere.rows : [];
      const card = ewRows.find(function (c) { return c && c.name === nm; });

      if (card) {
        if (newGoal) card.goal = cleanStr(newGoal, 80);
        if (newDoing) card.doing = cleanStr(newDoing, 80);
        if (opts.clearWorry) card.worry = '';
        if (opts.newPlace) card.place = cleanStr(opts.newPlace, 60);
      }

      // 若有物资赠予或交易，更新行囊
      if (opts.giveSilver) st.belongings.silver = (st.belongings.silver || 0) + opts.giveSilver;
      if (opts.giveCopper) st.belongings.copper = (st.belongings.copper || 0) + opts.giveCopper;
      if (opts.giveProvisions) st.belongings.provisions = (st.belongings.provisions || 0) + opts.giveProvisions;
      if (opts.giveItem) st.belongings.tools.push(cleanStr(opts.giveItem, 40));

      stat.trajectoriesDeflected++;
      out = { ok: true, name: nm, newDoing: newDoing, belongings: st.belongings };
      return true;
    }, 'livingWorld:deflectTrajectory');

    return out || refuse('tx-failed');
  }

  /**
   * 离场重大转折向宿主核心记忆沉淀（consolidateLivingMemory）
   */
  function consolidateLivingMemory(name, memoryText) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const nm = cleanStr(name, 40);
    const mem = cleanStr(memoryText, 160);
    if (!nm) return refuse('missing-name');
    if (!mem) return refuse('missing-place');

    let out = null;
    WA.store.transact(function (draft) {
      draft.people = draft.people || {};
      const p = draft.people[nm] = draft.people[nm] || { id: nm, name: nm };
      p.profile = p.profile || {};
      p.profile.memory = Array.isArray(p.profile.memory) ? p.profile.memory : [];
      p.profile.memory.push(mem);
      if (p.profile.memory.length > 25) {
        p.profile.memory.shift();
      }

      stat.memoriesConsolidated++;
      out = { ok: true, name: nm, memory: mem };
      return true;
    }, 'livingWorld:consolidateLivingMemory');

    return out || refuse('tx-failed');
  }

  /**
   * 自治步进推演（每轮推进时自动触发）
   */
  function autonomousTick(opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    stat.lastAt = clockNow('livingWorld');
    stat.ticks++;

    let result = {
      changedPeople: 0,
      tracesAdded: 0,
      tracesDecayed: 0,
      rumorsAdded: 0,
      period: 'morning',
      strainsUpdated: 0,
      intersectionsCount: 0,
      vignettesCount: 0
    };

    WA.store.transact(function (draft) {
      const b = getBucket(draft);
      b.tick = (b.tick || 0) + 1;
      const currentPeriod = DAY_PERIODS[b.tick % DAY_PERIODS.length];
      result.period = currentPeriod;

      const ewRows = (draft.elsewhere && Array.isArray(draft.elsewhere.rows)) ? draft.elsewhere.rows : [];

      // 1. 扫描与演化角色
      ewRows.forEach(function (card) {
        if (!card || !card.name) return;

        const charLife = ensureCharLifeState(b, card.name);
        const occProfile = OCCUPATIONAL_ROUTINES[charLife.occupation] || OCCUPATIONAL_ROUTINES.vendor;
        const currentSchedule = occProfile[currentPeriod] || { doing: '料理手头日常杂物', place: '市井', costWear: 10 };

        if (!card.lastTrackedPlace) {
          card.lastTrackedPlace = card.place || currentSchedule.place || '市井';
        }

        if (!card.place) card.place = currentSchedule.place || '市井';
        if (!card.doing) card.doing = currentSchedule.doing;

        const currentPlace = card.place || '市井';
        const currentDoing = card.doing || currentSchedule.doing;

        if (currentPeriod === 'noon') {
          // 正午时分惯例
        }

        // 生理磨损推演
        const strain = charLife.vitalStrain;
        const wearDelta = currentSchedule.costWear || 10;
        strain.weariness = Math.max(0, Math.min(100, strain.weariness + wearDelta));
        strain.hunger = Math.max(0, Math.min(100, strain.hunger + (currentPeriod === 'noon' ? -15 : 10)));
        if (currentPeriod === 'dusk' || currentPeriod === 'night') {
          strain.weathering = Math.max(0, Math.min(100, strain.weathering + 5));
        }

        // 生计干粮补给
        if (strain.hunger > 60 && charLife.belongings.provisions > 0) {
          charLife.belongings.provisions--;
          strain.hunger = Math.max(0, strain.hunger - 35);
          stat.subsistenceUsed++;
        }

        // 心事发酵
        if (card.worry) {
          card.worryRounds = (card.worryRounds || 0) + 1;
          strain.weariness = Math.min(100, strain.weariness + 8);
          if (card.worryRounds >= 3) {
            card.status = (card.status || '') + '（心绪渐重，暗自谋划）';
          }
        }

        // 地点漂移留痕
        if (card.lastTrackedPlace && card.lastTrackedPlace !== currentPlace) {
          const traceItem = {
            id: 'trace_' + card.name + '_' + b.tick,
            place: card.lastTrackedPlace,
            who: card.name,
            trace: card.name + '刚刚在此停留，' + currentDoing + '，离开未久。',
            atTick: b.tick,
            freshness: 100
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

          card.lastTrackedPlace = currentPlace;
        }

        // 市井传闻转化
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

      // 2. 空间痕迹物理半衰期衰减与掌柜清理
      if (Array.isArray(b.livingTraces)) {
        b.livingTraces.forEach(function (t) {
          if (!t) return;
          const age = b.tick - (t.atTick || 0);
          t.freshness = Math.max(0, 100 - age * 25);
          if (age === 1) {
            t.trace = t.trace.replace('刚刚在此停留', '不久前曾在此停留') + '（余温尚存）';
          } else if (age >= 2 && age < cfg.decayRounds) {
            t.trace = t.trace.replace('离开未久', '已过去数个时辰') + '（痕迹已冷，落有微尘）';
          } else if (age >= cfg.decayRounds) {
            t.trace = '原先留下的痕迹已被伙计扫去，几不可辨。';
            result.tracesDecayed++;
            stat.tracesDecayed++;
          }
        });
      }

      // 3. NPC 之间的横向碰撞与交集结算（resolveIntersections）
      if (cfg.peerInteractions && ewRows.length >= 2) {
        const placeGroups = {};
        ewRows.forEach(function (r) {
          if (!r || !r.place) return;
          placeGroups[r.place] = placeGroups[r.place] || [];
          placeGroups[r.place].push(r);
        });

        Object.keys(placeGroups).forEach(function (pl) {
          const peers = placeGroups[pl];
          if (peers.length >= 2) {
            const p1 = peers[0];
            const p2 = peers[1];
            const interItem = {
              id: 'inter_' + p1.name + '_' + p2.name + '_' + b.tick,
              place: pl,
              participants: [p1.name, p2.name],
              summary: p1.name + '与' + p2.name + '在' + pl + '照面交谈，互通了手头生计。',
              tick: b.tick
            };
            b.intersections.push(interItem);
            result.intersectionsCount++;
            stat.intersectionsResolved++;
          }
        });
      }

      // 4. 生活窘迫微情境生成（vignettes）
      ewRows.forEach(function (r) {
        if (!r || !r.name) return;
        const st = b.characterStates[r.name];
        if (st && st.vitalStrain && (st.vitalStrain.weariness >= 40 || st.vitalStrain.hunger >= 50 || r.worry)) {
          const tmpl = VIGNETTE_TEMPLATES[Math.floor(Math.random() * VIGNETTE_TEMPLATES.length)];
          b.vignettes.push({
            name: r.name,
            place: r.place || '近处',
            detail: tmpl.desc,
            tick: b.tick
          });
          result.vignettesCount++;
          stat.vignettesTriggered++;
        }
      });

      // 5. 容量挤出对偶保护
      if (WA.evict && WA.evict.array) {
        WA.evict.array(b.livingTraces, 'livingWorld.livingTraces');
        WA.evict.array(b.npcMovements, 'livingWorld.npcMovements');
        WA.evict.array(b.intersections, 'livingWorld.intersections');
        WA.evict.array(b.epistemicGaps, 'livingWorld.epistemicGaps');
        WA.evict.array(b.vignettes, 'livingWorld.vignettes');
      }

      return true;
    }, 'livingWorld:autonomousTick');

    return { ok: true, tick: stat.ticks, result: result };
  }

  /**
   * 空间偶遇探测（包含同地点在场、近期痕迹、微情境、横向交集）
   */
  function detectEncounters(playerPlace) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const pl = cleanStr(playerPlace, 60);
    if (!pl) return refuse('missing-place');

    const s = WA.store ? WA.store.get() : {};
    const b = (s && s.livingWorld) ? s.livingWorld : { encounters: [], livingTraces: [], characterStates: {}, vignettes: [], intersections: [] };
    const ewRows = (s && s.elsewhere && Array.isArray(s.elsewhere.rows)) ? s.elsewhere.rows : [];

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

    const currentTick = b.tick || 0;
    const matchedTraces = (b.livingTraces || []).filter(function (t) {
      return t && t.place && (t.place === pl || pl.indexOf(t.place) >= 0 || t.place.indexOf(pl) >= 0) &&
        (currentTick - (t.atTick || 0) <= cfg.decayRounds);
    });

    const matchedVignettes = (b.vignettes || []).filter(function (v) {
      return v && v.place && (v.place === pl || pl.indexOf(v.place) >= 0 || v.place.indexOf(pl) >= 0);
    });

    const matchedIntersections = (b.intersections || []).filter(function (i) {
      return i && i.place && (i.place === pl || pl.indexOf(i.place) >= 0 || i.place.indexOf(pl) >= 0);
    });

    if (presentNPCs.length > 0) stat.encountersDetected++;

    return {
      ok: true,
      place: pl,
      presentNPCs: presentNPCs,
      recentTraces: matchedTraces,
      vignettes: matchedVignettes,
      intersections: matchedIntersections
    };
  }

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
        atTick: b.tick || 0,
        freshness: 100
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
   * 正文全景叙事透镜（buildBlock）
   */
  function buildBlock(playerPlace) {
    const cfg = settings();
    if (!cfg.enabled) return '';

    const s = WA.store ? WA.store.get() : {};
    const b = (s && s.livingWorld) ? s.livingWorld : { encounters: [], livingTraces: [], characterStates: {}, vignettes: [], intersections: [] };
    const ewRows = (s && s.elsewhere && Array.isArray(s.elsewhere.rows)) ? s.elsewhere.rows : [];

    const lines = [];
    const currentPeriod = DAY_PERIODS[(b.tick || 0) % DAY_PERIODS.length];
    lines.push('【时节与市井运转】此刻正值' + PERIOD_LABELS[currentPeriod] + '，天地与市井各按作息流转。');

    if (ewRows.length > 0) {
      lines.push('【在场/周边人物生活实况】（角色皆有自主生活，绝非原地等待主角的提线木偶）：');
      ewRows.slice(0, 6).forEach(function (r) {
        const st = (b.characterStates && b.characterStates[r.name]) || null;
        let desc = '· ' + r.name + '（身处' + (r.place || '近处') + '，身份「' + ((st && st.occupation) || '市井') + '」）：正在「' + (r.doing || '料理日常') + '」';

        if (st && st.vitalStrain) {
          const vs = st.vitalStrain;
          const strainDescs = [];
          if (vs.weariness >= 50) strainDescs.push('眉眼间带深重倦意');
          else if (vs.weariness >= 25) strainDescs.push('微有困顿之色');
          if (vs.hunger >= 40) strainDescs.push('唇角略显苍白干裂');
          if (vs.weathering >= 30) strainDescs.push('袍袖间落着未拂的市井微尘');
          if (strainDescs.length > 0) desc += '；生理神态「' + strainDescs.join('，') + '」';
        }

        if (st && st.belongings) {
          const bg = st.belongings;
          const bgDescs = [];
          if (bg.copper > 0) bgDescs.push('腰间布囊揣着散碎铜板(' + bg.copper + '文)');
          if (bg.provisions > 0) bgDescs.push('怀里藏着半块干馍');
          if (bg.tools && bg.tools.length > 0) bgDescs.push('随身带着' + bg.tools.join('/'));
          if (bg.keepsakes && bg.keepsakes.length > 0) bgDescs.push('妥帖收着' + bg.keepsakes.join('/'));
          if (bgDescs.length > 0) desc += '；随身行囊[' + bgDescs.join('，') + ']';
        }

        if (r.worry) desc += '；心头悬事：「' + r.worry + '」';
        lines.push(desc);
      });
    }

    // 市井生活窘迫微情境注入
    const recentVignettes = (b.vignettes || []).slice(-2);
    if (recentVignettes.length > 0) {
      lines.push('【市井生活微情境】：');
      recentVignettes.forEach(function (v) {
        lines.push('· ' + v.name + '身处' + v.place + '，' + v.detail + '。');
      });
    }

    // NPC 横向碰撞交集注入
    const recentIntersections = (b.intersections || []).slice(-2);
    if (recentIntersections.length > 0) {
      lines.push('【人物间横向生活交集】：');
      recentIntersections.forEach(function (i) {
        lines.push('· [' + i.place + '] ' + i.summary);
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
    stat.tracesDecayed = 0;
    stat.rumorsDiffused = 0;
    stat.strainsAccumulated = 0;
    stat.subsistenceUsed = 0;
    stat.intersectionsResolved = 0;
    stat.vignettesTriggered = 0;
    stat.trajectoriesDeflected = 0;
    stat.memoriesConsolidated = 0;
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
    deflectTrajectory: deflectTrajectory,
    consolidateLivingMemory: consolidateLivingMemory,
    autonomousTick: autonomousTick,
    detectEncounters: detectEncounters,
    leaveTrace: leaveTrace,
    buildBlock: buildBlock,
    stat: statView,
    resetStat: resetStat
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/living-world.js', { kind: 'engine', ver: '2.236.0' });
  }

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

  if (WA.log) WA.log('info', 'engines/living-world 已加载（2.236.0）');
})();