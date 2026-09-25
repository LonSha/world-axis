# -*- coding: utf-8 -*-
"""WorldAxis v2.85.0 A4 —— 注入优先级表覆盖整个源面 + 未声明可观测

【缺陷】PRIORITY 是 v0.9.3 写的 8 个源名（近端事件/世界状态/主观记忆/记忆/
  叙事摘要/世界推演/账本/舆情）。此后 SOURCES 长到 46 个、注入面加了 38 个新源，
  **优先级表一次都没跟着长**。后果：
    · 那 38 个源全部静默落到 DEFAULT_RANK=6 —— 「pinned（rank≤2）优先保障、
      绝不静默丢弃」这条承诺只对 2 个源成立，其余 38 个从未被任何声明覆盖；
    · 「有源没被声明」在运行时**完全不可见**（rankOf 静默给默认值）。
  这正是 v2.56.0 立过的规矩在别处的复发：源面与声明面必须**同时增长**，
  单边增长就是静默缺口。

【修法】
  1 PRIORITY 按**可替代性**补满全部 46 个源名（越靠前 = 越不可替代：
    丢了一条，模型就再也看不到那件事）。
  2 plan() 返回 `unranked`（本次输入里落默认档的 source 名去重列表），
     summaryText 在非空时报出计数 —— 未来新增源若忘了登记，运行时当场可见。
  3 不加新导出成员（避免动 FROZEN2800）：覆盖自证挂在 plan 的返回字段上。
     PRIORITY 本身是已导出成员，补键不改成员名 ⇒ 冻结清单**逐字不变**。
"""
import io, os, sys

REL = 'engines/inject-budget.js'
PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), REL)

A1 = """  /** 源优先级：rank 越小越重要；fold=true 允许超预算时折叠 */
  const PRIORITY = {
    '近端事件': { rank: 1, fold: false },
    '世界状态': { rank: 2, fold: false },
    '主观记忆': { rank: 3, fold: true },
    '记忆': { rank: 4, fold: true },
    '叙事摘要': { rank: 5, fold: true },
    '世界推演': { rank: 6, fold: true },
    '账本': { rank: 7, fold: true },
    '舆情': { rank: 8, fold: true }
  };
  const DEFAULT_RANK = 6;"""

B1 = """  /**
   * 源优先级：rank 越小越重要；fold=true 允许超预算时折叠。
   *
   * v2.85.0 A4：本表此前只有 v0.9.3 的 8 个源名，而注入面已长到 46 个 push 点 ——
   *   于是 38 个源**全部静默落 DEFAULT_RANK**，「pinned 优先保障、绝不静默丢弃」
   *   这条承诺只对 2 个源成立，且「有源没被声明」在运行时不可见。
   *   现按**可替代性**补满：越靠前＝越不可替代（丢一条，模型就再也看不到那件事）。
   *   判据由 tests/settle-v2851.js 承担：真代码面里每个 `source: 'X'` 都必须在本表内，
   *   且未声明者会经 plan().unranked / summaryText 当场报出（成类锁，防再次漂移）。
   */
  const PRIORITY = {
    // rank 1-2：pinned，绝不静默丢弃
    '近端事件': { rank: 1, fold: false },
    '世界状态': { rank: 2, fold: false },
    // rank 3：丢了就断因果/记忆主链
    '主观记忆': { rank: 3, fold: true },
    '因果结算': { rank: 3, fold: true },
    // rank 4：长期记忆本体
    '记忆': { rank: 4, fold: true },
    // rank 5：世界骨架与叙事摘要
    '叙事摘要': { rank: 5, fold: true },
    '世界织体': { rank: 5, fold: true },
    '人物生活': { rank: 5, fold: true },
    '因果与情报': { rank: 5, fold: true },
    '事件调度': { rank: 5, fold: true },
    // rank 6：推演与结构性面
    '世界推演': { rank: 6, fold: true },
    '资源与组织': { rank: 6, fold: true },
    '长线伏笔': { rank: 6, fold: true },
    '悬案': { rank: 6, fold: true },
    '社交漩涡': { rank: 6, fold: true },
    '场外事件': { rank: 6, fold: true },
    '情绪通道': { rank: 6, fold: true },
    '关系六型': { rank: 6, fold: true },
    '时间锁': { rank: 6, fold: true },
    '双层性格': { rank: 6, fold: true },
    '资料片周期': { rank: 6, fold: true },
    '生存三轴': { rank: 6, fold: true },
    '情境切片': { rank: 6, fold: true },
    '竞争焦点': { rank: 6, fold: true },
    '信息暗礁': { rank: 6, fold: true },
    '风险账': { rank: 6, fold: true },
    // rank 7：物候/环境/氛围类（可被上下文替代）
    '账本': { rank: 7, fold: true },
    '天气与物候': { rank: 7, fold: true },
    '世界难度': { rank: 7, fold: true },
    '假面': { rank: 7, fold: true },
    '好感审计': { rank: 7, fold: true },
    '通缉': { rank: 7, fold: true },
    '阻尼量规': { rank: 7, fold: true },
    '节奏齿轮': { rank: 7, fold: true },
    '伏笔配给': { rank: 7, fold: true },
    '焦点分配': { rank: 7, fold: true },
    '业力账': { rank: 7, fold: true },
    '叙事工艺': { rank: 7, fold: true },
    // rank 8：最可替代（统计/库存/外观/账目类）
    '舆情': { rank: 8, fold: true },
    '驯兽': { rank: 8, fold: true },
    '外貌契约': { rank: 8, fold: true },
    '原型阶梯': { rank: 8, fold: true },
    '边际折旧': { rank: 8, fold: true },
    '手段耐受': { rank: 8, fold: true },
    '快照与分支': { rank: 8, fold: true }
  };
  const DEFAULT_RANK = 6;"""

# plan：收集未声明源
A2 = """    const list = (Array.isArray(items) ? items : []).map(function (it, idx) {
      const source = (it && it.source) || '未命名';
      const content = String((it && it.content) || '');
      return { id: idx, source: source, content: content, rank: rankOf(source), fold: foldable(source), tokens: tokensOf(content) };
    });"""
B2 = """    // v2.85.0 A4：未声明源必须**可观测**。旧实现在这里静默套 DEFAULT_RANK，
    //   于是「优先级表没跟着源面长」这件事在任何读数里都看不见——补表之后，
    //   再加新源却忘了登记，plan().unranked 与 summaryText 会当场报出来。
    const unranked = [];
    const list = (Array.isArray(items) ? items : []).map(function (it, idx) {
      const source = (it && it.source) || '未命名';
      const content = String((it && it.content) || '');
      if (!Object.prototype.hasOwnProperty.call(PRIORITY, source) && unranked.indexOf(source) < 0) unranked.push(source);
      return { id: idx, source: source, content: content, rank: rankOf(source), fold: foldable(source), tokens: tokensOf(content) };
    });"""

A3 = """      inputCount: list.length,
      budget: budget, budgetSource: rb.source, contextSize: rb.contextSize, used: used, remain: Math.max(0, budget - used),"""
B3 = """      inputCount: list.length,
      // 本次输入里没有任何优先级声明的源（去重）。空数组 = 源面已全部被声明覆盖。
      unranked: unranked,
      budget: budget, budgetSource: rb.source, contextSize: rb.contextSize, used: used, remain: Math.max(0, budget - used),"""

A4 = """  function summaryText(p) {
    if (!p) return '未规划';
    const tail = p.folded.length ? '｜折叠 ' + p.folded.length : '';
    const drop = p.dropped.length ? '｜丢弃 ' + p.dropped.length : '';
    return '注入 ' + p.used + '/' + p.budget + 't' + tail + drop + (p.saved > 0 ? '｜省 ' + p.saved + 't' : '');
  }"""
B4 = """  function summaryText(p) {
    if (!p) return '未规划';
    const tail = p.folded.length ? '｜折叠 ' + p.folded.length : '';
    const drop = p.dropped.length ? '｜丢弃 ' + p.dropped.length : '';
    // v2.85.0 A4：未声明源在摘要里也要看得见（调用方传的是精简对象时容错）。
    const un = (p.unranked && p.unranked.length) ? '｜未声明 ' + p.unranked.length + ' 源' : '';
    return '注入 ' + p.used + '/' + p.budget + 't' + tail + drop + un + (p.saved > 0 ? '｜省 ' + p.saved + 't' : '');
  }"""

EDITS = [
    (A1, B1, 'PRIORITY 补满 46 源'),
    (A2, B2, 'plan 收集 unranked'),
    (A3, B3, 'plan 返回 unranked'),
    (A4, B4, 'summaryText 报未声明'),
]


def main():
    src = io.open(PATH, encoding='utf-8').read()
    for i, (a, _b, name) in enumerate(EDITS, 1):
        n = src.count(a)
        if n != 1:
            print('中止：锚点 %d（%s）命中 %d 次（须为 1）' % (i, name, n))
            return 1
    out = src
    for i, (a, b, name) in enumerate(EDITS, 1):
        out = out.replace(a, b)
        print('  ✓ %d %s' % (i, name))
    io.open(PATH, 'w', encoding='utf-8').write(out)
    print('已写入 %s（%d → %d 字节）' % (REL, len(src.encode('utf-8')), len(out.encode('utf-8'))))
    return 0


if __name__ == '__main__':
    sys.exit(main())