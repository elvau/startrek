<script lang="ts">
  /*
   * Vorlieben bearbeiten: eigene (mit „Ich bin“) oder die einer Gruppe. Leere Felder heißen „keine Vorgabe“ bzw.
   * bei Gruppen „wie meine“. Gesperrte Länder einer Gruppe kommen zu den eigenen dazu.
   */
  import { untrack } from "svelte";
  import { i18n, t, type Key } from "../i18n/index.svelte";
  import { BOARDS, STYLES, type Prefs } from "../model";
  import { dir } from "../directory.svelte";
  import { geo } from "../geo/geo.svelte";
  import { loadGeo } from "../geo/places";
  import { cloud } from "../cloud/cloud.svelte";
  import { loadPlz } from "../plz";

  let { p, base }: { p: Prefs; base?: Prefs } = $props();
  const group = $derived(!!base);

  $effect(() => { void loadGeo(geo, []); });

  // Länder mit Namen in der Sprache der App
  const countries = $derived.by(() => {
    let dn: Intl.DisplayNames | null = null;
    try { dn = new Intl.DisplayNames([i18n.lang], { type: "region" }); } catch {}
    return geo.world.map(w => ({ k: w.k, name: dn?.of(w.k) || w.l })).sort((a, b) => a.name.localeCompare(b.name, i18n.lang));
  });
  const cname = (k: string) => countries.find(c => c.k === k)?.name || k;
  let q = $state("");
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const hits = $derived(q.trim().length < 2 ? [] : countries.filter(c => !(p.avoid || []).includes(c.k) && (norm(c.name).startsWith(norm(q.trim())) || c.k === q.trim().toUpperCase())).slice(0, 6));
  function addAvoid(k: string) { p.avoid = [...new Set([...(p.avoid || []), k])]; q = ""; }
  function removeAvoid(k: string) { p.avoid = (p.avoid || []).filter(x => x !== k); if (!p.avoid.length) delete p.avoid; }

  // Felder: leerer Wert entfernt die Vorgabe
  function set<K extends keyof Prefs>(k: K, v: Prefs[K] | undefined) { if (v == null || (v as unknown) === "") delete p[k]; else p[k] = v; }
  const num = (v: string) => (v === "" ? undefined : Number(v));
  const inh = (v: unknown, label?: string) => (group ? t("prefs.inherit", { v: v == null ? t("prefs.unset") : label ?? String(v) }) : t("prefs.unset"));

  // Eingabefeld startet mit den gespeicherten Codes, danach zählt das Getippte
  let aps = $state(untrack(() => (p.airports || []).join(", ")));
  // PLZ: Eingabe lokal puffern, erst bei 5 bekannten Ziffern speichern, leer löscht
  let plz = $state(untrack(() => p.plz ?? ""));
  let plzErr = $state(false);
  async function setPlz(v: string) {
    plz = v.trim(); plzErr = false;
    if (!plz) { set("plz", undefined); return; }
    if (!/^\d{5}$/.test(plz)) return;
    const known = (await loadPlz().catch(() => null))?.get(plz);
    if (plz !== v.trim()) return;
    if (known) set("plz", plz); else plzErr = true;
  }
  function setAps(v: string) {
    aps = v;
    const codes = [...new Set(v.toUpperCase().split(/[\s,;]+/).filter(c => /^[A-Z]{3}$/.test(c)))];
    set("airports", codes.length ? codes : undefined);
  }
  function toggleStyle(s: (typeof STYLES)[number]) {
    const cur = p.styles || [];
    set("styles", cur.includes(s) ? cur.filter(x => x !== s).length ? cur.filter(x => x !== s) : undefined : [...cur, s]);
  }
  function toggleMonth(m: number) {
    const cur = p.months || [];
    const next = cur.includes(m) ? cur.filter(x => x !== m) : [...cur, m].sort((a, b) => a - b);
    set("months", next.length ? next : undefined);
  }
  const monthName = (m: number) => new Date(2027, m - 1, 1).toLocaleDateString(i18n.lang, { month: "short" });
  const STATES = ["BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV", "NI", "NW", "RP", "SL", "SN", "ST", "SH", "TH"];
  const STATE_NAMES: Record<string, string> = { BW: "Baden-Württemberg", BY: "Bayern", BE: "Berlin", BB: "Brandenburg", HB: "Bremen", HH: "Hamburg", HE: "Hessen", MV: "Mecklenburg-Vorpommern", NI: "Niedersachsen", NW: "Nordrhein-Westfalen", RP: "Rheinland-Pfalz", SL: "Saarland", SN: "Sachsen", ST: "Sachsen-Anhalt", SH: "Schleswig-Holstein", TH: "Thüringen" };
</script>

<div class="prefs">
  <p class="muted small">{group ? t("prefs.groupHint") : t("prefs.hint")}</p>

  {#if !group}
    <label class="f">{t("prefs.me")}
      <select value={dir.me ?? ""} onchange={e => { const v = e.currentTarget.value; if (v) dir.me = v; else delete dir.me; }}>
        <option value="">{t("prefs.meNone")}</option>
        {#each dir.people as x (x.id)}<option value={x.id}>{x.first} {x.last}</option>{/each}
      </select>
    </label>
    <p class="muted small">{t("prefs.meHint")}</p>
  {/if}

  <div class="pr-sec">
    <span class="dlabel">{t("prefs.avoid")}</span>
    <p class="muted small">{t("prefs.avoidHint")}</p>
    <div class="chips">
      {#if group}{#each base?.avoid || [] as k (k)}<span class="chip on locked">{cname(k)}</span>{/each}{/if}
      {#each p.avoid || [] as k (k)}<button type="button" class="chip on" aria-label={t("prefs.remove", { name: cname(k) })} onclick={() => removeAvoid(k)}>{cname(k)} ×</button>{/each}
    </div>
    <label class="f plzf">
      <input bind:value={q} placeholder={t("prefs.avoidPh")} autocomplete="off" aria-label={t("prefs.avoidPh")} />
      {#if hits.length}<div class="sugg">{#each hits as c (c.k)}<button type="button" onclick={() => addAvoid(c.k)}>{c.name}</button>{/each}</div>{/if}
    </label>
  </div>

  <div class="pr-sec">
    <span class="dlabel">{t("prefs.flights")}</span>
    {#if !group && cloud.user}
      <label class="f plzf">{t("prefs.plz")}<input class="fs-plz" inputmode="numeric" maxlength="5" value={plz} oninput={e => setPlz(e.currentTarget.value)} placeholder={t("fs.plzPh")} />{#if plzErr} <small class="err">{t("fs.plzUnknown")}</small>{/if}</label>
      <p class="muted small">{t("prefs.plzHint")} {t("prefs.plzAccount")}</p>
    {/if}
    <div class="ed-row">
      <label class="f grow">{t("prefs.airports")}<input value={aps} oninput={e => setAps(e.currentTarget.value)} placeholder={group && base?.airports?.length ? base.airports.join(", ") : t("prefs.airportsPh")} /></label>
      <label class="f">{t("prefs.maxStops")}
        <select value={p.maxStops ?? ""} onchange={e => set("maxStops", num(e.currentTarget.value))}>
          <option value="">{inh(base?.maxStops)}</option>{#each [0, 1, 2] as n}<option value={n}>{n}</option>{/each}
        </select>
      </label>
    </div>
    <div class="ed-row">
      <label class="f">{t("prefs.bags")}
        <select value={p.bags == null ? "" : String(p.bags)} onchange={e => { const v = e.currentTarget.value; set("bags", v === "" ? undefined : v === "true"); }}>
          <option value="">{inh(base?.bags, base?.bags == null ? undefined : base.bags ? t("prefs.bagsYes") : t("prefs.bagsNo"))}</option>
          <option value="true">{t("prefs.bagsYes")}</option><option value="false">{t("prefs.bagsNo")}</option>
        </select>
      </label>
      <label class="f">{t("prefs.seats")}
        <select value={p.seatsTogether == null ? "" : String(p.seatsTogether)} onchange={e => { const v = e.currentTarget.value; set("seatsTogether", v === "" ? undefined : v === "true"); }}>
          <option value="">{inh(base?.seatsTogether, base?.seatsTogether == null ? undefined : base.seatsTogether ? t("prefs.seatsYes") : t("prefs.seatsNo"))}</option>
          <option value="true">{t("prefs.seatsYes")}</option><option value="false">{t("prefs.seatsNo")}</option>
        </select>
      </label>
      <label class="f">{t("prefs.maxHours")}<input class="n sm" type="number" min="1" max="48" value={p.maxHours ?? ""} placeholder={base?.maxHours ? String(base.maxHours) : ""} oninput={e => set("maxHours", num(e.currentTarget.value))} /></label>
      <label class="f">{t("prefs.access")}
        <select value={p.access ?? ""} onchange={e => set("access", (e.currentTarget.value || undefined) as Prefs["access"])}>
          <option value="">{inh(base?.access, base?.access ? t(`prefs.${base.access}` as Key) : undefined)}</option>
          <option value="car">{t("prefs.car")}</option><option value="train">{t("prefs.train")}</option>
        </select>
      </label>
    </div>
  </div>

  <div class="pr-sec">
    <span class="dlabel">{t("prefs.stay")}</span>
    <div class="ed-row">
      <label class="f">{t("st.type")}
        <select value={p.stayType ?? ""} onchange={e => set("stayType", (e.currentTarget.value || undefined) as Prefs["stayType"])}>
          <option value="">{inh(base?.stayType)}</option>
          <option value="whole">{t("st.whole")}</option><option value="hotel">{t("st.hotel")}</option><option value="all">{t("prefs.anyType")}</option>
        </select>
      </label>
      <label class="f">{t("prefs.minStars")}
        <select value={p.minStars ?? ""} onchange={e => set("minStars", num(e.currentTarget.value))}>
          <option value="">{inh(base?.minStars)}</option>{#each [2, 3, 4, 5] as n}<option value={n}>{"★".repeat(n)}</option>{/each}
        </select>
      </label>
      <label class="f">{t("board.title")}
        <select value={p.board ?? ""} onchange={e => set("board", (e.currentTarget.value || undefined) as Prefs["board"])}>
          <option value="">{inh(base?.board, base?.board ? t(`board.${base.board}` as Key) : undefined)}</option>
          {#each BOARDS as b}<option value={b}>{t(`board.${b}` as Key)}</option>{/each}
        </select>
      </label>
    </div>
  </div>

  <div class="pr-sec">
    <span class="dlabel">{t("prefs.style")}</span>
    <div class="chips">
      {#each STYLES as s}<button type="button" class="chip" class:on={p.styles?.includes(s)} aria-pressed={!!p.styles?.includes(s)} onclick={() => toggleStyle(s)}>{t(`prefs.s.${s}` as Key)}</button>{/each}
    </div>
    <div class="ed-row">
      <label class="f">{t("prefs.budget")}
        <select value={p.budget ?? ""} onchange={e => set("budget", (e.currentTarget.value || undefined) as Prefs["budget"])}>
          <option value="">{inh(base?.budget, base?.budget ? t(`prefs.b.${base.budget}` as Key) : undefined)}</option>
          {#each ["low", "mid", "high"] as b}<option value={b}>{t(`prefs.b.${b}` as Key)}</option>{/each}
        </select>
      </label>
    </div>
    <label class="f">{t("prefs.note")}<textarea rows="2" maxlength="300" value={p.note ?? ""} placeholder={t("prefs.notePh")} oninput={e => set("note", e.currentTarget.value.trim() ? e.currentTarget.value : undefined)}></textarea></label>
  </div>

  <div class="pr-sec">
    <span class="dlabel">{t("prefs.times")}</span>
    <div class="ed-row">
      <label class="f">{t("prefs.holidays")}
        <select value={p.holidays ?? ""} onchange={e => set("holidays", e.currentTarget.value || undefined)}>
          <option value="">{inh(base?.holidays, base?.holidays ? STATE_NAMES[base.holidays] : undefined)}</option>
          {#each STATES as s}<option value={s}>{STATE_NAMES[s]}</option>{/each}
        </select>
      </label>
      <label class="f">{t("prefs.nights")}
        <span class="in-row">
          <input class="n sm" type="number" min="1" max="60" value={p.nightsMin ?? ""} placeholder={base?.nightsMin ? String(base.nightsMin) : ""} oninput={e => set("nightsMin", num(e.currentTarget.value))} />
          –
          <input class="n sm" type="number" min="1" max="60" value={p.nightsMax ?? ""} placeholder={base?.nightsMax ? String(base.nightsMax) : ""} oninput={e => set("nightsMax", num(e.currentTarget.value))} />
        </span>
      </label>
    </div>
    <span class="muted small">{t("prefs.months")}</span>
    <div class="chips">
      {#each Array.from({ length: 12 }, (_, i) => i + 1) as m}<button type="button" class="chip sm" class:on={p.months?.includes(m)} aria-pressed={!!p.months?.includes(m)} onclick={() => toggleMonth(m)}>{monthName(m)}</button>{/each}
    </div>
  </div>
</div>
