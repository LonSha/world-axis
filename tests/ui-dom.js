// WorldAxis tests/ui-dom.js — 零依赖 mini-DOM（测试基建）
// 用途：给「UI 层渲染路径」提供真实可查询的 DOM。设计目标是**自包含**——本仓库零 npm 依赖，
//   若门禁依赖 jsdom 之类外部包，在别人的机器上只会静默跳过，门禁等于不存在。
// 覆盖范围是 ui/panel.js 与 ui/settings.js 实际用到的子集：
//   覆盖范围**只保留产品实际调用的子集**（同本仓库「声明了却无人消费 = 死面」的口径）：
//   createElement / innerHTML 解析 / querySelector(All)（#id / .cls / [data-x] / tag / 后代与并集）
//   dataset / classList / textContent / appendChild / removeChild / firstElementChild
//   onclick / onchange / addEventListener / click() / setPointerCapture / getBoundingClientRect / contains
'use strict';
var VOID_TAGS = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1 };

function dataKey(attr) {
  return String(attr).replace(/^data-/, '').split('-').map(function (s, i) {
    if (!s) return '';
    return i === 0 ? s : (s.charAt(0).toUpperCase() + s.slice(1));
  }).join('');
}

function installMiniDom(WA) {
  function setAttr(el, name, val) {
    name = String(name).toLowerCase();
    if (name === 'class') { el.className = val; return; }
    if (name === 'id') { el.id = val; return; }
    if (name === 'style') { el.attrs.style = val; return; }
    if (name.indexOf('data-') === 0) { el.dataset[dataKey(name)] = val; el.attrs[name] = val; return; }
    el.attrs[name] = val;
    if (name === 'value' || name === 'type' || name === 'placeholder' || name === 'title' || name === 'name') el[name] = val;
    if (name === 'disabled' || name === 'checked') el[name] = true;
  }
  function makeNode(doc, tag, nodeType) {
    var el = {
      ownerDocument: doc, nodeType: nodeType || 1,
      _tag: String(tag || 'div').toLowerCase(),
      childNodes: [], parentNode: null, attrs: {}, style: {}, dataset: {}, _cls: new Set(),
      _text: '', _html: '', _listeners: {}, value: '', disabled: false, checked: false,
      onclick: null, onchange: null, oninput: null, id: undefined, type: ''
    };
    el.tagName = el._tag.toUpperCase();
    el.classList = {
      add: function () { for (var i = 0; i < arguments.length; i++) el._cls.add(arguments[i]); },
      remove: function () { for (var i = 0; i < arguments.length; i++) el._cls.delete(arguments[i]); },
      contains: function (c) { return el._cls.has(c); },
      toggle: function (c, f) { if (f === undefined) { if (el._cls.has(c)) el._cls.delete(c); else el._cls.add(c); } else if (f) el._cls.add(c); else el._cls.delete(c); }
    };
    Object.defineProperty(el, 'className', {
      get: function () { return Array.from(el._cls).join(' '); },
      set: function (v) { el._cls = new Set(String(v == null ? '' : v).split(/\s+/).filter(Boolean)); }
    });
    function elems() { return el.childNodes.filter(function (n) { return n.nodeType === 1; }); }
    Object.defineProperty(el, 'firstElementChild', { get: function () { return elems()[0] || null; } });
      Object.defineProperty(el, 'textContent', {
      get: function () { return el._text + elems().map(function (n) { return n.textContent; }).join(''); },
      set: function (v) { el._text = String(v == null ? '' : v); el.childNodes.length = 0; }
    });
    Object.defineProperty(el, 'innerHTML', {
      get: function () { return el._html; },
      set: function (v) { var s = String(v == null ? '' : v); WA.__parseInto(doc, el, s); el._html = s; }
    });
    el.appendChild = function (c) { if (!c) return c; if (c.parentNode && c.parentNode.removeChild) c.parentNode.removeChild(c); c.parentNode = el; el.childNodes.push(c); return c; };
    el.removeChild = function (c) { var i = el.childNodes.indexOf(c); if (i >= 0) el.childNodes.splice(i, 1); if (c) c.parentNode = null; return c; };
    el.setAttribute = function (k, v) { setAttr(el, k, String(v)); };
    el.getAttribute = function (k) {
      k = String(k).toLowerCase();
      if (k === 'id') return el.id === undefined ? null : el.id;
      if (k === 'class') return el.className || null;
      return (k in el.attrs) ? el.attrs[k] : null;
    };
    el.addEventListener = function (t, fn) { (el._listeners[t] = el._listeners[t] || []).push(fn); };
    el.dispatchEvent = function (ev) { var arr = (el._listeners[(ev && ev.type) || ''] || []).slice(); for (var i = 0; i < arr.length; i++) { try { arr[i](ev); } catch (e) {} } return true; };
    el.click = function () { var ev = { type: 'click', target: el }; if (typeof el.onclick === 'function') el.onclick(ev); el.dispatchEvent(ev); };
    el.setPointerCapture = function () {};
    el.getBoundingClientRect = function () { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; };
    el.contains = function (n) { var p = n; while (p) { if (p === el) return true; p = p.parentNode; } return false; };
    el.querySelectorAll = function (sel) { return WA.__qsa(el, sel); };
    el.querySelector = function (sel) { return WA.__qsa(el, sel)[0] || null; };
    return el;
  }
  WA.__setAttr = setAttr;
  WA.__makeNode = makeNode;
}

function parseAttrs(raw) {
  var out = [], re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g, m;
  while ((m = re.exec(raw)) !== null) {
    out.push([m[1], m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''))]);
  }
  return out;
}
var CUR = null;
function parseInto(doc, root, html) {
  var mk = CUR.__makeNode, setA = CUR.__setAttr;
  var stack = [root];
  root.childNodes.length = 0;
  root._text = '';
  var i = 0, n = html.length;
  var TAG_RE = /^<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/;
  while (i < n) {
    var lt = html.indexOf('<', i);
    if (lt < 0) { stack[stack.length - 1]._text += html.slice(i); break; }
    if (lt > i) stack[stack.length - 1]._text += html.slice(i, lt);
    var c = html.charAt(lt + 1);
    if (c === '/') {
      var gt = html.indexOf('>', lt);
      if (gt < 0) break;
      if (stack.length > 1) stack.pop();
      i = gt + 1;
      continue;
    }
    if (c === '!') {
      if (html.substr(lt, 4) === '<!--') { var ce = html.indexOf('-->', lt); i = ce < 0 ? n : ce + 3; continue; }
      var de = html.indexOf('>', lt); i = de < 0 ? n : de + 1; continue;
    }
    var m = TAG_RE.exec(html.slice(lt));
    if (!m) { stack[stack.length - 1]._text += '<'; i = lt + 1; continue; }
    var tag = m[1].toLowerCase(), attrRaw = m[2] || '';
    var selfClose = /\/\s*$/.test(attrRaw);
    var el = mk(doc, tag);
    parseAttrs(attrRaw).forEach(function (p) { setA(el, p[0], p[1]); });
    stack[stack.length - 1].appendChild(el);
    i = lt + m[0].length;
    if (!selfClose && !VOID_TAGS[tag]) stack.push(el);
  }
}

function matchSimple(el, simple) {
  if (!simple) return true;
  var re = /\[\s*([a-zA-Z0-9_-]+)(?:\s*([~^$*|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*\]|([.#]?)([A-Za-z0-9_-]+)/g;
  var m, any = false;
  while ((m = re.exec(simple)) !== null) {
    any = true;
    if (m[1] !== undefined) {
      var name = m[1].toLowerCase();
      var op = m[2];
      var want = m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : (m[5] !== undefined ? m[5] : ''));
      var have = el.getAttribute(name);
      if (have === null) return false;
      if (op) {
        if (op === '=') { if (have !== want) return false; }
        else if (op === '^=') { if (String(have).indexOf(want) !== 0) return false; }
        else if (op === '*=') { if (String(have).indexOf(want) < 0) return false; }
        else if (op === '~=') { if ((' ' + have + ' ').indexOf(' ' + want + ' ') < 0) return false; }
        else return false;
      }
    } else {
      var pre = m[6], nm = m[7];
      if (pre === '#') { if (el.id !== nm) return false; }
      else if (pre === '.') { if (!el._cls.has(nm)) return false; }
      else { if (el._tag !== nm.toLowerCase()) return false; }
    }
  }
  return any;
}
function walkDesc(node, cb) {
  var list = node.childNodes;
  for (var i = 0; i < list.length; i++) {
    var c = list[i];
    if (c.nodeType === 1) { cb(c); walkDesc(c, cb); }
  }
}
function qsa(root, sel) {
  var groups = String(sel || '').trim().split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var out = [], seen = [];
  groups.forEach(function (g) {
    var seq = g.split(/\s+/).filter(Boolean);
    var cur = [root];
    seq.forEach(function (simple) {
      var next = [];
      cur.forEach(function (node) {
        walkDesc(node, function (el) { if (matchSimple(el, simple) && next.indexOf(el) < 0) next.push(el); });
      });
      cur = next;
    });
    cur.forEach(function (el) { if (seen.indexOf(el) < 0) { seen.push(el); out.push(el); } });
  });
  return out;
}

// 安装：把 mini-DOM 挂到 WA.mainWin（UI 层求值时从中取 window / document / SillyTavern）
function install(WA) {
  CUR = WA;
  installMiniDom(WA);
  WA.__parseInto = parseInto;
  WA.__qsa = qsa;
  var uiWin = {};
  var doc = { nodeType: 9, location: { href: 'http://localhost/' } };
  doc.createElement = function (t) { return WA.__makeNode(doc, t); };
  doc.head = WA.__makeNode(doc, 'head');
  doc.documentElement = WA.__makeNode(doc, 'html');
  doc.body = WA.__makeNode(doc, 'body');
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);
  doc.getElementById = function (id) { return qsa(doc.documentElement, '#' + id)[0] || null; };
  doc.getElementsByTagName = function (t) { return qsa(doc.documentElement, t); };
  doc.querySelectorAll = function (s) { return qsa(doc.documentElement, s); };
  doc.querySelector = function (s) { return qsa(doc.documentElement, s)[0] || null; };
  doc.addEventListener = function () {};
  doc.removeEventListener = function () {};
  doc.activeElement = null;
  doc.readyState = 'complete';
  uiWin.document = doc;
  uiWin.WorldAxis = WA;
  // 宿主的取法不能依赖 WA.mainWin 当前指向（run.js 的早期块会反复替换它），
  //   否则门禁会因“前面某个块把它改成了壳”而不可复现地失败。
  uiWin.SillyTavern = global.SillyTavern || globalThis.SillyTavern || (typeof SillyTavern !== 'undefined' ? SillyTavern : undefined);
  uiWin.addEventListener = function () {};
  uiWin.removeEventListener = function () {};
  uiWin.setTimeout = setTimeout;
  uiWin.clearTimeout = clearTimeout;
  uiWin.location = { href: 'http://localhost/' };
  WA.__uiWin = uiWin;
  WA.__uiDoc = doc;
  WA.mainWin = uiWin;
  WA.mainDoc = doc;
  return uiWin;
}

module.exports = { installMiniDom: installMiniDom, install: install, dataKey: dataKey, VOID_TAGS: VOID_TAGS, qsa: qsa };
