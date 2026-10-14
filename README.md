# FieldData · asistente de campo por voz

Asistente de campo por voz para Android, hecho como challenge técnico para FieldData (prototipo, no es una app oficial). El productor habla en español rioplatense ("Llovieron 18 mm anoche", "Pasé 40 vaquillonas del lote 3 al 5", "¿Cuánto llovió este mes?"), la app responde en voz alta y muestra un comprobante con los números, no un chat.

Funciona **con y sin señal**: con red interpreta con un LLM (OpenAI) y sin red con un parser local. Las dos vías ejecutan las mismas herramientas sobre una base SQLite en el teléfono.

La app se instala como **FieldData**. *La Tranquera* es el establecimiento de demo que pide la consigna (cría, Castelli, 8 lotes, ~450 cabezas): es el que muestra el encabezado.

Decisiones, trade-offs y uso de IA: [DECISIONS.md](DECISIONS.md). Manual de uso: [docs/manual-usuario.pdf](docs/manual-usuario.pdf). Video explicativo (65 s, vertical): en el [Release](../../releases).

Música del video: «Words We Will Remember» (instrumental), de [Josh Woodward](https://www.joshwoodward.com), licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Editada para el video.

## Instalar el APK

Descargar `fielddata-challenge-v1.0.0-arm64.apk` del último [Release](../../releases) e instalarlo en un Android 11+ arm64 (permitir "instalar apps desconocidas"; si Play Protect ofrece enviar la app a Google para analizarla, se puede elegir "No enviar"). La primera vez que se toca el micrófono, aceptar el permiso.

El APK está firmado con la debug keystore y trae una key de OpenAI dedicada de vida corta. Cuando vence, la app sigue funcionando con el parser local (el badge pasa a `LOCAL`).

## Compilar desde cero

Requisitos: macOS o Linux, Node 24 LTS, JDK 17, Android SDK (platform 36 y build-tools 36.0.0) y un emulador o un teléfono con depuración USB.

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"      # Linux: $HOME/Android/Sdk
export JAVA_HOME="$(/usr/libexec/java_home -v 17)"   # Linux: ruta de tu JDK 17
export PATH="$PATH:$ANDROID_HOME/platform-tools"

git clone <este repo> && cd fielddata-challenge
npm install
cp .env.example .env     # opcional: sin key funciona en modo local
npm test                 # tests unitarios (~300)
npm run typecheck
```

Para activar la IA completar en `.env` la key **y** el modelo (`EXPO_PUBLIC_OPENAI_MODEL=gpt-4o-mini`); si falta cualquiera de los dos, la app usa solo el parser local. `EXPO_PUBLIC_OPENAI_REASONING_EFFORT` queda vacío salvo que se use un modelo de razonamiento.

### Correr en desarrollo

```bash
npx expo run:android     # genera android/ (CNG), compila e instala el development build
```

Expo Go no sirve: el reconocimiento de voz y la tecla de volumen son módulos nativos. En el emulador, para hablar con el micrófono de la compu: Extended controls → Microphone → "Virtual microphone uses host audio input".

### Generar el APK

```bash
npx expo prebuild -p android --clean
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a && cd ..
mkdir -p dist && cp android/app/build/outputs/apk/release/app-release.apk dist/fielddata-challenge-v1.0.0-arm64.apk
```

Chequeo opcional (`minSdk` ≤ 30, solo `arm64-v8a`, package `com.marianodiaz.fielddata`):

```bash
$ANDROID_HOME/build-tools/36.0.0/aapt2 dump badging dist/fielddata-challenge-v1.0.0-arm64.apk | grep -E "sdkVersion|native-code|package:"
```

Las variables `EXPO_PUBLIC_*` se embeben al compilar el bundle: si cambiás `.env`, hay que volver a compilar. `android/` es generado y no se commitea.

## "Levantar el server"

No hay server: todo corre en el teléfono (SQLite + parser local). La única dependencia externa es la API de OpenAI, que es opcional. En desarrollo el "server" es Metro, que levanta solo `npx expo run:android` (o `npx expo start` una vez instalado el development build).

## Estructura

```
App.tsx           abre la base y monta la pantalla única (sin Expo Router)
src/domain        reglas puras: stock, lluvias, fechas, resumen de hoy
src/tools         contrato de herramientas (zod), validaciones de negocio y comprobantes
src/interpreter   OpenAI con tool calling (llm.ts) y parser local offline (local/)
src/conversation  motor de turnos con repreguntas, estado del micrófono, modo IA/LOCAL/OFFLINE
src/data          semilla JSON y log de eventos en SQLite
src/voice         reconocimiento, TTS y push-to-talk con la tecla de volumen
src/platform      estado de la red
src/ui            pantalla única y componentes
modules/volume-ptt  módulo nativo Kotlin que intercepta "bajar volumen"
```

`domain`, `tools`, `interpreter` y `conversation` no importan React Native: se testean con Jest sin mocks.

## Cómo probarla

| Para probar | Decir (o escribir en "Escribir en vez de hablar") |
|---|---|
| Lluvia | "Llovieron 18 mm anoche" · "Cayeron veinticinco milímetros" |
| Movimiento | "Pasé 40 vaquillonas del lote 3 al 5" · "Llevé los toros del 7 al 6" |
| Consultas | "¿Cuánto llovió este mes?" · "¿Cuántos animales hay en el lote 5?" |
| Repregunta | "Pasé 10 toros al 6" → la app pregunta "¿De qué lote salen?" → "Del 7" |
| Confirmación | "Llovieron 300 milímetros" → "¿Seguro?" → "Sí" (se pide confirmar arriba de 150 mm) |
| Corregir | "Borrá eso" o el botón DESHACER del comprobante (anula el último registro, de a uno) |

- **Hablar**: tocar el botón grande o apretar **bajar volumen** (la primera vez empieza a escuchar, la segunda corta). Subir volumen sigue funcionando.
- **Badge de modo**: `IA` (con red), `SEÑAL DÉBIL` (el LLM falló o tardó y se usó el parser local), `LOCAL` (sin key o key vencida) y `OFFLINE` (sin red).
- **Datos de demo**: mantener apretado el nombre del establecimiento, "La Tranquera" (casi 1 segundo) → "Restaurar datos de demo". Vuelve la semilla con las lluvias recalculadas respecto de hoy.
- **Voz sin señal**: necesita el paquete de español offline del reconocedor del teléfono. Si falta, la app avisa recién cuando el reconocimiento falla (no al arrancar): en Android 13+ ofrece un botón "Descargar", y en Android 12 o anterior muestra los pasos (Ajustes → Google → … → Voz → Reconocimiento de voz sin conexión → Español (EE.UU.)). Hay equipos cuyo reconocedor (Speech Services) ignora los paquetes bajados a mano y solo usa los del sistema, como la tablet Android 12 de prueba: ahí la voz sin señal no es posible y el respaldo es el campo de texto, que se abre solo con el aviso.
- **Sin permiso de micrófono**: el campo de texto se abre solo y el botón vuelve a pedir el permiso (o abre Ajustes si Android ya no lo permite).
