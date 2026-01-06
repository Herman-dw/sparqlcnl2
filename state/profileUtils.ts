import { ProfileItemWithSource, SessionProfile } from '../types/profile';

export const normalizeLabel = (label: string) => label.trim().toLowerCase();

export const mergeProfileLists = (
  existing: ProfileItemWithSource[] = [],
  incoming: ProfileItemWithSource[] = []
): ProfileItemWithSource[] => {
  const map = new Map<string, ProfileItemWithSource>();

  existing.forEach((item) => map.set(normalizeLabel(item.label), item));

  incoming.forEach((item) => {
    const key = normalizeLabel(item.label);
    const current = map.get(key);

    if (!current) {
      map.set(key, { ...item, sources: [...item.sources] });
    } else {
      const mergedSources = [...current.sources];
      item.sources.forEach((source) => {
        if (!mergedSources.find((s) => s.id === source.id)) {
          mergedSources.push(source);
        }
      });
      map.set(key, { ...current, ...item, sources: mergedSources });
    }
  });

  return Array.from(map.values());
};

export const mergeProfiles = (
  base: SessionProfile,
  incoming: Partial<SessionProfile>
): SessionProfile => ({
  skills: incoming.skills ? mergeProfileLists(base.skills, incoming.skills) : base.skills,
  knowledge: incoming.knowledge ? mergeProfileLists(base.knowledge, incoming.knowledge) : base.knowledge,
  tasks: incoming.tasks ? mergeProfileLists(base.tasks, incoming.tasks) : base.tasks,
  workConditions: incoming.workConditions
    ? mergeProfileLists(base.workConditions, incoming.workConditions)
    : base.workConditions
});

export const createEmptyProfile = (): SessionProfile => ({
  skills: [],
  knowledge: [],
  tasks: [],
  workConditions: []
});

export const normalizeProfile = (profile?: Partial<SessionProfile>): SessionProfile => ({
  skills: profile?.skills || [],
  knowledge: profile?.knowledge || [],
  tasks: profile?.tasks || [],
  workConditions: profile?.workConditions || []
});
