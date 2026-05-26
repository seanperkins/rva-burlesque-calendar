// RVA Burlesque Calendar - App JS

let allEvents = [];
let datedEvents = [];
let tbaEvents = [];
let filteredDated = [];
let filteredTBA = [];
let currentMonth = new Date();

const sourceColors = {
    "gallery5": "#d4a574",
    "burlesque-right-meow": "#c2185b",
    "ember": "#7c3aed",
    "ellie-quinn": "#0ea5e9",
    "blue-bee": "#22c55e",
    "dreamhaus": "#ec4899",
    "rva-burlesque-festival": "#dc2626"
};

function escapeHtml(text) {
    if (text == null) return "";
    const div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
}

function escapeAttr(text) {
    if (text == null) return "";
    return String(text).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const eventsList = document.getElementById("events-list");
const eventsCalendar = document.getElementById("events-calendar");
const eventsMap = document.getElementById("events-map");
const mapNoteEl = document.getElementById("map-note");
const filterCost = document.getElementById("filter-cost");
const filterType = document.getElementById("filter-type");
const filterLocation = document.getElementById("filter-location");
const filterTBD = document.getElementById("filter-tbd");
const tbdCountEl = document.getElementById("tbd-toggle-count");
const viewListBtn = document.getElementById("view-list");
const viewCalendarBtn = document.getElementById("view-calendar");
const viewMapBtn = document.getElementById("view-map");
const lastUpdatedEl = document.getElementById("last-updated");
const calMonthEl = document.getElementById("cal-month");
const calDaysEl = document.getElementById("cal-days");
const calPrevBtn = document.getElementById("cal-prev");
const calNextBtn = document.getElementById("cal-next");

const TBD_PREF_KEY = "rvaBurlesqueShowTBD";

function loadTBDPref() {
    try {
        return localStorage.getItem(TBD_PREF_KEY) === "1";
    } catch (e) {
        return false;
    }
}

function saveTBDPref(show) {
    try {
        localStorage.setItem(TBD_PREF_KEY, show ? "1" : "0");
    } catch (e) { /* ignore */ }
}

async function init() {
    try {
        const response = await fetch("data/events.json");
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        const data = await response.json();

        allEvents = data.events || [];
        datedEvents = allEvents.filter(e => !e.dateTBA && e.date);
        tbaEvents = allEvents.filter(e => e.dateTBA);

        if (data.lastUpdated) {
            const d = new Date(data.lastUpdated);
            lastUpdatedEl.textContent = d.toLocaleDateString("en-US", {
                year: "numeric", month: "short", day: "numeric"
            });
        }

        populateLocationFilter();
        setupSubscribeLink();
        applyFilters();
    } catch (error) {
        console.error("Failed to load events:", error);
        eventsList.innerHTML = '<p class="no-events">Failed to load shows. Please try again later.</p>';
    }
}

function populateLocationFilter() {
    const locations = [...new Set(allEvents.map(e => e.location).filter(Boolean))].sort();
    locations.forEach(loc => {
        const option = document.createElement("option");
        option.value = loc;
        option.textContent = loc;
        filterLocation.appendChild(option);
    });
}

const SUBSCRIBE_DISMISS_COOKIE = "rvaBurlesqueSubscribeDismissed";

function setCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 86400000).toUTCString();
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax${secure}`;
}

function getCookie(name) {
    const match = document.cookie
        .split("; ")
        .find(row => row.startsWith(name + "="));
    return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
}

function setupSubscribeLink() {
    const subscribeBtn = document.getElementById("subscribe-btn");
    const headerSubscribeBtn = document.getElementById("header-subscribe-btn");
    const copyBtn = document.getElementById("copy-url-btn");
    const hint = document.getElementById("subscribe-hint");
    const section = document.getElementById("subscribe-section");
    const dismissBtn = document.getElementById("subscribe-dismiss");

    let basePath = window.location.pathname;
    if (basePath.endsWith("/")) {
        basePath = basePath.slice(0, -1);
    } else if (basePath.includes(".")) {
        basePath = basePath.replace(/\/[^/]*$/, "");
    }
    const calendarUrl = `${window.location.origin}${basePath}/data/calendar.ics`;
    const webcalUrl = calendarUrl.replace(/^https?:/, "webcal:");

    if (subscribeBtn) subscribeBtn.href = webcalUrl;
    if (headerSubscribeBtn) headerSubscribeBtn.href = webcalUrl;

    if (copyBtn) {
        copyBtn.addEventListener("click", async () => {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                try {
                    await navigator.clipboard.writeText(calendarUrl);
                    hint.textContent = "URL copied! Paste into your calendar app's \"Add by URL\" option.";
                    hint.style.color = "var(--accent)";
                    return;
                } catch (err) { /* fall through */ }
            }
            hint.textContent = calendarUrl;
            hint.style.color = "var(--text-muted)";
        });
    }

    if (section && getCookie(SUBSCRIBE_DISMISS_COOKIE) === "1") {
        section.classList.add("hidden");
    }

    if (dismissBtn && section) {
        dismissBtn.addEventListener("click", () => {
            section.classList.add("hidden");
            setCookie(SUBSCRIBE_DISMISS_COOKIE, "1", 365);
        });
    }
}

function eventMatchesFilters(event, { ignoreTentative = false } = {}) {
    const costFilter = filterCost.value;
    const typeFilter = filterType.value;
    const locationFilter = filterLocation.value;
    const showTBD = filterTBD && filterTBD.checked;

    if (!ignoreTentative && !showTBD && event.tentative) return false;

    const costText = event.cost ? String(event.cost).toLowerCase() : "";
    const isFreeEvent = event.costValue === 0 || costText.includes("free");
    const hasKnownCost = event.costValue != null || costText !== "";

    if (costFilter === "free" && !isFreeEvent) return false;
    if (costFilter === "paid" && (!hasKnownCost || isFreeEvent)) return false;
    if (typeFilter !== "all" && !(event.tags || []).includes(typeFilter)) return false;
    if (locationFilter !== "all" && event.location !== locationFilter) return false;

    return true;
}

function applyFilters() {
    const today = new Date().toISOString().split("T")[0];

    filteredDated = datedEvents.filter(event => {
        const endRef = event.endDate || event.date;
        if (endRef < today) return false;
        return eventMatchesFilters(event);
    });

    filteredDated.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.startTime || "").localeCompare(b.startTime || "");
    });

    filteredTBA = tbaEvents.filter(eventMatchesFilters);
    filteredTBA.sort((a, b) => (a.expectedMonth || "").localeCompare(b.expectedMonth || ""));

    updateTBDCount(today);
    renderList();
    renderCalendar();
    if (mapInstance) drawMap();
}

function updateTBDCount(today) {
    if (!tbdCountEl) return;
    if (filterTBD && filterTBD.checked) {
        tbdCountEl.textContent = "";
        return;
    }
    const hidden = datedEvents.filter(event => {
        const endRef = event.endDate || event.date;
        if (endRef < today) return false;
        if (!event.tentative) return false;
        return eventMatchesFilters(event, { ignoreTentative: true });
    }).length;
    tbdCountEl.textContent = hidden > 0 ? `${hidden} hidden` : "";
}

function formatTimeRange(start, end) {
    if (!start) return "";
    const fmt = (t) => {
        const [h, m] = t.split(":").map(Number);
        const ampm = h >= 12 ? "pm" : "am";
        const hour = h % 12 || 12;
        return m === 0 ? `${hour}${ampm}` : `${hour}:${m.toString().padStart(2, "0")}${ampm}`;
    };
    if (!end) return fmt(start);
    return `${fmt(start)} - ${fmt(end)}`;
}

function formatExpectedMonth(ym) {
    if (!ym) return "Date TBA";
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function renderEventCard(event, index, idPrefix) {
    const isTBA = !!event.dateTBA;
    const isTentative = !!event.tentative;
    const cardClasses = ["event-card"];
    if (isTentative) cardClasses.push("tentative");

    let dateStr;
    if (isTBA) {
        dateStr = `${formatExpectedMonth(event.expectedMonth)} &middot; Date TBA`;
    } else {
        const dateObj = new Date(event.date + "T12:00:00");
        const opts = { weekday: "short", month: "short", day: "numeric" };
        dateStr = dateObj.toLocaleDateString("en-US", opts);
        if (event.endDate && event.endDate !== event.date) {
            const endObj = new Date(event.endDate + "T12:00:00");
            dateStr += " &ndash; " + endObj.toLocaleDateString("en-US", opts);
        }
    }

    const tentativeFlag = isTentative
        ? `<span class="tentative-flag" title="${escapeAttr(event.tentativeReason || "Tentative")}">tentative</span>`
        : "";

    const timeStr = formatTimeRange(event.startTime, event.endTime);
    const sourceColor = sourceColors[event.source] || "var(--wine)";

    const tagsHtml = (event.tags || []).map(tag => {
        const safeClass = tag.replace(/[^a-z0-9-]/gi, "");
        return `<span class="tag ${safeClass}">${escapeHtml(tag.replace("-", " "))}</span>`;
    }).join("");

    const regStatus = event.registrationStatus && event.registrationStatus !== "unknown"
        ? `<span class="registration-status ${escapeAttr(event.registrationStatus)}">${escapeHtml(event.registrationStatus)}</span>`
        : "";

    const mapsUrl = event.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address)}`
        : null;
    const locationHtml = mapsUrl
        ? `<a href="${mapsUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(event.location)}</a>`
        : escapeHtml(event.location);

    const canAddToCal = !isTBA;
    const calBtnHtml = canAddToCal
        ? `<div class="add-to-cal-wrapper">
                <button class="add-to-cal" onclick="toggleCalendarMenu('${idPrefix}-${index}')" aria-label="Add to calendar options">
                    <span aria-hidden="true">&#x1F4C5;</span>
                    <span class="add-to-cal-text">Add to Calendar</span>
                </button>
                <div class="calendar-menu" id="cal-menu-${idPrefix}-${index}" role="menu">
                    <a href="${getGoogleCalendarUrl(event)}" target="_blank" rel="noopener noreferrer" role="menuitem">Google Calendar</a>
                    <button onclick="downloadEventICS('${idPrefix}', ${index})" role="menuitem">Download ICS</button>
                </div>
            </div>`
        : "";

    const titleHtml = event.url
        ? `<a href="${escapeAttr(event.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(event.title)}</a>`
        : escapeHtml(event.title);

    const costHtml = event.cost ? `<span class="event-cost">${escapeHtml(event.cost)}</span>` : "";
    const timeHtml = timeStr ? `<span class="event-time">${escapeHtml(timeStr)}</span>` : "";

    return `
        <article class="${cardClasses.join(" ")}" style="border-left-color: ${sourceColor}">
            <div class="event-header">
                <div class="event-date">${dateStr}${tentativeFlag}</div>
                ${calBtnHtml}
            </div>
            <h2 class="event-title">${titleHtml}</h2>
            <div class="event-meta">
                ${timeHtml}
                <span class="event-location">${locationHtml}</span>
                ${costHtml}
            </div>
            ${event.description ? `<p class="event-description">${escapeHtml(event.description)}</p>` : ""}
            <div class="event-tags">
                ${tagsHtml}
                ${regStatus}
            </div>
        </article>
    `;
}

function renderList() {
    if (filteredDated.length === 0 && filteredTBA.length === 0) {
        eventsList.innerHTML = '<p class="no-events">No upcoming shows match your filters.</p>';
        return;
    }

    let html = filteredDated.map((e, i) => renderEventCard(e, i, "dated")).join("");

    if (filteredTBA.length > 0) {
        html += '<h3 class="section-heading">Date entirely unknown</h3>';
        html += filteredTBA.map((e, i) => renderEventCard(e, i, "tba")).join("");
    }

    eventsList.innerHTML = html;
}

function foldICSLine(line) {
    const maxLen = 75;
    if (line.length <= maxLen) return line;
    let result = line.substring(0, maxLen);
    let pos = maxLen;
    while (pos < line.length) {
        result += "\r\n " + line.substring(pos, pos + maxLen - 1);
        pos += maxLen - 1;
    }
    return result;
}

function addHoursToTime(timeStr, hours) {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(":").map(Number);
    const newH = (h + hours) % 24;
    return `${String(newH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function generateICS(event) {
    const escapeICS = (s) => !s ? "" : s
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\n/g, "\\n");

    const dateOnly = !event.startTime;
    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//RVA Burlesque//Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        `UID:${event.date}-${(event.startTime || "0000").replace(":", "")}-${event.source}@rvaburlesque`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`
    ];

    if (dateOnly) {
        const d = event.date.replace(/-/g, "");
        const endRaw = event.endDate || event.date;
        const endDate = new Date(endRaw + "T12:00:00");
        endDate.setDate(endDate.getDate() + 1);
        const dEnd = endDate.toISOString().split("T")[0].replace(/-/g, "");
        lines.push(`DTSTART;VALUE=DATE:${d}`);
        lines.push(`DTEND;VALUE=DATE:${dEnd}`);
    } else {
        const fmt = (date, time) => date.replace(/-/g, "") + "T" + (time ? time.replace(":", "") + "00" : "000000");
        const endTime = event.endTime || addHoursToTime(event.startTime, 2) || event.startTime;
        lines.push(`DTSTART:${fmt(event.date, event.startTime)}`);
        lines.push(`DTEND:${fmt(event.endDate || event.date, endTime)}`);
    }

    const location = event.address ? `${event.location}, ${event.address}` : event.location;
    const description = [
        event.tentative ? "[Tentative date — confirm with venue]" : "",
        event.description,
        event.cost ? `Cost: ${event.cost}` : "",
        event.url ? `Info: ${event.url}` : ""
    ].filter(Boolean).join("\\n\\n");

    lines.push(foldICSLine(`SUMMARY:${escapeICS(event.title)}${event.tentative ? " (tentative)" : ""}`));
    if (location) lines.push(foldICSLine(`LOCATION:${escapeICS(location)}`));
    if (description) lines.push(foldICSLine(`DESCRIPTION:${escapeICS(description)}`));
    if (event.url) lines.push(`URL:${event.url}`);
    lines.push("END:VEVENT", "END:VCALENDAR");

    return lines.join("\r\n");
}

function getGoogleCalendarUrl(event) {
    const formatGoogleDate = (date, time) => {
        const d = date.replace(/-/g, "");
        const t = time ? time.replace(":", "") + "00" : "000000";
        return d + "T" + t;
    };

    let start, end;
    if (event.startTime) {
        start = formatGoogleDate(event.date, event.startTime);
        const endTime = event.endTime || addHoursToTime(event.startTime, 2) || event.startTime;
        end = formatGoogleDate(event.endDate || event.date, endTime);
    } else {
        start = event.date.replace(/-/g, "");
        const endRaw = event.endDate || event.date;
        const endDate = new Date(endRaw + "T12:00:00");
        endDate.setDate(endDate.getDate() + 1);
        end = endDate.toISOString().split("T")[0].replace(/-/g, "");
    }

    const location = event.address ? `${event.location}, ${event.address}` : event.location;
    const details = [
        event.tentative ? "[Tentative date — confirm with venue]" : "",
        event.description,
        event.cost ? `Cost: ${event.cost}` : "",
        event.url ? `Info: ${event.url}` : ""
    ].filter(Boolean).join("\n\n");

    const params = new URLSearchParams({
        action: "TEMPLATE",
        text: event.title + (event.tentative ? " (tentative)" : ""),
        dates: `${start}/${end}`,
        location: location || "",
        details
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function toggleCalendarMenu(key) {
    const menu = document.getElementById(`cal-menu-${key}`);
    if (!menu) return;
    const isOpen = menu.classList.contains("open");
    document.querySelectorAll(".calendar-menu.open").forEach(m => m.classList.remove("open"));
    if (!isOpen) menu.classList.add("open");
}

document.addEventListener("click", (e) => {
    if (!e.target.closest(".add-to-cal-wrapper")) {
        document.querySelectorAll(".calendar-menu.open").forEach(m => m.classList.remove("open"));
    }
});

function downloadEventICS(prefix, index) {
    const list = prefix === "tba" ? filteredTBA : filteredDated;
    const event = list[index];
    if (!event || !event.date) return;

    document.querySelectorAll(".calendar-menu.open").forEach(m => m.classList.remove("open"));

    const icsContent = generateICS(event);
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const safeTitle = event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 50);
    const filename = `${event.date}-${safeTitle}.ics`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function renderCalendar() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    calMonthEl.textContent = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    const monthEvents = {};
    filteredDated.forEach(event => {
        const start = new Date(event.date + "T12:00:00");
        const end = new Date((event.endDate || event.date) + "T12:00:00");
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            if (d.getFullYear() === year && d.getMonth() === month) {
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                if (!monthEvents[key]) monthEvents[key] = [];
                monthEvents[key].push(event);
            }
        }
    });

    let html = "";
    const prevMonth = new Date(year, month, 0);
    for (let i = startPad - 1; i >= 0; i--) {
        const day = prevMonth.getDate() - i;
        html += `<div class="cal-day other-month"><span class="cal-day-num">${day}</span></div>`;
    }

    for (let day = 1; day <= totalDays; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const isToday = dateStr === todayStr;
        const dayEvents = monthEvents[dateStr] || [];

        const eventsHtml = dayEvents.slice(0, 2).map(e => {
            const color = sourceColors[e.source] || "var(--wine)";
            const safeTitle = escapeAttr(e.title);
            const safeUrl = escapeAttr(e.url);
            const labelSource = (e.location || "").split(/[\s(]/)[0];
            const safeLabel = escapeHtml(labelSource);
            const classes = ["cal-event"];
            if (e.tentative) classes.push("tentative");
            const styleBg = e.tentative ? "" : `style="background: ${color}"`;
            return `<div class="${classes.join(" ")}" ${styleBg} title="${safeTitle}" onclick="window.open('${safeUrl}', '_blank', 'noopener')">${safeLabel}</div>`;
        }).join("");

        const moreHtml = dayEvents.length > 2
            ? `<div class="cal-event" style="background:#666">+${dayEvents.length - 2} more</div>`
            : "";

        html += `
            <div class="cal-day ${isToday ? "today" : ""}">
                <span class="cal-day-num">${day}</span>
                ${eventsHtml}${moreHtml}
            </div>
        `;
    }

    const endPad = (7 - ((startPad + totalDays) % 7)) % 7;
    for (let day = 1; day <= endPad; day++) {
        html += `<div class="cal-day other-month"><span class="cal-day-num">${day}</span></div>`;
    }

    calDaysEl.innerHTML = html;
}

// --- Map view ---
let leafletLoadPromise = null;
let venueCoordsPromise = null;
let venueCoords = null;
let mapInstance = null;
let mapMarkers = [];

function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletLoadPromise) return leafletLoadPromise;
    leafletLoadPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        s.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
        s.crossOrigin = "";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Failed to load Leaflet"));
        document.head.appendChild(s);
    });
    return leafletLoadPromise;
}

function loadVenueCoords() {
    if (venueCoords) return Promise.resolve(venueCoords);
    if (venueCoordsPromise) return venueCoordsPromise;
    venueCoordsPromise = fetch("data/venues.json")
        .then(r => (r.ok ? r.json() : {}))
        .then(data => { venueCoords = data || {}; return venueCoords; })
        .catch(() => { venueCoords = {}; return venueCoords; });
    return venueCoordsPromise;
}

function venueKey(event) {
    const addr = event.address || "";
    if (!addr) return null;
    return addr.replace(/&#8217;/g, "’").trim().replace(/  +/g, " ");
}

function groupEventsByVenue(events) {
    const groups = {};
    events.forEach(ev => {
        const key = venueKey(ev);
        if (!key) return;
        if (!groups[key]) {
            groups[key] = { key, address: ev.address, location: ev.location, events: [] };
        }
        groups[key].events.push(ev);
    });
    return Object.values(groups);
}

function renderMap() {
    if (!mapNoteEl) return;
    mapNoteEl.textContent = "Loading map…";
    Promise.all([loadLeaflet(), loadVenueCoords()])
        .then(drawMap)
        .catch(err => {
            mapNoteEl.textContent = `Could not load map: ${err.message}`;
        });
}

function drawMap() {
    if (!window.L) return;

    if (!mapInstance) {
        mapInstance = L.map("map", { scrollWheelZoom: false }).setView([37.5407, -77.436], 12);
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
            maxZoom: 19,
            subdomains: "abcd",
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        }).addTo(mapInstance);
    }

    mapMarkers.forEach(m => mapInstance.removeLayer(m));
    mapMarkers = [];

    const groups = groupEventsByVenue(filteredDated);
    const bounds = [];
    const missing = [];

    groups.forEach(group => {
        const coords = venueCoords[group.key];
        if (!coords || coords.lat == null || coords.lng == null) {
            missing.push(group);
            return;
        }
        const marker = L.marker([coords.lat, coords.lng]).addTo(mapInstance);
        marker.bindPopup(buildVenuePopup(group), { maxWidth: 320, autoPan: true });
        mapMarkers.push(marker);
        bounds.push([coords.lat, coords.lng]);
    });

    if (bounds.length === 1) {
        mapInstance.setView(bounds[0], 13);
    } else if (bounds.length > 1) {
        mapInstance.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }

    const msg = [];
    if (groups.length === 0) {
        msg.push("No mappable events match your filters.");
    } else if (bounds.length === 0) {
        msg.push("None of the matching events have geocoded venues yet.");
    } else if (missing.length > 0) {
        const names = missing.map(g => g.location || g.address).join(", ");
        msg.push(`${missing.length} venue(s) not yet on the map: ${names}`);
    }
    mapNoteEl.textContent = msg.join(" ");

    setTimeout(() => mapInstance.invalidateSize(), 0);
}

function buildVenuePopup(group) {
    const root = document.createElement("div");
    root.className = "map-popup";

    const heading = document.createElement("h4");
    heading.className = "map-popup-title";
    heading.textContent = group.location || group.address;
    root.appendChild(heading);

    if (group.address && group.location) {
        const addr = document.createElement("div");
        addr.className = "map-popup-address";
        addr.textContent = group.address;
        root.appendChild(addr);
    }

    const list = document.createElement("ul");
    list.className = "map-popup-events";
    group.events
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        .slice(0, 6)
        .forEach(ev => {
            const li = document.createElement("li");
            if (ev.tentative) li.classList.add("tentative");
            const when = document.createElement("span");
            when.className = "map-popup-when";
            const dateObj = new Date(ev.date + "T12:00:00");
            const dateStr = dateObj.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
            when.textContent = dateStr + (ev.startTime ? ` · ${formatTimeRange(ev.startTime, ev.endTime).split(" - ")[0]}` : "");
            const titleNode = ev.url
                ? Object.assign(document.createElement("a"), {
                    href: ev.url, target: "_blank", rel: "noopener noreferrer", textContent: ev.title
                })
                : Object.assign(document.createElement("span"), { textContent: ev.title });
            li.appendChild(when);
            li.appendChild(document.createTextNode(" — "));
            li.appendChild(titleNode);
            list.appendChild(li);
        });
    root.appendChild(list);

    if (group.events.length > 6) {
        const more = document.createElement("div");
        more.className = "map-popup-more";
        more.textContent = `+ ${group.events.length - 6} more`;
        root.appendChild(more);
    }
    return root;
}

filterCost.addEventListener("change", applyFilters);
filterType.addEventListener("change", applyFilters);
filterLocation.addEventListener("change", applyFilters);

if (filterTBD) {
    filterTBD.checked = loadTBDPref();
    filterTBD.addEventListener("change", () => {
        saveTBDPref(filterTBD.checked);
        applyFilters();
    });
}

function setActiveView(view) {
    const buttons = [
        { btn: viewListBtn, panel: eventsList, name: "list" },
        { btn: viewCalendarBtn, panel: eventsCalendar, name: "calendar" },
        { btn: viewMapBtn, panel: eventsMap, name: "map" },
    ];
    buttons.forEach(({ btn, panel, name }) => {
        const active = name === view;
        if (btn) {
            btn.classList.toggle("active", active);
            btn.setAttribute("aria-selected", active ? "true" : "false");
        }
        if (panel) panel.classList.toggle("hidden", !active);
    });
    if (view === "map") renderMap();
}

viewListBtn.addEventListener("click", () => setActiveView("list"));
viewCalendarBtn.addEventListener("click", () => setActiveView("calendar"));
if (viewMapBtn) viewMapBtn.addEventListener("click", () => setActiveView("map"));

calPrevBtn.addEventListener("click", () => {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    renderCalendar();
});

calNextBtn.addEventListener("click", () => {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    renderCalendar();
});

init();
