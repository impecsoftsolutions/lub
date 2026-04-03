import React from 'react';
import { LucideIcon } from 'lucide-react';

interface DashboardCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  iconColor: string;
  iconBg?: string;
  isLoading?: boolean;
  badge?: {
    text: string;
    color: string;
  };
  onClick?: () => void;
  delay?: number;
}

const DashboardCard: React.FC<DashboardCardProps> = ({
  title,
  value,
  icon: Icon,
  iconColor,
  iconBg = 'bg-gray-100',
  isLoading = false,
  badge,
  onClick,
  delay = 0
}) => {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border border-gray-200 shadow-sm p-5 transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:shadow-md hover:border-gray-300' : ''
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-4.5 h-4.5 ${iconColor}`} style={{ width: '18px', height: '18px' }} />
        </div>
        {badge && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
            {badge.text}
          </span>
        )}
      </div>
      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{title}</h3>
      {isLoading ? (
        <div className="h-7 bg-gray-100 animate-pulse rounded w-20"></div>
      ) : (
        <p className="text-2xl font-semibold text-gray-900">{value}</p>
      )}
    </div>
  );
};

export default DashboardCard;
