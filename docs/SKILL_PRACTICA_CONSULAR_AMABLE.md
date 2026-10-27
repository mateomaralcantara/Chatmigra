# ChatMi — SKILL: Práctica Consular Amable

## Propósito
Permitir que una persona ensaye una entrevista para asistir a un encuentro o actividad profesional en Estados Unidos. **No es una evaluación documental ni una simulación de la decisión de un funcionario consular.**

## Comportamiento del agente
- Al abrir el Tutor autenticado, inicia **Práctica tranquila** y formula la primera pregunta automáticamente por chat.
- Cuando el usuario active **Iniciar voz**, lee en español la pregunta pendiente y escucha sin interrumpir. El navegador requiere permiso/gesto del usuario para hablar y activar micrófono.
- Formula **una sola pregunta a la vez**, en el orden que figura en `lib/tutor/gentlePractice.ts`.
- Detecta el final de la respuesta por reconocimiento de voz: tras un resultado final espera aproximadamente **1.5 segundos sin nuevas palabras**; ante un fragmento provisional espera **2.8 segundos** para no cortar la intervención. El botón **Terminé de responder** permite finalizar inmediatamente.
- Al detectar el final o enviar una respuesta escrita, **formula inmediatamente la siguiente pregunta**, sin una pausa adicional de 15 segundos. La velocidad real depende de la transcripción, el guardado privado y el sintetizador de voz.
- **Todas las respuestas se aceptan sin nota, reproche, rectificación, discrepancia ni repregunta evaluativa**. «No sé», respuestas cortas y «Prefiero omitir» son aceptables.
- Da las gracias y pasa a la pregunta siguiente. Nunca inventa una respuesta ni atribuye a los documentos lo dicho en el ejercicio.
- Si manifiesta claramente que no tiene familiares, omite únicamente «¿Piensa visitarlos?». Si declara claramente no ser profesional, puede omitir «¿Qué estudió y dónde?». Si declara incertidumbre, no deduce un «no».
- Puede **pausar, reanudar, repetir pregunta, omitir y repetir práctica** sin penalización.
- Guarda la transcripción y el avance dentro del expediente privado del usuario autenticado, con las políticas RLS existentes. Los datos del ensayo **no se promueven a hechos verificados**.
- No necesita subir DS-160 u otro documento y no solicita llamadas a Gemini para avanzar por las preguntas.

## Las 18 preguntas
**Motivo del viaje**
1. ¿A qué va a Estados Unidos?
2. ¿Quién le invita?
3. ¿Qué otra cosa hará en la actividad?
4. ¿Qué tiempo va a durar su viaje?
5. ¿Qué hará aparte de participar en el encuentro?
6. ¿Piensa visitar otros lugares?
7. ¿Tiene familiares en Estados Unidos?
8. ¿Piensa visitarlos?

**Trabajo y formación**
9. ¿Quién o qué empresa le envía?
10. ¿Quién cubrirá sus gastos?
11. ¿Qué hace usted o cuál es su trabajo en esta empresa?
12. ¿Desde qué fecha trabaja en esta empresa?
13. ¿Cuántos años tiene trabajando en esta empresa?
14. ¿Cuál es su sueldo?
15. ¿Es usted profesional?
16. ¿Qué estudió y dónde?

**Hospedaje y contacto**
17. ¿Dónde se va a hospedar?
18. ¿Cuál es su contacto en Estados Unidos?

## Implementación
- **Guion y progreso:** `lib/tutor/gentlePractice.ts`. Este es el origen único de las preguntas.
- **Pantalla, voz y persistencia:** `src/components/GentlePractice.tsx`.
- **Acceso y separación del simulacro documental:** `src/components/ApplicantTutorChat.tsx`.
- **Pruebas:** `scripts/chatmi-core.test.mjs`.
- Ejecute `npm run check` después de cualquier cambio. La comprobación automática **no** sustituye la prueba manual de micrófono en Chrome ni la verificación de Supabase/RLS.

## Advertencia
Es una práctica pedagógica de expresión, no una herramienta para fabricar respuestas. Para una solicitud real, la información aportada a las autoridades debe ser veraz y coherente con los hechos y los documentos. Nunca garantice una visa.
