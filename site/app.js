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
const filterCost = document.getElementById("filter-cost");
const filterType = document.getElementById("filter-type");
const filterLocation = document.getElementById("filter-location");
const viewListBtn = document.getElementById("view-list");
const viewCalendarBtn = document.getElementById("view-calendar");
const lastUpdatedEl = document.getElementById("last-updated");
const calMonthEl = document.getElementById("cal-month");
const calDaysEl = document.getElementById("cal-days");
const calPrevBtn = document.getElementById("cal-prev");
const calNextBtn = document.getElementById("cal-next");

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

function setupSubscribeLink() {
    const subscribeBtn = document.getElementById("subscribe-btn");
    const copyBtn = document.getElementById("copy-url-btn");
    const hint = document.getElementById("subscribe-hint");

    let basePath = window.location.pathname;
    if (basePath.endsWith("/")) {
        basePath = basePath.slice(0, -1);
    } else if (basePath.includes(".")) {
        basePath = basePath.replace(/\/[^/]*$/, "");
    }
    const calendarUrl = `${window.location.origin}${basePath}/data/calendar.ics`;
    const webcalUrl = calendarUrl.replace(/^https?:/, "webcal:");

    if (subscribeBtn) subscribeBtn.href = webcalUrl;

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
}

function eventMatchesFilters(event) {
    const costFilter = filterCost.value;
    const typeFilter = filterType.value;
    const locationFilter = filterLocation.value;

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

    renderList();
    renderCalendar();
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

filterCost.addEventListener("change", applyFilters);
filterType.addEventListener("change", applyFilters);
filterLocation.addEventListener("change", applyFilters);

viewListBtn.addEventListener("click", () => {
    viewListBtn.classList.add("active");
    viewListBtn.setAttribute("aria-selected", "true");
    viewCalendarBtn.classList.remove("active");
    viewCalendarBtn.setAttribute("aria-selected", "false");
    eventsList.classList.remove("hidden");
    eventsCalendar.classList.add("hidden");
});

viewCalendarBtn.addEventListener("click", () => {
    viewCalendarBtn.classList.add("active");
    viewCalendarBtn.setAttribute("aria-selected", "true");
    viewListBtn.classList.remove("active");
    viewListBtn.setAttribute("aria-selected", "false");
    eventsCalendar.classList.remove("hidden");
    eventsList.classList.add("hidden");
});

calPrevBtn.addEventListener("click", () => {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    renderCalendar();
});

calNextBtn.addEventListener("click", () => {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    renderCalendar();
});

init();
