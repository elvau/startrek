<script lang="ts">
  import { t } from "../i18n/index.svelte";
  import type { Item } from "../model";
  import { app, calc } from "../store.svelte";
  import { ageClass, eur, participantsOf } from "../calc";
  import { dayShort } from "../format";
  import StatusBadge from "./StatusBadge.svelte";
  import Icon from "./Icon.svelte";

  let { item, icon }: { item: Item; icon: string } = $props();
  const r = $derived(calc.T.items[item.id]);
  const opt = $derived(r?.option);
  let imgFailed = $state(false);

  // Beschreibung aus dem Preis, wenn keine Notiz da ist: "2 × 40 € Erwachsene · 2 × 15 € Kinder"
  const auto = $derived.by(() => {
    if (!opt) return "";
    const p = opt.price, q = p.qty && p.qty !== 1 ? ` × ${p.qty}` : "";
    if (p.mode === "unit") return `${eur(p.unit || 0)}${q} · ${t("price.flatFor", { n: r?.n || 0 })}`;
    const cnt = { adult: 0, child: 0, infant: 0 };
    participantsOf(item, app.trip).forEach(x => cnt[ageClass(x.age, app.trip.settings, x.kind)]++);
    const parts = [];
    if (cnt.adult) parts.push(`${cnt.adult} × ${eur(p.adult || 0)} ${t("age.adults")}`);
    if (cnt.child) parts.push(`${cnt.child} × ${eur(p.child ?? p.adult ?? 0)} ${t("age.kids")}`);
    if (cnt.infant) parts.push(`${cnt.infant} × ${eur(p.infant ?? p.child ?? p.adult ?? 0)} ${t("age.infants")}`);
    return parts.join(" · ") + q;
  });
</script>

<div class="row">
  <!-- Foto vom Anbieter (Tour), sonst das Symbol -->
  {#if opt?.image && !imgFailed}
    <img class="row-img" src={opt.image} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={() => (imgFailed = true)} />
  {:else}<div class="ic"><Icon name={item.icon || icon} /></div>{/if}
  <div>
    <h3>{item.name || opt?.label || t("item.new")}</h3>
    <p>{item.note || auto}{#if item.day}<span class="row-day">&nbsp;· 📅 {dayShort(item.day.slice(0, 10))}{item.day.length >= 16 ? ` ${item.day.slice(11, 16)}` : ""}</span>{/if}{#if opt?.price.multiply && (r?.units || 0) > 1}<span class="row-units">&nbsp;· {item.icon === "car" ? t("item.cars", { n: r!.units, c: opt.price.capacity || 0 }) : t("item.units", { n: r!.units })}</span>{/if}</p>
  </div>
  <div class="r">
    <b class="num">{eur(r?.net || 0)}</b>
    <StatusBadge status={item.status} estimate={!!opt?.estimate} />
  </div>
</div>
