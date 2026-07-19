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
  const modelSelectWrap = $('model-select-wrap')
  const modelSelect = $('model-select')
  const effortSelectWrap = $('effort-select-wrap')
  const effortSelect = $('effort-select')
  const modelIdWrap = $('model-id-wrap')
  const modelEffortWrap = $('model-effort-wrap')
  const modeSelectWrap = $('mode-select-wrap')
  const modeSelect = $('mode-select')
  const modeIdWrap = $('mode-id-wrap')

  let pairingSecret = null
  let pinDigits = ''
  let paired = false
  let pollTimer = null
  let pollMs = 2500
  let lastSnap = null
  /** After pair, pick first session once so user is not stuck on「尚未選定對話」. */
  let autoFocusAttempted = false
  /** Consecutive snapshot failures — desktop gone should not freeze silently. */
  let snapshotFailures = 0
  /** Render keys: skip DOM rebuilds when a section did not change (no flicker / selection loss). */
  let lastSessionsKey = ''
  let lastPermissionsKey = ''
  let lastTailKey = ''
  /** Separate keys: a model change must not rebuild (and reset) the mode picker, and vice versa. */
  let lastModelsKey = ''
  let lastModesKey = ''

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
    try {
      const { res, data } = await api('/api/status')
      if (!res.ok || !data) {
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
    } catch (_) {
      setBanner('網路錯誤：無法讀取狀態（請回電腦確認）')
      bookmarkHint.classList.remove('hidden')
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

  function turnLabel(status) {
    if (status === 'running') return '─ 回合開始 ─'
    if (status === 'completed') return '─ 回合完成 ─'
    if (status === 'cancelled') return '─ 回合已取消 ─'
    return '─ 回合結束（' + (status || '') + '）─'
  }

  function renderSnapshot(snap) {
    if (!snap) return
    lastSnap = snap
    setBanner(snap.paired ? (snap.banner === 'expired' ? '已過期' : '已配對') : '未配對')
    noticesEl.textContent = (snap.notices || []).join(' · ')
    focusStatus.textContent = focusStatusText(snap)

    // Running turn → send is not actionable (would 409); interject/queue row is the affordance.
    sendBtn.disabled = !!snap.running
    sendBtn.textContent = snap.running ? '執行中…' : '送出'

    const ttl = formatTtl(snap.sessionExpiresAt)
    if (ttl) {
      ttlLabel.textContent = ttl
      ttlLabel.classList.remove('hidden')
    } else {
      ttlLabel.classList.add('hidden')
    }

    if (snap.permissionMode === 'always-approve') {
      yoloBadge.textContent = 'YOLO'
      yoloBadge.classList.remove('hidden')
    } else if (snap.elevationLocked) {
      yoloBadge.textContent = 'PIN 已鎖'
      yoloBadge.classList.remove('hidden')
    } else {
      yoloBadge.classList.add('hidden')
    }

    if (snap.running) runningTools.classList.remove('hidden')
    else runningTools.classList.add('hidden')

    const sessionsKey = JSON.stringify(snap.sessions || []) + '|' + snap.focusSessionId
    if (sessionsKey !== lastSessionsKey) {
      lastSessionsKey = sessionsKey
      renderSessions(snap)
    }

    renderControls(snap)

    if (
      paired
      && !autoFocusAttempted
      && !snap.focusSessionId
      && Array.isArray(snap.sessions)
      && snap.sessions.length > 0
    ) {
      autoFocusAttempted = true
      void focusSession(snap.sessions[0].id)
    }

    const permissionsKey = JSON.stringify(snap.permissions || [])
    if (permissionsKey === lastPermissionsKey) {
      renderTail(snap)
      return
    }
    lastPermissionsKey = permissionsKey
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

    renderTail(snap)
  }

  function renderTail(snap) {
    const tailKey = JSON.stringify(snap.tail || [])
    if (tailKey === lastTailKey) return
    lastTailKey = tailKey
    const nearBottom = tailEl.scrollHeight - tailEl.scrollTop - tailEl.clientHeight < 96
    tailEl.innerHTML = ''
    ;(snap.tail || []).forEach(function (item) {
      const art = document.createElement('article')
      if (item.kind === 'tool') {
        const tool = document.createElement('div')
        tool.className = 'tool'
        tool.textContent = '工具 · ' + (item.status || '') + ' · ' + (item.text || '')
        art.appendChild(tool)
      } else if (item.kind === 'turn') {
        art.className = 'turn-item'
        const mark = document.createElement('div')
        mark.className = 'turn-mark'
        mark.textContent = turnLabel(item.text)
        art.appendChild(mark)
      } else if (item.kind === 'error') {
        art.className = 'error-item'
        const body = document.createElement('div')
        body.className = 'error-text'
        body.textContent = '錯誤：' + (item.text || '')
        art.appendChild(body)
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
    // Only force-scroll when user was already following the tail
    if (nearBottom) tailEl.scrollTop = tailEl.scrollHeight
  }

  /** Model/mode pickers from snapshot capability cache; manual inputs stay as fallback. */
  function renderControls(snap) {
    const modelsKey = JSON.stringify(snap.models || null)
    if (modelsKey !== lastModelsKey) {
      lastModelsKey = modelsKey
      const models = snap.models
      const hasModels = !!(models && models.availableModels && models.availableModels.length)
      modelSelectWrap.classList.toggle('hidden', !hasModels)
      effortSelectWrap.classList.toggle('hidden', !hasModels)
      modelIdWrap.classList.toggle('hidden', hasModels)
      modelEffortWrap.classList.toggle('hidden', hasModels)
      if (hasModels) {
        modelSelect.innerHTML = ''
        models.availableModels.forEach(function (model) {
          const opt = document.createElement('option')
          opt.value = model.modelId
          opt.textContent = model.name || model.modelId
          if (model.modelId === models.currentModelId) opt.selected = true
          modelSelect.appendChild(opt)
        })
        renderEffortOptions(models)
      }
    }

    const modesKey = JSON.stringify(snap.modes || null)
    if (modesKey !== lastModesKey) {
      lastModesKey = modesKey
      const modes = snap.modes
      const hasModes = !!(modes && modes.availableModes && modes.availableModes.length)
      modeSelectWrap.classList.toggle('hidden', !hasModes)
      modeIdWrap.classList.toggle('hidden', hasModes)
      if (hasModes) {
        modeSelect.innerHTML = ''
        modes.availableModes.forEach(function (mode) {
          const opt = document.createElement('option')
          opt.value = mode.id
          opt.textContent = mode.name || mode.id
          if (mode.id === modes.currentModeId) opt.selected = true
          modeSelect.appendChild(opt)
        })
      }
    }
  }

  function renderEffortOptions(models) {
    const list = (models && models.availableModels) || []
    const chosen = list.find(function (m) { return m.modelId === modelSelect.value }) || list[0]
    effortSelect.innerHTML = ''
    const none = document.createElement('option')
    none.value = ''
    none.textContent = '（預設）'
    effortSelect.appendChild(none)
    ;((chosen && chosen.reasoningEfforts) || []).forEach(function (effort) {
      const opt = document.createElement('option')
      opt.value = effort.value
      opt.textContent = effort.label || effort.value
      if (chosen && effort.value === chosen.currentReasoningEffort) opt.selected = true
      effortSelect.appendChild(opt)
    })
  }

  modelSelect.addEventListener('change', function () {
    renderEffortOptions(lastSnap && lastSnap.models ? lastSnap.models : null)
  })

  /** One-shot snapshot (does NOT schedule poll — avoids duplicate loops / rate limits). */
  async function fetchSnapshotOnce() {
    if (!paired) return
    try {
      const { res, data } = await api('/api/snapshot')
      if (res.status === 401) {
        paired = false
        autoFocusAttempted = false
        stopPolling()
        setBanner('工作階段已失效（72h 到期或桌面切斷），請重新配對')
        showPair()
        bookmarkHint.classList.remove('hidden')
        return
      }
      if (res.ok) {
        pollMs = 2500
        snapshotFailures = 0
        renderSnapshot(data)
      } else {
        pollMs = Math.min(10000, pollMs + 1000)
        noteSnapshotFailure()
      }
    } catch (_) {
      pollMs = Math.min(10000, pollMs + 1000)
      noteSnapshotFailure()
    }
  }

  /** Desktop closed remote / app quit / network drop — say so instead of freezing silently. */
  function noteSnapshotFailure() {
    snapshotFailures += 1
    if (snapshotFailures >= 3) {
      setBanner('連線中斷：連不上電腦（遙控可能已關閉或網路變更），畫面非最新')
    }
  }

  async function pollSnapshot() {
    await fetchSnapshotOnce()
    if (!paired) return
    pollTimer = window.setTimeout(pollSnapshot, pollMs)
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
    try {
      const { res, data } = await api(path, {
        method: 'POST',
        body: JSON.stringify(body || {})
      })
      if (!res.ok) {
        mainError.textContent = (data && data.message) || '操作失敗'
        return false
      }
      if (okMsg) noticesEl.textContent = okMsg
      // Refresh once without spawning a second poll chain
      void fetchSnapshotOnce()
      return true
    } catch (_) {
      mainError.textContent = '網路錯誤，請稍後再試'
      return false
    }
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
      // Stay disabled when the accepted prompt is now running (snapshot will confirm).
      sendBtn.disabled = !!(lastSnap && lastSnap.running)
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
    mainError.textContent = ''
    try {
      const { res, data } = await api('/api/logout', { method: 'POST', body: '{}' })
      if (!res.ok) {
        mainError.textContent = (data && data.message) || '切斷失敗，請重試或在桌面關閉遙控'
        return
      }
      paired = false
      autoFocusAttempted = false
      stopPolling()
      setBanner('已切斷 — 需回電腦重新配對')
      showPair()
      bookmarkHint.classList.remove('hidden')
    } catch (_) {
      mainError.textContent = '切斷時網路錯誤，連線狀態未知，請在桌面確認'
    }
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
    const usingPicker = !modelSelectWrap.classList.contains('hidden')
    const modelId = usingPicker ? modelSelect.value : ($('model-id').value || '').trim()
    if (!modelId) { mainError.textContent = usingPicker ? '請先選擇模型' : '請輸入 modelId'; return }
    const effort = usingPicker ? effortSelect.value : ($('model-effort').value || '').trim()
    void postAction('/api/model', {
      modelId: modelId,
      reasoningEffort: effort || undefined
    }, '已切換模型')
  })
  $('set-mode-btn').addEventListener('click', function () {
    const usingPicker = !modeSelectWrap.classList.contains('hidden')
    const modeId = usingPicker ? modeSelect.value : ($('mode-id').value || '').trim()
    if (!modeId) { mainError.textContent = usingPicker ? '請先選擇工作模式' : '請輸入 modeId'; return }
    void postAction('/api/mode', { modeId: modeId }, '已切換工作模式')
  })
  $('create-session-btn').addEventListener('click', function () {
    const cwd = cwdSelect.value
    if (!cwd) { mainError.textContent = '沒有可用 cwd'; return }
    void postAction('/api/session/create', { cwd: cwd }, '已建立對話')
  })

  $('yolo-on-btn').addEventListener('click', function () {
    // Two-step: first tap reveals the PIN field (guidance, not an error tone).
    if (yoloPinWrap.classList.contains('hidden')) {
      yoloPinWrap.classList.remove('hidden')
      noticesEl.textContent = '請輸入桌面顯示的 PIN，再按一次「開啟 YOLO」'
      yoloPin.focus()
      return
    }
    const pin = (yoloPin.value || '').trim()
    if (!pin) {
      mainError.textContent = '開啟 YOLO 需輸入 PIN'
      yoloPin.focus()
      return
    }
    void postAction('/api/yolo/enable', { pin: pin }, '已請求開啟 YOLO').then(function (ok) {
      if (ok) {
        yoloPin.value = ''
        yoloPinWrap.classList.add('hidden')
      }
    })
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
