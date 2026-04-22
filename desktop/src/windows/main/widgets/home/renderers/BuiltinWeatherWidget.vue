<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { GridItem, WeatherWidgetConfig } from '../../../types/grid';
import { normalizeWidgetConfig } from '../registry';

type WeatherSnapshot = {
  city: string;
  current: {
    temperature: number;
    apparentTemperature: number;
    weatherCode: number;
  };
  hourly: Array<{ time: string; temperature: number; weatherCode: number }>;
  daily: Array<{ date: string; min: number; max: number; weatherCode: number }>;
  updatedAt: number;
};

const props = defineProps<{
  item: GridItem;
  interactive?: boolean;
}>();

const config = computed(() => normalizeWidgetConfig('weather', props.item.widgetConfig) as WeatherWidgetConfig);
const status = ref<'idle' | 'loading' | 'success' | 'error'>('idle');
const errorMessage = ref('');
const snapshot = ref<WeatherSnapshot | null>(null);
const refreshTimer = ref<number | null>(null);
const requestVersion = ref(0);
const isCompact = computed(() => props.item.colSpan <= 2 && props.item.rowSpan <= 2);
const isLarge = computed(() => props.item.colSpan >= 4 && props.item.rowSpan >= 3);
const selectedCity = computed(() => config.value.city.trim());
const selectedUnit = computed(() => config.value.unit);
const selectedRefreshMinutes = computed(() => Math.max(5, config.value.refreshMinutes));
const storageKey = computed(() => {
  const cityKey = selectedCity.value || 'default';
  return `home-widget-weather:${props.item.id}:${cityKey}:${selectedUnit.value}`;
});

function weatherText(code: number) {
  if ([0].includes(code)) return '晴';
  if ([1, 2].includes(code)) return '多云';
  if ([3].includes(code)) return '阴';
  if ([45, 48].includes(code)) return '雾';
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return '雨';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '雪';
  if ([95, 96, 99].includes(code)) return '雷雨';
  return '天气';
}

function persistSnapshot(next: WeatherSnapshot) {
  localStorage.setItem(storageKey.value, JSON.stringify(next));
}

function hydrateSnapshot() {
  const raw = localStorage.getItem(storageKey.value);
  if (!raw) {
    snapshot.value = null;
    return;
  }
  try {
    snapshot.value = JSON.parse(raw) as WeatherSnapshot;
  } catch {
    snapshot.value = null;
  }
}

async function fetchWeather() {
  const city = selectedCity.value;
  const unit = selectedUnit.value;
  const currentRequestVersion = requestVersion.value + 1;
  requestVersion.value = currentRequestVersion;

  if (!city) {
    status.value = 'error';
    errorMessage.value = '未配置城市';
    snapshot.value = null;
    return;
  }

  status.value = 'loading';
  errorMessage.value = '';

  try {
    const geocodeUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
    geocodeUrl.searchParams.set('name', city);
    geocodeUrl.searchParams.set('count', '1');
    geocodeUrl.searchParams.set('language', 'zh');
    geocodeUrl.searchParams.set('format', 'json');
    const geocodeResponse = await fetch(geocodeUrl.toString());
    const geocodeData = await geocodeResponse.json();
    const place = geocodeData?.results?.[0];

    if (!place) {
      throw new Error('未找到城市');
    }

    const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
    weatherUrl.searchParams.set('latitude', String(place.latitude));
    weatherUrl.searchParams.set('longitude', String(place.longitude));
    weatherUrl.searchParams.set('timezone', 'auto');
    weatherUrl.searchParams.set('forecast_days', '5');
    weatherUrl.searchParams.set('current', 'temperature_2m,apparent_temperature,weather_code');
    weatherUrl.searchParams.set('hourly', 'temperature_2m,weather_code');
    weatherUrl.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
    if (unit === 'fahrenheit') {
      weatherUrl.searchParams.set('temperature_unit', 'fahrenheit');
    }

    const weatherResponse = await fetch(weatherUrl.toString());
    const weatherData = await weatherResponse.json();

    if (currentRequestVersion !== requestVersion.value) {
      return;
    }

    const nextSnapshot: WeatherSnapshot = {
      city: place.name,
      current: {
        temperature: Math.round(weatherData.current.temperature_2m),
        apparentTemperature: Math.round(weatherData.current.apparent_temperature),
        weatherCode: weatherData.current.weather_code,
      },
      hourly: (weatherData.hourly.time as string[]).slice(0, 6).map((time, index) => ({
        time,
        temperature: Math.round(weatherData.hourly.temperature_2m[index]),
        weatherCode: weatherData.hourly.weather_code[index],
      })),
      daily: (weatherData.daily.time as string[]).slice(0, 5).map((date, index) => ({
        date,
        min: Math.round(weatherData.daily.temperature_2m_min[index]),
        max: Math.round(weatherData.daily.temperature_2m_max[index]),
        weatherCode: weatherData.daily.weather_code[index],
      })),
      updatedAt: Date.now(),
    };

    snapshot.value = nextSnapshot;
    status.value = 'success';
    persistSnapshot(nextSnapshot);
  } catch (error) {
    if (currentRequestVersion !== requestVersion.value) {
      return;
    }
    status.value = 'error';
    errorMessage.value = error instanceof Error ? error.message : '天气加载失败';
  }
}

function resetRefreshTimer() {
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value);
  }
  refreshTimer.value = window.setInterval(() => {
    void fetchWeather();
  }, selectedRefreshMinutes.value * 60 * 1000);
}

function clearRefreshTimer() {
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value);
    refreshTimer.value = null;
  }
}

function syncWeatherState() {
  if (!props.interactive) {
    clearRefreshTimer();
    return;
  }

  hydrateSnapshot();
  void fetchWeather();
  resetRefreshTimer();
}

const currentSummary = computed(() => {
  if (!snapshot.value) return '';
  return weatherText(snapshot.value.current.weatherCode);
});

onMounted(() => {
  syncWeatherState();
});

watch(
  () => [selectedCity.value, selectedUnit.value, selectedRefreshMinutes.value, Boolean(props.interactive)],
  () => {
    syncWeatherState();
  },
);

onBeforeUnmount(() => {
  clearRefreshTimer();
});
</script>

<template>
  <div class="weather-widget">
    <template v-if="!props.interactive">
      <div class="weather-widget__state">
        <span class="weather-widget__title">{{ config.city || '天气' }}</span>
        <strong>实时天气预览</strong>
      </div>
    </template>

    <template v-if="status === 'loading' && !snapshot">
      <div class="weather-widget__state">
        <span class="weather-widget__title">{{ config.city || '天气' }}</span>
        <strong>加载中...</strong>
      </div>
    </template>

    <template v-else-if="status === 'error' && !snapshot">
      <div class="weather-widget__state">
        <span class="weather-widget__title">{{ config.city || '天气' }}</span>
        <strong>{{ errorMessage || '天气加载失败' }}</strong>
      </div>
    </template>

    <template v-else-if="snapshot">
      <div class="weather-widget__current">
        <div>
          <div class="weather-widget__title">{{ snapshot.city }}</div>
          <div class="weather-widget__summary">{{ currentSummary }}</div>
        </div>
        <div class="weather-widget__temp">{{ snapshot.current.temperature }}°</div>
      </div>

      <div class="weather-widget__meta">
        <span>体感 {{ snapshot.current.apparentTemperature }}°</span>
        <span v-if="status === 'error'">缓存数据</span>
        <span v-else>刚刚更新</span>
      </div>

      <div v-if="!isCompact && config.showHourly" class="weather-widget__hourly">
        <div v-for="item in snapshot.hourly.slice(0, isLarge ? 4 : 3)" :key="item.time">
          <span>{{ item.time.slice(11, 16) }}</span>
          <strong>{{ item.temperature }}°</strong>
        </div>
      </div>

      <div v-if="isLarge && config.showDaily" class="weather-widget__daily">
        <div v-for="item in snapshot.daily.slice(0, 4)" :key="item.date">
          <span>{{ item.date.slice(5) }}</span>
          <span>{{ weatherText(item.weatherCode) }}</span>
          <strong>{{ item.max }}° / {{ item.min }}°</strong>
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.weather-widget {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
  color: #ecfeff;
}

.weather-widget__state,
.weather-widget__current {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.weather-widget__title {
  font-size: 13px;
  opacity: 0.84;
}

.weather-widget__summary {
  font-size: 18px;
  font-weight: 700;
}

.weather-widget__temp {
  font-size: 36px;
  font-weight: 800;
}

.weather-widget__meta,
.weather-widget__hourly,
.weather-widget__daily {
  display: flex;
  gap: 8px;
  font-size: 12px;
  opacity: 0.88;
}

.weather-widget__hourly div,
.weather-widget__daily div {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.1);
}
</style>
