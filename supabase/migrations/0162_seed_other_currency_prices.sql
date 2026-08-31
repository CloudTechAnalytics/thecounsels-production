-- ============================================================================
-- Migration 0162 — Starting price points for GHS/ZAR/KES/USD on the three
-- real selectable plans (Basic/Professional/Business — Enterprise stays
-- "contact sales" in every currency, Early Access is inactive). Looked up
-- by plan key rather than hardcoded id — testing and production each seed
-- their own plans table independently, so the same plan's row id differs
-- between the two projects.
--
-- These are ROUGH, ROUNDED estimates from approximate exchange rates, not
-- verified live rates or a considered pricing decision — meant only to
-- make the new currency picker actually usable today rather than empty.
-- Review and adjust every one of these in Platform Console > Plans &
-- Pricing before relying on them for a real prospect.
-- ============================================================================

insert into public.plan_prices (plan_id, currency, price_monthly, price_quarterly, price_yearly)
select id, v.currency, v.price_monthly, v.price_quarterly, v.price_yearly
from public.plans p
join (values
  ('starter', 'USD', 15, 40, 150),
  ('starter', 'GHS', 225, 610, 2250),
  ('starter', 'ZAR', 280, 756, 2800),
  ('starter', 'KES', 2250, 6075, 22500),
  ('professional', 'USD', 49, 132, 490),
  ('professional', 'GHS', 735, 1985, 7350),
  ('professional', 'ZAR', 910, 2457, 9100),
  ('professional', 'KES', 7350, 19845, 73500),
  ('business', 'USD', 99, 267, 990),
  ('business', 'GHS', 1485, 4010, 14850),
  ('business', 'ZAR', 1830, 4941, 18300),
  ('business', 'KES', 14850, 40095, 148500)
) as v(plan_key, currency, price_monthly, price_quarterly, price_yearly) on v.plan_key = p.key
on conflict (plan_id, currency) do nothing;
