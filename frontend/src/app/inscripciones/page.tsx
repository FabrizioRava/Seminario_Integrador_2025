'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BookOpen,
  Plus,
  Check,
  X,
  Clock,
  Users,
  Calendar,
  AlertCircle,
  Search
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { isAxiosError } from 'axios';
import axios from 'axios';
import { useAuth } from '@/contexts/AuthContext';

interface Materia {
  id: number;
  nombre: string;
  descripcion?: string;
  nivel?: number;
  correlativasCursada?: Array<{
    id: number;
    nombre: string;
  }>;
  correlativasFinal?: Array<{
    id: number;
    nombre: string;
  }>;
  comisiones?: Comision[];
}

interface Comision {
  id: number;
  nombre: string;
  cupoMaximo: number;
  cupoDisponible: number;
  docente?: {
    nombre: string;
    apellido: string;
  };
  horarios: Horario[];
  materiaId?: number;
  profesorId?: number;
  inscripciones?: any[];
  profesor?: {
    nombre: string;
    apellido: string;
  };
}

interface Horario {
  dia: string;
  horaInicio: string;
  horaFin: string;
  aula: string;
}

interface Inscripcion {
  id: number;
  materia: {
    id: number;
    nombre: string;
    descripcion?: string;
  };
  comision: Comision;
  estado: string;
  stc: string;
  fechaInscripcion: string;
}

// Componente principal de la página de inscripciones a materias
export default function InscripcionesPage() {
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [materiasDisponibles, setMateriasDisponibles] = useState<Materia[]>([]);
  const [misInscripciones, setMisInscripciones] = useState<Inscripcion[]>([]);
  const [selectedMateria, setSelectedMateria] = useState<Materia | null>(null);
  const [selectedComision, setSelectedComision] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    console.log('InscripcionesPage: useEffect ejecutándose');
    // Si aún está cargando la autenticación, esperar
    if (authLoading) {
      console.log('InscripcionesPage: Esperando autenticación...');
      return;
    }

    // Si no hay usuario autenticado, redirigir al login
    if (!user) {
      console.log('InscripcionesPage: Usuario autenticado pero sin datos, redirigiendo al login');
      router.push('/login');
      return;
    }

    // Usuario autenticado con datos válidos
    if (!user.planEstudio?.id) {
      console.log('InscripcionesPage: Usuario no tiene planEstudioId');
      setAuthError('Tu cuenta no tiene un plan de estudios asignado.');
      setLoading(false);
      return;
    }

    console.log('InscripcionesPage: Usuario válido, cargando datos...');
    fetchData();
  }, [isAuthenticated, authLoading, user, router]);

  // Carga los datos iniciales de materias e inscripciones del usuario
  const fetchData = async () => {
    if (!user?.id) {
      console.log('No hay usuario autenticado');
      return;
    }

    try {
      console.log('Iniciando carga de datos...');
      setAuthError(null);
      setLoading(true);

      // Cargar inscripciones actuales
      try {
        console.log('Cargando inscripciones actuales...');
        const inscripcionesRes = await api.get('/inscripcion/mis-inscripciones');
        console.log('Inscripciones cargadas:', inscripcionesRes.data);
        setMisInscripciones(inscripcionesRes.data || []);
      } catch (error) {
        console.error('Error al cargar inscripciones actuales:', error);
        setMisInscripciones([]);
        
        if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
          console.log(`Error ${error.response?.status} - Problema de permisos`);
          logout();
          return;
        }
      }

      // Cargar materias disponibles
      try {
        console.log('Cargando materias disponibles...');
        const materiasRes = await api.get('/inscripcion/materia/disponibles');
        const materiasData = materiasRes.data || [];
        console.log('Materias disponibles:', materiasData);
        
        // Filtrar materias para excluir aquellas en las que ya está inscripto
        const materiasFiltradas = materiasData.filter((materia: any) => 
          !misInscripciones.some(insc => insc.materia.id === materia.id)
        );
        
        setMateriasDisponibles(materiasFiltradas);
      } catch (error) {
        console.error('Error al cargar materias disponibles:', error);
        setMateriasDisponibles([]);
      }
    } catch (error) {
      console.error('Error general al cargar datos:', error);
      setAuthError('Error al cargar los datos. Por favor, intenta de nuevo.');
    } finally {
      setLoading(false);
      console.log('Carga de datos finalizada');
    }
  };

  // Intenta recargar los datos cuando hay errores
  const handleRetry = () => {
    console.log('Reintentando carga de datos...');
    fetchData();
  };

  // Limpia la sesión y redirige al login
  const handleGoToLogin = () => {
    console.log('Limpiando autenticación y redirigiendo al login');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    logout();
  };

  // Verifica si una materia tiene correlativas aprobadas
  const checkCorrelativas = (materia: Materia): { canEnroll: boolean; missingCorrelativas: string[] } => {
    const missingCorrelativas: string[] = [];

    if (materia.correlativasCursada && Array.isArray(materia.correlativasCursada) && materia.correlativasCursada.length > 0) {
      for (const correlativa of materia.correlativasCursada) {
        const correlativaNombre = correlativa?.nombre;

        const tieneAprobada = misInscripciones.some(inscripcion =>
          inscripcion.materia?.id === correlativa?.id &&
          (inscripcion.stc === 'APROBADA' || inscripcion.estado === 'APROBADA')
        );

        if (!tieneAprobada && correlativaNombre) {
          missingCorrelativas.push(correlativaNombre);
        }
      }
    }

    return {
      canEnroll: missingCorrelativas.length === 0,
      missingCorrelativas
    };
  };

  // Maneja el proceso de inscripción a una materia
  const handleInscripcion = async () => {
    if (!selectedMateria || !selectedComision) {
      toast({
        title: "Error",
        description: "Debes seleccionar una materia y comisión",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      
      // Realizar la inscripción en el backend
      await api.post(`/inscripcion/materia/${selectedMateria.id}`, {
        comisionId: parseInt(selectedComision)
      });

      // Actualizar la lista de inscripciones
      const inscripcionesRes = await api.get('/inscripcion/mis-inscripciones');
      setMisInscripciones(inscripcionesRes.data || []);

      // Actualizar la lista de materias disponibles
      const materiasRes = await api.get('/inscripcion/materia/disponibles');
      const materiasData = materiasRes.data || [];
      
      // Filtrar materias para excluir aquellas en las que ya está inscripto
      const materiasFiltradas = materiasData.filter((materia: any) => 
        !inscripcionesRes.data.some((insc: any) => insc.materia.id === materia.id)
      );
      
      setMateriasDisponibles(materiasFiltradas);

      // Mostrar mensaje de éxito
      toast({
        title: "¡Inscripción exitosa!",
        description: `Te has inscripto correctamente a ${selectedMateria.nombre}`,
      });

      // Cerrar el modal y limpiar selección
      setShowModal(false);
      setSelectedMateria(null);
      setSelectedComision('');
      
    } catch (error) {
      console.error('Error al realizar la inscripción:', error);
      
      let errorMessage = 'Ocurrió un error al realizar la inscripción';
      if (axios.isAxiosError(error) && error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Cancela una inscripción existente
  const handleCancelarInscripcion = async (inscripcionId: number) => {
    // Para desarrollo, simular la cancelación localmente
    setMisInscripciones(prev => prev.filter(inscripcion => inscripcion.id !== inscripcionId));

    toast({
      title: "Éxito",
      description: "Inscripción cancelada correctamente",
    });
  };

  // Filtra materias según el término de búsqueda
  const filteredMaterias = (materiasDisponibles || []).filter(materia =>
    materia.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Retorna el badge correspondiente al estado de la inscripción
  const getEstadoBadge = (inscripcion: Inscripcion) => {
    const estado = (inscripcion.estado || inscripcion.stc || '').toUpperCase();
    switch (estado) {
      case 'CONFIRMADA':
      case 'CURSANDO':
        return <Badge className="bg-green-100 text-green-800">Confirmada</Badge>;
      case 'PENDIENTE':
        return <Badge className="bg-yellow-100 text-yellow-800">Pendiente</Badge>;
      case 'RECHAZADA':
        return <Badge className="bg-red-100 text-red-800">Rechazada</Badge>;
      case 'FINALIZADA':
      case 'APROBADA':
        return <Badge className="bg-blue-100 text-blue-800">{estado.charAt(0) + estado.slice(1).toLowerCase()}</Badge>;
      default:
        return estado ? <Badge>{estado}</Badge> : <Badge variant="outline">Sin estado</Badge>;
    }
  };

  // Renderiza información del docente de una comisión
  const renderComisionDocente = (comision?: Comision) => {
    const docente = comision?.docente ?? comision?.profesor;
    if (!docente) return null;

    return (
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-gray-400" />
        <span>
          Prof. {docente.nombre} {docente.apellido}
        </span>
      </div>
    );
  };

  // Formatea la información de cupo de una comisión
  const formatCupo = (comision: Comision) => {
    if (comision.cupoDisponible !== undefined && comision.cupoMaximo !== undefined) {
      return `${comision.cupoDisponible}/${comision.cupoMaximo} cupos`;
    }

    if (comision.inscripciones) {
      return `${comision.inscripciones.length} inscriptos`;
    }

    return 'Cupo no disponible';
  };

  // Determina si se puede cancelar una inscripción según su estado
  const canCancelInscripcion = (inscripcion: Inscripcion) => {
    const estado = (inscripcion.estado || inscripcion.stc || '').toUpperCase();
    return estado === 'PENDIENTE' || estado === 'CURSANDO';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Loading inicial mientras se carga la autenticación */}
      {authLoading && (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Cargando...</p>
          </div>
        </div>
      )}

      {/* Contenido principal cuando no está cargando */}
      {!authLoading && user && (
        <>
          {/* Barra superior */}
          <div className="bg-white shadow-sm border-b">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center py-6">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Inscripciones</h1>
                  <p className="text-gray-600 mt-1">Gestiona tus inscripciones a materias</p>
                </div>
                {!authError && (
                  <Button onClick={() => setShowModal(true)} disabled={materiasDisponibles.length === 0}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nueva Inscripción
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Contenido principal */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {authError ? (
              <div className="bg-red-50 border border-red-200 rounded-md p-6 text-center">
                <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
                <h2 className="text-lg font-semibold text-red-900 mb-2">Error de Autenticación</h2>
                <p className="text-red-700 mb-4">{authError}</p>
                <div className="flex gap-3 justify-center">
                  <Button onClick={handleRetry} variant="outline">
                    Reintentar
                  </Button>
                  <Button
                    onClick={() => {
                      console.log('Limpiando completamente la autenticación...');
                      localStorage.clear();
                      window.location.href = '/login';
                    }}
                    variant="destructive"
                  >
                    Limpiar Sesión
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Sección de Mis Inscripciones */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-gray-900">Mis Materias</h2>
                    <Badge variant="outline" className="bg-blue-100 text-blue-800">
                      {misInscripciones.length} {misInscripciones.length === 1 ? 'materia' : 'materias'}
                    </Badge>
                  </div>

                  {misInscripciones.length === 0 ? (
                    <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
                      <BookOpen className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900">No estás inscripto a ninguna materia</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Busca materias en la sección de abajo para comenzar a inscribirte.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {misInscripciones.map((inscripcion) => (
                        <Card key={inscripcion.id} className="border-l-4 border-blue-500">
                          <CardHeader className="p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <CardTitle className="text-lg">{inscripcion.materia.nombre}</CardTitle>
                                <CardDescription className="mt-1">
                                  Comisión: {inscripcion.comision.nombre}
                                </CardDescription>
                              </div>
                              <Badge 
                                variant={
                                  inscripcion.estado === 'CONFIRMADA' || inscripcion.stc === 'CURSANDO' 
                                    ? 'default' 
                                    : 'secondary'
                                }
                              >
                                {inscripcion.estado || inscripcion.stc || 'PENDIENTE'}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="p-4 pt-0">
                            {/* Información del docente */}
                            {inscripcion.comision.docente && (
                              <div className="flex items-center text-sm text-gray-600 mb-3">
                                <Users className="h-4 w-4 mr-2 text-gray-400" />
                                <span>
                                  Docente: {inscripcion.comision.docente.nombre} {inscripcion.comision.docente.apellido}
                                </span>
                              </div>
                            )}
                            
                            {/* Horarios */}
                            <div className="space-y-2">
                              <h4 className="text-sm font-medium text-gray-700">Horarios:</h4>
                              {inscripcion.comision.horarios && inscripcion.comision.horarios.length > 0 ? (
                                <div className="grid gap-2">
                                  {inscripcion.comision.horarios.map((horario, index) => (
                                    <div key={index} className="flex items-center text-sm text-gray-600 bg-gray-50 p-2 rounded">
                                      <Clock className="h-4 w-4 mr-2 text-gray-400" />
                                      <span className="font-medium">{horario.dia}:</span>
                                      <span className="mx-1">{horario.horaInicio} - {horario.horaFin}</span>
                                      {horario.aula && (
                                        <span className="ml-2 text-gray-500">(Aula: {horario.aula})</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-sm text-gray-500 italic">Sin horarios asignados</div>
                              )}
                            </div>

                            <div className="mt-4 flex justify-between items-center">
                              <div className="text-sm text-gray-500">
                                Fecha de inscripción: {new Date(inscripcion.fechaInscripcion).toLocaleDateString()}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCancelarInscripcion(inscripcion.id)}
                                className="text-red-600 border-red-200 hover:bg-red-50"
                                disabled={!canCancelInscripcion(inscripcion)}
                              >
                                <X className="h-4 w-4 mr-1" />
                                Dar de baja
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sección de Materias Disponibles */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-gray-900">Materias Disponibles</h2>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <Input
                        type="text"
                        placeholder="Buscar materias..."
                        className="pl-10 w-64"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>

                  {loading ? (
                    <div className="flex justify-center items-center h-64">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                  ) : materiasDisponibles.length === 0 ? (
                    <Card>
                      <CardContent className="text-center py-8">
                        <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-600">No hay materias disponibles para tu plan de estudios</p>
                        <p className="text-sm text-gray-500 mt-2">Contacta al administrador para que asocie materias a tu plan de estudios</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredMaterias.map((materia) => (
                        <Card key={materia.id} className="hover:shadow-lg transition-shadow">
                          <CardHeader>
                            <div className="flex justify-between items-start">
                              <div>
                                <CardTitle className="text-lg">{materia.nombre}</CardTitle>
                                <CardDescription>{materia.descripcion}</CardDescription>
                              </div>
                              {materia.nivel && (
                                <Badge variant="outline">Nivel {materia.nivel}</Badge>
                              )}
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              <div className="text-sm">
                                <span className="font-medium">Comisiones disponibles:</span>
                                <div className="mt-1 space-y-1">
                                  {(materia.comisiones ?? []).map((comision) => (
                                    <div key={comision.id} className="flex justify-between items-center">
                                      <span className="text-gray-600">{comision.nombre}</span>
                                      <Badge variant="secondary">{formatCupo(comision)}</Badge>
                                    </div>
                                  ))}
                                  {(materia.comisiones ?? []).length === 0 && (
                                    <p className="text-gray-500">Sin comisiones cargadas</p>
                                  )}
                                </div>
                              </div>
                            </div>
                            <Button
                              className="w-full mt-4"
                              onClick={() => {
                                setSelectedMateria(materia);
                                setShowModal(true);
                              }}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Inscribirse
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {showModal && !authError && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <Card className="w-full max-w-md text-gray-900">
                <CardHeader>
                  <CardTitle className="text-gray-900">Nueva Inscripción</CardTitle>
                  <CardDescription className="text-gray-700">
                    {selectedMateria ? `Inscribirse a ${selectedMateria.nombre} ${selectedMateria.nivel ? `(Nivel ${selectedMateria.nivel})` : ''}` : 'Selecciona una materia y comisión'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {!selectedMateria ? (
                      <div>
                        <Label className="text-gray-800">Materia</Label>
                        <Select onValueChange={(value) => {
                          const materia = materiasDisponibles.find(m => m.id === parseInt(value));
                          setSelectedMateria(materia || null);
                        }} disabled={materiasDisponibles.length === 0}>
                          <SelectTrigger className="text-gray-900 placeholder:text-gray-500">
                            <SelectValue placeholder={materiasDisponibles.length === 0 ? "No hay materias disponibles" : "Selecciona una materia"} />
                          </SelectTrigger>
                          <SelectContent>
                            {materiasDisponibles.length === 0 ? (
                              <div className="p-2 text-sm text-gray-500 text-center">
                                No hay materias disponibles para tu plan de estudios
                              </div>
                            ) : (
                              materiasDisponibles.map((materia) => (
                                <SelectItem key={materia.id} value={materia.id.toString()}>
                                  {materia.nombre} {materia.nivel ? `(Nivel ${materia.nivel})` : ''}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <>
                        <div>
                          <Label className="text-gray-800">Materia seleccionada</Label>
                          <p className="text-sm font-medium mt-1 text-gray-900">{selectedMateria.nombre} {selectedMateria.nivel ? `(Nivel ${selectedMateria.nivel})` : ''}</p>
                        </div>
                        <div>
                          <Label className="text-gray-800">Comisión</Label>
                          <Select value={selectedComision} onValueChange={setSelectedComision}>
                            <SelectTrigger className="text-gray-900 placeholder:text-gray-500">
                              <SelectValue placeholder="Selecciona una comisión" />
                            </SelectTrigger>
                            <SelectContent>
                              {(selectedMateria.comisiones ?? []).map((comision) => (
                                <SelectItem
                                  key={comision.id}
                                  value={comision.id.toString()}
                                  disabled={comision.cupoDisponible === 0}
                                >
                                  {comision.nombre} ({comision.cupoDisponible}/{comision.cupoMaximo} cupos disponibles)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {selectedComision && (
                          <div className="bg-blue-50 p-3 rounded-md">
                            <p className="text-sm font-medium text-blue-900 mb-2">Horarios:</p>
                            {selectedMateria.comisiones
                              ?.find((c) => c.id === parseInt(selectedComision, 10))
                              ?.horarios?.map((horario, idx) => (
                                <p key={idx} className="text-sm text-blue-700">
                                  {horario.dia} {horario.horaInicio} - {horario.horaFin} (Aula {horario.aula})
                                </p>
                              ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
                <div className="flex gap-2 p-6 pt-0">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setShowModal(false);
                      setSelectedMateria(null);
                      setSelectedComision('');
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleInscripcion}
                    disabled={!selectedMateria || !selectedComision}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Confirmar Inscripción
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
