# Airi

Airi es una extensión de GNOME para dictar localmente en la ventana enfocada y recibir avisos cuando Copilot termina. Usa `arecord`, Whisper.cpp y `xdotool` bajo X11; Airi aparece como robot en la barra superior y como mascota 3D flotante en la esquina superior izquierda.

## Instalación

Compatible actualmente con Ubuntu 24.04, GNOME Shell 46, X11 y x86_64. Descarga o clona este repositorio, entra a su directorio raíz y ejecuta:

```bash
bash ./install.sh
```

La configuración inicial descarga paquetes oficiales de Ubuntu a `~/.local/share/voice-to-terminal`, compila Whisper.cpp desde la versión fijada `v1.9.5` y descarga el modelo multilingüe `base` (aprox. 142 MiB). El comando se instala en `~/.local/bin`; la extensión GNOME, en el directorio de extensiones del usuario. No instala paquetes globales ni usa `sudo`, pero requiere internet durante la configuración inicial. Si GNOME no carga la extensión en la sesión actual, cierra sesión y vuelve a entrar para que aparezca el icono.

## Uso

El robot de la barra superior y la mascota flotante de la esquina superior izquierda abren la misma tarjeta conversacional junto al acceso usado; ninguno inicia la grabación por sí solo. El control flotante mide 112 px y usa chasis transparentes, con sombra paralela suave; reposa de frente y se perfila a 3/4 al activarse. Sus ojos esmeralda se dibujan por código, parpadean en reposo y hacen micro-movimientos al procesar. Al abrir sus controles, el robot se superpone ligeramente a la tarjeta y queda al frente; el texto tiene espacio adicional respecto del robot y los botones circulares mantienen el contraste verde. Puede arrastrarse por el monitor principal sin salir de los límites visibles ni cubrir el panel; su posición se conserva en `~/.config/voice-to-terminal/floating-position.json`. El control flotante y el botón del micrófono admiten foco por teclado y tienen nombres accesibles. Pulsa el botón del micrófono para grabar; la tarjeta permanece en el mismo lugar aunque GNOME reacomode los iconos al activar el micrófono. Durante la grabación, las barras reaccionan al volumen capturado y el borde de la tarjeta se vuelve verde. Pulsa detener para insertar el texto en español en la ventana que tenía el foco al iniciar. No se pulsa Enter; el foco se restaura aunque cambie durante la grabación.

La tarjeta incluye un botón para ocultar o volver a mostrar la mascota flotante; la preferencia se conserva entre sesiones. Aunque esté oculta, el robot del panel sigue abriendo los controles. La tarjeta no repite la mascota: muestra estados, resultados y avisos a la izquierda, con los botones de visibilidad y micrófono a la derecha. En reposo omite el texto redundante **Dictado local** y se reduce al tamaño de los controles. Un segundo clic en el acceso cierra la tarjeta cuando está inactiva; durante la grabación o transcripción permanece visible para conservar el acceso al control. Durante el inicio y la transcripción aparecen puntos animados. Al finalizar el dictado, muestra **Mensaje listo** y una vista previa efímera; la tarjeta hace un desplazamiento horizontal de 4 px con un micro-rebote, usando transiciones breves ease-out, y después de 1,5 segundos se cierra suavemente, salvo que el cursor esté sobre la tarjeta. La transcripción no se guarda en archivos ni logs.

Al enviar un prompt, Airi cambia a estado **Copilot trabajando** sin abrir una tarjeta ni reproducir sonido. Al abrir los controles mientras Copilot trabaja, la tarjeta muestra ese estado con un brillo sutil y ajusta su ancho con un breve rebote; la segunda línea presenta el proyecto y el resumen de la tarea, truncado a 200 px. Mientras esa tarjeta está visible, el robot entrecierra los ojos y hace micro-saccades; al cerrarla, vuelve a reposo. El botón conserva su función de micrófono y no cancela Copilot. Si Copilot solicita permiso o una respuesta, muestra una tarjeta persistente con el nombre del proyecto, un resumen breve de la tarea y una indicación en español; el robot muestra ojos abiertos y la tarjeta se mantiene hasta que esa sesión reanuda o termina. Airi detecta esos cambios desde los hooks de Copilot, así que no hace falta marcar manualmente que respondiste. Cada sesión mantiene su propio estado para que una no borre la atención pendiente de otra. Al completar una tarea, Airi muestra el mensaje personalizado como **Copilot listo** y reproduce `/usr/share/sounds/freedesktop/stereo/bell.oga` con un refuerzo de 3 dB. El marcador `{project}` del mensaje se reemplaza por el nombre de la carpeta de trabajo informada por Copilot. Los errores se muestran sin sonido y con el nombre del proyecto. Los avisos de finalización y error desaparecen después de 5 segundos o cuando se retira el cursor. Los eventos se consumen desde archivos temporales con permisos privados. El comando conserva su salida para la notificación de Copilot. El micrófono que GNOME muestra junto al volumen pertenece a los ajustes del sistema, no al dictado. No se configura ningún atajo global ni se modifica `Ctrl+Space` de IBus.

La mascota cambia entre retratos de espera, escucha, procesamiento y confirmación. En reposo, el retrato flotante alterna brevemente entre ojos abiertos y cerrados sin cambiar de tamaño; el medidor de audio y los puntos de procesamiento siguen animándose incluso si las animaciones de GNOME están desactivadas. No se notifican progresos, solo la finalización de Copilot y los errores. La ventana de destino se recuerda al iniciar el dictado y se reactiva al detener.

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
