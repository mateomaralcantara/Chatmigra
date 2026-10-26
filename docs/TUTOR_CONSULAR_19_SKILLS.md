# ChatMi · Tutor Consular con 19 skills documentales

**Estado:** funcionalidad codificada en rama de desarrollo; activar después de \`npm run check\`
y las pruebas de documentos, RLS, Chat y Voz. No subir expedientes reales a GitHub.

## Flujo de aprendizaje dirigido

Documentos privados autorizados → indexar una sola vez con cuota consentida
→ validar identidad del solicitante por documento → reconstruir evidencia
→ detectar contradicciones → construir plan de 19 skills
→ Tutor pregunta → solicitante responde por Chat/Voz
→ evaluador determinista clasifica → feedback específico
→ si respuesta incorrecta, repregunta (hasta dos reintentos)
→ si persiste desacuerdo, marca para revisión y continúa
→ guardar pregunta, respuesta y corrección en historial RLS del caso.

Ningún módulo corrige la realidad para hacerla coincidir con un DS-160:
si un hecho cambió, el Tutor pide verificar y actualizar el expediente.
Una respuesta sobre propósito migratorio debe reflejar hechos verdaderos.

### Skills y método de evaluación

| # | Skill | Estrategia |
|---|---|---|
| 01 | Identificación personal | Coincidencia de nombres con orden intercambiable |
| 02 | Nacimiento y nacionalidad | Comparador bilingüe de fechas |
| 03 | Pasaporte y vigencia | Valor documental exacto; repregunta |
| 04 | Categoría migratoria | Equivalencias semánticas limitadas y seguras |
| 05 | Propósito del viaje | Coherencia con categoría declarada, explicación libre |
| 06 | Invitación y organizador | Organización, actividad, documento correspondiente |
| 07 | Fechas y cronología | Llegada declarada versus itinerario |
| 08 | Duración y retorno | Fecha de salida y consistencia |
| 09 | Alojamiento y contacto | Contacto y localización registrados |
| 10 | Financiamiento | Origen de fondos y equivalencias válidas |
| 11 | Ocupación actual | Función declarada y vocabulario comprensible |
| 12 | Empleador y responsabilidades | Empleador, funciones y consistencia |
| 13 | Actividad periodística verificable | Diferenciar congreso/encuentro de misión de prensa real |
| 14 | Formación académica | Estudios declarados y evidencia |
| 15 | Familia y vínculos | Familiares en EE. UU. y declaraciones previas |
| 16 | Antecedentes migratorios | Rechazos y antecedentes con respeto a los hechos |
| 17 | Coherencia entre documentos | Identidad y contradicciones, sin inventar |
| 18 | Repreguntas imprevistas | Claridad bajo presión y evidencia |
| 19 | Cierre y rectificaciones | Cambios importantes antes de comparecencia |

Los módulos no son 19 LLM con facturación individual. Son 19 flujos de
evaluación sobre un solo expediente. Cada pregunta tiene método, fuente,
dato de referencia (si consta), corrección y política de repregunta.

## Capas de la arquitectura

**Capa 1 — Autenticación y RLS:** API \`/api/applicant-simulator\`,
caso y documentos comprobados mediante JWT; fragmentos RAG con consultas
realizadas con el cliente autenticado. Nunca combinar casos ni consultar
datos de otra persona. Reutilizar los chunks existentes. Máximo
30 archivos indexados por carga del simulacro.

**Capa 2 — Cotejo de identidad:** el documento debe coincidir de manera
suficiente con los tokens del nombre del aplicante. La carta destinada
a otra persona se excluye del entrenamiento y se muestra una alerta.
Esto es conservador: una carta sin nombre claro puede requerir revisión
manual para incorporarla en el futuro.

**Capa 3 — Recuperación de evidencia:** leer en paralelo por documento
y construir valores textuales por campo, con nombre de fuente. Si no se
localiza un campo, etiquetar la pregunta como práctica, no como un hecho
conocido. El texto extraído no equivale a dato gubernamental verificado.

**Capa 4 — Motor de skill:** ruta determinista sin llamada Gemini
durante el simulacro. La pregunta sale del plan y su campo documental,
si existe. Soporta nombres reordenados, meses inglés/español y
equivalencia limitada de categoría I.

**Capa 5 — Evaluador:** resultados \`correct\`, \`retry\`, \`clarify\`,
\`review\`. Respuesta errónea → informa dato del documento y
pregunta otra vez. Dato contradictorio o declaración actual distinta
→ pide revisar el formulario y NO dicta una narrativa falsa. Máximo
dos reintentos. Preguntas narrativas reciben consejo de claridad;
sin un verificador semántico profundo no pueden calificarse como
verdad demostrada por mera fluidez verbal.

**Capa 6 — Orquestación multimodal:** mismo simulacro en Chat y Voz.
La voz del navegador pronuncia y reconoce sin costo por turno de Gemini.
Las respuestas se registran en \`applicant_case_messages\` existente.
No es una voz dúplex que pueda garantizar interrupciones sin latencia.

**Capa 7 — Transparencia:** mostrar las discrepancias y documentos
descartados. La ficha debe ofrecer una intervención humana para
resolver errores del documento y cambiar datos reales.

**Capa 8 — Medición futura:** registrar mediana/p95, precisión de
comparadores, preguntas repetidas y errores de reconocimiento
sin almacenar PII extra. 2x es objetivo, no benchmark confirmado.

## Ejemplo sintético de contradicción

- Solicitud: viaje entre septiembre y final de septiembre.
- Invitación con nombre coincidente: congreso en diciembre.
- Invitación con nombre diferente: evento en octubre.

El Tutor **excluye la invitación de identidad diferente**.
Con las dos restantes alerta: evento fuera de las fechas declaradas.
Pregunta por el itinerario real y requiere actualizar documentos
antes de memorizar fechas. Jamás aconseja inventar fechas o cargos.

## Activación y pruebas

1. \`git pull --ff-only origin feat/tutor-expediente-seguimiento-20261025\`.
2. \`npm run check\` (tipo, pruebas automatizadas, build).
3. Verifica que SQL del Tutor + RAG + memoria esté ya aplicado
   en el Supabase de ChatMi; no se necesita SQL adicional para el
   simulador actual.
4. \`npx --yes vercel@65.2.0 dev --listen 3000 --scope monseoweb-project\`.
5. Abre \`http://localhost:3000/tutor\`, accede al expediente privado y
   pulsa \`Preparar búsqueda rápida\` para documentos no indexados.
6. Pulsa \`Simulacro consular (19 módulos)\`.
7. Contesta bien una fecha, luego deliberadamente incorrecta; espera
   feedback documentado y repregunta, con máximo dos reintentos.
8. Prueba en Voz, incluyendo respuestas breves. Comprueba que las
   cartas dirigidas a otras personas no entren en preguntas del aplicante.
9. Abre un segundo caso desde otra sesión: prueba que no pueda consultar
   el simulacro del primero por API con su identificador.
10. Si hay errores de TypeScript, tests, navegador o RLS, no marcar
    la experiencia como completamente validada hasta corregirlos.

## Limitaciones reales

- La generación de preguntas se basa en fragmentos **ya indexados**:
  la preparación puede consumir tokens una sola vez con el consentimiento
  y cuota existentes; no se habilita OCR automático pagado.
- Texto sin identificación personal suficiente queda apartado para evitar
  mezcla de solicitantes; se requiere una función futura de vinculación
  manual verificada.
- Se comparan datos exactos y algunas explicaciones breves, no se realiza
  arbitraje jurídico automático ni evaluación universal de semántica.
  Habría que añadir una rúbrica LLM controlada con citas y presupuesto
  si se requiere evaluación profunda de relatos extensos.
- No se garantiza aprobación de visa ni sustituye la revisión consular
  o la actualización auténtica del DS-160.
