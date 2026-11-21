/**
 * WorldAxis core/interceptor.js
 * 唯一 generate_interceptor 入口 + 事件回退链路 + 去重守卫
 * 缝合来源：EW-Assistant 主拦截+GENERATION_AFTER_COMMANDS回退 + 世界背面发送前一致性屏障
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainWin = WA.mainWin || window;
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  let installed = false;
  let lastRoundSig = '';           // 去重：同一轮生成只跑一次before链
  let afterHooked = false;
  let purifyHooked = false;   // v2.1.0: 输出净化挂载哨兵
  // v2.1.0: 净化原文快照（WeakMap：不写进 chat 存档，随消息对象回收）
  const __purifiedRaw = new WeakMap();

  function getCtx() {
    try { return mainWin.SillyTavern && mainWin.SillyTavern.getContext ? mainWin.SillyTavern.getContext() : null; }
    catch (e) { return null; }
  }

  // ── v2.547.0：轮次签名从「长度」升级为「松散指纹」──────────────────────────
  // 病灶（可复算）：旧签名是 `长度 : 最后一条的长度 : swipe_id` —— 只比**长度**。
  //   两条等长、内容完全不同的消息签名相同 ⇒ `sig === lastRoundSig` ⇒ 整条 before 链
  //   被静默跳过：世界不推进，日志却写「拦截器去重：本轮before链已执行」（把故障伪装成
  //   正常）。真实触发面：MESSAGE_EDITED 把最后一楼改成等长文本、某些宿主的 regen 不
  //   递增 swipe_id、别的扩展替换了最后一条。
  // 为什么用 msg-align 的 loose 归一化而不是原文比较：它的能力就是「同一段文字被标签
  //   或空白改过一点也认得出」——去标签 / 去空白 / 小写化之后差别消失的，是同一条消息，
  //   不该被当成新一轮而重复推进世界（那会虚增 round）。归一化后仍有差异才算另一轮。
  //   **不夸大的边界**：它吸不掉宏展开（{{char}} → 莉莉）这类**内容级**差异 —— 那种差异
  //   会把同一条消息判成另一轮；本签名宁可多跑一次（可由 settleGuard 挡重复推进），
  //   也不把两条真不同的消息当成同一轮（那会静默跳过整条 before 链）。
  function looseFp(text) {
    let s = '';
    try {
      s = (WA.msgAlign && typeof WA.msgAlign.loose === 'function')
        ? WA.msgAlign.loose(WA.msgAlign.textOf(text))
        : String(text == null ? '' : text);
    } catch (e) { s = String(text == null ? '' : text); }
    // FNV-1a 32 位：只求「等长不同文不同码」，不求密码学强度（签名只在本进程内比较）
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return s.length.toString(36) + '-' + h.toString(36);
  }
  function roundSig() {
    const ctx = getCtx();
    const len = ctx && ctx.chat ? ctx.chat.length : 0;
    const last = len && ctx.chat[len - 1];
    // 去重签名：聊天长度 + 最后一条的松散指纹 + swipe_id 视为同一轮（不含时间戳，否则永不命中）
    return len + ':' + looseFp(last && last.mes) + ':' + (last && last.swipe_id != null ? last.swipe_id : 0);
  }

  // 主拦截：SillyTavern 在组装prompt前 await 此函数
  window.worldAxisGenerateInterceptor = async function (chat, contextSize, abort, type) {
    // quiet/impersonate 等旁路生成跳过，避免递归
    if (type && type !== 'normal' && type !== 'regenerate' && type !== 'swipe') return;
    // v2.547.0：先对齐，再签名。位置是硬约束 —— roundSig() 读的是存档（getCtx().chat），
    //   而本函数的 chat 是宿主真要发的那一份；两者不同批时签名本身就没有可比性，这个事实
    //   必须在去重判定之前留证，否则查现场时只剩一句「本轮已执行」。只观测不改行为（理由见
    //   interceptor.alignRound 的注释）。日志去抖：仅在漂移状态翻转时打一行。
    try {
      const al = (WA.interceptor && WA.interceptor.alignRound) ? WA.interceptor.alignRound(chat) : null;
      if (al && al.available && WA.interceptor) {
        WA.interceptor.__lastAlign = al;
        const wasDrift = !!WA.interceptor.__lastDriftFlag;
        WA.interceptor.__lastDriftFlag = !!al.drift;
        if (al.drift && !wasDrift) {
          WA.log('warn', '本轮发送面与存档面不对齐：发送 ' + al.sentLen + ' 条 / 存档 ' + al.hostLen
            + ' 条，认得 ' + al.known + ' 条、逐位不同 ' + al.mismatch + ' 条、单调=' + (al.monotonic ? '是' : '否')
            + '（世界推进仍按存档面，签名可比性存疑）');
        }
      }
    } catch (eAl) { WA.log('warn', '对齐读数失败（不影响生成）', eAl); }
    const sig = roundSig();
    if (sig === lastRoundSig) { WA.log('info', '拦截器去重：本轮before链已执行'); return; }
    lastRoundSig = sig;
    // v0.1.31: 写合并——整轮（撤销回写+contextSize记账+before链+注入落地）只推进内存，轮末统一落盘一次
    const runRound = async () => {
    try { if (WA.render && WA.render.uninject) WA.render.uninject('interceptor'); } catch (e) { WA.log('warn', 'pre-uninject failed', e); }
    const ctx = {
      type: type || 'normal',
      chat,
      abort,
      store: WA.store ? WA.store.get() : null,
      branchId: WA.store ? WA.store.currentBranchId() : 'b0',
      injections: [],   // 各节点推入 {source, position, depth, content}
      canceled: false
    };
    try {
      try { if (WA.store && contextSize) WA.store.transact(d => { d.meta = d.meta || {}; d.meta.contextSize = contextSize; }); } catch (e) { /* 预算推导用，失败不影响推演 */ }
      // v2.231.0（优化 OPT-5）：**轮边界记账**——生成前抓世界键基线，after 链跑完逐键比出
      //   「这一楼真正改了哪些键、改前是什么」。位置是硬约束：必须早于 before 链（链里就会推进
      //   世界），且**晚于** settleGuard 的跳过判定（被跳过的轮不该留下一笔空账）。
      try { if (WA.floorSettle) WA.floorSettle.beginRound(); } catch (e) { WA.log('warn', '楼层结算记账起点失败', e); }
      await WA.workflow.run('before', ctx);
    } catch (e) {
      WA.log('error', 'before链关键失败，本轮沿用上一份已确认世界状态', e);
    }
    // v0.1.26: 取消短路——before 链节点（如一致性屏障）置 canceled 后，
    // 丢弃本轮全部注入并留日志；生成继续，只是世界状态不进 prompt
    if (ctx.canceled) {
      WA.log('warn', 'before链取消本轮注入：' + (ctx.cancelReason || '未注明原因') + '（丢弃 ' + ctx.injections.length + ' 项）');
      ctx.injections = [];
      try { if (WA.injectInspector && WA.injectInspector.markRegistered) WA.injectInspector.markRegistered(0); } catch (e) {}
      return;
    }
    // 注入统一落地（render/inject 节点也可是链条之一；这里兜底处理injections数组）
    try { WA.render && WA.render.applyInjections && WA.render.applyInjections(ctx); } catch (e) { WA.log('error', '注入落地失败', e); }
    }; // end runRound
    if (WA.store && WA.store.batch) await WA.store.batch(runRound); else await runRound();
  };

  const interceptor = WA.interceptor = {
    /**
     * v2.547.0：注入原文洗除（engines/ephemeral-scrub.js 的产品落点）。
     *   病：模型会把注入块（世界状态 / 叙事工艺）原样复述进正文，那段文本就进了聊天历史，
     *   下一轮被原样喂回 —— 逐轮堆成噪声、被模型当成一直有效的设定、把上下文撑大。
     *   判据三条，缺一不改正文：
     *     · removed > 0     —— 真删掉了登记过的注入原文（不删而 tidy 空白 = 观测污染被观测者）；
     *     · overMatch === 0 —— 同一段原文在正文里只出现一次；出现多处说明正文本来就有相似
     *       段落，删下去就是误伤（引擎自陈边界②：宁可不洗，不许猜）；
     *     · text 是字符串。
     *   单独成方法而不是内联在事件回调里：内联时「没洗掉」与「没登记」在读数上同形。
     */
    scrubReply(text) {
      const out = { adopted: false, removed: 0, missing: 0, overMatch: 0, reason: 'absent', text: text };
      if (!WA.ephemeralScrub || typeof WA.ephemeralScrub.scrub !== 'function') return out;
      if (typeof text !== 'string' || !text) { out.reason = 'bad-type'; return out; }
      let sc = null;
      try { sc = WA.ephemeralScrub.scrub(text); }
      catch (e) { out.reason = 'error'; out.error = String((e && (e.message || e)) || e).slice(0, 120); return out; }
      if (!sc || sc.ok !== true) { out.reason = (sc && sc.reason) || 'not-ok'; return out; }
      out.removed = sc.removed || 0;
      out.missing = sc.missing || 0;
      out.overMatch = sc.overMatch || 0;
      if (sc.skipped) { out.reason = 'skipped'; return out; }
      if (out.removed <= 0) { out.reason = 'no-hit'; return out; }
      if (out.overMatch > 0) { out.reason = 'over-match'; return out; }
      if (typeof sc.text !== 'string') { out.reason = 'bad-text'; return out; }
      out.adopted = true;
      out.reason = 'scrubbed';
      out.text = sc.text;
      return out;
    },
    /**
     * v2.547.0：宿主真要发的消息 vs 存档消息逐位对齐（engines/msg-align.js 的产品落点）。
     *   病：本拦截器拿到的 `chat` 是宿主真要发的，而 roundSig() 与 after 链读的是
     *   getCtx().chat（存档）。上游扩展可在两者之间插/删/改消息，此后两份长度不等、位置
     *   错开 —— 签名比的是一份、世界推进读的是另一份，两边都自洽，只在「推进基于了不是本轮
     *   的历史」时显形。
     *   处置刻意只观测不改行为：漂移时告警并留读数。若在漂移时跳过去重，同一轮会重复跑
     *   before 链、重复推进世界（round 虚增），比漏推进更难查；也不许为对齐去改宿主历史。
     */
    alignRound(chat) {
      const out = { available: false, sentLen: 0, hostLen: 0, known: 0, unknown: 0, coverage: 0, mismatch: 0, monotonic: true, drift: false, reason: 'absent' };
      if (!WA.msgAlign || typeof WA.msgAlign.align !== 'function') return out;
      if (!Array.isArray(chat)) { out.reason = 'bad-sent-chat'; return out; }
      let ctxChat = null;
      try { const c = getCtx(); ctxChat = (c && Array.isArray(c.chat)) ? c.chat : null; } catch (e) { ctxChat = null; }
      if (!ctxChat) { out.reason = 'no-host-chat'; return out; }
      out.available = true;
      out.reason = 'ok';
      out.sentLen = chat.length;
      out.hostLen = ctxChat.length;
      const sentText = function (m) {
        try { return WA.msgAlign.textOf(m && (m.content != null ? m.content : m.mes)); } catch (e) { return ''; }
      };
      const hostText = function (m) {
        try { return WA.msgAlign.textOf(m && m.mes); } catch (e) { return ''; }
      };
      try {
        const structured = ctxChat.map(function (m, i) { return { identifier: 'chat#' + i, content: hostText(m) }; });
        const ids = WA.msgAlign.align(chat.map(function (m) { return { content: sentText(m) }; }), structured);
        const st = WA.msgAlign.stat(ids, chat);
        out.known = st.known; out.unknown = st.unknown; out.coverage = st.coverage;
        let prev = -1;
        ids.forEach(function (id) {
          if (!id) return;
          const n = parseInt(String(id).split('#')[1], 10);
          if (!isFinite(n)) return;
          if (n <= prev) out.monotonic = false;
          prev = n;
        });
        const n = Math.min(chat.length, ctxChat.length);
        let mm = 0;
        for (let i = 0; i < n; i++) {
          let a = '', b = '';
          try { a = WA.msgAlign.loose(sentText(chat[i])); b = WA.msgAlign.loose(hostText(ctxChat[i])); } catch (e) { continue; }
          if (a !== b) mm++;
        }
        out.mismatch = mm;
        out.drift = (chat.length !== ctxChat.length) || mm > 0 || !out.monotonic;
      } catch (e) {
        out.reason = 'error';
        out.error = String((e && (e.message || e)) || e).slice(0, 120);
      }
      return out;
    },
    install() {
      if (installed) return;
      installed = true;
      const ctx = getCtx();
      if (ctx && ctx.eventSource && ctx.eventTypes) {
        // after_reply：AI回复完成后
        const et = ctx.eventTypes;
        const afterEvt = et.GENERATION_ENDED || et.MESSAGE_RECEIVED;
        if (afterEvt && !afterHooked) {
          afterHooked = true;
          ctx.eventSource.on(afterEvt, async (...args) => {
            // v0.7.0: 楼层结算守卫——世界推进（round++/骰子/风声/推演）每楼层至多一次。
            // 重掷（swipe）/重复通知不再虚增世界时间（探针实证 round 1→2→3 虚增）。
            let settleRec = null, guardWhy = null;
            if (WA.settleGuard) {
              const g = WA.settleGuard.begin();
              if (!g.settle) {
                guardWhy = g.reason;
                WA.settleGuard.markSkip(guardWhy);
                WA.log('info', '楼层结算守卫：跳过本轮世界推进（' + guardWhy + '；forceNext 可强制）');
                // 保留 lastRoundSig 语义的一致性：after 链未执行不更新（下次同楼层仍跳过）
                return;
              }
              settleRec = g.rec;
            }
            // 重新构建与before链同源的ctx（含chat/branchId），供after链节点使用
            const c = getCtx();
            const chatArr = (c && c.chat) || [];
            // v2.1.0: 口径保护——本楼层若已被输出净化改写过 mes，世界推进期间临时还原原文
            //   （MESSAGE_RECEIVED 早于 GENERATION_ENDED 派发，不还原则推进读到净化文本）
            const tailMsg = chatArr.length ? chatArr[chatArr.length - 1] : null;
            const purifiedText = (tailMsg && __purifiedRaw.has(tailMsg)) ? tailMsg.mes : null;
            if (purifiedText != null) tailMsg.mes = __purifiedRaw.get(tailMsg);
            const actx = {
              args,
              type: 'after',
              chat: chatArr,
              store: WA.store ? WA.store.get() : null,
              branchId: WA.store ? WA.store.currentBranchId() : 'b0',
              injections: []
            };
            // v0.1.31: 写合并——after 链同样只推进内存，链结束统一落盘一次
            try {
              // v2.150.0(RP4): 价值结算的唯一生产方。位置是硬约束——必须在 after 链推进
              //   世界之前：workflow.run('after') 会把 round++，推进之后再去读
              //   store.lastInjection.round 比对，拿到的已是下一轮，于是每轮都会被自己判成
              //   「轮次不符(stale-round)」而全军覆没。正文取 tailMsg.mes——与 after 链读的是
              //   同一个对象（净化原文已在上方临时还原），不另取一份。
              try {
                if (WA.injectValue && typeof WA.injectValue.settle === 'function') {
                  WA.injectValue.settle(tailMsg && tailMsg.mes);
                }
              } catch (eIV) { /* 观测失败不影响世界推进 */ }
              // v2.245.0 (MAP-1): 提取正文末尾的位置标记 `<位置 人物="...">地点</位置>` 并更新空间坐标
              try {
                if (WA.geoTracker && typeof WA.geoTracker.readLocationMarks === 'function' && tailMsg && tailMsg.mes) {
                  const marks = WA.geoTracker.readLocationMarks(tailMsg.mes);
                  if (marks && marks.length) {
                    marks.forEach(m => {
                      const who = (m[1] || '').trim();
                      const loc = (m[2] || m[3] || '').trim();
                      if (who && loc) {
                        WA.geoTracker.updateCharacterLocation(who, loc);
                      }
                    });
                  }
                }
              } catch (eGeo) { /* 位置感知失败不影响世界推进 */ }
              // v2.250.0（拓展）：三个新引擎的推进点。位置在 after 链**之前**、且都在
              //   各自的 try 里——任一引擎抛错都不影响世界推进（与 geoTracker 同口径）。
              //   · genTiming.tick：掷一次「现在该不该主动找他」，只出裁定不发消息；
              //     观测取现场（钟点 / 玩家上一条的长度与时延），roll 不注入 ⇒ 走决策流。
              //   · oneShotMod.advance：临时调制按轮过期（消费即焚之外的第二条出路）。
              //   · moodGlide.glide：情绪按经过分钟数向各自基线回落、思念同轴累积。
              try {
                if (WA.genTiming && typeof WA.genTiming.tick === 'function') {
                  let lastUser = null;
                  for (let i = chatArr.length - 1; i >= 0; i--) {
                    if (chatArr[i] && chatArr[i].is_user) { lastUser = chatArr[i]; break; }
                  }
                  const obs = { hour: new Date().getHours() };
                  if (lastUser && typeof lastUser.mes === 'string') {
                    obs.replyLen = lastUser.mes.length;
                    const at = Date.parse(lastUser.send_date || lastUser.sendDate || '');
                    if (isFinite(at)) obs.replyGapMin = Math.max(0, (clockNow('interceptor:obs') - at) / 60000);
                  }
                  WA.genTiming.tick(obs);
                }
              } catch (eGT) { /* 时机决策失败不影响世界推进 */ }
              try {
                if (WA.oneShotMod && typeof WA.oneShotMod.advance === 'function') WA.oneShotMod.advance();
              } catch (eOSM) { /* 调制过期失败不影响世界推进 */ }
              try {
                if (WA.moodGlide && typeof WA.moodGlide.glide === 'function') WA.moodGlide.glide({});
              } catch (eMG) { /* 情绪回落失败不影响世界推进 */ }
              const runAfter = async () => {
                await WA.workflow.run('after', actx);
                // v0.7.0: 结算完成才记录楼层（批内提交，随批落盘；失败阻断则下轮重试）
                if (WA.settleGuard && settleRec) WA.settleGuard.commit(settleRec);
                // v2.231.0（优化 OPT-5）：after 链跑完 ⇒ 把「这一楼改了哪些世界键」落成存档账。
                //   必须在 workflow.run('after') **之后**：链里才是真正的结算发生地；
                //   也必须在 settleGuard.commit 之后（被跳过的轮不进这里，故不会记空账）。
                try { if (WA.floorSettle) WA.floorSettle.endRound(); } catch (e) { WA.log('warn', '楼层结算记账失败', e); }
                // v2.518.0：正文成功推进后只开启一次可追踪故事回应窗口。
                // 只在 after 链完成且楼层结算提交后调用；重复通知由 storyWindow 自身幂等守卫拒绝。
                try {
                  if (WA.storyWindow && typeof WA.storyWindow.open === 'function') {
                    // 新的一轮正文推进 ⇒ 上一窗口的介入期已经过去：把它如实结算掉。
                    //   为什么必须结算而不是留着：窗口的 pending 只应有一条「当前可介入」的，
                    //   留着旧窗会让玩家页永远挂着一个早已翻篇的入口（历史上表现为
                    //   「页面上还摆着三章前的那件事」）。结算证据说明是**被新正文推进取代**的，
                    //   不是「玩家处理完了」——两件事在台账里必须可区分。
                    try {
                      const prev = WA.storyWindow.current();
                      if (prev && prev.id && prev.status !== 'settled' && prev.status !== 'failed') {
                        WA.storyWindow.settle(prev.id, { status: 'settled', owner: 'core/interceptor',
                          evidence: 'superseded-by-next-reply' });
                      }
                    } catch (eSettle) { WA.log('warn', '上一故事回应窗口结算失败', eSettle); }
                    const replyText = tailMsg && typeof tailMsg.mes === 'string' ? tailMsg.mes : '';
                    const chatLen = chatArr.length;
                    const replyId = chatLen + ':' + (tailMsg && tailMsg.swipe_id != null ? tailMsg.swipe_id : 0) + ':' + replyText.length;
                    WA.storyWindow.open({ id: replyId, text: replyText, chatLength: chatLen,
                      source: 'interceptor.after', evidence: 'after-chain-committed' });
                  }
                } catch (eSW) { WA.log('warn', '故事回应窗口开启失败', eSW); }
              };
              if (WA.store && WA.store.batch) await WA.store.batch(runAfter); else await runAfter();
            }
            catch (e) { WA.log('error', 'after链执行异常', e); }
            finally { if (purifiedText != null && tailMsg) tailMsg.mes = purifiedText; }   // v2.1.0: 恢复净化文本
          });
        }
        // v2.1.0: 输出侧净化——purifier.apply 此前全库零调用（功能整体失效）
        //   只改显示文本、不动世界结算口径：世界推进基于原文，净化仅影响用户所见。
        if (et.MESSAGE_RECEIVED && !purifyHooked) {
          purifyHooked = true;
          ctx.eventSource.on(et.MESSAGE_RECEIVED, () => {
            try {
              // v2.302.0（缝 World Chronicle）：内联状态回报标签。
              //   **必须**用**原文**解析，且排在净化链之前——净化会改写文本，
              //   用净化后的文本解析等于让标签读数依赖另一条链（口径漂移）。
              //   只解析与落账，不改显示文本；隐藏显示由 WA.inlineTags.strip 提供。
              if (WA.inlineTags && typeof WA.inlineTags.apply === 'function') {
                const c0 = getCtx();
                const chat0 = (c0 && c0.chat) || [];
                const last0 = chat0[chat0.length - 1];
                if (last0 && !last0.is_user && typeof last0.mes === 'string' && WA.inlineTags.hasTag(last0.mes)) {
                  const r = WA.inlineTags.apply(last0.mes);
                  if (r && r.ok === false) WA.log('warn', '内联标签落账失败：' + r.reason);
                }
              }
            } catch (e) { WA.log && WA.log('warn', '内联标签解析异常', e); }
            // v2.542.21（正文待选按钮接通）：choice-board 的 mount() 此前**全库零调用**——
            //   引擎能兑现（story-choice → branchTree → commit 三段都在），玩家却在聊天里
            //   一个按钮都点不到，只能切到机制页手输选择点 ID。
            //   复用**已有的** MESSAGE_RECEIVED 监听位（不新增订阅、不占监听位），
            //   延后一帧再挂：DOM 渲染略晚于本回调。挂不上由引擎自己如实报 reason，
            //   这里只把非预期码记 warn（no-pending / disabled / no-chat / no-doc / no-message 是正常环境缺失）。
            if (WA.choiceBoard && typeof WA.choiceBoard.mount === 'function') {
              try {
                const later = function () {
                  try {
                    const mr = WA.choiceBoard.mount();
                    const calm = ['no-pending', 'disabled', 'no-chat', 'no-doc', 'no-message'];
                    if (mr && mr.ok === false && calm.indexOf(mr.reason) < 0) WA.log && WA.log('warn', '待选按钮未挂载：' + mr.reason);
                  } catch (e2) { WA.log && WA.log('warn', '待选按钮挂载异常', e2); }
                };
                if (typeof setTimeout === 'function') setTimeout(later, 60);
              } catch (e) { WA.log && WA.log('warn', '待选按钮调度失败', e); }
            }
            if (WA.periodicals) Promise.resolve().then(() => WA.periodicals.checkAndPublish()).catch(e => WA.log('warn', '期刊调度异常', e));
            try {
              if (!WA.purifier || typeof WA.purifier.applySafe !== 'function') return;
              const c = getCtx();
              const chat = (c && c.chat) || [];
              const last = chat[chat.length - 1];
              if (!last || last.is_user || typeof last.mes !== 'string' || !last.mes) return;
              let out = WA.purifier.applySafe(last.mes);
              // v2.247.0 (SYS-DEF-1): 接入 healthPreflight 后置健康体检与去八股/技术标签防御
              if (WA.healthPreflight && typeof WA.healthPreflight.inspectAndSanitize === 'function') {
                const checked = WA.healthPreflight.inspectAndSanitize(out, { autoFix: true });
                out = checked.text;
              // v2.248.0 (ANTI-OMNI): 结合防全知下游审查，若违规记录警告并在审计台账留痕
              if (WA.antiOmniscience && typeof WA.antiOmniscience.auditGeneratedContent === 'function') {
                const s = (WA.store && WA.store.get) ? WA.store.get() : {};
                const secrets = (s && s.epistemicStore && s.epistemicStore.secrets) || [];
                WA.antiOmniscience.auditGeneratedContent({ name: '当前NPC' }, out, secrets);
              }
              // v2.249.0 (PA-1): 结合性格绝对锚定审查，若出现禁忌反应/OOC漂移则在审计台账留痕
              if (WA.personaAnchor && typeof WA.personaAnchor.auditGeneratedContent === 'function') {
                const activeNames = (WA.registry && typeof WA.registry.list === 'function') ? WA.registry.list() : [];
                activeNames.forEach(function (n) {
                  WA.personaAnchor.auditGeneratedContent(n, out);
                });
              }
              // v2.250.0 (OG-1): 核对「正文里的玩家引述」是否真在会话里说过。
              //   只取**玩家侧**发言做对照（角色自己说的话不算凭据）；本模块不改正文，
              //   block 档也只出裁定与改写建议 —— 静默改写玩家会不知道模型编过。
              if (WA.outputGuard && typeof WA.outputGuard.checkAndRemember === 'function') {
                const said = [];
                for (let i = 0; i < chat.length - 1; i++) {
                  const m = chat[i];
                  if (m && m.is_user && typeof m.mes === 'string' && m.mes) said.push(m.mes);
                }
                WA.outputGuard.checkAndRemember(out, said);
              }
              }
              // v2.547.0：注入原文洗除。位置是硬约束 —— 必须在净化之后（out 才是要写回历史的
              //   文本）、写回之前（写回后再洗要再触发一次宿主重绘，且中间那一版已经进了存档）。
              //   只采用「真删掉了登记原文且没有多处命中」的结果，其余一律不动正文。
              if (WA.interceptor && typeof WA.interceptor.scrubReply === 'function') {
                try {
                  const sr = WA.interceptor.scrubReply(out);
                  if (sr && sr.adopted && typeof sr.text === 'string') {
                    out = sr.text;
                    WA.log('info', '正文里的注入复述已洗除：' + sr.removed + ' 段（未命中登记原文 ' + sr.missing + ' 段）');
                  } else if (sr && sr.reason === 'over-match') {
                    WA.log('warn', '注入复述疑似多处命中（' + sr.overMatch + ' 处），按判据不洗：宁可不洗，不许误删正文');
                  }
                } catch (eSR) { WA.log('warn', '注入洗除失败（不影响生成结果）', eSR); }
              }
              if (out !== last.mes) {
                __purifiedRaw.set(last, last.mes);   // 原文快照：世界推进仍基于原文
                last.mes = out;
                // 通知宿主重绘该楼层（ST 侧 API 存在才调用，缺失不报错）
                try { if (c && typeof c.updateMessageBlock === 'function') c.updateMessageBlock(chat.length - 1, last); } catch (e) { /* 宿主重绘非必需 */ }
              }
            } catch (e) { WA.log('warn', '输出净化失败（不影响生成结果）', e); }
          });
        }
        // 切聊天：重载store + 旧异步失效
        if (et.CHAT_CHANGED) {
          ctx.eventSource.on(et.CHAT_CHANGED, () => {
            try { if (WA.render && WA.render.uninject) WA.render.uninject('chat-changed'); } catch (e) { WA.log('warn', 'chat uninject failed', e); }
            try { WA.store.init(); } catch (e) { WA.log('error', '切聊天重载store失败', e); }
            // v2.231.0（优化 OPT-6）：切聊天 = 换了一份存档 ⇒ 关系图谱的内存索引必须
            //   从**新存档**重建。不重建的话，上一个聊天的人物关系会留在表里冒充本聊天的
            //   ——这是「单一持久来源」这一条最容易破的地方（store 重载了、模块缓存没跟上）。
            try { if (WA.relationGraph && typeof WA.relationGraph.reload === 'function') WA.relationGraph.reload(); }
            catch (e) { WA.log('warn', '切聊天重建关系图谱索引失败', e); }
            try { if (WA.monologue && typeof WA.monologue.resetMemo === 'function') WA.monologue.resetMemo(); }
            catch (e) { WA.log('warn', '切聊天清独白缓存失败', e); }
            // v2.542.21：切聊天 = 换了一份存档 ⇒ 上个存档的待选按钮必须下架，
            //   否则它会在新聊天里冲当本聊天的选项（与关系图谱重建同一条“单一持久来源”）。
            try { if (WA.choiceBoard && typeof WA.choiceBoard.unmount === 'function') WA.choiceBoard.unmount(); }
            catch (e) { WA.log('warn', '切聊天清理待选按钮失败', e); }
            WA.emit && WA.emit('chat:changed');
          });
        }
        // ── v2.50.0（第三十五面）块1：宿主两侧事件面 ──────────────────────────
        // 缝合来源：Luker 的 World Info Activation Trace + Nocturne 的 change-rollback。
        // 为什么必须挂在**这里**：全库 eventSource.on 此前只有 5 处，且零订阅
        // WORLD_INFO_ACTIVATED / MESSAGE_DELETED / MESSAGE_EDITED——于是两件事不可观测：
        //   · 宿主自己那次世界书扫描注入了哪几条（engines/worldbook.js 读的是**条目定义**，
        //     不是「本轮实际注入」）；用户改不动条目时只能拿到一句「感觉没生效」。
        //   · 楼层被删/被编辑后，记忆 L0~L3、facts、伏笔、entityMemory、chronicle 全都还
        //     指着不存在的楼层（判据早就有——timeline.auditRefs 会算 missing/changed——
        //     但没有触发点，没人回收）。
        // 口径：事件名可能缺席（宿主版本差异）⇒ **显式**回报 unsupported，绝不静默当成
        //   「本轮没有条目激活」/「没人删楼」（那是把环境差异伪装成事实）。
        const wiEvt = et.WORLD_INFO_ACTIVATED;
        if (WA.hostWbTrace) {
          if (wiEvt) {
            ctx.eventSource.on(wiEvt, function (payload) {
              try { WA.hostWbTrace.onActivated(payload); }
              catch (e) { WA.log('warn', '宿主世界书激活记账失败（不影响生成）', e); }
            });
            WA.hostWbTrace.markSubscribed('subscribed');
            WA.log('info', '已订阅宿主世界书激活事件（' + String(wiEvt) + '）');
          } else {
            WA.hostWbTrace.markSubscribed('unsupported');
            WA.log('warn', '宿主未提供 WORLD_INFO_ACTIVATED：世界书激活面标为「不可观测」（不等于本轮无激活）');
          }
        }
        if (WA.floorChanges) {
          const delEvt = et.MESSAGE_DELETED, edEvt = et.MESSAGE_EDITED;
          let hooked = 0;
          if (delEvt) {
            ctx.eventSource.on(delEvt, function () {
              try { WA.floorChanges.onFloorEvent('deleted', { args: Array.prototype.slice.call(arguments) }); }
              catch (e) { WA.log('warn', '楼层删除记账失败', e); }
              // v2.231.0（优化 OPT-5）：删**最后一楼** ⇒ 自闭环退回该楼结算；删中间楼 ⇒ 只出范围。
              try { if (WA.floorSettle) WA.floorSettle.onFloorEvent('deleted', { args: Array.prototype.slice.call(arguments) }); }
              catch (e) { WA.log('warn', '楼层结算退回失败', e); }
            });
            hooked++;
          }
          if (edEvt) {
            ctx.eventSource.on(edEvt, function () {
              try { WA.floorChanges.onFloorEvent('edited', { args: Array.prototype.slice.call(arguments) }); }
              catch (e) { WA.log('warn', '楼层编辑记账失败', e); }
              // v2.231.0（优化 OPT-5）：编辑同样走一次「这一楼还 live 吗」——最后一楼被改
              //   ⇒ 退回它的结算（新内容会重新结算一次），中间楼 ⇒ 只出范围。
              try { if (WA.floorSettle) WA.floorSettle.onFloorEvent('edited', { args: Array.prototype.slice.call(arguments) }); }
              catch (e) { WA.log('warn', '楼层编辑结算对账失败', e); }
            });
            hooked++;
          }
          WA.floorChanges.markSubscribed(hooked ? 'subscribed' : 'unsupported');
          if (!hooked) WA.log('warn', '宿主未提供 MESSAGE_DELETED / MESSAGE_EDITED：楼层变更面标为「不可观测」');
        }
        WA.log('info', '拦截器安装完成（事件源已挂接）');
      } else {
        WA.log('warn', '未检测到SillyTavern事件源，仅拦截器函数可用');
        // v2.50.0 块1：无宿主事件源 ⇒ 两个新面**如实**标为不可观测（不是「一切正常」）
        try { if (WA.hostWbTrace) WA.hostWbTrace.markSubscribed('unsupported'); } catch (e) {}
        try { if (WA.floorChanges) WA.floorChanges.markSubscribed('unsupported'); } catch (e) {}
      }
    }
  };

  // 轻量事件总线（模块间解耦通信）
  // v0.1.28: 总线健康——异常聚合计数、监听器去重与泄漏告警、emit 快照防自增删破坏
  const listeners = {};
  const LEAK_THRESHOLD = 24;
  const busStat = {}; // evt -> {emits, errors, lastError, leakedWarned}
  function stat(evt) { return busStat[evt] || (busStat[evt] = { emits: 0, dead: 0, errors: 0, lastError: null, lastAt: 0, leakedWarned: false }); }
  WA.on = (evt, fn) => {
    if (!evt || typeof fn !== 'function') return function () {};
    const arr = listeners[evt] || (listeners[evt] = []);
    if (arr.indexOf(fn) >= 0) { WA.log('warn', '事件重复订阅已忽略: ' + evt); return function () {}; }
    arr.push(fn);
    const st = stat(evt);
    if (arr.length > LEAK_THRESHOLD && !st.leakedWarned) {
      st.leakedWarned = true;
      WA.log('warn', '事件监听器疑似泄漏: ' + evt + ' 已有 ' + arr.length + ' 个监听器（检查是否有每轮注册未解绑）');
    }
    return function off() {
      try { const i = arr.indexOf(fn); if (i >= 0) arr.splice(i, 1); } catch (e) {}
    };
  };
  WA.off = (evt, fn) => {
    const arr = listeners[evt];
    if (!arr) return false;
    const i = arr.indexOf(fn);
    if (i < 0) return false;
    arr.splice(i, 1);
    return true;
  };
  WA.emit = (evt, data) => {
    const st = stat(evt);
    st.emits++;
    const arr = listeners[evt];
    if (!arr || !arr.length) { st.dead++; return 0; }   // v0.1.28: 无人监听 = 死信号
    let called = 0;
    arr.slice().forEach(fn => {   // 快照：监听器内部 on/off 不影响本轮派发
      try { fn(data); called++; }
      catch (e) {
        st.errors++; st.lastAt = clockWall();
        st.lastError = String((e && (e.message || e)) || e).slice(0, 180);
        WA.log('warn', '事件监听异常 ' + evt, e);
      }
    });
    return called;
  };
  WA.busStats = function (topN) {
    const rows = Object.keys(busStat).map(function (evt) {
      const st = busStat[evt];
      return { event: evt, listeners: (listeners[evt] || []).length, emits: st.emits, dead: st.dead || 0, errors: st.errors, lastError: st.lastError, lastAt: st.lastAt, leakSuspect: (listeners[evt] || []).length > LEAK_THRESHOLD };
    });
    rows.sort(function (a, b) { return (b.errors - a.errors) || (b.listeners - a.listeners); });
    const n = topN && topN > 0 ? topN : 12;
    return { events: rows.slice(0, n), tracked: rows.length, totalListeners: Object.keys(listeners).reduce(function (s, k) { return s + listeners[k].length; }, 0) };
  };
  WA.LEAK_THRESHOLD = LEAK_THRESHOLD;
})();
