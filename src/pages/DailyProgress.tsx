import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { type DailyProgress, api } from '@/services/api';
import { buildApiUrl } from '@/config/api';
import { format } from 'date-fns';

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

const DailyProgress: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const studentIdFromUrl = searchParams.get('student') || '';
  const navigate = useNavigate();
  const { role } = useAuth();

  const [selectedStudent, setSelectedStudent] = useState<string>(studentIdFromUrl || '');
  const [students, setStudents] = useState<{ id: string; name: string; grade: string }[]>([]);
  const [todayProgress, setTodayProgress] = useState<DailyProgressEntry | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<DailyProgressEntry>({
    studentId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    attendance: 'present',
    activities: [{ subject: '', description: '', performance: 'good', notes: '' }]
  });

  const today = format(new Date(), 'yyyy-MM-dd');

  // Fetch students and today's progress data
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch students
        const studentsRes = await fetch(buildApiUrl('students'));
        if (studentsRes.ok) {
          const studentsData = await studentsRes.json();
          setStudents(studentsData);
          
          // Set default student if none selected
          if (!selectedStudent && studentsData.length > 0) {
            setSelectedStudent(studentsData[0].id);
          }
        }

        // Fetch today's progress for selected student
        if (selectedStudent) {
          await fetchTodayProgress(selectedStudent);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedStudent]);

  // Fetch today's progress for a specific student
  const fetchTodayProgress = async (studentId: string) => {
    try {
      const response = await fetch(`${buildApiUrl('progress/student')}?studentId=${studentId}&date=${today}`);
      if (response.ok) {
        const progressData = await response.json();
        setTodayProgress(progressData);
        // Pre-fill form with existing data
        setFormData({
          studentId: progressData.studentId,
          date: progressData.date,
          attendance: progressData.attendance,
          activities: progressData.activities || [{ subject: '', description: '', performance: 'good', notes: '' }]
        });
      } else {
        // No progress for today, set up form for new entry
        setTodayProgress(null);
        setFormData({
          studentId: studentId,
          date: today,
          attendance: 'present',
          activities: [{ subject: '', description: '', performance: 'good', notes: '' }]
        });
      }
    } catch (error) {
      console.error('Error fetching today\'s progress:', error);
      // Set up form for new entry on error
      setFormData({
        studentId: studentId,
        date: today,
        attendance: 'present',
        activities: [{ subject: '', description: '', performance: 'good', notes: '' }]
      });
    }
  };

  // Handle student selection change
  const handleStudentChange = (studentId: string) => {
    setSelectedStudent(studentId);
    setIsEditing(false);
  };

  // Handle form field changes
  const handleFormChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Handle activity field changes
  const handleActivityChange = (index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      activities: prev.activities.map((activity, i) => 
        i === index ? { ...activity, [field]: value } : activity
      )
    }));
  };

  // Add new activity
  const addActivity = () => {
    setFormData(prev => ({
      ...prev,
      activities: [...prev.activities, { subject: '', description: '', performance: 'good', notes: '' }]
    }));
  };

  // Remove activity
  const removeActivity = (index: number) => {
    if (formData.activities.length > 1) {
      setFormData(prev => ({
        ...prev,
        activities: prev.activities.filter((_, i) => i !== index)
      }));
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (todayProgress) {
        // Update existing progress
        const response = await fetch(`${buildApiUrl('progress')}/${todayProgress.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        
        if (response.ok) {
          const updatedProgress = await response.json();
          setTodayProgress(updatedProgress);
          setIsEditing(false);
          alert('Progress updated successfully!');
        } else {
          throw new Error('Failed to update progress');
        }
      } else {
        // Create new progress
        const response = await fetch(buildApiUrl('progress'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        
        if (response.ok) {
          const newProgress = await response.json();
          setTodayProgress(newProgress);
          setIsEditing(false);
          alert('Progress recorded successfully!');
        } else {
          throw new Error('Failed to create progress');
        }
      }
    } catch (error) {
      console.error('Error saving progress:', error);
      alert('Error saving progress. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Get student name
  const getStudentName = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    return student?.name || 'Unknown Student';
  };

  // Get attendance badge color
  const getAttendanceBadge = (attendance: string) => {
    switch (attendance) {
      case 'present':
        return <Badge variant="default" className="bg-green-100 text-green-800">Present</Badge>;
      case 'absent':
        return <Badge variant="destructive">Absent</Badge>;
      case 'late':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Late</Badge>;
      default:
        return <Badge variant="outline">{attendance}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Daily Progress</h1>
        <p className="text-muted-foreground mt-1">
          Record or edit today's progress for {selectedStudent ? getStudentName(selectedStudent) : 'selected student'}
        </p>
      </div>

      {/* Student Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Select Student</label>
        <Select value={selectedStudent} onValueChange={handleStudentChange}>
          <SelectTrigger className="w-full max-w-xs">
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

      {selectedStudent && (
        <div className="space-y-6">
          {/* Today's Progress Summary */}
          {todayProgress && !isEditing && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Today's Progress - {format(new Date(today), 'EEEE, MMMM dd, yyyy')}</span>
                  <div className="flex items-center gap-2">
                    {getAttendanceBadge(todayProgress.attendance)}
                    <Button onClick={() => setIsEditing(true)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {todayProgress.activities && todayProgress.activities.length > 0 ? (
                    <div>
                      <h5 className="font-medium mb-3">Activities:</h5>
                      <div className="space-y-3">
                        {todayProgress.activities.map((activity, index) => (
                          <div key={index} className="pl-4 border-l-2 border-gray-200">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">{activity.subject}</span>
                              <Badge variant="outline" className="text-xs">
                                {activity.performance}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-1">
                              {activity.description}
                            </p>
                            {activity.notes && (
                              <p className="text-xs text-muted-foreground">
                                Notes: {activity.notes}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No activities recorded</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Progress Form */}
          {(!todayProgress || isEditing) && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {todayProgress ? 'Edit Progress' : 'Record Progress'} - {format(new Date(today), 'EEEE, MMMM dd, yyyy')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Attendance */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Attendance</label>
                    <Select value={formData.attendance} onValueChange={(value) => handleFormChange('attendance', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="present">Present</SelectItem>
                        <SelectItem value="absent">Absent</SelectItem>
                        <SelectItem value="late">Late</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Activities */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium">Activities</label>
                      <Button type="button" variant="outline" size="sm" onClick={addActivity}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Activity
                      </Button>
                    </div>
                    
                    <div className="space-y-4">
                      {formData.activities.map((activity, index) => (
                        <div key={index} className="p-4 border rounded-lg">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                            <div>
                              <label className="block text-sm font-medium mb-1">Subject</label>
                              <Input
                                value={activity.subject}
                                onChange={(e) => handleActivityChange(index, 'subject', e.target.value)}
                                placeholder="e.g., Math, Science"
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1">Performance</label>
                              <Select value={activity.performance} onValueChange={(value) => handleActivityChange(index, 'performance', value)}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="excellent">Excellent</SelectItem>
                                  <SelectItem value="good">Good</SelectItem>
                                  <SelectItem value="needs improvement">Needs Improvement</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          
                          <div className="mb-3">
                            <label className="block text-sm font-medium mb-1">Description</label>
                            <Textarea
                              value={activity.description}
                              onChange={(e) => handleActivityChange(index, 'description', e.target.value)}
                              placeholder="Describe what was covered in this subject"
                              required
                            />
                          </div>
                          
                          <div className="mb-3">
                            <label className="block text-sm font-medium mb-1">Notes (Optional)</label>
                            <Textarea
                              value={activity.notes}
                              onChange={(e) => handleActivityChange(index, 'notes', e.target.value)}
                              placeholder="Additional notes or observations"
                            />
                          </div>
                          
                          {formData.activities.length > 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeActivity(index)}
                              className="text-red-600 hover:text-red-700"
                            >
                              Remove Activity
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Form Actions */}
                  <div className="flex gap-3">
                    <Button type="submit" disabled={isLoading}>
                      {isLoading ? 'Saving...' : (todayProgress ? 'Update Progress' : 'Record Progress')}
                    </Button>
                    {isEditing && (
                      <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default DailyProgress;
