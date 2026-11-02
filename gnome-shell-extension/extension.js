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
};

const ACTIONS = {
    idle: 'Iniciar dictado',
    starting: 'Iniciando...',
    recording: 'Detener y transcribir',
    stopping: 'Transcribiendo...',
};

const PANEL_BUTTON_STYLE = 'background-color: transparent; border: 0; padding: 0; border-radius: 999px; transition-duration: 150ms;';
const PANEL_BUTTON_HOVER_STYLE = 'background-color: rgba(255,255,255,0.12); border: 0; padding: 0; border-radius: 999px; transition-duration: 150ms;';

export default class VoiceToTerminalExtension extends Extension {
    enable() {
        this._phase = 'starting';
        this._disposed = false;
        this._lifecycle = (this._lifecycle ?? 0) + 1;
        this._panelHovered = false;
        this._overlayHovered = false;
        this._overlayHideTimer = 0;
        this._targetWindow = null;
        this._command = GLib.build_filenamev([GLib.get_home_dir(), '.local', 'bin', 'voice-to-terminal']);
        this._robotIconPath = GLib.build_filenamev([
            GLib.get_user_data_dir(), 'gnome-shell', 'extensions', this.uuid, 'robot-face.svg',
        ]);

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
            if (this._phase === 'idle' && this._overlay) {
                this._hideOverlay();
                return;
            }

            this._showControls();
        });
        this._indicator.add_child(this._recordButton);
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
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
        this._hideOverlay();
        this._indicator?.destroy();
        this._indicator = null;
        this._recordButton = null;
        this._targetWindow = null;
        this._lastWindow = null;
    }

    _toggleRecording() {
        if (this._disposed || this._phase === 'starting' || this._phase === 'stopping')
            return;

        if (this._phase === 'idle')
            this._startRecording();
        else
            this._stopRecording();
    }

    _startRecording() {
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
                this._showOverlay();
                this._updatePanelIcon();
                this._updateOverlay();
                this._animate();
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

        this._phase = 'stopping';
        this._updateOverlay();
        this._restoreTargetFocus();
        // Detener el micrófono no debe depender de que funcione la animación.
        this._runBackend(['--stop'], (success, error) => {
            if (this._disposed)
                return;

            this._phase = 'idle';
            this._updatePanelIcon();
            this._stopTimers();
            this._updateOverlay();
            this._scheduleOverlayHide();
            if (!success)
                Main.notifyError('Voice to Terminal', `Falló el dictado. ${error}`);
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
        const complete = (success, error) => {
            if (!this._disposed && lifecycle === this._lifecycle)
                callback(success, error);
        };
        let process;
        try {
            const launcher = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDERR_PIPE });
            launcher.setenv('VOICE_TO_TERMINAL_QUIET', '1', true);
            process = launcher.spawnv([this._command, ...args]);
        } catch (error) {
            complete(false, error.message);
            return;
        }

        process.communicate_utf8_async(null, null, (subprocess, result) => {
            let stderr = '';
            try {
                [, , stderr] = subprocess.communicate_utf8_finish(result);
            } catch (error) {
                complete(false, error.message);
                return;
            }

            if (subprocess.get_successful())
                complete(true, '');
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
    }

    _showOverlay() {
        if (this._overlay)
            return;

        const box = new St.BoxLayout({
            reactive: true,
            track_hover: true,
            style: 'spacing: 16px; padding: 14px 16px; min-width: 320px; background-color: rgba(21,17,44,0.97); border: 1px solid rgba(149,80,255,0.8); border-radius: 18px;',
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
        this._overlayLabel = new St.Label({
            text: LABELS[this._phase] ?? '',
            visible: this._phase !== 'idle',
            style: 'color: white; font-size: 13pt; font-weight: 700;',
        });
        statusRow.add_child(this._overlayLabel);
        statusRow.add_child(this._dotsBox);
        const caption = new St.Label({
            text: 'Dictado local',
            style: 'color: rgba(255,255,255,0.65); font-size: 9pt;',
        });
        statusBox.add_child(statusRow);
        statusBox.add_child(caption);
        box.add_child(statusBox);
        this._actionIcon = new St.Icon({
            icon_name: 'audio-input-microphone-symbolic',
            icon_size: 20,
        });
        this._actionButton = new St.Button({
            can_focus: false,
            reactive: true,
            track_hover: true,
            accessible_name: ACTIONS[this._phase] ?? ACTIONS.idle,
            style: 'background-color: #7148d8; border-radius: 999px; padding: 12px;',
        });
        this._actionButton.set_child(this._actionIcon);
        this._actionButton.connect('clicked', () => this._toggleRecording());
        box.add_child(this._actionButton);
        this._overlay = box;
        this._overlay.connect('enter-event', () => {
            this._overlayHovered = true;
            this._cancelOverlayHide();
            return Clutter.EVENT_PROPAGATE;
        });
        this._overlay.connect('leave-event', () => {
            this._overlayHovered = false;
            this._scheduleOverlayHide();
            return Clutter.EVENT_PROPAGATE;
        });
        Main.layoutManager.addTopChrome(this._overlay, { affectsStruts: false });
        this._positionOverlay(true);
        this._updateOverlay();
    }

    _showControls() {
        this._cancelOverlayHide();
        try {
            this._showOverlay();
        } catch (error) {
            this._hideOverlay();
            Main.notifyError('Voice to Terminal', `No se pudo mostrar el control de dictado. ${error.message}`);
        }
    }

    _positionOverlay(animate = false) {
        const monitor = Main.layoutManager.primaryMonitor;
        const [panelX, panelY] = this._indicator.get_transformed_position();
        const [panelWidth, panelHeight] = this._indicator.get_transformed_size();
        const [, overlayWidth] = this._overlay.get_preferred_width(-1);
        const [, overlayHeight] = this._overlay.get_preferred_height(overlayWidth);
        const margin = 8;
        const minX = monitor.x + margin;
        const maxX = Math.max(minX, monitor.x + monitor.width - overlayWidth - margin);
        const x = Math.min(Math.max(panelX + panelWidth - overlayWidth, minX), maxX);
        let y = panelY + panelHeight + margin;

        if (y + overlayHeight > monitor.y + monitor.height - margin)
            y = Math.max(monitor.y + margin, panelY - overlayHeight - margin);

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
        if (!this._overlay)
            return;

        const status = this._phase === 'stopping' ? 'transcribing' : this._phase;
        this._overlayLabel.text = LABELS[status] ?? '';
        this._overlayLabel.visible = status !== 'idle';
        const statusColor = status === 'recording'
            ? '#9fe8ff'
            : status === 'transcribing' ? '#d2b7ff' : 'white';
        this._overlayLabel.style = `color: ${statusColor}; font-size: 13pt; font-weight: 700;`;
        this._actionButton.accessible_name = ACTIONS[this._phase] ?? ACTIONS.idle;
        this._actionIcon.icon_name = this._phase === 'recording'
            ? 'media-playback-stop-symbolic'
            : 'audio-input-microphone-symbolic';
        this._actionButton.reactive = this._phase === 'idle' || this._phase === 'recording';
        this._dotsBox.visible = this._phase !== 'idle';
        this._actionButton.style = this._phase === 'recording'
            ? 'background-color: #a83e62; border-radius: 999px; padding: 12px;'
            : this._phase === 'starting' || this._phase === 'stopping'
                ? 'background-color: #51445f; border-radius: 999px; padding: 12px;'
                : 'background-color: #7148d8; border-radius: 999px; padding: 12px;';

        if (this._phase === 'idle' || this._phase === 'starting') {
            this._dots.forEach(dot => {
                dot.opacity = 255;
                dot.scale_x = 1;
                dot.scale_y = 1;
            });
        }
    }

    _scheduleOverlayHide() {
        if (this._phase !== 'idle' || !this._overlay || this._panelHovered || this._overlayHovered)
            return;

        this._cancelOverlayHide();
        this._overlayHideTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
            this._overlayHideTimer = 0;
            if (this._phase === 'idle' && !this._panelHovered && !this._overlayHovered)
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
        if (!this._overlay)
            return;

        this._stopTimers();
        let dots = 0;
        const tick = () => {
            if (this._disposed || !this._overlayLabel || this._phase === 'idle')
                return GLib.SOURCE_REMOVE;
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
        this._robotAvatar = null;
        this._overlayLabel = null;
        this._dotsBox = null;
        this._actionButton = null;
        this._actionIcon = null;
        this._dots = [];
        this._overlayHovered = false;
    }
}
