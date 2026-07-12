# Grok Build Control Center v0.3.2 冒煙報告

日期：2026-07-12（Asia/Taipei）

## PASS

- Grok CLI：`0.2.93 (f00f96316d)`。
- ACP：Grok 4.5（high／medium／low）與 Composer 2.5 capability 可讀。
- Billing：總用量 79%；官方未回產品分項時 UI 固定顯示 `—`，沒有使用假資料或 0% 代替。
- Session：建立、讀 usage、切換模型、切回模型、刪除與索引確認全通過；smoke session 已清除。
- UI：beginner、focus、deep、reduced motion、quota、account switch、cursor、model picker、command palette、shortcuts、sidebar、WebGL 全通過。
- a11y：empty、account-switch-confirmation、session 三個畫面均 0 violations。
- Packaged smoke：直接啟動 `outputs/installer/win-unpacked/Grok Build Control Center.exe` 後重跑同一套 UI/a11y，全部通過。

## 發布界線

- 安裝檔與主程式目前都沒有 Authenticode 簽章，Windows SmartScreen 可能警告。
- 第一次安裝只需要官方 Grok CLI；不需要 Node.js，Windows Terminal 只用於可選的 TUI fallback。
- CLI 沒有 `whoami` 或多帳號 profiles，所以 UI 能安全重新 OAuth 登入，但不能顯示 email 或保存多個帳號。
