import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const isCoreReactModule = (id: string) =>
  /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('/src/pages/AdminForm') ||
            id.includes('/src/pages/AdminValidation') ||
            id.includes('/src/pages/AdminSettingsHub') ||
            id.includes('/src/pages/AdminFieldLibrary') ||
            id.includes('/src/pages/AdminFormBuilderV2') ||
            id.includes('/src/pages/AdminFormEditorV2') ||
            id.includes('/src/pages/AdminFormStudio')
          ) {
            return 'app-admin-forms';
          }

          if (
            id.includes('/src/pages/AdminRegistrations') ||
            id.includes('/src/pages/AdminDeletedMembers') ||
            id.includes('/src/pages/AdminDirectoryVisibility') ||
            id.includes('/src/components/EditMemberModal') ||
            id.includes('/src/components/ViewApplicationModal') ||
            id.includes('/src/components/AuditHistoryModal')
          ) {
            return 'app-admin-members';
          }

          if (
            id.includes('/src/pages/AdminUserManagement') ||
            id.includes('/src/pages/admin/AdminUsers') ||
            id.includes('/src/components/admin/modals/DeleteUserModal')
          ) {
            return 'app-admin-users';
          }

          if (id.includes('/src/pages/Admin') || id.includes('/src/components/admin/')) {
            return 'app-admin-core';
          }

          if (
            id.includes('/src/pages/Member') ||
            id.includes('/src/components/member/') ||
            id.includes('/src/components/dashboard/')
          ) {
            return 'app-member';
          }

          if (
            id.includes('/src/pages/') ||
            id.includes('/src/components/Layout') ||
            id.includes('/src/components/Header') ||
            id.includes('/src/components/Footer')
          ) {
            return 'app-public';
          }

          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (isCoreReactModule(id)) {
            return 'vendor-react';
          }

          if (id.includes('react-router-dom') || id.includes('@remix-run/router')) {
            return 'vendor-router';
          }

          if (id.includes('@supabase/')) {
            return 'vendor-supabase';
          }

          if (id.includes('@radix-ui/')) {
            return 'vendor-radix';
          }

          if (id.includes('lucide-react')) {
            return 'vendor-icons';
          }

          if (id.includes('@dnd-kit/')) {
            return 'vendor-dnd';
          }

          if (id.includes('jspdf')) {
            return 'vendor-jspdf';
          }

          if (id.includes('html2canvas')) {
            return 'vendor-html2canvas';
          }

          if (id.includes('jszip') || id.includes('file-saver')) {
            return 'vendor-export-utils';
          }

          if (id.includes('browser-image-compression') || id.includes('react-easy-crop')) {
            return 'vendor-media';
          }

          return 'vendor-misc';
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
