// src/pages/DailyProgress.tsx
import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import DailyProgressForm from "@/components/ui/DailyProgressForm";
import DailyProgressPanel from "@/components/ui/DailyProgressPanel";
import { useI18n } from "@/context/I18nContext";

const DailyProgress: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const studentId = searchParams.get("student"); // required
  const date = searchParams.get("date"); // optional
  const tabParam = searchParams.get("tab");
  const { t } = useI18n();

  const initialTab = useMemo(() => (tabParam === "view" ? "view" : "form"), [tabParam]);
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (nextTab: string) => {
    setActiveTab(nextTab);
    const next = new URLSearchParams(searchParams);
    next.set("tab", nextTab);
    setSearchParams(next, { replace: true });
  };

  const handleEntryClick = (entry: { studentId: string; date: string }) => {
    const next = new URLSearchParams(searchParams);
    next.set("student", entry.studentId);
    next.set("date", entry.date);
    next.set("tab", "form");
    setSearchParams(next, { replace: true });
    setActiveTab("form");
  };

  // if (!studentId) {
  //   return (
  //     <div className="container mx-auto py-8 px-4 max-w-2xl">
  //       <p className="text-red-600">Error: studentId query parameter is required.</p>
  //     </div>
  //   );
  // }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl animate-fade-in">
      <h1 className="text-3xl font-bold mb-6">{t('dailyProgress.pageTitle')}</h1>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="form">{t('dailyProgress.tab.form')}</TabsTrigger>
          <TabsTrigger value="view">{t('dailyProgress.tab.view')}</TabsTrigger>
        </TabsList>

        <TabsContent value="form">
          <DailyProgressForm />
        </TabsContent>

        <TabsContent value="view">
          <DailyProgressPanel
            studentId={studentId ?? undefined}
            date={date ?? undefined}
            onEntryClick={handleEntryClick}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DailyProgress;
