/**
 * Consejos de "Combustible" / control de dieta: combinatoria alta + semilla por estado del día
 * y momento de apertura (no siempre los mismos textos fijos).
 * El HTML del modal debe escapar XSS en nombres de alimentos si se inyectan.
 */
(function (global) {
  'use strict';

  function djb2(str) {
    let h = 5381;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rng, arr) {
    const a = arr && arr.length ? arr : ['—'];
    return a[Math.floor(rng() * a.length) % a.length];
  }

  function stripHtmlKey(s) {
    return String(s || '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }

  const OPEN = [
    'Viendo tu día hasta ahora',
    'Con el registro actual',
    'Según lo que llevas cargado',
    'Ajustado a tu ritmo de hoy',
    'Con la foto nutricional de ahora',
    'Leído en clave práctica',
    'Sin dramatismos: orientación',
    'Paso a paso para hoy',
    'Prioridad: consistencia',
    'Enfoque hábito, no perfección',
    'Con tus números reales',
    'Traduciendo datos a acción',
    'Un empujón pequeño',
    'Micro-ajuste sugerido',
    'Siguiente movimiento sensato',
    'Para cerrar el día bien',
    'Para no quedarte a medias',
    'Si buscas claridad',
    'Si hoy va intenso',
    'Si hoy va más suave',
    'Si aún quedan comidas',
    'Si ya casi cierras macros',
    'Si el hambre va y viene',
    'Si el tiempo aprieta',
    'Si quieres algo simple',
    'Si quieres algo contundente',
    'Si entrenas más tarde',
    'Si entrenaste ya',
    'Si vas a estudiar después',
    'Si el estómago va sensible',
    'Si hoy toca comer fuera',
    'Si cocinas en casa',
    'Si comes tupper',
    'Si entras tarde del trabajo',
    'Si madrugaste',
    'Si llevas varias horas sin comer',
    'Si ya llevabas buena racha ayer',
    'Si hoy empezaste tarde el registro',
    'Si quieres cerrar macros sin drama',
    'Si quieres margen para un capricho',
    'Si el finde fue movido',
    'Si hoy es día “oficina”',
    'Si hoy es día “pie de calle”',
    'Si hace frío',
    'Si hace calor',
    'Si entrenas en ayunas a veces',
    'Si nunca entrenas en ayunas',
    'Si vas a cena social',
    'Si hoy no sales de casa',
  ];

  const MID_CARB = [
    'reparte los carbos en 2–3 tomas en vez de uno solo pico.',
    'prioriza carbos con fibra (legumbre, integral, fruta) para estabilizar energía.',
    'si falta carbo, suma un extra pequeño (fruta o pan integral) en la siguiente comida.',
    'si sobra carbo vs objetivo, baja un poco el refresco o el extra dulce, no la verdura.',
    'si corres o pedaleas, deja un “colchón” de carbo cerca del esfuerzo.',
    'si no entrenas, no hace falta forzar un batido gigante de carbos.',
    'combina carbo + proteína para saciedad (yogur + avena, sándwich completo).',
    'si el día es mental, un poco más de carbo fino puede ayudar al foco (sin pasarte).',
    'si te cuesta llegar a carbo, añade fruta como “postre útil” en comida o cena.',
    'si te pasas de carbo, no castigues: mañana ajustas; hoy solo ordena la siguiente toma.',
    'patata/arroz/pasta: elige una por comida y mide cucharones para no ir a ojo.',
    'merienda: un carbo pequeño + prote evita el “bajón” de media tarde.',
    'pre-entreno: algo digestivo (plátano + yogur) suele ir fino si lo toleras.',
    'post-entreno: no hace falta industrial; bocadillo + fruta también cumple.',
    'si el hambre es ansiedad, prueba té + prote antes de picar dulce.',
    'si quieres saciedad, suma verdura cocida de volumen con poca aceituna de más.',
    'si te gusta el pan, bájale grasas visibles al resto del plato para equilibrar.',
    'si bebes alcohol hoy, hidrata y no apriques déficit extremo a la vez.',
    'si comes poco pescado, legumbre + cereales combina aminoácidos (sin obsesionarte).',
    'si te levantas con hambre, desayuno con prote suele anclar el apetito del día.',
    'si cenas tarde, intenta que el carbo “pesado” no sea justo antes de dormir.',
    'si haces muchas horas de pie, un carbo moderado en comida ayuda a aguantar.',
    'si vas a estudiar de noche, evita solo dulce: añade yogur o leche fermentada.',
    'si entrenas dos veces, reparte carbo; no lo concentres solo al final.',
    'si te sientes hinchado, revisa refrescos y chiclas, no solo el pan.',
    'si quieres progreso, mide una semana el patrón de carbo, no un solo día.',
    'si te cuesta verdura, empieza con 150 g medidos y sube poco a poco.',
  ];

  const MID_PROT = [
    'reparte la proteína en varias comidas; suele digerir mejor.',
    'si falta proteína, suma un ancla fácil: yogur/batido/pechuga/lentejas.',
    'si ya vas bien de proteína, no obsesiones: mira el resto del plato.',
    'post-gym: apunta a una proteína completa en la siguiente ventana.',
    'si comes poco pescado, alterna legumbres o soja para variar aminoácidos.',
    'si te sacia mucho la proteína, baja el aceite del plato para compensar kcal.',
    'si te cuesta la prote, “ancla” 30–40 g en desayuno y ya llevas ventaja.',
    'carnes magras: plancha/horno suele sumar menos kcal ocultas que rebozados.',
    'pescado 2×/sem: si no llegas, alterna huevo + legumbre en días sin pescado.',
    'batido: útil, pero no es obligatorio si ya comes bien de día.',
    'si entrenas poco, no fuerces 2 g/kg si no te entra: sube con calma.',
    'si entrenas mucho, reparte prote para no saturar digestión de una sola comida.',
    'queso: mide porciones; suma prote pero también kcal rápido.',
    'embutido: cuenta como prote + grasa; no como “solo prote”.',
    'si eres vegano, rota soja/lenteja/garbanzo para no aburrirte.',
    'si eres vegetariano, huevo + lácteos ayudan a cerrar leucina sin complicarte.',
    'si te duele estómago con mucha prote, baja el aceite y reparte mejor.',
    'si haces ayuno intermitente, la primera comida con prote suele anclar hambre.',
    'si comes fuera, pide doble verdura y una prote clara (pollo/pescado).',
    'si te saltas comidas, la prote se “acumula” mal: reparte.',
    'si solo comes “ensalada”, añade garbanzos o atún para no quedarte corto.',
    'si te gusta el yogur, el griego suele ser buen atajo de prote.',
    'si cocinas batch, congela porciones iguales para no ir a ojo.',
    'si te cuesta masticar, tiras de pechuga: prueba mechada o muslo sin piel.',
    'si entrenas por la mañana, desayuno con prote marca el tono del día.',
    'si entrenas por la noche, cena con prote ayuda a recuperación sin mil shakes.',
    'si quieres saciedad, combina prote + fibra (no solo prote).',
    'si te pasas de prote y te falta carbo, el entreno puede resentirse.',
    'si te pasas de prote y te falta grasa, piel/cabello a veces lo notan: revisa aceites.',
    'si quieres algo simple: 2 huevos + pan integral + fruta es un buen mínimo.',
    'si quieres algo rápido: brik de batido + fruta + puñado de frutos secos medido.',
    'si quieres barato: lentejas cocidas + arroz + sofrito fino.',
    'si quieres gourmet sin liarte: pescado al vapor + patata + ensalada.',
    'si te hinchas con legumbres, empieza con porciones pequeñas y sube.',
    'si no te gusta el pescado, prueba latas de caballa/sardina en tomate.',
    'si entrenas fuerza, reparte prote sin obsesionarte con el minuto exacto.',
    'si entrenas cardio largo, no dejes la prote “para después nunca”.',
    'si haces déficit, mantén prote razonable para no perder demasiado músculo.',
    'si haces volumen, la prote importa, pero también duermes y entrenas.',
  ];

  const MID_FAT = [
    'grasas: prioriza aceite de oliva, fruto seco medido y pescado azul cuando toque.',
    'si el día es de estrés, un poco más de grasa de calidad suele sentarse mejor que picoteo dulce.',
    'si saturadas van altas, cambia untable/embutido por opción magra una vez.',
    'omega-3: pescado azul 1–2×/sem o frutos secos medidos si encaja en tu plan.',
    'aceite: 1 cucharada medida vale más que “un chorrito largo”.',
    'aguacate: buena grasa, pero suma kcal: mitad puede bastar.',
    'frutos secos: 25–35 g medidos; el puñado “grande” se dispara en kcal.',
    'mantequilla/nata: útiles en cocina; si el día va justo de kcal, baja un punto.',
    'si te cuesta comer pescado, prueba latas: prácticas y ricas en grasas buenas.',
    'si comes mucho ultraprocesado, a veces suben grasas trans/ocultas: rota platos simples.',
    'si te sientes “seco”, revisa agua antes de subir grasas o carbos.',
    'si haces mucho cardio, un poco más de grasa puede ayudar a saciedad.',
    'si haces poco cardio, no necesitas “ketear” sin motivo: equilibrio manda.',
    'si te gusta freír, airfryer/horno reduce aceite absorbido.',
    'si te gusta el chocolate, negro 75–85% en porción pequeña suele encajar mejor.',
    'si cenas muy tarde, grasa pesada + mucho volumen puede molestar al dormir.',
    'si desayunas fuerte en grasa y luego te caes, prueba repartir un poco a mediodía.',
    'si te pasas de kcal por salsas, cambia a yogur especiado/mostaza/hierbas.',
    'si comes fuera, pide aliño aparte y tú controlas.',
    'si te aburres, rota aceites (oliva/semillas) sin mil cosas raras.',
    'si quieres piel sana, no olvides vitamina C con hierro vegetal cuando toque.',
    'si entrenas pronto, desayuno no tiene que ser “0 grasas”; tolerancia manda.',
    'si entrenas tarde, grasa moderada en comida puede funcionar bien.',
    'si haces déficit, no elimines grasa esencial: mínimos sensatos.',
    'si haces volumen, no uses grasa como único truco para subir kcal: reparte.',
    'si te sientes inflamado, revisa alcohol, fritura y sueño antes de culpar a un macro.',
    'si te gusta el queso curado, reduce otro extra calórico del plato.',
    'si te gusta el salmón ahumado, cuenta sodio si sube sed/hinchazón.',
    'si tomas mucho café, hidrata igual: cafeína no “cuenta” como agua.',
    'si haces ayuno, primera comida con algo de grasa puede ayudar a saciedad.',
    'si eres muy activo, bajar grasa demasiado a veces baja hormonas/ánimo: vigila.',
    'si eres poco activo, grasa alta + carbo alto + déficit raro: revisa coherencia.',
    'si quieres adherencia, elige grasas que te gusten de verdad (medidas).',
    'si te mareas con dietas raras, vuelve a básicos: oliva + pescado + frutos secos medidos.',
    'si viajas, frutos secos en bolsita evitan snacking peor en aeropuerto.',
    'si estudias, un poco de grasa con la comida puede alargar saciedad vs solo azúcar.',
    'si entrenas fuerza, grasa no es “enemiga”; el contexto del día importa.',
    'si quieres mejorar digestión, reparte grasa y no te la comas todo en una cena.',
  ];

  const MID_HYDR = [
    'agua: vasos repartidos > un solo litro de golpe.',
    'si sudas o hace calor, suma un poco de sal en comida + agua (sin exagerar).',
    'si estudias mucho, hidratar también es “rendimiento cognitivo”.',
    'botella visible en mesa = más vasos sin pensar.',
    'si sudas en gym, agua + comida con un poco de sal suele ir mejor que solo agua.',
    'si te despiertas seco, primer vaso al levantarte marca tono del día.',
    'si bebes mucho café, suma un vaso de agua por cada dos cafés (regla práctica).',
    'si haces cardio al sol, hidrata antes, durante (sorbos) y después.',
    'si comes salado, no confundas sed con hambre: prueba agua primero.',
    'si entrenas hipertrofia largo, sorbos entre series ayudan más que atracón al final.',
    'si te cuesta beber agua, prueba agua con limón/te frío sin calorías.',
    'si viajas en avión, hidrata extra (aire seco).',
    'si tomas creatina, mantén hábito de agua estable (no hace falta miedo, sí constancia).',
    'si bebes alcohol, intercala agua: mañana lo agradeces.',
    'si haces comida picante, agua sí; refresco azucarado suele empeorar sed.',
    'si entrenas en gimnasio caliente, lleva botella grande visible.',
    'si trabajas remoto, alarma cada 90 min para un vaso.',
    'si eres de “olvidar beber”, amarra el hábito a comidas: 1 vaso antes de comer.',
    'si sudas poco pero hablas mucho (clases/reuniones), hidrata igual.',
    'si haces ayuno, agua sí; no confundas ligereza con deshidratación.',
    'si entrenas por la mañana, hidratar desde la víspera ayuda al despertar.',
    'si te duele cabeza con calor, agua + sombra primero; luego miras comida.',
    'si tomas suplementos en pastillas, agua suficiente ayuda a tolerancia digestiva.',
    'si haces bicicleta larga, planifica puntos de agua (orientativo).',
    'si corres, no esperes a “morir de sed” para beber: sorbos tempranos.',
    'si comes fibra alta, agua ayuda a que la fibra trabaje bien.',
    'si entrenas con Strava duro, suma un vaso extra al cierre del entreno.',
    'si haces sauna/baño caliente, hidrata después con calma.',
    'si te levantas para orinar mucho de noche, reparte agua del día (no solo noche).',
    'si bebes mucha agua de golpe, a veces molesta: mejor reparto.',
    'si te sientes mareado en entreno, para y revisa agua + carbo + sueño.',
    'si haces déficit, sed puede confundirse: revisa objetivos de agua explícitos.',
    'si haces volumen, más comidas a veces = más momentos para hidratar.',
    'si te olvidas, vincula a cada café un vaso de agua.',
    'si entrenas en frío, igual hidratas: el sudor existe aunque no lo notes tanto.',
    'si comes mucha prote en polvo, agua ayuda a digestión en muchas personas.',
    'si haces comida muy salada un día, agua + potasio de comida (patata/plátano) puede ayudar.',
    'si viajas en bus, botella reutilizable evita comprar azucarado por sed.',
    'si estudias en biblioteca, lleva botella; si no, acabas en máquina.',
  ];

  const MID_SLEEP = [
    'sueño bajo: hoy evita picos de azúcar simple y cuida la última comida tarde.',
    'sueño justo: no metas déficit agresivo + entreno duro el mismo día si puedes.',
    'si duermes poco, cafeína tarde puede empeorar el ciclo: corta antes si puedes.',
    'si duermes mal, evita pantalla fuerte justo antes: cliché, pero ayuda a mucha gente.',
    'si roncas y te despiertas, es médico; aquí solo nutrición orientativa.',
    'si entrenas tarde y no duermes, baja intensidad un día: recuperas más.',
    'si haces déficit + mal sueño, prioriza prote y agua antes de “apretar más”.',
    'si madrugas, intenta acostarte un poco antes aunque sea 20 minutos.',
    'si siestas larga, puede robar sueño nocturno: acorta si te cuesta dormir.',
    'si cenas tarde, digestión puede robar descanso: adelanta un poco si puedes.',
    'si bebes alcohol, sueño fragmentado es común: hidrata y no combines con déficit extremo.',
    'si estudias hasta tarde, una merienda pequeña puede evitar cena enorme a las tantas.',
    'si te levantas con hambre nocturna, revisa cena (prote + fibra).',
    'si haces cardio intenso tarde, a veces cuesta dormir: prueba bajar intensidad última hora.',
    'si duermes bien, es buen día para apretar entreno o déficit (con sensatez).',
    'si duermes fatal, no es día de “premiar” con ultraprocesado: suele empeorar ciclo.',
    'si viajas con jet lag, luz diurna + rutina de comidas ayuda más que mil trucos.',
    'si trabajas turnos, estabilidad de comidas simples suele ayudar más que complicarte.',
    'si te despiertas con sed, agua al levantarte y revisa cena salada.',
    'si te despiertas con hambre, prueba cena con más volumen/prote mañana.',
    'si duermes poco y entrenas fuerte, el riesgo de lesión sube: baja volumen un día.',
    'si duermes poco y estudias mucho, prioriza una comida estable de mediodía.',
    'si duermes poco y haces déficit, vigila no caer en restricción + insomnio.',
    'si duermes mucho y te sientes pesado, revisa última comida y líquidos.',
    'si el sueño mejora, aprovecha para fijar un patrón de comidas repetible.',
    'si el sueño empeora, simplifica: menos decisiones, más platos básicos.',
    'si te levantas pronto a entrenar, algo pequeño digestible puede ayudar si lo toleras.',
    'si no puedes dormir por ansiedad, no combines ayuno extremo + cafeína alta.',
    'si haces siesta corta (20 min), suele refrescar sin robar noche.',
    'si haces siesta larga, prueba alarma para no desplazar cena.',
    'si duermes con hambre, revisa si te faltó prote o cena demasiado “ligera”.',
    'si duermes con acidez, revisa cena grasosa/tardía y refrescos.',
    'si duermes mal por calor, cena más ligera y agua repartida.',
    'si duermes mal por frío, cena caliente y hidrata igual.',
    'si te despiertas con dolor de cabeza, hidrata; si persiste, médico.',
    'si el sueño es tu cuello de botella, nutrición ayuda, pero no lo sustituye.',
  ];

  const MID_STEP = [
    'pasos altos: hidrata y no te quedes sin carbo en la cena.',
    'pocos pasos: suma caminatas cortas; suman sin cansar el plan.',
    'pasos medios: sube un poco NEAT con llamadas caminando.',
    'si subes escaleras, cuenta como “bonus” de salud; no hace falta contabilizarlo perfecto.',
    'si trabajas sentado, cada hora 3 minutos de piernas ayudan circulación.',
    'si haces 12k+ pasos, hidrata y no te quedes en déficit extremo sin querer.',
    'si haces <4k pasos, dos paseos de 8 minutos ya mueven el dial.',
    'si llueve, pasillos largos o subir/bajar escaleras cuentan.',
    'si hace calor, camina a la sombra y hidrata: pasos sin drama térmico.',
    'si viajas, andar aeropuerto/estación suma: no lo subestimes.',
    'si tienes perro, consistencia de pasos suele ser más fácil.',
    'si no tienes perro, música/audiolibro hace el paseo más llevadero.',
    'si te duelen rodillas, pasos suaves + calzado razonable primero.',
    'si quieres más pasos sin “entreno”, aparca más lejos una vez al día.',
    'si quieres más pasos, baja una parada antes en transporte público.',
    'si haces fuerza y muchos pasos, come suficiente para no ir fundido.',
    'si haces cardio y muchos pasos, cuida recuperación y sueño.',
    'si eres de casa, “limpieza activa” suma pasos sin inventar deporte nuevo.',
    'si eres de oficina, reunión caminando 10 minutos puede ser oro.',
    'si cuentas pasos, no obsesiones: es señal de movimiento, no moralidad.',
    'si subes pasos, no tienes por qué subir kcal automáticamente: mira hambre.',
    'si bajan pasos por enfermedad, prioriza recuperar, no forzar.',
    'si suben pasos por turismo, disfruta y ajusta hambre con sensatez.',
    'si haces 20k un día suelto, no es tu “nuevo normal”: hidrata y come estable.',
    'si haces pocos pasos pero mucho gym, el día puede ser duro igual: come bien.',
    'si haces muchos pasos y poco gym, fuerza igual importa para salud.',
    'si quieres adherencia, elige un paseo fijo (misma hora) como ancla.',
    'si te aburres, cambia ruta: el cerebro pide novedad.',
    'si caminas rápido, no hace falta correr para “validar” el día.',
    'si caminas lento, también suma: consistencia > velocidad.',
    'si tienes hijos, jugar activivo suma pasos sin “entreno”.',
    'si tienes trabajo físico, tus pasos pueden ser altos sin gym: come acorde.',
    'si tienes trabajo físico y gym, recupera: sueño y comida simple.',
    'si haces teletrabajo, microcaminos de 2 minutos cada hora suman.',
    'si haces presencial, usa escaleras cuando sea razonable.',
    'si te comparas con otros, ignora: pasos dependen de vida, no de mérito.',
    'si quieres subir pasos sin ansiedad, sube un 10% esta semana y ya.',
  ];

  const CLOSE = [
    'Es orientativo: ajusta a tu tolerancia y horarios.',
    'Si no cuadra con tu rutina, recorta solo un detalle y ya.',
    'Mañana se reevalúa con datos nuevos.',
    'La constancia gana al “día perfecto”.',
    'Si ya vas bien, no añadas complejidad.',
    'Si vas justo, una sola palanca (agua, prote o carbo) basta.',
    'Si te abruma, simplifica el plato: 3 ingredientes y listo.',
    'Si te motiva, anota un solo número y mejora eso mañana.',
    'Si te estresa, vuelve a lo básico una semana.',
    'Si te comparas con ayer, mejor que con Instagram.',
    'Si te sale mal una comida, la siguiente es tu “reset”.',
    'Si te sale bien, no cambies todo: fija el patrón.',
    'Si te falta tiempo, elige “suficientemente bueno”.',
    'Si te sobra tiempo, no compliques: cocina simple.',
    'Si te aburre la dieta, rota 2 desayunos y 2 cenas base.',
    'Si te apetece social, planifica, no prohibas por sistema.',
    'Si te apetece quedarte en casa, también puedes comer bien.',
    'Si viajas, regla del “plato simple” suele salvar.',
    'Si entrenas fuerte, no castigues comida si el hambre es real.',
    'Si no entrenas, no pasa nada: ajusta hambre sin culpa.',
    'Si quieres adherencia, hazlo fácil de repetir.',
    'Si quieres resultados, hazlo sostenible 12 semanas.',
    'Si quieres salud, piensa años, no solo hoy.',
    'Si quieres rendimiento, piensa sueño + comida + entreno juntos.',
    'Si quieres paz mental, evita reglas contradictorias.',
    'Si quieres aprender, mide 3 días y luego suelta un poco el control.',
    'Si quieres automatizar, prepara 2 proteínas base el domingo.',
    'Si quieres variedad, cambia especias, no solo macros.',
    'Si quieres saciedad, sube volumen de verdura primero.',
    'Si quieres sabor, un toque de queso curado puede bastar.',
    'Si quieres dulce, fruta + yogur suele cerrar mejor el ciclo.',
    'Si quieres salado, palomitas airfryer pueden engañar al antojo.',
    'Si quieres beber algo rico, agua con gas + limón muchas veces basta.',
    'Si quieres café, perfecto; solo no lo uses como único “combustible”.',
    'Si quieres té, genial; hidrata y da ritual sin kcal.',
    'Si quieres batido, mide líquido y sólido para no ir a ojo.',
    'Si quieres pizza, un día cabe; el día completo también cuenta.',
    'Si quieres cerveza, cuenta kcal y agua; planifica comida alrededor.',
    'Si quieres adherencia familiar, cocina 1 plato base y cada uno ajusta.',
    'Si quieres ahorrar, legumbres congeladas son MVP.',
    'Si quieres lujo sano, pescado fresco un día a la semana.',
    'Si quieres rapidez, latas y congelados son aliados, no “pecado”.',
    'Si quieres orden, anota 3 comidas tipo y repite.',
    'Si quieres libertad, define 2 reglas mínimas y suelta el resto.',
  ];

  function hourBand(h) {
    if (h < 11) return 'morning';
    if (h < 16) return 'mid';
    if (h < 21) return 'evening';
    return 'night';
  }

  function fingerprint(ctx) {
    const td = ctx.todayData || {};
    const g = ctx.currentGoals || {};
    const fl = td.foodLog || [];
    const cal = fl.reduce((a, f) => a + (Number(f && f.cal) || 0), 0);
    const prot = fl.reduce((a, f) => a + (Number(f && f.prot) || 0), 0);
    const carb = fl.reduce((a, f) => a + (Number(f && f.carb) || 0), 0);
    const fat = fl.reduce((a, f) => a + (Number(f && f.fat) || 0), 0);
    const studyH = (td.studySessions || []).reduce((a, b) => a + (Number(b && b.hours) || 0), 0);
    return [
      ctx.nowMs,
      td.dateKey || '',
      Math.round(cal),
      Math.round(prot),
      Math.round(carb),
      Math.round(fat),
      fl.length,
      Math.round(Number(td.steps) || 0),
      Math.round(Number(td.water) || 0),
      Number(td.sleepHours) || 0,
      Number(td.runKm) || 0,
      Number(td.bikeKm) || 0,
      Number(td.gymTime) || 0,
      studyH,
      Math.round(Number(ctx.mentalLoad) || 0),
      Math.round(Number(ctx.physicalLoad) || 0),
      (ctx.USER_BIO && ctx.USER_BIO.goal) || '',
      (ctx.USER_BIO && ctx.USER_BIO.genero) || '',
      Math.round(Number(ctx.USER_BIO && ctx.USER_BIO.edad) || 0),
    ].join('|');
  }

  function item(icon, color, text) {
    return { icon, color, text };
  }

  /**
   * @param {object} ctx
   * @param {object} [ctx.USER_BIO]
   * @param {object} [ctx.todayData]
   * @param {object} [ctx.currentGoals]
   * @param {object[]} [ctx.history]
   * @param {number} [ctx.mentalLoad]
   * @param {number} [ctx.physicalLoad]
   * @param {object} [ctx.micros] totals
   * @param {boolean} [ctx.skipMicronutrientNags]
   * @param {number} [ctx.nowMs]
   */
  function buildDynamicDietAdvice(ctx) {
    const MAX_TIPS = 6;
    const rng = mulberry32(djb2(fingerprint(ctx)) ^ (Math.floor((ctx.nowMs || Date.now()) / 700) >>> 0));
    const td = ctx.todayData || {};
    const g = ctx.currentGoals || {};
    const bio = ctx.USER_BIO || {};
    const fl = td.foodLog || [];
    const cal = fl.reduce((a, f) => a + (Number(f && f.cal) || 0), 0);
    const prot = fl.reduce((a, f) => a + (Number(f && f.prot) || 0), 0);
    const carb = fl.reduce((a, f) => a + (Number(f && f.carb) || 0), 0);
    const fat = fl.reduce((a, f) => a + (Number(f && f.fat) || 0), 0);
    const goalsCals = Number(g.cals) || 2000;
    const goalsProt = Number(g.prot) || 120;
    const goalsCarb = Number(g.carbs) || 200;
    const goalsWater = Number(g.water) || 2500;

    const seen = new Set();
    const out = [];

    const pushUnique = (icon, color, html) => {
      const k = stripHtmlKey(html);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      out.push(item(icon, color, html));
      return true;
    };

    const compose = () => {
      const a = pick(rng, OPEN);
      const pools = [MID_CARB, MID_PROT, MID_FAT, MID_HYDR, MID_SLEEP, MID_STEP, CLOSE];
      const b = pick(rng, pick(rng, pools));
      const c = pick(rng, CLOSE);
      return `${a}: ${b} ${c}`;
    };

    // --- Reglas fuertes (las mismas ideas que antes, pero no repetimos si ya salen por azar) ---
    if (bio.goal === 'fat_loss') {
      pushUnique(
        'fa-fire',
        'text-red-500',
        '<b>Objetivo déficit:</b> densidad calórica baja (verdura, prote magra, caldos) suele ayudar al hambre.'
      );
      if (fl.some((f) => f && Number(f.cal) > 300 && Number(f.weight) < 100)) {
        pushUnique(
          'fa-exclamation-triangle',
          'text-orange-500',
          '<b>Calorías “concentradas”:</b> compensa la siguiente comida con volumen y proteína, sin castigo extremo.'
        );
      }
    } else if (bio.goal === 'muscle_gain') {
      pushUnique(
        'fa-dumbbell',
        'text-blue-600',
        '<b>Objetivo volumen:</b> reparte kcal y no te quedes solo en “limpio” si te cuesta llegar.'
      );
    }

    const hist = ctx.history || [];
    const yesterday = hist.length > 0 ? hist[0] : null;
    const yd = yesterday && yesterday.data ? yesterday.data : null;
    if (yd && (Number(yd.runKm) > 8 || Number(yd.gymTime) > 70)) {
      pushUnique(
        'fa-battery-half',
        'text-purple-500',
        '<b>Ayer fue exigente:</b> hoy suma recuperación (sueño, agua, omega-3 de calidad si encaja).'
      );
    }

    const gym = td.gymSessions || [];
    if (gym.length) {
      const muscles = gym.map((s) => String(s && s.muscle)).join(' ');
      if (muscles.includes('pierna') || Number(td.runKm) > 5) {
        pushUnique(
          'fa-bolt',
          'text-yellow-500',
          '<b>Piernas / cardio:</b> electrolitos y un extra de carbo suele notarse en sensación.'
        );
      }
      if (muscles.includes('espalda') || muscles.includes('pecho')) {
        pushUnique(
          'fa-layer-group',
          'text-indigo-500',
          '<b>Torso:</b> reparto de prote en la siguiente comida ayuda a la sensación de “reparado”.'
        );
      }
    }

    if (Number(td.sleepHours) < 7) {
      pushUnique(
        'fa-bed',
        'text-indigo-400',
        '<b>Sueño corto:</b> evita picos de azúcar simple y cuida la última comida muy tarde.'
      );
    }
    if (Number(ctx.mentalLoad) > 70) {
      pushUnique(
        'fa-brain',
        'text-pink-500',
        '<b>Carga mental alta:</b> no fuerces ayuno extremo; mantén comidas estables.'
      );
    }
    if (Number(bio.edad) > 50) {
      pushUnique(
        'fa-shield-heart',
        'text-green-600',
        '<b>Salud ósea:</b> lácteos fermentados, pescado con espinas o legumbres ayudan a rotar minerales.'
      );
    }
    if (Number(td.water) < goalsWater * 0.5) {
      pushUnique(
        'fa-glass-water',
        'text-blue-400',
        '<b>Agua baja:</b> dos vasos grandes ahora y reparte el resto en bloques pequeños.'
      );
    }

    const micros = ctx.micros || {};
    const MICRO_DEFS = ctx.MICRO_DEFS_REF;
    if (!ctx.skipMicronutrientNags && MICRO_DEFS && micros.vitC != null) {
      if (micros.vitC < MICRO_DEFS.vitC.base * 0.4) {
        pushUnique(
          'fa-lemon',
          'text-yellow-400',
          '<b>Vitamina C baja (estimada):</b> kiwi, pimientos o cítricos en la siguiente comida.'
        );
      }
      if (micros.iron < MICRO_DEFS.iron.base * 0.4 && bio.genero === 'mujer') {
        pushUnique(
          'fa-tint',
          'text-red-700',
          '<b>Hierro bajo (estimado):</b> legumbre + vitamina C en el mismo plato mejora absorción.'
        );
      }
      if (micros.magnesium < MICRO_DEFS.magnesium.base * 0.4) {
        pushUnique(
          'fa-brain',
          'text-slate-500',
          '<b>Magnesio bajo (estimado):</b> frutos secos medidos, legumbres o cacao puro con moderación.'
        );
      }
    } else if (ctx.skipMicronutrientNags) {
      pushUnique(
        'fa-database',
        'text-slate-500',
        '<b>Micronutrientes:</b> parte del diario viene del catálogo global sin vitaminas detalladas: no inferimos déficits hoy.'
      );
    }

    // Pocas líneas variables (el pool sigue siendo enorme; aquí solo mostramos unas pocas).
    const relCarb = goalsCarb > 1 ? carb / goalsCarb : 0;
    const relProt = goalsProt > 1 ? prot / goalsProt : 0;
    const extrasBudget = Math.max(0, MAX_TIPS - out.length);
    const maxVar = Math.min(3, extrasBudget);
    let varAdded = 0;
    let guard = 0;
    while (varAdded < maxVar && out.length < MAX_TIPS && guard++ < 40) {
      const h = new Date(ctx.nowMs || Date.now()).getHours();
      const band = hourBand(h);
      let theme = pick(rng, ['carb', 'prot', 'fat', 'mix']);
      if (band === 'morning') theme = pick(rng, ['carb', 'prot', 'mix']);
      if (band === 'night') theme = pick(rng, ['prot', 'fat', 'mix']);

      let mid = pick(rng, MID_CARB);
      if (theme === 'prot') mid = pick(rng, MID_PROT);
      if (theme === 'fat') mid = pick(rng, MID_FAT);

      if (Number(td.steps) > 9000 && rng() > 0.55) mid = pick(rng, MID_STEP);
      if (Number(td.sleepHours) < 7 && rng() > 0.55) mid = pick(rng, MID_SLEEP);
      if (Number(td.water) < goalsWater * 0.75 && rng() > 0.45) mid = pick(rng, MID_HYDR);

      const line = `${pick(rng, OPEN)}: ${mid} ${pick(rng, CLOSE)}`;

      const r = rng();
      let ok = false;
      if (relCarb < 0.45 && r < 0.28) {
        ok = pushUnique(
          'fa-bread-slice',
          'text-amber-600',
          `<b>Carbos ~${Math.round(relCarb * 100)}% del objetivo:</b> ${pick(rng, MID_CARB)}`
        );
      } else if (relProt < 0.45 && r < 0.52) {
        ok = pushUnique(
          'fa-drumstick-bite',
          'text-emerald-600',
          `<b>Proteína ~${Math.round(relProt * 100)}% del objetivo:</b> ${pick(rng, MID_PROT)}`
        );
      } else if (cal > goalsCals * 1.08 && r < 0.72) {
        ok = pushUnique(
          'fa-scale-balanced',
          'text-orange-600',
          `<b>Kcal altas vs objetivo:</b> ${pick(rng, ['baja un extra líquido/azucarado', 'reduce aceite visible una cucharada', 'sube verdura de volumen en la siguiente comida'])}.`
        );
      } else {
        ok = pushUnique('fa-lightbulb', 'text-amber-600', line);
      }
      if (ok) varAdded += 1;
    }

    return out.slice(0, MAX_TIPS);
  }

  /**
   * Devuelve fragmento HTML <li> extra para el bloque "Estado macros" (variación por apertura).
   */
  function buildDynamicMacroExtraLines(ctx) {
    const rng = mulberry32(djb2(fingerprint(ctx)) ^ 0x9e3779b9);
    const td = ctx.todayData || {};
    const g = ctx.currentGoals || {};
    const fl = td.foodLog || [];
    const cal = fl.reduce((a, f) => a + (Number(f && f.cal) || 0), 0);
    const prot = fl.reduce((a, f) => a + (Number(f && f.prot) || 0), 0);
    const carb = fl.reduce((a, f) => a + (Number(f && f.carb) || 0), 0);
    const goalsCals = Number(g.cals) || 2000;
    const goalsProt = Number(g.prot) || 120;
    const goalsCarb = Number(g.carbs) || 200;
    const lines = [];
    const pct = (x, y) => (y > 0 ? Math.round((x / y) * 100) : 0);
    lines.push(
      `<li class="text-slate-500 text-[11px]"><i class="fas fa-clock text-slate-400 mr-1"></i> Lectura a las ${new Date(
        ctx.nowMs || Date.now()
      ).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · kcal registradas ${Math.round(cal)}/${Math.round(goalsCals)} (${pct(
        cal,
        goalsCals
      )}%).</li>`
    );
    const r = rng();
    if (prot < goalsProt * 0.55 && r < 0.45) {
      lines.push(`<li class="text-emerald-700 text-[11px]"><b>Proteína:</b> ${pick(rng, MID_PROT)}</li>`);
    } else if (carb < goalsCarb * 0.55 && r < 0.45) {
      lines.push(`<li class="text-amber-700 text-[11px]"><b>Carbos:</b> ${pick(rng, MID_CARB)}</li>`);
    } else if (r < 0.28) {
      lines.push(`<li class="text-slate-500 text-[11px]">${pick(rng, OPEN)}: ${pick(rng, MID_CARB)}</li>`);
    }
    return lines.join('');
  }

  global.fittrackerBuildDynamicDietAdvice = buildDynamicDietAdvice;
  global.fittrackerBuildDynamicMacroExtraLines = buildDynamicMacroExtraLines;
})(typeof window !== 'undefined' ? window : globalThis);
