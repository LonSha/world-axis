/**
 * WorldAxis engines/spatial-acoustics.js (v2.302.0) — 具身空间密谈与物理声学隔阂引擎
 *
 * 核心机制（EXV13-1 & 场景 6）：
 *   结合地点空间拓扑图，为房间门窗、屏风与隔断赋予声学衰减系数与视线遮挡布尔值。
 *   - room.whisper: 密室低语密谈（带音量与保密判定）
 *   - room.eavesdrop: 隔墙/隔门窃听（根据声学衰减计算断续截获信息）
 *   - room.burstIn: 推门突入（物理打断正在进行的密谈，现场转入应激对峙）
 */
(function () {
  'use strict';
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_spatial_acoustics_settings_v1';
  const DEF = { enabled: true, baseDoorDamping: 0.65, baseWallDamping: 0.90, baseScreenDamping: 0.25 };
  const __REG = { key: LS_KEY, def: DEF, module: 'spatialAcoustics', bounds: {} };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    const raw = WA.settingsBus.read(__REG);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
  }

  // 内存状态缓存：活跃密谈空间
  const _activeConversations = new Map();
  const _roomPartitions = new Map();

  function registerPartition(roomId, adjacentRoomId, barrier) {
    const key = [roomId, adjacentRoomId].sort().join('<->');
    barrier = barrier || {};
    _roomPartitions.set(key, {
      type: barrier.type || 'door', // door | wall | screen | open
      // v2.382.0（死键族）：墙/屏/门三档默认衰减改由登记的 baseWallDamping / baseScreenDamping /
      //   baseDoorDamping 决定。此前只有 baseDoorDamping 被 getPartition 读到，另两个声明了却零消费，
      //   真正生效的是这行三元里的硬编码 0.90 / 0.25 —— 改设置对隔墙窃听毫无影响。默认值等同旧字面量。
      damping: barrier.damping != null ? barrier.damping : (function () {
        const ac = settings();
        return barrier.type === 'wall' ? ac.baseWallDamping
          : (barrier.type === 'screen' ? ac.baseScreenDamping : ac.baseDoorDamping);
      })(),
      occluded: barrier.occluded !== false,
      locked: !!barrier.locked
    });
    return { ok: true, partitionKey: key };
  }

  function getPartition(r1, r2) {
    const key = [r1, r2].sort().join('<->');
    if (_roomPartitions.has(key)) return _roomPartitions.get(key);
    // 默认门隔断
    return { type: 'door', damping: settings().baseDoorDamping, occluded: true, locked: false };
  }

  /**
   * 房间内发起密谈
   */
  function whisper(opts) {
    opts = opts || {};
    const roomId = opts.roomId || 'room_default';
    const speaker = opts.speaker || 'unknown';
    const content = opts.content || '';
    const volume = opts.volume || 'whisper'; // whisper (低语) | normal (常音) | shout (呼喊)
    const participants = Array.isArray(opts.participants) ? opts.participants.slice() : [speaker];

    const convId = 'conv_' + roomId + '_' + clockNow('whisper');
    const record = {
      convId: convId,
      roomId: roomId,
      speaker: speaker,
      participants: participants,
      content: content,
      volume: volume,
      status: 'active', // active | interrupted | completed
      interruptedBy: null,
      at: clockNow('whisper')
    };

    _activeConversations.set(roomId, record);

    return {
      ok: true,
      convId: convId,
      roomId: roomId,
      speaker: speaker,
      volume: volume,
      participants: participants,
      status: 'active',
      at: record.at
    };
  }

  /**
   * 邻室隔墙窃听
   */
  function eavesdrop(opts) {
    opts = opts || {};
    const listenerId = opts.listenerId || 'listener';
    const listenerRoomId = opts.listenerRoomId || 'hallway';
    const targetRoomId = opts.targetRoomId || opts.adjacentRoomId;

    if (!targetRoomId) return { ok: false, reason: 'missing-target-room' };

    const conv = _activeConversations.get(targetRoomId);
    if (!conv || conv.status !== 'active') {
      return {
        ok: false,
        reason: 'no-active-conversation',
        listenerId: listenerId,
        targetRoomId: targetRoomId
      };
    }

    const partition = getPartition(listenerRoomId, targetRoomId);
    // 根据音量与隔断衰减计算听力信噪比
    let baseVolumeLevel = conv.volume === 'whisper' ? 0.35 : (conv.volume === 'shout' ? 0.95 : 0.60);
    let effectiveSignal = baseVolumeLevel * (1.0 - partition.damping);

    // 窃听检定与文本畸变
    let interceptedText = '';
    let clarity = 'none';

    if (effectiveSignal >= 0.30) {
      clarity = 'clear';
      interceptedText = conv.content;
    } else if (effectiveSignal >= 0.08) {
      clarity = 'partial';
      // 提取局部关键词与断续拼音
      const words = conv.content.split(/([，。！？；\s]+)/).filter(Boolean);
      interceptedText = words.map((w, idx) => (idx % 2 === 0 ? w : '……[微弱气声]……')).join('');
    } else {
      clarity = 'inaudible';
      interceptedText = '……（隐约有细微动静，但无法听清字句）……';
    }

    return {
      ok: true,
      listenerId: listenerId,
      targetRoomId: targetRoomId,
      speaker: conv.speaker,
      clarity: clarity,
      signalLevel: Math.round(effectiveSignal * 100) / 100,
      interceptedContent: interceptedText,
      dampingUsed: partition.damping,
      barrierType: partition.type,
      at: clockNow('eavesdrop')
    };
  }

  /**
   * 推门突入：物理级打断当前密谈
   */
  function burstIn(opts) {
    opts = opts || {};
    const actorId = opts.actorId || opts.who || 'intruder';
    const roomId = opts.roomId || 'room_default';
    const forceEntry = !!opts.forceEntry;

    const conv = _activeConversations.get(roomId);
    if (!conv || conv.status !== 'active') {
      return {
        ok: true,
        burst: false,
        reason: 'room-empty-or-quiet',
        actorId: actorId,
        roomId: roomId
      };
    }

    // 打断密谈
    conv.status = 'interrupted';
    conv.interruptedBy = actorId;
    conv.interruptedAt = clockNow('burstIn');

    // 引发现场所有人的心理应激状态
    const stressEcho = {
      event: 'burst_in_interruption',
      intruder: actorId,
      roomId: roomId,
      confrontationState: 'tense_standoff', // 对峙状态
      at: conv.interruptedAt
    };

    return {
      ok: true,
      burst: true,
      roomId: roomId,
      intruder: actorId,
      previousSpeaker: conv.speaker,
      participants: conv.participants,
      interruptedContentSnippet: conv.content ? conv.content.slice(0, 30) + '...' : '',
      standoff: true,
      stressEcho: stressEcho,
      at: conv.interruptedAt
    };
  }

  /**
   * OPV19-3: 流体、暴雨与环境恶劣天候对声学与潜行的动态遮蔽
   */
  function calculateWeatherMasking(decibel, weatherType) {
    const rawDb = Number(decibel) || 0;
    const wType = String(weatherType || 'clear').toLowerCase();
    let ambientNoiseDb = 15; // 默认室内微弱底噪 15 dB
    let maskingEffect = 'none';

    if (wType.indexOf('storm') !== -1 || wType.indexOf('thunder') !== -1 || wType.indexOf('rain') !== -1) {
      ambientNoiseDb = 85; // 暴雨雷鸣狂风巨浪底噪 85 dB
      maskingEffect = 'heavy_storm_masking';
    } else if (wType.indexOf('wind') !== -1 || wType.indexOf('waterfall') !== -1) {
      ambientNoiseDb = 60; // 狂风或水流飞瀑底噪 60 dB
      maskingEffect = 'moderate_flow_masking';
    }

    // 当环境恶劣底噪远远压过自身动作噪音时，脚步声完全被环境掩盖
    const masked = rawDb <= ambientNoiseDb;
    return {
      ok: true,
      actionDb: rawDb,
      weatherType: wType,
      ambientNoiseDb: ambientNoiseDb,
      masked: masked,
      maskingEffect: maskingEffect,
      stealthBonusPct: masked ? 80 : 0
    };
  }

  function getConversation(roomId) {
    return _activeConversations.get(roomId) || null;
  }
  WA.spatialAcoustics = {
    whisper: whisper,
    eavesdrop: eavesdrop,
    burstIn: burstIn,
    calculateWeatherMasking: calculateWeatherMasking,
    registerPartition: registerPartition,
    getConversation: getConversation
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/spatial-acoustics 已加载（2.302.0）');
  }
})();