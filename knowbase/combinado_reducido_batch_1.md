# Manual Operativo para el Área de Soporte – Sistema Kermet

## 📚 Introducción General

Este manual está diseñado como una guía de referencia exhaustiva para el **área de soporte funcional**, que utiliza el sistema **Kermet**. El personal de soporte opera exclusivamente desde la **interfaz del sistema**, sin intervenir en el código fuente. Por tanto, este documento:

* Detalla la funcionalidad de cada módulo desde la experiencia del usuario.
* Proporciona flujos de trabajo claros, buenas prácticas y criterios de validación.
* Está basado en las clases, miembros y vistas ya implementadas en el sistema.
* Incluye manejo de errores, pasos para escalar problemas y cómo interpretar la lógica de negocio embebida.

---

## 🌐 Acceso y Contexto Operativo

### Ingreso al sistema

* El sistema se inicia desde scripts como `ddk.prg`, el cual lanza Kermet con parámetros automáticos.
* Visual FoxPro carga la configuración y entornos predefinidos.
* El sistema entra en el **Navegador principal**, donde se visualizan vistas y registros.

### Entornos operativos

* **Vista**: Es una lista de registros de una clase. Tiene herramientas para filtrar, ordenar y abrir elementos.
* **EV (Editor de Vista)**: Es el formulario donde se editan o visualizan registros. Tiene lógica de validaciones, eventos, formatos y ayudas integradas.
* **Preferencias**: Configuraciones ajustables a nivel usuario o empresa, que influyen en comportamientos por defecto.

---

## 🧩 Estructura General del Sistema Kermet

### Componentes del modelo de datos (sin código):

* **Clases**: Entidades funcionales como Clientes, Pedidos, Perfiles, Documentos, etc.
* **Miembros**: Campos que cada clase posee. Pueden tener validaciones, formatos y filtros asociados.
* **Eventos EV**: Permiten que un campo reaccione ante ciertas acciones (por ejemplo, validación o ingreso de datos).

Los formularios EV respetan reglas de negocio ya codificadas. Soporte debe conocer esas reglas desde el resultado visible.

---

## 📁 Módulos Funcionales

### 1. Gestión de Clientes y Usuarios Web

* **Ruta**: Clientes > Clientes / Usuarios Web
* **Objetivo**: Mantener información de clientes y permitir acceso a plataforma online.
* **Operaciones disponibles**:

  * Alta y edición de datos.
  * Carga de CUIT, IVA, contacto, direcciones.
  * Habilitar/inactivar usuarios web.
* **Validaciones**:

  * CUIT debe ser único y válido.
  * Estado "inhabilitado" bloquea operaciones relacionadas.

### 2. Gestión de Perfiles

* **Ruta**: Perfiles > Perfiles / Por clientes / Pinturas / Categorías
* **Objetivo**: Controlar el catálogo de perfiles de aluminio.
* **Funciones de interfaz**:

  * Asociar perfiles a clientes específicos.
  * Categorizar por línea, tipo y color.
  * Configurar precios, largo, pintura.
* **Validaciones embebidas**:

  * No se permiten caracteres especiales en nombres.
  * Validación de campos numéricos como largo de perfil, estirado, empalme.

### 3. Gestión de Pedidos

* **Ruta**: Pedidos > Pedidos web / tradicionales
* **Operaciones**:

  * Alta de pedidos.
  * Asignación de estado (en carga, confirmado, despachado).
  * Observaciones cargadas desde preferencias.
* **Campos con comportamiento especial**:

  * `obsPedido`: se carga automáticamente si está configurado.
  * `diasEntrega`: determina plazos estimados de forma automática.

### 4. Documentos Comerciales

* **Ruta**: Gestión > Documentos
* **Tipos**: Facturas, Notas de Crédito, Remitos, etc.
* **Interacción**:

  * Filtrado por tipo, número, cliente.
  * Visualización de datos asociados como líneas, productos, impuestos.
* **Eventos visibles**:

  * Documentos con validaciones específicas según el tipo (ventas o compras).

### 5. Cancelación y Corrección de Documentos

* **Ruta**: Gestión > Cancelación de Documentos
* **Función**: Modificar montos erróneos, deshacer correcciones.
* **Flujo funcional**:

  1. Filtrar documentos a corregir.
  2. Ejecutar "Deshacer correcciones" desde la acción disponible.
  3. Verificar cambios en la grilla.
* **Campos sensibles**:

  * `tipoCorreccion`, `montoCorreccion`, `fechaCorreccion`.

### 6. Impuestos ARBA

* **Ruta**: Generales > Impuestos ARBA
* **Procesos disponibles**:

  * Importar desde archivo `.txt`.
  * Aplicar alícuotas a empresas y documentos.
* **Mensajes clave**:

  * Confirmaciones para reemplazo masivo.
  * Error al importar si el archivo está malformado.

### 7. Reportes Legales (Libro IVA)

* **Ruta**: Generales > Reportes > Libro IVA
* **Funciones disponibles**:

  * Generar vistas por periodo.
  * Dividir por tipo de documento (electrónicos, POS, Zetas).
  * Generar descuentos, diferencias y ajustes automáticos.
* **Interfaz muestra**:

  * Totales por IVA, gravado, exento, etc.
  * Permite filtrar por origen y punto de venta.

---

## ⚙️ Preferencias y Configuraciones del Sistema

### Preferencias Generales (Empresa / Usuario)

* **Ruta**: Preferencias > Generales
* **Campos configurables**:

  * Largo máximo de perfil (tocho).
  * Estiradora, largo de cama.
  * Correo electrónico de administración.
  * Ordenar producción por compromiso.

### Preferencias Web

* **Ruta**: Preferencias > Web
* **Configuraciones**:

  * Mensaje predeterminado para pedidos online.
  * Activación de "enviar pinturas".
  * Campos virtuales editables por `editarvar()`.

---

## 🔍 Validaciones, Filtros y Búsqueda

### Tipos de Validaciones automáticas

* Campos obligatorios: mensaje de “campo vacío”.
* Comparación de fechas (fecha hasta > fecha desde).
* Nombres sin caracteres inválidos.

### Uso del filtro en el Navegador

* Buscar por nombre, código, fecha o campo relacionado.
* Acciones posibles:

  * Reordenar.
  * Abrir EV directamente.

---

## 🛑 Acciones no permitidas (Por soporte)

* No editar campos calculados.
* No modificar usuarios sin autorización.
* No usar caracteres especiales no permitidos.
* No forzar grabaciones si el sistema devuelve error.

---

## 🆘 Procedimientos ante errores

### Diagnóstico básico:

1. Verifica si el error aparece en un campo obligatorio.
2. Toma una captura de pantalla.
3. Describe qué acción generó el error.
4. Indica módulo y usuario afectado.

### Escalamiento:

* Contactar al área de desarrollo con:

  * Nombre del EV, clase y miembros.
  * Mensaje de error exacto.
  * Detalles del entorno (fecha, usuario, tipo de operación).

---

## 📌 Glosario Operativo

| Término     | Significado                                         |
| ----------- | --------------------------------------------------- |
| EV          | Formulario de edición de registro (Editor de Vista) |
| ABM         | Alta, Baja, Modificación                            |
| Clase       | Entidad funcional (Cliente, Pedido, etc.)           |
| Miembro     | Campo de una clase                                  |
| Preferencia | Configuración preestablecida                        |
| Vista       | Lista filtrada de registros                         |
| Documento   | Registro fiscal o comercial                         |

---

## 🔄 Flujo de trabajo recomendado por soporte

1. Revisar pedidos web nuevos cada mañana.
2. Confirmar despachos pendientes y alertas de entrega.
3. Verificar estados de matrices.
4. Validar correcciones aplicadas a documentos.
5. Generar libro IVA mensual.
6. Controlar logs de errores, si hay módulo de auditoría.

---

## 📝 Notas Finales

Este documento se debe revisar y actualizar en cada versión funcional. Toda observación puede ser enviada al equipo de desarrollo para análisis y corrección. Soporte tiene la responsabilidad de aplicar lo aquí documentado como procedimiento oficial.

© 2025 - Sistema Kermet - Documentación oficial del área de soporte.
