/**
 * =========================================================================
 * JP ADMIN — EJP Mentorship Apps Script Backend
 * Version: v48 (Streamlined 10-Tab Core Architecture)
 * Target: Google Sheets Database & API Endpoint
 * =========================================================================
 */

var SCRIPT_VERSION = "v51";
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
  "Scores": [
    "Discord ID", "Student Name", "Email Address", "Weekly Points", "Lifetime Points",
    "Weekly Attendance", "Weekly Jobs", "Weekly Streak", "Weekly Interviews", "Weekly Tasks",
    "Lifetime Attendance", "Lifetime Jobs", "Lifetime Streak", "Lifetime Interviews", "Lifetime Tasks",
    "Weekly Rank", "Lifetime Rank", "Weekly Status", "Last Updated"
  ],
  "Point_Ledger": [
    "Timestamp", "Date", "Discord ID", "Student Name", "Category", "Event / Source",
    "Points Awarded", "Running Weekly Total", "Running Lifetime Total", "Remarks"
  ],
  "Holidays": ["Start Date", "End Date", "Holiday Title", "Logged By", "Created At"]
};

// List of legacy/old sheets that should be removed if cleanup is requested
var LEGACY_SHEETS = [
  "Dawn_Attendance",
  "Appeal_Logs",
  "Question_Bank",
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
        return jsonResponse(scanMorningAttendanceFromForm(ss, data.date, data));

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
      case "repairLeaves":
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

      case "voidInterview":
        return jsonResponse(voidInterviewEntry(ss, data));

      case "getInterviews":
      case "getAllInterviews":
        return jsonResponse(getInterviewsHistory(ss, data.days));

      case "recordJobTask":
        return jsonResponse(recordJobTaskEntry(ss, data));

      case "submitJobTask":
        return jsonResponse(submitJobTaskEntry(ss, data));

      case "reviewJobTask":
        return jsonResponse(reviewJobTaskEntry(ss, data));

      case "getJobTasks":
        return jsonResponse(getJobTasksList(ss, data.status));

      case "syncScores":
        return jsonResponse(syncScoresData(ss, data));

      case "getScores":
        return jsonResponse(getScoresData(ss, data.discordId));

      case "getPointLedger":
        return jsonResponse(getPointLedgerData(ss, data.discordId, data.limit));

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
  var seenEmails = {};
  var seenIds = {};
  var seenUsers = {};
  var seenNames = {};

  if (values && values.length > 1) {
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      var email = row[0] ? String(row[0]).trim().toLowerCase() : "";
      var name = row[1] ? String(row[1]).trim() : "";
      var username = row[2] ? String(row[2]).trim() : "";
      var cleanUser = username.toLowerCase().replace(/^@/, '').split('#')[0].trim();
      var discordId = row[3] ? String(row[3]).trim() : "";
      var status = row[4] ? String(row[4]).trim().toLowerCase() : "active";

      var student = {
        email: row[0] ? String(row[0]).trim() : "",
        name: name,
        username: username,
        discordId: discordId,
        status: status || "active",
        region: row[5] ? String(row[5]).trim() : "",
        subregion: row[6] ? String(row[6]).trim() : "",
        phone: row[7] ? String(row[7]).trim() : "",
        matchSource: row[8] ? String(row[8]).trim() : "",
        reviewNote: row[9] ? String(row[9]).trim() : "",
        rowIndex: i + 1
      };
      if (discordId || email || name) {
        students.push(student);
        if (email) seenEmails[email] = true;
        if (discordId) seenIds[discordId] = true;
        if (cleanUser) seenUsers[cleanUser] = true;
        if (name) seenNames[name.toLowerCase()] = true;
      }
    }
  }

  // Also include any students from 'All Data' master tab that aren't yet in Bot_Map
  if (allDataSheet && allDataSheet.getLastRow() > 1) {
    var allDataRows = allDataSheet.getDataRange().getValues();
    var headers = allDataRows[0];

    var nameCol = findHeaderColumnIndex(headers, ["Name", "Full Name", "Student Name"]);
    var emailCol = findHeaderColumnIndex(headers, ["Your Course Email Address", "Course Email Address", "Course Email", "Email Address", "Email"]);
    var phoneCol = findHeaderColumnIndex(headers, ["Mobile Number", "Mobile", "Phone Number", "Phone", "WhatsApp Number"]);
    var discordCol = findHeaderColumnIndex(headers, ["Discord Username", "Discord Handle", "Discord User", "Discord Tag", "Discord"]);
    var regionCol = findHeaderColumnIndex(headers, ["Region", "Location"]);
    var subregionCol = findHeaderColumnIndex(headers, ["Subregion", "Area"]);

    for (var k = 1; k < allDataRows.length; k++) {
      var aRow = allDataRows[k];
      var aName = String(nameCol >= 0 ? aRow[nameCol] : "").trim();
      var aEmail = String(emailCol >= 0 ? aRow[emailCol] : "").trim();
      var aPhone = String(phoneCol >= 0 ? aRow[phoneCol] : "").trim();
      var aUsername = String(discordCol >= 0 ? aRow[discordCol] : "").trim();
      var cleanUserA = aUsername.toLowerCase().replace(/^@/, '').split('#')[0].trim();
      var aRegion = String(regionCol >= 0 ? aRow[regionCol] : "").trim();
      var aSubregion = String(subregionCol >= 0 ? aRow[subregionCol] : "").trim();

      var isKnown = (aEmail && seenEmails[aEmail.toLowerCase()]) ||
                    (cleanUserA && seenUsers[cleanUserA]) ||
                    (aName && seenNames[aName.toLowerCase()]);

      if (!isKnown && (aName || aEmail || aUsername)) {
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
        if (aEmail) seenEmails[aEmail.toLowerCase()] = true;
        if (cleanUserA) seenUsers[cleanUserA] = true;
        if (aName) seenNames[aName.toLowerCase()] = true;
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

  // Index active Bot_Map profiles
  var botMapById = {};
  var botMapByEmail = {};
  for (var b = 1; b < botMapValues.length; b++) {
    var bEmail = String(botMapValues[b][0] || "").toLowerCase().trim();
    var bName = String(botMapValues[b][1] || "").trim();
    var bUser = String(botMapValues[b][2] || "").trim();
    var bId = String(botMapValues[b][3] || "").trim();
    var bStatus = String(botMapValues[b][4] || "active").toLowerCase().trim();
    var bPhone = String(botMapValues[b][7] || "").trim();

    // STRICT EXCLUSION: Never add Supervisors, Mentors, or Staff
    if (bStatus === 'supervisor' || bStatus === 'mentor' || bStatus === 'staff') {
      continue;
    }

    var studentObj = {
      email: bEmail,
      name: bName,
      username: bUser,
      discordId: bId,
      status: bStatus,
      phone: bPhone
    };

    if (bId) botMapById[bId] = studentObj;
    if (bEmail) botMapByEmail[bEmail] = studentObj;
  }

  var existingIds = {};
  var existingEmails = {};
  var needsAttRewrite = false;

  // 1. Update existing Attendance rows with canonical Name, Email, Phone, Discord ID, Status from Bot_Map
  for (var r = 1; r < attValues.length; r++) {
    var dId = String(attValues[r][3] || "").trim();
    var email = String(attValues[r][1] || "").toLowerCase().trim();

    var matchedBm = (dId && botMapById[dId]) || (email && botMapByEmail[email]);
    if (matchedBm) {
      if (attValues[r][0] !== matchedBm.name) { attValues[r][0] = matchedBm.name; needsAttRewrite = true; }
      if (attValues[r][1] !== matchedBm.email) { attValues[r][1] = matchedBm.email; needsAttRewrite = true; }
      if (matchedBm.phone && attValues[r][2] !== matchedBm.phone) { attValues[r][2] = matchedBm.phone; needsAttRewrite = true; }
      if (matchedBm.discordId && attValues[r][3] !== matchedBm.discordId) { attValues[r][3] = matchedBm.discordId; needsAttRewrite = true; }
      if (matchedBm.status && attValues[r][4] !== matchedBm.status) { attValues[r][4] = matchedBm.status; needsAttRewrite = true; }

      if (matchedBm.discordId) existingIds[matchedBm.discordId] = true;
      if (matchedBm.email) existingEmails[matchedBm.email] = true;
    } else {
      if (dId) existingIds[dId] = true;
      if (email) existingEmails[email] = true;
    }
  }

  if (needsAttRewrite && attValues.length > 1) {
    attendanceSheet.getRange(1, 1, attValues.length, attValues[0].length).setValues(attValues);
  }

  // 2. Append any missing active students from Bot_Map
  var newRows = [];
  var lastCol = Math.max(attendanceSheet.getLastColumn(), 6);

  for (var bIdKey in botMapById) {
    var bm = botMapById[bIdKey];
    if (bm.status === 'active' && !existingIds[bm.discordId] && (!bm.email || !existingEmails[bm.email])) {
      var row = [bm.name, bm.email, bm.phone, bm.discordId, bm.status, ""];
      while (row.length < lastCol) {
        row.push("A");
      }
      newRows.push(row);
      if (bm.discordId) existingIds[bm.discordId] = true;
      if (bm.email) existingEmails[bm.email] = true;
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

/**
 * High-performance Bulk Attendance Matrix Writer
 * Updates multiple dates/sessions in a single atomic spreadsheet call.
 */
function recordAttendanceSessionsBulk(ss, sessions) {
  if (!sessions || sessions.length === 0) return { updatedSessions: 0 };
  var sheet = ss.getSheetByName("Attendance");
  if (!sheet) return { error: "Attendance sheet not found" };

  // Sync roster students ONCE before matrix update
  syncAttendanceRosterStudents(ss);

  var dataRange = sheet.getDataRange();
  var values = dataRange.getValues();
  if (values.length <= 1) return { updatedSessions: 0 };

  var headers = values[0];
  var originalCols = headers.length;

  // Build ID / Email to row index (0-indexed in values array)
  var idToRow = {};
  for (var r = 1; r < values.length; r++) {
    var dId = String(values[r][3] || "").trim();
    var email = String(values[r][1] || "").toLowerCase().trim();
    if (dId) idToRow["id:" + dId] = r;
    if (email) idToRow["email:" + email] = r;
  }

  // Map existing header dates to column index (0-indexed)
  var headerMap = {};
  for (var c = 6; c < headers.length; c++) {
    var hVal = headers[c];
    var hStr = "";
    if (hVal instanceof Date) {
      hStr = Utilities.formatDate(hVal, CONFIG.TIMEZONE, "yyyy-MM-dd");
    } else {
      hStr = String(hVal || "").trim();
    }
    if (hStr) headerMap[hStr.toLowerCase()] = c;
  }

  var newColumnsCount = 0;

  // Process all sessions in memory
  sessions.forEach(function(session) {
    var dateStr = String(session.date || "").trim();
    if (!dateStr) return;
    var colIdx = headerMap[dateStr.toLowerCase()];

    if (colIdx === undefined) {
      colIdx = headers.length;
      headers.push(dateStr);
      headerMap[dateStr.toLowerCase()] = colIdx;
      newColumnsCount++;

      // Fill existing rows with default 'A' for this new session
      for (var rowI = 1; rowI < values.length; rowI++) {
        values[rowI].push("A");
      }
    }

    // Apply student statuses
    (session.records || []).forEach(function(rec) {
      var targetRow = (rec.discordId ? idToRow["id:" + rec.discordId] : undefined);
      if (targetRow === undefined && rec.email) {
        targetRow = idToRow["email:" + String(rec.email).toLowerCase()];
      }
      if (targetRow !== undefined && targetRow >= 1 && targetRow < values.length) {
        values[targetRow][colIdx] = rec.status;
      }
    });
  });

  // Write the entire updated attendance table back in one single shot
  sheet.getRange(1, 1, values.length, values[0].length).setValues(values);

  // Format any newly added header columns
  if (newColumnsCount > 0) {
    var startNewCol = originalCols + 1;
    sheet.getRange(1, startNewCol, 1, newColumnsCount)
      .setNumberFormat("@")
      .setFontWeight("bold")
      .setBackground("#e2e8f0");
  }

  return { status: "SUCCESS", updatedSessions: sessions.length, totalCols: values[0].length };
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
 * Retrieves a multi-keyed lookup map of approved leaves from Leave_Requests.
 * Accurately identifies Start Date (index 6), End Date (index 7), and Status (index 9).
 * If targetDate is provided, matches leaves that cover targetDate.
 */
function getApprovedLeavesMap(ss, targetDate) {
  var leaveSheet = ss.getSheetByName("Leave_Requests");
  var map = {
    byId: {},
    byEmail: {},
    byName: {},
    list: [],
    isLeave: function(student, dStr) {
      if (!student) return false;
      var dateToCheck = dStr ? parseDateToYMD(dStr) : (targetDate ? parseDateToYMD(targetDate) : "");
      var dId = String(student.discordId || "").trim();
      var em = String(student.email || "").toLowerCase().trim();
      var nm = String(student.name || student.studentName || "").toLowerCase().trim();
      var un = String(student.username || "").toLowerCase().trim();

      if (dId && map.byId[dId]) return true;
      if (em && map.byEmail[em]) return true;
      if (nm && map.byName[nm]) return true;
      if (un && map.byName[un]) return true;

      // Range check
      if (dateToCheck && map.list.length > 0) {
        for (var i = 0; i < map.list.length; i++) {
          var l = map.list[i];
          if (dateToCheck >= l.start && dateToCheck <= l.end) {
            if (dId && l.discordId === dId) return true;
            if (em && l.email === em) return true;
            if (nm && l.name === nm) return true;
            if (un && l.name === un) return true;
          }
        }
      }
      return false;
    }
  };

  if (!leaveSheet || leaveSheet.getLastRow() <= 1) return map;

  var leaveValues = leaveSheet.getDataRange().getValues();
  var lHeaders = leaveValues[0].map(function(h) { return String(h || "").toLowerCase().trim(); });

  var ldIdCol = -1, lEmailCol = -1, lNameCol = -1, lStartCol = -1, lEndCol = -1, lStatusCol = -1;
  for (var lc = 0; lc < lHeaders.length; lc++) {
    var lh = lHeaders[lc];
    if (lh.indexOf("discord") !== -1) ldIdCol = lc;
    else if (lh.indexOf("email") !== -1) lEmailCol = lc;
    else if (lh === "name" || lh.indexOf("student") !== -1 || lh.indexOf("full name") !== -1) lNameCol = lc;
    else if (lh.indexOf("start") !== -1 || lh.indexOf("from") !== -1) lStartCol = lc;
    else if (lh.indexOf("end") !== -1 || lh.indexOf("to") !== -1) lEndCol = lc;
    else if (lh.indexOf("status") !== -1) lStatusCol = lc;
  }

  var normTarget = targetDate ? parseDateToYMD(targetDate) : null;

  for (var l = 1; l < leaveValues.length; l++) {
    var row = leaveValues[l];
    var lDiscordId = String(ldIdCol !== -1 ? row[ldIdCol] : row[2] || "").trim();
    var lEmail = String(lEmailCol !== -1 ? row[lEmailCol] : row[4] || "").toLowerCase().trim();
    var lName = String(lNameCol !== -1 ? row[lNameCol] : row[3] || "").toLowerCase().trim();
    var lStart = parseDateToYMD(lStartCol !== -1 ? row[lStartCol] : row[6]);
    var lEnd = parseDateToYMD(lEndCol !== -1 ? row[lEndCol] : row[7]) || lStart;
    var lStatus = String(lStatusCol !== -1 ? row[lStatusCol] : row[9] || "").trim().toLowerCase();

    if (lStatus === 'approved' && lStart) {
      map.list.push({ discordId: lDiscordId, email: lEmail, name: lName, start: lStart, end: lEnd });

      if (!normTarget || (normTarget >= lStart && normTarget <= lEnd)) {
        if (lDiscordId) map.byId[lDiscordId] = true;
        if (lEmail) map.byEmail[lEmail] = true;
        if (lName) map.byName[lName] = true;
      }
    }
  }

  return map;
}

/**
 * Automatically propagates an approved leave across the Attendance matrix tab.
 * Pre-marks 'L' for all working dates (Sunday to Thursday) in the leave date range,
 * including both Daily and Morning sessions, ensuring future (advance) and past dates are stored as 'L'.
 */
function applyApprovedLeaveToAttendance(ss, discordId, email, startDate, endDate) {
  if (!startDate) return;
  var attSheet = ss.getSheetByName("Attendance");
  if (!attSheet) return;
  syncAttendanceRosterStudents(ss);

  var sYMD = parseDateToYMD(startDate);
  var eYMD = parseDateToYMD(endDate) || sYMD;
  if (!sYMD) return;

  var cur = new Date(sYMD + "T00:00:00");
  var end = new Date(eYMD + "T00:00:00");
  if (isNaN(cur.getTime()) || isNaN(end.getTime())) return;

  var sessionsToRecord = [];
  var dId = String(discordId || "").trim();
  var em = String(email || "").trim();

  while (cur <= end) {
    var dayOfWeek = cur.getDay(); // 0 = Sun, 1 = Mon, ..., 4 = Thu, 5 = Fri, 6 = Sat
    if (dayOfWeek >= 0 && dayOfWeek <= 4) {
      var dStr = Utilities.formatDate(cur, CONFIG.TIMEZONE, "yyyy-MM-dd");
      sessionsToRecord.push({
        date: dStr,
        records: [{ discordId: dId, email: em, status: "L" }]
      });
      sessionsToRecord.push({
        date: dStr + " (Morning)",
        records: [{ discordId: dId, email: em, status: "L" }]
      });
    }
    cur.setDate(cur.getDate() + 1);
  }

  if (sessionsToRecord.length > 0) {
    recordAttendanceSessionsBulk(ss, sessionsToRecord);
  }
}

/**
 * Fast & robust index of active students from Bot_Map.
 * Indexes students strictly by Email, normalized Discord Username, and Discord ID.
 * Excludes supervisors, mentors, and staff.
 */
function buildStudentIndexFromBotMap(ss) {
  var botMapSheet = ss.getSheetByName("Bot_Map");
  if (!botMapSheet) return null;

  var botMapValues = botMapSheet.getDataRange().getValues();
  var students = [];
  var emailToDiscordId = {};
  var byEmail = {};
  var byUsername = {};
  var byDiscordId = {};

  for (var i = 1; i < botMapValues.length; i++) {
    var email = String(botMapValues[i][0] || "").toLowerCase().trim();
    var name = String(botMapValues[i][1] || "").trim();
    var uName = String(botMapValues[i][2] || "").toLowerCase().trim().replace(/^@/, '').split('#')[0].trim();
    var dId = String(botMapValues[i][3] || "").trim();
    var status = String(botMapValues[i][4] || "active").toLowerCase().trim();

    // STRICT EXCLUSION: Supervisors, Mentors, Staff are not students
    if (status === 'supervisor' || status === 'mentor' || status === 'staff') {
      continue;
    }

    if (email && dId) emailToDiscordId[email] = dId;

    if ((email || dId) && status === 'active') {
      var sObj = {
        email: email,
        name: name,
        username: uName,
        discordId: dId,
        rowIdx: i + 1
      };
      students.push(sObj);

      if (email) byEmail[email] = sObj;
      if (uName) byUsername[uName] = sObj;
      if (dId) byDiscordId[dId] = sObj;
    }
  }

  return {
    students: students,
    emailToDiscordId: emailToDiscordId,
    byEmail: byEmail,
    byUsername: byUsername,
    byDiscordId: byDiscordId
  };
}

/**
 * Detects Email and Discord column indices from form header row.
 */
function detectFormHeaders(headerRow) {
  var res = { emailCol: -1, discordCol: -1 };
  if (!headerRow || !headerRow.length) return res;

  for (var h = 0; h < headerRow.length; h++) {
    var hStr = String(headerRow[h] || "").toLowerCase().trim();
    if (res.emailCol === -1 && (hStr.indexOf("email") !== -1 || hStr.indexOf("mail") !== -1)) {
      res.emailCol = h;
    }
    if (res.discordCol === -1 && (hStr.indexOf("discord") !== -1 || hStr.indexOf("handle") !== -1 || hStr.indexOf("username") !== -1)) {
      res.discordCol = h;
    }
  }
  return res;
}

/**
 * Matches a Google Form submission row strictly by Email or Discord Username / Snowflake ID.
 * Avoids any spelling errors in student names or arbitrary text matching.
 */
function matchStudentFromFormRow(row, headersInfo, studentIndex) {
  if (!row || !studentIndex) return null;

  // 1. Direct match on dedicated Email column
  if (headersInfo && headersInfo.emailCol !== -1 && headersInfo.emailCol < row.length) {
    var em = String(row[headersInfo.emailCol] || "").toLowerCase().trim();
    if (em && studentIndex.byEmail[em]) {
      return studentIndex.byEmail[em];
    }
  }

  // 2. Direct match on dedicated Discord column
  if (headersInfo && headersInfo.discordCol !== -1 && headersInfo.discordCol < row.length) {
    var discRaw = String(row[headersInfo.discordCol] || "").trim();
    var discClean = discRaw.toLowerCase().replace(/^@/, '').split('#')[0].trim();
    var discNum = discRaw.replace(/[^0-9]/g, '');

    if (discClean && studentIndex.byUsername[discClean]) {
      return studentIndex.byUsername[discClean];
    }
    if (discNum && discNum.length >= 17 && studentIndex.byDiscordId[discNum]) {
      return studentIndex.byDiscordId[discNum];
    }
  }

  // 3. Fallback: check each cell strictly for valid email or Discord username/snowflake ID
  for (var c = 0; c < row.length; c++) {
    var raw = String(row[c] || "").trim();
    if (!raw) continue;
    var lower = raw.toLowerCase();

    // Valid email match
    if (lower.indexOf('@') !== -1 && studentIndex.byEmail[lower]) {
      return studentIndex.byEmail[lower];
    }

    // Normalized discord username match
    var cleanU = lower.replace(/^@/, '').split('#')[0].trim();
    if (cleanU && studentIndex.byUsername[cleanU]) {
      return studentIndex.byUsername[cleanU];
    }

    // Discord snowflake ID match
    var numOnly = raw.replace(/[^0-9]/g, '');
    if (numOnly.length >= 17 && studentIndex.byDiscordId[numOnly]) {
      return studentIndex.byDiscordId[numOnly];
    }
  }

  return null;
}

/**
 * Daily Attendance Scanner (+1 Present, -1 Absent, 0 Leave)
 * Matches students strictly by Email and Discord Username/ID from Bot_Map.
 */
function scanDailyAttendanceFromForm(ss, dateStr) {
  var targetDate = dateStr || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");

  var formSheet = findSheetByPattern(ss, ["Daily Attendance", "Daily_Attendance", "Attendance Responses", "Form Responses 1"], /(daily|attendance\s*response|form\s*response)/i);
  var botMapSheet = ss.getSheetByName("Bot_Map");
  var attendanceSheet = ss.getSheetByName("Attendance");

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

  // 1. Get active students index from Bot_Map
  var studentIndex = buildStudentIndexFromBotMap(ss);
  if (!studentIndex || studentIndex.students.length === 0) {
    return {
      status: "FAILED",
      error: "No active students found in Bot_Map."
    };
  }
  var students = studentIndex.students;
  var emailToDiscordId = studentIndex.emailToDiscordId;

  // 2. Approved leaves lookup
  var leaveMap = getApprovedLeavesMap(ss, targetDate);

  // 3. Scan Form responses strictly by Email & Discord Username/ID
  var presentStudentMap = {};
  var matchedSubmissionsCount = 0;
  if (formSheet && formSheet.getLastRow() > 1) {
    var formValues = formSheet.getDataRange().getValues();
    var headersInfo = detectFormHeaders(formValues[0]);

    for (var f = 1; f < formValues.length; f++) {
      var row = formValues[f];
      var rawTimestamp = row[0];
      var rowDate = parseDateToYMD(rawTimestamp);

      if (rowDate === targetDate || !dateStr) {
        matchedSubmissionsCount++;
        var matched = matchStudentFromFormRow(row, headersInfo, studentIndex);
        if (matched) {
          if (matched.discordId) presentStudentMap[matched.discordId] = true;
          if (matched.email) presentStudentMap[matched.email] = true;
          if (matched.username) presentStudentMap[matched.username] = true;
          presentStudentMap[String(matched.rowIdx)] = true;
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
    var resolvedDiscordId = s.discordId || (s.email && emailToDiscordId[s.email]) || "";
    var isPresent = Boolean(
      (s.discordId && presentStudentMap[s.discordId]) ||
      (s.email && presentStudentMap[s.email]) ||
      (s.username && presentStudentMap[s.username]) ||
      presentStudentMap[String(s.rowIdx)]
    );

    var isLeave = leaveMap.isLeave(s, targetDate) || Boolean(resolvedDiscordId && leaveMap.byId[resolvedDiscordId]);

    var status = 'A';
    var pts = -1;

    if (isPresent) {
      status = 'P';
      pts = 1;
      presentCount++;
    } else if (isLeave) {
      status = 'L';
      pts = 0;
      leaveCount++;
    } else {
      status = 'A';
      pts = -1;
      absentCount++;
    }

    attendanceRecords.push({
      discordId: resolvedDiscordId || s.discordId,
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
 * Morning Attendance Scanner (+1 Present, -1 Absent, 0 Leave, 0 Optional)
 * Matches students strictly by Email and Discord Username/ID from Bot_Map.
 */
function scanMorningAttendanceFromForm(ss, dateStr, options) {
  var targetDate = dateStr || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");
  var colDate = targetDate + " (Morning)";

  // Build exempt Discord ID lookup map
  var exemptMap = {};
  if (options && options.exemptDiscordIds && Array.isArray(options.exemptDiscordIds)) {
    options.exemptDiscordIds.forEach(function(id) {
      if (id) exemptMap[String(id).trim()] = true;
    });
  }

  var formSheet = findSheetByPattern(ss, ["Morning Attendance", "Morning_Attendance"], /morning/i);
  var botMapSheet = ss.getSheetByName("Bot_Map");
  var attendanceSheet = ss.getSheetByName("Attendance");

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

  // 1. Get active students index from Bot_Map
  var studentIndex = buildStudentIndexFromBotMap(ss);
  if (!studentIndex || studentIndex.students.length === 0) {
    return {
      status: "FAILED",
      error: "No active students found in Bot_Map."
    };
  }
  var students = studentIndex.students;
  var emailToDiscordId = studentIndex.emailToDiscordId;

  // 2. Approved leaves lookup
  var leaveMap = getApprovedLeavesMap(ss, targetDate);

  // 3. Scan Morning Form responses strictly by Email & Discord Username/ID
  var presentStudentMap = {};
  var matchedSubmissionsCount = 0;
  if (formSheet && formSheet.getLastRow() > 1) {
    var formValues = formSheet.getDataRange().getValues();
    var headersInfo = detectFormHeaders(formValues[0]);

    for (var f = 1; f < formValues.length; f++) {
      var row = formValues[f];
      var rawTimestamp = row[0];
      var rowDate = parseDateToYMD(rawTimestamp);

      if (rowDate === targetDate || !dateStr) {
        matchedSubmissionsCount++;
        var matched = matchStudentFromFormRow(row, headersInfo, studentIndex);
        if (matched) {
          if (matched.discordId) presentStudentMap[matched.discordId] = true;
          if (matched.email) presentStudentMap[matched.email] = true;
          if (matched.username) presentStudentMap[matched.username] = true;
          presentStudentMap[String(matched.rowIdx)] = true;
        }
      }
    }
  }

  // 4. Calculate status
  var presentCount = 0;
  var absentCount = 0;
  var leaveCount = 0;
  var optionalCount = 0;
  var attendanceRecords = [];

  students.forEach(function(s) {
    var resolvedDiscordId = s.discordId || (s.email && emailToDiscordId[s.email]) || "";
    var isPresent = Boolean(
      (s.discordId && presentStudentMap[s.discordId]) ||
      (s.email && presentStudentMap[s.email]) ||
      (s.username && presentStudentMap[s.username]) ||
      presentStudentMap[String(s.rowIdx)]
    );

    var isExempt = Boolean(
      (resolvedDiscordId && exemptMap[resolvedDiscordId]) ||
      (s.discordId && exemptMap[s.discordId]) ||
      (s.username && exemptMap[s.username])
    );

    var isLeave = leaveMap.isLeave(s, targetDate) || Boolean(resolvedDiscordId && leaveMap.byId[resolvedDiscordId]);

    var status = 'A';
    var pts = -1;

    if (isPresent) {
      status = 'P';
      pts = 1;
      presentCount++;
    } else if (isLeave) {
      status = 'L';
      pts = 0;
      leaveCount++;
    } else if (isExempt) {
      status = 'OPT';
      pts = 0;
      optionalCount++;
    } else {
      status = 'A';
      pts = -1;
      absentCount++;
    }

    attendanceRecords.push({
      discordId: resolvedDiscordId || s.discordId,
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
    optional: optionalCount,
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

  // 1. Get active students index from Bot_Map
  var studentIndex = buildStudentIndexFromBotMap(ss);
  if (!studentIndex || studentIndex.students.length === 0) {
    return {
      status: "FAILED",
      error: "No active students found in Bot_Map."
    };
  }
  var students = studentIndex.students;
  var emailToDiscordId = studentIndex.emailToDiscordId;

  // 2. Approved leaves lookup
  var leaveMap = getApprovedLeavesMap(ss, targetDate);

  // 3. Scan custom form responses strictly by Email & Discord Username/ID
  var presentStudentMap = {};
  var matchedSubmissionsCount = 0;
  if (formSheet && formSheet.getLastRow() > 1) {
    var formValues = formSheet.getDataRange().getValues();
    var headersInfo = detectFormHeaders(formValues[0]);

    for (var f = 1; f < formValues.length; f++) {
      var row = formValues[f];
      var rawTimestamp = row[0];
      var rowDate = parseDateToYMD(rawTimestamp);

      if (rowDate === targetDate || !dateStr) {
        matchedSubmissionsCount++;
        var matched = matchStudentFromFormRow(row, headersInfo, studentIndex);
        if (matched) {
          if (matched.discordId) presentStudentMap[matched.discordId] = true;
          if (matched.email) presentStudentMap[matched.email] = true;
          if (matched.username) presentStudentMap[matched.username] = true;
          presentStudentMap[String(matched.rowIdx)] = true;
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
    var resolvedDiscordId = s.discordId || (s.email && emailToDiscordId[s.email]) || "";
    var isPresent = Boolean(
      (s.discordId && presentStudentMap[s.discordId]) ||
      (s.email && presentStudentMap[s.email]) ||
      (s.username && presentStudentMap[s.username]) ||
      presentStudentMap[String(s.rowIdx)]
    );

    var isLeave = leaveMap.isLeave(s, targetDate) || Boolean(resolvedDiscordId && leaveMap.byId[resolvedDiscordId]);

    var status = 'A';
    var pts = -1;

    if (isPresent) {
      status = 'P';
      pts = 1;
      presentCount++;
    } else if (isLeave) {
      status = 'L';
      pts = 0;
      leaveCount++;
    } else {
      status = 'A';
      pts = -1;
      absentCount++;
    }

    attendanceRecords.push({
      discordId: resolvedDiscordId || s.discordId,
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

  var exemptMap = {};
  if (options.exemptDiscordIds && Array.isArray(options.exemptDiscordIds)) {
    options.exemptDiscordIds.forEach(function(id) {
      if (id) exemptMap[String(id).trim()] = true;
    });
  }

  var botMapSheet = ss.getSheetByName("Bot_Map");
  var attendanceSheet = ss.getSheetByName("Attendance");
  var leaveSheet = ss.getSheetByName("Leave_Requests");

  if (!botMapSheet || !attendanceSheet) {
    setupAllRequiredSheets(ss);
    botMapSheet = ss.getSheetByName("Bot_Map");
    attendanceSheet = ss.getSheetByName("Attendance");
  }

  // 1. Get active students index from Bot_Map
  var studentIndex = buildStudentIndexFromBotMap(ss);
  if (!studentIndex || studentIndex.students.length === 0) {
    return { status: "FAILED", error: "No active students found in Bot_Map." };
  }
  var students = studentIndex.students;

  // 2. Approved leaves lookup (robust multi-key matching)
  var leaveMap = getApprovedLeavesMap(ss);

  function isStudentOnLeave(student, dateYmd) {
    return leaveMap.isLeave(student, dateYmd);
  }

  var dailyDatesProcessed = [];
  var morningDatesProcessed = [];
  var totalSubmissionsCount = 0;
  var sessionsToRecord = [];

  // 3. Process Daily Attendance tab
  if (syncType === "all" || syncType === "daily") {
    var dailySheet = findSheetByPattern(ss, ["Daily Attendance", "Daily_Attendance", "Attendance Responses", "Form Responses 1"], /(daily|attendance\s*response|form\s*response)/i);
    if (dailySheet && dailySheet.getLastRow() > 1) {
      var dailyValues = dailySheet.getDataRange().getValues();
      var dailyHeadersInfo = detectFormHeaders(dailyValues[0]);
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

        var matched = matchStudentFromFormRow(row, dailyHeadersInfo, studentIndex);
        if (matched) {
          if (matched.discordId) dailyByDate[rowDate][matched.discordId] = true;
          if (matched.email) dailyByDate[rowDate][matched.email] = true;
          if (matched.username) dailyByDate[rowDate][matched.username] = true;
          dailyByDate[rowDate][String(matched.rowIdx)] = true;
        }
      }

      var sortedDailyDates = Object.keys(dailyByDate).sort();
      sortedDailyDates.forEach(function(dDate) {
        var pMap = dailyByDate[dDate];
        var records = students.map(function(s) {
          var isP = Boolean(
            (s.discordId && pMap[s.discordId]) ||
            (s.email && pMap[s.email]) ||
            (s.username && pMap[s.username]) ||
            pMap[String(s.rowIdx)]
          );
          var status = 'A';
          if (isP) status = 'P';
          else if (isStudentOnLeave(s, dDate)) status = 'L';
          return { discordId: s.discordId, email: s.email, name: s.name, status: status };
        });

        sessionsToRecord.push({ date: dDate, records: records });
        dailyDatesProcessed.push(dDate);
      });
    }
  }

  // 4. Process Morning Attendance tab
  if (syncType === "all" || syncType === "morning") {
    var morningSheet = findSheetByPattern(ss, ["Morning Attendance", "Morning_Attendance"], /morning/i);
    if (morningSheet && morningSheet.getLastRow() > 1) {
      var morningValues = morningSheet.getDataRange().getValues();
      var morningHeadersInfo = detectFormHeaders(morningValues[0]);
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

        var mMatched = matchStudentFromFormRow(mRow, morningHeadersInfo, studentIndex);
        if (mMatched) {
          if (mMatched.discordId) morningByDate[mRowDate][mMatched.discordId] = true;
          if (mMatched.email) morningByDate[mRowDate][mMatched.email] = true;
          if (mMatched.username) morningByDate[mRowDate][mMatched.username] = true;
          morningByDate[mRowDate][String(mMatched.rowIdx)] = true;
        }
      }

      var sortedMorningDates = Object.keys(morningByDate).sort();
      sortedMorningDates.forEach(function(mDate) {
        var colHeader = mDate + " (Morning)";
        var mpMap = morningByDate[mDate];
        var records = students.map(function(s) {
          var isP = Boolean(
            (s.discordId && mpMap[s.discordId]) ||
            (s.email && mpMap[s.email]) ||
            (s.username && mpMap[s.username]) ||
            mpMap[String(s.rowIdx)]
          );
          var isExempt = Boolean(
            (s.discordId && exemptMap[s.discordId]) ||
            (s.username && exemptMap[s.username])
          );
          var status = 'A';
          if (isP) status = 'P';
          else if (isStudentOnLeave(s, mDate)) status = 'L';
          else if (isExempt) status = 'OPT';
          return { discordId: s.discordId, email: s.email, name: s.name, status: status };
        });

        sessionsToRecord.push({ date: colHeader, records: records });
        morningDatesProcessed.push(mDate);
      });
    }
  }


  // 5. Bulk record all sessions into Attendance sheet in a single fast operation
  if (sessionsToRecord.length > 0) {
    recordAttendanceSessionsBulk(ss, sessionsToRecord);
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

  // Deduplication check: return existing record if student already has a pending/approved request for overlapping dates
  if (sheet.getLastRow() > 1) {
    var existingValues = sheet.getDataRange().getValues();
    var dCol = -1, sCol = -1, eCol = -1, stCol = -1, idCol = -1;
    for (var col = 0; col < headers.length; col++) {
      var hd = headers[col];
      if (hd.indexOf("discord") !== -1) dCol = col;
      else if (hd.indexOf("start") !== -1) sCol = col;
      else if (hd.indexOf("end") !== -1) eCol = col;
      else if (hd.indexOf("status") !== -1) stCol = col;
      else if (hd.indexOf("request") !== -1 && hd.indexOf("id") !== -1) idCol = col;
    }

    var reqStart = String(data.startDate || "").substring(0, 10);
    var reqEnd = String(data.endDate || data.startDate || "").substring(0, 10);

    for (var r = 1; r < existingValues.length; r++) {
      var row = existingValues[r];
      var rowDId = String(row[dCol] || "").trim();
      var rowStart = String(row[sCol] || "").substring(0, 10);
      var rowEnd = String(row[eCol] || "").substring(0, 10);
      var rowStatus = String(row[stCol] || "").toUpperCase().trim();

      if (rowDId === finalDiscordId && (rowStatus === 'PENDING' || rowStatus === 'APPROVED')) {
        if ((reqStart >= rowStart && reqStart <= rowEnd) || (reqEnd >= rowStart && reqEnd <= rowEnd) || (rowStart >= reqStart && rowStart <= reqEnd)) {
          // Already logged! Return existing record without duplicating row in Google Sheets
          return {
            status: "SUCCESS",
            requestId: String(row[idCol] || ("LR-" + r)),
            name: finalName,
            email: finalEmail,
            phone: finalPhone,
            discordId: finalDiscordId,
            duplicate: true,
            existingStatus: rowStatus
          };
        }
      }
    }
  }

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
    discordId: finalDiscordId,
    duplicate: false
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
       var startCol = -1, endCol = -1;
    for (var sc = 0; sc < headers.length; sc++) {
      var sh = headers[sc];
      if (sh.indexOf("start") !== -1 || sh.indexOf("from") !== -1) startCol = sc;
      else if (sh.indexOf("end") !== -1 || sh.indexOf("to") !== -1) endCol = sc;
    }
    var lStart = parseDateToYMD(startCol !== -1 ? rowData[startCol] : rowData[6]);
    var lEnd = parseDateToYMD(endCol !== -1 ? rowData[endCol] : rowData[7]) || lStart;

    if (String(data.status).trim().toUpperCase() === "APPROVED") {
      // Pre-mark all dates in leave range as 'L' in Attendance matrix tab immediately!
      applyApprovedLeaveToAttendance(ss, curDiscordId || profile.discordId, curEmail || profile.email, lStart, lEnd);
    }

    return {
      status: "SUCCESS",
      requestId: data.requestId,
      updatedStatus: data.status,
      name: profile.name || curName,
      email: profile.email || curEmail,
      phone: profile.phone || curPhone,
      startDate: lStart,
      endDate: lEnd
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
    else if (h.indexOf("start") !== -1 || h.indexOf("from") !== -1) startCol = c;
    else if (h.indexOf("end") !== -1 || h.indexOf("to") !== -1) endCol = c;
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
      startDate: String(startCol !== -1 ? parseDateToYMD(row[startCol]) : parseDateToYMD(row[6]) || ""),
      endDate: String(endCol !== -1 ? parseDateToYMD(row[endCol]) : parseDateToYMD(row[7]) || ""),
      reason: String(reasonCol !== -1 ? row[reasonCol] : row[8] || ""),
      status: String(statusCol !== -1 ? row[statusCol] : row[9] || ""),
      note: String(noteCol !== -1 ? row[noteCol] : row[10] || "")
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

  var rawValues = sheet.getDataRange().getValues();
  if (rawValues.length <= 1) {
    return {
      status: "SUCCESS",
      message: "Leave_Requests sheet is empty. Header is verified.",
      totalRows: 0
    };
  }

  var rawHeaders = rawValues[0].map(function(h) { return String(h || "").toLowerCase().trim(); });

  var reqIdCol = -1, tsCol = -1, dIdCol = -1, nameCol = -1, emailCol = -1, phoneCol = -1, startCol = -1, endCol = -1, reasonCol = -1, statusCol = -1, noteCol = -1;
  for (var c = 0; c < rawHeaders.length; c++) {
    var h = rawHeaders[c];
    if (h.indexOf("request") !== -1 && h.indexOf("id") !== -1) reqIdCol = c;
    else if (h.indexOf("timestamp") !== -1) tsCol = c;
    else if (h.indexOf("discord") !== -1) dIdCol = c;
    else if (h === "name" || h.indexOf("full name") !== -1 || h.indexOf("student") !== -1) nameCol = c;
    else if (h.indexOf("email") !== -1) emailCol = c;
    else if (h.indexOf("phone") !== -1 || h.indexOf("mobile") !== -1) phoneCol = c;
    else if (h.indexOf("start") !== -1 || h.indexOf("from") !== -1) startCol = c;
    else if (h.indexOf("end") !== -1 || h.indexOf("to") !== -1) endCol = c;
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
    var startDate = parseDateToYMD(startCol !== -1 ? row[startCol] : row[6]) || String(row[6] || "");
    var endDate = parseDateToYMD(endCol !== -1 ? row[endCol] : row[7]) || startDate;
    var reason = String(reasonCol !== -1 ? row[reasonCol] : row[8] || "").trim();
    var status = String(statusCol !== -1 ? row[statusCol] : row[9] || "Pending").trim();
    var note = String(noteCol !== -1 ? row[noteCol] : row[10] || "").trim();

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
  var email = String(data.email || "").toLowerCase().trim();
  var discordId = String(data.discordId || "").trim();

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var values = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var rDate = row[0] instanceof Date ? Utilities.formatDate(row[0], CONFIG.TIMEZONE, "yyyy-MM-dd") : String(row[0]).substring(0, 10);
      var rEmail = String(row[1] || "").toLowerCase().trim();
      var rDiscord = String(row[4] || "").trim();

      // Check if entry for this date and student already exists
      if (rDate === dateStr && ((discordId && rDiscord === discordId) || (email && rEmail === email))) {
        var rowIdx = i + 2;
        sheet.getRange(rowIdx, 1, 1, 8).setValues([[
          dateStr,
          data.email || row[1] || "",
          data.count || 0,
          data.name || row[3] || "",
          data.discordId || row[4] || "",
          data.totalRows || data.count || 0,
          data.newRows || data.count || 0,
          data.points || 0
        ]]);
        return { status: "SUCCESS", updated: true, date: dateStr, row: rowIdx };
      }
    }
  }

  // If not found, append new row
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

  return { status: "SUCCESS", updated: false, date: dateStr };
}

function getJobsDailyHistory(ss, days) {
  var sheet = ss.getSheetByName("Jobs_Daily");
  if (!sheet || sheet.getLastRow() <= 1) return { jobs: [] };

  var values = sheet.getDataRange().getValues();
  var jobs = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var dVal = row[0];
    var dStr = "";
    if (dVal instanceof Date) {
      dStr = Utilities.formatDate(dVal, CONFIG.TIMEZONE, "yyyy-MM-dd");
    } else {
      dStr = String(dVal).trim();
    }

    jobs.push({
      date: dStr,
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

  var profile = findStudentProfile(ss, { discordId: data.discordId, name: data.name, email: data.email });

  sheet.appendRow([
    loggedDate,
    profile.name || data.name || "",
    profile.discordId || data.discordId || "",
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
  var cutoffDate = null;

  // days=0 or not provided = all-time; otherwise filter by days
  if (days && Number(days) > 0) {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(days));
    cutoffDate = Utilities.formatDate(cutoff, CONFIG.TIMEZONE, "yyyy-MM-dd");
  }

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var rowDate = String(row[0]).substring(0, 10);
    if (cutoffDate && rowDate < cutoffDate) continue;
    interviews.push({
      loggedDate: String(row[0]),
      name: String(row[1]),
      discordId: String(row[2]),
      company: String(row[3]),
      serial: Number(row[4]) || 1,
      interviewDate: String(row[5]),
      roleDetails: String(row[6]),
      discordLink: String(row[7]),
      timestamp: String(row[8]),
      status: String(row[9] || "")  // VOIDED or empty
    });
  }

  return { interviews: interviews };
}

/**
 * Marks an interview entry as VOIDED in the Interview_Log sheet.
 * Matches by discordLink (col 8, index 7) or by discordId+loggedDate.
 */
function voidInterviewEntry(ss, data) {
  var sheet = ss.getSheetByName("Interview_Log");
  if (!sheet || sheet.getLastRow() <= 1) return { status: "NOT_FOUND", voided: 0 };

  var values = sheet.getDataRange().getValues();
  var voided = 0;
  var now = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");

  // Ensure sheet has a status column (col 10, index 9)
  var totalCols = values[0].length;
  var hasStatusCol = totalCols >= 10;
  if (!hasStatusCol) {
    // Extend header row with Status column
    sheet.getRange(1, 10).setValue("Status");
  }

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var rowDiscordLink = String(row[7] || "").trim();
    var rowDiscordId = String(row[2] || "").trim();
    var alreadyVoided = String(row[9] || "").toUpperCase() === "VOIDED";

    if (alreadyVoided) continue;

    var matched = false;
    if (data.discordLink && rowDiscordLink && rowDiscordLink === data.discordLink) {
      matched = true;
    } else if (data.discordId && rowDiscordId === String(data.discordId) && data.loggedDate && String(row[0]).substring(0, 10) === data.loggedDate) {
      matched = true;
    }

    if (matched) {
      // Mark as VOIDED: update company to "[VOIDED]" and set status column
      sheet.getRange(i + 1, 4).setValue("[VOIDED] " + String(row[3]));
      sheet.getRange(i + 1, 10).setValue("VOIDED");
      sheet.getRange(i + 1, 9).setValue(now + " | Voided by audit: " + (data.reason || "Invalid format"));
      voided++;
    }
  }

  return { status: voided > 0 ? "SUCCESS" : "NOT_FOUND", voided: voided };
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

  var profile = findStudentProfile(ss, { discordId: data.discordId, name: data.studentName });

  sheet.appendRow([
    taskId,
    timestamp,
    profile.discordId || data.discordId || "",
    profile.name || data.studentName || "",
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
    // 1. Student Self-Service
    ["1. Student Self-Service", "!me", "!myhealth, !myprofile, !mystatus, !healthcheck", "Student / All", "#dev-health-check", "!me", "Full personal scorecard, rank, attendance rate, streaks, interview & task analytics."],
    ["1. Student Self-Service", "!linksheet", "!mysheet, !trackersheet, !jobsheet, !mytracker", "Student / All", "#job-tracker", "!linksheet <Google_Sheet_URL>", "Connects student's personal Google Sheet job tracker once for automated nightly audits."],
    ["1. Student Self-Service", "!leave", "!leaverequest", "Student / All", "#leave-request", "!leave [Start] [End] <Reason>", "Submits student leave request with date range (or opens interactive modal form)."],
    ["1. Student Self-Service", "!myleave", "", "Student / All", "#leave-request", "!myleave", "Checks the status of student's leave requests (Pending / Approved / Rejected)."],
    ["1. Student Self-Service", "!submit", "!submittask", "Student / All", "#jobs-task-updates", "!submit [Task_ID]", "Submits GitHub repo, Live Demo, and Doc links for hiring tasks (+1.0 Point)."],
    ["1. Student Self-Service", "!guidelines", "!posttemplates", "Student / All", "Any Channel", "!guidelines [interview/task/tracker/leave]", "Displays official formatting rules, copy-paste templates, and guidelines."],
    ["1. Student Self-Service", "!points", "!scoring, !pointsystem, !pointrules", "Student / All", "Any Channel", "!points", "Displays full guide to the RTBR points matrix (+1 Att, +1 Job, +1 Streak, +1 Int, +1 Task)."],
    ["1. Student Self-Service", "!help", "!commands", "Student / All", "Any Channel", "!help [category]", "Displays interactive help catalog for all available commands."],

    // 2. Attendance & Calendar Operations
    ["2. Attendance & Calendar", "!attendance", "!dailyatt, !attscan", "Mentor / Supervisor", "#jp-admin", "!attendance [YYYY-MM-DD]", "Scans 'Daily Attendance' Google Form responses and posts report to #daily-attendance."],
    ["2. Attendance & Calendar", "!morningattendance", "!morningatt, !dawnattendance", "Mentor / Supervisor", "#jp-admin", "!morningattendance [YYYY-MM-DD]", "Scans 'Morning Attendance' form responses and syncs +1/-1/0 points."],
    ["2. Attendance & Calendar", "!customattendance", "!customatt, !scanfromtab", "Mentor / Supervisor", "#jp-admin", "!customattendance scan \"<Tab>\"", "Scans any custom workshop/townhall sheet tab immediately and updates points."],
    ["2. Attendance & Calendar", "!customattendance schedule", "!schedulecustom", "Mentor / Supervisor", "#jp-admin", "!customattendance schedule \"<Tab>\"", "Queues custom tab attendance scan for 23:45 tonight."],
    ["2. Attendance & Calendar", "!customattendance list", "!customattendance queue", "Mentor / Supervisor", "#jp-admin", "!customattendance list", "Lists all scheduled custom attendance scans in queue."],
    ["2. Attendance & Calendar", "!morningoff", "", "Mentor / Supervisor", "#jp-admin", "!morningoff on [Date] [Reason]", "Declares morning basecamp off (waives morning penalty with 0.0 pts for all)."],
    ["2. Attendance & Calendar", "!holiday", "!offday", "Mentor / Supervisor", "#jp-admin", "!holiday add <Date> [Reason]", "Schedules official holiday/off-day in calendar to pause attendance and job penalties."],
    ["2. Attendance & Calendar", "!holiday list", "!offdays", "Mentor / Supervisor", "#jp-admin", "!holiday list", "Displays full calendar of scheduled offdays, holidays, and vacations."],
    ["2. Attendance & Calendar", "!holiday remove", "!removeoffday", "Mentor / Supervisor", "#jp-admin", "!holiday remove <Date>", "Removes an offday and resumes regular audits."],
    ["2. Attendance & Calendar", "!syncattendance", "!repairattendance, !syncatt", "Mentor / Supervisor", "#jp-admin", "!syncattendance", "Repairs matrix formulas, syncs roster names, and repairs date headers."],
    ["2. Attendance & Calendar", "!forms", "", "Mentor / Supervisor", "#jp-admin", "!forms <status/open/close>", "Checks or toggles Google Form acceptance status directly from Discord."],
    ["2. Attendance & Calendar", "!formtemplate", "", "Mentor / Supervisor", "#jp-admin", "!formtemplate generate", "Generates Google Form field configurations and setup instructions for new cohorts."],
    ["2. Attendance & Calendar", "!nudge", "!remind", "Mentor / Supervisor", "#jp-admin", "!nudge absent [days]", "Sends automated warning ping or DM to students absent for consecutive days."],

    // 3. Job Tracking & Task Lifecycle
    ["3. Job Tracking & Tasks", "!jobscheck", "!notapplying", "Mentor / Supervisor", "#jp-admin", "!jobscheck [days]", "Audits student daily application counts and scraping history."],
    ["3. Job Tracking & Tasks", "!outreachcheck", "!outreach", "Mentor / Supervisor", "#jp-admin", "!outreachcheck", "Audits student networking and cold outreach progress."],
    ["3. Job Tracking & Tasks", "!jobtask list", "!tasks, !jobtasks", "Mentor / Supervisor", "#jp-admin", "!jobtask list [pending/overdue/all]", "Displays all announced technical job tasks with statuses and submission links."],
    ["3. Job Tracking & Tasks", "!jobtask review", "!reviewtask", "Mentor / Supervisor", "#jp-admin", "!jobtask review <TaskID> <approve/reject>", "Manually reviews or flags student code solution for technical assignments."],
    ["3. Job Tracking & Tasks", "!jobtask audit", "", "Mentor / Supervisor", "#jp-admin", "!jobtask audit", "Executes automated -1.0 pt penalty for tasks past deadline without submission."],
    ["3. Job Tracking & Tasks", "!auditinterviews", "!fixinterviews", "Mentor / Supervisor", "#jp-admin", "!auditinterviews", "Audits all interview records, voids unverified or invalid entries, and notifies students."],

    // 4. Leaderboard & Student Diagnostics
    ["4. Leaderboard & Analytics", "!leaderboard", "!rtbr, !topstudents, !ranks, !weeklyreport", "Mentor / Supervisor", "#jp-admin", "!leaderboard", "Calculates and displays real-time RTBR performance leaderboard (Mentors Only)."],
    ["4. Leaderboard & Analytics", "!leaderboard post", "!publishleaderboard", "Mentor / Supervisor", "#jp-admin", "!leaderboard post #referral-leaderboard", "Broadcasts leaderboard to student channel with role mention only (no @everyone)."],
    ["4. Leaderboard & Analytics", "!atrisk", "!dropouts, !dropoutrisk", "Mentor / Supervisor", "#jp-admin", "!atrisk", "Identifies students with dropping attendance, low jobs, and missed tasks."],
    ["4. Leaderboard & Analytics", "!inspect", "!student, !deepcheck", "Mentor / Supervisor", "#jp-admin", "!inspect @student", "Comprehensive 360-degree student diagnostic console and audit log."],
    ["4. Leaderboard & Analytics", "!referralaccess", "!referrallock", "Mentor / Supervisor", "#jp-admin", "!referralaccess @student <lock/unlock>", "Locks or unlocks placement referral drive access for specific students."],
    ["4. Leaderboard & Analytics", "!hired", "!gotjob", "Mentor / Supervisor", "#jp-admin", "!hired @student <Company> [Role]", "Broadcasts celebration card to #successfully-hired and updates status to Hired."],
    ["4. Leaderboard & Analytics", "!data", "!query, !analytics", "Mentor / Supervisor", "#jp-admin", "!data <Question in Bengali/English>", "Gemini AI natural language analytics over entire Google Sheets database snapshot."],
    ["4. Leaderboard & Analytics", "!data nosheet", "", "Mentor / Supervisor", "#jp-admin", "!data nosheet", "Lists all students who have not linked their Google Sheet job tracker."],
    ["4. Leaderboard & Analytics", "!profilesurvey", "", "Mentor / Supervisor", "#jp-admin", "!profilesurvey", "Collects student tech stacks, LinkedIn, portfolio, and phone numbers into Bot_Map."],
    ["4. Leaderboard & Analytics", "!students", "!allstudents", "Mentor / Supervisor", "#jp-admin", "!students [search query]", "Searches and lists active enrolled students."],
    ["4. Leaderboard & Analytics", "!warnings", "!absentwarnings", "Mentor / Supervisor", "#jp-admin", "!warnings [@student]", "Audits warning logs and consecutive absence notifications."],
    ["4. Leaderboard & Analytics", "!jp", "!askjp", "Everyone", "Any Channel", "!jp <Question>", "AI conversational command assistant for instant bot guidance."],

    // 5. System, Scoring & Admin Configuration
    ["5. System & Admin Controls", "!setpoint", "!editpoints, !custompoints", "Supervisor", "#jp-admin", "!setpoint <module> <values>", "Dynamically configures points (attendance, target, streak, interview, tasks)."],
    ["5. System & Admin Controls", "!settarget", "!target, !jobtarget", "Supervisor", "#jp-admin", "!settarget <applications/outreach> <count>", "Configures daily job application and outreach target requirements."],
    ["5. System & Admin Controls", "!resetscores", "!resetcohort", "Supervisor", "#jp-admin", "!resetscores [YYYY-MM-DD]", "Sets fresh baseline date for score calculation without destroying historical rows."],
    ["5. System & Admin Controls", "!cohorts", "!cohort", "Supervisor", "#jp-admin", "!cohorts <list/view/addsupervisor/removesupervisor>", "Manages multi-server cohort settings and supervisor permissions."],
    ["5. System & Admin Controls", "!setchannel", "!customchannel", "Supervisor", "#jp-admin", "!setchannel <KEY> <#channel>", "Binds custom server channels to bot feature keys (ATTENDANCE, RTBR, etc.)."],
    ["5. System & Admin Controls", "!syncmembers", "!syncroster", "Supervisor", "#jp-admin", "!syncmembers", "Synchronizes Discord members with Google Sheet Bot_Map roster."],
    ["5. System & Admin Controls", "!syncmanual", "!commandmanual", "Supervisor", "#jp-admin", "!syncmanual", "Re-generates and formats this complete Bot_Commands manual tab in Google Sheets."],
    ["5. System & Admin Controls", "!role", "!giverole", "Supervisor", "#jp-admin", "!role <assign/remove> @user <RoleName>", "Assigns or removes Discord roles."],
    ["5. System & Admin Controls", "!doctor", "!diagnose", "Supervisor", "#jp-admin", "!doctor", "Full diagnostics of Discord bot, Google Apps Script backend, and database sheets."],
    ["5. System & Admin Controls", "!export", "!downloadcsv", "Supervisor", "#jp-admin", "!export [summary/nosheet/absent/all]", "Generates and attaches clean CSV data exports directly in Discord."],
    ["5. System & Admin Controls", "!control", "", "Supervisor", "#jp-admin", "!control <timeline/toggle>", "Inspects or pauses background automation schedules."],
    ["5. System & Admin Controls", "!catchup", "", "Supervisor", "#jp-admin", "!catchup [hours]", "Manually scans and processes backlog messages from offline periods."],
    ["5. System & Admin Controls", "!setup", "!setupserver", "Supervisor", "#jp-admin", "!setup", "Runs interactive setup wizard to provision channels, roles, and database bindings."]
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

/**
 * =========================================================================
 * 12. Student Scores Snapshot & Point Ledger System
 * =========================================================================
 */

/**
 * Syncs consolidated student scores (weekly & lifetime) and appends point ledger entries
 */
function syncScoresData(ss, data) {
  data = data || {};
  var scoresList = data.scores || [];
  var ledgerEntries = data.ledgerEntries || [];

  var scoresSheet = ss.getSheetByName("Scores");
  var ledgerSheet = ss.getSheetByName("Point_Ledger");

  if (!scoresSheet || !ledgerSheet) {
    setupAllRequiredSheets(ss);
    scoresSheet = ss.getSheetByName("Scores");
    ledgerSheet = ss.getSheetByName("Point_Ledger");
  }

  var updatedScoresCount = 0;
  var headers = SCHEMA_DEFS["Scores"];

  // 1. Write or update Scores tab
  if (scoresSheet && scoresList.length > 0) {
    var nowStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");

    var rows = scoresList.map(function(s) {
      return [
        String(s.discordId || "").trim(),
        String(s.name || s.studentName || "").trim(),
        String(s.email || "").trim(),
        Number(s.weeklyPoints !== undefined ? s.weeklyPoints : s.totalPoints) || 0,
        Number(s.lifetimePoints !== undefined ? s.lifetimePoints : s.totalPoints) || 0,
        Number(s.weeklyAttendance || s.attendancePoints) || 0,
        Number(s.weeklyJobs || s.jobPoints) || 0,
        Number(s.weeklyStreak || s.streakBonus) || 0,
        Number(s.weeklyInterviews || s.interviewPoints) || 0,
        Number(s.weeklyTasks || s.taskPoints) || 0,
        Number(s.lifetimeAttendance || s.attendancePoints) || 0,
        Number(s.lifetimeJobs || s.jobPoints) || 0,
        Number(s.lifetimeStreak || s.streakBonus) || 0,
        Number(s.lifetimeInterviews || s.interviewPoints) || 0,
        Number(s.lifetimeTasks || s.taskPoints) || 0,
        s.weeklyRank ? Number(s.weeklyRank) : "",
        s.lifetimeRank ? Number(s.lifetimeRank) : "",
        String(s.weeklyStatus || s.status || "Active"),
        s.lastUpdated || nowStr
      ];
    });

    // Clear existing data (keep header)
    var lastRow = scoresSheet.getLastRow();
    if (lastRow > 1) {
      scoresSheet.getRange(2, 1, lastRow - 1, scoresSheet.getLastColumn()).clearContent();
    }

    if (rows.length > 0) {
      scoresSheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
      updatedScoresCount = rows.length;
    }
  }

  // 2. Append new ledger entries to Point_Ledger tab
  var addedLedgerCount = 0;
  if (ledgerSheet && ledgerEntries.length > 0) {
    var nowStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");
    var todayStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");

    var ledgerRows = ledgerEntries.map(function(entry) {
      return [
        entry.timestamp || nowStr,
        entry.date || todayStr,
        String(entry.discordId || "").trim(),
        String(entry.name || entry.studentName || "").trim(),
        String(entry.category || "General"),
        String(entry.eventSource || entry.source || "System"),
        Number(entry.pointsAwarded || entry.points || 0),
        Number(entry.runningWeeklyTotal || 0),
        Number(entry.runningLifetimeTotal || 0),
        String(entry.remarks || entry.note || "")
      ];
    });

    if (ledgerRows.length > 0) {
      var nextRow = ledgerSheet.getLastRow() + 1;
      ledgerSheet.getRange(nextRow, 1, ledgerRows.length, SCHEMA_DEFS["Point_Ledger"].length).setValues(ledgerRows);
      addedLedgerCount = ledgerRows.length;
    }
  }

  return {
    status: "SUCCESS",
    scoresUpdated: updatedScoresCount,
    ledgerEntriesAdded: addedLedgerCount,
    syncedAt: new Date().toISOString()
  };
}

/**
 * Retrieves pre-calculated score data for a specific student (or all students) from Scores tab
 */
function getScoresData(ss, discordId) {
  var sheet = ss.getSheetByName("Scores");
  if (!sheet || sheet.getLastRow() <= 1) {
    return { found: false, scores: [], message: "Scores tab is empty or not initialized." };
  }

  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function(h) { return String(h || "").trim(); });

  if (discordId) {
    var cleanId = String(discordId).trim();
    for (var r = 1; r < values.length; r++) {
      var rowId = String(values[r][0] || "").trim();
      if (rowId === cleanId) {
        return {
          found: true,
          score: {
            discordId: cleanId,
            name: values[r][1],
            email: values[r][2],
            weeklyPoints: Number(values[r][3]) || 0,
            lifetimePoints: Number(values[r][4]) || 0,
            weeklyAttendance: Number(values[r][5]) || 0,
            weeklyJobs: Number(values[r][6]) || 0,
            weeklyStreak: Number(values[r][7]) || 0,
            weeklyInterviews: Number(values[r][8]) || 0,
            weeklyTasks: Number(values[r][9]) || 0,
            lifetimeAttendance: Number(values[r][10]) || 0,
            lifetimeJobs: Number(values[r][11]) || 0,
            lifetimeStreak: Number(values[r][12]) || 0,
            lifetimeInterviews: Number(values[r][13]) || 0,
            lifetimeTasks: Number(values[r][14]) || 0,
            weeklyRank: values[r][15] ? Number(values[r][15]) : null,
            lifetimeRank: values[r][16] ? Number(values[r][16]) : null,
            weeklyStatus: values[r][17] || "Active",
            status: values[r][17] || "Active",
            lastUpdated: values[r][18]
          }
        };
      }
    }
    return { found: false, discordId: cleanId, message: "Student not found in Scores tab." };
  }

  // Return all scores
  var allScores = [];
  for (var i = 1; i < values.length; i++) {
    allScores.push({
      discordId: values[i][0],
      name: values[i][1],
      email: values[i][2],
      weeklyPoints: Number(values[i][3]) || 0,
      lifetimePoints: Number(values[i][4]) || 0,
      weeklyRank: values[i][15] ? Number(values[i][15]) : null,
      lifetimeRank: values[i][16] ? Number(values[i][16]) : null,
      weeklyStatus: values[i][17] || "Active",
      status: values[i][17] || "Active"
    });
  }

  return { found: true, total: allScores.length, scores: allScores };
}

/**
 * Retrieves recent Point Ledger entries for a student
 */
function getPointLedgerData(ss, discordId, limit) {
  var sheet = ss.getSheetByName("Point_Ledger");
  if (!sheet || sheet.getLastRow() <= 1) {
    return { found: false, entries: [] };
  }

  limit = Number(limit) || 10;
  var values = sheet.getDataRange().getValues();
  var entries = [];
  var cleanId = discordId ? String(discordId).trim() : null;

  // Read backwards from bottom to get latest entries first
  for (var r = values.length - 1; r >= 1; r--) {
    var row = values[r];
    var rowDiscordId = String(row[2] || "").trim();

    if (!cleanId || rowDiscordId === cleanId) {
      entries.push({
        timestamp: row[0],
        date: row[1],
        discordId: rowDiscordId,
        name: row[3],
        category: row[4],
        eventSource: row[5],
        pointsAwarded: Number(row[6]) || 0,
        runningWeeklyTotal: Number(row[7]) || 0,
        runningLifetimeTotal: Number(row[8]) || 0,
        remarks: row[9]
      });

      if (entries.length >= limit) break;
    }
  }

  return {
    found: true,
    discordId: cleanId,
    totalReturned: entries.length,
    entries: entries
  };
}
