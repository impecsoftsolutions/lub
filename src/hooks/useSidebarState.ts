import { useState, useEffect } from 'react';

const STORAGE_KEY = 'admin-sidebar-collapsed';

export const useSidebarState = () => {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : false;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  const toggleCollapsed = () => setIsCollapsed((prev: boolean) => !prev);

  return { isCollapsed, toggleCollapsed, setIsCollapsed };
};
