import React from 'react';
import { Clock } from 'lucide-react';
import { formatDateTimeValue, formatTimeValue } from '../../lib/dateTimeManager';

interface Activity {
  id: string;
  full_name: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

interface RecentActivityListProps {
  activities: Activity[];
  isLoading?: boolean;
  lastUpdated?: string | Date;
}

const RecentActivityList: React.FC<RecentActivityListProps> = ({
  activities,
  isLoading = false,
  lastUpdated
}) => {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'pending':
      default:
        return 'bg-amber-100 text-amber-800';
    }
  };

  const formatLastUpdated = () => {
    if (!lastUpdated) return '';
    return formatTimeValue(lastUpdated);
  };

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-section font-semibold text-foreground">Recent Activity</h2>
        {lastUpdated && (
          <span className="text-xs text-muted-foreground">
            Updated {formatLastUpdated()}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-muted rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : activities.length > 0 ? (
        <div className="space-y-4">
          {activities.map((activity) => (
            <div key={activity.id} className="border-l-2 border-blue-500 pl-4 py-2">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{activity.full_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{activity.email}</p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(activity.status)}`}>
                  {activity.status.charAt(0).toUpperCase() + activity.status.slice(1)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {formatDateTimeValue(activity.created_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Clock className="w-12 h-12 mx-auto mb-2 text-muted-foreground/50" />
          <p>No recent activity</p>
        </div>
      )}
    </div>
  );
};

export default RecentActivityList;
