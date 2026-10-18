import locale from './locale.js';
import { snapshotKey, readSnapshot, writeSnapshot, normalizeForecast } from './weather-snapshot.js';
import {
  cardinalDirectionsIcon,
  weatherIcons,
  weatherIconsDay,
  weatherIconsNight,
  WeatherEntityFeature
} from './const.js';
import {LitElement, html} from 'lit';
import './weather-chart-card-editor.js';
import { property } from 'lit/decorators.js';
import {Chart, registerables} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
Chart.register(...registerables, ChartDataLabels);

class WeatherChartCard extends LitElement {

static getConfigElement() {
  return document.createElement("uninus-weather-chart-card-editor");
}

static getStubConfig(hass, unusedEntities, allEntities) {
  let entity = unusedEntities.find((eid) => eid.split(".")[0] === "weather");
  if (!entity) {
    entity = allEntities.find((eid) => eid.split(".")[0] === "weather");
  }
  return {
    entity,
    title: 'uninus-weather-chart-card',
    show_main: true,
    show_temperature: true,
    show_current_condition: true,
    show_attributes: true,
    show_time: true,
    show_time_seconds: true,
    show_day: true,
    show_date: true,
    show_humidity: true,
    show_pressure: true,
    show_wind_direction: true,
    show_wind_speed: true,
    show_sun: true,
    show_feels_like: false,
    timezone: '',
    show_dew_point: false,
    show_wind_gust_speed: false,
    show_visibility: false,
    show_last_changed: false,
    show_text_sensor: false,
    text_sensor_entity: '',
    text_sensor_title: '',
    text_sensor_title_size: 14,
    text_sensor_content_size: 13,
    show_alerts: false,
    alert_entities: [],
    alert_entity_1: '',
    alert_entity_2: '',
    alert_entity_3: '',
    alert_show_message: true,
    alert_flash_critical: true,
    alert_default_expanded: false,
    alert_max_items: 3,
    show_forecast_toggle: false,
    use_12hour_format: false,
    icons_size: 30,
    main_icon_size: 150,
    current_temp_size: 35,
    animated_icons: true,
    icon_style: 'style1',
    autoscroll: false,
    forecast: {
      precipitation_type: 'rainfall',
      show_probability: false,
      labels_font_size: '11',
      precip_bar_size: '100',
      style: 'style2',
      show_wind_forecast: true,
      condition_icons: true,
      round_temp: false,
      type: 'daily',
      number_of_forecasts: '0', 
      disable_animation: false,
      show_date_labels: true,
      use_color_thresholds: true,
    },
  };
}

  static get properties() {
    return {
      _hass: {},
      config: {},
      language: {},
      sun: {type: Object},
      weather: {type: Object},
      temperature: {type: Object},
      humidity: {type: Object},
      pressure: {type: Object},
      windSpeed: {type: Object},
      windDirection: {type: Number},
      forecastChart: {type: Object},
      forecastItems: {type: Number},
      forecasts: { type: Array },
      alertsExpanded: { type: Boolean },
      _weatherUnavailable: { type: Boolean }
    };
  }

setConfig(config) {
  if (this.config && (this.config.entity !== config.entity ||
    this.config.forecast.type !== (config.forecast?.type || 'daily') ||
    this.config.text_sensor_entity !== (config.text_sensor_entity || ''))) {
    this.resetSnapshotState();
    this._snapshotKey = undefined;
  }
  const cardConfig = {
    title: 'uninus-weather-chart-card',
    icons_size: 30,
    animated_icons: true,
    icon_style: 'style1',
    current_temp_size: 35,
    main_icon_size: 150,
    time_size: 26,
    day_date_size: 15,
    show_feels_like: false,
    show_dew_point: false,
    show_wind_gust_speed: false,
    show_visibility: false,
    show_last_changed: false,
    show_description: false,
    show_text_sensor: false,
    text_sensor_entity: '',
    text_sensor_title: '',
    text_sensor_title_size: 14,
    text_sensor_content_size: 13,
    show_alerts: false,
    alert_entities: [],
    alert_entity_1: '',
    alert_entity_2: '',
    alert_entity_3: '',
    alert_show_message: true,
    alert_flash_critical: true,
    alert_default_expanded: false,
    alert_max_items: 3,
    show_forecast_toggle: false,
    ...config,
    forecast: {
      precipitation_type: 'rainfall',
      show_probability: false,
      labels_font_size: 11,
      chart_height: 180,
      precip_bar_size: 100,
      style: 'style2',
      temperature1_color: 'rgba(255, 152, 0, 1.0)',
      temperature2_color: 'rgba(68, 115, 158, 1.0)',
      precipitation_color: 'rgba(132, 209, 253, 1.0)',
      condition_icons: true,
      show_wind_forecast: true,
      round_temp: false,
      type: 'daily',
      number_of_forecasts: '0',
      '12hourformat': false,
      show_date_labels: true,
      use_color_thresholds: true,
      ...config.forecast,
    },
    units: {
      pressure: 'hPa',
      ...config.units,
    }
  };

  cardConfig.units.speed = config.speed ? config.speed : cardConfig.units.speed;

  // Icon path configuration: Prioritize CDN, fallback to custom path if specified
  if (config.icons) {
    // User specified custom icons path
    this.baseIconPath = config.icons;
  } else {
    // Use icons from GitHub repository via jsdelivr CDN
    // Using @latest for better CDN caching and reliability
    // style1 = fill (default), style2 = line
    this.baseIconPath = cardConfig.icon_style === 'style2'
      ? 'https://cdn.jsdelivr.net/gh/ivanlee1007/uninus-weather-chart-card@latest/dist/icons2/'
      : 'https://cdn.jsdelivr.net/gh/ivanlee1007/uninus-weather-chart-card@latest/dist/icons/';
  }

  this.config = cardConfig;
  if (this.alertsExpanded === undefined) {
    this.alertsExpanded = cardConfig.alert_default_expanded === true;
  }
  if (!config.entity) {
    throw new Error('Please, define entity in the card config');
  }
}

resetSnapshotState() {
  this._lastValidWeather = undefined;
  this._lastValidTextSensor = undefined;
  this._savedReadings = undefined;
  this._weatherUnavailable = true;
  this.weather = { state: 'unavailable', attributes: {} };
  for (const key of ['temperature', 'humidity', 'pressure', 'uv_index', 'windSpeed', 'windDirection',
    'dew_point', 'wind_gust_speed', 'visibility', 'feels_like', 'description',
    'unitSpeed', 'unitPressure', 'unitVisibility', 'unitTemperature']) {
    this[key] = undefined;
  }
  this.forecasts = [];
  this._forecastReceivedAt = null;
  this._forecastSubscriptionId = (this._forecastSubscriptionId || 0) + 1;
  if (this.forecastSubscriber) this.forecastSubscriber.then((unsub) => unsub());
  this.forecastSubscriber = null;
  if (this.forecastChart) this.forecastChart.destroy();
  this.forecastChart = null;
}

set hass(hass) {
  this._hass = hass;
  const key = snapshotKey(this.config, hass);
  if (this._snapshotKey !== key) {
    if (this._snapshotKey !== undefined) this.resetSnapshotState();
    this._snapshotKey = key;
    const saved = readSnapshot(key);
    this._lastValidWeather = saved?.weather;
    this._lastValidTextSensor = saved?.text ? { entity: this.config.text_sensor_entity, value: saved.text } : undefined;
    this.forecasts = saved?.forecast || [];
    this._forecastReceivedAt = saved?.forecastReceivedAt || null;
    this._savedReadings = saved?.readings;
  }
  this.language = this.config.locale || hass.selectedLanguage || hass.language;
  this.sun = 'sun.sun' in hass.states ? hass.states['sun.sun'] : null;
  const incoming = hass.states[this.config.entity];
  const attributes = incoming && incoming.attributes;
  const temperature = this.config.temp
    ? (hass.states[this.config.temp] && hass.states[this.config.temp].state)
    : attributes && attributes.temperature;
  this._weatherUnavailable = !attributes || !incoming || typeof incoming.state !== 'string' || !incoming.state.trim() || ['unavailable', 'unknown', 'none', 'null', 'nan'].includes(incoming.state.trim().toLowerCase())
    || this.getNumericForecastValue({ temperature }, 'temperature') === undefined;

  if (this._weatherUnavailable) {
    // Keep this instance's last valid readings, units, forecast and timestamp.
    // Initial unavailable data has no snapshot and must not invent measurements.
    this.weather = this._lastValidWeather || { state: (incoming && incoming.state) || 'unavailable', attributes: {} };
    if (this.config.show_text_sensor) this.getTextSensorState();
    if (this._lastValidWeather && this._savedReadings) {
      Object.assign(this, this._savedReadings);
      this.unitSpeed = this.config.units.speed || this.weather.attributes.wind_speed_unit;
      this.unitPressure = this.config.units.pressure || this.weather.attributes.pressure_unit;
      this.unitVisibility = this.config.units.visibility || this.weather.attributes.visibility_unit;
      this.unitTemperature = this.config.units.temperature || this.weather.attributes.temperature_unit;
    }
    if (!this.forecastSubscriber) this.subscribeForecastEvents();
    return;
  }

  this.weather = { ...incoming, attributes: { ...incoming.attributes } };
  this._lastValidWeather = this.weather;
  this.unitSpeed = this.config.units.speed ? this.config.units.speed : this.weather.attributes.wind_speed_unit;
  this.unitPressure = this.config.units.pressure ? this.config.units.pressure : this.weather.attributes.pressure_unit;
  this.unitVisibility = this.config.units.visibility ? this.config.units.visibility : this.weather.attributes.visibility_unit;
  this.unitTemperature = this.config.units.temperature ? this.config.units.temperature : this.weather.attributes.temperature_unit;

  const firstDefined = (...values) => values.find((v) => typeof v !== 'undefined' && v !== null);

  if (this.weather) {
    this.temperature = this.config.temp ? (hass.states[this.config.temp] && hass.states[this.config.temp].state) : this.weather.attributes.temperature;
    this.humidity = this.config.humid ? (hass.states[this.config.humid] && hass.states[this.config.humid].state) : this.weather.attributes.humidity;
    this.pressure = this.config.press ? (hass.states[this.config.press] && hass.states[this.config.press].state) : firstDefined(this.weather.attributes.pressure, this.weather.attributes.native_pressure);
    this.uv_index = this.config.uv ? (hass.states[this.config.uv] && hass.states[this.config.uv].state) : this.weather.attributes.uv_index;
    this.windSpeed = this.config.windspeed ? (hass.states[this.config.windspeed] && hass.states[this.config.windspeed].state) : this.weather.attributes.wind_speed;
    this.dew_point = this.config.dew_point ? (hass.states[this.config.dew_point] && hass.states[this.config.dew_point].state) : this.weather.attributes.dew_point;
    this.wind_gust_speed = this.config.wind_gust_speed ? (hass.states[this.config.wind_gust_speed] && hass.states[this.config.wind_gust_speed].state) : this.weather.attributes.wind_gust_speed;
    this.visibility = this.config.visibility ? (hass.states[this.config.visibility] && hass.states[this.config.visibility].state) : this.weather.attributes.visibility;

    if (this.config.winddir && hass.states[this.config.winddir] && hass.states[this.config.winddir].state !== undefined) {
      this.windDirection = parseFloat(hass.states[this.config.winddir].state);
    } else {
      this.windDirection = this.weather.attributes.wind_bearing;
    }

    this.feels_like = this.config.feels_like && hass.states[this.config.feels_like] ? hass.states[this.config.feels_like].state : firstDefined(this.weather.attributes.apparent_temperature, this.weather.attributes.native_apparent_temperature);
    this.description = this.config.description && hass.states[this.config.description] ? hass.states[this.config.description].state : this.weather.attributes.description;
    for (const key of ['temperature', 'humidity', 'pressure', 'uv_index', 'windSpeed',
      'dew_point', 'wind_gust_speed', 'visibility', 'feels_like']) {
      this[key] = this.getNumericForecastValue({ value: this[key] }, 'value');
    }
    if (!Number.isFinite(this.windDirection) &&
      !(typeof this.windDirection === 'string' && /^(N|NNE|NE|ENE|E|ESE|SE|SSE|S|SSW|SW|WSW|W|WNW|NW|NNW)$/.test(this.windDirection))) {
      this.windDirection = undefined;
    }
  }

  if (this.weather && !this.forecastSubscriber) {
    this.subscribeForecastEvents();
  }
  this.saveWeatherSnapshot();
}

saveWeatherSnapshot() {
  const readings = this._weatherUnavailable && this._savedReadings ? this._savedReadings : Object.fromEntries(['temperature', 'humidity', 'pressure', 'uv_index', 'windSpeed', 'windDirection', 'dew_point', 'wind_gust_speed', 'visibility', 'feels_like', 'description'].map((name) => [name, this[name]]));
  this._savedReadings = readings;
  const weather = this._lastValidWeather && {
    ...this._lastValidWeather,
    attributes: { ...this._lastValidWeather.attributes, temperature: this.getNumericForecastValue({ temperature: readings.temperature }, 'temperature') }
  };
  writeSnapshot(this._snapshotKey, { weather, readings, forecast: this.forecasts, forecastReceivedAt: this._forecastReceivedAt, text: this._lastValidTextSensor?.value });
}

subscribeForecastEvents() {
  const forecastType = this.config.forecast.type || 'daily';
  const isHourly = forecastType === 'hourly';

  const feature = isHourly ? WeatherEntityFeature.FORECAST_HOURLY : WeatherEntityFeature.FORECAST_DAILY;
  if (!this._weatherUnavailable && !this.supportsFeature(feature)) {
    console.error(`Weather entity "${this.config.entity}" does not support ${isHourly ? 'hourly' : 'daily'} forecasts.`);
    return;
  }

  const subscriptionId = this._forecastSubscriptionId = (this._forecastSubscriptionId || 0) + 1;
  const callback = (event) => {
    if (subscriptionId !== this._forecastSubscriptionId) return;
    const forecast = normalizeForecast(event?.forecast);
    if (!forecast.length) return;
    this.forecasts = forecast;
    this._forecastReceivedAt = new Date().toISOString();
    this.saveWeatherSnapshot();
    this.requestUpdate();
    this.drawChart();
  };

  this.forecastSubscriber = this._hass.connection.subscribeMessage(callback, {
    type: "weather/subscribe_forecast",
    forecast_type: isHourly ? 'hourly' : 'daily',
    entity_id: this.config.entity,
  });
}

handleForecastTypeToggle() {
  // Toggle between daily and hourly
  const currentType = this.config.forecast.type || 'daily';
  const newType = currentType === 'daily' ? 'hourly' : 'daily';
  
  // Check if the new type is supported
  const feature = newType === 'hourly' ? WeatherEntityFeature.FORECAST_HOURLY : WeatherEntityFeature.FORECAST_DAILY;
  if (!this.supportsFeature(feature)) {
    console.warn(`Weather entity "${this.config.entity}" does not support ${newType} forecasts.`);
    return;
  }
  
  // Invalidate the old type before changing the key or awaiting its unsubscribe.
  this._forecastSubscriptionId = (this._forecastSubscriptionId || 0) + 1;

  // Update config
  this.config = {
    ...this.config,
    forecast: {
      ...this.config.forecast,
      type: newType
    }
  };
  this._snapshotKey = snapshotKey(this.config, this._hass);
  const saved = readSnapshot(this._snapshotKey);
  this.forecasts = saved?.forecast || [];
  this._forecastReceivedAt = saved?.forecastReceivedAt || null;
  if (this.forecastChart) {
    this.forecastChart.destroy();
    this.forecastChart = null;
  }
  this.saveWeatherSnapshot();
  
  // Unsubscribe from old forecast
  if (this.forecastSubscriber) {
    this.forecastSubscriber.then((unsub) => unsub());
    this.forecastSubscriber = null;
  }
  
  // Subscribe to new forecast type
  this.subscribeForecastEvents();
  
  // Request update to re-render
  this.requestUpdate();
}

  supportsFeature(feature) {
    return (this.weather.attributes.supported_features & feature) !== 0;
  }

  constructor() {
    super();
    this.resizeObserver = null;
    this.resizeInitialized = false;
    this.alertsExpanded = undefined;
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this.resizeInitialized) {
      this.delayedAttachResizeObserver();
    }
  }

  delayedAttachResizeObserver() {
    setTimeout(() => {
      this.attachResizeObserver();
      this.resizeInitialized = true;
    }, 0);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.detachResizeObserver();
    if (this.forecastSubscriber) {
      this.forecastSubscriber.then((unsub) => unsub());
    }
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
  }

  attachResizeObserver() {
    this.resizeObserver = new ResizeObserver(() => {
      this.measureCard();
    });
    const card = this.shadowRoot.querySelector('ha-card');
    if (card) {
      this.resizeObserver.observe(card);
    }
  }

  detachResizeObserver() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

measureCard() {
  const card = this.shadowRoot.querySelector('ha-card');
  let fontSize = this.config.forecast.labels_font_size;
  const numberOfForecasts = this.config.forecast.number_of_forecasts || 0;

  if (!card) {
    return;
  }

  this.forecastItems = numberOfForecasts > 0 ? numberOfForecasts : Math.round(card.offsetWidth / (fontSize * 6));
  this.drawChart();
}

ll(str) {
  const selectedLocale = this.config.locale || this.language || 'en';

  // Try full locale first (e.g., 'ro-RO')
  if (locale[selectedLocale] && locale[selectedLocale][str]) {
    return locale[selectedLocale][str];
  }

  // Fall back to language code (e.g., 'ro' from 'ro-RO')
  const languageCode = selectedLocale.split('-')[0];
  if (locale[languageCode] && locale[languageCode][str]) {
    return locale[languageCode][str];
  }

  // Final fallback to English
  return locale.en[str];
}

getTimezone() {
  return this.config.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Get locale data with fallback logic
 * @param {string} key - 'days' or 'months'
 * @returns {Array|null} - locale array or null if not found
 */
getLocaleArray(key) {
  const selectedLocale = this.config.locale || this.language || 'en';
  
  // Try full locale first (e.g., 'ro-RO')
  if (locale[selectedLocale] && locale[selectedLocale][key] && locale[selectedLocale][key].length) {
    return locale[selectedLocale][key];
  }
  
  // Try language code (e.g., 'ro' from 'ro-RO')
  const languageCode = selectedLocale.split('-')[0];
  if (locale[languageCode] && locale[languageCode][key] && locale[languageCode][key].length) {
    return locale[languageCode][key];
  }
  
  // English fallback with safety check
  if (locale.en && locale.en[key] && locale.en[key].length) {
    return locale.en[key];
  }
  
  // Ultimate fallback: return null if nothing works
  return null;
}

getLocalizedDayName(date, timezone) {
  const dayIndex = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Priority 1: Try translation array from locale.js
  const days = this.getLocaleArray('days');
  if (days && days[dayIndex] && typeof days[dayIndex] === 'string' && days[dayIndex].length > 0) {
    const dayName = days[dayIndex].substring(0, 3);
    // Only uppercase for Latin-script languages
    return WeatherChartCard.LATIN_SCRIPT_REGEX.test(dayName) ? dayName.toUpperCase() : dayName;
  }
  
  // Priority 2: Browser Intl fallback
  try {
    const selectedLocale = this.config.locale || this.language || 'en';
    const dayFormatter = new Intl.DateTimeFormat(selectedLocale, {
      weekday: 'long',
      timeZone: timezone
    });
    const formatted = dayFormatter.format(date);
    if (formatted && formatted.length > 0) {
      const dayName = formatted.substring(0, 3);
      // Only uppercase for Latin-script languages
      return WeatherChartCard.LATIN_SCRIPT_REGEX.test(dayName) ? dayName.toUpperCase() : dayName;
    }
  } catch (e) {
    // Intl failed, continue to ultimate fallback
  }
  
  // Priority 3: Hardcoded English fallback
  const englishDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return englishDays[dayIndex].substring(0, 3).toUpperCase();
}

/**
 * Get localized day name (full)
 */
getLocalizedDayNameFull(date, timezone) {
  const dayIndex = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Priority 1: Try translation array from locale.js
  const days = this.getLocaleArray('days');
  if (days && days[dayIndex] && typeof days[dayIndex] === 'string' && days[dayIndex].length > 0) {
    return days[dayIndex];
  }
  
  // Priority 2: Browser Intl fallback
  try {
    const selectedLocale = this.config.locale || this.language || 'en';
    const dayFormatter = new Intl.DateTimeFormat(selectedLocale, {
      weekday: 'long',
      timeZone: timezone
    });
    const formatted = dayFormatter.format(date);
    if (formatted && formatted.length > 0) {
      return formatted;
    }
  } catch (e) {
    // Intl failed, continue to ultimate fallback
  }
  
  // Priority 3: Hardcoded English fallback
  const englishDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return englishDays[dayIndex];
}

/**
 * Get localized day number
 */
getLocalizedDayNumber(date, locale, timezone) {
  try {
    return date.toLocaleString(locale, { day: 'numeric', timeZone: timezone });
  } catch (error) {
    return date.getDate().toString();
  }
}

/**
 * Get localized month name (full)
 */
getLocalizedMonthName(date, timezone) {
  const monthIndex = date.getMonth(); // 0 = January, 1 = February, etc.
  
  // Priority 1: Try translation array from locale.js
  const months = this.getLocaleArray('months');
  if (months && months[monthIndex] && typeof months[monthIndex] === 'string' && months[monthIndex].length > 0) {
    return months[monthIndex].charAt(0).toUpperCase() + months[monthIndex].slice(1);
  }
  
  // Priority 2: Browser Intl fallback
  try {
    const selectedLocale = this.config.locale || this.language || 'en';
    const monthFormatter = new Intl.DateTimeFormat(selectedLocale, {
      month: 'long',
      timeZone: timezone
    });
    const formatted = monthFormatter.format(date);
    if (formatted && formatted.length > 0) {
      return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }
  } catch (e) {
    // Intl failed, continue to ultimate fallback
  }
  
  // Priority 3: Hardcoded English fallback
  const englishMonths = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  return englishMonths[monthIndex].charAt(0).toUpperCase() + englishMonths[monthIndex].slice(1);
}

/**
 * Get localized month name (short - 3 letters uppercase)
 */
getLocalizedMonthNameShort(date, timezone) {
  const monthIndex = date.getMonth(); // 0 = January, 1 = February, etc.
  
  // Priority 1: Try translation array from locale.js
  const months = this.getLocaleArray('months');
  if (months && months[monthIndex] && typeof months[monthIndex] === 'string' && months[monthIndex].length > 0) {
    const monthName = months[monthIndex].substring(0, 3);
    // Only uppercase for Latin-script languages
    return WeatherChartCard.LATIN_SCRIPT_REGEX.test(monthName) ? monthName.toUpperCase() : monthName;
  }
  
  // Priority 2: Browser Intl fallback
  try {
    const selectedLocale = this.config.locale || this.language || 'en';
    const monthFormatter = new Intl.DateTimeFormat(selectedLocale, {
      month: 'long',
      timeZone: timezone
    });
    const formatted = monthFormatter.format(date);
    if (formatted && formatted.length > 0) {
      const monthName = formatted.substring(0, 3);
      // Only uppercase for Latin-script languages
      return WeatherChartCard.LATIN_SCRIPT_REGEX.test(monthName) ? monthName.toUpperCase() : monthName;
    }
  } catch (e) {
    // Intl failed, continue to ultimate fallback
  }
  
  // Priority 3: Hardcoded English fallback
  const englishMonths = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  return englishMonths[monthIndex].substring(0, 3).toUpperCase();
}

  getCardSize() {
    return 4;
  }

  getUnit(unit) {
    return this._hass.config.unit_system[unit] || '';
  }

  getWeatherIcon(condition, sun) {
    if (!Object.prototype.hasOwnProperty.call(weatherIcons, condition)) return 'mdi:help-circle-outline';
    if (this.config.animated_icons === true) {
      const iconName = sun === 'below_horizon' ? weatherIconsNight[condition] : weatherIconsDay[condition];
      return `${this.baseIconPath}${iconName}.svg`;
    } else if (this.config.icons) {
      const iconName = sun === 'below_horizon' ? weatherIconsNight[condition] : weatherIconsDay[condition];
      return `${this.config.icons}${iconName}.svg`;
    }
    return weatherIcons[condition];
  }

  /**
   * Get local icon path - tries different common paths for HACS/manual installation
   */
  getLocalIconPath() {
    // Get the card's script URL to determine installation path
    const scripts = document.querySelectorAll('script[src*="weather-chart-card"]');
    if (scripts.length > 0) {
      const scriptSrc = scripts[scripts.length - 1].src;
      const basePath = scriptSrc.substring(0, scriptSrc.lastIndexOf('/'));
      return `${basePath}/icons/`;
    }
    // Fallback paths for common installations
    return '/hacsfiles/uninus-weather-chart-card/icons/';
  }

  /**
   * Handle icon loading error - fallback to local icons or MDI icons
   */
  handleIconError(event, condition, sun) {
    const img = event.target;
    // An asynchronous image error may arrive after Lit removed/replaced it.
    if (!img || !img.parentNode) return;
    const currentSrc = img.src;
    
    // If already tried local bundled icons, try custom path if configured
    if (img.dataset.fallbackAttempted === 'bundled') {
      if (this.config.icons && !currentSrc.includes(this.config.icons)) {
        img.dataset.fallbackAttempted = 'custom';
        const iconName = sun === 'below_horizon' ? weatherIconsNight[condition] : weatherIconsDay[condition];
        img.src = `${this.config.icons}${iconName}.svg`;
        return;
      }
      img.dataset.fallbackAttempted = 'final';
    }
    
    // If all fallbacks failed, use MDI icon
    if (img.dataset.fallbackAttempted === 'custom' || img.dataset.fallbackAttempted === 'final') {
      // Replace img with ha-icon
      const haIcon = document.createElement('ha-icon');
      haIcon.setAttribute('icon', weatherIcons[condition]);
      haIcon.style.cssText = img.style.cssText;
      img.parentNode.replaceChild(haIcon, img);
      return;
    }
    
    // First fallback: try local bundled icons
    if (!img.dataset.fallbackAttempted) {
      img.dataset.fallbackAttempted = 'bundled';
      const iconName = sun === 'below_horizon' ? weatherIconsNight[condition] : weatherIconsDay[condition];
      const localPath = this.getLocalIconPath();
      img.src = `${localPath}${iconName}.svg`;
    }
  }

getWindDirIcon(deg) {
  if (typeof deg === 'number') {
    return cardinalDirectionsIcon[parseInt((deg + 22.5) / 45.0)];
  } else {
    var i = 9;
    switch (deg) {
      case "N":
        i = 0;
        break;
      case "NNE":
      case "NE":
        i = 1;
        break;
      case "ENE":
      case "E":
        i = 2;
        break;
      case "ESE":
      case "SE":
        i = 3;
        break;
      case "SSE":
      case "S":
        i = 4;
        break;
      case "SSW":
      case "SW":
        i = 5;
        break;
      case "WSW":
      case "W":
        i = 6;
        break;
      case "NW":
      case "NNW":
        i = 7;
        break;
      case "WNW":
        i = 8;
        break;
      default:
        i = 9;
        break;
    }
    return cardinalDirectionsIcon[i];
  }
}

getWindDir(deg) {
  if (typeof deg === 'number') {
    return this.ll('cardinalDirections')[parseInt((deg + 11.25) / 22.5)];
  } else {
    return deg;
  }
}

calculateBeaufortScale(windSpeed) {
  const unitConversion = {
    'km/h': 1,
    'm/s': 3.6,
    'mph': 1.60934,
  };

  if (!this.weather || !this.weather.attributes.wind_speed_unit) {
    throw new Error('wind_speed_unit not available in weather attributes.');
  }

  const wind_speed_unit = this.weather.attributes.wind_speed_unit;
  const conversionFactor = unitConversion[wind_speed_unit];

  if (typeof conversionFactor !== 'number') {
    throw new Error(`Unknown wind_speed_unit: ${wind_speed_unit}`);
  }

  const windSpeedInKmPerHour = windSpeed * conversionFactor;

  if (windSpeedInKmPerHour < 1) return 0;
  else if (windSpeedInKmPerHour < 6) return 1;
  else if (windSpeedInKmPerHour < 12) return 2;
  else if (windSpeedInKmPerHour < 20) return 3;
  else if (windSpeedInKmPerHour < 29) return 4;
  else if (windSpeedInKmPerHour < 39) return 5;
  else if (windSpeedInKmPerHour < 50) return 6;
  else if (windSpeedInKmPerHour < 62) return 7;
  else if (windSpeedInKmPerHour < 75) return 8;
  else if (windSpeedInKmPerHour < 89) return 9;
  else if (windSpeedInKmPerHour < 103) return 10;
  else if (windSpeedInKmPerHour < 118) return 11;
  else return 12;
}

convertTemperature(temp, fromUnit, toUnit) {
  if (!toUnit || fromUnit === toUnit) return temp;
  
  if (toUnit === '°C' && fromUnit === '°F') {
    return (temp - 32) * 5/9;
  } else if (toUnit === '°F' && fromUnit === '°C') {
    return (temp * 9/5) + 32;
  }
  
  return temp;
}

async firstUpdated(changedProperties) {
  super.firstUpdated(changedProperties);
  this.measureCard();
  await new Promise(resolve => setTimeout(resolve, 0));
  this.drawChart();

  if (this.config.autoscroll) {
    this.autoscroll();
  }
}


async updated(changedProperties) {
  await this.updateComplete;

  if (changedProperties.has('config')) {
    const oldConfig = changedProperties.get('config');

    const entityChanged = oldConfig && this.config.entity !== oldConfig.entity;
    const forecastTypeChanged = oldConfig && this.config.forecast.type !== oldConfig.forecast.type;
    const autoscrollChanged = oldConfig && this.config.autoscroll !== oldConfig.autoscroll;

    if (entityChanged || forecastTypeChanged) {
      if (this.forecastSubscriber && typeof this.forecastSubscriber === 'function') {
        this.forecastSubscriber();
      }

      this.subscribeForecastEvents();
    }

    if (this.forecasts && this.forecasts.length) {
      this.drawChart();
    }

    if (autoscrollChanged) {
      if (!this.config.autoscroll) {
        this.autoscroll();
      } else {
        this.cancelAutoscroll();
      }
    }
  }

  if (changedProperties.has('weather')) {
    this.updateChart();
  }
}

autoscroll() {
  if (this.autoscrollTimeout) {
    // Autscroll already set, nothing to do
    return;
  }

  const updateChartOncePerHour = () => {
    const now = new Date();
    const nextHour = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours()+1,
    );
    this.autoscrollTimeout = setTimeout(() => {
      this.autoscrollTimeout = null;
      this.updateChart();
      drawChartOncePerHour();
    }, nextHour - now);
  };

  updateChartOncePerHour();
}

cancelAutoscroll() {
  if (this.autoscrollTimeout) {
    clearTimeout(this.autoscrollTimeout);
  }
}

getTemperatureColor(temp, unit) {
  // Convert to Celsius for consistent thresholds
  let tempC = temp;
  if (unit === '°F') {
    tempC = (temp - 32) * 5/9;
  }
  
  // 6-level color spectrum
  if (tempC < 5) {
    return 'rgba(30, 136, 229, 1.0)';   // Cold - Dark Blue
  } else if (tempC < 15) {
    return 'rgba(129, 212, 250, 1.0)';  // Cool - Light Blue
  } else if (tempC < 22) {
    return 'rgba(129, 199, 132, 1.0)';  // Comfortable - Green
  } else if (tempC < 26) {
    return 'rgba(255, 241, 118, 1.0)';  // Pleasant/Warm - Yellow
  } else if (tempC < 32) {
    return 'rgba(255, 167, 38, 1.0)';   // Hot - Orange
  } else {
    return 'rgba(244, 67, 54, 1.0)';    // Very Hot - Red
  }
}

createTemperatureGradient(data, unit, ctx, chartArea) {
  if (!chartArea) {
    return null;
  }
  
  const gradient = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
  const dataLength = data.length;
  
  for (let i = 0; i < dataLength; i++) {
    const position = dataLength > 1 ? i / (dataLength - 1) : 0;
    const color = this.getTemperatureColor(data[i], unit);
    gradient.addColorStop(position, color);
  }
  
  return gradient;
}

drawChart({ config, language, weather, forecastItems } = this) {
  const self = this; // Capture component instance for use in Chart.js callbacks
  
  if (!this.forecasts || !this.forecasts.length) {
    return [];
  }

  const chartCanvas = this.renderRoot && this.renderRoot.querySelector('#forecastChart');
  if (!chartCanvas) {
    console.error('Canvas element not found:', this.renderRoot);
    return;
  }

  if (this.forecastChart) {
    this.forecastChart.destroy();
  }
  var tempUnit = this.unitTemperature || this._hass.config.unit_system.temperature;
  var lengthUnit = this._hass.config.unit_system.length;
  const data = this.computeForecastData();
  const precipitationType = data.effectivePrecipitationType;
  const finiteTemperatures = [...data.tempHigh, ...data.tempLow].filter(Number.isFinite);
  if (precipitationType === 'probability') {
    var precipUnit = '%';
  } else {
    var precipUnit = lengthUnit === 'km' ? this.ll('units')['mm'] : this.ll('units')['in'];
  }

  var style = getComputedStyle(document.body);
  var backgroundColor = style.getPropertyValue('--card-background-color');
  var textColor = style.getPropertyValue('--primary-text-color');
  var dividerColor = style.getPropertyValue('--divider-color');
  const canvas = this.renderRoot.querySelector('#forecastChart');
  if (!canvas) {
    requestAnimationFrame(() => this.drawChart());
    return;
  }

  const ctx = canvas.getContext('2d');

  let precipMax;

  if (precipitationType === 'probability') {
    precipMax = 100;
  } else {
    if (config.forecast.type === 'hourly') {
      precipMax = lengthUnit === 'km' ? 4 : 1;
    } else {
      precipMax = lengthUnit === 'km' ? 20 : 1;
    }
  }

  Chart.defaults.color = textColor;
  Chart.defaults.scale.grid.color = dividerColor;
  Chart.defaults.elements.line.fill = false;
  Chart.defaults.elements.line.tension = 0.3;
  Chart.defaults.elements.line.borderWidth = 1.5;
  Chart.defaults.elements.point.radius = 2;
  Chart.defaults.elements.point.hitRadius = 10;

  var datasets = [
    {
      label: this.ll('tempHi'),
      type: 'line',
      data: data.tempHigh,
      yAxisID: 'TempAxis',
      borderColor: config.forecast.use_color_thresholds 
        ? (context) => {
            if (context.chart.chartArea) {
              return this.createTemperatureGradient(data.tempHigh, tempUnit, context.chart.ctx, context.chart.chartArea);
            }
            return config.forecast.temperature1_color;
          }
        : config.forecast.temperature1_color,
      backgroundColor: config.forecast.use_color_thresholds
        ? (context) => {
            if (context.chart.chartArea) {
              return this.createTemperatureGradient(data.tempHigh, tempUnit, context.chart.ctx, context.chart.chartArea);
            }
            return config.forecast.temperature1_color;
          }
        : config.forecast.temperature1_color,
      segment: {
        borderColor: config.forecast.use_color_thresholds
          ? (ctx) => {
              const temp = ctx.p1.parsed.y;
              return this.getTemperatureColor(temp, tempUnit);
            }
          : undefined,
      },
    },
    {
      label: this.ll('tempLo'),
      type: 'line',
      data: data.tempLow,
      yAxisID: 'TempAxis',
      borderDash: [5, 5],
      borderColor: config.forecast.temperature2_color,
      backgroundColor: config.forecast.temperature2_color,
    },
    {
      label: this.ll('precip'),
      type: 'bar',
      data: data.precip,
      yAxisID: 'PrecipAxis',
      borderColor: config.forecast.precipitation_color,
      backgroundColor: config.forecast.precipitation_color,
      barPercentage: config.forecast.precip_bar_size / 100,
      categoryPercentage: 1.0,
      datalabels: {
        display: function (context) {
          const rainfall = context.dataset.data[context.dataIndex];
          const probability = self.getNumericForecastValue(data.forecast[context.dataIndex], 'precipitation_probability');
          if (rainfall > 0) {
            return 'true';
          }
          if (precipitationType === 'rainfall' && config.forecast.show_probability && probability !== undefined && probability !== null && probability > 0) {
            return 'true';
          }
          return false;
        },
      formatter: function (value, context) {
        const rainfall = context.dataset.data[context.dataIndex];
        const probability = self.getNumericForecastValue(data.forecast[context.dataIndex], 'precipitation_probability');

        if (!Number.isFinite(rainfall)) return '';
        let formattedValue;
        if (precipitationType === 'rainfall') {
          if (probability !== undefined && probability !== null && config.forecast.show_probability) {
	    formattedValue = `${rainfall > 9 ? Math.round(rainfall) : rainfall.toFixed(1)} ${precipUnit}\n${Math.round(probability)}%`;
          } else {
            formattedValue = `${rainfall > 9 ? Math.round(rainfall) : rainfall.toFixed(1)} ${precipUnit}`;
          }
        } else {
          formattedValue = `${rainfall > 9 ? Math.round(rainfall) : rainfall.toFixed(1)} ${precipUnit}`;
        }

        formattedValue = formattedValue.replace('\n', '\n\n');

        return formattedValue;
      },
        textAlign: 'center',
        textBaseline: 'middle',
        align: 'top',
        anchor: 'start',
        offset: -10,
      },
    },
  ];

  const chart_text_color = (config.forecast.chart_text_color === 'auto') ? textColor : config.forecast.chart_text_color;

  if (config.forecast.style === 'style2') {
    datasets[0].datalabels = {
      display: function (context) {
        return Number.isFinite(context.dataset.data[context.dataIndex]);
      },
      formatter: function (value, context) {
        const temperature = context.dataset.data[context.dataIndex];
        return Number.isFinite(temperature) ? temperature + '°' : '';
      },
      align: 'top',
      anchor: 'center',
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      color: config.forecast.use_color_thresholds
        ? (context) => this.getTemperatureColor(context.dataset.data[context.dataIndex], tempUnit)
        : (chart_text_color || config.forecast.temperature1_color),
      font: {
        size: parseInt(config.forecast.labels_font_size) + 1,
        lineHeight: 0.7,
      },
    };

    datasets[1].datalabels = {
      display: function (context) {
        return Number.isFinite(context.dataset.data[context.dataIndex]);
      },
      formatter: function (value, context) {
        const temperature = context.dataset.data[context.dataIndex];
        return Number.isFinite(temperature) ? temperature + '°' : '';
      },
      align: 'bottom',
      anchor: 'center',
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      color: chart_text_color || config.forecast.temperature2_color,
      font: {
        size: parseInt(config.forecast.labels_font_size) + 1,
        lineHeight: 0.7,
      },
    };
  }

  this.forecastChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.dateTime,
      datasets: datasets,
    },
    options: {
      maintainAspectRatio: false,
      animation: config.forecast.disable_animation === true ? { duration: 0 } : {},
      layout: {
        padding: {
          bottom: 10,
        },
      },
      scales: {
        x: {
          position: 'top',
          border: {
            width: 0,
          },
          grid: {
            drawTicks: false,
            color: dividerColor,
          },
          ticks: {
              maxRotation: 0,
              color: config.forecast.chart_datetime_color || textColor,
              padding: precipitationType === 'rainfall' && config.forecast.show_probability && config.forecast.type !== 'hourly' ? 4 : 10,
              callback: function (value, index, values) {
                  var datetime = this.getLabelForValue(value);
                  var dateObj = new Date(datetime);
                  var timezone = config.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
                  var locale = config.locale || undefined;
        
                  var timeFormatOptions = {
                      hour12: config.use_12hour_format,
                      hour: 'numeric',
                      ...(config.use_12hour_format ? {} : { minute: 'numeric' }),
                      timeZone: timezone,
                  };

                  var time = dateObj.toLocaleTimeString(locale, timeFormatOptions);

                  // Get hours in the target timezone
                  var tzHours = parseInt(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: timezone }).format(dateObj));
                  var tzMinutes = parseInt(new Intl.DateTimeFormat('en-US', { minute: 'numeric', timeZone: timezone }).format(dateObj));

                  if (tzHours === 0 && tzMinutes === 0 && config.forecast.type === 'hourly') {
                      var monthShort = self.getLocalizedMonthNameShort(dateObj, timezone);
                      var dayNumber = self.getLocalizedDayNumber(dateObj, locale, timezone);
                      var date = monthShort + ' ' + dayNumber;
                      time = time.replace('a.m.', 'AM').replace('p.m.', 'PM');
                      return [date, time];
                  }

                  if (config.forecast.type !== 'hourly') {
                      var weekday = self.getLocalizedDayName(dateObj, timezone);
                      
                      // Add date number if show_date_labels is enabled
                      if (config.forecast.show_date_labels) {
                          var dayNumber = self.getLocalizedDayNumber(dateObj, locale, timezone);
                          return [weekday, dayNumber];  // Return as array for multi-line display
                      }
                      
                      return weekday;
                  }

                  time = time.replace('a.m.', 'AM').replace('p.m.', 'PM');
                  return time;
              },
          },
          reverse: document.dir === 'rtl' ? true : false,
        },
        TempAxis: {
          position: 'left',
          beginAtZero: false,
          suggestedMin: finiteTemperatures.length ? Math.min(...finiteTemperatures) - 5 : undefined,
          suggestedMax: finiteTemperatures.length ? Math.max(...finiteTemperatures) + 3 : undefined,
          grid: {
            display: false,
            drawTicks: false,
          },
          ticks: {
            display: false,
          },
        },
        PrecipAxis: {
          position: 'right',
          suggestedMax: precipMax,
          beginAtZero: true,
          grid: {
            display: true,
            drawOnChartArea: true,
            drawTicks: false,
            lineWidth: (context) => context.tick.value === 0 ? 1 : 0,
            color: (context) => context.tick.value === 0 ? 'rgba(128, 128, 128, 0.2)' : 'transparent',
          },
          ticks: {
            display: false,
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        datalabels: {
          backgroundColor: backgroundColor,
          borderColor: context => context.dataset.backgroundColor,
          borderRadius: 0,
          borderWidth: 1.5,
          padding: precipitationType === 'rainfall' && config.forecast.show_probability && config.forecast.type !== 'hourly' ? 3 : 4,
          color: chart_text_color || textColor,
          font: {
            size: config.forecast.labels_font_size,
            lineHeight: 0.7,
          },
          formatter: function (value, context) {
            const temperature = context.dataset.data[context.dataIndex];
        return Number.isFinite(temperature) ? temperature + '°' : '';
          },
        },
        tooltip: {
          caretSize: 0,
          caretPadding: 15,
          callbacks: {
            title: function (TooltipItem) {
              var datetime = TooltipItem[0].label;
              var timezone = config.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
              var dateObj = new Date(datetime);
              
              var monthShort = self.getLocalizedMonthNameShort(dateObj, timezone);
              var dayNumber = self.getLocalizedDayNumber(dateObj, config.locale, timezone);
              var weekdayShort = self.getLocalizedDayName(dateObj, timezone);
              
              var timeFormatter = new Intl.DateTimeFormat(config.locale || 'en-US', {
                hour: 'numeric',
                minute: 'numeric',
                hour12: config.use_12hour_format,
                timeZone: timezone
              });
              var timeStr = timeFormatter.format(dateObj);
              
              return weekdayShort + ', ' + monthShort + ' ' + dayNumber + ', ' + timeStr;
            },
    label: function (context) {
      var label = context.dataset.label;
      var value = context.formattedValue;
      var probability = self.getNumericForecastValue(data.forecast[context.dataIndex], 'precipitation_probability');
      var unit = context.datasetIndex === 2 ? precipUnit : tempUnit;

      if (precipitationType === 'rainfall' && context.datasetIndex === 2 && config.forecast.show_probability && probability !== undefined && probability !== null) {
        return label + ': ' + value + ' ' + precipUnit + ' / ' + Math.round(probability) + '%';
      } else {
        return label + ': ' + value + ' ' + unit;
      }
            },
          },
        },
      },
    },
  });
}

getForecastValue(entry, ...keys) {
  if (!entry) {
    return undefined;
  }

  for (const key of keys) {
    if (typeof entry[key] !== 'undefined' && entry[key] !== null) {
      return entry[key];
    }
  }

  return undefined;
}

getNumericForecastValue(entry, ...keys) {
  const value = this.getForecastValue(entry, ...keys);
  if ((typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && value.trim() === '')) {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

roundForecastNumber(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return undefined;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

getDatePartsForTimeZone(value, timeZone = this.getTimezone()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date).forEach((part) => {
    if (part.type !== 'literal') {
      parts[part.type] = part.value;
    }
  });

  return parts;
}

getForecastConditionScore(entry) {
  const precipitation = this.getNumericForecastValue(entry, 'precipitation', 'native_precipitation') || 0;
  const probability = this.getNumericForecastValue(entry, 'precipitation_probability') || 0;
  const severityByCondition = {
    lightning: 70,
    'lightning-rainy': 70,
    pouring: 60,
    rainy: 50,
    snowy: 50,
    'snowy-rainy': 50,
    hail: 45,
    fog: 30,
    cloudy: 20,
    windy: 20,
    partlycloudy: 10,
    sunny: 0,
    'clear-night': 0,
  };
  const condition = entry ? entry.condition : undefined;
  const severity = severityByCondition[condition] || 0;
  return (precipitation * 100) + probability + severity;
}

pickRepresentativeForecast(entries) {
  if (!entries.length) {
    return null;
  }

  return entries.slice().sort((a, b) => this.getForecastConditionScore(b) - this.getForecastConditionScore(a))[0];
}

mergeDailyForecastEntries(entries) {
  if (!entries.length) {
    return null;
  }

  if (entries.length === 1) {
    return entries[0];
  }

  const representative = this.pickRepresentativeForecast(entries) || entries[0];
  const highTemperatures = entries
    .map((entry) => this.getNumericForecastValue(entry, 'temperature', 'native_temperature'))
    .filter((value) => value !== undefined);
  const lowTemperatures = entries
    .map((entry) => this.getNumericForecastValue(entry, 'templow', 'native_temp_low', 'native_templow', 'temperature', 'native_temperature'))
    .filter((value) => value !== undefined);
  const precipitations = entries
    .map((entry) => this.getNumericForecastValue(entry, 'precipitation', 'native_precipitation'))
    .filter((value) => value !== undefined);
  const probabilities = entries
    .map((entry) => this.getNumericForecastValue(entry, 'precipitation_probability'))
    .filter((value) => value !== undefined);
  const windCandidates = entries
    .map((entry) => ({
      speed: this.getNumericForecastValue(entry, 'wind_speed'),
      bearing: this.getForecastValue(entry, 'wind_bearing'),
    }))
    .sort((a, b) => (b.speed || 0) - (a.speed || 0));
  const windEntry = windCandidates[0];

  const temperatureHigh = highTemperatures.length ? Math.max(...highTemperatures) : this.getNumericForecastValue(representative, 'temperature', 'native_temperature');
  const temperatureLow = lowTemperatures.length ? Math.min(...lowTemperatures) : this.getNumericForecastValue(representative, 'templow', 'native_temp_low', 'native_templow', 'temperature', 'native_temperature');
  const precipitation = precipitations.length ? Math.max(...precipitations) : this.getNumericForecastValue(representative, 'precipitation', 'native_precipitation');
  const precipitationProbability = probabilities.length ? Math.max(...probabilities) : this.getNumericForecastValue(representative, 'precipitation_probability');

  return {
    ...representative,
    datetime: entries[0].datetime,
    temperature: temperatureHigh,
    templow: temperatureLow,
    native_temp_low: temperatureLow,
    native_templow: temperatureLow,
    precipitation,
    native_precipitation: precipitation,
    precipitation_probability: precipitationProbability,
    wind_speed: windEntry ? windEntry.speed : this.getNumericForecastValue(representative, 'wind_speed'),
    wind_bearing: windEntry ? windEntry.bearing : this.getForecastValue(representative, 'wind_bearing'),
  };
}

normalizeForecastEntries(forecast = this.forecasts || []) {
  if (!Array.isArray(forecast) || !forecast.length) {
    return [];
  }

  if (this.config.forecast.type !== 'daily') {
    return forecast;
  }

  const timeZone = this.getTimezone();
  const buckets = [];
  const bucketMap = new Map();

  forecast.forEach((entry) => {
    const parts = this.getDatePartsForTimeZone(entry.datetime, timeZone);
    const key = parts ? `${parts.year}-${parts.month}-${parts.day}` : entry.datetime;
    if (!bucketMap.has(key)) {
      const bucket = { key, entries: [] };
      bucketMap.set(key, bucket);
      buckets.push(bucket);
    }
    bucketMap.get(key).entries.push(entry);
  });

  return buckets
    .map((bucket) => this.mergeDailyForecastEntries(bucket.entries))
    .filter(Boolean);
}

computeForecastData({ config, forecastItems } = this) {
  var rawForecast = this.normalizeForecastEntries(this.forecasts || []);
  var forecast = rawForecast.slice(0, forecastItems);
  var roundTemp = config.forecast.round_temp == true;
  var dateTime = [];
  var tempHigh = [];
  var tempLow = [];
  var precip = [];
  let hasRainfall = false;
  let hasProbability = false;

  for (var i = 0; i < forecast.length; i++) {
    var d = forecast[i];
    if (config.autoscroll) {
      const cutoff = (config.forecast.type === 'hourly' ? 1 : 24) * 60 * 60 * 1000;
      if (new Date() - new Date(d.datetime) > cutoff) {
        continue;
      }
    }
    dateTime.push(d.datetime);

    let highTemp = this.getNumericForecastValue(d, 'temperature', 'native_temperature');
    let lowTemp = this.getNumericForecastValue(d, 'templow', 'native_temp_low', 'native_templow');

    if (this.unitTemperature && this.weather && this.unitTemperature !== this.weather.attributes.temperature_unit) {
      if (highTemp !== undefined) {
        highTemp = this.convertTemperature(highTemp, this.weather.attributes.temperature_unit, this.unitTemperature);
      }
      if (typeof lowTemp !== 'undefined') {
        lowTemp = this.convertTemperature(lowTemp, this.weather.attributes.temperature_unit, this.unitTemperature);
      }
    }

    if (highTemp !== undefined) {
      highTemp = roundTemp ? Math.round(highTemp) : Math.round(highTemp * 10) / 10;
    }
    if (typeof lowTemp !== 'undefined') {
      lowTemp = roundTemp ? Math.round(lowTemp) : Math.round(lowTemp * 10) / 10;
    }

    tempHigh.push(Number.isFinite(highTemp) ? highTemp : undefined);
    tempLow.push(Number.isFinite(lowTemp) ? lowTemp : undefined);

    const precipitationValue = this.getNumericForecastValue(d, 'precipitation', 'native_precipitation');
    const probabilityValue = this.getNumericForecastValue(d, 'precipitation_probability');
    if (precipitationValue !== undefined && precipitationValue > 0) {
      hasRainfall = true;
    }
    if (probabilityValue !== undefined && probabilityValue > 0) {
      hasProbability = true;
    }

    if (config.forecast.precipitation_type === 'probability') {
      precip.push(probabilityValue);
    } else {
      precip.push(precipitationValue);
    }
  }

  const effectivePrecipitationType = config.forecast.precipitation_type === 'probability'
    ? 'probability'
    : (hasRainfall ? 'rainfall' : (hasProbability ? 'probability' : 'rainfall'));

  if (effectivePrecipitationType === 'probability' && config.forecast.precipitation_type !== 'probability') {
    precip = forecast.map((entry) => this.getNumericForecastValue(entry, 'precipitation_probability'));
  }

  return {
    forecast,
    dateTime,
    tempHigh,
    tempLow,
    precip,
    effectivePrecipitationType,
  }
}

updateChart({ forecasts, forecastChart } = this) {
  if (!forecasts || !forecasts.length) {
    return [];
  }

  const data = this.computeForecastData();

  if (forecastChart) {
    forecastChart.data.labels = data.dateTime;
    forecastChart.data.datasets[0].data = data.tempHigh;
    forecastChart.data.datasets[1].data = data.tempLow;
    forecastChart.data.datasets[2].data = data.precip;
    forecastChart.update();
  }
}

  render({config, _hass, weather} = this) {
    if (!config || !_hass) {
      return html``;
    }
    if (!weather || !weather.attributes) {
      return html`
        <style>
          .card {
            padding-top: ${config.title? '0px' : '16px'};
            padding-right: 16px;
            padding-bottom: 16px;
            padding-left: 16px;
          }
        </style>
        <ha-card header="${config.title}">
          <div class="card">
            Please, check your weather entity
          </div>
        </ha-card>
      `;
    }
    return html`
      <style>
        ha-card {
          position: relative;
          isolation: isolate;
          ${config.title ? 'padding-bottom: 8px;' : ''}
        }
        ha-icon {
          color: var(--paper-item-icon-color);
        }
        img {
          width: ${config.icons_size}px;
          height: ${config.icons_size}px;
        }
        .card {
          padding-top: ${config.title ? '0px' : '16px'};
          padding-right: 16px;
          padding-bottom: ${config.show_last_changed === true ? '2px' : '16px'};
          padding-left: 16px;
        }
        .main {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: ${config.current_temp_size}px;
          margin-bottom: 10px;
          position: relative;
        }
        .main .weather-icon {
          position: absolute;
          left: 50%;
          top: 10px;
          transform: translate(-50%, -50%);
          z-index: 1;
        }
        .main .weather-icon ha-icon {
          --mdc-icon-size: ${config.main_icon_size || 150}px;
        }
        .main .weather-icon img {
          width: ${config.main_icon_size || 150}px;
          height: ${config.main_icon_size || 150}px;
        }
        .main .temp-info {
          display: flex;
          flex-direction: column;
          z-index: 2;
        }
        .main .temp-info > div {
          line-height: 1.2;
        }
        .main .current-temp {
          font-size: ${config.current_temp_size}px;
          font-weight: 300;
        }
        .main .current-condition {
          font-size: 18px;
          margin-top: 4px;
        }
        .main span {
          font-size: 18px;
          color: var(--secondary-text-color);
        }
        .attributes {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
      	  font-weight: 300;
          direction: ltr;
        }
        .chart-container {
          position: relative;
          height: ${config.forecast.chart_height}px;
          width: 100%;
          direction: ltr;
        }
        .conditions {
          display: flex;
          justify-content: space-around;
          align-items: center;
          margin: 0px 5px 0px 5px;
      	  cursor: pointer;
        }
        .forecast-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin: 1px;
        }
        .wind-details {
          display: flex;
          justify-content: space-around;
          align-items: center;
          font-weight: 300;
        }
        .wind-detail {
          display: flex;
          align-items: center;
          margin: 1px;
        }
        .wind-detail ha-icon {
          --mdc-icon-size: 15px;
          margin-right: 1px;
          margin-inline-start: initial;
          margin-inline-end: 1px;
        }
        .wind-icon {
          margin-right: 1px;
          margin-inline-start: initial;
          margin-inline-end: 1px;
          position: relative;
	        bottom: 1px;
        }
        .wind-speed {
          font-size: 11px;
          margin-right: 1px;
          margin-inline-start: initial;
          margin-inline-end: 1px;
        }
        .wind-unit {
          font-size: 9px;
          margin-left: 1px;
          margin-inline-start: 1px;
          margin-inline-end: initial;
        }
        .current-time {
          position: absolute;
          top: ${config.title ? '24px' : '20px'};
          right: 16px;
          inset-inline-start: initial;
          inset-inline-end: 16px;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          z-index: 10;
          font-size: ${config.time_size}px;
        }
        .date-text {
          font-size: ${config.day_date_size}px;
          color: var(--secondary-text-color);
        }
        .main .feels-like {
          font-size: 13px;
          margin-top: 5px;
          font-weight: 400;
        }
        .main .description {
	        font-style: italic;
          font-size: 13px;
          margin-top: 5px;
          font-weight: 400;
        }
        .weather-alerts-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 14px;
        }
        .weather-alert-banner {
          border-radius: 12px;
          padding: 12px 14px;
          color: #fff;
          cursor: pointer;
          border: 2px solid rgba(255, 255, 255, 0.45);
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28);
          overflow: hidden;
        }
        .weather-alert-banner.critical {
          background: linear-gradient(135deg, #8b0000, #e00032 55%, #ff1744);
          border-color: #ff8a80;
          box-shadow: 0 0 20px rgba(255, 23, 68, 0.70);
        }
        .weather-alert-banner.critical.flash {
          animation: weatherAlertPulse 1.8s ease-in-out infinite;
        }
        .weather-alert-banner.warning {
          background: linear-gradient(135deg, #bf360c, #f57c00 60%, #ff9800);
          border-color: #ffd180;
        }
        .weather-alert-banner.advisory {
          background: linear-gradient(135deg, #1a237e, #3949ab 55%, #5e35b1);
          border-color: #b39ddb;
        }
        .weather-alert-banner.info {
          background: linear-gradient(135deg, #006064, #00838f);
          border-color: #80deea;
        }
        .weather-alert-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 800;
          font-size: 15px;
          line-height: 1.25;
        }
        .weather-alert-icon {
          font-size: 20px;
          line-height: 1;
        }
        .weather-alert-summary {
          margin-top: 5px;
          font-weight: 650;
          opacity: 0.96;
        }
        .weather-alert-message {
          margin-top: 8px;
          font-size: 13px;
          line-height: 1.45;
          white-space: pre-wrap;
          opacity: 0.96;
        }
        .weather-alert-count {
          margin-left: auto;
          font-size: 12px;
          font-weight: 800;
          padding: 2px 7px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.22);
          white-space: nowrap;
        }
        .weather-alert-toggle {
          margin-left: 4px;
          font-size: 18px;
          font-weight: 900;
          line-height: 1;
          opacity: 0.95;
        }
        .weather-alert-helper {
          margin-top: 6px;
          font-size: 12px;
          font-weight: 700;
          opacity: 0.84;
        }
        @keyframes weatherAlertPulse {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.01); filter: brightness(1.18); }
        }
        .text-sensor-section {
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid var(--divider-color);
          cursor: pointer;
        }
        .text-sensor-title {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 8px;
        }
        .text-sensor-content {
          font-size: 13px;
          line-height: 1.5;
          white-space: pre-wrap;
          color: var(--secondary-text-color);
        }
        .weather-data-footer {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: 4px 12px;
          font-size: 13px;
        }
        .weather-data-status {
          color: var(--warning-color, #f9a825);
          overflow-wrap: anywhere;
        }
        .updated {
          font-size: 13px;
          align-items: right;
          font-weight: 300;
          margin-bottom: 1px;
        }
        .forecast-toggle {
          cursor: pointer;
          background: var(--primary-color);
          color: var(--text-primary-color);
          border: none;
          border-radius: 4px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 700;
          opacity: 0.9;
          transition: opacity 0.2s;
          margin-bottom: 4px;
        }
        .forecast-toggle:hover {
          opacity: 1;
        }
      </style>

      <ha-card header="${config.title}">
        <div class="card">
          ${this.renderAlertBanner()}

          ${this.renderClock()}
          ${this.renderMain()}
          ${this.renderAttributes()}
          <div class="chart-container" style="${this.forecasts?.length ? '' : 'display: none'}">
            <canvas id="forecastChart"></canvas>
          </div>
          ${this.renderForecastConditionIcons()}
          ${this.renderWind()}
          ${this.renderTextSensor()}
          <div class="weather-data-footer">
            ${this._weatherUnavailable ? '' : this.renderLastUpdated()}
            ${this._weatherUnavailable && this._lastValidWeather?.last_changed ? html`<time class="snapshot-time" datetime="${this._lastValidWeather.last_changed}">最後有效資料：${new Date(this._lastValidWeather.last_changed).toLocaleString(this.language)}</time>` : ''}
            ${this._weatherUnavailable && this.forecasts?.length && this._forecastReceivedAt ? html`<time class="snapshot-forecast-time" datetime="${this._forecastReceivedAt}">最後有效預報資料：${new Date(this._forecastReceivedAt).toLocaleString(this.language)}</time>` : ''}
            ${this._weatherUnavailable && this._lastValidTextSensor?.value?.last_changed && !Number.isNaN(Date.parse(this._lastValidTextSensor.value.last_changed)) ? html`<time class="snapshot-text-time" datetime="${this._lastValidTextSensor.value.last_changed}">最後有效文字資料：${new Date(this._lastValidTextSensor.value.last_changed).toLocaleString(this.language)}</time>` : ''}
            ${this._weatherUnavailable && !this._lastValidWeather && !this.forecasts?.length && !this._lastValidTextSensor ? html`<span class="weather-data-empty">尚無有效資料</span>` : ''}
            ${this._weatherUnavailable ? html`<span class="weather-data-status" role="status">資料暫時不可用</span>` : ''}
          </div>
        </div>
      </ha-card>
    `;
  }

getTextSensorState() {
  if (!this._hass || !this._hass.states || !this.config.text_sensor_entity) {
    return null;
  }

  const entity = this.config.text_sensor_entity;
  const value = this._hass.states[entity];
  if (value && typeof value.state === 'string' && value.state.trim() && !['unknown', 'unavailable', 'none', 'null', 'nan'].includes(value.state.trim().toLowerCase())) {
    this._lastValidTextSensor = { entity, value: { ...value, attributes: { ...value.attributes } } };
    this.saveWeatherSnapshot();
    return value;
  }
  return this._lastValidTextSensor?.entity === entity ? this._lastValidTextSensor.value : null;
}


getAlertEntities({ config } = this) {
  const configured = [];
  if (Array.isArray(config.alert_entities)) {
    configured.push(...config.alert_entities);
  }
  configured.push(config.alert_entity_1, config.alert_entity_2, config.alert_entity_3);
  return [...new Set(configured.filter((entity) => typeof entity === 'string' && entity.trim() !== ''))];
}

getActiveAlertStates({ config } = this) {
  if (config.show_alerts !== true || !this._hass || !this._hass.states) {
    return [];
  }
  const severityRank = { critical: 0, warning: 1, advisory: 2, info: 3 };
  return this.getAlertEntities({ config })
    .map((entityId) => ({ entityId, stateObj: this._hass.states[entityId] }))
    .filter(({ stateObj }) => stateObj && stateObj.state === 'active')
    .sort((a, b) => {
      const aSeverity = a.stateObj.attributes ? a.stateObj.attributes.severity : undefined;
      const bSeverity = b.stateObj.attributes ? b.stateObj.attributes.severity : undefined;
      const aRank = severityRank[aSeverity] !== undefined ? severityRank[aSeverity] : 99;
      const bRank = severityRank[bSeverity] !== undefined ? severityRank[bSeverity] : 99;
      return aRank - bRank;
    });
}

alertIcon(severity) {
  if (severity === 'critical') return '🚨';
  if (severity === 'warning') return '⚠️';
  if (severity === 'advisory') return '🌀';
  return 'ℹ️';
}

toggleAlertExpansion() {
  this.alertsExpanded = !this.alertsExpanded;
  this.requestUpdate();
}


cleanAlertTitle(title, severity) {
  if (!title) return title;
  const icon = this.alertIcon(severity);
  let cleaned = String(title).trim();
  if (icon && cleaned.startsWith(icon)) {
    cleaned = cleaned.slice(icon.length).trim();
  }
  // OpenCWA notification titles may already include an emoji/symbol. The banner
  // renders a dedicated large severity icon, so strip common leading alert icons
  // from the text title to avoid duplicated small+large icons.
  cleaned = cleaned.replace(/^[\s⚠🚨🌀ℹ️☔⛈️🌧️🌪️🔥❄️]+\s*/u, '').trim();
  return cleaned || title;
}

renderAlertBanner({ config } = this) {
  const alerts = this.getActiveAlertStates({ config });
  if (!alerts.length) {
    return html``;
  }

  const maxItems = Math.max(1, Number(config.alert_max_items || 3));
  const expanded = this.alertsExpanded === true;
  const visibleAlerts = expanded ? alerts.slice(0, maxItems) : alerts.slice(0, 1);
  const hiddenCount = Math.max(0, alerts.length - visibleAlerts.length);
  const firstSeverity = alerts[0].stateObj.attributes && alerts[0].stateObj.attributes.severity ? alerts[0].stateObj.attributes.severity : 'info';
  const flash = firstSeverity === 'critical' && config.alert_flash_critical !== false;

  return html`
    <div class="weather-alerts-section">
      ${visibleAlerts.map(({ entityId, stateObj }, index) => {
        const attrs = stateObj.attributes || {};
        const severity = attrs.severity || 'info';
        const title = this.cleanAlertTitle(attrs.title || attrs.friendly_name || entityId, severity);
        const summary = attrs.summary || '';
        const message = attrs.message || '';
        return html`
          <div
            class="weather-alert-banner ${severity} ${flash && index === 0 ? 'flash' : ''}"
            role="button"
            tabindex="0"
            @click="${() => this.toggleAlertExpansion()}"
            @keydown="${(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.toggleAlertExpansion();
              }
            }}"
          >
            <div class="weather-alert-header">
              <span class="weather-alert-icon">${this.alertIcon(severity)}</span>
              <span>${title}</span>
              ${index === 0 && hiddenCount > 0 ? html`<span class="weather-alert-count">+${hiddenCount} 其他告警</span>` : html``}
              ${index === 0 ? html`<span class="weather-alert-toggle">${expanded ? '⌃' : '⌄'}</span>` : html``}
            </div>
            ${summary ? html`<div class="weather-alert-summary">${summary}</div>` : html``}
            ${expanded && config.alert_show_message !== false && message ? html`<div class="weather-alert-message">${message}</div>` : html``}
          </div>
        `;
      })}
      ${expanded && hiddenCount > 0 ? html`
        <div class="weather-alert-helper">另有 ${hiddenCount} 則告警因 alert_max_items 設定未顯示。</div>
      ` : html``}
    </div>
  `;
}

renderTextSensor({ config } = this) {
  if (config.show_text_sensor !== true) {
    return html``;
  }

  const textSensor = this.getTextSensorState();
  if (!textSensor) {
    return html``;
  }

  const sensorState = textSensor.state;
  if (!sensorState || ['unknown', 'unavailable', 'None', 'null'].includes(sensorState)) {
    return html``;
  }

  const title = config.text_sensor_title || textSensor.attributes.friendly_name || this.config.text_sensor_entity;
  const titleSize = Number(config.text_sensor_title_size || 14);
  const contentSize = Number(config.text_sensor_content_size || 13);

  return html`
    <div class="text-sensor-section" @click="${() => this.showMoreInfo(this.config.text_sensor_entity)}">
      <div class="text-sensor-title" style="font-size: ${titleSize}px;">${title}</div>
      <div class="text-sensor-content" style="font-size: ${contentSize}px;">${sensorState}</div>
    </div>
  `;
}

renderMain({ config, sun, weather, temperature, feels_like, description } = this) {
  if (config.show_main === false)
    return html``;

  const use12HourFormat = config.use_12hour_format;
  const showTime = config.show_time;
  const showDay = config.show_day;
  const showDate = config.show_date;
  const showFeelsLike = config.show_feels_like;
  const showDescription = config.show_description;
  const showCurrentCondition = config.show_current_condition !== false;
  const showTemperature = config.show_temperature !== false;
  const showSeconds = config.show_time_seconds === true;

  let roundedTemperature = parseFloat(temperature);
  
  // Temperature conversion
  if (this.unitTemperature && this.unitTemperature !== this.weather.attributes.temperature_unit) {
    roundedTemperature = this.convertTemperature(
      roundedTemperature, 
      this.weather.attributes.temperature_unit, 
      this.unitTemperature
    );
  }
  
  if (!isNaN(roundedTemperature) && roundedTemperature % 1 !== 0) {
    roundedTemperature = Math.round(roundedTemperature * 10) / 10;
  }

  let roundedFeelsLike = parseFloat(feels_like);
  
  // Feels like conversion
  if (this.unitTemperature && this.unitTemperature !== this.weather.attributes.temperature_unit) {
    roundedFeelsLike = this.convertTemperature(
      roundedFeelsLike, 
      this.weather.attributes.temperature_unit, 
      this.unitTemperature
    );
  }
  
  if (!isNaN(roundedFeelsLike) && roundedFeelsLike % 1 !== 0) {
    roundedFeelsLike = Math.round(roundedFeelsLike * 10) / 10;
  }

  const iconHtml = (config.animated_icons || config.icons) && Object.prototype.hasOwnProperty.call(weatherIcons, weather.state)
    ? html`<img src="${this.getWeatherIcon(weather.state, sun && sun.state)}"
                 @error="${(e) => this.handleIconError(e, weather.state, sun && sun.state)}"
                 alt="">`
    : html`<ha-icon icon="${this.getWeatherIcon(weather.state, sun && sun.state)}"></ha-icon>`;

  return html`
    <div class="main">
      <!-- Left: Temperature and condition info -->
      <div class="temp-info">
        <div class="current-temp">
          ${showTemperature ? (Number.isFinite(roundedTemperature)
            ? html`${roundedTemperature}<span>${this.unitTemperature || this.getUnit('temperature')}</span>`
            : html`—`) : ''}
        </div>
        ${showCurrentCondition ? html`
          <div class="current-condition">
            ${this.ll(weather.state) || (weather.state === 'unavailable' ? 'Unavailable' : 'Unknown')}
          </div>
        ` : ''}
        ${showFeelsLike && Number.isFinite(roundedFeelsLike) ? html`
          <div class="feels-like">
            ${this.ll('feelsLike')}
            ${roundedFeelsLike}${this.unitTemperature || this.getUnit('temperature')}
          </div>
        ` : ''}
        ${showDescription ? html`
          <div class="description">
            ${description}
          </div>
        ` : ''}
      </div>
      
      <!-- Center: Large weather icon -->
      <div class="weather-icon">
        ${iconHtml}
      </div>
      
    </div>
  `;
}

updateClock() {
  const timezone = this.getTimezone();
  const use12HourFormat = this.config.use_12hour_format;
  const showSeconds = this.config.show_time_seconds === true;
  const showDay = this.config.show_day;
  const showDate = this.config.show_date;
  const currentDate = new Date();
  
  // Force timezone conversion using explicit formatters
  const timeFormatter = new Intl.DateTimeFormat(this.config.locale || 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: showSeconds ? '2-digit' : undefined,
    hour12: use12HourFormat,
    timeZone: timezone
  });
  
  const currentTime = timeFormatter.format(currentDate);
  const currentDayOfWeek = this.getLocalizedDayNameFull(currentDate, timezone);
  const monthName = this.getLocalizedMonthName(currentDate, timezone);
  const dayNumber = this.getLocalizedDayNumber(currentDate, this.config.locale, timezone);
  const currentDateFormatted = monthName + ' ' + dayNumber;

  const cardDiv = this.shadowRoot.querySelector('.card');
  if (cardDiv) {
    const clockElement = cardDiv.querySelector('#digital-clock');
    if (clockElement) {
      clockElement.textContent = currentTime;
    }
    if (showDay) {
      const dayElement = cardDiv.querySelector('.date-text.day');
      if (dayElement) {
        dayElement.textContent = currentDayOfWeek;
      }
    }
    if (showDate) {
      const dateElement = cardDiv.querySelector('.date-text.date');
      if (dateElement) {
        dateElement.textContent = currentDateFormatted;
      }
    }
  }
}

renderClock({ config } = this) {
  const showTime = config.show_time;
  const showDay = config.show_day;
  const showDate = config.show_date;

  if (!showTime) {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
    return html``;
  }

  // Clock update logic
  if (!this.clockInterval) {
    this.clockInterval = setInterval(() => this.updateClock(), 1000);
    // Initial update
    setTimeout(() => this.updateClock(), 0);
  }

  return html`
    <div class="current-time">
      ${config.show_forecast_toggle ? html`
        <button class="forecast-toggle" @click="${this.handleForecastTypeToggle.bind(this)}">
          ${this.config.forecast.type === 'daily' ? 'Daily' : 'Hourly'}
        </button>
      ` : ''}
      <div id="digital-clock"></div>
      ${showDay ? html`<div class="date-text day"></div>` : ''}
      ${showDay && showDate ? html` ` : ''}
      ${showDate ? html`<div class="date-text date"></div>` : ''}
    </div>
  `;
}

renderAttributes({ config, humidity, pressure, windSpeed, windDirection, sun, language, uv_index, dew_point, wind_gust_speed, visibility } = this) {
  let dWindSpeed = windSpeed;
  let dPressure = pressure;

  if (Number.isFinite(windSpeed) && this.unitSpeed !== this.weather.attributes.wind_speed_unit) {
    if (this.unitSpeed === 'm/s') {
      if (this.weather.attributes.wind_speed_unit === 'km/h') {
        dWindSpeed = Math.round(windSpeed * 1000 / 3600);
      } else if (this.weather.attributes.wind_speed_unit === 'mph') {
        dWindSpeed = Math.round(windSpeed * 0.44704);
      }
    } else if (this.unitSpeed === 'km/h') {
      if (this.weather.attributes.wind_speed_unit === 'm/s') {
        dWindSpeed = Math.round(windSpeed * 3.6);
      } else if (this.weather.attributes.wind_speed_unit === 'mph') {
        dWindSpeed = Math.round(windSpeed * 1.60934);
      }
    } else if (this.unitSpeed === 'mph') {
      if (this.weather.attributes.wind_speed_unit === 'm/s') {
        dWindSpeed = Math.round(windSpeed / 0.44704);
      } else if (this.weather.attributes.wind_speed_unit === 'km/h') {
        dWindSpeed = Math.round(windSpeed / 1.60934);
      }
    } else if (this.unitSpeed === 'Bft') {
      dWindSpeed = this.calculateBeaufortScale(windSpeed);
    }
  } else {
    dWindSpeed = Math.round(dWindSpeed);
  }

  if (Number.isFinite(pressure) && this.unitPressure !== this.weather.attributes.pressure_unit) {
    if (this.unitPressure === 'mmHg') {
      if (this.weather.attributes.pressure_unit === 'hPa') {
        dPressure = Math.round(pressure * 0.75006);
      } else if (this.weather.attributes.pressure_unit === 'inHg') {
        dPressure = Math.round(pressure * 25.4);
      }
    } else if (this.unitPressure === 'hPa') {
      if (this.weather.attributes.pressure_unit === 'mmHg') {
        dPressure = Math.round(pressure / 0.75006);
      } else if (this.weather.attributes.pressure_unit === 'inHg') {
        dPressure = Math.round(pressure * 33.8639);
      }
    } else if (this.unitPressure === 'inHg') {
      if (this.weather.attributes.pressure_unit === 'mmHg') {
        dPressure = pressure / 25.4;
      } else if (this.weather.attributes.pressure_unit === 'hPa') {
        dPressure = pressure / 33.8639;
      }
      dPressure = dPressure.toFixed(2);
    }
  } else {
    if (this.unitPressure === 'hPa' || this.unitPressure === 'mmHg') {
      dPressure = Math.round(dPressure);
    }
  }

  if (config.show_attributes == false)
    return html``;

  const showHumidity = config.show_humidity !== false;
  const showPressure = config.show_pressure !== false;
  const showWindDirection = config.show_wind_direction !== false;
  const showWindSpeed = config.show_wind_speed !== false;
  const showSun = config.show_sun !== false;
  const showDewpoint = config.show_dew_point == true;
  const showWindgustspeed = config.show_wind_gust_speed == true;
  const showVisibility = config.show_visibility == true;

return html`
    <div class="attributes">
      ${((showHumidity && humidity !== undefined) || (showPressure && Number.isFinite(Number(dPressure))) || (showDewpoint && dew_point !== undefined) || (showVisibility && visibility !== undefined)) ? html`
        <div>
          ${showHumidity && humidity !== undefined ? html`
            <ha-icon icon="hass:water-percent"></ha-icon> ${humidity} %<br>
          ` : ''}
          ${showPressure && Number.isFinite(Number(dPressure)) ? html`
            <ha-icon icon="hass:gauge"></ha-icon> ${dPressure} ${this.ll('units')[this.unitPressure]} <br>
          ` : ''}
          ${showDewpoint && dew_point !== undefined ? html`
            <ha-icon icon="hass:thermometer-water"></ha-icon> ${dew_point} ${this.weather.attributes.temperature_unit} <br>
          ` : ''}
          ${showVisibility && visibility !== undefined ? html`
            <ha-icon icon="hass:eye"></ha-icon> ${visibility} ${this.weather.attributes.visibility_unit}
          ` : ''}
        </div>
      ` : ''}
      ${((showSun && sun !== undefined) || (typeof uv_index !== 'undefined' && uv_index !== undefined)) ? html`
        <div>
          ${typeof uv_index !== 'undefined' && uv_index !== undefined ? html`
            <div>
              <ha-icon icon="hass:white-balance-sunny"></ha-icon> UV: ${Math.round(uv_index * 10) / 10}
            </div>
          ` : ''}
          ${showSun && sun !== undefined ? html`
            <div>
              ${this.renderSun({ sun, language })}
            </div>
          ` : ''}
        </div>
      ` : ''}
      ${((showWindDirection && windDirection !== undefined) || (showWindSpeed && Number.isFinite(dWindSpeed))) ? html`
        <div>
          ${showWindDirection && windDirection !== undefined ? html`
            <ha-icon icon="hass:${this.getWindDirIcon(windDirection)}"></ha-icon> ${this.getWindDir(windDirection)} <br>
          ` : ''}
          ${showWindSpeed && Number.isFinite(dWindSpeed) ? html`
            <ha-icon icon="hass:weather-windy"></ha-icon>
            ${dWindSpeed} ${this.ll('units')[this.unitSpeed]} <br>
          ` : ''}
          ${showWindgustspeed && wind_gust_speed !== undefined ? html`
            <ha-icon icon="hass:weather-windy-variant"></ha-icon>
            ${wind_gust_speed} ${this.ll('units')[this.unitSpeed]}
          ` : ''}
        </div>
      ` : ''}
    </div>
`;
}

renderSun({ sun, language, config } = this) {
  if (sun == undefined) {
    return html``;
  }

  const use12HourFormat = this.config.use_12hour_format;
  const timezone = this.getTimezone();
  const locale = this.config.locale || undefined;
  
  const timeOptions = {
    hour12: use12HourFormat,
    hour: 'numeric',
    minute: 'numeric',
    timeZone: timezone
  };

  return html`
    <ha-icon icon="mdi:weather-sunset-up"></ha-icon>
      ${new Date(sun.attributes.next_rising).toLocaleTimeString(locale, timeOptions)}<br>
    <ha-icon icon="mdi:weather-sunset-down"></ha-icon>
      ${new Date(sun.attributes.next_setting).toLocaleTimeString(locale, timeOptions)}
  `;
}

renderForecastConditionIcons({ config, forecastItems, sun } = this) {
  const forecast = this.forecasts ? this.forecasts.slice(0, forecastItems) : [];

  if (config.forecast.condition_icons === false) {
    return html``;
  }

  return html`
    <div class="conditions" @click="${(e) => this.showMoreInfo(config.entity)}">
      ${forecast.map((item) => {
        const forecastTime = new Date(item.datetime);
        const sunriseTime = new Date(sun && sun.attributes && sun.attributes.next_rising);
        const sunsetTime = new Date(sun && sun.attributes && sun.attributes.next_setting);

        // Adjust sunrise and sunset times to match the date of forecastTime
        const adjustedSunriseTime = new Date(forecastTime);
        adjustedSunriseTime.setHours(sunriseTime.getHours());
        adjustedSunriseTime.setMinutes(sunriseTime.getMinutes());
        adjustedSunriseTime.setSeconds(sunriseTime.getSeconds());

        const adjustedSunsetTime = new Date(forecastTime);
        adjustedSunsetTime.setHours(sunsetTime.getHours());
        adjustedSunsetTime.setMinutes(sunsetTime.getMinutes());
        adjustedSunsetTime.setSeconds(sunsetTime.getSeconds());

        let isDayTime;

        if (config.forecast.type === 'daily') {
          // For daily forecast, assume it's day time
          isDayTime = true;
        } else {
          // For other forecast types, determine based on sunrise and sunset times
          isDayTime = forecastTime >= adjustedSunriseTime && forecastTime <= adjustedSunsetTime;
        }

        const weatherIcons = isDayTime ? weatherIconsDay : weatherIconsNight;
        const condition = item.condition;

        let iconHtml;

        if (!Object.prototype.hasOwnProperty.call(weatherIcons, condition)) {
          iconHtml = html`<ha-icon icon="mdi:help-circle-outline"></ha-icon>`;
        } else if (config.animated_icons || config.icons) {
          const iconSrc = config.animated_icons ?
            `${this.baseIconPath}${weatherIcons[condition]}.svg` :
            `${this.config.icons}${weatherIcons[condition]}.svg`;
          const sunState = isDayTime ? 'above_horizon' : 'below_horizon';
          iconHtml = html`<img class="icon" 
                               src="${iconSrc}" 
                               @error="${(e) => this.handleIconError(e, condition, sunState)}" 
                               alt="">`;
        } else {
          iconHtml = html`<ha-icon icon="${this.getWeatherIcon(condition, sun && sun.state)}"></ha-icon>`;
        }

        return html`
          <div class="forecast-item">
            ${iconHtml}
          </div>
        `;
      })}
    </div>
  `;
}

renderWind({ config, weather, windSpeed, windDirection, forecastItems } = this) {
  const showWindForecast = config.forecast.show_wind_forecast !== false;

  if (!showWindForecast) {
    return html``;
  }

  const forecast = this.forecasts ? this.forecasts.slice(0, forecastItems) : [];

  return html`
    <div class="wind-details">
      ${showWindForecast ? html`
        ${forecast.map((item) => {
          const windSpeed = this.getNumericForecastValue(item, 'wind_speed');
          let dWindSpeed = windSpeed;

          if (Number.isFinite(windSpeed) && this.unitSpeed !== this.weather.attributes.wind_speed_unit) {
            if (this.unitSpeed === 'm/s') {
              if (this.weather.attributes.wind_speed_unit === 'km/h') {
                dWindSpeed = Math.round(windSpeed * 1000 / 3600);
              } else if (this.weather.attributes.wind_speed_unit === 'mph') {
                dWindSpeed = Math.round(windSpeed * 0.44704);
              }
            } else if (this.unitSpeed === 'km/h') {
              if (this.weather.attributes.wind_speed_unit === 'm/s') {
                dWindSpeed = Math.round(windSpeed * 3.6);
              } else if (this.weather.attributes.wind_speed_unit === 'mph') {
                dWindSpeed = Math.round(windSpeed * 1.60934);
              }
            } else if (this.unitSpeed === 'mph') {
              if (this.weather.attributes.wind_speed_unit === 'm/s') {
                dWindSpeed = Math.round(windSpeed / 0.44704);
              } else if (this.weather.attributes.wind_speed_unit === 'km/h') {
                dWindSpeed = Math.round(windSpeed / 1.60934);
              }
            } else if (this.unitSpeed === 'Bft') {
              dWindSpeed = this.calculateBeaufortScale(windSpeed);
            }
          } else {
            dWindSpeed = Math.round(dWindSpeed);
          }

          return html`
            <div class="wind-detail">
              <ha-icon class="wind-icon" icon="hass:${this.getWindDirIcon(item.wind_bearing)}"></ha-icon>
              <span class="wind-speed">${Number.isFinite(dWindSpeed) ? dWindSpeed : '—'}</span>
              <span class="wind-unit">${this.ll('units')[this.unitSpeed]}</span>
            </div>
          `;
        })}
      ` : ''}
    </div>
  `;
}

renderLastUpdated() {
  if (this.config.show_last_changed !== true || !(this.weather && this.weather.last_changed)) return html``;
  const lastUpdatedString = this.weather.last_changed;
  const lastUpdatedTimestamp = new Date(lastUpdatedString).getTime();
  if (!Number.isFinite(lastUpdatedTimestamp)) return html``;
  const currentTimestamp = Date.now();
  const timeDifference = currentTimestamp - lastUpdatedTimestamp;

  const minutesAgo = Math.floor(timeDifference / (1000 * 60));
  const hoursAgo = Math.floor(minutesAgo / 60);

  const locale = this.language;

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  let formattedLastUpdated;

  if (hoursAgo > 0) {
    formattedLastUpdated = formatter.format(-hoursAgo, 'hour');
  } else {
    formattedLastUpdated = formatter.format(-minutesAgo, 'minute');
  }

  const showLastUpdated = this.config.show_last_changed == true;

  if (!showLastUpdated) {
    return html``;
  }

  return html`
    <div class="updated">
      <div>
        ${formattedLastUpdated}
      </div>
    </div>
  `;
}

  _fire(type, detail, options) {
    const node = this.shadowRoot;
    options = options || {};
    detail = (detail === null || detail === undefined) ? {} : detail;
    const event = new Event(type, {
      bubbles: options.bubbles === undefined ? true : options.bubbles,
      cancelable: Boolean(options.cancelable),
      composed: options.composed === undefined ? true : options.composed
    });
    event.detail = detail;
    node.dispatchEvent(event);
    return event;
  }

  showMoreInfo(entity) {
    this._fire('hass-more-info', { entityId: entity });
  }
}

// Regex to detect Latin script characters for uppercase formatting (ES2019 compatible)
WeatherChartCard.LATIN_SCRIPT_REGEX = /^[A-Za-z]+$/;

if (!customElements.get('uninus-weather-chart-card')) {
  customElements.define('uninus-weather-chart-card', WeatherChartCard);
}
if (!customElements.get('weather-chart-card')) {
  // CustomElementRegistry cannot register the same constructor under two tags.
  customElements.define('weather-chart-card', class extends customElements.get('uninus-weather-chart-card') {});
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === 'uninus-weather-chart-card')) {
  window.customCards.push({
    type: "uninus-weather-chart-card",
    name: "uninus-weather-chart-card",
    description: "UNiNUS weather card with charts and Home Assistant-native editor selectors.",
    preview: true,
    documentationURL: "https://github.com/ivanlee1007/uninus-weather-chart-card",
  });
}
