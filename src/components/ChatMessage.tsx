// src/components/ChatMessage.tsx
import React from 'react';
import {
  Plan,
  ChatMessage as ChatMessageType,
  ChecklistData,
} from '../types';
import UpgradeTeaser from './UpgradeTeaser';
import Checklist from './Checklist';
import ImageSupport from './ImageSupport';
import { logActivity } from '../services/activityService';

interface ChatMessageProps {
  message: ChatMessageType; // { role: 'user' | 'model', content: string, ... }
  plan: Plan;
  userEmail: string;
  onGoToUpgrade: () => void; // cambiar vista a "Mi Cuenta" / dashboard
}

// ---- Helpers para extraer bloques JSON ----

interface ParsedContent {
  text: string;
  imageQuery?: { query: string; cantidad?: number };
  checklist?: ChecklistData;
}

const parseJsonBlock = <T,>(
  content: string,
  tag: string
): { data?: T; cleaned: string } => {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = content.indexOf(open);
  const end = content.indexOf(close);

  if (start === -1 || end === -1) {
    return { cleaned: content };
  }

  const jsonSlice = content.slice(start + open.length, end).trim();
  let data: T | undefined;

  try {
    data = JSON.parse(jsonSlice) as T;
  } catch (e) {
    console.error(`Error parseando bloque ${tag}:`, e, jsonSlice);
  }

  const cleaned =
    content.slice(0, start).trimEnd() +
    '\n\n' +
    content.slice(end + close.length).trimStart();

  return { data, cleaned };
};

const parseContent = (raw: string): ParsedContent => {
  let work = raw;

  // checklist-json
  const checklistRes = parseJsonBlock<ChecklistData>(work, 'checklist-json');
  work = checklistRes.cleaned;

  // image-json
  const imageRes = parseJsonBlock<{ query: string; cantidad?: number }>(
    work,
    'image-json'
  );
  work = imageRes.cleaned;

  return {
    text: work.trim(),
    imageQuery: imageRes.data,
    checklist: checklistRes.data,
  };
};

// ---- Limpieza simple de markdown ruidoso (###, **, __, `) ----

const stripMarkdownNoiseMultiline = (value: string): string => {
  if (!value) return '';
  const lines = value.split('\n');

  const cleanedLines = lines.map(line => {
    let l = line;

    // Quitar encabezados tipo "### Título"
    l = l.replace(/^\s*#{1,6}\s*/g, '');

    // Quitar asteriscos, guiones bajos y backticks usados como estilo
    l = l.replace(/[*`_]+/g, '');

    return l;
  });

  return cleanedLines.join('\n').trim();
};

// 🔥 ELIMINAR SIEMPRE BLOQUES <image-json> Y <checklist-json> DEL TEXTO VISIBLE
const stripHiddenBlocks = (value: string): string => {
  if (!value) return '';
  return value
    .replace(/<image-json>[\s\S]*?<\/image-json>/gi, '')
    .replace(/<checklist-json>[\s\S]*?<\/checklist-json>/gi, '')
    .trim();
};

// ---- Helper para título (primera línea no vacía) ----

const extractTitleAndBody = (
  raw: string
): { title: string; body: string; usedTitleLine: boolean } => {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { title: '', body: '', usedTitleLine: false };

  const lines = trimmed.split('\n');

  // primer renglón NO vacío
  const firstIndex = lines.findIndex(l => l.trim() !== '');
  if (firstIndex === -1) {
    return { title: '', body: trimmed, usedTitleLine: false };
  }

  const originalFirst = lines[firstIndex].trim();

  // body = todo menos ese renglón
  const bodyLines = [...lines];
  bodyLines.splice(firstIndex, 1);
  const body = bodyLines.join('\n');

  return {
    title: originalFirst,
    body,
    usedTitleLine: true,
  };
};

// ---- Componente principal ----

const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  plan,
  userEmail,
  onGoToUpgrade,
}) => {
  if (!message) {
    console.warn('[ChatMessage] message es undefined/null');
    return null;
  }

  const isAssistant = message.role === 'model';
  const { text, imageQuery, checklist } = parseContent(message.content || '');

  const handleUpgradeClick = async () => {
    try {
      await logActivity({
        userEmail,
        type: 'upgrade_click',
        metadata: {
          source: 'chat_teaser',
          currentPlan: plan,
        },
      });
    } catch (err) {
      console.error('Error registrando actividad upgrade_click:', err);
    }

    onGoToUpgrade();
  };

  // Alineación tipo chat
  const alignmentClasses = isAssistant
    ? 'self-start flex'
    : 'self-end flex justify-end';

  // Burbuja: fondo blanco + texto negro para el modelo
  const bubbleClasses = isAssistant
    ? 'bg-white text-black border border-slate-200'
    : 'bg-blue-600 text-white border border-blue-500/70';

  // --- Título y cuerpo para respuestas del asistente ---
  let title = '';
  let bodyRaw = text;

  if (isAssistant && text) {
    const { title: rawTitle, body, usedTitleLine } = extractTitleAndBody(text);
    title = stripMarkdownNoiseMultiline(rawTitle);
    bodyRaw = usedTitleLine ? body : text;
  }

  const bodyClean = stripMarkdownNoiseMultiline(bodyRaw);
  const userTextClean = !isAssistant ? stripMarkdownNoiseMultiline(text) : '';

  // Nunca mostrar los bloques JSON crudos
  const bodyVisible = stripHiddenBlocks(bodyClean);
  const userVisible = stripHiddenBlocks(userTextClean);
  const fallbackVisible = stripHiddenBlocks(
    stripMarkdownNoiseMultiline(text || '')
  );

  return (
    <div className={`mb-4 ${alignmentClasses}`}>
      <div
        data-debug="chat-bubble"
        data-role={isAssistant ? 'assistant' : 'user'}
        className={[
          'max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm relative',
          bubbleClasses,
        ].join(' ')}
      >
        {/* TEXTO PRINCIPAL */}
        {text && (
          <div
            data-debug="chat-text"
            className="whitespace-pre-wrap leading-relaxed relative z-10 space-y-2"
          >
            {isAssistant ? (
              <>
                {title && (
                  <h2
                    className="text-xl sm:text-2xl font-extrabold italic tracking-wide"
                    style={{
                      color: '#000000', // negro sólido para el título
                      position: 'relative',
                      zIndex: 50,
                    }}
                  >
                    {title}
                  </h2>
                )}

                {bodyVisible && (
                  <div className="whitespace-pre-wrap leading-relaxed text-base sm:text-lg font-semibold text-black">
                    {bodyVisible}
                  </div>
                )}

                {/* Fallback por si algo sale raro */}
                {!title && !bodyVisible && (
                  <div className="whitespace-pre-wrap leading-relaxed text-base sm:text-lg font-semibold text-black">
                    {fallbackVisible}
                  </div>
                )}
              </>
            ) : (
              // Mensajes del usuario (también sin ### ni ** ni bloques JSON)
              <div className="whitespace-pre-wrap leading-relaxed text-base sm:text-lg font-semibold">
                {userVisible}
              </div>
            )}
          </div>
        )}

        {/* CHECKLIST (si el modelo envía <checklist-json>...) */}
        {isAssistant && checklist && (
          <div className="mt-3">
            <Checklist data={checklist} />
          </div>
        )}

        {/* IMÁGENES (si el modelo envía <image-json>...) */}
        {isAssistant && imageQuery?.query && (
          <div className="mt-3">
            <ImageSupport
              query={imageQuery.query}
              count={imageQuery.cantidad ?? 1} // una sola imagen grande
            />
          </div>
        )}

        {/* Teaser de upgrade SIEMPRE al final del mensaje del asistente (plan FREE) */}
        {isAssistant && plan === Plan.FREE && (
          <div className="mt-4 pt-3 border-t border-slate-200">
            <UpgradeTeaser
              currentPlan={plan}
              onUpgradeClick={handleUpgradeClick}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
