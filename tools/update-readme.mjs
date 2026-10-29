// Rewrites the auto-updated parts of ../README.md:
//   - the typing-SVG lines at the top (fixed lines + latest repo + LeetCode solved count)
//   - the All Repositories table between the REPOS:START / REPOS:END markers
// Everything else in the README is left untouched. Run by .github/workflows/update-readme.yml
// daily; can also be run locally with `node tools/update-readme.mjs`.
import { readFile, writeFile } from 'node:fs/promises';

const README = new URL('../README.md', import.meta.url);
const cfg = JSON.parse(await readFile(new URL('./readme-config.json', import.meta.url), 'utf8'));

async function fetchRepos() {
  // GITHUB_TOKEN is set inside Actions; without it the API allows only 60 requests/hour per IP.
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'update-readme' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const all = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`https://api.github.com/users/${cfg.user}/repos?type=owner&per_page=100&page=${page}`, { headers });
    // Fail loudly rather than write an empty table over the real one.
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    all.push(...batch);
    if (batch.length < 100) return all;
  }
}

async function fetchLeetCodeSolved() {
  const res = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com' },
    body: JSON.stringify({
      query: 'query($u:String!){matchedUser(username:$u){submitStatsGlobal{acSubmissionNum{difficulty count}}}}',
      variables: { u: cfg.leetcodeUser },
    }),
  });
  const json = await res.json();
  return json.data.matchedUser.submitStatsGlobal.acSubmissionNum.find((x) => x.difficulty === 'All').count;
}

const displayName = (r) => cfg.displayNames[r.name] ?? r.name.replace(/[-_]+/g, ' ');

function buildTable(repos) {
  const known = Object.keys(cfg.repos);
  // Repos not yet in the config are new: put them first (newest first) so fresh work is visible,
  // then the hand-curated order from the config.
  const fresh = repos.filter((r) => !known.includes(r.name)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const curated = known.map((n) => repos.find((r) => r.name === n)).filter(Boolean);
  const rows = [...fresh, ...curated].map((r) => {
    const o = cfg.repos[r.name] ?? {};
    const desc = (o.description ?? r.description ?? '—').replace(/\|/g, '/');
    const lang = o.language ?? r.language ?? '—';
    return `| [${r.name}](${r.html_url}) | ${desc} | ${lang} | ⭐ ${r.stargazers_count} |`;
  });
  return ['| Repository | Description | Language | Stars |', '|:---|:---|:---|:---:|', ...rows].join('\n');
}

function typingLinesParam(lines) {
  // readme-typing-svg separates lines with ';' and reads '+' as a space.
  return lines.map((l) => encodeURIComponent(l).replace(/%20/g, '+')).join(';');
}

let md = await readFile(README, 'utf8');

const repos = (await fetchRepos()).filter(
  (r) => !r.private && !cfg.exclude.includes(r.name) && (!r.fork || cfg.includeForks.includes(r.name)),
);

let solved;
try {
  solved = await fetchLeetCodeSolved();
} catch (e) {
  // LeetCode sometimes blocks CI IPs; keep the last known count instead of failing the whole run.
  solved = Number(/(\d+)\+LeetCode\+problems/.exec(md)?.[1]);
  console.warn(`LeetCode fetch failed (${e.message}); keeping ${solved}`);
}

const newest = [...repos].filter((r) => !r.fork).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
const lines = [...cfg.typingLines, `Latest build: ${displayName(newest)}`];
if (Number.isFinite(solved)) lines.push(`${solved} LeetCode problems and counting`);

md = md.replace(/(readme-typing-svg\.demolab\.com\?[^"]*?&lines=)[^"&]*/, `$1${typingLinesParam(lines)}`);
md = md.replace(
  /(<!-- REPOS:START[^\n]*-->\n)[\s\S]*?(\n<!-- REPOS:END -->)/,
  `$1${buildTable(repos)}$2`,
);

await writeFile(README, md);
console.log(`README updated: ${repos.length} repos, latest "${displayName(newest)}", LeetCode ${solved}`);
