
import { Injectable, CanActivate, ExecutionContext, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ExamenService } from '../examen/examen.service';

@Injectable()
export class JefeDeCatedraGuard implements CanActivate {
  constructor(private readonly examenService: ExamenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const examenId = parseInt(request.params.examenId, 10);

    if (!user) throw new ForbiddenException('No autenticado');
    if (!examenId || Number.isNaN(examenId)) throw new BadRequestException('examenId inválido');

    if (user.rol !== 'profesor') {
      throw new ForbiddenException('Solo profesores pueden acceder');
    }

    const esJefe = await this.examenService.esJefeDeCatedra(user.userId ?? user.id, examenId);
    if (!esJefe) {
      throw new ForbiddenException('No eres jefe de cátedra de esta materia');
    }

    return true;
  }
}
