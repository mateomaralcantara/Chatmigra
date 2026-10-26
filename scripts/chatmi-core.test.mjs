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

test('case voice collects a full utterance and does not submit a single word', () => {
  const tutor = read('src/components/ApplicantTutorChat.tsx');
  assert.match(tutor, /engine\.continuous = true/);
  assert.match(tutor, /engine\.interimResults = true/);
  assert.match(tutor, /const submitRecognizedQuestion/);
  assert.match(tutor, /split\(\/\\s\+\/\)\.filter\(Boolean\)\.length < 3/);
  assert.match(tutor, /scheduleQuestion\(1700\)/);
  assert.match(tutor, /voiceSessionRef\.current = phrase/);
  assert.match(tutor, /engine\.stop\(\)/);
  assert.match(tutor, /void askQuestion\(complete, true\)/);
  assert.match(tutor, /No detecté una pregunta completa/);
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
  assert.match(api, /wantsReview \? 3072 : 1600/);
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
  assert.match(tutor,/Preparar búsqueda rápida/);
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
  assert.match(index, /extractCaseFactCandidates\(output\)/);
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
