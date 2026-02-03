import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarIcon, Plus, MinusCircle, CheckCircle2, Edit2, XCircle, ArrowLeft } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, addDays, parse } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';
import { getAuthHeaders } from '@/utils/auth';

interface WeeklyFeedbackEntry {
  id?: string;
  studentId: string;
  weekStarting: string; // yyyy-MM-dd
  weekEnding: string;   // yyyy-MM-dd
  summary: string;
  strengths: string[];
  areasToImprove: string[];
  teacherNotes: string;
  nextWeekFocus: string;
}

function previousSunday(d: Date) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = date.getDay(); // 0=Sun
  date.setDate(date.getDate() - dow);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

const WeeklyFeedbackForm: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // URL param: only student (optional)
  const [searchParams, setSearchParams] = useSearchParams();
  const studentIdFromUrl = searchParams.get('student') || '';

  // Students list
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>(studentIdFromUrl || '');

  // Week selection (default current Sunday -> Thursday). Not synced to URL.
  const defaultStart = useMemo(() => previousSunday(new Date()), []);
  const [weekStarting, setWeekStarting] = useState<Date | undefined>(defaultStart);
  const weekEnding = useMemo(() => (weekStarting ? addDays(weekStarting, 4) : undefined), [weekStarting]);

  // Form state
  const [summary, setSummary] = useState<string>('');
  const [strengths, setStrengths] = useState<string[]>(['']);
  const [areasToImprove, setAreasToImprove] = useState<string[]>(['']);
  const [teacherNotes, setTeacherNotes] = useState<string>('');
  const [nextWeekFocus, setNextWeekFocus] = useState<string>('');

  // View/edit flow
  const [existingId, setExistingId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [backup, setBackup] = useState<WeeklyFeedbackEntry | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const didLoadStudentsRef = useRef(false);

  // Helpers
  const resetForm = () => {
    setSummary('');
    setStrengths(['']);
    setAreasToImprove(['']);
    setTeacherNotes('');
    setNextWeekFocus('');
  };

  const safeSetWeekStarting = (d?: Date) => {
    if (!d) return;
    if (!weekStarting || d.getTime() !== weekStarting.getTime()) setWeekStarting(d);
  };

  // Load students (once)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(buildApiUrl('students'), {
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error('Network response was not ok');
        const data = await res.json();
        if (cancelled) return;
        setStudents(data);

        // If URL had ?student=, set only if valid; else leave blank
        if (studentIdFromUrl) {
          if (data.some((s: any) => s.id === studentIdFromUrl) && selectedStudent !== studentIdFromUrl) {
            setSelectedStudent(studentIdFromUrl);
          } else if (!data.some((s: any) => s.id === studentIdFromUrl) && selectedStudent !== '') {
            setSelectedStudent('');
          }
        }
      } catch (err) {
        console.error('Error fetching students:', err);
        toast({ title: 'Error', description: 'Failed to fetch students', variant: 'destructive' });
      } finally {
        didLoadStudentsRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Single guarded URL-sync effect — only for ?student=
  useEffect(() => {
    if (!didLoadStudentsRef.current) return;

    const currentStudent = searchParams.get('student') || '';
    const desiredStudent = selectedStudent || '';

    let changed = false;
    const next = new URLSearchParams(searchParams);

    if (desiredStudent) {
      if (currentStudent !== desiredStudent) {
        next.set('student', desiredStudent);
        changed = true;
      }
    } else if (currentStudent) {
      next.delete('student');
      changed = true;
    }

    if (changed) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent]);

  // Fetch existing weekly feedback when student or week changes
  useEffect(() => {
    if (!selectedStudent || !weekStarting) {
      setExistingId(null);
      setIsEditing(false);
      resetForm();
      return;
    }

    const ac = new AbortController();
    (async () => {
      setIsLoading(true);
      try {
        const startStr = format(weekStarting, 'yyyy-MM-dd');
        const url = `${buildApiUrl('feedback/one')}?studentId=${encodeURIComponent(
          selectedStudent
        )}&weekStarting=${encodeURIComponent(startStr)}`;
        const res = await fetch(url, { 
          signal: ac.signal,
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error('Failed to fetch weekly feedback');
        const data: WeeklyFeedbackEntry | null = await res.json();

        if (ac.signal.aborted) return;

        if (data) {
          setExistingId(data.id || null);
          setSummary(data.summary ?? '');
          setStrengths(Array.isArray(data.strengths) && data.strengths.length ? data.strengths : ['']);
          setAreasToImprove(
            Array.isArray(data.areasToImprove) && data.areasToImprove.length ? data.areasToImprove : ['']
          );
          setTeacherNotes(data.teacherNotes ?? '');
          setNextWeekFocus(data.nextWeekFocus ?? '');
          setIsEditing(false);
        } else {
          setExistingId(null);
          setIsEditing(true);
          resetForm();
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          console.error(e);
          toast({ title: 'Error', description: 'Failed to fetch weekly feedback', variant: 'destructive' });
          setExistingId(null);
          setIsEditing(true);
          resetForm();
        }
      } finally {
        if (!ac.signal.aborted) setIsLoading(false);
      }
    })();

    return () => ac.abort();
    // Only re-run on actual triggers; do NOT include toast/searchParams/etc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent, weekStarting]);

  // List field handlers (respect view/edit)
  const handleAddStrength = () => isEditing && setStrengths((s) => [...s, '']);
  const handleRemoveStrength = (i: number) => {
    if (!isEditing) return;
    setStrengths((s) => (s.length <= 1 ? s : s.filter((_, idx) => idx !== i)));
  };
  const handleStrengthChange = (i: number, v: string) => {
    if (!isEditing) return;
    setStrengths((s) => s.map((x, idx) => (idx === i ? v : x)));
  };

  const handleAddAreaToImprove = () => isEditing && setAreasToImprove((a) => [...a, '']);
  const handleRemoveAreaToImprove = (i: number) => {
    if (!isEditing) return;
    setAreasToImprove((a) => (a.length <= 1 ? a : a.filter((_, idx) => idx !== i)));
  };
  const handleAreaToImproveChange = (i: number, v: string) => {
    if (!isEditing) return;
    setAreasToImprove((a) => a.map((x, idx) => (idx === i ? v : x)));
  };

  const handleWeekSelect = (date: Date | undefined) => {
    if (date && date.getDay() === 0) safeSetWeekStarting(date);
  };

  // Validation
  const validate = () => {
    if (!selectedStudent) {
      toast({ title: 'Error', description: 'Please select a student', variant: 'destructive' });
      return false;
    }
    if (!weekStarting || !weekEnding) {
      toast({ title: 'Error', description: 'Please select a week starting (Sunday)', variant: 'destructive' });
      return false;
    }
    if (!summary.trim()) {
      toast({ title: 'Error', description: 'Please provide a weekly summary', variant: 'destructive' });
      return false;
    }
    if (strengths.some((s) => !s.trim()) || areasToImprove.some((a) => !a.trim())) {
      toast({
        title: 'Error',
        description: 'Please fill out all strengths/areas or remove empty ones',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  // Submit (create or update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const payload: WeeklyFeedbackEntry = {
      studentId: selectedStudent,
      weekStarting: format(weekStarting!, 'yyyy-MM-dd'),
      weekEnding: format(weekEnding!, 'yyyy-MM-dd'),
      summary: summary.trim(),
      strengths: strengths.map((s) => s.trim()),
      areasToImprove: areasToImprove.map((a) => a.trim()),
      teacherNotes: teacherNotes.trim(),
      nextWeekFocus: nextWeekFocus.trim(),
    };

    try {
      let res: Response;
      if (existingId && isEditing) {
        res = await fetch(buildApiUrl(`feedback/${existingId}`), {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({ ...payload, id: existingId }),
          // backend accepts id in body
        });
      } else if (!existingId) {
        res = await fetch(buildApiUrl('feedback'), {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
      } else {
        toast({ title: 'Info', description: 'No changes to save', variant: 'default' });
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save weekly feedback');
      }

      const saved = await res.json();
      setExistingId(saved.id ?? existingId);
      setIsEditing(false);
      setBackup(null);

      toast({
        title: 'Success',
        description: `Weekly feedback ${existingId ? 'updated' : 'created'} successfully`,
      });
    } catch (err: any) {
      console.error('Error saving weekly feedback:', err);
      toast({ title: 'Error', description: err.message ?? 'Save failed', variant: 'destructive' });
    }
  };

  // UI
  return (
    <div className="container mx-auto py-8 px-4 animate-fade-in">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/students')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Students
        </Button>
      </div>
      
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Weekly Feedback</h1>
        <p className="text-muted-foreground mt-1">
          {existingId && !isEditing
            ? 'Viewing existing feedback. Click Edit to modify.'
            : existingId && isEditing
            ? 'Editing existing feedback.'
            : 'Create a new weekly feedback entry.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <Card className="hover-card">
          <CardHeader>
            <CardTitle>Student & Week</CardTitle>
            <CardDescription>Select a student and a Sunday to define the week (Sun → Thu)</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="student">Student</Label>
              <Select
                value={selectedStudent}
                onValueChange={(val) => {
                  if (val !== selectedStudent) setSelectedStudent(val);
                }}
                disabled={isLoading}
              >
                <SelectTrigger id="student" className="focus-within-ring">
                  <SelectValue placeholder="Select a student" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Week (pick a Sunday)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal focus-within-ring"
                    disabled={isLoading}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {weekStarting ? (
                      <>
                        {format(weekStarting, 'PPP')} &nbsp;→&nbsp;{' '}
                        {weekEnding ? format(weekEnding, 'PPP') : 'Thu'}
                      </>
                    ) : (
                      <span>Pick a Sunday</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={weekStarting}
                    onSelect={handleWeekSelect}
                    disabled={(date) => date.getDay() !== 0}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                The end date (Thursday) is auto-calculated from the selected Sunday.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-card">
          <CardHeader>
            <CardTitle>Weekly Summary</CardTitle>
            <CardDescription>Provide an overview of the student's performance this week</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={summary}
              onChange={(e) => isEditing && setSummary(e.target.value)}
              placeholder="Enter a comprehensive summary..."
              className="min-h-[120px] focus-within-ring"
              readOnly={!isEditing}
            />
          </CardContent>
        </Card>

        <Card className="hover-card">
          <CardHeader>
            <CardTitle>Strengths</CardTitle>
            <CardDescription>Highlight the student's strengths demonstrated this week</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {strengths.map((strength, index) => (
              <div key={index} className="flex items-center space-x-2">
                <Input
                  value={strength}
                  onChange={(e) => handleStrengthChange(index, e.target.value)}
                  placeholder={`Strength ${index + 1}`}
                  className="focus-within-ring"
                  readOnly={!isEditing}
                />
                {isEditing && index > 0 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveStrength(index)}>
                    <MinusCircle className="h-5 w-5 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
            {isEditing && (
              <Button type="button" variant="outline" onClick={handleAddStrength} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Another Strength
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="hover-card">
          <CardHeader>
            <CardTitle>Areas to Improve</CardTitle>
            <CardDescription>Identify areas where the student could improve</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {areasToImprove.map((area, index) => (
              <div key={index} className="flex items-center space-x-2">
                <Input
                  value={area}
                  onChange={(e) => handleAreaToImproveChange(index, e.target.value)}
                  placeholder={`Area ${index + 1}`}
                  className="focus-within-ring"
                  readOnly={!isEditing}
                />
                {isEditing && index > 0 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveAreaToImprove(index)}>
                    <MinusCircle className="h-5 w-5 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
            {isEditing && (
              <Button type="button" variant="outline" onClick={handleAddAreaToImprove} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Another Area
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="hover-card">
          <CardHeader>
            <CardTitle>Additional Information</CardTitle>
            <CardDescription>Provide more context and future plans</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="teacher-notes">Teacher Notes</Label>
              <Textarea
                id="teacher-notes"
                value={teacherNotes}
                onChange={(e) => isEditing && setTeacherNotes(e.target.value)}
                placeholder="Any additional notes..."
                className="min-h-[100px] focus-within-ring"
                readOnly={!isEditing}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="next-week">Next Week's Focus</Label>
              <Textarea
                id="next-week"
                value={nextWeekFocus}
                onChange={(e) => isEditing && setNextWeekFocus(e.target.value)}
                placeholder="Outline what will be covered or focused on next week..."
                className="min-h-[100px] focus-within-ring"
                readOnly={!isEditing}
              />
            </div>
          </CardContent>

          <CardFooter className="flex justify-end gap-2">
            {/* View mode: Edit */}
            {!isEditing && existingId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBackup({
                    id: existingId || undefined,
                    studentId: selectedStudent,
                    weekStarting: format(weekStarting!, 'yyyy-MM-dd'),
                    weekEnding: format(weekEnding!, 'yyyy-MM-dd'),
                    summary,
                    strengths: [...strengths],
                    areasToImprove: [...areasToImprove],
                    teacherNotes,
                    nextWeekFocus,
                  });
                  setIsEditing(true);
                }}
              >
                <Edit2 size={16} className="mr-2" />
                Edit
              </Button>
            )}

            {/* Edit mode on existing: Cancel + Update */}
            {isEditing && existingId && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => {
                    if (backup) {
                      setSummary(backup.summary);
                      setStrengths(backup.strengths);
                      setAreasToImprove(backup.areasToImprove);
                      setTeacherNotes(backup.teacherNotes);
                      setNextWeekFocus(backup.nextWeekFocus);
                      const restored = parse(backup.weekStarting, 'yyyy-MM-dd', new Date());
                      safeSetWeekStarting(restored);
                      setExistingId(backup.id || null);
                    }
                    setBackup(null);
                    setIsEditing(false);
                  }}
                >
                  <XCircle size={16} className="mr-2" />
                  Cancel Edit
                </Button>
                <Button type="submit" disabled={isLoading}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Update Feedback
                </Button>
              </>
            )}

            {/* New record: Save */}
            {!existingId && isEditing && (
              <Button type="submit" disabled={isLoading}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Save Weekly Feedback
              </Button>
            )}
          </CardFooter>
        </Card>
      </form>
    </div>
  );
};

export default WeeklyFeedbackForm;








// const ViewWeeklyFeedback: React.FC = () => {
//   // Group weekly feedback by student
//   const feedbackByStudent: Record<string, type> = {};
  
//   weeklyFeedback.forEach(feedback => {
//     if (!feedbackByStudent[feedback.studentId]) {
//       feedbackByStudent[feedback.studentId] = [];
//     }
//     feedbackByStudent[feedback.studentId].push(feedback);
//   });
  
//   return (
//     <div className="container mx-auto py-8 px-4 animate-fade-in">
//       <div className="mb-8">
//         <h1 className="text-3xl font-bold tracking-tight">View Weekly Feedback</h1>
//         <p className="text-muted-foreground mt-1">Review past weekly feedback for your students</p>
//       </div>
      
//       <Tabs defaultValue={Object.keys(feedbackByStudent)[0]} className="space-y-8">
//         <TabsList className="flex flex-wrap space-x-2 space-y-2">
//           {Object.keys(feedbackByStudent).map(studentId => {
//             const student = students.find(s => s.id === studentId);
//             return (
//               <TabsTrigger key={studentId} value={studentId} className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
//                 {student?.name}
//               </TabsTrigger>
//             );
//           })}
//         </TabsList>
        
//         {Object.entries(feedbackByStudent).map(([studentId, entries]) => {
//           const student = students.find(s => s.id === studentId);
          
//           return (
//             <TabsContent key={studentId} value={studentId} className="space-y-6">
//               <Card>
//                 <CardHeader>
//                   <div className="flex justify-between items-center">
//                     <CardTitle>{student?.name}</CardTitle>
//                     <Badge variant="outline">
//                       {entries.length} Reports
//                     </Badge>
//                   </div>
//                   <CardDescription>{student?.grade} • Age {student?.age}</CardDescription>
//                 </CardHeader>
//                 <CardContent>
//                   <div className="space-y-6">
//                     {entries.sort((a, b) => new Date(b.weekStarting).getTime() - new Date(a.weekStarting).getTime()).map(feedback => (
//                       <Card key={feedback.id} className="hover-card">
//                         <CardContent className="p-6">
//                           <div className="flex justify-between items-center mb-4">
//                             <h3 className="text-lg font-semibold">Week of {formatDateRange(feedback.weekStarting, feedback.weekEnding)}</h3>
//                           </div>
                          
//                           <div className="space-y-6">
//                             <div>
//                               <h4 className="font-medium text-sm mb-2">Weekly Summary</h4>
//                               <p className="text-sm">{feedback.summary}</p>
//                             </div>
                            
//                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                               <div>
//                                 <h4 className="font-medium text-sm mb-2">Strengths</h4>
//                                 <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
//                                   {feedback.strengths.map((strength, index) => (
//                                     <li key={index}>{strength}</li>
//                                   ))}
//                                 </ul>
//                               </div>
                              
//                               <div>
//                                 <h4 className="font-medium text-sm mb-2">Areas to Improve</h4>
//                                 <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
//                                   {feedback.areasToImprove.map((area, index) => (
//                                     <li key={index}>{area}</li>
//                                   ))}
//                                 </ul>
//                               </div>
//                             </div>
                            
//                             <div>
//                               <h4 className="font-medium text-sm mb-2">Weekly Tasks Summary</h4>
//                               <p className="text-sm text-muted-foreground">{feedback.weeklyTasksSummary}</p>
//                             </div>
                            
//                             <div>
//                               <h4 className="font-medium text-sm mb-2">Teacher Notes</h4>
//                               <p className="text-sm text-muted-foreground">{feedback.teacherNotes}</p>
//                             </div>
                            
//                             <div className="bg-secondary/50 p-4 rounded-md">
//                               <h4 className="font-medium text-sm mb-2">Next Week's Focus</h4>
//                               <p className="text-sm">{feedback.nextWeekFocus}</p>
//                             </div>
//                           </div>
//                         </CardContent>
//                       </Card>
//                     ))}
//                   </div>
//                 </CardContent>
//               </Card>
//             </TabsContent>
//           );
//         })}
//       </Tabs>
//     </div>
//   );
// };

// // Helper function to format date range
// const formatDateRange = (start: string, end: string): string => {
//   const startDate = new Date(start);
//   const endDate = new Date(end);
  
//   return `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
// };

// const WeeklyFeedback: React.FC = () => {
//   const [activeTab, setActiveTab] = useState<'create' | 'view'>('create');
//   const { role } = useAuth();
  
//   if (role !== 'teacher') {
//     return (
//       <div className="min-h-screen flex items-center justify-center">
//         <p>Unauthorized access. Only teachers can view this page.</p>
//       </div>
//     );
//   }
  
//   return (
//     <div className="container mx-auto py-8 px-4 animate-fade-in">
//       <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'create' | 'view')} className="space-y-8">
//         <div className="flex justify-between items-center">
//           <h1 className="text-3xl font-bold tracking-tight">Weekly Feedback</h1>
//           <TabsList>
//             <TabsTrigger value="create" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
//               Create New
//             </TabsTrigger>
//             <TabsTrigger value="view" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
//               View Reports
//             </TabsTrigger>
//           </TabsList>
//         </div>
        
//         <TabsContent value="create">
//           <CreateWeeklyFeedback />
//         </TabsContent>
        
//         <TabsContent value="view">
//           <ViewWeeklyFeedback />
//         </TabsContent>
//       </Tabs>
//     </div>
//   );
// };


