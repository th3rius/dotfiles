#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');

let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
    const data = JSON.parse(input);
    const model = data.model.display_name;
    const dir = path.basename(data.workspace.current_dir);
    const cost = data.cost?.total_cost_usd || 0;
    const pct = Math.floor(data.context_window?.used_percentage || 0);
    const durationMs = data.cost?.total_duration_ms || 0;

    const CYAN = '\x1b[36m', YELLOW = '\x1b[33m', MAGENTA = '\x1b[35m', RESET = '\x1b[0m', WHITE = '\x1b[37m', DIM = '\x1b[2m';

    const fiveHourPct = data.rate_limits?.five_hour?.used_percentage ?? null;
    const sevenDayPct = data.rate_limits?.seven_day?.used_percentage ?? null;

    const candidates = [
        { label: 'ctx', value: pct },
        ...(fiveHourPct !== null ? [{ label: '5h', value: Math.floor(fiveHourPct) }] : []),
        ...(sevenDayPct !== null ? [{ label: '7d', value: Math.floor(sevenDayPct) }] : []),
    ];

    const worst = candidates.reduce((a, b) => b.value > a.value ? b : a);
    const barColor = worst.label === '7d' ? MAGENTA : worst.label === '5h' ? YELLOW : CYAN;
    const filled = Math.floor(worst.value / 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

    const totalMins = Math.floor(durationMs / 60000);
    const totalHours = Math.floor(totalMins / 60);
    const totalDays = Math.floor(totalHours / 24);
    const totalSecs = Math.floor(durationMs / 1000);
    let durationRaw;
    if (totalHours >= 24) {
        durationRaw = `${totalDays}d ${totalHours % 24}h`;
    } else if (totalMins >= 60) {
        durationRaw = `${totalHours}h ${totalMins % 60}m`;
    } else {
        durationRaw = `${totalMins}m ${totalSecs % 60}s`;
    }
    let branch = '';
    try {
        branch = execSync('git branch --show-current', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
        branch = branch ? ` | 🌿 ${branch}` : '';
    } catch {}

    console.log(`${CYAN}[${model}]${RESET} 📁 ${dir}${branch}`);
    console.log(`${barColor}${bar} ${WHITE}${worst.value}%${RESET} ${DIM}(${worst.label})${RESET} | ${YELLOW}$${cost.toFixed(2)}${RESET} | ⏱️ ${durationRaw}`);
});
