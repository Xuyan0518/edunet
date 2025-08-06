import React, { useState, useEffect } from 'react';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select'; // Use your select component

const AddStudent: React.FC = () => {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [parentId, setParentId] = useState('');
  const [parents, setParents] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    console.log('Fetching unassigned parents...');
    api.getUnassignedParents().then(data => {
      console.log('Parents fetched:', data); // Inspect what you actually get
      setParents(data);
    }).catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createStudent({ name, grade, parentId: parentId || null });
    setName('');
    setGrade('');
    setParentId('');
    alert('Student added successfully');
  };

  return (
    <div className="max-w-xl mx-auto mt-10 space-y-6">
      <h1 className="text-2xl font-bold">Add New Student</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={e => setName(e.target.value)} required />
        </div>

        <div>
          <Label htmlFor="grade">Grade</Label>
          <Input id="grade" value={grade} onChange={e => setGrade(e.target.value)} required />
        </div>

        <div>
          <Label htmlFor="parent">Assign to Parent (optional)</Label>
          <select id="parent" value={parentId} onChange={e => setParentId(e.target.value)} className="w-full border px-3 py-2 rounded">
            <option value="">-- None --</option>
            {parents.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <Button type="submit" className="w-full">Add Student</Button>
      </form>
    </div>
  );
};

export default AddStudent;
