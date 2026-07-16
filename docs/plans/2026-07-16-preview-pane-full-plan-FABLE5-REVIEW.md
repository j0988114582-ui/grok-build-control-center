# Preview Dock 完整計畫審查（Fable 5 full-access）

| 欄位 | 內容 |
| --- | --- |
| **審查對象** | `docs/plans/2026-07-16-preview-pane-full-plan.md`（未提交草案） |
| **審查者** | claude-fable-5 · profile `fable5` · full-access |
| **審查日期** | 2026-07-16 |
| **驗證方式** | 全文精讀 + 對照現行程式碼（main/preload/renderer/settings/shortcuts/smoke 腳本/既有 gate 報告）；未寫任何產品碼 |
| **結論** | **Request-changes（輕量）** — 2 個 P0 皆為「計畫文字補寫」，改完即可 GO，不需重審整份 |
| **GO 建議** | **yes-after-edits** |

**一句話**：這是本 repo 目前結構最好的一份計畫——範圍做滿但有紀律、安全意識正確、雙 gate 真實可執行；但它漏看了 `index.html` 的 CSP（會讓影片與 https 圖**照計畫做出來就是黑屏**，且放寬 CSP 有隱私副作用需站主知情），加上媒體管線內部自相矛盾（protocol「二期」vs「本版必做」、8–25MB 圖片無路可走）。這兩點必須先改計畫文字，其餘為 P1/P2 條文補強。

---

## 1. 逐項驗證（計畫宣稱 vs 程式碼事實）

| 計畫宣稱 | 驗證結果 | 證據 |
| --- | --- | --- |
| §0.6 維持 sandbox/contextIsolation/無 nodeIntegration | **屬實** | `src/main/index.ts:400` `sandbox: true, contextIsolation: true, nodeIntegration: false` |
| P-SEC-4 沿用 openExternal 規則 | **屬實** | `src/main/index.ts:376-380` 僅 http/https；`will-navigate` 全擋（:406-408） |
| 允許清單模式有前例 | **屬實** | `src/shared/export-reveal.ts` `ExportPathAllowlist`（F1 reveal 同構）；**注意**它不做大小寫正規化，preview 版在 Windows 必須補 |
| §2.7 寫入既有 electron-store settings | **可行** | `src/shared/settings.ts:80-101` normalize 白名單制——新增 `preview.*` 需同步擴 `AppSettings`+defaults+normalize，計畫已預期 |
| `Ctrl+Shift+V` 無衝突 | **屬實** | `src/shared/shortcuts.ts:3-13` 無此鍵；但 normalizeShortcuts 會丟棄未知 command（settings.ts:55-58），**必須加進 DEFAULT_SHORTCUTS 才可重綁** |
| §2.5 Escape 不搶全局 | **有真衝突要管** | 全局 `Escape = cancelTurn`（shortcuts.ts:9）；燈箱開著按 Esc 絕不能誤取消回合——計畫方向對，需列 RTL 測試 |
| P-CODE-1 沿用 highlight.js | **屬實** | `src/renderer/src/components/CodeBlock.tsx`（同步 highlight，見 P1-7 效能上限） |
| §6.1「195+ 全綠」 | **屬實** | `v061-codex-fullaccess-smoke-report.md`：44 files / 195 passed |
| AGY / Codex gate 可執行 | **屬實，有前例** | `v061-codex-fullaccess-smoke-report.md`（真機 Electron、exit codes、axe）；`v061-agy-*.md` 含兩份 STOPPED 檔，證明「額度不足即停工」紀律是真的在跑 |
| smoke 基礎設施存在 | **屬實** | `work/ui_feature_smoke.mjs`：Playwright Electron、axe serious/critical、截圖、exit-code gating——`smoke:preview` 可直接沿用此骨架 |

---

## 2. P0（計畫必改，改完才 GO）

### P0-1 CSP 完全未被計畫處理——影片與 https 圖「照計畫做就是壞的」，且放寬 CSP 有隱私取捨需站主知情

`src/renderer/index.html:6`：

```
default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'
```

後果對照計畫：

| 計畫條目 | 在現行 CSP 下的實際結果 |
| --- | --- |
| §3.7 影片走 `grok-preview://` protocol | **黑屏**。無 `media-src` → 回落 `default-src 'self'`，自訂 scheme 不是 `'self'` |
| §3.7 退路「≤50MB 內嵌」（data: 影片） | **同樣被擋**（`data:` 只在 img-src 有開） |
| P-SEC-4 / P-DISC-2 `<img src=https>` | **被擋**（img-src 無 `https:`） |
| 8–25MB 圖走 protocol（見 P0-2） | **被擋**（img-src 無 `grok-preview:`） |
| P-HTML-1 blob URL iframe 路線 | **被擋**（無 `frame-src blob:`）；srcdoc 路線不受 frame-src 管 → **應明定 srcdoc 為唯一路線** |
| P-HTML-3「外部 CSS/圖可能缺失」 | 其實正是 srcdoc 子資源**繼承父 CSP**被擋——行為與計畫提示吻合，但計畫應寫明「這是 CSP 刻意為之」，不是 bug |

**隱私副作用（必須寫進計畫讓站主決策）**：現行 `img-src 'self' data:` 有一個沒人寫下來的好處——transcript 的 Markdown 遠端圖**根本載不出來**，追蹤像素（tracking pixel）無法在訊息渲染時發射。一旦為了預覽全域加 `img-src https:`，若不配套，**所有** transcript 遠端圖會自動載入 = 隱私回歸。

**必改條文**（加入 §3.7 新增 P-SEC-6，並在 §4.1 模組表加一列）：

1. CSP 明確 diff：`img-src 'self' data: grok-preview: https:`；新增 `media-src 'self' grok-preview:`；HTML 預覽**限定 srcdoc 路線**（不用 blob，就不動 frame-src）。
2. 配套鐵則：**transcript 永不自動渲染遠端圖**——Markdown `img` 一律以「預覽 chip」呈現，只有使用者點擊後才在 Preview Dock 載入 https 圖。此規則列入 RTL 測試。
3. `protocol.registerSchemesAsPrivileged([{ scheme: 'grok-preview', privileges: { stream: true } }])` 必須在 `app.whenReady()` **之前**（模組頂層）呼叫；protocol handler 必須支援 **Range**（否則影片不能 seek）。
4. 新增回歸鎖：單元測試斷言 `index.html` CSP 含 `media-src` 與 `grok-preview:`（repo 已有 package.test.ts 這類設定斷言前例）。

### P0-2 媒體管線自相矛盾 + 8–25MB 圖片無路可走

- P-SEC-2 寫「自訂 protocol **二期**；MVP base64/text 分級」，同節 MVP 資料策略卻寫「**要求優先實作 protocol 路線**」——同一節內互相打架，實作者可各取所需。
- P-IMG-4 圖片上限 25MB，資料策略只給「≤8MB base64」——**8–25MB 的圖沒有任何載入路徑**。
- 退路「≤50MB 內嵌影片」在現行 CSP 下本來就不可行（見 P0-1），寫著只會誤導。

**必改條文**：

1. P-SEC-2 改寫為：「`grok-preview://` protocol 為 **0.7.0 必做**（非二期）；服務對象 = 全部影片 + **>8MB 圖片**；≤8MB 圖走 base64 data URL；code/HTML 走 readText」。刪除「二期」與「≤50MB 內嵌」字樣。
2. 若真要保留退路，必須寫成「僅在站主明示同意 + 計畫修訂後方可啟用」，不得由實作者自行降級。

---

## 3. P1（計畫條文補強，不動架構）

| # | 問題 | 必改條文 |
| --- | --- | --- |
| P1-1 | P-SEC-1「**可選** cwd 前綴檢查」太弱。`preview:register` 是 renderer 可呼叫的 IPC；被攻破的 renderer 可註冊任意路徑，副檔名白名單擋不住大面積文字/程式碼檔讀取 | 改為**強制 root allowlist**：合法 root = ①main 追蹤的存活 session cwd（main 建 session 時本來就知道）②paste-image tmpdir ③使用者 dialog 選檔（自動註冊，同 `ExportPathAllowlist` 模式）。Root 之外 → 不 inline 預覽，只給「在檔案總管開啟」 |
| P1-2 | 波次[2]「安全測試」沒列案例，Windows 特規很容易漏 | 在 §6.1 列**必測清單**：`..` 穿越、UNC `\\server\share`、device `\\.\C:`、NTFS ADS `file.png:evil`、結尾點/空白、**大小寫翻轉**（Windows 不分大小寫，比對必須 normalize——注意 `export-reveal.ts` 現行 key 就沒有 lowercase）、`\\?\` 長路徑、保留名（CON/NUL）、symlink/junction 逃逸（realpath 後再比對）、protocol URL encode/decode 往返 |
| P1-3 | P-SET-3 全域持久化的「HTML 允許腳本」開關危險：開過一次就對**所有**後續 HTML 生效 | 改為**逐檔、逐次、不持久化**的同意（session-scoped）；P-SET-3 降級為「是否顯示進階按鈕」的總開關。另加 RTL 鎖 iframe 屬性：必有 `sandbox`、**永不**同時 `allow-same-origin`+`allow-scripts` |
| P1-4 | P-HTML-3「同目錄資源解析（進階）」= 讓被預覽的 HTML 能拉同目錄任意白名單檔，攻擊面擴大且工程量不小 | **從 0.7.0 剔除**，列入「明確不做（本版）」，未來要做需獨立安全審查。保留「外部資源可能缺失」提示並註明是 CSP 刻意行為 |
| P1-5 | Codex gate 有兩個洞：C4 沒測 seek（Range 沒做就會中招）；全表沒有**安全負面測試** | C4 改「controls 可播、**可拖進度 seek**、切項停播」；**新增 C14**：從真 renderer bridge 發 `..` 穿越/UNC/root 外/非白名單副檔名的 `preview:*` 呼叫，斷言全被拒且有中文理由。並澄清「exit 0」只適用腳本列，C 項逐條 PASS/FAIL 寫進報告 |
| P1-6 | IPC 命名不一致：§3.7 寫 `preview:read`，§4.1 寫 `preview:stat`/`preview:readText`/`preview:register` | 統一為 `preview:stat` / `preview:read-text` / `preview:register`；並寫明：**register 在 main 驗證**（存在+副檔名+大小+root），**protocol serve 時再驗一次**（防 TOCTOU）；allowlist 為 in-memory、process 生命週期，重啟後點舊清單需重新驗證+註冊 |
| P1-7 | P-CODE-4 讀 400KB 直接餵 highlight.js 會卡死 renderer 主執行緒（CodeBlock 是同步 highlight） | 拆兩個上限：讀取 400KB 不變；**上色僅 ≤200KB**，超過以純文字顯示 + 提示 |

---

## 4. P2（nits，實作期順手處理即可）

1. **P2-1** `preview.recentBySession` 加全域上限（如最近 20 個 session）；載入時 normalize 容錯 + 點擊時重新 stat/register（路徑會過期）。
2. **P2-2** 自動發現只在 message/tool **完成**時掃描（勿逐 stream chunk），加 debounce；50 項上限已足。
3. **P2-3** §6.1 補一條 RTL：燈箱開啟時按 Escape 只關燈箱、**不觸發 cancelTurn**。
4. **P2-4** AGY 輸入截圖補兩張版面壓力位：視窗最小寬 **1040**（BrowserWindow minWidth）與 1280、Team 多格 + 預覽展開。
5. **P2-5** SVG 一律以 `<img>` 渲染（天然不執行 script/foreignObject），即可**刪掉**「可疑內容嗅探降級」的複雜度，只留大小上限——更簡單也更安全。
6. **P2-6** `togglePreview` 需加入 `DEFAULT_SHORTCUTS` 才能走既有重綁機制（normalize 會丟棄未知 command）。
7. **P2-7** 觸發方式 #2（Markdown 圖）註明 best-effort：react-markdown 預設 urlTransform 可能濾掉本機路徑 src；主要路徑是觸發 #1 的原文掃描。
8. **P2-8** §2.6「跨 Team 共用預覽焦點」設定保留可，但列為波次[4]末位，擠壓時最後做。

---

## 5. 審核問題逐答（§11）

1. **Verdict**：Request-changes（輕量）——僅計畫文字，見 P0×2。
2. **範圍是否做滿仍可落地**：可。模組切分（shared 純函式 / main 驗證 / renderer view）與本 repo 既有紀律一致，單一 0.7.0 史詩可交付。唯一該剔除的是 P-HTML-3 進階同目錄資源（P1-4）；縮放平移、釘選等 polish 保留符合站主「做滿」指令。
3. **安全模型**：方向正確（預設無腳本 srcdoc、白名單、拒穿越），但要補：CSP 條文（P0-1）、強制 root allowlist（P1-1）、Windows 特規測試清單（P1-2）、逐次腳本同意（P1-3）。補完後屬同類 Electron 工具的優等安全姿態。
4. **UX**：無嚴重缺口。常駐欄 vs 覆蓋 drawer 的取捨有寫下來、自動預覽預設關是對的、Team focus 綁定與窄幕建議收合都有規格。Esc 衝突已被計畫意識到（補 RTL 即可）。
5. **AGY/Codex 門檻**：**可執行**（v0.6.1 兩種 gate 都有真實前例與 STOPPED 紀律證據）。通過條件合理；必補 C14 安全負面測試與 C4 seek（P1-5），AGY 補窄幕截圖（P2-4）。
6. **具體修改建議**：見 §2–§4 條文級 patch。
7. **GO 建議**：**yes-after-edits**——把 P0-1/P0-2 寫進計畫（約半小時的編輯量），P1 逐條落入對應章節後，即可回報站主 GO。

---

## 6. 給站主的話（繁中）

這份 Preview Dock 計畫我以 full-access 完整審過，也逐條對過現有程式碼：整體是目前 repo 裡最完整、最有紀律的一份計畫，範圍「做滿」但沒有失控，AGY 視覺與 Codex 真機冒煙兩道門檻都有 v0.6.1 的真實前例，可以執行。但有兩個必須先改計畫再開工的問題：第一，計畫漏了 renderer 的 CSP——照現在的條文做出來，影片和網路圖片會直接黑屏，而放寬 CSP 又牽涉「對話裡的遠端圖會不會自動載入（追蹤像素）」的隱私取捨，這要明文寫進計畫由您知情決定（我建議：對話內永不自動載圖、點了才在預覽台載入）；第二，計畫內部對影片 protocol 一邊寫「二期」一邊寫「本版必做」，且 8–25MB 的圖片沒有載入路徑，必須統一成「protocol 本版必做、同時服務大圖」。另外有七項 P1 條文補強（最重要的是路徑白名單從「可選」改「強制」、HTML 允許腳本改成逐檔逐次同意、冒煙加一條安全攻擊測試）。**結論：yes-after-edits——把上述改進計畫文字後即可 GO，不需要再送我重審一輪。**

---

## 7. 修訂紀錄

| 日期 | 變更 |
| --- | --- |
| 2026-07-16 | Fable 5 full-access 初審：Request-changes（P0×2、P1×7、P2×8）；GO = yes-after-edits |
