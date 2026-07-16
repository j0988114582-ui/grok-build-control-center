/** Built-in prompt starters for the composer (local only). */

export type PromptTemplate = {
  id: string
  label: string
  description: string
  body: string
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'review',
    label: '程式審查',
    description: '請 Grok 審目前變更',
    body: '請審查目前工作區的變更：找 bug、風險與可簡化處。用繁中條列，標出檔案路徑。'
  },
  {
    id: 'fix',
    label: '修錯誤',
    description: '貼錯誤後請修好',
    body: '以下是錯誤訊息與重現步驟，請找出根因並直接修好，最後說明改了什麼：\n\n'
  },
  {
    id: 'explain',
    label: '解釋這段',
    description: '白話解釋程式',
    body: '請用繁中白話解釋以下程式／行為，並指出容易踩雷的地方：\n\n'
  },
  {
    id: 'plan',
    label: '先做計畫',
    description: '先規劃再動手',
    body: '請先列出實作計畫（步驟、風險、驗收），等我確認後再改檔。任務：\n\n'
  },
  {
    id: 'test',
    label: '補測試',
    description: '加可測的單元測試',
    body: '請為目前變更補上可維護的單元測試，涵蓋主路徑與一個邊界情況。'
  }
]

export function findPromptTemplate(id: string): PromptTemplate | undefined {
  return PROMPT_TEMPLATES.find((item) => item.id === id)
}
