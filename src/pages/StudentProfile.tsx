import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useParams, useNavigate } from 'react-router-dom';
import { Student, api } from '@/services/api';
import { ArrowLeft, User, GraduationCap, Calendar } from 'lucide-react';

const StudentProfile: React.FC = () => {
  const { user, role } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      // Fetch specific student data
      const fetchStudent = async () => {
        try {
          const studentData = await api.getStudent(id);
          setStudent(studentData);
        } catch (error) {
          console.error('Failed to fetch student:', error);
        } finally {
          setLoading(false);
        }
      };
      fetchStudent();
    } else {
      setLoading(false);
    }
  }, [id]);

  // If viewing a specific student
  if (id && student) {
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
          
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
              <User className="h-8 w-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{student.name}</h1>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="text-lg px-3 py-1">
                  <GraduationCap className="h-4 w-4 mr-2" />
                  Grade {student.grade}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Student Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="font-medium">Name:</span>
                <span>{student.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Grade:</span>
                <span>{student.grade}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Enrolled:</span>
                <span>{new Date(student.created_at).toLocaleDateString()}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                className="w-full" 
                onClick={() => navigate(`/daily-progress?student=${student.id}`)}
              >
                View Daily Progress
              </Button>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => navigate(`/weekly-feedback?student=${student.id}`)}
              >
                View Weekly Feedback
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // If no specific student ID, show the overview (existing logic)
  if (role === 'teacher') {
    // Teacher sees all students
    return (
      <div className="container mx-auto py-8 px-4 animate-fade-in">
        <h1 className="text-3xl font-bold tracking-tight mb-6">All Students</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* This will be populated by the Students page */}
          <p className="text-muted-foreground">Use the Students page to view individual student profiles.</p>
        </div>
      </div>
    );
  } else {
    // Parent sees only their children
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>No student profile found.</p>
      </div>
    );
  }
};

export default StudentProfile;
