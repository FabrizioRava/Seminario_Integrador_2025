import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inscripcion } from './entities/inscripcion.entity';
import { User } from '../user/entities/user.entity';
import { Materia } from '../materia/entities/materia.entity';
import { Comision } from '../comision/entities/comision.entity';
import { Departamento } from '../departamento/entities/departamento.entity';
import { CorrelativasService } from '../correlativas/correlativas.service';
import { InscripcionResponseDto } from './dto/inscripcion-response.dto';

export interface MateriaDisponible {
  id: number;
  nombre: string;
  descripcion: string;
  comisiones: Array<{
    id: number;
    nombre: string;
    cupoMaximo: number;
    cupoDisponible: number;
    docente: { nombre: string; apellido: string; } | null;
    horarios: Array<{
      dia: string;
      horaInicio: string;
      horaFin: string;
      aula: string;
    }>;
  }>;
}

@Injectable()
export class InscripcionService {
  constructor(
    @InjectRepository(Inscripcion) private inscripcionRepo: Repository<Inscripcion>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Materia) private materiaRepo: Repository<Materia>,
    @InjectRepository(Comision) private comisionRepo: Repository<Comision>,
    @InjectRepository(Departamento) private departamentoRepo: Repository<Departamento>,
    private correlativasService: CorrelativasService,
  ) {}

  // Obtener inscripciones activas de un estudiante
  async getInscripcionesPorEstudiante(estudianteId: number) {
    return this.inscripcionRepo.find({
      where: { 
        estudiante: { id: estudianteId },
        stc: 'cursando' // Solo devolver inscripciones activas
      },
      relations: ['materia', 'comision', 'comision.horarios', 'comision.profesor']
    });
  }

  // Inscribirse a una materia
  async inscribirse(userId: number, materiaId: number, comisionId: number): Promise<InscripcionResponseDto> {
    // Verificar si el estudiante ya está inscripto en esta materia
    const inscripcionExistente = await this.inscripcionRepo.findOne({
      where: {
        estudiante: { id: userId },
        materia: { id: materiaId },
        stc: 'cursando' // Solo verificar inscripciones activas
      }
    });

    if (inscripcionExistente) {
      throw new BadRequestException('Ya estás inscripto a esta materia');
    }

    const estudiante = await this.userRepo.findOne({ where: { id: userId } });
    const materia = await this.materiaRepo.findOne({ 
      where: { id: materiaId },
      relations: ['comisiones', 'departamento', 'relacionesConPlanes.planEstudio.carrera']
    });

    if (!estudiante || !materia) {
      throw new BadRequestException('Estudiante o materia no encontrados');
    }

    // Validación de departamento: la materia debe ser del departamento del estudiante o "Básicas"
    const basicas = await this.departamentoRepo.findOne({ where: { nombre: 'Básicas' } });
    const materiaInfo = await this.materiaRepo
      .createQueryBuilder('materia')
      .leftJoinAndSelect('materia.departamento', 'departamento')
      .leftJoinAndSelect('materia.relacionesConPlanes', 'relacion')
      .leftJoinAndSelect('relacion.planEstudio', 'plan')
      .leftJoinAndSelect('plan.carrera', 'carrera')
      .where('materia.id = :materiaId', { materiaId })
      .getOne();

    const perteneceACarrera = !!materiaInfo?.relacionesConPlanes?.some(r => r.planEstudio?.carrera?.id === (estudiante as any)?.planEstudio?.carrera?.id);
    const esBasicas = materiaInfo?.departamento?.id === basicas?.id;
    if (!perteneceACarrera && !esBasicas) {
      throw new BadRequestException('No puedes inscribirte a esta materia. No pertenece a tu departamento.');
    }

    const correlativas = await this.correlativasService.verificarCorrelativasCursada(userId, materiaId);
    if (!correlativas.cumple) {
      const faltantes = correlativas.faltantes.map(m => m.nombre).join(', ');
      throw new BadRequestException(`Faltan correlativas de cursada: ${faltantes}`);
    }

    let comision: Comision | undefined;
    if (comisionId) {
      comision = (await this.comisionRepo.findOne({ where: { id: comisionId }, relations: ['inscripciones'] })) || undefined;
      if (!comision) throw new BadRequestException('Comisión no encontrada');
      if (comision.inscripciones.length >= comision.cupoMaximo) {
        throw new BadRequestException('La comisión está llena');
      }
    }

    const inscripcion = this.inscripcionRepo.create({
      estudiante,
      materia,
      comision: comision ? ({ id: (comision as any).id } as any) : undefined,
      stc: 'cursando',
    });

    const saved = await this.inscripcionRepo.save(inscripcion);
    return this.mapToResponseDto(saved);
  }

  // Ver materias disponibles para inscripción
  async materiasDisponibles(estudianteId: number): Promise<MateriaDisponible[]> {
    const estudiante = await this.userRepo.findOne({
      where: { id: estudianteId },
      relations: ['planEstudio'],
    });

    if (!estudiante?.planEstudio) {
      throw new BadRequestException('Estudiante sin plan de estudios');
    }

    const materiasDelPlan = await this.materiaRepo
      .createQueryBuilder('materia')
      .innerJoin('materia.relacionesConPlanes', 'relacion', 'relacion.planEstudioId = :planId', {
        planId: estudiante.planEstudio.id,
      })
      .getMany();

    const inscripciones = await this.inscripcionRepo.find({
      where: { estudiante: { id: estudianteId } },
      relations: ['materia'],
    });

    const materiasYaInscritas = inscripciones
      .filter(i => ['cursando', 'aprobada'].includes(i.stc))
      .map(i => i.materia.id);

    // Filtrar materias disponibles y cargar sus comisiones
    const disponibles: MateriaDisponible[] = [];
    
    for (const m of materiasDelPlan) {
      if (!materiasYaInscritas.includes(m.id)) {
        // Cargar las comisiones activas para esta materia
        const comisiones = await this.comisionRepo.find({
          where: { materia: { id: m.id } },
          relations: ['horarios', 'profesor'],
          order: { nombre: 'ASC' }
        });

        disponibles.push({
          id: m.id,
          nombre: m.nombre,
          descripcion: m.descripcion || '',
          comisiones: comisiones.map(c => ({
            id: c.id,
            nombre: c.nombre,
            cupoMaximo: c.cupoMaximo,
            cupoDisponible: c.cupoMaximo - (c.inscripciones?.length || 0),
            docente: c.profesor ? {
              nombre: c.profesor.nombre,
              apellido: c.profesor.apellido
            } : null,
            horarios: c.horarios?.map(h => ({
              dia: h.dia,
              horaInicio: h.horaInicio,
              horaFin: h.horaFin,
              aula: h.aula || ''
            })) || []
          }))
        });
      }
    }

    return disponibles;
  }

  // Ver detalle de una inscripción propia
  async detalleMateria(inscripcionId: number, userId: number): Promise<InscripcionResponseDto> {
    const qb = this.inscripcionRepo.createQueryBuilder('inscripcion')
      .leftJoinAndSelect('inscripcion.estudiante', 'estudiante')
      .leftJoinAndSelect('inscripcion.materia', 'materia')
      .leftJoinAndSelect('inscripcion.comision', 'comision')
      .where('inscripcion.id = :inscripcionId', { inscripcionId })
      .andWhere('estudiante.id = :userId', { userId })
      .select([
        'inscripcion.id',
        'inscripcion.faltas',
        'inscripcion.notaFinal',
        'inscripcion.stc',
        'inscripcion.fechaInscripcion',
        'inscripcion.fechaFinalizacion',
        'estudiante.id', 'estudiante.nombre', 'estudiante.apellido', 'estudiante.legajo',
        'materia.id', 'materia.nombre',
        'comision.id', 'comision.nombre',
      ]);

    const inscripcion = await qb.getOne();

    if (!inscripcion) {
      throw new BadRequestException('Inscripción no encontrada o no te pertenece');
    }

    return this.mapToResponseDto(inscripcion);
  }

  // Mapea una inscripción a su DTO de respuesta
  private mapToResponseDto(inscripcion: Inscripcion): InscripcionResponseDto {
    return {
      id: inscripcion.id,
      estudiante: {
        id: inscripcion.estudiante.id,
        nombre: inscripcion.estudiante.nombre,
        apellido: inscripcion.estudiante.apellido,
        legajo: inscripcion.estudiante.legajo,
      },
      materia: {
        id: inscripcion.materia.id,
        nombre: inscripcion.materia.nombre,
      },
      comision: inscripcion.comision
        ? {
            id: inscripcion.comision.id,
            nombre: inscripcion.comision.nombre,
          }
        : undefined,
      fechaInscripcion: inscripcion.fechaInscripcion,
      faltas: (inscripcion as any).faltas,
      notaFinal: (inscripcion as any).notaFinal,
      stc: (inscripcion as any).stc,
      fechaFinalizacion: (inscripcion as any).fechaFinalizacion,
    } as any;
  }

  // Métodos adicionales requeridos por EstadoAcademicoService
  async materiasDelEstudiante(userId: number) {
    const qb = this.inscripcionRepo.createQueryBuilder('inscripcion')
      .leftJoinAndSelect('inscripcion.estudiante', 'estudiante')
      .leftJoinAndSelect('inscripcion.materia', 'materia')
      .leftJoinAndSelect('inscripcion.comision', 'comision')
      .where('estudiante.id = :userId', { userId })
      .andWhere('inscripcion.stc = :stc', { stc: 'cursando' })
      .select([
        'inscripcion.id',
        'inscripcion.faltas',
        'inscripcion.notaFinal',
        'inscripcion.stc',
        'inscripcion.fechaInscripcion',
        'inscripcion.fechaFinalizacion',
        'estudiante.id', 'estudiante.nombre', 'estudiante.apellido', 'estudiante.legajo',
        'materia.id', 'materia.nombre',
        'comision.id', 'comision.nombre',
      ])
      .orderBy('inscripcion.fechaInscripcion', 'DESC');

    const inscripciones = await qb.getMany();
    return inscripciones.map(i => this.mapToResponseDto(i));
  }

  async historialAcademico(userId: number) {
    const qb = this.inscripcionRepo.createQueryBuilder('inscripcion')
      .leftJoinAndSelect('inscripcion.estudiante', 'estudiante')
      .leftJoinAndSelect('inscripcion.materia', 'materia')
      .leftJoinAndSelect('inscripcion.comision', 'comision')
      .where('estudiante.id = :userId', { userId })
      .select([
        'inscripcion.id',
        'inscripcion.faltas',
        'inscripcion.notaFinal',
        'inscripcion.stc',
        'inscripcion.fechaInscripcion',
        'inscripcion.fechaFinalizacion',
        'estudiante.id', 'estudiante.nombre', 'estudiante.apellido', 'estudiante.legajo',
        'materia.id', 'materia.nombre',
        'comision.id', 'comision.nombre',
      ])
      .orderBy('inscripcion.fechaInscripcion', 'DESC');

    const inscripciones = await qb.getMany();
    return inscripciones.map(i => this.mapToResponseDto(i));
  }

  async findInscripcionCompleta(inscripcionId: number) {
    return this.inscripcionRepo.findOne({
      where: { id: inscripcionId },
      relations: ['materia', 'comision', 'estudiante', 'evaluaciones'],
    });
  }

  // Métodos legacy para compatibilidad con tests
  async cargarFaltas(inscripcionId: number, faltas: number, profesorId: number): Promise<InscripcionResponseDto> {
    const qb = this.inscripcionRepo.createQueryBuilder('inscripcion')
      .leftJoinAndSelect('inscripcion.estudiante', 'estudiante')
      .leftJoinAndSelect('inscripcion.materia', 'materia')
      .leftJoinAndSelect('inscripcion.comision', 'comision')
      .where('inscripcion.id = :inscripcionId', { inscripcionId })
      .andWhere('profesor.id = :profesorId', { profesorId });
    const inscripcion = await qb.getOne();
    if (!inscripcion) {
      throw new BadRequestException('Inscripción no encontrada o no eres docente de esta materia');
    }
    (inscripcion as any).faltas = faltas;
    const saved = await this.inscripcionRepo.save(inscripcion);
    return this.mapToResponseDto(saved);
  }

  async cargarNota(inscripcionId: number, notaFinal: number, stc: string, profesorId: number): Promise<InscripcionResponseDto> {
    const qb = this.inscripcionRepo.createQueryBuilder('inscripcion')
      .leftJoinAndSelect('inscripcion.estudiante', 'estudiante')
      .leftJoinAndSelect('inscripcion.materia', 'materia')
      .leftJoinAndSelect('inscripcion.comision', 'comision')
      .where('inscripcion.id = :inscripcionId', { inscripcionId })
      .andWhere('profesor.id = :profesorId', { profesorId });
    const inscripcion = await qb.getOne();
    if (!inscripcion) {
      throw new BadRequestException('Inscripción no encontrada o no eres docente de esta materia');
    }
    (inscripcion as any).notaFinal = notaFinal;
    (inscripcion as any).stc = stc;
    const saved = await this.inscripcionRepo.save(inscripcion);
    return this.mapToResponseDto(saved);
  }

  async obtenerCursadasMateria(materiaId: number, userId: number): Promise<InscripcionResponseDto[]> {
    const qb = this.inscripcionRepo.createQueryBuilder('inscripcion')
      .leftJoinAndSelect('inscripcion.estudiante', 'estudiante')
      .leftJoinAndSelect('inscripcion.materia', 'materia')
      .leftJoinAndSelect('inscripcion.comision', 'comision')
      .where('materia.id = :materiaId', { materiaId })
      .andWhere('estudiante.id = :userId', { userId })
      .orderBy('inscripcion.fechaInscripcion', 'DESC');
    const inscripciones = await qb.getMany();
    return inscripciones.map(i => this.mapToResponseDto(i));
  }
}
