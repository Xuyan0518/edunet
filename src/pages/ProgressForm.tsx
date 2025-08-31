import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, MinusCircle, ArrowLeft } from 'lucide-react';
import { buildApiUrl } from '@/config/api';
import { format, parseISO } from 'date-fns';

interface Activity {
  subject: string;
  description: string;
  performance: string;
  notes: string;
}

interface DailyProgressEntry {
  id?: string;
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

const ProgressForm: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const studentId = searchParams.get('student') || '';
  const dateParam = searchParams.get('date') || '';
  const navigate = useNavigate();

  const [selectedStudent, setSelectedStudent] = useState<string>(studentId);
  const [selectedDate, setSelectedDate] = useState<Date>(dateParam ? parseISO(dateParam) : new Date());
  const [attendance, setAttendance] = useState<string>('present');
  const [activities, setActivities] = useState<Activity[]>([
    { subject: '', description: '', performance: '', notes: '' },
  ]);
  const [students, setStudents] = useState<{ id: string; name: string; grade: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [existingProgressId, setExistingProgressId] = useState<string | null>(null);

  // Fetch students
  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const response = await fetch(buildApiUrl('students'));
        if (response.ok) {
          const data = await response.json();
          setStudents(data);
          
          if (!selectedStudent && data.length > 0) {
            setSelectedStudent(data[0].id);
          }
        }
      } catch (error) {
        console.error('Error fetching students:', error);
      }
    };

    fetchStudents();
  }, [selectedStudent]);

  // Fetch existing progress if editing
  useEffect(() => {
    if (!selectedStudent || !selectedDate) return;

    const fetchExistingProgress = async () => {
      try {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const url = `${buildApiUrl('progress/student')}?studentId=${encodeURIComponent(selectedStudent)}&date=${encodeURIComponent(dateStr)}`;
        const response = await fetch(url);

        if (response.ok) {
          const data = await response.json();
          setExistingProgressId(data.id || null);
          setAttendance(data.attendance || 'present');
          setActivities(
            Array.isArray(data.activities) && data.activities.length > 0
              ? data.activities
              : [{ subject: '', description: '', performance: '', notes: '' }]
          );
        } else if (response.status === 404) {
          // No existing progress, reset form
          setExistingProgressId(null);
          setAttendance('present');
          setActivities([{ subject: '', description: '', performance: '', notes: '' }]);
        }
      } catch (error) {
        console.error('Error fetching existing progress:', error);
      }
    };

    fetchExistingProgress();
  }, [selectedStudent, selectedDate]);

  const handleAddActivity = () => {
    setActivities([...activities, { subject: '', description: '', performance: '', notes: '' }]);
  };

  const handleRemoveActivity = (index: number) => {
    if (activities.length > 1) {
      const updatedActivities = activities.filter((_, i) => i !== index);
      setActivities(updatedActivities);
    }
  };

  const handleActivityChange = (index: number, field: keyof Activity, value: string) => {
    const updatedActivities = [...activities];
    updatedActivities[index] = { ...updatedActivities[index], [field]: value };
    setActivities(updatedActivities);
  };

  const validateForm = () => {
    if (!selectedStudent) {
      alert('Please select a student');
      return false;
    }
    if (!selectedDate) {
      alert('Please select a date');
      return false;
    }
    if (activities.some(a => !a.subject || !a.description || !a.performance)) {
      alert('Please fill out all required fields for each activity');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const progressEntry: DailyProgressEntry = {
        id: existingProgressId,
        studentId: selectedStudent,
        date: format(selectedDate, 'yyyy-MM-dd'),
        attendance,
        activities,
      };

      const url = existingProgressId 
        ? buildApiUrl(`progress/${existingProgressId}`)
        : buildApiUrl('progress');
      
      const method = existingProgressId ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(progressEntry),
      });

      if (response.ok) {
        alert(`Progress ${existingProgressId ? 'updated' : 'created'} successfully!`);
        navigate('/daily-progress');
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save progress');
      }
    } catch (error: any) {
      console.error('Error saving progress:', error);
      alert(error.message || 'Failed to save progress. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getStudentName = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    return student?.name || 'Unknown Student';
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/daily-progress')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Progress
        </Button>
        
        <h1 className="text-3xl font-bold tracking-tight">
          {existingProgressId ? 'Edit Progress' : 'Add Progress'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {existingProgressId 
            ? `Editing progress for ${getStudentName(selectedStudent)} on ${format(selectedDate, 'PPP')}`
            : 'Create a new progress entry'
          }
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Student Information</CardTitle>
            <CardDescription>Select a student and date for this progress entry</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="student">Student</Label>
                <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a student" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map(student => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.name} (Grade {student.grade})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={format(selectedDate, 'yyyy-MM-dd')}
                  onChange={(e) => setSelectedDate(parseISO(e.target.value))}
                />
              </div>
            </div>

            <div>
              <Label>Attendance</Label>
              <div className="flex space-x-4 mt-2">
                {['present', 'absent', 'late'].map((status) => (
                  <div className="flex items-center space-x-2" key={status}>
                    <input
                      type="radio"
                      id={status}
                      value={status}
                      checked={attendance === status}
                      onChange={() => setAttendance(status)}
                      className="h-4 w-4"
                    />
                    <Label htmlFor={status} className="cursor-pointer capitalize">
                      {status}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activities</CardTitle>
            <CardDescription>Fill in the activities and performance details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activities.map((activity, index) => (
              <div key={index} className="space-y-4 p-4 border border-border rounded-md">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Activity {index + 1}</h4>
                  {activities.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveActivity(index)}
                    >
                      <MinusCircle className="h-4 w-4 mr-2" />
                      Remove
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`subject-${index}`}>Subject *</Label>
                    <Input
                      id={`subject-${index}`}
                      value={activity.subject}
                      onChange={(e) => handleActivityChange(index, 'subject', e.target.value)}
                      placeholder="Enter subject"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`performance-${index}`}>Performance *</Label>
                    <Select
                      value={activity.performance}
                      onValueChange={(value) => handleActivityChange(index, 'performance', value)}
                    >
                      <SelectTrigger>
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
                  <Label htmlFor={`description-${index}`}>Description *</Label>
                  <Input
                    id={`description-${index}`}
                    value={activity.description}
                    onChange={(e) => handleActivityChange(index, 'description', e.target.value)}
                    placeholder="Describe the activity"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`notes-${index}`}>Notes</Label>
                  <Textarea
                    id={`notes-${index}`}
                    value={activity.notes}
                    onChange={(e) => handleActivityChange(index, 'notes', e.target.value)}
                    placeholder="Additional notes (optional)"
                    rows={3}
                  />
                </div>
              </div>
            ))}

            <Button type="button" variant="outline" onClick={handleAddActivity} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Activity
            </Button>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/daily-progress')}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : (existingProgressId ? 'Update Progress' : 'Save Progress')}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ProgressForm;
