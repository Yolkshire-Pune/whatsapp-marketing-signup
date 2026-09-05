/**
 * Yolkshire WhatsApp Marketing Sign-up
 * Google Apps Script Backend (Code.gs)
 */

const DEFAULT_SHEET_NAME = "WhatsApp Opt-ins";
const SCRIPT_PROP_SHEET_ID = "SHEET_ID";
const SCRIPT_PROP_ADMIN_TOKEN = "ADMIN_TOKEN";

/**
 * Serves the HTML Web App based on URL query parameters
 */
function doGet(e) {
  try {
    const page = (e && e.parameter && e.parameter.page) ? e.parameter.page.toLowerCase() : "signup";
    const source = (e && e.parameter && e.parameter.source) ? e.parameter.source : "QR Poster";
    const branch = (e && e.parameter && e.parameter.branch) ? e.parameter.branch : "";

    // Route: BI API
    if (page === "api") {
      return handleBiApi(e);
    }

    // Route: CSV Download
    if (page === "export") {
      return handleCsvExport(e);
    }

    // Route: Admin Page
    if (page === "admin") {
      const template = HtmlService.createTemplateFromFile("admin");
      template.pageTitle = "Yolkshire | WhatsApp Admin & BI";
      return template.evaluate()
        .setTitle("Yolkshire WhatsApp Admin & Branch Analytics")
        .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    // Default Route: Customer Sign-up Page
    const template = HtmlService.createTemplateFromFile("index");
    template.source = source;
    template.branch = branch;
    template.pageTitle = "Yolkshire Eggsclusive | What’s Cooking? You’ll Know First!";
    return template.evaluate()
      .setTitle("Yolkshire Eggsclusive | What’s Cooking? You’ll Know First!")
      .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  } catch (err) {
    return ContentService.createTextOutput("An unexpected error occurred: " + err.message)
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

/**
 * Handles JSON submission from the client
 */
function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    const givenName = (payload.givenName || "").trim();
    const familyName = (payload.familyName || "").trim();
    const phone = (payload.phone || "").trim();
    const branch = (payload.branch || "General").trim();
    const consent = payload.consent === true || payload.consent === "true" || payload.consent === "Yes" || payload.consent === 1;
    const source = (payload.source || "QR Poster").trim();

    // 1. Validation
    if (!givenName) {
      return createJsonResponse({ success: false, error: "Please enter your given name." }, 400);
    }
    if (!phone) {
      return createJsonResponse({ success: false, error: "Please enter a valid WhatsApp number." }, 400);
    }
    if (!consent) {
      return createJsonResponse({ success: false, error: "Please confirm that you'd like to receive WhatsApp updates." }, 400);
    }

    // 2. Normalise Phone Number (+91 standard)
    const normalisedPhone = normalisePhoneNumber(phone);
    if (!normalisedPhone || normalisedPhone.length < 10) {
      return createJsonResponse({ success: false, error: "Please enter a valid 10-digit mobile number." }, 400);
    }

    // 3. Save to Google Sheets (with duplicate handling)
    const result = saveOrUpdateContact({
      givenName: givenName,
      familyName: familyName,
      phone: normalisedPhone,
      branch: branch,
      consent: "Yes",
      source: source
    });

    return createJsonResponse({
      success: true,
      status: result.status,
      message: "Successfully signed up!"
    });

  } catch (err) {
    return createJsonResponse({
      success: false,
      error: "Something went wrong. Please try again."
    }, 500);
  }
}

function createJsonResponse(data, statusCode) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Normalises phone numbers into international format without '+' or spaces.
 * Example outputs: 919876543210
 */
function normalisePhoneNumber(phoneStr) {
  if (!phoneStr) return "";
  let digits = String(phoneStr).replace(/\D/g, "");

  if (digits.startsWith("0091")) {
    digits = digits.substring(2);
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.substring(1);
  }
  if (digits.length === 10) {
    digits = "91" + digits;
  }
  return digits;
}

/**
 * Resolves active Sheet instance and ensures schema:
 * Columns: Timestamp | Given Name | Family Name | Phone | Branch | Consent | Source | Status
 */
function getSheet() {
  const props = PropertiesService.getScriptProperties();
  const configuredSheetId = props.getProperty(SCRIPT_PROP_SHEET_ID);

  let ss;
  if (configuredSheetId) {
    ss = SpreadsheetApp.openById(configuredSheetId);
  } else {
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {
      ss = null;
    }
  }

  if (!ss) {
    throw new Error("Spreadsheet ID not found. Configure SHEET_ID in Script Properties.");
  }

  let sheet = ss.getSheetByName(DEFAULT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(DEFAULT_SHEET_NAME);
    sheet.appendRow(["Timestamp", "Given Name", "Family Name", "Phone", "Branch", "Consent", "Source", "Status"]);
    sheet.getRange(1, 1, 1, 8).setFontWeight("bold");
    sheet.setFrozenRows(1);
  } else {
    // Check if headers match 8 columns
    if (sheet.getLastColumn() < 8 && sheet.getLastRow() === 1) {
      sheet.getRange(1, 1, 1, 8).setValues([["Timestamp", "Given Name", "Family Name", "Phone", "Branch", "Consent", "Source", "Status"]]);
    }
  }

  return sheet;
}

function getCurrentTimestamp() {
  const now = new Date();
  return Utilities.formatDate(now, Session.getScriptTimeZone() || "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss");
}

/**
 * Handles duplicate checking and updates/inserts records
 * Column 4 = Phone
 */
function saveOrUpdateContact(data) {
  const sheet = getSheet();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const lastRow = sheet.getLastRow();
    const timestamp = getCurrentTimestamp();

    if (lastRow > 1) {
      // Column 4 is Phone
      const phoneValues = sheet.getRange(2, 4, lastRow - 1, 1).getValues();
      for (let i = 0; i < phoneValues.length; i++) {
        const existingPhone = String(phoneValues[i][0]).trim();
        if (existingPhone === String(data.phone)) {
          const rowToUpdate = i + 2;
          // Update Timestamp (1), Given Name (2), Family Name (3), Branch (5), Consent (6), Source (7), Status (8)
          sheet.getRange(rowToUpdate, 1).setValue(timestamp);
          sheet.getRange(rowToUpdate, 2).setValue(data.givenName);
          sheet.getRange(rowToUpdate, 3).setValue(data.familyName);
          sheet.getRange(rowToUpdate, 5).setValue(data.branch);
          sheet.getRange(rowToUpdate, 6).setValue(data.consent);
          sheet.getRange(rowToUpdate, 7).setValue(data.source);
          sheet.getRange(rowToUpdate, 8).setValue("Updated");
          return { status: "updated", row: rowToUpdate };
        }
      }
    }

    // No duplicate found -> Append new row
    sheet.appendRow([
      timestamp,
      data.givenName,
      data.familyName,
      "'" + data.phone,
      data.branch,
      data.consent,
      data.source,
      "New"
    ]);

    return { status: "new", row: sheet.getLastRow() };

  } finally {
    lock.releaseLock();
  }
}

/**
 * Validates admin token strictly against Script Properties
 */
function verifyAdminToken(token) {
  if (!token) return false;
  const props = PropertiesService.getScriptProperties();
  const configured = props.getProperty(SCRIPT_PROP_ADMIN_TOKEN);
  if (!configured) return false;
  return token.trim() === configured.trim();
}

/**
 * Handles CSV export exactly matching requirement:
 * Headers: Phone,Given Name,Family Name,Branch
 * Enforces phone uniqueness (first occurrence preserved).
 */
function handleCsvExport(e) {
  const token = (e && e.parameter && e.parameter.token) ? e.parameter.token : "";
  if (!verifyAdminToken(token)) {
    return ContentService.createTextOutput("Unauthorized: Invalid admin token")
      .setMimeType(ContentService.MimeType.TEXT);
  }

  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  let csvContent = "Phone,Given Name,Family Name,Branch\r\n";

  if (lastRow > 1) {
    const data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
    const seenPhones = {};

    for (let i = 0; i < data.length; i++) {
      const givenName = String(data[i][1] || "").replace(/"/g, '""');
      const familyName = String(data[i][2] || "").replace(/"/g, '""');
      let phone = String(data[i][3] || "").replace(/\D/g, "");
      const branch = String(data[i][4] || "General").replace(/"/g, '""');
      const consent = String(data[i][5] || "").toLowerCase();

      if (consent === "yes" && phone) {
        // Enforce deduplication so first occurrence is imported
        if (!seenPhones[phone]) {
          seenPhones[phone] = true;
          csvContent += '"' + phone + '","' + givenName + '","' + familyName + '","' + branch + '"\r\n';
        }
      }
    }
  }

  return ContentService.createTextOutput(csvContent)
    .setMimeType(ContentService.MimeType.CSV)
    .downloadAsFile("yolkshire_waba_contacts_" + Utilities.formatDate(new Date(), "GMT", "yyyyMMdd") + ".csv");
}

/**
 * Remote method for Admin Dashboard with Date Range & Branch Analytics
 */
function adminGetData(token, rangeFilter) {
  if (!verifyAdminToken(token)) {
    return { success: false, error: "Unauthorized. Invalid admin token." };
  }

  try {
    const sheet = getSheet();
    const lastRow = sheet.getLastRow();
    
    let totalAllTime = 0;
    let filteredCount = 0;
    const branchBreakdown = {};
    const sourceBreakdown = {};
    const dailyTrend = {};
    const recentContacts = [];

    const now = new Date();
    const timeZone = Session.getScriptTimeZone() || "Asia/Kolkata";
    const todayStr = Utilities.formatDate(now, timeZone, "yyyy-MM-dd");

    // Compute cutoff timestamp based on rangeFilter
    let cutoffDate = null;
    if (rangeFilter === "today") {
      cutoffDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (rangeFilter === "last7days") {
      cutoffDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    } else if (rangeFilter === "last30days") {
      cutoffDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    } else if (rangeFilter === "thismonth") {
      cutoffDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    if (lastRow > 1) {
      const rows = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
      totalAllTime = rows.length;

      for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i];
        const timestampStr = String(row[0] || "");
        const givenName = String(row[1] || "");
        const familyName = String(row[2] || "");
        let phone = String(row[3] || "").replace(/\D/g, "");
        const branch = String(row[4] || "General");
        const consent = String(row[5] || "");
        const source = String(row[6] || "Unknown");
        const status = String(row[7] || "New");

        const rowDate = new Date(timestampStr.replace(/-/g, "/"));
        const isInRange = !cutoffDate || rowDate >= cutoffDate;

        if (isInRange) {
          filteredCount++;
          branchBreakdown[branch] = (branchBreakdown[branch] || 0) + 1;
          sourceBreakdown[source] = (sourceBreakdown[source] || 0) + 1;

          const dateKey = timestampStr.substring(0, 10);
          if (dateKey) {
            dailyTrend[dateKey] = (dailyTrend[dateKey] || 0) + 1;
          }
        }

        // Top 50 contacts list
        if (recentContacts.length < 50) {
          let maskedPhone = phone;
          if (phone.length >= 10) {
            maskedPhone = phone.substring(0, 4) + "****" + phone.substring(phone.length - 2);
          }
          recentContacts.push({
            timestamp: timestampStr,
            givenName: givenName,
            familyName: familyName,
            phone: maskedPhone,
            branch: branch,
            consent: consent,
            source: source,
            status: status
          });
        }
      }
    }

    return {
      success: true,
      stats: {
        totalAllTime: totalAllTime,
        filteredTotal: filteredCount,
        range: rangeFilter || "all",
        branches: branchBreakdown,
        sources: sourceBreakdown,
        dailyTrend: dailyTrend
      },
      contacts: recentContacts
    };

  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Endpoint for External Yolkshire BI Dashboard API
 * URL: /exec?page=api&token=YOUR_TOKEN&range=last7days
 */
function handleBiApi(e) {
  const token = (e && e.parameter && e.parameter.token) ? e.parameter.token : "";
  if (!verifyAdminToken(token)) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Unauthorized: Invalid admin token" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const range = (e && e.parameter && e.parameter.range) ? e.parameter.range : "all";
  const result = adminGetData(token, range);

  if (!result.success) {
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Structure clean BI summary
  const biPayload = {
    success: true,
    brand: "Yolkshire",
    metric: "whatsapp_marketing_optins",
    timeRange: range,
    generatedAt: getCurrentTimestamp(),
    totalOptIns: result.stats.filteredTotal,
    totalAllTime: result.stats.totalAllTime,
    branchBreakdown: result.stats.branches,
    sourceBreakdown: result.stats.sources,
    dailyTrend: result.stats.dailyTrend
  };

  return ContentService.createTextOutput(JSON.stringify(biPayload, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}