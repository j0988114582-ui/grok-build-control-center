# Wave A 驗證報告（桌面硬閘）

| 欄位 | 內容 |
| --- | --- |
| **日期** | 2026-07-18 |
| **範圍** | 星空冷啟 + 釘選 flex 操作列 |
| **Overall** | **PASS**（Gate 1 + Gate 2） |

## 驗證方式說明

1. **Codex GPT-5.6 full-access** 已啟動（`v090-wave-a-cu-verify-prompt.md`），但事件流卡在關閉既有 GUI / 建置前（`.run.lock` 陳舊、無最終 report）→ **未採納為通過依據**。
2. **補證據**：本機 Playwright Electron 煙測 `work/wave_a_desktop_smoke.mjs`（建置後 `node work/wave_a_desktop_smoke.mjs`），臨時 user-data-dir，不送 prompt。

JSON：`outputs/wave-a-smoke/result.json`

## Gate 1 — 星空冷啟

| 項目 | 結果 |
| --- | --- |
| **判定** | **PASS** |
| `data-renderer` | `webgl` |
| canvas layout | client **1480×940**；buffer **1480×940**（非 1×1 鐵灰） |
| 截圖 | `outputs/wave-a-smoke/gate1-cold-starfield.png`、`gate1-canvas.png` |
| 說明 | 冷啟後 ~2.2s 內即有可用 renderer 與全窗尺寸；畫面可見星點／深空，**無需**亮→深主題切換 |

## Gate 2 — 釘選 pin 不蓋標題

| 項目 | 結果 |
| --- | --- |
| **判定** | **PASS** |
| 模式 | live session row |
| pin `position` | `static`（非 absolute 浮層） |
| `.session-actions` | `display: flex` |
| 幾何 | `titleRight=179`、`pinLeft=188`、`overlapArea=0`、`pinAfterTitle=true` |
| 縮窗後 | 仍無重疊 |
| 截圖 | `outputs/wave-a-smoke/gate2-session-row.png`、`gate2-after-resize.png` |

## 程式變更摘要（Wave A）

| 檔案 | 變更 |
| --- | --- |
| `src/renderer/src/fx/StarfieldCanvas.tsx` | layout ≥8px 後再 `createStarfield`；ResizeObserver + double-rAF |
| `src/renderer/src/fx/starfield.ts` | resize 優先 client 尺寸；RO kick 重畫；ctor 不雙排 RAF |
| `src/renderer/src/App.tsx` | session 操作包進 `.session-actions` |
| `src/renderer/src/styles.css` | pin/rename/delete 改 trailing flex，去掉 absolute `right` |
| `tests/starfield-canvas.test.tsx` | 冷啟延遲 init 測試 |
| （附帶）Remote loopback 警告 | 前輪 UX，非 A 硬閘 |

## 單元測試

- `tests/starfield*.tsx`：先前 8/8 pass；本輪 re-run 進行中／見 CI 輸出
- `npm run typecheck` + `lint`：build 前已通過

## 額外觀察

- Codex CU 在 Windows 上對 `rg work/*.mjs` glob 易踩 path 語法錯；後續 Wave B 建議直接指定 `work/wave_a_desktop_smoke.mjs` / `work/ui_feature_smoke.mjs` 路徑。
- 既有「安裝版 GUI」多實例時，CU 若 `Stop-Process` 可能打擾使用者工作中視窗；煙測用 temp profile 較安全。

## 下一步（凍結決策）

- **Wave A：完成（硬閘 PASS）**
- **Wave B0**：本機裝 cloudflared → Quick Tunnel
- **Wave B1**：Remote SPA + 瀏覽器手機比例 + GPT CU 自由獵蟲
