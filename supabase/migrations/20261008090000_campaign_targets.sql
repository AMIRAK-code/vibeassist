-- Ad Manager: the cost per install the user is aiming for, shown next to their actual average.
-- Only touches public.profiles; covered by the existing "Users update their own profile" policy.

alter table public.profiles
  add column target_cac numeric(12, 2) check (target_cac is null or target_cac >= 0);

comment on column public.profiles.target_cac is 'Target cost per install in the profile currency (Ad Manager). Null when not set.';

-- Rollback:
-- alter table public.profiles drop column target_cac;
