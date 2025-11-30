```sql
-- Insert default company designations if they don't already exist
INSERT INTO public.company_designations (designation_name, is_active)
SELECT 'Proprietor', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.company_designations WHERE designation_name = 'Proprietor');

INSERT INTO public.company_designations (designation_name, is_active)
SELECT 'Partner', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.company_designations WHERE designation_name = 'Partner');

INSERT INTO public.company_designations (designation_name, is_active)
SELECT 'Managing Partner', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.company_designations WHERE designation_name = 'Managing Partner');

INSERT INTO public.company_designations (designation_name, is_active)
SELECT 'Managing Director', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.company_designations WHERE designation_name = 'Managing Director');

INSERT INTO public.company_designations (designation_name, is_active)
SELECT 'Director', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.company_designations WHERE designation_name = 'Director');

INSERT INTO public.company_designations (designation_name, is_active)
SELECT 'Joint Managing Director', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.company_designations WHERE designation_name = 'Joint Managing Director');

INSERT INTO public.company_designations (designation_name, is_active)
SELECT 'Operations', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.company_designations WHERE designation_name = 'Operations');

INSERT INTO public.company_designations (designation_name, is_active)
SELECT 'President', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.company_designations WHERE designation_name = 'President');

INSERT INTO public.company_designations (designation_name, is_active)
SELECT 'Vice President', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.company_designations WHERE designation_name = 'Vice President');

INSERT INTO public.company_designations (designation_name, is_active)
SELECT 'Chief Executive Officer', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.company_designations WHERE designation_name = 'Chief Executive Officer');

INSERT INTO public.company_designations (designation_name, is_active)
SELECT 'Chief Financial Officer', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.company_designations WHERE designation_name = 'Chief Financial Officer');

INSERT INTO public.company_designations (designation_name, is_active)
SELECT 'Chief Operating Officer', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.company_designations WHERE designation_name = 'Chief Operating Officer');

INSERT INTO public.company_designations (designation_name, is_active)
SELECT 'General Manager', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.company_designations WHERE designation_name = 'General Manager');

INSERT INTO public.company_designations (designation_name, is_active)
SELECT 'Manager', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.company_designations WHERE designation_name = 'Manager');

INSERT INTO public.company_designations (designation_name, is_active)
SELECT 'Chairman', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.company_designations WHERE designation_name = 'Chairman');
```