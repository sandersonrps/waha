import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GlobalWebhookConfigConfig } from '@waha/core/config/GlobalWebhookConfig';

import { parseBool } from './helpers';
import { WebhookConfig } from './structures/webhooks.config.dto';

@Injectable()
export class WhatsappConfigService implements OnApplicationBootstrap {
  private logger: Logger;
  private webhookConfig: GlobalWebhookConfigConfig;

  constructor(private configService: ConfigService) {
    this.logger = new Logger('WhatsappConfigService');
    this.webhookConfig = new GlobalWebhookConfigConfig(configService);
  }

  get schema() {
    return this.configService.get('WHATSAPP_API_SCHEMA', 'http');
  }

  get hostname(): string {
    return this.configService.get('WHATSAPP_API_HOSTNAME', 'localhost');
  }

  get port(): string {
    if (this.configService.get('PORT')) {
      return this.configService.get('PORT');
    }
    return this.configService.get('WHATSAPP_API_PORT', '3000');
  }

  get baseUrl(): string {
    let baseUrl = this.configService.get('WAHA_BASE_URL', '');
    if (!baseUrl) {
      // combine schema+hostname+port
      baseUrl = `${this.schema}://${this.hostname}:${this.port}`;
    }
    // remove / at the end
    return baseUrl.replace(/\/$/, '');
  }

  get workerId(): string {
    return this.configService.get('WAHA_WORKER_ID', '');
  }

  get shouldRestartWorkerSessions(): boolean {
    const value = this.configService.get(
      'WAHA_WORKER_RESTART_SESSIONS',
      'true',
    );
    return parseBool(value);
  }

  get autoStartDelaySeconds(): number {
    const value = this.configService.get('WAHA_AUTO_START_DELAY_SECONDS', '0');
    try {
      return parseInt(value, 10);
    } catch (error) {
      return 0;
    }
  }

  get mimetypes(): string[] {
    if (!this.shouldDownloadMedia) {
      return ['mimetype/ignore-all-media'];
    }
    const types = this.configService.get('WHATSAPP_FILES_MIMETYPES', '');
    return types ? types.split(',') : [];
  }

  get shouldDownloadMedia(): boolean {
    const value = this.configService.get('WHATSAPP_DOWNLOAD_MEDIA', 'true');
    return parseBool(value);
  }

  get startSessions(): string[] {
    const value: string = this.configService.get('WHATSAPP_START_SESSION', '');
    if (!value) {
      return [];
    }
    return value.split(',');
  }

  get shouldRestartAllSessions(): boolean {
    const value: string = this.configService.get(
      'WHATSAPP_RESTART_ALL_SESSIONS',
      'false',
    );
    return parseBool(value);
  }

  get proxyServer(): string[] | string | undefined {
    const single = this.configService.get<string>(
      'WHATSAPP_PROXY_SERVER',
      undefined,
    );
    const multipleValues = this.configService.get<string>(
      'WHATSAPP_PROXY_SERVER_LIST',
      undefined,
    );
    const multiple = multipleValues ? multipleValues.split(',') : undefined;
    return single ? single : multiple;
  }

  get proxyServerIndexPrefix(): string | undefined {
    return this.configService.get(
      'WHATSAPP_PROXY_SERVER_INDEX_PREFIX',
      undefined,
    );
  }

  get proxyServerUsername(): string | undefined {
    return this.configService.get('WHATSAPP_PROXY_SERVER_USERNAME', undefined);
  }

  get proxyServerPassword(): string | undefined {
    return this.configService.get('WHATSAPP_PROXY_SERVER_PASSWORD', undefined);
  }

  getWebhookConfig(): WebhookConfig | undefined {
    return this.webhookConfig.config;
  }

  getSessionMongoUrl(): string | undefined {
    return this.configService.get('WHATSAPP_SESSIONS_MONGO_URL', undefined);
  }

  getSessionPostgresUrl(): string | undefined {
    return this.configService.get(
      'WHATSAPP_SESSIONS_POSTGRESQL_URL',
      undefined,
    );
  }

  get(name: string, defaultValue: any = undefined): any {
    return this.configService.get(name, defaultValue);
  }

  getApiKey(): string | undefined {
    return this.configService.get('WHATSAPP_API_KEY', '');
  }

  getExcludedPaths(): string[] {
    const value = this.configService.get('WHATSAPP_API_KEY_EXCLUDE_PATH', '');
    if (!value) {
      return [];
    }
    return value.split(',');
  }

  getHealthMediaFilesThreshold(): number {
    return this.configService.get<number>(
      'WHATSAPP_HEALTH_MEDIA_FILES_THRESHOLD_MB',
      100,
    );
  }

  getHealthSessionFilesThreshold(): number {
    return this.configService.get<number>(
      'WHATSAPP_HEALTH_SESSION_FILES_THRESHOLD_MB',
      100,
    );
  }

  getHealthMongoTimeout(): number {
    return this.configService.get<number>(
      'WHATSAPP_HEALTH_MONGO_TIMEOUT_MS',
      3000,
    );
  }

  get debugModeEnabled(): boolean {
    const value = this.configService.get('WAHA_DEBUG_MODE', 'false');
    return parseBool(value);
  }

  onApplicationBootstrap() {
    const error = this.webhookConfig.validateConfig();
    if (error) {
      throw new Error(`Invalid global webhook config:\n${error}\n`);
    }
  }
}
