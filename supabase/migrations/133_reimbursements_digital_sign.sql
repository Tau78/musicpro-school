-- Firma digitale notula rimborso: flag richiesta + PNG firma associato.
alter table public.reimbursements
  add column if not exists digital_sign_requested boolean not null default false;

alter table public.reimbursements
  add column if not exists signature_png_base64 text;

comment on column public.reimbursements.digital_sign_requested is
  'Se true: dopo la bozza PDF si invia magic link all''associato invece dell''email notula classica.';

comment on column public.reimbursements.signature_png_base64 is
  'PNG firma associato (base64 senza data: prefix), come lesson_payrolls.';
