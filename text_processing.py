#!/usr/bin/env python3

import json
import re
import sys
import unicodedata
from pathlib import Path


class RulesError(ValueError):
    pass


def normalize_transcript(text):
    return " ".join(unicodedata.normalize("NFC", text).split())


def _config_text(value, label):
    if not isinstance(value, str):
        raise RulesError(f"{label} debe ser texto.")
    if any(ord(character) < 32 or ord(character) == 127 for character in value):
        raise RulesError(f"{label} no puede contener saltos de línea ni controles.")
    normalized = normalize_transcript(value)
    if not normalized:
        raise RulesError(f"{label} no puede estar vacío.")
    return normalized


def load_rules(path):
    try:
        document = json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return [], {}
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise RulesError(f"No se pudo leer la configuración: {error}") from error

    if not isinstance(document, dict):
        raise RulesError("La raíz de la configuración debe ser un objeto JSON.")
    unknown_keys = set(document) - {"replacements", "snippets"}
    if unknown_keys:
        raise RulesError(f"Claves desconocidas: {', '.join(sorted(unknown_keys))}.")

    replacements = document.get("replacements", [])
    snippets = document.get("snippets", [])
    if not isinstance(replacements, list) or not isinstance(snippets, list):
        raise RulesError("'replacements' y 'snippets' deben ser listas.")

    replacement_rules = []
    seen_replacements = set()
    for index, rule in enumerate(replacements, start=1):
        label = f"replacements[{index}]"
        if not isinstance(rule, dict) or set(rule) != {"phrase", "replacement"}:
            raise RulesError(f"{label} debe tener 'phrase' y 'replacement'.")
        phrase = _config_text(rule["phrase"], f"{label}.phrase")
        replacement = _config_text(rule["replacement"], f"{label}.replacement")
        key = phrase.casefold()
        if key in seen_replacements:
            raise RulesError(f"Frase repetida en {label}.")
        seen_replacements.add(key)
        replacement_rules.append((phrase, replacement))

    snippet_rules = {}
    for index, rule in enumerate(snippets, start=1):
        label = f"snippets[{index}]"
        if not isinstance(rule, dict) or set(rule) != {"trigger", "text"}:
            raise RulesError(f"{label} debe tener 'trigger' y 'text'.")
        trigger = _config_text(rule["trigger"], f"{label}.trigger")
        text = _config_text(rule["text"], f"{label}.text")
        key = trigger.casefold()
        if key in snippet_rules:
            raise RulesError(f"Disparador repetido en {label}.")
        snippet_rules[key] = text

    return replacement_rules, snippet_rules


def apply_rules(text, replacement_rules, snippet_rules):
    result = normalize_transcript(text)
    if not result:
        return ""

    for phrase, replacement in replacement_rules:
        pattern = re.compile(
            rf"(?<!\w){re.escape(phrase)}(?!\w)",
            flags=re.IGNORECASE,
        )
        result = pattern.sub(lambda _match: replacement, result)

    snippet = snippet_rules.get(result.casefold())
    if snippet is not None:
        result = snippet
        for phrase, replacement in replacement_rules:
            pattern = re.compile(
                rf"(?<!\w){re.escape(phrase)}(?!\w)",
                flags=re.IGNORECASE,
            )
            result = pattern.sub(lambda _match: replacement, result)

    return result


def main(arguments):
    if len(arguments) != 2:
        print("Uso: text_processing.py RUTA_CONFIG", file=sys.stderr)
        return 2
    try:
        replacements, snippets = load_rules(arguments[1])
        text = apply_rules(sys.stdin.read(), replacements, snippets)
    except RulesError as error:
        print(f"Airi: configuración de dictado inválida: {error}", file=sys.stderr)
        return 2
    sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
