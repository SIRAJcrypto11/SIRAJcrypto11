import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const OWNER = process.env.GITHUB_OWNER || 'SIRAJcrypto11';
const README_PATH = process.env.README_PATH || 'README.md';
const STATS_SVG_PATH = process.env.STATS_SVG_PATH || 'assets/github-stats.svg';
const token = process.env.PROFILE_TOKEN || '';
const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};
if (token) headers.Authorization = `Bearer ${token}`;

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub API returned ${response.status}; README was not updated`);
  return response.json();
}

async function paginate(path) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const batch = await github(`${path}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error('Unexpected GitHub repositories response');
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}

async function fetchRepos() {
  const repos = token
    ? await paginate('/user/repos?visibility=all&affiliation=owner&sort=updated')
    : await paginate(`/users/${encodeURIComponent(OWNER)}/repos?type=owner&sort=updated`);
  return repos.filter((repo) => repo.owner?.login?.toLowerCase() === OWNER.toLowerCase());
}

function includesAny(value, terms) {
  const text = value.toLowerCase();
  return terms.some((term) => text.includes(term));
}

function readCachedPrivateCount(readme) {
  const match = readme.match(/\| Private repositories \| \*\*(\d+)\*\* \(checked via GitHub on (\d{4}-\d{2}-\d{2})/);
  return match ? { count: Number(match[1]), date: match[2] } : null;
}

function readCachedContributionCount(svg) {
  const match = svg.match(/data-contributions="(\d+)" data-contribution-date="(\d{4}-\d{2}-\d{2})"/);
  return match ? { count: Number(match[1]), date: match[2] } : null;
}

async function fetchContributionCount() {
  try {
    const response = await fetch(`https://github.com/users/${encodeURIComponent(OWNER)}/contributions`, {
      headers: { 'User-Agent': 'SIRAJcrypto11-profile-updater', Accept: 'text/html' },
    });
    if (!response.ok) return null;
    const html = await response.text();
    const match = html.match(/([\d,]+) contributions in the last year/i);
    return match ? Number(match[1].replaceAll(',', '')) : null;
  } catch {
    return null;
  }
}

function buildStatsSvg(repos, privateCache, contributionCache) {
  const publicRepos = repos.filter((repo) => repo.private !== true);
  const privateRepos = token ? repos.filter((repo) => repo.private === true) : null;
  const activePublic = publicRepos.filter((repo) => !repo.archived);
  const stars = publicRepos.reduce((total, repo) => total + (repo.stargazers_count || 0), 0);
  const privateCount = privateRepos ? privateRepos.length : privateCache?.count;
  const contributions = contributionCache?.count;
  const date = new Date().toISOString().slice(0, 10);
  const metrics = [
    ['TOTAL REPOS', privateCount === undefined ? String(publicRepos.length) + '+' : String(publicRepos.length + privateCount), 'owned repositories'],
    ['PUBLIC REPOS', String(publicRepos.length), String(activePublic.length) + ' active'],
    ['PRIVATE REPOS', privateCount === undefined ? 'Pending' : String(privateCount), privateRepos ? 'count only' : (privateCache ? 'last checked ' + privateCache.date : 'read-only token needed')],
    ['CONTRIBUTIONS', contributions === undefined ? 'Open profile' : contributions.toLocaleString('en-US'), contributionCache ? 'last 12 months · ' + contributionCache.date : 'GitHub contribution calendar'],
  ];
  const cards = metrics.map((metric, index) => {
    const x = 28 + index * 244;
    return '<g transform="translate(' + x + ',0)">' +
      '<rect x="0" y="0" width="226" height="116" rx="8" fill="#111827" stroke="#30363d"/>' +
      '<rect x="0" y="0" width="4" height="116" rx="2" fill="' + ['#2dd4bf', '#60a5fa', '#fb923c', '#f472b6', '#a3e635'][index] + '"/>' +
      '<text x="18" y="26" fill="#9ca3af" font-size="12" font-family="Arial, sans-serif" font-weight="700">' + metric[0] + '</text>' +
      '<text x="18" y="66" fill="#f3f4f6" font-size="28" font-family="Arial, sans-serif" font-weight="700">' + metric[1] + '</text>' +
      '<text x="18" y="94" fill="#9ca3af" font-size="11" font-family="Arial, sans-serif">' + metric[2] + '</text>' +
      '</g>';
  }).join('');
  const privateNote = privateRepos
    ? 'Private repository names and details are never included.'
    : privateCache
      ? 'Private count last verified ' + privateCache.date + '; automatic refresh needs PROFILE_TOKEN.'
      : 'Private count appears after adding the read-only PROFILE_TOKEN secret.';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 190" role="img" aria-labelledby="title desc" data-contributions="' + (contributions ?? '') + '" data-contribution-date="' + (contributions === undefined ? '' : date) + '">' +
    '<title id="title">Siraj Nur Ihrom GitHub statistics</title>' +
    '<desc id="desc">Public GitHub profile statistics with private repository names omitted.</desc>' +
    '<rect width="1024" height="190" rx="8" fill="#0d1117"/>' +
    '<text x="28" y="26" fill="#f3f4f6" font-size="14" font-family="Arial, sans-serif" font-weight="700">GITHUB SNAPSHOT · ' + date + '</text>' +
    '<rect x="28" y="38" width="968" height="2" rx="1" fill="#30363d"><animate attributeName="opacity" values="0.45;1;0.45" dur="4s" repeatCount="indefinite"/></rect>' +
    '<g transform="translate(0,54)">' + cards + '</g>' +
    '<text x="28" y="184" fill="#8b949e" font-size="10" font-family="Arial, sans-serif">' + privateNote + '</text>' +
    '</svg>';
}

function buildBlock(repos, privateCache) {
  const publicRepos = repos.filter((repo) => repo.private !== true);
  const privateRepos = token ? repos.filter((repo) => repo.private === true) : null;
  const activePublic = publicRepos.filter((repo) => !repo.archived);
  const stars = publicRepos.reduce((total, repo) => total + (repo.stargazers_count || 0), 0);
  const ai = publicRepos.filter((repo) => includesAny(`${repo.name} ${repo.description || ''}`, ['ai', 'agent', 'otoma', 'agentik', 'llm', 'automation', 'workflow'])).length;
  const business = publicRepos.filter((repo) => includesAny(`${repo.name} ${repo.description || ''}`, ['erp', 'pos', 'invoice', 'inventory', 'commerce', 'marketplace', 'snishop', 'store', 'resto', 'supply', 'wallet'])).length;
  const date = new Date().toISOString().slice(0, 10);
  const retainedPrivate = privateRepos === null ? privateCache : null;
  const privateCount = privateRepos ? privateRepos.length : retainedPrivate?.count;
  const privateDate = retainedPrivate?.date;
  const privateRows = privateCount === undefined
    ? '| Private repositories | Awaiting read-only PROFILE_TOKEN secret |'
    : privateDate
      ? `| Private repositories | **${privateCount}** (checked via GitHub on ${privateDate}; automatic refresh pending PROFILE_TOKEN) |`
      : `| Private repositories | **${privateCount}** |`;
  const totalRows = privateCount === undefined ? '' : '| Total owned repositories | **' + (publicRepos.length + privateCount) + '** |' + (privateDate ? ' (private count checked ' + privateDate + ')' : '') + '\n';
    ? ''
    : `| Total owned repositories | **${publicRepos.length + privateCount}** |${privateDate ? ' (private count checked ' + privateDate + ')' : ''}\\n`;
  const privacyNote = privateCount === undefined
    ? 'Public statistics are current. Private repository count will appear after the owner adds the read-only PROFILE_TOKEN Actions secret. Private names and descriptions are never published.'
    : 'Private repository names, descriptions, URLs, client data, and implementation details are never published.';
  return `<!-- AUTO-GITHUB-START -->
## 📌 Live GitHub Snapshot

_Last refreshed: **${date}** by the profile updater workflow._

| Signal | Current value |
|:---|:---:|
${totalRows}| Public repositories | **${publicRepos.length}** |
| Active public repositories | **${activePublic.length}** |
| Public stars | **${stars}** |
${privateRows}
| AI / agent / automation repositories | **${ai}** |
| ERP / commerce / business-system repositories | **${business}** |

> ${privacyNote}

### Current Engineering Direction

- Building and refining **AI agent skills** for app generation, product architecture, UI/UX, ERP/POS, dashboards, role access, payments, and production readiness.
- Developing practical products around **SNISHOP**, ERP, commerce, AI automation, workflow tools, and client operations.
- Keeping public profile information current while protecting private and client work.
<!-- AUTO-GITHUB-END -->`;
}

const readme = await readFile(README_PATH, 'utf8');
const previousSvg = await readFile(STATS_SVG_PATH, 'utf8').catch(() => '');
const privateCache = readCachedPrivateCount(readme);
const contributionCache = (await fetchContributionCount()) ?? readCachedContributionCount(previousSvg);
const repos = await fetchRepos();
const start = '<!-- AUTO-GITHUB-START -->';
const end = '<!-- AUTO-GITHUB-END -->';
const startIndex = readme.indexOf(start);
const endIndex = readme.indexOf(end);
if (startIndex === -1 || endIndex < startIndex) throw new Error('README auto-update markers are missing or malformed');
const next = `${readme.slice(0, startIndex)}${buildBlock(repos, privateCache)}${readme.slice(endIndex + end.length)}`;
const svg = buildStatsSvg(repos, privateCache, contributionCache);
await mkdir(dirname(STATS_SVG_PATH), { recursive: true });
if (next !== readme) await writeFile(README_PATH, next);
if (svg !== previousSvg) await writeFile(STATS_SVG_PATH, svg);
console.log('Updated public GitHub statistics, private count only, and local statistics card.');
