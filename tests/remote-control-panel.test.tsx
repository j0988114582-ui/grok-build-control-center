/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
import { RemoteControlPanel } from '../src/renderer/src/components/RemoteControlPanel'
import type { RemoteDesktopState } from '../src/shared/bridge'

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,qq')
  }
}))

const baseState: RemoteDesktopState = {
  enabled: true,
  banner: 'pairable',
  pin: '123456',
  pairingSecret: 'sec-abc',
  expiresAt: Date.now() + 60_000,
  publicBaseUrl: 'https://example.trycloudflare.com',
  allowPhonePermissions: false,
  experimentalTunnel: true
}

describe('RemoteControlPanel (v0.9 wave3)', () => {
  it('shows Chinese banner, 72h hint, QR, and copy URL when active', async () => {
    const onNotice = vi.fn()
    render(
      <RemoteControlPanel
        active
        state={baseState}
        busy={false}
        permissionMode="ask"
        allowPhonePerms={false}
        useQuickTunnel
        onAllowPhonePerms={vi.fn()}
        onUseQuickTunnel={vi.fn()}
        onNotice={onNotice}
        onEnable={vi.fn()}
        onDisable={vi.fn()}
        onRegenerate={vi.fn()}
        onState={vi.fn()}
        onActiveChange={vi.fn()}
        onBusy={vi.fn()}
      />
    )
    expect(screen.getByTestId('remote-banner').textContent).toMatch(/可配對/)
    expect(screen.getByTestId('remote-ttl-hint').textContent).toMatch(/72/)
    expect(screen.getByTestId('remote-pin').textContent).toMatch(/123456/)
    await waitFor(() => expect(screen.getByTestId('remote-qr')).toBeTruthy())
    expect(screen.getByTestId('remote-pair-url').textContent).toContain('#/pair?t=sec-abc')

    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    fireEvent.click(screen.getByTestId('remote-copy-url'))
    await waitFor(() => expect(onNotice).toHaveBeenCalled())
  })

  it('allows enable while YOLO after confirm (no hard block)', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onEnable = vi.fn().mockResolvedValue(baseState)
    render(
      <RemoteControlPanel
        active={false}
        state={null}
        busy={false}
        permissionMode="always-approve"
        allowPhonePerms={false}
        useQuickTunnel={false}
        onAllowPhonePerms={vi.fn()}
        onUseQuickTunnel={vi.fn()}
        onNotice={vi.fn()}
        onEnable={onEnable}
        onDisable={vi.fn()}
        onRegenerate={vi.fn()}
        onState={vi.fn()}
        onActiveChange={vi.fn()}
        onBusy={vi.fn()}
      />
    )
    const btn = screen.getByTestId('remote-enable')
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    expect(confirmSpy).toHaveBeenCalled()
    expect(onEnable).toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('does not mention YOLO mutex ban in header', () => {
    render(
      <RemoteControlPanel
        active={false}
        state={null}
        busy={false}
        permissionMode="ask"
        allowPhonePerms={false}
        useQuickTunnel={false}
        onAllowPhonePerms={vi.fn()}
        onUseQuickTunnel={vi.fn()}
        onNotice={vi.fn()}
        onEnable={vi.fn()}
        onDisable={vi.fn()}
        onRegenerate={vi.fn()}
        onState={vi.fn()}
        onActiveChange={vi.fn()}
        onBusy={vi.fn()}
      />
    )
    expect(screen.getByTestId('remote-panel').textContent).not.toMatch(/不可與 YOLO/)
  })

  it('warns when active pair URL is loopback (phone cannot open)', async () => {
    render(
      <RemoteControlPanel
        active
        state={{
          ...baseState,
          publicBaseUrl: 'http://127.0.0.1:54321',
          experimentalTunnel: false
        }}
        busy={false}
        permissionMode="ask"
        allowPhonePerms={false}
        useQuickTunnel={false}
        onAllowPhonePerms={vi.fn()}
        onUseQuickTunnel={vi.fn()}
        onNotice={vi.fn()}
        onEnable={vi.fn()}
        onDisable={vi.fn()}
        onRegenerate={vi.fn()}
        onState={vi.fn()}
        onActiveChange={vi.fn()}
        onBusy={vi.fn()}
      />
    )
    expect(screen.getByTestId('remote-loopback-warn').textContent).toMatch(/手機掃此 QR 進不去/)
    expect(screen.getByTestId('remote-banner').textContent).toMatch(/loopback/)
    await waitFor(() => expect(screen.getByTestId('remote-pair-url').textContent).toContain('127.0.0.1'))
  })

  it('shows pre-enable loopback warning when Quick Tunnel unchecked', () => {
    render(
      <RemoteControlPanel
        active={false}
        state={null}
        busy={false}
        permissionMode="ask"
        allowPhonePerms={false}
        useQuickTunnel={false}
        onAllowPhonePerms={vi.fn()}
        onUseQuickTunnel={vi.fn()}
        onNotice={vi.fn()}
        onEnable={vi.fn()}
        onDisable={vi.fn()}
        onRegenerate={vi.fn()}
        onState={vi.fn()}
        onActiveChange={vi.fn()}
        onBusy={vi.fn()}
      />
    )
    expect(screen.getByTestId('remote-loopback-prewarn').textContent).toMatch(/手機掃碼會連不上/)
  })
})
