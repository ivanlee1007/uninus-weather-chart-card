# uninus-weather-chart-card

A Home Assistant weather forecast card with enhanced visualization, HA-native editor selectors, and practical customization features.

## Features

- Daily / hourly forecast toggle
- Temperature gradient colors with day/night distinction
- Date labels in daily forecast mode
- Timezone-aware display for multi-location setups
- Unit conversion for temperature, pressure, and wind speed
- Text sensor section with configurable title/content font sizes
- GUI editor powered by Home Assistant-native `ha-form` selectors

## Quick start

```yaml
type: custom:uninus-weather-chart-card
entity: weather.your_weather_entity
forecast:
  show_date_labels: true
  use_color_thresholds: true
```

## Notes

Rebrand changes are unreleased. Existing `custom:weather-chart-card` YAML is supported by the new bundle. HACS resource URLs may require a manual update; see [UPGRADING.md](UPGRADING.md).

- HACS display name: **uninus-weather-chart-card**
- Canonical card type: `custom:uninus-weather-chart-card`
- Full documentation: <https://github.com/ivanlee1007/uninus-weather-chart-card>

## Credits

- Original card by [mlamberts78](https://github.com/mlamberts78/weather-chart-card)
- Weather icons by [Basmilius](https://github.com/basmilius/weather-icons)
