import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { PoISummary } from '../api/types';
import type { DetectedWater } from '../lib/waterScan';

interface SearchArea {
  lat: number;
  lng: number;
  radiusKm: number;
}

interface PreviewInfo {
  url: string | null;
  size: { width: number; height: number } | null;
}

interface SearchSessionValue {
  searchMode: boolean;
  setSearchMode: Dispatch<SetStateAction<boolean>>;
  searchArea: SearchArea | null;
  setSearchArea: Dispatch<SetStateAction<SearchArea | null>>;
  activeSearchId: string | null;
  setActiveSearchId: Dispatch<SetStateAction<string | null>>;
  candidates: DetectedWater[];
  setCandidates: Dispatch<SetStateAction<DetectedWater[]>>;
  searchPois: PoISummary[];
  setSearchPois: Dispatch<SetStateAction<PoISummary[]>>;
  savedOpen: boolean;
  setSavedOpen: Dispatch<SetStateAction<boolean>>;
  previewUrl: string | null;
  previewSize: { width: number; height: number } | null;
  setPreview: (url: string | null, size: { width: number; height: number } | null) => void;
  clearSearch: () => void;
}

const SearchSessionContext = createContext<SearchSessionValue | null>(null);

export function SearchSessionProvider({ children }: { children: ReactNode }) {
  const [searchMode, setSearchMode] = useState(false);
  const [searchArea, setSearchArea] = useState<SearchArea | null>(null);
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DetectedWater[]>([]);
  const [searchPois, setSearchPois] = useState<PoISummary[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);
  const [preview, setPreviewState] = useState<PreviewInfo>({ url: null, size: null });
  const previewUrlRef = useRef<string | null>(null);

  const setPreview = useCallback(
    (url: string | null, size: { width: number; height: number } | null) => {
      const prev = previewUrlRef.current;
      if (prev && prev !== url) URL.revokeObjectURL(prev);
      previewUrlRef.current = url;
      setPreviewState({ url, size });
    },
    [],
  );

  const clearSearch = useCallback(() => {
    setSearchMode(false);
    setSearchArea(null);
    setActiveSearchId(null);
    setCandidates([]);
    setSearchPois([]);
    setSavedOpen(false);
    setPreview(null, null);
  }, [setPreview]);

  const value = useMemo<SearchSessionValue>(
    () => ({
      searchMode,
      setSearchMode,
      searchArea,
      setSearchArea,
      activeSearchId,
      setActiveSearchId,
      candidates,
      setCandidates,
      searchPois,
      setSearchPois,
      savedOpen,
      setSavedOpen,
      previewUrl: preview.url,
      previewSize: preview.size,
      setPreview,
      clearSearch,
    }),
    [
      searchMode,
      searchArea,
      activeSearchId,
      candidates,
      searchPois,
      savedOpen,
      preview,
      setPreview,
      clearSearch,
    ],
  );

  return <SearchSessionContext.Provider value={value}>{children}</SearchSessionContext.Provider>;
}

export function useSearchSession(): SearchSessionValue {
  const ctx = useContext(SearchSessionContext);
  if (!ctx) throw new Error('useSearchSession must be used within SearchSessionProvider');
  return ctx;
}
