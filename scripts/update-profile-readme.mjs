import { readFile, writeFile } from 'node:fs/promises';

const OWNER = process.env.GITHUB_OWNER || 'SIRAJcrypto11';
const README_PATH = process.env.README_PATH || 'README.md';
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
    : await paginate(`/users/${encodeURIComponent(OWNER)}/repos?type=public&sort=updated`);
  return repos.filter((repo) => repo.owner?.login?.toLowerCase() === OWNER.toLowerCase());
}

function includesAny(value, terms) {
  const text = value.toLowerCase();
  return terms.some((term) => text.includes(term));
}

function buildBlock(repos) {
  const publicRepos = repos.filter((repo) => repo.private !== true);
  const privateRepos = token ? repos.filter((repo) => repo.private === true) : null;
  const activePublic = publicRepos.filter((repo) => !repo.archived);
  const stars = publicRepos.reduce((total, repo) => total + (repo.stargazers_count || 0), 0);
  const ai = publicRepos.filter((repo) => includesAny(`${repo.name} ${repo.description || ''}`, ['ai', 'agent', 'otoma', 'agentik', 'llm', 'automation', 'workflow'])).length;
  const business = publicRepos.filter((repo) => includesAny(`${repo.name} ${repo.description || ''}`, ['erp', 'pos', 'invoice', 'inventory', 'commerce', 'marketplace', 'snishop', 'store', 'resto', 'supply', 'wallet'])).length;
  const date = new Date().toISOString().slice(0, 10);
  const privateRows = privateRepos === null
    ? '| Private repositories | Awaiting read-only PROFILE_TOKEN secret |'
    : `| Private repositories | **${privateRepos.length}** |`;
  const totalRows = privateRepos === null ? '' : `| Total owned repositories | **${publicRepos.length + privateRepos.length}** |\n`;
  const privacyNote = privateRepos === null
    ? 'Public statistics are current. Private repository count will appear after the owner adds the read-only PROFILE_TOKEN Actions secret. Private names and descriptions are never published.'
    : 'Private repository metadata is used only to calculate the count. Private names, descriptions, URLs, client data, and implementation details are never published.';
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
const start = '<!-- AUTO-GITHUB-START -->';
const end = '<!-- AUTO-GITHUB-END -->';
const startIndex = readme.indexOf(start);
const endIndex = readme.indexOf(end);
if (startIndex === -1 || endIndex < startIndex) throw new Error('README auto-update markers are missing or malformed');
const next = `${readme.slice(0, startIndex)}${buildBlock(await fetchRepos())}${readme.slice(endIndex + end.length)}`;
if (next !== readme) await writeFile(README_PATH, next);
console.log('Updated public GitHub statistics and private repository count only.');
