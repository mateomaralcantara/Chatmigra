# ChatMi · Activación del Tutor RAG privado

## Requisitos

1. Activar primero `supabase/setup/chatmi-applicant-tutor.sql` **solo si todavía no se instaló**.
2. En el **mismo proyecto Supabase que utiliza ChatMi** ejecutar `supabase/setup/chatmi-applicant-tutor-rag.sql` desde SQL Editor.
3. Mantener `SUPABASE_SERVICE_ROLE_KEY` y `GEMINI_API_KEY` exclusivamente en el servidor; nunca publicarlas en Vite.

## Uso

- Inicia sesión en ChatMi y abre `/tutor`.
- Selecciona un expediente privado existente o crea uno.
- Adjunta PDF, JPG, PNG o WebP (máximo 2 MB por archivo).
- Selecciona hasta cuatro documentos y pulsa **⚡ Preparar búsqueda rápida**.
- Espera la confirmación `✓ listo` por cada archivo; esta operación transcribe con Gemini una vez y consume cuota de IA.
- Después pregunta en **Chat** o **Voz**; ChatMi recupera fragmentos relevantes del índice y transmite la respuesta progresivamente.

## Comportamiento de respaldo y seguridad

- Si faltan tablas RAG, faltan documentos preparados o hay una extracción incompleta, **no se inventa un índice**; las consultas siguen mediante el análisis directo de PDF.
- Los fragmentos transcritos por IA pueden contener errores de lectura; verificar datos sensibles contra el documento original.
- Los índices se guardan en filas privadas con RLS. Eliminar el documento asociado elimina sus fragmentos y la tarea de indexación mediante `ON DELETE CASCADE` (el archivo original se gestiona aparte en Storage).
- El endpoint `/api/applicant-index` solo acepta usuarios autenticados y verifica el acceso RLS al documento; la clave `service_role` no sale al navegador.
- Un documento demasiado largo para transcribirse íntegramente no se declara indexado.
- Para evitar cargos duplicados, una preparación ya finalizada se reutiliza; los reintentos fallidos tienen enfriamiento de una hora.
- Indexar puede generar cargos por tokens. El plan gratuito usa la cuota controlada en el servidor.

## Verificaciones

```powershell
npm run check
npx --yes vercel@65.2.0 dev --listen 3000 --scope monseoweb-project
```

Comprobar que las respuestas llegan en streaming, que `✓ listo` aparece tras indexar y que dos expedientes distintos no comparten fragmentos. Verificar también que un documento eliminado deja de aparecer en los resultados.

### Nota
Los cambios del repositorio **no ejecutan SQL remotamente**. Si el proyecto Supabase de ChatMi no está conectado, las tablas deben instalarse manualmente en el proyecto correcto antes de probar el índice.
