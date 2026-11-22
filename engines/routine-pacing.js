/** 身份节律提供候选，人物经历、选择与事实拥有最终解释权。 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_routine_pacing_settings_v1';
  const DEF = {
    enabled: true,
    maxActors: 48,
    maxHistory: 32,
    defaultPreset: 'general_freelance',
    autoInjectPrompt: true
  };
  const __REG = {
    key: LS_KEY, def: DEF, module: 'routinePacing',
    bounds: { maxActors: [6, 120], maxHistory: [10, 100] }
  };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = Object.assign({}, DEF);
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
                          : Object.assign(base, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})))
      : Object.assign({}, settings(), next || {});
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = {
    evaluations: 0,
    deviations: 0,
    advances: 0,
    profilesUpdated: 0,
    injections: 0,
    lastReason: '',
    faults: {}
  };
  function noteFault(code) {
    stat.faults[code] = (stat.faults[code] || 0) + 1;
    stat.lastReason = code;
  }
  function cleanText(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80);
  }
  function clamp(val, min, max, def) {
    const n = Number(val);
    if (!Number.isFinite(n)) return def;
    return Math.max(min, Math.min(max, n));
  }

  // ── 八大生活时序时段（Circadian Slots）───────────────────────────────────────
  const SLOTS = [
    { id: 'dawn_early', label: '清晨早起/早读', timeHint: '06:00 - 07:45', period: 'morning' },
    { id: 'morning_core', label: '上午主课/核心劳作', timeHint: '07:45 - 11:45', period: 'morning' },
    { id: 'lunch_break', label: '正午饭点/趴桌补觉', timeHint: '11:45 - 13:45', period: 'noon' },
    { id: 'afternoon_core', label: '下午正事/自习劳作', timeHint: '13:45 - 17:30', period: 'afternoon' },
    { id: 'dinner_break', label: '黄昏晚饭/闲庭放风', timeHint: '17:30 - 19:00', period: 'dusk' },
    { id: 'evening_study', label: '晚自习/加班攻坚', timeHint: '19:00 - 21:30', period: 'evening' },
    { id: 'night_leisure', label: '放学放工/黄金休闲', timeHint: '21:30 - 23:00', period: 'night' },
    { id: 'late_sleep', label: '深夜熄灯/入眠夜聊', timeHint: '23:00 - 次日清晨', period: 'night' }
  ];

  // ── 世界观与社会身份模板库（Identity Archetype Presets）───────────────────────────
  const WORLD_PRESETS = {
    // 1. 中国高压中学（学生、高三、早自习、晚自习、周六常态补课）
    cn_high_school: {
      name: '中国全日制高中',
      weekendHasSchool: true, // 周六全天/半天常态上课或周测
      expectations: {
        dawn_early: '早自习赶到教室背诵古文单词，值日生扫地，课桌堆满练习册',
        morning_core: '四节连堂正课，黑板写满板书，班主任窗外巡视，大课间眼保健操与跑操',
        lunch_break: '下课铃响猛冲食堂排队打饭，狼吞虎咽，吃完趴在课桌上补觉20分钟',
        afternoon_core: '下午连轴转刷题讲卷，风扇转动昏昏欲睡，提神风油精与红笔订正',
        dinner_break: '傍晚校门口或食堂解决晚饭，买烤肠奶茶，走廊栏杆边吹风透气',
        evening_study: '两到三节晚自习，教室只有沙沙写字声，值班老师答疑或班主任盯梢',
        night_leisure: '晚自习放学背着沉重书包出校门，路边摊吃点炸串夜宵，回寝室洗漱',
        late_sleep: '熄灯就寝，同寝悄声夜聊，或打手电躲在被窝背公式或玩手机'
      }
    },
    // 2. 现代大学校园（弹性作息、选课摸鱼、自由度高、周末逛街聚会）
    college_student: {
      name: '现代大学青年',
      weekendHasSchool: false,
      expectations: {
        dawn_early: '没早八则蒙头大睡，有早八则卡点惊醒，抓起书包奔向教学楼',
        morning_core: '大阶梯教室专业课，前排学霸听讲，后排连排摸鱼刷手机或补觉',
        lunch_break: '三五结伴去一食堂二食堂挑窗口吃麻辣烫盖饭，或回宿舍点外卖',
        afternoon_core: '没课在宿舍躺平打游戏追剧，有课在实验室或多媒体教室做小组作业',
        dinner_break: '相约学校后街小吃店吃黄焖鸡烧烤，在奶茶店买果茶闲逛',
        evening_study: '期末前图书馆爆满抢座刷题，平时在社团活动室或操场夜跑散步',
        night_leisure: '宿舍开黑打排位，追番吃零食，洗漱护肤，跟闺蜜室友八卦八卦',
        late_sleep: '熬夜修仙刷短视频到一两点，戴耳机听音乐，夜深人静昏昏睡去'
      }
    },
    // 3. 职场通勤社畜（早高峰、打卡、外卖、加班、通勤）
    office_worker: {
      name: '现代职场社畜',
      weekendHasSchool: false,
      expectations: {
        dawn_early: '被闹钟连环轰醒，睡眼惺忪挤早高峰地铁公交，手提包子豆浆',
        morning_core: '工位打卡查邮件，晨会开齐，咖啡提神，键盘敲打与表格报表',
        lunch_break: '下楼跟同事拼单便利店便当或商场快餐，吃完在工位趴着闭目养神',
        afternoon_core: '连环跨部门会议、方案修改与需求对接，下午茶摸鱼点奶茶点心',
        dinner_break: '匆忙在公司附近解决便饭，或者看着外卖单发呆，准备加班',
        evening_study: '工位屏幕亮着继续改PPT修Bug，或终于打卡下班挤晚高峰归家',
        night_leisure: '回到出租屋甩掉鞋子瘫倒在沙发上，点外卖刷手机、看剧洗澡',
        late_sleep: '舍不得睡的报复性熬夜，洗澡吹头发，直到眼皮打架撑不住睡去'
      }
    },
    // 4. 玄幻修仙宗门弟子（卯时练剑、吐纳、灵膳、早晚课、洞府闭关）
    cultivation_disciple: {
      name: '玄幻修仙宗门',
      weekendHasSchool: true, // 修行无休
      expectations: {
        dawn_early: '卯时初度，登高迎朝霞吞吐紫气，后山演武场弟子已负剑练招',
        morning_core: '传功堂听长老传授心法经络，或在铸炼堂、百草园当值劳作',
        lunch_break: '未辟谷者聚集灵膳堂抢食玉灵米与灵兽肉，辟谷者打坐调息凝神',
        afternoon_core: '同门切磋演武，执事殿查看悬赏通告，或在丹房药圃辨识灵材',
        dinner_break: '斜阳照山门，落霞满天，弟子在山道闲行交谈或坊市换取丹药',
        evening_study: '藏经阁翻阅古卷残篇，或在论道台聆听师兄师姐讲授实战经验',
        night_leisure: '回到各自居所石室，擦拭佩剑，清点灵石法器，与同门小聚品茗',
        late_sleep: '洞府石门紧闭，点燃凝神香，盘膝打坐周天循环入定或深层入眠'
      }
    },
    // 5. 西幻冒险者与城镇居民（公会委托、酒馆麦酒、街市巡逻）
    fantasy_townsfolk: {
      name: '西幻城邦冒险者',
      weekendHasSchool: false,
      expectations: {
        dawn_early: '面包房烟囱冒烟，集市摊贩摆出新鲜蔬果，教堂钟声悠扬敲响',
        morning_core: '冒险者公会公告栏前挤满佣兵，铁匠铺叮当打铁，卫队巡视街区',
        lunch_break: '路边酒馆买粗麦黑面包与炖菜，坐在喷泉池边吃喝填饱肚子',
        afternoon_core: '出城郊外采集狩猎，或在作坊完成商会订单，运货马车穿梭',
        dinner_break: '黄昏时分归城卸货，公会柜台结算报酬赏金，街巷油灯渐次点亮',
        evening_study: '酒馆热闹喧嚣，麦酒碰撞与鲁特琴弹唱，佣兵吹嘘搏斗经历',
        night_leisure: '酒足饭饱在夜风中漫步石板路，小巷窃窃私语，回旅馆整理行装',
        late_sleep: '巡夜守卫举火把走过，城门落锁，旅馆壁炉余烬微明，安然沉睡'
      }
    },
    // 6. 自由江湖/现代自由人（无固定规章、全凭心意与生计流转）
    general_freelance: {
      name: '自由旅人/江湖闲散',
      weekendHasSchool: false,
      expectations: {
        dawn_early: '随性自然醒或晨起赶路，在街角早点铺慢慢品尝热食',
        morning_core: '处理手头谋生营生，拜访熟人，或在街头茶肆听各路八卦闲聊',
        lunch_break: '挑个顺眼的小饭馆吃顿热乎饭，靠着窗边看人来人往',
        afternoon_core: '外出办事，闲逛市集采买所需杂物，或者寻个静处休憩',
        dinner_break: '找个饭馆小酌一杯，吃碗热汤面，享受黄昏烟火气',
        evening_study: '处理私事、翻看书册账目，或在茶馆瓦舍看戏听评书',
        night_leisure: '走夜市吃小吃，散步吹晚风，与投缘之人长谈对饮',
        late_sleep: '回房歇息，听窗外风声虫鸣，自在入眠'
      }
    }
  };

  const LEISURE_ACTIONS = {};

  function store() {
    return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
  }

  function getSlotById(slotId) {
    for (let i = 0; i < SLOTS.length; i++) {
      if (SLOTS[i].id === slotId) return SLOTS[i];
    }
    return SLOTS[1]; // 默认 morning_core
  }

  // 身份安排是社会期待；以下只返回候选，不写位置、动作或完成事实。
  function evaluateActorRoutine(name, opt) {
    if (typeof name !== 'string' || !name.trim()) return {ok:false, reason:'name-required'};
    const o=opt||{}, st=store(), rp=st.routinePacing||{}, actor=(rp.actors||{})[name];
    if (!actor) return {ok:false, reason:'actor-unconfigured'};
    const wf=rp.worldFrame||{};
    const presetKey=o.preset||actor.preset||wf.preset;
    const preset=WORLD_PRESETS[presetKey];
    if (!preset) return {ok:false, reason:'preset-unconfigured'};
    // 使用剧情 ISO 的本地时分，不转为设备时区，不用现实墙钟冒充剧情时间。
    const stamp=String((st.clock||{}).iso||'');
    const parsed=stamp.match(/T(\d{2}):(\d{2})/);
    const match=parsed && Number(parsed[1])<24 && Number(parsed[2])<60 ? parsed : null;
    let slotId=o.slot||wf.currentSlot;
    if (!o.slot && match) {
      const minute=Number(match[1])*60+Number(match[2]);
      slotId=minute<360||minute>=1380?'late_sleep':minute<465?'dawn_early':minute<705?'morning_core':minute<825?'lunch_break':minute<1050?'afternoon_core':minute<1140?'dinner_break':minute<1290?'evening_study':'night_leisure';
    }
    if (!SLOTS.some(x=>x.id===slotId)) return {ok:false, reason:'time-unconfigured'};
    const slot=getSlotById(slotId), dayType=o.dayType||wf.dayType||'unknown';
    const willingness=clamp(o.willingness!=null?o.willingness:actor.willingness,0,100,70);
    const disposition=actor.disposition||'unspecified';
    const explicit=Object.prototype.hasOwnProperty.call(o,'deviation')?o.deviation:actor.currentDeviation;
    const personal=actor.context||{};
    const needs=((st.humanRealism||{}).actors||{})[name];
    // Read capability from its owner, not a second copy of species presets.
    const exempt = function (dimension) {
      return !!(WA.humanRealism && typeof WA.humanRealism.isExempt === 'function' && WA.humanRealism.isExempt(name, dimension));
    };
    const energyExempt=exempt('energy'), nourishmentExempt=exempt('nourishment');
    const tired=!energyExempt&&needs&&needs.needs&&needs.needs.energy<25;
    const meal=!nourishmentExempt&&(slotId==='lunch_break'||slotId==='dinner_break');
    const sleep=!energyExempt&&slotId==='late_sleep';
    const weekend=['saturday','sunday','weekend'].includes(dayType);
    // 周末是否上课由已登记的校历决定；未知时不自动放假或补课。
    const restDay=weekend&&personal.weekendDuty===false;
    const free=restDay||slotId==='night_leisure'||(energyExempt&&slotId==='late_sleep')||(nourishmentExempt&&(slotId==='lunch_break'||slotId==='dinner_break'));
    let pattern='in_routine', detail='', mindset='身份安排只是外部期待，实际行动以正文与已确认事实为准。';
    const alternatives=[];
    if (explicit) {pattern='explicit_deviation';detail=cleanText(explicit,150);}
    else if (sleep||tired) {pattern='recovery_candidate';detail='优先考虑休息、睡眠或降低活动强度；是否熬夜取决于正在进行的事情与后果。';}
    else if (meal) {pattern='meal_candidate';detail='到了用餐窗口：结合饮食豁免、食物来源、预算及同伴安排，考虑吃饭和短暂休息，不假定已经吃过。';}
    else if (free) {
      pattern='leisure_agency';
      detail=personal.leisurePreference||'在当前世界实际存在、可到达且负担得起的场所，选择休息、兴趣活动、社交或处理私事。';
      if(disposition==='overachiever') alternatives.push('可继续进修，也可能因疲惫选择放松，不能强制刷题。');
      if(disposition==='withdrawn') alternatives.push('可独处，也可与信任的人相处；内向不等于自卑或拒绝所有社交。');
    } else if(willingness<35) {
      pattern='reluctant_candidate';
      detail='对当前职责意愿较低；可能勉强出席、在场走神、协商请假或暂时回避，不能仅凭厌学直接判定逃课。';
      alternatives.push(personal.consequenceConcern?'顾虑：'+personal.consequenceConcern:'需考虑处分、收入、承诺、安全与关系代价。');
    } else {detail='社会安排参考（并非此人已执行）：'+(preset.expectations[slotId]||'依照已知身份安排处理日常事务。');}
    if(weekend&&personal.weekendDuty==null) alternatives.push('周末安排未知：先服从已知校历/排班，不擅自假定补课或放假。');
    if(actor.backstory) alternatives.push('经历依据：'+actor.backstory+'；不能由经历标签推断贫困羞耻、犯罪或固定行为。');
    if(personal.goal) alternatives.push('当前个人目标：'+personal.goal);
    if(personal.obligation) alternatives.push('现实牵挂：'+personal.obligation);
    const context=alternatives.join(' ');
    return {ok:true,name,preset:presetKey,presetName:preset.name,slot:slotId,slotLabel:slot.label,timeHint:slot.timeHint,dayType,disposition,willingness,pattern,detail:detail+(context?' '+context:''),mindset,backstory:actor.backstory||'',status:'candidate',timeSource:match?'story-iso':'explicit-frame',summary:name+'：'+detail};
  }

  // ── ActionDesk 写口 1：配置或更新人物的生活节律画像 ─────────────────────────
  function setActorProfile(name, opts) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      noteFault('name-required');
      return { ok: false, error: '必须指定人物名称' };
    }
    const o = opts || {};
    const previous=((store().routinePacing||{}).actors||{})[name]||{};
    const disposition = o.disposition ? cleanText(o.disposition, 30) : (previous.disposition||'slacker');
    const validDispositions = ['hedonist', 'withdrawn', 'overachiever', 'rebel', 'slacker', 'burdened'];
    const chosenDisp = validDispositions.includes(disposition) ? disposition : 'slacker';

    const willingness = clamp(o.willingness != null ? o.willingness : (previous.willingness != null ? previous.willingness : 70), 0, 100, 70);
    const backstory = o.backstory ? cleanText(o.backstory, 120) : '';
    const role = o.role ? cleanText(o.role, 40) : '居民';

    let updatedActor = null;
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        draft.routinePacing = draft.routinePacing || { actors: {}, worldFrame: {}, history: [] };
        draft.routinePacing.actors = draft.routinePacing.actors || {};

        const existing = draft.routinePacing.actors[name] || {};
        const next = {
          name: name,
          role: o.role ? role : (existing.role||role),
          preset: o.preset || existing.preset || null,
          context: Object.assign({}, existing.context||{}, o.context||{}),
          disposition: chosenDisp,
          willingness: willingness,
          backstory: o.backstory !== undefined ? backstory : (existing.backstory || ''),
          currentDeviation: o.deviation !== undefined ? (o.deviation ? cleanText(o.deviation, 120) : null) : (existing.currentDeviation || null),
          lastAction: existing.lastAction || '',
          updatedAt: clockNow('routinePacing')
        };
        draft.routinePacing.actors[name] = next;

        // 容量淘汰
        if (WA.evict && typeof WA.evict.object === 'function') {
          WA.evict.object(draft.routinePacing.actors, 'routinePacing.actors', settings().maxActors);
        }
        updatedActor = next;
      });
    }

    stat.profilesUpdated++;
    return { ok: true, actor: updatedActor };
  }

  // ── ActionDesk 写口 2：推进全局时间时段（Slot Advance）────────────────────────
  function advanceSlot(opts) {
    const o = opts || {};
    let targetSlot = o.slot;
    if (targetSlot && !SLOTS.some(x=>x.id===targetSlot)) return {ok:false,reason:'invalid-slot'};
    const dayType = o.dayType ? cleanText(o.dayType, 20) : null;

    let advanced = null;
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        draft.routinePacing = draft.routinePacing || { actors: {}, worldFrame: {}, history: [] };
        const wf = draft.routinePacing.worldFrame || {
          preset: settings().defaultPreset,
          currentSlot: 'morning_core',
          dayType: 'weekday',
          slotIndex: 1
        };

        if (targetSlot) {
          const match = SLOTS.find(function (s) { return s.id === targetSlot; });
          if (!match) {
            targetSlot = 'morning_core';
          }
        } else {
          // 自然顺延下一个时段
          const curIndex = SLOTS.findIndex(function (s) { return s.id === wf.currentSlot; });
          const nextIndex = (curIndex + 1) % SLOTS.length;
          targetSlot = SLOTS[nextIndex].id;
        }

        wf.currentSlot = targetSlot;
        wf.slotIndex = SLOTS.findIndex(function (s) { return s.id === targetSlot; });
        if (dayType) wf.dayType = dayType;
        draft.routinePacing.worldFrame = wf;
        advanced = Object.assign({}, wf);
      });
    }
    const stNow = (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || {}) : {};
    advanced = advanced || ((stNow.routinePacing && stNow.routinePacing.worldFrame) ? Object.assign({}, stNow.routinePacing.worldFrame) : null);
    stat.advances++;
    return { ok: true, worldFrame: advanced };
  }

  // ── ActionDesk 写口 3：动态调节角色意愿度（如被训斥后不想念书）────────────────────
  function setWillingness(name, deltaOrVal, opts) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      noteFault('name-required');
      return { ok: false, error: '必须指定角色名称' };
    }
    const o = opts || {};
    const isAbsolute = o.absolute === true;
    let nextVal = 70;

    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        draft.routinePacing = draft.routinePacing || { actors: {}, worldFrame: {}, history: [] };
        draft.routinePacing.actors = draft.routinePacing.actors || {};
        const act = draft.routinePacing.actors[name] || { name: name, disposition: 'slacker', willingness: 70 };

        if (isAbsolute) {
          nextVal = clamp(deltaOrVal, 0, 100, 70);
        } else {
          const cur = act.willingness != null ? act.willingness : 70;
          nextVal = clamp(cur + (Number(deltaOrVal) || 0), 0, 100, 70);
        }
        act.willingness = nextVal;
        act.updatedAt = clockNow('routinePacing');
        draft.routinePacing.actors[name] = act;
      });
    }

    return { ok: true, name: name, willingness: nextVal };
  }

  // ── ActionDesk 写口 4：为角色登记临时偏离/特殊行踪 ────────────────────────────
  function setDeviation(name, deviationText) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      noteFault('name-required');
      return { ok: false, error: '必须指定角色名称' };
    }
    const cleanDev = deviationText ? cleanText(deviationText, 120) : null;

    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        draft.routinePacing = draft.routinePacing || { actors: {}, worldFrame: {}, history: [] };
        draft.routinePacing.actors = draft.routinePacing.actors || {};
        const act = draft.routinePacing.actors[name] || { name: name, disposition: 'slacker', willingness: 70 };
        act.currentDeviation = cleanDev;
        act.updatedAt = clockNow('routinePacing');
        draft.routinePacing.actors[name] = act;
      });
    }

    stat.deviations++;
    return { ok: true, name: name, deviation: cleanDev };
  }

  // ── ActionDesk 写口 5：切换世界观生活模板（Preset Switching）────────────────────
  function setWorldPreset(presetKey, opts) {
    if (!WORLD_PRESETS[presetKey]) {
      noteFault('invalid-preset');
      return { ok: false, error: '未知的世界观生活模板: ' + presetKey };
    }
    const o = opts || {};
    if (o.slot && !SLOTS.some(x=>x.id===o.slot)) return {ok:false,reason:'invalid-slot'};
    let wfOut = null;
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        draft.routinePacing = draft.routinePacing || { actors: {}, worldFrame: {}, history: [] };
        const wf = draft.routinePacing.worldFrame || { currentSlot: 'morning_core', dayType: 'weekday' };
        wf.preset = presetKey;
        if (o.dayType) wf.dayType = cleanText(o.dayType, 20);
        if (o.slot) wf.currentSlot = o.slot;
        draft.routinePacing.worldFrame = wf;
        wfOut = Object.assign({}, wf);
      });
    }
    // Nested transaction returns draft projection; wrapper reports deferred/persisted.
    const stNow = (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || {}) : {};
    wfOut = wfOut || ((stNow.routinePacing && stNow.routinePacing.worldFrame) ? Object.assign({}, stNow.routinePacing.worldFrame) : null);
    return { ok: true, worldFrame: wfOut };
  }

  // ── 现算所有已登记角色的动向切片 ──────────────────────────────────────────
  function listActors() {
    const st = store();
    const rp = st.routinePacing || {};
    return Object.keys(rp.actors || {}).map(function (k) {
      return JSON.parse(JSON.stringify(rp.actors[k]));
    });
  }

  // ── 主生成 Prompt 注入层（Build Injection Block）────────────────────────────
  function buildBlock() {
    if (!settings().enabled || !settings().autoInjectPrompt) return '';
    const st = store();
    const rp = st.routinePacing || {};
    const wf = rp.worldFrame || { preset: settings().defaultPreset, currentSlot: 'morning_core', dayType: 'weekday' };
    const actors = rp.actors || {};
    const actorNames = Object.keys(actors);

    if (actorNames.length === 0) return '';
    const lines = ['【时序节律与生活动线】社会安排仅供参考；各人物时段以下列剧情时间评估为准，行动候选不是已发生事实。'];
    actorNames.slice(0, 5).forEach(function (name) {
      const ev = evaluateActorRoutine(name);
      if (ev && ev.ok) lines.push(`- ${name}：【行动候选，非已发生事实；${ev.presetName}；${ev.slotLabel} ${ev.timeHint}】${ev.detail}。${ev.mindset}`);
    });
    stat.injections++;
    return lines.join('\n');
  }

  // ── 诊断与导出挂载 ────────────────────────────────────────────────────────
  function diagnose() {
    const st = store();
    const rp = st.routinePacing || {};
    return {
      enabled: settings().enabled,
      actorsCount: Object.keys(rp.actors || {}).length,
      worldFrame: rp.worldFrame || null,
      stats: Object.assign({}, stat)
    };
  }

  function transactional(fn) {
    return function () {
      if (!WA.store || typeof WA.store.transact !== 'function') return {ok:false, reason:'store-unavailable'};
      const args = arguments;
      const before = Object.assign({}, stat);
      let result;
      const tx = WA.store.transact(function () {
        result = fn.apply(null, args);
        return result && result.ok !== false ? result : false;
      });
      if (!tx || !tx.ok) {
        Object.assign(stat, before);
        return result && result.ok === false ? result : {ok:false, reason:'transaction-rejected'};
      }
      return Object.assign({}, JSON.parse(JSON.stringify(result)), {persisted:tx.persisted, deferred:tx.deferred === true});
    };
  }
  WA.routinePacing = {
    settings: settings,
    saveSettings: saveSettings,
    evaluate: evaluateActorRoutine,
    setActorProfile: transactional(setActorProfile),
    advanceSlot: transactional(advanceSlot),
    setWillingness: transactional(setWillingness),
    setDeviation: transactional(setDeviation),
    setWorldPreset: transactional(setWorldPreset),
    listActors: listActors,
    buildBlock: buildBlock,
    diagnose: diagnose,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); },
    SLOTS: SLOTS,
    WORLD_PRESETS: WORLD_PRESETS,
    LEISURE_ACTIONS: LEISURE_ACTIONS
  };

  if (WA.registerModule) {
    WA.registerModule('engines/routine-pacing.js', { kind: 'engine', ver: '2.325.0' });
  }
})();
