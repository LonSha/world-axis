/**
 * WorldAxis engines/scene-narrative.js (v2.231.0) — OP-8 场景与历史按因果讲清楚
 *
 * 核心职责：
 *   当前场景只呈现相关人物、地点、待处理变化和可采取行动。
 *   已结束事项给出「做了什么、付了什么、影响谁、留下什么」。
 *   历史可从一件物品、一个地点或一次决定追溯已证因果。
 *   场外变化经实际感知/传讯进入当前视角。
 *   将核心变化转成叙事条件，不要求正文输出仪表盘。
 *
 * 数据与接线：
 *   优先补 chronicle-view 字段映射和已结算来源链接。
 *   按可见性与当前场景聚合现有 buildBlock；完整状态不重复注入。
 *   beat 管节奏，不为制造高潮捏造后果。
 *   新场景读取实际状态，不复制上一场快照继续讲。
 *
 * 边界：
 *   1. 只读聚合：不改存档、不写 stat、不隐式写盘。
 *   2. 叙事化不得改变事实——只做「取来源字段 + 拼展示行」，不编描述。
 *   3. 场外秘密不泄露给主角：只呈现主角已感知或已收到的变化。
 *   4. 不复制上一场快照继续讲：每帧读取实际状态。
 *   5. 因果追溯只走已结算的 causal chains，不凭空推断。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60);
  }

  function num(v) {
    var n = Number(v);
    return (typeof n === 'number' && isFinite(n)) ? n : null;
  }

  function state() {
    return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
  }

  var _stat = { scenes: 0, traces: 0, refused: 0, lastReason: '', faults: {} };
  function noteFault(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }

  /**
   * 当前场景摘要：按实际状态聚合相关人物、地点、待处理变化和可采取行动。
   * 不复制上一场快照，每帧实时读取。
   * 严格按真实物理地点过滤在场人，途中旅行人员不冒充在场。
   */
  function currentScene(opts) {
    var o = opts || {};
    var s = state();
    // 场景标签（story label）
    var label = '';
    if (WA.playtime && typeof WA.playtime.story === 'function') {
      try { var sr = WA.playtime.story(); if (sr && sr.ok) label = sr.label || ''; } catch (e) {}
    }
    if (!label && s.clock) label = clean(s.clock.label, 40);

    // 当前地点：优先入参，次从 region 取
    var place = clean(o.place || (s.region && s.region.currentPlace) || '', 60);

    // 在场人物：根据物理地点与旅行状态真实过滤
    var present = [];
    if (s.people) {
      var keys = Object.keys(s.people);
      var matched = [];
      for (var pi = 0; pi < keys.length; pi++) {
        var k = keys[pi];
        var p = s.people[k];
        if (!p) continue;
        var pname = clean(p.name || k.replace(/^p_/, ''), 40);
        var pst = clean(p.status || p.action || '', 30);
        var ploc = clean(p.location || p.place || '', 60);

        // 旅行在途中人员绝不在当前地点现场
        if (pst === 'traveling' || pst === 'on_the_road' || pst === 'transit') continue;

        // 若指定了具体地点且人物有明确地点，核对是否匹配
        if (place && ploc && ploc !== place) continue;

        matched.push(pname);
      }
      if (matched.length > 0 || place) {
        present = matched.slice(0, 8);
      } else {
        // 无地点约束时的向后兼容兜底
        present = keys.slice(0, 6).map(function (k) { return clean(k.replace(/^p_/, ''), 40); });
      }
    }

    // 待处理变化：从 causal chains 取 pending/delayed
    var viewer = clean(o.who || o.viewer, 40);
    var pending = [];
    var chains = ((s.causal || {}).chains) || [];
    if (Array.isArray(chains)) {
      pending = chains.filter(function (c) {
        if (!c) return false;
        var st = clean(c.stage || c.status, 20);
        if (st !== 'pending' && st !== 'delayed') return false;
        // 若有明确观察者，只呈现与该人相关或发生在当前地点的变化
        if (viewer) {
          var aff = Array.isArray(c.affected) ? c.affected : (c.who ? [c.who] : []);
          var isRelated = aff.indexOf(viewer) >= 0 || aff.indexOf('p_' + viewer) >= 0;
          var isAtPlace = place && c.place && clean(c.place, 60) === place;
          if (!isRelated && !isAtPlace && !c.public) return false;
        }
        return true;
      }).map(function (c) {
        return {
          id: clean(c.id, 40),
          title: clean(c.title || c.key || c.id, 60),
          stage: clean(c.stage || c.status, 20),
          summary: clean(c.summary || c.note || '', 80)
        };
      }).slice(0, 6);
    }

    // 可采取行动：从 actionDesk 取可用路由
    var availableActions = [];
    if (WA.actionDesk && typeof WA.actionDesk.diagnose === 'function') {
      try {
        var diag = WA.actionDesk.diagnose();
        if (diag && Array.isArray(diag.routes)) {
          availableActions = diag.routes.slice(0, 12);
        }
      } catch (e) {}
    }

    _stat.scenes++;
    return {
      ok: true,
      storyLabel: label,
      place: place,
      present: present,
      pendingChanges: pending,
      availableActions: availableActions,
      note: '本帧按实际状态聚合，不复制上一场快照；场外秘密不泄露'
    };
  }

  /**
   * 已结束事项的「做了什么、付了什么、影响谁、留下什么」。
   * 从 chronicle 归档和 causal 已结算链提取。
   */
  function resolvedSummary(opts) {
    var o = opts || {};
    var s = state();
    var rows = [];

    // 已结算的 causal chains
    var chains = ((s.causal || {}).chains) || [];
    if (Array.isArray(chains)) {
      chains.forEach(function (c) {
        if (!c) return;
        var st = clean(c.stage || c.status, 20);
        if (st === 'settled' || st === 'terminal' || st === 'resolved' || st === 'closed') {
          rows.push({
            ref: 'cau:' + clean(c.id, 40),
            title: clean(c.title || c.key || c.id, 60),
            whatWasDone: clean(c.action || c.summary || '', 80),
            whatWasPaid: clean(c.cost || c.penalty || '', 60),
            affectedWhom: Array.isArray(c.affected) ? c.affected.slice(0, 4) : (c.who ? [clean(c.who, 40)] : []),
            whatRemained: clean(c.immediate || c.note || c.consequence || '', 80),
            at: num(c.at) || num(c.settledAt) || 0,
            source: 'causal'
          });
        }
      });
    }

    // 已结束的 chronicle 条目
    var chron = Array.isArray(s.chronicle) ? s.chronicle : [];
    chron.forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      if (clean(c.visibility, 20) === 'hidden') return;
      var kind = clean(c.kind, 20);
      if (kind === 'resolved' || kind === 'completed' || kind === 'finished' || kind === 'settled') {
        rows.push({
          ref: clean(c.id, 40) || ('chr:' + rows.length),
          title: clean(c.title, 80),
          whatWasDone: clean(c.summary || c.desc || '', 80),
          whatWasPaid: clean(c.cost || '', 60),
          affectedWhom: Array.isArray(c.refs) ? c.refs.slice(0, 4) : [],
          whatRemained: clean(c.note || c.consequence || '', 80),
          at: num(c.at) || 0,
          source: 'chronicle'
        });
      }
    });

    // 按时间排序
    rows.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    var limit = num(o.limit) || 12;
    var capped = rows.length > limit;
    return {
      ok: true,
      rows: capped ? rows.slice(-limit) : rows,
      count: Math.min(rows.length, limit),
      total: rows.length,
      capped: capped,
      note: '已结束事项按已结算来源聚合；来源缺失者如实标注，不编描述'
    };
  }

  /**
   * 从一个起点（物品/地点/决定）追溯已证因果链。
   * 走已结算的 causal chains 与关联的真实设施、生产、共同体履约记录，不凭空推断。
   */
  function traceFrom(seed, opts) {
    var key = clean(seed, 60);
    if (!key) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    var s = state();
    var matched = [];

    // 1. 优先检索因果链（causal chains）
    var chains = ((s.causal || {}).chains) || [];
    if (Array.isArray(chains)) {
      chains.forEach(function (c) {
        if (!c) return;
        var title = clean(c.title || c.key || c.id, 60);
        var id = clean(c.id, 40);
        var refs = Array.isArray(c.refs) ? c.refs : [];
        if (id.indexOf(key) >= 0 || title.indexOf(key) >= 0 || refs.indexOf(key) >= 0) {
          matched.push({
            ref: 'cau:' + id,
            title: title,
            stage: clean(c.stage || c.status, 20),
            summary: clean(c.summary || c.note || '', 80),
            action: clean(c.action || '', 60),
            immediate: clean(c.immediate || c.consequence || '', 80),
            refs: refs.slice(0, 4),
            at: num(c.at) || num(c.settledAt) || 0,
            settled: (clean(c.stage || c.status, 20) === 'settled' || clean(c.stage || c.status, 20) === 'terminal'),
            source: 'causal'
          });
        }
      });
    }

    // 2. 跨模块业务实体真实因果追溯
    // 设施 (serviceNetwork)
    if (s.serviceNetwork && Array.isArray(s.serviceNetwork.facilities)) {
      s.serviceNetwork.facilities.forEach(function (fac) {
        if (!fac) return;
        if (fac.id === key || fac.name === key || (fac.id && fac.id.indexOf(key) >= 0)) {
          matched.push({
            ref: 'fac:' + fac.id,
            title: '设施: ' + fac.name,
            stage: fac.status,
            summary: '状态: ' + fac.status + ', 负载: ' + fac.load + '/' + fac.capacity,
            action: fac.status === 'operational' ? '正常运营' : '维护/降级',
            immediate: fac.status === 'degraded' ? '服务降级容量折半' : '已恢复服务',
            refs: [fac.placeId],
            at: fac.lastMaintained || fac.createdAt || 0,
            settled: fac.status === 'operational',
            source: 'serviceNetwork'
          });
        }
      });
    }

    // 工单 (production)
    if (s.production && Array.isArray(s.production.orders)) {
      s.production.orders.forEach(function (ord) {
        if (!ord) return;
        if (ord.id === key || ord.name === key || (ord.id && ord.id.indexOf(key) >= 0)) {
          matched.push({
            ref: 'ord:' + ord.id,
            title: '工单: ' + (ord.recipe || ord.id),
            stage: ord.status,
            summary: '进度: ' + ord.progress + '/' + ord.days + ', 待交: ' + ord.qty,
            action: ord.status === 'completed' ? '交付完结' : '在产推进',
            immediate: ord.deferred ? '曾发生延期' : '按期交付',
            refs: [ord.who, ord.place],
            at: ord.updatedAt || ord.createdAt || 0,
            settled: ord.status === 'completed' || ord.status === 'delivered',
            source: 'production'
          });
        }
      });
    }

    matched.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    _stat.traces++;
    return {
      ok: true,
      seed: key,
      traces: matched,
      count: matched.length,
      note: '追溯只走已记录的因果链，不凭空推断；未结算的链如实标注 settled=false'
    };
  }

  /**
   * 场外变化经实际感知/传讯进入当前视角。
   * 严格保护局部知情：只呈现主角已目击或通过信使/回执已获知的场外变化，不泄露远方秘密。
   */
  function perceivedHorizon(who, opts) {
    var person = clean(who, 40);
    var o = opts || {};
    var s = state();
    var isAllKnowing = (o.allKnowing === true) || person === 'author' || person === 'narrator' || !person;

    // 从 noesis state 取该人物已感知的事实
    var items = [];
    var noe = s.noesis || {};
    var people = noe.people || {};
    var pdata = people[person] || {};
    var facts = pdata.facts || {};
    var fkeys = Object.keys(facts).slice(0, 8);
    items = fkeys.map(function (fk) {
      var f = facts[fk] || {};
      return {
        factId: clean(fk, 40),
        summary: clean(f.summary || f.text || '', 80),
        certainty: clean(f.certainty || (f.known ? 'known' : ''), 20),
        receivedAt: num(f.at) || num(f.receivedAt) || 0
      };
    });

    // 从 chronicle 取 horizon（远方）事件
    var chron = Array.isArray(s.chronicle) ? s.chronicle : [];
    var pRecord = s.people ? (s.people['p_' + person] || s.people[person]) : null;

    var horizon = chron.filter(function (c) {
      if (!c || !c.horizon || clean(c.visibility, 20) === 'hidden') return false;
      if (isAllKnowing) return true;

      // 角色模式：必须有真实的知情/传讯凭据（通知、目击、涉事引用或收件箱）
      var isRecipient = Array.isArray(c.recipients) && (c.recipients.indexOf(person) >= 0 || c.recipients.indexOf('p_' + person) >= 0);
      var isWitness = Array.isArray(c.witnesses) && (c.witnesses.indexOf(person) >= 0 || c.witnesses.indexOf('p_' + person) >= 0);
      var isRef = Array.isArray(c.refs) && (c.refs.indexOf(person) >= 0 || c.refs.indexOf('p_' + person) >= 0);
      var inInbox = pRecord && Array.isArray(pRecord.inbox) && pRecord.inbox.some(function (m) {
        return m && (m.id === c.id || m.ref === c.id || m.topic === c.id);
      });
      var inFacts = !!(facts && (facts[c.id] || facts[c.title]));

      return isRecipient || isWitness || isRef || inInbox || inFacts;
    }).slice(0, 4).map(function (c) {
      return {
        ref: clean(c.id, 40),
        title: clean(c.title, 60),
        summary: clean(c.summary || '', 80),
        at: num(c.at) || 0
      };
    });
    return {
      ok: true,
      who: person,
      isAllKnowing: isAllKnowing,
      perceivedItems: items,
      horizonEvents: horizon,
      note: '场外变化只经实际感知/传讯进入视角；未收到的消息不出现'
    };
  }

  /**
   * OPV3-1: 世界情境投影
   * 只读聚合：当前人物、地点、时段、在场人、可见变化、临近承诺、可用行动、阻塞行动。
   * 无状态持久化，纯只读投影；无待办时给出 nothing_to_do 明确标识。
   */
  /**
   * 场景历史因果回声反查（OPV3-8）：历史在当下被消费，反事实不进真历史，非可知视角过滤
   */
  function traceCausalEchoes(placeId, viewer, opts) {
    var pid = clean(placeId, 60);
    var who = clean(viewer, 40);
    var o = opts || {};
    var s = state();
    var echoes = [];

    // 1. 生产施工事故回声
    var incidents = ((s.aftermathImpact || {}).incidents) || [];
    incidents.forEach(function (inc) {
      if (!inc) return;
      if (pid && inc.placeId && inc.placeId !== pid) return;
      // 视角过滤：当事人或有认知记录者方可知
      if (who) {
        var isParty = (inc.faultParty === who || inc.operator === who || inc.supervisor === who || inc.injuredPerson === who);
        var knows = isParty;
        if (!knows && WA.epistemicView && typeof WA.epistemicView.getBelief === 'function') {
          var b = WA.epistemicView.getBelief(who, 'incident_' + inc.id) || WA.epistemicView.getBelief(who, inc.id);
          if (b && b.known) knows = true;
        }
        if (!knows) return; // 秘密/局外事故绝不透传
      }
      echoes.push({
        id: inc.id,
        kind: 'incident',
        summary: (inc.faultParty || '有人') + '因' + (inc.faultDegree === 'reckless_command' ? '强令带病作业' : '操作失误') + '导致设施断轴损坏',
        who: inc.faultParty,
        status: inc.status,
        impactOnNow: inc.status === 'unsettled' ? '责任赔偿尚未结清，人际关系高度紧张' : '已完成物资代偿和解，但过失留痕',
        at: inc.createdAt
      });
    });

    // 2. 承诺与违约回声
    var promises = ((s.customLax || {}).promises) || [];
    promises.forEach(function (p) {
      if (!p) return;
      if (who) {
        var isParty = (p.promiser === who || p.beneficiary === who);
        var knows = isParty;
        if (!knows && WA.epistemicView && typeof WA.epistemicView.getBelief === 'function') {
          var b = WA.epistemicView.getBelief(who, 'promise_' + p.id);
          if (b && b.known) knows = true;
        }
        if (!knows) return;
      }
      if (p.status === 'defaulted' || p.status === 'remedied') {
        echoes.push({
          id: p.id,
          kind: 'promise',
          summary: p.promiser + '对' + p.beneficiary + '违背「' + p.subject + '」的约定',
          who: p.promiser,
          status: p.status,
          impactOnNow: p.status === 'defaulted' ? '信任污点未除，履约声望折损' : '虽经加倍赔偿弥补，历史违约事实不可磨灭',
          at: p.defaultedAt || p.createdAt
        });
      }
    });

    // 3. 设施抢修与修缮回声
    var facs = ((s.serviceNetwork || {}).facilities) || [];
    facs.forEach(function (f) {
      if (!f || (pid && f.placeId !== pid)) return;
      var rLog = Array.isArray(f.repairLog) ? f.repairLog : [];
      rLog.forEach(function (rl) {
        if (!rl) return;
        if (who && rl.worker !== who && (!WA.epistemicView || !WA.epistemicView.getBelief(who, 'repair_' + f.id))) {
          // 非工匠且不知情
          return;
        }
        echoes.push({
          id: 'rep_' + f.id + '_' + rl.at,
          kind: 'repair',
          summary: rl.worker + '投入物料修复了「' + f.name + '」',
          who: rl.worker,
          status: 'completed',
          impactOnNow: '设施已恢复运转能力，历史修缮物料已真实消耗',
          at: rl.at
        });
      });
    });

    return echoes.slice(0, 10);
  }

  function situation(opts) {
    var o = opts || {};
    var s = state();
    var viewer = clean(o.who || o.viewer, 40);
    var place = clean(o.place || (s.region && s.region.currentPlace) || (s.people && viewer && s.people['p_' + viewer] && s.people['p_' + viewer].location) || '', 60);

    // 1. 在场人物（物理在场，排除在途）
    var present = [];
    if (s.people) {
      var keys = Object.keys(s.people);
      var matched = [];
      for (var pi = 0; pi < keys.length; pi++) {
        var k = keys[pi];
        var p = s.people[k];
        if (!p) continue;
        var pname = clean(p.name || k.replace(/^p_/, ''), 40);
        var pst = clean(p.status || p.action || '', 30);
        var ploc = clean(p.location || p.place || '', 60);
        if (pst === 'traveling' || pst === 'on_the_road' || pst === 'transit') continue;
        if (place && ploc && ploc !== place) continue;
        matched.push(pname);
      }
      present = matched.slice(0, 8);
    }

    // 2. 可见变化
    var visibleChanges = [];
    var chains = ((s.causal || {}).chains) || [];
    if (Array.isArray(chains)) {
      visibleChanges = chains.filter(function (c) {
        if (!c) return false;
        var st = clean(c.stage || c.status, 20);
        if (st !== 'pending' && st !== 'delayed') return false;
        if (viewer) {
          var aff = Array.isArray(c.affected) ? c.affected : (c.who ? [c.who] : []);
          var isRelated = aff.indexOf(viewer) >= 0 || aff.indexOf('p_' + viewer) >= 0;
          var isAtPlace = place && c.place && clean(c.place, 60) === place;
          if (!isRelated && !isAtPlace && !c.public) return false;
        }
        return true;
      }).map(function (c) {
        return {
          id: clean(c.id, 40),
          title: clean(c.title || c.key || c.id, 60),
          stage: clean(c.stage || c.status, 20),
          summary: clean(c.summary || c.note || '', 80)
        };
      }).slice(0, 6);
    }

    // 3. 临近承诺与待办
    var approachingPromises = [];
    if (WA.pendingCenter && typeof WA.pendingCenter.items === 'function') {
      try {
        var piRes = WA.pendingCenter.items({ limit: 8 });
        if (piRes && piRes.ok && Array.isArray(piRes.rows)) {
          approachingPromises = piRes.rows.filter(function (r) {
            if (!r) return false;
            if (viewer && r.who && clean(r.who, 40) !== viewer) return false;
            return true;
          }).map(function (r) {
            return {
              id: clean(r.id, 40),
              source: clean(r.source, 30),
              title: clean(r.title || r.label || r.id, 60),
              deadline: num(r.deadline) || num(r.day) || null,
              status: clean(r.status, 20)
            };
          }).slice(0, 6);
        }
      } catch (e) {}
    }

    // 4. 可用行动与被阻塞行动（消费 actionDesk.board）
    var availableActions = [];
    var blockedActions = [];
    if (WA.actionDesk && typeof WA.actionDesk.board === 'function') {
      try {
        var bRes = WA.actionDesk.board({ person: viewer, place: place });
        if (bRes && bRes.ok && Array.isArray(bRes.rows)) {
          bRes.rows.forEach(function (rw) {
            if (!rw) return;
            var item = {
              id: clean(rw.id, 60),
              kind: clean(rw.kind || rw.owner, 30),
              label: clean(rw.label, 60),
              state: clean(rw.state, 20),
              why: clean(rw.why, 120),
              owner: clean(rw.owner || rw.kind, 30)
            };
            if (rw.state === 'ready') {
              availableActions.push(item);
            } else {
              blockedActions.push(item);
            }
          });
        }
      } catch (e) {}
    }

    // 5. 具名公共工程（Joint Projects）
    var jointProjects = [];
    if (s.coop && s.coop.projects && typeof s.coop.projects === 'object') {
      var pKeys = Object.keys(s.coop.projects);
      for (var pki = 0; pki < pKeys.length; pki++) {
        var pj = s.coop.projects[pKeys[pki]];
        if (!pj) continue;
        var pPlace = clean(pj.region || pj.place, 60);
        var isLocal = !place || !pPlace || pPlace === place;
        var isParticipant = viewer && Array.isArray(pj.participants) && pj.participants.indexOf(viewer) >= 0;
        if (isLocal || isParticipant) {
          jointProjects.push({
            id: pj.id,
            title: pj.title,
            status: pj.status,
            progress: pj.progress || 0,
            downgraded: !!pj.downgraded,
            absenceAlert: pj.status === 'suspended' ? '停工待援：存在缺席或争议' : null,
            workorderId: pj.workorderId || null
          });
        }
      }
    }

    // 6. 空闲状态判据
    var hasActiveProjects = jointProjects.some(function (p) { return p.status === 'active' || p.status === 'suspended'; });
    var isIdle = (availableActions.length === 0 && approachingPromises.length === 0 && visibleChanges.length === 0 && !hasActiveProjects);
    var idleStatus = isIdle ? 'nothing_to_do' : 'active';
    var idleText = isIdle ? '此处风平浪静，暂无紧急待办或即刻行动' : '场景中有正在展开的事件、工程或待办行动';

    _stat.scenes++;
    return {
      ok: true,
      isProjection: true,
      viewer: viewer,
      place: place,
      present: present,
      visibleChanges: visibleChanges,
      approachingPromises: approachingPromises,
      availableActions: availableActions,
      blockedActions: blockedActions,
      jointProjects: jointProjects,
      sceneEchoes: traceCausalEchoes(place, viewer, o),
      idleStatus: idleStatus,
      idleText: idleText,
      hasPending: !isIdle,
      note: '情境投影纯只读，无世界状态持久化；切换场景实时更新'
    };
  }

  WA.sceneNarrative = {
    currentScene: currentScene,
    situation: situation,
    traceCausalEchoes: traceCausalEchoes,
    resolvedSummary: resolvedSummary,
    traceFrom: traceFrom,
    perceivedHorizon: perceivedHorizon,
    stat: function () { return Object.assign({}, _stat, { faults: Object.assign({}, _stat.faults) }); },
    reset: function () { _stat.scenes = 0; _stat.traces = 0; _stat.refused = 0; _stat.lastReason = ''; _stat.faults = {}; return { ok: true }; }
  };
  WA.situation = situation;

  if (typeof WA.registerModule === 'function') WA.registerModule('engines/scene-narrative.js', { kind: 'engine', ver: '2.231.0' });
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/scene-narrative 已加载（2.231.0）');
  }
})();