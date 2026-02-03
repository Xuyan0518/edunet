// src/pages/WeeklyFeedback.tsx
import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import WeeklyFeedbackForm from "@/components/ui/WeeklyFeedbackForm";
import WeeklyFeedbackPanel from "@/components/ui/WeeklyFeedbackPanel";

const WeeklyFeedback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const studentId = searchParams.get("student"); // required
  const weekStarting = searchParams.get("weekStarting"); // optional

  const [activeTab, setActiveTab] = useState("form");

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl animate-fade-in">
      <h1 className="text-3xl font-bold mb-6">Weekly Feedback</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="form">Form</TabsTrigger>
          <TabsTrigger value="view">View Feedback</TabsTrigger>
        </TabsList>

        <TabsContent value="form">
          <WeeklyFeedbackForm />
        </TabsContent>

        <TabsContent value="view">
          <WeeklyFeedbackPanel studentId={studentId ?? undefined} weekStarting={weekStarting ?? undefined} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WeeklyFeedback;
