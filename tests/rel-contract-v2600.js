#!/usr/bin/env node
// WorldAxis tests/rel-contract-v2600.js —— 输出契约「节内字段」⇄ 引擎读取面 全节锁（v2.60.0）
//
// 【它治的病】v2.59.0 修掉了 relation_update 的「契约缺两轴」，但那次是**单节**的偶遇修复。
//   本轮把同一个问题问遍全部节，抓出一族**同型**缺陷（全部行为级实证）：
//     · people.aliases —— 引擎读（`pmem.holderSet` 用它把别名归到本体记忆），契约不声明。
//       后果：模型按契约必然不给 ⇒ 别名并集恒空，**别名召回能力由构造即死**。
//     · chronicle.refs / foreshadows.links —— 契约不声明，二者只在 AI 明确给出时才用；
//       不声明 = 模型永不主动给，**溯源引用永远退回引擎兜底锚定**，生产方形同废弃。
//     · events_create.stage —— 引擎校验 `e.stage` 合法性、合法则采用（否则回落首阶段），
//       但契约不声明 ⇒ 新事件**永远从首个阶段开始**，推演无法宣告「已推进到某阶段」。
//   一句话：v2.59.0 是「一处的病」，v2.60.0 的锁是「一族的体检」。
//
// 【为什么单节锁不够 —— 节内字段在既有对账器的照程之外】
//   `engines/contract-audit.js`（v0.9.6）是**节级**对账：`FIELDS = Object.keys(PROBES)`，
//   探针一次喂**一个节**，parseContract 的正则带 `^\s*` 行首锚，而契约行是单行、节内字段
//   不在行首 ⇒ 节内任何字段的增删它都看不见。这就是上述缺陷能长期存活的原因。
//   本锁把粒度从「节」下沉到「节内字段」。
//
// 【为什么不写成字段清单】写死清单就是「新增字段时锁不知道」——与本锁要治的病同型
//   （对照 v2.59.0 的字段集由声明口读出、v2.58.0 的方法名由探测得出）。故两侧都由探测得出：
//     引擎侧：Proxy 追踪 `backstage.applyResult` 对载荷的**真实读取**（读到的 = 模型该给的）；
//     契约侧：从 `buildPrompt()` 的真实产物解析每行的键集合（不读源码字面量）。
//   另加「节集一致性」判据：契约里出现的每个节，探针都必须覆盖——新增节时锁会红，
//   而不是静默漏检。
//
// 【判据】
//   A  节集一致：契约节点集 ⇄ 探针覆盖节点集，必须逐字相同。
//   B  每节读取面非空（防某节探测静默失效返回空集而判据恒真）；探测全程无异常。
//   C  引擎读取的每个节内字段，都必须写进该节的契约行（豁免表除外）。
//   C2 契约行声明的每个字段，引擎必须真的读它或在**嵌套形态**里读它（防白产出）。
//      —— 这条同时替代了「按元素名解析契约」的启发式：若把元素字段算作已声明，
//         C2 就会把它判成幻影，由 C2 逼着"契约侧解析正确"这件事自我一致。
//   D  豁免表逐项自证：
//        D1 keep/bcompat：探针形态下必须真被读取（否则不是豁免，是掩盖）；
//        D2 旧值形态自证：把字段本形态补进种子后必须真被读取（用于「模型可省略」类）；
//        D3 非模型键（引擎内部键）：必须**确实不出现在契约里**（否则模型被要求给一个它拿不到的键）。
//   E  探测后 live store 不得残留哨兵（无副作用）。
//
// 【豁免表（按「为什么可以不在 C 面担保」分类，各有自证）】
//   keep    people.avatar        —— 载体字段（头像落点）：引擎收得下、保留不丢，但非模型职责。
//   skipkey events_update.id     —— 引擎内部定位键：locateStable 用 id 精确匹配，而 id 由引擎生成、
//                                   快照不外露（activeSnapshot 只出 n/ty/lv/st/sr），模型无从得知；
//                                   契约以 title 作定位键（「改名不换链」）。
//   bcompat nearEvent.description—— 向后兼容别名：acceptResult 读 `desc || description`，
//                                   生成指令给模型的是 `desc`。
//   bcompat people.aliases / people.resources —— 模型可省略（token 预算），
//                                   旧值存在时引擎确实读取（并集 / 保留），由 D2 在旧值形态上自证。
//
// 【负控制】
//   N0 破坏锚点在真源码中各恰中 1 次（防「破坏没发生也绿」）。
//   N1 判据纯度：把修复前的契约行形态（逐字还原）喂给**同款**判据，必须报出恰好 5 处
//      （people.aliases + chronicle.refs + foreshadows.links + events_create.stage + people_upsert）。
//   N2 两向自证：当前契约行在同款判据下必须通过。
//   N3 逐字段敏感：删掉已声明的某一字段（chronicle.refs），判据必须现形。
//   N4 非恒真：空声明必须不通过。
//   N5 端到端行为注入：让引擎**真的多读一个字段**（包裹 applyResult 内做真实读取），
//      判据必须现形——证明锁挂在「真实读取」上，而不是挂在写死清单上。
//   N6 两向自证：同款判据在原版引擎上对该新字段必须无反应。
//   N7 节集一致性敏感：从契约文本里删掉一个节行，A 面必须现形。
//   N8 D3 自证敏感：把一个非模型键写进契约，D3 必须现形。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

// ── JS 机制名（非领域字段）：这不是领域清单，是语言协议的原生键 ──
const META = new Set(['toJSON', 'toString', 'valueOf', 'constructor', 'then', 'length',
  'forEach', 'map', 'filter', 'slice', 'indexOf', 'includes', 'hasOwnProperty', 'some', 'every',
  'push', 'join', 'split', 'trim', 'replace', 'charAt', 'substring', 'substr', 'concat', 'pop',
  'shift', 'unshift', 'splice', 'sort', 'reverse', 'keys', 'values', 'entries', 'find', 'findIndex',
  'reduce', 'flat', 'at', 'toUpperCase', 'toLowerCase', 'padStart', 'startsWith', 'endsWith',
  'match', 'search', 'localeCompare', 'apply', 'call', 'bind', 'finally', 'catch']);

/** 追踪一个对象的**读取**：访问到的键进 bag（get + has 两条路径都算读取） */
function track(obj, bag, p) {
  if (obj === null || typeof obj !== 'object') return obj;
  const h = {
    get(t, k) {
      if (typeof k === 'symbol') return t[k];
      const ks = String(k);
      if (/^\d+$/.test(ks)) { const v = t[ks]; return (v && typeof v === 'object') ? track(v, bag, p) : v; }
      if (META.has(ks)) return t[ks];
      bag.add(p ? p + '.' + ks : ks);
      // 缺键返回 undefined（**不给哨兵真值**）：引擎大量用 `(r.X || []).forEach` / `typeof r.Y === 'string'`
      //   做守卫，给真值会破坏这些守卫并让 applyResult 中途抛错——那会让后面的读取整体不发生，
      //   判据看到的就成了「崩溃前的读取面」（实测：哨兵版全节探针都报 forEach is not a function，
      //   chronicle.refs / foreshadowa.links / events_create.stage 三处全数漏检）。
      //   缺键本身仍会记账（上面一行），故 `p.avatar` 这类「读但未给」的字段照旧可见。
      if (ks in t) { const v = t[ks]; return (v && typeof v === 'object') ? track(v, bag, p ? p + '.' + ks : ks) : v; }
      return undefined;
    },
    has(t, k) { if (typeof k === 'string' && !META.has(k) && !/^\d+$/.test(k)) bag.add('?' + (p ? p + '.' + k : k)); return k in t; },
    // `Object.keys(t)` / `for...in` / `Object.assign` 都会先枚举键：枚举即读取（值随后必被取走），
    //   故在此记账——否则 `Object.assign(seed, {...})` 型消费会整体漏检
    //   （实测：chronicle.refs 就是靠 Object.assign 浅拷贝进 draft，纯 get 陷阱看不见）。
    ownKeys(t) {
      Reflect.ownKeys(t).forEach(function (k) { if (typeof k === 'string' && !META.has(k) && !/^\d+$/.test(k)) bag.add(p ? p + '.' + k : k); });
      return Reflect.ownKeys(t);
    },
    getOwnPropertyDescriptor(t, k) { return Reflect.getOwnPropertyDescriptor(t, k); }
  };
  return new Proxy(obj, h);
}

// ── 每节一份最小种子（取数形状精确：数组节给数组、对象节给对象，字段名齐备） ──
const SEEDS = {
  clock: 'T',
  world_pulse: { pressure: 2, trend: 'rising', note: 'n' },
  worldFacts: [{ key: '__rs_wf', value: 'v', scope: 'world' }],
  people: [{ name: '__rs_p', location: 'L', action: 'A', intent: 'I', body: 'B', personalityAnchor: 'P', speakingStyle: 'S', behaviorBoundaries: 'C', innerVoice: 'V' }],
  persona_update: [{ name: '__rs_p', slot: 'A', d1: 1, d2: 2, d3: 3, d4: 4, d5: 5, note: 'n' }],
  relation_update: [{ name: '__rs_p', target: '__rs_t', intimacy: 30, trust: 30, hostility: 10, vigilance: 10, attachment: 20, boundary_status: 's', relationship_aftereffect: 'a' }],
  knowledge_updates: [{ person: '__rs_p', about: 'x', status: 'fact', route: 'witnessed' }],
  currents: [{ title: '__rs_cu', summary: 's', visibility: 'trace', publicity: 'trace', public_trace: 'p', stage: '发展' }],
  echoes: [{ refCurrent: '__rs_cu', result: 'r', exposure: 'subtle' }],
  chronicle: [{ kind: 'event', title: '__rs_ch', summary: 's' }],
  foreshadows: [{ id: '__rs_fs', content: 'c', status: 'waiting' }],
  factions: [{ name: '__rs_fa', scope: 's', status: '稳固', relation: '中立', currentGoal: 'g', core_person: 'c', powerPillars: ['p'] }],
  reputation: { authority: '受人尊敬', common: 'c', shadow: 's', circuit: 'i', lastChange: 'l' },
  economy: { climate: '繁荣', signals: [{ summary: 's', scope: 'sc' }] },
  winds: [{ topic: '__rs_w', type: 'rumor', level: 2, content: 'c', scope: 's', source: 'x' }],
  influenceChain: [{ trigger: 't', impact: 'i', fallout: 'f' }],
  enemies: [{ name: '__rs_en', reason: 'r', type: 'grudge', status: '追踪中' }],
  blackbox: { secretActions: [{ action: 'a', witnesses: 'w' }], secretAssets: [{ name: 'n', exposure: 1, status: '有效' }] },
  worldTrends: [{ name: '__rs_wt', scope: 's', status: '持续中', description: 'd', source: 'x' }],
  regionalIncident: { active: true, title: 't', type: 'plague', scope: 's', impact: 'i' },
  distantEvent: { type: 'event', title: 't', desc: 'd' },
  nearEvent: { title: 't', desc: 'd', urgent: true },
  entities: { organization: [{ name: '__rs_e', aliases: ['a'], desc: 'd' }], object: [{ name: '__rs_o', aliases: [], desc: 'd' }], ability: [{ name: '__rs_ab', aliases: [], desc: 'd' }], location: [{ name: '__rs_l', aliases: [], desc: 'd' }] },
  next_turn_injection: { required: ['r'], conditional: ['c'], suppress: ['s'] },
  events_create: [{ title: '__rs_ev', type: 'conflict', level: 2, desc: 'd' }],
  events_update: [{ title: '__rs_ev', name: '__rs_ev2', stage: '已爆发', desc: 'd', stall: true, stallReason: 'x' }]
};

// ── 多形态：条件分支 / 短路求值下，同一节的不同形态会读不同字段。
//    单形态探测会漏字段（实测：distantEvent 只喂 event 形态时，wind 分支的
//    topic/content/level 读不到）。每个元素是「该节的取数形状」，不是单条记录。
const FORMS = {
  distantEvent: [
    { type: 'event', title: 't', desc: 'd' },
    { type: 'wind', topic: 'tp', content: 'c', level: 3 }
  ],
  // `u.title || u.name` 是短路式读取：给了 title 就永不读 name。补一形态，否则 name 被误判。
  events_update: [
    [{ title: '__rs_ev2', name: '__rs_ev3', stage: '已爆发', desc: 'd', stall: true, stallReason: 'x' }],
    [{ name: '__rs_ev' }]
  ]
};

// ── 豁免表：不参与字段级 C 面担保的项。`inContract` 声明「它该不该出现在契约里」，
//    两个方向都有判据：true → D5 必须出现；false → D3 必须不出现。
//    另由 D1 逐项证明「引擎确实读它」（在基准形态或指定形态上），否则不是豁免而是掩盖。
const EXEMPT = {
  'people.avatar': { inContract: true, why: '载体字段（头像落点）：引擎收得下、保留不丢；属可给字段，故列入契约' },
  'people.aliases': { inContract: true, why: '模型可省略（token 预算）；旧值存在时引擎做并集（D1 在旧值形态上证）' },
  'people.resources': { inContract: true, why: '同上（旧值存在时保留）' },
  'events_update.id': { inContract: false, undetectable: true, why: '引擎内部定位键：id 由引擎生成、快照不外露（activeSnapshot 只出 n/ty/lv/st/sr），模型无从得知；且它在 `Object.assign({}, u, ...)` 克隆体上被 locateStable 读取，故载荷探针看不见它（undetectable：D1 不适用，D3 仍须不出现）' },
  'nearEvent.description': { inContract: false, why: '向后兼容别名：acceptResult 读 desc || description，给模型的字段名是 desc' }
};

/** 把字段本形态补进种子（旧值形态）——用于豁免自证 */
function fill(form, pathStr, value) {
  const parts = pathStr.split('.');
  let o = form;
  for (let i = 0; i < parts.length - 1; i++) {
    if (o[parts[i]] === undefined) o[parts[i]] = {};
    o = o[parts[i]];
  }
  o[parts[parts.length - 1]] = value;
  return form;
}

// 豁免自证形态：把该字段补成「模型确实给了」的样子（数组节补到第 0 条；对象节删掉短路前置键）
const EXEMPT_FORM = {
  'people.aliases': function (f) { return fill(f, '0.aliases', []); },
  'people.resources': function (f) { return fill(f, '0.resources', {}); },
  'people.avatar': function (f) { return fill(f, '0.avatar', 'a.png'); },
  // description 被 `desc ||` 短路遮住，故删掉 desc 才能证明确实读了它
  'nearEvent.description': function (f) { delete f.desc; f.description = 'd'; return f; },
  // id 是 locateStable 的**空值守卫**（`if (update.id)`）：给了 title 就永不看 id，故用只带 name 的形态
  'events_update.id': function (f) { return [{ name: 'x' }]; }
};

/** 探针注入的哨兵值（用于 E 面无残留判定；不是给引擎的默认值） */
const PROBE_TAG = '__rs_';

function probePass(WA, section, form, draft, bag) {
  const probe = {};                             // 容器不跟踪：否则每节的读取面都会混进全部节名
  // 以**节名**作路径前缀：数组元素的自身路径是索引（'0'），故不能靠索引取节名
  probe[section] = track(JSON.parse(JSON.stringify(form)), bag, section);
  const keepDigest = WA.digest;
  if (keepDigest) WA.digest = Object.assign({}, keepDigest, { generate: function () { return null; } });
  let err = null;
  try { WA.backstage.applyResult(draft, probe, { idx: 9 }); } catch (e) { err = String((e && e.message) || e); }
  finally { if (keepDigest) WA.digest = keepDigest; }
  return err;
}

/** 探测某节的读取面：多形态 × 双趟（趟1 落 create 分支并种下基线，趟2 命中 update 分支） */
function probeReads(WA, section, formsArg) {
  const bag = new Set();
  const draft = JSON.parse(JSON.stringify(WA.store.get()));
  const forms = formsArg || FORMS[section] || [SEEDS[section]];
  let err = null;
  forms.forEach(function (form) {
    err = err || probePass(WA, section, form, draft, bag);
    err = err || probePass(WA, section, form, draft, bag);
  });
  // 只统计**本节的路径**（`节.字段`）——`x.y`（其它节引用）与 `节X`（其它节的行键）都不算本节的字段
  const top = new Set(), nested = new Set(), raw = [];
  bag.forEach(function (k) {
    const path = k.replace(/^\?/, '');
    if (path === section && section !== 'clock') top.add('__self__');   // 行键 ≠ 字段，记自读（供 C「非空」用）
    if (path.indexOf(section + '.') !== 0) return;
    const parts = path.split('.');
    raw.push(path);
    if (parts.length === 2) top.add(parts[1]); else if (parts.length >= 3) nested.add(parts[1] + '.' + parts[2]);
  });
  raw.sort();
  return { top: top, nested: nested, raw: raw, err: err };
}

/** 从真实提示词解析每节的声明字段集合（节内键全聚合；`...` 与中文占位不计入） */
function parseContract(sys) {
  const out = {};
  String(sys || '').split('\n').forEach(function (line) {
    const m = line.match(/^\s*"([A-Za-z_][A-Za-z0-9_]*)"\s*:/);
    if (!m) return;
    const keys = new Set();
    let mm; const re = /"([A-Za-z_][A-Za-z0-9_]*)"/g;
    while ((mm = re.exec(line)) !== null) keys.add(mm[1]);
    keys.delete(m[1]);
    out[m[1]] = keys;
  });
  return out;
}

/** 引擎读了、契约没声明（豁免除外） */
function missingDeclared(sec, reads, declared) {
  const out = [];
  reads.top.forEach(function (f) {
    if (f === '__self__') return;            // 行键 ≠ 字段
    if (declared.has(f)) return;
    if (EXEMPT[sec + '.' + f]) return;
    out.push(f);
  });
  return out;
}

/** 契约声明了、引擎却不读（豁免除外）——防幻影字段。
 *  嵌套记账形如 `secretActions.action`，故按**末段**匹配元素字段名。 */
function phantomDeclared(sec, reads, declared) {
  const out = [];
  declared.forEach(function (f) {
    if (reads.top.has(f)) return;
    if (Array.from(reads.nested).some(function (x) { return x.split('.').pop() === f; })) return;
    if (EXEMPT[sec + '.' + f]) return;
    out.push(f);
  });
  return out;
}

function sectionsOf(WA) {
  const msgs = WA.backstage.buildPrompt({ idx: 1 }, '');
  const sys = (((msgs || [])[0] || {}).content) || '';
  return { sys: sys, contract: parseContract(sys) };
}

function allMissing(reads, contract) {
  const out = [];
  Object.keys(reads).forEach(function (sec) {
    if (!contract[sec]) return;
    missingDeclared(sec, reads[sec], contract[sec]).forEach(function (f) { out.push(sec + '.' + f); });
  });
  return out;
}

function runAll(a) {
  const gate = require('./ui-gate-sync.js');
  const env = gate.fresh();
  const WA = env.WA;
  const c = sectionsOf(WA);
  a(c.sys.indexOf('【输出契约】') >= 0, 'v2600: [D] 提示词确为推演输出契约块（buildPrompt 产物）');
  // A 面：节集一致（新增节时锁必须知道）
  const probeSecs = Object.keys(SEEDS).sort();
  const contractSecs = Object.keys(c.contract).sort();
  const missSec = probeSecs.filter(function (s) { return contractSecs.indexOf(s) < 0; });
  const extraSec = contractSecs.filter(function (s) { return probeSecs.indexOf(s) < 0; });
  a(contractSecs.length >= 24, 'v2600: [A] 契约解析出 ' + contractSecs.length + ' 节（≥24，判据不在子集上恒真）');
  a(missSec.length === 0, 'v2600: [A] 探针覆盖的每一节都在契约里（缺: ' + (missSec.join(',') || '无') + '）');
  a(extraSec.length === 0, 'v2600: [A] 契约里的每一节都被探针覆盖（未覆盖: ' + (extraSec.join(',') || '无') + '）');
  // 探测全节读取面（无副作用：先快照，后还原）
  const snapshot = JSON.parse(JSON.stringify(WA.store.get()));
  const reads = {}, bad = [];
  try {
    probeSecs.forEach(function (sec) {
      const r = probeReads(WA, sec);
      reads[sec] = r;
      if (r.err) bad.push(sec + '(' + r.err + ')');
    });
    a(bad.length === 0, 'v2600: [B] 每节探测均无异常（错: ' + (bad.join(' ') || '无') + '）');
    // B 面：每节读取面非空（防探测静默失效）——标量节（clock）无字段可探，不参与
    const objectSecs = probeSecs.filter(function (s) { return SEEDS[s] !== null && typeof SEEDS[s] === 'object'; });
    const emptyRead = objectSecs.filter(function (s) { return reads[s].top.size === 0; });
    a(emptyRead.length === 0, 'v2600: [B] 每节读取面非空（空: ' + (emptyRead.join(',') || '无') + '）');
    // C 面：引擎读取的字段都在契约里
    const missing = allMissing(reads, c.contract);
    a(missing.length === 0, 'v2600: [C] 引擎读取的节内字段都写进了契约（缺: ' + (missing.join(',') || '无') + '）');
    // C2 面：契约声明的字段引擎都真读（含嵌套形态）
    const ghosts = [];
    contractSecs.forEach(function (sec) {
      if (!reads[sec]) return;
      phantomDeclared(sec, reads[sec], c.contract[sec]).forEach(function (f) { ghosts.push(sec + '.' + f); });
    });
    a(ghosts.length === 0, 'v2600: [C2] 契约声明的字段引擎都真读（幻影: ' + (ghosts.join(',') || '无') + '）');
    // D1：豁免项必须**确实被引擎读取**（基准形态即可；被短路遮住的走 EXEMPT_FORM 指定形态）
    const d1Bad = [];
    Object.keys(EXEMPT).forEach(function (key) {
      if (EXEMPT[key].undetectable) return;    // 载荷探针看不见它（在读之前被克隆），D1 不适用
      const i = key.indexOf('.');
      const sec = key.slice(0, i), f = key.slice(i + 1);
      if (reads[sec] && reads[sec].top.has(f)) return;
      if (EXEMPT_FORM[key]) {
        let form = JSON.parse(JSON.stringify(SEEDS[sec]));
        form = EXEMPT_FORM[key](form);
        if (probeReads(WA, sec, [form]).top.has(f)) return;
      }
      d1Bad.push(key);
    });
    a(d1Bad.length === 0, 'v2600: [D1] 豁免项确实被引擎读取（假豁免: ' + (d1Bad.join(',') || '无') + '）');
    // D3：声明「不该在契约里」的项必须**真的不在**（防要求模型给一个它拿不到的键）
    const d3Bad = Object.keys(EXEMPT).filter(function (key) {
      if (EXEMPT[key].inContract !== false) return false;
      const i = key.indexOf('.');
      return (c.contract[key.slice(0, i)] || new Set()).has(key.slice(i + 1));
    });
    a(d3Bad.length === 0, 'v2600: [D3] 非模型键未被写进契约（误声明: ' + (d3Bad.join(',') || '无') + '）');
    // D5：声明「该在契约里」的项必须**真的在**——本版修复边界，删掉即红
    const d5Bad = Object.keys(EXEMPT).filter(function (key) {
      if (EXEMPT[key].inContract !== true) return false;
      const i = key.indexOf('.');
      return !(c.contract[key.slice(0, i)] || new Set()).has(key.slice(i + 1));
    });
    a(d5Bad.length === 0, 'v2600: [D5] 可给字段已列入契约（漏声明: ' + (d5Bad.join(',') || '无') + '）');
  } finally {
    WA.store.transact(function (d) {
      Object.keys(d).forEach(function (k) { delete d[k]; });
      const s = JSON.parse(JSON.stringify(snapshot));
      Object.keys(s).forEach(function (k) { d[k] = s[k]; });
    });
  }
  // E 面：无哨兵残留（种子里的标记不得落进真实存档）
  a(JSON.stringify(WA.store.get()).indexOf(PROBE_TAG) < 0, 'v2600: [E] 探测哨兵不残留于真实存档');
}

function runNegative(a) {
  const gate = require('./ui-gate-sync.js');
  const bs = fs.readFileSync(path.join(BASE, 'engines/backstage.js'), 'utf8');
  // 修复前的形态（逐字，**源码与提示词共有**的片段——不含 JS 引号，故两处都能还原）
  const PATCHES = [
    { name: 'people', neu: '"name":"...","aliases":[],"avatar":"...","resources":{},', old: '"name":"...",' },
    { name: 'chronicle', neu: '"summary":"...","refs":[]}]（refs：可选的楼层引用数组，元素形如 m77；不给则引擎按本次结算楼层自动锚定）', old: '"summary":"..."}' },
    { name: 'foreshadows', neu: '"status":"waiting|developing|triggered|recycled|dropped","links":[]}]（links：可选的楼层引用数组，元素形如 m99；不给则引擎按当前楼层兜底捕获）', old: '"status":"waiting|developing|triggered|recycled|dropped"}' },
    { name: 'events_create', neu: '"desc":"≤50字","stage":"该类型合法阶段(可空,缺省为首阶段)"}', old: '"desc":"≤50字"}' }
  ];
  // N0：破坏锚点在真源码中各恰中 1 次（防「破坏没发生也绿」）
  const anchorBad = PATCHES.filter(function (p) { return (bs.split(p.neu).length - 1) !== 1; })
    .map(function (p) { return p.name + '(' + (bs.split(p.neu).length - 1) + '次)'; });
  a(anchorBad.length === 0, 'v2600: [N0] 破坏锚点在真源码中各恰中 1 次（异: ' + (anchorBad.join(',') || '无') + '）');
  const env = gate.fresh();
  const WA = env.WA;
  const c = sectionsOf(WA);
  const reads = {};
  Object.keys(SEEDS).forEach(function (sec) { reads[sec] = probeReads(WA, sec); });
  // N1 判据纯度：历史缺陷形态 → 同款判据必须现形
  //   · C 面（缺声明）报出恰好 3 处；
  //   · people 三字段是**契约侧声明缺失**，走 D5 面形态（`inContract` 逐项）而非 C 面。
  let oldSys = c.sys;
  PATCHES.forEach(function (p) { oldSys = oldSys.split(p.neu).join(p.old); });
  const oldContract = parseContract(oldSys);
  const missOld = allMissing(reads, oldContract);
  const EXPECT = ['chronicle.refs', 'foreshadows.links', 'events_create.stage'];
  const hitAll = EXPECT.every(function (k) { return missOld.indexOf(k) >= 0; });
  a(missOld.length === EXPECT.length && hitAll,
    'v2600: [N1] 修复前的契约形态在同款判据下现形恰 3 处（实 ' + missOld.length + ': ' + missOld.join(',') + '）');
  const oldPeopleMissing = ['aliases', 'avatar', 'resources'].filter(function (f) { return !(oldContract['people'] || new Set()).has(f); });
  a(oldPeopleMissing.length === 3, 'v2600: [N1] 修复前的 people 行同样缺三字段（D5 面同款判据下现形: ' + oldPeopleMissing.join(',') + '）');
  // N2 两向自证：当前契约在同款判据下通过
  const missNow = allMissing(reads, c.contract);
  a(missNow.length === 0, 'v2600: [N2] 当前契约行在同款判据下通过（缺: ' + (missNow.join(',') || '无') + '）');
  // N3 逐字段敏感：删掉已声明的 refs
  const oneOff = parseContract(oldSys.split(PATCHES[1].neu).join(PATCHES[1].old));
  const noRefs = missingDeclared('chronicle', reads['chronicle'], oneOff['chronicle'] || new Set());
  a(noRefs.indexOf('refs') >= 0, 'v2600: [N3] 删掉 chronicle.refs 时判据现形（逐字段敏感）');
  // N4 非恒真：空声明必须把该节读取面**全部**报出来（数量与读取面严格对应）
  const n4 = missingDeclared('chronicle', reads['chronicle'], new Set()).length;
  a(n4 === reads['chronicle'].top.size, 'v2600: [N4] 空声明不通过（判据非恒真，实报 ' + n4 + '/' + reads['chronicle'].top.size + '）');
  // N5 端到端行为注入：让引擎**真的多读一个字段** → 判据必须现形
  const orig = WA.backstage.applyResult;
  let injected = false;
  WA.backstage.applyResult = function (d, r, aa) {
    if (r && r.people && r.people[0]) { void r.people[0].__rc_newaxis; injected = true; }   // 真实新增读取
    return orig.call(this, d, r, aa);
  };
  let rInj = null, rOrig = null;
  try {
    rInj = probeReads(WA, 'people');
    WA.backstage.applyResult = orig;
    rOrig = probeReads(WA, 'people');
  } finally { WA.backstage.applyResult = orig; }
  a(injected, 'v2600: [N5] 行为注入确已发生（引擎真的读了一次新字段）');
  a(rInj.top.has('__rc_newaxis'),
    'v2600: [N5] 引擎新增真实读取时判据现形（锁挂在行为面，不在写死清单上）');
  // N6 两向自证：原版引擎上同款判据对该字段无反应
  a(!rOrig.top.has('__rc_newaxis'),
    'v2600: [N6] 原版引擎上同款判据对该字段无反应（现形源于破坏，非恒真）');
  // N7 节集一致性敏感：删掉一个节行 → A 面必须现形
  const cut = c.sys.split('\n').filter(function (l) { return l.indexOf('"foreshadows"') < 0; }).join('\n');
  const cutSecs = Object.keys(parseContract(cut));
  a(cutSecs.indexOf('foreshadows') < 0 && Object.keys(SEEDS).indexOf('foreshadows') >= 0,
    'v2600: [N7] 节集一致性判据对「契约里少了一节」敏感');
  // N8 D3 自证敏感：把一个非模型键写进契约，D3 必须现形
  const fakeSys = c.sys.replace('"events_update": [{', '"events_update": [{"id":"...",');
  const fakeContract = parseContract(fakeSys);
  const d3Hit = (fakeContract['events_update'] || new Set()).has('id');
  a(d3Hit, 'v2600: [N8] 非模型键若被写进契约，D3 会现形（判据对契约侧敏感）');
}

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) {
    if (cond) { pass++; }
    else { fail++; console.log('  ✗ ' + name); }
  };
  try {
    runAll(a);
    runNegative(a);
  } catch (e) {
    fail++; console.log('  ✗ 判据失效：' + (e && e.message));
  }
  if (fail) { console.log('REL-CONTRACT-V2600: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('REL-CONTRACT-V2600: pass（' + pass + ' 项）');
}
module.exports = { runAll: runAll, runNegative: runNegative, SEEDS: SEEDS, EXEMPT: EXEMPT, FORMS: FORMS,
  parseContract: parseContract, probeReads: probeReads, missingDeclared: missingDeclared,
  phantomDeclared: phantomDeclared, sectionsOf: sectionsOf, allMissing: allMissing };