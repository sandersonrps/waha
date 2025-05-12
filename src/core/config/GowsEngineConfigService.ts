import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BootstrapConfig } from '@waha/core/engines/gows/GowsBootstrap';
import { GowsConfig } from '@waha/core/engines/gows/session.gows.core';

@Injectable()
export class GowsEngineConfigService {
  constructor(protected configService: ConfigService) {}

  getBootstrapConfig(): BootstrapConfig {
    return {
      path: this.configService.get('WAHA_GOWS_PATH'),
      socket: this.getSocket(),
    };
  }

  getSocket() {
    return this.configService.get('WAHA_GOWS_SOCKET', '/tmp/gows.sock');
  }

  getConfig(): GowsConfig {
    return {
      connection: 'unix:' + this.getSocket(),
    };
  }
}
