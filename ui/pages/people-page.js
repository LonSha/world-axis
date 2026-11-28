/**
 * WorldAxis ui/pages/people-page.js — 玩家面「人物」（v2.518.0 · UI-P1）
 *
 * 玩家先看到「这个人是谁、你们现在是什么感觉」，而不是 affinity/trust/bond
 * 三个内部数值。数值仍由旧人物页保留，开发者模式继续走 panel.js 的完整工作台。
 * 本模块渲染既有语义出口；介入委托 storyWindow，不直接写世界或新增导航页。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  function esc(s) {
    if (WA && WA.sanitize && typeof WA.sanitize.html === 'function') return WA.sanitize.html(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '"', "'": '&#39;' }[c];
    });
  }
  function safe(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
  }
  function store() { return safe(function () { return WA.store.get(); }, null); }
  function reading(value) {
    return typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;
  }
  function bandOf(value) {
    const n = reading(value);
    if (!isFinite(n)) return '';
    const bands = safe(function () {
      return WA.registry && typeof WA.registry.relationBands === 'function'
        ? WA.registry.relationBands() : [];
    }, []);
    for (let i = 0; i < bands.length; i++) {
      if (n >= Number(bands[i].min) && n <= Number(bands[i].max)) return bands[i].band || '';
    }
    return '';
  }
  function affinityText(value) {
    const band = bandOf(value);
    if (!band) return '';
    return ({
      '陌生人': '你们还在互相打量',
      '相识': '你们已经认得彼此',
      '普通朋友': '相处起来已经自然',
      '信任者': '他愿意把一部分真心交给你',
      '好友': '你们之间有了稳定的默契',
      '至交': '你们站在彼此这一边',
      '挚爱': '你们之间的牵挂很深',
      '灵魂羁绊': '你们的命运已经紧紧相连'
    })[band] || band;
  }
  function trustText(value) {
    const n = reading(value);
    if (!isFinite(n)) return '';
    if (n <= 20) return '仍在观察你';
    if (n <= 40) return '对你有所保留';
    if (n <= 60) return '愿意听你说完';
    if (n <= 80) return '大多时候相信你';
    return '把你当作可以托付的人';
  }
  function bondText(value) {
    const n = reading(value);
    if (!isFinite(n)) return '';
    if (n <= 20) return '你们的联系还很浅';
    if (n <= 45) return '你们之间已有一些牵连';
    if (n <= 70) return '你们的故事正在交织';
    return '你们很难再把彼此当作无关的人';
  }
  function relationLine(person) {
    const lines = [];
    const affinity = affinityText(person.affinity);
    const trust = trustText(person.trust);
    const bond = bondText(person.bond);
    if (affinity) lines.push(affinity);
    if (trust) lines.push(trust);
    if (bond) lines.push(bond);
    return lines.join('。') + (lines.length ? '。' : '');
  }
  // v2.518.0（EX-9）：人物页直接介入正文。
  //   三个入口都委托既有 owner（world 消息 / world 行程 / act 等待），
  //   窗口侧只负责「把玩家意图带进上下文」与「如实回报阶段」。
  //   不要求用户编辑 JSON，也不引入后台模拟器式输入框。
  function windowId() {
    return safe(function () {
      const cur = WA.storyWindow && typeof WA.storyWindow.current === 'function'
        ? WA.storyWindow.current() : null;
      return cur && cur.id ? cur.id : '';
    }, '');
  }
  /** 记一次「按下但没成立」的介入（与窗口侧同一本账，供审计「按了没反应」）。 */
  function noteAttempt(wid, info) {
    safe(function () { WA.storyWindow.respond(wid, info || {}); });
  }
  /** 统一的失败返回：留账 + 明确可重试（按钮不置灰，玩家可以再来一次）。 */
  function fail(wid, reason, choice) {
    noteAttempt(wid, { choice: choice, reason: reason, owner: 'peoplePage' });
    return { ok: false, reason: reason, retryable: true };
  }
  function act(name, person, clueId) {
    const wid = windowId();
    if (!wid) return { ok: false, reason: 'no-window' };
    const host = WA.mainWin || window;
    const player = safe(function () {
      const c = host.SillyTavern && host.SillyTavern.getContext();
      return c && c.name1 ? String(c.name1).trim() : '';
    }, '');
    if (!player) return fail(wid, 'player-unknown', name);
    const st = store() || {}, ps = st.people || {};
    const target = Object.keys(ps).map(function (k) { return ps[k]; })
      .filter(function (p) { return p && p.name === person; })[0];
    const ctx = { person: player, player: player, viewer: player,
      to: name === 'ask' ? person : ((target && (target.location || (target.life && target.life.place))) || ''),
      message: '关于' + person + '最近动向的询问' };
    if (clueId) {
      const visible = safe(function () { return WA.storyWindow.visibleTraces({ viewer: player, player: player }); }, []);
      // 页面渲染后线索可能已经变得不可见（窗口刷新、知情面变化、线索被旁人收走）。
      //   此处**以窗口的可见痕迹为准**重校一次，不允许「看得见的按钮提交看不见的线索」。
      if (!Array.isArray(visible) || !visible.some(function (t) { return t.kind === 'clue' && t.id === clueId; }))
        return fail(wid, 'clue-not-visible', name);
      const clue = safe(function () { return WA.investigation.view(clueId); }, null);
      if (!clue || clue.ok !== true) return fail(wid, 'clue-unavailable', name);
      ctx.clueId = clueId; ctx.target = clue.location || ''; ctx.note = '线索：' + clue.title;
      if (name === 'verify') {
        if (!clue.witness) return fail(wid, 'witness-unknown', name);
        ctx.from = player; ctx.to = clue.witness; ctx.message = '请核实：' + clue.title;
      }
    }
    const out = safe(function () { return WA.storyWindow.choose(wid, name, ctx); },
      { ok: false, reason: 'owner-threw' });
    // 窗口侧只在 owner 拒收时记一次（并标 retryable）。抛错这条路径窗口没记到，这里补上，
    //   否则「页面点了、什么也没发生」在两边都没有账。
    if (out && out.ok === false && out.retryable !== true) noteAttempt(wid, { choice: name, reason: out.reason || 'unknown', owner: 'peoplePage' });
    return out;
  }
  function contactPlaces() {
    return ((store()?.world || {}).places || []).map(function (p) { return p && p.name; }).filter(Boolean);
  }
  function contactForm(key, name) {
    const chat = safe(function () { return WA.store.chatId(); }, '');
    if (!chat || chat === 'wa_default' || name === '你') return '';
    const places = contactPlaces();
    const rows = safe(function () { return WA.appointment.view({ who: name }).appointments || []; }, []);
    const pending = rows.filter(function (r) { return r && r.withWhom === '你' && r.result === '未到'; });
    return '<details data-contact="' + esc(key) + '" data-chat="' + esc(chat) + '"><summary>联系' + esc(name) + '</summary>'
      + pending.map(function (r) { return '<p>' + esc(r.place) + '，第 ' + esc(r.from) + ' 至 ' + esc(r.to) + ' 轮</p>'; }).join('')
      + (places.length ? '<label>地点 <select>' + places.map(function (p) { return '<option>' + esc(p) + '</option>'; }).join('') + '</select></label><button type="button" class="wa-btn" data-contact-action="meet">记下当面说好的约</button>' : '')
      + '<label>口信 <input maxlength="140"></label><button type="button" class="wa-btn" data-contact-action="letter">托人带话</button><p role="status"></p></details>';
  }
  function bindContacts(root) {
    Array.from(root.querySelectorAll('[data-contact]')).forEach(function (box) {
      const key = box.dataset.contact, chat = box.dataset.chat;
      Array.from(box.querySelectorAll('[data-contact-action]')).forEach(function (b) {
        if (b.dataset.bound) return;
        b.dataset.bound = '1';
        b.addEventListener('click', function () {
          const status = box.querySelector('[role="status"]');
          if (b.disabled || chat !== WA.store.chatId() || chat === 'wa_default') return;
          const p = (store().people || {})[key];
          if (!p || !p.name || ['__proto__','constructor','prototype'].includes(p.name)) return;
          const who = p.name;
          try {
            if (b.dataset.contactAction === 'letter') {
              const input = box.querySelector('input'), text = input.value.trim();
              if (!text) { status.textContent = '口信还是空的。'; return; }
              const ack = WA.letterPost.send({ from: '你', to: who, content: text });
              const found = (store().chronicle || []).some(function (x) { return x && x.kind === 'letter' && x.id === ack.id && x.content === text && x.to === who; });
              status.textContent = ack.ok && found ? '口信在路上，尚未送到。可在手札「远方」查看。' : '尚未确认寄出。';
              if (found) input.value = '';
            } else {
              const place = box.querySelector('select').value;
              if (!contactPlaces().includes(place) || !WA.appointment.together('你', who)) { status.textContent = '尚未当面碰见，不能替对方答应。'; return; }
              const req = 'contact:' + WA.evolution.roundOf() + ':' + place;
              const ack = WA.appointment.make({ who: who, withWhom: '你', place: place, requestKey: req });
              status.textContent = ack.ok && !ack.deferred ? '约在' + place + '，第 ' + ack.window.join(' 至 ') + ' 轮。' : '约定尚未确认。';
              if (ack.ok && !ack.deferred) {
                b.disabled = true;
                const origin = WA.world.where(who).place;
                if (!ack.repeated && origin !== place && WA.travelDesk?.getSettings().enabled) {
                  const plan = WA.travelDesk.plan({ from: origin, to: place });
                  if (plan.ok) WA.travelDesk.commit('depart', { person: who, from: origin, to: place, stamp: plan.stamp });
                  status.textContent += WA.world.where(who).inTransit ? '对方已经动身。' : '尚未确认动身。';
                }
              }
            }
          } catch (e) { status.textContent = '暂时无法确认。'; }
        });
      });
    });
  }
  function personCard(person, key, index, recKey) {
    const p = person || {};
    const name = p.name || key || ('人物 ' + (index + 1));
    const rec = recKey || '';
    const recAttr = rec ? ' data-rec="' + esc(rec) + '"' : '';
    const tags = Array.isArray(p.tags) ? p.tags.filter(Boolean).slice(0, 5) : [];
    const tagHtml = tags.length
      ? '<div class="wa-people-tags">' + tags.map(function (tag) {
        return '<span class="wa-people-tag">' + esc(tag) + '</span>';
      }).join('') + '</div>' : '';
    const line = relationLine(p);
    const actHtml = '<div class="wa-people-acts">'
      + '<button class="wa-btn wa-mini" data-wa-sw-act="ask" data-wa-sw-person="' + esc(name) + '">询问</button>'
      + '<button class="wa-btn wa-mini" data-wa-sw-act="follow" data-wa-sw-person="' + esc(name) + '">跟随</button>'
      + '<button class="wa-btn wa-mini" data-wa-sw-act="wait" data-wa-sw-person="' + esc(name) + '">等待</button>'
      + '</div>';
    const contact = contactForm(key, name);
    return '<article class="wa-people-card"' + recAttr + '>'
      + '<div class="wa-people-card-head"><h3>' + esc(name) + '</h3>'
      + (tags.length ? '<span class="wa-people-tag-count">' + tags.length + ' 个印象</span>' : '') + '</div>'
      + (line ? '<p class="wa-people-relation">' + esc(line) + '</p>' : '<p class="wa-people-relation is-quiet">还没有足够的相处记录。</p>')
      + tagHtml
      + actHtml + contact
      + '</article>';
  }
  function renderClues() {
    const player = safe(function () {
      const host = WA.mainWin || window;
      const c = host.SillyTavern.getContext();
      return c && c.name1 ? String(c.name1).trim() : '';
    }, '');
    if (!player) return '';
    const traces = safe(function () { return WA.storyWindow.visibleTraces({ viewer: player, player: player }); }, []);
    const clues = (Array.isArray(traces) ? traces : []).filter(function (t) { return t.kind === 'clue'; });
    if (!clues.length) return '';
    return '<section class="wa-story-clues"><h3>当前线索</h3>' + clues.map(function (t) {
      return '<article><p>' + esc(t.summary) + '</p>' + ['find', 'verify', 'defer'].map(function (kind) {
        return '<button class="wa-btn" data-wa-sw-act="' + kind + '" data-wa-sw-clue="' + esc(t.id) + '">'
          + ({ find: '寻找', verify: '请人核实', defer: '暂不处理' })[kind] + '</button>';
      }).join('') + '</article>';
    }).join('') + '</section>';
  }
  function empty() {
    return '<section class="wa-people-empty">'
      + '<div class="wa-people-empty-mark" aria-hidden="true">○</div>'
      + '<h3>还没有遇见谁</h3>'
      + '<p>人物会在故事推进后出现在这里。</p>'
      + '</section>';
  }
  /** 结论卡（v2.539.9 · 六页内容重写 · 人物页）：这一页的 ask 是「这个人为什么这样对我」。 */
  //  病（现场）：首屏是 hero（「故事里的人」+一句泛泛文案）接一叠人物卡。每张卡里关系三档
  //    很细，但**页面从不回答「谁最不一样」「他在追什么」** —— 玩家要逐卡读、逐项比，
  //    才能自己拼出「为什么这样对我」。
  //  修法：四句。前三句只用本文件已读的 store.people（零新增读口）；第四句（v2.542.12）
  //    读 engines/character-drive.js 的 derive() —— 这页的 ask 就是「为什么这样对我」，
  //    引擎的 want / line 才是这个问题的真源，store 里只有 intent 一句。
  //    ① 在册几个人、其中几个留下了印象
  //    ② 离你最近的是谁 —— 按 affinity 取最大，档位措辞复用本文件的 affinityText（不另编）
  //    ③ 他在追什么 —— `people[].intent` 就是「人物在追什么」，口径见
  //       engines/intake-dispatch.js 第 28 行逐字：`people[].intent → life.addGoal(name,{text})`；
  //       眼下在做的是 `action`。两个字段都在 store 里，不需要再引一个引擎。
  //  ── 为什么不用 plan.chain()：它的 blockedBy 是**结构体**（{kind:'need'|'prereq',…}），
  //     要在页面上说出来就得再抄一遍 chainBlock 的映射 = 第二个措辞真源。
  //     intent/action 一句话说得清，就不去引它。
  //  边界（与本文件同规）：`intent` 为空写「还没写下他在追什么」（这是**事实**），
  //    绝不写成「读不到」；引擎缺席才是「读不到」。两种形态不许同形。
  function verdictBlock(people, keys) {
    const rows = keys.map(function (k) { return people[k]; })
      .filter(function (p) { return p && typeof p === 'object'; });
    if (!rows.length) return '';   // 空态由 empty() 独家负责，不给玩家两套「还没有遇见谁」
    const lines = [];
    const withTag = rows.filter(function (p) { return Array.isArray(p.tags) && p.tags.length; }).length;
    lines.push('在册 ' + rows.length + ' 人'
      + (withTag ? ('，其中 ' + withTag + ' 人已经留下了印象') : '，都还没有留下印象'));
    // ② 离你最近的那个：affinity 是数才参与比较，NaN/缺字段一律不掺进来（不拿 0 冒充读数）
    const rated = rows.filter(function (p) {
      return !!p.name && Number.isFinite(reading(p.affinity));
    }).map(function (p) { return { name: String(p.name), aff: Number(p.affinity) }; });
    rated.sort(function (a, b) { return b.aff - a.aff; });
    const main = rated[0] || null;
    lines.push(main
      ? ('离你最近的是「' + main.name + '」—— ' + (affinityText(main.aff) || ('关系读数 ' + main.aff)))
      : '还没有谁的亲疏读数成形（你们大概还没真正打过交道）');
    // ③ 他在追什么 + 眼下在做什么
    const who = main
      ? (rows.filter(function (p) { return String(p.name || '') === main.name; })[0] || null)
      : (rows[0] || null);
    if (!who) {
      lines.push('他在追什么：还没有可读的人物');
    } else {
      const nm = who.name || '这一位';
      const goal = (typeof who.intent === 'string' ? who.intent.trim() : '');
      const doing = (typeof who.action === 'string' ? who.action.trim() : '');
      lines.push(goal
        ? ('他在追什么：「' + nm + '」正在追「' + goal + '」' + (doing ? '，眼下在做「' + doing + '」' : ''))
        : ('他在追什么：还没写下「' + nm + '」在追什么'
          + (doing ? ('（眼下在做「' + doing + '」）') : '') + ' —— 这不是「他没有打算」'));
    }
    // ④ v2.542.12：他为什么这样对你 —— 直接读 engines/character-drive.js 的 derive()（L4）。
    //   本卡上一版写的是「不引第二个引擎」。这一版**推翻它**，理由是这页的 ask 逐字是
    //   「这个人为什么这样对我」，而 want / line 是**引擎自己的语义**（他要什么、哪条线不能越），
    //   store 里只有 intent 一句。用引擎字段、并沿用引擎的字段名与 skipped 名单，
    //   比在页面里再拼一次强：后者会造出第二个措辞真源（本仓点过名的形态）。
    //   边界（与本文件同规）：引擎缺席 ⇒「读数不可用」；引擎在场但某面推不出来 ⇒ 如实说那一面
    //   （fear 在画像里没有真字段，本版永远推不出来）；两种形态都不许塌成「他没有」。
    const whoId = (function () {
      if (!who) return null;
      const ks = Object.keys(people);
      for (let i = 0; i < ks.length; i += 1) { if (people[ks[i]] === who) return ks[i]; }
      return null;
    })();
    const cd = (typeof WA !== 'undefined' && WA.characterDrive) ? WA.characterDrive : null;
    if (!cd || typeof cd.derive !== 'function') {
      lines.push('他为什么这样对你：读数不可用（engines/character-drive.js 缺席）—— 这不是「他没有动机」');
    } else if (!whoId) {
      lines.push('他为什么这样对你：读数不可用（这一位没有可寻址的档案 id）—— 这不是「他没有动机」');
    } else {
      const d = safe(function () { return cd.derive(whoId, store()); }, null);
      if (!d || d.ok !== true) {
        lines.push('他为什么这样对你：读数不可用（derive 未返回可用结果）—— 这不是「他没有动机」');
      } else {
        const bits = [];
        bits.push(d.want ? ('要的是「' + d.want + '」') : '要什么：画像里没有这个字段');
        bits.push(d.line ? ('不能越的线是「' + d.line + '」') : '不能越的线：画像里还没有');
        if (!d.fear) bits.push('怕什么：画像里没有这个字段（本版推不出来）');
        lines.push('他为什么这样对你：' + (d.name || '这一位') + ' —— ' + bits.join('；'));
      }
    }
    return '<div class="wa-verdict"><b>此刻</b><ul>'
      + lines.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('')
      + '</ul></div>';
  }

  function render() {
    const s = store();
    const people = s && s.people && typeof s.people === 'object' ? s.people : {};
    const keys = Object.keys(people);
    const peopleIds = keys;
    const recKeyOf = function (name) {
      const n = String(name == null ? '' : name);
      for (let i = 0; i < peopleIds.length; i++) {
        const value = people[peopleIds[i]];
        if (value && String(value.name == null ? '' : value.name) === n) return 'people:' + peopleIds[i];
      }
      return '';
    };
    const cards = keys.map(function (key, index) {
      const person = people[key] || {};
      return personCard(person, key, index, recKeyOf(person.name));
    }).join('');
    const relation = safe(function () {
      return WA.relationTemp && typeof WA.relationTemp.network === 'function'
        ? WA.relationTemp.network() : null;
    }, null);
    const hasNetwork = relation && relation.ok === true && relation.quiet !== true && Array.isArray(relation.rows) && relation.rows.length;
    return '<div class="wa-people-player">'
      + '<header class="wa-people-hero"><div class="wa-people-kicker">人物</div>'
      + '<h2>故事里的人</h2><p>他们如何靠近你，取决于你们一起经历过什么。</p></header>'
      // 结论卡排在卡片墙之前：玩家先知道「谁最不一样、他在追什么」，才去看逐张卡
      //   （顺序反了等于把结论压在细节后面）。空态时不渲染 —— 那一屏由 empty() 独家回答。
      + (cards ? verdictBlock(people, keys) : '')
      + (cards || empty())
      + renderClues()
      + (hasNetwork ? '<details class="wa-details wa-people-network"><summary>关系正在发生变化</summary><div class="wa-people-network-body">'
        + relation.rows.slice(0, 4).map(function (row) {
          return '<p><b>' + esc(row.a) + ' ↔ ' + esc(row.b) + '</b>'
            + (row.recent && row.recent.reason ? ' · ' + esc(row.recent.reason) : '') + '</p>';
        }).join('') + '</div></details>' : '')
      + '</div>';
  }
  function bind(root, onAccepted) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    bindContacts(root);
    const btns = root.querySelectorAll('[data-wa-sw-act]');
    for (let i = 0; i < btns.length; i++) {
      const btn = btns[i];
      if (!btn || typeof btn.addEventListener !== 'function' || btn.__waStoryBound) continue;
      btn.__waStoryBound = true;
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        const kind = btn.getAttribute('data-wa-sw-act') || '';
        const person = btn.getAttribute('data-wa-sw-person') || '';
        const r = act(kind, person, btn.getAttribute('data-wa-sw-clue') || '');
        btn.setAttribute('title', r && r.ok
          ? '已交由故事回应窗口处理（' + ((r.window && r.window.choiceOutcome && r.window.choiceOutcome.phase) || 'ok') + '）'
          : '未能介入：' + ((r && r.reason) || 'unknown'));
        btn.disabled = !!(r && r.ok);
        btn.textContent = r && r.ok ? '已提交，等待故事回应' : '未能介入：' + ((r && r.reason) || 'unknown');
        if (r && r.ok && typeof onAccepted === 'function') onAccepted(r);
      });
    }
  }
  WA.panelPeoplePage = { render: render, bind: bind, contactForm: contactForm, bindContacts: bindContacts, ver: '2.518.0' };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('ui/pages/people-page.js', { kind: 'ui', ver: '2.518.0' });
  }
})();
