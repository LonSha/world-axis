/**
 * WorldAxis actors/profile.js (v0.2)
 * NPC档案自动维护：after链从正文/推演结果中提取档案增量写回registry
 * 缝合来源：SoulLink 档案契约（personality/worldview/family/relationships/memory分节）
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const PROFILE_SYS = `你是「档案维护」子agent。对比NPC现有档案与最新剧情，产出档案增量更新。规则：
1. 只补充剧情中新显露的信息；不臆造未表现的性格/关系。
2. 每节输出增量条目（不是全量重写）；无变化给空数组。
3. 分节：personality(性格)/worldview(观念)/family(家庭)/relationships(关系动态)/memory(关键经历)。
4. relationships 条目格式 {"target":"对象名","relation":"关系","dynamic":"最新动态"}。\n4b. 因果解释只写**已发生的行为**，不写推测的心理成因。若确需给成因，优先级为：自然成长/家庭文化/教育/职业/人际 ＞ 重大事件 ＞ 创伤（创伤最后且必须有明确剧情依据）。\n4c. 现实性格（长久倾向）与人格机制（本轮情境下的行为选择）分开写，不得用本轮行为反推性格，也不得用性格标签代替行为。
只输出JSON：{"personality":["..."],"worldview":["..."],"family":["..."],"relationships":[{"target":"...","relation":"...","dynamic":"..."}],"memory":["..."]}`;

  function getCtx() { try { return WA.mainWin.SillyTavern.getContext(); } catch (e) { return null; } }
  // v2.159.0（TP2）：写回台账。被拒的写回必须可见 —— 否则「模型没返回」与
  //   「返回了但被归属检查丢掉」同形，用户只看到「档案不动」，无从判断原因。
  const _stat = { blocked: 0, passed: 0, lastBlockedReason: null };
  function recentText(n) {
    const ctx = getCtx(); const chat = (ctx && ctx.chat) || [];
    return chat.slice(Math.max(0, chat.length - (n || 6))).map(m => (m.is_user ? '【玩家】' : '【正文】') + String(m.mes || '').slice(0, 800)).join('\n---\n');
  }

  WA.profile = {
    /** 对指定NPC执行档案增量维护 */
    async maintain(name) {
      const cfg = WA.apiRouter.getChannel('digest');
      if (!cfg.baseUrl || !cfg.model) return { ok: false, reason: 'no-channel' };
      const old = WA.registry.getProfile(name);
      // v2.13.0: 原先这里写死 slice(-8)，而 store 容量登记表给的是 personality 15 /
      //   memory 25 —— 同一份档案在**采样端**和**写入端**两套上限，注入给模型看到的
      //   与真正留存的对不上（漂移型缺陷）。改为按登记上限取尾部（单一真源）。
      const capOfSec = function (sec, fb) {
        try { const c = WA.store.capsFor('people.*.profile.' + sec); return (c && c.cap) || fb; } catch (e) { return fb; }
      };
      const tail = function (arr, sec, fb) { const a = arr || []; return a.slice(-capOfSec(sec, fb)); };
      const compactOld = {
        personality: tail(old.personality, 'personality', 15),
        worldview: tail(old.worldview, 'worldview', 10),
        family: tail(old.family, 'family', 10),
        relationships: tail(old.relationships, 'relationships', 15),
        memory: tail(old.memory, 'memory', 25)
      };
      // v2.159.0（TP2）：取票。档案的写回依赖**这个人的档案行**与**它据以推断的近期正文**——
      //   请求在飞期间这人被改名/被删、或正文被编辑换滑动，这份增量就会挂到一个已经不存在的
      //   人或一段已经不在的正文上（悬空引用，且读数上看不出来）。
      //   依赖读面统一走 store 基座（人物表指纹 + 近期正文内容指纹）；去重键按人分，
      //   同一人并发只维护一次（否则同一份档案被两份增量各写一次）。
      const depOf = function () {
        const row = (WA.store && typeof WA.store.peopleSig === 'function') ? WA.store.peopleSig() : '';
        const sig = (WA.store && typeof WA.store.recentSig === 'function') ? WA.store.recentSig(6) : '';
        const fl = (WA.store && typeof WA.store.floorSig === 'function') ? WA.store.floorSig() : '';
        return name + '#' + row + '#' + sig + '@' + fl;
      };
      let ticket = null;
      if (WA.store && typeof WA.store.claimAsync === 'function') {
        const c = WA.store.claimAsync('profile:maintain', { dep: depOf, key: 'profile:' + name });
        if (!c || !c.ok) {
          _stat.blocked++; _stat.lastBlockedReason = (c && c.reason) || 'claim-failed';
          WA.log('info', '档案维护跳过 ' + name + '：' + _stat.lastBlockedReason);
          return { ok: false, reason: _stat.lastBlockedReason };
        }
        ticket = c.ticket;
      }
      const r = await WA.apiRouter.call('digest', [
        { role: 'system', content: PROFILE_SYS },
        { role: 'user', content: '【NPC】' + name + '\n【现有档案】' + JSON.stringify(compactOld) + '\n【近期剧情】\n' + recentText(6) }
      ], { json: true, maxTokens: 1200, temperature: 0.4 }).catch(() => null);
      if (!r) { _stat.blocked++; _stat.lastBlockedReason = 'api-fail'; return { ok: false, reason: 'api-fail' }; }
      // v2.159.0（TP2）：落地前复核。拒收 ⇒ 明确丢弃这次增量（不偷偷写回已离开的旧局）。
      if (ticket && WA.store && typeof WA.store.settleAsync === 'function') {
        const v = WA.store.settleAsync(ticket, { site: 'profile:maintain' });
        if (!v || v.ok !== true) {
          const rs = (v && v.reason) || 'missing-key';
          _stat.blocked++; _stat.lastBlockedReason = rs;
          WA.log('warn', '档案写回被拒（' + rs + '）：' + ((v && v.detail) || ''));
          return { ok: false, reason: rs };
        }
      }
      // v2.2.0: 改走 registry.setProfileSafe 契约（此前直接改 store = 与 getProfile/setProfile 双写漂移：
      //   registry 的剪裁上限来自容量登记表，直写方却写死常量，任一处调整即产生 drifted 误报）。
      const res = WA.registry.setProfileSafe(name, {
        personality: r.personality, worldview: r.worldview, family: r.family,
        memory: r.memory, relationships: (r.relationships || []).slice(0, 5)
      });
      if (!res || !res.ok) return { ok: false, reason: (res && res.reason) || 'write-fail' };
      _stat.passed++;
      WA.log('info', '档案维护完成：' + name);
      return { ok: true, added: res.added };
    },

    /** after链批量：对注册了且近期正文提到的NPC执行维护 */
    async maintainActive() {
      const names = WA.registry.list();
      if (!names.length) return;
      const cfg = WA.apiRouter.getChannel('digest');
      if (!cfg.baseUrl || !cfg.model) return;
      const text = recentText(6);
      const active = names.filter(n => text.includes(n));
      for (const n of active.slice(0, 3)) { // 单轮最多维护3人
        await this.maintain(n).catch(e => WA.log('warn', '档案维护失败 ' + n, e.message));
      }
    },

    /** v2.159.0（TP2）：写回台账只读视图（tool-diag / 专锁消费）。 */
    stat() { return { blocked: _stat.blocked, passed: _stat.passed, lastBlockedReason: _stat.lastBlockedReason }; }
  };

  // 每4轮触发一次档案维护（避免每轮都调用）
  let maintainCounter = 0;
  WA.workflow.register({
    id: 'actors.profileMaintain', chain: 'after', order: 60, label: 'NPC档案自动维护（每4轮）',
    async run() {
      maintainCounter++;
      if (maintainCounter % 4 !== 0) return;
      await WA.profile.maintainActive();
    }
  });
})();