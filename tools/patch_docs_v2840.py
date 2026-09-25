#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2.84.0 文档收口：README 头部插入 v2.84.0 条目；ITERATION_LOG 追加 R67。
纪律：锚点命中数必须为 1，否则整体放弃；写入后全文自检。"""
import io
BASE = '/tmp/wa_git'

README_ANCHOR = '<b>v2.83.0</b> — <b>模块契约与配置迁移（第三十七面：引用多 ≠ 必须先装载 / 配置能不能整包搬走）</b>'

README_BLOCK = '''<b>v2.84.0</b> — <b>测试上下文隔离 · 统一输入边界（第三十八面：共享的宿主面 / 「字符串化兜底」把非法值静默升格）</b>。交付两件：`tests/isolated-runner.js`（238 行，回归隔离与锁身份）+ `tests/context-guard.js`（289 行，宿主面跨块泄漏的量测与回收），以及 `core/input-guard.js`（121 行，统一输入边界层）+ 专锁 `tests/input-guard-v2840.js`（213 项）。
  <b>A1——「回归跑在谁的上下文里」此前没有答案，而且它错得很静默。</b>`tests/run.js` 是单进程顺序脚本，约 60 个 section 共享一个 `global`，若干 section 会重装产品模块、装载 UI 层（`ui-gate-sync.js` 的 `fresh()`）、写入自己的 localStorage 夹具，而这些写入**从不回收**。实测（只读探针四个 section 的宿主面差值）<b>4/4 都留了痕迹</b>：`causal-v2620` 留下 WA 命名空间 +9（`ui`/`uiSettings`/`assistant` + mini-DOM 六个内部名）、`evict-meta-v2610` 留下 2 个 storage 键与枚举序变化、`world-v2630` 与 `style-craft-v2510` 留下监听器条数变化。最直接的后果：出口面口径里 `OPTIONAL = ['ui','uiSettings','assistant']` 的「UI 未装载」前提，在 `causal-v2620` 之后的任何 section 里<b>已经不成立</b>——前面的 section 决定后面的 section 看到什么。
  <b>两条纪律来自实测，不是口味。</b>① <b>只回收本 section 新增的东西</b>（差值口径），不重置整块宿主面——run.js 里存在被注释明确记录的跨块夹具（靠前 section 把 `mockCtx.chat` 换成别的形状且不还原，ui-gate 依赖该事实并自行复位），宿主整体复位会打断它们。② <b>回收面收窄到 UI 装载面</b>：首版曾把「本 section 新增的全部 storage 键」也一并回收，实测直接把 4 个用例打破（观测切片生成 / 突发事件生成 / 突发事件激活(3轮) / 当前轮小纸条）——它们复用前面 section 已写下的 `worldaxis_state_test_chat_001` / `worldaxis_writer_id` / `worldaxis_api_channels_v1`。也就是说 run.js 的 storage 夹具是<b>跨 section 共享的既成事实</b>，不是泄漏；<b>把「共享」当「脏」回收，等于用判据去改被测行为。</b>
  <b>回归隔离：锁身份用「pid + starttime」而不是 pid。</b>`tests/isolated-runner.js` 把每次回归放进独立候选树（`/tmp/worldaxis-regression-XXXXXX`），锁主人身份取自 `/proc/<pid>/stat` 第 22 字段（starttime）——只看 pid 会把「pid 被复用」误当成「锁主人还活着」，陈旧锁永远收不回。陈旧锁<b>绝不自动回收</b>：只有调用方明确要求、且两道条件同时成立（锁主人身份确认 stale + worker 已死）才删。
  <b>A2——「非法输入被静默升格」是两族实测，不是「想当然该防」。</b>① <b>字符串化兜底把非法值升格成事实</b>：约 28 个引擎各写了一份同款 `clean(v, max) = String(v == null ? '' : v).replace(...)`，于是 NaN 被升格成字面量 `'NaN'`、对象被升格成 `'[object Object]'`。实测 `survival.set('甲', NaN)` <b>建出一条全 null 的读数记录并报 ok</b>；`temporalLock.lock(NaN)` 上锁成功且 `label='NaN'`；`threads.open(NaN)` 立出一桩名叫「NaN」的悬案——<b>一次「参数传错」被记成了「世界里真发生了这件事」</b>。② 同一段兜底对<b>带敌意 toString 的对象直接抛</b>：`String({toString(){throw ...}})` 会抛出，而调用它的多是扫描 localStorage 的巡检路径（sweep 垃圾回收 / 体积审计 / 孤儿盘点）——一个抛会打断<b>整轮巡检</b>，于是「巡检没查出问题」与「巡检没跑完」在读数上完全不可分。
  <b>设计边界三条</b>：<b>不抛</b>（任何输入都返回结果对象/兜底值；本模块是巡检路径的安全网，它自己抛一次，安全网就变成新的断点）；<b>不作主</b>（不猜意图——NaN 不会被当成 0、对象不会被 JSON 化，非法就是非法，返回空值交给调用方按既有 `missing-fields` 一类码拒收）；<b>单一真源</b>（形态判定只写在这里，各引擎不再自备一份 `String(...)` 兜底）。
  <b>本版自己踩到并纠正的三处（都在「判据的输入面必须与结论面同宽」这条上）。</b>① <b>负控制打不到靶时，「判据可现形」的结论全部无效</b>：A1 让负控制改跑真源码副本，而这些副本原本被放进<b>裸 VM 上下文</b>（只有 `window`/`global`/`console`），A2 之后引擎委托 `WA.inputGuard.text` ⇒ 裸上下文没有核心模块，回归以 `runner-failed`（异常打死进程）收场而不是干净失败。修法是给负控制装配<b>与真装载同序的最小宿主面</b>（`tests/synth-host.js` 的 `negativeContext()`，核心原语用真源码、不抄第二份），并把整组套进 try/catch 报一条显式红行——<b>崩溃会掩盖中途「通过 N」的读数，干净失败才是可定位的读数形态</b>（r11 `runner-failed` ⇒ r12 `通过 7396 / 失败 4`）。② <b>防线变深不等于判据坏</b>：`survival.set` / `threads.open` 的守卫被摘掉后缺陷不再复现，因为 A2 之后防线成了两层（入口参数守卫 + inputGuard 形态兜底），NaN 已被 `text(NaN)` → `''` 挡下。这两处负控制改为<b>两层一起拆</b>，其余仍能单层复现的入口保持不动——<b>不把判据改成「必须两层」的过度约束</b>。③ <b>同一个 ns 同时出现在「已回收」与「未回收」里</b>：`context-guard.js` 的 `restore()` 末尾用 `!isUiFaceNs(ns)` 算 kept，而此刻 `WA[ns]` 已被删，谓词必然答「非 UI 面」——<b>在回收之后重算一个依赖当前值形状的谓词，判据会与自己的动作相反</b>；`diff()` 内部早已算定 `uiAddedNs`/`nonUiAddedNs`，必须复用而不是重算。同处修掉 `diff()` 对新增命名空间直接 `return` 导致其内部成员从不进读数的问题（负控制 A 打的正是这个形状）。修后探针两向自证：补丁前副本 `waMembers=[]` 且 `kept` 含 `ns:__leakNs2840`（自相矛盾），补丁后 `waMembers` 登记到位、`kept` 干净。
  <b>门禁</b>：`node tests/run.js` → <b>通过 7404 / 失败 0</b>（r12 为 <b>7396 / 4</b>，r11 为 `runner-failed`）；`tests/settle-v2830.js` → <b>55 / 0</b>；`tests/input-boundary-v2790.js` → <b>48 / 0</b>；`tests/module-registry-gate.js` → <b>文件 106 / 命名空间 114 / 装载期边 23 / 硬边 0 / 调用期引用 44 / 结构问题 0</b>；`tests/inventory.js` → <b>产品文件 110 · 声明表登记 109 · 命名空间 109 · 成员 1216 · 静态引用 2281 处</b>（悬空 0 / UI 悬空 0 / 未登记 0 / 登记表悬空 0）；`tests/export-contract.js` → <b>ns= 103 members= 580 chars= 7169</b>；`tests/dead-export-gate.js` → <b>dead 444 · uiDead 4 · dataOnly 160 · 归因 test-only 291 / 其余 153 · 证据 448 条 · version=2.84.0</b>；`tests/test-surface-gate.js` → <b>文件面 62 · 锁 57 · 可达 62 · spawn 4 · 孤儿 0</b>。
  <b>与 v2.83.0 的关系</b>：v2.83.0 把「模块依赖」从静态印象变成运行期事实（引用多 ≠ 必须先装载）；本版把「测试跑在谁的上下文里」从隐式前提变成显式台词（共享 ≠ 脏），并把「输入能不能信」从二十几份各自发明的兜底变成一道统一边界——同一条纪律：<b>把「两态不可分」的地方拆成独立成词的事实，而且判据必须能被证伪。</b>
'''

LOG_BLOCK = '''
### R67 · 2026-09-25 · v2.84.0 测试上下文隔离 · 统一输入边界（第三十八面：共享的宿主面 / 「字符串化兜底」把非法值静默升格）
- **做了什么**：
  - `tests/isolated-runner.js`（新，238 行）＋ `tests/isolated-runner-lock.js`（新，211 行）：全量回归放进独立候选树（`/tmp/worldaxis-regression-XXXXXX`），锁身份取「pid + starttime」，陈旧锁绝不自动回收（须锁主人 stale **且** worker 已死两道条件同时成立）。
  - `tests/context-guard.js`（新，289 行）：宿主面跨块泄漏的量测（`snap`/`diff`）、回收（`boundary().close()`）、审计（`audit()`）与两类硬信号（`hardSignals`/`softSignals`）。
  - `tests/synth-host.js`（新，112 行）：负控制/破坏副本的宿主面装配器，`negativeContext(opts)` 读 run.js 的 LOAD 清单（不抄第二份）按需装核心原语与对等引擎。
  - `core/input-guard.js`（新，121 行）＋ `tests/input-guard-v2840.js`（新，213 项）：统一输入边界（`text`/`num`/`int`/`oneOf`/`list`/`count`/`check`），约 28 个引擎的 `clean()` 委托到它。
  - `tests/run.js`：A1 四块（隔离/锁/上下文边界/负控制）＋ A2 输入边界锁接线；G 组三处负控制改用 `negativeContext(...)` 并各加「宿主面到场自证」，整组套 try/catch 报 `[G0]`；`tests/settle-v2830.js` 陈旧读数 113/105 → 114/106。
- **为什么**：
  - 「回归跑在谁的上下文里」此前没有答案，而且它错得很静默。实测四个 section 的宿主面差值 **4/4 都留了痕迹**：`causal-v2620` 留下 WA 命名空间 +9（`ui`/`uiSettings`/`assistant` + mini-DOM 六个内部名）、`evict-meta-v2610` 留下 2 个 storage 键与枚举序变化、`world-v2630` 与 `style-craft-v2510` 留下监听器条数变化。后果是硬的：出口面口径里 `OPTIONAL = ['ui','uiSettings','assistant']` 的「UI 未装载」前提，在 `causal-v2620` 之后的任何 section 里**已经不成立**。
  - 「输入可不可信」此前同样是隐式的，且两族缺陷都是实测出来的：① 约 28 份同款 `clean()` 把 NaN 升格成字面量 `'NaN'`、对象升格成 `'[object Object]'` —— `survival.set('甲', NaN)` 建出一条全 null 的读数记录**并报 ok**，`temporalLock.lock(NaN)` 上锁成功且 `label='NaN'`，`threads.open(NaN)` 立出一桩名叫「NaN」的悬案；**一次「参数传错」被记成了「世界里真发生了这件事」**。② 同一段兜底对带敌意 `toString` 的对象直接抛，而调用它的多是扫描 localStorage 的巡检路径（sweep / 体积审计 / 孤儿盘点）—— 一个抛打断**整轮巡检**，于是「巡检没查出问题」与「巡检没跑完」在读数上完全不可分。
- **影响范围**：`core/input-guard.js`、约 28 个 `engines/*.js`（`clean()` 委托化）、`tests/run.js`、`tests/synth-host.js`、`tests/context-guard.js`、`tests/isolated-runner.js`、`tests/isolated-runner-lock.js`、`tests/input-guard-v2840.js`、`tests/input-boundary-v2790.js`、`tests/settle-v2830.js`、`tests/causal-v2620.js`、`tests/intel-v2530.js`、`tests/life-v2520.js`、`tests/longline-v2550.js`、`tests/org-v2540.js`、`tests/reject-v2780.js`、`index.js`、`manifest.json`、`ui/panel.js`、`tests/module-registry-ledger.json`、`tests/dead-export-ledger.json`、`README.md`、`ITERATION_LOG.md`。`tools/*.py` 不入库。
- **门禁结果**：`node tests/run.js` → **通过 7404 / 失败 0**（r12 为 **7396 / 4**、r11 为 `runner-failed`）；`tests/settle-v2830.js` → **55 / 0**；`tests/input-boundary-v2790.js` → **48 / 0**；`tests/module-registry-gate.js` → 文件 106 / 命名空间 114 / 装载期边 23 / 硬边 0 / 调用期引用 44 / 结构问题 0；`tests/inventory.js` → 产品文件 110 / 声明表登记 109 / 命名空间 109 / 成员 1216 / 静态引用 2281（四类悬空均 0）；`tests/export-contract.js` → `ns= 103 members= 580 chars= 7169`；`tests/dead-export-gate.js` → dead 444 / uiDead 4 / dataOnly 160 / 仅测试 291，账本 version 2.84.0；`tests/test-surface-gate.js` → 文件面 62 / 锁 57 / 可达 62 / spawn 4 / 孤儿 0。
- **可复用的判据**（本轮新增，编号续 R66）：
  - (22) **崩溃会掩盖读数，干净失败才是可定位的形态**：负控制改跑真源码副本后，副本被放进裸 VM 上下文，而产品侧已委托 `WA.inputGuard` ⇒ 副本抛异常、父进程 `runner-failed`，日志停在崩溃点、中途「通过 N」全部不可用。修法是给负控制装配「与真装载同序的最小宿主面」（`negativeContext()` 读 LOAD 清单、核心原语用真源码不抄第二份），并把整组套 try/catch 报一条显式红行 —— **负控制打不到靶时，前面那些「判据可现形」的结论全部无效，这个失效必须自己成为一条红行。**
  - (23) **防线变深 ≠ 判据坏，但负控制必须仍能打到靶**：`survival.set` / `threads.open` 的守卫被摘掉后缺陷不再复现，因为 A2 之后防线成两层（入口参数守卫 + inputGuard 形态兜底），NaN 已被 `text(NaN)` → `''` 挡下。这两处改为**两层一起拆**（并在测试侧断言「第二层锚点恰 1 次」「第二层破坏确实发生」），其余仍能单层复现的入口保持不动 —— **不把判据改成「必须两层」的过度约束，也不允许它退化成假绿。**
  - (24) **回收之后不得重算依赖当前值形状的谓词（R65⑧ 的复发点）**：`restore()` 末尾用 `!isUiFaceNs(ns)` 算 kept，而此刻 `WA[ns]` 已被删，谓词必然答「非 UI 面」⇒ 同一个 ns 同时出现在 `waNs`（说「已回收」）与 `kept`（说「未回收」）里。`diff()` 内部早已算定 `uiAddedNs`/`nonUiAddedNs`，**必须复用而不是重算**。同处修掉 `diff()` 对新增命名空间直接 `return`、致其内部成员从不进读数的问题 —— 负控制 A 打的正是这个形状（`WA.ui = {…}` + `WA.ui.leakMember`），**判据的输入面必须与结论面同宽**。
  - (25) **「回收口径」必须双向证明**：storage 痕迹**不回收**、但必须出现在只报告面；UI 面泄漏**必回收**、且零残留。三向负控制：A 人造 UI 面泄漏（2 命名空间 + 1 成员）⇒ 必真收回；B 人造收不回的泄漏（不可配置属性）⇒ 必报成残留硬痕迹 + skipped（**回收失败 ≠ 回收成功**）；C 非 UI 面的同型新增 ⇒ 不被回收、只进报告（**硬面是真判据，不是「凡新增都算硬」**）。
  - (26) **「共享」不等于「脏」——把共享当脏回收，等于用判据去改被测行为**：首版把「本 section 新增的全部 storage 键」一并回收，实测直接打破 4 个用例（观测切片 / 突发事件生成 / 突发事件激活(3轮) / 当前轮小纸条），它们复用前面 section 已写下的状态键。**差值口径只对「本 section 新增」生效，回收面必须收窄到 UI 装载面。**
  - (27) **锁身份用「pid + starttime」，陈旧锁绝不自动回收**：只看 pid 会把「pid 被复用」误当成「锁主人还活着」，陈旧锁永远收不回；自动回收则会在并发回归里删掉别人的活锁。释放时必须校验 token，防「误释放他人的锁」。
  - (28) **冻结读数必须全文残留扫描（R65⑱ 复审）**：本版 `ns 102→103 / members 573→580 / chars 7108→7169`、`命名空间 113→114 / 装载文件 105→106`，改完锚点后仍有一处陈旧读数（`settle-v2830.js` 的 `113 / 105`）被 r12 抓出。**版本升档与读数同步都是「多处字面量」任务，锚点改写不等于全文无残留。**
- **提交**：`（见本版提交）`。
'''

def patch(rel, anchor, block):
    p = '%s/%s' % (BASE, rel)
    src = io.open(p, encoding='utf-8').read()
    hits = src.count(anchor)
    if hits != 1:
        print('中止：%s 中锚点命中 %d 次（须为 1）' % (rel, hits))
        return False
    out = src.replace(anchor, block + anchor)
    io.open(p, 'w', encoding='utf-8').write(out)
    print('已改写 %s' % rel)
    return True

def main():
    if not patch('README.md', README_ANCHOR, README_BLOCK):
        return 2
    p = '%s/ITERATION_LOG.md' % BASE
    src = io.open(p, encoding='utf-8').read()
    if '### R67' in src:
        print('中止：ITERATION_LOG 已含 R67')
        return 2
    io.open(p, 'a', encoding='utf-8').write(LOG_BLOCK)
    print('已追加 ITERATION_LOG.md')
    r = io.open('%s/README.md' % BASE, encoding='utf-8').read()
    for token in ['v2.84.0', '7404', 'ns= 103 members= 580 chars= 7169', 'negativeContext', 'input-guard.js']:
        print('  README 含 %-36s %s' % (token, token in r))
    l = io.open(p, encoding='utf-8').read()
    for token in ['R67', 'v2.84.0', '7404']:
        print('  LOG 含 %-36s %s' % (token, token in l))
    return 0

if __name__ == '__main__':
    import sys
    sys.exit(main())
