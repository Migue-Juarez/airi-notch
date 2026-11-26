import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

function harness(files = new Map()) {
    const timers = new Map();
    const timerDelays = new Map();
    const calls = [];
    const notifications = [];
    const sounds = [];
    const pending = [];
    const quotaCalls = [];
    const quotaPending = [];
    const chromeActors = new Set();
    let nextId = 1;
    class Actor {
        constructor(props = {}) {
            Object.assign(this, props);
            this.scale_x ??= 1;
            this.scale_y ??= 1;
            this.events = {};
            this.children = [];
            this.easeCalls = [];
        }
        connect(name, callback) { this.events[name] = callback; return nextId++; }
        disconnect() {}
        add_child(child) { this.children.push(child); }
        remove_all_children() { this.children = []; }
        set_child(child) { this.child = child; }
        set_policy(horizontal, vertical) { this.policy = [horizontal, vertical]; }
        set_position(x, y) { this.x = x; this.y = y; }
        set_pivot_point(x, y) { this.pivotPoint = [x, y]; }
        get_preferred_width() {
            const styleWidthText = this.style?.match(/(?:^|;)\s*width:\s*(\d+(?:\.\d+)?)px/)?.[1];
            const styleWidth = styleWidthText === undefined
                ? undefined
                : Number(styleWidthText);
            const width = this.preferredWidth ?? styleWidth ?? 260;
            return [width, width];
        }
        get_preferred_height() { return [72, 72]; }
        get_transformed_position() { return [this.x ?? 1880, this.y ?? 0]; }
        get_transformed_size() { return [this.width ?? 40, this.height ?? 32]; }
        remove_all_transitions() {}
        get_stage() { return true; }
        destroy() { this.destroyed = true; }
        // Reproduce GNOME con enable-animations=false.
        ease(options) {
            this.easeCalls.push(options);
            Object.assign(this, options);
            options.onComplete?.();
        }
    }
    class Label extends Actor {
        constructor(props = {}) {
            assert.equal('line_wrap' in props, false);
            super(props);
            this.clutter_text = { line_wrap: false };
        }
    }
    const focusEvents = [];
    const win = { get_window_type: () => 0, activate() {
        focusEvents.push('activate');
        this.activated = true;
    } };
    const display = {
        focus_window: win,
        connect(_signal, callback) { this.focusChanged = callback; return 1; },
        disconnect() {},
    };
    const stageSignals = new Map();
    const stage = {
        connect(name, callback) {
            const id = nextId++;
            stageSignals.set(id, { name, callback });
            return id;
        },
        disconnect(id) { stageSignals.delete(id); },
    };
    const GLib = {
        build_filenamev: parts => parts.join('/'),
        get_home_dir: () => '/home/test',
        get_user_data_dir: () => '/home/test/.local/share',
        get_user_config_dir: () => '/home/test/.config',
        getenv: name => name === 'XDG_RUNTIME_DIR' ? '/run/user/1000' : null,
        get_real_time: () => Date.now() * 1000,
        find_program_in_path: name => `/usr/bin/${name}`,
        PRIORITY_DEFAULT: 0, PRIORITY_DEFAULT_IDLE: 1,
        SOURCE_REMOVE: false, SOURCE_CONTINUE: true,
        timeout_add(_priority, delay, callback) {
            const id = nextId++;
            timers.set(id, callback);
            timerDelays.set(id, delay);
            return id;
        },
        idle_add(_priority, callback) {
            const id = nextId++;
            timers.set(id, callback);
            return id;
        },
        source_remove: id => {
            timerDelays.delete(id);
            return timers.delete(id);
        },
    };
    const statusAreaAdds = [];
    const Main = {
        panel: {
            addToStatusArea(...args) { statusAreaAdds.push(args); },
            _centerBox: new Actor({
                x: 860,
                y: 0,
                width: 200,
                height: 32,
                translation_x: 0,
            }),
            statusArea: {
                quickSettings: { menu: { close(animation) {
                    assert.equal(animation, 0);
                    focusEvents.push('close-menu');
                } } },
            },
        },
        layoutManager: {
            primaryMonitor: { x: 0, y: 0, width: 1920, height: 1080 },
            uiGroup: {
                set_child_above_sibling(actor, sibling) { actor.raisedAbove = sibling; },
            },
            connect() { return nextId++; },
            disconnect() {},
            addTopChrome(actor) { chromeActors.add(actor); },
            removeChrome(actor) { chromeActors.delete(actor); },
        },
        notifyError: (...args) => notifications.push(args),
    };
    const encoder = new TextEncoder();
    const Gio = {
        FileIcon: class { constructor({ file }) { this.file = file; } },
        FileCreateFlags: { REPLACE_DESTINATION: 1 },
        File: { new_for_path: path => ({
            path,
            query_exists: () => files.has(path)
                || [...files.keys()].some(candidate => candidate.startsWith(`${path}/`)),
            load_contents: () => [
                true,
                encoder.encode(files.get(path) ?? `${Date.now() / 1000} 0.500\n`),
            ],
            enumerate_children: () => {
                const prefix = `${path}/`;
                const children = [...files.keys()]
                    .filter(candidate => candidate.startsWith(prefix)
                        && !candidate.slice(prefix.length).includes('/'));
                return {
                    next_file: () => {
                        const child = children.shift();
                        return child ? { get_name: () => child.slice(prefix.length) } : null;
                    },
                    close: () => true,
                };
            },
            delete: () => files.delete(path),
            make_directory_with_parents: () => {
                files.set(path, '');
                return true;
            },
            replace_contents: contents => {
                files.set(path, new TextDecoder().decode(contents));
                return [true, 'etag'];
            },
        }) },
        FileQueryInfoFlags: { NONE: 0 },
        SubprocessFlags: {
            STDOUT_PIPE: 1,
            STDERR_PIPE: 2,
            STDOUT_SILENCE: 4,
            STDERR_SILENCE: 8,
        },
        Subprocess: {
            new(argv) {
                sounds.push(Array.from(argv));
                return {
                    wait_check_async(_cancellable, callback) { callback(this, {}); },
                    wait_check_finish: () => true,
                };
            },
        },
        SubprocessLauncher: class {
            setenv() {}
            spawnv(argv) {
                const isQuotaReader = argv.at(-1)?.endsWith('/copilot-quota/read-quota.mjs');
                const queue = isQuotaReader ? quotaPending : pending;
                if (isQuotaReader)
                    quotaCalls.push(argv.slice());
                else
                    calls.push(argv.slice(1));
                const process = {
                    communicate_utf8_async(_input, _cancel, callback) {
                        queue.push((success = true, stdout = 'dictado local de prueba\n') => {
                            process.success = success;
                            process.stdout = success ? stdout : '';
                            callback(process, {});
                        });
                    },
                    communicate_utf8_finish: () => [true, process.stdout, 'backend error'],
                    get_successful() { return this.success; },
                    force_exit() { this.killed = true; },
                };
                return process;
            }
        },
    };
    const source = fs.readFileSync(new URL('../gnome-shell-extension/extension.js', import.meta.url), 'utf8')
        .replace(/^import .*;\n/gm, '')
        .replace('export default class', 'globalThis.TestExtension = class');
    const context = vm.createContext({
        GLib, Gio, Main, PopupAnimation: { NONE: 0 }, logError() {},
        Clutter: { ActorAlign: { CENTER: 0 }, BUTTON_PRIMARY: 1,
            EVENT_STOP: true, EVENT_PROPAGATE: false, EventType: { TOUCH_BEGIN: 0 },
            BinLayout: class {},
            FixedLayout: class {},
            AnimationMode: {
                EASE_IN_OUT_SINE: 0,
                EASE_OUT_QUAD: 1,
                EASE_IN_OUT_QUAD: 2,
                EASE_OUT_BACK: 3,
            } },
        Pango: { EllipsizeMode: { END: 3 } },
        St: {
            Icon: Actor,
            Widget: Actor,
            BoxLayout: Actor,
            Label,
            Button: Actor,
            ScrollView: Actor,
            PolicyType: { NEVER: 0, AUTOMATIC: 1 },
        },
        PanelMenu: { Button: Actor },
        TextDecoder,
        TextEncoder,
        Extension: class { constructor() { this.uuid = 'voice-to-terminal@migue.local'; } },
        global: { display, stage, get_current_time: () => 1 },
    });
    vm.runInContext(source, context);
    const extension = new context.TestExtension();
    extension.enable();
    const finish = (success = true, stdout) => pending.shift()(success, stdout);
    const finishQuota = (success = true, stdout) => quotaPending.shift()(success, stdout);
    finish();
    const activeTimerCount = () => timers.size
        - Number(Boolean(extension._floatingBlinkTimer))
        - Number(Boolean(extension._floatingBlinkRestoreTimer))
        - Number(Boolean(extension._floatingSaccadeTimer))
        - Number(Boolean(extension._floatingSaccadeRestoreTimer))
        - Number(Boolean(extension._copilotNotificationTimer))
        - Number(Boolean(extension._copilotAmbienceTimer))
        - Number(Boolean(extension._copilotQuotaTimeoutTimer))
        - Number(Boolean(extension._homeClockTimer))
        - Number(Boolean(extension._panelCenteringTimer));
    return {
        extension, timers, timerDelays, calls, quotaCalls, notifications, sounds,
        finish, finishQuota, win, display, focusEvents,
        chromeActors, activeTimerCount, files, main: Main, stage, stageSignals,
        statusAreaAdds,
    };
}

function expireQuotaRequest(h) {
    const timerId = h.extension._copilotQuotaTimeoutTimer;
    assert.ok(timerId);
    assert.equal(h.timerDelays.get(timerId), 30_000);
    const callback = h.timers.get(timerId);
    assert.ok(callback);
    assert.equal(callback(), false);
    h.timers.delete(timerId);
    h.timerDelays.delete(timerId);
}

function assertFloatingRobotHasNoBadge(button) {
    assert.match(button.style, /background-color: transparent/);
    assert.match(button.style, /border: 0/);
    assert.match(button.style, /outline: none/);
    assert.match(button.style, /box-shadow: none/);
}

function activeSessionRows(extension) {
    return extension._activeSessionsList.children.filter(child =>
        child.children?.length === 2 && child.children[0]?.children?.length === 2);
}

test('Airi indicator sits right of the clock and is centered on screen', () => {
    const h = harness();
    assert.equal(h.statusAreaAdds.length, 1);
    assert.equal(h.statusAreaAdds[0][1], h.extension._indicator);
    assert.deepEqual(h.statusAreaAdds[0].slice(2), [1, 'center']);
    h.extension._recordButton.x = 1010;
    h.extension._recordButton.width = 40;
    h.extension._centerPanelIndicator();
    assert.equal(h.main.panel._centerBox.translation_x, -70);
    h.extension.disable();
});

test('floating robot stays at upper left and opens compact controls', () => {
    const h = harness();
    assert.ok(h.extension._floatingButton);
    assert.deepEqual(
        [h.extension._floatingButton.width, h.extension._floatingButton.height],
        [112, 112],
    );
    assert.equal(h.extension._floatingRobotIcon.icon_size, 112);
    assert.match(h.extension._floatingRobotIcon.style, /icon-shadow/);
    assert.equal(h.extension._floatingRobotIcon.gicon.file.path,
        h.extension._robotPosePaths.front);
    assert.equal(h.extension._floatingRobotIcons.front.opacity, 255);
    assert.equal(h.extension._floatingRobotIcons.threeQuarter.opacity, 0);
    assert.equal(h.extension._floatingEyes.length, 2);
    assert.equal(h.extension._floatingExpression, 'contento');
    assert.equal(h.extension._floatingMouth.visible, true);
    assert.equal(h.extension._floatingMouth.width, 22);
    assert.match(h.extension._floatingMouth.style, /border-bottom: 4px solid/);
    assert.match(h.extension._floatingEyes[0].style, /border-radius: 4px/);
    assert.equal(h.extension._floatingHint.text, 'Abrir controles');
    assert.equal(h.chromeActors.has(h.extension._floatingHint), false);
    assert.equal(h.extension._floatingButton.can_focus, true);
    assertFloatingRobotHasNoBadge(h.extension._floatingButton);
    h.extension._floatingButton.events['enter-event']();
    assertFloatingRobotHasNoBadge(h.extension._floatingButton);
    assert.equal(h.extension._floatingRobotIcon.gicon.file.path,
        h.extension._robotPosePaths.front);
    assert.equal(h.extension._floatingRobotIcons.front.opacity, 255);
    assert.equal(h.extension._floatingRobotIcons.threeQuarter.opacity, 0);
    assert.equal(h.extension._floatingRobotIcons.threeQuarter.easeCalls.length, 0);
    h.extension._floatingButton.events['leave-event']();
    assert.equal(h.extension._floatingRobotIcon.gicon.file.path,
        h.extension._robotPosePaths.front);
    assert.equal(h.extension._floatingRobotIcons.front.opacity, 255);
    assert.equal(h.extension._floatingRobotIcons.threeQuarter.opacity, 0);
    assert.deepEqual(
        [h.extension._floatingButton.x, h.extension._floatingButton.y],
        [14, 46],
    );
    assert.equal(h.extension._floatingRobotCanvas.scale_x, 1);
    assert.equal(h.extension._floatingRobotCanvas.scale_y, 1);
    assert.equal(h.extension._floatingRobotCanvas.translation_y, 0);
    const blinkId = h.extension._floatingBlinkTimer;
    const blink = h.timers.get(blinkId);
    h.timers.delete(blinkId);
    assert.equal(blink(), false);
    assert.equal(h.extension._floatingEyes[0].scale_y, 0.12);
    const restoreId = h.extension._floatingBlinkRestoreTimer;
    const restore = h.timers.get(restoreId);
    h.timers.delete(restoreId);
    assert.equal(restore(), false);
    assert.equal(h.extension._floatingEyes[0].scale_y, 1);
    assert.equal(h.extension._floatingRobotCanvas.scale_x, 1);
    assert.equal(h.extension._floatingRobotCanvas.scale_y, 1);
    assert.ok(h.chromeActors.has(h.extension._floatingButton));
    h.extension._floatingButton.events.clicked();
    assert.ok(h.extension._overlay);
    assert.equal(h.extension._overlayVariant, 'compact');
    assert.equal(h.extension._floatingRobotIcon.gicon.file.path,
        h.extension._robotPosePaths.threeQuarter);
    assert.equal(h.extension._floatingButton.raisedAbove, h.extension._overlay);
    assert.equal(h.extension._caption.clutter_text.line_wrap, true);
    assert.equal(h.extension._activeSessionsBox, null);
    assert.equal(h.extension._compactSessionSummary.visible, false);
    assert.equal(h.extension._overlay.x, 138);
    assert.equal(h.extension._caption.text, '');
    assert.equal(h.extension._caption.visible, false);
    assert.match(h.extension._overlay.style, /width: 340px/);
    assert.match(h.extension._overlay.style, /background-color: #0e0e10/);
    assert.equal(h.extension._overlay.children.length, 1);
    assert.equal(h.extension._controlFooter.visible, true);
    assert.equal(h.extension._floatingVisibilityButton.child.icon_size, 16);
    assert.match(h.extension._floatingVisibilityButton.style, /width: 44px/);
    assert.match(h.extension._actionButton.style, /width: 48px/);
    assert.equal(h.extension._actionIcon.icon_size, 20);
    assert.match(h.extension._floatingVisibilityButton.style, /border-radius: 999px/);
    assert.match(h.extension._floatingVisibilityButton.style, /color: #b3b0a6/);
    assert.match(h.extension._floatingVisibilityButton.style, /background-color: #1b1b1f/);
    assert.match(h.extension._actionButton.style, /background-color: #0f766e/);
    assert.match(h.extension._actionButton.style, /border-radius: 999px/);
    assert.match(h.extension._floatingEyes[0].style, /background-color: #0f766e/);
    assert.match(h.extension._floatingEyes[0].style, /rgba\(15,118,110,0\.75\)/);
    assert.match(h.extension._meterBars[0].style, /background-color: #f3e6cf/);
    assert.match(h.extension._meterBars[2].style, /background-color: #0f766e/);
    assert.equal(h.calls.length, 1);
    h.extension._floatingButton.events.clicked();
    assert.equal(h.extension._overlay, null);
    assert.equal(h.extension._floatingRobotIcon.gicon.file.path,
        h.extension._robotPosePaths.front);
    assert.equal(h.calls.length, 1);
    h.extension.disable();
    assert.equal(h.chromeActors.size, 0);
});

test('compact floating card leaves a gap from the robot when it opens to the left', () => {
    const h = harness();
    h.extension._floatingButton.set_position(1840, 46);
    h.extension._floatingButton.events.clicked();

    assert.ok(h.extension._overlay);
    assert.equal(h.extension._overlay.x + 340, h.extension._floatingButton.x - 12);
    assert.ok(h.extension._overlay.x + 340 <= 1920);
    assert.match(h.extension._overlay.style, /width: 340px/);
    assert.equal(h.extension._floatingButton.raisedAbove, h.extension._overlay);

    h.extension.disable();
});

test('top bar opens the expandable dashboard and switching anchors replaces it with compact controls', () => {
    const h = harness();
    h.extension._recordButton.events.clicked();

    const expandedPanel = h.extension._overlay;
    assert.equal(h.extension._overlayVariant, 'expanded');
    assert.match(expandedPanel.style, /width: 720px/);
    assert.equal(h.extension._panelHeading.text, 'Inicio');
    assert.ok(h.extension._panelNavigationButtons.home);
    assert.ok(h.extension._panelNavigationButtons.dictation);
    assert.ok(h.extension._panelNavigationButtons.copilot);
    assert.equal(h.extension._homeClockBox.visible, true);
    assert.match(h.extension._homeTimeLabel.text, /^\d{2}:\d{2}$/);
    assert.equal(h.extension._homeCopilotSummary.text, 'Sin sesiones abiertas');
    assert.equal(h.extension._homeCopilotBox.visible, true);
    assert.doesNotMatch(h.extension._activeSessionsBox.style, /background-color:/);
    assert.match(h.extension._actionIcon.style, /color: #f3e6cf/);

    h.extension._panelNavigationButtons.copilot.button.events.clicked();
    assert.equal(h.extension._panelHeading.text, 'Copilot');
    assert.equal(h.extension._homeClockBox.visible, false);
    assert.equal(h.extension._activeSessionsBox.visible, true);
    assert.equal(h.extension._activeSessionsEmptyState.visible, true);
    assert.match(h.extension._panelNavigationButtons.copilot.text.style, /color: #f3e6cf/);
    assert.match(h.extension._panelNavigationButtons.copilot.button.style,
        /background-color: rgba\(162,75,255,0\.2\)/);
    h.extension._panelNavigationButtons.dictation.button.events.clicked();
    assert.equal(h.extension._panelHeading.text, 'Dictado');
    assert.match(h.extension._panelNavigationButtons.dictation.text.style, /color: #f3e6cf/);

    h.extension._floatingButton.events.clicked();
    const compactPanel = h.extension._overlay;
    assert.notEqual(compactPanel, expandedPanel);
    assert.equal(expandedPanel.destroyed, true);
    assert.equal(h.extension._overlayVariant, 'compact');
    assert.equal(h.extension._activeSessionsBox, null);
    assert.equal(h.chromeActors.size, 2);

    h.extension._recordButton.events.clicked();
    assert.equal(compactPanel.destroyed, true);
    assert.equal(h.extension._overlayVariant, 'expanded');
    assert.equal(h.chromeActors.size, 2);
    h.extension.disable();
});

test('Home displays Copilot quota usage and marks the SDK resetDate unconfirmed', () => {
    const h = harness(new Map([
        ['/home/test/.local/share/voice-to-terminal/copilot-quota/node-path', '/opt/node/bin/node'],
        ['/home/test/.local/share/voice-to-terminal/copilot-quota/copilot-cli-path', '/opt/copilot'],
    ]));
    h.extension._recordButton.events.clicked();
    assert.equal(h.quotaCalls.length, 1);
    assert.equal(h.quotaCalls[0][0], '/opt/node/bin/node');
    assert.equal(h.quotaCalls[0][1],
        '/home/test/.local/share/voice-to-terminal/copilot-quota/read-quota.mjs');
    assert.equal(h.calls.length, 1);

    h.finishQuota(true, JSON.stringify({
        fetchedAt: '2026-11-26T14:17:18.288Z',
        quotaSnapshots: {
            premium_interactions: {
                usedRequests: 9840,
                entitlementRequests: 15000,
                remainingPercentage: 34.4,
                resetDate: '2026-11-26T14:16:11.508Z',
            },
        },
    }));

    assert.match(h.extension._homeCopilotQuotaSummary.text,
        /9\.840 \/ 15\.000 usados · 5\.160 restantes/);
    assert.match(h.extension._homeCopilotQuotaDetail.text, /34,4% disponibles/);
    assert.match(h.extension._homeCopilotQuotaDetail.text, /resetDate del SDK \(no confirmado\)/);
    assert.match(h.extension._homeCopilotQuotaDetail.text, /consulta/);
    assert.equal(h.extension._copilotQuotaTimeoutTimer, 0);
    h.extension.disable();
});

test('Home reports when the Copilot quota request fails', () => {
    const h = harness();
    h.extension._recordButton.events.clicked();
    h.finishQuota(false);

    assert.equal(h.extension._homeCopilotQuotaSummary.text, 'Cuota de Copilot no disponible');
    assert.match(h.extension._homeCopilotQuotaDetail.text, /Revisá la conexión/);
    h.extension.disable();
});

test('Home reports when the Copilot quota request times out', () => {
    const h = harness();
    h.extension._recordButton.events.clicked();
    expireQuotaRequest(h);

    assert.equal(h.extension._copilotQuotaInFlight, false);
    assert.equal(h.extension._copilotQuotaProcess, null);
    assert.equal(h.extension._homeCopilotQuotaSummary.text, 'Cuota de Copilot no disponible');
    assert.match(h.extension._homeCopilotQuotaDetail.text, /superó el límite de tiempo/);
    h.extension.disable();
});

test('Home keeps the last Copilot quota and marks it stale after a timeout', () => {
    const h = harness();
    h.extension._recordButton.events.clicked();
    h.finishQuota(true, JSON.stringify({
        fetchedAt: '2026-11-26T14:17:18.288Z',
        quotaSnapshots: {
            premium_interactions: {
                usedRequests: 9840,
                entitlementRequests: 15000,
                remainingPercentage: 34.4,
            },
        },
    }));

    h.extension._copilotQuotaLastRequestedAt = 0;
    h.extension._refreshCopilotQuota();
    const timedOutProcess = h.extension._copilotQuotaProcess;
    expireQuotaRequest(h);

    assert.equal(timedOutProcess.killed, true);
    assert.equal(h.extension._copilotQuotaInFlight, false);
    assert.match(h.extension._homeCopilotQuotaSummary.text,
        /9\.840 \/ 15\.000 usados · 5\.160 restantes/);
    assert.match(h.extension._homeCopilotQuotaDetail.text, /Dato desactualizado/);
    assert.match(h.extension._homeCopilotQuotaDetail.text, /consulta/);

    h.finishQuota(false);
    assert.match(h.extension._homeCopilotQuotaDetail.text, /Dato desactualizado/);
    h.extension.disable();
});

test('Home opens by default and summarizes Airi and Copilot attention', () => {
    const h = harness();
    const now = Date.now() / 1000;
    h.extension._copilotStatusBySession.set('session-a', {
        sessionId: 'session-a',
        status: 'attention',
        sessionName: 'Session A',
        project: 'project-a',
        createdAt: now,
        updatedAt: now,
    });

    h.extension._recordButton.events.clicked();
    assert.equal(h.extension._activePanelView, 'home');
    assert.equal(h.extension._panelHeading.text, 'Inicio');
    assert.equal(h.extension._homeOverviewRow.vertical, true);
    assert.ok(h.extension._homeOverviewRow.children.includes(h.extension._homeClockBox));
    assert.ok(h.extension._homeOverviewRow.children.includes(h.extension._homeCopilotBox));
    assert.match(h.extension._homeTimeLabel.text, /^\d{2}:\d{2}$/);
    assert.ok(h.extension._homeDateLabel.text.length > 0);
    assert.equal(h.extension._homeCopilotSummary.text, '1 sesión necesita respuesta');
    assert.equal(h.extension._homeCopilotDetail.text, 'Session A');
    assert.equal(h.extension._panelNavigationButtons.copilot.badge.text, '1');
    assert.equal(h.extension._panelNavigationButtons.copilot.badge.visible, true);
    assert.equal(h.extension._activeSessionsBox.visible, false);
    const clockTimerId = h.extension._homeClockTimer;
    assert.ok(clockTimerId);

    h.extension._homeCopilotButton.events.clicked();
    assert.equal(h.extension._panelHeading.text, 'Copilot');
    assert.equal(h.extension._activeSessionsBox.visible, true);
    assert.equal(h.extension._homeClockTimer, 0);
    assert.equal(h.timers.has(clockTimerId), false);

    h.extension.disable();
});

test('Copilot dashboard ambience moves only while its view is visible', () => {
    const h = harness();
    h.extension._recordButton.events.clicked();

    assert.ok(h.extension._copilotAmbienceLayer);
    assert.equal(h.extension._copilotAmbienceTimer, 0);
    assert.equal(h.extension._copilotAmbienceNodes.length, 6);

    h.extension._panelNavigationButtons.copilot.button.events.clicked();
    const timerId = h.extension._copilotAmbienceTimer;
    assert.ok(timerId);
    assert.equal(h.extension._activeSessionsBox.visible, true);
    const movingGlyph = h.extension._copilotAmbienceNodes[2].actor;
    const initialPose = [movingGlyph.x, movingGlyph.y, movingGlyph.opacity];
    const tick = h.timers.get(timerId);
    for (let frame = 0; frame < 40; frame++)
        assert.equal(tick(), true);
    assert.notDeepEqual([movingGlyph.x, movingGlyph.y, movingGlyph.opacity], initialPose);

    h.extension._panelNavigationButtons.dictation.button.events.clicked();
    assert.equal(h.extension._copilotAmbienceTimer, 0);
    assert.equal(h.timers.has(timerId), false);

    h.extension._panelNavigationButtons.copilot.button.events.clicked();
    const reopenedTimerId = h.extension._copilotAmbienceTimer;
    assert.ok(reopenedTimerId);
    h.extension._hideOverlay();
    assert.equal(h.extension._copilotAmbienceTimer, 0);
    assert.equal(h.timers.has(reopenedTimerId), false);
    h.extension.disable();
});

test('compact panel summarizes Copilot activity without showing the full session list', () => {
    const h = harness();
    h.extension._applyCopilotEvent({
        sessionId: 'session-a',
        status: 'working',
        title: 'Copilot trabajando',
        message: '',
        project: 'voice-to-terminal',
        sessionName: 'Airi design',
        taskSummary: '',
        createdAt: Date.now() / 1000,
    });

    h.extension._showControls(h.extension._floatingButton);
    assert.equal(h.extension._overlayVariant, 'compact');
    assert.equal(h.extension._overlayLabel.text, 'Copilot trabajando');
    assert.equal(h.extension._compactSessionSummary.text, '1 sesión abierta de Copilot');
    assert.equal(h.extension._compactSessionSummary.visible, true);
    assert.equal(h.extension._activeSessionsBox, null);
    h.extension.disable();
});

test('expanded panel width stays within the available monitor space', () => {
    const h = harness();
    h.main.layoutManager.primaryMonitor.width = 500;
    h.extension._recordButton.set_position(450, 0);
    h.extension._recordButton.events.clicked();

    assert.match(h.extension._overlay.style, /width: 484px/);
    assert.equal(h.extension._overlay.width, 484);
    assert.equal(h.extension._overlay.x, 8);
    assert.ok(h.extension._overlay.x + h.extension._overlay.width <= 492);
    assert.equal(h.extension._homeOverviewRow.vertical, true);
    h.extension.disable();
});

test('expanded notch panel is centered on screen independently of its icon anchor', () => {
    const h = harness();
    h.extension._recordButton.set_position(1600, 0);
    h.extension._recordButton.events.clicked();

    assert.equal(h.extension._overlay.x, 600);
    assert.equal(h.extension._overlay.y, 40);
    h.extension.disable();
});

test('robot keeps code-drawn eyes and switches poses through dictation states', () => {
    const h = harness();
    h.extension._showOverlay(h.extension._recordButton);
    const assertMood = mood => {
        const path = h.extension._robotMoodPaths[mood];
        assert.equal(h.extension._indicatorIcon.gicon.file.path, path);
        assert.equal(h.extension._floatingRobotIcon.gicon.file.path,
            h.extension._robotPosePaths.threeQuarter);
    };
    assertMood('idle');

    const blinkId = h.extension._floatingBlinkTimer;
    const blink = h.timers.get(blinkId);
    h.timers.delete(blinkId);
    assert.equal(blink(), false);
    assert.equal(h.extension._floatingEyes[0].scale_y, 0.12);
    assert.equal(h.extension._floatingRobotIcon.icon_size, 112);

    h.extension._toggleRecording();
    assertMood('processing');
    assert.equal(h.extension._floatingBlinkTimer, 0);
    assert.equal(h.extension._floatingBlinkRestoreTimer, 0);
    h.finish();
    assertMood('listening');
    assert.equal(h.extension._floatingRobotCanvas.scale_x, 1);
    assert.equal(h.extension._floatingRobotCanvas.scale_y, 1);

    h.extension._toggleRecording();
    assertMood('processing');
    h.finish();
    assertMood('success');
    h.extension.disable();
});

test('floating eyes glow and follow the three-quarter screen perspective', () => {
    const h = harness();
    const [nearEye, farEye] = h.extension._floatingEyes;

    assert.match(nearEye.style, /border: 1px solid/);
    assert.match(nearEye.style, /box-shadow: 0 0 8px.*inset 0 0 2px rgba\(243,230,207,0\.4\)/);
    h.extension._setFloatingPose('threeQuarter', false);

    assert.equal(nearEye.rotation_angle_z, -12);
    assert.equal(farEye.rotation_angle_z, -12);
    assert.equal(farEye.y, nearEye.y - 3);
    assert.equal(farEye.scale_x, 0.7);
    h.extension.disable();
});

test('floating gaze follows nearby pointer and keeps expression props aligned', () => {
    const h = harness();
    const robot = h.extension;
    robot._copilotStatusBySession.set('session-a', {
        sessionId: 'session-a',
        status: 'working',
        createdAt: Date.now() / 1000,
    });
    robot._updateFloatingRobot();

    assert.ok(robot._floatingGlasses.every(frame => frame.visible));
    assert.match(robot._floatingGlasses[0].style, /#a24bff/);
    const motion = [...h.stageSignals.values()]
        .find(signal => signal.name === 'motion-event').callback;
    const [robotX, robotY] = robot._floatingButton.get_transformed_position();
    motion(null, {
        get_coords: () => [robotX + 56 + 90, robotY + 56],
    });

    assert.equal(robot._floatingGazeOffset.x, 1.25);
    assert.equal(robot._floatingEyes[0].x, robot._floatingEyeLayout[0].x + 1.25);
    assert.equal(robot._floatingGlasses[0].x, robot._floatingEyeLayout[0].x - 2 + 1.25);
    assert.equal(robot._floatingGlassesBridge.x, 51 + 1.25);

    motion(null, {
        get_coords: () => [robotX + 56 + 181, robotY + 56],
    });
    assert.equal(robot._floatingGazeOffset.x, 0);
    assert.equal(robot._floatingGazeOffset.y, 0);
    assert.equal(robot._floatingGlasses[0].x, robot._floatingEyeLayout[0].x - 2);

    robot.disable();
    assert.equal(h.stageSignals.size, 0);
});

test('floating robot reacts to hover and panel interactions without changing its pose', () => {
    const h = harness();
    const robot = h.extension;
    const idleYawnId = robot._floatingYawnTimer;
    robot._floatingButton.events['enter-event']();
    assert.equal(robot._floatingExpression, 'guino');
    assert.equal(robot._floatingYawnTimer, 0);
    assert.equal(h.timers.has(idleYawnId), false);
    const hintId = robot._floatingHintTimer;
    const showHint = h.timers.get(hintId);
    h.timers.delete(hintId);
    assert.equal(showHint(), false);
    assert.equal(robot._floatingHint.visible, true);
    assert.equal(h.chromeActors.has(robot._floatingHint), true);
    assert.deepEqual([robot._floatingHint.x, robot._floatingHint.y], [134, 87]);
    assert.equal(robot._floatingPose, 'front');

    const hoverId = robot._floatingHoverTimer;
    const hover = h.timers.get(hoverId);
    h.timers.delete(hoverId);
    assert.equal(hover(), false);
    assert.equal(robot._floatingExpression, 'enamorado');
    assert.equal(robot._floatingEyeGlyphs[0].text, '♥');
    assert.equal(robot._floatingEyeGlyphs[1].text, '♥');

    robot._floatingButton.events['leave-event']();
    assert.equal(robot._floatingExpression, 'contento');
    assert.equal(robot._floatingHint.visible, false);
    assert.equal(h.chromeActors.has(robot._floatingHint), false);
    robot._showControls(robot._floatingButton);
    assert.equal(robot._floatingExpression, 'saludo');

    const greetingId = robot._floatingReactionTimer;
    const greeting = h.timers.get(greetingId);
    h.timers.delete(greetingId);
    assert.equal(greeting(), false);
    assert.equal(robot._floatingExpression, 'contento');
    robot.disable();
});

test('floating robot uses expressive faces for dictation and Copilot states', () => {
    const h = harness();
    const robot = h.extension;
    const setCopilotStatus = status => {
        robot._copilotStatusBySession.clear();
        if (status !== 'idle') {
            robot._copilotStatusBySession.set('session-a', {
                sessionId: 'session-a',
                status,
                createdAt: Date.now() / 1000,
            });
        }
        robot._updateFloatingRobot();
    };

    setCopilotStatus('working');
    assert.equal(robot._floatingExpression, 'animo');
    assert.ok(robot._floatingGlasses.every(frame => frame.visible));
    setCopilotStatus('attention');
    assert.equal(robot._floatingExpression, 'sorpresa');
    setCopilotStatus('error');
    assert.equal(robot._floatingExpression, 'molesto');

    robot._copilotStatusBySession.clear();
    robot._phase = 'recording';
    robot._updateFloatingRobot();
    assert.equal(robot._floatingExpression, 'escucha');
    robot._phase = 'stopping';
    robot._updateFloatingRobot();
    assert.equal(robot._floatingExpression, 'mareado');
    assert.equal(robot._floatingEyeGlyphs[0].text, '◎');
    assert.equal(robot._floatingEyeGlyphs[1].text, '◎');
    robot._phase = 'complete';
    robot._updateFloatingRobot();
    assert.equal(robot._floatingExpression, 'orgulloso');

    robot._phase = 'idle';
    robot._applyCopilotEvent({
        sessionId: 'session-a',
        status: 'ready',
        title: 'Copilot listo',
        message: 'Tarea completada',
        project: 'voice-to-terminal',
        createdAt: Date.now() / 1000,
    });
    assert.equal(robot._floatingExpression, 'festejo');
    assert.ok(robot._floatingCheeks.every(cheek => cheek.visible));
    assert.match(robot._floatingCheeks[0].style, /background-color: #0f766e/);
    robot.disable();
});

test('floating robot squashes and stretches on Copilot state transitions', () => {
    const h = harness();
    const robot = h.extension;
    const canvas = robot._floatingRobotCanvas;
    assert.deepEqual(canvas.pivotPoint, [0.5, 0.5]);
    const setStatus = status => {
        robot._copilotStatusBySession.clear();
        robot._copilotStatusBySession.set('session-a', {
            sessionId: 'session-a',
            status,
            createdAt: Date.now() / 1000,
        });
        robot._updateFloatingRobot();
    };

    let start = canvas.easeCalls.length;
    setStatus('working');
    assert.deepEqual(
        canvas.easeCalls.slice(start).map(({ scale_x, scale_y, duration }) =>
            [scale_x, scale_y, duration]),
        [[1.05, 0.94, 90], [0.96, 1.06, 110], [1, 1, 140]],
    );
    start = canvas.easeCalls.length;
    setStatus('ready');
    assert.deepEqual(
        canvas.easeCalls.slice(start).map(({ scale_x, scale_y, duration }) =>
            [scale_x, scale_y, duration]),
        [[1.05, 0.94, 90], [0.96, 1.1, 110], [1, 1, 140]],
    );
    robot.disable();
});

test('floating robot yawns once after three minutes of uninterrupted idle', () => {
    const h = harness();
    const robot = h.extension;
    const yawnId = robot._floatingYawnTimer;
    assert.ok(yawnId);
    assert.equal(h.timerDelays.get(yawnId), 180000);

    const yawn = h.timers.get(yawnId);
    h.timers.delete(yawnId);
    assert.equal(yawn(), false);
    assert.equal(robot._floatingExpression, 'bostezo');
    assert.equal(robot._floatingFaceAccents[1].text, 'z');

    const reactionId = robot._floatingReactionTimer;
    const finishYawn = h.timers.get(reactionId);
    h.timers.delete(reactionId);
    assert.equal(finishYawn(), false);
    assert.equal(robot._floatingExpression, 'contento');
    assert.ok(robot._floatingYawnTimer);
    robot.disable();
});

test('Copilot working keeps the face visible and attention shows open waiting eyes', () => {
    const files = new Map();
    const h = harness(files);
    const directory = '/run/user/1000/voice-to-terminal/copilot-notifications';
    const poll = h.timers.get(h.extension._copilotNotificationTimer);
    files.set(`${directory}/0001-working.json`, JSON.stringify({
        sessionId: 'session-a',
        status: 'working',
        title: 'Copilot trabajando',
        message: '',
        project: 'voice-to-terminal',
        sessionName: 'Integrate Notification Tool with Speech-to-Text',
        taskSummary: 'Refactorizando Auth Hook',
        createdAt: Date.now() / 1000,
    }));

    poll();

    assert.equal(h.extension._copilotNotification, null);
    assert.equal(h.extension._overlay, undefined);
    assert.equal(h.extension._robotMood, 'processing');
    assert.equal(h.extension._floatingSaccadeTimer, 0);
    assert.equal(h.extension._floatingButton.accessible_name,
        'Copilot trabajando: Integrate Notification Tool with Speech-to-Text');
    h.extension._showControls();
    h.extension._panelNavigationButtons.copilot.button.events.clicked();
    assert.equal(h.extension._statusRow.visible, false);
    assert.equal(h.extension._activeSessionsBox.visible, true);
    const rows = activeSessionRows(h.extension);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].children[0].children[0].text,
        'Integrate Notification Tool with Speech-to-Text');
    assert.equal(rows[0].children[0].children[1].text, 'Working');
    assert.match(rows[0].children[0].children[1].style,
        /color: #a24bff/);
    assert.match(rows[0].children[0].children[1].style,
        /padding: 2px 0/);
    assert.doesNotMatch(rows[0].children[0].children[1].style, /background-color:/);
    assert.equal(rows[0].children[1].children[0].text, 'Actualizada ahora');
    assert.match(h.extension._sidebarStatusDot.style, /background-color: #a24bff/);
    assert.equal(h.extension._actionButton.child, h.extension._actionIcon);
    assert.equal(h.extension._floatingEyes[0].scale_y, 0.68);
    assert.equal(h.extension._floatingSaccadeTimer > 0, true);
    assert.equal(h.sounds.length, 0);
    assert.equal(h.extension._floatingRobotIcon.gicon.file.path,
        h.extension._robotPosePaths.threeQuarter);
    assert.equal(h.extension._indicatorIcon.gicon.file.path,
        h.extension._robotMoodPaths.processing);
    assert.equal(h.extension._floatingRobotCanvas.scale_x ?? 1, 1);
    assert.equal(h.extension._floatingRobotCanvas.scale_y ?? 1, 1);
    assert.equal(h.extension._indicatorIcon.scale_x ?? 1, 1);
    assert.equal(h.extension._indicatorIcon.scale_y ?? 1, 1);
    const initialWidth = h.extension._overlay.width;
    h.extension._overlay.preferredWidth = initialWidth + 80;
    h.extension._updateOverlay();
    assert.equal(h.extension._overlay.width, initialWidth + 80);
    assert.equal(h.extension._overlay.easeCalls.at(-1).mode, 3);
    assert.equal(h.extension._overlay.easeCalls.at(-1).duration, 380);

    const saccade = h.timers.get(h.extension._floatingSaccadeTimer);
    assert.equal(saccade(), true);
    assert.equal(h.extension._floatingEyes[0].x,
        h.extension._floatingEyeLayout[0].x + 2);
    const restoreSaccade = h.timers.get(h.extension._floatingSaccadeRestoreTimer);
    assert.equal(restoreSaccade(), false);
    assert.equal(h.extension._floatingEyes[0].x, h.extension._floatingEyeLayout[0].x);
    assert.equal(saccade(), true);
    assert.equal(h.extension._floatingEyes[0].x,
        h.extension._floatingEyeLayout[0].x - 2);
    assert.deepEqual(
        fs.readFileSync(new URL('../gnome-shell-extension/robot-processing.png', import.meta.url)),
        fs.readFileSync(new URL('../gnome-shell-extension/robot-idle-open.png', import.meta.url)),
    );

    files.set(`${directory}/0002-attention.json`, JSON.stringify({
        sessionId: 'session-a',
        status: 'attention',
        title: 'Copilot necesita permiso',
        message: 'Revisá la solicitud en la terminal para continuar.',
        project: 'voice-to-terminal',
        sessionName: 'Integrate Notification Tool with Speech-to-Text',
        createdAt: Date.now() / 1000,
    }));
    poll();

    assert.equal(h.extension._overlayLabel.text, 'Copilot necesita permiso');
    assert.equal(h.extension._overlayVariant, 'compact');
    assert.equal(h.extension._activeSessionsBox, null);
    assert.equal(h.extension._caption.text,
        'Revisá la solicitud en la terminal para continuar.');
    assert.match(h.extension._overlayLabel.style, /#f97316/);
    assert.equal(h.extension._robotMood, 'attention');
    assert.equal(h.extension._floatingEyes[0].scale_y, 1);
    assert.equal(h.extension._floatingRobotIcon.gicon.file.path,
        h.extension._robotPosePaths.threeQuarter);
    assert.equal(h.sounds.length, 1);
    assert.ok(h.extension._copilotDismissTimer);
    assert.equal(h.extension._floatingRobotCanvas.scale_x ?? 1, 1);

    files.set(`${directory}/0003-other-working.json`, JSON.stringify({
        sessionId: 'session-b',
        status: 'working',
        title: 'Copilot trabajando',
        message: '',
        project: 'another-project',
        createdAt: Date.now() / 1000,
    }));
    poll();

    assert.equal(h.extension._copilotNotification.sessionId, 'session-a');
    assert.equal(h.extension._overlayLabel.text, 'Copilot necesita permiso');
    assert.equal(h.extension._copilotStatusBySession.get('session-a').status, 'attention');
    assert.equal(h.extension._copilotStatusBySession.get('session-b').status, 'working');
    assert.equal(h.extension._floatingRobotCanvas.scale_x ?? 1, 1);

    files.set(`${directory}/0004-other-ready.json`, JSON.stringify({
        sessionId: 'session-b',
        status: 'ready',
        title: 'Copilot listo',
        message: '¡Listo! Revisá la sesión de another-project.',
        project: 'another-project',
        createdAt: Date.now() / 1000,
    }));
    poll();

    assert.equal(h.extension._copilotNotification.sessionId, 'session-a');
    assert.equal(h.extension._overlayLabel.text, 'Copilot necesita permiso');

    files.set(`${directory}/0005-working.json`, JSON.stringify({
        sessionId: 'session-a',
        status: 'working',
        title: 'Copilot trabajando',
        message: '',
        project: 'voice-to-terminal',
        createdAt: Date.now() / 1000,
    }));
    poll();

    assert.equal(h.extension._copilotNotification.sessionId, 'session-b');
    assert.equal(h.extension._overlayLabel.text, 'Copilot listo');
    assert.match(h.extension._caption.text, /another-project/);
    assert.equal(h.extension._robotMood, 'processing');
    assert.equal(h.extension._copilotStatusBySession.get('session-a').status, 'working');
    assert.equal(h.extension._copilotStatusBySession.get('session-b').status, 'ready');
    assert.equal(h.extension._floatingRobotCanvas.scale_x, 1);
    assert.equal(h.sounds.length, 1);

    files.set(`${directory}/0006-idle.json`, JSON.stringify({
        sessionId: 'session-a',
        status: 'idle',
        title: 'Copilot inactivo',
        message: '',
        project: 'voice-to-terminal',
        createdAt: Date.now() / 1000,
    }));
    poll();

    assert.equal(h.extension._robotMood, 'success');
    assert.equal(h.extension._floatingButton.accessible_name, 'Copilot terminó; mostrar mensaje listo');
    assert.equal(h.extension._copilotNotification.sessionId, 'session-b');
    h.extension.disable();
});

test('active session without a title uses a neutral placeholder instead of its project', () => {
    const files = new Map();
    const h = harness(files);
    const directory = '/run/user/1000/voice-to-terminal/copilot-notifications';
    const poll = h.timers.get(h.extension._copilotNotificationTimer);
    files.set(`${directory}/0001-working.json`, JSON.stringify({
        sessionId: 'session-a',
        status: 'working',
        title: 'Copilot trabajando',
        message: '',
        project: 'voice-to-terminal',
        createdAt: Date.now() / 1000,
    }));

    poll();
    h.extension._showControls();
    h.extension._panelNavigationButtons.copilot.button.events.clicked();

    const row = activeSessionRows(h.extension)[0];
    assert.equal(h.extension._activeSessionsBox.visible, true);
    assert.equal(row.children[0].children[0].text, 'Sesión sin título');
    assert.equal(row.children[0].children[1].text, 'Working');
    assert.doesNotMatch(row.children[0].children[0].text, /voice-to-terminal/);
});

test('restores active sessions from runtime state and reconciles removals', () => {
    const files = new Map();
    const h = harness(files);
    const runtimeDirectory = '/run/user/1000/voice-to-terminal';
    const statePath = `${runtimeDirectory}/active-sessions.json`;
    const poll = h.timers.get(h.extension._copilotNotificationTimer);
    const now = Date.now() / 1000;
    h.extension._showControls();
    h.extension._panelNavigationButtons.copilot.button.events.clicked();

    files.set(statePath, JSON.stringify({
        sessions: [
            {
                sessionId: 'session-a',
                status: 'working',
                sessionName: 'Session A',
                createdAt: now - 1,
            },
            {
                sessionId: 'session-b',
                status: 'attention',
                sessionName: 'Session B',
                createdAt: now,
            },
            {
                sessionId: 'session-c',
                status: 'idle',
                sessionName: 'Session C',
                createdAt: now - 4,
            },
            {
                sessionId: 'session-d',
                status: 'ready',
                sessionName: 'Session D',
                createdAt: now - 3,
            },
            {
                sessionId: 'session-e',
                status: 'error',
                sessionName: 'Session E',
                createdAt: now - 2,
            },
        ],
    }));

    poll();

    assert.equal(h.extension._activeSessionsBox.visible, true);
    assert.deepEqual(
        activeSessionRows(h.extension).map(row => row.children[0].children[1].text),
        ['Necesita respuesta', 'Working', 'Error', 'Lista', 'En espera'],
    );
    assert.deepEqual(
        activeSessionRows(h.extension).map(row => row.children[0].children[0].text),
        ['Session B', 'Session A', 'Session E', 'Session D', 'Session C'],
    );
    assert.equal(h.extension._panelSubtitle.text,
        '1 necesita respuesta · 5 sesiones abiertas');
    assert.equal(h.extension._copilotNotification, null);
    assert.equal(h.sounds.length, 0);

    files.set(statePath, JSON.stringify({
        sessions: [{
            sessionId: 'session-b',
            status: 'attention',
            sessionName: 'Session B',
            createdAt: Date.now() / 1000,
        }],
    }));
    poll();
    assert.deepEqual(
        activeSessionRows(h.extension).map(row => row.children[0].children[0].text),
        ['Session B'],
    );

    files.set(statePath, JSON.stringify({ sessions: [] }));
    poll();
    assert.equal(h.extension._activeSessionsBox.visible, true);
    assert.equal(h.extension._activeSessionsEmptyState.visible, true);
    assert.equal(h.extension._statusRow.visible, false);
    assert.equal(h.extension._copilotStatusBySession.size, 0);
    h.extension.disable();
});

test('Copilot sessions are grouped by project and show relative activity and attention count', () => {
    const files = new Map();
    const h = harness(files);
    const now = Date.now() / 1000;
    const statePath = '/run/user/1000/voice-to-terminal/active-sessions.json';
    const poll = h.timers.get(h.extension._copilotNotificationTimer);
    h.extension._showControls();
    h.extension._panelNavigationButtons.copilot.button.events.clicked();
    files.set(statePath, JSON.stringify({
        sessions: [
            {
                sessionId: 'session-a',
                status: 'working',
                sessionName: 'Session A',
                project: 'project-a',
                createdAt: now - 300,
                updatedAt: now - 125,
            },
            {
                sessionId: 'session-b',
                status: 'attention',
                sessionName: 'Session B',
                project: 'project-b',
                createdAt: now - 300,
                updatedAt: now - 90,
            },
            {
                sessionId: 'session-c',
                status: 'working',
                sessionName: 'Session C',
                project: 'project-a',
                createdAt: now - 300,
                updatedAt: now - 15,
            },
        ],
    }));

    poll();

    const headings = h.extension._activeSessionsList.children
        .filter(child => child.children.length === 0);
    const rows = activeSessionRows(h.extension);
    assert.match(h.extension._activeSessionsBox.style, /min-height: 180px/);
    assert.equal(h.extension._activeSessionsScroll.y_expand, true);
    assert.deepEqual(h.extension._activeSessionsScroll.policy, [0, 0]);
    assert.deepEqual(headings.map(heading => heading.text), [
        'project-b',
        'project-a · 2 sesiones',
    ]);
    assert.match(headings[0].style, /border-left: 2px solid #550c68/);
    assert.match(headings[0].style, /color: #a24bff/);
    assert.doesNotMatch(headings[0].style, /background-color:/);
    assert.deepEqual(rows.map(row => row.children[0].children[0].text), [
        'Session B',
        'Session C',
        'Session A',
    ]);
    assert.match(rows[1].children[0].children[1].style, /color: #a24bff/);
    assert.doesNotMatch(rows[1].children[0].children[1].style, /background-color:/);
    assert.deepEqual(rows.map(row => row.children[1].children[0].text), [
        'Actualizada hace 1 min',
        'Actualizada ahora',
        'Actualizada hace 2 min',
    ]);
    const activityLabels = [...h.extension._copilotActivityLabels.keys()];
    const labelTimeframes = [151, 76, 186];
    const refreshNow = Date.now() / 1000;
    activityLabels.forEach((label, index) => {
        h.extension._copilotActivityLabels.set(label, refreshNow - labelTimeframes[index]);
    });
    h.extension._refreshCopilotActivityLabels();
    assert.deepEqual(rows.map(row => row.children[1].children[0].text), [
        'Actualizada hace 2 min',
        'Actualizada hace 1 min',
        'Actualizada hace 3 min',
    ]);
    assert.equal(h.extension._panelSubtitle.text,
        '1 necesita respuesta · 3 sesiones abiertas');
    assert.equal(h.extension._panelNavigationButtons.copilot.badge.text, '1');
    assert.equal(h.extension._panelNavigationButtons.copilot.badge.visible, true);
    h.extension.disable();
});

test('Copilot sessions remain visible while a notification is shown', () => {
    const files = new Map();
    const h = harness(files);
    const now = Date.now() / 1000;
    const statePath = '/run/user/1000/voice-to-terminal/active-sessions.json';
    const poll = h.timers.get(h.extension._copilotNotificationTimer);
    h.extension._showControls();
    h.extension._panelNavigationButtons.copilot.button.events.clicked();
    files.set(statePath, JSON.stringify({
        sessions: [{
            sessionId: 'session-a',
            status: 'ready',
            sessionName: 'Session A',
            project: 'project-a',
            createdAt: now - 60,
            updatedAt: now,
        }],
    }));
    poll();

    h.extension._copilotNotification = {
        status: 'ready',
        title: 'Copilot listo',
        message: 'La sesión terminó.',
        sessionName: 'Session A',
        project: 'project-a',
    };
    h.extension._updateOverlay();

    assert.equal(h.extension._activeSessionsBox.visible, true);
    assert.equal(h.extension._sessionTitle.visible, true);
    assert.match(h.extension._sessionTitle.text, /Session A/);
    assert.deepEqual(
        activeSessionRows(h.extension).map(row => row.children[0].children[0].text),
        ['Session A'],
    );
    h.extension.disable();
});

test('attention inbox snoozes for five minutes and sends one reminder', () => {
    const files = new Map();
    const h = harness(files);
    const now = Date.now() / 1000;
    h.extension._copilotStatusBySession.set('session-a', {
        sessionId: 'session-a',
        status: 'attention',
        title: 'Copilot necesita una respuesta',
        message: 'Respondé en la terminal para continuar.',
        project: 'project-a',
        sessionName: 'Session A',
        taskSummary: '',
        createdAt: now - 30,
        updatedAt: now,
    });
    h.extension._showControls();

    const row = activeSessionRows(h.extension)[0];
    const snoozeButton = row.children[1].children[1];
    assert.equal(snoozeButton.accessible_name, 'Posponer 5 minutos la sesión Session A');
    snoozeButton.events.clicked();

    const firstRemindAt = h.extension._copilotAttentionReminders.get('session-a');
    const firstReminderTimer = h.extension._copilotAttentionReminderTimers.get('session-a');
    const updatedRow = activeSessionRows(h.extension)[0];
    const snoozeAgainButton = updatedRow.children[1].children.at(-1);
    snoozeAgainButton.events.clicked();

    const remindAt = h.extension._copilotAttentionReminders.get('session-a');
    const reminderTimer = h.extension._copilotAttentionReminderTimers.get('session-a');
    const reminderPath = '/run/user/1000/voice-to-terminal/attention-reminders.json';
    assert.ok(remindAt > firstRemindAt);
    assert.equal(h.timers.has(firstReminderTimer), false);
    assert.notEqual(reminderTimer, firstReminderTimer);
    assert.ok(h.timerDelays.get(reminderTimer) >= 5 * 60 * 1000 - 1);
    assert.ok(h.timerDelays.get(reminderTimer) <= 5 * 60 * 1000);
    assert.ok(remindAt >= now + 300 && remindAt <= now + 301);
    assert.equal(JSON.parse(files.get(reminderPath)).reminders['session-a'], remindAt);

    const fireReminder = h.timers.get(reminderTimer);
    h.timers.delete(reminderTimer);
    assert.equal(fireReminder(), false);
    assert.equal(h.extension._copilotAttentionReminders.has('session-a'), false);
    assert.equal(h.extension._copilotNotification.title,
        'Copilot sigue esperando respuesta');
    assert.equal(h.extension._copilotNotification.message,
        'La sesión sigue esperando una respuesta en la terminal.');
    assert.deepEqual(JSON.parse(files.get(reminderPath)).reminders, {});
    assert.equal(h.extension._copilotAttentionReminderTimers.size, 0);
    h.extension.disable();
});

test('attention reminder is canceled when its session resumes', () => {
    const h = harness(new Map());
    const now = Date.now() / 1000;
    h.extension._copilotStatusBySession.set('session-a', {
        sessionId: 'session-a',
        status: 'attention',
        title: 'Copilot necesita una respuesta',
        message: 'Respondé en la terminal para continuar.',
        project: 'project-a',
        sessionName: 'Session A',
        taskSummary: '',
        createdAt: now - 30,
        updatedAt: now,
    });
    h.extension._snoozeCopilotAttention('session-a');
    const timer = h.extension._copilotAttentionReminderTimers.get('session-a');

    h.extension._applyCopilotEvent({
        sessionId: 'session-a',
        status: 'working',
        title: 'Copilot trabajando',
        message: '',
        project: 'project-a',
        sessionName: 'Session A',
        createdAt: now + 1,
    });

    assert.equal(h.extension._copilotAttentionReminders.has('session-a'), false);
    assert.equal(h.extension._copilotAttentionReminderTimers.has('session-a'), false);
    assert.equal(h.timers.has(timer), false);
    assert.equal(h.extension._copilotNotification?.title, undefined);
    h.extension.disable();
});

test('restores a snoozed reminder and removes it when the session ends', () => {
    const now = Date.now() / 1000;
    const statePath = '/run/user/1000/voice-to-terminal/active-sessions.json';
    const reminderPath = '/run/user/1000/voice-to-terminal/attention-reminders.json';
    const files = new Map([
        [statePath, JSON.stringify({
            sessions: [{
                sessionId: 'session-a',
                status: 'attention',
                sessionName: 'Session A',
                project: 'project-a',
                createdAt: now - 60,
                updatedAt: now,
            }],
        })],
        [reminderPath, JSON.stringify({
            reminders: { 'session-a': now + 60 },
        })],
    ]);
    const h = harness(files);
    h.extension._syncCopilotActiveSessions();

    const timer = h.extension._copilotAttentionReminderTimers.get('session-a');
    assert.ok(timer);
    assert.ok(h.timerDelays.get(timer) > 0);

    files.set(statePath, JSON.stringify({ sessions: [] }));
    h.extension._syncCopilotActiveSessions();

    assert.equal(h.extension._copilotAttentionReminders.has('session-a'), false);
    assert.equal(h.extension._copilotAttentionReminderTimers.has('session-a'), false);
    assert.equal(h.timers.has(timer), false);
    assert.deepEqual(JSON.parse(files.get(reminderPath)).reminders, {});
    h.extension.disable();
});

test('dictation states hop sideways with short ease-out motion only', () => {
    const h = harness();
    const robot = h.extension._floatingRobotCanvas;
    const transitions = [];
    robot.ease = options => {
        if ('translation_x' in options) {
            transitions.push(options);
            robot.translation_x = options.translation_x;
        }
        options.onComplete?.();
    };

    h.extension._toggleRecording();
    h.finish();
    h.extension._actionButton.events.clicked();
    h.finish();

    assert.deepEqual(transitions.map(({ translation_x, duration, mode }) => [
        translation_x, duration, mode,
    ]), [
        [4, 60, 1], [-1, 45, 1], [0, 60, 1],
        [-4, 60, 1], [1, 45, 1], [0, 60, 1],
        [4, 60, 1], [-1, 45, 1], [0, 60, 1],
    ]);
    assert.ok(transitions.every(options => !('scale_x' in options)
        && !('scale_y' in options) && !('translation_y' in options)));
    assert.equal(robot.translation_x, 0);
    assert.equal(robot.translation_y, 0);
});

test('Copilot events use distinct left and right hop directions', () => {
    const h = harness();
    const directions = [];
    h.extension._animateRobotHop = direction => directions.push(direction);
    const event = (sessionId, status) => ({
        sessionId,
        status,
        title: `Copilot ${status}`,
        message: status === 'working' ? '' : `Evento ${status}`,
        project: 'voice-to-terminal',
        createdAt: Date.now() / 1000,
    });

    h.extension._applyCopilotEvent(event('session-a', 'working'));
    h.extension._applyCopilotEvent(event('session-a', 'attention'));
    h.extension._applyCopilotEvent(event('session-a', 'ready'));
    h.extension._applyCopilotEvent(event('session-a', 'error'));

    assert.deepEqual(directions, [-1, 1, 1, -1]);
    h.extension.disable();
});

test('open idle state stays listed and legacy idle events remove ended sessions', () => {
    const files = new Map();
    const h = harness(files);
    const statePath = '/run/user/1000/voice-to-terminal/active-sessions.json';
    const now = Date.now() / 1000;
    h.extension._showControls();
    h.extension._applyCopilotEvent({
        sessionId: 'session-a',
        status: 'working',
        title: 'Copilot trabajando',
        message: '',
        project: 'voice-to-terminal',
        createdAt: now,
    });

    assert.equal(h.extension._copilotStatusBySession.get('session-a').status, 'working');
    h.extension._applyCopilotEvent({
        sessionId: 'session-a',
        status: 'idle',
        title: 'Copilot inactivo',
        message: '',
        project: 'voice-to-terminal',
        createdAt: now + 1,
    });
    assert.equal(h.extension._copilotStatusBySession.has('session-a'), false);

    files.set(statePath, JSON.stringify({
        sessions: [{
            sessionId: 'session-a',
            status: 'idle',
            sessionName: 'Session A',
            createdAt: now,
        }],
    }));
    h.extension._syncCopilotActiveSessions();
    assert.equal(h.extension._copilotStatusBySession.get('session-a').status, 'idle');
    assert.equal(activeSessionRows(h.extension)[0].children[0].children[1].text, 'En espera');
    files.set(statePath, JSON.stringify({ sessions: [] }));
    h.extension._syncCopilotActiveSessions();

    assert.equal(h.extension._copilotStatusBySession.has('session-a'), false);
    assert.equal(h.extension._activeSessionsEmptyState.visible, true);
    h.extension.disable();
});

test('Copilot attention replaces a completion alert, then dismisses while its session stays active', () => {
    const files = new Map();
    const h = harness(files);
    const directory = '/run/user/1000/voice-to-terminal/copilot-notifications';
    const poll = h.timers.get(h.extension._copilotNotificationTimer);
    files.set(`${directory}/0001-ready.json`, JSON.stringify({
        sessionId: 'session-a',
        status: 'ready',
        title: 'Copilot listo',
        message: '¡Listo! Revisá la sesión de project-a.',
        project: 'project-a',
        createdAt: Date.now() / 1000,
    }));
    poll();

    const completionDismissId = h.extension._copilotDismissTimer;
    assert.ok(completionDismissId);

    files.set(`${directory}/0002-attention.json`, JSON.stringify({
        sessionId: 'session-b',
        status: 'attention',
        title: 'Copilot necesita una respuesta',
        message: 'Respondé en la terminal para continuar.',
        project: 'project-b',
        sessionName: 'Integrate Notification Tool with Speech-to-Text',
        createdAt: Date.now() / 1000,
    }));
    poll();

    assert.equal(h.extension._overlayLabel.text, 'Copilot necesita una respuesta');
    const attentionDismissId = h.extension._copilotDismissTimer;
    assert.ok(attentionDismissId);
    assert.notEqual(attentionDismissId, completionDismissId);
    assert.equal(h.timers.has(completionDismissId), false);
    assert.equal(h.extension._activeSessionsBox, null);
    assert.equal(h.extension._caption.text,
        'Respondé en la terminal para continuar.');
    const dismiss = h.timers.get(attentionDismissId);
    h.timers.delete(attentionDismissId);
    assert.equal(dismiss(), false);
    assert.equal(h.extension._overlay, null);
    assert.equal(h.extension._copilotNotification, null);
    assert.equal(h.extension._copilotStatusBySession.get('session-b').status, 'attention');
    h.extension.disable();
});

test('dismissing an attention popup leaves its active session and dictation controls available', () => {
    const files = new Map();
    const h = harness(files);
    const directory = '/run/user/1000/voice-to-terminal/copilot-notifications';
    files.set(`${directory}/0001-attention.json`, JSON.stringify({
        sessionId: 'session-a',
        status: 'attention',
        title: 'Copilot necesita una respuesta',
        message: 'Respondé en la terminal para continuar.',
        project: 'voice-to-terminal',
        createdAt: Date.now() / 1000,
    }));
    h.timers.get(h.extension._copilotNotificationTimer)();

    h.extension._floatingButton.events.clicked();
    assert.equal(h.extension._overlay, null);
    assert.equal(h.extension._copilotStatusBySession.get('session-a').status, 'attention');

    h.extension._recordButton.events.clicked();
    assert.ok(h.extension._overlay);
    assert.equal(h.extension._overlayVariant, 'expanded');
    h.extension._panelNavigationButtons.copilot.button.events.clicked();
    assert.equal(h.extension._activeSessionsBox.visible, true);
    assert.equal(activeSessionRows(h.extension)[0].children[0].children[1].text,
        'Necesita respuesta');
    assert.equal(h.extension._controlFooter.visible, true);
    assert.equal(h.extension._copilotStatusBySession.get('session-a').status, 'attention');
    h.extension.disable();
});

test('active sessions keep per-session tags without re-showing dismissed attention popups', () => {
    const files = new Map();
    const h = harness(files);
    const directory = '/run/user/1000/voice-to-terminal/copilot-notifications';
    const poll = h.timers.get(h.extension._copilotNotificationTimer);
    files.set(`${directory}/0001-attention.json`, JSON.stringify({
        sessionId: 'session-a',
        status: 'attention',
        title: 'Copilot necesita una respuesta',
        message: 'Respondé en la terminal para continuar.',
        project: 'voice-to-terminal',
        sessionName: 'Session A',
        createdAt: Date.now() / 1000,
    }));
    poll();

    assert.equal(h.extension._attentionDismissButton, undefined);
    assert.equal(h.extension._overlayLabel.text, 'Copilot necesita una respuesta');
    const attentionDismissId = h.extension._copilotDismissTimer;

    files.set(`${directory}/0002-other-working.json`, JSON.stringify({
        sessionId: 'session-b',
        status: 'working',
        title: 'Copilot trabajando',
        message: '',
        project: 'another-project',
        sessionName: 'Session B',
        createdAt: Date.now() / 1000,
    }));
    poll();
    assert.equal(h.extension._overlayLabel.text, 'Copilot necesita una respuesta');

    const dismiss = h.timers.get(attentionDismissId);
    h.timers.delete(attentionDismissId);
    assert.equal(dismiss(), false);
    assert.equal(h.extension._overlay, null);
    assert.equal(h.extension._copilotStatusBySession.get('session-a').status, 'attention');

    h.extension._showControls();
    assert.equal(activeSessionRows(h.extension).length, 2);
    assert.deepEqual(
        activeSessionRows(h.extension).map(row => row.children[0].children[1].text),
        ['Necesita respuesta', 'Working'],
    );
    assert.deepEqual(
        activeSessionRows(h.extension).map(row => row.children[0].children[0].text),
        ['Session A', 'Session B'],
    );

    files.set(`${directory}/0003-resumed.json`, JSON.stringify({
        sessionId: 'session-a',
        status: 'working',
        title: 'Copilot trabajando',
        message: '',
        project: 'voice-to-terminal',
        createdAt: Date.now() / 1000,
    }));
    poll();
    assert.equal(h.extension._copilotNotification, null);
    assert.equal(activeSessionRows(h.extension).length, 2);
    assert.deepEqual(
        activeSessionRows(h.extension).map(row => row.children[0].children[1].text),
        ['Working', 'Working'],
    );

    files.set(`${directory}/0004-attention.json`, JSON.stringify({
        sessionId: 'session-a',
        status: 'attention',
        title: 'Copilot necesita otra respuesta',
        message: 'Hay una nueva solicitud en la terminal.',
        project: 'voice-to-terminal',
        createdAt: Date.now() / 1000,
    }));
    poll();
    assert.equal(h.extension._overlayLabel.text, 'Copilot necesita otra respuesta');
    assert.ok(h.extension._copilotDismissTimer);
    h.extension.disable();
});

test('Copilot errors show a red card without playing a sound', () => {
    const files = new Map();
    const h = harness(files);
    const notificationPath = '/run/user/1000/voice-to-terminal/copilot-notifications/0001-error.json';
    files.set(notificationPath, JSON.stringify({
        sessionId: 'session-a',
        status: 'error',
        title: 'Copilot encontró un error',
        message: 'Falló la llamada al modelo.',
        createdAt: Date.now() / 1000,
    }));

    h.timers.get(h.extension._copilotNotificationTimer)();

    assert.equal(h.extension._overlayLabel.text, 'Copilot encontró un error');
    assert.equal(h.extension._caption.text, 'Falló la llamada al modelo.');
    assert.match(h.extension._overlayLabel.style, /#ff7676/);
    assert.equal(h.sounds.length, 0);
    assert.equal(files.has(notificationPath), false);
    h.extension.disable();
});

test('Copilot completion notification opens in a compact centered popup', () => {
    const files = new Map();
    const h = harness(files);
    const notificationPath = '/run/user/1000/voice-to-terminal/copilot-notifications/0001-ready.json';
    const sessionName = 'Implement Payment Validation Logic';
    const message = `${sessionName}\n¡Listo! Podés revisar el avance del contexto.`;
    files.set(notificationPath, JSON.stringify({
        sessionId: 'session-a',
        status: 'ready',
        title: 'Copilot listo',
        message,
        sessionName,
        createdAt: Date.now() / 1000,
    }));

    const poll = h.timers.get(h.extension._copilotNotificationTimer);
    poll();

    assert.ok(h.extension._overlay);
    assert.equal(h.extension._overlayAnchor, h.extension._floatingButton);
    assert.equal(h.extension._overlayVariant, 'compact');
    const monitor = h.main.layoutManager.primaryMonitor;
    const [popupWidth] = h.extension._overlay.get_preferred_width(-1);
    assert.equal(h.extension._overlay.x,
        monitor.x + (monitor.width - popupWidth) / 2);
    assert.match(h.extension._overlay.style, /border: 1px solid #a24bff/);
    assert.equal(h.extension._overlayLabel.text, 'Copilot listo');
    assert.equal(h.extension._sessionTitle.text, sessionName);
    assert.equal(h.extension._sessionTitle.visible, true);
    assert.match(h.extension._sessionTitle.style, /font-size: 12pt/);
    assert.match(h.extension._sessionTitle.style, /color: #f3e6cf/);
    assert.equal(h.extension._caption.text, '¡Listo! Podés revisar el avance del contexto.');
    assert.equal(h.extension._caption.visible, true);
    assert.equal(h.extension._robotAvatar, undefined);
    assert.equal(h.extension._controlFooter.visible, false);
    assert.deepEqual(h.sounds, [[
        '/usr/bin/canberra-gtk-play',
        '--file=/usr/share/sounds/freedesktop/stereo/bell.oga',
        '--volume=3.0',
    ]]);
    assert.equal(h.extension._floatingRobotIcon.gicon.file.path,
        h.extension._robotPosePaths.threeQuarter);
    assert.equal(files.has(notificationPath), false);
    assert.ok(h.extension._copilotDismissTimer);

    const dismissId = h.extension._copilotDismissTimer;
    const dismiss = h.timers.get(dismissId);
    h.timers.delete(dismissId);
    assert.equal(dismiss(), false);
    assert.equal(h.extension._overlay, null);
    assert.equal(h.extension._copilotNotification, null);
    assert.equal(h.extension._robotMood, 'idle');
    assert.equal(h.notifications.length, 0);
    h.extension.disable();
});

test('Copilot notification falls back to the top bar icon when the floating robot is hidden', () => {
    const files = new Map();
    const h = harness(files);
    h.extension._toggleFloatingRobotVisibility();
    h.extension._showControls(h.extension._recordButton);
    assert.equal(h.extension._overlayVariant, 'expanded');
    const notificationPath = '/run/user/1000/voice-to-terminal/copilot-notifications/0001-ready.json';
    files.set(notificationPath, JSON.stringify({
        sessionId: 'session-a',
        title: 'Copilot listo',
        message: 'Copilot terminó.',
        createdAt: Date.now() / 1000,
    }));

    h.timers.get(h.extension._copilotNotificationTimer)();

    assert.equal(h.extension._floatingRobotVisible, false);
    assert.equal(h.extension._overlayAnchor, h.extension._recordButton);
    assert.equal(h.extension._overlayVariant, 'compact');
    assert.match(h.extension._overlay.style, /width: 340px/);
    const monitor = h.main.layoutManager.primaryMonitor;
    const [popupWidth] = h.extension._overlay.get_preferred_width(-1);
    assert.equal(h.extension._overlay.x,
        monitor.x + (monitor.width - popupWidth) / 2);
    assert.equal(h.extension._overlayLabel.text, 'Copilot listo');
    h.extension._showControls(h.extension._recordButton);
    assert.equal(h.extension._overlayVariant, 'expanded');
    assert.equal(h.extension._overlayLabel.text, 'Copilot listo');
    h.extension.disable();
});

test('Copilot notification waits until dictation has finished', () => {
    const files = new Map();
    const h = harness(files);
    h.extension._toggleRecording();
    const notificationPath = '/run/user/1000/voice-to-terminal/copilot-notifications/0002-ready.json';
    files.set(notificationPath, JSON.stringify({
        sessionId: 'session-a',
        title: 'Copilot listo',
        message: 'Copilot terminó. Revisa mi respuesta.',
        createdAt: Date.now() / 1000,
    }));
    const poll = h.timers.get(h.extension._copilotNotificationTimer);

    poll();
    assert.equal(files.has(notificationPath), true);
    h.finish();
    poll();
    assert.equal(files.has(notificationPath), true);
    h.extension._toggleRecording();
    poll();
    assert.equal(files.has(notificationPath), true);
    h.finish();
    poll();
    assert.equal(files.has(notificationPath), true);

    const resultDismissId = h.extension._resultDismissTimer;
    const dismissResult = h.timers.get(resultDismissId);
    h.timers.delete(resultDismissId);
    dismissResult();
    poll();
    assert.equal(files.has(notificationPath), false);
    assert.equal(h.extension._overlayLabel.text, 'Copilot listo');
    assert.equal(h.extension._caption.text, 'Copilot terminó. Revisa mi respuesta.');
    h.extension.disable();
});

test('dragging moves and persists the floating robot without opening the chat', () => {
    const files = new Map();
    const h = harness(files);
    const robot = h.extension._floatingButton;
    const event = (x, y) => ({
        get_button: () => 1,
        get_coords: () => [x, y],
    });
    robot.events['button-press-event'](robot, event(20, 52));
    robot.events['motion-event'](robot, event(200, 200));
    assert.deepEqual([robot.x, robot.y], [194, 194]);
    assert.equal(robot.events['button-release-event'](), false);
    assert.equal(h.extension._overlay, undefined);
    assert.equal(files.get('/home/test/.config/voice-to-terminal/floating-position.json'),
        '{"x":194,"y":194,"visible":true}\n');
    robot.events.clicked();
    assert.equal(h.extension._overlay, undefined);
    const resetTimer = h.extension._floatingClickResetTimer;
    const resetClick = h.timers.get(resetTimer);
    h.timers.delete(resetTimer);
    resetClick();
    assert.equal(h.extension._suppressFloatingClick, false);
    robot.events.clicked();
    assert.ok(h.extension._overlay);
    h.extension.disable();

    const restored = harness(files);
    assert.deepEqual(
        [restored.extension._floatingButton.x, restored.extension._floatingButton.y],
        [194, 194],
    );
    restored.extension.disable();
});

test('panel controls hide and restore the floating robot and retain recording', () => {
    const files = new Map();
    const h = harness(files);
    h.extension._recordButton.events.clicked();
    assert.ok(h.extension._overlay);
    h.extension._floatingVisibilityButton.events.clicked();
    assert.equal(h.extension._floatingRobotVisible, false);
    assert.equal(h.extension._floatingButton, null);
    assert.equal(h.extension._overlayAnchor, h.extension._recordButton);
    assert.equal(h.extension._floatingVisibilityButton.accessible_name, 'Mostrar robot flotante');
    assert.equal(JSON.parse(files.get('/home/test/.config/voice-to-terminal/floating-position.json')).visible,
        false);

    h.extension._floatingVisibilityButton.events.clicked();
    assert.equal(h.extension._floatingRobotVisible, true);
    assert.ok(h.extension._floatingButton);
    h.extension._floatingVisibilityButton.events.clicked();
    h.extension._recordButton.events.clicked();
    h.extension._recordButton.events.clicked();
    h.extension._actionButton.events.clicked();
    assert.equal(h.calls.at(-1)[0], '--start');
    h.finish();
    assert.equal(h.extension._phase, 'recording');
    h.extension.disable();

    const restored = harness(files);
    assert.equal(restored.extension._floatingRobotVisible, false);
    assert.equal(restored.extension._floatingButton, undefined);
    restored.extension._recordButton.events.clicked();
    assert.ok(restored.extension._overlay);
    restored.extension._floatingVisibilityButton.events.clicked();
    assert.equal(restored.extension._floatingRobotVisible, true);
    assert.ok(restored.extension._floatingButton);
    restored.extension.disable();
});

test('dragging clamps the floating robot to the visible monitor area', () => {
    const h = harness();
    const robot = h.extension._floatingButton;
    const event = (x, y) => ({
        get_button: () => 1,
        get_coords: () => [x, y],
    });
    robot.events['button-press-event'](robot, event(20, 52));
    robot.events['motion-event'](robot, event(-1000, -1000));
    assert.deepEqual([robot.x, robot.y], [0, 32]);
    const bottomRight = h.extension._clampFloatingPosition(5000, 5000);
    assert.deepEqual([bottomRight.x, bottomRight.y], [1808, 968]);
    robot.events['button-release-event']();
    h.extension.disable();
});

test('opening the floating chat while dictation starts animates the pending state', () => {
    const h = harness();
    h.extension._toggleRecording();
    h.extension._floatingButton.events.clicked();
    assert.equal(h.extension._phase, 'starting');
    assert.equal(h.extension._overlayLabel.text, 'Iniciando');
    assert.equal(h.extension._dotsBox.visible, true);
    assert.ok(h.extension._dotsTimer);
    assert.match(h.extension._actionButton.style, /background-color: #1b1b1f/);
    h.finish();
    assert.equal(h.extension._phase, 'recording');
    assert.equal(h.extension._dotsTimer, 0);
    assert.equal(h.extension._meterBox.visible, true);
});

test('hover highlights the panel icon; click opens controls without starting dictation', () => {
    const h = harness();
    assert.equal(h.extension._indicator.reactive, false);
    assert.equal(h.extension._indicator.events['button-press-event'], undefined);
    assert.equal(h.extension._indicator.events['touch-event'], undefined);
    assert.equal(h.calls.length, 1);
    h.extension._recordButton.events['enter-event']();
    assert.equal(h.extension._overlay, undefined);
    assert.match(h.extension._recordButton.style, /rgba\(255,255,255,0\.12\)/);
    assert.equal(h.extension._phase, 'idle');
    assert.equal(h.calls.length, 1);
    h.extension._recordButton.events.clicked();
    assert.ok(h.extension._overlay);
    assert.equal(h.extension._overlay.x, 600);
    assert.equal(h.extension._robotAvatar, undefined);
    assert.equal(h.extension._actionIcon.icon_size, 20);
    assert.equal(h.extension._phase, 'idle');
    assert.equal(h.extension._overlayLabel.text, 'Listo para dictar');
    assert.equal(h.extension._overlayLabel.visible, true);
    assert.equal(h.extension._dotsBox.visible, false);
    assert.equal(h.extension._meterBox.visible, false);
    assert.equal(h.extension._actionIcon.gicon.file.path,
        '/home/test/.local/share/gnome-shell/extensions/voice-to-terminal@migue.local/microphone.svg');
    assert.equal(h.extension._actionButton.child, h.extension._actionIcon);
    assert.equal(h.extension._overlayVariant, 'expanded');
    assert.equal(h.extension._overlay.children.length, 2);
    assert.equal(h.extension._overlay.children[1].x_expand, true);
    const expandedContent = h.extension._overlay.children[1];
    assert.equal(expandedContent.y_expand, true);
    assert.equal(expandedContent.children.at(-1), h.extension._controlFooter);
    assert.equal(expandedContent.children.at(-2).y_expand, true);
    assert.equal(h.extension._controlFooter.children[0], h.extension._floatingVisibilityButton);
    assert.equal(h.extension._controlFooter.children[2], h.extension._actionButton);
    assert.equal(h.calls.length, 1);
    h.extension._recordButton.events.clicked();
    assert.equal(h.extension._overlay, null);
    assert.equal(h.calls.length, 1);
    h.extension._recordButton.events.clicked();
    assert.ok(h.extension._overlay);
    h.extension._actionButton.events.clicked();
    assert.equal(h.calls.at(-1)[0], '--start');
    h.finish();
    assert.equal(h.extension._overlayLabel.text, 'Grabando');
    assert.equal(h.extension._dotsBox.visible, false);
    assert.equal(h.extension._meterBox.visible, true);
    assert.equal(h.extension._actionButton.child, h.extension._stopIcon);
    assertFloatingRobotHasNoBadge(h.extension._floatingButton);
    h.extension._actionButton.events.clicked();
    assert.equal(h.calls.at(-1)[0], '--stop');
    assert.deepEqual(h.focusEvents, ['close-menu', 'activate']);
    h.finish();
    assert.equal(h.extension._overlayLabel.text, 'Mensaje listo');
    assert.equal(h.extension._overlayLabel.visible, true);
    assert.equal(h.extension._dotsBox.visible, false);
    assert.equal(h.extension._meterBox.visible, false);
    assertFloatingRobotHasNoBadge(h.extension._floatingButton);
    assert.equal(h.extension._caption.text, 'dictado local de prueba');
    assert.equal(h.extension._caption.visible, true);
    assert.ok(h.extension._resultDismissTimer);
    assert.equal(h.extension._actionButton.child, h.extension._actionIcon);
    h.extension._recordButton.events.clicked();
    assert.equal(h.extension._overlay, null);
});

test('click opens controls and they disappear after the pointer leaves', () => {
    const h = harness();
    h.extension._recordButton.events.clicked();
    assert.ok(h.extension._overlay);
    h.extension._recordButton.events['leave-event']();
    assert.doesNotMatch(h.extension._recordButton.style, /rgba\(255,255,255,0\.12\)/);
    const timerId = h.extension._overlayHideTimer;
    const closeOverlay = h.timers.get(timerId);
    h.timers.delete(timerId);
    assert.equal(closeOverlay(), false);
    assert.equal(h.extension._overlay, null);
});

test('record/stop works with GNOME animations disabled, without recursive ease', () => {
    const h = harness();
    h.extension._toggleRecording();
    h.finish();
    assert.equal(h.extension._phase, 'recording');
    assert.ok(h.extension._overlay);
    assert.equal(h.extension._overlayLabel.visible, true);
    assert.equal(h.extension._meterBox.visible, true);
    assert.equal(h.extension._dotsBox.visible, false);
    assert.equal(h.activeTimerCount(), 1);
    const meterTimer = h.timers.get(h.extension._meterTimer);
    meterTimer();
    assert.ok(h.extension._meterBars[2].scale_y > 0.12);
    assert.equal(h.extension._overlayLabel.text, 'Grabando');
    h.extension._actionButton.events.clicked();
    assert.equal(h.calls.at(-1)[0], '--stop');
    assert.equal(h.extension._phase, 'stopping');
    h.extension._recordButton.events.clicked();
    assert.ok(h.extension._overlay);
    assert.equal(h.extension._overlayLabel.text, 'Transcribiendo');
    assert.equal(h.activeTimerCount(), 1);
    h.finish();
    assert.equal(h.extension._phase, 'complete');
    assert.equal(h.extension._overlayLabel.text, 'Mensaje listo');
    assert.equal(h.activeTimerCount(), 1);
    const resultTimerId = h.extension._resultDismissTimer;
    const dismiss = h.timers.get(resultTimerId);
    h.timers.delete(resultTimerId);
    assert.equal(dismiss(), false);
    assert.equal(h.extension._phase, 'idle');
    assert.equal(h.extension._overlay, null);
});

test('dictation result nudges the card with a brief ease-out rebound', () => {
    const h = harness();
    h.extension._toggleRecording();
    h.finish();
    const overlay = h.extension._overlay;
    const transitions = [];
    overlay.ease = options => {
        transitions.push(options);
        overlay.translation_x = options.translation_x;
        options.onComplete?.();
    };

    h.extension._actionButton.events.clicked();
    h.finish();

    assert.deepEqual(transitions.map(({ translation_x, duration, mode }) => [
        translation_x, duration, mode,
    ]), [
        [4, 60, 1],
        [-1, 45, 1],
        [0, 60, 1],
    ]);
    assert.ok(transitions.every(options => !('scale_x' in options) && !('scale_y' in options)));
    assert.equal(overlay.translation_x, 0);
});

test('result stays visible while hovered and dismisses after the pointer leaves', () => {
    const h = harness();
    h.extension._toggleRecording();
    h.finish();
    h.extension._overlay.events['enter-event']();
    h.extension._actionButton.events.clicked();
    h.finish();
    assert.equal(h.extension._phase, 'complete');
    assert.equal(h.extension._resultDismissTimer, 0);
    h.extension._overlay.events['leave-event']();
    assert.ok(h.extension._resultDismissTimer);
    const timerId = h.extension._resultDismissTimer;
    const dismiss = h.timers.get(timerId);
    h.timers.delete(timerId);
    dismiss();
    assert.equal(h.extension._overlay, null);
    assert.equal(h.notifications.length, 0);
});

test('rapid clicks do not start or stop twice; destination is frozen at start', () => {
    const h = harness();
    h.extension._toggleRecording();
    h.extension._toggleRecording();
    assert.equal(h.calls.length, 2);
    h.finish();
    h.display.focus_window = { get_window_type: () => 0, activate() { throw Error('Wrong target'); } };
    h.display.focusChanged();
    h.extension._toggleRecording();
    h.extension._toggleRecording();
    assert.equal(h.calls.length, 3);
    assert.equal(h.win.activated, true);
    h.finish();
});

test('recording captures the currently focused window instead of a stale cached one', () => {
    const h = harness();
    const focusedWindow = { get_window_type: () => 0, activate() {} };
    h.display.focus_window = focusedWindow;
    h.extension._toggleRecording();
    assert.equal(h.extension._targetWindow, focusedWindow);
    h.extension.disable();
});

test('a UI error cannot prevent sending stop to the backend', () => {
    const h = harness();
    h.extension._toggleRecording();
    h.finish();
    h.extension._animate = () => { throw Error('UI failure'); };
    assert.doesNotThrow(() => h.extension._toggleRecording());
    assert.equal(h.calls.at(-1)[0], '--stop');
    h.finish();
    assert.equal(h.extension._phase, 'complete');
});

test('overlay failure cancels recording and backend errors reset UI', () => {
    const h = harness();
    h.extension._showOverlay = () => { throw Error('UI failure'); };
    h.extension._toggleRecording();
    h.finish();
    assert.equal(h.calls.at(-1)[0], '--cancel');
    h.finish();
    assert.equal(h.extension._phase, 'idle');
    assert.equal(h.notifications.length, 1);
    h.extension._toggleRecording();
    h.finish(false);
    assert.equal(h.extension._phase, 'idle');
    assert.equal(h.notifications.length, 2);
});

test('disable cleans up timers and ignores callbacks from an older lifecycle', () => {
    const h = harness();
    h.extension._toggleRecording();
    h.extension.disable();
    h.extension.enable();
    h.finish();
    h.finish();
    assert.equal(h.extension._phase, 'starting');
    h.finish();
    assert.equal(h.extension._phase, 'idle');
    h.extension._toggleRecording();
    h.finish();
    assert.equal(h.activeTimerCount(), 1);
    const hint = h.extension._floatingHint;
    h.extension._floatingButton.events['enter-event']();
    assert.ok(h.extension._floatingHintTimer);
    h.extension.disable();
    assert.equal(h.timers.size, 0);
    assert.equal(h.chromeActors.has(hint), false);
    assert.equal(hint.destroyed, true);
    assert.equal(h.calls.at(-1)[0], '--cancel');
});
