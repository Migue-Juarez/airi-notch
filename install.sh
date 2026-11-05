#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
APP_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/voice-to-terminal"
LOCAL_BIN="$HOME/.local/bin"
TOOLCHAIN="$APP_HOME/toolchain"
PACKAGE_CACHE="$APP_HOME/packages"
SOURCE="$APP_HOME/whisper.cpp"
MODEL_DIR="$APP_HOME/models"
MODEL="$MODEL_DIR/ggml-base.bin"
MODEL_TMP="$MODEL_DIR/ggml-base.bin.partial"
PROJECT_ENTRYPOINT="$PROJECT_ROOT/voice-to-terminal"
ENTRYPOINT="$APP_HOME/voice-to-terminal"
LINK="$LOCAL_BIN/voice-to-terminal"
EXTENSION_UUID="voice-to-terminal@migue.local"
EXTENSION_SOURCE="$PROJECT_ROOT/gnome-shell-extension"
EXTENSION_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$EXTENSION_UUID"
WHISPER_COMMIT="d1be6fde11ac6e0407606b4e42fe72d34add8037"
MODEL_SHA1="465707469ff3a37a2b9b8d8f89f2f99de7299dac"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"

die() {
    printf 'install-voice-to-terminal: %s\n' "$1" >&2
    exit 1
}

[[ -f /etc/os-release ]] || die "No se pudo identificar la distribución."
. /etc/os-release
[[ "${ID:-}" == ubuntu ]] || die "Este instalador está preparado para Ubuntu."
[[ "${XDG_SESSION_TYPE:-}" == x11 ]] || die "La inserción automática solo está configurada para X11."
[[ "$(uname -m)" == x86_64 ]] || die "La extracción local de dependencias está preparada para x86_64."
[[ -f "$PROJECT_ENTRYPOINT" ]] || die "No se encontró el comando del proyecto: $PROJECT_ENTRYPOINT."
[[ -f "$PROJECT_ROOT/audio_meter.py" ]] || die "No se encontró el medidor de audio del proyecto."

for command_name in apt-get dpkg-deb git curl sha1sum cc make arecord notify-send python3 gnome-extensions install gsettings; do
    command -v "$command_name" >/dev/null 2>&1 || die "Falta la herramienta requerida: $command_name."
done

mkdir -p "$APP_HOME" "$LOCAL_BIN" "$PACKAGE_CACHE" "$MODEL_DIR"

if [[ -e "$LINK" && ! -L "$LINK" ]]; then
    die "$LINK ya existe y no es un enlace de esta instalación; no se sobrescribió."
fi
if [[ -L "$LINK" && "$(readlink "$LINK")" != "$ENTRYPOINT" ]]; then
    die "$LINK apunta a otro destino; no se sobrescribió."
fi

if [[ ! -x "$TOOLCHAIN/usr/bin/cmake" || ! -x "$TOOLCHAIN/usr/bin/xdotool" ]]; then
    printf '%s\n' "Descargando paquetes Ubuntu al directorio local (sin instalarlos en el sistema)..."
    (
        cd "$PACKAGE_CACHE"
        apt-get download cmake cmake-data libjsoncpp25 librhash0 xdotool libxdo3
    )
    for package in "$PACKAGE_CACHE"/*.deb; do
        [[ -f "$package" ]] || die "No se descargaron los paquetes locales necesarios."
        dpkg-deb -x "$package" "$TOOLCHAIN"
    done
fi

MULTIARCH="$(cc -print-multiarch)"
LOCAL_LIB="$TOOLCHAIN/usr/lib/$MULTIARCH"
CMAKE="$TOOLCHAIN/usr/bin/cmake"
XDO="$TOOLCHAIN/usr/bin/xdotool"
[[ -x "$CMAKE" && -x "$XDO" ]] || die "No se encontraron cmake/xdotool en la instalación local."
[[ -d "$LOCAL_LIB" ]] || die "No se encontró el directorio local de bibliotecas: $LOCAL_LIB."
CMMAKE_ROOT="$(find "$TOOLCHAIN/usr/share" -maxdepth 1 -type d -name 'cmake-*' -print -quit)"
[[ -n "$CMMAKE_ROOT" ]] || die "No se encontraron los módulos de CMake descargados."
export LD_LIBRARY_PATH="$LOCAL_LIB${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export CMAKE_ROOT="$CMMAKE_ROOT"
"$CMAKE" --version >/dev/null || die "CMake no pudo iniciarse con sus bibliotecas locales."
"$XDO" --version >/dev/null 2>&1 || die "xdotool no pudo iniciarse con sus bibliotecas locales."

if [[ ! -d "$SOURCE/.git" ]]; then
    git clone --depth 1 --branch v1.9.5 https://github.com/ggml-org/whisper.cpp.git "$SOURCE"
fi
[[ "$(git -C "$SOURCE" remote get-url origin)" == "https://github.com/ggml-org/whisper.cpp.git" ]] ||
    die "El origen de whisper.cpp no coincide con el repositorio oficial esperado."
[[ "$(git -C "$SOURCE" rev-parse HEAD)" == "$WHISPER_COMMIT" ]] ||
    die "La versión local de whisper.cpp no coincide con la versión fijada; no se modificó."
[[ -z "$(git -C "$SOURCE" status --porcelain)" ]] ||
    die "whisper.cpp tiene cambios locales; no se sobrescribieron."

if [[ ! -f "$MODEL" ]]; then
    printf '%s\n' "Descargando el modelo multilingüe base (aprox. 142 MiB)..."
    curl --proto '=https' --tlsv1.2 --fail --location --retry 3 \
        --output "$MODEL_TMP" "$MODEL_URL"
    if ! printf '%s  %s\n' "$MODEL_SHA1" "$MODEL_TMP" | sha1sum --check --status; then
        rm -f -- "$MODEL_TMP"
        die "El hash del modelo no coincide con el publicado por whisper.cpp."
    fi
    mv -- "$MODEL_TMP" "$MODEL"
fi
if ! printf '%s  %s\n' "$MODEL_SHA1" "$MODEL" | sha1sum --check --status; then
    die "El modelo local no coincide con el hash publicado por whisper.cpp."
fi

printf '%s\n' "Compilando whisper.cpp para esta máquina..."
"$CMAKE" -S "$SOURCE" -B "$SOURCE/build" \
    -DCMAKE_BUILD_TYPE=Release \
    -DWHISPER_BUILD_IS_DEV=OFF \
    -DWHISPER_BUILD_TESTS=OFF \
    -DWHISPER_BUILD_EXAMPLES=ON \
    -DWHISPER_BUILD_SERVER=OFF \
    -DWHISPER_CURL=OFF \
    -DGGML_NATIVE=ON
"$CMAKE" --build "$SOURCE/build" --config Release --parallel "$(nproc)"
[[ -x "$SOURCE/build/bin/whisper-cli" ]] || die "No se generó whisper-cli."

if [[ "$PROJECT_ENTRYPOINT" != "$ENTRYPOINT" ]]; then
    install -m 755 "$PROJECT_ENTRYPOINT" "$ENTRYPOINT"
fi
if [[ "$PROJECT_ROOT/audio_meter.py" != "$APP_HOME/audio_meter.py" ]]; then
    install -m 755 "$PROJECT_ROOT/audio_meter.py" "$APP_HOME/audio_meter.py"
fi
chmod 755 "$ENTRYPOINT"
ln -sfn "$ENTRYPOINT" "$LINK"

[[ -f "$EXTENSION_SOURCE/metadata.json" && -f "$EXTENSION_SOURCE/extension.js" && -f "$EXTENSION_SOURCE/robot-face.svg" && -f "$EXTENSION_SOURCE/microphone.svg" ]] ||
    die "No están los archivos de la extensión GNOME."
if [[ -e "$EXTENSION_DIR" ]]; then
    [[ -f "$EXTENSION_DIR/metadata.json" ]] || die "La ruta de la extensión ya existe y no se sobrescribió."
    [[ "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["uuid"])' "$EXTENSION_DIR/metadata.json")" == "$EXTENSION_UUID" ]] ||
        die "La ruta de la extensión pertenece a otro componente y no se sobrescribió."
fi
mkdir -p "$EXTENSION_DIR"
gnome-extensions pack --force --extra-source="$EXTENSION_SOURCE/robot-face.svg" \
    --extra-source="$EXTENSION_SOURCE/microphone.svg" \
    --out-dir "$APP_HOME" "$EXTENSION_SOURCE"
install -m 644 "$EXTENSION_SOURCE/metadata.json" "$EXTENSION_SOURCE/extension.js" \
    "$EXTENSION_SOURCE/robot-face.svg" "$EXTENSION_SOURCE/microphone.svg" "$EXTENSION_DIR/"

enabled="$(gsettings get org.gnome.shell enabled-extensions)"
enabled_with_extension="$(python3 - "$enabled" "$EXTENSION_UUID" <<'PY'
import ast
import sys

raw = sys.argv[1]
if raw.startswith("@as "):
    raw = raw[4:]
extensions = ast.literal_eval(raw)
if sys.argv[2] not in extensions:
    extensions.append(sys.argv[2])
print("[" + ", ".join("'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'" for value in extensions) + "]")
PY
)"
gsettings set org.gnome.shell enabled-extensions "$enabled_with_extension"

if gnome-extensions info "$EXTENSION_UUID" >/dev/null 2>&1; then
    gnome-extensions enable "$EXTENSION_UUID"
    EXTENSION_STATUS="habilitada en la sesión actual"
else
    EXTENSION_STATUS="instalada; requiere cerrar y volver a abrir la sesión GNOME"
fi

printf '\n%s\n' "Instalación terminada."
printf 'Comando: %s\n' "$LINK"
printf 'Modelo local: %s\n' "$MODEL"
printf 'Extensión: %s\n' "$EXTENSION_STATUS"
printf '%s\n' "Clic en el icono de la barra para abrir los controles; usa el micrófono para iniciar y detener el dictado."
printf '%s\n' "La transcripción se procesa localmente; no se envía audio ni texto por red."
