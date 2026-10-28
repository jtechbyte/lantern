// Release aliases come only from published GitHub releases, never PR input.
import { readFileSync, appendFileSync } from 'node:fs';
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const revision = process.env.GITHUB_SHA;
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Expected a full source commit');
let tags = [];
if (process.env.GITHUB_EVENT_NAME === 'release') {
  const release = event.release;
  if (!release || release.draft || release.tag_name !== `v${version}`) throw new Error('Release tag must match package.json version');
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) throw new Error('Expected a semantic version');
  const prerelease = release.prerelease || Boolean(match[4]);
  // A prerelease flagged in GitHub but lacking a suffix must not occupy a stable tag.
  tags = [prerelease && !match[4] ? `${version}-prerelease` : version, `sha-${revision}`];
  if (!prerelease) tags.push(`${match[1]}.${match[2]}`, match[1], 'latest');
}
appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nrevision=${revision}\ntags=${JSON.stringify(tags)}\ncreated=${new Date().toISOString()}\n`);
