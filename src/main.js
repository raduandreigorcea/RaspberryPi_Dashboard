const invoke = window.__TAURI__.core.invoke;

// Toggle debug output
let SHOW_DEBUG = false;

// Store location and weather data
let userLocation = null;
let currentWeather = null;
let isWeatherLoaded = false;

// Timers
let photoAgeInterval = null;
let nightOverlayInterval = null;
let currentPhotoUrl = null;

// Update weather display with data from Rust backend
function updateWeatherDisplay(weather) {
    document.getElementById('temp').textContent = `${Math.round(weather.temperature)}° C`;
    document.getElementById('humidity').textContent = `${weather.humidity}%`;
    document.getElementById('wind').textContent = `${Math.round(weather.wind_speed)} km/h`;
    document.getElementById('cloudiness').textContent = `${weather.cloudcover}%`;

    // Update precipitation
    const precipIcon = document.getElementById('precip-icon');
    const precipLabel = document.getElementById('precip-label');
    const precipValue = document.getElementById('precipitation');
    
    if (weather.snowfall > 0) {
        precipIcon.src = 'assets/snowflake.svg';
        precipLabel.textContent = 'Snow';
        precipValue.textContent = `${weather.snowfall} mm`;
    } else if (weather.rain > 0) {
        precipIcon.src = 'assets/droplet.svg';
        precipLabel.textContent = 'Rain';
        precipValue.textContent = `${weather.rain} mm`;
    } else {
        precipIcon.src = 'assets/umbrella.svg';
        precipLabel.textContent = 'Sky';
        precipValue.textContent = 'Clear';
    }

    // Update sunrise/sunset
    const sunrise = new Date(weather.sunrise);
    const sunset = new Date(weather.sunset);
    document.getElementById('sunrise').textContent = sunrise.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    document.getElementById('sunset').textContent = sunset.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

    currentWeather = weather;
    isWeatherLoaded = true;
}

// Fetch and display location
async function fetchLocation() {
    try {
        const location = await invoke('get_location');
        userLocation = location;

        const locationElement = document.getElementById('location');
        locationElement.textContent = location.city || `${location.latitude.toFixed(2)}°, ${location.longitude.toFixed(2)}°`;

        await updateWeather();
    } catch (error) {
        console.error('Failed to fetch location:', error);
        document.getElementById('location').textContent = 'Unknown';
    }
}

// Update weather data
async function updateWeather() {
    if (!userLocation) return;

    try {
        const weather = await invoke('get_weather', {
            latitude: userLocation.latitude,
            longitude: userLocation.longitude
        });
        
        updateWeatherDisplay(weather);
        
        // Fetch photo immediately after weather is loaded
        if (isWeatherLoaded) {
            await fetchUnsplashPhoto();
        }
    } catch (error) {
        console.error('Failed to fetch weather:', error);
    }
}

// Update CPU temperature
async function updateCPUTemp() {
    try {
        const temp = await invoke('get_cpu_temp');
        const cpuCard = document.querySelector('.cpu-card');
        
        if (temp > 0) {
            document.getElementById('cpu-temp').textContent = `${Math.round(temp)}°C`;
            cpuCard.style.display = 'flex';
        } else {
            cpuCard.style.display = 'none';
        }
    } catch (error) {
        console.error('Failed to fetch CPU temp:', error);
        document.querySelector('.cpu-card').style.display = 'none';
    }
}

// Update time and date using Rust backend
async function updateTimeAndDate() {
    try {
        const timeData = await invoke('get_current_time');
        document.getElementById('time').textContent = timeData.time;
        // Display as "FRIDAY\nNOV 28, 2025" with line break
        document.getElementById('date').innerHTML = `${timeData.day_of_week}<br>${timeData.date}`;
    } catch (error) {
        console.error('Failed to update time:', error);
    }
}

// Apply night overlay
async function applyNightOverlay() {
    if (!currentPhotoUrl || !currentWeather) return;
    
    try {
        const tod = await invoke('get_time_of_day', {
            sunriseIso: currentWeather.sunrise,
            sunsetIso: currentWeather.sunset
        });
        
        if (tod.time_of_day === 'night') {
            const gradient = 'linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.3))';
            document.body.style.backgroundImage = `${gradient}, url('${currentPhotoUrl}')`;
        } else {
            document.body.style.backgroundImage = `url('${currentPhotoUrl}')`;
        }
    } catch (e) {
        console.error('Failed to apply night overlay:', e);
    }
}

// Cache helpers
function isCachedPhotoValid() {
    const cachedData = localStorage.getItem('unsplash_photo_cache');
    if (!cachedData) return false;
    
    try {
        const cache = JSON.parse(cachedData);
        const cacheAge = Date.now() - cache.timestamp;
        const thirtyMinutes = 30 * 60 * 1000;
        
        if (cacheAge >= thirtyMinutes) return false;
        return true;
    } catch (error) {
        return false;
    }
}

function getCachedPhoto() {
    try {
        const cachedData = localStorage.getItem('unsplash_photo_cache');
        return cachedData ? JSON.parse(cachedData) : null;
    } catch (error) {
        return null;
    }
}

function cachePhoto(photo, query) {
    localStorage.setItem('unsplash_photo_cache', JSON.stringify({
        photo: photo,
        query: query,
        timestamp: Date.now()
    }));
}

// Display photo
async function displayPhoto(photo, timestamp = null, query = null) {
    currentPhotoUrl = photo.url;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundRepeat = 'no-repeat';
    document.body.style.backgroundPosition = 'center';
    await applyNightOverlay();
    
    // Display photo credit
    let creditElement = document.getElementById('photo-credit');
    if (!creditElement) {
        creditElement = document.createElement('div');
        creditElement.id = 'photo-credit';
        document.body.appendChild(creditElement);
    }
    creditElement.innerHTML = `Photo by <a href="${photo.author_url}" target="_blank">${photo.author}</a> on <a href="https://unsplash.com" target="_blank">Unsplash</a>`;

    // Clear previous intervals
    if (photoAgeInterval) clearInterval(photoAgeInterval);
    if (nightOverlayInterval) clearInterval(nightOverlayInterval);

    // Trigger Unsplash download endpoint
    if (photo.download_location) {
        try {
            await invoke('trigger_unsplash_download', { downloadUrl: photo.download_location });
        } catch (error) {
            console.error('Failed to trigger download:', error);
        }
    }

    // Debug display
    if (SHOW_DEBUG) {
        const debugEl = document.getElementById('debug');
        if (debugEl) {
            debugEl.style.display = 'grid';
            
            let usedQuery = query || getCachedPhoto()?.query;
            let ts = timestamp || getCachedPhoto()?.timestamp;

            const renderDebug = async () => {
                const ageText = ts ? (() => {
                    const seconds = Math.floor((Date.now() - ts) / 1000);
                    if (seconds < 60) return `${seconds}s ago`;
                    const minutes = Math.floor(seconds / 60);
                    if (minutes < 60) return `${minutes}m ago`;
                    const hours = Math.floor(minutes / 60);
                    if (hours < 24) return `${hours}h ago`;
                    return `${Math.floor(hours / 24)}d ago`;
                })() : 'unknown';

                // Get next transition times from Rust
                let nextTimesHtml = '';
                if (currentWeather?.sunrise && currentWeather?.sunset) {
                    try {
                        const sunriseTs = new Date(currentWeather.sunrise).getTime();
                        const sunsetTs = new Date(currentWeather.sunset).getTime();
                        const now = Date.now();
                        const oneHour = 60 * 60 * 1000;
                        
                        const formatRemaining = (ms) => {
                            if (ms <= 0) return '0s';
                            const total = Math.floor(ms / 1000);
                            const hours = Math.floor(total / 3600);
                            const minutes = Math.floor((total % 3600) / 60);
                            const seconds = total % 60;
                            if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
                            if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
                            return `${seconds}s`;
                        };

                        const pickNext = (ts) => ts > now ? ts : ts + 24 * 60 * 60 * 1000;
                        
                        const dawnTs = pickNext(sunriseTs - oneHour);
                        const dayTs = pickNext(sunriseTs + oneHour);
                        const duskTs = pickNext(sunsetTs - oneHour);
                        const nightTs = pickNext(sunsetTs + oneHour);

                        nextTimesHtml = `
                            <div>Next dawn in ${formatRemaining(dawnTs - now)}</div>
                            <div>Next day in ${formatRemaining(dayTs - now)}</div>
                            <div>Next dusk in ${formatRemaining(duskTs - now)}</div>
                            <div>Next night in ${formatRemaining(nightTs - now)}</div>
                        `;
                    } catch (e) {
                        console.error('Error calculating next times:', e);
                    }
                }

                debugEl.innerHTML = `
                    <div>Photo cached: ${ageText}</div>
                    <div>Query: ${usedQuery || 'n/a'}</div>
                    ${nextTimesHtml}
                `;
            };

            await renderDebug();
            photoAgeInterval = setInterval(renderDebug, 1000);
        }
    } else {
        const debugEl = document.getElementById('debug');
        if (debugEl) debugEl.style.display = 'none';
    }

    // Refresh night overlay every minute
    nightOverlayInterval = setInterval(applyNightOverlay, 60 * 1000);
}

// Fetch Unsplash photo
async function fetchUnsplashPhoto(forceRefresh = false) {
    try {
        // Use cache if valid
        if (!forceRefresh && isCachedPhotoValid()) {
            const cached = getCachedPhoto();
            if (cached) {
                console.log('Using cached photo');
                await displayPhoto(cached.photo, cached.timestamp, cached.query);
                return;
            }
        }
        
        // Wait for weather data if not loaded yet
        if (!isWeatherLoaded) {
            console.log('Waiting for weather data before fetching photo...');
            return;
        }
        
        console.log('Fetching new photo from Unsplash...');
        
        // Build query using Rust backend
        const queryResult = await invoke('build_photo_query', {
            cloudcover: currentWeather.cloudcover,
            sunriseIso: currentWeather.sunrise,
            sunsetIso: currentWeather.sunset
        });
        
        console.log('Photo query:', queryResult.query);
        
        const photo = await invoke('get_unsplash_photo', { 
            width: window.innerWidth, 
            height: window.innerHeight,
            query: queryResult.query
        });
        
        console.log('Photo fetched successfully');
        
        const nowTs = Date.now();
        cachePhoto(photo, queryResult.query);
        await displayPhoto(photo, nowTs, queryResult.query);
        
    } catch (error) {
        console.error('Failed to fetch Unsplash photo:', error);
        
        // Fallback to cache
        const cached = getCachedPhoto();
        if (cached) {
            console.log('Using cached photo as fallback');
            await displayPhoto(cached.photo, cached.timestamp, cached.query);
        }
    }
}

// Check if photo context has changed
async function checkPhotoContext() {
    if (!isWeatherLoaded) return;
    
    if (!isCachedPhotoValid()) {
        console.log('Photo context changed, fetching new photo...');
        await fetchUnsplashPhoto();
    }
}

// Initialize
updateTimeAndDate();
setInterval(updateTimeAndDate, 1000);

// Start with location fetch, which triggers weather, which triggers photo
fetchLocation();

updateCPUTemp();
setInterval(updateCPUTemp, 10 * 1000);

// Set up intervals
setInterval(updateWeather, 15 * 60 * 1000);
setInterval(() => fetchUnsplashPhoto(true), 30 * 60 * 1000);
setInterval(checkPhotoContext, 5 * 60 * 1000);

document.addEventListener('contextmenu', (e) => e.preventDefault());

// Console command to refresh photo
window.refreshPhoto = async function() {
    console.log('🔄 Manually refreshing photo...');
    try {
        if (!isWeatherLoaded) {
            console.log('⚠️ Weather not loaded yet, fetching weather first...');
            await updateWeather();
        }
        
        console.log('📸 Fetching new photo with current context...');
        await fetchUnsplashPhoto(true); // Force refresh
        console.log('✅ Photo refreshed successfully!');
    } catch (error) {
        console.error('❌ Failed to refresh photo:', error);
    }
};

console.log('💡 Tip: Type refreshPhoto() in console to fetch a new background photo');