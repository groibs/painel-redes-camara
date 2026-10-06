// Package the same Next.js UI and Câmara API as one portable Worker.
// Optional collector credentials are supplied only through runtime bindings.
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const files = {};
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon' };
function add(file, route) {
  files[route] = { body: fs.readFileSync(file).toString('base64'), type: mime[path.extname(file)] || 'application/octet-stream' };
}
function walk(directory, route) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const local = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(local, `${route}/${entry.name}`);
    else if (entry.isFile() && !entry.name.endsWith('.map')) add(local, `${route}/${entry.name}`);
  }
}
add('.next/server/app/index.html', '/');
add('.next/server/app/demo.html', '/demo');
walk('.next/static', '/_next/static');
walk('public', '');
add('app/icon.svg', '/icon.svg');

const source = `
import { getPanel } from './lib/camara.ts';
const files = ${JSON.stringify(files)};
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405,headers:{Allow:'GET, HEAD'}});
    if (url.pathname === '/api/painel') {
      try {
        const data = await getPanel(env || {});
        const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=0, s-maxage=30, stale-while-revalidate=30'};
        return new Response(request.method === 'HEAD' ? null : JSON.stringify(data), {headers});
      }
      catch { console.error('[painel] erro ao preparar resposta'); return Response.json({error:'Painel temporariamente indisponível'},{status:503}); }
    }
    const route = url.pathname === '/demo/' ? '/demo' : url.pathname;
    const file = files[route];
    if (!file) return new Response('Página não encontrada', {status:404});
    const headers = {'Content-Type':file.type,'Cache-Control':route.startsWith('/_next/static/')?'public, max-age=31536000, immutable':'no-cache','X-Content-Type-Options':'nosniff'};
    return new Response(request.method === 'HEAD' ? null : Uint8Array.from(atob(file.body), ch => ch.charCodeAt(0)), {headers});
  }
};`;
fs.rmSync('dist', { recursive: true, force: true });
fs.mkdirSync('dist/server', { recursive: true });
await build({
  stdin: { contents: source, resolveDir: process.cwd(), sourcefile: 'portable-preview.ts', loader: 'ts' },
  outfile: 'dist/server/index.js', bundle: true, platform: 'browser', format: 'esm', minify: true, target: 'es2022',
  define: { 'process.env.PANEL_VOTE_ID': 'undefined', 'process.env.PANEL_SOCIAL_SOURCE_URL': 'undefined', 'process.env.PANEL_SOCIAL_SOURCE_TOKEN': 'undefined' },
});
if (fs.existsSync('.openai/hosting.json')) {
  fs.mkdirSync('dist/.openai', { recursive: true });
  fs.copyFileSync('.openai/hosting.json', 'dist/.openai/hosting.json');
}
console.log(JSON.stringify({ assets: Object.keys(files).length, workerBytes: fs.statSync('dist/server/index.js').size }));
