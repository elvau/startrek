<script module lang="ts">
  import { dir, travelersFrom } from "../directory.svelte";
  import { animalEmoji, groupTravelers, nextAnimal, placeholderTravelers, soloTraveler, type FamilyRow } from "../placeholders";
  import type { Traveler } from "../model";

  export type WhoMode = "solo" | "partner" | "family" | "group" | "saved";
  export interface Who {
    mode: WhoMode;
    solo: string;
    partner: string;
    fams: FamilyRow[];
    group: { adults: number; kids: number };
    /** Tier im Namen der Gruppenreise */
    mascot: string;
    picked: string[];
  }
  /** Startauswahl: solo, mit zufälligen Tieren */
  export function newWho(): Who {
    return { mode: "solo", solo: nextAnimal(), partner: nextAnimal(), fams: [{ animal: nextAnimal(), adults: 2, kids: 0, infants: 0 }], group: { adults: 6, kids: 0 }, mascot: nextAnimal(), picked: [] };
  }
  /** Art der Reise für den vorläufigen Namen, z. B. „Solo Pinguin“, „Gruppenreise Zebra“ */
  export function whoName(w: Who): string {
    switch (w.mode) {
      case "solo": return `Solo ${w.solo}`;
      case "partner": return `Partnerreise ${w.partner}`;
      case "family": {
        const a = w.fams.map(f => f.animal);
        return `Familienreise ${a.length > 2 ? `${a.slice(0, 2).join(" & ")} u. a.` : a.join(" & ")}`;
      }
      case "group": return `Gruppenreise ${w.mascot}`;
      default: {
        // genau eine gespeicherte Gruppe gewählt: deren Name
        const g = dir.groups.find(g => g.memberIds.length && g.memberIds.length === w.picked.length && g.memberIds.every(id => w.picked.includes(id)));
        return g ? g.name : "Reise";
      }
    }
  }
  /** Reisende nach der Auswahl */
  export function whoTravelers(w: Who): Traveler[] {
    switch (w.mode) {
      case "solo": return [soloTraveler(w.solo)];
      case "partner": return placeholderTravelers([{ animal: w.partner, adults: 2, kids: 0 }]);
      case "family": return placeholderTravelers(w.fams);
      case "group": return groupTravelers(w.group.adults, w.group.kids);
      default: return travelersFrom(w.picked);
    }
  }
</script>

<script lang="ts">
  /* Wer fährt mit: Solo, Partner, Familie, Gruppe (oder gespeicherte Gruppen) */
  import QuickFamilies from "./QuickFamilies.svelte";

  let { who = $bindable() }: { who: Who } = $props();
  const famCount = $derived(who.fams.reduce((a, r) => a + r.adults + r.kids + (r.infants || 0), 0));
  const OPTS: { k: WhoMode; t: string; s: string }[] = [
    { k: "solo", t: "Solo", s: "1 Person" },
    { k: "partner", t: "Partner", s: "zu zweit" },
    { k: "family", t: "Familie", s: "eine oder mehrere" },
    { k: "group", t: "Gruppe", s: "Mannschaft, Verein" }
  ];
  const other = (cur: string) => nextAnimal([cur]);
  const step = (k: "adults" | "kids", d: number) => (who.group[k] = Math.max(k === "adults" ? 1 : 0, Math.min(40, who.group[k] + d)));

  const toggleGroup = (ids: string[]) => {
    const all = ids.every(id => who.picked.includes(id));
    who.picked = all ? who.picked.filter(id => !ids.includes(id)) : [...new Set([...who.picked, ...ids])];
  };
  const toggle = (id: string) => (who.picked = who.picked.includes(id) ? who.picked.filter(x => x !== id) : [...who.picked, id]);
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

<div class="who" role="radiogroup" aria-label="Wer fährt mit">
  {#each OPTS as o (o.k)}
    <button type="button" role="radio" aria-checked={who.mode === o.k} class="who-b who-{o.k}" class:on={who.mode === o.k} onclick={() => (who.mode = o.k)}>
      <span class="who-art">{@render fig(o.k)}</span><b>{o.t}</b><small>{o.s}</small></button>
  {/each}
  {#if dir.groups.length || dir.people.length}
    <button type="button" role="radio" aria-checked={who.mode === "saved"} class="who-b who-saved" class:on={who.mode === "saved"} onclick={() => (who.mode = "saved")}>
      <span class="who-art">{@render fig("saved")}</span><b>Gespeichert</b><small>deine Gruppen</small></button>
  {/if}
</div>

<div class="who-d">
  {#if who.mode === "solo"}
    <p class="small">Du planst als <b>{animalEmoji(who.solo)} {who.solo}</b>. <button type="button" class="linkbtn" onclick={() => (who.solo = other(who.solo))}>Anderes Tier</button></p>
    <p class="muted small">Namen und weitere Personen kannst du jederzeit in der Reise ergänzen.</p>
  {:else if who.mode === "partner"}
    <p class="small">Ihr plant zu zweit als <b>{animalEmoji(who.partner)} Familie {who.partner}</b>. <button type="button" class="linkbtn" onclick={() => (who.partner = other(who.partner))}>Anderes Tier</button></p>
    <p class="muted small">Ihr zählt als eine Familie und zahlt gemeinsam.</p>
  {:else if who.mode === "family"}
    <p class="muted small">Eine oder mehrere Familien, jede als Tier, z. B. „Familie Fuchs: 2 Erwachsene, 2 Kinder“. Echte Namen kannst du später eintragen.</p>
    <QuickFamilies bind:rows={who.fams} />
    {#if famCount}<p class="muted small">Zusammen {famCount} {famCount === 1 ? "Person" : "Personen"}.</p>{/if}
  {:else if who.mode === "group"}
    <p class="small">Die Reise heißt vorerst <b>Gruppenreise {animalEmoji(who.mascot)} {who.mascot}</b>. <button type="button" class="linkbtn" onclick={() => (who.mascot = other(who.mascot))}>Anderes Tier</button></p>
    <p class="muted small">Jede Person rechnet für sich ab, z. B. Mannschaft, Verein oder Kegelclub.</p>
    <div class="qf-counts grp-counts">
      {#each [["adults", "Erw.", "Erwachsene"], ["kids", "Kinder", "Kinder"]] as [k, l, full] (k)}
        <span class="qf-step" role="group" aria-label={full}>
          <button type="button" onclick={() => step(k as "adults", -1)} aria-label="{full} weniger">−</button>
          <b>{who.group[k as "adults"]}</b><small>{l}</small>
          <button type="button" onclick={() => step(k as "adults", 1)} aria-label="{full} mehr">+</button>
        </span>
      {/each}
    </div>
    <p class="muted small">Zusammen {who.group.adults + who.group.kids} Personen.</p>
  {:else}
    <div class="chips">
      {#each dir.groups as g (g.id)}
        {@const on = g.memberIds.length > 0 && g.memberIds.every(id => who.picked.includes(id))}
        <button type="button" class="chip grp-chip" class:on aria-pressed={on} onclick={() => toggleGroup(g.memberIds)}>{g.name} <small>{g.memberIds.length}</small></button>
      {/each}
    </div>
    <div class="chips">
      {#each dir.people as p (p.id)}
        <button type="button" class="chip" class:on={who.picked.includes(p.id)} aria-pressed={who.picked.includes(p.id)} onclick={() => toggle(p.id)}>{p.first} {p.last}</button>
      {/each}
    </div>
    <p class="muted small">{who.picked.length} {who.picked.length === 1 ? "Person" : "Personen"} ausgewählt. Einzelne kannst du später für diese Reise auf „nicht dabei“ stellen.</p>
  {/if}
</div>
