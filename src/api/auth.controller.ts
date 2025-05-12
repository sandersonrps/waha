import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiFileAcceptHeader } from '@waha/nestjs/ApiFileAcceptHeader';
import {
  QRCodeSessionParam,
  SessionApiParam,
  SessionParam,
} from '@waha/nestjs/params/SessionApiParam';

import { SessionManager } from '../core/abc/manager.abc';
import { WhatsappSession } from '../core/abc/session.abc';
import { BufferResponseInterceptor } from '../nestjs/BufferResponseInterceptor';
import {
  QRCodeFormat,
  QRCodeQuery,
  QRCodeValue,
  RequestCodeRequest,
} from '../structures/auth.dto';
import { Base64File } from '../structures/files.dto';

@ApiSecurity('api_key')
@Controller('api/:session/auth')
@ApiTags('🔑 Auth')
class AuthController {
  constructor(private manager: SessionManager) {}

  @Get('qr')
  @ApiOperation({
    summary: 'Get QR code for pairing WhatsApp API.',
  })
  @SessionApiParam
  @ApiFileAcceptHeader(Base64File, QRCodeValue)
  @UseInterceptors(new BufferResponseInterceptor())
  async getQR(
    @QRCodeSessionParam session: WhatsappSession,
    @Query() query: QRCodeQuery,
  ): Promise<Buffer | QRCodeValue> {
    const qr = session.getQR();
    if (query.format == QRCodeFormat.RAW) {
      return { value: qr.raw };
    }
    return qr.get();
  }

  @Post('request-code')
  @SessionApiParam
  @ApiOperation({
    summary: 'Request authentication code.',
  })
  requestCode(
    @SessionParam session: WhatsappSession,
    @Body() request: RequestCodeRequest,
  ) {
    return session.requestCode(request.phoneNumber, request.method, request);
  }
}

export { AuthController };
