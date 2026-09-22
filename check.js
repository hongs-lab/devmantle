// node check.js — validates words.js and prints nearest neighbours for a few probes
const fs = require('fs');
const game = fs.readFileSync(__dirname + '/game.js', 'utf8');
const code = fs.readFileSync(__dirname + '/words.js', 'utf8') + game.slice(0, game.indexOf('// --- UI ---'));
const { RAW, LANGS, parse, rankFor, lookup } = new Function(code + 'return { RAW, LANGS, parse, rankFor, lookup };')();

const probes = { c: ['malloc', 'printf'], cpp: ['vector', 'unique_ptr', 'cout'], py: ['append', 'dict'], js: ['map', 'fetch'], java: ['HashMap', 'println'] };
const W = {};
for (const { id } of LANGS) {
  const words = W[id] = parse(RAW[id]);
  const names = words.map(w => w.name);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  const bad = words.filter(w => !w.desc || w.tags.some(t => !t)).map(w => w.name);
  if (dup.length || bad.length) throw new Error(`${id}: duplicate=${dup} malformed=${bad}`);
  console.log(`${id}: ${words.length} words, ${words.filter(w => !w.rare).length} answerable`);
  for (const p of probes[id]) {
    const r = rankFor(words, words.find(w => w.name === p));
    console.log(`  ${p} → ` + r.slice(1, 7).map(x => `${x.w.name} ${(x.s * 100).toFixed(1)}`).join(', '));
  }
}

const expect = [
  ['c', '#include <stdio.h>', 'include'], ['c', ' printf() ', 'printf'], ['c', 'nope', undefined],
  ['cpp', 'std::vector<int>', 'vector'], ['cpp', 'std::cout', 'cout'], ['cpp', 'v.push_back()', 'push_back'],
  ['java', 'System.out.println', 'println'], ['java', '@Override', 'Override'],
  ['js', 'log', 'console.log'], ['js', 'Array.prototype.map', 'map'], ['js', 'Set', 'Set'], ['js', 'set', 'set'],
];
for (const [id, q, want] of expect) {
  const got = lookup(W[id], q)?.name;
  if (got !== want) throw new Error(`lookup(${id}, "${q}") = ${got}, expected ${want}`);
}
console.log('ok');
