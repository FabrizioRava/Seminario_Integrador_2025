
// src/common/filters/all-exceptions.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorResponseDto } from '../dto/api-error-response.dto';
import { randomUUID } from 'crypto';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isProd = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
    const requestId =
      request.headers['x-request-id']?.toString() ??
      request.headers['x-correlation-id']?.toString() ??
      randomUUID();

    // Determinar status y payload base
    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? (exception as HttpException).getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const httpPayload = isHttp ? (exception as HttpException).getResponse() : null;

    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (typeof httpPayload === 'string') {
      message = httpPayload;
    } else if (httpPayload && typeof httpPayload === 'object') {
      const maybeObj = httpPayload as Record<string, any>;
      message = maybeObj.message ?? message;
      error = maybeObj.error ?? error;
    } else if (exception instanceof Error) {
      // En prod no exponemos el mensaje preciso del error no controlado
      message = isProd ? 'Internal server error' : exception.message;
      error = (exception as any)?.name ?? error;
    }

    // Normalizar mensajes del ValidationPipe que pueden ser arrays
    const normalizedMessage =
      Array.isArray(message) ? message : typeof message === 'string' ? message : 'Error';

    // Log seguro (sin PII ni body completo). Stack solo en dev.
    this.logger.error(
      `[${requestId}] ${request.method} ${request.url} -> ${status} :: ${
        Array.isArray(normalizedMessage)
          ? normalizedMessage.join('; ')
          : normalizedMessage
      }`,
      isProd ? undefined : (exception as any)?.stack,
    );

    const errorResponse: ApiErrorResponseDto = {
      timestamp: new Date().toISOString(),
      path: request.url,
      statusCode: status,
      error,
      message: normalizedMessage,
      requestId,
      // Solo en desarrollo incluimos detalles acotados útiles para debug
      details: isProd
        ? undefined
        : {
            method: request.method,
            bodyKeys: Object.keys(request.body ?? {}),
            // Evitar exponer headers completos (pueden tener tokens)
            headerKeys: Object.keys(request.headers ?? {}),
          },
    };

    response.status(status).json(errorResponse);
  }
}
