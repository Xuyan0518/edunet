import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Mail, Phone, MapPin, Plus } from 'lucide-react';
// import { students } from '@/utils/demoData';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Student } from 'src/services/api';


const Students: React.FC = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();

  // Determine which students to show
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const res = await fetch('http://localhost:3003/api/students');
        const data = await res.json();
        setStudents(data);
      } catch (error) {
        console.error('Failed to fetch students:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
  }, []);


  const visibleStudents = role === 'teacher'
    ? students
    : students.filter((s) => s.parent_id === user?.id);

  return (
    <div className="container mx-auto py-8 px-4 animate-fade-in">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Students</h1>
          <p className="text-muted-foreground mt-1">
            {role === 'teacher' ? 'Manage and view all student profiles' : 'Your child’s profile'}
          </p>
        </div>

        {role === 'teacher' && (
          <Button onClick={() => navigate('/add-student')}>
            <Plus className="h-4 w-4 mr-2" />
            Add Student
          </Button>
        )}
      </div>

      {visibleStudents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleStudents.map((student) => (
            <Card key={student.id} className="hover-card">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <Users className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{student.name}</CardTitle>
                    <Badge variant="outline">Grade {student.grade}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">

                <div className="pt-4">
                  <Button asChild className="w-full">
                    <Link to={`/student/${student.id}`}>View Profile</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-center text-muted-foreground">No students to show.</p>
      )}
    </div>
  );
};

export default Students;
