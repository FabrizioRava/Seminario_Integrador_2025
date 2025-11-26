
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterTestDto {
  @IsString()
  nombre: string;

  @IsString()
  apellido: string;

  @IsEmail()
  email: string;

  @IsString()
  legajo: string;

  @IsString()
  @MinLength(6)
  password: string;
}
