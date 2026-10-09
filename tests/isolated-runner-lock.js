'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const runner = require('./isolated-runner.js');
/** 一个确定不存在的 pid：用于伪造「锁主人已死」与「worker 已死」。 */
function freePid(from) {
  for (let p = from || 65000; p < 70000; p += 1) if (!fs.existsSync('/proc/' + p)) return p;
  throw new Error('no free pid');
}
function runAll(a) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-isolation-lock-'));
  const lockDir = path.join(root, 'lock');
  try {
    const lock = runner.acquireLock(lockDir);
    a(runner.inspectLock(lockDir).state === 'active', 'isolation: owned lock has live process identity');
    let rejected = false;
    try { runner.acquireLock(lockDir); } catch (e) { rejected = e.code === 'EEXIST'; }
    a(rejected, 'isolation: concurrent acquisition rejected');
    const ownerPath = path.join(lockDir, 'owner.json');
    const owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
    fs.writeFileSync(ownerPath, JSON.stringify({ ...owner, token: 'replacement' }));
    rejected = false;
    try { lock.release(); } catch (e) { rejected = /ownership/.test(e.message); }
    a(rejected && fs.existsSync(ownerPath), 'isolation: changed token prevents deleting replacement owner');
    fs.writeFileSync(ownerPath, JSON.stringify(owner));
    fs.writeFileSync(ownerPath, JSON.stringify({ ...owner, start: String(BigInt(owner.start) + 1n) }));
    a(runner.inspectLock(lockDir).state === 'stale', 'isolation: reused PID with different start is stale');
    fs.writeFileSync(ownerPath, 'broken');
    a(runner.inspectLock(lockDir).state === 'unknown', 'isolation: unreadable identity never treated as stale');
    fs.writeFileSync(ownerPath, JSON.stringify(owner));
    lock.release();
    a(!fs.existsSync(lockDir), 'isolation: owner releases own empty lock');
    const src = path.join(root, 'source'); fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, 'item'), 'before');
    const first = runner.snapshot(src);
    fs.writeFileSync(path.join(src, 'item'), 'after');
    a(first.item !== runner.snapshot(src).item, 'isolation: source hash detects mutation');
    fs.symlinkSync(path.join(src, 'item'), path.join(src, 'link'));
    rejected = false;
    try { runner.snapshot(src); } catch (e) { rejected = /symlink/.test(e.message); }
    a(rejected, 'isolation: symlink cannot redirect candidate writes into source');
    const oldToken = process.env.WA_ISOLATED_TOKEN, oldWork = process.env.WA_ISOLATED_WORK;
    try {
      process.env.WA_ISOLATED_TOKEN = 'forged'; process.env.WA_ISOLATED_WORK = src;
      a(!runner.isWorker(src), 'isolation: environment flags alone cannot bypass isolation');
      const env = runner.cleanEnv(root);
      a(!env.WA_ISOLATED_TOKEN && !env.WA_ISOLATED_WORK, 'isolation: inherited bypass flags stripped');
      a(env.HOME === root && env.GIT_CONFIG_NOSYSTEM === '1', 'isolation: Git config uses independent home');
    } finally {
      if (oldToken === undefined) delete process.env.WA_ISOLATED_TOKEN; else process.env.WA_ISOLATED_TOKEN = oldToken;
      if (oldWork === undefined) delete process.env.WA_ISOLATED_WORK; else process.env.WA_ISOLATED_WORK = oldWork;
    }
    const clean = fs.readFileSync(path.join(__dirname, 'isolated-runner.js'), 'utf8');
    const anchor = "if (entry.isSymbolicLink()) throw new Error('symlink rejected: ' + path.relative(root, abs));";
    a(clean.split(anchor).length === 2, 'isolation: mutation anchor unique');
    const broken = clean.replace(anchor, 'if (entry.isSymbolicLink()) continue;');
    const vm = require('vm');
    const box = { module: { exports: {} }, exports: {}, require, process, console, setTimeout, clearTimeout };
    vm.runInNewContext(broken, box, { filename: 'isolated-runner-broken.js' });
    rejected = false;
    try { box.module.exports.snapshot(src); } catch (e) { rejected = /symlink/.test(e.message); }
    a(!rejected, 'isolation: same symlink criterion fails on real weakened source');

    // ── 陈旧锁回收：只有「主人确死 + 该任务没有活着的 worker」两条同时成立才允许 ──
    const rDir = path.join(root, 'recover'); fs.mkdirSync(rDir);
    const rTask = path.join(root, 'recover-task'); fs.mkdirSync(rTask);
    fs.writeFileSync(path.join(rTask, 'result.json'), JSON.stringify({ status: 'running', childPid: freePid(66000) }));
    fs.mkdirSync(rDir, { recursive: true });
    const deadPid = freePid(67000);
    fs.writeFileSync(path.join(rDir, 'owner.json'),
      JSON.stringify({ pid: deadPid, start: '1', token: 't', task: rTask }));
    a(runner.inspectLock(rDir).state === 'stale', 'isolation: dead-owner lock is stale');
    a(runner.recoverLock(rDir) === true && !fs.existsSync(rDir), 'isolation: stale lock with dead worker is reclaimed');
    // 回收后目录已不存在：再回收必须抛（不可判定），不能静默返回成功
    rejected = false;
    try { runner.recoverLock(rDir); } catch (e) { rejected = /not recoverable/.test(e.message); }
    a(rejected, 'isolation: recovery on absent lock throws instead of silently succeeding');

    // 活着的 worker 挡住回收：主人死了但 worker 还在跑时，回收会让第二个任务与残留 worker 同时写
    const live = cp.spawn(process.execPath, ['-e', 'setInterval(function(){},1000);'], { stdio: 'ignore' });
    try {
      const rDir2 = path.join(root, 'recover2'); fs.mkdirSync(rDir2);
      const rTask2 = path.join(root, 'recover-task2'); fs.mkdirSync(rTask2);
      fs.writeFileSync(path.join(rTask2, 'result.json'), JSON.stringify({ status: 'running', childPid: live.pid }));
      fs.writeFileSync(path.join(rDir2, 'owner.json'),
        JSON.stringify({ pid: freePid(68000), start: '1', token: 't', task: rTask2 }));
      rejected = false;
      try { runner.recoverLock(rDir2); } catch (e) { rejected = /live worker/.test(e.message); }
      a(rejected && fs.existsSync(rDir2), 'isolation: live worker blocks stale-lock reclamation');
      a(runner.liveChild(rTask2) === live.pid, 'isolation: liveChild reports the surviving worker pid');
      // 活锁主人不得被回收（不能只按「pid 存在」判断 stale）
      const held = runner.acquireLock(path.join(root, 'recover3'), rTask2);
      rejected = false;
      try { runner.recoverLock(path.join(root, 'recover3')); } catch (e) { rejected = /not recoverable/.test(e.message); }
      a(rejected, 'isolation: active lock is never recoverable');
      held.release();
    } finally { live.kill('SIGKILL'); }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
async function runIntegration(a) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-isolation-integration-'));
  const source = path.join(root, 'source'), task = path.join(root, 'task');
  fs.mkdirSync(source); fs.mkdirSync(task);
  const log = fs.openSync(path.join(root, 'setup.log'), 'w');
  const env = runner.cleanEnv(root);
  function git(args) {
    const r = cp.spawnSync('git', args, { cwd: source, env, stdio: ['ignore', log, log] });
    if (r.status !== 0 || r.error) throw new Error('fixture git failed');
  }
  try {
    git(['-c', 'init.templateDir=', 'init', '--quiet']);
    fs.writeFileSync(path.join(source, 'baseline.txt'), 'historical');
    fs.writeFileSync(path.join(source, 'removed.txt'), 'remove in candidate');
    git(['add', '-A']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'baseline']);
    git(['config', 'remote.origin.url', 'https://fixture-user:DO-NOT-COPY@example.invalid/repo']);
    const sourceGitBefore = fs.readFileSync(path.join(source, '.git/config'));
    fs.writeFileSync(path.join(source, 'baseline.txt'), 'uncommitted');
    fs.unlinkSync(path.join(source, 'removed.txt'));
    fs.writeFileSync(path.join(source, 'untracked.txt'), 'new file');
    const prepared = runner.prepare(source, task, log);
    a(fs.readFileSync(path.join(prepared.work, 'baseline.txt'), 'utf8') === 'uncommitted', 'isolation E2E: uncommitted candidate is tested');
    a(fs.existsSync(path.join(prepared.work, 'untracked.txt')) && !fs.existsSync(path.join(prepared.work, 'removed.txt')), 'isolation E2E: untracked additions and deletions preserved');
    const outPath = path.join(root, 'git-show.txt'), fd = fs.openSync(outPath, 'w');
    const show = cp.spawnSync('git', ['show', 'HEAD:baseline.txt'], { cwd: prepared.work, env: prepared.env, stdio: ['ignore', fd, log] });
    fs.closeSync(fd);
    a(show.status === 0 && fs.readFileSync(outPath, 'utf8') === 'historical', 'isolation E2E: independent historical HEAD not candidate baseline');
    a(!fs.readFileSync(path.join(prepared.work, '.git/config'), 'utf8').includes('DO-NOT-COPY'), 'isolation E2E: origin credential absent from independent Git');
    const marker = path.join(root, 'mutated');
    const script = 'const fs=require("fs");fs.writeFileSync("baseline.txt","polluted");fs.writeFileSync(process.argv[1],"ready");setInterval(()=>{},1000);';
    const child = cp.spawn(process.execPath, ['-e', script, marker], { cwd: prepared.work, env: prepared.env, stdio: ['ignore', log, log] });
    let childError;
    child.once('error', e => { childError = e; });
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    try {
      for (let i = 0; i < 100 && !fs.existsSync(marker) && !childError; i++) await new Promise(r => setTimeout(r, 20));
      if (childError) throw childError;
      a(fs.existsSync(marker), 'isolation E2E: real worker reached mutation window');
      child.kill('SIGKILL');
      const exit = await exited;
      a(exit.signal === 'SIGKILL', 'isolation E2E: worker interrupted without finally');
      a(fs.readFileSync(path.join(prepared.work, 'baseline.txt'), 'utf8') === 'polluted', 'isolation E2E: interruption actually left candidate residue');
      a(JSON.stringify(runner.snapshot(source)) === JSON.stringify(prepared.before), 'isolation E2E: main source unchanged after forced interruption');
      a(fs.readFileSync(path.join(source, '.git/config')).equals(sourceGitBefore), 'isolation E2E: source Git config unchanged');
    } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }
  } finally { fs.closeSync(log); fs.rmSync(root, { recursive: true, force: true }); }
}
async function runGuard(a) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-isolation-guard-'));
  const taskOf = n => { const d = path.join(root, n); fs.mkdirSync(d); return d; };
  const MARK = '.wa-run-owner.json';
  const childCode = [
    "const r = require(process.argv[1]);",
    "r.watchParent(process.argv[2], 120);",
    "setInterval(function(){}, 1000);"
  ].join('\n');
  const spawnGuard = task => cp.spawn(process.execPath, ['-e', childCode, path.join(__dirname, 'isolated-runner.js'), task],
    { stdio: 'ignore' });
  const waitExit = (child, ms) => new Promise(resolve => {
    const t = setTimeout(() => resolve(null), ms);
    child.once('exit', (code, signal) => { clearTimeout(t); resolve({ code, signal }); });
  });
  try {
    // ① 父已消失 → worker 必须自杀并留下孤儿证据（而不是被 init 收养后继续跑）
    const t1 = taskOf('orphan');
    fs.writeFileSync(path.join(t1, MARK), JSON.stringify({ token: 'x', work: 'y', source: 'z', parent: freePid(69000), start: '1' }));
    const c1 = spawnGuard(t1);
    let exit = await waitExit(c1, 6000);
    a(exit !== null && exit.signal === 'SIGKILL', 'isolation guard: orphan worker kills itself when parent is gone (实 '
      + JSON.stringify(exit) + ')');
    let evidence = null;
    try { evidence = JSON.parse(fs.readFileSync(path.join(t1, 'orphan.json'), 'utf8')); } catch (e) {}
    a(evidence && evidence.reason === 'parent-gone',
      'isolation guard: orphan evidence written before self-kill (实 ' + JSON.stringify(evidence) + ')');

    // ② 父活着 → 看护必须零副作用（不能把正常任务当孤儿杀掉）
    const t2 = taskOf('alive');
    fs.writeFileSync(path.join(t2, MARK), JSON.stringify({ token: 'x', work: 'y', source: 'z', parent: process.pid, start: runner.identity(process.pid) }));
    const c2 = spawnGuard(t2);
    const still = await waitExit(c2, 900);
    a(still === null && c2.exitCode === null && c2.signalCode === null,
      'isolation guard: live parent leaves worker untouched (实 ' + JSON.stringify(still) + ')');
    a(!fs.existsSync(path.join(t2, 'orphan.json')), 'isolation guard: no orphan evidence while parent is alive');
    c2.kill('SIGKILL'); await waitExit(c2, 2000);

    // ③ pid 被复用（同 pid、不同 starttime）也算父已死 —— 只看「进程存在」会漏
    const t3 = taskOf('reused');
    fs.writeFileSync(path.join(t3, MARK), JSON.stringify({ token: 'x', work: 'y', source: 'z', parent: process.pid, start: String(BigInt(runner.identity(process.pid)) + 1n) }));
    const c3 = spawnGuard(t3);
    exit = await waitExit(c3, 6000);
    a(exit !== null && exit.signal === 'SIGKILL',
      'isolation guard: reused pid (same pid, different start) treated as gone (实 ' + JSON.stringify(exit) + ')');

    // ④ 标记缺失/不可读时不得误杀：看护未武装，进程继续活着
    const t4 = taskOf('nomark');
    const c4 = spawnGuard(t4);
    const alive4 = await waitExit(c4, 700);
    a(alive4 === null, 'isolation guard: unreadable mark does not arm the watcher (实 ' + JSON.stringify(alive4) + ')');
    c4.kill('SIGKILL'); await waitExit(c4, 2000);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
module.exports = { runAll, runIntegration, runGuard };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = (ok, name) => { if (ok) pass++; else fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name); };
  Promise.resolve().then(() => runAll(a)).then(() => runIntegration(a)).then(() => runGuard(a))
    .then(() => { console.log('isolation ' + pass + '/' + fail); process.exitCode = fail ? 1 : 0; })
    .catch(e => { console.error(e); process.exitCode = 2; });
}
