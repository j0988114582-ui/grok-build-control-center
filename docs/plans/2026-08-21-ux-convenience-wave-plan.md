# UX 便利性 6 波自動實作計畫

日期：2026-08-21  
來源：`output/reviews/2026-08-21-ux30-gui-audit.md`  
現役目錄：`work/_upstream`（本檔也在這裡）  
版本：**不要改** package.json 版本號。  
Commit：**不要** commit／push。  
禁止：歡迎頁第二顆「先不選專案」、不在專案底下工作、Rewind UI、子代理取消。

54 項已合併成 **6 波串行**。同一檔（尤其 `App.tsx`、`styles.css`）禁止並行改。每波：實作 → 指定測試 → 不過關不准進下一波。

---

## 共用約束（每波代理人必讀）

- 工作目錄：`C:\Users\111\Documents\grok-build-GUI\work\_upstream`
- 先 `read_file` 再開改；用精確 `search_replace`，禁止整份覆寫 `App.tsx`。
- UI 文案用台灣繁中。技術 id（slash 命令名）可留英文，旁邊加中文。
- 新增設定必須走 `src/shared/settings.ts` 的 normalize，給預設值。
- 預覽安全：仍禁止 UNC、裝置路徑、`..`、ADS。放寬的是「已列在側欄的專案 cwd」與使用者明確「允許這個資料夾」。
- 每波結束自己跑列在該波的 `npm test -- <files>`（vitest 檔路徑），再 `npx tsc --noEmit -p tsconfig.web.json` 若動到 renderer。主程序動到再跑 `tsconfig.node.json`。
- 輸出：改了哪些檔、測試指令與結果、沒做完的項。

---

## 波次總表

| 波 | 主題 | 合併來源 | 驗證 |
|---|---|---|---|
| 1 | 頂欄誠實＋點得了 | B2 B3 B5 B7 B8 B10 B11＋項 3 8 11 32 | 單元測試＋CSS 讀回 |
| 2 | 預覽跨專案 | B1 B6＋項 1 4 16 28 38 | preview-* 測試＋GUI 預覽段 |
| 3 | 側欄找得到 | B12＋項 2 6 7 13 14 15 26 27 40 | session-groups／search／app 側欄測試 |
| 4 | 工作區不擋字 | B4 B9 B13 B14＋項 12 20 25 33 34 | app／bookmarks／command-palette／composer |
| 5 | 看懂的中文 | 項 9 10 17 19 21 29 30 31 35 37 39 | 字串測試＋設定快捷鍵 |
| 6 | 少點幾下 | 項 5 18 22 23 24 36 | settings／templates／quota／notices |
| 終 | 真 GUI | 全部 | `node work/ux30_gui_audit.mjs` 擴充檢查 |

---

## 波 1 — 頂欄誠實＋點得了

**檔：** `src/renderer/src/styles.css`、`src/renderer/src/App.tsx`（權限／狀態／歡迎文案）、權限 option 顯示。

**做：**

1. `.titlebar select`、`.permission-mode-label` 設 `-webkit-app-region: no-drag`。
2. 「工具權限」改成兩顆鈕：`先問我`（ask）、`全部自動過`（YOLO，仍走現有確認盒）。下面一行：「改檔或跑指令前會先問你。每次開程式都從『先問我』開始。」已選的那顆可再點，再點「先問我」時用現有 `PERMISSION_ASK_ALREADY_NOTICE`。
3. composer 狀態藥丸與輸入框同一條件：`activeReady`。未就緒顯示「尚未連上」／「載入中」，不要綠點「就緒」。
4. 收合側欄只留一顆展開：rail 有展開鈕時，隱藏 `.sidebar-expand-float`，或 float 移到不擋書籤處。
5. 歡迎頁大按鈕、步驟 1、側欄主鈕全部「選資料夾開始」。
6. 權限盒不要畫 `allow_once` 這種 kind；只留人話名稱。
7. `.permission-modal::after` 掃光改成很淡或拿掉，內文對比維持可讀。
8. 搜尋框 placeholder：`搜尋對話`（快捷鍵可小字）。
9. Context 無資料時寫「尚未載入」，不要空條裝有資料。
10. 歡迎頁第三格「L1+L2 銀河座艙」改成 CLI 狀態或拿掉空jargon。
11. 窄側欄主鈕不要把「選資料夾開始」切成兩行醜字：可用較短 padding 或 `white-space: nowrap`＋縮字級。

**測：** `tests/app.test.tsx`、`tests/permissions.test.ts`、`tests/remote-yolo-mutex.test.ts`。讀 CSS 確認 no-drag。

**通過：** 權限鈕在 titlebar 為 no-drag；未就緒不是「就緒」；歡迎三處文案一致；權限盒無 `allow_once`。

---

## 波 2 — 預覽跨專案看得到

**檔：** `src/main/preview-service.ts`、`src/main/index.ts`、`src/shared/preview-path-policy.ts`（若需）、`src/renderer/src/components/PreviewDock/*`、`App.tsx` 預覽路徑／Markdown。

**做：**

1. `listSessions`／啟動列出的每個 session cwd 都 `previewRoots.setSessionCwd`。側欄已有的專案預設可預覽。
2. 預覽失敗且 `revealOnly`：舞台加「允許這個資料夾並重試」（呼叫 `addDialogPath` 的 parent dir 後再 register）。
3. Markdown／純文字裡的本機絕對路徑做成可點晶片，走現有 `openPreviewPath`。
4. 預覽標題改「預覽」，拿掉 PREVIEW DOCK 換行。掃描與重整：合併成一個「重新整理」，或兩個不同圖示＋不同 aria-label。
5. 「圖片」分頁含 remote-image；遠端用小字標。
6. 可選：記住最近預覽 10 檔（settings.preview.recentBySession 已有型別就接上，不要另造平行資料）。

**測：** `tests/preview-path-policy.test.ts`、`tests/preview-service.test.ts`、`tests/preview-dock.test.tsx`、`tests/preview-discover.test.ts`。安全拒絕（UNC/`..`/ADS）仍要紅。

**通過：** 兩個已列專案的 png，在 A 對話裡都能 register ok；未列的路徑仍擋，但有「允許這個資料夾」。

---

## 波 3 — 側欄找得到

**檔：** `session-groups.ts`、`SessionRow.tsx`、`App.tsx` 側欄、`settings.ts`、`styles.css`。

**做：**

1. 排序下拉：最近更新（預設）、最近開啟（本機記錄 lastOpenedAt）、名稱、執行中優先。
2. 可關「依資料夾分組」→ 一條時間軸。設定要 persist。
3. 資料夾下拉畫面只顯示資料夾名＋則數；完整路徑放 `title`。
4. 點專案群組標題＝篩該 cwd；再點取消。
5. 活躍天數在側欄可改（1–30），不要只在設定。
6. 「多選」與「建議清理」收進一個「整理」展開區，減少直向堆疊。
7. SessionRow 動作改「⋯」選單（釘選／改名／刪除／加入 Team），鍵盤可開。
8. 列上時間用相對「3 分鐘前」；完整路徑已在組標題時列上可省略或縮。
9. 記住最後三個專案 cwd，歡迎頁或側欄頂可一鍵再開（不是第二顆「先不選專案」）。
10. 篩選晶片能表達：全部／本專案／釘選／活躍。不必一次做未讀。

**測：** `tests/session-groups.test.tsx`、`tests/session-search.test.ts`、`tests/session-hygiene.test.ts`、`tests/app.test.tsx` 側欄段。

**通過：** 能改排序；能關掉分組；下拉不再塞完整路徑當可見文字。

---

## 波 4 — 工作區不擋字

**檔：** `App.tsx` session-header、`PromptBookmarks.tsx`、`CommandPalette.tsx`、`styles.css`、composer。

**做：**

1. 1100px 時 session-tools 折入「⋯」選單，**禁止** wrap 蓋住第一則訊息（header 與 transcript 分開，tools 不進 transcript 流）。
2. 寬螢幕圖示加短標或更清楚的 aria；窄螢幕只留 ⋯。
3. 書籤彈層加寬、兩行摘要、向下開且不溢出面板。
4. 命令面板底留 padding，最後一項完整可見。
5. 抽屜（設定／功能／背景）不要蓋住 session-tools；從 header 下方開始或提高 header z-index。
6. 執行中主鈕「停止」最顯眼；插話／排隊／立刻改做次要，窄時進更多。
7. 輸入框預設約 3 行，長文框內捲；收合狀態可記住（session 內即可）。
8. cwd 旁「複製路徑」鈕。

**測：** `tests/command-palette.test.tsx`、`tests/prompt-bookmarks`（若有）、`tests/composer-autogrow.test.ts`、`tests/app.test.tsx`。

**通過：** 1100×800 截圖 header 不蓋訊息；palette 最後一項可完整看到。

---

## 波 5 — 看懂的中文

**檔：** `App.tsx`、`ModelPicker.tsx`、`CommandPalette.tsx`、`BackgroundTasksPanel.tsx`、`QuotaRings.tsx`、設定快捷鍵、快捷鍵 overlay、功能矩陣。

**做：**

1. 設定快捷鍵列顯示中文名（搜尋目前對話…），command id 放次行或 title。
2. 可見 eyebrow 中文化：銀河座艙、預覽、目前對話、工作台設定、快捷鍵、功能一覽。`END OF CURRENT CONTEXT` → `以上是目前載入的內容`。狀態藥丸 `Connected` → `已連線`，`Connect` → `連線`。
3. 命令面板分「畫面動作／斜線指令」兩組。
4. 迴紋針 tooltip：「加入檔案或資料夾，也可直接拖進來」。
5. 推理強度：深想／一般／快速（對應 high／medium／low；未知值原樣）。
6. 功能矩陣改短中文「能做／還不能做」，少 CAPABILITY ROUTER。
7. 背景任務開頭改三句人話。
8. 刪除確認不要主畫面秀 `grok sessions delete`。
9. 亮色窄窗「切換帳號」保留可理解標示。
10. `?` 快捷鍵表補：預覽開關、在此資料夾開新對話、權限（若有）。

**測：** `tests/model-picker.test.tsx`、`tests/command-palette.test.tsx`、`tests/quota-rings.test.tsx`、相關 app 字串 assert。

**通過：** 設定快捷鍵列看得到中文；transcript 底不再是英文 END OF…；effort 三檔中文。

---

## 波 6 — 少點幾下

**檔：** `App.tsx` 啟動連線、`prompt-templates.ts`、設定遙控入口、QuotaRings、notice、Agents Team 入口。

**做：**

1. CLI `found` 且未連線：啟動後背景 `connect()`，失敗只 notice，不擋畫面。不要新增「先不選專案」。
2. 範本可釘選最近用過（最多幾個，settings）；先做「記住上次點過的排前面」，完整自訂編輯可簡。
3. 設定裡「前往手機遙控」已存在就確保點了真的打開遠端區塊（必要時直接 `setPanel('features')` 並捲到遙控）。
4. 點額度環開說明（現有 hover 保留，補 click／鍵盤）。
5. notice 可關閉、可複製；`pointer-events` 讓按鈕點得到；12 秒可自動關但手動關優先。
6. Agents Team 不要刪功能；側欄改成較不佔位（較矮的列或放進整理／⋯）。預設仍可開。

**測：** `tests/prompt-templates.test.ts`、`tests/quota-rings.test.tsx`、`tests/settings.test.ts`、`tests/app.test.tsx` 啟動／notice。

**通過：** 啟動會嘗試連線；notice 按鈕點得到；Team 仍在。

---

## 終波 — 真 GUI 稽核

擴充 `work/ux30_gui_audit.mjs`（或新檔 `work/ux_wave_verify.mjs`）至少檢查：

- 權限控制 `-webkit-app-region` 為 no-drag
- 未就緒不是「就緒」
- 歡迎／側欄按鈕都是「選資料夾開始」
- 預覽：專案 A 對話 register 專案 B 檔（兩個 session 都在列表）為 ok，或 UI 有「允許這個資料夾」
- 側欄有排序控制
- 1100px header 不蓋 transcript（量 bounding box）
- 搜尋 placeholder 無 `sessions`
- 權限盒無 `allow_once`

跑：`node work/ux30_gui_audit.mjs` 或新 verify 腳本。截圖寫到 `output/playwright/ux-wave-verify/`。

最後：`npm test`、`npm run lint`、`npm run typecheck`（若時間不夠，至少 test+typecheck，lint 記在報告）。

---

## 代理人輸出 schema（每波）

```json
{ "passed": true, "summary": "一句話", "files": ["src/..."], "leftover": [] }
```

`passed: false` 時寫清楚失敗的測試名稱。
