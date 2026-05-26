#!/bin/bash
# Failure-only macOS notifications for RVA Burlesque update jobs.
# Source this file then call: notify_error "Title" "Message" "/path/to/log"
# notify() is intentionally a no-op so success runs stay silent.

notify() {
    : # no-op (failure-only mode)
}

notify_error() {
    local title="$1"
    local message="$2"
    local log_file="$3"
    local open_arg=()
    if [ -n "$log_file" ]; then
        open_arg=(-open "file://$log_file")
    fi
    if command -v terminal-notifier >/dev/null 2>&1; then
        terminal-notifier \
            -title "$title" \
            -message "$message" \
            -group "rva-burlesque" \
            -sound Basso \
            "${open_arg[@]}" 2>/dev/null || true
    else
        # Fallback: AppleScript notification if terminal-notifier isn't installed
        osascript -e "display notification \"$message\" with title \"$title\" sound name \"Basso\"" 2>/dev/null || true
    fi
}
