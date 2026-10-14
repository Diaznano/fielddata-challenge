# La Tranquera: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App Android voice-first (Expo) para que un productor registre lluvias y movimientos de hacienda y consulte datos hablando en rioplatense, con y sin señal.

**Architecture:** Capas puras en TypeScript (`domain`, `tools`, `interpreter/local`, `conversation`) testeadas con Jest, y adaptadores nativos finos (`data/sqlite`, `voice`, `platform`) más una UI de pantalla única. Ni el LLM ni el parser escriben datos: los dos producen un `Intent` que ejecutan las herramientas (`runTool`). El estado se guarda como un log de eventos append-only en SQLite.

**Tech Stack:** Expo SDK 57 (RN 0.86, TS 6), expo-speech-recognition, expo-speech, expo-sqlite, expo-network, expo-haptics, expo-crypto, zod 4, jest-expo, OpenAI Chat Completions vía `fetch`.

**Spec:** `docs/superpowers/specs/2026-10-13-la-tranquera-design.md`

## Global Constraints

- Plataforma: Android 11+ (minSdk ≤ 30), APK `arm64-v8a`. No construir iOS, login, backend, reportes ni mapas.
- Todo el texto visible y hablado va en español rioplatense ("Tocá y hablá", "¿De qué lote salen?").
- Colores: marca `#347F61`, texto `#203046`, fondo tarjeta `#EFFBF6`, secundario `#6C7C93`, registrado `#008F26`, consulta `#2A4365`, pendiente `#B48A1E` (texto `#8A6914`), escuchando/error `#DC2626`. Fondo claro.
- Tipografía: texto ≥ 20 pt (única excepción: el badge de modo, 16 pt en mayúsculas); números del comprobante ≥ 44 pt.
- Timeouts: interpretación LLM 4 s; redacción LLM 2.5 s; escucha máxima 10 s; silencio de corte 1.5 s; pendiente vence a los 60 s; reabrir micrófono 300 ms después del TTS.
- Lluvia > 150 mm pide confirmación. "Anoche" = día anterior.
- `android/` e `ios/` no se commitean (CNG). `.env` no se commitea.
- Commits en español, con la identidad de git del usuario, sin trailers de atribución. Un commit por tarea.
- Todos los comandos se corren desde `la-tranquera/` con Node 24 (`nvm use 24`).
- Tests: `npm test` (fija `TZ=America/Argentina/Buenos_Aires`). Typecheck: `npm run typecheck`.

## Desvíos respecto de la spec (aprobar con el usuario)

1. **Sin Expo Router:** es una sola pantalla. Se usa el template `blank-typescript` (`App.tsx`) y no `app/`.
2. **Toques durante "Pensando":** se ignoran en vez de cancelar. Cancelar a mitad de turno podría dejar escrito un evento que la UI descartó; el turno ya está acotado por los timeouts (≤ 6.5 s).
3. **`needs_info.missing`:** es un solo slot (`Slot`) y no un array. Se pregunta un dato por vez.

## Review Focus

1. **"Borrá eso" dicho varias veces seguidas:** cada uno anula el último registro activo del productor, en orden inverso; nunca toca la semilla y, cuando no queda nada, lo dice (tests en Task 7).
2. **El evento `end` del reconocedor llega después del resultado final:** no debe pisar el estado "Pensando" (test `STOPPED` en Task 11).
3. **El LLM manda `null` en argumentos opcionales, o una herramienta/argumentos inválidos:** se limpian los null; lo inválido cae al parser local sin trabar el turno (tests en Task 14).
4. **El texto del STT trae mayúsculas, tildes, signos o "18mm" pegado:** se normaliza igual (tests en Task 8).
5. **Responder con un número suelto a una repregunta de lote, o responder otra cosa:** completa el slot correcto, o mantiene el pendiente sin perderlo (tests en Tasks 9 y 10).

---

### Task 1: Scaffold del proyecto

**Files:**
- Create: proyecto Expo en `la-tranquera/` (template `blank-typescript`): `App.tsx`, `index.ts`, `app.json`, `package.json`, `tsconfig.json`, `assets/`
- Create: `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Produces: alias `@/` → `src/`; scripts `npm test`, `npm run typecheck`, `npm run android`.

- [ ] **Step 1: Generar el proyecto en una carpeta temporal y moverlo**

`la-tranquera/` ya tiene `.git` y `docs/`, así que el scaffold se genera aparte y se mueve:

```bash
cd /Users/marianodiaz/proyectos/fieldData/challenge
source ~/.nvm/nvm.sh && nvm use 24
npx create-expo-app@latest la-tranquera-tmp --template blank-typescript --yes
rsync -a la-tranquera-tmp/ la-tranquera/
rm -rf la-tranquera-tmp
cd la-tranquera
```

Expected: `la-tranquera/` contiene `App.tsx`, `index.ts`, `app.json`, `package.json` y conserva `docs/` y `.git/`. Si el template `blank-typescript` no existe en SDK 57, usar `--template default`, correr `npm run reset-project` (elegir borrar el ejemplo) y mover `src/app/index.tsx` a `App.tsx` con `index.ts` = `import { registerRootComponent } from 'expo'; import App from './App'; registerRootComponent(App);`. Quitar `expo-router` de `package.json` y de `plugins`.

- [ ] **Step 2: Instalar dependencias**

```bash
npx expo install expo-speech-recognition expo-speech expo-sqlite expo-network expo-haptics expo-crypto react-native-safe-area-context @expo/vector-icons
npm install zod@^4
npx expo install jest-expo jest @types/jest -- --save-dev
```

Expected: sin errores de peer deps. `npx expo install` elige versiones compatibles con SDK 57.

- [ ] **Step 3: Configurar scripts, Jest y alias**

En `package.json` reemplazar `"scripts"` y agregar `"jest"`:

```json
"scripts": {
  "start": "expo start",
  "android": "expo run:android",
  "test": "TZ=America/Argentina/Buenos_Aires jest",
  "typecheck": "tsc --noEmit"
},
"jest": {
  "preset": "jest-expo",
  "moduleNameMapper": { "^@/(.*)$": "<rootDir>/src/$1" },
  "testPathIgnorePatterns": ["/node_modules/", "/android/"]
}
```

`tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "resolveJsonModule": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", "expo-env.d.ts"]
}
```

- [ ] **Step 4: Configurar `app.json`**

Conservar las entradas de íconos y splash que trae el template y fijar estas claves dentro de `"expo"`:

```json
"name": "La Tranquera",
"slug": "la-tranquera",
"orientation": "portrait",
"userInterfaceStyle": "light",
"android": {
  "package": "com.marianodiaz.latranquera",
  "permissions": ["android.permission.RECORD_AUDIO"]
},
"plugins": [
  [
    "expo-speech-recognition",
    {
      "microphonePermission": "La Tranquera usa el micrófono para que registres datos hablando.",
      "speechRecognitionPermission": "La Tranquera usa el reconocimiento de voz para entender lo que decís.",
      "androidSpeechServicePackages": ["com.google.android.googlequicksearchbox", "com.google.android.tts"]
    }
  ]
]
```

Si el template trae un bloque `"ios"`, dejarlo sin cambios (no se usa).

- [ ] **Step 5: `.gitignore` y `.env.example`**

Agregar al final de `.gitignore` (si alguna línea ya existe, no duplicarla):

```
# nativo generado (CNG)
/android
/ios
# secretos
.env
# APKs generados
/dist
```

Crear `.env.example`:

```
# Opcional: sin key la app funciona en modo local (parser offline).
EXPO_PUBLIC_OPENAI_API_KEY=
# Modelo chico y rápido con tool calling (ver DECISIONS.md).
EXPO_PUBLIC_OPENAI_MODEL=
# Solo para modelos de razonamiento (ej. "minimal"). Vacío si no aplica.
EXPO_PUBLIC_OPENAI_REASONING_EFFORT=
```

- [ ] **Step 6: Verificar**

```bash
npm run typecheck
npm test -- --passWithNoTests
npx expo-doctor
```

Expected: typecheck sin errores; Jest "No tests found, exiting with code 0"; expo-doctor sin errores bloqueantes.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Expo SDK 57 con dependencias de voz, datos y tests"
```

---

### Task 2: Spike nativo en el emulador (voz, TTS y teclas de volumen)

Objetivo: confirmar temprano los tres riesgos nativos. El código del spike se descarta: solo se commitean las conclusiones.

**Files:**
- Modify (temporal, se revierte): `App.tsx`
- Create: `DECISIONS.md` (sección de verificaciones)
- Possibly modify: `package.json` (`expo-key-event`)

**Interfaces:**
- Produces: conclusiones en `DECISIONS.md` que usan las Tasks 12, 15 y 16 (locale de STT, voz TTS disponible, si `expo-key-event` captura y consume las teclas de volumen).

- [ ] **Step 1: Instalar expo-key-event**

```bash
npm install expo-key-event
```

- [ ] **Step 2: Reemplazar `App.tsx` por la pantalla de spike**

```tsx
import { useState } from 'react';
import { Button, ScrollView, Text, View } from 'react-native';
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useKeyEventListener } from 'expo-key-event';

export default function App() {
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((l) => [line, ...l].slice(0, 40));

  useSpeechRecognitionEvent('result', (e) => add(`result ${e.isFinal ? 'final' : 'parcial'}: ${e.results[0]?.transcript}`));
  useSpeechRecognitionEvent('error', (e) => add(`error: ${e.error} ${e.message}`));
  useSpeechRecognitionEvent('end', () => add('end'));
  useKeyEventListener((e) => add(`key: ${JSON.stringify(e)}`), { listenOnMount: true });

  async function info() {
    add(`available=${ExpoSpeechRecognitionModule.isRecognitionAvailable()} onDevice=${ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()}`);
    try {
      const l = await ExpoSpeechRecognitionModule.getSupportedLocales({});
      add(`instalados: ${l.installedLocales.join(',')}`);
      add(`es soportados: ${l.locales.filter((x) => x.startsWith('es')).join(',')}`);
    } catch (e) {
      add(`locales error: ${String(e)}`);
    }
    const voices = await Speech.getAvailableVoicesAsync();
    add(`voces es: ${voices.filter((v) => v.language.startsWith('es')).map((v) => `${v.identifier}|${v.language}`).join(', ')}`);
  }

  async function listen() {
    const p = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!p.granted) return add(`permiso: ${JSON.stringify(p)}`);
    ExpoSpeechRecognitionModule.start({
      lang: 'es-AR',
      interimResults: true,
      contextualStrings: ['vaquillonas', 'novillos', 'lote', 'milímetros'],
      androidIntentOptions: { EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 1500 },
    });
  }

  return (
    <View style={{ flex: 1, paddingTop: 60, padding: 16, gap: 8 }}>
      <Button title="Info" onPress={info} />
      <Button title="Escuchar" onPress={listen} />
      <Button title="Hablar" onPress={() => Speech.speak('Anotado: dieciocho milímetros ayer.', { language: 'es-AR' })} />
      <ScrollView>{log.map((l, i) => <Text key={i}>{l}</Text>)}</ScrollView>
    </View>
  );
}
```

- [ ] **Step 3: Levantar el emulador con micrófono del host**

```bash
SDK=~/Library/Android/sdk
$SDK/emulator/emulator -list-avds
$SDK/emulator/emulator -avd Pixel_7_Pro_API_34 -no-snapshot-load > "$TMPDIR/emulator.log" 2>&1 &
$SDK/platform-tools/adb wait-for-device
$SDK/platform-tools/adb shell getprop sys.boot_completed   # repetir hasta que devuelva 1
$SDK/platform-tools/adb emu avd hostmicon
```

Expected: el emulador arranca y `hostmicon` responde `OK`. El AVD debe usar una imagen `google_apis_playstore` (tiene los servicios de voz de Google). Si no, crear uno con `system-images;android-34;google_apis_playstore;arm64-v8a`.

- [ ] **Step 4: Compilar e instalar el development build**

```bash
npx expo run:android
```

Expected: la primera compilación tarda varios minutos; la app abre con los botones Info / Escuchar / Hablar.

- [ ] **Step 5: Ejecutar las verificaciones y anotar resultados**

1. Tocar **Info**: anotar si el reconocimiento está disponible, los locales instalados y las voces `es` (identificador y language).
2. Tocar **Escuchar** y decir "pasé cuarenta vaquillonas del lote tres al cinco": anotar si llegan parciales y el final, y si los números vienen en dígitos.
3. Tocar **Hablar**: anotar si se escucha en español.
4. Teclas de volumen: `adb shell input keyevent KEYCODE_VOLUME_DOWN`. Anotar si aparece `key: ...` en el log, el valor de `key` y si el volumen del sistema cambió (aparece el slider de volumen).

- [ ] **Step 6: Crear `DECISIONS.md` con las conclusiones**

```markdown
# Decisiones

## Verificaciones técnicas (spike en emulador, Pixel 7 Pro API 34)

- Reconocimiento de voz: <disponible sí/no>, locales on-device instalados: <lista>, `es` soportados: <lista>.
- Resultados: parciales <sí/no>; números llegan como <dígitos/palabras>.
- TTS: voces en español: <identificadores>. Se usará `language` = <valor elegido>.
- Tecla de volumen con `expo-key-event`: evento recibido <sí/no> con `key` = <valor>; el volumen del sistema <cambia/no cambia>.
  Decisión: <usar expo-key-event / módulo nativo propio (Task 15, plan B)>.
```

Reemplazar cada `<...>` con lo observado. Es un registro de hechos y no deben quedar `<...>` sin completar.

- [ ] **Step 7: Revertir el spike y commitear**

```bash
git checkout -- App.tsx
```

Si la decisión es el plan B (módulo propio), quitar la dependencia: `npm uninstall expo-key-event`.

```bash
git add DECISIONS.md package.json package-lock.json
git commit -m "chore: verificar STT, TTS y teclas de volumen en emulador"
```

---

### Task 3: Dominio: tipos, categorías y fechas

**Files:**
- Create: `src/domain/types.ts`, `src/domain/categories.ts`, `src/domain/dates.ts`
- Test: `src/domain/__tests__/categories.test.ts`, `src/domain/__tests__/dates.test.ts`

**Interfaces:**
- Produces:
  - `CATEGORIES`, `Category`, `CategoryCounts`, `StockByLot`, `Farm`, `EventSource`, `Interpreter`, `RainEvent`, `MoveEvent`, `VoidEvent`, `FarmEvent`
  - `categoryFromWord(word: string): Category | null`, `categoryLabel(c: Category, n: number): string`
  - `toISODate(d: Date): string`, `addDays(iso, n): string`, `monthName(iso): string`, `formatLongDate(iso): string`, `formatShortDate(iso): string`, `describeDay(iso, today): string`
  - `RAIN_PERIODS`, `RainPeriod`, `DateRange { from; to; label }`, `periodRange(period, today, days = 7): DateRange`
  - `RelativeDayWord`, `resolveRelativeDay(word, today): string`

- [ ] **Step 1: Escribir los tests**

`src/domain/__tests__/categories.test.ts`:

```ts
import { categoryFromWord, categoryLabel } from '../categories';

describe('categorías', () => {
  it('mapea sinónimos rioplatenses a la categoría canónica', () => {
    expect(categoryFromWord('vaquillas')).toBe('vaquillonas');
    expect(categoryFromWord('vaquillona')).toBe('vaquillonas');
    expect(categoryFromWord('terneras')).toBe('terneros');
    expect(categoryFromWord('novillitos')).toBe('novillos');
    expect(categoryFromWord('toro')).toBe('toros');
  });

  it('devuelve null para palabras que no son categorías', () => {
    expect(categoryFromWord('perros')).toBeNull();
    expect(categoryFromWord('lote')).toBeNull();
  });

  it('usa singular solo para 1', () => {
    expect(categoryLabel('vacas', 1)).toBe('vaca');
    expect(categoryLabel('vaquillonas', 40)).toBe('vaquillonas');
    expect(categoryLabel('toros', 0)).toBe('toros');
  });
});
```

`src/domain/__tests__/dates.test.ts`:

```ts
import { addDays, describeDay, formatLongDate, formatShortDate, periodRange, resolveRelativeDay, toISODate } from '../dates';

describe('fechas', () => {
  it('formatea fechas locales como YYYY-MM-DD', () => {
    expect(toISODate(new Date(2026, 9, 3, 23, 59))).toBe('2026-10-03');
  });

  it('suma y resta días cruzando meses y años', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('anoche y ayer son el día anterior; anteayer, dos días antes', () => {
    expect(resolveRelativeDay('anoche', '2026-10-13')).toBe('2026-10-12');
    expect(resolveRelativeDay('ayer', '2026-10-01')).toBe('2026-09-30');
    expect(resolveRelativeDay('anteayer', '2026-10-01')).toBe('2026-09-29');
    expect(resolveRelativeDay('hoy', '2026-10-13')).toBe('2026-10-13');
  });

  it('calcula el rango de este mes hasta hoy', () => {
    expect(periodRange('mes', '2026-10-13')).toEqual({ from: '2026-10-01', to: '2026-10-13', label: 'en octubre' });
  });

  it('calcula el mes anterior completo', () => {
    expect(periodRange('mes_anterior', '2026-03-10')).toEqual({ from: '2026-02-01', to: '2026-02-28', label: 'en febrero' });
  });

  it('últimos N días incluye hoy', () => {
    expect(periodRange('ultimos_dias', '2026-10-13', 10)).toEqual({ from: '2026-10-04', to: '2026-10-13', label: 'en los últimos 10 días' });
    expect(periodRange('semana', '2026-10-13')).toEqual({ from: '2026-10-07', to: '2026-10-13', label: 'en los últimos 7 días' });
  });

  it('hoy y ayer como rangos de un día', () => {
    expect(periodRange('hoy', '2026-10-13')).toEqual({ from: '2026-10-13', to: '2026-10-13', label: 'hoy' });
    expect(periodRange('ayer', '2026-10-13')).toEqual({ from: '2026-10-12', to: '2026-10-12', label: 'ayer' });
  });

  it('describe días relativos y fechas en español', () => {
    expect(describeDay('2026-10-13', '2026-10-13')).toBe('hoy');
    expect(describeDay('2026-10-12', '2026-10-13')).toBe('ayer');
    expect(describeDay('2026-10-02', '2026-10-13')).toBe('el 2/10');
    expect(formatLongDate('2026-10-13')).toBe('martes 13 de octubre');
    expect(formatShortDate('2026-01-05')).toBe('5/1');
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm test -- src/domain`
Expected: FAIL, "Cannot find module '../categories'" y "'../dates'".

- [ ] **Step 3: Implementar**

`src/domain/types.ts`:

```ts
export const CATEGORIES = ['vacas', 'vaquillonas', 'terneros', 'novillos', 'toros'] as const;
export type Category = (typeof CATEGORIES)[number];
export type CategoryCounts = Record<Category, number>;
export type StockByLot = Record<number, CategoryCounts>;

export interface Farm {
  name: string;
  location: string;
  lots: number[];
  initialStock: Record<number, Partial<CategoryCounts>>;
}

export type EventSource = 'voz' | 'texto' | 'semilla';
export type Interpreter = 'ia' | 'local';

interface BaseEvent {
  id: string;
  occurredOn: string;
  recordedAt: string;
  source: EventSource;
  interpreter: Interpreter | null;
  rawText: string | null;
}

export interface RainEvent extends BaseEvent {
  type: 'lluvia';
  payload: { mm: number };
}

export interface MoveEvent extends BaseEvent {
  type: 'movimiento';
  payload: { category: Category; count: number; fromLot: number; toLot: number };
}

export interface VoidEvent extends BaseEvent {
  type: 'anulacion';
  payload: { targetId: string };
}

export type FarmEvent = RainEvent | MoveEvent | VoidEvent;
```

`src/domain/categories.ts`:

```ts
import { Category } from './types';

const SINGULAR: Record<Category, string> = {
  vacas: 'vaca',
  vaquillonas: 'vaquillona',
  terneros: 'ternero',
  novillos: 'novillo',
  toros: 'toro',
};

// Palabras ya normalizadas (minúsculas, sin tildes).
const SYNONYMS: Record<string, Category> = {
  vaca: 'vacas',
  vacas: 'vacas',
  vaquillona: 'vaquillonas',
  vaquillonas: 'vaquillonas',
  vaquilla: 'vaquillonas',
  vaquillas: 'vaquillonas',
  ternero: 'terneros',
  terneros: 'terneros',
  ternera: 'terneros',
  terneras: 'terneros',
  ternerito: 'terneros',
  terneritos: 'terneros',
  novillo: 'novillos',
  novillos: 'novillos',
  novillito: 'novillos',
  novillitos: 'novillos',
  toro: 'toros',
  toros: 'toros',
};

export function categoryFromWord(word: string): Category | null {
  return SYNONYMS[word] ?? null;
}

export function categoryLabel(category: Category, count: number): string {
  return count === 1 ? SINGULAR[category] : category;
}
```

`src/domain/dates.ts`:

```ts
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function monthName(iso: string): string {
  return MONTHS[fromISODate(iso).getMonth()];
}

export function formatLongDate(iso: string): string {
  const d = fromISODate(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export function formatShortDate(iso: string): string {
  const d = fromISODate(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function describeDay(iso: string, today: string): string {
  if (iso === today) return 'hoy';
  if (iso === addDays(today, -1)) return 'ayer';
  return `el ${formatShortDate(iso)}`;
}

export const RAIN_PERIODS = ['hoy', 'ayer', 'semana', 'mes', 'mes_anterior', 'ultimos_dias'] as const;
export type RainPeriod = (typeof RAIN_PERIODS)[number];

export interface DateRange {
  from: string;
  to: string;
  label: string;
}

export function periodRange(period: RainPeriod, today: string, days = 7): DateRange {
  const d = fromISODate(today);
  switch (period) {
    case 'hoy':
      return { from: today, to: today, label: 'hoy' };
    case 'ayer': {
      const y = addDays(today, -1);
      return { from: y, to: y, label: 'ayer' };
    }
    case 'semana':
      return { from: addDays(today, -6), to: today, label: 'en los últimos 7 días' };
    case 'mes':
      return { from: toISODate(new Date(d.getFullYear(), d.getMonth(), 1)), to: today, label: `en ${MONTHS[d.getMonth()]}` };
    case 'mes_anterior': {
      const first = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const last = new Date(d.getFullYear(), d.getMonth(), 0);
      return { from: toISODate(first), to: toISODate(last), label: `en ${MONTHS[first.getMonth()]}` };
    }
    case 'ultimos_dias':
      return { from: addDays(today, -(days - 1)), to: today, label: `en los últimos ${days} días` };
  }
}

export type RelativeDayWord = 'hoy' | 'anoche' | 'ayer' | 'anteayer';

export function resolveRelativeDay(word: RelativeDayWord, today: string): string {
  switch (word) {
    case 'hoy':
      return today;
    case 'anoche':
    case 'ayer':
      return addDays(today, -1);
    case 'anteayer':
      return addDays(today, -2);
  }
}
```

- [ ] **Step 4: Correr tests y typecheck**

Run: `npm test -- src/domain && npm run typecheck`
Expected: PASS (todos), sin errores de tipos.

- [ ] **Step 5: Commit**

```bash
git add src/domain
git commit -m "feat(dominio): tipos de eventos, categorías con sinónimos y fechas relativas"
```

---

### Task 4: Dominio: stock, lluvias y resumen de hoy

**Files:**
- Create: `src/domain/stock.ts`, `src/domain/rain.ts`, `src/domain/summary.ts`
- Test: `src/domain/__tests__/stock.test.ts`, `src/domain/__tests__/rain.test.ts`, `src/domain/__tests__/summary.test.ts`
- Create: `src/test-utils/events.ts` (helpers de tests, no es un test)

**Interfaces:**
- Consumes: tipos y fechas de Task 3.
- Produces:
  - `emptyCounts(): CategoryCounts`, `countTotal(c): number`, `activeEvents(events): (RainEvent | MoveEvent)[]`, `projectStock(farm, events): StockByLot`, `farmTotal(stock): number`
  - `RainItem { date; mm }`, `RainSummary { totalMm; items }`, `rainInRange(events, { from, to }): RainSummary`, `lastRain(events, today): RainItem | null`, `roundMm(mm): number`, `formatMm(mm): string`
  - `TodayRecord { time; text }`, `TodaySummary`, `todaySummary(farm, events, today): TodaySummary`, `farmSummaryText(farm, events): string`
  - Helpers de test: `rain(id, occurredOn, mm, opts?)`, `move(id, count, category, fromLot, toLot, opts?)`, `voidOf(id, targetId)`

- [ ] **Step 1: Helpers de tests**

`src/test-utils/events.ts`:

```ts
import { Category, EventSource, FarmEvent } from '@/domain/types';

interface Opts {
  source?: EventSource;
  recordedAt?: string;
  occurredOn?: string;
}

export function rain(id: string, occurredOn: string, mm: number, opts: Opts = {}): FarmEvent {
  return {
    id,
    type: 'lluvia',
    occurredOn,
    recordedAt: opts.recordedAt ?? `${occurredOn}T15:00:00.000Z`,
    source: opts.source ?? 'texto',
    interpreter: null,
    rawText: null,
    payload: { mm },
  };
}

export function move(id: string, count: number, category: Category, fromLot: number, toLot: number, opts: Opts = {}): FarmEvent {
  const occurredOn = opts.occurredOn ?? '2026-10-13';
  return {
    id,
    type: 'movimiento',
    occurredOn,
    recordedAt: opts.recordedAt ?? `${occurredOn}T15:00:00.000Z`,
    source: opts.source ?? 'texto',
    interpreter: 'local',
    rawText: null,
    payload: { category, count, fromLot, toLot },
  };
}

export function voidOf(id: string, targetId: string): FarmEvent {
  return {
    id,
    type: 'anulacion',
    occurredOn: '2026-10-13',
    recordedAt: '2026-10-13T15:30:00.000Z',
    source: 'texto',
    interpreter: 'local',
    rawText: null,
    payload: { targetId },
  };
}
```

- [ ] **Step 2: Escribir los tests**

`src/domain/__tests__/stock.test.ts`:

```ts
import { move, voidOf } from '@/test-utils/events';
import { activeEvents, countTotal, farmTotal, projectStock } from '../stock';
import { Farm } from '../types';

const farm: Farm = {
  name: 'Test',
  location: 'X',
  lots: [1, 2, 3],
  initialStock: { 1: { vacas: 10 }, 2: { vaquillonas: 5 }, 3: {} },
};

describe('stock', () => {
  it('completa con ceros las categorías ausentes', () => {
    const stock = projectStock(farm, []);
    expect(stock[3]).toEqual({ vacas: 0, vaquillonas: 0, terneros: 0, novillos: 0, toros: 0 });
    expect(countTotal(stock[1])).toBe(10);
    expect(farmTotal(stock)).toBe(15);
  });

  it('aplica movimientos en orden', () => {
    const stock = projectStock(farm, [move('a', 4, 'vacas', 1, 3), move('b', 1, 'vacas', 3, 2)]);
    expect(stock[1].vacas).toBe(6);
    expect(stock[3].vacas).toBe(3);
    expect(stock[2].vacas).toBe(1);
  });

  it('ignora movimientos anulados y las anulaciones mismas', () => {
    const events = [move('a', 4, 'vacas', 1, 3), voidOf('v', 'a')];
    expect(projectStock(farm, events)[1].vacas).toBe(10);
    expect(activeEvents(events)).toEqual([]);
  });
});
```

`src/domain/__tests__/rain.test.ts`:

```ts
import { rain, voidOf } from '@/test-utils/events';
import { formatMm, lastRain, rainInRange } from '../rain';

describe('lluvias', () => {
  const events = [
    rain('a', '2026-10-12', 18),
    rain('b', '2026-10-02', 6),
    rain('c', '2026-09-30', 10),
    rain('d', '2026-10-05', 12.5),
    rain('e', '2026-10-06', 0.2),
    voidOf('v', 'e'),
  ];

  it('suma solo dentro del rango y sin anuladas, ordenado de más nuevo a más viejo', () => {
    const r = rainInRange(events, { from: '2026-10-01', to: '2026-10-13' });
    expect(r.totalMm).toBe(36.5);
    expect(r.items.map((i) => i.date)).toEqual(['2026-10-12', '2026-10-05', '2026-10-02']);
  });

  it('devuelve la última lluvia hasta hoy', () => {
    expect(lastRain(events, '2026-10-13')).toEqual({ date: '2026-10-12', mm: 18 });
    expect(lastRain([], '2026-10-13')).toBeNull();
  });

  it('formatea milímetros con coma decimal', () => {
    expect(formatMm(12.5)).toBe('12,5');
    expect(formatMm(18)).toBe('18');
    expect(formatMm(0.1 + 0.2)).toBe('0,3');
  });
});
```

`src/domain/__tests__/summary.test.ts`:

```ts
import { move, rain } from '@/test-utils/events';
import { farmSummaryText, todaySummary } from '../summary';
import { Farm } from '../types';

const farm: Farm = {
  name: 'Test',
  location: 'X',
  lots: [1, 2],
  initialStock: { 1: { vacas: 10, terneros: 4 }, 2: {} },
};

const at = (h: number, m: number) => new Date(2026, 9, 13, h, m).toISOString();

describe('resumen de hoy', () => {
  it('cuenta lluvias, cabezas y registros de hoy sin incluir la semilla', () => {
    const events = [
      rain('s1', '2026-10-11', 20, { source: 'semilla', recordedAt: at(8, 0) }),
      rain('r1', '2026-10-13', 5, { recordedAt: at(9, 15) }),
      move('m1', 3, 'vacas', 1, 2, { recordedAt: at(10, 42) }),
      rain('old', '2026-10-12', 7, { recordedAt: new Date(2026, 9, 12, 18, 0).toISOString() }),
    ];
    const s = todaySummary(farm, events, '2026-10-13');
    expect(s.rainTodayMm).toBe(5);
    expect(s.rainMonthMm).toBe(32);
    expect(s.month).toBe('octubre');
    expect(s.lastRain).toEqual({ date: '2026-10-13', mm: 5 });
    expect(s.totalHeads).toBe(14);
    expect(s.lotCount).toBe(2);
    expect(s.movesToday).toBe(1);
    expect(s.records).toEqual([
      { time: '10:42', text: '3 vacas · lote 1 → 2' },
      { time: '09:15', text: 'Lluvia 5 mm' },
    ]);
  });

  it('describe el stock por lote para el prompt del LLM', () => {
    expect(farmSummaryText(farm, [])).toBe('Lote 1: 10 vacas, 4 terneros\nLote 2: vacío');
  });
});
```

- [ ] **Step 3: Correr y verificar que fallan**

Run: `npm test -- src/domain`
Expected: FAIL, "Cannot find module '../stock'" (y `rain`, `summary`).

- [ ] **Step 4: Implementar**

`src/domain/stock.ts`:

```ts
import { CATEGORIES, CategoryCounts, Farm, FarmEvent, MoveEvent, RainEvent, StockByLot } from './types';

export function emptyCounts(): CategoryCounts {
  return { vacas: 0, vaquillonas: 0, terneros: 0, novillos: 0, toros: 0 };
}

export function countTotal(counts: CategoryCounts): number {
  return CATEGORIES.reduce((sum, c) => sum + counts[c], 0);
}

export function activeEvents(events: FarmEvent[]): (RainEvent | MoveEvent)[] {
  const voided = new Set(events.flatMap((e) => (e.type === 'anulacion' ? [e.payload.targetId] : [])));
  return events.filter((e): e is RainEvent | MoveEvent => e.type !== 'anulacion' && !voided.has(e.id));
}

export function projectStock(farm: Farm, events: FarmEvent[]): StockByLot {
  const stock: StockByLot = {};
  for (const lot of farm.lots) stock[lot] = { ...emptyCounts(), ...farm.initialStock[lot] };
  for (const e of activeEvents(events)) {
    if (e.type !== 'movimiento') continue;
    const { category, count, fromLot, toLot } = e.payload;
    stock[fromLot][category] -= count;
    stock[toLot][category] += count;
  }
  return stock;
}

export function farmTotal(stock: StockByLot): number {
  return Object.values(stock).reduce((sum, counts) => sum + countTotal(counts), 0);
}
```

`src/domain/rain.ts`:

```ts
import { DateRange } from './dates';
import { activeEvents } from './stock';
import { FarmEvent, RainEvent } from './types';

export interface RainItem {
  date: string;
  mm: number;
}

export interface RainSummary {
  totalMm: number;
  items: RainItem[];
}

export function roundMm(mm: number): number {
  return Math.round(mm * 10) / 10;
}

export function formatMm(mm: number): string {
  return String(roundMm(mm)).replace('.', ',');
}

function rains(events: FarmEvent[]): RainEvent[] {
  return activeEvents(events).filter((e): e is RainEvent => e.type === 'lluvia');
}

export function rainInRange(events: FarmEvent[], range: Pick<DateRange, 'from' | 'to'>): RainSummary {
  const items = rains(events)
    .filter((e) => e.occurredOn >= range.from && e.occurredOn <= range.to)
    .map((e) => ({ date: e.occurredOn, mm: e.payload.mm }))
    .sort((a, b) => b.date.localeCompare(a.date));
  return { totalMm: roundMm(items.reduce((sum, i) => sum + i.mm, 0)), items };
}

export function lastRain(events: FarmEvent[], today: string): RainItem | null {
  const past = rains(events)
    .filter((e) => e.occurredOn <= today)
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
  return past.length > 0 ? { date: past[0].occurredOn, mm: past[0].payload.mm } : null;
}
```

`src/domain/summary.ts`:

```ts
import { categoryLabel } from './categories';
import { monthName, periodRange, toISODate } from './dates';
import { formatMm, lastRain, rainInRange, RainItem } from './rain';
import { activeEvents, farmTotal, projectStock } from './stock';
import { CATEGORIES, Farm, FarmEvent } from './types';

export interface TodayRecord {
  time: string;
  text: string;
}

export interface TodaySummary {
  rainTodayMm: number;
  rainMonthMm: number;
  month: string;
  lastRain: RainItem | null;
  totalHeads: number;
  lotCount: number;
  movesToday: number;
  records: TodayRecord[];
}

function localTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function todaySummary(farm: Farm, events: FarmEvent[], today: string): TodaySummary {
  const recordedToday = activeEvents(events).filter(
    (e) => e.source !== 'semilla' && toISODate(new Date(e.recordedAt)) === today,
  );
  const records = [...recordedToday].reverse().map((e) => ({
    time: localTime(e.recordedAt),
    text:
      e.type === 'lluvia'
        ? `Lluvia ${formatMm(e.payload.mm)} mm`
        : `${e.payload.count} ${categoryLabel(e.payload.category, e.payload.count)} · lote ${e.payload.fromLot} → ${e.payload.toLot}`,
  }));
  return {
    rainTodayMm: rainInRange(events, { from: today, to: today }).totalMm,
    rainMonthMm: rainInRange(events, periodRange('mes', today)).totalMm,
    month: monthName(today),
    lastRain: lastRain(events, today),
    totalHeads: farmTotal(projectStock(farm, events)),
    lotCount: farm.lots.length,
    movesToday: recordedToday.filter((e) => e.type === 'movimiento').length,
    records,
  };
}

export function farmSummaryText(farm: Farm, events: FarmEvent[]): string {
  const stock = projectStock(farm, events);
  return farm.lots
    .map((lot) => {
      const parts = CATEGORIES.filter((c) => stock[lot][c] > 0).map((c) => `${stock[lot][c]} ${c}`);
      return `Lote ${lot}: ${parts.length > 0 ? parts.join(', ') : 'vacío'}`;
    })
    .join('\n');
}
```

- [ ] **Step 5: Correr tests y typecheck**

Run: `npm test -- src/domain && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain src/test-utils
git commit -m "feat(dominio): proyección de stock, lluvias por rango y resumen de hoy"
```

---

### Task 5: Datos: semilla y store en memoria

**Files:**
- Create: `src/data/seed.json`, `src/data/seed.ts`, `src/data/eventStore.ts`
- Test: `src/data/__tests__/seed.test.ts`, `src/data/__tests__/eventStore.test.ts`

**Interfaces:**
- Consumes: `Farm`, `RainEvent`, `FarmEvent`, `addDays`, `projectStock`, `farmTotal`, `rainInRange`.
- Produces:
  - `FARM: Farm`, `SEED_VERSION = '1'`, `buildSeedEvents(installDate: string, newId: () => string, recordedAt: string): RainEvent[]`
  - `interface EventStore { list(): Promise<FarmEvent[]>; append(events: FarmEvent[]): Promise<void>; replaceAll(events: FarmEvent[]): Promise<void> }`
  - `class MemoryEventStore implements EventStore`

- [ ] **Step 1: Escribir los tests**

`src/data/__tests__/seed.test.ts`:

```ts
import { farmTotal, projectStock } from '@/domain/stock';
import { rainInRange } from '@/domain/rain';
import { buildSeedEvents, FARM } from '../seed';

describe('semilla', () => {
  it('La Tranquera tiene 8 lotes y 450 cabezas', () => {
    expect(FARM.name).toBe('La Tranquera');
    expect(FARM.lots).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const stock = projectStock(FARM, []);
    expect(farmTotal(stock)).toBe(450);
    expect(stock[3].vaquillonas).toBe(45);
    expect(stock[5].vaquillonas).toBe(40);
    expect(stock[8]).toEqual({ vacas: 0, vaquillonas: 0, terneros: 0, novillos: 0, toros: 0 });
  });

  it('materializa las lluvias relativas a la fecha de instalación', () => {
    let n = 0;
    const events = buildSeedEvents('2026-10-13', () => `s-${++n}`, '2026-10-13T12:00:00.000Z');
    expect(events).toHaveLength(9);
    expect(events[0]).toMatchObject({ id: 's-1', type: 'lluvia', occurredOn: '2026-10-11', source: 'semilla', payload: { mm: 6 } });
    expect(rainInRange(events, { from: '2026-08-14', to: '2026-10-13' }).totalMm).toBe(123);
    expect(new Set(events.map((e) => e.id)).size).toBe(9);
  });
});
```

`src/data/__tests__/eventStore.test.ts`:

```ts
import { rain } from '@/test-utils/events';
import { MemoryEventStore } from '../eventStore';

describe('MemoryEventStore', () => {
  it('agrega en orden y reemplaza todo', async () => {
    const store = new MemoryEventStore([rain('a', '2026-10-01', 1)]);
    await store.append([rain('b', '2026-10-02', 2), rain('c', '2026-10-03', 3)]);
    expect((await store.list()).map((e) => e.id)).toEqual(['a', 'b', 'c']);
    await store.replaceAll([rain('z', '2026-10-04', 4)]);
    expect((await store.list()).map((e) => e.id)).toEqual(['z']);
  });

  it('list devuelve una copia', async () => {
    const store = new MemoryEventStore();
    const list = await store.list();
    list.push(rain('x', '2026-10-01', 1));
    expect(await store.list()).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm test -- src/data`
Expected: FAIL, "Cannot find module '../seed'".

- [ ] **Step 3: Implementar**

`src/data/seed.json`:

```json
{
  "farm": {
    "name": "La Tranquera",
    "location": "Castelli, Buenos Aires",
    "lots": [1, 2, 3, 4, 5, 6, 7, 8],
    "initialStock": {
      "1": { "vacas": 70, "terneros": 40 },
      "2": { "vacas": 70, "terneros": 42 },
      "3": { "vaquillonas": 45 },
      "4": { "vacas": 70, "terneros": 38 },
      "5": { "vaquillonas": 40 },
      "6": { "novillos": 25 },
      "7": { "toros": 10 },
      "8": {}
    }
  },
  "rains": [
    { "daysAgo": 2, "mm": 6 },
    { "daysAgo": 5, "mm": 22 },
    { "daysAgo": 11, "mm": 4 },
    { "daysAgo": 18, "mm": 35 },
    { "daysAgo": 24, "mm": 12 },
    { "daysAgo": 31, "mm": 8 },
    { "daysAgo": 39, "mm": 18 },
    { "daysAgo": 47, "mm": 3 },
    { "daysAgo": 55, "mm": 15 }
  ]
}
```

`src/data/seed.ts`:

```ts
import { addDays } from '@/domain/dates';
import { Farm, RainEvent } from '@/domain/types';
import seed from './seed.json';

export const FARM: Farm = seed.farm as Farm;
export const SEED_VERSION = '1';

// Las lluvias se guardan como "hace N días" para que el demo tenga datos recientes sin importar cuándo se instale.
export function buildSeedEvents(installDate: string, newId: () => string, recordedAt: string): RainEvent[] {
  return seed.rains.map((r) => ({
    id: newId(),
    type: 'lluvia' as const,
    occurredOn: addDays(installDate, -r.daysAgo),
    recordedAt,
    source: 'semilla' as const,
    interpreter: null,
    rawText: null,
    payload: { mm: r.mm },
  }));
}
```

`src/data/eventStore.ts`:

```ts
import { FarmEvent } from '@/domain/types';

export interface EventStore {
  list(): Promise<FarmEvent[]>;
  append(events: FarmEvent[]): Promise<void>;
  replaceAll(events: FarmEvent[]): Promise<void>;
}

export class MemoryEventStore implements EventStore {
  private events: FarmEvent[];

  constructor(initial: FarmEvent[] = []) {
    this.events = [...initial];
  }

  async list(): Promise<FarmEvent[]> {
    return [...this.events];
  }

  async append(events: FarmEvent[]): Promise<void> {
    this.events.push(...events);
  }

  async replaceAll(events: FarmEvent[]): Promise<void> {
    this.events = [...events];
  }
}
```

- [ ] **Step 4: Correr tests y typecheck**

Run: `npm test -- src/data && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data
git commit -m "feat(datos): semilla de La Tranquera con lluvias relativas y store en memoria"
```

---

### Task 6: Herramientas: contrato y lluvia

**Files:**
- Create: `src/tools/schemas.ts`, `src/tools/intent.ts`, `src/tools/cards.ts`, `src/tools/types.ts`, `src/tools/format.ts`, `src/tools/rain.ts`
- Create: `src/test-utils/toolContext.ts`
- Test: `src/tools/__tests__/intent.test.ts`, `src/tools/__tests__/rain.test.ts`

**Interfaces:**
- Consumes: dominio (Tasks 3–4), `FARM` (Task 5).
- Produces:
  - `toolSchemas`, `ToolName`, `ToolArgs<K>`, `Intent`, `toolDescriptions: Record<ToolName, string>`, `parseIntent(tool: string, args: unknown): Intent | null`
  - `cleanArgs<T>(args: T): T`, `withArgs(intent: Intent, extra: Record<string, unknown>): Intent`, `mergeIntent(base: Intent, next: Intent): Intent`
  - `CardTone = 'registro' | 'consulta' | 'pendiente' | 'ayuda' | 'rechazo'`, `CardField { label; value: string | null }`, `Card { tone; title; headline?; lines: string[]; fields?; undoableEventId?; at? }`
  - `Slot = 'mm' | 'confirmacion' | 'cantidad' | 'categoria' | 'lote_origen' | 'lote_destino'`, `PendingInfo { intent: Intent; missing: Slot }`
  - `ToolContext { farm; events; today; now; newId; origin: { source; interpreter; rawText } }`
  - `ToolResult = { status: 'ok'; card; speech; newEvents } | { status: 'needs_info'; missing: Slot; partial: Intent; question; card } | { status: 'rejected'; card; speech }`
  - `fmtMm`, `capitalize`, `joinEs`, `cuantos`, `needs`, `reject`, `eventOrigin`, `lotRangeText`
  - `registrarLluvia(args, ctx): ToolResult`, `consultarLluvia(args, ctx): ToolResult`, `RAIN_CONFIRM_ABOVE_MM = 150`
  - Test util: `TODAY = '2026-10-13'`, `makeCtx(events?: FarmEvent[]): ToolContext`

- [ ] **Step 1: Test util de contexto**

`src/test-utils/toolContext.ts`:

```ts
import { FARM } from '@/data/seed';
import { FarmEvent } from '@/domain/types';
import { ToolContext } from '@/tools/types';

export const TODAY = '2026-10-13';

export function makeCtx(events: FarmEvent[] = []): ToolContext {
  let n = 0;
  return {
    farm: FARM,
    events,
    today: TODAY,
    now: '2026-10-13T13:00:00.000Z',
    newId: () => `id-${++n}`,
    origin: { source: 'texto', interpreter: 'local', rawText: 'prueba' },
  };
}
```

- [ ] **Step 2: Escribir los tests**

`src/tools/__tests__/intent.test.ts`:

```ts
import { cleanArgs, mergeIntent, withArgs } from '../intent';
import { parseIntent, toolSchemas } from '../schemas';

describe('intents', () => {
  it('valida argumentos con zod y rechaza herramientas desconocidas', () => {
    expect(parseIntent('mover_animales', { cantidad: 40, categoria: 'vaquillonas' })).toEqual({
      tool: 'mover_animales',
      args: { cantidad: 40, categoria: 'vaquillonas' },
    });
    expect(parseIntent('mover_animales', { categoria: 'perros' })).toBeNull();
    expect(parseIntent('borrar_todo', {})).toBeNull();
    expect(parseIntent('registrar_lluvia', { mm: -3 })).toBeNull();
  });

  it('acepta cantidad "todas"', () => {
    expect(parseIntent('mover_animales', { cantidad: 'todas' })).not.toBeNull();
  });

  it('limpia undefined y null', () => {
    expect(cleanArgs({ a: 1, b: undefined, c: null })).toEqual({ a: 1 });
  });

  it('combina un pendiente con datos nuevos de la misma herramienta', () => {
    const base = { tool: 'mover_animales' as const, args: { cantidad: 40, lote_destino: 5 } };
    expect(mergeIntent(base, { tool: 'mover_animales', args: { lote_origen: 3 } })).toEqual({
      tool: 'mover_animales',
      args: { cantidad: 40, lote_destino: 5, lote_origen: 3 },
    });
    expect(withArgs(base, { lote_origen: undefined })).toEqual(base);
  });

  it('si la herramienta cambia, gana la nueva', () => {
    const next = { tool: 'consultar_lluvia' as const, args: {} };
    expect(mergeIntent({ tool: 'mover_animales', args: {} }, next)).toBe(next);
  });

  it('expone las 5 herramientas', () => {
    expect(Object.keys(toolSchemas).sort()).toEqual(['consultar_lluvia', 'consultar_stock', 'deshacer_ultimo', 'mover_animales', 'registrar_lluvia']);
  });
});
```

`src/tools/__tests__/rain.test.ts`:

```ts
import { rain } from '@/test-utils/events';
import { makeCtx } from '@/test-utils/toolContext';
import { consultarLluvia, registrarLluvia } from '../rain';

describe('registrar_lluvia', () => {
  it('registra "anoche" como el día anterior y devuelve comprobante + voz', () => {
    const r = registrarLluvia({ mm: 18, fecha: '2026-10-12' }, makeCtx());
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.newEvents).toHaveLength(1);
    expect(r.newEvents[0]).toMatchObject({ type: 'lluvia', occurredOn: '2026-10-12', payload: { mm: 18 }, source: 'texto', rawText: 'prueba' });
    expect(r.card).toMatchObject({ tone: 'registro', title: 'Lluvia registrada', headline: '18 mm', undoableEventId: 'id-1' });
    expect(r.card.lines).toEqual(['Ayer · 12/10', 'Acumulado de octubre: 18 mm']);
    expect(r.speech).toBe('Anotado: 18 milímetros ayer. En octubre van 18.');
  });

  it('sin fecha usa hoy y acumula con lo existente', () => {
    const r = registrarLluvia({ mm: 12.5 }, makeCtx([rain('a', '2026-10-02', 6)]));
    expect(r.status === 'ok' && r.speech).toBe('Anotado: 12,5 milímetros hoy. En octubre van 18,5.');
  });

  it('sin milímetros pide el dato', () => {
    const r = registrarLluvia({ fecha: '2026-10-12' }, makeCtx());
    expect(r).toMatchObject({ status: 'needs_info', missing: 'mm', question: '¿Cuántos milímetros llovieron?' });
    if (r.status !== 'needs_info') return;
    expect(r.partial).toEqual({ tool: 'registrar_lluvia', args: { fecha: '2026-10-12' } });
    expect(r.card.fields).toEqual([
      { label: 'Milímetros', value: null },
      { label: 'Fecha', value: 'ayer' },
    ]);
  });

  it('más de 150 mm pide confirmación y con confirmado registra', () => {
    expect(registrarLluvia({ mm: 200 }, makeCtx())).toMatchObject({ status: 'needs_info', missing: 'confirmacion', question: '¿Seguro que fueron 200 milímetros?' });
    expect(registrarLluvia({ mm: 200, confirmado: true }, makeCtx()).status).toBe('ok');
  });

  it('rechaza fechas futuras sin escribir', () => {
    expect(registrarLluvia({ mm: 10, fecha: '2026-10-14' }, makeCtx())).toMatchObject({ status: 'rejected', speech: 'Esa fecha todavía no llegó. No registré nada.' });
  });
});

describe('consultar_lluvia', () => {
  const events = [rain('a', '2026-10-12', 18), rain('b', '2026-10-02', 6), rain('c', '2026-09-30', 10)];

  it('este mes por defecto, con detalle en la tarjeta', () => {
    const r = consultarLluvia({}, makeCtx(events));
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.speech).toBe('En octubre llovieron 24 milímetros, en 2 lluvias.');
    expect(r.card).toMatchObject({ tone: 'consulta', title: 'Lluvia en octubre', headline: '24 mm', lines: ['12/10 · 18 mm', '2/10 · 6 mm'] });
    expect(r.newEvents).toEqual([]);
  });

  it('un solo día no menciona cantidad de lluvias', () => {
    const r = consultarLluvia({ periodo: 'ayer' }, makeCtx(events));
    expect(r.status === 'ok' && r.speech).toBe('Ayer llovieron 18 milímetros.');
  });

  it('sin lluvias lo dice claro', () => {
    const r = consultarLluvia({ periodo: 'hoy' }, makeCtx(events));
    expect(r.status === 'ok' && r.speech).toBe('No llovió hoy.');
    expect(r.status === 'ok' && r.card.lines).toEqual(['Sin lluvias registradas']);
  });

  it('mes anterior y últimos N días', () => {
    const prev = consultarLluvia({ periodo: 'mes_anterior' }, makeCtx(events));
    expect(prev.status === 'ok' && prev.speech).toBe('En septiembre llovieron 10 milímetros.');
    const last = consultarLluvia({ periodo: 'ultimos_dias', dias: 2 }, makeCtx(events));
    expect(last.status === 'ok' && last.speech).toBe('En los últimos 2 días llovieron 18 milímetros.');
  });
});
```

- [ ] **Step 3: Correr y verificar que fallan**

Run: `npm test -- src/tools`
Expected: FAIL, módulos inexistentes.

- [ ] **Step 4: Implementar**

`src/tools/schemas.ts`:

```ts
import { z } from 'zod';
import { RAIN_PERIODS } from '@/domain/dates';
import { CATEGORIES } from '@/domain/types';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const toolSchemas = {
  registrar_lluvia: z.object({
    mm: z.number().positive().optional(),
    fecha: isoDate.optional(),
    confirmado: z.boolean().optional(),
  }),
  mover_animales: z.object({
    cantidad: z.union([z.number().int().positive(), z.literal('todas')]).optional(),
    categoria: z.enum(CATEGORIES).optional(),
    lote_origen: z.number().int().optional(),
    lote_destino: z.number().int().optional(),
    fecha: isoDate.optional(),
  }),
  consultar_lluvia: z.object({
    periodo: z.enum(RAIN_PERIODS).optional(),
    dias: z.number().int().positive().max(365).optional(),
  }),
  consultar_stock: z.object({
    lote: z.number().int().optional(),
    categoria: z.enum(CATEGORIES).optional(),
  }),
  deshacer_ultimo: z.object({}),
};

export type ToolName = keyof typeof toolSchemas;
export type ToolArgs<K extends ToolName> = z.infer<(typeof toolSchemas)[K]>;
export type Intent = { [K in ToolName]: { tool: K; args: ToolArgs<K> } }[ToolName];

export const toolDescriptions: Record<ToolName, string> = {
  registrar_lluvia: 'Registra una lluvia caída en el campo. mm = milímetros; fecha = día de la lluvia (YYYY-MM-DD, "anoche" es el día anterior). confirmado = true solo si el productor confirmó un valor mayor a 150 mm.',
  mover_animales: 'Registra un movimiento de animales entre lotes. cantidad = número o "todas"; categoria = vacas, vaquillonas, terneros, novillos o toros; lote_origen y lote_destino = números de lote.',
  consultar_lluvia: 'Consulta cuánto llovió en un período: hoy, ayer, semana, mes (este mes), mes_anterior o ultimos_dias (con dias).',
  consultar_stock: 'Consulta cuántos animales hay, opcionalmente por lote y/o categoría. Sin argumentos devuelve el total del campo.',
  deshacer_ultimo: 'Anula el último registro hecho por el productor (lluvia o movimiento).',
};

export function parseIntent(tool: string, args: unknown): Intent | null {
  if (!(tool in toolSchemas)) return null;
  const parsed = toolSchemas[tool as ToolName].safeParse(args);
  return parsed.success ? ({ tool, args: parsed.data } as Intent) : null;
}
```

`src/tools/intent.ts`:

```ts
import { Intent } from './schemas';

export function cleanArgs<T extends Record<string, unknown>>(args: T): T {
  return Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined && v !== null)) as T;
}

export function withArgs(intent: Intent, extra: Record<string, unknown>): Intent {
  return { tool: intent.tool, args: { ...intent.args, ...cleanArgs(extra) } } as Intent;
}

export function mergeIntent(base: Intent, next: Intent): Intent {
  return base.tool === next.tool ? withArgs(base, next.args) : next;
}
```

`src/tools/cards.ts`:

```ts
export type CardTone = 'registro' | 'consulta' | 'pendiente' | 'ayuda' | 'rechazo';

export interface CardField {
  label: string;
  value: string | null;
}

export interface Card {
  tone: CardTone;
  title: string;
  headline?: string;
  lines: string[];
  fields?: CardField[];
  undoableEventId?: string;
  at?: string;
}
```

`src/tools/types.ts`:

```ts
import { EventSource, Farm, FarmEvent, Interpreter } from '@/domain/types';
import { Card } from './cards';
import { Intent } from './schemas';

export type Slot = 'mm' | 'confirmacion' | 'cantidad' | 'categoria' | 'lote_origen' | 'lote_destino';

export interface PendingInfo {
  intent: Intent;
  missing: Slot;
}

export interface ToolContext {
  farm: Farm;
  events: FarmEvent[];
  today: string;
  now: string;
  newId: () => string;
  origin: { source: EventSource; interpreter: Interpreter; rawText: string };
}

export type ToolResult =
  | { status: 'ok'; card: Card; speech: string; newEvents: FarmEvent[] }
  | { status: 'needs_info'; missing: Slot; partial: Intent; question: string; card: Card }
  | { status: 'rejected'; card: Card; speech: string };
```

`src/tools/format.ts`:

```ts
import { formatMm } from '@/domain/rain';
import { Category } from '@/domain/types';
import { Card } from './cards';
import { Intent } from './schemas';
import { Slot, ToolContext, ToolResult } from './types';

export const fmtMm = formatMm;

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function joinEs(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

export function cuantos(category: Category): string {
  return category === 'vacas' || category === 'vaquillonas' ? 'Cuántas' : 'Cuántos';
}

export function needs(partial: Intent, missing: Slot, question: string, card: Card): ToolResult {
  return { status: 'needs_info', partial, missing, question, card };
}

export function reject(title: string, speech: string): ToolResult {
  return { status: 'rejected', speech, card: { tone: 'rechazo', title, lines: [speech] } };
}

export function eventOrigin(ctx: ToolContext) {
  return { recordedAt: ctx.now, source: ctx.origin.source, interpreter: ctx.origin.interpreter, rawText: ctx.origin.rawText };
}

export function lotRangeText(lots: number[]): string {
  return `los lotes van del ${Math.min(...lots)} al ${Math.max(...lots)}`;
}
```

`src/tools/rain.ts`:

```ts
import { describeDay, formatShortDate, monthName, periodRange } from '@/domain/dates';
import { rainInRange } from '@/domain/rain';
import { RainEvent } from '@/domain/types';
import { Card } from './cards';
import { capitalize, eventOrigin, fmtMm, needs, reject } from './format';
import { ToolArgs } from './schemas';
import { ToolContext, ToolResult } from './types';

export const RAIN_CONFIRM_ABOVE_MM = 150;

type RainArgs = ToolArgs<'registrar_lluvia'>;

function pendingCard(args: RainArgs, fecha: string, today: string): Card {
  return {
    tone: 'pendiente',
    title: 'Registrar lluvia',
    lines: [],
    fields: [
      { label: 'Milímetros', value: args.mm === undefined ? null : `${fmtMm(args.mm)} mm` },
      { label: 'Fecha', value: describeDay(fecha, today) },
    ],
  };
}

export function registrarLluvia(args: RainArgs, ctx: ToolContext): ToolResult {
  const intent = { tool: 'registrar_lluvia' as const, args };
  const fecha = args.fecha ?? ctx.today;
  if (fecha > ctx.today) return reject('Fecha futura', 'Esa fecha todavía no llegó. No registré nada.');
  if (args.mm === undefined) {
    return needs(intent, 'mm', '¿Cuántos milímetros llovieron?', pendingCard(args, fecha, ctx.today));
  }
  if (args.mm > RAIN_CONFIRM_ABOVE_MM && !args.confirmado) {
    return needs(intent, 'confirmacion', `¿Seguro que fueron ${fmtMm(args.mm)} milímetros?`, pendingCard(args, fecha, ctx.today));
  }

  const event: RainEvent = { id: ctx.newId(), type: 'lluvia', occurredOn: fecha, ...eventOrigin(ctx), payload: { mm: args.mm } };
  const month = rainInRange([...ctx.events, event], periodRange('mes', ctx.today));
  const day = describeDay(fecha, ctx.today);
  const mes = monthName(ctx.today);
  return {
    status: 'ok',
    newEvents: [event],
    speech: `Anotado: ${fmtMm(args.mm)} milímetros ${day}. En ${mes} van ${fmtMm(month.totalMm)}.`,
    card: {
      tone: 'registro',
      title: 'Lluvia registrada',
      headline: `${fmtMm(args.mm)} mm`,
      lines: [`${capitalize(day)} · ${formatShortDate(fecha)}`, `Acumulado de ${mes}: ${fmtMm(month.totalMm)} mm`],
      undoableEventId: event.id,
      at: ctx.now,
    },
  };
}

export function consultarLluvia(args: ToolArgs<'consultar_lluvia'>, ctx: ToolContext): ToolResult {
  const range = periodRange(args.periodo ?? 'mes', ctx.today, args.dias ?? 7);
  const { totalMm, items } = rainInRange(ctx.events, range);
  const speech =
    items.length === 0
      ? `No llovió ${range.label}.`
      : `${capitalize(range.label)} llovieron ${fmtMm(totalMm)} milímetros${items.length > 1 ? `, en ${items.length} lluvias` : ''}.`;
  return {
    status: 'ok',
    newEvents: [],
    speech,
    card: {
      tone: 'consulta',
      title: `Lluvia ${range.label}`,
      headline: `${fmtMm(totalMm)} mm`,
      lines: items.length === 0 ? ['Sin lluvias registradas'] : items.map((i) => `${formatShortDate(i.date)} · ${fmtMm(i.mm)} mm`),
    },
  };
}
```

- [ ] **Step 5: Correr tests y typecheck**

Run: `npm test -- src/tools && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tools src/test-utils
git commit -m "feat(herramientas): contrato con zod, comprobantes y herramientas de lluvia"
```

### Task 7: Herramientas: animales, stock y deshacer

**Files:**
- Create: `src/tools/animals.ts`, `src/tools/undo.ts`, `src/tools/index.ts`
- Test: `src/tools/__tests__/animals.test.ts`, `src/tools/__tests__/undo.test.ts`

**Interfaces:**
- Consumes: todo lo de Task 6; `projectStock`, `countTotal`, `farmTotal`, `categoryLabel`.
- Produces:
  - `moverAnimales(args, ctx): ToolResult`, `consultarStock(args, ctx): ToolResult`, `deshacerUltimo(args, ctx): ToolResult`
  - `runTool(intent: Intent, ctx: ToolContext): ToolResult`
  - `src/tools/index.ts` re-exporta `types`, `cards`, `schemas`, `intent` y `runTool`.

- [ ] **Step 1: Escribir los tests**

`src/tools/__tests__/animals.test.ts`:

```ts
import { move } from '@/test-utils/events';
import { makeCtx } from '@/test-utils/toolContext';
import { consultarStock, moverAnimales } from '../animals';

const full = { cantidad: 40, categoria: 'vaquillonas' as const, lote_origen: 3, lote_destino: 5 };

describe('mover_animales', () => {
  it('mueve y muestra el antes → después de la categoría', () => {
    const r = moverAnimales(full, makeCtx());
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.newEvents[0]).toMatchObject({ type: 'movimiento', payload: { category: 'vaquillonas', count: 40, fromLot: 3, toLot: 5 } });
    expect(r.card).toMatchObject({ tone: 'registro', title: 'Movimiento registrado', headline: '40 vaquillonas', undoableEventId: 'id-1' });
    expect(r.card.lines).toEqual(['Lote 3 → Lote 5', 'Lote 3: 45 → 5 vaquillonas', 'Lote 5: 40 → 80 vaquillonas']);
    expect(r.speech).toBe('Listo, pasé 40 vaquillonas del lote 3 al 5.');
  });

  it('usa singular para un animal', () => {
    const r = moverAnimales({ cantidad: 1, categoria: 'toros', lote_origen: 7, lote_destino: 6 }, makeCtx());
    expect(r.status === 'ok' && r.speech).toBe('Listo, pasé 1 toro del lote 7 al 6.');
  });

  it('"todas" mueve todo lo disponible', () => {
    const r = moverAnimales({ cantidad: 'todas', categoria: 'toros', lote_origen: 7, lote_destino: 6 }, makeCtx());
    expect(r.status === 'ok' && r.newEvents[0].payload).toEqual({ category: 'toros', count: 10, fromLot: 7, toLot: 6 });
  });

  it('pregunta un dato por vez: categoría, cantidad, origen, destino', () => {
    expect(moverAnimales({}, makeCtx())).toMatchObject({ status: 'needs_info', missing: 'categoria', question: '¿Qué animales? Vacas, vaquillonas, terneros, novillos o toros.' });
    expect(moverAnimales({ categoria: 'vaquillonas' }, makeCtx())).toMatchObject({ missing: 'cantidad', question: '¿Cuántas vaquillonas?' });
    expect(moverAnimales({ categoria: 'novillos' }, makeCtx())).toMatchObject({ missing: 'cantidad', question: '¿Cuántos novillos?' });
    expect(moverAnimales({ categoria: 'novillos', cantidad: 5 }, makeCtx())).toMatchObject({ missing: 'lote_origen', question: '¿De qué lote salen?' });
    expect(moverAnimales({ categoria: 'novillos', cantidad: 5, lote_origen: 6 }, makeCtx())).toMatchObject({ missing: 'lote_destino', question: '¿A qué lote van?' });
  });

  it('la tarjeta pendiente marca los huecos', () => {
    const r = moverAnimales({ cantidad: 40, categoria: 'vaquillonas', lote_destino: 5 }, makeCtx());
    expect(r.status === 'needs_info' && r.card.fields).toEqual([
      { label: 'Categoría', value: 'vaquillonas' },
      { label: 'Cantidad', value: '40' },
      { label: 'Lote origen', value: null },
      { label: 'Lote destino', value: 'Lote 5' },
    ]);
  });

  it('lote inexistente repregunta y limpia ese dato', () => {
    const r = moverAnimales({ ...full, lote_origen: 9 }, makeCtx());
    expect(r).toMatchObject({ status: 'needs_info', missing: 'lote_origen', question: 'No tengo lote 9, los lotes van del 1 al 8. ¿De qué lote salen?' });
    expect(r.status === 'needs_info' && r.partial.args).toEqual({ cantidad: 40, categoria: 'vaquillonas', lote_destino: 5 });
  });

  it('mismo lote de origen y destino repregunta el destino', () => {
    expect(moverAnimales({ ...full, lote_destino: 3 }, makeCtx())).toMatchObject({ missing: 'lote_destino', question: 'Salen y entran al mismo lote. ¿A qué lote van?' });
  });

  it('rechaza si no alcanzan o si no hay de esa categoría', () => {
    expect(moverAnimales({ ...full, cantidad: 50 }, makeCtx())).toMatchObject({ status: 'rejected', speech: 'En el lote 3 hay 45 vaquillonas, no 50. No registré nada.' });
    expect(moverAnimales({ ...full, categoria: 'toros' }, makeCtx())).toMatchObject({ status: 'rejected', speech: 'En el lote 3 no hay toros. No registré nada.' });
  });

  it('valida contra el stock ya movido', () => {
    const r = moverAnimales({ ...full, cantidad: 10 }, makeCtx([move('m', 40, 'vaquillonas', 3, 5)]));
    expect(r).toMatchObject({ status: 'rejected', speech: 'En el lote 3 hay 5 vaquillonas, no 10. No registré nada.' });
  });
});

describe('consultar_stock', () => {
  const speech = (args: Parameters<typeof consultarStock>[0], events = [] as Parameters<typeof makeCtx>[0]) => {
    const r = consultarStock(args, makeCtx(events));
    return r.status === 'ok' ? r.speech : r.status;
  };

  it('por lote, con desglose', () => {
    expect(speech({ lote: 1 })).toBe('En el lote 1 hay 110 animales: 70 vacas y 40 terneros.');
    const r = consultarStock({ lote: 5 }, makeCtx());
    expect(r.status === 'ok' && r.card).toEqual({ tone: 'consulta', title: 'Lote 5', headline: '40 cabezas', lines: ['40 vaquillonas'] });
  });

  it('lote vacío', () => {
    expect(speech({ lote: 8 })).toBe('El lote 8 está vacío.');
  });

  it('lote y categoría', () => {
    expect(speech({ lote: 3, categoria: 'vaquillonas' })).toBe('En el lote 3 hay 45 vaquillonas.');
  });

  it('categoría en todo el campo', () => {
    expect(speech({ categoria: 'vaquillonas' })).toBe('Hay 85 vaquillonas: 45 en el lote 3 y 40 en el lote 5.');
    expect(speech({ categoria: 'toros' }, [move('m', 10, 'toros', 7, 8)])).toBe('Hay 10 toros: 10 en el lote 8.');
  });

  it('total del campo con detalle por categoría', () => {
    const r = consultarStock({}, makeCtx());
    expect(r.status === 'ok' && r.speech).toBe('En total hay 450 animales en el campo.');
    expect(r.status === 'ok' && r.card.lines).toEqual(['Vacas: 210', 'Vaquillonas: 85', 'Terneros: 120', 'Novillos: 25', 'Toros: 10']);
  });

  it('refleja los movimientos', () => {
    expect(speech({ lote: 5 }, [move('m', 40, 'vaquillonas', 3, 5)])).toBe('En el lote 5 hay 80 animales: 80 vaquillonas.');
  });

  it('rechaza lotes inexistentes', () => {
    expect(consultarStock({ lote: 9 }, makeCtx())).toMatchObject({ status: 'rejected', speech: 'No tengo lote 9, los lotes van del 1 al 8.' });
  });
});
```

`src/tools/__tests__/undo.test.ts`:

```ts
import { move, rain, voidOf } from '@/test-utils/events';
import { makeCtx } from '@/test-utils/toolContext';
import { deshacerUltimo } from '../undo';
import { runTool } from '../index';

describe('deshacer_ultimo', () => {
  it('anula el último registro del productor', () => {
    const r = deshacerUltimo({}, makeCtx([rain('s', '2026-10-11', 6, { source: 'semilla' }), rain('r1', '2026-10-12', 18), move('m1', 40, 'vaquillonas', 3, 5)]));
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.newEvents[0]).toMatchObject({ type: 'anulacion', payload: { targetId: 'm1' } });
    expect(r.speech).toBe('Listo, borré el movimiento de 40 vaquillonas del lote 3 al 5.');
    expect(r.card).toEqual({ tone: 'registro', title: 'Registro anulado', headline: 'Deshecho', lines: ['El movimiento de 40 vaquillonas del lote 3 al 5'] });
  });

  it('deshacer repetido sigue en orden inverso y saltea lo ya anulado', () => {
    const r = deshacerUltimo({}, makeCtx([rain('r1', '2026-10-12', 18), move('m1', 40, 'vaquillonas', 3, 5), voidOf('v1', 'm1')]));
    expect(r.status === 'ok' && r.speech).toBe('Listo, borré la lluvia de 18 milímetros.');
  });

  it('nunca anula la semilla y avisa cuando no queda nada', () => {
    expect(deshacerUltimo({}, makeCtx([rain('s', '2026-10-11', 6, { source: 'semilla' })]))).toMatchObject({ status: 'rejected', speech: 'No hay nada para deshacer.' });
  });

  it('runTool despacha a cada herramienta', () => {
    expect(runTool({ tool: 'consultar_stock', args: { lote: 7 } }, makeCtx()).status).toBe('ok');
    expect(runTool({ tool: 'deshacer_ultimo', args: {} }, makeCtx()).status).toBe('rejected');
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm test -- src/tools`
Expected: FAIL, "Cannot find module '../animals'".

- [ ] **Step 3: Implementar**

`src/tools/animals.ts`:

```ts
import { categoryLabel } from '@/domain/categories';
import { countTotal, farmTotal, projectStock } from '@/domain/stock';
import { CATEGORIES, MoveEvent } from '@/domain/types';
import { Card } from './cards';
import { capitalize, cuantos, eventOrigin, joinEs, lotRangeText, needs, reject } from './format';
import { ToolArgs } from './schemas';
import { Slot, ToolContext, ToolResult } from './types';

type MoveArgs = ToolArgs<'mover_animales'>;

function pendingCard(args: MoveArgs): Card {
  return {
    tone: 'pendiente',
    title: 'Movimiento de animales',
    lines: [],
    fields: [
      { label: 'Categoría', value: args.categoria ?? null },
      { label: 'Cantidad', value: args.cantidad === undefined ? null : String(args.cantidad) },
      { label: 'Lote origen', value: args.lote_origen === undefined ? null : `Lote ${args.lote_origen}` },
      { label: 'Lote destino', value: args.lote_destino === undefined ? null : `Lote ${args.lote_destino}` },
    ],
  };
}

function ask(args: MoveArgs, slot: Slot, question: string): ToolResult {
  return needs({ tool: 'mover_animales', args }, slot, question, pendingCard(args));
}

export function moverAnimales(args: MoveArgs, ctx: ToolContext): ToolResult {
  const lots = ctx.farm.lots;
  if (args.categoria === undefined) return ask(args, 'categoria', '¿Qué animales? Vacas, vaquillonas, terneros, novillos o toros.');
  if (args.cantidad === undefined) return ask(args, 'cantidad', `¿${cuantos(args.categoria)} ${args.categoria}?`);
  if (args.lote_origen === undefined) return ask(args, 'lote_origen', '¿De qué lote salen?');
  if (!lots.includes(args.lote_origen)) {
    return ask({ ...args, lote_origen: undefined }, 'lote_origen', `No tengo lote ${args.lote_origen}, ${lotRangeText(lots)}. ¿De qué lote salen?`);
  }
  if (args.lote_destino === undefined) return ask(args, 'lote_destino', '¿A qué lote van?');
  if (!lots.includes(args.lote_destino)) {
    return ask({ ...args, lote_destino: undefined }, 'lote_destino', `No tengo lote ${args.lote_destino}, ${lotRangeText(lots)}. ¿A qué lote van?`);
  }
  if (args.lote_destino === args.lote_origen) {
    return ask({ ...args, lote_destino: undefined }, 'lote_destino', 'Salen y entran al mismo lote. ¿A qué lote van?');
  }
  const fecha = args.fecha ?? ctx.today;
  if (fecha > ctx.today) return reject('Fecha futura', 'Esa fecha todavía no llegó. No registré nada.');

  const cat = args.categoria;
  const from = args.lote_origen;
  const to = args.lote_destino;
  const before = projectStock(ctx.farm, ctx.events);
  const available = before[from][cat];
  if (available === 0) return reject('No hay animales para mover', `En el lote ${from} no hay ${cat}. No registré nada.`);
  const count = args.cantidad === 'todas' ? available : args.cantidad;
  if (count > available) {
    return reject('No alcanzan los animales', `En el lote ${from} hay ${available} ${categoryLabel(cat, available)}, no ${count}. No registré nada.`);
  }

  const event: MoveEvent = {
    id: ctx.newId(),
    type: 'movimiento',
    occurredOn: fecha,
    ...eventOrigin(ctx),
    payload: { category: cat, count, fromLot: from, toLot: to },
  };
  const after = projectStock(ctx.farm, [...ctx.events, event]);
  const label = categoryLabel(cat, count);
  return {
    status: 'ok',
    newEvents: [event],
    speech: `Listo, pasé ${count} ${label} del lote ${from} al ${to}.`,
    card: {
      tone: 'registro',
      title: 'Movimiento registrado',
      headline: `${count} ${label}`,
      lines: [`Lote ${from} → Lote ${to}`, `Lote ${from}: ${before[from][cat]} → ${after[from][cat]} ${cat}`, `Lote ${to}: ${before[to][cat]} → ${after[to][cat]} ${cat}`],
      undoableEventId: event.id,
      at: ctx.now,
    },
  };
}

function answer(speech: string, card: Card): ToolResult {
  return { status: 'ok', newEvents: [], speech, card };
}

export function consultarStock(args: ToolArgs<'consultar_stock'>, ctx: ToolContext): ToolResult {
  const stock = projectStock(ctx.farm, ctx.events);
  const { lote, categoria } = args;
  if (lote !== undefined && !ctx.farm.lots.includes(lote)) {
    return reject('Lote inexistente', `No tengo lote ${lote}, ${lotRangeText(ctx.farm.lots)}.`);
  }
  if (lote !== undefined && categoria !== undefined) {
    const n = stock[lote][categoria];
    return answer(`En el lote ${lote} hay ${n} ${categoryLabel(categoria, n)}.`, {
      tone: 'consulta',
      title: `Lote ${lote} · ${capitalize(categoria)}`,
      headline: `${n}`,
      lines: [],
    });
  }
  if (lote !== undefined) {
    const counts = stock[lote];
    const total = countTotal(counts);
    const parts = CATEGORIES.filter((c) => counts[c] > 0).map((c) => `${counts[c]} ${categoryLabel(c, counts[c])}`);
    return answer(total === 0 ? `El lote ${lote} está vacío.` : `En el lote ${lote} hay ${total} animales: ${joinEs(parts)}.`, {
      tone: 'consulta',
      title: `Lote ${lote}`,
      headline: `${total} cabezas`,
      lines: parts.length > 0 ? parts : ['Sin animales'],
    });
  }
  if (categoria !== undefined) {
    const perLot = ctx.farm.lots.filter((l) => stock[l][categoria] > 0).map((l) => ({ lot: l, n: stock[l][categoria] }));
    const total = perLot.reduce((sum, p) => sum + p.n, 0);
    return answer(
      total === 0
        ? `No hay ${categoria} en el campo.`
        : `Hay ${total} ${categoryLabel(categoria, total)}: ${joinEs(perLot.map((p) => `${p.n} en el lote ${p.lot}`))}.`,
      { tone: 'consulta', title: capitalize(categoria), headline: `${total}`, lines: perLot.map((p) => `Lote ${p.lot}: ${p.n}`) },
    );
  }
  const total = farmTotal(stock);
  const byCategory = CATEGORIES.map((c) => ({ c, n: ctx.farm.lots.reduce((sum, l) => sum + stock[l][c], 0) })).filter((p) => p.n > 0);
  return answer(`En total hay ${total} animales en el campo.`, {
    tone: 'consulta',
    title: 'Todo el campo',
    headline: `${total} cabezas`,
    lines: byCategory.map((p) => `${capitalize(p.c)}: ${p.n}`),
  });
}
```

`src/tools/undo.ts`:

```ts
import { categoryLabel } from '@/domain/categories';
import { MoveEvent, RainEvent, VoidEvent } from '@/domain/types';
import { capitalize, eventOrigin, fmtMm, reject } from './format';
import { ToolArgs } from './schemas';
import { ToolContext, ToolResult } from './types';

function describeEvent(e: RainEvent | MoveEvent): string {
  if (e.type === 'lluvia') return `la lluvia de ${fmtMm(e.payload.mm)} milímetros`;
  const { count, category, fromLot, toLot } = e.payload;
  return `el movimiento de ${count} ${categoryLabel(category, count)} del lote ${fromLot} al ${toLot}`;
}

export function deshacerUltimo(_args: ToolArgs<'deshacer_ultimo'>, ctx: ToolContext): ToolResult {
  const voided = new Set(ctx.events.flatMap((e) => (e.type === 'anulacion' ? [e.payload.targetId] : [])));
  const target = [...ctx.events]
    .reverse()
    .find((e): e is RainEvent | MoveEvent => e.type !== 'anulacion' && e.source !== 'semilla' && !voided.has(e.id));
  if (!target) return reject('Nada para deshacer', 'No hay nada para deshacer.');

  const event: VoidEvent = { id: ctx.newId(), type: 'anulacion', occurredOn: ctx.today, ...eventOrigin(ctx), payload: { targetId: target.id } };
  const what = describeEvent(target);
  return {
    status: 'ok',
    newEvents: [event],
    speech: `Listo, borré ${what}.`,
    card: { tone: 'registro', title: 'Registro anulado', headline: 'Deshecho', lines: [capitalize(what)] },
  };
}
```

`src/tools/index.ts`:

```ts
import { consultarStock, moverAnimales } from './animals';
import { consultarLluvia, registrarLluvia } from './rain';
import { Intent } from './schemas';
import { ToolContext, ToolResult } from './types';
import { deshacerUltimo } from './undo';

export * from './cards';
export * from './intent';
export * from './schemas';
export * from './types';

export function runTool(intent: Intent, ctx: ToolContext): ToolResult {
  switch (intent.tool) {
    case 'registrar_lluvia':
      return registrarLluvia(intent.args, ctx);
    case 'consultar_lluvia':
      return consultarLluvia(intent.args, ctx);
    case 'mover_animales':
      return moverAnimales(intent.args, ctx);
    case 'consultar_stock':
      return consultarStock(intent.args, ctx);
    case 'deshacer_ultimo':
      return deshacerUltimo(intent.args, ctx);
  }
}
```

Deshacer siempre anula el último registro activo (LIFO), así que el stock nunca puede quedar negativo: el prefijo de eventos ya fue validado al escribirse. No hace falta una validación extra.

- [ ] **Step 4: Correr tests y typecheck**

Run: `npm test -- src/tools && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools
git commit -m "feat(herramientas): movimientos con validación de stock, consultas y deshacer"
```

---

### Task 8: Parser local: normalización y números

**Files:**
- Create: `src/interpreter/local/normalize.ts`, `src/interpreter/local/numbers.ts`
- Test: `src/interpreter/local/__tests__/normalize.test.ts`, `src/interpreter/local/__tests__/numbers.test.ts`

**Interfaces:**
- Produces:
  - `normalize(text: string): string`, `tokenize(text: string): string[]`
  - `NumberMatch { value; start; end }` (end exclusivo), `NumberOptions { allowArticles?: boolean }`
  - `readNumberAt(tokens, i, opts?): NumberMatch | null`, `findNumbers(tokens, opts?): NumberMatch[]`

- [ ] **Step 1: Escribir los tests**

`src/interpreter/local/__tests__/normalize.test.ts`:

```ts
import { normalize, tokenize } from '../normalize';

describe('normalize', () => {
  it.each([
    ['¿Cuánto llovió este mes?', 'cuanto llovio este mes'],
    ['Llovieron 18mm anoche.', 'llovieron 18 mm anoche'],
    ['Cayeron 12,5 milímetros', 'cayeron 12.5 milimetros'],
    ['¡Pasé 40 Vaquillonas del Lote 3 al 5!', 'pase 40 vaquillonas del lote 3 al 5'],
    ['  Borrá   eso  ', 'borra eso'],
    ['Año, ñandú', 'ano nandu'],
  ])('"%s" → "%s"', (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });

  it('tokeniza sin vacíos', () => {
    expect(tokenize('  ¿Qué hay?  ')).toEqual(['que', 'hay']);
    expect(tokenize('')).toEqual([]);
  });
});
```

`src/interpreter/local/__tests__/numbers.test.ts`:

```ts
import { tokenize } from '../normalize';
import { findNumbers, readNumberAt } from '../numbers';

const read = (text: string, allowArticles = false) => readNumberAt(tokenize(text), 0, { allowArticles })?.value ?? null;

describe('números', () => {
  it.each([
    ['18', 18],
    ['12.5', 12.5],
    ['cero', 0],
    ['dieciocho', 18],
    ['veintidos', 22],
    ['treinta', 30],
    ['cuarenta y cinco', 45],
    ['cien', 100],
    ['ciento veinte', 120],
    ['ciento cinco', 105],
    ['doscientos cincuenta', 250],
  ])('"%s" = %d', (text, value) => {
    expect(read(text)).toBe(value);
  });

  it('no toma artículos como números salvo que se pida', () => {
    expect(read('una')).toBeNull();
    expect(read('una', true)).toBe(1);
    expect(read('uno', true)).toBe(1);
  });

  it('encuentra todos los números con sus posiciones', () => {
    expect(findNumbers(tokenize('pase cuarenta vaquillas del tres al cinco')).map((n) => n.value)).toEqual([40, 3, 5]);
    expect(findNumbers(tokenize('una lluvia de 18')).map((n) => n.value)).toEqual([18]);
    expect(findNumbers(tokenize('cuarenta y cinco vacas'))).toEqual([{ value: 45, start: 0, end: 3 }]);
  });

  it('"y" sin unidad no se consume', () => {
    expect(findNumbers(tokenize('treinta y vacas'))).toEqual([{ value: 30, start: 0, end: 1 }]);
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm test -- src/interpreter`
Expected: FAIL, módulos inexistentes.

- [ ] **Step 3: Implementar**

`src/interpreter/local/normalize.ts`:

```ts
const ACCENTS: Record<string, string> = {
  á: 'a', à: 'a', ä: 'a', é: 'e', è: 'e', ë: 'e', í: 'i', ì: 'i', ï: 'i',
  ó: 'o', ò: 'o', ö: 'o', ú: 'u', ù: 'u', ü: 'u', ñ: 'n',
};

// Mapa explícito en vez de String.normalize('NFD') para no depender del soporte de Intl en Hermes.
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[áàäéèëíìïóòöúùüñ]/g, (c) => ACCENTS[c])
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9.\s]/g, ' ')
    .replace(/\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text: string): string[] {
  const normalized = normalize(text);
  return normalized === '' ? [] : normalized.split(' ');
}
```

`src/interpreter/local/numbers.ts`:

```ts
const UNITS: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22,
  veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28,
  veintinueve: 29,
};
const TENS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};
const HUNDREDS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
  cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500,
};
const ARTICLES = new Set(['un', 'una', 'uno']);

export interface NumberMatch {
  value: number;
  start: number;
  end: number;
}

export interface NumberOptions {
  allowArticles?: boolean;
}

export function readNumberAt(tokens: string[], i: number, opts: NumberOptions = {}): NumberMatch | null {
  const first = tokens[i];
  if (first === undefined) return null;
  if (/^\d+(\.\d+)?$/.test(first)) return { value: Number(first), start: i, end: i + 1 };
  if (ARTICLES.has(first) && !opts.allowArticles) return null;

  let j = i;
  let value = 0;
  if (HUNDREDS[tokens[j]] !== undefined) {
    value += HUNDREDS[tokens[j]];
    j++;
  }
  if (TENS[tokens[j]] !== undefined) {
    value += TENS[tokens[j]];
    j++;
    const unit = UNITS[tokens[j + 1]];
    if (tokens[j] === 'y' && unit !== undefined && unit >= 1 && unit <= 9) {
      value += unit;
      j += 2;
    }
  } else if (UNITS[tokens[j]] !== undefined) {
    value += UNITS[tokens[j]];
    j++;
  }
  return j > i ? { value, start: i, end: j } : null;
}

export function findNumbers(tokens: string[], opts: NumberOptions = {}): NumberMatch[] {
  const found: NumberMatch[] = [];
  let i = 0;
  while (i < tokens.length) {
    const match = readNumberAt(tokens, i, opts);
    if (match) {
      found.push(match);
      i = match.end;
    } else {
      i++;
    }
  }
  return found;
}
```

- [ ] **Step 4: Correr tests y typecheck**

Run: `npm test -- src/interpreter && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/interpreter
git commit -m "feat(parser): normalización de texto de voz y números en palabras"
```

---

### Task 9: Parser local: intenciones y repreguntas

**Files:**
- Create: `src/interpreter/local/parser.ts`, `src/interpreter/local/phrases.fixture.ts`
- Test: `src/interpreter/local/__tests__/parser.test.ts`

**Interfaces:**
- Consumes: `tokenize`, `findNumbers`, `readNumberAt`, `categoryFromWord`, `resolveRelativeDay`, `Intent`, `ToolArgs`, `PendingInfo`, `cleanArgs`, `withArgs`, `mergeIntent`.
- Produces:
  - `LocalParse = { kind: 'intent'; intent: Intent } | { kind: 'cancel' } | { kind: 'unknown' }`
  - `parseLocal(text: string, pending: PendingInfo | null, today: string): LocalParse`
  - `PHRASES: { text: string; expected: Intent | null }[]` y `FIXTURE_TODAY` (los reutiliza el script de evaluación de la Task 18)

- [ ] **Step 1: Tabla de frases**

`src/interpreter/local/phrases.fixture.ts`:

```ts
import { Intent } from '@/tools/schemas';

export const FIXTURE_TODAY = '2026-10-13';

const mover = (args: Extract<Intent, { tool: 'mover_animales' }>['args']): Intent => ({ tool: 'mover_animales', args });
const lluvia = (args: Extract<Intent, { tool: 'registrar_lluvia' }>['args']): Intent => ({ tool: 'registrar_lluvia', args });
const consultaLluvia = (args: Extract<Intent, { tool: 'consultar_lluvia' }>['args']): Intent => ({ tool: 'consultar_lluvia', args });
const stock = (args: Extract<Intent, { tool: 'consultar_stock' }>['args']): Intent => ({ tool: 'consultar_stock', args });
const deshacer: Intent = { tool: 'deshacer_ultimo', args: {} };

export const PHRASES: { text: string; expected: Intent | null }[] = [
  { text: 'Llovieron 18 mm anoche', expected: lluvia({ mm: 18, fecha: '2026-10-12' }) },
  { text: 'llovieron dieciocho milímetros anoche', expected: lluvia({ mm: 18, fecha: '2026-10-12' }) },
  { text: 'Cayeron 25 milímetros', expected: lluvia({ mm: 25 }) },
  { text: 'Cayó agua, 12,5 mm hoy', expected: lluvia({ mm: 12.5, fecha: '2026-10-13' }) },
  { text: 'Anotá una lluvia de treinta milímetros ayer', expected: lluvia({ mm: 30, fecha: '2026-10-12' }) },
  { text: 'Llovieron 40 anteayer', expected: lluvia({ mm: 40, fecha: '2026-10-11' }) },
  { text: 'Registrá 8 milímetros', expected: lluvia({ mm: 8 }) },
  { text: 'Llovieron anoche', expected: lluvia({ fecha: '2026-10-12' }) },
  { text: 'Pasé 40 vaquillonas del lote 3 al 5', expected: mover({ cantidad: 40, categoria: 'vaquillonas', lote_origen: 3, lote_destino: 5 }) },
  { text: 'pasamos cuarenta vaquillas del tres al cinco', expected: mover({ cantidad: 40, categoria: 'vaquillonas', lote_origen: 3, lote_destino: 5 }) },
  { text: 'Moví 20 vacas del lote 1 al lote 8', expected: mover({ cantidad: 20, categoria: 'vacas', lote_origen: 1, lote_destino: 8 }) },
  { text: 'Llevé los toros del 7 al 6', expected: mover({ cantidad: 'todas', categoria: 'toros', lote_origen: 7, lote_destino: 6 }) },
  { text: 'Pasé todas las vaquillonas del 5 al 3', expected: mover({ cantidad: 'todas', categoria: 'vaquillonas', lote_origen: 5, lote_destino: 3 }) },
  { text: 'Mandamos 15 novillos al lote 4 desde el 6', expected: mover({ cantidad: 15, categoria: 'novillos', lote_origen: 6, lote_destino: 4 }) },
  { text: 'Pasé 10 terneras del uno al dos', expected: mover({ cantidad: 10, categoria: 'terneros', lote_origen: 1, lote_destino: 2 }) },
  { text: 'Cambiamos 5 toros al lote 6 del lote 7', expected: mover({ cantidad: 5, categoria: 'toros', lote_origen: 7, lote_destino: 6 }) },
  { text: 'Ayer pasamos 12 vacas del 2 al 4', expected: mover({ cantidad: 12, categoria: 'vacas', lote_origen: 2, lote_destino: 4, fecha: '2026-10-12' }) },
  { text: 'Pasé 40 vaquillonas al 5', expected: mover({ cantidad: 40, categoria: 'vaquillonas', lote_destino: 5 }) },
  { text: '¿Cuánto llovió este mes?', expected: consultaLluvia({ periodo: 'mes' }) },
  { text: 'cuánta agua cayó en el mes', expected: consultaLluvia({ periodo: 'mes' }) },
  { text: '¿Cuánto llovió el mes pasado?', expected: consultaLluvia({ periodo: 'mes_anterior' }) },
  { text: '¿Cuánto llovió en los últimos 10 días?', expected: consultaLluvia({ periodo: 'ultimos_dias', dias: 10 }) },
  { text: '¿Cuánto llovió esta semana?', expected: consultaLluvia({ periodo: 'semana' }) },
  { text: '¿Llovió ayer?', expected: consultaLluvia({ periodo: 'ayer' }) },
  { text: '¿Cuánto llovió hoy?', expected: consultaLluvia({ periodo: 'hoy' }) },
  { text: '¿Llovió más de 20 mm esta semana?', expected: consultaLluvia({ periodo: 'semana' }) },
  { text: '¿Cuántos animales hay en el lote 5?', expected: stock({ lote: 5 }) },
  { text: 'cuántas cabezas hay en el lote tres', expected: stock({ lote: 3 }) },
  { text: '¿Qué hay en el 7?', expected: stock({ lote: 7 }) },
  { text: '¿Cuántas vaquillonas hay?', expected: stock({ categoria: 'vaquillonas' }) },
  { text: '¿Cuántos terneros hay en el lote 1?', expected: stock({ lote: 1, categoria: 'terneros' }) },
  { text: '¿Cuántos animales tengo?', expected: stock({}) },
  { text: 'Borrá eso', expected: deshacer },
  { text: 'me equivoqué, deshacé lo último', expected: deshacer },
  { text: 'hola, ¿cómo andás?', expected: null },
  { text: 'mañana va a llover', expected: null },
  { text: 'el tractor está roto', expected: null },
];
```

- [ ] **Step 2: Escribir los tests**

`src/interpreter/local/__tests__/parser.test.ts`:

```ts
import { PendingInfo } from '@/tools/types';
import { parseLocal } from '../parser';
import { FIXTURE_TODAY, PHRASES } from '../phrases.fixture';

describe('parseLocal: frases sueltas', () => {
  it.each(PHRASES)('"$text"', ({ text, expected }) => {
    const result = parseLocal(text, null, FIXTURE_TODAY);
    expect(result).toEqual(expected ? { kind: 'intent', intent: expected } : { kind: 'unknown' });
  });
});

describe('parseLocal: respuestas a repreguntas', () => {
  const movePending: PendingInfo = {
    intent: { tool: 'mover_animales', args: { cantidad: 40, categoria: 'vaquillonas', lote_destino: 5 } },
    missing: 'lote_origen',
  };
  const completedMove = { kind: 'intent', intent: { tool: 'mover_animales', args: { cantidad: 40, categoria: 'vaquillonas', lote_destino: 5, lote_origen: 3 } } };

  it.each(['del 3', '3', 'del lote tres', 'el tres'])('"%s" completa el lote de origen', (text) => {
    expect(parseLocal(text, movePending, FIXTURE_TODAY)).toEqual(completedMove);
  });

  it('completa milímetros con un número o con la frase completa', () => {
    const pending: PendingInfo = { intent: { tool: 'registrar_lluvia', args: { fecha: '2026-10-12' } }, missing: 'mm' };
    const expected = { kind: 'intent', intent: { tool: 'registrar_lluvia', args: { fecha: '2026-10-12', mm: 18 } } };
    expect(parseLocal('18', pending, FIXTURE_TODAY)).toEqual(expected);
    expect(parseLocal('dieciocho milímetros', pending, FIXTURE_TODAY)).toEqual(expected);
  });

  it('completa la categoría', () => {
    const pending: PendingInfo = { intent: { tool: 'mover_animales', args: { cantidad: 40, lote_origen: 3, lote_destino: 5 } }, missing: 'categoria' };
    expect(parseLocal('vaquillonas', pending, FIXTURE_TODAY)).toEqual({
      kind: 'intent',
      intent: { tool: 'mover_animales', args: { cantidad: 40, lote_origen: 3, lote_destino: 5, categoria: 'vaquillonas' } },
    });
  });

  it('completa la cantidad con número, "uno" o "todos"', () => {
    const pending: PendingInfo = { intent: { tool: 'mover_animales', args: { categoria: 'toros', lote_origen: 7, lote_destino: 6 } }, missing: 'cantidad' };
    const cantidad = (text: string) => {
      const r = parseLocal(text, pending, FIXTURE_TODAY);
      return r.kind === 'intent' && r.intent.tool === 'mover_animales' ? r.intent.args.cantidad : r.kind;
    };
    expect(cantidad('cinco')).toBe(5);
    expect(cantidad('uno')).toBe(1);
    expect(cantidad('todos')).toBe('todas');
  });

  it('confirma o cancela una lluvia grande', () => {
    const pending: PendingInfo = { intent: { tool: 'registrar_lluvia', args: { mm: 200 } }, missing: 'confirmacion' };
    expect(parseLocal('sí', pending, FIXTURE_TODAY)).toEqual({ kind: 'intent', intent: { tool: 'registrar_lluvia', args: { mm: 200, confirmado: true } } });
    expect(parseLocal('dale', pending, FIXTURE_TODAY)).toEqual({ kind: 'intent', intent: { tool: 'registrar_lluvia', args: { mm: 200, confirmado: true } } });
    expect(parseLocal('no', pending, FIXTURE_TODAY)).toEqual({ kind: 'cancel' });
  });

  it.each(['cancelá', 'olvidate', 'no'])('"%s" cancela el pendiente', (text) => {
    expect(parseLocal(text, movePending, FIXTURE_TODAY)).toEqual({ kind: 'cancel' });
  });

  it('un pedido nuevo de otra herramienta reemplaza al pendiente', () => {
    expect(parseLocal('¿Cuánto llovió este mes?', movePending, FIXTURE_TODAY)).toEqual({ kind: 'intent', intent: { tool: 'consultar_lluvia', args: { periodo: 'mes' } } });
  });

  it('algo incomprensible no rompe el pendiente', () => {
    expect(parseLocal('banana', movePending, FIXTURE_TODAY)).toEqual({ kind: 'unknown' });
  });

  it('sin pendiente, "del 3" no significa nada', () => {
    expect(parseLocal('del 3', null, FIXTURE_TODAY)).toEqual({ kind: 'unknown' });
  });
});
```

- [ ] **Step 3: Correr y verificar que fallan**

Run: `npm test -- src/interpreter/local/__tests__/parser.test.ts`
Expected: FAIL, "Cannot find module '../parser'".

- [ ] **Step 4: Implementar**

`src/interpreter/local/parser.ts`:

```ts
import { categoryFromWord } from '@/domain/categories';
import { RelativeDayWord, resolveRelativeDay } from '@/domain/dates';
import { Category } from '@/domain/types';
import { cleanArgs, mergeIntent, withArgs } from '@/tools/intent';
import { Intent, ToolArgs } from '@/tools/schemas';
import { PendingInfo } from '@/tools/types';
import { tokenize } from './normalize';
import { findNumbers, readNumberAt } from './numbers';

export type LocalParse = { kind: 'intent'; intent: Intent } | { kind: 'cancel' } | { kind: 'unknown' };

const RAIN_WORDS = new Set(['llovio', 'llovieron', 'llueve', 'lluvia', 'lluvias', 'cayo', 'cayeron', 'agua', 'milimetro', 'milimetros', 'mm']);
const RAIN_WRITE_VERBS = new Set(['llovieron', 'cayeron', 'cayo', 'anota', 'anotame', 'registra', 'registrame', 'carga', 'cargame']);
const RAIN_COMPARISON = new Set(['mas', 'menos']);
const QUANTITY_QUESTION = new Set(['cuanto', 'cuanta', 'cuantos', 'cuantas']);
const STOCK_QUESTION = new Set(['hay', 'tengo', 'quedan', 'quedaron']);
const STOCK_WORDS = new Set(['animales', 'cabezas', 'hacienda']);
const MOVE_VERBS = new Set([
  'pase', 'pasamos', 'pasaron', 'paso', 'movi', 'movimos', 'movieron', 'lleve', 'llevamos', 'llevaron',
  'cambie', 'cambiamos', 'traslade', 'trasladamos', 'mande', 'mandamos', 'meti', 'metimos', 'saque', 'sacamos',
]);
const FROM_WORDS = new Set(['del', 'de', 'desde']);
const TO_WORDS = new Set(['al', 'a', 'hacia', 'para']);
const LOT_WORDS = new Set(['lote', 'potrero']);
const ALL_WORDS = new Set(['todas', 'todos']);
const UNDO = /\b(borra|borrar|borralo|deshace|deshacer|deshacelo|anula|anular|anulalo|me equivoque)\b/;
const CANCEL = /\b(cancela|cancelar|cancelalo|olvidate|dejalo|no importa)\b/;
const AFFIRM = /^(si|dale|correcto|confirmo|exacto|asi es)\b/;

export function parseLocal(text: string, pending: PendingInfo | null, today: string): LocalParse {
  const tokens = tokenize(text);
  if (tokens.length === 0) return { kind: 'unknown' };
  const sentence = tokens.join(' ');

  if (pending?.missing === 'confirmacion' && AFFIRM.test(sentence)) {
    return { kind: 'intent', intent: withArgs(pending.intent, { confirmado: true }) };
  }
  if (pending && (sentence === 'no' || CANCEL.test(sentence))) return { kind: 'cancel' };
  if (UNDO.test(sentence)) return { kind: 'intent', intent: { tool: 'deshacer_ultimo', args: {} } };

  const fresh = parseFresh(tokens, today);
  if (fresh) return { kind: 'intent', intent: pending ? mergeIntent(pending.intent, fresh) : fresh };
  if (pending) {
    const filled = fillSlot(tokens, pending);
    if (filled) return { kind: 'intent', intent: filled };
  }
  return { kind: 'unknown' };
}

function parseFresh(tokens: string[], today: string): Intent | null {
  const has = (set: Set<string>) => tokens.some((t) => set.has(t));
  if (has(MOVE_VERBS)) return { tool: 'mover_animales', args: parseMove(tokens, today) };
  if (has(RAIN_WORDS)) {
    const noNumbers = findNumbers(tokens).length === 0;
    const isQuery = has(QUANTITY_QUESTION) || has(RAIN_COMPARISON) || (noNumbers && !has(RAIN_WRITE_VERBS));
    return isQuery
      ? { tool: 'consultar_lluvia', args: parseRainPeriod(tokens) }
      : { tool: 'registrar_lluvia', args: parseRainWrite(tokens, today) };
  }
  const category = findCategory(tokens);
  const lot = findLotRef(tokens);
  const asks = has(QUANTITY_QUESTION) || has(STOCK_QUESTION);
  if (asks && (category || has(STOCK_WORDS) || lot !== undefined)) {
    return { tool: 'consultar_stock', args: cleanArgs({ lote: lot, categoria: category?.category }) };
  }
  return null;
}

function findCategory(tokens: string[]): { category: Category; index: number } | null {
  for (let i = 0; i < tokens.length; i++) {
    const category = categoryFromWord(tokens[i]);
    if (category) return { category, index: i };
  }
  return null;
}

function findRelativeDay(tokens: string[], today: string): string | undefined {
  const sentence = tokens.join(' ');
  let word: RelativeDayWord | undefined;
  if (/\b(anteayer|antes de ayer)\b/.test(sentence)) word = 'anteayer';
  else if (tokens.includes('anoche')) word = 'anoche';
  else if (tokens.includes('ayer')) word = 'ayer';
  else if (tokens.includes('hoy')) word = 'hoy';
  return word ? resolveRelativeDay(word, today) : undefined;
}

// Lee "[el|la] [lote] N" después de la preposición en la posición i.
function lotAfter(tokens: string[], i: number): { value: number; end: number } | null {
  let j = i + 1;
  if (tokens[j] === 'el' || tokens[j] === 'la') j++;
  if (LOT_WORDS.has(tokens[j])) j++;
  const n = readNumberAt(tokens, j, { allowArticles: true });
  return n ? { value: n.value, end: n.end } : null;
}

function findLotRef(tokens: string[]): number | undefined {
  for (let i = 0; i < tokens.length; i++) {
    if (LOT_WORDS.has(tokens[i])) {
      const n = readNumberAt(tokens, i + 1, { allowArticles: true });
      if (n) return n.value;
    }
    if (tokens[i] === 'en' || tokens[i] === 'del') {
      const lot = lotAfter(tokens, i);
      if (lot) return lot.value;
    }
  }
  return undefined;
}

function parseLots(tokens: string[]): { origin?: number; dest?: number; lotTokens: Set<number> } {
  let origin: number | undefined;
  let dest: number | undefined;
  const lotTokens = new Set<number>();
  const mark = (from: number, to: number) => {
    for (let k = from; k < to; k++) lotTokens.add(k);
  };
  for (let i = 0; i < tokens.length; i++) {
    const isFrom = FROM_WORDS.has(tokens[i]);
    const isTo = TO_WORDS.has(tokens[i]);
    if (!isFrom && !isTo) continue;
    const lot = lotAfter(tokens, i);
    if (!lot) continue;
    if (isFrom && origin === undefined) {
      origin = lot.value;
      mark(i, lot.end);
    } else if (isTo && dest === undefined) {
      dest = lot.value;
      mark(i, lot.end);
    }
  }
  tokens.forEach((t, i) => {
    if (!LOT_WORDS.has(t) || lotTokens.has(i)) return;
    const n = readNumberAt(tokens, i + 1, { allowArticles: true });
    if (!n) return;
    if (origin === undefined) origin = n.value;
    else if (dest === undefined && n.value !== origin) dest = n.value;
    mark(i, n.end);
  });
  return { origin, dest, lotTokens };
}

function parseMove(tokens: string[], today: string): ToolArgs<'mover_animales'> {
  const { origin, dest, lotTokens } = parseLots(tokens);
  const category = findCategory(tokens);
  const numbers = findNumbers(tokens).filter((n) => !lotTokens.has(n.start) && Number.isInteger(n.value));
  const beforeCategory = category ? numbers.find((n) => n.end === category.index) : undefined;
  let cantidad: number | 'todas' | undefined = (beforeCategory ?? numbers[0])?.value;
  const articleBeforeCategory = category !== null && ['los', 'las'].includes(tokens[category.index - 1]);
  if (cantidad === undefined && (tokens.some((t) => ALL_WORDS.has(t)) || articleBeforeCategory)) cantidad = 'todas';
  return cleanArgs({
    cantidad,
    categoria: category?.category,
    lote_origen: origin,
    lote_destino: dest,
    fecha: findRelativeDay(tokens, today),
  });
}

function parseRainWrite(tokens: string[], today: string): ToolArgs<'registrar_lluvia'> {
  const numbers = findNumbers(tokens);
  const unitIndex = tokens.findIndex((t) => t === 'mm' || t.startsWith('milimetro'));
  const mm = (numbers.find((n) => n.end === unitIndex) ?? numbers[0])?.value;
  return cleanArgs({ mm, fecha: findRelativeDay(tokens, today) });
}

function parseRainPeriod(tokens: string[]): ToolArgs<'consultar_lluvia'> {
  const sentence = tokens.join(' ');
  if (/\bmes (pasado|anterior)\b/.test(sentence)) return { periodo: 'mes_anterior' };
  const last = tokens.indexOf('ultimos');
  if (last >= 0) {
    const n = readNumberAt(tokens, last + 1);
    if (n && tokens[n.end] === 'dias') return { periodo: 'ultimos_dias', dias: n.value };
  }
  if (tokens.includes('semana')) return { periodo: 'semana' };
  if (tokens.includes('hoy')) return { periodo: 'hoy' };
  if (tokens.includes('ayer') || tokens.includes('anoche')) return { periodo: 'ayer' };
  return { periodo: 'mes' };
}

function fillSlot(tokens: string[], pending: PendingInfo): Intent | null {
  const first = findNumbers(tokens, { allowArticles: tokens.length <= 2 })[0]?.value;
  switch (pending.missing) {
    case 'mm':
      return first !== undefined ? withArgs(pending.intent, { mm: first }) : null;
    case 'cantidad':
      if (tokens.some((t) => ALL_WORDS.has(t))) return withArgs(pending.intent, { cantidad: 'todas' });
      return first !== undefined && Number.isInteger(first) ? withArgs(pending.intent, { cantidad: first }) : null;
    case 'categoria': {
      const category = findCategory(tokens);
      return category ? withArgs(pending.intent, { categoria: category.category }) : null;
    }
    case 'lote_origen':
    case 'lote_destino': {
      const { origin, dest } = parseLots(tokens);
      const extra: Record<string, number> = {};
      if (origin !== undefined) extra.lote_origen = origin;
      if (dest !== undefined) extra.lote_destino = dest;
      if (Object.keys(extra).length === 0 && first !== undefined) extra[pending.missing] = first;
      return Object.keys(extra).length > 0 ? withArgs(pending.intent, extra) : null;
    }
    case 'confirmacion':
      return null;
  }
}
```

- [ ] **Step 5: Correr tests y typecheck**

Run: `npm test -- src/interpreter && npm run typecheck`
Expected: PASS (las 37 frases y las repreguntas). Si alguna frase falla, corregir el parser, no la tabla: la tabla es el contrato de comportamiento.

- [ ] **Step 6: Commit**

```bash
git add src/interpreter
git commit -m "feat(parser): intenciones rioplatenses offline y completado de repreguntas"
```

---

### Task 10: Motor de conversación

**Files:**
- Create: `src/conversation/engine.ts`
- Test: `src/conversation/__tests__/engine.test.ts`

**Interfaces:**
- Consumes: `runTool`, `mergeIntent`, `Intent`, `PendingInfo`, `ToolResult`, `Card`, `EventStore`, `toISODate`, `parseLocal` (solo en tests).
- Produces:
  - `Turn { role: 'user' | 'assistant'; text }`, `Pending extends PendingInfo { createdAt: number }`, `ConversationState { pending; history }`, `initialConversation`, `PENDING_TTL_MS = 60_000`, `HELP_LINES: string[]`
  - `Interpretation = { kind: 'intent'; intent } | { kind: 'cancel' } | { kind: 'unknown' } | { kind: 'reply'; text }`
  - `InterpretRequest { text; pending: PendingInfo | null; history: Turn[]; today; events: FarmEvent[] }`, `InterpretOutcome { interpretation; via: Interpreter; degraded: boolean }`
  - `TurnDeps { farm; store; interpret(req): Promise<InterpretOutcome>; phrase?(userText, result): Promise<string | null>; now(): Date; newId(): string }`
  - `TurnOutcome { card; speech; via; degraded; expectsReply; state }`
  - `runTurn(text, source, state, deps): Promise<TurnOutcome>`
  - `runIntentTurn(intent, rawText, state, deps): Promise<TurnOutcome>` (para el botón Deshacer; no pasa por el intérprete)

- [ ] **Step 1: Escribir los tests**

`src/conversation/__tests__/engine.test.ts`:

```ts
import { FARM } from '@/data/seed';
import { MemoryEventStore } from '@/data/eventStore';
import { parseLocal } from '@/interpreter/local/parser';
import { initialConversation, runIntentTurn, runTurn, TurnDeps } from '../engine';

const localInterpret: TurnDeps['interpret'] = async (req) => ({
  interpretation: parseLocal(req.text, req.pending, req.today),
  via: 'local',
  degraded: false,
});

function setup(interpret: TurnDeps['interpret'] = localInterpret) {
  const store = new MemoryEventStore();
  let n = 0;
  let now = new Date(2026, 9, 13, 10, 0, 0);
  const deps: TurnDeps = { farm: FARM, store, interpret, now: () => now, newId: () => `e-${++n}` };
  return { store, deps, advance: (ms: number) => { now = new Date(now.getTime() + ms); } };
}

describe('runTurn', () => {
  it('registra una lluvia dicha por voz y la persiste con su origen', async () => {
    const { store, deps } = setup();
    const out = await runTurn('Llovieron 18 mm anoche', 'voz', initialConversation, deps);
    expect(out.card.title).toBe('Lluvia registrada');
    expect(out.speech).toBe('Anotado: 18 milímetros ayer. En octubre van 18.');
    expect(out.expectsReply).toBe(false);
    expect(await store.list()).toEqual([
      expect.objectContaining({ type: 'lluvia', occurredOn: '2026-10-12', source: 'voz', interpreter: 'local', rawText: 'Llovieron 18 mm anoche' }),
    ]);
  });

  it('repregunta el lote y completa con la respuesta', async () => {
    const { store, deps } = setup();
    const first = await runTurn('Pasé 40 vaquillonas al 5', 'voz', initialConversation, deps);
    expect(first).toMatchObject({ speech: '¿De qué lote salen?', expectsReply: true });
    expect(first.state.pending?.missing).toBe('lote_origen');
    expect(await store.list()).toEqual([]);

    const second = await runTurn('del 3', 'voz', first.state, deps);
    expect(second.card.lines).toContain('Lote 3: 45 → 5 vaquillonas');
    expect(second.state.pending).toBeNull();
    expect(await store.list()).toHaveLength(1);
  });

  it('el pendiente vence al minuto', async () => {
    const { deps, advance } = setup();
    const first = await runTurn('Pasé 40 vaquillonas al 5', 'voz', initialConversation, deps);
    advance(61_000);
    const second = await runTurn('del 3', 'voz', first.state, deps);
    expect(second.card.title).toBe('No te entendí');
  });

  it('cancelar descarta el pendiente sin escribir', async () => {
    const { store, deps } = setup();
    const first = await runTurn('Pasé 40 vaquillonas al 5', 'voz', initialConversation, deps);
    const second = await runTurn('olvidate', 'voz', first.state, deps);
    expect(second.card.title).toBe('Cancelado');
    expect(second.state.pending).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  it('un pedido distinto descarta el pendiente', async () => {
    const { deps } = setup();
    const first = await runTurn('Pasé 40 vaquillonas al 5', 'voz', initialConversation, deps);
    const second = await runTurn('¿Cuánto llovió este mes?', 'voz', first.state, deps);
    expect(second.card.tone).toBe('consulta');
    expect(second.state.pending).toBeNull();
  });

  it('si no entiende, mantiene el pendiente para reintentar', async () => {
    const { store, deps } = setup();
    const first = await runTurn('Pasé 40 vaquillonas al 5', 'voz', initialConversation, deps);
    const confused = await runTurn('banana', 'voz', first.state, deps);
    expect(confused.card.title).toBe('No te entendí');
    expect(confused.expectsReply).toBe(false);
    expect(confused.state.pending?.missing).toBe('lote_origen');
    await runTurn('del 3', 'voz', confused.state, deps);
    expect(await store.list()).toHaveLength(1);
  });

  it('un rechazo no escribe nada', async () => {
    const { store, deps } = setup();
    const out = await runTurn('Pasé 50 vaquillonas del 3 al 5', 'voz', initialConversation, deps);
    expect(out.speech).toBe('En el lote 3 hay 45 vaquillonas, no 50. No registré nada.');
    expect(await store.list()).toEqual([]);
  });

  it('"borrá eso" anula el último registro', async () => {
    const { store, deps } = setup();
    const first = await runTurn('Llovieron 18 mm anoche', 'voz', initialConversation, deps);
    const undo = await runTurn('borrá eso', 'voz', first.state, deps);
    expect(undo.speech).toBe('Listo, borré la lluvia de 18 milímetros.');
    expect((await store.list()).map((e) => e.type)).toEqual(['lluvia', 'anulacion']);
  });

  it('el botón Deshacer ejecuta la herramienta sin pasar por el intérprete', async () => {
    const interpret = jest.fn(localInterpret);
    const { deps } = setup(interpret);
    const first = await runTurn('Llovieron 18 mm anoche', 'voz', initialConversation, deps);
    interpret.mockClear();
    const undo = await runIntentTurn({ tool: 'deshacer_ultimo', args: {} }, 'Deshacer (botón)', first.state, deps);
    expect(undo.card.title).toBe('Registro anulado');
    expect(interpret).not.toHaveBeenCalled();
  });

  it('con IA usa la redacción del LLM y cae a la plantilla si no llega', async () => {
    const ia: TurnDeps['interpret'] = async () => ({
      interpretation: { kind: 'intent', intent: { tool: 'registrar_lluvia', args: { mm: 5 } } },
      via: 'ia',
      degraded: false,
    });
    const { deps } = setup(ia);
    const phrased = await runTurn('cayeron cinco', 'voz', initialConversation, { ...deps, phrase: async () => 'Cinco milímetros, anotado.' });
    expect(phrased.speech).toBe('Cinco milímetros, anotado.');
    const fallback = await runTurn('cayeron cinco', 'voz', initialConversation, { ...deps, phrase: async () => null });
    expect(fallback.speech).toBe('Anotado: 5 milímetros hoy. En octubre van 10.');
  });

  it('en modo local no llama a la redacción del LLM', async () => {
    const phrase = jest.fn(async () => 'no debería usarse');
    const { deps } = setup();
    await runTurn('Llovieron 18 mm anoche', 'voz', initialConversation, { ...deps, phrase });
    expect(phrase).not.toHaveBeenCalled();
  });

  it('una respuesta libre del LLM se muestra como ayuda', async () => {
    const { deps } = setup(async () => ({ interpretation: { kind: 'reply', text: 'Puedo anotar lluvias y movimientos.' }, via: 'ia', degraded: false }));
    const out = await runTurn('¿qué podés hacer?', 'voz', initialConversation, deps);
    expect(out.card).toEqual({ tone: 'ayuda', title: 'La Tranquera', lines: ['Puedo anotar lluvias y movimientos.'] });
    expect(out.speech).toBe('Puedo anotar lluvias y movimientos.');
  });

  it('informa si el intérprete cayó a modo degradado', async () => {
    const { deps } = setup(async (req) => ({ interpretation: parseLocal(req.text, req.pending, req.today), via: 'local', degraded: true }));
    const out = await runTurn('¿Cuánto llovió hoy?', 'voz', initialConversation, deps);
    expect(out).toMatchObject({ via: 'local', degraded: true });
  });

  it('limita el historial a los últimos 6 mensajes', async () => {
    const { deps } = setup();
    let state = initialConversation;
    for (const text of ['¿Cuánto llovió hoy?', '¿Cuánto llovió ayer?', '¿Cuántos animales tengo?', '¿Qué hay en el 7?']) {
      state = (await runTurn(text, 'texto', state, deps)).state;
    }
    expect(state.history).toHaveLength(6);
    expect(state.history[0]).toEqual({ role: 'user', text: '¿Cuánto llovió ayer?' });
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm test -- src/conversation`
Expected: FAIL, "Cannot find module '../engine'".

- [ ] **Step 3: Implementar**

`src/conversation/engine.ts`:

```ts
import { EventStore } from '@/data/eventStore';
import { toISODate } from '@/domain/dates';
import { EventSource, Farm, FarmEvent, Interpreter } from '@/domain/types';
import { Card, Intent, mergeIntent, PendingInfo, runTool, ToolResult } from '@/tools';

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

export interface Pending extends PendingInfo {
  createdAt: number;
}

export interface ConversationState {
  pending: Pending | null;
  history: Turn[];
}

export const initialConversation: ConversationState = { pending: null, history: [] };
export const PENDING_TTL_MS = 60_000;
const HISTORY_LIMIT = 6;

export const HELP_LINES = [
  '"Llovieron 18 milímetros anoche"',
  '"Pasé 40 vaquillonas del lote 3 al 5"',
  '"¿Cuánto llovió este mes?"',
  '"¿Cuántos animales hay en el lote 5?"',
];

export type Interpretation =
  | { kind: 'intent'; intent: Intent }
  | { kind: 'cancel' }
  | { kind: 'unknown' }
  | { kind: 'reply'; text: string };

export interface InterpretRequest {
  text: string;
  pending: PendingInfo | null;
  history: Turn[];
  today: string;
  events: FarmEvent[];
}

export interface InterpretOutcome {
  interpretation: Interpretation;
  via: Interpreter;
  degraded: boolean;
}

export interface TurnDeps {
  farm: Farm;
  store: EventStore;
  interpret: (req: InterpretRequest) => Promise<InterpretOutcome>;
  phrase?: (userText: string, result: ToolResult) => Promise<string | null>;
  now: () => Date;
  newId: () => string;
}

export interface TurnOutcome {
  card: Card;
  speech: string;
  via: Interpreter;
  degraded: boolean;
  expectsReply: boolean;
  state: ConversationState;
}

interface TurnMeta {
  text: string;
  via: Interpreter;
  degraded: boolean;
}

function activePending(state: ConversationState, now: Date): Pending | null {
  return state.pending && now.getTime() - state.pending.createdAt < PENDING_TTL_MS ? state.pending : null;
}

function reply(state: ConversationState, meta: TurnMeta, card: Card, speech: string, pending: Pending | null, expectsReply = false): TurnOutcome {
  const history: Turn[] = [...state.history, { role: 'user' as const, text: meta.text }, { role: 'assistant' as const, text: speech }].slice(-HISTORY_LIMIT);
  return { card, speech, via: meta.via, degraded: meta.degraded, expectsReply, state: { pending, history } };
}

async function execute(intent: Intent, source: EventSource, state: ConversationState, deps: TurnDeps, meta: TurnMeta, events: FarmEvent[], now: Date): Promise<TurnOutcome> {
  const result = runTool(intent, {
    farm: deps.farm,
    events,
    today: toISODate(now),
    now: now.toISOString(),
    newId: deps.newId,
    origin: { source, interpreter: meta.via, rawText: meta.text },
  });
  if (result.status === 'needs_info') {
    return reply(state, meta, result.card, result.question, { intent: result.partial, missing: result.missing, createdAt: now.getTime() }, true);
  }
  if (result.status === 'ok' && result.newEvents.length > 0) await deps.store.append(result.newEvents);
  const phrased = meta.via === 'ia' && deps.phrase ? await deps.phrase(meta.text, result) : null;
  return reply(state, meta, result.card, phrased ?? result.speech, null);
}

export async function runTurn(text: string, source: EventSource, state: ConversationState, deps: TurnDeps): Promise<TurnOutcome> {
  const now = deps.now();
  const today = toISODate(now);
  const pending = activePending(state, now);
  const events = await deps.store.list();
  const { interpretation, via, degraded } = await deps.interpret({ text, pending, history: state.history, today, events });
  const meta: TurnMeta = { text, via, degraded };

  switch (interpretation.kind) {
    case 'cancel':
      return reply(state, meta, { tone: 'ayuda', title: 'Cancelado', lines: ['No registré nada.'] }, 'Listo, lo dejamos ahí.', null);
    case 'unknown':
      return reply(
        state,
        meta,
        { tone: 'ayuda', title: 'No te entendí', lines: ['Probá decir:', ...HELP_LINES] },
        'No te entendí. Probá, por ejemplo: llovieron dieciocho milímetros anoche.',
        pending,
      );
    case 'reply':
      return reply(state, meta, { tone: 'ayuda', title: 'La Tranquera', lines: [interpretation.text] }, interpretation.text, pending);
    case 'intent': {
      const intent = pending ? mergeIntent(pending.intent, interpretation.intent) : interpretation.intent;
      return execute(intent, source, { ...state, pending }, deps, meta, events, now);
    }
  }
}

export async function runIntentTurn(intent: Intent, rawText: string, state: ConversationState, deps: TurnDeps): Promise<TurnOutcome> {
  const now = deps.now();
  const events = await deps.store.list();
  return execute(intent, 'texto', state, deps, { text: rawText, via: 'local', degraded: false }, events, now);
}
```

- [ ] **Step 4: Correr tests y typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS (toda la suite).

- [ ] **Step 5: Commit**

```bash
git add src/conversation
git commit -m "feat(conversación): turnos con repregunta, vencimiento, cancelación y deshacer"
```

---

### Task 11: Estado del micrófono y modo

**Files:**
- Create: `src/conversation/mic.ts`, `src/conversation/mode.ts`
- Test: `src/conversation/__tests__/mic.test.ts`, `src/conversation/__tests__/mode.test.ts`

**Interfaces:**
- Produces:
  - `MicStatus = 'idle' | 'listening' | 'thinking' | 'speaking' | 'blocked'`, `MicState { status; micAllowed }`, `initialMic`
  - `MicAction = LISTEN | SUBMIT | SPEAK | DONE | STOPPED | MIC_BLOCKED | MIC_ALLOWED` (`{ type: '...' }`)
  - `micReducer(state, action): MicState`, `MIC_COPY: Record<MicStatus, { label; hint }>`
  - `Mode = 'ia' | 'local' | 'offline' | 'degraded'`, `resolveMode({ online, llmEnabled, lastDegraded }): Mode`

- [ ] **Step 1: Escribir los tests**

`src/conversation/__tests__/mic.test.ts`:

```ts
import { initialMic, MicAction, micReducer, MicState } from '../mic';

const run = (actions: MicAction['type'][], from: MicState = initialMic) =>
  actions.reduce((s, type) => micReducer(s, { type } as MicAction), from);

describe('micReducer', () => {
  it('ciclo normal: escuchar → pensar → hablar → inactivo', () => {
    expect(run(['LISTEN']).status).toBe('listening');
    expect(run(['LISTEN', 'SUBMIT']).status).toBe('thinking');
    expect(run(['LISTEN', 'SUBMIT', 'SPEAK']).status).toBe('speaking');
    expect(run(['LISTEN', 'SUBMIT', 'SPEAK', 'DONE']).status).toBe('idle');
  });

  it('el "end" del reconocedor después del resultado final no pisa "Pensando"', () => {
    expect(run(['LISTEN', 'SUBMIT', 'STOPPED']).status).toBe('thinking');
  });

  it('el "end" sin resultado vuelve a inactivo', () => {
    expect(run(['LISTEN', 'STOPPED']).status).toBe('idle');
  });

  it('sin permiso queda bloqueado y vuelve a bloqueado después de un turno escrito', () => {
    const blocked = run(['MIC_BLOCKED']);
    expect(blocked).toEqual({ status: 'blocked', micAllowed: false });
    expect(run(['LISTEN'], blocked).status).toBe('blocked');
    expect(run(['SUBMIT', 'SPEAK', 'DONE'], blocked).status).toBe('blocked');
  });

  it('al conceder el permiso vuelve a inactivo', () => {
    expect(run(['MIC_BLOCKED', 'MIC_ALLOWED'])).toEqual({ status: 'idle', micAllowed: true });
  });

  it('bloquear mientras habla no corta el habla', () => {
    expect(run(['SUBMIT', 'SPEAK', 'MIC_BLOCKED'])).toEqual({ status: 'speaking', micAllowed: false });
  });
});
```

`src/conversation/__tests__/mode.test.ts`:

```ts
import { resolveMode } from '../mode';

describe('resolveMode', () => {
  it('sin red siempre es offline', () => {
    expect(resolveMode({ online: false, llmEnabled: true, lastDegraded: false })).toBe('offline');
  });
  it('con red y sin key es local', () => {
    expect(resolveMode({ online: true, llmEnabled: false, lastDegraded: false })).toBe('local');
  });
  it('con red y key es IA, o señal débil si el último turno cayó al parser', () => {
    expect(resolveMode({ online: true, llmEnabled: true, lastDegraded: false })).toBe('ia');
    expect(resolveMode({ online: true, llmEnabled: true, lastDegraded: true })).toBe('degraded');
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm test -- src/conversation`
Expected: FAIL, "Cannot find module '../mic'".

- [ ] **Step 3: Implementar**

`src/conversation/mic.ts`:

```ts
export type MicStatus = 'idle' | 'listening' | 'thinking' | 'speaking' | 'blocked';

export interface MicState {
  status: MicStatus;
  micAllowed: boolean;
}

export type MicAction =
  | { type: 'LISTEN' }
  | { type: 'SUBMIT' }
  | { type: 'SPEAK' }
  | { type: 'DONE' }
  | { type: 'STOPPED' }
  | { type: 'MIC_BLOCKED' }
  | { type: 'MIC_ALLOWED' };

export const initialMic: MicState = { status: 'idle', micAllowed: true };

function rest(state: MicState): MicState {
  return { ...state, status: state.micAllowed ? 'idle' : 'blocked' };
}

export function micReducer(state: MicState, action: MicAction): MicState {
  switch (action.type) {
    case 'LISTEN':
      return state.micAllowed ? { ...state, status: 'listening' } : state;
    case 'SUBMIT':
      return { ...state, status: 'thinking' };
    case 'SPEAK':
      return { ...state, status: 'speaking' };
    case 'DONE':
      return rest(state);
    case 'STOPPED':
      return state.status === 'listening' ? rest(state) : state;
    case 'MIC_BLOCKED':
      return { micAllowed: false, status: state.status === 'idle' || state.status === 'listening' ? 'blocked' : state.status };
    case 'MIC_ALLOWED':
      return { micAllowed: true, status: state.status === 'blocked' ? 'idle' : state.status };
  }
}

export const MIC_COPY: Record<MicStatus, { label: string; hint: string }> = {
  idle: { label: 'Tocá y hablá', hint: 'Te escucho hasta que hagas silencio' },
  listening: { label: 'Escuchando…', hint: 'Tocá para terminar' },
  thinking: { label: 'Pensando…', hint: 'Un segundo' },
  speaking: { label: 'Hablando…', hint: 'Tocá para cortar' },
  blocked: { label: 'Activar micrófono', hint: 'Mientras tanto, podés escribir' },
};
```

`src/conversation/mode.ts`:

```ts
export type Mode = 'ia' | 'local' | 'offline' | 'degraded';

export function resolveMode(p: { online: boolean; llmEnabled: boolean; lastDegraded: boolean }): Mode {
  if (!p.online) return 'offline';
  if (!p.llmEnabled) return 'local';
  return p.lastDegraded ? 'degraded' : 'ia';
}
```

- [ ] **Step 4: Correr tests y typecheck**

Run: `npm test -- src/conversation && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/conversation
git commit -m "feat(conversación): máquina de estados del micrófono y modo IA/local/offline"
```

---

### Task 12: Adaptadores de plataforma: SQLite, red, voz y config

Son capas finas sobre módulos nativos, sin lógica propia, así que no llevan unit tests: se validan con typecheck acá y funcionando en el emulador en la Task 13.

**Files:**
- Create: `src/data/sqliteEventStore.ts`, `src/data/openStore.ts`, `src/platform/network.ts`, `src/config.ts`, `src/voice/stt.ts`, `src/voice/tts.ts`

**Interfaces:**
- Consumes: `EventStore`, `FarmEvent`, `buildSeedEvents`, `SEED_VERSION`; hallazgos de la Task 2 (locale y voz).
- Produces:
  - `openFarmStore(today: string, nowIso: string, newId: () => string): Promise<EventStore>`, `resetDemo(store: EventStore, today, nowIso, newId): Promise<void>`
  - `isOnline(): Promise<boolean>`, `subscribeOnline(cb: (online: boolean) => void): () => void`
  - `OPENAI: { apiKey; model; reasoningEffort?: string }`, `LLM_ENABLED: boolean`
  - `MicPermission = 'granted' | 'denied' | 'blocked'`, `requestMic()`, `micPermission()`, `SttCapabilities { available; onDeviceLocale: string | null }`, `sttCapabilities()`, `startListening({ online, onDeviceLocale })`, `stopListening()`, `abortListening()`, `MAX_LISTEN_MS = 10_000`
  - `initTts(): Promise<void>`, `speak(text: string, onDone: () => void): void`, `stopSpeaking(): void`

- [ ] **Step 1: Store SQLite**

`src/data/sqliteEventStore.ts`:

```ts
import type { SQLiteDatabase } from 'expo-sqlite';
import { FarmEvent } from '@/domain/types';
import { EventStore } from './eventStore';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  source TEXT NOT NULL,
  interpreter TEXT,
  raw_text TEXT
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;

interface EventRow {
  id: string;
  type: string;
  payload: string;
  occurred_on: string;
  recorded_at: string;
  source: string;
  interpreter: string | null;
  raw_text: string | null;
}

function toEvent(row: EventRow): FarmEvent {
  return {
    id: row.id,
    type: row.type,
    payload: JSON.parse(row.payload),
    occurredOn: row.occurred_on,
    recordedAt: row.recorded_at,
    source: row.source,
    interpreter: row.interpreter,
    rawText: row.raw_text,
  } as FarmEvent;
}

export class SqliteEventStore implements EventStore {
  constructor(private readonly db: SQLiteDatabase) {}

  async list(): Promise<FarmEvent[]> {
    const rows = await this.db.getAllAsync<EventRow>('SELECT * FROM events ORDER BY rowid');
    return rows.map(toEvent);
  }

  async append(events: FarmEvent[]): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      for (const e of events) await this.insert(e);
    });
  }

  async replaceAll(events: FarmEvent[]): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('DELETE FROM events');
      for (const e of events) await this.insert(e);
    });
  }

  private async insert(e: FarmEvent): Promise<void> {
    await this.db.runAsync(
      'INSERT INTO events (id, type, payload, occurred_on, recorded_at, source, interpreter, raw_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      e.id,
      e.type,
      JSON.stringify(e.payload),
      e.occurredOn,
      e.recordedAt,
      e.source,
      e.interpreter,
      e.rawText,
    );
  }
}
```

`src/data/openStore.ts`:

```ts
import * as SQLite from 'expo-sqlite';
import { EventStore } from './eventStore';
import { buildSeedEvents, SEED_VERSION } from './seed';
import { SCHEMA, SqliteEventStore } from './sqliteEventStore';

export async function openFarmStore(today: string, nowIso: string, newId: () => string): Promise<EventStore> {
  const db = await SQLite.openDatabaseAsync('la-tranquera.db');
  await db.execAsync(SCHEMA);
  const store = new SqliteEventStore(db);
  const seeded = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', 'seed_version');
  if (!seeded) {
    await store.replaceAll(buildSeedEvents(today, newId, nowIso));
    await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', 'seed_version', SEED_VERSION);
    await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', 'installed_on', today);
  }
  return store;
}

export async function resetDemo(store: EventStore, today: string, nowIso: string, newId: () => string): Promise<void> {
  await store.replaceAll(buildSeedEvents(today, newId, nowIso));
}
```

- [ ] **Step 2: Red y config**

`src/platform/network.ts`:

```ts
import * as Network from 'expo-network';

function reachable(state: Network.NetworkState): boolean {
  return Boolean(state.isConnected) && state.isInternetReachable !== false;
}

export async function isOnline(): Promise<boolean> {
  return reachable(await Network.getNetworkStateAsync());
}

export function subscribeOnline(callback: (online: boolean) => void): () => void {
  const subscription = Network.addNetworkStateListener((state) => callback(reachable(state)));
  return () => subscription.remove();
}
```

`src/config.ts`:

```ts
export const OPENAI = {
  apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '',
  model: process.env.EXPO_PUBLIC_OPENAI_MODEL ?? '',
  reasoningEffort: process.env.EXPO_PUBLIC_OPENAI_REASONING_EFFORT || undefined,
};

export const LLM_ENABLED = OPENAI.apiKey !== '' && OPENAI.model !== '';
```

- [ ] **Step 3: Voz**

`src/voice/stt.ts`:

```ts
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

export type MicPermission = 'granted' | 'denied' | 'blocked';

export const MAX_LISTEN_MS = 10_000;
const SILENCE_MS = 1_500;
const CONTEXT = ['vacas', 'vaquillonas', 'terneros', 'novillos', 'toros', 'lote', 'milímetros', 'llovieron'];
const SPANISH_PREFERENCE = ['es-AR', 'es-419', 'es-US', 'es-ES'];

function toPermission(r: { granted: boolean; canAskAgain: boolean }): MicPermission {
  if (r.granted) return 'granted';
  return r.canAskAgain ? 'denied' : 'blocked';
}

export async function requestMic(): Promise<MicPermission> {
  return toPermission(await ExpoSpeechRecognitionModule.requestPermissionsAsync());
}

export async function micPermission(): Promise<MicPermission> {
  return toPermission(await ExpoSpeechRecognitionModule.getPermissionsAsync());
}

export interface SttCapabilities {
  available: boolean;
  onDeviceLocale: string | null;
}

export async function sttCapabilities(): Promise<SttCapabilities> {
  const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
  if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) return { available, onDeviceLocale: null };
  try {
    const { installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
    const locale = SPANISH_PREFERENCE.find((l) => installedLocales.includes(l)) ?? installedLocales.find((l) => l.startsWith('es')) ?? null;
    return { available, onDeviceLocale: locale };
  } catch {
    return { available, onDeviceLocale: null };
  }
}

// Con red se usa el reconocedor online (mejor con ruido); sin red, el modelo on-device si está instalado.
export function startListening(opts: { online: boolean; onDeviceLocale: string | null }): void {
  const onDevice = !opts.online && opts.onDeviceLocale !== null;
  ExpoSpeechRecognitionModule.start({
    lang: onDevice && opts.onDeviceLocale ? opts.onDeviceLocale : 'es-AR',
    interimResults: true,
    continuous: false,
    requiresOnDeviceRecognition: onDevice,
    contextualStrings: CONTEXT,
    androidIntentOptions: { EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: SILENCE_MS },
  });
}

export function stopListening(): void {
  ExpoSpeechRecognitionModule.stop();
}

export function abortListening(): void {
  ExpoSpeechRecognitionModule.abort();
}
```

`src/voice/tts.ts`:

```ts
import * as Speech from 'expo-speech';

const PREFERENCE = ['es-AR', 'es-419', 'es-US', 'es-MX', 'es-ES'];
let language = 'es-AR';

export async function initTts(): Promise<void> {
  const voices = await Speech.getAvailableVoicesAsync();
  const languages = voices.map((v) => v.language.replace('_', '-'));
  language = PREFERENCE.find((p) => languages.includes(p)) ?? languages.find((l) => l.startsWith('es')) ?? language;
}

export function speak(text: string, onDone: () => void): void {
  Speech.speak(text, { language, rate: 1.05, onDone, onStopped: onDone, onError: () => onDone() });
}

export function stopSpeaking(): void {
  void Speech.stop();
}
```

Si la Task 2 mostró que `es-AR` no tiene voz en el emulador, `initTts` igual elige otra voz `es-*`. Si no hay ninguna, el motor usa su default y el subtítulo sigue mostrando todo.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck && npm test`
Expected: sin errores; la suite sigue en verde.

- [ ] **Step 5: Commit**

```bash
git add src/data src/platform src/config.ts src/voice
git commit -m "feat(plataforma): store SQLite con siembra, red, config de OpenAI y adaptadores de voz"
```

---

### Task 13: Pantalla, hook de voz y QA en emulador (cierra el P0 funcional)

**Files:**
- Create: `src/interpreter/index.ts`, `src/voice/useVoiceAgent.ts`
- Create: `src/ui/theme.ts`, `src/ui/StatusBadge.tsx`, `src/ui/TodaySummaryView.tsx`, `src/ui/History.tsx`, `src/ui/ReceiptCard.tsx`, `src/ui/Subtitles.tsx`, `src/ui/NoticeBanner.tsx`, `src/ui/MicButton.tsx`, `src/ui/TextFallback.tsx`, `src/ui/HomeScreen.tsx`
- Modify: `App.tsx`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces:
  - `interpretLocally(req: InterpretRequest): Promise<InterpretOutcome>` (en la Task 14 se suma `createInterpreter`)
  - `Notice { text: string; action?: { label: string; onPress: () => void } }`
  - `useVoiceAgent({ store, farm, interpret, phrase? })` → `{ mic, partial, lastUser, lastReply, card, notice, mode, version, onMicPress, submitText, undoLast, resetDemo, setNotice }`

- [ ] **Step 1: Intérprete local como punto de entrada**

`src/interpreter/index.ts`:

```ts
import { InterpretOutcome, InterpretRequest } from '@/conversation/engine';
import { parseLocal } from './local/parser';

export async function interpretLocally(req: InterpretRequest): Promise<InterpretOutcome> {
  return { interpretation: parseLocal(req.text, req.pending, req.today), via: 'local', degraded: false };
}
```

- [ ] **Step 2: Hook de voz**

`src/voice/useVoiceAgent.ts`:

```ts
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';

import { LLM_ENABLED } from '@/config';
import { ConversationState, initialConversation, runIntentTurn, runTurn, TurnDeps, TurnOutcome } from '@/conversation/engine';
import { initialMic, micReducer } from '@/conversation/mic';
import { resolveMode } from '@/conversation/mode';
import { EventStore } from '@/data/eventStore';
import { resetDemo as resetDemoData } from '@/data/openStore';
import { toISODate } from '@/domain/dates';
import { EventSource, Farm } from '@/domain/types';
import { isOnline, subscribeOnline } from '@/platform/network';
import { Card, CardTone } from '@/tools';
import { abortListening, MAX_LISTEN_MS, MicPermission, micPermission, requestMic, startListening, stopListening, SttCapabilities, sttCapabilities } from './stt';
import { initTts, speak, stopSpeaking } from './tts';

export interface Notice {
  text: string;
  action?: { label: string; onPress: () => void };
}

interface AgentOptions {
  store: EventStore;
  farm: Farm;
  interpret: TurnDeps['interpret'];
  phrase?: TurnDeps['phrase'];
}

const REOPEN_MIC_MS = 300;

function feedback(tone: CardTone): void {
  if (tone === 'registro') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else if (tone === 'rechazo') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function useVoiceAgent({ store, farm, interpret, phrase }: AgentOptions) {
  const [mic, dispatch] = useReducer(micReducer, initialMic);
  const [permission, setPermission] = useState<MicPermission>('granted');
  const [partial, setPartial] = useState('');
  const [lastUser, setLastUser] = useState('');
  const [lastReply, setLastReply] = useState('');
  const [card, setCard] = useState<Card | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [online, setOnline] = useState(true);
  const [lastDegraded, setLastDegraded] = useState(false);
  const [version, setVersion] = useState(0);
  const conversation = useRef<ConversationState>(initialConversation);
  const caps = useRef<SttCapabilities>({ available: true, onDeviceLocale: null });
  const listenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gotFinal = useRef(false);

  const deps: TurnDeps = useMemo(
    () => ({ farm, store, interpret, phrase, now: () => new Date(), newId: Crypto.randomUUID }),
    [farm, store, interpret, phrase],
  );

  function clearListenTimer() {
    if (listenTimer.current) clearTimeout(listenTimer.current);
    listenTimer.current = null;
  }

  async function listen() {
    const result = await requestMic();
    setPermission(result);
    if (result !== 'granted') {
      dispatch({ type: 'MIC_BLOCKED' });
      return;
    }
    dispatch({ type: 'MIC_ALLOWED' });
    if (!caps.current.available) {
      setNotice({ text: 'Este teléfono no tiene el reconocimiento de voz activo. Podés escribir abajo.' });
      return;
    }
    gotFinal.current = false;
    setPartial('');
    startListening({ online: await isOnline(), onDeviceLocale: caps.current.onDeviceLocale });
    clearListenTimer();
    listenTimer.current = setTimeout(stopListening, MAX_LISTEN_MS);
  }

  function say(text: string, reopenMic: boolean) {
    setLastReply(text);
    dispatch({ type: 'SPEAK' });
    speak(text, () => {
      dispatch({ type: 'DONE' });
      if (reopenMic) setTimeout(() => void handlers.current.listen(), REOPEN_MIC_MS);
    });
  }

  function apply(outcome: TurnOutcome, source: EventSource) {
    conversation.current = outcome.state;
    setCard(outcome.card);
    setLastDegraded(outcome.degraded);
    setVersion((v) => v + 1);
    feedback(outcome.card.tone);
    say(outcome.speech, outcome.expectsReply && source === 'voz');
  }

  function fail() {
    setCard({ tone: 'rechazo', title: 'Algo falló', lines: ['No registré nada. Probá de nuevo.'] });
    say('Algo falló, probá de nuevo.', false);
  }

  async function handleText(text: string, source: EventSource) {
    if (!text.trim()) return;
    dispatch({ type: 'SUBMIT' });
    setLastUser(text);
    setPartial('');
    setNotice(null);
    try {
      apply(await runTurn(text, source, conversation.current, deps), source);
    } catch {
      fail();
    }
  }

  async function undoLast() {
    dispatch({ type: 'SUBMIT' });
    try {
      apply(await runIntentTurn({ tool: 'deshacer_ultimo', args: {} }, 'Deshacer (botón)', conversation.current, deps), 'texto');
    } catch {
      fail();
    }
  }

  async function resetDemo() {
    const now = new Date();
    await resetDemoData(store, toISODate(now), now.toISOString(), Crypto.randomUUID);
    conversation.current = initialConversation;
    setCard(null);
    setLastUser('');
    setLastReply('');
    setVersion((v) => v + 1);
  }

  function onMicPress() {
    switch (mic.status) {
      case 'idle':
        void listen();
        return;
      case 'listening':
        clearListenTimer();
        stopListening();
        return;
      case 'speaking':
        stopSpeaking();
        return;
      case 'blocked':
        if (permission === 'blocked') void Linking.openSettings();
        else void listen();
        return;
      case 'thinking':
        return;
    }
  }

  // Los listeners nativos y el callback del TTS se registran una vez; leen siempre la versión actual.
  const handlers = useRef({ listen, handleText, say });
  handlers.current = { listen, handleText, say };

  useSpeechRecognitionEvent('start', () => dispatch({ type: 'LISTEN' }));
  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript ?? '';
    setPartial(text);
    if (event.isFinal && text.trim()) {
      gotFinal.current = true;
      clearListenTimer();
      void handlers.current.handleText(text, 'voz');
    }
  });
  useSpeechRecognitionEvent('error', (event) => {
    clearListenTimer();
    if (event.error === 'aborted') return;
    if (event.error === 'not-allowed') {
      setPermission('denied');
      dispatch({ type: 'MIC_BLOCKED' });
      return;
    }
    if (event.error === 'no-speech' || event.error === 'speech-timeout') {
      gotFinal.current = true;
      handlers.current.say('No te escuché, probá de nuevo.', false);
      return;
    }
    if (event.error === 'network' || event.error === 'language-not-supported' || event.error === 'service-not-allowed') {
      setNotice({ text: 'No pude usar el reconocimiento de voz (¿sin señal?). Escribí abajo y lo registro igual.' });
    }
  });
  useSpeechRecognitionEvent('end', () => {
    clearListenTimer();
    if (!gotFinal.current) dispatch({ type: 'STOPPED' });
  });

  useEffect(() => {
    void initTts();
    void sttCapabilities().then((c) => {
      caps.current = c;
    });
    void micPermission().then((p) => {
      setPermission(p);
      if (p === 'blocked') dispatch({ type: 'MIC_BLOCKED' });
    });
    void isOnline().then(setOnline);
    const unsubscribe = subscribeOnline(setOnline);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') return;
      clearListenTimer();
      abortListening();
      stopSpeaking();
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, []);

  return {
    mic,
    partial,
    lastUser,
    lastReply,
    card,
    notice,
    setNotice,
    mode: resolveMode({ online, llmEnabled: LLM_ENABLED, lastDegraded }),
    version,
    onMicPress,
    submitText: (text: string) => void handleText(text, 'texto'),
    undoLast: () => void undoLast(),
    resetDemo,
  };
}
```

- [ ] **Step 3: Tema y componentes**

`src/ui/theme.ts`:

```ts
import { MicStatus } from '@/conversation/mic';
import { Mode } from '@/conversation/mode';
import { CardTone } from '@/tools/cards';

export const colors = {
  bg: '#FFFFFF',
  text: '#203046',
  muted: '#6C7C93',
  brand: '#347F61',
  cardBg: '#EFFBF6',
  border: '#D5E3DC',
  ok: '#008F26',
  info: '#2A4365',
  pending: '#B48A1E',
  pendingText: '#8A6914',
  danger: '#DC2626',
  white: '#FFFFFF',
};

export const toneColor: Record<CardTone, string> = {
  registro: colors.ok,
  consulta: colors.info,
  pendiente: colors.pending,
  ayuda: colors.muted,
  rechazo: colors.muted,
};

export const toneText: Record<CardTone, string> = { ...toneColor, pendiente: colors.pendingText };

export const micColor: Record<MicStatus, string> = {
  idle: colors.brand,
  listening: colors.danger,
  thinking: colors.info,
  speaking: colors.brand,
  blocked: colors.muted,
};

export const modeMeta: Record<Mode, { label: string; color: string }> = {
  ia: { label: 'IA', color: colors.ok },
  local: { label: 'LOCAL', color: colors.muted },
  offline: { label: 'OFFLINE', color: colors.muted },
  degraded: { label: 'SEÑAL DÉBIL', color: colors.pendingText },
};

export const fontSize = { badge: 16, body: 20, title: 28, number: 48 };
```

`src/ui/StatusBadge.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { Mode } from '@/conversation/mode';
import { fontSize, modeMeta } from './theme';

export function StatusBadge({ mode }: { mode: Mode }) {
  const meta = modeMeta[mode];
  return (
    <View style={[styles.badge, { borderColor: meta.color }]} accessibilityLabel={`Modo ${meta.label}`}>
      <View style={[styles.dot, { backgroundColor: meta.color }]} />
      <Text style={[styles.label, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { fontSize: fontSize.badge, fontWeight: '800', letterSpacing: 0.5 },
});
```

`src/ui/TodaySummaryView.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { describeDay } from '@/domain/dates';
import { formatMm } from '@/domain/rain';
import { TodaySummary } from '@/domain/summary';
import { colors, fontSize } from './theme';

export function TodaySummaryView({ summary, today }: { summary: TodaySummary; today: string }) {
  const last = summary.lastRain
    ? `Última lluvia: ${describeDay(summary.lastRain.date, today)} (${formatMm(summary.lastRain.mm)} mm)`
    : 'Sin lluvias registradas';
  const moves = summary.movesToday === 1 ? '1 movimiento hoy' : `${summary.movesToday} movimientos hoy`;
  return (
    <View style={styles.box}>
      <Text style={styles.heading}>HOY</Text>
      <Text style={styles.line}>🌧  {formatMm(summary.rainTodayMm)} mm hoy · {formatMm(summary.rainMonthMm)} mm en {summary.month}</Text>
      <Text style={styles.sub}>{last}</Text>
      <Text style={styles.line}>🐄  {summary.totalHeads} cabezas en {summary.lotCount} lotes</Text>
      <Text style={styles.line}>↔  {moves}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 4, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  heading: { fontSize: fontSize.body, fontWeight: '800', color: colors.brand, letterSpacing: 1 },
  line: { fontSize: fontSize.body, color: colors.text, fontWeight: '600' },
  sub: { fontSize: fontSize.body, color: colors.muted, marginLeft: 32 },
});
```

`src/ui/History.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { TodayRecord } from '@/domain/summary';
import { colors, fontSize } from './theme';

export function History({ records }: { records: TodayRecord[] }) {
  return (
    <View style={styles.box}>
      <Text style={styles.heading}>HISTORIAL DE HOY</Text>
      {records.map((r, i) => (
        <Text key={i} style={styles.line}>
          {r.time} · {r.text}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 4 },
  heading: { fontSize: fontSize.body, fontWeight: '800', color: colors.muted, letterSpacing: 1 },
  line: { fontSize: fontSize.body, color: colors.text },
});
```

`src/ui/ReceiptCard.tsx`:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, CardTone } from '@/tools/cards';
import { colors, fontSize, toneColor, toneText } from './theme';

const ICON: Record<CardTone, string> = { registro: '✓', consulta: '◉', pendiente: '✎', ayuda: '💬', rechazo: '⚠' };

function timeOf(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ReceiptCard({ card, onUndo }: { card: Card; onUndo: () => void }) {
  return (
    <View style={[styles.card, { borderColor: toneColor[card.tone] }]} accessibilityLiveRegion="polite">
      <Text style={[styles.title, { color: toneText[card.tone] }]}>
        {ICON[card.tone]}  {card.title.toUpperCase()}
      </Text>
      {card.headline ? <Text style={styles.headline}>{card.headline}</Text> : null}
      {card.fields?.map((f) => (
        <View key={f.label} style={styles.field}>
          <Text style={styles.fieldLabel}>{f.label}</Text>
          <Text style={[styles.fieldValue, f.value === null && styles.missing]}>{f.value ?? '¿?'}</Text>
        </View>
      ))}
      {card.lines.map((line, i) => (
        <Text key={i} style={styles.line}>
          {line}
        </Text>
      ))}
      {card.undoableEventId ? (
        <View style={styles.footer}>
          <Text style={styles.time}>{card.at ? timeOf(card.at) : ''}</Text>
          <Pressable onPress={onUndo} hitSlop={16} accessibilityRole="button" accessibilityLabel="Deshacer" style={styles.undo}>
            <Text style={styles.undoText}>DESHACER</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.cardBg, borderWidth: 3, borderRadius: 16, padding: 16, gap: 6 },
  title: { fontSize: fontSize.body, fontWeight: '800', letterSpacing: 0.5 },
  headline: { fontSize: fontSize.number, fontWeight: '800', color: colors.text },
  field: { flexDirection: 'row', justifyContent: 'space-between' },
  fieldLabel: { fontSize: fontSize.body, color: colors.muted },
  fieldValue: { fontSize: fontSize.body, color: colors.text, fontWeight: '700' },
  missing: { color: colors.pendingText, fontWeight: '900' },
  line: { fontSize: fontSize.body, color: colors.text },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  time: { fontSize: fontSize.body, color: colors.muted },
  undo: { borderWidth: 2, borderColor: colors.text, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  undoText: { fontSize: fontSize.body, fontWeight: '800', color: colors.text },
});
```

`src/ui/Subtitles.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize } from './theme';

export function Subtitles({ user, app }: { user: string; app: string }) {
  if (!user && !app) return null;
  return (
    <View style={styles.box}>
      {user ? (
        <Text style={styles.line}>
          <Text style={styles.who}>Vos: </Text>“{user}”
        </Text>
      ) : null}
      {app ? (
        <Text style={styles.line}>
          <Text style={styles.who}>App: </Text>
          {app}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 4 },
  line: { fontSize: fontSize.body, color: colors.text },
  who: { fontWeight: '800', color: colors.muted },
});
```

`src/ui/NoticeBanner.tsx`:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Notice } from '@/voice/useVoiceAgent';
import { colors, fontSize } from './theme';

export function NoticeBanner({ notice }: { notice: Notice }) {
  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      <Text style={styles.text}>{notice.text}</Text>
      {notice.action ? (
        <Pressable onPress={notice.action.onPress} accessibilityRole="button" style={styles.button}>
          <Text style={styles.buttonText}>{notice.action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 2, borderColor: colors.pending, borderRadius: 12, padding: 12, gap: 8 },
  text: { fontSize: fontSize.body, color: colors.text },
  button: { alignSelf: 'flex-start', backgroundColor: colors.pendingText, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  buttonText: { fontSize: fontSize.body, color: colors.white, fontWeight: '800' },
});
```

`src/ui/MicButton.tsx`:

```tsx
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text } from 'react-native';
import { MIC_COPY, MicStatus } from '@/conversation/mic';
import { colors, fontSize, micColor } from './theme';

const ICONS = {
  idle: 'microphone',
  listening: 'microphone',
  thinking: 'microphone',
  speaking: 'volume-high',
  blocked: 'microphone-off',
} as const;

export function MicButton({ status, onPress }: { status: MicStatus; onPress: () => void }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status !== 'listening') {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [status, pulse]);

  const copy = MIC_COPY[status];
  return (
    <Pressable onPress={onPress} disabled={status === 'thinking'} accessibilityRole="button" accessibilityLabel={copy.label} style={styles.wrap}>
      <Animated.View style={[styles.button, { backgroundColor: micColor[status], opacity: pulse }]}>
        {status === 'thinking' ? (
          <ActivityIndicator color={colors.white} size="large" />
        ) : (
          <MaterialCommunityIcons name={ICONS[status]} size={72} color={colors.white} />
        )}
        <Text style={styles.label}>{copy.label}</Text>
        <Text style={styles.hint}>{copy.hint}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 0.4, padding: 12 },
  button: { flex: 1, borderRadius: 28, alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { fontSize: fontSize.title, fontWeight: '900', color: colors.white },
  hint: { fontSize: fontSize.body, color: colors.white },
});
```

`src/ui/TextFallback.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize } from './theme';

export function TextFallback({ expanded, disabled, onSubmit }: { expanded: boolean; disabled: boolean; onSubmit: (text: string) => void }) {
  const [open, setOpen] = useState(expanded);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (expanded) setOpen(true);
  }, [expanded]);

  const send = () => {
    const text = value.trim();
    if (!text) return;
    onSubmit(text);
    setValue('');
  };

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={styles.toggle}>
        <Text style={styles.toggleText}>⌨  Escribir en vez de hablar</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.row}>
      <TextInput
        accessibilityLabel="Campo de texto"
        value={value}
        onChangeText={setValue}
        onSubmitEditing={send}
        placeholder="Ej: llovieron 18 mm anoche"
        placeholderTextColor={colors.muted}
        returnKeyType="send"
        editable={!disabled}
        style={styles.input}
      />
      <Pressable accessibilityLabel="Enviar" accessibilityRole="button" onPress={send} disabled={disabled} style={styles.send}>
        <Text style={styles.sendText}>Enviar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { paddingHorizontal: 16, paddingVertical: 10 },
  toggleText: { fontSize: fontSize.body, color: colors.brand, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  input: { flex: 1, fontSize: fontSize.body, color: colors.text, borderWidth: 2, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  send: { backgroundColor: colors.brand, borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' },
  sendText: { fontSize: fontSize.body, color: colors.white, fontWeight: '800' },
});
```

`src/ui/HomeScreen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TurnDeps } from '@/conversation/engine';
import { EventStore } from '@/data/eventStore';
import { FARM } from '@/data/seed';
import { formatLongDate, toISODate } from '@/domain/dates';
import { TodaySummary, todaySummary } from '@/domain/summary';
import { capitalize } from '@/tools/format';
import { useVoiceAgent } from '@/voice/useVoiceAgent';
import { History } from './History';
import { MicButton } from './MicButton';
import { NoticeBanner } from './NoticeBanner';
import { ReceiptCard } from './ReceiptCard';
import { StatusBadge } from './StatusBadge';
import { Subtitles } from './Subtitles';
import { TextFallback } from './TextFallback';
import { colors, fontSize } from './theme';
import { TodaySummaryView } from './TodaySummaryView';

interface Props {
  store: EventStore;
  interpret: TurnDeps['interpret'];
  phrase?: TurnDeps['phrase'];
}

export function HomeScreen({ store, interpret, phrase }: Props) {
  const agent = useVoiceAgent({ store, farm: FARM, interpret, phrase });
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const today = toISODate(new Date());

  useEffect(() => {
    void store.list().then((events) => setSummary(todaySummary(FARM, events, today)));
  }, [store, agent.version, today]);

  const confirmReset = () =>
    Alert.alert('Restaurar datos de demo', 'Se borran tus registros y vuelve la semilla original.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Restaurar', style: 'destructive', onPress: () => void agent.resetDemo() },
    ]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onLongPress={confirmReset} delayLongPress={800}>
            <Text style={styles.farm}>{FARM.name}</Text>
          </Pressable>
          <StatusBadge mode={agent.mode} />
        </View>
        <Text style={styles.date}>{capitalize(formatLongDate(today))}</Text>
        {summary ? <TodaySummaryView summary={summary} today={today} /> : null}
        {agent.notice ? <NoticeBanner notice={agent.notice} /> : null}
        {agent.card ? <ReceiptCard card={agent.card} onUndo={agent.undoLast} /> : null}
        <Subtitles user={agent.partial || agent.lastUser} app={agent.lastReply} />
        {summary && summary.records.length > 0 ? <History records={summary.records} /> : null}
      </ScrollView>
      <TextFallback expanded={agent.mic.status === 'blocked'} disabled={agent.mic.status === 'thinking'} onSubmit={agent.submitText} />
      <MicButton status={agent.mic.status} onPress={agent.onMicPress} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  farm: { fontSize: fontSize.title, fontWeight: '900', color: colors.brand },
  date: { fontSize: fontSize.body, color: colors.muted },
});
```

- [ ] **Step 4: `App.tsx`**

```tsx
import * as Crypto from 'expo-crypto';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EventStore } from '@/data/eventStore';
import { openFarmStore } from '@/data/openStore';
import { toISODate } from '@/domain/dates';
import { interpretLocally } from '@/interpreter';
import { HomeScreen } from '@/ui/HomeScreen';
import { colors, fontSize } from '@/ui/theme';

export default function App() {
  const [store, setStore] = useState<EventStore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    openFarmStore(toISODate(now), now.toISOString(), Crypto.randomUUID)
      .then(setStore)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {store ? (
        <HomeScreen store={store} interpret={interpretLocally} />
      ) : (
        <View style={styles.splash}>
          {error ? <Text style={styles.error}>No pude abrir los datos: {error}</Text> : <ActivityIndicator size="large" color={colors.brand} />}
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 },
  error: { fontSize: fontSize.body, color: colors.danger, textAlign: 'center' },
});
```

Si el template no trae `expo-status-bar`, instalarlo: `npx expo install expo-status-bar`.

- [ ] **Step 5: Typecheck y tests**

Run: `npm run typecheck && npm test`
Expected: sin errores; la suite completa en verde.

- [ ] **Step 6: Correr en el emulador**

```bash
npx expo run:android
```

Expected: la app abre con "La Tranquera", badge LOCAL (sin key) u OFFLINE, la fecha, el resumen (450 cabezas en 8 lotes, lluvias de la semilla) y el botón verde "Tocá y hablá".

- [ ] **Step 7: QA por adb, entrada por texto**

Usar `adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml "$TMPDIR/ui.xml"` para encontrar los bounds de los elementos por `content-desc` ("Campo de texto", "Enviar", "Deshacer"), `adb shell input tap X Y` para tocar, `adb shell input text "Pase%s40%svaquillonas%sdel%slote%s3%sal%s5"` para escribir (`%s` = espacio; adb no acepta tildes, y el parser ya normaliza) y `adb exec-out screencap -p > "$TMPDIR/shot-N.png"` para capturar. Verificar cada caso con screenshot:

1. "Escribir en vez de hablar" → "Pase 40 vaquillonas del lote 3 al 5" → tarjeta verde "MOVIMIENTO REGISTRADO", "40 vaquillonas", "Lote 3: 45 → 5 vaquillonas", "Lote 5: 40 → 80 vaquillonas"; el resumen pasa a "1 movimiento hoy" y aparece en el historial.
2. "Cuantos animales hay en el lote 5" → tarjeta azul "LOTE 5", "80 cabezas".
3. "Cuanto llovio este mes" → tarjeta azul con el total y la lista.
4. "Pase 10 toros al 6" → tarjeta dorada con "Lote origen ¿?"; después "del 7" → registrado.
5. Tocar "DESHACER" → "REGISTRO ANULADO".
6. "Llovieron 300 mm" → pide confirmación; "si" → registrado.
7. "hola" → tarjeta gris "NO TE ENTENDÍ" con ejemplos.
8. Modo avión: `adb shell cmd connectivity airplane-mode enable` → badge OFFLINE; repetir el caso 2 y funciona. Después `... airplane-mode disable`.
9. Permiso: `adb shell pm revoke com.marianodiaz.latranquera android.permission.RECORD_AUDIO`, tocar el micrófono y denegar → botón gris "Activar micrófono" y campo de texto desplegado.
10. Pulsación larga en "La Tranquera" → "Restaurar" → el resumen vuelve a 0 movimientos.

- [ ] **Step 8: Prueba de voz (manual, la hace el usuario)**

Con `adb emu avd hostmicon` activo, el usuario toca el micrófono y dice las frases del enunciado. Verificar: rojo pulsante con subtítulo en vivo, corte por silencio, respuesta hablada y, en la repregunta ("Pasé 40 vaquillonas al 5"), que el micrófono se reabra solo.

- [ ] **Step 9: Commit**

```bash
git add App.tsx src
git commit -m "feat(ui): pantalla de comprobantes, botón de micrófono, texto de respaldo y hook de voz"
```

---

### Task 14: Intérprete con LLM (OpenAI) y fallback local

**Files:**
- Create: `src/interpreter/llm.ts`
- Modify: `src/interpreter/index.ts`, `App.tsx`, `.env` (local, no se commitea), `DECISIONS.md`
- Test: `src/interpreter/__tests__/llm.test.ts`, `src/interpreter/__tests__/index.test.ts`

**Interfaces:**
- Consumes: `toolSchemas`, `toolDescriptions`, `parseIntent`, `cleanArgs`, `InterpretRequest`, `InterpretOutcome`, `Interpretation`, `ToolResult`, `PendingInfo`, `farmSummaryText`, `formatLongDate`, `OPENAI`, `LLM_ENABLED`, `isOnline`.
- Produces:
  - `LlmConfig { apiKey; model; reasoningEffort?; fetchImpl? }`, `class LlmError extends Error`
  - `toolDefinitions(): object[]`, `systemPrompt({ today, farmSummary, pending }): string`
  - `interpretWithLlm(req: InterpretRequest & { farmSummary: string }, cfg, timeoutMs = 4000): Promise<Interpretation>`
  - `phraseWithLlm(userText, result: ToolResult, cfg, timeoutMs = 2500): Promise<string | null>`
  - `createInterpreter({ llm: LlmConfig | null; isOnline; farm; timeoutMs?; onLlmError? }): (req) => Promise<InterpretOutcome>`

- [ ] **Step 1: Elegir el modelo con la key del usuario**

```bash
cp .env.example .env   # pegar la key en EXPO_PUBLIC_OPENAI_API_KEY
set -a; source .env; set +a
curl -s https://api.openai.com/v1/models -H "Authorization: Bearer $EXPO_PUBLIC_OPENAI_API_KEY" | jq -r '.data[].id' | grep -Ei 'nano|mini' | sort
```

Elegir el modelo más chico y rápido de la familia actual que soporte tool calling. Medir la latencia real con una llamada de prueba:

```bash
time curl -s https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $EXPO_PUBLIC_OPENAI_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"<MODELO>","messages":[{"role":"user","content":"pasé 40 vaquillonas del 3 al 5"}],"tools":[{"type":"function","function":{"name":"mover_animales","parameters":{"type":"object","properties":{"cantidad":{"type":"integer"},"lote_origen":{"type":"integer"},"lote_destino":{"type":"integer"}}}}}],"max_completion_tokens":500}' | jq '.choices[0].message.tool_calls'
```

Expected: devuelve el tool call en menos de ~2 s. Si es un modelo de razonamiento, probar agregando `"reasoning_effort":"minimal"` y quedarse con lo más rápido. Completar `EXPO_PUBLIC_OPENAI_MODEL` (y `EXPO_PUBLIC_OPENAI_REASONING_EFFORT` si aplica) en `.env`, y anotar en `DECISIONS.md` el modelo elegido, las alternativas probadas y las latencias medidas.

- [ ] **Step 2: Escribir los tests**

`src/interpreter/__tests__/llm.test.ts`:

```ts
import { ToolResult } from '@/tools';
import { interpretWithLlm, LlmConfig, LlmError, phraseWithLlm, systemPrompt, toolDefinitions } from '../llm';

function fakeFetch(body: unknown, status = 200) {
  return jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })) as unknown as typeof fetch;
}

const hangingFetch = ((_url: string, init: RequestInit) =>
  new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;

const toolCall = (name: string, args: object) => ({
  choices: [{ message: { tool_calls: [{ type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }],
});

const cfg = (fetchImpl: typeof fetch): LlmConfig => ({ apiKey: 'k', model: 'modelo', fetchImpl });
const req = { text: 'pasé 40 vaquillonas del 3 al 5', pending: null, history: [], today: '2026-10-13', events: [], farmSummary: 'Lote 3: 45 vaquillonas' };

describe('interpretWithLlm', () => {
  it('convierte el tool call en un intent validado', async () => {
    const fetchImpl = fakeFetch(toolCall('mover_animales', { cantidad: 40, categoria: 'vaquillonas', lote_origen: 3, lote_destino: 5 }));
    await expect(interpretWithLlm(req, cfg(fetchImpl))).resolves.toEqual({
      kind: 'intent',
      intent: { tool: 'mover_animales', args: { cantidad: 40, categoria: 'vaquillonas', lote_origen: 3, lote_destino: 5 } },
    });
    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('modelo');
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'pasé 40 vaquillonas del 3 al 5' });
    expect(init.headers.Authorization).toBe('Bearer k');
  });

  it('descarta null en argumentos opcionales', async () => {
    const fetchImpl = fakeFetch(toolCall('mover_animales', { cantidad: 40, categoria: 'vaquillonas', lote_origen: null, fecha: null }));
    await expect(interpretWithLlm(req, cfg(fetchImpl))).resolves.toEqual({
      kind: 'intent',
      intent: { tool: 'mover_animales', args: { cantidad: 40, categoria: 'vaquillonas' } },
    });
  });

  it('cancelar y respuestas sin herramienta', async () => {
    await expect(interpretWithLlm(req, cfg(fakeFetch(toolCall('cancelar', {}))))).resolves.toEqual({ kind: 'cancel' });
    await expect(interpretWithLlm(req, cfg(fakeFetch({ choices: [{ message: { content: ' Puedo anotar lluvias. ' } }] })))).resolves.toEqual({
      kind: 'reply',
      text: 'Puedo anotar lluvias.',
    });
  });

  it.each([
    ['herramienta desconocida', fakeFetch(toolCall('borrar_todo', {}))],
    ['argumentos inválidos', fakeFetch(toolCall('mover_animales', { categoria: 'perros' }))],
    ['JSON roto', fakeFetch({ choices: [{ message: { tool_calls: [{ function: { name: 'consultar_stock', arguments: '{lote:' } }] } }] })],
    ['respuesta vacía', fakeFetch({ choices: [{ message: { content: '' } }] })],
    ['HTTP 500', fakeFetch({}, 500)],
  ])('%s → LlmError', async (_name, fetchImpl) => {
    await expect(interpretWithLlm(req, cfg(fetchImpl))).rejects.toBeInstanceOf(LlmError);
  });

  it('corta por timeout', async () => {
    await expect(interpretWithLlm(req, cfg(hangingFetch), 20)).rejects.toThrow('timeout');
  });
});

describe('definiciones para OpenAI', () => {
  it('expone las 5 herramientas y cancelar, sin $schema', () => {
    const defs = toolDefinitions() as { function: { name: string; parameters: Record<string, unknown> } }[];
    expect(defs.map((d) => d.function.name).sort()).toEqual(['cancelar', 'consultar_lluvia', 'consultar_stock', 'deshacer_ultimo', 'mover_animales', 'registrar_lluvia']);
    expect(defs.every((d) => !('$schema' in d.function.parameters))).toBe(true);
  });

  it('el prompt incluye fecha, campo y pendiente', () => {
    const prompt = systemPrompt({
      today: '2026-10-13',
      farmSummary: 'Lote 3: 45 vaquillonas',
      pending: { intent: { tool: 'mover_animales', args: { cantidad: 40 } }, missing: 'lote_origen' },
    });
    expect(prompt).toContain('martes 13 de octubre (2026-10-13)');
    expect(prompt).toContain('Lote 3: 45 vaquillonas');
    expect(prompt).toContain('falta "lote_origen"');
  });
});

describe('phraseWithLlm', () => {
  const ok: ToolResult = { status: 'ok', newEvents: [], speech: 'Anotado: 18 milímetros ayer.', card: { tone: 'registro', title: 'Lluvia registrada', lines: [] } };

  it('devuelve el texto redactado', async () => {
    await expect(phraseWithLlm('llovieron 18', ok, cfg(fakeFetch({ choices: [{ message: { content: 'Listo, 18 milímetros de ayer.' } }] })))).resolves.toBe('Listo, 18 milímetros de ayer.');
  });

  it('ante cualquier error devuelve null', async () => {
    await expect(phraseWithLlm('llovieron 18', ok, cfg(fakeFetch({}, 500)))).resolves.toBeNull();
    await expect(phraseWithLlm('llovieron 18', ok, cfg(hangingFetch), 20)).resolves.toBeNull();
  });
});
```

`src/interpreter/__tests__/index.test.ts`:

```ts
import { FARM } from '@/data/seed';
import { createInterpreter } from '../index';

const toolCallBody = { choices: [{ message: { tool_calls: [{ function: { name: 'consultar_stock', arguments: '{"lote":5}' } }] } }] };
const okFetch = () => jest.fn(async () => ({ ok: true, status: 200, json: async () => toolCallBody })) as unknown as typeof fetch;
const req = { text: '¿Cuántos animales hay en el lote 5?', pending: null, history: [], today: '2026-10-13', events: [] };

describe('createInterpreter', () => {
  it('con red usa el LLM', async () => {
    const interpret = createInterpreter({ llm: { apiKey: 'k', model: 'm', fetchImpl: okFetch() }, isOnline: async () => true, farm: FARM });
    await expect(interpret(req)).resolves.toEqual({ interpretation: { kind: 'intent', intent: { tool: 'consultar_stock', args: { lote: 5 } } }, via: 'ia', degraded: false });
  });

  it('sin red usa el parser y no llama a la API', async () => {
    const fetchImpl = okFetch();
    const interpret = createInterpreter({ llm: { apiKey: 'k', model: 'm', fetchImpl }, isOnline: async () => false, farm: FARM });
    await expect(interpret(req)).resolves.toMatchObject({ via: 'local', degraded: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('si el LLM falla cae al parser en modo degradado y avisa el error', async () => {
    const onLlmError = jest.fn();
    const failing = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
    const interpret = createInterpreter({ llm: { apiKey: 'k', model: 'm', fetchImpl: failing }, isOnline: async () => true, farm: FARM, onLlmError });
    await expect(interpret(req)).resolves.toEqual({ interpretation: { kind: 'intent', intent: { tool: 'consultar_stock', args: { lote: 5 } } }, via: 'local', degraded: true });
    expect(onLlmError).toHaveBeenCalled();
  });

  it('sin configuración de LLM siempre es local', async () => {
    const interpret = createInterpreter({ llm: null, isOnline: async () => true, farm: FARM });
    await expect(interpret(req)).resolves.toMatchObject({ via: 'local', degraded: false });
  });
});
```

- [ ] **Step 3: Correr y verificar que fallan**

Run: `npm test -- src/interpreter/__tests__`
Expected: FAIL, "Cannot find module '../llm'" / "createInterpreter is not a function".

- [ ] **Step 4: Implementar**

`src/interpreter/llm.ts`:

```ts
import { z } from 'zod';
import { Interpretation, InterpretRequest } from '@/conversation/engine';
import { formatLongDate } from '@/domain/dates';
import { cleanArgs, parseIntent, PendingInfo, ToolName, toolDescriptions, ToolResult, toolSchemas } from '@/tools';

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export interface LlmConfig {
  apiKey: string;
  model: string;
  reasoningEffort?: string;
  fetchImpl?: typeof fetch;
}

export class LlmError extends Error {}

export function toolDefinitions(): object[] {
  const tools = (Object.keys(toolSchemas) as ToolName[]).map((name) => {
    const { $schema: _schema, ...parameters } = z.toJSONSchema(toolSchemas[name]) as Record<string, unknown>;
    return { type: 'function', function: { name, description: toolDescriptions[name], parameters } };
  });
  return [
    ...tools,
    {
      type: 'function',
      function: { name: 'cancelar', description: 'El productor cancela la acción pendiente.', parameters: { type: 'object', properties: {} } },
    },
  ];
}

export function systemPrompt(ctx: { today: string; farmSummary: string; pending: PendingInfo | null }): string {
  return [
    'Sos el asistente de campo de un productor ganadero de Argentina. Recibís lo que dijo (español rioplatense transcripto por voz, puede tener errores) y llamás UNA herramienta.',
    `Hoy es ${formatLongDate(ctx.today)} (${ctx.today}). "Anoche" es el día anterior. Las fechas van como YYYY-MM-DD.`,
    `Stock actual del campo:\n${ctx.farmSummary}`,
    'Categorías: vacas, vaquillonas, terneros, novillos, toros (vaquillas = vaquillonas, terneras = terneros).',
    'Reglas:',
    '- Si quiere registrar o consultar algo, llamá la herramienta aunque falten datos: pasá solo lo que dijo. La app pregunta lo que falte. Nunca inventes datos.',
    '- Si habla de "todas", "todos" o "los toros" sin número, usá cantidad "todas".',
    '- Si quiere borrar o corregir lo último, usá deshacer_ultimo.',
    '- Si no tiene que ver con el campo, respondé en una frase corta qué podés hacer, sin herramientas.',
    ctx.pending
      ? `Hay una acción pendiente: ${ctx.pending.intent.tool} con ${JSON.stringify(ctx.pending.intent.args)}; falta "${ctx.pending.missing}". Si el productor responde ese dato, llamá ${ctx.pending.intent.tool} con TODOS los argumentos combinados. Si cancela, llamá cancelar.`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function post(body: Record<string, unknown>, cfg: LlmConfig, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await (cfg.fetchImpl ?? fetch)(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, ...(cfg.reasoningEffort ? { reasoning_effort: cfg.reasoningEffort } : {}), ...body }),
      signal: controller.signal,
    });
    if (!res.ok) throw new LlmError(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (e instanceof LlmError) throw e;
    throw new LlmError(controller.signal.aborted ? 'timeout' : String(e));
  } finally {
    clearTimeout(timer);
  }
}

export async function interpretWithLlm(req: InterpretRequest & { farmSummary: string }, cfg: LlmConfig, timeoutMs = 4000): Promise<Interpretation> {
  const messages = [
    { role: 'system', content: systemPrompt({ today: req.today, farmSummary: req.farmSummary, pending: req.pending }) },
    ...req.history.map((t) => ({ role: t.role, content: t.text })),
    { role: 'user', content: req.text },
  ];
  const json = await post({ messages, tools: toolDefinitions(), tool_choice: 'auto', parallel_tool_calls: false, max_completion_tokens: 500 }, cfg, timeoutMs);
  const message = json?.choices?.[0]?.message;
  const call = message?.tool_calls?.[0];
  if (call) {
    if (call.function?.name === 'cancelar') return { kind: 'cancel' };
    let args: unknown;
    try {
      args = JSON.parse(call.function?.arguments || '{}');
    } catch {
      throw new LlmError('argumentos no son JSON');
    }
    const intent = parseIntent(call.function?.name ?? '', cleanArgs((args ?? {}) as Record<string, unknown>));
    if (!intent) throw new LlmError(`tool call inválido: ${call.function?.name}`);
    return { kind: 'intent', intent };
  }
  const content = typeof message?.content === 'string' ? message.content.trim() : '';
  if (content) return { kind: 'reply', text: content };
  throw new LlmError('respuesta vacía');
}

export async function phraseWithLlm(userText: string, result: ToolResult, cfg: LlmConfig, timeoutMs = 2500): Promise<string | null> {
  try {
    const json = await post(
      {
        messages: [
          {
            role: 'system',
            content: 'Sos la voz de una app de campo. Reescribí la respuesta en español rioplatense, cálida y breve (máximo 20 palabras). Usá SOLO los números del resultado y no agregues datos. Devolvé solo el texto a decir.',
          },
          { role: 'user', content: `El productor dijo: "${userText}"\nResultado: ${JSON.stringify({ estado: result.status, comprobante: result.card, respuesta_base: result.status === 'needs_info' ? result.question : result.speech })}` },
        ],
        max_completion_tokens: 300,
      },
      cfg,
      timeoutMs,
    );
    const text = json?.choices?.[0]?.message?.content;
    return typeof text === 'string' && text.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}
```

`src/interpreter/index.ts` (reemplaza el contenido de la Task 13):

```ts
import { InterpretOutcome, InterpretRequest } from '@/conversation/engine';
import { farmSummaryText } from '@/domain/summary';
import { Farm } from '@/domain/types';
import { interpretWithLlm, LlmConfig } from './llm';
import { parseLocal } from './local/parser';

export async function interpretLocally(req: InterpretRequest): Promise<InterpretOutcome> {
  return { interpretation: parseLocal(req.text, req.pending, req.today), via: 'local', degraded: false };
}

interface InterpreterDeps {
  llm: LlmConfig | null;
  isOnline: () => Promise<boolean>;
  farm: Farm;
  timeoutMs?: number;
  onLlmError?: (error: unknown) => void;
}

export function createInterpreter(deps: InterpreterDeps) {
  return async (req: InterpretRequest): Promise<InterpretOutcome> => {
    if (!deps.llm || !(await deps.isOnline())) return interpretLocally(req);
    try {
      const interpretation = await interpretWithLlm({ ...req, farmSummary: farmSummaryText(deps.farm, req.events) }, deps.llm, deps.timeoutMs);
      return { interpretation, via: 'ia', degraded: false };
    } catch (error) {
      deps.onLlmError?.(error);
      return { ...(await interpretLocally(req)), degraded: true };
    }
  };
}
```

- [ ] **Step 5: Conectar en `App.tsx`**

Agregar a los imports:

```tsx
import { LLM_ENABLED, OPENAI } from '@/config';
import { FARM } from '@/data/seed';
import { createInterpreter } from '@/interpreter';
import { phraseWithLlm } from '@/interpreter/llm';
import { isOnline } from '@/platform/network';
```

Antes de `export default function App()`:

```tsx
const llm = LLM_ENABLED ? OPENAI : null;
const interpret = createInterpreter({ llm, isOnline, farm: FARM, onLlmError: (e) => console.warn('LLM fallback', e) });
const phrase = llm ? (userText: string, result: Parameters<typeof phraseWithLlm>[1]) => phraseWithLlm(userText, result, llm) : undefined;
```

Y reemplazar `<HomeScreen store={store} interpret={interpretLocally} />` por `<HomeScreen store={store} interpret={interpret} phrase={phrase} />`, quitando el import de `interpretLocally`.

El `console.warn` del fallback es intencional: es el único rastro, en desarrollo, de por qué un turno cayó al parser.

- [ ] **Step 6: Tests, typecheck y prueba real**

Run: `npm test && npm run typecheck`
Expected: PASS.

Recompilar con la key (`npx expo run:android`; las `EXPO_PUBLIC_*` se embeben al bundlear). Con red, el badge muestra IA. Probar por texto frases que el parser local no cubre:

- "meti 40 vaquillonas en el 5 que estaban en el 3" → movimiento 3 → 5.
- "cuanta hacienda queda en el cinco" → stock del lote 5.
- "se largo a llover, cayeron como 20" → lluvia de 20 mm.

Con modo avión, las mismas frases del enunciado siguen funcionando con badge OFFLINE. Para la señal débil, `adb emu network delay gprs` y `adb emu network speed gsm` → el turno cae al parser y el badge muestra "SEÑAL DÉBIL". Revertir después con `adb emu network delay none` y `adb emu network speed full`.

- [ ] **Step 7: Commit**

```bash
git add src/interpreter App.tsx DECISIONS.md
git commit -m "feat(ia): intérprete OpenAI con tool calling, timeout y fallback al parser local"
```

---

### Task 15 (P1): Botón de volumen como push-to-talk

Decisión de UX: solo **bajar volumen** dispara el micrófono. Subir volumen sigue funcionando normal, así el productor puede subir la voz de la app.

**Files (camino A, si la Task 2 mostró que `expo-key-event` recibe la tecla y el volumen NO cambia):**
- Create: `src/voice/useVolumePtt.ts`

**Files (camino B, en otro caso):**
- Create: `modules/volume-ptt/` (módulo Expo local), `src/voice/useVolumePtt.ts`
- Modify: `package.json` (quitar `expo-key-event` si estaba)

**Common:**
- Modify: `src/ui/HomeScreen.tsx`, `src/conversation/mic.ts` (texto de ayuda)

**Interfaces:**
- Produces: `useVolumePtt(onPress: () => void): void`

- [ ] **Step 1 (A): Hook con expo-key-event**

`src/voice/useVolumePtt.ts`, usando el valor de `key` anotado en `DECISIONS.md` en la Task 2 (el ejemplo asume `AudioVolumeDown`):

```ts
import { useKeyEventListener } from 'expo-key-event';
import { useRef } from 'react';

const PTT_KEY = 'AudioVolumeDown';

export function useVolumePtt(onPress: () => void): void {
  const latest = useRef(onPress);
  latest.current = onPress;
  useKeyEventListener(
    (event) => {
      if (event.key === PTT_KEY && !event.repeat) latest.current();
    },
    { listenOnMount: true, captureModifiers: true },
  );
}
```

- [ ] **Step 1 (B): Módulo nativo propio**

```bash
npx create-expo-module@latest --local
```

Nombre del módulo: `volume-ptt`. Después:
- Dejar `modules/volume-ptt/expo-module.config.json` así:
  ```json
  { "platforms": ["android"], "android": { "modules": ["expo.modules.volumeptt.VolumePttModule"] } }
  ```
- Borrar los archivos de iOS, web y la vista de ejemplo que genera el template.
- Reemplazar el módulo Kotlin generado por `modules/volume-ptt/android/src/main/java/expo/modules/volumeptt/VolumePttModule.kt` con:

```kotlin
package expo.modules.volumeptt

import android.view.KeyEvent
import android.view.Window
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class VolumePttModule : Module() {
  private var wrapped: Window? = null

  override fun definition() = ModuleDefinition {
    Name("VolumePtt")
    Events("onVolumeDown")
    OnCreate { install() }
    OnActivityEntersForeground { install() }
  }

  // Envuelve el Window.Callback de la Activity para interceptar la tecla sin tocar MainActivity (CNG).
  private fun install() {
    val activity = appContext.currentActivity ?: return
    activity.runOnUiThread {
      val window = activity.window
      if (wrapped === window) return@runOnUiThread
      val original = window.callback
      window.callback = object : Window.Callback by original {
        override fun dispatchKeyEvent(event: KeyEvent): Boolean {
          if (event.keyCode != KeyEvent.KEYCODE_VOLUME_DOWN) return original.dispatchKeyEvent(event)
          if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) sendEvent("onVolumeDown", mapOf<String, Any>())
          return true
        }
      }
      wrapped = window
    }
  }
}
```

Reemplazar `modules/volume-ptt/index.ts` con:

```ts
import { NativeModule, requireNativeModule } from 'expo';

declare class VolumePttModule extends NativeModule<{ onVolumeDown: () => void }> {}

const VolumePtt = requireNativeModule<VolumePttModule>('VolumePtt');

export function addVolumeDownListener(listener: () => void) {
  return VolumePtt.addListener('onVolumeDown', listener);
}
```

`src/voice/useVolumePtt.ts`:

```ts
import { useEffect, useRef } from 'react';
import { addVolumeDownListener } from '../../modules/volume-ptt';

export function useVolumePtt(onPress: () => void): void {
  const latest = useRef(onPress);
  latest.current = onPress;
  useEffect(() => {
    const subscription = addVolumeDownListener(() => latest.current());
    return () => subscription.remove();
  }, []);
}
```

Si `expo-key-event` quedó instalado: `npm uninstall expo-key-event`.

- [ ] **Step 2: Conectar y ajustar el texto**

En `src/ui/HomeScreen.tsx`, después de `const agent = useVoiceAgent(...)`:

```tsx
useVolumePtt(agent.onMicPress);
```

con `import { useVolumePtt } from '@/voice/useVolumePtt';`.

En `src/conversation/mic.ts`, cambiar el `hint` de `idle` a `'o apretá bajar volumen'`.

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm test`
Expected: PASS.

```bash
npx expo run:android
adb shell input keyevent KEYCODE_VOLUME_DOWN   # el botón pasa a "Escuchando…" y el volumen no cambia
adb shell input keyevent KEYCODE_VOLUME_DOWN   # corta la escucha
adb shell input keyevent KEYCODE_VOLUME_UP     # sube el volumen normal
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(voz): bajar volumen como push-to-talk para usar con guantes"
```

---

### Task 16 (P1): Sugerir el paquete de voz en español offline

**Files:**
- Modify: `src/voice/stt.ts`, `src/voice/useVoiceAgent.ts`

**Interfaces:**
- Produces: `downloadSpanishOffline(): Promise<boolean>`

- [ ] **Step 1: Función de descarga**

Agregar a `src/voice/stt.ts`:

```ts
export async function downloadSpanishOffline(): Promise<boolean> {
  for (const locale of ['es-AR', 'es-US', 'es-ES']) {
    try {
      await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale });
      return true;
    } catch {
      // probar el siguiente locale: no todos tienen modelo offline
    }
  }
  return false;
}
```

- [ ] **Step 2: Avisos en el hook**

En `src/voice/useVoiceAgent.ts`, importar `downloadSpanishOffline` y agregar dentro del hook:

```ts
const offlineVoiceNotice = (): Notice => ({
  text: 'Para usar la voz sin señal, descargá el español offline (una sola vez, con wifi).',
  action: {
    label: 'Descargar',
    onPress: () => {
      void downloadSpanishOffline().then(async (ok) => {
        caps.current = await sttCapabilities();
        setNotice(ok ? { text: 'Listo. Cuando termine la descarga, la voz funciona sin señal.' } : { text: 'No pude descargarlo. Podés seguir escribiendo abajo.' });
      });
    },
  },
});
```

En el `useEffect` inicial, reemplazar el `sttCapabilities()` por:

```ts
void sttCapabilities().then(async (c) => {
  caps.current = c;
  if (c.available && c.onDeviceLocale === null && (await isOnline())) setNotice(offlineVoiceNotice());
});
```

En el listener `error`, el caso de red/idioma pasa a:

```ts
if (event.error === 'network' || event.error === 'language-not-supported' || event.error === 'service-not-allowed') {
  setNotice(caps.current.onDeviceLocale === null ? offlineVoiceNotice() : { text: 'No pude usar el reconocimiento de voz. Escribí abajo y lo registro igual.' });
}
```

`offlineVoiceNotice` usa `setNotice` y `caps`, que ya existen dentro del hook. Declararlo antes de `handlers`.

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm test`
Expected: PASS. En el emulador con red, si no hay modelo offline instalado, aparece el aviso dorado con "Descargar"; al tocarlo abre el diálogo del sistema (Android 13) o descarga directo (14+).

- [ ] **Step 4: Commit**

```bash
git add src/voice
git commit -m "feat(voz): sugerir descarga del español offline para usar la voz sin señal"
```

---

### Task 17: Entrega: README, DECISIONS, APK y GitHub Release

**Files:**
- Create: `README.md`
- Modify: `DECISIONS.md`

- [ ] **Step 1: `README.md`**

~~~markdown
# La Tranquera

Asistente de campo por voz para Android. El productor habla en español rioplatense ("Llovieron 18 mm anoche", "Pasé 40 vaquillonas del lote 3 al 5", "¿Cuánto llovió este mes?"), la app responde en voz alta y muestra un comprobante con los números.

Funciona **con y sin señal**: con red interpreta con un LLM (OpenAI) y sin red con un parser local. Las dos vías ejecutan las mismas herramientas sobre una base SQLite en el teléfono.

## Instalar el APK

Descargar `la-tranquera-v1.0.0-arm64.apk` del último [Release](../../releases) e instalarlo en un Android 11+ (permitir "instalar apps desconocidas").

## Compilar desde cero

Requisitos: macOS o Linux, Node 24 LTS, JDK 17, Android SDK (platform 36, build-tools 36), un emulador o un teléfono con depuración USB.

```bash
git clone <este repo> && cd la-tranquera
npm install
cp .env.example .env          # opcional: key y modelo de OpenAI; sin key funciona en modo local
npm test                      # tests unitarios
npm run typecheck
```

### Correr en desarrollo

```bash
npx expo run:android          # genera android/ (CNG), compila e instala el development build
```

Expo Go no sirve: el reconocimiento de voz es un módulo nativo. En el emulador, para usar el micrófono de la compu: `adb emu avd hostmicon`.

### Generar el APK

```bash
npx expo prebuild -p android --clean
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a && cd ..
mkdir -p dist && cp android/app/build/outputs/apk/release/app-release.apk dist/la-tranquera-v1.0.0-arm64.apk
```

El APK queda firmado con la debug keystore. Las variables `EXPO_PUBLIC_*` del `.env` se embeben en el build.

## "Levantar el server"

No hay server: todo corre en el teléfono (SQLite + parser local). La única dependencia externa es la API de OpenAI, que es opcional. Para desarrollo, el "server" es Metro, que se levanta solo con `npx expo run:android` (o `npx expo start` una vez instalado el development build).

## Estructura

```
src/domain        reglas puras: stock, lluvias, fechas, resumen de hoy
src/tools         contrato de herramientas (zod) + validación + comprobantes
src/interpreter   OpenAI (tool calling) y parser local offline
src/conversation  motor de turnos, repreguntas, estado del micrófono
src/data          semilla JSON + log de eventos en SQLite
src/voice         reconocimiento (expo-speech-recognition), TTS, push-to-talk
src/ui            pantalla única
```

Decisiones y trade-offs: [DECISIONS.md](DECISIONS.md).
~~~

- [ ] **Step 2: Completar `DECISIONS.md`**

Mantener la sección "Verificaciones técnicas" de la Task 2 y el modelo/latencias de la Task 14, y agregar las siguientes secciones con contenido real, tomado de la spec (secciones 4, 5, 6, 7 y 11) y de lo que pasó en la implementación:

```markdown
## Resumen

## Stack y por qué
(tabla elegido / descartado de la spec §4, actualizada con lo que pasó en la implementación)

## Voz: reconocimiento, síntesis y activación
- STT nativo, TTS nativo, tocar para hablar + bajar volumen (por qué no manos libres; guantes).
- Estado del micrófono: color + ícono + texto + vibración.

## IA con red, parser sin red
- Mismas herramientas para las dos vías; el LLM nunca escribe datos; timeouts 4 s / 2.5 s; badge de modo.
- Modelo elegido y latencias medidas (Task 14).
- Key embebida en el APK: riesgo aceptado para el take-home, con límite de gasto; en producción iría detrás de un proxy.

## Comprobante, no chat
- Registrar al instante + Deshacer en vez de confirmar; repregunta con tarjeta pendiente.

## Datos
- Log de eventos append-only (deshacer = anulación; auditoría con la frase original).
- Semilla con fechas relativas a la instalación.

## Escalabilidad (pensada, no construida)
(spec §11)

## Qué recorté y por qué

## Cómo usé IA
- Claude Code: diseño y spec con Opus, implementación con Sonnet por tareas con TDD, QA en emulador vía adb, revisión con Opus.
- Qué revisé o corregí a mano, con ejemplos concretos de esta implementación.
```

Cada sección lleva contenido escrito; ningún título puede quedar vacío. "Qué recorté" lista lo que no se hizo de P1/P2, con el motivo.

- [ ] **Step 3: Construir el APK**

```bash
npx expo prebuild -p android --clean
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a && cd ..
mkdir -p dist && cp android/app/build/outputs/apk/release/app-release.apk dist/la-tranquera-v1.0.0-arm64.apk
$ANDROID_HOME/build-tools/36.0.0/aapt2 dump badging dist/la-tranquera-v1.0.0-arm64.apk | grep -E "sdkVersion|native-code|package:"
```

Expected: `sdkVersion` ≤ 30, `native-code: 'arm64-v8a'` y el package `com.marianodiaz.latranquera`.

- [ ] **Step 4: Smoke test del APK**

```bash
adb uninstall com.marianodiaz.latranquera || true
adb install dist/la-tranquera-v1.0.0-arm64.apk
adb shell monkey -p com.marianodiaz.latranquera 1
```

Repetir los casos 1, 2, 5 y 8 de la Task 13 (Step 7) sobre el APK instalado. Si hay un Android físico disponible, el usuario prueba ahí la voz con ruido.

- [ ] **Step 5: Commit de docs**

```bash
git add README.md DECISIONS.md
git commit -m "docs: README de compilación y DECISIONS con trade-offs, escalabilidad y uso de IA"
```

- [ ] **Step 6: Repo y Release (PEDIR CONFIRMACIÓN AL USUARIO ANTES)**

Mostrar al usuario el nombre del repo, si va público o privado, y el contenido del release. Con su OK:

```bash
gh repo create la-tranquera --public --source . --push
gh release create v1.0.0 dist/la-tranquera-v1.0.0-arm64.apk \
  --title "La Tranquera v1.0.0" \
  --notes "APK Android 11+ (arm64-v8a), firmado con debug keystore. Ver README para compilar desde cero y DECISIONS.md para las decisiones."
```

Expected: el repo con el historial completo y el release con el APK adjunto.

---

### Task 18 (P2): Evaluación del LLM vs parser y tipografías de marca

**Files:**
- Create: `scripts/eval-llm.ts`
- Modify: `package.json`, `App.tsx`, `src/ui/theme.ts`, `DECISIONS.md`

- [ ] **Step 1: Script de evaluación**

```bash
npm install --save-dev tsx
```

`scripts/eval-llm.ts`:

```ts
import { isDeepStrictEqual } from 'node:util';
import { FARM } from '@/data/seed';
import { farmSummaryText } from '@/domain/summary';
import { interpretWithLlm, LlmConfig } from '@/interpreter/llm';
import { parseLocal } from '@/interpreter/local/parser';
import { FIXTURE_TODAY, PHRASES } from '@/interpreter/local/phrases.fixture';
import { Intent } from '@/tools/schemas';

const HARD: { text: string; expected: Intent }[] = [
  { text: 'metí 40 vaquillonas en el 5 que estaban en el 3', expected: { tool: 'mover_animales', args: { cantidad: 40, categoria: 'vaquillonas', lote_origen: 3, lote_destino: 5 } } },
  { text: 'se largó a llover, cayeron como 20', expected: { tool: 'registrar_lluvia', args: { mm: 20 } } },
  { text: '¿cuánta hacienda queda en el cinco?', expected: { tool: 'consultar_stock', args: { lote: 5 } } },
  { text: 'los novillos del 6 los mandé todos al 4', expected: { tool: 'mover_animales', args: { cantidad: 'todas', categoria: 'novillos', lote_origen: 6, lote_destino: 4 } } },
  { text: 'cuánta agua juntamos desde el primero', expected: { tool: 'consultar_lluvia', args: { periodo: 'mes' } } },
];

const cfg: LlmConfig = {
  apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '',
  model: process.env.EXPO_PUBLIC_OPENAI_MODEL ?? '',
  reasoningEffort: process.env.EXPO_PUBLIC_OPENAI_REASONING_EFFORT || undefined,
};

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function main() {
  const cases = [...PHRASES, ...HARD];
  const latencies: number[] = [];
  let llmOk = 0;
  let localOk = 0;
  for (const { text, expected } of cases) {
    const local = parseLocal(text, null, FIXTURE_TODAY);
    const localMatch = expected ? local.kind === 'intent' && isDeepStrictEqual(local.intent, expected) : local.kind === 'unknown';
    const started = Date.now();
    let llmResult: unknown;
    try {
      llmResult = await interpretWithLlm({ text, pending: null, history: [], today: FIXTURE_TODAY, events: [], farmSummary: farmSummaryText(FARM, []) }, cfg, 10_000);
    } catch (e) {
      llmResult = { error: String(e) };
    }
    latencies.push(Date.now() - started);
    const llmMatch = expected
      ? isDeepStrictEqual(llmResult, { kind: 'intent', intent: expected })
      : (llmResult as { kind?: string }).kind === 'reply';
    if (localMatch) localOk++;
    if (llmMatch) llmOk++;
    console.log(`${localMatch ? '✓' : '✗'} local  ${llmMatch ? '✓' : '✗'} llm  ${text}${llmMatch ? '' : `\n      llm → ${JSON.stringify(llmResult)}`}`);
  }
  console.log(`\n| Intérprete | Aciertos | p50 | p95 |\n|---|---|---|---|`);
  console.log(`| Parser local | ${localOk}/${cases.length} | <1 ms | <1 ms |`);
  console.log(`| LLM (${cfg.model}) | ${llmOk}/${cases.length} | ${percentile(latencies, 50)} ms | ${percentile(latencies, 95)} ms |`);
}

void main();
```

En `package.json` → `"scripts"`: `"eval:llm": "tsx --env-file=.env scripts/eval-llm.ts"`.

- [ ] **Step 2: Correr y documentar**

Run: `npm run eval:llm`
Expected: un listado por frase y una tabla final. Pegar la tabla en `DECISIONS.md` (sección "IA con red, parser sin red") con 2 o 3 líneas de lectura: dónde gana cada uno y qué frases fallaron.

- [ ] **Step 3: Tipografías de marca**

```bash
npx expo install expo-font @expo-google-fonts/plus-jakarta-sans @expo-google-fonts/inter
```

En `src/ui/theme.ts` agregar:

```ts
export const fonts = {
  body: 'Inter_400Regular',
  bold: 'Inter_700Bold',
  number: 'PlusJakartaSans_800ExtraBold',
};
```

En `App.tsx`, cargar las fuentes antes de mostrar la pantalla:

```tsx
import { Inter_400Regular, Inter_700Bold } from '@expo-google-fonts/inter';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans';
import { useFonts } from 'expo-font';
// dentro de App():
const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_700Bold, PlusJakartaSans_800ExtraBold });
// y renderizar <HomeScreen> solo cuando store && fontsLoaded
```

Aplicar `fontFamily: fonts.number` a `headline` (ReceiptCard) y `farm` (HomeScreen), `fonts.bold` a títulos y etiquetas, y `fonts.body` a `line`/`sub`. Con `fontFamily` explícito, quitar el `fontWeight` de esos estilos (en Android, una familia custom con `fontWeight` puede caer a la fuente del sistema). Las fuentes viajan dentro del bundle, así que funcionan sin red.

- [ ] **Step 4: Verificar y commit**

Run: `npm run typecheck && npm test`, y revisar visualmente en el emulador (screenshot).

```bash
git add -A
git commit -m "feat: evaluación LLM vs parser y tipografías de marca"
```

Si se hizo después del release, regenerar el APK (Task 17, Step 3) y subirlo con `gh release upload v1.0.0 dist/la-tranquera-v1.0.0-arm64.apk --clobber`, confirmando antes con el usuario.
