imports.gi.versions.Gtk = '3.0';
const { Gtk, Gio, GLib } = imports.gi;
const System = imports.system;
Gtk.init(null);

const title = `Voice to Terminal test ${GLib.get_monotonic_time()}`;
const otherTitle = `Voice to Terminal focus change ${GLib.get_monotonic_time()}`;
const window = new Gtk.Window({ title, default_width: 700, default_height: 100 });
const entry = new Gtk.Entry();
window.add(entry);
const otherWindow = new Gtk.Window({ title: otherTitle, default_width: 400, default_height: 100 });
const otherEntry = new Gtk.Entry();
otherWindow.add(otherEntry);
let submitted = false;
entry.connect('activate', () => { submitted = true; });
window.connect('delete-event', () => {
    Gtk.main_quit();
    return false;
});
window.show_all();
entry.grab_focus();
otherWindow.show_all();
let passed = false;
let timeout;

function run(argv, environment = {}) {
    return new Promise((resolve, reject) => {
        const launcher = new Gio.SubprocessLauncher({
            flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        });
        for (const [key, value] of Object.entries(environment))
            launcher.setenv(key, value, true);
        const process = launcher.spawnv(argv);
        process.communicate_utf8_async(null, null, (child, result) => {
            try {
                const [, stdout, stderr] = child.communicate_utf8_finish(result);
                if (!child.get_successful())
                    throw Error(stderr || `${argv[0]} failed`);
                resolve(stdout.trim());
            } catch (error) {
                reject(error);
            }
        });
    });
}

async function check() {
    const xdo = GLib.getenv('TEST_XDO');
    const backend = GLib.getenv('TEST_BACKEND');
    try {
        const windows = await run([xdo, 'search', '--onlyvisible', '--name', `^${title}$`]);
        const xid = windows.split('\n').pop();
        const otherWindows = await run([xdo, 'search', '--onlyvisible', '--name', `^${otherTitle}$`]);
        const otherXid = otherWindows.split('\n').pop();
        await run([xdo, 'windowactivate', '--sync', xid]);
        await run([backend, '--start']);
        await run([xdo, 'windowactivate', '--sync', otherXid]);
        await run([backend, '--stop'], { TEST_WINDOW: xid });
        // XTest delivery is queued; wait for GTK to process the key events.
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            passed = entry.get_text().length > 20 && !submitted && otherEntry.get_text() === '';
            if (passed)
                print('PASS: transcription returned to the original window after a focus change');
            else
                printerr('Transcription missed the original window or sent Enter');
            Gtk.main_quit();
            return GLib.SOURCE_REMOVE;
        });
    } catch (error) {
        printerr(error.message);
        Gtk.main_quit();
    }
}

GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
    check();
    return GLib.SOURCE_REMOVE;
});
timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
    timeout = 0;
    printerr('GUI insertion test timed out');
    Gtk.main_quit();
    return GLib.SOURCE_REMOVE;
});
Gtk.main();
if (timeout)
    GLib.source_remove(timeout);
window.destroy();
otherWindow.destroy();
System.exit(passed ? 0 : 1);
