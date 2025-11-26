
// src/examen/examen.service.ts
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ExamenFinal } from './entities/examen.entity';
import { Materia } from '../materia/entities/materia.entity';
import { User } from '../user/entities/user.entity';
import { Inscripcion } from '../inscripcion/entities/inscripcion.entity';

interface CorrelativaFaltante {
  id: number;
  nombre: string;
}

// Estados permitidos; evita valores arbitrarios desde el cliente.
const ESTADOS_PERMITIDOS = new Set<('inscripto' | 'aprobado' | 'desaprobado' | 'ausente')>([
  'inscripto',
  'aprobado',
  'desaprobado',
  'ausente',
]);

@Injectable()
export class ExamenService {
  constructor(
    @InjectRepository(ExamenFinal)
    private readonly examenRepo: Repository<ExamenFinal>,
    @InjectRepository(Materia)
    private readonly materiaRepo: Repository<Materia>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Inscripcion)
    private readonly inscripcionRepo: Repository<Inscripcion>,
  ) {}

  /**
   * Verifica correlativas del final de manera robusta.
   * Devuelve faltantes con id y nombre. Evita N+1 con consulta In() si es posible.
   */
  private async verificarCorrelativasFinal(
    estudianteId: number,
    materiaId: number,
  ): Promise<{ cumple: boolean; faltantes: CorrelativaFaltante[] }> {
    if (!Number.isInteger(estudianteId) || !Number.isInteger(materiaId)) {
      throw new BadRequestException('Parámetros inválidos');
    }

    const [estudiante, materia] = await Promise.all([
      this.userRepo.findOne({ where: { id: estudianteId } }),
      this.materiaRepo.findOne({
        where: { id: materiaId },
        relations: ['correlativasFinal'],
      }),
    ]);

    if (!estudiante || !materia) {
      throw new BadRequestException('Estudiante o materia no encontrados');
    }

    const correlativas = materia.correlativasFinal ?? [];
    if (correlativas.length === 0) {
      return { cumple: true, faltantes: [] };
    }

    const correlativaIds = correlativas.map((c) => c.id);

    // Buscar todas las inscripciones a correlativas en una sola query
    const inscripciones = await this.inscripcionRepo.find({
      where: {
        estudiante: { id: estudianteId },
        materia: { id: In(correlativaIds) },
      },
      relations: ['materia'],
    });

    const aprobadasPorId = new Set(
      inscripciones
        .filter((i) => i.stc === 'aprobada' /* ajustar si el campo/valor difiere */)
        .map((i) => i.materia.id),
    );

    const faltantes: CorrelativaFaltante[] = [];
    for (const correlativa of correlativas) {
      if (!aprobadasPorId.has(correlativa.id)) {
        faltantes.push({ id: correlativa.id, nombre: correlativa.nombre });
      }
    }

    return { cumple: faltantes.length === 0, faltantes };
  }

  /**
   * Inscripción a examen final con validaciones:
   * - No duplicar inscripción
   * - Correlativas completas
   * - Estado inicial seguro
   */
  async inscribirse(userId: number, materiaId: number): Promise<ExamenFinal> {
    if (!Number.isInteger(userId) || !Number.isInteger(materiaId)) {
      throw new BadRequestException('Parámetros inválidos');
    }

    const estudiante = await this.userRepo.findOne({ where: { id: userId } });
    const materia = await this.materiaRepo.findOne({ where: { id: materiaId } });

    if (!estudiante || !materia) {
      throw new BadRequestException('Estudiante o materia no encontrados');
    }

    const yaInscripto = await this.examenRepo.findOne({
      where: { estudiante: { id: estudiante.id }, materia: { id: materia.id } },
    });
    if (yaInscripto) {
      throw new BadRequestException('Ya estás inscripto al examen final de esta materia');
    }

    const { cumple, faltantes } = await this.verificarCorrelativasFinal(userId, materiaId);
    if (!cumple) {
      const materiasFaltantes = faltantes.map((m) => m.nombre).join(', ');
      throw new BadRequestException(
        `No puedes rendir el final. Faltan correlativas: ${materiasFaltantes}`,
      );
    }

    const examen = this.examenRepo.create({
      estudiante,
      materia,
      estado: 'inscripto',
      nota: null,
    });
    return this.examenRepo.save(examen);
  }

  /**
   * Chequeo de jefe de cátedra para un examen dado.
   */
  async esJefeDeCatedra(userId: number, examenId: number): Promise<boolean> {
    if (!Number.isInteger(userId) || !Number.isInteger(examenId)) return false;

    const examen = await this.examenRepo.findOne({
      where: { id: examenId },
      relations: ['materia', 'materia.jefeCatedra'],
      select: {
        id: true,
        materia: { id: true, jefeCatedra: { id: true } },
      } as any,
    });

    return examen ? examen.materia.jefeCatedra?.id === userId : false;
  }

  /**
   * Lógica de autorización centralizada para el guard.
   * Lanza 404 si el examen no existe, 403 si no es jefe de cátedra.
   */
  async assertJefeDeCatedra(userId: number, examenId: number): Promise<void> {
    if (!Number.isInteger(userId) || !Number.isInteger(examenId)) {
      throw new BadRequestException('Parámetros inválidos');
    }

    const examen = await this.examenRepo.findOne({
      where: { id: examenId },
      relations: ['materia', 'materia.jefeCatedra'],
    });

    if (!examen) {
      throw new NotFoundException('Examen no encontrado');
    }

    if (examen.materia.jefeCatedra?.id !== userId) {
      throw new ForbiddenException('No tienes permisos para esta operación');
    }
  }

  /**
   * Carga de nota asegurando:
   * - Usuario autorizado (jefe de cátedra de la materia del examen).
   * - Nota válida [0..10].
   * - Estado permitido.
   * - Persistencia consistente.
   */
  async cargarNota(
    userId: number,
    examenId: number,
    nota: number,
    estado: 'aprobado' | 'desaprobado' | 'ausente',
  ): Promise<ExamenFinal> {
    if (!Number.isInteger(examenId) || !Number.isFinite(nota) || nota < 0 || nota > 10) {
      throw new BadRequestException('Datos inválidos: examenId/nota');
    }

    if (!ESTADOS_PERMITIDOS.has(estado) || estado === 'inscripto') {
      throw new BadRequestException('Estado inválido');
    }

    // Autorización centralizada
    await this.assertJefeDeCatedra(userId, examenId);

    const examen = await this.examenRepo.findOne({
      where: { id: examenId },
      relations: ['materia', 'estudiante'],
    });

    if (!examen) throw new NotFoundException('Examen no encontrado');

    examen.nota = nota;
    examen.estado = estado;
    return this.examenRepo.save(examen);
  }

  /**
   * Listado para el estudiante: solo campos necesarios y ordenado.
   */
  async verExamenes(userId: number): Promise<ExamenFinal[]> {
    if (!Number.isInteger(userId)) throw new BadRequestException('ID inválido');

    return this.examenRepo.find({
      where: { estudiante: { id: userId } },
      relations: ['materia'],
      // Evitamos exponer PII del estudiante. La materia se devuelve con lo básico.
      select: ['id', 'estado', 'nota', 'createdAt', 'updatedAt'] as any,
      order: { id: 'DESC' },
    });
  }
}
