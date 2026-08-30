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
  "Leave_Requests": ["Request ID", "Timestamp", "Discord ID", "Name", "Email", "Phone", "Start Date", "End Date", "Reason", "Status", "Mentor Note"],
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

      case "setMorningOff":
        return jsonResponse(setMorningOffData(ss, data));

      case "scanCustomAttendance":
        return jsonResponse(scanCustomAttendanceFromForm(ss, data.tabName, data.date, data.sessionLabel));

      case "syncHistoricalAttendance":
      case "backfillAttendance":
        return jsonResponse(syncHistoricalAttendanceFromForms(ss, data));

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

      case "repairLeaveRequests":
      case "syncLeaves":
        return jsonResponse(repairLeaveRequestsMatrix(ss));

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
    var lHeaders = leaveValues[0].map(function(h) { return String(h || "").toLowerCase().trim(); });
    var ldIdCol = -1, lStartCol = -1, lEndCol = -1, lStatusCol = -1;
    for (var lc = 0; lc < lHeaders.length; lc++) {
      var lh = lHeaders[lc];
      if (lh.indexOf("discord") !== -1) ldIdCol = lc;
      else if (lh.indexOf("start") !== -1) lStartCol = lc;
      else if (lh.indexOf("end") !== -1) lEndCol = lc;
      else if (lh.indexOf("status") !== -1) lStatusCol = lc;
    }

    for (var l = 1; l < leaveValues.length; l++) {
      var lDiscordId = String(ldIdCol !== -1 ? leaveValues[l][ldIdCol] : leaveValues[l][2] || "").trim();
      var lStart = parseDateToYMD(lStartCol !== -1 ? leaveValues[l][lStartCol] : leaveValues[l][5]);
      var lEnd = parseDateToYMD(lEndCol !== -1 ? leaveValues[l][lEndCol] : leaveValues[l][6]) || lStart;
      var lStatus = String(lStatusCol !== -1 ? leaveValues[l][lStatusCol] : leaveValues[l][8] || "").trim().toLowerCase();

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
    var lHeaders = leaveValues[0].map(function(h) { return String(h || "").toLowerCase().trim(); });
    var ldIdCol = -1, lStartCol = -1, lEndCol = -1, lStatusCol = -1;
    for (var lc = 0; lc < lHeaders.length; lc++) {
      var lh = lHeaders[lc];
      if (lh.indexOf("discord") !== -1) ldIdCol = lc;
      else if (lh.indexOf("start") !== -1) lStartCol = lc;
      else if (lh.indexOf("end") !== -1) lEndCol = lc;
      else if (lh.indexOf("status") !== -1) lStatusCol = lc;
    }

    for (var l = 1; l < leaveValues.length; l++) {
      var lDiscordId = String(ldIdCol !== -1 ? leaveValues[l][ldIdCol] : leaveValues[l][2] || "").trim();
      var lStart = parseDateToYMD(lStartCol !== -1 ? leaveValues[l][lStartCol] : leaveValues[l][5]);
      var lEnd = parseDateToYMD(lEndCol !== -1 ? leaveValues[l][lEndCol] : leaveValues[l][6]) || lStart;
      var lStatus = String(lStatusCol !== -1 ? leaveValues[l][lStatusCol] : leaveValues[l][8] || "").trim().toLowerCase();

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
 * Sets Morning Basecamp to OFF (or ON) for a specified date in the Attendance sheet
 * When OFF: marks all active students in the "YYYY-MM-DD (Morning)" column as "OFF" (0 pts).
 */
function setMorningOffData(ss, data) {
  var targetDate = String(data.date || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd")).trim();
  var isOff = data.isOff !== false; // default true
  var reason = data.reason || "Morning Basecamp Off";
  var colDate = targetDate + " (Morning)";

  var botMapSheet = ss.getSheetByName("Bot_Map");
  var attendanceSheet = ss.getSheetByName("Attendance");

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
    var dId = String(botMapValues[i][3] || "").trim();
    var status = String(botMapValues[i][4] || "active").toLowerCase().trim();

    if (dId && status === 'active') {
      students.push({ email: email, name: name, discordId: dId });
    }
  }

  if (isOff) {
    var attendanceRecords = students.map(function(s) {
      return {
        discordId: s.discordId,
        name: s.name,
        email: s.email,
        status: 'OFF',
        points: 0
      };
    });

    recordAttendanceSession(ss, { date: colDate, records: attendanceRecords });

    return {
      status: "SUCCESS",
      session: "Morning",
      date: targetDate,
      colHeader: colDate,
      isMorningOff: true,
      reason: reason,
      totalActive: students.length,
      present: 0,
      absent: 0,
      leave: 0,
      offCount: students.length,
      records: attendanceRecords
    };
  } else {
    return {
      status: "SUCCESS",
      session: "Morning",
      date: targetDate,
      colHeader: colDate,
      isMorningOff: false,
      message: "Morning Basecamp marked active for " + targetDate
    };
  }
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
    var lHeaders = leaveValues[0].map(function(h) { return String(h || "").toLowerCase().trim(); });
    var ldIdCol = -1, lStartCol = -1, lEndCol = -1, lStatusCol = -1;
    for (var lc = 0; lc < lHeaders.length; lc++) {
      var lh = lHeaders[lc];
      if (lh.indexOf("discord") !== -1) ldIdCol = lc;
      else if (lh.indexOf("start") !== -1) lStartCol = lc;
      else if (lh.indexOf("end") !== -1) lEndCol = lc;
      else if (lh.indexOf("status") !== -1) lStatusCol = lc;
    }

    for (var l = 1; l < leaveValues.length; l++) {
      var lDiscordId = String(ldIdCol !== -1 ? leaveValues[l][ldIdCol] : leaveValues[l][2] || "").trim();
      var lStart = parseDateToYMD(lStartCol !== -1 ? leaveValues[l][lStartCol] : leaveValues[l][5]);
      var lEnd = parseDateToYMD(lEndCol !== -1 ? leaveValues[l][lEndCol] : leaveValues[l][6]) || lStart;
      var lStatus = String(lStatusCol !== -1 ? leaveValues[l][lStatusCol] : leaveValues[l][8] || "").trim().toLowerCase();

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
 * Bulk / Historical Attendance Sync from Google Form response tabs
 * Scans all historical dates present in 'Daily Attendance' and/or 'Morning Attendance' tabs,
 * calculates P (+1), A (-1), L (0), and records all sessions into the Attendance matrix.
 */
function syncHistoricalAttendanceFromForms(ss, options) {
  options = options || {};
  var syncType = options.type || "all"; // "all" | "daily" | "morning"
  var startDate = options.startDate || null;
  var endDate = options.endDate || null;

  var botMapSheet = ss.getSheetByName("Bot_Map");
  var attendanceSheet = ss.getSheetByName("Attendance");
  var leaveSheet = ss.getSheetByName("Leave_Requests");

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
      students.push({ email: email, name: name, username: uName, discordId: dId, phone: phone });
    }
  }

  if (students.length === 0) {
    return { status: "FAILED", error: "No active students found in Bot_Map." };
  }

  // 2. Approved leaves
  var approvedLeaves = [];
  if (leaveSheet && leaveSheet.getLastRow() > 1) {
    var leaveValues = leaveSheet.getDataRange().getValues();
    for (var l = 1; l < leaveValues.length; l++) {
      var lDiscordId = String(leaveValues[l][2] || "").trim();
      var lStart = parseDateToYMD(leaveValues[l][5]);
      var lEnd = parseDateToYMD(leaveValues[l][6]);
      var lStatus = String(leaveValues[l][8] || "").trim().toLowerCase();

      if (lStatus === 'approved' && lDiscordId && lStart) {
        approvedLeaves.push({ discordId: lDiscordId, start: lStart, end: lEnd || lStart });
      }
    }
  }

  function isStudentOnLeave(discordId, dateYmd) {
    for (var k = 0; k < approvedLeaves.length; k++) {
      if (approvedLeaves[k].discordId === discordId && dateYmd >= approvedLeaves[k].start && dateYmd <= approvedLeaves[k].end) {
        return true;
      }
    }
    return false;
  }

  var dailyDatesProcessed = [];
  var morningDatesProcessed = [];
  var totalSubmissionsCount = 0;

  // 3. Process Daily Attendance tab
  if (syncType === "all" || syncType === "daily") {
    var dailySheet = findSheetByPattern(ss, ["Daily Attendance", "Daily_Attendance", "Attendance Responses", "Form Responses 1"], /(daily|attendance\s*response|form\s*response)/i);
    if (dailySheet && dailySheet.getLastRow() > 1) {
      var dailyValues = dailySheet.getDataRange().getValues();
      var dailyByDate = {};
      for (var f = 1; f < dailyValues.length; f++) {
        var row = dailyValues[f];
        var rowDate = parseDateToYMD(row[0]);
        if (!rowDate) continue;
        if (startDate && rowDate < startDate) continue;
        if (endDate && rowDate > endDate) continue;

        totalSubmissionsCount++;
        if (!dailyByDate[rowDate]) {
          dailyByDate[rowDate] = {};
        }

        for (var c = 0; c < row.length; c++) {
          var cellVal = String(row[c] || "").trim();
          if (cellVal) {
            var cellLower = cellVal.toLowerCase().replace(/^@/, '').split('#')[0].trim();
            dailyByDate[rowDate][cellLower] = true;
            var numOnly = cellVal.replace(/[^0-9]/g, '');
            if (numOnly.length >= 7) dailyByDate[rowDate][numOnly] = true;
          }
        }
      }

      var sortedDailyDates = Object.keys(dailyByDate).sort();
      sortedDailyDates.forEach(function(dDate) {
        var pMap = dailyByDate[dDate];
        var records = students.map(function(s) {
          var isP = (s.email && pMap[s.email]) ||
                    (s.username && pMap[s.username]) ||
                    (s.discordId && pMap[s.discordId]) ||
                    (s.phone && pMap[s.phone]) ||
                    (s.name && pMap[s.name.toLowerCase()]);
          var status = 'A';
          if (isP) status = 'P';
          else if (isStudentOnLeave(s.discordId, dDate)) status = 'L';
          return { discordId: s.discordId, email: s.email, name: s.name, status: status };
        });

        recordAttendanceSession(ss, { date: dDate, records: records });
        dailyDatesProcessed.push(dDate);
      });
    }
  }

  // 4. Process Morning Attendance tab
  if (syncType === "all" || syncType === "morning") {
    var morningSheet = findSheetByPattern(ss, ["Morning Attendance", "Morning_Attendance"], /morning/i);
    if (morningSheet && morningSheet.getLastRow() > 1) {
      var morningValues = morningSheet.getDataRange().getValues();
      var morningByDate = {};
      for (var mf = 1; mf < morningValues.length; mf++) {
        var mRow = morningValues[mf];
        var mRowDate = parseDateToYMD(mRow[0]);
        if (!mRowDate) continue;
        if (startDate && mRowDate < startDate) continue;
        if (endDate && mRowDate > endDate) continue;

        totalSubmissionsCount++;
        if (!morningByDate[mRowDate]) {
          morningByDate[mRowDate] = {};
        }

        for (var mc = 0; mc < mRow.length; mc++) {
          var mCellVal = String(mRow[mc] || "").trim();
          if (mCellVal) {
            var mCellLower = mCellVal.toLowerCase().replace(/^@/, '').split('#')[0].trim();
            morningByDate[mRowDate][mCellLower] = true;
            var mNumOnly = mCellVal.replace(/[^0-9]/g, '');
            if (mNumOnly.length >= 7) morningByDate[mRowDate][mNumOnly] = true;
          }
        }
      }

      var sortedMorningDates = Object.keys(morningByDate).sort();
      sortedMorningDates.forEach(function(mDate) {
        var colHeader = mDate + " (Morning)";
        var mpMap = morningByDate[mDate];
        var records = students.map(function(s) {
          var isP = (s.email && mpMap[s.email]) ||
                    (s.username && mpMap[s.username]) ||
                    (s.discordId && mpMap[s.discordId]) ||
                    (s.phone && mpMap[s.phone]) ||
                    (s.name && mpMap[s.name.toLowerCase()]);
          var status = 'A';
          if (isP) status = 'P';
          else if (isStudentOnLeave(s.discordId, mDate)) status = 'L';
          return { discordId: s.discordId, email: s.email, name: s.name, status: status };
        });

        recordAttendanceSession(ss, { date: colHeader, records: records });
        morningDatesProcessed.push(mDate);
      });
    }
  }

  // Compute combined unique dates
  var allDatesSet = {};
  dailyDatesProcessed.forEach(function(d) { allDatesSet[d] = true; });
  morningDatesProcessed.forEach(function(d) { allDatesSet[d] = true; });
  var allDatesList = Object.keys(allDatesSet).sort();

  return {
    status: "SUCCESS",
    syncType: syncType,
    totalSessionsSynced: dailyDatesProcessed.length + morningDatesProcessed.length,
    dailySessionsCount: dailyDatesProcessed.length,
    morningSessionsCount: morningDatesProcessed.length,
    dailyDates: dailyDatesProcessed,
    morningDates: morningDatesProcessed,
    allDatesList: allDatesList,
    earliestDate: allDatesList[0] || null,
    latestDate: allDatesList[allDatesList.length - 1] || null,
    totalSubmissionsProcessed: totalSubmissionsCount,
    totalActiveStudents: students.length
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

/**
 * Searches and retrieves official Student Profile from Bot_Map and All Data
 * by Discord ID, Email, Username, Phone, or Name.
 */
function findStudentProfile(ss, query) {
  query = query || {};
  var qDiscordId = String(query.discordId || "").trim();
  var qEmail = String(query.email || "").toLowerCase().trim();
  var qName = String(query.name || "").toLowerCase().trim();
  var qUsername = String(query.username || "").toLowerCase().replace(/^@/, '').split('#')[0].trim();
  var qPhone = String(query.phone || "").replace(/[^0-9]/g, '');

  var botMapSheet = ss.getSheetByName("Bot_Map");
  var allDataSheet = ss.getSheetByName("All Data");

  var found = {
    name: "",
    email: "",
    phone: "",
    discordId: qDiscordId,
    username: "",
    region: "",
    subregion: ""
  };

  // 1. Search in Bot_Map
  if (botMapSheet && botMapSheet.getLastRow() > 1) {
    var bmValues = botMapSheet.getDataRange().getValues();
    for (var i = 1; i < bmValues.length; i++) {
      var row = bmValues[i];
      var email = String(row[0] || "").toLowerCase().trim();
      var name = String(row[1] || "").trim();
      var uName = String(row[2] || "").toLowerCase().replace(/^@/, '').split('#')[0].trim();
      var dId = String(row[3] || "").trim();
      var reg = String(row[5] || "").trim();
      var subreg = String(row[6] || "").trim();
      var phone = String(row[7] || "").trim();

      var match = false;
      if (qDiscordId && dId && qDiscordId === dId) match = true;
      else if (qEmail && email && qEmail === email) match = true;
      else if (qUsername && uName && qUsername === uName) match = true;
      else if (qName && name && qName === name.toLowerCase()) match = true;
      else if (qPhone && phone && qPhone.length >= 7 && phone.replace(/[^0-9]/g, '').indexOf(qPhone) !== -1) match = true;

      if (match) {
        found.name = name || found.name;
        found.email = email || found.email;
        found.phone = phone || found.phone;
        found.discordId = dId || found.discordId;
        found.username = String(row[2] || "") || found.username;
        found.region = reg || found.region;
        found.subregion = subreg || found.subregion;
        break;
      }
    }
  }

  // 2. Search in All Data if name, email, or phone are still missing
  if ((!found.name || !found.email || !found.phone) && allDataSheet && allDataSheet.getLastRow() > 1) {
    var adValues = allDataSheet.getDataRange().getValues();
    for (var j = 1; j < adValues.length; j++) {
      var adRow = adValues[j];
      var adName = String(adRow[0] || "").trim();
      var adEmail = String(adRow[1] || "").toLowerCase().trim();
      var adPhone = String(adRow[2] || "").trim();
      var adUsername = String(adRow[3] || "").toLowerCase().replace(/^@/, '').split('#')[0].trim();
      var adReg = String(adRow[4] || "").trim();
      var adSubreg = String(adRow[5] || "").trim();

      var adMatch = false;
      if (found.email && adEmail && found.email.toLowerCase() === adEmail) adMatch = true;
      else if (qEmail && adEmail && qEmail === adEmail) adMatch = true;
      else if (qUsername && adUsername && qUsername === adUsername) adMatch = true;
      else if (found.username && adUsername && found.username.toLowerCase().indexOf(adUsername) !== -1) adMatch = true;
      else if (qName && adName && qName === adName.toLowerCase()) adMatch = true;
      else if (found.name && adName && found.name.toLowerCase() === adName.toLowerCase()) adMatch = true;

      if (adMatch) {
        found.name = found.name || adName;
        found.email = found.email || adEmail;
        found.phone = found.phone || adPhone;
        found.region = found.region || adReg;
        found.subregion = found.subregion || adSubreg;
        break;
      }
    }
  }

  return found;
}

/**
 * Ensures Leave_Requests sheet has all required columns including Phone
 */
function ensureLeaveSheetHeader(sheet) {
  if (!sheet) return;
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(SCHEMA_DEFS["Leave_Requests"]);
    sheet.getRange(1, 1, 1, SCHEMA_DEFS["Leave_Requests"].length).setFontWeight("bold").setBackground("#e2e8f0");
    return;
  }
  var headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0].map(function(h) { return String(h || "").trim(); });
  var hasPhone = headers.some(function(h) { return /phone|mobile/i.test(h); });
  if (!hasPhone) {
    var emailIdx = -1;
    for (var c = 0; c < headers.length; c++) {
      if (/email/i.test(headers[c])) { emailIdx = c + 1; break; }
    }
    if (emailIdx > 0) {
      sheet.insertColumnAfter(emailIdx);
      sheet.getRange(1, emailIdx + 1).setValue("Phone").setFontWeight("bold").setBackground("#e2e8f0");
    } else {
      var nextCol = headers.length + 1;
      sheet.getRange(1, nextCol).setValue("Phone").setFontWeight("bold").setBackground("#e2e8f0");
    }
  }
}

function submitLeaveRequest(ss, data) {
  var sheet = ss.getSheetByName("Leave_Requests");
  if (!sheet) {
    setupAllRequiredSheets(ss);
    sheet = ss.getSheetByName("Leave_Requests");
  }
  if (!sheet) return { error: "Leave_Requests sheet not found" };

  var dId = String(data.discordId || "").trim();
  var inputName = String(data.name || "").trim();
  var inputEmail = String(data.email || "").trim();
  var inputPhone = String(data.phone || "").trim();

  // Auto-sync Student Profile from Bot_Map and All Data
  var profile = findStudentProfile(ss, { discordId: dId, name: inputName, email: inputEmail, phone: inputPhone });

  var finalName = profile.name || inputName || "Unknown Student";
  var finalEmail = profile.email || inputEmail || "";
  var finalPhone = profile.phone || inputPhone || "";
  var finalDiscordId = profile.discordId || dId;

  var reqId = "LR-" + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyyMMdd") + "-" + Utilities.getUuid().substring(0, 4).toUpperCase();
  var timestamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");

  ensureLeaveSheetHeader(sheet);

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(h) { return String(h || "").toLowerCase().trim(); });

  var newRow = new Array(headers.length);
  for (var c = 0; c < headers.length; c++) {
    var h = headers[c];
    if (h.indexOf("request") !== -1 && h.indexOf("id") !== -1) newRow[c] = reqId;
    else if (h.indexOf("timestamp") !== -1 || h.indexOf("date") === 0) newRow[c] = timestamp;
    else if (h.indexOf("discord") !== -1) newRow[c] = finalDiscordId;
    else if (h === "name" || h.indexOf("full name") !== -1 || h.indexOf("student") !== -1) newRow[c] = finalName;
    else if (h.indexOf("email") !== -1) newRow[c] = finalEmail;
    else if (h.indexOf("phone") !== -1 || h.indexOf("mobile") !== -1) newRow[c] = finalPhone;
    else if (h.indexOf("start") !== -1) newRow[c] = data.startDate || "";
    else if (h.indexOf("end") !== -1) newRow[c] = data.endDate || data.startDate || "";
    else if (h.indexOf("reason") !== -1) newRow[c] = data.reason || "";
    else if (h.indexOf("status") !== -1) newRow[c] = "Pending";
    else if (h.indexOf("note") !== -1) newRow[c] = "";
    else newRow[c] = "";
  }

  sheet.appendRow(newRow);

  return {
    status: "SUCCESS",
    requestId: reqId,
    name: finalName,
    email: finalEmail,
    phone: finalPhone,
    discordId: finalDiscordId
  };
}

function updateLeaveRequest(ss, data) {
  var sheet = ss.getSheetByName("Leave_Requests");
  if (!sheet) return { error: "Leave_Requests sheet not found" };

  ensureLeaveSheetHeader(sheet);

  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function(h) { return String(h || "").toLowerCase().trim(); });
  var targetRow = -1;
  var rowData = null;

  var reqIdCol = -1, discordIdCol = -1, nameCol = -1, emailCol = -1, phoneCol = -1, statusCol = -1, noteCol = -1;
  for (var c = 0; c < headers.length; c++) {
    var h = headers[c];
    if (h.indexOf("request") !== -1 && h.indexOf("id") !== -1) reqIdCol = c;
    else if (h.indexOf("discord") !== -1) discordIdCol = c;
    else if (h === "name" || h.indexOf("full name") !== -1 || h.indexOf("student") !== -1) nameCol = c;
    else if (h.indexOf("email") !== -1) emailCol = c;
    else if (h.indexOf("phone") !== -1 || h.indexOf("mobile") !== -1) phoneCol = c;
    else if (h.indexOf("status") !== -1) statusCol = c;
    else if (h.indexOf("note") !== -1) noteCol = c;
  }

  for (var i = 1; i < values.length; i++) {
    var rId = reqIdCol !== -1 ? values[i][reqIdCol] : values[i][0];
    if (String(rId).trim() === String(data.requestId).trim()) {
      targetRow = i + 1;
      rowData = values[i];
      break;
    }
  }

  if (targetRow > 0 && rowData) {
    var curDiscordId = discordIdCol !== -1 ? String(rowData[discordIdCol] || "").trim() : "";
    var curName = nameCol !== -1 ? String(rowData[nameCol] || "").trim() : "";
    var curEmail = emailCol !== -1 ? String(rowData[emailCol] || "").trim() : "";
    var curPhone = phoneCol !== -1 ? String(rowData[phoneCol] || "").trim() : "";

    // Sync student profile from Bot_Map / All Data if missing
    var profile = findStudentProfile(ss, { discordId: curDiscordId, name: curName, email: curEmail, phone: curPhone });

    if (statusCol !== -1) sheet.getRange(targetRow, statusCol + 1).setValue(data.status);
    if (noteCol !== -1 && data.note) sheet.getRange(targetRow, noteCol + 1).setValue(data.note);

    if (nameCol !== -1 && profile.name && (!curName || curName === "Unknown Student")) {
      sheet.getRange(targetRow, nameCol + 1).setValue(profile.name);
    }
    if (emailCol !== -1 && profile.email && !curEmail) {
      sheet.getRange(targetRow, emailCol + 1).setValue(profile.email);
    }
    if (phoneCol !== -1 && profile.phone && !curPhone) {
      sheet.getRange(targetRow, phoneCol + 1).setValue(profile.phone);
    }

    return {
      status: "SUCCESS",
      requestId: data.requestId,
      updatedStatus: data.status,
      name: profile.name || curName,
      email: profile.email || curEmail,
      phone: profile.phone || curPhone
    };
  }

  return { error: "Leave request not found" };
}

function getLeavesList(ss, statusFilter) {
  var sheet = ss.getSheetByName("Leave_Requests");
  if (!sheet || sheet.getLastRow() <= 1) return { leaves: [] };

  ensureLeaveSheetHeader(sheet);

  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function(h) { return String(h || "").toLowerCase().trim(); });

  var reqIdCol = -1, tsCol = -1, dIdCol = -1, nameCol = -1, emailCol = -1, phoneCol = -1, startCol = -1, endCol = -1, reasonCol = -1, statusCol = -1, noteCol = -1;
  for (var c = 0; c < headers.length; c++) {
    var h = headers[c];
    if (h.indexOf("request") !== -1 && h.indexOf("id") !== -1) reqIdCol = c;
    else if (h.indexOf("timestamp") !== -1) tsCol = c;
    else if (h.indexOf("discord") !== -1) dIdCol = c;
    else if (h === "name" || h.indexOf("full name") !== -1 || h.indexOf("student") !== -1) nameCol = c;
    else if (h.indexOf("email") !== -1) emailCol = c;
    else if (h.indexOf("phone") !== -1 || h.indexOf("mobile") !== -1) phoneCol = c;
    else if (h.indexOf("start") !== -1) startCol = c;
    else if (h.indexOf("end") !== -1) endCol = c;
    else if (h.indexOf("reason") !== -1) reasonCol = c;
    else if (h.indexOf("status") !== -1) statusCol = c;
    else if (h.indexOf("note") !== -1) noteCol = c;
  }

  var leaves = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var item = {
      requestId: String(reqIdCol !== -1 ? row[reqIdCol] : row[0] || ""),
      timestamp: String(tsCol !== -1 ? row[tsCol] : row[1] || ""),
      discordId: String(dIdCol !== -1 ? row[dIdCol] : row[2] || ""),
      name: String(nameCol !== -1 ? row[nameCol] : row[3] || ""),
      email: String(emailCol !== -1 ? row[emailCol] : row[4] || ""),
      phone: String(phoneCol !== -1 ? row[phoneCol] : (row.length > 5 ? row[5] : "") || ""),
      startDate: String(startCol !== -1 ? parseDateToYMD(row[startCol]) : row[5] || ""),
      endDate: String(endCol !== -1 ? parseDateToYMD(row[endCol]) : row[6] || ""),
      reason: String(reasonCol !== -1 ? row[reasonCol] : row[7] || ""),
      status: String(statusCol !== -1 ? row[statusCol] : row[8] || ""),
      note: String(noteCol !== -1 ? row[noteCol] : row[9] || "")
    };

    if (!statusFilter || item.status.toLowerCase() === statusFilter.toLowerCase()) {
      leaves.push(item);
    }
  }

  return { leaves: leaves };
}

/**
 * Repairs and migrates Leave_Requests sheet:
 * 1. Ensures Phone column is present and properly formatted.
 * 2. Iterates over all existing leave rows and syncs student Name, Email, and Phone from Bot_Map and All Data.
 * 3. Normalizes date formatting and column alignments.
 */
function repairLeaveRequestsMatrix(ss) {
  var sheet = ss.getSheetByName("Leave_Requests");
  if (!sheet) {
    setupAllRequiredSheets(ss);
    sheet = ss.getSheetByName("Leave_Requests");
  }
  if (!sheet) return { error: "Leave_Requests sheet not found" };

  ensureLeaveSheetHeader(sheet);

  if (sheet.getLastRow() <= 1) {
    return {
      status: "SUCCESS",
      message: "Leave_Requests sheet is empty. Header is verified.",
      totalRows: 0,
      syncedProfiles: 0
    };
  }

  var rawValues = sheet.getDataRange().getValues();
  var headers = rawValues[0].map(function(h) { return String(h || "").toLowerCase().trim(); });

  var reqIdCol = -1, tsCol = -1, dIdCol = -1, nameCol = -1, emailCol = -1, phoneCol = -1, startCol = -1, endCol = -1, reasonCol = -1, statusCol = -1, noteCol = -1;
  for (var c = 0; c < headers.length; c++) {
    var h = headers[c];
    if (h.indexOf("request") !== -1 && h.indexOf("id") !== -1) reqIdCol = c;
    else if (h.indexOf("timestamp") !== -1 || h.indexOf("date") === 0) tsCol = c;
    else if (h.indexOf("discord") !== -1) dIdCol = c;
    else if (h === "name" || h.indexOf("full name") !== -1 || h.indexOf("student") !== -1) nameCol = c;
    else if (h.indexOf("email") !== -1) emailCol = c;
    else if (h.indexOf("phone") !== -1 || h.indexOf("mobile") !== -1) phoneCol = c;
    else if (h.indexOf("start") !== -1) startCol = c;
    else if (h.indexOf("end") !== -1) endCol = c;
    else if (h.indexOf("reason") !== -1) reasonCol = c;
    else if (h.indexOf("status") !== -1) statusCol = c;
    else if (h.indexOf("note") !== -1) noteCol = c;
  }

  var standardHeaders = SCHEMA_DEFS["Leave_Requests"];
  var cleanRows = [];
  var syncedCount = 0;

  for (var r = 1; r < rawValues.length; r++) {
    var row = rawValues[r];
    var reqId = String(reqIdCol !== -1 ? row[reqIdCol] : row[0] || "").trim();
    if (!reqId) {
      reqId = "LR-" + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyyMMdd") + "-" + Utilities.getUuid().substring(0, 4).toUpperCase();
    }
    var timestamp = String(tsCol !== -1 ? row[tsCol] : row[1] || "").trim();
    var discordId = String(dIdCol !== -1 ? row[dIdCol] : row[2] || "").trim();
    var curName = String(nameCol !== -1 ? row[nameCol] : row[3] || "").trim();
    var curEmail = String(emailCol !== -1 ? row[emailCol] : row[4] || "").trim();
    var curPhone = String(phoneCol !== -1 ? row[phoneCol] : (row.length > 5 ? row[5] : "") || "").trim();
    var startDate = parseDateToYMD(startCol !== -1 ? row[startCol] : row[5]) || String(row[5] || "");
    var endDate = parseDateToYMD(endCol !== -1 ? row[endCol] : row[6]) || startDate;
    var reason = String(reasonCol !== -1 ? row[reasonCol] : row[7] || "").trim();
    var status = String(statusCol !== -1 ? row[statusCol] : row[8] || "Pending").trim();
    var note = String(noteCol !== -1 ? row[noteCol] : row[9] || "").trim();

    // Auto-sync profile from Bot_Map & All Data
    var profile = findStudentProfile(ss, { discordId: discordId, email: curEmail, name: curName, phone: curPhone });
    if (profile.name || profile.email || profile.phone) {
      syncedCount++;
    }

    var finalName = profile.name || curName || "Unknown Student";
    var finalEmail = profile.email || curEmail || "";
    var finalPhone = profile.phone || curPhone || "";

    cleanRows.push([
      reqId,
      timestamp,
      discordId,
      finalName,
      finalEmail,
      finalPhone,
      startDate,
      endDate,
      reason,
      status,
      note
    ]);
  }

  // Clear sheet and rewrite canonical 11-column matrix
  sheet.clear();
  sheet.getRange(1, 1, 1, standardHeaders.length).setValues([standardHeaders]).setFontWeight("bold").setBackground("#e2e8f0");
  sheet.setFrozenRows(1);

  if (cleanRows.length > 0) {
    sheet.getRange(2, 1, cleanRows.length, standardHeaders.length).setValues(cleanRows);
  }

  return {
    status: "SUCCESS",
    message: "Leave_Requests sheet successfully migrated to standard 11-column format with synced student profiles.",
    totalRows: cleanRows.length,
    syncedProfiles: syncedCount,
    columns: standardHeaders
  };
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
    ["1. System & Provisioning", "!catchup", "!scanpending, !backlog", "Supervisor", "#jp-admin", "!catchup [hours]", "Scans and executes pending commands/posts sent while bot was offline."],
    ["1. System & Provisioning", "!syncmanual", "!commandmanual, !pushmanual", "Mentor / Supervisor", "#jp-admin", "!syncmanual", "Re-generates and synchronizes this complete Bot_Commands manual tab in Google Sheets."],
    ["1. System & Provisioning", "!supervisor", "!supervisors, !admin", "Owner / Supervisor", "#jp-admin", "!supervisor <add/remove> @user", "Registers or removes a supervisor."],
    ["1. System & Provisioning", "!cohorts", "!cohort", "Supervisor", "#jp-admin", "!cohorts", "Displays active cohort settings, GAS URL, and automation status."],
    ["1. System & Provisioning", "!settrackertemplate", "!trackertemplate", "Supervisor / Mentor", "#jp-admin", "!settrackertemplate <URL>", "Sets the official demo job tracker template Google Sheet copy URL."],

    ["2. Dynamic Points & Baseline", "!points", "!scoring, !pointsettings", "Mentor / Supervisor", "#jp-admin", "!points", "Displays active point weights (Interview, Attendance, Target, Streak, Tasks)."],
    ["2. Dynamic Points & Baseline", "!resetscores", "!resetpoints, !startweek", "Supervisor", "#jp-admin", "!resetscores [YYYY-MM-DD]", "Resets all student scores and sets the scoring start date (defaults to Next Sunday)."],
    ["2. Dynamic Points & Baseline", "!settarget", "!target, !jobtarget", "Mentor / Supervisor", "#jp-admin", "!settarget <count>", "Customizes daily mandatory job application target (e.g. !settarget 12)."],
    ["2. Dynamic Points & Baseline", "!setpoint interview", "!setpoint int", "Mentor / Supervisor", "#jp-admin", "!setpoint interview <pts>", "Customizes interview preparation reward points (Default: +2 pts)."],
    ["2. Dynamic Points & Baseline", "!setpoint attendance", "!setpoint att", "Mentor / Supervisor", "#jp-admin", "!setpoint attendance <present> [absent]", "Customizes Present (+1) and Absent (-1) attendance points."],
    ["2. Dynamic Points & Baseline", "!setpoint target", "!setpoint jobtarget", "Mentor / Supervisor", "#jp-admin", "!setpoint target <count>", "Customizes daily mandatory job application target."],
    ["2. Dynamic Points & Baseline", "!setpoint streak", "!setpoint streaks", "Mentor / Supervisor", "#jp-admin", "!setpoint streak <bonus> [cap]", "Customizes consecutive job application streak bonus and maximum cap."],
    ["2. Dynamic Points & Baseline", "!setpoint task", "!setpoint tasks", "Mentor / Supervisor", "#jp-admin", "!setpoint task <ann> <appr> [overdue]", "Customizes job task announced (+1), approved (+1), and overdue penalty (-2) points."],
    ["2. Dynamic Points & Baseline", "!setpoint reset", "!setpoint default", "Mentor / Supervisor", "#jp-admin", "!setpoint reset", "Restores all point settings to standard defaults."],

    ["3. Attendance Operations", "!morningattendance", "!morningatt", "Mentor / Supervisor", "#jp-admin", "!morningattendance [Date]", "Scans 'Morning Attendance' form tab (+1/-1/0) and posts to #daily-attendance."],
    ["3. Attendance Operations", "!checkattendance", "!attendance, !att", "Mentor / Supervisor", "#jp-admin", "!checkattendance [Date]", "Scans 'Daily Attendance' form tab (+1/-1/0) and posts to #daily-attendance."],
    ["3. Attendance Operations", "!customattendance", "!scanfromtab, !customscan", "Mentor / Supervisor", "#jp-admin", "!customattendance \"<Tab>\" [Date]", "Scans any custom sheet tab immediately and syncs to Attendance matrix."],
    ["3. Attendance Operations", "!customattendance schedule", "!schedulecustom", "Mentor / Supervisor", "#jp-admin", "!customattendance schedule \"<Tab>\"", "Queues a custom tab to automatically scan and publish at 11:30 PM tonight."],
    ["3. Attendance Operations", "!customattendance list", "!customattendance queue", "Mentor / Supervisor", "#jp-admin", "!customattendance list", "Lists all custom attendance scans queued for 11:30 PM tonight."],
    ["3. Attendance Operations", "!repairattendance", "!fixattendance", "Mentor / Supervisor", "#jp-admin", "!repairattendance", "Repairs broken matrix formatting, syncs roster names, and repairs date headers."],
    ["3. Attendance Operations", "!absent", "!absentees", "Mentor / Supervisor", "#jp-admin", "!absent [Date]", "Lists absent students for a specific date."],

    ["4. Leaves & Holidays", "!leave", "!applyleave", "Student / Staff", "#leave-request", "!leave [Start] [End] <Reason>", "Submits student leave request (defaults to today if date omitted) with Under Review alert."],
    ["4. Leaves & Holidays", "!leaves", "!leaves pending", "Mentor / Supervisor", "#jp-admin", "!leaves [pending/approved/rejected]", "Displays all student leave requests with interactive Approve/Reject buttons."],
    ["4. Leaves & Holidays", "!approve", "!acceptleave", "Mentor / Supervisor", "#jp-admin", "!approve <ReqID>", "Approves a leave request (sets 0 pts for attendance) and notifies student via DM."],
    ["4. Leaves & Holidays", "!reject", "!deny", "Mentor / Supervisor", "#jp-admin", "!reject <ReqID>", "Rejects a leave request and notifies student via DM."],
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

    ["7. Guidelines & Help", "!posttemplates", "!guidelines", "Mentor / Supervisor", "#jp-admin", "!posttemplates [interview/task/tracker/leave/all]", "Publishes standard copy-paste guidelines and templates to student channels."],
    ["7. Guidelines & Help", "!posttemplates leave", "!postguidelines leave", "Mentor / Supervisor", "#leave-request", "!posttemplates leave", "Publishes the standard student leave guidelines & interactive form button."],
    ["7. Guidelines & Help", "!mentor", "!giverole", "Supervisor", "#jp-admin", "!mentor <add/remove> @user", "Assigns or removes Mentor role and staff permissions."],
    ["7. Guidelines & Help", "!doctor", "!diagnose", "Mentor / Supervisor", "#jp-admin", "!doctor", "Full health check of Discord bot, GAS backend v50, and all database sheets."],
    ["7. Guidelines & Help", "!jp", "!askjp", "Everyone", "Any Channel", "!jp <Your Question>", "AI natural language assistant powered by Google Gemini AI."],
    ["7. Guidelines & Help", "!help", "!commands", "Everyone", "Any Channel", "!help", "Shows general command help catalog."],

    ["8. Data Intelligence & AI Analytics", "!query", "!askdata, !sheetquery", "Mentor / Supervisor", "#jp-admin", "!query <Natural Language Question>", "AI-powered cohort data query engine that scans all database tabs and provides answers."],
    ["8. Data Intelligence & AI Analytics", "!data", "!analytics, !stats", "Mentor / Supervisor", "#jp-admin", "!data <nosheet/absent/nojobs/tasks/summary>", "Instant sub-second analytical filters and interactive action hubs across all sheets."],
    ["8. Data Intelligence & AI Analytics", "!nudge", "!remind, !pingtarget", "Mentor / Supervisor", "#jp-admin", "!nudge <nosheet/nojobs/absent>", "Broadcasts automated targeted pings with guidelines to specific student groups."],
    ["8. Data Intelligence & AI Analytics", "!export", "!downloadcsv, !csvexport", "Mentor / Supervisor", "#jp-admin", "!export [summary/nosheet/absent]", "Directly generates and attaches clean CSV data exports in Discord."],
    ["8. Data Intelligence & AI Analytics", "!inspect", "!student, !deepcheck", "Mentor / Supervisor", "#jp-admin", "!inspect @student", "Comprehensive 360-degree student diagnostic console with referral lock/unlock control."]
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
