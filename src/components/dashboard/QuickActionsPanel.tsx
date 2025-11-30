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
      bgColor: 'bg-blue-100',
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
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
      path: '/admin/settings/forms'
    }
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>

      <div className="space-y-3">
        {actions.map((action) => (
          <button
            key={action.title}
            onClick={() => navigate(action.path)}
            disabled={isLoading}
            className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${action.bgColor}`}>
                <action.icon className={`w-5 h-5 ${action.color}`} />
              </div>
              <span className="font-medium text-gray-900">{action.title}</span>
            </div>
            {action.count !== undefined && action.count > 0 && (
              <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full">
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
