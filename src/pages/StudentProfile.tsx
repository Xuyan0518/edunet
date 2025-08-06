import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { students } from '@/utils/demoData';  // Replace with actual data fetching later
import { useNavigate } from 'react-router-dom';

const StudentProfile: React.FC = () => {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  console.log('User role:', role);

  if (role === 'teacher') {
    // Teacher sees all students
    return (
      <div className="container mx-auto py-8 px-4 animate-fade-in">
        <h1 className="text-3xl font-bold tracking-tight mb-6">All Students</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {students.map(student => (
            <Card
              key={student.id}
              className="hover-card cursor-pointer"
              onClick={() => navigate(`/student/${student.id}`)}
            >
              <CardHeader>
                <CardTitle>{student.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p>Grade: {student.grade}</p>
                <Badge>{student.grade}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  } else {
    // Parent sees only their children
    const childrenStudents = students.filter(s => s.parentId === user?.id);

    if (childrenStudents.length === 0) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <p>No student profile found.</p>
        </div>
      );
    }

    return (
      <div className="container mx-auto py-8 px-4 animate-fade-in">
        <h1 className="text-3xl font-bold tracking-tight mb-4">My Child(ren)</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {childrenStudents.map(student => (
            <Card
              key={student.id}
              className="hover-card cursor-pointer"
              onClick={() => navigate(`/student/${student.id}`)}
            >
              <CardHeader>
                <CardTitle>{student.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p>Grade: {student.grade}</p>
                <Badge>{student.grade}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }
};

export default StudentProfile;
