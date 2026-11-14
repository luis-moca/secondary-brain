"""Palabras y frases con las que se arman los archivos de ejemplo.

Todo es genérico: ningún nombre de empresa, cliente ni persona real. Las personas van solo con nombre de pila.
"""

PERSONAS = ["Diego", "Maria", "Sofia", "Carlos", "Lucia", "Pablo", "Andrea", "Mateo", "Valeria", "Javier",
            "Elena", "Hugo", "Paula", "Tomas", "Renata", "Bruno"]

ROLES = {
    "Diego": "líder de operaciones", "Maria": "analista de datos", "Sofia": "diseñadora de producto",
    "Carlos": "responsable de ventas", "Lucia": "soporte a clientes", "Pablo": "ingeniero de software",
    "Andrea": "gerente de proyecto", "Mateo": "investigador de usuarios", "Valeria": "marketing de contenido",
    "Javier": "finanzas", "Elena": "capacitación", "Hugo": "infraestructura", "Paula": "éxito del cliente",
    "Tomas": "calidad", "Renata": "alianzas", "Bruno": "dirección",
}

SUJETOS = [
    "El equipo", "La célula de producto", "El área de soporte", "Nuestro grupo de análisis", "La mesa de operaciones",
    "El comité de seguimiento", "El equipo de ventas", "La gente de capacitación", "El squad de datos",
    "El grupo piloto", "La coordinación", "El equipo de diseño", "El frente de clientes", "La oficina de proyectos",
    "El área de calidad", "El equipo de contenido", "La mesa de alianzas", "El grupo de infraestructura",
]

VERBOS = [
    "revisó", "priorizó", "documentó", "midió", "ajustó", "presentó", "validó", "simplificó", "automatizó",
    "comparó", "reorganizó", "probó", "cerró", "propuso", "detectó", "corrigió", "acordó", "publicó",
    "estimó", "midió de nuevo", "dividió", "planeó", "resumió", "entregó", "descartó", "retomó", "aterrizó",
    "consolidó", "calibró", "redactó",
]

OBJETOS = [
    "el tablero de métricas", "el flujo de alta de clientes", "la guía de onboarding", "el reporte semanal",
    "la lista de pendientes", "el guion de la llamada", "el plan de capacitación", "la plantilla de propuesta",
    "el proceso de cierre", "la encuesta de satisfacción", "el mapa de procesos", "la matriz de riesgos",
    "el calendario de entregas", "el inventario de herramientas", "el manual de soporte", "el roadmap del trimestre",
    "la base de preguntas frecuentes", "el análisis de cancelaciones", "el embudo de conversión", "la ficha del producto",
    "el resumen ejecutivo", "el piloto de automatización", "la bitácora de incidentes", "el tablero de tickets",
    "la definición de indicadores", "el formato de minuta", "la política de respuestas", "el catálogo de servicios",
    "la ruta del cliente", "el acuerdo de nivel de servicio", "la propuesta de precios", "el checklist de lanzamiento",
    "la segmentación de cuentas", "el pronóstico de demanda", "el material de ventas", "la agenda de la junta",
    "el esquema de comisiones", "el plan de comunicación", "el archivo de lecciones aprendidas", "la rúbrica de calidad",
]

COMPLEMENTOS = [
    "antes del cierre del mes", "con datos de las últimas cuatro semanas", "para la junta del lunes",
    "sin pedir trabajo extra a nadie", "junto con dos clientes piloto", "a partir de las notas de la llamada",
    "con una versión más corta", "para que se lea en dos minutos", "tomando como base el trimestre anterior",
    "con ayuda de una rutina automática", "en una sola página", "después de la retro", "con tres escenarios",
    "para el comité del jueves", "en menos de una semana", "separando lo urgente de lo importante",
    "con ejemplos reales del día a día", "sin cambiar las herramientas actuales", "con un responsable por tarea",
    "a petición del área de dirección", "con metas por semana", "y lo dejó listo para revisión",
    "para reducir el tiempo de respuesta", "con un costo estimado por mes", "a partir de una muestra de 40 casos",
    "con fecha de revisión en quince días", "para no repetir el mismo error", "dejando fuera lo que no mueve el número",
    "en un formato que cualquiera puede editar", "con una lista corta de decisiones",
]

CIFRAS = [
    "el tiempo promedio bajó de 6 a 4 días", "la tasa de respuesta subió a 38 %", "se cerraron 27 de 31 tickets",
    "la satisfacción quedó en 8.4 de 10", "el costo por caso bajó 12 %", "se ahorran cerca de 5 horas por semana",
    "la adopción llegó a 64 % del equipo", "las cancelaciones bajaron de 9 a 6 por mes", "se duplicó el uso del tablero",
    "el retrabajo bajó a la mitad", "quedaron 14 pendientes abiertos", "la conversión pasó de 11 % a 15 %",
    "se atendieron 120 solicitudes en el mes", "el error más común bajó 30 %", "se evitaron 3 escalamientos",
]

CONECTORES = [
    "Además,", "Por otro lado,", "En la siguiente revisión,", "Mientras tanto,", "Como resultado,", "Al final,",
    "Para cerrar,", "En paralelo,", "Con eso,", "De momento,", "A cambio,", "Según lo acordado,",
]

CIERRES = [
    "Queda pendiente confirmar el responsable.", "La siguiente revisión es en dos semanas.",
    "Hace falta validar el dato con la fuente original.", "Se comparte el resumen en el canal del equipo.",
    "La decisión final queda para la próxima junta.", "No se requiere presupuesto adicional.",
    "Se documenta en la carpeta del proyecto.", "Se mide otra vez al cierre del mes.",
    "Hay que avisar a los clientes piloto.", "El riesgo principal es la falta de tiempo del equipo.",
]

SECCIONES = [
    "Contexto", "Objetivo", "Hallazgos", "Siguientes pasos", "Riesgos", "Métricas", "Decisiones",
    "Preguntas abiertas", "Notas de la llamada", "Resumen", "Antecedentes", "Propuesta", "Alcance",
    "Responsables", "Calendario", "Presupuesto", "Lecciones aprendidas", "Pendientes", "Acuerdos", "Ideas sueltas",
]

TEMAS = [
    "Plan de lanzamiento", "Retro del sprint", "Revisión de indicadores", "Mejora del onboarding", "Piloto de automatización",
    "Guía para nuevos clientes", "Análisis de cancelaciones", "Propuesta de capacitación", "Mapa del proceso de ventas",
    "Encuesta trimestral", "Plan de comunicación", "Cierre de mes", "Investigación con usuarios", "Tablero de soporte",
    "Política de respuestas", "Catálogo de servicios", "Ruta del cliente", "Junta de seguimiento", "Plan anual",
    "Inventario de herramientas", "Reporte para dirección", "Calendario de entregas", "Matriz de riesgos",
    "Estrategia de contenido", "Pronóstico de demanda", "Estándar de calidad", "Esquema de comisiones",
    "Alianza piloto", "Manual de soporte", "Preguntas frecuentes",
]

PROYECTOS = ["Proyecto Atlas", "Proyecto Brújula", "Proyecto Cometa", "Proyecto Delta", "Proyecto Eco", "Proyecto Faro"]

HOJAS = ["Resumen", "Datos", "Semanas", "Clientes", "Metas", "Costos", "Tickets", "Encuesta", "Pronóstico", "Notas"]

COLORES = [(255, 196, 106), (255, 240, 214), (63, 208, 255), (79, 140, 255), (47, 224, 196), (169, 139, 255),
           (255, 106, 43), (255, 181, 71), (155, 225, 93), (240, 107, 214)]

TAREAS = [
    "Mandar el resumen semanal", "Revisar el tablero de métricas", "Preparar la junta de seguimiento",
    "Actualizar la guía de onboarding", "Cerrar los tickets viejos", "Validar los números del mes",
    "Agendar sesión con el cliente piloto", "Escribir la propuesta de capacitación", "Probar la rutina automática",
    "Ordenar la carpeta del proyecto", "Pedir acceso a la herramienta de datos", "Presentar el plan del trimestre",
]
