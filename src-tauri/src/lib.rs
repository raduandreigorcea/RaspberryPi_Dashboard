use serde::{Deserialize, Serialize};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Debug, Serialize, Deserialize)]
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

#[derive(Debug, Serialize, Deserialize)]
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

#[tauri::command]
async fn get_location() -> Result<Location, String> {
    // Using ip-api.com free API to get location based on IP
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
    
    // Build the final URL with the exact dimensions
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
        // Try to read from Raspberry Pi thermal zone
        match std::fs::read_to_string("/sys/class/thermal/thermal_zone0/temp") {
            Ok(contents) => {
                let temp_millidegrees: i32 = contents.trim()
                    .parse()
                    .map_err(|e| format!("Failed to parse temperature: {}", e))?;
                Ok(temp_millidegrees as f32 / 1000.0)
            }
            Err(_) => Ok(0.0) // Return 0 if not available (not on Raspberry Pi)
        }
    }
    
    #[cfg(not(target_os = "linux"))]
    {
        // On Windows/macOS, return 0 (not applicable)
        Ok(0.0)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load environment variables from .env file
    dotenvy::dotenv().ok();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, get_location, get_unsplash_photo, get_cpu_temp, trigger_unsplash_download])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
