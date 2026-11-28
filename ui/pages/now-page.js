/**
 * WorldAxis ui/pages/now-page.js — 玩家面「此刻」页（v2.518.0 · UI-P1）
 *
 * ── 它治什么 ────────────────────────────────────────────────────────────
 *   旧「概览」页是照引擎结构排的：六张计数卡（追踪人物 / 活跃暗流 / 长期事实 /
 *   演化回合 / 工作流节点）+ 十余个折叠大盘 + 引擎自检。读数确实都在，但它们回答的是
 *   「引擎跑了多少」，玩家要问的是「我现在在哪、谁在场、刚刚发生了什么」。两者不是一回事。
 *
 *   现场实测（新开局）：六张卡全是 0 或「未设定」，下面 7 行是灰字「暂无……」，
 *   第一屏几乎全是空状态——信息量最低的一屏占了最重要的位置。
 *
 * ── 本页落点（三条）────────────────────────────────────────────────────
 *   ① **按阶段分屏**：`clock.label` 为空 ⇒ 尚未开局，整屏只给一条引导（下一步 + 回对话）；
 *      开局后 ⇒ 场景卡（世界时 / 地点 / 在场者）+ 刚刚变化的几条。
 *   ② **空白块不渲染**：没有内容的段直接返回空串，不产出「暂无」占位。整页无内容时
 *      只留一行引导。「列一排暂无」把「还没有」和「读不到」混成同一种观感，本仓
 *      worldDiary / intentBoard 的 `quiet` / `empty` 两态正是为分开它们而存在的。
 *   ③ **叙事句优先**：变化条目写的是「谁做了什么」的句子（沿用引擎给的文案），
 *      计数不单独成卡；要精确读数请去开发者模式的原页（PAGES 一字未动）。
 *
 * ── 边界（全部否定式，与同仓 ui 模块同规）───────────────────────────────
 *   1 **不另造数据**：只读既有出口（firstRun / worldDiary / intentBoard / stageSession /
 *     store）。出口缺席 ⇒ 该段不渲染（不是渲染一个假值）。
 *   2 **不改状态**：本页零 store.transact、零 set*。读数就是读数。
 *   3 **不重复渲染宿主大盘**：V19/V20/V21 三块留在旧概览页（它们的判据钉在那儿），
 *     本页不搬、不抄第二份。
 *   4 **异常隔离**：任一段抛错只让该段消失并留一行可归因文本，绝不让整页白屏
 *     （与 overview-main 的 __dashboardBlock 同一条纪律）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  /** 统一的转义出口：真源 core/sanitize.js，缺席时兜底（与 ui/panel.js 同口径）。 */
  function esc(s) {
    if (WA && WA.sanitize && typeof WA.sanitize.html === 'function') return WA.sanitize.html(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '"', "'": '&#39;' }[c];
    });
  }

  /** 安全调用：出口缺席或抛错都返回 fallback，绝不冒泡到整页渲染。 */
  function safe(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
  }

  function store() {
    return safe(function () { return WA.store.get(); }, null);
  }

  /** 开局前：整屏只回答「下一步做什么」，一句一行，不给计数。 */
  function bootCard(alreadyStarted) {
    //   已经开局（clock.label 有值）就不再给引导：此时玩家要的是「我现在在哪」，
    //   而不是「先配个 API」。实测过的坏形态：开局后首屏仍顶着「准备开局 1/4」，
    //   读起来像系统认为你还没开始玩。
    if (alreadyStarted) return '';
    const fr = safe(function () { return WA.firstRun.build(); }, null);
    if (!fr || fr.ok !== true) return '';
    if (fr.dismissed === true) return '';
    const steps = Array.isArray(fr.steps) ? fr.steps : [];
    if (!steps.length) return '';
    const rows = steps.slice(0, 4).map(function (s) {
      const done = s.state === 'done' || s.state === 'skipped';
      const mark = done ? '✓' : '○';
      const cls = done ? 'wa-now-step is-done' : 'wa-now-step';
      const hint = (!done && s.exit && s.exit.hint) ? '<div class="wa-now-step-hint">' + esc(s.exit.hint) + '</div>' : '';
      return '<li class="' + cls + '"><span class="wa-now-step-mark" aria-hidden="true">' + mark + '</span>'
        + '<span class="wa-now-step-title">' + esc(s.title || s.id) + '</span>' + hint + '</li>';
    }).join('');
    return '<section class="wa-now-card wa-now-boot">'
      + '<h3 class="wa-now-card-t">准备开局</h3>'
      + '<ul class="wa-now-steps">' + rows + '</ul>'
      + '<p class="wa-now-note">世界会从你说出的第一句话开始。</p>'
      + '<div class="wa-now-actions"><button class="wa-btn" id="wa-now-back-chat">回到对话</button></div>'
      + '</section>';
  }

  /** 场景卡：世界时 / 地点 / 在场者。三个都空则不渲染这一卡。 */
  function sceneCard() {
    const s = store();
    if (!s) return '';
    const clockLabel = (s.clock && s.clock.label) ? String(s.clock.label) : '';
    const places = safe(function () {
      const r = s.region && Array.isArray(s.region.places) ? s.region.places : [];
      return r.map(function (p) { return p && (p.name || p.label); }).filter(Boolean);
    }, []);
    const activePlace = safe(function () {
      const r = s.region && Array.isArray(s.region.places) ? s.region.places : [];
      const hit = r.filter(function (p) { return p && (p.active === true || p.current === true); })[0];
      return hit ? (hit.name || hit.label || '') : '';
    }, '');
    const people = safe(function () {
      const pk = Object.keys(s.people || {});
      return pk.map(function (k) { const p = s.people[k] || {}; return p.name || k; }).filter(Boolean);
    }, []);
    const stage = safe(function () { return WA.stageSession && WA.stageSession.view(); }, null);
    const onStage = safe(function () {
      if (!stage || stage.ok !== true) return [];
      const rows = Array.isArray(stage.rows) ? stage.rows : (Array.isArray(stage.cast) ? stage.cast : []);
      return rows.map(function (r) { return r && (r.name || r.id); }).filter(Boolean);
    }, []);
    const present = onStage.length ? onStage : people;

    if (!clockLabel && !activePlace && !present.length) return '';

    let html = '<section class="wa-now-card wa-now-scene">';
    if (clockLabel) html += '<div class="wa-now-when">' + esc(clockLabel) + '</div>';
    if (activePlace || places.length) {
      html += '<div class="wa-now-where">' + esc(activePlace || places[0]) + '</div>';
    }
    if (present.length) {
      html += '<div class="wa-now-who"><span class="wa-now-lbl">在场</span>'
        + esc(present.slice(0, 6).join('、')) + '</div>';
    }
    html += '</section>';
    return html;
  }

  /** 刚刚：世界日记的条目（镜头外发生的事）。安静即不渲染。 */
  function justNowBlock() {
    const d = safe(function () { return WA.worldDiary.build(); }, null);
    if (!d || d.ok !== true) return '';
    const items = Array.isArray(d.items) ? d.items : [];
    if (!items.length) return '';
    const rows = items.slice(0, 5).map(function (it) {
      const text = typeof it === 'string' ? it : ((it && (it.text || it.line)) || '');
      return text ? '<li>' + esc(text) + '</li>' : '';
    }).filter(Boolean).join('');
    if (!rows) return '';
    return '<section class="wa-now-card"><h3 class="wa-now-card-t">刚刚</h3>'
      + '<ul class="wa-now-list">' + rows + '</ul></section>';
  }

  /** 值得留意：人物意图看板 —— 「有人在往哪走、谁卡住了」。空则不渲染。 */
  //  ⚠ v2.539.9 现场（本轮抓到的真缺陷，不是措辞问题）：
  //    这一块原来读 `r.text || r.title || r.label`，而 `WA.intentBoard.view().rows`
  //    的每一项来自引擎的 rowOf()，真字段是 **name / goalText / step.text / isBlocked /
  //    blocked** —— 三个候选字段**一个都不存在**。于是 rows 明明非空，也被
  //    `.filter(Boolean)` 滤成空串 ⇒ 整块永远 `return ''`：
  //    这块「值得留意」是**从来没出现过一次的死面**，而它读起来像「世界很安静」。
  //    这正是本仓反复裁决过的形态：面板按自己以为的字段名读引擎的返回 = 第二个措辞真源。
  //  修法：按引擎真字段读；句式照引擎 buildBlock() 自己那一句
  //    （`名字 → 目标：第 n/total 步「当前步」，卡在 原因`），面板不另编一套。
  function noticeBlock() {
    const b = safe(function () { return WA.intentBoard.view(); }, null);
    if (!b || b.ok !== true) return '';
    const rows = Array.isArray(b.rows) ? b.rows : [];
    if (!rows.length) return '';
    const stuck = rows.filter(function (r) { return r && r.isBlocked === true; });
    // 有卡住的就先说卡住的 —— 那才是「值得留意」；一条没卡才退回列出在推的
    const pick = (stuck.length ? stuck : rows).slice(0, 4);
    const li = pick.map(function (r) {
      if (!r) return '';
      const at = (r.step && r.step.text)
        ? ('第 ' + r.step.seq + '/' + r.total + ' 步「' + r.step.text + '」')
        : '（没有当前步）';
      const why = (Array.isArray(r.blocked) && r.blocked.length) ? ('，卡在 ' + r.blocked.join('、')) : '';
      return '<li>' + esc((r.name || '（无名）') + ' → ' + (r.goalText || '（目标未命名）') + '：' + at + why) + '</li>';
    }).filter(Boolean).join('');
    if (!li) return '';
    return '<section class="wa-now-card"><h3 class="wa-now-card-t">'
      + (stuck.length ? '有人卡住了' : '人物在往哪走') + '</h3>'
      + '<ul class="wa-now-list">' + li + '</ul></section>';
  }

  /** 整页无内容时的唯一引导：一句话，不列「暂无」。 */
  function emptyHint() {
    return '<section class="wa-now-card wa-now-empty">'
      + '<p class="wa-now-note">世界还没开始动。先说一句话，或者点开「人物」「世界」看看已有的东西。</p>'
      + '<div class="wa-now-actions"><button class="wa-btn" id="wa-now-back-chat">回到对话</button></div>'
      + '</section>';
  }

  /** 结论卡（v2.539.9 · 六页内容重写 · 概览页）：这一页的 ask 是「此刻该做什么」。 */
  //  病（现场）：开局后首屏是「场景卡（时间/地点/在场）→ 刚刚 → 值得留意」，
  //    全是**状态**。玩家读完三块，仍然得自己推断下一步——而这一页的 ask 逐字就是
  //    「此刻该做什么 —— 时间、章节、待办、下一拍」，页面上却没有一句话直接回答它。
  //    其中「章节」与「下一拍」在首屏**完全不存在**（章节只在事件页里出现）。
  //  修法：三句，全部复用本文件已读的出口（store / intentBoard），零新增读口、零新控件：
  //    ① 你在哪 —— 「时间 · 第 N 章《标题》」，没起章就明说没起（不写「无」）
  //    ② 谁在动 —— 人物意图看板：几人在推、其中有几人卡住（有卡住的就点名）
  //       ⚠ 这一句最初写的是「待办：你欠几件」。**写错了**：intentBoard 的 rows 来自
  //         引擎 rowOf()，语义是 **NPC 的意图链**（读 WA.plan.chain），不是玩家的待办。
  //         把 NPC 的打算称作「你的待办」= 面板给引擎的读数另起了一个语义（同族第二措辞真源）。
  //         现在照引擎原义写「谁在推、谁卡住」，第③句才据此给出可执行的下一拍。
  //    ③ 所以下一拍 —— 有人卡住就先解卡点，没人卡就说一句话推进时间
  //  边界（与本文件头同规）：出口缺席 ⇒ 该句写成「读数不可用」，
  //    **绝不塌成「没有」** —— 「算不出来」与「本来就没有」必须是两种形态。
  function verdictBlock() {
    const s = store();
    if (!s) return '';
    const lines = [];
    const clockLabel = (s.clock && s.clock.label) ? String(s.clock.label) : '';
    const ch = (s.chapters && s.chapters.current) ? s.chapters.current : null;
    const chTxt = (ch && ch.no)
      ? ('第 ' + ch.no + ' 章' + (ch.title ? '「' + ch.title + '」' : ''))
      : '还没起章（去「事件」页起一章，今天/明天才有归属）';
    lines.push(clockLabel
      ? ('现在：' + clockLabel + ' · ' + chTxt)
      : ('世界时间还没设定 · ' + chTxt));
    const b = safe(function () { return WA.intentBoard.view(); }, null);
    const rows = (b && b.ok === true && Array.isArray(b.rows)) ? b.rows : null;
    const stuck = rows ? rows.filter(function (r) { return r && r.isBlocked === true; }) : [];
    if (!rows) {
      lines.push('谁在动：读数不可用（engines/intent-board.js 缺席或未返回）—— 这不是「没人有打算」');
    } else if (!rows.length) {
      lines.push('谁在动：眼下没有人有推进中的打算');
    } else if (stuck.length) {
      const who = stuck.slice(0, 2).map(function (r) { return r.name || '（无名）'; }).join('、');
      lines.push('谁在动：' + rows.length + ' 人在推，其中 ' + stuck.length + ' 人卡住了 —— ' + who);
    } else {
      lines.push('谁在动：' + rows.length + ' 人在推进，暂无人卡住');
    }
    lines.push(stuck.length
      ? '下一拍：先解「' + (stuck[0].name || '那一位') + '」的卡点（去「事件」页看卡在哪），或直接说一句话让世界先走一步'
      : '下一拍：说一句话推进时间（世界只在你有动作时往前走）');
    return '<div class="wa-verdict"><b>此刻</b><ul>'
      + lines.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('')
      + '</ul></div>';
  }

  const ferryWho = '渡口的阿舟';
  const ferryKey = 'first-scene:ferry-market:v1';
  function currentChat() { return safe(function () { return WA.store.chatId(); }, ''); }
  function ferryRow() {
    const read = WA.appointment.view({ who: ferryWho });
    if (!read.ok && read.reason !== 'actor-missing') throw Error('unreadable');
    return read.ok ? read.appointments.find(function (x) { return x && x.requestKey === ferryKey; }) : null;
  }
  const crossroads = '渡口岔路';
  const ferryRelief = '值渡的兰姨';
  function ferryPosition(row) {
    const pos = WA.world.where(row.withWhom);
    if (!pos.ok) throw Error('position');
    if (!pos.place && pos.reason === 'no-journey') {
      const active = ((store().region || {}).places || []).find(function (p) { return p && (p.active || p.current); });
      return Object.assign({}, pos, { origin: (active && (active.name || active.label)) || crossroads });
    }
    return pos;
  }
  function careId(row) { return 'ferry-care:' + row.id; }
  function hasCare(row) {
    return ((store().careChain || {}).commitments || []).some(function (c) {
      return c && c.id === careId(row) && c.caregiver === row.withWhom && c.placeId === '渡口' && c.ward === '渡口伤员';
    });
  }
  // Only the optional story's starter map may be filled in. Never revise an existing road's duration or capacity.
  function prepareStarter(from) {
    const map = store().world || {};
    if (from !== crossroads || (map.places || []).length || (map.roads || []).length) return;
    for (const name of [crossroads, '渡口', '东市']) {
      if (!WA.world.addPlace({ name: name }).ok) throw Error('place');
    }
    if (!WA.world.addRoad(from, '渡口', 10).ok || !WA.world.addRoad(from, '东市', 30).ok) throw Error('road');
  }
  function careEntry(row) {
    return ((store().careChain || {}).commitments || []).find(function (c) { return c && c.id === careId(row) && c.ward === '渡口伤员' && c.placeId === '渡口'; });
  }
  function sealItem(row) {
    return ((store().gear || {}).items || []).find(function (x) { return x && x.requestKey === 'ferry-seal:' + row.id; });
  }
  function takeSeal(row) {
    if (!row.reunion?.sealOffered || !WA.appointment.together(row.withWhom, ferryWho) || !WA.gear?.getSettings().enabled) return '现在不能交接。';
    let item = sealItem(row);
    if (!item) {
      const name = '掌柜的私印';
      const tx = WA.store.transact(function (d) {
        for (const who of [ferryWho, row.withWhom]) {
          if (!Object.values(d.people || {}).some(function (p) { return p && p.name === who; })) WA.registry.ensurePerson(d, 'p_' + who, who, 'ferry-story');
        }
        return WA.entities.upsert(d, 'object', { name: name }) !== 'skipped';
      }, 'ferry:register-seal');
      if (!tx.ok || tx.deferred) return '交接尚未确认。';
      WA.gear.make(name, { holder: ferryWho, requestKey: 'ferry-seal:' + row.id });
      item = sealItem(row);
    }
    if (!item || item.holder !== ferryWho) return '不能重复领取。';
    const ack = WA.gear.lend(item.id, row.withWhom, { from: ferryWho });
    return ack.ok && sealItem(row)?.holder === row.withWhom ? '你接过了掌柜的私印。' : '交接尚未确认。';
  }
  function departFor(who, from, to) {
    const plan = WA.travelDesk.plan({ from: from, to: to });
    return plan.ok ? WA.travelDesk.commit('depart', { person: who, from: from, to: to, stamp: plan.stamp }) : plan;
  }
  function npcDeparture(row) {
    const npc = WA.world.where(ferryWho);
    if (!npc.ok || npc.inTransit || npc.place === row.place) return;
    // This optional opening establishes the fork as his origin only on its own starter map.
    const fresh = !(store().world || {}).places?.length && !(store().world || {}).roads?.length;
    if (!npc.place && !(npc.reason === 'no-journey' && fresh && ferryPosition(row).origin === crossroads)) return;
    const origin = npc.place || crossroads;
    prepareStarter(origin);
    departFor(ferryWho, origin, row.place);
  }
  function journeyControls(row, chat) {
    if (!WA.world || !WA.travelDesk) return '';
    function button(key, label) { return '<button type="button" class="wa-btn" data-ferry="' + key + '" data-row="' + esc(row.id) + '" data-chat="' + esc(chat) + '">' + esc(label) + '</button>'; }
    const pos = ferryPosition(row), from = pos.place || pos.origin, care = hasCare(row);
    const entry = careEntry(row);
    let html = entry ? '<p>你曾在渡口接手照护。</p>' : '';
    if (!Object.values(store().people || {}).some(p => p?.name === ferryWho)) html += button('remember', '把阿舟记入人物手札');
    if (entry) {
      const chain = store().careChain;
      const queued = chain.publicQueue?.some(q => q.commitmentId === entry.id);
      const ref = chain.referrals?.find(r => r.commitmentId === entry.id && entry.referralHistory?.includes(r.id) && r.toCaregiver === entry.caregiver);
      const gap = chain.breaches?.filter(b => b.commitmentId === entry.id).length || 0;
      html += '<p>' + esc((queued ? '伤员已登记候诊。' : '') + (ref ? ref.toCaregiver + '已接班。' : entry.status === 'queued' ? '伤员正在候诊，尚无人接班。' : entry.status === 'delayed' ? '照护有了空档。' : '目前没有接班记录。') + (gap ? '缺席记录：' + gap + ' 次。' : '')) + '</p>';
      if (care && pos.arrived && from === '渡口') {
        if (entry.status === 'active') html += button('queue', '为伤员登记候诊');
        const relief = WA.world.where(ferryRelief);
        if (relief.arrived && relief.place === from) html += entry.reliefVolunteer === ferryRelief ? button('handoff', '和兰姨当面交班') : button('call', '问兰姨能否替班');
        else if (relief.inTransit && relief.to === from) html += button('walk', '在渡口等兰姨（行程十分钟）');
        else if (relief.reason === 'no-journey') html += button('call', '向岔路的兰姨喊一声，请她替班');
      }
    }
    if (pos.inTransit) return html + '<p>' + esc(pos.from + ' → ' + pos.to + '，还剩 ' + pos.left + ' 分钟。') + '</p>' + button('walk', '沿路前行十分钟') + button('arrive', '查看是否抵达');
    if (!row.reunion && pos.arrived && (from === row.place || from === '渡口')) html += '<p>现在是第 ' + esc(WA.evolution.roundOf()) + ' 轮。</p>' + button('wait', from === '渡口' && care ? '守着伤员（世界演化一轮）' : '在这里等候（世界演化一轮）');
    if (row.result !== '未到') {
      if (row.reunion) {
        html += '<p>' + esc('第 ' + row.reunion.round + ' 轮 · ' + row.reunion.place + '。' + row.reunion.line) + '</p>';
        const item = sealItem(row);
        if (item?.holder === row.withWhom) return html + (item.uses ? '<p>你曾出示过这枚私印。</p>' : from === row.place && pos.arrived ? button('show', '在东市出示私印') : '');
        return html + (row.reunion.sealOffered && WA.appointment.together(row.withWhom, ferryWho) && (!item || item.holder === ferryWho) ? button('seal', '接过私印') : '');
      }
      if (WA.evolution.roundOf() <= row.atRound) return html + '<p>阿舟还有话留到下次见面。</p>';
      return html + (WA.appointment.together(row.withWhom, ferryWho) ? button('reunion', '再见阿舟') : (from && from !== row.place && !pos.inTransit ? button('market', '去东市找阿舟') : '<p>还没有碰见阿舟。</p>'));
    }
    if (!from) return html + '<p>行程已中止，当前位置未确认。</p>';
    html += '<p>' + esc(pos.place ? '当前位置：' + from : '本次出发地：' + from) + '</p>';
    if (pos.arrived && from === row.place) html += WA.appointment.together(row.withWhom, ferryWho) ? button('meet', '向阿舟报到') : '<p>你到了东市，还没碰见阿舟。</p>';
    else if (from !== row.place) html += button('market', '去东市赴约');
    if (pos.arrived && from === '渡口') {
      if (!entry) html += button('aid', '接手照护渡口伤员');
      if (WA.evolution.roundOf() > row.to) html += button('miss', '确认错过东市之约');
    } else if (from !== '渡口' && !entry) html += button('ferry', '去渡口帮伤员');
    return html;
  }
  function ferryAction(row, action) {
    if (action === 'remember') {
      const tx = WA.store.transact(d => {
        if (Object.values(d.people || {}).some(p => p?.name === ferryWho)) return true;
        return WA.registry.ensurePerson(d, 'p_' + ferryWho, ferryWho, 'ferry-story').row?.name === ferryWho;
      }, 'ferry:remember');
      return tx?.ok && !tx.deferred && Object.values(store().people || {}).some(p => p?.name === ferryWho)
        ? '阿舟已记在人物手札里。' : '尚未确认记入。';
    }
    const pos = ferryPosition(row), who = row.withWhom, from = pos.place || pos.origin;
    const atFerry = pos.arrived && from === '渡口';
    if (action === 'call' || action === 'handoff') {
      if (!atFerry || !hasCare(row)) return '现在不能交班。';
      const relief = WA.world.where(ferryRelief);
      if (action === 'call') {
        const present = relief.arrived && relief.place === from;
        if (!present) {
          if (relief.reason !== 'no-journey') return '请先确认兰姨的行程。';
          const ack = departFor(ferryRelief, crossroads, from);
          const back = WA.world.where(ferryRelief);
          if (!ack.ok || !back.inTransit || back.to !== from) return '尚未确认有人来替班。';
        }
        const tx = WA.store.transact(d => {
          const c = d.careChain?.commitments?.find(x => x.id === careId(row) && x.caregiver === who);
          if (!c) return false;
          c.reliefVolunteer = ferryRelief;
          return true;
        }, 'ferry:volunteer');
        if (!tx?.ok || tx.deferred || careEntry(row)?.reliefVolunteer !== ferryRelief) return '替班意愿尚未确认。';
        return present ? '兰姨看过伤员，点头说：「我来替你。」' : '兰姨从岔路应了一声：「我来替你。」她还在路上。';
      }
      if (!relief.arrived || relief.place !== from) return '兰姨还没到渡口。';
      if (careEntry(row)?.reliefVolunteer !== ferryRelief) return '兰姨尚未答应接班。';
      const ack = WA.careChain.referCare({ commitmentId: careId(row), toCaregiver: ferryRelief, resourceUsed: '值守', resourceCost: 0, reason: 'ferry-face-to-face' });
      const back = careEntry(row);
      return ack.ok && back?.caregiver === ferryRelief && back.referralHistory?.includes(ack.referral?.id) ? '兰姨在伤员身边坐下，接过了你的班。' : '尚未确认交班。';
    }
    if (action === 'walk') {
      const waiting = !pos.inTransit && atFerry && hasCare(row) && WA.world.where(ferryRelief).to === from && WA.world.where(ferryRelief).inTransit;
      if (!pos.inTransit && !waiting) return '没有可推进的行程。';
      const traveller = waiting ? ferryRelief : who;
      const before = WA.world.where(traveller);
      const people = [who, ferryWho, ferryRelief];
      const prior = people.map(name => WA.world.where(name));
      const ack = WA.world.advance(Math.min(10, before.left), { channel: 'person', people });
      const back = WA.world.where(traveller);
      if (!ack.ok) return '行程尚未确认。';
      // Use committed travel, not the button label (the last leg may be shorter).
      const walked = (a, b) => !a.inTransit ? 0 : b.arrived && b.place === a.to ? a.left :
        b.inTransit && b.from === a.from && b.to === a.to ? a.left - b.left : 0;
      const elapsed = walked(before, back);
      if (elapsed > 0) {
        const contacts = new Map(Object.entries(store().people || {}).map(([id, p]) => [p?.name, id]));
        people.forEach((name, i) => {
          const next = WA.world.where(name);
          const staying = name === who && waiting && prior[i].arrived && next.arrived && prior[i].place === next.place;
          const minutes = staying ? elapsed : walked(prior[i], next);
          if (!(minutes > 0)) return;
          const actor = name === who ? 'player' : contacts.get(name) || name;
          WA.toxicMetabolism?.metabolize(actor, minutes);
          if (staying) WA.engines?.environmentalHazard?.evaluateExposure(actor, next.place, minutes, {});
        });
      }
      return back.arrived && back.place === before.to ? traveller + '已抵达' + back.place + '。' : back.inTransit && back.left < before.left ? '还剩 ' + back.left + ' 分钟。' : '行程尚未确认。';
    }
    if (action === 'wait') {
      if (row.reunion || !pos.arrived || (!atFerry && from !== row.place)) return '现在不能守候。';
      const before = WA.evolution.roundOf();
      WA.evolution.tick();
      return WA.evolution.roundOf() === before + 1 ? '你又等了一轮。现在是第 ' + (before + 1) + ' 轮。' : '轮次尚未确认。';
    }
    if (action === 'seal') return takeSeal(row);
    if (action === 'show') {
      const item = sealItem(row);
      if (!pos.arrived || from !== row.place || !item || item.holder !== who || item.uses) return '不能出示私印。';
      const ack = WA.gear.use(item.id, { by: who });
      return ack.ok && sealItem(row)?.uses === 1 ? '你在东市出示了私印。' : '出示尚未确认。';
    }
    if (action === 'queue') {
      const c = careEntry(row);
      if (!pos.arrived || from !== '渡口' || c?.caregiver !== who || c.status !== 'active') return '现在不能登记候诊。';
      WA.careChain.queueForPublicCare({ commitmentId: c.id });
      return careEntry(row)?.status === 'queued' ? '已登记候诊，尚未交接。' : '候诊尚未确认。';
    }
    if (action === 'reunion') {
      const bond = safe(function () { return WA.fondness.read(ferryWho); }, null);
      const lines = { '到场': '阿舟替你挪出一条长凳：「上回你准时到，我跟掌柜提过你了。坐，我来引见。」', '迟到': '阿舟收起怀表：「上回总算等到你。这回我先告诉你铺子在哪，别再错过开门。」', '失约': '阿舟没带你往铺子走：「上回我等到收摊。今天先把那天的事说清楚吧。」' };
      if (!lines[row.result]) return '约定仍未结算。';
      let line = lines[row.result];
      if (careEntry(row)) line += '你提起渡口的伤员，他停下来听你讲。';
      if (bond && bond.ok && Number.isFinite(bond.trust)) {
        if (bond.trust >= 70) line += '他把掌柜的私印递给你：「这件先托给你。」';
        else if (bond.trust <= 30) line += '他把私印收回袖里：「这件暂时由我拿着。」';
      }
      const ack = WA.appointment.revisit({ id: row.id, who: ferryWho, line: line, sealOffered: !!(bond && bond.ok && Number.isFinite(bond.trust) && bond.trust >= 70) });
      const back = ferryRow();
      return ack.ok && !ack.deferred && back && back.id === row.id && back.reunion ? '重逢已记入这场约定。' : '现在还见不到阿舟。';
    }
    if (action === 'arrive' && pos.inTransit) {
      const r = WA.world.arrive(who);
      if (!r.ok) return r.reason === 'still-in-transit' ? '还在路上。' : '抵达尚未确认。';
      return ferryPosition(row).arrived ? '已经抵达。' : '抵达尚未确认。';
    }
    if (pos.inTransit) return '还在路上。';
    if (action === 'market' || action === 'ferry') {
      const to = action === 'market' ? row.place : '渡口';
      if (!from || from === to || !WA.world.getSettings().enabled || !WA.travelDesk.getSettings().enabled) return '现在不能从这里出发。';
      if (pos.reason === 'no-journey') prepareStarter(from, to);
      const plan = WA.travelDesk.plan({ from: from, to: to });
      if (!plan.ok) return '未能出发：' + (plan.reason || plan.fault);
      const ack = WA.travelDesk.commit('depart', { person: who, from: from, to: to, stamp: plan.stamp });
      const back = ferryPosition(row);
      const moving = ack.ok && back.inTransit && back.to === to;
      const c = careEntry(row);
      if (moving && from === '渡口' && c?.caregiver === who && ['active','queued'].includes(c.status)) {
        WA.careChain.reportCareAbsence(c.id, 'left-ferry');
        return careEntry(row)?.status === 'delayed' ? '已经出发，渡口暂时无人接你的班。' : '已经出发，照护交接尚未确认。';
      }
      return moving ? '已经出发，尚未抵达。' : '未确认出发：' + (ack.reason || ack.fault || '未读到行程');
    }
    if (!pos.arrived) return '尚未确认抵达。';
    if (action === 'aid' && from === '渡口') {
      if (!careEntry(row)) WA.careChain.registerCareCommitment({ id: careId(row), caregiver: who, ward: '渡口伤员', placeId: '渡口' });
      return hasCare(row) ? '你已接手照护，伤情仍需观察。' : '照护记录尚未确认。';
    }
    const round = WA.evolution.roundOf();
    if (!Number.isFinite(round)) return '当前轮次未确认。';
    if (action === 'meet' && !WA.appointment.together(who, ferryWho)) return '还没有碰见阿舟。';
    const meet = action === 'meet' && from === row.place;
    if (meet && round < row.from) return '你到早了，第 ' + row.from + ' 轮再向阿舟报到。';
    if (!meet && !(action === 'miss' && from === '渡口' && round > row.to)) return '约定仍未结算。';
    const ack = WA.appointment.settle({ id: row.id, showUp: meet, atRound: round });
    const back = ferryRow();
    return ack.ok && !ack.deferred && back && back.id === row.id && back.result === ack.result ? '约定结果：' + back.result : '结算尚未确认。';
  }
  function ferryCard() {
    const chat = currentChat();
    if (!chat || chat === 'wa_default' || !WA.appointment || !WA.appointment.getSettings().enabled) return '';
    const row = ferryRow();
    if (row) return '<section><h3>东市之约</h3><p>' + esc(ferryWho + '与你约在' + row.place + '，第 ' + row.from + ' 至 ' + row.to + ' 轮。约定状态：' + row.result) + '</p>' + safe(function () { return journeyControls(row, chat); }, '<p>行程暂时读不到。</p>') + '<p role="status" id="wa-ferry-status"></p></section>';
    return '<details><summary>可选故事 · 赴约还是救人</summary><p>阿舟要带你去东市认人。渡口那边还有个伤员等着帮忙。你要先答应这场约吗？</p>'
      + '<button type="button" class="wa-btn" id="wa-ferry-promise" data-chat="' + esc(chat) + '">答应阿舟，在东市见</button>'
      + '<p role="status" id="wa-ferry-status"></p></details>';
  }
  function bindFerry(root, onPromise) {
    const btn = root.querySelector('#wa-ferry-promise'), status = root.querySelector('#wa-ferry-status');
    function refresh(note) {
      const box = root.querySelector('[data-ferry-scene]');
      if (!box || !('innerHTML' in box)) return;
      box.innerHTML = ferryCard();
      const live = box.querySelector('#wa-ferry-status');
      if (live) live.textContent = note;
      bindFerry(root, onPromise);
    }
    const actions = root.querySelectorAll ? root.querySelectorAll('[data-ferry]') : [];
    Array.from(actions).forEach(function (el) {
      if (el.dataset.bound || !status) return;
      el.dataset.bound = '1';
      el.addEventListener('click', function () {
        if (el.disabled) return;
        if (currentChat() !== el.dataset.chat) { status.textContent = '对话已切换，请重新打开此刻页。'; return; }
        el.disabled = true;
        try {
          const row = ferryRow();
          const note = WA.appointment.getSettings().enabled && row && row.id === el.dataset.row && (row.result === '未到' || ['remember', 'reunion', 'market', 'seal', 'show', 'queue', 'walk', 'arrive', 'wait', 'call', 'handoff'].includes(el.dataset.ferry))
            ? ferryAction(row, el.dataset.ferry) : '这项约定已改变。';
          status.textContent = note;
          refresh(note);
        } catch (e) { status.textContent = '行程暂时无法确认。'; el.disabled = false; }
      });
    });
    if (!btn || !status || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        if (currentChat() !== btn.dataset.chat) { status.textContent = '对话已切换，请重新打开此刻页。'; return; }
        const ack = WA.appointment.make({ who: ferryWho, withWhom: '你', place: '东市', expect: '带你认人', requestKey: ferryKey });
        if (ack.deferred) { status.textContent = '约定仍待确认。'; return; }
        const row = ack.ok && ferryRow();
        if (!row || row.id !== ack.id) { status.textContent = '未能确认约定，请稍后重试。'; btn.disabled = false; return; }
        if (!ack.repeated && WA.world && WA.travelDesk) safe(function () { npcDeparture(row); }, null);
        status.textContent = '东市见，第 ' + row.from + ' 至 ' + row.to + ' 轮。' + (ack.persisted === true ? '约定已保存。' : '当前对话可见，尚未确认落盘。');
        if (onPromise) {
          const note = status.textContent;
          onPromise(note);
          const live = root.querySelector('#wa-ferry-status');
          if (live) live.textContent = note;
        }
        else refresh(status.textContent);
      } catch (e) { status.textContent = '约定暂时无法确认。'; btn.disabled = false; }
    });
  }

  function render() {
    const s = store();
    const started = !!(s && s.clock && s.clock.label);
    const parts = [];
    const boot = bootCard(started);
    if (boot) parts.push(boot);
    // 开局后先说「此刻该做什么」，再说「你在哪」（场景卡）——
    //   顺序反了就等于把结论压在细节后面，玩家又要自己找。
    if (started) {
      const vd = safe(verdictBlock, '');
      if (vd) parts.push(vd);
    }
    const invite = safe(ferryCard, '');
    if (invite) parts.push('<div data-ferry-scene>' + invite + '</div>');
    const scene = sceneCard();
    if (scene) parts.push(scene);
    if (started) {
      const now = justNowBlock();
      if (now) parts.push(now);
      const notice = noticeBlock();
      if (notice) parts.push(notice);
    }
    if (!parts.length) parts.push(emptyHint());
    return '<div class="wa-now">' + parts.join('') + '</div>';
  }

  /** 事件绑定：只绑本页按钮（「回到对话」走宿主的既有出口）。 */
  function bind(root) {
    if (!root || typeof root.querySelector !== 'function') return;
    const btn = root.querySelector('#wa-now-back-chat');
    if (!btn || typeof btn.addEventListener !== 'function') return;
    btn.addEventListener('click', function () {
      safe(function () {
        if (WA.ui && typeof WA.ui.goPage === 'function') { WA.ui.goPage('overview'); return; }
      }, null);
    });
  }

  WA.panelNowPage = { render: render, bind: bind, ferryCard: ferryCard, bindFerry: bindFerry, ver: '2.518.0' };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('ui/pages/now-page.js', { kind: 'ui', ver: '2.518.0' });
  }
})();
