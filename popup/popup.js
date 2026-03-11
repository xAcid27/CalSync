// Kalender Sync - popup.js v1.9

const sourceSelect = document.getElementById("sourceCalendar");
const targetSelect = document.getElementById("targetCalendar");
const syncBtn      = document.getElementById("syncBtn");
const resetBtn     = document.getElementById("resetBtn");
const statusEl     = document.getElementById("status");
const progressBar  = document.getElementById("progressBar");
const progressFill = document.getElementById("progressFill");
const statsEl      = document.getElementById("stats");
const credUserEl   = document.getElementById("credUser");
const credPassEl   = document.getElementById("credPass");
const saveCredBtn  = document.getElementById("saveCredBtn");
const credStatusEl = document.getElementById("credStatus");

function setStatus(msg, type = "info") {
  statusEl.textContent = msg;
  statusEl.className = type;
}
function setProgress(pct) {
  progressBar.classList.toggle("visible", pct > 0 && pct < 100);
  progressFill.style.width = pct + "%";
}
function showStats(total, skipped, copied, failed) {
  document.getElementById("statTotal").textContent = total;
  document.getElementById("statSkipped").textContent = skipped;
  document.getElementById("statCopied").textContent = copied;
  statsEl.classList.add("visible");
}

// Credentials laden/speichern
async function loadCreds() {
  try {
    const stored = await browser.storage.local.get(["caldavUser", "caldavPass"]);
    if (stored.caldavUser) {
      credUserEl.value = stored.caldavUser;
      credPassEl.value = stored.caldavPass || "";
      credStatusEl.textContent = "✓ Zugangsdaten geladen";
    }
  } catch(e) { /* ignore */ }
}

saveCredBtn.addEventListener("click", async () => {
  const user = credUserEl.value.trim();
  const pass = credPassEl.value;
  if (!user) { credStatusEl.textContent = "⚠ Benutzername fehlt"; return; }
  await browser.storage.local.set({ caldavUser: user, caldavPass: pass });
  credStatusEl.textContent = "✓ Gespeichert!";
  setTimeout(() => { credStatusEl.textContent = ""; }, 2000);
});

async function loadCalendars() {
  setStatus("Kalender werden geladen…", "loading");
  try {
    const calendars = await browser.calendarSync.getCalendars();
    if (!calendars || calendars.length === 0) {
      setStatus("Keine Kalender gefunden.", "error"); return;
    }
    [sourceSelect, targetSelect].forEach((sel, idx) => {
      sel.innerHTML = "";
      calendars.forEach(cal => {
        const opt = document.createElement("option");
        opt.value = cal.id;
        opt.textContent = cal.name + (cal.readOnly ? " 🔒" : "");
        sel.appendChild(opt);
      });
      if (idx === 1 && calendars.length > 1) sel.selectedIndex = 1;
    });
    syncBtn.disabled = false;
    setStatus(`${calendars.length} Kalender geladen. Bereit.`, "info");
  } catch(err) {
    setStatus("❌ " + err.message, "error");
  }
}

async function syncCalendars() {
  const sourceId   = sourceSelect.value;
  const targetId   = targetSelect.value;
  const sourceName = sourceSelect.options[sourceSelect.selectedIndex]?.text || "";

  if (!sourceId || !targetId) { setStatus("Bitte beide Kalender auswählen.", "error"); return; }
  if (sourceId === targetId)  { setStatus("Quelle und Ziel dürfen nicht identisch sein.", "error"); return; }

  syncBtn.disabled = true;
  statsEl.classList.remove("visible");
  setStatus(`Lese „${sourceName}"…`, "loading");
  setProgress(10);

  try {
    const sourceItems = await browser.calendarSync.getItems(sourceId);
    if (!sourceItems || sourceItems.length === 0) {
      setStatus(`⚠️ Keine Termine gefunden.`, "error");
      setProgress(0); syncBtn.disabled = false; return;
    }

    setProgress(30);
    setStatus("Prüfe bereits synchronisierte Termine…", "loading");

    const syncedIds = await browser.calendarSync.getSyncedIds(sourceId, targetId);
    const syncedSet = new Set(syncedIds);
    console.log("[KalenderSync] Bereits synchronisiert:", syncedSet.size);

    setProgress(50);
    let copied = 0, skipped = 0, failed = 0;
    const total = sourceItems.length;
    const errors = [];

    for (let i = 0; i < total; i++) {
      const item = sourceItems[i];
      setProgress(50 + Math.round((i / total) * 45));
      setStatus(`Verarbeite ${i + 1} von ${total}: „${item.title}"…`, "loading");

      if (syncedSet.has(item.id)) {
        skipped++; continue;
      }

      try {
        const stored = await browser.storage.local.get(["caldavUser", "caldavPass"]);
        const creds = { user: stored.caldavUser || "", pass: stored.caldavPass || "" };
        await browser.calendarSync.addItem(targetId, item, creds);
        await browser.calendarSync.markAsSynced(sourceId, targetId, item.id);
        syncedSet.add(item.id);
        copied++;
        console.log(`[KalenderSync] ✓ Kopiert: "${item.title}"`);
      } catch(e) {
        failed++;
        errors.push(`"${item.title}": ${e.message}`);
        console.error(`[KalenderSync] ✗ Fehler bei "${item.title}":`, e.message);
      }
    }

    setProgress(100);
    setTimeout(() => setProgress(0), 800);

    showStats(total, skipped, copied, failed);

    if (failed > 0 && copied === 0) {
      setStatus(`❌ ${failed} Fehler. Erster: ${errors[0]}`, "error");
    } else if (failed > 0) {
      setStatus(`⚠️ ${copied} kopiert, ${skipped} übersprungen, ${failed} Fehler.`, "info");
    } else {
      setStatus(`✅ Fertig! ${copied} neu kopiert, ${skipped} bereits vorhanden.`, "success");
    }

  } catch(err) {
    setStatus("❌ " + err.message, "error");
    console.error("[KalenderSync] Sync-Fehler:", err);
  } finally {
    syncBtn.disabled = false;
  }
}

async function resetSyncState() {
  const sourceId = sourceSelect.value;
  const targetId = targetSelect.value;
  try {
    await browser.calendarSync.resetSyncState(sourceId, targetId);
    setStatus("🔄 Sync-Status zurückgesetzt. Nächster Sync überträgt alle Termine erneut.", "info");
  } catch(e) {
    setStatus("❌ Reset fehlgeschlagen: " + e.message, "error");
  }
}

syncBtn.addEventListener("click", syncCalendars);
resetBtn.addEventListener("click", resetSyncState);
loadCreds();
loadCalendars();
