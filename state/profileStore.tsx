import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { SessionProfile, ProfileItemWithSource } from '../types/profile';

interface ProfileStoreValue {
  profile: SessionProfile;
  setProfile: (profile: SessionProfile) => void;
  mergeProfile: (profile: Partial<SessionProfile>) => void;
  clearProfile: () => void;
}

const defaultProfile: SessionProfile = {
  skills: [],
  knowledge: [],
  tasks: [],
  workConditions: []
};

const ProfileContext = createContext<ProfileStoreValue | null>(null);

const mergeItems = (
  existing: ProfileItemWithSource[],
  incoming: ProfileItemWithSource[]
): ProfileItemWithSource[] => {
  const map = new Map<string, ProfileItemWithSource>();

  existing.forEach((item) => {
    map.set(item.label.toLowerCase(), item);
  });

  incoming.forEach((item) => {
    const key = item.label.toLowerCase();
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

export const ProfileProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [profile, setProfileState] = useState<SessionProfile>(defaultProfile);

  const clearProfile = useCallback(() => setProfileState(defaultProfile), []);

  const setProfile = useCallback((next: SessionProfile) => {
    setProfileState({
      skills: next.skills || [],
      knowledge: next.knowledge || [],
      tasks: next.tasks || [],
      workConditions: next.workConditions || []
    });
  }, []);

  const mergeProfile = useCallback((partial: Partial<SessionProfile>) => {
    setProfileState((current) => ({
      skills: partial.skills ? mergeItems(current.skills, partial.skills) : current.skills,
      knowledge: partial.knowledge ? mergeItems(current.knowledge, partial.knowledge) : current.knowledge,
      tasks: partial.tasks ? mergeItems(current.tasks, partial.tasks) : current.tasks,
      workConditions: partial.workConditions
        ? mergeItems(current.workConditions, partial.workConditions)
        : current.workConditions
    }));
  }, []);

  const value = useMemo<ProfileStoreValue>(
    () => ({
      profile,
      setProfile,
      mergeProfile,
      clearProfile
    }),
    [clearProfile, mergeProfile, profile, setProfile]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
};

export const useProfileStore = () => {
  const context = useContext(ProfileContext);
  if (!context) throw new Error('useProfileStore must be used within a ProfileProvider');
  return context;
};
