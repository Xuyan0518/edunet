import React from 'react';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';
import { ChevronRight, ChevronDown, Settings2, RefreshCcw } from 'lucide-react';

type TopicNode = {
  id: string;
  code: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'completed';
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
      return 'bg-emerald-100 text-emerald-700';
    case 'in_progress':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
};

interface Props {
  studentId: string;
}

const SubjectTopicsPanel: React.FC<Props> = ({ studentId }) => {
  const [subjectsWithTopics, setSubjectsWithTopics] = React.useState<SubjectWithTopics[]>([]);
  const [loading, setLoading] = React.useState(true);

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

  const { toast } = useToast();

  const fetchSubjectsWithTopics = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl(`students/${studentId}/subjects/full`));
      if (!res.ok) throw new Error('Failed to fetch subjects and topics');
      const data: SubjectWithTopics[] = await res.json();
      setSubjectsWithTopics(data);
    } catch (err) {
      toast({ title: 'Error', description: 'Could not load subjects/topics', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [studentId, toast]);

  const fetchSubjectManagementData = React.useCallback(async () => {
    setSubjectsLoading(true);
    try {
      const [subsRes, assignedRes] = await Promise.all([
        fetch(buildApiUrl('subjects')),
        fetch(buildApiUrl(`students/${studentId}/subjects`)),
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
      toast({ title: 'Error', description: 'Could not load subject assignment data', variant: 'destructive' });
    } finally {
      setSubjectsLoading(false);
    }
  }, [studentId, toast]);

  React.useEffect(() => {
    fetchSubjectsWithTopics();
  }, [fetchSubjectsWithTopics]);

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

  // Update topic status
  const updateStatus = async (topicId: string, status: TopicNode['status']) => {
    // Optimistic update
    setSubjectsWithTopics(prev =>
      prev.map(s => ({ ...s, topics: patchTopicStatus(s.topics, topicId, status) }))
    );
    try {
      const res = await fetch(buildApiUrl(`students/${studentId}/topics/${topicId}/progress`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast({ title: 'Error', description: 'Failed to update topic status', variant: 'destructive' });
      fetchSubjectsWithTopics(); // revert
    }
  };

  const toggleTopic = (id: string) => {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
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
    setSubjectsSaving(true);
    try {
      const res = await fetch(buildApiUrl(`students/${studentId}/subjects`), {
        method: 'PUT', // replace set on server
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectIds: assignedSubjectIds }),
      });
      if (!res.ok) throw new Error('Failed to update subjects');
      setOriginalAssignedSubjectIds(assignedSubjectIds);
      toast({ title: 'Saved', description: 'Subjects updated for student' });
      // Refresh nested topics to reflect newly added/removed subjects
      await fetchSubjectsWithTopics();
      setManageMode(false);
    } catch (err) {
      toast({ title: 'Error', description: 'Could not save subjects', variant: 'destructive' });
    } finally {
      setSubjectsSaving(false);
    }
  };

  // ---------- Render ----------
  const renderTopic = (node: TopicNode) => {
    const hasChildren = !!node.children && node.children.length > 0;
    const isOpen = expandedTopics.has(node.id);

    return (
      <div key={node.id} className="border rounded-md p-3 mb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                aria-label={isOpen ? 'Collapse' : 'Expand'}
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
            <Badge className={cn(statusColor(node.status))}>
              {node.status.replace('_', ' ')}
            </Badge>
            <ToggleGroup
              type="single"
              value={node.status}
              onValueChange={val => {
                if (val) updateStatus(node.id, val as TopicNode['status']);
              }}
              className="hidden md:flex"
            >
              <ToggleGroupItem value="not_started">Not started</ToggleGroupItem>
              <ToggleGroupItem value="in_progress">In progress</ToggleGroupItem>
              <ToggleGroupItem value="completed">Completed</ToggleGroupItem>
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

  if (loading) return <p>Loading subjects &amp; topics…</p>;

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Subjects &amp; Topics</h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={fetchSubjectsWithTopics}
            className="bg-white text-black border hover:bg-blue-600 hover:text-white"
          >
            <RefreshCcw className="h-4 w-4 mr-1" />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={openManage}
            className="bg-white text-black border hover:bg-blue-600 hover:text-white"
          >
            <Settings2 className="h-4 w-4 mr-1" />
            Manage Subjects
          </Button>
        </div>
      </div>

      {/* Manage Subjects inline panel */}
      {manageMode && (
        <div className="mb-6 border rounded-md p-4">
          <div className="flex items-end justify-between gap-3">
            <div className="flex-1">
              <Label htmlFor="subjectSearch">Assign / Update Subjects</Label>
              <Input
                id="subjectSearch"
                placeholder="Search by name, code, or level…"
                value={subjectSearch}
                onChange={(e) => setSubjectSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={selectAllFiltered} disabled={subjectsLoading}>
                Select Filtered
              </Button>
              <Button type="button" variant="outline" onClick={unselectAllFiltered} disabled={subjectsLoading}>
                Unselect Filtered
              </Button>
            </div>
          </div>

          <div className="text-sm text-muted-foreground mt-2">
            {assignedSubjectIds.length} selected
          </div>

          <div className="border rounded-md p-3 max-h-72 overflow-auto mt-3">
            {subjectsLoading ? (
              <div className="text-sm">Loading subjects…</div>
            ) : filteredSubjects.length === 0 ? (
              <div className="text-sm text-muted-foreground">No subjects found.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {filteredSubjects.map((s) => {
                  const checked = assignedSubjectIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex items-start gap-2 border rounded-md p-2 cursor-pointer hover:bg-accent/40 ${checked ? 'bg-accent/50' : ''}`}
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
              Cancel
            </Button>
            <Button type="button" onClick={saveSubjects} disabled={subjectsSaving || !isDirtySubjects}>
              {subjectsSaving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      )}

      <Separator className="mb-4" />

      {subjectsWithTopics.length === 0 ? (
        <p>No subjects assigned yet.</p>
      ) : (
        <Accordion type="multiple" className="w-full">
          {subjectsWithTopics.map((s) => (
            <AccordionItem key={s.subject.id} value={s.subject.id}>
              <AccordionTrigger>
                <div className="text-left">
                  <div className="font-semibold">{s.subject.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.subject.code} · {s.subject.level}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {s.topics.map(renderTopic)}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </section>
  );
};

function patchTopicStatus(nodes: TopicNode[], id: string, status: TopicNode['status']): TopicNode[] {
  return nodes.map(n => {
    if (n.id === id) return { ...n, status };
    if (n.children && n.children.length > 0) {
      return { ...n, children: patchTopicStatus(n.children, id, status) };
    }
    return n;
  });
}

export default SubjectTopicsPanel;
