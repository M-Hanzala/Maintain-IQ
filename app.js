/* =========================================================
   MaintainIQ — Track C frontend prototype
   Vanilla JS + localStorage persistence. No backend required.
   ========================================================= */

const STORAGE_KEY = 'maintainiq_data_v1';

const ASSET_STATUSES = ['Operational', 'Issue Reported', 'Under Inspection', 'Under Maintenance', 'Out of Service', 'Retired'];
const ISSUE_STATUSES = ['Reported', 'Assigned', 'Inspection Started', 'Maintenance In Progress', 'Waiting for Parts', 'Resolved', 'Closed', 'Reopened'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

/* Maps an issue status to the asset status it should drive (business rule table in the brief) */
const ISSUE_TO_ASSET_STATUS = {
    'Reported': 'Issue Reported',
    'Assigned': 'Issue Reported',
    'Inspection Started': 'Under Inspection',
    'Maintenance In Progress': 'Under Maintenance',
    'Waiting for Parts': 'Under Maintenance',
    'Resolved': 'Operational',
    'Closed': 'Operational',
    'Reopened': 'Issue Reported'
};

/* -----------------------------------------------------------
   Demo seed data — at least five preloaded assets, per brief
   ----------------------------------------------------------- */
function seedData() {
    const now = Date.now();
    const daysAgo = d => new Date(now - d * 86400000).toISOString().slice(0, 10);

    const assets = [
        { code: 'PROJ-001', name: 'Classroom Projector 01', category: 'Electronics', location: 'Block A, Room 101', condition: 'Good', status: 'Operational', lastService: daysAgo(40), nextService: daysAgo(-50), createdAt: daysAgo(120) },
        { code: 'AC-014', name: 'Split AC Unit — Lab 3', category: 'HVAC', location: 'Block C, Lab 3', condition: 'Fair', status: 'Operational', lastService: daysAgo(20), nextService: daysAgo(-70), createdAt: daysAgo(200) },
        { code: 'GEN-002', name: 'Backup Generator', category: 'Electronics', location: 'Utility Yard', condition: 'Good', status: 'Operational', lastService: daysAgo(10), nextService: daysAgo(-80), createdAt: daysAgo(300) },
        { code: 'FURN-118', name: 'Lecture Hall Chairs (Set B)', category: 'Furniture', location: 'Block B, Hall 2', condition: 'Poor', status: 'Out of Service', lastService: daysAgo(200), nextService: daysAgo(-5), createdAt: daysAgo(400) },
        { code: 'PUMP-007', name: 'Water Pump — Rooftop Tank', category: 'Plumbing', location: 'Rooftop, Block A', condition: 'Fair', status: 'Operational', lastService: daysAgo(55), nextService: daysAgo(-35), createdAt: daysAgo(250) },
        { code: 'CCTV-023', name: 'Corridor CCTV Camera', category: 'Safety Equipment', location: 'Block D, 2nd Floor', condition: 'Excellent', status: 'Retired', lastService: daysAgo(300), nextService: daysAgo(-999), createdAt: daysAgo(500) }
    ];

    const issues = [
        {
            id: 'ISS-1001', assetCode: 'AC-014', title: 'Water leakage and reduced cooling', category: 'Leakage / Performance',
            priority: 'High', status: 'Maintenance In Progress', reporter: 'Ali Raza', assignee: 'Tech: Bilal',
            description: 'The AC is leaking water, making unusual noise, and cooling is weak.',
            causes: 'Blocked drain pipe, dirty filter, frozen coil.',
            checks: 'Turn off the unit if water is near electrical wiring; inspect drainage; check filter condition.',
            reportedAt: daysAgo(3), maintenance: null
        },
        {
            id: 'ISS-1002', assetCode: 'FURN-118', title: 'Multiple chairs structurally unsafe', category: 'Structural',
            priority: 'Critical', status: 'Reported', reporter: 'Sana Iqbal', assignee: '',
            description: 'Several chairs in Hall 2 have broken frames and are unsafe to sit on.',
            causes: 'Wear from prolonged use; welded joints failing.',
            checks: 'Cordon off affected chairs; inspect all units in the set before reuse.',
            reportedAt: daysAgo(1), maintenance: null
        },
        {
            id: 'ISS-1003', assetCode: 'PROJ-001', title: 'Bulb dimming intermittently', category: 'Electrical',
            priority: 'Medium', status: 'Resolved', reporter: 'Hina Shaikh', assignee: 'Tech: Bilal',
            description: 'Projector bulb dims occasionally during long sessions.',
            causes: 'Aging bulb; ventilation dust buildup.',
            checks: 'Clean air filter; check bulb hours; verify ventilation is unobstructed.',
            reportedAt: daysAgo(15),
            maintenance: { note: 'Cleaned internal vents and dust filter. Bulb tested stable across 2-hour session.', parts: 'None', cost: 0, date: daysAgo(12), nextService: daysAgo(-50) }
        }
    ];

    const history = [];
    assets.forEach(a => {
        history.push({ assetCode: a.code, actor: 'Administrator', action: 'Asset registered', issueId: null, at: a.createdAt });
    });
    issues.forEach(i => {
        history.push({ assetCode: i.assetCode, actor: i.reporter, action: `Issue reported: ${i.title}`, issueId: i.id, at: i.reportedAt });
        if (i.maintenance) {
            history.push({ assetCode: i.assetCode, actor: i.assignee || 'Technician', action: `Issue resolved — ${i.maintenance.note}`, issueId: i.id, at: i.maintenance.date });
        } else if (i.status !== 'Reported') {
            history.push({ assetCode: i.assetCode, actor: i.assignee || 'Technician', action: `Status updated to ${i.status}`, issueId: i.id, at: i.reportedAt });
        }
    });

    return { assets, issues, history, issueSeq: 1004 };
}

let db = loadData();

function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) { /* fall through to fresh seed */ }
    const fresh = seedData();
    saveData(fresh);
    return fresh;
}
function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function persist() { saveData(db); }

/* -----------------------------------------------------------
   Utilities
   ----------------------------------------------------------- */
function slug(s) { return s.replace(/\s+/g, '-'); }
function fmtDate(d) {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
function getAsset(code) { return db.assets.find(a => a.code === code); }
function getIssue(id) { return db.issues.find(i => i.id === id); }
function assetIssues(code) { return db.issues.filter(i => i.assetCode === code).sort((a, b) => b.reportedAt.localeCompare(a.reportedAt)); }
function assetHistory(code) { return db.history.filter(h => h.assetCode === code).sort((a, b) => b.at.localeCompare(a.at)); }
function addHistory(assetCode, actor, action, issueId = null) {
    db.history.push({ assetCode, actor, action, issueId, at: todayISO() });
}
function toast(msg, isErr = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'show' + (isErr ? ' err' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.className = t.className.replace('show', '').trim(), 2600);
}
function publicUrlFor(code) {
    const base = location.href.split('#')[0];
    return `${base}#/asset/${encodeURIComponent(code)}`;
}

/* =========================================================
   RENDERING
   ========================================================= */

function populateFilterOptions() {
    const statusSel = document.getElementById('assetStatusFilter');
    statusSel.innerHTML = '<option value="">All statuses</option>' + ASSET_STATUSES.map(s => `<option>${s}</option>`).join('');

    const cats = [...new Set(db.assets.map(a => a.category))].sort();
    const catSel = document.getElementById('assetCategoryFilter');
    catSel.innerHTML = '<option value="">All categories</option>' + cats.map(c => `<option>${c}</option>`).join('');

    const issueStatusSel = document.getElementById('issueStatusFilter');
    issueStatusSel.innerHTML = '<option value="">All statuses</option>' + ISSUE_STATUSES.map(s => `<option>${s}</option>`).join('');

    const priSel = document.getElementById('issuePriorityFilter');
    priSel.innerHTML = '<option value="">All priorities</option>' + PRIORITIES.map(p => `<option>${p}</option>`).join('');
}

function renderDashboard() {
    document.getElementById('statTotalAssets').textContent = db.assets.length;
    const openIssues = db.issues.filter(i => !['Resolved', 'Closed'].includes(i.status));
    document.getElementById('statOpenIssues').textContent = openIssues.length;
    document.getElementById('statCritical').textContent = db.issues.filter(i => i.priority === 'Critical' && !['Resolved', 'Closed'].includes(i.status)).length;
    document.getElementById('statOutOfService').textContent = db.assets.filter(a => a.status === 'Out of Service').length;

    const recentIssues = [...db.issues].sort((a, b) => b.reportedAt.localeCompare(a.reportedAt)).slice(0, 5);
    const riWrap = document.getElementById('dashRecentIssues');
    riWrap.innerHTML = recentIssues.length ? recentIssues.map(i => {
        const a = getAsset(i.assetCode);
        return `<div class="row-item clickable" onclick="openIssueDetail('${i.id}')">
      <div class="grow"><p><strong>${escapeHtml(i.title)}</strong></p><p class="meta">${a ? escapeHtml(a.name) : i.assetCode} · ${fmtDate(i.reportedAt)}</p></div>
      <span class="badge issue-${slug(i.status)}">${i.status}</span>
    </div>`;
    }).join('') : `<div class="empty-row">No issues reported yet.</div>`;

    const recentHist = [...db.history].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
    const haWrap = document.getElementById('dashRecentActivity');
    haWrap.innerHTML = recentHist.length ? recentHist.map(h => {
        const a = getAsset(h.assetCode);
        return `<div class="row-item">
      <div class="grow"><p>${escapeHtml(h.action)}</p><p class="meta">${a ? escapeHtml(a.name) : h.assetCode} · ${h.actor} · ${fmtDate(h.at)}</p></div>
    </div>`;
    }).join('') : `<div class="empty-row">No activity recorded yet.</div>`;
}

function renderAssets() {
    const q = (document.getElementById('assetSearch').value || '').toLowerCase();
    const statusF = document.getElementById('assetStatusFilter').value;
    const catF = document.getElementById('assetCategoryFilter').value;

    let list = db.assets.filter(a => {
        const matchesQ = !q || a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q) || a.location.toLowerCase().includes(q);
        const matchesStatus = !statusF || a.status === statusF;
        const matchesCat = !catF || a.category === catF;
        return matchesQ && matchesStatus && matchesCat;
    }).sort((a, b) => a.name.localeCompare(b.name));

    const grid = document.getElementById('assetGrid');
    if (!list.length) {
        grid.innerHTML = `<div class="empty-row" style="grid-column:1/-1;">No assets match your search or filters.</div>`;
        return;
    }
    grid.innerHTML = list.map(a => {
        const openCount = assetIssues(a.code).filter(i => !['Resolved', 'Closed'].includes(i.status)).length;
        return `<div class="tag-card" onclick="openAssetDetail('${a.code}')">
      <div class="tag-card-head"><span class="badge status-${slug(a.status)}">${a.status}</span></div>
      <h4>${escapeHtml(a.name)}</h4>
      <div class="tag-code">${a.code}</div>
      <div class="tag-meta">
        <span class="pill">${escapeHtml(a.category)}</span>
        <span class="pill">${escapeHtml(a.location)}</span>
      </div>
      <div class="tag-card-foot">
        <span class="small-muted">${openCount} open issue${openCount === 1 ? '' : 's'}</span>
        <span class="small-muted">Next svc ${fmtDate(a.nextService)}</span>
      </div>
    </div>`;
    }).join('');
}

function renderIssues() {
    const q = (document.getElementById('issueSearch').value || '').toLowerCase();
    const statusF = document.getElementById('issueStatusFilter').value;
    const priF = document.getElementById('issuePriorityFilter').value;

    let list = db.issues.filter(i => {
        const a = getAsset(i.assetCode);
        const matchesQ = !q || i.title.toLowerCase().includes(q) || i.id.toLowerCase().includes(q) || (a && a.name.toLowerCase().includes(q));
        const matchesStatus = !statusF || i.status === statusF;
        const matchesPri = !priF || i.priority === priF;
        return matchesQ && matchesStatus && matchesPri;
    }).sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));

    const body = document.getElementById('issuesTableBody');
    if (!list.length) {
        body.innerHTML = `<tr><td colspan="6" class="empty-row">No issues match your search or filters.</td></tr>`;
        return;
    }
    body.innerHTML = list.map(i => {
        const a = getAsset(i.assetCode);
        return `<tr class="clickable" onclick="openIssueDetail('${i.id}')">
      <td><strong>${escapeHtml(i.title)}</strong><br><span class="issue-id">${i.id}</span></td>
      <td>${a ? escapeHtml(a.name) : i.assetCode}</td>
      <td><span class="priority-chip priority-${i.priority}">${i.priority}</span></td>
      <td><span class="badge issue-${slug(i.status)}">${i.status}</span></td>
      <td>${fmtDate(i.reportedAt)}</td>
      <td><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg></td>
    </tr>`;
    }).join('');
}

function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
}

function renderAll() {
    populateFilterOptions();
    renderDashboard();
    renderAssets();
    renderIssues();
}

/* =========================================================
   NAVIGATION
   ========================================================= */
const viewTitles = {
    dashboard: ['Dashboard', 'Overview of assets and open work'],
    assets: ['Assets', 'Register, search, and inspect every asset'],
    issues: ['Issues', 'Track reported problems through resolution']
};
function showView(name) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    document.getElementById('topbarTitle').textContent = viewTitles[name][0];
    document.getElementById('topbarSub').textContent = viewTitles[name][1];
    document.getElementById('sidebar').classList.remove('open');
}
document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => showView(b.dataset.goto)));
document.getElementById('hamburgerBtn').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));

/* =========================================================
   MODAL HELPERS
   ========================================================= */
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
document.querySelectorAll('[data-close]').forEach(b => {
    b.addEventListener('click', (e) => {
        const overlay = e.target.closest('.overlay');
        overlay.classList.remove('active');
    });
});
document.querySelectorAll('.overlay').forEach(o => {
    o.addEventListener('click', (e) => { if (e.target === o) o.classList.remove('active'); });
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.overlay.active').forEach(o => o.classList.remove('active'));
});

/* =========================================================
   ADD ASSET
   ========================================================= */
document.getElementById('openAddAssetBtn').addEventListener('click', () => {
    document.getElementById('addAssetForm').reset();
    document.getElementById('f-assetCode').classList.remove('error');
    openModal('modal-addAsset');
});
document.getElementById('addAssetForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const code = fd.get('code').trim().toUpperCase();
    const codeField = document.getElementById('f-assetCode');

    if (db.assets.some(a => a.code.toUpperCase() === code)) {
        codeField.classList.add('error');
        return;
    }
    codeField.classList.remove('error');

    const asset = {
        code, name: fd.get('name').trim(), category: fd.get('category'),
        location: fd.get('location').trim(), condition: fd.get('condition'),
        status: 'Operational', lastService: fd.get('lastService') || '', nextService: '',
        createdAt: todayISO()
    };
    db.assets.push(asset);
    addHistory(code, 'Administrator', 'Asset registered');
    persist();
    renderAll();
    closeModal('modal-addAsset');
    toast(`Asset ${code} registered successfully.`);
});

/* =========================================================
   ASSET DETAIL + QR
   ========================================================= */
let currentAssetCode = null;

window.openAssetDetail = function (code) {
    currentAssetCode = code;
    const a = getAsset(code);
    if (!a) return;

    document.getElementById('ad-name').textContent = a.name;
    document.getElementById('ad-code').textContent = a.code;
    document.getElementById('ad-statusBadgeWrap').innerHTML = `<span class="badge status-${slug(a.status)}">${a.status}</span>`;
    document.getElementById('ad-category').textContent = a.category;
    document.getElementById('ad-location').textContent = a.location;
    document.getElementById('ad-condition').textContent = a.condition;
    document.getElementById('ad-lastService').textContent = fmtDate(a.lastService);
    document.getElementById('ad-nextService').textContent = fmtDate(a.nextService);
    document.getElementById('ad-registered').textContent = fmtDate(a.createdAt);

    // issues tab
    const issues = assetIssues(code);
    document.getElementById('ad-issuesList').innerHTML = issues.length ? issues.map(i => `
    <div class="row-item clickable" onclick="closeModal('modal-assetDetail'); openIssueDetail('${i.id}')">
      <div class="grow"><p><strong>${escapeHtml(i.title)}</strong></p><p class="meta">${i.id} · ${fmtDate(i.reportedAt)}</p></div>
      <span class="badge issue-${slug(i.status)}">${i.status}</span>
    </div>`).join('') : `<div class="empty-row">No issues reported for this asset.</div>`;

    // history tab
    const hist = assetHistory(code);
    document.getElementById('ad-historyList').innerHTML = hist.length ? hist.map(h => `
    <div class="timeline-item">
      <div class="timeline-dot"></div>
      <div class="body"><div class="action">${escapeHtml(h.action)}</div><div class="meta">${h.actor} · ${fmtDate(h.at)}</div></div>
    </div>`).join('') : `<div class="empty-row">No history yet.</div>`;

    // reset tabs
    document.querySelectorAll('#modal-assetDetail .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'issues'));
    document.getElementById('ad-tab-issues').classList.add('active');
    document.getElementById('ad-tab-history').classList.remove('active');

    // QR
    document.getElementById('qrcode-target').innerHTML = '';
    const url = publicUrlFor(a.code);
    new QRCode(document.getElementById('qrcode-target'), { text: url, width: 120, height: 120, colorDark: '#161F2B', colorLight: '#ffffff' });

    // retire button visibility
    document.getElementById('ad-retireWrap').style.display = a.status === 'Retired' ? 'none' : 'block';

    openModal('modal-assetDetail');
};

document.querySelectorAll('#modal-assetDetail .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#modal-assetDetail .tab-btn').forEach(b => b.classList.toggle('active', b === btn));
        document.getElementById('ad-tab-issues').classList.toggle('active', btn.dataset.tab === 'issues');
        document.getElementById('ad-tab-history').classList.toggle('active', btn.dataset.tab === 'history');
    });
});

document.getElementById('ad-openPublicBtn').addEventListener('click', () => {
    location.hash = `/asset/${encodeURIComponent(currentAssetCode)}`;
});
document.getElementById('ad-copyLinkBtn').addEventListener('click', () => {
    const url = publicUrlFor(currentAssetCode);
    navigator.clipboard?.writeText(url).then(() => toast('Public link copied to clipboard.'))
        .catch(() => toast('Could not copy link.', true));
});
document.getElementById('ad-downloadQrBtn').addEventListener('click', () => {
    const canvas = document.querySelector('#qrcode-target canvas');
    if (!canvas) { toast('QR code not ready yet.', true); return; }
    const link = document.createElement('a');
    link.download = `${currentAssetCode}-qr.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
});
document.getElementById('ad-retireBtn').addEventListener('click', () => {
    const a = getAsset(currentAssetCode);
    if (!a) return;
    if (!confirm(`Retire asset ${a.code}? This marks it as permanently removed from service.`)) return;
    a.status = 'Retired';
    addHistory(a.code, 'Administrator', 'Asset retired');
    persist();
    renderAll();
    openAssetDetail(a.code);
    toast(`Asset ${a.code} retired.`);
});
document.getElementById('ad-reportIssueBtn').addEventListener('click', () => {
    closeModal('modal-assetDetail');
    openReportIssue(currentAssetCode);
});

/* =========================================================
   REPORT ISSUE + simple AI TRIAGE simulation
   ========================================================= */
let reportForAssetCode = null;

function openReportIssue(code) {
    reportForAssetCode = code;
    const a = getAsset(code);
    document.getElementById('reportIssueForm').reset();
    document.getElementById('ri-assetLabel').textContent = `for ${a ? a.name + ' (' + a.code + ')' : code}`;
    document.getElementById('triageState').innerHTML = '';
    openModal('modal-reportIssue');
}
window.openReportIssue = openReportIssue;

/*
  AI Issue Triage — simulated locally so the prototype works fully offline.
  In the Advanced track this call goes to a real LLM; here it demonstrates
  the same product behaviour: natural language in, structured fields out,
  fully editable before submit, with loading + fallback states.
*/
function simulateAiTriage(description, asset) {
    const text = description.toLowerCase();
    const rules = [
        {
            kw: ['leak', 'water', 'drip'], title: 'Water leakage detected', category: 'Leakage / Performance', priority: 'High',
            causes: 'Blocked drain line, worn seal, or condensation buildup.',
            checks: 'Power off if water is near electrical wiring; inspect drainage path; check surrounding area for damage.'
        },
        {
            kw: ['spark', 'shock', 'smoke', 'electrical', 'wiring'], title: 'Electrical fault reported', category: 'Electrical', priority: 'Critical',
            causes: 'Damaged wiring, loose connection, or overloaded circuit.',
            checks: 'Disconnect power immediately; do not operate; keep area clear until inspected by a qualified technician.'
        },
        {
            kw: ['noise', 'vibration', 'rattl'], title: 'Unusual noise or vibration', category: 'Mechanical', priority: 'Medium',
            causes: 'Loose mounting, worn bearing, or foreign object interference.',
            checks: 'Observe from a safe distance; note when the noise occurs; avoid forcing the unit to continue operating.'
        },
        {
            kw: ['hdmi', 'display', 'flicker', 'screen', 'projector', 'connect'], title: 'Display or connectivity fault', category: 'IT / Connectivity', priority: 'Medium',
            causes: 'Loose cable connection, damaged port, or failing display component.',
            checks: 'Reseat all cables; test with an alternative source device; check for visible port damage.'
        },
        {
            kw: ['crack', 'broken', 'unsafe', 'structural', 'collapse'], title: 'Structural damage reported', category: 'Structural', priority: 'Critical',
            causes: 'Material fatigue, impact damage, or manufacturing defect.',
            checks: 'Restrict access to the asset immediately; do not use until inspected by a qualified technician.'
        },
        {
            kw: ['cool', 'ac ', 'a/c', 'hvac', 'temperature', 'hot'], title: 'Cooling performance issue', category: 'Leakage / Performance', priority: 'High',
            causes: 'Dirty filter, low refrigerant, or blocked airflow.',
            checks: 'Check and clean filters; ensure vents are unobstructed; monitor temperature over 30 minutes.'
        }
    ];
    const match = rules.find(r => r.kw.some(k => text.includes(k)));
    const base = match || {
        title: 'Maintenance issue reported', category: 'Other', priority: 'Medium',
        causes: 'Cause to be confirmed on technician inspection.',
        checks: 'Perform a visual inspection and confirm the asset is safe to keep in operation.'
    };

    return {
        title: `${base.title}${asset ? ' — ' + asset.name : ''}`.slice(0, 80),
        category: base.category,
        priority: base.priority,
        causes: base.causes,
        checks: base.checks
    };
}

document.getElementById('runTriageBtn').addEventListener('click', () => {
    const form = document.getElementById('reportIssueForm');
    const desc = form.description.value.trim();
    const stateEl = document.getElementById('triageState');

    if (desc.length < 8) {
        stateEl.innerHTML = `<div class="banner danger">Please describe the problem in a bit more detail before running AI triage.</div>`;
        return;
    }

    stateEl.innerHTML = `<div class="banner info">Analyzing complaint and asset context…</div>`;
    const btn = document.getElementById('runTriageBtn');
    btn.disabled = true;

    // Simulated latency + graceful timeout/fallback handling, per AI quality requirements.
    const timeout = setTimeout(() => {
        stateEl.innerHTML = `<div class="banner danger">AI triage timed out. You can fill in the fields manually below.</div>`;
        btn.disabled = false;
    }, 6000);

    setTimeout(() => {
        clearTimeout(timeout);
        try {
            const asset = getAsset(reportForAssetCode);
            const result = simulateAiTriage(desc, asset);
            form.title.value = result.title;
            form.category.value = result.category;
            form.priority.value = result.priority;
            form.causes.value = result.causes;
            form.checks.value = result.checks;
            const safetyNote = (result.priority === 'Critical')
                ? ` This looks safety-critical — a qualified technician should assess it before the asset is used.`
                : '';
            stateEl.innerHTML = `<div class="banner info">AI suggestions added below. Review and edit before submitting.${safetyNote}</div>`;
        } catch (err) {
            stateEl.innerHTML = `<div class="banner danger">AI triage is unavailable right now. Please fill in the fields manually.</div>`;
        }
        btn.disabled = false;
    }, 700);
});

document.getElementById('reportIssueForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const asset = getAsset(reportForAssetCode);
    if (!asset) return;

    const issue = {
        id: `ISS-${db.issueSeq++}`,
        assetCode: asset.code,
        title: fd.get('title').trim(),
        category: fd.get('category'),
        priority: fd.get('priority'),
        status: 'Reported',
        reporter: fd.get('reporter').trim(),
        assignee: '',
        description: fd.get('description').trim(),
        causes: fd.get('causes').trim(),
        checks: fd.get('checks').trim(),
        reportedAt: todayISO(),
        maintenance: null
    };
    db.issues.push(issue);
    asset.status = 'Issue Reported';
    addHistory(asset.code, issue.reporter, `Issue reported: ${issue.title}`, issue.id);
    persist();
    renderAll();
    closeModal('modal-reportIssue');
    toast(`Issue ${issue.id} submitted.`);
});

/* =========================================================
   ISSUE DETAIL + WORKFLOW
   ========================================================= */
let currentIssueId = null;

window.openIssueDetail = function (id) {
    currentIssueId = id;
    const i = getIssue(id);
    if (!i) return;
    const a = getAsset(i.assetCode);

    document.getElementById('id-title').textContent = i.title;
    document.getElementById('id-issueNo').textContent = i.id;
    document.getElementById('id-assetName').textContent = a ? a.name : i.assetCode;
    document.getElementById('id-statusBadge').innerHTML = `<span class="badge issue-${slug(i.status)}">${i.status}</span>`;
    document.getElementById('id-priorityChip').innerHTML = `<span class="priority-chip priority-${i.priority}">${i.priority} priority</span>`;
    document.getElementById('id-category').textContent = i.category;
    document.getElementById('id-reporter').textContent = i.reporter;
    document.getElementById('id-date').textContent = fmtDate(i.reportedAt);
    document.getElementById('id-assignee').textContent = i.assignee || '— Unassigned —';
    document.getElementById('id-description').textContent = i.description;
    document.getElementById('id-causes').textContent = i.causes || '—';
    document.getElementById('id-checks').textContent = i.checks || '—';

    const statusSel = document.getElementById('id-statusSelect');
    statusSel.innerHTML = ISSUE_STATUSES.map(s => `<option ${s === i.status ? 'selected' : ''}>${s}</option>`).join('');
    document.getElementById('id-assigneeInput').value = i.assignee || '';

    document.getElementById('id-maintNote').value = i.maintenance?.note || '';
    document.getElementById('id-maintParts').value = i.maintenance?.parts || '';
    document.getElementById('id-maintCost').value = i.maintenance?.cost ?? '';
    document.getElementById('id-maintDate').value = i.maintenance?.date || todayISO();
    document.getElementById('id-nextServiceDate').value = i.maintenance?.nextService || '';
    document.getElementById('id-formError').style.display = 'none';

    toggleMaintenanceFields(statusSel.value);

    // A closed issue may not be edited until reopened.
    const isClosed = i.status === 'Closed';
    document.getElementById('id-saveBtn').style.display = isClosed ? 'none' : 'inline-flex';

    openModal('modal-issueDetail');
};

function toggleMaintenanceFields(status) {
    const show = ['Resolved', 'Closed'].includes(status);
    document.getElementById('id-maintenanceFields').style.display = show ? 'block' : 'none';
}
document.getElementById('id-statusSelect').addEventListener('change', (e) => toggleMaintenanceFields(e.target.value));

document.getElementById('id-saveBtn').addEventListener('click', () => {
    const i = getIssue(currentIssueId);
    if (!i) return;
    const asset = getAsset(i.assetCode);
    const errEl = document.getElementById('id-formError');
    errEl.style.display = 'none';

    const newStatus = document.getElementById('id-statusSelect').value;
    const assignee = document.getElementById('id-assigneeInput').value.trim();
    const resolving = ['Resolved', 'Closed'].includes(newStatus);

    // Business rule: an issue should not be resolved without a maintenance note.
    if (resolving) {
        const note = document.getElementById('id-maintNote').value.trim();
        const cost = document.getElementById('id-maintCost').value;
        const compDate = document.getElementById('id-maintDate').value;
        const nextDate = document.getElementById('id-nextServiceDate').value;

        if (!note) {
            errEl.textContent = 'A maintenance note is required before this issue can be resolved or closed.';
            errEl.style.display = 'flex';
            return;
        }
        if (cost !== '' && Number(cost) < 0) {
            errEl.textContent = 'Maintenance cost cannot be negative.';
            errEl.style.display = 'flex';
            return;
        }
        if (nextDate && compDate && nextDate < compDate) {
            errEl.textContent = 'Next service date cannot be before the maintenance completion date.';
            errEl.style.display = 'flex';
            return;
        }

        i.maintenance = {
            note, parts: document.getElementById('id-maintParts').value.trim(),
            cost: cost === '' ? 0 : Number(cost), date: compDate || todayISO(), nextService: nextDate || ''
        };
        if (asset && nextDate) asset.nextService = nextDate;
        if (asset) asset.lastService = compDate || todayISO();
    }

    const statusChanged = i.status !== newStatus;
    i.status = newStatus;
    i.assignee = assignee;

    // Drive asset status from the issue status per the business-rule table.
    if (asset) {
        asset.status = ISSUE_TO_ASSET_STATUS[newStatus] || asset.status;
    }

    if (statusChanged) {
        addHistory(i.assetCode, assignee || 'Technician', `Status updated to ${newStatus}`, i.id);
    }
    if (resolving) {
        addHistory(i.assetCode, assignee || 'Technician', `Maintenance recorded: ${i.maintenance.note}`, i.id);
    }

    persist();
    renderAll();
    closeModal('modal-issueDetail');
    toast(`Issue ${i.id} updated.`);
});

/* =========================================================
   PUBLIC ASSET PAGE (hash routing: #/asset/<code>)
   ========================================================= */
function renderPublicPage(code) {
    const a = getAsset(code);
    const wrap = document.getElementById('publicPageContent');
    if (!a) {
        wrap.innerHTML = `
      <div class="public-head"><div class="brand-mark" style="background:var(--status-outofservice); color:#fff;">!</div><h2>Asset not found</h2></div>
      <p class="small-muted">This QR code or link does not match any known asset. Please check with facilities staff.</p>
      <div style="margin-top:20px;"><button class="btn btn-ghost" onclick="location.hash=''">Back to app</button></div>`;
        return;
    }
    const recentHist = assetHistory(a.code).filter(h => {
        // safe recent activity only — no private technician notes shown publicly
        return h.action.startsWith('Asset registered') || h.action.startsWith('Issue reported') || h.action.startsWith('Status updated');
    }).slice(0, 5);

    wrap.innerHTML = `
    <div class="public-head">
      <div class="brand-mark">Q</div>
      <div><div class="public-badge">Public asset page</div><h2>${escapeHtml(a.name)}</h2></div>
    </div>
    ${a.status === 'Retired' ? `<div class="retired-banner">This asset is retired and no longer in active service.</div>` : ''}
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-body" style="padding:16px 18px;">
        <div class="tag-code" style="padding-left:0; margin-bottom:10px;">${a.code}</div>
        <span class="badge status-${slug(a.status)}">${a.status}</span>
        <div class="info-list" style="margin-top:16px;">
          <div class="item"><div class="k">Category</div><div class="v">${escapeHtml(a.category)}</div></div>
          <div class="item"><div class="k">Location</div><div class="v">${escapeHtml(a.location)}</div></div>
          <div class="item"><div class="k">Current condition</div><div class="v">${a.condition}</div></div>
          <div class="item"><div class="k">Last service</div><div class="v">${fmtDate(a.lastService)}</div></div>
          <div class="item"><div class="k">Next service</div><div class="v">${fmtDate(a.nextService)}</div></div>
        </div>
      </div>
    </div>
    <div class="section-title">Recent activity</div>
    <div class="timeline" style="margin-bottom:20px;">
      ${recentHist.length ? recentHist.map(h => `
        <div class="timeline-item"><div class="timeline-dot"></div>
          <div class="body"><div class="action">${escapeHtml(h.action)}</div><div class="meta">${fmtDate(h.at)}</div></div>
        </div>`).join('') : '<div class="empty-row">No recent activity.</div>'}
    </div>
    ${a.status === 'Retired' ? '' : `<button class="btn btn-accent" style="width:100%; justify-content:center;" onclick="openPublicReportForm('${a.code}')">Report an issue</button>`}
    <div style="margin-top:10px; text-align:center;"><a href="#" onclick="location.hash=''; return false;" class="small-muted">Open full MaintainIQ dashboard →</a></div>
  `;
}

window.openPublicReportForm = function (code) {
    location.hash = '';
    setTimeout(() => { openReportIssue(code); }, 50);
};

function handleRoute() {
    const hash = location.hash;
    const match = hash.match(/^#\/asset\/(.+)$/);
    if (match) {
        const code = decodeURIComponent(match[1]);
        document.getElementById('appRoot').style.display = 'none';
        document.getElementById('publicPage').style.display = 'block';
        renderPublicPage(code);
    } else {
        document.getElementById('appRoot').style.display = 'flex';
        document.getElementById('publicPage').style.display = 'none';
    }
}
window.addEventListener('hashchange', handleRoute);

/* =========================================================
   SEARCH / FILTER LISTENERS
   ========================================================= */
['assetSearch', 'assetStatusFilter', 'assetCategoryFilter'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderAssets);
    document.getElementById(id).addEventListener('change', renderAssets);
});
['issueSearch', 'issueStatusFilter', 'issuePriorityFilter'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderIssues);
    document.getElementById(id).addEventListener('change', renderIssues);
});

/* =========================================================
   RESET DEMO DATA
   ========================================================= */
document.getElementById('resetDemoBtn').addEventListener('click', () => {
    if (!confirm('Reset all demo data? This clears every asset, issue, and history record you have added and restores the original five demo assets.')) return;
    db = seedData();
    persist();
    renderAll();
    toast('Demo data has been reset.');
});

/* =========================================================
   INIT
   ========================================================= */
renderAll();
handleRoute();