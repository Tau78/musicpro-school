"use client";

import Link from "next/link";

import {
  bandMemberRoleLabel,
  bandMemberStatusLabel,
  type BandMember,
} from "@musicpro/database";

interface BandMemberListProps {
  members: BandMember[];
}

export function BandMemberList({ members }: BandMemberListProps) {
  if (members.length === 0) {
    return (
      <p className="text-sm text-neutral-600">
        Nessun membro nella band.
      </p>
    );
  }

  const STATUS_STYLES: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    pending_invite: "bg-amber-100 text-amber-900",
    pending_quota: "bg-orange-100 text-orange-900",
    expired: "bg-red-100 text-red-800",
  };

  return (
    <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
      {members.map((member) => {
        const displayName = member.member
          ? `${member.member.firstName} ${member.member.lastName}`.trim()
          : member.invitedEmail ?? "Invito in attesa";
        const email = member.member?.email ?? member.invitedEmail;

        return (
          <li
            key={`${member.bandId}-${member.memberId}`}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div>
              <p className="font-medium text-neutral-900">
                {displayName}
                {member.role === "founder" ? (
                  <span className="ml-2 text-xs font-normal text-neutral-500">
                    ({bandMemberRoleLabel(member.role)})
                  </span>
                ) : null}
              </p>
              {email ? (
                <p className="text-sm text-neutral-500">{email}</p>
              ) : null}
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                STATUS_STYLES[member.status] ??
                "bg-neutral-100 text-neutral-700"
              }`}
            >
              {bandMemberStatusLabel(member.status)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
