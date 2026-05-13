/**
 * Contenido educativo para métricas del laboratorio Strava (CTL/ATL, carga, etc.).
 * Usado por tooltips / modales; texto en español, orientativo (no clínico).
 */

/** @typedef {{ title: string, subtitle?: string, sections: { h: string; p: string }[] }} MetricHelp */

/** @type {Record<string, MetricHelp>} */
const METRICS = {
  ctl: {
    title: 'CTL (carga crónica)',
    subtitle: 'Tu “base de forma” estimada en el tracker',
    sections: [
      {
        h: 'Qué es',
        p: 'CTL resume cuánta carga de entrenamiento llevas acumulada en semanas recientes. No mide VO₂ máx ni salud: es un índice interno para ver si tu volumen habitual es alto o bajo respecto a tu propio historial.',
      },
      {
        h: 'Cómo lo calculamos aquí',
        p: 'A partir de tus sesiones importadas construimos una serie diaria de “carga heurística” (duración, intensidad declarada y FC media). CTL es una media exponencial con constante larga (~42 días): cambia despacio y refleja hábito, no un día suelto.',
      },
      {
        h: 'Qué significa en la práctica',
        p: 'Un CTL que sube con calma suele ir con más tolerancia al volumen. Un CTL que se dispara en pocas semanas puede ser señal de que estás metiendo mucho estímulo seguido: no es “malo” automáticamente, pero merece contexto (sueño, dolor, objetivo).',
      },
      {
        h: 'Cómo interpretarlo',
        p: 'Míralo junto a ATL y TSB. Si CTL y ATL suben juntos de forma ordenada, a menudo estás en un bloque de carga. Si ATL se separa mucho por encima de CTL, la fatiga aguda gana terreno a la base.',
      },
      {
        h: 'Qué puedes hacer',
        p: 'Si buscas progresión: sube volumen o frecuencia en pasos pequeños y mantén días muy fáciles. Si te sientes apagado o con molestias: prioriza sueño y una semana más plana aunque el CTL baje un poco: eso también es entrenar.',
      },
    ],
  },
  atl: {
    title: 'ATL (carga aguda)',
    subtitle: 'Lo que has metido “reciente”',
    sections: [
      {
        h: 'Qué es',
        p: 'ATL resume la carga de los últimos días con más peso que la CTL. Responde rápido: una semana dura sube ATL; unos días suaves la bajan.',
      },
      {
        h: 'Cómo lo calculamos aquí',
        p: 'Misma serie diaria de carga que CTL, pero con una constante corta (~7 días). Por eso ATL “late” antes que CTL.',
      },
      {
        h: 'Qué significa',
        p: 'ATL alto con buena sensación y sin síntomas de sobreuso puede ser un bloque intencional. ATL alto con mal sueño, irritabilidad o dolor mecánico merece frenar el acelerador.',
      },
      {
        h: 'Qué puedes hacer',
        p: 'Alterna días duros con días realmente fáciles. Si ATL lleva semanas por las nubes, introduce descarga aunque pierdas sensación de “ritmo”.',
      },
    ],
  },
  tsb: {
    title: 'TSB (forma / frescor orientativo)',
    subtitle: 'CTL − ATL en este modelo',
    sections: [
      {
        h: 'Qué es',
        p: 'TSB es la diferencia entre tu base estimada (CTL) y tu fatiga reciente (ATL). Valores positivos suelen asociarse a más margen; negativos, a más fatiga acumulada.',
      },
      {
        h: 'Cómo lo calculamos aquí',
        p: 'TSB = CTL − ATL con las mismas series exponenciales heurísticas. No es el TSB “oficial” de software profesional: es una aproximación para ayudarte a ver tendencias.',
      },
      {
        h: 'Cómo interpretarlo',
        p: 'Un TSB ligeramente negativo durante un mes de carga puede ser normal. Un TSB muy negativo durante muchas semanas sin descarga aumenta riesgo de agotamiento o lesión por sobrecarga.',
      },
      {
        h: 'Qué puedes hacer',
        p: 'Si TSB está muy negativo y te sientes mal: baja volumen o intensidad 48–72 h y duerme más. Si TSB está muy positivo y te sientes bien: puedes plantear progresión o un estímulo controlado.',
      },
    ],
  },
  monotony: {
    title: 'Monotonía (7 días)',
    subtitle: '¿Tu semana es “todo al mismo tono”?',
    sections: [
      {
        h: 'Qué es',
        p: 'Mide si cada día aporta una carga parecida. Semanas muy monótonas suelen ser semanas sin contrastes (todo medio‑duro o todo igual de largo).',
      },
      {
        h: 'Cómo lo calculamos aquí',
        p: 'A partir de la carga diaria de los últimos 7 días: ratio entre la media y la desviación típica. Valores altos = poca variación día a día.',
      },
      {
        h: 'Por qué importa',
        p: 'Los planes robustos suelen alternar estímulo y recuperación. Mucha monotonía + mucha carga es un patrón de riesgo de fatiga “silenciosa”.',
      },
      {
        h: 'Qué puedes hacer',
        p: 'Mete al menos 1–2 días muy fáciles o cortos y reserva los duros para cuando estés descansado. Cambia el estímulo (ritmos, terreno, duración).',
      },
    ],
  },
  strain7: {
    title: 'Σ7d (carga bruta 7 días)',
    subtitle: 'Suma de “puntos de carga” heurísticos',
    sections: [
      {
        h: 'Qué es',
        p: 'Es la suma de la carga estimada de cada sesión en la ventana de 7 días calendario. Sirve para comparar semanas entre sí.',
      },
      {
        h: 'Cómo lo calculamos aquí',
        p: 'Cada sesión recibe un score 0–100 a partir de minutos, intensidad y FC media. Luego sumamos los últimos 7 días.',
      },
      {
        h: 'Cómo interpretarlo',
        p: 'Compara con semanas anteriores: un salto grande sin más sueño ni más experiencia suele ser el momento de revisar si el salto era necesario.',
      },
      {
        h: 'Qué puedes hacer',
        p: 'Si la suma sube mucho: mantén frecuencia pero baja un escalón de intensidad o duración en 1–2 sesiones clave.',
      },
    ],
  },
  session_load: {
    title: 'Carga por sesión (0–100)',
    subtitle: 'Heurística interna del tracker',
    sections: [
      {
        h: 'Qué es',
        p: 'Una nota orientativa de “esfuerzo acumulado” de esa sesión concreta, para comparar entrenos entre sí.',
      },
      {
        h: 'Cómo la calculamos',
        p: 'Combinamos duración, intensidad que marcas en la importación y FC media (si existe) para subir o bajar el peso. Luego acotamos a 0–100.',
      },
      {
        h: 'Limitaciones',
        p: 'No conoce variabilidad cardíaca ni lagunas de datos de FC. Trátalo como brújula, no como verdad absoluta.',
      },
    ],
  },
};

/**
 * @param {string} id
 * @returns {MetricHelp|null}
 */
export function getStravaMetricHelp(id) {
  const k = String(id || '').toLowerCase().trim();
  return METRICS[k] || null;
}

/**
 * HTML seguro (texto escapado) para Swal o panel.
 * @param {string} id
 */
export function formatStravaMetricHelpHtml(id) {
  const m = getStravaMetricHelp(id);
  if (!m) {
    return '<p class="text-sm text-slate-600">No hay explicación para esta métrica todavía.</p>';
  }
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const blocks = m.sections
    .map(
      (s) =>
        `<div class="mb-3 text-left"><p class="text-[11px] font-black uppercase tracking-wide text-orange-600">${esc(s.h)}</p><p class="text-[13px] leading-relaxed text-slate-700">${esc(s.p)}</p></div>`
    )
    .join('');
  const sub = m.subtitle ? `<p class="text-xs text-slate-500 mb-3 text-left">${esc(m.subtitle)}</p>` : '';
  return `${sub}${blocks}<p class="text-[11px] text-slate-400 mt-2 text-left">Orientación deportiva general. No sustituye valoración médica ni entrenador presencial.</p>`;
}
