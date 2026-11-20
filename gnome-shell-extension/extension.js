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
const FLOATING_CARD_GAP_PX = 12;
const FLOATING_POSE_CROSSFADE_MS = 180;
const FLOATING_BLINK_INTERVAL_MS = 4500;
const FLOATING_BLINK_DURATION_MS = 130;
const FLOATING_SACCADE_INTERVAL_MS = 1100;
const FLOATING_SACCADE_DURATION_MS = 90;
const FLOATING_HOVER_HINT_DELAY_MS = 350;
const FLOATING_HOVER_HINT_WIDTH_PX = 136;
const FLOATING_HOVER_HINT_HEIGHT_PX = 30;
const FLOATING_GAZE_RADIUS_PX = 180;
const FLOATING_GAZE_MAX_X_PX = 2.5;
const FLOATING_GAZE_MAX_Y_PX = 2;
const FLOATING_BODY_SQUASH_DURATION_MS = 90;
const FLOATING_BODY_STRETCH_DURATION_MS = 110;
const FLOATING_BODY_SETTLE_DURATION_MS = 140;
const COPILOT_CARD_RESIZE_DURATION_MS = 380;
const COPILOT_NOTIFICATION_DURATION_MS = 5000;
const COPILOT_NOTIFICATION_MAX_AGE_SECONDS = 120;
const ACTIVE_SESSIONS_MAX_HEIGHT_PX = 180;
const EXPANDED_PANEL_WIDTH_PX = 600;
const COMPACT_PANEL_WIDTH_PX = 340;
const EMERALD_PALETTE = Object.freeze({
    50: '#c7fdd8',
    100: '#4ffa9b',
    200: '#44da86',
    300: '#3ec87b',
    400: '#35b06b',
    500: '#2c955a',
    600: '#217848',
    700: '#175b35',
    800: '#0d3f23',
    900: '#052311',
    950: '#021508',
});
const SEANCE_PALETTE = Object.freeze({
    50: '#f8edfe',
    100: '#efd1fc',
    200: '#e1a4fa',
    300: '#d778f8',
    400: '#ce41f5',
    500: '#b124d4',
    600: '#8f1bac',
    700: '#6f1386',
    800: '#550c68',
    900: '#340540',
    950: '#22022b',
});
const PANEL_COLORS = Object.freeze({
    background: '#0e0e10',
    surface: '#151518',
    raised: '#1b1b1f',
    text: '#f2ebd9',
    muted: '#b3b0a6',
    subtle: '#8e8e93',
    accent: EMERALD_PALETTE[100],
    accentGlow: 'rgba(79,250,155,0.8)',
    accentSoft: 'rgba(79,250,155,0.12)',
    accentBorder: 'rgba(68,218,134,0.55)',
    accentSoftBorder: 'rgba(68,218,134,0.24)',
    recordingBorder: 'rgba(62,200,123,0.62)',
    copilotAccent: SEANCE_PALETTE[200],
    copilotSoft: 'rgba(177,36,212,0.14)',
    copilotBorder: 'rgba(206,65,245,0.3)',
    copilotSurface: SEANCE_PALETTE[950],
    blue: '#58b2ff',
    attention: '#f5a623',
    error: '#ff7676',
    border: 'rgba(242,235,217,0.13)',
    borderStrong: 'rgba(242,235,217,0.22)',
});
const COPILOT_NOTIFICATION_COLORS = {
    attention: PANEL_COLORS.attention,
    error: PANEL_COLORS.error,
    ready: PANEL_COLORS.accent,
};
const OPEN_COPILOT_SESSION_STATUSES = Object.freeze([
    'idle', 'working', 'attention', 'ready', 'error',
]);
const COPILOT_SESSION_STATUS_PRIORITY = Object.freeze({
    attention: 0,
    working: 1,
    error: 2,
    ready: 3,
    idle: 4,
});
const COPILOT_SESSION_STATUS_LABELS = Object.freeze({
    idle: 'En espera',
    working: 'Working',
    attention: 'Necesita respuesta',
    ready: 'Lista',
    error: 'Error',
});
const COPILOT_OVERVIEW_STATUS_LABELS = Object.freeze({
    idle: 'Copilot en espera',
    working: 'Copilot trabajando',
    attention: 'Necesita respuesta',
    ready: 'Copilot listo',
    error: 'Copilot con un error',
});
const FLOATING_BUTTON_STYLE = 'background-color: transparent; border: 0; outline: none; border-radius: 0; padding: 0; box-shadow: none;';
const FLOATING_EYE_STYLE = `background-color: ${PANEL_COLORS.accent}; border: 1px solid ${EMERALD_PALETTE[50]}; border-radius: 4px; box-shadow: 0 0 8px ${PANEL_COLORS.accentGlow}, inset 0 0 2px rgba(199,253,216,0.4);`;
const FLOATING_GLASSES_STYLE = `background-color: rgba(14,14,16,0.14); border: 1px solid ${PANEL_COLORS.copilotAccent}; border-radius: 5px; box-shadow: 0 0 5px ${PANEL_COLORS.copilotBorder};`;
const FLOATING_GLASSES_BRIDGE_STYLE = `background-color: ${PANEL_COLORS.copilotAccent}; border-radius: 2px;`;
const FLOATING_EXPRESSION_MOUTH_STYLES = Object.freeze({
    smile: `background-color: transparent; border-bottom: 4px solid ${PANEL_COLORS.accent}; border-radius: 0 0 999px 999px;`,
    open: `background-color: ${PANEL_COLORS.accent}; border: 1px solid rgba(199,253,216,0.82); border-radius: 999px;`,
    wave: `background-color: transparent; border-top: 2px solid ${PANEL_COLORS.accent}; border-bottom: 2px solid ${PANEL_COLORS.accent}; border-radius: 999px;`,
    frown: `background-color: transparent; border-top: 3px solid ${PANEL_COLORS.error}; border-radius: 999px 999px 0 0;`,
    flat: `background-color: ${PANEL_COLORS.accent}; border-radius: 999px;`,
});
const FLOATING_EXPRESSION_CONFIGS = Object.freeze({
    contento: { mouth: 'smile', mouthWidth: 22, mouthHeight: 10 },
    enamorado: {
        eyeGlyph: '♥',
        eyeGlyphColor: PANEL_COLORS.copilotAccent,
        mouth: 'smile',
        mouthWidth: 22,
        mouthHeight: 10,
        cheeks: true,
        cheekOpacity: 90,
        accents: ['♥', '♥'],
        accentColor: PANEL_COLORS.copilotAccent,
        cheekColor: PANEL_COLORS.copilotAccent,
    },
    sorpresa: {
        eyeStyle: `background-color: ${PANEL_COLORS.accent}; border: 2px solid rgba(199,253,216,0.9); border-radius: 999px; box-shadow: 0 0 8px ${PANEL_COLORS.accentGlow};`,
        eyeWidth: 14,
        eyeHeight: 14,
        mouth: 'open',
        mouthWidth: 8,
        mouthHeight: 13,
        accents: ['!', ''],
        accentColor: PANEL_COLORS.attention,
    },
    orgulloso: {
        eyeScaleY: [0.12, 0.12],
        eyeRotation: [-8, 8],
        mouth: 'smile',
        mouthWidth: 21,
        mouthHeight: 10,
        cheeks: true,
        cheekOpacity: 90,
        accents: ['✦', '✦'],
        accentColor: PANEL_COLORS.accent,
        cheekColor: PANEL_COLORS.accent,
    },
    guino: {
        eyeScaleY: [0.12, 1],
        mouth: 'smile',
        mouthWidth: 22,
        mouthHeight: 10,
    },
    bostezo: {
        eyeScaleY: [0.5, 0.5],
        mouth: 'open',
        mouthWidth: 10,
        mouthHeight: 15,
        accents: ['', 'z'],
        accentColor: PANEL_COLORS.subtle,
    },
    molesto: {
        eyeStyle: `background-color: ${PANEL_COLORS.error}; border: 1px solid rgba(255,190,190,0.9); border-radius: 2px; box-shadow: 0 0 8px rgba(255,118,118,0.72);`,
        eyeRotation: [-12, 12],
        mouth: 'frown',
        mouthWidth: 18,
        mouthHeight: 8,
        brows: true,
    },
    escucha: {
        eyeStyle: `background-color: ${PANEL_COLORS.accent}; border: 1px solid rgba(199,253,216,0.85); border-radius: 999px; box-shadow: 0 0 8px ${PANEL_COLORS.accentGlow};`,
        eyeWidth: 11,
        eyeHeight: 11,
        mouth: 'wave',
        mouthWidth: 19,
        mouthHeight: 7,
        accents: ['((', '))'],
        accentColor: PANEL_COLORS.accent,
    },
    mareado: {
        eyeGlyph: '◎',
        eyeGlyphColor: PANEL_COLORS.blue,
        mouth: 'flat',
        mouthWidth: 10,
        mouthHeight: 4,
        accents: ['✦', ''],
        accentColor: PANEL_COLORS.blue,
    },
    festejo: {
        eyeScaleY: [0.12, 0.12],
        mouth: 'smile',
        mouthWidth: 24,
        mouthHeight: 11,
        cheeks: true,
        cheekOpacity: 110,
        accents: ['✦', '✦'],
        accentColor: PANEL_COLORS.copilotAccent,
        cheekColor: PANEL_COLORS.accent,
    },
    saludo: {
        eyeScaleY: [0.12, 1],
        mouth: 'smile',
        mouthWidth: 22,
        mouthHeight: 10,
        accents: ['〰', '〰'],
        accentColor: PANEL_COLORS.accent,
    },
    animo: {
        mouth: 'smile',
        mouthWidth: 22,
        mouthHeight: 10,
        glasses: true,
        accents: ['', ''],
        accentColor: PANEL_COLORS.copilotAccent,
    },
});
const FLOATING_HOVER_ADORE_DELAY_MS = 2000;
const FLOATING_IDLE_YAWN_DELAY_MS = 180000;
const FLOATING_TRANSIENT_REACTION_DURATION_MS = 1800;
const FLOATING_YAWN_DURATION_MS = 2400;
const overlayStyle = (width, borderColor) =>
    `spacing: 0; padding: 18px; width: ${width}px; background-color: ${PANEL_COLORS.background}; border: 1px solid ${borderColor}; border-radius: 24px; box-shadow: 0 18px 48px rgba(0,0,0,0.56);`;
const PANEL_OVERLAY_STYLES = Object.freeze({
    expanded: Object.freeze({
        idle: overlayStyle(EXPANDED_PANEL_WIDTH_PX, PANEL_COLORS.border),
        recording: overlayStyle(EXPANDED_PANEL_WIDTH_PX, PANEL_COLORS.recordingBorder),
        notification: overlayStyle(EXPANDED_PANEL_WIDTH_PX, 'rgba(88,178,255,0.62)'),
        attention: overlayStyle(EXPANDED_PANEL_WIDTH_PX, 'rgba(245,166,35,0.68)'),
        error: overlayStyle(EXPANDED_PANEL_WIDTH_PX, 'rgba(255,118,118,0.68)'),
    }),
    compact: Object.freeze({
        idle: overlayStyle(COMPACT_PANEL_WIDTH_PX, PANEL_COLORS.border),
        recording: overlayStyle(COMPACT_PANEL_WIDTH_PX, PANEL_COLORS.recordingBorder),
        notification: overlayStyle(COMPACT_PANEL_WIDTH_PX, 'rgba(88,178,255,0.62)'),
        attention: overlayStyle(COMPACT_PANEL_WIDTH_PX, 'rgba(245,166,35,0.68)'),
        error: overlayStyle(COMPACT_PANEL_WIDTH_PX, 'rgba(255,118,118,0.68)'),
    }),
});

export default class VoiceToTerminalExtension extends Extension {
    enable() {
        this._phase = 'starting';
        this._disposed = false;
        this._lifecycle = (this._lifecycle ?? 0) + 1;
        this._panelHovered = false;
        this._floatingHovered = false;
        this._floatingHoverTimer = 0;
        this._floatingHintTimer = 0;
        this._floatingHint = null;
        this._floatingHintOnStage = false;
        this._pointerMotionId = 0;
        this._floatingGazeOffset = { x: 0, y: 0 };
        this._floatingSaccadeOffset = 0;
        this._floatingMotionState = null;
        this._floatingBodySequence = 0;
        this._floatingYawnTimer = 0;
        this._floatingReactionTimer = 0;
        this._floatingReactionExpression = null;
        this._floatingReactionSequence = 0;
        this._floatingHoverExpression = null;
        this._floatingExpression = null;
        this._floatingYawnActive = false;
        this._floatingDrag = null;
        this._suppressFloatingClick = false;
        this._floatingClickResetTimer = 0;
        this._overlayHovered = false;
        this._overlayHideTimer = 0;
        this._overlayVariant = null;
        this._panelCenteringTimer = 0;
        this._centerBox = null;
        this._centerBoxAllocationId = 0;
        this._activePanelView = 'dictation';
        this._panelViewSelectedByUser = false;
        this._floatingBlinkTimer = 0;
        this._floatingBlinkRestoreTimer = 0;
        this._floatingSaccadeTimer = 0;
        this._floatingSaccadeRestoreTimer = 0;
        this._floatingEyesSquinting = false;
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
        this._copilotActiveSessionsPath = runtimeDir
            ? GLib.build_filenamev([runtimeDir, 'voice-to-terminal', 'active-sessions.json'])
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
        Main.panel.addToStatusArea(this.uuid, this._indicator, 1, 'center');
        this._centerBox = Main.panel._centerBox;
        this._centerBoxAllocationId = this._centerBox.connect(
            'notify::width',
            () => this._schedulePanelIndicatorCentering(),
        );
        this._schedulePanelIndicatorCentering();
        if (this._floatingRobotVisible) {
            this._createFloatingRobot();
        }
        this._layoutChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this._positionFloatingRobot();
            if (this._overlay)
                this._positionOverlay();
            this._schedulePanelIndicatorCentering();
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
        this._cancelPanelIndicatorCentering();
        if (this._centerBoxAllocationId) {
            this._centerBox.disconnect(this._centerBoxAllocationId);
            this._centerBoxAllocationId = 0;
        }
        this._centerBox = null;
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
        this._floatingRobotCanvas.set_pivot_point(0.5, 0.5);
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
        this._floatingEyeGlyphs = [
            new St.Label({
                text: '',
                reactive: false,
                visible: false,
                style: `color: ${PANEL_COLORS.accent}; font-size: 15pt; font-weight: 700;`,
            }),
            new St.Label({
                text: '',
                reactive: false,
                visible: false,
                style: `color: ${PANEL_COLORS.accent}; font-size: 15pt; font-weight: 700;`,
            }),
        ];
        this._floatingGlasses = [
            new St.Widget({
                reactive: false,
                visible: false,
                style: FLOATING_GLASSES_STYLE,
            }),
            new St.Widget({
                reactive: false,
                visible: false,
                style: FLOATING_GLASSES_STYLE,
            }),
        ];
        this._floatingGlassesBridge = new St.Widget({
            reactive: false,
            visible: false,
            style: FLOATING_GLASSES_BRIDGE_STYLE,
        });
        this._floatingMouth = new St.Widget({
            reactive: false,
            visible: false,
        });
        this._floatingCheeks = [
            new St.Widget({
                width: 7,
                height: 4,
                reactive: false,
                visible: false,
                style: `background-color: ${PANEL_COLORS.accent}; border-radius: 999px;`,
            }),
            new St.Widget({
                width: 7,
                height: 4,
                reactive: false,
                visible: false,
                style: `background-color: ${PANEL_COLORS.accent}; border-radius: 999px;`,
            }),
        ];
        this._floatingBrows = [
            new St.Widget({
                height: 2,
                reactive: false,
                visible: false,
                style: `background-color: ${PANEL_COLORS.error}; border-radius: 999px;`,
            }),
            new St.Widget({
                height: 2,
                reactive: false,
                visible: false,
                style: `background-color: ${PANEL_COLORS.error}; border-radius: 999px;`,
            }),
        ];
        this._floatingFaceAccents = [
            new St.Label({
                text: '',
                reactive: false,
                visible: false,
                style: `color: ${PANEL_COLORS.accent}; font-size: 11pt; font-weight: 700;`,
            }),
            new St.Label({
                text: '',
                reactive: false,
                visible: false,
                style: `color: ${PANEL_COLORS.accent}; font-size: 11pt; font-weight: 700;`,
            }),
        ];
        for (const eye of this._floatingEyes)
            this._floatingRobotCanvas.add_child(eye);
        for (const frame of this._floatingGlasses)
            this._floatingRobotCanvas.add_child(frame);
        this._floatingRobotCanvas.add_child(this._floatingGlassesBridge);
        for (const cheek of this._floatingCheeks)
            this._floatingRobotCanvas.add_child(cheek);
        for (const brow of this._floatingBrows)
            this._floatingRobotCanvas.add_child(brow);
        this._floatingRobotCanvas.add_child(this._floatingMouth);
        for (const glyph of this._floatingEyeGlyphs)
            this._floatingRobotCanvas.add_child(glyph);
        for (const accent of this._floatingFaceAccents)
            this._floatingRobotCanvas.add_child(accent);
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
        this._floatingHint = new St.Label({
            text: 'Abrir controles',
            reactive: false,
            visible: false,
            width: FLOATING_HOVER_HINT_WIDTH_PX,
            height: FLOATING_HOVER_HINT_HEIGHT_PX,
            style: `color: ${PANEL_COLORS.text}; background-color: ${PANEL_COLORS.raised}; border: 1px solid ${PANEL_COLORS.accentBorder}; border-radius: 15px; padding: 5px 10px; font-size: 10pt; font-weight: 500;`,
        });
        this._setFloatingPose('front', false);
        this._floatingButton.connect('enter-event', () => {
            this._floatingHovered = true;
            this._cancelOverlayHide();
            this._scheduleFloatingHint();
            this._startFloatingHoverReaction();
            this._updateFloatingRobot();
            return Clutter.EVENT_PROPAGATE;
        });
        this._floatingButton.connect('leave-event', () => {
            this._floatingHovered = false;
            this._hideFloatingHint();
            this._stopFloatingHoverReaction();
            this._updateFloatingRobot();
            this._scheduleOverlayHide();
            return Clutter.EVENT_PROPAGATE;
        });
        this._floatingButton.connect('button-press-event', (_actor, event) => {
            if (event.get_button() !== Clutter.BUTTON_PRIMARY)
                return Clutter.EVENT_PROPAGATE;
            this._hideFloatingHint();
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
        this._pointerMotionId = global.stage.connect('motion-event', (_stage, event) => {
            this._updateFloatingGaze(event);
            return Clutter.EVENT_PROPAGATE;
        });
        this._positionFloatingRobot();
        this._updateFloatingRobot();
    }

    _destroyFloatingRobot() {
        if (this._pointerMotionId) {
            global.stage.disconnect(this._pointerMotionId);
            this._pointerMotionId = 0;
        }
        this._setFloatingGazeOffset(0, 0);
        this._floatingMotionState = null;
        this._floatingBodySequence++;
        this._stopFloatingBlink();
        this._stopFloatingSaccades();
        this._stopFloatingReactions();
        this._hideFloatingHint();
        if (this._floatingHint) {
            this._floatingHint.destroy();
            this._floatingHint = null;
        }
        if (this._floatingButton) {
            Main.layoutManager.removeChrome(this._floatingButton);
            this._floatingButton.destroy();
            this._floatingButton = null;
            this._floatingRobotCanvas = null;
            this._floatingRobotIcon = null;
            this._floatingRobotIcons = null;
            this._floatingEyes = null;
            this._floatingEyeGlyphs = null;
            this._floatingGlasses = null;
            this._floatingGlassesBridge = null;
            this._floatingMouth = null;
            this._floatingCheeks = null;
            this._floatingBrows = null;
            this._floatingFaceAccents = null;
            this._floatingEyeLayout = null;
            this._floatingPose = null;
            this._floatingExpression = null;
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
                const replaceCompactPanel = this._overlay
                    && this._overlayAnchor === this._floatingButton;
                this._saveFloatingPosition();
                this._destroyFloatingRobot();
                if (replaceCompactPanel)
                    this._showControls(this._recordButton);
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
            || this._floatingExpression !== 'contento'
            || !this._floatingEyes?.length || this._floatingBlinkTimer
            || this._floatingBlinkRestoreTimer)
            return;

        this._floatingBlinkTimer = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            FLOATING_BLINK_INTERVAL_MS,
            () => {
                this._floatingBlinkTimer = 0;
                if (this._disposed || this._robotMood !== 'idle'
                    || this._phase !== 'idle' || this._floatingExpression !== 'contento'
                    || !this._floatingEyes?.length)
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
                            || this._phase !== 'idle' || this._floatingExpression !== 'contento'
                            || !this._floatingEyes?.length)
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

    _scheduleFloatingHint() {
        this._hideFloatingHint();
        this._floatingHintTimer = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            FLOATING_HOVER_HINT_DELAY_MS,
            () => {
                this._floatingHintTimer = 0;
                if (this._disposed || !this._floatingHovered || this._floatingDrag
                    || !this._floatingButton || !this._floatingHint)
                    return GLib.SOURCE_REMOVE;

                const monitor = Main.layoutManager.primaryMonitor;
                const [buttonX, buttonY] = this._floatingButton.get_transformed_position();
                const [buttonWidth, buttonHeight] = this._floatingButton.get_transformed_size();
                this._floatingHint.text = this._overlay
                    ? 'Cerrar controles'
                    : 'Abrir controles';
                const gap = 8;
                const right = buttonX + buttonWidth + gap;
                const left = buttonX - FLOATING_HOVER_HINT_WIDTH_PX - gap;
                const rightFits = right + FLOATING_HOVER_HINT_WIDTH_PX
                    <= monitor.x + monitor.width - 8;
                const leftFits = left >= monitor.x + 8;
                const x = rightFits
                    ? right
                    : leftFits
                        ? left
                        : Math.max(
                            monitor.x + 8,
                            Math.min(
                                buttonX,
                                monitor.x + monitor.width - FLOATING_HOVER_HINT_WIDTH_PX - 8,
                            ),
                        );
                const y = Math.max(
                    monitor.y + 8,
                    Math.min(
                        buttonY + (buttonHeight - FLOATING_HOVER_HINT_HEIGHT_PX) / 2,
                        monitor.y + monitor.height - FLOATING_HOVER_HINT_HEIGHT_PX - 8,
                    ),
                );
                this._floatingHint.set_position(x, y);
                this._floatingHint.opacity = 0;
                if (!this._floatingHintOnStage) {
                    Main.layoutManager.addTopChrome(this._floatingHint, {
                        affectsStruts: false,
                    });
                    this._floatingHintOnStage = true;
                }
                this._floatingHint.visible = true;
                this._floatingHint.ease({
                    opacity: 255,
                    duration: 140,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
                return GLib.SOURCE_REMOVE;
            },
        );
    }

    _hideFloatingHint() {
        if (this._floatingHintTimer) {
            GLib.source_remove(this._floatingHintTimer);
            this._floatingHintTimer = 0;
        }
        if (this._floatingHint) {
            if (this._floatingHintOnStage) {
                Main.layoutManager.removeChrome(this._floatingHint);
                this._floatingHintOnStage = false;
            }
            this._floatingHint.remove_all_transitions();
            this._floatingHint.visible = false;
        }
    }

    _updateFloatingGaze(event) {
        if (this._disposed || !this._floatingRobotVisible || !this._floatingButton
            || this._floatingDrag)
            return;

        const [pointerX, pointerY] = event.get_coords();
        const [robotX, robotY] = this._floatingButton.get_transformed_position();
        const [robotWidth, robotHeight] = this._floatingButton.get_transformed_size();
        const deltaX = pointerX - (robotX + robotWidth / 2);
        const deltaY = pointerY - (robotY + robotHeight / 2);
        if (Math.hypot(deltaX, deltaY) > FLOATING_GAZE_RADIUS_PX) {
            this._setFloatingGazeOffset(0, 0);
            return;
        }

        this._setFloatingGazeOffset(
            deltaX / FLOATING_GAZE_RADIUS_PX * FLOATING_GAZE_MAX_X_PX,
            deltaY / FLOATING_GAZE_RADIUS_PX * FLOATING_GAZE_MAX_Y_PX,
        );
    }

    _setFloatingGazeOffset(x, y) {
        const nextOffset = {
            x: Math.max(-FLOATING_GAZE_MAX_X_PX, Math.min(FLOATING_GAZE_MAX_X_PX, x)),
            y: Math.max(-FLOATING_GAZE_MAX_Y_PX, Math.min(FLOATING_GAZE_MAX_Y_PX, y)),
        };
        const currentOffset = this._floatingGazeOffset ?? { x: 0, y: 0 };
        if (Math.abs(currentOffset.x - nextOffset.x) < 0.1
            && Math.abs(currentOffset.y - nextOffset.y) < 0.1)
            return;

        this._floatingGazeOffset = nextOffset;
        this._updateFloatingEyeOffsets();
    }

    _updateFloatingEyeOffsets() {
        if (!this._floatingEyes?.length || !this._floatingEyeLayout)
            return;

        const gaze = this._floatingGazeOffset ?? { x: 0, y: 0 };
        const saccade = this._floatingSaccadeOffset ?? 0;
        this._floatingEyes.forEach((eye, index) => {
            const layout = this._floatingEyeLayout[index];
            const offsetX = gaze.x + saccade;
            const offsetY = gaze.y;
            eye.ease({
                x: layout.x + offsetX,
                y: layout.y + offsetY,
                duration: 65,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            this._floatingEyeGlyphs[index].ease({
                x: layout.x - 4 + offsetX,
                y: layout.y - 6 + offsetY,
                duration: 65,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        });

        const animatePosition = (actor, x, y) => actor.ease({
            x,
            y,
            duration: 65,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        const eyeBottom = Math.max(...this._floatingEyeLayout.map(
            eye => eye.y + eye.height,
        ));
        this._floatingGlasses?.forEach((frame, index) => {
            if (!frame.visible)
                return;
            const eye = this._floatingEyeLayout[index];
            animatePosition(frame, eye.x - 2 + gaze.x + saccade, eye.y - 2 + gaze.y);
        });
        const firstEye = this._floatingEyeLayout[0];
        const secondEye = this._floatingEyeLayout[1];
        const bridgeStart = firstEye.x + firstEye.width + 2;
        const bridgeEnd = secondEye.x - 2;
        const bridgeWidth = Math.max(2, bridgeEnd - bridgeStart);
        if (this._floatingGlassesBridge.visible) {
            animatePosition(
                this._floatingGlassesBridge,
                bridgeStart + (bridgeEnd - bridgeStart - bridgeWidth) / 2 + gaze.x + saccade,
                firstEye.y + firstEye.height / 2 - 1 + gaze.y,
            );
        }
        this._floatingCheeks?.forEach((cheek, index) => {
            if (!cheek.visible)
                return;
            const eye = this._floatingEyeLayout[index];
            animatePosition(
                cheek,
                (index === 0 ? eye.x - 10 : eye.x + eye.width + 4) + gaze.x + saccade,
                eyeBottom + gaze.y + 1,
            );
        });
        this._floatingBrows?.forEach((brow, index) => {
            if (!brow.visible)
                return;
            const eye = this._floatingEyeLayout[index];
            animatePosition(brow, eye.x + gaze.x + saccade, eye.y - 5 + gaze.y);
        });
        const faceCenter = (
            this._floatingEyeLayout[0].x
            + this._floatingEyeLayout[0].width / 2
            + this._floatingEyeLayout[1].x
            + this._floatingEyeLayout[1].width / 2
        ) / 2;
        this._floatingFaceAccents?.forEach((accent, index) => {
            if (!accent.visible)
                return;
            const eye = this._floatingEyeLayout[index];
            const x = this._floatingExpression === 'escucha'
                ? (index === 0 ? Math.max(4, eye.x - 24) : eye.x + eye.width + 4)
                : (index === 0
                    ? Math.max(12, faceCenter - 31)
                    : Math.min(93, faceCenter + 12));
            const y = this._floatingExpression === 'escucha'
                ? eye.y - 2 + gaze.y
                : Math.max(2, eye.y - 21) + gaze.y;
            animatePosition(accent, x + gaze.x + saccade, y);
        });
    }

    _startFloatingHoverReaction() {
        this._stopFloatingHoverReaction();
        if (this._phase !== 'idle' || this._getCopilotStatus() !== 'idle')
            return;

        this._floatingHoverExpression = 'guino';
        this._floatingHoverTimer = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            FLOATING_HOVER_ADORE_DELAY_MS,
            () => {
                this._floatingHoverTimer = 0;
                if (!this._disposed && this._floatingHovered
                    && this._phase === 'idle' && this._getCopilotStatus() === 'idle') {
                    this._floatingHoverExpression = 'enamorado';
                    this._updateFloatingRobot();
                }
                return GLib.SOURCE_REMOVE;
            },
        );
    }

    _stopFloatingHoverReaction() {
        if (this._floatingHoverTimer) {
            GLib.source_remove(this._floatingHoverTimer);
            this._floatingHoverTimer = 0;
        }
        this._floatingHoverExpression = null;
    }

    _clearFloatingReaction() {
        if (this._floatingReactionTimer) {
            GLib.source_remove(this._floatingReactionTimer);
            this._floatingReactionTimer = 0;
        }
        this._floatingReactionSequence++;
        if (this._floatingReactionExpression === 'bostezo')
            this._floatingYawnActive = false;
        this._floatingReactionExpression = null;
    }

    _triggerFloatingReaction(expression, duration = FLOATING_TRANSIENT_REACTION_DURATION_MS) {
        if (!this._floatingRobotCanvas)
            return;

        this._clearFloatingReaction();
        const sequence = this._floatingReactionSequence;
        this._floatingReactionExpression = expression;
        this._floatingReactionTimer = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            duration,
            () => {
                this._floatingReactionTimer = 0;
                if (this._disposed || sequence !== this._floatingReactionSequence)
                    return GLib.SOURCE_REMOVE;

                if (this._floatingReactionExpression === 'bostezo')
                    this._floatingYawnActive = false;
                this._floatingReactionExpression = null;
                this._updateFloatingRobot();
                return GLib.SOURCE_REMOVE;
            },
        );
        this._updateFloatingRobot();
    }

    _stopFloatingReactions() {
        this._stopFloatingHoverReaction();
        if (this._floatingYawnTimer) {
            GLib.source_remove(this._floatingYawnTimer);
            this._floatingYawnTimer = 0;
        }
        this._clearFloatingReaction();
        this._floatingYawnActive = false;
    }

    _updateFloatingYawn() {
        const canYawn = !this._disposed && this._floatingRobotVisible
            && Boolean(this._floatingButton) && this._phase === 'idle'
            && this._getCopilotStatus() === 'idle'
            && !this._overlay && !this._floatingHovered;
        if (!canYawn) {
            if (this._floatingYawnTimer) {
                GLib.source_remove(this._floatingYawnTimer);
                this._floatingYawnTimer = 0;
            }
            if (this._floatingReactionExpression === 'bostezo')
                this._clearFloatingReaction();
            return;
        }
        if (this._floatingYawnTimer || this._floatingYawnActive)
            return;

        this._floatingYawnTimer = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            FLOATING_IDLE_YAWN_DELAY_MS,
            () => {
                this._floatingYawnTimer = 0;
                const stillIdle = !this._disposed && this._floatingRobotVisible
                    && this._phase === 'idle' && this._getCopilotStatus() === 'idle'
                    && !this._overlay && !this._floatingHovered;
                if (stillIdle) {
                    this._floatingYawnActive = true;
                    this._triggerFloatingReaction('bostezo', FLOATING_YAWN_DURATION_MS);
                }
                return GLib.SOURCE_REMOVE;
            },
        );
    }

    _getFloatingExpression() {
        if (this._phase === 'starting' || this._phase === 'recording')
            return 'escucha';
        if (this._phase === 'stopping')
            return 'mareado';
        if (this._phase === 'complete')
            return 'orgulloso';

        const copilotStatus = this._getCopilotStatus();
        if (copilotStatus === 'attention')
            return 'sorpresa';
        if (copilotStatus === 'error')
            return 'molesto';
        if (copilotStatus === 'working')
            return 'animo';
        if (this._floatingReactionExpression)
            return this._floatingReactionExpression;
        if (this._floatingHoverExpression)
            return this._floatingHoverExpression;
        if (this._floatingYawnActive)
            return 'bostezo';
        return 'contento';
    }

    _applyFloatingExpression(expression, force = false) {
        if (!this._floatingRobotCanvas || !this._floatingEyeLayout
            || !this._floatingEyes?.length)
            return;
        if (!force && this._floatingExpression === expression)
            return;

        const config = FLOATING_EXPRESSION_CONFIGS[expression]
            ?? FLOATING_EXPRESSION_CONFIGS.contento;
        this._floatingExpression = expression;
        if (expression === 'contento')
            this._ensureFloatingBlink();
        else
            this._stopFloatingBlink();

        const gaze = this._floatingGazeOffset ?? { x: 0, y: 0 };
        const eyeOffsetX = gaze.x + (this._floatingSaccadeOffset ?? 0);
        this._floatingEyes.forEach((eye, index) => {
            const layout = this._floatingEyeLayout[index];
            const glyph = this._floatingEyeGlyphs[index];
            const eyeGlyph = config.eyeGlyph ?? '';
            const width = config.eyeWidth ?? layout.width;
            const height = config.eyeHeight ?? layout.height;
            const rotation = (layout.rotation ?? 0) + (config.eyeRotation?.[index] ?? 0);
            const scaleY = (config.eyeScaleY?.[index] ?? 1)
                * (this._floatingEyesSquinting ? 0.68 : 1);
            eye.visible = !eyeGlyph;
            eye.style = config.eyeStyle ?? FLOATING_EYE_STYLE;
            eye.set_position(layout.x + eyeOffsetX, layout.y + gaze.y);
            eye.width = width;
            eye.height = height;
            eye.scale_x = layout.scaleX ?? 1;
            eye.ease({
                scale_y: scaleY,
                rotation_angle_z: rotation,
                duration: 140,
                mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
            });
            glyph.text = eyeGlyph;
            glyph.visible = Boolean(eyeGlyph);
            glyph.style = `color: ${config.eyeGlyphColor ?? PANEL_COLORS.accent}; font-size: 15pt; font-weight: 700;`;
            glyph.set_position(
                layout.x - 4 + eyeOffsetX,
                layout.y - 6 + gaze.y,
            );
            glyph.width = width + 8;
            glyph.height = height + 8;
            glyph.rotation_angle_z = rotation;
        });

        const eyeCenters = this._floatingEyeLayout.map(eye => eye.x + eye.width / 2);
        const faceCenter = (eyeCenters[0] + eyeCenters[1]) / 2;
        const eyesBottom = Math.max(...this._floatingEyeLayout.map(eye => eye.y + eye.height));
        const mouthWidth = config.mouthWidth ?? 18;
        const mouthHeight = config.mouthHeight ?? 6;
        this._floatingMouth.visible = Boolean(config.mouth);
        this._floatingMouth.style = FLOATING_EXPRESSION_MOUTH_STYLES[config.mouth] ?? '';
        this._floatingMouth.set_position(faceCenter - mouthWidth / 2, eyesBottom + 6);
        this._floatingMouth.width = mouthWidth;
        this._floatingMouth.height = mouthHeight;

        const showGlasses = Boolean(config.glasses);
        this._floatingGlasses.forEach((frame, index) => {
            const eye = this._floatingEyeLayout[index];
            frame.visible = showGlasses;
            frame.style = FLOATING_GLASSES_STYLE;
            frame.set_position(
                eye.x - 2 + eyeOffsetX,
                eye.y - 2 + gaze.y,
            );
            frame.width = eye.width + 4;
            frame.height = eye.height + 4;
        });
        const firstEye = this._floatingEyeLayout[0];
        const secondEye = this._floatingEyeLayout[1];
        const bridgeStart = firstEye.x + firstEye.width + 2;
        const bridgeEnd = secondEye.x - 2;
        const bridgeWidth = Math.max(2, bridgeEnd - bridgeStart);
        this._floatingGlassesBridge.visible = showGlasses;
        this._floatingGlassesBridge.style = FLOATING_GLASSES_BRIDGE_STYLE;
        this._floatingGlassesBridge.set_position(
            bridgeStart + (bridgeEnd - bridgeStart - bridgeWidth) / 2 + eyeOffsetX,
            firstEye.y + firstEye.height / 2 - 1 + gaze.y,
        );
        this._floatingGlassesBridge.width = bridgeWidth;
        this._floatingGlassesBridge.height = 2;

        this._floatingCheeks.forEach((cheek, index) => {
            const eye = this._floatingEyeLayout[index];
            cheek.visible = Boolean(config.cheeks);
            cheek.style = `background-color: ${config.cheekColor ?? PANEL_COLORS.copilotAccent}; border-radius: 999px; box-shadow: 0 0 4px ${PANEL_COLORS.accentSoft};`;
            cheek.opacity = config.cheekOpacity ?? 170;
            cheek.set_position(
                (index === 0 ? eye.x - 10 : eye.x + eye.width + 4) + eyeOffsetX,
                eyesBottom + gaze.y + 1,
            );
        });

        this._floatingBrows.forEach((brow, index) => {
            const eye = this._floatingEyeLayout[index];
            brow.visible = Boolean(config.brows);
            brow.set_position(eye.x + eyeOffsetX, eye.y - 5 + gaze.y);
            brow.width = eye.width;
            brow.rotation_angle_z = config.eyeRotation?.[index] ?? 0;
        });

        this._floatingFaceAccents.forEach((accent, index) => {
            const text = config.accents?.[index] ?? '';
            const eye = this._floatingEyeLayout[index];
            accent.text = text;
            accent.visible = Boolean(text);
            accent.style = `color: ${config.accentColor ?? PANEL_COLORS.accent}; font-size: ${config.accentFontSize ?? '11pt'}; font-weight: 700;`;
            if (expression === 'escucha') {
                accent.set_position(
                    (index === 0 ? Math.max(4, eye.x - 24) : eye.x + eye.width + 4)
                        + eyeOffsetX,
                    eye.y - 2 + gaze.y,
                );
            } else {
                accent.set_position(
                    (index === 0
                        ? Math.max(12, faceCenter - 31)
                        : Math.min(93, faceCenter + 12)) + eyeOffsetX,
                    Math.max(2, eye.y - 21) + gaze.y,
                );
            }
            accent.width = 20;
            accent.height = 20;
        });
    }

    _positionFloatingEyes(offset = 0, animate = false) {
        if (!this._floatingEyes || !this._floatingEyeLayout)
            return;

        const gaze = this._floatingGazeOffset ?? { x: 0, y: 0 };
        this._floatingEyes.forEach((eye, index) => {
            const layout = this._floatingEyeLayout[index];
            const target = {
                x: layout.x + offset + gaze.x,
                y: layout.y + gaze.y,
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
        this._floatingSaccadeOffset = offset;
        this._updateFloatingEyeOffsets();
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
            return false;

        const shouldSquint = pose === 'threeQuarter'
            && Boolean(this._overlay)
            && this._phase === 'idle'
            && this._getCopilotStatus() === 'working';
        const poseChanged = this._floatingPose !== pose;
        const squintChanged = this._floatingEyesSquinting !== shouldSquint;
        this._floatingEyeLayout = pose === 'front'
            ? [
                { x: 33, y: 52, width: 16, height: 12 },
                { x: 63, y: 52, width: 16, height: 12 },
            ]
            : [
                { x: 66, y: 54, width: 10, height: 12, rotation: -12 },
                { x: 80, y: 51, width: 8, height: 11, scaleX: 0.7, rotation: -12 },
            ];
        if (!poseChanged && !squintChanged)
            return false;

        if (poseChanged) {
            this._floatingPose = pose;
            this._floatingRobotIcon = this._floatingRobotIcons[pose];
            this._positionFloatingEyes(this._floatingSaccadeOffset ?? 0, animate);
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
        return true;
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
        if (age < -5 || age > COPILOT_NOTIFICATION_DURATION_MS / 1000)
            return null;
        return notification;
    }

    _updateFloatingRobot() {
        this._setRobotMood();
        if (!this._floatingButton)
            return;

        let accessibleName = 'Abrir controles de dictado';
        const copilotState = this._getCopilotStatusRecord();
        const copilotStatus = copilotState?.status ?? 'idle';
        const sessionName = copilotState?.sessionName
            ? `: ${copilotState.sessionName}`
            : '';
        if (this._phase === 'idle' && copilotStatus === 'ready') {
            accessibleName = 'Copilot terminó; mostrar mensaje listo';
        } else if (this._phase === 'idle' && copilotStatus === 'attention') {
            accessibleName = `Copilot necesita atención${sessionName}`;
        } else if (this._phase === 'idle' && copilotStatus === 'error') {
            accessibleName = `Copilot informó un error${sessionName}`;
        } else if (this._phase === 'idle' && copilotStatus === 'working') {
            accessibleName = `Copilot trabajando${sessionName}`;
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
        const poseChanged = this._setFloatingPose(activePose ? 'threeQuarter' : 'front');
        this._updateFloatingYawn();
        this._applyFloatingExpression(this._getFloatingExpression(), poseChanged);
        if (this._phase !== 'idle' && this._phase !== 'complete') {
            this._floatingRobotCanvas.opacity = 255;
            this._floatingRobotCanvas.translation_y = 0;
        }
        const motionState = this._phase === 'idle'
            ? this._getCopilotStatus()
            : this._phase;
        const previousMotionState = this._floatingMotionState;
        this._floatingMotionState = motionState;
        if (previousMotionState && previousMotionState !== motionState) {
            if (motionState === 'starting' || motionState === 'working')
                this._animateFloatingBody('activation');
            else if (motionState === 'complete' || motionState === 'ready')
                this._animateFloatingBody('success');
        }
    }

    _toggleControls(anchor = this._floatingButton) {
        if (this._disposed)
            return;
        if ((this._phase === 'idle' || this._phase === 'complete')
            && this._overlay && this._overlayAnchor === anchor) {
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
        this._activePanelView = 'dictation';
        this._panelViewSelectedByUser = true;
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
                this._showOverlay(this._overlayAnchor ?? this._floatingButton);
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

    _animateFloatingBody(kind) {
        const canvas = this._floatingRobotCanvas;
        if (!canvas || !this._floatingRobotVisible || this._disposed)
            return;

        const sequence = ++this._floatingBodySequence;
        const isCurrent = () => sequence === this._floatingBodySequence
            && this._floatingRobotCanvas === canvas && !this._disposed;
        canvas.ease({
            scale_x: 1.05,
            scale_y: 0.94,
            duration: FLOATING_BODY_SQUASH_DURATION_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (!isCurrent())
                    return;
                canvas.ease({
                    scale_x: 0.96,
                    scale_y: kind === 'success' ? 1.1 : 1.06,
                    duration: FLOATING_BODY_STRETCH_DURATION_MS,
                    mode: Clutter.AnimationMode.EASE_OUT_BACK,
                    onComplete: () => {
                        if (!isCurrent())
                            return;
                        canvas.ease({
                            scale_x: 1,
                            scale_y: 1,
                            duration: FLOATING_BODY_SETTLE_DURATION_MS,
                            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
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

    _schedulePanelIndicatorCentering() {
        if (this._disposed || this._panelCenteringTimer)
            return;

        this._panelCenteringTimer = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._panelCenteringTimer = 0;
            if (!this._disposed)
                this._centerPanelIndicator();
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelPanelIndicatorCentering() {
        if (!this._panelCenteringTimer)
            return;

        GLib.source_remove(this._panelCenteringTimer);
        this._panelCenteringTimer = 0;
    }

    _centerPanelIndicator() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor || !this._centerBox || !this._recordButton)
            return;

        const [buttonX] = this._recordButton.get_transformed_position();
        const [buttonWidth] = this._recordButton.get_transformed_size();
        if (buttonWidth <= 0)
            return;

        const screenCenter = monitor.x + monitor.width / 2;
        const buttonCenter = buttonX + buttonWidth / 2;
        this._centerBox.translation_x = (this._centerBox.translation_x ?? 0)
            + screenCenter - buttonCenter;
    }

    _showOverlay(anchor = this._floatingButton) {
        const variant = anchor === this._floatingButton ? 'compact' : 'expanded';
        if (this._overlay && this._overlayAnchor === anchor
            && this._overlayVariant === variant)
            return;
        if (this._overlay)
            this._destroyOverlayActor();

        this._overlayAnchor = anchor;
        this._overlayVariant = variant;
        this._panelViewSelectedByUser = false;
        if (variant === 'expanded') {
            this._activePanelView = this._copilotNotification
                || this._getOpenCopilotSessions().length
                ? 'copilot'
                : 'dictation';
        }

        const box = new St.BoxLayout({
            vertical: variant === 'compact',
            reactive: true,
            track_hover: true,
            style: PANEL_OVERLAY_STYLES[variant].idle,
        });
        this._overlay = box;
        this._panelNavigationButtons = {};

        if (variant === 'expanded') {
            const sidebar = new St.BoxLayout({
                vertical: true,
                style: `width: 140px; min-width: 140px; spacing: 14px; padding-right: 14px; border-right: 1px solid ${PANEL_COLORS.border};`,
            });
            const identity = new St.BoxLayout({
                vertical: true,
                style: 'spacing: 8px; padding: 2px 0 14px;',
            });
            const name = new St.Label({
                text: 'Airi',
                style: `color: ${PANEL_COLORS.text}; font-size: 18pt; font-weight: 700;`,
            });
            const identitySubtitle = new St.Label({
                text: 'Asistente local',
                style: `color: ${PANEL_COLORS.subtle}; font-size: 9pt;`,
            });
            identity.add_child(name);
            identity.add_child(identitySubtitle);
            sidebar.add_child(identity);

            const navigation = new St.BoxLayout({
                vertical: true,
                style: 'spacing: 6px;',
            });
            navigation.add_child(this._createPanelNavigationButton(
                'dictation',
                'Dictado',
                'audio-input-microphone-symbolic',
            ));
            navigation.add_child(this._createPanelNavigationButton(
                'copilot',
                'Copilot',
                'view-list-symbolic',
            ));
            sidebar.add_child(navigation);

            const sidebarSpacer = new St.Widget({ y_expand: true });
            sidebar.add_child(sidebarSpacer);
            const sidebarStatus = new St.BoxLayout({
                style: 'spacing: 8px; padding-top: 12px;',
            });
            this._sidebarStatusDot = new St.Widget({
                y_align: Clutter.ActorAlign.CENTER,
                style: `background-color: ${PANEL_COLORS.accent}; width: 8px; height: 8px; border-radius: 999px;`,
            });
            this._sidebarStatusLabel = new St.Label({
                text: 'Listo',
                y_align: Clutter.ActorAlign.CENTER,
                style: `color: ${PANEL_COLORS.muted}; font-size: 9pt;`,
            });
            sidebarStatus.add_child(this._sidebarStatusDot);
            sidebarStatus.add_child(this._sidebarStatusLabel);
            sidebar.add_child(sidebarStatus);
            box.add_child(sidebar);
        } else {
            this._sidebarStatusDot = null;
            this._sidebarStatusLabel = null;
        }

        const content = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: variant === 'expanded',
            style: variant === 'expanded'
                ? 'spacing: 12px; padding-left: 18px;'
                : 'spacing: 12px;',
        });
        if (variant === 'expanded') {
            const panelHeader = new St.BoxLayout({
                vertical: true,
                style: 'spacing: 4px; padding-bottom: 4px;',
            });
            this._panelHeading = new St.Label({
                text: 'Dictado',
                style: `color: ${PANEL_COLORS.text}; font-size: 18pt; font-weight: 700;`,
            });
            this._panelSubtitle = new St.Label({
                text: 'Texto local en la ventana activa',
                style: `color: ${PANEL_COLORS.subtle}; font-size: 10pt;`,
            });
            panelHeader.add_child(this._panelHeading);
            panelHeader.add_child(this._panelSubtitle);
            content.add_child(panelHeader);
        } else {
            this._panelHeading = null;
            this._panelSubtitle = null;
        }

        this._statusRow = new St.BoxLayout({
            style: 'spacing: 10px; min-height: 32px;',
        });
        this._overlayLabel = new St.Label({
            text: LABELS[this._phase] ?? '',
            visible: true,
            style: `color: ${PANEL_COLORS.text}; font-size: 15pt; font-weight: 700;`,
        });
        this._dotsBox = new St.BoxLayout({
            style: 'spacing: 5px;',
            visible: false,
        });
        const dotColors = [
            EMERALD_PALETTE[200],
            EMERALD_PALETTE[50],
            EMERALD_PALETTE[400],
        ];
        const dotSizes = [8, 12, 8];
        this._dots = dotColors.map((color, index) => {
            const dot = new St.Widget({
                y_align: Clutter.ActorAlign.CENTER,
                style: `background-color: ${color}; width: ${dotSizes[index]}px; height: ${dotSizes[index]}px; border-radius: 999px;`,
            });
            this._dotsBox.add_child(dot);
            return dot;
        });
        this._meterBox = new St.BoxLayout({
            style: 'spacing: 3px;',
            visible: false,
        });
        const meterHeights = [10, 16, 24, 16, 10];
        const meterColors = [
            EMERALD_PALETTE[400],
            EMERALD_PALETTE[200],
            EMERALD_PALETTE[100],
            EMERALD_PALETTE[200],
            EMERALD_PALETTE[400],
        ];
        this._meterBars = meterHeights.map((height, index) => {
            const bar = new St.Widget({
                y_align: Clutter.ActorAlign.CENTER,
                style: `background-color: ${meterColors[index]}; width: 4px; height: ${height}px; border-radius: 999px;`,
            });
            this._meterBox.add_child(bar);
            return bar;
        });
        this._statusRow.add_child(this._overlayLabel);
        this._statusRow.add_child(this._dotsBox);
        this._statusRow.add_child(this._meterBox);
        content.add_child(this._statusRow);

        if (variant === 'expanded') {
            this._activeSessionsBox = new St.BoxLayout({
                vertical: true,
                style: `spacing: 10px; padding: 14px; background-color: ${PANEL_COLORS.surface}; border: 1px solid ${PANEL_COLORS.border}; border-radius: 16px;`,
                visible: false,
            });
            const activeSessionsHeading = new St.Label({
                text: 'Sesiones abiertas',
                style: `color: ${PANEL_COLORS.text}; font-size: 13pt; font-weight: 700;`,
            });
            this._activeSessionsList = new St.BoxLayout({
                vertical: true,
                style: 'spacing: 6px;',
            });
            this._activeSessionsScroll = new St.ScrollView({
                x_expand: true,
                overlay_scrollbars: true,
                style: `max-height: ${ACTIVE_SESSIONS_MAX_HEIGHT_PX}px;`,
            });
            this._activeSessionsScroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
            this._activeSessionsScroll.add_child(this._activeSessionsList);
            this._activeSessionsEmptyState = new St.Label({
                text: 'No hay sesiones abiertas',
                style: `color: ${PANEL_COLORS.subtle}; font-size: 10pt;`,
            });
            this._activeSessionsBox.add_child(activeSessionsHeading);
            this._activeSessionsBox.add_child(this._activeSessionsScroll);
            this._activeSessionsBox.add_child(this._activeSessionsEmptyState);
            content.add_child(this._activeSessionsBox);
        } else {
            this._activeSessionsBox = null;
            this._activeSessionsList = null;
            this._activeSessionsScroll = null;
            this._activeSessionsEmptyState = null;
            this._compactSessionSummary = new St.Label({
                text: '',
                x_expand: true,
                style: `color: ${PANEL_COLORS.muted}; font-size: 10pt;`,
                visible: false,
            });
            this._compactSessionSummary.clutter_text.line_wrap = false;
            this._compactSessionSummary.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            content.add_child(this._compactSessionSummary);
        }
        if (variant === 'expanded')
            this._compactSessionSummary = null;

        this._sessionTitle = new St.Label({
            text: '',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style: `color: ${PANEL_COLORS.copilotAccent}; font-size: 12pt; font-weight: 600;`,
            visible: false,
        });
        this._sessionTitle.clutter_text.line_wrap = true;
        content.add_child(this._sessionTitle);

        this._caption = new St.Label({
            text: '',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style: `color: ${PANEL_COLORS.muted}; font-size: 10pt;`,
        });
        this._caption.clutter_text.line_wrap = true;
        content.add_child(this._caption);

        this._actionIcon = new St.Icon({
            gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(this._microphoneIconPath) }),
            icon_size: 20,
            style: `color: ${PANEL_COLORS.background};`,
        });
        this._stopIcon = new St.Icon({
            icon_name: 'media-playback-stop-symbolic',
            icon_size: 20,
            style: `color: ${PANEL_COLORS.background};`,
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
            style: `color: ${PANEL_COLORS.muted}; background-color: ${PANEL_COLORS.raised}; border: 1px solid ${PANEL_COLORS.border}; border-radius: 999px; width: 44px; height: 44px; min-width: 44px; min-height: 44px; padding: 0;`,
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
            style: `background-color: ${PANEL_COLORS.accent}; border: 1px solid ${PANEL_COLORS.accentBorder}; border-radius: 999px; width: 48px; height: 48px; min-width: 48px; min-height: 48px; padding: 0;`,
        });
        this._actionButton.set_child(this._actionIcon);
        this._displayedActionIcon = this._actionIcon;
        this._actionButton.connect('clicked', () => this._toggleRecording());
        this._controlFooter = new St.BoxLayout({
            x_expand: true,
            style: `spacing: 12px; padding-top: 12px; border-top: 1px solid ${PANEL_COLORS.border};`,
        });
        this._controlSpacer = new St.Widget({ x_expand: true });
        this._controlFooter.add_child(this._floatingVisibilityButton);
        this._controlFooter.add_child(this._controlSpacer);
        this._controlFooter.add_child(this._actionButton);
        if (variant === 'expanded')
            content.add_child(new St.Widget({ y_expand: true }));
        content.add_child(this._controlFooter);
        box.add_child(content);

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

    _createPanelNavigationButton(view, label, iconName) {
        const button = new St.Button({
            can_focus: true,
            reactive: true,
            track_hover: true,
            accessible_name: `Mostrar ${label}`,
            style: 'border: 0; border-radius: 12px; min-height: 44px; padding: 0;',
        });
        const row = new St.BoxLayout({
            style: 'spacing: 10px; padding: 0 10px;',
        });
        const icon = new St.Icon({
            icon_name: iconName,
            icon_size: 18,
            style: `color: ${PANEL_COLORS.muted};`,
        });
        const text = new St.Label({
            text: label,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style: `color: ${PANEL_COLORS.muted}; font-size: 10pt; font-weight: 600;`,
        });
        row.add_child(icon);
        row.add_child(text);
        let badge = null;
        if (view === 'copilot') {
            badge = new St.Label({
                text: '0',
                y_align: Clutter.ActorAlign.CENTER,
                style: `color: ${PANEL_COLORS.muted}; background-color: ${PANEL_COLORS.raised}; border-radius: 999px; padding: 2px 7px; font-size: 8pt;`,
                visible: false,
            });
            row.add_child(badge);
        }
        button.set_child(row);
        button.connect('clicked', () => this._setPanelView(view));
        this._panelNavigationButtons[view] = { button, icon, text, badge };
        return button;
    }

    _setPanelView(view) {
        if (this._overlayVariant !== 'expanded'
            || !this._panelNavigationButtons?.[view]
            || this._activePanelView === view)
            return;

        this._activePanelView = view;
        this._panelViewSelectedByUser = true;
        this._updateOverlay();
    }

    _showControls(anchor = this._recordButton ?? this._floatingButton) {
        this._cancelOverlayHide();
        try {
            const wasOpen = Boolean(this._overlay);
            this._showOverlay(anchor);
            if (!wasOpen && this._overlay)
                this._triggerFloatingReaction('saludo');
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
        const margin = 8;
        const maxWidth = Math.max(320, monitor.width - margin * 2);
        const preferredWidth = this._overlayVariant === 'compact'
            ? COMPACT_PANEL_WIDTH_PX
            : EXPANDED_PANEL_WIDTH_PX;
        const overlayWidthStyle = Math.min(preferredWidth, maxWidth);
        this._overlay.style = this._overlay.style.replace(
            /width:\s*\d+px;/,
            `width: ${overlayWidthStyle}px;`,
        );
        const [, overlayWidth] = this._overlay.get_preferred_width(-1);
        const [, overlayHeight] = this._overlay.get_preferred_height(overlayWidth);
        const minX = monitor.x + margin;
        const maxX = Math.max(minX, monitor.x + monitor.width - overlayWidth - margin);
        const floatingAnchor = anchor === this._floatingButton;
        const centeredPanel = this._overlayVariant === 'expanded';
        let x = centeredPanel
            ? monitor.x + (monitor.width - overlayWidth) / 2
            : floatingAnchor
                ? anchorX + anchorWidth + FLOATING_CARD_GAP_PX
                : anchorX + anchorWidth + margin;
        if (!centeredPanel && x + overlayWidth > monitor.x + monitor.width - margin) {
            x = floatingAnchor
                ? anchorX - overlayWidth - FLOATING_CARD_GAP_PX
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

    _getOpenCopilotSessions() {
        return [...this._copilotStatusBySession.values()]
            .filter(record => OPEN_COPILOT_SESSION_STATUSES.includes(record.status))
            .sort((left, right) => {
                const priorityDifference = COPILOT_SESSION_STATUS_PRIORITY[left.status]
                    - COPILOT_SESSION_STATUS_PRIORITY[right.status];
                return priorityDifference || right.createdAt - left.createdAt;
            });
    }

    _createActiveCopilotSessionRow(record) {
        const row = new St.BoxLayout({
            style: `spacing: 10px; padding: 9px 10px; background-color: ${PANEL_COLORS.raised}; border: 1px solid ${PANEL_COLORS.border}; border-radius: 14px;`,
        });
        const sessionName = new St.Label({
            text: record.sessionName || 'Sesión sin título',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style: `max-width: 270px; color: ${PANEL_COLORS.text}; font-size: 10pt; font-weight: 500;`,
        });
        sessionName.clutter_text.line_wrap = false;
        sessionName.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        const statusStyle = record.status === 'attention'
            ? `color: ${PANEL_COLORS.attention}; background-color: rgba(245,166,35,0.14); border: 1px solid rgba(245,166,35,0.32);`
            : record.status === 'error'
                ? `color: ${PANEL_COLORS.error}; background-color: rgba(255,118,118,0.12); border: 1px solid rgba(255,118,118,0.3);`
                : record.status === 'idle'
                    ? `color: ${PANEL_COLORS.muted}; background-color: ${PANEL_COLORS.raised}; border: 1px solid ${PANEL_COLORS.border};`
                    : `color: ${PANEL_COLORS.copilotAccent}; background-color: ${PANEL_COLORS.copilotSurface}; border: 1px solid ${PANEL_COLORS.copilotBorder};`;
        const statusTag = new St.Label({
            text: COPILOT_SESSION_STATUS_LABELS[record.status] ?? 'Estado desconocido',
            y_align: Clutter.ActorAlign.CENTER,
            style: `${statusStyle} border-radius: 999px; padding: 4px 8px; font-size: 8pt; font-weight: 500;`,
        });
        row.add_child(sessionName);
        row.add_child(statusTag);
        return row;
    }

    _updateOverlay() {
        this._updateFloatingRobot();
        if (!this._overlay)
            return;

        const copilotNotification = this._phase === 'idle' ? this._copilotNotification : null;
        const status = this._phase === 'stopping' ? 'transcribing' : this._phase;
        const showControls = !copilotNotification;
        const showCaption = this._phase === 'complete' || Boolean(copilotNotification);
        const activeSessions = this._getOpenCopilotSessions();
        const firstActiveSession = activeSessions[0];
        const expanded = this._overlayVariant === 'expanded';
        const activeSessionColor = firstActiveSession?.status === 'attention'
            ? PANEL_COLORS.attention
            : firstActiveSession?.status === 'error'
                ? PANEL_COLORS.error
                : firstActiveSession?.status === 'idle'
                    ? PANEL_COLORS.subtle
                    : PANEL_COLORS.copilotAccent;
        if (expanded && !this._panelViewSelectedByUser && this._phase === 'idle'
            && !copilotNotification && activeSessions.length > 0)
            this._activePanelView = 'copilot';
        const showingCopilotView = expanded && this._activePanelView === 'copilot';
        const compactSessionStatus = this._overlayVariant === 'compact'
            && this._phase === 'idle' && firstActiveSession;
        this._statusRow.visible = !showingCopilotView || Boolean(copilotNotification);
        this._overlayLabel.text = copilotNotification
            ? copilotNotification.title
            : compactSessionStatus
                ? COPILOT_OVERVIEW_STATUS_LABELS[firstActiveSession.status]
                : LABELS[status] ?? 'Listo para dictar';
        this._overlayLabel.visible = true;
        const statusColor = copilotNotification
            ? COPILOT_NOTIFICATION_COLORS[copilotNotification.status] ?? PANEL_COLORS.accent
            : status === 'recording'
                ? PANEL_COLORS.accent
                : status === 'transcribing' ? PANEL_COLORS.blue
                    : status === 'complete' ? PANEL_COLORS.accent
                        : compactSessionStatus
                            ? activeSessionColor
                            : PANEL_COLORS.text;
        this._overlayLabel.style = `color: ${statusColor}; font-size: 15pt; font-weight: 700;`;
        if (this._panelHeading) {
            this._panelHeading.text = showingCopilotView ? 'Copilot' : 'Dictado';
            this._panelSubtitle.text = showingCopilotView
                ? activeSessions.length
                    ? `${activeSessions.length} sesiones abiertas`
                    : 'Tus sesiones abiertas aparecerán acá'
                : 'Texto local en la ventana activa';
        }
        const sidebarStatus = copilotNotification
            ? copilotNotification.status === 'attention'
                ? 'Necesita respuesta'
                : copilotNotification.status === 'error' ? 'Con un error' : 'Aviso de Copilot'
            : this._phase === 'recording'
                ? 'Grabando'
                : this._phase === 'starting' || this._phase === 'stopping'
                    ? 'Procesando'
                    : firstActiveSession
                        ? COPILOT_OVERVIEW_STATUS_LABELS[firstActiveSession.status]
                        : 'Listo';
        if (this._sidebarStatusLabel)
            this._sidebarStatusLabel.text = sidebarStatus;
        const sidebarStatusColor = copilotNotification
            ? COPILOT_NOTIFICATION_COLORS[copilotNotification.status] ?? PANEL_COLORS.accent
            : this._phase === 'recording' ? PANEL_COLORS.accent
                : this._phase === 'starting' || this._phase === 'stopping'
                    ? PANEL_COLORS.blue
                    : firstActiveSession ? activeSessionColor : PANEL_COLORS.accent;
        if (this._sidebarStatusDot)
            this._sidebarStatusDot.style = `background-color: ${sidebarStatusColor}; width: 8px; height: 8px; border-radius: 999px;`;

        for (const [view, navigation] of Object.entries(this._panelNavigationButtons ?? {})) {
            const selected = view === this._activePanelView;
            const selectedColor = view === 'copilot'
                ? PANEL_COLORS.copilotAccent
                : PANEL_COLORS.accent;
            const selectedSurface = view === 'copilot'
                ? PANEL_COLORS.copilotSoft
                : PANEL_COLORS.accentSoft;
            navigation.button.style = `background-color: ${selected ? selectedSurface : 'transparent'}; border: 0; border-radius: 12px; min-height: 44px; padding: 0;`;
            navigation.icon.style = `color: ${selected ? selectedColor : PANEL_COLORS.muted};`;
            navigation.text.style = `color: ${selected ? selectedColor : PANEL_COLORS.muted}; font-size: 10pt; font-weight: 600;`;
            navigation.button.accessible_name = `${selected ? 'Vista actual' : 'Mostrar'} ${view === 'copilot' ? 'Copilot' : 'Dictado'}`;
            if (navigation.badge) {
                navigation.badge.text = `${activeSessions.length}`;
                navigation.badge.visible = activeSessions.length > 0;
                navigation.badge.style = `color: ${activeSessionColor}; background-color: ${PANEL_COLORS.raised}; border-radius: 999px; padding: 2px 7px; font-size: 8pt;`;
            }
        }
        if (this._activeSessionsBox) {
            this._activeSessionsBox.visible = showingCopilotView && !copilotNotification;
            this._activeSessionsList.remove_all_children();
            for (const session of activeSessions)
                this._activeSessionsList.add_child(this._createActiveCopilotSessionRow(session));
            this._activeSessionsScroll.visible = activeSessions.length > 0;
            this._activeSessionsEmptyState.visible = activeSessions.length === 0;
        }
        if (this._compactSessionSummary) {
            const summary = activeSessions.length === 1
                ? '1 sesión abierta de Copilot'
                : `${activeSessions.length} sesiones abiertas de Copilot`;
            this._compactSessionSummary.text = summary;
            this._compactSessionSummary.visible = activeSessions.length > 0
                && this._phase === 'idle' && !copilotNotification;
        }
        const notificationMessage = copilotNotification?.message ?? '';
        const sessionTitle = copilotNotification?.status === 'ready'
            ? copilotNotification.sessionName || copilotNotification.project
            : '';
        const messageLines = notificationMessage.split('\n');
        const messageStartsWithSessionTitle = Boolean(sessionTitle)
            && messageLines[0] === sessionTitle;
        this._sessionTitle.text = sessionTitle;
        this._sessionTitle.visible = Boolean(sessionTitle);
        this._caption.text = copilotNotification
            ? messageStartsWithSessionTitle
                ? messageLines.slice(1).join('\n')
                : notificationMessage
            : this._phase === 'complete' ? this._resultPreview() : '';
        this._caption.visible = showCaption
            && (this._overlayVariant === 'compact'
                || this._activePanelView === 'dictation'
                || Boolean(copilotNotification));
        this._caption.style = `color: ${PANEL_COLORS.muted}; font-size: 10pt;`;
        this._controlFooter.visible = showControls;
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
        const overlayState = copilotNotification
            ? copilotNotification.status === 'attention'
                ? 'attention'
                : copilotNotification.status === 'error' ? 'error' : 'notification'
            : this._phase === 'recording' ? 'recording' : 'idle';
        const monitorWidth = Main.layoutManager.primaryMonitor?.width
            ?? EXPANDED_PANEL_WIDTH_PX;
        const preferredWidth = this._overlayVariant === 'compact'
            ? COMPACT_PANEL_WIDTH_PX
            : EXPANDED_PANEL_WIDTH_PX;
        const overlayWidth = Math.min(preferredWidth, Math.max(320, monitorWidth - 16));
        this._overlay.style = PANEL_OVERLAY_STYLES[this._overlayVariant][overlayState]
            .replace(/width:\s*\d+px;/, `width: ${overlayWidth}px;`);
        this._actionButton.style = this._phase === 'starting' || this._phase === 'stopping'
            ? `background-color: ${PANEL_COLORS.surface}; border: 1px solid ${PANEL_COLORS.border}; border-radius: 999px; width: 48px; height: 48px; min-width: 48px; min-height: 48px; padding: 0;`
            : `background-color: ${PANEL_COLORS.accent}; border: 1px solid ${PANEL_COLORS.accentBorder}; border-radius: 999px; width: 48px; height: 48px; min-width: 48px; min-height: 48px; padding: 0;`;

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

        this._syncCopilotActiveSessions();
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

    _syncCopilotActiveSessions() {
        if (!this._copilotActiveSessionsPath)
            return;

        const file = Gio.File.new_for_path(this._copilotActiveSessionsPath);
        if (!file.query_exists(null))
            return;

        try {
            const [success, contents] = file.load_contents(null);
            if (!success)
                throw new Error('No se pudo leer el estado de las sesiones activas.');
            const state = JSON.parse(new TextDecoder().decode(contents));
            if (!state || !Array.isArray(state.sessions))
                throw new Error('El estado de las sesiones activas tiene un formato inválido.');

            const activeSessions = new Map();
            for (const session of state.sessions) {
                if (!session || typeof session.sessionId !== 'string' || !session.sessionId
                    || !OPEN_COPILOT_SESSION_STATUSES.includes(session.status)
                    || (session.sessionName !== undefined
                        && typeof session.sessionName !== 'string')
                    || !Number.isFinite(session.createdAt))
                    throw new Error('El estado de las sesiones activas tiene un formato inválido.');
                activeSessions.set(session.sessionId, {
                    sessionId: session.sessionId,
                    status: session.status,
                    title: session.status === 'attention'
                        ? 'Copilot necesita una respuesta'
                        : session.status === 'error'
                            ? 'Copilot encontró un error'
                            : session.status === 'ready'
                                ? 'Copilot terminó'
                                : 'Copilot trabajando',
                    message: '',
                    project: '',
                    sessionName: session.sessionName?.trim().slice(0, 120) ?? '',
                    taskSummary: '',
                    createdAt: session.createdAt,
                });
            }

            let changed = false;
            for (const [sessionId, record] of this._copilotStatusBySession) {
                if (OPEN_COPILOT_SESSION_STATUSES.includes(record.status)
                    && !activeSessions.has(sessionId)) {
                    this._copilotStatusBySession.delete(sessionId);
                    changed = true;
                }
            }
            for (const [sessionId, record] of activeSessions) {
                const current = this._copilotStatusBySession.get(sessionId);
                if (!current || current.status !== record.status
                    || current.sessionName !== record.sessionName
                    || current.createdAt !== record.createdAt) {
                    this._copilotStatusBySession.set(sessionId, {
                        ...current,
                        ...record,
                    });
                    changed = true;
                }
            }

            if (changed) {
                this._updateFloatingRobot();
                if (this._overlay && !this._copilotNotification)
                    this._updateOverlay();
            }
            this._copilotNotificationErrorNotified = false;
        } catch (error) {
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
                || (event.sessionName !== undefined && typeof event.sessionName !== 'string')
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
                sessionName: event.sessionName?.trim().slice(0, 120) ?? '',
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
            sessionName: event.sessionName || previous?.sessionName || '',
            taskSummary: event.taskSummary || previous?.taskSummary || '',
            createdAt: event.createdAt,
        };
        if (status === 'idle')
            this._copilotStatusBySession.delete(sessionId);
        else
            this._copilotStatusBySession.set(sessionId, record);

        if (status === 'ready')
            this._triggerFloatingReaction('festejo');

        if (status === 'attention') {
            this._showCopilotNotification(record);
            this._updateFloatingRobot();
            return;
        }

        if (status === 'working' || status === 'idle') {
            if (this._copilotNotification?.sessionId === sessionId) {
                this._clearCopilotNotification();
                const nextNotification = this._getRecentCopilotNotification();
                if (nextNotification)
                    this._showCopilotNotification(nextNotification, false);
                else if (this._overlay && this._phase === 'idle') {
                    if (this._getOpenCopilotSessions().length)
                        this._updateOverlay();
                    else
                        this._hideOverlay();
                }
            }
            if (this._overlay)
                this._updateOverlay();
            this._updateFloatingRobot();
            return;
        }

        if (this._copilotNotification?.status === 'attention') {
            this._updateOverlay();
            this._updateFloatingRobot();
            return;
        }

        this._showCopilotNotification(record);
    }

    _showCopilotNotification(notification, playSound = true) {
        this._cancelCopilotDismiss();
        this._copilotNotification = notification;
        this._activePanelView = 'copilot';
        this._panelViewSelectedByUser = false;
        this._cancelOverlayHide();
        const anchor = this._floatingRobotVisible && this._floatingButton
            ? this._floatingButton
            : this._recordButton ?? this._floatingButton;
        if (!this._overlay || this._overlayAnchor !== anchor)
            this._showOverlay(anchor);
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

    _destroyOverlayActor() {
        if (!this._overlay)
            return;
        Main.layoutManager.removeChrome(this._overlay);
        this._overlay.destroy();
        this._overlay = null;
        this._overlayAnchor = null;
        this._overlayVariant = null;
        this._overlayLabel = null;
        this._statusRow = null;
        this._panelHeading = null;
        this._panelSubtitle = null;
        this._panelNavigationButtons = {};
        this._sidebarStatusDot = null;
        this._sidebarStatusLabel = null;
        this._activeSessionsBox = null;
        this._activeSessionsScroll = null;
        this._activeSessionsList = null;
        this._activeSessionsEmptyState = null;
        this._compactSessionSummary = null;
        this._sessionTitle = null;
        this._caption = null;
        this._dotsBox = null;
        this._meterBox = null;
        this._meterBars = [];
        this._floatingVisibilityButton = null;
        this._controlFooter = null;
        this._controlSpacer = null;
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

    _hideOverlay() {
        this._stopTimers();
        this._cancelOverlayHide();
        this._clearCopilotNotification();
        if (!this._overlay)
            return;

        this._destroyOverlayActor();
        if (this._phase === 'complete') {
            this._phase = 'idle';
            this._resultText = '';
        }
        this._updateFloatingRobot();
    }
}
