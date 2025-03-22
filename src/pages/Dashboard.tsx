
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Clock, Book, Award, FileText } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { dailyProgress, students, weeklyFeedback } from '@/utils/demoData';
import Badge from '@/components/ui/Badge';

const TeacherDashboard: React.FC = () => {
  const { user } = useAuth();
  const [selectedTab, setSelectedTab] = useState('overview');

  // Get current date formatted
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Stats for teacher
  const stats = [
    {
      title: 'Students',
      value: students.length,
      icon: <Book className="h-5 w-5 text-blue-500" />,
      description: 'Total students',
    },
    {
      title: 'Daily Entries',
      value: dailyProgress.length,
      icon: <Calendar className="h-5 w-5 text-green-500" />,
      description: 'Progress records',
    },
    {
      title: 'Weekly Reports',
      value: weeklyFeedback.length,
      icon: <FileText className="h-5 w-5 text-purple-500" />,
      description: 'Feedback reports',
    },
  ];

  // Recent activity for teacher
  const recentActivity = [
    {
      student: 'Emma Smith',
      action: 'Daily progress updated',
      time: '2 hours ago',
    },
    {
      student: 'Lucas Johnson',
      action: 'Weekly feedback submitted',
      time: '1 day ago',
    },
    {
      student: 'Sophia Williams',
      action: 'Added to reading group',
      time: '2 days ago',
    },
  ];

  return (
    <div className="container mx-auto py-8 px-4 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Welcome back, {user?.name}</h1>
          <p className="text-muted-foreground">{currentDate}</p>
        </div>
        <div className="mt-4 md:mt-0">
          <Badge text="Teacher Dashboard" className="bg-primary/20 text-primary border-primary/20" />
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
        <TabsList className="grid w-full md:w-auto grid-cols-2 md:grid-cols-4 md:inline-grid gap-2">
          <TabsTrigger value="overview" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            Overview
          </TabsTrigger>
          <TabsTrigger value="students" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            Students
          </TabsTrigger>
          <TabsTrigger value="dailyProgress" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            Daily Progress
          </TabsTrigger>
          <TabsTrigger value="weeklyFeedback" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            Weekly Feedback
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {stats.map((stat, index) => (
              <Card key={index} className="hover-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-lg font-medium">{stat.title}</CardTitle>
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    {stat.icon}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground">{stat.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          
          <Card className="hover-card">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Your latest actions and updates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {recentActivity.map((activity, index) => (
                <div key={index} className="flex items-start space-x-4 border-b border-border pb-4 last:border-0 last:pb-0">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium">{activity.student}</p>
                    <p className="text-sm text-muted-foreground">{activity.action}</p>
                    <p className="text-xs text-muted-foreground">{activity.time}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          
          <Card className="hover-card">
            <CardHeader>
              <CardTitle>Today's Schedule</CardTitle>
              <CardDescription>Your classes and tasks for today</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {['Math - 9:00 AM', 'Reading - 10:30 AM', 'Lunch - 12:00 PM', 'Science - 1:00 PM', 'Art - 2:30 PM'].map((schedule, index) => (
                <div key={index} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <span>{schedule}</span>
                  {index === 0 && (
                    <Badge text="Current" variant="secondary" size="sm" />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="students" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Your Students</CardTitle>
              <CardDescription>Students in your class</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {students.map((student) => (
                  <Card key={student.id} className="hover-card">
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-4">
                        <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
                          {student.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-semibold">{student.name}</h3>
                          <p className="text-sm text-muted-foreground">{student.grade} • Age {student.age}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="dailyProgress" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Daily Progress Entries</CardTitle>
              <CardDescription>Latest progress updates for your students</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {dailyProgress.map((progress) => {
                const student = students.find(s => s.id === progress.studentId);
                return (
                  <Card key={progress.id} className="hover-card">
                    <CardContent className="p-6">
                      <div className="flex flex-col space-y-4">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center space-x-2">
                            <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                              {student?.name.charAt(0)}
                            </div>
                            <span className="font-medium">{student?.name}</span>
                          </div>
                          <div className="flex space-x-2">
                            <Badge text={new Date(progress.date).toLocaleDateString()} variant="outline" size="sm" />
                            <Badge text={progress.attendance} variant={progress.attendance === 'present' ? 'default' : 'destructive'} size="sm" />
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          {progress.activities.map((activity, index) => (
                            <div key={index} className="border-l-2 pl-4 py-1" style={{ borderColor: getSubjectColor(activity.subject) }}>
                              <div className="flex justify-between">
                                <span className="font-medium">{activity.subject}</span>
                                <Badge 
                                  text={activity.performance} 
                                  variant="outline" 
                                  size="sm" 
                                  className={`${getPerformanceColor(activity.performance)}`}
                                />
                              </div>
                              <p className="text-sm text-muted-foreground">{activity.description}</p>
                              <p className="text-xs italic mt-1">{activity.notes}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="weeklyFeedback" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Weekly Feedback Reports</CardTitle>
              <CardDescription>Comprehensive weekly assessments of student progress</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {weeklyFeedback.map((feedback) => {
                const student = students.find(s => s.id === feedback.studentId);
                return (
                  <Card key={feedback.id} className="hover-card">
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center space-x-2">
                            <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                              {student?.name.charAt(0)}
                            </div>
                            <span className="font-medium">{student?.name}</span>
                          </div>
                          <Badge text={`Week of ${formatDateRange(feedback.weekStarting, feedback.weekEnding)}`} variant="outline" />
                        </div>
                        
                        <div>
                          <h4 className="font-medium text-sm mb-2">Weekly Summary</h4>
                          <p className="text-sm text-muted-foreground">{feedback.summary}</p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="font-medium text-sm mb-2 flex items-center">
                              <Award className="h-4 w-4 mr-1 text-yellow-500" />
                              Strengths
                            </h4>
                            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                              {feedback.strengths.map((strength, index) => (
                                <li key={index}>{strength}</li>
                              ))}
                            </ul>
                          </div>
                          
                          <div>
                            <h4 className="font-medium text-sm mb-2">Areas to Improve</h4>
                            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                              {feedback.areasToImprove.map((area, index) => (
                                <li key={index}>{area}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                        
                        <div>
                          <h4 className="font-medium text-sm mb-2">Weekly Tasks Summary</h4>
                          <p className="text-sm text-muted-foreground">{feedback.weeklyTasksSummary}</p>
                        </div>
                        
                        <div className="border-t border-border pt-4">
                          <h4 className="font-medium text-sm mb-2">Teacher Notes</h4>
                          <p className="text-sm text-muted-foreground">{feedback.teacherNotes}</p>
                        </div>
                        
                        <div className="bg-secondary/50 p-4 rounded-md">
                          <h4 className="font-medium text-sm mb-2">Next Week's Focus</h4>
                          <p className="text-sm">{feedback.nextWeekFocus}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const ParentDashboard: React.FC = () => {
  const { user } = useAuth();
  const parentUser = user as { id: string; children: string[] };
  
  // Find the student that belongs to this parent
  const studentId = parentUser?.children?.[0];
  const student = students.find(s => s.id === studentId);
  
  // Get progress entries for this student
  const progressEntries = dailyProgress.filter(p => p.studentId === studentId);
  const latestProgressEntry = progressEntries[0];
  
  // Get weekly feedback for this student
  const feedbackEntries = weeklyFeedback.filter(f => f.studentId === studentId);
  const latestFeedback = feedbackEntries[0];
  
  // Current date
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="container mx-auto py-8 px-4 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Welcome, {user?.name}</h1>
          <p className="text-muted-foreground">{currentDate}</p>
        </div>
        <div className="mt-4 md:mt-0">
          <Badge text="Parent Dashboard" className="bg-primary/20 text-primary border-primary/20" />
        </div>
      </div>

      {student && (
        <Card className="mb-8 hover-card">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between">
              <div className="flex items-center space-x-4 mb-4 md:mb-0">
                <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center text-xl font-medium">
                  {student.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-2xl font-bold">{student.name}</h2>
                  <p className="text-muted-foreground">{student.grade} • Age {student.age}</p>
                </div>
              </div>
              <div className="flex space-x-2">
                <Badge text="Current Student" variant="outline" />
                <Badge text={student.grade} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          <Card className="hover-card">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="h-5 w-5 mr-2 text-primary" />
                Latest Daily Progress
              </CardTitle>
              <CardDescription>
                {latestProgressEntry ? (
                  `Updated on ${new Date(latestProgressEntry.date).toLocaleDateString()}`
                ) : (
                  "No recent progress updates"
                )}
              </CardDescription>
            </CardHeader>
            {latestProgressEntry ? (
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Badge text={`Attendance: ${latestProgressEntry.attendance}`} variant={latestProgressEntry.attendance === 'present' ? 'default' : 'destructive'} />
                  <Badge text={new Date(latestProgressEntry.date).toLocaleDateString()} variant="outline" />
                </div>
                
                <div className="space-y-3">
                  {latestProgressEntry.activities.map((activity, index) => (
                    <div key={index} className="border-l-2 pl-4 py-2" style={{ borderColor: getSubjectColor(activity.subject) }}>
                      <div className="flex justify-between">
                        <span className="font-medium">{activity.subject}</span>
                        <Badge 
                          text={activity.performance} 
                          variant="outline" 
                          className={`${getPerformanceColor(activity.performance)}`}
                        />
                      </div>
                      <p className="text-sm mt-1">{activity.description}</p>
                      <p className="text-sm italic text-muted-foreground mt-1">{activity.notes}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            ) : (
              <CardContent>
                <p className="text-center text-muted-foreground py-6">No progress data available</p>
              </CardContent>
            )}
          </Card>
          
          <Card className="hover-card">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Award className="h-5 w-5 mr-2 text-yellow-500" />
                Achievements & Highlights
              </CardTitle>
              <CardDescription>Recent accomplishments and notable activities</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {latestProgressEntry?.activities
                  .filter(a => a.performance === 'excellent')
                  .map((activity, index) => (
                    <div key={index} className="flex items-start space-x-3">
                      <div className="h-8 w-8 rounded-full bg-yellow-100 flex items-center justify-center">
                        <Award className="h-4 w-4 text-yellow-500" />
                      </div>
                      <div>
                        <h4 className="font-medium">{activity.subject} Excellence</h4>
                        <p className="text-sm text-muted-foreground">{activity.description}</p>
                      </div>
                    </div>
                  ))}
                
                {latestProgressEntry?.activities.filter(a => a.performance === 'excellent').length === 0 && (
                  <p className="text-center text-muted-foreground py-6">No highlights to display yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="space-y-8">
          <Card className="hover-card">
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2 text-primary" />
                Weekly Feedback
              </CardTitle>
              <CardDescription>
                {latestFeedback ? (
                  `Week of ${formatDateRange(latestFeedback.weekStarting, latestFeedback.weekEnding)}`
                ) : (
                  "No weekly feedback available"
                )}
              </CardDescription>
            </CardHeader>
            {latestFeedback ? (
              <CardContent className="space-y-6">
                <div>
                  <h4 className="font-medium text-sm mb-2">Weekly Summary</h4>
                  <p className="text-sm">{latestFeedback.summary}</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-sm mb-2 flex items-center">
                      <Award className="h-4 w-4 mr-1 text-yellow-500" />
                      Strengths
                    </h4>
                    <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                      {latestFeedback.strengths.map((strength, index) => (
                        <li key={index}>{strength}</li>
                      ))}
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-sm mb-2">Areas to Improve</h4>
                    <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                      {latestFeedback.areasToImprove.map((area, index) => (
                        <li key={index}>{area}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-sm mb-2">Weekly Tasks Summary</h4>
                  <p className="text-sm text-muted-foreground">{latestFeedback.weeklyTasksSummary}</p>
                </div>
                
                <div className="border-t border-border pt-4">
                  <h4 className="font-medium text-sm mb-2">Teacher Notes</h4>
                  <p className="text-sm text-muted-foreground">{latestFeedback.teacherNotes}</p>
                </div>
                
                <div className="bg-secondary/50 p-4 rounded-md">
                  <h4 className="font-medium text-sm mb-2">Next Week's Focus</h4>
                  <p className="text-sm">{latestFeedback.nextWeekFocus}</p>
                </div>
              </CardContent>
            ) : (
              <CardContent>
                <p className="text-center text-muted-foreground py-6">No weekly feedback available yet</p>
              </CardContent>
            )}
          </Card>
          
          <Card className="hover-card">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="h-5 w-5 mr-2 text-primary" />
                Upcoming Events
              </CardTitle>
              <CardDescription>School events and important dates</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { date: 'Nov 20', title: 'Parent-Teacher Conference', description: 'Discuss your child\'s progress' },
                  { date: 'Nov 25', title: 'Science Fair', description: 'Students will present their projects' },
                  { date: 'Dec 10', title: 'Winter Concert', description: 'Annual music performance' },
                ].map((event, index) => (
                  <div key={index} className="flex items-start space-x-4 border-b border-border pb-4 last:border-0 last:pb-0">
                    <div className="h-12 w-12 rounded bg-secondary flex flex-col items-center justify-center">
                      <span className="text-xs font-medium">{event.date.split(' ')[0]}</span>
                      <span className="text-sm font-bold">{event.date.split(' ')[1]}</span>
                    </div>
                    <div>
                      <h4 className="font-medium">{event.title}</h4>
                      <p className="text-sm text-muted-foreground">{event.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

// Helper function to get a color for a subject
const getSubjectColor = (subject: string): string => {
  const colors: Record<string, string> = {
    'Math': '#3B82F6', // blue
    'Reading': '#10B981', // green
    'Writing': '#8B5CF6', // purple
    'Science': '#F59E0B', // amber
    'Social Studies': '#EF4444', // red
    'Art': '#EC4899', // pink
  };
  
  return colors[subject] || '#6B7280'; // gray default
};

// Helper function to get a color class based on performance
const getPerformanceColor = (performance: string): string => {
  switch (performance) {
    case 'excellent':
      return 'bg-green-50 text-green-600 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800';
    case 'good':
      return 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800';
    case 'needs improvement':
      return 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800';
    default:
      return '';
  }
};

// Helper function to format date range
const formatDateRange = (start: string, end: string): string => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  
  return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
};

const Dashboard: React.FC = () => {
  const { role } = useAuth();
  
  // Role-based dashboard rendering
  if (role === 'teacher') {
    return <TeacherDashboard />;
  } else if (role === 'parent') {
    return <ParentDashboard />;
  } else {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Unauthorized access. Please log in.</p>
      </div>
    );
  }
};

export default Dashboard;
