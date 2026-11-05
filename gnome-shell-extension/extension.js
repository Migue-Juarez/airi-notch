import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
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

const PANEL_BUTTON_STYLE = 'background-color: transparent; border: 0; padding: 0; border-radius: 999px; transition-duration: 150ms;';
const PANEL_BUTTON_HOVER_STYLE = 'background-color: rgba(255,255,255,0.12); border: 0; padding: 0; border-radius: 999px; transition-duration: 150ms;';
const FLOATING_BUTTON_SIZE = 42;
const FLOATING_BUTTON_STYLES = {
    idle: 'background-color: rgba(21,17,44,0.92); border: 1px solid rgba(149,80,255,0.72); border-radius: 14px; padding: 5px;',
    idleHover: 'background-color: rgba(48,34,80,0.98); border: 1px solid rgba(177,127,255,0.95); border-radius: 14px; padding: 5px;',
    active: 'background-color: rgba(34,26,57,0.96); border: 1px solid rgba(149,80,255,0.85); border-radius: 14px; padding: 5px;',
    recording: 'background-color: rgba(64,27,48,0.96); border: 1px solid rgba(255,93,119,0.95); border-radius: 14px; padding: 5px;',
    recordingHover: 'background-color: rgba(92,34,58,0.98); border: 1px solid rgba(255,132,151,1); border-radius: 14px; padding: 5px;',
    complete: 'background-color: rgba(24,54,49,0.96); border: 1px solid rgba(67,233,135,0.95); border-radius: 14px; padding: 5px;',
    completeHover: 'background-color: rgba(31,77,57,0.98); border: 1px solid rgba(105,255,164,1); border-radius: 14px; padding: 5px;',
};
const OVERLAY_STYLE = 'spacing: 16px; padding: 14px 16px; min-width: 320px; background-color: rgba(21,17,44,0.97); border: 1px solid rgba(149,80,255,0.8); border-radius: 4px 18px 18px 18px;';
const RECORDING_OVERLAY_STYLE = 'spacing: 16px; padding: 14px 16px; min-width: 320px; background-color: rgba(21,17,44,0.97); border: 1px solid rgba(255,93,119,0.9); border-radius: 4px 18px 18px 18px;';

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
        this._floatingPulseTimer = 0;
        this._floatingPulseDim = false;
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
        this._robotIconPath = GLib.build_filenamev([
            GLib.get_user_data_dir(), 'gnome-shell', 'extensions', this.uuid, 'robot-face.svg',
        ]);
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

        this._indicator = new PanelMenu.Button(0.0, 'Voice to Terminal', true);
        this._indicator.can_focus = false;
        this._indicator.reactive = false;
        this._indicatorIcon = new St.Icon({
            gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(this._robotIconPath) }),
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
            this._startFloatingPulse();
        }
        this._layoutChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this._positionFloatingRobot();
            if (this._overlay)
                this._positionOverlay();
        });
        this._runBackend(['--cancel'], (success, error) => {
            this._phase = 'idle';
            this._updateOverlay();
            if (!success)
                Main.notifyError('Voice to Terminal', `No se pudo limpiar la grabación anterior. ${error}`);
        });
    }

    disable() {
        this._disposed = true;
        this._lifecycle++;
        if (this._phase === 'starting' || this._phase === 'recording')
            this._runBackend(['--cancel'], () => {});

        this._cancelOverlayHide();
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

        this._floatingRobotIcon = new St.Icon({
            gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(this._robotIconPath) }),
            icon_size: 30,
        });
        this._floatingButton = new St.Button({
            can_focus: true,
            reactive: true,
            track_hover: true,
            width: FLOATING_BUTTON_SIZE,
            height: FLOATING_BUTTON_SIZE,
            accessible_name: 'Abrir controles de dictado',
            style: FLOATING_BUTTON_STYLES.idle,
        });
        this._floatingButton.set_child(this._floatingRobotIcon);
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
        this._stopFloatingPulse();
        if (this._floatingButton) {
            Main.layoutManager.removeChrome(this._floatingButton);
            this._floatingButton.destroy();
            this._floatingButton = null;
            this._floatingRobotIcon = null;
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
            logError(error, 'Voice to Terminal: no se pudo cargar la posición del robot');
            Main.notifyError('Voice to Terminal', 'No se pudo cargar la posición del robot; se usará la ubicación predeterminada.');
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
            logError(error, 'Voice to Terminal: no se pudo guardar la posición del robot');
            Main.notifyError('Voice to Terminal', 'No se pudo guardar la posición del robot.');
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
                this._startFloatingPulse();
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
            logError(error, 'Voice to Terminal: no se pudo cambiar la visibilidad del robot');
            Main.notifyError('Voice to Terminal', `No se pudo cambiar la visibilidad del robot. ${error.message}`);
        }
    }

    _startFloatingPulse() {
        this._stopFloatingPulse();
        this._floatingPulseTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 900, () => {
            if (this._disposed || !this._floatingRobotIcon) {
                this._floatingPulseTimer = 0;
                return GLib.SOURCE_REMOVE;
            }

            const shouldPulse = this._phase === 'idle' || this._phase === 'complete';
            this._floatingRobotIcon.opacity = shouldPulse && this._floatingPulseDim ? 224 : 255;
            this._floatingPulseDim = shouldPulse && !this._floatingPulseDim;
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopFloatingPulse() {
        if (this._floatingPulseTimer) {
            GLib.source_remove(this._floatingPulseTimer);
            this._floatingPulseTimer = 0;
        }
    }

    _updateFloatingRobot() {
        if (!this._floatingButton)
            return;

        let style = FLOATING_BUTTON_STYLES.active;
        let accessibleName = 'Abrir controles de dictado';
        if (this._phase === 'idle') {
            style = this._floatingHovered ? FLOATING_BUTTON_STYLES.idleHover : FLOATING_BUTTON_STYLES.idle;
        } else if (this._phase === 'recording') {
            style = this._floatingHovered ? FLOATING_BUTTON_STYLES.recordingHover : FLOATING_BUTTON_STYLES.recording;
            accessibleName = 'Grabando; mostrar controles de dictado';
        } else if (this._phase === 'complete') {
            style = this._floatingHovered ? FLOATING_BUTTON_STYLES.completeHover : FLOATING_BUTTON_STYLES.complete;
            accessibleName = 'Mensaje listo; mostrar resultado del dictado';
        } else if (this._phase === 'starting') {
            accessibleName = 'Iniciando dictado';
        } else if (this._phase === 'stopping') {
            accessibleName = 'Transcribiendo dictado';
        }
        this._floatingButton.style = style;
        this._floatingButton.accessible_name = accessibleName;
        if (this._phase !== 'idle' && this._phase !== 'complete')
            this._floatingRobotIcon.opacity = 255;
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
        this._resultText = '';
        const focusedWindow = global.display.focus_window;
        this._targetWindow = focusedWindow?.get_window_type() === 0
            ? focusedWindow
            : this._lastWindow;
        this._phase = 'starting';
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
                Main.notifyError('Voice to Terminal', `No se pudo iniciar la grabación. ${error}`);
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
                    Main.notifyError('Voice to Terminal', `No se pudo mostrar el control de grabación. ${error.message}`);
                });
            }
        });
    }

    _stopRecording() {
        if (this._phase !== 'recording' || this._disposed)
            return;

        this._stopMeter();
        this._phase = 'stopping';
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
                Main.notifyError('Voice to Terminal', success
                    ? 'El dictado terminó, pero no se recibió el texto transcripto.'
                    : `Falló el dictado. ${error}`);
                return;
            }

            this._phase = 'complete';
            this._resultText = transcript.trim();
            this._updateOverlay();
            this._scheduleResultDismiss();
        });
        if (this._phase === 'stopping') {
            try {
                this._updatePanelIcon();
                this._animate();
            } catch (error) {
                logError(error, 'Voice to Terminal: no se pudo actualizar la animación');
                this._hideOverlay();
            }
        }
    }

    _restoreTargetFocus() {
        try {
            // Activar una ventana no libera el grab modal de los ajustes rápidos.
            Main.panel.statusArea.quickSettings?.menu.close(PopupAnimation.NONE);
            this._targetWindow?.activate(global.get_current_time());
        } catch (error) {
            logError(error, 'Voice to Terminal: no se pudo restaurar el foco');
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
        this._robotAvatar = new St.Icon({
            gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(this._robotIconPath) }),
            icon_size: 44,
            style: 'background-color: rgba(99,181,255,0.1); border-radius: 14px; padding: 4px;',
        });
        box.add_child(this._robotAvatar);
        const statusBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'spacing: 3px;',
        });
        const statusRow = new St.BoxLayout({ style: 'spacing: 8px;' });
        this._dotsBox = new St.BoxLayout({ style: 'spacing: 4px;', visible: false });
        const dotColors = ['#63b5ff', '#a347ff', '#43e987'];
        const dotSizes = [7, 10, 7];
        this._dots = dotColors.map((color, index) => {
            const dot = new St.Widget({
                y_align: Clutter.ActorAlign.CENTER,
                style: `background-color: ${color}; width: ${dotSizes[index]}px; height: ${dotSizes[index]}px; border-radius: 999px;`,
            });
            this._dotsBox.add_child(dot);
            return dot;
        });
        this._meterBox = new St.BoxLayout({ style: 'spacing: 3px;', visible: false });
        const meterHeights = [8, 13, 18, 13, 8];
        this._meterBars = meterHeights.map(height => {
            const bar = new St.Widget({
                y_align: Clutter.ActorAlign.CENTER,
                style: `background-color: #ff8293; width: 3px; height: ${height}px; border-radius: 999px;`,
            });
            this._meterBox.add_child(bar);
            return bar;
        });
        this._overlayLabel = new St.Label({
            text: LABELS[this._phase] ?? '',
            visible: this._phase !== 'idle',
            style: 'color: white; font-size: 13pt; font-weight: 700;',
        });
        this._checkIcon = new St.Icon({
            icon_name: 'emblem-ok-symbolic',
            icon_size: 16,
            visible: false,
            style: 'color: #43e987;',
        });
        statusRow.add_child(this._overlayLabel);
        statusRow.add_child(this._dotsBox);
        statusRow.add_child(this._meterBox);
        statusRow.add_child(this._checkIcon);
        this._caption = new St.Label({
            text: 'Dictado local',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'color: rgba(255,255,255,0.65); font-size: 9pt;',
        });
        statusBox.add_child(statusRow);
        statusBox.add_child(this._caption);
        box.add_child(statusBox);
        this._actionIcon = new St.Icon({
            gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(this._microphoneIconPath) }),
            icon_size: 20,
        });
        this._stopIcon = new St.Icon({
            icon_name: 'media-playback-stop-symbolic',
            icon_size: 20,
        });
        this._hideFloatingIcon = new St.Icon({
            icon_name: 'view-conceal-symbolic',
            icon_size: 16,
        });
        this._showFloatingIcon = new St.Icon({
            icon_name: 'view-reveal-symbolic',
            icon_size: 16,
        });
        this._floatingVisibilityButton = new St.Button({
            can_focus: true,
            reactive: true,
            track_hover: true,
            accessible_name: this._floatingRobotVisible
                ? 'Ocultar robot flotante'
                : 'Mostrar robot flotante',
            style: 'background-color: rgba(99,181,255,0.12); border-radius: 999px; padding: 10px;',
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
            style: 'background-color: #7148d8; border-radius: 999px; padding: 12px;',
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
            return Clutter.EVENT_PROPAGATE;
        });
        this._overlay.connect('leave-event', () => {
            this._overlayHovered = false;
            if (this._phase === 'complete')
                this._scheduleResultDismiss();
            else
                this._scheduleOverlayHide();
            return Clutter.EVENT_PROPAGATE;
        });
        Main.layoutManager.addTopChrome(this._overlay, { affectsStruts: false });
        this._positionOverlay(true);
        this._updateOverlay();
        if (this._phase === 'starting' || this._phase === 'stopping')
            this._animate();
    }

    _showControls(anchor = this._floatingButton) {
        this._cancelOverlayHide();
        try {
            this._showOverlay(anchor);
        } catch (error) {
            this._hideOverlay();
            Main.notifyError('Voice to Terminal', `No se pudo mostrar el control de dictado. ${error.message}`);
        }
    }

    _positionOverlay(animate = false) {
        const anchor = this._overlayAnchor ?? this._floatingButton;
        if (!anchor)
            return;

        const monitor = Main.layoutManager.primaryMonitor;
        const [anchorX, anchorY] = anchor.get_transformed_position();
        const [anchorWidth] = anchor.get_transformed_size();
        const [, overlayWidth] = this._overlay.get_preferred_width(-1);
        const [, overlayHeight] = this._overlay.get_preferred_height(overlayWidth);
        const margin = 8;
        const minX = monitor.x + margin;
        const maxX = Math.max(minX, monitor.x + monitor.width - overlayWidth - margin);
        let x = anchorX + anchorWidth + margin;
        if (x + overlayWidth > monitor.x + monitor.width - margin)
            x = anchorX - overlayWidth - margin;
        x = Math.min(Math.max(x, minX), maxX);
        let y = Math.max(anchorY, monitor.y + (Main.panel.height || 32) + margin);

        if (y + overlayHeight > monitor.y + monitor.height - margin)
            y = Math.max(monitor.y + margin, monitor.y + monitor.height - overlayHeight - margin);

        if (animate) {
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
        }
    }

    _updateOverlay() {
        this._updateFloatingRobot();
        if (!this._overlay)
            return;

        const status = this._phase === 'stopping' ? 'transcribing' : this._phase;
        this._overlayLabel.text = LABELS[status] ?? '';
        this._overlayLabel.visible = status !== 'idle';
        const statusColor = status === 'recording'
            ? '#9fe8ff'
            : status === 'transcribing' ? '#d2b7ff'
                : status === 'complete' ? '#43e987' : 'white';
        this._overlayLabel.style = `color: ${statusColor}; font-size: 13pt; font-weight: 700;`;
        this._caption.text = this._phase === 'complete'
            ? this._resultPreview()
            : 'Dictado local';
        this._caption.style = this._phase === 'complete'
            ? 'color: rgba(255,255,255,0.85); font-size: 9pt;'
            : 'color: rgba(255,255,255,0.65); font-size: 9pt;';
        this._checkIcon.visible = this._phase === 'complete';
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
        this._overlay.style = this._phase === 'recording' ? RECORDING_OVERLAY_STYLE : OVERLAY_STYLE;
        this._actionButton.style = this._phase === 'recording'
            ? 'background-color: #a83e62; border-radius: 999px; padding: 12px;'
            : this._phase === 'starting' || this._phase === 'stopping'
                ? 'background-color: #51445f; border-radius: 999px; padding: 12px;'
                : 'background-color: #7148d8; border-radius: 999px; padding: 12px;';

        if (this._phase === 'idle' || this._phase === 'starting' || this._phase === 'complete') {
            this._dots.forEach(dot => {
                dot.opacity = 255;
                dot.scale_x = 1;
                dot.scale_y = 1;
            });
        }
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
                logError(error, 'Voice to Terminal: falló el medidor del micrófono');
                if (!this._meterErrorNotified) {
                    this._meterErrorNotified = true;
                    Main.notifyError('Voice to Terminal', `Falló el medidor del micrófono. ${error.message}`);
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
        if (!overlay)
            return;

        overlay.ease({
            opacity: 0,
            duration: 180,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (this._overlay !== overlay || this._phase !== 'complete')
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
    }

    _stopDotsTimer() {
        if (this._dotsTimer) {
            GLib.source_remove(this._dotsTimer);
            this._dotsTimer = 0;
        }
    }

    _hideOverlay() {
        this._stopTimers();
        this._cancelOverlayHide();
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
        this._robotAvatar = null;
        this._overlayLabel = null;
        this._caption = null;
        this._dotsBox = null;
        this._meterBox = null;
        this._meterBars = [];
        this._checkIcon = null;
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
