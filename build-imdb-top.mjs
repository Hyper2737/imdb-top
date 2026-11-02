// يحمّل ملفات IMDb الرسمية ويطلع قائمة بالأعلى تقييماً (أفلام ومسلسلات فقط) في public/imdb-top.json
import fs from 'node:fs';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { Readable } from 'node:stream';

const MIN_VOTES = 25000;   // أقل عدد أصوات (ارفعه لو تبي أعمال أشهر فقط)
const LIMIT = 5000;        // كم عمل نحتفظ فيه

async function lines(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' -> HTTP ' + res.status);
  const input = Readable.fromWeb(res.body).pipe(zlib.createGunzip());
  return readline.createInterface({ input, crlfDelay: Infinity });
}

// 1) التقييمات: نحتفظ بس بالأعمال اللي أصواتها كافية
const ratings = new Map();
let first = true;
for await (const line of await lines('https://datasets.imdbws.com/title.ratings.tsv.gz')) {
  if (first) { first = false; continue; }
  const [id, r, v] = line.split('\t');
  if (+v >= MIN_VOTES) ratings.set(id, [+r, +v]);
}
console.log('rated titles:', ratings.size);

// 2) نوع العمل: نبي أفلام ومسلسلات فقط (بدون حلقات، فيديو، ألعاب...) وبدون محتوى أدلت
const TYPES = { movie: 'm', tvMovie: 'm', tvSeries: 't', tvMiniSeries: 't' };
const rows = [];
first = true;
for await (const line of await lines('https://datasets.imdbws.com/title.basics.tsv.gz')) {
  if (first) { first = false; continue; }
  const c = line.split('\t');           // tconst, titleType, primaryTitle, originalTitle, isAdult, ...
  const rt = ratings.get(c[0]);
  if (!rt || !TYPES[c[1]] || c[4] === '1') continue;
  rows.push([c[0], rt[0], rt[1], TYPES[c[1]]]);   // [imdbId, تقييم, أصوات, m/t]
}

rows.sort((a, b) => b[1] - a[1] || b[2] - a[2]);
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/imdb-top.json',
  JSON.stringify({ updated: new Date().toISOString(), items: rows.slice(0, LIMIT) }));
console.log('saved', Math.min(rows.length, LIMIT), 'items');
