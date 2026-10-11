import { useWebCopy } from "@/i18n/web";
import { record, text } from "@/domain/activityAdapters";
import { normalizeEnglishFields } from "@/domain/englishNormalize";
import { finiteNumber } from "@/domain/scoreDisplay";
import {
  canonicalSkills,
  Skill,
  Activity,
  updateEnglishSkill,
  snapshot
} from "./englishActivity";
import { EnglishTask } from "@/features/settings/contracts";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
export interface LossCatalog {
  categories: {
    id: string;
    name: string;
    points: { id: string; label: string }[];
  }[];
}
function ScoreFields({
  value,
  onChange
}: {
  value: Activity;
  onChange: (patch: Activity) => void;
}) {
  const c = useWebCopy();
  return (
    <div className="web-grid">
      {["score", "totalScore"].map(field => (
        <label key={field} className="web-field">
          {field === "score"
            ? c("得分", "Score")
            : c("满分（留空按 100）", "Total (blank means 100)")}
          <Input
            type="number"
            min={field === "score" ? 0 : 1}
            max="500"
            step="any"
            value={
              value[field] === null || value[field] === undefined
                ? ""
                : String(value[field])
            }
            onChange={event =>
              onChange({ [field]: finiteNumber(event.target.value) })
            }
          />
        </label>
      ))}
    </div>
  );
}
function Exercises({
  rows,
  onChange,
  score = true,
  problems = true
}: {
  rows: Activity[];
  onChange: (rows: Activity[]) => void;
  score?: boolean;
  problems?: boolean;
}) {
  const c = useWebCopy();
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <fieldset className="rounded border p-3" key={index}>
          <legend>{c(`练习 ${index + 1}`, `Exercise ${index + 1}`)}</legend>
          {score && (
            <ScoreFields
              value={row}
              onChange={patch =>
                onChange(
                  rows.map((item, i) =>
                    i === index ? { ...item, ...patch } : item
                  )
                )
              }
            />
          )}
          {problems && (
            <label className="web-field">
              {c("出现的问题", "Problems")}
              <Textarea
                maxLength={1000}
                value={text(row.problems)}
                onChange={event =>
                  onChange(
                    rows.map((item, i) =>
                      i === index
                        ? { ...item, problems: event.target.value }
                        : item
                    )
                  )
                }
              />
            </label>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            {c("移除练习", "Remove exercise")}
          </Button>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={rows.length >= 30}
        onClick={() =>
          onChange([...rows, { score: null, totalScore: 100, problems: "" }])
        }
      >
        {c("添加练习", "Add exercise")}
      </Button>
    </div>
  );
}
export function EnglishActivityEditor({
  activity,
  onChange,
  config,
  loss
}: {
  activity: Activity;
  onChange: (activity: Activity) => void;
  config: EnglishTask[];
  loss: LossCatalog;
}) {
  const c = useWebCopy();
  const english = normalizeEnglishFields(
    activity.english ?? activity.englishFields
  );
  const tasks = (Array.isArray(activity.englishTasks)
    ? activity.englishTasks
    : []
  ).map(record);
  const labels: Record<Skill, string> = {
    editing: c("改错", "Editing"),
    reading: c("阅读理解", "Reading"),
    grammar: c("语法", "Grammar"),
    vocab: c("词汇", "Vocabulary"),
    recitation: c("背诵", "Recitation"),
    essay: c("作文", "Essay")
  };
  const update = (skill: Skill, patch: Activity) =>
    onChange(updateEnglishSkill(activity, skill, patch));
  const taskChange = (index: number, patch: Activity) =>
    onChange({
      ...activity,
      englishTasks: tasks.map((task, i) =>
        i === index ? { ...task, ...patch } : task
      )
    });
  return (
    <div className="space-y-4">
      {["description", "notes", "taskSummary", "strengths", "improvements"].map(
        field =>
          text(activity[field]) && (
            <p key={field} className="whitespace-pre-wrap">
              {text(activity[field])}
            </p>
          )
      )}
      {typeof activity.legacyEnglishText === "string" && (
        <p className="whitespace-pre-wrap">
          {c("历史英文文本", "Legacy English text")}:{" "}
          {activity.legacyEnglishText}
        </p>
      )}
      {canonicalSkills.map(skill => {
        const block = record(english[skill]);
        const metadata = tasks.find(task => task.key === skill);
        const fields = Array.isArray(metadata?.fieldsUsed)
          ? metadata.fieldsUsed
          : ["practiceCount", "score", "problems"];
        const enabled =
          metadata ||
          Object.values(block).some(value =>
            typeof value === "string"
              ? !!value
              : typeof value === "number"
              ? value > 0 && value !== 100
              : typeof value === "boolean"
              ? value
              : Array.isArray(value) && value.length > 0
          );
        if (!enabled) return null;
        const group = ["editing", "reading", "grammar"].includes(skill);
        const exercises = (Array.isArray(block.exercises)
          ? block.exercises
          : []
        ).map(record);
        return (
          <details key={skill} className="border rounded p-3" open>
            <summary className="font-semibold cursor-pointer">
              {text(metadata?.displayName) || labels[skill]}
              {metadata &&
                ` · ${c(
                  "记录目标",
                  "Recorded target"
                )}: ${metadata.targetCount ?? 0}`}
            </summary>
            <div className="space-y-3 mt-3">
              <label className="web-field">
                {c("内容 / 说明", "Text / notes")}
                <Textarea
                  maxLength={1000}
                  value={text(block.text)}
                  onChange={event =>
                    update(skill, { text: event.target.value })
                  }
                />
              </label>
              {group ? (
                <>
                  <p>
                    {c(
                      "练习数量由下方条目数记录。",
                      "The number of exercise rows records the completed count."
                    )}
                  </p>
                  {fields.includes("practiceCount") && (
                    <Exercises
                      score={fields.includes("score")}
                      problems={fields.includes("problems")}
                      rows={exercises}
                      onChange={rows =>
                        update(skill, {
                          exercises: rows,
                          [skill === "reading"
                            ? "articleCount"
                            : "exerciseCount"]: rows.length
                        })
                      }
                    />
                  )}
                  {(!fields.includes("practiceCount") ||
                    exercises.length === 0) &&
                    fields.includes("score") && (
                      <ScoreFields
                        value={block}
                        onChange={patch => update(skill, patch)}
                      />
                    )}
                </>
              ) : skill === "vocab" ? (
                <div className="web-grid">
                  {["vocabularyWordCount", "vocabularySentenceCount"].map(
                    field => (
                      <label className="web-field" key={field}>
                        {field === "vocabularyWordCount"
                          ? c("单词数", "Words")
                          : c("句子数", "Sentences")}
                        <Input
                          type="number"
                          min="0"
                          max="500"
                          step="1"
                          value={Number(block[field] || 0)}
                          onChange={event =>
                            update(skill, {
                              [field]: event.target.valueAsNumber || 0
                            })
                          }
                        />
                      </label>
                    )
                  )}
                </div>
              ) : skill === "essay" ? (
                <>
                  <label className="web-field">
                    {c("作文标题", "Essay title")}
                    <Input
                      maxLength={120}
                      value={text(block.title)}
                      onChange={event =>
                        update(skill, { title: event.target.value })
                      }
                    />
                  </label>
                  <label className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={block.completed === true}
                      onChange={event =>
                        update(skill, { completed: event.target.checked })
                      }
                    />
                    {c("已完成", "Completed")}
                  </label>
                  {fields.includes("score") && (
                    <ScoreFields
                      value={block}
                      onChange={patch => update(skill, patch)}
                    />
                  )}
                </>
              ) : null}
              {(group || skill === "essay") && (
                <fieldset className="space-y-2">
                  <legend>{c("失分点", "Loss points")}</legend>
                  {loss.categories.map(category => (
                    <div key={category.id}>
                      <strong>{category.name}</strong>
                      {category.points.map(point => {
                        const ids = Array.isArray(block.lossPointIds)
                          ? block.lossPointIds
                          : [];
                        return (
                          <label key={point.id} className="flex gap-2">
                            <input
                              type="checkbox"
                              checked={ids.includes(point.id)}
                              onChange={event => {
                                const next = event.target.checked
                                  ? [...ids, point.id]
                                  : ids.filter(id => id !== point.id);
                                update(skill, {
                                  lossPointIds: next,
                                  lossPointLabelsSnapshot: next.map(
                                    id =>
                                      loss.categories
                                        .flatMap(category => category.points)
                                        .find(point => point.id === id)
                                        ?.label ||
                                      text(
                                        (Array.isArray(
                                          block.lossPointLabelsSnapshot
                                        )
                                          ? block.lossPointLabelsSnapshot
                                          : [])[ids.indexOf(id)]
                                      ) ||
                                      text(id)
                                  )
                                });
                              }}
                            />
                            {point.label}
                          </label>
                        );
                      })}
                    </div>
                  ))}
                  {Array.isArray(block.lossPointLabelsSnapshot) &&
                    block.lossPointLabelsSnapshot.length > 0 && (
                      <p>
                        {c("记录中的标签", "Recorded labels")}:{" "}
                        {block.lossPointLabelsSnapshot.map(text).join("、")}
                      </p>
                    )}
                  <label className="web-field">
                    {c("其他失分原因", "Other loss reason")}
                    <Textarea
                      maxLength={1000}
                      value={text(block.otherLossPointText)}
                      onChange={event =>
                        update(skill, {
                          otherLossPointText: event.target.value
                        })
                      }
                    />
                  </label>
                </fieldset>
              )}
            </div>
          </details>
        );
      })}
      {tasks.map((task, index) => {
        if (canonicalSkills.includes(task.key as Skill)) return null;
        const fields = Array.isArray(task.fieldsUsed)
          ? task.fieldsUsed
          : ["practiceCount", "score", "problems"];
        return (
          <fieldset key={index} className="border rounded p-3 space-y-3">
            <legend>
              {text(task.displayName || task.key)} ·{" "}
              {c("记录目标", "Recorded target")}:{" "}
              {Number(task.targetCount || 0)}
            </legend>
            {fields.includes("practiceCount") ? (
              <Exercises
                rows={(Array.isArray(task.exercises) ? task.exercises : []).map(
                  record
                )}
                score={fields.includes("score")}
                problems={fields.includes("problems")}
                onChange={rows =>
                  taskChange(index, {
                    exercises: rows,
                    practiceCount: rows.length,
                    completed: rows.length > 0
                  })
                }
              />
            ) : (
              <>
                {fields.includes("score") && (
                  <ScoreFields
                    value={{ score: task.score, totalScore: task.maxScore }}
                    onChange={patch =>
                      taskChange(index, {
                        ...("score" in patch ? { score: patch.score } : {}),
                        ...("totalScore" in patch
                          ? { maxScore: patch.totalScore }
                          : {})
                      })
                    }
                  />
                )}
                {fields.includes("problems") && (
                  <label className="web-field">
                    {c("出现的问题", "Problems")}
                    <Textarea
                      maxLength={1000}
                      value={text(task.problems)}
                      onChange={event =>
                        taskChange(index, { problems: event.target.value })
                      }
                    />
                  </label>
                )}
              </>
            )}
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={task.completed === true}
                onChange={event =>
                  taskChange(index, { completed: event.target.checked })
                }
              />
              {c("已完成", "Completed")}
            </label>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                onChange({
                  ...activity,
                  englishTasks: tasks.filter((_, i) => i !== index)
                })
              }
            >
              {c("移除此记录项目", "Remove this recorded task")}
            </Button>
          </fieldset>
        );
      })}
      <div className="flex flex-wrap gap-2">
        {config
          .filter(
            meta => meta.enabled && !tasks.some(task => task.taskId === meta.id)
          )
          .map(meta => (
            <Button
              type="button"
              variant="outline"
              key={meta.id}
              onClick={() =>
                onChange({
                  ...activity,
                  englishTasks: [...tasks, snapshot(meta)]
                })
              }
            >
              {c("添加", "Add")} {meta.displayName}
            </Button>
          ))}
      </div>
    </div>
  );
}
