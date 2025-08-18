import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';

type User = {
  id: string;
  name: string;
  email: string;
};

const AdminDashboard: React.FC = () => {
  const [parents, setParents] = useState<User[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const { toast } = useToast();

  const fetchPending = async () => {
    try {
      const res = await fetch(buildApiUrl('admin/pending'));
      const data = await res.json();
      setParents(data.parents);
      setTeachers(data.teachers);
    } catch (error) {
      toast({ title: "Failed to fetch data", variant: "destructive" });
    }
  };

  const handleAction = async (id: string, role: string, action: 'approve' | 'reject') => {
    try {
      await fetch(buildApiUrl(`admin/${action}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, role }),
      });
      toast({ title: `User ${action}d`, description: `${role} account updated.` });
      fetchPending(); // refresh the list
    } catch (error) {
      toast({ title: `Failed to ${action} user`, variant: 'destructive' });
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>

      <Card>
        <CardHeader>
          <CardTitle>Pending Parents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {parents.length === 0 && <p>No pending parents</p>}
          {parents.map((parent) => (
            <div key={parent.id} className="flex justify-between items-center border p-3 rounded">
              <div>
                <p><strong>{parent.name}</strong></p>
                <p className="text-sm text-muted">{parent.email}</p>
              </div>
              <div className="space-x-2">
                <Button onClick={() => handleAction(parent.id, 'parent', 'approve')}>Approve</Button>
                <Button variant="destructive" onClick={() => handleAction(parent.id, 'parent', 'reject')}>Reject</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending Teachers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {teachers.length === 0 && <p>No pending teachers</p>}
          {teachers.map((teacher) => (
            <div key={teacher.id} className="flex justify-between items-center border p-3 rounded">
              <div>
                <p><strong>{teacher.name}</strong></p>
                <p className="text-sm text-muted">{teacher.email}</p>
              </div>
              <div className="space-x-2">
                <Button onClick={() => handleAction(teacher.id, 'teacher', 'approve')}>Approve</Button>
                <Button variant="destructive" onClick={() => handleAction(teacher.id, 'teacher', 'reject')}>Reject</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;
