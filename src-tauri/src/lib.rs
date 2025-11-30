use serde::{Deserialize, Serialize};
use chrono::{DateTime, Datelike, Local, Timelike, Utc};
use std::time::{SystemTime, UNIX_EPOCH};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Location {
    pub latitude: f64,
    pub longitude: f64,
    pub city: Option<String>,
    pub country: Option<String>,
}

#[derive(Debug, Deserialize)]
struct IpApiResponse {
    lat: f64,
    lon: f64,
    city: Option<String>,
    country: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UnsplashPhoto {
    pub url: String,
    pub author: String,
    pub author_url: String,
    pub download_location: String,
}

#[derive(Debug, Deserialize)]
struct UnsplashApiResponse {
    urls: UnsplashUrls,
    user: UnsplashUser,
    links: UnsplashPhotoLinks,
}

#[derive(Debug, Deserialize)]
struct UnsplashPhotoLinks {
    download_location: String,
}

#[derive(Debug, Deserialize)]
struct UnsplashUrls {
    regular: String,
}

#[derive(Debug, Deserialize)]
struct UnsplashUser {
    name: String,
    links: UnsplashUserLinks,
}

#[derive(Debug, Deserialize)]
struct UnsplashUserLinks {
    html: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WeatherData {
    pub temperature: f64,
    pub humidity: f64,
    pub wind_speed: f64,
    pub cloudcover: f64,
    pub rain: f64,
    pub snowfall: f64,
    pub sunrise: String,
    pub sunset: String,
    pub timezone: String,
}

#[derive(Debug, Deserialize)]
struct OpenMeteoResponse {
    current: OpenMeteoCurrentData,
    daily: OpenMeteoDailyData,
    timezone: String,
}

#[derive(Debug, Deserialize)]
struct OpenMeteoCurrentData {
    temperature_2m: f64,
    relative_humidity_2m: f64,
    rain: f64,
    snowfall: f64,
    cloudcover: f64,
    wind_speed_10m: f64,
}

#[derive(Debug, Deserialize)]
struct OpenMeteoDailyData {
    sunrise: Vec<String>,
    sunset: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct TimeOfDay {
    pub time_of_day: String, // "dawn", "day", "dusk", "night"
}

#[derive(Debug, Serialize)]
pub struct Season {
    pub season: String, // "spring", "summer", "autumn", "winter"
}

#[derive(Debug, Serialize)]
pub struct Holiday {
    pub holiday: Option<String>, // "christmas", "new year", "halloween", "easter"
}

#[derive(Debug, Serialize)]
pub struct PhotoQuery {
    pub query: String,
}

#[derive(Debug, Serialize)]
pub struct FormattedTime {
    pub time: String,           // HH:MM
    pub date: String,           // e.g., "Nov 28, 2025"
    pub day_of_week: String,    // e.g., "FRIDAY"
    pub timestamp: u64,         // Unix timestamp in milliseconds
}

#[derive(Debug, Serialize)]
pub struct PhotoCache {
    pub photo: UnsplashPhoto,
    pub query: String,
    pub timestamp: u64,
}

#[derive(Debug, Serialize)]
pub struct PrecipitationDisplay {
    pub icon: String,      // "snowflake.svg", "droplet.svg", "umbrella.svg"
    pub label: String,     // "Snow", "Rain", "Sky"
    pub value: String,     // "5 mm", "Clear"
}

#[derive(Debug, Serialize)]
pub struct DebugInfo {
    pub photo_age: String,
    pub query: String,
}

#[tauri::command]
async fn get_location() -> Result<Location, String> {
    let response = reqwest::get("http://ip-api.com/json/")
        .await
        .map_err(|e| format!("Failed to fetch location: {}", e))?;
    
    let data: IpApiResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse location data: {}", e))?;
    
    Ok(Location {
        latitude: data.lat,
        longitude: data.lon,
        city: data.city,
        country: data.country,
    })
}

#[tauri::command]
async fn get_weather(latitude: f64, longitude: f64) -> Result<WeatherData, String> {
    let url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={}&longitude={}&current=temperature_2m,relative_humidity_2m,rain,snowfall,cloudcover,wind_speed_10m&daily=sunrise,sunset&timezone=auto",
        latitude, longitude
    );
    
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to fetch weather: {}", e))?;
    
    let data: OpenMeteoResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse weather data: {}", e))?;
    
    Ok(WeatherData {
        temperature: data.current.temperature_2m,
        humidity: data.current.relative_humidity_2m,
        wind_speed: data.current.wind_speed_10m,
        cloudcover: data.current.cloudcover,
        rain: data.current.rain,
        snowfall: data.current.snowfall,
        sunrise: data.daily.sunrise.get(0).cloned().unwrap_or_default(),
        sunset: data.daily.sunset.get(0).cloned().unwrap_or_default(),
        timezone: data.timezone,
    })
}

#[tauri::command]
fn get_season() -> Season {
    let now = Local::now();
    let month = now.month();
    
    let season = match month {
        3..=5 => "spring",
        6..=8 => "summer",
        9..=11 => "autumn",
        _ => "winter",
    };
    
    Season {
        season: season.to_string(),
    }
}

#[tauri::command]
fn get_holiday() -> Holiday {
    let now = Local::now();
    let month = now.month();
    let day = now.day();
    
    let holiday = if month == 12 && day <= 26 {
        Some("christmas".to_string())
    } else if (month == 12 && day >= 27) || (month == 1 && day <= 5) {
        Some("new year".to_string())
    } else if month == 10 && day >= 25 {
        Some("halloween".to_string())
    } else if (month == 3 && day >= 20) || (month == 4 && day <= 20) {
        Some("easter".to_string())
    } else {
        None
    };
    
    Holiday { holiday }
}

#[tauri::command]
fn get_time_of_day(sunrise_iso: Option<String>, sunset_iso: Option<String>) -> TimeOfDay {
    let now = Local::now();
    
    // If we have sunrise/sunset data, use it
    if let (Some(sunrise_str), Some(sunset_str)) = (sunrise_iso, sunset_iso) {
        if let (Ok(sunrise), Ok(sunset)) = (
            DateTime::parse_from_rfc3339(&sunrise_str),
            DateTime::parse_from_rfc3339(&sunset_str),
        ) {
            let now_utc = Utc::now();
            let one_hour = chrono::Duration::hours(1);
            
            let dawn_start = sunrise - one_hour;
            let dawn_end = sunrise + one_hour;
            let dusk_start = sunset - one_hour;
            let dusk_end = sunset + one_hour;
            
            let time_of_day = if now_utc >= dawn_start && now_utc <= dawn_end {
                "dawn"
            } else if now_utc >= dusk_start && now_utc <= dusk_end {
                "dusk"
            } else if now_utc > dawn_end && now_utc < dusk_start {
                "day"
            } else {
                "night"
            };
            
            return TimeOfDay {
                time_of_day: time_of_day.to_string(),
            };
        }
    }
    
    // Fallback to hour-based calculation
    let hour = now.hour();
    let time_of_day = if hour >= 5 && hour < 8 {
        "dawn"
    } else if hour >= 8 && hour < 17 {
        "day"
    } else if hour >= 17 && hour < 20 {
        "dusk"
    } else {
        "night"
    };
    
    TimeOfDay {
        time_of_day: time_of_day.to_string(),
    }
}

#[tauri::command]
fn build_photo_query(
    cloudcover: f64,
    rain: f64,
    snowfall: f64,
    sunrise_iso: Option<String>,
    sunset_iso: Option<String>,
) -> PhotoQuery {
    let mut parts = Vec::new();
    
    // Always add holiday/season as base
    let holiday = get_holiday();
    if let Some(h) = holiday.holiday {
        parts.push(h);
    } else {
        let season = get_season();
        parts.push(season.season);
    }
    
    // Time of day
    let tod = get_time_of_day(sunrise_iso, sunset_iso);
    match tod.time_of_day.as_str() {
        "night" => parts.push("night dark".to_string()),
        "dawn" => parts.push("sunrise soft light".to_string()),
        "dusk" => parts.push("sunset warm".to_string()),
        "day" => {}, // Don't add anything for day
        _ => {}
    }
    
    // Cloudiness
    let is_very_cloudy = cloudcover >= 70.0;
    if is_very_cloudy {
        parts.push("overcast".to_string());
    }
    
    // Precipitation (adds to existing terms, doesn't replace)
    if snowfall > 0.0 {
        parts.push("snow".to_string());
        parts.push("cozy".to_string());
    } else if rain > 0.0 {
        parts.push("rain".to_string());
        parts.push("cozy".to_string());
    }
    
    PhotoQuery {
        query: parts.join(" "),
    }
}

#[tauri::command]
async fn get_unsplash_photo(width: u32, height: u32, query: String) -> Result<UnsplashPhoto, String> {
    let access_key = std::env::var("UNSPLASH_ACCESS_KEY")
        .unwrap_or_else(|_| "YOUR_UNSPLASH_ACCESS_KEY".to_string());
    
    let url = format!(
        "https://api.unsplash.com/photos/random?orientation=landscape&query={}&w={}&h={}",
        urlencoding::encode(&query),
        width,
        height
    );
    
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("Authorization", format!("Client-ID {}", access_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch photo: {}", e))?;
    
    let data: UnsplashApiResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse photo data: {}", e))?;
    
    let photo_url = format!("{}?w={}&h={}&fit=crop&q=85", data.urls.regular, width, height);
    
    Ok(UnsplashPhoto {
        url: photo_url,
        author: data.user.name,
        author_url: data.user.links.html,
        download_location: data.links.download_location,
    })
}

#[tauri::command]
async fn trigger_unsplash_download(download_url: String) -> Result<(), String> {
    let access_key = std::env::var("UNSPLASH_ACCESS_KEY")
        .unwrap_or_else(|_| "YOUR_UNSPLASH_ACCESS_KEY".to_string());
    
    let client = reqwest::Client::new();
    let _response = client
        .get(&download_url)
        .header("Authorization", format!("Client-ID {}", access_key))
        .send()
        .await
        .map_err(|e| format!("Failed to trigger download: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn get_cpu_temp() -> Result<f32, String> {
    #[cfg(target_os = "linux")]
    {
        match std::fs::read_to_string("/sys/class/thermal/thermal_zone0/temp") {
            Ok(contents) => {
                let temp_millidegrees: i32 = contents.trim()
                    .parse()
                    .map_err(|e| format!("Failed to parse temperature: {}", e))?;
                Ok(temp_millidegrees as f32 / 1000.0)
            }
            Err(_) => Ok(0.0)
        }
    }
    
    #[cfg(not(target_os = "linux"))]
    {
        Ok(0.0)
    }
}

#[tauri::command]
fn get_current_time() -> FormattedTime {
    let now = Local::now();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    
    let time = format!("{:02}:{:02}", now.hour(), now.minute());
    
    // Get full day name and convert to uppercase (FRIDAY, MONDAY, etc.)
    let day_of_week = now.format("%A").to_string().to_uppercase();
    
    // Format date as "NOV 28, 2025"
    let month = now.format("%b").to_string().to_uppercase();
    let day = now.day();
    let year = now.year();
    let date = format!("{} {}, {}", month, day, year);
    
    FormattedTime {
        time,
        date,
        day_of_week,
        timestamp,
    }
}

#[tauri::command]
fn get_precipitation_display(weather: WeatherData) -> PrecipitationDisplay {
    if weather.snowfall > 0.0 {
        PrecipitationDisplay {
            icon: "snowflake.svg".to_string(),
            label: "Snow".to_string(),
            value: format!("{} mm", weather.snowfall),
        }
    } else if weather.rain > 0.0 {
        PrecipitationDisplay {
            icon: "droplet.svg".to_string(),
            label: "Rain".to_string(),
            value: format!("{} mm", weather.rain),
        }
    } else {
        PrecipitationDisplay {
            icon: "umbrella.svg".to_string(),
            label: "Sky".to_string(),
            value: "Clear".to_string(),
        }
    }
}

#[tauri::command]
fn is_cache_valid(cache_timestamp: u64) -> bool {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    
    let cache_age = now - cache_timestamp;
    let thirty_minutes = 30 * 60 * 1000;
    
    cache_age < thirty_minutes
}

#[tauri::command]
fn format_time_remaining(milliseconds: i64) -> String {
    if milliseconds <= 0 {
        return "0s".to_string();
    }
    
    let total_seconds = milliseconds / 1000;
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;
    
    if hours > 0 {
        format!("{}h {:02}m", hours, minutes)
    } else if minutes > 0 {
        format!("{}m {:02}s", minutes, seconds)
    } else {
        format!("{}s", seconds)
    }
}

#[tauri::command]
fn get_debug_info(
    cache_timestamp: Option<u64>,
    query: Option<String>,
) -> DebugInfo {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    
    let photo_age = if let Some(ts) = cache_timestamp {
        let seconds = (now - ts) / 1000;
        if seconds < 60 {
            format!("{}s ago", seconds)
        } else {
            let minutes = seconds / 60;
            if minutes < 60 {
                format!("{}m ago", minutes)
            } else {
                let hours = minutes / 60;
                if hours < 24 {
                    format!("{}h ago", hours)
                } else {
                    format!("{}d ago", hours / 24)
                }
            }
        }
    } else {
        "unknown".to_string()
    };
    
    let query_str = query.unwrap_or_else(|| "n/a".to_string());
    
    DebugInfo {
        photo_age,
        query: query_str,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenvy::dotenv().ok();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_location,
            get_weather,
            get_unsplash_photo,
            get_cpu_temp,
            trigger_unsplash_download,
            get_season,
            get_holiday,
            get_time_of_day,
            build_photo_query,
            get_current_time,
            get_precipitation_display,
            is_cache_valid,
            format_time_remaining,
            get_debug_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}