import {
  readActivity,
  record,
  text,
  hasValue
} from "@/domain/activityAdapters";
import { scoreDisplay } from "@/domain/scoreDisplay";
import { useWebCopy } from "@/i18n/web";

function Details({ value }: { value: unknown }) {
  const c = useWebCopy();
  const item = record(value);
  const score = scoreDisplay(item);
  const labels: Record<string, string> = {
    text: c("内容", "Text"),
    title: c("标题", "Title"),
    description: c("说明", "Description"),
    practiceCount: c("练习数量", "Practice count"),
    exerciseCount: c("练习数量", "Exercise count"),
    articleCount: c("篇数", "Article count"),
    vocabularyWordCount: c("单词数", "Words"),
    vocabularySentenceCount: c("句子数", "Sentences"),
    targetCount: c("记录时的目标", "Recorded target"),
    weeklyTargetCount: c("记录时的周目标", "Recorded weekly target"),
    problems: c("问题", "Problems"),
    otherLossPointText: c("其他失分点", "Other loss points"),
    subjectName: c("科目", "Subject"),
    typeName: c("类型", "Type"),
    schoolName: c("学校", "School"),
    date: c("日期", "Date")
  };
  return (
    <div className="space-y-1 text-sm">
      {Object.entries(labels)
        .filter(([key]) => hasValue(item[key]))
        .map(([key, label]) => (
          <p key={key} className="whitespace-pre-wrap break-words">
            <strong>{label}: </strong>
            {text(item[key])}
          </p>
        ))}
      {score.score !== null && (
        <p>
          {c("得分", "Score")}: {score.score}
          {score.total !== null && ` / ${score.total}`}
          {score.percentage !== null && ` (${score.percentage}%)`}
          {score.grade && ` · ${score.grade}`}
        </p>
      )}
      {typeof item.completed === "boolean" && (
        <p>
          {c("完成", "Completed")}:{" "}
          {item.completed ? c("是", "Yes") : c("否", "No")}
        </p>
      )}
      {Array.isArray(item.lossPointLabelsSnapshot) &&
        item.lossPointLabelsSnapshot.length > 0 && (
          <p>
            {c("失分点", "Loss points")}:{" "}
            {item.lossPointLabelsSnapshot.map(text).join("、")}
          </p>
        )}
      {Array.isArray(item.exercises) && item.exercises.length > 0 && (
        <ol className="space-y-2 pl-5 list-decimal">
          {item.exercises.map((exercise, index) => (
            <li key={index}>
              <Details value={exercise} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
export function ActivityReadView({ activity }: { activity: unknown }) {
  const c = useWebCopy();
  const view = readActivity(activity);
  const labels: Record<string, string> = {
    taskSummary: c("学习内容", "Task summary"),
    strengths: c("优点", "Strengths"),
    improvements: c("改进方向", "Improvements"),
    practiceProgress: c("练习进度", "Practice progress"),
    definitionRecitation: c("定义背诵", "Definition recitation"),
    comment: c("评语", "Comment"),
    description: c("说明", "Description"),
    notes: c("备注", "Notes")
  };
  const skills: Record<string, string> = {
    editing: c("改错", "Editing"),
    reading: c("阅读理解", "Reading"),
    grammar: c("语法", "Grammar"),
    vocab: c("词汇", "Vocabulary"),
    recitation: c("背诵", "Recitation"),
    essay: c("作文", "Essay")
  };
  return (
    <article className="activity-read rounded-md border p-4 space-y-3">
      <h3 className="font-semibold">
        {view.subject || c("历史学习记录", "Historical activity")}
        {view.performance && ` · ${view.performance}`}
      </h3>
      {view.narratives.map(item => (
        <p key={item.key} className="whitespace-pre-wrap break-words text-sm">
          <strong>{labels[item.key]}: </strong>
          {item.value}
        </p>
      ))}
      {view.legacyEnglishText && (
        <p className="whitespace-pre-wrap">{view.legacyEnglishText}</p>
      )}
      {view.english && (
        <div className="web-grid">
          {Object.entries(view.english)
            .filter(([skill]) => view.recordedSkills.includes(skill))
            .map(([skill, block]) => (
              <section key={skill} className="rounded border p-3">
                <h4 className="font-medium">{skills[skill]}</h4>
                <Details value={block} />
              </section>
            ))}
        </div>
      )}
      {view.tasks.map((task, index) => (
        <section key={index} className="rounded border p-3">
          <h4 className="font-medium">{task.label}</h4>
          <Details value={task} />
        </section>
      ))}
      {view.papers.length > 0 && (
        <section>
          <h4>{c("历史附带试卷", "Recorded papers")}</h4>
          {view.papers.map((paper, index) => (
            <Details key={index} value={paper} />
          ))}
        </section>
      )}
    </article>
  );
}
