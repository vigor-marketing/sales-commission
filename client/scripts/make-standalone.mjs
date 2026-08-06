/**
 * 把 vite build 输出的多文件 dist 合并为单 HTML 文件（CSS/JS 全部内联），
 * 浏览器通过 file:// 协议直接打开就能工作，无需任何服务器。
 *
 * 用法：先 npm run build，然后 node scripts/make-standalone.mjs
 * 输出：dist/standalone.html
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '../dist');
const indexPath = path.join(distDir, 'index.html');

if (!fs.existsSync(indexPath)) {
  console.error('dist/index.html 不存在，请先运行 npm run build');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');

// 1. 内联 <link rel="stylesheet" ... href="..."> （属性顺序不限）
html = html.replace(
  /<link\b[^>]*?rel=["']stylesheet["'][^>]*?href=["']([^"']+)["'][^>]*?\/?>/gi,
  (_, href) => {
    const cssPath = path.join(distDir, href.replace(/^\//, ''));
    if (!fs.existsSync(cssPath)) return '';
    const css = fs.readFileSync(cssPath, 'utf8');
    return `<style>${css}</style>`;
  }
);
// 兼容属性顺序：href 在 rel 之前
html = html.replace(
  /<link\b[^>]*?href=["']([^"']+)["'][^>]*?rel=["']stylesheet["'][^>]*?\/?>/gi,
  (_, href) => {
    const cssPath = path.join(distDir, href.replace(/^\//, ''));
    if (!fs.existsSync(cssPath)) return '';
    const css = fs.readFileSync(cssPath, 'utf8');
    return `<style>${css}</style>`;
  }
);

// 2. 找到主入口 <script type="module" ... src="...">，移除并内联
const mainMatch = html.match(/<script\b[^>]*?type=["']module["'][^>]*?src=["']([^"']+)["'][^>]*?><\/script>/i)
  || html.match(/<script\b[^>]*?src=["']([^"']+)["'][^>]*?type=["']module["'][^>]*?><\/script>/i);

if (mainMatch) {
  const mainSrc = mainMatch[1];
  const mainPath = path.join(distDir, mainSrc.replace(/^\//, ''));
  const baseDir = path.dirname(mainPath);

  const seen = new Set();
  function inlineChunk(absPath, depth = 0) {
    if (depth > 10 || seen.has(absPath)) return '';
    seen.add(absPath);
    let code = fs.readFileSync(absPath, 'utf8');
    // 递归内联 import('./xxx.js') —— Vite 用动态 import 加载分包
    code = code.replace(/import\(\s*['"](\.\/[^'"]+\.js)['"]\s*\)/g, (m, rel) => {
      const target = path.join(path.dirname(absPath), rel);
      if (fs.existsSync(target)) return inlineChunk(target, depth + 1);
      return m;
    });
    // 同步 import 形式
    code = code.replace(/from\s+['"](\.\/[^'"]+\.js)['"]/g, (m, rel) => {
      const target = path.join(path.dirname(absPath), rel);
      if (fs.existsSync(target)) return `/* inlined: ${rel} */`;
      return m;
    });
    return code;
  }

  const inlined = inlineChunk(mainPath);

  // 移除主入口 script 标签
  html = html.replace(mainMatch[0], '');
  // 插入内联脚本到 body 末尾（用普通 script 标签以便 file:// 协议可用）
  html = html.replace('</body>', `<script>${inlined}</script></body>`);
}

const out = path.join(distDir, 'standalone.html');
fs.writeFileSync(out, html);
const sizeKB = (fs.statSync(out).size / 1024).toFixed(1);
console.log(`[standalone] 已生成 ${out} (${sizeKB} KB)`);
