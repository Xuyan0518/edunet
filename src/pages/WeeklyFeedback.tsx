import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarIcon, Plus, MinusCircle, CheckCircle2 } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, addDays } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { weeklyFeedback } from '@/utils/demoData';
import {Badge} from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { buildApiUrl } from '@/config/api';

interface WeeklyFeedbackEntry {
  studentId: string;
  weekStarting: string;
  weekEnding: string;
  summary: string;
  strengths: string[];
  areasToImprove: string[];
  teacherNotes: string;
  nextWeekFocus: string;
}

const CreateWeeklyFeedback: React.FC = () => {
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [weekStarting, setWeekStarting] = useState<Date | undefined>(new Date());
  const [weekEnding, setWeekEnding] = useState<Date | undefined>(addDays(new Date(), 4)); // Default to 5-day week
  const [summary, setSummary] = useState<string>('');
  const [strengths, setStrengths] = useState<string[]>(['']);
  const [areasToImprove, setAreasToImprove] = useState<string[]>(['']);
  const [teacherNotes, setTeacherNotes] = useState<string>('');
  const [nextWeekFocus, setNextWeekFocus] = useState<string>('');
  
  const navigate = useNavigate();
  const { toast } = useToast();
  
  useEffect(() => {
      const fetchStudents = async () => {
        try {
          const response = await fetch(buildApiUrl('students'));
          if (!response.ok) throw new Error('Network response was not ok');
          const data = await response.json();
          setStudents(data);
        } catch (error) {
          console.error('Error fetching students:', error);
          toast({
            title: 'Error',
            description: 'Failed to fetch students',
            variant: 'destructive',
          });
        }
      };
      fetchStudents();
    }, [toast]);

  const handleAddStrength = () => {
    setStrengths([...strengths, '']);
  };
  
  const handleRemoveStrength = (index: number) => {
    const updatedStrengths = [...strengths];
    updatedStrengths.splice(index, 1);
    setStrengths(updatedStrengths);
  };
  
  const handleStrengthChange = (index: number, value: string) => {
    const updatedStrengths = [...strengths];
    updatedStrengths[index] = value;
    setStrengths(updatedStrengths);
  };
  
  const handleAddAreaToImprove = () => {
    setAreasToImprove([...areasToImprove, '']);
  };
  
  const handleRemoveAreaToImprove = (index: number) => {
    const updatedAreas = [...areasToImprove];
    updatedAreas.splice(index, 1);
    setAreasToImprove(updatedAreas);
  };
  
  const handleAreaToImproveChange = (index: number, value: string) => {
    const updatedAreas = [...areasToImprove];
    updatedAreas[index] = value;
    setAreasToImprove(updatedAreas);
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!selectedStudent) {
      toast({
        title: "Error",
        description: "Please select a student",
        variant: "destructive",
      });
      return;
    }
    
    if (!weekStarting || !weekEnding) {
      toast({
        title: "Error",
        description: "Please select both start and end dates for the week",
        variant: "destructive",
      });
      return;
    }
    
    if (!summary) {
      toast({
        title: "Error",
        description: "Please provide a weekly summary",
        variant: "destructive",
      });
      return;
    }
    
    if (strengths.some(s => !s.trim()) || areasToImprove.some(a => !a.trim())) {
      toast({
        title: "Error",
        description: "Please fill out all strengths and areas to improve or remove empty ones",
        variant: "destructive",
      });
      return;
    }
    
    // Filter out any empty entries
    const filteredStrengths = strengths.filter(s => s.trim());
    const filteredAreasToImprove = areasToImprove.filter(a => a.trim());
    
    // Create feedback entry object
    const feedbackEntry: WeeklyFeedbackEntry = {
      studentId: selectedStudent,
      weekStarting: format(weekStarting, 'yyyy-MM-dd'),
      weekEnding: format(weekEnding, 'yyyy-MM-dd'),
      summary,
      strengths: filteredStrengths,
      areasToImprove: filteredAreasToImprove,
      teacherNotes,
      nextWeekFocus,
    };

    console.log('Submitting weekly feedback:', feedbackEntry);
    
    const response = await fetch(buildApiUrl('feedback'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedbackEntry),
    })
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to save progress');
    } else {
      toast({
        title: "Success",
        description: "Weekly feedback has been saved successfully",
      });
    }
    // Navigate back to dashboard
    navigate('/dashboard');
  };
  
  // When week starting date changes, update the week ending date
  const handleWeekStartingChange = (date: Date | undefined) => {
    setWeekStarting(date);
    if (date) {
      setWeekEnding(addDays(date, 4)); // Default to 5-day week
    }
  };
  
  return (
    <div className="container mx-auto py-8 px-4 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Create Weekly Feedback</h1>
        <p className="text-muted-foreground mt-1">Provide comprehensive weekly feedback for a student</p>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-8">
        <Card className="hover-card">
          <CardHeader>
            <CardTitle>Student Information</CardTitle>
            <CardDescription>Select a student and week for this feedback</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="student">Student</Label>
                <Select 
                  value={selectedStudent} 
                  onValueChange={setSelectedStudent}
                >
                  <SelectTrigger id="student" className="focus-within-ring">
                    <SelectValue placeholder="Select a student" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Week Starting</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal focus-within-ring"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {weekStarting ? format(weekStarting, 'PPP') : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={weekStarting}
                      onSelect={handleWeekStartingChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="space-y-2">
                <Label>Week Ending</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal focus-within-ring"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {weekEnding ? format(weekEnding, 'PPP') : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={weekEnding}
                      onSelect={setWeekEnding}
                      initialFocus
                      disabled={(date) => weekStarting ? date < weekStarting : false}
                    />
                  </PopoverContent>
                </Popover>
              </div>
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
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Enter a comprehensive summary of the student's performance, behavior, and progress this week..."
              className="min-h-[120px] focus-within-ring"
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
                />
                {index > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveStrength(index)}
                  >
                    <MinusCircle className="h-5 w-5 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
            
            <Button
              type="button"
              variant="outline"
              onClick={handleAddStrength}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Another Strength
            </Button>
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
                />
                {index > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveAreaToImprove(index)}
                  >
                    <MinusCircle className="h-5 w-5 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
            
            <Button
              type="button"
              variant="outline"
              onClick={handleAddAreaToImprove}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Another Area
            </Button>
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
                onChange={(e) => setTeacherNotes(e.target.value)}
                placeholder="Any additional notes or comments you'd like to share with the parents..."
                className="min-h-[100px] focus-within-ring"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="next-week">Next Week's Focus</Label>
              <Textarea
                id="next-week"
                value={nextWeekFocus}
                onChange={(e) => setNextWeekFocus(e.target.value)}
                placeholder="Outline what will be covered or focused on next week..."
                className="min-h-[100px] focus-within-ring"
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end space-x-4">
            <Button variant="outline" type="button" onClick={() => navigate('/dashboard')}>
              Cancel
            </Button>
            <Button type="submit">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Save Weekly Feedback
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
};

const ViewWeeklyFeedback: React.FC = () => {
  // Group weekly feedback by student
  const feedbackByStudent: Record<string, type> = {};
  
  weeklyFeedback.forEach(feedback => {
    if (!feedbackByStudent[feedback.studentId]) {
      feedbackByStudent[feedback.studentId] = [];
    }
    feedbackByStudent[feedback.studentId].push(feedback);
  });
  
  return (
    <div className="container mx-auto py-8 px-4 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">View Weekly Feedback</h1>
        <p className="text-muted-foreground mt-1">Review past weekly feedback for your students</p>
      </div>
      
      <Tabs defaultValue={Object.keys(feedbackByStudent)[0]} className="space-y-8">
        <TabsList className="flex flex-wrap space-x-2 space-y-2">
          {Object.keys(feedbackByStudent).map(studentId => {
            const student = students.find(s => s.id === studentId);
            return (
              <TabsTrigger key={studentId} value={studentId} className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                {student?.name}
              </TabsTrigger>
            );
          })}
        </TabsList>
        
        {Object.entries(feedbackByStudent).map(([studentId, entries]) => {
          const student = students.find(s => s.id === studentId);
          
          return (
            <TabsContent key={studentId} value={studentId} className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>{student?.name}</CardTitle>
                    <Badge variant="outline">
                      {entries.length} Reports
                    </Badge>
                  </div>
                  <CardDescription>{student?.grade} • Age {student?.age}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {entries.sort((a, b) => new Date(b.weekStarting).getTime() - new Date(a.weekStarting).getTime()).map(feedback => (
                      <Card key={feedback.id} className="hover-card">
                        <CardContent className="p-6">
                          <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold">Week of {formatDateRange(feedback.weekStarting, feedback.weekEnding)}</h3>
                          </div>
                          
                          <div className="space-y-6">
                            <div>
                              <h4 className="font-medium text-sm mb-2">Weekly Summary</h4>
                              <p className="text-sm">{feedback.summary}</p>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <h4 className="font-medium text-sm mb-2">Strengths</h4>
                                <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                                  {feedback.strengths.map((strength, index) => (
                                    <li key={index}>{strength}</li>
                                  ))}
                                </ul>
                              </div>
                              
                              <div>
                                <h4 className="font-medium text-sm mb-2">Areas to Improve</h4>
                                <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                                  {feedback.areasToImprove.map((area, index) => (
                                    <li key={index}>{area}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                            
                            <div>
                              <h4 className="font-medium text-sm mb-2">Weekly Tasks Summary</h4>
                              <p className="text-sm text-muted-foreground">{feedback.weeklyTasksSummary}</p>
                            </div>
                            
                            <div>
                              <h4 className="font-medium text-sm mb-2">Teacher Notes</h4>
                              <p className="text-sm text-muted-foreground">{feedback.teacherNotes}</p>
                            </div>
                            
                            <div className="bg-secondary/50 p-4 rounded-md">
                              <h4 className="font-medium text-sm mb-2">Next Week's Focus</h4>
                              <p className="text-sm">{feedback.nextWeekFocus}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
};

// Helper function to format date range
const formatDateRange = (start: string, end: string): string => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  
  return `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
};

const WeeklyFeedback: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'create' | 'view'>('create');
  const { role } = useAuth();
  
  if (role !== 'teacher') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Unauthorized access. Only teachers can view this page.</p>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8 px-4 animate-fade-in">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'create' | 'view')} className="space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">Weekly Feedback</h1>
          <TabsList>
            <TabsTrigger value="create" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              Create New
            </TabsTrigger>
            <TabsTrigger value="view" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              View Reports
            </TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="create">
          <CreateWeeklyFeedback />
        </TabsContent>
        
        <TabsContent value="view">
          <ViewWeeklyFeedback />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WeeklyFeedback;
