# Bank Command Center (demo)

A CEO cockpit for a fictional Egyptian bank with a head office (New Capital), 2 data centers (Smart Village, Borg El Arab) and 18 branches in 5 regions. The places are real; the bank and every figure are invented.

## Tabs
| Tab | What the CEO sees |
|---|---|
| Overview | Shaped by role (see Roles). Full view: 8-KPI scorecard with On track / Watch / Off track status: net profit vs budget, ROE, NIM, cost-to-income, CAR, LCR, NPL + coverage, deposits + market share. Also an attention panel with a rotating CEO brief, alerts and read-only operations tiles; an Egypt network map (Alerts / Growth / NPL modes, with a Greater Cairo inset); net profit vs budget; and a regions table. |
| Performance | Branch trend, deposits/loans/transactions drill-down, and a branch league table (deposits, YoY, loans, NPL, profit vs budget, C/I, customers, NPS, digital). |
| Risk & Capital | CAR, CET1, leverage, LCR, NSFR, NPL, coverage, cost of risk; bullet bars against the CBE minimums and internal targets; NPL trend and NPL by region; IFRS 9 stages; concentration; market & FX risk. Restricted to the CEO and Internal Audit. |
| Buildings | HVAC, electrical, UPS & generators, fire, water and BMS alarms (read-only). |
| Security & CCTV | Searchable camera grid, live view / playback (placeholders), offline alerts, incidents. |

To open the definition, owner, 12-month trend (with target/limit lines) and regional split for a KPI, click its tile. A region can be set from the Site filter, the Regions table, the Cairo cluster on the map, or a region row in a KPI drawer.
Status rules come from `LIMITS` in `data.js` as [hard limit, target]. Deposits are judged on market share bank-wide and on YoY growth (≥ 12% target, ≥ 8% floor) for a branch or region.

Motion: on load and on tab change, panels stagger in, numbers count up, bars grow, lines draw and map pins pop. Critical sites pulse. The tab indicator slides and themes cross-fade. Hover lifts KPI tiles, highlights panels, rows and pins, and zooms camera tiles. `prefers-reduced-motion` turns all of this off.
**All data, sites and camera images are SAMPLE DATA.** Nothing here is connected to a real bank system.

## Run
Double-click `start-dashboard.bat` → http://localhost:5187 (or open `index.html` directly).

## Files
- `js/data.js`: seeded sample model (`window.BK`): sites, roles, energy, balances/profit/transactions, BMS equipment, cameras, incidents. Demo anomalies are listed at the bottom of the equipment and camera sections.
- `js/charts.js`: small SVG chart kit (`window.CH`).
- `js/app.js`: tabs, filters, role-based access, drill-down drawers, camera viewer.
- `css/styles.css`: Dark / Hybrid / Light tokens (`body.theme-*`). Cards marked `.feat` / `.feat2` stay navy in Hybrid, as in the reference design.

## Roles (top bar → Role)
Regional and Branch Manager show a second picker (Region / Branch) next to Role; choosing one jumps the Site filter to that scope. The rule `R:<region>` covers that region's branches only, not the head office or data centers.

The dashboard only shows what the selected role may see. Tabs, KPI tiles, panels, alerts, branch rows and cameras outside the role are removed, not shown as locked, and the layout reflows.

| Role | Tabs | Overview | Banking | Live | Playback |
|---|---|---|---|---|---|
| CEO / Executive Committee | all 5 | 8 financial KPIs, ops tiles, map modes, profit, regions | all | all | all |
| Regional Manager (pick a region) | Overview, Performance, Buildings, Security & CCTV | 6 KPIs for the region (no CAR/LCR), map Alerts/Growth/NPL, profit, branch league table | branches in that region | branches in that region | none |
| Branch Manager (pick a branch) | Overview, Performance, Buildings, Security & CCTV | 6 branch KPIs (no CAR/LCR), ops tiles, tall profit panel | that branch | that branch | none |
| Internal Auditor | Overview, Performance, Risk & Capital, Buildings, Security & CCTV | as CEO | all | none | all |
| Security Officer | Overview, Buildings, Security & CCTV | 7 operations tiles, energy, cameras & recording | none | all | all |
| Facilities Engineer | Overview, Buildings | 5 operations tiles (incl. fire panels), energy, BMS alarms by system | none | none | none |

Footage views and denied attempts are logged for the session (shown in the camera viewer).
The BMS and CCTV controls (setpoints, start/stop, acknowledge, PTZ, export) are shown but disabled: the dashboard is read-only.

## Data freshness
- BMS polls every 10 s; the Tanta branch gateway is deliberately stale (17 min).
- The CCTV VMS heartbeat is every 5 s.
- Core banking balances come from the previous EOD close; transactions come from the 15-minute intraday feed.
- With a past "As of" date, period figures are historical, while alarms and cameras still show their live state.

## To connect real systems
Replace the generators in `data.js` with feeds that keep the same shapes, as listed below. Each feed must enforce the role rules on the server too; hiding data in the UI alone is not access control.

| Source | Feeds |
|---|---|
| BMS (BACnet/Modbus gateway or OPC UA) | `EQUIP` |
| Core banking or the data warehouse | `BANK`, `profitDay`, `txDay` |
| VMS API | `CAMS`, `INCIDENTS` |

## Intro
On load, `assets/intro.mp4` (copied from the PixVerse video in D:\banking) plays full-screen, muted and looping, under the title. **Enter dashboard** (or Enter / Space / Esc) fades it out and replays the dashboard entrance animation. Code: `js/intro.js`, styles under "intro video" in `css/styles.css`.
