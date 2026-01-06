import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { SessionProfile } from '../types/profile';
import { createEmptyProfile, mergeProfiles, normalizeProfile } from './profileUtils';

interface ProfileStoreValue {
  profile: SessionProfile;
  setProfile: (profile: SessionProfile) => void;
  mergeProfile: (profile: Partial<SessionProfile>) => void;
  clearProfile: () => void;
}

const defaultProfile: SessionProfile = createEmptyProfile();

const ProfileContext = createContext<ProfileStoreValue | null>(null);

export const ProfileProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [profile, setProfileState] = useState<SessionProfile>(defaultProfile);

  const clearProfile = useCallback(() => setProfileState(createEmptyProfile()), []);

  const setProfile = useCallback((next: SessionProfile) => {
    setProfileState(normalizeProfile(next));
  }, []);

  const mergeProfile = useCallback((partial: Partial<SessionProfile>) => {
    setProfileState((current) => mergeProfiles(current, partial));
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
