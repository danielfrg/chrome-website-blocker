const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

export function isScheduleActive(window, now) {
  if (!window) return false;
  const day = now.getDay(),
    previousDay = (day + 6) % 7;
  const minute = now.getHours() * 60 + now.getMinutes();
  const start = minutes(window.start),
    end = minutes(window.end);
  return start < end
    ? window.days.includes(day) && minute >= start && minute < end
    : (window.days.includes(day) && minute >= start) ||
        (window.days.includes(previousDay) && minute < end);
}

export function isSiteBlocked(site, config, now) {
  return (
    site.mode === "block" || (site.mode === "schedule" && isScheduleActive(config.schedule, now))
  );
}

export function isBlocking(config, now) {
  return config.sites.some((site) => isSiteBlocked(site, config, now));
}

export function nextTransition(config, now) {
  if (!config.schedule || !config.sites.some((s) => s.mode === "schedule")) return null;
  const active = isScheduleActive(config.schedule, now);
  const first = Math.floor(now.getTime() / 60000) * 60000 + 60000;
  // Actual minutes preserve local wall-clock behavior across daylight-saving folds and gaps.
  for (let time = first; time <= now.getTime() + 8 * 86400000; time += 60000) {
    const candidate = new Date(time);
    if (isScheduleActive(config.schedule, candidate) !== active) return candidate;
  }
  return null;
}
