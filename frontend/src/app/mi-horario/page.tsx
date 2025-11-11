'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, MapPin, User, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { isAxiosError } from 'axios';
import axios from 'axios';
import { useAuth } from '@/contexts/AuthContext';

interface Inscripcion {
  id: number;
  materia: {
    id: number;
    nombre: string;
    descripcion?: string;
  };
  comision: {
    id: number;
    nombre: string;
    horarios: Array<{
      dia: string;
      horaInicio: string;
      horaFin: string;
      aula: string;
    }>;
    docente?: {
      nombre: string;
      apellido: string;
    };
  };
  estado: string;
  stc: string;
  fechaInscripcion: string;
}

interface HorarioPlano {
  id: string;
  dia: string;
  horaInicio: string;
  horaFin: string;
  aula: string;
  materia: {
    id: number;
    nombre: string;
  };
  comision?: {
    id: number;
    nombre: string;
    docente?: {
      nombre: string;
      apellido: string;
    };
  };
  color: string;
}

interface HorarioServidorBloque {
  materia?: {
    id: number;
    nombre: string;
    descripcion?: string;
  };
  comision?: {
    id: number;
    nombre: string;
    descripcion?: string;
  };
  horaInicio: string;
  horaFin: string;
  aula: string;
  esProfesor: boolean;
  materiaId?: number;
  comisionId?: number;
}

interface HorarioServidorDia {
  fecha: string;
  diaSemana: string;
  bloques: HorarioServidorBloque[];
}

const DIAS_SEMANA = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const HORAS = Array.from({ length: 15 }, (_, i) => `${i + 8}:00`); // 8:00 a 22:00

const getDiaNombre = (dia: string) => {
  const dias: Record<string, string> = {
    'LUNES': 'Lunes',
    'MARTES': 'Martes',
    'MIERCOLES': 'Miércoles',
    'JUEVES': 'Jueves',
    'VIERNES': 'Viernes',
    'SABADO': 'Sábado',
  };
  return dias[dia] || dia;
};

const getHoraFormateada = (hora: string) => {
  const [h, m] = hora.split(':');
  const horas = parseInt(h, 10);
  const minutos = m || '00';
  return `${horas}:${minutos}`;
};

const COLORES_MATERIAS = [
  'bg-blue-100 text-blue-800 border-blue-300',
  'bg-green-100 text-green-800 border-green-300',
  'bg-purple-100 text-purple-800 border-purple-300',
  'bg-yellow-100 text-yellow-800 border-yellow-300',
  'bg-pink-100 text-pink-800 border-pink-300',
  'bg-indigo-100 text-indigo-800 border-indigo-300',
  'bg-red-100 text-red-800 border-red-300',
  'bg-orange-100 text-orange-800 border-orange-300',
];

const normalizarInscripciones = (inscripciones: Inscripcion[]): HorarioPlano[] => {
  const resultado: HorarioPlano[] = [];
  const coloresDisponibles = [...COLORES_MATERIAS];
  const coloresAsignados = new Map<number, string>();
  
  inscripciones.forEach((inscripcion) => {
    const materiaId = inscripcion.materia.id;
    
    // Asignar un color único a cada materia
    if (!coloresAsignados.has(materiaId)) {
      const color = coloresDisponibles.length > 0 
        ? coloresDisponibles.shift()! 
        : `hsl(${Math.floor(Math.random() * 360)}, 70%, 85%)`;
      coloresAsignados.set(materiaId, color);
    }
    
    // Procesar cada horario de la comisión
    inscripcion.comision.horarios.forEach((horario, index) => {
      resultado.push({
        id: `${inscripcion.id}-${index}`,
        dia: horario.dia.toUpperCase(),
        horaInicio: horario.horaInicio,
        horaFin: horario.horaFin,
        aula: horario.aula || 'Sin aula asignada',
        materia: {
          id: inscripcion.materia.id,
          nombre: inscripcion.materia.nombre,
        },
        comision: {
          id: inscripcion.comision.id,
          nombre: inscripcion.comision.nombre,
          docente: inscripcion.comision.docente,
        },
        color: coloresAsignados.get(materiaId) || 'bg-gray-100',
      });
    });
  });

  return resultado;
};

export default function MiHorarioPage() {
  const [horarios, setHorarios] = useState<HorarioPlano[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vistaMovil, setVistaMovil] = useState(false);
  const [diaSeleccionado, setDiaSeleccionado] = useState(0);
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    fetchHorarios();
    checkVistaMovil();
    window.addEventListener('resize', checkVistaMovil);
    return () => window.removeEventListener('resize', checkVistaMovil);
  }, []);

  const checkVistaMovil = () => {
    setVistaMovil(window.innerWidth < 768);
    if (window.innerWidth < 768) {
      const hoy = new Date().getDay();
      setDiaSeleccionado(hoy === 0 ? 0 : hoy - 1);
    }
  };

  const fetchHorarios = async () => {
    if (!user?.id) return;
    
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔍 Cargando inscripciones del estudiante...');
      const response = await api.get<Inscripcion[]>('/inscripcion/mis-inscripciones');
      console.log('✅ Inscripciones obtenidas exitosamente:', response.data.length, 'materias');
      
      // Filtrar solo las inscripciones activas (cursando o confirmadas)
      const inscripcionesActivas = response.data.filter(insc => 
        insc.estado === 'CURSANDO' || insc.estado === 'CONFIRMADA' || insc.stc === 'CURSANDO'
      );
      
      console.log('📚 Inscripciones activas:', inscripcionesActivas.length);
      
      if (inscripcionesActivas.length === 0) {
        console.log('ℹ️ El estudiante no tiene materias activas actualmente');
        setHorarios([]);
        return;
      }
      
      const horariosNormalizados = normalizarInscripciones(inscripcionesActivas);
      console.log('📅 Horarios procesados:', horariosNormalizados.length, 'bloques');
      
      setHorarios(horariosNormalizados);
    } catch (error: unknown) {
      console.error('❌ Error al cargar horarios:', error);
      
      if (isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
          console.log('🔐 Error de autenticación, redirigiendo a login...');
          router.push('/login');
          return;
        }
        setError('No se pudieron cargar los horarios. Por favor, inténtalo de nuevo más tarde.');
      } else {
        setError('Ocurrió un error inesperado al cargar los horarios.');
      }
      
      setHorarios([]);
    } finally {
      setLoading(false);
    }
  };


  const getHorarioPorDiaYHora = (dia: string, hora: string) => {
    return horarios.find(h => {
      const [horaInicioStr] = h.horaInicio.split(':');
      const [horaFinStr] = h.horaFin.split(':');
      if (!horaInicioStr || !horaFinStr) {
        return false;
      }
      const horaInicio = parseInt(horaInicioStr, 10);
      const horaFin = parseInt(horaFinStr, 10);
      const horaActual = parseInt(hora.split(':')[0]);
      return h.dia === dia && horaActual >= horaInicio && horaActual < horaFin;
    });
  };
  
  const getMateriasUnicas = () => {
    const materias = new Map<number, { nombre: string; color: string }>();
    horarios.forEach(h => {
      if (!materias.has(h.materia.id)) {
        materias.set(h.materia.id, {
          nombre: h.materia.nombre,
          color: h.color
        });
      }
    });
    return Array.from(materias.entries()).map(([id, data]) => ({
      id,
      nombre: data.nombre,
      color: data.color
    }));
  };

  const getHorariosDia = (dia: string) => {
    return horarios
      .filter(h => h.dia === dia)
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  };

  const exportarHorario = () => {
    // Aquí podrías implementar la exportación a PDF o imagen
    window.print();
  };

  const cambiarDia = (direccion: number) => {
    setDiaSeleccionado(prev => {
      const nuevo = prev + direccion;
      if (nuevo < 0) return DIAS_SEMANA.length - 1;
      if (nuevo >= DIAS_SEMANA.length) return 0;
      return nuevo;
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-gray-600">Cargando tu horario...</p>
          </div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <div className="text-red-500 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error al cargar el horario</h2>
          <p className="text-gray-700 mb-4">{error}</p>
          <Button onClick={fetchHorarios} variant="outline">
            Reintentar
          </Button>
        </div>
      </div>
    );
  }
  
  if (horarios.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <div className="mx-auto h-16 w-16 text-gray-400 mb-4">
            <Calendar className="h-full w-full" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No tienes horarios asignados</h2>
          <p className="text-gray-600 mb-6">
            Actualmente no estás inscripto a ninguna materia o no hay horarios disponibles.
          </p>
          <Button onClick={() => router.push('/inscripciones')}>
            Ir a inscripciones
          </Button>
        </div>
      </div>
    );
  }

  const materiasUnicas = getMateriasUnicas();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mi Horario</h1>
          <p className="text-gray-600">Visualiza tus clases de la semana</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {materiasUnicas.map((materia) => (
            <div key={materia.id} className="flex items-center">
              <div 
                className="w-3 h-3 rounded-full mr-2" 
                style={{ backgroundColor: materia.color.replace('bg-', '').split('-')[0] }}
              />
              <span className="text-sm text-gray-700">{materia.nombre}</span>
            </div>
          ))}
        </div>
        
        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Leyenda</CardTitle>
              <CardDescription>Colores de las materias en tu horario</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {getMateriasUnicas().map((materia, index) => (
                  <div key={materia.id} className="flex items-center">
                    <div 
                      className={`w-4 h-4 rounded-full mr-2 ${
                        COLORES_MATERIAS[index % COLORES_MATERIAS.length].split(' ')[0]
                      }`}
                    />
                    <span className="text-sm">{materia.nombre}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        <Button onClick={exportarHorario} variant="outline" className="hidden md:flex">
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>
      </div>

      {/* Vista Móvil */}
      {vistaMovil ? (
        <div className="space-y-4">
          {/* Selector de día */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => cambiarDia(-1)}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <h2 className="text-lg font-semibold capitalize">
                {DIAS_SEMANA[diaSeleccionado].toLowerCase()}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => cambiarDia(1)}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Clases del día */}
          <div className="space-y-3">
            {getHorariosDia(DIAS_SEMANA[diaSeleccionado]).length > 0 ? (
              getHorariosDia(DIAS_SEMANA[diaSeleccionado]).map((horario) => (
                <Card
                  key={horario.id}
                  className={cn(
                    "border-2",
                    materiasColores.get(horario.materia.id)
                  )}
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{horario.materia.nombre}</CardTitle>
                    {horario.comision && (
                      <CardDescription>{horario.comision.nombre}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4" />
                      <span>{horario.horaInicio} - {horario.horaFin}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4" />
                      <span>Aula {horario.aula}</span>
                    </div>
                    {horario.comision?.docente && (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4" />
                        <span>
                          Prof. {horario.comision.docente.nombre} {horario.comision.docente.apellido}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="text-center py-8">
                  <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600">No tienes clases este día</p>
                  {horarios.length === 0 && (
                    <p className="text-sm text-gray-500 mt-2">
                      No tienes horarios registrados. Inscríbete a materias para ver tus horarios.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      ) : (/* Vista Desktop - Grilla */
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 w-20">
                    Hora
                  </th>
                  {DIAS_SEMANA.map((dia) => (
                    <th
                      key={dia}
                      className="px-4 py-3 text-center text-sm font-medium text-gray-700 capitalize"
                    >
                      {dia.toLowerCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HORAS.map((hora) => (
                  <tr key={hora} className="border-b">
                    <td className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50">
                      {hora}
                    </td>
                    {DIAS_SEMANA.map((dia) => {
                      const horario = getHorarioPorDiaYHora(dia, hora);
                      if (horario) {
                        const horaInicio = parseInt(horario.horaInicio.split(':')[0]);
                        const horaActual = parseInt(hora.split(':')[0]);

                        // Solo mostrar en la primera hora de la clase
                        if (horaInicio === horaActual) {
                          const duracion = parseInt(horario.horaFin.split(':')[0]) - horaInicio;
                          return (
                            <td
                              key={`${dia}-${hora}`}
                              rowSpan={duracion}
                              className="p-2"
                            >
                              <div 
                                className={cn(
                                  'h-16 border border-gray-200 relative',
                                  getHorarioPorDiaYHora(dia, hora) && 'opacity-90 hover:opacity-100 transition-opacity'
                                )}
                              >
                                {getHorarioPorDiaYHora(dia, hora) && (
                                  <div 
                                    className="absolute inset-0 p-1 text-xs overflow-hidden rounded-sm shadow-sm"
                                    style={{
                                      backgroundColor: getHorarioPorDiaYHora(dia, hora)?.color.replace('bg-', '').split('-')[0],
                                      color: '#1F2937', // Texto oscuro para mejor legibilidad
                                      borderLeft: `4px solid ${getHorarioPorDiaYHora(dia, hora)?.color.replace('bg-', '').split('-')[0].replace('100', '500')}`
                                    }}
                                  >
                                    <div className="font-medium truncate">
                                      {getHorarioPorDiaYHora(dia, hora)?.materia.nombre}
                                    </div>
                                    <div className="text-xs truncate">
                                      {getHorarioPorDiaYHora(dia, hora)?.comision?.nombre}
                                    </div>
                                    <div className="text-xs font-medium">
                                      {getHoraFormateada(getHorarioPorDiaYHora(dia, hora)?.horaInicio || '')} - {getHoraFormateada(getHorarioPorDiaYHora(dia, hora)?.horaFin || '')}
                                    </div>
                                    {getHorarioPorDiaYHora(dia, hora)?.aula && (
                                      <div className="flex items-center mt-1">
                                        <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                                        <span className="text-xs">{getHorarioPorDiaYHora(dia, hora)?.aula}</span>
                                      </div>
                                    )}
                                    {getHorarioPorDiaYHora(dia, hora)?.comision?.docente && (
                                      <div className="flex items-center mt-1">
                                        <User className="h-3 w-3 mr-1 flex-shrink-0" />
                                        <span className="text-xs truncate">
                                          {getHorarioPorDiaYHora(dia, hora)?.comision?.docente.apellido}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          );
                        } else if (horaActual > horaInicio && horaActual < parseInt(horario.horaFin.split(':')[0], 10)) {
                          // Esta celda está ocupada por un rowspan
                          return null;
                        }
                        }
                        return <td key={`${dia}-${hora}`} className="p-2"></td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Leyenda de materias */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Mis Materias</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {Array.from(new Set(horarios.map(h => h.materia.id))).map((materiaId) => {
                const materia = horarios.find(h => h.materia.id === materiaId)?.materia;
                if (!materia) return null;
                return (
                  <Badge
                    key={materiaId}
                    className={cn(
                      "px-3 py-1",
                      materiasColores.get(materiaId)
                    )}
                  >
                    {materia.nombre}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
