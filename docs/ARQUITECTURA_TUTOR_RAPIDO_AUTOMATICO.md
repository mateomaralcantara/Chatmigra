# ChatMi · Arquitectura Tutor de respuesta rápida y automática
Estado: diseño aprobado para implementación incremental. No está desplegado por este archivo.

## Objetivo
Un Tutor privado por expediente, con dos interfaces (Chat y Voz), respuestas concretas sin relleno,
respuesta progresiva en análisis largos y persistencia en Supabase, sin mezclar solicitantes.

**No prometer 0 ms**. Medir p50/p95 de cada camino para obtener respuesta percibida inmediata
cuando haya un dato verificado y mostrar primer token temprano cuando dependa de IA.

## Arquitectura de dos procesos

### Preparación, una vez por archivo (asíncrona)

Subir PDF/foto -> Supabase Storage privado -> registrar metadatos ->
encolar una tarea idempotente con `case_id, document_id, content_hash, version` ->
worker procesa SOLO el archivo autorizado ->
PDF texto u OCR/visión según contenido -> normalización ->
1) candidatas de ficha del expediente con fuente y estado `pending_review`,
2) fragmentos con documento, página/posición y texto -> índice FTS GIN,
3) embeddings opcionales pgvector solo si FTS no recupera suficiente ->
marcar `ready` tras validación de integridad.

La UI muestra `Pendiente / Procesando / Listo / Error`. No bloquear una pregunta
mientras se prepara el índice: analizar directamente el PDF como respaldo.

**Gasto:** cola indexadora solo al habilitar "Preparación automática" bajo un
presupuesto explícito por cliente/expediente. Deduplicar por hash y versión;
no indexar de nuevo en cada consulta. Nunca activar automáticamente OCR pagado
sin cuota/consentimiento. Los trabajos de larga duración deben ejecutarse
en workers durables (no en el request del navegador).

### Consulta (sincronizada, con menos saltos)

Chat/Voz -> Auth/JWT -> comprobar propiedad o membresía (RLS) ->
router ligero, preferiblemente determinista ->

A. Dato estructurado y verificado, sin ambigüedad:
 consulta indexada `case_facts` -> respuesta con solo el valor solicitado.
 No llamar a Gemini; no citar fuentes salvo petición.

B. Texto ya indexado y pregunta extractiva:
 buscar fragmentos y valor único inequívoco; si falta seguridad,
 NO adivinar, enviar ruta C. Nunca inferir un dato crítico por semejanza lexical.

C. Pregunta compleja, revisión, contradicciones:
 buscar top-k documentos/fragments según caso y permiso ->
 1 sola llamada Gemini Flash con SSE ->
 emitir desde el primer fragmento -> persistir respuesta completa ->
 verificación selectiva solo si contradicción/riesgo/consulta jurídica.

D. Índice no preparado: fallback al PDF privado seleccionado, con la misma RLS.

La voz del navegador actual es STT -> ruta A/B/C -> TTS. Para modo dúplex en
tiempo real requeriría una integración distinta; no equivale al Gemini Live general.

## Componentes lógicos recomendados (NO cuatro LLM independientes)
- **Router**: decisiones económicas tipo `fact`, `extract`, `analyze`, `verify`.
- **Memoria de hechos**: datos estructurados, origen, versión, verificación.
- **Recuperador**: FTS con GIN ya implementado; ranking, paráfrasis y semántico posterior.
- **Tutor**: modelo generador único; streaming; longitud según complejidad.
- **Verificador selectivo**: comparación contra fuente documental ante dudas;
  no se ejecuta en todas las preguntas.

## Esquema de nuevas estructuras (fase siguiente; NO ejecutar este pseudocódigo)
- `applicant_case_facts(case_id, fact_key, value, source_document_id,
   source_page, verified_at, verification_status, version)` con RLS y FK.
- `applicant_case_document_versions(case_id, document_id, sha256, version,
   indexed_at, status, error_code)` o ampliar la tabla actual de jobs.
- `applicant_case_query_metrics(case_id, hashed_question_type, route,
   ttft_ms, total_ms, document_count, model_tokens)` sin preguntas ni PII.
- `applicant_case_answer_cache` SOLO para respuestas que puedan invalidarse
  por modificación de documentos/perfil; no almacenar verdades no verificadas.

## Prioridad de implementación

### P0: asegurar estado existente
- `npm run check` verde; validar SSE hasta el evento `done`.
- Validar `streamGenerateContent` y flags `STOP/MAX_TOKENS`.
- Confirmar SQL `chatmi-applicant-tutor-rag.sql` en proyecto ChatMi correcto.
- Probar RLS: un usuario de caso A no accede a B.
- Registrar sin PII `server_ms, retrieval_ms, model_ttft_ms, model_total_ms`.

### P1: consultas instantáneas verificadas
- Guardar hechos con procedencia y estado.
- Exponer lector autenticado de hechos verificados; detectar conflicto.
- Router determinista antes de tocar Storage o Gemini.
- Formato estricto de preguntas puntuales (solo valor, sin adornos).
- Invalidar hechos y cache al cambiar archivo/perfil.

### P2: automatización de ingestión
- La subida encola tarea automática bajo límites aceptados.
- Worker con reintentos acotados, hash idempotente y budget guard.
- Transcripción + extracción de hechos + fragmentación con página.
- Visualizar progreso y fallos sin bloquear Chat.
- Mantener almacenamiento privado; no copiar contenidos entre usuarios.

### P3: calidad y escalado
- Evaluación sobre 100 preguntas de prueba con documentos anonimizados.
- FTS más expansión bilingüe de consultas; índice semántico opcional.
- Verificación selectiva y pruebas adversariales de RLS/documentos maliciosos.
- Separación chat/voz del mismo expediente con una fuente de verdad.

## SLO propuestos para MEDIR, no compromisos garantizados
- Ruta A: objetivo interno p95 < 400 ms desde el backend tras autenticar.
- Ruta B extractiva: objetivo interno p95 < 1 s si índice caliente.
- Ruta C: medir TTFT (tiempo al primer texto visible) vs duración total,
  sin garantizar segundos antes de benchmark real.
- Medir también exactitud y ausencia de fugas entre expedientes.
- Datos no encontrados -> "No consta en los documentos consultados".
- Contradicción entre documentos -> "Hay datos contradictorios" y ofrecer
  detalle solo si el usuario lo pide.

## Archivos actuales
- `api/gemini.ts`: perfil + RAG con fallback + streaming y cuotas.
- `api/applicant-index.ts`: preparación manual autentificada.
- `src/components/ApplicantTutorChat.tsx`: dos modalidades y documentos.
- `supabase/setup/chatmi-applicant-tutor-rag.sql`: índice de fragmentos con RLS.
- `scripts/chatmi-core.test.mjs`: regresiones.

## Seguridad indispensable
Nunca usar `service_role` en frontend. JWT verificado en backend, RLS en todas
las rutas de lectura, escritura e indexación. No generar respuestas con hechos
pendientes de verificación. Tratar textos de PDF como datos, no instrucciones.
Limitar tasas, tamaños, coste por usuario, número de tareas concurrentes y
caducidad/retención acordada. Cumplir solicitud de baja y borrado de datos.
