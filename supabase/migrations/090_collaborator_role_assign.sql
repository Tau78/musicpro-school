-- Il valore enum collaboratore va usato solo dopo il commit di 089 (ADD VALUE).
INSERT INTO public.member_roles (member_id, role, granted_at)
SELECT m.id, 'collaboratore'::public.member_role, now()
FROM public.members m
WHERE m.id IN (
  'dd097d26-ce62-4d74-86ec-d6e36faab460', -- Marco Facciolo
  '609412bc-bbfe-4d8b-9718-77b2d5c270e7', -- Alessandro Petralia
  '8ff30ee4-23fe-4336-934b-a12e7be9a363'  -- Aldo Roberti
)
ON CONFLICT (member_id, role) DO UPDATE
SET revoked_at = NULL,
    granted_at = COALESCE(public.member_roles.granted_at, EXCLUDED.granted_at);
