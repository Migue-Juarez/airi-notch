import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

function harness(files = new Map()) {
    const timers = new Map();
    const calls = [];
    const notifications = [];
    const pending = [];
    const chromeActors = new Set();
    let nextId = 1;
    class Actor {
        constructor(props = {}) { Object.assign(this, props); this.events = {}; this.children = []; }
        connect(name, callback) { this.events[name] = callback; return nextId++; }
        add_child(child) { this.children.push(child); }
        set_child(child) { this.child = child; }
        set_position(x, y) { this.x = x; this.y = y; }
        get_preferred_width() { return [260, 260]; }
        get_preferred_height() { return [72, 72]; }
        get_transformed_position() { return [this.x ?? 1880, this.y ?? 0]; }
        get_transformed_size() { return [this.width ?? 40, this.height ?? 32]; }
        remove_all_transitions() {}
        get_stage() { return true; }
        destroy() { this.destroyed = true; }
        // Reproduce GNOME con enable-animations=false.
        ease(options) { Object.assign(this, options); options.onComplete?.(); }
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
    const GLib = {
        build_filenamev: parts => parts.join('/'),
        get_home_dir: () => '/home/test',
        get_user_data_dir: () => '/home/test/.local/share',
        get_user_config_dir: () => '/home/test/.config',
        getenv: name => name === 'XDG_RUNTIME_DIR' ? '/run/user/1000' : null,
        get_real_time: () => Date.now() * 1000,
        PRIORITY_DEFAULT: 0, PRIORITY_DEFAULT_IDLE: 1,
        SOURCE_REMOVE: false, SOURCE_CONTINUE: true,
        timeout_add(_priority, _delay, callback) {
            const id = nextId++;
            timers.set(id, callback);
            return id;
        },
        idle_add(_priority, callback) {
            const id = nextId++;
            timers.set(id, callback);
            return id;
        },
        source_remove: id => timers.delete(id),
    };
    const Main = {
        panel: { addToStatusArea() {}, statusArea: {
            quickSettings: { menu: { close(animation) {
                assert.equal(animation, 0);
                focusEvents.push('close-menu');
            } } },
        } },
        layoutManager: {
            primaryMonitor: { x: 0, y: 0, width: 1920, height: 1080 },
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
            query_exists: () => files.has(path),
            load_contents: () => [
                true,
                encoder.encode(files.get(path) ?? `${Date.now() / 1000} 0.500\n`),
            ],
            make_directory_with_parents: () => {
                files.set(path, '');
                return true;
            },
            replace_contents: contents => {
                files.set(path, new TextDecoder().decode(contents));
                return [true, 'etag'];
            },
        }) },
        SubprocessFlags: { STDOUT_PIPE: 1, STDERR_PIPE: 2 },
        SubprocessLauncher: class {
            setenv() {}
            spawnv(argv) {
                calls.push(argv.slice(1));
                const process = {
                    communicate_utf8_async(_input, _cancel, callback) {
                        pending.push((success = true, stdout = 'dictado local de prueba\n') => {
                            process.success = success;
                            process.stdout = success ? stdout : '';
                            callback(process, {});
                        });
                    },
                    communicate_utf8_finish: () => [true, process.stdout, 'backend error'],
                    get_successful() { return this.success; },
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
            AnimationMode: { EASE_IN_OUT_SINE: 0, EASE_OUT_QUAD: 1 } },
        St: { Icon: Actor, Widget: Actor, BoxLayout: Actor, Label: Actor, Button: Actor },
        PanelMenu: { Button: Actor },
        TextDecoder,
        TextEncoder,
        Extension: class { constructor() { this.uuid = 'voice-to-terminal@migue.local'; } },
        global: { display, get_current_time: () => 1 },
    });
    vm.runInContext(source, context);
    const extension = new context.TestExtension();
    extension.enable();
    const finish = (success = true) => pending.shift()(success);
    finish();
    const activeTimerCount = () => timers.size - Number(Boolean(extension._floatingPulseTimer));
    return {
        extension, timers, calls, notifications, finish, win, display, focusEvents,
        chromeActors, activeTimerCount, files,
    };
}

test('floating robot stays at upper left and opens the same controls as the panel icon', () => {
    const h = harness();
    assert.ok(h.extension._floatingButton);
    assert.equal(h.extension._floatingRobotIcon.icon_size, 30);
    assert.equal(h.extension._floatingButton.can_focus, true);
    assert.deepEqual(
        [h.extension._floatingButton.x, h.extension._floatingButton.y],
        [14, 46],
    );
    const pulse = h.timers.get(h.extension._floatingPulseTimer);
    pulse();
    pulse();
    assert.equal(h.extension._floatingRobotIcon.opacity, 224);
    assert.ok(h.chromeActors.has(h.extension._floatingButton));
    h.extension._floatingButton.events.clicked();
    assert.ok(h.extension._overlay);
    assert.ok(h.extension._overlay.x > h.extension._floatingButton.x);
    assert.ok(h.extension._overlay.x < 100);
    assert.equal(h.calls.length, 1);
    h.extension._floatingButton.events.clicked();
    assert.equal(h.extension._overlay, null);
    assert.equal(h.calls.length, 1);
    h.extension.disable();
    assert.equal(h.chromeActors.size, 0);
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
    assert.ok(h.extension._overlay.x > 1000);
    assert.ok(h.extension._robotAvatar);
    assert.equal(h.extension._robotAvatar.icon_size, 44);
    assert.equal(h.extension._actionIcon.icon_size, 20);
    assert.equal(h.extension._phase, 'idle');
    assert.equal(h.extension._overlayLabel.text, '');
    assert.equal(h.extension._overlayLabel.visible, false);
    assert.equal(h.extension._dotsBox.visible, false);
    assert.equal(h.extension._meterBox.visible, false);
    assert.equal(h.extension._actionIcon.gicon.file.path,
        '/home/test/.local/share/gnome-shell/extensions/voice-to-terminal@migue.local/microphone.svg');
    assert.equal(h.extension._actionButton.child, h.extension._actionIcon);
    assert.equal(h.extension._overlay.children[1].x_expand, true);
    assert.equal(h.extension._overlay.children[1].y_align, 0);
    assert.equal(h.extension._overlay.children[2], h.extension._floatingVisibilityButton);
    assert.equal(h.extension._overlay.children[3], h.extension._actionButton);
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
    assert.match(h.extension._floatingButton.style, /255,93,119/);
    h.extension._actionButton.events.clicked();
    assert.equal(h.calls.at(-1)[0], '--stop');
    assert.deepEqual(h.focusEvents, ['close-menu', 'activate']);
    h.finish();
    assert.equal(h.extension._overlayLabel.text, 'Mensaje listo');
    assert.equal(h.extension._overlayLabel.visible, true);
    assert.equal(h.extension._dotsBox.visible, false);
    assert.equal(h.extension._meterBox.visible, false);
    assert.equal(h.extension._checkIcon.visible, true);
    assert.match(h.extension._floatingButton.style, /67,233,135/);
    assert.equal(h.extension._caption.text, 'dictado local de prueba');
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
    assert.equal(h.extension._checkIcon.visible, true);
    assert.equal(h.activeTimerCount(), 1);
    const resultTimerId = h.extension._resultDismissTimer;
    const dismiss = h.timers.get(resultTimerId);
    h.timers.delete(resultTimerId);
    assert.equal(dismiss(), false);
    assert.equal(h.extension._phase, 'idle');
    assert.equal(h.extension._overlay, null);
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
    h.extension.disable();
    assert.equal(h.timers.size, 0);
    assert.equal(h.calls.at(-1)[0], '--cancel');
});
