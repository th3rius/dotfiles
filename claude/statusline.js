#!/usr/bin/env node
const { execFileSync } = require("child_process");
const path = require("path");

const C = {
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
};

const BAR_COLORS = { ctx: C.cyan, "5h": C.yellow, "7d": C.magenta };

// Highest usage among context window and rate limits; earlier entries win ties.
function worstUsage(data) {
  return [
    { label: "ctx", value: data.context_window?.used_percentage || 0 },
    { label: "5h", value: data.rate_limits?.five_hour?.used_percentage },
    { label: "7d", value: data.rate_limits?.seven_day?.used_percentage },
  ]
    .filter((c) => c.value != null)
    .map((c) => ({ ...c, value: Math.floor(c.value) }))
    .reduce((a, b) => (b.value > a.value ? b : a));
}

function usageBar({ label, value }) {
  const filled = Math.floor(value / 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);
  return `${BAR_COLORS[label]}${bar} ${C.white}${value}%${C.reset} ${C.dim}(${label})${C.reset}`;
}

function formatDuration(ms) {
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (hours >= 24) {
    return `${days}d ${hours % 24}h`;
  }

  if (mins >= 60) {
    return `${hours}h ${mins % 60}m`;
  }

  return `${mins}m ${secs % 60}s`;
}

function gitBranch() {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function render(data) {
  const model = data.model.display_name;
  const dir = path.basename(data.workspace.current_dir);
  const cost = data.cost?.total_cost_usd || 0;
  const duration = formatDuration(data.cost?.total_duration_ms || 0);
  const branch = gitBranch();

  console.log(
    `${C.cyan}[${model}]${C.reset} 📁 ${dir}${branch ? ` | 🌿 ${branch}` : ""}`,
  );
  console.log(
    `${usageBar(worstUsage(data))} | ${C.yellow}$${cost.toFixed(2)}${C.reset} | ⏱️ ${duration}`,
  );
}

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => render(JSON.parse(input)));
