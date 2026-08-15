-- ============================================================================
-- Migration 0063 — Add 'appeal' to matter_status.
--
-- Additive only. The "Open a new matter" status list was simplified
-- client-side (Open -> "New"; Pending merged into "In Court"; Won/Lost
-- retired from fresh selection in favor of "Closed") — none of that needs
-- a schema change, since those are just which labels/values the UI offers,
-- and 'pending'/'won'/'lost' remain valid stored values for existing
-- matters (see MATTER_STATUS_META). 'appeal' is the one genuinely new
-- status value, so it's the one addition the enum itself needs.
-- ============================================================================

alter type public.matter_status add value if not exists 'appeal';
