#!/usr/bin/env node
'use strict';
const fs=require('fs');
const r=JSON.parse(fs.readFileSync(process.argv[2]||'/tmp/v12-behavior-audit.json','utf8'));
const esc=s=>String(s||'').replace(/\|/g,'/').replace(/\n/g,' ');
const tally={};for(const x of r)tally[x.disposition]=(tally[x.disposition]||0)+1;
const o=['# V12 全文件行为级深度审计账','','状态：338/338 顶层 JavaScript 已完成第二层静态行为取证。','本账基于函数、公开命名空间/API、事务写口、工作流注册、UI 事件面、跨文件调用和测试文件引用生成。','', '## 统计','','| 处置类别 | 数量 | 口径 |','|---|---:|---|','| behavior-wired | '+(tally['behavior-wired']||0)+' | 具备事务/状态写口或被行为链消费 |','| read-consumer | '+(tally['read-consumer']||0)+' | 主要提供只读投影、诊断或消费面 |','| entry-needed | '+(tally['entry-needed']||0)+' | 未发现明确顶层消费者，需人工确认宿主入口 |','| ui-or-host-entry | '+(tally['ui-or-host-entry']||0)+' | 通过 UI/宿主注册或动态事件进入 |','| surface | '+(tally.surface||0)+' | 表面层文件 |','', '## 需要人工确认的入口','','| 文件 | 分类 | API | 工作流 | 事务 | 状态写入 | 测试引用 |','|---|---|---|---:|---:|---|---:|'];
for(const x of r.filter(x=>x.disposition==='entry-needed'||x.disposition==='ui-or-host-entry'))o.push('| `'+x.file+'` | '+x.disposition+' | '+esc(x.api.join(', '))+' | '+x.workflowRegistrations+' | '+x.transactions+' | '+esc(x.writes.join(', '))+' | '+(x.hasTests?'有':'无')+' |');
o.push('', '## 逐文件行为证据','','| 文件 | 行数 | 命名空间 | API | 函数 | 注册 | 工作流 | 事务 | 写入字段 | 跨文件调用 | UI消费者 | 动态UI | 测试 | 最终处置 |','|---|---:|---|---|---:|---:|---:|---:|---|---:|---:|---|---|---|');
for(const x of r)o.push('| `'+x.file+'` | '+x.lines+' | '+esc(x.namespace.join(', '))+' | '+esc(x.api.slice(0,20).join(', '))+' | '+x.functions.length+' | '+x.registerModule+' | '+x.workflowRegistrations+' | '+x.transactions+' | '+esc(x.writes.join(', '))+' | '+x.crossConsumers.length+' | '+x.uiConsumers.length+' | '+(x.uiEventSurface?'是':'否')+' | '+(x.hasTests?'有':'无')+' | '+x.disposition+' |');
o.push('', '## 处置规则','','- `behavior-wired`：优先做跨域消费者和产品路径复核，不默认改动。','- `read-consumer`：检查是否为玩家工作台、叙事投影、诊断或模型输入；只读不等于缺陷。','- `entry-needed`：确认是否由宿主生命周期、动态属性或 UI 间接调用；确认后才能决定融合或新增入口。','- `ui-or-host-entry`：检查主题/宿主注册是否正常，不把样式或宿主挂载误判为业务孤岛。','- 本报告仍是静态行为证据，不替代真实运行时验证；动态调用、加载顺序和外部供应商行为仍需专项复核。');
fs.writeFileSync('plans/V12_FULL_FILE_BEHAVIOR_AUDIT.md',o.join('\n')+'\n');
console.log('wrote',r.length,'rows');