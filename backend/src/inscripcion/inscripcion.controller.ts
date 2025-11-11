import { Controller, Get, Post, Param, UseGuards, Request, UsePipes, ValidationPipe, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../user/entities/user.entity';
import { InscripcionService } from './inscripcion.service';
import { InscripcionResponseDto } from './dto/inscripcion-response.dto';
import { ApiErrorResponseDto } from '../common/dto/api-error-response.dto';

@ApiTags('Inscripciones')
@Controller('inscripcion')
@UsePipes(new ValidationPipe({ whitelist: true }))
export class InscripcionController {
  constructor(private inscripcionService: InscripcionService) {}

  // Ver materias disponibles para inscripción
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ESTUDIANTE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ver materias disponibles para inscripción' })
  @ApiResponse({ status: 200, description: 'Materias disponibles', type: [Object] })
  @ApiResponse({ status: 401, description: 'No autorizado', type: ApiErrorResponseDto })
  @Get('materia/disponibles')
  async materiasDisponibles(@Request() req) {
    return this.inscripcionService.materiasDisponibles(req.user.userId);
  }

  // Inscribirse a una materia
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ESTUDIANTE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Inscribirse a una materia' })
  @ApiParam({ name: 'materiaId', type: Number })
  @ApiResponse({ status: 201, description: 'Inscripción creada', type: InscripcionResponseDto })
  @ApiResponse({ status: 400, description: 'Datos inválidos o correlativas faltantes', type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, description: 'No autorizado', type: ApiErrorResponseDto })
  @Post('materia/:materiaId')
  @ApiParam({ name: 'materiaId', type: Number })
  @ApiBody({ 
    schema: {
      type: 'object',
      properties: {
        comisionId: { type: 'number' }
      },
      required: ['comisionId']
    }
  })
  async inscribirse(
    @Request() req, 
    @Param('materiaId') materiaId: string,
    @Body() body: { comisionId: number }
  ) {
    return this.inscripcionService.inscribirse(req.user.userId, +materiaId, body.comisionId);
  }

  @Get('mis-inscripciones')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ESTUDIANTE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener las inscripciones activas del estudiante' })
  @ApiResponse({ status: 200, description: 'Lista de inscripciones activas', type: [InscripcionResponseDto] })
  async getMisInscripciones(@Request() req) {
    return this.inscripcionService.getInscripcionesPorEstudiante(req.user.userId);
  }

  // Ver detalle de una inscripción propia
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ESTUDIANTE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ver detalle de una inscripción propia' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Detalle de inscripción', type: InscripcionResponseDto })
  @ApiResponse({ status: 400, description: 'Inscripción no encontrada o no pertenece al usuario', type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, description: 'No autorizado', type: ApiErrorResponseDto })
  @Get(':id')
  async detalleMateria(@Param('id') id: string, @Request() req) {
    return this.inscripcionService.detalleMateria(+id, req.user.userId);
  }
}
