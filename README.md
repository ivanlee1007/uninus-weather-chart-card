<h1 align="center">UNiNUS Weather Chart Card</h1>

<div align="center">

[![HACS](https://img.shields.io/badge/HACS-Default-41BDF5.svg)](https://github.com/hacs/integration)
[![GitHub Release](https://img.shields.io/github/v/release/ivanlee1007/weather-chart-card.svg)](https://github.com/ivanlee1007/weather-chart-card/releases)
![GitHub downloads](https://img.shields.io/github/downloads/ivanlee1007/weather-chart-card/total?style=flat-square)
[![License](https://img.shields.io/github/license/ivanlee1007/weather-chart-card.svg)](LICENSE)

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?repository=https%3A%2F%2Fgithub.com%2Fivanlee1007%2Fweather-chart-card&owner=ivanlee1007)

</div>

<div align="center">
  <img src="https://raw.githubusercontent.com/ivanlee1007/weather-chart-card/master/screenshots/weather-en.png" width="30%" alt="English locale">
  <img src="https://raw.githubusercontent.com/ivanlee1007/weather-chart-card/master/screenshots/weather-ro.png" width="30%" alt="Romanian locale">
  <img src="https://raw.githubusercontent.com/ivanlee1007/weather-chart-card/master/screenshots/weather-hourly.png" width="30%" alt="Hourly view">
</div>

## About This Fork

This repository is the actively maintained UNiNUS fork of the original [weather-chart-card](https://github.com/mlamberts78/weather-chart-card).

This fork focuses on:

- compatibility with newer Home Assistant versions
- a more reliable GUI editor using HA-native `ha-form` selectors
- better HACS/release hygiene
- practical customization for real deployments

## Highlights

- **Daily / Hourly forecast toggle**
- **Temperature gradient colors** with day/night distinction
- **Date labels** under weekday labels
- **Timezone-aware display** for multi-location setups
- **Unit conversion** for temperature / pressure / speed
- **HA-native editor selectors** for weather entity, alternate sensors, and text sensor settings
- **Text sensor section** with configurable entity, title, title font size, and content font size
- **OpenCWA alert banners** that can display ready-to-use CWA notification sensors with strong critical/warning/advisory styling
- **UNiNUS card picker name** so it does not clash with upstream forks

---

## Installation

### HACS (recommended)

1. Open **HACS** in Home Assistant
2. Go to **Frontend**
3. Click **Explore & Download Repositories**
4. Search for **UNiNUS Weather Chart Card**
5. Download
6. Refresh the browser (hard refresh recommended)

### Manual installation

1. Download `weather-chart-card-ha.js` from the [latest release](https://github.com/ivanlee1007/weather-chart-card/releases/latest)
2. Copy it to `<config>/www/`
3. Add a Lovelace resource:

```text
URL: /local/weather-chart-card-ha.js
Type: module
```

4. Refresh the browser

> The canonical custom element is `custom:weather-chart-card`.
> The published frontend file is `weather-chart-card-ha.js`; the card type is **not** `custom:weather-chart-card-ha`.

---

## Quick Start

### Basic

```yaml
type: custom:weather-chart-card
entity: weather.home
```

### Recommended

```yaml
type: custom:weather-chart-card
entity: weather.home
location_name: Home
show_time: true
show_day: true
show_date: true
animated_icons: true
icon_style: style1
show_forecast_toggle: true
forecast:
  type: daily
  show_date_labels: true
  use_color_thresholds: true
  chart_height: 180
units:
  temperature: "°C"
  pressure: hPa
  speed: km/h
```

---


## OpenCWA Alert Banners

The card can show strong, high-visibility weather alert banners at the top of the weather card. This is designed to consume OpenCWA notification sensors such as:

```yaml
sensor.opencwa_an_ping_qu_typhoon_warning_notification
sensor.opencwa_an_ping_qu_weather_alert_notification
sensor.opencwa_an_ping_qu_tropical_cyclone_notification
```

The card reads each sensor state and attributes:

- `state`: only `active` alerts are displayed. `inactive` and `suppressed` are hidden.
- `severity`: controls visual style (`critical`, `warning`, `advisory`, `info`).
- `title`: banner title.
- `summary`: short banner summary.
- `message`: optional full alert message.

### Example

```yaml
type: custom:weather-chart-card
entity: weather.opencwa_an_ping_qu
location_name: 安平區
show_alerts: true
alert_entities:
  - sensor.opencwa_an_ping_qu_typhoon_warning_notification
  - sensor.opencwa_an_ping_qu_weather_alert_notification
  - sensor.opencwa_an_ping_qu_tropical_cyclone_notification
alert_show_message: true
alert_default_expanded: false
alert_flash_critical: true
alert_max_items: 3
```

### Alert options

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `show_alerts` | boolean | `false` | Show weather alert banners above the normal card content |
| `alert_entities` | list | `[]` | Notification sensor entities to read; YAML-friendly list form |
| `alert_entity_1` / `alert_entity_2` / `alert_entity_3` | string | empty | GUI-editor friendly sensor slots |
| `alert_show_message` | boolean | `true` | Show the full notification `message` attribute when the banner is expanded |
| `alert_default_expanded` | boolean | `false` | Start with all active alert messages expanded instead of the compact summary view |
| `alert_flash_critical` | boolean | `true` | Pulse/glow `critical` banners |
| `alert_max_items` | number | `3` | Maximum number of active banners to display |

Alerts are sorted by severity: `critical` > `warning` > `advisory` > `info`. The card starts collapsed by default: it shows the highest-priority alert summary plus a `+N` badge for other active alerts. Click the banner to expand all active alerts and show their full messages; click again to collapse.

---

## Text Sensor Section

You can optionally show an extra text block under the main weather content.

### Example

```yaml
type: custom:weather-chart-card
entity: weather.home
show_text_sensor: true
text_sensor_entity: sensor.opencwa_forecast_summary
text_sensor_title: 今天天氣重點
text_sensor_title_size: 18
text_sensor_content_size: 16
```

### Text sensor options

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `show_text_sensor` | boolean | `false` | Show an extra text block below the main weather card |
| `text_sensor_entity` | string | empty | Sensor entity used as the text source |
| `text_sensor_title` | string | empty | Optional title override |
| `text_sensor_title_size` | number | `14` | Title font size in px |
| `text_sensor_content_size` | number | `13` | Content font size in px |

---

## Core Configuration

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `type` | string | required | Use `custom:weather-chart-card` |
| `entity` | string | required | Weather entity |
| `location_name` | string | empty | Optional location label |
| `timezone` | string | empty | Optional timezone override |
| `title` | string | empty | Card title |
| `show_main` | boolean | `true` | Show main weather section |
| `show_temperature` | boolean | `true` | Show current temperature |
| `show_current_condition` | boolean | `true` | Show current weather condition |
| `show_attributes` | boolean | `true` | Show humidity / pressure / wind / extra attributes |
| `show_sun` | boolean | `true` | Show sunrise / sunset section |
| `show_time` | boolean | `true` | Show current time |
| `show_time_seconds` | boolean | `true` | Show seconds in current time |
| `show_day` | boolean | `true` | Show weekday label |
| `show_date` | boolean | `true` | Show date |
| `show_humidity` | boolean | `true` | Show humidity |
| `show_pressure` | boolean | `true` | Show pressure |
| `show_wind_direction` | boolean | `true` | Show wind direction |
| `show_wind_speed` | boolean | `true` | Show wind speed |
| `show_feels_like` | boolean | `false` | Show feels-like temperature |
| `show_dew_point` | boolean | `false` | Show dew point |
| `show_wind_gust_speed` | boolean | `false` | Show gust speed |
| `show_visibility` | boolean | `false` | Show visibility |
| `show_description` | boolean | `false` | Show weather description |
| `show_last_changed` | boolean | `false` | Show last-updated timestamp |
| `show_forecast_toggle` | boolean | `false` | Show runtime daily/hourly toggle |
| `use_12hour_format` | boolean | `false` | Use 12-hour clock |
| `animated_icons` | boolean | `true` | Use animated icons |
| `icon_style` | string | `style1` | Icon style set |
| `icons_size` | number | `30` | Icon size in px |
| `main_icon_size` | number | `150` | Main icon size in px |
| `current_temp_size` | number | `35` | Current temperature font size |
| `time_size` | number | `26` | Time font size |
| `day_date_size` | number | `15` | Day/date font size |
| `autoscroll` | boolean | `false` | Auto-advance chart window over time |
| `forecast` | object | see below | Forecast section options |
| `units` | object | see below | Unit conversion options |

### Alternate sensor overrides

The editor also supports alternate entities for:

- temperature
- feels like
- description
- pressure
- humidity
- UV index
- wind bearing
- wind speed
- dew point
- wind gust speed
- visibility

These are configured through the GUI editor with HA-native entity selectors.

---

## Forecast Options

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `precipitation_type` | string | `rainfall` | `rainfall` or `probability` |
| `show_probability` | boolean | `false` | Show probability alongside rainfall when available |
| `labels_font_size` | number | `11` | Forecast label font size |
| `precip_bar_size` | number | `100` | Precipitation bar thickness |
| `chart_height` | number | `180` | Forecast chart height |
| `condition_icons` | boolean | `true` | Show forecast condition icons |
| `condition_icon_size_multiplier` | number | `2.0` | Relative icon size multiplier |
| `show_wind_forecast` | boolean | `true` | Show wind forecast |
| `round_temp` | boolean | `false` | Round forecast temperatures |
| `style` | string | `style2` | Forecast chart style |
| `type` | string | `daily` | `daily` or `hourly` |
| `number_of_forecasts` | number | `0` | 0 = automatic |
| `disable_animation` | boolean | `false` | Disable chart animation |
| `show_date_labels` | boolean | `true` | Show date numbers in daily mode |
| `use_color_thresholds` | boolean | `true` | Enable comfort-based temperature colors |

## Units

| Name | Type | Description |
| --- | --- | --- |
| `temperature` | string | `°C` or `°F` |
| `pressure` | string | `hPa`, `mmHg`, or `inHg` |
| `speed` | string | `km/h`, `m/s`, `Bft`, or `mph` |

---

## Examples

### Dual-location setup

```yaml
type: custom:weather-chart-card
entity: weather.forecast_issaquah
location_name: Issaquah
timezone: America/Los_Angeles
units:
  temperature: "°F"
  pressure: inHg
  speed: mph
forecast:
  show_date_labels: true
  use_color_thresholds: true
```

```yaml
type: custom:weather-chart-card
entity: weather.forecast_campina
location_name: Câmpina
timezone: Europe/Bucharest
units:
  temperature: "°C"
  pressure: mmHg
  speed: km/h
forecast:
  show_date_labels: true
  use_color_thresholds: true
```

### Minimal chart view

```yaml
type: custom:weather-chart-card
entity: weather.home
show_main: false
show_attributes: false
forecast:
  condition_icons: false
  show_wind_forecast: false
```

### Text sensor summary block

```yaml
type: custom:weather-chart-card
entity: weather.home
show_text_sensor: true
text_sensor_entity: sensor.daily_summary
text_sensor_title: 今日摘要
text_sensor_title_size: 20
text_sensor_content_size: 15
```

---

## Editor Notes

The GUI editor is built around Home Assistant-native `ha-form` selectors.

That means:

- the main weather entity selector uses the same selector system as HA itself
- alternate entities use HA-native entity selectors
- text sensor settings also use HA-native selectors / inputs
- editor sections keep their internal config synchronized so consecutive edits do not overwrite each other

---

## Development

```bash
npm ci
npm run build
```

Build outputs:

- `dist/weather-chart-card.js`
- `dist/weather-chart-card-ha.js`

For HACS, the published frontend filename is `weather-chart-card-ha.js`.

See [deployment and release guidance](DEPLOYMENT.md) and the
[regression test instructions](tests/README.md) before submitting changes.

---

## Credits

- Original card by [mlamberts78](https://github.com/mlamberts78/weather-chart-card)
- Weather icons by [Basmilius](https://github.com/basmilius/weather-icons)
- Earlier enhanced HA work by [W4MHI](https://github.com/w4mhi)
- Current maintenance and HA compatibility work by UNiNUS

## License

MIT
