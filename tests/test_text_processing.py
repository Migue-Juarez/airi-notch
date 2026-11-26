import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "text_processing.py"


class TextProcessingTest(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.config = Path(self.temporary_directory.name) / "dictation-rules.json"

    def run_processor(self, text):
        return subprocess.run(
            [sys.executable, str(SCRIPT), str(self.config)],
            input=text,
            capture_output=True,
            text=True,
            check=False,
        )

    def write_config(self, document):
        self.config.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")

    def test_missing_config_only_normalizes_whitespace(self):
        result = self.run_processor("  Hola \n\t mundo  ")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "Hola mundo")

    def test_replacements_are_case_insensitive_and_respect_phrase_boundaries(self):
        self.write_config({
            "replacements": [
                {"phrase": "airi", "replacement": "Airi"},
                {"phrase": "copilot cli", "replacement": "Copilot CLI"},
            ],
        })

        result = self.run_processor("AIRi y Copilot CLI; fairy")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "Airi y Copilot CLI; fairy")

    def test_snippets_expand_only_for_an_exact_full_transcript(self):
        self.write_config({
            "snippets": [
                {"trigger": "iniciar revisión", "text": "Revisá los tests"},
            ],
        })

        exact = self.run_processor("  INICIAR   revisión ")
        partial = self.run_processor("por favor iniciar revisión")
        self.assertEqual(exact.returncode, 0, exact.stderr)
        self.assertEqual(exact.stdout, "Revisá los tests")
        self.assertEqual(partial.stdout, "por favor iniciar revisión")

    def test_snippet_expansion_never_accepts_newlines(self):
        self.write_config({
            "snippets": [
                {"trigger": "iniciar revisión", "text": "correr tests\nrm -rf"},
            ],
        })

        result = self.run_processor("iniciar revisión")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertIn("saltos de línea", result.stderr)

    def test_invalid_configuration_fails_without_emitting_transcription(self):
        self.config.write_text("{", encoding="utf-8")

        result = self.run_processor("texto privado")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertIn("configuración de dictado inválida", result.stderr)


if __name__ == "__main__":
    unittest.main()
