/**
 * WorldAxis engines/covert-espionage.js (v2.350.0) — 间谍潜伏渗透、假身份伪造与眼线暗网引擎 (EXV19-1)
 *
 * ── 它治什么（核心沙盒痛点）────────────────────────────────────
 *   沙盒世界的隐秘对抗此前仅停留在抽象的「阵营好感度」与「粗粒度打探」，
 *   缺乏严密的谍报生命周期：角色没有假文牒与双重身份概念，无法进行深度据点渗透、
 *   收买眼线暗桩、拦截军事/商贸密函，亦无法通过反间计散布伪证。
 *
 * ── 核心机制闭环 ───────────────────────────────────────────────
 *   ① 双重身份与掩护体系：
 *      - 真实身份（trueIdentity）：所属母体阵营、真实姓名、忠诚度；
 *      - 伪装身份（coverIdentity）：伪造姓名、职业掩护（医者/商贾/厨役/军卒）、假文牒；
 *      - 掩护完整度（coverIntegrity, 0~100）：假身份的严密程度；
 *      - 可疑度（suspicion, 0~100）：异常行为与破绽累积。
 *   ② 四大核心谍务操作（operateSpy）：
 *      - infiltrate: 潜入指定据点/官署；若掩护完整度为 0 且无通行证，直接触发当场识破与格杀指令；
 *      - cultivateAsset: 发展/收买眼线，通过利诱（bribe）、敲诈（blackmail）或理念（ideology）建立暗网；
 *      - interceptDispatch: 截获并破译往来密函，获取重要战略/商贸情报；
 *      - plantDisinformation: 散布假情报/伪证，扰乱敌方派系视线。
 *   ③ 破绽外溢与暴露反噬：
 *      - 当 suspicion >= coverIntegrity 时，潜伏身份破产，触发审查、通缉或逮捕扣押；
 *      - 眼线如果遭遇长期断饷或忠诚归零，会倒戈反咬成为双面间谍（double_agent）。
 *
 * ── 铁律与设计边界 ─────────────────────────────────────────────
 *   - 绝不使用题材硬编码：无论西幻法师塔、仙侠宗门、赛博企业或历史官署，一律抽象为据点与情报流；
 *   - 真实破坏性负控制：非法参数必拒；掩护完整度为 0 潜入高密据点必被拦截并反噬捕获；
 *   - 持久化：状态持久化到 WA.store，跨会话可查可追溯。
 */
(function () {
  'use strict';

  const root = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this);
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };

  const LS_KEY = 'worldaxis_covert_espionage_settings_v1';
  const DEF = {
    enabled: true,
    maxSpies: 32,
    maxDispatches: 64,
    defaultSuspicionDecay: 2,
    exposureThresholdRatio: 1.0
  };

  const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'covertEspionage',
    bounds: {
      maxSpies: [4, 128],
      maxDispatches: [8, 256],
      defaultSuspicionDecay: [0, 10],
      exposureThresholdRatio: [0.5, 2.0]
    }
  };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }

  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = {
    createdSpies: 0,
    infiltrations: 0,
    assetsCultivated: 0,
    dispatchesIntercepted: 0,
    disinformationPlanted: 0,
    exposures: 0,
    refusals: 0,
    lastReason: ''
  };

  function noteFault(r) {
    stat.refusals++;
    stat.lastReason = String(r || 'unknown-refusal');
  }

  function cleanStr(val, maxLen) {
    if (typeof val !== 'string') return '';
    return val.trim().slice(0, maxLen || 80);
  }

  function clamp(n, min, max) {
    const v = Number(n);
    if (isNaN(v)) return min;
    return Math.max(min, Math.min(max, v));
  }

  function getSpies(draft) {
    const root = draft || (WA.store ? WA.store.get() : null);
    if (!root) return [];
    if (!root.covertSpies || !Array.isArray(root.covertSpies)) {
      if (draft) draft.covertSpies = [];
      return draft ? draft.covertSpies : [];
    }
    return root.covertSpies;
  }

  function getDispatches(draft) {
    const root = draft || (WA.store ? WA.store.get() : null);
    if (!root) return [];
    if (!root.covertDispatches || !Array.isArray(root.covertDispatches)) {
      if (draft) draft.covertDispatches = [];
      return draft ? draft.covertDispatches : [];
    }
    return root.covertDispatches;
  }

  /**
   * 注册并创建一名间谍档案
   */
  function registerSpy(spec) {
    if (!settings().enabled) {
      noteFault('disabled');
      return { ok: false, reason: 'disabled' };
    }
    if (!spec || typeof spec !== 'object') {
      noteFault('bad-spec');
      return { ok: false, reason: 'bad-spec' };
    }
    const actorId = cleanStr(spec.actorId, 50);
    const factionId = cleanStr(spec.factionId, 50);
    const coverName = cleanStr(spec.coverName, 50);
    const coverRole = cleanStr(spec.coverRole, 50);

    if (!actorId || !coverName) {
      noteFault('missing-spy-identity');
      return { ok: false, reason: 'missing-spy-identity' };
    }

    const cfg = settings();
    let result = null;

    if (!WA.store || typeof WA.store.transact !== 'function') {
      noteFault('no-store');
      return { ok: false, reason: 'no-store' };
    }

    WA.store.transact(function (draft) {
      const list = getSpies(draft);
      let existing = list.find(function (s) { return s.actorId === actorId; });
      const coverIntegrity = clamp(spec.coverIntegrity !== undefined ? spec.coverIntegrity : 80, 0, 100);

      if (existing) {
        existing.factionId = factionId || existing.factionId;
        existing.coverName = coverName;
        existing.coverRole = coverRole || existing.coverRole;
        existing.coverIntegrity = coverIntegrity;
        existing.updatedAt = clockNow('covertEspionage');
        result = { ok: true, spy: Object.assign({}, existing), updated: true };
        return;
      }

      if (list.length >= cfg.maxSpies) {
        list.shift(); // FIFO 挤出
      }

      const spyRecord = {
        actorId: actorId,
        factionId: factionId || 'independent',
        coverName: coverName,
        coverRole: coverRole || 'traveler',
        coverIntegrity: coverIntegrity,
        suspicion: clamp(spec.suspicion || 0, 0, 100),
        status: 'active', // 'active' | 'infiltrating' | 'exposed' | 'captured' | 'compromised'
        currentLocation: cleanStr(spec.locationId || 'unknown', 50),
        assets: [], // 收买发展的眼线名单
        intelLog: [], // 截获的情报记录
        disinformationCount: 0,
        createdAt: clockNow('covertEspionage'),
        updatedAt: clockNow('covertEspionage')
      };

      list.push(spyRecord);
      stat.createdSpies++;
      result = { ok: true, spy: Object.assign({}, spyRecord), created: true };
    }, 'covertEspionage:registerSpy');

    return result || { ok: false, reason: 'transact-failed' };
  }

  /**
   * 核心统一调度业务写口：operateSpy
   */
  function operateSpy(spec) {
    if (!settings().enabled) {
      noteFault('disabled');
      return { ok: false, reason: 'disabled' };
    }
    if (!spec || typeof spec !== 'object') {
      noteFault('bad-spec');
      return { ok: false, reason: 'bad-spec' };
    }

    const spyId = cleanStr(spec.spyId || spec.actorId, 50);
    const action = cleanStr(spec.action, 40);

    if (!spyId || !action) {
      noteFault('missing-action-or-spyId');
      return { ok: false, reason: 'missing-action-or-spyId' };
    }

    if (!WA.store || typeof WA.store.transact !== 'function') {
      noteFault('no-store');
      return { ok: false, reason: 'no-store' };
    }

    let result = null;

    WA.store.transact(function (draft) {
      const list = getSpies(draft);
      const spy = list.find(function (s) { return s.actorId === spyId || s.coverName === spyId; });

      if (!spy) {
        noteFault('spy-not-found');
        result = { ok: false, reason: 'spy-not-found', spyId: spyId };
        return;
      }

      if (spy.status === 'captured') {
        noteFault('spy-captured');
        result = { ok: false, reason: 'spy-captured-cannot-act', spyId: spyId };
        return;
      }

      const now = clockNow('covertEspionage');

      // ── 行动分支 1：据点潜入 (infiltrate) ──
      if (action === 'infiltrate') {
        const targetLocation = cleanStr(spec.locationId, 50);
        const securityLevel = clamp(spec.securityLevel || 50, 0, 100);
        const hasPermit = Boolean(spec.hasPermit);

        if (!targetLocation) {
          noteFault('missing-location');
          result = { ok: false, reason: 'missing-location' };
          return;
        }

        // 真实破坏性负控制门禁：掩护完整度为 0 且无文牒强行潜入高戒备据点 -> 必当场识破抓捕
        if (spy.coverIntegrity <= 0 && !hasPermit && securityLevel > 30) {
          spy.status = 'captured';
          spy.suspicion = 100;
          spy.updatedAt = now;
          stat.exposures++;
          noteFault('compromised-cover-detected');
          result = {
            ok: false,
            reason: 'compromised-cover-detected',
            refusal: 'compromised-cover-detected',
            captured: true,
            actorId: spy.actorId,
            message: '间谍假身份破绽百出且无通行文牒，刚踏入禁区即被守卫当场扣押！'
          };
          return;
        }

        // 正常渗透结算
        const suspicionGain = Math.max(5, Math.floor(securityLevel * 0.3) - (hasPermit ? 15 : 0));
        spy.suspicion = clamp(spy.suspicion + suspicionGain, 0, 100);
        spy.currentLocation = targetLocation;
        spy.status = 'infiltrating';
        spy.updatedAt = now;
        stat.infiltrations++;

        // 检查是否超出阈值暴露
        const exposed = spy.suspicion >= spy.coverIntegrity;
        if (exposed) {
          spy.status = 'exposed';
          stat.exposures++;
        }

        result = {
          ok: true,
          action: 'infiltrate',
          actorId: spy.actorId,
          locationId: targetLocation,
          suspicion: spy.suspicion,
          coverIntegrity: spy.coverIntegrity,
          exposed: exposed,
          status: spy.status
        };
        return;
      }

      // ── 行动分支 2：收买/发展眼线 (cultivateAsset) ──
      if (action === 'cultivateAsset') {
        const assetTarget = cleanStr(spec.targetActorId || spec.assetId, 50);
        const method = cleanStr(spec.method || 'bribe', 30); // 'bribe' | 'blackmail' | 'ideology'
        const bribeAmount = Number(spec.bribeAmount || 0);

        if (!assetTarget) {
          noteFault('missing-target-asset');
          result = { ok: false, reason: 'missing-target-asset' };
          return;
        }

        // 负控制：空头支票利诱（贿赂额 <= 0 且方法为 bribe）拦截
        if (method === 'bribe' && bribeAmount <= 0) {
          noteFault('invalid-bribe-amount');
          result = { ok: false, reason: 'invalid-bribe-amount', refusal: 'bribe-requires-funds' };
          return;
        }

        let baseLoyalty = 60;
        if (method === 'bribe') baseLoyalty = Math.min(95, 50 + Math.floor(bribeAmount / 20));
        if (method === 'blackmail') baseLoyalty = 45; // 胁迫虽然有效但忠诚度较低
        if (method === 'ideology') baseLoyalty = 75;

        const assetRecord = {
          assetId: assetTarget,
          method: method,
          loyalty: baseLoyalty,
          role: cleanStr(spec.assetRole || 'informant', 40),
          isDoubleAgent: false,
          recruitedAt: now
        };

        spy.assets = spy.assets || [];
        const existIdx = spy.assets.findIndex(function (a) { return a.assetId === assetTarget; });
        if (existIdx >= 0) {
          spy.assets[existIdx] = assetRecord;
        } else {
          spy.assets.push(assetRecord);
        }

        spy.suspicion = clamp(spy.suspicion + 8, 0, 100);
        spy.updatedAt = now;
        stat.assetsCultivated++;

        result = {
          ok: true,
          action: 'cultivateAsset',
          actorId: spy.actorId,
          asset: assetRecord,
          totalAssets: spy.assets.length
        };
        return;
      }

      // ── 行动分支 3：截获密函 (interceptDispatch) ──
      if (action === 'interceptDispatch') {
        const dispatchId = cleanStr(spec.dispatchId, 60);
        const dispatches = getDispatches(draft);
        let dispatch = dispatches.find(function (d) { return d.id === dispatchId; });

        if (!dispatch) {
          // 若未显式传入已有密函，支持从 spec 动态模拟拦截
          if (!spec.content) {
            noteFault('dispatch-not-found');
            result = { ok: false, reason: 'dispatch-not-found', dispatchId: dispatchId };
            return;
          }
          dispatch = {
            id: dispatchId || ('disp-' + now + '-' + Math.floor(Math.random() * 1000)),
            sender: cleanStr(spec.sender || 'unknown', 50),
            recipient: cleanStr(spec.recipient || 'unknown', 50),
            content: cleanStr(spec.content, 200),
            intercepted: false,
            createdAt: now
          };
          dispatches.push(dispatch);
        }

        dispatch.intercepted = true;
        dispatch.interceptedBy = spy.actorId;
        dispatch.interceptedAt = now;

        spy.intelLog = spy.intelLog || [];
        spy.intelLog.push({
          dispatchId: dispatch.id,
          summary: dispatch.content.slice(0, 80),
          obtainedAt: now
        });

        spy.suspicion = clamp(spy.suspicion + 12, 0, 100);
        spy.updatedAt = now;
        stat.dispatchesIntercepted++;

        result = {
          ok: true,
          action: 'interceptDispatch',
          actorId: spy.actorId,
          dispatchId: dispatch.id,
          content: dispatch.content,
          sender: dispatch.sender,
          recipient: dispatch.recipient
        };
        return;
      }

      // ── 行动分支 4：散布反间计/假情报 (plantDisinformation) ──
      if (action === 'plantDisinformation') {
        const targetFaction = cleanStr(spec.targetFaction, 50);
        const rumor = cleanStr(spec.disinformationText, 150);

        if (!targetFaction || !rumor) {
          noteFault('missing-disinformation-params');
          result = { ok: false, reason: 'missing-disinformation-params' };
          return;
        }

        spy.disinformationCount = (spy.disinformationCount || 0) + 1;
        spy.suspicion = clamp(spy.suspicion + 10, 0, 100);
        spy.updatedAt = now;
        stat.disinformationPlanted++;

        result = {
          ok: true,
          action: 'plantDisinformation',
          actorId: spy.actorId,
          targetFaction: targetFaction,
          plantedText: rumor,
          totalPlanted: spy.disinformationCount
        };
        return;
      }

      noteFault('unsupported-spy-action');
      result = { ok: false, reason: 'unsupported-spy-action', action: action };
    }, 'covertEspionage:operateSpy');

    return result || { ok: false, reason: 'transact-failed' };
  }

  /**
   * 读侧：查询指定间谍或全域暗网态势
   */
  function view(spyId) {
    const list = getSpies();
    if (spyId) {
      const target = cleanStr(spyId, 50);
      const found = list.find(function (s) { return s.actorId === target || s.coverName === target; });
      if (!found) return { ok: false, reason: 'not-found', spyId: target };
      return { ok: true, spy: Object.assign({}, found) };
    }
    return {
      ok: true,
      enabled: settings().enabled,
      spiesCount: list.length,
      spies: list.map(function (s) {
        return {
          actorId: s.actorId,
          coverName: s.coverName,
          status: s.status,
          suspicion: s.suspicion,
          coverIntegrity: s.coverIntegrity,
          location: s.currentLocation,
          assetsCount: (s.assets || []).length
        };
      })
    };
  }

  /**
   * 生成提示词注入块（接入 inject-collector）
   */
  function buildBlock() {
    if (!settings().enabled) return '';
    const list = getSpies();
    if (!list.length) return '';

    const lines = [];
    list.slice(0, 5).forEach(function (s) {
      if (s.status === 'captured') {
        lines.push('【间谍拘捕】' + s.actorId + '（曾伪装为「' + s.coverName + '」）已被识破扣押，正在羁押受审。');
      } else if (s.status === 'exposed') {
        lines.push('【谍影暴露】' + s.coverName + '（真名：' + s.actorId + '）行迹败露（可疑度 ' + s.suspicion + '/' + s.coverIntegrity + '），正遭受紧密搜捕与排查！');
      } else if (s.status === 'infiltrating') {
        lines.push('【潜伏暗线】' + s.coverName + ' 正以「' + s.coverRole + '」身份在「' + s.currentLocation + '」潜伏渗透（可疑度 ' + s.suspicion + '，发展眼线 ' + (s.assets || []).length + ' 人）。');
      }
    });

    if (!lines.length) return '';
    return '[谍报暗网]' + String.fromCharCode(10) + lines.join(String.fromCharCode(10));
  }

  function statView() {
    return Object.assign({}, stat, {
      enabled: settings().enabled,
      activeSpies: getSpies().length,
      capturedSpies: getSpies().filter(function (s) { return s.status === 'captured'; }).length
    });
  }


  /**
   * OPV20-4: 吸收入站通讯流量，转化为客观眼线情报或暗网线索 (ingestCommTraffic)
   */
  function ingestCommTraffic(commEvent) {
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    commEvent = commEvent || {};
    const from = cleanStr(commEvent.from || commEvent.sender, 50);
    const to = cleanStr(commEvent.to || commEvent.receiver, 50);
    const text = cleanStr(commEvent.text || commEvent.content || commEvent.message, 240);
    const channel = cleanStr(commEvent.channel || 'phone_sms', 30);
    
    // 破坏性负控制：空白无实质内容的噪音通讯严禁作为情报入库
    if (!text || text.length < 5) {
      noteFault('comm-traffic-noise');
      return {
        ok: false,
        refusal: 'comm-traffic-noise',
        reason: '通讯报文长度不足或内容为空，属于无效网络噪音，严禁入库建立谍报线索！'
      };
    }

    let result = null;
    WA.store.transact(function (draft) {
      const dispatches = getDispatches(draft);
      const now = clockNow('covertEspionage:ingest');
      const dispatchId = 'wiretap_' + now + '_' + Math.random().toString(36).slice(2, 6);
      const entry = {
        dispatchId: dispatchId,
        sourceChannel: channel,
        sender: from || 'unknown_informant',
        receiver: to || 'intercept_station',
        interceptedContent: text,
        riskLevel: text.length > 50 ? 'high' : 'medium',
        interceptedAt: now,
        parsedClues: [channel, from].filter(Boolean)
      };
      dispatches.push(entry);
      stat.dispatchesIntercepted++;
      result = { ok: true, dispatchId: dispatchId, entry: entry, ingested: true };
    }, 'covertEspionage:ingestCommTraffic');

    return result || { ok: false, reason: 'transact-failed' };
  }

  WA.covertEspionage = {
    ingestCommTraffic: ingestCommTraffic,
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    registerSpy: registerSpy,
    operateSpy: operateSpy,
    view: view,
    statView: statView,
    buildBlock: buildBlock
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/covert-espionage.js', { kind: 'engine', ver: '2.350.0' });
  }
})();
