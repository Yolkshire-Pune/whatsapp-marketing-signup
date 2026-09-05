/**
 * Yolkshire WhatsApp Marketing Sign-up
 * Cloudflare Worker — replaces Google Apps Script Code.gs
 *
 * Static assets (index.html at /, admin.html at /admin) are served
 * by the Workers Assets binding — this worker handles API routes only.
 *
 * Routes:
 *   POST /submit       — signup form submission -> D1
 *   GET  /api/stats    — JSON BI API (token-protected)
 *   GET  /export       — WABA CSV download (token-protected)
 *   OPTIONS *          — CORS preflight
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // POST /submit — form submission
    if (request.method === 'POST' && pathname === '/submit') {
      return handleSubmit(request, env);
    }

    // GET /api/stats — BI JSON API
    if (request.method === 'GET' && pathname === '/api/stats') {
      return handleBiApi(request, env);
    }

    // GET /export — WABA CSV download
    if (request.method === 'GET' && pathname === '/export') {
      return handleCsvExport(request, env);
    }

    // All other requests fall through to Workers Assets if bound
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function verifyToken(token, env) {
  const configured = env.ADMIN_TOKEN;
  if (!configured || !token) return false;
  return token.trim() === configured.trim();
}

/**
 * Normalise Indian mobile numbers to 91XXXXXXXXXX (12 digits, no + or spaces)
 */
function normalisePhone(raw) {
  if (!raw) return '';
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('0091')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = '91' + d;
  return d;
}

/**
 * Return ISO timestamp string in Asia/Kolkata
 */
function nowIST() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).replace(' ', 'T');
}

/**
 * Returns an ISO string for the cutoff date of the given range filter
 * Returns null for 'all' (no cutoff)
 */
function getCutoffISO(range) {
  const now = new Date();
  if (range === 'today') {
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const startOfDay = new Date(ist.getFullYear(), ist.getMonth(), ist.getDate());
    return startOfDay.toISOString().slice(0, 10) + 'T00:00:00';
  }
  if (range === 'last7days') return new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 19);
  if (range === 'last30days') return new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 19);
  if (range === 'thismonth') {
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, '0')}-01T00:00:00`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleSubmit(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid request body.' }, 400);
  }

  const givenName  = (payload.givenName  || '').trim();
  const familyName = (payload.familyName || '').trim();
  const rawPhone   = (payload.phone      || '').trim();
  const branch     = (payload.branch     || 'General').trim();
  const source     = (payload.source     || 'QR Poster').trim();
  const consent    = payload.consent === true || payload.consent === 'true' || payload.consent === 'Yes' || payload.consent === 1;

  // Validation
  if (!givenName) {
    return jsonResponse({ success: false, error: 'Please enter your given name.' }, 400);
  }
  if (!rawPhone) {
    return jsonResponse({ success: false, error: 'Please enter a valid WhatsApp number.' }, 400);
  }
  if (!consent) {
    return jsonResponse({ success: false, error: "Please confirm that you'd like to receive WhatsApp updates." }, 400);
  }

  const phone = normalisePhone(rawPhone);
  if (phone.length < 12) {
    return jsonResponse({ success: false, error: 'Please enter a valid 10-digit mobile number.' }, 400);
  }

  const timestamp = nowIST();

  try {
    await env.DB.prepare(`
      INSERT INTO signups (timestamp, given_name, family_name, phone, branch, consent, source, status)
      VALUES (?, ?, ?, ?, ?, 'Yes', ?, 'New')
      ON CONFLICT(phone) DO UPDATE SET
        timestamp   = excluded.timestamp,
        given_name  = excluded.given_name,
        family_name = excluded.family_name,
        branch      = excluded.branch,
        source      = excluded.source,
        status      = 'Updated'
    `).bind(timestamp, givenName, familyName, phone, branch, source).run();

    return jsonResponse({ success: true, message: 'Successfully signed up!' });
  } catch (err) {
    console.error('D1 insert error:', err);
    return jsonResponse({ success: false, error: 'Something went wrong. Please try again.' }, 500);
  }
}

async function handleBiApi(request, env) {
  const url   = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  const range = url.searchParams.get('range') || 'all';

  if (!verifyToken(token, env)) {
    return jsonResponse({ success: false, error: 'Unauthorized: Invalid admin token' }, 401);
  }

  try {
    const cutoff = getCutoffISO(range);

    const totalRow = await env.DB.prepare('SELECT COUNT(*) as cnt FROM signups').first();
    const totalAllTime = totalRow ? Number(totalRow.cnt) : 0;

    let filteredTotal, branchRows, sourceRows, trendRows;

    if (cutoff) {
      const filteredRow = await env.DB.prepare(
        'SELECT COUNT(*) as cnt FROM signups WHERE timestamp >= ?'
      ).bind(cutoff).first();
      filteredTotal = filteredRow ? Number(filteredRow.cnt) : 0;

      branchRows = await env.DB.prepare(
        'SELECT branch, COUNT(*) as cnt FROM signups WHERE timestamp >= ? GROUP BY branch ORDER BY cnt DESC'
      ).bind(cutoff).all();

      sourceRows = await env.DB.prepare(
        'SELECT source, COUNT(*) as cnt FROM signups WHERE timestamp >= ? GROUP BY source ORDER BY cnt DESC'
      ).bind(cutoff).all();

      trendRows = await env.DB.prepare(
        "SELECT substr(timestamp, 1, 10) as day, COUNT(*) as cnt FROM signups WHERE timestamp >= ? GROUP BY day ORDER BY day"
      ).bind(cutoff).all();
    } else {
      filteredTotal = totalAllTime;

      branchRows = await env.DB.prepare(
        'SELECT branch, COUNT(*) as cnt FROM signups GROUP BY branch ORDER BY cnt DESC'
      ).all();

      sourceRows = await env.DB.prepare(
        'SELECT source, COUNT(*) as cnt FROM signups GROUP BY source ORDER BY cnt DESC'
      ).all();

      trendRows = await env.DB.prepare(
        "SELECT substr(timestamp, 1, 10) as day, COUNT(*) as cnt FROM signups GROUP BY day ORDER BY day"
      ).all();
    }

    const branchBreakdown = {};
    (branchRows.results || []).forEach(r => { branchBreakdown[r.branch] = Number(r.cnt); });

    const sourceBreakdown = {};
    (sourceRows.results || []).forEach(r => { sourceBreakdown[r.source] = Number(r.cnt); });

    const dailyTrend = {};
    (trendRows.results || []).forEach(r => { dailyTrend[r.day] = Number(r.cnt); });

    const contactRows = await env.DB.prepare(
      'SELECT timestamp, given_name, family_name, phone, branch, consent, source, status FROM signups ORDER BY id DESC LIMIT 100'
    ).all();

    const contacts = (contactRows.results || []).map(r => {
      let masked = String(r.phone || '');
      if (masked.length >= 10) {
        masked = masked.substring(0, 4) + '****' + masked.substring(masked.length - 2);
      }
      return {
        timestamp: r.timestamp,
        givenName: r.given_name,
        familyName: r.family_name,
        phone: masked,
        branch: r.branch,
        consent: r.consent,
        source: r.source,
        status: r.status,
      };
    });

    return jsonResponse({
      success: true,
      brand: 'Yolkshire',
      metric: 'whatsapp_marketing_optins',
      timeRange: range,
      generatedAt: nowIST(),
      totalOptIns: filteredTotal,
      totalAllTime,
      branchBreakdown,
      sourceBreakdown,
      dailyTrend,
      stats: {
        filteredTotal,
        totalAllTime,
        branches: branchBreakdown,
        sources: sourceBreakdown,
        dailyTrend,
      },
      contacts,
    });
  } catch (err) {
    console.error('BI API error:', err);
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleCsvExport(request, env) {
  const url   = new URL(request.url);
  const token = url.searchParams.get('token') || '';

  if (!verifyToken(token, env)) {
    return new Response('Unauthorized: Invalid admin token', {
      status: 401,
      headers: CORS_HEADERS,
    });
  }

  try {
    const rows = await env.DB.prepare(
      "SELECT phone, given_name, family_name, branch FROM signups WHERE consent = 'Yes' ORDER BY id ASC"
    ).all();

    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' }).replace(/-/g, '');
    let csv = 'Phone,Given Name,Family Name,Branch\r\n';
    (rows.results || []).forEach(r => {
      const phone      = String(r.phone       || '').replace(/"/g, '""');
      const givenName  = String(r.given_name  || '').replace(/"/g, '""');
      const familyName = String(r.family_name || '').replace(/"/g, '""');
      const branch     = String(r.branch      || 'General').replace(/"/g, '""');
      csv += `"${phone}","${givenName}","${familyName}","${branch}"\r\n`;
    });

    return new Response(csv, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="yolkshire_waba_contacts_${today}.csv"`,
      },
    });
  } catch (err) {
    console.error('CSV export error:', err);
    return new Response('Export failed: ' + err.message, { status: 500, headers: CORS_HEADERS });
  }
}
