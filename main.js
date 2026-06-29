/**
 * Upgraded Tray v1.0.0
 * An enhanced fork of obsidian-tray, adding global hotkeys for QuickAdd quick
 * notes and an AI assistant (Explainator), plus extra settings.
 *
 * Original plugin: obsidian-tray v0.3.5
 * (c) 2023 dragonwocky <thedragonring.bod@gmail.com> (https://dragonwocky.me/)
 * (https://github.com/dragonwocky/obsidian-tray/) under the MIT license
 *
 * Fork enhancements (c) 2026 sway, also released under the MIT license.
 */

"use strict";

const LOG_PREFIX = "tray",
  LOG_LOADING = "loading",
  LOG_CLEANUP = "cleaning up",
  LOG_SHOWING_WINDOWS = "showing windows",
  LOG_HIDING_WINDOWS = "hiding windows",
  LOG_WINDOW_CLOSE = "intercepting window close",
  LOG_TRAY_ICON = "creating tray icon",
  LOG_REGISTER_HOTKEY = "registering hotkey",
  LOG_UNREGISTER_HOTKEY = "unregistering hotkey",
  ACTION_QUICK_NOTE = "Quick Note",
  ACTION_SHOW = "Show Vault",
  ACTION_HIDE = "Hide Vault",
  ACTION_RELAUNCH = "Relaunch Obsidian",
  ACTION_CLOSE = "Close Vault",
  DEFAULT_DATE_FORMAT = "YYYY-MM-DD",
  ACCELERATOR_FORMAT = `
    This hotkey is registered globally and will be detected even if Obsidian does
    not have keyboard focus. Format:
    <a href="https://www.electronjs.org/docs/latest/api/accelerator" target="_blank" rel="noopener">
    Electron accelerator</a>
  `,
  MOMENT_FORMAT = `
    Format:
    <a href="https://momentjs.com/docs/#/displaying/format/" target="_blank" rel="noopener">
    Moment.js format string</a>
  `,
  // 16x16 base64 obsidian icon: generated from obsidian.asar/icon.png
  OBSIDIAN_BASE64_ICON = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAHZSURBVDhPlZKxTxRBFMa/XZcF7nIG7mjxjoRCwomJxgsFdhaASqzQxFDzB1AQKgstLGxIiBQGJBpiCCGx8h+wgYaGgAWNd0dyHofeEYVwt/PmOTMZV9aDIL/s5pvZvPfN9yaL/+HR3eXcypta0m4juFbP5GHuXc9IbunDFc9db/G81/ZzhDMN7g8td47mll4R5BfHwZN4LOaA+fHa259PbUmIYzWkt3e2NZNo3/V9v1vvU6kkstk+tLW3ItUVr/m+c3N8MlkwxYqmBFcbwUQQCNOcyVzDwEAWjuPi5DhAMV/tKOYPX5hCyz8Gz1zX5SmWjBvZfmTSaRBJkGAIoxJHv+pVW2yIGNxOJ8bUVNcFEWLxuG1ia6JercTbttwQTeDwPS0kCMXiXtgk/jQrFUw7ptYSMWApF40yo/ytjHq98fdk3ayVE+cn2CxMb6ruz9qAJKFUKoWza1VJSi/n0+ffgYHdWW2gHuxXymg0gjCB0sjpmiaDnkL3RzDyzLqBUKns2ztQqUR0fk2TwSrGSf1eczqF5vsPZRCQSSAFLk6gqctgQRkc6TWRQLV2YMYQki9OoNkqzFQ9r+WOGuW5CrJbOzyAlPKr6MSGLbkcDwbf35oY/jRkt6cAfgNwowruAMz9AgAAAABJRU5ErkJggg==`,
  log = (message) => console.log(`${LOG_PREFIX}: ${message}`);

let tray, plugin;
const obsidian = require("obsidian"),
  { app, Tray, Menu } = require("electron").remote,
  { nativeImage, BrowserWindow } = require("electron").remote,
  { getCurrentWindow, globalShortcut } = require("electron").remote;

const vaultWindows = new Set(),
  maximizedWindows = new Set(),
  getWindows = () => [...vaultWindows],
  observeWindows = () => {
    const onWindowCreation = (win) => {
      vaultWindows.add(win);
      win.setSkipTaskbar(plugin.settings.hideTaskbarIcon);
      win.on("close", () => {
        if (win !== getCurrentWindow()) vaultWindows.delete(win);
      });
      // preserve maximised windows after minimisation
      if (win.isMaximized()) maximizedWindows.add(win);
      win.on("maximize", () => maximizedWindows.add(win));
      win.on("unmaximize", () => maximizedWindows.delete(win));
    };
    onWindowCreation(getCurrentWindow());
    getCurrentWindow().webContents.on("did-create-window", onWindowCreation);
    if (process.platform === "darwin") {
      // on macos, the "hide taskbar icon" option is implemented
      // via app.dock.hide(): thus, the app as a whole will be
      // hidden from the dock, including windows from other vaults.
      // when a vault is closed via the "close vault" button,
      // the cleanup process will call app.dock.show() to restore
      // access to any other open vaults w/out the tray enabled
      // => thus, this listener is required to re-hide the dock
      // if switching to another vault with the option enabled
      getCurrentWindow().on("focus", () => {
        if (plugin.settings.hideTaskbarIcon) hideTaskbarIcons();
      });
    }
  },
  showWindows = () => {
    log(LOG_SHOWING_WINDOWS);
    getWindows().forEach((win) => {
      if (maximizedWindows.has(win)) {
        win.maximize();
        win.focus();
      } else win.show();
    });
  },
  hideWindows = () => {
    log(LOG_HIDING_WINDOWS);
    getWindows().forEach((win) => [
      win.isFocused() && win.blur(),
      plugin.settings.runInBackground ? win.hide() : win.minimize(),
    ]);
  },
  toggleWindows = (checkForFocus = true) => {
    const openWindows = getWindows().some((win) => {
      return (!checkForFocus || win.isFocused()) && win.isVisible();
    });
    if (openWindows) hideWindows();
    else showWindows();
  };

const onWindowClose = (event) => event.preventDefault(),
  onWindowUnload = (event) => {
    log(LOG_WINDOW_CLOSE);
    getCurrentWindow().hide();
    event.stopImmediatePropagation();
    // setting return value manually is more reliable than
    // via `return false` according to electron
    event.returnValue = false;
  },
  interceptWindowClose = () => {
    // intercept in renderer
    window.addEventListener("beforeunload", onWindowUnload, true);
    // intercept in main: is asynchronously executed when registered
    // from renderer, so won't prevent close by itself, but counteracts
    // the 3-second delayed window force close in obsidian.asar/main.js
    getCurrentWindow().on("close", onWindowClose);
  },
  allowWindowClose = () => {
    getCurrentWindow().removeListener("close", onWindowClose);
    window.removeEventListener("beforeunload", onWindowUnload, true);
  };

const hideTaskbarIcons = () => {
    getWindows().forEach((win) => win.setSkipTaskbar(true));
    if (process.platform === "darwin") app.dock.hide();
  },
  showTaskbarIcons = () => {
    getWindows().forEach((win) => win.setSkipTaskbar(false));
    if (process.platform === "darwin") app.dock.show();
  },
  setLaunchOnStartup = () => {
    const { launchOnStartup, runInBackground, hideOnLaunch } = plugin.settings;
    app.setLoginItemSettings({
      openAtLogin: launchOnStartup,
      openAsHidden: runInBackground && hideOnLaunch,
    });
  };

const cleanup = () => {
    log(LOG_CLEANUP);
    unregisterHotkeys();
    showTaskbarIcons();
    allowWindowClose();
    destroyTray();
  },
  relaunchApp = () => {
    app.relaunch();
    app.exit(0);
  },
  closeVault = () => {
    log(LOG_CLEANUP);
    cleanup();
    const vaultWindows = getWindows(),
      obsidianWindows = BrowserWindow.getAllWindows();
    if (obsidianWindows.length === vaultWindows.length) {
      // quit app directly if only remaining windows are in the
      // current vault - necessary for successful quit on macos
      app.quit();
    } else vaultWindows.forEach((win) => win.destroy());
  };

  // Находим ID команды быстрой заметки. У QuickAdd команды называются
  // «QuickAdd: <название выбора>» — название одинаковое у всех пользователей,
  // а ID (quickadd:choice:<uuid>) у каждого свой. Поэтому сначала ищем команду
  // по названию (quickNoteCommandName), и только если не нашли — используем
  // явный ID (quickNoteCommandId) как запасной вариант.
const resolveQuickNoteCommandId = () => {
    const { quickNoteCommandName, quickNoteCommandId } = plugin.settings,
      commands = plugin.app.commands;
    if (quickNoteCommandName) {
      const all = commands.listCommands
        ? commands.listCommands()
        : Object.values(commands.commands ?? {});
      const wanted = quickNoteCommandName.trim().toLowerCase(),
        match =
          all.find((c) => c.name === quickNoteCommandName) ??
          all.find((c) => c.name?.trim().toLowerCase() === wanted);
      if (match) return match.id;
    }
    return quickNoteCommandId || null;
  },
  addQuickNote = () => {
    // Создаём быструю заметку через команду QuickAdd. Вызывается как обычная
    // команда Obsidian, поэтому работает и когда окно свёрнуто в трей: сначала
    // показываем и фокусируем окно, затем (после небольшой задержки на
    // отрисовку) запускаем команду.
    const commandId = resolveQuickNoteCommandId();
    showWindows();
    getWindows().forEach((win) => win.focus());
    setTimeout(() => {
      if (!commandId) {
        new obsidian.Notice(
          `Tray: команда быстрой заметки не настроена — укажите название в настройках`,
          7000
        );
        return;
      }
      const ok = plugin.app.commands.executeCommandById(commandId);
      if (!ok) {
        new obsidian.Notice(`Tray: команда «${commandId}» не найдена`, 7000);
      }
    }, 120);
  },
  // Глобально вызвать AI-помощника (explainator.js): показать окно и запустить скрипт.
  // Скрипт читается и исполняется напрямую (как делает QuickAdd UserScript),
  // поэтому хоткей работает даже когда Obsidian свёрнут в трей.
  runExplainator = async () => {
    showWindows();
    const path =
      plugin.settings.explainatorScriptPath ||
      "0. Files/4. Templates/Scripts/explainator.js";
    try {
      if (!(await plugin.app.vault.adapter.exists(path))) {
        new obsidian.Notice(`Tray: не найден скрипт «${path}»`, 7000);
        return;
      }
      const code = await plugin.app.vault.adapter.read(path);
      const mod = { exports: {} };
      // eslint-disable-next-line no-new-func
      new Function("module", "exports", "require", code)(
        mod,
        mod.exports,
        require
      );
      const run =
        typeof mod.exports === "function" ? mod.exports : mod.exports?.default;
      if (typeof run !== "function") {
        new obsidian.Notice("Tray: explainator.js не экспортирует функцию", 7000);
        return;
      }
      // даём окну прорисоваться, затем запускаем (скрипт открывает правую панель)
      setTimeout(() => {
        Promise.resolve(run({ app: plugin.app, obsidian })).catch((e) =>
          new obsidian.Notice("Tray: ошибка в explainator — " + e.message, 7000)
        );
      }, 120);
    } catch (e) {
      new obsidian.Notice("Tray: не удалось запустить explainator — " + e.message, 7000);
    }
  },
  replaceVaultName = (str) => {
    return str.replace(/{{vault}}/g, plugin.app.vault.getName());
  },
  destroyTray = () => {
    tray?.destroy();
    tray = undefined;
  },
  createTrayIcon = () => {
    destroyTray();
    if (!plugin.settings.createTrayIcon) return;
    log(LOG_TRAY_ICON);
    const obsidianIcon = nativeImage.createFromDataURL(
        plugin.settings.trayIconImage ?? OBSIDIAN_BASE64_ICON
      ),
      contextMenu = Menu.buildFromTemplate([
        {
          type: "normal",
          label: ACTION_QUICK_NOTE,
          accelerator: plugin.settings.quickNoteHotkey,
          click: addQuickNote,
        },
        {
          type: "normal",
          label: ACTION_SHOW,
          accelerator: plugin.settings.toggleWindowFocusHotkey,
          click: showWindows,
        },
        {
          type: "normal",
          label: ACTION_HIDE,
          accelerator: plugin.settings.toggleWindowFocusHotkey,
          click: hideWindows,
        },
        { type: "separator" },
        { label: ACTION_RELAUNCH, click: relaunchApp },
        { label: ACTION_CLOSE, click: closeVault },
      ]);
    tray = new Tray(obsidianIcon);
    tray.setContextMenu(contextMenu);
    tray.setToolTip(replaceVaultName(plugin.settings.trayIconTooltip));
    tray.on("click", () => {
      if (process.platform === "darwin") {
        // macos does not register separate left/right click actions
        // for menu items, icon should open menu w/out causing toggle
        tray.popUpContextMenu();
      } else toggleWindows(false);
    });
  };

const registerHotkeys = () => {
    log(LOG_REGISTER_HOTKEY);
    try {
      const { toggleWindowFocusHotkey, quickNoteHotkey, explainatorHotkey } =
        plugin.settings;
      if (toggleWindowFocusHotkey) {
        globalShortcut.register(toggleWindowFocusHotkey, toggleWindows);
      }
      if (quickNoteHotkey) {
        globalShortcut.register(quickNoteHotkey, addQuickNote);
      }
      if (explainatorHotkey) {
        globalShortcut.register(explainatorHotkey, runExplainator);
      }
    } catch {}
  },
  unregisterHotkeys = () => {
    log(LOG_UNREGISTER_HOTKEY);
    try {
      globalShortcut.unregister(plugin.settings.toggleWindowFocusHotkey);
      globalShortcut.unregister(plugin.settings.quickNoteHotkey);
      if (plugin.settings.explainatorHotkey) {
        globalShortcut.unregister(plugin.settings.explainatorHotkey);
      }
    } catch {}
  };

const OPTIONS = [
  "Window management",
  {
    key: "launchOnStartup",
    desc: "Open Obsidian automatically whenever you log into your computer.",
    type: "toggle",
    default: true,
    onChange: setLaunchOnStartup,
  },
  {
    key: "hideOnLaunch",
    desc: `
      Minimises Obsidian automatically whenever the app is launched. If the
      "Run in background" option is enabled, windows will be hidden to the system
      tray/menubar instead of minimised to the taskbar/dock.
    `,
    type: "toggle",
    default: false,
  },
  {
    key: "runInBackground",
    desc: `
      Hides the app and continues to run it in the background instead of quitting
      it when pressing the window close button or toggle focus hotkey.
    `,
    type: "toggle",
    default: true,
    onChange() {
      setLaunchOnStartup();
      if (plugin.settings.runInBackground) interceptWindowClose();
      else [allowWindowClose(), showWindows()];
    },
  },
  {
    key: "hideTaskbarIcon",
    desc: `
      Hides the window's icon from from the dock/taskbar. Enabling the tray icon first
      is recommended if using this option. This may not work on Linux-based OSes.
    `,
    type: "toggle",
    default: false,
    onChange() {
      if (plugin.settings.hideTaskbarIcon) hideTaskbarIcons();
      else showTaskbarIcons();
    },
  },
  {
    key: "createTrayIcon",
    desc: `
      Adds an icon to your system tray/menubar to bring hidden Obsidian windows
      back into focus on click or force a full quit/relaunch of the app through
      the right-click menu.
    `,
    type: "toggle",
    default: true,
    onChange: createTrayIcon,
  },
  {
    key: "trayIconImage",
    desc: `
      Set the image used by the tray/menubar icon. Recommended size: 16x16
      <br>Preview: <img data-preview style="height: 16px; vertical-align: bottom;">
    `,
    type: "image",
    default: OBSIDIAN_BASE64_ICON,
    onChange: createTrayIcon,
  },
  {
    key: "trayIconTooltip",
    desc: `
      Set a title to identify the tray/menubar icon by. The
      <code>{{vault}}</code> placeholder will be replaced by the vault name.
      <br>Preview: <b class="u-pop" data-preview></b>
    `,
    type: "text",
    default: "{{vault}} | Obsidian",
    postprocessor: replaceVaultName,
    onChange: createTrayIcon,
  },
  {
    key: "toggleWindowFocusHotkey",
    desc: ACCELERATOR_FORMAT,
    type: "hotkey",
    default: "CmdOrCtrl+Shift+Tab",
    onBeforeChange: unregisterHotkeys,
    onChange: registerHotkeys,
  },
  "Quick notes",
  {
    key: "quickNoteCommandName",
    desc: `
      Название команды быстрой заметки, как оно показано в палитре команд
      (например <code>QuickAdd: Создать новую заметку</code>). Плагин сам
      находит команду по названию, поэтому у каждого пользователя сработает свой
      ID — название просто должно совпадать. Если оставить пустым, используется
      ID из поля ниже.
    `,
    type: "text",
    default: "QuickAdd: Создать новую заметку",
  },
  {
    key: "quickNoteCommandId",
    desc: `
      Запасной вариант: точный ID команды Obsidian (например
      <code>quickadd:choice:&lt;uuid&gt;</code>). Используется, только если поле
      с названием выше пустое или команда по названию не найдена. Узнать ID можно
      в <code>.obsidian/hotkeys.json</code> или через
      <code>app.commands.listCommands()</code> в консоли разработчика.
    `,
    type: "text",
    default: "",
  },
  {
    key: "quickNoteHotkey",
    desc: ACCELERATOR_FORMAT,
    type: "hotkey",
    default: "CmdOrCtrl+Alt+N",
    onBeforeChange: unregisterHotkeys,
    onChange: registerHotkeys,
  },
  "AI assistant (Explainator)",
  {
    key: "explainatorScriptPath",
    desc: "Путь к скрипту explainator.js внутри хранилища (относительно корня волта).",
    type: "text",
    default: "0. Files/4. Templates/Scripts/explainator.js",
  },
  {
    key: "explainatorHotkey",
    desc: `Глобально открывает AI-помощника (explainator) и фокусирует окно — работает даже из трея. ${ACCELERATOR_FORMAT}`,
    type: "hotkey",
    default: "CmdOrCtrl+Shift+Space",
    onBeforeChange: unregisterHotkeys,
    onChange: registerHotkeys,
  },
];

const keyToLabel = (key) =>
    key[0].toUpperCase() +
    key
      .slice(1)
      .split(/(?=[A-Z])/)
      .map((word) => word.toLowerCase())
      .join(" "),
  htmlToFragment = (html) =>
    document
      .createRange()
      .createContextualFragment((html ?? "").replace(/\s+/g, " "));

class SettingsTab extends obsidian.PluginSettingTab {
  display() {
    this.containerEl.empty();
    for (const opt of OPTIONS) {
      const setting = new obsidian.Setting(this.containerEl);
      if (typeof opt === "string") {
        setting.setName(opt);
        setting.setHeading();
      } else {
        if (opt.default) opt.placeholder ??= `Example: ${opt.default}`;
        setting.setName(keyToLabel(opt.key));
        setting.setDesc(htmlToFragment(opt.desc));
        const onChange = async (value) => {
          await opt.onBeforeChange?.();
          plugin.settings[opt.key] = value;
          await plugin.saveSettings();
          await opt.onChange?.();
        };

        const value = plugin.settings[opt.key] ?? opt.default ?? "";
        if (opt.type === "toggle") {
          setting.addToggle((toggle) => {
            toggle.setValue(value).onChange(onChange);
          });
        } else if (opt.type === "image") {
          const previewImg = setting.descEl.querySelector("img[data-preview");
          if (previewImg) previewImg.src = value;
          const fileUpload = setting.descEl.createEl("input");
          fileUpload.style.visibility = "hidden";
          fileUpload.type = "file";
          fileUpload.onchange = (event) => {
            const file = event.target.files[0],
              reader = new FileReader();
            reader.onloadend = () => {
              onChange(reader.result);
              if (previewImg) previewImg.src = reader.result;
            };
            reader.readAsDataURL(file);
          };
          setting.addButton((button) => {
            button.setIcon("image").onClick(() => fileUpload.click());
          });
        } else if (opt.type === "moment") {
          setting.addMomentFormat((moment) => {
            const previewEl = setting.descEl.querySelector("[data-preview]");
            if (previewEl) moment.setSampleEl(previewEl);
            moment
              .setPlaceholder(opt.placeholder)
              .setDefaultFormat(opt.default ?? "")
              .setValue(value)
              .onChange(onChange);
          });
        } else {
          const previewEl = setting.descEl.querySelector("[data-preview]"),
            updatePreview = (value) => {
              if (!previewEl) return;
              previewEl.innerText = opt?.postprocessor(value) ?? value;
            };
          updatePreview(value);
          setting.addText((text) => {
            text
              .setPlaceholder(opt.placeholder)
              .setValue(value)
              .onChange((value) => [onChange(value), updatePreview(value)]);
          });
        }
      }
    }
  }
}

class TrayPlugin extends obsidian.Plugin {
  async onload() {
    log(LOG_LOADING);
    await this.loadSettings();
    this.addSettingTab(new SettingsTab(this.app, this));
    const { settings } = this;

    plugin = this;
    createTrayIcon();
    registerHotkeys();
    setLaunchOnStartup();
    observeWindows();
    if (settings.runInBackground) interceptWindowClose();
    if (settings.hideTaskbarIcon) hideTaskbarIcons();
    if (settings.hideOnLaunch) {
      this.registerEvent(this.app.workspace.onLayoutReady(hideWindows));
    }

    // add as command: can be called from command palette
    // and can have non-global hotkey assigned via in-app menu
    this.addCommand({
      id: "relaunch-app",
      name: ACTION_RELAUNCH,
      callback: relaunchApp,
    });
    this.addCommand({
      id: "close-vault",
      name: ACTION_CLOSE,
      callback: closeVault,
    });
    this.addCommand({
      id: "open-explainator",
      name: "Open AI assistant (Explainator)",
      callback: runExplainator,
    });
  }
  onunload() {
    cleanup();
  }

  async loadSettings() {
    const DEFAULT_SETTINGS = OPTIONS.map((opt) => ({ [opt.key]: opt.default }));
    this.settings = Object.assign(...DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
}
module.exports = TrayPlugin;

/* nosourcemap */