/* Mobile remote SPA v0.9 — fragment pairing only; no token in storage. */
(function () {
  const REMOTE_HEADER = 'X-Grok-Remote'
  const $ = (id) => document.getElementById(id)

  const bannerEl = $('banner')
  const pairPanel = $('pair-panel')
  const mainPanel = $('main-panel')
  const bookmarkHint = $('bookmark-hint')
  const pairError = $('pair-error')
  const mainError = $('main-error')
  const pinDisplay = $('pin-display')
  const pinPad = $('pin-pad')
  const pairBtn = $('pair-btn')
  const pinClear = $('pin-clear')
  const sendBtn = $('send-btn')
  const cancelBtn = $('cancel-btn')
  const logoutBtn = $('logout-btn')
  const promptEl = $('prompt')
  const tailEl = $('tail')
  const permissionsEl = $('permissions')
  const noticesEl = $('notices')
  const ttlLabel = $('ttl-label')
  const yoloBadge = $('yolo-badge')
  const sessionDrawer = $('session-drawer')
  const overflowPanel = $('overflow-panel')
  const sessionList = $('session-list')
  const focusStatus = $('focus-status')
  const runningTools = $('running-tools')
  const cwdSelect = $('cwd-select')
  const yoloPinWrap = $('yolo-pin-wrap')
  const yoloPin = $('yolo-pin')

  let pairingSecret = null
  let pinDigits = ''
  let paired = false
  let pollTimer = null
  let pollMs = 2500
  let lastSnap = null

  function setBanner(text) {
    bannerEl.textContent = text
  }

  function showPair() {
    pairPanel.classList.remove('hidden')
    mainPanel.classList.add('hidden')
    bookmarkHint.classList.remove('hidden')
  }

  function showMain() {
    pairPanel.classList.add('hidden')
    mainPanel.classList.remove('hidden')
    bookmarkHint.classList.add('hidden')
  }

  function consumePairingFragment() {
    const hash = location.hash || ''
    const match = hash.match(/^#\/?pair\?(?:.*&)?t=([^&]+)/i) || hash.match(/[?&]t=([^&]+)/i)
    if (match) {
      pairingSecret = decodeURIComponent(match[1])
      history.replaceState(null, '', location.pathname + location.search)
    } else if (!location.hash && !sessionStorage.getItem('grok-remote-seen')) {
      bookmarkHint.classList.remove('hidden')
    }
    try { sessionStorage.setItem('grok-remote-seen', '1') } catch (_) { /* private mode */ }
  }

  function renderPinDisplay() {
    const dots = pinDigits.padEnd(6, '·').slice(0, 8)
    pinDisplay.textContent = dots.split('').join(' ')
  }

  function buildPinPad() {
    pinPad.innerHTML = ''
    ;['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].forEach(function (key) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.textContent = key
      btn.addEventListener('click', function () {
        if (key === '⌫') {
          pinDigits = pinDigits.slice(0, -1)
        } else if (key === '✓') {
          void doPair()
          return
        } else if (pinDigits.length < 8) {
          pinDigits += key
        }
        renderPinDisplay()
      })
      pinPad.appendChild(btn)
    })
    renderPinDisplay()
  }

  async function api(path, options) {
    options = options || {}
    const headers = Object.assign({ Accept: 'application/json' }, options.headers || {})
    if (options.method && options.method !== 'GET') {
      headers['Content-Type'] = 'application/json'
      headers[REMOTE_HEADER] = '1'
    }
    const res = await fetch(path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body,
      credentials: 'same-origin',
      cache: 'no-store'
    })
    let data = null
    try { data = await res.json() } catch (_) { data = null }
    return { res: res, data: data }
  }

  function formatTtl(expiresAt) {
    if (!expiresAt) return null
    const ms = expiresAt - Date.now()
    if (ms <= 0) return '已到期'
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    if (h >= 48) return '剩餘 ' + Math.floor(h / 24) + ' 天'
    if (h >= 1) return '剩餘 ' + h + ' 時 ' + m + ' 分'
    return '剩餘 ' + m + ' 分'
  }

  function focusStatusText(snap) {
    const st = snap.focusStatus || 'none'
    if (st === 'ready') return '焦點就緒'
    if (st === 'loading') return '對話載入中…'
    if (st === 'error') return '焦點錯誤：' + (snap.focusError || '')
    return '尚未選定對話'
  }

  async function refreshStatus() {
    const { data } = await api('/api/status')
    if (!data) {
      setBanner('無法連線（請回電腦確認遙控已啟用）')
      bookmarkHint.classList.remove('hidden')
      showPair()
      return
    }
    if (data.paired) {
      paired = true
      setBanner('已配對')
      showMain()
      startPolling()
    } else if (data.pairable || pairingSecret) {
      setBanner(data.pairable ? '可配對（請輸入 PIN）' : '等待桌面開啟配對')
      showPair()
    } else {
      setBanner('遠端待命／請在桌面啟用並顯示 QR')
      showPair()
    }
  }

  async function doPair() {
    pairError.textContent = ''
    if (!pairingSecret) {
      pairError.textContent = '缺少配對密鑰，請重新掃描桌面 QR 或更新書籤'
      bookmarkHint.classList.remove('hidden')
      return
    }
    const pin = pinDigits.trim()
    if (!pin) {
      pairError.textContent = '請輸入 PIN'
      return
    }
    pairBtn.disabled = true
    try {
      const { res, data } = await api('/api/pair', {
        method: 'POST',
        body: JSON.stringify({ pairingSecret: pairingSecret, pin: pin })
      })
      if (!res.ok) {
        pairError.textContent = (data && data.message) || '配對失敗'
        return
      }
      pairingSecret = null
      pinDigits = ''
      renderPinDisplay()
      paired = true
      setBanner('已配對')
      showMain()
      startPolling()
    } catch (_) {
      pairError.textContent = '網路錯誤'
    } finally {
      pairBtn.disabled = false
    }
  }

  function renderSessions(snap) {
    sessionList.innerHTML = ''
    ;(snap.sessions || []).forEach(function (session) {
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.type = 'button'
      if (session.id === snap.focusSessionId) btn.classList.add('active')
      const title = document.createElement('div')
      if (session.running) {
        const dot = document.createElement('span')
        dot.className = 'dot'
        title.appendChild(dot)
      }
      title.appendChild(document.createTextNode(session.title || session.id.slice(0, 8)))
      const cwd = document.createElement('div')
      cwd.className = 'cwd'
      cwd.textContent = shortCwd(session.cwd)
      btn.appendChild(title)
      btn.appendChild(cwd)
      btn.addEventListener('click', function () {
        void focusSession(session.id)
      })
      li.appendChild(btn)
      sessionList.appendChild(li)
    })
  }

  function shortCwd(cwd) {
    if (!cwd) return ''
    const parts = String(cwd).replace(/\\/g, '/').split('/').filter(Boolean)
    return parts.slice(-2).join('/') || cwd
  }

  function renderSnapshot(snap) {
    if (!snap) return
    lastSnap = snap
    setBanner(snap.paired ? (snap.banner === 'expired' ? '已過期' : '已配對') : '未配對')
    noticesEl.textContent = (snap.notices || []).join(' · ')
    focusStatus.textContent = focusStatusText(snap)

    const ttl = formatTtl(snap.sessionExpiresAt)
    if (ttl) {
      ttlLabel.textContent = ttl
      ttlLabel.classList.remove('hidden')
    } else {
      ttlLabel.classList.add('hidden')
    }

    if (snap.permissionMode === 'always-approve') yoloBadge.classList.remove('hidden')
    else yoloBadge.classList.add('hidden')

    if (snap.running) runningTools.classList.remove('hidden')
    else runningTools.classList.add('hidden')

    renderSessions(snap)

    permissionsEl.innerHTML = ''
    ;(snap.permissions || []).forEach(function (perm) {
      const card = document.createElement('div')
      card.className = 'perm-card'
      const h = document.createElement('h3')
      h.textContent = perm.title || '權限請求'
      card.appendChild(h)
      const p = document.createElement('p')
      p.textContent = perm.summary || ''
      card.appendChild(p)
      const actions = document.createElement('div')
      actions.className = 'perm-actions'
      ;(perm.options || []).forEach(function (opt) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.textContent = opt.name
        btn.addEventListener('click', function () {
          void respondPermission(perm.requestId, opt.optionId)
        })
        actions.appendChild(btn)
      })
      card.appendChild(actions)
      permissionsEl.appendChild(card)
    })

    tailEl.innerHTML = ''
    ;(snap.tail || []).forEach(function (item) {
      const art = document.createElement('article')
      if (item.kind === 'tool') {
        const tool = document.createElement('div')
        tool.className = 'tool'
        tool.textContent = '工具 · ' + (item.status || '') + ' · ' + (item.text || '')
        art.appendChild(tool)
      } else {
        if (item.role) {
          const role = document.createElement('div')
          role.className = 'role'
          role.textContent = item.role === 'user' ? '你' : 'Grok'
          art.appendChild(role)
        }
        const body = document.createElement('div')
        body.textContent = item.text || ''
        art.appendChild(body)
      }
      tailEl.appendChild(art)
    })
    tailEl.scrollTop = tailEl.scrollHeight
  }

  async function pollSnapshot() {
    if (!paired) return
    try {
      const { res, data } = await api('/api/snapshot')
      if (res.status === 401) {
        paired = false
        stopPolling()
        setBanner('工作階段已失效（72h 到期或桌面切斷），請重新配對')
        showPair()
        bookmarkHint.classList.remove('hidden')
        return
      }
      if (res.ok) {
        pollMs = 2500
        renderSnapshot(data)
      } else {
        pollMs = Math.min(10000, pollMs + 1000)
      }
    } catch (_) {
      pollMs = Math.min(10000, pollMs + 1000)
    } finally {
      pollTimer = window.setTimeout(pollSnapshot, pollMs)
    }
  }

  function startPolling() {
    stopPolling()
    pollMs = 2500
    void pollSnapshot()
    void refreshCwdUnion()
  }

  function stopPolling() {
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  async function refreshCwdUnion() {
    try {
      const { res, data } = await api('/api/session/list')
      if (!res.ok || !data) return
      cwdSelect.innerHTML = ''
      ;(data.cwdUnion || []).forEach(function (cwd) {
        const opt = document.createElement('option')
        opt.value = cwd
        opt.textContent = cwd
        cwdSelect.appendChild(opt)
      })
      if (!cwdSelect.options.length) {
        const opt = document.createElement('option')
        opt.value = ''
        opt.textContent = '（無可用專案路徑）'
        cwdSelect.appendChild(opt)
      }
    } catch (_) { /* ignore */ }
  }

  async function postAction(path, body, okMsg) {
    mainError.textContent = ''
    const { res, data } = await api(path, {
      method: 'POST',
      body: JSON.stringify(body || {})
    })
    if (!res.ok) {
      mainError.textContent = (data && data.message) || '操作失敗'
      return false
    }
    if (okMsg) noticesEl.textContent = okMsg
    void pollSnapshot()
    return true
  }

  async function sendPrompt() {
    const text = (promptEl.value || '').trim()
    if (!text) {
      mainError.textContent = '請輸入提示'
      return
    }
    sendBtn.disabled = true
    try {
      const ok = await postAction('/api/prompt', { text: text })
      if (ok) promptEl.value = ''
    } finally {
      sendBtn.disabled = false
    }
  }

  async function cancelTurn() {
    await postAction('/api/cancel', {})
  }

  async function focusSession(sessionId) {
    await postAction('/api/session/focus', { sessionId: sessionId }, '已切換焦點')
  }

  async function respondPermission(requestId, optionId) {
    await postAction('/api/permission/respond', { requestId: requestId, optionId: optionId })
  }

  async function logout() {
    if (!window.confirm('切斷遠端連線？\n切斷後需回電腦重新配對。')) return
    if (!window.confirm('再次確認：真的要切斷嗎？')) return
    await api('/api/logout', { method: 'POST', body: '{}' })
    paired = false
    stopPolling()
    setBanner('已切斷 — 需回電腦重新配對')
    showPair()
    bookmarkHint.classList.remove('hidden')
  }

  function toggle(el) {
    el.classList.toggle('hidden')
  }

  $('sessions-toggle').addEventListener('click', function () {
    overflowPanel.classList.add('hidden')
    toggle(sessionDrawer)
  })
  $('overflow-toggle').addEventListener('click', function () {
    sessionDrawer.classList.add('hidden')
    toggle(overflowPanel)
    void refreshCwdUnion()
  })

  $('interject-btn').addEventListener('click', function () {
    const text = (promptEl.value || '').trim()
    if (!text) { mainError.textContent = '請先在輸入框寫入插話內容'; return }
    void postAction('/api/interject', { text: text }, '已插話').then(function (ok) {
      if (ok) promptEl.value = ''
    })
  })
  $('queue-btn').addEventListener('click', function () {
    const text = (promptEl.value || '').trim()
    if (!text) { mainError.textContent = '請先在輸入框寫入排隊內容'; return }
    void postAction('/api/queue', { text: text }, '已排隊').then(function (ok) {
      if (ok) promptEl.value = ''
    })
  })
  $('donow-btn').addEventListener('click', function () {
    const text = (promptEl.value || '').trim()
    if (!text) { mainError.textContent = '請先在輸入框寫入立刻改做內容'; return }
    void postAction('/api/do-now', { text: text }, '已立刻改做').then(function (ok) {
      if (ok) promptEl.value = ''
    })
  })

  $('set-model-btn').addEventListener('click', function () {
    const modelId = ($('model-id').value || '').trim()
    if (!modelId) { mainError.textContent = '請輸入 modelId'; return }
    const effort = ($('model-effort').value || '').trim()
    void postAction('/api/model', {
      modelId: modelId,
      reasoningEffort: effort || undefined
    }, '已切換模型')
  })
  $('set-mode-btn').addEventListener('click', function () {
    const modeId = ($('mode-id').value || '').trim()
    if (!modeId) { mainError.textContent = '請輸入 modeId'; return }
    void postAction('/api/mode', { modeId: modeId }, '已切換工作模式')
  })
  $('create-session-btn').addEventListener('click', function () {
    const cwd = cwdSelect.value
    if (!cwd) { mainError.textContent = '沒有可用 cwd'; return }
    void postAction('/api/session/create', { cwd: cwd }, '已建立對話')
  })

  $('yolo-on-btn').addEventListener('click', function () {
    yoloPinWrap.classList.remove('hidden')
    const pin = (yoloPin.value || '').trim()
    if (!pin) {
      mainError.textContent = '開啟 YOLO 需輸入 PIN'
      return
    }
    void postAction('/api/yolo/enable', { pin: pin }, '已請求開啟 YOLO')
  })
  $('yolo-off-btn').addEventListener('click', function () {
    void postAction('/api/yolo/disable', {}, '已關閉 YOLO（遙控仍連線）')
  })

  pairBtn.addEventListener('click', function () { void doPair() })
  pinClear.addEventListener('click', function () {
    pinDigits = ''
    renderPinDisplay()
  })
  sendBtn.addEventListener('click', function () { void sendPrompt() })
  cancelBtn.addEventListener('click', function () { void cancelTurn() })
  logoutBtn.addEventListener('click', function () { void logout() })

  buildPinPad()
  consumePairingFragment()
  void refreshStatus()
})()
