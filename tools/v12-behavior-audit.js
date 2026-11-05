#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const dirs=['engines','actors','core','render','ui'];
const files=[];for(const d of dirs){const p=path.join(root,d);if(!fs.existsSync(p))continue;for(const f of fs.readdirSync(p).filter(x=>x.endsWith('.js')).sort())files.push(d+'/'+f)}
const text={};for(const f of files)text[f]=fs.readFileSync(path.join(root,f),'utf8');
const all=Object.values(text).join('\n');
const uniq=a=>[...new Set(a)];
function names(s){return uniq([...s.matchAll(/(?:function\s+|(?:const|let|var)\s+)([A-Za-z_$][\w$]*)\s*(?:=\s*function)?\s*\(/g)].map(m=>m[1])).slice(0,80)}
function api(s){const out=[];for(const m of s.matchAll(/WA\.([A-Za-z_$][\w$]*)\s*=\s*\{([\s\S]*?)\n\s*\};/g)){out.push(...[...m[2].matchAll(/(?:^|[,\n])\s*([A-Za-z_$][\w$]*)\s*:/g)].map(x=>x[1]));out.push(...[...m[2].matchAll(/(?:^|[,\n])\s*([A-Za-z_$][\w$]*)\s*\(/g)].map(x=>x[1]))}return uniq(out).slice(0,80)}
function callSites(ns, f){const out=[];for(const n of ns){const re=new RegExp('WA\\.'+n.replace('$','\\$')+'\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*\\(');for(const [g,s] of Object.entries(text)){if(g===f)continue;const m=s.match(re);if(m)out.push(n+'.'+m[1]+' <- '+g)}}return uniq(out).slice(0,100)}
const rows=files.map(f=>{const s=text[f];
  const ns=uniq([...s.matchAll(/WA\.([A-Za-z_$][\w$]*)\s*=/g)].map(m=>m[1]));
  const reg=[...s.matchAll(/WA\.registerModule\s*\(/g)].length;
  const wf=[...s.matchAll(/WA\.workflow\.register\s*\(/g)].length;
  const tx=[...s.matchAll(/(?:WA\.)?store\.transact\s*\(/g)].length;
  const publicApi=api(s), calls=callSites(ns,f);
  const directUi=files.filter(g=>g.startsWith('ui/')&&g!==f&&ns.some(n=>new RegExp('WA\\.'+n+'\\s*\\.').test(text[g])));
  const dynamicUi=/querySelector|addEventListener|onclick|onchange|data-node|data-action/.test(s);
  const moduleLoad=/registerModule|register\s*\(/.test(s);
  const writes=[...s.matchAll(/(?:draft|d|st)\.([A-Za-z_$][\w$]*)\s*(?:=|\.push\(|\.splice\()/g)].map(m=>m[1]);
  let disposition='retain';
  if(!ns.length&&dynamicUi) disposition='surface';
  else if(ns.length&&!calls.length&&!directUi.length&&!wf&&!moduleLoad) disposition='entry-needed';
  else if(ns.length&&!calls.length&&(directUi.length||wf||dynamicUi)) disposition='ui-or-host-entry';
  else if(tx||writes.length) disposition='behavior-wired';
  else disposition='read-consumer';
  const hasTests=fs.existsSync(path.join(root,'tests'))&&fs.readdirSync(path.join(root,'tests')).some(t=>t.endsWith('.js')&&fs.readFileSync(path.join(root,'tests',t),'utf8').includes(path.basename(f)));
  return {file:f,lines:s.split('\\n').length,namespace:ns,api:publicApi,functions:names(s),registerModule:reg,workflowRegistrations:wf,transactions:tx,writes:uniq(writes),crossConsumers:calls,uiConsumers:directUi,uiEventSurface:dynamicUi,moduleLoad,disposition,hasTests};
});
fs.writeFileSync(process.argv[2]||'/tmp/v12-behavior-audit.json',JSON.stringify(rows,null,1));const tally={};for(const r of rows)tally[r.disposition]=(tally[r.disposition]||0)+1;console.log('files',rows.length,tally);
