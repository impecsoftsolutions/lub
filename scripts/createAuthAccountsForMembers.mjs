#!/usr/bin/env node

/**
 * Create Auth Accounts for Existing Members
 *
 * This script creates Supabase auth accounts for all existing members
 * who don't have user_id set in member_registrations table.
 *
 * Usage:
 *   node scripts/createAuthAccountsForMembers.mjs
 *
 * Requirements:
 *   - VITE_SUPABASE_URL in .env
 *   - VITE_SUPABASE_ANON_KEY in .env
 *   - SUPABASE_SERVICE_ROLE_KEY in .env (for admin operations)
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   - VITE_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nPlease add these to your .env file.');
  process.exit(1);
}

// Create Supabase admin client
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createAuthAccountsForMembers() {
  console.log('🚀 Starting auth account creation for existing members...\n');

  try {
    // Step 1: Query members without user_id
    console.log('📊 Querying members without auth accounts...');
    const { data: members, error: queryError } = await supabase
      .from('member_registrations')
      .select('id, email, mobile_number, full_name, is_legacy_member')
      .is('user_id', null)
      .eq('is_legacy_member', true)
      .not('email', 'is', null);

    if (queryError) {
      throw new Error(`Failed to query members: ${queryError.message}`);
    }

    if (!members || members.length === 0) {
      console.log('✅ No members found without auth accounts. All done!');
      return;
    }

    console.log(`📝 Found ${members.length} members needing auth accounts\n`);

    // Step 2: Create auth accounts for each member
    const results = {
      success: [],
      failed: [],
      passwordResetErrors: []
    };

    for (let i = 0; i < members.length; i++) {
      const member = members[i];
      const progress = `[${i + 1}/${members.length}]`;

      console.log(`${progress} Processing: ${member.full_name} (${member.email})`);

      try {
        // Generate a random temporary password
        const tempPassword = generateRandomPassword();

        // Create auth user with email_confirm: false (no email verification needed)
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: member.email,
          password: tempPassword,
          email_confirm: true, // Auto-confirm email (no verification required)
          user_metadata: {
            full_name: member.full_name,
            mobile_number: member.mobile_number,
            is_member: true
          }
        });

        if (authError) {
          console.log(`   ❌ Failed to create auth account: ${authError.message}`);
          results.failed.push({
            member_id: member.id,
            email: member.email,
            error: authError.message
          });
          continue;
        }

        // Update member_registrations with user_id
        const { error: updateError } = await supabase
          .from('member_registrations')
          .update({ user_id: authUser.user.id })
          .eq('id', member.id);

        if (updateError) {
          console.log(`   ⚠️  Auth account created but failed to link: ${updateError.message}`);
          results.failed.push({
            member_id: member.id,
            email: member.email,
            auth_user_id: authUser.user.id,
            error: `Failed to link: ${updateError.message}`
          });
          continue;
        }

        // Send password reset email
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(member.email, {
          redirectTo: `${supabaseUrl.replace('//', '//').split('/')[0]}//${supabaseUrl.replace('//', '//').split('/')[2]}/reset-password`
        });

        if (resetError) {
          console.log(`   ⚠️  Account created but password reset email failed: ${resetError.message}`);
          results.passwordResetErrors.push({
            member_id: member.id,
            email: member.email,
            auth_user_id: authUser.user.id,
            error: resetError.message
          });
        }

        console.log(`   ✅ Success! Auth account created and linked`);
        results.success.push({
          member_id: member.id,
          email: member.email,
          auth_user_id: authUser.user.id
        });

        // Small delay to avoid rate limiting
        await delay(100);

      } catch (error) {
        console.log(`   ❌ Unexpected error: ${error.message}`);
        results.failed.push({
          member_id: member.id,
          email: member.email,
          error: error.message
        });
      }
    }

    // Step 3: Display summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successful: ${results.success.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    console.log(`⚠️  Password reset email errors: ${results.passwordResetErrors.length}`);
    console.log('='.repeat(60) + '\n');

    // Step 4: Save detailed results to file
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const resultsFile = path.join(process.cwd(), `auth-accounts-results-${timestamp}.json`);
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
    console.log(`📄 Detailed results saved to: ${resultsFile}\n`);

    // Step 5: Display failed accounts for manual review
    if (results.failed.length > 0) {
      console.log('❌ FAILED ACCOUNTS (requires manual attention):');
      results.failed.forEach(f => {
        console.log(`   - ${f.email}: ${f.error}`);
      });
      console.log('');
    }

    if (results.passwordResetErrors.length > 0) {
      console.log('⚠️  PASSWORD RESET EMAIL ERRORS (accounts created, but emails not sent):');
      results.passwordResetErrors.forEach(e => {
        console.log(`   - ${e.email}: ${e.error}`);
      });
      console.log('\n   👉 These members can still login with temporary password or request password reset manually.');
      console.log('');
    }

    console.log('✨ Auth account creation process completed!\n');

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

function generateRandomPassword() {
  // Generate a secure random password (16 characters)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  for (let i = 0; i < 16; i++) {
    password += chars[array[i] % chars.length];
  }
  return password;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the script
createAuthAccountsForMembers();
