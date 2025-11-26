
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Pruebas de Seguridad (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Debe incluir headers seguros (Helmet)', async () => {
    const res = await request(app.getHttpServer()).get('/auth/profile');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('Previene XSS en login', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: '<script>alert(1)</script>', password: '123456' });
    expect([400, 422]).toContain(res.status);
  });

  it('Previene inyección SQL en login', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: "' OR 1=1 --", password: '123456' });
    expect([400, 422]).toContain(res.status);
  });

  it('Protege rutas con JWT (401 sin token)', async () => {
    const res = await request(app.getHttpServer()).get('/auth/profile');
    expect(res.status).toBe(401);
  });

  it('Restringe acceso por rol (403 sin rol adecuado)', async () => {
    const tokenUsuario = 'Bearer TOKEN_USUARIO_SIN_ROL'; // simulado
    const res = await request(app.getHttpServer())
      .get('/ruta-protegida') // ajusta a una ruta con @Roles()
      .set('Authorization', tokenUsuario);
    expect([403, 401]).toContain(res.status);
  });

  it('Rate limiting devuelve 429 si se excede', async () => {
    const server = app.getHttpServer();
    const requests = Array.from({ length: 110 }, () => request(server).get('/auth/profile'));
    const results = await Promise.all(requests);
    const has429 = results.some(r => r.status === 429);
    expect(has429).toBe(true);
  });
});
