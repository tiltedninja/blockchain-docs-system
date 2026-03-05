// app.js — Blockchain Transaction System Demo
(async function() {
  // ----- Config -----
  const userInitials = 'CSC4';

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
  const avatarBtn = document.getElementById('avatarBtn');
  const userDropdown = document.getElementById('userDropdown');

  // ----- State -----
  const state = { txs: [], nextId: 1 };

  avatarBtn.textContent = userInitials;

  // ----- Utilities -----
  function toast(msg, ms = 1800) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.cssText = 'position:fixed;right:16px;bottom:96px;background:#111;color:#fff;padding:10px 12px;border-radius:8px;opacity:0.95;z-index:9999';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  function randomHex(len) {
    const arr = new Uint8Array(len/2 || 16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  // ----- Transactions -----
  function makeTx(filename, source = 'digital', contentPreview = '') {
    const id = `tx_${Date.now().toString(36)}_${state.nextId++}`;
    const now = new Date().toISOString();
    return {
      id, filename, source, contentPreview,
      status:'pending', createdAt: now,
      events: [{ stage: 'uploaded', at: now }],
      confirmations: 0,
      proof: { merkleRoot: null, signatures: [], powHash: null }
    };
  }

  async function renderTxList() {
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

    for (const tx of filtered) {
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
      li.querySelector('button[data-id]').addEventListener('click', ()=> openTxModal(tx.id));
      txList.appendChild(li);
    }
  }

  async function openTxModal(id) {
    const tx = state.txs.find(t => t.id === id);
    if (!tx) return;
    txModal.setAttribute('aria-hidden','false');
    txDetail.innerHTML = `
      <h3>${tx.filename}</h3>
      <div class="muted">TxID: <code>${tx.id}</code></div>
      <p class="tx-meta">Source: ${tx.source} · Created: ${new Date(tx.createdAt).toLocaleString()}</p>
      <div style="margin-top:12px"><strong>Status:</strong> <span class="status-pill ${tx.status==='pending'?'status-pending':tx.status==='confirmed'?'status-confirmed':'status-invalid'}">${tx.status}</span></div>
      <div style="margin-top:10px"><strong>Lifecycle:</strong>
        <ol>${tx.events.map(e=>`<li>${e.stage} — ${new Date(e.at).toLocaleString()}</li>`).join('')}</ol>
      </div>
      <div style="margin-top:12px">
        <button id="copyProof" class="btn btn-outline" data-cursor="select">Copy TxID</button>
        <button id="exportProof" class="btn" data-cursor="select">Export Proof (JSON)</button>
        <button id="showProof" class="btn btn-ghost" data-cursor="select">Show cryptographic proof</button>
      </div>
      <div id="proofArea" style="margin-top:12px;display:none">
        <pre style="background:#f1f5f9;padding:12px;border-radius:8px;overflow:auto">${JSON.stringify(tx.proof,null,2)}</pre>
      </div>`;
    document.getElementById('copyProof').addEventListener('click', ()=> { navigator.clipboard.writeText(tx.id); toast('TxID copied'); });
    document.getElementById('exportProof').addEventListener('click', ()=> {
      const blob = new Blob([JSON.stringify(tx,null,2)], {type:'application/json'});
      const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${tx.id}-proof.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    });
    document.getElementById('showProof').addEventListener('click', ()=> {
      const area = document.getElementById('proofArea');
      area.style.display = area.style.display === 'none' ? 'block' : 'none';
    });
  }

  closeTxModal?.addEventListener('click', ()=> txModal.setAttribute('aria-hidden','true'));
  txModal?.addEventListener('click', e => { if(e.target===txModal) txModal.setAttribute('aria-hidden','true'); });

  // ----- Blockchain pipeline simulation -----
  async function startProcessing(tx) {
    tx.events.push({stage:'processing_started', at:new Date().toISOString()});
    const stages = ['registered','validated','hashed_signed','merkle_consensus','stored'];
    for(const stage of stages) {
      await new Promise(r=>setTimeout(r, 400 + Math.random()*800));
      tx.events.push({stage, at:new Date().toISOString()});
      renderTxList();
    }

    // --- Simulate digital signature & Merkle ---
    const hashContent = await sha256(tx.filename + tx.contentPreview + Date.now());
    tx.proof.powHash = await proofOfWork(hashContent, 3); // difficulty 3 leading zeros
    tx.proof.merkleRoot = await sha256(tx.proof.powHash);
    tx.proof.signatures.push({node:'node-1', sig:hashContent});
    tx.status = 'confirmed';
    tx.confirmations = 6;
    tx.events.push({stage:'confirmed', at:new Date().toISOString()});
    renderTxList();
    toast('Transaction confirmed');
  }

  async function proofOfWork(base, difficulty = 3) {
    let nonce = 0;
    let hash = '';
    const target = '0'.repeat(difficulty);
    do {
      hash = await sha256(base + nonce);
      nonce++;
    } while(!hash.startsWith(target));
    return hash;
  }

  // ----- File Handling -----
  function handleFiles(files) {
    if(!files.length) return;
    files.forEach(f => {
      const tx = makeTx(f.name, 'digital', '');
      state.txs.push(tx);
      renderTxList();
      toast(`Queued ${f.name}`);
      setTimeout(()=> { tx.contentPreview = simulateOcrForFile(f); tx.events.push({stage:'ocr_parsed',at:new Date().toISOString()}); renderTxList(); }, 300 + Math.random()*600);
      setTimeout(()=> startProcessing(tx), 900 + Math.random()*800);
    });
  }

  function simulateOcrForFile(f) {
    const ext = (f.name.split('.').pop()||'').toLowerCase();
    if(['png','jpg','jpeg','tiff','pdf'].includes(ext)) return `Simulated OCR for ${f.name} — REF-${Math.random().toString(36).slice(2,8)}`;
    return `No OCR for ${f.name}`;
  }

  dropArea?.addEventListener('dragover', e=>{ e.preventDefault(); dropArea.classList.add('dragover'); });
  dropArea?.addEventListener('dragleave', ()=> dropArea.classList.remove('dragover'));
  dropArea?.addEventListener('drop', e=>{ e.preventDefault(); dropArea.classList.remove('dragover'); handleFiles(Array.from(e.dataTransfer.files || [])); });
  browseBtn?.addEventListener('click', ()=> fileInput.click());
  openUploadBtn?.addEventListener('click', ()=> fileInput.click());
  ctaUpload?.addEventListener('click', ()=> fileInput.click());
  quickDigital?.addEventListener('click', ()=> fileInput.click());

  fileInput?.addEventListener('change', e=> { handleFiles(Array.from(e.target.files||[])); fileInput.value=''; });

  // ----- Camera -----
  async function openCamera() {
    cameraModal.setAttribute('aria-hidden','false');
    ocrPreview.style.display='none';
    useCapture.disabled=true; retake.disabled=true;
    try { const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}); video.srcObject=stream; } 
    catch(e){ toast('Camera unavailable'); cameraModal.setAttribute('aria-hidden','true'); }
  }
  shutter?.addEventListener('click', ()=>{
    captureCanvas.width=video.videoWidth; captureCanvas.height=video.videoHeight;
    captureCanvas.getContext('2d').drawImage(video,0,0);
    useCapture.disabled=false; retake.disabled=false;
    ocrText.value = `Simulated OCR result at ${new Date().toLocaleTimeString()}`;
    ocrPreview.style.display='block';
  });
  useCapture?.addEventListener('click', ()=>{
    const name = `capture_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.jpg`;
    const tx = makeTx(name,'camera',ocrText.value);
    state.txs.push(tx);
    renderTxList();
    toast('Captured and queued');
    stopVideo(); cameraModal.setAttribute('aria-hidden','true');
    startProcessing(tx);
  });
  retake?.addEventListener('click', ()=> { ocrPreview.style.display='none'; useCapture.disabled=true; retake.disabled=true; });
  document.getElementById('closeCamera')?.addEventListener('click', ()=>{ stopVideo(); cameraModal.setAttribute('aria-hidden','true'); });
  captureBtn?.addEventListener('click', openCamera);
  quickCamera?.addEventListener('click', openCamera);
  function stopVideo(){ const s=video.srcObject; if(s?.getTracks) s.getTracks().forEach(t=>t.stop()); video.srcObject=null; }

  // ----- Search / Filter -----
  searchTx?.addEventListener('input', renderTxList);
  statusFilter?.addEventListener('change', renderTxList);

  // ----- Mobile Nav -----
  document.getElementById('mb-upload')?.addEventListener('click', ()=> fileInput.click());
  document.getElementById('ctaHistory')?.addEventListener('click', ()=> document.getElementById('history')?.scrollIntoView({behavior:'smooth'}));

  // ----- User Menu -----
  avatarBtn.addEventListener('click', ()=>{
    const expanded = avatarBtn.getAttribute('aria-expanded')==='true';
    avatarBtn.setAttribute('aria-expanded', String(!expanded));
    userDropdown.setAttribute('aria-hidden', String(expanded));
  });
  document.addEventListener('click', e=>{ if(!userDropdown.contains(e.target) && e.target!==avatarBtn){ userDropdown.setAttribute('aria-hidden','true'); avatarBtn.setAttribute('aria-expanded','false'); } });

  ['menu-logout','menu-settings','menu-feedback','menu-display','menu-help'].forEach(id=>{
    document.getElementById(id)?.addEventListener('click', ()=> alert(`${id.replace('menu-','').replace('-',' ')} clicked`));
  });

  // ----- Initial Seed -----
  ['Agreement.pdf','invoice-324.jpg'].forEach((n,i)=>{
    const tx = makeTx(n, i===1?'camera':'digital', `Simulated OCR preview for ${n}`);
    state.txs.push(tx);
    setTimeout(()=> startProcessing(tx), 400 + i*900);
  });
  renderTxList();

})();"// updated" 
