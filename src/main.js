const invoke = window.__TAURI__.core.invoke;

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

// Update weather data
async function updateWeather() {
    if (!userLocation) return;

    const weather = await fetchWeather(userLocation.latitude, userLocation.longitude);
    if (weather) {
        console.log('Weather retrieved:', weather);
        currentWeather = weather;
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
    } catch (error) {
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

// Determine time of day context
function getTimeOfDay() {
    const now = new Date();
    const hour = now.getHours();
    
    if (hour >= 5 && hour < 8) return 'dawn';
    if (hour >= 8 && hour < 17) return 'day';
    if (hour >= 17 && hour < 20) return 'dusk';
    return 'night';
}

// Random theme generators for more variety
function getRandomTheme() {
    const themes = [
        'architecture', 'cityscape', 'travel', 'nature', 'landscape',
        'mountains', 'ocean', 'beach', 'forest', 'desert', 'lake',
        'urban', 'street', 'minimalist', 'aerial', 'abstract',
        'coffee shop', 'library', 'garden', 'pathway', 'bridge',
        'skyline', 'countryside', 'village', 'alley', 'rooftop'
    ];
    return themes[Math.floor(Math.random() * themes.length)];
}

function getRandomMood() {
    const moods = [
        'cinematic', 'atmospheric', 'serene', 'peaceful', 'vibrant',
        'moody', 'dramatic', 'ethereal', 'dreamy', 'cozy',
        'mystical', 'tranquil', 'nostalgic', 'romantic', 'calm'
    ];
    return moods[Math.floor(Math.random() * moods.length)];
}

// Build contextual search query for Unsplash
function buildPhotoQuery() {
    const queries = [];
    
    // Priority 1: Holiday (if applicable)
    const holiday = getHoliday();
    if (holiday) {
        queries.push(holiday);
        queries.push('aesthetic');
    }
    
    // Priority 2: Weather conditions
    if (currentWeather) {
        if (currentWeather.rain > 0 || currentWeather.snowfall > 0) {
            if (currentWeather.snowfall > 0) {
                queries.push('snow winter');
            } else {
                queries.push('rain');
            }
        }
    }
    
    // Priority 3: Time of day with vibe
    const timeOfDay = getTimeOfDay();
    if (timeOfDay === 'night') {
        const nightThemes = ['night lights', 'night city', 'night sky', 'stars', 'moonlight'];
        queries.push(nightThemes[Math.floor(Math.random() * nightThemes.length)]);
    } else if (timeOfDay === 'dawn') {
        queries.push('sunrise golden hour');
    } else if (timeOfDay === 'dusk') {
        queries.push('sunset golden hour');
    }
    
    // Priority 4: Season (if no holiday)
    if (!holiday) {
        const season = getSeason();
        queries.push(season);
    }
    
    // Add random theme for variety
    queries.push(getRandomTheme());
    
    // Add random mood
    queries.push(getRandomMood());
    
    // Combine queries - more variety, not just landscape nature
    const finalQuery = queries.join(' ');
    console.log('Photo search query:', finalQuery);
    return finalQuery;
}

// Check if cached photo is still valid (less than 30 minutes old)
function isCachedPhotoValid() {
    const cachedData = localStorage.getItem('unsplash_photo_cache');
    if (!cachedData) return false;
    
    try {
        const cache = JSON.parse(cachedData);
        const now = Date.now();
        const cacheAge = now - cache.timestamp;
        const thirtyMinutes = 30 * 60 * 1000;
        
        // Only check time, not query (since random themes change each time)
        return cacheAge < thirtyMinutes;
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
        return cache.photo;
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
}

// Display photo (from cache or fresh)
async function displayPhoto(photo) {
    // Set the background image
    document.body.style.backgroundImage = `url('${photo.url}')`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundRepeat = 'no-repeat';
    
    // Display photo credit
    let creditElement = document.getElementById('photo-credit');
    if (!creditElement) {
        creditElement = document.createElement('div');
        creditElement.id = 'photo-credit';
        document.body.appendChild(creditElement);
    }
    creditElement.innerHTML = `Photo by <a href="${photo.author_url}" target="_blank">${photo.author}</a> on <a href="https://unsplash.com" target="_blank">Unsplash</a>`;
    
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
}

// Fetch and display Unsplash background photo
async function fetchUnsplashPhoto(forceRefresh = false) {
    try {
        // Check cache first
        if (!forceRefresh && isCachedPhotoValid()) {
            const cachedPhoto = getCachedPhoto();
            if (cachedPhoto) {
                console.log('Using cached photo');
                await displayPhoto(cachedPhoto);
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
        
        console.log('Unsplash photo:', photo);
        
        // Cache the photo
        cachePhoto(photo, query);
        
        // Display the photo
        await displayPhoto(photo);
        
    } catch (error) {
        console.error('Failed to fetch Unsplash photo:', error);
        
        // Try to use cached photo as fallback
        const cachedPhoto = getCachedPhoto();
        if (cachedPhoto) {
            console.log('Using cached photo as fallback');
            await displayPhoto(cachedPhoto);
        }
    }
}

// Fetch Unsplash photo on load (use cache if valid)
fetchUnsplashPhoto();
