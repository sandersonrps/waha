import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { BooleanString } from '@waha/nestjs/validation/BooleanString';
import { WAMessageAck, WAMessageAckName } from '@waha/structures/enums.dto';
import {
  LimitOffsetParams,
  PaginationParams,
} from '@waha/structures/pagination.dto';
import { ChatIdProperty } from '@waha/structures/properties.dto';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsOptional } from 'class-validator';

/**
 * Queries
 */

export class GetChatMessagesFilter {
  @ApiProperty({
    required: false,
    description: 'Filter messages before this timestamp (inclusive)',
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  'filter.timestamp.lte'?: number;

  @ApiProperty({
    required: false,
    description: 'Filter messages after this timestamp (inclusive)',
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  'filter.timestamp.gte'?: number;

  @ApiProperty({
    required: false,
    description: 'From me filter (by default shows all messages)',
  })
  @Transform(BooleanString)
  @IsBoolean()
  @IsOptional()
  'filter.fromMe'?: boolean;

  @ApiProperty({
    required: false,
    description: 'Filter messages by acknowledgment status',
    enum: WAMessageAckName,
  })
  @IsEnum(WAMessageAckName)
  @IsOptional()
  'filter.ack'?: WAMessageAck;
}

export function transformAck(
  filter: GetChatMessagesFilter,
): GetChatMessagesFilter {
  if (!filter) return filter;
  if (!filter['filter.ack']) return filter;
  const ackName = filter['filter.ack'];
  // @ts-ignore
  const ack: WAMessageAck = WAMessageAck[ackName];
  if (ack == null) {
    throw new BadRequestException(`Invalid ack: '${ackName}'`);
  }
  filter['filter.ack'] = ack;
  return filter;
}

export class ChatPictureQuery {
  @Transform(BooleanString)
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    example: false,
    required: false,
    description:
      'Refresh the picture from the server (24h cache by default). Do not refresh if not needed, you can get rate limit error',
  })
  refresh?: boolean = false;
}

export class ChatPictureResponse {
  url: string;
}

export class GetChatMessagesQuery {
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit: number = 10;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  offset?: number;

  @ApiProperty({
    example: false,
    required: false,
    description: 'Download media for messages',
  })
  @Transform(BooleanString)
  @IsBoolean()
  @IsOptional()
  downloadMedia: boolean = true;
}

export class ReadChatMessagesQuery {
  @ApiProperty({
    example: 30,
    required: false,
    description: 'How much messages to read (latest first)',
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  messages: number;

  @ApiProperty({
    required: false,
    description: 'How much days to read (latest first)',
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  days: number = 7;
}

export class ReadChatMessagesResponse {
  @ApiProperty({
    required: false,
    description: 'Messages IDs that have been read',
  })
  ids?: string[];
}

export class GetChatMessageQuery {
  @ApiProperty({
    example: true,
    required: false,
    description: 'Download media for messages',
  })
  @Transform(BooleanString)
  @IsBoolean()
  @IsOptional()
  downloadMedia: boolean = true;
}

export enum ChatSortField {
  CONVERSATION_TIMESTAMP = 'conversationTimestamp',
  ID = 'id',
  NAME = 'name',
}

export class ChatsPaginationParams extends PaginationParams {
  @ApiProperty({
    description: 'Sort by field',
    enum: ChatSortField,
  })
  @IsOptional()
  @IsEnum(ChatSortField)
  sortBy?: string;
}

export enum PinDuration {
  DAY = 86400,
  WEEK = 604800,
  MONTH = 2592000,
}

export class PinMessageRequest {
  @IsNumber()
  @IsEnum(PinDuration)
  @ApiProperty({
    description:
      'Duration in seconds. 24 hours (86400), 7 days (604800), 30 days (2592000)',
    example: 86400,
  })
  duration: number;
}

export class OverviewPaginationParams extends LimitOffsetParams {
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}

export class ChatSummary {
  id: string;
  name: string | null;
  picture: string | null;
  lastMessage: any;
  _chat: any;
}

/**
 * Events
 */

export class ChatArchiveEvent {
  @ChatIdProperty()
  id: string;

  archived: boolean;

  timestamp: number;
}
