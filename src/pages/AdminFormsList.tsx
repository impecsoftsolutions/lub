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
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <Lock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">You don't have permission to view form configuration.</p>
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
            className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow duration-200 border border-gray-200"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <FileText className="w-8 h-8 text-blue-600" />
              </div>
              <Settings className="w-5 h-5 text-gray-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Join LUB Form</h2>
            <p className="text-gray-600 text-sm mb-4">
              Configure fields for member registration form
            </p>
            <div className="flex items-center text-blue-600 text-sm font-medium">
              Configure Fields
              <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
            </div>
          </Link>

          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 opacity-50">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-gray-100 rounded-lg">
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
              <Settings className="w-5 h-5 text-gray-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">More Forms</h2>
            <p className="text-gray-600 text-sm mb-4">
              Additional forms will appear here
            </p>
            <div className="flex items-center text-gray-400 text-sm font-medium">
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
