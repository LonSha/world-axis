'use strict';
// Host-side regression isolation. This is not a security sandbox for untrusted code.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const cp = require('child_process');
const MARK = '.wa-run-owner.json';
const digest = b => crypto.createHash('sha256').update(b).digest('hex');
function json(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function writeJson(p, o) { fs.writeFileSync(p, JSON.stringify(o, null, 2), { mode: 0o600 }); }
function identity(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('invalid pid');
  const text = fs.readFileSync('/proc/' + pid + '/stat', 'utf8');
  const end = text.lastIndexOf(')');
  if (end < 0) throw new Error('invalid process stat');
  const fields = text.slice(end + 2).trim().split(/\s+/);
  if (!/^\d+$/.test(fields[19] || '')) throw new Error('missing process start time');
  return fields[19];
}
/**
 * 判定锁目录状态。四态：own/active / stale / no-owner / unknown。
 *   v2.253.0：**把「读不出主人」与「根本没有主人」分开**。现场两次踩到（SELinux 标签不一致
 *   的旧锁目录 `ls -a` 看不见内容、`root` 也读不到 owner.json）：旧实现两种都塌成 `unknown`、
 *   而 reclaim 只收 `stale` ⇒ 每次都得人肉 `rm -rf`。区别在于证据类型：`no-owner` 是
 *   「acquireLock 在 mkdir 与写 owner 之间猝死」这一种已知形态，可按 stale 回收；
 *   `unknown` 是「文件在、但读不出/解析不出」，回收由人确认（`dir` 与 `why` 一并回带，便于照着查）。
 */
function inspectLock(dir) {
  // v2.524.0（V29 OPV29-15 用药时自查出的真 bug）：**目录根本不存在**时旧实现读不到 owner.json
  //   就返回 `no-owner`，而 `no-owner` 在 recoverLock 与现场提示里都等于「可按 stale 回收」。
  //   于是“没有锁”与“锁坏了”被压成同一个词：自诊工具在锁已回收之后仍然报「可回收」，
  //   照它办就会去回收一个不存在的东西（recoverLock 会抛 absent —— 读起来像“回收失败”）。
  //   五态：free（没有锁）/ no-owner / stale / active / unknown。free 不需要任何处置。
  if (!fs.existsSync(dir)) return { state: 'free', dir };
  const p = path.join(dir, 'owner.json');
  if (!fs.existsSync(p)) return { state: 'no-owner', dir, why: 'no owner.json in lock dir' };
  try {
    const o = json(p);
    if (!o.token || !o.start) return { state: 'unknown', dir, why: 'owner.json lacks token/start' };
    try { return { state: identity(o.pid) === o.start ? 'active' : 'stale', owner: o }; }
    catch (e) { return { state: e.code === 'ENOENT' ? 'stale' : 'unknown', owner: o, dir, why: e.code }; }
  } catch (e) { return { state: 'unknown', dir, why: e.code || e.message }; }
}
/** 该 task 目录记录的 worker 是否仍活着（用于陈旧锁回收前的二次确认）。 */
function liveChild(task) {
  try {
    const r = json(path.join(task, 'result.json'));
    if (!r || !r.childPid) return null;
    identity(r.childPid);
    return r.childPid;
  } catch (e) { return null; }
}
/**
 * 显式回收陈旧锁。绝不自动执行：只有调用方明确要求、且两道条件同时成立才删。
 *   ① 锁主人身份确认为 stale（pid 不存在，或同 pid 的 starttime 已不同 = pid 被复用）；
 *   ② 锁上登记的 task 没有活着的 worker —— 否则「主人死了但 worker 还在跑」时
 *      回收会让第二个任务与残留 worker 同时写缓存目录。
 */
function recoverLock(dir) {
  // 目录都不在 ⇒ 没有任何可回收的对象，不得静默返回成功（否则「回收过了」与「压根没有」混为一谈）。
  if (!fs.existsSync(dir)) throw new Error('lock not recoverable: absent (' + dir + ')');
  const st = inspectLock(dir);
  // v2.253.0：`no-owner` 也可回收 —— 它是「mkdir 成功、写 owner 之前就死了」的确定形态，
  //   没有任何主人可被误伤。`unknown` 仍不收（文件在却读不出，得人看一眼 why）。
  if (st.state !== 'stale' && st.state !== 'no-owner') {
    throw new Error('lock not recoverable: ' + st.state + (st.why ? ' (' + st.why + ')' : ''));
  }
  if (st.state === 'stale') {
    const live = st.owner && st.owner.task ? liveChild(st.owner.task) : null;
    if (live) throw new Error('lock has live worker: ' + live);
    const p = path.join(dir, 'owner.json');
    if (json(p).token !== st.owner.token) throw new Error('lock ownership changed');
    fs.unlinkSync(p);
  }
  fs.rmdirSync(dir);
  return true;
}
/**
 * worker 侧孤儿自回收。父（runner）被 SIGKILL 时，launch 的 finally 不会执行，
 *   detached worker 会被 init 收养并继续跑完 —— 它改写的是候选副本，不会污染主树，
 *   但会绕过锁的语义、长期占用资源。故 worker 自己周期性核对父身份：
 *   父 pid 消失或 starttime 变化（pid 被复用）即判定孤儿，留证据后自杀整个进程组。
 *   间隔取小值只影响孤儿发现延迟，不影响正常路径（父存活时零副作用）。
 */
function watchParent(task, intervalMs) {
  let mark;
  try { mark = json(path.join(task, MARK)); } catch (e) { return { stop: function () {}, armed: false }; }
  const state = { armed: true, stopped: false };
  const timer = setInterval(function () {
    let alive = false;
    try { alive = identity(mark.parent) === mark.start; } catch (e) { alive = false; }
    if (alive || state.stopped) return;
    state.stopped = true;
    try { writeJson(path.join(task, 'orphan.json'), { reason: 'parent-gone', parent: mark.parent, at: Date.now(), pid: process.pid }); }
    catch (e) {}
    try { process.kill(-process.pid, 'SIGKILL'); } catch (e) {}
    try { process.kill(process.pid, 'SIGKILL'); } catch (e) {}
  }, intervalMs || 2000);
  if (timer.unref) timer.unref();
  state.stop = function () { state.stopped = true; clearInterval(timer); };
  return state;
}
function acquireLock(dir, task) {
  fs.mkdirSync(dir, { mode: 0o700 }); // Existing/unknown/stale locks require explicit recovery.
  const owner = { pid: process.pid, start: identity(process.pid), token: crypto.randomBytes(24).toString('hex'), task: task || null };
  try { writeJson(path.join(dir, 'owner.json'), owner); }
  catch (e) { fs.rmdirSync(dir); throw e; }
  return { owner, release() {
    const p = path.join(dir, 'owner.json');
    if (json(p).token !== owner.token) throw new Error('lock ownership changed');
    fs.unlinkSync(p); fs.rmdirSync(dir);
  } };
}
/**
 * v2.524.0（OPV29-03）：复制面瘦身。真源是 `tools/mirror-slim.js` 的 `exclusionSet()` ——
 *   那张清单的每一条都由**文本证据**背书（产品面不排、被测试提到的不排），本处只消费它。
 *   三条边界：
 *     ① 本处**不理解**「为什么可以排」，只执行；判据必须留在 mirror-slim 一处（否则两处漂移）。
 *     ② 拿不到那份清单（模块缺失/抛错）⇒ 空集 ⇒ 退化成「整棵树照抄」，与旧行为逐字一致。
 *     ③ `WA_SLIM=0` 是显式关闭开关：怀疑瘦身吃掉了某节证据时，用它复现旧现场再比。
 *   缓存一次：一趟隔离要 files() 三到四次，每次都走树+读 582 个锁文本是纯浪费。
 */
let __slimSeen = null;
function slimSet() {
  if (__slimSeen !== null) return __slimSeen;
  if (process.env.WA_SLIM === '0') { __slimSeen = new Set(); return __slimSeen; }
  try { __slimSeen = require('../tools/mirror-slim.js').exclusionSet(path.join(__dirname, '..')); }
  catch (e) { __slimSeen = new Set(); }
  return __slimSeen;
}
function files(root) {
  const out = [];
  const slim = slimSet();
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const abs = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('symlink rejected: ' + path.relative(root, abs));
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) {
        const rel = path.relative(root, abs);
        if (!slim.has(rel)) out.push(rel);
      } else throw new Error('nonregular file rejected');
    }
  }
  walk(root); return out.sort();
}
function snapshot(root) {
  const result = {};
  for (const rel of files(root)) result[rel] = digest(fs.readFileSync(path.join(root, rel)));
  return result;
}
function cleanEnv(home) {
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: home,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(home, 'no-config'),
    GIT_TERMINAL_PROMPT: '0' };
  for (const key of Object.keys(env)) {
    if (/^(GIT_DIR|GIT_WORK_TREE|GIT_COMMON_DIR|GIT_INDEX_FILE|GIT_OBJECT_DIRECTORY|GIT_ALTERNATE_OBJECT_DIRECTORIES|GIT_CONFIG_COUNT|GIT_CONFIG_KEY_.*|GIT_CONFIG_VALUE_.*|NODE_OPTIONS|NODE_PATH|WA_ISOLATED_.*)$/.test(key)
      || /(?:TOKEN|PASSWORD|SECRET|API_KEY|APIKEY)/i.test(key)) delete env[key];
  }
  return env;
}
function command(cmd, args, cwd, env, logFd) {
  const r = cp.spawnSync(cmd, args, { cwd, env, stdio: ['ignore', logFd, logFd], timeout: 30000 });
  if (r.error || r.status !== 0) throw new Error('setup command failed: ' + cmd + ' (' + (r.error ? r.error.code : r.status) + ')');
}
function prepare(root, task, logFd) {
  root = fs.realpathSync(root);
  const before = snapshot(root), work = path.join(task, 'work');
  fs.mkdirSync(work, { mode: 0o700 });
  const env = cleanEnv(task), archive = path.join(task, 'baseline.tar');
  // Archive is historical HEAD, not the uncommitted candidate. It contains no Git config.
  const fd = fs.openSync(archive, 'wx', 0o600);
  try {
    const r = cp.spawnSync('git', ['-C', root, 'archive', '--format=tar', 'HEAD'],
      { env, stdio: ['ignore', fd, logFd], timeout: 30000 });
    if (r.error || r.status !== 0) throw new Error('cannot archive independent HEAD baseline');
  } finally { fs.closeSync(fd); }
  command('tar', ['-xf', archive, '-C', work], task, env, logFd);
  files(work); // Reject tracked symlinks before any candidate overlay or execution.
  command('git', ['-c', 'init.templateDir=', 'init', '--quiet'], work, env, logFd);
  command('git', ['add', '-A'], work, env, logFd);
  command('git', ['-c', 'user.name=WorldAxis Test Baseline', '-c', 'user.email=test@invalid',
    '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '--allow-empty', '-m', 'Independent baseline'], work, env, logFd);
  // Preserve only independent .git; candidate replaces entire tree, including deletions/untracked files.
  for (const name of fs.readdirSync(work)) if (name !== '.git') fs.rmSync(path.join(work, name), { recursive: true });
  for (const rel of Object.keys(before)) {
    const dest = path.join(work, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(root, rel), dest);
  }
  if (JSON.stringify(snapshot(root)) !== JSON.stringify(before)
    || JSON.stringify(snapshot(work)) !== JSON.stringify(before)) throw new Error('source changed during copy');
  const token = crypto.randomBytes(24).toString('hex');
  writeJson(path.join(task, MARK), { token, work, source: root, parent: process.pid, start: identity(process.pid) });
  fs.unlinkSync(archive);
  return { work, before, env: { ...env, WA_ISOLATED_TOKEN: token, WA_ISOLATED_WORK: work } };
}
function isWorker(root) {
  if (!process.env.WA_ISOLATED_TOKEN || !process.env.WA_ISOLATED_WORK) return false;
  try {
    const work = fs.realpathSync(root);
    const o = json(path.join(path.dirname(work), MARK));
    return work === o.work && work === process.env.WA_ISOLATED_WORK && work !== o.source
      && o.token === process.env.WA_ISOLATED_TOKEN && o.parent === process.ppid
      && identity(o.parent) === o.start;
  } catch (e) { return false; }
}
function signalGroup(child, signal) {
  if (!child || !child.pid) return;
  try { process.kill(-child.pid, signal); }
  catch (e) { if (e.code !== 'ESRCH') throw e; }
}
/**
 * 锁目录路径（**单一真源**）：launch 与 `--recover-lock` 必须算同一个路径，
 *   否则「按提示去回收」会回收另一个目录（v2.529.0 补 CLI 入口时抽出的函数）。
 */
function lockDirFor(root) {
  return path.join(os.tmpdir(), 'worldaxis-regression-' + digest(fs.realpathSync(root)).slice(0, 20) + '.lock');
}
async function launch(root, options) {
  const opts = options || {};
  root = fs.realpathSync(root);
  const lockDir = lockDirFor(root);
  const task = fs.mkdtempSync(path.join(os.tmpdir(), 'worldaxis-regression-'));
  fs.chmodSync(task, 0o700);
  let lock;
  // task 目录注册进锁：锁主人猝死后，recoverLock 才能先确认它没留下活着的 worker。
  try { lock = acquireLock(lockDir, task); }
  catch (e) {
    const st = inspectLock(lockDir);
    console.error('Regression lock unavailable:', st.state, lockDir);
    // v2.253.0：把「下一步怎么办」当场打出来。旧提示只有一个状态词，现场两次都是人肉翻
    //   源码才知道要调 recoverLock；`unknown` 连 recoverLock 都不收，必须给出人工判据。
    if (st.state === 'stale' || st.state === 'no-owner') {
      console.error('  回收（一条命令，幂等；会二次确认 worker 已死）：node tools/isolated-run.js --recover-lock');
    } else if (st.state === 'unknown') {
      console.error('  需人工确认后删目录（' + (st.why || '原因未知')
        + '）：读不出主人时 runner 不敢自动回收；SELinux 标签不一致的目录 root 也可能读不到。');
    } else if (st.state === 'active') {
      console.error('  另有一趟正在跑（pid ' + (st.owner && st.owner.pid) + '，task ' + (st.owner && st.owner.task) + '）');
    }
    fs.rmSync(task, { recursive: true, force: true });
    return 3;
  }
  const logFile = path.join(task, 'run.log'), resultFile = path.join(task, 'result.json');
  const fd = fs.openSync(logFile, 'wx', 0o600);
  let child, timer, hardTimer, prepared, stopping = null, result = { status: 'preparing', task, startedAt: Date.now() };
  const save = () => writeJson(resultFile, result);
  const stop = sig => {
    stopping = sig;
    try { signalGroup(child, 'SIGTERM'); } catch (e) { result.signalError = e.code; }
    hardTimer = setTimeout(() => { try { signalGroup(child, 'SIGKILL'); } catch (e) { result.signalError = e.code; } }, 2000);
  };
  const onTerm = () => stop('SIGTERM'), onInt = () => stop('SIGINT');
  try {
    save(); console.log('Isolated regression:', task);
    prepared = prepare(root, task, fd);
    result.status = 'running'; result.sourceDigest = digest(JSON.stringify(prepared.before)); save();
    process.on('SIGTERM', onTerm); process.on('SIGINT', onInt);
    // v2.187.0（O6）：**分层选区参数必须转发给 worker**。现场事实：worker 是
    //   `cp.spawn(execPath, [work/tests/run.js], {env})` —— argv 不转发、**env 会转发**
    //   （prepared.env 由 process.env 派生）。于是 `WA_ONLY_SECTION` 天然能进 worker，
    //   而 `--only-v-section` 会静默丢失：人以为自己跑了子集，实际跑的是全量
    //   （「看起来跑得快了」与「其实没快」之间的差别没人会注意到）。这里只转发这一个已知开关。
    const fwd = [];
    for (let i = 2; i < process.argv.length; i++) {
      const v = process.argv[i];
      if (v === '--only-v-section' && process.argv[i + 1]) fwd.push(v, process.argv[++i]);
      else if (v.indexOf('--only-v-section=') === 0) fwd.push(v);
    }
    // v2.213.0（Q4）：定向运行时对 work 副本做 wrap 裁剪 —— **真省时的关键一步**。
    //   现场病灶：run.js 的 section() 对 skip/refuse 只提前 return 计时与标记，紧随其后的
    //   裸语句节体（90 节 / 9145 行）与块节体照跑 —— 转发 --only-v-section 后 worker
    //   实际执行了几乎全量（实测 25 分钟后 V8 OOM）。修法：spawn 前对 work/tests/run.js
    //   应用 prune(src, sel, {mode:'wrap'})：未选中节 if 包裹 + sentinel 哨兵（运行期
    //   同源裁定）。全量路径（无选区）不裁剪、逐字不变。裁剪版必须过 node --check，
    //   不过 ⇒ 拒裁（照跑原版，宁可慢不可错）。裁剪统计写入 run.log 首行，可审计。
    let pruneNote = null;
    if (fwd.some(function (v) { return v.indexOf('--only-v-section') === 0; })) {
      const sel = [];
      for (let i = 0; i < fwd.length; i++) {
        if (fwd[i] === '--only-v-section' && fwd[i + 1]) sel.push(fwd[++i]);
        else if (fwd[i].indexOf('--only-v-section=') === 0) sel.push(fwd[i].slice(17));
      }
      const runPath = path.join(prepared.work, 'tests/run.js');
        // ── v2.568.0：**段内节必须连带其宿主节**──────────────
        //   段调用行（await require('./segments/x.js')({…})）物理上住在 run.js 的**某个节体里**
        //   （tool-diag-v092 住 engines/inject-inspector v0.9.2，实测行 2410）。wrap 会把宿主节
        //   整节包裹 ⇒ guardRun=false 时连段也不执行 ⇒「选中了段内节却一节没跑」。
        //   治法：把宿主节名并入选区（**如实记账**：note 里点名连带执行了谁）。
        //   这不是放宽判据：那一段代码物理上就住在宿主节里，切不出来。
        const segHosts = [];
        try {
          const P0 = require(path.join(prepared.work, 'tools/prune-sections.js'));
          const runSrc0 = fs.readFileSync(runPath, 'utf8');
          const secs0 = P0.scan(runSrc0);
          const srcLines0 = runSrc0.split('\n');
          const segDir0 = path.join(prepared.work, 'tests/segments');
          if (fs.existsSync(segDir0)) {
            fs.readdirSync(segDir0).sort().forEach(function (nm) {
              if (!/\.js$/.test(nm)) return;
              const st = fs.readFileSync(path.join(segDir0, nm), 'utf8');
              const hitsSel = st.split('\n').some(function (l) {
                const m = l.match(/^ {0,2}section\((['\"])(.*)\1\);\s*$/);
                return m && sel.some(function (q) { return m[2].indexOf(q) >= 0; });
              });
              if (!hitsSel) return;
              let ln = -1;
              srcLines0.forEach(function (l, i) { if (ln < 0 && l.indexOf('./segments/' + nm) >= 0) ln = i + 1; });
              if (ln < 0) return;
              let own = null;
              secs0.forEach(function (x) { if (x.line + 1 <= ln && ln <= x.nextLine) own = x; });
              if (own && sel.indexOf(own.name) < 0) {
                sel.push(own.name);
                segHosts.push(nm + ' 的宿主节=' + own.name);
              }
            });
          }
        } catch (eH) { segHosts.push('宿主节推导失败：' + eH.message); }
      try {
        const P = require(path.join(prepared.work, 'tools/prune-sections.js'));
        const r = P.prune(fs.readFileSync(runPath, 'utf8'), sel, { mode: 'wrap' });
        // ── v2.566.0：**段文件也必须裁**（O6 Q4 第六刀）──────────────────
        //   现场病灶：仓里 3544 行的那一节住在 tests/segments/tool-diag-v092.js，它的 section() 不在
        //   tests/run.js 本体 —— 而剪裁只扫 run.js ⇒「选区未命中任何节」⇒ 拒裁 ⇒ 退回全量；
        //   而未选中节的裸语句体在没有夹具的世界里成片假红（实测 22 条全挂在「已跳过 /
        //   拒绝」的节上，读数不可采信）。治法不是放宽判据：对**同一份段文件**跑同一个 prune ——
        //   段文件里的 section() 行就是节头，未选中节体被 if (guardRun('名')) 包裹（运行期同源裁定），
        //   require 行本身不动 ⇒ test-surface-gate 的静态可达性仍看得见这条边。
        const segKept = [];
        const segDir = path.join(prepared.work, 'tests/segments');
        if (fs.existsSync(segDir)) {
          fs.readdirSync(segDir).sort().forEach(function (nm) {
            if (!/\.js$/.test(nm)) return;
            const sp = path.join(segDir, nm);
            const sr = P.prune(fs.readFileSync(sp, 'utf8'), sel, { mode: 'wrap' });
            if (!sr.kept.length) return;
            fs.writeFileSync(sp, sr.text);
            P.check(sp);
            segKept.push(nm + ':' + sr.kept.length + '节');
          });
        }
        if (r.kept.length || segKept.length) {
          fs.writeFileSync(runPath, r.text);
          P.check(runPath);   // 拒裁兜底：check 抛 ⇒ catch 照跑原版
          pruneNote = 'wrap 裁剪：选中 ' + r.stats.selected + ' 节 · 包裹 ' + r.stats.wrappedCount
            + ' 节 / ' + r.stats.wrappedLines + ' 行（运行期哨兵裁定，未选中节体不执行）'
            + ' · 最后一节不包（尾部汇总段边界） · 跨节结构降级不包 ' + (r.stats.wrapUnsafe || 0) + ' 节' + (r.stats.markedCount ? ' · 只标不包 ' + r.stats.markedCount + ' 节' : '')
            + (segKept.length ? ' ·段文件裁剪 ' + segKept.join(' / ') : '')
            + (segHosts.length ? ' ·连带宿主节 ' + segHosts.join(' / ') : '');
        } else {
          // v2.253.0：**节名写错时必须显式点名**。现场实证（沙箱 UKFBEG）：选区传了
          //   「…不再取决于开关」，而真源节名是「…不再取决于开发机装没装 npm 包」——
          //   `section()` 全部拿不到命中 ⇒ 每一节都 skip，可**裸语句节体照样逐条执行**
          //   （本仓 90 个裸语句节），于是断言在没有夹具的世界里成片失败（实测 119 条），
          //   而且因为全量体都在跑，1700s 也跑不完。旧日志只有一句「未命中任何节，照跑原版」，
          //   读起来像「这节没事」，实际是「你写错了名字」。故这里把**最接近的候选名**也打出来。
          let near = [];
          try {
            const sc = P.scan(fs.readFileSync(runPath, 'utf8'));
            near = sc.map(function (s) { return s.name; })
              .filter(function (n) { return sel.some(function (q) { return n.indexOf(q.slice(0, 8)) >= 0 || q.indexOf(n.slice(0, 8)) >= 0; }); })
              .slice(0, 3);
          } catch (e2) { near = []; }
          pruneNote = 'wrap 裁剪拒裁：选区未命中任何节，照跑原版（节名可能写错'
            + (near.length ? '；最接近的候选：' + near.join(' | ') : '；一个候选都没找到') + '）';
        }
      } catch (e) {
        pruneNote = 'wrap 裁剪失败（拒裁兜底，照跑原版）：' + e.message;
        // v2.518.0 收口：拒裁兜底必须恢复**候选代码**，不是 HEAD。
        //   旧写法是 `git checkout -- tests/run.js`，而 work 是独立 git 仓（prepare 先把 HEAD 归档成
        //   baseline commit，再用候选树整体覆盖、并 commit 了一次）。于是 checkout 恢复的是
        //   **那个 baseline commit**（= 仓库 HEAD）——候选工作区里的未提交改动被静默丢掉。现场后果：
        //   定向跑一轮失败后，整趟执行的是旧代码，而日志里只有一行「拒裁兜底」，
        //   断言红得不可思议（实侧是「你没改过」）——这正是本仓反复裁决的「判据的输入面不是要测的东西」。
        //   修法：从**源工作区**把 tests/run.js 复制回来，并用 prepare 时录下的候选
        //   digest 当场核对；不符就声明这趟不作数（10 号退码），而不是安静地跑错代码。
        try {
          fs.copyFileSync(path.join(root, 'tests/run.js'), runPath);
          const want = prepared.before && prepared.before['tests/run.js'];
          const got = digest(fs.readFileSync(runPath));
          if (want && want !== got) {
            pruneNote += ' · 恢复后与候选快照不符（期 ' + String(want).slice(0, 10) + ' / 实 ' + String(got).slice(0, 10) + '）⇒ 本趟不作数';
            fs.writeSync(fd, pruneNote + String.fromCharCode(10));
            throw new Error('prune fallback restored source does not match candidate snapshot');
          }
          pruneNote += ' · 已从候选源恢复并核对 digest';
        } catch (e2) {
          if (e2 && String(e2.message).indexOf('does not match candidate') >= 0) throw e2;
          pruneNote += ' · 候选源恢复失败：' + (e2 && e2.message);
        }
      }
      // v2.253.0：**必须走同一个 fd**。旧实现用 appendFileSync（另开一个 fd 追加到当前 EOF），
      //   而本函数的 logFd 是 'wx' 打开的、偏移还在 0 —— 父进程先写、子进程随后从偏移 0
      //   开始直写，结果审计行被**整行覆盖**（现场实证：本版之前的每一份 run.log 里
      //   `wrap 裁剪` 一条都查不到，全是子进程首行 `[WorldAxis] …` 顶着）。写 fd 让偏移
      //   前进，子进程才会从审计行之后接着写，本注释所称的「run.log 首行」才真成立。
      if (pruneNote) fs.writeSync(fd, pruneNote + String.fromCharCode(10));
    }
    // v2.230.0：**内存参数必须随 worker 走**。现场实证（基线任务 NYtNSp）：外壳被隔离后，
    //   worker 仍以默认堆上限跑，全量 600+ 节只到 244 节便 `Ineffective mark-compacts ...
    //   heap out of memory`（SIGABRT）——于是「一趟跑完」在结构上不可能，而外壳给多少内存
    //   都不作数（NODE_OPTIONS 由 cleanEnv 剥除，且它本就不转发 execArgv）。
    //   口径：只透传**内存类**参数，不放开整个 NODE_OPTIONS（后者刻意剥除，防外部注入
    //   改变被测代码行为）。参数面窄到三个已知键，别的 execArgv 一律不带。
    const memArgv = (process.execArgv || []).filter(function (a) {
      return /^--max-old-space-size(=|$)|^--max-semi-space-size(=|$)|^--max-heap-size(=|$)/.test(a);
    });
    // v2.253.0：**外壳没带内存参数时补一个默认值**。上面那条只解决了「调用方给了会转发」，
    //   没解决「调用方不给」—— 而 `node tests/run.js` 的正常调用形态就是不给。
    //   现场实证（沙箱任务 GfsZHM，v2.163.0 单节）：worker 堆按 V8 默认值涨到 2001 MB 后
    //   `Ineffective mark-compacts near heap limit` 直接 SIGABRT，此时该节 **49 条断言全过、
    //   0 条失败**，整趟却只能记 source-changed/RC 3 —— 一人高的天花板，与 v2.230.0 记的
    //   「外壳给多少内存都不作数」是同一件事的第二个侧面（那版修了转发，没修默认）。
    //   取值 3072 MB：本机 available 约 4.5 GB，单趟只有一个 worker，留够给父进程与 tar/git。
    //   显式传了 `--max-old-space-size` 时以调用方为准（既有行为逐字不变）。
    if (!memArgv.some(function (a) { return /^--max-old-space-size/.test(a); })) memArgv.push('--max-old-space-size=3072');
    child = cp.spawn(process.execPath, memArgv.concat([path.join(prepared.work, 'tests/run.js')]).concat(fwd),
      { cwd: prepared.work, env: prepared.env, detached: true, stdio: ['ignore', fd, fd] });
    result.childPid = child.pid; save();
    //   默认值由调用方（tests/run.js）按现场实测给出；这里的兜底与它同值，
    //   由 tests/gate-timeout.js 的 RUNNER_TIMEOUT_DEFAULT_MS 做三处同值对账。
    timer = setTimeout(() => stop('timeout'), opts.timeoutMs || 7560000);
    const exit = await new Promise(resolve => {
      child.once('error', e => resolve({ code: null, error: e.code }));
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    clearTimeout(timer); clearTimeout(hardTimer);
    // A worker exit does not prove that all its descendant processes exited.
    try { signalGroup(child, 'SIGKILL'); } catch (e) { result.signalError = e.code; }
    fs.closeSync(fd);
    const text = fs.readFileSync(logFile, 'utf8');
    // v2.131.0（O15 ①）：**被超时掐掉时补写中断摘要**。现场实测的坑：子进程被 SIGKILL
    //   （stop('timeout') → 2s 后 SIGKILL），kill 不可捕获，故 run.js 里的 SIGTERM 处理器
    //   根本没机会跑；而 run.log 是**同一个 fd** 直写，故 fsync 后内容仍完整。
    //   于是「跑到哪一节」可以**从日志尾部还原**（每节开头是 `■ 标题`），补写成一条可读摘要。
    //   不这么做的话，跑不完的整趟只剩 `Status: interrupted`，读起来像环境问题。
    //   注：判据用 `stopping`（而不是「日志里有没有 `通过 N / 失败 M`」）—— 现场实测踩到过：
    //   某些**子门禁**自己也会打印一行 `通过 49 / 失败 0`，用「有无该行」当判据会误判成
    //   「已经跑完」，于是中断摘要不补写、跑不完的整趟又变回一句 `Status: interrupted`。
    if (stopping) {
      const secs = text.match(/^■ .*$/gm) || [];
      const times = text.match(/⏱ ([\d.]+)s/g) || [];
      const last = secs.length ? secs[secs.length - 1].replace(/^■ /, '') : '(尚未进入任何 section)';
      const slow = (text.match(/超 60s/g) || []).length;
      const line = '（中断摘要·由运行器依日志尾补写）跑到「' + last + '」· 已完成节 '
        + Math.max(0, secs.length - 1) + ' / ' + secs.length + ' 可见 · 本节耗时 ' + (times.length ? times[times.length - 1] : '?')
        + ' · 超 60s 节 ' + slow + ' 个 · 结束原因 ' + stopping;
      fs.appendFileSync(logFile, '\n' + line + '\n');
      result.interruptedSummary = line;
    }
    const summary = text.match(/通过 (\d+) \/ 失败 (\d+)/g);
    result = { ...result, ...exit, summary: summary ? summary[summary.length - 1] : null,
      unchanged: JSON.stringify(snapshot(root)) === JSON.stringify(prepared.before),
      status: stopping ? 'interrupted' : exit.error ? 'environment-error' : exit.code === 0 ? 'passed' : exit.code === 1 ? 'assertion-failed' : 'runner-failed' };
    if (result.status === 'passed' && (!result.summary || !/失败 0$/.test(result.summary))) result.status = 'missing-summary';
    if (!result.unchanged) result.status = 'source-changed';
    result.stopping = stopping; result.finishedAt = Date.now(); save();
    // v2.408.0（OPV23-9）：**纯附加**的收尾回调。`tools/isolated-run.js`（调度器的委托入口）
    //   需要把这一趟的最终 result 回带给调用方，好让它打一行机器可读读数 —— 而 `launch()`
    //   的返回值只是退出码（0/3），拿不到状态、摘要与 task 目录。给一个可选回调比把所有
    //   调用方改成「去读 result.json」更窄：**不传它时本函数逐字不变**（`tests/run.js` 不传）。
    if (typeof opts.onFinish === 'function') { try { opts.onFinish(result); } catch (e) { console.error('onFinish:', e.message); } }
    console.log(result.summary || 'No completed test summary'); console.log('Status:', result.status, '| log:', logFile);
    if (result.status === 'passed') fs.rmSync(prepared.work, { recursive: true });
    return result.status === 'passed' ? 0 : 3;
  } catch (e) {
    result.status = 'environment-or-setup-error'; result.error = e.message; result.finishedAt = Date.now();
    save(); console.error('Regression setup/runtime failed:', e.message, '| evidence:', task); return 3;
  } finally {
    clearTimeout(timer); clearTimeout(hardTimer);
    process.removeListener('SIGTERM', onTerm); process.removeListener('SIGINT', onInt);
    try { fs.closeSync(fd); } catch (e) { if (e.code !== 'EBADF') console.error('log close:', e.code); }
    try { lock.release(); } catch (e) { console.error('Lock retained:', e.message); }
  }
}
/** worker 侧入口：由 tests/run.js 在确认自己是合法 worker 之后立刻武装孤儿看护。 */
function workerGuard(root) {
  const work = fs.realpathSync(root || path.join(__dirname, '..'));
  return watchParent(path.dirname(work));
}
module.exports = { launch, isWorker, workerGuard, watchParent, prepare, snapshot, identity,
  acquireLock, inspectLock, recoverLock, liveChild, cleanEnv, lockDirFor };
