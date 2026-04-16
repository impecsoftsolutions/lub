import React from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  ShieldCheck,
  Palette,
  Eye,
  CreditCard,
  Bot,
  Lock,
  ArrowRight,
  Settings,
  Loader2,
  Wand2,
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useHasPermission, usePermissions } from '../hooks/usePermissions';
import { cn } from '@/lib/utils';

interface SettingsCardItem {
  id: string;
  title: string;
  description: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  canAccess: boolean;
  section: 'Settings' | 'Members' | 'Locations';
}

const AdminSettingsHub: React.FC = () => {
  const { isLoading } = usePermissions();
  const canViewForms = useHasPermission('settings.forms.view');
  const canViewValidation = useHasPermission('settings.validation.view');
  const canViewNormalization = useHasPermission('settings.normalization.view');
  const canViewDirectory = useHasPermission('settings.directory.view');
  const canViewPayment = useHasPermission('settings.payment.view');
  const canViewAI = useHasPermission('settings.ai.view');

  const cards: SettingsCardItem[] = [
    {
      id: 'forms',
      title: 'Form Configuration',
      description: 'Manage form field visibility, required states, and validation mappings.',
      path: '/admin/settings/forms',
      icon: FileText,
      canAccess: canViewForms,
      section: 'Settings'
    },
    {
      id: 'validation',
      title: 'Validation Settings',
      description: 'Configure validation rules used across join and admin-managed forms.',
      path: '/admin/settings/validation',
      icon: ShieldCheck,
      canAccess: canViewValidation,
      section: 'Settings'
    },
    {
      id: 'normalization',
      title: 'Normalization Rules',
      description: 'Configure AI text cleanup applied at member verification. Separate from validation rules and Smart Upload extraction.',
      path: '/admin/settings/normalization',
      icon: Wand2,
      canAccess: canViewNormalization,
      section: 'Settings'
    },
    {
      id: 'appearance',
      title: 'Theme',
      description: 'Set theme, typography, spacing, and table style for the admin portal.',
      path: '/admin/settings/appearance',
      icon: Palette,
      canAccess: true,
      section: 'Settings'
    },
    {
      id: 'ai',
      title: 'AI Settings',
      description: 'Configure provider, model, and secure key usage for normalization runtime.',
      path: '/admin/settings/ai',
      icon: Bot,
      canAccess: canViewAI,
      section: 'Settings'
    },
    {
      id: 'directory-visibility',
      title: 'Directory Visibility',
      description: 'Control which member fields are visible to public visitors and members.',
      path: '/admin/members/visibility',
      icon: Eye,
      canAccess: canViewDirectory,
      section: 'Members'
    },
    {
      id: 'payment',
      title: 'Payment Settings',
      description: 'Manage state-wise payment accounts, fee amounts, and QR configuration.',
      path: '/admin/locations/payment-settings',
      icon: CreditCard,
      canAccess: canViewPayment,
      section: 'Locations'
    }
  ];

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-3 text-sm text-muted-foreground">Loading settings hub...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Settings Hub"
        subtitle="Choose an area to configure portal-level settings."
      />

      <div className="mb-6 rounded-lg border border-border bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <Settings className="mt-0.5 h-5 w-5 text-primary" />
          <p className="text-sm text-foreground">
            This hub centralizes all major configuration surfaces. Cards you cannot access stay
            visible but locked so scope boundaries remain clear.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          const content = (
            <Card
              className={cn(
                'h-full border-border transition-all',
                card.canAccess ? 'hover:border-primary/50 hover:shadow-sm' : 'opacity-75'
              )}
            >
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                    {card.section}
                  </span>
                  {card.canAccess ? (
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">{card.title}</CardTitle>
                </div>
                <CardDescription>{card.description}</CardDescription>
              </CardHeader>
              {!card.canAccess && (
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">
                    You do not have permission to open this section.
                  </p>
                </CardContent>
              )}
            </Card>
          );

          return card.canAccess ? (
            <Link key={card.id} to={card.path} aria-label={`Open ${card.title}`}>
              {content}
            </Link>
          ) : (
            <div key={card.id}>{content}</div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminSettingsHub;
