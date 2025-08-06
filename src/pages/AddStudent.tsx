import React, { useState } from 'react';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const AddStudent: React.FC = () => {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      name,
      grade,
    };

    await api.createStudent(payload);

    // Optionally reset form or redirect
    setName('');
    setGrade('');
    alert('Student added successfully');
  };

  return (
    <div className="max-w-xl mx-auto mt-10 space-y-6">
      <h1 className="text-2xl font-bold">Add New Student</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            placeholder="Student name"
          />
        </div>

        <div>
          <Label htmlFor="grade">Grade</Label>
          <Input
            id="grade"
            value={grade}
            onChange={e => setGrade(e.target.value)}
            required
            placeholder="e.g. Grade 3"
          />
        </div>

        <Button type="submit" className="w-full">
          Add Student
        </Button>
      </form>
    </div>
  );
};

export default AddStudent;
