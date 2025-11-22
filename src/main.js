const invoke = window.__TAURI__.core.invoke;

// Toggle debug output and debug-related timers. Set to `true` to show debug
// information (useful during development). Set to `false` in production to
// avoid extra timers and CPU usage.
let SHOW_DEBUG = false;

// Fetch weather data from Open-Meteo
async function fetchWeather(latitude, longitude) {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,rain,snowfall,cloudcover,wind_speed_10m&daily=sunrise,sunset&timezone=auto`;

        const response = await fetch(url);
        const data = await response.json();

        console.log('Weather data:', data);

        // Update temperature
        const temp = Math.round(data.current.temperature_2m);
        document.getElementById('temp').textContent = `${temp}° C`;

        // Update humidity
        document.getElementById('humidity').textContent = `${data.current.relative_humidity_2m}%`;

        // Update wind speed
        document.getElementById('wind').textContent = `${Math.round(data.current.wind_speed_10m)} km/h`;

        // Update cloudiness
        document.getElementById('cloudiness').textContent = `${data.current.cloudcover}%`;

        // Update precipitation (rain or snow)
        const precipIcon = document.getElementById('precip-icon');
        const precipLabel = document.getElementById('precip-label');
        const precipValue = document.getElementById('precipitation');
        
        if (data.current.snowfall > 0) {
            precipIcon.src = 'assets/snowflake.svg';
            precipLabel.textContent = 'Snow';
            precipValue.textContent = `${data.current.snowfall} mm`;
        } else if (data.current.rain > 0) {
            precipIcon.src = 'assets/droplet.svg';
            precipLabel.textContent = 'Rain';
            precipValue.textContent = `${data.current.rain} mm`;
        } else {
            // Show "Clear" when there's no precipitation - keep umbrella icon
            precipIcon.src = 'assets/umbrella.svg';
            precipLabel.textContent = 'Sky';
            precipValue.textContent = 'Clear';
        }

        // Update sunrise/sunset times
        const sunrise = new Date(data.daily.sunrise[0]);
        const sunset = new Date(data.daily.sunset[0]);
        document.getElementById('sunrise').textContent = sunrise.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        document.getElementById('sunset').textContent = sunset.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

        // Store weather data for later use
        return {
            temperature: data.current.temperature_2m,
            humidity: data.current.relative_humidity_2m,
            windSpeed: data.current.wind_speed_10m,
            cloudcover: data.current.cloudcover,
            rain: data.current.rain,
            snowfall: data.current.snowfall,
            sunrise: data.daily.sunrise[0],
            sunset: data.daily.sunset[0],
            timezone: data.timezone
        };
    } catch (error) {
        console.error('Failed to fetch weather:', error);
        return null;
    }
}

// Store location for periodic updates
let userLocation = null;

// Fetch and display user's location
async function fetchLocation() {
    try {
        const location = await invoke('get_location');
        userLocation = location;

        const locationElement = document.getElementById('location');
        if (location.city) {
            locationElement.textContent = location.city;
        } else {
            locationElement.textContent = `${location.latitude.toFixed(2)}°, ${location.longitude.toFixed(2)}°`;
        }

        console.log('Location:', location);

        // Fetch weather data with the location
        await updateWeather();
    } catch (error) {
        console.error('Failed to fetch location:', error);
        document.getElementById('location').textContent = 'Unknown';
    }
}

// Store weather data globally
let currentWeather = null;
// Interval for updating the displayed photo age
let photoAgeInterval = null;
// Currently displayed photo URL and night-overlay timer
let currentPhotoUrl = null;
let nightOverlayInterval = null;

// Update weather data
async function updateWeather() {
    if (!userLocation) return;

    const weather = await fetchWeather(userLocation.latitude, userLocation.longitude);
    if (weather) {
        console.log('Weather retrieved:', weather);
        currentWeather = weather;
        
        // Re-check photo context after weather update (in case sunrise/sunset times affect time of day)
        checkPhotoContext();
    }
}

// Fetch and display CPU temperature
async function updateCPUTemp() {
    try {
        const temp = await invoke('get_cpu_temp');
        const cpuCard = document.querySelector('.cpu-card');
        
        if (temp > 0) {
            document.getElementById('cpu-temp').textContent = `${Math.round(temp)}°C`;
            cpuCard.style.display = 'flex';
        } else {
            // Hide CPU temp on non-Linux systems
            cpuCard.style.display = 'none';
        }
    } 
    
    catch (error) {
        console.error('Failed to fetch CPU temp:', error);
        const cpuCard = document.querySelector('.cpu-card');
        cpuCard.style.display = 'none';
    }
}

// Update time and date
function updateTimeAndDate() {
    const now = new Date();

    // Format time as HH:MM
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('time').textContent = `${hours}:${minutes}`;

    // Format date short (e.g., "Nov 16, 2025")
    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    document.getElementById('date').textContent = now.toLocaleDateString('en-US', options);
}

// Update time immediately and then every second
updateTimeAndDate();
setInterval(updateTimeAndDate, 1000);

// Fetch location on load
fetchLocation();

// Update CPU temperature on load and every 10 seconds
updateCPUTemp();
setInterval(updateCPUTemp, 10 * 1000);

// Update weather every 15 minutes (900000 ms)
setInterval(updateWeather, 15 * 60 * 1000);

// Automatically refresh Unsplash photo every 30 minutes
setInterval(() => {
    fetchUnsplashPhoto(true); // force refresh
}, 30 * 60 * 1000); // 30 minutes

// Check photo context every 5 minutes (in case time of day changes)
setInterval(() => {
    checkPhotoContext();
}, 5 * 60 * 1000); // 5 minutes

// Determine the season based on date
function getSeason() {
    const now = new Date();
    const month = now.getMonth(); // 0-11
    
    // Northern hemisphere seasons
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'autumn';
    return 'winter';
}

// Check for holidays
function getHoliday() {
    const now = new Date();
    const month = now.getMonth();
    const day = now.getDate();
    
    // Christmas season (December 1-26)
    if (month === 11 && day <= 26) return 'christmas';
    
    // New Year (Dec 27 - Jan 5)
    if ((month === 11 && day >= 27) || (month === 0 && day <= 5)) return 'new year';
    
    // Halloween (October 25-31)
    if (month === 9 && day >= 25) return 'halloween';
    
    // Easter (rough estimate: late March to mid April)
    if ((month === 2 && day >= 20) || (month === 3 && day <= 20)) return 'easter';
    
    return null;
}

// Determine time of day context based on actual sunrise/sunset
function getTimeOfDay() {
    if (!currentWeather || !currentWeather.sunrise || !currentWeather.sunset) {
        // Fallback if no weather data yet
        const now = new Date();
        const hour = now.getHours();
        
        if (hour >= 5 && hour < 8) return 'dawn';
        if (hour >= 8 && hour < 17) return 'day';
        if (hour >= 17 && hour < 20) return 'dusk';
        return 'night';
    }
    
    const now = new Date();
    const currentTime = now.getTime();
    const sunrise = new Date(currentWeather.sunrise).getTime();
    const sunset = new Date(currentWeather.sunset).getTime();
    
    // Calculate golden hour windows (1 hour before/after sunrise/sunset)
    const oneHour = 60 * 60 * 1000;
    const dawnStart = sunrise - oneHour;
    const dawnEnd = sunrise + oneHour;
    const duskStart = sunset - oneHour;
    const duskEnd = sunset + oneHour;
    
    if (currentTime >= dawnStart && currentTime <= dawnEnd) return 'dawn';
    if (currentTime >= duskStart && currentTime <= duskEnd) return 'dusk';
    if (currentTime > dawnEnd && currentTime < duskStart) return 'day';
    return 'night';
}

// Build contextual search query for Unsplash - SIMPLIFIED
function buildPhotoQuery() {
    const parts = [];

    // Base: holiday or season
    const holiday = getHoliday();
    if (holiday) {
        parts.push(holiday);
    } else {
        const season = getSeason();
        if (season) parts.push(season);
    }

    // Inspect cloudiness from currentWeather (0-100). Prefer a gray/overcast theme if very cloudy.
    const cloudcover = currentWeather && typeof currentWeather.cloudcover === 'number' ? currentWeather.cloudcover : null;
    const isVeryCloudy = cloudcover !== null && cloudcover >= 70;
    if (isVeryCloudy) {
        // Strong cloudy theme
        parts.push('overcast');
    }

    // Time-of-day specific terms (these steer Unsplash toward photos matching the lighting/mood)
    const timeOfDay = getTimeOfDay();
    switch (timeOfDay) {
        case 'night':
            // Request darker, moody/night images
            parts.push('night dark');
            break;
        case 'dawn':
            // Soft, light, sunrise tones
            parts.push('sunrise soft light');
            break;
        case 'dusk':
            // Sunset / golden hour rich colors
            parts.push('sunset warm');
            break;
        case 'day':
        default:
            // Bright/daytime images — prefer clear/bright unless very cloudy
            if (!isVeryCloudy) parts.push('');
            else parts.push('day cloudy');
            break;
    }

    const finalQuery = parts.join(' ');
    console.log('Photo search query:', finalQuery, '(cloudcover:', cloudcover, ', tod:', timeOfDay, ')');
    return finalQuery;
}

// Apply a dark overlay over the current photo when it's night.
function applyNightOverlay() {
    if (!currentPhotoUrl) return;
    try {
        const tod = getTimeOfDay();
        if (tod === 'night') {
            // reduced alpha for a more subtle darkening
            const gradient = 'linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.3))';
            document.body.style.backgroundImage = `${gradient}, url('${currentPhotoUrl}')`;
        } else {
            // No overlay for non-night times; show photo normally
            document.body.style.backgroundImage = `url('${currentPhotoUrl}')`;
        }
    } catch (e) {
        console.error('Failed to apply night overlay:', e);
    }
}

// Check if cached photo is still valid AND matches current context
function isCachedPhotoValid() {
    const cachedData = localStorage.getItem('unsplash_photo_cache');
    if (!cachedData) return false;
    
    try {
        const cache = JSON.parse(cachedData);
        const now = Date.now();
        const cacheAge = now - cache.timestamp;
        const thirtyMinutes = 30 * 60 * 1000;
        
        // Check if cache is expired
        if (cacheAge >= thirtyMinutes) {
            console.log('Cache expired (age:', Math.round(cacheAge / 60000), 'minutes)');
            return false;
        }
        
        // Check if query matches current context
        const currentQuery = buildPhotoQuery();
        if (cache.query !== currentQuery) {
            console.log('Query changed from', cache.query, 'to', currentQuery);
            return false;
        }
        
        console.log('Cache is valid (age:', Math.round(cacheAge / 60000), 'minutes, query:', cache.query, ')');
        return true;
    } catch (error) {
        console.error('Failed to parse cache:', error);
        return false;
    }
}

// Get cached photo data
function getCachedPhoto() {
    const cachedData = localStorage.getItem('unsplash_photo_cache');
    if (!cachedData) return null;
    
    try {
        const cache = JSON.parse(cachedData);
        // Return the full cache (photo + timestamp + query) so callers can show age
        return cache;
    } catch (error) {
        console.error('Failed to parse cache:', error);
        return null;
    }
}

// Save photo to cache
function cachePhoto(photo, query) {
    const cacheData = {
        photo: photo,
        query: query,
        timestamp: Date.now()
    };
    localStorage.setItem('unsplash_photo_cache', JSON.stringify(cacheData));
    console.log('Photo cached with query:', query);
}

// Display photo (from cache or fresh)
async function displayPhoto(photo, timestamp = null, query = null) {
    // Store current photo and set background; overlay may be applied for night
    currentPhotoUrl = photo.url;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundRepeat = 'no-repeat';
    // Apply night overlay if needed
    applyNightOverlay();
    
    // Display photo credit
    let creditElement = document.getElementById('photo-credit');
    if (!creditElement) {
        creditElement = document.createElement('div');
        creditElement.id = 'photo-credit';
        document.body.appendChild(creditElement);
    }
    creditElement.innerHTML = `Photo by <a href="${photo.author_url}" target="_blank">${photo.author}</a> on <a href="https://unsplash.com" target="_blank">Unsplash</a>`;

    // Helper to format elapsed time
    function formatTimeAgo(ts) {
        const seconds = Math.floor((Date.now() - ts) / 1000);
        if (seconds < 60) return `${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }

    // Clear any previous interval used for updating debug info
    if (photoAgeInterval) {
        clearInterval(photoAgeInterval);
        photoAgeInterval = null;
    }

    // Trigger Unsplash download endpoint for API compliance
    if (photo.download_location) {
        try {
            await window.__TAURI__.core.invoke('trigger_unsplash_download', { 
                downloadUrl: photo.download_location 
            });
            console.log('Unsplash download triggered');
        } catch (error) {
            console.error('Failed to trigger download:', error);
        }
    }

        // Also display cache info and query inside #debug (if present).
        // When SHOW_DEBUG=false we avoid creating timers and don't touch the DOM
        // element to save CPU/battery.
        if (SHOW_DEBUG) {
            try {
                const debugEl = document.getElementById('debug');
                if (debugEl) {
                    // Prefer the provided query, otherwise try to read from cache
                    let usedQuery = query;
                    if (!usedQuery) {
                        const cached = getCachedPhoto();
                        if (cached && cached.query) usedQuery = cached.query;
                    }

                    // Prefer provided timestamp, else use cache timestamp if available
                    let ts = timestamp;
                    if (!ts) {
                        const cached = getCachedPhoto();
                        if (cached && cached.timestamp) ts = cached.timestamp;
                    }

                    // Helper: format ms remaining to HH:MM:SS
                    function formatRemaining(ms) {
                        if (ms <= 0) return '0s';
                        const total = Math.floor(ms / 1000);
                        const hours = Math.floor(total / 3600);
                        const minutes = Math.floor((total % 3600) / 60);
                        const seconds = total % 60;
                        if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
                        if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
                        return `${seconds}s`;
                    }

                    // Compute next occurrence timestamps for each time-of-day segment
                    function computeNextWindows() {
                        const now = Date.now();
                        const result = {};

                        // If we have sunrise/sunset from weather, use them; else use hour fallbacks
                        if (currentWeather && currentWeather.sunrise && currentWeather.sunset) {
                            const sunriseTs = new Date(currentWeather.sunrise).getTime();
                            const sunsetTs = new Date(currentWeather.sunset).getTime();
                            const oneHour = 60 * 60 * 1000;

                            // windows for today
                            const dawnStart = sunriseTs - oneHour;
                            const dayStart = sunriseTs + oneHour; // end of dawn
                            const duskStart = sunsetTs - oneHour;
                            const nightStart = sunsetTs + oneHour; // end of dusk

                            // helper to pick next occurrence (today or tomorrow)
                            const pickNext = (ts) => {
                                if (ts > now) return ts;
                                return ts + 24 * 60 * 60 * 1000; // tomorrow
                            };

                            result.dawn = pickNext(dawnStart);
                            result.day = pickNext(dayStart);
                            result.dusk = pickNext(duskStart);
                            result.night = pickNext(nightStart);
                        } else {
                            // Fallback schedule: dawn 05:00, day 08:00, dusk 17:00, night 20:00 local
                            const nowDate = new Date();
                            const base = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
                            const mk = (h, m = 0) => base.getTime() + (h * 60 + m) * 60 * 1000;
                            const candidates = {
                                dawn: mk(5),
                                day: mk(8),
                                dusk: mk(17),
                                night: mk(20)
                            };
                            Object.keys(candidates).forEach(k => {
                                let ts = candidates[k];
                                if (ts <= now) ts += 24 * 60 * 60 * 1000;
                                result[k] = ts;
                            });
                        }

                        return result;
                    }

                    const renderDebug = () => {
                        // Clear previous debug content
                        debugEl.innerHTML = '';

                        const ageText = ts ? formatTimeAgo(ts) : 'unknown';

                        const ageLine = document.createElement('div');
                        ageLine.id = 'debug-photo-age';
                        ageLine.textContent = `Photo cached: ${ageText}`;
                        debugEl.appendChild(ageLine);

                        const queryLine = document.createElement('div');
                        queryLine.id = 'debug-photo-query';
                        queryLine.textContent = `Query: ${usedQuery || 'n/a'}`;
                        debugEl.appendChild(queryLine);

                        // Timers for next photo query transitions
                        const next = computeNextWindows();
                        const now = Date.now();

                        const dawnLine = document.createElement('div');
                        dawnLine.id = 'debug-next-dawn';
                        dawnLine.textContent = `Next dawn in ${formatRemaining(next.dawn - now)} (at ${new Date(next.dawn).toLocaleTimeString()})`;
                        debugEl.appendChild(dawnLine);

                        const dayLine = document.createElement('div');
                        dayLine.id = 'debug-next-day';
                        dayLine.textContent = `Next day in ${formatRemaining(next.day - now)} (at ${new Date(next.day).toLocaleTimeString()})`;
                        debugEl.appendChild(dayLine);

                        const duskLine = document.createElement('div');
                        duskLine.id = 'debug-next-dusk';
                        duskLine.textContent = `Next dusk in ${formatRemaining(next.dusk - now)} (at ${new Date(next.dusk).toLocaleTimeString()})`;
                        debugEl.appendChild(duskLine);

                        const nightLine = document.createElement('div');
                        nightLine.id = 'debug-next-night';
                        nightLine.textContent = `Next night in ${formatRemaining(next.night - now)} (at ${new Date(next.night).toLocaleTimeString()})`;
                        debugEl.appendChild(nightLine);

                        // Future debug items can be appended as additional divs here
                    };

                    // Render immediately and set interval to refresh timers every second
                    renderDebug();
                    photoAgeInterval = setInterval(renderDebug, 1000);
                }
            } catch (e) {
                console.error('Failed to write debug info for photo cache:', e);
            }
        } else {
            // Debug disabled: hide debug element and clear any existing debug interval
            const debugEl = document.getElementById('debug');
            if (debugEl) debugEl.style.display = 'none';
            if (photoAgeInterval) {
                clearInterval(photoAgeInterval);
                photoAgeInterval = null;
            }
        }

    // Ensure we refresh night overlay every minute in case time-of-day changes
    if (nightOverlayInterval) {
        clearInterval(nightOverlayInterval);
        nightOverlayInterval = null;
    }
    nightOverlayInterval = setInterval(applyNightOverlay, 60 * 1000);
}

// Fetch and display Unsplash background photo
async function fetchUnsplashPhoto(forceRefresh = false) {
    try {
        // Check cache first (unless forced refresh)
        if (!forceRefresh && isCachedPhotoValid()) {
            const cached = getCachedPhoto();
            if (cached) {
                console.log('Using valid cached photo');
                await displayPhoto(cached.photo, cached.timestamp, cached.query);
                return;
            }
        }
        
        // Fetch new photo
        const width = window.innerWidth;
        const height = window.innerHeight;
        const query = buildPhotoQuery();
        
        console.log(`Fetching new Unsplash photo for ${width}x${height} with query: "${query}"`);
        
        const photo = await invoke('get_unsplash_photo', { 
            width: width, 
            height: height,
            query: query
        });
        
        console.log('Unsplash photo fetched successfully');
        
        // Cache the photo with current query and display it (pass timestamp for age)
        const nowTs = Date.now();
        cachePhoto(photo, query);
        
        // Display the photo with current timestamp so age shows correctly
        await displayPhoto(photo, nowTs, query);
        
    } catch (error) {
        console.error('Failed to fetch Unsplash photo:', error);
        
        // Try to use cached photo as fallback (even if expired)
        const cached = getCachedPhoto();
        if (cached) {
            console.log('Using cached photo as fallback after error');
            await displayPhoto(cached.photo, cached.timestamp, cached.query);
        }
    }
}

// Check if photo context has changed and fetch new photo if needed
function checkPhotoContext() {
    if (!isCachedPhotoValid()) {
        console.log('Photo context changed or cache expired, fetching new photo...');
        fetchUnsplashPhoto();
    }
}

// Fetch Unsplash photo on load (use cache if valid)
fetchUnsplashPhoto();

document.addEventListener('contextmenu', function(e) {
  e.preventDefault();
});