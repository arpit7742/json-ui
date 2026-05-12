import { tool } from "ai";
import { z } from "zod";

// =============================================================================
// FlashWeather Intelligence Tools
// =============================================================================

/**
 * Get severe weather alerts for a location using Open-Meteo.
 */
export const getSevereWeatherAlerts = tool({
  description:
    "Get severe weather alerts and warnings for a location. Returns active alerts including thunderstorms, heat waves, flooding, and other hazards with severity levels and recommended actions.",
  inputSchema: z.object({
    latitude: z.number().describe("Latitude of the location"),
    longitude: z.number().describe("Longitude of the location"),
    city: z.string().nullable().describe("Optional city name for display"),
  }),
  execute: async ({ latitude, longitude, city }) => {
    // Fetch current + hourly data to derive alert conditions
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,relative_humidity_2m,precipitation&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,visibility,uv_index&forecast_days=2&timezone=auto`;

    const res = await fetch(url);
    if (!res.ok) return { error: "Failed to fetch weather data for alerts" };

    const data = (await res.json()) as {
      current: {
        temperature_2m: number;
        apparent_temperature: number;
        weather_code: number;
        wind_speed_10m: number;
        wind_gusts_10m: number;
        relative_humidity_2m: number;
        precipitation: number;
      };
      hourly: {
        time: string[];
        temperature_2m: number[];
        precipitation_probability: number[];
        precipitation: number[];
        weather_code: number[];
        wind_speed_10m: number[];
        wind_gusts_10m: number[];
        visibility: number[];
        uv_index: number[];
      };
    };

    const alerts: Array<{
      type: string;
      severity: "critical" | "high" | "medium" | "low";
      title: string;
      description: string;
      recommendation: string;
      validUntil: string;
    }> = [];

    const current = data.current;
    const hourly = data.hourly;

    // Heat wave detection
    if (current.temperature_2m > 40) {
      alerts.push({
        type: "heat_wave",
        severity: "critical",
        title: "Extreme Heat Warning",
        description: `Temperature at ${current.temperature_2m}°C with feels-like ${current.apparent_temperature}°C. Dangerous heat conditions.`,
        recommendation:
          "Suspend outdoor operations. Ensure hydration stations active. Implement mandatory cooling breaks.",
        validUntil: hourly.time[12] ?? "",
      });
    } else if (current.temperature_2m > 35) {
      alerts.push({
        type: "heat_wave",
        severity: "high",
        title: "Heat Advisory",
        description: `Temperature at ${current.temperature_2m}°C. Extended heat exposure risk.`,
        recommendation:
          "Reduce outdoor work hours. Increase hydration frequency. Monitor workforce for heat stress.",
        validUntil: hourly.time[8] ?? "",
      });
    }

    // Thunderstorm detection
    if (
      current.weather_code >= 95 ||
      hourly.weather_code.slice(0, 12).some((c) => c >= 95)
    ) {
      const severity = current.weather_code >= 99 ? "critical" : "high";
      alerts.push({
        type: "thunderstorm",
        severity,
        title:
          severity === "critical"
            ? "Severe Thunderstorm with Hail"
            : "Thunderstorm Warning",
        description: `Active thunderstorm activity detected. Wind gusts up to ${current.wind_gusts_10m} km/h.`,
        recommendation:
          "Halt outdoor operations immediately. Secure loose equipment. Move personnel to sheltered areas.",
        validUntil: hourly.time[6] ?? "",
      });
    }

    // High wind alert
    if (current.wind_gusts_10m > 80) {
      alerts.push({
        type: "wind",
        severity: "critical",
        title: "Extreme Wind Warning",
        description: `Wind gusts reaching ${current.wind_gusts_10m} km/h. Structural damage possible.`,
        recommendation:
          "Suspend crane operations. Secure all outdoor assets. Consider site evacuation.",
        validUntil: hourly.time[6] ?? "",
      });
    } else if (current.wind_gusts_10m > 50) {
      alerts.push({
        type: "wind",
        severity: "medium",
        title: "High Wind Advisory",
        description: `Wind gusts up to ${current.wind_gusts_10m} km/h.`,
        recommendation:
          "Restrict high-elevation work. Secure lightweight materials.",
        validUntil: hourly.time[4] ?? "",
      });
    }

    // Heavy precipitation
    const next6hPrecip = hourly.precipitation
      .slice(0, 6)
      .reduce((a, b) => a + b, 0);
    if (next6hPrecip > 30) {
      alerts.push({
        type: "precipitation",
        severity: "high",
        title: "Heavy Rainfall Warning",
        description: `Expected ${next6hPrecip.toFixed(1)}mm of rain in next 6 hours. Flash flooding possible.`,
        recommendation:
          "Activate drainage protocols. Relocate equipment from low-lying areas. Monitor water levels.",
        validUntil: hourly.time[6] ?? "",
      });
    }

    // Low visibility
    const minVisibility = Math.min(...hourly.visibility.slice(0, 6));
    if (minVisibility < 1000) {
      alerts.push({
        type: "visibility",
        severity: "medium",
        title: "Low Visibility Warning",
        description: `Visibility dropping to ${minVisibility}m. Fog or heavy precipitation reducing sight lines.`,
        recommendation:
          "Reduce vehicle speeds. Activate additional lighting. Delay non-essential transport.",
        validUntil: hourly.time[4] ?? "",
      });
    }

    // UV index
    const maxUV = Math.max(...hourly.uv_index.slice(0, 12));
    if (maxUV >= 11) {
      alerts.push({
        type: "uv",
        severity: "high",
        title: "Extreme UV Radiation",
        description: `UV index reaching ${maxUV}. Severe sunburn risk in minutes.`,
        recommendation:
          "Mandate sun protection. Schedule outdoor work for early/late hours. Provide shade structures.",
        validUntil: hourly.time[12] ?? "",
      });
    }

    if (alerts.length === 0) {
      alerts.push({
        type: "clear",
        severity: "low",
        title: "No Active Alerts",
        description:
          "Weather conditions are within normal operational parameters.",
        recommendation: "Continue normal operations. Next review in 6 hours.",
        validUntil: hourly.time[6] ?? "",
      });
    }

    return {
      location: city ?? `${latitude}, ${longitude}`,
      timestamp: new Date().toISOString(),
      alertCount: alerts.filter((a) => a.type !== "clear").length,
      overallRisk: alerts.reduce(
        (max, a) => {
          const levels = { critical: 4, high: 3, medium: 2, low: 1 };
          return levels[a.severity] > levels[max] ? a.severity : max;
        },
        "low" as "critical" | "high" | "medium" | "low",
      ),
      alerts,
    };
  },
});

/**
 * Get lightning risk assessment for a location.
 */
export const getLightningRisk = tool({
  description:
    "Assess lightning risk for a location based on atmospheric conditions. Returns risk level, estimated strike probability, and safety recommendations for operations.",
  inputSchema: z.object({
    latitude: z.number().describe("Latitude"),
    longitude: z.number().describe("Longitude"),
    city: z.string().nullable().describe("Optional city name"),
  }),
  execute: async ({ latitude, longitude, city }) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=weather_code,cape,lifted_index&hourly=weather_code,cape,precipitation_probability,cloud_cover&forecast_hours=24&timezone=auto`;

    const res = await fetch(url);
    if (!res.ok) return { error: "Failed to fetch lightning risk data" };

    const data = (await res.json()) as {
      current: { weather_code: number; cape?: number; lifted_index?: number };
      hourly: {
        time: string[];
        weather_code: number[];
        cape?: number[];
        precipitation_probability: number[];
        cloud_cover: number[];
      };
    };

    // Derive lightning risk from weather codes and CAPE
    const thunderCodes = [95, 96, 99];
    const currentThunder = thunderCodes.includes(data.current.weather_code);
    const hourlyThunder = data.hourly.weather_code.map((c) =>
      thunderCodes.includes(c),
    );
    const thunderHours = hourlyThunder.filter(Boolean).length;

    // CAPE-based risk (if available)
    const cape = data.current.cape ?? 0;
    let riskLevel: "extreme" | "high" | "moderate" | "low" | "minimal";
    let probability: number;

    if (currentThunder || cape > 2500) {
      riskLevel = "extreme";
      probability = 90;
    } else if (thunderHours > 4 || cape > 1500) {
      riskLevel = "high";
      probability = 70;
    } else if (thunderHours > 1 || cape > 800) {
      riskLevel = "moderate";
      probability = 45;
    } else if (thunderHours > 0 || cape > 300) {
      riskLevel = "low";
      probability = 20;
    } else {
      riskLevel = "minimal";
      probability = 5;
    }

    const hourlyRisk = data.hourly.time.slice(0, 12).map((time, i) => ({
      time: new Date(time).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      risk: hourlyThunder[i]
        ? "high"
        : data.hourly.precipitation_probability[i]! > 60
          ? "moderate"
          : "low",
      probability: hourlyThunder[i]
        ? 85
        : Math.min(data.hourly.precipitation_probability[i]! * 0.8, 70),
    }));

    return {
      location: city ?? `${latitude}, ${longitude}`,
      timestamp: new Date().toISOString(),
      riskLevel,
      strikeProbability: probability,
      activeStrikes: currentThunder,
      cape,
      next12Hours: hourlyRisk,
      safetyActions:
        riskLevel === "extreme" || riskLevel === "high"
          ? [
              "Immediately halt all outdoor operations",
              "Move personnel to lightning-safe structures",
              "Disconnect sensitive electronic equipment",
              "Wait 30 minutes after last observed strike before resuming",
            ]
          : riskLevel === "moderate"
            ? [
                "Monitor conditions every 15 minutes",
                "Prepare to halt outdoor operations",
                "Identify nearest shelter locations",
                "Brief all outdoor personnel on lightning protocol",
              ]
            : [
                "Continue normal operations",
                "Maintain weather monitoring",
                "Review lightning safety procedures",
              ],
    };
  },
});

/**
 * Get precipitation forecast with operational impact analysis.
 */
export const getPrecipitationForecast = tool({
  description:
    "Get detailed precipitation forecast with hourly breakdown, accumulation totals, and operational impact assessment for planning outdoor activities and logistics.",
  inputSchema: z.object({
    latitude: z.number().describe("Latitude"),
    longitude: z.number().describe("Longitude"),
    city: z.string().nullable().describe("Optional city name"),
  }),
  execute: async ({ latitude, longitude, city }) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=precipitation,precipitation_probability,rain,showers,snowfall,snow_depth,weather_code&daily=precipitation_sum,rain_sum,snowfall_sum,precipitation_hours,precipitation_probability_max&forecast_days=7&timezone=auto`;

    const res = await fetch(url);
    if (!res.ok) return { error: "Failed to fetch precipitation data" };

    const data = (await res.json()) as {
      hourly: {
        time: string[];
        precipitation: number[];
        precipitation_probability: number[];
        rain: number[];
        showers: number[];
        snowfall: number[];
        snow_depth: number[];
        weather_code: number[];
      };
      daily: {
        time: string[];
        precipitation_sum: number[];
        rain_sum: number[];
        snowfall_sum: number[];
        precipitation_hours: number[];
        precipitation_probability_max: number[];
      };
    };

    // Next 24h hourly breakdown (sampled every 2h)
    const hourlyForecast = data.hourly.time
      .slice(0, 24)
      .filter((_, i) => i % 2 === 0)
      .map((time, idx) => {
        const i = idx * 2;
        return {
          time: new Date(time).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          precipitation: data.hourly.precipitation[i]!,
          probability: data.hourly.precipitation_probability[i]!,
          type:
            data.hourly.snowfall[i]! > 0
              ? "snow"
              : data.hourly.showers[i]! > 0
                ? "showers"
                : data.hourly.rain[i]! > 0
                  ? "rain"
                  : "none",
        };
      });

    // 7-day daily summary
    const dailyForecast = data.daily.time.map((date, i) => ({
      date,
      day: new Date(date + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "short",
      }),
      totalPrecipitation: data.daily.precipitation_sum[i]!,
      rain: data.daily.rain_sum[i]!,
      snow: data.daily.snowfall_sum[i]!,
      precipHours: data.daily.precipitation_hours[i]!,
      maxProbability: data.daily.precipitation_probability_max[i]!,
    }));

    // Operational impact
    const next24hTotal = data.hourly.precipitation
      .slice(0, 24)
      .reduce((a, b) => a + b, 0);
    let operationalImpact: "severe" | "moderate" | "minor" | "none";
    if (next24hTotal > 50) operationalImpact = "severe";
    else if (next24hTotal > 20) operationalImpact = "moderate";
    else if (next24hTotal > 5) operationalImpact = "minor";
    else operationalImpact = "none";

    return {
      location: city ?? `${latitude}, ${longitude}`,
      timestamp: new Date().toISOString(),
      next24hTotal: Math.round(next24hTotal * 10) / 10,
      operationalImpact,
      hourlyForecast,
      dailyForecast,
      recommendations:
        operationalImpact === "severe"
          ? [
              "Postpone all outdoor operations",
              "Activate flood mitigation",
              "Pre-position emergency resources",
            ]
          : operationalImpact === "moderate"
            ? [
                "Adjust schedules around peak precipitation",
                "Ensure drainage systems clear",
                "Prepare wet-weather equipment",
              ]
            : ["Normal operations can proceed", "Monitor for changes"],
    };
  },
});

/**
 * Get operational weather risk score for a location.
 */
export const getOperationalRiskScore = tool({
  description:
    "Calculate a comprehensive operational weather risk score (0-100) for a location, combining temperature, wind, precipitation, visibility, and storm factors. Used for go/no-go decisions.",
  inputSchema: z.object({
    latitude: z.number().describe("Latitude"),
    longitude: z.number().describe("Longitude"),
    city: z.string().nullable().describe("Optional city name"),
    operationType: z
      .enum([
        "construction",
        "logistics",
        "aviation",
        "outdoor_event",
        "agriculture",
        "energy",
        "general",
      ])
      .describe("Type of operation to assess risk for"),
  }),
  execute: async ({ latitude, longitude, city, operationType }) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,precipitation,relative_humidity_2m&hourly=temperature_2m,precipitation,wind_gusts_10m,visibility,weather_code&forecast_hours=12&timezone=auto`;

    const res = await fetch(url);
    if (!res.ok) return { error: "Failed to calculate risk score" };

    const data = (await res.json()) as {
      current: {
        temperature_2m: number;
        apparent_temperature: number;
        weather_code: number;
        wind_speed_10m: number;
        wind_gusts_10m: number;
        precipitation: number;
        relative_humidity_2m: number;
      };
      hourly: {
        time: string[];
        temperature_2m: number[];
        precipitation: number[];
        wind_gusts_10m: number[];
        visibility: number[];
        weather_code: number[];
      };
    };

    const c = data.current;

    // Individual risk factors (0-100)
    const tempRisk =
      c.temperature_2m > 40
        ? 95
        : c.temperature_2m > 35
          ? 70
          : c.temperature_2m < -10
            ? 80
            : c.temperature_2m < 0
              ? 50
              : 10;
    const windRisk =
      c.wind_gusts_10m > 100
        ? 100
        : c.wind_gusts_10m > 70
          ? 80
          : c.wind_gusts_10m > 50
            ? 60
            : c.wind_gusts_10m > 30
              ? 30
              : 10;
    const precipRisk =
      c.precipitation > 10
        ? 90
        : c.precipitation > 5
          ? 60
          : c.precipitation > 1
            ? 30
            : 5;
    const stormRisk =
      c.weather_code >= 99
        ? 100
        : c.weather_code >= 95
          ? 85
          : c.weather_code >= 80
            ? 50
            : 10;

    const minVis = Math.min(...data.hourly.visibility.slice(0, 6));
    const visRisk =
      minVis < 200
        ? 95
        : minVis < 500
          ? 75
          : minVis < 1000
            ? 50
            : minVis < 5000
              ? 20
              : 5;

    // Weighted composite based on operation type
    const weights: Record<string, Record<string, number>> = {
      construction: {
        temp: 0.2,
        wind: 0.35,
        precip: 0.2,
        storm: 0.15,
        vis: 0.1,
      },
      logistics: { temp: 0.1, wind: 0.2, precip: 0.25, storm: 0.15, vis: 0.3 },
      aviation: { temp: 0.05, wind: 0.3, precip: 0.15, storm: 0.2, vis: 0.3 },
      outdoor_event: {
        temp: 0.25,
        wind: 0.2,
        precip: 0.25,
        storm: 0.2,
        vis: 0.1,
      },
      agriculture: {
        temp: 0.3,
        wind: 0.15,
        precip: 0.3,
        storm: 0.15,
        vis: 0.1,
      },
      energy: { temp: 0.15, wind: 0.35, precip: 0.15, storm: 0.25, vis: 0.1 },
      general: { temp: 0.2, wind: 0.25, precip: 0.2, storm: 0.2, vis: 0.15 },
    };

    const w = weights[operationType] ?? weights.general!;
    const compositeScore = Math.round(
      tempRisk * w.temp! +
        windRisk * w.wind! +
        precipRisk * w.precip! +
        stormRisk * w.storm! +
        visRisk * w.vis!,
    );

    let decision: "GO" | "CAUTION" | "NO-GO";
    if (compositeScore >= 70) decision = "NO-GO";
    else if (compositeScore >= 40) decision = "CAUTION";
    else decision = "GO";

    // Trend: check if conditions improving or worsening
    const futureGusts = data.hourly.wind_gusts_10m.slice(6, 12);
    const futurePrecip = data.hourly.precipitation.slice(6, 12);
    const avgFutureGusts =
      futureGusts.reduce((a, b) => a + b, 0) / futureGusts.length;
    const avgFuturePrecip =
      futurePrecip.reduce((a, b) => a + b, 0) / futurePrecip.length;
    const trend =
      avgFutureGusts < c.wind_gusts_10m && avgFuturePrecip < c.precipitation
        ? "improving"
        : avgFutureGusts > c.wind_gusts_10m
          ? "worsening"
          : "stable";

    return {
      location: city ?? `${latitude}, ${longitude}`,
      operationType,
      timestamp: new Date().toISOString(),
      compositeScore,
      decision,
      trend,
      factors: [
        {
          name: "Temperature",
          score: tempRisk,
          weight: Math.round(w.temp! * 100),
        },
        { name: "Wind", score: windRisk, weight: Math.round(w.wind! * 100) },
        {
          name: "Precipitation",
          score: precipRisk,
          weight: Math.round(w.precip! * 100),
        },
        {
          name: "Storm Activity",
          score: stormRisk,
          weight: Math.round(w.storm! * 100),
        },
        {
          name: "Visibility",
          score: visRisk,
          weight: Math.round(w.vis! * 100),
        },
      ],
      currentConditions: {
        temperature: c.temperature_2m,
        feelsLike: c.apparent_temperature,
        windGusts: c.wind_gusts_10m,
        precipitation: c.precipitation,
        humidity: c.relative_humidity_2m,
      },
    };
  },
});

/**
 * Get multi-day weather timeline for operational planning.
 */
export const getWeatherTimeline = tool({
  description:
    "Get a detailed multi-day weather timeline showing hour-by-hour conditions for operational planning. Includes work windows, risk periods, and optimal scheduling recommendations.",
  inputSchema: z.object({
    latitude: z.number().describe("Latitude"),
    longitude: z.number().describe("Longitude"),
    city: z.string().nullable().describe("Optional city name"),
    days: z.number().min(1).max(7).describe("Number of days to forecast (1-7)"),
  }),
  execute: async ({ latitude, longitude, city, days }) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,visibility,cloud_cover&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max,weather_code&forecast_days=${days}&timezone=auto`;

    const res = await fetch(url);
    if (!res.ok) return { error: "Failed to fetch weather timeline" };

    const data = (await res.json()) as {
      hourly: {
        time: string[];
        temperature_2m: number[];
        precipitation_probability: number[];
        precipitation: number[];
        weather_code: number[];
        wind_speed_10m: number[];
        wind_gusts_10m: number[];
        visibility: number[];
        cloud_cover: number[];
      };
      daily: {
        time: string[];
        sunrise: string[];
        sunset: string[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_sum: number[];
        wind_gusts_10m_max: number[];
        weather_code: number[];
      };
    };

    // Identify work windows (low risk periods)
    const workWindows: Array<{
      start: string;
      end: string;
      quality: "excellent" | "good" | "fair";
    }> = [];
    let windowStart: string | null = null;
    let windowQuality: "excellent" | "good" | "fair" = "excellent";

    for (let i = 0; i < Math.min(data.hourly.time.length, days * 24); i++) {
      const precip = data.hourly.precipitation[i]!;
      const gusts = data.hourly.wind_gusts_10m[i]!;
      const vis = data.hourly.visibility[i]!;
      const isSafe = precip < 1 && gusts < 50 && vis > 2000;
      const quality: "excellent" | "good" | "fair" =
        precip === 0 && gusts < 20
          ? "excellent"
          : precip < 0.5 && gusts < 35
            ? "good"
            : "fair";

      if (isSafe && !windowStart) {
        windowStart = data.hourly.time[i]!;
        windowQuality = quality;
      } else if (!isSafe && windowStart) {
        workWindows.push({
          start: windowStart,
          end: data.hourly.time[i]!,
          quality: windowQuality,
        });
        windowStart = null;
      }
    }
    if (windowStart) {
      workWindows.push({
        start: windowStart,
        end: data.hourly.time[
          Math.min(data.hourly.time.length - 1, days * 24 - 1)
        ]!,
        quality: windowQuality,
      });
    }

    const dailySummary = data.daily.time.map((date, i) => ({
      date,
      day: new Date(date + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      high: Math.round(data.daily.temperature_2m_max[i]!),
      low: Math.round(data.daily.temperature_2m_min[i]!),
      precipitation: data.daily.precipitation_sum[i]!,
      maxGusts: data.daily.wind_gusts_10m_max[i]!,
      sunrise: data.daily.sunrise[i]!,
      sunset: data.daily.sunset[i]!,
      condition: describeWeatherCode(data.daily.weather_code[i]!),
    }));

    return {
      location: city ?? `${latitude}, ${longitude}`,
      timestamp: new Date().toISOString(),
      days,
      dailySummary,
      workWindows: workWindows.slice(0, 10),
      bestDay: dailySummary.reduce((best, day) =>
        day.precipitation < best.precipitation && day.maxGusts < best.maxGusts
          ? day
          : best,
      ),
    };
  },
});

/**
 * Geocode a city name to coordinates.
 */
export const geocodeCity = tool({
  description:
    "Convert a city name to latitude/longitude coordinates. Use this before calling other FlashWeather tools that require coordinates.",
  inputSchema: z.object({
    city: z
      .string()
      .describe("City name (e.g., 'Mumbai', 'New York', 'London')"),
  }),
  execute: async ({ city }) => {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) return { error: `Failed to geocode: ${city}` };

    const data = (await res.json()) as {
      results?: Array<{
        name: string;
        country: string;
        latitude: number;
        longitude: number;
        timezone: string;
        admin1?: string;
      }>;
    };

    if (!data.results?.length) return { error: `City not found: ${city}` };

    const loc = data.results[0]!;
    return {
      city: loc.name,
      country: loc.country,
      region: loc.admin1 ?? null,
      latitude: loc.latitude,
      longitude: loc.longitude,
      timezone: loc.timezone,
    };
  },
});

function describeWeatherCode(code: number): string {
  const descriptions: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Rain showers",
    81: "Moderate showers",
    82: "Violent showers",
    85: "Snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm + hail",
    99: "Severe thunderstorm + hail",
  };
  return descriptions[code] ?? "Unknown";
}
