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
