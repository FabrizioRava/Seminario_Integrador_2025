import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';

// Cargar variables de entorno desde la raíz del proyecto
config({ path: path.resolve(__dirname, '../../../.env') });

const configService = new ConfigService();

export const typeOrmConfig: DataSourceOptions = {
  type: 'postgres',
  host: configService.get<string>('DB_HOST', 'localhost'),
  port: configService.get<number>('DB_PORT', 5434),
  username: configService.get<string>('DB_USERNAME', 'postgres'),
  password: configService.get<string>('DB_PASSWORD', 'testpass'),
  database: configService.get<string>('DB_NAME', 'autogestion'),
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: configService.get<boolean>('DB_SYNCHRONIZE', false),
  migrationsRun: false,
  logging: configService.get<boolean>('DB_LOGGING', false),
};

const dataSource = new DataSource(typeOrmConfig);
export default dataSource;
