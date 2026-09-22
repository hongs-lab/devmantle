/* index.html 의 CSS·JS를 한 파일로 합쳐 dist/index.html 을 만든다.
   Artifact 로 올릴 때 쓰는 자립형(self-contained) 빌드.
   doctype/html/head/body 래퍼는 Artifact 쪽에서 씌워주므로 걷어낸다.
   실행: node build.mjs  (의존성 없음)                                */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const html = read('index.html');
const head = html.slice(html.indexOf('<title>'), html.indexOf('</head>'));
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));

// 함수로 넘겨야 JS 안의 $& $' 같은 문자열이 치환 패턴으로 해석되지 않는다
const out = (head + body)
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${read('style.css')}</style>`)
  .replace('<script src="words.js"></script>', () => `<script>\n${read('words.js')}</script>`)
  .replace('<script src="game.js"></script>', () => `<script>\n${read('game.js')}</script>`)
  .trim() + '\n';

if (/href="style\.css"|src="(words|game)\.js"/.test(out)) {
  throw new Error('index.html 의 <link>/<script> 태그 모양이 바뀌어 인라인하지 못했어요. build.mjs 의 치환 문자열을 맞춰주세요.');
}

mkdirSync(new URL('dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('dist/index.html', import.meta.url), out);
console.log(`dist/index.html — ${(Buffer.byteLength(out) / 1024).toFixed(0)} KB`);
