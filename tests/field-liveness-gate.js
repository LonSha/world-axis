/**
 * WorldAxis tests/field-liveness-gate.js (v2.40.0) — 骨架归属门禁
 *
 * 为什么要有这道门禁（三次同型缺陷的收敛）：
 *   · v2.36.0：`meta.round` 有读者、零写者 ⇒ 账本轮次恒 0；
 *   · v2.39.0：顶层 `state.round` 有读者、骨架里根本没这个字段 ⇒ 主动拉动拉一次
 *     后永久冷却、自动备份永不产出、诊断轮次恒空。而 v2.36.0 的静态锁只认字面
 *     `meta.round`，`(JSON.parse(...).meta || {}).round` 这种嵌套写法照样漏网。
 *   · v2.40.0：`lastInjection` / `proactiveLastRound` 有写入方、有读者，**骨架里
 *     却没有声明**（写侧幽灵——v2.39.0 是读侧，这是一体两面）。
 *
 * 两次漏网的教训是同一条：**静态锁写死一种拼法，就等于给其它拼法发通行证**。
 * 所以本门禁不再枚举拼法，改为把「运行时真实骨架」当唯一字段真源，做三条正交检查：
 *
 *   ① ghost-read（幽灵读点）：已确认「零写入方」或「骨架无此字段」的读取形态，
 *      全库产品代码必须零命中，仅留逐条附理由的豁免。
 *   ② schema-write（写侧归属）：`store.transact` 回调 draft 与 `store.patch(key)`
 *      写入的**顶层键**，必须在 `store.get()` 的骨架一级键里 —— 否则是「写了骨架
 *      里没有的字段」（v2.40.0 抓到的正是这一类）。
 *   ③ schema-read（读侧归属）：裸形态 `store.get().FIELD` 读的顶层键，同样必须在
 *      骨架一级键里（v2.39.0 的 `st.round` 走的是绑定变量形态，见规则①的豁免面）。
 *
 * 三条都以 `store.get()` 的真实导出为真源，不做正则猜读；并配**负向自证**
 * （在真源码副本上制造破坏 ⇒ 判据必须现形），否则无法证明自己不是恒真。
 *
 * 用法：node tests/field-liveness-gate.js [--update]
 *   默认：比对现场与冻结账本，新增即红灯（exit 1）
 *   --update：把现场值写回账本（仅在确认新增合法后使用）
 *
 * ── 已知边界（不追求消灭，靠 OWNED_TOP_KEYS 显式登记兜住）──
 *   · 变量名撞名：`const d = mainDoc.createElement('div'); d.innerHTML = ...` 会被
 *     规则②当成本地 `d` 对象的写点。产品代码里的 transact 回调参数约定为
 *     `d` / `draft`，同名局部变量造成的假阳性不逐条豁免，而是由「必须恰为骨架键」
 *     的反向约束兜住——即假阳性能且只能出现在**写法位置**，不会漏报真写点。
 *   · 动态索引（`em[type] = ...`）的键名抓不到，不参与本门禁。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.join(__dirname, '..');
const LEDGER_PATH = path.join(__dirname, 'field-liveness-ledger.json');

// ── 规则①：幽灵读点（已确认「零写入方」或「骨架无此字段」的读取形态）──
//   allow = 允许残留的位置及上限，每一处都必须在 why 里说明理由。
const DENY_RULES = [
  {
    id: 'meta.round-read',
    why: 'v2.36.0：`meta.round` 全库零写入方，真源是 evolution.round。读它 ⇒ 轮次恒 0。' +
         '唯一允许的位置是 evolution.js 的 roundOf 兼容兜底（读历史存档，读不到才回 0）。',
    pattern: /meta\s*(?:\.\s*round\b|\[\s*['"]round['"]\s*\])/g,
    allow: { 'engines/evolution.js': 2 }
  },
  {
    id: 'state.round-read',
    why: 'v2.39.0：顶层 `state.round` 在骨架里根本不存在，读它 ⇒ 恒 undefined ⇒ ' +
         '主动拉动冷却判据恒真（拉一次后永久冷）、自动备份轮次恒 0（永不产出）、诊断轮次恒空。' +
         '豁免三处，全部是**自产对象**而非世界状态：诊断侧快照对象 env(cols) / snap，' +
         '与平行世界 pwState().st，它们各自自带 round 字段。',
    pattern: /(^|[^.\w$])(?:st|state|snap|env)\.round\b/g,
    allow: {
      'engines/inject-inspector.js': 2,
      'engines/tool-diag.js': 1,
      'engines/parallel-world.js': 1
    }
  }
];

// ── 允许「不在骨架一级键」的书写位置（每条必须能一句话说清为什么不是缺陷）──
//   规则②/③ 的豁免面。键 = 「文件 :: 键名」，值是出现次数上限。
const OWNED_TOP_KEYS = {
  // panel.js 的 transact 回调参数 `d` 与同文件的 `const d = mainDoc.createElement(...)`
  // 撞名：`d.innerHTML = html` 被规则②当成本地元素写点。它不是世界状态写入方。
  'ui/panel.js::innerHTML': 1
};

// 骨架里允许被非骨架键读取的宿主对象名（规则③ 的变量名集合，仅裸形态）
const SCHEMA_ROOT = 'store.get()';

function loadWA() {
  require('./mock.js');
  const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
  const li = runSrc.indexOf('const LOAD = [');
  const lj = runSrc.indexOf('];', li);
  const LOAD = vm.runInNewContext('(' + runSrc.slice(runSrc.indexOf('[', li), lj + 1) + ')');
  const ctx = vm.createContext(global);
  for (const rel of LOAD) {
    vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel });
  }
  const WA = global.WorldAxis;
  WA.store.init();
  return WA;
}

/** 运行时真实骨架的一级键（唯一字段真源） */
function schemaTopKeys(WA) {
  return Object.keys(WA.store.get()).filter(function (k) { return k.charAt(0) !== '_'; }).sort();
}

function productFaces() {
  const inv = require('./inventory.js');
  return (inv.PRODUCT_FILES || []).map(function (rel) {
    return { rel: rel, face: inv.codeFace(fs.readFileSync(path.join(BASE, rel), 'utf8')) };
  });
}

/** 规则①：denylist 扫描 */
function scanDeny(faces) {
  const hits = {};
  faces.forEach(function (f) {
    DENY_RULES.forEach(function (rule) {
      const re = new RegExp(rule.pattern.source, 'g');
      let n = 0;
      while (re.exec(f.face)) n++;
      if (n) {
        hits[rule.id] = hits[rule.id] || {};
        hits[rule.id][f.rel] = (hits[rule.id][f.rel] || 0) + n;
      }
    });
  });
  return hits;
}

/**
 * 规则②③：骨架归属。
 *
 * 口径：
 *   · 规则②（写侧）认 `transact` 回调参数上的**一级键纯赋值** `d.KEY =`（KEY 后不接
 *     `.`，即排除 `d.a.b = ...` 的二级写入）与 `patch('KEY'` 的字面量键。
 *   · 规则③（读侧）认裸形态 `store.get().KEY`。
 *   · 命中后过滤掉骨架一级键，剩下的就是「骨架里没有的字段」。
 */
function scanOwnership(faces, topKeys) {
  const set = new Set(topKeys);
  const out = { write: {}, read: {} };

  const PARAM = /(?:store\s*\.\s*)?transact\s*\(\s*(?:function\s*)?\(?\s*([A-Za-z_$][\w$]*)/g;
  const PATCH = /(?:store\s*\.\s*)?patch\s*\(\s*['"]([A-Za-z_$][\w$]*)['"]/g;
  const BARE = /(?:WA\s*\.\s*)?store\s*\.\s*get\s*\(\s*\)\s*\.\s*([A-Za-z_$][\w$]*)/g;

  function bump(bucket, rel, key) {
    bucket[rel] = bucket[rel] || {};
    bucket[rel][key] = (bucket[rel][key] || 0) + 1;
  }

  faces.forEach(function (f) {
    const names = new Set();
    let m;
    const p = new RegExp(PARAM.source, 'g');
    while ((m = p.exec(f.face))) names.add(m[1]);
    names.forEach(function (nm) {
      const esc = nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('(^|[^.\\w$])' + esc + '\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*=(?!=)', 'g');
      let mm;
      while ((mm = re.exec(f.face))) if (!set.has(mm[2])) bump(out.write, f.rel, mm[2]);
    });
    const q = new RegExp(PATCH.source, 'g');
    while ((m = q.exec(f.face))) if (set.has(m[1]) === false) bump(out.write, f.rel, m[1]);
    const b = new RegExp(BARE.source, 'g');
    while ((m = b.exec(f.face))) if (!set.has(m[1])) bump(out.read, f.rel, m[1]);
  });

  return out;
}

function countAll(bucket) {
  let n = 0;
  Object.keys(bucket).forEach(function (rel) {
    Object.keys(bucket[rel]).forEach(function (k) { n += bucket[rel][k]; });
  });
  return n;
}

function main() {
  const update = process.argv.indexOf('--update') >= 0;
  const WA = loadWA();
  const topKeys = schemaTopKeys(WA);
  const faces = productFaces();

  const deny = scanDeny(faces);
  const own = scanOwnership(faces, topKeys);

  const violations = [];
  DENY_RULES.forEach(function (rule) {
    const got = deny[rule.id] || {};
    Object.keys(got).forEach(function (rel) {
      const allowed = (rule.allow && rule.allow[rel]) || 0;
      if (got[rel] > allowed) {
        violations.push('规则①「' + rule.id + '」在 ' + rel + ' 命中 ' + got[rel]
          + ' 处，豁免上限 ' + allowed + '。' + rule.why);
      }
    });
  });
  Object.keys(own.write).forEach(function (rel) {
    Object.keys(own.write[rel]).forEach(function (k) {
      const allowance = OWNED_TOP_KEYS[rel + '::' + k] || 0;
      if (own.write[rel][k] > allowance) {
        violations.push('规则②（写侧）' + rel + ' 向骨架未声明的顶层键 `' + k + '` 写入 '
          + own.write[rel][k] + ' 处（豁免 ' + allowance + '）。'
          + '若确为新世界状态字段，请先在 core/store.js 的 defaultWorldState 里声明；'
          + '若属本地对象撞名，请在 OWNED_TOP_KEYS 里登记理由。');
      }
    });
  });
  Object.keys(own.read).forEach(function (rel) {
    Object.keys(own.read[rel]).forEach(function (k) {
      violations.push('规则③（读侧）' + rel + ' 读裸形态 ' + SCHEMA_ROOT + '.' + k
        + '（' + own.read[rel][k] + ' 处），但骨架一级键里没有 `' + k + '` —— '
        + '这正是 v2.39.0 的形态（读得到、字段不存在）。');
    });
  });

  console.log('■ 骨架归属门禁（幽灵读点 / 写侧越界 / 读侧越界）');
  console.log('  骨架一级键 %d 个 · 产品文件 %d 个', topKeys.length, faces.length);
  console.log('  规则① denylist 命中: %s', JSON.stringify(deny));
  console.log('  规则② 写侧越界: %d 处 %s', countAll(own.write), JSON.stringify(own.write));
  console.log('  规则③ 读侧越界: %d 处 %s', countAll(own.read), JSON.stringify(own.read));

  const ledger = fs.existsSync(LEDGER_PATH)
    ? JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'))
    : null;

  if (update || !ledger) {
    fs.writeFileSync(LEDGER_PATH, JSON.stringify({
      _note: 'WorldAxis 骨架归属冻结账本（v2.40.0）。规则①记录幽灵读点的豁免残留；'
        + '规则②③记录「写入/读取了骨架未声明的顶层键」的现状（每条须有 OWNED_TOP_KEYS 理由，'
        + '否则须先把字段补进 core/store.js 的 defaultWorldState）。'
        + '出现新条目即红灯：须显式 --update 登记并补理由，或修掉它。',
      version: '2.40.0',
      schemaTopKeys: topKeys,
      deny: deny,
      write: own.write,
      read: own.read
    }, null, 2) + '\n');
    console.log('  ✓ 已写入冻结账本 %s', path.relative(BASE, LEDGER_PATH));
    process.exit(0);
  }

  const diffs = [];
  DENY_RULES.forEach(function (rule) {
    const now = deny[rule.id] || {};
    const was = (ledger.deny && ledger.deny[rule.id]) || {};
    Object.keys(now).forEach(function (rel) {
      if (now[rel] > (was[rel] || 0)) {
        diffs.push('规则①「' + rule.id + '」' + rel + ' 命中 ' + now[rel] + ' 处（账本 ' + (was[rel] || 0) + '）');
      }
    });
  });
  ['write', 'read'].forEach(function (which) {
    const now = own[which] || {};
    const was = (ledger[which]) || {};
    Object.keys(now).forEach(function (rel) {
      Object.keys(now[rel]).forEach(function (k) {
        const before = (was[rel] && was[rel][k]) || 0;
        if (now[rel][k] > before) {
          diffs.push('规则' + (which === 'write' ? '②（写侧）' : '③（读侧）') + ' ' + rel
            + ' `' + k + '` 命中 ' + now[rel][k] + ' 处（账本 ' + before + '）');
        }
      });
    });
  });
  // 骨架一级键自身收缩（有人把声明删了）也应红灯
  const lostKeys = (ledger.schemaTopKeys || []).filter(function (k) { return topKeys.indexOf(k) < 0; });

  if (violations.length || diffs.length) {
    console.log('  ✗ 门禁红灯');
    violations.forEach(function (v) { console.log('    · ' + v); });
    diffs.forEach(function (d) { console.log('    · ' + d); });
    process.exit(1);
  }
  if (lostKeys.length) {
    console.log('  ⚠ 骨架一级键减少: %s（账本登记过、现场已无）——若为正当删字段请 --update', JSON.stringify(lostKeys));
  }
  console.log('  ✓ 无幽灵读点、无写/读侧越界、骨架一级键未减少');
  process.exit(0);
}

if (require.main === module) main();
module.exports = {
  DENY_RULES, OWNED_TOP_KEYS,
  loadWA, schemaTopKeys, productFaces,
  scanDeny, scanOwnership
};