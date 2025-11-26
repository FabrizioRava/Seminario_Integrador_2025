import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';

async function seedMore() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ds = app.get(DataSource);
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    // Fetch base entities
    const estudiante = (await qr.query('SELECT id FROM "user" WHERE email=$1', ['estudiante@universidad.edu']))?.[0];
    const profesor = (await qr.query('SELECT id FROM "user" WHERE email=$1', ['profesor@universidad.edu']))?.[0];
    const plan = (await qr.query('SELECT id FROM "plan_estudio" WHERE nombre=$1', ['Plan 2025']))?.[0];
    const deptoBasicas = (await qr.query('SELECT id FROM "departamento" WHERE nombre=$1', ['Básicas']))?.[0];
    const deptoSistemas = (await qr.query('SELECT id FROM "departamento" WHERE nombre=$1', ['Sistemas']))?.[0];

    if (!estudiante || !profesor || !plan || !deptoBasicas || !deptoSistemas) {
      throw new Error('Faltan entidades base para el seed-more');
    }

    // Ensure Programación I materia
    let materiaProg = (await qr.query('SELECT id FROM "materia" WHERE nombre=$1', ['Programación I']))?.[0];
    if (!materiaProg) {
      // Crear la materia
      const res = await qr.query(
        'INSERT INTO "materia" (nombre, descripcion, "departamentoId") VALUES ($1,$2,$3) RETURNING id',
        ['Programación I', 'Algoritmos y estructuras básicas', deptoSistemas.id]
      );
      materiaProg = res[0];
    }
    
    // Asegurar que la materia esté en el plan de estudios
    const materiaEnPlan = (await qr.query(
      'SELECT 1 FROM "materia_planes_estudio" WHERE "materiaId" = $1 AND "planEstudioId" = $2',
      [materiaProg.id, plan.id]
    ))?.[0];
    
    if (!materiaEnPlan) {
      // Asociar la materia al plan de estudios
      await qr.query(
        'INSERT INTO "materia_planes_estudio" ("materiaId", "planEstudioId", "nivel") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [materiaProg.id, plan.id, 1]
      );
      
      // Verificar que la asociación se creó correctamente
      const asociacionCreada = (await qr.query(
        'SELECT 1 FROM "materia_planes_estudio" WHERE "materiaId" = $1 AND "planEstudioId" = $2',
        [materiaProg.id, plan.id]
      ))?.[0];
      
      if (!asociacionCreada) {
        throw new Error('No se pudo asociar la materia al plan de estudios');
      }
    }

    // Ensure comision for Programación I
    let comisionProg = (await qr.query('SELECT id FROM "comision" WHERE "materiaId"=$1 LIMIT 1', [materiaProg.id]))?.[0];
    if (!comisionProg) {
      const res = await qr.query(
        'INSERT INTO "comision" (nombre, descripcion, "materiaId", "profesorId", "cupoMaximo", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id',
        ['B', 'Comisión B', materiaProg.id, profesor.id, 30]
      );
      comisionProg = res[0];
    }

    // Ensure Horarios for Programación I
    await qr.query(
      'INSERT INTO "horario" (dia, "horaInicio", "horaFin", aula, "materiaId", "comisionId") VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
      ['martes', '10:00', '12:00', 'Lab 2', materiaProg.id, comisionProg.id]
    );
    await qr.query(
      'INSERT INTO "horario" (dia, "horaInicio", "horaFin", aula, "materiaId", "comisionId") VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
      ['jueves', '10:00', '12:00', 'Lab 2', materiaProg.id, comisionProg.id]
    );

    // Create a REALIZADA clase for Basicas materia (Análisis Matemático I) if exists
    const materiaAnalisis = (await qr.query('SELECT id FROM "materia" WHERE nombre=$1', ['Análisis Matemático I']))?.[0];
    if (materiaAnalisis) {
      const claseFecha = new Date();
      claseFecha.setDate(claseFecha.getDate() - 1);
      const claseIso = claseFecha.toISOString();
      const clase = (await qr.query(
'INSERT INTO "clase" ("materiaId", fecha, estado) VALUES ($1,$2,$3) RETURNING id',
        [materiaAnalisis.id, claseIso, 'realizada']
      ))[0];

      // Create asistencia for estudiante como presente
      await qr.query(
'INSERT INTO "asistencia" ("claseId", "estudianteId", estado, "fechaRegistro") VALUES ($1,$2,$3,CURRENT_TIMESTAMP)',
        [clase.id, estudiante.id, 'presente']
      );
    }

    // Create Examen Final schedule (examenes_finales)
    if (materiaAnalisis) {
      const examDate = new Date();
      examDate.setDate(examDate.getDate() + 15);
      const dateStr = examDate.toISOString().substring(0, 10);
      await qr.query(
        'INSERT INTO "examenes_finales" ("materiaId","docenteId", fecha, "hora_inicio_teorico", "hora_fin_teorico", "aulaTeorico", cupo, inscriptos, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
        [materiaAnalisis.id, profesor.id, dateStr, '09:00', '11:00', 'Aula Magna', 50, 0]
      );
    }

    // Create old exam record (tabla examen_final) for estudiante
    if (materiaProg) {
      const existingExam = (await qr.query('SELECT id FROM "examen_final" WHERE "estudianteId"=$1 AND "materiaId"=$2', [estudiante.id, materiaProg.id]))?.[0];
      if (!existingExam) {
        await qr.query(
          'INSERT INTO "examen_final" ("materiaId","estudianteId", nota, estado) VALUES ($1,$2,$3,$4)',
          [materiaProg.id, estudiante.id, null, 'inscripto']
        );
      }
    }

    await qr.commitTransaction();
    console.log('✅ seed-more completado');
  } catch (e) {
    await qr.rollbackTransaction();
    console.error('❌ seed-more error:', e.message || e);
    process.exitCode = 1;
  } finally {
    await qr.release();
    await app.close();
  }
}

seedMore();
