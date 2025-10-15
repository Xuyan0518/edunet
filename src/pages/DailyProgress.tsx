// src/pages/DailyProgress.tsx
import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import DailyProgressForm from "@/components/ui/DailyProgressForm";
import DailyProgressPanel from "@/components/ui/DailyProgressPanel";

const DailyProgress: React.FC = () => {
  const [searchParams] = useSearchParams();
  const studentId = searchParams.get("student"); // required
  const date = searchParams.get("date"); // optional

  const [activeTab, setActiveTab] = useState("form");

  // if (!studentId) {
  //   return (
  //     <div className="container mx-auto py-8 px-4 max-w-2xl">
  //       <p className="text-red-600">Error: studentId query parameter is required.</p>
  //     </div>
  //   );
  // }

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
    <div className="container mx-auto py-8 px-4 max-w-4xl animate-fade-in">
      <h1 className="text-3xl font-bold mb-6">Daily Progress</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="form">Form</TabsTrigger>
          <TabsTrigger value="view">View Progress</TabsTrigger>
        </TabsList>

        <TabsContent value="form">
          <DailyProgressForm />
        </TabsContent>

        <TabsContent value="view">
          <DailyProgressPanel studentId={studentId ?? undefined} date={date ?? undefined} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DailyProgress;
