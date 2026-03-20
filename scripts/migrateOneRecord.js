require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your .env file.');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false
  }
});

async function migrateOneRecord() {
  console.log('Starting single record migration...');

  try {
    const { data: stagingRecords, error: fetchError } = await supabaseAdmin
      .from('jotform_members_raw')
      .select('*')
      .limit(1)
      .order('id', { ascending: true })
      .schema('staging');

    if (fetchError) {
      throw new Error(`Failed to fetch from staging: ${fetchError.message}`);
    }

    if (!stagingRecords || stagingRecords.length === 0) {
      console.log('No records found in staging.jotform_members_raw to migrate.');
      return;
    }

    const stagingRecord = stagingRecords[0];
    console.log('Fetched staging record:', stagingRecord);

    const newMemberRegistration = {
      full_name: stagingRecord.full_name || 'N/A',
      gender: stagingRecord.gender || 'male',
      date_of_birth: stagingRecord.date_of_birth || '1970-01-01',
      email: stagingRecord.email || 'placeholder@example.com',
      mobile_number: stagingRecord.mobile_number || '0000000000',
      company_name: stagingRecord.company_name || 'N/A',
      designation: stagingRecord.designation || 'Owner',
      company_address: stagingRecord.company_address || 'N/A',
      city: stagingRecord.city || 'N/A',
      district: stagingRecord.district || 'N/A',
      state: stagingRecord.state || 'N/A',
      pin_code: stagingRecord.pin_code || '000000',
      industry: stagingRecord.industry || 'Manufacturing',
      activity_type: stagingRecord.activity_type || 'Production',
      constitution: stagingRecord.constitution || 'Proprietorship',
      annual_turnover: stagingRecord.annual_turnover || 'Less than 1 Cr',
      number_of_employees: stagingRecord.number_of_employees || '1-10',
      products_services: stagingRecord.products_services || 'Not specified',
      brand_names: stagingRecord.brand_names || '',
      website: stagingRecord.website || '',
      gst_registered: stagingRecord.gst_registered || 'no',
      gst_number: stagingRecord.gst_number || '',
      pan_company: stagingRecord.pan_company || 'N/A',
      esic_registered: stagingRecord.esic_registered || 'no',
      epf_registered: stagingRecord.epf_registered || 'no',
      gst_certificate_url: '',
      udyam_certificate_url: '',
      payment_proof_url: '',
      referred_by: stagingRecord.referred_by || '',
      amount_paid: stagingRecord.amount_paid || '0',
      payment_date: stagingRecord.payment_date || '1970-01-01',
      payment_mode: stagingRecord.payment_mode || 'Online',
      transaction_id: stagingRecord.transaction_id || '',
      bank_reference: stagingRecord.bank_reference || '',
      alternate_contact_name: stagingRecord.alternate_contact_name || '',
      alternate_mobile: stagingRecord.alternate_mobile || '',
      status: 'approved',
      company_designation_id: stagingRecord.company_designation_id || null
    };

    const { data: insertedRecord, error: insertError } = await supabaseAdmin
      .from('member_registrations')
      .insert([newMemberRegistration])
      .select();

    if (insertError) {
      throw new Error(`Failed to insert into public.member_registrations: ${insertError.message}`);
    }

    console.log('Successfully migrated one record to public.member_registrations:');
    console.log(insertedRecord[0]);
  } catch (error) {
    console.error('Migration failed:', error.message);
  } finally {
    console.log('Migration process finished.');
  }
}

migrateOneRecord();
