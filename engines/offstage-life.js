/**
 * WorldAxis engines/offstage-life.js (v2.323.0) — 通用退场角色跨题材自主生计与烟火生活流转引擎
 *
 * ── 它治什么（核心哲学与工业级缺口）────────────────────────────────────────
 *   1. 角色不是舞台工具人：角色退出焦点镜头（offstage）后，时间不是冰冷停滞的；
 *   2. 拒绝单一世界观狭隘预设：系统普适支持古代修仙、现代都市、星际科幻、
 *      西幻魔法、末世废土以及怪诞荒诞等各种奇奇怪怪的世界观；
 *   3. 角色在幕后持续产生生理/心智磨损、零碎生计收支、经历市井意外与生活糗事（misadventures）；
 *   4. 重逢时不是空洞对话，而是带着真实的日常琐碎生活尘土气与谈资（reunion gossip & baggage traces）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_offstage_life_settings_v1';
  const DEF = { enabled: true, maxCharacters: 48, defaultGenre: 'generic', maxLogs: 32 };
  const __REG = { key: LS_KEY, def: DEF, module: 'offstageLife' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    const raw = WA.settingsBus.read(__REG);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80);
  }

  // 跨题材生活与生计预设池（适配古代/修仙/西幻/科幻/现代/废土/怪诞世界）
  const GENRE_PRESETS = {
    generic: {
      archetypes: {
        artisan: { doing: '钻研技艺与修复日常器物', place: '工坊隔间', item: '粗制工具盒', costWear: 8 },
        custodian: { doing: '例行巡视片区并核验出入凭据', place: '关卡哨口', item: '通行记录薄', costWear: 12 },
        trader: { doing: '清点微薄货物并核对零星账目', place: '街角货摊', item: '磨损的账册', costWear: 6 },
        traveler: { doing: '打点随身行囊并在歇脚处打盹', place: '简易歇脚处', item: '干粮水囊', costWear: 15 },
        dweller: { doing: '打理琐碎家务与修补破损居所', place: '简陋居所', item: '日常针线物', costWear: 5 }
      },
      misadventures: [
        '在摊位买补给时跟掌柜争执零头，最后被多塞了半块干粮',
        '路上被不知道哪来的顽皮幼崽踩脏了鞋面和下摆',
        '算错了生活开支，正在对着兜里所剩无几的零钱发愣叹气',
        '喝茶歇息时不小心呛了一口，咳得满脸通红引来路人侧目',
        '雨天抄近道走偏僻巷子，踩进水坑溅了半身泥点'
      ]
    },
    xianxia: {
      archetypes: {
        cultivator: { doing: '运转周天纳气，打坐调理经脉暗疾', place: '简陋洞府/静室', item: '下品灵石碎块', costWear: 10 },
        alchemist: { doing: '分拣烘烤低阶草药，清理焦糊的药渣', place: '炼丹杂役房', item: '青铜药杵', costWear: 14 },
        patrol: { doing: '御风或步行巡视山门禁制，驱赶低阶扰乱灵兽', place: '山门云道', item: '传讯玉符', costWear: 12 },
        stallkeeper: { doing: '在修真坊市倒卖冷门符箓与残破法器', place: '天街散修摊', item: '破旧符笔', costWear: 7 }
      },
      misadventures: [
        '贪便宜买了打折的定风符，一捏碎居然只吹出了一阵倒卷的黑烟',
        '在药市淘残破灵药，结果被市井野狗叼走了刚包装好的茯苓草',
        '闭关运功到一半，隔壁散修炸炉震塌了半面泥墙，灰头土脸出来理论',
        '传音符飞错洞府被路过的执事长老训斥了一炷香时间',
        '被护山灵禽当众抢走了刚买好的灵芝烧饼，气得直跺脚'
      ]
    },
    scifi: {
      archetypes: {
        hacker: { doing: '调试改装二手神经插槽并清理内存缓存', place: '霓虹暗巷地下室', item: '万用电烙铁与数据线', costWear: 9 },
        enforcer: { doing: '核对街区市民生物识别码并给浮空车充电', place: '巡检岗亭', item: '防暴眩晕棒', costWear: 14 },
        drifter: { doing: '在胶囊旅馆拆卸废弃无人机零件变现', place: '狭窄胶囊仓', item: '廉价营养液空罐', costWear: 11 },
        corp_drone: { doing: '填报无休止的冗余报表并忍受义体关节轻微放电', place: '全息格子间', item: '加密身份磁卡', costWear: 16 }
      },
      misadventures: [
        '自动贩卖机吞了信用点却卡住合成肉棒，狠狠踹了一脚触发防暴警报',
        '义体手掌驱动固件自动更新到一半死机，保持着怪异兰花指僵坐了半小时',
        '盗版流媒体目镜突然弹出全屏无码推销广告，当街撞在路灯杆上',
        '飞车尾气喷得一身合成机油味，被防尘消毒闸门强制喷洒了三次消毒粉',
        '无人送货机错把别人的重力哑铃扔到了自家天台上'
      ]
    },
    fantasy: {
      archetypes: {
        apprentice: { doing: '擦洗魔法坩埚并背诵拗口的召唤咒文', place: '高塔杂物间', item: '羊皮纸卷与羽毛笔', costWear: 10 },
        guard: { doing: '在酒馆门前站岗并劝阻烂醉的矮人铁匠', place: '冒险者公会街角', item: '生锈的阔头短剑', costWear: 15 },
        herbalist: { doing: '调制驱蚊草药剂并晾晒风干蝙蝠翼', place: '镇尾草药铺', item: '发霉的标本瓶', costWear: 8 },
        mercenary: { doing: '在火塘边磨砺短斧并缝补皮甲裂缝', place: '驿站马厩', item: '磨刀石与油脂', costWear: 13 }
      },
      misadventures: [
        '试念漂浮咒不小心把自己束发带漂飞了，挂在公会大吊灯上拿不下来',
        '在杂货铺被地精商人用发光的假荧光石骗了三枚银币，正到处找他算账',
        '替人照料温顺幼龙结果被烧焦了半边法袍下摆',
        '被野外史莱姆喷了一身黏糊糊的酸汁，在溪水边洗了大半个下午',
        '跟酒馆吟游诗人合唱时唱破了音，引来整桌矮人狂笑起哄'
      ]
    },
    modern: {
      archetypes: {
        worker: { doing: '挤完通勤并揉着发酸的肩膀核对工作台账', place: '转角便利店/出租屋', item: '保温杯与工牌', costWear: 12 },
        clerk: { doing: '整理归档琐碎票据并为下月房租发愁', place: '社区便民窗口', item: '打折优惠券', costWear: 8 },
        courier: { doing: '按门铃派件并趁着空档在树荫下大口喝水', place: '公寓门廊前', item: '电量剩余15%的手机', costWear: 16 },
        resident: { doing: '去菜市场比价并顺便帮邻居收了快递包裹', place: '居民弄堂', item: '环保帆布袋', costWear: 6 }
      },
      misadventures: [
        '扫码共享单车连扫了三辆都是坏刹车，急得差点迟到',
        '点外卖被骑手送错了单元门，爬上六楼才发现拿了别人的麻辣烫',
        '在便利店买打折牛奶结账时被熟人看见，尴尬地假装在看风景',
        '手机掉进沙发缝掏了十分钟，掏出一只失踪半年的旧袜子',
        '阳台上晒的床单被大风吹到了楼下花坛灌木丛上'
      ]
    }
  };

  const stat = { markedOffstage: 0, progressed: 0, reunions: 0, misadventures: 0, refused: 0, lastReason: '' };

  function ensureBucket(draft) {
    if (!draft.offstageLife || typeof draft.offstageLife !== 'object' || Array.isArray(draft.offstageLife)) {
      draft.offstageLife = { characters: {}, log: [] };
    }
    if (!draft.offstageLife.characters || typeof draft.offstageLife.characters !== 'object') {
      draft.offstageLife.characters = {};
    }
    if (!Array.isArray(draft.offstageLife.log)) {
      draft.offstageLife.log = [];
    }
    return draft.offstageLife;
  }

  function getOffstageCard(who) {
    const w = clean(who, 40);
    if (!w || !WA.store || !WA.store.get) return null;
    const st = WA.store.get() || {};
    const b = st.offstageLife;
    if (!b || !b.characters) return null;
    return b.characters[w] || null;
  }

  /**
   * 角色退场登记
   */
  function markOffstage(who, opts) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const name = clean(who, 40);
    if (!name) { stat.refused++; stat.lastReason = 'missing-who'; return { ok: false, reason: 'missing-who' }; }

    const o = opts || {};
    const genre = String(o.genre || cfg.defaultGenre || 'generic').toLowerCase();
    const role = clean(o.role || 'dweller', 30);
    const place = clean(o.place || '幕后街巷居所', 60);
    const at = Number.isFinite(o.at) ? o.at : clockNow('offstageLife');

    let out = null;
    WA.store.transact(function (draft) {
      const b = ensureBucket(draft);
      const cap = cfg.maxCharacters || 48;
      const keys = Object.keys(b.characters);
      if (!b.characters[name] && keys.length >= cap) {
        // 挤出最久未活跃的
        let oldestKey = keys[0];
        let oldestTime = (b.characters[oldestKey] && b.characters[oldestKey].lastTickAt) || 0;
        for (let i = 1; i < keys.length; i++) {
          const k = keys[i];
          const t = (b.characters[k] && b.characters[k].lastTickAt) || 0;
          if (t < oldestTime) { oldestTime = t; oldestKey = k; }
        }
        delete b.characters[oldestKey];
      }

      const presetPool = GENRE_PRESETS[genre] || GENRE_PRESETS.generic;
      const arch = (presetPool.archetypes && presetPool.archetypes[role])
        || (GENRE_PRESETS.generic.archetypes && GENRE_PRESETS.generic.archetypes[role])
        || { doing: '料理日常杂务与休养生息', place: place, item: '随身零碎杂物', costWear: 8 };

      const card = {
        name: name,
        genre: genre,
        role: role,
        place: place || arch.place,
        doing: clean(o.doing || arch.doing, 100),
        carriedItem: clean(o.item || arch.item, 40),
        weariness: Math.min(100, Math.max(0, Number(o.weariness) || 10)),
        spareCoins: Number.isFinite(o.spareCoins) ? o.spareCoins : 12,
        roundsAway: 0,
        misadventures: [],
        reunionGossip: '',
        offstageSince: at,
        lastTickAt: at
      };

      b.characters[name] = card;
      stat.markedOffstage++;
      stat.lastReason = 'marked';
      out = { ok: true, card: card };
    }, 'offstageLife:markOffstage');

    return out || { ok: false, reason: 'transact-failed' };
  }

  /**
   * 幕后时间流转：为所有或指定退场角色推进日常生计、磨损与可能的生活糗事
   */
  function progressOffstage(opts) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const specificWho = o.who ? clean(o.who, 40) : null;
    const rounds = Math.max(1, Math.min(10, Math.floor(Number(o.rounds) || 1)));
    const at = Number.isFinite(o.at) ? o.at : clockNow('offstageLife');

    let out = null;
    WA.store.transact(function (draft) {
      const b = ensureBucket(draft);
      const targets = specificWho ? [specificWho] : Object.keys(b.characters);
      if (!targets.length) { out = { ok: true, progressedCount: 0, reason: 'no-characters' }; return; }

      let count = 0;
      targets.forEach(function (name) {
        const card = b.characters[name];
        if (!card) return;
        card.roundsAway = (card.roundsAway || 0) + rounds;
        card.lastTickAt = at;

        const genre = card.genre || 'generic';
        const pool = GENRE_PRESETS[genre] || GENRE_PRESETS.generic;
        const rolePool = pool.archetypes || GENRE_PRESETS.generic.archetypes;
        const arch = rolePool[card.role] || GENRE_PRESETS.generic.archetypes.dweller;

        // 推进日常磨损与零星开销
        card.weariness = Math.min(100, Math.max(0, (card.weariness || 0) + (arch.costWear || 8) * rounds));
        if (card.spareCoins > 0 && Math.random() < 0.4) {
          card.spareCoins = Math.max(0, card.spareCoins - 1);
        }

        // 偶发市井生活意外与窘迫糗事 (misadventure)
        if (Math.random() < 0.65 || o.forceMisadventure) {
          const list = (pool.misadventures && pool.misadventures.length) ? pool.misadventures : GENRE_PRESETS.generic.misadventures;
          const chosen = o.customMisadventure ? clean(o.customMisadventure, 120) : list[Math.floor(Math.random() * list.length)];
          if (chosen && card.misadventures.indexOf(chosen) < 0) {
            card.misadventures.push(chosen);
            if (card.misadventures.length > 5) card.misadventures.shift();
            card.reunionGossip = chosen;
            stat.misadventures++;

            b.log.push({
              who: name,
              genre: genre,
              event: chosen,
              roundAway: card.roundsAway,
              at: at
            });
            if (b.log.length > (cfg.maxLogs || 32)) b.log.shift();
          }
        }

        card.doing = arch.doing;
        count++;
      });

      stat.progressed += count;
      stat.lastReason = 'progressed';
      out = { ok: true, progressedCount: count };
    }, 'offstageLife:progressOffstage');

    return out || { ok: false, reason: 'transact-failed' };
  }

  /**
   * 久别重逢切片回流：当角色重回视野或在街头偶遇时，带出鲜活生活谈资与痕迹
   */
  function reunionSnap(who, opts) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const name = clean(who, 40);
    if (!name) { stat.refused++; stat.lastReason = 'missing-who'; return { ok: false, reason: 'missing-who' }; }

    const o = opts || {};
    const card = getOffstageCard(name);
    if (!card) {
      stat.refused++; stat.lastReason = 'not-offstage';
      return { ok: false, reason: 'not-offstage', note: '该角色从未离场或未建档，不可生成重逢切片' };
    }

    const snap = {
      who: name,
      genre: card.genre,
      roundsAway: card.roundsAway,
      currentPlace: card.place,
      currentDoing: card.doing,
      carriedItem: card.carriedItem,
      wearinessLevel: card.weariness >= 50 ? '深感困顿疲乏' : (card.weariness >= 25 ? '微有尘尘倦色' : '尚算精神从容'),
      spareCoins: card.spareCoins,
      lastMisadventure: card.reunionGossip || (card.misadventures.length ? card.misadventures[card.misadventures.length - 1] : '料理平日杂事，别无特别波澜'),
      reunionTone: card.roundsAway >= 5 ? '长别久别（满面风尘，恍如隔世）' : (card.roundsAway >= 2 ? '近别重会（自然接续家常）' : '刚打过照面')
    };

    if (o.consume === true) {
      WA.store.transact(function (draft) {
        const b = ensureBucket(draft);
        if (b.characters[name]) {
          b.characters[name].roundsAway = 0;
          b.characters[name].reunionGossip = '';
        }
      }, 'offstageLife:consumeReunion');
    }

    stat.reunions++;
    stat.lastReason = 'reunion';
    return { ok: true, snap: snap };
  }

  /**
   * 提示词汇流块生产（注入管线）
   */
  function buildBlock(opts) {
    const cfg = settings();
    if (!cfg.enabled || !WA.store || !WA.store.get) return '';
    const st = WA.store.get() || {};
    const b = st.offstageLife;
    if (!b || !b.characters) return '';

    const filterWho = opts && opts.who ? String(opts.who) : '';
    let list = Object.keys(b.characters).map(function (k) { return b.characters[k]; })
      .filter(function (c) { return c && (c.roundsAway > 0 || (c.misadventures && c.misadventures.length > 0)); });

    if (filterWho) {
      list = list.filter(function (c) { return c.name === filterWho; });
    } else {
      list.sort(function (a, b) { return (b.roundsAway || 0) - (a.roundsAway || 0); });
      list = list.slice(0, 6);
    }

    if (!list.length) return '';
    const lines = ['【退场角色自主生活实况】（角色离开镜头后仍有真实生计流转与市井琐碎，禁止原地冻结）：'];
    list.forEach(function (c) {
      const g = c.reunionGossip || (c.misadventures.length ? c.misadventures[c.misadventures.length - 1] : '');
      let line = '· ' + c.name + '（离场 ' + c.roundsAway + ' 轮，正处于「' + c.place + '」）：正在「' + c.doing + '」，随身带「' + c.carriedItem + '」';
      if (g) line += '；近期生活小插曲：「' + g + '」';
      lines.push(line);
    });
    return lines.join('\n') + '\n';
  }

  WA.offstageLife = {
    GENRE_PRESETS: GENRE_PRESETS,
    markOffstage: markOffstage,
    progressOffstage: progressOffstage,
    reunionSnap: reunionSnap,
    getOffstageCard: getOffstageCard,
    buildBlock: buildBlock
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/offstage-life.js', { kind: 'engine', ver: '2.323.0' });
  }
})();