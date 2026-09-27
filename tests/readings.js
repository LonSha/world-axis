'use strict';
/**
 * WorldAxis 硬读数一致性真源（计划一 #4 自动回填 / #5 台账同源 / #6 比较值与消息文本同步）。
 *
 * 本模块要治的三种病（都是「读数与现场脱钩」）：
 *   ① 同一个读数在 tests/run.js 里出现**三处以上**（r2700 / r2800 / r2900 …），每处各带一段长注释
 *      说明来历；改版时漏改一处 ⇒ 一处红、两处过，而那一条红很容易被当成「判据写错」。
 *   ② v2.81.0 实证过：只改了**消息文本**没改**比较值**（消息写 425、比较值仍是 414）⇒ 报红时
 *      消息里的数字与实值相同，看上去像「判据坏了」，其实是两者不同步。
 *   ③ 台账的 `version` 与 `index.js` 的 VERSION 是两套东西，靠人记得同批改。
 *
 * 办法：把「读数族」登记成一张表，用**现场唯一形态**（`r<四位>.<字段> === <数字>`、
 * `Object.keys(led<四位>.<面>).length === <数字>`）逐个站点扫出来，然后断言
 *   A. 同一读数族在**全部站点上同值**（不允许一处改了别处没改）；
 *   B. 该值等于**现场实测**（不允许是手写后过期的数字）；
 *   C. 同一断言里的**消息文本**数字与比较值一致（v2.81.0 的坑）。
 * 回填由 `tools/sync-hardcoded.js`（薄壳，纯委托本模块）执行：默认 dry-run 显 diff；
 * 命中 0 / 族内多值 / 消息已漂移 一律拒绝改写；写前复判、写后校验、失败回滚。
 * 注意：回填**同时**改比较值与消息副本（#6）——只改前者会让自己的 message-mismatch 报红，
 * 那正是 v2.81.0 的形态（v2.106.0 端到端验证时修）。
 *
 * 边界（如实登记，不假称已覆盖）：
 *   - 只覆盖**登记形态**的站点。其余写法（局部变量名不同 / 跨行拼接 / 模板串 / 正则内含）本轮未纳入，
 *     与 negative-control-audit 的「非统一锚点」同口径登记为未覆盖。
 *   - 「同一断言块」的切分用括号平衡，块内出现嵌套函数或跨行三元时按「最外层 assert( ... )」取，
 *     不为极端排版兜底（本仓无此形态）。
 *   - L3（台账与提交同批）依赖 git 状态，属**收口期**判据，不进常绿门禁（时钟类判据易假红）。
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');

/** 读数族：站点上出现的字段名 → 现场探针键。键是归一化后的族名。 */
const FIELD_OF = {
  refs: 'refs',
  namespaces: 'namespaces',
  members: 'members',
  deadInTestsOnly: 'deadInTestsOnly',
  'dead.length': 'dead',
  'uiDead.length': 'uiDead',
  'dataOnly.length': 'dataOnly'
};

/** 站点形态一：`r<四位>.<字段> === <数字>`（清册面 / 死子面内联断言）。 */
const SITE_RE_A = /\br(\d{4})\.([A-Za-z]+(?:\.[A-Za-z]+)?)\s*===\s*(\d+)/g;
/** 站点形态二：`Object.keys(led<四位>.<面>).length === <数字>`（台账条目数）。 */
const SITE_RE_B = /\bObject\.keys\(led(\d{4})\.(dead|uiDead)\)\.length\s*===\s*(\d+)/g;

/** 三本台账（#5 三级同源校验的 L1/L2 面）。 */
const LEDGERS = [
  { rel: 'tests/reject-code-ledger.json', hasNote: true },
  { rel: 'tests/module-registry-ledger.json', hasNote: false },
  { rel: 'tests/dead-export-ledger.json', hasNote: true }
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/** `index.js` 的 VERSION 常量（注意该行有缩进，不能用 startswith 判）。 */
function versionOfIndex() {
  const line = read('index.js').split('\n').filter(function (l) {
    return l.indexOf('VERSION = ') >= 0 && l.indexOf("'2.") >= 0;
  })[0];
  if (!line) return null;
  const m = line.match(/'(\d+\.\d+\.\d+)'/);
  return m ? m[1] : null;
}

/** 现场实测：真跑探针拿真值（不读任何历史常量）。 */
function measure() {
  const inv = require('./inventory.js');
  const r = inv.collect();
  return {
    refs: r.refs,
    namespaces: r.namespaces,
    members: r.members,
    deadInTestsOnly: r.deadInTestsOnly,
    dead: r.dead.length,
    uiDead: r.uiDead.length,
    dataOnly: r.dataOnly.length
  };
}

/** 从源码提取全部登记形态的站点，逐个带行号（逐个站点判断，不做全局存在性判断）。 */
function sites(src) {
  const out = [];
  const lines = src.split('\n');
  function lineOf(idx) {
    let n = 0;
    for (let i = 0; i < lines.length; i++) {
      n += lines[i].length + 1;
      if (n > idx) return i + 1;
    }
    return lines.length;
  }
  let m;
  SITE_RE_A.lastIndex = 0;
  while ((m = SITE_RE_A.exec(src)) !== null) {
    const raw = m[2];
    const field = FIELD_OF[raw];
    if (!field) continue;
    // `raw` 是**站点上的原始字段名**（如 `dead.length`），`field` 是归一化族名（如 `dead`）。
    //   回填必须用 raw 重建正则：拿族名去匹配，`dead` 会卡在 `.length` 前面而**静默 0 命中**
    //   （v2.106.0 端到端验证时发现：refs 能回填，dead/uiDead/dataOnly 三个带后缀的族永远改不动）。
    out.push({ form: 'expr', prefix: 'r' + m[1], field: field, raw: raw, value: Number(m[3]), line: lineOf(m.index) });
  }
  SITE_RE_B.lastIndex = 0;
  while ((m = SITE_RE_B.exec(src)) !== null) {
    out.push({ form: 'ledgerKeys', prefix: 'led' + m[1], field: m[2], raw: m[2], value: Number(m[3]), line: lineOf(m.index) });
  }
  return out;
}

/** 按读数族分组（同一族的全部站点必须在值上一致）。 */
function groups(src) {
  const g = {};
  sites(src).forEach(function (s) {
    (g[s.field] = g[s.field] || []).push(s);
  });
  return g;
}

/**
 * 剥掉行内注释（`//` 到行尾），字符串字面量内的 `//` 不剥。
 * 为什么必须剥：本仓的 `//` 注释里含有**未转义的括号**（实测 162 行，如 `// v2.12.0: ...
 * fresh()/checkPages() ...`）。不剥就会把整块 assert 的边界算错（越算越大），
 * 于是块内混进别的断言的数字 ⇒ 报出大量 message-mismatch 假红。
 * 这是 v2.105.0 的 D4「观察位」同族病：**判据的取样单位不等于它以为的那个单位**。
 */
function stripLineComments(src) {
  const out = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let quote = null, cut = -1;
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (quote) {
        if (c === '\\') { j++; continue; }
        if (c === quote) quote = null;
      } else if (c === "'" || c === '"' || c === '`') {
        quote = c;
      } else if (c === '/' && line[j + 1] === '/') {
        cut = j;
        break;
      }
    }
    out.push(cut >= 0 ? line.slice(0, cut) : line);
  }
  return out.join('\n');
}

/** 取源码里的 assert 调用块（括号平衡 + 字符串字面量感知 + 先剥行内注释）。 */
function assertBlocks(srcRaw) {
  const src = stripLineComments(srcRaw);
  const out = [];
  const re = /\bassert(?:DeepEq|Eq)?\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const open = src.indexOf('(', m.index);
    let i = open + 1, depth = 1;
    let quote = null;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (quote) {
        if (c === '\\') { i += 2; continue; }
        if (c === quote) quote = null;
      } else if (c === "'" || c === '"' || c === '`') {
        quote = c;
      } else if (c === '(') {
        depth++;
      } else if (c === ')') {
        depth--;
        if (depth === 0) break;
      }
      i++;
    }
    const body = src.slice(open + 1, i);
    out.push({
      text: body,
      line: src.slice(0, m.index).split('\n').length
    });
  }
  return out;
}

/** 从一段源码里抽出字符串字面量（单引号形态，本仓消息统一用单引号）。 */
function literalsOf(block) {
  const out = [];
  const re = /'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = re.exec(block)) !== null) out.push(m[1]);
  // 单引号失败时兜底试双引号（不混用，但消息里可能嵌 JSON）
  if (out.length === 0) {
    const re2 = /"((?:[^"\\]|\\.)*)"/g;
    while ((m = re2.exec(block)) !== null) out.push(m[1]);
  }
  return out;
}

/**
 * 消息文本里的数字标签 → 读数族（#6：比较值与消息文本必须同批改）。
 * 两个观察位（本仓实测得到，缺一即漏）：
 *   ① **静态头**：消息的**第一个字符串字面量**里常把读数写死一遍——`死子面 dead 454 / uiDead 4 /
 *      dataOnly 169（…注解…）`、`现场锚点（dead 454 / …`、`清册面（refs 2631 / …`。这一份副本
 *      若与比较值脱钩，正是 v2.81.0 那类假红的来源，必须查。
 *   ② **「实 …」段**：动态拼接的真值读数（`… ，实 ' + r.dead.length + …`）——只在「实 」之后取数字。
 * 反向纪律：**注解段里的 `dead +1`、`dataOnly +2` 是差量、不是绝对值**，模式必须要求「数字紧跟
 * 标签」（`+` 与数字之间没有空格），否则会把沿革注解当读数——那就是把观察位取宽的假红。
 */
const MESSAGE_LABEL = {
  refs: [/现场静态引用\s*(\d+)/, /\brefs\s+(\d+)/],
  namespaces: [/(\d+)\s*命名空间/, /命名空间\s+(\d+)/],
  members: [/(\d+)\s*成员/, /成员\s+(\d+)/],
  dead: [/\bdead\s+(\d+)/],
  uiDead: [/\buiDead\s+(\d+)/],
  dataOnly: [/\bdataOnly\s+(\d+)/],
  deadInTestsOnly: [/仅测试(?:引用)?\s*(\d+)/]
};

/** 在一个字符串里按候选模式取该族的「绝对值标签」数字（无匹配返 null）。 */
function labelValue(str, field) {
  const pats = MESSAGE_LABEL[field];
  for (let i = 0; i < pats.length; i++) {
    const m = str.match(pats[i]);
    if (m) return Number(m[1]);
  }
  return null;
}

/**
 * 消息副本的**站点清单**：块内每个字符串字面量里，该族标签上的绝对值及其**精确串**。
 * 为什么需要精确串（而不是只记数字）：回填要把消息里的数字一起改掉，而「数字」在整份源码里
 * 到处都是；只有带上标签的**整段匹配**（如 `死子面 dead 454`）才能既改到消息副本、又不误伤
 * 注解里的差量（`dead +1`）与比较值（`=== 454`）。
 */
function labelSites(src, field, opt) {
  const pats = MESSAGE_LABEL[field] || [];
  const blocks = assertBlocks(src);
  const out = [];
  // `opt.lines`：只统计**包含这些行号**的断言块。
  //   为什么必须限定：本仓的历史叙述里也有同标签的旧数字（实测 13628 行 `dead 208`、`refs 1950`、
  //   3989 行 `命名空间 120` 等）。那是**沿革记录**，不是当前读数的副本 —— 全文件扫会把它们一起回填，
  //   等于篡改历史（v2.106.0 端到端验证时发现）。口径与 messageChecks 同源：**同块内**才算副本。
  let allowed = null;
  if (opt && opt.lines && opt.lines.length) {
    allowed = {};
    opt.lines.forEach(function (ln) {
      blocks.forEach(function (b, i) {
        const next = blocks[i + 1] ? blocks[i + 1].line : Infinity;
        if (b.line <= ln && ln < next) allowed[b.line] = true;
      });
    });
  }
  blocks.forEach(function (b) {
    if (allowed && !allowed[b.line]) return;
    const textNow = stripLineComments(b.text);
    literalsOf(textNow).forEach(function (msg) {
      pats.forEach(function (re) {
        const m = msg.match(re);
        if (m) out.push({ line: b.line, str: m[0], value: Number(m[1]) });
      });
    });
  });
  return out;
}

/** 块内「消息文本数字」与「比较值」的比对（v2.81.0 假红的形态）。 */
function messageChecks(src) {
  const problems = [];
  const seen = {};
  assertBlocks(src).forEach(function (b) {
    const val = {};
    sites(b.text).forEach(function (s) {
      if (val[s.field] === undefined) val[s.field] = s.value;
    });
    if (Object.keys(val).length === 0) return;
    // 取注释剥除后的块文本（与 assertBlocks 同口径）
    const textNow = stripLineComments(b.text);
    const lits = literalsOf(textNow);
    if (lits.length === 0) return;
    const obs = [];
    obs.push({ where: '静态头', str: lits[0] });
    lits.forEach(function (msg) {
      const segs = msg.split(/实\s*/).slice(1);
      segs.forEach(function (seg) { obs.push({ where: '「实 」段', str: seg }); });
    });
    Object.keys(val).forEach(function (field) {
      obs.forEach(function (o) {
        const got = labelValue(o.str, field);
        if (got === null || got === val[field]) return;
        const key = b.line + '|' + field + '|' + got;
        if (seen[key]) return;
        seen[key] = true;
        problems.push({
          kind: 'message-mismatch',
          field: field,
          line: b.line,
          detail: '第 ' + b.line + ' 行断言：比较值 ' + field + ' = ' + val[field]
            + '，而消息' + o.where + '写的是 ' + got
        });
      });
    });
  });
  return problems;
}

/**
 * 总判据：族内同值（A）+ 等于现场实测（B）+ 消息同批（C）。
 * `opt.live` 是负控制的接缝：允许在**内存副本**上注入一份「现场读数」，好让破坏版能在不碰磁盘的
 * 前提下被同一套判据判一遍（否则负控制只能改真文件——那正是它要防的事）。
 */
function coherence(src, opt) {
  const problems = [];
  const g = groups(src);
  const live = (opt && opt.live) || measure();
  Object.keys(g).forEach(function (field) {
    const sitesOf = g[field];
    const vals = Array.from(new Set(sitesOf.map(function (s) { return s.value; })));
    if (vals.length > 1) {
      problems.push({
        kind: 'intra-drift',
        field: field,
        detail: '同一读数「' + field + '」在 ' + sitesOf.length + ' 个站点上出现 ' + vals.length
          + ' 个不同值（' + vals.join(' / ') + '）：'
          + sitesOf.map(function (s) { return s.prefix + '@' + s.line + '=' + s.value; }).join('、')
      });
      return;
    }
    if (live[field] === undefined) {
      problems.push({ kind: 'no-probe', field: field, detail: '读数「' + field + '」没有现场探针（不许只登记不测量）' });
      return;
    }
    if (vals[0] !== live[field]) {
      problems.push({
        kind: 'stale-reading',
        field: field,
        detail: '读数「' + field + '」站点写 ' + vals[0] + '，现场实测 ' + live[field]
          + '（' + sitesOf.map(function (s) { return s.prefix + '@' + s.line; }).join('、') + '）'
      });
    }
  });
  messageChecks(src).forEach(function (p) { problems.push(p); });
  return problems;
}

/**
 * #5 L1/L2：台账 version 与 index.js VERSION 同源；_note 里的版本词与 version 一致。
 * `opt.read` 是负控制的接缝（同上）：注入破坏后的台账文本，在内存里判一遍。
 */
function ledgerReport(opt) {
  const rd = (opt && opt.read) || read;
  const ver = (opt && opt.version) || versionOfIndex();
  const rows = LEDGERS.map(function (L) {
    let j = null, parseError = null;
    try {
      j = JSON.parse(rd(L.rel));
    } catch (e) {
      parseError = e.message;
    }
    const problems = [];
    if (parseError) {
      problems.push({ kind: 'unreadable', detail: L.rel + ' 无法解析：' + parseError });
      return { rel: L.rel, version: null, noteVersion: null, problems: problems };
    }
    const v = j.version || null;
    if (v !== ver) {
      problems.push({ kind: 'version-mismatch', detail: L.rel + ' version=' + v + '，index.js VERSION=' + ver });
    }
    let noteVer = null;
    if (L.hasNote) {
      const note = typeof j._note === 'string' ? j._note : '';
      // 取**最后一次**版本词：本仓台账 _note 是**追加式说明**（沿革记录），首词是历史版本
      // （reject-code-ledger 首词 v2.97.0、末词即当前版本）。取首词会把沿革当成不一致。
      const all = note.match(/v(\d+\.\d+\.\d+)/g) || [];
      noteVer = all.length ? all[all.length - 1].slice(1) : null;
      if (!noteVer) {
        problems.push({ kind: 'note-no-version', detail: L.rel + ' 的 _note 里找不到版本词（vX.Y.Z）' });
      } else if (noteVer !== v) {
        problems.push({
          kind: 'note-mismatch',
          detail: L.rel + ' _note 末次版本词 v' + noteVer + '，而 version 字段是 ' + v
        });
      }
    }
    return { rel: L.rel, version: v, noteVersion: noteVer, hasNote: L.hasNote, problems: problems };
  });
  const problems = [];
  rows.forEach(function (r) { r.problems.forEach(function (p) { problems.push(p); }); });
  return { version: ver, rows: rows, problems: problems };
}

/** 回填计划：给出每一族「从什么改成什么」（供 tools/sync-hardcoded.js 的 dry-run 显示）。 */
function backfillPlan(src) {
  const g = groups(src);
  const live = measure();
  const plan = [];
  Object.keys(g).forEach(function (field) {
    const vals = Array.from(new Set(g[field].map(function (s) { return s.value; })));
    if (live[field] === undefined) return;
    if (vals.length === 1 && vals[0] === live[field]) return;
  // 只统计**与该族站点同块**的消息副本（历史叙述里的旧数字不是副本，不许回填）
  const labels = labelSites(src, field, { lines: g[field].map(function (s) { return s.line; }) });
    plan.push({
      field: field,
      from: vals,
      to: live[field],
      sites: g[field].map(function (s) { return { prefix: s.prefix, line: s.line, value: s.value }; }),
      // 消息副本（#6）：回填必须**同批**改掉，否则改完比较值是新的、消息里还写着旧的
      labels: labels
    });
  });
  return plan;
}

/**
 * 回填：把那**一族的全部站点**一次改成同一个真值。
 * 纪律：只有「当前该族在全部站点上是同一个值」时才改写（多值 ⇒ 拒绝，先让人看清楚哪一处是错的）；
 * 用 split/join 做**全量**替换（JS 的字符串版 replace 只替换第一处——v2.105.0 的 D2 教训）。
 */
function backfill(src, field, to) {
  const g = groups(src);
  const sitesOf = g[field] || [];
  const vals = Array.from(new Set(sitesOf.map(function (s) { return s.value; })));
  if (sitesOf.length === 0) return { ok: false, reason: 'no-site', field: field };
  if (vals.length > 1) return { ok: false, reason: 'multi-value', field: field, values: vals };
  if (vals[0] === to) return { ok: false, reason: 'already', field: field, value: to };
  const from = vals[0];
  // #6：消息副本先把关——已与比较值不一致时**拒绝回填**（msg-drift）。
  //   理由与 multi-value 同：这种状态下无法知道哪个是错的；回填会「把第二个错盖在第一个错上」。
  // 只取**与该族站点同块**的消息副本（历史叙述里的旧数字不是副本，不许回填）
  const labels = labelSites(src, field, { lines: g[field].map(function (s) { return s.line; }) });
  const drift = labels.filter(function (x) { return x.value !== from; });
  if (drift.length) {
    return { ok: false, reason: 'message-drift', field: field,
      values: Array.from(new Set(drift.map(function (x) { return x.value; }))),
      lines: drift.map(function (x) { return x.line; }) };
  }
  let changed = 0;
  let labelChanged = 0;
  let next = src;
  sitesOf.forEach(function (s) {
    // 用**站点现场字段名**重建正则（族名 ≠ 字段名：dead vs dead.length）。
    const fld = s.raw || s.field;
    // 正则带 g 才是全量替换；字符串版 replace 只替换第一处（v2.105.0 的 D2 教训）。
    const re = s.form === 'ledgerKeys'
      ? new RegExp('(Object\\.keys\\(' + s.prefix + '\\.' + fld + '\\)\\.length\\s*===\\s*)' + from, 'g')
      : new RegExp('(\\b' + s.prefix + '\\.' + fld.replace(/\./g, '\\.') + '\\s*===\\s*)' + from, 'g');
    const before = next;
    next = next.replace(re, '$1' + to);
    if (next !== before) changed++;
  });
  // #6：消息副本（静态头 / 「实 」段）里的同一读数**同批**改掉。
  //   用带标签的整段精确串做全量替换（split/join）——单改数字会误伤注解里的差量。
  const uniq = Array.from(new Set(labels.map(function (x) { return x.str; })));
  uniq.forEach(function (str) {
    // 只换**数字串本身**：本模块的 7 套标签模式都只含一个数字串（逐条核过），
    // 故取第一个数字串就是该读数。**不要把前一个字符当整体前缀**——那样会连着标签一起丢掉
    // （v2.106.0 端到端验证时踩过：`dead 111` 被算成 `d222`，回填后的消息成了 `dead222` 缺前缀）。
    const to2 = str.replace(/[0-9]+/, String(to));
    if (to2 === str) return;
    const before = next;
    next = next.split(str).join(to2);
    if (next !== before) labelChanged += 1;
  });
  return { ok: changed === sitesOf.length, reason: changed === sitesOf.length ? 'ok' : 'partial',
    field: field, from: from, to: to, changed: changed, total: sitesOf.length,
    labels: uniq.length, labelChanged: labelChanged, src: next };
}

function summary() {
  const live = measure();
  return '读数族 ' + Object.keys(FIELD_OF).length + ' 态 · 现场 refs ' + live.refs
    + ' / 命名空间 ' + live.namespaces + ' / 成员 ' + live.members
    + ' · 死子面 ' + live.dead + '/' + live.uiDead + '/' + live.dataOnly + ' · 仅测试 ' + live.deadInTestsOnly;
}

function discover() {
  const src = read('tests/run.js');
  const g = groups(src);
  const led = ledgerReport();
  return {
    fields: Object.keys(g).sort(),
    siteCount: sites(src).length,
    groups: Object.keys(g).map(function (k) {
      const vals = Array.from(new Set(g[k].map(function (s) { return s.value; }))).sort();
      return { field: k, sites: g[k].length, values: vals };
    }),
    live: measure(),
    ledgerVersion: led.version,
    ledgers: led.rows.map(function (r) { return { rel: r.rel, version: r.version, noteVersion: r.noteVersion, problems: r.problems.length }; }),
    problems: coherence(src).length + led.problems.length,
    summary: summary()
  };
}

module.exports = {
  FIELD_OF: FIELD_OF,
  LEDGERS: LEDGERS,
  MESSAGE_LABEL: MESSAGE_LABEL,
  sites: sites,
  groups: groups,
  measure: measure,
  coherence: coherence,
  messageChecks: messageChecks,
  ledgerReport: ledgerReport,
  backfillPlan: backfillPlan,
  backfill: backfill,
  versionOfIndex: versionOfIndex,
  stripLineComments: stripLineComments,
  assertBlocks: assertBlocks,
  labelValue: labelValue,
  labelSites: labelSites,
  summary: summary,
  discover: discover
};
