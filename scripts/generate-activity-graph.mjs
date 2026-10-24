import { mkdir, writeFile } from "node:fs/promises";

const token = process.env.GITHUB_TOKEN;
const login = process.env.GITHUB_LOGIN;
if (!token || !login) throw new Error("GITHUB_TOKEN and GITHUB_LOGIN are required");

const end = new Date();
end.setUTCHours(23, 59, 59, 999);
const start = new Date(end);
start.setUTCDate(start.getUTCDate() - 30);
start.setUTCHours(0, 0, 0, 0);

const query = `
  query($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": `${login}-profile-activity-graph`,
  },
  body: JSON.stringify({
    query,
    variables: { login, from: start.toISOString(), to: end.toISOString() },
  }),
});

if (!response.ok) throw new Error(`GitHub GraphQL request failed: ${response.status}`);
const payload = await response.json();
if (payload.errors) throw new Error(JSON.stringify(payload.errors));

const days = payload.data.user.contributionsCollection.contributionCalendar.weeks
  .flatMap((week) => week.contributionDays)
  .filter((day) => day.date >= start.toISOString().slice(0, 10))
  .slice(-31);

const width = 880;
const height = 260;
const left = 48;
const right = 18;
const top = 48;
const bottom = 42;
const plotWidth = width - left - right;
const plotHeight = height - top - bottom;
const maxCount = Math.max(1, ...days.map((day) => day.contributionCount));
const point = (day, index) => {
  const x = left + (index * plotWidth) / Math.max(1, days.length - 1);
  const y = top + plotHeight - (day.contributionCount / maxCount) * plotHeight;
  return { x, y, ...day };
};
const points = days.map(point);
const path = points.map((p, index) => `${index ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
const area = points.length
  ? `M ${points[0].x.toFixed(1)} ${(top + plotHeight).toFixed(1)} L ${points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")} L ${points.at(-1).x.toFixed(1)} ${(top + plotHeight).toFixed(1)} Z`
  : "";
const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
  const y = top + plotHeight - ratio * plotHeight;
  const value = Math.round(ratio * maxCount);
  return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="grid"/><text x="${left - 9}" y="${y + 4}" class="label" text-anchor="end">${value}</text>`;
}).join("");
const dateLabels = points.filter((_, index) => index % 5 === 0 || index === points.length - 1).map((p) => {
  const label = new Date(`${p.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `<text x="${p.x}" y="${height - 16}" class="label" text-anchor="middle">${label}</text>`;
}).join("");
const circles = points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3.2"><title>${p.date}: ${p.contributionCount} contributions</title></circle>`).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">Kouki's GitHub Activity Graph</title>
<desc id="desc">Daily GitHub contribution counts for the last 31 days.</desc>
<style>
  :root { color-scheme: light dark; --text:#24292f; --muted:#57606a; --grid:#d0d7de; --line:#2da44e; --fill:#2da44e22; }
  @media (prefers-color-scheme: dark) { :root { --text:#c9d1d9; --muted:#8b949e; --grid:#30363d; --line:#3fb950; --fill:#3fb95022; } }
  text { font: 12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; fill:var(--text); }
  .title { font-size:16px; font-weight:600; } .label { fill:var(--muted); }
  .grid { stroke:var(--grid); stroke-width:1; } .area { fill:var(--fill); }
  .line { fill:none; stroke:var(--line); stroke-width:2.5; stroke-linejoin:round; stroke-linecap:round; }
  circle { fill:var(--line); stroke:var(--line); }
</style>
<text x="${left}" y="24" class="title">Kouki's GitHub Activity Graph</text>
${grid}
<path d="${area}" class="area"/>
<path d="${path}" class="line"/>
${circles}
${dateLabels}
</svg>
`;

await mkdir("assets", { recursive: true });
await writeFile("assets/activity-graph.svg", svg, "utf8");
