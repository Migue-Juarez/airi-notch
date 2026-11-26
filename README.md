# Airi

Airi es una extensión de GNOME para dictar localmente en la ventana enfocada y recibir avisos cuando Copilot termina. Usa `arecord`, Whisper.cpp y `xdotool` bajo X11; Airi aparece como robot en la barra superior y como mascota 3D flotante en la esquina superior izquierda.

## Instalación

Compatible actualmente con Ubuntu 24.04, GNOME Shell 46, X11 y x86_64. Descarga o clona este repositorio, entra a su directorio raíz y ejecuta:

```bash
bash ./install.sh
```

La configuración inicial descarga paquetes oficiales de Ubuntu a `~/.local/share/voice-to-terminal`, compila Whisper.cpp desde la versión fijada `v1.9.5` y descarga el modelo multilingüe `base` (aprox. 142 MiB). El comando se instala en `~/.local/bin`; la extensión GNOME, en el directorio de extensiones del usuario. No instala paquetes globales ni usa `sudo`, pero requiere internet durante la configuración inicial. Si GNOME no carga la extensión en la sesión actual, cierra sesión y vuelve a entrar para que aparezca el icono.

## Uso

Al mantener el cursor sobre la mascota durante 350 ms, aparece la pista breve **Abrir controles**; con los controles abiertos cambia a **Cerrar controles**. La cara usa ojos más redondeados y una sonrisa más visible, sin animaciones constantes.

El robot de la barra superior y la mascota flotante abren paneles distintos y excluyentes. El icono de Airi queda centrado en la pantalla; la fecha y hora se desplazan a su izquierda dentro de la zona central de la barra. El panel de la barra es amplio y organiza Inicio, Dictado y Copilot. Inicio abre por defecto y muestra la hora y fecha local, el estado de Airi y un resumen de sesiones y atención de Copilot; **Ver sesiones** abre la vista Copilot. El flotante es compacto y muestra el estado, un resumen de sesiones y los controles rápidos. Ninguno inicia la grabación por sí solo. El control flotante mide 112 px y usa chasis transparentes, con sombra paralela suave; reposa de frente y se perfila a 3/4 al activarse. Su cara se compone por código: parpadea en reposo, sigue el cursor cuando está a menos de 180 px y hace micro-saccades mientras Copilot trabaja. Las gafas violetas expresan enfoque y las mejillas teal celebran la finalización; al entrar en trabajo o completar una tarea, hace un squash-and-stretch breve. Tiene 12 reacciones contextuales, no aleatorias: Contento, Guiño, Enamorado, Saludo, Bostezo, Escucha, Mareado, Orgulloso, Ánimo, Sorpresa, Molesto y Festejo. El bostezo aparece tras tres minutos de reposo; las demás reacciones responden a hover, paneles, dictado y estados de Copilot. Puede arrastrarse por el monitor principal sin salir de los límites visibles ni cubrir el panel; su posición se conserva en `~/.config/voice-to-terminal/floating-position.json`. Los controles de ambos paneles admiten foco por teclado y tienen nombres accesibles. Pulsa el botón del micrófono para grabar; durante la grabación, las barras reaccionan al volumen capturado y el borde del panel se resalta en teal. Pulsa detener para insertar el texto en español en la ventana que tenía el foco al iniciar. No se pulsa Enter; el foco se restaura aunque cambie durante la grabación.
El panel expandido (notch) aparece centrado horizontalmente debajo de la barra; el panel compacto sigue anclado a la mascota flotante.

Inicio consulta la cuota `premium_interactions` mediante el SDK oficial de Copilot y muestra el uso, el límite, los créditos restantes y el porcentaje disponible. También muestra el campo `resetDate` que devuelve el SDK, marcado como no confirmado: en la validación actual difiere del reinicio de ciclo mostrado por GitHub. La consulta se actualiza cada cinco minutos mientras Inicio está abierto; requiere Node.js, el SDK instalado y una sesión autenticada del Copilot CLI. Esta consulta solo obtiene métricas de cuenta; no lee ni guarda prompts.

El panel amplio tiene una navegación modular para Inicio, Dictado y Copilot; cuando no hay sesiones, Copilot muestra un estado vacío. El flotante mantiene solo la información y las acciones rápidas. Ningún panel repite la mascota. Ambos permiten ocultar o volver a mostrar el robot flotante, y conservan esa preferencia entre sesiones. En reposo omiten el texto redundante **Dictado local**. Un segundo clic en el acceso activo cierra el panel cuando está inactivo; durante la grabación o transcripción permanece visible para conservar el acceso al control. Durante el inicio y la transcripción aparecen puntos animados. Al finalizar el dictado, muestra **Mensaje listo** y una vista previa efímera; el panel hace un desplazamiento horizontal de 4 px con un micro-rebote, usando transiciones breves ease-out, y después de 1,5 segundos se cierra suavemente, salvo que el cursor esté sobre él. La transcripción no se guarda en archivos ni logs.

Al enviar un prompt, Airi cambia a estado de procesamiento sin abrir un panel ni reproducir sonido. En la vista Copilot del panel amplio, las sesiones se agrupan por proyecto y muestran su título, estado y tiempo desde la última actualización; no se muestran prompts, comandos ni rutas completas. La navegación cuenta las sesiones que necesitan respuesta; cada una puede posponerse cinco minutos y recibir un único recordatorio si sigue pendiente. La tarjeta flotante resume la sesión prioritaria. La paleta híbrida usa carbón y superficies neutras para evitar bloques de color innecesarios; teal identifica Dictado, mientras violeta conecta la navegación y los estados de Copilot. El nombre del proyecto lleva un acento violeta oscuro, sin cápsulas de fondo. La vista Copilot suma resplandores azul/violeta y glifos abstractos de baja opacidad que se mueven suavemente; la animación se detiene al salir de esa vista. Naranja y rojo se reservan para atención y error. `sessionStart` registra cada sesión como abierta y `sessionEnd` la elimina; el estado persiste en `XDG_RUNTIME_DIR` para restaurar la lista después de recargar la extensión. Las sesiones abiertas antes de instalar el hook `sessionStart` deben reanudarse para aparecer. El robot entrecierra los ojos y hace micro-saccades mientras un panel está visible; al cerrarlo, vuelve a reposo. El botón de micrófono mide 48 px y el de visibilidad del robot, 44 px. El panel amplio mide 720 px y la tarjeta flotante, 340 px como máximo; ambos se ajustan a pantallas más estrechas y dejan 12 px entre la tarjeta flotante y el robot. Si Copilot solicita permiso o una respuesta, el aviso aparece junto a la mascota flotante cuando está visible; si está oculta, aparece junto al icono de la barra. Desaparece después de 5 segundos o al retirar el cursor; la fila «Necesita respuesta» permanece hasta que esa sesión reanuda o termina. Airi detecta esos cambios desde los hooks de Copilot, así que no hace falta marcar manualmente que respondiste. Cada sesión mantiene su propio estado para que una no borre la atención pendiente de otra. Al completar una tarea, Airi muestra **Copilot listo**, el título de la sesión en crema y con mayor tamaño, y debajo el mensaje personalizado; reproduce `/usr/share/sounds/freedesktop/stereo/bell.oga` con un refuerzo de 3 dB. `{sessionName}` se reemplaza por el título de Copilot y, si falta, se usa `{project}` como respaldo. Los errores se muestran sin sonido junto al nombre de la sesión cuando está disponible. Los avisos de finalización y error desaparecen después de 5 segundos o cuando se retira el cursor. Los eventos se consumen desde archivos temporales con permisos privados. El comando conserva su salida para la notificación de Copilot. El micrófono que GNOME muestra junto al volumen pertenece a los ajustes del sistema, no al dictado. No se configura ningún atajo global ni se modifica `Ctrl+Space` de IBus.

El dictado aplica reglas locales opcionales desde `~/.config/voice-to-terminal/dictation-rules.json` (o `$XDG_CONFIG_HOME/voice-to-terminal/dictation-rules.json`). `replacements` reemplaza frases completas sin distinguir mayúsculas; `snippets` expande una frase solo si coincide con toda la transcripción. Los reemplazos se aplican en orden y también a los snippets expandidos. Por seguridad, la configuración no admite saltos de línea ni caracteres de control: el dictado nunca envía Enter. Si el archivo no existe, el texto se inserta sin transformaciones; si tiene JSON inválido, Airi informa el error y no escribe el texto.

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
python3 tests/test_text_processing.py
```

Prueba opcional en X11 con una ventana GTK de texto, Whisper y el modelo instalados:

```bash
VOICE_TO_TERMINAL_GUI_TEST=1 python3 tests/backend.test.py BackendTest.test_real_whisper_and_x11_insertion
```

Esta prueba usa dos ventanas temporales y el audio de ejemplo local de Whisper, no el micrófono. Cambia el foco a la segunda durante la grabación y comprueba que la transcripción vuelve a la ventana original sin pulsar Enter. El runtime instalado debe estar en `~/.local/share/voice-to-terminal` (o en la ruta indicada por `VOICE_TO_TERMINAL_APP_HOME`).

## Licencia

Pendiente de definir. Por ahora, este repositorio es para compartir dentro del equipo; no redistribuir públicamente hasta acordar una licencia y revisar los derechos de los recursos gráficos.
