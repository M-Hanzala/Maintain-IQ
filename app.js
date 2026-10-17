/* =========================================================
   MaintainIQ — Track C frontend
   Supabase Auth + company-scoped PostgreSQL persistence.
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

const EMPTY_DB = () => ({ assets: [], issues: [], history: [], issueSeq: 1001 });
const supabaseConfig = window.MAINTAINIQ_SUPABASE_CONFIG || {};
const supabaseConfigured = Boolean(
    window.supabase?.createClient &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseConfig.url || '') &&
    typeof supabaseConfig.publishableKey === 'string' &&
    supabaseConfig.publishableKey.length > 20
);
const supabaseClient = supabaseConfigured
    ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.publishableKey)
    : null;

let db = EMPTY_DB();
let activeCompany = null;
let activeUser = null;
let persistedSnapshot = null;
let workspaceLoading = false;

function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
}

function showAuth(panel = 'loginForm', message = '') {
    document.getElementById('appRoot').style.display = 'none';
    document.getElementById('authScreen').hidden = false;
    document.getElementById('authError').hidden = true;
    document.getElementById('authMessage').hidden = !message;
    document.getElementById('authMessage').textContent = message;
    ['loginForm', 'signupForm', 'resetForm', 'recoveryForm', 'companyForm'].forEach(id => {
        document.getElementById(id).hidden = id !== panel;
    });
    document.getElementById('authConfigWarning').hidden = supabaseConfigured;
    document.querySelectorAll('#authScreen form input').forEach(input => { input.disabled = !supabaseConfigured; });
    document.querySelectorAll('#authScreen form button').forEach(button => { button.disabled = !supabaseConfigured; });
    document.querySelectorAll('#authScreen [data-auth-panel]').forEach(button => { button.disabled = !supabaseConfigured; });
}

function showAuthError(error) {
    const box = document.getElementById('authError');
    box.textContent = error?.message || String(error);
    box.hidden = false;
    document.getElementById('authMessage').hidden = true;
}

function requireSupabase() {
    if (!supabaseClient) throw new Error('Supabase is not configured. Set the project URL and publishable key in supabase-config.js.');
    return supabaseClient;
}

function assetFromRow(row) {
    return {
        code: row.code, name: row.name, category: row.category, location: row.location,
        condition: row.condition, status: row.status, lastService: row.last_service || '',
        nextService: row.next_service || '', createdAt: row.created_at, publicToken: row.public_token,
        _version: row.version
    };
}

function issueFromRow(row) {
    return {
        id: row.id, assetCode: row.asset_code, title: row.title, category: row.category,
        priority: row.priority, status: row.status, reporter: row.reporter, assignee: row.assignee,
        description: row.description, causes: row.causes, checks: row.checks,
        reportedAt: row.reported_at, maintenance: row.maintenance, _version: row.version
    };
}

function historyFromRow(row) {
    return { id: row.id, assetCode: row.asset_code, actor: row.actor, action: row.action, issueId: row.issue_id, at: row.at };
}

async function selectAllRows(buildQuery) {
    const rows = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await buildQuery().range(offset, offset + pageSize - 1);
        if (error) throw error;
        rows.push(...data);
        if (data.length < pageSize) return rows;
    }
}

function assetToRow(asset) {
    return {
        company_id: activeCompany.id, code: asset.code, name: asset.name, category: asset.category,
        location: asset.location, condition: asset.condition, status: asset.status,
        last_service: asset.lastService || null, next_service: asset.nextService || null,
        created_at: asset.createdAt, public_token: asset.publicToken, version: asset._version || 1
    };
}

function issueToRow(issue) {
    return {
        company_id: activeCompany.id, id: issue.id, asset_code: issue.assetCode, title: issue.title,
        category: issue.category, priority: issue.priority, status: issue.status, reporter: issue.reporter,
        assignee: issue.assignee, description: issue.description, causes: issue.causes, checks: issue.checks,
        reported_at: issue.reportedAt, maintenance: issue.maintenance, version: issue._version || 1
    };
}

function historyToRow(item) {
    return {
        id: item.id, company_id: activeCompany.id, asset_code: item.assetCode, actor: item.actor,
        action: item.action, issue_id: item.issueId, at: item.at
    };
}

async function loadCompanyData(companyId) {
    const client = requireSupabase();
    const [assetRows, issueRows, historyRows] = await Promise.all([
        selectAllRows(() => client.from('assets').select('*').eq('company_id', companyId).order('code')),
        selectAllRows(() => client.from('issues').select('*').eq('company_id', companyId).order('id')),
        selectAllRows(() => client.from('history').select('*').eq('company_id', companyId).order('id'))
    ]);
    const assets = assetRows.map(assetFromRow);
    const issues = issueRows.map(issueFromRow);
    const history = historyRows.map(historyFromRow);
    const nextIssue = issues.reduce((next, issue) => {
        const number = Number(issue.id.match(/\d+$/)?.[0]);
        return Number.isFinite(number) ? Math.max(next, number + 1) : next;
    }, 1001);
    return { assets, issues, history, issueSeq: nextIssue };
}

function comparableRecord(record) {
    const { _version, ...fields } = record;
    return JSON.stringify(fields);
}

async function syncRecords(table, key, records, before, toRow, returningFields) {
    const previousByKey = new Map(before.map(record => [record[key], record]));
    const changed = records.filter(record => {
        const previous = previousByKey.get(record[key]);
        return !previous || comparableRecord(record) !== comparableRecord(previous);
    });
    const inserts = changed.filter(record => !previousByKey.has(record[key]));
    const updates = changed.filter(record => previousByKey.has(record[key]));

    if (inserts.length) {
        const { data, error } = await supabaseClient.from(table).insert(inserts.map(toRow)).select(returningFields);
        if (error) throw error;
        const inserted = new Map((data || []).map(row => [row[key], row]));
        for (const record of inserts) {
            const row = inserted.get(record[key]);
            if (row) {
                record._version = row.version || 1;
                if (table === 'assets') record.publicToken = row.public_token;
            }
        }
    }

    for (const record of updates) {
        const previous = previousByKey.get(record[key]);
        const nextVersion = (previous._version || 1) + 1;
        const { data, error } = await supabaseClient.from(table)
            .update({ ...toRow(record), version: nextVersion })
            .eq('company_id', activeCompany.id)
            .eq(key, record[key])
            .eq('version', previous._version || 1)
            .select(returningFields);
        if (error) throw error;
        if (!data?.length) throw new Error(`This ${table === 'assets' ? 'asset' : 'issue'} changed in another session. Reload the workspace before saving again.`);
        record._version = nextVersion;
    }
}

async function persist() {
    const previousSnapshot = cloneData(db);
    try {
        await syncRecords('assets', 'code', db.assets, persistedSnapshot?.assets || [], assetToRow, 'code,public_token,version');
        await syncRecords('issues', 'id', db.issues, persistedSnapshot?.issues || [], issueToRow, 'id,version');
        const oldHistoryIds = new Set((persistedSnapshot?.history || []).map(item => item.id));
        const newHistory = db.history.filter(item => !oldHistoryIds.has(item.id));
        if (newHistory.length) {
            const { error } = await supabaseClient.from('history').insert(newHistory.map(historyToRow));
            if (error) throw error;
        }
        persistedSnapshot = cloneData(db);
    } catch (error) {
        try {
            db = await loadCompanyData(activeCompany.id);
            persistedSnapshot = cloneData(db);
            renderAll();
        } catch (reloadError) {
            db = previousSnapshot;
            throw new Error(`Save failed: ${error.message}. Workspace refresh also failed: ${reloadError.message}`);
        }
        throw error;
    }
}

async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function stableUuid(value) {
    const hex = (await sha256(value)).slice(0, 32).split('');
    hex[12] = '5';
    hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
    const text = hex.join('');
    return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}

async function importLegacyData(company) {
    let raw;
    try {
        raw = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
        throw new Error(`Could not read the existing local data: ${error.message}`);
    }
    if (!raw) return false;

    let legacy;
    try {
        legacy = JSON.parse(raw);
    } catch (error) {
        throw new Error(`The existing local data is not valid JSON and was left untouched: ${error.message}`);
    }
    if (!legacy || !Array.isArray(legacy.assets) || !Array.isArray(legacy.issues) || !Array.isArray(legacy.history)) {
        throw new Error('The existing local data has an unexpected format and was left untouched.');
    }
    if (!confirm(`Import ${legacy.assets.length} assets, ${legacy.issues.length} issues, and ${legacy.history.length} history records from this browser into "${company.name}"? Existing company records will never be overwritten. The local copy will remain in this browser.`)) return false;

    const sourceHash = await sha256(raw);
    const assets = legacy.assets.map(asset => ({
        company_id: company.id, code: asset.code, name: asset.name, category: asset.category,
        location: asset.location, condition: asset.condition, status: asset.status,
        last_service: asset.lastService || null, next_service: asset.nextService || null,
        created_at: asset.createdAt || todayISO()
    }));
    const issues = legacy.issues.map(issue => ({
        company_id: company.id, id: issue.id, asset_code: issue.assetCode, title: issue.title,
        category: issue.category, priority: issue.priority, status: issue.status,
        reporter: issue.reporter, assignee: issue.assignee || '', description: issue.description,
        causes: issue.causes || '', checks: issue.checks || '', reported_at: issue.reportedAt,
        maintenance: issue.maintenance || null
    }));
    const history = await Promise.all(legacy.history.map(async (item, index) => ({
        id: await stableUuid(`${sourceHash}:history:${index}:${JSON.stringify(item)}`),
        company_id: company.id, asset_code: item.assetCode, actor: item.actor,
        action: item.action, issue_id: item.issueId || null, at: item.at
    })));

    for (const [table, rows, conflict] of [
        ['assets', assets, 'company_id,code'],
        ['issues', issues, 'company_id,id'],
        ['history', history, 'id']
    ]) {
        if (!rows.length) continue;
        const { error } = await supabaseClient.from(table).upsert(rows, {
            onConflict: conflict,
            ignoreDuplicates: true
        });
        if (error) throw new Error(`Could not import legacy ${table}: ${error.message}`);
    }
    const importedNextIssue = legacy.issues.reduce((next, issue) => {
        const number = Number(String(issue.id).match(/\d+$/)?.[0]);
        return Number.isFinite(number) ? Math.max(next, number + 1) : next;
    }, Number.isInteger(legacy.issueSeq) ? Math.max(1001, legacy.issueSeq) : 1001);
    const { error: sequenceError } = await supabaseClient.rpc('advance_company_issue_sequence', {
        target_company_id: company.id,
        minimum_next: importedNextIssue
    });
    if (sequenceError) throw new Error(`Could not migrate the issue sequence: ${sequenceError.message}`);
    localStorage.setItem(`${STORAGE_KEY}_imported_${company.id}`, sourceHash);
    return true;
}

async function loadMemberships(user) {
    const client = requireSupabase();
    const { data: rows, error } = await client.from('company_members').select('company_id,role').eq('user_id', user.id);
    if (error) throw error;
    if (!rows.length) return [];
    const { data: companies, error: companiesError } = await client.from('companies')
        .select('id,name').in('id', rows.map(row => row.company_id)).order('name');
    if (companiesError) throw companiesError;
    return companies.map(company => ({
        ...company,
        role: rows.find(row => row.company_id === company.id)?.role || 'member'
    }));
}

function updateCompanySelector(companies) {
    const select = document.getElementById('companySelect');
    select.innerHTML = companies.map(company =>
        `<option value="${escapeHtml(company.id)}">${escapeHtml(company.name)}</option>`
    ).join('');
    select.value = activeCompany?.id || '';
}

async function openCompany(company, allowImport = true) {
    const companyData = await loadCompanyData(company.id);
    activeCompany = company;
    db = companyData;
    persistedSnapshot = cloneData(db);
    if (allowImport) {
        const marker = localStorage.getItem(`${STORAGE_KEY}_imported_${company.id}`);
        if (!marker && await importLegacyData(company)) {
            db = await loadCompanyData(company.id);
            persistedSnapshot = cloneData(db);
        }
    }
    renderAll();
    updateCompanySelector(window.maintainIqCompanies || [company]);
    document.getElementById('authScreen').hidden = true;
    document.getElementById('appRoot').style.display = 'flex';
    document.getElementById('resetDemoBtn').hidden = true;
    handleRoute();
}

async function initializeWorkspace(user) {
    if (workspaceLoading) return;
    workspaceLoading = true;
    activeUser = user;
    try {
        const companies = await loadMemberships(user);
        window.maintainIqCompanies = companies;
        if (!companies.length) {
            showAuth('companyForm', 'Register a company workspace to continue.');
            return;
        }
        const selected = companies.find(company => company.id === activeCompany?.id) || companies[0];
        updateCompanySelector(companies);
        await openCompany(selected);
    } finally {
        workspaceLoading = false;
    }
}

function showApplicationError(error) {
    showAuth();
    showAuthError(error);
}

function setupAuthentication() {
    if (!supabaseClient) {
        showAuth();
        return;
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
        setTimeout(() => {
            if (event === 'SIGNED_OUT') {
                activeUser = null;
                activeCompany = null;
                persistedSnapshot = null;
                db = EMPTY_DB();
                showAuth('loginForm', 'You have signed out.');
            } else if (event === 'SIGNED_IN' && session) {
                initializeWorkspace(session.user).catch(showApplicationError);
            } else if (event === 'PASSWORD_RECOVERY') {
                showAuth('recoveryForm', 'Choose a new password for your account.');
            }
        }, 0);
    });

    supabaseClient.auth.getSession().then(({ data, error }) => {
        if (error) throw error;
        if (data.session) initializeWorkspace(data.session.user).catch(showApplicationError);
        else showAuth();
    }).catch(showApplicationError);
}

document.querySelectorAll('[data-auth-panel]').forEach(button => {
    button.addEventListener('click', () => showAuth(button.dataset.authPanel));
});

document.getElementById('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
        const { error } = await requireSupabase().auth.signInWithPassword({
            email: form.get('email'), password: form.get('password')
        });
        if (error) throw error;
        showAuth('loginForm', 'Signing in…');
    } catch (error) {
        showAuthError(error);
    }
});

document.getElementById('signupForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
        const { data, error } = await requireSupabase().auth.signUp({
            email: form.get('email'),
            password: form.get('password'),
            options: { data: { company_name: form.get('company').trim() } }
        });
        if (error) throw error;
        if (!data.session) showAuth('loginForm', 'Check your email to confirm the account, then sign in.');
    } catch (error) {
        showAuthError(error);
    }
});

document.getElementById('resetForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
        const redirectTo = `${location.origin}${location.pathname}`;
        const { error } = await requireSupabase().auth.resetPasswordForEmail(form.get('email'), { redirectTo });
        if (error) throw error;
        showAuth('loginForm', 'If the account exists, a password reset link has been sent.');
    } catch (error) {
        showAuthError(error);
    }
});

document.getElementById('recoveryForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
        const { error } = await requireSupabase().auth.updateUser({ password: form.get('password') });
        if (error) throw error;
        showAuth('loginForm', 'Password updated. Sign in with your new password.');
        await requireSupabase().auth.signOut();
    } catch (error) {
        showAuthError(error);
    }
});

document.getElementById('companyForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
        const { error } = await requireSupabase().rpc('register_company', {
            company_name: form.get('company').trim()
        });
        if (error) throw error;
        await initializeWorkspace(activeUser);
    } catch (error) {
        showAuthError(error);
    }
});

document.getElementById('companyLogoutBtn').addEventListener('click', async () => {
    const { error } = await requireSupabase().auth.signOut();
    if (error) showAuthError(error);
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    const { error } = await requireSupabase().auth.signOut();
    if (error) toast(error.message, true);
});

document.getElementById('companySelect').addEventListener('change', async event => {
    const company = (window.maintainIqCompanies || []).find(item => item.id === event.target.value);
    if (!company) return;
    try {
        await openCompany(company);
    } catch (error) {
        event.target.value = activeCompany?.id || '';
        toast(`Could not load this company: ${error.message}`, true);
    }
});

document.getElementById('registerCompanyBtn').addEventListener('click', async () => {
    const name = prompt('Company name');
    if (!name?.trim()) return;
    try {
        const { data: companyId, error } = await requireSupabase().rpc('register_company', { company_name: name.trim() });
        if (error) throw error;
        const companies = await loadMemberships(activeUser);
        window.maintainIqCompanies = companies;
        const company = companies.find(item => item.id === companyId);
        if (!company) throw new Error('The company was created but could not be loaded into your account.');
        await openCompany(company);
        updateCompanySelector(companies);
    } catch (error) {
        toast(`Could not register company: ${error.message}`, true);
    }
});

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
    db.history.push({ id: crypto.randomUUID(), assetCode, actor, action, issueId, at: todayISO() });
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
    const asset = getAsset(code);
    return `${base}#/asset/${encodeURIComponent(asset?.publicToken || code)}`;
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
document.getElementById('addAssetForm').addEventListener('submit', async (e) => {
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
    try {
        await persist();
    } catch (error) {
        toast(`Could not save asset: ${error.message}`, true);
        return;
    }
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
    const asset = getAsset(currentAssetCode);
    if (!asset) return;
    location.hash = `/asset/${encodeURIComponent(asset.publicToken || asset.code)}`;
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
document.getElementById('ad-retireBtn').addEventListener('click', async () => {
    const a = getAsset(currentAssetCode);
    if (!a) return;
    if (!confirm(`Retire asset ${a.code}? This marks it as permanently removed from service.`)) return;
    a.status = 'Retired';
    addHistory(a.code, 'Administrator', 'Asset retired');
    try {
        await persist();
    } catch (error) {
        toast(`Could not retire asset: ${error.message}`, true);
        return;
    }
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

document.getElementById('reportIssueForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const asset = getAsset(reportForAssetCode);
    if (!asset) return;
    let issueId;
    try {
        const { data, error } = await requireSupabase().rpc('next_company_issue_id', {
            target_company_id: activeCompany.id
        });
        if (error) throw error;
        issueId = data;
    } catch (error) {
        toast(`Could not allocate an issue number: ${error.message}`, true);
        return;
    }

    const issue = {
        id: issueId,
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
    try {
        await persist();
    } catch (error) {
        toast(`Could not submit issue: ${error.message}`, true);
        return;
    }
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

document.getElementById('id-saveBtn').addEventListener('click', async () => {
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

    try {
        await persist();
    } catch (error) {
        toast(`Could not save issue: ${error.message}`, true);
        return;
    }
    renderAll();
    closeModal('modal-issueDetail');
    toast(`Issue ${i.id} updated.`);
});

/* =========================================================
   PUBLIC ASSET PAGE (hash routing: #/asset/<public-token>)
   ========================================================= */
async function renderPublicPage(identifier) {
    const wrap = document.getElementById('publicPageContent');
    wrap.innerHTML = '<div class="panel"><div class="panel-body">Loading asset…</div></div>';
    try {
        const { data, error } = await requireSupabase().rpc('get_public_asset', {
            public_identifier: identifier
        });
        if (error) throw error;
        if (!data) {
            wrap.innerHTML = `
      <div class="public-head"><div class="brand-mark" style="background:var(--status-outofservice); color:#fff;">!</div><h2>Asset not found</h2></div>
      <p class="small-muted">This QR code or link does not match any known asset. Please check with facilities staff.</p>
      <div style="margin-top:20px;"><button class="btn btn-ghost" onclick="location.hash=''">Back to app</button></div>`;
            return;
        }

        const a = data;
        const recentHist = data.history || [];
        wrap.innerHTML = `
    <div class="public-head">
      <div class="brand-mark">Q</div>
      <div><div class="public-badge">Public asset page</div><h2>${escapeHtml(a.name)}</h2></div>
    </div>
    ${a.status === 'Retired' ? `<div class="retired-banner">This asset is retired and no longer in active service.</div>` : ''}
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-body" style="padding:16px 18px;">
        <div class="tag-code" style="padding-left:0; margin-bottom:10px;">${escapeHtml(a.code)}</div>
        <span class="badge status-${slug(a.status)}">${escapeHtml(a.status)}</span>
        <div class="info-list" style="margin-top:16px;">
          <div class="item"><div class="k">Category</div><div class="v">${escapeHtml(a.category)}</div></div>
          <div class="item"><div class="k">Location</div><div class="v">${escapeHtml(a.location)}</div></div>
          <div class="item"><div class="k">Current condition</div><div class="v">${escapeHtml(a.condition)}</div></div>
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
    ${a.status === 'Retired' ? '' : `
      <button class="btn btn-accent" id="publicReportToggle" style="width:100%; justify-content:center;">Report an issue</button>
      <form id="publicReportForm" class="panel" style="display:none; margin-top:14px; padding:16px;">
        <div class="field"><label for="publicIssueTitle">Issue title</label><input id="publicIssueTitle" name="title" maxlength="160" required></div>
        <div class="field"><label for="publicIssueCategory">Category</label><input id="publicIssueCategory" name="category" maxlength="80" required></div>
        <div class="field"><label for="publicIssueReporter">Your name</label><input id="publicIssueReporter" name="reporter" maxlength="120" required></div>
        <div class="field"><label for="publicIssueDescription">Description</label><textarea id="publicIssueDescription" name="description" maxlength="4000" required></textarea></div>
        <div class="banner danger" id="publicIssueError" role="alert" hidden></div>
        <button class="btn btn-primary" type="submit">Submit report</button>
      </form>`}
    <div style="margin-top:10px; text-align:center;"><a href="#" onclick="location.hash=''; return false;" class="small-muted">Open full MaintainIQ dashboard →</a></div>
  `;
        const toggle = document.getElementById('publicReportToggle');
        const formElement = document.getElementById('publicReportForm');
        if (toggle && formElement) {
            toggle.addEventListener('click', () => { formElement.style.display = 'block'; });
            formElement.addEventListener('submit', async event => {
                event.preventDefault();
                const values = new FormData(event.currentTarget);
                const errorBox = document.getElementById('publicIssueError');
                try {
                    const { data: issueId, error: reportError } = await requireSupabase().rpc('submit_public_issue', {
                        public_identifier: a.publicToken || identifier,
                        issue_title: values.get('title').trim(),
                        issue_category: values.get('category').trim(),
                        reporter_name: values.get('reporter').trim(),
                        issue_description: values.get('description').trim()
                    });
                    if (reportError) throw reportError;
                    await renderPublicPage(a.publicToken || identifier);
                    const success = document.createElement('div');
                    success.className = 'banner';
                    success.textContent = `Report ${issueId} submitted successfully.`;
                    document.getElementById('publicPageContent').prepend(success);
                } catch (reportError) {
                    errorBox.textContent = reportError.message;
                    errorBox.hidden = false;
                }
            });
        }
    } catch (error) {
        wrap.innerHTML = `
      <div class="public-head"><div class="brand-mark" style="background:var(--status-outofservice); color:#fff;">!</div><h2>Asset unavailable</h2></div>
      <p class="small-muted">${escapeHtml(error.message)}</p>
      <div style="margin-top:20px;"><button class="btn btn-ghost" onclick="location.hash=''">Back to app</button></div>`;
    }
}

function handleRoute() {
    const hash = location.hash;
    const match = hash.match(/^#\/asset\/(.+)$/);
    if (match) {
        const code = decodeURIComponent(match[1]);
        document.getElementById('appRoot').style.display = 'none';
        document.getElementById('authScreen').hidden = true;
        document.getElementById('publicPage').style.display = 'block';
        renderPublicPage(code);
    } else {
        document.getElementById('publicPage').style.display = 'none';
        if (activeUser && activeCompany) {
            document.getElementById('authScreen').hidden = true;
            document.getElementById('appRoot').style.display = 'flex';
        } else {
            document.getElementById('appRoot').style.display = 'none';
            document.getElementById('authScreen').hidden = false;
        }
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
/* =========================================================
   INIT
   ========================================================= */
setupAuthentication();
handleRoute();