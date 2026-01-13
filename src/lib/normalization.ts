import { supabase } from './supabase';

export interface NormalizationResult {
  original: any;
  normalized: {
    full_name: string;
    email: string;
    mobile_number: string;
    company_name: string;
    company_address: string;
    products_services: string;         // ⬅ NEW
    alternate_contact_name: string;
    alternate_mobile: string;
    referred_by: string;
  };
}

export const normalizeMemberData = async (formData: any): Promise<NormalizationResult> => {
  try {
    console.log('🚀 Calling Edge Function with:', formData);
    
    // Get the session token for authentication
    const { data: { session } } = await supabase.auth.getSession();
    
    // Call your Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('normalize-member', {
      body: formData,
      headers: session ? {
        Authorization: `Bearer ${session.access_token}`
      } : {}
    });

    console.log('📥 Edge Function returned - data:', data);
    console.log('📥 Edge Function returned - error:', error);

    console.log('[normalizeMemberData] Response keys:', Object.keys(data || {}));
    console.log('[normalizeMemberData] Has original/normalized:', !!data?.original, !!data?.normalized);

    if (error) {
      console.error('❌ Normalization error:', error);
      throw new Error(`Failed to normalize data: ${error.message}`);
    }

    console.log('✅ Returning result:', data);
    return data as NormalizationResult;
  } catch (error) {
    console.error('❌ Error calling normalization function:', error);
    throw error;
  }
};
