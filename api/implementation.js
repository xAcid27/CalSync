"use strict";

var { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");

function getCal() {
  return ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs").cal;
}

function newUUID() {
  return Services.uuid.generateUUID().toString().replace(/[{}]/g, "");
}

function prTimeToDateTime(prTime, tzId) {
  if (!prTime) return null;
  try {
    const cal = getCal();
    const dt = cal.createDateTime();
    dt.nativeTime = prTime;
    if (tzId) {
      try {
        const tz = cal.timezoneService.getTimezone(tzId);
        if (tz) return dt.getInTimezone(tz);
      } catch(e) {}
    }
    return dt;
  } catch(e) { return null; }
}

function loadSyncState() {
  try {
    const file = getSyncFile();
    if (!file.exists()) return {};
    const stream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
    stream.init(file, -1, 0, 0);
    const scriptable = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
    scriptable.init(stream);
    const data = scriptable.read(scriptable.available());
    scriptable.close(); stream.close();
    return JSON.parse(data);
  } catch(e) { return {}; }
}

function saveSyncState(state) {
  try {
    const file = getSyncFile();
    const data = JSON.stringify(state, null, 2);
    const stream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
    stream.init(file, 0x02 | 0x08 | 0x20, 0o644, 0);
    const conv = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(Ci.nsIConverterOutputStream);
    conv.init(stream, "UTF-8");
    conv.writeString(data);
    conv.close(); stream.close();
  } catch(e) { console.log("[KalenderSync] saveSyncState: " + e.message); }
}

function getSyncFile() {
  const profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile);
  const f = profileDir.clone();
  f.append("kalender-sync-state.json");
  return f;
}

var calendarSync = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    return {
      calendarSync: {

        async getCalendars() {
          const cal = getCal();
          const calendars = cal.manager.getCalendars();
          return (calendars || []).map(c => ({
            id: c.id, name: c.name || "(Unbekannt)", readOnly: !!c.readOnly
          }));
        },

        async getItems(calendarId) {
          const cal = getCal();
          const calendar = cal.manager.getCalendarById(calendarId);
          if (!calendar) throw new Error("Kalender nicht gefunden: " + calendarId);
          console.log(`[KalenderSync] Lade: "${calendar.name}" (Typ: ${calendar.type})`);

          const items = [];

          if (calendar.type === "storage") {
            const { Sqlite } = ChromeUtils.importESModule("resource://gre/modules/Sqlite.sys.mjs");
            const profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile);
            const dbFile = profileDir.clone();
            dbFile.append("calendar-data");
            dbFile.append("local.sqlite");

            const db = await Sqlite.openConnection({ path: dbFile.path, readOnly: true });
            try {
              const rows = await db.execute(
                "SELECT id, title, event_start, event_end, event_start_tz, event_end_tz, flags FROM cal_events WHERE cal_id = :calId AND recurrence_id IS NULL",
                { calId: calendarId }
              );
              const recurRows = await db.execute(
                "SELECT item_id, icalString FROM cal_recurrence WHERE cal_id = :calId",
                { calId: calendarId }
              );
              const recurMap = {};
              for (const r of recurRows) {
                const id = r.getResultByName("item_id");
                if (!recurMap[id]) recurMap[id] = [];
                recurMap[id].push(r.getResultByName("icalString"));
              }
              const propRows = await db.execute(
                "SELECT item_id, key, value FROM cal_properties WHERE cal_id = :calId AND recurrence_id IS NULL",
                { calId: calendarId }
              );
              const props = {};
              for (const r of propRows) {
                const id = r.getResultByName("item_id");
                if (!props[id]) props[id] = {};
                props[id][r.getResultByName("key")] = r.getResultByName("value");
              }

              for (const row of rows) {
                const id = row.getResultByName("id");
                const title = row.getResultByName("title") || "";
                const startTzId = row.getResultByName("event_start_tz");
                const endTzId = row.getResultByName("event_end_tz");
                const startDt = prTimeToDateTime(row.getResultByName("event_start"), startTzId);
                const endDt = prTimeToDateTime(row.getResultByName("event_end"), endTzId);
                const isAllDay = !!((row.getResultByName("flags") || 0) & 1);
                const itemProps = props[id] || {};
                const rrules = recurMap[id] || [];

                console.log(`[KalenderSync] "${title}" | ${startDt?.icalString} | TZ: ${startTzId}`);
                items.push({
                  id, title,
                  startDate: startDt?.icalString ?? null,
                  endDate: endDt?.icalString ?? null,
                  startTzId: startTzId || "UTC",
                  endTzId: endTzId || "UTC",
                  description: itemProps["DESCRIPTION"] || "",
                  location: itemProps["LOCATION"] || "",
                  isAllDay, rrules, icalString: ""
                });
              }
            } finally {
              await db.close();
            }
          }

          console.log(`[KalenderSync] Finale Anzahl: ${items.length}`);
          return items;
        },

        async getSyncedIds(sourceId, targetId) {
          const state = loadSyncState();
          return state[sourceId + "__" + targetId] || [];
        },

        async markAsSynced(sourceId, targetId, itemId) {
          const state = loadSyncState();
          const key = sourceId + "__" + targetId;
          if (!state[key]) state[key] = [];
          if (!state[key].includes(itemId)) state[key].push(itemId);
          saveSyncState(state);
          return true;
        },

        async addItem(calendarId, itemData, creds) {
          Cu.importGlobalProperties(["fetch"]);
          const cal = getCal();
          const calendar = cal.manager.getCalendarById(calendarId);
          if (!calendar) throw new Error("Zielkalender nicht gefunden: " + calendarId);

          // CalDAV-URL des Zielkalenders
          const calUri = calendar.uri.spec;
          const uid = newUUID();
          const putUrl = calUri.replace(/\/?$/, "/") + uid + ".ics";

          // Timestamps
          const now = new Date();
          function toIcalUtc(d) {
            return d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
          }

          // DTSTART / DTEND in UTC umrechnen
          function toUtcStr(icalStr, tzId) {
            try {
              const dt = cal.createDateTime(icalStr);
              if (tzId && tzId !== "floating" && tzId !== "UTC") {
                const tz = cal.timezoneService.getTimezone(tzId);
                if (tz) dt.timezone = tz;
              }
              const utc = dt.getInTimezone(cal.dtz.UTC);
              return utc.icalString;
            } catch(e) { return toIcalUtc(now); }
          }

          const dtStart = toUtcStr(itemData.startDate, itemData.startTzId);
          const dtEnd   = toUtcStr(itemData.endDate,   itemData.endTzId);
          const stamp   = toIcalUtc(now);

          // iCal line folding: max 75 Zeichen, Fortsetzung mit CRLF + Leerzeichen
          function foldLine(line) {
            if (line.length <= 75) return line;
            let result = "";
            let first = true;
            while (line.length > 0) {
              const chunk = first ? line.substring(0, 75) : line.substring(0, 74);
              result += (first ? "" : "\r\n ") + chunk;
              line = first ? line.substring(75) : line.substring(74);
              first = false;
            }
            return result;
          }

          // Nur Sonderzeichen escapen die noch nicht escaped sind;
          // \n aus SQLite (literal backslash-n) bleibt erhalten
          const escVal = (s) => (s || "")
            .replace(/\r\n/g, "\\n")   // Windows-Zeilenumbrüche
            .replace(/\r/g,   "\\n")
            .replace(/\n/g,   "\\n");  // Unix-Zeilenumbrüche → \n

          let ical = [
            "BEGIN:VCALENDAR",
            "PRODID:-//KalenderSync//EN",
            "VERSION:2.0",
            "CALSCALE:GREGORIAN",
            "BEGIN:VEVENT",
            `UID:${uid}`,
            `DTSTAMP:${stamp}`,
            `DTSTART:${dtStart}`,
            `DTEND:${dtEnd}`,
            foldLine(`SUMMARY:${escVal(itemData.title)}`),
          ];

          if (itemData.description && itemData.description.trim()) {
            ical.push(foldLine(`DESCRIPTION:${escVal(itemData.description)}`));
          }
          if (itemData.location && itemData.location.trim()) {
            ical.push(foldLine(`LOCATION:${escVal(itemData.location)}`));
          }

          if (itemData.rrules && itemData.rrules.length > 0) {
            for (const raw of itemData.rrules) {
              const r = raw.trim();
              if (r.startsWith("RRULE:")) ical.push(r);
            }
          }

          ical.push("END:VEVENT", "END:VCALENDAR");
          const icalStr = ical.join("\r\n") + "\r\n";

          // Basic Auth aus übergebenen Credentials
          const headers = { "Content-Type": "text/calendar; charset=utf-8" };
          if (creds && creds.user) {
            Cu.importGlobalProperties(["btoa"]);
            const b64 = btoa(unescape(encodeURIComponent(creds.user + ":" + (creds.pass || ""))));
            headers["Authorization"] = "Basic " + b64;
            const hostname = calUri.match(/^https?:\/\/([^/]+)/)?.[1] || calUri;
            console.log(`[KalenderSync] Auth: ${creds.user}@${hostname}`);
          } else {
            console.log("[KalenderSync] ⚠ Keine Zugangsdaten – bitte im Popup eingeben!");
          }

          console.log(`[KalenderSync] PUT ${putUrl}`);

          const resp = await fetch(putUrl, { method: "PUT", headers, body: icalStr });
          console.log(`[KalenderSync] PUT Antwort: ${resp.status} ${resp.statusText}`);
          if (!resp.ok) {
            const body = await resp.text().catch(() => "");
            throw new Error(`HTTP ${resp.status}: ${body.substring(0, 200)}`);
          }

          return { success: true };
        },

        async resetSyncState(sourceId, targetId) {
          const state = loadSyncState();
          const key = sourceId + '__' + targetId;
          delete state[key];
          saveSyncState(state);
          console.log('[KalenderSync] Sync-State zurückgesetzt für: ' + key);
          return true;
        }
      }
    };
  }
};
