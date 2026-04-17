import React, { useEffect } from 'react';
import { refreshRuntimeDateTimeFormatProfile } from '../lib/dateTimeManager';

interface DateTimeFormatBootstrapProps {
  children: React.ReactNode;
}

export const DateTimeFormatBootstrap: React.FC<DateTimeFormatBootstrapProps> = ({ children }) => {
  useEffect(() => {
    const load = async () => {
      await refreshRuntimeDateTimeFormatProfile();
    };

    void load();
  }, []);

  return <>{children}</>;
};
