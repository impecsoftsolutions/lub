/*
  Update Membership Plans comparison rows.

  Keeps the public Membership Plans page configurable while refreshing the
  default feature list requested by product.
*/

UPDATE public.membership_plan_features
SET
  feature_label = 'LUB state account',
  free_value = 'yes',
  paid_value = 'yes',
  display_order = 1,
  is_active = true,
  updated_at = now()
WHERE feature_label IN ('LUB portal account', 'LUB state account');

INSERT INTO public.membership_plan_features
  (feature_label, free_value, paid_value, display_order, is_active)
SELECT 'LUB national account', NULL, 'yes', 2, true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.membership_plan_features
  WHERE feature_label = 'LUB national account'
);

INSERT INTO public.membership_plan_features
  (feature_label, free_value, paid_value, display_order, is_active)
SELECT 'Member registration certificate', NULL, 'yes', 3, true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.membership_plan_features
  WHERE feature_label = 'Member registration certificate'
);

UPDATE public.membership_plan_features
SET display_order = 4, updated_at = now()
WHERE feature_label = 'News, updates, announcements';

UPDATE public.membership_plan_features
SET display_order = 5, updated_at = now()
WHERE feature_label = 'Public events and activities';

UPDATE public.membership_plan_features
SET display_order = 6, updated_at = now()
WHERE feature_label = 'Member directory listing';

UPDATE public.membership_plan_features
SET display_order = 7, updated_at = now()
WHERE feature_label = 'Business Showcase listing';

UPDATE public.membership_plan_features
SET display_order = 8, updated_at = now()
WHERE feature_label = 'Member networking';

UPDATE public.membership_plan_features
SET display_order = 9, updated_at = now()
WHERE feature_label = 'Member-only opportunities';

UPDATE public.membership_plan_features
SET display_order = 10, updated_at = now()
WHERE feature_label = 'Committee/leadership roles';
