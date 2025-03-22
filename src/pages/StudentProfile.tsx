import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Book, Award, FileText, Clock, GraduationCap, Mail, Phone } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { dailyProgress, students, weeklyFeedback } from '@/utils/demoData';
import Badge from '@/components/ui/Badge';
import { format } from 'date-fns';

const StudentProfile: React.FC = () => {
  const { user, role } = useAuth();
  
  if (role !== 'parent') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Unauthorized access. Only parents can view this page.</p>
      </div>
    );
  }
  
  // Find the student that belongs to this parent
  const studentId = user?.children?.[0];
  const student = students.find(s => s.id === studentId);
  
  // Get progress entries for this student
  const progressEntries = dailyProgress.filter(p => p.studentId === studentId);
  
  // Get weekly feedback for this student
  const feedbackEntries = weeklyFeedback.filter(f => f.studentId === studentId);

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>No student profile found.</p>
      </div>
    );
  }

  // Group activities by subject
  const subjectActivities: Record<string, { total: number, performance: Record<string, number> }> = {};
  
  progressEntries.forEach(entry => {
    entry.activities.forEach(activity => {
      if (!subjectActivities[activity.subject]) {
        subjectActivities[activity.subject] = {
          total: 0,
          performance: {
            excellent: 0,
            good: 0,
            'needs improvement': 0,
          }
        };
      }
      
      subjectActivities[activity.subject].total += 1;
      subjectActivities[activity.subject].performance[activity.performance] += 1;
    });
  });
  
  return (
    <div className="container mx-auto py-8 px-4 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Student Profile</h1>
        <p className="text-muted-foreground mt-1">Comprehensive view of your child's academic journey</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
        <Card className="md:col-span-1 hover-card">
          <CardHeader>
            <CardTitle>Student Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col items-center space-y-4">
              <div className="h-32 w-32 rounded-full bg-secondary flex items-center justify-center text-4xl font-medium">
                {student.name.charAt(0)}
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold">{student.name}</h2>
                <p className="text-muted-foreground">{student.grade} • Age {student.age}</p>
              </div>
              <div className="flex space-x-2">
                <Badge text={student.grade} />
                <Badge text="Active Student" variant="outline" />
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-full bg-secondary/70 flex items-center justify-center">
                  <GraduationCap className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Class</p>
                  <p className="text-sm text-muted-foreground">{student.grade}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-full bg-secondary/70 flex items-center justify-center">
                  <Mail className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Contact Email</p>
                  <p className="text-sm text-muted-foreground">student{student.id}@school.edu</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-full bg-secondary/70 flex items-center justify-center">
                  <Phone className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Emergency Contact</p>
                  <p className="text-sm text-muted-foreground">{user?.name} (Parent)</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="md:col-span-2 hover-card">
          <CardHeader>
            <CardTitle>Academic Overview</CardTitle>
            <CardDescription>Performance across subjects based on daily progress reports</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Progress Entries</p>
                        <p className="text-2xl font-bold">{progressEntries.length}</p>
                      </div>
                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <Book className="h-4 w-4 text-blue-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Weekly Reports</p>
                        <p className="text-2xl font-bold">{feedbackEntries.length}</p>
                      </div>
                      <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                        <FileText className="h-4 w-4 text-purple-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <div>
                <h3 className="text-lg font-medium mb-4">Subject Performance</h3>
                <div className="space-y-4">
                  {Object.entries(subjectActivities).map(([subject, data]) => {
                    const totalActivities = data.total;
                    const excellentPercentage = Math.round((data.performance.excellent / totalActivities) * 100) || 0;
                    const goodPercentage = Math.round((data.performance.good / totalActivities) * 100) || 0;
                    const needsImprovementPercentage = Math.round((data.performance['needs improvement'] / totalActivities) * 100) || 0;
                    
                    return (
                      <div key={subject} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{subject}</span>
                          <span className="text-sm text-muted-foreground">{totalActivities} activities</span>
                        </div>
                        <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-green-500 float-left" 
                            style={{ width: `${excellentPercentage}%` }}
                          ></div>
                          <div 
                            className="h-full bg-blue-500 float-left" 
                            style={{ width: `${goodPercentage}%` }}
                          ></div>
                          <div 
                            className="h-full bg-amber-500 float-left" 
                            style={{ width: `${needsImprovementPercentage}%` }}
                          ></div>
                        </div>
                        <div className="flex text-xs">
                          <div className="flex items-center mr-4">
                            <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                            <span>Excellent ({excellentPercentage}%)</span>
                          </div>
                          <div className="flex items-center mr-4">
                            <div className="w-2 h-2 bg-blue-500 rounded-full mr-1"></div>
                            <span>Good ({goodPercentage}%)</span>
                          </div>
                          <div className="flex items-center">
                            <div className="w-2 h-2 bg-amber-500 rounded-full mr-1"></div>
                            <span>Needs Improvement ({needsImprovementPercentage}%)</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Tabs defaultValue="progress" className="space-y-6">
        <TabsList className="grid grid-cols-2 w-full md:w-[400px]">
          <TabsTrigger value="progress" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            Daily Progress
          </TabsTrigger>
          <TabsTrigger value="feedback" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            Weekly Feedback
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="progress" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Daily Progress Entries</CardTitle>
              <CardDescription>Detailed daily progress reports and activities</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {progressEntries.length > 0 ? (
                  progressEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(entry => (
                    <Card key={entry.id} className="hover-card">
                      <CardContent className="p-6">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-semibold">{format(new Date(entry.date), 'MMMM d, yyyy')}</h3>
                          <Badge 
                            text={entry.attendance} 
                            variant={entry.attendance === 'present' ? 'default' : entry.attendance === 'tardy' ? 'secondary' : 'destructive'} 
                          />
                        </div>
                        
                        <div className="space-y-4">
                          {entry.activities.map((activity, index) => (
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
                    </Card>
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-6">No progress entries available yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="feedback" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Weekly Feedback Reports</CardTitle>
              <CardDescription>Comprehensive weekly assessments and feedback</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {feedbackEntries.length > 0 ? (
                  feedbackEntries.sort((a, b) => new Date(b.weekStarting).getTime() - new Date(a.weekStarting).getTime()).map(feedback => (
                    <Card key={feedback.id} className="hover-card">
                      <CardContent className="p-6">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-semibold">Week of {formatDateRange(feedback.weekStarting, feedback.weekEnding)}</h3>
                        </div>
                        
                        <div className="space-y-6">
                          <div>
                            <h4 className="font-medium text-sm mb-2">Weekly Summary</h4>
                            <p className="text-sm">{feedback.summary}</p>
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
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-6">No weekly feedback reports available yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
    'Music': '#06B6D4', // cyan
    'Physical Education': '#14B8A6', // teal
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
  
  return `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
};

export default StudentProfile;
