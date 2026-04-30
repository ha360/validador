-- =============================================
-- URT Sistema — Schema inicial
-- Correr en Supabase SQL Editor
-- =============================================

-- Perfiles de usuario (extiende auth.users de Supabase)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'analista' CHECK (rol IN ('admin','analista','visualizador')),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Acceso a módulos por usuario
CREATE TABLE IF NOT EXISTS modulos_acceso (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  modulo TEXT NOT NULL CHECK (modulo IN ('dashboard','validador','matriz','admin')),
  habilitado BOOLEAN DEFAULT true,
  UNIQUE(user_id, modulo)
);

-- Registro de uso del validador
CREATE TABLE IF NOT EXISTS uso_validador (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  fecha TIMESTAMPTZ DEFAULT NOW(),
  resguardo TEXT,
  resultado TEXT CHECK (resultado IN ('APROBADO','APROBADO_CON_OBSERVACIONES','RECHAZADO')),
  num_documentos INTEGER DEFAULT 0,
  num_fallas INTEGER DEFAULT 0
);

-- Matriz de eventos (basada en hoja MATRIZ 2026 del Excel)
CREATE TABLE IF NOT EXISTS eventos (
  id SERIAL PRIMARY KEY,
  no_solicitud INTEGER,
  no_evento_operador TEXT,
  meta TEXT,
  enlace TEXT,
  fecha_solicitud DATE,
  direccion_territorial TEXT,
  objeto_evento TEXT,
  tipologia TEXT,
  actividad_asociada TEXT,
  departamento TEXT,
  municipio TEXT,
  fecha_inicio DATE,
  fecha_fin DATE,
  dias_evento INTEGER,
  nombre_responsable TEXT,
  telefono_responsable TEXT,
  email_responsable TEXT,
  num_asistentes INTEGER,
  poblacion TEXT,
  nombre_comunidad TEXT,
  valor_aprobado NUMERIC(15,2),
  valor_ejecutado NUMERIC(15,2),
  estado TEXT,
  estado_tramite TEXT,
  legalizado BOOLEAN DEFAULT false,
  recibido_satisfaccion BOOLEAN DEFAULT false,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Row Level Security (RLS)
-- =============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE modulos_acceso ENABLE ROW LEVEL SECURITY;
ALTER TABLE uso_validador ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;

-- profiles: cada usuario ve solo el suyo; admin ve todos
CREATE POLICY "usuarios_ven_su_perfil" ON profiles
  FOR SELECT USING (auth.uid() = id OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin'
  ));
CREATE POLICY "admin_gestiona_perfiles" ON profiles
  FOR ALL USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin'
  ));

-- modulos_acceso: usuario ve sus módulos; admin gestiona todos
CREATE POLICY "usuarios_ven_sus_modulos" ON modulos_acceso
  FOR SELECT USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin'
  ));
CREATE POLICY "admin_gestiona_modulos" ON modulos_acceso
  FOR ALL USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin'
  ));

-- uso_validador: usuario inserta el suyo; admin ve todos
CREATE POLICY "usuario_inserta_uso" ON uso_validador
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "usuario_ve_su_uso" ON uso_validador
  FOR SELECT USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin'
  ));

-- eventos: cualquier autenticado con acceso a 'matriz' puede leer
CREATE POLICY "autenticados_leen_eventos" ON eventos
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin_gestiona_eventos" ON eventos
  FOR ALL USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol = 'admin'
  ));

-- Historial de cambios de estado de eventos
CREATE TABLE IF NOT EXISTS eventos_cambios (
  id SERIAL PRIMARY KEY,
  evento_id INTEGER REFERENCES eventos(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  campo TEXT NOT NULL,
  valor_anterior TEXT,
  valor_nuevo TEXT,
  notas TEXT,
  fecha TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE eventos_cambios ENABLE ROW LEVEL SECURITY;

-- autenticados con acceso a 'matriz' pueden leer el historial
CREATE POLICY "autenticados_leen_cambios" ON eventos_cambios
  FOR SELECT USING (auth.uid() IS NOT NULL);
-- admin o analista pueden insertar cambios
CREATE POLICY "autenticados_insertan_cambios" ON eventos_cambios
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Permitir upsert en eventos (admin puede actualizar)
CREATE POLICY "admin_actualiza_eventos" ON eventos
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','analista')
  ));

-- =============================================
-- Función para crear perfil automáticamente
-- al registrar un nuevo usuario
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nombre, email, rol)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'rol', 'analista')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- Módulos adicionales (migración)
-- =============================================

-- Ampliar constraint de modulos_acceso para nuevos módulos
ALTER TABLE modulos_acceso DROP CONSTRAINT IF EXISTS modulos_acceso_modulo_check;
ALTER TABLE modulos_acceso ADD CONSTRAINT modulos_acceso_modulo_check
  CHECK (modulo IN ('dashboard','validador','matriz','admin','tarifario','directorio','presupuesto','caja_menor'));

-- Tarifario (hoja TARIFARIO del Excel)
CREATE TABLE IF NOT EXISTS tarifario (
  id SERIAL PRIMARY KEY,
  item TEXT NOT NULL,
  sub_item TEXT,
  rango TEXT,
  departamento TEXT NOT NULL,
  zona TEXT,
  valor_unitario NUMERIC(15,2)
);
ALTER TABLE tarifario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "autenticados_leen_tarifario" ON tarifario
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin_gestiona_tarifario" ON tarifario
  FOR ALL USING ((auth.jwt()->'user_metadata'->>'rol') = 'admin')
  WITH CHECK ((auth.jwt()->'user_metadata'->>'rol') = 'admin');

-- Directorio de contactos (hoja DISTRIBUCIÓN ENLACES)
CREATE TABLE IF NOT EXISTS directorio (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  cargo TEXT,
  email TEXT,
  telefono TEXT,
  departamento TEXT,
  zona TEXT,
  tipo TEXT
);
ALTER TABLE directorio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "autenticados_leen_directorio" ON directorio
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin_gestiona_directorio" ON directorio
  FOR ALL USING ((auth.jwt()->'user_metadata'->>'rol') = 'admin')
  WITH CHECK ((auth.jwt()->'user_metadata'->>'rol') = 'admin');

-- Pagos y presupuesto (hoja PAGOS)
CREATE TABLE IF NOT EXISTS pagos (
  id SERIAL PRIMARY KEY,
  no_evento TEXT,
  no_solicitud INTEGER,
  proveedor TEXT,
  concepto TEXT,
  no_factura TEXT,
  valor NUMERIC(15,2),
  fecha_pago DATE,
  estado TEXT,
  observaciones TEXT
);
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "autenticados_leen_pagos" ON pagos
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin_gestiona_pagos" ON pagos
  FOR ALL USING ((auth.jwt()->'user_metadata'->>'rol') = 'admin')
  WITH CHECK ((auth.jwt()->'user_metadata'->>'rol') = 'admin');

-- Caja menor (hoja EVENTOS CAJA MENOR)
CREATE TABLE IF NOT EXISTS caja_menor (
  id SERIAL PRIMARY KEY,
  no_evento TEXT,
  no_solicitud INTEGER,
  fecha DATE,
  concepto TEXT,
  beneficiario TEXT,
  valor NUMERIC(15,2),
  tipo_gasto TEXT,
  no_soporte TEXT,
  observaciones TEXT
);
ALTER TABLE caja_menor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "autenticados_leen_caja" ON caja_menor
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin_gestiona_caja" ON caja_menor
  FOR ALL USING ((auth.jwt()->'user_metadata'->>'rol') = 'admin')
  WITH CHECK ((auth.jwt()->'user_metadata'->>'rol') = 'admin');
