# -*- coding: utf-8 -*-
"""v2.86.0 落点 A5：注入链韧性 + 失败分类（render/inject.js）

实测缺陷（见 tools/diag_inject_v2860.js 六组读数）：
  · applyInjections 里 43 个 `WA.<ns>.buildBlock()` 调用点**只有 style 一处在 try/catch 内**；
  · 让 bonds 抛一次异常 ⇒ 整链中断，**47 个源全部丢失**（连世界状态的时间/背景/人物一起消失），
    异常还冒泡出扩展；
  · 真 API 路径下给 bonds 灌缺 `types` 的行、ladder 缺 `rungs`、shadow 缺 `holders`，
    buildBlock 确实抛（bonds.js:83 `r.types.join`、ladder.js:161 `r.rungs[...]`、shadow.js:206 `x.holders.join`）。

口径（三态如实）：源模块缺席 / 源产出空串 / 源**抛异常** 是三件事；
  前两者不进台账，第三者只丢该源 + 留痕（按用户面板上的显示名记），异常不外泄。

关键约束（本补丁与两道既有成类锁共存）：
  · tests/inject-sources-v2560.js  [A] 要求源码面里仍有 `WA.<ns>.buildBlock(`；
    [B] 要求仍有 `vis.<ns>` 读取点；[A2] 要求**不得**出现 `if (WA.<ns>)` 形态。
    ⇒ 故本补丁**保留源守卫原样**（`if (vis.life && WA.life)`），只把调用包进 engineCall，
      绝不把 `vis.x` 挪进 engineCall 首参（那会让负控制破坏 `vis.life && WA.life` 后
      仍有 `vis.life` 残留，三条负控制假绿）。
  · 接口面零增删（tests/export-contract.js / FROZEN2800 / inventory 账本不受影响）：
    失败台账经**既有** visibilityStat() 的返回值暴露，不新增成员。
"""
import io, re, sys, ast

BASE = '/tmp/wa_git/'
REL = 'render/inject.js'
P = BASE + REL
s = io.open(P, encoding='utf-8').read()
orig_len = len(s.encode('utf-8'))


def swap(src, old, new, tag):
    n = src.count(old)
    if n != 1:
        print('ABORT: anchor hits=%d (must be 1) :: %s' % (n, tag))
        sys.exit(2)
    return src.replace(old, new)


# ══════════════════ 1. 基建：engineCall / 失败台账 ══════════════════
INFRA_ANCHOR = '  WA.render = {\n'
INFRA = '''  // ══════════════════ v2.86.0 A5：注入链韧性 ══════════════════
  /**
   * 源显示名表（与 SOURCES / VIS_NAMES 同批，仅供失败台账报「用户看得懂的名字」）。
   *   内部常量，不进接口面——避免为观测面付接口冻结的代价。
   */
  const SRC_NAME = {
    clock: '世界时间', pulse: '世界脉搏', background: '世界背景', people: '人物此刻',
    currents: '可感知暗流', echoes: '回声',
    style: '叙事工艺', life: '人物生活', intel: '因果与情报', org: '资源与组织',
    longline: '长线伏笔', causal: '因果结算', world: '世界织体', weather: '天气与物候',
    difficulty: '世界难度', affect: '情绪通道', bonds: '关系六型', masks: '假面',
    temporalLock: '时间锁', temperament: '双层性格', fondness: '好感审计',
    parallelEvents: '场外事件', eraCycle: '资料片周期', survival: '生存三轴', warrant: '通缉',
    beastBond: '驯兽', appearance: '外貌契约', ladder: '原型阶梯', sceneSlice: '情境切片',
    gauge: '阻尼量规', rivalry: '竞争焦点', enigma: '信息暗礁', tempo: '节奏齿轮',
    quota: '伏笔配给', spotlight: '焦点分配', karma: '业力账', hazard: '风险账',
    marginal: '边际折旧', tolerance: '手段耐受', events: '事件调度', checkpoints: '快照与分支',
    shadow: '社交漩涡', threads: '悬案',
    memory: '记忆', memorySampler: '主观记忆', pmem: '主观记忆', summarizer: '叙事摘要',
    opinion: '舆情', ledger: '重大事件账本', digest: '世界推演', nearEvent: '近端事件'
  };
  /**
   * 失败台账：源显示名 -> { count, lastMsg, lastAt }。
   *   与「源产出空串」分开记 —— 空串是「这一轮没什么可说」（正常），
   *   抛异常是「这一块的数据坏了」（要看）。两者混记就再也答不出
   *   「世界状态为什么没进正文」到底是没内容还是坏了。
   */
  const engineFailures = {};
  function noteEngineFailure(ns, err) {
    const name = SRC_NAME[ns] || ns;
    const rec = engineFailures[name] || (engineFailures[name] = { count: 0, lastMsg: '', lastAt: 0 });
    rec.count++;
    rec.lastMsg = String((err && err.message) || err || '').slice(0, 160);
    rec.lastAt = clockWall();
    try { if (WA.log) WA.log('warn', '注入源构建失败（只丢该源）: ' + name + ' :: ' + rec.lastMsg); } catch (e) {}
    return rec;
  }
  function engineFailuresView() {
    const out = {};
    Object.keys(engineFailures).forEach(function (k) {
      out[k] = { count: engineFailures[k].count, lastMsg: engineFailures[k].lastMsg, lastAt: engineFailures[k].lastAt };
    });
    return out;
  }
  function engineFailureCount() {
    return Object.keys(engineFailures).reduce(function (a, k) { return a + engineFailures[k].count; }, 0);
  }
  /**
   * 注入链的**唯一**引擎调用出口。
   *   修前：43 个调用点里 42 个裸调用 ⇒ 任一可选源抛一次就把整条链打断（实测 0/47）。
   *   现在：异常在这里被收住 ⇒ 只丢该源、其余照常注入、异常不外泄、台账留痕。
   *   返回值一律为字符串（空串表示「本块无内容或本块失败」），调用点的 `if (xx)` 照旧可用。
   */
  function engineCall(ns, fn) {
    if (!WA[ns]) return '';
    try { return fn() || ''; }
    catch (e) { noteEngineFailure(ns, e); return ''; }
  }
'''

s = swap(s, INFRA_ANCHOR, INFRA + INFRA_ANCHOR, 'infra')

# ══════════════════ 2. buildWorldSnapshot：六段各自守卫 ══════════════════
SNAP_OLD = """    buildWorldSnapshot() {
      const vis = loadVis(); const s = WA.store.get(); const parts = [];
      if (vis.clock && s.clock.label) parts.push('【世界时间】' + s.clock.label);"""
SNAP_NEW = """    buildWorldSnapshot() {
      const vis = loadVis(); const s = WA.store.get() || {}; const parts = [];
      // v2.86.0 A5：**每一段各自守卫**。修前六段全是裸读取，任何一段的脏行都会把
      //   整个世界状态块打成空（而这一段是注入的根：它没了，模型看到的时间/背景/人物/
      //   暗流/回声一起消失，现场只是一条英文 TypeError）。口径：坏的那段不进文本并留痕，
      //   其余段照常产出——「少一块」远好过「全没有」。
      try { if (vis.clock && s.clock && s.clock.label) parts.push('【世界时间】' + s.clock.label); }
      catch (e) { noteEngineFailure('clock', e); }"""
s = swap(s, SNAP_OLD, SNAP_NEW, 'snapshot-clock')

for tag, guard, body in [
    ('pulse', "vis.pulse", "if (vis.pulse && s.worldPulse) parts.push('【世界脉搏】压力' + s.worldPulse.pressure + '/3（' + s.worldPulse.trend + '）' + (s.worldPulse.note || ''));"),
    ('background', "vis.background", "if (vis.background && s.background.text) parts.push('【世界背景】' + s.background.text.slice(0, 500));"),
]:
    old = "      " + body
    new = "      try { " + body + " }\n      catch (e) { noteEngineFailure('%s', e); }" % tag
    s = swap(s, old, new, 'snapshot-' + tag)

OLD_PEOPLE = """      if (vis.people) {
        const ps = Object.values(s.people).filter(p => p.location || p.action).slice(0, 8);
        if (ps.length) parts.push('【人物此刻】' + ps.map(p => p.name + '：' + (p.location || '?') + '，' + (p.action || '')).join('；'));
      }"""
NEW_PEOPLE = """      try {
        if (vis.people) {
          const ps = Object.values(s.people || {}).filter(p => p && (p.location || p.action)).slice(0, 8);
          if (ps.length) parts.push('【人物此刻】' + ps.map(p => p.name + '：' + (p.location || '?') + '，' + (p.action || '')).join('；'));
        }
      } catch (e) { noteEngineFailure('people', e); }"""
s = swap(s, OLD_PEOPLE, NEW_PEOPLE, 'snapshot-people')

OLD_CUR = """      if (vis.currents) {
        const cs = s.currents.filter(c => c.visibility !== 'hidden').slice(0, 6);
        if (cs.length) parts.push('【可感知暗流】' + cs.map(c => c.visibility === 'trace' ? (c.public_trace || c.title + '（异常迹象）') : c.title).join('；'));
      }"""
NEW_CUR = """      try {
        if (vis.currents) {
          const cs = (s.currents || []).filter(c => c && c.visibility !== 'hidden').slice(0, 6);
          if (cs.length) parts.push('【可感知暗流】' + cs.map(c => c.visibility === 'trace' ? (c.public_trace || c.title + '（异常迹象）') : c.title).join('；'));
        }
      } catch (e) { noteEngineFailure('currents', e); }"""
s = swap(s, OLD_CUR, NEW_CUR, 'snapshot-currents')

io.open(P, 'w', encoding='utf-8').write(s)
print('stage1 OK  %d bytes' % len(s.encode('utf-8')))
