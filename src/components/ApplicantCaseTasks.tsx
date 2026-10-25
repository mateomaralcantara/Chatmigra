import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../services/supabaseClient';

type Task = { id: string; title: string; description: string; status: 'pending'|'in_progress'|'completed'; created_by: string; due_date: string|null };
const OPTIONS: Task['status'][] = ['pending','in_progress','completed'];
const LABELS: Record<Task['status'],string> = { pending:'Pendiente', in_progress:'En proceso', completed:'Completada' };

export default function ApplicantCaseTasks({ caseId, ownerId, currentUserId }: {caseId:string;ownerId:string;currentUserId:string}) {
 const [tasks,setTasks]=useState<Task[]>([]);
 const [title,setTitle]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [dueDate,setDueDate]=useState('');
 const load=useCallback(async()=>{
  const {data,error:err}=await supabase.from('applicant_case_tasks').select('id,title,description,status,created_by,due_date').eq('case_id',caseId).order('created_at',{ascending:false});
  if(err) throw err;
  setTasks((data||[]) as Task[]);
 },[caseId]);
 useEffect(()=>{setTasks([]);setError('');void load().catch(()=>setError('Seguimiento no disponible. Instala el SQL del módulo de tareas.'));},[load]);
 async function create(e:FormEvent){
  e.preventDefault();if(busy||title.trim().length<2)return;
  setBusy(true);setError('');
  try {
   const {data:{user}}=await supabase.auth.getUser();
   if(!user||user.id!==currentUserId)throw new Error('Sesión no válida.');
   const {error:err}=await supabase.from('applicant_case_tasks').insert({case_id:caseId,created_by:user.id,title:title.trim().slice(0,240),due_date:dueDate||null});
   if(err)throw err;
   setTitle('');setDueDate('');await load();
  }catch{setError('No se pudo guardar la tarea.');}finally{setBusy(false);}
 }
 async function setStatus(id:string,status:Task['status']){
  if(busy)return;setBusy(true);setError('');
  try{const {error:err}=await supabase.from('applicant_case_tasks').update({status,updated_at:new Date().toISOString()}).eq('id',id).eq('case_id',caseId);
  if(err)throw err;await load();}catch{setError('No se pudo actualizar la tarea.');}finally{setBusy(false);}
 }
 async function remove(task:Task){
  if(busy||!window.confirm('¿Eliminar esta tarea?'))return;
  setBusy(true);setError('');
  try{const {error:err}=await supabase.from('applicant_case_tasks').delete().eq('id',task.id).eq('case_id',caseId);
  if(err)throw err;await load();}catch{setError('No se pudo eliminar la tarea.');}finally{setBusy(false);}
 }
 return <div className="cm-case-tutor-panel" aria-label="Seguimiento del expediente">
  <h2>Seguimiento y requisitos</h2>
  <p className="cm-case-tutor-hint">Pendientes privados de este expediente. Permanecen guardados entre sesiones.</p>
  {error&&<p role="alert" className="cm-case-tutor-error">{error}</p>}
  <form onSubmit={create} className="cm-case-tutor-form">
   <input aria-label="Nueva tarea" placeholder="Ej. Verificar carta laboral" value={title} onChange={e=>setTitle(e.target.value)} maxLength={240} required minLength={2}/>
   <input aria-label="Fecha límite opcional" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/>
   <button type="submit" disabled={busy||title.trim().length<2}>Guardar pendiente</button>
  </form>
  <div className="cm-case-tutor-documents">
   {tasks.map(task=><div className="cm-case-tutor-document" key={task.id}>
    <div><strong>{task.title}</strong>{task.due_date&&<small> · Fecha: {task.due_date}</small>}</div>
    <select aria-label={'Estado de '+task.title} value={task.status} disabled={busy} onChange={e=>void setStatus(task.id,e.target.value as Task['status'])}>
     {OPTIONS.map(o=><option key={o} value={o}>{LABELS[o]}</option>)}
    </select>
    {(task.created_by===currentUserId||ownerId===currentUserId)&&<button type="button" disabled={busy} onClick={()=>void remove(task)}>Eliminar</button>}
   </div>)}
   {!tasks.length&&<p>No existen tareas registradas.</p>}
  </div>
 </div>;
}
