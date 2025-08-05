import React, { useState, useEffect } from 'react';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const AddStudent: React.FC = () => {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [parentId, setParentId] = useState('');
  const [parents, setParents] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch('http://localhost:3003/api/parents')
      .then(res => res.json())
      .then(data => setParents(data));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createStudent({ name, grade, parent_id: Number(parentId) });
    // Optionally, show toast or redirect
  };

  return (
    <form onSubmit={handleSubmit}>
      <Label>Name</Label>
      <Input value={name} onChange={e => setName(e.target.value)} required />
      <Label>Grade</Label>
      <Input value={grade} onChange={e => setGrade(e.target.value)} required />
      <Label>Assign to Parent</Label>
      <select value={parentId} onChange={e => setParentId(e.target.value)} required>
        <option value="">Select Parent</option>
        {parents.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <Button type="submit">Add Student</Button>
    </form>
  );
};

export default AddStudent;