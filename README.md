# Grok Build Control Center

[![CI](https://github.com/j0988114582-ui/grok-build-control-center/actions/workflows/ci.yml/badge.svg)](https://github.com/j0988114582-ui/grok-build-control-center/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Windows](https://img.shields.io/badge/Windows-10%2F11-blue.svg)]()

> 非官方的 Windows 桌面控制中心，操作你電腦上已安裝的 Grok Build CLI。

Grok Build Control Center 把 Grok Build 的結構化 ACP 介面變成一般人看得懂的 Windows 視窗程式。它是為不想碰終端機的人設計的：選一個專案資料夾、用白話交代任務、在畫面上逐項確認權限，其餘交給 Grok。

本專案與 xAI 無關，也未獲其背書。Grok 與 Grok Build 為其權利人之商標。

## 在 Windows 上安裝

需求：

- Windows 10 或 11（x64）
- 第一次安裝 Grok CLI 與登入時需要網路連線
- 模型由登入帳號的 Grok Build CLI 即時提供；GUI 不把模型名稱寫死，也不另存 API key

步驟：

1. 打開[最新的 GitHub Release](https://github.com/j0988114582-ui/grok-build-control-center/releases/latest)。
2. 下載 `Grok-Build-Control-Center-Setup-<版本>.exe` 與 `SHA256SUMS.txt`（檔名以 Release 頁為準）。
3. 安裝前先核對雜湊：
   ```powershell
   Get-FileHash .\Grok-Build-Control-Center-Setup-<版本>.exe -Algorithm SHA256
   ```
4. 結果需與 `SHA256SUMS.txt` 完全一致，再執行安裝程式。
5. 打開程式。若尚未安裝 Grok CLI，按 **安裝 Grok CLI**，確認官方來源後再同意。
6. 在瀏覽器完成 Grok 官方登入，回到程式按 **選資料夾開始**。

目前所有版本皆為社群測試版，尚未程式碼簽章，Windows SmartScreen 可能顯示警告。簽章方案（SignPath Foundation 開源憑證）已選定、發行自動化已就緒，等待憑證核准；進度與驗證方式見 [docs/signing-trust-chain.md](docs/signing-trust-chain.md)。在此之前請務必以 `SHA256SUMS.txt` 核對下載檔案。程式碼簽章列為公開 Roadmap 項目，不會謊稱已完成。

## 第一個任務

1. 按 **選資料夾開始**。
2. 選擇要讓 Grok 處理的資料夾。
3. 在下方輸入框用白話輸入任務，按 Enter 送出。
4. Grok 請求權限時，先讀清楚要做什麼，再從提供的選項中選擇。

實用按鍵：`Ctrl+Shift+P` 開啟命令搜尋、`?` 顯示所有快捷鍵。未送出的文字會在 500 毫秒後自動保留在本機。

貼上剪貼簿圖片時：若本機 Grok ACP 未宣告內嵌圖片支援，程式會把圖存到 Windows 暫存目錄並把**絕對路徑**插入草稿（不會自動加提示句）。

## 目前版本內容（v0.14.1）

- **工具權限看得懂、點得到**：頂欄改成「先問我／全部自動過」兩顆鈕，並說明改檔或跑指令前會先問你；全部自動過仍要確認。側欄可依最近更新／開啟／名稱／執行中排序，也可關掉資料夾分組。
- **預覽跨專案**：側欄已有的專案資料夾可預覽；若檔在工作區外，可按「允許這個資料夾並重試」。對話裡的本機路徑可點開預覽。
- **畫面中文**：歡迎頁與側欄一律「選資料夾開始」；搜尋對話、銀河座艙、已連線、深想／一般／快速。未就緒不再顯示假的綠點「就緒」。
- **切換對話不再重播整段歷史**：同一連線裡已打開過的 Session 切走再切回時沿用快取，Context 用量立即還原，不再堆一排「Grok 正在工作」或跳出「跳到最新 N」；舊載入失敗不能蓋掉較新的成功載入，remote 焦點、斷線重連與延遲到達的過期載入訊號也走同一套防護。
- **專案列＋／影音路徑晶片**：側欄每個專案群組標題旁有「＋」，直接在那個資料夾開新對話；檔案總管拖入影片／音訊會變成路徑晶片（跟圖片一樣）。不做「不在專案底下工作」——Grok ACP 一定要工作目錄。
- **規劃／權限收口**：Esc、停止回合或回合結束會清掉規劃核准窗；權限回覆失敗不再關窗；`/always-approve` 改走 YOLO 確認，不會當普通指令送進 CLI。
- **畫面誠實度**：功能矩陣 Plan／Todos 拆開且誠實標註（未接上的就寫未接上）；抽屜不透明、收合側欄不再漏出控制項、窄窗保留預覽欄。
- **規劃模式核准**：Grok 規劃完成時，GUI 會顯示計畫內容並讓你選「核准，開始實作」／「請它修改」／「放棄這個計畫」。先前 GUI 沒有實作代理端的 `_x.ai/exit_plan_mode` 請求，回合會靜默取消、規劃模式卡住，而且畫面上毫無提示。連線中斷或關閉程式時一律回覆「未核准」，不會因為連線掉了就當成同意開工。
- **側欄「僅顯示活躍的對話」**：只列出最後活動在 N 天內的對話（預設 4 天，設定頁可調 1–30）。**預設關閉**；目前開啟、已釘選與 Agents Team 的對話一律保留。這是檢視功能，不會刪除任何對話——「建議清理」仍沿用既有的 10 天規則，兩個數字互不影響。
- **子代理官方執行清單（只讀）**：背景活動面板會輪詢 `_x.ai/subagent/list_running`，把 CLI 官方回報的執行中子代理合進清單，一個子代理一張卡，附類型／輪數／工具次數／token 用量。CLI 答不出來時退回既有的推估，不會變空白。**不提供取消子代理的按鈕。**
- **Grok 4.6**：已依 [xAI 官方公告](https://x.ai/news/grok-4-6)與[官方模型規格](https://docs.x.ai/developers/grok-4-6)，用 Grok Build CLI `1.0.4` 的真實 ACP 清單驗證；模型選單會顯示帳號實際可用的 Grok 4.6／4.5 與各自推理強度，並可在不送出 prompt 的情況下切換後再切回 4.6。
- **閱讀位置不再被「正在思考」拉走**：只要使用者往上滾動、觸控回看、拖曳捲軸或用鍵盤回看，GUI 會立即暫停自動跟隨；串流思考造成的瞬間「到底部」訊號不會把畫面搶回去。往下回到底部或按「跳到最新」才恢復跟隨。
- **背景任務／Loop 面板**：彙整這個對話的排程迴圈、監視器、子代理與背景指令，可一鍵建立定時任務（`/loop`）；排程迴圈以送出 `scheduler_delete` 指示停止（`session/cancel` 停不掉已分離的迴圈）。順帶顯示 Context／回合數／工具呼叫用量。
- **自主任務入口**：Workflow（`/workflow`）、Goal（`/goal`，可帶 `--budget`）、深度研究（`/deep-research`）三個一等入口卡，含指令預覽、管理指令與能力偵測；面板送出的指令不會動到主輸入框草稿。
- **對話書籤**：列出你在這個對話發過的每則指令，一鍵跳回，不再無限往上滾。
- ACP 原生 session：串流訊息、工具卡片、權限確認、模式與模型切換
- 回合中插話（不中斷）、立刻改做、排隊下一輪；回合完成系統通知
- **手機 QR 遙控（實驗性）**：Quick Tunnel＋PIN 配對、72 小時絕對期限、模型／模式選單、可與 YOLO 並用（手機開 YOLO 需 PIN）
- YOLO（一律核准）權限模式——每次啟動重置為「每次詢問」
- 預覽台：本機圖片／影片／程式碼／HTML 的安全預覽
- 上下文壓縮卡片（官方事件＋推斷備援）、context 用量與週訂閱額度列；服務未提供的項目顯示 `—`
- 經確認後從 xAI 官方文件記載的 Windows 來源安裝 Grok CLI；官方瀏覽器 OAuth 登入與帳號切換
- 依專案分組的對話、釘選、批次刪除、本機改名、搜尋、Markdown 匯出與草稿保存
- 無障礙模型選單、命令面板、語法上色、閱讀優先／深度沉浸、減少動態偏好、Canvas2D 降級
- **Obsidian Voyage 視覺語言**：深色黑曜星空與亮色「晨光星雲」各有專屬背景動畫、歡迎頁 3D 曜石稜鏡、香檳金屬質感元件；星空引擎具備 context 失效自癒與 Canvas2D 永久降級

它不是完整 IDE、不是多模型聊天平台、不是多帳號憑證保管庫，也不取代 Grok Build 的官方認證。程式不儲存帳號 token。不支援的操作會引導到真正的 Grok TUI。

## 畫面與 Demo

真實產品截圖與 Demo GIF 會放在 `docs/assets/`。尚未驗證或可能暴露帳號、提示詞、專案內容的素材不會加入公開 README。

## Roadmap 與支援

- [公開 Roadmap](ROADMAP.md)
- [Windows Beta 測試指南](BETA_TESTING.md)
- [支援與回報方式](SUPPORT.md)
- [版本變更紀錄](CHANGELOG.md)
- [安全政策](SECURITY.md)
- [隱私政策](PRIVACY.md)
- [建置與重現](BUILDING.md)

請使用 GitHub 的 Bug、Feature 或 Beta feedback 表單。安全漏洞請透過 GitHub Security Advisories 私下通報。

## 信任與隱私

- Renderer 沙箱啟用；Node integration 停用
- 型別化、白名單制的 preload bridge
- 無遙測
- 不直接讀取 `auth.json`
- 認證與模型網路流量仍由 Grok CLI 負責
- 本機設定只包含偏好、標題覆寫與未完成草稿
- 第三方相依套件授權全文收錄於發行產物

## 開發

```powershell
npm ci
npm run verify
npm run smoke:ui
npm run package
```

GitHub Actions 會在 Pull Request 自動執行測試、lint、typecheck、build 與 Windows UI smoke test。下載數可用 `node scripts/release-metrics.mjs` 查詢；下載不等同安裝或活躍使用者。

## 架構

- `src/main`：Electron 生命週期、安全 IPC、本機 session 索引、Grok 程序與 ACP client
- `src/preload`：型別化、白名單制的 renderer bridge
- `src/shared`：事件、設定、附件、額度與快捷鍵契約
- `src/renderer`：React 工作台、虛擬化對話、Markdown、搜尋、設定與視覺特效
- `tests`：單元與 renderer 行為測試
- `work`：live CLI 與 Electron smoke 檢查

## 授權

[MIT](LICENSE)

---

# English

> Unofficial Windows desktop control center for the locally installed Grok Build CLI.

Grok Build Control Center turns Grok Build's structured ACP interface into a readable Windows app. Choose a project folder, describe a task in plain language, and review permissions inside the app.

Version 0.14.1 is a convenience and honesty pass on top of 0.14.0: clickable Ask-first / Always-approve permission chips, sidebar sort, preview of listed project folders plus an explicit Allow-this-folder control, and remaining user-facing English converted to Traditional Chinese. Session-switch cache, per-project "+", video/audio path chips, and fail-closed plan/permission behaviour from 0.14.0 remain. Verified against Grok Build CLI 1.0.5. Unsigned community test build.

This project is not affiliated with or endorsed by xAI. Grok and Grok Build are trademarks of their respective owner.

## Install

1. Open the [latest GitHub Release](https://github.com/j0988114582-ui/grok-build-control-center/releases/latest).
2. Download the installer and `SHA256SUMS.txt`.
3. Verify the installer with `Get-FileHash` before opening it.
4. Install without administrator privileges.
5. Complete Grok's official browser sign-in and choose a project.

The current community build is unsigned. Windows SmartScreen may warn. A SignPath Foundation OSS certificate has been selected and the signed-release automation is in place pending approval — see [docs/signing-trust-chain.md](docs/signing-trust-chain.md). Verify downloads against `SHA256SUMS.txt` meanwhile. Code signing is tracked publicly rather than represented as complete.

## Community and maintenance

- [Roadmap](ROADMAP.md)
- [Windows beta testing](BETA_TESTING.md)
- [Support](SUPPORT.md)
- [Changelog](CHANGELOG.md)
- [Security](SECURITY.md)
- [Privacy](PRIVACY.md)
- [Reproducible building](BUILDING.md)

Use the structured GitHub forms for bugs, features, and beta results. Report vulnerabilities privately through GitHub Security Advisories.

## Development

```powershell
npm ci
npm run verify
npm run smoke:ui
npm run package
```

CI runs tests, lint, type checks, builds, and a Windows Electron UI smoke test. Run `node scripts/release-metrics.mjs` for release asset download counts; downloads are not installations or active users.

## License

[MIT](LICENSE)
