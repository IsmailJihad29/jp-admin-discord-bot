/**
 * =========================================================================
 * JP ADMIN — Render Free-Tier Uptime Monitor & Wake-up Script
 * Version: v47
 * Target: Google Apps Script Time-Driven Trigger
 * =========================================================================
 * Purpose: Keeps the Render service awake during configured active hours
 * (default 04:50 - 23:30 Asia/Dhaka) to conserve the 750 free monthly hours.
 * Wakes the service 10 minutes prior to active window.
 */

var MONITOR_CONFIG = {
  RENDER_SERVICE_URL: "https://YOUR_RENDER_SERVICE_NAME.onrender.com", // Replace with your Render URL
  DEFAULT_ACTIVE_START: "04:50",
  DEFAULT_ACTIVE_END: "23:30",
  TIMEZONE: "Asia/Dhaka"
};

/**
 * Main Trigger Function: Schedule this to run every 5 or 10 minutes in Apps Script
 */
function checkAndWakeRenderBot() {
  try {
    var now = new Date();
    var timeStr = Utilities.formatDate(now, MONITOR_CONFIG.TIMEZONE, "HH:mm");
    
    var props = PropertiesService.getScriptProperties();
    var customWindow = props.getProperty("BOT_ACTIVE_WINDOW"); // e.g. "04:50-23:30"
    
    var startStr = MONITOR_CONFIG.DEFAULT_ACTIVE_START;
    var endStr = MONITOR_CONFIG.DEFAULT_ACTIVE_END;
    
    if (customWindow && customWindow.indexOf("-") !== -1) {
      var parts = customWindow.split("-");
      startStr = parts[0].trim();
      endStr = parts[1].trim();
    }
    
    var isWithinWindow = (timeStr >= startStr && timeStr <= endStr);
    
    if (isWithinWindow) {
      var renderUrl = props.getProperty("RENDER_SERVICE_URL") || MONITOR_CONFIG.RENDER_SERVICE_URL;
      if (renderUrl && renderUrl.indexOf("YOUR_RENDER") === -1) {
        var response = UrlFetchApp.fetch(renderUrl + "/health", {
          muteHttpExceptions: true,
          method: "GET"
        });
        Logger.log("[" + timeStr + "] Pinned Render: " + response.getResponseCode());
      } else {
        Logger.log("[" + timeStr + "] Render URL not configured yet.");
      }
    } else {
      Logger.log("[" + timeStr + "] Outside active window (" + startStr + " - " + endStr + "). Sleeping.");
    }
  } catch (err) {
    Logger.log("Error waking Render bot: " + err.toString());
  }
}

/**
 * Helper to install a time-driven trigger running every 5 minutes
 */
function installUptimeTrigger() {
  // Clear existing triggers
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "checkAndWakeRenderBot") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // Create new 5-minute recurring trigger
  ScriptApp.newTrigger("checkAndWakeRenderBot")
    .timeBased()
    .everyMinutes(5)
    .create();
    
  Logger.log("Successfully installed checkAndWakeRenderBot trigger running every 5 minutes.");
}
