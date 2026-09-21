/**
 * WorldAxis engines/digest.js (v0.5)
 * world_digest 世界推演叙事
 * 缝合来源：DlSNlGHT World —— world-engine-evolution.js world_digest机制
 *
 * 规则：
 *  - 每轮backstage结算后生成150-200字的世界推演叙事
 *  - 绝对禁止提及玩家角色（任何代称/暗示均不允许）
 *  - 内容：当前世界脉搏、活跃事件进展、风声动向、势力态势
 *  - 存放于 store.worldDigest，供注入层使用
 *  - 本地模板生成（不额外调用API，避免延迟）
 */
(function () {
  const WA = (window.WorldAxis = window.WorldAxis || {});
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  /** v2.36.0: 轮次读口——唯一真源 WA.evolution.roundOf（未加载时兜底 evolution.round）。 */
  function roundOfSafe(state) {
    try { if (WA.evolution && typeof WA.evolution.roundOf === 'function') return WA.evolution.roundOf(state); } catch (e) {}
    try { const s = state || WA.store.get(); if (s && s.evolution && typeof s.evolution.round === 'number') return s.evolution.round; } catch (e) {}
    return 0;
  }
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const DIGEST_MIN = 150;
  const DIGEST_MAX = 200;

  // ── 片段生成器 ─────────────────────────────────────────
  function pulseFragment(pulse) {
    const p = (pulse && pulse.pressure) || 0;
    if (p >= 3) return '各方暗流涌动，张力已近临界点，任何微小的扰动都可能引发连锁反应。';
    if (p === 2) return '局势渐趋紧张，多条线索在暗处交织，平静的表面下积蓄着不安的力量。';
    if (p === 1) return '世界维持着微妙的平衡，偶有涟漪，却尚未掀起真正的波澜。';
    return '四方宁静，街巷如常，人们的生活在各自的轨道上有序运转。';
  }

  function eventFragment(events) {
    const active = (events || []).filter(e => e && e.status === 'active').slice(0, 2);
    if (!active.length) return '';
    const parts = active.map(e => {
      const stage = e.stage || '';
      const title = String(e.title || '').slice(0, 15);
      if (stage === 'climax' || stage === '爆发') return `「${title}」已进入最激烈的阶段，相关各方皆无法置身事外。`;
      if (stage === 'rising' || stage === '升级') return `「${title}」持续发酵，影响范围正在扩大。`;
      if (stage === 'resolution' || stage === '收束') return `「${title}」的余波逐渐平息，但留下的痕迹尚未完全消散。`;
      return `「${title}」正在暗中推进，知情者寥寥。`;
    });
    return parts.join('');
  }

  function windFragment(winds) {
    const active = (winds || []).filter(w => w && !w.quiet).slice(0, 2);
    if (!active.length) return '';
    const parts = active.map(w => {
      const topic = String(w.topic || '').slice(0, 10);
      const level = w.level || 1;
      if (level >= 4) return `关于「${topic}」的传言甚嚣尘上，几乎无人不知。`;
      if (level >= 3) return `「${topic}」的消息在坊间流传甚广，说者绘声绘色。`;
      return `隐约有人提及「${topic}」，语焉不详，真假难辨。`;
    });
    return parts.join('');
  }

  function factionFragment(factions) {
    const list = (factions || []).filter(f => f && f.name).slice(0, 2);
    if (!list.length) return '';
    const parts = list.map(f => {
      const status = f.status || '';
      const name = String(f.name).slice(0, 8);
      if (status === '鼎盛') return `${name}声势正隆，无人敢于正面撄其锋。`;
      if (status === '衰退') return `${name}近来屡遭挫折，内部已有不稳的迹象。`;
      if (status === '动荡') return `${name}内忧外患，正处于风雨飘摇之中。`;
      if (status === '瓦解') return `${name}已名存实亡，旧部四散，只剩余烬。`;
      return `${name}按兵不动，静观局势变化。`;
    });
    return parts.join('');
  }

  function economyFragment(economy) {
    if (!economy || !economy.climate) return '';
    const map = {
      '繁荣': '市面繁荣，商贾往来络绎不绝，百姓手中宽裕。',
      '平稳': '物价平稳，商贸如常，民生安定。',
      '萧条': '市面萧条，铺面关门者渐多，百姓捂紧了钱袋。',
      '危机': '经济动荡，物资紧缺，人心惶惶，囤积之风渐起。'
    };
    return map[economy.climate] || '';
  }

  // ── 主生成函数 ─────────────────────────────────────────
  /**
   * 基于当前世界状态生成本轮world_digest
   * @returns {string} 150-200字叙事，状态不足时返回''
   */
  function generate() {
    const st = WA.store.get();
    if (!st) return '';
    const ev = st.evolution || {};

    const fragments = [
      pulseFragment(st.worldPulse),
      eventFragment(ev.events),
      windFragment(ev.winds),
      factionFragment(ev.factions),
      economyFragment(ev.economy)
    ].filter(Boolean);

    let digest = fragments.join('');
    // 去除所有玩家引用（保险丝）
    digest = digest.replace(/你|您|玩家|主角|用户/g, '世人');

    if (digest.length < DIGEST_MIN) {
      // 不足时补充通用观察
      const filler = '天地之间，无数生灵各自奔忙，无人知晓下一刻将有怎样的变数降临。';
      digest += filler;
    }
    if (digest.length > DIGEST_MAX) {
      digest = digest.slice(0, DIGEST_MAX - 1) + '。';
    }

    // 入账
    WA.store.transact(tx => {
      if (!tx.evolution) tx.evolution = {};
      tx.evolution.worldDigest = {
        text:    digest,
        round:   roundOfSafe(tx),  // v2.36.0: 轮次单一真源（此前 `meta.round` 零写入方）
        at:      clockNow('digest')
      };
    });
    // v0.1.33: 移除裸 save——transact 已落盘（嵌套时延迟到最外层统一提交）
    WA.log('info', `world_digest已生成(${digest.length}字)`);
    return digest;
  }

  // ── 注入块 ─────────────────────────────────────────────
  function buildBlock() {
    const st = WA.store.get();
    const d = st && st.evolution && st.evolution.worldDigest;
    if (!d || !d.text) return '';
    return `[世界推演]\n${d.text}`;
  }

  WA.digest = { generate, buildBlock, DIGEST_MIN, DIGEST_MAX };
})();