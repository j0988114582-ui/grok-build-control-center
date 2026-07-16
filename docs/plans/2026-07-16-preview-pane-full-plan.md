# 右側可收合預覽台（Preview Dock）完整計畫

| 欄位 | 內容 |
| --- | --- |
| **狀態** | **Fable 5 審畢 · yes-after-edits 已併入本文 · 待站主 GO · GO 前不實作產品碼** |
| **文件日期** | 2026-07-16 |
| **產品** | Grok Build Control Center（非官方 Windows GUI） |
| **Repo** | `work/_upstream` · github.com/j0988114582-ui/grok-build-control-center |
| **建議版本** | **0.7.0**（媒體預覽史詩；可與 0.6.1 日常功能並存） |
| **基準** | main 含 0.6.1（Team、readiness、設定即時預覽、StatusOrb 2D、T4 live STRONG） |
| **目標使用者** | 中文小白、Windows 桌面；要「產完／寫完就能在旁邊看到」，少切視窗 |
| **Fable 審查** | `docs/plans/2026-07-16-preview-pane-full-plan-FABLE5-REVIEW.md` · Verdict: Request-changes（輕量）→ 本檔已套用 P0/P1 · GO 建議: **yes-after-edits**（Fable：改完不需重審） |

---

## 0. 站主指令（本檔必須遵守）

1. **功能做滿**：不是 MVP 半套；圖／影片／HTML／程式碼 + 清單 + 自動發現 + 可收合 + 完整 UX。  
2. **使用者體驗優先**：一鍵預覽、自動猜測類型、錯誤可懂、不擋聊天、Team 並排仍可用。  
3. **視覺驗證**：實作與收工視覺必須由 **`agy` = Gemini 3.5 Flash (High)** 驗證 **通過** 才算視覺 Done。  
4. **產品冒煙**：收工必須由 **`codex` = GPT-5.6 full-access** 跑**實際產品**冒煙（元件控制、UX 層、UI 顯示、各預覽功能）。  
5. **計畫審核**：本計劃先經 **`fable5` full-access** 審過，再回報站主；**站主 GO 前不寫產品碼**。  
6. **安全**：維持 `sandbox` / `contextIsolation` / 無 `nodeIntegration`；HTML 預設強沙箱；路徑 **強制 root allowlist**；CSP 明確擴充且 transcript 永不自動載遠端圖。  
7. **不做**：假 ACP 多模態、未沙箱的完整瀏覽器、L3 角色、fork 官方 harness、本版 HTML 同目錄資源解析。

---

## 1. 產品願景（白話）

在主畫面**右側**加一塊 **Preview Dock（預覽台）**：

- 可**一鍵收合／展開**（像側欄，不消失記憶）  
- 裡面用分頁或自動模式預覽：  
  - **圖片**（png/jpg/webp/gif/svg*）  
  - **影片**（mp4/webm；長度與大小有上限）  
  - **HTML**（安全沙箱 iframe **srcdoc only**）  
  - **程式碼**（語法上色、複製、換行／自動換行）  
- 對話裡出現路徑、Markdown 圖、code fence、工具輸出時，能**自動列進「可預覽清單」**，點一下就進框  
- Grok 若把產物寫成工作區檔案或回覆路徑，使用者**不用開檔案總管也能先看**

\* SVG **一律以 `<img>` 渲染**（天然不執行 script/foreignObject）；只套大小上限，不做內容嗅探降級。

---

## 2. 使用者體驗規格（做滿）

### 2.1 資訊架構

```
┌──────────┬────────────────────────────┬─────────────────┐
│ Session  │  Transcript + Composer     │ Preview Dock    │
│ 側欄     │  (既有)                    │ 可收合          │
└──────────┴────────────────────────────┴─────────────────┘
```

- **展開**：`workspace` 三欄（側欄 | main | preview）  
- **收合**：僅剩窄 rail（約 36–44px）顯示「預覽」圖示 + 未讀／目前類型小點  
- **與設定 drawer**：  
  - 預覽台是**常駐欄**；設定／功能矩陣仍為**覆蓋式 drawer**  
  - 開設定時預覽台可保持展開（被 drawer 蓋住右側一部份可接受）；**不強制關預覽**以減少狀態跳動

### 2.2 預覽台內部 UX

| 區域 | 行為 |
| --- | --- |
| **頂欄** | 標題「預覽」· 收合鈕 · 釘選（可選）· 在檔案總管開啟 · 複製路徑 · 重新整理 |
| **類型 Tab** | 自動 / 圖片 / 影片 / HTML / 程式碼；「自動」依副檔名與內容嗅探 |
| **清單** | 目前 session 可預覽項目（時間倒序）；目前項高亮；空狀態說明「從對話點路徑或選檔」 |
| **檢視區** | 依類型渲染；載入中 skeleton；錯誤友善中文 |
| **底欄** | 檔名、大小、類型、快捷鍵提示 |

### 2.3 觸發方式（全部要有）

1. **點對話／工具輸出中的路徑**（可點的 path chip 風格）— **主路徑**  
2. **點 Markdown 圖片**（若可解析 src）— **best-effort**（react-markdown `urlTransform` 可能濾本機 path；主要仍靠 #1 原文掃描）  
3. **Code block 工具列「預覽」**（整塊送進程式碼模式）  
4. **預覽台「開啟檔案…」**（dialog；選中檔自動註入 root allowlist）  
5. **貼圖 path chip「預覽」**  
6. **自動發現**：僅在 message／tool **完成**時掃描（**不**逐 stream chunk）+ debounce；**不自動搶焦點**，只更新清單；「自動預覽最新媒體」設定開關，預設 **關**

### 2.4 狀態與回饋

| 狀態 | UX |
| --- | --- |
| 載入中 | 骨架 + 「讀取中…」 |
| 成功 | 穩定顯示；圖片可縮放（fit / 100%）；影片可播／暫停／**拖進度 seek** |
| 檔案不存在 | 「找不到檔案，可能已被移動或刪除」+ 重試 + 開資料夾（若父目錄在） |
| 類型不支援 | 「此格式暫不支援預覽」+ 開外部 |
| 超過大小 | 「檔案過大（上限 X），請用系統程式開啟」 |
| 路徑在 root 外 | 不 inline 預覽；僅「在檔案總管開啟」 |
| HTML 危險 | 預設沙箱無腳本；「允許腳本」為**逐檔、逐次、不持久化**同意 + 明顯警告橫幅（預設關） |
| 無項目 | 插畫式空狀態（座艙語氣）+ 三個快捷：選檔／從最新訊息掃描／說明 |

### 2.5 鍵盤與無障礙

- `Ctrl+Shift+V`：開關預覽台 — command 必須加入 `DEFAULT_SHORTCUTS` 為 `togglePreview`（normalize 會丟未知 command）  
- `Escape`：若預覽全螢幕／燈箱則**只關燈箱**，**不得**觸發全局 `cancelTurn`  
- 焦點：Tab 可進清單與控制項；aria-label 齊全  
- axe serious/critical = 0（納入 Codex smoke）

### 2.6 與 Agents Team

- 預覽內容**綁目前 focus session**（與 active／team focus 一致）  
- 切換 focus pane 時：清單切到該 session 的項目  
- **「跨 Team 共用預覽焦點」**（設定，預設關）— 波次[4] **末位**，擠壓時最後做  
- 三格 Team + 預覽展開時：預覽最小寬 260px；主區可縮；低於 1280 寬度時自動建議收合預覽（可撤銷）

### 2.7 持久化

| 鍵 | 內容 |
| --- | --- |
| `preview.open` | 是否展開 |
| `preview.width` | 寬度 260–480 |
| `preview.autoPreviewLatestMedia` | 自動預覽最新圖／影 |
| `preview.showHtmlScriptAdvanced` | 是否顯示「允許腳本」進階按鈕（總開關，預設 false）；**不是**「永久允許所有 HTML 腳本」 |
| `preview.maxImageMb` / `preview.maxVideoMb` | 大小上限 |
| `preview.recentBySession` | 每 session 最近 N 項（路徑 + 類型 + mtime）；**全域 session 上限**（如最近 20 個 session）；點擊時 re-stat + re-register |

寫入既有 `electron-store` settings（normalize 時容錯；`AppSettings` + defaults + normalize 同步擴充）。

---

## 3. 功能完整清單（Must = 做滿）

### 3.1 殼層

| ID | 功能 |
| --- | --- |
| P-SHELL-1 | 右側 Preview Dock 展開／收合／記憶 |
| P-SHELL-2 | 可拖曳調整寬度（吸附 300／360） |
| P-SHELL-3 | 窄 rail 收合態 |
| P-SHELL-4 | 快捷鍵開關（`togglePreview` ∈ DEFAULT_SHORTCUTS） |
| P-SHELL-5 | 與 titlebar 無重疊、z-index 低於 modal、高於 transcript |

### 3.2 發現與清單

| ID | 功能 |
| --- | --- |
| P-DISC-1 | 從 message／tool output 掃 Windows／POSIX 路徑（完成時 + debounce） |
| P-DISC-2 | 掃 Markdown image / 簡易 URL（http/https 圖）— **僅列清單**；載入只在 Dock 內、點擊後 |
| P-DISC-3 | 掃 fenced code blocks（語言 + 內容 hash） |
| P-DISC-4 | 去重、上限（每 session 50 項）、過期失效 |
| P-DISC-5 | 清單 UI：圖示、檔名、類型徽章、相對 cwd 短路徑 |
| P-DISC-6 | 「重新掃描目前對話」按鈕 |

### 3.3 圖片

| ID | 功能 |
| --- | --- |
| P-IMG-1 | 顯示 png/jpeg/webp/gif |
| P-IMG-2 | fit / actual size 切換 |
| P-IMG-3 | 滾輪縮放 + 拖曳平移（actual 模式） |
| P-IMG-4 | 錯誤與過大處理（預設 25MB） |
| P-IMG-5 | SVG 一律 `<img>`；大小上限同圖 |

**載入路徑（0.7.0 強制）：**

- ≤ 8MB：base64 data URL  
- **> 8MB 且 ≤ 上限**：`grok-preview://` protocol  
- 超過上限：外部開啟提示  

### 3.4 影片

| ID | 功能 |
| --- | --- |
| P-VID-1 | mp4/webm `<video controls>` via **`grok-preview://` only**（本版必做 protocol） |
| P-VID-2 | 大小上限（預設 200MB）超過則外部開啟 |
| P-VID-3 | 載入失敗提示 + 系統播放器（`shell.openPath`） |
| P-VID-4 | 切換項目時停止播放，避免背景聲音 |
| P-VID-5 | **Seek 必須可用**（protocol handler 支援 HTTP Range） |

**不做**：「≤50MB 內嵌 data: 影片」退路（CSP 不可行且與 protocol 路線衝突；若要降級須站主明示 + 修訂計畫）。

### 3.5 HTML

| ID | 功能 |
| --- | --- |
| P-HTML-1 | 讀取檔案 → iframe **`srcdoc` only**（**禁止** blob URL iframe） |
| P-HTML-2 | 預設 sandbox：`allow-same-origin` **永不**與 `allow-scripts` 並用；預設 **無 scripts** |
| P-HTML-3 | ~~同目錄資源解析~~ → **本版不做**（見 §8 X8）；空狀態提示「外部 CSS/圖可能缺失」並註明是 **CSP 刻意行為** |
| P-HTML-4 | 「允許腳本」= **逐檔、逐次、不持久化**（session-scoped 同意）+ 明顯警告橫幅；非全域 sticky |
| P-HTML-5 | 重新整理（重讀檔 + 重套 sandbox 狀態） |

### 3.6 程式碼

| ID | 功能 |
| --- | --- |
| P-CODE-1 | 沿用／擴充 highlight.js 上色 |
| P-CODE-2 | 語言自動／手動 |
| P-CODE-3 | 複製全部、換行開關、字級跟隨設定 |
| P-CODE-4 | **讀取上限 400KB**；**上色上限 200KB**（超過以純文字 + 提示，避免同步 highlight 卡死 renderer） |

### 3.7 安全與 main

| ID | 功能 |
| --- | --- |
| P-SEC-1 | IPC：僅 absolute path + 存在 + 副檔名白名單 + **強制 multi-root allowlist**（見下） |
| P-SEC-2 | **`grok-preview://` protocol = 0.7.0 必做（非二期）**；服務 = 全部影片 + >8MB 圖；≤8MB 圖 base64；code/HTML 文字 utf-8 |
| P-SEC-3 | 拒絕路徑穿越、UNC、device path、ADS、結尾點/空白、保留名、非白名單副檔名；比對前 **大小寫 normalize + realpath** |
| P-SEC-4 | HTTP(S) 圖：僅在 Preview Dock 內、**使用者點擊後**用 `<img src=https>`；**不**經任意 fetch 代理 |
| P-SEC-5 | 記錄拒絕原因給 UI（中文） |
| **P-SEC-6** | **CSP + protocol 特權（本版必做）** — 見下 |

**強制 root allowlist（合法 root）：**

1. main 追蹤的存活 session **cwd**  
2. paste-image **tmpdir**（`%TEMP%\grok-build-gui-paste`）  
3. 使用者 **dialog 選檔** 所在目錄／檔（同 `ExportPathAllowlist` 模式）  

Root 之外 → **不** inline 預覽，只給「在檔案總管開啟」。

**P-SEC-6 CSP 明確 diff（對 `src/renderer/index.html`）：**

| 指令 | 變更 |
| --- | --- |
| `img-src` | `'self' data: grok-preview: https:` |
| `media-src`（新增） | `'self' grok-preview:` |
| `frame-src` | **不動**（HTML 只用 srcdoc，不開 blob） |
| 其餘 | 維持既有嚴格預設 |

**配套鐵則（隱私）：**

- **Transcript 永不自動渲染遠端圖**——Markdown `img` 一律以「預覽 chip／可點路徑」呈現；只有點進 Preview Dock 後才載入 `https:` 圖。  
- 避免「為了預覽放寬 CSP」導致對話內 tracking pixel 自動發射。  
- 單元測試斷言 `index.html` CSP 含 `media-src` 與 `grok-preview:`。

**Protocol 註冊（0.7.0 必做）：**

```
// 必須在 app.whenReady() 之前（模組頂層）
protocol.registerSchemesAsPrivileged([{
  scheme: 'grok-preview',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false }
}])
```

- Handler 必須支援 **Range**（影片 seek）。  
- **register 時驗證**（存在 + 副檔名 + 大小 + root）；**serve 時再驗一次**（防 TOCTOU）。  
- allowlist = **in-memory、process 生命週期**；重啟後點舊清單 → re-stat + re-register。

**統一 IPC 名稱：**

| Channel | 用途 |
| --- | --- |
| `preview:stat` | 存在性、mime、size、kind |
| `preview:read-text` | code / HTML 文字 |
| `preview:register` | 註入 allowlist，回 protocol URL 或拒絕理由 |

（刪除含糊的 `preview:read` 單一名。）

### 3.8 設定

| ID | 功能 |
| --- | --- |
| P-SET-1 | 自動預覽最新媒體（預設關） |
| P-SET-2 | 預設展開預覽台（預設關） |
| P-SET-3 | 顯示 HTML「允許腳本」進階按鈕（預設關）— **非** sticky 全域允許腳本 |
| P-SET-4 | 最大圖片／影片 MB |

---

## 4. 架構

### 4.1 模組

| 模組 | 職責 |
| --- | --- |
| `shared/preview-types.ts` | PreviewItem、PreviewKind、limits |
| `shared/preview-discover.ts` | 純函式：從文字發現路徑／fence／md image |
| `shared/preview-path-policy.ts` | 副檔名、大小、路徑正規化（大小寫／realpath）、root 比對（可測） |
| `main/preview-protocol.ts` | `grok-preview:` 特權註冊 + Range handler + serve 再驗證 |
| `main` IPC | `preview:stat` / `preview:read-text` / `preview:register` |
| `renderer/index.html` | CSP 擴充（P-SEC-6） |
| `renderer/components/PreviewDock/*` | Shell、Tabs、List、ImageView、VideoView、HtmlView、CodeView |
| `App.tsx` | 狀態：open、width、itemsBySession、activeItemId、focus 連動 |
| `shared/shortcuts.ts` | `togglePreview` ∈ DEFAULT_SHORTCUTS |

### 4.2 資料流

```
ACP events / composer paths
    → (message/tool complete + debounce)
    → discoverPreviewCandidates(text, { cwd })
    → PreviewItem[]
    → 使用者選取 or 自動最新（若設定開）
    → preview:register → main 驗證 + allowlist
    → Image ≤8MB: data URL | Image >8MB / Video: grok-preview://
    → Html/Code: preview:read-text
    → View（HTML = srcdoc only）
```

### 4.3 與現有功能

- **不改** interject 語意、readiness gate  
- path chip 增加「預覽」小鈕  
- CodeBlock 增加「預覽」  
- Markdown：本機路徑／遠端圖 → chip → 點擊進 Dock；其他 http → openExternal  
- Escape 燈箱優先於 cancelTurn  

---

## 5. 視覺與 UX 設計方向

- 延續 **Galaxy Cockpit A**：玻璃面板、金 accent、IBM Plex / Newsreader  
- 預覽台背景略深於 transcript，避免「第二對話區」混淆  
- 清單密度中等；觸控友善 32px 列高  
- 空狀態與錯誤用座艙語氣，不丟英文堆疊 trace  

### 5.1 AGY 視覺驗證（強制門檻）

| 項 | 要求 |
| --- | --- |
| 執行者 | **`agy` Gemini 3.5 Flash (High)** |
| 時機 | 功能接線完成後、Codex full-access smoke 前 |
| 輸入 | 實機或 `web-design-shots`／smoke 截圖 + 預覽台開／收、四種類型各至少 1 張；**另含視窗寬 1040（minWidth）與 1280、Team 多格 + 預覽展開** |
| 輸出 | `docs/plans/v070-preview-agy-visual-review.md` |
| **通過條件** | Verdict **Approve** 或 **Approve-with-nits** 且 **無 P0 視覺**；P1 必須同波修完再標通過 |
| 失敗 | 修 UI → 再 AGY，直到通過；**額度不足 → 停工等站主**（不造假） |

AGY 檢查清單（最低）：

1. 展開／收合不破版、不遮 titlebar 控制  
2. 四種類型預覽可辨、載入／錯誤態清楚  
3. 深色／亮色可讀  
4. Team 兩格 + 預覽展開不致無法點輸入框  
5. 與設定 drawer 同開時不「死鎖」  
6. reduced-motion 下無眩暈動畫  
7. 窄幕 1040 / 1280 壓力位可接受  

---

## 6. 測試與冒煙

### 6.1 自動化（執行線）

| 套件 | 內容 |
| --- | --- |
| 單元 · discover | 路徑、fence、md image；去重；完成時掃描語意 |
| 單元 · path-policy **對抗清單（必測）** | `..` 穿越；UNC `\\server\share`；device `\\.\C:`；NTFS ADS `file.png:evil`；結尾點/空白；**大小寫翻轉**；`\\?\` 長路徑；CON/NUL；symlink/junction realpath 後比對；protocol URL encode/decode 往返 |
| 單元 · CSP | `index.html` 含 `media-src` 與 `grok-preview:` |
| RTL | Dock 開關、選清單切類型、code 複製、錯誤態 |
| RTL | iframe **必有 sandbox**、**永不**同時 `allow-same-origin`+`allow-scripts` |
| RTL | 燈箱開時 Escape **只關燈箱、不 cancelTurn** |
| RTL | transcript **不**自動載入遠端 `<img src=https>` |
| 既有 | 195+ 全綠不回歸 |

### 6.2 Codex GPT-5.6 Full Access 產品冒煙（強制門檻）

| 項 | 要求 |
| --- | --- |
| 執行者 | **`codex` gpt-5.6 · `--write --full-access`** |
| 時機 | AGY 視覺通過之後 |
| 必跑 | `npm run verify`、擴充 `smoke:ui` 或新 `smoke:preview`（沿用 `work/ui_feature_smoke.mjs` 骨架） |
| 必測 UX／UI／功能 | 見下表 |
| 輸出 | `docs/plans/v070-preview-codex-fullaccess-smoke-report.md` |
| **通過條件** | Verdict **PASS** 或 **PASS-with-nits** 且 **無 P0**；腳本列 exit 0；**C 項逐條 PASS/FAIL 寫進報告**（非只看總 exit） |

Codex full-access 必測矩陣：

| # | 項目 | 驗收 |
| --- | --- | --- |
| C1 | 開關預覽台 | 展開／收合、記憶重開（store） |
| C2 | 拖曳寬度 | 在合法範圍 |
| C3 | 點路徑預覽圖片 | 顯示成功（含 ≤8MB 與 >8MB protocol 路徑抽樣） |
| C4 | 預覽影片 | controls 可播、**可拖進度 seek**、切項停播 |
| C5 | 預覽 HTML | 預設無 script 執行惡意樣例；sandbox 屬性正確 |
| C6 | 預覽 code fence | 上色（≤200KB）、複製 |
| C7 | 清單多項切換 | UI 正確、無殘留影音 |
| C8 | 檔案不存在 | 中文錯誤 |
| C9 | 超大檔 | 拒載或外部開啟提示 |
| C10 | 設定即時預覽仍可用 | 不回歸 |
| C11 | readiness／插話不回歸 | 抽樣 RTL 或 smoke 旗標 |
| C12 | axe serious/critical | 預覽開／關皆 0 |
| C13 | 截圖 | 四類型 + 收合 rail + **1040/1280** 各至少 1 |
| **C14** | **安全負面** | 從真 renderer bridge 發穿越 / UNC / root 外 / 非白名單副檔名之 `preview:*` → **全拒**且有中文理由 |

### 6.3 既有 T4 live

- 不破壞 `smoke:t4-live`；預覽功能可不納入雙 prompt live。

---

## 7. 實作波次（單一 0.7.0 史詩內有序，不拆「沒有預覽的發版」）

站主要求功能做滿 → **一個版本交付完整預覽台**；波次僅內部 handoff：

```
[0] Fable 審計畫 → 套用 P0/P1 → 站主 GO
[1] shared discover/policy + 對抗單元測試
[2] main IPC + preview protocol（Range）+ CSP 改動 + 安全測試
[3] PreviewDock 殼 + 清單 + 四 View
    建議：殼與邏輯執行線；視覺 token／空狀態／間距優先 AGY 寫 renderer
[4] App 整合：路徑點擊、CodeBlock、path chip、settings、togglePreview；
    跨 Team 共用焦點設定放本波末位
[5] 擴充 smoke:preview + RTL（含 Escape、sandbox、遠端圖不自動載）
[6] AGY 視覺驗證 → 必須通過
[7] Codex full-access 產品冒煙（C1–C14）→ 必須通過
[8] CHANGELOG 0.7.0 + push（授權後）
```

**Renderer 寫入約定（與站主歷史偏好對齊）：**

- **視覺／版面／預覽台外觀**：優先 **AGY Gemini 3.5 Flash**  
- **shared／main／測試／IPC／protocol／CSP 鎖**：執行線  
- 若 AGY 額度不足：**停工等站主**（同 0.6 紀律），不擅自用半套視覺充數  

---

## 8. 明確不做

| ID | 不做 |
| --- | --- |
| X1 | 未沙箱完整瀏覽器 |
| X2 | 任意 file:// 全盤讀取 |
| X3 | 預設開啟 HTML 腳本；或 sticky 全域「允許所有 HTML 腳本」 |
| X4 | 假稱 ACP 已推送原生 video block |
| X5 | 線上任意網站完整應用（僅 https 靜態圖可，且僅 Dock 點擊後） |
| X6 | 無 AGY 視覺通過仍標 Done |
| X7 | 無 Codex full-access 冒煙通過仍標 Done |
| X8 | **本版** HTML 同目錄相對資源解析（未來需獨立安全審查） |
| X9 | 本版「≤50MB data: 內嵌影片」退路 |
| X10 | Transcript 內自動載入遠端圖 |

---

## 9. 完成定義（0.7.0 Preview Dock Done）

1. §3 全部 Must ID 完成（含 P-SEC-6、P-VID-5）  
2. §2 UX 行為可測  
3. `npm run verify` 綠  
4. **AGY 視覺驗證通過**（文件證據）  
5. **Codex full-access 冒煙通過**（文件證據，含 **C1–C14**）  
6. CHANGELOG / 版本 0.7.0  
7. 站主可日常：對話出路徑 → 右側預覽圖／影／HTML／code  

---

## 10. 風險與緩解

| 風險 | 緩解 |
| --- | --- |
| 大影片拖垮記憶體 | protocol stream + 大小門檻 + Range |
| 影片黑屏 | P-SEC-6 CSP media-src + 特權 scheme 先於 ready |
| HTML XSS | srcdoc + 預設無 script；逐次同意；sandbox 屬性 RTL 鎖 |
| 路徑誤報／逃逸 | 強制 root allowlist + Windows 對抗清單 + serve 再驗 |
| CSP 放寬導致追蹤像素 | transcript 永不自動載遠端圖（RTL 鎖） |
| Team + 預覽太擠 | 預設收合；窄螢幕提示；1040/1280 AGY 截圖 |
| highlight 卡 UI | 上色 cap 200KB |
| AGY／Codex 額度 | 停工規則；證據檔不造假 |
| 發現掃描誤傷隱私 | 僅目前 session 已載入文字；不掃全碟；完成時 + debounce |

---

## 11. Fable 5 Full Access 審核結果（摘要）

| 項 | 結果 |
| --- | --- |
| 執行 | `model-exec fable5 --write --full-access` · model **claude-fable-5** · mode **unbounded-full-access** · **observed** · exit 0 |
| 完整報告 | `docs/plans/2026-07-16-preview-pane-full-plan-FABLE5-REVIEW.md` |
| Verdict | Request-changes（輕量）— 2×P0 + 7×P1 皆為計畫文字 |
| GO | **yes-after-edits**（Fable：套用後**不需重審**） |
| 本檔狀態 | **P0-1 CSP、P0-2 protocol 統一、P1-1～P1-7 已併入** |

Fable 對「做滿」與雙 gate 的評價：範圍可落地、AGY/Codex 門檻有 v0.6.1 真實前例、安全方向正確，補完 CSP/root/C14 後屬優等姿態。

---

## 12. 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-07-16 | 初稿：完整 Preview Dock；AGY 視覺門檻；Codex full-access 冒煙門檻；待 Fable 5 審 |
| 2026-07-16 | **Fable 5 full-access 審畢**：套用 P0-1 CSP+隱私鐵則、P0-2 protocol 0.7.0 必做與 8–25MB 圖路徑；P1 root 強制、Windows 對抗測試、HTML 逐次同意、剔除同目錄資源、C14+seek、IPC 統一、highlight 200KB cap；P2 關鍵項（scan debounce、SVG img、togglePreview、Esc RTL、1040 截圖）。狀態 → 待站主 GO |
