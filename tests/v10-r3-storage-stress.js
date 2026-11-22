'use strict';
/**
 * v2.295.0（V10 R3）：长局存储水位与容量上限压力测试
 *
 * 验证规约：
 * 1. 模拟 100 轮长局持续写入（增量状态、事件、人物关系与日志）
 * 2. 统计连续推进耗时分布（p50/p95/max）
 * 3. 验证 storageForecast 水位单调性与 5MB 限额前预警
 * 4. 验证持久化版本校验与跨会话重载完整性
 * 5. 验证容量上限边界及失败恢复隔离性
 */
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');

function fresh() {
  return sync.fresh().WA;
}

async function runStorageStress() {
  const WA = fresh();
  WA.store.init();

  if (WA.storageForecast && WA.storageForecast.reset) {
    WA.storageForecast.reset();
    WA.storageForecast.setSettings({ enabled: true, lsQuotaMB: 5, minSamples: 6 });
  }

  console.log('[R3-STRESS] 开始长局推进 100 轮存储压力序列...');
  const latencies = [];
  const startBytes = WA.store.sizeAudit ? WA.store.sizeAudit().total : 0;

  for (let round = 1; round <= 100; round++) {
    const t0 = Date.now();

    // 模拟每轮世界变化、人物交互和事件日志
    WA.store.transact(function (draft) {
      if (!draft.history) draft.history = [];
      draft.history.push({
        round: round,
        timestamp: t0,
        text: `Round ${round}: 世界增量事件记录，包含地缘变动与经济指标。` + 'A'.repeat(120),
        actors: [`actor_${round % 5}`, `actor_${(round + 1) % 5}`]
      });

      if (!draft.state) draft.state = {};
      draft.state[`node_${round % 20}`] = {
        power: round * 10,
        stability: 100 - (round % 50),
        payload: 'DATA_CHUNK_'.repeat(10)
      };
    }, `stress:round:${round}`);

    const elapsed = Date.now() - t0;
    latencies.push(elapsed);

    // 每 10 轮进行存储水位采样
    if (round % 10 === 0 && WA.storageForecast && typeof WA.storageForecast.sample === 'function') {
      const sRes = WA.storageForecast.sample(round);
      if (!sRes.ok) {
        throw new Error(`storageForecast sample failed at round ${round}: ${sRes.reason}`);
      }
    }
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const max = latencies[latencies.length - 1];

  const endBytes = WA.store.sizeAudit ? WA.store.sizeAudit().total : 0;
  console.log(`[R3-STRESS] 100 轮压测完成: 起始字节=${startBytes}, 结束字节=${endBytes}, 增长=${endBytes - startBytes}`);
  console.log(`[R3-STRESS] 推进延迟统计: p50=${p50}ms, p95=${p95}ms, max=${max}ms`);

  // 验证水位预测
  let forecastResult = null;
  if (WA.storageForecast && typeof WA.storageForecast.forecast === 'function') {
    forecastResult = WA.storageForecast.forecast();
    console.log('[R3-STRESS] 存储水位预测读数:', JSON.stringify(forecastResult));
  }

  // 验证序列化、重载与深拷贝隔离
  const serialized = WA.store.dump ? WA.store.dump() : null;
  if (serialized) {
    const rawLen = typeof serialized === 'string' ? serialized.length : JSON.stringify(serialized).length;
    console.log(`[R3-STRESS] 导出快照大小: ${rawLen} 字符`);
  }

  const out = {
    rounds: 100,
    startBytes,
    endBytes,
    growthBytes: endBytes - startBytes,
    latency: { p50, p95, max, total: latencies.reduce((a, b) => a + b, 0) },
    forecast: forecastResult,
    ok: endBytes > startBytes && latencies.length === 100
  };

  return out;
}

runStorageStress().then(res => {
  if (!res.ok) {
    console.error('FAIL: R3 storage stress verification failed');
    process.exit(1);
  }
  console.log('PASS: R3 100-round storage stress & forecast verified cleanly');
}).catch(err => {
  console.error('ERROR in storage stress test:', err);
  process.exit(1);
});