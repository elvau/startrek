<script lang="ts">
  import { i18n, locale, t, tn, type Key } from "../i18n/index.svelte";
  import { ideasDir } from "../plan";
  /*
   * Startseite bei jedem neuen Besuch (ein Neuladen im selben Tab bleibt in der Reise): Wohin geht's? Neue Reise, Reise zu einem Event, mit dem KI-Assistenten planen,
   * darunter die eigenen Reisen. Leere Entwürfe tauchen nicht auf.
   */
  import { app, openCompare, joinCompare, splitCompare, costless, deleteIf, deleteTrip, emptyTrips, homeTrips, openTrip, startTrip, sweepPristine, tripFor, type TripEntry } from "../store.svelte";
  import { eur } from "../calc";
  import { summarize, type TripState, type TripSummary } from "../overview";
  import { ensureAirports, geo } from "../geo/geo.svelte";
  import { tripRoute } from "../routeApp";
  import RouteMini from "./RouteMini.svelte";
  import { loadGeo } from "../geo/places";
  import { cloud, isCloud, votesOnce } from "../cloud/cloud.svelte";
  import { mergedVotes, variantPoll, variantStand, type Poll } from "../together";
  import { flagOf, range } from "../format";
  import { ccOf } from "../geo/places";
  import { bundle, isArchived, isBundle, pickedOf, variantLabel, type Bundle } from "../variants";
  import { openEventPlannerFresh } from "../event/open.svelte";
  import { openChat } from "../agent/open.svelte";
  import NewTripDialog from "./NewTripDialog.svelte";
  import RealityDialog from "./RealityDialog.svelte";
  import { shareIn, type Shared } from "../import/share.svelte";
  import AiMark from "./AiMark.svelte";
  import TopNav from "./TopNav.svelte";
  import AppFooter from "./AppFooter.svelte";
  // Reiseideen liegen neben der App (…/startrek/reise/, Englisch unter …/en/trip-ideas/)
  const BASE = (import.meta.env.BASE_URL as string) || "/";

  let picking = $state(false);
  let checking = $state(false);
  // aus dem Teilen-Menü (#457): gleich „Neue Reise → Importieren“ mit den geteilten Dateien
  let shared = $state<Shared | null>(null);
  $effect(() => { if (shareIn.v) { shared = shareIn.v; shareIn.v = null; picking = true; } });
  const today = new Date().toISOString().slice(0, 10);
  type Row = TripEntry & { s: TripSummary | null; route: ReturnType<typeof tripRoute> | null; cmp?: { id: string; title: string; chosen?: string; archived?: string }; label: string };
  const rows = $derived<Row[]>(homeTrips().map(m => {
    const tr = tripFor(m.id);
    // Zeitraum und Personen aus der Reise selbst (der Eintrag in der Liste kann älter sein)
    const fresh = tr ? { from: tr.from, to: tr.to, people: tr.travelers.filter(x => x.active !== false).length } : {};
    return { ...m, ...fresh, s: tr ? summarize(tr, today, geo, i18n.lang) : null, route: tr ? tripRoute(tr) : null, cmp: tr?.cmp, label: tr ? variantLabel(tr) : m.name };
  }));
  /*
   * Varianten eines Vergleichs als eine Kachel (#429), oben unter „Vergleiche“; die Reisen selbst bleiben zusätzlich als
   * eigene Kacheln in der Übersicht (mit Hinweis auf den Vergleich). Werte des Bündels: frühestes Datum, günstigster Preis.
   */
  type Unit = Row | Bundle<Row>;
  // Varianten im Bündel nach Namen (wie in der Reise, „Variante x von y“)
  const bundles = $derived<Bundle<Row>[]>(bundle(rows).filter(isBundle).map(u => ({ ...u, list: [...u.list].sort((a, b) => a.label.localeCompare(b.label, i18n.lang, { numeric: true })) })));
  const bundleOf = (r: Row) => (r.cmp ? bundles.find(b => b.cmp === r.cmp!.id) : undefined);
  /* Stand der Abstimmung über die Varianten (#432) je Zeile: liegt in einer Variante; Stimmen im Konto einmal lesen */
  const pollOf = (b: Bundle<Row>): { id: string; p: Poll } | undefined => {
    for (const v of b.list) { const tr = tripFor(v.id), p = tr ? variantPoll(tr) : undefined; if (p && !p.closed) return { id: v.id, p }; }
  };
  let tileVotes = $state<Record<string, Record<string, Record<string, Record<string, number>>>>>({});
  $effect(() => {
    for (const b of bundles) {
      const h = pollOf(b);
      if (h && isCloud(h.id) && !(h.id in tileVotes)) { tileVotes[h.id] = {}; void votesOnce(h.id).then(v => { tileVotes[h.id] = v; }); }
    }
  });
  function standOf(b: Bundle<Row>) {
    const h = pollOf(b);
    if (!h) return undefined;
    const remote = Object.fromEntries(Object.entries(tileVotes[h.id] || {}).map(([u, v]) => [u, v[h.p.id] || {}]).filter(([, x]) => Object.keys(x).length));
    return variantStand(h.p, mergedVotes(h.p, remote), tripFor(h.id) ?? undefined);
  }
  // archivierte Varianten (#433) nur in der Vergleichskachel
  const shown = $derived(rows.filter(r => !isArchived(r, r.cmp ? pickedOf(bundleOf(r)?.list || []) : undefined)));
  const all = (u: Unit) => (isBundle(u) ? u.list : [u]);
  const rowState = (r: Row): TripState => r.s?.state ?? (r.to && r.to < today ? "past" : "planned");
  const stateOf = (u: Unit): TripState => {
    const s = all(u).map(rowState);
    return s.includes("booked") ? "booked" : s.every(x => x === "past") ? "past" : s.includes("planned") ? "planned" : s[0];
  };
  const fromOf = (u: Unit) => all(u).map(r => r.from || "9999").sort()[0];
  const byDate = (dir: number) => (a: Unit, b: Unit) => dir * fromOf(a).localeCompare(fromOf(b));
  const editedOf = (u: Unit) => all(u).map(r => r.edited || "").sort().pop() || "";
  // Sortierung und Ansicht, je Gerät gemerkt
  type Sort = "next" | "recent" | "price" | "country";
  type View = "tiles" | "list";
  const K_VIEW = "rk-home-view";
  let pref: { sort: Sort; view: View } = { sort: "next", view: "tiles" };
  try { pref = { ...pref, ...JSON.parse(localStorage.getItem(K_VIEW) || "{}") }; } catch {}
  let sort = $state<Sort>(pref.sort), view = $state<View>(pref.view);
  $effect(() => { try { localStorage.setItem(K_VIEW, JSON.stringify({ sort, view })); } catch {} });
  const SORTS: Sort[] = ["next", "recent", "price", "country"];

  const price = (u: Unit) => Math.min(...all(u).map(r => r.s?.total || 0));
  /** Land der Reise; Rundreisen und Reisen ohne Land in eigenen Gruppen */
  const rowCountry = (r: Row) => (r.s?.round ? t("home.round") : r.s?.country || t("home.noCountry"));
  const countryOf = (u: Unit) => rowCountry(all(u)[0]);
  const keyOf = (u: Unit) => (isBundle(u) ? `cmp:${u.cmp}` : u.id);
  const groups = $derived.by(() => {
    // archivierte Varianten (#433) nur in der Vergleichskachel, nicht als eigene Kachel
    const rows = shown;
    const byState = (cmp: (a: Unit, b: Unit) => number, pastCmp = cmp) => [
      { k: "planned", title: t("home.planned"), list: rows.filter(r => stateOf(r) === "planned").sort(cmp) },
      { k: "booked", title: t("home.booked"), list: rows.filter(r => stateOf(r) === "booked").sort(cmp) },
      { k: "past", title: t("home.past"), list: rows.filter(r => stateOf(r) === "past").sort(pastCmp) }
    ];
    let out: { k: string; title: string; list: Unit[] }[];
    if (sort === "recent") out = [{ k: "recent", title: t("home.recent"), list: [...rows].sort((a, b) => editedOf(b).localeCompare(editedOf(a)) || byDate(1)(a, b)) }];
    else if (sort === "price") out = byState((a, b) => price(a) - price(b));
    else if (sort === "country") {
      const names = [...new Set(rows.map(countryOf))].sort((a, b) => a.localeCompare(b, i18n.lang));
      out = names.map(n => ({ k: `c:${n}`, title: n, list: rows.filter(r => countryOf(r) === n).sort((a, b) => Number(stateOf(a) === "past") - Number(stateOf(b) === "past") || byDate(1)(a, b)) }));
    } else out = byState(byDate(1), byDate(-1));
    const cmps: Unit[] = [...bundles].sort((a, b) => Number(stateOf(a) === "past") - Number(stateOf(b) === "past") || byDate(1)(a, b));
    return [{ k: "cmp", title: t("home.cmpGroup"), list: cmps }, ...out].filter(g => g.list.length);
  });
  // erste Gruppe mit offener Überschrift (Vergangene sind zugeklappt): dort steht „aufräumen“
  const firstOpen = $derived(groups.find(g => !(g.k === "past" && sort !== "country"))?.k);
  // Länder für Rundreisen: Weltdaten nur laden, wenn es Flüge gibt
  $effect(() => { if (rows.some(r => r.s && tripFor(r.id)?.items.some(i => i.cat === "flights"))) { loadGeo(geo, []); void ensureAirports().catch(() => {}); } });
  // Flaggen der Varianten
  $effect(() => { if (bundles.length) loadGeo(geo, []); });
  const flagFor = (r: Row) => { const cc = r.s?.country && geo.world.length ? ccOf(geo, r.s.country) : null; return cc ? flagOf(cc) : "📍"; };
  /** günstigste Variante (nur wenn mindestens zwei einen Preis haben) */
  const cheapest = (b: Bundle<Row>) => { const p = b.list.filter(r => (r.s?.total || 0) > 0); return p.length > 1 ? p.reduce((a, c) => (c.s!.total < a.s!.total ? c : a)).id : ""; };
  const sameDates = (b: Bundle<Row>) => b.list.every(r => r.from === b.list[0].from && r.to === b.list[0].to);
  // „in 12 Tagen“, „in 7 Monaten“, „morgen“
  function until(from: string): string {
    const d = Math.round((Date.parse(from + "T00:00:00Z") - Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z")) / 86400000);
    if (d < 0) return "";
    const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" });
    return d < 60 ? rtf.format(d, "day") : rtf.format(Math.round(d / 30.4), "month");
  }
  // zuletzt geöffnete Reise (bleibt im Hintergrund offen): oben direkt weiterplanen
  const last = $derived(rows.find(r => r.id === app.trip.id));
  const lastCmp = $derived(last?.cmp ? bundleOf(last) : undefined);
  function event() { startTrip(); openEventPlannerFresh(); }
  // unberührte Entwürfe beim Anzeigen der Startseite aufräumen; Reisen ohne Kosten nur nach Rückfrage
  $effect(() => { if (cloud.ready || !cloud.configured) sweepPristine(); });
  const empties = $derived(rows.length ? emptyTrips() : []);
  function cleanUp() {
    const names = empties.map(m => `• ${m.name || m.place || t("trip.untitled")}`).join("\n");
    if (!confirm(`${tn("home.cleanConfirm", empties.length)}\n\n${names}\n\n${t("tm.noUndo")}`)) return;
    // Konto-Reisen frisch prüfen: auf einem anderen Gerät befüllt → bleibt
    for (const m of empties) void deleteIf(m.id, costless).catch(e => console.warn(e));
  }
  /*
   * Reise auf eine andere ziehen (bzw. ⇆ und dann antippen, Handy/Tastatur): beide im selben Vergleich, auf einen
   * Vergleich gezogen kommt sie dazu. Nur eigene bzw. bearbeitbare Reisen; ein Vergleich als Ziel bleibt unverändert.
   */
  let dragId = $state<string | null>(null), over = $state<string | null>(null), pairing = $state<string | null>(null);
  const src = $derived(dragId || pairing);
  const editable = (r: TripEntry) => r.role !== "viewer";
  const canTake = (u: Unit, id: string | null) => !!id && (isBundle(u) ? !u.list.some(r => r.id === id) : u.id !== id && editable(u));
  const pickName = $derived(pairing ? rows.find(r => r.id === pairing)?.name || t("trip.untitled") : "");
  const drag = (id: string) => (e: DragEvent) => {
    dragId = id;
    if (e.dataTransfer) { e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "link"; }
  };
  const zone = (u: Unit) => ({
    ondragover: (e: DragEvent) => { if (canTake(u, dragId)) { e.preventDefault(); over = keyOf(u); } },
    ondragleave: (e: DragEvent) => { if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) over = over === keyOf(u) ? null : over; },
    ondrop: (e: DragEvent) => { e.preventDefault(); if (dragId && canTake(u, dragId)) void join(dragId, u); }
  });
  function endDrag() { dragId = null; over = null; }
  async function join(id: string, u: Unit) {
    endDrag(); pairing = null;
    const c = await joinCompare(id, isBundle(u) ? u.list[0].id : u.id).catch(e => { console.warn(e); return null; });
    if (c) openCompare(c);
  }
  function split(b: Bundle<Row>) {
    if (confirm(t("cmpv.splitQ", { title: b.title, n: b.list.length }))) void splitCompare(b.cmp).catch(e => console.warn(e));
  }
  /** Reise direkt von der Startseite löschen (bzw. verlassen, wenn sie jemand anderem gehört) */
  function remove(m: TripEntry, name: string, leave: boolean) {
    const q = leave ? t("tm.leaveConfirm", { name })
      : [t("tm.deleteConfirm", { name }), m.shared ? t("tm.deleteAll") : "", t("tm.noUndo")].filter(Boolean).join(" ");
    if (confirm(q)) deleteTrip(m.id).catch(e => console.warn(e));
  }
</script>

<svelte:window onkeydown={e => { if (e.key === "Escape") pairing = null; }} />
<TopNav home />
<section class="start" class:has-trips={rows.length > 0} data-ch="hero">
  <div class="home-in">
    <h1 class="home-title">{t("home.heading")}</h1>
    <p class="home-lead">{t("home.lead")}</p>

    {#if last}
      <button class="home-cont" onclick={() => openTrip(last.id, "Weiter planen")}>
        <span class="hc-l"><small>{t("home.continue")}</small><b>{last.cloud ? "☁ " : ""}{last.name || last.place || t("trip.untitled")}</b>
          <small>{[range(last.from, last.to), last.s?.total ? eur(last.s.total) : ""].filter(Boolean).join(" · ")}</small>
          {#if lastCmp}<small class="hc-cmp">⇆ {t("home.variantOf", { x: last.label, title: lastCmp.title, n: lastCmp.list.length })}</small>{/if}</span>
        <span class="hc-go" aria-hidden="true">→</span>
      </button>
    {/if}
    <div class="home-acts">
      <button class="home-act home-new" onclick={() => (picking = true)}>
        <span class="home-ico" aria-hidden="true">🧳</span><b>{t("home.new")}</b><small>{t("home.newSub")}</small>
      </button>
      <button class="home-act home-event" onclick={event}>
        <span class="home-ico" aria-hidden="true">🎟</span><b>{t("home.event")}</b><small>{t("home.eventSub")}</small>
      </button>
      {#if cloud.configured}
        <button class="home-act home-ai" onclick={openChat}>
          <span class="home-ico" aria-hidden="true"><AiMark /></span><b>{t("home.ai")}</b><small>{t("home.aiSub")}</small>
        </button>
      {/if}
      {#if cloud.configured}
        <!-- Realitätscheck (#461): Angebot einwerfen, ohne eine Reise anzulegen -->
        <button class="home-act home-check" onclick={() => (checking = true)}>
          <span class="home-ico" aria-hidden="true">🔍</span><b>{t("home.check")}</b><small>{t("home.checkSub")}</small>
        </button>
      {/if}
      <!-- Reiseideen (Inhaltsseiten /reise/): öffnen eine fertig gerechnete Reise, ersetzen die Beispielreise (#402) -->
      <a class="home-act home-ideas" href="{BASE}{ideasDir(i18n.lang)}">
        <span class="home-ico" aria-hidden="true">🧭</span><b>{t("home.ideas")}</b><small>{t("home.ideasSub")}</small>
      </a>
    </div>

    {#if rows.length > 1}
      <div class="home-tools">
        <div class="chips home-sort" role="group" aria-label={t("home.sortBy")}>
          {#each SORTS as k (k)}<button class="chip sm" class:on={sort === k} aria-pressed={sort === k} onclick={() => (sort = k)}>{t(`home.sort.${k}` as Key)}</button>{/each}
        </div>
        <div class="chips home-view" role="group" aria-label={t("home.view")}>
          <button class="chip sm" class:on={view === "tiles"} aria-pressed={view === "tiles"} onclick={() => (view = "tiles")} title={t("home.view.tiles")}>▦ <span class="hv-l">{t("home.view.tiles")}</span></button>
          <button class="chip sm" class:on={view === "list"} aria-pressed={view === "list"} onclick={() => (view = "list")} title={t("home.view.list")}>☰ <span class="hv-l">{t("home.view.list")}</span></button>
        </div>
      </div>
    {/if}

    {#snippet pickHere(u: Unit)}
      {#if pairing && canTake(u, pairing)}<button class="ht-pick" onclick={() => void join(pairing!, u)}><span>⇆ {t("home.pickHere")}</span></button>{/if}
    {/snippet}
    <!-- Vergleich (#429): eine Kachel, je Variante eine Zeile (öffnet die Reise) -->
    {#snippet cmpUnit(b: Bundle<Row>)}
      {@const f = b.list[0]}
      {@const low = cheapest(b)}
      {@const same = sameDates(b)}
      {@const pick = pickedOf(b.list)}
      {@const rest = b.list.filter(v => v.id !== pick?.id && !isArchived(v, pick))}
      {@const nArch = b.list.filter(v => isArchived(v, pick)).length}
      {@const st = standOf(b)}
      <div class="ht-wrap home-cmp-wrap" class:drop-ok={canTake(b, src)} class:drop-on={over === keyOf(b)} {...zone(b)}>
        <div class="home-trip home-cmp" class:past={stateOf(b) === "past"} class:as-row={view === "list"} data-cmp={b.cmp}>
          <span class="ht-top"><button class="hc-open" onclick={() => openCompare(b.cmp)}><b>{f.cloud ? "☁ " : ""}{b.title}</b></button><span class="hc-n">{tn("home.variants", b.list.length)}</span></span>
          <span class="ht-facts">
            {#if same && f.from}<span>📅 {range(f.from, f.to)}{f.s?.nights ? ` · ${tn("n.nights", f.s.nights)}` : ""}</span>{/if}
            {#if f.people}<span>👥 {tn("n.persons", f.people)}</span>{/if}
            {#if f.members?.length}<span class="ht-mem" title={f.members.join(", ")}>☁ {t("home.with", { names: f.members.length > 3 ? `${f.members.slice(0, 3).join(", ")} +${f.members.length - 3}` : f.members.join(", ") })}</span>{/if}
          </span>
          {#snippet varRow(v: Row)}
            <button class="hc-var" class:past={rowState(v) === "past"} class:win={pick?.id === v.id} draggable={editable(v)} ondragstart={drag(v.id)} ondragend={endDrag} onclick={() => openTrip(v.id, "Vergleich")}>
              <span class="hc-flag" aria-hidden="true">{flagFor(v)}</span>
              <span class="hc-l"><span class="hr-top"><b>{pick?.id === v.id ? "✓ " : ""}{v.label}</b>{#if rowState(v) === "booked"}<span class="ht-tag">✓</span>{:else if v.s?.ai}<span class="ht-ai" title={t("home.aiTag")}><AiMark title={t("home.aiTag")} /></span>{/if}</span>
                <small>{[v.s?.where, !same && v.from ? range(v.from, v.to) : ""].filter(Boolean).join(" · ")}</small>
                {#if st?.byTrip[v.id]}<small class="hc-votes">🗳 {t("cmpv.votesOf", { n: st.byTrip[v.id].for, of: st.voted })}{st.byTrip[v.id].veto ? ` · ✕ ${st.byTrip[v.id].veto}` : ""}</small>{/if}</span>
              <span class="hc-p num">{#if v.s && v.s.total > 0}<b>{eur(v.s.total)}</b>{/if}
                <small>{[(v.people || 0) > 1 && v.s && v.s.perPerson > 0 ? t("perPerson", { v: eur(v.s.perPerson) }) : "", v.id === low ? t("home.cheapest") : ""].filter(Boolean).join(" · ")}</small></span>
            </button>
          {/snippet}
          <!-- gewählt (#430): oben; die übrigen archiviert (#433), wiederherstellen in der Vergleichsansicht -->
          <div class="hc-vars">
            {#if pick}{@render varRow(pick)}{/if}
            {#each rest as v (v.id)}{@render varRow(v)}{/each}
          </div>
          {#if nArch}<button class="linkbtn hc-arch" onclick={() => openCompare(b.cmp)}>🗄 {tn("cmpv.archivedN", nArch)}</button>{/if}
          <span class="hc-foot">
            {#if b.list.some(editable)}<button class="linkbtn hc-split" onclick={() => split(b)}>✂ {t("cmpv.split")}</button>{/if}
            <button class="linkbtn hc-cmp-go" onclick={() => openCompare(b.cmp)}>{t("home.compare")} →</button>
          </span>
        </div>
        {@render pickHere(b)}
      </div>
    {/snippet}

    {#if pairing}
      <div class="home-pick" role="status"><span>⇆ {t("home.pickQ", { x: pickName })}</span><button class="btn sm" onclick={() => (pairing = null)}>{t("cancel")}</button></div>
    {/if}
    {#each groups as g (g.k)}
      {#snippet list()}
        <div class="home-trips" class:as-list={view === "list"}>
          {#each g.list as u (keyOf(u))}
            {#if isBundle(u)}
              {@render cmpUnit(u)}
            {:else}
            {@const m = u}
            {@const x = m.s}
            {@const nm = m.name || m.place || t("trip.untitled")}
            {@const leave = !!m.role && m.role !== "owner"}
            {@const isPast = stateOf(m) === "past"}
            {@const inCmp = bundleOf(m)}
            <div class="ht-wrap" class:drop-ok={canTake(m, src)} class:drop-on={over === m.id} class:dragging={dragId === m.id || pairing === m.id} {...zone(m)}>
            {#if view === "list"}
            <button class="home-row" class:past={isPast} draggable={editable(m)} ondragstart={drag(m.id)} ondragend={endDrag} title={editable(m) ? t("home.dragHint") : undefined} onclick={() => openTrip(m.id, "Liste")}>
              <span class="hr-name"><span class="hr-top"><b>{m.cloud ? "☁ " : ""}{nm}</b>{#if stateOf(m) === "booked"}<span class="ht-tag">✓</span>{:else if x?.ai}<span class="ht-ai" title={t("home.aiTag")}><AiMark title={t("home.aiTag")} /></span>{/if}{#if inCmp}<span class="ht-incmp">⇆ {inCmp.title}</span>{/if}</span>
                <small class="muted">{[x?.where, m.from ? range(m.from, m.to) : "", m.people ? tn("n.persons", m.people) : ""].filter(Boolean).join(" · ")}</small></span>
              <span class="hr-total num">{x && x.total > 0 ? eur(x.total) : ""}{#if x && (m.people || 0) > 1 && x.perPerson > 0}<small class="muted">{t("perPerson", { v: eur(x.perPerson) })}</small>{/if}</span>
            </button>
            {:else}
            <button class="home-trip" class:past={isPast} draggable={editable(m)} ondragstart={drag(m.id)} ondragend={endDrag} title={editable(m) ? t("home.dragHint") : undefined} onclick={() => openTrip(m.id, "Liste")}>
              {#if m.route && m.route.points.length > 2}<span class="ht-route" aria-hidden="true"><RouteMini route={m.route} w={280} h={96} /></span>{/if}
              {#if inCmp}<span class="ht-incmp">⇆ {t("home.inCmp", { title: inCmp.title })}</span>{/if}
              <span class="ht-top"><b>{m.cloud ? "☁ " : ""}{nm}</b>{#if g.k === "booked"}<span class="ht-tag">✓ {t("home.bookedTag")}</span>{:else if x?.ai}<span class="ht-ai" title={t("home.aiTag")}><AiMark title={t("home.aiTag")} /></span>{/if}</span>
              {#if x}
                {#if x.where}<span class="ht-where">{x.round ? `🔁 ${t("home.round")}: ` : "📍 "}{x.where}</span>{/if}
                {#if m.from}<span class="ht-when">📅 {range(m.from, m.to)}{x.nights ? ` · ${tn("n.nights", x.nights)}` : ""}{#if !isPast && until(m.from)} <span class="ht-soon">{until(m.from)}</span>{/if}</span>{/if}
                <span class="ht-facts">
                  {#if m.people}<span>👥 {tn("n.persons", m.people)}</span>{/if}
                  {#if m.members?.length}<span class="ht-mem" title={m.members.join(", ")}>☁ {t("home.with", { names: m.members.length > 3 ? `${m.members.slice(0, 3).join(", ")} +${m.members.length - 3}` : m.members.join(", ") })}</span>{/if}
                  <!-- Stand der Planung statt Essensstil: was steht schon, was fehlt noch -->
                  {#if !isPast}
                    <span class="ht-st st-{x.plan.flights}" title={t(`home.st.${x.plan.flights}`)}>✈ {t(`home.st.${x.plan.flights}`)}</span>
                    <span class="ht-st st-{x.plan.stay}" title={t(`home.st.${x.plan.stay}`)}>🛏 {t(`home.st.${x.plan.stay}`)}</span>
                  {/if}
                  {#if x.events}<span>🎟 {tn("n.events", x.events)}</span>{/if}
                </span>
                {#if x.total > 0 || x.potential > 0}<span class="ht-foot">
                  {#if x.total > 0}<span class="ht-total">{t("home.total", { v: eur(x.total) })}{#if (m.people || 0) > 1 && x.perPerson > 0} <small class="ht-pp">· {t("perPerson", { v: eur(x.perPerson) })}</small>{/if}</span>{/if}
                  {#if x.potential > 0}<span class="ht-save">↓ {t("home.save", { v: eur(x.potential) })}</span>{/if}
                </span>{/if}
              {:else}
                <small>{t("home.noDetails")}</small>
              {/if}
            </button>
            {/if}
            <button class="ht-del" title={leave ? t("home.leaveTrip", { name: nm }) : t("home.deleteTrip", { name: nm })} aria-label={leave ? t("home.leaveTrip", { name: nm }) : t("home.deleteTrip", { name: nm })} onclick={() => remove(m, nm, leave)}>{leave ? "⇥" : "🗑"}</button>
            {#if editable(m) && rows.length > 1}<button class="ht-cmp" title={t("home.cmpWith")} aria-label={t("home.cmpWith")} onclick={() => (pairing = m.id)}>⇆</button>{/if}
            {@render pickHere(m)}
            </div>
            {/if}
          {/each}
        </div>
      {/snippet}
      {#if g.k === "past" && sort !== "country"}
        <details class="home-past"><summary class="home-h">{g.title} <span class="muted">({g.list.length})</span></summary>{@render list()}</details>
      {:else}
        <h2 class="home-h">{g.title}
          <!-- leere Reisen aufräumen: als Bubble neben der ersten Überschrift -->
          {#if empties.length && g.k === firstOpen}<button class="home-clean" onclick={cleanUp}>🧹 {tn("home.clean", empties.length)}</button>{/if}
        </h2>
        {@render list()}
      {/if}
    {/each}

    {#if empties.length && !firstOpen}
      <p><button class="home-clean" onclick={cleanUp}>🧹 {tn("home.clean", empties.length)}</button></p>
    {/if}
    <AppFooter home />
  </div>
</section>

{#if checking}<RealityDialog onclose={() => (checking = false)} />{/if}
{#if picking}<NewTripDialog onclose={() => { picking = false; shared = null; }} mode={shared ? "import" : "blank"} shared={shared?.files} sharedText={shared?.text} sharedUrl={shared?.url} />{/if}

<style>
  .home-cmp-wrap { grid-column: 1 / -1; }
  .home-cmp-wrap .home-cmp { cursor: default; padding-inline-end: 18px; }
  .home-cmp:hover { transform: none; }
  .hc-n { font-size: 11.5px; font-weight: 700; color: var(--a); background: var(--a-soft); border-radius: 99px; padding: 2px 9px; white-space: nowrap; }
  .hc-vars { display: grid; width: 100%; margin-top: 4px; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
  .hc-var { display: flex; align-items: center; gap: 12px; width: 100%; text-align: start; padding: 10px 14px; background: transparent; border: 0; border-top: 1px solid var(--line); color: inherit; }
  .hc-var:first-child { border-top: 0; }
  .hc-var:hover, .hc-var:focus-visible { background: color-mix(in srgb, var(--a) 7%, transparent); }
  .hc-var.past { opacity: .75; }
  .hc-flag { flex: none; font-size: 22px; }
  .hc-l { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .hc-l small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hc-p { display: flex; flex-direction: column; align-items: flex-end; white-space: nowrap; }
  .hc-p b { font-size: 15px; font-weight: 800; }
  .hc-p small { font-size: 12px; }
  .hc-cmp { color: var(--a); font-weight: 600; }
  .hc-open { all: unset; cursor: pointer; }
  .hc-open:focus-visible { outline: 2px solid var(--a); border-radius: 6px; }
  .hc-var.win { background: color-mix(in srgb, var(--good) 9%, transparent); }
  .hc-votes { color: var(--idea); font-weight: 700; }
  .hc-arch { align-self: flex-start; font-size: 13px; color: var(--ink-2); padding: 4px 0; }
  .hc-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; width: 100%; }
  .hc-cmp-go { margin-inline-start: auto; padding: 0; font-weight: 700; }
  .hc-split { padding: 0; font-size: 13px; color: var(--ink-2); }
  .home-cmp.as-row { padding: 12px 14px; border-radius: 14px; }
  /* Reise auf eine andere ziehen bzw. ⇆ und antippen */
  .ht-cmp { position: absolute; top: 50px; inset-inline-end: 10px; width: 36px; height: 36px; border-radius: 10px; border: 1px solid transparent; background: transparent; font-size: 16px; line-height: 1; opacity: .55; color: var(--a); }
  .ht-cmp:hover, .ht-cmp:focus-visible { opacity: 1; background: var(--a-soft); }
  :global(.home-trips.as-list) .ht-cmp { top: 50%; transform: translateY(-50%); inset-inline-end: 50px; }
  .ht-incmp { align-self: flex-start; font-size: 11.5px; font-weight: 700; color: var(--a); background: var(--a-soft); border-radius: 99px; padding: 2px 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .ht-wrap:has(.ht-cmp) .home-row { padding-inline-end: 94px; }
  .ht-wrap.dragging { opacity: .55; }
  .ht-wrap.drop-ok { outline: 2px dashed color-mix(in srgb, var(--a) 45%, transparent); outline-offset: 3px; border-radius: 18px; }
  .ht-wrap.drop-on { outline: 2px solid var(--a); background: color-mix(in srgb, var(--a) 8%, transparent); }
  .ht-pick { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; border: 2px solid var(--a); border-radius: 18px; background: color-mix(in srgb, var(--a) 12%, transparent); color: var(--a); font-weight: 800; }
  .ht-pick span { background: var(--paper); border-radius: 99px; padding: 6px 14px; }
  .home-pick { position: sticky; top: 8px; z-index: 5; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 12px 0; padding: 10px 14px; border-radius: 14px; background: var(--a-soft); border: 1px solid var(--a); font-weight: 600; }
</style>
