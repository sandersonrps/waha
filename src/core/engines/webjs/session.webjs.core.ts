import { isJidGroup, isJidStatusBroadcast } from '@adiwajshing/baileys';
import { UnprocessableEntityException } from '@nestjs/common';
import {
  getChannelInviteLink,
  WhatsappSession,
} from '@waha/core/abc/session.abc';
import {
  getFromToParticipant,
  toCusFormat,
} from '@waha/core/engines/noweb/session.noweb.core';
import {
  ReceiptEvent,
  TagReceiptNodeToReceiptEvent,
} from '@waha/core/engines/webjs/ack.webjs';
import {
  ToGroupV2JoinEvent,
  ToGroupV2LeaveEvent,
  ToGroupV2ParticipantsEvent,
  ToGroupV2UpdateEvent,
} from '@waha/core/engines/webjs/groups.webjs';
import { LocalAuth } from '@waha/core/engines/webjs/LocalAuth';
import { WebjsClientCore } from '@waha/core/engines/webjs/WebjsClientCore';
import {
  CallErrorEvent,
  PAGE_CALL_ERROR_EVENT,
} from '@waha/core/engines/webjs/WPage';
import {
  AvailableInPlusVersion,
  NotImplementedByEngineError,
} from '@waha/core/exceptions';
import { IMediaEngineProcessor } from '@waha/core/media/IMediaEngineProcessor';
import { QR } from '@waha/core/QR';
import { StatusToAck } from '@waha/core/utils/acks';
import {
  parseMessageIdSerialized,
  SerializeMessageKey,
} from '@waha/core/utils/ids';
import { DistinctAck } from '@waha/core/utils/reactive';
import { splitAt } from '@waha/helpers';
import { PairingCodeResponse } from '@waha/structures/auth.dto';
import {
  Channel,
  ChannelListResult,
  ChannelMessage,
  ChannelRole,
  ChannelSearchByText,
  ChannelSearchByView,
  CreateChannelRequest,
  ListChannelsQuery,
  PreviewChannelMessages,
} from '@waha/structures/channels.dto';
import {
  ChatSortField,
  ChatSummary,
  GetChatMessageQuery,
  GetChatMessagesFilter,
  GetChatMessagesQuery,
  ReadChatMessagesQuery,
  ReadChatMessagesResponse,
} from '@waha/structures/chats.dto';
import {
  ChatRequest,
  CheckNumberStatusQuery,
  EditMessageRequest,
  MessageButtonReply,
  MessageFileRequest,
  MessageForwardRequest,
  MessageImageRequest,
  MessageLocationRequest,
  MessageReactionRequest,
  MessageReplyRequest,
  MessageStarRequest,
  MessageTextRequest,
  MessageVoiceRequest,
  SendSeenRequest,
  WANumberExistResult,
} from '@waha/structures/chatting.dto';
import { ContactQuery, ContactRequest } from '@waha/structures/contacts.dto';
import {
  ACK_UNKNOWN,
  SECOND,
  WAHAEngine,
  WAHAEvents,
  WAHAPresenceStatus,
  WAHASessionStatus,
  WAMessageAck,
} from '@waha/structures/enums.dto';
import { BinaryFile, RemoteFile } from '@waha/structures/files.dto';
import {
  CreateGroupRequest,
  GroupSortField,
  ParticipantsRequest,
  SettingsSecurityChangeInfo,
} from '@waha/structures/groups.dto';
import { Label, LabelDTO, LabelID } from '@waha/structures/labels.dto';
import { ReplyToMessage } from '@waha/structures/message.dto';
import { PaginationParams, SortOrder } from '@waha/structures/pagination.dto';
import {
  MessageSource,
  WAMessage,
  WAMessageReaction,
} from '@waha/structures/responses.dto';
import { MeInfo } from '@waha/structures/sessions.dto';
import { StatusRequest, TextStatus } from '@waha/structures/status.dto';
import {
  EnginePayload,
  WAMessageAckBody,
  WAMessageRevokedBody,
} from '@waha/structures/webhooks.dto';
import { PaginatorInMemory } from '@waha/utils/Paginator';
import { sleep, waitUntil } from '@waha/utils/promiseTimeout';
import { SingleDelayedJobRunner } from '@waha/utils/SingleDelayedJobRunner';
import * as lodash from 'lodash';
import { filter, fromEvent, merge, mergeMap, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  AuthStrategy,
  Call,
  Channel as WEBJSChannel,
  Chat,
  ClientOptions,
  Contact,
  Events,
  GroupChat,
  GroupNotification,
  Label as WEBJSLabel,
  Location,
  Message,
  MessageAck,
  MessageMedia,
  Reaction,
  WAState,
} from 'whatsapp-web.js';
import { Message as MessageInstance } from 'whatsapp-web.js/src/structures';

export interface WebJSConfig {
  webVersion?: string;
  cacheType: 'local' | 'none';
}

export class WhatsappSessionWebJSCore extends WhatsappSession {
  private START_ATTEMPT_DELAY_SECONDS = 2;

  engine = WAHAEngine.WEBJS;
  protected engineConfig?: WebJSConfig;

  private startDelayedJob: SingleDelayedJobRunner;
  private engineStateCheckDelayedJob: SingleDelayedJobRunner;
  private shouldRestart: boolean;

  whatsapp: WebjsClientCore;
  protected qr: QR;

  public constructor(config) {
    super(config);
    this.qr = new QR();
    this.shouldRestart = true;

    // Restart job if session failed
    this.startDelayedJob = new SingleDelayedJobRunner(
      'start-engine',
      this.START_ATTEMPT_DELAY_SECONDS * SECOND,
      this.logger,
    );
    this.engineStateCheckDelayedJob = new SingleDelayedJobRunner(
      'engine-state-check',
      2 * SECOND,
      this.logger,
    );
  }

  /**
   * Folder with the current class
   */
  protected getClassDirName() {
    return __dirname;
  }

  protected getClientOptions(): ClientOptions {
    const path = this.getClassDirName();
    const webVersion =
      this.engineConfig?.webVersion || '2.3000.1018072227-alpha';
    const cacheType = this.engineConfig?.cacheType || 'none';
    this.logger.info(`Using cache type: '${cacheType}'`);
    if (cacheType === 'local') {
      this.logger.info(`Using web version: '${webVersion}'`);
    }
    return {
      puppeteer: {
        headless: true,
        executablePath: this.getBrowserExecutablePath(),
        args: this.getBrowserArgsForPuppeteer(),
        dumpio: this.isDebugEnabled(),
      },
      webVersion: webVersion,
      webVersionCache: {
        type: cacheType,
        path: path,
        strict: true,
      },
    };
  }

  protected async buildClient() {
    const clientOptions = this.getClientOptions();
    const base = process.env.WAHA_LOCAL_STORE_BASE_DIR || './.sessions';
    clientOptions.authStrategy = new LocalAuth({
      clientId: this.name,
      dataPath: `${base}/webjs/default`,
      logger: this.logger,
      rmMaxRetries: undefined,
    });
    this.addProxyConfig(clientOptions);
    return new WebjsClientCore(clientOptions);
  }

  private restartClient() {
    if (!this.shouldRestart) {
      this.logger.debug(
        'Should not restart the client, ignoring restart request',
      );
      return;
    }

    this.startDelayedJob.schedule(async () => {
      if (!this.shouldRestart) {
        this.logger.warn(
          'Should not restart the client, ignoring restart request',
        );
        return;
      }
      await this.end();
      await this.start();
    });
  }

  protected addProxyConfig(clientOptions: ClientOptions) {
    if (this.proxyConfig?.server !== undefined) {
      // push the proxy server to the args
      clientOptions.puppeteer.args.push(
        `--proxy-server=${this.proxyConfig?.server}`,
      );

      // Authenticate
      if (this.proxyConfig?.username && this.proxyConfig?.password) {
        clientOptions.proxyAuthentication = {
          username: this.proxyConfig?.username,
          password: this.proxyConfig?.password,
        };
      }
    }
  }

  protected async init() {
    this.shouldRestart = true;
    this.whatsapp = await this.buildClient();
    this.whatsapp
      .initialize()
      .then(() => {
        // Listen for browser disconnected event
        this.whatsapp.pupBrowser.on('disconnected', () => {
          this.logger.error('The browser has been disconnected');
          this.failed();
        });

        // Listen for page close event
        this.whatsapp.pupPage.on('close', () => {
          this.logger.error('The WhatsApp Web page has been closed');
          this.failed();
        });

        // Listen for function call errors
        this.whatsapp.events.on(
          PAGE_CALL_ERROR_EVENT,
          (event: CallErrorEvent) => {
            if (event.error) {
              this.logger.error(
                `ProtocolError when calling page method: ${String(
                  event.method,
                )}, restarting client...`,
              );
              this.logger.error(event.error);
              this.failed();
            }
          },
        );

        // Listen for page error event
        if (this.isDebugEnabled()) {
          this.logger.debug("Logging 'console' event for web page");
          this.whatsapp.pupPage.on('console', (msg) =>
            this.logger.debug(`WEBJS page log: ${msg.text()}`),
          );
          this.whatsapp.pupPage.evaluate(() =>
            console.log(`url is ${location.href}`),
          );
        }
      })
      .catch((error) => {
        this.logger.error(error);
        this.failed();
        return;
      });
    if (this.isDebugEnabled()) {
      this.listenEngineEventsInDebugMode();
    }
    this.listenConnectionEvents();
    this.subscribeEngineEvents2();
  }

  async start() {
    this.status = WAHASessionStatus.STARTING;
    await this.init().catch((err) => {
      this.logger.error('Failed to start the client');
      this.logger.error(err, err.stack);
      this.failed();
    });
    return this;
  }

  async stop() {
    this.shouldRestart = false;
    this.status = WAHASessionStatus.STOPPED;
    this.stopEvents();
    this.startDelayedJob.cancel();
    this.mediaManager.close();
    await this.end();
  }

  protected failed() {
    // We'll restart the client if it's in the process of unpairing
    this.status = WAHASessionStatus.FAILED;
    this.restartClient();
  }

  async unpair() {
    this.unpairing = true;
    this.shouldRestart = false;
    await this.whatsapp.unpair();
    // Wait for unpairing to complete
    await sleep(2_000);
  }

  private async end() {
    this.engineStateCheckDelayedJob.cancel();
    this.whatsapp?.removeAllListeners();
    this.whatsapp?.pupBrowser?.removeAllListeners();
    this.whatsapp?.pupPage?.removeAllListeners();

    try {
      // It's possible that browser yet starting
      await waitUntil(
        async () => {
          const result = !!this.whatsapp.pupBrowser;
          this.logger.debug(`Browser is ready to be closed: ${result}`);
          return result;
        },
        1_000,
        10_000,
      );
      this.logger.debug(
        'Successfully waited for browser to be ready for closing',
      );
    } catch (error) {
      this.logger.error(
        error,
        'Failed while waiting for browser to be ready for closing',
      );
    }

    try {
      await this.whatsapp?.destroy();
      this.logger.debug('Successfully destroyed whatsapp client');
    } catch (error) {
      this.logger.error(error, 'Failed to destroy whatsapp client');
    }

    try {
      // @ts-ignore
      const strategy: AuthStrategy = this.whatsapp?.authStrategy;
      await strategy?.destroy();
      this.logger.debug('Successfully destroyed auth strategy');
    } catch (error) {
      this.logger.error(error, 'Failed to destroy auth strategy');
    }
  }

  getSessionMeInfo(): MeInfo | null {
    const clientInfo = this.whatsapp?.info;
    if (!clientInfo) {
      return null;
    }
    const wid = clientInfo.wid;
    return {
      id: wid?._serialized,
      pushName: clientInfo?.pushname,
    };
  }

  protected listenEngineEventsInDebugMode() {
    // Iterate over Events enum and log with debug level all incoming events
    // This is useful for debugging
    for (const key in Events) {
      const event = Events[key];
      this.whatsapp.on(event, (...data: any[]) => {
        const log = { event: event, data: data };
        this.logger.debug({ event: log }, `WEBJS event`);
      });
    }
  }

  protected listenConnectionEvents() {
    this.whatsapp.on(Events.QR_RECEIVED, async (qr) => {
      this.logger.debug('QR received');
      // Convert to image and save
      this.qr.save(qr);
      this.printQR(this.qr);
      this.status = WAHASessionStatus.SCAN_QR_CODE;
    });

    this.whatsapp.on(Events.READY, () => {
      this.status = WAHASessionStatus.WORKING;
      this.qr.save('');
      this.logger.info(`Session '${this.name}' is ready!`);
    });

    this.whatsapp.on(Events.AUTHENTICATED, (args) => {
      this.qr.save('');
      this.logger.info({ args: args }, `Session has been authenticated!`);
    });

    this.whatsapp.on(Events.AUTHENTICATION_FAILURE, (args) => {
      this.failed();
      this.qr.save('');
      this.logger.info({ args: args }, `Session has failed to authenticate!`);
    });

    this.whatsapp.on(Events.DISCONNECTED, (args) => {
      this.failed();
      this.qr.save('');
      this.logger.info({ args: args }, `Session has been disconnected!`);
    });

    this.whatsapp.on(Events.STATE_CHANGED, (state: WAState) => {
      const badStates = [WAState.OPENING, WAState.TIMEOUT];
      const log = this.logger.child({ state: state, event: 'change_state' });

      log.info('Session engine state changed');
      if (!badStates.includes(state)) {
        return;
      }

      log.info(`Session state changed to bad state, waiting for recovery...`);
      this.engineStateCheckDelayedJob.schedule(async () => {
        if (this.startDelayedJob.scheduled) {
          log.info('Session is restarting already, skip check.');
          return;
        }

        if (!this.whatsapp) {
          log.warn('Session is not initialized, skip recovery.');
          return;
        }

        const currentState = await this.whatsapp.getState().catch((error) => {
          log.error('Failed to get current state');
          log.error(error, error.stack);
          return null;
        });
        log.setBindings({ currentState: currentState });
        if (!currentState) {
          log.warn('Session has no current state, skip restarting.');
          return;
        } else if (badStates.includes(currentState)) {
          log.info('Session is still in bad state, restarting...');
          this.restartClient();
          return;
        }
        log.info('Session has recovered, no need to restart.');
      });
    });
  }

  /**
   * START - Methods for API
   */

  /**
   * Auth methods
   */
  public getQR(): QR {
    return this.qr;
  }

  public async requestCode(
    phoneNumber: string,
    method: string,
    params?: any,
  ): Promise<PairingCodeResponse> {
    const code = await this.whatsapp.requestPairingCode(phoneNumber, true);

    // show it as ABCD-ABCD
    const parts = splitAt(code, 4);
    const codeRepr = parts.join('-');
    this.logger.debug(`Your code: ${codeRepr}`);
    return { code: codeRepr };
  }

  async getScreenshot(): Promise<Buffer> {
    const screenshot = await this.whatsapp.pupPage.screenshot({
      encoding: 'binary',
    });
    return screenshot as Buffer;
  }

  async checkNumberStatus(
    request: CheckNumberStatusQuery,
  ): Promise<WANumberExistResult> {
    const phone = request.phone.split('@')[0];
    const result = await this.whatsapp.getNumberId(phone);
    if (!result) {
      return {
        numberExists: false,
      };
    }
    return {
      numberExists: true,
      chatId: result._serialized,
    };
  }

  /**
   * Profile methods
   */
  public async setProfileName(name: string): Promise<boolean> {
    await this.whatsapp.setPushName(name);
    return true;
  }

  public async setProfileStatus(status: string): Promise<boolean> {
    await this.whatsapp.setStatus(status);
    return true;
  }

  protected setProfilePicture(file: BinaryFile | RemoteFile): Promise<boolean> {
    throw new AvailableInPlusVersion();
  }

  protected deleteProfilePicture(): Promise<boolean> {
    throw new AvailableInPlusVersion();
  }

  /**
   * Other methods
   */
  sendText(request: MessageTextRequest) {
    const options = this.getMessageOptions(request);
    return this.whatsapp.sendMessage(
      this.ensureSuffix(request.chatId),
      request.text,
      options,
    );
  }

  public deleteMessage(chatId: string, messageId: string) {
    const message = this.recreateMessage(messageId);
    return message.delete(true);
  }

  public editMessage(
    chatId: string,
    messageId: string,
    request: EditMessageRequest,
  ) {
    const message = this.recreateMessage(messageId);
    const options = {
      // It's fine to sent just ids instead of Contact object
      mentions: request.mentions as unknown as string[],
      linkPreview: request.linkPreview,
    };
    return message.edit(request.text, options);
  }

  reply(request: MessageReplyRequest) {
    const options = this.getMessageOptions(request);
    return this.whatsapp.sendMessage(
      this.ensureSuffix(request.chatId),
      request.text,
      options,
    );
  }

  sendImage(request: MessageImageRequest) {
    throw new AvailableInPlusVersion();
  }

  sendFile(request: MessageFileRequest) {
    throw new AvailableInPlusVersion();
  }

  sendVoice(request: MessageVoiceRequest) {
    throw new AvailableInPlusVersion();
  }

  sendButtonsReply(request: MessageButtonReply) {
    throw new AvailableInPlusVersion();
  }

  async sendLocation(request: MessageLocationRequest) {
    const location = new Location(request.latitude, request.longitude, {
      name: request.title,
    });
    const options = this.getMessageOptions(request);
    return this.whatsapp.sendMessage(
      this.ensureSuffix(request.chatId),
      location,
      options,
    );
  }

  async forwardMessage(request: MessageForwardRequest): Promise<WAMessage> {
    const forwardMessage = this.recreateMessage(request.messageId);
    const msg = await forwardMessage.forward(this.ensureSuffix(request.chatId));
    // Return "sent: true" for now
    // need to research how to get the data from WebJS
    // @ts-ignore
    return { sent: msg || false };
  }

  async sendSeen(request: SendSeenRequest) {
    const chat: Chat = await this.whatsapp.getChatById(
      this.ensureSuffix(request.chatId),
    );
    await chat.sendSeen();
  }

  async startTyping(request: ChatRequest) {
    const chat: Chat = await this.whatsapp.getChatById(
      this.ensureSuffix(request.chatId),
    );
    await chat.sendStateTyping();
  }

  async stopTyping(request: ChatRequest) {
    const chat: Chat = await this.whatsapp.getChatById(
      this.ensureSuffix(request.chatId),
    );
    await chat.clearState();
  }

  async setReaction(request: MessageReactionRequest) {
    const message = this.recreateMessage(request.messageId);
    return message.react(request.reaction);
  }

  /**
   * Recreate message instance from id
   */
  private recreateMessage(msgId: string): MessageInstance {
    const messageId = this.deserializeId(msgId);
    const data = {
      id: messageId,
    };
    return new MessageInstance(this.whatsapp, data);
  }

  async setStar(request: MessageStarRequest) {
    const message = this.recreateMessage(request.messageId);
    if (request.star) {
      await message.star();
    } else {
      await message.unstar();
    }
  }

  /**
   * Chats methods
   */
  getChats(pagination: PaginationParams) {
    switch (pagination.sortBy) {
      case ChatSortField.ID:
        pagination.sortBy = 'id._serialized';
        break;
      case ChatSortField.CONVERSATION_TIMESTAMP:
        pagination.sortBy = 't';
        break;
    }
    return this.whatsapp.getChats(pagination);
  }

  public async getChatsOverview(
    pagination: PaginationParams,
  ): Promise<ChatSummary[]> {
    pagination = {
      ...pagination,
      sortBy: ChatSortField.CONVERSATION_TIMESTAMP,
      sortOrder: SortOrder.DESC,
    };
    const chats = await this.getChats(pagination);

    const promises = [];
    for (const chat of chats) {
      promises.push(this.fetchChatSummary(chat));
    }
    const result = await Promise.all(promises);
    return result;
  }

  protected async fetchChatSummary(chat: Chat): Promise<ChatSummary> {
    const picture = await this.getContactProfilePicture(
      chat.id._serialized,
      false,
    );
    const lastMessage = !!chat.lastMessage
      ? this.toWAMessage(chat.lastMessage)
      : null;
    return {
      id: chat.id._serialized,
      name: chat.name || null,
      picture: picture,
      lastMessage: lastMessage,
      _chat: chat,
    };
  }

  public async getChatMessages(
    chatId: string,
    query: GetChatMessagesQuery,
    filter: GetChatMessagesFilter,
  ) {
    if (chatId == 'all') {
      throw new NotImplementedByEngineError(
        "Can not get messages from 'all' in WEBJS",
      );
    }

    const downloadMedia = query.downloadMedia;
    // Test there's chat with id
    await this.whatsapp.getChatById(this.ensureSuffix(chatId));
    const pagination: PaginationParams = query;
    const messages = await this.whatsapp.getMessages(
      this.ensureSuffix(chatId),
      filter,
      pagination,
    );
    const promises = [];
    for (const msg of messages) {
      promises.push(this.processIncomingMessage(msg, downloadMedia));
    }
    let result = await Promise.all(promises);
    result = result.filter(Boolean);
    return result;
  }

  public async readChatMessages(
    chatId: string,
    request: ReadChatMessagesQuery,
  ): Promise<ReadChatMessagesResponse> {
    const chat: Chat = await this.whatsapp.getChatById(
      this.ensureSuffix(chatId),
    );
    await chat.sendSeen();
    return { ids: null };
  }

  public async getChatMessage(
    chatId: string,
    messageId: string,
    query: GetChatMessageQuery,
  ): Promise<null | WAMessage> {
    const message = await this.whatsapp.getMessageById(messageId);
    if (!message) return null;
    if (
      isJidGroup(message.id.remote) ||
      isJidStatusBroadcast(message.id.remote)
    ) {
      // @ts-ignore
      message.rawData.receipts = await message.getInfo().catch((error) => {
        this.logger.error(
          { error: error, msg: message.id._serialized },
          'Failed to get receipts',
        );
        return null;
      });
    }
    return await this.processIncomingMessage(message, query.downloadMedia);
  }

  public async pinMessage(
    chatId: string,
    messageId: string,
    duration: number,
  ): Promise<boolean> {
    const message = await this.whatsapp.getMessageById(messageId);
    return message.pin(duration);
  }

  public async unpinMessage(
    chatId: string,
    messageId: string,
  ): Promise<boolean> {
    const message = await this.whatsapp.getMessageById(messageId);
    return message.unpin();
  }

  async deleteChat(chatId) {
    const chat = await this.whatsapp.getChatById(this.ensureSuffix(chatId));
    return chat.delete();
  }

  async clearMessages(chatId) {
    const chat = await this.whatsapp.getChatById(chatId);
    return chat.clearMessages();
  }

  public chatsArchiveChat(chatId: string): Promise<any> {
    const id = this.ensureSuffix(chatId);
    return this.whatsapp.archiveChat(id);
  }

  public chatsUnarchiveChat(chatId: string): Promise<any> {
    const id = this.ensureSuffix(chatId);
    return this.whatsapp.unarchiveChat(id);
  }

  public chatsUnreadChat(chatId: string): Promise<any> {
    const id = this.ensureSuffix(chatId);
    return this.whatsapp.markChatUnread(id);
  }

  /**
   *
   * Label methods
   */

  public async getLabels(): Promise<Label[]> {
    const labels = await this.whatsapp.getLabels();
    return labels.map(this.toLabel);
  }

  public async createLabel(label: LabelDTO): Promise<Label> {
    const labelId = await this.whatsapp.createLabel(label.name, label.color);
    return {
      id: labelId.toString(),
      name: label.name,
      color: label.color,
      colorHex: Label.toHex(label.color),
    };
  }

  public async updateLabel(label: Label): Promise<Label> {
    return await this.whatsapp.updateLabel(label);
  }

  public deleteLabel(label: Label): Promise<void> {
    return this.whatsapp.deleteLabel(label);
  }

  public getChatsByLabelId(labelId: string) {
    return this.whatsapp.getChatsByLabelId(labelId);
  }

  public async getChatLabels(chatId: string): Promise<Label[]> {
    const id = this.ensureSuffix(chatId);
    const labels = await this.whatsapp.getChatLabels(id);
    return labels.map(this.toLabel);
  }

  public async putLabelsToChat(chatId: string, labels: LabelID[]) {
    const labelIds = labels.map((label) => label.id);
    const chatIds = [this.ensureSuffix(chatId)];
    await this.whatsapp.addOrRemoveLabels(labelIds, chatIds);
  }

  protected toLabel(label: WEBJSLabel): Label {
    const color = label.colorIndex;
    return {
      id: label.id,
      name: label.name,
      color: color,
      colorHex: Label.toHex(color),
    };
  }

  /**
   * Contacts methods
   */
  getContact(query: ContactQuery) {
    return this.whatsapp
      .getContactById(this.ensureSuffix(query.contactId))
      .then(this.toWAContact);
  }

  async getContacts(pagination: PaginationParams) {
    const contactsWEBJS = await this.whatsapp.getContacts();
    const contacts = contactsWEBJS.map(this.toWAContact);
    const paginator = new PaginatorInMemory(pagination);
    return paginator.apply(contacts);
  }

  public async getContactAbout(query: ContactQuery) {
    const contact = await this.whatsapp.getContactById(
      this.ensureSuffix(query.contactId),
    );
    return { about: await contact.getAbout() };
  }

  public async fetchContactProfilePicture(id: string) {
    const contact = await this.whatsapp.getContactById(this.ensureSuffix(id));
    const url = await contact.getProfilePicUrl();
    return url;
  }

  public async blockContact(request: ContactRequest) {
    const contact = await this.whatsapp.getContactById(
      this.ensureSuffix(request.contactId),
    );
    await contact.block();
  }

  public async unblockContact(request: ContactRequest) {
    const contact = await this.whatsapp.getContactById(
      this.ensureSuffix(request.contactId),
    );
    await contact.unblock();
  }

  /**
   * Group methods
   */
  public createGroup(request: CreateGroupRequest) {
    const participantIds = request.participants.map(
      (participant) => participant.id,
    );
    return this.whatsapp.createGroup(request.name, participantIds);
  }

  public joinGroup(code: string) {
    return this.whatsapp.acceptInvite(code);
  }

  public joinInfoGroup(code: string) {
    return this.whatsapp.getInviteInfo(code);
  }

  public async getInfoAdminsOnly(id): Promise<SettingsSecurityChangeInfo> {
    const groupChat = (await this.whatsapp.getChatById(id)) as GroupChat;
    return {
      // Undocumented property, can be changed in the future
      // @ts-ignore
      adminsOnly: groupChat.groupMetadata.restrict,
    };
  }

  public async setInfoAdminsOnly(id, value) {
    const groupChat = (await this.whatsapp.getChatById(id)) as GroupChat;
    return groupChat.setInfoAdminsOnly(value);
  }

  public async getMessagesAdminsOnly(id): Promise<SettingsSecurityChangeInfo> {
    const groupChat = (await this.whatsapp.getChatById(id)) as GroupChat;
    // @ts-ignore
    return {
      // Undocumented property, can be changed in the future
      // @ts-ignore
      adminsOnly: groupChat.groupMetadata.announce,
    };
  }

  public async setMessagesAdminsOnly(id, value) {
    const groupChat = (await this.whatsapp.getChatById(id)) as GroupChat;
    return groupChat.setMessagesAdminsOnly(value);
  }

  public async getGroups(pagination: PaginationParams) {
    const chats = await this.whatsapp.getChats();
    const groups = lodash.filter(chats, (chat) => chat.isGroup);

    switch (pagination.sortBy) {
      case GroupSortField.ID:
        pagination.sortBy = 'id._serialized';
        break;
      case GroupSortField.SUBJECT:
        pagination.sortBy = 'groupMetadata.subject';
        break;
    }

    const paginator = new PaginatorInMemory(pagination);
    return paginator.apply(groups);
  }

  protected removeGroupsFieldParticipant(group: any) {
    delete group.groupMetadata?.participants;
    delete group.groupMetadata?.pendingParticipants;
    delete group.groupMetadata?.pastParticipants;
    delete group.groupMetadata?.membershipApprovalRequests;
  }

  public async refreshGroups(): Promise<boolean> {
    return true;
  }

  public getGroup(id) {
    return this.whatsapp.getChatById(id);
  }

  public async deleteGroup(id) {
    const groupChat = (await this.whatsapp.getChatById(id)) as GroupChat;
    return groupChat.delete();
  }

  public async leaveGroup(id) {
    const groupChat = (await this.whatsapp.getChatById(id)) as GroupChat;
    return groupChat.leave();
  }

  public async setDescription(id, description) {
    const groupChat = (await this.whatsapp.getChatById(id)) as GroupChat;
    return groupChat.setDescription(description);
  }

  public async setSubject(id, subject) {
    const groupChat = (await this.whatsapp.getChatById(id)) as GroupChat;
    return groupChat.setSubject(subject);
  }

  public async getInviteCode(id): Promise<string> {
    const groupChat = (await this.whatsapp.getChatById(id)) as GroupChat;
    return groupChat.getInviteCode();
  }

  public async revokeInviteCode(id): Promise<string> {
    const groupChat = (await this.whatsapp.getChatById(id)) as GroupChat;
    await groupChat.revokeInvite();
    return groupChat.getInviteCode();
  }

  public async getParticipants(id) {
    const groupChat = (await this.whatsapp.getChatById(id)) as GroupChat;
    return groupChat.participants;
  }

  public async addParticipants(id, request: ParticipantsRequest) {
    const groupChat = (await this.whatsapp.getChatById(id)) as GroupChat;
    const participantIds = request.participants.map(
      (participant) => participant.id,
    );
    return groupChat.addParticipants(participantIds);
  }

  public async removeParticipants(id, request: ParticipantsRequest) {
    const groupChat = (await this.whatsapp.getChatById(id)) as GroupChat;
    const participantIds = request.participants.map(
      (participant) => participant.id,
    );
    return groupChat.removeParticipants(participantIds);
  }

  public async promoteParticipantsToAdmin(id, request: ParticipantsRequest) {
    const groupChat = (await this.whatsapp.getChatById(id)) as GroupChat;
    const participantIds = request.participants.map(
      (participant) => participant.id,
    );
    return groupChat.promoteParticipants(participantIds);
  }

  public async demoteParticipantsToUser(id, request: ParticipantsRequest) {
    const groupChat = (await this.whatsapp.getChatById(id)) as GroupChat;
    const participantIds = request.participants.map(
      (participant) => participant.id,
    );
    return groupChat.demoteParticipants(participantIds);
  }

  /**
   * Channels methods
   */
  public searchChannelsByView(
    query: ChannelSearchByView,
  ): Promise<ChannelListResult> {
    throw new AvailableInPlusVersion();
  }

  public searchChannelsByText(
    query: ChannelSearchByText,
  ): Promise<ChannelListResult> {
    throw new AvailableInPlusVersion();
  }

  public async previewChannelMessages(
    inviteCode: string,
    query: PreviewChannelMessages,
  ): Promise<ChannelMessage[]> {
    throw new AvailableInPlusVersion();
  }

  protected ChatToChannel(chat: WEBJSChannel): Channel {
    // @ts-ignore
    const metadata = chat.channelMetadata;
    let role = metadata.membershipType.toUpperCase();
    if (role === 'VIEWER') {
      role = ChannelRole.GUEST;
    }
    return {
      id: chat.id._serialized,
      name: chat.name,
      description: chat.description,
      invite: getChannelInviteLink(metadata.inviteCode),
      preview: null,
      picture: null,
      verified: metadata.verified,
      role: role,
      subscribersCount: null,
    };
  }

  protected ChannelMetadataToChannel(metadata: any): Channel {
    let role = metadata.membershipType.toUpperCase();
    if (role === 'VIEWER') {
      role = ChannelRole.GUEST;
    }
    return {
      id: metadata.id,
      name: metadata.titleMetadata.title,
      description: metadata.descriptionMetadata.description,
      invite: metadata.inviteLink,
      preview: metadata.pictureUrl,
      picture: metadata.pictureUrl,
      verified: metadata.isVerified,
      role: role,
      subscribersCount: metadata.subscribersCount,
    };
  }

  public async channelsList(query: ListChannelsQuery): Promise<Channel[]> {
    const data = await this.whatsapp.getChannels();
    let channels = data.map(this.ChatToChannel);
    if (query.role) {
      // @ts-ignore
      channels = channels.filter((channel) => channel.role === query.role);
    }

    // Exclude GUEST, browser saves the data
    // when we search channels or getting messages
    channels = channels.filter((channel) => channel.role !== 'GUEST');

    const promises = channels.map(async (channel) =>
      this.whatsapp.getProfilePicUrl(channel.id),
    );
    const pictures = await Promise.all(promises);
    channels = channels.map((channel, index) => {
      channel.picture = pictures[index] || null;
      channel.preview = channel.picture;
      return channel;
    });
    return channels;
  }

  public channelsCreateChannel(
    request: CreateChannelRequest,
  ): Promise<Channel> {
    throw new NotImplementedByEngineError();
  }

  public async channelsGetChannel(id: string): Promise<Channel> {
    return await this.channelsGetChannelByInviteCode(id);
  }

  public async channelsGetChannelByInviteCode(
    inviteCode: string,
  ): Promise<Channel> {
    const metadata = await this.whatsapp.getChannelByInviteCode(inviteCode);
    const channel = this.ChannelMetadataToChannel(metadata);
    channel.preview =
      (await this.whatsapp.getProfilePicUrl(channel.id)) || null;
    channel.picture = channel.preview;
    return channel;
  }

  public channelsDeleteChannel(id: string): Promise<void> {
    throw new NotImplementedByEngineError();
  }

  public channelsFollowChannel(id: string): Promise<void> {
    throw new NotImplementedByEngineError();
  }

  public channelsUnfollowChannel(id: string): Promise<void> {
    throw new NotImplementedByEngineError();
  }

  public channelsMuteChannel(id: string): Promise<void> {
    throw new NotImplementedByEngineError();
  }

  public channelsUnmuteChannel(id: string): Promise<void> {
    throw new NotImplementedByEngineError();
  }

  /**
   * Presences methods
   */
  public async setPresence(presence: WAHAPresenceStatus, chatId?: string) {
    let chat: Chat;
    switch (presence) {
      case WAHAPresenceStatus.ONLINE:
        await this.whatsapp.sendPresenceAvailable();
        break;
      case WAHAPresenceStatus.OFFLINE:
        await this.whatsapp.sendPresenceUnavailable();
        break;
      case WAHAPresenceStatus.TYPING:
        chat = await this.whatsapp.getChatById(chatId);
        await chat.sendStateTyping();
        break;
      case WAHAPresenceStatus.RECORDING:
        chat = await this.whatsapp.getChatById(chatId);
        await chat.sendStateRecording();
        break;
      case WAHAPresenceStatus.PAUSED:
        chat = await this.whatsapp.getChatById(chatId);
        await chat.clearState();
        break;
      default:
        throw new NotImplementedByEngineError(
          `WEBJS engine doesn't support '${presence}' presence.`,
        );
    }
  }

  /**
   * Status methods
   */
  protected checkStatusRequest(request: StatusRequest) {
    if (request.contacts && request.contacts?.length > 0) {
      const msg =
        "WEBJS doesn't accept 'contacts'. Remove the field to send status to all contacts.";
      throw new UnprocessableEntityException(msg);
    }
  }

  public sendTextStatus(status: TextStatus) {
    this.checkStatusRequest(status);
    return this.whatsapp.sendTextStatus(status);
  }

  /**
   * END - Methods for API
   */
  subscribeEngineEvents2() {
    // Save sent message in cache
    this.whatsapp.events.on('message.id', (data) => {
      this.saveSentMessageId(data.id);
    });

    //
    // All
    //
    const events: Observable<EnginePayload>[] = [];
    for (const key in Events) {
      const event = Events[key];
      const event$ = fromEvent(this.whatsapp, event);
      events.push(
        event$.pipe(
          map((data) => {
            return {
              event: event,
              data: data,
            };
          }),
        ),
      );
    }
    const all$ = merge(...events);
    this.events2.get(WAHAEvents.ENGINE_EVENT).switch(all$);

    //
    // Messages
    //
    const messageReceived$ = fromEvent(this.whatsapp, Events.MESSAGE_RECEIVED);
    const messagesFromOthers$ = messageReceived$.pipe(
      mergeMap((msg: any) => this.processIncomingMessage(msg, true)),
    );
    this.events2.get(WAHAEvents.MESSAGE).switch(messagesFromOthers$);

    const messageCreate$ = fromEvent(this.whatsapp, Events.MESSAGE_CREATE);
    const messagesFromAll$ = messageCreate$.pipe(
      mergeMap((msg: any) => this.processIncomingMessage(msg, true)),
    );
    this.events2.get(WAHAEvents.MESSAGE_ANY).switch(messagesFromAll$);

    const messageCiphertext$ = fromEvent(
      this.whatsapp,
      Events.MESSAGE_CIPHERTEXT,
    );
    const messagesWaiting$ = messageCiphertext$.pipe(
      mergeMap((msg: any) => this.processIncomingMessage(msg, true)),
    );
    this.events2.get(WAHAEvents.MESSAGE_WAITING).switch(messagesWaiting$);

    const messageRevoked$ = fromEvent(
      this.whatsapp,
      Events.MESSAGE_REVOKED_EVERYONE,
      (after, before) => {
        return { after, before };
      },
    );
    const messagesRevoked$ = messageRevoked$.pipe(
      map((event): WAMessageRevokedBody => {
        const afterMessage = event.after ? this.toWAMessage(event.after) : null;
        const beforeMessage = event.before
          ? this.toWAMessage(event.before)
          : null;
        return {
          after: afterMessage,
          before: beforeMessage,
        };
      }),
    );
    this.events2.get(WAHAEvents.MESSAGE_REVOKED).switch(messagesRevoked$);

    const messageReaction$ = fromEvent(this.whatsapp, 'message_reaction');
    const messagesReaction$ = messageReaction$.pipe(
      map(this.processMessageReaction.bind(this)),
    );
    this.events2.get(WAHAEvents.MESSAGE_REACTION).switch(messagesReaction$);

    const messageAckWEBJS$ = fromEvent(
      this.whatsapp,
      Events.MESSAGE_ACK,
      (message, ack) => {
        return { message, ack };
      },
    );
    const messagesAckDM$ = messageAckWEBJS$.pipe(
      map((event) => event.message),
      map<any, WAMessage>(this.toWAMessage.bind(this)),
      filter((ack) => !isJidGroup(ack.to) && !isJidStatusBroadcast(ack.to)),
    );
    const tagReceiptNode$ = fromEvent(this.whatsapp, Events.TAG_RECEIPT);
    const messageAckGroups$ = tagReceiptNode$.pipe(
      mergeMap((node) =>
        TagReceiptNodeToReceiptEvent(node as any, this.getSessionMeInfo()),
      ),
      mergeMap(this.TagReceiptToMessageAck.bind(this)),
      filter((ack) => isJidGroup(ack.to) || isJidStatusBroadcast(ack.to)),
    );

    const messageAckAll$ = merge(messagesAckDM$, messageAckGroups$);

    const messageAck$ = messageAckAll$.pipe(DistinctAck());
    this.events2.get(WAHAEvents.MESSAGE_ACK).switch(messageAck$);

    //
    // Others
    //
    const stateChanged$ = fromEvent(this.whatsapp, Events.STATE_CHANGED);
    this.events2.get(WAHAEvents.STATE_CHANGE).switch(stateChanged$);

    //
    // Groups
    //
    const groupJoin$ = fromEvent<GroupNotification>(
      this.whatsapp,
      Events.GROUP_JOIN,
    );
    this.events2.get(WAHAEvents.GROUP_JOIN).switch(groupJoin$); // v1
    const groupV2Join$ = groupJoin$.pipe(
      mergeMap((evt) =>
        ToGroupV2JoinEvent(this.whatsapp, this.getSessionMeInfo().id, evt),
      ),
      filter(Boolean),
    );
    this.events2.get(WAHAEvents.GROUP_V2_JOIN).switch(groupV2Join$);

    const groupLeave$ = fromEvent<GroupNotification>(
      this.whatsapp,
      Events.GROUP_LEAVE,
    );
    this.events2.get(WAHAEvents.GROUP_LEAVE).switch(groupLeave$); // v1
    const groupV2Leave$ = groupLeave$.pipe(
      map((evt) => ToGroupV2LeaveEvent(this.getSessionMeInfo().id, evt)),
      filter(Boolean),
    );
    this.events2.get(WAHAEvents.GROUP_V2_LEAVE).switch(groupV2Leave$);

    const groupAdminChanged$ = fromEvent(
      this.whatsapp,
      Events.GROUP_ADMIN_CHANGED,
    );
    const groupV2Participants = merge(
      groupJoin$,
      groupLeave$,
      groupAdminChanged$,
    ).pipe(map(ToGroupV2ParticipantsEvent), filter(Boolean));
    this.events2
      .get(WAHAEvents.GROUP_V2_PARTICIPANTS)
      .switch(groupV2Participants);

    const groupUpdate$ = fromEvent<GroupNotification>(
      this.whatsapp,
      Events.GROUP_UPDATE,
    );
    const groupV2Update$ = groupUpdate$.pipe(
      mergeMap((evt) => ToGroupV2UpdateEvent(this.whatsapp, evt)),
      filter(Boolean),
    );
    this.events2.get(WAHAEvents.GROUP_V2_UPDATE).switch(groupV2Update$);

    //
    // Chats
    //
    const chatArchived$ = fromEvent(
      this.whatsapp,
      'chat_archived',
      (chat, archived, _) => {
        return {
          chat: chat,
          archived: archived,
        };
      },
    );
    const chatsArchived$ = chatArchived$.pipe(
      map((event) => {
        return {
          id: event.chat.id._serialized,
          archived: event.archived,
          timestamp: event.chat.timestamp,
        };
      }),
    );
    this.events2.get(WAHAEvents.CHAT_ARCHIVE).switch(chatsArchived$);

    //
    // Calls
    //
    const call$ = fromEvent(this.whatsapp, 'call');
    const calls$ = call$.pipe(
      map((call: Call) => {
        return {
          id: call.id,
          from: call.from,
          timestamp: call.timestamp,
          isVideo: call.isVideo,
          isGroup: call.isGroup,
        };
      }),
    );
    this.events2.get(WAHAEvents.CALL_RECEIVED).switch(calls$);
  }

  protected async processIncomingMessage(
    message: Message,
    downloadMedia = true,
  ) {
    if (downloadMedia) {
      try {
        message = await this.downloadMedia(message);
      } catch (e) {
        this.logger.error('Failed when tried to download media for a message');
        this.logger.error(e, e.stack);
      }
    }
    return this.toWAMessage(message);
  }

  private processMessageReaction(reaction: Reaction): WAMessageReaction {
    const source = this.getMessageSource(reaction.id.id);
    return {
      id: reaction.id._serialized,
      from: reaction.senderId,
      fromMe: reaction.id.fromMe,
      source: source,
      participant: reaction.senderId,
      to: reaction.id.remote,
      timestamp: reaction.timestamp,
      reaction: {
        text: reaction.reaction,
        messageId: reaction.msgId._serialized,
      },
    };
  }

  protected TagReceiptToMessageAck(receipt: ReceiptEvent): WAMessageAckBody[] {
    const ids = receipt.messageIds;
    const acks = [];
    for (const id_ of ids) {
      const messageKey = {
        fromMe: receipt.key.fromMe,
        remoteJid: toCusFormat(receipt.key.remoteJid),
        participant: toCusFormat(receipt.key.participant),
        id: id_,
      };
      const fromToParticipant = getFromToParticipant(messageKey);
      const id = SerializeMessageKey(messageKey);
      const ack = StatusToAck(receipt.status);
      acks.push({
        id: id,
        from: fromToParticipant.from,
        to: fromToParticipant.to,
        participant: toCusFormat(receipt.participant),
        fromMe: !receipt.key.fromMe, // reverted, it's right
        ack: ack,
        ackName: WAMessageAck[ack] || ACK_UNKNOWN,
        _data: receipt._node,
      });
    }
    return acks;
  }

  protected toWAMessage(message: Message): WAMessage {
    const replyTo = this.extractReplyTo(message);
    const source = this.getMessageSource(message.id.id);
    const key = parseMessageIdSerialized(message.id._serialized);
    // @ts-ignore
    return {
      id: message.id._serialized,
      timestamp: message.timestamp,
      from: message.from,
      fromMe: message.fromMe,
      participant: toCusFormat(key.participant),
      source: source,
      to: message.to,
      body: message.body,
      // Media
      // @ts-ignore
      hasMedia: Boolean(message.hasMedia),
      // @ts-ignore
      media: message.media || null,
      // @ts-ignore
      mediaUrl: message.media?.url,
      // @ts-ignore
      ack: message.ack,
      ackName: WAMessageAck[message.ack] || ACK_UNKNOWN,
      location: message.location,
      vCards: message.vCards,
      replyTo: replyTo,
      _data: message.rawData,
    };
  }

  protected extractReplyTo(message: Message): ReplyToMessage | null {
    // @ts-ignore
    const quotedMsg = message.rawData?.quotedMsg;
    if (!quotedMsg) {
      return;
    }
    return {
      id: quotedMsg.id?.id,
      participant: quotedMsg.author || quotedMsg.from,
      body: quotedMsg.caption || quotedMsg.body,
      _data: quotedMsg,
    };
  }

  public async getEngineInfo() {
    // Add 1 seconds timeout
    return {
      WWebVersion: await this.whatsapp?.getWWebVersion(),
      state: await this.whatsapp?.getState(),
    };
  }

  protected toWAContact(contact: Contact) {
    // @ts-ignore
    contact.id = contact.id._serialized;
    return contact;
  }

  protected downloadMedia(message: Message) {
    const processor = new WEBJSEngineMediaProcessor();
    return this.mediaManager.processMedia(processor, message, this.name);
  }

  protected getMessageOptions(request: any): any {
    let mentions = request.mentions;
    mentions = mentions ? mentions.map(this.ensureSuffix) : undefined;

    const quotedMessageId = request.reply_to || request.replyTo;

    return {
      mentions: mentions,
      quotedMessageId: quotedMessageId,
      linkPreview: request.linkPreview,
    };
  }
}

export class WEBJSEngineMediaProcessor
  implements IMediaEngineProcessor<Message>
{
  hasMedia(message: Message): boolean {
    if (!message.hasMedia) {
      return false;
    }
    // Can't get media for revoked messages
    return message.type !== 'revoked';
  }

  getChatId(message: Message): string {
    return message.id.remote;
  }

  getMessageId(message: Message): string {
    return message.id._serialized;
  }

  getMimetype(message: Message): string {
    // @ts-ignore
    return message.rawData.mimetype;
  }

  async getMediaBuffer(message: Message): Promise<Buffer | null> {
    return message.downloadMedia().then((media: MessageMedia) => {
      if (!media) {
        return null;
      }
      return Buffer.from(media.data, 'base64');
    });
  }

  getFilename(message: Message): string | null {
    // @ts-ignore
    return message.rawData?.filename || null;
  }
}
