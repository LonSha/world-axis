#!/usr/bin/env node
'use strict';
// Inventory is not semantic review. Hashes bind future review evidence to source bytes.
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto'),path=require('path');
const root=path.resolve(__dirname,'..');
const files=cp.execFileSync('git',['ls-files','-z'],{cwd:root}).toString().split('\0').filter(Boolean).sort();
const indexPath=process.argv[2]||path.join(require('os').tmpdir(),'v12-audit.json');
if(!process.argv[2])cp.execFileSync(process.execPath,[path.join(root,'tools/v12-audit-scan.js'),indexPath],{cwd:root});
const old=JSON.parse(fs.readFileSync(indexPath,'utf8'));
const indexed=new Set(old.map(x=>x.f));
const manifest=files.map(file=>{const data=fs.readFileSync(path.join(root,file));return {file,bytes:file==='plans/V12_REPOSITORY_AUDIT_MANIFEST.json'||file==='plans/V12_FULL_FILE_AUDIT.md'?null:data.length,sha256:file==='plans/V12_REPOSITORY_AUDIT_MANIFEST.json'||file==='plans/V12_FULL_FILE_AUDIT.md'?null:crypto.createHash('sha256').update(data).digest('hex'),priorTopLevelIndex:indexed.has(file),semanticReview:'pending'};});
fs.writeFileSync(path.join(root,'plans/V12_REPOSITORY_AUDIT_MANIFEST.json'),JSON.stringify({scope:'git tracked files at generation time; generated artifacts added afterward require regeneration',files:manifest},null,2)+'\n');
const esc=x=>String(x??'').replace(/\|/g,'/').replace(/\n/g,' ');
const rows=['# V12 顶层 JavaScript 静态证据索引','','状态：机械索引；逐文件语义深审尚未完成。范围为五目录顶层 JavaScript，不能代表全仓。','','| 文件 | 行数 | 命名空间/API | 写字段 | 事务 | 消费者 | UI消费 | 工作流 | 测试引用 | 分类 |','|---|---:|---|---|---:|---:|---:|---|---:|---|'];
for(const x of old){const source=fs.readFileSync(path.join(root,x.f),'utf8');rows.push('| `'+x.f+'` | '+source.split('\n').length+' | '+esc((x.ns||[]).join(', ')+' / '+(x.api||[]).join(', '))+' | '+esc((x.writes||[]).join(', '))+' | '+x.transact+' | '+x.consumers.length+' | '+x.uiConsumers.length+' | '+esc((x.wf||[]).join(', '))+' | '+x.tests.length+' | '+x.cls+' |');}
fs.writeFileSync(path.join(root,'plans/V12_FULL_FILE_AUDIT.md'),rows.join('\n')+'\n');
console.log(JSON.stringify({tracked:files.length,priorIndexed:manifest.filter(x=>x.priorTopLevelIndex).length,additionalScope:manifest.filter(x=>!x.priorTopLevelIndex).length,semanticReviewed:0}));
