-- Durate prenotazione: mezze ore fino a 5 ore.
-- Le sale prova erano ferme a 240 minuti (4 ore); 4,5 e 5 ore
-- venivano rifiutate da create_booking_safe (INVALID_DURATION).

UPDATE public.rooms
SET max_duration_minutes = 300
WHERE max_duration_minutes = 240;
