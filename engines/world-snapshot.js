/**
 * WorldAxis engines/world-snapshot.js (v2.200.0) — 世界快照与整包搬运（计划 Y5）
 *
 * ── 它治什么（计划 Y5 立项原文，现场读数复核过）─────────────────────
 *   玩家要把一个世界（含规则 / 人物 / 地图 / 编年史 / 拍账）拿到另一台设备或另一个存档继续，
 *   目前只有两条路，**都不是「把已有世界搬过去」**：
 *     · `engines/tool-snapshot.js` —— 整张世界状态快照，`restore()` 是**替换式**
 *       （`for (const k of Object.keys(draft)) delete draft[k]`）⇒ 装到非空世界上就是
 *       「把当前世界整块抹掉换成另一份」，没有「并进来」这回事；
 *     · `engines/world-blueprint.js` —— 「**用蓝图生成世界**」（只作用于空新局，
 *       `targetEmpty()` 一票否决），蓝图里连 memory / chronicle / currents / echoes /
 *       worldFacts / chapters 都是**刻意排除**的（它的 `excluded` 逐项列了）。
 *   本仓 `bundle` / `portable` 关键词**零命中**（立项轮实测）⇒ 这是真空白，不是重构需求。
 *
 * ── 与上面两者的分工（三条边界，不重叠）────────────────────────────
 *   · **对 tool-snapshot**：它是「整块换掉」，本模块是「按面搬 + 默认不覆盖」。
 *     两个写口都留着，因为两种意图是两件事：「我要回到那一份」与「我要把那边的世界并过来」。
 *   · **对 world-blueprint**：蓝图是**可复用的种子**（无具体历史，从它生成新世界）；
 *     快照是**具体世界的照片**（带那一局的编年史 / 拍账 / 事实）。两者互转是**单向有损**，
 *     故 `toBlueprint()` 如实列出丢掉了哪些面（`dropped`），不假装无损。
 *   · **对 world-seed**：种子是有损骨架（势力 / 关系 / 地理 / 时代四张表），更远。
 *
 * ── 计划 Y5 的四条功能，逐条落到口上 ──────────────────────────────
 *   ① 世界快照（单文件、可读 JSON、带 schema 版本）—— `exportSnapshot()`；
 *   ② 导入时的兼容检查（schema 版本差 / 缺失模块 / 命名冲突）—— `checkCompat()`；
 *   ③ 导入预览（将要新增什么、覆盖什么、跳过什么）—— `previewImport()`；
 *   ④ 快照与蓝图互转 —— `toBlueprint()` / `fromBlueprint()`。
 *
 * ── 计划 Y5 的五条边界（全是否定式，逐条落到代码）───────────────────
 *   1 **导入默认不覆盖**已有键：冲突要么跳过（默认）/ 重命名（`onConflict:'rename'`）/
 *     整世界另开槽（`mode:'newslot'`）。覆盖只有显式 `overwrite:true` 才发生。
 *     为什么默认不是覆盖：覆盖是**不可逆**的那一侧，而「并进来」这个动作里
 *     最坏的结果是把本地世界写没了。默认落在可逆的一侧，代价只是「得多点一次」。
 *   2 **版本不兼容时拒绝导入并说明差异**，不做「尽力而为」的静默降级：
 *     `wsVer` 不在 `ACCEPTED` / `schemaVersion` 高于当前 / 顶层形态不对 —— 一律
 *     `ok:false` + `diff` 逐项说清差在哪。
 *   3 **不把密钥 / 宿主机密写进快照**：`SECRETS` 是一张**显式名单**，
 *     导出时整键剔除，且**逐项如实报**（`stripped`）——静默剔除 = 用户以为带上了。
 *   4 **不含无法复现的宿主状态**：面板展开态 / 上次注入 / 运行期脏字段（`__*`）
 *     一律剔除（`DROP_PREFIX`）。理由：快照的承诺是「导入后关键面逐字一致」，
 *     把宿主态带进来会让这个承诺变成「大部分一致」。
 *   5 `newslot` 模式**不写世界状态**：另开槽落在快照库（`localStorage`，不进存档）——
 *     世界事实只该有一个家，槽是「还没搬进来的行李」，那是进程外的暂存物。
 *
 * ── 计划 Y5 的四条验收，逐条对应的判据面 ──────────────────────────
 *   ① 导出→导入往返后世界关键面逐字一致（哈希对照）—— `sigOf()` + 专锁 B 组；
 *   ② 缺失模块 / 旧 schema / 冲突键三类都有拒收或预览 —— `checkCompat()` 的
 *     `unknownFaces` / `schemaAhead` / `conflicts` 三栏，各由专锁逐条驱动；
 *   ③ 导入大世界时有容量预检 —— `capacity()`（超限 `budget-exceeded`，**不静默截断**）；
 *      v2.205.0（优化 1）：判据从「读快照自报的 `bytes`」改成「**从内容复算**」——
 *      自报值可以被虚报（实测 `{bytes:1}` 配 2.2MB 内容 ⇒ 旧实现回报 `ok:true` 放行，
 *      2MB 预算形同虚设），而序列化长度是内容本身的函数、虚报不动它；
 *   ④ 损坏文件有可读错误而不是抛异常 —— `parse()` 把 JSON 解析失败收成
 *     `{ok:false, reason:'bad-json', detail}`，专锁 N 组用真源码破坏两向自证。
 *
 * ── 零新世界键（本仓口径：登记了却不在骨架里，registryParity 会当场报红）──
 *   本模块**不新增任何 `store` 顶层键**：快照库落在自己的 localStorage 键
 *   （`worldaxis_worldsnapshot_v1`），与 presetWorld / genGate / perfLedger 三条先例同规格
 *   （那些不是世界事实，不该进存档）。导入面只**改已经存在的面**，不改骨架。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const FORMAT = 1;
  const ACCEPTED = [1];
  const LIB_KEY = 'worldaxis_worldsnapshot_v1';
  const MAX_LIB = 8;
  /** 容量预检预算（字节）。超限拒收而**不截断** —— 截断会让「搬过来了」变成半句话。 */
  const MAX_BYTES = 2 * 1024 * 1024;

  // ── 面的白名单（**白名单**，不是黑名单）────────────────────────────
  //   为什么是白名单：世界面会长（本仓已 90+ 顶层键），黑名单永远跟不上，
  //   新增的面会在「整包搬运」里被**静默带上**。未点名的名字一律进 `dropped` 如实报。
  //   为什么是这些面：计划 Y5 原文点名「规则 / 人物 / 地图 / 编年史 / 拍账」，
  //   外加它们读取时所依赖的邻近面（记忆 / 事实 / 暗流 / 回声 / 势力演化 / 经济）。
  const FACES = ['people', 'world', 'evolution', 'chronicle', 'chapters',
    'beatLedger', 'beatReport', 'worldFacts', 'memory', 'currents', 'echoes',
    'economy', 'opinion', 'causal', 'bonds', 'fondness', 'inst'];
  /** 宿主机密 / 凭证类：**显式名单**，整键剔除并逐项如实报（边界 3）。 */
  const SECRETS = ['credentials', 'scripts', 'chatText', 'apiKey', 'session', 'binding', 'userlock'];
  /** 运行期脏字段前缀：带它的键一律不进快照（边界 4）。 */
  const DROP_PREFIX = '__';
  /** 无法复现的宿主态：面板展开态 / 观测量 / 上次注入 —— 名字逐个列出，不靠前缀猜。 */
  const HOST_STATE = ['lastInjection', 'nextTurnInjection', 'proactiveLastRound', 'commit'];

  const _stat = { exports: 0, imports: 0, previews: 0, refused: 0, lastReason: '', faults: {} };
  function note(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function clockNow(site) { try { return WA.clock ? WA.clock.now(site || 'worldSnapshot') : Date.now(); } catch (e) { return Date.now(); } }
  // v2.203.0 收口：裸读归因（G16 门禁冻结清单）—— 快照库读不出来的形态是 `catch (e) { return { slots: [] } }`，
  //   「库读不出来」于是与「库里真的没有快照」不可分辨（同 life / tape-store 的游标与仓库）。
  function noteRead(source, key, err) {
    try { if (WA.store && typeof WA.store.reportReadFail === 'function') WA.store.reportReadFail(source, key, err); } catch (e) {}
  }
  function state() { try { return (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || {}) : {}; } catch (e) { return {}; } }
  function deep(v) { try { return JSON.parse(JSON.stringify(v)); } catch (e) { return null; } }
  /** 世界指纹：与 world-blueprint 的 `sig()` 同法（32 位 FNV 风格散列，稳定、可复读）。 */
  function sig(s) {
    let h = 0x811c9dc5;
    const t = String(s == null ? '' : s);
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  /** 面内容的指纹（**只比内容**，不比「这一面在不在」——缺席由 counts 报）。 */
  function sigOf(faces) {
    const f = faces || {};
    const keys = Object.keys(f).sort();
    return sig(keys.map(function (k) { return k + '=' + sig(JSON.stringify(f[k])); }).join('|'));
  }
  // ── 身份引用同步(v2.211.0 优化 Q2)───────────────────────────────
  /**
   * 重命名冲突键时**按实体类型同步**的引用点表(计划原文:建立身份映射,同步内部 ID
   *   与已知跨模块引用;不做全局字符串替换)。
   *
   * 为什么必须有这张表:旧实现遇到冲突键只改对象键 —— `cur[k + '·' + sig] = inc[k]`。
   *   而本仓的取值口径是 `life.personId(name) = 'p_' + name`、`people` 的**键就是 id**。
   *   于是改名后的新对象在**任何按身份查人的地方都查不到**:真实 store 合成宿主探针
   *   实测导入返回 ok:true,而 `p_A·incoming` 内 `id` 仍为 `p_A`、导入事实的 `person`
   *   也仍为 `p_A` —— 新对象是死数据,旧身份继续被引用(同名异人就此串档)。
   *
   * 域(`domain`)三态,决定用哪一份映射:
   *   · `id`   —— people 的键与记录 `id`(规范身份,`p_` 前缀域)
   *   · `name` —— 人名域引用(本仓多数跨面引用按人名比对,如 fondness/bonds/inst)
   *   · `pair` —— 两人配对键 `A×B`(按字典序定序,A×B 与 B×A 同行)
   *
   * 边界:只改**这里声明的位置**。同名的人与地/物不会互相串 —— 全局替换正是本项要治的病。
   *   规则表**不收**未在 FACES 内的面(affect/masks/act 等不进快照,没有搬运问题)。
   */
  const IDENTITY_REFS = [
    { face: 'people', at: 'self', field: 'id', domain: 'id' },
    { face: 'people', at: 'self', field: 'name', domain: 'name' },
    { face: 'people', at: 'profile.relations', field: 'target', domain: 'name' },
    { face: 'people', at: 'profile.relationships', field: 'target', domain: 'name' },
    { face: 'people', at: 'life.commitments', field: 'target', domain: 'name' },
    { face: 'fondness', at: 'rows', field: 'person', domain: 'name' },
    // 配对键与它拆出来的两个人名必须**同批**处理:`bonds.pairKey()` 会把两人按字典序
    //   重排后拼键 ⇒ 只改 `key` 不改 `a`/`b`(或反之)会让三者指向两种顺序,
    //   下一次 `pairKey()` 算出来就与本行对不上(实测:key 已是「小满×阿澈·sig」,
    //   而 a/b 仍是「阿澈·sig / 小满」—— 同一行内部自相矛盾)。
    { face: 'bonds', at: 'rows', fields: ['key', 'a', 'b'], domain: 'pair' },
    { face: 'inst', at: 'orgs[].posts', field: 'holder', domain: 'name' }
  ];
  /** 真 UTF-8 字节数。与 `String.length`(UTF-16 code unit)**分开报** —— 中文世界两者差三倍,
   *   把 code unit 当字节报是旧口径的病(容量预检因此系统性低估)。 */
  function utf8Len(s) {
    const t = String(s == null ? '' : s);
    let n = 0;
    for (let i = 0; i < t.length; i++) {
      const c = t.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }
  /** 按 `at` 路径取出承载引用的**对象记录**列表(只认对象,不猜其它形态)。 */
  function atRecords(faceVal, at) {
    if (at === 'self') {
      if (!isObj(faceVal)) return [];
      return Object.keys(faceVal).map(function (k) { return faceVal[k]; }).filter(isObj);
    }
    const segs = String(at).split('.');
    const step = function (v, i) {
      if (i >= segs.length) {
        if (Array.isArray(v)) return v.filter(isObj);
        return isObj(v) ? [v] : [];
      }
      const seg = segs[i], arr = seg.indexOf('[]') >= 0;
      const nm = arr ? seg.slice(0, -2) : seg;
      const cur = nm ? (isObj(v) ? v[nm] : undefined) : v;
      if (arr) {
        if (!Array.isArray(cur)) return [];
        return cur.reduce(function (a, x) { return a.concat(step(x, i + 1)); }, []);
      }
      return step(cur, i + 1);
    };
    return step(faceVal, 0);
  }
  /**
   * 构造重命名计划。**纯读、确定性** —— 同一输入连调两次逐字相同,
   *   预览与执行因此**共用同一份转换计划**(计划原文:预览与执行使用同一份转换计划)。
   * @returns {ok, sigTag, rows, idMap, nameMap, conflicts, unsupported}
   */
  function buildRenamePlan(snap, opt) {
    const o = opt || {};
    const sigTag = clean((snap && snap.sig) || 'snap', 24);
    const people = (snap && isObj(snap.faces) && isObj(snap.faces.people)) ? snap.faces.people : {};
    const curPeople = isObj(state().people) ? state().people : {};
    const rows = [], idMap = {}, nameMap = {}, unsupported = [];
    Object.keys(people).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(curPeople, k)) return;   // 不冲突 ⇒ 原样并进
      const rec = people[k];
      const oldId = String(k);
      const oldName = (isObj(rec) && rec.name) ? String(rec.name) : oldId.replace(/^p_/, '');
      if (!isObj(rec)) { unsupported.push({ key: oldId, why: 'not-an-object' }); return; }
      if (rec.id !== undefined && String(rec.id) !== oldId) {
        // 记录 id 与自己的键不一致:这不是「能不能改名」,是这份数据自相矛盾。
        //   照现状改名会把这个矛盾**搬进新世界** —— 如实拒收,不硬塞(计划原文:拒收或另存新槽)。
        unsupported.push({ key: oldId, why: 'id-key-mismatch', id: String(rec.id) });
        return;
      }
      rows.push({ oldKey: oldId, newKey: oldId + '·' + sigTag, oldId: oldId, newId: oldId + '·' + sigTag,
        oldName: oldName, newName: oldName + '·' + sigTag });
      idMap[oldId] = oldId + '·' + sigTag;
      nameMap[oldName] = oldName + '·' + sigTag;
    });
    return { ok: unsupported.length === 0, sigTag: sigTag, rows: rows, idMap: idMap, nameMap: nameMap,
      conflicts: rows.length, unsupported: unsupported, refs: IDENTITY_REFS.slice() };
  }
  /**
   * 把计划落到**内存副本**上:**只同步引用**(记录内 id/name + 规则表内逐点)。
   *   **不动面键** —— 面键的改名由合并分支的 rename 处置负责(它已经会给冲突键
   *   加 `·sig` 后缀)。两处都改就会**双重改名**(实测:`p_A·sig·sig`),
   *   第三个谁都不认得的身份凭空出现,而这一条其实一次都没真正装进去。
   * @returns {faces, applied, renamed}
   */
  function applyRenamePlan(faces, plan) {
    const out = deep(faces) || {};
    const applied = [], renamed = [];
    if (!plan || !Array.isArray(plan.rows) || !plan.rows.length) return { faces: out, applied: applied, renamed: renamed };
    plan.rows.forEach(function (r) { renamed.push({ key: r.oldKey, as: r.newKey }); });
    IDENTITY_REFS.forEach(function (rule) {
      const faceVal = out[rule.face];
      if (faceVal === undefined) return;
      let n = 0;
      const froms = [];
      // `fields` 数组形态(如 bonds 的 key/a/b):**整行一起重算**,不逐字段独立改写 ——
      //   否则同一行里 key 与 a/b 会各按各的顺序落,行内自相矛盾。
      const cols = Array.isArray(rule.fields) ? rule.fields : [rule.field];
      atRecords(faceVal, rule.at).forEach(function (rec) {
        if (rule.domain === 'pair') {
          const kf = (cols.indexOf('key') >= 0) ? 'key' : cols[0];
          const kv = rec[kf];
          if (typeof kv !== 'string') return;
          const parts = kv.split('×');
          if (parts.length !== 2) return;
          const a0 = plan.nameMap[parts[0]] || parts[0], b0 = plan.nameMap[parts[1]] || parts[1];
          const pair = [a0, b0].sort();
          if (rec[kf] === pair.join('×')) return;
          froms.push(kv);
          rec[kf] = pair.join('×');
          if (cols.indexOf('a') >= 0) rec.a = pair[0];
          if (cols.indexOf('b') >= 0) rec.b = pair[1];
          n++;
          return;
        }
        cols.forEach(function (f) {
          const v = rec[f];
          if (typeof v !== 'string') return;
          let nv = null;
          if (rule.domain === 'id') nv = plan.idMap[v] || null;
          else if (rule.domain === 'name') nv = plan.nameMap[v] || null;
          if (nv === null || nv === v) return;
          rec[f] = nv; n++;
          if (froms.indexOf(v) < 0) froms.push(v);
        });
      });
      if (n) applied.push({ face: rule.face, at: rule.at,
        field: Array.isArray(rule.fields) ? rule.fields.join('+') : rule.field, n: n, froms: froms.slice(0, 6) });
    });
    return { faces: out, applied: applied, renamed: renamed };
  }

  // ── 剔除：秘密 / 宿主态 / 脏字段 ──────────────────────────────────
  /** 逐层剔除脏字段（与 tool-snapshot 的 `sanitize` 同口径，但**多收一份账**）。 */
  function scrub(node, book) {
    if (Array.isArray(node)) return node.map(function (x) { return scrub(x, book); });
    if (node && typeof node === 'object') {
      const out = {};
      for (const k of Object.keys(node)) {
        if (k.indexOf(DROP_PREFIX) === 0) { book.dropped.push(k); continue; }
        out[k] = scrub(node[k], book);
      }
      return out;
    }
    return node;
  }
  /** 挑面：白名单 + 秘密剔除 + 宿主态剔除，三条都记账（不静默）。 */
  function pickFaces(s, want) {
    const book = { dropped: [], stripped: [], skippedHost: [] };
    const names = (Array.isArray(want) && want.length) ? want : FACES.slice();
    const faces = {}, missing = [];
    names.forEach(function (k) {
      const key = clean(k, 40);
      if (!key) return;
      if (SECRETS.indexOf(key) >= 0) { book.stripped.push(key); return; }
      if (HOST_STATE.indexOf(key) >= 0) { book.skippedHost.push(key); return; }
      if (!Object.prototype.hasOwnProperty.call(s, key)) { missing.push(key); return; }
      const v = deep(s[key]);
      faces[key] = scrub(v === null ? s[key] : v, book);
    });
    // 账面收口：白名单只决定「面」进不进快照，而「本局的密钥 / 宿主态 / 脏字段
    //   被剔掉了哪些」必须按**世界实际有的键**报 —— 否则白名单下这两张名单永远报空，
    //   玩家会以为「我库里没有凭证」。（首跑实测踩到：`credentials` 不在 FACES 里，
    //   于是 SECRETS 那条分支永不触发、`stripped` 恒为 []。）
    Object.keys(s || {}).forEach(function (k) {
      if (SECRETS.indexOf(k) >= 0) { if (book.stripped.indexOf(k) < 0) book.stripped.push(k); return; }
      if (HOST_STATE.indexOf(k) >= 0) { if (book.skippedHost.indexOf(k) < 0) book.skippedHost.push(k); return; }
      if (k.indexOf(DROP_PREFIX) === 0 && book.dropped.indexOf(k) < 0) book.dropped.push(k);
    });
    book.dropped = book.dropped.filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(0, 24);
    book.stripped = book.stripped.filter(function (x, i, a) { return a.indexOf(x) === i; });
    book.skippedHost = book.skippedHost.filter(function (x, i, a) { return a.indexOf(x) === i; });
    return { faces: faces, missing: missing, book: book };
  }
  function countsOf(faces) {
    const f = faces || {};
    const num = function (v) { return Array.isArray(v) ? v.length : (isObj(v) ? Object.keys(v).length : 0); };
    return { faces: Object.keys(f).length, people: num(f.people), chronicle: num(f.chronicle),
      facts: num(f.worldFacts), ledger: num(f.beatLedger && f.beatLedger.rows),
      chapters: num(f.chapters && f.chapters.history), factions: num(f.evolution && f.evolution.factions) };
  }
  function worldKeyOf(s) {
    try { if (WA.worldBridge && typeof WA.worldBridge.worldKey === 'function') return String(WA.worldBridge.worldKey() || ''); } catch (e) { }
    return sig(JSON.stringify((s.evolution && s.evolution.factions || []).map(function (f) { return f && f.name; })));
  }

  // ── ① 导出 ──────────────────────────────────────────────────────
  /**
   * 出一个世界快照。**纯读**（零 store 写、零 localStorage 写）。
   * @param {object} [opt] { faces: string[], label: string }
   * @returns {ok, snapshot, sig, counts, dropped, stripped, skippedHost} 或 {ok:false, reason}
   */
  function exportSnapshot(opt) {
    const o = opt || {};
    const s = state();
    if (!s || !Object.keys(s).length) { note('empty-world'); return { ok: false, reason: 'empty-world' }; }
    const p = pickFaces(s, o.faces);
    if (!Object.keys(p.faces).length) { note('empty-snapshot'); return { ok: false, reason: 'empty-snapshot', missing: p.missing }; }
    const snap = {
      wsVer: FORMAT,
      at: clockNow('worldSnapshot.export'),
      schemaVersion: Number(s.schemaVersion || 1),
      chatLabel: clean(o.label || (s.clock && s.clock.label) || '', 60),
      worldKey: worldKeyOf(s),
      faces: p.faces,
      sig: sigOf(p.faces)
    };
    snap.bytes = JSON.stringify(snap).length;
    _stat.exports++; _stat.lastReason = 'exported';
    return { ok: true, snapshot: snap, sig: snap.sig, bytes: snap.bytes,
      counts: countsOf(p.faces), missing: p.missing,
      dropped: p.book.dropped, stripped: p.book.stripped, skippedHost: p.book.skippedHost,
      note: '秘密类键（' + SECRETS.join('/') + '）与宿主态（' + HOST_STATE.join('/') + '）已剔除并逐项报出。' };
  }
  /** 出可读 JSON 文本（缩进 2）。 */
  function toJSON(opt) {
    const r = exportSnapshot(opt);
    if (!r.ok) return r;
    return { ok: true, text: JSON.stringify(r.snapshot, null, 2), bytes: r.bytes, counts: r.counts, sig: r.sig };
  }
  /** 解析：字符串 / 对象都收 —— **坏文件给可读错误，不抛异常**（验收 ④）。 */
  function parse(raw) {
    let data = raw;
    if (typeof raw === 'string') {
      try { data = JSON.parse(raw); }
      catch (e) { return { ok: false, reason: 'bad-json', detail: String((e && e.message) || e).slice(0, 160) }; }
    }
    if (!isObj(data)) return { ok: false, reason: 'bad-shape', detail: '快照顶层不是对象' };
    if (!isObj(data.faces)) return { ok: false, reason: 'bad-shape', detail: '快照缺少 faces 对象' };
    return { ok: true, snapshot: data };
  }

  // ── ② 兼容检查 ─────────────────────────────────────────────────
  /**
   * 导入前的兼容检查：**不写任何东西**，只回答「这份快照能不能装、差在哪」。
   * 三条判据逐条出自计划原文：schema 版本差 / 缺失模块 / 命名冲突。
   */
  function checkCompat(raw) {
    const p = parse(raw);
    if (!p.ok) { note(p.reason); return { ok: false, reason: p.reason, detail: p.detail, blocking: true }; }
    const snap = p.snapshot;
    const s = state();
    const ver = Number(snap.wsVer);
    const diff = { snapshotVer: snap.wsVer, accepted: ACCEPTED.slice(),
      snapshotSchema: Number(snap.schemaVersion || 0), currentSchema: Number(s.schemaVersion || 1),
      unknownFaces: [], conflicts: [], absent: [] };
    // ① 格式版本
    if (!ACCEPTED.length || ACCEPTED.indexOf(ver) < 0) {
      note('bad-snapshot-ver');
      return { ok: false, reason: 'bad-snapshot-ver', blocking: true, diff: diff,
        detail: '快照格式 ' + (snap.wsVer === undefined ? '(缺 wsVer)' : snap.wsVer) + ' 不在受支持面 ' + ACCEPTED.join('/') };
    }
    // ② schema 版本差（快照比当前新 ⇒ 拒收；比当前旧 ⇒ 放行但**如实标注**）
    if (diff.snapshotSchema > diff.currentSchema) {
      note('schema-ahead');
      return { ok: false, reason: 'schema-ahead', blocking: true, diff: diff,
        detail: '快照存档 schema ' + diff.snapshotSchema + ' 高于当前 ' + diff.currentSchema };
    }
    // ③ 缺失模块 / 命名冲突（逐面判，两条都进 diff，不合并成一栏）
    Object.keys(snap.faces).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(s, k)) {
        // 面名在此世界**根本不存在** —— 这不是「空」，是「这个模块不在这局里」。
        //   静默装进去等于凭空造一个骨架里没有的键（registryParity 会报「未在骨架物化」）。
        diff.unknownFaces.push(k);
        return;
      }
      const inc = snap.faces[k], cur = s[k];
      if (isObj(inc) && isObj(cur)) {
        const dup = Object.keys(inc).filter(function (kk) { return Object.prototype.hasOwnProperty.call(cur, kk); });
        if (dup.length) diff.conflicts.push({ face: k, keys: dup.slice(0, 12), n: dup.length });
      } else if (Array.isArray(inc) && Array.isArray(cur) && cur.length) {
        // 数组面（编年史 / 事实 / 拍账…）：冲突判据是**有没有东西**，不是逐元素比 ——
        //   逐元素比会把「同一条在不同局里长得一样」误判成不冲突（id 是局内生成的）。
        diff.conflicts.push({ face: k, keys: ['(数组面非空)'], n: cur.length, array: true });
      }
    });
    const blocking = diff.unknownFaces.length > 0;
    return { ok: !blocking, reason: blocking ? 'unknown-faces' : 'compatible',
      blocking: blocking, diff: diff, sig: snap.sig || sigOf(snap.faces),
      counts: countsOf(snap.faces), bytes: Number(snap.bytes || JSON.stringify(snap).length) };
  }

  // ── ③ 导入预览 ─────────────────────────────────────────────────
  /**
   * 预览：将要**新增什么 / 冲突什么 / 跳过什么**。**纯读**（零写入）。
   * @param {object|string} raw 快照
   * @param {object} [opt] { overwrite: boolean, onConflict: 'skip'|'rename', mode: 'merge'|'newslot' }
   */
  function previewImport(raw, opt) {
    const o = opt || {};
    const cc = checkCompat(raw);
    _stat.previews++;
    if (cc.blocking) {
      return { ok: false, reason: cc.reason, detail: cc.detail, diff: cc.diff,
        willAdd: [], willOverwrite: [], willSkip: [], willRename: [], blocked: true };
    }
    const snap = parse(raw).snapshot;
    const s = state();
    const mode = (o.mode === 'newslot') ? 'newslot' : 'merge';
    const overwrite = o.overwrite === true;
    const rename = (o.onConflict === 'rename');
    // v2.211.0(优化 Q2):改名计划在预览里算一次 —— 与导入侧 buildRenamePlan **同一份**算法。
    const renamePlan = (rename && mode === 'merge') ? buildRenamePlan(snap, o) : null;
    if (renamePlan && !renamePlan.ok) {
      return { ok: false, reason: 'rename-unsupported', blocked: true, detail: renamePlan.unsupported,
        hint: '这些条目的 id 与自身键不一致:改名会把这份矛盾搬进新世界。请修正导出源,或改用 overwrite / skip。',
        willAdd: [], willOverwrite: [], willSkip: [], willRename: [] };
    }
    const refSync = renamePlan ? applyRenamePlan(snap.faces, renamePlan).applied : [];
    const add = [], over = [], skip = [], ren = [];
    const confMap = {};
    (cc.diff.conflicts || []).forEach(function (c) { confMap[c.face] = c; });
    Object.keys(snap.faces).forEach(function (face) {
      const c = confMap[face];
      if (!c) { add.push({ face: face, n: faceSize(snap.faces[face]) }); return; }
      if (mode === 'newslot') { add.push({ face: face, n: faceSize(snap.faces[face]), note: '另开槽：不碰当前世界' }); return; }
      if (overwrite) {
        // 数组面（编年史 / 事实 / 拍账…）的「覆盖」是**整面替换**：本地那一整卷被换掉，
        //   不是逐键改。预览必须说清是哪一种 —— 两种处置在结果上天差地别。
        over.push(c.array
          ? { face: face, n: faceSize(snap.faces[face]), replaced: c.n, note: '整面替换（本地 ' + c.n + ' 条被替换）' }
          : { face: face, n: c.n });
        return;
      }
      if (rename) {
        // v2.211.0(优化 Q2):改名的读数**按实算的计划报** —— 「键改了、引用没跟上」正是
        //   本项要治的病,故同屏给出「几条要改名 · 几处引用会跟着改」并附引用面明细。
        ren.push({ face: face, as: face + '·' + (snap.sig || 'snap'), n: c.n,
          refs: refSync.filter(function (x) { return x.face === face; }),
          refsTotal: refSync.reduce(function (a, x) { return a + x.n; }, 0) });
        return;
      }
      if (c.array) {
        // v2.205.0（优化 1）：数组面的默认支**不是「跳过」**，而是「并进不重复的条目」
        //   （按 JSON 逐字去重）。旧预览一律报「将要跳过（冲突保留）」，与真结果
        //   不同源 —— 玩家看到「跳过」以为本地那卷没被碰，实际已经被并进了新条目。
        //   这里按**与导入侧同一套算法**复算，两处读数逐字对得上。
        const curArr = Array.isArray(s[face]) ? s[face] : [];
        const seen = {};
        curArr.forEach(function (x) { seen[sig(JSON.stringify(x))] = true; });
        let addN = 0, dupN = 0;
        (Array.isArray(snap.faces[face]) ? snap.faces[face] : []).forEach(function (x) {
          const h = sig(JSON.stringify(x));
          if (seen[h]) { dupN++; return; }
          seen[h] = true; addN++;
        });
        if (addN) add.push({ face: face, n: addN, note: '并进不重复的条目（本地已有的不重复追加）' });
        if (dupN) skip.push({ face: face, n: dupN, added: addN, why: 'conflict-kept' });
        return;
      }
      skip.push({ face: face, n: c.n, why: 'conflict-kept' });
    });
    const cap = capacity(snap);
    return { ok: true, mode: mode, overwrite: overwrite, onConflict: rename ? 'rename' : 'skip',
      willAdd: add, willOverwrite: over, willSkip: skip, willRename: ren,
      // v2.211.0(优化 Q2):引用同步**预览同屏** —— 与导入侧同一份计划/同一套引用面。
      renamePlan: renamePlan ? { conflicts: renamePlan.conflicts, sigTag: renamePlan.sigTag, rows: renamePlan.rows } : null,
      refSync: refSync,
      refsTotal: refSync.reduce(function (a, x) { return a + x.n; }, 0),
      unknownFaces: cc.diff.unknownFaces.slice(), bytes: cap.bytes, budget: cap.budget,
      capacityOk: cap.ok, capacityReason: cap.reason || '', capacityUnit: cap.seen && cap.seen.unit,
      sig: snap.sig || sigOf(snap.faces), counts: countsOf(snap.faces) };
  }
  function faceSize(v) { return Array.isArray(v) ? v.length : (isObj(v) ? Object.keys(v).length : 0); }
  /** 容量预检：超预算拒收（**不截断** —— 截断会让「搬过来了」变成半句话）。 */
  function capacity(snap) {
    // v2.205.0（优化 1）：**不复信自报值**。判据 = max(实际序列化长度, 自报值)：
    //   · 实际长度由内容算出，虚报小不了（旧实现只读 `snap.bytes`，`{bytes:1}` + 2.2MB
    //     内容能整包绕过 2MB 预算 —— 探针实测旧实现回报 `{ok:true, bytes:1}`）；
    //   · 自报比实际大（自称很大）同样拒 —— 体积**不可低估**，两者任一超预算即拒收；
    //   · 两个数都如实报答（`declared` / `actual` / `mismatch`）：对不上就是事实，
    //     不该只回一个被信过的数（那正是「读不出」与「真没事」不可分的同一种病）。
    const actual = snap ? JSON.stringify(snap).length : 0;
    const declared = (snap && snap.bytes !== undefined && snap.bytes !== null
      && isFinite(Number(snap.bytes))) ? Number(snap.bytes) : null;
    const bytes = (declared === null) ? actual : Math.max(actual, declared);
    // v2.211.0(优化 Q2):容量口径**三档分开报**(计划原文:区分字符、UTF-8 与宿主估计)。
    //   旧口径只给 `JSON.stringify(...).length` 一个数,连单位都没写 —— 那是 UTF-16
    //   code unit 数,不是字符数也不是字节数;中文世界里同一份内容三者能差三倍,
    //   玩家按「字节」理解它必然误判余量。此处把三个数摆在一起,哪个超标一目了然。
    const text = snap ? JSON.stringify(snap) : '';
    const unit = {
      codeUnits: actual,                 // String.length(旧口径,保留以免读数断裂)
      chars: Array.from(text).length,    // 真字符数(按码点计,emoji/罕用字不再算两个)
      utf8Bytes: utf8Len(text),          // 真 UTF-8 字节数(落盘/传输的实际体积)
      // 宿主估计:**localStorage 配额按 UTF-16 code unit × 2 字节计费**(主流浏览器同一口径)。
      //   它与 codeUnits 只差一个 2 倍,却正是「玩家看余量」时比的那个数 —— 不给它,
      //   消费侧就得自己乘 2,迟早有人乘漏(与「一件事一个读口」同规)。
      hostEstimate: actual * 2
    };
    const seen = { declared: declared, actual: actual, unit: unit,
      mismatch: (declared !== null && declared !== actual) };
    if (bytes > MAX_BYTES) {
      note('budget-exceeded');
      return { ok: false, reason: 'budget-exceeded', bytes: bytes, budget: MAX_BYTES, seen: seen };
    }
    return { ok: true, bytes: bytes, budget: MAX_BYTES, seen: seen };
  }

  // ── ④ 快照与蓝图互转 ────────────────────────────────────────────
  /**
   * 快照 → 蓝图：**单向有损**。丢掉的面逐项列出（`dropped`），不假装无损。
   *   为什么要它：蓝图是可复用的「种子」（能反复开新局），快照是「照片」（只对应那一局）。
   *   把照片另存成种子是常见诉求，但**带历史的部分进不去**（蓝图没有承载它的字段）。
   */
  function toBlueprint(raw) {
    const p = parse(raw);
    if (!p.ok) { note(p.reason); return { ok: false, reason: p.reason, detail: p.detail }; }
    if (!WA.worldBlueprint || typeof WA.worldBlueprint.exportBlueprint !== 'function') {
      note('module-missing'); return { ok: false, reason: 'module-missing', detail: 'worldBlueprint 缺席' };
    }
    // 只搬「能从快照面反推蓝图字段」的那部分：本模块**不自己重写一份映射**，
    //   蓝图字段的语义归 world-blueprint，这里只把面原样交给它去读（它是唯一真源）。
    const dropped = Object.keys(p.snapshot.faces).filter(function (k) {
      return ['chronicle', 'chapters', 'beatLedger', 'beatReport', 'currents', 'echoes', 'worldFacts'].indexOf(k) >= 0;
    });
    const bp = WA.worldBlueprint.exportBlueprint({ keep: 'structure' });
    if (!bp || bp.ok !== true) {
      return { ok: false, reason: (bp && bp.reason) || 'blueprint-refused', detail: '蓝图导出面拒收：本局结构面为空或不完整' };
    }
    _stat.lastReason = 'to-blueprint';
    return { ok: true, blueprint: bp.blueprint, bpSig: bp.bpSig, fromSig: p.snapshot.sig || sigOf(p.snapshot.faces),
      dropped: dropped, lossy: true,
      note: '单向有损：编年史 / 章节 / 拍账 / 暗流 / 回声 / 世界事实六类不承载在蓝图里（它没有这些字段）。' };
  }
  /**
   * 蓝图 → 快照：把蓝图的**结构面**包成快照形态（faces.people / faces.world / faces.evolution）。
   *   为什么也标 lossy：蓝图里没有历史，出来的快照自然也没有 —— 这一点必须写在回执里，
   *   否则用户会以为「蓝图里本来就记着编年史，只是我没看见」。
   */
  function fromBlueprint(bpIn) {
    if (!isObj(bpIn)) { note('bad-shape'); return { ok: false, reason: 'bad-shape', detail: '蓝图不是对象' }; }
    const ids = isObj(bpIn.ids) ? bpIn.ids : {};
    const people = {};
    (Array.isArray(ids.people) ? ids.people : []).forEach(function (r, i) {
      if (!isObj(r)) return;
      const key = clean(r.key || ('bp_' + i), 60);
      if (!key) return;
      // v2.203.0 收口：建人点**必须带淘汰排序键**（evict-meta C2b）——
      //   与 world-blueprint.js 的 fallback 建人点同款。缺键的后果不是「少一格」：
      //   容器满时它因排序键缺失被**优先挤出**（刚搬进来的世界先掉人）。
      people[key] = { id: key, name: clean(r.name || key, 40), fromBlueprint: true,
        createdAt: clockNow('worldSnapshot.fromBlueprint.person'),
        updatedAt: clockNow('worldSnapshot.fromBlueprint.person') };
    });
    const places = (Array.isArray(ids.places) ? ids.places : []).map(function (r) {
      return isObj(r) ? { name: clean(r.name || r.key, 40), key: clean(r.key, 60) } : null;
    }).filter(Boolean);
    const roads = (Array.isArray(bpIn.roads) ? bpIn.roads : []).map(function (r) {
      return isObj(r) ? { a: clean(r.a, 60), b: clean(r.b, 60) } : null;
    }).filter(function (r) { return r && r.a && r.b; });
    const factions = (Array.isArray(ids.powers) ? ids.powers : []).map(function (r) {
      return isObj(r) ? { name: clean(r.name || r.key, 40) } : null;
    }).filter(Boolean);
    const faces = {
      people: people,
      world: { places: places, roads: roads },
      evolution: { factions: factions, round: 0, events: [], winds: [], trends: [], enemies: [] }
    };
    _stat.lastReason = 'from-blueprint';
    return { ok: true, snapshot: { wsVer: FORMAT, at: clockNow('worldSnapshot.fromBlueprint'),
      schemaVersion: Number((state().schemaVersion) || 1), chatLabel: '', worldKey: String(bpIn.worldKey || ''),
      faces: faces, sig: sigOf(faces), bytes: JSON.stringify(faces).length },
      lossy: true, dropped: ['chronicle', 'chapters', 'beatLedger', 'beatReport', 'memory', 'worldFacts'],
      note: '蓝图只有结构面（人物 / 势力 / 地名 / 道路）：编年史 / 章节 / 拍账 / 记忆 / 世界事实**本就不在里面**，故出来的快照也没有。' };
  }

  // ── 导入（有写口：merge 才动世界状态）─────────────────────────────
  /**
   * 导入。三种模式：
   *   · `merge`（默认）：把快照的面并进当前世界。**默认不覆盖**冲突键 ——
   *     冲突按 `onConflict` 处置：`skip`（默认，逐项报）/ `rename`（改名进来）；
   *   · `newslot`：**不碰当前世界**，把快照原样存进快照库（localStorage）。
   * 唯一的写入通道是 `store.transact`（merge）或快照库（newslot），没有第三条。
   */
  function importSnapshot(raw, opt) {
    const o = opt || {};
    const pv = previewImport(raw, o);
    if (pv.blocked) { note(pv.reason); return { ok: false, reason: pv.reason, detail: pv.detail, diff: pv.diff }; }
    if (!pv.capacityOk) { return { ok: false, reason: pv.capacityReason, bytes: pv.bytes, budget: pv.budget }; }
    const snap = parse(raw).snapshot;
    if (pv.mode === 'newslot') {
      const put = libPut(snap, o);
      if (!put.ok) return put;
      _stat.imports++; _stat.lastReason = 'newslot';
      return { ok: true, mode: 'newslot', slot: put.slot, bytes: pv.bytes, sig: pv.sig,
        note: '存进快照库（localStorage），当前世界**一格未动**。要装进世界请用 merge 或在空世界上装载。' };
    }
    if (!WA.store || typeof WA.store.transact !== 'function') { note('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    const overwrite = o.overwrite === true;
    const rename = (o.onConflict === 'rename');
    // v2.211.0(优化 Q2):**改名不是「只换个键」**。本仓 `people` 的键就是身份
    //   (`life.personId(name) = 'p_' + name`),而跨面引用按人名/id 落点比对 —— 只换键
    //   会让新对象在任何按身份查人的地方都查不到(死数据 + 旧身份继续被引用 = 串档)。
    //   故:先按身份映射算出**计划**(纯读、确定性),再按同一份计划执行 —— 预览与执行同源。
    const plan = rename ? buildRenamePlan(snap, o) : null;
    const refSync = [];
    let facesIn = snap.faces;
    if (rename && plan) {
      if (!plan.ok) {
        // 数据自相矛盾(id 与自身键不一致):**不半改** —— 如实拒收,原档不动。
        note('rename-unsupported');
        return { ok: false, reason: 'rename-unsupported', detail: plan.unsupported,
          hint: '这些条目的 id 与自身键不一致:改名会把这份矛盾搬进新世界。请修正导出源,或改用 overwrite / skip。' };
      }
      const at = applyRenamePlan(snap.faces, plan);
      facesIn = at.faces;
      at.applied.forEach(function (x) { refSync.push(x); });
    }
    // 逐面合并的结果账(**部分成功是真结论**:谎报「全装上了」会让用户以为某面搬过来了)
    const added = [], overwritten = [], skipped = [], renamed = [];
    const sigTag = plan ? plan.sigTag : clean((snap.sig || 'snap'), 24);
    /** 数组面:按 JSON 逐字去重后追加(预览与导入同一套算法)。 */
    const appendUniq = function (cur, inc) {
      const seen = {};
      cur.forEach(function (x) { seen[sig(JSON.stringify(x))] = true; });
      let n = 0, dup = 0;
      inc.forEach(function (x) {
        const h = sig(JSON.stringify(x));
        if (seen[h]) { dup++; return; }
        seen[h] = true; cur.push(x); n++;
      });
      return { n: n, dup: dup };
    };
    /**
     * 改名模式的**递归合并**(v2.211.0 优化 Q2)。旧实现把冲突键整棵子树搬到
     *   `键·sig` 下 —— 对 `people` 这种「键即身份」的面是对的,对 `fondness`
     *   这种「面里套子结构」的面就是灾难:整个 `rows` 卷被复制成 `rows·sig`,
     *   本地那份与新来的那份**各自独立**,引用还对不上(探针实测)。
     *   现口径:身份键(仅 people 顶层)加后缀;嵌套对象**下潜**;数组**去重追加**;
     *   其余标量冲突如实保留并记账。
     */
    const mergeRename = function (cur, inc, face, path) {
      Object.keys(inc).forEach(function (k) {
        const at = path ? path + '.' + k : k;
        if (!Object.prototype.hasOwnProperty.call(cur, k)) { cur[k] = inc[k]; return; }
        const cv = cur[k], iv = inc[k];
        if (face === 'people' && !path) {
          const as = k + '·' + sigTag;
          if (Object.prototype.hasOwnProperty.call(cur, as)) {
            skipped.push({ face: face, key: k, as: as, why: 'rename-collision' });
            return;
          }
          cur[as] = iv;
          renamed.push({ face: face, key: k, as: as });
          return;
        }
        if (isObj(cv) && isObj(iv)) { mergeRename(cv, iv, face, at); return; }
        if (Array.isArray(cv) && Array.isArray(iv)) {
          const r = appendUniq(cv, iv);
          if (r.n) added.push({ face: face, at: at, n: r.n, note: '并进不重复的条目' });
          if (r.dup) skipped.push({ face: face, at: at, n: r.dup, why: 'conflict-kept' });
          return;
        }
        if (cv == null && iv) { cur[k] = iv; return; }   // 本地是空位(未设字段)⇒ 并进,不是冲突
        skipped.push({ face: face, key: at, why: 'conflict-kept' });
      });
    };
    const tx = WA.store.transact(function (draft) {
      Object.keys(facesIn).forEach(function (face) {
        const inc = deep(facesIn[face]);
        if (!Object.prototype.hasOwnProperty.call(draft, face)) { skipped.push({ face: face, why: 'unknown-face' }); return; }
        const cur = draft[face];
        if (rename && isObj(inc) && isObj(cur)) { mergeRename(cur, inc, face, ''); return; }
        if (isObj(inc) && isObj(cur)) {
          const dup = Object.keys(inc).filter(function (k) { return Object.prototype.hasOwnProperty.call(cur, k); });
          if (!dup.length) {
            Object.keys(inc).forEach(function (k) { cur[k] = inc[k]; });
            added.push({ face: face, n: Object.keys(inc).length }); return;
          }
          if (overwrite) {
            Object.keys(inc).forEach(function (k) { cur[k] = inc[k]; });
            overwritten.push({ face: face, n: dup.length }); return;
          }
          if (rename) {
            Object.keys(inc).forEach(function (k) {
              if (!Object.prototype.hasOwnProperty.call(cur, k)) { cur[k] = inc[k]; return; }
              const as = k + '·' + (snap.sig || 'snap');
              if (Object.prototype.hasOwnProperty.call(cur, as)) {
                // v2.211.0(优化 Q2):**二次撞名** —— 本地早有一份带同标记的副本。
                //   旧实现继续叠后缀(`k·sig·sig`),造出第三个谁都不认得的身份,
                //   而这一条其实**没装进去**。如实记一条,本地原样不动。
                skipped.push({ face: face, key: k, as: as, why: 'rename-collision' });
                return;
              }
              cur[as] = inc[k];
            });
            renamed.push({ face: face, n: dup.length });
            return;
          }
          // 默认支：**只并进不冲突的那些键**，冲突键原地不动（逐项报）
          let n = 0;
          Object.keys(inc).forEach(function (k) {
            if (Object.prototype.hasOwnProperty.call(cur, k)) return;
            cur[k] = inc[k]; n++;
          });
          skipped.push({ face: face, n: dup.length, added: n, why: 'conflict-kept' });
          return;
        }
        if (Array.isArray(inc) && Array.isArray(cur)) {
          if (!cur.length) {
            // 本地那一卷是空的 ⇒ 这一面是**新增**，不是替换（旧实现在这种局上
            //   会把 `replaced: 0` 的「已覆盖」报出去 —— 处置名与实际不符）。
            inc.forEach(function (x) { cur.push(x); });
            added.push({ face: face, n: inc.length });
            return;
          }
          if (overwrite) {
            // v2.205.0（优化 1）：覆盖 = **整面替换**。旧实现把「覆盖」写成 push 追加，
            //   于是勾了覆盖之后本地旧条目仍在（探针实测：预检说 willOverwrite，
            //   结果 `actual` 是 [{旧},{新}] 两批并存）—— 预检的语义与执行的结果不符，
            //   比不报还糟：玩家按预检做的决定会落空。
            const before = cur.length;
            cur.length = 0;
            inc.forEach(function (x) { cur.push(x); });
            overwritten.push({ face: face, n: inc.length, replaced: before, why: 'array-replaced' });
            return;
          }
          // 数组面不覆盖：**不重复追加**（按 JSON 逐字去重）。
          //   v2.205.0（优化 1）：账目与预览**同源** —— 并进记「已新增」、重复记
          //   「已跳过」，两者皆无才兜底一笔。旧实现无条件往「已跳过」栏里写一笔
          //   （`n:0, added:2`），于是「跳过 0 条」出现在跳过栏，而真发生的事是
          //   「并进 2 条」—— 栏名与事实不符，与预览的读数也对不上。
          const seen = {};
          cur.forEach(function (x) { seen[sig(JSON.stringify(x))] = true; });
          let n = 0, dup = 0;
          inc.forEach(function (x) {
            const h = sig(JSON.stringify(x));
            if (seen[h]) { dup++; return; }
            seen[h] = true; cur.push(x); n++;
          });
          if (n) added.push({ face: face, n: n, note: '并进不重复的条目' });
          if (dup) skipped.push({ face: face, n: dup, added: n, why: 'conflict-kept' });
          if (!n && !dup) skipped.push({ face: face, n: 0, added: 0, why: 'conflict-kept' });
          return;
        }
        // 形态不同（快照是对象、本地是数组，或反之）：**不硬塞**，如实报
        if (overwrite) { draft[face] = inc; overwritten.push({ face: face, n: faceSize(inc) }); }
        else skipped.push({ face: face, why: 'shape-mismatch' });
      });
    }, 'worldSnapshot:import');
    if (!tx || tx.ok === false) {
      note('write-failed');
      return { ok: false, reason: 'write-failed', detail: String((tx && tx.error && tx.error.message) || '未知') };
    }
    _stat.imports++;
    _stat.lastReason = (overwritten.length || renamed.length) ? 'partial' : 'imported';
    return { ok: true, mode: 'merge', added: added, overwritten: overwritten,
      skipped: skipped, renamed: renamed,
      // v2.211.0(优化 Q2):改名进世界时,「同步了哪些身份引用」必须同屏 ——
      //   这正是本项治的病(旧实现只报「改了多少条」,引用跟没跟上无从得知)。
      refSync: refSync, refsTotal: refSync.reduce(function (a, x) { return a + x.n; }, 0),
      partial: skipped.length > 0 || overwritten.length > 0,
      sig: snap.sig, counts: countsOf(snap.faces), nested: !!(tx && tx.deferred === true),
      note: '默认不覆盖:冲突键按 onConflict 处置(默认 skip)。写路径唯一:store.transact。' };
  }
  /** 导出→导入往返的**同源对照**：关键面哈希（验收 ①）。 */
  function roundTrip(snapIn, facesIn) {
    const p = parse(snapIn);
    if (!p.ok) { note(p.reason); return { ok: false, reason: p.reason, detail: p.detail }; }
    const s = state();
    const names = (Array.isArray(facesIn) && facesIn.length) ? facesIn : Object.keys(p.snapshot.faces);
    const live = {}, dead = [];
    names.forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(s, k)) { dead.push(k); return; }
      live[k] = s[k];
    });
    const a = sigOf(p.snapshot.faces);
    const b = sigOf(live);
    return { ok: a === b, snapshotSig: a, liveSig: b, compared: Object.keys(live).length, absent: dead };
  }

  // ── 快照库（localStorage，**不进世界状态**）──────────────────────
  function lsGet() {
    try { const raw = window.localStorage.getItem(LIB_KEY); return raw ? JSON.parse(raw) : { ver: FORMAT, slots: [] }; }
    catch (e) { noteRead('worldSnapshot', LIB_KEY, e); return { ver: FORMAT, slots: [] }; }
  }
  function lsSet(v) {
    try { window.localStorage.setItem(LIB_KEY, JSON.stringify(v)); return { ok: true }; }
    catch (e) { return { ok: false, reason: 'ls-write-failed' }; }
  }
  function libPut(snap, opt) {
    const lib = lsGet();
    const name = clean((opt && opt.slot) || ('snap-' + (snap.sig || 'x') + '-' + snap.at), 40);
    const slots = Array.isArray(lib.slots) ? lib.slots : [];
    const row = { slot: name, at: snap.at, sig: snap.sig, bytes: Number(snap.bytes || JSON.stringify(snap).length),
      counts: countsOf(snap.faces), snapshot: snap };
    const i = slots.findIndex ? slots.findIndex(function (x) { return x && x.slot === name; }) : -1;
    if (i >= 0) slots[i] = row; else slots.push(row);
    while (slots.length > MAX_LIB) slots.shift();
    const w = lsSet({ ver: FORMAT, slots: slots });
    if (!w.ok) { note(w.reason); return { ok: false, reason: w.reason }; }
    return { ok: true, slot: name, slots: slots.length };
  }
  function library() {
    const lib = lsGet();
    const slots = Array.isArray(lib.slots) ? lib.slots : [];
    return { ok: true, max: MAX_LIB, count: slots.length,
      rows: slots.map(function (x) { return { slot: x.slot, at: x.at, sig: x.sig, bytes: x.bytes, counts: x.counts }; }) };
  }
  function libTake(slotName) {
    const lib = lsGet();
    const n = clean(slotName, 40);
    const row = (Array.isArray(lib.slots) ? lib.slots : []).filter(function (x) { return x && x.slot === n; })[0] || null;
    if (!row) return { ok: false, reason: 'not-found', slot: n };
    return { ok: true, slot: n, snapshot: row.snapshot, sig: row.sig, counts: row.counts };
  }
  function libDrop(slotName) {
    const lib = lsGet();
    const n = clean(slotName, 40);
    const slots = (Array.isArray(lib.slots) ? lib.slots : []).filter(function (x) { return x && x.slot !== n; });
    if (slots.length === (lib.slots || []).length) return { ok: false, reason: 'not-found', slot: n };
    const w = lsSet({ ver: FORMAT, slots: slots });
    if (!w.ok) return w;
    return { ok: true, slot: n, remaining: slots.length };
  }

  function catalog() {
    return {
      FORMAT: FORMAT, ACCEPTED: ACCEPTED.slice(), FACES: FACES.slice(),
      SECRETS: SECRETS.slice(), HOST_STATE: HOST_STATE.slice(),
      DROP_PREFIX: DROP_PREFIX, MAX_BYTES: MAX_BYTES, MAX_LIB: MAX_LIB, LIB_KEY: LIB_KEY,
      CONFLICT_MODES: ['skip', 'rename'], MODES: ['merge', 'newslot']
    };
  }
  function diagnose() {
    const s = state();
    const lib = library();
    const live = FACES.filter(function (k) { return Object.prototype.hasOwnProperty.call(s, k); });
    return { ok: true, facesDeclared: FACES.length, facesLive: live.length,
      facesMissing: FACES.filter(function (k) { return live.indexOf(k) < 0; }),
      // v2.211.0(优化 Q2):诊断面报出**身份引用同步面** —— 改名时哪些位置会跟着改,
      //   维护者一眼可查(不是读源码才知道)。这也是该表的真消费方。
      identityRefs: IDENTITY_REFS.map(function (r) { return r.face + '.' + r.at + '.' + r.field + '(' + r.domain + ')'; }),
      secretsDeclared: SECRETS.slice(), hostStateDeclared: HOST_STATE.slice(),
      storeAvailable: !!(WA.store && typeof WA.store.transact === 'function'),
      blueprintAvailable: !!(WA.worldBlueprint && typeof WA.worldBlueprint.exportBlueprint === 'function'),
      library: { count: lib.count, max: lib.max },
      bytes: JSON.stringify(s).length, budget: MAX_BYTES,
      stat: statOf() };
  }
  function statOf() {
    return Object.assign({}, _stat, { faults: Object.assign({}, _stat.faults) });
  }
  function reset() { _stat.exports = 0; _stat.imports = 0; _stat.previews = 0; _stat.refused = 0; _stat.lastReason = ''; _stat.faults = {}; return { ok: true }; }

  WA.worldSnapshot = {
    FORMAT: FORMAT,
    FACES: FACES.slice(),
    SECRETS: SECRETS.slice(),
    HOST_STATE: HOST_STATE.slice(),
    IDENTITY_REFS: IDENTITY_REFS.map(function (r) { return { face: r.face, at: r.at, field: r.field, domain: r.domain }; }),
    catalog: catalog,
    exportSnapshot: exportSnapshot, toJSON: toJSON, parse: parse,
    checkCompat: checkCompat, previewImport: previewImport, importSnapshot: importSnapshot,
    toBlueprint: toBlueprint, fromBlueprint: fromBlueprint, roundTrip: roundTrip,
    capacity: capacity, sigOf: sigOf,
    library: library, libTake: libTake, libDrop: libDrop,
    diagnose: diagnose, stat: statOf, reset: reset
  };
  // v2.211.0(优化 Q2):`buildRenamePlan` / `applyRenamePlan` / `utf8Len` **刻意不导出** ——
  //   它们是改名链的内部件,外部消费面是 `previewImport` / `importSnapshot` 的返回
  //   (`renamePlan` / `refSync` / `capacityUnit`)。三件事各有**一个**读口,
  //   导出内部件只会让「预览读数」与「执行读数」有第二个可漂移的来源。
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/world-snapshot.js', { kind: 'engine', ver: '2.211.0' });
})();
