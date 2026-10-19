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
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const { pathname } = url;

    // 1. Redirect from old workers.dev domain to custom domains
    if (host === 'whatsapp.yolkshire.workers.dev' || (host.includes('whatsapp') && host.endsWith('.workers.dev'))) {
      if (pathname === '/admin' || pathname === '/admin.html') {
        return Response.redirect(`https://admin.insider.yolkshire.com/${url.search}`, 301);
      }
      return Response.redirect(`https://insider.yolkshire.com${url.pathname}${url.search}`, 301);
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // 2. Identify portal front door: admin.insider.yolkshire.com vs insider.yolkshire.com
    const isAdminHost = host.startsWith('admin.') || (
      (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.workers.dev')) &&
      url.searchParams.get('portal') === 'admin'
    );

    // If customer visits /admin on customer-facing insider.yolkshire.com, redirect to admin.insider.yolkshire.com
    if (!isAdminHost && (pathname === '/admin' || pathname === '/admin.html') && host.includes('yolkshire.com')) {
      return Response.redirect(`https://admin.insider.yolkshire.com/${url.search}`, 302);
    }

    // If visiting admin subdomain at root '/' or '/index.html', redirect to '/admin' so the console opens directly
    if (isAdminHost && (pathname === '/' || pathname === '' || pathname === '/index.html')) {
      return Response.redirect(`https://admin.insider.yolkshire.com/admin${url.search}`, 302);
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

    // Static assets serving via Workers Assets binding
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      // On admin subdomain (admin.insider.yolkshire.com), ensure /admin or / serves admin.html
      if (isAdminHost && (pathname === '/' || pathname === '' || pathname === '/admin')) {
        const adminUrl = new URL('/admin.html', request.url);
        return env.ASSETS.fetch(new Request(adminUrl.toString(), {
          method: request.method,
          headers: request.headers,
        }));
      }
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

function verifyToken(tokenOrRequest, env) {
  const configured = env.ADMIN_TOKEN;
  if (!configured) return false;

  let token = '';
  if (typeof tokenOrRequest === 'string') {
    token = tokenOrRequest;
  } else if (tokenOrRequest && typeof tokenOrRequest.headers?.get === 'function') {
    const authHeader = tokenOrRequest.headers.get('Authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else {
      const url = new URL(tokenOrRequest.url);
      token = url.searchParams.get('token') || '';
    }
  }

  if (!token) return false;
  return token.trim() === configured.trim();
}

/**
 * Normalise Indian mobile numbers to 91XXXXXXXXXX (12 digits, no + or spaces)
 * Strict validation: mobile number part must be 10 digits starting with 6, 7, 8, or 9
 */
function normalisePhone(raw) {
  if (!raw) return '';
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('0091')) d = d.slice(4);
  else if (d.startsWith('91') && d.length === 12) d = d.slice(2);
  else if (d.startsWith('0') && d.length === 11) d = d.slice(1);

  if (d.length === 10 && /^[6-9]\d{9}$/.test(d)) {
    return '91' + d;
  }
  return '';
}

/**
 * Return ISO timestamp string in Asia/Kolkata
 */
function nowIST() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).replace(' ', 'T');
}

/**
 * Returns an ISO string for the cutoff date of the given range filter in Asia/Kolkata
 * Returns null for 'all' (no cutoff)
 */
function getCutoffISO(range) {
  const now = new Date();
  if (range === 'today') {
    const todayIST = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });
    return todayIST + 'T00:00:00';
  }
  if (range === 'last7days') {
    const d = new Date(now.getTime() - 7 * 86400000);
    return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' }) + 'T00:00:00';
  }
  if (range === 'last30days') {
    const d = new Date(now.getTime() - 30 * 86400000);
    return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' }) + 'T00:00:00';
  }
  if (range === 'thismonth') {
    const todayIST = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });
    return todayIST.slice(0, 7) + '-01T00:00:00';
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

  const givenName  = (payload.givenName  || '').trim().slice(0, 60);
  const familyName = (payload.familyName || '').trim().slice(0, 60);
  const rawPhone   = (payload.phone      || '').trim();
  const branch     = (payload.branch     || 'General').trim().slice(0, 50);
  const source     = (payload.source     || 'QR Poster').trim().slice(0, 50);
  const consent    = payload.consent === true || payload.consent === 'true' || payload.consent === 'Yes' || payload.consent === 1;

  // Validation
  if (!givenName) {
    return jsonResponse({ success: false, error: 'Please enter your first name.' }, 400);
  }
  if (!rawPhone) {
    return jsonResponse({ success: false, error: 'Please enter a valid WhatsApp number.' }, 400);
  }
  if (!consent) {
    return jsonResponse({ success: false, error: "Please confirm that you'd like to receive WhatsApp updates." }, 400);
  }

  const phone = normalisePhone(rawPhone);
  if (!phone) {
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
  const range = url.searchParams.get('range') || 'all';

  if (!verifyToken(request, env)) {
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
      brand: 'Yolkshire Insider Eggsclusive',
      metric: 'eggsclusive_marketing_optins',
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
  if (!verifyToken(request, env)) {
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
        'Content-Disposition': `attachment; filename="yolkshire_eggsclusive_contacts_${today}.csv"`,
      },
    });
  } catch (err) {
    console.error('CSV export error:', err);
    return new Response('Export failed: ' + err.message, { status: 500, headers: CORS_HEADERS });
  }
}
