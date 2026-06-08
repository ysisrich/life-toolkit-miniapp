import { WinstonModule, utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

export const createWinstonLogger = () => {
  const maxFiles = process.env.LOG_MAX_FILES || '14d';
  const maxSize = process.env.LOG_MAX_SIZE || '10m';

  return WinstonModule.createLogger({
    transports: [
      // 控制台输出
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.ms(),
          nestWinstonModuleUtilities.format.nestLike('Nest', {
            colors: true,
            appName: true,
          }),
        ),
      }),
      // 按天轮转的文件日志
      new winston.transports.DailyRotateFile({
        filename: 'logs/%DATE%/console_%DATE%.txt', // 按天生成文件夹和文件
        auditFile: 'logs/winston-audit.json', // 统一管理 audit 文件，避免生成 literal %DATE% 文件夹
        datePattern: 'YYYY-MM-DD',
        maxSize: maxSize,
        maxFiles: maxFiles,
        format: winston.format.combine(
          winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss',
          }),
          winston.format.printf((info) => {
            return `[${info.timestamp}] [${info.context || 'App'}] ${info.level}: ${info.message}`;
          }),
        ),
      }),
    ],
  });
};
