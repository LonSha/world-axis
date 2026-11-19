/**
 * WorldAxis engines/save-migrate.js (v2.529.0) — 存档结构变更的迁移与回滚
 *
 * 病：本仓改过两次存档形状（楼层加 `extra` 挂载位、`worlds` 从数组改对象），
 *   两次都是「读的时候顺手兼容一下」—— 于是兼容代码散在读取点里，写回仍旧写新形状。
 *   结果是：老档被读成新档、写回后**回不去了**；而且没人能回答三个问题 ——
 *   这次打开到底会改动哪几处？改完之后还能不能逐字还原？哪一步缺了？
 *
 * 判据（三条，缺一不可）：
 *   ① 老档能读：detect 认版本；没有 schemaVer 的老档按**形状**判（不是默认当最新）；
 *   ② 每一步都要能倒着走：up 之外必须有 down，rollback 用**备份**逐字还原，
 *      不用「反向推理」—— 反向推理在数据被删过之后就不可靠了；
 *   ③ 缺一步就明说：迁移链断在 v→v+1 时返回 unsupported 且**原档不动**，
 *      不许「尽力而为地升一半」（升一半的存档比老档更难救）。
 *   另：migrate 幂等 —— 已经是目标版本的档，steps 为空、内容不变。
 * 边界：纯计算。写盘、备份落盘由调用方做（本仓 store 是唯一写口）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const CURRENT = 3;
  const SCHEMA_KEY = 'schemaVer';

  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function clone(v) { try { return JSON.parse(JSON.stringify(v)); } catch (e) { return null; } }

  /**
   * 迁移表：键是「源版本」，一个条 = 一步。
   * up/down 都必须纯净（不改入参、只用返回值），否则回滚拿不到原样。
   */
  const STEPS = {
    1: {
      name: '楼层补 extra 挂载位（v1 的楼层只有 mes/is_user）',
      up: function (s) {
        const o = clone(s) || {};
        const chat = isObj(o.chat) ? o.chat : {};
        const msgs = Array.isArray(chat.messages) ? chat.messages : [];
        chat.messages = msgs.map(function (m) {
          const r = isObj(m) ? m : { mes: String(m == null ? '' : m) };
          if (!isObj(r.extra)) r.extra = {};
          return r;
        });
        o.chat = chat;
        return o;
      },
      down: function (s) {
        const o = clone(s) || {};
        const chat = isObj(o.chat) ? o.chat : {};
        const msgs = Array.isArray(chat.messages) ? chat.messages : [];
        chat.messages = msgs.map(function (m) {
          const r = clone(m) || {};
          // 只摘掉「空壳」extra：真写过东西的 extra 不许在这一步丢
          if (isObj(r.extra) && Object.keys(r.extra).length === 0) delete r.extra;
          return r;
        });
        o.chat = chat;
        return o;
      }
    },
    2: {
      name: 'worlds 从数组改对象（进卡设置按书开关，v2 起只有与默认不同的才记）',
      up: function (s) {
        const o = clone(s) || {};
        if (Array.isArray(o.worlds)) {
          const obj = {};
          o.worlds.forEach(function (w) { if (w != null) obj[String(w)] = true; });
          o.worlds = obj;
        } else if (!isObj(o.worlds)) o.worlds = {};
        return o;
      },
      down: function (s) {
        const o = clone(s) || {};
        if (isObj(o.worlds)) {
          o.worlds = Object.keys(o.worlds).filter(function (k) { return o.worlds[k] === true; });
        } else if (!Array.isArray(o.worlds)) o.worlds = [];
        return o;
      }
    }
  };

  /** 认版本：有 schemaVer 就信它；没有就按形状判 —— 绝不默认当最新。 */
  function detect(save) {
    const o = isObj(save) ? save : {};
    const v = Number(o[SCHEMA_KEY]);
    if (isFinite(v) && v >= 1) return Math.floor(v);
    if (Array.isArray(o.worlds)) return 1;
    const chat = isObj(o.chat) ? o.chat : {};
    const first = Array.isArray(chat.messages) ? chat.messages[0] : null;
    if (isObj(first) && isObj(first.extra)) return 3;
    return 2;
  }

  /** 只看计划、不动数据：这次打开会跑哪几步（界面提示「会改动 N 处」用）。 */
  function plan(save, to) {
    const target = isFinite(to) && to >= 1 ? Math.floor(to) : CURRENT;
    const from = detect(save);
    const steps = [];
    let broken = '';
    if (from < target) {
      for (let v = from; v < target; v++) {
        if (!STEPS[v]) { broken = '缺少 v' + v + ' → v' + (v + 1) + ' 的步骤'; break; }
        steps.push({ from: v, to: v + 1, name: STEPS[v].name });
      }
    } else if (from > target) {
      broken = '不支持降级（回旧版请走 rollback）';
    }
    return { from: from, to: target, steps: steps, unsupported: !!broken, reason: broken, count: steps.length };
  }

  /**
   * 执行迁移。返回 {save, from, to, steps, backup, unsupported, reason}。
   * 不支持时 **原档原样返回**（不升一半），backup 仍给出（调用方可以据此判断「没动」）。
   */
  function migrate(save, to) {
    const target = isFinite(to) && to >= 1 ? Math.floor(to) : CURRENT;
    const from = detect(save);
    const src = clone(save);
    const backup = clone(save);
    const p = plan(save, target);
    if (p.unsupported) {
      return { save: src, from: from, to: target, steps: [], backup: backup, unsupported: true, reason: p.reason };
    }
    let cur = src;
    const done = [];
    for (let v = from; v < target; v++) {
      cur = STEPS[v].up(cur);
      cur[SCHEMA_KEY] = v + 1;
      done.push(v + '→' + (v + 1) + '：' + STEPS[v].name);
    }
    return { save: cur, from: from, to: target, steps: done, backup: backup, unsupported: false, reason: '' };
  }

  /** 回滚：用备份逐字还原。没有备份就明说不能回 —— 不拿逆向推理硬凑。 */
  function rollback(result) {
    const r = isObj(result) ? result : {};
    if (!isObj(r.backup)) return { ok: false, save: null, reason: '这次迁移没有留备份，回滚不了' };
    return { ok: true, save: clone(r.backup), reason: '' };
  }

  /** 逐字比较（回滚是否真的回到了原样，靠这条自证）。 */
  function same(a, b) {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
  }

  WA.saveMigrate = {
    CURRENT: CURRENT,
    SCHEMA_KEY: SCHEMA_KEY,
    STEPS: STEPS,
    detect: detect,
    plan: plan,
    migrate: migrate,
    rollback: rollback,
    same: same
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/save-migrate.js', { kind: 'engine', ver: '2.529.0' });
})();