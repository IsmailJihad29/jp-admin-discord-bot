/**
 * =========================================================================
 * JP ADMIN — EJP Mentorship Apps Script Backend
 * Version: v48 (Streamlined 10-Tab Core Architecture)
 * Target: Google Sheets Database & API Endpoint
 * =========================================================================
 */

var SCRIPT_VERSION = "v50";
var CONFIG = {
  SECRET_KEY: "JP_ADMIN_26", // Synced with .env DEFAULT_GAS_SECRET
  TIMEZONE: "Asia/Dhaka"
};

/**
 * -------------------------------------------------------------------------
 * 1. Schema Definitions: Exactly 10 Required Sheets
 * -------------------------------------------------------------------------
 */
var SCHEMA_DEFS = {
  "All Data": ["Name", "Your Course Email Address", "Mobile Number", "Discord Username", "Region", "Subregion", "Notes"],
  "Bot_Map": ["Email", "Name", "Discord Username", "Discord ID", "Status", "Region", "Subregion", "Phone", "Match Source", "Review Note"],
  "Attendance": ["Name", "Email", "Phone", "Discord ID", "Status", "Remarks"],
  "Daily Attendance": ["Timestamp", "Email Address", "Full Name", "Discord ID", "Attendance Status"],
  "Morning Attendance": ["Timestamp", "Email Address", "Full Name", "Discord ID", "Attendance Status"],
  "Leave_Requests": ["Request ID", "Timestamp", "Discord ID", "Name", "Email", "Start Date", "End Date", "Reason", "Status", "Mentor Note"],
  "Job_Sheets": ["Discord ID", "Name", "Email", "Sheet URL", "Sheet ID", "Tab GID", "Status", "Last Scraped"],
  "Jobs_Daily": ["Date", "Email", "Count", "Name", "Discord ID", "Total Rows", "New Rows", "Points"],
  "Interview_Log": ["Logged Date", "Name", "Discord ID", "Company", "Serial", "Interview Date", "Role Details", "Discord Link", "Timestamp"],
  "Job_Tasks": ["Task ID", "Timestamp", "Discord ID", "Student Name", "Company", "Role", "Tech Stack", "Deadline", "Submission Status", "GitHub Link", "Task Link", "Description Link", "Submitted At", "Mentor Status", "Mentor Note", "Points Awarded"],
  "Holidays": ["Start Date", "End Date", "Holiday Title", "Logged By", "Created At"]
};

// List of legacy/old sheets that should be removed if cleanup is requested
var LEGACY_SHEETS = [
  "Dawn_Attendance",
  "Appeal_Logs",
  "Question_Bank",
  "Scores",
  "Outreach_Daily",
  "Workshop_Attendance",
  "Resumes",
  "Projects",
  "Form_Templates"
];

/**
 * HTTP GET Endpoint for Health Checks & Diagnostics
 */
function doGet(e) {
  try {
    var params = e ? e.parameter : {};
    var action = params.action || "status";

    if (action === "status" || action === "doctor") {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      return jsonResponse(runDoctorCheck(ss));
    }

    if (!authenticate(params.secret)) {
      return errorResponse("Unauthorized: Invalid secret key", 401);
    }

    return jsonResponse({ status: "OK", version: SCRIPT_VERSION });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

/**
 * HTTP POST Router for Database Operations
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return errorResponse("Missing POST body", 400);
    }

    var payload = JSON.parse(e.postData.contents);
    if (!authenticate(payload.secret)) {
      return errorResponse("Unauthorized: Invalid secret key", 401);
    }

    var action = payload.action;
    var data = payload.data || {};
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    switch (action) {
      case "doctor":
        return jsonResponse(runDoctorCheck(ss));

      case "initSheets":
      case "setupFresh":
        return jsonResponse(setupAllRequiredSheets(ss, data.options));

      case "cleanupOldSheets":
        return jsonResponse(cleanupOldUnusedSheets(ss));

      case "getRoster":
        return jsonResponse(getRosterData(ss));

      case "syncRoster":
        return jsonResponse(syncRosterData(ss, data.members));

      case "updateStudentProfile":
        return jsonResponse(updateStudentProfileData(ss, data));

      case "setStudentStatus":
        return jsonResponse(setStudentStatusData(ss, data.discordId, data.status, data.note));

      case "getAttendance":
        return jsonResponse(getAttendanceData(ss));

      case "recordAttendance":
        return jsonResponse(recordAttendanceSession(ss, data));

      case "repairAttendance":
        return jsonResponse(repairAttendanceMatrix(ss));

      case "scanDailyAttendance":
        return jsonResponse(scanDailyAttendanceFromForm(ss, data.date));

      case "scanMorningAttendance":
        return jsonResponse(scanMorningAttendanceFromForm(ss, data.date));

      case "scanCustomAttendance":
        return jsonResponse(scanCustomAttendanceFromForm(ss, data.tabName, data.date, data.sessionLabel));

      case "getHolidays":
        return jsonResponse(getHolidaysData(ss));

      case "setHoliday":
        return jsonResponse(setHolidayData(ss, data));

      case "removeHoliday":
        return jsonResponse(removeHolidayData(ss, data.date));

      case "submitLeave":
        return jsonResponse(submitLeaveRequest(ss, data));

      case "updateLeave":
        return jsonResponse(updateLeaveRequest(ss, data));

      case "getLeaves":
        return jsonResponse(getLeavesList(ss, data.status));

      case "recordJobSheet":
        return jsonResponse(recordJobSheetUrl(ss, data));

      case "getJobSheets":
        return jsonResponse(getJobSheetsList(ss));

      case "recordJobDaily":
        return jsonResponse(recordJobDailyEntry(ss, data));

      case "getJobsDaily":
        return jsonResponse(getJobsDailyHistory(ss, data.days));

      case "recordInterview":
        return jsonResponse(recordInterviewEntry(ss, data));

      case "getInterviews":
        return jsonResponse(getInterviewsHistory(ss, data.days));

      case "recordJobTask":
        return jsonResponse(recordJobTaskEntry(ss, data));

      case "submitJobTask":
        return jsonResponse(submitJobTaskEntry(ss, data));

      case "reviewJobTask":
        return jsonResponse(reviewJobTaskEntry(ss, data));

      case "getJobTasks":
        return jsonResponse(getJobTasksList(ss, data.status));

      case "auditOverdueTasks":
        return jsonResponse(auditOverdueTasksBatch(ss));

      case "initCommandManual":
        return jsonResponse(setupBotCommandsManualTab(ss));

      default:
        return errorResponse("Unknown action: " + action, 400);
    }
  } catch (err) {
    return errorResponse("Internal Script Error: " + err.toString(), 500);
  }
}

/**
 * Authentication Helper
 */
function authenticate(secret) {
  var props = PropertiesService.getScriptProperties();
  var configuredKey = props.getProperty("SECRET_KEY") || CONFIG.SECRET_KEY;
  return secret && (secret === configuredKey);
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    data: data,
    version: SCRIPT_VERSION
  })).setMimeType(ContentService.MimeType.JSON);
}

function errorResponse(message, code) {
  return ContentService.createTextOutput(JSON.stringify({
    success: false,
    error: message,
    code: code || 400,
    version: SCRIPT_VERSION
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * -------------------------------------------------------------------------
 * 2. Sheet Provisioning: Creates ONLY Missing Tabs (Preserves Existing)
 * -------------------------------------------------------------------------
 */
function setupAllRequiredSheets(ss, options) {
  var created = [];
  var existing = [];

  for (var tabName in SCHEMA_DEFS) {
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
      var headers = SCHEMA_DEFS[tabName];
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#e2e8f0");
      sheet.setFrozenRows(1);
      created.push(tabName);
    } else {
      existing.push(tabName);
    }
  }

  return {
    status: "SUCCESS",
    createdTabs: created,
    existingTabs: existing,
    totalRequired: Object.keys(SCHEMA_DEFS).length
  };
}

/**
 * Optional Cleanup: Deletes unused legacy sheets from older versions
 */
function cleanupOldUnusedSheets(ss) {
  var removed = [];
  for (var i = 0; i < LEGACY_SHEETS.length; i++) {
    var legacyTab = LEGACY_SHEETS[i];
    var sheet = ss.getSheetByName(legacyTab);
    if (sheet && ss.getSheets().length > 1) {
      ss.deleteSheet(sheet);
      removed.push(legacyTab);
    }
  }
  return { status: "SUCCESS", removedTabs: removed };
}

/**
 * -------------------------------------------------------------------------
 * 3. Doctor Diagnostics
 * -------------------------------------------------------------------------
 */
function runDoctorCheck(ss) {
  var missingTabs = [];
  var tabStats = {};

  for (var tabName in SCHEMA_DEFS) {
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      missingTabs.push(tabName);
    } else {
      tabStats[tabName] = {
        rows: sheet.getLastRow(),
        cols: sheet.getLastColumn()
      };
    }
  }

  return {
    version: SCRIPT_VERSION,
    healthy: missingTabs.length === 0,
    missingTabs: missingTabs,
    tabStats: tabStats,
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    timezone: ss.getSpreadsheetTimeZone()
  };
}

/**
 * Helper to dynamically find column index by fuzzy matching header names
 */
function findHeaderColumnIndex(headers, possibleNames) {
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || "").toLowerCase().replace(/[^a-z0-9]/g, '');
    for (var j = 0; j < possibleNames.length; j++) {
      var target = possibleNames[j].toLowerCase().replace(/[^a-z0-9]/g, '');
      if (h === target || h.indexOf(target) !== -1) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * -------------------------------------------------------------------------
 * 4. Roster Management (Always Sync from 'All Data' to 'Bot_Map')
 * -------------------------------------------------------------------------
 */
function getRosterData(ss) {
  var sheet = ss.getSheetByName("Bot_Map");
  var allDataSheet = ss.getSheetByName("All Data");

  if (!sheet) {
    setupAllRequiredSheets(ss);
    sheet = ss.getSheetByName("Bot_Map");
  }

  var values = sheet ? sheet.getDataRange().getValues() : [];
  var students = [];

  if (values && values.length > 1) {
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      var student = {
        email: row[0] ? String(row[0]).trim() : "",
        name: row[1] ? String(row[1]).trim() : "",
        username: row[2] ? String(row[2]).trim() : "",
        discordId: row[3] ? String(row[3]).trim() : "",
        status: row[4] ? String(row[4]).trim().toLowerCase() : "active",
        region: row[5] ? String(row[5]).trim() : "",
        subregion: row[6] ? String(row[6]).trim() : "",
        phone: row[7] ? String(row[7]).trim() : "",
        matchSource: row[8] ? String(row[8]).trim() : "",
        reviewNote: row[9] ? String(row[9]).trim() : "",
        rowIndex: i + 1
      };
      if (student.discordId || student.email || student.name) {
        students.push(student);
      }
    }
  }

  // Fallback: If Bot_Map is empty, load directly from 'All Data' master tab using dynamic headers
  if (students.length === 0 && allDataSheet && allDataSheet.getLastRow() > 1) {
    var allDataRows = allDataSheet.getDataRange().getValues();
    var headers = allDataRows[0];

    var nameCol = findHeaderColumnIndex(headers, ["Name", "Full Name", "Student Name"]);
    var emailCol = findHeaderColumnIndex(headers, ["Your Course Email Address", "Course Email Address", "Course Email", "Email Address", "Email"]);
    var phoneCol = findHeaderColumnIndex(headers, ["Mobile Number", "Mobile", "Phone Number", "Phone", "WhatsApp Number"]);
    var discordCol = findHeaderColumnIndex(headers, ["Discord Username", "Discord Handle", "Discord User", "Discord Tag", "Discord"]);
    var regionCol = findHeaderColumnIndex(headers, ["Region", "Location"]);
    var subregionCol = findHeaderColumnIndex(headers, ["Subregion", "Area"]);

    if (nameCol === -1) nameCol = 0;
    if (emailCol === -1) emailCol = 1;
    if (phoneCol === -1) phoneCol = 2;
    if (discordCol === -1) discordCol = 3;

    for (var k = 1; k < allDataRows.length; k++) {
      var aRow = allDataRows[k];
      var aName = String(nameCol >= 0 ? aRow[nameCol] : "").trim();
      var aEmail = String(emailCol >= 0 ? aRow[emailCol] : "").trim();
      var aPhone = String(phoneCol >= 0 ? aRow[phoneCol] : "").trim();
      var aUsername = String(discordCol >= 0 ? aRow[discordCol] : "").trim();
      var aRegion = String(regionCol >= 0 ? aRow[regionCol] : "").trim();
      var aSubregion = String(subregionCol >= 0 ? aRow[subregionCol] : "").trim();

      if (aName || aEmail || aUsername) {
        students.push({
          email: aEmail,
          name: aName,
          username: aUsername,
          discordId: "",
          status: "active",
          region: aRegion,
          subregion: aSubregion,
          phone: aPhone,
          matchSource: "All Data Master",
          reviewNote: "",
          rowIndex: k + 1
        });
      }
    }
  }

  return { students: students };
}

function syncRosterData(ss, discordMembers) {
  var botMapSheet = ss.getSheetByName("Bot_Map");
  var allDataSheet = ss.getSheetByName("All Data");

  if (!botMapSheet) setupAllRequiredSheets(ss);
  botMapSheet = ss.getSheetByName("Bot_Map");
  allDataSheet = ss.getSheetByName("All Data");

  // 1. Read master student records from 'All Data' tab with dynamic column mapping
  var allDataStudents = [];
  if (allDataSheet && allDataSheet.getLastRow() > 1) {
    var allDataRows = allDataSheet.getDataRange().getValues();
    var headers = allDataRows[0];

    // Detect column indexes for: Name, Your Course Email Address, Mobile Number, Discord Username
    var nameCol = findHeaderColumnIndex(headers, ["Name", "Full Name", "Student Name"]);
    var emailCol = findHeaderColumnIndex(headers, ["Your Course Email Address", "Course Email Address", "Course Email", "Email Address", "Email"]);
    var phoneCol = findHeaderColumnIndex(headers, ["Mobile Number", "Mobile", "Phone Number", "Phone", "WhatsApp Number"]);
    var discordCol = findHeaderColumnIndex(headers, ["Discord Username", "Discord Handle", "Discord User", "Discord Tag", "Discord"]);
    var regionCol = findHeaderColumnIndex(headers, ["Region", "Location"]);
    var subregionCol = findHeaderColumnIndex(headers, ["Subregion", "Area"]);

    if (nameCol === -1) nameCol = 0;
    if (emailCol === -1) emailCol = 1;
    if (phoneCol === -1) phoneCol = 2;
    if (discordCol === -1) discordCol = 3;

    for (var i = 1; i < allDataRows.length; i++) {
      var row = allDataRows[i];
      var name = String(nameCol >= 0 ? row[nameCol] : "").trim();
      var email = String(emailCol >= 0 ? row[emailCol] : "").trim();
      var phone = String(phoneCol >= 0 ? row[phoneCol] : "").trim();
      var rawUsername = String(discordCol >= 0 ? row[discordCol] : "").trim();
      var uName = rawUsername.toLowerCase().replace(/^@/, '').split('#')[0].trim();
      var region = String(regionCol >= 0 ? row[regionCol] : "").trim();
      var subregion = String(subregionCol >= 0 ? row[subregionCol] : "").trim();

      if (name || email || uName) {
        allDataStudents.push({
          name: name,
          email: email,
          phone: phone,
          username: uName,
          rawUsername: rawUsername,
          region: region,
          subregion: subregion
        });
      }
    }
  }

  // 2. Index Discord members from the server
  var memberByUsername = {};
  var memberByName = {};
  var memberById = {};

  if (discordMembers && Array.isArray(discordMembers)) {
    discordMembers.forEach(function(m) {
      var dId = String(m.discordId || m.id || "").trim();
      var rawUsername = String(m.username || "").trim();
      var cleanUsername = rawUsername.toLowerCase().replace(/^@/, '').split('#')[0].trim();
      var displayName = String(m.displayName || m.name || "").trim().toLowerCase();

      var mObj = {
        discordId: dId,
        username: rawUsername,
        cleanUsername: cleanUsername,
        displayName: String(m.displayName || m.name || "").trim(),
        status: m.status || "active"
      };

      if (dId) memberById[dId] = mObj;
      if (cleanUsername) memberByUsername[cleanUsername] = mObj;
      if (displayName) memberByName[displayName] = mObj;
    });
  }

  // 3. Index existing Bot_Map rows
  var existingMapById = {};
  var existingMapByEmail = {};
  var existingMapByUser = {};
  var botMapRange = botMapSheet.getDataRange();
  var botMapValues = botMapRange.getValues();

  for (var j = 1; j < botMapValues.length; j++) {
    var bEmail = String(botMapValues[j][0] || "").trim().toLowerCase();
    var bUser = String(botMapValues[j][2] || "").trim().toLowerCase().replace(/^@/, '').split('#')[0].trim();
    var bId = String(botMapValues[j][3] || "").trim();

    if (bId) existingMapById[bId] = j;
    if (bEmail) existingMapByEmail[bEmail] = j;
    if (bUser) existingMapByUser[bUser] = j;
  }

  var synced = 0;
  var added = 0;
  var rowsToAppend = [];
  var processedBotMapRows = {};

  // 4. Always Sync All Students from 'All Data' into 'Bot_Map'
  allDataStudents.forEach(function(student) {
    var cleanUName = student.username;
    var cleanEmail = student.email.toLowerCase();
    var cleanName = student.name.toLowerCase();

    // Match with Discord member by username or display name
    var dMember = memberByUsername[cleanUName] || memberByName[cleanName] || null;
    var dId = dMember ? dMember.discordId : "";
    var currentUsername = dMember ? dMember.username : student.rawUsername;
    var status = dMember ? dMember.status : "active";

    // Check if student exists in Bot_Map
    var rowIdx = -1;
    if (dId && existingMapById[dId] !== undefined) {
      rowIdx = existingMapById[dId];
    } else if (cleanEmail && existingMapByEmail[cleanEmail] !== undefined) {
      rowIdx = existingMapByEmail[cleanEmail];
    } else if (cleanUName && existingMapByUser[cleanUName] !== undefined) {
      rowIdx = existingMapByUser[cleanUName];
    }

    if (rowIdx > 0 && botMapValues[rowIdx]) {
      botMapValues[rowIdx][0] = student.email || botMapValues[rowIdx][0];
      botMapValues[rowIdx][1] = student.name || botMapValues[rowIdx][1];
      botMapValues[rowIdx][2] = currentUsername || botMapValues[rowIdx][2];
      if (dId) botMapValues[rowIdx][3] = dId;
      botMapValues[rowIdx][4] = status;
      botMapValues[rowIdx][5] = student.region || botMapValues[rowIdx][5];
      botMapValues[rowIdx][6] = student.subregion || botMapValues[rowIdx][6];
      botMapValues[rowIdx][7] = student.phone || botMapValues[rowIdx][7];
      botMapValues[rowIdx][8] = "All Data Sync";
      processedBotMapRows[rowIdx] = true;
      synced++;
    } else {
      rowsToAppend.push([
        student.email,
        student.name,
        currentUsername,
        dId,
        status,
        student.region,
        student.subregion,
        student.phone,
        "All Data Master",
        ""
      ]);
      added++;
    }
  });

  // 5. Also sync any Discord members who might not be in 'All Data' yet
  if (discordMembers && Array.isArray(discordMembers)) {
    discordMembers.forEach(function(m) {
      var dId = String(m.discordId || m.id || "").trim();
      var rawUsername = String(m.username || "").trim();
      var cleanUsername = rawUsername.toLowerCase().replace(/^@/, '').split('#')[0].trim();
      var displayName = String(m.displayName || m.name || "").trim();

      if (!dId) return;

      var rowIdx = existingMapById[dId];
      if (rowIdx !== undefined && !processedBotMapRows[rowIdx]) {
        botMapValues[rowIdx][2] = rawUsername;
        botMapValues[rowIdx][3] = dId;
        botMapValues[rowIdx][4] = m.status || "active";
        processedBotMapRows[rowIdx] = true;
        synced++;
      } else if (rowIdx === undefined && !allDataStudents.some(function(s) { return s.username === cleanUsername; })) {
        rowsToAppend.push([
          m.email || "",
          displayName || rawUsername,
          rawUsername,
          dId,
          m.status || "active",
          m.region || "",
          m.subregion || "",
          m.phone || "",
          "Discord Sync",
          ""
        ]);
        added++;
      }
    });
  }

  // 6. Write updates to Bot_Map sheet
  if (botMapValues.length > 1 && synced > 0) {
    botMapSheet.getRange(1, 1, botMapValues.length, botMapValues[0].length).setValues(botMapValues);
  }

  if (rowsToAppend.length > 0) {
    var startRow = botMapSheet.getLastRow() + 1;
    botMapSheet.getRange(startRow, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);
  }

  return { status: "SUCCESS", syncedCount: synced, addedCount: added, totalAllData: allDataStudents.length };
}

function updateStudentProfileData(ss, data) {
  var sheet = ss.getSheetByName("Bot_Map");
  if (!sheet) return { error: "Bot_Map sheet not found" };

  var values = sheet.getDataRange().getValues();
  var discordId = String(data.discordId || "").trim();
  var targetRow = -1;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][3]).trim() === discordId) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow > 0) {
    if (data.email) sheet.getRange(targetRow, 1).setValue(data.email);
    if (data.name) sheet.getRange(targetRow, 2).setValue(data.name);
    if (data.region) sheet.getRange(targetRow, 6).setValue(data.region);
    if (data.subregion) sheet.getRange(targetRow, 7).setValue(data.subregion);
    if (data.phone) sheet.getRange(targetRow, 8).setValue(data.phone);
    if (data.reviewNote) sheet.getRange(targetRow, 10).setValue(data.reviewNote);
    return { status: "UPDATED", row: targetRow };
  }

  return { error: "Student not found in Bot_Map" };
}

function setStudentStatusData(ss, discordId, status, note) {
  var sheet = ss.getSheetByName("Bot_Map");
  if (!sheet) return { error: "Bot_Map sheet not found" };

  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][3]).trim() === String(discordId).trim()) {
      var row = i + 1;
      sheet.getRange(row, 5).setValue(status);
      if (note) sheet.getRange(row, 10).setValue(note);
      return { status: "SUCCESS", updatedStatus: status, row: row };
    }
  }

  return { status: "NOT_FOUND", discordId: discordId };
}

/**
 * -------------------------------------------------------------------------
 * 5. Attendance & Form Operations
 * -------------------------------------------------------------------------
 */

/**
 * Helper to parse any date value (Date object, timestamp string, DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD) into standard YYYY-MM-DD
 */
function parseDateToYMD(val, timezone) {
  if (!val) return "";
  var tz = timezone || CONFIG.TIMEZONE;
  if (val instanceof Date) {
    return Utilities.formatDate(val, tz, "yyyy-MM-dd");
  }
  var s = String(val).trim();
  if (!s) return "";

  // Check YYYY-MM-DD or YYYY/MM/DD
  var ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymd) {
    var y = ymd[1];
    var m = ("0" + ymd[2]).slice(-2);
    var d = ("0" + ymd[3]).slice(-2);
    return y + "-" + m + "-" + d;
  }

  // Check DD/MM/YYYY or MM/DD/YYYY or DD-MM-YYYY
  var dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) {
    var p1 = parseInt(dmy[1], 10);
    var p2 = parseInt(dmy[2], 10);
    var yr = dmy[3];
    var mo = "";
    var day = "";
    if (p1 > 12) {
      // Must be DD/MM/YYYY
      day = ("0" + p1).slice(-2);
      mo = ("0" + p2).slice(-2);
    } else if (p2 > 12) {
      // Must be MM/DD/YYYY
      mo = ("0" + p1).slice(-2);
      day = ("0" + p2).slice(-2);
    } else {
      // Form submissions default
      day = ("0" + p2).slice(-2);
      mo = ("0" + p1).slice(-2);
    }
    return yr + "-" + mo + "-" + day;
  }

  var dObj = new Date(s);
  if (!isNaN(dObj.getTime())) {
    return Utilities.formatDate(dObj, tz, "yyyy-MM-dd");
  }

  return s.substring(0, 10);
}

/**
 * Helper to dynamically locate a sheet tab by primary names or regex pattern
 */
function findSheetByPattern(ss, primaryNames, regexPattern) {
  for (var i = 0; i < primaryNames.length; i++) {
    var s = ss.getSheetByName(primaryNames[i]);
    if (s) return s;
  }
  var allSheets = ss.getSheets();
  for (var j = 0; j < allSheets.length; j++) {
    var name = allSheets[j].getName().trim();
    if (regexPattern && regexPattern.test(name)) {
      return allSheets[j];
    }
  }
  return null;
}

/**
 * Ensures all students present in Bot_Map have corresponding rows in Attendance sheet
 */
function syncAttendanceRosterStudents(ss) {
  var botMapSheet = ss.getSheetByName("Bot_Map");
  var attendanceSheet = ss.getSheetByName("Attendance");

  if (!attendanceSheet) {
    setupAllRequiredSheets(ss);
    attendanceSheet = ss.getSheetByName("Attendance");
  }
  if (!botMapSheet || !attendanceSheet) return;

  var botMapValues = botMapSheet.getDataRange().getValues();
  var attRange = attendanceSheet.getDataRange();
  var attValues = attRange.getValues();

  var existingIds = {};
  var existingEmails = {};

  for (var r = 1; r < attValues.length; r++) {
    var dId = String(attValues[r][3] || "").trim();
    var email = String(attValues[r][1] || "").toLowerCase().trim();
    if (dId) existingIds[dId] = true;
    if (email) existingEmails[email] = true;
  }

  var newRows = [];
  var lastCol = Math.max(attendanceSheet.getLastColumn(), 6);

  for (var b = 1; b < botMapValues.length; b++) {
    var bEmail = String(botMapValues[b][0] || "").toLowerCase().trim();
    var bName = String(botMapValues[b][1] || "").trim();
    var bId = String(botMapValues[b][3] || "").trim();
    var bStatus = String(botMapValues[b][4] || "active").toLowerCase().trim();
    var bPhone = String(botMapValues[b][7] || "").trim();

    // STRICT EXCLUSION: Never add Supervisors, Mentors, or Staff to student Attendance matrix!
    if (bStatus === 'supervisor' || bStatus === 'mentor' || bStatus === 'staff') {
      continue;
    }

    if ((bId && !existingIds[bId]) || (bEmail && !existingEmails[bEmail])) {
      var row = [bName, bEmail, bPhone, bId, bStatus, ""];
      while (row.length < lastCol) {
        row.push("A");
      }
      newRows.push(row);
      if (bId) existingIds[bId] = true;
      if (bEmail) existingEmails[bEmail] = true;
    }
  }

  if (newRows.length > 0) {
    attendanceSheet.getRange(attendanceSheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
  }
}

/**
 * Repairs attendance matrix, synchronizes roster, and normalizes column headers
 */
function repairAttendanceMatrix(ss) {
  var sheet = ss.getSheetByName("Attendance");
  if (!sheet) {
    setupAllRequiredSheets(ss);
    sheet = ss.getSheetByName("Attendance");
  }

  syncAttendanceRosterStudents(ss);

  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return { status: "SUCCESS", syncedStudents: 0, totalSessions: 0 };
  }

  var headers = values[0];
  var normalizedHeaders = [];
  for (var c = 0; c < headers.length; c++) {
    if (c < 6) {
      normalizedHeaders.push(headers[c]);
    } else {
      var h = headers[c];
      var str = (h instanceof Date) ? Utilities.formatDate(h, CONFIG.TIMEZONE, "yyyy-MM-dd") : String(h || "").trim();
      normalizedHeaders.push(str);
    }
  }

  sheet.getRange(1, 1, 1, normalizedHeaders.length).setNumberFormat("@").setValues([normalizedHeaders]);

  return {
    status: "SUCCESS",
    syncedStudents: values.length - 1,
    totalSessions: Math.max(0, headers.length - 6)
  };
}

function recordAttendanceSession(ss, data) {
  var sheet = ss.getSheetByName("Attendance");
  if (!sheet) return { error: "Attendance sheet not found" };

  // Always ensure all roster students are present in Attendance sheet
  syncAttendanceRosterStudents(ss);

  var dateStr = String(data.date || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd")).trim();
  var records = data.records || []; // array of { email, discordId, status: 'P' | 'L' | 'A' }

  var lastCol = Math.max(sheet.getLastColumn(), 6);
  var headerValues = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var dateColIndex = -1;

  for (var c = 6; c < headerValues.length; c++) {
    var hVal = headerValues[c];
    var hStr = "";
    if (hVal instanceof Date) {
      hStr = Utilities.formatDate(hVal, CONFIG.TIMEZONE, "yyyy-MM-dd");
    } else {
      hStr = String(hVal || "").trim();
    }

    if (hStr.toLowerCase() === dateStr.toLowerCase()) {
      dateColIndex = c + 1;
      break;
    }
  }

  if (dateColIndex === -1) {
    dateColIndex = lastCol + 1;
    sheet.getRange(1, dateColIndex).setNumberFormat("@").setValue(dateStr).setFontWeight("bold").setBackground("#e2e8f0");
  }

  var values = sheet.getDataRange().getValues();
  var idToRow = {};
  for (var r = 1; r < values.length; r++) {
    var dId = String(values[r][3] || "").trim();
    var email = String(values[r][1] || "").toLowerCase().trim();
    if (dId) idToRow["id:" + dId] = r + 1;
    if (email) idToRow["email:" + email] = r + 1;
  }

  var updatedCount = 0;
  var colUpdates = [];
  for (var i = 1; i < values.length; i++) {
    var currentCell = values[i][dateColIndex - 1];
    colUpdates.push([currentCell !== undefined && currentCell !== "" ? currentCell : "A"]);
  }

  records.forEach(function(rec) {
    var targetRow = (rec.discordId ? idToRow["id:" + rec.discordId] : null) || (rec.email ? idToRow["email:" + String(rec.email).toLowerCase()] : null);
    if (targetRow && targetRow >= 2 && targetRow <= values.length) {
      colUpdates[targetRow - 2][0] = rec.status;
      updatedCount++;
    }
  });

  if (colUpdates.length > 0) {
    sheet.getRange(2, dateColIndex, colUpdates.length, 1).setValues(colUpdates);
  }

  return { status: "SUCCESS", date: dateStr, updatedStudents: updatedCount, colIndex: dateColIndex };
}

function getAttendanceData(ss) {
  var sheet = ss.getSheetByName("Attendance");
  if (!sheet || sheet.getLastRow() <= 1) return { dates: [], rows: [] };

  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var dates = [];

  for (var c = 6; c < headers.length; c++) {
    var hVal = headers[c];
    if (!hVal) continue;
    var dStr = "";
    if (hVal instanceof Date) {
      dStr = Utilities.formatDate(hVal, CONFIG.TIMEZONE, "yyyy-MM-dd");
    } else {
      dStr = String(hVal).trim();
    }
    dates.push(dStr);
  }

  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var sessionMarks = {};
    for (var d = 0; d < dates.length; d++) {
      sessionMarks[dates[d]] = row[6 + d] || "A";
    }
    rows.push({
      name: row[0],
      email: row[1],
      phone: row[2],
      discordId: row[3],
      status: row[4],
      remarks: row[5],
      sessions: sessionMarks
    });
  }

  return { dates: dates, rows: rows };
}

/**
 * Daily Attendance Scanner (+1 Present, -1 Absent, 0 Leave)
 */
function scanDailyAttendanceFromForm(ss, dateStr) {
  var targetDate = dateStr || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");

  var formSheet = findSheetByPattern(ss, ["Daily Attendance", "Daily_Attendance", "Attendance Responses", "Form Responses 1"], /(daily|attendance\s*response|form\s*response)/i);
  var botMapSheet = ss.getSheetByName("Bot_Map");
  var attendanceSheet = ss.getSheetByName("Attendance");
  var leaveSheet = ss.getSheetByName("Leave_Requests");

  if (!formSheet) {
    var tabNames = ss.getSheets().map(function(s) { return s.getName(); });
    return {
      status: "FAILED",
      error: "Google Form 'Daily Attendance' response tab not found in spreadsheet. Available tabs: " + tabNames.join(", ")
    };
  }

  if (!botMapSheet || !attendanceSheet) {
    setupAllRequiredSheets(ss);
    botMapSheet = ss.getSheetByName("Bot_Map");
    attendanceSheet = ss.getSheetByName("Attendance");
  }

  // 1. Get active students from Bot_Map
  var botMapValues = botMapSheet.getDataRange().getValues();
  var students = [];
  for (var i = 1; i < botMapValues.length; i++) {
    var email = String(botMapValues[i][0] || "").toLowerCase().trim();
    var name = String(botMapValues[i][1] || "").trim();
    var uName = String(botMapValues[i][2] || "").toLowerCase().trim().replace(/^@/, '').split('#')[0].trim();
    var dId = String(botMapValues[i][3] || "").trim();
    var status = String(botMapValues[i][4] || "active").toLowerCase().trim();
    var phone = String(botMapValues[i][7] || "").replace(/[^0-9]/g, '');

    if (dId && status === 'active') {
      students.push({ email: email, name: name, username: uName, discordId: dId, phone: phone, rowIdx: i + 1 });
    }
  }

  // 2. Approved leaves
  var approvedLeaves = {};
  if (leaveSheet && leaveSheet.getLastRow() > 1) {
    var leaveValues = leaveSheet.getDataRange().getValues();
    for (var l = 1; l < leaveValues.length; l++) {
      var lDiscordId = String(leaveValues[l][2] || "").trim();
      var lStart = parseDateToYMD(leaveValues[l][5]);
      var lEnd = parseDateToYMD(leaveValues[l][6]);
      var lStatus = String(leaveValues[l][8] || "").trim().toLowerCase();

      if (lStatus === 'approved' && lDiscordId) {
        if (targetDate >= lStart && targetDate <= lEnd) {
          approvedLeaves[lDiscordId] = true;
        }
      }
    }
  }

  // 3. Scan Form responses with robust date parsing & matching
  var presentSubmissions = {};
  var matchedSubmissionsCount = 0;
  if (formSheet && formSheet.getLastRow() > 1) {
    var formValues = formSheet.getDataRange().getValues();
    for (var f = 1; f < formValues.length; f++) {
      var row = formValues[f];
      var rawTimestamp = row[0];
      var rowDate = parseDateToYMD(rawTimestamp);

      if (rowDate === targetDate || !dateStr) {
        matchedSubmissionsCount++;
        for (var c = 0; c < row.length; c++) {
          var rawVal = String(row[c] || "").trim();
          if (rawVal) {
            var cellLower = rawVal.toLowerCase().replace(/^@/, '').split('#')[0].trim();
            presentSubmissions[cellLower] = true;
            var numOnly = rawVal.replace(/[^0-9]/g, '');
            if (numOnly.length >= 7) {
              presentSubmissions[numOnly] = true;
            }
          }
        }
      }
    }
  }

  // 4. Calculate status
  var presentCount = 0;
  var absentCount = 0;
  var leaveCount = 0;
  var attendanceRecords = [];

  students.forEach(function(s) {
    var isPresent = false;
    if (s.email && presentSubmissions[s.email]) isPresent = true;
    if (s.username && presentSubmissions[s.username]) isPresent = true;
    if (s.discordId && presentSubmissions[s.discordId]) isPresent = true;
    if (s.phone && presentSubmissions[s.phone]) isPresent = true;
    if (s.name && presentSubmissions[s.name.toLowerCase()]) isPresent = true;

    var status = 'A';
    var pts = -1;

    if (isPresent) {
      status = 'P';
      pts = 1;
      presentCount++;
    } else if (approvedLeaves[s.discordId]) {
      status = 'L';
      pts = 0;
      leaveCount++;
    } else {
      status = 'A';
      pts = -1;
      absentCount++;
    }

    attendanceRecords.push({
      discordId: s.discordId,
      name: s.name,
      email: s.email,
      status: status,
      points: pts
    });
  });

  recordAttendanceSession(ss, { date: targetDate, records: attendanceRecords });

  return {
    status: "SUCCESS",
    session: "Daily",
    date: targetDate,
    formTabScanned: formSheet.getName(),
    matchedFormSubmissions: matchedSubmissionsCount,
    totalActive: students.length,
    present: presentCount,
    absent: absentCount,
    leave: leaveCount,
    records: attendanceRecords
  };
}

/**
 * Morning Attendance Scanner (+1 Present, -1 Absent, 0 Leave)
 */
function scanMorningAttendanceFromForm(ss, dateStr) {
  var targetDate = dateStr || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");
  var colDate = targetDate + " (Morning)";

  var formSheet = findSheetByPattern(ss, ["Morning Attendance", "Morning_Attendance"], /morning/i);
  var botMapSheet = ss.getSheetByName("Bot_Map");
  var attendanceSheet = ss.getSheetByName("Attendance");
  var leaveSheet = ss.getSheetByName("Leave_Requests");

  if (!formSheet) {
    var tabNames = ss.getSheets().map(function(s) { return s.getName(); });
    return {
      status: "FAILED",
      error: "Google Form 'Morning Attendance' response tab not found in spreadsheet. Available tabs: " + tabNames.join(", ")
    };
  }

  if (!botMapSheet || !attendanceSheet) {
    setupAllRequiredSheets(ss);
    botMapSheet = ss.getSheetByName("Bot_Map");
    attendanceSheet = ss.getSheetByName("Attendance");
  }

  // 1. Get active students from Bot_Map
  var botMapValues = botMapSheet.getDataRange().getValues();
  var students = [];
  for (var i = 1; i < botMapValues.length; i++) {
    var email = String(botMapValues[i][0] || "").toLowerCase().trim();
    var name = String(botMapValues[i][1] || "").trim();
    var uName = String(botMapValues[i][2] || "").toLowerCase().trim().replace(/^@/, '').split('#')[0].trim();
    var dId = String(botMapValues[i][3] || "").trim();
    var status = String(botMapValues[i][4] || "active").toLowerCase().trim();
    var phone = String(botMapValues[i][7] || "").replace(/[^0-9]/g, '');

    if (dId && status === 'active') {
      students.push({ email: email, name: name, username: uName, discordId: dId, phone: phone, rowIdx: i + 1 });
    }
  }

  // 2. Approved leaves
  var approvedLeaves = {};
  if (leaveSheet && leaveSheet.getLastRow() > 1) {
    var leaveValues = leaveSheet.getDataRange().getValues();
    for (var l = 1; l < leaveValues.length; l++) {
      var lDiscordId = String(leaveValues[l][2] || "").trim();
      var lStart = parseDateToYMD(leaveValues[l][5]);
      var lEnd = parseDateToYMD(leaveValues[l][6]);
      var lStatus = String(leaveValues[l][8] || "").trim().toLowerCase();

      if (lStatus === 'approved' && lDiscordId) {
        if (targetDate >= lStart && targetDate <= lEnd) {
          approvedLeaves[lDiscordId] = true;
        }
      }
    }
  }

  // 3. Scan Morning Form responses with robust date parsing & matching
  var presentSubmissions = {};
  var matchedSubmissionsCount = 0;
  if (formSheet && formSheet.getLastRow() > 1) {
    var formValues = formSheet.getDataRange().getValues();
    for (var f = 1; f < formValues.length; f++) {
      var row = formValues[f];
      var rawTimestamp = row[0];
      var rowDate = parseDateToYMD(rawTimestamp);

      if (rowDate === targetDate || !dateStr) {
        matchedSubmissionsCount++;
        for (var c = 0; c < row.length; c++) {
          var rawVal = String(row[c] || "").trim();
          if (rawVal) {
            var cellLower = rawVal.toLowerCase().replace(/^@/, '').split('#')[0].trim();
            presentSubmissions[cellLower] = true;
            var numOnly = rawVal.replace(/[^0-9]/g, '');
            if (numOnly.length >= 7) {
              presentSubmissions[numOnly] = true;
            }
          }
        }
      }
    }
  }

  // 4. Calculate status
  var presentCount = 0;
  var absentCount = 0;
  var leaveCount = 0;
  var attendanceRecords = [];

  students.forEach(function(s) {
    var isPresent = false;
    if (s.email && presentSubmissions[s.email]) isPresent = true;
    if (s.username && presentSubmissions[s.username]) isPresent = true;
    if (s.discordId && presentSubmissions[s.discordId]) isPresent = true;
    if (s.phone && presentSubmissions[s.phone]) isPresent = true;
    if (s.name && presentSubmissions[s.name.toLowerCase()]) isPresent = true;

    var status = 'A';
    var pts = -1;

    if (isPresent) {
      status = 'P';
      pts = 1;
      presentCount++;
    } else if (approvedLeaves[s.discordId]) {
      status = 'L';
      pts = 0;
      leaveCount++;
    } else {
      status = 'A';
      pts = -1;
      absentCount++;
    }

    attendanceRecords.push({
      discordId: s.discordId,
      name: s.name,
      email: s.email,
      status: status,
      points: pts
    });
  });

  recordAttendanceSession(ss, { date: colDate, records: attendanceRecords });

  return {
    status: "SUCCESS",
    session: "Morning",
    date: targetDate,
    colHeader: colDate,
    formTabScanned: formSheet.getName(),
    matchedFormSubmissions: matchedSubmissionsCount,
    totalActive: students.length,
    present: presentCount,
    absent: absentCount,
    leave: leaveCount,
    records: attendanceRecords
  };
}

/**
 * Custom Attendance Scanner from any specified sheet/tab
 */
function scanCustomAttendanceFromForm(ss, customTabName, dateStr, customLabel) {
  if (!customTabName) {
    return {
      status: "FAILED",
      error: "No custom sheet/tab name was provided."
    };
  }

  var targetDate = dateStr || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");

  // Search for the custom tab
  var formSheet = ss.getSheetByName(customTabName);
  if (!formSheet) {
    var rx = new RegExp(customTabName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    formSheet = findSheetByPattern(ss, [customTabName], rx);
  }

  if (!formSheet) {
    var tabNames = ss.getSheets().map(function(s) { return s.getName(); });
    return {
      status: "FAILED",
      error: "Tab '" + customTabName + "' not found in spreadsheet. Available tabs: " + tabNames.join(", ")
    };
  }

  var botMapSheet = ss.getSheetByName("Bot_Map");
  var attendanceSheet = ss.getSheetByName("Attendance");
  var leaveSheet = ss.getSheetByName("Leave_Requests");

  if (!botMapSheet || !attendanceSheet) {
    setupAllRequiredSheets(ss);
    botMapSheet = ss.getSheetByName("Bot_Map");
    attendanceSheet = ss.getSheetByName("Attendance");
  }

  // 1. Get active students from Bot_Map (excluding staff/mentors/supervisors)
  var botMapValues = botMapSheet.getDataRange().getValues();
  var students = [];
  for (var i = 1; i < botMapValues.length; i++) {
    var email = String(botMapValues[i][0] || "").toLowerCase().trim();
    var name = String(botMapValues[i][1] || "").trim();
    var uName = String(botMapValues[i][2] || "").toLowerCase().trim().replace(/^@/, '').split('#')[0].trim();
    var dId = String(botMapValues[i][3] || "").trim();
    var status = String(botMapValues[i][4] || "active").toLowerCase().trim();
    var phone = String(botMapValues[i][7] || "").replace(/[^0-9]/g, '');

    if (dId && status === 'active') {
      students.push({ email: email, name: name, username: uName, discordId: dId, phone: phone, rowIdx: i + 1 });
    }
  }

  // 2. Approved leaves
  var approvedLeaves = {};
  if (leaveSheet && leaveSheet.getLastRow() > 1) {
    var leaveValues = leaveSheet.getDataRange().getValues();
    for (var l = 1; l < leaveValues.length; l++) {
      var lDiscordId = String(leaveValues[l][2] || "").trim();
      var lStart = parseDateToYMD(leaveValues[l][5]);
      var lEnd = parseDateToYMD(leaveValues[l][6]);
      var lStatus = String(leaveValues[l][8] || "").trim().toLowerCase();

      if (lStatus === 'approved' && lDiscordId) {
        if (targetDate >= lStart && targetDate <= lEnd) {
          approvedLeaves[lDiscordId] = true;
        }
      }
    }
  }

  // 3. Scan custom form responses
  var presentSubmissions = {};
  var matchedSubmissionsCount = 0;
  if (formSheet && formSheet.getLastRow() > 1) {
    var formValues = formSheet.getDataRange().getValues();
    for (var f = 1; f < formValues.length; f++) {
      var row = formValues[f];
      var rawTimestamp = row[0];
      var rowDate = parseDateToYMD(rawTimestamp);

      if (rowDate === targetDate || !dateStr) {
        matchedSubmissionsCount++;
        for (var c = 0; c < row.length; c++) {
          var rawVal = String(row[c] || "").trim();
          if (rawVal) {
            var cellLower = rawVal.toLowerCase().replace(/^@/, '').split('#')[0].trim();
            presentSubmissions[cellLower] = true;
            var numOnly = rawVal.replace(/[^0-9]/g, '');
            if (numOnly.length >= 7) {
              presentSubmissions[numOnly] = true;
            }
          }
        }
      }
    }
  }

  // 4. Calculate status
  var presentCount = 0;
  var absentCount = 0;
  var leaveCount = 0;
  var attendanceRecords = [];

  students.forEach(function(s) {
    var isPresent = false;
    if (s.email && presentSubmissions[s.email]) isPresent = true;
    if (s.username && presentSubmissions[s.username]) isPresent = true;
    if (s.discordId && presentSubmissions[s.discordId]) isPresent = true;
    if (s.phone && presentSubmissions[s.phone]) isPresent = true;
    if (s.name && presentSubmissions[s.name.toLowerCase()]) isPresent = true;

    var status = 'A';
    var pts = -1;

    if (isPresent) {
      status = 'P';
      pts = 1;
      presentCount++;
    } else if (approvedLeaves[s.discordId]) {
      status = 'L';
      pts = 0;
      leaveCount++;
    } else {
      status = 'A';
      pts = -1;
      absentCount++;
    }

    attendanceRecords.push({
      discordId: s.discordId,
      name: s.name,
      email: s.email,
      status: status,
      points: pts
    });
  });

  var label = customLabel || formSheet.getName().replace(/Attendance|Responses|Form/gi, '').trim() || "Custom";
  var colHeader = targetDate + " (" + label + ")";

  recordAttendanceSession(ss, { date: colHeader, records: attendanceRecords });

  return {
    status: "SUCCESS",
    session: label,
    date: targetDate,
    colHeader: colHeader,
    formTabScanned: formSheet.getName(),
    matchedFormSubmissions: matchedSubmissionsCount,
    totalActive: students.length,
    present: presentCount,
    absent: absentCount,
    leave: leaveCount,
    records: attendanceRecords
  };
}

/**
 * -------------------------------------------------------------------------
 * Holidays & Offdays Management
 * -------------------------------------------------------------------------
 */
function getHolidaysData(ss) {
  var sheet = ss.getSheetByName("Holidays");
  if (!sheet || sheet.getLastRow() <= 1) return { holidays: [] };

  var values = sheet.getDataRange().getValues();
  var holidays = [];
  for (var i = 1; i < values.length; i++) {
    var sDate = parseDateToYMD(values[i][0]);
    var eDate = parseDateToYMD(values[i][1]) || sDate;
    var title = String(values[i][2] || "Offday").trim();
    var loggedBy = String(values[i][3] || "").trim();
    var createdAt = String(values[i][4] || "").trim();

    if (sDate) {
      holidays.push({
        startDate: sDate,
        endDate: eDate,
        title: title,
        loggedBy: loggedBy,
        createdAt: createdAt
      });
    }
  }
  return { holidays: holidays };
}

function setHolidayData(ss, data) {
  var sheet = ss.getSheetByName("Holidays");
  if (!sheet) {
    setupAllRequiredSheets(ss);
    sheet = ss.getSheetByName("Holidays");
  }

  var sDate = parseDateToYMD(data.startDate) || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");
  var eDate = parseDateToYMD(data.endDate) || sDate;
  var title = data.title || "Offday / Holiday";
  var loggedBy = data.loggedBy || "Mentor";
  var createdAt = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");

  sheet.appendRow([sDate, eDate, title, loggedBy, createdAt]);

  return {
    status: "SUCCESS",
    startDate: sDate,
    endDate: eDate,
    title: title
  };
}

function removeHolidayData(ss, dateStr) {
  var sheet = ss.getSheetByName("Holidays");
  if (!sheet || sheet.getLastRow() <= 1) return { status: "SUCCESS", removedCount: 0 };

  var targetDate = parseDateToYMD(dateStr);
  var values = sheet.getDataRange().getValues();
  var removed = 0;

  for (var i = values.length - 1; i >= 1; i--) {
    var sDate = parseDateToYMD(values[i][0]);
    var eDate = parseDateToYMD(values[i][1]) || sDate;
    if (sDate === targetDate || (targetDate >= sDate && targetDate <= eDate)) {
      sheet.deleteRow(i + 1);
      removed++;
    }
  }

  return {
    status: "SUCCESS",
    removedCount: removed,
    date: dateStr
  };
}

/**
 * -------------------------------------------------------------------------
 * 6. Leave Requests & Management
 * -------------------------------------------------------------------------
 */
function submitLeaveRequest(ss, data) {
  var sheet = ss.getSheetByName("Leave_Requests");
  if (!sheet) return { error: "Leave_Requests sheet not found" };

  var reqId = "LR-" + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyyMMdd") + "-" + Utilities.getUuid().substring(0, 4).toUpperCase();
  var timestamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");

  sheet.appendRow([
    reqId,
    timestamp,
    data.discordId || "",
    data.name || "",
    data.email || "",
    data.startDate || "",
    data.endDate || "",
    data.reason || "",
    "Pending",
    ""
  ]);

  return { status: "SUCCESS", requestId: reqId };
}

function updateLeaveRequest(ss, data) {
  var sheet = ss.getSheetByName("Leave_Requests");
  if (!sheet) return { error: "Leave_Requests sheet not found" };

  var values = sheet.getDataRange().getValues();
  var targetRow = -1;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === String(data.requestId).trim()) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow > 0) {
    sheet.getRange(targetRow, 9).setValue(data.status); // Status
    if (data.note) sheet.getRange(targetRow, 10).setValue(data.note);
    return { status: "SUCCESS", requestId: data.requestId, updatedStatus: data.status };
  }

  return { error: "Leave request not found" };
}

function getLeavesList(ss, statusFilter) {
  var sheet = ss.getSheetByName("Leave_Requests");
  if (!sheet || sheet.getLastRow() <= 1) return { leaves: [] };

  var values = sheet.getDataRange().getValues();
  var leaves = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var item = {
      requestId: String(row[0]),
      timestamp: String(row[1]),
      discordId: String(row[2]),
      name: String(row[3]),
      email: String(row[4]),
      startDate: String(row[5]),
      endDate: String(row[6]),
      reason: String(row[7]),
      status: String(row[8]),
      note: String(row[9])
    };

    if (!statusFilter || item.status.toLowerCase() === statusFilter.toLowerCase()) {
      leaves.push(item);
    }
  }

  return { leaves: leaves };
}

/**
 * -------------------------------------------------------------------------
 * 7. Job Sheet URLs & Daily Job Scraping Ledgers
 * -------------------------------------------------------------------------
 */
function recordJobSheetUrl(ss, data) {
  var sheet = ss.getSheetByName("Job_Sheets");
  if (!sheet) return { error: "Job_Sheets sheet not found" };

  var values = sheet.getDataRange().getValues();
  var dId = String(data.discordId || "").trim();
  var targetRow = -1;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === dId) {
      targetRow = i + 1;
      break;
    }
  }

  var now = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");

  if (targetRow > 0) {
    sheet.getRange(targetRow, 4).setValue(data.sheetUrl || "");
    sheet.getRange(targetRow, 5).setValue(data.sheetId || "");
    sheet.getRange(targetRow, 6).setValue(data.gid || "");
    sheet.getRange(targetRow, 7).setValue("Active");
    sheet.getRange(targetRow, 8).setValue(now);
    return { status: "UPDATED", row: targetRow };
  } else {
    sheet.appendRow([
      dId,
      data.name || "",
      data.email || "",
      data.sheetUrl || "",
      data.sheetId || "",
      data.gid || "",
      "Active",
      now
    ]);
    return { status: "CREATED", row: sheet.getLastRow() };
  }
}

function getJobSheetsList(ss) {
  var sheet = ss.getSheetByName("Job_Sheets");
  if (!sheet || sheet.getLastRow() <= 1) return { sheets: [] };

  var values = sheet.getDataRange().getValues();
  var sheets = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var dId = String(row[0] || "").trim();
    if (dId) {
      sheets.push({
        discordId: dId,
        name: String(row[1] || ""),
        email: String(row[2] || ""),
        sheetUrl: String(row[3] || ""),
        sheetId: String(row[4] || ""),
        gid: String(row[5] || "0"),
        status: String(row[6] || "Active"),
        lastScraped: String(row[7] || "")
      });
    }
  }

  return { sheets: sheets };
}

function recordJobDailyEntry(ss, data) {
  var sheet = ss.getSheetByName("Jobs_Daily");
  if (!sheet) return { error: "Jobs_Daily sheet not found" };

  var dateStr = data.date || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");

  sheet.appendRow([
    dateStr,
    data.email || "",
    data.count || 0,
    data.name || "",
    data.discordId || "",
    data.totalRows || data.count || 0,
    data.newRows || data.count || 0,
    data.points || 0
  ]);

  return { status: "SUCCESS", date: dateStr };
}

function getJobsDailyHistory(ss, days) {
  var sheet = ss.getSheetByName("Jobs_Daily");
  if (!sheet || sheet.getLastRow() <= 1) return { jobs: [] };

  var values = sheet.getDataRange().getValues();
  var jobs = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    jobs.push({
      date: String(row[0]),
      email: String(row[1]),
      count: Number(row[2]) || 0,
      name: String(row[3]),
      discordId: String(row[4]),
      totalRows: Number(row[5]) || 0,
      newRows: Number(row[6]) || 0,
      points: Number(row[7]) || 0
    });
  }

  return { jobs: jobs };
}

/**
 * -------------------------------------------------------------------------
 * 8. Interview Preparation Logs (+5 Points)
 * -------------------------------------------------------------------------
 */
function recordInterviewEntry(ss, data) {
  var sheet = ss.getSheetByName("Interview_Log");
  if (!sheet) {
    setupAllRequiredSheets(ss);
    sheet = ss.getSheetByName("Interview_Log");
  }

  var now = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");
  var loggedDate = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");

  sheet.appendRow([
    loggedDate,
    data.name || "",
    data.discordId || "",
    data.company || "Company",
    data.serial || 1,
    data.interviewDate || loggedDate,
    data.roleDetails || "",
    data.discordLink || "",
    now
  ]);

  return { status: "SUCCESS", pointsAwarded: 5 };
}

function getInterviewsHistory(ss, days) {
  var sheet = ss.getSheetByName("Interview_Log");
  if (!sheet || sheet.getLastRow() <= 1) return { interviews: [] };

  var values = sheet.getDataRange().getValues();
  var interviews = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    interviews.push({
      loggedDate: String(row[0]),
      name: String(row[1]),
      discordId: String(row[2]),
      company: String(row[3]),
      serial: Number(row[4]) || 1,
      interviewDate: String(row[5]),
      roleDetails: String(row[6]),
      discordLink: String(row[7]),
      timestamp: String(row[8])
    });
  }

  return { interviews: interviews };
}

/**
 * -------------------------------------------------------------------------
 * 9. Job Task Lifecycle Engine (+1 Announced, +1 Approved, -2 Deadline Penalty)
 * -------------------------------------------------------------------------
 */
function recordJobTaskEntry(ss, data) {
  var sheet = ss.getSheetByName("Job_Tasks");
  if (!sheet) {
    setupAllRequiredSheets(ss);
    sheet = ss.getSheetByName("Job_Tasks");
  }

  var taskId = data.taskId || "TASK-" + Utilities.getUuid().substring(0, 8).toUpperCase();
  var timestamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");

  sheet.appendRow([
    taskId,
    timestamp,
    data.discordId || "",
    data.studentName || "",
    data.company || "",
    data.role || "",
    data.techStack || "",
    data.deadline || "",
    "Announced", // Submission Status
    "",          // GitHub Link
    "",          // Task Link
    "",          // Description Link
    "",          // Submitted At
    "Pending",   // Mentor Status
    "",          // Mentor Note
    1            // Points Awarded (+1 for Announcement)
  ]);

  return { status: "SUCCESS", taskId: taskId, pointsAwarded: 1 };
}

function submitJobTaskEntry(ss, data) {
  var sheet = ss.getSheetByName("Job_Tasks");
  if (!sheet) return { error: "Job_Tasks sheet not found" };

  var values = sheet.getDataRange().getValues();
  var taskId = String(data.taskId || "").trim();
  var discordId = String(data.discordId || "").trim();
  var targetRow = -1;

  for (var i = 1; i < values.length; i++) {
    var rowTaskId = String(values[i][0]).trim();
    var rowDiscordId = String(values[i][2]).trim();

    if (rowTaskId === taskId || (discordId && rowDiscordId === discordId && values[i][8] === 'Announced')) {
      targetRow = i + 1;
      taskId = rowTaskId;
      break;
    }
  }

  if (targetRow > 0) {
    var timestamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");
    sheet.getRange(targetRow, 9).setValue("Submitted");
    sheet.getRange(targetRow, 10).setValue(data.githubUrl || "");
    sheet.getRange(targetRow, 11).setValue(data.taskUrl || "");
    sheet.getRange(targetRow, 12).setValue(data.descriptionUrl || "");
    sheet.getRange(targetRow, 13).setValue(timestamp);
    return { status: "SUBMITTED", taskId: taskId, row: targetRow };
  }

  return { error: "Task not found or already submitted" };
}

function reviewJobTaskEntry(ss, data) {
  var sheet = ss.getSheetByName("Job_Tasks");
  if (!sheet) return { error: "Job_Tasks sheet not found" };

  var values = sheet.getDataRange().getValues();
  var taskId = String(data.taskId || "").trim();
  var mentorStatus = data.status || "Approved";
  var mentorNote = data.note || "";
  var targetRow = -1;
  var currentPoints = 1;
  var studentDiscordId = "";

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === taskId) {
      targetRow = i + 1;
      currentPoints = Number(values[i][15]) || 1;
      studentDiscordId = String(values[i][2]).trim();
      break;
    }
  }

  if (targetRow > 0) {
    var finalPoints = currentPoints;
    if (mentorStatus === "Approved") {
      finalPoints = currentPoints + 1; // +1 point for Approved task (Total 2)
    }
    sheet.getRange(targetRow, 14).setValue(mentorStatus);
    sheet.getRange(targetRow, 15).setValue(mentorNote);
    sheet.getRange(targetRow, 16).setValue(finalPoints);

    return {
      status: "SUCCESS",
      taskId: taskId,
      discordId: studentDiscordId,
      mentorStatus: mentorStatus,
      totalPointsAwarded: finalPoints
    };
  }

  return { error: "Task not found" };
}

function getJobTasksList(ss, statusFilter) {
  var sheet = ss.getSheetByName("Job_Tasks");
  if (!sheet || sheet.getLastRow() <= 1) return { tasks: [] };

  var values = sheet.getDataRange().getValues();
  var tasks = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var task = {
      taskId: String(row[0]),
      timestamp: String(row[1]),
      discordId: String(row[2]),
      studentName: String(row[3]),
      company: String(row[4]),
      role: String(row[5]),
      techStack: String(row[6]),
      deadline: String(row[7]),
      submissionStatus: String(row[8]),
      githubUrl: String(row[9]),
      taskUrl: String(row[10]),
      descriptionUrl: String(row[11]),
      submittedAt: String(row[12]),
      mentorStatus: String(row[13]),
      mentorNote: String(row[14]),
      pointsAwarded: Number(row[15]) || 0
    };

    if (!statusFilter || task.submissionStatus.toLowerCase() === statusFilter.toLowerCase()) {
      tasks.push(task);
    }
  }

  return { tasks: tasks };
}

function auditOverdueTasksBatch(ss) {
  var sheet = ss.getSheetByName("Job_Tasks");
  if (!sheet || sheet.getLastRow() <= 1) return { overdue: [] };

  var todayStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");
  var values = sheet.getDataRange().getValues();
  var overdueList = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var taskId = String(row[0]);
    var discordId = String(row[2]);
    var studentName = String(row[3]);
    var deadline = String(row[7]);
    var subStatus = String(row[8]);
    var pts = Number(row[15]) || 1;

    if (deadline && deadline < todayStr && subStatus === 'Announced') {
      var rowIdx = i + 1;
      sheet.getRange(rowIdx, 9).setValue("Overdue");
      var penalizedPts = pts - 2; // -2 penalty
      sheet.getRange(rowIdx, 16).setValue(penalizedPts);

      overdueList.push({
        taskId: taskId,
        discordId: discordId,
        studentName: studentName,
        deadline: deadline,
        penalizedPoints: penalizedPts
      });
    }
  }

  return { status: "SUCCESS", overdueCount: overdueList.length, overdue: overdueList };
}

/**
 * -------------------------------------------------------------------------
 * 10. Automated Bot Commands Manual Tab Generator in Google Sheets
 * -------------------------------------------------------------------------
 */
function setupBotCommandsManualTab(ss) {
  var sheetName = "Bot_Commands";
  var sheet = ss.getSheetByName(sheetName);

  if (sheet) {
    sheet.clear();
  } else {
    sheet = ss.insertSheet(sheetName);
  }

  var headers = ["Category", "Command", "Aliases", "Allowed Role", "Designated Channel", "Syntax & Example", "Description"];
  var rows = [
    headers,
    ["1. System & Provisioning", "!setgas", "!gasurl, !gas", "Supervisor", "#jp-admin", "!setgas <Web_App_URL>", "Links Google Apps Script (v50) backend with Discord Server."],
    ["1. System & Provisioning", "!setupserver", "!scanserver, !setup", "Supervisor", "#jp-admin", "!setupserver", "Provisions categories, roles, and 10+ feature channels with permissions."],
    ["1. System & Provisioning", "!setchannel", "!customchannel", "Supervisor", "#jp-admin", "!setchannel <KEY> <#channel>", "Binds a custom channel to a bot feature key (e.g. ATTENDANCE, RTBR)."],
    ["1. System & Provisioning", "!supervisor", "!supervisors, !admin", "Owner / Supervisor", "#jp-admin", "!supervisor <add/remove> @user", "Registers or removes a supervisor."],
    ["1. System & Provisioning", "!cohorts", "!cohort", "Supervisor", "#jp-admin", "!cohorts", "Displays active cohort settings, GAS URL, and automation status."],
    ["1. System & Provisioning", "!settrackertemplate", "!trackertemplate", "Supervisor / Mentor", "#jp-admin", "!settrackertemplate <URL>", "Sets the official demo job tracker template Google Sheet copy URL."],

    ["2. Dynamic Points", "!points", "!scoring", "Mentor / Supervisor", "#jp-admin", "!points", "Displays active point weights (Interview, Attendance, Target, Streak, Tasks)."],
    ["2. Dynamic Points", "!setpoint interview", "!setpoint int", "Mentor / Supervisor", "#jp-admin", "!setpoint interview <pts>", "Customizes interview preparation reward points (e.g. !setpoint interview 10)."],
    ["2. Dynamic Points", "!setpoint attendance", "!setpoint att", "Mentor / Supervisor", "#jp-admin", "!setpoint attendance <present> [absent]", "Customizes Present and Absent attendance points (e.g. !setpoint attendance 2 -2)."],
    ["2. Dynamic Points", "!setpoint target", "!setpoint jobtarget", "Mentor / Supervisor", "#jp-admin", "!setpoint target <count>", "Customizes daily mandatory job application target (e.g. !setpoint target 12)."],
    ["2. Dynamic Points", "!setpoint streak", "!setpoint streaks", "Mentor / Supervisor", "#jp-admin", "!setpoint streak <bonus> [cap]", "Customizes consecutive job application streak bonus and maximum cap."],
    ["2. Dynamic Points", "!setpoint task", "!setpoint tasks", "Mentor / Supervisor", "#jp-admin", "!setpoint task <ann> <appr> [overdue]", "Customizes job task announced, approved, and overdue penalty points."],
    ["2. Dynamic Points", "!setpoint reset", "!setpoint default", "Mentor / Supervisor", "#jp-admin", "!setpoint reset", "Restores all point settings to standard defaults."],

    ["3. Attendance Operations", "!morningattendance", "!morningatt", "Mentor / Supervisor", "#jp-admin", "!morningattendance [Date]", "Scans 'Morning Attendance' form tab (+1/-1/0) and posts to #daily-attendance."],
    ["3. Attendance Operations", "!checkattendance", "!attendance, !att", "Mentor / Supervisor", "#jp-admin", "!checkattendance [Date]", "Scans 'Daily Attendance' form tab (+1/-1/0) and posts to #daily-attendance."],
    ["3. Attendance Operations", "!customattendance", "!scanfromtab", "Mentor / Supervisor", "#jp-admin", "!customattendance \"<Tab>\" [Date]", "Scans any custom sheet tab for that day and syncs to Attendance matrix."],
    ["3. Attendance Operations", "!repairattendance", "!fixattendance", "Mentor / Supervisor", "#jp-admin", "!repairattendance", "Repairs broken matrix formatting, syncs roster names, and repairs date headers."],
    ["3. Attendance Operations", "!absent", "!absentees", "Mentor / Supervisor", "#jp-admin", "!absent [Date]", "Lists absent students for a specific date."],

    ["4. Leaves & Holidays", "!leave", "!applyleave", "Student / Staff", "#leave-request", "!leave", "Opens popup modal form for student leave request submission."],
    ["4. Leaves & Holidays", "!leaves", "!allleaves", "Mentor / Supervisor", "#jp-admin", "!leaves [pending/approved/rejected]", "Displays all student leave requests with interactive Approve/Reject buttons."],
    ["4. Leaves & Holidays", "!approve", "!acceptleave", "Mentor / Supervisor", "#jp-admin", "!approve <ReqID>", "Approves a leave request (sets 0 pts for attendance on approved dates)."],
    ["4. Leaves & Holidays", "!reject", "!deny", "Mentor / Supervisor", "#jp-admin", "!reject <ReqID>", "Rejects a leave request."],
    ["4. Leaves & Holidays", "!offday today", "!holiday today", "Mentor / Supervisor", "#jp-admin", "!offday today [Reason]", "Declares today an official Offday; announces notice and pauses audits."],
    ["4. Leaves & Holidays", "!offday <Range>", "!holiday <Range>", "Mentor / Supervisor", "#jp-admin", "!offday YYYY-MM-DD to YYYY-MM-DD", "Schedules vacation date range in Holidays tab and pauses penalties."],
    ["4. Leaves & Holidays", "!offdays", "!holidays", "Mentor / Supervisor", "#jp-admin", "!offdays", "Displays the full calendar of scheduled offdays and vacations."],
    ["4. Leaves & Holidays", "!removeoffday", "!clearoffday", "Mentor / Supervisor", "#jp-admin", "!removeoffday <Date>", "Removes an offday and resumes regular automations."],

    ["5. Job Applications & Tasks", "!linksheet", "!trackersheet", "Student / Staff", "#job-tracker", "!linksheet <URL>", "Links personal Google Sheet job application tracker once for daily 23:30 audits."],
    ["5. Job Applications & Tasks", "!mysheet", "!sheet", "Student / Staff", "#job-tracker", "!mysheet", "Displays student's linked sheet status, total applications, and today count."],
    ["5. Job Applications & Tasks", "!submit", "!submittask", "Student / Staff", "#jobs-task-updates", "!submit (replying to task)", "Opens popup modal to submit GitHub & Live Demo solutions for hiring tasks."],
    ["5. Job Applications & Tasks", "!tasks", "!jobtasks", "Mentor / Supervisor", "#jp-admin", "!tasks [pending/all]", "Lists submitted coding tasks with review buttons."],
    ["5. Job Applications & Tasks", "!review", "!reviewtask", "Mentor / Supervisor", "#jp-admin", "!review <TaskID> <approve/reject>", "Approves (+1 pt) or rejects student job tasks."],
    ["5. Job Applications & Tasks", "!jobscheck", "!notapplying", "Mentor / Supervisor", "#jp-admin", "!jobscheck", "Lists students who have not met today's daily application target."],
    ["5. Job Applications & Tasks", "!outreachcheck", "!outreach", "Mentor / Supervisor", "#jp-admin", "!outreachcheck", "Audits student networking and outreach progress."],

    ["6. Student Scorecards & Ranks", "!myhealth", "!myprofile, !me", "Student / Staff", "#dev-health-check", "!myhealth", "Full personal scorecard, rank, attendance, job tracker analytics & mentor advice."],
    ["6. Student Scorecards & Ranks", "!panelhealth", "!healthpanel", "Mentor / Supervisor", "#dev-health-check", "!panelhealth", "Posts the interactive [ Check My Health & Status ] button in #dev-health-check."],
    ["6. Student Scorecards & Ranks", "!leaderboard", "!rtbr, !ranks", "Student / Staff", "#referral-leaderboard", "!leaderboard", "Full cohort performance leaderboard with @everyone mention."],
    ["6. Student Scorecards & Ranks", "!hired", "!gotjob", "Mentor / Supervisor", "#jp-admin", "!hired @student <Company> [Role]", "Broadcasts celebration banner to #successfully-hired and gives Hired role."],
    ["6. Student Scorecards & Ranks", "!referralaccess", "!referrallock", "Mentor / Supervisor", "#jp-admin", "!referralaccess @student <grant/restrict>", "Unlocks or locks #resume-needed referral drive access."],
    ["6. Student Scorecards & Ranks", "!atrisk", "!dropouts", "Mentor / Supervisor", "#jp-admin", "!atrisk", "Predicts dropout risk based on rolling 7-day performance data."],
    ["6. Student Scorecards & Ranks", "!warnings", "!absentwarnings", "Mentor / Supervisor", "#jp-admin", "!warnings", "Lists students with 3+ absences in the current week."],
    ["6. Student Scorecards & Ranks", "!syncmembers", "!syncroster", "Mentor / Supervisor", "#jp-admin", "!syncmembers", "Synchronizes Discord members with Google Sheet Bot_Map."],
    ["6. Student Scorecards & Ranks", "!students", "!allstudents", "Mentor / Supervisor", "#jp-admin", "!students", "Lists all active enrolled students."],
    ["6. Student Scorecards & Ranks", "!studentreport", "!report", "Mentor / Supervisor", "#jp-admin", "!studentreport @student", "Generates comprehensive individual performance diagnostics."],

    ["7. Guidelines & Help", "!posttemplates", "!guidelines", "Mentor / Supervisor", "#jp-admin", "!posttemplates [interview/task/tracker/all]", "Publishes standard copy-paste guidelines and templates to student channels."],
    ["7. Guidelines & Help", "!mentor", "!giverole", "Supervisor", "#jp-admin", "!mentor <add/remove> @user", "Assigns or removes Mentor role and staff permissions."],
    ["7. Guidelines & Help", "!doctor", "!diagnose", "Mentor / Supervisor", "#jp-admin", "!doctor", "Full health check of Discord bot, GAS backend v50, and all database sheets."],
    ["7. Guidelines & Help", "!jp", "!askjp", "Everyone", "Any Channel", "!jp <Your Question>", "AI natural language assistant powered by Google Gemini AI."],
    ["7. Guidelines & Help", "!help", "!commands", "Everyone", "Any Channel", "!help", "Shows general command help catalog."]
  ];

  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);

  // Format Header Row
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#1E293B"); // Slate Dark Navy
  headerRange.setFontColor("#FFFFFF");
  headerRange.setHorizontalAlignment("center");

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);

  return {
    status: "SUCCESS",
    tabName: sheetName,
    totalCommandsLogged: rows.length - 1
  };
}
