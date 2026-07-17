import { readFileSync, writeFileSync } from 'node:fs'

const lines = readFileSync('docs/plans/v070-compact-and-preview-codex-fullaccess-review.md.events.jsonl', 'utf8')
  .trim()
  .split('\n')

const agents = []
for (const line of lines) {
  try {
    const j = JSON.parse(line)
    const item = j.item || j.msg || j
    const type = j.type || item.type || ''
    if (
      type.includes('agent_message') ||
      item.type === 'agent_message' ||
      (item.role === 'assistant' && item.content)
    ) {
      const text =
        item.text ||
        item.message ||
        (Array.isArray(item.content)
          ? item.content.map((c) => c.text || c).join('\n')
          : '') ||
        ''
      if (text && text.length > 40) agents.push({ type, len: text.length, text })
    }
    // codex event formats
    if (j.payload?.msg?.type === 'agent_message' && j.payload.msg.message) {
      agents.push({ type: 'payload', len: j.payload.msg.message.length, text: j.payload.msg.message })
    }
    if (j.msg?.type === 'agent_message' && j.msg.message) {
      agents.push({ type: 'msg', len: j.msg.message.length, text: j.msg.message })
    }
  } catch {
    /* ignore */
  }
}

agents.sort((a, b) => b.len - a.len)
console.log('count', agents.length)
for (const a of agents.slice(0, 5)) {
  console.log('---', a.type, a.len)
  console.log(a.text.slice(0, 1500))
}
if (agents[0]) {
  writeFileSync('docs/plans/v070-compact-and-preview-codex-fullaccess-review.extracted.md', agents[0].text, 'utf8')
  console.log('wrote extracted', agents[0].len)
}
