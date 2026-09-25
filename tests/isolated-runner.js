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
function inspectLock(dir) {
  try {
    const o = json(path.join(dir, 'owner.json'));
    if (!o.token || !o.start) return { state: 'unknown' };
    try { return { state: identity(o.pid) === o.start ? 'active' : 'stale', owner: o }; }
    catch (e) { return { state: e.code === 'ENOENT' ? 'stale' : 'unknown', owner: o }; }
  } catch (e) { return { state: 'unknown' }; }
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
  const st = inspectLock(dir);
  if (st.state !== 'stale') throw new Error('lock not recoverable: ' + st.state);
  const live = st.owner && st.owner.task ? liveChild(st.owner.task) : null;
  if (live) throw new Error('lock has live worker: ' + live);
  const p = path.join(dir, 'owner.json');
  if (json(p).token !== st.owner.token) throw new Error('lock ownership changed');
  fs.unlinkSync(p); fs.rmdirSync(dir);
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
function files(root) {
  const out = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const abs = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('symlink rejected: ' + path.relative(root, abs));
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) out.push(path.relative(root, abs));
      else throw new Error('nonregular file rejected');
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
async function launch(root, options) {
  const opts = options || {};
  root = fs.realpathSync(root);
  const lockDir = path.join(os.tmpdir(), 'worldaxis-regression-' + digest(root).slice(0, 20) + '.lock');
  const task = fs.mkdtempSync(path.join(os.tmpdir(), 'worldaxis-regression-'));
  fs.chmodSync(task, 0o700);
  let lock;
  // task 目录注册进锁：锁主人猝死后，recoverLock 才能先确认它没留下活着的 worker。
  try { lock = acquireLock(lockDir, task); }
  catch (e) {
    console.error('Regression lock unavailable:', inspectLock(lockDir).state, lockDir);
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
    child = cp.spawn(process.execPath, [path.join(prepared.work, 'tests/run.js')],
      { cwd: prepared.work, env: prepared.env, detached: true, stdio: ['ignore', fd, fd] });
    result.childPid = child.pid; save();
    timer = setTimeout(() => stop('timeout'), opts.timeoutMs || 600000);
    const exit = await new Promise(resolve => {
      child.once('error', e => resolve({ code: null, error: e.code }));
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    clearTimeout(timer); clearTimeout(hardTimer);
    // A worker exit does not prove that all its descendant processes exited.
    try { signalGroup(child, 'SIGKILL'); } catch (e) { result.signalError = e.code; }
    fs.closeSync(fd);
    const text = fs.readFileSync(logFile, 'utf8');
    const summary = text.match(/通过 (\d+) \/ 失败 (\d+)/g);
    result = { ...result, ...exit, summary: summary ? summary[summary.length - 1] : null,
      unchanged: JSON.stringify(snapshot(root)) === JSON.stringify(prepared.before),
      status: stopping ? 'interrupted' : exit.error ? 'environment-error' : exit.code === 0 ? 'passed' : exit.code === 1 ? 'assertion-failed' : 'runner-failed' };
    if (result.status === 'passed' && (!result.summary || !/失败 0$/.test(result.summary))) result.status = 'missing-summary';
    if (!result.unchanged) result.status = 'source-changed';
    result.stopping = stopping; result.finishedAt = Date.now(); save();
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
  acquireLock, inspectLock, recoverLock, liveChild, cleanEnv };
