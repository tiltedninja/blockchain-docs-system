// app.js - Cleaned & updated per request
(async function() {
  // ===== Configuration =====
  const CONFIG = {
    AES_KEY_SIZE: 256,
    AES_IV_SIZE: 128,
    PBKDF2_ITERATIONS: 100000,
    SIGNATURE_THRESHOLD: 0.60, // 60% similarity required
    CONSENSUS_THRESHOLD: 2,
    MAX_FILE_SIZE: 50 * 1024 * 1024,
    SIGNATURE_RESAMPLE_POINTS: 32,
    VIEWER_TIMEOUT_SECONDS: 300, // 5 minutes
    VIEWER_WARNING_SECONDS: 60
  };

  // ===== State =====
  const state = {
    txs: [],
    nextId: 1,
    referenceSignature: null,
    signaturePoints: [],
    currentFile: null,
    tempDecrypted: null,
    validators: [
      { id: 'val-1', name: 'Validator 1', status: 'pending' },
      { id: 'val-2', name: 'Validator 2', status: 'pending' },
      { id: 'val-3', name: 'Validator 3', status: 'pending' }
    ],
    viewerTimerInterval: null
  };

  // ===== DOM Elements =====
  const fileInput = document.getElementById('fileInput');
  const dropArea = document.getElementById('dropArea');
  const browseBtn = document.getElementById('browseBtn');
  const txList = document.getElementById('txList');
  const txModal = document.getElementById('txModal');
  const txDetail = document.getElementById('txDetail');
  const closeTxModal = document.getElementById('closeTxModal');
  const searchTx = document.getElementById('searchTx');
  const statusFilter = document.getElementById('statusFilter');
  const cameraModal = document.getElementById('cameraModal');
  const video = document.getElementById('video');
  const captureCanvas = document.getElementById('captureCanvas');
  const shutter = document.getElementById('shutter');
  const useCapture = document.getElementById('useCapture');
  const retake = document.getElementById('retake');
  const ocrPreview = document.getElementById('ocrPreview');
  const ocrText = document.getElementById('ocrText');
  const avatarBtn = document.getElementById('avatarBtn');
  const userDropdown = document.getElementById('userDropdown');
  const consensusPanel = document.getElementById('consensusPanel');
  const consensusBar = document.getElementById('consensusBar');
  const consensusText = document.getElementById('consensusText');
  const signatureModal = document.getElementById('signatureModal');
  const signatureCanvas = document.getElementById('signatureCanvas');
  const clearSignature = document.getElementById('clearSignature');
  const saveSignature = document.getElementById('saveSignature');
  const signatureStatus = document.getElementById('signatureStatus');
  const closeSignature = document.getElementById('closeSignature');
  const setupModal = document.getElementById('setupSignatureModal');
  const setupCanvas = document.getElementById('setupCanvas');
  const sigCount = document.getElementById('sigCount');
  const clearSetup = document.getElementById('clearSetup');
  const saveSetup = document.getElementById('saveSetup');
  const passwordModal = document.getElementById('passwordModal');
  const decryptPassword = document.getElementById('decryptPassword');
  const confirmDecrypt = document.getElementById('confirmDecrypt');
  const closePassword = document.getElementById('closePassword');
  const cancelDecrypt = document.getElementById('cancelDecrypt');
  const viewerModal = document.getElementById('viewerModal');
  const viewerContent = document.getElementById('viewerContent');
  const viewerInfo = document.getElementById('viewerInfo');
  const viewerTimer = document.getElementById('viewerTimer');
  const closeViewer = document.getElementById('closeViewer');

  // ===== Utility: Detect Mobile =====
  function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  // ===== Cryptographic Utilities =====
  async function sha256(data) {
    const buffer = data instanceof ArrayBuffer ? data : new TextEncoder().encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async function deriveKey(password, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: CONFIG.PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: CONFIG.AES_KEY_SIZE },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptFile(file, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);

    const fileBuffer = await file.arrayBuffer();
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      fileBuffer
    );

    const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    result.set(salt, 0);
    result.set(iv, salt.length);
    result.set(new Uint8Array(encrypted), salt.length + iv.length);

    return {
      encrypted: result.buffer,
      originalHash: await sha256(fileBuffer),
      salt: Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join(''),
      iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('')
    };
  }

  async function decryptFile(encryptedData, password, saltHex, ivHex) {
    try {
      const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
      const iv = new Uint8Array(ivHex.match(/.{2}/g).map(b => parseInt(b, 16)));

      const key = await deriveKey(password, salt);

      const encryptedArray = new Uint8Array(encryptedData);
      const encrypted = encryptedArray.slice(28).buffer;

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        encrypted
      );

      return decrypted;
    } catch (e) {
      throw new Error('Decryption failed: Invalid password or corrupted data');
    }
  }

  // ===== Signature Utilities =====
  function initSignatureCanvas(canvas, onDraw) {
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let points = [];

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height)
      };
    }

    function start(e) {
      e.preventDefault();
      // reset points when starting a new stroke/signature
      points = [];
      drawing = true;
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      points.push({ x: pos.x, y: pos.y, t: Date.now() });
    }

    function draw(e) {
      if (!drawing) return;
      e.preventDefault();
      const pos = getPos(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      points.push({ x: pos.x, y: pos.y, t: Date.now() });
    }

    function end() {
      if (!drawing) return;
      drawing = false;
      ctx.closePath();
      if (onDraw) onDraw(points);
    }

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', end);
    canvas.addEventListener('mouseleave', end);

    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);

    return {
      clear: () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        points = [];
      },
      getPoints: () => [...points],
      toImageData: () => ctx.getImageData(0, 0, canvas.width, canvas.height)
    };
  }

  // ===== Signature comparison helpers =====
  function resampleSignature(points, n = CONFIG.SIGNATURE_RESAMPLE_POINTS) {
    if (!points || points.length < 2) return [];

    const sorted = [...points].sort((a, b) => (a.t || 0) - (b.t || 0));

    let totalLength = 0;
    const lengths = [0];
    for (let i = 1; i < sorted.length; i++) {
      const dx = sorted[i].x - sorted[i - 1].x;
      const dy = sorted[i].y - sorted[i - 1].y;
      totalLength += Math.sqrt(dx * dx + dy * dy);
      lengths.push(totalLength);
    }

    if (totalLength === 0) return [];

    const resampled = [];
    for (let i = 0; i < n; i++) {
      const targetLength = (i / (n - 1)) * totalLength;

      let idx = 0;
      while (idx < lengths.length - 1 && lengths[idx + 1] < targetLength) {
        idx++;
      }

      if (idx >= sorted.length - 1) {
        resampled.push({ ...sorted[sorted.length - 1] });
      } else {
        const t = (targetLength - lengths[idx]) / (lengths[idx + 1] - lengths[idx] || 1);
        const p1 = sorted[idx];
        const p2 = sorted[idx + 1];
        resampled.push({
          x: p1.x + (p2.x - p1.x) * t,
          y: p1.y + (p2.y - p1.y) * t
        });
      }
    }

    return resampled;
  }

  function normalizeSignature(points) {
    if (!points || points.length === 0) return [];

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    points.forEach(p => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });

    const width = maxX - minX || 1;
    const height = maxY - minY || 1;
    const scale = Math.max(width, height);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    return points.map(p => ({
      x: (p.x - centerX) / scale,
      y: (p.y - centerY) / scale
    }));
  }

  function pointDistance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function compareSignatures(points1, points2) {
    if (!points1 || !points2) return 0;
    if (points1.length < 5 || points2.length < 5) return 0;

    const sig1 = normalizeSignature(resampleSignature(points1));
    const sig2 = normalizeSignature(resampleSignature(points2));

    if (sig1.length === 0 || sig2.length === 0) return 0;

    let totalDist = 0;
    const minLen = Math.min(sig1.length, sig2.length);

    for (let i = 0; i < minLen; i++) {
      totalDist += pointDistance(sig1[i], sig2[i]);
    }

    const avgDist = totalDist / minLen;
    const similarity = Math.max(0, 1 - (avgDist / 0.5));

    return similarity;
  }

  // ===== UI Utilities =====
  function toast(msg, type = 'default', ms = 1800) {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, ms);
  }

  function updateValidatorUI(index, status) {
    const node = document.getElementById(`val-${index + 1}`);
    if (!node) return;
    const statusEl = node.querySelector('.validator-status');

    node.className = `validator-node ${status}`;
    if (statusEl) statusEl.textContent = status;

    if (index < 2) {
      const line = document.querySelectorAll('.connection-line')[index];
      if (line) {
        if (status === 'processing') line.classList.add('active');
        else line.classList.remove('active');
      }
    }
  }

  function updateConsensusProgress(current, total) {
    const pct = (current / total) * 100;
    if (consensusBar) consensusBar.style.width = `${pct}%`;
    if (consensusText) consensusText.textContent = `${current} of ${total} validators approved`;
  }

  // ===== Transaction Management =====
  function makeTx(filename, source, fileType, fileSize, encryptedData, originalHash, salt, iv) {
    const id = `tx_${Date.now().toString(36)}_${state.nextId++}`;
    const now = new Date().toISOString();
    return {
      id,
      filename,
      source,
      fileType,
      fileSize,
      originalHash,
      encryptedData,
      salt,
      iv,
      status: 'pending',
      createdAt: now,
      events: [{ stage: 'uploaded', at: now }],
      signatures: [],
      merkleRoot: null,
      signaturePoints: null,
      decryptionPassword: null
    };
  }

  async function renderTxList() {
    const q = (searchTx?.value || '').toLowerCase().trim();
    const status = statusFilter?.value || '';
    txList.innerHTML = '';

    const filtered = state.txs.filter(t => {
      if (status && t.status !== status) return false;
      if (!q) return true;
      return (t.id + ' ' + t.filename).toLowerCase().includes(q);
    }).slice().reverse();

    if (!filtered.length) {
      txList.innerHTML = `<li class="tx-item" style="animation-delay:0s"><div class="tx-left">No transactions yet</div></li>`;
      return;
    }

    filtered.forEach((tx, index) => {
      const li = document.createElement('li');
      li.className = 'tx-item';
      li.style.animationDelay = `${index * 0.05}s`;

      const icon = tx.fileType?.startsWith('image/') ? '🖼️' :
        tx.fileType === 'application/pdf' ? '📄' :
        tx.fileType?.includes('word') || tx.fileType?.includes('document') ? '📝' :
        tx.fileType?.includes('excel') || tx.fileType?.includes('sheet') || tx.filename?.match(/\.(xls|xlsx|xlsm|csv)$/i) ? '📊' :
        tx.fileType?.includes('text') || tx.filename?.match(/\.(txt|md|rtf)$/i) ? '📃' :
        tx.fileType?.includes('json') || tx.fileType?.includes('xml') ? '📋' :
        tx.fileType?.includes('zip') ? '🗜️' : '📎';

      li.innerHTML = `
        <div class="tx-left" style="display:flex;align-items:center">
          <span class="file-type-icon">${icon}</span>
          <div>
            <strong>${tx.filename}</strong>
            <div class="tx-meta">${new Date(tx.createdAt).toLocaleString()} • ${(tx.fileSize / 1024).toFixed(1)} KB</div>
          </div>
        </div>
        <div class="tx-right" style="display:flex;gap:10px;align-items:center">
          <div class="status-pill ${tx.status==='pending'?'status-pending':tx.status==='confirmed'?'status-confirmed':'status-invalid'}">${tx.status.toUpperCase()}</div>
          <button type="button" class="btn btn-ghost btn-sm view-btn" data-id="${tx.id}" ${tx.status !== 'confirmed' ? 'disabled' : ''}>View</button>
          <button type="button" class="btn btn-ghost btn-sm" data-id="${tx.id}" data-cursor="select">Details</button>
        </div>`;

      li.querySelector('.view-btn')?.addEventListener('click', () => requestView(tx.id));
      li.querySelector('button[data-cursor="select"]')?.addEventListener('click', () => openTxModal(tx.id));
      txList.appendChild(li);
    });
  }

  // ===== PoA Consensus =====
  async function runConsensus(tx) {
    if (!consensusPanel) return;
    consensusPanel.style.display = 'block';
    consensusPanel.scrollIntoView({ behavior: 'smooth' });

    let approved = 0;

    for (let i = 0; i < state.validators.length; i++) {
      updateValidatorUI(i, 'processing');
      updateConsensusProgress(i, state.validators.length);

      await new Promise(r => setTimeout(r, 700 + Math.random() * 600));

      const checks = [
        tx.originalHash && tx.originalHash.length === 64,
        tx.fileSize > 0,
        tx.encryptedData && tx.encryptedData.byteLength > 28
      ];

      let signatureValid = false;

      if (tx.signaturePoints && state.signaturePoints && tx.signaturePoints.length >= 5 && state.signaturePoints.length >= 5) {
        const similarity = compareSignatures(tx.signaturePoints, state.signaturePoints);
        signatureValid = similarity >= CONFIG.SIGNATURE_THRESHOLD;
      }

      const valid = checks.every(c => c) && signatureValid;

      if (valid) {
        updateValidatorUI(i, 'approved');
        approved++;

        const sigHash = await sha256(tx.originalHash + state.validators[i].id + Date.now());
        tx.signatures.push({
          validator: state.validators[i].id,
          signature: sigHash,
          timestamp: Date.now()
        });

        tx.events.push({ stage: `validator_${i + 1}_approved`, at: new Date().toISOString() });
      } else {
        updateValidatorUI(i, 'rejected');
      }

      updateConsensusProgress(i + 1, state.validators.length);
    }

    if (approved >= CONFIG.CONSENSUS_THRESHOLD) {
      tx.status = 'confirmed';
      tx.merkleRoot = await sha256(tx.originalHash + tx.signatures.map(s => s.signature).join(''));
      tx.events.push({ stage: 'confirmed', at: new Date().toISOString() });
      toast('Transaction confirmed by consensus', 'success');
    } else {
      tx.status = 'invalid';
      toast('Consensus failed - transaction rejected', 'error');
    }

    setTimeout(() => {
      consensusPanel.style.display = 'none';
      state.validators.forEach((v, i) => updateValidatorUI(i, 'pending'));
    }, 2000);

    renderTxList();
  }

  // ===== File Viewing with Encryption (single cleaned viewer) =====
  let currentViewTx = null;

  function requestView(txId) {
    const tx = state.txs.find(t => t.id === txId);
    if (!tx) return;

    currentViewTx = tx;
    decryptPassword.value = '';
    passwordModal.setAttribute('aria-hidden', 'false');
  }

  async function decryptAndView() {
    const password = decryptPassword.value || currentViewTx.decryptionPassword;
    if (!password) {
      toast('Please enter password', 'error');
      return;
    }

    const tx = currentViewTx;
    if (!tx) return;

    confirmDecrypt.disabled = true;
    confirmDecrypt.innerHTML = '<span class="spinner"></span> Decrypting...';

    try {
      const decrypted = await decryptFile(tx.encryptedData, password, tx.salt, tx.iv);

      const currentHash = await sha256(decrypted);
      if (currentHash !== tx.originalHash) {
        throw new Error('Integrity check failed - file corrupted');
      }

      passwordModal.setAttribute('aria-hidden', 'true');
      showViewer(tx, decrypted, currentHash);

    } catch (err) {
      toast(err.message, 'error');
      confirmDecrypt.disabled = false;
      confirmDecrypt.textContent = 'View Document';
    }
  }

  // ===== Clean showViewer function (images + pdf + text + download) =====
  // ===== MOBILE-FRIENDLY VERSION =====
  function showViewer(tx, decryptedBuffer, verifiedHash) {
    const blob = new Blob([decryptedBuffer], { type: tx.fileType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    state.tempDecrypted = url;

    viewerContent.innerHTML = '';
    const fileExt = (tx.filename || '').split('.').pop().toLowerCase();
    const mobile = isMobile();
    const ios = isIOS();

    // Images - Mobile Optimized
    if (tx.fileType?.startsWith('image/')) {
      const container = document.createElement('div');
      container.style.cssText = 'width:100%; height:100%; overflow:auto; display:block; padding:8px; box-sizing:border-box; background:#fff; -webkit-overflow-scrolling: touch;';

      const img = document.createElement('img');
      img.src = url;
      img.alt = tx.filename;
      // For mobile: ensure image is viewable with pinch-zoom
      img.style.cssText = mobile ? 
        'display:block; max-width:100%; width:auto; height:auto; transform-origin: center center; transition:transform .15s ease; touch-action: pan-y pinch-zoom;' : 
        'display:block; max-width:100%; height:auto; transform-origin: top center; transition:transform .15s ease;';

      let scale = 1;
      let initialDistance = 0;

      if (mobile) {
        // Mobile: Touch zoom handling
        container.addEventListener('touchstart', (e) => {
          if (e.touches.length === 2) {
            initialDistance = Math.hypot(
              e.touches[0].pageX - e.touches[1].pageX,
              e.touches[0].pageY - e.touches[1].pageY
            );
          }
        }, { passive: true });

        container.addEventListener('touchmove', (e) => {
          if (e.touches.length === 2) {
            e.preventDefault();
            const currentDistance = Math.hypot(
              e.touches[0].pageX - e.touches[1].pageX,
              e.touches[0].pageY - e.touches[1].pageY
            );
            const newScale = Math.max(0.5, Math.min((currentDistance / initialDistance) * scale, 4));
            img.style.transform = `scale(${newScale})`;
          }
        }, { passive: false });

        container.addEventListener('touchend', (e) => {
          if (e.touches.length < 2) {
            // Extract scale from transform
            const transform = img.style.transform;
            const match = transform.match(/scale\(([\d.]+)\)/);
            if (match) scale = parseFloat(match[1]);
          }
        });
      } else {
        // Desktop: Wheel zoom
        container.addEventListener('wheel', (e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            scale *= e.deltaY > 0 ? 0.9 : 1.1;
            scale = Math.max(0.1, Math.min(scale, 5));
            img.style.transform = `scale(${scale})`;
          }
        }, { passive: false });
      }

      container.appendChild(img);
      viewerContent.appendChild(container);
    }
    // PDFs - Mobile vs Desktop handling
    else if (tx.fileType === 'application/pdf' || fileExt === 'pdf') {
      if (mobile) {
        // Mobile: Use PDF.js or provide download option since iframes don't work well
        createMobilePDFView(tx, url, blob);
      } else {
        // Desktop: Use iframe
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.cssText = 'width:100%; height:100%; border:none; display:block;';
        iframe.setAttribute('scrolling', 'yes');
        viewerContent.appendChild(iframe);
      }
    }
    // Text-like files
    else if (
      tx.fileType?.startsWith('text/') ||
      ['json', 'xml', 'html', 'css', 'js', 'md', 'txt', 'rtf'].includes(fileExt) ||
      tx.fileType?.includes('json') || tx.fileType?.includes('xml')
    ) {
      const pre = document.createElement('pre');
      pre.style.cssText = 'width:100%; height:100%; overflow:auto; background:#1e1e1e; color:#d4d4d4; padding:20px; margin:0; font-family:monospace; font-size:13px; white-space:pre-wrap; word-wrap:break-word; -webkit-overflow-scrolling: touch;';
      const reader = new FileReader();
      reader.onload = (e) => {
        let content = e.target.result;
        if (fileExt === 'json' || tx.fileType?.includes('json')) {
          try {
            content = JSON.stringify(JSON.parse(content), null, 2);
          } catch (e) {}
        }
        pre.textContent = content;
      };
      reader.readAsText(blob);
      viewerContent.appendChild(pre);
    }
    // Office / download-only
    else {
      createDownloadView(tx, url, blob, '📎', 'This file type must be downloaded for local viewing');
    }

    // Banner (only Close button)
    const banner = document.querySelector('.viewer-security-banner');
    if (banner) {
      banner.innerHTML = `🔒 Secure View • Auto-locks in <span id="viewerTimer"></span> • <button id="closeNow" style="background:rgba(255,0,0,0.12); border:none; color:#fff; padding:6px 10px; border-radius:6px; cursor:pointer; margin-left:10px;">Close</button>`;
      document.getElementById('closeNow')?.addEventListener('click', closeViewerModal);
    }

    viewerInfo.innerHTML = `
      <div><strong>${tx.filename}</strong></div>
      <div style="color:var(--muted);font-size:12px;margin-top:4px">
        Verified Hash: <span style="font-family:monospace">${(verifiedHash || '').substring(0, 16)}...</span>
        • ${tx.signatures.length} signatures • <span style="color:var(--success)">✓ Integrity Verified</span>
      </div>
    `;

    viewerModal.setAttribute('aria-hidden', 'false');

    // Timer
    let remainingSeconds = CONFIG.VIEWER_TIMEOUT_SECONDS;
    updateTimerDisplay(remainingSeconds);

    if (state.viewerTimerInterval) {
      clearInterval(state.viewerTimerInterval);
      state.viewerTimerInterval = null;
    }

    state.viewerTimerInterval = setInterval(() => {
      remainingSeconds--;
      updateTimerDisplay(remainingSeconds);

      if (remainingSeconds === CONFIG.VIEWER_WARNING_SECONDS) {
        // small warning toast, but no extension button exists per request
        toast('⚠️ 1 minute remaining', 'warning', 3500);
      }

      if (remainingSeconds <= 0) {
        clearInterval(state.viewerTimerInterval);
        closeViewerModal();
      }
    }, 1000);
  }

  // Helper for mobile PDF viewing
  function createMobilePDFView(tx, url, blob) {
    const container = document.createElement('div');
    container.style.cssText = 'display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:20px; padding:20px; background:#f8f9fa; overflow-y:auto;';
    
    const icon = document.createElement('div');
    icon.textContent = '📄';
    icon.style.fontSize = '64px';
    
    const info = document.createElement('div');
    info.innerHTML = `<strong>${tx.filename}</strong><br><span style="color:var(--muted); font-size:14px;">${(tx.fileSize / 1024).toFixed(1)} KB • PDF Document</span>`;
    info.style.textAlign = 'center';
    
    const msg = document.createElement('div');
    msg.innerHTML = 'PDF viewing on mobile requires downloading or using an external viewer.<br><span style="font-size:12px; color:#666;">The file will remain encrypted in storage.</span>';
    msg.style.cssText = 'color:var(--muted); font-size:14px; max-width:300px; text-align:center; line-height:1.5;';
    
    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display:flex; gap:10px; flex-direction:column; width:100%; max-width:280px;';
    
    // Open in new tab button (works better on some mobile browsers)
    const openBtn = document.createElement('a');
    openBtn.href = url;
    openBtn.target = '_blank';
    openBtn.className = 'btn';
    openBtn.style.cssText = 'padding:14px 24px; font-size:16px; text-decoration:none; text-align:center;';
    openBtn.innerHTML = '🔍 Open in New Tab';
    
    // Download button
    const downloadBtn = document.createElement('a');
    downloadBtn.href = url;
    downloadBtn.download = tx.filename;
    downloadBtn.className = 'btn btn-outline';
    downloadBtn.style.cssText = 'padding:14px 24px; font-size:16px; text-decoration:none; text-align:center;';
    downloadBtn.innerHTML = '⬇️ Download File';
    
    btnContainer.appendChild(openBtn);
    btnContainer.appendChild(downloadBtn);
    
    container.appendChild(icon);
    container.appendChild(info);
    container.appendChild(msg);
    container.appendChild(btnContainer);
    viewerContent.appendChild(container);
  }

  // Helper for download-only files
  function createDownloadView(tx, url, blob, emoji, message) {
    const container = document.createElement('div');
    container.style.cssText = 'display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:20px;';
    const icon = document.createElement('div');
    icon.textContent = emoji;
    icon.style.fontSize = '64px';
    const info = document.createElement('div');
    info.innerHTML = `<strong>${tx.filename}</strong><br><span style="color:var(--muted); font-size:14px;">${(tx.fileSize / 1024).toFixed(1)} KB</span>`;
    info.style.textAlign = 'center';
    const msg = document.createElement('div');
    msg.textContent = message;
    msg.style.cssText = 'color:var(--muted); font-size:14px; max-width:400px; text-align:center;';
    const downloadBtn = document.createElement('a');
    downloadBtn.href = url;
    downloadBtn.download = tx.filename;
    downloadBtn.className = 'btn';
    downloadBtn.style.cssText = 'padding:12px 24px; font-size:16px;';
    downloadBtn.innerHTML = '⬇️ Download File';
    container.appendChild(icon);
    container.appendChild(info);
    container.appendChild(msg);
    container.appendChild(downloadBtn);
    viewerContent.appendChild(container);
  }

  // Timer display
  function updateTimerDisplay(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const timerEl = document.getElementById('viewerTimer');
    if (timerEl) {
      timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
      if (seconds < 60) {
        timerEl.style.color = '#ff6b6b';
        timerEl.style.fontWeight = 'bold';
      } else {
        timerEl.style.color = '';
        timerEl.style.fontWeight = '';
      }
    }
  }

  function closeViewerModal() {
    if (state.viewerTimerInterval) {
      clearInterval(state.viewerTimerInterval);
      state.viewerTimerInterval = null;
    }

    if (state.tempDecrypted) {
      try { URL.revokeObjectURL(state.tempDecrypted); } catch (e) {}
      state.tempDecrypted = null;
    }

    viewerContent.innerHTML = '';
    viewerInfo.innerHTML = '';
    viewerModal.setAttribute('aria-hidden', 'true');

    confirmDecrypt.disabled = false;
    confirmDecrypt.textContent = 'View Document';

    toast('Document secured - encryption restored', 'success');
  }

  // ===== Signature Setup =====
  let setupSignatures = [];
  let setupCanvasController = null;

  function initSetupSignature() {
    if (!setupCanvas) return;
    setupSignatures = [];
    sigCount.textContent = '1';
    setupCanvasController = initSignatureCanvas(setupCanvas, (points) => {
      saveSetup.disabled = points.length < 10;
    });
    saveSetup.onclick = saveSetupSignature;
    clearSetup.onclick = () => {
      setupCanvasController.clear();
      saveSetup.disabled = true;
    };
  }

  async function saveSetupSignature() {
    const points = setupCanvasController.getPoints();
    if (points.length < 10) {
      toast('Please draw a longer signature', 'error');
      return;
    }
    const imageData = setupCanvasController.toImageData();
    setupSignatures.push({ points: [...points], imageData });

    if (setupSignatures.length < 3) {
      sigCount.textContent = (setupSignatures.length + 1).toString();
      setupCanvasController.clear();
      saveSetup.disabled = true;
      toast(`Signature ${setupSignatures.length} saved. Draw again.`, 'success');
    } else {
      state.signaturePoints = averageSignatures(setupSignatures.map(s => s.points));
      state.referenceSignature = setupSignatures[0].imageData;

      setupModal.setAttribute('aria-hidden', 'true');
      toast('Signature profile created successfully', 'success');

      localStorage.setItem('hasSignature', 'true');
      try {
        localStorage.setItem('signaturePoints', JSON.stringify(state.signaturePoints));
      } catch (e) {
        console.warn('Failed to save signature profile', e);
      }
    }
  }

  function averageSignatures(signatures) {
    const base = signatures[0];
    const averaged = [];
    for (let i = 0; i < base.length; i += Math.ceil(base.length / CONFIG.SIGNATURE_RESAMPLE_POINTS)) {
      let avgX = 0, avgY = 0;
      signatures.forEach(sig => {
        const idx = Math.min(i, sig.length - 1);
        avgX += sig[idx].x;
        avgY += sig[idx].y;
      });
      averaged.push({ x: avgX / signatures.length, y: avgY / signatures.length });
    }
    return averaged;
  }

  // ===== Upload with Signature & confirmation =====
  let signatureCanvasController = null;
  let currentUploadFile = null;

  function initSignatureModal() {
    if (!signatureCanvas) return;
    signatureCanvasController = initSignatureCanvas(signatureCanvas, (points) => {
      if (state.signaturePoints && state.signaturePoints.length > 0) {
        const similarity = compareSignatures(points, state.signaturePoints);
        if (similarity >= CONFIG.SIGNATURE_THRESHOLD) {
          signatureStatus.className = 'signature-status match';
          signatureStatus.textContent = `✓ Signature match: ${(similarity * 100).toFixed(0)}%`;
          saveSignature.disabled = false;
        } else {
          signatureStatus.className = 'signature-status nomatch';
          signatureStatus.textContent = `✗ Signature match: ${(similarity * 100).toFixed(0)}% (need ${(CONFIG.SIGNATURE_THRESHOLD * 100).toFixed(0)}%)`;
          saveSignature.disabled = true;
        }
      } else {
        signatureStatus.className = 'signature-status nomatch';
        signatureStatus.textContent = '⚠ No signature profile - please setup first';
        saveSignature.disabled = true;
      }
    });

    clearSignature.onclick = () => {
      signatureCanvasController.clear();
      signatureStatus.className = 'signature-status nomatch';
      signatureStatus.textContent = '';
      saveSignature.disabled = true;
    };

    saveSignature.onclick = confirmUpload;
    closeSignature.onclick = () => {
      signatureModal.setAttribute('aria-hidden', 'true');
      signatureCanvasController.clear();
      currentUploadFile = null;
    };
  }

  async function confirmUpload() {
    if (!currentUploadFile) return;

    // take points from signature canvas
    const uploadPoints = signatureCanvasController.getPoints();

    signatureModal.setAttribute('aria-hidden', 'true');
    consensusPanel.style.display = 'block';

    const password = await sha256(JSON.stringify(uploadPoints));

    try {
      const encrypted = await encryptFile(currentUploadFile, password);

      const tx = makeTx(
        currentUploadFile.name,
        'digital',
        currentUploadFile.type,
        currentUploadFile.size,
        encrypted.encrypted,
        encrypted.originalHash,
        encrypted.salt,
        encrypted.iv
      );
      tx.signaturePoints = [...uploadPoints];
      tx.decryptionPassword = password;
      state.txs.push(tx);
      renderTxList();

      toast('File encrypted and submitted for consensus', 'success');
      await runConsensus(tx);
    } catch (err) {
      toast('Encryption failed: ' + err.message, 'error');
    }

    currentUploadFile = null;
    signatureCanvasController.clear();
  }

  // ===== Camera capture helpers =====
  async function openCamera() {
    cameraModal.setAttribute('aria-hidden', 'false');
    ocrPreview.style.display = 'none';
    useCapture.disabled = true;
    retake.disabled = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
    } catch (e) {
      toast('Camera unavailable', 'error');
      cameraModal.setAttribute('aria-hidden', 'true');
    }
  }

  function capturePhoto() {
    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;
    captureCanvas.getContext('2d').drawImage(video, 0, 0);
    useCapture.disabled = false;
    retake.disabled = false;
    captureCanvas.toBlob((blob) => {
      currentUploadFile = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      ocrText.value = `Captured: ${new Date().toLocaleString()}`;
      ocrPreview.style.display = 'block';
      // Ask user confirmation before upload (per request)
      if (confirm(`Submit captured image (${currentUploadFile.name})? Click OK to proceed to signature.`)) {
        cameraModal.setAttribute('aria-hidden', 'true');
        signatureModal.setAttribute('aria-hidden', 'false');
      } else {
        currentUploadFile = null;
        ocrPreview.style.display = 'none';
      }
    }, 'image/jpeg');
    shutter.style.transform = 'scale(0.95)';
    setTimeout(() => shutter.style.transform = '', 150);
  }

  function submitCapture() {
    if (!currentUploadFile) return;
    stopVideo();
    cameraModal.setAttribute('aria-hidden', 'true');
    signatureModal.setAttribute('aria-hidden', 'false');
  }

  function stopVideo() {
    if (!video) return;
    const s = video.srcObject;
    if (s?.getTracks) s.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }

  // ===== Event Listeners & setup =====
  function setupEventListeners() {
    browseBtn?.addEventListener('click', () => fileInput.click());
    document.getElementById('openUploadBtn')?.addEventListener('click', () => fileInput.click());
    document.getElementById('ctaUpload')?.addEventListener('click', () => fileInput.click());
    document.getElementById('quick-digital')?.addEventListener('click', () => fileInput.click());

    fileInput?.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length) {
        currentUploadFile = files[0];

        if (currentUploadFile.size > CONFIG.MAX_FILE_SIZE) {
          toast('File too large (max 50MB)', 'error');
          currentUploadFile = null;
          fileInput.value = '';
          return;
        }

        // Confirmation before proceeding to signature
        if (confirm(`Upload file: ${currentUploadFile.name}? Click OK to proceed to signature.`)) {
          signatureModal.setAttribute('aria-hidden', 'false');
        } else {
          currentUploadFile = null;
        }
      }
      fileInput.value = '';
    });

    dropArea?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropArea.classList.add('dragover');
    });

    dropArea?.addEventListener('dragleave', () => {
      dropArea.classList.remove('dragover');
    });

    dropArea?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropArea.classList.remove('dragover');
      const files = Array.from(e.dataTransfer.files || []);
      if (files.length) {
        currentUploadFile = files[0];

        if (currentUploadFile.size > CONFIG.MAX_FILE_SIZE) {
          toast('File too large (max 50MB)', 'error');
          currentUploadFile = null;
          return;
        }

        // Confirmation before signature
        if (confirm(`Upload file: ${currentUploadFile.name}? Click OK to proceed to signature.`)) {
          signatureModal.setAttribute('aria-hidden', 'false');
        } else {
          currentUploadFile = null;
        }
      }
    });

    document.getElementById('captureBtn')?.addEventListener('click', openCamera);
    document.getElementById('quick-camera')?.addEventListener('click', openCamera);
    shutter?.addEventListener('click', capturePhoto);
    useCapture?.addEventListener('click', submitCapture);
    retake?.addEventListener('click', () => {
      ocrPreview.style.display = 'none';
      useCapture.disabled = true;
      retake.disabled = true;
      currentUploadFile = null;
    });
    document.getElementById('closeCamera')?.addEventListener('click', () => {
      stopVideo();
      cameraModal.setAttribute('aria-hidden', 'true');
    });

    confirmDecrypt?.addEventListener('click', decryptAndView);
    closePassword?.addEventListener('click', () => {
      passwordModal.setAttribute('aria-hidden', 'true');
      currentViewTx = null;
    });
    cancelDecrypt?.addEventListener('click', () => {
      passwordModal.setAttribute('aria-hidden', 'true');
      currentViewTx = null;
    });

    closeViewer?.addEventListener('click', closeViewerModal);

    closeTxModal?.addEventListener('click', () => {
      txModal.setAttribute('aria-hidden', 'true');
    });
    txModal?.addEventListener('click', (e) => {
      if (e.target === txModal) txModal.setAttribute('aria-hidden', 'true');
    });

    searchTx?.addEventListener('input', renderTxList);
    statusFilter?.addEventListener('change', renderTxList);

    document.getElementById('mb-upload')?.addEventListener('click', () => fileInput.click());
    document.getElementById('ctaHistory')?.addEventListener('click', () => {
      document.getElementById('history')?.scrollIntoView({ behavior: 'smooth' });
    });

    avatarBtn?.addEventListener('click', () => {
      const expanded = avatarBtn.getAttribute('aria-expanded') === 'true';
      avatarBtn.setAttribute('aria-expanded', String(!expanded));
      userDropdown.setAttribute('aria-hidden', String(expanded));
    });

    document.addEventListener('click', (e) => {
      if (!userDropdown?.contains(e.target) && e.target !== avatarBtn) {
        userDropdown?.setAttribute('aria-hidden', 'true');
        avatarBtn?.setAttribute('aria-expanded', 'false');
      }
    });

    document.getElementById('menu-logout')?.addEventListener('click', () => {
      if (confirm('Logout and reset signature profile? You will need to set up your signature again.')) {
        resetSignatureProfile();
      }
    });

    ['menu-settings', 'menu-feedback', 'menu-display', 'menu-help'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        toast(`${id.replace('menu-', '').replace('-', ' ')} clicked`);
      });
    });
  }

  // ===== Transaction Detail Modal =====
  async function openTxModal(id) {
    const tx = state.txs.find(t => t.id === id);
    if (!tx) return;

    txModal.setAttribute('aria-hidden', 'false');

    const fileTypeIcon = tx.fileType?.startsWith('image/') ? '🖼️' :
      tx.fileType === 'application/pdf' ? '📄' : '📎';

    txDetail.innerHTML = `
      <h3>${fileTypeIcon} ${tx.filename}</h3>
      <div class="muted">TxID: <code>${tx.id}</code></div>
      <p class="tx-meta">
        Source: ${tx.source} • 
        Size: ${(tx.fileSize / 1024).toFixed(1)} KB • 
        Type: ${tx.fileType || 'unknown'}<br>
        Created: ${new Date(tx.createdAt).toLocaleString()}
      </p>
      
      <div style="margin-top:12px">
        <strong>Status:</strong> 
        <span class="status-pill ${tx.status === 'pending' ? 'status-pending' : tx.status === 'confirmed' ? 'status-confirmed' : 'status-invalid'}">
          ${tx.status}
        </span>
      </div>
      
      <div style="margin-top:12px">
        <strong>Original Hash (SHA-256):</strong>
        <div style="font-family:monospace;font-size:11px;background:#f1f5f9;padding:8px;border-radius:6px;word-break:break-all;margin-top:4px">
          ${tx.originalHash}
        </div>
      </div>

      <div style="margin-top:12px">
        <strong>Signatures (${tx.signatures.length}/3):</strong>
        <ul style="font-size:12px;margin-top:4px">
          ${tx.signatures.map(s => `<li>${s.validator}: <code style="font-size:10px">${s.signature.substring(0, 20)}...</code></li>`).join('') || '<li>No signatures yet</li>'}
        </ul>
      </div>
      
      <div style="margin-top:12px">
        <strong>Lifecycle:</strong>
        <ol style="font-size:12px;margin-top:4px">
          ${tx.events.map(e => `<li>${e.stage} — ${new Date(e.at).toLocaleTimeString()}</li>`).join('')}
        </ol>
      </div>
      
      <div style="margin-top:16px;display:flex;gap:8px">
        <button type="button" id="copyHash" class="btn btn-outline btn-sm">Copy Hash</button>
        <button type="button" id="exportTx" class="btn btn-sm">Export Transaction</button>
        ${tx.status === 'confirmed' ? `<button type="button" id="viewFileBtn" class="btn btn-sm" data-id="${tx.id}">View File</button>` : ''}
      </div>
    `;

    document.getElementById('copyHash')?.addEventListener('click', () => {
      navigator.clipboard.writeText(tx.originalHash);
      toast('Hash copied to clipboard', 'success');
    });

    document.getElementById('exportTx')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(tx, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tx.id}-transaction.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Transaction exported', 'success');
    });

    document.getElementById('viewFileBtn')?.addEventListener('click', () => {
      txModal.setAttribute('aria-hidden', 'true');
      requestView(tx.id);
    });
  }

  // ===== Reset Signature Profile =====
  function resetSignatureProfile() {
    localStorage.removeItem('hasSignature');
    localStorage.removeItem('signaturePoints');
    state.signaturePoints = [];
    state.referenceSignature = null;
    toast('Signature profile reset', 'success');
    setTimeout(() => {
      location.reload();
    }, 1000);
  }

  // ===== Initialization =====
  async function init() {
    const hasSignature = localStorage.getItem('hasSignature');

    if (hasSignature === 'true') {
      try {
        const storedSig = localStorage.getItem('signaturePoints');
        if (storedSig) {
          state.signaturePoints = JSON.parse(storedSig);
          if (state.signaturePoints.length === 0) throw new Error('Empty signature data');
          toast('Signature profile loaded', 'success');
        } else {
          throw new Error('No signature data found in storage');
        }
      } catch (e) {
        console.warn('Failed to load stored signature:', e);
        localStorage.removeItem('hasSignature');
        localStorage.removeItem('signaturePoints');
        setupModal.setAttribute('aria-hidden', 'false');
        initSetupSignature();
      }
    } else {
      setupModal.setAttribute('aria-hidden', 'false');
      initSetupSignature();
    }

    initSignatureModal();
    setupEventListeners();

    avatarBtn.textContent = 'CSC4';
    renderTxList();
    toast('System initialized. Ready for secure document processing.', 'success');
  }

  init();

})();