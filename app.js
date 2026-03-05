/* app.js — Clean demo (no analytics). Native cursor change used for selectable elements.
   Save index.html, styles.css, app.js together.
*/

(function () {
  // ----- Config -----
  const userInitials = 'CSC4'; // change this to the user's initials if desired

  // ----- Elements -----
  const fileInput = document.getElementById('fileInput');
  const dropArea = document.getElementById('dropArea');
  const browseBtn = document.getElementById('browseBtn');
  const openUploadBtn = document.getElementById('openUploadBtn');
  const ctaUpload = document.getElementById('ctaUpload');
  const quickDigital = document.getElementById('quick-digital');
  const quickCamera = document.getElementById('quick-camera');
  const captureBtn = document.getElementById('captureBtn');
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
  const submitOcr = document.getElementById('submitOcr');
  const closeCamera = document.getElementById('closeCamera');
  const avatarBtn = document.getElementById('avatarBtn');

  // ----- state -----
  const state = { txs: [], nextId: 1 };

  // set avatar initials
  avatarBtn.textContent = userInitials;

  // ---------- Utilities ----------
  function toast(msg, ms=1800) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.cssText = 'position:fixed;right:16px;bottom:96px;background:#111;color:#fff;padding:10px 12px;border-radius:8px;opacity:0.95;z-index:9999';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(()=> t.remove(), ms);
  }

  // ---------- Transactions (simulated) ----------
  function makeTx(filename, source='digital', contentPreview='') {
    const id = `tx_${Date.now().toString(36)}_${state.nextId++}`;
    const now = new Date().toISOString();
    return {
      id, filename, source, contentPreview,
      status:'pending', createdAt: now,
      events: [{ stage: 'uploaded', at: now }],
      confirmations: 0,
      proof: { merkleRoot: null, signatures: [] }
    };
  }

  function renderTxList() {
    const q = (searchTx?.value || '').toLowerCase().trim();
    const status = statusFilter?.value || '';
    txList.innerHTML = '';
    const filtered = state.txs.filter(t => {
      if (status && t.status !== status) return false;
      if (!q) return true;
      return (t.id + ' ' + (t.filename||'') + ' ' + (t.contentPreview||'')).toLowerCase().includes(q);
    }).slice().reverse();
    if (!filtered.length) {
      txList.innerHTML = `<li class="tx-item"><div class="tx-left">No transactions yet</div></li>`;
      return;
    }
    filtered.forEach(tx => {
      const li = document.createElement('li');
      li.className = 'tx-item';
      li.innerHTML = `
        <div class="tx-left">
          <div>
            <strong>${tx.filename}</strong>
            <div class="tx-meta">${new Date(tx.createdAt).toLocaleString()}</div>
          </div>
        </div>
        <div class="tx-right" style="display:flex;gap:10px;align-items:center">
          <div class="status-pill ${tx.status==='pending'?'status-pending':tx.status==='confirmed'?'status-confirmed':'status-invalid'}">${tx.status.toUpperCase()}</div>
          <button class="btn btn-ghost btn-sm" data-id="${tx.id}" data-cursor="select">Details</button>
        </div>`;
      const btn = li.querySelector('button[data-id]');
      btn.addEventListener('click', ()=> openTxModal(tx.id));
      txList.appendChild(li);
    });
  }

  function openTxModal(id) {
    const tx = state.txs.find(t => t.id === id);
    if (!tx) return;
    txModal.setAttribute('aria-hidden','false');
    txDetail.innerHTML = `
      <h3>${tx.filename}</h3>
      <div class="muted">TxID: <code>${tx.id}</code></div>
      <p class="tx-meta">Source: ${tx.source} · Created: ${new Date(tx.createdAt).toLocaleString()}</p>
      <div style="margin-top:12px">
        <strong>Status:</strong> <span class="status-pill ${tx.status==='pending'?'status-pending':tx.status==='confirmed'?'status-confirmed':'status-invalid'}">${tx.status}</span>
      </div>
      <div style="margin-top:10px">
        <strong>Lifecycle:</strong>
        <ol>${tx.events.map(e => `<li>${e.stage} — ${new Date(e.at).toLocaleString()}</li>`).join('')}</ol>
      </div>
      <div style="margin-top:12px">
        <button id="copyProof" class="btn btn-outline" data-cursor="select">Copy TxID</button>
        <button id="exportProof" class="btn" data-cursor="select">Export Proof (JSON)</button>
        <button id="showProof" class="btn btn-ghost" data-cursor="select">Show cryptographic proof</button>
      </div>
      <div id="proofArea" style="margin-top:12px;display:none">
        <pre style="background:#f1f5f9;padding:12px;border-radius:8px;overflow:auto">${JSON.stringify(tx.proof,null,2)}</pre>
      </div>`;
    // wire buttons
    document.getElementById('copyProof').addEventListener('click', ()=> {
      navigator.clipboard?.writeText(tx.id);
      toast('TxID copied');
    });
    document.getElementById('exportProof').addEventListener('click', ()=> {
      const blob = new Blob([JSON.stringify(tx,null,2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${tx.id}-proof.json`; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    });
    document.getElementById('showProof').addEventListener('click', ()=> {
      const area = document.getElementById('proofArea');
      area.style.display = area.style.display === 'none' ? 'block' : 'none';
    });
  }

  function closeModal(modal) { modal.setAttribute('aria-hidden','true'); }
  closeTxModal?.addEventListener('click', ()=> closeModal(txModal));
  txModal?.addEventListener('click', (e) => { if (e.target === txModal) closeModal(txModal); });

  // ---------- Simulated pipeline ----------
  function startProcessing(tx) {
    const stages = [
      { name: 'registered', delay: 600 },
      { name: 'validated', delay: 900 },
      { name: 'hashed_signed', delay: 700 },
      { name: 'merkle_consensus', delay: 1000 },
      { name: 'stored', delay: 400 }
    ];
    tx.events.push({ stage: 'processing_started', at: new Date().toISOString() });

    function run(i) {
      if (i >= stages.length) {
        tx.status = 'confirmed';
        tx.confirmations = 6;
        tx.events.push({ stage: 'confirmed', at: new Date().toISOString() });
        tx.proof.merkleRoot = randomHex(64);
        tx.proof.signatures.push({ node: 'node-1', sig: randomHex(128) });
        renderTxList();
        toast('Transaction confirmed');
        return;
      }
      setTimeout(() => {
        tx.events.push({ stage: stages[i].name, at: new Date().toISOString() });
        renderTxList();
        run(i+1);
      }, stages[i].delay + Math.random()*300);
    }
    run(0);
  }

  function randomHex(len) {
    const arr = new Uint8Array(len/2 || 16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  // ---------- File handling ----------
  dropArea?.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.classList.add('dragover'); });
  dropArea?.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
  dropArea?.addEventListener('drop', (e) => {
    e.preventDefault(); dropArea.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files || []);
    handleFiles(files);
  });

  document.getElementById('browseBtn')?.addEventListener('click', () => fileInput.click());
  openUploadBtn?.addEventListener('click', () => fileInput.click());
  ctaUpload?.addEventListener('click', () => fileInput.click());
  quickDigital?.addEventListener('click', () => fileInput.click());

  fileInput?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
    fileInput.value = '';
  });

  function handleFiles(files) {
    if (!files.length) return;
    files.forEach(f => {
      const tx = makeTx(f.name, 'digital', '');
      state.txs.push(tx);
      renderTxList();
      toast(`Queued ${f.name}`);
      setTimeout(()=> {
        tx.contentPreview = simulateOcrForFile(f);
        tx.events.push({ stage: 'ocr_parsed', at: new Date().toISOString() });
        renderTxList();
      }, 300 + Math.random()*600);
      setTimeout(()=> startProcessing(tx), 900 + Math.random()*800);
    });
  }

  function simulateOcrForFile(f) {
    const ext = (f.name.split('.').pop()||'').toLowerCase();
    if (['png','jpg','jpeg','tiff','pdf'].includes(ext)) {
      return `Simulated OCR text for ${f.name} — REF-${Math.random().toString(36).slice(2,8)}`;
    }
    return `No OCR available for ${f.name}`;
  }

  // ---------- Camera flow ----------
  async function openCamera() {
    cameraModal.setAttribute('aria-hidden','false');
    ocrPreview.setAttribute('aria-hidden','true');
    ocrPreview.style.display = 'none';
    useCapture.disabled = true;
    retake.disabled = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
    } catch (err) {
      toast('Camera unavailable — allow camera or use file upload');
      closeModal(cameraModal);
    }
  }

  shutter?.addEventListener('click', () => {
    const w = video.videoWidth, h = video.videoHeight;
    captureCanvas.width = w; captureCanvas.height = h;
    const ctx = captureCanvas.getContext('2d'); ctx.drawImage(video, 0,0,w,h);
    useCapture.disabled = false; retake.disabled = false;
    const simulated = `Simulated OCR result: captured at ${new Date().toLocaleTimeString()}.`;
    ocrText.value = simulated;
    ocrPreview.style.display = 'block';
    ocrPreview.setAttribute('aria-hidden','false');
  });

  useCapture?.addEventListener('click', () => {
    const name = `capture_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.jpg`;
    const tx = makeTx(name, 'camera', ocrText.value);
    state.txs.push(tx);
    renderTxList();
    toast('Captured and queued');
    stopVideo();
    closeModal(cameraModal);
    setTimeout(()=> startProcessing(tx), 700);
  });

  retake?.addEventListener('click', () => {
    ocrPreview.style.display = 'none';
    useCapture.disabled = true; retake.disabled = true;
  });

  closeCamera?.addEventListener('click', () => { stopVideo(); closeModal(cameraModal); });

  function stopVideo() {
    const s = video.srcObject;
    if (s && s.getTracks) s.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }

  captureBtn?.addEventListener('click', openCamera);
  quickCamera?.addEventListener('click', openCamera);

  // ---------- Search & filter ----------
  searchTx?.addEventListener('input', renderTxList);
  statusFilter?.addEventListener('change', renderTxList);

  // ---------- Mobile nav wiring ----------
  document.getElementById('mb-upload')?.addEventListener('click', () => fileInput.click());
  document.getElementById('ctaHistory')?.addEventListener('click', () => {
    document.getElementById('history')?.scrollIntoView({ behavior:'smooth' });
  });

  // ---------- initial seed ----------
  ['Agreement.pdf','invoice-324.jpg'].forEach((n,i) => {
    const t = makeTx(n, i===1 ? 'camera' : 'digital', `Simulated OCR preview for ${n}`);
    state.txs.push(t);
    setTimeout(()=> startProcessing(t), 400 + i*900);
  });
  renderTxList();

  // accessibility: allow Enter/Space on drop area to open file chooser
  dropArea?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
  });

  // ----- User menu -----
const userBtn = document.getElementById('avatarBtn');
const userDropdown = document.getElementById('userDropdown');

userBtn.addEventListener('click', () => {
  const expanded = userBtn.getAttribute('aria-expanded') === 'true';
  userBtn.setAttribute('aria-expanded', String(!expanded));
  userDropdown.setAttribute('aria-hidden', String(expanded));
});

// close menu on click outside
document.addEventListener('click', (e) => {
  if (!userDropdown.contains(e.target) && e.target !== userBtn) {
    userDropdown.setAttribute('aria-hidden','true');
    userBtn.setAttribute('aria-expanded','false');
  }
});

// handle menu actions
document.getElementById('menu-logout').addEventListener('click', ()=> alert('Logging out...'));
document.getElementById('menu-settings').addEventListener('click', ()=> alert('Open Settings & Privacy'));
document.getElementById('menu-feedback').addEventListener('click', ()=> alert('Open Feedback form'));
document.getElementById('menu-display').addEventListener('click', ()=> alert('Open Display & Accessibility'));
document.getElementById('menu-help').addEventListener('click', ()=> alert('Open Help & Support'));

// keyboard navigation
userBtn.addEventListener('keydown', (e)=>{
  if(e.key==='ArrowDown'){
    e.preventDefault();
    userDropdown.querySelector('button')?.focus();
  }
});
userDropdown.querySelectorAll('button').forEach(btn=>{
  btn.addEventListener('keydown', (e)=>{
    if(e.key==='ArrowDown'){
      e.preventDefault();
      if(btn.parentElement.nextElementSibling) btn.parentElement.nextElementSibling.querySelector('button').focus();
      else btn.parentElement.parentElement.querySelector('button:first-child').focus();
    }
    if(e.key==='ArrowUp'){
      e.preventDefault();
      if(btn.parentElement.previousElementSibling) btn.parentElement.previousElementSibling.querySelector('button').focus();
      else btn.parentElement.parentElement.querySelector('button:last-child').focus();
    }
    if(e.key==='Escape'){
      userDropdown.setAttribute('aria-hidden','true');
      userBtn.setAttribute('aria-expanded','false');
      userBtn.focus();
    }
  });
});

})();