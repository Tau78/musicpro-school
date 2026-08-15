-- MusicPro School — booking_status: pending admin approval
-- Must run in its own migration (PG: new enum values unusable in same transaction).

ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'pending_approval';
