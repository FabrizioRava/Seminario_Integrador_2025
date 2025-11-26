
import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { UserRole } from '../user/entities/user.entity';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { UserResponseDto } from '../user/dto/user-response.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  async register(userData: CreateUserDto): Promise<UserResponseDto> {
    if (!userData.password) {
      throw new BadRequestException('La contraseña es obligatoria');
    }
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const rol: UserRole = userData.rol || UserRole.ESTUDIANTE;
    return this.userService.create({
      ...userData,
      password: hashedPassword,
      rol,
    });
  }

  async login(identifier: string, password: string): Promise<{ access_token: string; user: UserResponseDto }> {
    if (!identifier || !password) {
      throw new BadRequestException('Se requieren el correo/legajo y la contraseña');
    }

    let user = await this.userService.findByLegajoWithPassword(identifier);
    if (!user) {
      user = await this.userService.findByEmailWithPassword(identifier);
    }
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const fullUser = await this.userService.findById(user.id);
    if (!fullUser) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      rol: fullUser.rol,
      legajo: user.legajo,
    };

    const access_token = this.jwtService.sign(payload, { expiresIn: '1h' });

    const userResponse: UserResponseDto = {
      id: fullUser.id,
      email: fullUser.email,
      nombre: fullUser.nombre,
      apellido: fullUser.apellido,
      legajo: fullUser.legajo,
      rol: fullUser.rol,
      planEstudio: fullUser.planEstudio,
    };

    return { access_token, user: userResponse };
  }
}
