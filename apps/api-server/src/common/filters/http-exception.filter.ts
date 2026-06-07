import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse: any = exception.getResponse();

    const msg = typeof exceptionResponse === 'string' ? exceptionResponse : exceptionResponse.message || exception.message;

    response
      .status(status)
      .json({
        code: status,
        msg: Array.isArray(msg) ? msg[0] : msg,
        data: null,
      });
  }
}
