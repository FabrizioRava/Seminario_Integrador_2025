'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  BookOpen,
  Users,
  Clock,
  Calendar,
  MapPin,
  AlertCircle,
  ArrowLeft,
  X,
  Check,
  AlertTriangle,
  Loader2,
  Plus
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { isAxiosError } from 'axios';
import { toast } from '@/components/ui/use-toast';
import api from '@/lib/api';

interface Inscripcion {
  id: number;
  materia: {
    id: number;
    nombre: string;
    descripcion?: string;
    departamento?: {
      nombre: string;
    };
  };
  comision: {
    id: number;
    nombre: string;
    cupoMaximo: number;
    cupoDisponible: number;
    horarios: Array<{
      dia: string;
      horaInicio: string;
      horaFin: string;
      aula: string;
    }>;
    docente?: {
      id: number;
      nombre: string;
      apellido: string;
    };
    profesor?: {
      id: number;
      nombre: string;
      apellido: string;
    };
  };
  estado: string;
  stc: string;
  fechaInscripcion: string;
  puedeDarseDeBaja?: boolean;
  motivoNoBaja?: string;
}

const getDiaNombre = (dia: string) => {
  const dias: Record<string, string> = {
    'LUNES': 'Lun',
    'MARTES': 'Mar',
    'MIERCOLES': 'Mié',
    'JUEVES': 'Jue',
    'VIERNES': 'Vie',
    'SABADO': 'Sáb',
  };
  return dias[dia] || dia;
};

const formatFecha = (fecha: string) => {
  return new Date(fecha).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export default function MisMateriasPage() {
  const [inscripciones, setInscripciones] = useState<Inscripcion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmarBaja, setConfirmarBaja] = useState<number | null>(null);
  const [bajaLoading, setBajaLoading] = useState<number | null>(null);
  const { user } = useAuth();
  const router = useRouter();

  const fetchMisInscripciones = async () => {
    if (!user?.id) return;
    
    try {
      setLoading(true);
      setError(null);
      
      console.log('Cargando inscripciones del estudiante...');
      const response = await api.get('/inscripcion/mis-inscripciones');
      console.log('Inscripciones cargadas:', response.data);
      
      // Procesar las inscripciones para verificar si se pueden dar de baja
      const inscripcionesProcesadas = response.data.map((insc: Inscripcion) => {
        // Verificar si la inscripción está activa
        const estaActiva = insc.estado === 'CURSANDO' || insc.estado === 'CONFIRMADA' || insc.stc === 'CURSANDO';
        
        // Por defecto, permitir la baja a menos que haya una razón específica para no hacerlo
        let puedeDarseDeBaja = estaActiva;
        let motivoNoBaja = '';
        
        // Aquí podrías agregar más lógica para determinar si se puede dar de baja
        // Por ejemplo, verificar fechas límite, si ya rindió parciales, etc.
        
        return {
          ...insc,
          puedeDarseDeBaja,
          motivoNoBaja
        };
      });
      
      setInscripciones(inscripcionesProcesadas);
    } catch (error) {
      console.error('Error al cargar inscripciones:', error);
      
      if (isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
          console.log('Error de autenticación, redirigiendo a login...');
          router.push('/login');
          return;
        }
        setError('No se pudieron cargar tus materias. Por favor, inténtalo de nuevo más tarde.');
      } else {
        setError('Ocurrió un error inesperado al cargar tus materias.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchMisInscripciones();
    }
  }, [user]);

  const getEstadoBadge = (estado: string) => {
    switch (estado?.toUpperCase()) {
      case 'CURSANDO':
      case 'CONFIRMADA':
        return <Badge className="bg-green-100 text-green-800">Cursando</Badge>;
      case 'PENDIENTE':
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">Pendiente</Badge>;
      case 'APROBADA':
        return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">Aprobada</Badge>;
      case 'RECHAZADA':
        return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">Rechazada</Badge>;
      default:
        return <Badge variant="outline">{estado || 'Sin estado'}</Badge>;
    }
  };

  const handleBajaClick = (inscripcionId: number) => {
    setConfirmarBaja(inscripcionId);
  };

  const cancelarBaja = () => {
    setConfirmarBaja(null);
  };

  const confirmarBajaInscripcion = async (inscripcionId: number) => {
    try {
      setBajaLoading(inscripcionId);
      
      // Aquí iría la llamada a la API para dar de baja la inscripción
      await api.delete(`/inscripcion/${inscripcionId}`);
      
      // Actualizar el estado local eliminando la inscripción
      setInscripciones(prev => prev.filter(insc => insc.id !== inscripcionId));
      
      toast({
        title: "Baja exitosa",
        description: "La materia se ha dado de baja correctamente.",
        variant: "default",
      });
      
    } catch (error) {
      console.error('Error al dar de baja la inscripción:', error);
      
      let errorMessage = 'Ocurrió un error al intentar darte de baja de la materia.';
      
      if (isAxiosError(error) && error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }
      
      toast({
        title: "Error al dar de baja",
        description: errorMessage,
        variant: "destructive",
      });
      
    } finally {
      setBajaLoading(null);
      setConfirmarBaja(null);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mis Materias</h1>
            <p className="text-gray-600">Tus materias inscriptas en el sistema</p>
          </div>
        </div>
        <div className="flex justify-center items-center min-h-[40vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-gray-600">Cargando tus materias...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mis Materias</h1>
            <p className="text-gray-600">Tus materias inscriptas en el sistema</p>
          </div>
        </div>
        <div className="bg-white border border-red-200 rounded-lg p-6 text-center">
          <div className="text-red-500 mb-4">
            <AlertCircle className="h-12 w-12 mx-auto" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error al cargar las materias</h2>
          <p className="text-gray-700 mb-4">{error}</p>
          <Button onClick={fetchMisInscripciones} variant="outline">
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 bg-white min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mis Materias</h1>
          <p className="text-gray-600">Tus materias inscriptas en el sistema</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => router.push('/inscripciones')}
            className="hidden sm:flex"
          >
            <Plus className="h-4 w-4 mr-2" /> Inscribirme a más materias
          </Button>
        </div>
      </div>

      {inscripciones.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <div className="mx-auto h-16 w-16 text-gray-400 mb-4">
            <BookOpen className="h-full w-full" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No estás inscripto a ninguna materia</h2>
          <p className="text-gray-600 mb-6">
            Actualmente no tienes materias activas. Dirígete a la sección de inscripciones para inscribirte.
          </p>
          <Button onClick={() => router.push('/inscripciones')}>
            <Plus className="h-4 w-4 mr-2" /> Inscribirme a materias
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {inscripciones.map((inscripcion) => {
            const docente = inscripcion.comision.docente || inscripcion.comision.profesor;
            const puedeDarseDeBaja = inscripcion.puedeDarseDeBaja !== false;
            
            return (
              <Card key={inscripcion.id} className="overflow-hidden">
                <CardHeader className="pb-3 border-b">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold">{inscripcion.materia.nombre}</h2>
                        {getEstadoBadge(inscripcion.estado || inscripcion.stc)}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        Comisión: {inscripcion.comision.nombre}
                      </p>
                    </div>
                    
                    {puedeDarseDeBaja ? (
                      confirmarBaja === inscripcion.id ? (
                        <div className="flex items-center gap-2 mt-2 sm:mt-0">
                          <span className="text-sm text-gray-600">¿Confirmar baja?</span>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={cancelarBaja}
                            disabled={bajaLoading === inscripcion.id}
                          >
                            <X className="h-4 w-4 mr-1" /> Cancelar
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm" 
                            onClick={() => confirmarBajaInscripcion(inscripcion.id)}
                            disabled={bajaLoading === inscripcion.id}
                          >
                            {bajaLoading === inscripcion.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4 mr-1" />
                            )}
                            Confirmar baja
                          </Button>
                        </div>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleBajaClick(inscripcion.id)}
                          className="mt-2 sm:mt-0"
                        >
                          <X className="h-4 w-4 mr-1 text-red-500" />
                          <span className="text-red-600">Darse de baja</span>
                        </Button>
                      )
                    ) : inscripcion.motivoNoBaja ? (
                      <div className="flex items-center text-yellow-600 text-sm mt-2 sm:mt-0">
                        <AlertTriangle className="h-4 w-4 mr-1 flex-shrink-0" />
                        <span>{inscripcion.motivoNoBaja}</span>
                      </div>
                    ) : null}
                  </div>
                </CardHeader>
                
                <CardContent className="pt-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Información general */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-2">Información</h3>
                      <div className="space-y-2 text-sm text-gray-600">
                        {inscripcion.materia.descripcion && (
                          <p className="flex items-start">
                            <BookOpen className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0 text-gray-400" />
                            <span>{inscripcion.materia.descripcion}</span>
                          </p>
                        )}
                        {docente && (
                          <p className="flex items-center">
                            <Users className="h-4 w-4 mr-2 text-gray-400 flex-shrink-0" />
                            <span>Docente: {docente.nombre} {docente.apellido}</span>
                          </p>
                        )}
                        <p className="flex items-center">
                          <Calendar className="h-4 w-4 mr-2 text-gray-400 flex-shrink-0" />
                          <span>Inscripción: {formatFecha(inscripcion.fechaInscripcion)}</span>
                        </p>
                        {inscripcion.comision.cupoDisponible !== undefined && (
                          <p className="flex items-center">
                            <Users className="h-4 w-4 mr-2 text-gray-400 flex-shrink-0" />
                            <span>Vacantes: {inscripcion.comision.cupoDisponible} / {inscripcion.comision.cupoMaximo}</span>
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {/* Horarios */}
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-2">Horarios</h3>
                      {inscripcion.comision.horarios && inscripcion.comision.horarios.length > 0 ? (
                        <div className="space-y-2">
                          {inscripcion.comision.horarios.map((horario, index) => (
                            <div key={index} className="flex items-center text-sm text-gray-600 bg-gray-50 p-2 rounded border">
                              <div className="flex items-center w-16">
                                <Calendar className="h-4 w-4 mr-2 text-gray-400 flex-shrink-0" />
                                <span className="font-medium">{getDiaNombre(horario.dia)}</span>
                              </div>
                              <div className="flex-1 flex items-center">
                                <Clock className="h-4 w-4 mr-2 text-gray-400 flex-shrink-0" />
                                <span>{horario.horaInicio} - {horario.horaFin}</span>
                              </div>
                              {horario.aula && (
                                <div className="flex items-center ml-2">
                                  <MapPin className="h-4 w-4 mr-1 text-gray-400 flex-shrink-0" />
                                  <span className="text-gray-500">{horario.aula}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No hay horarios asignados</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      
      {/* Botón flotante para móviles */}
      <div className="fixed bottom-6 right-6 sm:hidden">
        <Button 
          size="lg" 
          className="rounded-full w-12 h-12 p-0 shadow-lg"
          onClick={() => router.push('/inscripciones')}
        >
          <Plus className="h-6 w-6" />
          <span className="sr-only">Inscribirme a más materias</span>
        </Button>
      </div>
    </div>
  );
}
