/* =============================================================================
 * 虚拟化学实验室 —— 本地静态服务器
 * -----------------------------------------------------------------------------
 * 直接双击 index.html 也能运行（全部脚本都是传统 <script>，不受 ES module 的
 * file:// 跨域限制）。但用 http:// 打开体验更好，尤其是浏览器的 localStorage
 * 在 file:// 下可能被禁用（那样"保存 / 读取"会用不了）。
 *
 * 用法：
 *     node serve.mjs            # 默认 http://127.0.0.1:5178
 *     node serve.mjs 8080       # 指定端口
 * ========================================================================== */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || 5178;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.join(ROOT, rel);
  /* 防止目录穿越 */
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found: ' + rel);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    }).end(buf);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('虚拟化学实验室已启动：http://127.0.0.1:' + PORT + '/');
  console.log('按 Ctrl+C 停止。');
});
