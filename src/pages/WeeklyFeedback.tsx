// src/pages/WeeklyFeedback.tsx
import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import WeeklyFeedbackForm from "@/components/ui/WeeklyFeedbackForm";
import WeeklyFeedbackPanel from "@/components/ui/WeeklyFeedbackPanel";
import { useI18n } from "@/context/I18nContext";

const WeeklyFeedback: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const studentId = searchParams.get("student"); // required
  const weekStarting = searchParams.get("weekStarting"); // optional
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

  const handleEntryClick = (entry: { studentId: string; weekStarting: string }) => {
    const next = new URLSearchParams(searchParams);
    next.set("student", entry.studentId);
    next.set("weekStarting", entry.weekStarting);
    next.set("tab", "form");
    setSearchParams(next, { replace: true });
    setActiveTab("form");
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl animate-fade-in">
      <h1 className="text-3xl font-bold mb-6">{t('weeklyFeedback.pageTitle')}</h1>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="form">{t('weeklyFeedback.tab.form')}</TabsTrigger>
          <TabsTrigger value="view">{t('weeklyFeedback.tab.view')}</TabsTrigger>
        </TabsList>

        <TabsContent value="form">
          <WeeklyFeedbackForm />
        </TabsContent>

        <TabsContent value="view">
          <WeeklyFeedbackPanel
            studentId={studentId ?? undefined}
            weekStarting={weekStarting ?? undefined}
            onEntryClick={handleEntryClick}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WeeklyFeedback;
