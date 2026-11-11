import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

function harness(files = new Map()) {
    const timers = new Map();
    const calls = [];
    const notifications = [];
    const sounds = [];
    const pending = [];
    const chromeActors = new Set();
    let nextId = 1;
    class Actor {
        constructor(props = {}) {
            Object.assign(this, props);
            this.events = {};
            this.children = [];
            this.easeCalls = [];
        }
        connect(name, callback) { this.events[name] = callback; return nextId++; }
        add_child(child) { this.children.push(child); }
        set_child(child) { this.child = child; }
        set_position(x, y) { this.x = x; this.y = y; }
        get_preferred_width() { return [this.preferredWidth ?? 260, this.preferredWidth ?? 260]; }
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
            FixedLayout: class {},
            AnimationMode: {
                EASE_IN_OUT_SINE: 0,
                EASE_OUT_QUAD: 1,
                EASE_IN_OUT_QUAD: 2,
                EASE_OUT_BACK: 3,
            } },
        Pango: { EllipsizeMode: { END: 3 } },
        St: { Icon: Actor, Widget: Actor, BoxLayout: Actor, Label, Button: Actor },
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
    const activeTimerCount = () => timers.size
        - Number(Boolean(extension._floatingBlinkTimer))
        - Number(Boolean(extension._floatingBlinkRestoreTimer))
        - Number(Boolean(extension._floatingSaccadeTimer))
        - Number(Boolean(extension._floatingSaccadeRestoreTimer))
        - Number(Boolean(extension._copilotShimmerTimer))
        - Number(Boolean(extension._copilotNotificationTimer));
    return {
        extension, timers, calls, notifications, sounds, finish, win, display, focusEvents,
        chromeActors, activeTimerCount, files,
    };
}

function assertFloatingRobotHasNoBadge(button) {
    assert.match(button.style, /background-color: transparent/);
    assert.match(button.style, /border: 0/);
    assert.match(button.style, /outline: none/);
    assert.match(button.style, /box-shadow: none/);
}

test('floating robot stays at upper left and opens the same controls as the panel icon', () => {
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
    assert.equal(h.extension._floatingRobotCanvas.children.length, 4);
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
    assert.equal(h.extension._floatingRobotIcon.gicon.file.path,
        h.extension._robotPosePaths.threeQuarter);
    assert.equal(h.extension._floatingButton.raisedAbove, h.extension._overlay);
    assert.equal(h.extension._caption.clutter_text.line_wrap, true);
    assert.match(h.extension._sessionStatusLabel.style, /max-width: 200px/);
    assert.equal(h.extension._sessionStatusLabel.clutter_text.line_wrap, false);
    assert.equal(h.extension._sessionStatusLabel.clutter_text.ellipsize, 3);
    assert.equal(h.extension._overlay.x, 90);
    assert.equal(h.extension._caption.text, '');
    assert.equal(h.extension._caption.visible, false);
    assert.match(h.extension._overlay.style, /min-width: 0px/);
    assert.match(h.extension._overlay.children[0].style, /padding-left: 24px/);
    assert.equal(h.extension._floatingVisibilityButton.visible, true);
    assert.equal(h.extension._actionButton.visible, true);
    assert.match(h.extension._floatingVisibilityButton.style, /border-radius: 999px/);
    assert.match(h.extension._floatingVisibilityButton.style, /color: #047857/);
    assert.match(h.extension._floatingVisibilityButton.style, /rgba\(16,185,129,0\.12\)/);
    assert.match(h.extension._actionButton.style, /background-color: #10b981/);
    assert.match(h.extension._actionButton.style, /border-radius: 999px/);
    assert.equal(h.calls.length, 1);
    h.extension._floatingButton.events.clicked();
    assert.equal(h.extension._overlay, null);
    assert.equal(h.extension._floatingRobotIcon.gicon.file.path,
        h.extension._robotPosePaths.front);
    assert.equal(h.calls.length, 1);
    h.extension.disable();
    assert.equal(h.chromeActors.size, 0);
});

test('floating card overlaps the robot when it opens to the left', () => {
    const h = harness();
    h.extension._floatingButton.set_position(1840, 46);
    h.extension._floatingButton.events.clicked();

    assert.ok(h.extension._overlay);
    assert.equal(h.extension._overlay.x + 260, h.extension._floatingButton.x + 36);
    assert.ok(h.extension._overlay.x + 260 <= 1920);
    assert.equal(h.extension._floatingButton.raisedAbove, h.extension._overlay);

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
    assert.match(nearEye.style, /box-shadow: 0 0 4px.*0 0 12px.*inset 0 0 2px/);
    h.extension._setFloatingPose('threeQuarter', false);

    assert.equal(nearEye.rotation_angle_z, -12);
    assert.equal(farEye.rotation_angle_z, -12);
    assert.equal(farEye.y, nearEye.y - 3);
    assert.equal(farEye.scale_x, 0.7);
    h.extension.disable();
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
        taskSummary: 'Refactorizando Auth Hook',
        createdAt: Date.now() / 1000,
    }));

    poll();

    assert.equal(h.extension._copilotNotification, null);
    assert.equal(h.extension._overlay, undefined);
    assert.equal(h.extension._robotMood, 'processing');
    assert.equal(h.extension._floatingSaccadeTimer, 0);
    assert.equal(h.extension._floatingButton.accessible_name,
        'Copilot trabajando en voice-to-terminal');
    h.extension._showControls();
    assert.equal(h.extension._overlayLabel.text, 'Copilot trabajando');
    assert.equal(h.extension._sessionStatusLabel.text,
        'voice-to-terminal · Refactorizando Auth Hook');
    assert.equal(h.extension._sessionStatusLabel.visible, true);
    assert.equal(h.extension._actionButton.child, h.extension._actionIcon);
    assert.equal(h.extension._floatingEyes[0].scale_y, 0.68);
    assert.equal(h.extension._floatingSaccadeTimer > 0, true);
    assert.ok(h.extension._copilotShimmerTimer);
    assert.equal(h.sounds.length, 0);
    assert.equal(h.extension._floatingRobotIcon.gicon.file.path,
        h.extension._robotPosePaths.threeQuarter);
    assert.equal(h.extension._indicatorIcon.gicon.file.path,
        h.extension._robotMoodPaths.processing);
    assert.equal(h.extension._floatingRobotCanvas.scale_x ?? 1, 1);
    assert.equal(h.extension._floatingRobotCanvas.scale_y ?? 1, 1);
    assert.equal(h.extension._indicatorIcon.scale_x ?? 1, 1);
    assert.equal(h.extension._indicatorIcon.scale_y ?? 1, 1);
    const shimmer = h.timers.get(h.extension._copilotShimmerTimer);
    const initialShimmerStyle = h.extension._overlayLabel.style;
    assert.equal(shimmer(), true);
    assert.notEqual(h.extension._overlayLabel.style, initialShimmerStyle);
    assert.match(h.extension._overlayLabel.style, /transition-duration: 240ms/);

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
        createdAt: Date.now() / 1000,
    }));
    poll();

    assert.equal(h.extension._overlayLabel.text, 'Copilot necesita permiso');
    assert.equal(h.extension._caption.text,
        'Proyecto: voice-to-terminal · Refactorizando Auth Hook\nRevisá la solicitud en la terminal para continuar.');
    assert.match(h.extension._overlayLabel.style, /#0f766e/);
    assert.equal(h.extension._robotMood, 'attention');
    assert.equal(h.extension._floatingEyes[0].scale_y, 1);
    assert.equal(h.extension._copilotShimmerTimer, 0);
    assert.equal(h.extension._floatingRobotIcon.gicon.file.path,
        h.extension._robotPosePaths.threeQuarter);
    assert.equal(h.sounds.length, 1);
    assert.equal(h.extension._copilotDismissTimer, 0);
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

test('Copilot attention cancels an earlier completion timeout and remains visible', () => {
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
        createdAt: Date.now() / 1000,
    }));
    poll();

    assert.equal(h.extension._overlayLabel.text, 'Copilot necesita una respuesta');
    assert.equal(h.extension._copilotDismissTimer, 0);
    assert.equal(h.timers.has(completionDismissId), false);
    assert.equal(h.extension._caption.text,
        'Proyecto: project-b\nRespondé en la terminal para continuar.');
    h.extension.disable();
});

test('hiding a pending attention card keeps its session state and allows dictation controls', () => {
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

    h.extension._toggleControls();
    assert.equal(h.extension._overlay, null);
    assert.equal(h.extension._copilotStatusBySession.get('session-a').status, 'attention');

    h.extension._toggleControls();
    assert.ok(h.extension._overlay);
    assert.equal(h.extension._overlayLabel.text, 'Listo para dictar');
    assert.equal(h.extension._sessionStatusLabel.visible, false);
    assert.equal(h.extension._actionButton.visible, true);
    assert.equal(h.extension._copilotStatusBySession.get('session-a').status, 'attention');
    h.extension.disable();
});

test('attention auto-clears when its session resumes, not when another session works', () => {
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
        createdAt: Date.now() / 1000,
    }));
    poll();

    assert.equal(h.extension._attentionDismissButton, undefined);
    assert.equal(h.extension._overlayLabel.text, 'Copilot necesita una respuesta');

    files.set(`${directory}/0002-other-working.json`, JSON.stringify({
        sessionId: 'session-b',
        status: 'working',
        title: 'Copilot trabajando',
        message: '',
        project: 'another-project',
        createdAt: Date.now() / 1000,
    }));
    poll();
    assert.equal(h.extension._overlayLabel.text, 'Copilot necesita una respuesta');

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
    assert.equal(h.extension._overlay, null);

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
    assert.match(h.extension._overlayLabel.style, /#b91c1c/);
    assert.equal(h.sounds.length, 0);
    assert.equal(files.has(notificationPath), false);
    h.extension.disable();
});

test('Copilot completion notification opens the text-only card and dismisses cleanly', () => {
    const files = new Map();
    const h = harness(files);
    const notificationPath = '/run/user/1000/voice-to-terminal/copilot-notifications/0001-ready.json';
    const message = '¡Listo! Avancé con speech-to-text.\nRevisa mi respuesta.';
    files.set(notificationPath, JSON.stringify({
        sessionId: 'session-a',
        title: 'Copilot listo',
        message,
        createdAt: Date.now() / 1000,
    }));

    const poll = h.timers.get(h.extension._copilotNotificationTimer);
    poll();

    assert.ok(h.extension._overlay);
    assert.equal(h.extension._overlayLabel.text, 'Copilot listo');
    assert.equal(h.extension._caption.text, message);
    assert.equal(h.extension._caption.visible, true);
    assert.equal(h.extension._robotAvatar, undefined);
    assert.equal(h.extension._overlay.children.length, 3);
    assert.equal(h.extension._floatingVisibilityButton.visible, false);
    assert.equal(h.extension._actionButton.visible, false);
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
    assert.equal(h.extension._robotAvatar, undefined);
    assert.equal(h.extension._actionIcon.icon_size, 24);
    assert.equal(h.extension._phase, 'idle');
    assert.equal(h.extension._overlayLabel.text, 'Listo para dictar');
    assert.equal(h.extension._overlayLabel.visible, true);
    assert.equal(h.extension._dotsBox.visible, false);
    assert.equal(h.extension._meterBox.visible, false);
    assert.equal(h.extension._actionIcon.gicon.file.path,
        '/home/test/.local/share/gnome-shell/extensions/voice-to-terminal@migue.local/microphone.svg');
    assert.equal(h.extension._actionButton.child, h.extension._actionIcon);
    assert.equal(h.extension._overlay.children.length, 3);
    assert.equal(h.extension._overlay.children[0].x_expand, true);
    assert.equal(h.extension._overlay.children[0].y_align, 0);
    assert.equal(h.extension._overlay.children[1], h.extension._floatingVisibilityButton);
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
    h.extension.disable();
    assert.equal(h.timers.size, 0);
    assert.equal(h.calls.at(-1)[0], '--cancel');
});
