# Voice to Terminal

Dictado local en Ubuntu para escribir una transcripción en la ventana enfocada. Usa `arecord`, Whisper.cpp y `xdotool` bajo X11; la extensión GNOME conserva el robot de la barra superior y añade un avatar flotante minimalista en la esquina superior izquierda.

## Instalación

Compatible actualmente con Ubuntu 24.04, GNOME Shell 46, X11 y x86_64. Descarga o clona este repositorio, entra a su directorio raíz y ejecuta:

```bash
bash ./install.sh
```

La configuración inicial descarga paquetes oficiales de Ubuntu a `~/.local/share/voice-to-terminal`, compila Whisper.cpp desde la versión fijada `v1.9.5` y descarga el modelo multilingüe `base` (aprox. 142 MiB). El comando se instala en `~/.local/bin`; la extensión GNOME, en el directorio de extensiones del usuario. No instala paquetes globales ni usa `sudo`, pero requiere internet durante la configuración inicial. Si GNOME no carga la extensión en la sesión actual, cierra sesión y vuelve a entrar para que aparezca el icono.

## Uso

El robot de la barra superior y el avatar flotante de la esquina superior izquierda abren la misma tarjeta conversacional junto al acceso usado; ninguno inicia la grabación por sí solo. El avatar flotante hace un pulso sutil, queda a la izquierda de la burbuja y puede arrastrarse por el monitor principal, sin salir de los límites visibles ni cubrir el panel; su posición se conserva entre sesiones en `~/.config/voice-to-terminal/floating-position.json`. El avatar y el botón del micrófono admiten foco por teclado y tienen nombres accesibles. Pulsa el botón del micrófono para grabar; la tarjeta permanece en el mismo lugar aunque GNOME reacomode los iconos al activar el micrófono. Durante la grabación, las barras reaccionan al volumen capturado y el borde de la tarjeta se vuelve rojo. Pulsa detener para insertar el texto en español en la ventana que tenía el foco al iniciar. No se pulsa Enter; el foco se restaura aunque cambie durante la grabación.

La tarjeta incluye un botón para ocultar o volver a mostrar el avatar flotante; la preferencia se conserva entre sesiones. Aunque esté oculto, el robot del panel sigue abriendo los controles y desde allí se puede grabar o mostrar de nuevo el avatar. Un segundo clic en el acceso cierra la tarjeta cuando está inactiva; durante la grabación o transcripción permanece visible para conservar el acceso al control. La tarjeta muestra el robot a la izquierda, el estado al centro y los botones de visibilidad y micrófono al extremo derecho. Durante el inicio y la transcripción aparecen puntos animados; en reposo muestra solo **Dictado local**, sin el estado «Listo». Al finalizar, muestra **Mensaje listo**, una confirmación verde y una vista previa efímera del texto; después de 1,5 segundos se cierra suavemente, salvo que el cursor esté sobre la tarjeta. El texto se transmite a la extensión solo para esta vista temporal y no se guarda en archivos ni logs. El micrófono que GNOME muestra junto al volumen pertenece a los ajustes del sistema, no al dictado. No se configura ningún atajo global ni se modifica `Ctrl+Space` de IBus.

El robot y el icono del panel parpadean; el control muestra `Grabando...` o `Transcribiendo...`. Estos indicadores funcionan incluso si las animaciones de GNOME están desactivadas. No se generan notificaciones de progreso, solo de error. La ventana de destino se recuerda al iniciar el dictado y se reactiva al detener.

Después de actualizar el código de la extensión, en X11 recarga GNOME con **Alt+F2**, escribe `r` y pulsa Enter. Deshabilitar y habilitar la extensión no garantiza recargar sus módulos JavaScript. Al habilitarla se cancela cualquier grabación anterior para recuperar un estado conocido.

En esta máquina `Ctrl+Space` está asignado a IBus y no se modifica. Wayland no está soportado por esta instalación.

El audio temporal se guarda con permisos privados en el directorio de runtime del usuario y se elimina al completar el procesamiento. Para deshabilitar la interfaz, ejecuta `gnome-extensions disable voice-to-terminal@migue.local`.

El comando admite `--start`, `--stop` y `--cancel`; sin argumentos conserva el modo alternador. La extensión usa comandos explícitos para evitar que un intento de detener inicie otra grabación por un estado desincronizado. Para cancelar manualmente:

```bash
VOICE_TO_TERMINAL_QUIET=1 "$HOME/.local/bin/voice-to-terminal" --cancel
```

## Comprobaciones

```bash
bash -n voice-to-terminal install.sh
node --test tests/extension.test.mjs
python3 tests/test_audio_meter.py
python3 tests/backend.test.py
```

Prueba opcional en X11 con una ventana GTK de texto, Whisper y el modelo instalados:

```bash
VOICE_TO_TERMINAL_GUI_TEST=1 python3 tests/backend.test.py BackendTest.test_real_whisper_and_x11_insertion
```

Esta prueba usa dos ventanas temporales y el audio de ejemplo local de Whisper, no el micrófono. Cambia el foco a la segunda durante la grabación y comprueba que la transcripción vuelve a la ventana original sin pulsar Enter. El runtime instalado debe estar en `~/.local/share/voice-to-terminal` (o en la ruta indicada por `VOICE_TO_TERMINAL_APP_HOME`).

## Licencia

Pendiente de definir. Por ahora, este repositorio es para compartir dentro del equipo; no redistribuir públicamente hasta acordar una licencia y revisar los derechos de los recursos gráficos.
