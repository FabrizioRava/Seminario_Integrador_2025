
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import * as helmet from 'helmet';
import * as hpp from 'hpp';
import * as rateLimit from 'express-rate-limit';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

  app.use(helmet());
  app.use(hpp());
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  app.useGlobalFilters(new AllExceptionsFilter());

  if (process.env.NODE_ENV !== 'production') {
    const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');

    const config = new DocumentBuilder()
      .setTitle('Sistema de Autogestión Académica')
      .setDescription('API para gestión académica de estudiantes')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);

    const redocConfig = new DocumentBuilder()
      .setTitle('Sistema de Autogestión Académica')
      .setDescription('API para gestión académica de estudiantes')
      .setVersion('1.0')
      .build();

    const redocDocument = SwaggerModule.createDocument(app, redocConfig);
    SwaggerModule.setup('redoc', app, redocDocument, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }'
    });
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
