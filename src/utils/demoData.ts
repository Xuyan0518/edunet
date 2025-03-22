
// Demo users for authentication
export const users = [
  {
    id: '1',
    name: 'Ms. Johnson',
    email: 'teacher@example.com',
    role: 'teacher' as const,
    avatar: '/placeholder.svg',
    class: '5th Grade',
    subject: 'All subjects'
  },
  {
    id: '2',
    name: 'John Smith',
    email: 'parent@example.com',
    role: 'parent' as const,
    avatar: '/placeholder.svg',
    children: ['1']
  }
];

// Demo students
export const students = [
  {
    id: '1',
    name: 'Emma Smith',
    grade: '5th',
    age: 10,
    avatar: '/placeholder.svg',
    parentId: '2'
  },
  {
    id: '2',
    name: 'Lucas Johnson',
    grade: '5th',
    age: 10,
    avatar: '/placeholder.svg',
    parentId: '3'
  },
  {
    id: '3',
    name: 'Sophia Williams',
    grade: '5th',
    age: 11,
    avatar: '/placeholder.svg',
    parentId: '4'
  }
];

// Demo daily progress entries
export const dailyProgress = [
  {
    id: '1',
    studentId: '1',
    date: '2023-11-08',
    attendance: 'present',
    activities: [
      {
        subject: 'Math',
        description: 'Completed fractions worksheet with 90% accuracy',
        performance: 'excellent',
        notes: 'Emma shows great understanding of equivalent fractions'
      },
      {
        subject: 'Reading',
        description: 'Read chapters 3-4 of "Charlotte\'s Web"',
        performance: 'good',
        notes: 'Good comprehension, working on reading fluency'
      },
      {
        subject: 'Science',
        description: 'Participated in plant growth experiment',
        performance: 'good',
        notes: 'Active participation in group activities'
      }
    ]
  },
  {
    id: '2',
    studentId: '1',
    date: '2023-11-07',
    attendance: 'present',
    activities: [
      {
        subject: 'Math',
        description: 'Worked on multiplication facts',
        performance: 'good',
        notes: 'Needs more practice with 7s and 8s'
      },
      {
        subject: 'Writing',
        description: 'Started personal narrative essay',
        performance: 'excellent',
        notes: 'Creative ideas and good sentence structure'
      }
    ]
  },
  {
    id: '3',
    studentId: '1',
    date: '2023-11-06',
    attendance: 'present',
    activities: [
      {
        subject: 'Social Studies',
        description: 'Map skills assessment',
        performance: 'needs improvement',
        notes: 'Struggling with cardinal directions and map scales'
      },
      {
        subject: 'Art',
        description: 'Watercolor landscape painting',
        performance: 'excellent',
        notes: 'Shows exceptional creativity and attention to detail'
      }
    ]
  }
];

// Demo weekly feedback
export const weeklyFeedback = [
  {
    id: '1',
    studentId: '1',
    weekStarting: '2023-11-06',
    weekEnding: '2023-11-10',
    summary: 'Emma had a productive week overall. She excelled in math and art activities, while showing consistent effort in reading and writing. She contributed positively to class discussions and worked well with peers during group activities.',
    strengths: [
      'Strong mathematical reasoning skills',
      'Creative expression in writing and art',
      'Positive attitude toward learning',
      'Helpful to classmates'
    ],
    areasToImprove: [
      'Map reading skills in social studies',
      'Reading fluency and expression',
      'Time management during independent work'
    ],
    weeklyTasksSummary: 'This week, students worked on equivalent fractions in math, continued reading "Charlotte\'s Web", conducted plant growth experiments in science, practiced map skills in social studies, and created watercolor landscapes in art. Emma completed all assigned tasks except for the map skills homework.',
    teacherNotes: 'Emma is showing great progress this quarter. I recommend continued reading practice at home to improve fluency.',
    nextWeekFocus: 'Next week we will focus on decimal fractions, begin a new science unit on weather, and start preparing for the winter concert.'
  }
];
