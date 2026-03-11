// Background script - öffnet Popup-Fenster beim Klick auf den Browser-Action-Button

messenger.browserAction.onClicked.addListener(async () => {
  await messenger.windows.create({
    url: "popup/popup.html",
    type: "popup",
    width: 340,
    height: 460,
    allowScriptsToClose: true
  });
});

// Extras-Menü Eintrag
messenger.menus.create({
  id: "kalender-sync-menu",
  title: "Kalender Sync...",
  contexts: ["tools_menu"]
});

messenger.menus.onClicked.addListener(async (info) => {
  if (info.menuItemId === "kalender-sync-menu") {
    await messenger.windows.create({
      url: "popup/popup.html",
      type: "popup",
      width: 340,
      height: 460,
      allowScriptsToClose: true
    });
  }
});
