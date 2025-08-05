
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Calendar, BookOpen, MessageSquare, Users, BookCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {Badge} from '@/components/ui/badge';
import { dailyProgress, students, weeklyFeedback } from '@/utils/demoData';
import { Link } from 'react-router-dom';

interface DashboardCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  link: string;
}

const DashboardCard: React.FC<DashboardCardProps> = ({ title, description, icon, link }) => {
  return (
    <Card className="hover-card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        {icon}
        <Button asChild>
          <Link to={link}>View More</Link>
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

const Dashboard: React.FC = () => {
  const { user, role } = useAuth();
  const [studentCount, setStudentCount] = useState(students.length);
  const [progressCount, setProgressCount] = useState(dailyProgress.length);
  const [feedbackCount, setFeedbackCount] = useState(weeklyFeedback.length);

  return (
    <div className="container mx-auto py-8 px-4 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome, {user?.name}! {role === 'teacher' ? 'Manage your classroom' : 'Track your child\'s progress'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {role === 'teacher' ? (
          <>
            <DashboardCard
              title="Students"
              description="Manage student profiles"
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
              title="You are signed in as a parent"
              description="View your child's profile"
              icon={<Users className="h-6 w-6 text-blue-500" />}
              link="/student-profile"
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
