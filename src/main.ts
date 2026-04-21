import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import hpp from 'hpp';
import mongoSanitize from 'express-mongo-sanitize';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.use(hpp());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const sanitizeTargets = ['body', 'params', 'headers', 'query'] as const;
    sanitizeTargets.forEach((key) => {
      const payload = (req as Record<string, unknown>)[key];
      if (payload && typeof payload === 'object') {
        mongoSanitize.sanitize(payload as Record<string, unknown>);
      }
    });
    next();
  });

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
