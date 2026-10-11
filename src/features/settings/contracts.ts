// Wire contract: server/utils/englishTasks.ts and audit C6. IDs/keys are stable across edits.
export type TaskField = 'practiceCount' | 'score' | 'problems';
export interface EnglishTask {
    id: string;
    key: string;
    chineseName: string;
    englishName: string;
    displayName: string;
    weeklyTargetCount: number;
    enabled: boolean;
    enabledFields: TaskField[];
    sortOrder: number;
}
export interface TaskSettings {
    tasks: EnglishTask[];
    isDefault: boolean;
    updatedAt?: string;
    updatedByName?: string;
}
export interface StudySettings {
    enabled: boolean;
    days: number[];
    startTime: string;
    endTime: string;
}
export const presets = [
    ['editing', '改错', 'Editing'], ['reading', '阅读理解', 'Reading'], ['grammar', '语法', 'Grammar'],
    ['vocab', '词汇', 'Vocab'], ['recitation', '单词句子背诵', 'Recitation'], ['essay', '作文', 'Essay'],
    ['listening', '听力', 'Listening'], ['oral', '口语', 'Oral'], ['dictation', '默写', 'Dictation'],
    ['sentence_patterns', '句型', 'Sentence Patterns'], ['custom', '其他', 'Custom'],
] as const;
export function makeTask(presetKey: string, index: number, id: string): EnglishTask {
    const preset = presets.find(preset => preset[0] === presetKey) || presets[presets.length - 1];
    return {
        id, key: preset[0] === 'custom' ? `custom_${id}` : preset[0], chineseName: preset[1], englishName: preset[2],
        displayName: `${preset[1]} (${preset[2]})`, weeklyTargetCount: preset[0] === 'vocab' ? 50 : preset[0] === 'essay' ? 1 : 5,
        enabled: true, enabledFields: ['practiceCount', 'score', 'problems'], sortOrder: index,
    };
}
export function validateTasks(tasks: EnglishTask[]): boolean {
    return tasks.length > 0 && tasks.length <= 30 && tasks.every(task => !!task.displayName.trim() && task.displayName.length <= 120 && task.chineseName.length <= 80 && task.englishName.length <= 80 &&
        Number.isInteger(task.weeklyTargetCount) && task.weeklyTargetCount >= 0 && task.weeklyTargetCount <= 500 && task.enabledFields.length > 0);
}
export function tasksPayload(tasks: EnglishTask[]) {
    if (!validateTasks(tasks))
        throw new Error('Invalid English task configuration');
    return { tasks: tasks.map((task, sortOrder) => ({ ...task, displayName: task.displayName.trim(), chineseName: task.chineseName.trim(), englishName: task.englishName.trim(), enabledFields: [...task.enabledFields], sortOrder })) };
}
