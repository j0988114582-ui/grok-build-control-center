import { useEffect, useMemo, useState, type ReactElement } from 'react'
import QRCode from 'qrcode'
import type { AgentPermissionMode } from '../../../shared/types'
import type { RemoteDesktopState } from '../../../shared/bridge'
import {
  REMOTE_START_WHILE_YOLO_CONFIRM,
  YOLO_REMOTE_COEXIST_NOTICE,
  shouldConfirmRemoteStartWhileYolo
} from '../../../shared/remote-yolo-mutex'

const BANNER_ZH: Record<string, string> = {
  off: '關閉',
  starting: '啟動中',
  url_verified: 'URL 已驗證',
  pairable: '可配對',
  paired: '已配對',
  tunnel_failed: '隧道失敗',
  expired: '已過期'
}

export type RemoteControlPanelProps = {
  active: boolean
  state: RemoteDesktopState | null
  busy: boolean
  permissionMode: AgentPermissionMode
  allowPhonePerms: boolean
  useQuickTunnel: boolean
  onAllowPhonePerms: (value: boolean) => void
  onUseQuickTunnel: (value: boolean) => void
  onNotice: (message: string) => void
  onEnable: (opts: {
    allowPhonePermissions: boolean
    useQuickTunnel: boolean
    riskAcknowledged?: boolean
  }) => Promise<RemoteDesktopState>
  onDisable: () => Promise<RemoteDesktopState>
  onRegenerate: () => Promise<RemoteDesktopState>
  onState: (state: RemoteDesktopState) => void
  onActiveChange: (active: boolean) => void
  onBusy: (busy: boolean) => void
}

function bannerLabel(banner: string | undefined): string {
  if (!banner) return '—'
  return BANNER_ZH[banner] ?? banner
}

/** Electron wraps IPC rejections; users should never read that plumbing. */
export function cleanIpcMessage(message: string): string {
  return message.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, '').trim()
}

/**
 * Enable can fail two very different ways and the recovery differs:
 * cloudflared missing (install it) vs tunnel up but the public URL not routing
 * yet (wait and retry — Quick Tunnel has no SLA and rate-limits repeat setups).
 */
export function remoteEnableHint(message: string): string {
  if (/找不到 cloudflared|未找到 cloudflared|ENOENT/i.test(message)) {
    return '。請安裝 cloudflared 至 PATH，或放到 %USERPROFILE%\\.cloudflared\\cloudflared.exe 後重試。'
  }
  if (/health|fetch failed|逾時|timeout/i.test(message)) {
    return '。cloudflared 已啟動，但公網網址還連不上（Quick Tunnel 無 SLA，短時間重複建立可能被限流）。請等幾分鐘再試，或先用本機 loopback 測試。'
  }
  return ''
}

export function RemoteControlPanel(props: RemoteControlPanelProps): ReactElement {
  const {
    active,
    state,
    busy,
    permissionMode,
    allowPhonePerms,
    useQuickTunnel,
    onAllowPhonePerms,
    onUseQuickTunnel,
    onNotice,
    onEnable,
    onDisable,
    onRegenerate,
    onState,
    onActiveChange,
    onBusy
  } = props

  const pairUrl = useMemo(() => {
    if (!state?.publicBaseUrl || !state.pairingSecret) return null
    return `${state.publicBaseUrl}/#/pair?t=${state.pairingSecret}`
  }, [state?.publicBaseUrl, state?.pairingSecret])

  /** Loopback QR only works on this PC — phones hit their own 127.0.0.1. */
  const isLoopbackPairUrl = useMemo(() => {
    if (!state?.publicBaseUrl) return false
    try {
      const host = new URL(state.publicBaseUrl).hostname
      return host === '127.0.0.1' || host === 'localhost' || host === '[::1]'
    } catch {
      return /127\.0\.0\.1|localhost/i.test(state.publicBaseUrl)
    }
  }, [state?.publicBaseUrl])

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copyDone, setCopyDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!pairUrl) {
      setQrDataUrl(null)
      return
    }
    void QRCode.toDataURL(pairUrl, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#1a1814', light: '#ffffff' }
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null)
      })
    return () => { cancelled = true }
  }, [pairUrl])

  const copyPairUrl = async (): Promise<void> => {
    if (!pairUrl) return
    try {
      await navigator.clipboard.writeText(pairUrl)
      setCopyDone(true)
      onNotice('已複製公網／本機配對網址（請更新書籤）')
      window.setTimeout(() => setCopyDone(false), 2_000)
    } catch {
      onNotice('無法寫入剪貼簿，請手動複製下方網址')
    }
  }

  return (
    <div className="settings-section remote-panel" data-testid="remote-panel" style={{ borderTop: '1px dashed var(--line)', paddingTop: '15px', marginTop: '16px' }}>
      <div className="section-title">
        <h3>手機 QR 遙控</h3>
        <small>單人高風險 · 72h 絕對期限 · 手機須 Quick Tunnel</small>
      </div>
      <p className="drawer-intro">
        可與 YOLO 並用（{YOLO_REMOTE_COEXIST_NOTICE}）。伺服器<strong>只綁 127.0.0.1</strong>：未開隧道時 QR 是本機網址，
        <strong>手機掃了無法開啟</strong>（會連到手機自己）。要在 4G／另一台裝置配對，必須勾選下方
        <strong>Quick Tunnel</strong> 且本機已安裝 <code>cloudflared</code>。隧道無 SLA，供應商可處理邊緣 HTTPS 內容；URL 變更後書籤失效。App 重啟後必須重配對。
      </p>

      {!active ? (
        <>
          <label className="toggle-row">
            <span><strong>允許手機核准權限</strong><small>預設關閉</small></span>
            <input type="checkbox" checked={allowPhonePerms} onChange={(e) => onAllowPhonePerms(e.target.checked)} />
          </label>
          <label className="toggle-row">
            <span>
              <strong>Quick Tunnel（實驗性 · 手機必開）</strong>
              <small>需本機 cloudflared（%USERPROFILE%\.cloudflared\ 或 PATH）；每次確認風險</small>
            </span>
            <input
              type="checkbox"
              data-testid="remote-quick-tunnel"
              checked={useQuickTunnel}
              onChange={(e) => onUseQuickTunnel(e.target.checked)}
            />
          </label>
          {!useQuickTunnel && (
            <p className="drawer-intro" data-testid="remote-loopback-prewarn" style={{ color: 'var(--warn, #c4a35a)' }}>
              目前未勾隧道：啟用後 QR 僅供<strong>本機瀏覽器</strong>測試。手機掃碼會連不上配對頁。
            </p>
          )}
          <button
            type="button"
            className="primary wide"
            data-testid="remote-enable"
            disabled={busy}
            onClick={() => {
              if (shouldConfirmRemoteStartWhileYolo(permissionMode)) {
                if (!window.confirm(REMOTE_START_WHILE_YOLO_CONFIRM)) return
              }
              if (useQuickTunnel) {
                const ok = window.confirm(
                  '即將啟用實驗性 Quick Tunnel（無 SLA）。Cloudflare 會終止訪客 TLS 並可能處理提示／權限摘要等內容。確定繼續？'
                )
                if (!ok) return
              } else {
                const ok = window.confirm(
                  '未啟用 Quick Tunnel。配對網址將是 http://127.0.0.1（僅本機）。手機掃 QR 無法進入配對頁。若只想本機測可按確定；若要用手機請先取消並勾選 Quick Tunnel。'
                )
                if (!ok) return
              }
              onBusy(true)
              void onEnable({
                allowPhonePermissions: allowPhonePerms,
                useQuickTunnel,
                riskAcknowledged: useQuickTunnel ? true : undefined
              })
                .then((next) => {
                  onState(next)
                  onActiveChange(true)
                  onNotice(
                    next.experimentalTunnel
                      ? '遠端已啟用（實驗性隧道 · 可用手機掃 QR）'
                      : '遠端已啟用（本機 loopback · 手機掃 QR 無效；請切斷後勾 Quick Tunnel 重開）'
                  )
                })
                .catch((error) => {
                  const msg = cleanIpcMessage(error instanceof Error ? error.message : String(error))
                  onNotice(msg + remoteEnableHint(msg))
                })
                .finally(() => onBusy(false))
            }}
          >
            {busy ? '啟動中…' : '啟用遙控'}
          </button>
        </>
      ) : (
        <>
          <p data-testid="remote-banner">
            狀態：{bannerLabel(state?.banner)}
            {state?.experimentalTunnel ? ' · 實驗性隧道（手機可連）' : ' · 僅本機 loopback'}
          </p>
          {isLoopbackPairUrl && (
            <p
              className="drawer-intro"
              data-testid="remote-loopback-warn"
              role="status"
              style={{
                color: 'var(--warn, #c4a35a)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: '10px 12px',
                marginTop: 8
              }}
            >
              <strong>手機掃此 QR 進不去是正常的。</strong>
              目前網址是本機 <code>127.0.0.1</code>，只在這台電腦的瀏覽器有效。
              請按「切斷遙控」→ 勾選 <strong>Quick Tunnel</strong> → 再啟用（需已安裝 cloudflared），QR 會變成
              <code>https://….trycloudflare.com</code> 後再用手機掃。
            </p>
          )}
          <p className="drawer-intro" data-testid="remote-ttl-hint">
            配對 session 絕對期限 <strong>72 小時</strong>（無閒置斷線）。到期或 App 重啟後需重新配對。
          </p>
          {state?.pin && (
            <p data-testid="remote-pin">
              PIN：<strong style={{ fontSize: '1.4em', letterSpacing: '0.12em' }}>{state.pin}</strong>
              <small style={{ display: 'block', marginTop: 4 }}>配對與手機開啟 YOLO 皆用此碼，直到重新產生</small>
            </p>
          )}
          {qrDataUrl && (
            <div data-testid="remote-qr" style={{ margin: '12px 0', textAlign: 'center' }}>
              <img
                src={qrDataUrl}
                alt={isLoopbackPairUrl ? '本機測試配對 QR（手機無效）' : '手機遙控配對 QR'}
                width={200}
                height={200}
                style={{ borderRadius: 8, background: '#fff', opacity: isLoopbackPairUrl ? 0.72 : 1 }}
              />
              <p className="drawer-intro" style={{ marginTop: 6 }}>
                {isLoopbackPairUrl
                  ? '本機測試 QR（手機掃了無效）。密鑰在 URL fragment。'
                  : '公網配對 QR（本機產生、不上第三方 QR API）。密鑰在 URL fragment，不進 query log。'}
              </p>
            </div>
          )}
          {pairUrl && (
            <>
              <code data-testid="remote-pair-url" style={{ display: 'block', fontSize: 11, wordBreak: 'break-all' }}>
                {pairUrl}
              </code>
              <button type="button" className="secondary wide" data-testid="remote-copy-url" disabled={busy} onClick={() => void copyPairUrl()} style={{ marginTop: 8 }}>
                {copyDone ? '已複製' : isLoopbackPairUrl ? '複製本機測試網址' : '複製配對網址'}
              </button>
            </>
          )}
          {!pairUrl && state?.publicBaseUrl && (
            <p className="drawer-intro">公網／本機基底：{state.publicBaseUrl}（等待配對碼…）</p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                onBusy(true)
                void onRegenerate()
                  .then((next) => {
                    onState(next)
                    onNotice('已重新產生配對碼（舊 PIN 失效；書籤若綁舊 URL 請更新）')
                  })
                  .catch((error) => onNotice(error instanceof Error ? error.message : String(error)))
                  .finally(() => onBusy(false))
              }}
            >
              重新產生配對
            </button>
            <button
              type="button"
              className="secondary"
              data-testid="remote-disable"
              disabled={busy}
              onClick={() => {
                if (!window.confirm('切斷遠端遙控將立即撤銷手機 session。確定？')) return
                onBusy(true)
                void onDisable()
                  .then((next) => {
                    onState(next)
                    onActiveChange(false)
                    onNotice('已關閉遠端遙控')
                  })
                  .catch((error) => onNotice(error instanceof Error ? error.message : String(error)))
                  .finally(() => onBusy(false))
              }}
            >
              切斷遙控
            </button>
          </div>
        </>
      )}
    </div>
  )
}
