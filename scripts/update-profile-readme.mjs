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
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 300)}`);
  }
  return response.json();
}

async function paginate(path) {
  const items = [];
  let page = 1;
  while (true) {
    const separator = path.includes('?') ? '&' : '?';
    const batch = await github(`${path}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    items.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return items;
}

async function fetchRepos() {
  if (token) {
    try {
      return await paginate(`/user/repos?visibility=all&affiliation=owner&sort=updated`);
    } catch (error) {
      console.warn(`PROFILE_TOKEN private repo lookup failed, falling back to public repos: ${error.message}`);
    }
  }
  return paginate(`/users/${OWNER}/repos?type=owner&sort=updated`);
}

function includesAny(text, words) {
  const normalized = text.toLowerCase();
  return words.some((word) => normalized.includes(word));
}

function summarizeRepos(repos) {
  const ownRepos = repos.filter((repo) => repo.owner?.login?.toLowerCase() === OWNER.toLowerCase());
  const active = ownRepos.filter((repo) => !repo.archived);
  const publicRepos = ownRepos.filter((repo) => !repo.private);
  const privateRepos = ownRepos.filter((repo) => repo.private);
  const totalStars = publicRepos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);

  const aiRepos = ownRepos.filter((repo) => includesAny(`${repo.name} ${repo.description || ''}`, [
    'ai', 'agent', 'otoma', 'agentik', 'copilot', 'llm', 'automation', 'workflow'
  ]));
  const businessRepos = ownRepos.filter((repo) => includesAny(`${repo.name} ${repo.description || ''}`, [
    'erp', 'pos', 'invoice', 'inventory', 'commerce', 'marketplace', 'snishop', 'store', 'resto', 'supply', 'wallet'
  ]));
  const clientSafeRepos = privateRepos.filter((repo) => includesAny(`${repo.name} ${repo.description || ''}`, [
    'erp', 'pos', 'client', 'store', 'supply', 'invoice', 'resto', 'quinn', 'marketplace', 'business'
  ]));

  const recentPublic = [...publicRepos]
    .sort((a, b) => new Date(b.pushed_at || b.updated_at || b.created_at) - new Date(a.pushed_at || a.updated_at || a.created_at))
    .slice(0, 6);

  const hasPrivateAgentSkills = privateRepos.some((repo) => repo.name === 'agent-skills');
  const publicAgentSkills = publicRepos.find((repo) => repo.name === 'agent-skills');

  return {
    total: ownRepos.length,
    active: active.length,
    public: publicRepos.length,
    private: privateRepos.length,
    totalStars,
    ai: aiRepos.length,
    business: businessRepos.length,
    clientSafe: clientSafeRepos.length,
    recentPublic,
    hasPrivateAgentSkills,
    publicAgentSkills,
    privateAware: Boolean(token),
  };
}

function publicRepoLabel(repo) {
  const description = repo.description ? ` - ${repo.description}` : '';
  return `[${repo.name}](${repo.html_url})${description}`;
}

function buildBlock(summary) {
  const now = new Date().toISOString().slice(0, 10);
  const privateNote = summary.privateAware
    ? 'Includes private repository counts visible to the configured profile updater token. Private names and descriptions are intentionally redacted.'
    : 'Public GitHub API mode. Add `PROFILE_TOKEN` only if private counts are needed; private names will still be redacted.';

  const recentRows = summary.recentPublic.length > 0
    ? summary.recentPublic
        .map((repo) => `| ${publicRepoLabel(repo)} | Public | ${new Date(repo.pushed_at || repo.updated_at || repo.created_at).toISOString().slice(0, 10)} |`)
        .join('\n')
    : '| Public repositories | Public | No public updates available |';

  const agentStatus = summary.publicAgentSkills
    ? `Public repo active: [agent-skills](${summary.publicAgentSkills.html_url}) - ${summary.publicAgentSkills.description || 'AI agent skill system'}`
    : summary.hasPrivateAgentSkills
      ? 'Private/internal AI agent skills system is active. Details are summarized publicly without exposing the private repository.'
      : 'AI agent skill system is tracked in the profile summary.';

  return `<!-- AUTO-GITHUB-START -->
## 📌 Live GitHub Snapshot

_Last refreshed: **${now}** by the profile updater workflow._

| Signal | Current value |
|:---|:---:|
| Total repositories tracked | **${summary.total}** |
| Active repositories | **${summary.active}** |
| Public repositories | **${summary.public}** |
| Private/client-safe repositories | **${summary.private}** |
| Public stars tracked | **${summary.totalStars}** |
| AI / agent / automation repos | **${summary.ai}** |
| ERP / commerce / business-system repos | **${summary.business}** |
| Private client-safe business systems | **${summary.clientSafe}** |

> ${privateNote}

### Current Engineering Direction

- Building and refining **AI agent skills** for app generation, product architecture, UI/UX, ERP/POS, dashboards, role access, payments, and anti-generic output.
- Developing practical product systems around **SNISHOP**, ERP, commerce, AI automation, workflow tools, and private client operations.
- Keeping public profile information client-safe while still showing the real engineering scope.

### Agent Skill System

${agentStatus}

### Recently Updated Public Repositories

| Repository | Visibility | Last update |
|:---|:---:|:---:|
${recentRows}
<!-- AUTO-GITHUB-END -->`;
}

function replaceBlock(readme, block) {
  const start = '<!-- AUTO-GITHUB-START -->';
  const end = '<!-- AUTO-GITHUB-END -->';
  const startIndex = readme.indexOf(start);
  const endIndex = readme.indexOf(end);
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return `${readme.slice(0, startIndex)}${block}${readme.slice(endIndex + end.length)}`;
  }

  const insertionPoint = '<!-- WORK PORTFOLIO -->';
  const index = readme.indexOf(insertionPoint);
  if (index !== -1) return `${readme.slice(0, index)}${block}\n\n---\n\n${readme.slice(index)}`;
  return `${readme.trim()}\n\n---\n\n${block}\n`;
}

const repos = await fetchRepos();
const summary = summarizeRepos(repos);
const block = buildBlock(summary);
const readme = await readFile(README_PATH, 'utf8');
const nextReadme = replaceBlock(readme, block);

if (nextReadme !== readme) {
  await writeFile(README_PATH, nextReadme);
  console.log(`Updated ${README_PATH} with ${summary.total} tracked repositories.`);
} else {
  console.log(`${README_PATH} already up to date.`);
}
