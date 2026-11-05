import importlib.util
from pathlib import Path
import struct
import unittest


PROJECT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("audio_meter", PROJECT / "audio_meter.py")
AUDIO_METER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIO_METER)


class AudioMeterTest(unittest.TestCase):
    def test_silence_has_no_level(self):
        self.assertEqual(AUDIO_METER.calculate_level(b"\0\0" * 100), 0.0)

    def test_level_tracks_pcm_rms_and_clamps(self):
        samples = struct.pack("<hhhh", 2048, -2048, 2048, -2048)
        self.assertAlmostEqual(AUDIO_METER.calculate_level(samples), 0.5)
        self.assertEqual(AUDIO_METER.calculate_level(b"\xff\x7f" * 100), 1.0)

    def test_incomplete_sample_is_ignored(self):
        self.assertEqual(AUDIO_METER.calculate_level(b"\0"), 0.0)


if __name__ == "__main__":
    unittest.main()
