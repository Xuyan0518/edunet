import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { sessionKey } from '@/app/queryKeys';
import { requestJson, ApiError } from '@/services/http';
import type { Student } from '@/services/studentsApi';
import { useWebCopy } from '@/i18n/web';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export function StudentDeleteDialog({student,onClose}:{student:Student;onClose:()=>void}) {
  const {user}=useAuth();const cache=useQueryClient();const c=useWebCopy();const [name,setName]=useState('');const [pending,setPending]=useState(false);const [unknown,setUnknown]=useState(false);const [error,setError]=useState('');
  async function remove(){
    if(pending||unknown||name!==student.name)return;setPending(true);setError('');
    try{
      await requestJson(`students/${encodeURIComponent(student.id)}`,{method:'DELETE'});
      // A confirmed delete must also be absent on a new read. Other errors do not prove absence.
      try{await requestJson(`students/${encodeURIComponent(student.id)}`);throw new Error('Student remains after delete');}
      catch(err){if(!(err instanceof ApiError&&err.status===404))throw err;}
      cache.removeQueries({queryKey:[...sessionKey(user),'student',student.id]});
      await cache.invalidateQueries({queryKey:sessionKey(user)});onClose();
    }catch(err){const uncertain=!(err instanceof ApiError)||err.status>=500;setUnknown(uncertain);setError(uncertain?c('无法确认结果。请关闭并刷新学生列表核对后再操作。','Outcome is unconfirmed. Close and refresh the roster before another attempt.'):err.message);}
    finally{setPending(false);}
  }
  return <AlertDialog open onOpenChange={open=>{if(!open&&!pending)onClose();}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{c(`永久删除 ${student.name}？`,`Permanently delete ${student.name}?`)}</AlertDialogTitle><AlertDialogDescription>{c('这会永久删除学生及所有关联学习记录，包括回收站中的记录、试卷、考试、汇报、章节进度、家长关联和个人设置。不能从回收站恢复。','This permanently deletes the student and all related learning records, including records in the bin, papers, exams, reports, chapter progress, parent bindings and student settings. They cannot be restored from the bin.')}</AlertDialogDescription></AlertDialogHeader><label className="web-field">{c('输入学生姓名确认','Type the student name to confirm')}<Input value={name} disabled={pending||unknown} onChange={event=>setName(event.target.value)}/></label>{error&&<p role="alert">{error}</p>}<AlertDialogFooter><AlertDialogCancel disabled={pending}>{c('取消','Cancel')}</AlertDialogCancel><Button variant="destructive" disabled={pending||unknown||name!==student.name} onClick={()=>void remove()}>{pending?c('删除中…','Deleting…'):c('永久删除','Permanently delete')}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
