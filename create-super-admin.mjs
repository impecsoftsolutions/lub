import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qskziirjtzomrtckpzas.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFza3ppaXJqdHpvbXJ0Y2twemFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg1NjU4NjksImV4cCI6MjA3NDE0MTg2OX0.K888tIN7BzOraEQVXV6eTw5jQY2vyQSJZsGOrfUL89k';

const supabase = createClient(supabaseUrl, supabaseKey);

async function createSuperAdmin() {
  console.log('Creating super admin for yogish@gmail.com...\n');

  // Step 1: Add to portal_super_admins table
  console.log('Step 1: Adding to portal_super_admins table...');
  const { data: portalData, error: portalError } = await supabase
    .from('portal_super_admins')
    .insert({ email: 'yogish@gmail.com' })
    .select();

  if (portalError) {
    if (portalError.code === '23505') {
      console.log('✓ Email already exists in portal_super_admins');
    } else {
      console.error('✗ Error adding to portal_super_admins:', portalError);
    }
  } else {
    console.log('✓ Added to portal_super_admins:', portalData);
  }

  // Step 2: Check if user exists in auth.users
  console.log('\nStep 2: Checking if user exists in auth.users...');
  const { data: authUser, error: authError } = await supabase
    .from('auth.users')
    .select('id, email')
    .eq('email', 'yogish@gmail.com')
    .maybeSingle();

  if (authError) {
    console.log('Note: Cannot query auth.users directly (expected with anon key)');
    console.log('The user will need to sign up first at /admin/signup or via Supabase Dashboard');
  } else if (authUser) {
    console.log('✓ User exists in auth.users:', authUser);

    // Step 3: Add to user_roles table
    console.log('\nStep 3: Adding super_admin role to user_roles...');
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: authUser.id,
        role: 'super_admin',
        state: null,
        district: null,
        is_member_linked: false
      })
      .select();

    if (roleError) {
      if (roleError.code === '23505') {
        console.log('✓ Role already exists in user_roles');
      } else {
        console.error('✗ Error adding to user_roles:', roleError);
      }
    } else {
      console.log('✓ Added to user_roles:', roleData);
    }
  } else {
    console.log('⚠ User does not exist in auth.users yet');
    console.log('   The user needs to sign up first');
  }

  // Step 4: Verify the setup
  console.log('\n' + '='.repeat(60));
  console.log('VERIFICATION');
  console.log('='.repeat(60));

  const { data: superAdmins, error: verifyError } = await supabase
    .from('portal_super_admins')
    .select('email, created_at')
    .eq('email', 'yogish@gmail.com');

  if (verifyError) {
    console.error('Error verifying:', verifyError);
  } else {
    console.log('\n✓ Super Admin Email Configured:');
    console.log(superAdmins);
  }

  console.log('\n' + '='.repeat(60));
  console.log('NEXT STEPS');
  console.log('='.repeat(60));
  console.log('\n1. Create user account in Supabase Dashboard:');
  console.log('   - Go to: https://supabase.com/dashboard/project/qskziirjtzomrtckpzas/auth/users');
  console.log('   - Click "Add User" → "Create new user"');
  console.log('   - Email: yogish@gmail.com');
  console.log('   - Password: (choose a secure password)');
  console.log('   - Check "Auto Confirm User"');
  console.log('   - Click "Create User"');
  console.log('\n2. Or have the user sign up through the app:');
  console.log('   - Visit: /admin/signup (if you have a signup page)');
  console.log('   - Email: yogish@gmail.com');
  console.log('   - Password: (choose a secure password)');
  console.log('\n3. Once the user is created, they will have super admin access');
  console.log('   because their email is in the portal_super_admins table.');
  console.log('\n4. Login at: /admin/login');
}

createSuperAdmin().catch(console.error);
