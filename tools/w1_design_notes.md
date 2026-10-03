# W1 跨模块因果追溯图谱（v2.147.0）设计笔记（内部侦察存档）

## 它治的病
`coop.traceOf` 是**协作提议级**追溯（单提议回执/裁决），`causal.rippleWeb` 是**在途级联**推导
（二阶边只有「后续链把已结算后果当原因」这一种边型）。但「一个事实（worldFact）从哪来、
被哪些链用过、最终落成什么」——**以事实为轴心的全链路追溯**全库零回答
（`traceGraph`/`causalTrace`/`追溯图谱` 全仓零命中）。

## 与 rippleWeb 的差异化口径（关键）
- `rippleWeb`：链→链，只看**在途级联**（who-cites-whom），节点=链，边=引用，只读推导。
- `traceGraph`：**事实为轴心**的全链路追溯：节点三类（fact / chain / echo），边两类
  （fact←chain「产出」/ chain←fact「引用」），从任一**事实键**出发双向 BFS，答三问：
  ① 这个事实哪条链产出（来源）；② 这个事实被哪些链/回声用过（去向）；③ 链—链—事实多跳级联路径。
- 「跨模块」口径：溯源 fact.source（哪模块写入的 worldFact）+ 链的 cause 溯到模块归属，
  返回 `modules` 集合（fact 的 source 与各链 cause 的 source 标记），答「这条因果跨了哪几个模块」。

## 数据形态（实测）
- `worldFacts`: `{id, key, value, scope, source, at}`；causal 写事实用 key=`causal:<chainId>`、id=`wf_<chainId>`、source='causal'
- `echoes`: `{id:'ec_<did>', refCurrent, result, exposure, at}`（cap 40）
- `causal.settled` 台账: `{id:chainId, at, result, echo}`

## 返回口径
`{ ok, root, nodes, edges, modules, reason }`：
- `root`: 起点事实键
- `nodes`: `{ id, kind: 'fact'|'chain'|'echo', label, module }`（去重，BFS 深度限 3）
- `edges`: `{ from, to, kind: 'produced'|'cited'|'echoed' }`
- `modules`: 起点事实 source 与图谱内链 cause 的 source 去重集合
- 无图谱如实 `no-trace`（fact 不存在 / 无产出链 / 无引用链）