import { getActivityWeatherContext } from '../services/weather-service.js';

/** Interpretación orientativa del clima de una actividad (sin claims clínicos). */
export async function enrichWeatherForActivity(activity) {
  const ll = activity && activity.start_latlng;
  if (!Array.isArray(ll) || ll.length < 2) return null;
  const iso = activity.start_date_local || activity.start_date;
  return getActivityWeatherContext({ lat: ll[0], lng: ll[1], isoDateTime: iso });
}
