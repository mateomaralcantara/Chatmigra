# Tutor ChatMi · entrevista dirigida por el agente

## Principio operativo
El Tutor toma la iniciativa. Al seleccionar un expediente, crea la primera
pregunta pendiente si la entrevista no ha terminado; no espera que el
solicitante formule una pregunta. El usuario responde por Chat o Voz y el
motor determinista propone la siguiente pregunta **sin llamar a Gemini**.

Se conserva el mismo chat y el mismo expediente privado, sin nueva base
de datos ni servicios de voz pagados.

## Latencia y velocidad
- Ruta A (entrevista): determina inmediatamente la próxima pregunta en el
  navegador con `interviewProgress`; luego persiste el turno completo en
  `applicant_case_messages`. Evita descargar PDF y llamar a Gemini.
- Ruta B (dato verificado): usa `applicant_case_facts` vía RLS.
- Ruta C (dato en documentos): usa fragmentos RAG y fallback a PDF.
- Ruta D (análisis complejo): Gemini Flash con streaming de texto y límites
  más cortos para preguntas ordinarias; se conserva capacidad para análisis.
- Carga de datos: documentos, mensajes, candidatos y trabajos indexados se
  consultan ahora en paralelo en lugar de tres tandas consecutivas.
- Voz: el Tutor habla primero tras pulsar **Iniciar voz**. El navegador exige
  ese gesto para permitir voz/micrófono; no se puede garantizar reproducción
  de audio sin permiso del usuario.
- El motor acepta «sí», «no», «turismo» y otras respuestas de una palabra.
  Pausa de confirmación: 850 ms en entrevista, 1400 ms en consulta libre.
  Esto reduce espera, pero en redes ruidosas el reconocimiento puede requerir
  repetición de respuesta. Se preserva la protección contra el eco.
- Selecciona una voz del navegador en español y normaliza secuencias de
  letras espaciadas antes de pronunciar. **No podemos garantizar** que toda
  voz TTS de terceros nunca deletree un acrónimo, nombre o código; el
  navegador y las voces disponibles son externos a ChatMi.

## Continuidad
Las preguntas son explícitas y auditables: objetivo de la solicitud,
nacionalidad/destino/visa si faltan en el perfil, negativas anteriores,
detalles de una negativa afirmativa, fechas, documentos y prioridades.
La transcripción se guarda por `case_id` y los pasos ya contestados
se reconocen al volver a abrir el expediente. Si la entrevista terminó,
vuelve a Consulta libre. Botón Pausar/Reanudar entrevista en ambas vistas.

Los datos declarados oralmente o por chat **no** se promueven
automáticamente a la memoria de hechos verificados. La confirmación de
hechos documentales sigue exigiendo revisión humana del propietario.

## Cómo probar
1. `git pull --ff-only origin feat/tutor-expediente-seguimiento-20261025`
2. `npm run check` (incluye tipado, tests y build).
3. `npx --yes vercel@65.2.0 dev --listen 3000 --scope monseoweb-project`
4. Abre `http://localhost:3000/tutor` con sesión autenticada.
5. Elige un expediente (puede estar vacío). Espera la pregunta inicial.
6. Responde y verifica que aparece automáticamente la segunda pregunta.
7. Pasa a Voz, pulsa Iniciar voz, escucha primero al Tutor, responde
   «sí» y comprueba una nueva pregunta sin Gemini.
8. Para el caso de negativa anterior: contesta «sí», comprueba que pide
   detalles. Para «no», debe pasar directamente a la siguiente pregunta.
9. Recarga y verifica que no duplica preguntas ya guardadas.
10. Pausa la entrevista y consulta un documento; necesita PDF seleccionado,
    RAG o Gemini según el tipo de consulta.
11. Compara tiempos medidos de la versión anterior y esta (mediana/p95).
    La mejora 2x es una **meta**, no un benchmark ya confirmado.

## Limitaciones e implementación posterior
- Falta un benchmark instrumentado reproducible de extremo a extremo.
- Faltan pruebas reales de micrófono, TTS y RLS con distintos usuarios.
- La entrevista guiada hoy sigue un árbol corto y verificable, no un LLM
  plenamente autónomo: evita latencia, costes, preguntas ambiguas y fugas.
- Un entrevistador con voz dúplex, interrupciones y preguntas complejas
  totalmente generadas por modelo requeriría otro transporte (WebRTC,
  WebSocket y una API de voz apta) y presupuesto explícito.
