import React from 'react';
import { Globe, Building2, FileText, RefreshCw } from 'lucide-react';
import { formatDateTimeValue } from '../../lib/dateTimeManager';

interface SystemStatistics {
  activeStates: number;
  totalDesignations: number;
  formFieldsConfigured: number;
  lastUpdated: Date;
}

interface SystemStatusPanelProps {
  systemStatus?: SystemStatistics | null;
  isLoading?: boolean;
  onRefresh: () => void;
}

const SystemStatusPanel: React.FC<SystemStatusPanelProps> = ({
  systemStatus,
  isLoading = false,
  onRefresh
}) => {
  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-section font-semibold text-foreground">System Statistics</h2>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="text-sm text-primary hover:text-primary/80 font-medium disabled:opacity-50"
          title="Refresh statistics"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-12 bg-muted rounded"></div>
            </div>
          ))}
        </div>
      ) : systemStatus ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-primary" />
              <span className="font-medium text-foreground">Active States</span>
            </div>
            <span className="text-section font-semibold text-primary">{systemStatus.activeStates}</span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-primary" />
              <span className="font-medium text-foreground">Designations</span>
            </div>
            <span className="text-section font-semibold text-primary">{systemStatus.totalDesignations}</span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-primary" />
              <span className="font-medium text-foreground">Form Fields Configured</span>
            </div>
            <span className="text-section font-semibold text-primary">{systemStatus.formFieldsConfigured}</span>
          </div>

          <div className="text-xs text-muted-foreground text-center pt-2 border-t border-border">
            Last updated: {formatDateTimeValue(systemStatus.lastUpdated)}
          </div>
        </div>
      ) : (
        <div className="text-center py-4 text-muted-foreground">
          <p>Unable to load system statistics</p>
        </div>
      )}
    </div>
  );
};

export default SystemStatusPanel;
