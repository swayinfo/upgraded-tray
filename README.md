# Upgraded Tray

An enhanced fork of [**obsidian-tray**](https://github.com/dragonwocky/obsidian-tray/) by
[dragonwocky](https://dragonwocky.me/). All credit for the original plugin — and for the
"Tray" name kept here as a tribute — goes to the original author. This fork only adds a few
extra features on top.

> Desktop only.

## What the original plugin does

- Run Obsidian from the system tray / menubar.
- Window management: launch on startup, hide on launch, run in background, hide the
  taskbar/dock icon, and a global hotkey to toggle window focus.
- A customisable tray icon and tooltip.

## What this fork adds

- **Global "Quick Note" hotkey** — triggers an Obsidian command (by ID) even when the window
  is hidden in the tray. Defaults to a [QuickAdd](https://github.com/chhoumann/quickadd) choice;
  set your own command ID in the settings.
- **Global "AI assistant (Explainator)" hotkey** — shows the window and runs a user script
  (e.g. `explainator.js`) from inside your vault. Works even when minimised to the tray.
- Extra settings to configure the command ID, the script path, and both new hotkeys.
- A "Open AI assistant (Explainator)" command in the command palette.

## Installation via BRAT

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) community plugin and enable it.
2. In Obsidian: **Settings → BRAT → Add Beta plugin**.
3. Paste this repository's URL and confirm.
4. Enable **Upgraded Tray** in **Settings → Community plugins**.

BRAT will keep the plugin updated to the latest GitHub release.

### Manual installation

Copy `main.js` and `manifest.json` into
`<your vault>/.obsidian/plugins/upgraded-tray/`, then enable the plugin.

## Configuration notes

The new features expect a couple of things in your vault:

- **Quick Note** uses a command ID. The default points at a QuickAdd choice; replace it in
  the settings with your own (you can find IDs in `.obsidian/hotkeys.json` or via
  `app.commands.listCommands()` in the developer console).
- **Explainator** reads and runs a script file from a path inside your vault. Set that path in
  the settings.

## Credits & licence

Based on `obsidian-tray` by dragonwocky, used under the MIT licence. Fork enhancements are also
released under the MIT licence — see [LICENSE](LICENSE).
