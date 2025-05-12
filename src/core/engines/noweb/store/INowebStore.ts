import {
  BaileysEventEmitter,
  Chat,
  Contact,
  proto,
} from '@adiwajshing/baileys';
import { GroupMetadata } from '@adiwajshing/baileys/lib/Types/GroupMetadata';
import { Label } from '@adiwajshing/baileys/lib/Types/Label';
import { GetChatMessagesFilter } from '@waha/structures/chats.dto';
import { PaginationParams } from '@waha/structures/pagination.dto';

export interface INowebStore {
  presences: any;

  init(): Promise<void>;

  close(): Promise<void>;

  bind(ev: BaileysEventEmitter, socket: any): void;

  loadMessage(jid: string, id: string): Promise<proto.IWebMessageInfo>;

  getMessagesByJid(
    chatId: string,
    filter: GetChatMessagesFilter,
    pagination: PaginationParams,
  ): Promise<any>;

  getMessageById(chatId: string, messageId: string): Promise<any>;

  getChats(pagination: PaginationParams, broadcast: boolean): Promise<Chat[]>;

  getChat(jid: string): Promise<Chat | null>;

  getContacts(pagination: PaginationParams): Promise<Contact[]>;

  getContactById(jid: string): Promise<Contact>;

  getLabels(): Promise<Label[]>;

  getLabelById(labelId: string): Promise<Label | null>;

  getChatsByLabelId(labelId: string): Promise<Chat[]>;

  getChatLabels(chatId: string): Promise<Label[]>;

  getGroups(pagination: PaginationParams): Promise<GroupMetadata[]>;

  resetGroupsCache(): void;
}
