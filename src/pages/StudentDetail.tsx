import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { students } from '@/utils/demoData'; // Replace with real data fetching

type Activity = {
  subject: string;
  description: string;
  performance: string;
  notes?: string;
};

type DailyProgress = {
  id: string;
  studentId: string;
  date: string;
  attendance: 'present' | 'absent' | 'late';
  activities: Activity[];
};

const StudentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const student = students.find(s => s.id.toString() === id);
  console.log("student selected: ", student);

  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10); // yyyy-mm-dd format
  });

  const [progress, setProgress] = useState<DailyProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    setLoading(true);
    setError(null);

    fetch(`/api/progress/student?studentId=${id}&date=${selectedDate}`)
      .then(async res => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to fetch progress');
        }
        return res.json();
      })
      .then((data: DailyProgress) => {
        setProgress(data);
      })
      .catch(err => {
        setProgress(null);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [id, selectedDate]);

  if (!student) {
    return (
      <div className="container mx-auto py-8 px-4">
        <p>Student not found.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 animate-fade-in max-w-3xl">
      <h1 className="text-3xl font-bold mb-4">{student.name}'s Progress</h1>
      <p className="mb-6">
        Grade: <Badge>{student.grade}</Badge>
      </p>

      <label htmlFor="date" className="block mb-2 font-semibold">
        Select Date:
      </label>
      <input
        id="date"
        type="date"
        value={selectedDate}
        onChange={e => setSelectedDate(e.target.value)}
        className="mb-6 border rounded px-3 py-2"
        max={new Date().toISOString().slice(0, 10)} // no future dates
      />

      {loading && <p>Loading progress...</p>}

      {error && (
        <p className="text-red-600 mb-4">Error: {error}</p>
      )}

      {!loading && !error && progress && (
        <Card>
          <CardHeader>
            <CardTitle>Progress on {progress.date}</CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              Attendance: <strong>{progress.attendance}</strong>
            </p>
            <div className="mt-4 space-y-4">
              {progress.activities.map((activity, idx) => (
                <div key={idx} className="border p-4 rounded shadow-sm">
                  <p><strong>Subject:</strong> {activity.subject}</p>
                  <p><strong>Description:</strong> {activity.description}</p>
                  <p><strong>Performance:</strong> {activity.performance}</p>
                  {activity.notes && (
                    <p><strong>Notes:</strong> {activity.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && !error && !progress && (
        <p>No progress found for this date.</p>
      )}
    </div>
  );
};

export default StudentDetail;
