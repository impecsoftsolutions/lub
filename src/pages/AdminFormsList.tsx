import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Settings, Lock } from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { PageHeader } from '../components/ui/PageHeader';

const AdminFormsList: React.FC = () => {

  return (
    <PermissionGate
      permission="settings.forms.view"
      fallback={
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <Lock className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to view form configuration.</p>
          </div>
        </div>
      }
    >
      <div className="p-6">
      <div>
        <PageHeader
          title="Form Configuration"
          subtitle="Manage field visibility and requirements for registration forms"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link
            to="/admin/settings/forms/join-lub"
            className="bg-card rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow duration-200 border border-border"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <FileText className="w-8 h-8 text-primary" />
              </div>
              <Settings className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="text-section font-semibold text-foreground mb-2">Join LUB Form</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Configure fields for member registration form
            </p>
            <div className="flex items-center text-primary text-sm font-medium">
              Configure Fields
              <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
            </div>
          </Link>

          <div className="bg-card rounded-lg shadow-md p-6 border border-border opacity-50">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-muted rounded-lg">
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>
              <Settings className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="text-section font-semibold text-foreground mb-2">More Forms</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Additional forms will appear here
            </p>
            <div className="flex items-center text-muted-foreground text-sm font-medium">
              Coming Soon
            </div>
          </div>
        </div>
      </div>
      </div>
    </PermissionGate>
  );
};

export default AdminFormsList;
