/**
 * =========================================================================
 * JP ADMIN — EJP Mentorship Apps Script Backend
 * Version: v47
 * Target: Google Sheets Database & API Endpoint
 * =========================================================================
 */

var SCRIPT_VERSION = "v47";
var CONFIG = {
  SECRET_KEY: "CHANGE_THIS_SECRET_KEY", // Change this to your secret key
  TIMEZONE: "Asia/Dhaka"
};

/**
 * HTTP GET Endpoint for Health Checks, Status & Diagnostic
 */
function doGet(e) {
  try {
    var params = e ? e.parameter : {};
    var action = params.action || "status";

    if (action === "status" || action === "doctor") {
      return jsonResponse({
        status: "OK",
        version: SCRIPT_VERSION,
        service: "JP Admin Apps Script Backend",
        timestamp: new Date().toISOString(),
        spreadsheetName: SpreadsheetApp.getActiveSpreadsheet().getName(),
        spreadsheetId: SpreadsheetApp.getActiveSpreadsheet().getId()
      });
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
 * HTTP POST Router for all Database Operations
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

      case "getDawnAttendance":
        return jsonResponse(getDawnAttendanceData(ss));

      case "recordDawnAttendance":
        return jsonResponse(recordDawnAttendanceBatch(ss, data));

      case "submitLeave":
        return jsonResponse(submitLeaveRequest(ss, data));

      case "updateLeave":
        return jsonResponse(updateLeaveRequest(ss, data));

      case "getLeaves":
        return jsonResponse(getLeavesList(ss, data.status));

      case "submitAppeal":
        return jsonResponse(submitAppealRequest(ss, data));

      case "updateAppeal":
        return jsonResponse(updateAppealRequest(ss, data));

      case "getAppeals":
        return jsonResponse(getAppealsList(ss));

      case "getQuestions":
        return jsonResponse(getQuestionBank(ss, data.category, data.limit));

      case "addQuestions":
        return jsonResponse(addQuestionsToBank(ss, data.questions));

      case "markQuestionUsed":
        return jsonResponse(markQuestionUsedInBank(ss, data.questionId, data.usedOn));

      case "recordScore":
        return jsonResponse(recordStudentScore(ss, data));

      case "getScores":
        return jsonResponse(getScoresHistory(ss, data.days));

      case "recordJobDaily":
        return jsonResponse(recordJobDailyEntry(ss, data));

      case "getJobsDaily":
        return jsonResponse(getJobsDailyHistory(ss, data.days));

      case "recordOutreachDaily":
        return jsonResponse(recordOutreachDailyEntry(ss, data));

      case "getOutreachDaily":
        return jsonResponse(getOutreachDailyHistory(ss, data.days));

      case "recordInterview":
        return jsonResponse(recordInterviewEntry(ss, data));

      case "getInterviews":
        return jsonResponse(getInterviewsHistory(ss, data.days));

      case "scanDailyAttendance":
        return jsonResponse(scanDailyAttendanceFromForm(ss, data.date));

      case "scanMorningAttendance":
        return jsonResponse(scanMorningAttendanceFromForm(ss, data.date));

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

      case "recordWorkshop":
        return jsonResponse(recordWorkshopEntry(ss, data));

      case "recordResume":
        return jsonResponse(recordResumeLink(ss, data));

      case "recordProject":
        return jsonResponse(recordProjectSubmission(ss, data));

      case "saveFormTemplates":
        return jsonResponse(saveFormTemplatesConfig(ss, data));

      case "getFormTemplates":
        return jsonResponse(getFormTemplatesConfig(ss));

      case "getCohortsRegistry":
        return jsonResponse(getCohortsRegistryData(ss));

      case "saveCohort":
        return jsonResponse(saveCohortRegistryData(ss, data));

      default:
        return errorResponse("Unknown action: " + action, 400);
    }
  } catch (err) {
    return errorResponse("Internal Script Error: " + err.toString() + " (Stack: " + err.stack + ")", 500);
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
 * 1. Sheet Provisioning & Schema Initialization (9 Essential Tabs)
 * -------------------------------------------------------------------------
 */
var SCHEMA_DEFS = {
  "All Data": ["Full Name", "Email", "Phone", "Discord Username", "Region", "Subregion", "Notes"],
  "Bot_Map": ["Email", "Name", "Discord Username", "Discord ID", "Status", "Region", "Subregion", "Phone", "Match Source", "Review Note"],
  "Attendance": ["Name", "Email", "Phone", "Discord ID", "Status", "Remarks"],
  "Daily Attendance": ["Timestamp", "Email Address", "Full Name", "Discord ID", "Attendance Status"],
  "Morning Attendance": ["Timestamp", "Email Address", "Full Name", "Discord ID", "Attendance Status"],
  "Leave_Requests": ["Request ID", "Timestamp", "Discord ID", "Name", "Email", "Start Date", "End Date", "Reason", "Status", "Mentor Note"],
  "Job_Sheets": ["Discord ID", "Name", "Email", "Sheet URL", "Sheet ID", "Tab GID", "Status", "Last Scraped"],
  "Jobs_Daily": ["Date", "Email", "Count", "Name", "Discord ID", "Total Rows", "New Rows", "Points"],
  "Interview_Log": ["Logged Date", "Name", "Discord ID", "Company", "Serial", "Interview Date", "Role Details", "Discord Link", "Timestamp"],
  "Job_Tasks": ["Task ID", "Timestamp", "Discord ID", "Student Name", "Company", "Role", "Tech Stack", "Deadline", "Submission Status", "GitHub Link", "Task Link", "Description Link", "Submitted At", "Mentor Status", "Mentor Note", "Points Awarded"]
};

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
 * -------------------------------------------------------------------------
 * 2. Doctor Diagnostics
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
    timezone: ss.getSpreadsheetTimeZone()
  };
}

/**
 * -------------------------------------------------------------------------
 * 3. Roster & Identity Management (Bot_Map, All Data, Roster Review)
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

  // Fallback / Initial load from 'All Data' master tab if Bot_Map is currently empty
  if (students.length === 0 && allDataSheet && allDataSheet.getLastRow() > 1) {
    var allDataRows = allDataSheet.getDataRange().getValues();
    for (var k = 1; k < allDataRows.length; k++) {
      var aRow = allDataRows[k];
      var aName = String(aRow[0] || "").trim();
      var aEmail = String(aRow[1] || "").trim();
      var aPhone = String(aRow[2] || "").trim();
      var aUsername = String(aRow[3] || "").trim();
      var aRegion = String(aRow[4] || "").trim();
      var aSubregion = String(aRow[5] || "").trim();

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

  // 1. Read master student records from 'All Data' tab
  var allDataStudents = [];
  if (allDataSheet && allDataSheet.getLastRow() > 1) {
    var allDataRows = allDataSheet.getDataRange().getValues();
    for (var i = 1; i < allDataRows.length; i++) {
      var row = allDataRows[i];
      var name = String(row[0] || "").trim();
      var email = String(row[1] || "").trim();
      var phone = String(row[2] || "").trim();
      var uName = String(row[3] || "").trim().toLowerCase().replace(/^@/, '');
      var region = String(row[4] || "").trim();
      var subregion = String(row[5] || "").trim();

      if (name || email || uName) {
        allDataStudents.push({
          name: name,
          email: email,
          phone: phone,
          username: uName,
          rawUsername: String(row[3] || "").trim(),
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
      var cleanUsername = rawUsername.toLowerCase().replace(/^@/, '');
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
    var bUser = String(botMapValues[j][2] || "").trim().toLowerCase().replace(/^@/, '');
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

    // Match with Discord member
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
      var cleanUsername = rawUsername.toLowerCase().replace(/^@/, '');
      var displayName = String(m.displayName || m.name || "").trim();

      if (!dId) return;

      var rowIdx = existingMapById[dId];
      if (rowIdx !== undefined && !processedBotMapRows[rowIdx]) {
        botMapValues[rowIdx][2] = rawUsername;
        botMapValues[rowIdx][3] = dId;
        botMapValues[rowIdx][4] = m.status || "active";
        processedBotMapRows[rowIdx] = true;
        synced++;
      } else if (rowIdx === undefined && !allDataStudents.some(s => s.username === cleanUsername)) {
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
  } else {
    sheet.appendRow([
      data.email || "",
      data.name || "",
      data.username || "",
      discordId,
      "active",
      data.region || "",
      data.subregion || "",
      data.phone || "",
      "Manual Edit",
      data.reviewNote || ""
    ]);
    return { status: "CREATED", row: sheet.getLastRow() };
  }
}

function setStudentStatusData(ss, discordId, status, note) {
  var sheet = ss.getSheetByName("Bot_Map");
  if (!sheet) return { error: "Bot_Map sheet not found" };

  var values = sheet.getDataRange().getValues();
  var targetRow = -1;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][3]).trim() === String(discordId).trim()) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow > 0) {
    sheet.getRange(targetRow, 5).setValue(status);
    if (note) sheet.getRange(targetRow, 10).setValue(note);
    
    // Highlight inactive as dark red or active as normal
    var rowRange = sheet.getRange(targetRow, 1, 1, 10);
    if (status === "inactive" || status === "left") {
      rowRange.setBackground("#fee2e2"); // light red
    } else if (status === "hired") {
      rowRange.setBackground("#dcfce7"); // light green
    } else {
      rowRange.setBackground("#ffffff"); // neutral
    }

    return { status: "SUCCESS", discordId: discordId, newStatus: status };
  }

  return { status: "NOT_FOUND", discordId: discordId };
}

/**
 * -------------------------------------------------------------------------
 * 4. Attendance & Form Operations
 * -------------------------------------------------------------------------
 */
function recordAttendanceSession(ss, data) {
  var sheet = ss.getSheetByName("Attendance");
  if (!sheet) return { error: "Attendance sheet not found" };

  var dateStr = data.date || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");
  var records = data.records || []; // array of { email, discordId, status: 'P' | 'L' | 'A' }

  // Check if date column exists
  var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 6)).getValues()[0];
  var dateColIndex = -1;

  for (var c = 6; c < headers.length; c++) {
    if (String(headers[c]) === dateStr) {
      dateColIndex = c + 1;
      break;
    }
  }

  if (dateColIndex === -1) {
    dateColIndex = headers.length + 1;
    sheet.getRange(1, dateColIndex).setValue(dateStr).setFontWeight("bold");
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
  records.forEach(function(rec) {
    var targetRow = idToRow["id:" + rec.discordId] || idToRow["email:" + String(rec.email).toLowerCase()];
    if (targetRow) {
      sheet.getRange(targetRow, dateColIndex).setValue(rec.status);
      updatedCount++;
    }
  });

  return { status: "SUCCESS", date: dateStr, updatedStudents: updatedCount };
}

function getAttendanceData(ss) {
  var sheet = ss.getSheetByName("Attendance");
  if (!sheet || sheet.getLastRow() <= 1) return { attendance: [] };

  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var dates = headers.slice(6);
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
 * -------------------------------------------------------------------------
 * 5. Dawn Focus Circle Attendance
 * -------------------------------------------------------------------------
 */
function recordDawnAttendanceBatch(ss, data) {
  var sheet = ss.getSheetByName("Dawn_Attendance");
  if (!sheet) return { error: "Dawn_Attendance sheet not found" };

  var dateStr = data.date || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");
  var entries = data.entries || []; // { discordId, name, email, mark: 'P · HH:MM' | 'L' | 'A' | 'Joined' | 'Removed' }

  var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 5)).getValues()[0];
  var colIndex = -1;

  for (var c = 5; c < headers.length; c++) {
    if (String(headers[c]) === dateStr) {
      colIndex = c + 1;
      break;
    }
  }

  if (colIndex === -1) {
    colIndex = headers.length + 1;
    sheet.getRange(1, colIndex).setValue(dateStr).setFontWeight("bold");
  }

  var values = sheet.getDataRange().getValues();
  var idMap = {};
  for (var r = 1; r < values.length; r++) {
    var dId = String(values[r][3] || "").trim();
    if (dId) idMap[dId] = r + 1;
  }

  entries.forEach(function(entry) {
    var row = idMap[entry.discordId];
    if (row) {
      sheet.getRange(row, colIndex).setValue(entry.mark);
    } else {
      var newRow = [entry.name || "", entry.email || "", entry.phone || "", entry.discordId, "active"];
      while (newRow.length < colIndex - 1) newRow.push("");
      newRow.push(entry.mark);
      sheet.appendRow(newRow);
      idMap[entry.discordId] = sheet.getLastRow();
    }
  });

  return { status: "SUCCESS", date: dateStr, count: entries.length };
}

function getDawnAttendanceData(ss) {
  var sheet = ss.getSheetByName("Dawn_Attendance");
  if (!sheet || sheet.getLastRow() <= 1) return { dawnRecords: [] };

  var values = sheet.getDataRange().getValues();
  var dates = values[0].slice(5);
  var records = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var marks = {};
    for (var d = 0; d < dates.length; d++) {
      marks[dates[d]] = row[5 + d] || "A";
    }
    records.push({
      name: row[0],
      email: row[1],
      phone: row[2],
      discordId: row[3],
      status: row[4],
      marks: marks
    });
  }

  return { dates: dates, records: records };
}

/**
 * -------------------------------------------------------------------------
 * 6. Leave Requests & Appeals
 * -------------------------------------------------------------------------
 */
function submitLeaveRequest(ss, data) {
  var sheet = ss.getSheetByName("Leave_Requests");
  if (!sheet) return { error: "Leave_Requests sheet not found" };

  var reqId = "LR-" + new Date().getTime().toString(36).toUpperCase();
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
    "PENDING",
    ""
  ]);

  return { status: "SUCCESS", requestId: reqId };
}

function updateLeaveRequest(ss, data) {
  var sheet = ss.getSheetByName("Leave_Requests");
  if (!sheet) return { error: "Leave_Requests sheet not found" };

  var reqId = String(data.requestId || "").trim();
  var status = data.status || "APPROVED";
  var note = data.note || "";
  var values = sheet.getDataRange().getValues();

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === reqId) {
      sheet.getRange(i + 1, 9).setValue(status);
      sheet.getRange(i + 1, 10).setValue(note);
      return { status: "SUCCESS", requestId: reqId, updatedStatus: status };
    }
  }

  return { status: "NOT_FOUND", requestId: reqId };
}

function getLeavesList(ss, filterStatus) {
  var sheet = ss.getSheetByName("Leave_Requests");
  if (!sheet || sheet.getLastRow() <= 1) return { leaves: [] };

  var values = sheet.getDataRange().getValues();
  var list = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!filterStatus || String(row[8]).toUpperCase() === filterStatus.toUpperCase()) {
      list.push({
        requestId: row[0],
        timestamp: row[1],
        discordId: row[2],
        name: row[3],
        email: row[4],
        startDate: row[5],
        endDate: row[6],
        reason: row[7],
        status: row[8],
        mentorNote: row[9]
      });
    }
  }

  return { leaves: list };
}

function submitAppealRequest(ss, data) {
  var sheet = ss.getSheetByName("Appeal_Logs");
  if (!sheet) return { error: "Appeal_Logs sheet not found" };

  var appealId = "AP-" + new Date().getTime().toString(36).toUpperCase();
  var timestamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");

  sheet.appendRow([
    appealId,
    timestamp,
    data.discordId || "",
    data.name || "",
    data.contact || "",
    data.type || "BOOTCAMP_REMOVAL",
    data.dates || "",
    data.explanation || "",
    "PENDING",
    ""
  ]);

  return { status: "SUCCESS", appealId: appealId };
}

function updateAppealRequest(ss, data) {
  var sheet = ss.getSheetByName("Appeal_Logs");
  if (!sheet) return { error: "Appeal_Logs sheet not found" };

  var appealId = String(data.appealId || "").trim();
  var status = data.status || "APPROVED";
  var note = data.note || "";
  var values = sheet.getDataRange().getValues();

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === appealId) {
      sheet.getRange(i + 1, 9).setValue(status);
      sheet.getRange(i + 1, 10).setValue(note);
      return { status: "SUCCESS", appealId: appealId, updatedStatus: status };
    }
  }

  return { status: "NOT_FOUND", appealId: appealId };
}

function getAppealsList(ss) {
  var sheet = ss.getSheetByName("Appeal_Logs");
  if (!sheet || sheet.getLastRow() <= 1) return { appeals: [] };

  var values = sheet.getDataRange().getValues();
  var list = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    list.push({
      appealId: row[0],
      timestamp: row[1],
      discordId: row[2],
      name: row[3],
      contact: row[4],
      type: row[5],
      dates: row[6],
      explanation: row[7],
      status: row[8],
      decisionNote: row[9]
    });
  }

  return { appeals: list };
}

/**
 * -------------------------------------------------------------------------
 * 7. Question Bank & Scoring
 * -------------------------------------------------------------------------
 */
function getQuestionBank(ss, category, limit) {
  var sheet = ss.getSheetByName("Question_Bank");
  if (!sheet || sheet.getLastRow() <= 1) return { questions: [] };

  var values = sheet.getDataRange().getValues();
  var list = [];
  var max = limit || 10;

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var cat = String(row[1] || "").toLowerCase();
    var usedOn = row[5];

    if ((!category || cat === category.toLowerCase()) && (!usedOn || String(usedOn).trim() === "")) {
      list.push({
        id: row[0],
        category: row[1],
        difficulty: row[2],
        question: row[3],
        modelAnswer: row[4],
        usedOn: row[5],
        rowIndex: i + 1
      });
      if (list.length >= max) break;
    }
  }

  return { questions: list, count: list.length };
}

function addQuestionsToBank(ss, questions) {
  var sheet = ss.getSheetByName("Question_Bank");
  if (!sheet) return { error: "Question_Bank sheet not found" };

  var added = 0;
  if (questions && Array.isArray(questions)) {
    questions.forEach(function(q) {
      var id = q.id || "Q-" + new Date().getTime().toString(36).toUpperCase() + "-" + Math.floor(Math.random()*1000);
      sheet.appendRow([
        id,
        q.category || "technical",
        q.difficulty || "medium",
        q.question || "",
        q.modelAnswer || "",
        ""
      ]);
      added++;
    });
  }

  return { status: "SUCCESS", addedCount: added };
}

function markQuestionUsedInBank(ss, questionId, usedOnDate) {
  var sheet = ss.getSheetByName("Question_Bank");
  if (!sheet) return { error: "Question_Bank sheet not found" };

  var dateStr = usedOnDate || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");
  var values = sheet.getDataRange().getValues();

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === String(questionId).trim()) {
      sheet.getRange(i + 1, 6).setValue(dateStr);
      return { status: "SUCCESS", questionId: questionId, usedOn: dateStr };
    }
  }

  return { status: "NOT_FOUND", questionId: questionId };
}

function recordStudentScore(ss, data) {
  var sheet = ss.getSheetByName("Scores");
  if (!sheet) return { error: "Scores sheet not found" };

  var scoreId = "SC-" + new Date().getTime().toString(36).toUpperCase();
  var dateStr = data.date || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");

  sheet.appendRow([
    scoreId,
    dateStr,
    data.discordId || "",
    data.name || "",
    data.questionId || "",
    data.category || "",
    data.score || 0,
    data.cheatFlag ? "YES" : "NO",
    data.firstCorrect ? "YES" : "NO",
    data.bonusPoints || 0,
    data.totalPoints || 0
  ]);

  return { status: "SUCCESS", scoreId: scoreId };
}

function getScoresHistory(ss, days) {
  var sheet = ss.getSheetByName("Scores");
  if (!sheet || sheet.getLastRow() <= 1) return { scores: [] };

  var values = sheet.getDataRange().getValues();
  var list = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    list.push({
      scoreId: row[0],
      date: row[1],
      discordId: row[2],
      name: row[3],
      questionId: row[4],
      category: row[5],
      score: row[6],
      cheatFlag: row[7] === "YES",
      firstCorrect: row[8] === "YES",
      bonusPoints: row[9],
      totalPoints: row[10]
    });
  }

  return { scores: list };
}

/**
 * -------------------------------------------------------------------------
 * 8. Job Tracking, Outreach, Interviews, Resumes & Projects
 * -------------------------------------------------------------------------
 */
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
    data.totalRows || 0,
    data.newRows || 0
  ]);

  return { status: "SUCCESS", date: dateStr };
}

function getJobsDailyHistory(ss, days) {
  var sheet = ss.getSheetByName("Jobs_Daily");
  if (!sheet || sheet.getLastRow() <= 1) return { jobs: [] };

  var values = sheet.getDataRange().getValues();
  var list = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    list.push({
      date: row[0],
      email: row[1],
      count: row[2],
      name: row[3],
      discordId: row[4],
      totalRows: row[5],
      newRows: row[6]
    });
  }

  return { jobs: list };
}

function recordOutreachDailyEntry(ss, data) {
  var sheet = ss.getSheetByName("Outreach_Daily");
  if (!sheet) return { error: "Outreach_Daily sheet not found" };

  var dateStr = data.date || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");
  var timestamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");

  sheet.appendRow([
    dateStr,
    data.discordId || "",
    data.name || "",
    data.email || "",
    data.messageId || "",
    data.count || 1,
    timestamp
  ]);

  return { status: "SUCCESS", date: dateStr };
}

function getOutreachDailyHistory(ss, days) {
  var sheet = ss.getSheetByName("Outreach_Daily");
  if (!sheet || sheet.getLastRow() <= 1) return { outreach: [] };

  var values = sheet.getDataRange().getValues();
  var list = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    list.push({
      date: row[0],
      discordId: row[1],
      name: row[2],
      email: row[3],
      messageId: row[4],
      count: row[5],
      timestamp: row[6]
    });
  }

  return { outreach: list };
}

function recordInterviewEntry(ss, data) {
  var sheet = ss.getSheetByName("Interview_Log");
  if (!sheet) return { error: "Interview_Log sheet not found" };

  var loggedDate = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");
  var timestamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");

  sheet.appendRow([
    loggedDate,
    data.name || "",
    data.discordId || "",
    data.company || "",
    data.serial || 1,
    data.interviewDate || loggedDate,
    data.roleDetails || "",
    data.discordLink || "",
    timestamp
  ]);

  return { status: "SUCCESS", loggedDate: loggedDate };
}

function getInterviewsHistory(ss, days) {
  var sheet = ss.getSheetByName("Interview_Log");
  if (!sheet || sheet.getLastRow() <= 1) return { interviews: [] };

  var values = sheet.getDataRange().getValues();
  var list = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    list.push({
      loggedDate: row[0],
      name: row[1],
      discordId: row[2],
      company: row[3],
      serial: row[4],
      interviewDate: row[5],
      roleDetails: row[6],
      discordLink: row[7],
      timestamp: row[8]
    });
  }

  return { interviews: list };
}

function recordWorkshopEntry(ss, data) {
  var sheet = ss.getSheetByName("Workshop_Attendance");
  if (!sheet) return { error: "Workshop_Attendance sheet not found" };

  var dateStr = data.date || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");

  sheet.appendRow([
    dateStr,
    data.slot || "morning",
    data.discordId || "",
    data.name || "",
    data.email || "",
    data.status || "ATTENDED"
  ]);

  return { status: "SUCCESS", date: dateStr };
}

function recordResumeLink(ss, data) {
  var sheet = ss.getSheetByName("Resumes");
  if (!sheet) return { error: "Resumes sheet not found" };

  var discordId = String(data.discordId || "").trim();
  var values = sheet.getDataRange().getValues();
  var targetRow = -1;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === discordId) {
      targetRow = i + 1;
      break;
    }
  }

  var timestamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");

  if (targetRow > 0) {
    sheet.getRange(targetRow, 4).setValue(data.messageLink || data.url || "");
    sheet.getRange(targetRow, 5).setValue(timestamp);
  } else {
    sheet.appendRow([
      discordId,
      data.name || "",
      data.email || "",
      data.messageLink || data.url || "",
      timestamp
    ]);
  }

  return { status: "SUCCESS", discordId: discordId };
}

function recordProjectSubmission(ss, data) {
  var sheet = ss.getSheetByName("Projects");
  if (!sheet) return { error: "Projects sheet not found" };

  var timestamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");

  sheet.appendRow([
    data.discordId || "",
    data.name || "",
    data.projectTitle || "",
    data.githubUrl || "",
    data.liveUrl || "",
    data.summary || "",
    timestamp
  ]);

  return { status: "SUCCESS", discordId: data.discordId };
}

/**
 * -------------------------------------------------------------------------
 * 9. Form Templates Configuration
 * -------------------------------------------------------------------------
 */
function saveFormTemplatesConfig(ss, data) {
  var sheet = ss.getSheetByName("Form_Templates");
  if (!sheet) return { error: "Form_Templates sheet not found" };

  var templateName = data.name || "default";
  var jsonStr = typeof data.config === "string" ? data.config : JSON.stringify(data.config);
  var timestamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");

  var values = sheet.getDataRange().getValues();
  var targetRow = -1;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === templateName) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow > 0) {
    sheet.getRange(targetRow, 2).setValue(jsonStr);
    sheet.getRange(targetRow, 3).setValue(timestamp);
  } else {
    sheet.appendRow([templateName, jsonStr, timestamp]);
  }

  return { status: "SUCCESS", templateName: templateName };
}

function getFormTemplatesConfig(ss) {
  var sheet = ss.getSheetByName("Form_Templates");
  if (!sheet || sheet.getLastRow() <= 1) return { templates: {} };

  var values = sheet.getDataRange().getValues();
  var templates = {};

  for (var i = 1; i < values.length; i++) {
    var name = values[i][0];
    try {
      templates[name] = JSON.parse(values[i][1]);
    } catch (e) {
      templates[name] = values[i][1];
    }
  }

  return { templates: templates };
}

/**
 * -------------------------------------------------------------------------
 * 10. Multi-Cohort Registry Store (STRIDE State)
 * -------------------------------------------------------------------------
 */
function getCohortsRegistryData(ss) {
  var props = PropertiesService.getScriptProperties();
  var cohortsJson = props.getProperty("COHORTS_REGISTRY");
  try {
    return { cohorts: cohortsJson ? JSON.parse(cohortsJson) : [] };
  } catch (e) {
    return { cohorts: [] };
  }
}

function saveCohortRegistryData(ss, data) {
  var props = PropertiesService.getScriptProperties();
  var cohortsJson = props.getProperty("COHORTS_REGISTRY");
  var cohorts = [];
  try {
    if (cohortsJson) cohorts = JSON.parse(cohortsJson);
  } catch (e) {}

  var updated = false;
  for (var i = 0; i < cohorts.length; i++) {
    if (cohorts[i].serverId === data.serverId) {
      cohorts[i] = data;
      updated = true;
      break;
    }
  }
  if (!updated) cohorts.push(data);

  props.setProperty("COHORTS_REGISTRY", JSON.stringify(cohorts));
  return { status: "SUCCESS", count: cohorts.length };
}

/**
 * -------------------------------------------------------------------------
 * 11. Daily Attendance Point Scanner (+1 Present, -1 Absent, 0 Leave)
 * -------------------------------------------------------------------------
 */
function scanDailyAttendanceFromForm(ss, dateStr) {
  var targetDate = dateStr || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");

  var formSheet = ss.getSheetByName("Daily Attendance") ||
                  ss.getSheetByName("Attendance Responses") ||
                  ss.getSheetByName("Form Responses 1");

  var botMapSheet = ss.getSheetByName("Bot_Map");
  var attendanceSheet = ss.getSheetByName("Attendance");
  var leaveSheet = ss.getSheetByName("Leave_Requests");

  if (!botMapSheet || !attendanceSheet) {
    return { error: "Required sheets (Bot_Map / Attendance) not found" };
  }

  // 1. Get all active students from Bot_Map
  var botMapValues = botMapSheet.getDataRange().getValues();
  var students = [];
  for (var i = 1; i < botMapValues.length; i++) {
    var email = String(botMapValues[i][0] || "").toLowerCase().trim();
    var name = String(botMapValues[i][1] || "").trim();
    var uName = String(botMapValues[i][2] || "").toLowerCase().trim().replace(/^@/, '');
    var dId = String(botMapValues[i][3] || "").trim();
    var status = String(botMapValues[i][4] || "active").toLowerCase().trim();

    if (dId && status === 'active') {
      students.push({ email: email, name: name, username: uName, discordId: dId, rowIdx: i + 1 });
    }
  }

  // 2. Read approved leaves for this date
  var approvedLeaves = new Set();
  if (leaveSheet && leaveSheet.getLastRow() > 1) {
    var leaveValues = leaveSheet.getDataRange().getValues();
    for (var l = 1; l < leaveValues.length; l++) {
      var lDiscordId = String(leaveValues[l][2] || "").trim();
      var lStart = String(leaveValues[l][5] || "").trim();
      var lEnd = String(leaveValues[l][6] || "").trim();
      var lStatus = String(leaveValues[l][8] || "").trim().toLowerCase();

      if (lStatus === 'approved' && lDiscordId) {
        if (targetDate >= lStart && targetDate <= lEnd) {
          approvedLeaves.add(lDiscordId);
        }
      }
    }
  }

  // 3. Scan Form responses for target date
  var presentSubmissions = new Set();
  if (formSheet && formSheet.getLastRow() > 1) {
    var formValues = formSheet.getDataRange().getValues();
    for (var f = 1; f < formValues.length; f++) {
      var row = formValues[f];
      var rawTimestamp = row[0];
      var rowDate = "";
      if (rawTimestamp instanceof Date) {
        rowDate = Utilities.formatDate(rawTimestamp, CONFIG.TIMEZONE, "yyyy-MM-dd");
      } else {
        rowDate = String(rawTimestamp || "").substring(0, 10);
      }

      if (rowDate === targetDate || !dateStr) {
        for (var c = 0; c < row.length; c++) {
          var cellVal = String(row[c] || "").toLowerCase().trim().replace(/^@/, '');
          if (cellVal) {
            presentSubmissions.add(cellVal);
          }
        }
      }
    }
  }

  // 4. Determine status and points for every active student
  var presentCount = 0;
  var absentCount = 0;
  var leaveCount = 0;
  var attendanceRecords = [];

  students.forEach(function(s) {
    var isPresent = false;
    if (s.email && presentSubmissions.has(s.email.toLowerCase())) isPresent = true;
    if (s.username && presentSubmissions.has(s.username.toLowerCase())) isPresent = true;
    if (s.discordId && presentSubmissions.has(s.discordId)) isPresent = true;

    var status = 'A';
    var pts = -1;

    if (isPresent) {
      status = 'P';
      pts = 1;
      presentCount++;
    } else if (approvedLeaves.has(s.discordId)) {
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

  // 5. Update Attendance matrix tab
  recordAttendanceSession(ss, { date: targetDate, records: attendanceRecords });

  return {
    status: "SUCCESS",
    date: targetDate,
    totalActive: students.length,
    present: presentCount,
    absent: absentCount,
    leave: leaveCount,
    records: attendanceRecords
  };
}

/**
 * -------------------------------------------------------------------------
 * 11b. Morning Attendance Point Scanner (+1 Present, -1 Absent, 0 Leave)
 * -------------------------------------------------------------------------
 */
function scanMorningAttendanceFromForm(ss, dateStr) {
  var targetDate = dateStr || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");
  var colDate = targetDate + " (Morning)";

  var formSheet = ss.getSheetByName("Morning Attendance") ||
                  ss.getSheetByName("Morning_Attendance");

  var botMapSheet = ss.getSheetByName("Bot_Map");
  var attendanceSheet = ss.getSheetByName("Attendance");
  var leaveSheet = ss.getSheetByName("Leave_Requests");

  if (!botMapSheet || !attendanceSheet) {
    return { error: "Required sheets (Bot_Map / Attendance) not found" };
  }

  // 1. Get all active students from Bot_Map
  var botMapValues = botMapSheet.getDataRange().getValues();
  var students = [];
  for (var i = 1; i < botMapValues.length; i++) {
    var email = String(botMapValues[i][0] || "").toLowerCase().trim();
    var name = String(botMapValues[i][1] || "").trim();
    var uName = String(botMapValues[i][2] || "").toLowerCase().trim().replace(/^@/, '');
    var dId = String(botMapValues[i][3] || "").trim();
    var status = String(botMapValues[i][4] || "active").toLowerCase().trim();

    if (dId && status === 'active') {
      students.push({ email: email, name: name, username: uName, discordId: dId, rowIdx: i + 1 });
    }
  }

  // 2. Read approved leaves for this date
  var approvedLeaves = new Set();
  if (leaveSheet && leaveSheet.getLastRow() > 1) {
    var leaveValues = leaveSheet.getDataRange().getValues();
    for (var l = 1; l < leaveValues.length; l++) {
      var lDiscordId = String(leaveValues[l][2] || "").trim();
      var lStart = String(leaveValues[l][5] || "").trim();
      var lEnd = String(leaveValues[l][6] || "").trim();
      var lStatus = String(leaveValues[l][8] || "").trim().toLowerCase();

      if (lStatus === 'approved' && lDiscordId) {
        if (targetDate >= lStart && targetDate <= lEnd) {
          approvedLeaves.add(lDiscordId);
        }
      }
    }
  }

  // 3. Scan Morning Form responses for target date
  var presentSubmissions = new Set();
  if (formSheet && formSheet.getLastRow() > 1) {
    var formValues = formSheet.getDataRange().getValues();
    for (var f = 1; f < formValues.length; f++) {
      var row = formValues[f];
      var rawTimestamp = row[0];
      var rowDate = "";
      if (rawTimestamp instanceof Date) {
        rowDate = Utilities.formatDate(rawTimestamp, CONFIG.TIMEZONE, "yyyy-MM-dd");
      } else {
        rowDate = String(rawTimestamp || "").substring(0, 10);
      }

      if (rowDate === targetDate || !dateStr) {
        for (var c = 0; c < row.length; c++) {
          var cellVal = String(row[c] || "").toLowerCase().trim().replace(/^@/, '');
          if (cellVal) {
            presentSubmissions.add(cellVal);
          }
        }
      }
    }
  }

  // 4. Determine status and points for every active student
  var presentCount = 0;
  var absentCount = 0;
  var leaveCount = 0;
  var attendanceRecords = [];

  students.forEach(function(s) {
    var isPresent = false;
    if (s.email && presentSubmissions.has(s.email.toLowerCase())) isPresent = true;
    if (s.username && presentSubmissions.has(s.username.toLowerCase())) isPresent = true;
    if (s.discordId && presentSubmissions.has(s.discordId)) isPresent = true;

    var status = 'A';
    var pts = -1;

    if (isPresent) {
      status = 'P';
      pts = 1;
      presentCount++;
    } else if (approvedLeaves.has(s.discordId)) {
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

  // 5. Update Attendance matrix tab with Morning header
  recordAttendanceSession(ss, { date: colDate, records: attendanceRecords });

  return {
    status: "SUCCESS",
    session: "Morning",
    date: targetDate,
    colHeader: colDate,
    totalActive: students.length,
    present: presentCount,
    absent: absentCount,
    leave: leaveCount,
    records: attendanceRecords
  };
}

/**
 * -------------------------------------------------------------------------
 * 12. Job Task Lifecycle Engine (+1 Announced, +1 Approved, -2 Deadline Penalty)
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
    sheet.getRange(targetRow, 9).setValue("Submitted"); // Submission Status
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
  var mentorStatus = data.status || "Approved"; // Approved or Rejected
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
