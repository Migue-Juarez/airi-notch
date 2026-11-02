import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

function harness() {
    const timers = new Map();
    const calls = [];
    const notifications = [];
    const pending = [];
    let nextId = 1;
    class Actor {
        constructor(props = {}) { Object.assign(this, props); this.events = {}; this.children = []; }
        connect(name, callback) { this.events[name] = callback; return nextId++; }
        add_child(child) { this.children.push(child); }
        set_child(child) { this.child = child; }
        set_position(x, y) { this.x = x; this.y = y; }
        get_preferred_width() { return [260, 260]; }
        get_preferred_height() { return [72, 72]; }
        get_transformed_position() { return [1880, 0]; }
        get_transformed_size() { return [40, 32]; }
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
        PRIORITY_DEFAULT: 0, SOURCE_REMOVE: false, SOURCE_CONTINUE: true,
        timeout_add(_priority, _delay, callback) {
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
        layoutManager: { primaryMonitor: { x: 0, y: 0, width: 1920, height: 1080 },
            addTopChrome() {}, removeChrome() {} },
        notifyError: (...args) => notifications.push(args),
    };
    const Gio = {
        FileIcon: class {},
        File: { new_for_path: path => path },
        SubprocessFlags: { STDERR_PIPE: 1 },
        SubprocessLauncher: class {
            setenv(key, value) { assert.equal(key, 'VOICE_TO_TERMINAL_QUIET'); assert.equal(value, '1'); }
            spawnv(argv) {
                calls.push(argv.slice(1));
                const process = {
                    communicate_utf8_async(_input, _cancel, callback) {
                        pending.push((success = true) => {
                            process.success = success;
                            callback(process, {});
                        });
                    },
                    communicate_utf8_finish: () => [true, null, 'backend error'],
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
        PanelMenu: { Button: Actor }, Extension: class {},
        global: { display, get_current_time: () => 1 },
    });
    vm.runInContext(source, context);
    const extension = new context.TestExtension();
    extension.enable();
    const finish = (success = true) => pending.shift()(success);
    finish();
    return { extension, timers, calls, notifications, finish, win, display, focusEvents };
}

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
    assert.ok(h.extension._robotAvatar);
    assert.equal(h.extension._phase, 'idle');
    assert.equal(h.extension._overlayLabel.text, '');
    assert.equal(h.extension._overlayLabel.visible, false);
    assert.equal(h.extension._dotsBox.visible, false);
    assert.equal(h.extension._actionIcon.icon_name, 'audio-input-microphone-symbolic');
    assert.equal(h.extension._overlay.children[1].x_expand, true);
    assert.equal(h.extension._overlay.children[1].y_align, 0);
    assert.equal(h.extension._overlay.children[2], h.extension._actionButton);
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
    assert.equal(h.extension._dotsBox.visible, true);
    assert.equal(h.extension._actionIcon.icon_name, 'media-playback-stop-symbolic');
    h.extension._actionButton.events.clicked();
    assert.equal(h.calls.at(-1)[0], '--stop');
    assert.deepEqual(h.focusEvents, ['close-menu', 'activate']);
    h.finish();
    assert.equal(h.extension._overlayLabel.text, '');
    assert.equal(h.extension._overlayLabel.visible, false);
    assert.equal(h.extension._dotsBox.visible, false);
    assert.equal(h.extension._actionIcon.icon_name, 'audio-input-microphone-symbolic');
});

test('click opens controls and they disappear after the pointer leaves', () => {
    const h = harness();
    h.extension._recordButton.events.clicked();
    assert.ok(h.extension._overlay);
    h.extension._recordButton.events['leave-event']();
    assert.doesNotMatch(h.extension._recordButton.style, /rgba\(255,255,255,0\.12\)/);
    const [[timerId, closeOverlay]] = [...h.timers.entries()];
    assert.equal(closeOverlay(), false);
    h.timers.delete(timerId);
    assert.equal(h.extension._overlay, null);
});

test('record/stop works with GNOME animations disabled, without recursive ease', () => {
    const h = harness();
    h.extension._toggleRecording();
    h.finish();
    assert.equal(h.extension._phase, 'recording');
    assert.ok(h.extension._overlay);
    assert.equal(h.extension._overlayLabel.visible, true);
    assert.equal(h.timers.size, 1);
    const initialOpacity = h.extension._dots[0].opacity;
    const initialScale = h.extension._dots[0].scale_x;
    [...h.timers.values()][0]();
    assert.notEqual(h.extension._dots[0].opacity, initialOpacity);
    assert.notEqual(h.extension._dots[0].scale_x, initialScale);
    assert.equal(h.extension._overlayLabel.text, 'Grabando');
    h.extension._overlay.events['enter-event']();
    h.extension._actionButton.events.clicked();
    assert.equal(h.calls.at(-1)[0], '--stop');
    assert.equal(h.extension._phase, 'stopping');
    h.extension._recordButton.events.clicked();
    assert.ok(h.extension._overlay);
    assert.equal(h.extension._overlayLabel.text, 'Transcribiendo');
    assert.equal(h.timers.size, 1);
    h.finish();
    assert.equal(h.extension._phase, 'idle');
    assert.equal(h.extension._overlayLabel.text, '');
    assert.equal(h.extension._overlayLabel.visible, false);
    assert.equal(h.timers.size, 0);
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
    assert.equal(h.extension._phase, 'idle');
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
    assert.equal(h.timers.size, 1);
    h.extension.disable();
    assert.equal(h.timers.size, 0);
    assert.equal(h.calls.at(-1)[0], '--cancel');
});
