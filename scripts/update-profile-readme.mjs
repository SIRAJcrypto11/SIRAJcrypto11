import { readFile, writeFile } from 'node:fs/promises';

const OWNER = process.env.GITHUB_OWNER || 'SIRAJcrypto11';
const README_PATH = process.env.README_PATH || 'README.md';
const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub API returned ${response.status} for public profile data`);
  return response.json();
}

async function fetchPublicRepos() {
  const repos = [];
  for (let page = 1; ; page += 1) {
    const batch = await github(`/users/${encodeURIComponent(OWNER)}/repos?type=public&sort=updated&per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error('Unexpected public repositories response');
    repos.push(...batch.filter((repo) => repo.private !== true && repo.owner?.login?.toLowerCase() === OWNER.toLowerCase()));
    if (batch.length < 100) return repos;
  }
}

function includesAny(value, terms) {
  const text = value.toLowerCase();
  return terms.some((term) => text.includes(term));
}

function buildBlock(repos) {
  const active = repos.filter((repo) => !repo.archived);
  const stars = repos.reduce((total, repo) => total + (repo.stargazers_count || 0), 0);
  const ai = repos.filter((repo) => includesAny(`${repo.name} ${repo.description || ''}`, ['ai', 'agent', 'otoma', 'agentik', 'llm', 'automation', 'workflow'])).length;
  const business = repos.filter((repo) => includesAny(`${repo.name} ${repo.description || ''}`, ['erp', 'pos', 'invoice', 'inventory', 'commerce', 'marketplace', 'snishop', 'store', 'resto', 'supply', 'wallet'])).length;
  const date = new Date().toISOString().slice(0, 10);
  return `<!-- AUTO-GITHUB-START -->
## 📌 Live GitHub Snapshot

_Last refreshed: **${date}** by the profile updater workflow._

| Signal | Current value |
|:---|:---:|
| Public repositories | **${repos.length}** |
| Active public repositories | **${active.length}** |
| Public stars | **${stars}** |
| AI / agent / automation repositories | **${ai}** |
| ERP / commerce / business-system repositories | **${business}** |

> This snapshot uses public GitHub data only. Private repositories, names, counts, client data, and implementation details are excluded.

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
const next = `${readme.slice(0, startIndex)}${buildBlock(await fetchPublicRepos())}${readme.slice(endIndex + end.length)}`;
if (next !== readme) await writeFile(README_PATH, next);
console.log('Updated public-only GitHub profile snapshot.');
