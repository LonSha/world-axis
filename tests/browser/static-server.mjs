/* ============================================================
 * tests/browser/static-server.mjs — 零依赖静态服务（L4 真浏览器层的基础设施）
 * ------------------------------------------------------------
 * 为什么需要（而不是把 fixture 写成 file:// 直接打开）：
 *   file:// 之下 Chromium 对**多脚本/多模块并发加载**的处理不稳定，实测表现为
 *   `await` 之后的脚本静默挂住（既无异常也不继续），于是一批本该执行到位的判据
 *   拿到空白读数——「没跑起来」被读成「没有问题」。这与本仓最贵的那类假绿同族。
 *   走 HTTP 单源（fixture 与仓库文件同 origin）后形态稳定。
 *
 * 本服务只做三件事：
 *   ① 把仓库根当静态目录（只读、越界即 403）；
 *   ② 对 `/` 返回调用方给的 fixture HTML（场景代码由它以内联 module 形式带上）；
 *   ③ 如实记录每一次被请求的相对路径（用于「真模块图确实被加载」这条读数）。
 * 它**不做**任何写入、不解析任何请求体、不落任何日志文件。
 *
 * 与 WORLD AXIS 的关系：本层是**只读**的——静态服务只 serve、从不改盘上文件。
 *   故 L4 不需要 isolated-runner 的候选树（那是给破坏性无头回归用的）。L4 直接
 *   对当前工作树取真源，读到的就是候选人手上那一份。
 * ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

/**
 * 真实宿主的扩展挂载前缀。
 *   为什么必须忠实模拟这一条（不能图省事直接 serve 仓库根）：
 *     `index.js` 的 `getBaseUrl()` 是**从 DOM 里读回来**的 —— 它遍历
 *     `document.getElementsByTagName('script')`，找 src 里含 `WorldAxis` 的那一条，
 *     再 `slice(0, src.indexOf('/index.js'))`。于是：
 *       · fixture 的 script src 必须长成宿主那个形态，baseUrl 才取得到真值；
 *       · 模块加载 URL（`baseUrl + '/' + rel + '?v=' + VERSION`）才落在同一 origin 上。
 *     若改用任意路径，这一层就等于「自己造了个宿主不存在的环境」——读数不成立。
 */
export const EXT_MOUNT = '/scripts/extensions/third-party/WorldAxis';

/**
 * 起一个只读静态服务。
 * @param {{root:string, fixture?:string, aliases?:Record<string,string>}} opts
 *   `root` 必须是绝对路径；所有请求都被解析到它之下，越界（含 `..` / 编码穿越）一律 403。
 *   `fixture` 是 `/` 的 HTML 响应体（场景代码由调用方拼好传进来）。
 *   `aliases` 把宿主路径前缀映射回仓库根（默认 EXT_MOUNT → 仓库根）。
 * @returns {Promise<{origin:string, port:number, served:string[], close:()=>Promise<void>}>}
 */
export async function startStaticServer(opts = {}) {
  const root = path.resolve(String(opts.root || process.cwd()));
  const fixture = String(opts.fixture ?? '<!doctype html><meta charset="utf-8"><title>empty</title>');
  const aliases = opts.aliases === undefined
    ? [{ prefix: EXT_MOUNT, target: '' }]
    : Object.entries(opts.aliases).map(([prefix, target]) => ({ prefix, target: String(target || '') }));
  const served = [];
  const server = http.createServer((req, res) => {
    let pathname = '/';
    try {
      pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
    } catch (_e) {
      res.writeHead(400); res.end('bad request'); return;
    }
    if (pathname === '/' || pathname === '/index.html') {
      served.push('<fixture>');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fixture);
      return;
    }
    const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
    /* 路径别名：宿主把扩展挂在 EXT_MOUNT 下，请求形如
     *   /scripts/extensions/third-party/WorldAxis/core/clock.js
     * 而仓库根下就是 core/clock.js。剥掉前缀后按同一套越界判据解析。 */
    let sub = rel;
    for (const a of aliases) {
      const pre = a.prefix.replace(/^\/+/, '');
      if (sub === pre || sub.startsWith(pre + '/')) {
        const rest = sub.slice(pre.length).replace(/^\/+/, '');
        sub = a.target ? (a.target + '/' + rest) : rest;
        break;
      }
    }
    const abs = path.resolve(root, sub);
    // 越界判据：解析后的绝对路径必须仍在 root 之下（`path.relative` 不以 `..` 开头）。
    const rel2root = path.relative(root, abs);
    if (rel2root.startsWith('..') || path.isAbsolute(rel2root)) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    fs.readFile(abs, (err, buf) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      served.push(sub);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(buf);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    origin: `http://127.0.0.1:${port}`,
    port,
    /** 本次会话中真实被请求过的相对路径（按请求顺序，含重复）。 */
    served,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}