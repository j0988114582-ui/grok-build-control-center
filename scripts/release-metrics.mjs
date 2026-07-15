import process from 'node:process'

const repository = process.env.GITHUB_REPOSITORY || 'j0988114582-ui/grok-build-control-center'
const [owner, repo] = repository.split('/')
if (!owner || !repo) throw new Error('Set GITHUB_REPOSITORY as owner/repo')

const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'grok-build-control-center-release-metrics'
}
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`

const response = await globalThis.fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`, { headers })
if (!response.ok) throw new Error(`GitHub API failed: ${response.status} ${await response.text()}`)

const releases = await response.json()
const report = {
  repository,
  collected_at: new Date().toISOString(),
  note: 'Asset downloads are not equivalent to installations or active users.',
  releases: releases.map((release) => ({
    tag: release.tag_name,
    name: release.name,
    published_at: release.published_at,
    prerelease: release.prerelease,
    assets: release.assets.map((asset) => ({
      name: asset.name,
      downloads: asset.download_count,
      size_bytes: asset.size,
      updated_at: asset.updated_at
    })),
    total_asset_downloads: release.assets.reduce((sum, asset) => sum + asset.download_count, 0)
  }))
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
