/**
 * Yolkshire WhatsApp Marketing Sign-up
 * Google Apps Script Backend (Code.gs)
 */

// Global configuration defaults
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

    // Route: CSV Download
    if (page === "export") {
      return handleCsvExport(e);
    }

    // Route: Admin Page
    if (page === "admin") {
      const template = HtmlService.createTemplateFromFile("admin");
      template.pageTitle = "Yolkshire | Admin Dashboard";
      return template.evaluate()
        .setTitle("Yolkshire WhatsApp Admin")
        .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    // Default Route: Customer Sign-up Page
    const template = HtmlService.createTemplateFromFile("index");
    template.source = source;
    template.pageTitle = "Stay in the Yolkshire Loop!";
    return template.evaluate()
      .setTitle("Stay in the Yolkshire Loop! | WhatsApp Sign-up")
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

    const name = (payload.name || "").trim();
    const phone = (payload.phone || "").trim();
    const consent = payload.consent === true || payload.consent === "true" || payload.consent === "Yes" || payload.consent === 1;
    const source = (payload.source || "QR Poster").trim();

    // 1. Validation
    if (!name) {
      return createJsonResponse({ success: false, error: "Please enter your name." }, 400);
    }
    if (!phone) {
      return createJsonResponse({ success: false, error: "Please enter a valid WhatsApp number." }, 400);
    }
    if (!consent) {
      return createJsonResponse({ success: false, error: "Please confirm that you'd like to receive WhatsApp updates." }, 400);
    }

    // 2. Normalise Phone Number
    const normalisedPhone = normalisePhoneNumber(phone);
    if (!normalisedPhone || normalisedPhone.length < 10) {
      return createJsonResponse({ success: false, error: "Please enter a valid 10-digit mobile number." }, 400);
    }

    // 3. Save to Google Sheets (with duplicate handling)
    const result = saveOrUpdateContact({
      name: name,
      phone: normalisedPhone,
      consent: "Yes",
      source: source
    });

    return createJsonResponse({
      success: true,
      status: result.status,
      message: "Successfully signed up!"
    });

  } catch (err) {
    // Return friendly generic error to avoid exposing internals
    return createJsonResponse({
      success: false,
      error: "Something went wrong. Please try again."
    }, 500);
  }
}

/**
 * Helper to produce JSON output
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Normalises phone numbers into international format without '+' or spaces.
 * Default: India (+91)
 * Example outputs: 919876543210
 */
function normalisePhoneNumber(phoneStr) {
  if (!phoneStr) return "";
  // Strip all non-digit characters
  let digits = String(phoneStr).replace(/\D/g, "");

  // If starts with 0091, strip 00
  if (digits.startsWith("0091")) {
    digits = digits.substring(2);
  }

  // If 11 digits starting with 0 (e.g. 09876543210), strip 0
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.substring(1);
  }

  // If standard 10 digit Indian number, prepend 91
  if (digits.length === 10) {
    digits = "91" + digits;
  }

  return digits;
}

/**
 * Resolves active Sheet instance
 */
function getSheet() {
  const props = PropertiesService.getScriptProperties();
  const configuredSheetId = props.getProperty(SCRIPT_PROP_SHEET_ID);

  let ss;
  if (configuredSheetId) {
    ss = SpreadsheetApp.openById(configuredSheetId);
  } else {
    // Fallback: check if script is container-bound to a Sheet
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
    // Create sheet and initialize headers if not existing
    sheet = ss.insertSheet(DEFAULT_SHEET_NAME);
    sheet.appendRow(["Timestamp", "Name", "Phone", "Consent", "Source", "Status"]);
    sheet.getRange(1, 1, 1, 6).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Formats current timestamp
 */
function getCurrentTimestamp() {
  const now = new Date();
  return Utilities.formatDate(now, Session.getScriptTimeZone() || "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss");
}

/**
 * Handles duplicate checking and updates/inserts records
 */
function saveOrUpdateContact(data) {
  const sheet = getSheet();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // Wait up to 10 seconds to avoid race conditions

  try {
    const lastRow = sheet.getLastRow();
    const timestamp = getCurrentTimestamp();

    if (lastRow > 1) {
      // Fetch existing phone numbers (Column C)
      const phoneValues = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
      for (let i = 0; i < phoneValues.length; i++) {
        const existingPhone = String(phoneValues[i][0]).trim();
        if (existingPhone === String(data.phone)) {
          const rowToUpdate = i + 2;
          // Update Timestamp (Col A), Name (Col B), Consent (Col D), Source (Col E), Status (Col F)
          sheet.getRange(rowToUpdate, 1).setValue(timestamp);
          sheet.getRange(rowToUpdate, 2).setValue(data.name);
          sheet.getRange(rowToUpdate, 4).setValue(data.consent);
          sheet.getRange(rowToUpdate, 5).setValue(data.source);
          sheet.getRange(rowToUpdate, 6).setValue("Updated");
          return { status: "updated", row: rowToUpdate };
        }
      }
    }

    // No duplicate found -> Append new row
    sheet.appendRow([
      timestamp,
      data.name,
      "'" + data.phone, // Prepend quote to preserve string format in Sheets
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
 * Validates admin token strictly against Script Properties (no hardcoded fallback)
 */
function verifyAdminToken(token) {
  if (!token) return false;
  const props = PropertiesService.getScriptProperties();
  const configured = props.getProperty(SCRIPT_PROP_ADMIN_TOKEN);
  if (!configured) {
    // If admin has not set ADMIN_TOKEN in Script Properties, deny all access for safety
    return false;
  }
  return token.trim() === configured.trim();
}

/**
 * Handles CSV export for WABA platform
 */
function handleCsvExport(e) {
  const token = (e && e.parameter && e.parameter.token) ? e.parameter.token : "";
  if (!verifyAdminToken(token)) {
    return ContentService.createTextOutput("Unauthorized: Invalid admin token")
      .setMimeType(ContentService.MimeType.TEXT);
  }

  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  let csvContent = "name,phone\r\n";

  if (lastRow > 1) {
    const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    for (let i = 0; i < data.length; i++) {
      const name = String(data[i][1] || "").replace(/"/g, '""');
      let phone = String(data[i][2] || "").replace(/\D/g, "");
      const consent = String(data[i][3] || "").toLowerCase();

      if (consent === "yes" && phone) {
        csvContent += "",\r\n;
      }
    }
  }

  return ContentService.createTextOutput(csvContent)
    .setMimeType(ContentService.MimeType.CSV)
    .downloadAsFile("yolkshire_waba_contacts_" + Utilities.formatDate(new Date(), "GMT", "yyyyMMdd") + ".csv");
}

/**
 * Remote method for Admin Dashboard
 */
function adminGetData(token) {
  if (!verifyAdminToken(token)) {
    return { success: false, error: "Unauthorized. Invalid admin token." };
  }

  try {
    const sheet = getSheet();
    const lastRow = sheet.getLastRow();
    let totalOptIns = 0;
    let todayOptIns = 0;
    const sourceBreakdown = {};
    const recentContacts = [];

    const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Kolkata", "yyyy-MM-dd");

    if (lastRow > 1) {
      const rows = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
      totalOptIns = rows.length;

      for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i];
        const timestamp = String(row[0] || "");
        const name = String(row[1] || "");
        let phone = String(row[2] || "").replace(/\D/g, "");
        const consent = String(row[3] || "");
        const source = String(row[4] || "Unknown");
        const status = String(row[5] || "New");

        if (timestamp.startsWith(todayStr)) {
          todayOptIns++;
        }

        sourceBreakdown[source] = (sourceBreakdown[source] || 0) + 1;

        // Collect top 50 recent records
        if (recentContacts.length < 50) {
          // Mask phone for preview (e.g. 9198****3210)
          let maskedPhone = phone;
          if (phone.length >= 10) {
            maskedPhone = phone.substring(0, 4) + "****" + phone.substring(phone.length - 2);
          }
          recentContacts.push({
            timestamp: timestamp,
            name: name,
            phone: maskedPhone,
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
        total: totalOptIns,
        today: todayOptIns,
        sources: sourceBreakdown
      },
      contacts: recentContacts
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
