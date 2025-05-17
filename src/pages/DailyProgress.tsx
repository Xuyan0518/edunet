import React, { useState, useEffect } from 'react';
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
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';

interface Activity {
  subject: string;
  description: string;
  performance: string;
  notes: string;
}

interface DailyProgressEntry {
  studentId: string;
  date: string;
  attendance: string;
  activities: Activity[];
}

const performanceOptions = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'needs improvement', label: 'Needs Improvement' },
];

const subjectOptions = [
  { value: 'Math', label: 'Math' },
  { value: 'Reading', label: 'Reading' },
  { value: 'Writing', label: 'Writing' },
  { value: 'Science', label: 'Science' },
  { value: 'Social Studies', label: 'Social Studies' },
  { value: 'Art', label: 'Art' },
  { value: 'Music', label: 'Music' },
  { value: 'Physical Education', label: 'Physical Education' },
];

const CreateDailyProgress: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [attendance, setAttendance] = useState<string>('present');
  const [activities, setActivities] = useState<Activity[]>([
    { subject: '', description: '', performance: '', notes: '' }
  ]);
  const [students, setStudents] = useState<{ id: string, name: string }[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Fetch students from the API
    const fetchStudents = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/students');
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const data = await response.json();
        setStudents(data);
      } catch (error) {
        console.error('Error fetching students:', error);
        toast({
          title: "Error",
          description: "Failed to fetch students",
          variant: "destructive",
        });
      }
    };

    fetchStudents();
  }, [toast]);

  const handleAddActivity = () => {
    setActivities([...activities, { subject: '', description: '', performance: '', notes: '' }]);
  };

  const handleRemoveActivity = (index: number) => {
    const updatedActivities = [...activities];
    updatedActivities.splice(index, 1);
    setActivities(updatedActivities);
  };

  const handleActivityChange = (index: number, field: keyof Activity, value: string) => {
    const updatedActivities = [...activities];
    updatedActivities[index] = { ...updatedActivities[index], [field]: value };
    setActivities(updatedActivities);
  };

  const handleSubmit = (e: React.FormEvent) => {
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

    if (!selectedDate) {
      toast({
        title: "Error",
        description: "Please select a date",
        variant: "destructive",
      });
      return;
    }

    if (activities.some(activity => !activity.subject || !activity.description || !activity.performance)) {
      toast({
        title: "Error",
        description: "Please fill out all required fields for each activity",
        variant: "destructive",
      });
      return;
    }

    // Create progress entry object
    const progressEntry: DailyProgressEntry = {
      studentId: selectedStudent,
      date: selectedDate.toISOString().split('T')[0],
      attendance,
      activities,
    };

    // In a real app, you would send this to the server
    console.log('Submitting daily progress:', progressEntry);

    // Show success message
    toast({
      title: "Success",
      description: "Daily progress has been saved successfully",
    });

    // Navigate back to dashboard
    navigate('/dashboard');
  };

  return (
    <div className="container mx-auto py-8 px-4 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Create Daily Progress Entry</h1>
        <p className="text-muted-foreground mt-1">Record a student's daily activities and performance</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <Card className="hover-card">
          <CardHeader>
            <CardTitle>Student Information</CardTitle>
            <CardDescription>Select a student and date for this progress entry</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                      <SelectItem key={student.id} value={student.name}>
                        {student.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal focus-within-ring"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, 'PPP') : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div>
              <Label>Attendance</Label>
              <div className="flex space-x-4 mt-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="present"
                    value="present"
                    checked={attendance === 'present'}
                    onChange={() => setAttendance('present')}
                    className="h-4 w-4 text-primary"
                  />
                  <Label htmlFor="present" className="cursor-pointer">Present</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="absent"
                    value="absent"
                    checked={attendance === 'absent'}
                    onChange={() => setAttendance('absent')}
                    className="h-4 w-4 text-destructive"
                  />
                  <Label htmlFor="absent" className="cursor-pointer">Absent</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="tardy"
                    value="tardy"
                    checked={attendance === 'tardy'}
                    onChange={() => setAttendance('tardy')}
                    className="h-4 w-4 text-amber-500"
                  />
                  <Label htmlFor="tardy" className="cursor-pointer">Tardy</Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-card">
          <CardHeader>
            <CardTitle>Activities</CardTitle>
            <CardDescription>Record activities and performance for the day</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {activities.map((activity, index) => (
              <div key={index} className="space-y-4 p-4 border border-border rounded-md relative">
                <div className="absolute top-4 right-4">
                  {index > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveActivity(index)}
                    >
                      <MinusCircle className="h-5 w-5 text-destructive" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`subject-${index}`}>Subject</Label>
                    <Select 
                      value={activity.subject} 
                      onValueChange={(value) => handleActivityChange(index, 'subject', value)}
                    >
                      <SelectTrigger id={`subject-${index}`} className="focus-within-ring">
                        <SelectValue placeholder="Select a subject" />
                      </SelectTrigger>
                      <SelectContent>
                        {subjectOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`performance-${index}`}>Performance</Label>
                    <Select 
                      value={activity.performance} 
                      onValueChange={(value) => handleActivityChange(index, 'performance', value)}
                    >
                      <SelectTrigger id={`performance-${index}`} className="focus-within-ring">
                        <SelectValue placeholder="Rate performance" />
                      </SelectTrigger>
                      <SelectContent>
                        {performanceOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`description-${index}`}>Description</Label>
                  <Input
                    id={`description-${index}`}
                    value={activity.description}
                    onChange={(e) => handleActivityChange(index, 'description', e.target.value)}
                    placeholder="Describe the activity"
                    className="focus-within-ring"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`notes-${index}`}>Teacher Notes</Label>
                  <Textarea
                    id={`notes-${index}`}
                    value={activity.notes}
                    onChange={(e) => handleActivityChange(index, 'notes', e.target.value)}
                    placeholder="Additional notes or observations"
                    className="focus-within-ring"
                  />
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={handleAddActivity}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Another Activity
            </Button>
          </CardContent>
          <CardFooter className="flex justify-end space-x-4">
            <Button variant="outline" type="button" onClick={() => navigate('/dashboard')}>
              Cancel
            </Button>
            <Button type="submit">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Save Progress Entry
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
};

export default CreateDailyProgress;
