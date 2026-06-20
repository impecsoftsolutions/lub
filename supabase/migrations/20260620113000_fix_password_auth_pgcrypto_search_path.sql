/*
  COD-AUTH-UNIVERSAL-PASSWORD-002

  Fix password reset token validation on Supabase projects where pgcrypto lives
  in the extensions schema. The original password-auth functions used
  SET search_path TO 'public', which made digest/crypt/gen_salt unavailable
  when validating real 64-character reset tokens.
*/

ALTER FUNCTION public.sign_in_with_password(text, text, text, text)
  SET search_path TO 'public', 'extensions';

ALTER FUNCTION public.create_member_password_token(text, text)
  SET search_path TO 'public', 'extensions';

ALTER FUNCTION public.validate_member_password_token(text)
  SET search_path TO 'public', 'extensions';

ALTER FUNCTION public.complete_member_password_reset(text, text)
  SET search_path TO 'public', 'extensions';

NOTIFY pgrst, 'reload schema';
