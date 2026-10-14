# Decisiones

Decisiones clave de la app FieldData (challenge Mobile Engineer de FieldData): qué elegí, por qué y qué resigné.

## Resumen

App Android voice-first para un productor de cría: habla, la app contesta en voz alta con una frase corta y deja en pantalla un **comprobante** (tarjeta con los números), no un chat. Funciona con y sin señal.

Lo que más pesa:

- **Comprobante, no chat.** Las escrituras se registran al instante y se corrigen con Deshacer; no hay diálogo de confirmación (salvo lluvias de más de 150 mm).
- **Dos intérpretes, una sola capa de herramientas.** Con red interpreta un LLM; sin red, un parser local. Los dos terminan en las mismas herramientas validadas, y el LLM nunca escribe datos.
- **Tocar para hablar y bajar volumen, no manos libres.** Pensado para guantes, viento y ruido.
- **Log de eventos append-only en el teléfono.** Deshacer es una anulación; cada evento guarda la frase original.
- **Nunca se traba.** Cada falla (micrófono, red, LLM, "no entendí", datos faltantes) tiene una salida visible y un camino por texto.
- **Recorté** el script de evaluación del LLM y las tipografías de marca (detalle más abajo).

Verificación: 344 tests unitarios (el parser contra 62 frases rioplatenses) y pruebas en una tablet Android 12 real con voz humana y TTS, más un teléfono rugged Zebra TC21 (pantalla chica, Android 10). La tecla física de bajar volumen quedó verificada en el teléfono. No medí precisión del reconocimiento con ruido o viento reales de campo.

## Stack y por qué

| Tema | Elegí | Descarté y qué resigno |
|---|---|---|
| Framework | Expo SDK 57 (RN 0.86), development build con CNG, **una sola pantalla sin Expo Router** y un módulo Kotlin propio | Flutter/Kotlin nativo: mi stack es React/TS y Expo da build y módulos nativos sin perder velocidad. Expo Go no sirve (módulos nativos). Resigno el control fino del audio nativo |
| STT | Reconocedor nativo de Android vía `expo-speech-recognition`: online `es-AR` con red, on-device sin red | Whisper on-device: sin parciales en vivo, lento en gama media, +75–150 MB. STT en la nube: muere sin señal. Voz a voz en tiempo real: solo online, caro y difícil de controlar. Resigno precisión de un modelo grande |
| TTS | `expo-speech` (motor nativo, offline) | TTS en la nube: la voz cambia al perder señal y suma latencia. Resigno naturalidad (en la tablet de prueba solo hay voz `es-US`) |
| Interpretación | Con red, OpenAI con tool calling; sin red, timeout o error, parser local. Las mismas herramientas | Solo LLM: mudo sin señal. Solo parser: poco flexible. LLM on-device: pesado y poco fiable |
| Datos | `expo-sqlite` con log de eventos + semilla JSON | JSON en AsyncStorage: reescribe todo y arriesga corrupción |
| Esquemas | `zod`: una sola fuente para validar argumentos y generar el JSON schema de OpenAI | Esquemas duplicados a mano |
| Cliente OpenAI | `fetch` con `AbortController` | SDK: dependencia extra sin beneficio acá |
| Activación | Tocar con auto-corte + bajar volumen como push-to-talk | Mantener apretado (incómodo con guantes) y manos libres con wake word |
| Tecla de volumen | Módulo Kotlin propio que envuelve el `Window.Callback` | `expo-key-event`: leyendo su código devuelve `super.onKeyDown`, no consume la tecla y el volumen cambiaría igual |
| Tipografía | Fuente del sistema | Plus Jakarta Sans e Inter (recorte, ver más abajo) |

## Voz: reconocimiento, síntesis y activación

**Tocar para hablar, con auto-corte.** El botón ocupa cerca del 30 % de la pantalla. Pido al reconocedor que corte tras 1,5 s de silencio y cierro yo a los 10 s, porque el viento puede impedir detectar el silencio. Un toque durante "Pensando" se ignora: cancelar a mitad de turno podría dejar escrito un evento que la UI descartó, y el turno está acotado por los timeouts (≤ 6,5 s).

**Por qué no manos libres.** Un wake word cuesta batería, da falsos positivos con viento y charla de fondo, tiene licencias, y el micrófono abierto captaría la propia voz del TTS. Mantener apretado tampoco: con guantes es incómodo. Tocar un botón grande es lo más confiable.

**Bajar volumen = el mismo botón.** Primer toque empieza a escuchar y el segundo corta. Un módulo Kotlin (`modules/volume-ptt`) envuelve el `Window.Callback` de la Activity, así no toco `MainActivity` y se sigue generando todo con CNG. Solo intercepta `VOLUME_DOWN` en primer plano; subir volumen funciona normal. El costo asumido: con la app abierta, bajar volumen ya no baja el volumen.

**Estado del micrófono: color + ícono + texto + vibración**, nunca solo color.

| Estado | Color | Ícono y texto | Vibración |
|---|---|---|---|
| Inactivo | verde marca | micrófono · "Tocá y hablá" | — |
| Escuchando | rojo pulsante | micrófono · "Escuchando…" y subtítulo en vivo | media al empezar, leve al cortar |
| Pensando | azul | spinner · "Pensando…" | — |
| Hablando | verde | parlante · "Hablando…" | éxito o aviso según el comprobante |
| Sin permiso | gris | micrófono tachado · "Activar micrófono" | aviso |

**Reconocimiento.** Con red uso `es-AR` online (mejor con ruido y voseo). Sin red pido reconocimiento on-device con `es-US`, porque en Android < 13 no existe paquete `es-AR` on-device. El TTS prefiere `es-AR` y baja a `es-419`, `es-US`, `es-MX` o `es-ES`.

**Hallazgos en la tablet (Android 12, voz humana real)**

- Android entrega las hipótesis finales dentro de un evento **parcial** (varias, con confianza) y después un `onResults` **vacío**. Mi primera versión solo enviaba un final con texto y no registraba nada. Ahora guardo la mejor hipótesis de cada evento y la envío una sola vez, al llegar el final (vacío o no) o el `end`.
- Una hipótesis truncada ("del") puede traer más confianza que la completa ("del 7"). Descarto las que son prefijo estricto de otra antes de comparar.
- El reconocedor oye "vaquillonas" como "vajillonas" o "bajillonas": alias en el parser (el LLM las entiende solo).
- En Android 12 `getSupportedLocales` vuelve vacío, así que no se puede detectar el paquete offline. Sin red siempre pido on-device, y **la sugerencia del español offline aparece solo cuando el reconocimiento falla por falta de modelo, no al arrancar** (avisar siempre molestaría en cada inicio de esos teléfonos). En Android 13+ el aviso trae un botón "Descargar" (`es-US` o `es-ES`: no existe modelo on-device `es-AR`). En Android 12 o anterior, una app no puede disparar la descarga, así que el aviso muestra los pasos manuales: Ajustes → Google → Todos los servicios → Ajustes de aplicaciones de Google → Buscador, Asistente y voz → Voz → Reconocimiento de voz sin conexión → Español (EE.UU.). Esa lógica vive en `src/voice/offlineVoiceHelp.ts`, con tests.
- `contextualStrings` solo se aplica en Android 13+.
- En un Zebra TC21 (equipo rugged, Android 10, fuera del target 11+) la tecla física de bajar volumen abre el micrófono igual que en la tablet. Ahí tocar para cortar no funciona: Android 10 lanza `SecurityException` dentro de `RecognitionService.stopListening` (bug de la plataforma, corregido en 11). El corte por silencio sí anda.

**Limitación conocida: la voz sin señal depende del reconocedor del teléfono.** En la tablet de prueba (EXO Wave, Android 12) el reconocedor es Speech Services (`com.google.android.tts`), que solo usa los paquetes de idioma de la partición del sistema (solo trae `en-US`) e ignora los que el usuario baja a mano. Ahí la voz en español sin señal no es posible, y el respaldo real es el campo de texto, que se abre solo junto con el aviso. En teléfonos cuyo reconocedor es la app de Google la descarga debería servir, pero no lo verifiqué.

## IA con red, parser sin red

Con conexión el turno lo interpreta un LLM de OpenAI con tool calling; sin conexión (o si el LLM falla o tarda) cae a un parser local determinista. Los dos terminan en las mismas herramientas validadas con `zod`, así que el resultado es el mismo contrato.

- **El LLM propone, la herramienta decide.** Solo elige una herramienta y argumentos parciales; toda validación de datos faltantes y de reglas de negocio vive en las herramientas. Los argumentos del LLM se validan con `zod` y un tool call inválido cuenta como falla.
- **Timeouts:** 4 s para interpretar y 2,5 s para redactar la respuesta. La redacción (≤ 20 palabras, rioplatense, números solo del resultado) corre únicamente para resultados `ok`; si no llega, se usa la plantilla.
- **Los rechazos y las repreguntas nunca los redacta el LLM:** llevan siempre el texto de plantilla con los números reales ("En el lote 3 hay 5 vaquillonas, no 40. No registré nada."). Una redacción no puede sonar a confirmación de algo que no se guardó.
- **Confirmación de lluvias > 150 mm en el motor, no en el prompt.** Aplica a las dos vías y solo vale como respuesta a la confirmación vigente, para el mismo valor que se preguntó.
- **Badge de modo:** `IA`, `SEÑAL DÉBIL` (el pedido al LLM no llegó o tardó más que el timeout y ese turno se resolvió local), `LOCAL` (sin key, key rechazada, o el LLM contestó con un error HTTP o una salida inválida) y `OFFLINE`.
- **Key rechazada (401/403):** la app deja de llamar al LLM por el resto de la sesión (reintentar solo agrega una ida y vuelta fallida por turno) y pasa a `LOCAL`.
- **Parser local:** reglas sobre el texto normalizado (números en dígitos y en palabras hasta 599, punto de miles es-AR, fechas relativas, alias del reconocedor). **Ante la duda no escribe**: pide el dato o muestra ayuda, porque un falso positivo de escritura es la falla más cara.

**Modelo elegido: `gpt-4o-mini`** (no es de razonamiento, por eso `EXPO_PUBLIC_OPENAI_REASONING_EFFORT` queda vacío).

Alternativas probadas con la misma llamada de prueba ("pasé 40 vaquillonas del 3 al 5" con la herramienta `mover_animales`, 3 mediciones por modelo con `curl`):

| Modelo | Resultado | Latencia |
| --- | --- | --- |
| `gpt-4o-mini` | tool call correcto (40, lote 3 → 5) | 0,94 s / 1,28 s / 1,60 s |
| `gpt-3.5-turbo` | tool call correcto | 1,59 s / 1,63 s / 1,90 s |
| `gpt-5-nano`, `gpt-5-mini`, `gpt-4.1-nano`, `gpt-4.1-mini` | 403: la key del proyecto no tiene acceso al modelo | no aplica |

La key de la demo solo lista `gpt-3.5-turbo` y `gpt-4o-mini`, así que los modelos nano más nuevos no estaban disponibles. De los dos disponibles, `gpt-4o-mini` es más rápido y tiene mejor tool calling. Con el prompt y las 6 herramientas reales la latencia medida fue de 0,7 a 1,8 s para interpretar y de 1,0 a 1,1 s para redactar.

**Key embebida en el APK: riesgo aceptado.** `EXPO_PUBLIC_*` queda dentro del bundle y cualquiera que descomprima el APK la puede leer. Para el take-home usé una key de un proyecto aparte, dedicada a este challenge, que vence a los 7 días. Vencida, la app responde 401, pasa a `LOCAL` y sigue andando con el parser. En producción la key vive detrás de un proxy (ver Escalabilidad).

## Comprobante, no chat

- **Registrar al instante + Deshacer, en vez de confirmar.** Confirmar duplica los turnos y los números ya quedan visibles en la tarjeta. Deshacer es un botón grande en el comprobante o "borrá eso" por voz, y anula de a un registro (el más reciente, nunca la semilla). La excepción es la lluvia de más de 150 mm, donde un error de dedo es probable: ahí pregunta "¿Seguro?".
- **Cuatro variantes de tarjeta, distinguibles sin color:** registrado (verde, ✓, antes → después), consulta (azul, ◉, número grande y desglose), falta dato (dorado, ✎, hueco marcado con "¿?") y no entendí o rechazo (gris, 💬 o ⚠, ejemplos o los números reales).
- **Legible al sol:** fondo claro, texto de cuerpo de 20 pt y números de 48 pt. El dorado solo va en bordes e íconos y el texto usa una variante más oscura por contraste.
- **Repreguntas de un dato por vez** ("¿De qué lote salen?"). La tarjeta queda pendiente, y al terminar el TTS (+300 ms, para no captar su propia voz) se reabre el micrófono. Una respuesta corta ("del 3") completa el intent en las dos vías. Si no hay respuesta, el pendiente vence a los 60 s o lo reemplaza otro pedido.
- **Pantalla de inicio:** resumen de "hoy" (lluvia de hoy y del mes, última lluvia, cabezas y lotes, movimientos del día) más el historial de lo registrado hoy.
- **Pantallas chicas (< 720 dp de alto):** probando en un Zebra TC21 (360x640 dp) la tarjeta quedaba fuera de la vista, debajo del resumen. En ese alto el comprobante pasa primero y el resumen de "hoy" baja debajo de la tarjeta; el botón del micrófono baja al 24 % (mínimo 150 dp, sigue siendo grande para guantes), y la tarjeta usa tipografías algo menores. Cada tarjeta nueva lleva la vista arriba. En la tablet el layout no cambia.
- **Bienvenida, una sola vez:** tres frases para probar y "Empezar", que pide el micrófono explicando para qué (pedirlo sin contexto al primer toque se rechaza más). Si se niega, la app entra igual y ofrece escribir. Ícono, splash y bienvenida con el isotipo de FieldData.
- **La app es FieldData; La Tranquera es el campo.** El producto está pensado para varios establecimientos, así que la marca es la de la app y el encabezado muestra el establecimiento activo (el de demo que pide la consigna). Soportar varios es lo descripto en Escalabilidad (multi-campo); no está construido.

## Datos

- **Log de eventos append-only** en SQLite (`events`: id UUID, tipo `lluvia | movimiento | anulacion`, payload, `occurred_on`, `recorded_at`, fuente `voz | texto | semilla`, intérprete `ia | local`, `raw_text`). Nunca se edita ni se borra. El stock es el inicial más los movimientos no anulados, proyectado al leer.
- **Deshacer es una anulación** que apunta al evento original, no un borrado. Cada evento guarda la **frase original** y quién la interpretó: sirve de auditoría y es la materia prima para mejorar el parser y el prompt.
- **Semilla relativa a la instalación:** 8 lotes y 450 cabezas, con 9 lluvias de los últimos 55 días (123 mm) guardadas como "hace N días" y materializadas a fechas reales al primer arranque, para que "hoy" y "este mes" tengan datos sin importar cuándo se instale. Mantener apretado "La Tranquera" restaura la demo recalculada respecto de hoy.
- **La lluvia se agrega por día:** si llovió dos veces el mismo día, "hoy" y "última lluvia" muestran el mismo número, que es como piensa un productor.
- **Sobre "sin base de datos":** lo interpreté como "sin backend". SQLite embebido es el storage del teléfono y la semilla sigue siendo un JSON; elegí el log de eventos porque da deshacer, auditoría y una outbox natural para sincronizar.

## Nunca se traba

| Situación | Qué hace la app |
|---|---|
| Micrófono denegado | Botón gris "Activar micrófono" y campo de texto abierto. Si Android ya no deja pedir el permiso, abre Ajustes; al volver, se chequea de nuevo |
| Sin red | Badge `OFFLINE`, parser local y reconocimiento on-device |
| Sin señal y sin modelo de español en el reconocedor | Recién cuando el reconocimiento falla por eso (no al arrancar): aviso con botón "Descargar" en Android 13+ o con los pasos manuales en Android 12 o anterior, y campo de texto abierto. En teléfonos cuyo reconocedor ignora los paquetes bajados a mano (como la tablet de prueba), el texto es el respaldo real |
| LLM lento o sin conexión con el servicio | Ese turno va al parser local y el badge dice `SEÑAL DÉBIL` |
| LLM con error HTTP (429, 5xx) o salida inválida | Ese turno va al parser local y el badge pasa a `LOCAL` hasta el próximo turno con IA: no es un problema de señal |
| Key vencida o sin acceso (401/403) | LLM apagado por la sesión, badge `LOCAL` |
| Sin reconocedor en el teléfono | Aviso y campo de texto |
| No se oyó nada | "No te escuché, probá de nuevo" y vuelve a inactivo |
| No entendió | Tarjeta de ayuda con ejemplos de frases |
| Faltan datos | Repregunta de un dato por vez con tarjeta pendiente |
| Regla de negocio violada | Tarjeta de rechazo con los números reales y nada se registra (stock insuficiente, sin animales de esa categoría, fecha futura) |
| Lote inexistente, o destino igual al origen (al mover) | Repregunta de ese lote |
| Lluvia de más de 150 mm | Pregunta si es correcto antes de registrar |
| Error del usuario | Deshacer por botón o por voz |
| Deshacer con una repregunta abierta | Cancela la repregunta ("Listo, lo dejamos ahí") y no anula ningún registro anterior, con las dos vías de interpretación |
| Cantidad en cero ("llovieron 0 mm", "pasé 0 vacas") | Vuelve a preguntar ese dato y no registra nada |
| Sin voz de síntesis en español | Subtítulos y tarjeta muestran todo |
| App a segundo plano | Corta la escucha y la voz, y no reabre el micrófono mientras no esté en primer plano |
| Toques durante "Pensando" | Se ignoran (también Deshacer y restaurar demo) |
| Error al guardar | Tarjeta "Algo falló: no registré nada" |

Verificado en la tablet: voz real, repregunta con reapertura del micrófono, permiso denegado y vuelta desde Ajustes, modo avión, persistencia tras cerrar la app y Deshacer. `SEÑAL DÉBIL` está cubierto por tests, pero no lo reproduje en el teléfono.

## Escalabilidad (pensada, no construida)

Pregunta de partida: qué pasa si esto va de un productor a miles.

| Tema | Hoy | A escala |
|---|---|---|
| Sync | Todo vive en el teléfono | El log de eventos con UUID es una outbox natural: envío idempotente y el servidor reproyecta el estado. Los conflictos offline (dos personas mueven los mismos animales) no se rechazan: se marcan como inconsistencia a revisar |
| IA | Key en el APK, una llamada para interpretar y otra para redactar | Proxy propio con las keys, autenticación por dispositivo, rate limit por campo, caché del prompt de sistema y ruteo de modelos. Invertir a local-first: el parser resuelve el caso común y el LLM queda para lo que el parser no entiende, con menos costo y latencia |
| Multi-campo | Un solo campo con 8 lotes y 5 categorías fijas | Lotes, categorías y vocabulario por tenant; el prompt y los `contextualStrings` del STT se arman desde la configuración del campo |
| Mejora continua | Cada evento guarda frase original e intérprete | Las frases que caen en "no entendí" alimentan parser y prompt; una evaluación continua del LLM contra el parser decide el ruteo |
| Observabilidad | Ninguna | Tasa de `SEÑAL DÉBIL`, latencias p50 y p95, errores del reconocedor por modelo de teléfono, deshaceres por tipo de frase |
| Canales | Solo la app | Las herramientas son el contrato y no dependen de React Native: la misma capa puede servir a WhatsApp detrás de una API |

## Qué recorté y por qué

| Recorte | Por qué y qué cuesta |
|---|---|
| Script de evaluación del LLM contra el parser (P2) | Tiempo: prioricé P0 y P1. La tabla de 62 frases del parser ya existe y se reutilizaría. Hoy no tengo una medición de aciertos del LLM, solo pruebas puntuales en el teléfono |
| Tipografías de marca y animaciones (P2) | Usé la fuente del sistema y solo animé el pulso del micrófono: la legibilidad y los estados pesaron más que la marca |
| Botón "Cancelar" en la tarjeta pendiente | Se cancela diciendo "cancelá" o "no", escribiendo, o venciendo a los 60 s |
| Manos libres con wake word | Ver Voz |
| Sync, multi-campo, login, backend, reportes, mapas, iOS | Por consigna o por ser parte de lo "pensado, no construido" |
| Voz en español sin señal en cualquier teléfono | Depende del reconocedor del equipo (ver la limitación en Voz). La app avisa y deja el texto; no verifiqué la descarga del paquete en un teléfono con la app de Google como reconocedor |
| Medición de precisión con ruido y viento reales | Un solo dispositivo de prueba y sin mediciones de campo; queda pendiente probar en un teléfono de gama media al aire libre |

**Límites conocidos del parser local.** Cerré el parser tras varias rondas de revisión: el lenguaje natural es abierto y, con red, el LLM cubre buena parte de estos casos. Lo que queda lo contienen Deshacer y las repreguntas.

- Horas con minutos ("17:30") o "a la 1" pueden leerse como cantidad.
- "Hace 2 semanas", "la semana pasada" y los meses por nombre no se resuelven y consultan el período actual.
- Una frase con dos movimientos registra solo el primero.
- Un número con unidad fuera de contexto ("un caño de 20 mm") se registra como lluvia, y "¿llovió 20 mm ayer?" dicho por voz es indistinguible de un registro porque no hay signos de pregunta.
- Los números en palabras llegan hasta 599 y no hay "mil".

## Cómo usé IA

**IA en el producto:** `gpt-4o-mini` interpreta frases y redacta respuestas, con las salvaguardas de arriba (validación con `zod`, rechazos con plantilla y confirmación en el motor).

**IA para desarrollar: Claude Code.** Flujo, con más de 30 commits y 14 de ellos correcciones de revisión:

1. **Diseño y spec** con Opus, conversando alternativas hasta aprobarlas (el spec está en `docs/superpowers/specs/`).
2. **Plan** de 18 tareas, con el código de cada una.
3. **Implementación** por tarea con subagentes Sonnet en TDD: test rojo, código, test verde.
4. **Revisión** de cada tarea contra el spec con Sonnet, escalando a Opus ante dudas, en rondas de corrección hasta dejarla limpia. Antes de generar el APK, una revisión final de todo el diff con Opus.
5. **QA en un dispositivo real** por `adb` (capturas, toques, texto, `logcat`) más mi voz.

**Qué atajó la revisión** (ejemplos reales):

| Dónde | Qué pasaba | Qué hice |
|---|---|---|
| Parser | Falsos positivos de escritura: "se cayó el alambrado" como lluvia, "a eso de las 5" como cantidad, "de una" como lote 1, "mañana a la mañanita" registrado hoy | Cuatro rondas. Regla general: **ante la duda no escribe** (señales de lluvia estrictas, milímetros solo con unidad o verbo) |
| Números y datos | "1.500" se leía como 1,5 (punto de miles es-AR), y palabras como "constructor" se resolvían por el prototipo del objeto | Normalización del punto de miles y lookups con `Map` o `hasOwnProperty` |
| Turno con LLM | El brief redactaba la respuesta *después* de guardar: si la redacción fallaba, el usuario repetía y se duplicaba el evento | Se redacta antes de guardar, tolerando fallas, y los rechazos nunca se redactan |
| Voz en Android 12 | Con mi voz real, el subtítulo mostraba la frase pero no pasaba nada: el final llegaba vacío | Mejor hipótesis por confianza, descarte de prefijos y alias del reconocedor (detalle en Voz) |
| Confirmación de 150 mm | El LLM podía mandar `confirmado: true` en cualquier turno y saltear la confirmación | La guarda pasó al motor: solo vale con una confirmación pendiente y el mismo valor preguntado |
| Fechas y prompt | Se aceptaban fechas inexistentes ("2026-02-31"), y `gpt-4o-mini` ponía fecha de ayer a "se largó a llover" | Fechas de calendario válidas y acumulado por el mes de la fecha, más una regla en el prompt (pasar fecha solo si el productor la dijo) |

**Decisiones de criterio, mías o aprobadas por mí:**

- Ir a probar con una tablet real en lugar de un spike descartable, y que la voz humana sea el criterio de verdad.
- Cortar el parser tras la cuarta ronda y recortar el script de evaluación por tiempo, para cerrar P0 y P1 con calidad.
- Aceptar la key embebida con vencimiento corto en lugar de armar un backend que la consigna no pide.
- Módulo Kotlin propio para el volumen, tras comprobar que `expo-key-event` no consume la tecla.

Leí y revisé todo el código generado y puedo explicar cada línea. Los tests verdes no me alcanzaron como prueba: los bugs de voz y de lenguaje natural aparecieron recién en el dispositivo.
