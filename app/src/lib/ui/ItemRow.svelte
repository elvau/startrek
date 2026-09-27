<script lang="ts">
  import type { Item } from "../model";
  import { app, calc } from "../store.svelte";
  import { ageClass, eur, participantsOf } from "../calc";
  import StatusBadge from "./StatusBadge.svelte";
  import Icon from "./Icon.svelte";

  let { item, icon }: { item: Item; icon: string } = $props();
  const r = $derived(calc.T.items[item.id]);
  const opt = $derived(r?.option);

  // Beschreibung aus dem Preis, wenn keine Notiz da ist: "2 × 40 € Erwachsene · 2 × 15 € Kinder"
  const auto = $derived.by(() => {
    if (!opt) return "";
    const p = opt.price, q = p.qty && p.qty !== 1 ? ` × ${p.qty}` : "";
    if (p.mode === "unit") return `${eur(p.unit || 0)}${q} · pauschal für ${r?.n || 0}`;
    const cnt = { adult: 0, child: 0, infant: 0 };
    participantsOf(item, app.trip).forEach(t => cnt[ageClass(t.age, app.trip.settings)]++);
    const parts = [];
    if (cnt.adult) parts.push(`${cnt.adult} × ${eur(p.adult || 0)} Erwachsene`);
    if (cnt.child) parts.push(`${cnt.child} × ${eur(p.child ?? p.adult ?? 0)} Kinder`);
    if (cnt.infant) parts.push(`${cnt.infant} × ${eur(p.infant ?? p.child ?? p.adult ?? 0)} Kleinkinder`);
    return parts.join(" · ") + q;
  });
</script>

<div class="row">
  <div class="ic"><Icon name={item.icon || icon} /></div>
  <div>
    <h3>{item.name || opt?.label || "Neuer Posten"}</h3>
    <p>{item.note || auto}</p>
  </div>
  <div class="r">
    <b class="num">{eur(r?.net || 0)}</b>
    <StatusBadge status={item.status} estimate={!!opt?.estimate} />
  </div>
</div>
