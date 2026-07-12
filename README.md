# Grok Build Control Center

> 非官方的 Windows 桌面控制中心，操作你電腦上已安裝的 Grok Build CLI。

Grok Build Control Center 把 Grok Build 的結構化 ACP 介面變成一般人看得懂的 Windows 視窗程式。它是為不想碰終端機的人設計的：選一個專案資料夾、用白話交代任務、在畫面上逐項確認權限，其餘交給 Grok。

本專案與 xAI 無關，也未獲其背書。Grok 與 Grok Build 為其權利人之商標。

## 在 Windows 上安裝

需求：

- Windows 10 或 11（x64）
- 第一次安裝 Grok CLI 與登入時需要網路連線

步驟：

1. 打開[最新的 GitHub Release](https://github.com/j0988114582-ui/grok-build-control-center/releases/latest)。
2. 下載 `Grok-Build-Control-Center-Setup-0.3.2.exe` 與 `SHA256SUMS.txt`。
3. 安裝前先核對雜湊。PowerShell 指令：
   ```powershell
   Get-FileHash .\Grok-Build-Control-Center-Setup-0.3.2.exe -Algorithm SHA256
   ```
   結果需與 `SHA256SUMS.txt` 內的值完全一致。
4. 執行安裝程式。只會安裝在你的 Windows 使用者帳號內，不要求系統管理員權限。
5. 打開程式。若尚未安裝 Grok CLI，按 **安裝 Grok CLI**，確認畫面顯示的官方來源 `https://x.ai/cli/install.ps1` 後再同意。
6. 在瀏覽器完成 Grok 官方登入，回到程式按 **選擇專案開始**。

v0.3.2 為社群測試版，**尚未程式碼簽章**，Windows SmartScreen 可能顯示警告。只有雜湊與 Release 記載完全一致才繼續安裝。程式碼簽章列為發布必要條件追蹤中，不會謊稱已完成。

## 第一個任務

1. 按 **選擇專案開始**。
2. 選擇你要讓 Grok 處理的資料夾。
3. 在下方輸入框用白話輸入任務，按 Enter 送出。
4. Grok 請求權限時，先讀清楚要做什麼，再從提供的選項中選擇。

實用按鍵：`Ctrl+Shift+P` 開啟命令搜尋、`?` 顯示所有快捷鍵。未送出的文字會在 500 毫秒後自動保留在本機。

## v0.3.2 內容

- ACP 原生 session：串流訊息、工具卡片、權限確認、模式與模型切換
- 放大的週訂閱額度摘要（Total／Build／Imagine／API）；服務未提供的項目顯示 `—`，不捏造 0%
- 第一次使用可在確認後，從 xAI 官方文件記載的 Windows 安裝來源一鍵安裝 Grok CLI
- 透過官方瀏覽器 OAuth 安全重新登入，切換目前使用的 Grok 帳號
- 依專案分組的對話清單、本機改名、搜尋、匯出 Markdown、草稿自動保留
- 無障礙的模型選單與可搜尋的命令面板
- 可複製、含語法上色的程式碼區塊
- 「閱讀優先」與「深度沉浸」兩種銀河視覺模式
- 游標特效可關閉，支援減少動態偏好與背景暫停
- 長對話虛擬化捲動；WebGL 不可用時自動退回 Canvas2D

它不是完整 IDE、不是多模型聊天平台、不是多帳號憑證保管庫，也不取代 Grok Build 的官方認證。程式不儲存任何帳號 token。不支援的操作會引導到真正的 Grok TUI，而不是模擬終端機按鍵。

## 信任與隱私

- Renderer 沙箱啟用；Node integration 停用
- 型別化、白名單制的 preload bridge
- 無遙測
- 不直接讀取 `auth.json`
- 認證與模型網路流量仍由 Grok CLI 自行負責
- 本機設定只包含偏好、標題覆寫與未完成草稿
- 第三方相依套件授權全文收錄於 `THIRD_PARTY_NOTICES.txt` 與打包版本中

詳見 [SECURITY.md](SECURITY.md)、[PRIVACY.md](PRIVACY.md)、[BUILDING.md](BUILDING.md)。
要轉傳給第一次使用朋友的白話訊息，見 [outputs/SHARE-MESSAGE.md](outputs/SHARE-MESSAGE.md)。

## 開發

```powershell
npm ci
npm run verify
npm run smoke:ui
npm run package
```

v0.3.2 驗證過的開發環境為 Windows 上的 Node.js 22.22.0 與 npm 10.9.4。可重現的建置步驟與產物驗證見 [BUILDING.md](BUILDING.md)。

## 架構

- `src/main`：Electron 生命週期、安全 IPC、本機 session 索引、Grok 程序與 ACP client
- `src/preload`：型別化、白名單制的 renderer bridge
- `src/shared`：穩定的事件、設定、附件、額度與快捷鍵契約
- `src/renderer`：React 工作台、虛擬化對話、Markdown、搜尋、設定與視覺特效
- `tests`：單元與 renderer 行為測試
- `work`：live CLI 與 Electron smoke 檢查（除非明確指名，不會發送 prompt）

## 授權

[MIT](LICENSE)

---

# English

> Unofficial Windows desktop control center for the locally installed Grok Build CLI.

Grok Build Control Center turns Grok Build's structured ACP interface into a readable Windows app. It is designed for people who do not want to operate a terminal: choose a project folder, describe the task in plain language, and review permissions inside the app.

This project is not affiliated with or endorsed by xAI. Grok and Grok Build are trademarks of their respective owner.

## Install on Windows

Requirements:

- Windows 10 or 11, x64
- An internet connection for first-time Grok CLI setup and sign-in

Steps:

1. Open the [latest GitHub Release](https://github.com/j0988114582-ui/grok-build-control-center/releases/latest).
2. Download `Grok-Build-Control-Center-Setup-0.3.2.exe` and `SHA256SUMS.txt`.
3. Verify the installer checksum before opening it:
   ```powershell
   Get-FileHash .\Grok-Build-Control-Center-Setup-0.3.2.exe -Algorithm SHA256
   ```
4. Run the installer. It installs only for your Windows account and does not request administrator access.
5. Open the app. If Grok CLI is missing, click **安裝 Grok CLI**, review the official `https://x.ai/cli/install.ps1` source notice, and confirm.
6. Complete Grok's browser sign-in, then click **選擇專案開始**.

The v0.3.2 community build is currently unsigned. Windows SmartScreen may show a warning. Only continue if the SHA-256 value matches the release checksum. Code signing is tracked as a release requirement, not represented as complete.

## First task

1. Click **選擇專案開始**.
2. Choose the folder containing the files you want Grok to work on.
3. Type the task in the box at the bottom and press Enter.
4. When Grok asks for permission, read the action and choose one of the offered options.

Useful keys: `Ctrl+Shift+P` opens command search, and `?` shows all shortcuts. Unsent text is saved locally after 500 ms.

## What v0.3.2 includes

- ACP-native sessions, streaming messages, tools, permissions, modes, and models
- Enlarged weekly subscription summary for Total, Build, Imagine, and API; products omitted by the service show `—` instead of a fabricated zero
- Confirmed first-time installation of Grok CLI from xAI's documented Windows installer
- Safe browser OAuth reauthentication for switching the single active Grok account
- Project-grouped sessions, local rename, search, export, and persistent drafts
- Accessible model picker and searchable command palette
- Copyable syntax-highlighted code blocks
- Reading-first and deep-immersion galaxy modes
- Optional cursor effects with reduced-motion and background-pause support
- Virtualized long transcripts and a Canvas2D fallback when WebGL is unavailable

This is not a full IDE, a multi-model chat platform, a multi-account credential vault, or a replacement for Grok Build authentication. The app never stores account tokens. Unsupported operations route to the real Grok TUI instead of simulating terminal keystrokes.

## Trust and privacy

- Renderer sandbox enabled; Node integration disabled
- Typed, allowlisted preload bridge
- No telemetry
- No direct reading of `auth.json`
- Grok CLI remains responsible for authentication and model/network traffic
- Local settings contain preferences, title overrides, and unfinished drafts
- Third-party dependency license texts are included in `THIRD_PARTY_NOTICES.txt` and in packaged builds

See [SECURITY.md](SECURITY.md), [PRIVACY.md](PRIVACY.md), and [BUILDING.md](BUILDING.md).
For a plain-language message you can send to first-time testers, see [outputs/SHARE-MESSAGE.md](outputs/SHARE-MESSAGE.md).

## Development

```powershell
npm ci
npm run verify
npm run smoke:ui
npm run package
```

The verified development environment for v0.3.2 is Node.js 22.22.0 and npm 10.9.4 on Windows. See [BUILDING.md](BUILDING.md) for reproducible steps and artifact verification.

## Architecture

- `src/main`: Electron lifecycle, safe IPC, local session index, Grok process, and ACP client
- `src/preload`: typed, allowlisted renderer bridge
- `src/shared`: stable event, settings, attachment, billing, and shortcut contracts
- `src/renderer`: React workbench, virtualized transcript, Markdown, search, settings, and effects
- `tests`: unit and renderer behavior tests
- `work`: live CLI and Electron smoke checks that do not send a prompt unless explicitly named

## License

[MIT](LICENSE)
