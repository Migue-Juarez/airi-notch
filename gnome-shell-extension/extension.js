import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { PopupAnimation } from 'resource:///org/gnome/shell/ui/boxpointer.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const LABELS = {
    starting: 'Iniciando',
    recording: 'Grabando',
    transcribing: 'Transcribiendo',
    complete: 'Mensaje listo',
};

const ACTIONS = {
    idle: 'Iniciar dictado',
    starting: 'Iniciando...',
    recording: 'Detener y transcribir',
    stopping: 'Transcribiendo...',
    complete: 'Iniciar dictado',
};

const ROBOT_ASSETS = {
    idle: 'robot-idle.png',
    idleOpen: 'robot-idle-open.png',
    listening: 'robot-listening.png',
    processing: 'robot-processing.png',
    success: 'robot-success.png',
    attention: 'robot-idle-open.png',
};
const ROBOT_POSE_ASSETS = {
    front: 'robot-frente-vacio.png',
    threeQuarter: 'robot-34-vacio.png',
};
const ROBOT_MOOD_BY_PHASE = {
    idle: 'idle',
    starting: 'processing',
    recording: 'listening',
    stopping: 'processing',
    complete: 'success',
};
const ROBOT_HOP_DIRECTION_BY_PHASE = {
    starting: 1,
    stopping: -1,
    complete: 1,
};
const ROBOT_HOP_DIRECTION_BY_COPILOT_STATUS = {
    working: -1,
    attention: 1,
    ready: 1,
    error: -1,
};
const PANEL_BUTTON_STYLE = 'background-color: transparent; border: 0; padding: 0; border-radius: 999px; transition-duration: 150ms;';
const PANEL_BUTTON_HOVER_STYLE = 'background-color: rgba(255,255,255,0.12); border: 0; padding: 0; border-radius: 999px; transition-duration: 150ms;';
const FLOATING_BUTTON_SIZE = 112;
const FLOATING_CARD_OVERLAP_PX = 36;
const FLOATING_POSE_CROSSFADE_MS = 180;
const FLOATING_BLINK_INTERVAL_MS = 4500;
const FLOATING_BLINK_DURATION_MS = 130;
const FLOATING_SACCADE_INTERVAL_MS = 1100;
const FLOATING_SACCADE_DURATION_MS = 90;
const COPILOT_SHIMMER_STEP_MS = 240;
const COPILOT_CARD_RESIZE_DURATION_MS = 380;
const COPILOT_SHIMMER_COLORS = ['#334155', '#64748b', '#cbd5e1', '#64748b'];
const COPILOT_NOTIFICATION_DURATION_MS = 5000;
const COPILOT_NOTIFICATION_MAX_AGE_SECONDS = 120;
const COPILOT_NOTIFICATION_COLORS = {
    working: '#0f766e',
    attention: '#0f766e',
    error: '#b91c1c',
    ready: '#059669',
};
const COPILOT_STATUS_LABELS = {
    working: 'Copilot trabajando',
};
const FLOATING_BUTTON_STYLE = 'background-color: transparent; border: 0; outline: none; border-radius: 0; padding: 0; box-shadow: none;';
const FLOATING_EYE_STYLE = 'background-color: #34d399; border: 1px solid rgba(167,243,208,0.72); border-radius: 2px; box-shadow: 0 0 4px rgba(209,250,229,0.9), 0 0 12px rgba(16,185,129,0.95), inset 0 0 2px rgba(236,253,245,0.85);';
const IDLE_OVERLAY_STYLE = 'spacing: 16px; padding: 16px 20px; min-width: 0px; background-color: rgba(249,250,251,0.98); border: 1px solid rgba(203,213,225,0.94); border-radius: 24px; box-shadow: 0 10px 32px rgba(15,23,42,0.22);';
const OVERLAY_STYLE = 'spacing: 16px; padding: 16px 20px; min-width: 400px; background-color: rgba(249,250,251,0.98); border: 1px solid rgba(203,213,225,0.94); border-radius: 24px; box-shadow: 0 10px 32px rgba(15,23,42,0.22);';
const RECORDING_OVERLAY_STYLE = 'spacing: 16px; padding: 16px 20px; min-width: 400px; background-color: rgba(240,253,247,0.99); border: 1px solid rgba(16,185,129,0.72); border-radius: 24px; box-shadow: 0 10px 32px rgba(15,23,42,0.2);';
const NOTIFICATION_OVERLAY_STYLE = 'spacing: 16px; padding: 16px 20px; min-width: 400px; background-color: rgba(249,250,251,0.99); border: 1px solid rgba(16,185,129,0.76); border-radius: 24px; box-shadow: 0 10px 32px rgba(15,23,42,0.22);';

export default class VoiceToTerminalExtension extends Extension {
    enable() {
        this._phase = 'starting';
        this._disposed = false;
        this._lifecycle = (this._lifecycle ?? 0) + 1;
        this._panelHovered = false;
        this._floatingHovered = false;
        this._floatingDrag = null;
        this._suppressFloatingClick = false;
        this._floatingClickResetTimer = 0;
        this._overlayHovered = false;
        this._overlayHideTimer = 0;
        this._floatingBlinkTimer = 0;
        this._floatingBlinkRestoreTimer = 0;
        this._floatingSaccadeTimer = 0;
        this._floatingSaccadeRestoreTimer = 0;
        this._floatingEyesSquinting = false;
        this._copilotShimmerTimer = 0;
        this._copilotShimmerIndex = 0;
        this._robotHopSequence = 0;
        this._floatingSaccadeDirection = 1;
        this._robotMood = null;
        this._floatingPose = null;
        this._copilotNotificationTimer = 0;
        this._copilotDismissTimer = 0;
        this._copilotNotification = null;
        this._copilotStatusBySession = new Map();
        this._copilotNotificationErrorNotified = false;
        this._meterTimer = 0;
        this._resultDismissTimer = 0;
        this._resultText = '';
        this._meterErrorNotified = false;
        this._targetWindow = null;
        this._command = GLib.build_filenamev([GLib.get_home_dir(), '.local', 'bin', 'voice-to-terminal']);
        const runtimeDir = GLib.getenv('XDG_RUNTIME_DIR');
        this._meterPath = runtimeDir
            ? GLib.build_filenamev([runtimeDir, 'voice-to-terminal', 'recording.level'])
            : GLib.build_filenamev([GLib.get_home_dir(), '.cache', 'voice-to-terminal', 'runtime', 'recording.level']);
        this._copilotNotificationDirectory = runtimeDir
            ? GLib.build_filenamev([runtimeDir, 'voice-to-terminal', 'copilot-notifications'])
            : null;
        this._robotMoodPaths = {};
        this._robotMoodIcons = {};
        for (const [mood, filename] of Object.entries(ROBOT_ASSETS)) {
            const path = GLib.build_filenamev([
                GLib.get_user_data_dir(), 'gnome-shell', 'extensions', this.uuid, filename,
            ]);
            this._robotMoodPaths[mood] = path;
            this._robotMoodIcons[mood] = new Gio.FileIcon({
                file: Gio.File.new_for_path(path),
            });
        }
        this._robotPosePaths = {};
        this._robotPoseIcons = {};
        for (const [pose, filename] of Object.entries(ROBOT_POSE_ASSETS)) {
            const path = GLib.build_filenamev([
                GLib.get_user_data_dir(), 'gnome-shell', 'extensions', this.uuid, filename,
            ]);
            this._robotPosePaths[pose] = path;
            this._robotPoseIcons[pose] = new Gio.FileIcon({
                file: Gio.File.new_for_path(path),
            });
        }
        this._microphoneIconPath = GLib.build_filenamev([
            GLib.get_user_data_dir(), 'gnome-shell', 'extensions', this.uuid, 'microphone.svg',
        ]);
        this._floatingPositionPath = GLib.build_filenamev([
            GLib.get_user_config_dir(), 'voice-to-terminal', 'floating-position.json',
        ]);
        const floatingPreferences = this._loadFloatingPosition();
        this._savedFloatingPosition = floatingPreferences
            ? { x: floatingPreferences.x, y: floatingPreferences.y }
            : null;
        this._floatingRobotVisible = floatingPreferences?.visible ?? true;

        // La ventana destino se fija al iniciar, aunque luego cambie el foco.
        this._focusId = global.display.connect('notify::focus-window', () => {
            const win = global.display.focus_window;
            if (win && win.get_window_type() === 0)
                this._lastWindow = win;
        });
        this._lastWindow = global.display.focus_window;

        this._indicator = new PanelMenu.Button(0.0, 'Airi', true);
        this._indicator.can_focus = false;
        this._indicator.reactive = false;
        this._indicatorIcon = new St.Icon({
            gicon: this._robotMoodIcons.idle,
            style_class: 'system-status-icon',
        });
        this._recordButton = new St.Button({
            can_focus: false,
            reactive: true,
            track_hover: true,
            x_expand: true,
            y_expand: true,
            accessible_name: 'Iniciar dictado local',
            style: PANEL_BUTTON_STYLE,
        });
        this._recordButton.set_child(this._indicatorIcon);
        this._recordButton.accessible_name = 'Mostrar controles de dictado';
        this._recordButton.connect('enter-event', () => {
            this._panelHovered = true;
            this._recordButton.style = PANEL_BUTTON_HOVER_STYLE;
            this._cancelOverlayHide();
            return Clutter.EVENT_PROPAGATE;
        });
        this._recordButton.connect('leave-event', () => {
            this._panelHovered = false;
            this._recordButton.style = PANEL_BUTTON_STYLE;
            this._scheduleOverlayHide();
            return Clutter.EVENT_PROPAGATE;
        });
        this._recordButton.connect('clicked', () => {
            this._toggleControls(this._recordButton);
        });
        this._indicator.add_child(this._recordButton);
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
        if (this._floatingRobotVisible) {
            this._createFloatingRobot();
        }
        this._layoutChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this._positionFloatingRobot();
            if (this._overlay)
                this._positionOverlay();
        });
        this._startCopilotNotificationWatcher();
        this._runBackend(['--cancel'], (success, error) => {
            this._phase = 'idle';
            this._updateOverlay();
            if (!success)
                Main.notifyError('Airi', `No se pudo limpiar la grabación anterior. ${error}`);
        });
    }

    disable() {
        this._disposed = true;
        this._lifecycle++;
        this._stopCopilotShimmer();
        if (this._phase === 'starting' || this._phase === 'recording')
            this._runBackend(['--cancel'], () => {});

        this._cancelOverlayHide();
        this._stopCopilotNotificationWatcher();
        if (this._focusId) {
            global.display.disconnect(this._focusId);
            this._focusId = 0;
        }
        if (this._layoutChangedId) {
            Main.layoutManager.disconnect(this._layoutChangedId);
            this._layoutChangedId = 0;
        }
        this._cancelFloatingClickReset();
        this._hideOverlay();
        this._destroyFloatingRobot();
        this._indicator?.destroy();
        this._indicator = null;
        this._recordButton = null;
        this._targetWindow = null;
        this._lastWindow = null;
    }

    _createFloatingRobot() {
        if (this._floatingButton)
            return;

        this._floatingRobotCanvas = new St.Widget({
            width: FLOATING_BUTTON_SIZE,
            height: FLOATING_BUTTON_SIZE,
            layout_manager: new Clutter.FixedLayout(),
        });
        this._floatingRobotIcons = {
            front: new St.Icon({
                gicon: this._robotPoseIcons.front,
                icon_size: FLOATING_BUTTON_SIZE,
                width: FLOATING_BUTTON_SIZE,
                height: FLOATING_BUTTON_SIZE,
                opacity: 255,
                style: 'icon-shadow: 0 4px 12px rgba(15,23,42,0.4);',
            }),
            threeQuarter: new St.Icon({
                gicon: this._robotPoseIcons.threeQuarter,
                icon_size: FLOATING_BUTTON_SIZE,
                width: FLOATING_BUTTON_SIZE,
                height: FLOATING_BUTTON_SIZE,
                opacity: 0,
                style: 'icon-shadow: 0 4px 12px rgba(15,23,42,0.4);',
            }),
        };
        this._floatingRobotIcon = this._floatingRobotIcons.front;
        this._floatingRobotCanvas.add_child(this._floatingRobotIcons.front);
        this._floatingRobotCanvas.add_child(this._floatingRobotIcons.threeQuarter);
        this._floatingEyes = [
            new St.Widget({
                width: 16,
                height: 12,
                reactive: false,
                style: FLOATING_EYE_STYLE,
            }),
            new St.Widget({
                width: 16,
                height: 12,
                reactive: false,
                style: FLOATING_EYE_STYLE,
            }),
        ];
        for (const eye of this._floatingEyes)
            this._floatingRobotCanvas.add_child(eye);
        this._floatingButton = new St.Button({
            can_focus: true,
            reactive: true,
            track_hover: true,
            width: FLOATING_BUTTON_SIZE,
            height: FLOATING_BUTTON_SIZE,
            accessible_name: 'Abrir controles de dictado',
            style: FLOATING_BUTTON_STYLE,
        });
        this._floatingButton.set_child(this._floatingRobotCanvas);
        this._setFloatingPose('front', false);
        this._floatingButton.connect('enter-event', () => {
            this._floatingHovered = true;
            this._cancelOverlayHide();
            this._updateFloatingRobot();
            return Clutter.EVENT_PROPAGATE;
        });
        this._floatingButton.connect('leave-event', () => {
            this._floatingHovered = false;
            this._updateFloatingRobot();
            this._scheduleOverlayHide();
            return Clutter.EVENT_PROPAGATE;
        });
        this._floatingButton.connect('button-press-event', (_actor, event) => {
            if (event.get_button() !== Clutter.BUTTON_PRIMARY)
                return Clutter.EVENT_PROPAGATE;
            const [pointerX, pointerY] = event.get_coords();
            this._floatingDrag = {
                pointerX,
                pointerY,
                x: this._floatingButton.x,
                y: this._floatingButton.y,
                moved: false,
            };
            return Clutter.EVENT_PROPAGATE;
        });
        this._floatingButton.connect('motion-event', (_actor, event) => {
            if (!this._floatingDrag)
                return Clutter.EVENT_PROPAGATE;
            const [pointerX, pointerY] = event.get_coords();
            const deltaX = pointerX - this._floatingDrag.pointerX;
            const deltaY = pointerY - this._floatingDrag.pointerY;
            if (!this._floatingDrag.moved && Math.hypot(deltaX, deltaY) < 6)
                return Clutter.EVENT_PROPAGATE;

            this._floatingDrag.moved = true;
            this._suppressFloatingClick = true;
            const position = this._clampFloatingPosition(
                this._floatingDrag.x + deltaX,
                this._floatingDrag.y + deltaY,
            );
            this._floatingButton.set_position(position.x, position.y);
            if (this._overlay)
                this._positionOverlay();
            return Clutter.EVENT_STOP;
        });
        this._floatingButton.connect('button-release-event', () => {
            if (!this._floatingDrag)
                return Clutter.EVENT_PROPAGATE;
            const moved = this._floatingDrag.moved;
            this._floatingDrag = null;
            if (!moved)
                return Clutter.EVENT_PROPAGATE;

            this._floatingButton.opacity = 255;
            this._saveFloatingPosition();
            this._floatingClickResetTimer = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._floatingClickResetTimer = 0;
                this._suppressFloatingClick = false;
                return GLib.SOURCE_REMOVE;
            });
            return Clutter.EVENT_PROPAGATE;
        });
        this._floatingButton.connect('clicked', () => {
            if (this._suppressFloatingClick) {
                this._suppressFloatingClick = false;
                return;
            }
            this._toggleControls(this._floatingButton);
        });
        Main.layoutManager.addTopChrome(this._floatingButton, { affectsStruts: false });
        this._positionFloatingRobot();
        this._updateFloatingRobot();
    }

    _destroyFloatingRobot() {
        this._stopFloatingBlink();
        this._stopFloatingSaccades();
        if (this._floatingButton) {
            Main.layoutManager.removeChrome(this._floatingButton);
            this._floatingButton.destroy();
            this._floatingButton = null;
            this._floatingRobotCanvas = null;
            this._floatingRobotIcon = null;
            this._floatingRobotIcons = null;
            this._floatingEyes = null;
            this._floatingEyeLayout = null;
            this._floatingPose = null;
        }
        this._floatingHovered = false;
        this._floatingDrag = null;
    }

    _positionFloatingRobot() {
        if (!this._floatingButton)
            return;

        const monitor = Main.layoutManager.primaryMonitor;
        const panelHeight = Main.panel.height || 32;
        const x = this._savedFloatingPosition
            ? monitor.x + this._savedFloatingPosition.x
            : monitor.x + 14;
        const y = this._savedFloatingPosition
            ? monitor.y + this._savedFloatingPosition.y
            : monitor.y + panelHeight + 14;
        const position = this._clampFloatingPosition(x, y);
        this._floatingButton.set_position(position.x, position.y);
    }

    _clampFloatingPosition(x, y) {
        const monitor = Main.layoutManager.primaryMonitor;
        const minX = monitor.x;
        const maxX = Math.max(minX, monitor.x + monitor.width - FLOATING_BUTTON_SIZE);
        const minY = monitor.y + (Main.panel.height || 32);
        const maxY = Math.max(minY, monitor.y + monitor.height - FLOATING_BUTTON_SIZE);
        return {
            x: Math.min(Math.max(x, minX), maxX),
            y: Math.min(Math.max(y, minY), maxY),
        };
    }

    _loadFloatingPosition() {
        const file = Gio.File.new_for_path(this._floatingPositionPath);
        if (!file.query_exists(null))
            return null;

        try {
            const [success, contents] = file.load_contents(null);
            if (!success)
                throw new Error('No se pudo leer el archivo de posición.');
            const position = JSON.parse(new TextDecoder().decode(contents));
            if (!Number.isFinite(position.x) || !Number.isFinite(position.y)
                || position.x < 0 || position.y < 0)
                throw new Error('La posición guardada del robot no es válida.');
            return {
                x: position.x,
                y: position.y,
                visible: position.visible !== false,
            };
        } catch (error) {
            logError(error, 'Airi: no se pudo cargar la posición del robot');
            Main.notifyError('Airi', 'No se pudo cargar la posición del robot; se usará la ubicación predeterminada.');
            return null;
        }
    }

    _saveFloatingPosition() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (this._floatingButton) {
            this._savedFloatingPosition = {
                x: this._floatingButton.x - monitor.x,
                y: this._floatingButton.y - monitor.y,
            };
        }
        if (!this._savedFloatingPosition) {
            this._savedFloatingPosition = {
                x: 14,
                y: (Main.panel.height || 32) + 14,
            };
        }

        try {
            const directoryPath = GLib.build_filenamev([
                GLib.get_user_config_dir(), 'voice-to-terminal',
            ]);
            const directory = Gio.File.new_for_path(directoryPath);
            if (!directory.query_exists(null))
                directory.make_directory_with_parents(null);
            const contents = new TextEncoder().encode(`${JSON.stringify({
                ...this._savedFloatingPosition,
                visible: this._floatingRobotVisible,
            })}\n`);
            const [success] = Gio.File.new_for_path(this._floatingPositionPath).replace_contents(
                contents,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null,
            );
            if (!success)
                throw new Error('No se pudo guardar la posición del robot.');
        } catch (error) {
            logError(error, 'Airi: no se pudo guardar la posición del robot');
            Main.notifyError('Airi', 'No se pudo guardar la posición del robot.');
        }
    }

    _cancelFloatingClickReset() {
        if (this._floatingClickResetTimer) {
            GLib.source_remove(this._floatingClickResetTimer);
            this._floatingClickResetTimer = 0;
        }
        this._suppressFloatingClick = false;
    }

    _toggleFloatingRobotVisibility() {
        if (this._disposed)
            return;

        const showRobot = !this._floatingRobotVisible;
        try {
            this._floatingRobotVisible = showRobot;
            if (showRobot) {
                this._createFloatingRobot();
            } else {
                if (this._overlay && this._overlayAnchor === this._floatingButton) {
                    this._overlayAnchor = this._recordButton;
                    this._positionOverlay();
                }
                this._saveFloatingPosition();
                this._destroyFloatingRobot();
            }
            if (showRobot)
                this._saveFloatingPosition();
            this._updateOverlay();
        } catch (error) {
            this._floatingRobotVisible = !showRobot;
            logError(error, 'Airi: no se pudo cambiar la visibilidad del robot');
            Main.notifyError('Airi', `No se pudo cambiar la visibilidad del robot. ${error.message}`);
        }
    }

    _ensureFloatingBlink() {
        if (this._disposed || this._robotMood !== 'idle' || this._phase !== 'idle'
            || !this._floatingEyes?.length || this._floatingBlinkTimer
            || this._floatingBlinkRestoreTimer)
            return;

        this._floatingBlinkTimer = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            FLOATING_BLINK_INTERVAL_MS,
            () => {
                this._floatingBlinkTimer = 0;
                if (this._disposed || this._robotMood !== 'idle'
                    || this._phase !== 'idle' || !this._floatingEyes?.length)
                    return GLib.SOURCE_REMOVE;

                for (const eye of this._floatingEyes) {
                    eye.ease({
                        scale_y: 0.12,
                        duration: 55,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                }
                this._floatingBlinkRestoreTimer = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    FLOATING_BLINK_DURATION_MS,
                    () => {
                        this._floatingBlinkRestoreTimer = 0;
                        if (this._disposed || this._robotMood !== 'idle'
                            || this._phase !== 'idle' || !this._floatingEyes?.length)
                            return GLib.SOURCE_REMOVE;

                        for (const eye of this._floatingEyes) {
                            eye.ease({
                                scale_y: 1,
                                duration: 75,
                                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                            });
                        }
                        this._ensureFloatingBlink();
                        return GLib.SOURCE_REMOVE;
                    },
                );
                return GLib.SOURCE_REMOVE;
            },
        );
    }

    _stopFloatingBlink() {
        if (this._floatingBlinkTimer) {
            GLib.source_remove(this._floatingBlinkTimer);
            this._floatingBlinkTimer = 0;
        }
        if (this._floatingBlinkRestoreTimer) {
            GLib.source_remove(this._floatingBlinkRestoreTimer);
            this._floatingBlinkRestoreTimer = 0;
        }
        for (const eye of this._floatingEyes ?? [])
            eye.scale_y = 1;
    }

    _positionFloatingEyes(offset = 0, animate = false) {
        if (!this._floatingEyes || !this._floatingEyeLayout)
            return;

        this._floatingEyes.forEach((eye, index) => {
            const layout = this._floatingEyeLayout[index];
            const target = {
                x: layout.x + offset,
                y: layout.y,
                width: layout.width,
                height: layout.height,
                scale_x: layout.scaleX ?? 1,
                rotation_angle_z: layout.rotation ?? 0,
            };
            eye.remove_all_transitions();
            if (animate) {
                eye.ease({
                    ...target,
                    duration: FLOATING_POSE_CROSSFADE_MS,
                    mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
                });
            } else {
                eye.set_position(target.x, target.y);
                eye.width = target.width;
                eye.height = target.height;
                eye.scale_x = target.scale_x;
                eye.rotation_angle_z = target.rotation_angle_z;
            }
        });
    }

    _setFloatingEyeOffset(offset) {
        if (!this._floatingEyes || !this._floatingEyeLayout)
            return;

        this._floatingEyes.forEach((eye, index) => {
            const layout = this._floatingEyeLayout[index];
            eye.ease({
                x: layout.x + offset,
                duration: 65,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        });
    }

    _ensureFloatingSaccades() {
        const copilotWorking = this._phase === 'idle'
            && Boolean(this._overlay)
            && this._getCopilotStatus() === 'working';
        if (this._disposed || !copilotWorking || !this._floatingEyes?.length
            || this._floatingSaccadeTimer) {
            if ((this._disposed || !copilotWorking) && this._floatingSaccadeTimer)
                this._stopFloatingSaccades();
            return;
        }

        this._floatingSaccadeTimer = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            FLOATING_SACCADE_INTERVAL_MS,
            () => {
                if (this._disposed || this._phase !== 'idle' || !this._overlay
                    || this._getCopilotStatus() !== 'working' || !this._floatingEyes?.length) {
                    this._floatingSaccadeTimer = 0;
                    this._stopFloatingSaccades();
                    return GLib.SOURCE_REMOVE;
                }

                this._setFloatingEyeOffset(this._floatingSaccadeDirection * 2);
                this._floatingSaccadeDirection *= -1;
                if (this._floatingSaccadeRestoreTimer)
                    GLib.source_remove(this._floatingSaccadeRestoreTimer);
                this._floatingSaccadeRestoreTimer = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    FLOATING_SACCADE_DURATION_MS,
                    () => {
                        this._floatingSaccadeRestoreTimer = 0;
                        this._setFloatingEyeOffset(0);
                        return GLib.SOURCE_REMOVE;
                    },
                );
                return GLib.SOURCE_CONTINUE;
            },
        );
    }

    _stopFloatingSaccades() {
        if (this._floatingSaccadeTimer) {
            GLib.source_remove(this._floatingSaccadeTimer);
            this._floatingSaccadeTimer = 0;
        }
        if (this._floatingSaccadeRestoreTimer) {
            GLib.source_remove(this._floatingSaccadeRestoreTimer);
            this._floatingSaccadeRestoreTimer = 0;
        }
        this._setFloatingEyeOffset(0);
    }

    _setFloatingPose(pose, animate = true) {
        if (!this._floatingRobotIcons || !this._floatingRobotCanvas)
            return;

        const shouldSquint = pose === 'threeQuarter'
            && Boolean(this._overlay)
            && this._phase === 'idle'
            && this._getCopilotStatus() === 'working';
        const poseChanged = this._floatingPose !== pose;
        const squintChanged = this._floatingEyesSquinting !== shouldSquint;
        this._floatingEyeLayout = pose === 'front'
            ? [
                { x: 35, y: 52, width: 16, height: 12 },
                { x: 61, y: 52, width: 16, height: 12 },
            ]
            : [
                { x: 66, y: 54, width: 10, height: 12, rotation: -12 },
                { x: 80, y: 51, width: 8, height: 11, scaleX: 0.7, rotation: -12 },
            ];
        if (!poseChanged && !squintChanged)
            return;

        if (poseChanged) {
            this._floatingPose = pose;
            this._floatingRobotIcon = this._floatingRobotIcons[pose];
            this._positionFloatingEyes(0, animate);
            for (const [iconPose, icon] of Object.entries(this._floatingRobotIcons)) {
                const opacity = iconPose === pose ? 255 : 0;
                icon.remove_all_transitions();
                if (animate) {
                    icon.ease({
                        opacity,
                        duration: FLOATING_POSE_CROSSFADE_MS,
                        mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
                    });
                } else {
                    icon.opacity = opacity;
                }
            }
            this._floatingRobotCanvas.opacity = 255;
        }

        if (squintChanged) {
            this._floatingEyesSquinting = shouldSquint;
            this._floatingEyes?.forEach(eye => {
                eye.ease({
                    scale_y: shouldSquint ? 0.68 : 1,
                    duration: FLOATING_POSE_CROSSFADE_MS,
                    mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
                });
            });
        }
    }

    _setRobotMood() {
        const copilotStatus = this._getCopilotStatus();
        let mood = ROBOT_MOOD_BY_PHASE[this._phase] ?? 'idle';
        if (this._phase === 'idle') {
            if (copilotStatus === 'ready')
                mood = 'success';
            else if (copilotStatus === 'attention')
                mood = 'attention';
            else if (copilotStatus === 'working')
                mood = 'processing';
        }
        if (this._robotMood === mood) {
            this._ensureFloatingBlink();
            this._ensureFloatingSaccades();
            return;
        }

        this._robotMood = mood;
        const face = this._robotMoodIcons[mood];
        if (this._indicatorIcon)
            this._indicatorIcon.gicon = face;
        if (mood === 'idle')
            this._ensureFloatingBlink();
        else
            this._stopFloatingBlink();
        if (mood === 'processing')
            this._ensureFloatingSaccades();
        else
            this._stopFloatingSaccades();
    }

    _getCopilotStatusRecord(status = null) {
        const priority = status ? [status] : ['attention', 'working', 'error', 'ready'];
        for (const currentStatus of priority) {
            let latest = null;
            for (const record of this._copilotStatusBySession.values()) {
                if (record.status === currentStatus
                    && (!latest || record.createdAt > latest.createdAt))
                    latest = record;
            }
            if (latest)
                return latest;
        }
        return null;
    }

    _getPendingCopilotAttentionRecord() {
        let latest = null;
        for (const record of this._copilotStatusBySession.values()) {
            if (record.status === 'attention'
                && (!latest || record.createdAt > latest.createdAt))
                latest = record;
        }
        return latest;
    }

    _getCopilotStatus() {
        return this._getCopilotStatusRecord()?.status ?? 'idle';
    }

    _getRecentCopilotNotification() {
        const candidates = ['error', 'ready']
            .map(status => this._getCopilotStatusRecord(status))
            .filter(Boolean)
            .sort((left, right) => right.createdAt - left.createdAt);
        const notification = candidates[0];
        if (!notification)
            return null;

        const age = GLib.get_real_time() / 1_000_000 - notification.createdAt;
        if (age < -5 || age > COPILOT_NOTIFICATION_DURATION_MS / 1000) {
            this._copilotStatusBySession.delete(notification.sessionId);
            return null;
        }
        return notification;
    }

    _updateFloatingRobot() {
        this._setRobotMood();
        if (!this._floatingButton)
            return;

        let accessibleName = 'Abrir controles de dictado';
        const copilotState = this._getCopilotStatusRecord();
        const copilotStatus = copilotState?.status ?? 'idle';
        const project = copilotState?.project ? ` en ${copilotState.project}` : '';
        if (this._phase === 'idle' && copilotStatus === 'ready') {
            accessibleName = 'Copilot terminó; mostrar mensaje listo';
        } else if (this._phase === 'idle' && copilotStatus === 'attention') {
            accessibleName = `Copilot necesita atención${project}`;
        } else if (this._phase === 'idle' && copilotStatus === 'error') {
            accessibleName = `Copilot informó un error${project}`;
        } else if (this._phase === 'idle' && copilotStatus === 'working') {
            accessibleName = `Copilot trabajando${project}`;
        } else if (this._phase === 'recording') {
            accessibleName = 'Grabando; mostrar controles de dictado';
        } else if (this._phase === 'complete') {
            accessibleName = 'Mensaje listo; mostrar resultado del dictado';
        } else if (this._phase === 'starting') {
            accessibleName = 'Iniciando dictado';
        } else if (this._phase === 'stopping') {
            accessibleName = 'Transcribiendo dictado';
        }
        this._floatingButton.style = FLOATING_BUTTON_STYLE;
        this._floatingButton.accessible_name = accessibleName;
        const activePose = Boolean(this._overlay);
        this._setFloatingPose(activePose ? 'threeQuarter' : 'front');
        if (this._phase !== 'idle' && this._phase !== 'complete') {
            this._floatingRobotCanvas.opacity = 255;
            this._floatingRobotCanvas.scale_x = 1;
            this._floatingRobotCanvas.scale_y = 1;
            this._floatingRobotCanvas.translation_y = 0;
        }
    }

    _toggleControls(anchor = this._floatingButton) {
        if (this._disposed)
            return;
        if ((this._phase === 'idle' || this._phase === 'complete') && this._overlay) {
            this._hideOverlay();
            return;
        }
        this._showControls(anchor);
    }

    _toggleRecording() {
        if (this._disposed || this._phase === 'starting' || this._phase === 'stopping')
            return;

        if (this._phase === 'idle' || this._phase === 'complete')
            this._startRecording();
        else if (this._phase === 'recording')
            this._stopRecording();
    }

    _startRecording() {
        this._stopTimers();
        this._clearCopilotNotification();
        this._resultText = '';
        const focusedWindow = global.display.focus_window;
        this._targetWindow = focusedWindow?.get_window_type() === 0
            ? focusedWindow
            : this._lastWindow;
        this._phase = 'starting';
        this._animateRobotHop(ROBOT_HOP_DIRECTION_BY_PHASE.starting);
        this._updatePanelIcon();
        this._updateOverlay();
        this._animate();
        this._runBackend(['--start'], (success, error) => {
            if (this._disposed)
                return;

            if (!success) {
                this._phase = 'idle';
                this._stopTimers();
                this._updatePanelIcon();
                this._updateOverlay();
                this._scheduleOverlayHide();
                Main.notifyError('Airi', `No se pudo iniciar la grabación. ${error}`);
                return;
            }

            this._phase = 'recording';
            try {
                this._stopDotsTimer();
                this._showOverlay();
                this._updatePanelIcon();
                this._updateOverlay();
                this._startMeter();
            } catch (error) {
                this._phase = 'stopping';
                this._hideOverlay();
                this._runBackend(['--cancel'], () => {
                    this._phase = 'idle';
                    this._updatePanelIcon();
                    Main.notifyError('Airi', `No se pudo mostrar el control de grabación. ${error.message}`);
                });
            }
        });
    }

    _stopRecording() {
        if (this._phase !== 'recording' || this._disposed)
            return;

        this._stopMeter();
        this._phase = 'stopping';
        this._animateRobotHop(ROBOT_HOP_DIRECTION_BY_PHASE.stopping);
        this._updateOverlay();
        this._restoreTargetFocus();
        // Detener el micrófono no debe depender de que funcione la animación.
        this._runBackend(['--stop'], (success, error, transcript) => {
            if (this._disposed)
                return;

            this._updatePanelIcon();
            this._stopTimers();
            if (!success || !transcript.trim()) {
                this._phase = 'idle';
                this._resultText = '';
                this._updateOverlay();
                this._scheduleOverlayHide();
                Main.notifyError('Airi', success
                    ? 'El dictado terminó, pero no se recibió el texto transcripto.'
                    : `Falló el dictado. ${error}`);
                return;
            }

            this._phase = 'complete';
            this._resultText = transcript.trim();
            this._animateRobotHop(ROBOT_HOP_DIRECTION_BY_PHASE.complete);
            this._updateOverlay();
            this._animateResultImpact();
            this._scheduleResultDismiss();
        });
        if (this._phase === 'stopping') {
            try {
                this._updatePanelIcon();
                this._animate();
            } catch (error) {
                logError(error, 'Airi: no se pudo actualizar la animación');
                this._hideOverlay();
            }
        }
    }

    _animateResultImpact() {
        const overlay = this._overlay;
        if (!overlay)
            return;

        overlay.ease({
            translation_x: 4,
            duration: 60,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (this._overlay !== overlay || this._disposed)
                    return;
                overlay.ease({
                    translation_x: -1,
                    duration: 45,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onComplete: () => {
                        if (this._overlay !== overlay || this._disposed)
                            return;
                        overlay.ease({
                            translation_x: 0,
                            duration: 60,
                            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                        });
                    },
                });
            },
        });
    }

    _animateRobotHop(direction) {
        const robot = this._floatingRobotCanvas;
        if (!robot || !this._floatingRobotVisible || this._disposed)
            return;

        const sequence = ++this._robotHopSequence;
        const isCurrent = () => sequence === this._robotHopSequence
            && this._floatingRobotCanvas === robot && !this._disposed;
        robot.ease({
            translation_x: direction * 4,
            duration: 60,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (!isCurrent())
                    return;
                robot.ease({
                    translation_x: direction * -1,
                    duration: 45,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onComplete: () => {
                        if (!isCurrent())
                            return;
                        robot.ease({
                            translation_x: 0,
                            duration: 60,
                            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                        });
                    },
                });
            },
        });
    }

    _restoreTargetFocus() {
        try {
            // Activar una ventana no libera el grab modal de los ajustes rápidos.
            Main.panel.statusArea.quickSettings?.menu.close(PopupAnimation.NONE);
            this._targetWindow?.activate(global.get_current_time());
        } catch (error) {
            logError(error, 'Airi: no se pudo restaurar el foco');
            this._targetWindow = null;
        }
    }

    _runBackend(args, callback) {
        const lifecycle = this._lifecycle;
        const complete = (success, error, output = '') => {
            if (!this._disposed && lifecycle === this._lifecycle)
                callback(success, error, output);
        };
        let process;
        try {
            const launcher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
            });
            launcher.setenv('VOICE_TO_TERMINAL_QUIET', '1', true);
            if (args[0] === '--stop')
                launcher.setenv('VOICE_TO_TERMINAL_RETURN_TEXT', '1', true);
            process = launcher.spawnv([this._command, ...args]);
        } catch (error) {
            complete(false, error.message);
            return;
        }

        process.communicate_utf8_async(null, null, (subprocess, result) => {
            let stdout = '';
            let stderr = '';
            try {
                [, stdout, stderr] = subprocess.communicate_utf8_finish(result);
            } catch (error) {
                complete(false, error.message);
                return;
            }

            if (subprocess.get_successful())
                complete(true, '', stdout ?? '');
            else
                complete(false, (stderr ?? '').trim().split('\n').pop() || 'El proceso terminó inesperadamente.');
        });
    }

    _updatePanelIcon() {
        if (!this._indicatorIcon)
            return;

        this._recordButton.accessible_name = 'Mostrar controles de dictado';
        this._indicatorIcon.remove_all_transitions();
        this._indicatorIcon.opacity = 255;
        this._updateFloatingRobot();
    }

    _showOverlay(anchor = this._floatingButton) {
        if (this._overlay)
            return;

        this._overlayAnchor = anchor;
        const box = new St.BoxLayout({
            reactive: true,
            track_hover: true,
            style: OVERLAY_STYLE,
        });
        const statusBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'spacing: 3px; padding-left: 24px;',
        });
        const statusRow = new St.BoxLayout({ style: 'spacing: 10px;' });
        this._dotsBox = new St.BoxLayout({ style: 'spacing: 5px;', visible: false });
        const dotColors = ['#10b981', '#34d399', '#047857'];
        const dotSizes = [8, 12, 8];
        this._dots = dotColors.map((color, index) => {
            const dot = new St.Widget({
                y_align: Clutter.ActorAlign.CENTER,
                style: `background-color: ${color}; width: ${dotSizes[index]}px; height: ${dotSizes[index]}px; border-radius: 999px;`,
            });
            this._dotsBox.add_child(dot);
            return dot;
        });
        this._meterBox = new St.BoxLayout({ style: 'spacing: 3px;', visible: false });
        const meterHeights = [10, 16, 24, 16, 10];
        this._meterBars = meterHeights.map(height => {
            const bar = new St.Widget({
                y_align: Clutter.ActorAlign.CENTER,
                style: `background-color: #10b981; width: 4px; height: ${height}px; border-radius: 999px;`,
            });
            this._meterBox.add_child(bar);
            return bar;
        });
        this._overlayLabel = new St.Label({
            text: LABELS[this._phase] ?? '',
            visible: true,
            style: 'color: #334155; font-size: 15pt; font-weight: 700;',
        });
        statusRow.add_child(this._overlayLabel);
        statusRow.add_child(this._dotsBox);
        statusRow.add_child(this._meterBox);
        this._sessionStatusLabel = new St.Label({
            text: '',
            visible: false,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'max-width: 200px; color: rgba(71,85,105,0.86); font-size: 9pt;',
        });
        this._sessionStatusLabel.clutter_text.line_wrap = false;
        this._sessionStatusLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._caption = new St.Label({
            text: '',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'color: rgba(71,85,105,0.86); font-size: 11pt;',
        });
        this._caption.clutter_text.line_wrap = true;
        statusBox.add_child(statusRow);
        statusBox.add_child(this._sessionStatusLabel);
        statusBox.add_child(this._caption);
        box.add_child(statusBox);
        this._actionIcon = new St.Icon({
            gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(this._microphoneIconPath) }),
            icon_size: 24,
        });
        this._stopIcon = new St.Icon({
            icon_name: 'media-playback-stop-symbolic',
            icon_size: 22,
        });
        this._hideFloatingIcon = new St.Icon({
            icon_name: 'view-conceal-symbolic',
            icon_size: 18,
        });
        this._showFloatingIcon = new St.Icon({
            icon_name: 'view-reveal-symbolic',
            icon_size: 18,
        });
        this._floatingVisibilityButton = new St.Button({
            can_focus: true,
            reactive: true,
            track_hover: true,
            accessible_name: this._floatingRobotVisible
                ? 'Ocultar robot flotante'
                : 'Mostrar robot flotante',
            style: 'color: #047857; background-color: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.3); border-radius: 999px; padding: 11px;',
        });
        this._floatingVisibilityButton.set_child(
            this._floatingRobotVisible ? this._hideFloatingIcon : this._showFloatingIcon,
        );
        this._displayedVisibilityIcon = this._floatingRobotVisible
            ? this._hideFloatingIcon
            : this._showFloatingIcon;
        this._floatingVisibilityButton.connect('clicked', () => this._toggleFloatingRobotVisibility());
        this._actionButton = new St.Button({
            can_focus: true,
            reactive: true,
            track_hover: true,
            accessible_name: ACTIONS[this._phase] ?? ACTIONS.idle,
            style: 'background-color: #10b981; border: 1px solid rgba(4,120,87,0.24); border-radius: 999px; padding: 12px; box-shadow: 0 3px 14px rgba(16,185,129,0.24);',
        });
        this._actionButton.set_child(this._actionIcon);
        this._displayedActionIcon = this._actionIcon;
        this._actionButton.connect('clicked', () => this._toggleRecording());
        box.add_child(this._floatingVisibilityButton);
        box.add_child(this._actionButton);
        this._overlay = box;
        this._overlay.connect('enter-event', () => {
            this._overlayHovered = true;
            this._cancelOverlayHide();
            this._cancelResultDismiss();
            this._cancelCopilotDismiss();
            return Clutter.EVENT_PROPAGATE;
        });
        this._overlay.connect('leave-event', () => {
            this._overlayHovered = false;
            if (this._phase === 'complete')
                this._scheduleResultDismiss();
            else if (this._copilotNotification)
                this._scheduleCopilotDismiss();
            else
                this._scheduleOverlayHide();
            return Clutter.EVENT_PROPAGATE;
        });
        Main.layoutManager.addTopChrome(this._overlay, { affectsStruts: false });
        if (this._overlayAnchor === this._floatingButton)
            Main.layoutManager.uiGroup.set_child_above_sibling(
                this._floatingButton,
                this._overlay,
            );
        this._updateOverlay();
        this._positionOverlay(true);
        if (this._phase === 'starting' || this._phase === 'stopping')
            this._animate();
    }

    _showControls(anchor = this._floatingButton) {
        this._cancelOverlayHide();
        try {
            this._showOverlay(anchor);
        } catch (error) {
            this._hideOverlay();
            Main.notifyError('Airi', `No se pudo mostrar el control de dictado. ${error.message}`);
        }
    }

    _positionOverlay(animate = false, springResize = false) {
        const anchor = this._overlayAnchor ?? this._floatingButton;
        if (!anchor)
            return;

        const monitor = Main.layoutManager.primaryMonitor;
        const [anchorX, anchorY] = anchor.get_transformed_position();
        const [anchorWidth, anchorHeight] = anchor.get_transformed_size();
        const [, overlayWidth] = this._overlay.get_preferred_width(-1);
        const [, overlayHeight] = this._overlay.get_preferred_height(overlayWidth);
        const margin = 8;
        const minX = monitor.x + margin;
        const maxX = Math.max(minX, monitor.x + monitor.width - overlayWidth - margin);
        const floatingAnchor = anchor === this._floatingButton;
        let x = floatingAnchor
            ? anchorX + anchorWidth - FLOATING_CARD_OVERLAP_PX
            : anchorX + anchorWidth + margin;
        if (x + overlayWidth > monitor.x + monitor.width - margin) {
            x = floatingAnchor
                ? anchorX - overlayWidth + FLOATING_CARD_OVERLAP_PX
                : anchorX - overlayWidth - margin;
        }
        x = Math.min(Math.max(x, minX), maxX);
        const anchorTop = floatingAnchor
            ? anchorY + (anchorHeight - overlayHeight) / 2
            : anchorY;
        let y = Math.max(anchorTop, monitor.y + (Main.panel.height || 32) + margin);

        if (y + overlayHeight > monitor.y + monitor.height - margin)
            y = Math.max(monitor.y + margin, monitor.y + monitor.height - overlayHeight - margin);

        const hasAllocatedWidth = Number.isFinite(this._overlay.width) && this._overlay.width > 0;
        if (springResize && hasAllocatedWidth) {
            const sizeChanged = Math.abs(this._overlay.width - overlayWidth) > 1
                || Math.abs((this._overlay.height ?? overlayHeight) - overlayHeight) > 1;
            const positionChanged = Math.abs((this._overlay.x ?? x) - x) > 1
                || Math.abs((this._overlay.y ?? y) - y) > 1;
            if (sizeChanged || positionChanged) {
                this._overlay.ease({
                    x,
                    y,
                    width: overlayWidth,
                    height: overlayHeight,
                    duration: COPILOT_CARD_RESIZE_DURATION_MS,
                    mode: Clutter.AnimationMode.EASE_OUT_BACK,
                });
            } else {
                this._overlay.opacity = 255;
            }
        } else if (animate) {
            this._overlay.set_position(x, Math.max(monitor.y + margin, y - 8));
            this._overlay.opacity = 0;
            this._overlay.ease({
                y,
                opacity: 255,
                duration: 160,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            this._overlay.set_position(x, y);
            this._overlay.opacity = 255;
            if (springResize) {
                this._overlay.width = overlayWidth;
                this._overlay.height = overlayHeight;
            }
        }
    }

    _applyCopilotShimmerColor() {
        if (!this._overlayLabel)
            return;

        const color = COPILOT_SHIMMER_COLORS[this._copilotShimmerIndex];
        this._overlayLabel.style = `color: ${color}; font-size: 15pt; font-weight: 700; transition-duration: ${COPILOT_SHIMMER_STEP_MS}ms;`;
    }

    _updateCopilotShimmer(active) {
        if (!active || !this._overlayLabel) {
            this._stopCopilotShimmer();
            return;
        }
        if (this._copilotShimmerTimer) {
            this._applyCopilotShimmerColor();
            return;
        }

        this._copilotShimmerIndex = 0;
        this._applyCopilotShimmerColor();
        this._copilotShimmerTimer = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            COPILOT_SHIMMER_STEP_MS,
            () => {
                if (this._disposed || !this._overlay || !this._overlayLabel
                    || this._phase !== 'idle' || this._copilotNotification
                    || !this._getCopilotStatusRecord('working')) {
                    this._copilotShimmerTimer = 0;
                    return GLib.SOURCE_REMOVE;
                }

                this._copilotShimmerIndex = (this._copilotShimmerIndex + 1)
                    % COPILOT_SHIMMER_COLORS.length;
                this._applyCopilotShimmerColor();
                return GLib.SOURCE_CONTINUE;
            },
        );
    }

    _stopCopilotShimmer() {
        if (this._copilotShimmerTimer) {
            GLib.source_remove(this._copilotShimmerTimer);
            this._copilotShimmerTimer = 0;
        }
        this._copilotShimmerIndex = 0;
    }

    _updateOverlay() {
        this._updateFloatingRobot();
        if (!this._overlay)
            return;

        const copilotNotification = this._phase === 'idle' ? this._copilotNotification : null;
        const status = this._phase === 'stopping' ? 'transcribing' : this._phase;
        const workingSession = this._getCopilotStatusRecord('working');
        const showControls = !copilotNotification;
        const showCaption = this._phase === 'complete' || Boolean(copilotNotification);
        const copilotWorkingVisible = this._phase === 'idle'
            && !copilotNotification
            && Boolean(workingSession);
        this._overlayLabel.text = copilotNotification
            ? copilotNotification.title
            : copilotWorkingVisible
                ? COPILOT_STATUS_LABELS.working
                : LABELS[status] ?? 'Listo para dictar';
        this._overlayLabel.visible = true;
        const visibleCopilotStatus = copilotNotification?.status ?? (workingSession ? 'working' : null);
        const statusColor = visibleCopilotStatus
            ? COPILOT_NOTIFICATION_COLORS[visibleCopilotStatus] ?? '#059669'
            : status === 'recording'
            ? '#047857'
            : status === 'transcribing' ? '#0f766e'
                : status === 'complete' ? '#059669' : '#334155';
        this._overlayLabel.style = `color: ${statusColor}; font-size: 15pt; font-weight: 700;`;
        const workingDetails = workingSession
            ? [workingSession.project, workingSession.taskSummary].filter(Boolean).join(' · ')
            : '';
        this._sessionStatusLabel.text = workingDetails;
        this._sessionStatusLabel.visible = Boolean(workingDetails);
        this._updateCopilotShimmer(copilotWorkingVisible);
        let notificationMessage = copilotNotification?.message ?? '';
        if (copilotNotification?.status === 'attention') {
            const taskContext = copilotNotification.taskSummary
                ? ` · ${copilotNotification.taskSummary}`
                : '';
            notificationMessage = [
                `Proyecto: ${copilotNotification.project || 'tu proyecto'}${taskContext}`,
                copilotNotification.message,
            ].filter(Boolean).join('\n');
        } else if (copilotNotification?.status === 'error' && copilotNotification.project) {
            notificationMessage = `Proyecto: ${copilotNotification.project}\n${notificationMessage}`;
        }
        this._caption.text = copilotNotification
            ? notificationMessage
            : this._phase === 'complete' ? this._resultPreview() : '';
        this._caption.visible = showCaption;
        this._caption.style = this._phase === 'complete' || copilotNotification
            ? 'color: rgba(15,23,42,0.88); font-size: 11pt;'
            : 'color: rgba(71,85,105,0.86); font-size: 11pt;';
        this._floatingVisibilityButton.visible = showControls;
        this._actionButton.visible = showControls;
        this._dotsBox.visible = this._phase === 'starting' || this._phase === 'stopping';
        this._meterBox.visible = this._phase === 'recording';
        const visibilityIcon = this._floatingRobotVisible
            ? this._hideFloatingIcon
            : this._showFloatingIcon;
        if (this._displayedVisibilityIcon !== visibilityIcon) {
            this._floatingVisibilityButton.set_child(visibilityIcon);
            this._displayedVisibilityIcon = visibilityIcon;
        }
        this._floatingVisibilityButton.accessible_name = this._floatingRobotVisible
            ? 'Ocultar robot flotante'
            : 'Mostrar robot flotante';
        this._actionButton.accessible_name = ACTIONS[this._phase] ?? ACTIONS.idle;
        const actionIcon = this._phase === 'recording' ? this._stopIcon : this._actionIcon;
        if (this._displayedActionIcon !== actionIcon) {
            this._actionButton.set_child(actionIcon);
            this._displayedActionIcon = actionIcon;
        }
        this._actionButton.reactive = this._phase === 'idle'
            || this._phase === 'recording'
            || this._phase === 'complete';
        this._overlay.style = copilotNotification
            ? NOTIFICATION_OVERLAY_STYLE
            : this._phase === 'idle'
                ? IDLE_OVERLAY_STYLE
                : this._phase === 'recording' ? RECORDING_OVERLAY_STYLE : OVERLAY_STYLE;
        this._actionButton.style = this._phase === 'recording'
            ? 'background-color: #047857; border: 1px solid rgba(5,150,105,0.5); border-radius: 999px; padding: 12px; box-shadow: 0 3px 14px rgba(16,185,129,0.24);'
            : this._phase === 'starting' || this._phase === 'stopping'
                ? 'background-color: #d1fae5; border: 1px solid rgba(16,185,129,0.24); border-radius: 999px; padding: 12px;'
                : 'background-color: #10b981; border: 1px solid rgba(4,120,87,0.24); border-radius: 999px; padding: 12px; box-shadow: 0 3px 14px rgba(16,185,129,0.24);';

        if (this._phase === 'idle' || this._phase === 'starting' || this._phase === 'complete') {
            this._dots.forEach(dot => {
                dot.opacity = 255;
                dot.scale_x = 1;
                dot.scale_y = 1;
            });
        }
        this._positionOverlay(false, true);
    }

    _resultPreview() {
        const characters = [...this._resultText.replace(/\s+/g, ' ').trim()];
        return characters.length > 52
            ? `${characters.slice(0, 49).join('')}…`
            : characters.join('');
    }

    _startMeter() {
        this._stopMeter();
        this._meterErrorNotified = false;
        this._meterTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            if (this._disposed || this._phase !== 'recording' || !this._meterBars) {
                this._meterTimer = 0;
                return GLib.SOURCE_REMOVE;
            }

            try {
                const [success, contents] = Gio.File.new_for_path(this._meterPath).load_contents(null);
                if (!success)
                    throw new Error('No se pudo leer el nivel del micrófono.');
                const fields = new TextDecoder().decode(contents).trim().split(/\s+/);
                const timestamp = Number(fields[0]);
                if (fields[1] === 'ERROR')
                    throw new Error(fields.slice(2).join(' '));
                const level = Number(fields[1]);
                if (!Number.isFinite(timestamp) || !Number.isFinite(level) || level < 0 || level > 1)
                    throw new Error('El nivel del micrófono tiene un formato inválido.');
                const age = GLib.get_real_time() / 1_000_000 - timestamp;
                this._updateMeterBars(age > 0.6 ? 0 : level);
            } catch (error) {
                this._meterTimer = 0;
                this._updateMeterBars(0);
                logError(error, 'Airi: falló el medidor del micrófono');
                if (!this._meterErrorNotified) {
                    this._meterErrorNotified = true;
                    Main.notifyError('Airi', `Falló el medidor del micrófono. ${error.message}`);
                }
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _updateMeterBars(level) {
        const profile = [0.55, 0.82, 1, 0.82, 0.55];
        this._meterBars?.forEach((bar, index) => {
            bar.scale_y = 0.12 + level * profile[index];
            bar.opacity = level > 0.02 ? 255 : 100;
        });
    }

    _stopMeter() {
        if (this._meterTimer) {
            GLib.source_remove(this._meterTimer);
            this._meterTimer = 0;
        }
        this._updateMeterBars(0);
    }

    _startCopilotNotificationWatcher() {
        if (!this._copilotNotificationDirectory || this._copilotNotificationTimer)
            return;

        this._copilotNotificationTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            if (this._disposed) {
                this._copilotNotificationTimer = 0;
                return GLib.SOURCE_REMOVE;
            }
            this._pollCopilotNotifications();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopCopilotNotificationWatcher() {
        if (this._copilotNotificationTimer) {
            GLib.source_remove(this._copilotNotificationTimer);
            this._copilotNotificationTimer = 0;
        }
    }

    _pollCopilotNotifications() {
        if (this._disposed || this._phase !== 'idle' || !this._copilotNotificationDirectory)
            return;

        const directory = Gio.File.new_for_path(this._copilotNotificationDirectory);
        if (!directory.query_exists(null))
            return;

        let enumerator;
        try {
            enumerator = directory.enumerate_children(
                'standard::name',
                Gio.FileQueryInfoFlags.NONE,
                null,
            );
            const names = [];
            let info;
            while ((info = enumerator.next_file(null)) !== null) {
                const name = info.get_name();
                if (name.endsWith('.json'))
                    names.push(name);
            }
            enumerator.close(null);
            enumerator = null;
            names.sort();
            for (const name of names) {
                if (this._consumeCopilotNotification(name))
                    return;
            }
            if (names.length === 0)
                this._copilotNotificationErrorNotified = false;
        } catch (error) {
            if (enumerator) {
                try {
                    enumerator.close(null);
                } catch (closeError) {
                    logError(closeError, 'Airi: no se pudo cerrar el directorio de avisos');
                }
            }
            this._reportCopilotNotificationError(error);
        }
    }

    _consumeCopilotNotification(filename) {
        const path = GLib.build_filenamev([this._copilotNotificationDirectory, filename]);
        const file = Gio.File.new_for_path(path);
        try {
            const [success, contents] = file.load_contents(null);
            if (!success)
                throw new Error('No se pudo leer el archivo de aviso.');
            const event = JSON.parse(new TextDecoder().decode(contents));
            const status = event?.status ?? (event?.title === 'Copilot listo' ? 'ready' : null);
            if (!event || typeof event.sessionId !== 'string' || !event.sessionId
                || !['working', 'attention', 'ready', 'error', 'idle'].includes(status)
                || typeof event.title !== 'string'
                || typeof event.message !== 'string'
                || (event.project !== undefined && typeof event.project !== 'string')
                || (event.taskSummary !== undefined && typeof event.taskSummary !== 'string')
                || (status !== 'working' && status !== 'idle' && !event.message.trim())
                || !Number.isFinite(event.createdAt))
                throw new Error('El aviso tiene un formato inválido.');

            const age = GLib.get_real_time() / 1_000_000 - event.createdAt;
            if (age < -5 || age > COPILOT_NOTIFICATION_MAX_AGE_SECONDS) {
                file.delete(null);
                return false;
            }

            const notification = {
                ...event,
                status,
                project: event.project?.trim() ?? '',
                taskSummary: event.taskSummary?.trim().slice(0, 80) ?? '',
                message: event.message.trim(),
            };
            file.delete(null);
            this._applyCopilotEvent(notification);
            this._copilotNotificationErrorNotified = false;
            return true;
        } catch (error) {
            this._updateFloatingRobot();
            try {
                file.delete(null);
            } catch (deleteError) {
                this._reportCopilotNotificationError(deleteError);
            }
            this._reportCopilotNotificationError(error);
            return false;
        }
    }

    _applyCopilotEvent(event) {
        const { sessionId, status } = event;
        const previous = this._copilotStatusBySession.get(sessionId);
        const hopDirection = ROBOT_HOP_DIRECTION_BY_COPILOT_STATUS[status];
        if (hopDirection !== undefined)
            this._animateRobotHop(hopDirection);
        const record = {
            sessionId,
            status,
            title: event.title,
            message: event.message,
            project: event.project,
            taskSummary: event.taskSummary || previous?.taskSummary || '',
            createdAt: event.createdAt,
        };
        if (status === 'idle') {
            this._copilotStatusBySession.delete(sessionId);
        } else {
            this._copilotStatusBySession.set(sessionId, record);
        }

        const pendingAttention = this._getPendingCopilotAttentionRecord();
        if (pendingAttention) {
            if (this._copilotNotification?.sessionId !== pendingAttention.sessionId
                || this._copilotNotification.status !== 'attention') {
                this._showCopilotNotification(pendingAttention);
            } else {
                this._updateOverlay();
            }
            this._updateFloatingRobot();
            return;
        }

        if (status === 'working' || status === 'idle') {
            if (this._copilotNotification?.sessionId === sessionId
                && (status === 'working' || this._copilotNotification.status === 'attention')) {
                this._clearCopilotNotification();
                const nextNotification = this._getRecentCopilotNotification();
                if (nextNotification)
                    this._showCopilotNotification(nextNotification, false);
                else if (this._overlay && this._phase === 'idle')
                    this._hideOverlay();
            }
            if (this._overlay)
                this._updateOverlay();
            this._updateFloatingRobot();
            return;
        }

        this._showCopilotNotification(record);
    }

    _showCopilotNotification(notification, playSound = true) {
        this._cancelCopilotDismiss();
        this._copilotNotification = notification;
        this._cancelOverlayHide();
        if (!this._overlay)
            this._showOverlay(this._floatingButton ?? this._recordButton);
        else {
            this._updateOverlay();
            this._positionOverlay();
        }
        this._scheduleCopilotDismiss();
        if (playSound && this._copilotNotification.status !== 'error')
            this._playCopilotNotificationSound();
    }

    _playCopilotNotificationSound() {
        try {
            const playerPath = GLib.find_program_in_path('canberra-gtk-play');
            if (!playerPath)
                throw new Error('No se encontró canberra-gtk-play.');

            const process = Gio.Subprocess.new(
                [
                    playerPath,
                    '--file=/usr/share/sounds/freedesktop/stereo/bell.oga',
                    '--volume=3.0',
                ],
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
            );
            process.wait_check_async(null, (soundProcess, result) => {
                try {
                    soundProcess.wait_check_finish(result);
                } catch (error) {
                    logError(error, 'Airi: falló el sonido del aviso de Copilot');
                }
            });
        } catch (error) {
            logError(error, 'Airi: no se pudo reproducir el sonido del aviso de Copilot');
        }
    }

    _reportCopilotNotificationError(error) {
        logError(error, 'Airi: no se pudo mostrar el aviso de Copilot');
        if (this._copilotNotificationErrorNotified)
            return;

        this._copilotNotificationErrorNotified = true;
        Main.notifyError('Airi', `No se pudo mostrar el aviso de Copilot. ${error.message}`);
    }

    _scheduleCopilotDismiss() {
        if (!this._copilotNotification || this._phase !== 'idle'
            || this._copilotNotification.status === 'attention'
            || !this._overlay || this._overlayHovered)
            return;

        this._cancelCopilotDismiss();
        this._copilotDismissTimer = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            COPILOT_NOTIFICATION_DURATION_MS,
            () => {
                this._copilotDismissTimer = 0;
                if (this._copilotNotification && this._phase === 'idle'
                    && this._overlay && !this._overlayHovered)
                    this._fadeOutOverlay();
                return GLib.SOURCE_REMOVE;
            },
        );
    }

    _cancelCopilotDismiss() {
        if (this._copilotDismissTimer) {
            GLib.source_remove(this._copilotDismissTimer);
            this._copilotDismissTimer = 0;
        }
    }

    _clearCopilotNotification() {
        if (!this._copilotNotification)
            return;

        const status = this._copilotStatusBySession.get(this._copilotNotification.sessionId)?.status;
        if (status === this._copilotNotification.status
            && ['ready', 'error'].includes(status))
            this._copilotStatusBySession.delete(this._copilotNotification.sessionId);
        this._copilotNotification = null;
        this._cancelCopilotDismiss();
        this._updateFloatingRobot();
    }

    _scheduleResultDismiss() {
        if (this._phase !== 'complete' || !this._overlay || this._overlayHovered)
            return;

        this._cancelResultDismiss();
        this._resultDismissTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
            this._resultDismissTimer = 0;
            if (this._phase === 'complete' && this._overlay && !this._overlayHovered)
                this._fadeOutOverlay();
            return GLib.SOURCE_REMOVE;
        });
    }

    _fadeOutOverlay() {
        const overlay = this._overlay;
        const isDismissible = () => this._phase === 'complete'
            || (this._phase === 'idle' && Boolean(this._copilotNotification));
        if (!overlay || !isDismissible())
            return;

        overlay.ease({
            opacity: 0,
            duration: 180,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (this._overlay !== overlay || !isDismissible())
                    return;
                if (this._overlayHovered)
                    overlay.opacity = 255;
                else
                    this._hideOverlay();
            },
        });
    }

    _cancelResultDismiss() {
        if (this._resultDismissTimer) {
            GLib.source_remove(this._resultDismissTimer);
            this._resultDismissTimer = 0;
        }
    }

    _scheduleOverlayHide() {
        if (this._copilotNotification) {
            this._scheduleCopilotDismiss();
            return;
        }
        if (this._phase !== 'idle' || !this._overlay
            || this._panelHovered || this._floatingHovered || this._overlayHovered)
            return;

        this._cancelOverlayHide();
        this._overlayHideTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
            this._overlayHideTimer = 0;
            if (this._phase === 'idle' && !this._panelHovered
                && !this._floatingHovered && !this._overlayHovered)
                this._hideOverlay();
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelOverlayHide() {
        if (this._overlayHideTimer) {
            GLib.source_remove(this._overlayHideTimer);
            this._overlayHideTimer = 0;
        }
    }

    _animate() {
        this._stopDotsTimer();
        if (!this._overlay || (this._phase !== 'starting' && this._phase !== 'stopping'))
            return;

        let dots = 0;
        const tick = () => {
            if (this._disposed || !this._overlayLabel
                || (this._phase !== 'starting' && this._phase !== 'stopping')) {
                this._dotsTimer = 0;
                return GLib.SOURCE_REMOVE;
            }
            this._dots.forEach((dot, index) => {
                dot.opacity = index === dots ? 255 : 110;
                dot.scale_x = index === dots ? 1.2 : 0.88;
                dot.scale_y = index === dots ? 1.2 : 0.88;
            });
            dots = (dots + 1) % this._dots.length;
            return GLib.SOURCE_CONTINUE;
        };
        tick();
        this._dotsTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, tick);
    }

    _stopTimers() {
        this._stopDotsTimer();
        this._stopMeter();
        this._cancelResultDismiss();
        this._cancelCopilotDismiss();
    }

    _stopDotsTimer() {
        if (this._dotsTimer) {
            GLib.source_remove(this._dotsTimer);
            this._dotsTimer = 0;
        }
    }

    _hideOverlay() {
        this._stopCopilotShimmer();
        this._stopTimers();
        this._cancelOverlayHide();
        this._clearCopilotNotification();
        if (!this._overlay)
            return;

        Main.layoutManager.removeChrome(this._overlay);
        this._overlay.destroy();
        this._overlay = null;
        this._overlayAnchor = null;
        if (this._phase === 'complete') {
            this._phase = 'idle';
            this._resultText = '';
        }
        this._updateFloatingRobot();
        this._overlayLabel = null;
        this._sessionStatusLabel = null;
        this._caption = null;
        this._dotsBox = null;
        this._meterBox = null;
        this._meterBars = [];
        this._floatingVisibilityButton = null;
        this._hideFloatingIcon = null;
        this._showFloatingIcon = null;
        this._displayedVisibilityIcon = null;
        this._actionButton = null;
        this._actionIcon = null;
        this._stopIcon = null;
        this._displayedActionIcon = null;
        this._dots = [];
        this._overlayHovered = false;
    }
}
