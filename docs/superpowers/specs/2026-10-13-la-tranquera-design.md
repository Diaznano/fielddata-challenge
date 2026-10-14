# La Tranquera: asistente de campo por voz (diseño)

Fecha: 2026-10-13 · Challenge Mobile Engineer de FieldData · Estado: aprobado en conversación, pendiente de revisión escrita

## 1. Contexto y objetivo

Un productor de cría en la Cuenca del Salado (sol, guantes, poca señal, ruido) registra lo que pasa en el campo **hablándole a un Android de gama media** en español rioplatense. La app responde en voz alta, registra datos estructurados y contesta preguntas. La pantalla muestra **comprobantes** (tarjetas con números), no un chat.

FieldData ya resuelve esto vía WhatsApp + IA (con cola sin señal y detección de inconsistencias). Esta app es la versión nativa voice-first.

## 2. Criterios de éxito

- Un evaluador instala el APK (Android 11+, arm64), dice variaciones rioplatenses de las 4 frases del enunciado y funciona, **con y sin red**.
- Nunca se traba: micrófono denegado, sin red, señal débil, no entendió, faltan datos.
- El estado del micrófono es obvio en todo momento.
- Repo con historial real, README reproducible desde cero, DECISIONS.md con criterio de producto, recortes y uso de IA.

## 3. Alcance

**Obligatorio (P0)**
1. Turno de voz: hablar → respuesta hablada corta + subtítulo.
2. Escrituras: lluvia ("Llovieron 18 mm anoche"), movimiento ("Pasé 40 vaquillonas del lote 3 al 5").
3. Lecturas: "¿Cuánto llovió este mes?", "¿Cuántos animales hay en el lote 5?" con detalle en tarjeta.
4. Pantalla de inicio con resumen de "hoy".
5. Manejo de todos los casos de la sección 8.
6. APK en GitHub Release, README, DECISIONS.md.

**P1**: vía LLM (OpenAI) con respuesta redactada por el LLM · botón de bajar volumen como push-to-talk (subir volumen sigue funcionando) · sugerir descarga del paquete de voz offline · `cantidad: "todas"`.

**P2**: script de evaluación del LLM vs parser · tipografías de marca · animaciones.

**Fuera de alcance (por consigna)**: login, backend real, reportes, mapas, iOS.

## 4. Decisiones de stack

| Tema | Elegido | Descartado y por qué |
|---|---|---|
| Framework | Expo SDK 57 (RN 0.86), development build | Flutter/Kotlin: el stack del candidato es React/TS; Expo da build y módulos nativos sin perder velocidad |
| STT | Reconocedor nativo Android vía `expo-speech-recognition` (on-device cuando hay paquete es, red si no) | Whisper on-device: sin parciales en vivo, lento en gama media, +75–150 MB. STT nube: muere sin señal. Realtime voz-a-voz: online-only, caro, difícil de controlar |
| TTS | `expo-speech` (motor nativo, offline) | TTS nube: voz cambia al perder señal, latencia |
| Interpretación | Con red: OpenAI con tool calling. Sin red, timeout o error: parser local. Ambos llaman **las mismas herramientas** | Solo LLM: muda sin señal. Solo local: menos flexible. LLM on-device: pesado y poco fiable |
| Datos | `expo-sqlite` con log de eventos append-only + semilla JSON | JSON en AsyncStorage: reescribe todo, riesgo de corrupción |
| Esquemas | `zod` (fuente única: valida args y genera JSON schema para OpenAI) | — |
| Cliente OpenAI | `fetch` directo con `AbortController` | SDK: dependencia extra sin beneficio aquí |
| Activación | Tocar para hablar con auto-corte + botón de volumen como PTT | Mantener apretado: incómodo con guantes. Manos libres con wake word: batería, falsos positivos con viento, licencias |

El modelo concreto de OpenAI (chico, rápido, con tool calling) y el endpoint se confirman con la documentación vigente al implementar.

## 5. UX

### 5.1 Pantalla única

```
┌─────────────────────────────────┐
│ La Tranquera        ● IA  ⚡     │  badge de modo: IA / OFFLINE / SEÑAL DÉBIL
│ Martes 13 de octubre            │
├─────────────────────────────────┤
│ HOY                             │  resumen: lluvia hoy y del mes, última lluvia,
│ 🌧  0 mm hoy · 42 mm en octubre │  cabezas totales, movimientos de hoy
│ 🐄  450 cabezas en 8 lotes      │
│ ↔  1 movimiento registrado      │
├─────────────────────────────────┤
│ ┌─ ✓ MOVIMIENTO REGISTRADO ───┐ │  comprobante actual (último resultado)
│ │  40 vaquillonas             │ │
│ │  Lote 3 → Lote 5            │ │
│ │  Lote 3: 45 → 5             │ │
│ │  Lote 5: 40 → 80            │ │
│ │  10:42          [DESHACER]  │ │
│ └─────────────────────────────┘ │
│ Vos: "Pasé 40 vaquillonas del…" │  subtítulos
│ App: "Listo, 40 vaquillonas al 5"│
│ Historial de hoy ▾              │  comprobantes anteriores (lista, no chat)
├─────────────────────────────────┤
│        🎤  TOCÁ Y HABLÁ          │  ~40% inferior de la pantalla
│     o apretá el volumen         │
└─────────────────────────────────┘
```

Pulsación larga sobre "La Tranquera" → "Restaurar datos de demo" (para evaluadores).

### 5.2 Variantes del comprobante

| Variante | Color | Contenido |
|---|---|---|
| Registrado | verde `#008F26` | datos + antes→después + Deshacer |
| Consulta | azul `#2A4365` | número grande + desglose |
| Falta dato | dorado `#B48A1E` (texto `#8A6914`) | tarjeta parcial con el hueco marcado + Cancelar |
| No entendí / error | gris `#6C7C93` | qué podés decir (3 ejemplos) o qué falló |

Escrituras se registran al instante con **Deshacer** (botón o "borrá eso"), sin diálogo de confirmación: confirmar duplica turnos y los números quedan visibles.

### 5.3 Estados del micrófono

Siempre color + ícono + texto + vibración (`expo-haptics`):

| Estado | Visual | Acción del botón |
|---|---|---|
| Inactivo | verde marca `#347F61`, "Tocá y hablá" | empezar a escuchar |
| Escuchando | rojo `#DC2626` pulsante + subtítulo en vivo | cortar y procesar |
| Pensando | spinner, "Pensando…" | cancelar |
| Hablando | onda, "Tocá para cortar" | interrumpir TTS |
| Sin permiso | "Activar micrófono" + campo de texto visible | pedir permiso / abrir Ajustes |

Auto-corte por silencio (~1.5 s) o a los 10 s (el viento puede impedir detectar silencio).

### 5.4 Visual

Paleta de fielddata.ag: marca `#347F61`, texto `#203046`, fondo de tarjeta `#EFFBF6`, secundario `#6C7C93`. Fondo claro (se lee mejor al sol que el modo oscuro), texto mínimo 20 pt, números del comprobante ≥ 40 pt. Tipografías Plus Jakarta Sans (números/títulos) e Inter (cuerpo), embebidas en el APK (P2; mientras tanto, la fuente del sistema). Dorado solo en bordes/íconos por contraste. No se usa el logo de FieldData.

## 6. Arquitectura

### 6.1 Capas

```
App.tsx               pantalla única (sin Expo Router: una sola pantalla no lo justifica)
src/domain/           tipos, categorías y sinónimos, proyección de stock, fechas. TS puro.
src/data/             seed.json, db.ts (SQLite, migración, siembra), eventStore.ts
src/tools/            contrato: esquemas zod + handlers (validan, escriben, devuelven ToolResult)
src/interpreter/      llm.ts (OpenAI + timeout) · local/ (parser) · index.ts (orquestación y fallback)
src/voice/            stt.ts · tts.ts · hardwareKey.ts
src/conversation/     reducer puro: estado del turno + intent pendiente
src/ui/               MicButton, ReceiptCard, TodaySummary, StatusBadge, TextFallback, theme
```

Dependencias en una sola dirección: `ui → conversation → interpreter → tools → data/domain`. `domain`, `tools`, `interpreter/local` y `conversation` no importan React Native (testeables con Jest sin mocks de RN, salvo SQLite inyectado).

### 6.2 Contrato de herramientas

| Herramienta | Argumentos | Resultado |
|---|---|---|
| `registrar_lluvia` | `mm` (número > 0), `fecha?` (ISO, default hoy) | evento creado + total del mes |
| `mover_animales` | `cantidad` (entero > 0 o `"todas"`), `categoria`, `lote_origen`, `lote_destino`, `fecha?` | evento + stock antes/después de ambos lotes |
| `consultar_lluvia` | `periodo`: `hoy` · `ayer` · `semana` · `mes` · `mes_anterior` · `ultimos_dias` (+ `dias`) | total mm + lista de lluvias |
| `consultar_stock` | `lote?`, `categoria?` | total + desglose por categoría/lote |
| `deshacer_ultimo` | — | evento anulado + descripción |

Los argumentos son parciales a nivel intent. Cada handler devuelve:

```ts
type ToolResult =
  | { status: 'ok'; card: Card; speech: string }           // speech = plantilla local
  | { status: 'needs_info'; missing: Slot; partial: Intent; question: string; card: Card } // un dato por vez
  | { status: 'rejected'; reason: string; card: Card; speech: string };
```

La validación de datos faltantes y de reglas de negocio vive **solo** en los handlers; ni el LLM ni el parser escriben datos.

Categorías: `vacas`, `vaquillonas`, `terneros`, `novillos`, `toros`. Sinónimos: vaca; vaquillona, vaquilla(s); ternero, ternera(s), terneritos; novillo, novillitos; toro.

### 6.3 Flujo de un turno

1. Toque o tecla de volumen → si no hay permiso, estado "Sin permiso".
2. STT con `lang: es-AR`, parciales en vivo, `contextualStrings` (categorías, "lote", "milímetros"), on-device si hay paquete es.
3. Transcripción final → intérprete:
   - Con red (`expo-network`): OpenAI con tool calling, **timeout 4 s**. Contexto: fecha de hoy, lotes y stock resumido, intent pendiente y últimos 2 turnos. La salida se valida con zod.
   - Sin red, timeout, error HTTP o salida inválida: parser local. El badge refleja el modo usado.
4. Handler → `ToolResult`.
5. `ok`/`rejected`: tarjeta + subtítulo + TTS. Con red, segunda llamada al LLM para redactar la respuesta (≤ 20 palabras, rioplatense, números solo del resultado), **timeout 2.5 s**; si no llega, se usa `speech` de plantilla.
6. `needs_info`: tarjeta pendiente + pregunta por voz; al terminar el TTS (+300 ms) se reabre el micrófono. La respuesta completa el intent pendiente (ambas vías). Sin respuesta: micrófono se cierra, tarjeta con Cancelar; el pendiente vence a los 60 s o ante un intent nuevo.

### 6.4 Parser local

Reglas en TS sobre el texto normalizado (minúsculas, sin tildes):
- Números en dígitos y en palabras (cero a doscientos), "un par" no se soporta.
- Lluvia: llovieron, llovió, cayeron, cayó, agua, milímetros/mm/"milímetros de agua".
- Movimiento: pasé, pasamos, moví, movimos, llevé, cambié + cantidad + categoría + "del (lote) N al (lote) M".
- Consultas: cuánto llovió / cuánta agua, cuántos/cuántas + (animales|categoría) + lote.
- Fechas: hoy, anoche (= día anterior), ayer, anteayer.
- Deshacer: borrá eso, deshacé, me equivoqué, anulá.
- Respuestas sueltas para completar pendientes: "del 3", "al 5", "cuarenta", "18".

## 7. Datos

### 7.1 Semilla (`src/data/seed.json`)

"La Tranquera", cría, Castelli (BA), 8 lotes, 450 cabezas:

| Lote | Stock inicial |
|---|---|
| 1 | 70 vacas, 40 terneros |
| 2 | 70 vacas, 42 terneros |
| 3 | 45 vaquillonas |
| 4 | 70 vacas, 38 terneros |
| 5 | 40 vaquillonas |
| 6 | 25 novillos |
| 7 | 10 toros |
| 8 | vacío (descanso) |

Lluvias de los últimos 60 días como **desplazamientos relativos** (`hace N días`), materializados a fechas reales en el primer arranque: ~9 eventos, ~120 mm en total. Así "este mes" y "hoy" tienen datos sin importar cuándo se instale.

### 7.2 SQLite

```sql
events(
  id TEXT PRIMARY KEY,        -- UUID
  type TEXT NOT NULL,         -- lluvia | movimiento | anulacion
  payload TEXT NOT NULL,      -- JSON
  occurred_on TEXT NOT NULL,  -- YYYY-MM-DD (día del hecho)
  recorded_at TEXT NOT NULL,  -- ISO (cuándo se registró)
  source TEXT NOT NULL,       -- voz | texto | semilla
  interpreter TEXT,           -- ia | local | null
  raw_text TEXT               -- frase original
)
meta(key TEXT PRIMARY KEY, value TEXT)   -- seed_version, installed_on
```

Stock actual = stock inicial + movimientos no anulados. Deshacer agrega un evento `anulacion`; nunca se borra ni edita.

### 7.3 Validaciones

- Lote existente (1–8); origen ≠ destino.
- Stock suficiente de esa categoría en el origen ("En el lote 3 hay 30 vaquillonas, no 40").
- `mm > 0`; si `mm > 150`, repregunta de confirmación.
- Fecha no futura.

## 8. Manejo de errores ("nunca se traba")

| Situación | Comportamiento |
|---|---|
| Micrófono denegado | explicación + "Activar"; si es permanente, abre Ajustes; campo de texto siempre disponible |
| Sin red | badge OFFLINE, parser local |
| Señal débil (timeout) | fallback local, badge "SEÑAL DÉBIL" |
| Error OpenAI (401/429/5xx) o salida inválida | fallback local, se loguea |
| Sin reconocedor disponible | aviso + texto; con red, sugerir descargar paquete es offline |
| Sin voz detectada | "No te escuché, probá de nuevo" → inactivo |
| No entendió | tarjeta de ayuda con 3 ejemplos |
| Faltan datos | repregunta del slot faltante |
| Regla de negocio violada | `rejected` con los números reales; nada se registra |
| Error del usuario | deshacer por botón o voz |
| Sin voz TTS en español | subtítulos y tarjeta muestran todo |
| App a segundo plano escuchando | corta STT, vuelve a inactivo |
| Toques durante "Pensando" | se ignoran: cancelar a mitad de turno podría dejar escrito un evento que la UI descartó; el turno está acotado por los timeouts (≤ 6.5 s) |

## 9. Testing

- **Unitarios (jest-expo)**: tabla de ~40 frases rioplatenses → intents (parser); handlers y validaciones; proyección de stock; fechas relativas; reducer de conversación (incluye repregunta y vencimiento).
- **Evaluación LLM (P2)**: `scripts/eval-llm.ts` corre la tabla contra OpenAI y reporta aciertos vs parser.
- **E2E en emulador**: agente de QA vía `adb` (screenshots, toques, texto) usando el campo de texto como entrada.
- **Manual**: checklist de voz real (emulador con micrófono del host; Android físico para ruido y gama media).

## 10. Build y entrega

- Desarrollo: development build en el emulador (`npx expo run:android`).
- CNG: `android/` no se commitea; cualquier cambio nativo va por config plugin.
- APK: `npx expo prebuild -p android` + `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`, firmado con debug keystore. Verificar `minSdk ≤ 30`. EAS Build documentado como alternativa.
- Key: `EXPO_PUBLIC_OPENAI_API_KEY` en `.env` (gitignored, con `.env.example`). Para el APK entregado: proyecto de OpenAI aparte con límite de gasto (~USD 5). Sin key, la app funciona en modo local.
- Repo en GitHub (cuenta del candidato), commits al cerrar cada tarea, APK en Release (`gh release create`). Creación del repo remoto y push con confirmación.
- README: requisitos, instalación desde cero, `.env`, correr en emulador, build del APK, tests.
- DECISIONS.md: stack, voz, IA vs offline, activación, modelo de datos, escalabilidad, recortes, uso de IA.

## 11. Escalabilidad (pensada, no construida)

- **Sync**: el log de eventos con UUID es una outbox natural; envío idempotente; el servidor reproyecta. Conflictos offline (dos personas mueven los mismos animales) no se rechazan: se marcan como inconsistencia a revisar.
- **IA**: proxy propio con las keys, rate limit por campo, caché de prompt de sistema, ruteo de modelos. A escala, invertir a local-first reduce costo y latencia (el parser resuelve el caso común).
- **Multi-campo**: lotes, categorías y vocabulario por tenant; el prompt y los `contextualStrings` del STT se arman desde la configuración del campo.
- **Mejora continua**: cada evento guarda frase original e intérprete; las frases que caen en "no entendí" alimentan parser y prompt.
- **Canales**: las herramientas son el contrato; la misma capa sirve a la app y a WhatsApp detrás de una API.

## 12. Uso de IA

Desarrollo con Claude Code: diseño y revisión con Opus, implementación con Sonnet, QA con Haiku (pipeline `/ship`). Se registra en DECISIONS.md qué se generó, cómo se revisó y qué se corrigió a mano. El candidato debe poder explicar cada línea.

## 13. Riesgos

| Riesgo | Mitigación |
|---|---|
| Paquete de voz es offline no instalado | detección + sugerencia de descarga; fallback a texto |
| `expo-key-event` no consume la tecla de volumen | spike temprano; plan B: módulo Kotlin local que envuelve `Window.Callback` |
| STT capta el TTS en la repregunta | reabrir micrófono tras `onDone` + 300 ms |
| Calidad de micrófono del emulador | validación final en Android físico |
| Tiempo: P0 ≈ 5 h; P1/P2 lo exceden | se implementa por prioridad; lo no hecho se documenta como recorte |
