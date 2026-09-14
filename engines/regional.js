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

  function loadSettings() {
    const def = { enabled: false, chancePercent: 15, durationRounds: 3, distantEnabled: false, nearEnabled: false, distantChance: 20, nearChance: 20, cooldown: 5 };
    try { return Object.assign(def, JSON.parse(WA.mainWin.localStorage.getItem(LS_KEY) || '{}')); } catch (e) { return def; }
  }
  function saveSettings(s) { WA.mainWin.localStorage.setItem(LS_KEY, JSON.stringify(s)); }

  function weightedPick(items) {
    const total = items.reduce((s, i) => s + i.weight, 0);
    let roll = Math.random() * total;
    for (const item of items) { roll -= item.weight; if (roll <= 0) return item; }
    return items[items.length - 1];
  }

  const regional = WA.regional = {
    getSettings: loadSettings,
    setSettings(o) { saveSettings(Object.assign(loadSettings(), o || {})); },

    /** 掷骰：本轮是否触发区域突发事件（返回提示词注入或null） */
    roll() {
      const st = loadSettings();
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
        duration: loadSettings().durationRounds, createdRound: draft.evolution.round
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