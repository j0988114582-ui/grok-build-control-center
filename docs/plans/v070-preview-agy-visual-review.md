# Grok Build Control Center 0.7.0 Preview Dock — AGY Visual Review Report

**Date**: 2026-07-16  
**Auditor**: AGY 視覺審查（Gemini 3.5 Flash High）  
**Product**: Grok Build Control Center 0.7.0 Preview Dock  
**Target Files**:
- `outputs/preview-smoke/preview-open.png`
- `outputs/preview-smoke/preview-rail.png`
- `src/renderer/src/components/PreviewDock/*`
- `src/renderer/src/styles.css` (Preview Dock Section)
- `src/renderer/index.html` (CSP)

---

## 審查結論 (Verdict)

> [!NOTE]
> **Verdict: Approve-with-nits (核准但有微調建議)**
>
> 預覽台（Preview Dock）的視覺美學、響應式排版、防眩暈設計、四種類型預覽的結構及樣式辨識度、暗色/亮色主題可讀性皆表現極為優異。僅有一項關於 HTML 預覽時腳本受主視窗 CSP 限制的潛在行為衝突，列為 P1 調整建議，其餘完全通過。

---

## 檢查清單核對結果 (Checklist Audit)

| 檢查項目 | 審查狀態 | 詳細說明與事實 |
| :--- | :---: | :--- |
| **1. 展開／收合不破版、不遮 titlebar** | **Pass** | 預覽台採用了 `.workspace` 的 Grid 佈局（高度為 `calc(100% - 58px)`），與上方 `titlebar`（高 58px）完全分離，展開或收合均不會遮擋或破壞頂部視窗控制區。收合為 Rail 狀態（寬 40px）時，文字旋轉排列且未讀點與數量標籤顯示正常。 |
| **2. 四種類型預覽可辨** | **Pass** | <ul><li>**圖片 (ImageView)**: 提供視窗符合/原始大小切換、平移及全螢幕 Lightbox（支援 Esc 退出）。</li><li>**影片 (VideoView)**: 帶有 HTML5 原生控制列，且在切換或收合時透過 `active` 自動暫停。</li><li>**HTML (HtmlView)**: 使用沙箱 iframe。在允許腳本時僅給予 `allow-scripts` 且**絕不與 `allow-same-origin` 混用**，安全性設計極佳。</li><li>**程式碼 (CodeView)**: 整合 `highlight.js` 著色，對大於 200KB 的大檔案提供自動純文字降級，避免介面卡頓。</li></ul> |
| **3. 深色可讀** | **Pass** | 深色模式以 `rgba(6, 12, 24, 0.88)` 為底，選中項目及分頁使用暖金黃色 `var(--accent)` (`#e9ad47`)，層級清晰。亮色模式下則正確降級為 `rgba(236, 230, 218, 0.96)` 背景，並將錯誤訊息文字覆寫為深紅色 (`#9b3b34`) 以符合對比度。 |
| **4. 空狀態與錯誤態清楚** | **Pass** | 列表空狀態引導「選檔/掃描」、預覽待命區（`idle`）有專屬圖示與說明、載入中提供 Skeleton 骨架屏、錯誤狀態（`error`）則提供「重試/在檔案總管開啟/系統程式開啟」等多重降級操作。 |
| **5. reduced-motion 下 skeleton 無眩暈** | **Pass** | 當應用程式偵測到 `data-fx-off='true'`（減弱動態）時，`.preview-skeleton` 的 shimmer 動畫會透過 `.app[data-fx-off='true']` 被設定為 `animation: none`，並以降級的靜態背景色 `rgba(255,255,255,.06)` 呈現，完全防眩暈。 |
| **6. 窄幕壓力位可接受（minWidth 1040）** | **Pass** | 整體網格佈局使用 `grid-template-columns: 286px minmax(0, 1fr) var(--preview-col, 0px)`。最窄 1040px 時，若雙側展開，主內容區依然有 394px 的極限寬度且不破版，使用者可輕鬆收合側邊欄（變 48px）或預覽台（變 40px Rail）來獲取寬敞空間。 |

---

## 修正與改進清單 (P0 / P1 List)

### P0 (Blocker / 阻礙發布之嚴重問題)
*無 (None)*

### P1 (Nits / 體驗與架觀改進建議)
* **HTML 預覽之行內腳本執行受父視窗 CSP 阻擋**
  * **問題描述**: `src/renderer/index.html` 中的 CSP 宣告為 `script-src 'self'`，不包含 `'unsafe-inline'`。當 `HtmlView.tsx` 以 `iframe srcDoc={html}` 方式渲染帶有行內腳本的 HTML 檔案時，瀏覽器會將 `srcDoc` 視為繼承父視窗的 CSP，因此即便 UI 勾選了「允許腳本」，行內腳本依然會被 CSP 封鎖而無法執行（Console 會拋出 CSP blocking 錯誤）。
  * **影響範圍**: 含有 inline `<script>` 的本地 HTML 檔案預覽。
  * **建議解決方案**: 未來版本若需要完整執行預覽 HTML 內的行內腳本，建議將 HTML 預覽的 iframe 載入方式由 `srcDoc` 改為 `src="grok-preview://<path>"`。利用 Electron 自訂協定（已在 CSP `img-src` 與 `media-src` 中放行）將其視為獨立來源載入，即可繞過父視窗的 CSP 行內腳本限制，同時保持主程式的安全沙箱隔離。

---

## 簡短中文說明 (Review Summary)

本輪針對 Grok Build Control Center 0.7.0 Preview Dock 的視覺與結構審查**順利通過 (Approve-with-nits)**。

本次新增的 Preview Dock 在細節處理上十分到位，特別是**無障礙動態減弱（reduced-motion）**下的骨架屏動畫停用、**極窄幕 (1040px) 下的主工作區彈性收合防破版設計**，以及對程式碼大檔案（>200KB）的**防卡死純文字降級載入**，均展現了極高的工程品質。

唯一需要留意的是 HTML 預覽的「允許腳本」功能在 Electron 下會因為 `srcDoc` 繼承父層 CSP `script-src 'self'` 而失效。此為安全性防衛下的正常現象，不影響主要功能，已列於 P1 建議中，供下一輪疊代優化。
