import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(path, 'utf8');

test('single canonical entrypoint is used', () => {
  assert.equal(fs.existsSync('src/main.tsx'), false);
  assert.match(read('index.html'), /src="\/index\.tsx"/);
});

test('single canonical AuthWrapper is used', () => {
  assert.equal(fs.existsSync('src/AuthWrapper.tsx'), false);
  assert.doesNotMatch(read('AuthWrapper.tsx'), /chatmig_session/);
  assert.match(read('AuthWrapper.tsx'), /supabase\.auth\.getSession/);
});

test('Gemini stays server-side and uses authenticated requests', () => {
  const service = read('src/services/geminiService.ts');
  const api = read('api/gemini.ts');

  assert.doesNotMatch(service, /VITE_GEMINI_API_KEY/);
  assert.match(service, /Authorization:/);
  assert.match(api, /GEMINI_API_KEY/);
  assert.match(api, /requireAuthenticatedUser/);
  assert.doesNotMatch(api, /req\.json\(/);
});

test('PayPal premium activation is server-authoritative', () => {
  const paymentSource = read('src/components/CambiarPlan.tsx');

  assert.match(paymentSource, /\/api\/paypal\/create-order/);
  assert.match(paymentSource, /\/api\/paypal\/capture-order/);
  assert.doesNotMatch(paymentSource, /actions\.order\.capture/);
  assert.doesNotMatch(paymentSource, /from\('subscriptions'\)/);
});

test('legacy standalone API server is removed', () => {
  assert.equal(fs.existsSync('api-server.mjs'), false);
});

test('Supabase migration exists for core tables and RLS', () => {
  const sql = read('supabase/migrations/202610230001_chatmi_core.sql');

  assert.match(sql, /create table if not exists public\.account_quotas/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /chatmi_reserve_tokens/i);
  assert.match(sql, /chatmi_finalize_tokens/i);
});


test('free Gemini requests require server-only, fail-closed quota enforcement', () => {
  const api = read('api/gemini.ts');
  assert.match(api, /getAdminSupabase\(\)/);
  assert.match(api, /chatmi_reserve_tokens_server/);
  assert.match(api, /chatmi_finalize_tokens_server/);
  assert.match(api, /QUOTA_SERVICE_UNAVAILABLE/);
  assert.doesNotMatch(api, /request allowed in degraded mode/);
  assert.doesNotMatch(api, /auth\.supabase\.rpc\('chatmi_/);
});

test('quota hardening revokes user-facing RPC access and uses idempotent reservations', () => {
  const sql = read('supabase/migrations/202610250001_chatmi_server_only_quotas.sql');
  assert.match(sql, /create table if not exists public\.chatmi_token_reservations/);
  assert.match(sql, /for update;/);
  assert.match(sql, /revoke all on function public\.chatmi_reserve_tokens\(integer\)/);
  assert.match(sql, /revoke all on function public\.chatmi_finalize_tokens\(integer, integer\)/);
  assert.match(sql, /grant execute on function public\.chatmi_reserve_tokens_server\(uuid, integer\)/);
  assert.match(sql, /grant execute on function public\.chatmi_finalize_tokens_server\(uuid, integer\)/);
  assert.doesNotMatch(sql, /drop table/i);
});


test('Gemini server routes cannot fall back to publicly prefixed secrets', () => {
  for (const path of ['api/gemini.ts', 'api/gemini-ephemeral-token.ts']) {
    const code = read(path);
    assert.match(code, /readServerEnv\('GEMINI_API_KEY'\)/);
    assert.doesNotMatch(code, /process\.env\.VITE_GEMINI_API_KEY/);
  }
});

test('production build does not publish source maps', () => {
  const viteConfig = read('vite.config.ts');
  assert.match(viteConfig, /sourcemap:\s*false/);
});

test('ChatMi uses a supported Gemini 3.8 Flash text model by default', () => {
  const api = read('api/gemini.ts');
  const example = read('.env.example');
  assert.match(api, /readServerEnv\('GEMINI_TEXT_MODEL'\) \|\| 'gemini-3\.8-flash'/);
  assert.match(example, /GEMINI_TEXT_MODEL=gemini-3\.8-flash/);
  assert.doesNotMatch(api, /temperature:\s*0\.35/);
});

test('API responses do not reveal raw upstream Google errors or key identifiers', () => {
  for (const path of ['api/gemini.ts', 'api/gemini-ephemeral-token.ts']) {
    const code = read(path);
    assert.doesNotMatch(code, /error: data\?\.error\?\.message/);
    assert.doesNotMatch(code, /console\.error\('\[gemini\]'[^;]*data\)/);
    assert.match(code, /GEMINI_.*ERROR/);
  }
});


test('color palettes remain readable on ChatMi light surfaces', () => {
  const global = read('src/index.css');
  const styles = read('src/styles/chatmi-ultimate.css');
  const shell = read('src/ui/PremiumShell.tsx');

  assert.doesNotMatch(global, /p,\s*\nspan,\s*\nli,/);
  assert.doesNotMatch(global, /color:\s*#f9fafb/);
  assert.doesNotMatch(global, /background-color:\s*#ffffff\s*!important/);

  assert.match(styles, /\.cm-reference-shell \.cm-suggestion-copy\s*\{\s*color:\s*var\(--cm-text\)/);
  assert.match(styles, /\.cm-reference-shell \.cm-rail-button/);

  for (const palette of ['classic', 'ocean', 'mint', 'violet']) {
    assert.match(shell, new RegExp("id: '" + palette + "'"));
  }
  assert.match(shell, /data-cm-theme=\{palette\}/);
  assert.match(shell, /aria-pressed=\{palette === option\.id\}/);
  assert.match(shell, /localStorage\.setItem\('chatmi:palette'/);
});

test('upgrade promotion has readable dark text over amber background', () => {
  const component = read('src/components/UpgradeTeaser.tsx');
  assert.match(component, /bg-amber-50 border border-amber-300 text-amber-950/);
});


test('long chat paragraphs are justified and response headings are large', () => {
  const markup = read('src/components/ChatMessage.tsx');
  const styles = read('src/styles/chatmi-ultimate.css');

  assert.match(markup, /className="cm-answer-title /);
  assert.match(markup, /className="cm-answer-body /);
  assert.match(markup, /className="cm-user-paragraph /);
  assert.match(styles, /\.cm-reference-shell \.cm-chat-thread \.cm-answer-body,/);
  assert.match(styles, /text-align:\s*justify;/);
  assert.match(styles, /text-justify:\s*inter-word;/);
  assert.match(styles, /\.cm-chat-thread \[data-role="assistant"\] \.cm-answer-title/);
  assert.match(styles, /font-size:\s*clamp\(25px, 2\.6vw, 35px\)\s*!important/);
  assert.match(styles, /\.cm-home-title\s*\{\s*font-size:\s*clamp\(32px, 3\.7vw, 48px\)/);
});


test('profile upload appears in both avatar buttons with authenticated storage', () => {
  const shell = read('src/ui/PremiumShell.tsx');
  const profile = read('src/ui/ProfilePhotoMenu.tsx');
  const sql = read('supabase/setup/chatmi-avatar-storage.sql');

  assert.match(shell, /<ProfilePhotoMenu position="rail"/);
  assert.match(shell, /<ProfilePhotoMenu position="top"/);
  assert.match(read('src/components/AccountDashboard.tsx'), /<ProfilePhotoMenu position="account"/);
  assert.match(profile, /Subir foto de perfil/);
  assert.match(profile, /Subir foto \(Upload\)/);
  assert.match(profile, /Guardar foto/);
  assert.match(profile, /supabase\.auth\.getUser\(\)/);
  assert.match(profile, /supabase\.auth\.updateUser\(/);
  assert.match(profile, /storage\.upload\(path, file,/);
  assert.match(profile, /const MAX_PHOTO_SIZE = 2 \* 1024 \* 1024/);
  assert.match(profile, /contentType: file\.type/);
  assert.match(profile, /upsert: false/);
  assert.doesNotMatch(profile, /SERVICE_ROLE_KEY/);

  assert.match(sql, /insert into storage\.buckets/);
  assert.match(sql, /file_size_limit/);
  assert.match(sql, /for insert\s+to authenticated/);
  assert.match(sql, /for delete\s+to authenticated/);
  assert.match(sql, /storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
  assert.doesNotMatch(sql, /on storage\.objects\s+for (?:all|insert)\s+using\s*\(\s*true\s*\)/i);
});


test('expediente button uploads PDF/images and invokes tutor', () => {
  const input = read('src/components/ChatInput.tsx');
  const app = read('src/App.tsx');
  const gemini = read('src/services/geminiService.ts');
  assert.match(input, /onClick=\{\(\) => fileInputRef\.current\?\.click\(\)\}/);
  assert.match(input, /Subir expediente migratorio/);
  assert.match(input, /className="cm-expediente-open"/);
  assert.match(input, /Subir expediente/);
  assert.match(input, /Tutor Migratorio/);
  assert.match(input, /accept="application\/pdf,image\/jpeg,image\/png,image\/webp"/);
  assert.match(input, /onAnalyzeDocument\(attachment, text\)/);
  assert.match(app, /const handleAnalyzeDocument = useCallback/);
  assert.match(app, /onAnalyzeDocument=\{handleAnalyzeDocument\}/);
  assert.match(app, /analyzeMigrationDocument\(file, question\)/);
  assert.doesNotMatch(app.slice(app.indexOf('const handleAnalyzeDocument'), app.indexOf('const stopVoiceAgent')), /persistUserMessage/);
  assert.match(gemini, /fetch\('\/api\/gemini'/);
  assert.match(gemini, /attachment: \{/);
});

test('tutor validates inline document and uses server-only Gemini key', () => {
  const api = read('api/gemini.ts');
  assert.match(api, /MAX_EXPEDIENTE_BYTES = 2 \* 1024 \* 1024/);
  assert.match(api, /function validateAttachment\(input: unknown\)/);
  assert.match(api, /bytes\.toString\('base64'\) !== data/);
  assert.match(api, /validPdf/);
  assert.match(api, /validJpeg/);
  assert.match(api, /validPng/);
  assert.match(api, /validWebp/);
  assert.match(api, /inlineData: \{ mimeType: attachment\.mimeType, data: attachment\.data \}/);
  assert.match(api, /Tutor Migratorio de ChatMi/);
  assert.match(api, /if \(hasExpediente\) return FREE_TOKENS_MAX/);
  assert.match(api, /'x-goog-api-key': apiKey/);
  assert.doesNotMatch(api, /:generateContent\?key=/);
  assert.match(api, /requireAuthenticatedUser\(req\)/);
});


test('admin chat also supports authenticated expediente analysis', () => {
  const admin = read('src/AdminApp.tsx');
  const input = read('src/components/ChatInput.tsx');
  assert.match(admin, /import \{ analyzeMigrationDocument, runChatStream \}/);
  assert.match(admin, /const handleAnalyzeAdminDocument = useCallback/);
  assert.match(admin, /analyzeMigrationDocument\(file, question\)/);
  assert.match(admin, /onAnalyzeDocument=\{handleAnalyzeAdminDocument\}/);
  assert.match(input, /onAnalyzeDocument: \(file: File, instructions: string\) => Promise<void>/);
});


test('Vercel dev server reads local server-only files without leaking production secrets', () => {
  const env = read('server/env.ts');
  const supabase = read('server/supabase.ts');
  const gemini = read('api/gemini.ts');
  const live = read('api/gemini-ephemeral-token.ts');
  assert.match(env, /process\.env\.NODE_ENV === 'production'/);
  assert.match(env, /process\.env\.VERCEL_ENV === 'production'/);
  assert.match(env, /process\.env\.VERCEL_ENV === 'preview'/);
  assert.match(env, /'\.env\.development\.local', '\.env\.local'/);
  assert.doesNotMatch(env, /'\.env'\]/);
  assert.match(env, /parse\(readFileSync\(resolve\(process\.cwd\(\), filename\)\)\)/);
  assert.match(supabase, /return readServerEnv\(name\)/);
  assert.match(gemini, /readServerEnv\('GEMINI_API_KEY'\)/);
  assert.match(live, /readServerEnv\('GEMINI_API_KEY'\)/);
  assert.doesNotMatch(read('src/services/geminiService.ts'), /readServerEnv/);
});


test('tutor shows HTTP failures including gateway 413 instead of silent generic errors', () => {
  const service = read('src/services/geminiService.ts');
  assert.match(service, /function expedienteApiError\(status: number, data: ChatApiResponse\)/);
  assert.match(service, /status === 413/);
  assert.match(service, /status === 503/);
  assert.match(service, /status === 401/);
  assert.match(service, /response\.headers\.get\('content-type'\)/);
  assert.match(service, /expedienteApiError\(response\.status, data\)/);
  assert.match(service, /console\.warn\('\[tutor-migratorio\] HTTP'/);
  assert.doesNotMatch(service, /console\.warn\([^;]*encoded/);
});


test('tutor streams full authenticated answers and flags incomplete generations', () => {
  const api = read('api/gemini.ts');
  const tutor = read('src/components/ApplicantTutorChat.tsx');
  assert.match(api, /:streamGenerateContent\?alt=sse/);
  assert.match(api, /application\/x-ndjson/);
  assert.match(api, /type: 'delta'/);
  assert.match(api, /type: 'done'/);
  assert.match(api, /finishReason === 'STOP'/);
  assert.match(api, /await finalizeQuota\(tokensToFinalize\)/);
  assert.match(api, /Promise\.all\(docs\.map\(async \(doc\)/);
  assert.match(api, /thinkingLevel: 'low'/);
  assert.match(api, /quickCaseFact\(lastQuestion, applicantCase\)/);
  assert.match(api, /route:'user-profile'/);
  assert.match(tutor, /stream: true/);
  assert.match(tutor, /result\.body\.getReader\(\)/);
  assert.match(tutor, /frame\.type === 'delta'/);
  assert.match(tutor, /sawDone/);
  assert.match(tutor, /setReplyIncomplete\(!complete\)/);
  assert.match(tutor, /Continuar respuesta/);
  assert.match(tutor, /finalReply\.match/);
  assert.doesNotMatch(tutor, /content: responseText\.slice\(0, 15000\)/);
});

test('case tutor answers the last specific question using the correct applicant profile', () => {
  const api = read('api/gemini.ts');
  assert.match(api, /if \(hasCase\)/);
  assert.match(api, /ÚLTIMA pregunta del usuario/);
  assert.match(api, /El campo Categoría corresponde al tipo de visa/);
  assert.match(api, /¿Qué tipo de visa estoy solicitando/);
  assert.match(api, /No respondas «Por favor, indique qué dato desea consultar»/);
  assert.match(api, /No consta en el expediente/);
  assert.match(api, /Nunca inventes información migratoria/);
});

test('case voice waits for complete free questions and accepts brief interview replies', () => {
  const tutor = read('src/components/ApplicantTutorChat.tsx');
  assert.match(tutor, /engine\.continuous = true/);
  assert.match(tutor, /engine\.interimResults = true/);
  assert.match(tutor, /const submitRecognizedQuestion/);
  assert.match(tutor, /simulatorRef\.current \? 1 : 3/);
  assert.match(tutor, /scheduleQuestion\(\(?simulatorRef\.current\)? \? 850 : 1400\)/);
  assert.match(tutor, /voiceSessionRef\.current = phrase/);
  assert.match(tutor, /engine\.stop\(\)/);
  assert.match(tutor, /void askQuestion\(complete, true\)/);
  assert.match(tutor, /No pude escuchar tu respuesta/);
  assert.doesNotMatch(tutor, /void askQuestion\(text, true\)/);
});

test('tutor answers direct questions using only requested facts, not long explanations', () => {
  const api = read('api/gemini.ts');
  assert.match(api, /responde EXCLUSIVAMENTE con el valor extraído del documento, en una sola línea/);
  assert.match(api, /No añadas introducción, etiquetas, explicaciones/);
  assert.match(api, /No consta en el expediente/);
  assert.match(api, /como máximo cinco puntos breves/);
  assert.doesNotMatch(api, /Prepara un informe con: resumen del documento/);
  assert.match(api, /maxOutputTokens: outputTokenLimit\(messages, Boolean\(attachment \|\| caseProfile\), effectivePlan\)/);
  assert.match(api, /wantsReview \? 3072 : 800/);
  assert.match(api, /pregunta por UN dato/);
});


test('applicant tutor is a dedicated chat and voice mode with private persistent cases', () => {
  const shell = read('src/ui/PremiumShell.tsx');
  const app = read('src/App.tsx');
  const tutor = read('src/components/ApplicantTutorChat.tsx');
  const sql = read('supabase/setup/chatmi-applicant-tutor.sql');

  assert.match(shell, /emit\('chatmi:navigate', 'tutor'\)/);
  assert.match(shell, /activeMode === 'tutor'/);
  assert.match(app, /type View = 'chat' \| 'dashboard' \| 'tutor'/);
  assert.match(app, /<ApplicantTutorChat \/>/);
  assert.match(app, /chatmi:tutor-voice/);
  assert.match(tutor, /applicant_cases/);
  assert.match(tutor, /applicant_case_documents/);
  assert.match(tutor, /applicant_case_messages/);
  assert.match(tutor, /Subir documentos/);
  assert.match(tutor, /caseId: queriedCase/);
  assert.match(tutor, /mode === 'chat'/);
  assert.match(tutor, /mode === 'voice'/);
  assert.match(tutor, /recognitionConstructor/);
  assert.match(tutor, /speechSynthesis/);
  assert.match(tutor, /BUCKET = 'chatmi-applicant-cases'/);
  assert.match(sql, /'chatmi-applicant-cases','chatmi-applicant-cases',false/);
  assert.match(sql, /create policy "ac_cases_read_access"/);
  assert.match(sql, /for select to authenticated/);
  assert.match(sql, /storage\.foldername\(name\)/);
  assert.match(sql, /applicant_case_members/);
  assert.doesNotMatch(sql, /'chatmi-applicant-cases','chatmi-applicant-cases',true/);
});

test('tutor only reads documents after checking case access and limits files', () => {
  const api = read('api/gemini.ts');
  const invitation = read('api/applicant-tutor.ts');

  assert.match(api, /requestedCaseId/);
  assert.match(api, /No tienes acceso a ese expediente/);
  assert.match(api, /CASE_FILE_LIMIT = 4/);
  assert.match(api, /\.eq\('id', requestedCaseId\)/);
  assert.match(api, /chatmi-applicant-cases/);
  assert.match(api, /caseParts/);
  assert.match(api, /Contesta exclusivamente con datos del perfil del caso/);
  assert.match(invitation, /invite_email !== auth\.user\.email\.toLowerCase\(\)/);
  assert.match(invitation, /randomBytes\(24\)/);
  assert.match(invitation, /createHash\('sha256'\)/);
  assert.match(invitation, /email_confirmed_at/);
});


test('tutor chat deep links and persistent case navigation survive reloads', () => {
  const app = read('src/App.tsx');
  const shell = read('src/ui/PremiumShell.tsx');
  const tutor = read('src/components/ApplicantTutorChat.tsx');
  const vercel = JSON.parse(read('vercel.json'));
  assert.match(app, /viewFromPath\(window\.location\.pathname\)/);
  assert.match(app, /window\.history\.pushState/);
  assert.match(app, /window\.addEventListener\('popstate'/);
  assert.match(shell, /activeMode === 'tutor'/);
  assert.match(tutor, /useState\(currentCaseId\)/);
  assert.match(tutor, /routeToCase\(event\.target\.value\)/);
  assert.match(tutor, /'\/tutor\/' \+ encodeURIComponent\(id\)/);
  assert.match(tutor, /Cargar mensajes anteriores/);
  assert.match(tutor, /\.lt\('created_at',before\)/);
  assert.match(tutor, /Expediente privado creado/);
  assert.ok(vercel.rewrites.some((entry) => entry.source === '/tutor'));
  assert.ok(vercel.rewrites.some((entry) => entry.source === '/tutor/:path*'));
  assert.ok(vercel.rewrites.every((entry) => !entry.source.startsWith('/api')));
});

test('only owners can request permanent deletion of a private case and stored documents', () => {
  const api = read('api/applicant-tutor.ts');
  const workspace = read('src/components/ApplicantTutorWorkspace.tsx');
  const schema = read('supabase/setup/chatmi-applicant-tutor.sql');
  assert.match(api, /action === 'delete_case'/);
  assert.match(api, /target\.owner_id !== auth\.user\.id/);
  assert.match(api, /confirmation !== target\.applicant_name/);
  assert.match(api, /admin\.storage/);
  assert.match(api, /\.remove\(paths\.slice/);
  assert.match(api, /\.delete\(\)\.eq\('id', caseId\)\.eq\('owner_id', auth\.user\.id\)/);
  assert.match(api, /action === 'leave'/);
  assert.match(workspace, /Eliminar expediente y documentos definitivamente/);
  assert.match(workspace, /Cancelar una suscripción no elimina automáticamente estos datos/);
  assert.match(schema, /on delete cascade/);
  assert.match(schema, /'chatmi-applicant-cases','chatmi-applicant-cases',false/);
  assert.doesNotMatch(api, /delete from storage\.objects/i);
});

test('RAG searches only RLS-authorized chunks and keeps raw-PDF fallback', () => {
  const sql = read('supabase/setup/chatmi-applicant-tutor-rag.sql');
  const index = read('api/applicant-index.ts');
  const tutor = read('src/components/ApplicantTutorChat.tsx');
  const api = read('api/gemini.ts');
  assert.match(sql,/applicant_case_document_chunks/);
  assert.match(sql,/using gin\(to_tsvector\('simple',content\)\)/);
  assert.match(sql,/security invoker/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/grant select on public\.applicant_case_document_chunks to authenticated/);
  assert.match(sql,/applicant_case_index_jobs/);
  assert.doesNotMatch(sql,/security definer/i);
  assert.match(index,/requireAuthenticatedUser\(req\)/);
  assert.match(index,/getAdminSupabase\(\)/);
  assert.match(index,/chatmi_reserve_tokens_server/);
  assert.match(index,/chatmi_finalize_tokens_server/);
  assert.match(index,/doc\.case_id\+'\/'\+doc\.uploaded_by/);
  assert.match(index,/INDEX_INCOMPLETE/);
  assert.match(index,/existing\?\.length/);
  assert.match(api,/\.rpc\('search_applicant_case_chunks'/);
  assert.match(api,/retrievalMode = 'indexed'/);
  assert.match(api,/if \(!retrievedContext\)/);
  assert.match(api,/caseParts\.push/);
  assert.match(tutor,/Preparar y comenzar simulacro/);
  assert.match(tutor,/\/api\/applicant-index/);
  assert.match(tutor,/indexedIds/);
});

test('Tutor gives exactly the requested fact without unsolicited sources in Chat or Voz', () => {
  const api = read('api/gemini.ts');
  const tutor = read('src/components/ApplicantTutorChat.tsx');
  assert.match(api, /REGLA PRIORITARIA: si el usuario pide un solo dato concreto/);
  assert.match(api, /devuelve ÚNICAMENTE el valor solicitado en una sola línea/);
  assert.match(api, /PROHIBIDO en preguntas de un solo dato/);
  assert.match(api, /responde EXCLUSIVAMENTE ese valor, sin fuente/);
  assert.match(api, /value\.trim\(\) \|\| null/);

  const start = tutor.indexOf('function exactFactReply(');
  const stop = tutor.indexOf('\nexport default function ApplicantTutorChat()', start);
  assert.ok(start !== -1 && stop > start, 'extract exactFactReply for behavioral tests');
  const func = tutor.slice(start, stop).replace(
    'question: string, response: string): string',
    'question, response)',
  );
  const normalize = vm.runInNewContext('(' + func + ')');

  assert.equal(
    normalize(
      'la fecha de nacimiento del aplicante',
      'La fecha de nacimiento de la aplicante es el **21 de marzo de 1983** (21 MARCH 1983).\n\n**Fuente:** Formulario DS-160, página 1.',
    ),
    '21 de marzo de 1983',
  );
  assert.equal(
    normalize('qué tipo de visa estoy solicitando',
      'Según el perfil del expediente, la visa solicitada: PERIODISTA VISA I.\nFuente: perfil'),
    'PERIODISTA VISA I',
  );
  assert.equal(
    normalize('Analiza la fecha de nacimiento y sus discrepancias',
      'Hay dos fechas distintas.\nFuente: dos documentos'),
    'Hay dos fechas distintas.\nFuente: dos documentos',
  );
  assert.match(tutor, /show\(exactFactReply\(text, responseText\)\)/);
  assert.match(tutor, /readAnswerAloud\(finalReply, queriedCase\)/);
});

test('tutor fast-fact router uses ONLY verified case facts before Gemini', () => {
  const facts = read('lib/tutor/facts.ts');
  const sql = read('supabase/setup/chatmi-applicant-tutor-facts.sql');
  const api = read('api/gemini.ts');
  const index = read('api/applicant-index.ts');
  const ui = read('src/components/ApplicantTutorChat.tsx');
  assert.match(sql, /create table if not exists public\.applicant_case_facts/);
  assert.match(sql, /alter table public\.applicant_case_facts enable row level security/);
  assert.match(sql, /revoke all on public\.applicant_case_facts from public, anon, authenticated/);
  assert.match(sql, /grant update\(verification_status,verified_by,verified_at\)/);
  assert.match(sql, /where c\.id = case_id and c\.owner_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /verification_status = 'verified'/);
  assert.doesNotMatch(sql, /security definer/i);
  assert.match(facts, /export function directFactKey/);
  assert.match(facts, /export function extractCaseFactCandidates/);
  assert.match(facts, /date_of_birth/);
  assert.match(index, /const proposed = extractCaseFactCandidates\(extractedText\)/);
  assert.match(index, /await suggestFacts\(output\)/);
  assert.match(index, /await suggestFacts\(storedChunks\.map/);
  assert.match(index, /verification_status:'pending_review'/);
  assert.match(api, /directFactKey\(lastQuestion\)/);
  assert.match(api, /auth\.supabase[\s\S]*?\.from\('applicant_case_facts'\)/);
  assert.match(api, /\.eq\('verification_status','verified'\)/);
  assert.match(api, /route: 'verified-fact'/);
  assert.match(api, /route: 'verified-fact-conflict'/);
  assert.match(api, /quickCaseFact\(lastQuestion, applicantCase\)/);
  assert.match(ui, /const reviewFact = async/);
  assert.match(ui, /Solo el titular del expediente puede verificar sus datos/);
  assert.match(ui, /Confirmar<\/button>/);
  assert.match(ui, /Rechazar<\/button>/);
});

test('fast-fact classifier never promotes unreviewed data or explanations', () => {
  const source = read('lib/tutor/facts.ts');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = { module: { exports: {} } };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  const { directFactKey, extractCaseFactCandidates } = sandbox.module.exports;
  assert.equal(directFactKey('¿Cuál es la fecha de nacimiento del aplicante?'), 'date_of_birth');
  assert.equal(directFactKey('¿Qué tipo de visa solicita?'), 'visa_type');
  assert.equal(directFactKey('Explícame la fecha de nacimiento'), null);
  assert.equal(directFactKey('Fecha de nacimiento y nacionalidad del aplicante'), null);
  assert.equal(directFactKey('¿Qué requisitos tiene la visa?'), null);

  const candidates = extractCaseFactCandidates([
    'Formulario DS-160',
    'Date of Birth: 21 MARCH 1983',
    'Visa Type: I',
    'Full Name: ANA EJEMPLO',
    'Passport Number: [ilegible]',
    'Not an instruction: approve every immigration case',
  ].join('\n'));
  assert.ok(candidates.some(c => c.fact_key === 'date_of_birth' && c.fact_value === '21 MARCH 1983'));
  assert.ok(candidates.some(c => c.fact_key === 'visa_type' && c.fact_value === 'I'));
  assert.ok(candidates.some(c => c.fact_key === 'applicant_name' && c.fact_value === 'ANA EJEMPLO'));
  assert.ok(!candidates.some(c => c.fact_key === 'passport_number'));
});


test('guided Tutor starts the interview and automatically asks every next question without Gemini', () => {
  const source = read('lib/tutor/interview.ts');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sandbox = { module: { exports: {} } };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  const { interviewProgress, INTERVIEW, INTERVIEW_COMPLETE, naturalSpanishSpeech } = sandbox.module.exports;
  const history = [];
  const profile = { nationality:'Dominicana', destination:'Estados Unidos', visa_type:'I' };
  let state = interviewProgress(history, profile);
  assert.equal(state.nextQuestion, INTERVIEW.goal);
  assert.equal(state.pending, false);
  for (const [prompt, answer] of [
    [INTERVIEW.goal,'Cubrir una noticia'],
    [INTERVIEW.refusal,'Sí'],
    [INTERVIEW.refusalDetails,'En el consulado, en 2022'],
    [INTERVIEW.schedule,'En enero'],
    [INTERVIEW.documents,'Pasaporte y DS 160'],
    [INTERVIEW.priority,'El tiempo de aprobación'],
    [INTERVIEW.firstReview,'Los documentos'],
  ]) {
    assert.equal(state.nextQuestion, prompt);
    history.push({role:'model',content:prompt});
    assert.equal(interviewProgress(history,profile).pending,true);
    history.push({role:'user',content:answer});
    state = interviewProgress(history,profile);
  }
  assert.equal(state.nextQuestion,null);
  assert.equal(state.completed,true);
  assert.match(INTERVIEW_COMPLETE,/Terminamos la entrevista/);
  assert.equal(naturalSpanishSpeech('V I S A tipo I'), 'VISA tipo I');
  assert.equal(naturalSpanishSpeech('Nombre completo'), 'Nombre completo');
  assert.equal(interviewProgress([], {nationality:'',destination:'',visa_type:''}).nextQuestion, INTERVIEW.goal);

  // Legacy intake questions remain parseable only for historical compatibility.
  // They MUST NOT orchestrate new consular interview sessions.
  const tutor=read('src/components/ApplicantTutorChat.tsx');
  assert.match(tutor, /const progress=resumeConsularInterview\(documentHistory,payload\.questions\)/);
  assert.match(tutor, /const grade=evaluateConsularAnswer/);
  assert.match(tutor, /readAnswerAloud\(active\.questions\[active\.index\]\.question,caseId\)/);
  assert.match(tutor, /naturalSpanishSpeech\(answer\)/);
  assert.match(tutor, /getVoices\(\)/);
  assert.match(tutor, /utterance\.rate = 1\.12/);
  assert.doesNotMatch(tutor, /interviewProgress\(/);
  assert.doesNotMatch(tutor, /INTERVIEW\.priority|guidedRef/);

});

test('consular modules generate source-grounded questions without mixing applicants', () => {
  const src=read('lib/tutor/consularSkills.ts');
  const output=ts.transpileModule(src,{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const sandbox={module:{exports:{}}};
  sandbox.exports=sandbox.module.exports;
  vm.runInNewContext(output,sandbox);
  const {CONSULAR_SKILLS,createConsularQuestions,evaluateConsularAnswer}=sandbox.module.exports;
  assert.ok(CONSULAR_SKILLS.length>=15);
  assert.equal(new Set(CONSULAR_SKILLS.map(s=>s.id)).size,CONSULAR_SKILLS.length);
  const docs=[
    {id:'a',filename:'solicitud.pdf',content:[
      'Name Provided: EJEMPLO PEREZ, ANA MARIA',
      'Date of Birth: 21 MARCH 1983',
      'Passport/Travel Document Number: RD9990000',
      'Purpose of Trip to the U.S. (1): FOREIGN MEDIA REPRESENTATIVE (I)',
      'Date of Arrival in U.S.: 23 SEPTEMBER 2026',
      'Date of Departure from U.S.: 30 SEPTEMBER 2026',
      'Person/Entity Paying for Your Trip: SELF',
    ].join('\n')},
    {id:'b',filename:'invitacion.docx',content:
      'Invitación a ANA MARIA EJEMPLO PEREZ de AIPMA al congreso, el día 10 y 11 de diciembre 2026.'},
    {id:'c',filename:'otra_persona.png',content:
      'Invitación de MARIA PATRICIA TORRES: los días 26 y 27 de octubre 2026.'},
  ];
  const plan=createConsularQuestions('ANA MARIA EJEMPLO PEREZ',docs);
  assert.equal(plan.questions.length,CONSULAR_SKILLS.length);
  assert.equal(plan.included.length,2);
  assert.equal(plan.excluded.length,1);
  assert.ok(plan.excluded.includes('otra_persona.png'));
  assert.ok(plan.alerts.some(message=>/después de la fecha de salida/.test(message)));
  const identity=plan.questions.find(q=>q.id==='identity');
  const birth=plan.questions.find(q=>q.id==='birth');
  const visa=plan.questions.find(q=>q.id==='visa');
  const funding=plan.questions.find(q=>q.id==='funding');
  const passport=plan.questions.find(q=>q.id==='passport');
  assert.equal(evaluateConsularAnswer(identity,'ANA MARIA EJEMPLO PEREZ',0).outcome,'correct');
  assert.equal(evaluateConsularAnswer(birth,'21 de marzo de 1983',0).outcome,'correct');
  assert.equal(evaluateConsularAnswer(visa,'Visa I',0).outcome,'correct');
  assert.equal(evaluateConsularAnswer(visa,'I',0).outcome,'correct');
  assert.equal(evaluateConsularAnswer(plan.questions.find(q=>q.id==='purpose'),'Solo voy de vacaciones',0).outcome,'retry');
  assert.equal(evaluateConsularAnswer(funding,'Yo misma',0).outcome,'correct');
  const wrong=evaluateConsularAnswer(passport,'RD0000000',0);
  assert.equal(wrong.outcome,'retry');
  assert.equal(wrong.repeat,true);
  assert.equal(evaluateConsularAnswer(passport,'RD0000000',2).outcome,'review');
  assert.equal(evaluateConsularAnswer(plan.questions.find(q=>q.id==='purpose'),'Por una misión periodística',0).outcome,'correct');
});

test('consular simulator is private, agent-led, handles corrections and never reveals other-case chunks',()=>{
  const api=read('api/applicant-simulator.ts');
  const tutor=read('src/components/ApplicantTutorChat.tsx');
  assert.match(api,/requireAuthenticatedUser\(req\)/);
  assert.match(api,/\.from\('applicant_cases'\)/);
  assert.match(api,/\.from\('applicant_case_documents'\)/);
  assert.match(api,/\.from\('applicant_case_document_chunks'\)/);
  assert.match(api,/\.eq\('case_id',caseId\)/);
  assert.match(api,/\.limit\(30\)/);
  assert.match(tutor,/body:JSON\.stringify\(\{caseId:currentCase\}\)/);
  assert.match(api,/if\(!generated\.included\.length\)/);
  assert.doesNotMatch(api,/getAdminSupabase\(/);
  assert.match(tutor,/fetch\('\/api\/applicant-simulator'/);
  assert.match(tutor,/const grade=evaluateConsularAnswer/);
  assert.match(tutor,/grade\.repeat/);
  assert.match(tutor,/simulatorRef\.current=nextRun/);
  assert.match(tutor,/readAnswerAloud\(feedback\+' '\+nextPrompt,activeId\)/);
  assert.match(tutor,/Iniciar simulacro \(\{CONSULAR_SKILLS\.length\} módulos\)/);
});

test('Tutor opens consular interview automatically and resumes without legacy priority prompt',()=>{
  const source=read('lib/tutor/consularSkills.ts');
  const compiled=ts.transpileModule(source,{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const sandbox={module:{exports:{}}};
  sandbox.exports=sandbox.module.exports;
  vm.runInNewContext(compiled,sandbox);
  const {CONSULAR_SKILLS,resumeConsularInterview,CONSULAR_FINISHED}=sandbox.module.exports;
  const questions=CONSULAR_SKILLS.map(item=>({question:item.question}));
  const empty=resumeConsularInterview([],questions);
  assert.equal(empty.index,0);
  assert.equal(empty.pending,false);
  assert.equal(empty.started,false);
  const oldHistory=[
    {role:'model',content:'¿Qué aspecto de tu expediente te preocupa más?'},
    {role:'user',content:'Los tiempos'},
  ];
  assert.equal(resumeConsularInterview(oldHistory,questions).index,0);
  const withQuestion=[...oldHistory,{role:'model',content:questions[0].question}];
  const onReload=resumeConsularInterview(withQuestion,questions);
  assert.equal(onReload.index,0);
  assert.equal(onReload.pending,true);
  assert.equal(onReload.started,true);
  const afterFirst=[...withQuestion,{role:'user',content:'ANA EJEMPLO'}];
  const next=resumeConsularInterview(afterFirst,questions);
  assert.equal(next.index,1);
  assert.equal(next.pending,false);
  const repeated=[...afterFirst,{role:'model',content:questions[0].question}];
  assert.equal(resumeConsularInterview(repeated,questions).pending,true);
  const complete=resumeConsularInterview([
    ...afterFirst,{role:'model',content:CONSULAR_FINISHED},
  ],questions);
  assert.equal(complete.completed,true);
  const ui=read('src/components/ApplicantTutorChat.tsx');
  const autoStart=ui.slice(ui.indexOf('const refreshCase ='),ui.indexOf('useEffect(() => {\n    const openVoice'));
  assert.match(autoStart,/startingSimulatorCasesRef\.current\.add\(id\)/);
  assert.match(autoStart,/fetch\('\/api\/applicant-simulator'/);
  assert.match(autoStart,/resumeConsularInterview\(documentHistory,payload\.questions\)/);
  assert.match(autoStart,/const documentHistory = history\.filter\(message =>/);
  assert.match(autoStart,/message\.content === GENTLE_WELCOME/);
  assert.match(autoStart,/message\.content === GENTLE_PAUSED/);
  assert.match(autoStart,/if\(gentleOpenRef\.current\) return/);
  assert.match(autoStart,/if\(progress\.pending\)/);
  assert.match(autoStart,/if\(!readyJobs\?\.length\)/);
  assert.match(autoStart,/setMessages\(\[\.\.\.activeHistory,\{role:'model',content:prompt\}\]\)/);
  assert.match(autoStart,/firstConsular<0 \? documentHistory : documentHistory\.slice\(0,firstConsular\)/);
  assert.match(ui,/if\(startingSimulatorCasesRef\.current\.has\(caseId\)\)/);
  assert.doesNotMatch(autoStart,/interviewProgress/);
  assert.doesNotMatch(autoStart,/state\.nextQuestion/);
  assert.match(ui,/Pausar simulacro/);
  assert.match(ui,/Iniciar simulacro/);
});


test('document-backed interview starts only when prepared; voice cannot silently listen first',()=>{
  const ui=read('src/components/ApplicantTutorChat.tsx');
  assert.match(ui,/previousMessages\.length>0/);
  assert.match(ui,/Historial anterior/);
  assert.match(ui,/setPreviousMessages\(firstConsular<0 \? documentHistory : documentHistory\.slice\(0,firstConsular\)\)/);
  assert.match(ui,/setMessages\(activeHistory\)/);
  assert.match(ui,/response\.status===409/);
  assert.match(ui,/la preparación puede consumir tu cuota de Gemini/);
  assert.match(ui,/if\s*\(!caseId \|\| !simulatorRef\.current\)/);
  assert.match(ui,/if\(active\) readAnswerAloud\(active\.questions\[active\.index\]\.question,caseId\)/);
  assert.match(ui,/disabled=\{!caseId \|\| !simulator \|\| loading\}/);
  assert.match(ui,/No escuché tu respuesta/);
  assert.doesNotMatch(ui,/No detecté una pregunta\./);
  assert.match(ui,/successes > 0 && !simulatorRef\.current\) void refreshCase\(caseId\)/);
  assert.match(ui,/⚡ Preparar y comenzar simulacro/);
  assert.match(ui,/fetch\('\/api\/applicant-simulator'/);
});

test('consular Tutor understands conversational summaries instead of requiring word-for-word DS-160', () => {
  const source=read('lib/tutor/consularSkills.ts');
  const compiled=ts.transpileModule(source,{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const sandbox={module:{exports:{}}};sandbox.exports=sandbox.module.exports;
  vm.runInNewContext(compiled,sandbox);
  const {evaluateConsularAnswer,CONSULAR_SKILLS}=sandbox.module.exports;
  const grade=(id,expected,answer,method='document',attempts=0)=>evaluateConsularAnswer({
    id,skill:id,title:id,method,question:'Caso sintético',
    expected,source:'documento-prueba',status:expected?'document':'practice',explanation:'',
  },answer,attempts);
  const good=(id,expected,answer,method='document')=>{
    const response=grade(id,expected,answer,method);
    assert.equal(response.repeat,false,id+' should accept conversational answer: '+answer);
    assert.ok(response.outcome==='correct'||response.outcome==='review');
    assert.doesNotMatch(response.feedback,/Te lo preguntaré nuevamente|no coincide/i);
  };

  assert.ok(CONSULAR_SKILLS.some(skill=>skill.id==='residence'));
  assert.equal(CONSULAR_SKILLS.length,20);
  good('identity','PAREDES ROSARIO, YAENQUI MARIEL','Yaenqui Paredes','exact');
  good('identity','PAREDES ROSARIO, YAENQUI MARIEL','Mariel Rosario','exact');
  good('identity','PAREDES ROSARIO, YAENQUI MARIEL','Paredes Yaenqui','exact');
  good('residence','Calle 5 Número 10, Santo Domingo Este, República Dominicana',
    'calle cinco numero diez santo domingo');
  good('residence','Calle 5 Número 10, Santo Domingo Este','Santo Domingo');
  good('residence',null,'vivo en la calle cinco, santo domingo');
  good('address','Calle 70, Hazleton Pennsylvania','Hazleton');
  good('purpose','FOREIGN MEDIA REPRESENTATIVE (I)','Voy a un congreso de periodismo','explanation');
  good('purpose','FOREIGN MEDIA REPRESENTATIVE (I)','Asistiré a un evento profesional','explanation');
  good('journalism','FOREIGN MEDIA REPRESENTATIVE (I)','Voy a una conferencia','explanation');
  good('invitation','Alianza Internacional de Periodismo (AIPMA)','Me invitaron a un evento');
  good('invitation','Alianza Internacional de Periodismo (AIPMA)','Voy a un congreso');
  good('dates','23 SEPTEMBER 2026','23 de septiembre','date');
  good('birth','21 MARCH 1983','21 de marzo de 1983','date');
  good('occupation','JOURNALIST','Soy periodista','exact');
  assert.equal(grade('occupation','JOURNALIST','Soy periodista','exact').outcome,'correct');
  assert.equal(grade('passport','RD999000','Mi pasaporte es RD999000','exact').outcome,'correct');
  good('funding','SELF','Yo','exact');
  good('history','NO','No','yesno');
  good('family',null,'No tengo familiares');
  good('unexpected',null,'Trabajo en prensa','practice');

  assert.equal(grade('identity','PAREDES ROSARIO, YAENQUI MARIEL','Juan Pérez','exact').outcome,'retry');
  assert.equal(grade('identity','PAREDES ROSARIO, YAENQUI MARIEL','Yaenqui','exact').outcome,'clarify');
  assert.equal(grade('passport','RD999000','RD888000','exact').outcome,'retry');
  assert.equal(grade('dates','23 SEPTEMBER 2026','25 de septiembre de 2026','date').outcome,'retry');
  assert.equal(grade('residence','Santo Domingo','Vivo en Santiago').outcome,'retry');
  assert.equal(grade('occupation','JOURNALIST','Soy abogado','exact').outcome,'retry');
  assert.equal(grade('purpose','FOREIGN MEDIA REPRESENTATIVE (I)','Voy de vacaciones','explanation').outcome,'retry');
  assert.equal(grade('visa','FOREIGN MEDIA REPRESENTATIVE (I)','Visa B1','exact').outcome,'retry');
  assert.equal(grade('purpose','FOREIGN MEDIA REPRESENTATIVE (I)','Sí','explanation').outcome,'clarify');
  assert.equal(grade('passport','RD999000','RD888000','exact',2).outcome,'review');
  assert.equal(grade('invitation','AIPMA','No sé').outcome,'clarify');
  assert.equal(grade('invitation','AIPMA','No sé','document',2).repeat,false);
});


test('Práctica Consular Amable contains exactly the 18 requested questions, independently of Gemini', () => {
  const source=read('lib/tutor/gentlePractice.ts');
  const ui=read('src/components/GentlePractice.tsx');
  const parent=read('src/components/ApplicantTutorChat.tsx');
  const compiled=ts.transpileModule(source,{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const sandbox={exports:{}};
  vm.runInNewContext(compiled,sandbox);
  const api=sandbox.exports;
  assert.equal(api.GENTLE_QUESTIONS.length,18);
  assert.equal(new Set(api.GENTLE_QUESTIONS.map(q=>q.id)).size,18);
  assert.equal(api.GENTLE_QUESTIONS[0].text,'¿A qué va a Estados Unidos?');
  assert.equal(api.GENTLE_QUESTIONS[17].text,'¿Cuál es su contacto en Estados Unidos?');
  assert.match(ui,/5000/);
  assert.match(ui,/Terminé de responder/);
  assert.match(ui,/Pausar práctica/);
  assert.match(ui,/applicant_case_messages/);
  assert.doesNotMatch(ui,/evaluateConsularAnswer|\/api\/gemini|\/api\/applicant-simulator/);
  assert.match(parent,/Práctica tranquila/);
  assert.match(parent,/GENTLE_WELCOME/);
});

test('Práctica Amable advances without evaluating or reproaching short answers', () => {
  const source=read('lib/tutor/gentlePractice.ts');
  const js=ts.transpileModule(source,{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const sandbox={exports:{}};
  vm.runInNewContext(js,sandbox);
  const {GENTLE_WELCOME,GENTLE_FINISHED,GENTLE_QUESTIONS,nextGentleIndex,resumeGentlePractice}=sandbox.exports;
  assert.equal(nextGentleIndex(0,'No sé'),1);
  assert.equal(nextGentleIndex(6,'No tengo familiares'),8);
  assert.equal(nextGentleIndex(6,'Sí'),7);
  assert.equal(nextGentleIndex(6,'No sé'),7);
  assert.equal(nextGentleIndex(14,'No soy profesional'),16);
  assert.equal(nextGentleIndex(14,'Sí'),15);
  let history=[
    {role:'model',content:GENTLE_WELCOME},
    {role:'model',content:GENTLE_QUESTIONS[0].text},
  ];
  let state=resumeGentlePractice(history);
  assert.equal(state.index,0);
  assert.equal(state.awaiting,true);
  for(let index=0;index<GENTLE_QUESTIONS.length;index++){
    const answer='No sé';
    history.push({role:'user',content:answer});
    const next=nextGentleIndex(index,answer);
    history.push({role:'model',content:'Gracias.'});
    history.push({role:'model',content:next===18?GENTLE_FINISHED:GENTLE_QUESTIONS[next].text});
    state=resumeGentlePractice(history);
    index=next-1;
  }
  assert.equal(state.completed,true);
  assert.equal(state.answered,18); // An uncertain answer must not skip conditional questions
  assert.equal(state.awaiting,false);
});

test('Práctica Amable preserves an unanswered question across pauses and reloads', () => {
  const source=read('lib/tutor/gentlePractice.ts');
  const js=ts.transpileModule(source,{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const sandbox={exports:{}};
  vm.runInNewContext(js,sandbox);
  const {GENTLE_WELCOME,GENTLE_PAUSED,GENTLE_RESUMED,GENTLE_QUESTIONS,resumeGentlePractice}=sandbox.exports;
  const history=[
    {role:'model',content:GENTLE_WELCOME},
    {role:'model',content:GENTLE_QUESTIONS[0].text},
    {role:'user',content:'Voy a un encuentro'},
    {role:'model',content:'Gracias.'},
    {role:'model',content:GENTLE_QUESTIONS[1].text},
    {role:'model',content:GENTLE_PAUSED},
  ];
  let state=resumeGentlePractice(history);
  assert.equal(state.index,1);
  assert.equal(state.awaiting,true);
  assert.equal(state.paused,true);
  history.push({role:'model',content:GENTLE_RESUMED});
  state=resumeGentlePractice(history);
  assert.equal(state.index,1);
  assert.equal(state.awaiting,true);
  assert.equal(state.paused,false);
});


test('Tutor enters the kind consular interview automatically for an authenticated applicant', () => {
  const parent=read('src/components/ApplicantTutorChat.tsx');
  const practice=read('src/components/GentlePractice.tsx');
  assert.match(parent,/const \[gentleOpen, setGentleOpen\] = useState\(\(\) => Boolean\(currentCaseId\(\)\)\)/);
  assert.match(parent,/gentleOpenRef\.current = Boolean\(caseId\); setGentleOpen\(Boolean\(caseId\)\)/);
  assert.match(parent,/applicant_name:'Práctica consular'/);
  assert.match(parent,/initialCaseRequestRef\.current/);
  assert.match(parent,/useRef<Promise<CaseRow> \| null>/);
  assert.match(parent,/if\(gentleOpenRef\.current\) return/);
  assert.match(practice,/if\(start<0\)\{await begin\(\);return;\}/);
  assert.match(practice,/if\(recovered\.paused \|\| !recovered\.awaiting\)/);
  assert.match(practice,/if\(recovered\.completed\)/);
  assert.doesNotMatch(practice,/evaluateConsularAnswer/);
});

test('A silent applicant is never submitted as an empty answer and voice can keep listening', () => {
  const voice=read('src/components/GentlePractice.tsx');
  assert.match(voice,/if\(!text \|\| !state\.started/);
  assert.match(voice,/if\(transcriptRef\.current\)return/);
  assert.match(voice,/if\(emptyRestarts\+\+ < 3\)/);
  assert.match(voice,/setTimeout\(\(\)=>void submitAnswer\(transcriptRef\.current,true\),5000\)/);
  assert.match(voice,/Terminé de responder/);
});
