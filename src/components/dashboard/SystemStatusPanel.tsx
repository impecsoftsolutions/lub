import React from 'react';
import { Globe, Building2, FileText, RefreshCw } from 'lucide-react';

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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">System Statistics</h2>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
          title="Refresh statistics"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-12 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      ) : systemStatus ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50">
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-blue-600" />
              <span className="font-medium text-gray-900">Active States</span>
            </div>
            <span className="text-lg font-bold text-blue-600">{systemStatus.activeStates}</span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-green-50">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-green-600" />
              <span className="font-medium text-gray-900">Designations</span>
            </div>
            <span className="text-lg font-bold text-green-600">{systemStatus.totalDesignations}</span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-amber-600" />
              <span className="font-medium text-gray-900">Form Fields Configured</span>
            </div>
            <span className="text-lg font-bold text-amber-600">{systemStatus.formFieldsConfigured}</span>
          </div>

          <div className="text-xs text-gray-500 text-center pt-2 border-t">
            Last updated: {systemStatus.lastUpdated.toLocaleString()}
          </div>
        </div>
      ) : (
        <div className="text-center py-4 text-gray-500">
          <p>Unable to load system statistics</p>
        </div>
      )}
    </div>
  );
};

export default SystemStatusPanel;
