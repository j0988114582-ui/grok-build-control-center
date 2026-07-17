/* Mobile remote SPA — fragment pairing only; no token in storage (R-SEC-1b). */
(function () {
  const REMOTE_HEADER = 'X-Grok-Remote'
  const $ = (id) => document.getElementById(id)
  const bannerEl = $('banner')
  const pairPanel = $('pair-panel')
  const mainPanel = $('main-panel')
  const pairError = $('pair-error')
  const mainError = $('main-error')
  const pinInput = $('pin')
  const pairBtn = $('pair-btn')
  const sendBtn = $('send-btn')
  const cancelBtn = $('cancel-btn')
  const logoutBtn = $('logout-btn')
  const promptEl = $('prompt')
  const tailEl = $('tail')
  const permissionsEl = $('permissions')
  const noticesEl = $('notices')
  const focusLabel = $('focus-label')
  const runningLabel = $('running-label')

  let pairingSecret = null
  let paired = false
  let pollTimer = null
  let pollMs = 2500

  function setBanner(text) {
    bannerEl.textContent = text
  }

  function showPair() {
    pairPanel.classList.remove('hidden')
    mainPanel.classList.add('hidden')
  }

  function showMain() {
    pairPanel.classList.add('hidden')
    mainPanel.classList.remove('hidden')
  }

  /** R-SEC-1b: read fragment, strip immediately, never leave secret in URL/history. */
  function consumePairingFragment() {
    const hash = location.hash || ''
    // #/pair?t=<secret>
    const match = hash.match(/^#\/?pair\?(?:.*&)?t=([^&]+)/i) || hash.match(/[?&]t=([^&]+)/i)
    if (match) {
      pairingSecret = decodeURIComponent(match[1])
      history.replaceState(null, '', location.pathname + location.search)
    }
  }

  async function api(path, options = {}) {
    const headers = Object.assign({ 'Accept': 'application/json' }, options.headers || {})
    if (options.method && options.method !== 'GET') {
      headers['Content-Type'] = 'application/json'
      headers[REMOTE_HEADER] = '1'
    }
    const res = await fetch(path, {
      method: options.method || 'GET',
      headers,
      body: options.body,
      credentials: 'same-origin',
      cache: 'no-store'
    })
    let data = null
    try { data = await res.json() } catch (_) { data = null }
    return { res, data }
  }

  async function refreshStatus() {
    const { data } = await api('/api/status')
    if (!data) return
    if (data.paired) {
      paired = true
      setBanner('已配對')
      showMain()
      startPolling()
    } else if (data.pairable || pairingSecret) {
      setBanner(data.pairable ? '可配對（請輸入 PIN）' : '等待桌面開啟配對')
      showPair()
    } else {
      setBanner('遠端待命 / 請在桌面啟用並顯示 QR')
      showPair()
    }
  }

  async function doPair() {
    pairError.textContent = ''
    if (!pairingSecret) {
      pairError.textContent = '缺少配對密鑰，請重新掃描桌面 QR'
      return
    }
    const pin = (pinInput.value || '').trim()
    if (!pin) {
      pairError.textContent = '請輸入 PIN'
      return
    }
    pairBtn.disabled = true
    try {
      const { res, data } = await api('/api/pair', {
        method: 'POST',
        body: JSON.stringify({ pairingSecret, pin })
      })
      if (!res.ok) {
        pairError.textContent = (data && data.message) || '配對失敗'
        return
      }
      pairingSecret = null
      paired = true
      setBanner('已配對')
      showMain()
      startPolling()
    } catch (err) {
      pairError.textContent = '網路錯誤'
    } finally {
      pairBtn.disabled = false
    }
  }

  function renderSnapshot(snap) {
    if (!snap) return
    focusLabel.textContent = '焦點對話：' + (snap.focusSessionId ? snap.focusSessionId.slice(0, 8) + '…' : '（桌面未選定）')
    runningLabel.textContent = snap.running ? '執行中' : '就緒'
    noticesEl.textContent = (snap.notices || []).join(' · ')

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
      if (item.role) {
        const role = document.createElement('div')
        role.className = 'role'
        role.textContent = item.role === 'user' ? '你' : 'Grok'
        art.appendChild(role)
      }
      const body = document.createElement('div')
      body.textContent = item.text || ''
      art.appendChild(body)
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
        setBanner('工作階段已失效，請重新配對')
        showPair()
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
  }

  function stopPolling() {
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  async function sendPrompt() {
    mainError.textContent = ''
    const text = (promptEl.value || '').trim()
    if (!text) {
      mainError.textContent = '請輸入提示'
      return
    }
    sendBtn.disabled = true
    try {
      const { res, data } = await api('/api/prompt', {
        method: 'POST',
        body: JSON.stringify({ text })
      })
      if (!res.ok) {
        mainError.textContent = (data && data.message) || '送出失敗'
        return
      }
      promptEl.value = ''
      void pollSnapshot()
    } catch (_) {
      mainError.textContent = '網路錯誤'
    } finally {
      sendBtn.disabled = false
    }
  }

  async function cancelTurn() {
    mainError.textContent = ''
    const { res, data } = await api('/api/cancel', { method: 'POST', body: '{}' })
    if (!res.ok) mainError.textContent = (data && data.message) || '停止失敗'
  }

  async function respondPermission(requestId, optionId) {
    mainError.textContent = ''
    const { res, data } = await api('/api/permission/respond', {
      method: 'POST',
      body: JSON.stringify({ requestId, optionId })
    })
    if (!res.ok) mainError.textContent = (data && data.message) || '權限回覆失敗'
    void pollSnapshot()
  }

  async function logout() {
    await api('/api/logout', { method: 'POST', body: '{}' })
    paired = false
    stopPolling()
    setBanner('已切斷')
    showPair()
  }

  pairBtn.addEventListener('click', function () { void doPair() })
  sendBtn.addEventListener('click', function () { void sendPrompt() })
  cancelBtn.addEventListener('click', function () { void cancelTurn() })
  logoutBtn.addEventListener('click', function () { void logout() })
  pinInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') void doPair()
  })

  consumePairingFragment()
  void refreshStatus()
})()
