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

  WA.panelNowPage = { render: render, bind: bind, ver: '2.518.0' };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('ui/pages/now-page.js', { kind: 'ui', ver: '2.518.0' });
  }
})();