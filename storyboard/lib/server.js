// 本地只读服务：静态文件 + API + SSE。

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ROOT, PROJECTS_DIR, loadProject, loadProjectDir, resolveProjectSlug, listProjects, buildRefs } from './load.js';
import { checkProject } from './check.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export function projectPayload(project) {
  const refs = {};
  for (const [id, list] of buildRefs(project)) refs[id] = list;
  const check = checkProject(project);
  const ofType = (type) => project.entries.filter((e) => e.type === type).map((e) => e.data);
  return {
    slug: project.slug,
    project: project.project,
    characters: ofType('character'),
    world: ofType('world'),
    threads: ofType('thread'),
    units: ofType('unit'),
    episodes: project.episodes,
    refs,
    check,
    parseErrors: project.parseErrors.map((f) => ({ file: f.file, message: f.error })),
  };
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function sendText(res, status, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(text);
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

export function startServer({ slug, port = 4173, host = '0.0.0.0' } = {}) {
  const resolved = resolveProjectSlug(slug);
  const projectDir = path.join(PROJECTS_DIR, resolved);
  const viewerDir = path.join(ROOT, 'viewer');

  const server = http.createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    } catch {
      return sendText(res, 400, 'bad request');
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendText(res, 405, 'method not allowed');
    }

    if (url.pathname === '/') {
      try {
        const html = fs.readFileSync(path.join(viewerDir, 'index.html'), 'utf8');
        const injected = html.replace('"__PROJECT__"', JSON.stringify(resolved));
        return sendText(res, 200, injected, MIME['.html']);
      } catch (err) {
        return sendText(res, 500, `viewer/index.html 读取失败：${err.message}`);
      }
    }

    if (url.pathname.startsWith('/viewer/')) {
      let rel;
      try {
        rel = decodeURIComponent(url.pathname.slice('/viewer/'.length));
      } catch {
        return sendText(res, 400, 'bad request');
      }
      const abs = path.resolve(viewerDir, rel);
      try {
        if (!abs.startsWith(viewerDir + path.sep) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
          return sendText(res, 404, 'not found');
        }
        return sendText(res, 200, fs.readFileSync(abs), MIME[path.extname(abs)] || 'application/octet-stream');
      } catch (err) {
        return sendText(res, 500, `读取静态文件失败：${err.message}`);
      }
    }

    if (url.pathname === '/favicon.ico') {
      res.writeHead(204);
      return res.end();
    }

    if (url.pathname === '/api/projects') {
      return sendJson(res, 200, listProjects());
    }

    if (url.pathname === '/api/project') {
      const requested = url.searchParams.get('project') || resolved;
      try {
        const project = loadProject(requested);
        return sendJson(res, 200, projectPayload(project));
      } catch (err) {
        const status = err.message && err.message.startsWith('找不到项目') ? 404 : 500;
        return sendJson(res, status, { error: err.message });
      }
    }

    if (url.pathname === '/api/stream') {
      return openStream(req, res, url.searchParams.get('project') || resolved);
    }

    return sendText(res, 404, 'not found');
  });

  // SSE：监听项目目录，防抖 200ms 后推 change；解析失败时推 error。
  function openStream(req, res, requested) {
    let watchDir;
    try {
      const project = loadProject(requested);
      watchDir = project.dir;
    } catch (err) {
      return sendJson(res, 404, { error: err.message });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (event, data) => {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    send('ready', { project: requested });

    let timer = null;
    let watcher = null;
    const flush = () => {
      timer = null;
      try {
        const loaded = loadProjectDir(watchDir, requested);
        send('change', { project: requested });
        for (const file of loaded.parseErrors) {
          send('error', { file: file.file, message: file.error });
        }
      } catch (err) {
        send('error', { file: '', message: err.message });
      }
    };
    try {
      watcher = fs.watch(watchDir, { recursive: true }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, 200);
      });
      watcher.on('error', (err) => send('error', { file: '', message: err.message }));
    } catch (err) {
      send('error', { file: '', message: `文件监听失败：${err.message}` });
    }

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, 25000);

    const close = () => {
      clearInterval(heartbeat);
      if (timer) clearTimeout(timer);
      if (watcher) watcher.close();
    };
    req.on('close', close);
    res.on('close', close);
  }

  return new Promise((resolve, reject) => {
    const onError = (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`端口 ${port} 已被占用`));
      } else {
        reject(err);
      }
    };
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      const hosts = host === '0.0.0.0' ? ['127.0.0.1', ...lanAddresses()] : [host];
      console.log(`storyboard: ${hosts.map((h) => `http://${h}:${port}`).join('  ')}  （监听 ${host}，项目 ${resolved}，Ctrl+C 退出）`);
      resolve(server);
    });
  });
}
