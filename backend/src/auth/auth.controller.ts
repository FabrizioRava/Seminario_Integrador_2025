
import { Controller, Post, Body, UseGuards, Get, Request, UsePipes } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SanitizePipe } from '../common/pipes/sanitize.pipe';
import { LoginDto } from './dto/login.dto';
import { RegisterTestDto } from './dto/register-test.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UsePipes(SanitizePipe)
  async login(@Body() loginDto: LoginDto) {
    if (!loginDto.legajo && !loginDto.email) {
      return { error: 'Se requiere email o legajo' };
    }
    const identifier = loginDto.email ?? loginDto.legajo!;
    const result = await this.authService.login(identifier, loginDto.password);
    if (!result) {
      return { error: 'Credenciales inválidas' };
    }
    return result;
  }

  @Post('register-test')
  @UsePipes(SanitizePipe)
  async registerTest(@Body() userDto: RegisterTestDto) {
    return {
      message: 'Usuario de prueba creado',
      user: {
        id: 1,
        nombre: userDto.nombre,
        apellido: userDto.apellido,
        email: userDto.email,
        legajo: userDto.legajo,
        rol: 'estudiante'
      },
      access_token: 'test-token-12345'
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  } } 
