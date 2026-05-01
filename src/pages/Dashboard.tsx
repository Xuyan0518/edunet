
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Calendar, BookOpen, MessageSquare, Users, BookCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import {Badge} from '@/components/ui/badge';
import { dailyProgress, students, weeklyFeedback } from '@/utils/demoData';
import { Link } from 'react-router-dom';
import { api } from '@/services/api';

interface DashboardCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  link: string;
}

const DashboardCard: React.FC<DashboardCardProps> = ({ title, description, icon, link }) => {
  const { t } = useI18n();
  return (
    <Card className="hover-card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        {icon}
        <Button asChild>
          <Link to={link}>{t('nav.viewMore')}</Link>
        </Button>
      </CardContent>
    </Card>
  );
};

// const RecentActivity: React.FC = () => {
//   const [selectedTab, setSelectedTab] = useState('progress');

//   return (
//     <Card className="col-span-2 hover-card">
//       <CardHeader>
//         <CardTitle>Recent Activity</CardTitle>
//         <CardDescription>Stay up-to-date on the latest student activities</CardDescription>
//       </CardHeader>
//       <CardContent>
//         <Tabs defaultValue={selectedTab} className="space-y-4" onValueChange={setSelectedTab}>
//           <TabsList>
//             <TabsTrigger value="progress">Daily Progress</TabsTrigger>
//             <TabsTrigger value="feedback">Weekly Feedback</TabsTrigger>
//           </TabsList>
//           <TabsContent value="progress">
//             {dailyProgress.slice(0, 3).map((progress) => (
//               <div key={progress.id} className="py-2 border-b last:border-b-0">
//                 <p className="text-sm font-medium">{progress.date}</p>
//                 <p className="text-xs text-muted-foreground">
//                   {students.find((student) => student.id === progress.studentId)?.name}:{' '}
//                   {progress.activities.length} Activities
//                 </p>
//               </div>
//             ))}
//           </TabsContent>
//           <TabsContent value="feedback">
//             {weeklyFeedback.slice(0, 3).map((feedback) => (
//               <div key={feedback.id} className="py-2 border-b last:border-b-0">
//                 <p className="text-sm font-medium">Week of {feedback.weekStarting}</p>
//                 <p className="text-xs text-muted-foreground">
//                   {students.find((student) => student.id === feedback.studentId)?.name}:{' '}
//                   {feedback.summary}
//                 </p>
//               </div>
//             ))}
//           </TabsContent>
//         </Tabs>
//       </CardContent>
//     </Card>
//   );
// };

// const QuickActions: React.FC = () => {
//   return (
//     <Card className="hover-card">
//       <CardHeader>
//         <CardTitle>Quick Actions</CardTitle>
//         <CardDescription>Manage your tasks quickly</CardDescription>
//       </CardHeader>
//       <CardContent className="space-y-4">
//         <Button asChild className="w-full">
//           <Link to="/daily-progress">
//             <Plus className="mr-2 h-4 w-4" />
//             Add Daily Progress
//           </Link>
//         </Button>
//         <Button asChild className="w-full">
//           <Link to="/weekly-feedback">
//             <MessageSquare className="mr-2 h-4 w-4" />
//             Add Weekly Feedback
//           </Link>
//         </Button>
//       </CardContent>
//     </Card>
//   );
// };

// const UpcomingEvents: React.FC = () => {
//   return (
//     <Card className="hover-card">
//       <CardHeader>
//         <CardTitle>Upcoming Events</CardTitle>
//         <CardDescription>Important dates and events</CardDescription>
//       </CardHeader>
//       <CardContent className="space-y-4">
//         <div className="py-2 border-b last:border-b-0">
//           <p className="text-sm font-medium">October 26, 2023</p>
//           <p className="text-xs text-muted-foreground">Parent-Teacher Conference</p>
//         </div>
//         <div className="py-2 border-b last:border-b-0">
//           <p className="text-sm font-medium">November 15, 2023</p>
//           <p className="text-xs text-muted-foreground">School Play</p>
//         </div>
//       </CardContent>
//     </Card>
//   );
// };

type MissingStudent = { id: string; name: string; grade: string };

type IncompleteEntry = {
  id: string;
  name: string;
  grade: string;
  completion: {
    reading: { completed: number; target: number; met: boolean };
    editing: { completed: number; target: number; met: boolean; required: boolean };
    grammar: { completed: number; target: number; met: boolean; required: boolean };
    vocab: { completed: number; target: number; met: boolean };
    composition: { completed: number; target: number; met: boolean };
    allRequiredMet: boolean;
  };
};

const unmetLabels = (c: IncompleteEntry['completion']): string[] => {
  const out: string[] = [];
  if (!c.reading.met) out.push(`阅读 ${c.reading.completed}/${c.reading.target}`);
  if (c.editing.required && !c.editing.met) out.push(`改错 ${c.editing.completed}/${c.editing.target}`);
  if (c.grammar.required && !c.grammar.met) out.push(`语法 ${c.grammar.completed}/${c.grammar.target}`);
  if (!c.vocab.met) out.push(`词汇 ${c.vocab.completed}/${c.vocab.target}`);
  if (!c.composition.met) out.push(`作文 ${c.composition.completed}/${c.composition.target}`);
  return out;
};

type UpcomingExam = {
  id: string;
  name: string;
  examType: string | null;
  examDate: string;
  daysUntil: number;
  student: { id: string; name: string; grade: string };
  subjects: Array<{ name: string; score: string; scope: string | null }>;
};

const UpcomingExamsCard: React.FC = () => {
  const [data, setData] = useState<UpcomingExam[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getUpcomingExams().then((res) => {
      if (cancelled) return;
      if (res) setData(res.upcoming);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const count = data?.length ?? 0;
  return (
    <Card className="hover-card">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>即将到来的考试</span>
          <Badge variant={count > 0 ? 'default' : 'secondary'}>{loading ? '...' : count}</Badge>
        </CardTitle>
        <CardDescription>提醒窗口内的考试</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">加载中…</p>
        ) : count === 0 ? (
          <p className="text-sm text-muted-foreground">近期没有考试</p>
        ) : (
          <ul className="space-y-2">
            {data!.map((e) => (
              <li key={e.id} className="rounded-md border border-border px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {e.student.name} · {e.name}
                    {e.examType ? ` (${e.examType})` : ''}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {e.examDate} · {e.daysUntil > 0 ? `还有 ${e.daysUntil} 天` : e.daysUntil === 0 ? '今天' : `已过 ${-e.daysUntil} 天`}
                  </span>
                </div>
                {e.subjects.length > 0 && (
                  <ul className="mt-1 text-xs text-muted-foreground space-y-0.5">
                    {e.subjects.map((s, i) => (
                      <li key={i}>
                        · {s.name}
                        {s.scope ? ` — ${s.scope}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

const IncompleteWeeklyTasksCard: React.FC = () => {
  const [data, setData] = useState<{
    cycle: { startDate: string; endDate: string };
    incomplete: IncompleteEntry[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getIncompleteWeeklyTasks().then((res) => {
      if (cancelled) return;
      if (res) setData({ cycle: res.cycle, incomplete: res.incomplete });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const count = data?.incomplete.length ?? 0;
  return (
    <Card className="hover-card">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>本周英文任务未完成学生</span>
          <Badge variant={count > 0 ? 'destructive' : 'secondary'}>{loading ? '...' : count}</Badge>
        </CardTitle>
        <CardDescription>
          {data ? `${data.cycle.startDate} → ${data.cycle.endDate}` : '加载中…'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">加载中…</p>
        ) : count === 0 ? (
          <p className="text-sm text-muted-foreground">本周所有学生都已完成必做任务</p>
        ) : (
          <ul className="space-y-2">
            {data!.incomplete.map((s) => (
              <li
                key={s.id}
                className="rounded-md border border-border px-3 py-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground">Grade {s.grade}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  未完成：{unmetLabels(s.completion).join('、')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

const MissingDailyProgressCard: React.FC = () => {
  const [date, setDate] = useState<string>('');
  const [missing, setMissing] = useState<MissingStudent[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getMissingDailyProgress().then((res) => {
      if (cancelled) return;
      if (res) {
        setDate(res.date);
        setMissing(res.missing);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const count = missing?.length ?? 0;
  return (
    <Card className="hover-card">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>今日未记录学生</span>
          <Badge variant={count > 0 ? 'destructive' : 'secondary'}>{loading ? '...' : count}</Badge>
        </CardTitle>
        <CardDescription>
          {date ? `${date} · 点击进入记录页面` : '加载中…'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">加载中…</p>
        ) : count === 0 ? (
          <p className="text-sm text-muted-foreground">所有学生今日都已记录</p>
        ) : (
          <ul className="space-y-2">
            {missing!.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/progress-form?student=${encodeURIComponent(s.id)}&date=${encodeURIComponent(date)}`}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 hover:bg-accent"
                >
                  <span>{s.name}</span>
                  <span className="text-xs text-muted-foreground">Grade {s.grade}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

const Dashboard: React.FC = () => {
  const { user, role } = useAuth();
  const { t } = useI18n();
  const [studentCount, setStudentCount] = useState(students.length);
  const [progressCount, setProgressCount] = useState(dailyProgress.length);
  const [feedbackCount, setFeedbackCount] = useState(weeklyFeedback.length);

  return (
    <div className="container mx-auto py-8 px-4 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{t('dashboard.title')}</h1>
        <p className="text-muted-foreground mt-1">
          {role === 'teacher'
            ? t('dashboard.welcome.teacher', { name: user?.name ?? '' })
            : t('dashboard.welcome.parent', { name: user?.name ?? '' })}
        </p>
      </div>

      {role === 'teacher' && (
        <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MissingDailyProgressCard />
          <IncompleteWeeklyTasksCard />
          <UpcomingExamsCard />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {role === 'teacher' ? (
          <>
            <DashboardCard
              title={t('dashboard.card.students.title')}
              description={t('dashboard.card.students.desc')}
              icon={<Users className="h-6 w-6 text-blue-500" />}
              link="/students"
            />
            {/* <DashboardCard
              title="Daily Progress"
              description="Record and view daily activities"
              icon={<BookOpen className="h-6 w-6 text-green-500" />}
              link="/daily-progress"
            />
            <DashboardCard
              title="Weekly Feedback"
              description="Provide weekly performance reports"
              icon={<MessageSquare className="h-6 w-6 text-purple-500" />}
              link="/weekly-feedback"
            />
            <DashboardCard
              title="Calendar"
              description="View school events"
              icon={<Calendar className="h-6 w-6 text-red-500" />}
              link="/calendar"
            /> */}
          </>
        ) : (
          <>
            <DashboardCard
              title={t('dashboard.card.children.title')}
              description={t('dashboard.card.children.desc')}
              icon={<Users className="h-6 w-6 text-blue-500" />}
              link="/students"
            />
            {/* <DashboardCard
              title="Daily Progress"
              description="Track daily activities"
              icon={<BookOpen className="h-6 w-6 text-green-500" />}
              link="/student-profile"
            /> */}
            {/* <DashboardCard
              title="Weekly Feedback"
              description="Review weekly performance"
              icon={<MessageSquare className="h-6 w-6 text-purple-500" />}
              link="/student-profile"
            /> */}
            {/* <DashboardCard
              title="Achievements"
              description="View student achievements"
              icon={<BookCheck className="h-6 w-6 text-orange-500" />}
              link="/achievements"
            /> */}
          </>
        )}
      </div>

      {/* <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <RecentActivity />
        <QuickActions />
        <UpcomingEvents />
      </div> */}
    </div>
  );
};

export default Dashboard;
