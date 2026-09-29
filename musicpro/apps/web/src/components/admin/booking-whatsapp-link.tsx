"use client";

import {
  buildBookingWhatsAppHref,
  buildBookingWhatsAppMessage,
} from "@/lib/booking/whatsapp-url";

type BookingWhatsAppLinkProps = {
  booking: {
    start_at: string;
    end_at: string;
    status: string;
    room?: { name: string } | null;
    member?: {
      first_name: string;
      phone?: string | null;
    } | null;
  };
  compact?: boolean;
  className?: string;
};

const btnClass =
  "inline-flex items-center justify-center rounded-lg border border-[#25D366]/40 bg-[#25D366]/10 px-3 py-1.5 text-sm font-medium text-[#128C7E] hover:bg-[#25D366]/20 touch-manipulation";

export function BookingWhatsAppLink({
  booking,
  compact = false,
  className = "",
}: BookingWhatsAppLinkProps) {
  const message = buildBookingWhatsAppMessage(booking);
  const href = buildBookingWhatsAppHref(booking.member?.phone, message);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${btnClass} ${className}`.trim()}
      onClick={(event) => event.stopPropagation()}
    >
      {compact ? "WA" : "WhatsApp"}
    </a>
  );
}
