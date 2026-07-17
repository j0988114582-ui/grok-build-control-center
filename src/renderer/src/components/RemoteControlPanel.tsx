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
        <small>單人高風險 · 72h 絕對期限 · 預設 loopback</small>
      </div>
      <p className="drawer-intro">
        可與 YOLO 並用（{YOLO_REMOTE_COEXIST_NOTICE}）。Quick Tunnel 無 SLA，供應商可處理邊緣 HTTPS 內容；URL 變更後書籤失效，需重新掃碼。App 重啟後記憶體 session 清空，必須重配對。
      </p>

      {!active ? (
        <>
          <label className="toggle-row">
            <span><strong>允許手機核准權限</strong><small>預設關閉</small></span>
            <input type="checkbox" checked={allowPhonePerms} onChange={(e) => onAllowPhonePerms(e.target.checked)} />
          </label>
          <label className="toggle-row">
            <span><strong>Quick Tunnel（實驗性）</strong><small>需本機 cloudflared；每次確認風險</small></span>
            <input type="checkbox" checked={useQuickTunnel} onChange={(e) => onUseQuickTunnel(e.target.checked)} />
          </label>
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
                  onNotice(next.experimentalTunnel ? '遠端已啟用（實驗性隧道）' : '遠端已啟用（本機 loopback；外網請自備隧道）')
                })
                .catch((error) => onNotice(error instanceof Error ? error.message : String(error)))
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
            {state?.experimentalTunnel ? ' · 實驗性隧道' : ''}
          </p>
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
              <img src={qrDataUrl} alt="手機遙控配對 QR" width={200} height={200} style={{ borderRadius: 8, background: '#fff' }} />
              <p className="drawer-intro" style={{ marginTop: 6 }}>本機產生 QR（不上網）。密鑰在 URL fragment，不進 query log。</p>
            </div>
          )}
          {pairUrl && (
            <>
              <code data-testid="remote-pair-url" style={{ display: 'block', fontSize: 11, wordBreak: 'break-all' }}>
                {pairUrl}
              </code>
              <button type="button" className="secondary wide" data-testid="remote-copy-url" disabled={busy} onClick={() => void copyPairUrl()} style={{ marginTop: 8 }}>
                {copyDone ? '已複製' : '複製配對網址'}
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
