import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import hpp from 'hpp';
import mongoSanitize from 'express-mongo-sanitize';
import { AppModule } from './app.module';

/**
 * express-mongo-sanitize's default middleware assigns `req.query`, which throws on
 * Express 5 (`req.query` is a read-only getter). We sanitize body/params/headers only;
 * query strings are covered by Nest ValidationPipe on DTOs.
 */
function mongoSanitizeCompatibleWithExpress5(
  options: Parameters<typeof mongoSanitize>[0] = {},
) {
  type MutableRequestSections = {
    body?: unknown;
    params?: Record<string, unknown>;
    headers?: Record<string, unknown>;
  };
  const isSanitizable = (
    value: unknown,
  ): value is Record<string, unknown> | unknown[] =>
    typeof value === 'object' && value !== null;

  return (
    req: Parameters<ReturnType<typeof mongoSanitize>>[0],
    _res: Parameters<ReturnType<typeof mongoSanitize>>[1],
    next: Parameters<ReturnType<typeof mongoSanitize>>[2],
  ) => {
    const mutableReq = req as MutableRequestSections;

    if (isSanitizable(mutableReq.body)) {
      mutableReq.body = mongoSanitize.sanitize(
        mutableReq.body,
        options,
      ) as unknown;
    }
    if (mutableReq.params && Object.keys(mutableReq.params).length > 0) {
      mutableReq.params = mongoSanitize.sanitize(mutableReq.params, options);
    }
    if (mutableReq.headers) {
      mutableReq.headers = mongoSanitize.sanitize(mutableReq.headers, options);
    }
    next();
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.use(hpp());
  app.use(mongoSanitizeCompatibleWithExpress5());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
