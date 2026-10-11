// Versioned, bounded last-valid weather data; browser storage is best effort.
const PREFIX = 'weather-chart-card:snapshot:v1:';
const MAX_BYTES = 65536;
const WEATHER_FIELDS = ['temperature', 'temperature_unit', 'humidity', 'pressure', 'native_pressure', 'pressure_unit', 'uv_index', 'wind_speed', 'wind_speed_unit', 'wind_bearing', 'apparent_temperature', 'native_apparent_temperature', 'dew_point', 'wind_gust_speed', 'visibility', 'visibility_unit', 'description', 'supported_features'];
const READINGS = ['temperature', 'humidity', 'pressure', 'uv_index', 'windSpeed', 'windDirection', 'dew_point', 'wind_gust_speed', 'visibility', 'feels_like', 'description'];
const FORECAST_FIELDS = ['datetime', 'condition', 'temperature', 'native_temperature', 'templow', 'native_temp_low', 'native_templow', 'precipitation', 'native_precipitation', 'precipitation_probability', 'wind_speed', 'wind_bearing'];
const validText = (value, limit = 256) => typeof value === 'string' && value.trim() !== '' && !['unknown', 'unavailable', 'none', 'null', 'nan'].includes(value.trim().toLowerCase()) && value.length <= limit;
const validNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const scalar = (value) => validNumber(value) || validText(value);
const pick = (source, fields) => Object.fromEntries(fields.filter((field) => scalar(source?.[field])).map((field) => [field, source[field]]));
const validDate = (date) => validText(date) && Number.isFinite(Date.parse(date));
const FORECAST_NUMBERS = ['temperature', 'native_temperature', 'templow', 'native_temp_low', 'native_templow', 'precipitation', 'native_precipitation', 'precipitation_probability', 'wind_speed'];

export function normalizeForecast(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => entry && validDate(entry.datetime)).map((entry) => {
    const clean = pick(entry, FORECAST_FIELDS);
    for (const field of FORECAST_NUMBERS) {
      if (typeof clean[field] !== 'undefined') {
        const value = typeof clean[field] === 'string' && clean[field].trim() ? Number(clean[field]) : clean[field];
        if (validNumber(value)) clean[field] = value;
        else delete clean[field];
      }
    }
    return clean;
  }).filter((entry) => ['temperature', 'native_temperature', 'templow', 'native_temp_low', 'native_templow'].some((field) => validNumber(entry[field]))).slice(0, 48);
}

export function snapshotKey(config, hass) {
  const site = [hass?.config?.uuid || '', hass?.config?.location_name || '', hass?.config?.latitude ?? '', hass?.config?.longitude ?? ''];
  return PREFIX + JSON.stringify([site, config.entity, config.forecast?.type || 'daily', config.text_sensor_entity || '']);
}

export function readSnapshot(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw || raw.length > MAX_BYTES) return null;
    const value = JSON.parse(raw);
    if (value.version !== 1 || value.key !== key) return null;
    const weather = value.weather && validText(value.weather.state) && validNumber(value.weather.attributes?.temperature) && validDate(value.weather.last_changed) ? { state: value.weather.state, last_changed: value.weather.last_changed, attributes: pick(value.weather.attributes, WEATHER_FIELDS) } : null;
    const forecast = Array.isArray(value.forecast) && value.forecast.length <= 48 ? normalizeForecast(value.forecast) : [];
    const text = value.text && validText(value.text.state, 2048) && validDate(value.text.last_changed) ? { state: value.text.state, last_changed: value.text.last_changed, attributes: { friendly_name: validText(value.text.attributes?.friendly_name) ? value.text.attributes.friendly_name : '' } } : null;
    return weather || forecast.length || text ? { weather, readings: weather ? pick(value.readings, READINGS) : {}, forecast, forecastReceivedAt: forecast.length && validDate(value.forecastReceivedAt) ? value.forecastReceivedAt : null, text } : null;
  } catch { return null; }
}

export function writeSnapshot(key, snapshot) {
  try {
    const weather = snapshot.weather && validText(snapshot.weather.state) && validNumber(snapshot.weather.attributes?.temperature) && validDate(snapshot.weather.last_changed) ? { state: snapshot.weather.state, last_changed: snapshot.weather.last_changed, attributes: pick(snapshot.weather.attributes, WEATHER_FIELDS) } : null;
    const forecast = normalizeForecast(snapshot.forecast);
    const text = snapshot.text && validText(snapshot.text.state, 2048) && validDate(snapshot.text.last_changed) ? { state: snapshot.text.state, last_changed: snapshot.text.last_changed, attributes: { friendly_name: validText(snapshot.text.attributes?.friendly_name) ? snapshot.text.attributes.friendly_name : '' } } : null;
    const raw = JSON.stringify({ version: 1, key, weather, readings: pick(snapshot.readings, READINGS), forecast, forecastReceivedAt: forecast.length && validDate(snapshot.forecastReceivedAt) ? snapshot.forecastReceivedAt : null, text });
    if (raw.length <= MAX_BYTES) window.localStorage.setItem(key, raw);
  } catch { /* storage disabled, quota exceeded, or serialization failure: keep instance data */ }
}
