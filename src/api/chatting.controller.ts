import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { WAHAValidationPipe } from '@waha/nestjs/pipes/WAHAValidationPipe';
import {
  GetChatMessagesFilter,
  ReadChatMessagesQuery,
  transformAck,
} from '@waha/structures/chats.dto';
import { SendButtonsRequest } from '@waha/structures/chatting.buttons.dto';

import { SessionManager } from '../core/abc/manager.abc';
import {
  ChatRequest,
  CheckNumberStatusQuery,
  GetMessageQuery,
  MessageButtonReply,
  MessageContactVcardRequest,
  MessageFileRequest,
  MessageForwardRequest,
  MessageImageRequest,
  MessageLinkCustomPreviewRequest,
  MessageLinkPreviewRequest,
  MessageLocationRequest,
  MessagePollRequest,
  MessageReactionRequest,
  MessageReplyRequest,
  MessageStarRequest,
  MessageTextQuery,
  MessageTextRequest,
  MessageVideoRequest,
  MessageVoiceRequest,
  SendSeenRequest,
  WANumberExistResult,
} from '../structures/chatting.dto';
import { WAMessage } from '../structures/responses.dto';

@ApiSecurity('api_key')
@Controller('api')
@ApiTags('📤 Chatting')
export class ChattingController {
  constructor(private manager: SessionManager) {}

  @Post('/sendText')
  @ApiOperation({ summary: 'Send a text message' })
  async sendText(@Body() request: MessageTextRequest): Promise<WAMessage> {
    const whatsapp = await this.manager.getWorkingSession(request.session);
    return whatsapp.sendText(request);
  }

  @Post('/sendImage')
  @ApiOperation({
    summary: 'Send an image',
    description:
      'Either from an URL or base64 data - look at the request schemas for details.',
  })
  async sendImage(@Body() request: MessageImageRequest) {
    const whatsapp = await this.manager.getWorkingSession(request.session);
    return whatsapp.sendImage(request);
  }

  @Post('/sendFile')
  @ApiOperation({
    summary: 'Send a file',
    description:
      'Either from an URL or base64 data - look at the request schemas for details.',
  })
  async sendFile(@Body() request: MessageFileRequest) {
    const whatsapp = await this.manager.getWorkingSession(request.session);
    return whatsapp.sendFile(request);
  }

  @Post('/sendVoice')
  @ApiOperation({
    summary: 'Send an voice message',
    description:
      'Either from an URL or base64 data - look at the request schemas for details.',
  })
  async sendVoice(@Body() request: MessageVoiceRequest) {
    const whatsapp = await this.manager.getWorkingSession(request.session);
    return whatsapp.sendVoice(request);
  }

  @Post('/sendVideo')
  @ApiOperation({
    summary: 'Send a video',
    description:
      'Either from an URL or base64 data - look at the request schemas for details.',
  })
  async sendVideo(@Body() request: MessageVideoRequest) {
    const whatsapp = await this.manager.getWorkingSession(request.session);
    return whatsapp.sendVideo(request);
  }

  @Post('/send/link-custom-preview')
  @ApiOperation({
    summary: 'Send a text message with a CUSTOM link preview.',
    description:
      'You can use regular /api/sendText if you wanna send auto-generated link preview.',
  })
  @UsePipes(new WAHAValidationPipe())
  async sendLinkCustomPreview(
    @Body() request: MessageLinkCustomPreviewRequest,
  ): Promise<any> {
    const whatsapp = await this.manager.getWorkingSession(request.session);
    if (!request.text.includes(request.preview.url)) {
      throw new Error(
        '"text" must include the URL provided in the "preview.url"',
      );
    }
    return whatsapp.sendLinkCustomPreview(request);
  }

  @Post('/sendButtons')
  @ApiOperation({
    summary: 'Send buttons (interactive message)',
    description: 'Send Buttons',
  })
  @UsePipes(new WAHAValidationPipe())
  async sendButtons(@Body() request: SendButtonsRequest) {
    const whatsapp = await this.manager.getWorkingSession(request.session);
    return whatsapp.sendButtons(request);
  }

  @Post('/forwardMessage')
  async forwardMessage(
    @Body() request: MessageForwardRequest,
  ): Promise<WAMessage> {
    const whatsapp = await this.manager.getWorkingSession(request.session);
    return await whatsapp.forwardMessage(request);
  }

  @Post('/sendSeen')
  async sendSeen(@Body() chat: SendSeenRequest) {
    const hasMessageId = chat.messageIds?.length > 0 || Boolean(chat.messageId);
    if (!hasMessageId) {
      const whatsapp = await this.manager.getWorkingSession(chat.session);
      const query: ReadChatMessagesQuery = {
        messages: null,
        days: 7,
      };
      return whatsapp.readChatMessages(chat.chatId, query);
    }
    const whatsapp = await this.manager.getWorkingSession(chat.session);
    return whatsapp.sendSeen(chat);
  }

  @Post('/startTyping')
  async startTyping(@Body() chat: ChatRequest) {
    // It's infinitive action
    const whatsapp = await this.manager.getWorkingSession(chat.session);
    await whatsapp.startTyping(chat);
    return { result: true };
  }

  @Post('/stopTyping')
  async stopTyping(@Body() chat: ChatRequest) {
    const whatsapp = await this.manager.getWorkingSession(chat.session);
    await whatsapp.stopTyping(chat);
    return { result: true };
  }

  @Put('/reaction')
  @ApiOperation({ summary: 'React to a message with an emoji' })
  async setReaction(@Body() request: MessageReactionRequest) {
    const whatsapp = await this.manager.getWorkingSession(request.session);
    return whatsapp.setReaction(request);
  }

  @Put('/star')
  @ApiOperation({ summary: 'Star or unstar a message' })
  async setStar(@Body() request: MessageStarRequest) {
    const whatsapp = await this.manager.getWorkingSession(request.session);
    await whatsapp.setStar(request);
    return;
  }

  @Post('/sendPoll')
  @ApiOperation({
    summary: 'Send a poll with options',
    description: 'You can use it as buttons or list replacement',
  })
  async sendPoll(@Body() request: MessagePollRequest) {
    const whatsapp = await this.manager.getWorkingSession(request.session);
    return whatsapp.sendPoll(request);
  }

  @Post('/sendLocation')
  async sendLocation(@Body() request: MessageLocationRequest) {
    const whatsapp = await this.manager.getWorkingSession(request.session);
    return whatsapp.sendLocation(request);
  }

  @Post('/sendContactVcard')
  async sendContactVcard(@Body() request: MessageContactVcardRequest) {
    const whatsapp = await this.manager.getWorkingSession(request.session);
    return whatsapp.sendContactVCard(request);
  }

  @Post('/send/buttons/reply')
  @ApiOperation({
    summary: 'Reply on a button message',
  })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async sendButtonsReply(@Body() request: MessageButtonReply) {
    const whatsapp = await this.manager.getWorkingSession(request.session);
    return whatsapp.sendButtonsReply(request);
  }

  @Get('/sendText')
  @ApiOperation({ summary: 'Send a text message', deprecated: true })
  async sendTextGet(@Query() query: MessageTextQuery) {
    const whatsapp = await this.manager.getWorkingSession(query.session);
    const msg = new MessageTextRequest();
    msg.chatId = query.phone;
    msg.text = query.text;
    return whatsapp.sendText(msg);
  }

  @Get('/messages')
  @ApiOperation({
    summary: 'Get messages in a chat',
    description: 'DEPRECATED. Use "GET /api/chats/{id}/messages" instead',
    deprecated: true,
  })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async getMessages(
    @Query() query: GetMessageQuery,
    @Query() filter: GetChatMessagesFilter,
  ) {
    filter = transformAck(filter);
    const whatsapp = await this.manager.getWorkingSession(query.session);
    return whatsapp.getChatMessages(query.chatId, query, filter);
  }

  @Get('/checkNumberStatus')
  @ApiOperation({
    summary: 'Check number status',
    description: 'DEPRECATED. Use "POST /contacts/check-exists" instead',
    deprecated: true,
  })
  async DEPRECATED_checkNumberStatus(
    @Query() request: CheckNumberStatusQuery,
  ): Promise<WANumberExistResult> {
    const whatsapp = await this.manager.getWorkingSession(request.session);
    return whatsapp.checkNumberStatus(request);
  }

  @Post('/reply')
  @ApiOperation({
    summary:
      'DEPRECATED - you can set "reply_to" field when sending text, image, etc',
    deprecated: true,
  })
  async reply(@Body() request: MessageReplyRequest) {
    const whatsapp = await this.manager.getWorkingSession(request.session);
    return whatsapp.reply(request);
  }

  @Post('/sendLinkPreview')
  @ApiOperation({ deprecated: true })
  async sendLinkPreview_DEPRECATED(@Body() request: MessageLinkPreviewRequest) {
    const whatsapp = await this.manager.getWorkingSession(request.session);
    return whatsapp.sendLinkPreview(request);
  }
}
