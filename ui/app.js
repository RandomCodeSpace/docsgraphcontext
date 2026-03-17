// DocsContext SPA

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById('tab-' + name);
  if (tab) tab.classList.add('active');
}

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ── Search ────────────────────────────────────────────────────────────────────

async function doSearch() {
  const query = document.getElementById('search-query').value.trim();
  const mode = document.getElementById('search-mode').value;
  const topK = parseInt(document.getElementById('search-topk').value) || 5;
  const el = document.getElementById('search-results');
  if (!query) return;
  el.innerHTML = '<div class="empty">Searching...</div>';
  try {
    const result = await api('/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, mode, top_k: topK, graph_depth: 2 }),
    });
    el.innerHTML = renderSearchResults(result, mode);
  } catch (e) {
    el.innerHTML = `<div class="empty">Error: ${e.message}</div>`;
  }
}

function renderSearchResults(result, mode) {
  if (mode === 'global') {
    let html = '';
    if (result.Answer) {
      html += `<div class="answer-box">${escHtml(result.Answer)}</div>`;
    }
    if (result.Communities && result.Communities.length) {
      html += result.Communities.map(c =>
        `<div class="card">
          <div class="card-title">${escHtml(c.title || 'Community')}</div>
          <div class="card-meta">Level ${c.level} · ${c.rank} members</div>
          <div class="card-body">${escHtml(c.summary || '')}</div>
        </div>`
      ).join('');
    }
    return html || '<div class="empty">No results</div>';
  }
  // Local search
  let html = '';
  if (result.Chunks && result.Chunks.length) {
    html += result.Chunks.map(c =>
      `<div class="card">
        <span class="score">${(c.Score * 100).toFixed(1)}%</span>
        <div class="card-title">Chunk ${c.Chunk.chunk_index || c.Chunk.ChunkIndex}</div>
        <div class="card-meta">Doc: ${escHtml(c.Chunk.doc_id || c.Chunk.DocID)}</div>
        <div class="card-body">${escHtml(c.Chunk.content || c.Chunk.Content)}</div>
      </div>`
    ).join('');
  }
  if (result.Entities && result.Entities.length) {
    html += `<h3 style="margin:1rem 0 .5rem;color:#94a3b8">Related Entities</h3>`;
    html += result.Entities.slice(0, 10).map(e =>
      `<div class="card">
        <div class="card-title">${escHtml(e.name || e.Name)} <span class="tag">${escHtml(e.type || e.Type || '')}</span></div>
        <div class="card-body">${escHtml(e.description || e.Description || '')}</div>
      </div>`
    ).join('');
  }
  return html || '<div class="empty">No results</div>';
}

// ── Documents ─────────────────────────────────────────────────────────────────

async function loadDocuments() {
  const docType = document.getElementById('doc-type-filter').value;
  const el = document.getElementById('documents-list');
  el.innerHTML = '<div class="empty">Loading...</div>';
  try {
    const docs = await api('/documents' + (docType ? '?doc_type=' + docType : ''));
    if (!docs || !docs.length) {
      el.innerHTML = '<div class="empty">No documents indexed yet.</div>';
      return;
    }
    el.innerHTML = docs.map(d =>
      `<div class="card">
        <div class="card-title">${escHtml(d.title || d.Title || d.path || d.Path)}</div>
        <div class="card-meta">
          <span class="tag">${escHtml(d.doc_type || d.DocType || '')}</span>
          ${escHtml(d.path || d.Path || '')}
        </div>
      </div>`
    ).join('');
  } catch (e) {
    el.innerHTML = `<div class="empty">Error: ${e.message}</div>`;
  }
}

// ── Graph ─────────────────────────────────────────────────────────────────────

async function loadGraph() {
  const entity = document.getElementById('graph-entity').value.trim();
  const depth = parseInt(document.getElementById('graph-depth').value) || 2;
  if (!entity) return;
  try {
    const data = await api(`/graph/neighborhood?entity=${encodeURIComponent(entity)}&depth=${depth}`);
    renderGraph(data);
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

// ── Communities ───────────────────────────────────────────────────────────────

async function loadCommunities() {
  const level = parseInt(document.getElementById('comm-level').value);
  const el = document.getElementById('communities-list');
  el.innerHTML = '<div class="empty">Loading...</div>';
  try {
    const params = level >= 0 ? '?level=' + level : '';
    const comms = await api('/communities' + params);
    if (!comms || !comms.length) {
      el.innerHTML = '<div class="empty">No communities yet. Run <code>DocsContext index --finalize</code>.</div>';
      return;
    }
    el.innerHTML = comms.map(c =>
      `<div class="card">
        <div class="card-title">${escHtml(c.title || c.Title || 'Community')}</div>
        <div class="card-meta">Level ${c.level} · ${c.rank} members</div>
        <div class="card-body">${escHtml(c.summary || c.Summary || '')}</div>
      </div>`
    ).join('');
  } catch (e) {
    el.innerHTML = `<div class="empty">Error: ${e.message}</div>`;
  }
}

// ── Upload ────────────────────────────────────────────────────────────────────

let selectedFiles = [];

const uploadArea = document.getElementById('upload-area');
if (uploadArea) {
  uploadArea.addEventListener('click', () => document.getElementById('file-input').click());
  uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
  uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    addFiles(e.dataTransfer.files);
  });
}

const fileInput = document.getElementById('file-input');
if (fileInput) {
  fileInput.addEventListener('change', () => addFiles(fileInput.files));
}

function addFiles(fileList) {
  for (const f of fileList) selectedFiles.push(f);
  renderSelectedFiles();
}

function renderSelectedFiles() {
  const el = document.getElementById('selected-files');
  const btn = document.getElementById('upload-btn');
  if (!selectedFiles.length) {
    el.innerHTML = '';
    btn.style.display = 'none';
    return;
  }
  el.innerHTML = selectedFiles.map((f, i) =>
    `<div class="file-item">
      <span>${escHtml(f.name)}</span>
      <span style="color:#64748b">${formatBytes(f.size)}</span>
    </div>`
  ).join('');
  btn.style.display = 'inline-block';
}

async function doUpload() {
  if (!selectedFiles.length) return;
  const el = document.getElementById('upload-progress');
  el.innerHTML = '<div class="empty">Uploading...</div>';
  const form = new FormData();
  selectedFiles.forEach(f => form.append('files', f));
  try {
    const result = await fetch('/api/upload', { method: 'POST', body: form });
    const data = await result.json();
    el.innerHTML = `<div class="card"><div class="card-body">Job ${escHtml(data.job_id || '')}: ${escHtml(data.status || '')}</div></div>`;
    selectedFiles = [];
    renderSelectedFiles();
    // Poll for progress
    pollProgress(el);
  } catch (e) {
    el.innerHTML = `<div class="empty">Error: ${e.message}</div>`;
  }
}

async function pollProgress(el) {
  const es = new EventSource('/api/upload/progress');
  es.onmessage = e => {
    el.innerHTML = `<div class="card"><div class="card-body">${escHtml(e.data)}</div></div>`;
    if (e.data === 'done') es.close();
  };
  es.onerror = () => es.close();
}

// ── Stats ─────────────────────────────────────────────────────────────────────

async function loadStats() {
  const el = document.getElementById('stats-display');
  try {
    const stats = await api('/stats');
    el.innerHTML = `<div class="stat-grid">
      ${Object.entries(stats).map(([k, v]) =>
        `<div class="stat-card"><div class="stat-value">${v}</div><div class="stat-label">${escHtml(k)}</div></div>`
      ).join('')}
    </div>`;
  } catch (e) {
    el.innerHTML = `<div class="empty">Error: ${e.message}</div>`;
  }
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if ((e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') && e.key === 'Enter') {
    if (document.getElementById('tab-search').classList.contains('active')) doSearch();
    if (document.getElementById('tab-graph').classList.contains('active')) loadGraph();
  }
});

// ── Utilities ─────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024*1024) return (n/1024).toFixed(1) + ' KB';
  return (n/(1024*1024)).toFixed(1) + ' MB';
}

// Auto-load stats on page load
window.addEventListener('load', () => {
  loadStats();
});


