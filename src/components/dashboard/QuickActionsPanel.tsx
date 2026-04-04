import React from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, MapPin, Users, Settings } from 'lucide-react';

interface QuickActionsPanelProps {
  pendingRegistrations: number;
  pendingCities: number;
  approvedMembers: number;
  isLoading?: boolean;
}

const QuickActionsPanel: React.FC<QuickActionsPanelProps> = ({
  pendingRegistrations,
  pendingCities,
  approvedMembers,
  isLoading = false
}) => {
  const navigate = useNavigate();

  const actions = [
    {
      title: 'Review Registrations',
      icon: UserPlus,
      color: 'text-blue-600',
      bgColor: 'bg-primary/10',
      count: pendingRegistrations,
      path: '/admin/members/registrations'
    },
    {
      title: 'Review Cities',
      icon: MapPin,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      count: pendingCities,
      path: '/admin/locations/pending-cities'
    },
    {
      title: 'View Members',
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
      count: approvedMembers,
      path: '/admin/members/registrations'
    },
    {
      title: 'Settings',
      icon: Settings,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted',
      path: '/admin/settings/forms'
    }
  ];

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-6">
      <h2 className="text-section font-semibold text-foreground mb-4">Quick Actions</h2>

      <div className="space-y-3">
        {actions.map((action) => (
          <button
            key={action.title}
            onClick={() => navigate(action.path)}
            disabled={isLoading}
            className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors border border-border disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${action.bgColor}`}>
                <action.icon className={`w-5 h-5 ${action.color}`} />
              </div>
              <span className="font-medium text-foreground">{action.title}</span>
            </div>
            {action.count !== undefined && action.count > 0 && (
              <span className="px-2 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full">
                {action.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickActionsPanel;
