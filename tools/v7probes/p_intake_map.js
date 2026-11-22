'use strict';
/**
 * tools/v7probes/p_intake_map.js — OPV7-1 立据探针：推演契约 26 节 ↔ 结构化引擎写口 的**输入对账**。
 *
 * 【回答的问题】不是「能不能调通」，而是「必填位有没有取值来源」。
 *   backstage.applyResult 每轮把 26 节事实写进叙事存储，结构化引擎零消费（p_intake_gap 已实测）。
 *   但把 A 喂给 B 不能凭感觉：硬接的结局只有两种，都更坏 ——
 *     ① 大量拒收（白调一次，读数噪声）；
 *     ② 把编造的值填进必填位（**假数据入库**，比不喂严重得多）。
 *
 * 【判据】必填位 ∈ {有来源} 且 枚举位不在缺口上。
 *   来源三类，**逐条声明在候选表里**（探针只核「声明的来源是否落在契约里」）：
 *     field    同名字段：写口要 location，契约 people 就有 location。
 *     rename   声明改名：写口要 text，契约给的是 intent —— 语义同一，名字不同。
 *              **改名是人的判断，不假装是机器出的。**
 *     derived  派生：写口要 id，契约给不出；标识符可由分发器自造（intake_<floor>_<i>）。
 *              派生只许标识符 / 时间戳 / 常量标记，绝不许事实值（人名、地名、情节）。
 *
 * 【两侧都不手抄】
 *   契约侧：从 buildPrompt 的【输出契约】串按文本解析（与 tests/rel-contract-v2600.js 同源）。
 *   写口侧：输入面 = 参数名 ∪ **纯**参数派生的局部别名上的字段读取。
 *
 * 【本探针自己踩过的六处假判（留档，防重犯）】
 *   ① 契约行正则照抄 rel-contract 的「行首 + 一个空格 + 引号」，实际是 8 空格缩进 ⇒ **0 节**，
 *      13 组全判 NO-INTERSECTION —— 探针坏了，长得却像结论。
 *   ② 只认 clean/str/finite/num，漏 Number(item.start) ⇒ addSchedule 的 start/end 漏读 ⇒ 假 OK。
 *   ③ 用「第一个右括号」截条件串，遇 if (!personId(name) || !activity) 提前截断 ⇒ 必填位 activity 漏读 ⇒ 假 OK。
 *   ④ 别名把 const pl = plan(item) 当成 item 的别名 ⇒ plan 的产物 id/title/kind 全被读成入参。
 *   ⑤ 输入面把 settings().enabled / row.status 算进来（根是调用结果或局部产物）。
 *   ⑥ 拒因不分型 ⇒ missing-holder 被读成「kind 没给」、bad-priority 被读成「priority 必填」（其实有默认值）。
 *   共同点：**探针失效的样子是「全绿」**。故本版不用正则做括取（全字符扫描 + 括号配平），
 *   每条判定都印出来源与源码偏移，判错能一眼指回去。
 *
 * 用法：node tools/v7probes/p_intake_map.js [--json]
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', '..');
function read(rel) { try { return fs.readFileSync(path.join(BASE, rel), 'utf8'); } catch (e) { return ''; } }

const NL = String.fromCharCode(10);
const QT = String.fromCharCode(34);
const SQ = String.fromCharCode(39);

// ── ① 契约节与节内字段（按契约文本解析，不手抄字段名单） ───────────────────
function contractSections() {
  const bs = read('engines/backstage.js');
  const at = bs.indexOf('【输出契约】');
  if (at < 0) throw new Error('engines/backstage.js 里找不到【输出契约】段');
  const seg = bs.slice(at, at + 20000);
  const starts = [];
  let off = 0;
  seg.split(NL).forEach(function (ln) {
    const t = ln.trim();
    if (t.charAt(0) === SQ) {
      const body = t.slice(1);
      const q1 = body.indexOf(QT);
      if (q1 >= 0) {
        const q2 = body.indexOf(QT, q1 + 1);
        if (q2 > q1) {
          const rest = body.slice(q2 + 1).replace(/^ +/, '');
          if (rest.charAt(0) === ':') starts.push({ name: body.slice(q1 + 1, q2), at: off });
        }
      }
    }
    off += ln.length + 1;
  });
  const sections = {}, order = [];
  starts.forEach(function (s, k) {
    const end = (k + 1 < starts.length) ? starts[k + 1].at : seg.length;
    const body = seg.slice(s.at, end);
    const fields = [];
    let p = 0;
    while (true) {
      const a = body.indexOf(QT, p);
      if (a < 0) break;
      const b = body.indexOf(QT, a + 1);
      if (b < 0) break;
      const nm = body.slice(a + 1, b);
      p = b + 1;
      let q = p; while (q < body.length && body.charAt(q) === ' ') q++;
      if (body.charAt(q) !== ':') continue;
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nm)) continue;
      if (fields.indexOf(nm) < 0) fields.push(nm);
    }
    sections[s.name] = fields;
    order.push(s.name);
  });
  return { sections: sections, order: order };
}

// ── ② 源码扫描小工具 ──────────────────────────────────────────────────────
function isIdentChar(c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '$';
}
function identEnd(s, i) { let k = i; while (k < s.length && isIdentChar(s.charAt(k))) k++; return k; }
function matchParen(src, open) {
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    const c = src.charAt(k);
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return k; }
  }
  return -1;
}
function matchBrace(src, open) {
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    const c = src.charAt(k);
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return k; }
  }
  return -1;
}

/** 函数体：两空格缩进的 } 就是边界（引擎一律 (function () { … })() 外壳）。 */
function fnUnitInSrc(src, fn) {
  const at = src.indexOf('function ' + fn + '(');
  if (at < 0) return null;
  const open = src.indexOf('(', at);
  const close = matchParen(src, open);
  if (close < 0) return null;
  const params = src.slice(open + 1, close).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  const head = src.slice(close);
  const cut = head.indexOf(NL + '  }');
  return { fn: fn, params: params, at: at, src: src,
    body: (cut > 0) ? head.slice(0, cut) : head.slice(0, 12000) };
}
function fnUnit(file, fn) { return fnUnitInSrc(read(file), fn); }

/** 多变量同一声明必须拆：const who = …, claim = …, source = … 是引擎主流写法。 */
function splitDecls(t) {
  const out = [];
  let depth = 0, cur = '';
  for (let i = 0; i < t.length; i++) {
    const c = t.charAt(i);
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}
function assignMap(body) {
  const map = {};
  body.split(NL).forEach(function (raw) {
    const t = raw.trim();
    const p3 = ['const ', 'let ', 'var '].find(function (h) { return t.indexOf(h) === 0; });
    if (!p3) return;
    let rest = t.slice(p3.length);
    if (rest.charAt(rest.length - 1) === ';') rest = rest.slice(0, -1);
    splitDecls(rest).forEach(function (seg) {
      const eq = seg.indexOf('=');
      if (eq < 0) return;
      const lhs = seg.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(lhs)) return;
      map[lhs] = seg.slice(eq + 1).trim();
    });
  });
  return map;
}

/** 表达式里是否出现这些标识符（按词边界）。 */
function exprRefs(rhs, names) {
  for (let i = 0; i < names.length; i++) {
    const nm = names[i];
    let k = rhs.indexOf(nm);
    while (k >= 0) {
      const before = k === 0 ? ' ' : rhs.charAt(k - 1);
      const after = rhs.charAt(k + nm.length);
      if (before !== '.' && !isIdentChar(before) && after !== '.' && !isIdentChar(after)) return true;
      k = rhs.indexOf(nm, k + 1);
    }
  }
  return false;
}

const GLOBAL_FN = { isFinite: 1, isNaN: 1, Number: 1, String: 1, Boolean: 1, parseInt: 1, parseFloat: 1,
  Array: 1, Object: 1, JSON: 1, Math: 1, Date: 1, RegExp: 1 };
const GLOBAL_NS = { WA: 1, window: 1, global: 1, module: 1, exports: 1, require: 1, console: 1 };
const META = ['length', 'indexOf', 'slice', 'map', 'filter', 'forEach', 'join', 'split', 'trim',
  'replace', 'concat', 'push', 'pop', 'some', 'every', 'find', 'toLowerCase', 'toUpperCase',
  'toString', 'valueOf', 'hasOwnProperty', 'charAt', 'substring', 'test', 'match', 'toFixed'];

/** 别名：const o = item || {} —— 右侧**不得含函数调用**（修 ④）。 */
function aliasesOf(body, params) {
  const map = assignMap(body);
  return Object.keys(map).filter(function (lhs) {
    if (params.indexOf(lhs) >= 0) return false;
    const rhs = map[lhs];
    if (rhs.indexOf('(') >= 0) return false;
    return exprRefs(rhs, params);
  });
}

/** 所有 `.字段` 读取（记下根标识符；根不是标识符的另记）。 */
function dotReads(body) {
  const out = [];
  let i = 0;
  while (i < body.length) {
    if (body.charAt(i) !== '.') { i++; continue; }
    const st = i + 1;
    const en = identEnd(body, st);
    if (en === st) { i++; continue; }
    const field = body.slice(st, en);
    let k = i - 1;
    while (k >= 0 && body.charAt(k) === ' ') k--;
    let root = '';
    if (k >= 0 && isIdentChar(body.charAt(k))) {
      let s2 = k;
      while (s2 >= 0 && isIdentChar(body.charAt(s2))) s2--;
      root = body.slice(s2 + 1, k + 1);
    }
    out.push({ field: field, root: root, at: i });
    i = en;
  }
  return out;
}

function inputFace(unit) {
  const roots = unit.params.concat(aliasesOf(unit.body, unit.params));
  const fields = [];
  dotReads(unit.body).forEach(function (d) {
    if (META.indexOf(d.field) >= 0) return;
    if (!d.root || roots.indexOf(d.root) < 0) return;
    if (fields.indexOf(d.field) < 0) fields.push(d.field);
  });
  return { roots: roots, fields: fields };
}

// ── ③ 拒因分型（这一步定错，整张表就是假的） ───────────────────────────────
/**
 *   REQUIRED  missing-fields / no-* / unknown-*  → 「你没给我」，**唯一必填位来源**。
 *   ENUM      bad-kind/bad-level/bad-type/bad-resource/bad-lens/bad-name/bad-needs
 *             → 给了值但不在引擎词表里 ⇒ 枚举位。
 *   BRANCH    bad-trigger → kind 分支的条件必填（delayed 要 at、repeat 要 intervalMs、
 *             conditional 要 condition），选定分支前不算缺。
 *   IGNORE    bad-priority（有 DEF_PRIORITY 默认值）/ bad-time / bad-value /
 *             missing-holder / missing-person / duplicate / capacity / disabled /
 *             store-unavailable / not-active → 默认值或世界状态前置，与「字段给没给」无关。
 */
const STATE_MISSING = { 'missing-holder': 1, 'missing-person': 1, missing: 1 };
function reasonClass(reason) {
  if (reason === 'missing-fields') return 'REQUIRED';
  // 实测踩到：addGoal 的拒因是 missing-text 而不是 missing-fields —— 只认后者会让
  //   它的必填位整条消失（表里看着 OK，分发器实际次次拒收）。故 missing-* 除
  //   状态类（缺世界对象、缺行）外一律计入必填位。
  if (reason.indexOf('missing-') === 0) return STATE_MISSING[reason] ? 'IGNORE' : 'REQUIRED';
  if (reason.indexOf('no-') === 0) return 'REQUIRED';
  if (reason.indexOf('unknown-') === 0) return 'REQUIRED';
  if (['bad-kind', 'bad-level', 'bad-type', 'bad-resource', 'bad-lens', 'bad-name', 'bad-needs'].indexOf(reason) >= 0) return 'ENUM';
  if (reason === 'bad-trigger') return 'BRANCH';
  return 'IGNORE';
}

/** 枚举表：const LEVELS = ['a','b'] → {LEVELS:['a','b']}。 */
function enumTables(src) {
  const out = {};
  let i = 0;
  while (true) {
    const j = src.indexOf('const ', i);
    if (j < 0) break;
    i = j + 6;
    const st = i, en = identEnd(src, st);
    if (en === st) continue;
    const nm = src.slice(st, en);
    let k = en;
    while (k < src.length && src.charAt(k) === ' ') k++;
    if (src.charAt(k) !== '=') continue;
    let q = k + 1;
    while (q < src.length && src.charAt(q) === ' ') q++;
    if (src.charAt(q) !== '[') continue;
    const close = src.indexOf(']', q);
    if (close < 0) continue;
    const vals = [];
    let p = q + 1;
    while (p < close) {
      const a = src.indexOf(SQ, p);
      if (a < 0 || a > close) break;
      const b = src.indexOf(SQ, a + 1);
      if (b < 0 || b > close) break;
      vals.push(src.slice(a + 1, b));
      p = b + 1;
    }
    if (vals.length) out[nm] = vals;
  }
  return out;
}

/** 枚举校验：<TABLE>.indexOf(…) 里是否提到该名字（局部名或字段名）。 */
function enumOfName(body, enums, names) {
  const tables = Object.keys(enums);
  for (let t = 0; t < tables.length; t++) {
    const tn = tables[t];
    let i = body.indexOf(tn + '.indexOf(');
    while (i >= 0) {
      const open = body.indexOf('(', i);
      const close = matchParen(body, open);
      const seg = (close > open) ? body.slice(open + 1, close) : body.slice(open + 1, open + 160);
      for (let n = 0; n < names.length; n++) {
        if (names[n] && exprRefs(seg, [names[n]])) return { table: tn, allowed: enums[tn] };
      }
      i = body.indexOf(tn + '.indexOf(', i + 1);
    }
  }
  return null;
}

/** BRANCH 归因：nearest 之前的 `kind === 'X'` / `kind==='X'`。 */
function branchLabel(body, at) {
  const back = body.slice(Math.max(0, at - 800), at);
  let hit = null;
  let i = back.indexOf('kind');
  while (i >= 0) {
    const seg = back.slice(i, i + 40);
    const m = /kind\s*===?\s*'([a-z]+)'/.exec(seg);
    if (m) hit = m[1];
    i = back.indexOf('kind', i + 4);
  }
  return hit;
}

/**
 * 必填/枚举/分支位。三种判定点都算：
 *   if (…) return { ok:false, reason:'…' }
 *   if (…) { noteFault(…); return { ok:false, reason:'…' } }
 *   if (…) { out = { ok:false, reason:'…' }; return false; }   ← 事务回调里的主流写法
 * 条件串走括号配平（修 ③）。
 */
function gates(unit, face) {
  const body = unit.body;
  const map = assignMap(body);
  const fns = {};
  let fi = 0;
  while (true) {
    const j = unit.src.indexOf('function ', fi);
    if (j < 0) break;
    const st = j + 9, en = identEnd(unit.src, st);
    if (en > st) { fns[unit.src.slice(st, en)] = 1; fi = en; } else fi = st;
  }
  const enums = enumTables(unit.src);
  const TAIL = /^(?:\s*\{)?\s*(?:noteFault\([^;]*;\s*)?(?:return\s+|out\s*=\s*)\{\s*ok:\s*false,\s*reason:\s*'([a-z-]+)'/;
  const raw = [];
  let i = 0;
  while (i < body.length) {
    const j = body.indexOf('if', i);
    if (j < 0) break;
    i = j + 2;
    let k = j + 2;
    while (k < body.length && (body.charAt(k) === ' ' || body.charAt(k) === NL)) k++;
    if (body.charAt(k) !== '(') continue;
    const close = matchParen(body, k);
    if (close < 0) continue;
    const mt = TAIL.exec(body.slice(close + 1, close + 400));
    if (!mt) continue;
    const reason = mt[1], cls = reasonClass(reason);
    if (cls === 'IGNORE') continue;
    const cond = body.slice(k + 1, close);
    const names = [];
    let p = 0;
    while (p < cond.length) {
      if (cond.charAt(p) !== '!') { p++; continue; }
      let q = p + 1;
      while (q < cond.length && cond.charAt(q) === ' ') q++;
      const en = identEnd(cond, q);
      if (en > q) { names.push(cond.slice(q, en)); p = en; } else p++;
    }
    ['isFinite(', 'Number('].forEach(function (h) {
      let s2 = cond.indexOf(h);
      while (s2 >= 0) {
        const q = s2 + h.length, en = identEnd(cond, q);
        if (en > q) names.push(cond.slice(q, en));
        s2 = cond.indexOf(h, q);
      }
    });
    names.forEach(function (nm) {
      if (fns[nm] || GLOBAL_FN[nm]) return;
      if (raw.some(function (r) { return r.local === nm; })) return;
      raw.push({ local: nm, reason: reason, cls: cls, at: j,
        branch: cls === 'BRANCH' ? branchLabel(body, j) : null });
    });
  }
  const out = [];
  raw.forEach(function (r) {
    const rhs = map[r.local];
    let src = null, how = null;
    if (rhs) {
      const ok = dotReads(rhs).filter(function (d) { return d.root && face.roots.indexOf(d.root) >= 0; })[0];
      if (ok) { src = ok.field; how = 'field'; }
      else {
        const pr = face.roots.filter(function (p) { return !GLOBAL_NS[p] && exprRefs(rhs, [p]); })[0];
        if (pr) { src = pr; how = 'param'; }
      }
    } else if (face.roots.indexOf(r.local) >= 0) { src = r.local; how = 'param'; }
    const eo = enumOfName(body, enums, [r.local, src]);
    out.push({ local: r.local, src: src, paramName: (how === 'param' ? src : null), how: how, reason: r.reason, cls: r.cls,
      branch: r.branch, enumOf: eo, at: r.at });
  });
  return out;
}

/** 委托校验：写口把判据交给本地纯函数（events→plan、org→parseNeeds）。 */
function delegations(unit) {
  const body = unit.body;
  const map = assignMap(body);
  const out = [];
  Object.keys(map).forEach(function (k) {
    const rhs = map[k];
    const p = rhs.indexOf('(');
    if (p <= 0) return;
    const nm = rhs.slice(0, p).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nm)) return;
    if (GLOBAL_FN[nm] || GLOBAL_NS[nm]) return;
    // 委托的三种追踪形态（缺一就会漏 → 必填位判成无来源）：
    //   ① const pl = plan(item);  if (!pl.ok) return pl;
    //   ② const tv = travelOf(a, b);  if (!tv.ok) return {…}
    //   ③ const pr = qty(amount);    if (!pr) return {…}      ← 没有 .ok，靠局部名本身被否定
    const usesOk = body.indexOf('!' + k + '.ok') >= 0;
    const usesBare = new RegExp('!\\s*' + k + '\\b').test(body);
    if (!usesOk && !usesBare) return;
    const close = matchParen(rhs, p);
    out.push({ fn: nm, args: (close > p) ? rhs.slice(p + 1, close) : '' });
  });
  return out;
}

// ── ④ 候选组合（人的判断，逐条声明来源） ─────────────────────────────────
const CANDIDATES = [
  { sec: 'people', to: ['engines/life.js', 'addGoal'], note: '人物意图 → 生活目标',
    rename: { text: 'intent' }, skip: { name: '人物载体' } },
  { sec: 'people', to: ['engines/life.js', 'addSchedule'], note: '人物动作 → 日程',
    rename: { activity: 'action' }, skip: { name: '人物载体' },
    blocked: { start: '契约无起止时刻（时刻不是标识符，不许派生）', end: '同上' } },
  { sec: 'people', to: ['engines/temperament.js', 'setTemperament'], note: '性格锚 → 气质三件套',
    rename: { base: 'personalityAnchor', habit: 'speakingStyle' }, skip: { person: '人物载体' } },
  { sec: 'people', to: ['engines/masks.js', 'setMask'], note: '人格骰面 → 面具',
    skip: { who: '人物载体' },
    blocked: { face: '契约无「对外脸面」文本', tell: '契约无「破功破绽」文本' } },
  { sec: 'blackbox', to: ['engines/enigma.js', 'mark'], note: '秘密行动 → 知情者谜题',
    rename: { secret: 'action', knower: 'witnesses' } },
  { sec: 'knowledge_updates', to: ['engines/intel.js', 'addIntel'], note: '知识边界 → 情报网',
    skip: { person: '人物载体' },
    blocked: { claim: '契约无情报正文（about 是对象名不是内容）', source: '契约无来源方',
      level: 'LEVELS(rumor|report|witness|record) 与 status(fact|suspected)/route 无枚举交集' } },
  { sec: 'relation_update', to: ['engines/bonds.js', 'setBond'], note: '关系六轴 → 纽带六型',
    rename: { a: 'name', b: 'target' },
    blocked: { types: '六型是类别、契约六轴是数值；数值→类别需新判定规则 = 新事实真源（计划明禁）' } },
  { sec: 'events_create', to: ['engines/events.js', 'schedule'], note: '将要发生的事件 → 调度队列', kind: 'once',
    derived: { id: '标识符 intake_<floor>_<i>（非事实值）', kind: '常量标记 once（契约无排期语义）' } },
  { sec: 'currents', to: ['engines/events.js', 'schedule'], note: '暗流 → 调度队列', kind: 'once',
    derived: { id: '标识符', kind: '常量标记 once' } },
  { sec: 'foreshadows', to: ['engines/events.js', 'schedule'], note: '伏笔 → 调度队列', kind: 'once',
    derived: { id: '契约有 id', kind: '常量标记 conditional（伏笔 = 条件触发）' },
    blocked: { title: '契约只有 id/content，无 title（引擎侧 title 必填）' } },
  { sec: 'chronicle', to: ['engines/sediment.js', 'settle'], note: '纪事 → 地点沉积',
    rename: { key: 'title' },
    blocked: { place: '契约 chronicle 无地点字段（currentPlace() 是世界当前地，不是本条的）' } },
  { sec: 'enemies', to: ['engines/warrant.js', 'report'], note: '仇敌 → 通缉在案',
    rename: { who: 'name', charge: 'reason' },
    blocked: { place: '契约无地点', level: 'LEVELS(minor|moderate|major) 与 type(blood|grudge)/status 无枚举交集' } },
  { sec: 'factions', to: ['engines/org.js', 'grant'], note: '势力 → 组织资源',
    rename: { name: 'name' }, skip: { kind: '组织类别（固定 faction）' },
    blocked: { item: '契约 factions 无资源名', amount: '契约无数量（powerPillars 是支柱不是库存）' } }
];

// ── ⑤ 对账 ────────────────────────────────────────────────────────────────
const CS = contractSections();

function resolveRow(c) {
  const cf = CS.sections[c.sec] || [];
  const unit = fnUnit(c.to[0], c.to[1]);
  if (!unit) return { sec: c.sec, note: c.note, to: c.to.join('.'), err: '写口未找到' };
  const face = inputFace(unit);
  let gs = gates(unit, face);
  const dele = delegations(unit);
  // 委托：把内层形参名映射回调用方实参，再把内层判定并进来
  dele.forEach(function (d) {
    const u2 = fnUnitInSrc(unit.src, d.fn);
    if (!u2) return;
    // 只有自己也吐 {ok:false} 的辅助函数才是「委托校验」；clean/qty/str 这类是纯转换，
    //   把它们当委托会把 `if (!text)` 误读成「text 的必填位由 clean 守」（实测踩到）。
    if (u2.body.indexOf('ok: false') < 0 && u2.body.indexOf('ok:false') < 0) return;
    const f2 = inputFace(u2);
    gates(u2, f2).forEach(function (g) {
      let src = g.src, how = g.how;
      if (how === 'param') {
        const idx = f2.roots.indexOf(g.src);
        const arg = String(d.args).split(',')[idx];
        if (arg) {
          const a = arg.trim();
          const ok = dotReads(a).filter(function (x) { return face.roots.indexOf(x.root) >= 0; })[0];
          if (ok) { src = ok.field; how = 'field'; }
          else if (face.roots.indexOf(a) >= 0) { src = a; how = 'param'; }
          else { src = null; how = null; }
        }
      }
      const local = g.local + '@' + d.fn;
      if (!gs.some(function (x) { return x.local === local; })) {
        gs.push({ local: local, src: src, paramName: (how === 'param' ? src : null), how: how, reason: g.reason, cls: g.cls,
          branch: g.branch, enumOf: g.enumOf, at: g.at });
      }
    });
  });
  const rename = c.rename || {}, derived = c.derived || {}, skip = c.skip || {}, blocked = c.blocked || {};
  const branchSel = c.kind || null;       // 本组要走的调度分支（events 的四型只走一种）
  const resolved = [];
  gs.forEach(function (g) {
    const need = String(g.local).split('@')[0];
    // ① 不涉及（人物载体 / 归约键）：记录但不参与判定
    if (skip[need] || (g.paramName && skip[g.paramName])) {
      resolved.push({ need: need, how: 'SKIP', why: skip[need] || skip[g.paramName], cls: g.cls });
      return;
    }
    // ② 分支必填：只在本组选定的 kind 下成立
    if (g.cls === 'BRANCH' && g.branch && branchSel && g.branch !== branchSel) {
      resolved.push({ need: need, how: 'SKIP', why: '仅 kind=' + g.branch + ' 时需要（本组走 ' + branchSel + '）', cls: g.cls });
      return;
    }
    // ③ 来源定序：同名字段 → 改名表（字段名或形参名都查） → 派生 → 无
    const rn = rename[need] || (g.paramName ? rename[g.paramName] : null);
    if (g.src && cf.indexOf(g.src) >= 0) {
      resolved.push({ need: need, src: g.src, how: 'field', cls: g.cls, enumOf: g.enumOf }); return;
    }
    if (rn && cf.indexOf(rn) >= 0) {
      resolved.push({ need: need, src: rn, how: 'rename', cls: g.cls, enumOf: g.enumOf }); return;
    }
    const dv = derived[need] || (g.paramName ? derived[g.paramName] : null);
    if (dv) { resolved.push({ need: need, src: dv, how: 'derived', cls: g.cls, enumOf: g.enumOf }); return; }
    resolved.push({ need: need, how: 'MISSING', cls: g.cls, enumOf: g.enumOf, reason: g.reason });
  });
  Object.keys(blocked).forEach(function (k) {
    if (!resolved.some(function (r) { return r.need === k; })) {
      resolved.push({ need: k, how: 'MISSING', blockedWhy: blocked[k] });
    }
  });
  // 枚举缺口：必填位带枚举校验、来源不是同名字段也不在 skip 上
  const enumGaps = [];
  resolved.forEach(function (r) {
    if (!r.enumOf || r.how === 'field' || r.how === 'SKIP') return;
    enumGaps.push({ need: r.need, table: r.enumOf.table, allowed: r.enumOf.allowed, how: r.how });
  });
  // 按 need 去重：委托跟进与本体判定会命中同一个必填位，重复会把缺口名单印两遗。
  const seenNeed = {};
  const dedup = [];
  resolved.forEach(function (r) {
    if (seenNeed[r.need]) return;
    seenNeed[r.need] = 1;
    dedup.push(r);
  });
  resolved.length = 0;
  dedup.forEach(function (r) { resolved.push(r); });
  const missing = resolved.filter(function (r) { return r.how === 'MISSING'; }).map(function (r) { return r.need; });
  const branchOnly = resolved.filter(function (r) { return r.cls === 'BRANCH'; });
  let verdict;
  if (missing.length) verdict = 'BLOCKED';
  else if (enumGaps.length) verdict = 'ENUM-GAP';
  else verdict = 'OK';
  return {
    sec: c.sec, note: c.note, to: c.to.join('.'),
    params: unit.params, writerIn: face.fields,
    inter: cf.filter(function (f) { return face.fields.indexOf(f) >= 0; }),
    delegate: dele.map(function (d) { return d.fn; }),
    resolved: resolved, missing: missing, enumGaps: enumGaps,
    branch: branchOnly.map(function (r) { return r.need; }),
    blocked: blocked, verdict: verdict
  };
}

// ── ⑥ 输出 ────────────────────────────────────────────────────────────────
const rows = CANDIDATES.map(resolveRow);
const asJson = process.argv.slice(2).indexOf('--json') >= 0;

if (asJson) {
  console.log(JSON.stringify({ rows: rows }, null, 2));
} else {
  console.log('=== 契约节（按契约文本解析，不手抄） ===');
  CS.order.forEach(function (k) { console.log('  ' + k + ' :: ' + CS.sections[k].join(',')); });
  console.log('\n=== 候选组合对账（' + rows.length + ' 组） ===');
  rows.forEach(function (r) {
    console.log('\n[' + (r.verdict || 'ERR') + '] ' + r.sec + ' → ' + r.to + '   （' + r.note + '）');
    if (r.err) { console.log('    ' + r.err); return; }
    console.log('    写口参数 : ' + r.params.join(',') + (r.delegate.length ? '   委托校验 : ' + r.delegate.join(',') : ''));
    console.log('    输入面   : ' + (r.writerIn.join(',') || '(空)'));
    r.resolved.forEach(function (x) {
      const tag = x.how === 'field' ? '同名字段' : x.how === 'rename' ? '改名 ← ' + x.src
        : x.how === 'derived' ? '派生（' + x.src + '）'
          : x.how === 'SKIP' ? '不涉及（' + x.why + '）' : '✘ 无来源';
      console.log('    ' + String(x.need).padEnd(12) + ' :: ' + tag
        + (x.cls === 'ENUM' ? '  [枚举位]' : x.cls === 'BRANCH' ? '  [分支必填]' : '')
        + (x.enumOf ? '  [词表 ' + x.enumOf.table + ': ' + x.enumOf.allowed.join('|') + ']' : ''));
    });
    Object.keys(r.blocked).forEach(function (k) { console.log('    阻断 ' + k.padEnd(12) + ' :: ' + r.blocked[k]); });
  });

  const ok = rows.filter(function (r) { return r.verdict === 'OK'; });
  console.log('\n=== 可进实现 ' + ok.length + ' 组 ===');
  ok.forEach(function (r) {
    const map = r.resolved.filter(function (x) { return x.how !== 'SKIP'; }).map(function (x) {
      return x.need + (x.how === 'rename' ? '←' + x.src : x.how === 'derived' ? '=*' : '');
    }).join('  ');
    console.log('  ✔ ' + r.sec + ' → ' + r.to + '\n      ' + map);
  });
  const bad = rows.filter(function (r) { return r.verdict !== 'OK'; });
  console.log('\n=== 不进实现 ' + bad.length + ' 组 ===');
  bad.forEach(function (r) {
    console.log('  ✘ ' + r.sec + ' → ' + r.to + '  [' + (r.verdict || 'ERR') + ']'
      + (r.missing.length ? ' 缺 ' + r.missing.join(',') : '')
      + (r.enumGaps.length ? ' 枚举缺口 ' + r.enumGaps.map(function (g) { return g.need; }).join(',') : ''));
  });
  console.log('\n口径：OK = 必填位全有来源、且不在枚举缺口上；BLOCKED = 有必填位无来源（宁可少喂不许编）；');
  console.log('      ENUM-GAP = 必填位靠改名/派生跨过，但引擎只收自己词表（跨过去等于自造判定）。');
}
process.exit(rows.some(function (r) { return r.err; }) ? 1 : 0);
