import { GroupMetadata, jidNormalizedUser } from '@adiwajshing/baileys';
import type { Contact } from '@adiwajshing/baileys/lib/Types/Contact';
import {
  GroupParticipant as NOWEBGroupParticipant,
  ParticipantAction,
} from '@adiwajshing/baileys/lib/Types/GroupMetadata';
import { getGroupInviteLink } from '@waha/core/abc/session.abc';
import { toCusFormat } from '@waha/core/engines/noweb/session.noweb.core';
import {
  GroupInfo,
  GroupParticipant,
  GroupParticipantRole,
} from '@waha/structures/groups.dto';
import {
  GroupParticipantType,
  GroupV2JoinEvent,
  GroupV2LeaveEvent,
  GroupV2ParticipantsEvent,
  GroupV2UpdateEvent,
} from '@waha/structures/groups.events.dto';

export function ToGroupInfo(group: Partial<GroupMetadata>): GroupInfo {
  let participants: GroupParticipant[] = undefined;
  if (group.participants && group.participants.length > 0) {
    participants = group.participants.map(ToGroupParticipant);
  }
  return {
    id: group.id,
    subject: group.subject,
    description: group.desc,
    invite: group.inviteCode ? getGroupInviteLink(group.inviteCode) : undefined,
    participants: participants,
    membersCanAddNewMember: group.memberAddMode,
    membersCanSendMessages: group.announce,
    newMembersApprovalRequired: group.joinApprovalMode,
  };
}

export function ToGroupV2JoinEvent(group: GroupMetadata): GroupV2JoinEvent {
  return {
    timestamp: Date.now(),
    group: ToGroupInfo(group),
    _data: group,
  };
}

export function ToGroupParticipant(
  participant: NOWEBGroupParticipant,
): GroupParticipant {
  let role: GroupParticipantRole = GroupParticipantRole.PARTICIPANT;
  if (participant.admin === 'admin') {
    role = GroupParticipantRole.ADMIN;
  } else if (participant.admin === 'superadmin') {
    role = GroupParticipantRole.SUPERADMIN;
  }
  return {
    id: toCusFormat(participant.id),
    role: role,
  };
}

interface GroupParticipantUpdate {
  id: string;
  author: string;
  participants: string[];
  action: ParticipantAction;
}

export function ToGroupV2Participants(
  update: GroupParticipantUpdate,
): GroupV2ParticipantsEvent {
  let role: GroupParticipantRole;
  let type: GroupParticipantType;
  switch (update.action) {
    case 'add':
      role = GroupParticipantRole.PARTICIPANT;
      type = GroupParticipantType.JOIN;
      break;
    case 'remove':
      role = GroupParticipantRole.LEFT;
      type = GroupParticipantType.LEAVE;
      break;
    case 'promote':
      role = GroupParticipantRole.ADMIN;
      type = GroupParticipantType.PROMOTE;
      break;
    case 'demote':
      role = GroupParticipantRole.ADMIN;
      type = GroupParticipantType.DEMOTE;
      break;
  }

  const participants: GroupParticipant[] = update.participants.map((id) => {
    return {
      id: toCusFormat(id),
      role: role,
    };
  });

  return {
    group: {
      id: toCusFormat(update.id),
    },
    type: type,
    timestamp: Date.now(),
    participants: participants,
    _data: update,
  };
}

export function ToGroupV2UpdateEvent(
  group: Partial<GroupMetadata>,
): GroupV2UpdateEvent {
  return {
    timestamp: Date.now(),
    group: ToGroupInfo(group),
    _data: group,
  };
}

export function ToGroupV2LeaveEvent(
  me: Contact,
  update: GroupParticipantUpdate,
): GroupV2LeaveEvent | null {
  if (update.action !== 'remove') {
    return null;
  }
  if (!me) {
    return null;
  }
  const meId = jidNormalizedUser(me.id);
  if (!update.participants.includes(meId)) {
    return null;
  }

  return {
    timestamp: Date.now(),
    group: {
      id: toCusFormat(update.id),
    },
    _data: update,
  };
}
