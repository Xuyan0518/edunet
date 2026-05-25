import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { dailyProgress, studentsTable } from "../schema";
import { normalizeActivities } from "../utils/englishNormalize";

type Args = {
  studentId: string;
  startDate: string;
  endDate: string;
  overwrite: boolean;
  updatedByName: string;
};

type SubjectTemplate = {
  name: string;
  topics: string[];
  strengths: string[];
  improvements: string[];
};

const SUBJECTS: SubjectTemplate[] = [
  {
    name: "中三/四 高数(G3) Secondary 3/4 G3 Additional Mathematics",
    topics: ["三角函数恒等变换", "二次函数图像", "坐标几何综合题", "函数应用题"],
    strengths: ["计算准确率高", "解题步骤完整", "公式使用熟练"],
    improvements: ["题目阅读速度可再提升", "复杂题型审题需更细致", "步骤书写可更精简"],
  },
  {
    name: "中三/四 数学(G3) Secondary 3/4 G3 Math",
    topics: ["三角函数证明", "坐标几何综合题", "二次函数应用", "代数恒等式变形"],
    strengths: ["基础分稳定", "步骤书写清晰", "运算速度较快"],
    improvements: ["压轴题拆解还需训练", "几何题图形信息提取可加强", "细节检查要更稳定"],
  },
  {
    name: "中三/四 生物(纯) Secondary 3/4 Pure Biology",
    topics: ["细胞结构与功能", "酶与代谢", "遗传基础", "生态系统能量流动"],
    strengths: ["术语记忆较稳", "图表题表现不错", "概念对比清晰"],
    improvements: ["实验题表达要更完整", "因果链条描述需更准确", "长题审题速度可提升"],
  },
  {
    name: "中三/四 化学(纯) Secondary 3/4 Pure Chemistry",
    topics: ["mole章节练习", "酸碱中和与滴定", "化学键与结构", "有机化学基础"],
    strengths: ["概念理解较扎实", "方程式配平较稳定", "题目完成度高"],
    improvements: ["计算题细节仍需检查", "percentage yield题型需加练", "单位换算需更谨慎"],
  },
  {
    name: "中三/四 物理(纯) Secondary 3/4 Pure Physics",
    topics: ["力与平衡", "电学电路分析", "热学与能量转换", "波动与光学"],
    strengths: ["物理图像理解较好", "公式套用准确", "计算过程有条理"],
    improvements: ["文字解释题可更完整", "单位标注需保持一致", "多步骤题容错率需降低"],
  },
];

const ABSENT_DATES = new Set(["2026-05-04", "2026-05-10", "2026-05-17"]);
const LATE_DATES = new Set(["2026-05-08", "2026-05-20"]);

const DAY_MS = 24 * 60 * 60 * 1000;

const pad2 = (value: number) => String(value).padStart(2, "0");

const fmtDate = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toBool = (value: string | undefined) => {
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
};

const parseArgs = (): Args => {
  const argMap = new Map<string, string>();
  process.argv.slice(2).forEach((raw) => {
    const cleaned = raw.replace(/^-+/, "");
    const [key, ...rest] = cleaned.split("=");
    if (!key) return;
    argMap.set(key, rest.join("="));
  });

  const studentId = (argMap.get("studentId") || "").trim();
  if (!studentId) {
    throw new Error("Missing --studentId=UUID");
  }

  const startDate = (argMap.get("startDate") || "2026-05-01").trim();
  const endDate = (argMap.get("endDate") || "2026-05-24").trim();
  const overwrite = toBool(argMap.get("overwrite"));
  const updatedByName = (argMap.get("updatedByName") || "seed-daily-progress").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error("startDate/endDate must be YYYY-MM-DD");
  }
  if (startDate > endDate) {
    throw new Error("startDate must be <= endDate");
  }

  return { studentId, startDate, endDate, overwrite, updatedByName };
};

const pick = <T>(list: T[], index: number) => list[index % list.length];

const buildEnglishActivity = (dayIndex: number) => {
  const editingCount = dayIndex % 2 === 0 ? 2 : 1;
  const readingCount = dayIndex % 3 === 0 ? 1 : 0;
  const grammarCount = dayIndex % 2 === 0 ? 1 : 2;
  const wordsCount = 12 + (dayIndex % 7) * 2;
  const sentenceCount = 2 + (dayIndex % 3);
  const essayToday = dayIndex % 4 === 0;
  const baseScore = clamp(74 + Math.floor(dayIndex / 4) + ((dayIndex % 3) - 1) * 2, 60, 96);

  const editingExercises = Array.from({ length: editingCount }).map((_, idx) => ({
    score: clamp(16 + Math.floor((baseScore + idx) / 8), 10, 24),
    totalScore: 25,
    problems: idx % 2 === 0 ? "时态错误" : "主谓一致需加强",
  }));

  const readingExercises = Array.from({ length: readingCount }).map((_, idx) => ({
    score: clamp(14 + Math.floor((baseScore - 3 + idx) / 7), 8, 20),
    totalScore: 20,
    problems: "细节定位速度可再提升",
  }));

  const grammarExercises = Array.from({ length: grammarCount }).map((_, idx) => ({
    score: clamp(12 + Math.floor((baseScore - 2 + idx) / 8), 8, 18),
    totalScore: 20,
    problems: idx % 2 === 0 ? "介词搭配不稳定" : "从句结构需复盘",
  }));

  const customTasks = dayIndex % 6 === 0
    ? [
        {
          taskId: "custom-listening",
          key: "listening",
          displayName: "Listening",
          chineseName: "听力",
          englishName: "Listening",
          practiceCount: 1,
          score: clamp(12 + Math.floor((baseScore - 4) / 8), 8, 18),
          maxScore: 20,
          problems: "听写拼写仍需加强",
          completed: true,
          targetCount: 2,
          fieldsUsed: ["practiceCount", "score", "problems"],
        },
      ]
    : [];

  return {
    subjectId: "",
    subjectName: "英文 English",
    type: "english",
    taskSummary: `改错${editingCount}次${readingCount ? `，阅读${readingCount}篇` : ""}，语法${grammarCount}题`,
    strengths: "完成度高，英文训练节奏稳定。",
    improvements: "建议继续加强错因复盘与表达准确性。",
    practiceProgress: `改错${editingCount}次${readingCount ? `，阅读${readingCount}篇` : ""}，语法${grammarCount}题`,
    definitionRecitation: "",
    comment: "",
    papers: [],
    englishTasks: customTasks,
    english: {
      editing: {
        text: "改错训练",
        score: null,
        totalScore: 100,
        exerciseCount: editingCount,
        exercises: editingExercises,
        lossPointIds: [],
        lossPointLabelsSnapshot: [],
        otherLossPointText: "",
      },
      reading: {
        text: readingCount ? "阅读理解训练" : "",
        score: null,
        totalScore: 100,
        articleCount: readingCount,
        exercises: readingExercises,
        lossPointIds: [],
        lossPointLabelsSnapshot: [],
        otherLossPointText: "",
      },
      grammar: {
        text: "语法专项训练",
        score: null,
        totalScore: 100,
        exerciseCount: grammarCount,
        exercises: grammarExercises,
        lossPointIds: [],
        lossPointLabelsSnapshot: [],
        otherLossPointText: "",
      },
      vocab: {
        text: "词汇与句子积累",
        vocabularySentenceCount: sentenceCount,
        vocabularyWordCount: wordsCount,
      },
      recitation: {
        text: "课文与句型背诵",
      },
      essay: {
        text: essayToday ? "完成短文写作训练" : "",
        title: essayToday ? pick(["My Favourite Day", "A Helpful Friend", "My Weekend Plan"], dayIndex) : "",
        completed: essayToday,
        score: essayToday ? clamp(18 + Math.floor((baseScore - 1) / 10), 12, 28) : null,
        totalScore: essayToday ? 30 : null,
        lossPointIds: [],
        lossPointLabelsSnapshot: [],
        otherLossPointText: "",
      },
    },
  };
};

const buildSubjectActivity = (dayIndex: number) => {
  const subject = pick(SUBJECTS, dayIndex);
  const topic = pick(subject.topics, dayIndex);
  const strength = pick(subject.strengths, dayIndex + 1);
  const improvement = pick(subject.improvements, dayIndex + 2);
  return {
    subjectId: "",
    subjectName: subject.name,
    type: "generic",
    taskSummary: topic,
    strengths: strength,
    improvements: improvement,
    practiceProgress: topic,
    definitionRecitation: dayIndex % 2 === 0 ? "关键定义已复述" : "",
    comment: dayIndex % 5 === 0 ? "课堂专注度良好，能按时完成任务。" : "",
    papers: [],
  };
};

const buildExtraSubjectActivity = (dayIndex: number) => {
  const subject = pick(SUBJECTS, dayIndex + 1);
  const topic = pick(subject.topics, dayIndex + 2);
  return {
    subjectId: "",
    subjectName: subject.name,
    type: "generic",
    taskSummary: `${topic}（巩固）`,
    strengths: "巩固练习完成较快。",
    improvements: "建议继续提高复杂题型稳定性。",
    practiceProgress: `${topic}（巩固）`,
    definitionRecitation: "",
    comment: "",
    papers: [],
  };
};

const buildDayPayload = (dateStr: string, dayIndex: number) => {
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  const isSunday = day === 0;
  const absent = isSunday || ABSENT_DATES.has(dateStr);
  const late = !absent && LATE_DATES.has(dateStr);
  const isSaturday = day === 6;

  if (absent) {
    const reason = isSunday ? "周日休息" : "身体不适请假";
    return {
      attendance: "absent",
      attendanceStart: null,
      attendanceEnd: null,
      summary: `当日缺席（${reason}）。`,
      activities: [],
    };
  }

  const english = buildEnglishActivity(dayIndex);
  const subjectMain = buildSubjectActivity(dayIndex);
  const shouldAddExtra = !isSaturday && dayIndex % 5 === 0;
  const activities = shouldAddExtra ? [english, subjectMain, buildExtraSubjectActivity(dayIndex)] : [english, subjectMain];
  const normalizedActivities = normalizeActivities(activities) as Record<string, unknown>[];
  const start = late ? "18:20" : isSaturday ? "14:00" : "18:00";
  const end = isSaturday ? "17:00" : "21:00";
  const statusText = late ? "迟到" : "出席";
  const summary = `${statusText}。完成英文专项训练，并完成${subjectMain.subjectName}的${subjectMain.taskSummary}练习。`;

  return {
    attendance: late ? "late" : "present",
    attendanceStart: start,
    attendanceEnd: end,
    summary,
    activities: normalizedActivities,
  };
};

const dateRange = (startDate: string, endDate: string) => {
  const out: string[] = [];
  let current = new Date(`${startDate}T00:00:00`).getTime();
  const end = new Date(`${endDate}T00:00:00`).getTime();
  while (current <= end) {
    out.push(fmtDate(new Date(current)));
    current += DAY_MS;
  }
  return out;
};

async function seedDailyProgress() {
  const args = parseArgs();

  const student = await db
    .select({ id: studentsTable.id, name: studentsTable.name, grade: studentsTable.grade })
    .from(studentsTable)
    .where(eq(studentsTable.id, args.studentId))
    .limit(1);

  if (!student.length) {
    throw new Error(`Student not found: ${args.studentId}`);
  }

  const dates = dateRange(args.startDate, args.endDate);
  const existing = await db
    .select({ id: dailyProgress.id })
    .from(dailyProgress)
    .where(
      and(
        eq(dailyProgress.studentId, args.studentId),
        gte(dailyProgress.date, args.startDate),
        lte(dailyProgress.date, args.endDate),
      ),
    );

  if (existing.length > 0 && !args.overwrite) {
    throw new Error(
      `Found ${existing.length} existing daily_progress rows in range ${args.startDate}..${args.endDate}. Re-run with --overwrite=1 to upsert.`,
    );
  }

  let inserted = 0;
  for (let i = 0; i < dates.length; i += 1) {
    const date = dates[i];
    const payload = buildDayPayload(date, i);
    await db
      .insert(dailyProgress)
      .values({
        studentId: args.studentId,
        date,
        attendance: payload.attendance,
        attendanceStart: payload.attendanceStart,
        attendanceEnd: payload.attendanceEnd,
        summary: payload.summary,
        activities: payload.activities,
        updatedAt: new Date(),
        updatedByName: args.updatedByName,
      })
      .onConflictDoUpdate({
        target: [dailyProgress.studentId, dailyProgress.date],
        set: {
          attendance: sql`excluded.attendance`,
          attendanceStart: sql`excluded.attendance_start`,
          attendanceEnd: sql`excluded.attendance_end`,
          summary: sql`excluded.summary`,
          activities: sql`excluded.activities`,
          updatedAt: sql`excluded.updated_at`,
          updatedByName: sql`excluded.updated_by_name`,
        },
      });
    inserted += 1;
  }

  const finalCount = await db
    .select({ id: dailyProgress.id })
    .from(dailyProgress)
    .where(
      and(
        eq(dailyProgress.studentId, args.studentId),
        gte(dailyProgress.date, args.startDate),
        lte(dailyProgress.date, args.endDate),
      ),
    );

  console.log(`✅ Seed complete for ${student[0].name} (${student[0].grade})`);
  console.log(`Range: ${args.startDate} ~ ${args.endDate}`);
  console.log(`Rows processed: ${inserted}`);
  console.log(`Rows in DB for this range: ${finalCount.length}`);
}

seedDailyProgress()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
