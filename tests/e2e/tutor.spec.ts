// E2E family: the Tutor, end to end in a real browser, against an in-memory
// Supabase that really stores and returns every saved turn.
import type { Page } from '@playwright/test';
import { EXTENDED_QUESTIONS, EXTENDED_WELCOME, GENTLE_PAUSED, GENTLE_QUESTIONS, GENTLE_WELCOME } from '../../lib/tutor/gentlePractice';
import { expect, login, test } from './fixtures';
import { FakeDb, SPEECH_STUB } from './fake-db';

let db: FakeDb;

test.beforeEach(async ({ page, api }) => {
  void api; // installs the auth + /api fakes
  db = new FakeDb();
  await db.install(page);
  await page.addInitScript(SPEECH_STUB);
});

const practice = (page: Page) => page.getByRole('region', { name: 'Práctica Consular Amable' });
const progressBar = (page: Page) => practice(page).locator('.cm-tutor-interview-bar span');
const answerBox = (page: Page) => page.getByLabel('Tu respuesta de práctica');

async function openTutor(page: Page) {
  await login(page);
  await page.getByRole('button', { name: 'Tutor Personal' }).click();
  await expect(practice(page)).toBeVisible();
  await expect(answerBox(page)).toBeEnabled();
}

async function answer(page: Page, text: string) {
  const before = await progressBar(page).textContent();
  await answerBox(page).fill(text);
  await practice(page).getByRole('button', { name: 'Enviar respuesta' }).click();
  await expect(progressBar(page)).not.toHaveText(before ?? '');
}

const caseId = () => String(db.rows('applicant_cases')[0]?.id);
const modelTurns = () => db.messages(caseId()).filter((m) => m.role === 'model').map((m) => String(m.content));

test.describe('Tutor · Práctica Consular Amable', () => {
  test('un usuario nuevo entra y la práctica empieza sola, en un expediente privado', async ({ page, api }) => {
    await openTutor(page);

    await expect(page).toHaveURL(/\/tutor\/[0-9a-f-]{36}$/);
    expect(db.rows('applicant_cases')).toHaveLength(1);
    await expect(practice(page).getByText(GENTLE_WELCOME)).toBeVisible();
    await expect(practice(page).getByText(GENTLE_QUESTIONS[0].text)).toBeVisible();
    await expect(progressBar(page)).toHaveText('Pregunta 1 de 18 · Motivo del viaje');
    expect(modelTurns()).toEqual([GENTLE_WELCOME, GENTLE_QUESTIONS[0].text]);
    expect(api.pageErrors).toEqual([]);
  });

  test('responde las 18 preguntas por escrito y la práctica termina', async ({ page, api }) => {
    test.setTimeout(90_000);
    await openTutor(page);

    for (let i = 0; i < GENTLE_QUESTIONS.length; i++) {
      // "No" a familiares: el Tutor no debe preguntar si piensa visitarlos.
      if (i === 7) continue;
      await expect(progressBar(page)).toContainText(`Pregunta ${i + 1} de 18`);
      await answer(page, i === 6 ? 'No, no tengo familiares allá.' : `Respuesta de prueba ${i + 1}`);
    }

    await expect(progressBar(page)).toHaveText('Práctica concluida');
    await expect(practice(page).getByRole('button', { name: 'Repetir práctica' })).toBeVisible();
    expect(modelTurns()).not.toContain(GENTLE_QUESTIONS[7].text);
    const userTurns = db.messages(caseId()).filter((m) => m.role === 'user');
    expect(userTurns).toHaveLength(17);
    expect(api.pageErrors).toEqual([]);
  });

  test('al recargar la página sigue en la misma pregunta, sin empezar de nuevo', async ({ page, api }) => {
    await openTutor(page);
    await answer(page, 'Voy de vacaciones.');
    await answer(page, 'Nadie, viajo solo.');
    await expect(progressBar(page)).toContainText('Pregunta 3 de 18');

    await page.reload();

    await expect(progressBar(page)).toContainText('Pregunta 3 de 18');
    expect(modelTurns().filter((t) => t === GENTLE_WELCOME)).toHaveLength(1);
    expect(db.rows('applicant_cases')).toHaveLength(1);
    expect(api.pageErrors).toEqual([]);
  });

  test('pausar, usar el simulacro y volver: retoma la misma pregunta', async ({ page, api }) => {
    await openTutor(page);
    await answer(page, 'Turismo.');
    await expect(progressBar(page)).toContainText('Pregunta 2 de 18');

    await practice(page).getByRole('button', { name: 'Volver al Tutor' }).click();
    await expect(page.getByRole('region', { name: 'Tutor Personal — Chat y Voz' })).toBeVisible();
    expect(modelTurns().at(-1)).toBe(GENTLE_PAUSED);

    // Lo que el usuario hace en el simulacro documental queda en el mismo historial.
    db.insert('applicant_case_messages', { case_id: caseId(), role: 'model', content: '¿Cuál es el propósito según su DS-160?' });
    db.insert('applicant_case_messages', { case_id: caseId(), role: 'user', content: 'Visitar a mi hermana' });

    await page.getByRole('button', { name: 'Práctica tranquila' }).click();
    await expect(progressBar(page)).toContainText('Pregunta 2 de 18');
    await expect(practice(page).getByText(GENTLE_QUESTIONS[1].text).last()).toBeVisible();
    expect(api.pageErrors).toEqual([]);
  });

  test('práctica ampliada: 31 preguntas, se retoma al recargar y se puede volver a la esencial', async ({ page, api }) => {
    await openTutor(page);
    await answer(page, 'Turismo.');

    // Cambiar con una práctica empezada pide confirmación.
    page.once('dialog', (dialog) => void dialog.accept());
    await practice(page).getByRole('button', { name: 'Ampliada (31)' }).click();

    await expect(practice(page).getByRole('heading', { name: 'Práctica ampliada' })).toBeVisible();
    await expect(progressBar(page)).toHaveText('Pregunta 1 de 31 · La actividad y la cobertura');
    await expect(practice(page).getByText(EXTENDED_QUESTIONS[0].text)).toBeVisible();
    await expect(practice(page).getByText(/debe coincidir con el propósito real del viaje/).first()).toBeVisible();

    await answer(page, 'Foro Internacional de Periodismo, en Miami.');
    await answer(page, 'Del 10 al 12 de marzo, de 9 a 5.');
    await expect(progressBar(page)).toHaveText('Pregunta 3 de 31 · La actividad y la cobertura');

    await page.reload();
    await expect(progressBar(page)).toHaveText('Pregunta 3 de 31 · La actividad y la cobertura');
    expect(modelTurns().filter((t) => t === EXTENDED_WELCOME)).toHaveLength(1);

    page.once('dialog', (dialog) => void dialog.accept());
    await practice(page).getByRole('button', { name: 'Esencial (18)' }).click();
    await expect(progressBar(page)).toHaveText('Pregunta 1 de 18 · Motivo del viaje');
    await expect(practice(page).getByRole('button', { name: 'Esencial (18)' })).toHaveAttribute('aria-pressed', 'true');
    expect(api.pageErrors).toEqual([]);
  });

  test('práctica ampliada completa: responde las 31 y termina', async ({ page, api }) => {
    test.setTimeout(120_000);
    await openTutor(page);
    await practice(page).getByRole('button', { name: 'Ampliada (31)' }).click();
    for (let i = 0; i < EXTENDED_QUESTIONS.length; i++) {
      await expect(progressBar(page)).toContainText(`Pregunta ${i + 1} de 31`);
      await answer(page, 'No'); // en la ampliada un "No" nunca salta preguntas
    }
    await expect(progressBar(page)).toHaveText('Práctica concluida');
    expect(db.messages(caseId()).filter((m) => m.role === 'user')).toHaveLength(31);
    expect(api.pageErrors).toEqual([]);
  });

  test('omitir una pregunta avanza a la siguiente', async ({ page }) => {
    await openTutor(page);
    await practice(page).getByRole('button', { name: 'Omitir pregunta' }).click();
    await expect(progressBar(page)).toContainText('Pregunta 2 de 18');
    expect(db.messages(caseId()).some((m) => m.role === 'user' && m.content === 'Prefiero omitir esta pregunta.')).toBe(true);
  });

  test('si no se puede guardar, avisa y la pregunta sigue pendiente', async ({ page, api }) => {
    await openTutor(page);
    db.failures.set('applicant_case_messages:POST', 500);

    await answerBox(page).fill('Turismo.');
    await practice(page).getByRole('button', { name: 'Enviar respuesta' }).click();

    await expect(practice(page).getByRole('alert')).toHaveText('No se pudo guardar tu práctica. Inténtalo nuevamente.');
    await expect(progressBar(page)).toContainText('Pregunta 1 de 18');
    await expect(answerBox(page)).toHaveValue('Turismo.');

    db.failures.clear();
    await practice(page).getByRole('button', { name: 'Enviar respuesta' }).click();
    await expect(progressBar(page)).toContainText('Pregunta 2 de 18');
    expect(api.pageErrors).toEqual([]);
  });

  test('si falla al abrir, el botón Reintentar recupera la práctica sin duplicarla', async ({ page, api }) => {
    db.failures.set('applicant_case_messages:POST', 500);
    await login(page);
    await page.getByRole('button', { name: 'Tutor Personal' }).click();

    await expect(practice(page).getByRole('alert')).toBeVisible();
    db.failures.clear();
    await practice(page).getByRole('button', { name: 'Reintentar' }).click();

    await expect(progressBar(page)).toHaveText('Pregunta 1 de 18 · Motivo del viaje');
    expect(modelTurns()).toEqual([GENTLE_WELCOME, GENTLE_QUESTIONS[0].text]);
    expect(api.pageErrors).toEqual([]);
  });

  test('por voz: el Tutor pregunta en voz alta, escucha y avanza solo', async ({ page, api }) => {
    await openTutor(page);
    await practice(page).getByRole('button', { name: '🎙 Iniciar voz' }).click();

    // El Tutor lee la pregunta y después abre el micrófono.
    await expect.poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken)).toContain(GENTLE_QUESTIONS[0].text);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __micStarts?: number }).__micStarts ?? 0)).toBeGreaterThan(0);

    await page.evaluate(() => (window as unknown as { __mic: { say(t: string): void } }).__mic.say('Voy a un congreso médico'));
    await expect(practice(page).getByText('Escuché: Voy a un congreso médico')).toBeVisible();

    // Tras una breve pausa de silencio la respuesta se guarda y llega la siguiente pregunta.
    await expect(progressBar(page)).toContainText('Pregunta 2 de 18', { timeout: 5000 });
    expect(db.messages(caseId()).some((m) => m.role === 'user' && m.content === 'Voy a un congreso médico')).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken)).toContain(GENTLE_QUESTIONS[1].text);
    expect(api.pageErrors).toEqual([]);
  });
});

test.describe('Tutor · Simulacro con documentos', () => {
  const QUESTIONS = [
    { id: 'identity', skill: 'identity', title: 'Identidad', method: 'exact', question: '¿Cómo te llamas?', expected: 'Ana Pérez Gómez', source: 'DS-160.pdf', status: 'document', explanation: '' },
    { id: 'passport', skill: 'passport', title: 'Pasaporte', method: 'exact', question: '¿Cuál es tu número de pasaporte?', expected: 'RD1234567', source: 'DS-160.pdf', status: 'document', explanation: '' },
    { id: 'purpose', skill: 'purpose', title: 'Propósito', method: 'explanation', question: '¿Cuál es el propósito de tu viaje?', expected: null, source: null, status: 'practice', explanation: '' },
  ];

  test.beforeEach(async ({ page }) => {
    const owned = db.insert('applicant_cases', { owner_id: '11111111-1111-4111-8111-111111111111', applicant_name: 'Ana Pérez' });
    const doc = db.insert('applicant_case_documents', { case_id: owned.id, filename: 'DS-160.pdf', mime_type: 'application/pdf', storage_path: `${owned.id}/ds160.pdf` });
    db.insert('applicant_case_index_jobs', { case_id: owned.id, document_id: doc.id, status: 'ready' });

    await page.route('**/api/applicant-simulator', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ questions: QUESTIONS, alerts: [], excluded: [], unindexed: [] }) }));
    await page.route('**/api/gemini', (route) => {
      const body = route.request().postDataJSON() as { caseId?: string; documentIds?: string[] };
      expect(body.caseId).toBe(owned.id);
      expect(body.documentIds).toEqual([doc.id]);
      const frames = [
        { type: 'delta', text: 'Según tu DS-160, ' },
        { type: 'delta', text: 'viajas para un congreso de periodismo.' },
        { type: 'done', complete: true },
      ];
      return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: frames.map((f) => JSON.stringify(f)).join('\n') + '\n' });
    });
  });

  const tutor = (page: Page) => page.getByRole('region', { name: 'Tutor Personal — Chat y Voz' });
  const reply = async (page: Page, text: string) => {
    await tutor(page).getByLabel('Responder al entrevistador').fill(text);
    await tutor(page).getByRole('button', { name: 'Enviar respuesta' }).click();
  };

  test('entrevista completa: acepta, pide aclarar lo que no coincide y termina', async ({ page, api }) => {
    await openTutor(page);
    await practice(page).getByRole('button', { name: 'Volver al Tutor' }).click();

    await expect(tutor(page).getByText(QUESTIONS[0].question)).toBeVisible();
    await expect(tutor(page).locator('.cm-tutor-interview-bar span')).toContainText('módulo 1/3');

    await reply(page, 'Ana Pérez');
    await expect(tutor(page).getByText(QUESTIONS[1].question)).toBeVisible();

    // Un pasaporte distinto al del documento no se da por bueno.
    await reply(page, 'RD9999999');
    await expect(tutor(page).getByText(/El documento aportado indica: RD1234567/)).toBeVisible();
    await expect(tutor(page).locator('.cm-tutor-interview-bar span')).toContainText('módulo 2/3');

    await reply(page, 'Mi pasaporte es RD1234567');
    await expect(tutor(page).getByText(QUESTIONS[2].question)).toBeVisible();

    await reply(page, 'Voy a cubrir un congreso de periodismo');
    await expect(tutor(page).getByText('Simulacro concluido.', { exact: false })).toBeVisible();
    await expect(tutor(page).getByRole('button', { name: 'Iniciar simulacro', exact: true })).toBeVisible();

    const saved = db.messages(caseId()).filter((m) => m.role === 'user').map((m) => m.content);
    expect(saved).toEqual(['Ana Pérez', 'RD9999999', 'Mi pasaporte es RD1234567', 'Voy a cubrir un congreso de periodismo']);
    expect(api.pageErrors).toEqual([]);
  });

  test('al recargar a mitad del simulacro retoma la misma pregunta', async ({ page, api }) => {
    await openTutor(page);
    await practice(page).getByRole('button', { name: 'Volver al Tutor' }).click();
    await reply(page, 'Ana Pérez');
    await expect(tutor(page).getByText(QUESTIONS[1].question)).toBeVisible();
    // The next question is shown immediately and saved right after; reload
    // only once the answer and the new question are really stored.
    await expect.poll(() => db.messages(caseId()).map((m) => m.content)).toContain(QUESTIONS[1].question);

    await page.reload();
    // La práctica amable se abre primero; al volver, el simulacro sigue donde estaba.
    await practice(page).getByRole('button', { name: 'Volver al Tutor' }).click();
    await expect(tutor(page).locator('.cm-tutor-interview-bar span')).toContainText('módulo 2/3');
    const asked = db.messages(caseId()).filter((m) => m.content === QUESTIONS[0].question);
    expect(asked).toHaveLength(1);
    expect(api.pageErrors).toEqual([]);
  });

  test('consulta libre sobre los documentos: la respuesta llega en streaming y se guarda', async ({ page, api }) => {
    await openTutor(page);
    await practice(page).getByRole('button', { name: 'Volver al Tutor' }).click();
    await expect(tutor(page).getByText(QUESTIONS[0].question)).toBeVisible();
    await tutor(page).getByRole('button', { name: 'Pausar simulacro' }).click();

    await tutor(page).getByLabel('Preguntar sobre los documentos').fill('¿Para qué viajo según mis documentos?');
    await tutor(page).getByRole('button', { name: 'Enviar respuesta' }).click();

    await expect(tutor(page).getByText('Según tu DS-160, viajas para un congreso de periodismo.')).toBeVisible();
    await expect.poll(() => db.messages(caseId()).at(-1)?.content).toBe('Según tu DS-160, viajas para un congreso de periodismo.');
    expect(api.pageErrors).toEqual([]);
  });
});

test.describe('Tutor · Gestión y privacidad del expediente', () => {
  const OTHER_USER = '99999999-9999-4999-8999-999999999999';
  const tutor = (page: Page) => page.getByRole('region', { name: 'Tutor Personal — Chat y Voz' });

  async function openDocumentTutor(page: Page) {
    await openTutor(page);
    await practice(page).getByRole('button', { name: 'Volver al Tutor' }).click();
    await expect(tutor(page)).toBeVisible();
  }
  const manager = async (page: Page) => {
    await tutor(page).getByText('Gestionar expediente').click();
    return tutor(page).locator('.cm-tutor-case-manager');
  };

  test('el dueño elimina un documento: se borra el archivo y su registro', async ({ page, api }) => {
    const owned = db.insert('applicant_cases', { owner_id: '11111111-1111-4111-8111-111111111111', applicant_name: 'Ana Pérez' });
    db.insert('applicant_case_documents', { case_id: owned.id, filename: 'pasaporte.pdf', mime_type: 'application/pdf', storage_path: `${owned.id}/u/pasaporte.pdf` });
    await openDocumentTutor(page);

    page.once('dialog', (dialog) => void dialog.accept());
    await tutor(page).getByText(/^Documentos \(1\)/).click();
    await tutor(page).getByRole('button', { name: 'Eliminar pasaporte.pdf' }).click();

    await expect(tutor(page).getByText('Documento eliminado.')).toBeVisible();
    await expect(tutor(page).getByText(/^Documentos \(0\)/)).toBeVisible();
    expect(db.removedObjects).toEqual([`${owned.id}/u/pasaporte.pdf`]);
    expect(db.rows('applicant_case_documents')).toHaveLength(0);
    expect(api.pageErrors).toEqual([]);
  });

  test('eliminar el expediente exige escribir el nombre exacto y lo borra todo', async ({ page, api }) => {
    const owned = db.insert('applicant_cases', { owner_id: '11111111-1111-4111-8111-111111111111', applicant_name: 'Ana Pérez' });
    db.insert('applicant_case_documents', { case_id: owned.id, filename: 'ds160.pdf', mime_type: 'application/pdf', storage_path: `${owned.id}/u/ds160.pdf` });
    await openDocumentTutor(page);
    const panel = await manager(page);
    const deleteButton = panel.getByRole('button', { name: 'Eliminar expediente definitivamente' });

    await expect(deleteButton).toBeDisabled();
    await panel.getByLabel(/Para eliminar definitivamente/).fill('ana perez');
    await expect(deleteButton).toBeDisabled();
    await panel.getByLabel(/Para eliminar definitivamente/).fill('Ana Pérez');
    await deleteButton.click();

    // El expediente, sus archivos y su historial desaparecen...
    await expect.poll(() => db.rows('applicant_cases').some((c) => c.id === owned.id)).toBe(false);
    expect(db.removedObjects).toEqual([`${owned.id}/u/ds160.pdf`]);
    expect(db.messages(String(owned.id))).toHaveLength(0);
    // ...y el usuario empieza en una práctica nueva y vacía, no en el expediente borrado.
    await expect(practice(page)).toBeVisible();
    await expect(progressBar(page)).toHaveText('Pregunta 1 de 18 · Motivo del viaje');
    await expect(page).not.toHaveURL(new RegExp(String(owned.id)));
    expect(db.rows('applicant_cases')).toHaveLength(1);
    expect(api.pageErrors).toEqual([]);
  });

  test('borrar el expediente creado automáticamente da paso a uno NUEVO, no al borrado', async ({ page, api }) => {
    await openDocumentTutor(page); // la app creó «Práctica consular» en esta visita
    const first = caseId();
    const panel = await manager(page);
    await panel.getByLabel(/Para eliminar definitivamente/).fill('Práctica consular');
    await panel.getByRole('button', { name: 'Eliminar expediente definitivamente' }).click();

    await expect(practice(page)).toBeVisible();
    await expect(progressBar(page)).toHaveText('Pregunta 1 de 18 · Motivo del viaje');
    await expect.poll(() => db.rows('applicant_cases').map((c) => c.id)).not.toContain(first);
    expect(db.rows('applicant_cases')).toHaveLength(1);
    await expect(page).toHaveURL(new RegExp(`/tutor/${caseId()}$`));
    expect(api.pageErrors).toEqual([]);
  });

  test('el dueño crea una invitación y ve el código para compartirlo', async ({ page, api }) => {
    await openDocumentTutor(page);
    const panel = await manager(page);
    await panel.getByLabel('Correo a invitar').fill('asesor@example.com');
    await panel.getByLabel('Rol de la persona invitada').selectOption('advisor');
    await panel.getByRole('button', { name: 'Crear invitación' }).click();

    await expect(panel.getByLabel('Código de invitación generado')).toHaveValue('a'.repeat(48));
    expect(db.tutorApiCalls.at(-1)).toEqual({ action: 'invite', caseId: caseId(), email: 'asesor@example.com', role: 'advisor' });
    expect(api.pageErrors).toEqual([]);
  });

  test('un invitado acepta el código, ve el expediente compartido y puede salir de él', async ({ page, api }) => {
    const shared = db.insert('applicant_cases', { owner_id: OTHER_USER, applicant_name: 'Caso de Luis' });
    db.insert('applicant_case_invites', { case_id: shared.id, code: 'b'.repeat(48) });
    await openDocumentTutor(page);

    let panel = await manager(page);
    await panel.getByLabel('Código de invitación recibido').fill('b'.repeat(48));
    await panel.getByRole('button', { name: 'Aceptar invitación' }).click();

    await expect(page).toHaveURL(new RegExp(`/tutor/${shared.id}$`));

    // Al abrir el compartido arranca su práctica; volvemos al Tutor para gestionarlo.
    await practice(page).getByRole('button', { name: 'Volver al Tutor' }).click();
    panel = await manager(page);
    await expect(panel.getByRole('button', { name: 'Eliminar expediente definitivamente' })).toHaveCount(0);
    await panel.getByRole('button', { name: 'Salir de este expediente compartido' }).click();
    await panel.getByRole('button', { name: 'Sí, salir' }).click();

    await expect.poll(() => db.rows('applicant_case_members').length).toBe(0);
    await expect(page).not.toHaveURL(new RegExp(String(shared.id)));
    expect(db.rows('applicant_cases').some((c) => c.id === shared.id)).toBe(true); // el del dueño sigue intacto
    expect(api.pageErrors).toEqual([]);
  });

  test('un código inválido muestra el motivo y no cambia de expediente', async ({ page }) => {
    await openDocumentTutor(page);
    const before = page.url();
    const panel = await manager(page);
    await panel.getByLabel('Código de invitación recibido').fill('c'.repeat(48));
    await panel.getByRole('button', { name: 'Aceptar invitación' }).click();
    await expect(tutor(page).getByRole('alert')).toHaveText('Invitación vencida o no destinada a tu cuenta.');
    expect(page.url()).toBe(before);
  });
});

test('Tutor · seguimiento: crear una tarea y marcarla como completada', async ({ page, api }) => {
  await openTutor(page);
  await practice(page).getByRole('button', { name: 'Volver al Tutor' }).click();
  const tutor = page.getByRole('region', { name: 'Tutor Personal — Chat y Voz' });
  await tutor.locator('summary', { hasText: 'Tareas pendientes' }).click();

  await tutor.getByLabel('Nueva tarea').fill('Pedir carta laboral');
  await tutor.getByRole('button', { name: 'Guardar pendiente' }).click();
  await expect(tutor.getByText('Pedir carta laboral')).toBeVisible();

  await tutor.getByLabel('Estado de Pedir carta laboral').selectOption('completed');
  await expect.poll(() => db.rows('applicant_case_tasks')[0]?.status).toBe('completed');
  expect(db.rows('applicant_case_tasks')[0]).toMatchObject({ case_id: caseId(), title: 'Pedir carta laboral' });
  expect(api.pageErrors).toEqual([]);
});
