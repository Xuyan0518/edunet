import React from 'react';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';
import { getAuthHeaders } from '@/utils/auth';
import { ChevronRight, ChevronDown, Settings2, RefreshCcw } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';

type TopicNode = {
  id: string;
  code: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'completed';
  definitionRecited: boolean;
  chapterExerciseCompleted: boolean;
  children?: TopicNode[];
};

type SubjectWithTopics = {
  subject: {
    id: string;
    code: string;
    name: string;
    level: string;
  };
  topics: TopicNode[];
};

type Subject = {
  id: string;
  code: string;
  name: string;
  level: string;
};

const statusColor = (status: TopicNode['status']) => {
  switch (status) {
    case 'completed':
      return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
    case 'in_progress':
      return 'bg-amber-100 text-amber-800 border border-amber-200';
    default:
      return 'bg-slate-100 text-slate-800 border border-slate-200';
  }
};

const deriveTopicStatus = (
  definitionRecited: boolean,
  chapterExerciseCompleted: boolean
): TopicNode['status'] => {
  if (definitionRecited && chapterExerciseCompleted) return 'completed';
  if (definitionRecited || chapterExerciseCompleted) return 'in_progress';
  return 'not_started';
};

interface Props {
  studentId: string;
  readOnly?: boolean;
}

const SubjectTopicsPanel: React.FC<Props> = ({ studentId, readOnly = false }) => {
  const [subjectsWithTopics, setSubjectsWithTopics] = React.useState<SubjectWithTopics[]>([]);
  const [loading, setLoading] = React.useState(true);
  const canEdit = !readOnly;
  const { t } = useI18n();

  const getStatusLabel = (status: TopicNode['status']) => {
    switch (status) {
      case 'not_started':
        return t('subjects.status.notStarted');
      case 'in_progress':
        return t('subjects.status.inProgress');
      case 'completed':
        return t('subjects.status.completed');
      default:
        return status.replace('_', ' ');
    }
  };

  // Topic expand/collapse
  const [expandedTopics, setExpandedTopics] = React.useState<Set<string>>(new Set());

  // Subject management state
  const [manageMode, setManageMode] = React.useState(false);
  const [allSubjects, setAllSubjects] = React.useState<Subject[]>([]);
  const [assignedSubjectIds, setAssignedSubjectIds] = React.useState<string[]>([]);
  const [originalAssignedSubjectIds, setOriginalAssignedSubjectIds] = React.useState<string[]>([]);
  const [subjectSearch, setSubjectSearch] = React.useState('');
  const [subjectsLoading, setSubjectsLoading] = React.useState(false);
  const [subjectsSaving, setSubjectsSaving] = React.useState(false);
  const [syncingTopics, setSyncingTopics] = React.useState(false);

  const { toast } = useToast();

  const fetchSubjectsWithTopics = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl(`students/${studentId}/subjects/full`), {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch subjects and topics');
      const data: SubjectWithTopics[] = await res.json();
      setSubjectsWithTopics(data);
    } catch (err) {
      toast({ title: t('subjects.error.title'), description: t('subjects.error.load'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [studentId, toast, t]);

  const fetchSubjectManagementData = React.useCallback(async () => {
    setSubjectsLoading(true);
    try {
      const [subsRes, assignedRes] = await Promise.all([
        fetch(buildApiUrl('subjects')),
        fetch(buildApiUrl(`students/${studentId}/subjects`), {
          headers: getAuthHeaders(),
        }),
      ]);
      if (!subsRes.ok) throw new Error('Failed to load all subjects');
      if (!assignedRes.ok) throw new Error('Failed to load assigned subjects');

      const all: Subject[] = await subsRes.json();
      const assignedIds: string[] = await assignedRes.json();

      const sorted = all.sort((a, b) => {
        const lvl = (a.level || '').localeCompare(b.level || '');
        return lvl !== 0 ? lvl : a.code.localeCompare(b.code);
      });

      setAllSubjects(sorted);
      setAssignedSubjectIds(assignedIds);
      setOriginalAssignedSubjectIds(assignedIds);
    } catch {
      toast({ title: t('subjects.error.title'), description: t('subjects.error.assign'), variant: 'destructive' });
    } finally {
      setSubjectsLoading(false);
    }
  }, [studentId, toast, t]);

  React.useEffect(() => {
    fetchSubjectsWithTopics();
  }, [fetchSubjectsWithTopics]);

  const syncTopicsFromCatalog = React.useCallback(async () => {
    if (!canEdit) return;
    setSyncingTopics(true);
    try {
      const res = await fetch(buildApiUrl(`students/${studentId}/subjects/sync-catalog`), {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to sync topics');
      const data: {
        syncedSubjectCodes: string[];
        skippedSubjectCodes: string[];
        topicsUpsertedCount: number;
      } = await res.json();

      const syncedCount = data.syncedSubjectCodes?.length ?? 0;
      const skippedCount = data.skippedSubjectCodes?.length ?? 0;
      const topicCount = data.topicsUpsertedCount ?? 0;

      toast({
        title: t('subjects.synced.title'),
        description: t('subjects.synced.desc', { synced: syncedCount, skipped: skippedCount, count: topicCount }),
      });

      await fetchSubjectsWithTopics();
    } catch {
      toast({
        title: t('subjects.error.title'),
        description: t('subjects.error.sync'),
        variant: 'destructive',
      });
    } finally {
      setSyncingTopics(false);
    }
  }, [studentId, toast, fetchSubjectsWithTopics, canEdit, t]);

  // Manage: toggle open loads the lists
  const openManage = async () => {
    setManageMode(true);
    await fetchSubjectManagementData();
  };

  const closeManage = () => {
    setManageMode(false);
    setSubjectSearch('');
    setAssignedSubjectIds(originalAssignedSubjectIds);
  };

  // Update topic completion conditions
  const updateConditions = async (
    topicId: string,
    conditions: Pick<TopicNode, 'definitionRecited' | 'chapterExerciseCompleted'>
  ) => {
    if (!canEdit) return;
    // Optimistic update
    setSubjectsWithTopics(prev =>
      prev.map(s => ({ ...s, topics: patchTopicConditions(s.topics, topicId, conditions) }))
    );
    try {
      const res = await fetch(buildApiUrl(`students/${studentId}/topics/${topicId}/progress`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(conditions),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast({ title: t('subjects.error.title'), description: t('subjects.error.updateStatus'), variant: 'destructive' });
      fetchSubjectsWithTopics(); // revert
    }
  };

  const toggleTopic = (id: string) => {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // ---------- Manage Subjects: selection helpers ----------
  const filteredSubjects = React.useMemo(() => {
    const q = subjectSearch.trim().toLowerCase();
    if (!q) return allSubjects;
    return allSubjects.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.code.toLowerCase().includes(q) ||
      (s.level || '').toLowerCase().includes(q)
    );
  }, [allSubjects, subjectSearch]);

  const isDirtySubjects = React.useMemo(() => {
    if (assignedSubjectIds.length !== originalAssignedSubjectIds.length) return true;
    const a = [...assignedSubjectIds].sort().join(',');
    const b = [...originalAssignedSubjectIds].sort().join(',');
    return a !== b;
  }, [assignedSubjectIds, originalAssignedSubjectIds]);

  const toggleSubjectId = (id: string) => {
    setAssignedSubjectIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    const set = new Set(assignedSubjectIds);
    filteredSubjects.forEach(s => set.add(s.id));
    setAssignedSubjectIds(Array.from(set));
  };

  const unselectAllFiltered = () => {
    const remove = new Set(filteredSubjects.map(s => s.id));
    setAssignedSubjectIds(prev => prev.filter(id => !remove.has(id)));
  };

  const saveSubjects = async () => {
    if (!canEdit) return;
    setSubjectsSaving(true);
    try {
      const res = await fetch(buildApiUrl(`students/${studentId}/subjects`), {
        method: 'PUT', // replace set on server
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ subjectIds: assignedSubjectIds }),
      });
      if (!res.ok) throw new Error('Failed to update subjects');
      setOriginalAssignedSubjectIds(assignedSubjectIds);
      toast({ title: t('subjects.saved.title'), description: t('subjects.saved.desc') });
      // Refresh nested topics to reflect newly added/removed subjects
      await fetchSubjectsWithTopics();
      setManageMode(false);
    } catch (err) {
      toast({ title: t('subjects.error.title'), description: t('subjects.error.save'), variant: 'destructive' });
    } finally {
      setSubjectsSaving(false);
    }
  };

  // ---------- Render ----------
  const renderTopic = (node: TopicNode) => {
    const hasChildren = !!node.children && node.children.length > 0;
    const isOpen = expandedTopics.has(node.id);
    const derivedStatus = deriveTopicStatus(node.definitionRecited, node.chapterExerciseCompleted);
    const selectedConditions = [
      node.definitionRecited ? 'definitionRecited' : null,
      node.chapterExerciseCompleted ? 'chapterExerciseCompleted' : null,
    ].filter(Boolean) as string[];

    return (
      <div key={node.id} className="border border-slate-200 rounded-md bg-white p-3 mb-2 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                aria-label={isOpen ? t('subjects.toggle.collapse') : t('subjects.toggle.expand')}
                aria-expanded={isOpen}
                onClick={() => toggleTopic(node.id)}
                className="mt-0.5 shrink-0 rounded p-1 hover:bg-accent"
              >
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            ) : (
              <span className="w-6 h-6 inline-block" />
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-muted-foreground">{node.code}</span>
                <span className="font-medium break-words">{node.title}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Badge className={cn("capitalize", statusColor(derivedStatus))}>
              {getStatusLabel(derivedStatus)}
            </Badge>
            <ToggleGroup
              type="multiple"
              value={selectedConditions}
              onValueChange={(values) => {
                if (!canEdit) return;
                const nextDefinitionRecited = values.includes('definitionRecited');
                const nextChapterExerciseCompleted = values.includes('chapterExerciseCompleted');
                updateConditions(node.id, {
                  definitionRecited: nextDefinitionRecited,
                  chapterExerciseCompleted: nextChapterExerciseCompleted,
                });
              }}
              variant="outline"
              size="sm"
              className="flex flex-wrap gap-1 bg-slate-50 border border-slate-200 rounded-md p-1"
            >
              <ToggleGroupItem value="definitionRecited" disabled={!canEdit}>
                {t('subjects.condition.definitionRecitation')}
              </ToggleGroupItem>
              <ToggleGroupItem value="chapterExerciseCompleted" disabled={!canEdit}>
                {t('subjects.condition.chapterExercise')}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {hasChildren && isOpen && (
          <div className="mt-3 pl-4 border-l">
            {node.children!.map(renderTopic)}
          </div>
        )}
      </div>
    );
  };

  if (loading) return <p>{t('subjects.loading')}</p>;

  return (
    <section className="mt-10">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-2xl">{t('subjects.title')}</CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={fetchSubjectsWithTopics}
              className="bg-white text-black border hover:bg-blue-600 hover:text-white"
            >
              <RefreshCcw className="h-4 w-4 mr-1" />
              {t('subjects.refresh')}
            </Button>

            {canEdit && (
              <>
                <Button
                  size="sm"
                  onClick={syncTopicsFromCatalog}
                  disabled={syncingTopics}
                  className="bg-white text-black border hover:bg-blue-600 hover:text-white"
                >
                  {syncingTopics ? t('subjects.syncing') : t('subjects.sync')}
                </Button>

                <Button
                  size="sm"
                  onClick={openManage}
                  className="bg-white text-black border hover:bg-blue-600 hover:text-white"
                >
                  <Settings2 className="h-4 w-4 mr-1" />
                  {t('subjects.manage')}
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Manage Subjects inline panel */}
          {canEdit && manageMode && (
            <Card className="mb-6 border-slate-200 bg-slate-50">
              <CardContent className="p-4">
                <div className="flex items-end justify-between gap-3">
                  <div className="flex-1">
                    <Label htmlFor="subjectSearch">{t('subjects.manage.title')}</Label>
                    <Input
                      id="subjectSearch"
                      placeholder={t('subjects.manage.search')}
                      value={subjectSearch}
                      onChange={(e) => setSubjectSearch(e.target.value)}
                      className="bg-white"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={selectAllFiltered} disabled={subjectsLoading}>
                      {t('subjects.manage.selectFiltered')}
                    </Button>
                    <Button type="button" variant="outline" onClick={unselectAllFiltered} disabled={subjectsLoading}>
                      {t('subjects.manage.unselectFiltered')}
                    </Button>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground mt-2">
                  {t('subjects.manage.selectedCount', { count: assignedSubjectIds.length })}
                </div>

                <div className="border border-slate-200 rounded-md bg-white p-3 max-h-72 overflow-auto mt-3">
                  {subjectsLoading ? (
                    <div className="text-sm">{t('subjects.manage.loading')}</div>
                  ) : filteredSubjects.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{t('subjects.manage.empty')}</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {filteredSubjects.map((s) => {
                        const checked = assignedSubjectIds.includes(s.id);
                        return (
                          <label
                            key={s.id}
                            className={`flex items-start gap-2 border border-slate-200 rounded-md p-2 cursor-pointer hover:bg-blue-50 ${checked ? 'bg-blue-50/80' : 'bg-white'}`}
                            title={`${s.name} (${s.code})`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSubjectId(s.id)}
                              className="mt-1"
                            />
                            <div>
                              <div className="text-sm font-medium">{s.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {s.code} · {s.level}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 mt-3">
                  <Button type="button" variant="outline" onClick={closeManage} disabled={subjectsSaving}>
                    {t('subjects.manage.cancel')}
                  </Button>
                  <Button type="button" onClick={saveSubjects} disabled={subjectsSaving || !isDirtySubjects}>
                    {subjectsSaving ? t('subjects.saving') : t('subjects.manage.save')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Separator className="mb-4" />

          {subjectsWithTopics.length === 0 ? (
            <p>{t('subjects.empty.none')}</p>
          ) : (
            <Accordion type="multiple" className="w-full">
              {subjectsWithTopics.map((s) => (
                <AccordionItem key={s.subject.id} value={s.subject.id} className="border-slate-200">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="text-left">
                      <div className="font-semibold">{s.subject.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.subject.code} · {s.subject.level}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {s.topics.length === 0 ? (
                      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-muted-foreground">
                        <div>{t('subjects.empty.topics')}</div>
                        {canEdit && (
                          <Button
                            size="sm"
                            onClick={syncTopicsFromCatalog}
                            disabled={syncingTopics}
                            className="mt-2"
                          >
                            {syncingTopics ? t('subjects.syncing') : t('subjects.empty.syncCta')}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {s.topics.map(renderTopic)}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </section>
  );
};

function patchTopicConditions(
  nodes: TopicNode[],
  id: string,
  conditions: Pick<TopicNode, 'definitionRecited' | 'chapterExerciseCompleted'>
): TopicNode[] {
  const applyConditionsRecursively = (node: TopicNode): TopicNode => {
    const nextDefinitionRecited = true;
    const nextChapterExerciseCompleted = true;
    const children = node.children?.map((child) => applyConditionsRecursively(child));
    return {
      ...node,
      definitionRecited: nextDefinitionRecited,
      chapterExerciseCompleted: nextChapterExerciseCompleted,
      status: deriveTopicStatus(nextDefinitionRecited, nextChapterExerciseCompleted),
      children,
    };
  };

  return nodes.map(n => {
    if (n.id === id) {
      const nextDefinitionRecited = conditions.definitionRecited ?? n.definitionRecited;
      const nextChapterExerciseCompleted =
        conditions.chapterExerciseCompleted ?? n.chapterExerciseCompleted;
      const nextStatus = deriveTopicStatus(nextDefinitionRecited, nextChapterExerciseCompleted);
      const children =
        nextStatus === 'completed'
          ? n.children?.map((child) => applyConditionsRecursively(child))
          : n.children;
      return {
        ...n,
        definitionRecited: nextDefinitionRecited,
        chapterExerciseCompleted: nextChapterExerciseCompleted,
        status: nextStatus,
        children,
      };
    }
    if (n.children && n.children.length > 0) {
      return { ...n, children: patchTopicConditions(n.children, id, conditions) };
    }
    return n;
  });
}

export default SubjectTopicsPanel;
