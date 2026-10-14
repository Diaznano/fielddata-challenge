# Decisiones

## IA con red, parser sin red

Con conexión el turno lo interpreta un LLM de OpenAI con tool calling; sin conexión (o si el LLM falla o tarda) cae a un parser local determinista. Los dos terminan en las mismas herramientas validadas con zod, así que el resultado es el mismo contrato.

**Modelo elegido: `gpt-4o-mini`** (no es de razonamiento, por eso `EXPO_PUBLIC_OPENAI_REASONING_EFFORT` queda vacío).

Alternativas probadas con la misma llamada de prueba ("pasé 40 vaquillonas del 3 al 5" con la herramienta `mover_animales`, 3 mediciones por modelo con `curl`):

| Modelo | Resultado | Latencia |
| --- | --- | --- |
| `gpt-4o-mini` | tool call correcto (40, lote 3 → 5) | 0,94 s / 1,28 s / 1,60 s |
| `gpt-3.5-turbo` | tool call correcto | 1,59 s / 1,63 s / 1,90 s |
| `gpt-5-nano`, `gpt-5-mini`, `gpt-4.1-nano`, `gpt-4.1-mini` | 403: la key del proyecto no tiene acceso al modelo | no aplica |

La key de la demo solo lista `gpt-3.5-turbo` y `gpt-4o-mini`, así que los modelos nano más nuevos no estaban disponibles. De los dos disponibles, `gpt-4o-mini` es más rápido y tiene mejor tool calling. Con el prompt y las 6 herramientas reales la latencia medida fue de 0,7 a 1,8 s por turno.

Tiempos máximos en la app: 4 s para interpretar y 2,5 s para redactar la respuesta; al pasarse, el turno sigue con el parser local o con el texto base, y el badge lo marca ("SEÑAL DÉBIL").
