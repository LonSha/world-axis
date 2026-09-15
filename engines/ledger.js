/**
 * WorldAxis engines/ledger.js (v0.8)
 * 重大事件账本（本地差分记录 Lv3/4变化与终局）
 * 缝合来源：DlSNlGHT World —— world-engine-ledger.js
 *
 * 机制：
 *  - 对比推演前存档点与推演后状态，记录重大变化（事件Lv3+新增/推进/终局、风声Lv3+新增）
 *  - 所有变化合并为一条按轮次分组，同轮重roll覆盖旧记录
 *  - 保留最近 KEEP_ROUNDS 轮账本
 *  - 注入文本格式：第N轮（X条变化）+ 逐条变化行
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const KEEP_ROUNDS = 20;
  const EVENT_TYPE_NAMES = { conflict: '冲突型', progress: '推进型' };
  const TERMINAL_STAGES = new Set(['已完成', '已失败', '已消散', '已爆发']);

  // ── 存档点 ─────────────────────────────────────────────
  /**
   * 推演前调用：保存当前演化状态快照
   */
  function saveCheckpoint() {
    const st = WA.store.get();
    if (!st || !st.evolution) return;
    const cp = {
      events: JSON.parse(JSON.stringify(st.evolution.events || [])),
      winds:  JSON.parse(JSON.stringify((st.evolution.winds || []).map(w => ({ id: w.id, topic: w.topic }))))
    };
    WA.store.transact(d => { d.evolution._ledgerCheckpoint = cp; });
  }

  /**
   * 推演后调用：对比存档点与当前状态，记录Lv3/4变化。
   */
  function recordChanges() {
    const st = WA.store.get();
    const ev = st && st.evolution;
    if (!ev) return;
    const cp = ev._ledgerCheckpoint;
    if (!cp) { clearCheckpoint(); return; }

    const round = (st.meta && st.meta.round) || 0;
    const changes = [];

    // —— 事件链：Lv3+变化或任何终局都记录 ——
    const cpEventMap = new Map((cp.events || []).map(e => [e.id || `legacy:${e.title}`, e]));
    for (const cEv of (ev.events || [])) {
      const isTerminal = TERMINAL_STAGES.has(cEv.stage);
      if ((!cEv.level || cEv.level < 3) && !isTerminal) continue;
      const cpEv = cpEventMap.get(cEv.id || `legacy:${cEv.title}`);
      if (!cpEv) {
        changes.push({ type: isTerminal ? 'event_terminal' : 'event_new', name: cEv.title, eventType: cEv.type || 'conflict', level: cEv.level, stage: cEv.stage || '?', desc: cEv.desc || '' });
      } else if (cpEv.stage !== cEv.stage) {
        changes.push({
          type: isTerminal ? 'event_terminal' : 'event_advance',
          name: cEv.title, level: cEv.level,
          fromStage: cpEv.stage || '?', toStage: cEv.stage || '?',
          desc: cEv.desc || ''
        });
      }
    }

    // —— 风声：新增 Lv3+ ——
    const cpWindIds = new Set((cp.winds || []).map(w => w.id || `legacy:${w.topic}`));
    for (const wind of (ev.winds || [])) {
      if (!wind.level || wind.level < 3) continue;
      if (!cpWindIds.has(wind.id || `legacy:${wind.topic}`)) {
        changes.push({ type: 'wind_new', topic: wind.topic, level: wind.level, content: wind.content || '' });
      }
    }

    clearCheckpoint();
    if (!changes.length) return;

    // 同轮重roll覆盖：移除同round旧账本记录
    const ledger = (ev.ledger || []).filter(m => m.round !== round);
    ledger.unshift({ round, changes });
    if (ledger.length > KEEP_ROUNDS) ledger.length = KEEP_ROUNDS;

    WA.store.transact(d => { d.evolution.ledger = ledger; });
    WA.log('info', `账本: 第${round}轮记录${changes.length}条变化`);
  }

  function clearCheckpoint() {
    WA.store.transact(d => { if (d.evolution) delete d.evolution._ledgerCheckpoint; });
  }

  // ── 注入文本 ───────────────────────────────────────────
  function buildLedgerText() {
    const st = WA.store.get();
    const entries = ((st && st.evolution && st.evolution.ledger) || []).slice().reverse();
    if (!entries.length) return '';

    return entries.map(entry => {
      const lines = [`第${entry.round}轮（${entry.changes.length}条变化）：`];
      for (const c of entry.changes) {
        if (c.type === 'event_new') {
          const tn = EVENT_TYPE_NAMES[c.eventType] || c.eventType;
          lines.push(`  [新增Lv${c.level}${tn}事件链] ${c.name} - ${c.stage} - ${c.desc}`);
        } else if (c.type === 'event_advance') {
          lines.push(`  [事件链推进] ${c.name}(Lv${c.level}) ${c.fromStage}->${c.toStage} - ${c.desc}`);
        } else if (c.type === 'event_terminal') {
          lines.push(`  [事件链终局] ${c.name}(Lv${c.level}) ${c.fromStage ? c.fromStage + '->' : ''}${c.toStage} - ${c.desc}`);
        } else if (c.type === 'wind_new') {
          lines.push(`  [新增Lv${c.level}风声] ${c.topic} - ${c.content}`);
        }
      }
      return lines.join('\n');
    }).join('\n');
  }

  WA.ledger = { saveCheckpoint, recordChanges, buildLedgerText, KEEP_ROUNDS, TERMINAL_STAGES };
})();