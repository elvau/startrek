<script module lang="ts">
  import { t, tn } from "../i18n/index.svelte";
  import { addGroup, addPerson, dir, fullName, travelersFrom } from "../directory.svelte";
  import { animalEmoji, animalName, groupTravelers, nextAnimal, placeholderTravelers, soloTraveler } from "../placeholders";
  import { addToNew, dropFromNew, toggleSavedGroup, togglePicked, whoCount, type Who, type WhoMode, type WhoSrc } from "../who";
  import type { Traveler } from "../model";
  import { cloud } from "../cloud/cloud.svelte";

  export type { Who };
  /**
   * Wer man selbst ist: die Person „Das bin ich“ aus den Vorlieben, sonst der Name des Kontos (Vorname, Rest als
   * Familienname); ohne beides null, dann plant man als Tier.
   */
  export function meName(): { first: string; last: string; personId?: string } | null {
    const p = dir.me ? dir.people.find(x => x.id === dir.me) : undefined;
    if (p) return { first: p.first, last: p.last || p.first, personId: p.id };
    const n = cloud.user?.name?.trim();
    if (!n) return null;
    // ohne Anzeigenamen kommt der Teil vor dem @ der E-Mail („mallory“): groß schreiben
    const [first, ...rest] = n.split(/\s+/).map(w => w.charAt(0).toLocaleUpperCase() + w.slice(1));
    return { first, last: rest.join(" ") || first };
  }
  /** Startauswahl: solo; bei Familie und Gruppe ist noch kein Weg gewählt */
  export function newWho(): Who {
    return {
      mode: "solo", src: "", solo: nextAnimal(), soloMe: true, partner: nextAnimal(), fams: [{ animal: nextAnimal(), adults: 2, kids: 0, infants: 0 }],
      group: { adults: 6, kids: 0 }, mascot: nextAnimal(), groups: [], picked: [], ng: { name: "", ids: [], drafts: [] }
    };
  }
  /** Reisende nach der Auswahl; eine neue Gruppe wird dabei mit ihren neuen Personen gespeichert */
  export function whoTravelers(w: Who): Traveler[] {
    if (w.mode === "solo") {
      const me = w.soloMe ? meName() : null;
      if (me?.personId) return travelersFrom([me.personId]);
      if (me) { const { placeholder: _p, ...base } = soloTraveler(w.solo); return [{ ...base, name: me.first, household: me.last }]; }
      return [soloTraveler(w.solo)];
    }
    if (w.mode === "partner") return placeholderTravelers([{ animal: w.partner, adults: 2, kids: 0 }]);
    if (w.src === "saved") return travelersFrom(w.picked);
    if (w.src === "new") {
      const ids = [...w.ng.ids, ...w.ng.drafts.map(d => addPerson(d.first, d.last, d.age).id)];
      addGroup(w.ng.name, ids);
      return travelersFrom(ids);
    }
    return w.mode === "family" ? placeholderTravelers(w.fams) : groupTravelers(w.group.adults, w.group.kids);
  }
</script>

<script lang="ts">
  /* Wer fährt mit: Solo, Partner, Familie, Gruppe; bei Familie und Gruppe danach der Weg (gespeichert, neu, Tiere) */
  import QuickFamilies from "./QuickFamilies.svelte";
  import { uid } from "../model";

  let { who = $bindable() }: { who: Who } = $props();
  const OPTS = $derived<{ k: WhoMode; t: string; s: string }[]>([
    { k: "solo", t: t("who.solo"), s: t("who.soloSub") },
    { k: "partner", t: t("who.partner"), s: t("who.partnerSub") },
    { k: "family", t: t("family"), s: t("who.familySub") },
    { k: "group", t: t("who.group"), s: t("who.groupSub") }
  ]);
  const hasSaved = $derived(dir.groups.some(g => g.memberIds.length) || dir.people.length > 0);
  const SRCS = $derived<{ k: WhoSrc; ico: string; t: string; s: string; off?: boolean }[]>([
    { k: "saved", ico: "👥", t: t("who.src.saved"), s: hasSaved ? t("who.src.savedSub") : t("who.src.savedNone"), off: !hasSaved },
    { k: "new", ico: "➕", t: t("who.src.new"), s: t("who.src.newSub") },
    { k: "animals", ico: "🦊", t: t("who.src.animals"), s: t("who.src.animalsSub") }
  ]);
  const other = (cur: string) => nextAnimal([cur]);
  const step = (k: "adults" | "kids", d: number) => (who.group[k] = Math.max(k === "adults" ? 1 : 0, Math.min(40, who.group[k] + d)));
  const byId = (id: string) => dir.people.find(p => p.id === id);
  const pname = (id: string) => { const p = byId(id); return p ? fullName(p) : "?"; };

  // gespeichert: Personen, die in keiner gewählten Gruppe sind
  const inChosen = $derived(new Set(dir.groups.filter(g => who.groups.includes(g.id)).flatMap(g => g.memberIds)));
  const loose = $derived(dir.people.filter(p => !inChosen.has(p.id)));
  let moreOpen = $state(false);

  // neue Gruppe: vorhandene Personen ziehen oder antippen, neue eintragen
  const pool = $derived(dir.people.filter(p => !who.ng.ids.includes(p.id)));
  let first = $state(""), last = $state(""), age = $state<number | undefined>();
  let dragOver = $state(false);
  /** Nachname aus „Familie Müller“ vorschlagen */
  const famLast = $derived(who.mode === "family" ? who.ng.name.trim().replace(/^(Familie|Family|Familia|Famille|Rodzina|Семья|عائلة)\s+/i, "") : "");
  function addDraft(e: Event) {
    e.preventDefault();
    const l = last.trim() || famLast;
    if (!first.trim() || !l) return;
    who.ng.drafts = [...who.ng.drafts, { key: uid(), first: first.trim(), last: l, ...(age ? { age } : {}) }];
    first = ""; age = undefined;
    if (!last.trim()) last = "";
  }
  function drop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const id = e.dataTransfer?.getData("text/plain");
    if (id && byId(id)) addToNew(who, id);
  }
  const drag = (id: string) => (e: DragEvent) => { e.dataTransfer?.setData("text/plain", id); if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"; };
  const phName = $derived(who.mode === "family" ? t("who.ngNamePhFamily") : t("who.ngNamePhGroup"));
</script>

<!-- kleine Szenen: Figuren mit Haut, Haar, Oberteil; Kinder kleiner -->
{#snippet person(x: number, s: number, shirt: string, skin = "#F2C9A5", hair = "#4A3222", o = 1)}
  {@const g = 54}
  {@const lh = 13 * s}
  {@const th = 15 * s}
  {@const r = 6 * s}
  {@const top = g - lh - th}
  {@const cy = top - r + 1.5 * s}
  <g opacity={o}>
    <rect x={x - 5 * s} y={g - lh - 1} width={4 * s} height={lh + 1} rx={2 * s} fill="#3A4256" />
    <rect x={x + 1 * s} y={g - lh - 1} width={4 * s} height={lh + 1} rx={2 * s} fill="#3A4256" />
    <rect x={x - 7.5 * s} y={top} width={15 * s} height={th + 2 * s} rx={5.5 * s} fill={shirt} />
    <circle cx={x} cy={cy} r={r} fill={skin} />
    <path d="M{x - r} {cy + 0.5 * s} a{r} {r} 0 0 1 {2 * r} 0 q{-r * 0.9} {-r * 0.55} {-2 * r} 0z" fill={hair} />
  </g>
{/snippet}
{#snippet fig(k: WhoMode)}
  <svg class="who-fig" viewBox="0 0 80 60" aria-hidden="true">
    <ellipse cx="40" cy="55" rx="30" ry="3.5" fill="#000" opacity=".07" />
    {#if k === "solo"}
      {@render person(33, 1.15, "#E07B45")}
      <!-- Rollkoffer -->
      <path d="M49 34v-4a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v4" fill="none" stroke="#7A4B2A" stroke-width="2" />
      <rect x="45" y="34" width="18" height="18" rx="3.5" fill="#F2B04A" />
      <rect x="47.5" y="37.5" width="13" height="2" rx="1" fill="#fff" opacity=".6" />
      <circle cx="49" cy="53.5" r="1.8" fill="#3A4256" /><circle cx="59" cy="53.5" r="1.8" fill="#3A4256" />
    {:else if k === "partner"}
      {@render person(29, 1.1, "#D9537F", "#F2C9A5", "#6B3F22")}
      {@render person(51, 1.1, "#4E7BD9", "#D9A07A", "#2B2B2B")}
      <path transform="translate(40 3) scale(.75) translate(-40 0)" d="M40 6c-2.2-3.4-8-2.6-8 1.8 0 3.6 5 6.6 8 9 3-2.4 8-5.4 8-9 0-4.4-5.8-5.2-8-1.8z" fill="#E0527E" />
    {:else if k === "family"}
      {@render person(19, 1.05, "#3F8BD8", "#F2C9A5", "#6B3F22")}
      {@render person(61, 1.05, "#E07B45", "#F2C9A5", "#C9853A")}
      {@render person(34, .72, "#F2B04A", "#F7D7BE", "#C9853A")}
      {@render person(47, .62, "#5CB88F", "#F7D7BE", "#6B3F22")}
    {:else if k === "group"}
      <!-- Wimpel -->
      <line x1="66" y1="8" x2="66" y2="54" stroke="#7A4B2A" stroke-width="1.8" />
      <path d="M66 9l-14 5 14 5z" fill="#F2B04A" />
      {@render person(18, .82, "#8FCFB3", "#D9A07A", "#2B2B2B", .75)}
      {@render person(40, .82, "#8FCFB3", "#F2C9A5", "#C9853A", .75)}
      {@render person(29, 1, "#1F8A70", "#F2C9A5", "#4A3222")}
      {@render person(51, 1, "#1F8A70", "#A86B4A", "#2B2B2B")}
    {:else}
      {@render person(30, 1, "#7A5AC8")}
      {@render person(50, 1, "#A99BE0", "#D9A07A", "#2B2B2B")}
      <circle cx="40" cy="14" r="7" fill="#fff" /><path d="M36.5 14l2.5 2.5 4.5-5" fill="none" stroke="#7A5AC8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    {/if}
  </svg>
{/snippet}

<div class="who" role="radiogroup" aria-label={t("ch.trav.title")}>
  {#each OPTS as o (o.k)}
    <button type="button" role="radio" aria-checked={who.mode === o.k} class="who-b who-{o.k}" class:on={who.mode === o.k} onclick={() => (who.mode = o.k)}>
      <span class="who-art">{@render fig(o.k)}</span><b>{o.t}</b><small>{o.s}</small></button>
  {/each}
</div>

<div class="who-d">
  {#if who.mode === "solo"}
    {@const me = meName()}
    {#if me && who.soloMe}
      <p class="small">{t("who.soloAs")} <b>{me.first}</b>. <button type="button" class="linkbtn" onclick={() => (who.soloMe = false)}>{t("who.asAnimal")}</button></p>
    {:else}
      <p class="small">{t("who.soloAs")} <b>{animalEmoji(who.solo)} {animalName(who.solo)}</b>. <button type="button" class="linkbtn" onclick={() => (who.solo = other(who.solo))}>{t("who.otherAnimal")}</button>{#if me} · <button type="button" class="linkbtn" onclick={() => (who.soloMe = true)}>{t("who.asMe", { name: me.first })}</button>{/if}</p>
    {/if}
    <p class="muted small">{t("who.soloHint")}</p>
  {:else if who.mode === "partner"}
    <p class="small">{t("who.partnerAs")} <b>{animalEmoji(who.partner)} {t("family.named", { name: animalName(who.partner) })}</b>. <button type="button" class="linkbtn" onclick={() => (who.partner = other(who.partner))}>{t("who.otherAnimal")}</button></p>
    <p class="muted small">{t("who.partnerHint")}</p>
  {:else}
    <span class="dlabel">{t("who.howStart")}</span>
    <div class="who-src" role="radiogroup" aria-label={t("who.howStart")}>
      {#each SRCS as o (o.k)}
        <button type="button" role="radio" aria-checked={who.src === o.k} class="src-b src-{o.k}" class:on={who.src === o.k} disabled={o.off} onclick={() => (who.src = o.k)}>
          <span class="src-ico" aria-hidden="true">{o.ico}</span><span class="src-t"><b>{o.t}</b><small>{o.s}</small></span>
          <i class="src-check" aria-hidden="true">✓</i>
        </button>
      {/each}
    </div>

    {#if who.src === "saved"}
      <p class="muted small">{t("who.pickGroups")}</p>
      <div class="sg-list">
        {#each dir.groups.filter(g => g.memberIds.length) as g (g.id)}
          {@const on = who.groups.includes(g.id)}
          <div class="sg" class:on>
            <button type="button" class="sg-h" aria-pressed={on} onclick={() => toggleSavedGroup(who, dir, g.id)}>
              <i class="sg-box" aria-hidden="true">{on ? "✓" : ""}</i>
              <span class="sg-t"><b>{g.name}</b><small>{tn("n.persons", g.memberIds.length)}</small></span>
            </button>
            {#if on}
              <div class="chips sg-people">
                {#each g.memberIds as id (id)}
                  <button type="button" class="chip" class:on={who.picked.includes(id)} aria-pressed={who.picked.includes(id)} onclick={() => togglePicked(who, id)}>{who.picked.includes(id) ? "✓ " : ""}{pname(id)}</button>
                {/each}
              </div>
            {:else}
              <small class="sg-names muted">{g.memberIds.map(id => byId(id)?.first || "?").join(" · ")}</small>
            {/if}
          </div>
        {/each}
      </div>
      {#if loose.length}
        <button type="button" class="linkbtn" aria-expanded={moreOpen} onclick={() => (moreOpen = !moreOpen)}>+ {t("who.morePeople")} {moreOpen ? "▴" : "▾"}</button>
        {#if moreOpen}
          <div class="chips">
            {#each loose as p (p.id)}
              <button type="button" class="chip" class:on={who.picked.includes(p.id)} aria-pressed={who.picked.includes(p.id)} onclick={() => togglePicked(who, p.id)}>{who.picked.includes(p.id) ? "✓ " : ""}{p.first} {p.last}</button>
            {/each}
          </div>
        {/if}
      {/if}
    {:else if who.src === "new"}
      <label class="f">{t("who.ngName")}<input class="ng-name" bind:value={who.ng.name} placeholder={phName} /></label>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="ng-zone" class:over={dragOver} ondragover={e => { e.preventDefault(); dragOver = true; }} ondragleave={() => (dragOver = false)} ondrop={drop}>
        <span class="ng-lbl">{t("who.ngIn")}</span>
        <div class="chips">
          {#each who.ng.ids as id (id)}
            <span class="chip on ng-chip">{pname(id)}<button type="button" class="ng-x" aria-label={t("who.ngRemove", { name: pname(id) })} onclick={() => dropFromNew(who, id)}>×</button></span>
          {/each}
          {#each who.ng.drafts as d (d.key)}
            <span class="chip on ng-chip">{d.first} {d.last} <small>{t("who.ngNew")}</small><button type="button" class="ng-x" aria-label={t("who.ngRemove", { name: d.first })} onclick={() => (who.ng.drafts = who.ng.drafts.filter(x => x.key !== d.key))}>×</button></span>
          {/each}
          {#if !who.ng.ids.length && !who.ng.drafts.length}<span class="muted small">{pool.length ? t("who.ngDrop") : t("who.ngEmpty")}</span>{/if}
        </div>
      </div>
      {#if pool.length}
        <span class="ng-lbl">{t("who.ngPool")}</span>
        <div class="chips ng-pool">
          {#each pool as p (p.id)}
            <button type="button" class="chip ng-drag" draggable="true" ondragstart={drag(p.id)} onclick={() => addToNew(who, p.id)}>+ {p.first} {p.last}</button>
          {/each}
        </div>
      {/if}
      <div class="ed-row ng-add">
        <label class="f">{t("trav.first")}<input bind:value={first} placeholder={t("grp.firstPh")} onkeydown={e => { if (e.key === "Enter") addDraft(e); }} /></label>
        <label class="f">{t("trav.last")}<input bind:value={last} placeholder={famLast || t("grp.lastPh")} onkeydown={e => { if (e.key === "Enter") addDraft(e); }} /></label>
        <label class="f">{t("trav.age")}<input class="n sm" type="number" min="0" max="120" bind:value={age} /></label>
        <button type="button" class="btn" disabled={!first.trim() || !(last.trim() || famLast)} onclick={addDraft}>{t("who.ngAddBtn")}</button>
      </div>
    {:else if who.src === "animals"}
      {#if who.mode === "family"}
        <p class="muted small">{t("who.familyHint")}</p>
        <QuickFamilies bind:rows={who.fams} />
      {:else}
        <p class="small">{t("who.groupAs")} <b>{t("who.nameGroup", { a: `${animalEmoji(who.mascot)} ${animalName(who.mascot)}` })}</b>. <button type="button" class="linkbtn" onclick={() => (who.mascot = other(who.mascot))}>{t("who.otherAnimal")}</button></p>
        <p class="muted small">{t("who.groupHint")}</p>
        <div class="qf-counts grp-counts">
          {#each [["adults", t("age.adultShort"), t("age.adults")], ["kids", t("age.kids"), t("age.kids")]] as [k, l, full] (k)}
            <span class="qf-step" role="group" aria-label={full}>
              <button type="button" onclick={() => step(k as "adults", -1)} aria-label={t("step.less", { what: full })}>−</button>
              <b>{who.group[k as "adults"]}</b><small>{l}</small>
              <button type="button" onclick={() => step(k as "adults", 1)} aria-label={t("step.more", { what: full })}>+</button>
            </span>
          {/each}
        </div>
      {/if}
    {/if}
    {#if who.src && whoCount(who)}<p class="muted small who-sum">{t("who.together", { p: tn("n.persons", whoCount(who)) })}</p>{/if}
  {/if}
</div>
