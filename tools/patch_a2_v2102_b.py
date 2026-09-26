#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2.102.0（A2/O12）第二批补丁：给 engines/perf-trace.js 接真消费方。

本仓纪律（逐条遵守）：
  · 补丁先落盘 .py 再执行（终端内联 python3 -c 含引号必被 bash 拆坏）；
  · 每个锚点必须**恰中 1 次**，命中数不符立即 SystemExit（防静默半应用 / 重复应用）。

改动：
  1) engines/tool-diag.js：MODULE_EXPORTS 登记（必载）
  2) engines/tool-diag.js：诊断节 secPerfTrace + collect 挂节
  3) ui/panel.js：工具页两枚出口按钮
  4) ui/panel.js：两枚按钮的绑定（只写 #wa-diag-out、只读、不落盘）
  5) engines/tool-diag.js：UI_BINDINGS 守卫登记
  6) tests/run.js：挂专锁
"""
import sys

ROOT = '/tmp/wa_git'
DIAG = ROOT + '/engines/tool-diag.js'
PANEL = ROOT + '/ui/panel.js'
RUNJS = ROOT + '/tests/run.js'


def rep(path, old, new, expect=1, tag=''):
    with open(path, 'r', encoding='utf-8') as f:
        s = f.read()
    n = s.count(old)
    if n != expect:
        raise SystemExit('anchor hits != %d (got %d) :: %s :: %s' % (expect, n, tag, path))
    if old == new:
        raise SystemExit('no-op patch :: ' + tag)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(s.replace(old, new, expect))
    print('  patched %-26s :: %s' % (tag, path.split('/')[-1]))


# ══════════════ 1. tool-diag：MODULE_EXPORTS 登记 ══════════════
A1 = "    'engines/interop.js': 'interop',\n"
N1 = (
    "    'engines/interop.js': 'interop',\n"
    "    // v2.102.0（A2/O12）：性能基线与分层增量。登记为**必载**——它读 render / tool-diag / canon\n"
    "    //   三处既有出口，缺席就是「性能面读数缺席」，那本身就是断裂，不该被静默兜住。\n"
    "    'engines/perf-trace.js': 'perfTrace',\n"
)

# ══════════════ 2. tool-diag：诊断节 secPerfTrace ══════════════
A2 = "  // ── 汇总 ──\n  function collect() {\n"
N2 = '''  // ── v2.102.0（A2/O12）：性能基线与分层增量（纯内存观测；本节目**不触发基准**） ──
  function secPerfTrace() {
    return safe(function () {
      if (!WA.perfTrace || typeof WA.perfTrace.stat !== 'function') {
        return { error: 'engines/perf-trace.js 未加载（性能面读数缺席）' };
      }
      // 诊断是**旁观**：只念已经发生过的读数。
      //   为什么不在这里跑 coldStart：跑一次会真调四个面的真源（注入/诊断/对位/快照）——
      //   「看一眼体检」不该等于「跑一轮全量」，那会把无头诊断变成有负载的操作。
      const st = WA.perfTrace.stat();
      const sp = WA.perfTrace.split();
      const cur = {};
      WA.perfTrace.LAYERS.forEach(function (L) {
        const c = WA.perfTrace.curve(L);
        cur[L] = { n: c.n, window: c.window, p50: c.p50, p95: c.p95, max: c.max, subTick: c.subTick, dropped: c.dropped };
      });
      return {
        stat: st, split: sp, layers: cur,
        historyCap: st.historyCap, fingerprintCap: st.fingerprintCap,
        classes: WA.perfTrace.CLASSES.map(function (c) {
          const d = WA.perfTrace.CLASS_DEF[c] || {};
          return { cls: c, repeats: d.repeats, budget: d.budget, approx: !!d.approx, note: d.note };
        }),
        dirty: WA.perfTrace.dirtyAll(),
        summary: WA.perfTrace.summaryText(),
        note: '只报已发生过的读数（本节目不触发基准）；host/render 未上报即 declared:false；lowend 档为同机放大估计（真机读数须实机）'
      };
    }, {});
  }

  // ── 汇总 ──
  function collect() {
'''

# ══════════════ 3. tool-diag：collect 挂节 ══════════════
A3 = "      interop: secInterop(),\n"
N3 = (
    "      interop: secInterop(),\n"
    "      // v2.102.0（A2/O12）：性能基线与分层增量。与 interop 同一取舍：读数**只念现场**，\n"
    "      //   不替用户跑基准（跑基准是面板出口的事）。\n"
    "      perfTrace: secPerfTrace(),\n"
)

# ══════════════ 4. panel：两枚按钮 ══════════════
A4 = '        <button class="wa-btn" id="wa-net-freeze" title="协议冻结面：三座桥的 id 与契约版本、诊断节键、拒收码词表——外部读者认的就是这些字符串">协议冻结面</button>\n'
N4 = (
    A4
    + '        <button class="wa-btn" id="wa-perf-view" title="性能面：分层耗时 P50/P95、四个耗时分列、脏集与复用计数（只念已发生的读数，不触发基准）">性能面</button>\n'
    + '        <button class="wa-btn" id="wa-perf-bench" title="基准面：真跑冷启（四面各一遍）与热启（按脏集复用），并复核复用值是否等于现算值">基准面</button>\n'
)

# ══════════════ 5. panel：绑定 ══════════════
A5 = "    // v2.2.0: 运行痕迹清空出口——resetStats / resetHistory 此前无面板入口（画像只能越积越旧）\n"
N5 = '''    // v2.102.0（A2/O12）：性能基线与分层增量两枚出口——perfTrace 此前只活在测试里
    //   （「只在测试里活的导出不算交付」）。两枚按钮同 v2.101.0 规格：只写 #wa-diag-out、
    //   只读、不改设置。区别在**代价**：读曲线不跑基准（看一眼体检 ≠ 跑一轮全量），
    //   测本轮才真跑冷/热两趟，并把「复用值 == 现算值」的复核结论一并念出来。
    const perfView = $('#wa-perf-view');
    if (perfView) perfView.onclick = () => {
      const out = $('#wa-diag-out'); if (!out) return;
      try {
        const P = WA.perfTrace;
        const sp = P.split(), stv = P.stat();
        let html = '<div class="wa-sec">性能面（已发生的读数；本按钮不触发基准）</div>';
        html += '<div class="wa-item"><b>' + esc(P.summaryText()) + '</b></div>';
        html += '<div class="wa-kv"><span>本地 / 序列化 / 宿主 / 渲染</span><b>'
          + esc(sp.localMs + 'ms / ' + sp.serializeMs + 'ms / '
            + (sp.declared.host ? sp.hostMs + 'ms' : '未上报') + ' / '
            + (sp.declared.render ? sp.renderMs + 'ms' : '未上报')) + '</b></div>';
        if ((sp.undeclared || []).length) {
          html += '<div class="wa-dim wa-log-warn">未上报分列：' + esc(sp.undeclared.join(' / '))
            + ' —— 「没人报」不写成 0ms（无头回归里 ui/panel.js 根本不装载）</div>';
        }
        P.LAYERS.forEach(function (L) {
          const c = P.curve(L);
          html += '<div class="wa-item"><b>' + esc(L) + '</b> <span class="wa-dim">' + esc(P.LAYER_LABEL[L] || '') + '</span>'
            + '<div class="wa-kv"><span>P50 / P95 / 峰值</span><b>' + c.p50 + 'ms / ' + c.p95 + 'ms / ' + c.max + 'ms</b></div>'
            + '<div class="wa-kv"><span>样本</span><b>' + c.n + ' 次（窗口 ' + c.window + '/' + P.HISTORY_CAP
            + '，挤出 ' + c.dropped + '；低于 1ms ' + c.subTick + ' 次）</b></div></div>';
        });
        const dirty = P.dirtyAll();
        const dk = P.LAYERS.filter(function (L) { return (dirty[L] || []).length; });
        html += '<div class="wa-dim">脏集：'
          + (dk.length ? dk.map(function (L) { return esc(L + '(' + dirty[L].join(',') + ')'); }).join('、')
            : '无（各层输入指纹自上次消费以来未变）')
          + '；复用 ' + stv.reuse + ' / 重算 ' + stv.recompute + ' / 失败 ' + stv.miss + ' / 挤出 ' + stv.evicted + '</div>';
        out.innerHTML = html;
      } catch (e) { out.textContent = '性能面读取失败：' + (e && e.message); }
    };
    const perfBench = $('#wa-perf-bench');
    if (perfBench) perfBench.onclick = () => {
      const out = $('#wa-diag-out'); if (!out) return;
      try {
        const P = WA.perfTrace;
        const c = P.coldStart();
        const w = P.warmStart();
        let html = '<div class="wa-sec">冷启 / 热启（真跑四个面：注入 / 诊断 / 原著对位 / 世界状态）</div>';
        html += '<div class="wa-item"><b>冷启 ' + c.totalMs + 'ms</b> · 就绪 ' + c.cold + ' 面 / 缺席 ' + c.absent
          + '<br><span class="wa-dim">' + (c.rows.map(function (r) {
            return esc(r.face + ' ' + (r.absent ? '缺席' : r.ms + 'ms'));
          }).join('｜')) + '</span></div>';
        html += '<div class="wa-item"><b>热启 ' + w.totalMs + 'ms</b> · 复用 ' + w.reused + ' / 重算 ' + w.recomputed
          + '<br><span class="wa-dim">' + (w.rows.map(function (r) {
            return esc(r.face + ' ' + (r.hit ? '复用' : r.ms + 'ms'));
          }).join('｜')) + '</span></div>';
        html += '<div class="wa-kv"><span>复用值与现算值逐字段一致</span><b>'
          + (w.consistent === null
            ? '不可判（本次没有复用项——一致性判据不是「恒真」）'
            : (w.consistent ? '是（' + w.checked + ' 面已复核）' : '否 —— 缓存返回的不是现在真算出来的那份'))
          + '</b></div>';
        html += '<div class="wa-dim">' + esc(P.summaryText()) + '；基准档位 '
          + esc(P.CLASSES.join(' / ')) + '（lowend 为同机放大估计，真机读数须实机）</div>';
        out.innerHTML = html;
      } catch (e) { out.textContent = '基准失败：' + (e && e.message); }
    };
''' + A5

# ══════════════ 6. tool-diag：UI_BINDINGS 登记 ══════════════
A6 = "      'wa-net-view', 'wa-net-freeze',\n"
N6 = (
    "      'wa-net-view', 'wa-net-freeze',\n"
    "      // v2.102.0（A2/O12）：性能面两枚出口。同 v2.101.0 的理由——「渲染了但绑定写错 id」\n"
    "      //   这类断裂只有在守卫登记过的控件上才会被发现。\n"
    "      'wa-perf-view', 'wa-perf-bench',\n"
)

# ══════════════ 7. tests/run.js：挂专锁 ══════════════
A7 = ("  require('./interop-v2101.js').runAll(assert);\n"
      "  require('./interop-v2101.js').runNegative(assert);\n")
N7 = (A7
      + "  // ── v2.102.0（A2/O12）：性能基线与分层增量 —— 「快不快」与「变了才不算」都要能被核对 ──\n"
      + "  //   上一面（O11）治的是「装了没 / 装对了没」，本面治的是**同一件事在时间轴上的另一半**：\n"
      + "  //   注入链每轮把全部源重建一遍，而「哪些源真受影响」「冷启一次要多久」此前都无从判定；\n"
      + "  //   本地计算 / 宿主 API / 序列化 / UI 渲染四类耗时更全混在一个 totalMs 里。\n"
      + "  //   本面三条最容易被顺手破坏的口径逐条钉住：① **纯内存观测**（不写存档、不落盘，\n"
      + "  //   判据钉存档而不是钉 stat——`stat` 会被懒初始化推高，那是本面实测到的一条事实）；\n"
      + "  //   ② **指纹不可读（na）一律重算**（绝不拿旧值冒充命中）；③ **复用值必须等于现算值**\n"
      + "  //   （只比「缓存 vs 缓存」是自指的，恒真 ⇒ 判据必须对**独立再算一遍**的那份）。\n"
      + "  //   一条自纠留在锁内：`ensure` 不计时（计时归调用方）——两处都计一遍会让同一笔账进两个桶，\n"
      + "  //   而那种失真在读数上完全看不出来（两边都「有数」）。\n"
      + "  require('./perf-trace-v2102.js').runAll(assert);\n"
      + "  require('./perf-trace-v2102.js').runNegative(assert);\n"
      )

if __name__ == '__main__':
    print('== patch_a2_v2102_b ==')
    rep(DIAG, A1, N1, 1, 'diag:MODULE_EXPORTS')
    rep(DIAG, A2, N2, 1, 'diag:secPerfTrace')
    rep(DIAG, A3, N3, 1, 'diag:collect')
    rep(PANEL, A4, N4, 1, 'panel:buttons')
    rep(PANEL, A5, N5, 1, 'panel:bindings')
    rep(DIAG, A6, N6, 1, 'diag:UI_BINDINGS')
    rep(RUNJS, A7, N7, 1, 'run.js:lock')
    print('OK: 7 处补丁全部命中 1 次')