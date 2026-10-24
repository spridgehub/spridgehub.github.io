// Build the spridgehub hub: gather each project's GitHub activity and a live check of its
// address, then bake them into the page.
//   node build.mjs        -> index.html (artifact, includes Home) and site/index.html (public, no Home)
// The project list below is the one place to add, rename or move a project. Private groups
// (tailnet addresses) live in private-groups.json, which is not committed and only goes into
// the private artifact copy, index.html. The public site is docs/index.html.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const GROUPS = [
  { id: 'football', title: 'FootballStats', brand: true, gloss: 'Every game broken down from the match data', items: [
    { name: 'Posh On Paper', desc: 'Peterborough United · League One', url: 'https://spridgehub.github.io/posh-on-paper/', repo: 'spridgehub/posh-on-paper' },
    { name: 'Liverpool Look Back', desc: 'Liverpool · Premier League', url: 'https://spridgehub.github.io/liverpool-look-back/', repo: 'spridgehub/liverpool-look-back' },
    { name: 'Brighton Pier Review', desc: 'Brighton & Hove Albion · Premier League', url: 'https://spridgehub.github.io/Brighton-pier-review/', repo: 'spridgehub/Brighton-pier-review' },
    { name: 'Forest Facts', desc: 'Nottingham Forest · Premier League', url: 'https://spridgehub.github.io/Forest-facts/', repo: 'spridgehub/Forest-facts' },
    { name: 'Hoops History', desc: 'Celtic · Scottish Premiership', url: 'https://spridgehub.github.io/Hoops-history/', repo: 'spridgehub/Hoops-history' },
  ] },
  { id: 'f1', title: 'INLAP', gloss: 'Formula 1 analysis after every practice, qualifying and race, with interactive replays', items: [
    { name: 'INLAP weekends', desc: 'Formula 1', url: 'https://f1inlap.github.io/f1inlap-weekends/', repo: 'f1inlap/f1inlap-weekends' },
  ] },
  { id: 'traintimes', title: 'TrainTimes', gloss: 'Your next trains to work or home, coloured by how often each one runs on time', items: [
    { name: 'TrainTimes', desc: 'Trains', url: 'https://spridgehub.github.io/traintimes-live/', repo: 'spridgehub/traintimes-live' },
  ] },
  { id: 'forkcast', title: 'Forkcast', gloss: 'Tastes, a meal plan, the shopping list and the cooking, in one place', items: [
    { name: 'Forkcast', desc: 'Food', url: 'https://spridgehub.github.io/forkcast/', repo: 'spridgehub/forkcast' },
  ] },
  { id: 'pension', title: 'Pension Planner', gloss: 'Retirement income desk: annuities, drawdown and 125 years of backtests', items: [
    { name: 'Pension Planner', desc: 'Money', url: 'https://spridgehub.github.io/pension-planner/', repo: 'spridgehub/pension-planner', code: 'https://github.com/spridgehub/pension-planner' },
  ] },
  { id: 'plates', title: 'Plates', gloss: 'Training plates and food log', items: [
    { name: 'Plates', desc: 'Fitness', url: 'https://spridgehub.github.io/plates/', repo: 'spridgehub/plates', pending: 'waiting for the repo to be created' },
  ] },
];
const privatePath = new URL('./private-groups.json', import.meta.url);
if (existsSync(privatePath)) GROUPS.push(...JSON.parse(readFileSync(privatePath, 'utf8')).map((g) => ({ ...g, private: true })));

const WEEKS = 12;
const headers = { 'User-Agent': 'spridgehub-build', Accept: 'application/vnd.github+json' };
const token = process.env.GH_TOKEN || (() => { try { return execFileSync(`${process.env.HOME}/.local/bin/gh`, ['auth', 'token'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } })();
if (token) headers.Authorization = `Bearer ${token}`;

// Last good activity per repo, so a GitHub rate limit never blanks a tile.
const cachePath = new URL('./activity-cache.json', import.meta.url);
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};

async function repoInfo(repo) {
  const fresh = await repoInfoLive(repo).catch(() => null);
  if (fresh) cache[repo] = fresh;
  return fresh ?? cache[repo] ?? null;
}
async function repoInfoLive(repo) {
  const r = await fetch(`https://api.github.com/repos/${repo}`, { headers });
  if (!r.ok) return null;
  const d = await r.json();
  const since = new Date(Date.now() - WEEKS * 7 * 864e5);
  const weeks = Array(WEEKS).fill(0);
  for (let page = 1; page <= 3; page++) {
    const c = await fetch(`https://api.github.com/repos/${repo}/commits?since=${since.toISOString()}&per_page=100&page=${page}`, { headers });
    if (!c.ok) return null;
    const list = await c.json();
    for (const x of list) {
      const age = (Date.now() - new Date(x.commit.committer.date)) / (7 * 864e5);
      const i = WEEKS - 1 - Math.floor(age);
      if (i >= 0 && i < WEEKS) weeks[i]++;
    }
    if (list.length < 100) break;
  }
  return { pushed: d.pushed_at, weeks };
}

async function check(url) {
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15000) });
    return r.status;
  } catch { return 0; }
}

for (const g of GROUPS) {
  for (const i of g.items) {
    if (g.private) { i.status = 'home'; continue; }
    const [info, code] = await Promise.all([i.repo ? repoInfo(i.repo) : null, check(i.url)]);
    i.status = code === 200 ? 'live' : i.pending ? 'pending' : 'down';
    if (info) { i.pushed = info.pushed; i.weeks = info.weeks; }
    console.log(`${i.status.padEnd(7)} ${String(code).padEnd(4)} ${i.name}${info ? `  pushed ${info.pushed.slice(0, 10)}  ${info.weeks.join(' ')}` : ''}`);
  }
}

writeFileSync(cachePath, JSON.stringify(cache, null, 1) + '\n');
const data = { built: new Date().toISOString(), groups: GROUPS };
const page = readFileSync(new URL('./hub.html', import.meta.url), 'utf8');
const inject = (html, d) => html.replace(/\/\*DATA\*\/[\s\S]*?\/\*END\*\//, `/*DATA*/${JSON.stringify(d)}/*END*/`);
writeFileSync(new URL('./index.html', import.meta.url), inject(page, data));

const pub = { ...data, groups: GROUPS.filter((g) => !g.private) };
mkdirSync(new URL('./docs/', import.meta.url), { recursive: true });
writeFileSync(new URL('./docs/index.html', import.meta.url),
  '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
  + '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}[hidden]{display:none!important}</style></head><body>'
  + inject(page, pub) + '</body></html>\n');
writeFileSync(new URL('./docs/.nojekyll', import.meta.url), '');
console.log('wrote index.html (private artifact copy) and docs/index.html (public site)');
