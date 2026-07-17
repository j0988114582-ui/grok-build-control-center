# v0.9.0 wave [8] product summary

## Ship status

| 項目 | 狀態 |
| --- | --- |
| Version | **0.9.0** |
| `npm run verify` | PASS（326 tests + lint + typecheck + build） |
| Installer | `outputs/installer/Grok-Build-Control-Center-Setup-0.9.0.exe` |
| Authenticode | **NotSigned** |
| SHA256 | `0C1F96D6474E4FE1D55C737D0C97926799EA9AF335B53033D31DE6C190A441F8` |
| Remote 宣稱 | **實驗** — 真 4G 清單未勾滿（見 `v090-4g-remote-handtest-checklist.md`） |

## Codex 波次閘（本輪）

| Wave | Verdict |
| --- | --- |
| 0 | PASS-with-nits |
| 1 | PASS-with-nits (r9) |
| 2 | PASS-with-nits (r2) |
| 3 | PASS-with-nits |
| 4 | PASS (r3) |
| 5 | PASS-with-nits (r4) |
| 6 | PASS-with-nits |
| 7 | PASS-with-nits |

## 未做 / 硬缺口

1. **真 4G 手測**（發行宣稱遠端完成前必做）
2. cloudflared 完整 checksum 釘選（仍誠實缺口）
3. push 未執行（local only）

## 使用者可做

- 桌面：啟用 Remote、QR、複製 URL、與 YOLO 並用
- 手機 SPA：配對、焦點、prompt、插話／排隊／立刻改做、YOLO PIN
- 打包 installer 本機安裝試用（未簽章）
