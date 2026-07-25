# v0.11 改版前審查報告與修正方向

日期：2026-07-25
受審版本：v0.10.0（`e6498da`，working tree 乾淨）
主審：Claude Opus 5｜委派：Grok 4.5（後端安全）、AGY Gemini 3.6 Flash（機械清點）
環境：Windows 11、Electron 43、Grok CLI **0.2.111**（AGENTS.md 記錄的實測基準是 0.2.101）

---

## 0. 審查方式與證據等級

| 面向 | 方法 | 證據 |
|---|---|---|
| 靜態 | `npm run verify` | 62 檔 / **352 tests 全綠**、lint 0 warning、typecheck 0 error、build 成功 |
| 真實 GUI 互動 | 真 Electron + **真 Grok CLI**（非 fake ACP）+ 真 DOM 點擊／打字 | `work/v011_interactive_review.mjs`、截圖 `outputs/v011-review/*.png` |
| 捲動行為 | 三次唯讀 probe，涵蓋 3／8／10 事件、最大 119,636px 內容 | `work/v011_scroll_probe.mjs` |
| 版面位移 | 唯讀 probe，改 composer 高度與視窗大小 | `work/v011_layout_shift_probe.mjs` |
| 後端安全 | Grok 4.5 唯讀審查 → **本人逐條 grep 驗證＋實測** | 見 §3 |
| 清點 | AGY Gemini 唯讀清點 → 本人抽驗 | 見 §4 |

**證據紀律**：本報告每一條都標示是「實測復現」還是「僅程式碼推論」。委派結果一律經過我本人驗證，未通過的直接標為駁回（§3.8）。

---

## 1. 意外副作用揭露（必讀）

第一輪互動冒煙的 harness 用 `.session-list button` 取第一列進入對話。**「已釘選」群組排在最前面**（`App.tsx:2256-2259`），所以它進的是你真實的釘選對話
（使用者的真實工作對話，非本次建立的暫存 session）。

結果：
1. 測試提示「請用繁體中文，逐行列出 1 到 30 的數字…」**送進了那個對話**，Grok 也回了。
2. 接著的 `/compact` **也送進了那個對話**，該 session 的上下文被真的壓縮了（截圖顯示壓縮後 CONTEXT 38%、191k/500k）。

沒有任何檔案被修改，對話紀錄也沒有被刪除；但那個 session 的歷史多了我的測試回合，且上下文已壓縮。
後續三個 probe 全部改成唯讀、且用群組名精準指定目標，不再發生。這是我的 harness 設計疏失。

---

## 2. 真實 GUI 互動抓到的缺陷

### D1 [P1] composer 一長高，最新訊息就被推出視野，而且沒有任何回到底部的提示

**實測**（`v011_layout_shift_probe.mjs`，真 Electron）：

| 狀態 | composer | transcript 可視高 | 距底部 | 「跳到最新」 |
|---|---|---|---|---|
| 1 進入對話（穩定） | 88px | 619px | **0px** | 未顯示 |
| 2 草稿長成 40 行 | 470px | 330px | **289px** | **未顯示** |
| 3 清空草稿 | 88px | 619px | 0px | 未顯示 |

composer 從 88px 長到 470px，transcript 少掉 289px，捲動位置卻停在原本的 `scrollTop` 不動——最後 289px 的內容（也就是最新訊息）直接被 composer 蓋住。**而且「跳到最新」按鈕沒有出現**，因為 `followTail` 沒有被更新，使用者連救回來的按鈕都沒有。

根因：`.transcript` 與 `.composer-wrap` 是 flex 兄弟，composer 變高時 Virtuoso 的 scroller 被動縮短，但沒有任何程式碼在 composer 高度變化後重新對齊底部。`syncMainComposerHeight`（`App.tsx:816-821`）只管 composer 自己，不通知 transcript。

**這條直接卡住你的優化方向 2**：composer 放到無限高，這個缺陷會從「蓋住 289px」變成「蓋住整個對話」。**必須先修 D1 再做 #2。**

---

### D2 [P1] 視窗縮放後「跳到最新」按鈕殘留——人在底部卻還顯示

**實測**（同一支 probe）：

| 狀態 | transcript 可視高 | 距底部 | 「跳到最新」 |
|---|---|---|---|
| 4 視窗縮到 500px | 179px | 0px | 未顯示 |
| 5 視窗放回 900px | 579px | **0px** | **顯示「跳到最新」** |

捲動位置確實在底部（`fromBottom=0`），但按鈕還在。因為 resize 過程中 Virtuoso 的 `atBottomStateChange` 送出一次 `false` → `setFollowTail(false)`（`App.tsx:2298`），回到底部後沒有再送 `true`，狀態就卡住了。

**這就是你回報的第 4 點的真正症狀。** 補充說明見 §5.4——你描述的「點進對話不在最新」我用三次 probe（3／8／10 個事件、最大 119,636px 內容）**都沒有復現**，進入時一律 `fromBottom=0`。真正會出事的是版面變動之後，這條才是要修的。

---

### D3 [P2] 上下文壓縮提示卡「有出現，但完全看不出來」

**實測結論：功能沒壞。** Grok CLI 0.2.111 上 Scheme A（raw NDJSON tee 攔 `_x.ai/session_notification`）仍然正常，壓縮卡確實渲染，標題「已自動壓縮上下文」。截圖：`outputs/v011-review/07-after-compact.png`。

問題在視覺：
- `grep -n "compact" src/renderer/src/styles.css` → **零筆**。整個 CSS 沒有任何 `.event-card.compact` 樣式。
- 圖示走 `EventCard` 的 fallback `<CircleAlert>`（`App.tsx:238`），跟 `commands`／`mode`／`usage` 共用同一顆灰色 ⓘ。
- 預設**收合**（`App.tsx:231`：只有 `message` 和 `error` 預設展開），所以 tokens before→after 看不到。
- 沒有 toast、沒有顏色、沒有分隔線。

截圖裡它就夾在「Commands updated」下面，兩張卡長得一模一樣。**你覺得「不見了」是合理的——它在視覺上等於不存在。**

---

### D4 [P2] 側欄 54 個對話 = 216 顆按鈕，沒有虛擬化也沒有 memo

冒煙實測 `sidebar rows=216`。`renderSessionRow`（`App.tsx:924-948`）每列渲染 open + team + pin + rename + delete，全部內聯在 App 的 render 裡，沒有 `React.memo`。App 任何一個 state 變動（每次串流事件、每次打字）都會重跑全部 216 顆按鈕的 render。

對照：transcript 用了 `react-virtuoso` + `MemoEventCard`，側欄沒有。對話數量會一直長，這條會越來越痛。

---

### D5 [P2] 沒有書籤／跳回自己先前指令的功能

實測列出 `.session-header` 的按鈕：`["搜尋","匯出","在 TUI 開啟","命令"]` — 全部在**右上角**，沒有任何書籤／錨點／跳訊息功能。左上角只有標題文字。確認為缺功能，非壞掉（詳細設計見 §5.1）。

---

### D6 composer 高度上限確認為 50vh

實測：80 行草稿 → composer 470px，viewport 940px，比例 **0.5**。
上限來源三處：`styles.css:618`（`.composer-wrap max-height:50vh`）、`styles.css:624`（`.composer max-height:50vh`）、`shared/composer-autogrow.ts:4`（`MAIN_COMPOSER_MAX_VH = 0.5`）。清空後正確縮回 88px。

---

### 其他通過項

| 項目 | 結果 |
|---|---|
| 冷啟動 | 通過，welcome hero 正常 |
| 真 CLI 串流合併 | 一則回覆 = 2 個 assistant 氣泡（`session-state.ts:56` 有合併邏輯）；可接受但值得再看 |
| 回合完成／狀態藥丸 | 正常（就緒／忙碌／執行中三態都觀察到） |
| 對話內搜尋 | 正常 |
| 命令面板 | 正常 |
| console | **零 error、零 pageerror** |
| CONTEXT 用量列 | 正常（38% 191k/500k） |

---

## 3. 後端安全（Grok 4.5 審查，本人逐條驗證）

以下每條我都用 `grep`／`sed` 對過原始碼，行號正確、逐字原文屬實。

### 3.1 [P1] 配對 PIN 用 `Math.random()` 產生

`src/main/remote-auth.ts:73`
```ts
const pairingSecret = randomBytes(24).toString('base64url')
const pin = String(Math.floor(100000 + Math.random() * 900000))
```
`pairingSecret` 用了 CSPRNG，PIN 卻用 `Math.random()`（V8 xorshift128+，可從少量輸出還原內部狀態）。有 5 次失敗鎖定＋10 次/分 rate limit 擋線上暴力，但 PIN 是第二因子，不該比第一因子弱。
**修法**：`crypto.randomInt(100000, 1000000)`。一行，零風險。

### 3.2 [P1] 沒有 focus 時，snapshot 會回傳「所有 session」的權限卡

`src/main/remote-controller.ts:901`
```ts
.filter((item) => !item.consumed && this.now() <= item.expiresAt)
.filter((item) => !focus || item.sessionId === focus)
```
`!focus` 為真時**完全不過濾**，已配對的手機能在 `/api/snapshot` 看到其他對話的權限標題與選項（工具用途、路徑常在標題裡）。對照 tail 是有收斂的（`remote-controller.ts:924`：`focus ? (this.tails.get(focus) ?? []) : []`），權限卡漏了對稱保護。
**修法**：改成 `focus !== null && item.sessionId === focus`；無 focus 時回空陣列。

### 3.3 [P2] `/api/status` 未認證且每次都跑完整 `getSnapshot()`

`src/main/remote-server.ts:212-221` — 此路由在 cookie 驗證之前，回應本身不含標題／cwd／對話（這點是安全的），但每次呼叫都觸發 `controller.getSnapshot()` → `listSessions()`（磁碟 I/O）。只要有 tunnel URL 就能無限打，對主行程做 I/O 消耗。
**修法**：status 只讀輕量欄位，不呼叫 `getSnapshot()`；加全域 rate limit。

### 3.4 [P2] 配對失敗計數共用 → 可對合法使用者做 DoS

`src/main/remote-auth.ts:121-133` — 錯誤 secret 與錯誤 PIN 共用 `pairing.failures`，累積 5 次就 `pairing.closed = true`。攻擊者只要有 URL，亂送 5 次即可讓你的手機在 TTL 內配不上，必須回桌面重新產生。
**修法**：secret 錯誤與 PIN 錯誤分開計數；桌面顯示「配對遭鎖定」讓使用者知道發生什麼事。

### 3.5 [P2] `parseCookie` 的 `decodeURIComponent` 沒包 try/catch

`src/main/remote-auth.ts:244-250` — 帶 `Cookie: grok_remote_session=%E0%A4%A` 這種非法 percent-encoding 會丟 `URIError`，打成 500。無法越權，但是廉價的錯誤路徑。
**修法**：try/catch 回 `null`（視同未登入 → 401）。

### 3.6 [P2] interject／queue 沒有長度上限，跟 prompt 不對稱

`handlePrompt` 有 `REMOTE_PROMPT_MAX_CHARS`（12000，`remote-controller.ts:655`），`handleInterject`（`:677-691`）和 `handleQueue` 沒有，只受 `BODY_LIMIT` 131072 保護。
**修法**：三者套同一上限；`/api/cancel`、`/api/queue` 加 per-token rate limit。

### 3.7 已確認有防護（Grok 列出、我抽驗過）

只綁 127.0.0.1、Host allowlist 不吃 `X-Forwarded-Host`、無 CORS／OPTIONS 403、突變需 `Content-Type: application/json` + `x-grok-remote`、Cookie `HttpOnly`+`SameSite=Strict`+`Path=/api`、body 上限 131072、session token `randomBytes(32)`、只存 hash、PIN 走 scrypt+salt、比對用 `timingSafeEqual`、配對成功會 `sessions.clear()`、72h 絕對 TTL、`revokeAll()` 真的清、無 SSE／長輪詢殘留、tail buffer 有 items/bytes 雙上限、手機預設不可核准權限、建立 session 的 cwd 限制在既有 union、`/api/upload` 明確 404。

### 3.8 【駁回】Grok 報的 P0「靜態檔路徑穿越」——實測不成立

Grok 說 `handleStatic`（`remote-server.ts:459-476`）的 `path.join(webRoot, rel)` 在 Windows 上遇到 `C:/...` 會丟棄 `webRoot`。**那是 `path.resolve` 的行為，`path.join` 不會。** 我實測：

```
"/C:/Windows/win.ini"       → join="C:app\remote-web\C:\Windows\win.ini"   （無效路徑，readFile 失敗）
"/%2e%2e/%2e%2e/secret.txt" → pathname 已被 URL parser 正規化成 "/secret.txt"
"//server/share/x"          → pathname="/share/x" → join 在 webRoot 內
"/..%2f..%2fx"              → blocked=true
```

**沒有穿越。** 不過這份安全是「靠 `path.join` 語意 + WHATWG URL 正規化」意外達成的，不是刻意防禦。建議仍補上收斂（`path.resolve` 後用 `path.relative` 確認不以 `..` 開頭、拒含 `:` 的 segment），列為 P3 加固，**不是漏洞**。

> 附註：Grok 第一輪（範圍給太寬、777+1087 行一次吞）產出的整份報告是**幻覺**——引用 Express 的 `app.use` / `res.status(403)`，但這專案用 `node:http`。收窄到三個檔案並要求逐字貼原文後，第二輪品質就正常了。委派給它時要給窄範圍＋可驗證的輸出要求。

---

## 4. 機械清點（AGY Gemini，本人抽驗）

- **死掉的 IPC 表面**：`setConfigOption`（`grok:config`）與 `previewStat`（`preview:stat`）在 preload 有暴露、main 有 handler，**renderer 從來沒呼叫過**。我用 `grep -rn "setConfigOption\|previewStat" src/renderer/` 驗證確實零筆。建議移除或補用途註解——暴露而未用的 IPC 是多餘的攻擊面。
- **零技術債標記**：整個 `src/` 沒有任何 `TODO`／`FIXME`／`HACK`／`@ts-ignore`／`@ts-expect-error`／`eslint-disable`（我 grep 驗證，確實空）。
- **IPC 三方對照**：其餘 45 條 preload ↔ main ↔ renderer 全部對得上，沒有孤兒 channel。
- **CSS 寫死高度**清單已產出（含 `.composer-wrap:618`、`.composer:623-625` 的 50vh），供 §5.2 改動時對照。

---

## 5. 你指定的四個優化方向：現況與實作規格

### 5.1 對話窗左上角的書籤按鈕（跳回我先前發出的指令）

**現況**：完全沒有。`.session-header` 的四顆按鈕全在右上（搜尋／匯出／TUI／命令）。

**規格建議**
- 位置：`.session-header` 左側，緊貼標題左邊（你指定左上角），圖示 `Bookmark`。
- 資料來源**不需要新的持久化**：`activeEvents.filter(e => e.kind === 'message' && e.role === 'user')` 就是你發過的每一則指令，且 `UiSessionEvent` 已有穩定 `id`。
- 點開是一個下拉清單，每列顯示：序號 + 該則指令前 40 字 + 相對時間。
- 點選 → `virtuoso.current?.scrollToIndex({ index: activeEvents.findIndex(e => e.id === picked), align: 'start', behavior: 'smooth' })`，並且**不要**動 `followTail`（跳過去以後應該維持「不跟隨」，讓使用者停在那裡看）。
- 進階（可選）：手動加星號書籤存進 `settings`，跟自動清單分兩區。但**先做自動清單就能解決你的痛點**，不要一開始就做持久化。
- 鍵盤：建議掛 `Ctrl+Shift+B` 開清單，沿用 `shortcuts.ts` 既有機制。
- 無障礙：下拉用 `role="listbox"`，沿用 `CommandPalette.tsx` 已經寫好的 combobox 模式。

### 5.2 composer 無限高（最多蓋住整個對話框）

**現況**：三處 50vh 上限（見 D6）。

**⚠️ 先修 D1 再做這個。** 目前 composer 一長高，最新訊息就被蓋住而且沒有救回來的按鈕（實測 289px）。放到無限高會變成整個對話被蓋掉。

**規格建議**
1. **先做 D1 的修復**：`syncMainComposerHeight` 執行後，若 `followTail` 為真，呼叫 `virtuoso.current?.scrollToIndex({ index: 'LAST', align: 'end' })` 重新貼底。
2. 上限改成 `MAIN_COMPOSER_MAX_VH`：由常數改成從 `settings` 讀，預設放寬到 `0.9`；同步改掉 `styles.css:618` 與 `:624` 的 `50vh`（三處必須一起改，只改 CSS 或只改 TS 都會被另一邊夾住）。
3. 保留 `TRANSCRIPT_MIN_PX = 120`（`composer-autogrow.ts:9`）當地板——真的做到 100% 會讓 transcript 高度為 0，Virtuoso 在 0 高度下的行為未驗證，風險不值得。實際上限建議 `viewportHeight - TRANSCRIPT_MIN_PX`。
4. 加一顆「收合／展開」小按鈕，長草稿時可以一鍵縮回 88px 看對話——不然打完長指令要看上文只能全選剪下。

### 5.3 上下文壓縮提示

**現況**：卡片有出現、功能正常（0.2.111 實測通過），但視覺上跟一般事件卡無法區分（見 D3）。

**規格建議**（純視覺，不動偵測邏輯）
- 新增 `.event-card.compact` 樣式：走 accent 金色左邊框 + 淡底，跟灰色的 tool／commands 卡明顯分開（亮色主題要一起補，參考 `styles.css:1563` 附近的 `[data-theme='light']` 區塊寫法）。
- 圖示從 fallback `<CircleAlert>` 改成專用的 `<Archive>` 或 `<Minimize2>`，加進 `App.tsx:238` 的 icon 三元鏈。
- **預設展開**：`App.tsx:231` 的 `useState(event.kind === 'message' || event.kind === 'error')` 加上 `|| event.kind === 'compact'`，讓 tokens before→after 直接看得到。
- 加一則 toast：壓縮發生時 `setNotice('已壓縮上下文：191k → 96k tokens')`。既有 toast 機制（`App.tsx:428-435`）12 秒自動消失，剛好。
- 標題補上數字：`formatOfficialCompactTitle`（`compact-infer.ts:153-158`）目前只回文字，建議帶上 before→after。
- 遠端手機端 `remote-controller.ts:1017-1021` 已經有對應的 compact 文字，一併同步。

### 5.4 點進對話預設跳到最新

**現況與你的描述有出入，請看實測**：我做了三次唯讀 probe，進入對話後的落點是——

| 對話 | 事件數 | 內容高度 | 進入後距底部 | 「跳到最新」 |
|---|---|---|---|---|
| `_upstream` | 10 | 2,810px | **0px** | 未顯示 |
| WORDPRESS | 8 | 13,210px | **0px** | 未顯示 |
| n8n（最大） | 3 | 119,636px | **0px** | 未顯示 |

**進入對話時是有跳到底部的**（`followOutput='auto'` 在 replay 時贏了競速）。真正會讓你按「跳到最新」的是 **D2**：版面一變動（視窗縮放、composer 長高），`atBottomStateChange` 送一次 `false` 就把 `followTail` 卡住，人明明在底部按鈕還在。

**規格建議**
1. 修 D2 的狀態卡住：`atBottomStateChange` 的回呼加去抖動（120ms），避免 resize 過程的瞬間 `false` 被當真。
2. 補上明確的初始落點，不要靠競速：`<Virtuoso>` 加 `initialTopMostItemIndex={Math.max(0, activeEvents.length - 1)}`（`App.tsx:2298`）。這樣就算未來 replay 變慢或事件變多也保證落底。
3. `loadSession` 成功後（`App.tsx:1250` 附近）明確補一次 `virtuoso.current?.scrollToIndex({ index: 'LAST', align: 'end' })`。
4. 順手修 D1：composer 高度變化後若 `followTail` 為真就重新貼底。

---

## 6. v0.11 建議施工順序

| 順序 | 項目 | 理由 |
|---|---|---|
| 1 | **D1 + D2 + 5.4**（捲動底部鎖定一次修乾淨） | 5.2 的前置，不修就會被放大 |
| 2 | **5.2 composer 放寬** | 依賴第 1 步 |
| 3 | **5.3 壓縮提示視覺化** | 純 CSS/JSX，低風險，體感提升大 |
| 4 | **5.1 書籤按鈕** | 新功能，獨立，可並行 |
| 5 | **3.1 + 3.2 遙控安全兩條 P1** | 各一行到數行，順手做掉 |
| 6 | D4 側欄虛擬化＋memo、3.3–3.6 P2、4. 移除死 IPC | 品質輪 |

**驗收閘（沿用 v0.10 的教訓：代理跑不了真 GPU／真串流驗證）**
- `npm run verify`（352+ tests）
- `npm run smoke:coldstart`、`work/light_theme_smoke.mjs`
- **`work/v011_layout_shift_probe.mjs` 必須 5/5 狀態都 `fromBottom≈0` 且按鈕狀態正確**——這支是 D1/D2 的迴歸鎖
- `work/v011_scroll_probe.mjs` 對至少 2 個真實對話
- 壓縮提示要用**真 CLI 跑 `/compact`** 驗，不能用 fake ACP
- `npm run smoke:remote-e2e`（改動遙控時）

---

## 7. 給下一輪的注意事項

1. **CLI 版本已漂移**：AGENTS.md 的 ACP 實測基準是 0.2.101，現在本機是 **0.2.111**。這次驗證 compact 的 `_x.ai/session_notification` 仍然有效，其他 extension 行為未逐一重驗。
2. **測試 harness 不可以用 `.session-list button` 取第一列**——釘選群組排最前面，會打到真實對話（§1 的教訓）。要用群組名或 session id 精準指定。
3. **委派 Grok 4.5 要給窄範圍**：一次丟 2000+ 行它會產出幻覺報告；限縮到 3 個檔案＋要求逐字貼原文，品質就正常。
4. **委派 AGY Gemini 做純清點很可靠**：IPC 對照表、grep 清單、CSS 數值表全部抽驗正確。不要給它需要判斷的工作。
