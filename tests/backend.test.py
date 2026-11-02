import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import wave


APP = Path(__file__).resolve().parents[1]
BACKEND = APP / "voice-to-terminal"
DATA_HOME = Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local" / "share")))
APP_DATA = Path(os.environ.get("VOICE_TO_TERMINAL_APP_HOME",
                               str(DATA_HOME / "voice-to-terminal")))


class BackendTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="voice-to-terminal-test-")
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        data = root / "data"
        app = data / "voice-to-terminal"
        bins = root / "bin"
        bins.mkdir()
        self.state = root / "runtime" / "voice-to-terminal"
        self.typed = root / "typed.txt"
        self.active_window = root / "active-window.txt"
        self.xdo_calls = root / "xdotool-calls.txt"
        self.env = dict(os.environ, XDG_DATA_HOME=str(data),
                        XDG_RUNTIME_DIR=str(self.state.parent),
                        XDG_SESSION_TYPE="x11", VOICE_TO_TERMINAL_QUIET="1",
                        PATH=f"{bins}:{os.environ['PATH']}",
                        TEST_TYPED=str(self.typed), TEST_WINDOW="4242",
                        TEST_ACTIVE_FILE=str(self.active_window),
                        TEST_XDO_LOG=str(self.xdo_calls))
        self.addCleanup(lambda: self.run_backend("--cancel"))
        audio = root / "fixture.wav"
        with wave.open(str(audio), "wb") as output:
            output.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
            output.writeframes(b"\0" * 64000)
        self.env["TEST_AUDIO"] = str(audio)
        # A native executable preserves /proc/<pid>/exe identity like arecord.
        source = root / "recorder.c"
        source.write_text("""
#include <stdio.h>
#include <stdlib.h>
#include <signal.h>
#include <unistd.h>
static volatile sig_atomic_t running = 1;
static void stop(int signal_number) { (void)signal_number; running = 0; }
int main(int argc, char **argv) {
    signal(SIGINT, stop);
    FILE *in = fopen(getenv("TEST_AUDIO"), "rb");
    FILE *out = fopen(argv[argc - 1], "wb");
    if (!in || !out) return 1;
    int c;
    while ((c = fgetc(in)) != EOF) fputc(c, out);
    fclose(in);
    fclose(out);
    while (running) usleep(10000);
    return 0;
}
""")
        subprocess.run(["cc", "-Wall", "-Wextra", "-Werror", str(source),
                        "-o", str(bins / "arecord")], check=True)
        multiarch = subprocess.check_output(["cc", "-print-multiarch"], text=True).strip()
        (app / "toolchain" / "usr" / "lib" / multiarch).mkdir(parents=True)
        (app / "models").mkdir()
        (app / "models" / "ggml-base.bin").touch()
        self.script(app / "whisper.cpp/build/bin/whisper-cli",
                    "printf 'dictado local de prueba\\n'\n")
        self.script(app / "toolchain/usr/bin/xdotool", """
case "$1" in
    getactivewindow)
        if [ -f "$TEST_ACTIVE_FILE" ]; then
            cat "$TEST_ACTIVE_FILE"
        else
            printf '%s\\n' "$TEST_WINDOW"
        fi
        ;;
    windowactivate)
        [ "$2" = "--sync" ] || exit 2
        printf '%s\\n' "$3" > "$TEST_ACTIVE_FILE"
        printf '%s\\n' "$*" >> "$TEST_XDO_LOG"
        ;;
    type)
        printf '%s\\n' "$@" > "$TEST_TYPED"
        ;;
    *)
        exit 2
        ;;
esac
""")
        self.script(bins / "notify-send", 'echo "unexpected notification" >&2\nexit 1\n')
        self.app = app

    def script(self, path, body):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("#!/bin/sh\n" + body)
        path.chmod(0o755)

    def run_backend(self, *args):
        return subprocess.run([str(BACKEND), *args], env=self.env,
                              capture_output=True, text=True, timeout=30)

    def test_start_stop_and_quiet_output(self):
        start = self.run_backend("--start")
        self.assertEqual((start.returncode, start.stdout, start.stderr), (0, "", ""))
        self.assertTrue((self.state / "target.window").is_file())
        self.env["TEST_WINDOW"] = "9999"
        stop = self.run_backend("--stop")
        self.assertEqual((stop.returncode, stop.stdout, stop.stderr), (0, "", ""))
        self.assertEqual(self.typed.read_text().splitlines(),
                         ["type", "--clearmodifiers", "--delay", "1", "--", "dictado local de prueba"])
        self.assertEqual(self.xdo_calls.read_text().splitlines(),
                         ["windowactivate --sync 4242"])
        self.assertEqual(self.active_window.read_text().strip(), "4242")
        self.assertFalse((self.state / "recording.pid").exists())
        self.assertFalse((self.state / "recording.wav").exists())
        self.assertFalse((self.state / "target.window").exists())

    def test_explicit_commands_do_not_toggle_wrong_state(self):
        self.assertNotEqual(self.run_backend("--stop").returncode, 0)
        self.assertFalse((self.state / "recording.pid").exists())
        self.assertEqual(self.run_backend("--start").returncode, 0)
        pid = (self.state / "recording.pid").read_text()
        self.assertTrue((self.state / "target.window").is_file())
        self.assertNotEqual(self.run_backend("--start").returncode, 0)
        self.assertEqual((self.state / "recording.pid").read_text(), pid)
        self.assertFalse(self.typed.exists())
        self.assertEqual(self.run_backend("--cancel").returncode, 0)
        self.assertEqual(self.run_backend("--cancel").returncode, 0)
        self.assertFalse((self.state / "recording.wav").exists())
        self.assertFalse((self.state / "target.window").exists())

    def test_failed_transcription_cleans_state_without_typing(self):
        self.script(self.app / "whisper.cpp/build/bin/whisper-cli", "exit 1\n")
        self.assertEqual(self.run_backend("--start").returncode, 0)
        self.assertNotEqual(self.run_backend("--stop").returncode, 0)
        self.assertFalse(self.typed.exists())
        self.assertFalse((self.state / "recording.pid").exists())
        self.assertFalse((self.state / "recording.wav").exists())

    @unittest.skipUnless(os.environ.get("VOICE_TO_TERMINAL_GUI_TEST") == "1",
                         "Requires a local X11 desktop and the installed Whisper model")
    def test_real_whisper_and_x11_insertion(self):
        for relative in ["whisper.cpp/build/bin/whisper-cli", "models/ggml-base.bin"]:
            target = self.app / relative
            target.unlink()
            target.symlink_to(APP_DATA / relative)
        self.env["TEST_AUDIO"] = str(APP_DATA / "whisper.cpp/samples/jfk.wav")
        self.env["TEST_XDO"] = str(APP_DATA / "toolchain/usr/bin/xdotool")
        self.env["LD_LIBRARY_PATH"] = str(
            APP_DATA / "toolchain/usr/lib" /
            subprocess.check_output(["cc", "-print-multiarch"], text=True).strip())
        self.env["TEST_BACKEND"] = str(BACKEND)
        self.script(self.app / "toolchain/usr/bin/xdotool",
                    'if [ "$1" = "type" ]; then\n'
                    '  active=$("$TEST_XDO" getactivewindow) || exit 1\n'
                    '  [ "$active" = "$TEST_WINDOW" ] || {\n'
                    '    echo "Test window lost focus: expected $TEST_WINDOW, found $active" >&2\n'
                    '    exit 1\n'
                    '  }\n'
                    'fi\n'
                    'exec "$TEST_XDO" "$@"\n')
        result = subprocess.run(["gjs", str(APP / "tests/insertion.gjs")],
                                env=self.env, capture_output=True, text=True, timeout=90)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("PASS: transcription returned to the original window after a focus change",
                      result.stdout)


if __name__ == "__main__":
    unittest.main()
