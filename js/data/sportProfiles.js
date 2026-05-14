/** Etiquetas legibles por tipo Strava (subset frecuente). */
export const STRAVA_SPORT_LABELS = {
  Run: 'Running',
  Ride: 'Ciclismo',
  Swim: 'Natación',
  Walk: 'Caminar',
  Hike: 'Senderismo',
  VirtualRide: 'Ciclismo indoor',
  Workout: 'Entreno',
  WeightTraining: 'Fuerza',
  Rowing: 'Remo',
  AlpineSki: 'Esquí',
  Yoga: 'Yoga',
};

export function labelForStravaType(type) {
  const t = String(type || '');
  return STRAVA_SPORT_LABELS[t] || t || 'Actividad';
}
