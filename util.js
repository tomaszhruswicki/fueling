// Formatowanie, daty i drobne narzędzia DOM. Bez stanu aplikacji.
export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const r10 = x => Math.round(x / 10) * 10, r5 = x => Math.max(0, Math.round(x / 5) * 5);
export const fmt = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toFixed(d).replace(".", ",");
export const kfmt = x => { const v = r10(x); return Math.abs(v) >= 1000 ? String(v).replace(/(\d)(\d{3})$/, "$1 $2") : String(v); };
export const sgn = x => (x >= 0 ? "+" : "−") + kfmt(Math.abs(x));
export const lfmt = ml => fmt(ml / 1000, 1) + " l";
export const num = v => { const x = parseFloat(String(v).replace(",", ".")); return isFinite(x) ? x : null; };

export const parseD = s => new Date(s + "T12:00:00");
export const iso = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
export const todayISO = () => iso(new Date());
export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
export const addDays = (s, n) => iso(new Date(parseD(s).getTime() + n * 864e5));
export const dnum = s => { const d = parseD(s); return d.getDate() + "." + (d.getMonth() + 1); };
export const mondayOf = d => addDays(d, -((parseD(d).getDay() + 6) % 7)); // tydzień zawsze od poniedziałku
export const DOW = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb"];
export const DOWL = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];
export const DOWN = ["niedziele", "poniedziałki", "wtorki", "środy", "czwartki", "piątki", "soboty"];
