/** WorldAxis ui/settings.js (v0.2) — 推演设置页（尺度/时间/脉搏/预算/舆情） */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '"' }[c])); }

  WA.uiSettings = {
    render() {
      const bs = WA.backstage.getSettings();
      const op = WA.opinion.getSettings();
      const modes = [['light', '轻量'], ['balanced', '均衡'], ['deep', '深度'], ['manual', '手动']];
      const times = [['explicit', '严格'], ['cautious', '谨慎'], ['open', '开放'], ['world', '世界钟']];
      const pulses = [['quiet', '安静'], ['normal', '正常'], ['turbulent', '激荡']];
      return `
        <div class="wa-sec">世界推演设置</div>
        <div class="wa-set-row"><span>推演尺度</span><select id="wa-set-mode" class="wa-input">${modes.map(m => `<option value="${m[0]}" ${bs.simulationMode === m[0] ? 'selected' : ''}>${m[1]}</option>`).join('')}</select></div>
        <div class="wa-set-row"><span>时间策略</span><select id="wa-set-time" class="wa-input">${times.map(t => `<option value="${t[0]}" ${bs.timePolicy === t[0] ? 'selected' : ''}>${t[1]}</option>`).join('')}</select></div>
        <div class="wa-set-row"><span>世界脉搏活跃度</span><select id="wa-set-pulse" class="wa-input">${pulses.map(p => `<option value="${p[0]}" ${bs.pulseActivity === p[0] ? 'selected' : ''}>${p[1]}</option>`).join('')}</select></div>
        <div class="wa-set-row"><span>NPC预算 <b id="wa-set-npcv">${bs.npcBudget}</b></span><input type="range" min="1" max="16" value="${bs.npcBudget}" id="wa-set-npc" class="wa-range"/></div>
        <label class="wa-node"><input type="checkbox" id="wa-set-auto" ${bs.autoSimulate ? 'checked' : ''}/><span class="wa-node-label">每轮自动推演（关闭则仅手动）</span></label>
        <label class="wa-node"><input type="checkbox" id="wa-set-fullrules" ${bs.fullRules ? 'checked' : ''}/><span class="wa-node-label">注入世界规则全文（12模块铁律；关闭则仅精简守则，省token）</span></label>
        <div class="wa-set-row"><span>注入预算</span><select id="wa-set-budget-mode" class="wa-input">
          <option value="auto" ${bs.injectBudget == null || bs.injectBudget < 0 ? 'selected' : ''}>自动（按上下文窗口 6%）</option>
          <option value="unlimited" ${bs.injectBudget === 0 ? 'selected' : ''}>不限（全量注入）</option>
          <option value="manual" ${bs.injectBudget > 0 ? 'selected' : ''}>手动上限</option>
        </select></div>
        <div class="wa-set-row"><span>手动上限 <b id="wa-set-budgetv">${bs.injectBudget > 0 ? bs.injectBudget + 't' : '—'}</b></span><input type="range" min="200" max="6000" step="200" value="${bs.injectBudget > 0 ? bs.injectBudget : 2400}" id="wa-set-budget" class="wa-range"/></div>
        <div class="wa-dim">预算裁决：核心块（世界状态/近端事件）优先保底；记忆/摘要/账本/舆情超预算时先折叠后丢弃。自动档从宿主上下文窗口推导，夹在 800–4000t。</div>
        <div class="wa-sec">主观记忆采样（v0.9.9）</div>
        <div class="wa-set-row"><span>采样上限 <b id="wa-set-mslimitv">${bs.memSamplerLimit || 8}</b></span><input type="range" min="1" max="30" value="${bs.memSamplerLimit || 8}" id="wa-set-mslimit" class="wa-range"/></div>
        <div class="wa-set-row"><span>骰子面数 <b id="wa-set-msdicev">${bs.memSamplerDice || 10000}</b></span><input type="range" min="1000" max="10000" step="500" value="${bs.memSamplerDice || 10000}" id="wa-set-msdice" class="wa-range"/></div>
        <label class="wa-node"><input type="checkbox" id="wa-set-msrel" ${bs.memSamplerRelevance !== 'off' ? 'checked' : ''}/><span class="wa-node-label">上下文相关召回（只注入当前剧情相关的人物记忆，关闭则全量采样）</span></label>
        <div class="wa-sec">自定义推演指令（追加到系统提示）</div>
        <textarea id="wa-set-custom" class="wa-ta" placeholder="例如：本世界魔法衰退，推演时注意时代背景…">${esc(bs.customInstruction)}</textarea>
        <button class="wa-btn" id="wa-set-save">保存推演设置</button>
        <div class="wa-sec">输出净化规则（缝合 Veridis 规则引擎）</div>
        ${(() => {
          // v2.2.0: 规则治理口（此前 addRule/removeRule/setEnabled/loadPreset 全零调用，
          //   用户只能去 localStorage 手改 JSON —— 规则引擎有治理能力却无治理入口）
          if (!WA.purifier || typeof WA.purifier.stat !== 'function') return '<div class="wa-empty">净化模块未加载</div>';
          const ps = WA.purifier.stat();
          const rules = (WA.purifier.rules || []);
          const rows = rules.length ? rules.map((r, i) => `<div class="wa-item">
              <label class="wa-node"><input type="checkbox" data-prm-on="${esc(r.id)}" ${r.enabled !== false ? 'checked' : ''}/><span class="wa-node-label">${esc(r.name || r.id)}</span></label>
              <div class="wa-dim">find: ${esc(String(r.find || '').slice(0, 60))} → ${esc(String(r.replace || '（删）').slice(0, 24))}</div>
              <button class="wa-btn wa-mini" data-prm-del="${esc(r.id)}">删除</button></div>`).join('')
            : '<div class="wa-empty">无规则（净化不会做任何事）</div>';
          return rows + `<div class="wa-dim">共 ${rules.length} 条 · 已净化 ${ps.runs} 次（命中 ${ps.changed} · 省 ${ps.charsSaved} 字符 · 拦空 ${ps.blocked} · 规则错 ${ps.ruleErrors}）${ps.imported ? ' · 已导入 ' + ps.imported + ' 条' : ''}${ps.lastImport ? ' · 最近导入：' + esc(ps.lastImport) : ''}</div>`;
        })()}
        <div class="wa-row"><input id="wa-prm-find" class="wa-input" placeholder="正则 find（如 &lt;think&gt;[\\s\\S]*?&lt;/think&gt;）"/><input id="wa-prm-repl" class="wa-input wa-w60" placeholder="替换为（留空=删除）"/></div>
        <div class="wa-row"><button class="wa-btn wa-mini" id="wa-prm-add">新增规则</button><button class="wa-btn wa-mini" id="wa-prm-reset">恢复内置</button></div>
        <div class="wa-row"><button class="wa-btn wa-mini" id="wa-prm-import">导入预设 JSON</button></div>
        <textarea id="wa-prm-json" class="wa-ta" placeholder='粘贴 Veridis 预设或规则数组，如 [{"find":"…","replace":""}]'></textarea>
        <div id="wa-prm-out" class="wa-out"></div>
        <div class="wa-sec">舆情引擎</div>
        <label class="wa-node"><input type="checkbox" id="wa-op-enable" ${op.enabled ? 'checked' : ''}/><span class="wa-node-label">启用舆情观察（新闻/论坛）</span></label>
        <label class="wa-node"><input type="checkbox" id="wa-op-sandbox" ${op.sandboxEnabled ? 'checked' : ''}/><span class="wa-node-label">启用闲逛沙盒（NON-CANON氛围碎片）</span></label>
        <div class="wa-set-row"><span>每N轮生成</span><input type="number" min="1" max="10" value="${op.everyNRounds}" id="wa-op-n" class="wa-input wa-w60"/></div>
        <div class="wa-row">
          <button class="wa-btn" id="wa-op-now">立即生成舆情</button>
          <button class="wa-btn" id="wa-sim-now">立即推演世界</button>
        </div>
        <div class="wa-sec">事件演化（本地骰子）</div>
        <label class="wa-node"><input type="checkbox" id="wa-ev-dice" ${WA.evolution.getSettings().diceEnabled ? 'checked' : ''}/><span class="wa-node-label">启用事件链本地骰子推进</span></label>
        <div class="wa-set-row"><span>骰子修正 <b id="wa-ev-modv">${WA.evolution.getSettings().diceModifier}</b></span><input type="range" min="-30" max="30" value="${WA.evolution.getSettings().diceModifier}" id="wa-ev-mod" class="wa-range"/></div>
        <div class="wa-row"><button class="wa-btn" id="wa-ev-roll">立即掷一轮演化骰</button></div>
        <div id="wa-ev-out" class="wa-out"></div>
        <div id="wa-set-out" class="wa-out"></div>`;
    },
    bind(panelEl) {
      const $ = sel => panelEl.querySelector(sel);
      const out = () => $('#wa-set-out');
      // v2.2.0: 净化规则治理绑定（此前这些能力零调用 = 治理无入口）
      if (WA.purifier) {
        const pOut = () => { const o = $('#wa-prm-out'); return o; };
        panelEl.querySelectorAll('[data-prm-on]').forEach(cb => cb.onchange = () => {
          WA.purifier.setEnabled(cb.dataset.prmOn, cb.checked);
          if (WA.log) WA.log('info', '净化规则「' + cb.dataset.prmOn + '」已' + (cb.checked ? '启用' : '停用'));
        });
        panelEl.querySelectorAll('[data-prm-del]').forEach(btn => btn.onclick = () => {
          const r = WA.purifier.removeRuleSafe(btn.dataset.prmDel);
          const o = pOut(); if (o) o.textContent = r.ok ? '✓ 已删除，剩 ' + r.remaining + ' 条' : ('删除失败：' + r.reason);
          renderPruneRefresh();
        });
        const prmAdd = $('#wa-prm-add');
        if (prmAdd) prmAdd.onclick = () => {
          const r = WA.purifier.addRuleSafe({ find: $('#wa-prm-find').value, replace: $('#wa-prm-repl').value });
          const o = pOut(); if (o) o.textContent = r.ok ? '✓ 已新增规则（共 ' + r.total + ' 条）' : ('新增失败：' + r.reason);
          if (r.ok) renderPruneRefresh();
        };
        const prmReset = $('#wa-prm-reset');
        if (prmReset) prmReset.onclick = () => {
          const r = WA.purifier.resetToBuiltin();
          const o = pOut(); if (o) o.textContent = '✓ 已恢复内置规则（' + r.total + ' 条）';
          renderPruneRefresh();
        };
        const prmImp = $('#wa-prm-import');
        if (prmImp) prmImp.onclick = () => {
          const r = WA.purifier.importPresetSafe($('#wa-prm-json').value);
          const o = pOut(); if (o) o.textContent = r.ok ? ('✓ 导入 ' + r.added + ' 条' + (r.rejected ? '（拒收 ' + r.rejected + '：' + (r.reasons || []).join('、') + '）' : '')) : ('导入失败：' + r.reason);
          if (r.ok) renderPruneRefresh();
        };
      }
      function renderPruneRefresh() {
        try {
          if (typeof WA.uiSettings.render === 'function' && WA.ui && WA.ui.mounted) {
            const body = panelEl.querySelector('.wa-body');
            if (body && body.querySelector('#wa-prm-find')) { body.innerHTML = WA.uiSettings.render(); WA.uiSettings.bind(panelEl); }
          }
        } catch (e) {}
      }
      const npc = $('#wa-set-npc');
      if (npc) npc.oninput = () => { $('#wa-set-npcv').textContent = npc.value; };
      const bg = $('#wa-set-budget');
      const bgMode = $('#wa-set-budget-mode');
      const syncBudgetRow = () => {
        const mode = bgMode ? bgMode.value : 'auto';
        if (bg) bg.disabled = (mode !== 'manual');
        if ($('#wa-set-budgetv')) $('#wa-set-budgetv').textContent = mode === 'auto' ? '自动' : (mode === 'unlimited' ? '不限' : (bg ? bg.value + 't' : '—'));
      };
      if (bgMode) bgMode.onchange = syncBudgetRow;
      if (bg) bg.oninput = () => { if ($('#wa-set-budgetv') && (!$('#wa-set-budget-mode') || $('#wa-set-budget-mode').value === 'manual')) $('#wa-set-budgetv').textContent = bg.value + 't'; };
      syncBudgetRow();
      const msl = $('#wa-set-mslimit');
      if (msl) msl.oninput = () => { const v = $('#wa-set-mslimitv'); if (v) v.textContent = msl.value; };
      const msd = $('#wa-set-msdice');
      if (msd) msd.oninput = () => { const v = $('#wa-set-msdicev'); if (v) v.textContent = msd.value; };
      const saveBtn = $('#wa-set-save');
      if (saveBtn) saveBtn.onclick = () => {
        WA.backstage.setSettings({
          simulationMode: $('#wa-set-mode').value,
          timePolicy: $('#wa-set-time').value,
          pulseActivity: $('#wa-set-pulse').value,
          npcBudget: +npc.value,
          autoSimulate: $('#wa-set-auto').checked,
          fullRules: $('#wa-set-fullrules').checked,
          injectBudget: (() => { const m = $('#wa-set-budget-mode'); const v = m ? m.value : 'auto'; if (v === 'unlimited') return 0; if (v === 'manual') return Math.max(200, +($('#wa-set-budget') ? $('#wa-set-budget').value : 2400) || 2400); return -1; })(),
          memSamplerLimit: +($('#wa-set-mslimit') ? $('#wa-set-mslimit').value : 8) || 8,
          memSamplerDice: +($('#wa-set-msdice') ? $('#wa-set-msdice').value : 10000) || 10000,
          memSamplerRelevance: $('#wa-set-msrel') && $('#wa-set-msrel').checked ? 'on' : 'off',
          customInstruction: $('#wa-set-custom').value.trim()
        });
        WA.opinion.setSettings({ enabled: $('#wa-op-enable').checked, sandboxEnabled: $('#wa-op-sandbox').checked, everyNRounds: +$('#wa-op-n').value || 3 });
        out().textContent = '✓ 设置已保存';
      };
      const opNow = $('#wa-op-now');
      if (opNow) opNow.onclick = async () => { out().textContent = '舆情生成中…'; const r = await WA.opinion.generate(); out().textContent = r.ok ? `✓ 新闻${r.news}条 论坛${r.forums}主题` : ('失败：' + r.reason); };
      const simNow = $('#wa-sim-now');
      if (simNow) simNow.onclick = () => { WA.backstage.forceSimulate(); out().textContent = '已触发世界推演（见日志）'; };
      // 演化设置
      const evMod = $('#wa-ev-mod');
      if (evMod) evMod.oninput = () => { $('#wa-ev-modv').textContent = evMod.value; };
      const evRoll = $('#wa-ev-roll');
      if (evRoll) evRoll.onclick = () => {
        WA.evolution.setSettings({ diceEnabled: $('#wa-ev-dice').checked, diceModifier: +evMod.value });
        const results = WA.evolution.tick();
        $('#wa-ev-out').innerHTML = results.length ? results.map(r => `<div class="wa-item">${esc(r.name)}：<b>${esc(r.result)}</b> ${r.stage ? '→ ' + esc(r.stage) : ''} ${r.dice ? '(骰' + r.dice + '/阈' + r.threshold + ')' : ''}</div>`).join('') : '<div class="wa-dim">（无活跃事件链，可在backstage推演中生成）</div>';
      };
    }
  };
})();