/**
 * WorldAxis engines/surgical-triage.js (v2.350.0) — 战地外科清创、止血缝合与药物救治引擎 (EXV19-3)
 *
 * ── 它治什么（核心沙盒痛点）────────────────────────────────────
 *   沙盒战斗与伤害系统通常仅停留在「扣减生命值/护甲」或静态伤残标签，
 *   缺乏战地与急救过程的微观病理闭环：当动脉破裂、开放性骨折或穿透伤发生时，
 *   必须遵循外科处置规范（止血压迫 -> 剔除坏死异物清创 -> 伤口对齐缝合 -> 夹板固定），
 *   若跳过止血直接深层动刀或在污浊非无菌环境中处置，将引发致命性失血性休克或坏疽败血症。
 *
 * ── 核心机制工序（performSurgery）───────────────────────────────
 *   ① 四阶救护手术工序（procedures）：
 *      - tourniquet: 止血带/穴位压迫（针对动脉或喷射大出血），大幅降低失血率；
 *      - debridement: 清创除腐，剔除铁砂、木屑与坏死组织，清空感染源（necrosis）；
 *      - suture: 穿针分层缝合裂口，止住内部渗血并闭合创面；
 *      - splint: 正骨复位与夹板固定（针对开放性或粉碎性骨折）；
 *   ② 病理生理演进：
 *      - 创伤指标：bleeding (0~100), infectionRisk (0~100), stability (0~100);
 *      - 失血性休克（hypovolemicShock）：当 bleeding >= 80 且持续失血时触发；
 *      - 败血感染（sepsis）：非无菌手术（sterile: false）大幅拉高感染化脓风险；
 *   ③ 真实破坏性负控制门禁：
 *      - 动脉大喷血未控制（bleeding >= 80）强行进行深层清创缝合 -> 直接拒绝并判定休克危机；
 *      - 空患者或非法病历对象安全拦截。
 */
(function () {
  'use strict';

  const root = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this);
  root.WorldAxis = root.WorldAxis || {};
  const WA = root.WorldAxis;
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };

  const LS_KEY = 'worldaxis_surgical_triage_settings_v1';
  const DEF = {
    enabled: true,
    maxPatients: 32,
    defaultSepsisThreshold: 75,
    shockBleedThreshold: 80
  };

  const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'surgicalTriage',
    bounds: {
      maxPatients: [4, 128],
      defaultSepsisThreshold: [50, 95],
      shockBleedThreshold: [60, 95]
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
    patientsAdmitted: 0,
    surgeriesPerformed: 0,
    shockAverted: 0,
    sepsisIncidents: 0,
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

  function getPatients(draft) {
    const root = draft || (WA.store ? WA.store.get() : null);
    if (!root) return {};
    if (!root.surgicalPatients || typeof root.surgicalPatients !== 'object' || Array.isArray(root.surgicalPatients)) {
      if (draft) draft.surgicalPatients = {};
      return draft ? draft.surgicalPatients : {};
    }
    return root.surgicalPatients;
  }

  /**
   * 接诊/登记创伤伤员：admitPatient
   */
  function admitPatient(patientId, traumaSpec) {
    if (!settings().enabled) {
      noteFault('disabled');
      return { ok: false, reason: 'disabled' };
    }
    const pid = cleanStr(patientId, 50);
    if (!pid) {
      noteFault('missing-patient-id');
      return { ok: false, reason: 'missing-patient-id' };
    }

    const sp = traumaSpec || {};
    const traumaType = cleanStr(sp.traumaType || 'puncture', 30); // 'puncture' | 'laceration' | 'fracture' | 'burn'
    const bleeding = clamp(sp.bleeding !== undefined ? sp.bleeding : 60, 0, 100);
    const pain = clamp(sp.pain !== undefined ? sp.pain : 50, 0, 100);

    let result = null;
    WA.store.transact(function (draft) {
      const map = getPatients(draft);
      const record = {
        patientId: pid,
        traumaType: traumaType,
        bleeding: bleeding,
        infectionRisk: clamp(sp.infectionRisk || 20, 0, 100),
        stability: clamp(sp.stability || 70, 0, 100),
        hasTourniquet: false,
        isDebrided: false,
        isSutured: false,
        isSplinted: false,
        inShock: bleeding >= settings().shockBleedThreshold,
        hasSepsis: false,
        proceduresLog: [],
        admittedAt: clockNow('surgicalTriage'),
        updatedAt: clockNow('surgicalTriage')
      };
      map[pid] = record;
      stat.patientsAdmitted++;
      result = { ok: true, patient: Object.assign({}, record), admitted: true };
    }, 'surgicalTriage:admitPatient');

    return result || { ok: false, reason: 'transact-failed' };
  }

  /**
   * 核心业务写口：执行战地外科处置（performSurgery）
   */
  function performSurgery(spec) {
    if (!settings().enabled) {
      noteFault('disabled');
      return { ok: false, reason: 'disabled' };
    }
    if (!spec || typeof spec !== 'object') {
      noteFault('bad-spec');
      return { ok: false, reason: 'bad-spec' };
    }

    const pid = cleanStr(spec.patientId || spec.actorId, 50);
    const procedure = cleanStr(spec.procedure, 30); // 'tourniquet' | 'debridement' | 'suture' | 'splint' | 'transfuse'
    const isSterile = Boolean(spec.isSterile); // 是否无菌/草药熏蒸环境
    const surgeonSkill = clamp(spec.surgeonSkill || 60, 10, 100);

    if (!pid || !procedure) {
      noteFault('missing-patient-or-procedure');
      return { ok: false, reason: 'missing-patient-or-procedure' };
    }

    if (!WA.store || typeof WA.store.transact !== 'function') {
      noteFault('no-store');
      return { ok: false, reason: 'no-store' };
    }

    let result = null;

    WA.store.transact(function (draft) {
      const map = getPatients(draft);
      let p = map[pid];

      if (!p) {
        // 自动入组建档
        p = {
          patientId: pid,
          traumaType: 'laceration',
          bleeding: 65,
          infectionRisk: 25,
          stability: 60,
          hasTourniquet: false,
          isDebrided: false,
          isSutured: false,
          isSplinted: false,
          inShock: false,
          hasSepsis: false,
          proceduresLog: [],
          admittedAt: clockNow('surgicalTriage'),
          updatedAt: clockNow('surgicalTriage')
        };
        map[pid] = p;
      }

      const now = clockNow('surgicalTriage');

      // ── 真实破坏性负控制门禁：大出血（bleeding >= 80）未上止血带强行缝合/动刀清创 ──
      if (p.bleeding >= settings().shockBleedThreshold && (procedure === 'suture' || procedure === 'debridement')) {
        p.inShock = true;
        p.stability = clamp(p.stability - 35, 5, 100);
        p.updatedAt = now;
        stat.shockAverted++;
        noteFault('uncontrolled-hemorrhage-stabilization-required');
        result = {
          ok: false,
          reason: 'uncontrolled-hemorrhage-stabilization-required',
          refusal: 'uncontrolled-hemorrhage-stabilization-required',
          inShock: true,
          patientId: pid,
          bleeding: p.bleeding,
          message: '患者动脉破裂大出血（流血度高达 ' + p.bleeding + '），未先行动脉加压/止血带止血即强行缝合，瞬间引发严重失血性休克！'
        };
        return;
      }

      // ── 1. 压迫/止血带止血 (tourniquet) ──
      if (procedure === 'tourniquet') {
        p.hasTourniquet = true;
        p.bleeding = clamp(p.bleeding - Math.floor(surgeonSkill * 0.7), 0, 100);
        p.stability = clamp(p.stability + 15, 0, 100);
        p.inShock = p.bleeding >= settings().shockBleedThreshold;
        p.proceduresLog.push({ procedure: 'tourniquet', timestamp: now });
        stat.surgeriesPerformed++;
        result = {
          ok: true,
          procedure: 'tourniquet',
          patientId: pid,
          bleeding: p.bleeding,
          stability: p.stability,
          inShock: p.inShock
        };
        return;
      }

      // ── 2. 外科清创除腐 (debridement) ──
      if (procedure === 'debridement') {
        p.isDebrided = true;
        const infDelta = isSterile ? -30 : 15; // 若环境污秽，清创反而将坏疽异物推入深部
        p.infectionRisk = clamp(p.infectionRisk + infDelta, 0, 100);
        if (p.infectionRisk >= settings().defaultSepsisThreshold) {
          p.hasSepsis = true;
          stat.sepsisIncidents++;
        }
        p.proceduresLog.push({ procedure: 'debridement', sterile: isSterile, timestamp: now });
        stat.surgeriesPerformed++;
        result = {
          ok: true,
          procedure: 'debridement',
          patientId: pid,
          sterile: isSterile,
          infectionRisk: p.infectionRisk,
          hasSepsis: p.hasSepsis
        };
        return;
      }

      // ── 3. 分层缝合闭口 (suture) ──
      if (procedure === 'suture') {
        p.isSutured = true;
        p.bleeding = clamp(p.bleeding - 40, 0, 100);
        p.stability = clamp(p.stability + 25, 0, 100);
        p.proceduresLog.push({ procedure: 'suture', timestamp: now });
        stat.surgeriesPerformed++;
        result = {
          ok: true,
          procedure: 'suture',
          patientId: pid,
          bleeding: p.bleeding,
          stability: p.stability
        };
        return;
      }

      // ── 4. 夹板正骨固定 (splint) ──
      if (procedure === 'splint') {
        p.isSplinted = true;
        p.stability = clamp(p.stability + 20, 0, 100);
        p.proceduresLog.push({ procedure: 'splint', timestamp: now });
        stat.surgeriesPerformed++;
        result = {
          ok: true,
          procedure: 'splint',
          patientId: pid,
          isSplinted: true,
          stability: p.stability
        };
        return;
      }

      noteFault('unsupported-procedure');
      result = { ok: false, reason: 'unsupported-procedure', procedure: procedure };
    }, 'surgicalTriage:performSurgery');

    return result || { ok: false, reason: 'transact-failed' };
  }

  /**
   * 读侧：查询伤患生理救治档案
   */
  function view(patientId) {
    const map = getPatients();
    if (patientId) {
      const pid = cleanStr(patientId, 50);
      const found = map[pid];
      if (!found) return { ok: false, reason: 'not-found', patientId: pid };
      return { ok: true, patient: Object.assign({}, found) };
    }
    return {
      ok: true,
      enabled: settings().enabled,
      patients: Object.keys(map).map(function (k) {
        const p = map[k];
        return {
          patientId: p.patientId,
          traumaType: p.traumaType,
          bleeding: p.bleeding,
          stability: p.stability,
          inShock: p.inShock,
          hasSepsis: p.hasSepsis
        };
      })
    };
  }

  /**
   * 提示词注入块
   */
  function buildBlock() {
    if (!settings().enabled) return '';
    const map = getPatients();
    const keys = Object.keys(map);
    if (!keys.length) return '';

    const lines = [];
    keys.slice(0, 4).forEach(function (k) {
      const p = map[k];
      if (p.inShock || p.hasSepsis || p.bleeding > 30) {
        let statusTag = [];
        if (p.inShock) statusTag.push('失血休克中');
        if (p.hasSepsis) statusTag.push('败血坏疽高危');
        if (p.isSutured) statusTag.push('已缝合');
        if (p.hasTourniquet) statusTag.push('已上止血带');
        lines.push('【战地创伤救护】伤患「' + p.patientId + '」（' + p.traumaType + '）：失血度 ' + p.bleeding + '，生命稳定度 ' + p.stability + '%，状态：' + statusTag.join('、') + '。');
      }
    });

    if (!lines.length) return '';
    return '[战地救护]' + String.fromCharCode(10) + lines.join(String.fromCharCode(10));
  }

  function statView() {
    return Object.assign({}, stat, {
      enabled: settings().enabled,
      activePatients: Object.keys(getPatients()).length
    });
  }

  WA.surgicalTriage = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    admitPatient: admitPatient,
    performSurgery: performSurgery,
    view: view,
    statView: statView,
    buildBlock: buildBlock
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/surgical-triage.js', { kind: 'engine', ver: '2.350.0' });
  }
})();