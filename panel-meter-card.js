/*
 * panel-meter-card.js
 * A Home Assistant Lovelace card that looks like a DIN/panel multifunction meter LCD
 * (blue seven-segment digits, bar graphs, kWh counter, orange buttons).
 *
 * Install:
 *   1. Copy this file to /config/www/panel-meter-card.js
 *   2. Settings > Dashboards > ⋮ > Resources > Add:  /local/panel-meter-card.js?v=1  (JavaScript module)
 *   3. Add a card:  type: custom:panel-meter-card   (see example YAML at the bottom of this file)
 *
 * Buttons:  MENU = open history of the first value on the page
 *           ▲ / ▼ = previous / next page
 *           ⟳     = auto-cycle pages on/off
 */

const SEGS = {
  a: "3,1 17,1 15,5 5,5",
  b: "19,3 19,17 15,15 15,7",
  c: "19,19 19,33 15,29 15,21",
  d: "5,31 15,31 17,35 3,35",
  e: "1,19 5,21 5,29 1,33",
  f: "1,3 5,7 5,15 1,17",
  g: "4,18 6,16 14,16 16,18 14,20 6,20",
};
const GLYPHS = {
  "0": "abcdef", "1": "bc", "2": "abdeg", "3": "abcdg", "4": "bcfg",
  "5": "acdfg", "6": "acdefg", "7": "abc", "8": "abcdefg", "9": "abcdfg",
  "-": "g", " ": "", "E": "adefg", "r": "eg", "o": "cdeg",
};

/* Draw a string of seven-segment digits. '.' attaches a decimal point to the previous digit. */
function segText(str, x, y, s, ghost = true) {
  const chars = [];
  for (const ch of String(str)) {
    if (ch === "." && chars.length) chars[chars.length - 1].dp = true;
    else chars.push({ ch, dp: false });
  }
  let out = "";
  chars.forEach((c, i) => {
    const on = GLYPHS[c.ch] ?? "";
    let g = "";
    for (const k of "abcdefg") {
      if (on.includes(k)) g += `<polygon class="on" points="${SEGS[k]}"/>`;
      else if (ghost) g += `<polygon class="off" points="${SEGS[k]}"/>`;
    }
    g += `<circle class="${c.dp ? "on" : ghost ? "off" : "none"}" cx="21.3" cy="33.6" r="1.9"/>`;
    out += `<g transform="translate(${x + i * 24 * s},${y}) scale(${s}) skewX(-5)">${g}</g>`;
  });
  return out;
}

/* Fit a number into a fixed number of digit positions. */
function fitNumber(val, digits, decimals) {
  if (val === null || isNaN(val)) return "-".repeat(digits);
  for (let d = decimals; d >= 0; d--) {
    const s = val.toFixed(d);
    if (s.replace(/[.-]/g, "").length <= digits) {
      const len = s.replace(".", "").length;
      return " ".repeat(digits - len) + s;
    }
  }
  return "E".padEnd(digits, "-").slice(0, digits);
}

class PanelMeterCard extends HTMLElement {
  setConfig(config) {
    if (!config.pages || !config.pages.length) throw new Error("Add at least one entry under 'pages:'");
    this._config = {
      brand: "METER",
      model: "PM 1",
      energy_digits: 10,
      energy_decimals: 1,
      energy_label: "IN",
      energy_unit: "kWh",
      cycle_seconds: 6,
      panel: true,
      ...config,
    };
    this._page = 0;
    this._auto = !!config.auto_cycle;
    this._built = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) this._build();
    this._renderLcd();
  }

  getCardSize() { return 7; }

  connectedCallback() { this._setTimer(); }
  disconnectedCallback() { clearInterval(this._timer); this._timer = null; }

  _setTimer() {
    clearInterval(this._timer);
    this._timer = null;
    if (this._auto && this.isConnected) {
      this._timer = setInterval(() => this._step(1), this._config.cycle_seconds * 1000);
    }
  }

  _step(dir) {
    const n = this._config.pages.length;
    this._page = (this._page + dir + n) % n;
    this._renderLcd();
  }

  _num(entity, mult = 1) {
    const st = this._hass?.states?.[entity];
    if (!st) return null;
    const v = parseFloat(st.state);
    return isNaN(v) ? null : v * mult;
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    const ev = new Event("hass-more-info", { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }

  _build() {
    const c = this._config;
    this.innerHTML = `
      <ha-card class="${c.panel ? "panel" : "plain"}">
        <style>
          ha-card{display:block;overflow:hidden}
          ha-card.panel{background:
              radial-gradient(circle at 30% 20%,rgba(255,255,255,.18),transparent 60%),
              repeating-radial-gradient(circle at 3px 3px,rgba(0,0,0,.05) 0 1px,transparent 1px 4px),
              ${c.panel_color || "#e8681f"};
            padding:18px;}
          ha-card.plain{padding:12px;}
          .meter{background:linear-gradient(#e4e7e2,#d3d7d1);border-radius:6px;padding:12px 16px 14px;
            box-shadow:0 0 0 2px #c9ccc6,0 3px 8px rgba(0,0,0,.35);max-width:520px;margin:0 auto;font-family:Arial,Helvetica,sans-serif}
          .hdr{display:flex;align-items:center;gap:8px}
          .brand{background:#e2401c;color:#fff;font-weight:700;font-size:15px;padding:1px 7px;border-radius:2px;letter-spacing:.3px;white-space:nowrap}
          .dots{flex:1;height:8px;background:radial-gradient(circle,#e8582e 0 3px,transparent 3.5px) 0 0/14px 8px repeat-x}
          .model{font-weight:700;font-size:13px;color:#222;margin:2px 0 8px}
          .win{background:#111;padding:10px;border-radius:2px}
          .lcd{display:block;width:100%;height:auto;border-radius:1px;
            background:radial-gradient(ellipse at 50% 40%,#f4f8ff,#dde7f5 70%,#cdd9ec)}
          .lcd .on{fill:#2b2a9c}
          .lcd .off{fill:#2b2a9c;opacity:.06}
          .lcd .none{display:none}
          .lcd text{fill:#2b2a9c;font-family:Arial,Helvetica,sans-serif;font-weight:700}
          .btns{display:flex;justify-content:space-between;background:#151515;padding:9px 12px;margin-top:14px;border-radius:2px}
          .btns button{width:21%;aspect-ratio:1.25;border:3px solid #e9ebe7;border-radius:3px;cursor:pointer;
            background:linear-gradient(#f2562b,#d93e17);color:#fff;font-weight:700;font-size:clamp(11px,3.2vw,17px);
            display:flex;align-items:center;justify-content:center;padding:0;box-shadow:inset 0 -3px 0 rgba(0,0,0,.18)}
          .btns button:active{transform:translateY(1px);box-shadow:none;filter:brightness(.92)}
          .btns button.lit{outline:2px solid #fff;outline-offset:-6px}
          .btns svg{width:42%;height:auto;fill:#fff}
          .ir{display:flex;justify-content:center;align-items:center;gap:22px;margin-top:10px;font-size:11px;font-weight:700;color:#222}
          .ir span.h{width:9px;height:9px;border-radius:50%;background:#9a9d98;box-shadow:inset 0 1px 2px #000}
          .ir span.w{width:34px;height:12px;background:#222;border-radius:1px}
        </style>
        <div class="meter">
          <div class="hdr"><span class="brand">${c.brand}</span><span class="dots"></span></div>
          <div class="model">${c.model}</div>
          <div class="win"><svg class="lcd" viewBox="0 0 400 252"></svg></div>
          <div class="btns">
            <button data-b="menu" title="History">MENU</button>
            <button data-b="up" title="Previous page"><svg viewBox="0 0 20 12"><polygon points="10,0 20,12 0,12"/></svg></button>
            <button data-b="down" title="Next page"><svg viewBox="0 0 20 12"><polygon points="0,0 20,0 10,12"/></svg></button>
            <button data-b="cycle" title="Auto cycle"><svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 0 1 7.4 5H22l-3.5 4.5L15 9h2.2A6 6 0 0 0 6.3 9.7L4.6 8.6A8 8 0 0 1 12 4zm0 16a8 8 0 0 1-7.4-5H2l3.5-4.5L9 15H6.8a6 6 0 0 0 10.9-.7l1.7 1.1A8 8 0 0 1 12 20z"/></svg></button>
          </div>
          ${c.show_ir === false ? "" : `<div class="ir"><span class="h"></span><span>IR<br><span class="w" style="display:block"></span></span><span class="h"></span></div>`}
        </div>
      </ha-card>`;
    this._lcd = this.querySelector(".lcd");
    this.querySelectorAll(".btns button").forEach((b) =>
      b.addEventListener("click", () => {
        const k = b.dataset.b;
        if (k === "up") this._step(-1);
        else if (k === "down") this._step(1);
        else if (k === "menu") {
          const cell = (this._config.pages[this._page].cells || [])[0];
          this._moreInfo(cell?.entity || this._config.energy);
        } else if (k === "cycle") {
          this._auto = !this._auto;
          this._setTimer();
          this._renderLcd();
        }
      })
    );
    this._built = true;
  }

  _renderLcd() {
    if (!this._lcd || !this._hass) return;
    const c = this._config;
    const page = c.pages[this._page];
    const digits = page.digits ?? 4;
    const dec = page.decimals ?? 1;
    const s = 1.6;
    const cellW = digits * 24 * s;
    let svg = "";

    // unit (top-left) and page indicator
    svg += `<text x="10" y="28" font-size="22">${page.unit ?? ""}</text>`;
    if (c.pages.length > 1)
      svg += `<text x="390" y="20" font-size="10" text-anchor="end">${this._page + 1}/${c.pages.length}${this._auto ? "  AUTO" : ""}</text>`;

    const pos = [
      { x: 36, y: 40, side: "L" }, { x: 362 - cellW, y: 40, side: "R" },
      { x: 36, y: 130, side: "L" }, { x: 362 - cellW, y: 130, side: "R" },
    ];

    (page.cells || []).slice(0, 4).forEach((cell, i) => {
      const p = pos[i];
      const v = this._num(cell.entity, cell.multiply ?? 1);
      svg += `<g style="cursor:pointer" data-e="${cell.entity}">`;
      svg += `<rect x="${p.x - 30}" y="${p.y - 4}" width="${cellW + 62}" height="84" fill="transparent"/>`;
      svg += segText(fitNumber(v, cell.digits ?? digits, cell.decimals ?? dec), p.x, p.y, s);

      const lx = p.side === "L" ? 10 : p.x + cellW + 4;
      if (cell.top) svg += `<text x="${lx}" y="${p.y + 16}" font-size="14">${cell.top}</text>`;
      if (cell.bottom) svg += `<text x="${lx}" y="${p.y + 56}" font-size="14">${cell.bottom}</text>`;

      // bar graph: 10 dashes, filled by value / max
      const max = cell.max ?? page.max;
      if (max) {
        const frac = v === null ? 0 : Math.max(0, Math.min(1, Math.abs(v) / max));
        const n = Math.round(frac * 10);
        const bw = 12, gap = 2.6, by = p.y + 66;
        const bx = p.x - 8;
        for (let k = 0; k < 10; k++)
          svg += `<rect x="${bx + k * (bw + gap)}" y="${by}" width="${bw}" height="5" rx="2.5" class="${k < n ? "on" : "off"}"/>`;
        svg += `<text x="${bx + 10 * (bw + gap) + 4}" y="${by + 6}" font-size="10">${v === null ? "--" : Math.round(frac * 100)}%</text>`;
      }
      svg += `</g>`;
    });

    // energy counter
    if (c.energy) {
      const e = this._num(c.energy, c.energy_multiply ?? 1);
      let str;
      if (e === null) str = "-".repeat(c.energy_digits);
      else {
        const fixed = e.toFixed(c.energy_decimals);
        const [ip, fp] = fixed.split(".");
        const intDigits = c.energy_digits - c.energy_decimals;
        str = ip.length > intDigits ? ip.slice(-intDigits) : ip.padStart(intDigits, "0");
        if (fp) str += "." + fp;
      }
      const es = 0.85;
      const ew = c.energy_digits * 24 * es;
      const ex = 300 - ew - 6;
      svg += `<g style="cursor:pointer" data-e="${c.energy}">`;
      svg += `<rect x="${ex}" y="210" width="${ew + 100}" height="36" fill="transparent"/>`;
      svg += segText(str, ex, 213, es);
      if (c.energy_label)
        svg += `<rect x="304" y="212" width="${c.energy_label.length * 9 + 6}" height="15" class="on"/>` +
               `<text x="307" y="224" font-size="12" style="fill:#e9f0fb">${c.energy_label}</text>`;
      svg += `<text x="304" y="244" font-size="14">${c.energy_unit}</text></g>`;
    }

    this._lcd.innerHTML = svg;
    this._lcd.querySelectorAll("g[data-e]").forEach((g) =>
      g.addEventListener("click", () => this._moreInfo(g.dataset.e))
    );
    this.querySelector('[data-b="cycle"]')?.classList.toggle("lit", this._auto);
  }

  static getStubConfig() {
    return {
      brand: "METER",
      model: "PM 1",
      energy: "sensor.meter_energy_import",
      pages: [{
        unit: "V", max: 460, cells: [
          { entity: "sensor.meter_voltage_l1_l2", top: "L1", bottom: "L2" },
          { entity: "sensor.meter_voltage_l2_l3", top: "L2", bottom: "L3" },
          { entity: "sensor.meter_voltage_l3_l1", top: "L3", bottom: "L1" },
          { entity: "sensor.meter_voltage_avg", bottom: "eqv" },
        ],
      }],
    };
  }
}

const PMC_VERSION = "1.0.0";
console.info(`%c PANEL-METER-CARD %c v${PMC_VERSION} `, "background:#e2401c;color:#fff", "");
if (!customElements.get("panel-meter-card")) customElements.define("panel-meter-card", PanelMeterCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "panel-meter-card",
  name: "Panel Meter Card",
  description: "Multifunction panel meter look-alike: LCD digits, bar graphs, kWh counter, page buttons.",
});

/* ---------------- Example card YAML ----------------
type: custom:panel-meter-card
brand: Hamlet
model: DMG 6
energy: sensor.meter_energy_import        # kWh counter on the bottom line
energy_label: IN
auto_cycle: false                         # ⟳ button toggles this
cycle_seconds: 6
pages:
  - unit: V                               # line-to-line voltage (like the photo)
    max: 460
    cells:
      - { entity: sensor.meter_voltage_l1_l2, top: L1, bottom: L2 }
      - { entity: sensor.meter_voltage_l2_l3, top: L2, bottom: L3 }
      - { entity: sensor.meter_voltage_l3_l1, top: L3, bottom: L1 }
      - { entity: sensor.meter_voltage_ll_avg, bottom: eqv }
  - unit: V                               # phase-to-neutral
    max: 265
    cells:
      - { entity: sensor.meter_voltage_l1, top: L1, bottom: N }
      - { entity: sensor.meter_voltage_l2, top: L2, bottom: N }
      - { entity: sensor.meter_voltage_l3, top: L3, bottom: N }
      - { entity: sensor.meter_voltage_ln_avg, bottom: eqv }
  - unit: A
    max: 100                              # set to your CT / breaker rating
    cells:
      - { entity: sensor.meter_current_l1, top: L1 }
      - { entity: sensor.meter_current_l2, top: L2 }
      - { entity: sensor.meter_current_l3, top: L3 }
      - { entity: sensor.meter_current_n, top: N }
  - unit: kW
    max: 70
    decimals: 2
    cells:
      - { entity: sensor.meter_power_l1, top: L1, multiply: 0.001 }   # use multiply if the sensor is in W
      - { entity: sensor.meter_power_l2, top: L2, multiply: 0.001 }
      - { entity: sensor.meter_power_l3, top: L3, multiply: 0.001 }
      - { entity: sensor.meter_power_total, bottom: "Σ", multiply: 0.001 }
  - unit: PF / Hz
    cells:
      - { entity: sensor.meter_pf_l1, top: PF, bottom: L1, decimals: 2 }
      - { entity: sensor.meter_pf_l2, top: PF, bottom: L2, decimals: 2 }
      - { entity: sensor.meter_pf_l3, top: PF, bottom: L3, decimals: 2 }
      - { entity: sensor.meter_frequency, bottom: Hz, decimals: 2 }
------------------------------------------------------ */
