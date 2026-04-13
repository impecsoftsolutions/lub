import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

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
  iconBg = 'bg-muted',
  isLoading = false,
  badge,
  onClick,
  delay = 0
}) => {
  return (
    <Card
      onClick={onClick}
      className={cn(
        'gap-0 py-5 transition-all duration-200',
        onClick ? 'cursor-pointer hover:shadow-md' : ''
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <CardContent className="px-5">
        <div className="flex items-start justify-between mb-4">
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', iconBg)}>
            <Icon className={cn('w-[18px] h-[18px]', iconColor)} />
          </div>
          {badge && (
            <Badge variant="outline" className={badge.color}>
              {badge.text}
            </Badge>
          )}
        </div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{title}</p>
        {isLoading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <p className="text-xl font-semibold">{value}</p>
        )}
      </CardContent>
    </Card>
  );
};

export default DashboardCard;
