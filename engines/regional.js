/**
 * WorldAxis engines/regional.js (v0.4)
 * 区域突发事件 + 远方/近端随机动态（本地骰子 + 类型权重 + 持续轮次）
 * 移植自 DlSNlGHT World world-engine-evolution.js (REGIONAL_INCIDENT/rollDistant/rollNear)
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_regional_settings_v1';

  // 区域突发事件类型权重（移植）
  const INCIDENT_TYPES = [
    { type: 'bandit', label: '匪患/劫掠', weight: 15, guide: '道路/商路被劫，治安恶化' },
    { type: 'plague', label: '疫病/灾害', weight: 10, guide: '区域疫病或自然灾害' },
    { type: 'market', label: '市集异动', weight: 15, guide: '物价/货源/商路异常' },
    { type: 'faction_clash', label: '势力摩擦', weight: 15, guide: '两股势力在区域冲突' },
    { type: 'official', label: '官府动作', weight: 12, guide: '官府征调/清查/封锁' },
    { type: 'sect', label: '教派/异闻', weight: 10, guide: '教派活动或异常传闻' },
    { type: 'infrastructure', label: '路桥中断', weight: 12, guide: '桥梁/道路/码头损毁' },
    { type: 'ominous', label: '凶兆/异象', weight: 11, guide: '不详征兆引发恐慌' }
  ];

  // v2.3.0 块3: 剔除 5 个零消费死键（distantEnabled / nearEnabled / distantChance /
  //   nearChance / cooldown —— 远方/近端机制已由 horizon 承担，这是移植期残留；
  //   保留死键会让设置页/登记表显示一组拨了没反应的旋钮）。
  const MIN_CHANCE_PCT = 1, MAX_CHANCE_PCT = 100;
  const MIN_DURATION = 1, MAX_DURATION = 20;
  const REG_DEF = { enabled: false, chancePercent: 15, durationRounds: 3 };
  // v2.7.0: 区间声明上收到登记表（唯一真源）。此前 MIN_/MAX_ 常量虽在本文件，但
  //   「谁是契约」这件事没有任何声明面——UI 侧另有一份硬编码，跨文件消费方无法取用。
  const REG_BOUNDS = { chancePercent: [MIN_CHANCE_PCT, MAX_CHANCE_PCT],
    durationRounds: [MIN_DURATION, MAX_DURATION] };
  // v2.5.0: 缩减型结构演化的**首个真实消费者**（此前 migrate 钩子全库零调用）。
  //   缺的是什么：v2.3.0 块3 从 def 里剔除了 5 个零消费死键，但**只在声明侧剔除了**——
  //   老存档磁盘上那 5 个子键原封不动，而且此后永远动不了：
  //     · 子键补齐（v2.4.0 applyDefaults）**只加不减**，不会删掉不在 def 里的子键；
  //     · 保存路径是 `Object.assign(read(), patch)`，读到什么就写回什么 → 死键每次保存被续命；
  //     · 它们既不是「损坏」也不是「未登记键」，任何治理出口都看不见。
  //   即「只加不减」是结构演化的结构性缺陷，必须能声明缩减型迁移。
  //   声明口径：`migrateObjects:true`（显式开启对象形态迁移）+ 白名单式保留；删除幂等。
  //   迁移逻辑走 settingsBus.subkeyPruner 单一实现（两份内联必然分叉，本版已实测过）。
  const __REG = { key: LS_KEY, def: REG_DEF, bounds: REG_BOUNDS, module: 'regional', migrateObjects: true,
    migrate: WA.settingsBus.subkeyPruner(REG_DEF) };
  // v2.3.0: 读路径统一走 settingsBus（写路径早已迁移）——配置损坏此前静默重置为「未启用」
  function loadSettings() { return WA.settingsBus.read(__REG); }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  // v2.7.0: 回传写入结果（与 calendar/backstage/opinion/horizon 口径一致）——
  //   此前返回值被丢弃，调用方无法判断「拨了没生效」是没写进去还是没读回来。
  function saveSettings(s) {
    try { if (WA.settingsBus) return WA.settingsBus.saveOrThrow(__REG, s); } catch (e) { return { ok: false, reason: String((e && e.message) || e) }; }
    return { ok: false, reason: 'settingsBus 未装载' };
  }

  /** v2.3.0 块3: 区间夹取——历史存档越界值（如概率 500）会让区域事件判定永久为真 */
  /** 区间夹取（读路径用）：委托 settingsBus.clampNum —— v2.7.0 起本库只有一份数学实现。
   *   历史注记：此处原为自持的 `parseInt + Math.min/max`，与 horizon 的同名函数各写一遍；
   *   两者与设置页的 min/max 事实上是「同一条规则的三份拷贝」，改一处忘一处即静默不一致。 */
  function clampInt(v, def, min, max) { return WA.settingsBus.clampNum(v, def, min, max); }
  /** 生效配置（已夹取） */
  function effSettings() {
    const s = loadSettings() || {};
    const d = __REG.def;
    return {
      // v2.3.0: 归一化，且**不得收窄**既有语义——原实现 `if (!st.enabled)` 对 'true'
      //   等真值字符串是「启用」，若改成 `=== true` 会让旧存档配置无声失效。
      enabled: WA.settingsBus.toBool(s.enabled, false),
      chancePercent: clampInt(s.chancePercent, d.chancePercent, MIN_CHANCE_PCT, MAX_CHANCE_PCT),
      durationRounds: clampInt(s.durationRounds, d.durationRounds, MIN_DURATION, MAX_DURATION)
    };
  }

  function weightedPick(items) {
    const total = items.reduce((s, i) => s + i.weight, 0);
    let roll = Math.random() * total;
    for (const item of items) { roll -= item.weight; if (roll <= 0) return item; }
    return items[items.length - 1];
  }

  const regional = WA.regional = {
    getSettings: loadSettings,
    // v2.3.0 块3: 只读生效视图（夹取后）——面板/诊断据此显示真实生效值
    effectiveSettings: effSettings,
    // v2.8.0: 导出突发事件类型表。此前**完全没导出**，而 engines/contract-audit.js 的
    //   跨模块漂移检查一直在读 `regional.incidentTypes || regional.INCIDENT_TYPES`——
    //   前者是错名（内部常量叫 INCIDENT_TYPES）、后者因未导出也不存在，两个都取不到，
    //   于是那组比对源恒为 null 被跳过：**该检查自建立起从未真正执行过一次**。
    //   为什么值得修：这组检查防的正是「契约枚举与引擎实现漂移」（模型产出 bandit，
    //   引擎侧却认不出、静默落到默认分支），是 6 组里唯一没有任何测试覆盖的一组。
    //   形状须为**类型 id 的扁平数组**（契约里写的正是 bandit/plague/… 这 8 个 id）——
    //   直接导出 INCIDENT_TYPES 会带上 label/weight/guide 三个字段，与契约做集合比对时
    //   每个元素都不相等 → 反而制造 8 条假漂移。ids 才是对外的枚举面，富表是内部实现。
    incidentTypes: INCIDENT_TYPES.map(function (t) { return t.type; }),
    MIN_CHANCE_PCT, MAX_CHANCE_PCT, MIN_DURATION, MAX_DURATION,
    /**
     * v2.7.0: 写入即归一——此前**落盘的是原值**（越界值原样存），而引擎一律用 effSettings()
     *   夹取后再判定，于是「磁盘上的数」与「真正生效的数」是两套：概率手填 500 时，引擎按 100
     *   掷骰，而设置盘点（tool-diag DEFAULT_PROVIDERS → getSettings）与面板显示的都是 500。
     *   用户看到的与系统执行的是两个数，且没有任何地方提示被夹取过。
     *   现在保存前先归一（toBool + clampInt），落到磁盘的就是**生效值本身**——单源，不再有第二份。
     */
    setSettings(o) {
      // v2.7.0（收口）: 与 settingsBus.normalize 同源——本文件此前自持一份 toBool+clampInt，
      //   与 horizon 各写一遍（「两份实现必然分叉」，本仓库已有多次实证）。归并到登记表声明的
      //   唯一实现后，写路径落盘的就是生效值本身，且「区间改在哪」只有一个答案。
      return saveSettings(WA.settingsBus.normalize(__REG, Object.assign(loadSettings(), o || {})));
    },
    /** v2.7.0: 夹取边界（UI 生成控件时取用）。取自登记表声明（`boundsOf`）——本文件**不再**
     *   持有第二份 min/max 字面量：`REG_BOUNDS` 是声明、`normalize` 是执行、此处是取用，
     *   三者同一份。API 形状（`{field:[min,max]}`）保持不变，既有 UI 消费点无需改动。 */
    bounds() { return WA.settingsBus.boundsOf(LS_KEY); },

    /** 掷骰：本轮是否触发区域突发事件（返回提示词注入或null） */
    roll() {
      const st = effSettings();
      if (!st.enabled) return null;
      const s = WA.store.get();
      const incident = s.evolution.regionalIncident;
      // 已有活跃事件：持续
      if (incident && incident.active) {
        return {
          ongoing: true,
          prompt: '【区域突发事件持续中（剩余' + incident.duration + '轮）】标题：' + incident.title + ' 类型：' + incident.typeLabel + ' 范围：' + incident.scope + ' 当前影响：' + incident.impact + '。请延续其余波（经济/风声/势力行动），不得写成已平息。'
        };
      }
      // 掷骰
      const chance = st.chancePercent / 100;
      if (Math.random() >= chance) return null;
      const picked = weightedPick(INCIDENT_TYPES);
      return {
        ongoing: false,
        picked,
        prompt: '【本地骰子强制指令：本轮必须生成区域突发事件】类型：' + picked.label + '（' + picked.type + '）——' + picked.guide + '。要求：影响一个明确区域；产生可传播的风声；造成至少一种外溢影响（经济/势力/治安/事件链）；与玩家当前行为无直接因果。返回JSON：{"regionalIncident":{"active":true,"title":"...","type":"' + picked.type + '","scope":"...","impact":"..."},"winds":[{...}]}'
      };
    },

    /** 结算区域突发事件（backstage applyResult调用） */
    applyIncident(draft, incident) {
      if (!incident || !incident.active) return;
      const found = INCIDENT_TYPES.find(t => t.type === incident.type);
      draft.evolution.regionalIncident = {
        active: true, title: incident.title || '区域异动', type: incident.type || 'bandit',
        typeLabel: found ? found.label : incident.type,
        scope: incident.scope || '', impact: incident.impact || '',
        duration: effSettings().durationRounds, createdRound: draft.evolution.round
      };
      WA.log('info', '区域突发事件触发：' + incident.title);
    },

    /** 每轮递减持续（after链） */
    tick() {
      WA.store.transact(draft => {
        const inc = draft.evolution.regionalIncident;
        if (!inc || !inc.active) return;
        inc.duration = Math.max(0, (inc.duration || 0) - 1);
        if (inc.duration === 0) {
          inc.active = false;
          draft.chronicle.push({ id: 'ri' + Date.now(), kind: 'regional', title: '区域事件平息', summary: inc.title + ' 已平息', at: Date.now() });
          WA.log('info', '区域突发事件平息：' + inc.title);
        }
      });
    },

    /** 当前活跃事件（供快照/注入） */
    active() { const i = WA.store.read('evolution.regionalIncident'); return (i && i.active) ? i : null; }
  };

  WA.workflow.register({
    id: 'regional.tick', chain: 'after', order: 35, label: '区域突发事件·回合计',
    async run() { WA.regional.tick(); }
  });
})();