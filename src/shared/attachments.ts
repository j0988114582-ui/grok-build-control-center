import type { SelectedFile } from './bridge'
import type { PromptBlock } from './types'

export function selectedFilesToPrompt(files: SelectedFile[], imageSupported: boolean): { blocks: PromptBlock[]; paths: string } {
  const blocks: PromptBlock[] = []
  const paths: string[] = []
  for (const file of files) {
    if (imageSupported && file.data && file.mimeType) blocks.push({ type: 'image', data: file.data, mimeType: file.mimeType, name: file.name })
    else paths.push(file.path)
  }
  return { blocks, paths: paths.join('\n') }
}
