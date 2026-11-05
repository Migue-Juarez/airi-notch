#!/usr/bin/env python3

import math
import os
from pathlib import Path
import struct
import sys
import time


WAV_HEADER_SIZE = 44
BYTES_PER_UPDATE = 3200
LEVEL_GAIN = 8.0


def calculate_level(pcm):
    usable_bytes = len(pcm) - len(pcm) % 2
    if usable_bytes == 0:
        return 0.0

    sample_count = usable_bytes // 2
    samples = struct.unpack(f"<{sample_count}h", pcm[:usable_bytes])
    rms = math.sqrt(sum(sample * sample for sample in samples) / sample_count) / 32768
    return min(1.0, rms * LEVEL_GAIN)


def recorder_is_running(pid, executable):
    try:
        status = Path(f"/proc/{pid}/status").read_text(encoding="ascii")
        state = next(line.split()[1] for line in status.splitlines()
                     if line.startswith("State:"))
        return state != "Z" and Path(f"/proc/{pid}/exe").resolve() == Path(executable).resolve()
    except (OSError, StopIteration, ValueError):
        return False


def write_status(path, value):
    temporary = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    temporary.write_text(f"{time.time():.6f} {value}\n", encoding="ascii")
    os.replace(temporary, path)


def monitor(audio_path, level_path, recorder_pid, recorder_executable):
    os.umask(0o077)
    write_status(level_path, "0.000")

    while recorder_is_running(recorder_pid, recorder_executable) and not audio_path.exists():
        time.sleep(0.05)

    if not recorder_is_running(recorder_pid, recorder_executable):
        return

    offset = WAV_HEADER_SIZE
    with audio_path.open("rb", buffering=0) as audio:
        while recorder_is_running(recorder_pid, recorder_executable):
            audio.seek(offset)
            pcm = audio.read(BYTES_PER_UPDATE)
            usable_bytes = len(pcm) - len(pcm) % 2
            if usable_bytes:
                offset += usable_bytes
                write_status(level_path, f"{calculate_level(pcm):.3f}")
            else:
                time.sleep(0.05)


def main(argv):
    if len(argv) != 5:
        print("Uso: audio_meter.py WAV NIVEL PID_ARECORD EJECUTABLE_ARECORD", file=sys.stderr)
        return 2

    audio_path, level_path = map(Path, argv[1:3])
    try:
        monitor(audio_path, level_path, int(argv[3]), argv[4])
    except (OSError, ValueError, struct.error) as error:
        try:
            write_status(level_path, f"ERROR {error}")
        except OSError as write_error:
            print(f"audio-meter: {write_error}", file=sys.stderr)
        print(f"audio-meter: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
