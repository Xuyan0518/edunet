import React, { useEffect, useMemo, useState } from 'react';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

type ParentLite = { id: string; name: string };
type Subject = { id: string; code: string; name: string; level: string };

const AddStudent: React.FC = () => {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [parentId, setParentId] = useState('');
  const [parents, setParents] = useState<ParentLite[]>([]);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectSearch, setSubjectSearch] = useState('');
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);

  const [loadingInit, setLoadingInit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingStudent, setLoadingStudent] = useState(false);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editId = searchParams.get('edit');

  const [errors, setErrors] = useState<{
    name?: string;
    grade?: string;
    subjects?: string;
  }>({});

  useEffect(() => {
    setLoadingInit(true);
    Promise.all([
      api.getUnassignedParents(), // maps to /api/parents/unassigned
      api.listSubjects(),         // maps to /api/subjects
    ])
      .then(([parentsResp, subjectsResp]) => {
        setParents(parentsResp || []);
        const sorted = (subjectsResp || []).sort((a: Subject, b: Subject) => {
          const lvl = (a.level || '').localeCompare(b.level || '');
          return lvl !== 0 ? lvl : a.code.localeCompare(b.code);
        });
        setSubjects(sorted);
      })
      .catch((err) => console.error('Init load failed:', err))
      .finally(() => setLoadingInit(false));
  }, []);

  // Fetch student data when in edit mode
  useEffect(() => {
    if (editId) {
      setLoadingStudent(true);
      Promise.all([
        api.getStudent(editId),
        api.getStudentSubjects(editId)
      ])
        .then(([studentData, subjectIds]) => {
          if (studentData) {
            setName(studentData.name);
            setGrade(studentData.grade);
            setParentId(studentData.parent_id || '');
            setSelectedSubjectIds(subjectIds);
          }
        })
        .catch((err) => {
          console.error('Failed to load student data:', err);
          alert('Failed to load student data. Please try again.');
        })
        .finally(() => setLoadingStudent(false));
    }
  }, [editId]);

  const toggleSubject = (id: string) => {
    setSelectedSubjectIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // For Select All / Unselect All over current filter
  const filteredSubjectIds = useMemo(() => {
    const q = subjectSearch.trim().toLowerCase();
    return subjects
      .filter(s =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.level || '').toLowerCase().includes(q)
      )
      .map(s => s.id);
  }, [subjects, subjectSearch]);

  const allFilteredSelected =
    filteredSubjectIds.length > 0 &&
    filteredSubjectIds.every(id => selectedSubjectIds.includes(id));
  const someFilteredSelected =
    filteredSubjectIds.some(id => selectedSubjectIds.includes(id)) && !allFilteredSelected;

  const toggleAllFiltered = () => {
    setSelectedSubjectIds(prev => {
      if (allFilteredSelected) {
        // Unselect everything currently visible
        return prev.filter(id => !filteredSubjectIds.includes(id));
      }
      // Select everything currently visible (preserve others)
      const set = new Set(prev);
      filteredSubjectIds.forEach(id => set.add(id));
      return Array.from(set);
    });
  };

  // Optional grouping by level
  const subjectsByLevel = useMemo(() => {
    const map = new Map<string, Subject[]>();
    for (const s of subjects) {
      const key = s.level || 'General';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => a.code.localeCompare(b.code));
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [subjects]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous errors
    setErrors({});
    
    // Validation
    if (!name || !grade || selectedSubjectIds.length === 0) {
      setErrors({
        name: !name ? 'Name is required' : undefined,
        grade: !grade ? 'Grade is required' : undefined,
        subjects: selectedSubjectIds.length === 0 ? 'At least one subject must be selected' : undefined,
      });
      return;
    }

    setSubmitting(true);
    try {
      if (editId) {
        // Update existing student
        await api.updateStudent(editId, {
          name,
          grade,
          parent_id: parentId || null,
        });

        // Update subjects
        await api.replaceStudentSubjects(editId, selectedSubjectIds);

        toast.success('Student updated successfully');
        // Navigate back to student profile
        navigate(`/student/${editId}`);
      } else {
        // Create new student
        const created = await api.createStudent({
          name,
          grade,
          parentId: parentId || null,
        });

        // Assign subjects
        if (created?.id) {
          await api.replaceStudentSubjects(created.id, selectedSubjectIds);
        }

        // Reset form only for new students
        setName('');
        setGrade('');
        setParentId('');
        setSelectedSubjectIds([]);
        setSubjectSearch('');
        toast.success('Student added successfully');
        // Navigate back to students page
        navigate('/students');
      }
    } catch (err) {
      console.error(err);
      alert(editId ? 'Failed to update student. Please check console for details.' : 'Failed to add student. Please check console for details.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto mt-10 space-y-6">
      <h1 className="text-2xl font-bold">
        {editId ? 'Edit Student' : 'Add New Student'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">Name *</Label>
            <Input 
              id="name" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              required 
              className={errors.name ? 'border-red-500' : ''}
            />
            {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
          </div>

          <div>
            <Label htmlFor="grade">Grade *</Label>
            <Input 
              id="grade" 
              value={grade} 
              onChange={e => setGrade(e.target.value)} 
              required 
              className={errors.grade ? 'border-red-500' : ''}
            />
            {errors.grade && <p className="text-sm text-red-500 mt-1">{errors.grade}</p>}
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="parent">Assign to Parent (optional)</Label>
            <select
              id="parent"
              value={parentId}
              onChange={e => setParentId(e.target.value)}
              className="w-full border px-3 py-2 rounded"
            >
              <option value="">-- None --</option>
              {parents.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Subjects selection */}
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div className="flex-1">
              <Label htmlFor="subjectSearch">Assign Subjects *</Label>
              <Input
                id="subjectSearch"
                placeholder="Search subjects by name, code, or level…"
                value={subjectSearch}
                onChange={(e) => setSubjectSearch(e.target.value)}
              />
            </div>

            <Button
              type="button"
              variant={allFilteredSelected ? 'outline' : 'default'}
              onClick={toggleAllFiltered}
              className="whitespace-nowrap"
              disabled={loadingInit || subjects.length === 0}
            >
              {allFilteredSelected ? 'Unselect Filtered'
                : someFilteredSelected ? 'Select Remaining'
                  : 'Select Filtered'}
            </Button>
          </div>

          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              {selectedSubjectIds.length} selected
            </div>
            {errors.subjects && <p className="text-sm text-red-500">{errors.subjects}</p>}
          </div>

          <div className="border rounded-md p-3 max-h-96 overflow-auto space-y-4">
            {loadingInit && <div className="text-sm">Loading subjects…</div>}
            {loadingStudent && <div className="text-sm">Loading student data…</div>}
            {!loadingInit && !loadingStudent && subjectsByLevel.length === 0 && (
              <div className="text-sm text-muted-foreground">No subjects found.</div>
            )}

            {subjectsByLevel.map(([level, items]) => {
              const q = subjectSearch.trim().toLowerCase();
              const visible = items.filter(s =>
                !q ||
                s.name.toLowerCase().includes(q) ||
                s.code.toLowerCase().includes(q) ||
                (s.level || '').toLowerCase().includes(q)
              );
              if (visible.length === 0) return null;

              return (
                <div key={level}>
                  <div className="font-semibold mb-2">{level}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {visible.map((s) => {
                      const checked = selectedSubjectIds.includes(s.id);
                      return (
                        <label
                          key={s.id}
                          className={`flex items-start gap-2 border rounded-md p-2 cursor-pointer hover:bg-accent/40 ${checked ? 'bg-accent/50' : ''}`}
                          title={`${s.name} (${s.code})`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSubject(s.id)}
                            className="mt-1"
                          />
                          <div>
                            <div className="text-sm font-medium">{s.name}</div>
                            <div className="text-xs text-muted-foreground">{s.code}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={submitting || loadingInit || loadingStudent || !name || !grade || selectedSubjectIds.length === 0}>
          {submitting ? (editId ? 'Updating…' : 'Adding…') : (editId ? 'Update Student' : 'Add Student')}
        </Button>
      </form>
    </div>
  );
};

export default AddStudent;

