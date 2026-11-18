/**
 * WorldAxis engines/whisper-backchannel.js (v2.307.0)
 * EXV14-1: 公开宣称与私密背刺双轨视界分离（Whisper & Backchannel Deals）
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) {
    try { return WA.clock.now(site); } catch (e) { return Date.now(); }
  };

  const LS_KEY = 'worldaxis_whisper_backchannel_settings_v1';
  const DEF = { enabled: true, maxWhispers: 64, interceptThreshold: 0.65 };
  const __REG = { key: LS_KEY, def: DEF, module: 'whisperBackchannel' };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = Object.assign({}, DEF);
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
                          : Object.assign(base, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})))
      : Object.assign({}, settings(), next || {});
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const _stat = { sent: 0, intercepted: 0, sealed: 0, refused: 0, lastReason: '' };

  function sendWhisper(senderId, recipientId, opts) {
    opts = opts || {};
    if (!settings().enabled) {
      _stat.refused++;
      _stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled' };
    }
    if (!senderId || !recipientId) {
      _stat.refused++;
      _stat.lastReason = 'invalid-participants';
      return { ok: false, reason: 'invalid-participants' };
    }

    const content = String(opts.content || opts.message || '').trim();
    if (!content) {
      _stat.refused++;
      _stat.lastReason = 'empty-content';
      return { ok: false, reason: 'empty-content' };
    }

    const secretDealKey = opts.secretDealKey ? String(opts.secretDealKey).trim() : null;
    const thirdParties = Array.isArray(opts.thirdParties) ? opts.thirdParties : [];
    const acousticDamping = typeof opts.acousticDamping === 'number' ? opts.acousticDamping : 0.5;

    let interceptedBy = null;
    let highestInsight = 0;

    for (let i = 0; i < thirdParties.length; i++) {
      const tp = thirdParties[i];
      const insight = typeof tp.insight === 'number' ? tp.insight : (tp.insightScore || 0);
      const dist = typeof tp.distance === 'number' ? tp.distance : 1.0;
      const detectChance = (insight / 100) * (1 - Math.min(0.9, acousticDamping)) / Math.max(0.5, dist);
      if (detectChance >= settings().interceptThreshold && insight > highestInsight) {
        highestInsight = insight;
        interceptedBy = tp.id || ('party_' + i);
      }
    }

    const whisperRecord = {
      id: 'whp_' + clockNow('whisper') + '_' + Math.floor(WA.rand.next('whisper-backchannel') * 1000),
      senderId: senderId,
      recipientId: recipientId,
      content: content,
      secretDealKey: secretDealKey,
      isIntercepted: Boolean(interceptedBy),
      interceptedBy: interceptedBy,
      audienceScope: [senderId, recipientId].concat(interceptedBy ? [interceptedBy] : []),
      at: clockNow('whisper')
    };

    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (draft) {
        draft.people = draft.people || {};
        [senderId, recipientId].forEach(function (pid) {
          if (draft.people[pid]) {
            draft.people[pid].whisperChannels = draft.people[pid].whisperChannels || [];
            draft.people[pid].whisperChannels.push(whisperRecord);
            if (draft.people[pid].whisperChannels.length > settings().maxWhispers) {
              draft.people[pid].whisperChannels.shift();
            }
          }
        });
        if (interceptedBy && draft.people[interceptedBy]) {
          draft.people[interceptedBy].interceptedWhispers = draft.people[interceptedBy].interceptedWhispers || [];
          draft.people[interceptedBy].interceptedWhispers.push(whisperRecord);
        }
      });
    }

    _stat.sent++;
    if (interceptedBy) {
      _stat.intercepted++;
    } else {
      _stat.sealed++;
    }

    return {
      ok: true,
      whisperId: whisperRecord.id,
      sealed: !interceptedBy,
      interceptedBy: interceptedBy,
      secretDealKey: secretDealKey,
      audienceScope: whisperRecord.audienceScope
    };
  }

  /**
   * EXV29-10（v2.524.0）：房间视图 —— 一次耳语在**满屋人**眼里各是什么。
   *   `audienceScope` 里的人拿内容；其余人只拿"他们在低声说话"，**拿不到一个字**。
   *   复用 `sendWhisper` 已写进 `people[].whisperChannels` 的记录，不另立账。
   */
  function perimeter(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const room = Array.isArray(src.room) ? src.room.map(function (x) { return String(x || '').trim(); }).filter(Boolean) : [];
    const whisperId = src.whisperId ? String(src.whisperId) : '';
    const senderId = src.senderId ? String(src.senderId) : '';
    if (!room.length) return { ok: false, reason: 'missing-fields', missing: ['room'] };
    let rec = null;
    try {
      const st = (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || {}) : {};
      const ppl = st.people || {};
      const ids = [senderId].concat(room).filter(Boolean);
      for (let i = 0; i < ids.length && !rec; i++) {
        const ch = (ppl[ids[i]] && Array.isArray(ppl[ids[i]].whisperChannels)) ? ppl[ids[i]].whisperChannels : [];
        for (let j = ch.length - 1; j >= 0; j--) {
          if (!whisperId || ch[j].id === whisperId) { rec = ch[j]; break; }
        }
      }
    } catch (e) { rec = null; }
    if (!rec) return { ok: false, reason: 'not-happened', note: '没有这条耳语的账：先 sendWhisper' };
    const inside = Array.isArray(rec.audienceScope) ? rec.audienceScope.slice() : [];
    const rows = room.map(function (who) {
      if (inside.indexOf(who) >= 0) {
        const isIntercept = (who !== rec.senderId && who !== rec.recipientId);
        return { who: who, inside: true, fidelity: 'full', got: rec.content,
          why: isIntercept ? '他是偷听到的（听力够、离得近）' : '他是说话人或指定听者' };
      }
      return { who: who, inside: false, fidelity: 'voice-only', got: '（他们在低声说话，听不清）',
        why: '不在这次耳语的听者范围内：只知道有人在低声说话' };
    });
    const leaked = rows.filter(function (r) { return !r.inside && String(r.got).indexOf(rec.content) >= 0; });
    return { ok: true, reason: 'ok', whisperId: rec.id, inside: inside, rows: rows,
      leak: leaked.length,
      note: leaked.length ? '有 ' + leaked.length + ' 个圈外人拿到了内容（这是泄漏）'
        : '圈外人一个字都没拿到：只听见"他们在说话"' };
  }

  WA.whisperBackchannel = {
    sendWhisper: sendWhisper,
    perimeter: perimeter
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/whisper-backchannel.js', { kind: 'engine', ver: '2.307.0' });
  }
})();