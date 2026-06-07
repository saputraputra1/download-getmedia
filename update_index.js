const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'public', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// 1. HEAD additions (manifest, CDN)
html = html.replace(
  '<meta name="mobile-web-app-capable" content="yes" />',
  `<meta name="mobile-web-app-capable" content="yes" />\n  <link rel="manifest" href="/manifest.json" />`
);
html = html.replace(
  '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />',
  `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />\n  <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>\n  <script src="https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js"></script>\n  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>`
);

// 2. Light Theme CSS
html = html.replace(
  '    html {',
  `    body.light-theme {\n      --bg: #f8fafc;\n      --bg2: #ffffff;\n      --surface: #ffffff;\n      --surface2: #f1f5f9;\n      --surface3: #e2e8f0;\n      --accent: #7c3aed;\n      --accent-light: #8b5cf6;\n      --accent-dim: rgba(124,58,237,0.1);\n      --accent-glow: rgba(124,58,237,0.2);\n      --text: #0f172a;\n      --text2: #334155;\n      --muted: #64748b;\n      --border: rgba(0,0,0,0.08);\n      --border2: rgba(0,0,0,0.12);\n    }\n    body.light-theme .ambient-1 {\n      background: radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 65%);\n    }\n    body.light-theme .topbar {\n      background: rgba(255,255,255,0.85);\n    }\n    body.light-theme .card {\n      box-shadow: 0 4px 20px rgba(0,0,0,0.03);\n    }\n\n    html {`
);

// 3. Analytics & QR CSS
html = html.replace(
  '    /* ─── Batch bar ─── */',
  `    /* ─── Analytics ─── */\n    .analytics-box { display: flex; gap: 10px; margin-bottom: 16px; padding: 0 16px; }\n    .stat-card { flex: 1; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-xs); padding: 12px; text-align: center; }\n    .stat-value { font-size: 20px; font-weight: 800; color: var(--accent-light); }\n    .stat-label { font-size: 11px; color: var(--muted); margin-top: 4px; }\n\n    /* ─── QR Code ─── */\n    .qr-box { background: #fff; padding: 16px; border-radius: var(--radius-xs); margin: 0 auto 12px; display: inline-block; }\n\n    /* ─── Batch bar ─── */`
);

// 4. Toggle Button UI
html = html.replace(
  '<div class="topbar-right">',
  `<div class="topbar-right">\n    <button class="icon-btn" id="themeBtn" onclick="toggleTheme()" aria-label="Tema" style="display:flex;align-items:center;justify-content:center;">\n      <svg id="themeIcon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>\n    </button>`
);

// 5. Analytics UI in History
html = html.replace(
  '<div class="sheet-list" id="histList"></div>',
  `<div class="analytics-box" id="histStats" style="display:none;"></div>\n  <div class="sheet-list" id="histList"></div>`
);

// 6. QR Modal UI
html = html.replace(
  '<!-- History Bottom Sheet -->',
  `<!-- QR Modal -->\n<div class="modal-bg" id="qrModal">\n  <div class="modal-top">\n    <span class="modal-title-text">QR Code Link Download</span>\n    <button class="modal-close" onclick="closeQr()">✕</button>\n  </div>\n  <div class="modal-body" style="flex-direction:column;">\n    <div class="qr-box" id="qrcode"></div>\n    <p style="font-size:13px;color:var(--muted);text-align:center;max-width:250px;">Scan QR ini di HP lain untuk mendownload media secara langsung.</p>\n  </div>\n</div>\n\n<!-- History Bottom Sheet -->`
);

// 7. Batch Bar ZIP Download
html = html.replace(
  '<div class="batch-bar" id="batchBar">\n    <button class="batch-btn" onclick="downloadAllBest()" style="display:flex;align-items:center;justify-content:center;gap:6px;">\n      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>\n      Unduh Semua (Kualitas Terbaik)\n    </button>\n  </div>',
  `<div class="batch-bar" id="batchBar" style="display:none;gap:10px;">\n    <button class="batch-btn" onclick="downloadAllBest()" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;">\n      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>\n      Unduh Semua\n    </button>\n    <button class="batch-btn" id="zipBtn" onclick="downloadAsZip()" style="flex:1;background:var(--surface2);border-color:var(--border);color:var(--text);display:flex;align-items:center;justify-content:center;gap:6px;">\n      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>\n      Unduh ZIP\n    </button>\n  </div>`
);

// 8. QR Button in fmtHtml (makeCard)
html = html.replace(
  /fmtHtml \+= `<button class="\$\{cls\}" onclick="dlFile\('\$\{su\}','\$\{p\}','\$\{f\.ext\}',this,'\$\{encT\}'\)">\\n            <span>\$\{ico\} \$\{f\.quality\}<\/span><span>\$\{svgDl\}<\/span>\\n          <\/button>`;/g,
  `fmtHtml += \`<div style="display:flex;gap:6px;margin-bottom:6px;"><button class="\${cls}" style="flex:1;margin-bottom:0;" onclick="dlFile('\${su}','\${p}','\${f.ext}',this,'\${encT}')">\\n            <span>\${ico} \${f.quality}</span><span>\${svgDl}</span>\\n          </button>\\n          <button class="icon-btn" style="width:auto;padding:0 12px;border-color:var(--border);" onclick="showQr('\${su}','\${p}','\${f.ext}','\${encT}')" aria-label="QR Code"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><rect x="7" y="7" width="3" height="3"></rect><rect x="14" y="7" width="3" height="3"></rect><rect x="7" y="14" width="3" height="3"></rect><rect x="14" y="14" width="3" height="3"></rect></svg></button></div>\`;`
);
html = html.replace(
  /fmtHtml = `<button class="fmt-btn" onclick="dlFile\('\$\{su\}','\$\{p\}','\$\{item\.ext\|\|\(isV\?'mp4':'jpg'\)\}',this,'\$\{encT\}'\)">\\n          <span>\$\{isV \? svgVid \+ 'Video' : svgImg \+ 'Foto'\}<\/span><span>\$\{svgDl\}<\/span>\\n        <\/button>`;/g,
  `fmtHtml = \`<div style="display:flex;gap:6px;"><button class="fmt-btn" style="flex:1" onclick="dlFile('\${su}','\${p}','\${item.ext||(isV?'mp4':'jpg')}',this,'\${encT}')">\\n          <span>\${isV ? svgVid + 'Video' : svgImg + 'Foto'}</span><span>\${svgDl}</span>\\n        </button>\\n        <button class="icon-btn" style="width:auto;padding:0 12px;border-color:var(--border);" onclick="showQr('\${su}','\${p}','\${item.ext||(isV?'mp4':'jpg')}','\${encT}')" aria-label="QR Code"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><rect x="7" y="7" width="3" height="3"></rect><rect x="14" y="7" width="3" height="3"></rect><rect x="7" y="14" width="3" height="3"></rect><rect x="14" y="14" width="3" height="3"></rect></svg></button></div>\`;`
);
html = html.replace(/<div class="fmt-list">\$\{fmtHtml\}<\/div>/g, `<div class="fmt-list" style="gap:0">\${fmtHtml}</div>`);

// 9. Batch Bar block display fix
html = html.replace(
  `if (gResults.length > 1) bb.style.display = 'block';`,
  `if (gResults.length > 1 || (gResults[0] && gResults[0].mediaItems.length > 1)) bb.style.display = 'flex';`
);

// 10. Analytics inside toggleSheet
html = html.replace(
  `else { renderHist(); s.classList.add('open'); bg.classList.add('open'); }`,
  `else { renderHist(); renderStats(); s.classList.add('open'); bg.classList.add('open'); }`
);

// 11. Scripts (Theme, SW, QR, ZIP, Analytics)
const scriptsToAdd = `
  // ═══════════ THEME ═══════════
  function toggleTheme() {
    const isL = document.body.classList.toggle('light-theme');
    localStorage.setItem('mediaget_theme', isL ? 'light' : 'dark');
    const ico = document.getElementById('themeIcon');
    if (isL) ico.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
    else ico.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
  }
  if (localStorage.getItem('mediaget_theme') === 'light') toggleTheme();

  // ═══════════ SERVICE WORKER ═══════════
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.error);
  }

  // ═══════════ ANALYTICS ═══════════
  function renderStats() {
    const h = getHist();
    const bx = document.getElementById('histStats');
    if (!h.length) { bx.style.display = 'none'; return; }
    let total = 0;
    const pCounts = {};
    h.forEach(i => {
      total += i.count || 1;
      pCounts[i.platform] = (pCounts[i.platform] || 0) + (i.count || 1);
    });
    let fav = '-', max = 0;
    for (const [p, c] of Object.entries(pCounts)) { if (c > max) { max = c; fav = p; } }
    bx.innerHTML = \`
      <div class="stat-card">
        <div class="stat-value">\${total}</div>
        <div class="stat-label">Total File Diunduh</div>
      </div>
      <div class="stat-card">
        <div class="stat-value tag \${fav}" style="display:inline-block;padding:4px 10px;font-size:14px;border:1px solid var(--border)">\${fav}</div>
        <div class="stat-label">Platform Favorit</div>
      </div>
    \`;
    bx.style.display = 'flex';
  }

  // ═══════════ QR CODE ═══════════
  let qrObj = null;
  function showQr(url, plat, ext, encT) {
    const fn = \`\${plat||'media'}_\${Date.now()}.\${ext||'bin'}\`;
    const proxy = \`\${API}/api/proxy?url=\${encodeURIComponent(url)}&filename=\${encodeURIComponent(fn)}\`;
    document.getElementById('qrcode').innerHTML = '';
    qrObj = new QRCode(document.getElementById('qrcode'), {
      text: proxy,
      width: 180,
      height: 180,
      colorDark : "#0a0a12",
      colorLight : "#ffffff",
      correctLevel : QRCode.CorrectLevel.L
    });
    document.getElementById('qrModal').classList.add('open');
  }
  function closeQr() {
    document.getElementById('qrModal').classList.remove('open');
    document.getElementById('qrcode').innerHTML = '';
  }
  document.getElementById('qrModal').addEventListener('click', e => { if (e.target === e.currentTarget || e.target.classList.contains('modal-body')) closeQr(); });

  // ═══════════ ZIP DOWNLOAD ═══════════
  async function downloadAsZip() {
    const btn = document.getElementById('zipBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = \`<div class="spin" style="width:14px;height:14px;border-width:2px;margin-right:6px"></div> Memproses...\`;
    btn.style.pointerEvents = 'none';
    btn.style.opacity = '0.7';

    try {
      const zip = new JSZip();
      let count = 0;
      
      // Kumpulkan semua url terbaik
      const tasks = [];
      gResults.forEach(d => {
        d.mediaItems.forEach(item => {
          let u = item.url, e = item.ext || (item.type === 'video' ? 'mp4' : 'jpg');
          if (item.formats?.length) {
            const vf = item.formats.find(f => f.type === 'video') || item.formats[0];
            u = vf.url; e = vf.ext;
          }
          const fn = \`\${d.platform||'media'}_\${count+1}_\${Date.now()}.\${e}\`;
          const proxy = \`\${API}/api/proxy?url=\${encodeURIComponent(u)}\`;
          tasks.push({ url: proxy, filename: fn });
          count++;
        });
      });

      for (let i = 0; i < tasks.length; i++) {
        btn.innerHTML = \`<div class="spin" style="width:14px;height:14px;border-width:2px;margin-right:6px"></div> Download \${i+1}/\${tasks.length}\`;
        const r = await fetch(tasks[i].url);
        if (!r.ok) throw new Error('Gagal download ' + tasks[i].filename);
        const blob = await r.blob();
        zip.file(tasks[i].filename, blob);
      }

      btn.innerHTML = \`<div class="spin" style="width:14px;height:14px;border-width:2px;margin-right:6px"></div> Zipping...\`;
      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, \`MediaGet_\${Date.now()}.zip\`);
      
      btn.innerHTML = \`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px"><polyline points="20 6 9 17 4 12"></polyline></svg> Selesai!\`;
      setTimeout(() => { btn.innerHTML = orig; btn.style.pointerEvents = ''; btn.style.opacity = '1'; }, 3000);
    } catch (err) {
      console.error(err);
      btn.innerHTML = \`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Gagal\`;
      setTimeout(() => { btn.innerHTML = orig; btn.style.pointerEvents = ''; btn.style.opacity = '1'; }, 3000);
    }
  }
`;

html = html.replace(
  '// ═══════════ KEYBOARD ═══════════',
  scriptsToAdd + '\n\n  // ═══════════ KEYBOARD ═══════════'
);

fs.writeFileSync(indexPath, html);
console.log('Update success!');
