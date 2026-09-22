const LANGS = [
  { id: 'c', file: 'main.c', name: 'C', dot: '#555555', ps: '(gdb)', eg: 'malloc' },
  { id: 'cpp', file: 'main.cpp', name: 'C++', dot: '#f34b7d', ps: '[cling]$', eg: 'vector' },
  { id: 'py', file: 'main.py', name: 'Python', dot: '#3572A5', ps: '>>>', eg: 'print' },
  { id: 'js', file: 'index.js', name: 'JavaScript', dot: '#f1e05a', ps: '>', eg: 'map' },
  { id: 'java', file: 'Main.java', name: 'Java', dot: '#b07219', ps: 'jshell>', eg: 'String' },
  { id: 'rs', file: 'main.rs', name: 'Rust', dot: '#dea584', ps: '>>', eg: 'unwrap' },
];
const HINT_RANKS = [30, 10, 3];

function bigrams(s) {
  const g = new Set();
  for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
  return g;
}

function parse(raw) {
  const words = raw.trim().split('\n').map(line => {
    let [name, tags, desc] = line.split('|');
    const rare = name.startsWith('~');
    if (rare) name = name.slice(1);
    return { name, tags: tags.split(' '), desc, rare, grams: bigrams(name.toLowerCase()) };
  });
  // 프로토타입 없는 객체: 태그 이름이 constructor·toString 같아도 Object 기본 속성과 안 부딪힌다
  const bag = () => Object.create(null);
  const df = bag(), co = bag();
  for (const w of words) for (const t of w.tags) {
    df[t] = (df[t] || 0) + 1;
    co[t] ??= bag();
    for (const u of w.tags) if (u !== t) co[t][u] = (co[t][u] || 0) + 1;
  }
  // IDF: a tag shared by few words says more than one shared by many
  const idf = t => Math.log(1 + words.length / df[t]);
  for (const w of words) {
    w.vec = bag();
    for (const t of w.tags) w.vec[t] = idf(t);
    // tags that often appear together (pp ↔ macro ↔ const) leak weight to each other,
    // so a far-off guess still gets a small ordered score instead of a flat 0
    for (const t of w.tags) for (const u in co[t]) w.vec[u] = (w.vec[u] || 0) + idf(t) * co[t][u] / Math.sqrt(df[t] * df[u]);
    w.norm = Math.hypot(...Object.values(w.vec));
  }
  return words;
}

function sim(a, b) {
  if (a === b) return 1;
  let dot = 0, shared = 0;
  for (const t in a.vec) if (t in b.vec) dot += a.vec[t] * b.vec[t];
  for (const g of a.grams) if (b.grams.has(g)) shared++;
  const spell = a.grams.size + b.grams.size ? 2 * shared / (a.grams.size + b.grams.size) : 0;
  return 0.8 * dot / (a.norm * b.norm) + 0.2 * spell;
}

// index in the returned array = rank (0 = the answer)
function rankFor(words, answer) {
  return words.map(w => ({ w, s: sim(answer, w) }))
    .sort((x, y) => y.s - x.s || x.w.name.localeCompare(y.w.name));
}

function lookup(words, raw) {
  const q = raw.replace(/\s+/g, '').replace(/^[#@&]+/, '').replace(/[();]+$/, '').replace(/<.*>$/, '');
  if (!q) return null;
  const lq = q.toLowerCase();
  const hit = words.find(w => w.name === q || w.name === q + '!') // Rust 매크로는 ! 생략 가능
    || words.find(w => w.name.toLowerCase() === lq);
  if (hit) return hit;
  const seg = q.slice(Math.max(q.lastIndexOf('.'), q.lastIndexOf(':')) + 1);
  if (seg !== q) return lookup(words, seg); // "System.out.println" → println, "std::vector<int>" → vector
  const c = words.filter(w => w.name.toLowerCase().endsWith('.' + lq)); // "log" → console.log
  return c.length === 1 ? c[0] : null;
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// --- UI ---
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayNo = Math.round((Date.parse(today) - Date.parse('2026-09-22')) / 864e5) + 1;
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const games = {};
function game(id) {
  if (games[id]) return games[id];
  const words = parse(RAW[id]);
  const pool = words.filter(w => !w.rare);
  const answer = pool[hash(id + today) % pool.length];
  const ranked = rankFor(words, answer);
  const info = new Map(ranked.map((r, i) => [r.w.name, { w: r.w, s: r.s, rank: i }]));
  const key = `devmantle:${id}:${today}`;
  const saved = store.get(key) || {};
  const guesses = (saved.guesses || []).filter(x => info.has(x.name));
  return games[id] = { id, words, answer, ranked, info, key, guesses, gaveUp: !!saved.gaveUp };
}
const save = g => store.set(g.key, { guesses: g.guesses, gaveUp: g.gaveUp });
const solvedAt = g => g.guesses.findIndex(x => x.name === g.answer.name && !x.hint);
const done = g => g.gaveUp || solvedAt(g) >= 0;

let cur = LANGS.some(l => l.id === store.get('devmantle:lang')) ? store.get('devmantle:lang') : 'c';
let armed = 0;

function say(html, err) {
  $('msg').innerHTML = html;
  $('msg').className = 'msg' + (err ? ' err' : '');
}

function renderTabs() {
  const tabs = $('tabs'), x = tabs.scrollLeft;
  tabs.innerHTML = LANGS.map(l => `<button type="button" role="tab" class="tab${done(game(l.id)) ? ' done' : ''}"
    aria-selected="${l.id === cur}" data-id="${l.id}" style="--dot:${l.dot}"><i class="dot"></i>${l.file}</button>`).join('');
  // 다시 그려도 가로 스크롤을 유지하고, 좁은 화면에서도 선택한 탭이 보이게
  const sel = tabs.querySelector('[aria-selected="true"]');
  tabs.scrollLeft = Math.min(Math.max(x, sel.offsetLeft + sel.offsetWidth - tabs.clientWidth), sel.offsetLeft);
}

function render() {
  const g = game(cur), lang = LANGS.find(l => l.id === cur), N = g.words.length;
  renderTabs();
  const hintsLeft = HINT_RANKS.length - g.guesses.filter(x => x.hint).length;
  $('meta').textContent = `#${dayNo} · ${today} · ${lang.name} 식별자 ${N}개 · 힌트 ${hintsLeft}/${HINT_RANKS.length}`;
  $('ps').textContent = lang.ps;
  $('guess').placeholder = `식별자 입력 (예: ${lang.eg})`;

  const res = $('result');
  res.hidden = !done(g);
  if (done(g)) {
    const at = solvedAt(g), a = g.answer;
    res.className = 'result';
    res.innerHTML = `
      <p class="kicker">${at >= 0 ? `정답! ${at + 1}번 만에 맞혔어요` : '오늘의 정답'}</p>
      <p class="answer">${esc(a.name)}</p>
      <p class="desc">${esc(a.desc)}</p>
      <ul class="tags">${a.tags.map(t => `<li>#${esc(t)}</li>`).join('')}</ul>
      <h3>가장 가까운 식별자</h3>
      <ol class="near">${g.ranked.slice(1, 11).map((r, i) =>
        `<li><b>${i + 1}</b><code>${esc(r.w.name)}</code><span>${(r.s * 100).toFixed(2)}</span></li>`).join('')}</ol>
      <p class="next">내일 00시에 새 정답이 열려요. 다른 언어 탭도 도전해보세요.</p>`;
  }

  if (!g.guesses.length) {
    $('board').innerHTML = `<p class="empty">아직 입력한 식별자가 없어요.</p>`;
    return;
  }
  const rows = g.guesses.map((x, i) => ({ ...g.info.get(x.name), n: i + 1, hint: x.hint }));
  const row = (r, extra = '') => `<div class="row${extra}${r.rank === 0 ? ' win' : r.rank <= 10 ? ' hot' : ''}" data-name="${esc(r.w.name)}">
    <span class="n">${r.n}</span>
    <span class="id"><code>${esc(r.w.name)}</code>${r.hint ? '<em class="chip">힌트</em>' : ''}<small>${esc(r.w.desc)}</small></span>
    <span class="sc">${(r.s * 100).toFixed(2)}</span>
    <span class="rk">${r.rank === 0 ? '정답' : r.rank + '위'}<i style="--w:${((N - r.rank) / N * 100).toFixed(1)}%"></i></span>
  </div>`;
  $('board').innerHTML =
    `<div class="row head"><span>#</span><span>식별자</span><span>유사도</span><span>순위</span></div>` +
    row(rows[rows.length - 1], ' latest') +
    [...rows].sort((a, b) => a.rank - b.rank).map(r => row(r)).join('');
}

function flash(name) {
  const el = $('board').querySelector(`.row:not(.latest)[data-name="${CSS.escape(name)}"]`);
  if (!el) return;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// 빰빰빰 빠~밤: 삼연음 G4 뒤에 C major 화음, 톱니파를 로우패스로 깎아 금관 느낌
function fanfare() {
  try {
    const ac = new AudioContext(), now = ac.currentTime;
    const lp = ac.createBiquadFilter();
    lp.frequency.value = 2200;
    lp.connect(ac.destination);
    const notes = [[392, 0, .1], [392, .12, .1], [392, .24, .1], [523.25, .38, 1], [659.25, .38, 1], [783.99, .38, 1]];
    for (const [f, t, d] of notes) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sawtooth';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.exponentialRampToValueAtTime(0.12, now + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + d);
      o.connect(g).connect(lp);
      o.start(now + t);
      o.stop(now + t + d + 0.05);
    }
    setTimeout(() => ac.close(), 1600);
  } catch {}
}

// 화면 아래 양쪽 모서리에서 색종이를 쏘아 올린다
function confetti() {
  const c = document.createElement('canvas'), x = c.getContext('2d');
  const W = innerWidth, H = innerHeight, dpr = devicePixelRatio || 1;
  c.className = 'confetti';
  c.width = W * dpr;
  c.height = H * dpr;
  x.scale(dpr, dpr);
  document.body.append(c);
  const css = getComputedStyle(document.documentElement);
  const colors = ['--accent', '--hot'].map(v => css.getPropertyValue(v).trim()).concat(LANGS.map(l => l.dot));
  const G = 0.3, DUR = 4000, lift = Math.sqrt(2 * G * H);
  const ps = Array.from({ length: 160 }, (_, i) => {
    const dir = i % 2 ? -1 : 1;
    return {
      x: dir > 0 ? 0 : W, y: H,
      vx: dir * (3 + Math.random() * 9), vy: -lift * (0.55 + Math.random() * 0.45),
      r: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.4,
      w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, c: colors[i % colors.length],
    };
  });
  const start = performance.now();
  let last = start;
  requestAnimationFrame(function frame(t) {
    const k = Math.min((t - last) / 16.7, 3); // 120Hz 화면에서도 같은 속도
    last = t;
    x.clearRect(0, 0, W, H);
    x.globalAlpha = Math.min(1, (DUR - (t - start)) / 800);
    for (const p of ps) {
      p.vy = Math.min(p.vy + G * k, 3); // 종이라서 천천히 떨어진다
      p.vx *= 0.99 ** k;
      p.x += (p.vx + Math.sin(p.r) * 0.8) * k;
      p.y += p.vy * k;
      p.r += p.vr * k;
      x.save();
      x.translate(p.x, p.y);
      x.rotate(p.r);
      x.fillStyle = p.c;
      x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      x.restore();
    }
    if (t - start < DUR) requestAnimationFrame(frame);
    else c.remove();
  });
}

function celebrate() {
  fanfare();
  const res = $('result');
  res.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  res.classList.add('pop');
  confetti();
}

function disarm() {
  clearTimeout(armed);
  armed = 0;
  $('giveup').classList.remove('armed');
}

$('tabs').addEventListener('click', e => {
  const t = e.target.closest('.tab');
  if (!t || t.dataset.id === cur) return;
  cur = t.dataset.id;
  store.set('devmantle:lang', cur);
  disarm();
  say('');
  render();
  $('guess').focus();
});

$('form').addEventListener('submit', e => {
  e.preventDefault();
  const g = game(cur), q = $('guess').value.trim();
  if (!q) return;
  const w = lookup(g.words, q);
  if (!w) return say(`<code>${esc(q)}</code> — 사전에 없는 식별자예요. 표준 라이브러리·키워드 위주로 시도해보세요.`, true);
  $('guess').value = '';
  disarm();
  if (g.guesses.some(x => x.name === w.name)) {
    say(`<code>${esc(w.name)}</code> — 이미 입력한 식별자예요.`);
    return flash(w.name);
  }
  g.guesses.push({ name: w.name });
  save(g);
  say(w.name !== q ? `<code>${esc(w.name)}</code> 식별자로 인식했어요.` : '');
  render();
  if (w === g.answer) celebrate();
});

$('hint').addEventListener('click', () => {
  const g = game(cur);
  disarm();
  if (done(g)) return say('이미 끝난 문제예요.');
  const used = g.guesses.filter(x => x.hint).length;
  if (used >= HINT_RANKS.length) return say('힌트를 모두 썼어요.');
  const guessed = new Set(g.guesses.map(x => x.name));
  const best = Math.min(Infinity, ...g.guesses.map(x => g.info.get(x.name).rank));
  let t = Math.min(HINT_RANKS[used], best - 1);
  while (t >= 1 && guessed.has(g.ranked[t].w.name)) t--;
  if (t < 1) return say('더 줄 힌트가 없어요. 정답이 코앞이에요!');
  const name = g.ranked[t].w.name;
  g.guesses.push({ name, hint: true });
  save(g);
  say(`힌트: <code>${esc(name)}</code> — ${t}위`);
  render();
});

$('giveup').addEventListener('click', () => {
  const g = game(cur);
  if (done(g)) return say('이미 끝난 문제예요.');
  if (!armed) {
    $('giveup').classList.add('armed');
    armed = setTimeout(disarm, 3000);
    return say('한 번 더 누르면 정답을 공개해요.', true);
  }
  disarm();
  g.gaveUp = true;
  save(g);
  say('');
  render();
});

render();
