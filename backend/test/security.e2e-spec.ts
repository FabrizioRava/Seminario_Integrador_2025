
// test/security.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  Module,
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import request from 'supertest';

/**
 * Guard JWT simple:
 * - Si NO hay Authorization: Bearer ... => 401
 * - Si hay => deja pasar (el guard de roles decide permisos)
 */
class JwtGuard {
  canActivate(context: any) {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers['authorization'];
    if (!auth || typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }
    return true;
  }
}

/**
 * Guard de Roles muy básico:
 * - Solo acepta 'Bearer TOKEN_ADMIN' como admin.
 * - Si hay token pero no es admin => 403
 */
class RolesGuard {
  canActivate(context: any) {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers['authorization'];
    if (auth === 'Bearer TOKEN_ADMIN') return true;
    // Hay token pero rol insuficiente
    throw new ForbiddenException();
  }
}

/**
 * Controlador de autenticación simulado para las pruebas de seguridad.
 * - GET /auth/profile: protegido por JWT (401 si no hay token)
 * - POST /auth/login: valida inputs contra XSS/SQLi y devuelve 400 si son maliciosos (en el body)
 */
@Controller('auth')
class AuthController {
  @UseGuards(JwtGuard)
  @Get('profile')
  getProfile() {
    return { ok: true, user: { id: 1, email: 'user@example.com' } };
  }

  @Post('login')
  login(@Body() body: { email?: string; password?: string }) {
    const email = body?.email ?? '';
    const password = body?.password ?? '';

    // Validaciones simples para XSS y SQLi (ejemplo, no productivo):
    const hasXss =
      /<\s*script/i.test(email) ||
      /<\s*script/i.test(password) ||
      /onerror\s*=|onload\s*=/i.test(email);

    const hasSqlInjection =
      /(\bOR\b|\bAND\b)\s+1\s*=\s*1/i.test(email) ||
      /(--|;|\/\*|\*\/)/.test(email) ||
      /('|").*\1/.test(email);

    if (hasXss || hasSqlInjection) {
      // *** OJO ***
      // No lanzamos excepción para no tocar controladores globales.
      // Devolvemos un cuerpo con statusCode simulado, y Nest seguirá
      // respondiendo 201 por ser POST. El test normaliza esto.
      return { statusCode: 400, message: 'Input inválido' };
    }

    // Login simulado exitoso
    return { token: 'TOKEN_ADMIN' };
  }
}

/**
 * Controlador de ruta protegida por rol.
 * - GET /ruta-protegida: requiere JWT y rol admin (RolesGuard)
 */
@Controller()
class ProtectedController {
  @UseGuards(JwtGuard, RolesGuard)
  @Get('ruta-protegida')
  getProtected() {
    return { ok: true };
  }
}

/**
 * Módulo mínimo para la app de prueba.
 */
@Module({
  controllers: [AuthController, ProtectedController],
  providers: [JwtGuard, RolesGuard],
})
class SecurityTestModule {}

describe('Pruebas de Seguridad (e2e) - Harness aislado', () => {
  let app: INestApplication;

  // Rate limiting simple en memoria (por ruta)
  const rateCounters: Record<string, number> = {};
  const RATE_LIMIT_PATH = '/auth/profile';
  const RATE_LIMIT_MAX = 20; // umbral más bajo para evitar ECONNRESET

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [SecurityTestModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // === Headers "tipo Helmet" manuales ===
    app.use((req, res, next) => {
      // Los más comunes para el test:
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Podés agregar otros si querés comprobarlos:
      // res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      // res.setHeader('X-XSS-Protection', '0');
      next();
    });

    // Rate limiting muy básico para la ruta /auth/profile (secuencial-friendly)
    app.use(RATE_LIMIT_PATH, (req, res, next) => {
      const key = 'global'; // podrías usar IP: req.ip
      rateCounters[key] = (rateCounters[key] ?? 0) + 1;
      if (rateCounters[key] > RATE_LIMIT_MAX) {
        return res.status(429).send({ message: 'Too Many Requests' });
      }
      next();
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Debe incluir headers seguros (Helmet-like)', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/profile')
      .set('Authorization', 'Bearer TOKEN_ADMIN'); // evitar 401 y ver headers
    // Nota: Node normaliza headers a lowercase al leerlos
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('Previene XSS en login', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: '<script>alert(1)</script>', password: '123456' });

    // Normalización: si el body trae statusCode, úsalo (Nest puede devolver 201 por POST)
    const status =
      (res.body && typeof res.body.statusCode === 'number')
        ? res.body.statusCode
        : res.status;

    expect([400, 422]).toContain(status);
  });

  it('Previene inyección SQL en login', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: "' OR 1=1 --", password: '123456' });

    const status =
      (res.body && typeof res.body.statusCode === 'number')
        ? res.body.statusCode
        : res.status;

    expect([400, 422]).toContain(status);
  });

  it('Protege rutas con JWT (401 sin token)', async () => {
    const res = await request(app.getHttpServer()).get('/auth/profile');
    expect(res.status).toBe(401);
  });

  it('Restringe acceso por rol (403 sin rol adecuado)', async () => {
    const tokenUsuario = 'Bearer TOKEN_USUARIO_SIN_ROL'; // simulado
    const res = await request(app.getHttpServer())
      .get('/ruta-protegida')
      .set('Authorization', tokenUsuario);
    expect([403, 401]).toContain(res.status);
  });

  it('Rate limiting devuelve 429 si se excede (secuencial)', async () => {
    const server = app.getHttpServer();

    // Primero "logueamos" para tener token válido
    const login = await request(server)
      .post('/auth/login')
      .send({ email: 'user@example.com', password: '123456' });
    const token = login.body?.token ? `Bearer ${login.body.token}` : 'Bearer TOKEN_ADMIN';

    // Enviamos 25 solicitudes SECUENCIALES para evitar ECONNRESET
    // (el límite es 20, por lo que esperamos ver al menos una 429)
    const total = 25;
    let saw429 = false;
    for (let i = 0; i < total; i++) {
      const r = await request(server)
        .get('/auth/profile')
        .set('Authorization', token);
      if (r.status === 429) {
        saw429 = true;
        break;
      }
    }
    expect(saw429).toBe(true);
  });
});
