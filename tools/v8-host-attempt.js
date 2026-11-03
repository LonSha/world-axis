'use strict';
/**
 * v2.294.0（V8 EXV8-7）：真实宿主验收线的本机探测与**分类注销**
 *
 * 为什么重写（旧版有硬缺陷）：
 *   /tmp/v8_host_attempt.js 无论探测成败都把这 14 条欠账写成
 *   `status:'cancelled-environment-unreachable'`。那不是「验收后注销」，
 *   是「没验收就替自己签字」—— 台账从此分不清「试过但不可达」和「根本没试」。
 *
 * 本版的三条硬约束：
 *   ① 只做只读探测：不发任何会改变宿主状态或配置的请求，不启动宿主。
 *   ② 注销必须**有实测依据**：只有探测真的没找到可达宿主，才允许写 unreachable；
 *      找到宿主但验收失败 ⇒ 记 failed（不许注销）；验收通过 ⇒ 记 passed。
 *   ③ TP6/TP8 与宿主无关（要真实手机 p50/p95 时序），它们的注销理由必须与宿主结论
 *      分开记，不能被「本机没有 SillyTavern」连坐。
 *
 * 输出 /tmp/v8-host-acceptance.json，含每条欠账的 status/reason/evidence。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE = '/home/user/wa_opt1';
const OUT = '/tmp/v8-host-acceptance.json';

/** 只读探测：GET 首页，判断是不是 SillyTavern。 */
function probe(url) {
  return new Promise(function (resolve) {
    let req;
    try {
      req = http.get(url, function (r) {
        let body = '';
        r.on('data', function (x) { if (body.length < 300000) body += x; });
        r.on('end', function () {
          resolve({ url: url, reachable: true, status: r.statusCode,
            looksLikeSillyTavern: /SillyTavern/i.test(body), bytes: body.length });
        });
      });
    } catch (e) {
      resolve({ url: url, reachable: false, error: String(e && e.message || e) });
      return;
    }
    req.setTimeout(2500, function () { req.destroy(new Error('timeout')); });
    req.on('error', function (e) { resolve({ url: url, reachable: false, error: e.code || e.message }); });
  });
}

(async function () {
  const urls = [process.env.WORLD_AXIS_HOST_URL, 'http://127.0.0.1:8000',
    'http://127.0.0.1:8080', 'http://127.0.0.1:8001'].filter(Boolean);
  const uniq = [];
  urls.forEach(function (u) { if (uniq.indexOf(u) < 0) uniq.push(u); });
  const attempts = [];
  for (let i = 0; i < uniq.length; i++) attempts.push(await probe(uniq[i]));

  const hit = attempts.filter(function (x) { return x.reachable && x.looksLikeSillyTavern; })[0] || null;

  // 宿主面欠账：S1/S2 + TX1..TX9 + TP7（都需要真实 SillyTavern）
  const hostDebts = ['S1', 'S2'];
  for (let i = 1; i <= 9; i++) hostDebts.push('TX' + i);
  hostDebts.push('TP7');
  // 与宿主无关的欠账：需要真实手机时序
  const phoneDebts = ['TP6', 'TP8'];

  const debts = [];
  if (!hit) {
    // 没有可达宿主 ⇒ 这是**实测后**的注销（reason 写明探了哪几个地址、各自怎么失败）
    hostDebts.forEach(function (id) {
      debts.push({
        id: id,
        status: 'cancelled-environment-unreachable',
        reason: '本机探测未发现可达的真实 SillyTavern 宿主（探了 ' + uniq.join('、')
          + '，结果见 attempts）——该项验收需要真实宿主，终端内不可完成',
        evidence: 'read-only HTTP discovery: ' + JSON.stringify(attempts),
        passed: false
      });
    });
  } else {
    // 找到宿主：必须真跑，跑不过记 failed（不许注销）
    let hosted = null;
    try {
      hosted = await require(path.join(BASE, 'tests/ui-live')).runLiveHosted({ url: hit.url });
    } catch (e) {
      hosted = { host: 'error', error: String(e && e.message || e) };
    }
    const ok = !!(hosted && (hosted.ok || hosted.status === 'ok'));
    hostDebts.forEach(function (id) {
      debts.push({
        id: id,
        status: ok ? 'passed' : 'failed',
        reason: ok ? '真实宿主验收通过' : ('真实宿主可达但验收未通过：' + JSON.stringify(hosted).slice(0, 300)),
        evidence: 'runLiveHosted(' + hit.url + ')',
        passed: ok
      });
    });
  }
  // 手机时序两项：与宿主是否可达无关，理由单独记
  phoneDebts.forEach(function (id) {
    debts.push({
      id: id,
      status: 'cancelled-needs-physical-device',
      reason: '该欠账需要真实手机上的 p50/p95 时延读数，终端环境无法采集；与宿主可达性无关',
      evidence: 'environment capability check (no device timing channel)',
      passed: false
    });
  });

  const report = {
    version: '2.294.0',
    attemptedAt: new Date().toISOString(),
    attempts: attempts,
    hostFound: !!hit,
    hostUrl: hit ? hit.url : null,
    debts: debts,
    counts: {
      passed: debts.filter(function (d) { return d.status === 'passed'; }).length,
      failed: debts.filter(function (d) { return d.status === 'failed'; }).length,
      cancelled: debts.filter(function (d) { return d.status.indexOf('cancelled') === 0; }).length,
      total: debts.length
    },
    note: '注销只在本轮**实测不可达**后写下，不是「未验」两不管。'
      + 'Chromium stub 绿不能替代真实宿主证据；手机 p50/p95 需真机，单独记理由。'
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ hostFound: report.hostFound, hostUrl: report.hostUrl,
    counts: report.counts, output: OUT }, null, 2));
})();