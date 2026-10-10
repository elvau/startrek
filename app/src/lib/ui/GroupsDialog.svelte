<script lang="ts">
  import { t, tn } from "../i18n/index.svelte";
  import Help from "./Help.svelte";
  /* Gespeicherte Gruppen und Personen verwalten. Eine Person kann in mehreren Gruppen sein. */
  import { addGroup, addPerson, dir, fullName, removeGroup, removePerson, toggleMember } from "../directory.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import { personAge } from "../people";
  import { deleteAllDocs, docs, hasDoc, loadDocs, removeDoc, saveDocsNow } from "../traveldocs.svelte";
  import Modal from "./Modal.svelte";
  import PersonDetails from "./PersonDetails.svelte";

  let { onclose }: { onclose: () => void } = $props();
  let first = $state(""), last = $state(""), age = $state<number | undefined>();
  let gname = $state("");
  let err = $state("");
  let open = $state<string | null>(dir.groups[0]?.id ?? null);
  let det = $state<string | null>(null);
  function close() { void saveDocsNow(); onclose(); }
  function delPerson(id: string, name: string) {
    if (!confirm(t("grp.deletePersonConfirm", { name }))) return;
    removePerson(id);
    // Buchungsdaten der Person mit löschen (auch wenn sie noch nicht geladen waren)
    if (cloud.user) void loadDocs().then(() => removeDoc(id));
    if (det === id) det = null;
  }
  async function delAll() {
    if (!confirm(t("per.docsDeleteAllConfirm"))) return;
    try { await deleteAllDocs(); } catch (e) { console.warn(e); }
  }
  const summary = (p: (typeof dir.people)[number]) => {
    const a = personAge(p);
    return [a != null ? t("trav.ageYears", { n: a }) : "", p.home ? `📍 ${p.home.ort}` : "", hasDoc(p.id) ? "🔒" : ""].filter(Boolean).join(" · ");
  };

  function newPerson(e: Event) {
    e.preventDefault();
    if (!first.trim() || !last.trim()) { err = t("grp.namesRequired"); return; }
    const p = addPerson(first, last, age);
    const g = dir.groups.find(x => x.id === open);
    if (g) g.memberIds.push(p.id);
    first = ""; age = undefined; err = "";
  }
  function newGroup(e: Event) {
    e.preventDefault();
    if (!gname.trim()) return;
    open = addGroup(gname).id;
    gname = "";
  }
</script>

<Modal title={t("groups.title")} onclose={close}>
  <div class="groups-d">
    <p class="muted small">{cloud.user ? t("grp.inAccount") : t("grp.inBrowser")}</p>

    <div class="ed-sec">
      <span class="dlabel">{t("grp.groups")} <Help k="groups" /></span>
      {#each dir.groups as g (g.id)}
        <div class="grp" class:open={open === g.id}>
          <button class="grp-h" onclick={() => (open = open === g.id ? null : g.id)} aria-expanded={open === g.id}>
            <b>{g.name}</b><span class="muted">{tn("n.persons", g.memberIds.length)}</span>
          </button>
          {#if open === g.id}
            <div class="grp-b">
              <input class="inp grp-name" bind:value={g.name} aria-label={t("grp.name")} />
              <div class="chips">
                {#each dir.people as p (p.id)}
                  <button class="chip" class:on={g.memberIds.includes(p.id)} aria-pressed={g.memberIds.includes(p.id)} onclick={() => toggleMember(g, p.id)}>{p.first} {p.last}</button>
                {:else}
                  <span class="muted small">{t("grp.noPeople")}</span>
                {/each}
              </div>
              <button class="linkbtn danger" onclick={() => { if (confirm(t("grp.deleteConfirm", { name: g.name }))) removeGroup(g.id); }}>{t("grp.delete")}</button>
            </div>
          {/if}
        </div>
      {:else}
        <p class="muted small">{t("grp.none")}</p>
      {/each}
      <form class="ed-row" onsubmit={newGroup}>
        <label class="f grow">{t("grp.new")}<input bind:value={gname} placeholder={t("grp.newPh")} /></label>
        <button class="btn" disabled={!gname.trim()}>{t("grp.create")}</button>
      </form>
    </div>

    <div class="ed-sec">
      <span class="dlabel">{t("grp.people")}</span>
      <ul class="plist">
        {#each dir.people as p (p.id)}
          <li class:open={det === p.id}>
            <input class="inp" class:need={!p.first.trim()} bind:value={p.first} aria-label={t("trav.first")} />
            <input class="inp" class:need={!p.last.trim()} bind:value={p.last} aria-label={t("trav.last")} />
            <button class="pmore" aria-expanded={det === p.id} aria-label={t("per.more", { name: p.first })} onclick={() => (det = det === p.id ? null : p.id)}>
              <span class="muted small">{summary(p)}</span><span aria-hidden="true">{det === p.id ? "▴" : "▾"}</span>
            </button>
            <button class="x" aria-label={t("grp.deletePerson", { name: p.first })} onclick={() => delPerson(p.id, fullName(p))}>×</button>
            {#if det === p.id}<PersonDetails {p} />{/if}
          </li>
        {/each}
      </ul>
      <form class="ed-row" onsubmit={newPerson}>
        <label class="f">{t("trav.first")} *<input bind:value={first} placeholder={t("grp.firstPh")} /></label>
        <label class="f">{t("trav.last")} *<input bind:value={last} placeholder={t("grp.lastPh")} /></label>
        <label class="f">{t("trav.age")}<input class="n sm" type="number" min="0" max="120" bind:value={age} /></label>
        <button class="btn">{open && dir.groups.find(x => x.id === open) ? t("grp.addTo", { name: dir.groups.find(x => x.id === open)?.name || "" }) : t("grp.addPerson")}</button>
      </form>
      {#if err}<p class="err">{err}</p>{/if}
      {#if cloud.user && docs.status === "ready" && Object.keys(docs.map).some(hasDoc)}
        <button class="linkbtn danger" onclick={delAll}>{t("per.docsDeleteAll")}</button>
      {/if}
    </div>
  </div>
</Modal>
