import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '../services/supabaseClient';
import {
  GENTLE_FINISHED, GENTLE_PAUSED, GENTLE_QUESTIONS, GENTLE_RESUMED, GENTLE_WELCOME,
  GENTLE_QUESTION_PAUSE_MS, remainingGentleQuestionPause,
  nextGentleIndex, resumeGentlePractice,
  type GentleMessage, type GentleProgress,
} from '../../lib/tutor/gentlePractice';

type Message = GentleMessage & { id?: string; created_at?: string };
type RecognitionResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type Recognition = {
  lang:string;continuous:boolean;interimResults:boolean;
  onresult:((event:RecognitionResult)=>void)|null;
  onend:(()=>void)|null;
  onerror:((event:{error?:string})=>void)|null;
  start:()=>void;stop:()=>void;
};
type Props = {caseId:string;onExit:()=>void};
const FIRST: GentleProgress = {
  started:false,completed:false,paused:false,index:0,awaiting:false,answered:0,
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function recognitionClass(): (new()=>Recognition)|null {
  const browser=window as Window & {
    SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition;
  };
  return browser.SpeechRecognition || browser.webkitSpeechRecognition || null;
}

export default function GentlePractice({caseId,onExit}:Props) {
  const [messages,setMessages]=useState<Message[]>([]);
  const [progress,setProgress]=useState<GentleProgress>(FIRST);
  const [answer,setAnswer]=useState('');
  const [transcript,setTranscript]=useState('');
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [voiceEnabled,setVoiceEnabled]=useState(false);
  const [listening,setListening]=useState(false);
  const [speaking,setSpeaking]=useState(false);
  const [waitingSeconds,setWaitingSeconds]=useState<number|null>(null);
  const recordsRef=useRef<Message[]>([]);
  const progressRef=useRef<GentleProgress>(FIRST);
  const micRef=useRef<Recognition|null>(null);
  const voiceRef=useRef(false);
  const submittingRef=useRef(false);
  const transcriptRef=useRef('');
  const timerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const endRef=useRef<HTMLDivElement>(null);
  const aliveRef=useRef(true);
  const busyRef=useRef(false);

  const update=(items:Message[])=>{
    recordsRef.current=items;
    const next=resumeGentlePractice(items);
    progressRef.current=next;
    if(aliveRef.current){setMessages(items);setProgress(next);}
  };

  const save=async (turns:GentleMessage[])=>{
    const {data:{user},error:authError}=await supabase.auth.getUser();
    if(authError || !user)throw new Error('Inicia sesión para guardar tu práctica privada.');
    const savedAt=Date.now();
    const rows=turns.map((item,i)=>({
      case_id:caseId,created_by:user.id,role:item.role,
      content:item.content,created_at:new Date(savedAt+i).toISOString(),
    }));
    const {error:saveError}=await supabase.from('applicant_case_messages').insert(rows);
    if(saveError)throw new Error('No se pudo guardar tu práctica. Inténtalo nuevamente.');
    // Conservar en pantalla la misma fecha usada en Supabase, también para el
    // temporizador: recargar no debe adelantar la pregunta siguiente.
    update([...recordsRef.current,...rows]);
  };

  const clearTimer=()=>{
    if(timerRef.current)clearTimeout(timerRef.current);
    timerRef.current=null;
  };

  const stopVoice=()=>{
    voiceRef.current=false;
    clearTimer();
    micRef.current?.stop();
    window.speechSynthesis?.cancel();
    setVoiceEnabled(false);setListening(false);setSpeaking(false);
    transcriptRef.current='';setTranscript('');
  };

  const listen=()=>{
    if(!voiceRef.current || !micRef.current || submittingRef.current)return;
    try{micRef.current.start();setListening(true);setError('');}
    catch{setListening(false);setNotice('Pulsa «Seguir escuchando» cuando estés listo.');}
  };

  const speak=(question:string)=>{
    if(!voiceRef.current)return;
    window.speechSynthesis?.cancel();
    const utterance=new SpeechSynthesisUtterance(question);
    const voices=window.speechSynthesis?.getVoices().filter(v=>v.lang.toLowerCase().startsWith('es')) || [];
    utterance.voice=voices.find(v=>v.lang.toLowerCase()==='es-do') || voices[0] || null;
    utterance.lang=utterance.voice?.lang || 'es-DO';
    utterance.rate=0.95;
    utterance.onend=()=>{setSpeaking(false);listen();};
    utterance.onerror=()=>{setSpeaking(false);setNotice('No se pudo reproducir la voz. Puedes responder por escrito.');};
    setSpeaking(true);setListening(false);
    window.speechSynthesis?.speak(utterance);
  };

  const submitAnswer=async (raw:string,spoken:boolean)=>{
    const text=raw.trim();
    const state=progressRef.current;
    if(!text || !state.started || state.completed || state.paused || !state.awaiting || busyRef.current)return;
    busyRef.current=true;submittingRef.current=true;setBusy(true);setError('');clearTimer();
    if(spoken){micRef.current?.stop();setListening(false);}
    else if(voiceRef.current){stopVoice();}
    const next=nextGentleIndex(state.index,text);
    const prompt=next<GENTLE_QUESTIONS.length?GENTLE_QUESTIONS[next].text:GENTLE_FINISHED;
    try{
      // La respuesta se guarda primero. El siguiente enunciado NO se muestra
      // ni se pronuncia hasta que hayan pasado al menos 15 segundos.
      await save([
        {role:'user',content:text.slice(0,12000)},
        {role:'model',content:'Gracias.'},
        ...(next===GENTLE_QUESTIONS.length
          ? [{role:'model' as const,content:GENTLE_FINISHED}]
          : []),
      ]);
      setAnswer('');setTranscript('');transcriptRef.current='';
      if(next===GENTLE_QUESTIONS.length){
        stopVoice();setNotice('Práctica finalizada. Puedes repetirla cuando quieras.');
      }
    }catch(err){
      setError(err instanceof Error?err.message:'No se pudo guardar la respuesta.');
      if(spoken) setNotice('La pregunta sigue pendiente. Puedes reactivar el micrófono.');
    }finally{
      busyRef.current=false;submittingRef.current=false;
      if(aliveRef.current)setBusy(false);
    }
  };

  const begin=async (restart=false)=>{
    if(busyRef.current)return;
    busyRef.current=true;setBusy(true);setError('');setNotice('');
    try{
      const current=progressRef.current;
      if(restart || !current.started || current.completed){
        stopVoice();
        await save([
          {role:'model',content:GENTLE_WELCOME},
          {role:'model',content:GENTLE_QUESTIONS[0].text},
        ]);
      }else if(current.paused){
        await save([{role:'model',content:GENTLE_RESUMED}]);
      }else if(!current.awaiting && current.index<GENTLE_QUESTIONS.length &&
        current.answered===0){
        // Primera pregunta sin respuesta: iniciar enseguida.
        await save([{role:'model',content:GENTLE_QUESTIONS[current.index].text}]);
      }
      // Si ya existe una respuesta, el temporizador controla el siguiente turno.
    }catch(err){setError(err instanceof Error?err.message:'No se pudo iniciar la práctica.');}
    finally{busyRef.current=false;if(aliveRef.current)setBusy(false);}
  };

  const pause=async ()=>{
    if(busyRef.current || progressRef.current.paused)return;
    stopVoice();busyRef.current=true;setBusy(true);
    try{await save([{role:'model',content:GENTLE_PAUSED}]);}
    catch(err){setError(err instanceof Error?err.message:'No se pudo pausar la práctica.');}
    finally{busyRef.current=false;if(aliveRef.current)setBusy(false);}
  };

  const startVoice=()=>{
    if(voiceRef.current){stopVoice();return;}
    if(busyRef.current || !progressRef.current.awaiting || progressRef.current.paused)return;
    const Constructor=recognitionClass();
    if(!Constructor){setError('Este navegador no admite reconocimiento de voz. Usa Chrome o responde por chat.');return;}
    const mic=new Constructor();
    let emptyRestarts=0;
    mic.lang='es-DO';mic.continuous=true;mic.interimResults=true;
    mic.onresult=(event)=>{
      if(!voiceRef.current || submittingRef.current)return;
      const current=Array.from(event.results).map(result=>result[0]?.transcript||'').join(' ')
        .replace(/\s+/g,' ').trim();
      transcriptRef.current=current;setTranscript(current);clearTimer();
      if(current)emptyRestarts=0;
      // Pausa generosa: solo finaliza tras 5 segundos sin nuevas palabras.
      // El usuario puede pulsar «Terminé de responder» antes.
      if(current)timerRef.current=setTimeout(()=>void submitAnswer(transcriptRef.current,true),5000);
    };
    mic.onend=()=>{
      setListening(false);
      if(!voiceRef.current || submittingRef.current)return;
      if(transcriptRef.current)return; // No avanzar por silencio
      setNotice('No hay prisa. Puedes responder cuando estés listo.');
      // Chrome puede finalizar una escucha por silencio, aunque el usuario aún
      // esté pensando. Reanudar un número acotado de veces, sin enviar respuesta.
      if(emptyRestarts++ < 3){
        timerRef.current=setTimeout(()=>{
          timerRef.current=null;
          if(voiceRef.current && !submittingRef.current && !transcriptRef.current)listen();
        },1000);
      }else{
        setNotice('Te sigo esperando. Pulsa «Seguir escuchando» cuando estés listo.');
      }
    };
    mic.onerror=(event)=>{
      if(!voiceRef.current)return;
      setListening(false);
      if(event.error==='no-speech'){
        setNotice('No hay prisa. Pulsa «Seguir escuchando» cuando quieras responder.');
      }else{
        setNotice('El micrófono se detuvo. Puedes continuar por escrito o reanudar la escucha.');
      }
    };
    micRef.current=mic;voiceRef.current=true;
    setVoiceEnabled(true);setTranscript('');transcriptRef.current='';setNotice('');
    const current=GENTLE_QUESTIONS[progressRef.current.index];
    if(current)speak(current.text);
  };

  useEffect(()=>{
    aliveRef.current=true;
    let cancelled=false;
    const load=async()=>{
      if(!UUID.test(caseId)){setError('Selecciona un expediente privado válido.');setBusy(false);return;}
      try{
        const {data:{user},error:authError}=await supabase.auth.getUser();
        if(authError || !user)throw new Error('Debes iniciar sesión para usar la práctica privada.');
        const {data,error:readError}=await supabase.from('applicant_case_messages')
          .select('id,role,content,created_at').eq('case_id',caseId)
          .order('created_at',{ascending:false}).limit(250);
        if(readError)throw new Error('No se pudo recuperar el historial de la práctica.');
        if(cancelled)return;
        const history=((data||[]) as Message[]).reverse();
        let start=-1;
        for(let i=history.length-1;i>=0;i--){
          if(history[i].role==='model' && history[i].content===GENTLE_WELCOME){start=i;break;}
        }
        update(start<0?[]:history.slice(start));
        setBusy(false);busyRef.current=false;
        if(start<0){await begin();return;}
        const recovered=progressRef.current;
        if(recovered.completed){
          await begin(true); // Nueva visita: primera pregunta de una nueva práctica.
          return;
        }
        if(recovered.paused || !recovered.awaiting){
          await begin(); // Reanudar sin obligar al solicitante a pulsar botones.
        }
      }catch(err){
        if(!cancelled){setError(err instanceof Error?err.message:'Error cargando la práctica.');setBusy(false);}
      }
    };
    void load();
    return ()=>{cancelled=true;aliveRef.current=false;voiceRef.current=false;
      clearTimer();micRef.current?.stop();window.speechSynthesis?.cancel();};
    // Each practice component instance belongs to a single private case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[caseId]);

  // Programar una sola pregunta por turno, no antes de que hayan pasado
  // 15 segundos desde la respuesta, aun después de una recarga o pausa.
  useEffect(()=>{
    if(!progress.started || progress.completed || progress.paused ||
      progress.awaiting || busy || progress.index>=GENTLE_QUESTIONS.length){
      setWaitingSeconds(null);
      return;
    }
    const prompt=GENTLE_QUESTIONS[progress.index].text;
    const refreshCountdown=()=>{
      const ms=remainingGentleQuestionPause(messages,Date.now());
      setWaitingSeconds(Math.ceil(ms/1000));
    };
    refreshCountdown();
    const countdown=setInterval(refreshCountdown,500);
    const remaining=remainingGentleQuestionPause(messages,Date.now());
    const release=setTimeout(()=>{
      const state=progressRef.current;
      if(!aliveRef.current || busyRef.current || !state.started || state.completed ||
        state.paused || state.awaiting || state.index!==progress.index)return;
      // Nunca permitir que una espera ya consumida se publique dos veces.
      busyRef.current=true;
      setBusy(true);
      void save([{role:'model',content:prompt}])
        .then(()=>{
          setWaitingSeconds(null);
          if(voiceRef.current)speak(prompt);
        })
        .catch(err=>setError(err instanceof Error
          ? err.message : 'No se pudo continuar la práctica.'))
        .finally(()=>{
          busyRef.current=false;
          if(aliveRef.current)setBusy(false);
        });
    },remaining);
    return ()=>{clearInterval(countdown);clearTimeout(release);};
    // El estado guardado, y no una petición a Gemini, decide cuándo continuar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[messages,progress.started,progress.completed,progress.paused,progress.awaiting,
     progress.index,busy]);

  useEffect(()=>{endRef.current?.scrollIntoView({block:'end',behavior:'smooth'});},[messages]);

  const exitPractice=async()=>{
    if(busyRef.current)return;
    stopVoice();
    const state=progressRef.current;
    if(state.started && !state.completed && !state.paused){
      busyRef.current=true;setBusy(true);
      try{await save([{role:'model',content:GENTLE_PAUSED}]);}
      catch(err){
        setError(err instanceof Error?err.message:'No se pudo guardar la pausa.');
        busyRef.current=false;setBusy(false);return;
      }
      busyRef.current=false;setBusy(false);
    }
    onExit();
  };

  const send=(event:FormEvent)=>{
    event.preventDefault();
    void submitAnswer(answer,false);
  };

  const current=GENTLE_QUESTIONS[progress.index];
  return (
    <section className="cm-tutor-chat-layout" aria-label="Práctica Consular Amable">
      <header className="cm-tutor-chat-header">
        <div>
          <h2>Práctica Consular Amable</h2>
          <p>18 preguntas · sin calificaciones ni reproches · sin necesidad de documentos</p>
        </div>
        <button type="button" className="cm-tutor-new-case" disabled={busy} onClick={()=>void exitPractice()}>
          Volver al Tutor
        </button>
      </header>
      <div className="cm-tutor-chat-scroll" aria-live="polite">
        <div className="cm-tutor-chat-messages">
          {messages.map((item,i)=>(
            <div key={item.id||i}
              className={'cm-tutor-chat-bubble '+(item.role==='user'?'is-user':'is-model')}>
              <strong>{item.role==='user'?'Tú':'Tutor'}</strong>
              <p>{item.content}</p>
            </div>
          ))}
          <div ref={endRef}/>
        </div>
      </div>
      <div className="cm-tutor-chat-bottom">
        <div className="cm-tutor-interview-bar">
          <span>{progress.completed?'Práctica concluida':
            progress.paused?'Práctica pausada':
            progress.started&&current?('Pregunta '+(progress.index+1)+' de '+GENTLE_QUESTIONS.length+' · '+current.group):
            'Preparando práctica...'}</span>
          {progress.started && !progress.completed && (
            <button type="button" disabled={busy}
              onClick={()=>void (progress.paused?begin():pause())}>
              {progress.paused?'Reanudar práctica':'Pausar práctica'}
            </button>
          )}
          {progress.completed && (
            <button type="button" disabled={busy} onClick={()=>void begin(true)}>Repetir práctica</button>
          )}
        </div>
        {error&&<p role="alert" className="cm-inline-error">{error}</p>}
        {notice&&<p role="status" className="cm-tutor-chat-notice">{notice}</p>}
        {busy&&<p role="status" className="cm-tutor-chat-thinking">Guardando práctica...</p>}
        {waitingSeconds!==null && !progress.awaiting && !progress.paused && !progress.completed && (
          <p role="status" className="cm-tutor-chat-notice">
            Gracias por responder. La próxima pregunta llegará en {waitingSeconds} segundos.
          </p>
        )}
        {progress.started&&!progress.completed&&!progress.paused&&progress.awaiting&&(
          <>
            <div className="cm-tutor-documents-bar">
              <button type="button" className="cm-tutor-upload"
                onClick={startVoice} disabled={busy}>
                {voiceEnabled?'■ Detener voz':'🎙 Iniciar voz'}
              </button>
              {voiceEnabled && (
                <button type="button" className="cm-tutor-upload"
                  onClick={listen} disabled={busy||speaking||listening}>
                  Seguir escuchando
                </button>
              )}
              {voiceEnabled && current && (
                <button type="button" className="cm-tutor-upload"
                  onClick={()=>{
                    clearTimer();micRef.current?.stop();
                    transcriptRef.current='';setTranscript('');
                    speak(current.text);
                  }} disabled={busy||speaking}>
                  Repetir pregunta
                </button>
              )}
              {voiceEnabled && (
                <button type="button" className="cm-tutor-upload"
                  onClick={()=>void submitAnswer(transcriptRef.current,true)}
                  disabled={busy||!transcript.trim()}>
                  Terminé de responder
                </button>
              )}
              <button type="button" className="cm-tutor-upload"
                onClick={()=>void submitAnswer('Prefiero omitir esta pregunta.',false)}
                disabled={busy}>Omitir pregunta</button>
              {voiceEnabled&&<span role="status">
                {speaking?'El Tutor está preguntando…':listening?'Escuchando sin prisa…':'Escucha pausada'}
              </span>}
            </div>
            {transcript&&<p className="cm-tutor-voice-transcript">Escuché: {transcript}</p>}
            <form className="cm-composer cm-tutor-composer" onSubmit={send}>
              <textarea aria-label="Tu respuesta de práctica" rows={2} value={answer}
                onChange={event=>setAnswer(event.target.value)} disabled={busy}
                placeholder="Escribe tu respuesta con tranquilidad…"/>
              <div className="cm-composer-actions">
                <span className="cm-model-chip">Práctica tranquila · sin Gemini</span>
                <button type="submit" className="cm-composer-send"
                  aria-label="Enviar respuesta" disabled={busy||!answer.trim()}>↑</button>
              </div>
            </form>
          </>
        )}
        <small>Las respuestas se guardan únicamente como práctica privada; no se consideran hechos verificados ni garantizan aprobación de visa.</small>
      </div>
    </section>
  );
}
