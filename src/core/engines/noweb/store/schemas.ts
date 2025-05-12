import { Field, Index, Schema } from '@waha/core/storage/Schema';

export const NowebContactSchema = new Schema(
  'contacts',
  [new Field('id', 'TEXT'), new Field('data', 'TEXT')],
  [new Index('contacts_id_index', ['id'])],
);

export const NowebChatSchema = new Schema(
  'chats',
  [
    new Field('id', 'TEXT'),
    new Field('conversationTimestamp', 'INTEGER'),
    new Field('data', 'TEXT'),
  ],
  [
    new Index('chats_id_index', ['id']),
    new Index('chats_conversationTimestamp_index', ['conversationTimestamp']),
  ],
);

export const NowebGroupsSchema = new Schema(
  'groups',
  [new Field('id', 'TEXT'), new Field('data', 'TEXT')],
  [new Index('groups_id_index', ['id'])],
);

export const NowebMessagesSchema = new Schema(
  'messages',
  [
    new Field('jid', 'TEXT'),
    new Field('id', 'TEXT'),
    new Field('messageTimestamp', 'INTEGER'),
    new Field('data', 'TEXT'),
  ],
  [
    new Index('messages_id_index', ['id']),
    new Index('messages_jid_id_index', ['jid', 'id']),
    new Index('messages_jid_timestamp_index', ['jid', 'messageTimestamp']),
    new Index('timestamp_index', ['messageTimestamp']),
  ],
);

export const NowebLabelsSchema = new Schema(
  'labels',
  [new Field('id', 'TEXT'), new Field('data', 'TEXT')],
  [new Index('labels_id_index', ['id'])],
);

export const NowebLabelAssociationsSchema = new Schema(
  'labelAssociations',
  [
    new Field('id', 'TEXT'),
    new Field('type', 'TEXT'),
    new Field('labelId', 'TEXT'),
    new Field('chatId', 'TEXT'),
    new Field('messageId', 'TEXT'),
    new Field('data', 'TEXT'),
  ],
  [
    new Index('label_assoc_id_index', ['id']),
    new Index('label_assoc_type_label_index', ['type', 'labelId']),
    new Index('label_assoc_type_chat_index', ['type', 'chatId']),
    new Index('label_assoc_type_message_index', ['type', 'messageId']),
  ],
);

export const NOWEB_STORE_SCHEMA = [
  NowebContactSchema,
  NowebChatSchema,
  NowebGroupsSchema,
  NowebMessagesSchema,
  NowebLabelsSchema,
  NowebLabelAssociationsSchema,
];

export const Migrations: string[] = [
  // Contacts
  'CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, data TEXT)',
  'CREATE UNIQUE INDEX IF NOT EXISTS contacts_id_index ON contacts (id)',
  // Chats
  'CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, "conversationTimestamp" INTEGER, data TEXT)',
  'CREATE UNIQUE INDEX IF NOT EXISTS chats_id_index ON chats (id)',
  'CREATE INDEX IF NOT EXISTS "chats_conversationTimestamp_index" ON chats ("conversationTimestamp")',
  // Groups
  'CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, data TEXT)',
  'CREATE UNIQUE INDEX IF NOT EXISTS groups_id_index ON groups (id)',
  // Messages
  'CREATE TABLE IF NOT EXISTS messages (jid TEXT, id TEXT, "messageTimestamp" INTEGER, data TEXT)',
  'CREATE UNIQUE INDEX IF NOT EXISTS messages_id_index ON messages (id)',
  'CREATE INDEX IF NOT EXISTS messages_jid_id_index ON messages (jid, id)',
  'CREATE INDEX IF NOT EXISTS messages_jid_timestamp_index ON messages (jid, "messageTimestamp")',
  'CREATE INDEX IF NOT EXISTS timestamp_index ON messages ("messageTimestamp")',
  // Labels
  'CREATE TABLE IF NOT EXISTS labels (id TEXT PRIMARY KEY, data TEXT)',
  'CREATE UNIQUE INDEX IF NOT EXISTS labels_id_index ON labels (id)',
  // Label associations
  'CREATE TABLE IF NOT EXISTS "labelAssociations" (id TEXT PRIMARY KEY, type TEXT, "labelId" TEXT, "chatId" TEXT, "messageId" TEXT, data TEXT)',
  'CREATE UNIQUE INDEX IF NOT EXISTS label_assoc_id_index ON "labelAssociations" (id)',
  'CREATE INDEX IF NOT EXISTS label_assoc_type_label_index ON "labelAssociations" (type, "labelId")',
  'CREATE INDEX IF NOT EXISTS label_assoc_type_chat_index ON "labelAssociations" (type, "chatId")',
  'CREATE INDEX IF NOT EXISTS label_assoc_type_message_index ON "labelAssociations" (type, "messageId")',
];
