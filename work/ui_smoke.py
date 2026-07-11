import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

OUTPUT = Path(r"C:\Users\111\Documents\Codex\2026-07-11\grok-build-cli-gui\outputs\grok-build-gui-preview.png")

MOCK = r"""
window.__emitEvent = () => {};
window.__emitPermission = () => {};
window.grokApi = {
  getStatus: async () => ({ executable: 'C:\\Users\\111\\.grok\\bin\\grok.exe', found: true, version: '0.2.93', connected: true }),
  connect: async () => ({ loadSession: true, promptCapabilities: { image: false }, sessionCapabilities: {}, modes: [{ id: 'plan', name: 'Plan' }, { id: 'normal', name: 'Normal' }], commands: [{ name: 'compact', description: 'Compact context' }] }),
  listSessions: async () => ([{ id: 's1', cwd: 'C:\\Users\\111\\Documents\\WORDPRESS-Workspace', title: 'Fix tests', updatedAt: '2026-07-11T08:00:00Z' }]),
  getSettings: async () => ({ grokExecutable: 'C:\\Users\\111\\.grok\\bin\\grok.exe', theme: 'dark', fontSize: 15, lineHeight: 1.65, contentWidth: 920, shortcuts: [] }),
  saveSettings: async (x) => x,
  createSession: async () => ({ sessionId: 'new' }),
  loadSession: async () => ({ models: { currentModelId: 'grok-4.5', availableModels: [{ modelId: 'grok-4.5', name: 'Grok 4.5', currentReasoningEffort: 'high', reasoningEfforts: [{ id: 'high', value: 'high', label: 'High Effort', default: true },{ id: 'low', value: 'low', label: 'Low Effort' }] }] } }),
  sendPrompt: async () => {}, cancel: async () => {}, setMode: async () => {}, setModel: async () => {}, setConfigOption: async () => {}, respondPermission: async () => {},
  chooseDirectory: async () => null, chooseFiles: async () => [], exportSession: async () => null, openTui: async () => {}, openExternal: async () => {},
  onEvent: (cb) => { window.__emitEvent = cb; return () => {}; },
  onPermission: (cb) => { window.__emitPermission = cb; return () => {}; },
  onStatus: () => () => {}
};
"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1480, "height": 940}, device_scale_factor=1)
    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.add_init_script(script=MOCK)
    page.goto("http://127.0.0.1:4173")
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("Fix tests")).to_be_visible()
    expect(page.get_by_text("Grok 0.2.93", exact=False)).to_be_visible()
    page.get_by_text("Fix tests").click()
    page.wait_for_timeout(150)
    expect(page.get_by_label("Model")).to_have_value("grok-4.5")
    expect(page.get_by_label("Reasoning effort")).to_have_value("high")
    page.evaluate("""() => {
      window.__emitEvent({ id:'u', sessionId:'s1', kind:'message', role:'user', text:'請檢查目前的實作與測試狀態。' });
      window.__emitEvent({ id:'a', sessionId:'s1', kind:'message', role:'assistant', text:'## 檢查結果\\n\\n核心測試已執行，以下是目前的結構化事件摘要。' });
      window.__emitEvent({ id:'t', sessionId:'s1', kind:'tool', toolCallId:'tool-1', title:'Run test suite', status:'completed', rawInput:{ command:'npm test' }, output:'22 tests passed' });
      window.__emitEvent({ id:'p', sessionId:'s1', kind:'plan', entries:[{ content:'Verify ACP session replay', status:'completed' },{ content:'Package Windows installer', status:'in_progress' }] });
      window.__emitEvent({ id:'done', sessionId:'s1', kind:'turn', status:'completed', stopReason:'end_turn' });
    }""")
    expect(page.get_by_text("檢查結果")).to_be_visible()
    page.keyboard.press("Control+f")
    expect(page.get_by_placeholder("搜尋目前對話…")).to_be_visible()
    page.get_by_placeholder("搜尋目前對話…").fill("測試")
    page.evaluate("""() => window.__emitPermission({ requestId:'permission-1', sessionId:'s1', title:'Run harmless smoke command', options:[{ optionId:'once', name:'Allow once', kind:'allow_once' },{ optionId:'reject', name:'Reject', kind:'reject_once' }] })""")
    expect(page.get_by_text("ACTION REQUIRES APPROVAL")).to_be_visible()
    expect(page.get_by_text("Allow once")).to_be_visible()
    page.get_by_text("Allow once").click()
    expect(page.get_by_text("ACTION REQUIRES APPROVAL")).not_to_be_visible()
    page.screenshot(path=str(OUTPUT), full_page=True)
    print(json.dumps({"screenshot": str(OUTPUT), "console_errors": errors, "title": page.title()}, ensure_ascii=False))
    browser.close()
