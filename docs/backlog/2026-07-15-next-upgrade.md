# Next upgrade backlog（2026-07-15）

來源：站主實測痛點與建議。**尚未實作**；下一功能輪依優先序挑做。  
關聯版本：v0.3.2 公開 Release；本機 CLI 驗證時為 Grok **0.2.101**。

---

## P0 — UX 阻塞

### 1. 主頁收合側欄後無法再打開

**現象**  
在主頁（無 active session）把左側側欄關起來後，畫面上沒有明顯按鈕可再開。

**根因（程式）**  
- 收合：`sidebar-actions` 的「收合側欄」永遠在側欄內（`setSidebarOpen(false)`）。  
- 展開：只掛在 **active session 的** `session-header`：  
  `{!sidebarOpen && <button aria-label="展開側欄" …>}`  
- 主頁走 `empty-state` 分支，**沒有**同等展開按鈕。  
- 側欄收合用 `grid-template-columns: 0 …`，側欄 DOM 仍在但寬度為 0、`overflow: hidden`，內部按鈕點不到。

**建議修法**  
1. 主頁 `empty-state` 與 session 工作區都要有「展開側欄」入口（固定浮鈕或 titlebar 旁）。  
2. 或：`sidebar-collapsed` 時改留一條窄 rail（只放 PanelLeft / 展開），不要寬度歸零。  
3. 快捷鍵：若尚無「toggle sidebar」，補上並寫進 `?` 快捷鍵表。  
4. 測試：主頁收合 → 仍可用鍵盤／按鈕展開；有 session 時行為不變。

**觸及檔案（預期）**  
`src/renderer/src/App.tsx`、`src/renderer/src/styles.css`、相關 renderer 測試。

---

### 2. 底部對話框高度隨內容長高，擠壓訊息區

**現象**  
composer 隨草稿長度變高，訊息列表可視區被壓縮，需反覆滾動。

**現況**  
`styles.css` 約：  
`.composer textarea { min-height: 74px; max-height: 230px; resize: vertical; }`  
仍允許長高到 230px，且 `resize: vertical` 可再被使用者拉高。

**建議修法**  
1. **預設固定高度**（例如 3 行 / 固定 px），超出在 textarea **內部捲動**。  
2. 可選：使用者手動拖曳才變高，或設定項「composer 高度」。  
3. 長貼文時 `align-items: end` 不要把整塊 transcript 頂走；composer-wrap 高度上限 + transcript `minmax(0,1fr)`。  
4. 測試：貼入長文 → transcript 高度穩定、composer 內捲。

**觸及檔案（預期）**  
`src/renderer/src/styles.css`、必要時 `App.tsx` composer 結構。

---

## P1 — 資訊架構與效率

### 3. 側欄專案標題太小、對話名過顯眼

**現象**  
專案（資料夾）群組標題字級過小（約 `font-size: 8px`、uppercase、muted），對話列標題反而主導視線，不利「先找專案再找對話」。

**現況**  
`.session-group > header { … font-size: 8px; letter-spacing: .12em; text-transform: uppercase; color: #747d87; }`

**建議修法**  
1. 專案名：加大字級（例如 12–13px）、提高對比、可考慮 **不** 強制 uppercase 以便讀中文路徑/資料夾名。  
2. 顯示策略：`group.name` 用資料夾 basename 大字；完整 `cwd` 用 tooltip 或次行小字。  
3. 對話標題改為次要層級（略小或較淡），避免壓過專案。  
4. 亮色主題一併調對比（a11y）。

**觸及檔案（預期）**  
`src/renderer/src/styles.css`、`session-groups` 相關元件。

---

### 4. 批次刪除對話

**現象**  
只能單筆刪除（確認 modal → `grok sessions delete <id>`）。

**建議修法**  
1. 側欄多選（checkbox 或 Ctrl/Shift 點選）+「刪除所選」。  
2. 確認 modal 列出數量與專案摘要；執行中顯示進度／失敗項。  
3. 實作仍走官方 CLI 逐筆 `grok sessions delete`（或查新版是否有 batch API；**不要**直接 rm session 目錄）。  
4. 運行中 session：先 cancel 再刪（沿用單刪邏輯）。  
5. 測試：多選刪除、部分失敗、刪 active session 後回主頁。

**觸及檔案（預期）**  
`App.tsx`、main 刪除 IPC、`tests/`。

---

## P2 — 多模態 / 附件（協定層）

### 5. GUI 無法貼入圖片（ACP 未宣告 image）

**現象**  
貼圖時提示：「目前 GROK ACP 未宣告圖片支援…」。

**實測（2026-07-15，本機 `grok agent --no-leader stdio`）**  

```json
"promptCapabilities": {
  "image": false,
  "audio": false,
  "embeddedContext": true
}
```

**說明**  
- GUI 依 capability 擋 image block 是正確行為，不是單純前端 bug。  
- Grok **TUI** 可貼圖（TUI 路徑）；**ACP** 目前 `image:false`、`audio:false`。  
- ACP ContentBlock 有 text / image / audio / resource_link / resource；**無 video**。  
- Baseline：text + resource_link；image/audio 需 agent 宣告。

**日後優化方向（分層）**  

| 層級 | 作法 |
| --- | --- |
| 立刻可用 | 圖存檔 → 迴紋針 → 插絕對路徑 → 提示詞叫 agent 讀檔 |
| GUI UX | 貼圖時若 `image!==true`：自動存暫存檔 + 插路徑／`resource_link`，勿只噴錯 |
| 協定真解 | 等 xAI 將 `promptCapabilities.image`（及需要時 `audio`）改 `true` 後，再送 base64 image block + chip UI |
| 影片／音樂 | 無 video block；audio 現為 false → 路徑 + 工具／先轉逐字稿；產圖產片走 `/imagine`、`/imagine-video` 類指令快捷即可 |

**勿做**  
強制送 `type:"image"` 忽略 capability（多半被拒且難除錯）。

**觸及檔案（預期）**  
`App.tsx` paste、`attachments.ts`、`acp-client.ts` prompt mapping、main 暫存落檔 IPC。

---

## 建議實作順序

1. **P0-1** 側欄可再打開（主頁）  
2. **P0-2** composer 固定高度  
3. **P1-3** 專案標題視覺層級  
4. **P1-4** 批次刪除  
5. **P2-5** 貼圖自動落檔路徑 +（長期）ACP image

---

## 驗證備註

- 驗證 CLI 能力時請用：`grok agent --no-leader stdio` + JSON-RPC `initialize`（勿用 `grok acp`，會進 TUI）。  
- 刪 session：`grok sessions delete <id>`（見主 AGENTS 既有事實）。  
- 多模態能力以當次 `initialize.agentCapabilities.promptCapabilities` 為準，版本升級後需重測。
