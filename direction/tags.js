/** WorldAxis direction/tags.js — 导演标签/快捷指令（缝合 剧情指导） */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  // 快捷导演指令：玩家消息中以 [[wa:xxx]] 形式触发
  const TAGS = {
    'wa:advance': { desc: '推进世界半天', apply(ctx) {
      WA.store.transact(d => { d.clock.label = (d.clock.label || '') + '→+半日'; d.clock.source = 'user'; });
      return '世界时间推进半天';
    }},
    'wa:storm': { desc: '提升世界脉搏到2', apply(ctx) {
      WA.store.transact(d => { d.worldPulse = { pressure: 2, trend: 'rising', note: '用户手动加压', at: clockNow('tags') }; });
      return '世界脉搏已加压';
    }},
    'wa:calm': { desc: '降低世界脉搏到0', apply(ctx) {
      WA.store.transact(d => { d.worldPulse = { pressure: 0, trend: 'falling', note: '用户手动平息', at: clockNow('tags') }; });
      return '世界脉搏已平息';
    }},
    'wa:sim': { desc: '立即触发一次世界推演', apply(ctx) {
      WA.backstage.forceSimulate();
      return '已触发世界推演';
    }}
  };

  WA.tags = {
    TAGS,
    /** 扫描玩家输入中的导演标签并执行（before链） */
    scan(text) {
      const hits = [];
      Object.keys(TAGS).forEach(k => {
        if (text.includes('[[' + k + ']]')) { const r = TAGS[k].apply(); hits.push(k + ' → ' + r); }
      });
      return hits;
    }
  };

  WA.workflow.register({
    id: 'tags.scan', chain: 'before', order: 5, label: '导演标签扫描',
    async run(ctx) {
      const chat = ctx.chat || [];
      const last = chat[chat.length - 1];
      if (!last || !last.is_user) return;
      const hits = WA.tags.scan(String(last.mes || ''));
      if (hits.length) WA.log('info', '导演标签执行：' + hits.join('；'));
    }
  });
})();